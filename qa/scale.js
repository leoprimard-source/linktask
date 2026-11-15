// clone stores 1..4 into N extra stores (users, SM links) in a data copy
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[2]), N = Number(process.argv[3] || 46);
const cols = t => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name).filter(c => c !== 'id');
const sc = cols('stores'), uc = cols('users');
const stores = db.prepare('SELECT * FROM stores').all();
db.exec('BEGIN');
for (let i = 0; i < N; i++) {
  const src = stores[i % stores.length];
  const nid = Number(db.prepare(`INSERT INTO stores(${sc.join(',')}) VALUES(${sc.map(() => '?').join(',')})`).run(...sc.map(c => c === 'name' ? src.name + '·压测' + (i + 1) : src[c] ?? null)).lastInsertRowid);
  for (const u of db.prepare('SELECT * FROM users WHERE store_id=?').all(src.id)) db.prepare(`INSERT INTO users(${uc.join(',')}) VALUES(${uc.map(() => '?').join(',')})`).run(...uc.map(c => c === 'store_id' ? nid : c === 'phone' ? '139' + String(nid * 100 + u.id).padStart(8, '0') : u[c] ?? null));
  const sm = Number(db.prepare("INSERT INTO users(name,role_id,region_id,store_id,phone,active) VALUES(?,4,1,NULL,?,1)").run('压测店长' + (i + 1), '137' + String(nid).padStart(8, '0')).lastInsertRowid);
  db.prepare('INSERT INTO user_stores(user_id,store_id) VALUES(?,?)').run(sm, nid);
  for (const a of db.prepare('SELECT * FROM assignments WHERE store_id=?').all(src.id)) { try { const ac = Object.keys(a).filter(k => k !== 'id'); db.prepare(`INSERT INTO assignments(${ac.join(',')}) VALUES(${ac.map(() => '?').join(',')})`).run(...ac.map(k => k === 'store_id' ? nid : a[k])); } catch (e) { } }
}
db.exec('COMMIT');
console.log('stores', db.prepare('SELECT COUNT(*) n FROM stores').get().n, 'users', db.prepare('SELECT COUNT(*) n FROM users').get().n);
