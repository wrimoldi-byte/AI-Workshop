$('#downloadZip').onclick=async()=>{
  if(!currentProject)return;
  const button=$('#downloadZip');const old=button.textContent;button.disabled=true;button.textContent='Preparando ZIP…';
  try{
    const r=await fetch('/api/package',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({project:currentProject})});
    if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j.error||'No se pudo crear el ZIP')}
    const blob=await r.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${currentProject.name||'proyecto'}.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){alert('Error al descargar ZIP: '+e.message)}finally{button.disabled=false;button.textContent=old}
};
