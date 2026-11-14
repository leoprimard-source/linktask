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
  due_time TEXT, freq TEXT DEFAULT 'daily', freq_val INTEGER, category TEXT DEFAULT 'ops', need_photo INTEGER DEFAULT 0, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS assignments(store_id INTEGER, template_id INTEGER, user_id INTEGER, PRIMARY KEY(store_id, template_id));
CREATE TABLE IF NOT EXISTS scene_owners(store_id INTEGER, scene_id INTEGER, user_id INTEGER, PRIMARY KEY(store_id, scene_id));
CREATE TABLE IF NOT EXISTS leaves(id INTEGER PRIMARY KEY, user_id INTEGER, date TEXT, cover_user_id INTEGER, note TEXT, created_by INTEGER, UNIQUE(user_id, date));
CREATE TABLE IF NOT EXISTS flex_tasks(id INTEGER PRIMARY KEY, store_id INTEGER, scene_id INTEGER, title TEXT, standard TEXT, assignee_id INTEGER,
  recur TEXT, recur_val INTEGER, start_date TEXT, end_date TEXT, due_time TEXT, need_photo INTEGER DEFAULT 0, source TEXT DEFAULT 'flex',
  created_by INTEGER, created_at TEXT, active INTEGER DEFAULT 1, ref TEXT);
CREATE TABLE IF NOT EXISTS instances(id INTEGER PRIMARY KEY, store_id INTEGER, date TEXT, src TEXT, src_id INTEGER, scene_id INTEGER, title TEXT,
  standard TEXT, category TEXT, origin TEXT, assignee_id INTEGER, orig_assignee_id INTEGER, due_time TEXT, need_photo INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending', done_at TEXT, done_note TEXT, photo TEXT, check_result TEXT, check_comment TEXT, checked_by INTEGER, checked_at TEXT,
  escalated INTEGER DEFAULT 0, UNIQUE(src, src_id, store_id, date));
CREATE INDEX IF NOT EXISTS idx_inst_date ON instances(date, store_id);
CREATE INDEX IF NOT EXISTS idx_inst_user ON instances(assignee_id, date);
CREATE TABLE IF NOT EXISTS rectifications(id INTEGER PRIMARY KEY, instance_id INTEGER, store_id INTEGER, assignee_id INTEGER, reason TEXT, training TEXT,
  task TEXT, deadline TEXT, status TEXT DEFAULT 'open', created_by INTEGER, created_at TEXT, submit_note TEXT, submit_photo TEXT, submitted_at TEXT,
  verify_comment TEXT, verified_by INTEGER, verified_at TEXT, escalated INTEGER DEFAULT 0, source TEXT DEFAULT 'check');
CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY, user_id INTEGER, created_at TEXT, kind TEXT, title TEXT, body TEXT, link TEXT, read INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read);
CREATE TABLE IF NOT EXISTS reminder_log(date TEXT, time TEXT, PRIMARY KEY(date, time));
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS patrols(id INTEGER PRIMARY KEY, store_id INTEGER, planned_date TEXT, reason TEXT, status TEXT DEFAULT 'planned',
  score INTEGER, summary TEXT, created_by INTEGER, created_at TEXT, done_at TEXT);
CREATE TABLE IF NOT EXISTS patrol_items(id INTEGER PRIMARY KEY, patrol_id INTEGER, scene_id INTEGER, item TEXT, score INTEGER, max INTEGER, comment TEXT);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, at TEXT, user_id INTEGER, store_id INTEGER, action TEXT, detail TEXT);
`);

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
function tplDue(t, date) {
  if (t.freq === 'weekly') return L.weekday(date) === Number(t.freq_val);
  if (t.freq === 'monthly') return L.dom(date) === Number(t.freq_val);
  return true;
}
function flexDue(f, date) {
  if (f.start_date && date < f.start_date) return false;
  if (f.end_date && date > f.end_date) return false;
  if (f.recur === 'once') return date === f.start_date;
  if (f.recur === 'weekly') return L.weekday(date) === Number(f.recur_val);
  if (f.recur === 'monthly') return L.dom(date) === Number(f.recur_val);
  return true;
}

const insInst = () => db.prepare(`INSERT OR IGNORE INTO instances(store_id,date,src,src_id,scene_id,title,standard,category,origin,assignee_id,orig_assignee_id,due_time,need_photo)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
function ensureInstances(date, storeIds) {
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
      run('UPDATE instances SET assignee_id=?, orig_assignee_id=? WHERE id=?', coverFor(base, r.date, storeId), base, r.id);
    }
  });
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
  ensureInstances, refreshPending, notify, audit };
