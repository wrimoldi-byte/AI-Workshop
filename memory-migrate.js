// One-time import of the project saved by older AI Workshop versions.
(function(){
  const memoryKey='aiWorkshopMemoryV1';
  const legacyKey='aiWorkshopLastProject';
  try{
    const project=JSON.parse(localStorage.getItem(legacyKey)||'null');
    if(!project||!Array.isArray(project.files)||!project.files.length)return;
    const items=JSON.parse(localStorage.getItem(memoryKey)||'[]');
    const list=Array.isArray(items)?items:[];
    const exists=list.some(r=>r.type==='project'&&r.name===project.name&&r.versions?.some(v=>v.project?.files?.length===project.files.length));
    if(!exists){
      const stamp=new Date().toISOString();
      list.unshift({
        id:`legacy_${Date.now().toString(36)}`,
        type:'project',
        name:project.name||'Proyecto anterior',
        goal:project.summary||project.name||'Continuar proyecto anterior',
        rules:'',
        createdAt:stamp,
        updatedAt:stamp,
        versions:[{version:1,createdAt:stamp,score:null,plan:'Importado automáticamente desde la versión anterior de AI Workshop.',project,history:[]}]
      });
      localStorage.setItem(memoryKey,JSON.stringify(list));
      document.getElementById('memorySearch')?.dispatchEvent(new Event('input'));
    }
  }catch(e){console.warn('Legacy memory import skipped',e)}
})();
