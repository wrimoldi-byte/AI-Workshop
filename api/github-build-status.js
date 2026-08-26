import {gh} from './_github.js';

function cleanRepo(v){
  const s=String(v||'').trim().replace(/^https?:\/\/github\.com\//,'').replace(/\.git$/,'').replace(/^\/+|\/+$/g,'');
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s)) throw new Error('Repo inválido. Usá owner/repo.');
  return s;
}

export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  try{
    const repo=cleanRepo(req.query?.repo);
    const meta=await gh(`/repos/${repo}`);
    const branch=String(req.query?.branch||meta.default_branch||'main');
    const runs=await gh(`/repos/${repo}/actions/workflows/build-windows.yml/runs?branch=${encodeURIComponent(branch)}&per_page=1`);
    const run=runs?.workflow_runs?.[0];
    if(!run) return res.status(200).json({ok:true,found:false,repo,branch});
    let artifacts=[];
    if(run.status==='completed' && run.conclusion==='success'){
      const a=await gh(`/repos/${repo}/actions/runs/${run.id}/artifacts?per_page=20`);
      artifacts=(a?.artifacts||[]).map(x=>({id:x.id,name:x.name,expired:x.expired,size:x.size_in_bytes}));
    }
    return res.status(200).json({ok:true,found:true,repo,branch,run:{id:run.id,status:run.status,conclusion:run.conclusion,html_url:run.html_url,created_at:run.created_at,updated_at:run.updated_at},artifacts});
  }catch(e){ return res.status(500).json({error:e.message}); }
}
