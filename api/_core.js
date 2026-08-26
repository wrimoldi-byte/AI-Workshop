const PRIMARY_MODEL = 'gemini-3.5-flash-lite';
const FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash'];

function parseGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map(p => typeof p?.text === 'string' ? p.text : '').filter(Boolean).join('\n').trim();
}

async function askModel(model, key, instructions, input, options = {}) {
  const timeoutMs = options.timeoutMs || 22000;
  const maxOutputTokens = options.maxOutputTokens || 900;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const generationConfig = {maxOutputTokens};
    if (options.json) generationConfig.responseMimeType = 'application/json';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', signal: controller.signal,
      headers: {'x-goog-api-key': key, 'content-type': 'application/json'},
      body: JSON.stringify({
        systemInstruction:{parts:[{text:instructions}]},
        contents:[{role:'user',parts:[{text:input}]}],
        generationConfig
      })
    });
    if (!r.ok) throw new Error(`Gemini ${model} ${r.status}: ${await r.text()}`);
    const text = parseGeminiText(await r.json());
    if (!text) throw new Error(`Gemini ${model} respondió sin texto utilizable.`);
    return text;
  } finally { clearTimeout(timer); }
}

async function askGemini(instructions, input, options = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const errors = [];
  for (const model of FALLBACK_MODELS) {
    try { return await askModel(model, key, instructions, input, options); }
    catch (e) {
      const seconds = Math.round((options.timeoutMs || 22000) / 1000);
      const msg = e?.name === 'AbortError' ? `${model}: timeout ${seconds} s` : `${model}: ${e.message}`;
      errors.push(msg);
      console.warn('Gemini fallback:', msg);
    }
  }
  throw new Error(`Gemini no respondió. ${errors.join(' | ')}`);
}

const HARD_GATE = `REGLA DE TERMINADO OBLIGATORIA: un MVP NO está terminado si contiene TODO, FIXME, mock, simulación, placeholder, datos falsos, funciones vacías, secretos hardcodeados, archivos truncados o instrucciones del tipo "reemplazar luego". Tampoco está terminado si faltan manifiestos, escenas, dependencias o configuración necesaria para ejecutar o compilar. Si aparece cualquiera de estas señales, la nota máxima es 7.0 y el veredicto debe ser ITERAR.`;

const PROMPTS = {
  Creador: 'Sos el agente CREADOR. Proponé o reescribí la mejor solución posible. Integrá críticas y reglas. Sé concreto y accionable. No hagas preguntas al usuario.',
  Crítico: 'Sos el agente CRÍTICO. Buscá errores, contradicciones, supuestos débiles, riesgos y oportunidades de mejora. Sé exigente y breve.',
  Especialista: 'Sos el agente ESPECIALISTA/ARQUITECTO. Convertí la crítica en mejoras concretas de diseño, implementación, UX y robustez.',
  Evaluador: `Sos EVALUADOR. ${HARD_GATE} Respondé SOLO JSON válido con {"score":numero_0_a_10,"verdict":"APROBAR"|"ITERAR","reason":"texto breve"}. Aprobar solo si score >= 9.`,
  Director: `Sos DIRECTOR DE PRODUCTO. Cerrá decisiones sin preguntarle al usuario. Convertí la idea en un MVP desarrollable con criterios verificables. ${HARD_GATE}`,
  Arquitecto: `Sos ARQUITECTO DE SOFTWARE. Diseñá la solución técnica mínima ejecutable. Si el proyecto ya eligió Godot, mantené Godot y no lo migres a React/Node/Expo. ${HARD_GATE}`,
  Frontend: `Sos DESARROLLADOR FRONTEND. Definí interfaz y experiencia completas para el stack elegido. ${HARD_GATE}`,
  Backend: `Sos DESARROLLADOR BACKEND. Implementá lógica e integraciones reales, validación, seguridad, timeouts y errores. ${HARD_GATE}`,
  Tester: `Sos QA/TESTER. Buscá explícitamente archivos truncados, TODO, mocks, escenas faltantes, manifiestos ausentes, dependencias faltantes y caminos no implementados. En Godot verificá project.godot, escenas .tscn y scripts .gd completos. ${HARD_GATE}`,
  Integrador: `Sos PROGRAMADOR INTEGRADOR. Cerrá una especificación implementable, resolvé contradicciones y no cambies de stack sin una razón indispensable. ${HARD_GATE}`,
  Reviewer: `Sos REVIEWER TÉCNICO y tenés poder de veto. ${HARD_GATE} Respondé SOLO JSON válido con {"score":numero_0_a_10,"verdict":"APROBAR"|"ITERAR","reason":"texto breve","fixes":["cambio 1","cambio 2"]}. Aprobar únicamente si puede convertirse ya en un MVP funcional.`
};

