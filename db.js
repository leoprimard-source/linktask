const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const L = require('./lib');

const DATA_DIR = process.env.DATA_DIR || path.join(require('os').homedir(), 'linktask-data');
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'linktask.db'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS regions(id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE IF NOT EXISTS stores(id INTEGER PRIMARY KEY, region_id INTEGER, name TEXT, code TEXT, address TEXT);
CREATE TABLE IF NOT EXISTS roles(id INTEGER PRIMARY KEY, name TEXT UNIQUE, level TEXT, sort INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT, role_id INTEGER, region_id INTEGER, store_id INTEGER, phone TEXT, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS user_stores(user_id INTEGER, store_id INTEGER, PRIMARY KEY(user_id, store_id));
CREATE TABLE IF NOT EXISTS scenes(id INTEGER PRIMARY KEY, name TEXT, sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS templates(id INTEGER PRIMARY KEY, scene_id INTEGER, role_id INTEGER, title TEXT, standard TEXT,
  due_time TEXT, freq TEXT DEFAULT 'daily', freq_val INTEGER, category TEXT DEFAULT 'ops', need_photo INTEGER DEFAULT 0, active INTEGER DEFAULT 1,
  src TEXT DEFAULT 'std', code TEXT, area TEXT, sub TEXT, score TEXT, tag TEXT, m TEXT, l TEXT, f TEXT, need_value INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS assignments(store_id INTEGER, template_id INTEGER, user_id INTEGER, PRIMARY KEY(store_id, template_id));
CREATE TABLE IF NOT EXISTS scene_owners(store_id INTEGER, scene_id INTEGER, user_id INTEGER, PRIMARY KEY(store_id, scene_id));
CREATE TABLE IF NOT EXISTS leaves(id INTEGER PRIMARY KEY, user_id INTEGER, date TEXT, cover_user_id INTEGER, note TEXT, created_by INTEGER, UNIQUE(user_id, date));
CREATE TABLE IF NOT EXISTS flex_tasks(id INTEGER PRIMARY KEY, store_id INTEGER, scene_id INTEGER, title TEXT, standard TEXT, assignee_id INTEGER,
  recur TEXT, recur_val INTEGER, start_date TEXT, end_date TEXT, due_time TEXT, need_photo INTEGER DEFAULT 0, source TEXT DEFAULT 'flex',
  created_by INTEGER, created_at TEXT, active INTEGER DEFAULT 1, ref TEXT);
CREATE TABLE IF NOT EXISTS instances(id INTEGER PRIMARY KEY, store_id INTEGER, date TEXT, src TEXT, src_id INTEGER, scene_id INTEGER, title TEXT,
  standard TEXT, category TEXT, origin TEXT, assignee_id INTEGER, orig_assignee_id INTEGER, due_time TEXT, need_photo INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending', done_at TEXT, done_note TEXT, photo TEXT, check_result TEXT, check_comment TEXT, checked_by INTEGER, checked_at TEXT,
  escalated INTEGER DEFAULT 0, reading TEXT, UNIQUE(src, src_id, store_id, date));
CREATE INDEX IF NOT EXISTS idx_inst_date ON instances(date, store_id);
CREATE INDEX IF NOT EXISTS idx_inst_user ON instances(assignee_id, date);
CREATE INDEX IF NOT EXISTS idx_inst_store ON instances(store_id, date);
CREATE TABLE IF NOT EXISTS rectifications(id INTEGER PRIMARY KEY, instance_id INTEGER, store_id INTEGER, assignee_id INTEGER, reason TEXT, training TEXT,
  task TEXT, deadline TEXT, status TEXT DEFAULT 'open', created_by INTEGER, created_at TEXT, submit_note TEXT, submit_photo TEXT, submitted_at TEXT,
  verify_comment TEXT, verified_by INTEGER, verified_at TEXT, escalated INTEGER DEFAULT 0, source TEXT DEFAULT 'check');
CREATE INDEX IF NOT EXISTS idx_rect_store ON rectifications(store_id, status);
CREATE INDEX IF NOT EXISTS idx_rect_inst ON rectifications(instance_id);
CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY, user_id INTEGER, created_at TEXT, kind TEXT, title TEXT, body TEXT, link TEXT, read INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read);
CREATE TABLE IF NOT EXISTS reminder_log(date TEXT, time TEXT, PRIMARY KEY(date, time));
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS owner_reqs(id INTEGER PRIMARY KEY, store_id INTEGER, kind TEXT, title TEXT, body TEXT, status TEXT DEFAULT 'open', escalated INTEGER DEFAULT 0, created_by INTEGER, created_at TEXT, reply TEXT, replied_by INTEGER, replied_at TEXT, closed_at TEXT);
CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY, store_id INTEGER, period TEXT, body TEXT, status TEXT DEFAULT 'submitted', created_by INTEGER, created_at TEXT, comment TEXT, reviewed_by INTEGER, reviewed_at TEXT);
CREATE TABLE IF NOT EXISTS hr_suggest(id INTEGER PRIMARY KEY, user_id INTEGER, store_id INTEGER, kind TEXT, note TEXT, status TEXT DEFAULT 'open', created_by INTEGER, created_at TEXT, reply TEXT, replied_by INTEGER, replied_at TEXT);
CREATE TABLE IF NOT EXISTS patrols(id INTEGER PRIMARY KEY, store_id INTEGER, planned_date TEXT, reason TEXT, status TEXT DEFAULT 'planned',
  score INTEGER, summary TEXT, created_by INTEGER, created_at TEXT, done_at TEXT);
CREATE TABLE IF NOT EXISTS patrol_items(id INTEGER PRIMARY KEY, patrol_id INTEGER, scene_id INTEGER, item TEXT, score INTEGER, max INTEGER, comment TEXT,
  code TEXT, tag TEXT, result TEXT);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, at TEXT, user_id INTEGER, store_id INTEGER, action TEXT, detail TEXT);
`);

for (const [t, c] of [['regions', 'province_id INTEGER'], ['users', 'reserve TEXT'],
  ['users', 'view_region INTEGER'], ['templates', "src TEXT DEFAULT 'std'"], ['templates', 'code TEXT'], ['templates', 'area TEXT'], ['templates', 'sub TEXT'], ['templates', 'score TEXT'],
  ['templates', 'tag TEXT'], ['templates', 'm TEXT'], ['templates', 'l TEXT'], ['templates', 'f TEXT'], ['templates', 'need_value INTEGER DEFAULT 0'],
  ['instances', 'reading TEXT'], ['instances', 'manual INTEGER DEFAULT 0'], ['instances', 'why TEXT'], ['flex_tasks', 'line TEXT'], ['templates', "layer TEXT DEFAULT 'hq'"], ['templates', 'scope_id INTEGER'], ['flex_tasks', 'minutes INTEGER'], ['flex_tasks', 'deferred INTEGER DEFAULT 0'], ['templates', 'pillar TEXT'], ['flex_tasks', 'pillar TEXT'], ['stores', 'brand TEXT'], ['stores', 'stype TEXT'], ['stores', 'open_date TEXT'], ['stores', 'rooms INTEGER'], ['patrol_items', 'code TEXT'], ['patrol_items', 'tag TEXT'], ['patrol_items', 'result TEXT'],
  ['patrols', "kind TEXT DEFAULT 'patrol'"], ['patrols', 'mode TEXT'], ['patrols', 'parent_id INTEGER'], ['patrols', 'codes TEXT'], ['patrols', 'recheck_result TEXT'], ['patrols', 'owner_sent TEXT'],
  ['patrol_items', 'photo TEXT'], ['patrol_items', 'rect_id INTEGER'], ['patrol_items', 'recheck TEXT'], ['patrol_items', 'recheck_comment TEXT'], ['rectifications', 'title TEXT'], ['rectifications', 'ref TEXT'], ['instances', 'deleg_id INTEGER'], ['instances', 'deleg_review INTEGER'], ['patrols', 'focus TEXT'], ['instances', 'photos TEXT'], ['instances', 'due_date TEXT'], ['delegations', 'notify_done INTEGER DEFAULT 0'], ['templates', 'win TEXT']]) {
  try { db.exec(`ALTER TABLE ${t} ADD COLUMN ${c}`); } catch { /* exists */ }
}
db.exec('CREATE TABLE IF NOT EXISTS provinces(id INTEGER PRIMARY KEY, name TEXT)');
db.exec('CREATE TABLE IF NOT EXISTS meetings(id INTEGER PRIMARY KEY, store_id INTEGER, ym TEXT, title TEXT, inst_id INTEGER, sm_id INTEGER, rm_id INTEGER, invite_rm INTEGER DEFAULT 0, invite_why TEXT, start_at TEXT, status TEXT DEFAULT \'pending\', minutes_url TEXT, valid INTEGER, fr_joined INTEGER, rm_joined INTEGER, src TEXT, demo INTEGER DEFAULT 0, created_at TEXT, done_at TEXT)');
db.exec('CREATE TABLE IF NOT EXISTS exempts(date TEXT, store_id INTEGER, tpl_id INTEGER, ym TEXT, score INTEGER, PRIMARY KEY(date, store_id, tpl_id))');
db.exec('CREATE TABLE IF NOT EXISTS month_scores(store_id INTEGER, ym TEXT, score INTEGER, at TEXT, PRIMARY KEY(store_id, ym))');
db.exec('CREATE TABLE IF NOT EXISTS saves(user_id INTEGER, kind TEXT, key TEXT, date TEXT, min INTEGER, teach INTEGER, PRIMARY KEY(user_id, key, date))');
db.exec("CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, title TEXT, kind TEXT, dept TEXT, start TEXT, end TEXT, stores TEXT, note TEXT, src TEXT DEFAULT 'manual', by INTEGER, at TEXT)");
db.exec(`CREATE TABLE IF NOT EXISTS data_sources(id INTEGER PRIMARY KEY, kind TEXT UNIQUE, name TEXT, sys TEXT, metrics TEXT, owner TEXT, status TEXT DEFAULT 'demo', note TEXT, last_at TEXT, rows INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS ext_data(source TEXT, store_id INTEGER, date TEXT, k TEXT, v REAL, txt TEXT, batch INTEGER, PRIMARY KEY(source, store_id, date, k));
CREATE TABLE IF NOT EXISTS import_log(id INTEGER PRIMARY KEY, source TEXT, at TEXT, by TEXT, total INTEGER, ok INTEGER, bad INTEGER, err TEXT)`);
if (!db.prepare('SELECT 1 FROM data_sources LIMIT 1').get()) for (const r of [
  ['pms', 'PMS 酒店管理系统', '华住 PMS', 'occ 出租率,adr 平均房价,revpar 每间可售房收入,rev 客房收入'],
  ['hr', '人事系统', 'HR / 考勤', 'headcount 在职人数,leave 离职人数,attend 出勤率'],
  ['review', '点评平台', '美团 / 携程 / 飞猪', 'score 点评分,bad 差评数,reply 回复率'],
  ['energy', '能耗', '电表 / 水表', 'power 用电度数,water 用水吨数'],
  ['finance', '财务', '财务系统', 'gop 经营毛利,cost 人工成本'],
]) db.prepare("INSERT INTO data_sources(kind,name,sys,metrics,status,note) VALUES(?,?,?,?,'demo','当前使用模拟数据，等待 IT 提供接口')").run(...r);
db.exec('CREATE TABLE IF NOT EXISTS handpack_ack(id INTEGER PRIMARY KEY, store_id INTEGER, user_id INTEGER, note TEXT, at TEXT)');
db.exec('CREATE TABLE IF NOT EXISTS tpl_layers(tpl_id INTEGER, layer TEXT, scope_id INTEGER, off INTEGER, due_time TEXT, reason TEXT, by INTEGER, at TEXT, PRIMARY KEY(tpl_id, layer, scope_id))');
db.exec('CREATE TABLE IF NOT EXISTS coach_stores(coach_id INTEGER, store_id INTEGER, by INTEGER, at TEXT, PRIMARY KEY(coach_id, store_id))');
db.exec('CREATE TABLE IF NOT EXISTS esc_events(id INTEGER PRIMARY KEY, date TEXT, store_id INTEGER, inst_id INTEGER, level INTEGER, title TEXT, who TEXT, at TEXT)');
db.exec('CREATE INDEX IF NOT EXISTS esc_ev_ds ON esc_events(date, store_id)');
db.exec('CREATE TABLE IF NOT EXISTS night_audit(date TEXT, store_id INTEGER, total INTEGER, moved INTEGER, need_sm INTEGER, at TEXT, PRIMARY KEY(date, store_id))');
db.exec(`CREATE TABLE IF NOT EXISTS sm_stage(user_id INTEGER PRIMARY KEY, stage TEXT, start TEXT, set_by INTEGER, note TEXT);
CREATE TABLE IF NOT EXISTS stage_steps(user_id INTEGER, stage TEXT, step TEXT, done_at TEXT, note TEXT, ok_by INTEGER, ok_at TEXT, PRIMARY KEY(user_id, stage, step));
CREATE TABLE IF NOT EXISTS punches(user_id INTEGER, date TEXT, kind TEXT, at TEXT, PRIMARY KEY(user_id, date, kind));
CREATE TABLE IF NOT EXISTS day_log(id INTEGER PRIMARY KEY, user_id INTEGER, date TEXT, store_id INTEGER, code TEXT, end_hm TEXT, in_at TEXT, out_at TEXT, status TEXT DEFAULT 'open', items TEXT, note TEXT, focus TEXT, snap TEXT, reminded INTEGER DEFAULT 0, comment TEXT, comment_by INTEGER, created_at TEXT, UNIQUE(user_id, date));
CREATE TABLE IF NOT EXISTS carries(id INTEGER PRIMARY KEY, from_id INTEGER, to_id INTEGER, store_id INTEGER, src TEXT, src_id INTEGER, text TEXT, dest TEXT, date TEXT, status TEXT DEFAULT 'open', days INTEGER DEFAULT 0, reason TEXT, created_at TEXT, ack_at TEXT, nudged INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS sched_pub(store_id INTEGER, week TEXT, by INTEGER, at TEXT, PRIMARY KEY(store_id, week));
CREATE TABLE IF NOT EXISTS rsv_tasks(id INTEGER PRIMARY KEY, user_id INTEGER, by_id INTEGER, store_id INTEGER, kind TEXT, title TEXT, due TEXT, status TEXT DEFAULT 'open', note TEXT, score INTEGER, created_at TEXT, done_at TEXT);`);
db.exec(`CREATE TABLE IF NOT EXISTS delegations(id INTEGER PRIMARY KEY, store_id INTEGER, from_id INTEGER, to_id INTEGER, scope TEXT, inst_id INTEGER, src TEXT, src_id INTEGER,
  title TEXT, start TEXT, end TEXT, review INTEGER DEFAULT 1, active INTEGER DEFAULT 1, created_at TEXT, revoked_at TEXT)`);
const STORE_INFO = { 1: ['全季 4.0', '直营店', '2021-06-18', 168], 2: ['全季 4.0', '加盟店', '2022-09-30', 132], 3: ['全季 3.6', '加盟店', '2019-04-26', 205] };
try { db.prepare("UPDATE stores SET stype='加盟店' WHERE id=3 AND stype='直营店'").run(); } catch { /* fresh db */ }
db.exec("CREATE TABLE IF NOT EXISTS store_plans(id INTEGER PRIMARY KEY, store_id INTEGER, dim TEXT, title TEXT, base INTEGER, target INTEGER, owner_id INTEGER, due TEXT, status TEXT DEFAULT 'open', progress INTEGER DEFAULT 0, updates TEXT, result TEXT, created_by INTEGER, created_at TEXT, closed_at TEXT)");
db.exec(`CREATE TABLE IF NOT EXISTS repairs(id INTEGER PRIMARY KEY, store_id INTEGER, location TEXT, title TEXT, body TEXT, urgency TEXT DEFAULT 'normal', photo TEXT,
  status TEXT DEFAULT 'open', created_by INTEGER, created_at TEXT, due_at TEXT, assignee_id INTEGER, accepted_at TEXT, done_at TEXT, done_note TEXT, done_photo TEXT,
  closed_at TEXT, rating INTEGER, esc_level INTEGER DEFAULT 0, log TEXT)`);
db.exec(`CREATE TABLE IF NOT EXISTS projects(id INTEGER PRIMARY KEY, region_id INTEGER, name TEXT, city TEXT, brand TEXT, stype TEXT, rooms INTEGER, owner TEXT, owner_company TEXT,
  dev_id INTEGER, build_id INTEGER, sign_date TEXT, fund_ok INTEGER DEFAULT 0, budget INTEGER, paid INTEGER, changes INTEGER, staff_plan INTEGER, staff_hired INTEGER, staff_trained INTEGER,
  sm_name TEXT, status TEXT DEFAULT 'active', store_id INTEGER, exit_note TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS project_nodes(id INTEGER PRIMARY KEY, project_id INTEGER, key TEXT, name TEXT, sort INTEGER, plan_date TEXT, actual_date TEXT, owner_id INTEGER, data TEXT);
CREATE TABLE IF NOT EXISTS store_events(id INTEGER PRIMARY KEY, store_id INTEGER, project_id INTEGER, kind TEXT, at TEXT, note TEXT, by INTEGER);`);
db.exec(`CREATE TABLE IF NOT EXISTS materials(id INTEGER PRIMARY KEY, cat TEXT, name TEXT, unit TEXT, central INTEGER, std_per_rn REAL, price REAL);
CREATE TABLE IF NOT EXISTS store_stock(store_id INTEGER, material_id INTEGER, qty REAL, safety REAL, PRIMARY KEY(store_id, material_id));
CREATE TABLE IF NOT EXISTS purchases(id INTEGER PRIMARY KEY, store_id INTEGER, month TEXT, cat TEXT, amount INTEGER, central INTEGER);
CREATE TABLE IF NOT EXISTS requisitions(id INTEGER PRIMARY KEY, store_id INTEGER, items TEXT, status TEXT, note TEXT, created_by INTEGER, created_at TEXT, approved_by INTEGER, received_at TEXT);
CREATE TABLE IF NOT EXISTS stocktakes(id INTEGER PRIMARY KEY, store_id INTEGER, date TEXT, status TEXT, assignee_id INTEGER, items TEXT, created_by INTEGER, created_at TEXT, done_by INTEGER, done_at TEXT);
CREATE TABLE IF NOT EXISTS train_classes(id INTEGER PRIMARY KEY, region_id INTEGER, name TEXT, kind TEXT, cert TEXT, start TEXT, end TEXT, seats INTEGER, trainer_id INTEGER, note TEXT);
CREATE TABLE IF NOT EXISTS train_enroll(id INTEGER PRIMARY KEY, class_id INTEGER, user_id INTEGER, status TEXT, score INTEGER, created_at TEXT, by INTEGER);
CREATE TABLE IF NOT EXISTS onboard_plan(user_id INTEGER PRIMARY KEY, start TEXT, coach_id INTEGER);
CREATE TABLE IF NOT EXISTS onboard(user_id INTEGER, step TEXT, done_at TEXT, note TEXT, ok_by INTEGER, ok_at TEXT, PRIMARY KEY(user_id, step));
CREATE TABLE IF NOT EXISTS coach_logs(id INTEGER PRIMARY KEY, sm_id INTEGER, coach_id INTEGER, date TEXT, topic TEXT, note TEXT, next TEXT);
CREATE TABLE IF NOT EXISTS cal_events(id INTEGER PRIMARY KEY, region_id INTEGER, date TEXT, kind TEXT, title TEXT, store_id INTEGER, by INTEGER);
CREATE TABLE IF NOT EXISTS survey_resp(id INTEGER PRIMARY KEY, store_id INTEGER, q TEXT, a1 INTEGER, a2 INTEGER, a3 INTEGER, a4 INTEGER, a5 INTEGER, comment TEXT, at TEXT);
CREATE TABLE IF NOT EXISTS survey_done(user_id INTEGER, q TEXT, PRIMARY KEY(user_id, q));
CREATE TABLE IF NOT EXISTS talks(id INTEGER PRIMARY KEY, user_id INTEGER, by INTEGER, date TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS hc_plan(store_id INTEGER, pos TEXT, n INTEGER, PRIMARY KEY(store_id, pos));
CREATE TABLE IF NOT EXISTS hr_moves(id INTEGER PRIMARY KEY, store_id INTEGER, user_id INTEGER, name TEXT, role TEXT, pos TEXT, kind TEXT, date TEXT, hire TEXT, reason TEXT, voluntary INTEGER, note TEXT, src TEXT, to_store INTEGER, to_pos TEXT, by INTEGER);
CREATE TABLE IF NOT EXISTS recruit(id INTEGER PRIMARY KEY, store_id INTEGER, pos TEXT, n INTEGER, stage TEXT, channel TEXT, opened TEXT, filled TEXT, cand TEXT, by INTEGER);
CREATE TABLE IF NOT EXISTS meal_menu(store_id INTEGER, week TEXT, body TEXT, by INTEGER, at TEXT, PRIMARY KEY(store_id, week));
CREATE TABLE IF NOT EXISTS meal_rate(user_id INTEGER, ym TEXT, store_id INTEGER, score INTEGER, comment TEXT, PRIMARY KEY(user_id, ym));
CREATE TABLE IF NOT EXISTS care_act(id INTEGER PRIMARY KEY, store_id INTEGER, kind TEXT, title TEXT, date TEXT, n_join INTEGER, n_total INTEGER, cost INTEGER, photo TEXT, note TEXT, by INTEGER);
CREATE TABLE IF NOT EXISTS care_log(id INTEGER PRIMARY KEY, store_id INTEGER, user_id INTEGER, kind TEXT, date TEXT, note TEXT, follow TEXT, by INTEGER);
CREATE TABLE IF NOT EXISTS suggest(id INTEGER PRIMARY KEY, store_id INTEGER, cat TEXT, body TEXT, at TEXT, reply TEXT, reply_at TEXT, reply_by INTEGER);
CREATE TABLE IF NOT EXISTS dorm_check(id INTEGER PRIMARY KEY, store_id INTEGER, date TEXT, ok INTEGER, issues TEXT, photo TEXT, by INTEGER);
CREATE TABLE IF NOT EXISTS hardship(id INTEGER PRIMARY KEY, store_id INTEGER, user_id INTEGER, kind TEXT, amount INTEGER, reason TEXT, status TEXT, note TEXT, hr_by INTEGER, at TEXT, by INTEGER);
CREATE TABLE IF NOT EXISTS welfare(user_id INTEGER, item TEXT, year TEXT, done_at TEXT, by INTEGER, PRIMARY KEY(user_id, item, year));
CREATE TABLE IF NOT EXISTS kudos(id INTEGER PRIMARY KEY, store_id INTEGER, to_user INTEGER, from_user INTEGER, from_kind TEXT, text TEXT, at TEXT);
CREATE TABLE IF NOT EXISTS care_star(id INTEGER PRIMARY KEY, store_id INTEGER, user_id INTEGER, ym TEXT, reason TEXT, status TEXT, by INTEGER);
CREATE TABLE IF NOT EXISTS voice_fix(id INTEGER PRIMARY KEY, store_id INTEGER, theme TEXT, action TEXT, status TEXT, due TEXT, result TEXT, done_at TEXT, by INTEGER, at TEXT);
CREATE TABLE IF NOT EXISTS hq_notices(id INTEGER PRIMARY KEY, title TEXT, body TEXT, kind TEXT, by INTEGER, at TEXT);
CREATE TABLE IF NOT EXISTS complaints(id INTEGER PRIMARY KEY, store_id INTEGER, src TEXT, level TEXT, guest TEXT, room TEXT, body TEXT, staff_id INTEGER, owner_id INTEGER, status TEXT, due_at TEXT, created_by INTEGER, created_at TEXT, handle_note TEXT, handled_at TEXT, comp_amt INTEGER DEFAULT 0, comp_kind TEXT, comp_status TEXT DEFAULT 'none', comp_by INTEGER, cb_score INTEGER, cb_note TEXT, closed_at TEXT);
CREATE TABLE IF NOT EXISTS safety_plans(id INTEGER PRIMARY KEY, store_id INTEGER, kind TEXT, title TEXT, cycle INTEGER, last_date TEXT, next_date TEXT);
CREATE TABLE IF NOT EXISTS safety_logs(id INTEGER PRIMARY KEY, plan_id INTEGER, store_id INTEGER, date TEXT, by INTEGER, result TEXT, note TEXT, photo TEXT);
CREATE TABLE IF NOT EXISTS schedules(store_id INTEGER, user_id INTEGER, date TEXT, shift TEXT, PRIMARY KEY(user_id, date));
CREATE TABLE IF NOT EXISTS suppliers(id INTEGER PRIMARY KEY, name TEXT, cats TEXT);
CREATE TABLE IF NOT EXISTS supplier_ratings(id INTEGER PRIMARY KEY, supplier_id INTEGER, store_id INTEGER, req_id INTEGER, on_time INTEGER, quality INTEGER, price INTEGER, note TEXT, by INTEGER, at TEXT);
CREATE TABLE IF NOT EXISTS pay_appeals(id INTEGER PRIMARY KEY, user_id INTEGER, ym TEXT, item TEXT, reason TEXT, status TEXT, reply TEXT, by INTEGER, created_at TEXT, replied_at TEXT);
CREATE TABLE IF NOT EXISTS shift_logs(id INTEGER PRIMARY KEY, store_id INTEGER, date TEXT, shift TEXT, by INTEGER, issues TEXT, guest TEXT, equip TEXT, cash TEXT, status TEXT, created_at TEXT, taken_by INTEGER, taken_at TEXT, take_note TEXT);
CREATE TABLE IF NOT EXISTS mentors(id INTEGER PRIMARY KEY, mentee_id INTEGER, mentor_id INTEGER, start TEXT, checks TEXT, status TEXT);`);
try { db.exec('ALTER TABLE stores ADD COLUMN lc_stage TEXT'); } catch { /* exists */ }
try { db.exec('ALTER TABLE stores ADD COLUMN tags TEXT'); } catch { /* exists */ }
for (const [id, t] of [[1, '标杆复制'], [2, '店长兼管'], [3, '重点帮扶,改造规划']]) db.prepare('UPDATE stores SET tags=? WHERE id=? AND tags IS NULL').run(t, id);
for (const [id, v] of Object.entries(STORE_INFO)) try { db.prepare('UPDATE stores SET brand=?, stype=?, open_date=?, rooms=? WHERE id=? AND brand IS NULL').run(...v, Number(id)); } catch { /* fresh db */ }

db.exec(`CREATE TABLE IF NOT EXISTS value_daily(date TEXT, store_id INTEGER, k TEXT, n REAL, PRIMARY KEY(date, store_id, k));
CREATE TABLE IF NOT EXISTS ev_log(id INTEGER PRIMARY KEY, user_id INTEGER, store_id INTEGER, k TEXT, ms INTEGER, at TEXT);
CREATE INDEX IF NOT EXISTS ix_ev_k ON ev_log(k, id);`);

for (const ix of ['instances(checked_by, checked_at)', 'rectifications(assignee_id, created_at)', 'rectifications(created_by, created_at)', 'rectifications(verified_by, verified_at)',
  'patrols(created_by, status)', 'patrols(store_id, status)', 'flex_tasks(created_by, source)', 'audit(action, at)', 'leaves(user_id, date)', 'pay_appeals(user_id)', 'survey_resp(store_id, q)',
  'complaints(store_id, created_at)', 'users(store_id)', 'users(region_id)', 'user_stores(user_id)', 'user_stores(store_id)', 'coach_logs(sm_id)', 'talks(user_id)'])
  try { db.exec(`CREATE INDEX IF NOT EXISTS ix_${ix.replace(/\W+/g, '_')} ON ${ix}`); } catch { /* column missing */ }

const q = (sql, ...p) => db.prepare(sql).all(...p);
const q1 = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

function getSetting(k, def) { const r = q1('SELECT value FROM settings WHERE key=?', k); return r ? JSON.parse(r.value) : def; }
function setSetting(k, v) { run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, JSON.stringify(v)); }

function storeManagers(storeId) {
  return q(`SELECT u.id FROM users u JOIN user_stores us ON us.user_id=u.id JOIN roles r ON r.id=u.role_id
            WHERE us.store_id=? AND r.level='store_manager' AND u.active=1`, storeId).map(r => r.id);
}
function regionUsers(regionId, level) {
  return q(`SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.region_id=? AND r.level=? AND u.active=1`, regionId, level).map(r => r.id);
}

function baseAssignee(storeId, tpl) {
  const a = q1('SELECT a.user_id FROM assignments a JOIN users u ON u.id=a.user_id WHERE a.store_id=? AND a.template_id=? AND u.active=1', storeId, tpl.id);
  if (a) return a.user_id;
  const role = q1('SELECT level FROM roles WHERE id=?', tpl.role_id);
  if (role && role.level === 'store_manager') { const m = storeManagers(storeId); if (m.length) return m[0]; }
  const byRole = q1('SELECT id FROM users WHERE store_id=? AND role_id=? AND active=1 ORDER BY id', storeId, tpl.role_id);
  if (byRole) return byRole.id;
  const owner = q1('SELECT user_id FROM scene_owners WHERE store_id=? AND scene_id=?', storeId, tpl.scene_id);
  if (owner) return owner.user_id;
  return storeManagers(storeId)[0] || null;
}
function coverFor(userId, date, storeId) {
  if (!userId) return userId;
  const lv = q1('SELECT cover_user_id FROM leaves WHERE user_id=? AND date=?', userId, date);
  if (!lv) return userId;
  return lv.cover_user_id || storeManagers(storeId)[0] || userId;
}
const monthDay = (date, v) => L.dom(date) === Math.min(Number(v), new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7), 0)).getUTCDate());
let layerCache = null;
const layerReset = () => { layerCache = null; };
function layerMap() {
  if (layerCache) return layerCache;
  const m = new Map(); for (const r of q('SELECT * FROM tpl_layers')) { if (!m.has(r.tpl_id)) m.set(r.tpl_id, {}); m.get(r.tpl_id)[r.layer + ':' + (r.scope_id || 0)] = r; }
  return layerCache = m;
}
const storeScope = sid => q1('SELECT s.id sid, s.region_id rid, COALESCE(g.province_id, 0) pid FROM stores s LEFT JOIN regions g ON g.id=s.region_id WHERE s.id=?', sid) || { sid, rid: 0, pid: 0 };
const LAYER_KEYS = sc => ['hq:0', 'province:' + sc.pid, 'region:' + sc.rid, 'store:' + sc.sid];
function tplEff(t, sc) {
  const L0 = t.layer || 'hq';
  if ((L0 === 'province' && t.scope_id !== sc.pid) || (L0 === 'region' && t.scope_id !== sc.rid) || (L0 === 'store' && t.scope_id !== sc.sid)) return null;
  const o = layerMap().get(t.id) || {}; let off = 0, due = t.due_time, offBy = null, dueBy = null;
  for (const k of LAYER_KEYS(sc)) { const r = o[k]; if (!r) continue; if (r.off != null) { off = r.off; offBy = k.split(':')[0]; } if (r.due_time) { due = r.due_time; dueBy = k.split(':')[0]; } }
  return { off: !!off, due, offBy, dueBy };
}
function tplDue(t, date) {
  if (t.freq === 'weekly') return L.weekday(date) === Number(t.freq_val);
  if (t.freq === 'monthly') return monthDay(date, t.freq_val);
  return true;
}
function flexDue(f, date) {
  if (f.start_date && date < f.start_date) return false;
  if (f.end_date && date > f.end_date) return false;
  if (f.recur === 'once') return date === f.start_date;
  if (f.recur === 'weekly') return L.weekday(date) === Number(f.recur_val);
  if (f.recur === 'monthly') return monthDay(date, f.recur_val);
  return true;
}

const insInst = () => db.prepare(`INSERT OR IGNORE INTO instances(store_id,date,src,src_id,scene_id,title,standard,category,origin,assignee_id,orig_assignee_id,due_time,need_photo)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
function ensureInstances(date, storeIds) {
  ensureInstances0(date, storeIds);
  if (date < L.today()) run("UPDATE instances SET status='missed' WHERE status='pending' AND date=? AND due_date IS NULL", date);
  else applyDeleg(date);
}
function applyDeleg(date) {
  const ds = q("SELECT * FROM delegations WHERE active=1 AND scope!='appr' AND start<=? AND end>=?", date, date);
  for (const d of ds) {
    if (q1('SELECT 1 FROM leaves WHERE user_id=? AND date=?', d.to_id, date)) continue;
    const rv = `CASE WHEN ${d.review ? 1 : 0}=1 OR (src='tpl' AND (SELECT tag FROM templates WHERE id=src_id)='清零项') THEN 1 ELSE 0 END`;
    const w = d.scope === 'one' ? 'id=?' : d.scope === 'task' ? 'src=? AND src_id=?' : '1=1';
    const args = d.scope === 'one' ? [d.inst_id] : d.scope === 'task' ? [d.src, d.src_id] : [];
    run(`UPDATE instances SET assignee_id=?, deleg_id=?, deleg_review=${rv} WHERE store_id=? AND (date=? OR (due_date IS NOT NULL AND date<=? AND due_date>=?)) AND status='pending' AND deleg_id IS NULL AND assignee_id=? AND ${w}`, d.to_id, d.id, d.store_id, date, date, date, d.from_id, ...args);
  }
}

// ---------- 班次 ----------
const SHIFT_DEF = { A: ['前台白班', '08:00', '20:00'], B: ['前台夜班', '20:00', '08:00'], O: ['前台休息', '', ''], C: ['保安夜班', '20:00', '08:00'], D: ['餐厅早班', '06:00', '14:00'], 常: ['常日班', '08:00', '17:30'], 休: ['休息', '', ''] };
const FD_ROLES = ['前台高级', '前台中级', '前台初级'];
const shiftGroup = rn => FD_ROLES.includes(rn) ? '前台' : rn === '保安' ? '保安' : ['餐厅厨师', '餐厅服务员'].includes(rn) ? '餐厅' : /^客房(高级|中级|初级)$/.test(rn) || rn === 'PA' ? '客房' : rn;
const SHIFT_ROT = { 前台: ['A', 'B'], 保安: ['C'], 餐厅: ['D'] };
const FD_PAT = ['A', 'B', 'O'];
const restCode = rn => (shiftGroup(rn) === '前台' ? 'O' : '休');
const roleShifts = rn => SHIFT_ROT[shiftGroup(rn)] || (rn === '前台经理' ? ['常', 'A', 'B'] : ['常']);
const dayNo = d => Math.round(Date.parse(d + 'T00:00:00Z') / 864e5);
const SH_CACHE = new Map(), PEER_CACHE = new Map();
const shiftReset = () => { SH_CACHE.clear(); PEER_CACHE.clear(); };
function storeStaff(sid) {
  let r = PEER_CACHE.get(sid);
  if (!r) PEER_CACHE.set(sid, r = q("SELECT u.id, r.name rn FROM users u JOIN roles r ON r.id=u.role_id WHERE u.store_id=? AND u.active=1 AND r.level='staff' ORDER BY u.id", sid));
  return r;
}
function shiftMap(sid, date) {
  const key = sid + '|' + date; let m = SH_CACHE.get(key); if (m) return m;
  const ov = new Map(q('SELECT user_id, shift FROM schedules WHERE store_id=? AND date=?', sid, date).filter(r => SHIFT_DEF[r.shift]).map(r => [r.user_id, r.shift]));
  const lv = new Set(q('SELECT l.user_id FROM leaves l JOIN users u ON u.id=l.user_id WHERE u.store_id=? AND l.date=?', sid, date).map(r => r.user_id));
  const gi = {}, n0 = dayNo(date) + sid, p = ((n0 % 7) + 7) % 7; m = new Map();
  for (const u of storeStaff(sid)) {
    const g = shiftGroup(u.rn), i = gi[g] = (gi[g] ?? -1) + 1, j = i % 4, gh = g.charCodeAt(0) % 7;
    const def = g === '前台' ? FD_PAT[(((n0 + i) % 3) + 3) % 3] : (p + 3 * i + gh) % 7 === 6 ? '休' : (SHIFT_ROT[g] || ['常'])[0];
    m.set(u.id, lv.has(u.id) ? '休' : ov.get(u.id) || def);
  }
  if (SH_CACHE.size > 20000) SH_CACHE.clear();
  SH_CACHE.set(key, m); return m;
}
function onShift(sid, uid, date, hm) {
  const m = shiftMap(sid, date); if (!m.has(uid)) return true;
  const d = SHIFT_DEF[m.get(uid)];
  if (d && d[1] && (d[1] <= d[2] ? hm >= d[1] && hm <= d[2] : hm >= d[1])) return true;
  const p = SHIFT_DEF[shiftMap(sid, L.addDays(date, -1)).get(uid)];
  return !!p && !!p[1] && p[1] > p[2] && hm <= p[2];
}
function shiftPick(sid, base, date, hm) {
  if (!base || !hm || !shiftMap(sid, date).has(base) || onShift(sid, base, date, hm)) return base;
  if (q1('SELECT cover_user_id c FROM leaves WHERE user_id=? AND date=?', base, date)?.c) return base;
  const all = storeStaff(sid), me = all.find(x => x.id === base), g = shiftGroup(me.rn);
  const peers = all.filter(x => x.id !== base && shiftGroup(x.rn) === g).sort((a, b) => (b.rn === me.rn) - (a.rn === me.rn));
  const p0 = peers.find(x => onShift(sid, x.id, date, hm)); if (p0) return p0.id;
  const lead = all.find(x => x.rn === ({ 前台: '前台经理', 客房: '客房经理' }[g] || '店助') && x.id !== base && onShift(sid, x.id, date, hm));
  return lead ? lead.id : storeManagers(sid)[0] || base;
}
function ensureInstances0(date, storeIds) {
  if (date > L.addDays(L.today(), 30)) return;
  const stores = storeIds && storeIds.length ? storeIds : q('SELECT id FROM stores').map(s => s.id);
  const tpls = q('SELECT t.* FROM templates t JOIN scenes s ON s.id=t.scene_id WHERE t.active=1 AND s.active=1');
  const flex = q('SELECT * FROM flex_tasks WHERE active=1');
  const st = insInst();
  tx(() => {
    for (const sid of stores) {
      const sc = storeScope(sid);
      for (const t of tpls) {
        if (!tplDue(t, date)) continue;
        const ef = tplEff(t, sc); if (!ef || ef.off) continue;
        const exists = q1("SELECT 1 FROM instances WHERE src='tpl' AND src_id=? AND store_id=? AND date=?", t.id, sid, date) || q1('SELECT 1 FROM exempts WHERE date=? AND store_id=? AND tpl_id=?', date, sid, t.id);
        if (exists) continue;
        const base = shiftPick(sid, baseAssignee(sid, t), date, ef.due);
        const ir = st.run(sid, date, 'tpl', t.id, t.scene_id, t.title, t.standard || '', t.category, 'fixed', coverFor(base, date, sid), base, ef.due, t.need_photo);
        if (t.win === 'month' && ir.changes) run('UPDATE instances SET due_date=? WHERE id=?', L.addDays(L.addDays(date.slice(0, 8) + '01', 32).slice(0, 8) + '01', -1), ir.lastInsertRowid);
      }
    }
    for (const f of flex) {
      if (!stores.includes(f.store_id) || !flexDue(f, date)) continue;
      const exists = q1("SELECT 1 FROM instances WHERE src='flex' AND src_id=? AND store_id=? AND date=?", f.id, f.store_id, date);
      if (exists) continue;
      st.run(f.store_id, date, 'flex', f.id, f.scene_id, f.title, f.standard || '', 'ops', f.source, coverFor(f.assignee_id, date, f.store_id), f.assignee_id, f.due_time, f.need_photo);
    }
  });
}

// Re-resolve assignees of pending instances from today on (after assignment / leave changes).
function refreshPending(storeId, d1, d2) {
  const t = d1 || L.today();
  const rows = q("SELECT * FROM instances WHERE store_id=? AND date>=? AND date<=? AND status='pending'", storeId, t, d2 || '9999-12-31');
  tx(() => {
    for (const r of rows) {
      let base;
      if (r.src === 'tpl') {
        const tpl = q1('SELECT * FROM templates WHERE id=?', r.src_id);
        if (!tpl) continue;
        base = shiftPick(storeId, baseAssignee(storeId, tpl), r.date, r.due_time);
      } else {
        const f = q1('SELECT * FROM flex_tasks WHERE id=?', r.src_id);
        if (!f) continue;
        base = f.assignee_id;
      }
      run('UPDATE instances SET assignee_id=?, orig_assignee_id=?, deleg_id=NULL, deleg_review=NULL WHERE id=?', coverFor(base, r.date, storeId), base, r.id);
    }
  });
  for (const d of new Set(rows.map(r => r.date))) applyDeleg(d);
}

// 夜审：每天凌晨按当天排班、请假、顶岗、授权重新派发当天未开始的任务；店长手动改派的不动
function nightAudit(date, storeIds) {
  const stores = storeIds && storeIds.length ? storeIds : q('SELECT id FROM stores').map(s => s.id), at = L.nowStr(), out = [];
  shiftReset(); ensureInstances0(date, stores);
  const tpls = new Map(q('SELECT * FROM templates').map(t => [t.id, t]));
  for (const sid of stores) {
    const sm = new Set(storeManagers(sid)); let moved = 0, need = 0;
    const rows = q("SELECT * FROM instances WHERE store_id=? AND date=? AND status='pending' AND src='tpl' AND COALESCE(manual,0)=0 AND deleg_id IS NULL", sid, date);
    tx(() => {
      for (const r of rows) {
        const tpl = tpls.get(r.src_id); if (!tpl) continue;
        const own = baseAssignee(sid, tpl), base = shiftPick(sid, own, date, r.due_time), fin = coverFor(base, date, sid);
        const why = fin === own ? null : sm.has(fin) && !sm.has(own) ? '无合适在班人员，待店长安排' : fin !== base ? '原负责人请假，由顶岗人执行' : '原负责人不在班，由在班同组人员执行';
        if (why === '无合适在班人员，待店长安排') need++;
        if (fin !== r.assignee_id || why !== r.why) { moved += fin !== r.assignee_id; run('UPDATE instances SET assignee_id=?, orig_assignee_id=?, why=? WHERE id=?', fin, own, why, r.id); }
      }
      run('INSERT OR REPLACE INTO night_audit VALUES(?,?,?,?,?,?)', date, sid, rows.length, moved, need, at);
    });
    out.push({ sid, total: rows.length, moved, need });
  }
  applyDeleg(date);
  return out;
}

function notify(userIds, kind, title, body, link) {
  const at = L.nowStr();
  const st = db.prepare('INSERT INTO notifications(user_id,created_at,kind,title,body,link) VALUES(?,?,?,?,?,?)');
  for (const u of new Set(userIds.filter(Boolean))) st.run(u, at, kind, title, body || '', link || '');
}
function audit(userId, storeId, action, detail) {
  run('INSERT INTO audit(at,user_id,store_id,action,detail) VALUES(?,?,?,?,?)', L.nowStr(), userId, storeId || null, action, detail || '');
}

module.exports = { layerReset, storeScope, tplEff, db, q, q1, run, tx, DATA_DIR, getSetting, setSetting, storeManagers, regionUsers, baseAssignee, coverFor,
  ensureInstances, refreshPending, nightAudit, applyDeleg, notify, audit, SHIFT_DEF, shiftGroup, roleShifts, restCode, shiftMap, onShift, shiftPick, shiftReset };
