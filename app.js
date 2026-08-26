const $=s=>document.querySelector(s);
const log=$('#log');
let stopped=false, best='', history=[], workMode='ideas', currentProject=null, selectedFile=0;

const AGENTS={
  ideas:[
    ['Creador','✦','Genera la solución'],['Crítico','⌕','Busca fallas y contradicciones'],['Especialista','⌘','Convierte críticas en mejoras'],['Evaluador','✓','Puntúa y decide']
  ],
  dev:[
    ['Director','◆','Cierra alcance y requisitos'],['Arquitecto','⌘','Diseña la arquitectura'],['Frontend','▣','Diseña interfaz y experiencia'],['Backend','◫','Define lógica y servicios'],['Tester','⚑','Intenta romper el MVP'],['Integrador','⧉','Une decisiones en un plan'],['Reviewer','✓','Puntúa la preparación técnica'],['Builder','</>','Genera los archivos reales']
  ]
};

async function status(){
  try{const s=await fetch('/api/status').then(r=>r.json());$('#mode').textContent=s.mode==='gemini'?`● IA real · ${s.model}`:'● modo demo · sin API key'}catch{$('#mode').textContent='● sin conexión'}
}
status();

function renderAgents(){
  $('#agentList').innerHTML=AGENTS[workMode].map(([name,icon,desc])=>`<div class="agent" data-agent="${name}"><span>${icon}</span><div><b>${name}</b><small>${desc}</small></div><i></i></div>`).join('');
}
renderAgents();

function setWorkMode(mode){
  if($('#run').disabled) return;
  workMode=mode;
  document.querySelectorAll('.modebtn').forEach(b=>b.classList.toggle('active',b.dataset.workmode===mode));
  renderAgents();
  $('#score').textContent='—';$('#bar').style.width='0';$('#verdict').textContent='Esperando objetivo…';$('#roundLabel').textContent='Sin iniciar';
  if(mode==='dev'){
    $('#subtitle').textContent='Una mesa de agentes define, diseña, revisa y construye un MVP con archivos reales.';
    $('#goalLabel').textContent='¿Qué querés que desarrolle?';
    $('#goal').placeholder='Ej: Desarrollá una web para optimizar fotos de productos para publicaciones online';
    $('#roundsLabel').textContent='Iteraciones QA';$('#rounds').max='3';$('#rounds').value='2';
    $('#run').textContent='🛠️ Desarrollar MVP';$('#devHint').classList.remove('hidden');
  }else{
    $('#subtitle').textContent='Las IAs proponen, critican y mejoran una idea hasta llegar a una solución fuerte.';
    $('#goalLabel').textContent='¿Qué querés crear o resolver?';
    $('#goal').placeholder='Ej: Inventá una app útil para vendedores de Mercado Libre';
    $('#roundsLabel').textContent='Máx. rondas';$('#rounds').max='10';$('#rounds').value='5';
    $('#run').textContent='▶ Iniciar deliberación';$('#devHint').classList.add('hidden');
  }
}
document.querySelectorAll('.modebtn').forEach(b=>b.onclick=()=>setWorkMode(b.dataset.workmode));