function demoAgent(role, goal) {
  if (role === 'Reviewer' || role === 'Evaluador') return JSON.stringify({score:8.2,verdict:'ITERAR',reason:'Modo demo: falta validar implementación real.',fixes:['Completar implementación']});
  return `${role}: propuesta concreta para ${goal}`;
}

export async function runAgent(role, goal, current, history, rules, round) {
  const input = `OBJETIVO:\n${goal}\n\nREGLAS DEL USUARIO:\n${rules || 'Ninguna'}\n\nRONDA/ITERACIÓN: ${round}\n\nESTADO ACTUAL:\n${current || 'Todavía no existe'}\n\nHISTORIAL RECIENTE:\n${(history || []).slice(-6).map(x=>`${x.role}: ${x.text}`).join('\n\n') || 'Vacío'}`;
  const judge = role === 'Reviewer' || role === 'Evaluador';
  return (await askGemini(PROMPTS[role] || PROMPTS.Creador, input, {maxOutputTokens:judge?700:1200,timeoutMs:judge?28000:24000,json:judge})) ?? demoAgent(role, goal);
}

function extractJson(text) {
  try { return JSON.parse(text); } catch {}
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
  throw new Error('El Builder no devolvió JSON válido.');
}

function balance(text, open, close) {
  return [...text].reduce((n,c)=>n+(c===open?1:c===close?-1:0),0);
}

