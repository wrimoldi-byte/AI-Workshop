import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
const root = path.dirname(fileURLToPath(import.meta.url));
const names = {walter:'Walter',gemini:'Gemini',chatgpt:'GPT-OSS'};
const send = (res,code,json)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(json))};
const safe=(x,y)=>{const a=Buffer.from(String(x||'')),b=Buffer.from(String(y||''));return a.length===b.length&&timingSafeEqual(a,b)};
async function ask(url, headers, payload, who) {
 const ac=new AbortController(),timeout=setTimeout(()=>ac.abort(),45000);
 try{
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(payload),signal:ac.signal});
  const data=await r.json().catch(()=>({}));
  if(!r.ok){
   const e=data.error?.message||'';
   if(r.status===429)throw Error(who+': límite gratuito alcanzado (429).');
   if(r.status===401||r.status===403)throw Error(who+': clave inválida o sin permisos ('+r.status+').');
   if(r.status===404)throw Error(who+': modelo no disponible (404).');
   throw Error(who+': error '+r.status+(e?' — '+String(e).slice(0,100):''));
  }
  return data;
 } finally {clearTimeout(timeout)}
}
async function chat(req,res){
 let size=0;const chunks=[];
 for await(const c of req){size+=c.length;if(size>100000)return send(res,413,{error:'Mensaje demasiado largo'});chunks.push(c)}
 let p={};try{p=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return send(res,400,{error:'Mensaje inválido'})}
 if(!process.env.CHAT_PASSWORD)return send(res,503,{error:'Falta configurar CHAT_PASSWORD en Render.'});
 if(!safe(p.password,process.env.CHAT_PASSWORD))return send(res,401,{error:'Contraseña de sala incorrecta.'});
 if(!['gemini','chatgpt'].includes(p.speaker))return send(res,400,{error:'Participante inválido.'});
 const history=(Array.isArray(p.history)?p.history:[]).slice(-24).filter(m=>m&&names[m.speaker]&&typeof m.content==='string').map(m=>({speaker:m.speaker,content:m.content.slice(0,1800)}));
 if(!history.length)return send(res,400,{error:'Primero escribí un tema.'});
 const who=names[p.speaker];
 const messages=history.map(m=>names[m.speaker]+': '+m.content).join('\n');
 const prompt='En este chat grupal están Walter (humano), Gemini de Google y GPT-OSS (modelo abierto de OpenAI, servido por Groq). Vos sos '+who+'. Respondé en español rioplatense natural, con humor, opinión propia, podés discutir las ideas del otro modelo. Una a tres oraciones breves. No hables en nombre de los demás, no inventes acciones realizadas.\nConversación:\n'+messages+'\nTu turno como '+who+':';
 try{
 let answer;
 if(p.speaker==='gemini'){
  if(!process.env.GEMINI_API_KEY)return send(res,503,{error:'Falta GEMINI_API_KEY en Render. Obtenela en Google AI Studio.'});
  const data=await ask('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(process.env.GEMINI_MODEL||'gemini-2.5-flash')+':generateContent',{'x-goog-api-key':process.env.GEMINI_API_KEY},{contents:[{parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:600}},who);
  answer=(data.candidates?.[0]?.content?.parts||[]).map(x=>x.text||'').join('');
 } else {
  if(!process.env.GROQ_API_KEY)return send(res,503,{error:'Falta GROQ_API_KEY en Render. Obtenela en Groq Console.'});
  const data=await ask('https://api.groq.com/openai/v1/chat/completions',{Authorization:'Bearer '+process.env.GROQ_API_KEY},{model:process.env.GROQ_MODEL||'openai/gpt-oss-120b',messages:[{role:'user',content:prompt}],max_completion_tokens:1000},who);
  answer=data.choices?.[0]?.message?.content;
 }
 if(!answer?.trim())throw Error(who+' no devolvió texto.');
 return send(res,200,{speaker:p.speaker,content:answer.trim().slice(0,2300)});
 }catch(e){console.error('Model call error:',who,e.message);return send(res,502,{error:String(e.message||'Error de conexión').slice(0,230)})}
}
const filemap={'/':'index.html','/index.html':'index.html'};
http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'unsafe-inline' 'self'; script-src 'unsafe-inline' 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'");
 const u=new URL(req.url,'http://127.0.0.1');
 if(u.pathname==='/health')return send(res,200,{status:'ok'});
 if(u.pathname==='/api/chat'&&req.method==='POST')return chat(req,res);
 if(u.pathname==='/api/status')return send(res,200,{configured:{gemini:!!process.env.GEMINI_API_KEY,groq:!!process.env.GROQ_API_KEY},label:'GPT-OSS (OpenAI via Groq)'});
 if(req.method==='GET'&&filemap[u.pathname]){try{res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(await readFile(path.join(root,filemap[u.pathname])))}catch{return send(res,500,{error:'No se encontró index.html'})}}
 return send(res,404,{error:'No encontrado'});
}).listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Mesa para tres iniciada'));
