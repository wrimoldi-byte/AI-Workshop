// Dynamic build UI: Expo/React Native => APK, Python => EXE.
(function(){
  const byId=id=>document.getElementById(id);

  function isAndroidProject(){
    try{
      const files=(typeof currentProject!=='undefined'&&currentProject?.files)||[];
      const pkg=files.find(f=>f.path==='package.json');
      const app=files.some(f=>/^App\.(js|jsx|ts|tsx)$/i.test(f.path));
      if(!pkg||!app)return false;
      return /"expo"\s*:|"react-native"\s*:/i.test(pkg.content||'') || files.some(f=>/^(app\.json|app\.config\.(js|ts))$/i.test(f.path));
    }catch{return false}
  }

  function patchMessage(){
    const el=byId('githubMessage');
    const link=byId('githubLink');
    if(!el||!isAndroidProject())return;
    let t=el.textContent||'';
    t=t
      .replace(/Build \.EXE preparado \([^)]*\)\. Tocá “Compilar \.EXE”\./g,'Build APK preparado (app-debug.apk). Tocá “Compilar APK”.')
      .replace(/Build \.EXE preparado/g,'Build APK preparado')
      .replace(/EJECUTABLE LISTO\./g,'APK LISTO PARA INSTALAR.')
      .replace(/ejecutable/gi,'APK')
      .replace(/\.EXE/g,'APK');
    if(el.textContent!==t)el.textContent=t;
    if(link && /Descargar ejecutable/i.test(link.textContent||'')) link.textContent='⬇ Descargar APK en GitHub';
  }

  function refresh(){
    const android=isAndroidProject();
    const box=document.querySelector('.githubbox');
    const h=box?.querySelector('.githubhead h3');
    const p=box?.querySelector('.githubhead p');
    const b=byId('buildExe');
    if(h)h.textContent='🐙 GitHub + APK / EXE';
    if(p)p.textContent=android
      ? 'Publica el proyecto y compila un APK Android instalable automáticamente con GitHub Actions.'
      : 'Publica los archivos reales y genera el instalable compatible con el tipo de proyecto.';
    if(b)b.textContent=android?'📱 Compilar APK':'⚙ Compilar .EXE';
    patchMessage();
  }

  try{
    if(typeof renderProject==='function'){
      const original=renderProject;
      renderProject=function(project){const r=original(project);setTimeout(refresh,0);return r};
    }
  }catch(e){console.warn('Build UI render wrapper',e)}

  const observer=new MutationObserver(()=>refresh());
  const panel=byId('projectPanel');
  if(panel)observer.observe(panel,{subtree:true,childList:true,characterData:true});
  setTimeout(refresh,0);
})();
