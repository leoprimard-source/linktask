// grow a 4-store data copy into 12 stores / 6 store managers / 90-day history. usage: DATA_DIR=dir node grow.js
const D = require('../db.js'), L = require('../lib.js');
const { q, q1, run, tx } = D;
if (q1('SELECT COUNT(*) n FROM stores').n !== 4) throw new Error('expect 4 stores');
let s0 = 20261115; const r = () => (s0 = (s0 * 1103515245 + 12345) % 2147483648) / 2147483648;
const T = L.today(), rid = n => q1('SELECT id FROM roles WHERE name=?', n).id;
// [id,name,code,addr,stype,brand,open,rooms,tags,lc,quality,src,dropRoles,extra]
const NEW = [
  [5, '上海徐汇滨江店', 'SH-XH', '上海市徐汇区龙腾大道 2555 号', '直营店', '全季 4.0', '2020-05-20', 186, '标杆复制', '成熟', 0.95, 1, [], ['前台初级']],
  [6, '上海浦东世纪公园店', 'SH-PD', '上海市浦东新区锦绣路 1001 号', '加盟店', '全季 4.0', '2023-03-18', 142, '', '成熟', 0.9, 2, [], ['客房初级']],
  [7, '杭州钱江新城店', 'HZ-QJ', '杭州市上城区富春路 290 号', '直营店', '全季 4.0', '2026-07-20', 150, '新开业', '爬坡', 0.83, 4, [], ['前台初级', '客房初级']],
  [8, '苏州观前街店', 'SZ-GQ', '苏州市姑苏区观前街 188 号', '加盟店', '全季 3.6', '2018-10-12', 120, '重点帮扶,改造规划', '改造', 0.7, 3, [], ['客房初级']],
  [9, '南京新街口店', 'NJ-XJK', '南京市秦淮区中山南路 49 号', '直营店', '全季 4.0', '2021-11-08', 172, '', '成熟', 0.9, 1, [], ['前台初级']],
  [10, '南京河西店', 'NJ-HX', '南京市建邺区江东中路 222 号', '加盟店', '全季 3.6', '2024-06-01', 128, '关键岗空缺', '成熟', 0.63, 2, ['客房经理'], ['客房初级', '客房初级']],
  [11, '无锡太湖广场店', 'WX-TH', '无锡市梁溪区清扬路 128 号', '直营店', '全季 4.0', '2026-10-01', 138, '新开业', '爬坡', 0.8, 4, [], ['前台初级']],
  [12, '宁波天一广场店', 'NB-TY', '宁波市海曙区中山东路 188 号', '直营店', '全季 4.0', '2020-08-16', 160, '关键岗空缺', '成熟', 0.86, 3, ['工程'], ['前台初级']]
];
const QUAL = { 1: 0.93, 2: 0.88, 3: 0.74, 4: 0.85 }; NEW.forEach(s => QUAL[s[0]] = s[10]);
const SN = '王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤'.split('');
const GN = '晓明 婷婷 子轩 欣怡 浩然 雨涵 俊杰 思琪 宇航 梦瑶 志强 佳慧 文博 诗雨 嘉怡 天宇 静怡 明轩 雅琴 海峰 丽娜 国庆 春燕 建华 秀英 立新 晨曦 一鸣 若曦 振宇 慧敏 安琪 博文 心怡 鹏飞 雪梅 旭东 小雨 凯文 美玲 永刚 红梅 子涵 思远 梓萱 宏伟 玉兰 志远 佳琪 少华'.split(' ');
const used = new Set(q('SELECT name FROM users').map(u => u.name));
const nm = () => { for (;;) { const n = SN[Math.floor(r() * SN.length)] + GN[Math.floor(r() * GN.length)]; if (!used.has(n)) { used.add(n); return n; } } };
let ph = 0; const phone = () => '136' + String(20260000 + (++ph) * 37).padStart(8, '0');
const UCOL = new Set(['user_id', 'created_by', 'assignee_id', 'done_by', 'staff_id', 'owner_id', 'comp_by', 'by', 'reply_by', 'to_user', 'from_user', 'hr_by', 'approved_by']);
const CLONE = 'repairs store_stock purchases stocktakes complaints safety_plans supplier_ratings survey_resp hr_moves recruit meal_menu meal_rate care_act care_log suggest dorm_check kudos care_star'.split(' ');
const cols = t => q(`PRAGMA table_info(${t})`);
const SM = { 4: [1, 2, 5], 5: [3, 6, 7], 48: [4, 8] };
const maxInst = q1('SELECT MAX(id) m FROM instances').m;
tx(() => {
  const newSM = [['孙晓东', [9, 10]], ['何静', [11]], ['马超', [12]]];
  for (const [n, ss] of newSM) { used.add(n); const id = Number(run("INSERT INTO users(name,role_id,region_id,store_id,phone,active) VALUES(?,?,1,NULL,?,1)", n, rid('店长'), phone()).lastInsertRowid); SM[id] = ss; }
  for (const s of NEW) {
    const [id, name, code, addr, stype, brand, open, rooms, tags, lc, , src, drop, extra] = s;
    run('INSERT INTO stores(id,region_id,name,code,address,brand,stype,open_date,rooms,tags,lc_stage) VALUES(?,1,?,?,?,?,?,?,?,?,?)', id, name, code, addr, brand, stype, open, rooms, tags, lc);
    const umap = {};
    for (const u of q('SELECT u.*, r.name rn FROM users u JOIN roles r ON r.id=u.role_id WHERE u.store_id=?', src)) {
      if (drop.includes(u.rn) && u.active) continue;
      umap[u.id] = Number(run('INSERT INTO users(name,role_id,region_id,store_id,phone,active) VALUES(?,?,1,?,?,?)', nm(), u.role_id, id, phone(), u.active).lastInsertRowid);
    }
    for (const rn of extra) run('INSERT INTO users(name,role_id,region_id,store_id,phone,active) VALUES(?,?,1,?,?,1)', nm(), rid(rn), id, phone());
    s.umap = umap; s.srcSM = q1('SELECT user_id FROM user_stores WHERE store_id=?', src).user_id;
  }
  run('DELETE FROM user_stores');
  for (const [u, ss] of Object.entries(SM)) for (const sid of ss) run('INSERT INTO user_stores(user_id,store_id) VALUES(?,?)', Number(u), sid);
  for (const s of NEW) {
    const [id, , , , , , , , , , , src] = s, newSm = Number(Object.keys(SM).find(u => SM[u].includes(id)));
    const fb = q1('SELECT u.id FROM users u WHERE store_id=? AND role_id=? AND active=1', id, rid('店助')).id;
    const mapU = v => v == null ? v : s.umap[v] ?? (v === s.srcSM ? newSm : v);
    for (const a of q('SELECT * FROM assignments WHERE store_id=?', src)) if (s.umap[a.user_id]) run('INSERT INTO assignments(store_id,template_id,user_id) VALUES(?,?,?)', id, a.template_id, s.umap[a.user_id]);
    for (const o of q('SELECT * FROM scene_owners WHERE store_id=?', src)) run('INSERT INTO scene_owners(store_id,scene_id,user_id) VALUES(?,?,?)', id, o.scene_id, s.umap[o.user_id] || fb);
    for (const t of CLONE) {
      const cs = cols(t).filter(c => !(c.pk && c.name === 'id')).map(c => c.name);
      const ins = D.db.prepare(`INSERT OR IGNORE INTO ${t}(${cs.join(',')}) VALUES(${cs.map(() => '?').join(',')})`);
      const nameOf = {}; 
      for (const row of q(`SELECT * FROM ${t} WHERE store_id=?`, src)) {
        if (t === 'meal_rate' && !s.umap[row.user_id]) continue;
        const v = cs.map(c => c === 'store_id' ? id : UCOL.has(c) ? mapU(row[c]) : row[c]);
        if (t === 'hr_moves') { const i = cs.indexOf('name'); v[i] = row.user_id && s.umap[row.user_id] ? q1('SELECT name FROM users WHERE id=?', s.umap[row.user_id]).name : nm(); }
        if (t === 'safety_plans') { const pid = Number(ins.run(...v).lastInsertRowid); for (const lg of q('SELECT * FROM safety_logs WHERE plan_id=?', row.id)) run('INSERT INTO safety_logs(plan_id,store_id,date,"by",result,note,photo) VALUES(?,?,?,?,?,?,?)', pid, id, lg.date, mapU(lg.by), lg.result, lg.note, lg.photo); continue; }
        ins.run(...v);
      }
    }
  }
});
// 90-day history
const tplInfo = Object.fromEntries(q('SELECT id, m, need_value FROM templates').map(t => [t.id, t]));
const CHECK = { M1: 0, M2: 0.9, M3: 0.25, M4: 0.3 };
for (let d = -90; d <= 0; d++) {
  const date = L.addDays(T, d);
  D.ensureInstances(date);
  if (d === 0) continue;
  const rows = q('SELECT * FROM instances WHERE date=? AND id>?', date, maxInst);
  tx(() => {
    for (const it of rows) {
      let p = QUAL[it.store_id];
      if (it.store_id === 8) p += (d + 90) / 90 * 0.08;          // 帮扶店逐步改善
      if (it.store_id === 6 && d > -30) p -= 0.08;              // 近 30 天下滑
      if (r() >= p) continue;
      const doneAt = date + ' ' + L.addMinutes(it.due_time, r() < 0.15 ? 25 : -Math.floor(r() * 20));
      const ti = it.src === 'tpl' ? tplInfo[it.src_id] : null;
      let check = null, comment = null, by = null;
      if (r() < (ti && ti.m ? CHECK[ti.m] : 0.25) * 0.4) {
        const bad = r() < (QUAL[it.store_id] < 0.8 ? 0.3 : 0.1);
        check = bad ? 'bad' : 'good'; comment = bad ? '未达标准：' + (it.need_photo ? '照片显示现场不达标' : '记录不完整') : '执行到位，继续保持';
        by = D.storeManagers(it.store_id)[0];
      }
      run("UPDATE instances SET status='done', done_at=?, check_result=?, check_comment=?, checked_by=?, checked_at=?, photo=CASE WHEN need_photo=1 THEN '/demo-photo.svg' END WHERE id=?",
        doneAt, check, comment, by, check ? date + ' 17:30' : null, it.id);
      if (ti && ti.need_value) run('UPDATE instances SET reading=? WHERE id=?', `巡检 ${12 + Math.floor(r() * 6)} 个点位，异常 ${r() < 0.15 ? 1 : 0} 处`, it.id);
      if (check === 'bad') {
        const dl = L.addDays(date, 3), closed = dl < T && r() < 0.75;
        run(`INSERT INTO rectifications(instance_id,store_id,assignee_id,reason,training,task,deadline,status,created_by,created_at,submit_note,submitted_at,verify_comment,verified_by,verified_at,escalated)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`, it.id, it.store_id, it.assignee_id, comment, '由店长现场复训标准流程 15 分钟', '按标准重新执行并拍照上传', dl, closed ? 'closed' : 'open', by, date + ' 17:30',
          closed ? '已整改完成' : null, closed ? L.addDays(date, 2) + ' 10:00' : null, closed ? '复查合格' : null, closed ? by : null, closed ? L.addDays(date, 2) + ' 16:00' : null);
      }
    }
  });
}
run('UPDATE instances SET escalated=1 WHERE date<? AND id>?', T, maxInst);
for (const x of q("SELECT id, deadline FROM rectifications WHERE status='open' AND deadline<?", L.addDays(T, -10))) if (r() < 0.9) run("UPDATE rectifications SET status='closed', submit_note='已整改完成', submitted_at=?, verify_comment='复查合格', verified_by=created_by, verified_at=? WHERE id=?", L.addDays(x.deadline, -1) + ' 10:00', L.addDays(x.deadline, -1) + ' 16:00', x.id);
// done patrols over the last 90 days for part of the stores
const PS = [[5, -70, 92], [5, -20, 94], [6, -60, 88], [7, -40, 81], [8, -75, 62], [8, -45, 68], [8, -12, 74], [9, -50, 86], [10, -8, 58], [12, -25, 83], [1, -55, 90], [2, -38, 85]];
for (const [sid, d, sc] of PS) run("INSERT INTO patrols(store_id,planned_date,reason,status,score,summary,created_by,created_at,done_at) VALUES(?,?,?,'done',?,?,1,?,?)", sid, L.addDays(T, d), '例行巡店', sc, sc < 75 ? '执行和卫生问题较多，已下整改' : '整体达标，个别细节已现场指出', L.addDays(T, d - 2) + ' 10:00', L.addDays(T, d) + ' 16:00');
for (const s of q('SELECT id FROM stores')) D.refreshPending(s.id);
D.audit(1, null, '数据扩充', '扩充为 12 家门店、6 位店长、90 天历史');
console.log('stores', q1('SELECT COUNT(*) n FROM stores').n, 'users', q1('SELECT COUNT(*) n FROM users').n, 'staff', q1("SELECT COUNT(*) n FROM users WHERE store_id IS NOT NULL AND active=1").n,
  'inst', q1('SELECT COUNT(*) n FROM instances').n, 'rect', q1('SELECT COUNT(*) n FROM rectifications').n, JSON.stringify(q('SELECT user_id,COUNT(*) n FROM user_stores GROUP BY user_id')));