function setAgent(name,state){
  document.querySelectorAll('.agent').forEach(a=>a.classList.remove('active'));
  const a=document.querySelector(`[data-agent="${name}"]`);
  if(a){a.classList.add(state==='active'?'active':'done')}
}
function escapeHtml(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
function addMsg(role,text){
  if(log.querySelector('.empty')) log.innerHTML='';
  const d=document.createElement('div');d.className=`msg ${role}`;d.innerHTML=`<b>${escapeHtml(role)}</b>${escapeHtml(text)}`;log.appendChild(d);log.scrollTop=log.scrollHeight;history.push({role,text});
}
function pendingMsg(label){
  if(log.querySelector('.empty')) log.innerHTML='';
  const d=document.createElement('div');d.className='msg Sistema';d.innerHTML=`<b>Sistema</b>${escapeHtml(label)} está trabajando…`;log.appendChild(d);log.scrollTop=log.scrollHeight;return d;
}

async function agent(role,goal,current,rules,round){
  if(stopped) throw new Error('Proceso detenido por el usuario.');
  setAgent(role,'active');const pending=pendingMsg(role);
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),45000);
  try{
    const r=await fetch('/api/agent',{method:'POST',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({role,goal,current,rules,round,history})});
    const j=await r.json().catch(()=>({error:'Respuesta inválida del servidor'}));pending.remove();
    if(!r.ok) throw new Error(j.error||'Error');
    addMsg(role,j.text);setAgent(role,'done');return j.text;
  }catch(e){pending.remove();if(e?.name==='AbortError')throw new Error(`${role} tardó demasiado en responder.`);throw e}finally{clearTimeout(timer)}
}
function parseJson(text,fallback){try{return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0]||text)}catch{return fallback}}
function setScore(ev){
  const score=Math.max(0,Math.min(10,+ev.score||0));$('#score').textContent=score.toFixed(1);$('#bar').style.width=`${score*10}%`;$('#verdict').textContent=`${ev.verdict||'ITERAR'}: ${ev.reason||''}`;return score;
}
function resetRun(){
  stopped=false;history=[];best='';currentProject=null;log.innerHTML='';$('#run').disabled=true;$('#stop').disabled=false;document.querySelectorAll('.modebtn').forEach(b=>b.disabled=true);document.querySelectorAll('.agent').forEach(a=>a.className='agent');$('#projectPanel').classList.add('hidden');$('#result').textContent='Trabajando…';$('#resultTitle').textContent=workMode==='dev'?'Plan de desarrollo':'Mejor resultado';
}
function finishRun(){
  $('#run').disabled=false;$('#stop').disabled=true;document.querySelectorAll('.modebtn').forEach(b=>b.disabled=false);if($('#roundLabel').textContent!=='Finalizado')$('#roundLabel').textContent=stopped?'Detenido':'Finalizado';
}
function showFinalResult(){
  if(!best)return;const result=$('#result');result.textContent=best;const panel=result.closest('.result');if(panel){panel.classList.add('result-ready');panel.scrollIntoView({behavior:'smooth',block:'start'})}$('#resultTitle').textContent='✅ Resultado final';
}

async function runIdeas(goal,rules){
  let current='';const max=Math.min(10,Math.max(1,+$('#rounds').value||5));const target=+$('#target').value||9;
  for(let round=1;round<=max&&!stopped;round++){
    $('#roundLabel').textContent=`Ronda ${round} / ${max}`;
    current=await agent('Creador',goal,current,rules,round);
    const critique=await agent('Crítico',goal,current,rules,round);
    const improvements=await agent('Especialista',goal,current+'\n\nCRÍTICA:\n'+critique,rules,round);
    current=await agent('Creador',goal,current+'\n\nMEJORAS A INTEGRAR:\n'+improvements,rules,round);
    const ev=parseJson(await agent('Evaluador',goal,current,rules,round),{score:0,verdict:'ITERAR',reason:'No se pudo leer la evaluación'});
    const score=setScore(ev);best=current;$('#result').textContent=best;
    if(score>=target||ev.verdict==='APROBAR'){addMsg('Director',`Objetivo de calidad alcanzado (${score.toFixed(1)}/10). Se cierra la deliberación.`);break}
  }
  showFinalResult();
}

async function buildProject(goal,rules,plan){
  if(stopped) return;
  setAgent('Builder','active');const pending=pendingMsg('Builder · generando archivos');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),100000);
  try{
    const r=await fetch('/api/build',{method:'POST',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({goal,rules,plan,history})});
    const j=await r.json().catch(()=>({error:'Respuesta inválida del Builder'}));pending.remove();
    if(!r.ok)throw new Error(j.error||'No se pudo generar el proyecto');
    currentProject=j.project;setAgent('Builder','done');addMsg('Builder',`Proyecto generado: ${currentProject.files.length} archivos. ${currentProject.summary||''}`);renderProject(currentProject);
  }catch(e){pending.remove();if(e?.name==='AbortError')throw new Error('El Builder tardó demasiado en generar el proyecto.');throw e}finally{clearTimeout(timer)}
}

