// Sidecar manager: spawns and supervises the Python fortune service.
const { app } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const SIDECAR_PORT = 47821;
const MAX_RESTARTS = 5;
const HEALTH_TIMEOUT = 30; // 500ms * 30 = 15s max wait

let child = null;
let restartCount = 0;
let stopping = false;
let ready = false;

function serverScriptPath() {
  // Windows: prefer a bundled PyInstaller sidecar.exe, else the python script
  if (process.platform === 'win32') {
    const exeCandidates = [
      path.join(app.getAppPath(), 'python', 'server.exe'),
      path.join(app.getAppPath(), 'resources', 'sidecar', 'server.exe'),
      path.join(__dirname, '..', '..', 'python', 'server.exe'),
    ];
    for (const p of exeCandidates) {
      try {
        require('fs').accessSync(p);
        return p;
      } catch (e) { /* try next */ }
    }
  }
  // Packaged: python/server.py lives in resources/ (asar can't be read by python)
  if (process.resourcesPath) {
    try {
      require('fs').accessSync(path.join(process.resourcesPath, 'python', 'server.py'));
      return path.join(process.resourcesPath, 'python', 'server.py');
    } catch (e) { /* try next */ }
  }
  // dev: project root /python/server.py
  const candidates = [
    path.join(app.getAppPath(), 'python', 'server.py'),
    path.join(__dirname, '..', '..', 'python', 'server.py'),
    path.join(process.cwd(), 'python', 'server.py'),
  ];
  for (const p of candidates) {
    try {
      require('fs').accessSync(p);
      return p;
    } catch (e) { /* try next */ }
  }
  return candidates[0];
}

// Find a usable python interpreter on Windows (python3 / python / py)
function findPythonCmd() {
  const { spawnSync } = require('child_process');
  for (const c of ['python3', 'python', 'py']) {
    try {
      const r = spawnSync(c, ['--version'], { timeout: 5000 });
      if (r.status === 0) return c;
    } catch (e) { /* try next */ }
  }
  return null;
}

// 内置 Windows Python 运行时（免安装零依赖）：打包后 resources/python-win/python.exe，
// 开发态 assets/python-win/python.exe。找不到回退系统 python。
function bundledPythonCmd() {
  const candidates = [
    path.join(process.resourcesPath || '', 'python-win', 'python.exe'),
    path.join(app.getAppPath(), 'assets', 'python-win', 'python.exe'),
  ];
  for (const p of candidates) {
    try {
      require('fs').accessSync(p);
      return p;
    } catch (e) { /* try next */ }
  }
  return null;
}

function requestSidecar(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: SIDECAR_PORT,
        path: urlPath,
        method,
        headers: data
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
          : {},
        timeout: 15000,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw) });
          } catch (e) {
            resolve({ status: res.statusCode, data: { raw } });
          }
        });
      }
    );
    req.on('error', (e) => reject(e));
    req.on('timeout', () => req.destroy(new Error('sidecar request timeout')));
    if (data) req.write(data);
    req.end();
  });
}

// Binary request (raw audio upload / binary response like mp3)
function requestSidecarBinary(method, urlPath, data, contentType, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: SIDECAR_PORT,
        path: urlPath,
        method,
        headers: {
          'Content-Type': contentType,
          'Content-Length': data.length,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks) }));
      }
    );
    req.on('error', (e) => reject(e));
    req.on('timeout', () => req.destroy(new Error('sidecar binary request timeout')));
    req.write(data);
    req.end();
  });
}

function checkHealth() {
  return new Promise((resolve) => {
    requestSidecar('GET', '/health')
      .then((r) => resolve(r.status === 200 && r.data && r.data.status === 'ok'))
      .catch(() => resolve(false));
  });
}

function startSidecar() {
  return new Promise((resolve) => {
    if (ready) return resolve(true);

    const script = serverScriptPath();
    let cmd;
    let args;
    if (script.toLowerCase().endsWith('.exe')) {
      cmd = script;
      args = ['--port', String(SIDECAR_PORT)];
    } else {
      // Windows 优先用内置 python-win 运行时（免安装零依赖）；找不到再回退系统 python3/python/py
      if (process.platform === 'win32') {
        const bundled = bundledPythonCmd();
        cmd = bundled || findPythonCmd() || 'python';
        if (bundled) console.log('[sidecar] using bundled python:', cmd);
      } else {
        cmd = 'python3';
      }
      args = [script, '--port', String(SIDECAR_PORT)];
    }
    console.log('[sidecar] starting:', cmd, args.join(' '));
    child = spawn(cmd, args, {
      cwd: path.dirname(path.dirname(script)),
      // 注入 userData 路径：sidecar 用它定位 tts-error.log 等诊断日志
      env: { ...process.env, WC_USER_DATA_DIR: app.getPath('userData') },
    });

    child.stdout.on('data', (d) => process.stdout.write(`[sidecar] ${d}`));
    child.stderr.on('data', (d) => process.stderr.write(`[sidecar-err] ${d}`));

    child.on('exit', (code, signal) => {
      console.log(`[sidecar] exited code=${code} signal=${signal}`);
      child = null;
      ready = false;
      if (!stopping && restartCount < MAX_RESTARTS) {
        restartCount++;
        console.log(`[sidecar] restarting (${restartCount}/${MAX_RESTARTS})...`);
        setTimeout(() => startSidecar(), 1000);
      } else if (!stopping) {
        console.error('[sidecar] giving up after', MAX_RESTARTS, 'restarts');
      }
    });

    // Health check loop
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts++;
      if (await checkHealth()) {
        clearInterval(timer);
        ready = true;
        restartCount = 0;
        console.log('[sidecar] ready');
        resolve(true);
      } else if (attempts >= HEALTH_TIMEOUT) {
        clearInterval(timer);
        console.error('[sidecar] health check timed out');
        resolve(false);
      }
    }, 500);
  });
}

function stopSidecar() {
  stopping = true;
  if (child) {
    try {
      child.kill('SIGTERM');
    } catch (e) { /* ignore */ }
    child = null;
  }
}

function isReady() {
  return ready;
}

module.exports = { startSidecar, stopSidecar, requestSidecar, requestSidecarBinary, isReady, SIDECAR_PORT };
