import {buildProject, status} from './_core.js';

function isQualityGateError(e) {
  return /Builder rechazado por control de calidad|no generó archivos|JSON válido/i.test(e?.message || '');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  const b = req.body || {};
  if (!b.goal) return res.status(400).json({error:'Falta el objetivo del proyecto.'});

  try {
    const project = await buildProject(b.goal, b.rules || '', b.plan || '', b.history || []);
    return res.status(200).json({project, repaired:false, ...status()});
  } catch (firstError) {
    console.warn('builder first pass rejected', firstError?.message || firstError);

    if (!isQualityGateError(firstError)) {
      console.error('build error', firstError);
      return res.status(500).json({error:firstError?.message || 'No se pudo generar el proyecto.'});
    }

    try {
      const godotHint = /\bGodot\b|project\.godot|\.gd\b|\.tscn\b/i.test(`${b.goal || ''}\n${b.plan || ''}`)
        ? '\nSTACK BLOQUEADO: este proyecto es GODOT. No lo conviertas a React, Expo, JavaScript ni TypeScript. Entregá project.godot, escenas .tscn, scripts .gd completos y configuración Android correspondiente. package.json NO corresponde a un proyecto Godot puro.'
        : '';

      const repairRules = `${b.rules || ''}\n\nAUTOCORRECCIÓN OBLIGATORIA DEL BUILDER: el intento anterior fue rechazado por QA con este error:\n${firstError.message}\nCorregí exactamente esa falla y cualquier archivo truncado o incompleto detectado por Reviewer. No expliques: devolvé nuevamente el proyecto completo con todos sus archivos.${godotHint}`;
      const repairPlan = `${b.plan || ''}\n\n=== REINTENTO AUTOMÁTICO DE ENTREGA ===\nEl primer paquete no pasó el control de calidad. Debés reparar el proyecto y conservar el stack definido por el plan.`;

      const project = await buildProject(b.goal, repairRules, repairPlan, b.history || []);
      console.info('builder auto-repair succeeded');
      return res.status(200).json({project, repaired:true, repairReason:firstError.message, ...status()});
    } catch (secondError) {
      console.error('build auto-repair failed', secondError);
      return res.status(500).json({
        error:`El Builder intentó autocorregirse pero todavía no pasó QA. ${secondError?.message || secondError}`,
        firstError:firstError.message
      });
    }
  }
}