function auditProject(project, goal = '') {
  const findings = [];
  const files = Array.isArray(project.files) ? project.files : [];
  const paths = files.map(f=>String(f.path||'').toLowerCase());
  const joined = files.map(f=>String(f.content||'')).join('\n');
  const stackGoal = `${project.stack||''} ${goal||''} ${joined.slice(0,30000)}`;
  const forbidden = /\b(TODO|FIXME|mock|simulaci[oó]n|placeholder|reemplazar\s+(con|luego)|implementar\s+luego|fake\s+data)\b/i;

  for (const f of files) {
    const content = String(f.content||'');
    if (forbidden.test(content)) findings.push(`${f.path}: contiene señal de implementación incompleta`);
  }

  const isGodot = paths.includes('project.godot') || paths.some(p=>p.endsWith('.gd') || p.endsWith('.tscn')) || /\bGodot\b/i.test(`${project.stack||''} ${goal||''}`);

  if (isGodot) {
    if (!paths.includes('project.godot')) findings.push('Godot: falta project.godot.');
    if (!paths.some(p=>p.endsWith('.tscn'))) findings.push('Godot: falta al menos una escena .tscn ejecutable.');
    for (const f of files.filter(f=>String(f.path||'').toLowerCase().endsWith('.gd'))) {
      const c = String(f.content||'').trim();
      if (!c) findings.push(`${f.path}: script vacío.`);
      if (/[=,+\-*\/.\[(]$/.test(c)) findings.push(`${f.path}: parece truncado al final.`);
      if (balance(c,'(',')') > 0 || balance(c,'[',']') > 0 || balance(c,'{','}') > 0) findings.push(`${f.path}: parece truncado o tiene delimitadores sin cerrar.`);
    }
  }

  const isNodeLike = !isGodot && (paths.some(p=>/\.(js|jsx|ts|tsx)$/.test(p)) || /React|Next\.js|Node\.js|npm|Expo|React Native/i.test(stackGoal));
  if (isNodeLike && !paths.includes('package.json')) findings.push('Falta package.json: el proyecto JavaScript/TypeScript no puede instalar dependencias.');

  const isExpo = !isGodot && (paths.some(p=>['app.config.js','app.config.ts','app.json'].includes(p)) || /\bExpo\b|React Native/i.test(stackGoal));
  if (isExpo) {
    const hasEntry = paths.some(p=>['app.js','app.jsx','app.ts','app.tsx','index.js','index.ts','index.tsx'].includes(p) || p.startsWith('src/'));
    const hasConfig = paths.some(p=>['app.config.js','app.config.ts','app.json'].includes(p));
    const hasAndroidBuild = paths.includes('eas.json') || paths.some(p=>p==='android/build.gradle' || p==='android/app/build.gradle');
    if (!hasEntry) findings.push('Expo/React Native: falta el archivo de entrada.');
    if (!hasConfig) findings.push('Expo/React Native: falta app.json o app.config.*.');
    if (/android|apk/i.test(goal) && !hasAndroidBuild) findings.push('Expo/React Native para APK: falta eas.json o Gradle.');
  }

  const isPython = !isGodot && (paths.some(p=>p.endsWith('.py')) || /Python|Streamlit|FastAPI/i.test(stackGoal));
  if (isPython && !paths.includes('requirements.txt') && !paths.includes('pyproject.toml')) findings.push('Proyecto Python: falta requirements.txt o pyproject.toml.');

  return findings;
}

export async function buildProject(goal, rules, plan, history) {
  const isGodotGoal = /\bGodot\b|\.gd\b|\.tscn\b|project\.godot/i.test(`${goal}\n${plan}`);
  const stackRule = isGodotGoal
    ? `REGLA GODOT: mantené Godot 4.x. NO generes package.json, React, Node.js ni Expo. Entregá project.godot, escenas .tscn y scripts .gd completos. Si el plan es demasiado grande, REDUCÍ funcionalidades: priorizá archivos completos antes que cantidad. Máximo 8 archivos.`
    : `Si usa React Native/Expo, incluí package.json, entry, app config y configuración Android cuando corresponda.`;

  const instructions = `Sos BUILDER, programador senior. ENTREGÁ CÓDIGO REAL de un MVP pequeño y ejecutable, no una explicación.\n\n${HARD_GATE}\n\n${stackRule}\n\nNunca cortes un archivo. Si no entra todo, simplificá el MVP. No uses claves hardcodeadas. Cada archivo debe estar completo y coherente con los demás.\n\nRespondé SOLO JSON con esta forma exacta:\n{"name":"nombre-corto","summary":"qué hace el MVP","stack":"stack breve","run":"cómo ejecutarlo","files":[{"path":"ruta/archivo.ext","content":"contenido completo"}],"notes":["nota"]}\n\nSin markdown fences, sin pseudocódigo, sin 'resto igual'.`;

  const input = `OBJETIVO:\n${goal}\n\nREGLAS:\n${rules || 'Ninguna'}\n\nPLAN INTEGRADO:\n${plan}\n\nDECISIONES Y REVISIONES:\n${(history || []).slice(-10).map(x=>`${x.role}: ${x.text}`).join('\n\n')}`;
  const raw = (await askGemini(instructions, input, {maxOutputTokens:14000,timeoutMs:75000,json:true})) || JSON.stringify({name:'demo-mvp',summary:'Proyecto demo',stack:'HTML/CSS/JS',run:'Abrir index.html',files:[{path:'index.html',content:`<!doctype html><html><body><h1>${goal}</h1></body></html>`}],notes:['Modo demo']});
  const project = extractJson(raw);
  if (!Array.isArray(project.files) || !project.files.length) throw new Error('El Builder no generó archivos.');
  project.files = project.files.slice(0,isGodotGoal?8:10).map(f=>({path:String(f.path || 'archivo.txt').replace(/^\/+/,''),content:String(f.content || '')}));
  const findings = auditProject(project, goal);
  project.audit = {passed:findings.length===0,findings};
  if (findings.length) throw new Error(`Builder rechazado por control de calidad: ${findings.join(' | ')}`);
  return project;
}

export function status() {
  return {mode:process.env.GEMINI_API_KEY?'gemini':'demo',model:process.env.GEMINI_API_KEY?PRIMARY_MODEL:'demo',github:!!process.env.GITHUB_TOKEN};
}
