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
  ['instances', 'reading TEXT'], ['templates', 'pillar TEXT'], ['flex_tasks', 'pillar TEXT'], ['stores', 'brand TEXT'], ['stores', 'stype TEXT'], ['stores', 'open_date TEXT'], ['stores', 'rooms INTEGER'], ['patrol_items', 'code TEXT'], ['patrol_items', 'tag TEXT'], ['patrol_items', 'result TEXT'],
  ['patrols', "kind TEXT DEFAULT 'patrol'"], ['patrols', 'mode TEXT'], ['patrols', 'parent_id INTEGER'], ['patrols', 'codes TEXT'], ['patrols', 'recheck_result TEXT'], ['patrols', 'owner_sent TEXT'],
  ['patrol_items', 'photo TEXT'], ['patrol_items', 'rect_id INTEGER'], ['patrol_items', 'recheck TEXT'], ['patrol_items', 'recheck_comment TEXT'], ['rectifications', 'title TEXT'], ['rectifications', 'ref TEXT'], ['instances', 'deleg_id INTEGER'], ['instances', 'deleg_review INTEGER'], ['patrols', 'focus TEXT']]) {
  try { db.exec(`ALTER TABLE ${t} ADD COLUMN ${c}`); } catch { /* exists */ }
}
db.exec('CREATE TABLE IF NOT EXISTS provinces(id INTEGER PRIMARY KEY, name TEXT)');
db.exec(`CREATE TABLE IF NOT EXISTS sm_stage(user_id INTEGER PRIMARY KEY, stage TEXT, start TEXT, set_by INTEGER, note TEXT);
CREATE TABLE IF NOT EXISTS stage_steps(user_id INTEGER, stage TEXT, step TEXT, done_at TEXT, note TEXT, ok_by INTEGER, ok_at TEXT, PRIMARY KEY(user_id, stage, step));
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
  if (date < L.today()) run("UPDATE instances SET status='missed' WHERE status='pending' AND date=?", date);
  else applyDeleg(date);
}
function applyDeleg(date) {
  const ds = q("SELECT * FROM delegations WHERE active=1 AND scope!='appr' AND start<=? AND end>=?", date, date);
  for (const d of ds) {
    if (q1('SELECT 1 FROM leaves WHERE user_id=? AND date=?', d.to_id, date)) continue;
    const rv = `CASE WHEN ${d.review ? 1 : 0}=1 OR (src='tpl' AND (SELECT tag FROM templates WHERE id=src_id)='清零项') THEN 1 ELSE 0 END`;
    const w = d.scope === 'one' ? 'id=?' : d.scope === 'task' ? 'src=? AND src_id=?' : '1=1';
    const args = d.scope === 'one' ? [d.inst_id] : d.scope === 'task' ? [d.src, d.src_id] : [];
    run(`UPDATE instances SET assignee_id=?, deleg_id=?, deleg_review=${rv} WHERE store_id=? AND date=? AND status='pending' AND deleg_id IS NULL AND assignee_id=? AND ${w}`, d.to_id, d.id, d.store_id, date, d.from_id, ...args);
  }
}
function ensureInstances0(date, storeIds) {
  if (date > L.addDays(L.today(), 30)) return;
  const stores = storeIds && storeIds.length ? storeIds : q('SELECT id FROM stores').map(s => s.id);
  const tpls = q('SELECT t.* FROM templates t JOIN scenes s ON s.id=t.scene_id WHERE t.active=1 AND s.active=1');
  const flex = q('SELECT * FROM flex_tasks WHERE active=1');
  const st = insInst();
  tx(() => {
    for (const sid of stores) {
      for (const t of tpls) {
        if (!tplDue(t, date)) continue;
        const exists = q1("SELECT 1 FROM instances WHERE src='tpl' AND src_id=? AND store_id=? AND date=?", t.id, sid, date);
        if (exists) continue;
        const base = baseAssignee(sid, t);
        st.run(sid, date, 'tpl', t.id, t.scene_id, t.title, t.standard || '', t.category, 'fixed', coverFor(base, date, sid), base, t.due_time, t.need_photo);
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
function refreshPending(storeId) {
  const t = L.today();
  const rows = q("SELECT * FROM instances WHERE store_id=? AND date>=? AND status='pending'", storeId, t);
  tx(() => {
    for (const r of rows) {
      let base;
      if (r.src === 'tpl') {
        const tpl = q1('SELECT * FROM templates WHERE id=?', r.src_id);
        if (!tpl) continue;
        base = baseAssignee(storeId, tpl);
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

function notify(userIds, kind, title, body, link) {
  const at = L.nowStr();
  const st = db.prepare('INSERT INTO notifications(user_id,created_at,kind,title,body,link) VALUES(?,?,?,?,?,?)');
  for (const u of new Set(userIds.filter(Boolean))) st.run(u, at, kind, title, body || '', link || '');
}
function audit(userId, storeId, action, detail) {
  run('INSERT INTO audit(at,user_id,store_id,action,detail) VALUES(?,?,?,?,?)', L.nowStr(), userId, storeId || null, action, detail || '');
}

module.exports = { db, q, q1, run, tx, DATA_DIR, getSetting, setSetting, storeManagers, regionUsers, baseAssignee, coverFor,
  ensureInstances, refreshPending, applyDeleg, notify, audit };
