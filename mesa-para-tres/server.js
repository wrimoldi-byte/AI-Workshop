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
   const description=r.status===429?'cuota o límite de solicitudes (429)':(r.status===503?'servicio temporalmente sobrecargado (503)':((r.status===401||r.status===403)?'clave inválida o sin permisos ('+r.status+')':(r.status===404?'modelo no disponible (404)':'error '+r.status)));
   throw Object.assign(new Error(who+': '+description+(e?' — '+String(e).slice(0,85):'')),{status:r.status});
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
  const geminiPayload={contents:[{parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:1200,thinkingConfig:{thinkingLevel:'low'}}};
  const geminiHeaders={'x-goog-api-key':process.env.GEMINI_API_KEY};
  const candidates=[process.env.GEMINI_MODEL||'gemini-3.5-flash-lite','gemini-3.8-flash','gemini-3.6-flash'].filter((v,i,a)=>v && a.indexOf(v)===i);
  let lastError;
  for(const model of candidates){
   for(let retry=0;retry<2;retry++){
    try{
     const data=await ask('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',geminiHeaders,geminiPayload,who);
     answer=(data.candidates?.[0]?.content?.parts||[]).map(x=>x.text||'').join('');
     if(!answer?.trim())throw new Error('Gemini respondió sin texto utilizable.');
     if(model!==candidates[0])console.info('Gemini funcionó con modelo alternativo:',model);
     break;
    }catch(e){
     lastError=e;
     if(![404,429,500,502,503,504].includes(e.status))throw e;
     console.warn('Gemini no disponible:',model,'HTTP',e.status,'reintento',retry);
     if(e.status===503 && retry===0){await new Promise(resolve=>setTimeout(resolve,750));continue}
     break;
    }
   }
   if(answer?.trim())break;
  }
  if(!answer?.trim())throw new Error('Gemini no respondió con ningún modelo disponible. '+(lastError?.status===503?'Google informó alta demanda; probá de nuevo más tarde.':lastError?.status===429?'Se alcanzó un límite de solicitudes de Google.':String(lastError?.message||'')));
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
