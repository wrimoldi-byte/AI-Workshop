import JSZip from 'jszip';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  try {
    const project = req.body?.project;
    if (!project?.files?.length) return res.status(400).json({error:'No hay archivos para empaquetar.'});
    const zip = new JSZip();
    for (const file of project.files.slice(0, 20)) {
      const path = String(file.path || 'archivo.txt').replace(/^\/+/, '').replace(/\.\./g, '_');
      zip.file(path, String(file.content || ''));
    }
    const readme = [
      `# ${project.name || 'Proyecto'}`,
      '',
      project.summary || '',
      '',
      `Stack: ${project.stack || 'No especificado'}`,
      '',
      `Cómo ejecutar: ${project.run || 'Ver archivos del proyecto'}`,
      '',
      ...(project.notes || []).map(n => `- ${n}`)
    ].join('\n');
    if (!project.files.some(f => String(f.path).toLowerCase() === 'readme.md')) zip.file('README.md', readme);
    const buffer = await zip.generateAsync({type:'nodebuffer', compression:'DEFLATE'});
    const safe = String(project.name || 'proyecto').replace(/[^a-z0-9-_]+/gi,'-').replace(/^-+|-+$/g,'') || 'proyecto';
    res.setHeader('Content-Type','application/zip');
    res.setHeader('Content-Disposition',`attachment; filename="${safe}.zip"`);
    res.status(200).send(buffer);
  } catch (e) {
    console.error('package error', e);
    res.status(500).json({error:e.message || 'No se pudo crear el ZIP.'});
  }
}
