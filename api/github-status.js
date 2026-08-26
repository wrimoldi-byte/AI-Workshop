import {gh, githubConfigured} from './_github.js';

export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  if(!githubConfigured()) return res.status(200).json({configured:false,ok:false});
  try{
    const u=await gh('/user');
    return res.status(200).json({configured:true,ok:true,login:u.login,avatar:u.avatar_url});
  }catch(e){
    return res.status(200).json({configured:true,ok:false,error:e.message});
  }
}
