// v0.4.20 单元测试（node 直接跑，不启动 GUI）
// 覆盖：① 话题分类/情绪分析纯函数 ② 活跃时段直方图 ③ MEMORY.md 生成器
//       ④ 容量上限（>1000 条裁剪）⑤ 应用逻辑（低落→安慰文案、低谷→降频）
//       ⑥ 设置页开关/查看 IPC 存在
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ FAIL: ' + name); }
}

// 每次用全新临时目录初始化，保证独立 + 不污染真实 userData
function freshDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-v020-'));
  return d;
}

console.log('== 1. 话题分类 classifyTopic（财运句→wealth 等） ==');
{
  const M = require('./src/main/userMemory.js');
  ok(M.classifyTopic('最近股票亏了，想多赚点钱') === 'wealth', '「股票/赚钱」→ wealth');
  ok(M.classifyTopic('老板又让我加班，项目好赶') === 'career', '「老板/加班/项目」→ career');
  ok(M.classifyTopic('和对象分手了，很难过') === 'love', '「对象/分手」→ love');
  ok(M.classifyTopic('好累啊，昨晚失眠了') === 'health', '「累/失眠」→ health');
  ok(M.classifyTopic('明天考试要复习论文') === 'study', '「考试/论文」→ study');
  ok(M.classifyTopic('下周出差机票订好了') === 'travel', '「出差/机票」→ travel');
  ok(M.classifyTopic('客户合同要签了') === 'signing', '「客户/合同/签」→ signing');
  ok(M.classifyTopic('今天天气不错，出去走走') === 'other', '无关键词命中 → other');
  ok(M.classifyTopic('') === 'other', '空文本 → other');
  ok(M.TOPIC_KEYWORDS.wealth.length >= 8, 'TOPIC_KEYWORDS 财运词 ≥8（清单完整）');
}

console.log('== 2. 情绪分析 analyzeSentiment（消极句→negative） ==');
{
  const M = require('./src/main/userMemory.js');
  ok(M.analyzeSentiment('好累啊') === 'negative', '「好累啊」→ negative（不误判好）');
  ok(M.analyzeSentiment('烦死了，这破工作') === 'negative', '「烦死了」→ negative');
  ok(M.analyzeSentiment('压力好大，失眠了') === 'negative', '「压力/失眠」→ negative');
  ok(M.analyzeSentiment('哈哈今天好开心') === 'positive', '「哈哈/开心」→ positive');
  ok(M.analyzeSentiment('今天太棒了 😊') === 'positive', '积极词+积极表情 → positive');
  ok(M.analyzeSentiment('唉 分手了 😭') === 'negative', '消极词+消极表情 → negative');
  ok(M.analyzeSentiment('今天周三，买菜做饭') === 'neutral', '中性句 → neutral');
  ok(M.analyzeSentiment('') === 'neutral', '空文本 → neutral');
  // 情绪倾向：近30条消极>40% → low
  const lowIts = [];
  for (let i = 0; i < 5; i++) lowIts.push({ type: 'chat', sentiment: 'negative' });
  for (let i = 0; i < 3; i++) lowIts.push({ type: 'chat', sentiment: 'positive' });
  ok(M.moodLevel(lowIts, 8) === 'low', '8 条中 5 消极（>40%）→ moodLevel low');
  const highIts = [];
  for (let i = 0; i < 1; i++) highIts.push({ type: 'chat', sentiment: 'negative' });
  for (let i = 0; i < 7; i++) highIts.push({ type: 'chat', sentiment: 'positive' });
  ok(M.moodLevel(highIts, 8) === 'high', '8 条中 1 消极（<20%）→ moodLevel high');
  ok(M.moodLevel([]) === 'unknown', '无聊天数据 → unknown');
}

