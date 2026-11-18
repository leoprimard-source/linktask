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
const GATE_H = fs.existsSync(path.join(DIR, 'gate-code.txt')) ? { 'x-gate': fs.readFileSync(path.join(DIR, 'gate-code.txt'), 'utf8').trim() } : {};
const stat = { ok: 0, fail: 0, err: {} };
async function call(uid, p, body, app) {
  try {
    const r = await fetch(BASE + '/api' + p, { method: body ? 'POST' : 'GET', headers: { 'x-user-id': String(uid), 'content-type': 'application/json', ...GATE_H, ...(app ? { 'x-app': '1' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { stat.ok++; return j; }
    stat.fail++; const k = p.replace(/\d+/g, ':id') + ' ' + (j.error || r.status); stat.err[k] = (stat.err[k] || 0) + 1; return null;
  } catch (e) { stat.fail++; return null; }
}
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); })); }
const tryQ2 = (s, ...x) => { try { return q(s, ...x); } catch { return []; } };
const storeQ = sid => 0.78 + 0.2 * hash(sid);           // 门店执行力基线：0.78–0.98
const sms = sid => q("SELECT us.user_id id FROM user_stores us JOIN users u ON u.id=us.user_id WHERE us.store_id=? AND u.active=1", sid).map(r => r.id);

