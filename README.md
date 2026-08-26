# AI Workshop

Laboratorio multi-agente con Gemini. Un agente crea, otro critica, otro propone mejoras y un evaluador puntúa cada ronda hasta alcanzar el objetivo de calidad.

## Variables de entorno

Crear `.env.local` para uso local o configurar estas variables en Vercel:

```env
GEMINI_API_KEY=tu_clave
GEMINI_MODEL=gemini-3.7-flash
```

`GEMINI_API_KEY` nunca debe subirse al repositorio.

## Deploy

El proyecto está preparado para Vercel con funciones serverless en `/api`.

Último ajuste: timeout corto de Gemini y mejor manejo de errores para evitar bloqueos en la deliberación.
