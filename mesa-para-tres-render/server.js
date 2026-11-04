import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const allow = { walter: 'Walter', gemini: 'Gemini', chatgpt: 'GPT-OSS' };
const rootDir = new URL('.',import.meta.url);
import { readFile } from 'node:fs/promises';

const rate = new Map();
function respond(res,code,obj){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj))}
function secretOk(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&timingSafeEqual(x,y)}
function historyClean(h){return (Array.isArray(h)?h:[]).slice(-24).filter(m=>m&&allow[m.speaker]&&typeof m.content==='string').map(m=>({speaker:m.speaker,content:m.content.slice(0,2000).trim()})).filter(m=>m.content)}
async function post(url,headers,body,name){const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),45000);try{
const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:ctrl.signal});
const data=await r.json().catch(()=>({}));if(!r.ok){const msg=data?.error?.message||'';let reason=r.status===429?'superaste la cuota gratuita o el límite de solicitudes':r.status===401||r.status===403?'la clave no está autorizada':r.status===404?'el modelo no está disponible':'error '+r.status;
if(/quota|limit|credits|billing|insufficient/i.test(msg))reason='límite de cuota o créditos';throw Error(name+': '+reason+'.')}
return data;
}catch(e){if(e.name==='AbortError')throw Error(name+': tardó demasiado en responder');throw e}finally{clearTimeout(timeout)}}
async function answer(speaker,h){const byOpenAI=!!process.env.OPENAI_API_KEY;
const name=speaker==='gemini'?'Gemini':byOpenAI?'ChatGPT':'GPT-OSS';
const other=speaker==='gemini'?(byOpenAI?'ChatGPT':'GPT-OSS'):'Gemini';
const labels={walter:'Walter',gemini:'Gemini',chatgpt:byOpenAI?'ChatGPT':'GPT-OSS'};
const transcript=h.map(m=>labels[m.speaker]+': '+m.content).join('\n');
const instructions='Sos '+name+' en una charla real con Walter y '+other+'. Respondé de forma natural en español rioplatense y con humor. Tenés opinión propia y podés discrepar con los otros. Respetá lo último que dijeron. Contestá entre 1 y 4 oraciones cortas, sin títulos ni listas. No hables por los otros participantes ni finjas mensajes de terceros.';
const prompt='Charla hasta ahora:\n'+transcript+'\n\nAhora tu turno como '+name+'. Escribí solamente tu intervención.';
if(speaker==='gemini'){
if(!process.env.GEMINI_API_KEY)throw Error('Falta conectar la API gratuita de Gemini (GEMINI_API_KEY).');
const model=process.env.GEMINI_MODEL||'gemini-2.5-flash';
const data=await post('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{'x-goog-api-key':process.env.GEMINI_API_KEY},{systemInstruction:{parts:[{text:instructions}]},contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:500}},'Gemini');
const text=(data.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('').trim();
if(!text)throw Error('Gemini no devolvió texto');return {speaker,content:text.slice(0,2100),model};
}
if(byOpenAI){
const model=process.env.OPENAI_MODEL||'gpt-5.4-mini';
const data=await post('https://api.openai.com/v1/responses',{Authorization:'Bearer '+process.env.OPENAI_API_KEY},{model,instructions,input:prompt,max_output_tokens:600,store:false},'ChatGPT');
const text=(data.output||[]).flatMap(x=>x.content||[]).filter(p=>p.type==='output_text').map(p=>p.text).join('').trim();
if(!text)throw Error('ChatGPT no devolvió texto');return {speaker,content:text.slice(0,2100),model};
}
if(!process.env.GROQ_API_KEY)throw Error('Falta conectar la API gratuita de Groq para GPT-OSS (GROQ_API_KEY).');
const model=process.env.GROQ_MODEL||'openai/gpt-oss-120b';
const data=await post('https://api.groq.com/openai/v1/chat/completions',{Authorization:'Bearer '+process.env.GROQ_API_KEY},{model,messages:[{role:'system',content:instructions},{role:'user',content:prompt}],max_completion_tokens:800},'Groq / GPT-OSS');
const text=data.choices?.[0]?.message?.content?.trim();if(!text)throw Error('GPT-OSS no devolvió texto');return {speaker,content:text.slice(0,2100),model};
}
async function route(req,res){res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'");
const path=new URL(req.url,'http://localhost').pathname;
if(path==='/health')return respond(res,200,{status:'ok'});
if(path==='/api/config')return respond(res,200,{gemini:!!process.env.GEMINI_API_KEY,second:process.env.OPENAI_API_KEY?'ChatGPT':'GPT-OSS',secondReady:!!(process.env.OPENAI_API_KEY||process.env.GROQ_API_KEY)});
if(req.method==='GET'&&path==='/'){
const page=await readFile(new URL('index.html',rootDir),'utf8');const content=process.env.OPENAI_API_KEY?page:page.replaceAll('ChatGPT','GPT-OSS');
res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public,max-age=60'});return res.end(content);
}
if(path!=='/api/chat'||req.method!=='POST')return respond(res,404,{error:'Ruta no encontrada'});
if(!process.env.CHAT_PASSWORD)return respond(res,503,{error:'Falta configurar la contraseña privada en Render'});
let body='';for await(const part of req){body+=part;if(body.length>80000)return respond(res,413,{error:'Mensaje demasiado grande'})}
let b;try{b=JSON.parse(body)}catch{return respond(res,400,{error:'Mensaje incorrecto'})}
if(!secretOk(b.password,process.env.CHAT_PASSWORD))return respond(res,401,{error:'Contraseña privada incorrecta'});
const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'user').split(',')[0],now=Date.now();
const count=rate.get(ip)||[];const last=count.filter(t=>now-t<60000);
if(last.length>=12)return respond(res,429,{error:'Demasiados mensajes en un minuto'});
last.push(now);rate.set(ip,last);
if(!['gemini','chatgpt'].includes(b.speaker))return respond(res,400,{error:'Participante incorrecto'});
const h=historyClean(b.history);if(!h.length)return respond(res,400,{error:'Escribí primero un tema'});
try{return respond(res,200,await answer(b.speaker,h))}catch(e){console.error('Provider response failed',b.speaker,e.message);return respond(res,502,{error:String(e.message||'No se pudo responder').slice(0,230)})}
}
const port=Number(process.env.PORT||3000);http.createServer((req,res)=>route(req,res).catch(e=>{console.error('HTTP error',e.message);if(!res.headersSent)respond(res,500,{error:'Error interno'})})).listen(port,'0.0.0.0',()=>console.log('Mesa para tres listening on port '+port));