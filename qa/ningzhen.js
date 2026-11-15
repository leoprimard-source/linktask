// import the real 宁镇省区 structure (from an xlsx exported to JSON) into a fresh 12-store data copy; people not in the sheet stay virtual (name + \u2063虚).
// usage: DATA_DIR=dir NZ_JSON=/path/nz.json DAYS=30 node ningzhen.js   nz.json = { fn: [[title, name]...], hotels: [[hotel, cityHead, storeManager]...] }
const D = require('../db.js'), L = require('../lib.js');
const { q, q1, run, tx } = D, DAYS = Number(process.env.DAYS || 30);
const NZ = JSON.parse(require('fs').readFileSync(process.env.NZ_JSON, 'utf8'));
if (q1('SELECT COUNT(*) n FROM stores').n !== 12) throw new Error('expect 12 stores');
let s0 = 3062026; const r = () => (s0 = (s0 * 1103515245 + 12345) % 2147483648) / 2147483648;
const T = L.today(), VX = '\u2063虚';
run("UPDATE roles SET name='城市总' WHERE name='区域经理'");
run("UPDATE roles SET name='省区运营官' WHERE name='省区总经理'");
for (const [n, lv] of [['省区运营官', 'hq'], ['储备区域经理', 'coach'], ['营销官', 'sales_manager'], ['省区销售经理', 'sales_manager']]) if (!q1('SELECT 1 FROM roles WHERE name=?', n)) run('INSERT INTO roles(name,level,sort) VALUES(?,?,0)', n, lv);
const rid = n => q1('SELECT id FROM roles WHERE name=?', n).id;
if (!q1('SELECT 1 FROM provinces')) run("INSERT INTO provinces(id,name) VALUES(1,'宁镇省区')"); else run("UPDATE provinces SET name='宁镇省区'");
run('UPDATE regions SET province_id=1');
const BRANDS = ['泊金·全季', '汉庭优佳', '汉庭', '全季', '桔子', '星程', '你好', '宜必思', '怡莱'];
const brandOf = h => BRANDS.find(b => h.startsWith(b)) || '全季';
const cityOf = h => h.includes('宝华') ? '句容' : ['南京', '镇江', '丹阳', '扬中', '句容'].find(c => h.includes(c)) || '南京';
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
const byCz = {}; for (const [h, cz, sm] of NZ.hotels) (byCz[cz] ||= []).push([h, sm]);
const CZ = Object.keys(byCz).sort((a, b) => byCz[b].length - byCz[a].length), sidOf = {}, regOfStore = {};
tx(() => {
  for (const u of q('SELECT id, name FROM users')) run('UPDATE users SET name=? WHERE id=?', u.name + VX, u.id);
  const FN = { 运营官: '省区运营官', 营销官: '营销官', 营销经理: '营销经理', 省区销售经理: '省区销售经理', 运营经理: '运营经理' };
  for (const [t, n] of NZ.fn) { const ex = ['营销经理', '运营经理'].includes(t) && q1('SELECT id FROM users WHERE role_id=? AND active=1 ORDER BY id', rid(t)); if (ex) run('UPDATE users SET name=? WHERE id=?', n, ex.id); else addU(n, FN[t], 1, null); }
  CZ.forEach((cz, i) => {
    const id = i + 1;
    if (id === 1) run('UPDATE regions SET name=? WHERE id=1', cz + '区'); else run('INSERT INTO regions(id,name,province_id) VALUES(?,?,1)', id, cz + '区');
    const rm = id === 1 && q1('SELECT id FROM users WHERE role_id=? AND region_id=1 AND active=1 ORDER BY id', rid('城市总'));
    if (rm) run('UPDATE users SET name=? WHERE id=?', cz, rm.id); else addU(cz, '城市总', id, null);
    byCz[cz].forEach(([name], k) => {
      const brand = brandOf(name), city = cityOf(name); regOfStore[name] = id;
      if (id === 1 && k < srcStores.length) { const s = srcStores[k]; run('UPDATE stores SET name=?, brand=?, address=?, code=? WHERE id=?', name, brand, city + '市', 'NZ1-' + (k + 1), s.id); sidOf[name] = s.id; return; }
      const src = srcStores[(k + id) % srcStores.length];
    const qv = 0.62 + r() * 0.34, age = r(), open = age < 0.12 ? L.addDays(T, -30 - Math.floor(r() * 140)) : L.addDays(T, -400 - Math.floor(r() * 2600));
    const lc = age < 0.12 ? '爬坡' : age > 0.9 ? '改造' : '成熟', stype = r() < 0.6 ? '加盟店' : '直营店';
    const sid = Number(run('INSERT INTO stores(region_id,name,code,address,brand,stype,open_date,rooms,tags,lc_stage) VALUES(?,?,?,?,?,?,?,?,?,?)', id, name, 'NZ' + id + '-' + (k + 1), city + '市', brand, stype, open, 100 + Math.floor(r() * 120), lc === '爬坡' ? '新开业' : qv < 0.7 ? '重点帮扶' : '', lc).lastInsertRowid);
    QUAL[sid] = qv; newIds.push(sid);
    const umap = {};
    for (const u of q('SELECT * FROM users WHERE store_id=?', src.id)) umap[u.id] = Number(run('INSERT INTO users(name,role_id,region_id,store_id,phone,active) VALUES(?,?,?,?,?,?)', nm() + VX, u.role_id, id, sid, phone(), u.active).lastInsertRowid);
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
        if (t === 'hr_moves') v[cs.indexOf('name')] = row.user_id && umap[row.user_id] ? q1('SELECT name FROM users WHERE id=?', umap[row.user_id]).name : nm() + VX;
        if (t === 'safety_plans') { const pid = Number(ins.run(...v).lastInsertRowid); for (const lg of q('SELECT * FROM safety_logs WHERE plan_id=?', row.id)) run('INSERT INTO safety_logs(plan_id,store_id,date,"by",result,note,photo) VALUES(?,?,?,?,?,?,?)', pid, sid, lg.date, mapU(lg.by), lg.result, lg.note, lg.photo); continue; }
        ins.run(...v);
      }
    }
      sidOf[name] = sid;
    });
  });
  // store managers: reuse the original SM accounts (keeps stage/coaching history) for the real SMs of the 12 original stores
  const origSM = {}; for (const s of srcStores) origSM[s.id] = q('SELECT user_id FROM user_stores WHERE store_id=?', s.id).map(x => x.user_id);
  const smStores = {}; for (const [h, , sm] of NZ.hotels) (smStores[sm] ||= []).push(sidOf[h]);
  run("DELETE FROM user_stores WHERE user_id IN (SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.level='store_manager')");
  const reused = new Set(), smOf = {};
  for (const [sm, sids] of Object.entries(smStores)) {
    const old = sids.flatMap(s => origSM[s] || []).find(x => !reused.has(x));
    let id; if (old) { reused.add(old); id = old; run('UPDATE users SET name=?, active=1 WHERE id=?', sm, id); }
    else id = addU(sm, '店长', q1('SELECT region_id FROM stores WHERE id=?', sids[0]).region_id, null);
    for (const s of sids) { run('INSERT INTO user_stores(user_id,store_id) VALUES(?,?)', id, s); smOf[s] = id; }
  }
  for (const ids of Object.values(origSM)) for (const x of ids) if (!reused.has(x)) run('UPDATE users SET active=0 WHERE id=?', x);
  const ST = q("SELECT name FROM sqlite_master WHERE type='table'").map(t => t.name).filter(t => cols(t).some(c => c.name === 'store_id'));
  for (const s of srcStores) for (const old of origSM[s.id]) if (old !== smOf[s.id]) for (const t of ST) for (const c of cols(t).filter(c => UCOL.has(c.name) || ['orig_assignee_id', 'checked_by', 'verified_by'].includes(c.name)))
    run(`UPDATE ${t} SET "${c.name}"=? WHERE store_id=? AND "${c.name}"=?`, smOf[s.id], s.id, old);
  for (let id = 1; id <= CZ.length; id++) {
    const pool = q("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id JOIN stores s ON s.id=u.store_id WHERE s.region_id=? AND r.name='店助' AND u.active=1 AND u.reserve IS NULL ORDER BY u.id", id);
    if (id > 1) for (const x of pool.filter((_, j) => j % 11 === 3).slice(0, 2 + (id % 2))) run("UPDATE users SET reserve='sm' WHERE id=?", x.id);
  }
  for (const reg of [1, 2]) {
    const u = addU(nm() + VX, '储备区域经理', reg, null, { reserve: 'rm' }), m = q1("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.level='region_manager' AND u.region_id=? ORDER BY u.id", reg).id;
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