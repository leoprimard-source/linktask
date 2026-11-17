// 每日角色模拟：按角色真实行为调用接口，写入演示库，并输出当日效果日报
// 用法：DATA_DIR=/home/ubuntu/lt-nz-share BASE=http://localhost:3110 OUT=/home/ubuntu/qa/sim node sim/daily.js
const fs = require('fs'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
const DIR = process.env.DATA_DIR, BASE = process.env.BASE || 'http://localhost:3110', OUT = process.env.OUT || path.join(__dirname, 'out');
const dbf = fs.readdirSync(DIR).find(f => f.endsWith('.db'));
const db = new DatabaseSync(path.join(DIR, dbf), { readOnly: true });
const q = (s, ...a) => db.prepare(s).all(...a), q1 = (s, ...a) => db.prepare(s).get(...a);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
let seed = [...today].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const hash = n => ((n * 2654435761) >>> 0) / 2 ** 32;
const stat = { ok: 0, fail: 0, err: {} };
async function call(uid, p, body) {
  try {
    const r = await fetch(BASE + '/api' + p, { method: body ? 'POST' : 'GET', headers: { 'x-user-id': String(uid), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { stat.ok++; return j; }
    stat.fail++; const k = p.replace(/\d+/g, ':id') + ' ' + (j.error || r.status); stat.err[k] = (stat.err[k] || 0) + 1; return null;
  } catch (e) { stat.fail++; return null; }
}
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); })); }
const storeQ = sid => 0.78 + 0.2 * hash(sid);           // 门店执行力基线：0.78–0.98
const sms = sid => q("SELECT us.user_id id FROM user_stores us JOIN users u ON u.id=us.user_id WHERE us.store_id=? AND u.active=1", sid).map(r => r.id);

