# AI Workshop

Laboratorio multi-agente con Gemini. Tiene dos modos:

- **Modo Ideas**: propone, critica, mejora y evalúa.
- **Modo Desarrollo**: define requisitos, arquitectura, frontend, backend, QA, revisión técnica y luego genera archivos reales del MVP.

El Modo Desarrollo aplica una regla de terminado estricta: no aprueba proyectos con `TODO`, mocks, simulaciones, placeholders, APIs ficticias, funciones vacías o secretos hardcodeados.

## Variables de entorno

Configurar en Vercel:

```env
GEMINI_API_KEY=tu_clave
GEMINI_MODEL=gemini-3.1-flash-lite
GITHUB_TOKEN=tu_token_de_github
```

Nunca subir estas claves al repositorio.

### Permisos de GitHub

Para publicar proyectos y compilar ejecutables, el token debe poder:

- leer/escribir contenido de repositorios;
- crear commits;
- ejecutar GitHub Actions;
- crear un repositorio en la cuenta del usuario si se quiere usar la creación automática.

Conviene limitar el token a los repositorios necesarios y usar el menor alcance posible.

## Publicación y ejecutable

Después de generar un MVP, AI Workshop puede:

1. crear o actualizar un repositorio de GitHub;
2. subir todos los archivos generados en un commit;
3. agregar automáticamente un workflow `build-windows.yml` para proyectos Python/Streamlit;
4. lanzar GitHub Actions;
5. mostrar el estado del build;
6. enlazar al artifact que contiene el `.exe` cuando la compilación termina.

Para Streamlit se genera un launcher local que abre la aplicación en el navegador y se empaqueta con PyInstaller.

## Deploy

El proyecto está preparado para Vercel con funciones serverless en `/api` y despliegue automático desde `main`.
