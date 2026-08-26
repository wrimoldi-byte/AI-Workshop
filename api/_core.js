const PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const FALLBACK_MODELS = [...new Set([PRIMARY_MODEL, 'gemini-2.5-flash-lite'])];

function parseGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map(p => typeof p?.text === 'string' ? p.text : '').filter(Boolean).join('\n').trim();
}

async function askModel(model, key, instructions, input, timeoutMs = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  try {
    const r = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {'x-goog-api-key': key, 'content-type': 'application/json'},
      body: JSON.stringify({
        systemInstruction: {parts: [{text: instructions}]},
        contents: [{role: 'user', parts: [{text: input}]}],
        generationConfig: {maxOutputTokens: 900}
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

async function askGemini(instructions, input) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const errors = [];
  for (const model of FALLBACK_MODELS) {
    try {
      return await askModel(model, key, instructions, input, 18000);
    } catch (e) {
      const msg = e?.name === 'AbortError' ? `${model}: timeout 18 s` : `${model}: ${e.message}`;
      errors.push(msg);
      console.warn('Gemini fallback:', msg);
    }
  }
  throw new Error(`Gemini no respondió a tiempo. Se probaron ${FALLBACK_MODELS.join(' y ')}. ${errors.join(' | ')}`);
}

function demoAgent(role, goal, current, rules, round) {
  const base = current || `Propuesta inicial para: ${goal}`;
  if (role === 'Creador') return `${base}\n\nRonda ${round}: estructuro una solución más concreta, priorizando objetivo, usuario, flujo principal y criterios de éxito.`;
  if (role === 'Crítico') return `Crítica ronda ${round}: faltan criterios medibles, riesgos, límites y validación con usuario. Reglas activas: ${rules || 'ninguna'}.`;
  if (role === 'Especialista') return `Mejora técnica ronda ${round}: dividir en módulos, registrar decisiones, evitar bucles y conservar el mejor resultado anterior.`;
  if (role === 'Evaluador') return JSON.stringify({score: Math.min(9.4, 6.6 + round * 0.7), verdict: round >= 4 ? 'APROBAR' : 'ITERAR', reason: 'La solución gana claridad y control de calidad con cada ronda.'});
  return base;
}

export async function runAgent(role, goal, current, history, rules, round) {
  const prompts = {
    Creador: 'Sos el agente CREADOR. Proponé o reescribí la mejor solución posible para el objetivo. Integrá críticas previas y reglas del usuario. Sé concreto, breve y accionable. No expliques tu rol.',
    Crítico: 'Sos el agente CRÍTICO. Buscá errores, contradicciones, supuestos débiles, riesgos y oportunidades de mejora. Sé exigente, específico y breve. No reescribas todo todavía.',
    Especialista: 'Sos el agente ESPECIALISTA/ARQUITECTO. Convertí la crítica en mejoras concretas de diseño, implementación, experiencia de usuario y robustez. Priorizá cambios de alto impacto y sé breve.',
    Evaluador: 'Sos el agente EVALUADOR. Evaluá la propuesta final de la ronda. Respondé SOLAMENTE JSON válido con {"score":numero_0_a_10,"verdict":"APROBAR"|"ITERAR","reason":"texto breve"}. Aprobar solo si score >= 9.'
  };
  const input = `OBJETIVO:\n${goal}\n\nREGLAS DEL USUARIO:\n${rules || 'Ninguna'}\n\nRONDA: ${round}\n\nPROPUESTA ACTUAL:\n${current || 'Todavía no existe'}\n\nHISTORIAL RECIENTE:\n${(history || []).slice(-4).map(x=>`${x.role}: ${x.text}`).join('\n\n') || 'Vacío'}`;
  return (await askGemini(prompts[role], input)) ?? demoAgent(role, goal, current, rules, round);
}

export function status() {
  return {mode: process.env.GEMINI_API_KEY ? 'gemini' : 'demo', model: process.env.GEMINI_API_KEY ? PRIMARY_MODEL : 'demo'};
}
