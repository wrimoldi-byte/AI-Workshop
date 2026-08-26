const PRIMARY_MODEL = 'gemini-3.5-flash-lite';
const FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash'];

function parseGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map(p => typeof p?.text === 'string' ? p.text : '').filter(Boolean).join('\n').trim();
}

async function askModel(model, key, instructions, input, options = {}) {
  const timeoutMs = options.timeoutMs || 22000;
  const maxOutputTokens = options.maxOutputTokens || 900;
  const json = !!options.json;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  try {
    const generationConfig = {maxOutputTokens};
    if (json) generationConfig.responseMimeType = 'application/json';
    const r = await fetch(url, {
      method: 'POST', signal: controller.signal,
      headers: {'x-goog-api-key': key, 'content-type': 'application/json'},
      body: JSON.stringify({systemInstruction:{parts:[{text:instructions}]}, contents:[{role:'user',parts:[{text:input}]}], generationConfig})
    });
    if (!r.ok) throw new Error(`Gemini ${model} ${r.status}: ${await r.text()}`);
    const data = await r.json();
    const text = parseGeminiText(data);
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
      errors.push(msg); console.warn('Gemini fallback:', msg);
    }
  }
  throw new Error(`Gemini no respondió. ${errors.join(' | ')}`);
}

function demoAgent(role, goal, current, rules, round) {
  const base = current || `Propuesta inicial para: ${goal}`;
  if (role === 'Creador') return `${base}\n\nRonda ${round}: estructuro una solución más concreta, priorizando objetivo, usuario, flujo principal y criterios de éxito.`;
  if (role === 'Crítico') return `Crítica ronda ${round}: faltan criterios medibles, riesgos, límites y validación con usuario. Reglas activas: ${rules || 'ninguna'}.`;
  if (role === 'Especialista') return `Mejora técnica ronda ${round}: dividir en módulos, registrar decisiones, evitar bucles y conservar el mejor resultado anterior.`;
  if (role === 'Evaluador') return JSON.stringify({score:8.5,verdict:'ITERAR',reason:'Falta validar la implementación real.'});
  if (role === 'Director') return `MVP definido para ${goal}: alcance pequeño, usuario claro, flujo principal y criterio de terminado.`;
  if (role === 'Arquitecto') return 'Arquitectura mínima, ejecutable, con integraciones reales y secretos fuera del código.';
  if (role === 'Frontend') return 'Frontend responsive con estados de carga, éxito, error y validación.';
  if (role === 'Backend') return 'Backend mínimo con integración real, timeout, validación y manejo de errores.';
  if (role === 'Tester') return 'QA: rechazar mocks, TODOs, placeholders, APIs simuladas e integraciones no verificables.';
  if (role === 'Integrador') return 'Especificación integrada sin simulaciones ni piezas pendientes.';
  if (role === 'Reviewer') return JSON.stringify({score:8.4,verdict:'ITERAR',reason:'No aprobar hasta eliminar toda simulación y completar integraciones.',fixes:['Eliminar mocks y placeholders','Asegurar integración real']});
  return base;
}

const HARD_GATE = `REGLA DE TERMINADO OBLIGATORIA: un MVP NO está terminado si contiene TODO, FIXME, mock, simulación, placeholder, datos falsos, una API comentada en vez de implementada, funciones vacías, secretos hardcodeados o instrucciones del tipo "reemplazar luego". Una integración externa debe estar implementada realmente usando variables de entorno/secrets y manejo de error/timeout. Tampoco está terminado si le faltan manifiestos, dependencias o configuración necesaria para instalar, ejecutar o compilar. Si aparece cualquiera de estas señales, la nota máxima es 7.0 y el veredicto debe ser ITERAR.`;

