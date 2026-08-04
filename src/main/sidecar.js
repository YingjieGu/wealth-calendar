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
    console.log('[sidecar] starting:', script);
    child = spawn('python3', [script, '--port', String(SIDECAR_PORT)], {
      cwd: path.dirname(path.dirname(script)),
      env: { ...process.env },
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

module.exports = { startSidecar, stopSidecar, requestSidecar, isReady, SIDECAR_PORT };
