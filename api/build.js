import {buildProject, status} from './_core.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  try {
    const b = req.body || {};
    if (!b.goal) return res.status(400).json({error:'Falta el objetivo del proyecto.'});
    const project = await buildProject(b.goal, b.rules || '', b.plan || '', b.history || []);
    res.status(200).json({project, ...status()});
  } catch (e) {
    console.error('build error', e);
    res.status(500).json({error:e.message || 'No se pudo generar el proyecto.'});
  }
}