const PROMPTS = {
  Creador: 'Sos el agente CREADOR. Proponé o reescribí la mejor solución posible. Integrá críticas y reglas. Sé concreto y accionable. No hagas preguntas al usuario.',
  Crítico: 'Sos el agente CRÍTICO. Buscá errores, contradicciones, supuestos débiles, riesgos y oportunidades de mejora. Sé exigente y breve.',
  Especialista: 'Sos el agente ESPECIALISTA/ARQUITECTO. Convertí la crítica en mejoras concretas de diseño, implementación, UX y robustez.',
  Evaluador: `Sos EVALUADOR. ${HARD_GATE} Respondé SOLO JSON válido con {"score":numero_0_a_10,"verdict":"APROBAR"|"ITERAR","reason":"texto breve"}. Aprobar solo si score >= 9.`,
  Director: `Sos DIRECTOR DE PRODUCTO. Cerrá decisiones sin preguntarle al usuario. Convertí la idea en un MVP desarrollable con criterios de aceptación verificables. ${HARD_GATE}`,
  Arquitecto: `Sos ARQUITECTO DE SOFTWARE. Diseñá la solución técnica mínima que pueda ejecutarse de verdad. Elegí stack, archivos, contratos, secretos y manejo de errores. Para Expo/React Native exigí package.json y configuración de compilación Android si el objetivo pide APK. ${HARD_GATE}`,
  Frontend: `Sos DESARROLLADOR FRONTEND. Definí una interfaz concreta, responsive y completa, con carga/error/éxito y validaciones. ${HARD_GATE}`,
  Backend: `Sos DESARROLLADOR BACKEND. Implementación real: endpoints/integraciones, validación, seguridad, secrets, timeouts y errores. No aceptes APIs simuladas. ${HARD_GATE}`,
  Tester: `Sos QA/TESTER. Intentá romper la solución. Buscá explícitamente TODO, FIXME, mock, simulación, placeholder, integraciones comentadas o ficticias, dependencias faltantes, manifiestos ausentes, configuración de build faltante, secretos inseguros y caminos no implementados. En Expo/React Native, App.js + app.config + README sin package.json es un FALLO. ${HARD_GATE}`,
  Integrador: `Sos PROGRAMADOR INTEGRADOR. Cerrá una especificación implementable y resolvé contradicciones. Indicá exactamente archivos y comportamiento. No dejes decisiones pendientes. ${HARD_GATE}`,
  Reviewer: `Sos REVIEWER TÉCNICO y tenés poder de veto. ${HARD_GATE} Revisá el estado integrado y respondé SOLO JSON válido con {"score":numero_0_a_10,"verdict":"APROBAR"|"ITERAR","reason":"texto breve","fixes":["cambio 1","cambio 2"]}. Aprobar únicamente si puede convertirse ya en un MVP funcional, instalar dependencias y compilarse sin piezas faltantes.`
};

export async function runAgent(role, goal, current, history, rules, round) {
  const input = `OBJETIVO:\n${goal}\n\nREGLAS DEL USUARIO:\n${rules || 'Ninguna'}\n\nRONDA/ITERACIÓN: ${round}\n\nESTADO ACTUAL:\n${current || 'Todavía no existe'}\n\nHISTORIAL RECIENTE:\n${(history || []).slice(-6).map(x=>`${x.role}: ${x.text}`).join('\n\n') || 'Vacío'}`;
  const timeoutMs = role === 'Reviewer' || role === 'Evaluador' ? 26000 : 22000;
  return (await askGemini(PROMPTS[role] || PROMPTS.Creador, input, {maxOutputTokens: role === 'Reviewer' || role === 'Evaluador' ? 650 : 1100, timeoutMs, json:role === 'Reviewer' || role === 'Evaluador'})) ?? demoAgent(role, goal, current, rules, round);
}

function extractJson(text) {
  try { return JSON.parse(text); } catch {}
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
  throw new Error('El Builder no devolvió JSON válido.');
}