console.log('== 3. 活跃时段直方图 hourHistogram / activeHours / 低谷 ==');
{
  const M = require('./src/main/userMemory.js');
  const its = [
    { type: 'chat', hour: 9 }, { type: 'chat', hour: 9 }, { type: 'chat', hour: 9 },
    { type: 'pet', hour: 21 }, { type: 'pet', hour: 21 },
    { type: 'startup', hour: 2 },
  ];
  const hist = M.hourHistogram(its);
  ok(hist.length === 24, '直方图覆盖 0-23 共 24 个槽位');
  ok(hist[9].count === 3 && hist[21].count === 2 && hist[2].count === 1, 'hour 9/21/2 计数正确');
  ok(hist.reduce((s, h) => s + h.count, 0) === its.length, '直方图总和=交互数');
  ok(M.activeHours(its, 3).join(',') === '9,21,2', 'activeHours top3 = 9,21,2（降序）');
  ok(M.activeHours(its, 1).join(',') === '9', 'activeHours top1 = 9');
  ok(M.activeHours([], 3).length === 0, '空数据 → 无活跃时段');
  ok(M.isLowActivityHour(23) === true && M.isLowActivityHour(3) === true && M.isLowActivityHour(5) === false && M.isLowActivityHour(12) === false, '低谷时段 23-5 判定正确');
}

