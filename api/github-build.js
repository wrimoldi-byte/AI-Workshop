import {gh} from './_github.js';

function cleanRepo(v){
  const s=String(v||'').trim().replace(/^https?:\/\/github\.com\//,'').replace(/\.git$/,'').replace(/^\/+|\/+$/g,'');
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s)) throw new Error('Repo inválido. Usá owner/repo.');
  return s;
}

async function workflowFor(repo,requested){
  if(requested==='apk') return {file:'build-android.yml',kind:'apk'};
  if(requested==='exe') return {file:'build-windows.yml',kind:'exe'};
  try{await gh(`/repos/${repo}/contents/.github/workflows/build-android.yml`);return {file:'build-android.yml',kind:'apk'}}catch(e){if(!/GitHub 404:/.test(e.message)) throw e}
  try{await gh(`/repos/${repo}/contents/.github/workflows/build-windows.yml`);return {file:'build-windows.yml',kind:'exe'}}catch(e){if(!/GitHub 404:/.test(e.message)) throw e}
  throw new Error('No encontré un workflow de compilación APK ni EXE en el repositorio. Publicá el proyecto nuevamente desde AI Workshop.');
}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  try{
    const repo=cleanRepo(req.body?.repo);
    const meta=await gh(`/repos/${repo}`);
    const branch=String(req.body?.branch||meta.default_branch||'main');
    const wf=await workflowFor(repo,req.body?.kind);
    await gh(`/repos/${repo}/actions/workflows/${wf.file}/dispatches`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ref:branch})});
    return res.status(200).json({ok:true,repo,branch,kind:wf.kind,workflow:wf.file,actionsUrl:`https://github.com/${repo}/actions/workflows/${wf.file}`});
  }catch(e){ return res.status(500).json({error:e.message}); }
}