(async () => {
  const t0 = Date.now(), act = { done: 0, checked: 0, bad: 0, rsub: 0, rver: 0, patrol: 0, asg: 0 };
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
  // 0.5 店长：按班派单找不到在班人员的任务，店长按门店执行力指派给本店员工
  const ua = q("SELECT id, store_id FROM instances WHERE date=? AND status='pending' AND assignee_id IS NULL", today);
  await pool(ua.filter(i => rnd() < storeQ(i.store_id)), 8, async i => {
    const m = sms(i.store_id)[0], ss = q("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.store_id=? AND u.active=1 AND r.level='staff'", i.store_id);
    if (m && ss.length && await call(m, `/instances/${i.id}/reassign`, { user_id: ss[Math.floor(rnd() * ss.length)].id })) act.asg++;
  });
  // 1. 一线员工：按门店执行力完成今日任务，其余漏做
  const hm = new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 16);   // 当前时间 + 1 小时内到期的任务
  const inst = q("SELECT id, store_id, assignee_id, need_photo FROM instances WHERE date=? AND status='pending' AND assignee_id IS NOT NULL AND (due_time IS NULL OR due_time<=? OR ?='1')", today, hm, process.env.FINAL || '');
  const tpl = Object.fromEntries(q('SELECT id, need_value FROM templates').map(t => [t.id, t.need_value]));
  const nv = Object.fromEntries(q("SELECT id, src, src_id FROM instances WHERE date=?", today).map(i => [i.id, i.src === 'tpl' && tpl[i.src_id]]));
  await pool(inst.filter(i => rnd() < storeQ(i.store_id)), 16, async i => {
    // 执行力弱的门店里，一部分人在 App 里连着点完成、少数人交旧照片，用来检验异常标记
    const lazy = storeQ(i.store_id) < 0.84 && hash(i.assignee_id) < 0.3, oldp = lazy && i.need_photo && rnd() < 0.15;
    if (await call(i.assignee_id, `/instances/${i.id}/complete`, { note: '模拟执行：已按标准完成', photo: i.need_photo ? PNG : undefined, reading: nv[i.id] ? String(20 + Math.round(rnd() * 10)) : undefined, _pm: oldp ? [{ age: 600 + Math.round(rnd() * 3000) }] : undefined }, lazy)) act.done++;
  });
  // 1b. 带教：员工学推来的微课；店长对学完的人复查一次；问题集中的店安排晨会微课，区域负责人安排支持
  const ck = { learn: 0, ver: 0, verBad: 0, brief: 0, acc: 0, sdone: 0 };
  await pool(tryQ2("SELECT id, user_id, store_id FROM learns WHERE status='todo'").filter(l => rnd() < storeQ(l.store_id) * 0.6), 8, async l => { if (await call(l.user_id, `/learn/${l.id}/done`, { note: '' })) ck.learn++; });
  await pool(tryQ2("SELECT l.store_id, (SELECT i.id FROM instances i WHERE i.assignee_id=l.user_id AND i.src=l.src AND i.src_id=l.src_id AND i.status='done' AND i.check_result IS NULL AND i.done_at>=l.done_at ORDER BY i.date DESC LIMIT 1) inst FROM learns l WHERE l.status='done' AND l.src IS NOT NULL").filter(l => l.inst && rnd() < 0.7), 8, async l => {
    const m = sms(l.store_id)[0]; if (!m) return; const bad = rnd() < (1 - storeQ(l.store_id)) * 0.6; // 学过之后不合格的可能性比平时低
    if (await call(m, `/instances/${l.inst}/check`, bad ? { result: 'bad', comment: '模拟复查：学后仍未达标准', rectify: { task: '由师傅带着重做一遍', deadline: addDays(today, 2) } } : { result: 'good', comment: '学后复查：已达标准' })) { ck.ver++; if (bad) ck.verBad++; }
  });
  for (const s of tryQ2("SELECT s.id, s.store_id, s.status, s.brief_n, s.owner_id, s.plan_date, st.region_id FROM supports s JOIN stores st ON st.id=s.store_id WHERE s.status!='done'")) {
    const m = sms(s.store_id)[0];
    if (s.brief_n == null && m && rnd() < 0.5 && await call(m, `/supports/${s.id}/brief`, {})) ck.brief++;
    if (s.status === 'open' && rnd() < 0.4) {
      const ow = ['train_manager', 'ops_manager', 'region_manager'].map(lv => q1("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.region_id=? AND r.level=? AND u.active=1", s.region_id, lv)).find(Boolean);
      if (ow && await call(ow.id, `/supports/${s.id}/accept`, { plan: ['线上辅导', '到店带训', '安排到标杆店跟班'][Math.floor(rnd() * 3)], plan_date: addDays(today, 1 + Math.floor(rnd() * 3)) })) ck.acc++;
    } else if (s.status === 'accepted' && s.plan_date <= today && rnd() < 0.5 && await call(s.owner_id, `/supports/${s.id}/done`, { result: '模拟：已按计划完成支持' })) ck.sdone++;
  }
  // 2. 店长：抽查约 8% 已完成任务，执行力弱的门店不合格率更高
  const done = q("SELECT id, store_id, assignee_id, flags FROM instances WHERE date=? AND status='done' AND check_result IS NULL", today);
  await pool(done.filter(i => rnd() < (i.flags ? 0.6 : 0.08)), 8, async i => { // 被系统标记的优先核实，异常标记的不合格率更高
    const m = sms(i.store_id)[0]; if (!m) return;
    const bad = rnd() < (i.flags && i.flags !== 'rand' ? 0.5 : (1 - storeQ(i.store_id)) * 1.5);
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
  // 4. 教练：每天按「该先去哪家」排第一的门店安排一次巡店；城市总 / 教练完成今天计划内的巡店
  for (const c of q("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.active=1 AND r.level='coach'")) {
    if (q1("SELECT 1 x FROM patrols WHERE created_by=? AND planned_date=?", c.id, today)) continue;
    const go = (await call(c.id, '/cdesk', null, 'GET'))?.go?.[0];
    if (go) await call(c.id, '/patrols', { store_id: go.sid, planned_date: today, reason: '模拟：教练按例外优先巡店' });
  }
  const codes = q("SELECT code, title FROM templates WHERE src='audit' AND active=1").map(t => t.code);
  for (const p of q("SELECT id, store_id, created_by FROM patrols WHERE planned_date<=? AND status='planned'", today)) {
    const results = {}; for (const c of codes) if (rnd() < (1 - storeQ(p.store_id)) * 0.3) results[c] = { result: 'fail', comment: '模拟巡店：现场未达标' };
    if (await call(p.created_by, `/patrols/${p.id}/complete`, { mode: 'full', results })) act.patrol++;
  }
  // 4.5 BRD11：店长看运营日报（减负计时）、周一发员工洞察消息、经营月会按时召开或改期
  const act2 = { view: 0, insight: 0, meetDone: 0, meetBad: 0, meetMove: 0 };
  const smStores = q("SELECT us.user_id uid, us.store_id sid FROM user_stores us JOIN users u ON u.id=us.user_id JOIN stores s ON s.id=us.store_id WHERE u.active=1 AND (u.temp_until IS NULL) AND (s.lc_stage IS NULL OR s.lc_stage!='虚拟')");
  await pool(smStores, 8, async x => { if (rnd() < storeQ(x.sid) && await call(x.uid, '/save', { kind: 'day', key: 'brief_day' + x.sid })) act2.view++; });
  const wd = new Date(today + 'T00:00:00Z').getUTCDay(), insF = path.join(OUT, `insight-${today}.done`);
  if (wd === 1 && !fs.existsSync(insF)) {
    await pool(smStores, 6, async x => {
      if (rnd() > storeQ(x.sid)) return;
      const r = await call(x.uid, `/insight?store=${x.sid}`); const items = (r?.people || []).filter(p => p.quad !== 'star' || rnd() < 0.3).map(p => ({ uid: p.uid, text: p.msg }));
      if (items.length && await call(x.uid, '/insight/send', { store: x.sid, items })) act2.insight++;
    });
    fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(insF, '1');
  }
  if (process.env.FINAL) {
    const hq = q1("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.level='hq' AND u.active=1 ORDER BY u.id LIMIT 1")?.id;
    const meets = (() => { try { return q("SELECT m.id, m.store_id, m.ym, m.sm_id, m.invite_rm, m.start_at FROM meetings m JOIN instances i ON i.id=m.inst_id WHERE m.status='pending' AND i.status='pending' AND substr(m.start_at,1,10)<=?", today); } catch { return []; } })();
    for (const mt of meets) {
      const g = storeQ(mt.store_id), r = rnd();
      if (r < g * 0.45) { if ((await call(hq, '/huatong/meeting-callback', { hotel_id: mt.store_id, ym: mt.ym, minutes_url: `https://huatong.example/minutes/sim-${mt.id}`, valid: true, fr_joined: true, rm_joined: mt.invite_rm ? rnd() < 0.7 : false }))?.done) act2.meetDone++; }
      else if (r < g * 0.5) { if (await call(hq, '/huatong/meeting-callback', { hotel_id: mt.store_id, ym: mt.ym, minutes_url: `https://huatong.example/minutes/sim-${mt.id}`, valid: rnd() < 0.5, fr_joined: false })) act2.meetBad++; }
      else if (await call(mt.sm_id, `/meet/${mt.id}/time`, { start_at: addDays(today, 1 + Math.floor(rnd() * 3)) + ' ' + ['10:00', '14:00', '15:00', '16:30'][Math.floor(rnd() * 4)] })) act2.meetMove++;
    }
  }
  const tryQ = (sql, ...a) => { try { return q1(sql, ...a); } catch { return {}; } };
  const brd = { ...act2, meet: tryQ("SELECT COUNT(*) n, SUM(status='done') d, SUM(invite_rm) inv, SUM(rm_joined) rmj FROM meetings WHERE ym=?", today.slice(0, 7)),
    save: tryQ('SELECT COUNT(DISTINCT user_id) u, COALESCE(SUM(min),0) min, COALESCE(SUM(teach),0) teach FROM saves WHERE date=?', today),
    exempt: tryQ('SELECT COUNT(*) n, COUNT(DISTINCT store_id) st FROM exempts WHERE date=?', today),
    na: tryQ('SELECT COALESCE(SUM(total),0) t, COALESCE(SUM(moved),0) mv, COALESCE(SUM(need_sm),0) nd FROM night_audit WHERE date=?', today),
    ua: tryQ("SELECT COUNT(*) n FROM instances WHERE date=? AND status='pending' AND assignee_id IS NULL", today),
    push: tryQ("SELECT COUNT(*) n FROM notifications WHERE kind='report' AND substr(created_at,1,10)=? AND title LIKE '【宏图日报】%'", today) };
  const fg = tryQ("SELECT COUNT(*) n, SUM(flags LIKE '%batch%') b, SUM(flags LIKE '%old%') o, SUM(flags='rand') r, SUM(check_result IS NOT NULL) ck, SUM(check_result='bad') bad FROM instances WHERE date=? AND flags IS NOT NULL", today);
  const lk = tryQ("SELECT COUNT(*) n, SUM(kind='check') c, SUM(kind='miss') m, SUM(kind='store') s FROM learns WHERE substr(created_at,1,10)=?", today),
    ls = tryQ("SELECT SUM(status='todo') todo, SUM(status='done') done, SUM(status='verified') ok, SUM(status='failed') bad FROM learns"),
    sp = tryQ("SELECT COUNT(*) n, SUM(status='open') o, SUM(status='accepted') a, SUM(status='done') d, SUM(brief_n IS NOT NULL) b FROM supports");
  // 5. 日报
  const m = d => {
    const r = q1("SELECT COUNT(*) n, SUM(status='done') d, SUM(escalated>=1) e, SUM(escalated=2) e2, SUM(check_result IS NOT NULL) c, SUM(check_result='bad') b FROM instances WHERE date=? AND store_id NOT IN (SELECT id FROM stores WHERE lc_stage='虚拟')", d);
    return { tasks: r.n, done: r.d || 0, rate: r.n ? +(100 * (r.d || 0) / r.n).toFixed(1) : 0, escalated: r.e || 0, esc2: r.e2 || 0, esc3: (() => { try { return q1('SELECT COUNT(*) n FROM esc_events WHERE date=? AND level=3', d).n; } catch { return 0; } })(), checked: r.c || 0, bad: r.b || 0 };
  };
  const rect = q1("SELECT SUM(status!='closed') open, SUM(status!='closed' AND deadline<?) late, SUM(status='closed' AND substr(verified_at,1,10)=?) closed FROM rectifications", today, today);
  const regions = q("SELECT g.name, COUNT(*) n, SUM(i.status='done') d FROM instances i JOIN stores s ON s.id=i.store_id JOIN regions g ON g.id=s.region_id WHERE i.date=? AND COALESCE(s.lc_stage,'')!='虚拟' GROUP BY g.id ORDER BY 1.0*SUM(i.status='done')/COUNT(*)", today).map(r => ({ name: r.name, rate: +(100 * r.d / r.n).toFixed(1) }));
  const worst = q("SELECT s.name, COUNT(*) n, SUM(i.status='done') d, SUM(i.escalated>=1) e FROM instances i JOIN stores s ON s.id=i.store_id WHERE i.date=? AND COALESCE(s.lc_stage,'')!='虚拟' GROUP BY s.id ORDER BY 1.0*SUM(i.status='done')/COUNT(*) LIMIT 10", today).map(r => ({ name: r.name, rate: +(100 * r.d / r.n).toFixed(1), escalated: r.e }));
  const ln = (() => { try { return q1("SELECT COUNT(*) n, COALESCE(SUM(deferred),0) df, COUNT(DISTINCT store_id) st FROM flex_tasks WHERE source='line' AND substr(created_at,1,10)=?", today); } catch { return { n: 0, df: 0, st: 0 }; } })();
  const ld = (() => { try { return q1("SELECT ROUND(AVG(m)) avg, MAX(m) mx, SUM(m>60) ovr FROM (SELECT SUM(minutes) m FROM flex_tasks WHERE source='line' AND active=1 AND start_date=? GROUP BY store_id)", today); } catch { return {}; } })();
  const rep = { date: today, brd, lines: { ...ln, ...ld }, at: new Date().toISOString(), secs: Math.round((Date.now() - t0) / 1000), today: m(today), actions: act, rect, regions, worst, api: stat };
  const prevF = path.join(OUT, `sim-${addDays(today, -1)}.json`); if (fs.existsSync(prevF)) rep.prev = JSON.parse(fs.readFileSync(prevF)).today;
  fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, `sim-${today}.json`), JSON.stringify(rep, null, 1));
  const dv = (k, u = '') => rep.prev ? `（昨天 ${rep.prev[k]}${u}）` : '';
  const md = [`# 宏图每日模拟日报 ${today}（截至 ${new Date(Date.now() + 8 * 3600e3).toISOString().slice(11, 16)}）`, '', `- 今日任务 ${rep.today.tasks} 条，完成 ${rep.today.done} 条，完成率 ${rep.today.rate}%${dv('rate', '%')}`,
    `- 超时升级 ${rep.today.escalated} 条${dv('escalated')}（其中升到教练 ${rep.today.esc2} 条${dv('esc2')}，进城市总例外清单门店 ${rep.today.esc3} 家）；店长抽查 ${rep.today.checked} 条，不合格 ${rep.today.bad} 条`,
    `- 整改：今天闭环 ${rect.closed || 0}，未闭环 ${rect.open || 0}，其中逾期 ${rect.late || 0}`, `- 巡店完成 ${act.patrol} 次`, `- 数据真实性：今天系统标记 ${fg.n || 0} 项待核实（1 分钟内连续完成 ${fg.b || 0}、旧照片 ${fg.o || 0}、随机抽中 ${fg.r || 0}），店长已核实 ${fg.ck || 0} 项，其中不合格 ${fg.bad || 0} 项`,
    `- 带教：今天自动推课 ${lk.n || 0} 门（抽查不合格 ${lk.c || 0}、多次漏做 ${lk.m || 0}、全员学习 ${lk.s || 0}）；本轮学完 ${ck.learn} 门，店长复查 ${ck.ver} 次，其中仍不合格 ${ck.verBad} 次；累计待学 ${ls.todo || 0}、待复查 ${ls.done || 0}、复查合格 ${ls.ok || 0}、仍不合格 ${ls.bad || 0}`,
    `- 门店支持：问题集中 ${sp.n || 0} 家（待安排 ${sp.o || 0}、已安排 ${sp.a || 0}、已完成 ${sp.d || 0}），已安排晨会微课 ${sp.b || 0} 家；本轮新安排晨会微课 ${ck.brief} 家、新安排支持 ${ck.acc} 家、完成支持 ${ck.sdone} 家`,
    `- 按班派单：凌晨核对 ${brd.na.t || 0} 项，按排班换人 ${brd.na.mv || 0} 项，没有在班人员待指派 ${brd.na.nd || 0} 项；本轮店长指派 ${act.asg} 项，仍待指派 ${brd.ua.n || 0} 项`, `- 条线统一派发 ${ln.n} 条，覆盖 ${ln.st} 家门店，因店长负荷满顺延 ${ln.df} 条；店长当天条线负荷平均 ${ld.avg ?? 0} 分钟、最高 ${ld.mx ?? 0} 分钟，超 60 分钟 ${ld.ovr ?? 0} 家`,
    `- 完成率最低的区域：${regions.slice(0, 3).map(r => `${r.name} ${r.rate}%`).join('、')}`, `- 完成率最低的门店：${worst.slice(0, 5).map(r => `${r.name} ${r.rate}%`).join('、')}`,
    `- BRD11：06:30 日报推送 ${brd.push.n || 0} 家；店长查看运营日报 ${brd.save.u || 0} 人，宏图减负合计 ${brd.save.min || 0} 分钟、带教 ${brd.save.teach || 0} 次；综合分豁免 ${brd.exempt.st || 0} 家店 ${brd.exempt.n || 0} 项`,
    `- 经营月会（本月）：${brd.meet.d || 0}/${brd.meet.n || 0} 家已开完${brd.meet.inv ? `，区域经理受邀 ${brd.meet.inv} 家、已督导 ${brd.meet.rmj || 0} 家` : ''}；今天开完 ${act2.meetDone} 家，纪要无效或加盟商未参会 ${act2.meetBad} 家，改期 ${act2.meetMove} 家${act2.insight ? `；员工洞察消息 ${act2.insight} 位店长已发送` : ''}`,
    `- 接口调用 成功 ${stat.ok} / 失败 ${stat.fail}；用时 ${rep.secs} 秒`].join('\n');
  fs.writeFileSync(path.join(OUT, `sim-${today}.md`), md); console.log(md); console.log(JSON.stringify(stat.err));
})();
