// AI Workshop local project memory. Keeps ideas/projects and lets agents resume prior work.
(function(){
  const KEY='aiWorkshopMemoryV1';
  const MAX_BYTES=3600000;
  const MAX_RECORDS=18;
  const MAX_VERSIONS=6;
  let activeMemoryId=null;
  let resumeContext='';
  let memoryLoading=false;

  const byId=id=>document.getElementById(id);
  const now=()=>new Date().toISOString();
  const uid=()=>`mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;

  function readMemory(){
    try{
      const data=JSON.parse(localStorage.getItem(KEY)||'[]');
      return Array.isArray(data)?data:[];
    }catch{return []}
  }
  function writeMemory(items){
    items=fit(items);
    try{localStorage.setItem(KEY,JSON.stringify(items));return true}catch(e){console.warn('Memory save failed',e);return false}
  }
  function fit(items){
    items=[...items].sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,MAX_RECORDS);
    for(const r of items){if(Array.isArray(r.versions)&&r.versions.length>MAX_VERSIONS)r.versions=r.versions.slice(-MAX_VERSIONS)}
    let guard=80;
    while(JSON.stringify(items).length>MAX_BYTES && items.length && guard--){
      let trimmed=false;
      for(let i=items.length-1;i>=0;i--){
        const vs=items[i].versions||[];
        if(vs.length>1){vs.shift();trimmed=true;break}
      }
      if(!trimmed)items.pop();
    }
    return items;
  }
  function scoreNow(){const n=parseFloat(byId('score')?.textContent||'');return Number.isFinite(n)?n:null}
  function currentGoal(){return byId('goal')?.value?.trim()||''}
  function currentRules(){return byId('rules')?.value?.trim()||''}
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
  function fmtDate(s){try{return new Intl.DateTimeFormat('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(s))}catch{return ''}}

  function saveIdea(){
    const result=typeof best!=='undefined'?String(best||''):'';
    if(!result.trim())return;
    const items=readMemory();
    let rec=activeMemoryId?items.find(x=>x.id===activeMemoryId):null;
    if(!rec||rec.type!=='idea'){
      rec={id:uid(),type:'idea',name:(currentGoal().slice(0,55)||'Idea sin nombre'),goal:currentGoal(),rules:currentRules(),createdAt:now(),updatedAt:now(),versions:[]};
      items.unshift(rec);activeMemoryId=rec.id;
    }
    rec.goal=currentGoal()||rec.goal;rec.rules=currentRules();rec.updatedAt=now();
    rec.versions=rec.versions||[];
    rec.versions.push({version:rec.versions.length+1,createdAt:now(),score:scoreNow(),result,history:(typeof history!=='undefined'?history:[]).slice(-18)});
    writeMemory(items);renderMemory();
  }

  function saveProject(project){
    if(!project||!Array.isArray(project.files)||!project.files.length)return;
    const items=readMemory();
    let rec=activeMemoryId?items.find(x=>x.id===activeMemoryId):null;
    if(!rec||rec.type!=='project'){
      rec={id:uid(),type:'project',name:project.name||currentGoal().slice(0,55)||'Proyecto',goal:currentGoal(),rules:currentRules(),createdAt:now(),updatedAt:now(),versions:[]};
      items.unshift(rec);activeMemoryId=rec.id;
    }
    rec.name=project.name||rec.name;rec.goal=currentGoal()||rec.goal;rec.rules=currentRules();rec.updatedAt=now();rec.versions=rec.versions||[];
    rec.versions.push({version:rec.versions.length+1,createdAt:now(),score:scoreNow(),plan:(typeof best!=='undefined'?String(best||''):''),project,history:(typeof history!=='undefined'?history:[]).slice(-18)});
    writeMemory(items);renderMemory();
  }

  function latest(rec){return rec?.versions?.[rec.versions.length-1]||null}
  function buildContext(rec){
    const v=latest(rec);if(!v)return '';
    let text=`\n\n=== MEMORIA DE UNA VERSIÓN ANTERIOR ===\nProyecto/idea: ${rec.name}\nObjetivo original: ${rec.goal||''}\nReglas originales: ${rec.rules||''}\nVersión: ${v.version||rec.versions.length}\nPuntuación anterior: ${v.score??'sin dato'}\n`;
    if(rec.type==='idea'){
      text+=`RESULTADO ANTERIOR:\n${String(v.result||'').slice(0,16000)}\n`;
    }else{
      const p=v.project||{};
      text+=`RESUMEN: ${p.summary||''}\nSTACK: ${p.stack||''}\nPLAN ANTERIOR:\n${String(v.plan||'').slice(0,7000)}\nARCHIVOS EXISTENTES (conservar lo que funciona y modificar solo lo necesario):\n`;
      let left=18000;
      for(const f of (p.files||[])){
        if(left<=0)break;
        const header=`\n--- ${f.path} ---\n`;
        const body=String(f.content||'').slice(0,Math.max(0,left-header.length));
        text+=header+body;left-=header.length+body.length;
      }
    }
    return text+'\n=== FIN MEMORIA ANTERIOR ===\n';
  }

  function loadRecord(id,duplicate=false){
    const items=readMemory();const source=items.find(x=>x.id===id);if(!source)return;
    let rec=source;
    if(duplicate){
      rec=JSON.parse(JSON.stringify(source));rec.id=uid();rec.name=`${source.name} - copia`;rec.createdAt=now();rec.updatedAt=now();items.unshift(rec);writeMemory(items);
    }
    activeMemoryId=rec.id;resumeContext=buildContext(rec);
    const v=latest(rec);
    if(rec.type==='project'){
      if(typeof setWorkMode==='function')setWorkMode('dev');
      if(byId('goal'))byId('goal').value=rec.goal||'';
      if(byId('rules'))byId('rules').value=rec.rules||'';
      if(v?.project){
        try{currentProject=JSON.parse(JSON.stringify(v.project));memoryLoading=true;renderProject(currentProject);memoryLoading=false}catch(e){memoryLoading=false;console.warn(e)}
      }
      if(byId('resultTitle'))byId('resultTitle').textContent='📚 Proyecto retomado';
      if(byId('result'))byId('result').textContent='Versión anterior cargada. Editá el objetivo si querés pedir un cambio y tocá “Desarrollar MVP”. Los agentes recibirán el contexto y parte del código anterior.';
    }else{
      if(typeof setWorkMode==='function')setWorkMode('ideas');
      if(byId('goal'))byId('goal').value=rec.goal||'';
      if(byId('rules'))byId('rules').value=rec.rules||'';
      if(v?.result){best=v.result;if(byId('result'))byId('result').textContent=v.result;if(byId('resultTitle'))byId('resultTitle').textContent='📚 Idea retomada'}
    }
    renderMemory();
    byId('goal')?.scrollIntoView({behavior:'smooth',block:'center'});
  }

  function removeRecord(id){
    if(!confirm('¿Borrar esta idea/proyecto de la memoria de este dispositivo?'))return;
    const items=readMemory().filter(x=>x.id!==id);if(activeMemoryId===id){activeMemoryId=null;resumeContext=''}writeMemory(items);renderMemory();
  }

  function renderMemory(){
    const list=byId('memoryList');if(!list)return;
    const q=(byId('memorySearch')?.value||'').trim().toLowerCase();
    const items=readMemory().filter(r=>!q||`${r.name} ${r.goal} ${r.type}`.toLowerCase().includes(q));
    byId('memoryCount').textContent=`${items.length} guardado${items.length===1?'':'s'}`;
    if(!items.length){list.innerHTML='<div class="memoryempty">Todavía no hay ideas o proyectos guardados en este dispositivo. Se guardan automáticamente al terminar.</div>';return}
    list.innerHTML=items.map(r=>{
      const v=latest(r);const active=r.id===activeMemoryId?' active':'';
      return `<article class="memorycard${active}"><div class="memorytop"><span class="memorytype">${r.type==='project'?'🛠️ Proyecto':'💡 Idea'}</span><span>${esc(fmtDate(r.updatedAt))}</span></div><strong>${esc(r.name)}</strong><p>${esc((r.goal||'').slice(0,145))}</p><div class="memorymeta"><span>v${v?.version||r.versions?.length||1}</span>${v?.score!=null?`<span>⭐ ${esc(Number(v.score).toFixed(1))}</span>`:''}<span>${r.versions?.length||0} versión${(r.versions?.length||0)===1?'':'es'}</span></div><div class="memoryactions"><button class="primary" data-resume="${r.id}">Retomar</button><button class="secondary" data-copy="${r.id}">Duplicar</button><button class="memorydelete" data-delete="${r.id}" title="Borrar">✕</button></div></article>`
    }).join('');
    list.querySelectorAll('[data-resume]').forEach(b=>b.onclick=()=>loadRecord(b.dataset.resume,false));
    list.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>loadRecord(b.dataset.copy,true));
    list.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>removeRecord(b.dataset.delete));
  }

  // Inject previous-version context into every agent and the Builder when resuming.
  if(typeof agent==='function'){
    const originalAgent=agent;
    agent=async function(role,goal,current,rules,round){
      const extra=resumeContext?`${rules||''}${resumeContext}`:rules;
      return originalAgent(role,goal,current,extra,round);
    };
  }
  if(typeof buildProject==='function'){
    const originalBuildProject=buildProject;
    buildProject=async function(goal,rules,plan){
      const extra=resumeContext?`${rules||''}${resumeContext}`:rules;
      return originalBuildProject(goal,extra,plan);
    };
  }
  if(typeof renderProject==='function'){
    const originalRenderProject=renderProject;
    renderProject=function(project){originalRenderProject(project);if(!memoryLoading)saveProject(project)};
  }
  if(typeof showFinalResult==='function'){
    const originalShowFinalResult=showFinalResult;
    showFinalResult=function(){originalShowFinalResult();if(typeof workMode!=='undefined'&&workMode==='ideas')saveIdea()};
  }

  byId('memorySearch')?.addEventListener('input',renderMemory);
  byId('memoryClear')?.addEventListener('click',()=>{
    if(confirm('¿Borrar TODA la memoria local de AI Workshop en este dispositivo?')){localStorage.removeItem(KEY);activeMemoryId=null;resumeContext='';renderMemory()}
  });
  renderMemory();
})();
