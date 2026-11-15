// mask real names (users without the \u2063虚 marker) in a data copy for public sharing: 严古梅 -> 严*梅, 王旋 -> 王*. usage: DATA_DIR=dir node mask.js
const D = require('../db.js'), { q, run, tx } = D, VX = '\u2063虚';
const mask = n => n.length <= 2 ? n[0] + '*' : n[0] + '*'.repeat(n.length - 2) + n[n.length - 1];
const real = q('SELECT id, name FROM users').filter(u => u.name && !u.name.includes(VX) && !u.name.includes('*'));
const names = [...new Set(real.map(u => u.name))].sort((a, b) => b.length - a.length);
const tables = q("SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('instances','users')").map(t => t.name);
tx(() => {
  for (const u of real) run('UPDATE users SET name=? WHERE id=?', mask(u.name), u.id);
  for (const t of tables) for (const c of q(`PRAGMA table_info(${t})`).filter(c => /TEXT|^$/i.test(c.type) && !c.pk))
    for (const n of names) run(`UPDATE ${t} SET "${c.name}"=REPLACE("${c.name}", ?, ?) WHERE "${c.name}" LIKE ?`, n, mask(n), '%' + n + '%');
});
console.log('masked', real.length, 'users in', tables.length, 'tables');
