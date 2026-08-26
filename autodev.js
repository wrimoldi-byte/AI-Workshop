// Auto-routing guard: development requests must run the development pipeline.
(function(){
  const runButton=document.querySelector('#run');
  if(!runButton) return;

  function looksLikeDevelopment(text){
    const t=String(text||'').toLowerCase();
    return /(desarroll|program|implement|codific|c[oó]digo|mvp|ejecutable|\.exe|github|streamlit|python|react|backend|frontend|api|base de datos|aplicaci[oó]n|\bapp\b|\bweb\b|software|sistema)/i.test(t);
  }

  const originalRun=runButton.onclick;
  runButton.onclick=async function(ev){
    const goal=document.querySelector('#goal')?.value||'';
    const rules=document.querySelector('#rules')?.value||'';

    if(workMode==='ideas' && looksLikeDevelopment(goal+' '+rules)){
      setWorkMode('dev');
      const hint=document.querySelector('#devHint');
      if(hint){
        hint.classList.remove('hidden');
        hint.textContent='🛠️ Detecté que pediste desarrollo real. Cambié automáticamente a Modo Desarrollo: debe terminar con archivos, no solo con una idea.';
      }
    }

    await originalRun.call(this,ev);

    if(workMode==='dev' && !currentProject && !stopped){
      const result=document.querySelector('#result');
      const title=document.querySelector('#resultTitle');
      if(title) title.textContent='❌ Desarrollo incompleto';
      if(result) result.textContent='El proceso no terminó con archivos reales. No se considera un desarrollo terminado. Volvé a ejecutar; el sistema debe llegar hasta Builder y mostrar “Proyecto generado”.';
      const log=document.querySelector('#log');
      if(log){
        const d=document.createElement('div');
        d.className='msg Sistema';
        d.innerHTML='<b>Sistema</b>FALLO DE ENTREGA: no se generaron archivos. Un texto, plan o pregunta final no cuenta como MVP.';
        log.appendChild(d);
        log.scrollTop=log.scrollHeight;
      }
    }
  };
})();
