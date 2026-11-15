// grow the 12-store data copy into a province: 10 regions / 300 stores / reserve RMs & SMs. usage: DATA_DIR=dir DAYS=30 node prov.js
const D = require('../db.js'), L = require('../lib.js');
const { q, q1, run, tx } = D, DAYS = Number(process.env.DAYS || 30);
if (q1('SELECT COUNT(*) n FROM stores').n !== 12) throw new Error('expect 12 stores');
let s0 = 3002026; const r = () => (s0 = (s0 * 1103515245 + 12345) % 2147483648) / 2147483648;
const T = L.today();
for (const [n, lv] of [['省区总经理', 'hq'], ['储备区域经理', 'coach']]) if (!q1('SELECT 1 FROM roles WHERE name=?', n)) run('INSERT INTO roles(name,level,sort) VALUES(?,?,0)', n, lv);
const rid = n => q1('SELECT id FROM roles WHERE name=?', n).id;
if (!q1('SELECT 1 FROM provinces')) run("INSERT INTO provinces(id,name) VALUES(1,'华东省区')");
run('UPDATE regions SET province_id=1');
const REG = [[1, '华东一区', '上海'], [2, '上海二区', '上海'], [3, '杭州区', '杭州'], [4, '宁波区', '宁波'], [5, '苏州区', '苏州'], [6, '南京区', '南京'], [7, '无锡常州区', '无锡'], [8, '合肥区', '合肥'], [9, '南昌区', '南昌'], [10, '福州区', '福州']];
const LM = '万达广场 火车站 高新区 新区 市中心 江滨 大学城 体育中心 会展中心 机场 开发区 老城 南站 北站 东站 西站 滨湖 科技园 金融城 万象城 银泰 吾悦广场 宝龙广场 龙湖天街 印象城 来福士 商务区 人民广场 湖滨 古城 步行街 软件园 医学院 奥体中心 世纪大道 解放路 中山路 人民路 新城 港城'.split(' ');
const SN = '王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤'.split('');
const GN = '晓明 婷婷 子轩 欣怡 浩然 雨涵 俊杰 思琪 宇航 梦瑶 志强 佳慧 文博 诗雨 嘉怡 天宇 静怡 明轩 雅琴 海峰 丽娜 国庆 春燕 建华 秀英 立新 晨曦 一鸣 若曦 振宇 慧敏 安琪 博文 心怡 鹏飞 雪梅 旭东 小雨 凯文 美玲 永刚 红梅 子涵 思远 梓萱 宏伟 玉兰 志远 佳琪 少华 军 磊 洁 敏 静 勇 艳 杰 涛 芳 强 丹 斌 霞 超 平 刚 燕 鑫 浩 蕾 鹏 颖 宁 帆 悦 琳 晨 楠'.split(' ');
const used = new Set(q('SELECT name FROM users').map(u => u.name));
const nm = () => { for (let i = 0; ; i++) { const n = SN[Math.floor(r() * SN.length)] + GN[Math.floor(r() * GN.length)] + (i > 50 ? GN[Math.floor(r() * GN.length)] : ''); if (!used.has(n)) { used.add(n); return n; } } };
let ph = 0; const phone = () => '135' + String(30000000 + (++ph) * 7).padStart(8, '0');
const UCOL = new Set(['user_id', 'created_by', 'assignee_id', 'done_by', 'staff_id', 'owner_id', 'comp_by', 'by', 'reply_by', 'to_user', 'from_user', 'hr_by', 'approved_by']);
const CLONE = 'repairs store_stock purchases stocktakes complaints safety_plans supplier_ratings survey_resp hr_moves recruit meal_menu meal_rate care_act care_log suggest dorm_check kudos care_star'.split(' ');
const cols = t => q(`PRAGMA table_info(${t})`);
const addU = (name, role, region, store, extra = {}) => Number(run('INSERT INTO users(name,role_id,region_id,store_id,phone,active,reserve) VALUES(?,?,?,?,?,1,?)', name, rid(role), region, store, phone(), extra.reserve || null).lastInsertRowid);
const srcStores = q('SELECT * FROM stores ORDER BY id'), QUAL = {}, maxInst = q1('SELECT MAX(id) m FROM instances').m, sname = new Set(srcStores.map(s => s.name)), newIds = [];
const SMPLAN = { 1: [3, 3, 3, 3, 2, 2, 1, 1], def: [3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1] };
tx(() => {
  for (const [id, n] of REG) if (!q1('SELECT 1 FROM regions WHERE id=?', id)) run('INSERT INTO regions(id,name,province_id) VALUES(?,?,1)', id, n);
  addU('钟立行', '省区总经理', 1, null);
  for (const [id, , city] of REG) {
    if (id !== 1) addU(nm(), '区域经理', id, null);
    const need = id === 1 ? 18 : 30, mine = [];
    for (let k = 0; k < need; k++) {
      const src = srcStores[(k + id) % srcStores.length];
      let name; do { name = `${city}${LM[Math.floor(r() * LM.length)]}店`; if (sname.has(name)) name = name.replace(/店$/, (Math.floor(r() * 8) + 2) + '号店'); } while (sname.has(name)); sname.add(name);
      const qv = 0.62 + r() * 0.34, age = r(), open = age < 0.12 ? L.addDays(T, -30 - Math.floor(r() * 140)) : L.addDays(T, -400 - Math.floor(r() * 2600));
      const lc = age < 0.12 ? '爬坡' : age > 0.9 ? '改造' : '成熟', stype = r() < 0.6 ? '加盟店' : '直营店';
      const sid = Number(run('INSERT INTO stores(region_id,name,code,address,brand,stype,open_date,rooms,tags,lc_stage) VALUES(?,?,?,?,?,?,?,?,?,?)', id, name, 'P' + id + '-' + (k + 1), city + '市', r() < 0.7 ? '全季 4.0' : '全季 3.6', stype, open, 100 + Math.floor(r() * 120), lc === '爬坡' ? '新开业' : qv < 0.7 ? '重点帮扶' : '', lc).lastInsertRowid);
      QUAL[sid] = qv; mine.push(sid); newIds.push(sid);
      const umap = {};
      for (const u of q('SELECT * FROM users WHERE store_id=?', src.id)) umap[u.id] = Number(run('INSERT INTO users(name,role_id,region_id,store_id,phone,active) VALUES(?,?,?,?,?,?)', nm(), u.role_id, id, sid, phone(), u.active).lastInsertRowid);
      const srcSM = q1('SELECT user_id FROM user_stores WHERE store_id=?', src.id).user_id, fb = Object.values(umap)[0];
      const mapU = v => v == null ? v : umap[v] ?? (v === srcSM ? null : v);
      for (const a of q('SELECT * FROM assignments WHERE store_id=?', src.id)) if (umap[a.user_id]) run('INSERT INTO assignments(store_id,template_id,user_id) VALUES(?,?,?)', sid, a.template_id, umap[a.user_id]);
      for (const o of q('SELECT * FROM scene_owners WHERE store_id=?', src.id)) run('INSERT INTO scene_owners(store_id,scene_id,user_id) VALUES(?,?,?)', sid, o.scene_id, umap[o.user_id] || fb);
      for (const t of CLONE) {
        const cs = cols(t).filter(c => !(c.pk && c.name === 'id')).map(c => c.name);
        const ins = D.db.prepare(`INSERT OR IGNORE INTO ${t}(${cs.join(',')}) VALUES(${cs.map(() => '?').join(',')})`);
        for (const row of q(`SELECT * FROM ${t} WHERE store_id=?`, src.id)) {
          if (t === 'meal_rate' && !umap[row.user_id]) continue;
          const v = cs.map(c => c === 'store_id' ? sid : UCOL.has(c) ? mapU(row[c]) : row[c]);
          if (t === 'hr_moves') v[cs.indexOf('name')] = row.user_id && umap[row.user_id] ? q1('SELECT name FROM users WHERE id=?', umap[row.user_id]).name : nm();
          if (t === 'safety_plans') { const pid = Number(ins.run(...v).lastInsertRowid); for (const lg of q('SELECT * FROM safety_logs WHERE plan_id=?', row.id)) run('INSERT INTO safety_logs(plan_id,store_id,date,"by",result,note,photo) VALUES(?,?,?,?,?,?,?)', pid, sid, lg.date, mapU(lg.by), lg.result, lg.note, lg.photo); continue; }
          ins.run(...v);
        }
      }
    }
    let i = 0;
    for (const n of SMPLAN[id] || SMPLAN.def) { const sm = addU(nm(), '店长', id, null); for (const s of mine.slice(i, i + n)) run('INSERT INTO user_stores(user_id,store_id) VALUES(?,?)', sm, s); i += n; }
    // reserve store managers: 2-3 store assistants per region
    const pool = q("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id JOIN stores s ON s.id=u.store_id WHERE s.region_id=? AND r.name='店助' AND u.active=1 ORDER BY u.id", id);
    for (const x of pool.filter((_, j) => j % 11 === 3).slice(0, 2 + (id % 2))) run("UPDATE users SET reserve='sm' WHERE id=?", x.id);
  }
  for (const [reg, mentorReg] of [[1, 1], [6, 6]]) {
    const u = addU(nm(), '储备区域经理', reg, null, { reserve: 'rm' }), m = q1("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.level='region_manager' AND u.region_id=? ORDER BY u.id", mentorReg).id;
    run("INSERT INTO mentors(mentee_id,mentor_id,start,checks,status) VALUES(?,?,?,?,'active')", u, m, L.addDays(T, -45), '[]');
  }
});
const tplInfo = Object.fromEntries(q('SELECT id, m, need_value FROM templates').map(t => [t.id, t]));
const CHECK = { M1: 0, M2: 0.9, M3: 0.25, M4: 0.3 };
for (let d = -DAYS; d <= 0; d++) {
  const date = L.addDays(T, d);
  D.ensureInstances(date, newIds);
  if (d === 0) continue;
  const rows = q('SELECT * FROM instances WHERE date=? AND id>?', date, maxInst);
  tx(() => {
    for (const it of rows) {
      if (r() >= QUAL[it.store_id]) continue;
      const doneAt = date + ' ' + L.addMinutes(it.due_time, r() < 0.15 ? 25 : -Math.floor(r() * 20));
      const ti = it.src === 'tpl' ? tplInfo[it.src_id] : null;
      let check = null, comment = null, by = null;
      if (r() < (ti && ti.m ? CHECK[ti.m] : 0.25) * 0.4) {
        const bad = r() < (QUAL[it.store_id] < 0.8 ? 0.3 : 0.1);
        check = bad ? 'bad' : 'good'; comment = bad ? '未达标准：' + (it.need_photo ? '照片显示现场不达标' : '记录不完整') : '执行到位，继续保持';
        by = D.storeManagers(it.store_id)[0];
      }
      run("UPDATE instances SET status='done', done_at=?, check_result=?, check_comment=?, checked_by=?, checked_at=?, photo=CASE WHEN need_photo=1 THEN '/demo-photo.svg' END WHERE id=?", doneAt, check, comment, by, check ? date + ' 17:30' : null, it.id);
      if (check === 'bad') {
        const dl = L.addDays(date, 3), closed = dl < L.addDays(T, -2) ? r() < 0.9 : dl < T && r() < 0.6;
        run(`INSERT INTO rectifications(instance_id,store_id,assignee_id,reason,training,task,deadline,status,created_by,created_at,submit_note,submitted_at,verify_comment,verified_by,verified_at,escalated)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`, it.id, it.store_id, it.assignee_id, comment, '由店长现场复训标准流程 15 分钟', '按标准重新执行并拍照上传', dl, closed ? 'closed' : 'open', by, date + ' 17:30',
          closed ? '已整改完成' : null, closed ? L.addDays(date, 2) + ' 10:00' : null, closed ? '复查合格' : null, closed ? by : null, closed ? L.addDays(date, 2) + ' 16:00' : null);
      }
    }
  });
}
run('UPDATE instances SET escalated=1 WHERE date<? AND id>?', T, maxInst);
tx(() => { for (const sid of newIds) if (r() < 0.55) { const d = -Math.floor(r() * 75) - 1, sc = Math.round(55 + QUAL[sid] * 40 + (r() - 0.5) * 10);
  const rm = q1("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id JOIN stores s ON s.region_id=u.region_id WHERE r.level='region_manager' AND s.id=?", sid).id;
  run("INSERT INTO patrols(store_id,planned_date,reason,status,score,summary,created_by,created_at,done_at) VALUES(?,?,?,'done',?,?,?,?,?)", sid, L.addDays(T, d), '例行巡店', sc, sc < 75 ? '执行和卫生问题较多，已下整改' : '整体达标', rm, L.addDays(T, d - 2) + ' 10:00', L.addDays(T, d) + ' 16:00'); } });
for (const s of q('SELECT id FROM stores')) D.refreshPending(s.id);
console.log('regions', q1('SELECT COUNT(*) n FROM regions').n, 'stores', q1('SELECT COUNT(*) n FROM stores').n, 'users', q1('SELECT COUNT(*) n FROM users WHERE active=1').n,
  'sm', q1("SELECT COUNT(*) n FROM users u JOIN roles r ON r.id=u.role_id WHERE r.level='store_manager'").n, 'rsm', q1("SELECT COUNT(*) n FROM users WHERE reserve='sm'").n, 'rrm', q1("SELECT COUNT(*) n FROM users WHERE reserve='rm'").n,
  'inst', q1('SELECT COUNT(*) n FROM instances').n, 'rect', q1('SELECT COUNT(*) n FROM rectifications').n);
