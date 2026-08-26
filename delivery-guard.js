// AI Workshop delivery guard: development is the default and code answers become real files.
(function(){
  const byId=id=>document.getElementById(id);

  function isDevIntent(text){
    return /(desarroll|program|implement|codific|c[oó]digo|archivo|mvp|apk|ejecutable|\.exe|github|streamlit|python|react|next\.js|backend|frontend|api|base de datos|aplicaci[oó]n|\bapp\b|\bweb\b|software|juego|pwa)/i.test(String(text||''));
  }

  function safeName(s){
    return String(s||'proyecto-generado').trim().toLowerCase().replace(/[^a-z0-9áéíóúüñ _.-]/gi,'').replace(/\s+/g,'-').replace(/-+/g,'-').slice(0,55)||'proyecto-generado';
  }

  function extForLanguage(lang,index){
    const l=String(lang||'').toLowerCase();
    if(/html/.test(l)) return index===0?'index.html':`page-${index+1}.html`;
    if(/css/.test(l)) return index===0?'styles.css':`styles-${index+1}.css`;
    if(/javascript|js/.test(l)) return index===0?'app.js':`script-${index+1}.js`;
    if(/typescript|tsx|ts/.test(l)) return `file-${index+1}.${/tsx/.test(l)?'tsx':'ts'}`;
    if(/python|py/.test(l)) return index===0?'app.py':`module-${index+1}.py`;
    if(/json/.test(l)) return index===0?'package.json':`data-${index+1}.json`;
    if(/toml/.test(l)) return `config-${index+1}.toml`;
    if(/yaml|yml/.test(l)) return `config-${index+1}.yml`;
    if(/sql/.test(l)) return `schema-${index+1}.sql`;
    return `archivo-${index+1}.txt`;
  }

  function extractFiles(text){
    const s=String(text||'');
    const files=[];
    const re=/```([a-zA-Z0-9_+.-]*)\s*\n([\s\S]*?)```/g;
    let m,index=0;
    while((m=re.exec(s))){
      const before=s.slice(Math.max(0,m.index-240),m.index);
      const named=[...before.matchAll(/`([^`\n]+\.(?:html?|css|m?js|jsx|ts|tsx|py|json|toml|ya?ml|sql|md|txt))`/gi)].pop();
      let path=named?.[1]?.trim()||extForLanguage(m[1],index);
      path=path.replace(/^\/+/, '').replace(/\.\./g,'');
      if(files.some(f=>f.path===path)){
        const dot=path.lastIndexOf('.');
        path=dot>0?`${path.slice(0,dot)}-${index+1}${path.slice(dot)}`:`${path}-${index+1}`;
      }
      files.push({path,content:m[2].replace(/^\n|\n$/g,'')});
      index++;
    }
    return files;
  }

  function inferStack(files){
    const paths=files.map(f=>f.path.toLowerCase()).join(' ');
    if(paths.includes('.py')) return 'Python';
    if(paths.includes('.tsx')||paths.includes('.ts')) return 'TypeScript / Web';
    if(paths.includes('.html')) return 'HTML / CSS / JavaScript';
    return 'Proyecto generado';
  }

  function materializeCodeAnswer(){
    if(typeof currentProject!=='undefined' && currentProject?.files?.length) return false;
    const goal=byId('goal')?.value||'';
    const result=(typeof best!=='undefined'&&best)?best:(byId('result')?.textContent||'');
    if(!isDevIntent(goal+' '+result)) return false;
    const files=extractFiles(result);
    if(!files.length) return false;
    const project={
      name:safeName((goal.split(/[.!?\n]/)[0]||'proyecto-generado')),
      summary:'Archivos materializados automáticamente desde una respuesta de código. Ya no hace falta copiar y pegar manualmente.',
      stack:inferStack(files),
      run:files.some(f=>f.path==='index.html')?'Abrir index.html en un navegador':files.some(f=>f.path==='app.py')?'python app.py':'Revisar README/archivos del proyecto',
      notes:['Recuperado automáticamente por Delivery Guard.','Antes de publicar, ejecutá el flujo de Desarrollo para que Tester/Reviewer auditen el proyecto.'],
      files
    };
    try{
      currentProject=project;
      if(typeof renderProject==='function') renderProject(project);
      if(typeof addMsg==='function') addMsg('Sistema',`Entrega recuperada: convertí ${files.length} bloque${files.length===1?'':'s'} de código en archivos reales. Ya podés descargar el ZIP.`);
      if(byId('resultTitle')) byId('resultTitle').textContent='✅ Código convertido en proyecto';
      return true;
    }catch(e){console.warn('Delivery Guard materialization failed',e);return false}
  }

  // Development is the default every time the app opens.
  try{ if(typeof setWorkMode==='function' && typeof workMode!=='undefined' && workMode!=='dev') setWorkMode('dev'); }catch(e){console.warn(e)}

  // Last-line guard after all previous run wrappers complete.
  const run=byId('run');
  if(run){
    const previous=run.onclick;
    run.onclick=async function(ev){
      const goal=byId('goal')?.value||'';
      if(typeof workMode!=='undefined' && workMode==='ideas' && isDevIntent(goal)){
        try{setWorkMode('dev')}catch{}
      }
      if(previous) await previous.call(this,ev);
      materializeCodeAnswer();
    };
  }

  window.addEventListener('ai-workshop-run-finished',materializeCodeAnswer);
})();