async function runDevelopment(goal,rules){
  const iterations=Math.min(3,Math.max(1,+$('#rounds').value||2));const target=+$('#target').value||9;
  $('#roundLabel').textContent='Definiendo MVP';
  const director=await agent('Director',goal,'',rules,1);
  const architecture=await agent('Arquitecto',goal,director,rules,1);
  const frontend=await agent('Frontend',goal,architecture+'\n\nPRODUCTO:\n'+director,rules,1);
  const backend=await agent('Backend',goal,architecture+'\n\nPRODUCTO:\n'+director,rules,1);
  let plan=`PRODUCTO:\n${director}\n\nARQUITECTURA:\n${architecture}\n\nFRONTEND:\n${frontend}\n\nBACKEND:\n${backend}`;
  let review={score:0,verdict:'ITERAR',reason:'',fixes:[]};
  for(let i=1;i<=iterations&&!stopped;i++){
    $('#roundLabel').textContent=`QA ${i} / ${iterations}`;
    const tests=await agent('Tester',goal,plan,rules,i);
    const extra=review.fixes?.length?`\n\nCORRECCIONES DEL REVIEW ANTERIOR:\n- ${review.fixes.join('\n- ')}`:'';
    plan=await agent('Integrador',goal,plan+'\n\nPRUEBAS/PROBLEMAS:\n'+tests+extra,rules,i);
    review=parseJson(await agent('Reviewer',goal,plan,rules,i),{score:0,verdict:'ITERAR',reason:'No se pudo leer el review',fixes:[]});
    const score=setScore(review);best=plan;$('#result').textContent=best;
    if(score>=target||review.verdict==='APROBAR'){addMsg('Director',`Plan técnico aprobado (${score.toFixed(1)}/10). El Builder empieza a programar.`);break}
  }
  $('#resultTitle').textContent='✅ Plan aprobado para construir';best=plan;$('#result').textContent=best;
  await buildProject(goal,rules,plan);
}

function renderProject(project){
  const panel=$('#projectPanel');panel.classList.remove('hidden');selectedFile=0;
  $('#projectName').textContent=project.name||'MVP';$('#projectSummary').textContent=project.summary||'';$('#projectRun').textContent=project.run?`Ejecutar: ${project.run}`:'';$('#projectMeta').textContent=project.stack||'';$('#projectNotes').textContent=(project.notes||[]).map(n=>`• ${n}`).join('\n');
  const list=$('#fileList');list.innerHTML='';project.files.forEach((f,i)=>{const b=document.createElement('button');b.className='filebtn'+(i===0?' active':'');b.textContent=f.path;b.onclick=()=>selectFile(i);list.appendChild(b)});selectFile(0);panel.scrollIntoView({behavior:'smooth',block:'start'});
  try{localStorage.setItem('aiWorkshopLastProject',JSON.stringify(project))}catch{}
}
function selectFile(i){
  if(!currentProject?.files?.[i])return;selectedFile=i;document.querySelectorAll('.filebtn').forEach((b,n)=>b.classList.toggle('active',n===i));const f=currentProject.files[i];$('#filePath').textContent=f.path;$('#codeView code').textContent=f.content;
}
function downloadBlob(name,content,type='text/plain;charset=utf-8'){
  const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);
}
$('#downloadFile').onclick=()=>{const f=currentProject?.files?.[selectedFile];if(f)downloadBlob(f.path.split('/').pop(),f.content)};
$('#downloadManifest').onclick=()=>{if(currentProject)downloadBlob(`${currentProject.name||'proyecto'}.json`,JSON.stringify(currentProject,null,2),'application/json;charset=utf-8')};

$('#run').onclick=async()=>{
  const goal=$('#goal').value.trim();if(!goal)return alert('Escribí o dictá un objetivo.');const rules=$('#rules').value.trim();resetRun();
  try{if(workMode==='dev')await runDevelopment(goal,rules);else await runIdeas(goal,rules)}catch(e){addMsg('Sistema','Error: '+e.message);if(best)showFinalResult()}finally{finishRun()}
};
$('#stop').onclick=()=>{stopped=true;$('#stop').disabled=true};
$('#clear').onclick=()=>{log.innerHTML='<div class="empty">La deliberación aparecerá acá en tiempo real.</div>';history=[]};
$('#copy').onclick=()=>navigator.clipboard.writeText($('#result').textContent);

const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
if(SR){const rec=new SR();rec.lang='es-AR';rec.interimResults=false;rec.onstart=()=>$('#mic').classList.add('mic-on');rec.onend=()=>$('#mic').classList.remove('mic-on');rec.onresult=e=>{const t=e.results[0][0].transcript;$('#goal').value=($('#goal').value+' '+t).trim()};$('#mic').onclick=()=>rec.start()}else{$('#mic').onclick=()=>alert('Tu navegador no ofrece reconocimiento de voz. Podés escribir el objetivo.')}
