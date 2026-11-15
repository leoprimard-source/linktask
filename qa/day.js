// 上下班打卡 → 今日清单 → 当日总结 流程测试。用法: PORT=3130 node qa/day.js
const B = 'http://localhost:' + (process.env.PORT || 3130) + '/api';
const api = async (uid, p, body) => { const r = await fetch(B + p, { method: body ? 'POST' : 'GET', headers: { 'x-user-id': uid, 'content-type': 'application/json' }, body: body && JSON.stringify(body) }); const j = await r.json().catch(() => ({})); return { s: r.status, j }; };
let pass = 0, fail = 0; const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' ' + JSON.stringify(x).slice(0, 300))); };
(async () => {
  const users = (await api('', '/users')).j, by = (f) => users.find(f);
  const sm = (by(u => u.name === '陈峰') || by(u => u.level === 'store_manager' && u.stores.length > 1)), coach = by(u => u.level === 'coach');
  let r = await api(sm.id, '/me'); ok(r.j.shift && r.j.shift.mgr, '店长有班次卡片', r.j.shift);
  const sids = r.j.stores?.map?.(s => s.id) || [];
  r = await api(sm.id, '/day/sum'); ok(r.s === 200, '下班前可预览总结', r.j);
  r = await api(sm.id, '/day/sum', { items: [] }); ok(r.s === 400, '未上班打卡不能提交总结', r.j);
  r = await api(sm.id, '/punch', { kind: 'in' }); ok(r.j.ok, '店长上班打卡', r.j);
  r = await api(sm.id, '/day/start'); ok(r.s === 200 && r.j.stores.length >= 2, '多店店长今日清单按门店汇总', { n: r.j.stores?.length, e: r.j.error });
  ok(r.j.stores.every(s => Array.isArray(s.tonight)), '每店有今晚值班安排', r.j.stores);
  const sum = (await api(sm.id, '/day/sum')).j; console.log('  未完成', sum.items.length, '项；夜班接收人', Object.values(sum.hands).map(l => l.length).join('/'));
  ok(sum.snap.length >= 2 && sum.snap[0].occ != null, '店长总结带经营快照', sum.snap[0]);
  const it = sum.items.filter(i => i.kind === 'task');
  if (it.length) {
    r = await api(sm.id, '/day/sum', { items: [{ key: it[0].key, dest: 'tomorrow' }] }); ok(r.s === 400 && /必做/.test(r.j.error), '必做转明天必须写原因', r.j);
  }
  const night = it.find(i => sum.hands[i.store_id]?.length), toNight = night && sum.hands[night.store_id][0];
  const sel = it.map(i => i === night ? { key: i.key, dest: 'night', to: toNight.id } : i === it[1] ? { key: i.key, dest: 'coach', reason: '业主不配合' } : { key: i.key, dest: 'tomorrow', reason: '今天客诉多' });
  r = await api(sm.id, '/day/sum', { items: sel, note: '测试总结', focus: '明天抽查客房' }); ok(r.j.ok, '店长提交当日总结', r.j);
  r = await api(sm.id, '/me'); ok(r.j.shift.punch.out && r.j.shift.log.status === 'done', '提交后自动下班打卡并记为已总结', r.j.shift);
  r = await api(sm.id, '/day/sum', { items: [] }); ok(r.s === 400, '不能重复提交', r.j);
  if (night) {
    const st = (await api(toNight.id, '/day/start')).j, c = st.carried.find(x => x.text === night.text);
    ok(!!c, '夜班接收人在清单里看到转来的事项', st.carried);
    r = await api(by(u => u.level === 'region_manager').id, '/carry/' + c.id, { op: 'ack' }); ok(r.s === 403, '别人不能代为确认', r.j);
    r = await api(toNight.id, '/carry/' + c.id, { op: 'ack' }); ok(r.j.ok, '接收人确认接收', r.j);
  }
  if (coach) { r = await api(coach.id, '/day/report'); ok(r.s === 200 && r.j.rows.some(x => x.flags.some(f => f[0] === '上报')), '教练日报列出上报门店', r.j.rows?.slice(0, 2));
    const lg = r.j.rows.flatMap(x => x.logs).find(l => l.name === sm.name);
    if (lg) { r = await api(coach.id, '/day/log/' + lg.id + '/comment', { text: '晨会再提前 10 分钟' }); ok(r.j.ok, '教练点评当日总结', r.j); }
  }
  r = await api(sm.id, '/day/report'); ok(r.s === 403, '店长看不到区域日报', r.j);
  // 前台
  const fd = users.filter(u => /^前台(高级|中级|初级)$/.test(u.role_name));
  for (const f of fd) { const m = (await api(f.id, '/me')).j; if (m.shift && !m.shift.rest && !m.shift.punch.in) {
    r = await api(f.id, '/punch', { kind: 'in' }); ok(r.j.ok, '前台上班打卡 ' + m.shift.code, r.j);
    const d = (await api(f.id, '/day/sum')).j; ok(d.handoff && d.mode === 'next', '前台总结带交班信息', d.mode);
    r = await api(f.id, '/day/sum', { items: d.items.map(i => ({ key: i.key, dest: d.hands[i.store_id]?.length ? 'next' : 'tomorrow', to: d.hands[i.store_id]?.[0]?.id })), guest: '1208 VIP 晚到', cash: '备用金 2000 已清点' });
    ok(r.j.ok, '前台交班提交', r.j); break; } }
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
