// GET sweep: every GET route x every user; records status, time, crashes
const { DatabaseSync } = require('node:sqlite');
const PORT = process.env.P || 3103, db = new DatabaseSync(process.env.DB || '/home/ubuntu/lt-qa/linktask.db', { readOnly: true });
const one = s => db.prepare(s).get(); const all = s => db.prepare(s).all();
const users = all('SELECT u.id,u.name,u.store_id,r.level,r.name role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.active=1');
const today = new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);
const ins = one(`SELECT id FROM instances WHERE store_id=3 AND date='${today}' LIMIT 1`)?.id || 1;
const ids = { ins, rect: one('SELECT id FROM rectifications LIMIT 1').id, pat: one('SELECT id FROM patrols LIMIT 1').id, rep: one('SELECT id FROM repairs LIMIT 1').id, proj: one('SELECT id FROM projects LIMIT 1').id, cls: one('SELECT id FROM train_classes LIMIT 1').id };
const R = ['/api/me', '/api/meta', '/api/my/tasks', '/api/tasks?store=3', '/api/instances/' + ids.ins, '/api/stores/3/assign', '/api/leaves', '/api/flex', '/api/rectifications', '/api/home', '/api/team', '/api/person/32', '/api/must',
  '/api/upper', '/api/calendar', '/api/profile', '/api/brief', '/api/standards', '/api/feed', '/api/dashboard', '/api/issues', '/api/hr/people', '/api/hr/person/32', '/api/region/people', '/api/region/biz', '/api/store/3/profile', '/api/region/stores',
  '/api/store/3/biz', '/api/store/3/people', '/api/franchise/3', '/api/region/franchise', '/api/inbox', '/api/patrols', '/api/patrols/' + ids.pat, '/api/score-cfg', '/api/repairs', '/api/repairs/' + ids.rep, '/api/lifecycle', '/api/projects/' + ids.proj,
  '/api/exec/32', '/api/store/3/exec', '/api/career/32', '/api/career-pool', '/api/proc', '/api/proc?store=3', '/api/train', '/api/train/suggest/' + ids.cls, '/api/mentor-cands/43', '/api/mentor-stats/32', '/api/train/insights', '/api/pay/32', '/api/pay/5', '/api/pay-board',
  '/api/handoff/32', '/api/brands', '/api/shift', '/api/complaints', '/api/safety', '/api/labor', '/api/labor?store=3', '/api/suppliers', '/api/diag/5', '/api/cockpit', '/api/onboard/48', '/api/coach', '/api/wcal', '/api/engage', '/api/hq', '/api/yi', '/api/notifications',
  '/api/templates', '/api/audit', '/api/hrm', '/api/hrm?store=3', '/api/care', '/api/care?store=3', '/api/care/me'];
(async () => {
  const out = [], t0 = Date.now();
  for (const u of users) for (const r of R) {
    const s = Date.now(); let st, body;
    try { const x = await fetch(`http://localhost:${PORT}${r}`, { headers: { 'x-user-id': u.id } }); st = x.status; body = await x.text(); } catch (e) { st = 'ERR'; body = String(e); }
    out.push({ u: u.id, lv: u.level, role: u.role, sid: u.store_id, r, st, ms: Date.now() - s, len: body.length, body: st >= 500 || st === 'ERR' ? body.slice(0, 200) : st === 200 ? body.slice(0, 120) : body.slice(0, 60) });
  }
  require('fs').writeFileSync(process.env.OUT || 'sweep.json', JSON.stringify(out));
  const c = {}; out.forEach(o => c[o.st] = (c[o.st] || 0) + 1);
  console.log('calls', out.length, 'total s', (Date.now() - t0) / 1000, c);
  out.filter(o => o.st >= 500 || o.st === 'ERR').forEach(o => console.log('5xx', o.u, o.lv, o.r, o.body));
  const slow = {}; out.forEach(o => { slow[o.r] = Math.max(slow[o.r] || 0, o.ms); });
  console.log('slowest', Object.entries(slow).sort((a, b) => b[1] - a[1]).slice(0, 12).map(x => x.join(':')).join('  '));
})();
