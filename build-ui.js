// Lightweight build UI: Expo/React Native => APK, Python => EXE.
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

  function setText(el,text){if(el&&el.textContent!==text)el.textContent=text}

  function refresh(){
    const android=isAndroidProject();
    const box=document.querySelector('.githubbox');
    const h=box?.querySelector('.githubhead h3');
    const p=box?.querySelector('.githubhead p');
    const b=byId('buildExe');
    setText(h,'🐙 GitHub + APK / EXE');
    setText(p,android
      ? 'Publica el proyecto y compila un APK Android instalable automáticamente con GitHub Actions.'
      : 'Publica los archivos reales y genera el instalable compatible con el tipo de proyecto.');
    setText(b,android?'📱 Compilar APK':'⚙ Compilar .EXE');

    if(android){
      const el=byId('githubMessage');
      const link=byId('githubLink');
      if(el){
        const t=(el.textContent||'')
          .replace(/Build \.EXE preparado \([^)]*\)\. Tocá “Compilar \.EXE”\./g,'Build APK preparado (app-debug.apk). Tocá “Compilar APK”.')
          .replace(/Build \.EXE preparado/g,'Build APK preparado')
          .replace(/EJECUTABLE LISTO\./g,'APK LISTO PARA INSTALAR.')
          .replace(/ejecutable/gi,'APK')
          .replace(/\.EXE/g,'APK');
        setText(el,t);
      }
      if(link && /Descargar ejecutable/i.test(link.textContent||'')) setText(link,'⬇ Descargar APK en GitHub');
    }
  }

  try{
    if(typeof renderProject==='function'){
      const original=renderProject;
      renderProject=function(project){const r=original(project);requestAnimationFrame(refresh);return r};
    }
  }catch(e){console.warn('Build UI render wrapper',e)}

  byId('publishGithub')?.addEventListener('click',()=>setTimeout(refresh,300));
  byId('buildExe')?.addEventListener('click',()=>setTimeout(refresh,300));
  byId('checkBuild')?.addEventListener('click',()=>setTimeout(refresh,300));
  setTimeout(refresh,0);
})();