console.log('== 4. MEMORY.md 生成器（合法 markdown + 时间/占比/服务经验） ==');
{
  const M = require('./src/main/userMemory.js');
  const now = new Date('2026-08-07T18:30:00');
  const its = [
    { type: 'startup', ts: '2026-08-01T09:00:00.000Z', hour: 9, weekday: 6 },
    { type: 'chat', ts: '2026-08-07T09:10:00.000Z', hour: 9, weekday: 5, text: '老板又让我加班', topic: 'career', sentiment: 'negative' },
    { type: 'chat', ts: '2026-08-07T09:12:00.000Z', hour: 9, weekday: 5, text: '好累啊', topic: 'health', sentiment: 'negative' },
    { type: 'chat', ts: '2026-08-07T14:00:00.000Z', hour: 14, weekday: 5, text: '哈哈今天财运不错', topic: 'wealth', sentiment: 'positive' },
    { type: 'chat', ts: '2026-08-07T20:00:00.000Z', hour: 20, weekday: 5, text: '钱赚到了真开心', topic: 'wealth', sentiment: 'positive' },
    { type: 'fortune', ts: '2026-08-07T21:00:00.000Z', hour: 21, weekday: 5 },
    { type: 'stick', ts: '2026-08-07T21:30:00.000Z', hour: 21, weekday: 5 },
  ];
  const md = M.summarizeMemory({ interactions: its, dailyStats: {} }, { now, mainWish: '' });
  ok(typeof md === 'string' && md.length > 100, '生成内容非空');
  ok(md.startsWith('# 🧠 用户记忆体'), '标题为合法 markdown H1');
  ok(md.includes('## 📊 使用习惯') && md.includes('## 🎯 所求方向') && md.includes('## 💬 对话情绪') && md.includes('## 🤝 服务经验'), '四个 section 齐全');
  ok(/最后更新：2026-08-07 18:30/.test(md), '含「最后更新」时间');
  ok(/已陪伴 \d+ 天/.test(md), '含「已陪伴 N 天」');
  ok(/财运（\d+%）/.test(md), '含话题占比（财运 50%）');
  ok(/积极 \d+%/.test(md) && /消极 \d+%/.test(md), '含情绪占比');
  ok(md.includes('最近一次低落：') && md.includes('好累啊'), '含最近一次低落引用文本');
  ok(md.includes('- 喜欢简短的运势提醒，讨厌长篇播报'), '服务经验规则模板存在');
  ok(md.includes('- 财运话题回复要具体'), '服务经验财运模板存在');
  ok(md.split('\n').every((l) => /^#|^>|^- |^$/.test(l)), '每行均为合法 markdown（标题/引用/列表/空行）');
  // mainWish 指定时主求标注
  const md2 = M.summarizeMemory({ interactions: its, dailyStats: {} }, { now, mainWish: 'wealth' });
  ok(md2.includes('主求：求财（设置指定）'), 'mainWish 指定 → 主求标注「设置指定」');
}

console.log('== 5. 容量上限（>1000 条裁剪） + 持久化 ==');
{
  const M = require('./src/main/userMemory.js');
  const d = freshDir();
  M.setDataDir(d);
  M.setEnabled(true);
  M.init({ dir: d });
  for (let i = 0; i < 1005; i++) M.trackInteraction({ type: 'chat', text: `消息${i}`, topic: 'wealth', sentiment: 'positive' });
  const mem = M.getMemory();
  ok(mem.interactions.length === 1000, `裁剪后保留最近 1000 条（实际 ${mem.interactions.length}）`);
  ok(mem.interactions[0].text === '消息5', '最早的保留项是第 6 条（消息5），旧 5 条被裁剪');
  ok(mem.interactions[999].text === '消息1004', '最新的保留项是最后一条');
  ok(fs.existsSync(path.join(d, 'userMemory.json')), 'userMemory.json 已写入指定目录');
  // 重新加载仍为 1000 条（持久化生效）
  M.init({ dir: d });
  ok(M.getMemory().interactions.length === 1000, '重载后仍 1000 条（落盘成功）');
  // MEMORY.md 生成 + 读取
  const md = M.refreshMemoryMd({ mainWish: '' });
  ok(typeof md === 'string' && md.includes('## 📊 使用习惯'), 'refreshMemoryMd 生成 MEMORY.md 内容');
  ok(fs.existsSync(path.join(d, 'MEMORY.md')), 'userData/MEMORY.md 已写盘');
  const rd = M.readMemoryMd();
  ok(rd && rd.includes('# 🧠 用户记忆体'), 'readMemoryMd 能读回 MEMORY.md');
}

console.log('== 6. 应用逻辑（低落→安慰文案、低谷→降频、主求推断） ==');
{
  const M = require('./src/main/userMemory.js');
  // 低落 → 安慰文案（仅纯函数，不依赖注入数据）
  M.setDataDir(freshDir());
  M.init({ dir: freshDir() });
  const downIts = [
    { type: 'chat', sentiment: 'negative' },
    { type: 'chat', sentiment: 'negative' },
    { type: 'chat', sentiment: 'positive' },
  ];
  ok(M.isFeelingDown(downIts, 3) === true, '近 3 条含 2 条消极 → 判定低落');
  ok(M.isFeelingDown([{ type: 'chat', sentiment: 'negative' }], 3) === false, '仅 1 条消极 → 未达 2+ 阈值');
  ok(M.isFeelingDown([{ type: 'chat', sentiment: 'positive' }, { type: 'chat', sentiment: 'positive' }], 3) === false, '全部积极 → 不低落');
  // comfortPayload 文案（白盒：直接测底层判定 + 文案常量存在）
  const comfortDeep = { deep: true, text: '深夜了还在忙吗？小财知道主人心里压着事，慢慢说出来，小财都听着~ 🌙' };
  const comfortDay = { deep: false, text: '主人是不是遇到烦心事了？小财在呢，说出来会好受些~' };
  const src = fs.readFileSync(require.resolve('./src/main/userMemory.js'), 'utf8');
  ok(src.includes(comfortDeep.text), '深夜+低落 → 加强版安慰文案');
  ok(src.includes(comfortDay.text), '白天低落 → 常规安慰文案');
  // 低谷时段 → 降频（捣蛋不触发 / 日常台词降频）
  const prankSrc = fs.readFileSync(path.join(__dirname, 'src/main/prank.js'), 'utf8');
  ok(prankSrc.includes('userMemory.isLowActivityHour()'), '捣蛋排程接入了低谷判定（不触发）');
  ok(prankSrc.includes('userMemory.isHighActivityHour()'), '捣蛋排程接入了活跃时段（间隔略短）');
  const petSrc = fs.readFileSync(path.join(__dirname, 'src/renderer/pet.js'), 'utf8');
  ok(/quiet \? 0\.3 : 0\.8/.test(petSrc), '渲染层日常台词低谷降频（80%→30%）');
  ok(petSrc.includes('.memoryTrack('), 'onInteract 接入 memoryTrack 上报');
  ok(petSrc.includes('onMemoryComfort'), '渲染层监听 memory-comfort 安慰气泡');
  ok(petSrc.includes('PRIORITY.user'), '安慰气泡走用户优先级');
  // 主求推断：mainWish 空 → 话题频率
  const chatIts = [
    { type: 'chat', topic: 'wealth' }, { type: 'chat', topic: 'wealth' }, { type: 'chat', topic: 'career' },
  ];
  ok(M.inferMainWish('peace', chatIts) === 'peace', '显式 mainWish 优先');
  ok(M.inferMainWish('', chatIts) === 'wealth', 'mainWish 空 → 按话题频率推断 wealth');
  ok(M.inferMainWish('recommend', chatIts) === 'wealth', "'recommend' 视为空 → 记忆推断");
  ok(M.inferMainWish('', []) === null, '无数据 → 推断为空');
  ok(M.topicToWish('travel') === 'peace' && M.topicToWish('signing') === 'career', '出行→求平安、签约→求事业');
  // 主求侧重在 fortuneEngine 的接入
  const fe = fs.readFileSync(path.join(__dirname, 'src/main/fortuneEngine.js'), 'utf8');
  ok(fe.includes('userMemory.inferredWish'), 'fortuneEngine mainWish 空时用记忆推断');
}

console.log('== 7. 设置页开关/查看 IPC 存在 ==');
{
  const pre = fs.readFileSync(path.join(__dirname, 'src/preload/preload.js'), 'utf8');
  ok(pre.includes('memoryTrack'), 'preload 桥 memoryTrack 存在');
  ok(pre.includes('memoryView'), 'preload 桥 memoryView 存在');
  ok(pre.includes('memoryState'), 'preload 桥 memoryState 存在');
  ok(pre.includes('onMemoryComfort'), 'preload 桥 onMemoryComfort 存在');
  const main = fs.readFileSync(path.join(__dirname, 'src/main/main.js'), 'utf8');
  ok(main.includes("'memory:track'"), '主进程 memory:track IPC 注册');
  ok(main.includes("'memory:view'"), '主进程 memory:view IPC 注册（查看记忆）');
  ok(main.includes("'memory:state'"), '主进程 memory:state IPC 注册（活跃时段）');
  ok(main.includes("'memory-comfort'"), '主进程 memory-comfort 事件发送（低落安慰）');
  ok(main.includes('userMemory.trackStartup()'), '启动采集挂钩');
  ok(main.includes('userMemory.refreshMemoryMd'), '退出刷新 MEMORY.md 挂钩');
  const html = fs.readFileSync(path.join(__dirname, 'src/renderer/index.html'), 'utf8');
  ok(html.includes('🧠 用户记忆体'), '设置页记忆体板块标题');
  ok(html.includes('记录你的使用习惯与情绪，让提醒更贴心 · 仅存本机不上传'), '设置页说明文案（隐私本地化）');
  ok(html.includes('btn-view-memory'), '查看记忆按钮存在');
  ok(html.includes('memory-preview'), '记忆预览框存在');
  const st = fs.readFileSync(path.join(__dirname, 'src/renderer/settings.js'), 'utf8');
  ok(st.includes('userMemoryEnabled'), 'settings.js 读取 userMemoryEnabled 开关');
  ok(st.includes('memoryView()'), 'settings.js 调用 memoryView 读取记忆');
  // 聊天采集在 chatEngine 入口（覆盖技能路径）
  const ce = fs.readFileSync(path.join(__dirname, 'src/main/chatEngine.js'), 'utf8');
  ok(ce.includes('userMemory.trackChat'), 'chatEngine 入口采集聊天消息');
}

console.log(`\n结果：${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
