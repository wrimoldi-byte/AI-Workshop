import {gh} from './_github.js';

function cleanRepo(v){
  const s=String(v||'').trim().replace(/^https?:\/\/github\.com\//,'').replace(/\.git$/,'').replace(/^\/+|\/+$/g,'');
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s)) throw new Error('Repo inválido. Usá owner/repo.');
  return s;
}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  try{
    const repo=cleanRepo(req.body?.repo);
    const meta=await gh(`/repos/${repo}`);
    const branch=String(req.body?.branch||meta.default_branch||'main');
    await gh(`/repos/${repo}/actions/workflows/build-windows.yml/dispatches`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ref:branch})});
    return res.status(200).json({ok:true,repo,branch,actionsUrl:`https://github.com/${repo}/actions/workflows/build-windows.yml`});
  }catch(e){ return res.status(500).json({error:e.message}); }
}