(async () => {
  const t0 = Date.now(), act = { done: 0, checked: 0, bad: 0, rsub: 0, rver: 0, patrol: 0 };
  await call(sms(1)[0] || 4, '/home');                   // 触发当天任务生成
  // 0. 职能条线：每天第一轮各条线向本区域部分门店派任务，走统一出口和店长负荷上限
  const LT = { hr_manager: ['员工档案信息核对', '新员工入职面谈'], train_manager: ['本周岗位技能抽考', '服务标准微课学习'], sales_manager: ['周末房价与渠道检查', 'OTA 点评回复'],
    dev_manager: ['门店业主满意度回访'], build_manager: ['消防设施月检拍照'], ops_manager: ['能耗抄表上报', '早餐出品抽检'] };
  if (!q1("SELECT 1 FROM flex_tasks WHERE source='line' AND substr(created_at,1,10)=? LIMIT 1", today)) {
    for (const u of q("SELECT u.id, u.region_id, r.level FROM users u JOIN roles r ON r.id=u.role_id WHERE u.active=1 AND r.level IN ('hr_manager','train_manager','sales_manager','dev_manager','build_manager','ops_manager')")) {
      const ss = q('SELECT id FROM stores WHERE region_id=?', u.region_id).map(x => x.id).filter(() => rnd() < 0.4), ts = LT[u.level];
      if (ss.length) await call(u.id, '/dispatch', { title: ts[Math.floor(rnd() * ts.length)], minutes: [10, 15, 20, 30][Math.floor(rnd() * 4)], date: today, due_time: '16:00', stores: ss, urgent: rnd() < 0.05 });
    }
  }
  // 1. 一线员工：按门店执行力完成今日任务，其余漏做
  const hm = new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 16);   // 当前时间 + 1 小时内到期的任务
  const inst = q("SELECT id, store_id, assignee_id, need_photo FROM instances WHERE date=? AND status='pending' AND assignee_id IS NOT NULL AND (due_time IS NULL OR due_time<=? OR ?='1')", today, hm, process.env.FINAL || '');
  const tpl = Object.fromEntries(q('SELECT id, need_value FROM templates').map(t => [t.id, t.need_value]));
  const nv = Object.fromEntries(q("SELECT id, src, src_id FROM instances WHERE date=?", today).map(i => [i.id, i.src === 'tpl' && tpl[i.src_id]]));
  await pool(inst.filter(i => rnd() < storeQ(i.store_id)), 16, async i => {
    if (await call(i.assignee_id, `/instances/${i.id}/complete`, { note: '模拟执行：已按标准完成', photo: i.need_photo ? PNG : undefined, reading: nv[i.id] ? String(20 + Math.round(rnd() * 10)) : undefined })) act.done++;
  });
  // 2. 店长：抽查约 8% 已完成任务，执行力弱的门店不合格率更高
  const done = q("SELECT id, store_id, assignee_id FROM instances WHERE date=? AND status='done' AND check_result IS NULL", today);
  await pool(done.filter(() => rnd() < 0.08), 8, async i => {
    const m = sms(i.store_id)[0]; if (!m) return;
    const bad = rnd() < (1 - storeQ(i.store_id)) * 1.5;
    const r = await call(m, `/instances/${i.id}/check`, bad ? { result: 'bad', comment: '模拟抽查：未达标准', rectify: { task: '按标准重做并拍照', deadline: addDays(today, 2) } } : { result: 'good', comment: '执行到位' });
    if (r) { act.checked++; if (bad) act.bad++; }
  });
  // 3. 整改：被派人提交，店长复查
  for (const r of q("SELECT id, store_id, assignee_id FROM rectifications WHERE status IN ('open','rejected')")) {
    if (rnd() < storeQ(r.store_id) * 0.6 && await call(r.assignee_id, `/rectifications/${r.id}/submit`, { note: '模拟整改：已完成并复核', photo: PNG })) act.rsub++;
  }
  for (const r of q("SELECT id, store_id FROM rectifications WHERE status='submitted'")) {
    const m = sms(r.store_id)[0]; if (!m) continue; const pass = rnd() < 0.85;
    if (await call(m, `/rectifications/${r.id}/verify`, pass ? { pass: true, comment: '复查通过' } : { pass: false, comment: '仍不达标', deadline: addDays(today, 3) })) act.rver++;
  }
  // 4. 城市总 / 教练：完成今天计划内的巡店
  const codes = q("SELECT code, title FROM templates WHERE src='audit' AND active=1").map(t => t.code);
  for (const p of q("SELECT id, store_id, created_by FROM patrols WHERE planned_date<=? AND status='planned'", today)) {
    const results = {}; for (const c of codes) if (rnd() < (1 - storeQ(p.store_id)) * 0.3) results[c] = { result: 'fail', comment: '模拟巡店：现场未达标' };
    if (await call(p.created_by, `/patrols/${p.id}/complete`, { mode: 'full', results })) act.patrol++;
  }
  // 5. 日报
  const m = d => {
    const r = q1("SELECT COUNT(*) n, SUM(status='done') d, SUM(escalated>=1) e, SUM(escalated=2) e2, SUM(check_result IS NOT NULL) c, SUM(check_result='bad') b FROM instances WHERE date=?", d);
    return { tasks: r.n, done: r.d || 0, rate: r.n ? +(100 * (r.d || 0) / r.n).toFixed(1) : 0, escalated: r.e || 0, esc2: r.e2 || 0, esc3: (() => { try { return q1('SELECT COUNT(*) n FROM esc_events WHERE date=? AND level=3', d).n; } catch { return 0; } })(), checked: r.c || 0, bad: r.b || 0 };
  };
  const rect = q1("SELECT SUM(status!='closed') open, SUM(status!='closed' AND deadline<?) late, SUM(status='closed' AND substr(verified_at,1,10)=?) closed FROM rectifications", today, today);
  const regions = q("SELECT g.name, COUNT(*) n, SUM(i.status='done') d FROM instances i JOIN stores s ON s.id=i.store_id JOIN regions g ON g.id=s.region_id WHERE i.date=? GROUP BY g.id ORDER BY 1.0*SUM(i.status='done')/COUNT(*)", today).map(r => ({ name: r.name, rate: +(100 * r.d / r.n).toFixed(1) }));
  const worst = q("SELECT s.name, COUNT(*) n, SUM(i.status='done') d, SUM(i.escalated>=1) e FROM instances i JOIN stores s ON s.id=i.store_id WHERE i.date=? GROUP BY s.id ORDER BY 1.0*SUM(i.status='done')/COUNT(*) LIMIT 10", today).map(r => ({ name: r.name, rate: +(100 * r.d / r.n).toFixed(1), escalated: r.e }));
  const ln = (() => { try { return q1("SELECT COUNT(*) n, COALESCE(SUM(deferred),0) df, COUNT(DISTINCT store_id) st FROM flex_tasks WHERE source='line' AND substr(created_at,1,10)=?", today); } catch { return { n: 0, df: 0, st: 0 }; } })();
  const ld = (() => { try { return q1("SELECT ROUND(AVG(m)) avg, MAX(m) mx, SUM(m>60) over FROM (SELECT SUM(minutes) m FROM flex_tasks WHERE source='line' AND active=1 AND start_date=? GROUP BY store_id)", today); } catch { return {}; } })();
  const rep = { date: today, lines: { ...ln, ...ld }, at: new Date().toISOString(), secs: Math.round((Date.now() - t0) / 1000), today: m(today), actions: act, rect, regions, worst, api: stat };
  const prevF = path.join(OUT, `sim-${addDays(today, -1)}.json`); if (fs.existsSync(prevF)) rep.prev = JSON.parse(fs.readFileSync(prevF)).today;
  fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, `sim-${today}.json`), JSON.stringify(rep, null, 1));
  const dv = (k, u = '') => rep.prev ? `（昨天 ${rep.prev[k]}${u}）` : '';
  const md = [`# 宏图每日模拟日报 ${today}（截至 ${new Date(Date.now() + 8 * 3600e3).toISOString().slice(11, 16)}）`, '', `- 今日任务 ${rep.today.tasks} 条，完成 ${rep.today.done} 条，完成率 ${rep.today.rate}%${dv('rate', '%')}`,
    `- 超时升级 ${rep.today.escalated} 条${dv('escalated')}（其中升到教练 ${rep.today.esc2} 条${dv('esc2')}，进城市总例外清单门店 ${rep.today.esc3} 家）；店长抽查 ${rep.today.checked} 条，不合格 ${rep.today.bad} 条`,
    `- 整改：今天闭环 ${rect.closed || 0}，未闭环 ${rect.open || 0}，其中逾期 ${rect.late || 0}`, `- 巡店完成 ${act.patrol} 次`, `- 条线统一派发 ${ln.n} 条，覆盖 ${ln.st} 家门店，因店长负荷满顺延 ${ln.df} 条；店长当天条线负荷平均 ${ld.avg ?? 0} 分钟、最高 ${ld.mx ?? 0} 分钟，超 60 分钟 ${ld.over ?? 0} 家`,
    `- 完成率最低的区域：${regions.slice(0, 3).map(r => `${r.name} ${r.rate}%`).join('、')}`, `- 完成率最低的门店：${worst.slice(0, 5).map(r => `${r.name} ${r.rate}%`).join('、')}`,
    `- 接口调用 成功 ${stat.ok} / 失败 ${stat.fail}；用时 ${rep.secs} 秒`].join('\n');
  fs.writeFileSync(path.join(OUT, `sim-${today}.md`), md); console.log(md); console.log(JSON.stringify(stat.err));
})();