function auditProject(project, goal = '') {
  const forbidden = /\b(TODO|FIXME|mock|simulaci[oó]n|placeholder|reemplazar\s+(con|luego)|implementar\s+luego|fake\s+data)\b/i;
  const findings = [];
  const files = project.files || [];
  const paths = files.map(f=>String(f.path||'').toLowerCase());
  const joined = files.map(f=>String(f.content||'')).join('\n');
  const stackGoal = `${project.stack||''} ${goal||''} ${joined.slice(0,30000)}`;

  for (const f of files) {
    if (forbidden.test(f.content || '')) findings.push(`${f.path}: contiene señal de implementación incompleta`);
  }

  const isNodeLike = paths.some(p=>/\.(js|jsx|ts|tsx)$/.test(p)) || /React|Next\.js|Node|Expo|React Native/i.test(stackGoal);
  if (isNodeLike && !paths.includes('package.json')) findings.push('Falta package.json: el proyecto JavaScript/TypeScript no puede instalar dependencias.');

  const isExpo = paths.some(p=>['app.config.js','app.config.ts','app.json'].includes(p)) || /\bExpo\b|React Native/i.test(stackGoal);
  if (isExpo) {
    const hasEntry = paths.some(p=>['app.js','app.jsx','app.ts','app.tsx','index.js','index.ts','index.tsx'].includes(p) || p.startsWith('src/'));
    const hasConfig = paths.some(p=>['app.config.js','app.config.ts','app.json'].includes(p));
    const hasAndroidBuild = paths.includes('eas.json') || paths.some(p=>p==='android/build.gradle' || p==='android/app/build.gradle');
    if (!hasEntry) findings.push('Expo/React Native: falta el archivo de entrada de la aplicación.');
    if (!hasConfig) findings.push('Expo/React Native: falta app.json o app.config.js/app.config.ts.');
    if (/android|apk/i.test(goal) && !hasAndroidBuild) findings.push('Expo/React Native para Android/APK: falta eas.json o configuración Gradle compilable.');
  }

  const isPython = paths.some(p=>p.endsWith('.py')) || /Python|Streamlit|FastAPI/i.test(stackGoal);
  if (isPython && !paths.includes('requirements.txt') && !paths.includes('pyproject.toml')) findings.push('Proyecto Python: falta requirements.txt o pyproject.toml.');

  return findings;
}

export async function buildProject(goal, rules, plan, history) {
  const instructions = `Sos BUILDER, programador senior. ENTREGÁ CÓDIGO REAL de un MVP pequeño y ejecutable, no una explicación.\n\n${HARD_GATE}\n\nGenerá como máximo 10 archivos. No uses claves hardcodeadas. Si hay una API externa, implementá la llamada real con variables de entorno/secrets, timeout y errores. Incluí requirements/package manifest, .gitignore y README cuando correspondan.\n\nREGLA ANDROID/EXPO: si el proyecto usa React Native o Expo, incluí obligatoriamente package.json con dependencias reales, App.js/App.tsx o entry equivalente, app.json o app.config.js y, si el objetivo pide APK/Android, eas.json o configuración Gradle capaz de compilar. NO entregues únicamente App.js + app.config + README.\n\nRespondé SOLO JSON con esta forma exacta:\n{"name":"nombre-corto","summary":"qué hace el MVP","stack":"stack breve","run":"cómo ejecutarlo","files":[{"path":"ruta/archivo.ext","content":"contenido completo"}],"notes":["nota"]}\n\nCada content debe ser el archivo COMPLETO. Sin markdown fences, sin 'resto igual', sin pseudocódigo.`;
  const input = `OBJETIVO:\n${goal}\n\nREGLAS:\n${rules || 'Ninguna'}\n\nPLAN INTEGRADO:\n${plan}\n\nDECISIONES Y REVISIONES:\n${(history || []).slice(-10).map(x=>`${x.role}: ${x.text}`).join('\n\n')}`;
  const raw = (await askGemini(instructions, input, {maxOutputTokens:9000,timeoutMs:60000,json:true})) || JSON.stringify({name:'demo-mvp',summary:'Proyecto demo',stack:'HTML/CSS/JS',run:'Abrir index.html',files:[{path:'index.html',content:`<!doctype html><html><body><h1>${goal}</h1></body></html>`}],notes:['Modo demo']});
  const project = extractJson(raw);
  if (!Array.isArray(project.files) || !project.files.length) throw new Error('El Builder no generó archivos.');
  project.files = project.files.slice(0,10).map(f=>({path:String(f.path || 'archivo.txt').replace(/^\/+/,''),content:String(f.content || '')}));
  const findings = auditProject(project, goal);
  project.audit = {passed: findings.length === 0, findings};
  if (findings.length) throw new Error(`Builder rechazado por control de calidad: ${findings.join(' | ')}`);
  return project;
}

export function status() {
  return {mode:process.env.GEMINI_API_KEY ? 'gemini' : 'demo', model:process.env.GEMINI_API_KEY ? PRIMARY_MODEL : 'demo', github:!!process.env.GITHUB_TOKEN};
}
