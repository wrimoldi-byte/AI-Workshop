// Makes successful Builder delivery unmistakable, especially on mobile.
(function(){
  const byId=id=>document.getElementById(id);
  let toast=null;

  function showDelivery(project){
    if(!project?.files?.length)return;
    const count=project.files.length;
    const title=byId('resultTitle');
    const result=byId('result');
    const round=byId('roundLabel');
    if(title) title.textContent=`✅ PROYECTO GENERADO · ${count} archivo${count===1?'':'s'}`;
    if(result) result.textContent=`Builder terminó correctamente. El proyecto “${project.name||'MVP'}” tiene ${count} archivo${count===1?'':'s'} real${count===1?'':'es'}. Más abajo podés abrirlos, descargar el ZIP y publicarlos en GitHub.`;
    if(round) round.textContent='✅ Entregado';

    if(!toast){
      toast=document.createElement('button');
      toast.id='deliveryToast';
      toast.type='button';
      toast.style.cssText='position:fixed;left:14px;right:14px;bottom:18px;z-index:9999;padding:16px 18px;border:0;border-radius:16px;background:linear-gradient(135deg,#39c98f,#6787ff);color:white;font-weight:900;font-size:16px;box-shadow:0 14px 40px #0009;cursor:pointer';
      document.body.appendChild(toast);
    }
    toast.textContent=`✅ PROYECTO GENERADO · ${count} archivo${count===1?'':'s'} · TOCAR PARA VER`;
    toast.onclick=()=>byId('projectPanel')?.scrollIntoView({behavior:'smooth',block:'start'});
    toast.style.display='block';
    setTimeout(()=>{if(toast)toast.style.display='none'},18000);

    setTimeout(()=>byId('projectPanel')?.scrollIntoView({behavior:'smooth',block:'start'}),250);
  }

  if(typeof renderProject==='function'){
    const previous=renderProject;
    renderProject=function(project){
      const out=previous(project);
      showDelivery(project);
      return out;
    };
  }

  // If a project was already restored/generated before this script wrapped renderProject.
  try{if(typeof currentProject!=='undefined'&&currentProject?.files?.length)showDelivery(currentProject)}catch{}
})();
