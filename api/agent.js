import {runAgent, status} from './_core.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  try {
    const b = req.body || {};
    const text = await runAgent(b.role, b.goal, b.current, b.history || [], b.rules || '', b.round || 1);
    res.status(200).json({text, ...status()});
  } catch (e) {
    res.status(500).json({error:e.message});
  }
}
