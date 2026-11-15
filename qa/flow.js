const { DatabaseSync } = require('node:sqlite');
const P = process.env.P || 3103, db = new DatabaseSync(process.env.DB || '/home/ubuntu/lt-qa/linktask.db');
const one = (s, ...a) => db.prepare(s).get(...a);
const today = new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);
const call = async (uid, path, body) => { const r = await fetch(`http://localhost:${P}/api${path}`, { method: body ? 'POST' : 'GET', headers: { 'x-user-id': uid, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { st: r.status, j: await r.json().catch(() => null) }; };
const R = []; const log = (name, ok, info) => { R.push({ name, ok, info }); console.log(ok ? 'PASS' : 'FAIL', name, info ? JSON.stringify(info).slice(0, 160) : ''); };
(async () => {
  // 1 task chain: staff complete -> SM check bad -> rect -> staff submit -> SM verify
  const it = one("SELECT * FROM instances WHERE store_id=3 AND date=? AND status='pending' AND need_photo=0 AND assignee_id IN (SELECT id FROM users WHERE role_id>4) ORDER BY id LIMIT 1", today);
  const other = one("SELECT * FROM instances WHERE store_id=3 AND date=? AND status='pending' AND assignee_id!=? AND need_photo=0 LIMIT 1", today, it.assignee_id);
  log('他人不能完成别人的任务', (await call(8, `/instances/${it.id}/complete`, { note: 'x' })).st === 403);
  const pendChk = await call(5, `/instances/${other.id}/check`, { result: 'good', comment: '' });
  log('未完成的任务不应能抽查', pendChk.st !== 200, pendChk);
  let c = await call(it.assignee_id, `/instances/${it.id}/complete`, { note: '完成', reading: '1' }); log('员工完成任务', c.st === 200, c.j);
  c = await call(5, `/instances/${it.id}/check`, { result: 'bad', comment: '不达标', rectify: { task: '重做', deadline: today } }); log('店长抽查不合格生成整改', c.st === 200, c.j);
  c = await call(5, `/instances/${it.id}/check`, { result: 'bad', comment: '再次', rectify: { task: '重做2', deadline: today } });
  const nr = one('SELECT COUNT(*) n FROM rectifications WHERE instance_id=?', it.id).n; log('同一任务重复抽查不应生成多条整改', nr === 1, { st: c.st, rects: nr });
  const rect = one('SELECT * FROM rectifications WHERE instance_id=? ORDER BY id LIMIT 1', it.id);
  c = await call(5, `/rectifications/${rect.id}/verify`, { pass: true }); log('整改未提交不应能直接复查通过', c.st !== 200, c.j);
  db.prepare("UPDATE rectifications SET status='open' WHERE id=?").run(rect.id);
  c = await call(it.assignee_id, `/rectifications/${rect.id}/submit`, { note: '已整改' }); log('员工提交整改', c.st === 200);
  c = await call(5, `/rectifications/${rect.id}/verify`, { pass: true }); log('店长复查通过', c.st === 200);
  c = await call(it.assignee_id, `/rectifications/${rect.id}/submit`, { note: '再提交' }); log('已闭环整改不应能再次提交', c.st !== 200, one('SELECT status FROM rectifications WHERE id=?', rect.id));
  c = await call(5, `/instances/${it.id}/undo`, {}); log('已抽查任务不能撤回', c.st !== 200);
  // 2 reassign to other store / inactive
  const it2 = one("SELECT * FROM instances WHERE store_id=3 AND date=? AND status='pending' LIMIT 1 OFFSET 5", today);
  c = await call(5, `/instances/${it2.id}/reassign`, { user_id: 8 }); log('不应能把任务改派给别店员工', c.st !== 200, c.j);
  c = await call(5, `/instances/${it2.id}/reassign`, { user_id: 1 }); log('不应能把任务改派给区域经理等非本店人员', c.st !== 200, c.j);
  c = await call(5, '/leaves', { user_id: 34, date: today, cover_user_id: 8 }); log('顶岗人不应是别店员工', c.st !== 200, c.j);
  // 3 repair chain
  c = await call(34, '/repairs', { title: '空调不制冷', location: '1203', urgency: 'urgent' }); const rid = c.j?.id; log('员工报修', c.st === 200);
  const eng = one("SELECT id FROM users WHERE store_id=3 AND role_id=15").id;
  log('工程接单', (await call(eng, `/repairs/${rid}/accept`, {})).st === 200);
  log('工程完工', (await call(eng, `/repairs/${rid}/done`, { note: '换了电容' })).st === 200);
  log('非报修人不能确认关单', (await call(35, `/repairs/${rid}/confirm`, {})).st !== 200);
  log('报修人确认关单', (await call(34, `/repairs/${rid}/confirm`, { rating: 5 })).st === 200);
  c = await call(eng, `/repairs/${rid}/done`, { note: '再完工' }); log('已关单报修不能再完工', c.st !== 200);
  // 4 concurrency: double submit
  const it3 = one("SELECT * FROM instances WHERE store_id=3 AND date=? AND status='pending' AND need_photo=0 LIMIT 1 OFFSET 8", today);
  await Promise.all([call(it3.assignee_id, `/instances/${it3.id}/complete`, { note: 'a', reading: '1' }), call(it3.assignee_id, `/instances/${it3.id}/complete`, { note: 'b', reading: '1' })]);
  const rs = await Promise.all([1, 2, 3].map(() => call(5, `/instances/${it3.id}/check`, { result: 'bad', comment: '连点', rectify: { task: 't', deadline: today } })));
  log('连点三次抽查不合格只应生成一条整改', one('SELECT COUNT(*) n FROM rectifications WHERE instance_id=?', it3.id).n === 1, { n: one('SELECT COUNT(*) n FROM rectifications WHERE instance_id=?', it3.id).n, st: rs.map(r => r.st) });
  const ap = await Promise.all([1, 2].map(() => call(32, '/pay/appeal', { reason: '连点申诉' })));
  log('绩效申诉连点只应生成一条', one("SELECT COUNT(*) n FROM pay_appeals WHERE user_id=32 AND reason='连点申诉'").n === 1, { n: one("SELECT COUNT(*) n FROM pay_appeals WHERE user_id=32 AND reason='连点申诉'").n });
  // 5 self approval: HR appeal own
  await call(45, '/pay/appeal', { reason: '人事自己申诉' }); const aid = one("SELECT id FROM pay_appeals WHERE user_id=45 ORDER BY id DESC").id;
  c = await call(45, `/pay/appeal/${aid}`, { status: 'accepted' }); log('人事不应审批自己的申诉', c.st !== 200);
  // 6 inactive approver: store 3 SM leaves -> who handles store 3 approvals
  // 7 XSS / long input
  const X = '<img src=x onerror="window.__xss=1">';
  await call(34, '/care/suggest', { cat: '其他', body: X }); await call(34, '/repairs', { title: X, location: X });
  await call(34, '/complaints', { src: '当面', level: '一般', body: X, room: X });
  await call(5, '/care/kudos', { to_user: 34, text: X, from_kind: '店长' });
  const big = await call(34, '/care/suggest', { cat: '其他', body: 'a'.repeat(200000) }); log('超长文本应被限制', big.st !== 200, { st: big.st });
  const fake = await fetch(`http://localhost:${P}/api/me`, { headers: { 'x-user-id': '1 OR 1=1' } }); log('伪造身份头被拒', fake.status === 401);
  const badPhoto = await call(5, '/care/dorm', { store_id: 3, photo: 'data:image/png;base64,AAAA' }); log('无效图片数据应被拒', badPhoto.st !== 200, badPhoto.j);
  const svg = await call(5, '/care/dorm', { store_id: 3, photo: 'data:image/svg+xml;base64,' + Buffer.from('<svg onload=alert(1)>').toString('base64') }); log('SVG 不应作为照片', svg.st !== 200, svg.j);
  console.log('SUMMARY', R.filter(r => r.ok).length, '/', R.length);
})();
