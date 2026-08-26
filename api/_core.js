const PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const FALLBACK_MODELS = [...new Set([PRIMARY_MODEL, 'gemini-2.5-flash-lite'])];

function parseGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map(p => typeof p?.text === 'string' ? p.text : '').filter(Boolean).join('\n').trim();
}

async function askModel(model, key, instructions, input, options = {}) {
  const timeoutMs = options.timeoutMs || 18000;
  const maxOutputTokens = options.maxOutputTokens || 900;
  const json = !!options.json;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  try {
    const generationConfig = {maxOutputTokens};
    if (json) generationConfig.responseMimeType = 'application/json';
    const r = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {'x-goog-api-key': key, 'content-type': 'application/json'},
      body: JSON.stringify({
        systemInstruction: {parts: [{text: instructions}]},
        contents: [{role: 'user', parts: [{text: input}]}],
        generationConfig
      })
    });
    if (!r.ok) throw new Error(`Gemini ${model} ${r.status}: ${await r.text()}`);
    const data = await r.json();
    const text = parseGeminiText(data);
    if (!text) throw new Error(`Gemini ${model} respondió sin texto utilizable.`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function askGemini(instructions, input, options = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const errors = [];
  for (const model of FALLBACK_MODELS) {
    try {
      return await askModel(model, key, instructions, input, options);
    } catch (e) {
      const seconds = Math.round((options.timeoutMs || 18000) / 1000);
      const msg = e?.name === 'AbortError' ? `${model}: timeout ${seconds} s` : `${model}: ${e.message}`;
      errors.push(msg);
      console.warn('Gemini fallback:', msg);
    }
  }
  throw new Error(`Gemini no respondió. ${errors.join(' | ')}`);
}

function demoAgent(role, goal, current, rules, round) {
  const base = current || `Propuesta inicial para: ${goal}`;
  if (role === 'Creador') return `${base}\n\nRonda ${round}: estructuro una solución más concreta, priorizando objetivo, usuario, flujo principal y criterios de éxito.`;
  if (role === 'Crítico') return `Crítica ronda ${round}: faltan criterios medibles, riesgos, límites y validación con usuario. Reglas activas: ${rules || 'ninguna'}.`;
  if (role === 'Especialista') return `Mejora técnica ronda ${round}: dividir en módulos, registrar decisiones, evitar bucles y conservar el mejor resultado anterior.`;
  if (role === 'Evaluador') return JSON.stringify({score: Math.min(9.4, 6.6 + round * 0.7), verdict: round >= 4 ? 'APROBAR' : 'ITERAR', reason: 'La solución gana claridad y control de calidad con cada ronda.'});
  if (role === 'Director') return `MVP definido para ${goal}: alcance pequeño, usuario claro, flujo principal y criterio de terminado.`;
  if (role === 'Arquitecto') return 'Arquitectura: frontend simple, backend mínimo solo si hace falta, pocos archivos y dependencias justificadas.';
  if (role === 'Frontend') return 'Frontend: una pantalla principal, estados de carga/error, diseño responsive y flujo completo del usuario.';
  if (role === 'Backend') return 'Backend: endpoints mínimos, validación de entradas y variables de entorno para secretos.';
  if (role === 'Tester') return 'Pruebas: validar camino feliz, entradas vacías, errores de red y estados de carga.';
  if (role === 'Integrador') return 'Plan integrado listo para implementar como MVP ejecutable.';
  if (role === 'Reviewer') return JSON.stringify({score: 8.7, verdict: 'ITERAR', reason: 'Buen MVP; falta pulir un caso de error y simplificar una dependencia.'});
  return base;
}

const PROMPTS = {
  Creador: 'Sos el agente CREADOR. Proponé o reescribí la mejor solución posible para el objetivo. Integrá críticas previas y reglas del usuario. Sé concreto, breve y accionable. No hagas preguntas al usuario: resolvé las decisiones razonables vos mismo.',
  Crítico: 'Sos el agente CRÍTICO. Buscá errores, contradicciones, supuestos débiles, riesgos y oportunidades de mejora. Sé exigente, específico y breve. No reescribas todo todavía.',
  Especialista: 'Sos el agente ESPECIALISTA/ARQUITECTO. Convertí la crítica en mejoras concretas de diseño, implementación, experiencia de usuario y robustez. Priorizá cambios de alto impacto y sé breve.',
  Evaluador: 'Sos el agente EVALUADOR. Evaluá la propuesta final de la ronda. Respondé SOLAMENTE JSON válido con {"score":numero_0_a_10,"verdict":"APROBAR"|"ITERAR","reason":"texto breve"}. Aprobar solo si score >= 9.',
  Director: 'Sos DIRECTOR DE PRODUCTO. Cerrá decisiones sin preguntarle al usuario. Convertí la idea en un MVP desarrollable: usuario, problema, alcance, flujo principal, criterios de aceptación y qué queda fuera. Evitá sobreingeniería.',
  Arquitecto: 'Sos ARQUITECTO DE SOFTWARE. Diseñá la solución técnica mínima que pueda ejecutarse de verdad. Elegí stack, estructura de archivos, contratos y manejo de errores. Preferí tecnologías simples y gratuitas. No inventes servicios pagos si no son necesarios.',
  Frontend: 'Sos DESARROLLADOR FRONTEND. Definí la interfaz y comportamiento concretos del MVP: pantallas, componentes, estados, responsive, accesibilidad y validaciones. Debe poder implementarse con pocos archivos.',
  Backend: 'Sos DESARROLLADOR BACKEND. Definí solo el backend que realmente haga falta: endpoints, datos, validación, seguridad, variables de entorno y límites. Si el MVP puede ser solo frontend, decilo explícitamente.',
  Tester: 'Sos QA/TESTER. Intentá romper la solución. Enumerá fallos funcionales, técnicos y de UX de mayor impacto, y pruebas concretas que el código final debe superar.',
  Integrador: 'Sos PROGRAMADOR INTEGRADOR. Tomá arquitectura, frontend, backend y pruebas previas y cerrá una especificación implementable. Resolvé contradicciones. Indicá exactamente qué archivos debe generar el Builder y qué debe hacer cada uno. No hagas preguntas.',
  Reviewer: 'Sos REVIEWER TÉCNICO. Evaluá si el plan integrado puede convertirse ya en un MVP funcional. Respondé SOLAMENTE JSON válido con {"score":numero_0_a_10,"verdict":"APROBAR"|"ITERAR","reason":"texto breve","fixes":["cambio 1","cambio 2"]}. Aprobar solo si score >= 9.'
};

export async function runAgent(role, goal, current, history, rules, round) {
  const input = `OBJETIVO:\n${goal}\n\nREGLAS DEL USUARIO:\n${rules || 'Ninguna'}\n\nRONDA/ITERACIÓN: ${round}\n\nESTADO ACTUAL:\n${current || 'Todavía no existe'}\n\nHISTORIAL RECIENTE:\n${(history || []).slice(-6).map(x=>`${x.role}: ${x.text}`).join('\n\n') || 'Vacío'}`;
  return (await askGemini(PROMPTS[role] || PROMPTS.Creador, input, {maxOutputTokens: role === 'Reviewer' || role === 'Evaluador' ? 500 : 1000, timeoutMs: 18000, json: role === 'Reviewer' || role === 'Evaluador'})) ?? demoAgent(role, goal, current, rules, round);
}

function extractJson(text) {
  try { return JSON.parse(text); } catch {}
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
  throw new Error('El Builder no devolvió JSON válido.');
}

export async function buildProject(goal, rules, plan, history) {
  const instructions = `Sos BUILDER, un programador senior. Tenés que ENTREGAR CÓDIGO REAL de un MVP pequeño y ejecutable, no una explicación.\n\nGenerá como máximo 8 archivos y mantené el proyecto compacto. Preferí HTML/CSS/JS puro o una estructura Node mínima salvo que el plan exija otra cosa. No uses claves secretas hardcodeadas. Todo lo necesario para probar debe estar incluido o explicado en README.\n\nRespondé SOLO JSON con esta forma exacta:\n{"name":"nombre-corto","summary":"qué hace el MVP","stack":"stack breve","run":"cómo ejecutarlo","files":[{"path":"ruta/archivo.ext","content":"contenido completo"}],"notes":["nota"]}\n\nCada content debe ser el archivo COMPLETO. No uses markdown fences. No omitas código con comentarios tipo 'resto igual'.`;
  const input = `OBJETIVO:\n${goal}\n\nREGLAS:\n${rules || 'Ninguna'}\n\nPLAN INTEGRADO:\n${plan}\n\nDECISIONES Y REVISIONES:\n${(history || []).slice(-10).map(x=>`${x.role}: ${x.text}`).join('\n\n')}`;
  const raw = (await askGemini(instructions, input, {maxOutputTokens: 7000, timeoutMs: 45000, json: true})) || JSON.stringify({name:'demo-mvp',summary:'Proyecto demo',stack:'HTML/CSS/JS',run:'Abrir index.html',files:[{path:'index.html',content:`<!doctype html><html><body><h1>${goal}</h1></body></html>`}],notes:['Modo demo']});
  const project = extractJson(raw);
  if (!Array.isArray(project.files) || !project.files.length) throw new Error('El Builder no generó archivos.');
  project.files = project.files.slice(0, 8).map(f => ({path: String(f.path || 'archivo.txt').replace(/^\/+/, ''), content: String(f.content || '')}));
  return project;
}

export function status() {
  return {mode: process.env.GEMINI_API_KEY ? 'gemini' : 'demo', model: process.env.GEMINI_API_KEY ? PRIMARY_MODEL : 'demo'};
}
