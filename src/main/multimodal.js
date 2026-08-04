// Multimodal pet animation: image -> animated video via Jimeng (Volcengine Seedance)
// or Kling API. Task-based: create task -> poll -> download result mp4.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

function petVideoPath() {
  return path.join(app.getPath('userData'), 'pet-animation.mp4');
}

function hasPetVideo() {
  return fs.existsSync(petVideoPath());
}

function loadSettings() {
  try {
    const p = path.join(app.getPath('userData'), 'settings.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) { /* ignore */ }
  return {};
}

async function pollTask(url, headers, intervalMs, timeoutMs, extractDone) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`poll HTTP ${res.status}: ${t.slice(0, 200)}`);
    }
    const j = await res.json();
    const done = extractDone(j);
    if (done.done) return done.result;
  }
  throw new Error('生成超时（请稍后重试）');
}

async function downloadVideo(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(petVideoPath(), buf);
  return petVideoPath();
}

// --- Jimeng / Volcengine Seedance (图生视频) ---
async function generateWithJimeng(imageDataUrl, apiKey) {
  const base = 'https://ark.cn-beijing.volces.com/api/v3';
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  // Create task (image-to-video)
  const createRes = await fetch(`${base}/contents/generations/tasks`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'doubao-seedance-1-0-pro-250528',
      content: [
        { type: 'image_url', image_url: { url: imageDataUrl } },
        { type: 'text', text: '让画面中的角色动起来，做成可爱的桌面宠物动画，动作自然有趣，背景保持透明最好' },
      ],
    }),
  });
  const createJson = await createRes.json();
  if (!createRes.ok) {
    throw new Error(`即梦创建任务失败: ${JSON.stringify(createJson).slice(0, 200)}`);
  }
  const taskId = createJson.id;
  if (!taskId) throw new Error('即梦未返回任务 ID');

  const result = await pollTask(
    `${base}/contents/generations/tasks/${taskId}`,
    headers,
    5000,
    300000,
    (j) => {
      const s = j.status;
      if (s === 'succeeded') {
        const videoUrl = j.content && (j.content.video_url || (j.content.videos && j.content.videos[0] && j.content.videos[0].url));
        return { done: true, result: videoUrl };
      }
      if (s === 'failed') throw new Error(`即梦生成失败: ${j.error || ''}`);
      return { done: false };
    }
  );
  if (!result) throw new Error('即梦未返回视频地址');
  return downloadVideo(result);
}

// --- Kling (可灵图生视频) ---
async function generateWithKling(imageDataUrl, apiKey) {
  const base = 'https://api.klingai.com';
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
  const createRes = await fetch(`${base}/v1/videos/image2video`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model_name: 'kling-v1',
      image: imageDataUrl, // data url
      duration: '5',
      cfg_scale: 0.5,
      mode: 'std',
    }),
  });
  const createJson = await createRes.json();
  if (!createRes.ok || !createJson.data || !createJson.data.task_id) {
    throw new Error(`可灵创建任务失败: ${JSON.stringify(createJson).slice(0, 200)}`);
  }
  const taskId = createJson.data.task_id;

  const videoUrl = await pollTask(
    `${base}/v1/videos/image2video/${taskId}`,
    headers,
    5000,
    300000,
    (j) => {
      const s = j.data && j.data.task_status;
      if (s === 'succeed') {
        const v = j.data.task_result && j.data.task_result.videos && j.data.task_result.videos[0];
        return { done: true, result: v && v.url };
      }
      if (s === 'failed') throw new Error(`可灵生成失败: ${(j.data && j.data.task_status_msg) || ''}`);
      return { done: false };
    }
  );
  if (!videoUrl) throw new Error('可灵未返回视频地址');
  return downloadVideo(videoUrl);
}

async function generatePetAnimation(imageDataUrl) {
  const settings = loadSettings();
  const mc = settings.multimodalConfig || {};
  const provider = mc.provider || 'jimeng';
  const apiKey = mc.apiKey || '';
  if (!apiKey) {
    return { error: 'noApiKey', message: '请先在设置中配置多模态 API Key' };
  }
  try {
    const p = provider === 'kling'
      ? await generateWithKling(imageDataUrl, apiKey)
      : await generateWithJimeng(imageDataUrl, apiKey);
    return { ok: true, path: p };
  } catch (e) {
    console.error('[multimodal] generate failed:', e.message);
    return { error: e.message };
  }
}

function clearPetAnimation() {
  try {
    if (fs.existsSync(petVideoPath())) fs.unlinkSync(petVideoPath());
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = { generatePetAnimation, clearPetAnimation, hasPetVideo, petVideoPath };
