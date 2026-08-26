const GH = 'https://api.github.com';

export function githubConfigured(){ return !!process.env.GITHUB_TOKEN; }

export async function gh(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GitHub no está configurado. Falta GITHUB_TOKEN en Vercel.');
  const r = await fetch(`${GH}${path}`, {
    ...options,
    headers: {
      'accept':'application/vnd.github+json',
      'authorization':`Bearer ${token}`,
      'x-github-api-version':'2022-11-28',
      'user-agent':'AI-Workshop',
      ...(options.headers || {})
    }
  });
  if (r.status === 204) return null;
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${typeof data === 'string' ? data : (data?.message || text)}`);
  return data;
}

export function safeExeName(name='AIWorkshopApp') {
  const n = String(name).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40);
  return n || 'AIWorkshopApp';
}

export function buildSupportFiles(project) {
  const files = project?.files || [];
  const app = files.find(f => f.path === 'app.py');
  if (!app) return {supported:false, reason:'La compilación .EXE automática está disponible para proyectos Python con app.py.'};
  const isStreamlit = /\bimport\s+streamlit\b|\bfrom\s+streamlit\b/.test(app.content || '');
  const exe = safeExeName(project.name || 'AIWorkshopApp');
  if (!isStreamlit) {
    return {supported:true, exeName:exe, files:[{path:'.github/workflows/build-windows.yml',content:`name: Build Windows EXE\non:\n  workflow_dispatch:\npermissions:\n  contents: read\njobs:\n  build:\n    runs-on: windows-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-python@v5\n        with:\n          python-version: '3.12'\n      - name: Install dependencies\n        shell: pwsh\n        run: |\n          python -m pip install --upgrade pip\n          if (Test-Path requirements.txt) { pip install -r requirements.txt }\n          pip install pyinstaller\n      - name: Build EXE\n        run: pyinstaller --noconfirm --clean --onefile --name ${exe} app.py\n      - uses: actions/upload-artifact@v4\n        with:\n          name: ${exe}-windows\n          path: dist/${exe}.exe\n          if-no-files-found: error\n`}]};
  }
  const usesCloudinary = /\bcloudinary\b/i.test(app.content || '');
  const cloudinaryFlag = usesCloudinary ? ' --collect-all cloudinary' : '';
  const launcher = `import os\nimport sys\nimport threading\nimport webbrowser\nfrom streamlit.web import cli as stcli\n\ndef resource_path(name):\n    base = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))\n    return os.path.join(base, name)\n\ndef main():\n    app = resource_path('app.py')\n    threading.Timer(2.0, lambda: webbrowser.open('http://localhost:8501')).start()\n    sys.argv = ['streamlit', 'run', app, '--server.headless=true', '--server.port=8501', '--browser.gatherUsageStats=false']\n    raise SystemExit(stcli.main())\n\nif __name__ == '__main__':\n    main()\n`;
  const workflow = `name: Build Windows EXE\non:\n  workflow_dispatch:\npermissions:\n  contents: read\njobs:\n  build:\n    runs-on: windows-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-python@v5\n        with:\n          python-version: '3.12'\n      - name: Install dependencies\n        shell: pwsh\n        run: |\n          python -m pip install --upgrade pip\n          pip install -r requirements.txt\n          pip install pyinstaller\n      - name: Build Streamlit EXE\n        shell: pwsh\n        run: pyinstaller --noconfirm --clean --onefile --name ${exe} --collect-all streamlit --collect-all cv2 --collect-all numpy --collect-all PIL --collect-all requests${cloudinaryFlag} --hidden-import streamlit.web.cli --add-data "app.py;." launcher.py\n      - uses: actions/upload-artifact@v4\n        with:\n          name: ${exe}-windows\n          path: dist/${exe}.exe\n          if-no-files-found: error\n`;
  return {supported:true, exeName:exe, files:[{path:'launcher.py',content:launcher},{path:'.github/workflows/build-windows.yml',content:workflow}]};
}
