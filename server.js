const express = require('express');
const path = require('path');
const fs = require('fs');
const D = require('./db');
const L = require('./lib');
const { q, q1, run } = D;
require('./seed').seed();

const app = express();
app.use(express.json({ limit: '8mb' }));
app.use('/uploads', express.static(path.join(D.DATA_DIR, 'uploads'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public')));

const USER_SQL = `SELECT u.*, r.name AS role_name, r.level FROM users u JOIN roles r ON r.id=u.role_id`;
const LEVEL_LABEL = { region_manager: '区域经理', ops_manager: '运营经理', sales_manager: '营销经理', store_manager: '店长', staff: '员工' };

app.get('/api/users', (req, res) => {
  const users = q(USER_SQL + ' WHERE u.active=1 ORDER BY r.sort, u.store_id, u.id');
  const stores = q('SELECT * FROM stores');
  const us = q('SELECT * FROM user_stores');
  res.json(users.map(u => ({ id: u.id, name: u.name, role_name: u.role_name, level: u.level,
    stores: u.level === 'store_manager' ? us.filter(x => x.user_id === u.id).map(x => stores.find(s => s.id === x.store_id)?.name)
      : u.store_id ? [stores.find(s => s.id === u.store_id)?.name] : ['华东一区'] })));
});

app.use('/api', (req, res, next) => {
  const id = Number(req.get('x-user-id'));
  const u = id && q1(USER_SQL + ' WHERE u.id=? AND u.active=1', id);
  if (!u) return res.status(401).json({ error: '请选择身份' });
  req.u = u;
  next();
});

const isRegion = u => ['region_manager', 'ops_manager', 'sales_manager'].includes(u.level);
function visibleStores(u) {
  if (isRegion(u)) return q('SELECT id FROM stores WHERE region_id=?', u.region_id).map(s => s.id);
  if (u.level === 'store_manager') return q('SELECT store_id FROM user_stores WHERE user_id=?', u.id).map(s => s.store_id);
  return u.store_id ? [u.store_id] : [];
}
const canManage = (u, sid) => u.level === 'region_manager' || (u.level === 'store_manager' && visibleStores(u).includes(Number(sid)));
const catFilter = u => (u.level === 'sales_manager' ? 'sales' : u.level === 'ops_manager' ? 'ops' : null);
function deny(res, msg) { res.status(403).json({ error: msg || '无权限' }); }
function err(res, msg) { res.status(400).json({ error: msg }); }
const STAFF_ALL = ['前台经理', '前台高级', '前台中级', '前台初级', '客房经理', '客房高级', '客房中级', '客房初级', '餐厅厨师', '工程', 'PA', '保安'];
const LEADS = { 店助: STAFF_ALL, 前台经理: ['前台高级', '前台中级', '前台初级'], 客房经理: ['客房高级', '客房中级', '客房初级', 'PA'] };
function teamOf(u, sid) {
  sid = Number(sid);
  if (canManage(u, sid)) return q(USER_SQL + " WHERE u.active=1 AND u.store_id=? AND r.level='staff' ORDER BY r.sort, u.id", sid);
  const subs = LEADS[u.role_name]; if (!subs || u.store_id !== sid) return [];
  return q(USER_SQL + ` WHERE u.active=1 AND u.store_id=? AND r.name IN (${subs.map(() => '?').join(',')}) ORDER BY r.sort, u.id`, sid, ...subs);
}
function leads(u, uid) { const t = q1(USER_SQL + ' WHERE u.id=?', uid); return !!t && t.store_id === u.store_id && (LEADS[u.role_name] || []).includes(t.role_name); }

function savePhoto(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return null;
  const m = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!m) return null;
  const name = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + (m[1] === 'png' ? 'png' : 'jpg');
  fs.writeFileSync(path.join(D.DATA_DIR, 'uploads', name), Buffer.from(m[2], 'base64'));
  return '/uploads/' + name;
}

const INST_SQL = `SELECT i.*, s.name AS scene_name, st.name AS store_name, a.name AS assignee_name, ar.name AS assignee_role,
  o.name AS orig_name, c.name AS checker_name, tp.code, tp.tag, tp.score AS tscore, tp.m, tp.l, tp.f, tp.sub, tp.need_value,
  COALESCE(tp.pillar, (SELECT pillar FROM flex_tasks WHERE i.src='flex' AND id=i.src_id)) AS tpillar,
  (SELECT id FROM rectifications WHERE instance_id=i.id ORDER BY id DESC LIMIT 1) AS rect_id,
  (SELECT status FROM rectifications WHERE instance_id=i.id ORDER BY id DESC LIMIT 1) AS rect_status,
  CASE WHEN i.src='tpl' THEN (SELECT freq FROM templates WHERE id=i.src_id) ELSE (SELECT recur FROM flex_tasks WHERE id=i.src_id) END AS freq
  FROM instances i LEFT JOIN scenes s ON s.id=i.scene_id LEFT JOIN stores st ON st.id=i.store_id
  LEFT JOIN users a ON a.id=i.assignee_id LEFT JOIN roles ar ON ar.id=a.role_id LEFT JOIN users o ON o.id=i.orig_assignee_id LEFT JOIN users c ON c.id=i.checked_by LEFT JOIN templates tp ON i.src='tpl' AND tp.id=i.src_id`;
const PILLAR_MONEY = /收银|账务|账单|挂账|营收|备用金|夜审|发票|押金|房价|价格|成本|采购|能耗|水电表|合同|保险|OTA|GOP|收入|库存|盘点|预算|结算/;
const PILLAR_PEOPLE = /培训|员工|仪容|仪表|礼仪|迎来送往|迎送|交接|班前会|晨会|排班|问候|宾客|客诉|投诉|点评|回复|人员|招聘|考勤|微笑|健康证|服务流程|关怀|会员服务/;
function pillarOf(r) {
  const s = (r.title || '') + (r.standard || '');
  if (/交接|培训|仪容|礼仪|迎来送往|早会|班前会/.test(r.title || '')) return '人';
  if (PILLAR_MONEY.test(s)) return '财';
  if (PILLAR_PEOPLE.test(s)) return '人';
  return r.category === 'sales' ? '财' : '物';
}
function decorate(rows) {
  const t = L.today(), hm = L.nowHM();
  return rows.map(r => ({ ...r, pillar: r.tpillar || pillarOf(r), overdue: r.status === 'pending' && (r.date < t || (r.date === t && r.due_time < hm)),
    covered: r.orig_assignee_id && r.assignee_id !== r.orig_assignee_id }));
}

// ---------- me / meta ----------
app.get('/api/me', (req, res) => {
  const u = req.u;
  const unread = q1('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read=0', u.id).n;
  res.json({ ...u, level_label: LEVEL_LABEL[u.level], stores: visibleStores(u), unread, today: L.today(), now: L.nowHM(),
    can: { manage: ['region_manager', 'store_manager'].includes(u.level), region: isRegion(u), patrol: u.level === 'region_manager', settings: u.level === 'region_manager' },
    category: catFilter(u), team: u.store_id ? teamOf(u, u.store_id).map(x => x.id) : [], lead: !!LEADS[u.role_name] });
});
app.get('/api/meta', (req, res) => {
  const sids = visibleStores(req.u);
  const ph = sids.map(() => '?').join(',') || 'NULL';
  res.json({
    scenes: q('SELECT * FROM scenes WHERE active=1 ORDER BY sort, id'),
    roles: q('SELECT * FROM roles ORDER BY sort, id'),
    stores: q(`SELECT * FROM stores WHERE id IN (${ph}) ORDER BY id`, ...sids),
    users: q(USER_SQL + ` WHERE u.active=1 AND (u.store_id IN (${ph}) OR u.id IN (SELECT user_id FROM user_stores WHERE store_id IN (${ph}))) ORDER BY r.sort, u.id`, ...sids, ...sids),
    settings: { reminder_times: D.getSetting('reminder_times', []), escalate_minutes: D.getSetting('escalate_minutes', 30), audit_count: q1("SELECT COUNT(*) n FROM templates WHERE src='audit' AND active=1").n },
  });
});

// ---------- tasks ----------
app.get('/api/my/tasks', (req, res) => {
  const date = req.query.date || L.today();
  const sids = visibleStores(req.u);
  D.ensureInstances(date, sids);
  res.json(decorate(q(INST_SQL + ' WHERE i.date=? AND i.assignee_id=? ORDER BY i.due_time', date, req.u.id)));
});
app.get('/api/tasks', (req, res) => {
  const date = req.query.date || L.today();
  const sids = visibleStores(req.u);
  const sid = req.query.store ? Number(req.query.store) : null;
  if (sid && !sids.includes(sid)) return deny(res);
  const list = sid ? [sid] : sids;
  if (!list.length) return res.json([]);
  D.ensureInstances(date, list);
  let sql = INST_SQL + ` WHERE i.date=? AND i.store_id IN (${list.map(() => '?').join(',')})`;
  const p = [date, ...list];
  const cat = catFilter(req.u);
  if (cat) { sql += ' AND i.category=?'; p.push(cat); }
  if (req.u.level === 'staff') { sql += ' AND i.assignee_id=?'; p.push(req.u.id); }
  res.json(decorate(q(sql + ' ORDER BY i.scene_id, i.due_time', ...p)));
});
app.get('/api/instances/:id', (req, res) => {
  const it = q1(INST_SQL + ' WHERE i.id=?', req.params.id);
  if (!it || !visibleStores(req.u).includes(it.store_id)) return deny(res);
  const rects = q(`SELECT r.*, u.name assignee_name FROM rectifications r LEFT JOIN users u ON u.id=r.assignee_id WHERE instance_id=? ORDER BY id`, it.id);
  res.json({ ...decorate([it])[0], rects });
});
app.post('/api/instances/:id/complete', (req, res) => {
  const it = q1('SELECT * FROM instances WHERE id=?', req.params.id);
  if (!it) return err(res, '任务不存在');
  if (it.assignee_id !== req.u.id && !canManage(req.u, it.store_id) && !leads(req.u, it.assignee_id)) return deny(res, '只能完成分配给自己的任务');
  const photo = savePhoto(req.body.photo) || it.photo;
  if (it.need_photo && !photo) return err(res, '该任务需要上传照片');
  const tpl = it.src === 'tpl' ? q1('SELECT need_value FROM templates WHERE id=?', it.src_id) : null;
  const reading = (req.body.reading || '').trim();
  if (tpl && tpl.need_value && !reading) return err(res, '该任务需要填写计量读数');
  run("UPDATE instances SET status='done', done_at=?, done_note=?, photo=?, reading=? WHERE id=?", L.nowStr(), req.body.note || '', photo, reading || null, it.id);
  D.audit(req.u.id, it.store_id, '完成任务', it.title);
  res.json({ ok: true });
});
app.post('/api/instances/:id/undo', (req, res) => {
  const it = q1('SELECT * FROM instances WHERE id=?', req.params.id);
  if (!it || (it.assignee_id !== req.u.id && !canManage(req.u, it.store_id) && !leads(req.u, it.assignee_id))) return deny(res);
  if (it.check_result) return err(res, '已抽查的任务不能撤回');
  run("UPDATE instances SET status='pending', done_at=NULL WHERE id=?", it.id);
  D.audit(req.u.id, it.store_id, '撤回完成', it.title);
  res.json({ ok: true });
});
app.post('/api/instances/:id/reassign', (req, res) => {
  const it = q1('SELECT * FROM instances WHERE id=?', req.params.id);
  if (!it || !canManage(req.u, it.store_id)) return deny(res);
  const to = q1('SELECT * FROM users WHERE id=?', req.body.user_id);
  if (!to) return err(res, '人员不存在');
  run('UPDATE instances SET assignee_id=? WHERE id=?', to.id, it.id);
  D.notify([to.id], 'assign', '新增临时任务', `${it.date} ${it.due_time} ${it.title}`, '#/my');
  D.audit(req.u.id, it.store_id, '临时改派', `${it.title} → ${to.name}`);
  res.json({ ok: true });
});
app.post('/api/instances/:id/check', (req, res) => {
  const it = q1('SELECT * FROM instances WHERE id=?', req.params.id);
  if (!it || (!canManage(req.u, it.store_id) && !leads(req.u, it.assignee_id))) return deny(res, '只有店长、区域经理或直属上级可以点评');
  const { result, comment, rectify } = req.body;
  if (!['good', 'bad'].includes(result)) return err(res, '请选择抽查结果');
  if (result === 'bad' && !(comment || '').trim()) return err(res, '请写明不合格原因');
  D.tx(() => {
    run('UPDATE instances SET check_result=?, check_comment=?, checked_by=?, checked_at=? WHERE id=?', result, comment || '', req.u.id, L.nowStr(), it.id);
    if (result === 'good') {
      D.notify([it.assignee_id], 'praise', '工作获得肯定', `${it.title}：${comment || '执行到位，继续保持'}`, '#/my');
    } else {
      const r = rectify || {};
      if (!r.deadline || !(r.task || '').trim()) throw new Error('请填写整改任务和整改日期');
      const assignee = Number(r.assignee_id) || it.assignee_id;
      run(`INSERT INTO rectifications(instance_id,store_id,assignee_id,reason,training,task,deadline,status,created_by,created_at)
        VALUES(?,?,?,?,?,?,?,'open',?,?)`, it.id, it.store_id, assignee, comment, r.training || '', r.task, r.deadline, req.u.id, L.nowStr());
      D.notify([assignee], 'rectify', '收到整改任务', `${it.title}：${comment}。整改要求：${r.task}，截止 ${r.deadline}`, '#/my-rect');
    }
  });
  D.audit(req.u.id, it.store_id, result === 'good' ? '抽查合格' : '抽查不合格', `${it.title} ${comment || ''}`);
  res.json({ ok: true });
});

// ---------- assignments ----------
app.get('/api/stores/:id/assign', (req, res) => {
  const sid = Number(req.params.id);
  if (!visibleStores(req.u).includes(sid)) return deny(res);
  const tpls = q(`SELECT t.*, r.name role_name FROM templates t LEFT JOIN roles r ON r.id=t.role_id WHERE t.active=1 ORDER BY t.scene_id, t.due_time`);
  const owners = q('SELECT so.*, u.name FROM scene_owners so LEFT JOIN users u ON u.id=so.user_id WHERE so.store_id=?', sid);
  const explicit = q('SELECT * FROM assignments WHERE store_id=?', sid);
  res.json({
    owners,
    templates: tpls.map(t => {
      const uid = D.baseAssignee(sid, t);
      const u = uid && q1('SELECT name FROM users WHERE id=?', uid);
      return { ...t, user_id: uid, user_name: u?.name, explicit: explicit.some(e => e.template_id === t.id) };
    }),
  });
});
app.put('/api/stores/:id/assign', (req, res) => {
  const sid = Number(req.params.id);
  if (!canManage(req.u, sid)) return deny(res);
  const { template_id, user_id, scene_id, owner_id, apply_scene } = req.body;
  if (template_id) {
    if (user_id) run('INSERT INTO assignments VALUES(?,?,?) ON CONFLICT(store_id,template_id) DO UPDATE SET user_id=excluded.user_id', sid, template_id, user_id);
    else run('DELETE FROM assignments WHERE store_id=? AND template_id=?', sid, template_id);
  }
  if (scene_id && owner_id !== undefined) {
    run('INSERT INTO scene_owners VALUES(?,?,?) ON CONFLICT(store_id,scene_id) DO UPDATE SET user_id=excluded.user_id', sid, scene_id, owner_id);
    if (apply_scene) for (const t of q('SELECT id FROM templates WHERE scene_id=? AND active=1', scene_id))
      run('INSERT INTO assignments VALUES(?,?,?) ON CONFLICT(store_id,template_id) DO UPDATE SET user_id=excluded.user_id', sid, t.id, owner_id);
  }
  D.refreshPending(sid);
  const who = user_id || owner_id ? q1('SELECT name FROM users WHERE id=?', user_id || owner_id)?.name : '默认';
  D.audit(req.u.id, sid, '调整分配', template_id ? `${q1('SELECT title FROM templates WHERE id=?', template_id)?.title} → ${who}` : `场景负责人 ${q1('SELECT name FROM scenes WHERE id=?', scene_id)?.name} → ${who}${apply_scene ? '（含全部任务）' : ''}`);
  if (user_id || owner_id) D.notify([user_id || owner_id], 'assign', '工作分配有调整', '店长调整了你的固定运营工作，请在「我的任务」查看。', '#/my');
  res.json({ ok: true });
});

// ---------- leaves ----------
app.get('/api/leaves', (req, res) => {
  const sids = visibleStores(req.u);
  const from = req.query.from || L.addDays(L.today(), -7);
  if (!sids.length) return res.json([]);
  res.json(q(`SELECT l.*, u.name, r.name role_name, u.store_id, c.name cover_name, cr.name cover_role FROM leaves l JOIN users u ON u.id=l.user_id JOIN roles r ON r.id=u.role_id
    LEFT JOIN users c ON c.id=l.cover_user_id LEFT JOIN roles cr ON cr.id=c.role_id WHERE l.date>=? AND u.store_id IN (${sids.map(() => '?').join(',')}) ORDER BY l.date DESC`, from, ...sids));
});
app.post('/api/leaves', (req, res) => {
  const { user_id, date, cover_user_id, note, days } = req.body;
  const u = q1('SELECT * FROM users WHERE id=?', user_id);
  if (!u || (!canManage(req.u, u.store_id) && !leads(req.u, u.id))) return deny(res);
  if (!date) return err(res, '请选择日期');
  const n = Math.max(1, Math.min(31, Number(days) || 1));
  for (let i = 0; i < n; i++) run('INSERT INTO leaves(user_id,date,cover_user_id,note,created_by) VALUES(?,?,?,?,?) ON CONFLICT(user_id,date) DO UPDATE SET cover_user_id=excluded.cover_user_id, note=excluded.note',
    user_id, L.addDays(date, i), cover_user_id || null, note || '', req.u.id);
  D.refreshPending(u.store_id);
  const c = cover_user_id && q1('SELECT name FROM users WHERE id=?', cover_user_id);
  if (cover_user_id) D.notify([cover_user_id], 'cover', '顶岗通知', `${date} 起 ${n} 天，${u.name} 休息，其工作由你承接。`, '#/my');
  D.audit(req.u.id, u.store_id, '登记休息', `${u.name} ${date} ×${n} 天，承接人 ${c ? c.name : '店长'}`);
  res.json({ ok: true });
});
app.delete('/api/leaves/:id', (req, res) => {
  const l = q1('SELECT l.*, u.store_id, u.name FROM leaves l JOIN users u ON u.id=l.user_id WHERE l.id=?', req.params.id);
  if (!l || !canManage(req.u, l.store_id)) return deny(res);
  run('DELETE FROM leaves WHERE id=?', l.id);
  D.refreshPending(l.store_id);
  D.audit(req.u.id, l.store_id, '取消休息', `${l.name} ${l.date}`);
  res.json({ ok: true });
});

// ---------- flex & focus tasks ----------
app.get('/api/flex', (req, res) => {
  const sids = visibleStores(req.u);
  if (!sids.length) return res.json([]);
  let sql = `SELECT f.*, s.name scene_name, st.name store_name, u.name assignee_name, c.name creator_name,
    (SELECT COUNT(*) FROM instances i WHERE i.src='flex' AND i.src_id=f.id AND i.date<=?) total,
    (SELECT COUNT(*) FROM instances i WHERE i.src='flex' AND i.src_id=f.id AND i.date<=? AND i.status='done') done,
    (SELECT COUNT(*) FROM instances i WHERE i.src='flex' AND i.src_id=f.id AND i.check_result='bad') bad
    FROM flex_tasks f LEFT JOIN scenes s ON s.id=f.scene_id LEFT JOIN stores st ON st.id=f.store_id LEFT JOIN users u ON u.id=f.assignee_id LEFT JOIN users c ON c.id=f.created_by
    WHERE f.store_id IN (${sids.map(() => '?').join(',')})`;
  const p = [L.today(), L.today(), ...sids];
  if (req.query.source) { sql += ' AND f.source=?'; p.push(req.query.source); }
  const rows = q(sql + ' ORDER BY f.active DESC, f.id DESC', ...p);
  for (const r of rows) r.recent = q("SELECT date, status, check_result FROM instances WHERE src='flex' AND src_id=? AND date<=? ORDER BY date DESC LIMIT 7", r.id, L.today()).reverse();
  res.json(rows);
});
app.post('/api/flex', (req, res) => {
  const b = req.body;
  if (!canManage(req.u, b.store_id) && !(b.assignee_id && leads(req.u, Number(b.assignee_id)))) return deny(res);
  const source = b.source === 'focus' ? 'focus' : 'flex';
  if (source === 'focus' && req.u.level !== 'region_manager') return deny(res, '重点跟踪任务由区域经理创建');
  if (!(b.title || '').trim() || !b.assignee_id || !b.start_date || !b.due_time) return err(res, '请填写任务名称、执行人、开始日期和时间');
  const id = Number(run(`INSERT INTO flex_tasks(store_id,scene_id,title,standard,assignee_id,recur,recur_val,start_date,end_date,due_time,need_photo,source,created_by,created_at,ref)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, b.store_id, b.scene_id || null, (source === 'focus' && !b.title.startsWith('【') ? '【重点跟踪】' : '') + b.title.trim(), b.standard || '', b.assignee_id,
    b.recur || 'once', b.recur_val || null, b.start_date, b.recur === 'once' ? b.start_date : (b.end_date || null), b.due_time, b.need_photo ? 1 : 0, source, req.u.id, L.nowStr(), b.ref || null).lastInsertRowid);
  if (b.start_date <= L.today()) D.ensureInstances(L.today(), [Number(b.store_id)]);
  const store = q1('SELECT name FROM stores WHERE id=?', b.store_id).name;
  D.notify([b.assignee_id], source === 'focus' ? 'focus' : 'assign', source === 'focus' ? '区域重点跟踪任务' : '店长新增任务', `${b.title}（${b.due_time}）`, '#/my');
  if (source === 'focus') D.notify([...D.storeManagers(b.store_id), ...D.regionUsers(req.u.region_id, 'ops_manager')], 'focus', `${store} 新增重点跟踪任务`, b.title, '#/focus');
  D.audit(req.u.id, b.store_id, source === 'focus' ? '新增重点跟踪' : '新增灵活任务', b.title);
  res.json({ ok: true, id });
});
app.put('/api/flex/:id', (req, res) => {
  const f = q1('SELECT * FROM flex_tasks WHERE id=?', req.params.id);
  if (!f || !canManage(req.u, f.store_id)) return deny(res);
  if (f.source === 'focus' && req.u.level !== 'region_manager' && req.body.active === 0) return deny(res, '重点跟踪任务只能由区域经理关闭');
  if (req.body.active !== undefined) run('UPDATE flex_tasks SET active=? WHERE id=?', req.body.active ? 1 : 0, f.id);
  if (req.body.assignee_id) { run('UPDATE flex_tasks SET assignee_id=? WHERE id=?', req.body.assignee_id, f.id); D.refreshPending(f.store_id); }
  if (req.body.active === 0) run("DELETE FROM instances WHERE src='flex' AND src_id=? AND date>=? AND status='pending'", f.id, L.today());
  D.audit(req.u.id, f.store_id, req.body.active === 0 ? '停用任务' : '修改任务', f.title);
  res.json({ ok: true });
});

// ---------- rectifications ----------
const RECT_SQL = `SELECT r.*, i.title, i.date inst_date, i.scene_id, s.name scene_name, st.name store_name, u.name assignee_name, c.name creator_name, v.name verifier_name
  FROM rectifications r LEFT JOIN instances i ON i.id=r.instance_id LEFT JOIN scenes s ON s.id=i.scene_id LEFT JOIN stores st ON st.id=r.store_id
  LEFT JOIN users u ON u.id=r.assignee_id LEFT JOIN users c ON c.id=r.created_by LEFT JOIN users v ON v.id=r.verified_by`;
app.get('/api/rectifications', (req, res) => {
  const sids = visibleStores(req.u);
  if (!sids.length) return res.json([]);
  let sql = RECT_SQL + ` WHERE r.store_id IN (${sids.map(() => '?').join(',')})`;
  const p = [...sids];
  if (req.query.mine || req.u.level === 'staff') { sql += ' AND r.assignee_id=?'; p.push(req.u.id); }
  const cat = catFilter(req.u);
  if (cat) { sql += ' AND i.category=?'; p.push(cat); }
  const t = L.today();
  res.json(q(sql + " ORDER BY CASE r.status WHEN 'submitted' THEN 0 WHEN 'open' THEN 1 ELSE 2 END, r.deadline", ...p)
    .map(r => ({ ...r, late: r.status === 'open' && r.deadline < t })));
});
app.post('/api/rectifications/:id/submit', (req, res) => {
  const r = q1('SELECT * FROM rectifications WHERE id=?', req.params.id);
  if (!r || (r.assignee_id !== req.u.id && !canManage(req.u, r.store_id))) return deny(res);
  if (!(req.body.note || '').trim()) return err(res, '请说明整改情况');
  run("UPDATE rectifications SET status='submitted', submit_note=?, submit_photo=?, submitted_at=? WHERE id=?", req.body.note, savePhoto(req.body.photo) || r.submit_photo, L.nowStr(), r.id);
  D.notify([r.created_by, ...D.storeManagers(r.store_id)], 'rectify', '整改已提交，待复查', req.body.note, '#/rect');
  D.audit(req.u.id, r.store_id, '提交整改', req.body.note);
  res.json({ ok: true });
});
app.post('/api/rectifications/:id/verify', (req, res) => {
  const r = q1('SELECT * FROM rectifications WHERE id=?', req.params.id);
  if (!r || !canManage(req.u, r.store_id)) return deny(res);
  const pass = !!req.body.pass;
  if (!pass && !req.body.deadline) return err(res, '复查不通过需重新规定整改日期');
  run('UPDATE rectifications SET status=?, verify_comment=?, verified_by=?, verified_at=?, deadline=COALESCE(?, deadline), escalated=0 WHERE id=?',
    pass ? 'closed' : 'open', req.body.comment || '', req.u.id, L.nowStr(), pass ? null : req.body.deadline, r.id);
  D.notify([r.assignee_id], 'rectify', pass ? '整改复查通过，已闭环' : '整改复查未通过', req.body.comment || '', '#/my-rect');
  D.audit(req.u.id, r.store_id, pass ? '整改闭环' : '整改退回', req.body.comment || '');
  res.json({ ok: true });
});


// ---------- home (宏图) ----------
function homeScope(req, res) {
  const sids = visibleStores(req.u);
  const sid = Number(req.query.store) || sids[0];
  if (!sids.includes(sid)) { deny(res); return null; }
  const mine = req.u.level === 'staff' || req.query.mine === '1';
  let w = ' AND i.store_id=?'; const p = [sid];
  const cat = catFilter(req.u);
  if (cat) { w += ' AND i.category=?'; p.push(cat); }
  if (mine) { w += ' AND i.assignee_id=?'; p.push(req.u.id); }
  return { sid, mine, w, p, cat };
}
const monthEnd = d => L.addDays(L.addDays(d.slice(0, 8) + '01', 32).slice(0, 8) + '01', -1);
app.get('/api/home', (req, res) => {
  const sc = homeScope(req, res); if (!sc) return;
  const t = L.today();
  const date = req.query.date || t;
  const ws = L.addDays(date, -(L.weekday(date) - 1)), we = L.addDays(ws, 6);
  const ms = date.slice(0, 8) + '01', me = monthEnd(date);
  const end = we > me ? we : me;
  for (let d = ms < ws ? ms : ws; d <= end; d = L.addDays(d, 1)) D.ensureInstances(d, [sc.sid]);
  const week = [];
  for (let d = ws; d <= we; d = L.addDays(d, 1)) {
    const r = q1(`SELECT COUNT(*) total, SUM(i.status='done') done FROM instances i WHERE i.date=?${sc.w}`, d, ...sc.p);
    week.push({ date: d, total: r.total, done: r.done || 0, rate: d > t || !r.total ? null : Math.round((r.done || 0) * 100 / r.total) });
  }
  const rows = (where, ...args) => decorate(q(INST_SQL + ` WHERE ${where}${sc.w} ORDER BY i.date, i.due_time`, ...args, ...sc.p));
  const all = rows('i.date BETWEEN ? AND ?', ms < ws ? ms : ws, end);
  res.json({
    date, today: t, week, mine: sc.mine,
    tabs: {
      day: all.filter(i => i.date === date && (i.freq || 'daily') === 'daily'),
      week: all.filter(i => i.freq === 'weekly' && i.date >= ws && i.date <= we),
      month: all.filter(i => i.freq === 'monthly' && i.date >= ms && i.date <= me),
      once: all.filter(i => i.freq === 'once' && i.date >= ms && i.date <= me),
    },
  });
});

function pstats(uid, from, to) {
  const rs = q('SELECT i.status, i.date, i.due_time, i.done_at, i.check_result, s.name scene FROM instances i LEFT JOIN scenes s ON s.id=i.scene_id WHERE i.assignee_id=? AND i.date BETWEEN ? AND ?', uid, from, to);
  const P = (a, b) => (b ? Math.round(a * 100 / b) : null);
  const dn = rs.filter(r => r.status === 'done'), ck = rs.filter(r => r.check_result);
  const ot = dn.filter(r => (r.done_at || '').slice(0, 10) < r.date || ((r.done_at || '').slice(0, 10) === r.date && (r.done_at || '').slice(11, 16) <= r.due_time));
  const sc = {};
  for (const r of rs) { const x = sc[r.scene || '其他'] ||= { name: r.scene || '其他', total: 0, done: 0, bad: 0 }; x.total++; if (r.status === 'done') x.done++; if (r.check_result === 'bad') x.bad++; }
  const training = q1("SELECT COUNT(*) n FROM rectifications WHERE assignee_id=? AND created_at>=? AND training!=''", uid, from).n;
  return { total: rs.length, done: dn.length, rate: P(dn.length, rs.length), ontime: P(ot.length, dn.length), pass: P(ck.filter(r => r.check_result === 'good').length, ck.length),
    good: ck.filter(r => r.check_result === 'good').length, bad: ck.filter(r => r.check_result === 'bad').length, training,
    scenes: Object.values(sc).map(x => ({ ...x, rate: P(x.done, x.total) })).sort((a, b) => b.total - a.total) };
}
app.get('/api/team', (req, res) => {
  const sc = homeScope(req, res); if (!sc) return;
  const t = L.today(), hm = L.nowHM();
  const team = teamOf(req.u, sc.sid);
  res.json(team.map(m => {
    const ts = q('SELECT status, due_time, date FROM instances WHERE assignee_id=? AND date=?', m.id, t);
    return { id: m.id, name: m.name, role_name: m.role_name, leave: !!q1('SELECT 1 FROM leaves WHERE user_id=? AND date=?', m.id, t),
      today: { total: ts.length, done: ts.filter(x => x.status === 'done').length, overdue: ts.filter(x => x.status !== 'done' && x.due_time < hm).length },
      s30: pstats(m.id, L.addDays(t, -30), L.addDays(t, -1)) };
  }));
});
app.get('/api/person/:id', (req, res) => {
  const m = q1(USER_SQL + ' WHERE u.id=?', req.params.id);
  if (!m || !(m.id === req.u.id || canManage(req.u, m.store_id) || leads(req.u, m.id))) return deny(res);
  const t = L.today();
  res.json({ user: { id: m.id, name: m.name, role_name: m.role_name, store_id: m.store_id }, leave: !!q1('SELECT 1 FROM leaves WHERE user_id=? AND date=?', m.id, t),
    s30: pstats(m.id, L.addDays(t, -30), L.addDays(t, -1)),
    today: decorate(q(INST_SQL + ' WHERE i.assignee_id=? AND i.date=? ORDER BY i.due_time', m.id, t)),
    checks: decorate(q(INST_SQL + ' WHERE i.assignee_id=? AND i.check_result IS NOT NULL ORDER BY i.checked_at DESC LIMIT 8', m.id)),
    rects: q('SELECT r.*, i.title FROM rectifications r LEFT JOIN instances i ON i.id=r.instance_id WHERE r.assignee_id=? ORDER BY r.id DESC LIMIT 6', m.id) });
});
app.get('/api/must', (req, res) => {
  const sc = homeScope(req, res); if (!sc) return;
  const t = L.today(), y = L.addDays(t, -1);
  const mgr = canManage(req.u, sc.sid), ids = new Set(teamOf(req.u, sc.sid).map(x => x.id));
  const mine = r => mgr || ids.has(r.assignee_id);
  const T = decorate(q(INST_SQL + ' WHERE i.store_id=? AND i.date=?', sc.sid, t)).filter(r => mine(r) || r.assignee_id === req.u.id);
  const out = [], seen = new Set();
  const push = (kind, reason, r) => { if (!seen.has(r.id)) { seen.add(r.id); out.push({ kind, reason, t: r }); } };
  T.filter(r => r.assignee_id === req.u.id && r.status !== 'done').forEach(r => push('self', '我亲做', r));
  T.filter(r => r.origin === 'focus' && r.assignee_id !== req.u.id).forEach(r => push('focus', '上级重点跟踪', r));
  T.filter(r => r.tag === '清零项' && r.status !== 'done').forEach(r => push('zero', '清零项：当日必须完成', r));
  T.filter(r => r.m === 'M2' && r.status === 'done' && !r.check_result).forEach(r => push('review', 'M2：待复查', r));
  const yb = q("SELECT src, src_id FROM instances WHERE store_id=? AND date=? AND check_result='bad'", sc.sid, y);
  T.filter(r => yb.some(b => b.src === r.src && b.src_id === r.src_id)).forEach(r => push('again', '昨日点评不合格，今日复看', r));
  T.filter(r => r.overdue && r.status !== 'done').slice(0, 6).forEach(r => push('late', '已超时，跟进原因', r));
  T.filter(r => r.m === 'M3' && r.status === 'done' && !r.check_result).sort((a, b) => hash(t + a.id) - hash(t + b.id)).slice(0, 3).forEach(r => push('spot', 'M3：随机抽查', r));
  res.json(out);
});
app.get('/api/upper', (req, res) => {
  const sc = homeScope(req, res); if (!sc) return;
  const t = L.today();
  const focus = q(`SELECT f.*, u.name assignee_name, c.name creator FROM flex_tasks f LEFT JOIN users u ON u.id=f.assignee_id LEFT JOIN users c ON c.id=f.created_by
    WHERE f.store_id=? AND f.source='focus' AND (f.end_date IS NULL OR f.end_date>=?) ORDER BY f.id DESC`, sc.sid, t)
    .map(f => ({ ...f, today: q1("SELECT id, status FROM instances WHERE src='flex' AND src_id=? AND date=?", f.id, t) || null,
      rate: q1("SELECT ROUND(AVG(status='done')*100) r FROM instances WHERE src='flex' AND src_id=? AND date<?", f.id, t).r }));
  const rects = q(`SELECT r.*, u.name assignee_name, c.name creator, cr.name creator_role, i.title FROM rectifications r JOIN users c ON c.id=r.created_by JOIN roles cr ON cr.id=c.role_id
    LEFT JOIN users u ON u.id=r.assignee_id LEFT JOIN instances i ON i.id=r.instance_id WHERE r.store_id=? AND cr.level IN ('region_manager','ops_manager','sales_manager') AND r.status!='closed' ORDER BY r.deadline`, sc.sid);
  const patrols = q('SELECT * FROM patrols WHERE store_id=? ORDER BY COALESCE(done_at, planned_date) DESC LIMIT 4', sc.sid);
  res.json({ focus, rects, patrols });
});
app.post('/api/handover', (req, res) => {
  const to = q1(USER_SQL + ' WHERE u.id=?', req.body.to_user_id);
  if (!to) return err(res, '请选择接手人');
  const t = L.today();
  const n = run("UPDATE instances SET orig_assignee_id=COALESCE(orig_assignee_id, assignee_id), assignee_id=? WHERE assignee_id=? AND date=? AND status='pending'", to.id, req.u.id, t).changes;
  D.notify([to.id], 'assign', `${req.u.name} 向你交班`, `移交今日未完成任务 ${n} 项${req.body.note ? '：' + req.body.note : ''}`, '#/my');
  D.audit(req.u.id, to.store_id, '一键交班', `${n} 项 → ${to.name}`);
  res.json({ ok: true, n });
});

app.get('/api/calendar', (req, res) => {
  const sc = homeScope(req, res); if (!sc) return;
  const t = L.today();
  const rows = q(`SELECT i.date, COUNT(*) total, SUM(i.status='done') done FROM instances i WHERE i.date BETWEEN ? AND ?${sc.w} GROUP BY i.date`, req.query.from, req.query.to, ...sc.p);
  res.json(Object.fromEntries(rows.filter(r => r.date <= t).map(r => [r.date, Math.round((r.done || 0) * 100 / r.total)])));
});

app.get('/api/profile', (req, res) => {
  const sc = homeScope(req, res); if (!sc) return;
  const u = req.u, t = L.today(), y = L.addDays(t, -1);
  const week = req.query.mode === 'week';
  const ms = (t.endsWith('-01') ? y : t).slice(0, 8) + '01';
  const from = week ? L.addDays(t, -7) : ms, to = y;
  const store = q1('SELECT * FROM stores WHERE id=?', sc.sid);
  const patrol = q1("SELECT score, done_at FROM patrols WHERE store_id=? AND status='done' ORDER BY done_at DESC LIMIT 1", sc.sid);
  const rows = decorate(q(INST_SQL + ` WHERE i.date BETWEEN ? AND ?${sc.w}`, from, to, ...sc.p));
  const R = (a, b) => (b.length ? Math.round(a.length * 100 / b.length) : null);
  const done = r => r.status === 'done';
  const ind = [];
  const add = (group, name, v, good, warn, unit = '%', higher = true) => {
    if (v == null) return;
    const st = higher ? (v >= good ? 'ok' : v >= warn ? 'warn' : 'bad') : (v <= good ? 'ok' : v <= warn ? 'warn' : 'bad');
    ind.push({ group, name, value: v, unit, status: st, rule: higher ? `≥${good}${unit} 达标，≥${warn}${unit} 预警` : `≤${good}${unit} 达标，≤${warn}${unit} 预警` });
  };
  const byF = f => rows.filter(r => (r.freq || 'daily') === f);
  add('执行', '日任务完成率', R(byF('daily').filter(done), byF('daily')), 95, 85);
  add('执行', '周任务完成率', R(byF('weekly').filter(done), byF('weekly')), 95, 85);
  add('执行', '月任务完成率', R(byF('monthly').filter(done), byF('monthly')), 100, 80);
  const dn = rows.filter(done);
  add('执行', '准时完成率', R(dn.filter(r => (r.done_at || '').slice(0, 10) < r.date || ((r.done_at || '').slice(0, 10) === r.date && r.done_at.slice(11, 16) <= r.due_time)), dn), 90, 80);
  const ck = rows.filter(r => r.check_result);
  add('质量', '抽查合格率', R(ck.filter(r => r.check_result === 'good'), ck), 90, 80);
  const zero = rows.filter(r => r.tag === '清零项');
  add('品牌标准', '清零项执行率', R(zero.filter(r => done(r) && r.check_result !== 'bad'), zero), 100, 95);
  const key = rows.filter(r => r.tag === '重点项');
  add('品牌标准', '重点项执行率', R(key.filter(done), key), 98, 90);
  const m2 = rows.filter(r => r.m === 'M2' && done(r));
  add('品牌标准', 'M2 店长复查覆盖率', R(m2.filter(r => r.check_result), m2), 90, 70);
  const m3 = rows.filter(r => r.m === 'M3' && done(r));
  add('品牌标准', 'M3 抽查覆盖率', R(m3.filter(r => r.check_result), m3), 20, 10);
  const f4 = rows.filter(r => (r.f || '').includes('F4'));
  add('品牌标准', 'F4 群拍提交率', R(f4.filter(r => done(r) && r.photo), f4), 95, 85);
  const f3 = rows.filter(r => r.need_value);
  add('品牌标准', 'F3 计量填报率', R(f3.filter(r => done(r)), f3), 95, 85);
  const scenes = {};
  for (const r of rows) (scenes[r.scene_name || '其他'] ||= []).push(r);
  for (const [n, rs] of Object.entries(scenes)) add('场景', `${n}完成率`, R(rs.filter(done), rs), 95, 85);
  if (!sc.mine) {
    const late = q1("SELECT COUNT(*) n FROM rectifications WHERE store_id=? AND status!='closed' AND deadline<?", sc.sid, t).n;
    add('质量', '逾期未整改', late, 0, 2, '项', false);
    const fx = rows.filter(r => r.origin === 'focus');
    add('质量', '重点跟踪执行率', R(fx.filter(done), fx), 100, 90);
    if (patrol) add('质量', '最近巡店得分', patrol.score, 90, 80, '分');
    if (!sc.cat || sc.cat === 'sales') {
      const b = bizRange(sc.sid, from, to);
      add('经营', '出租率', Math.round(b.occ * 1000) / 10, 85, 75);
      add('经营', 'RevPAR 指数（MPI）', Math.round(b.mpi * 10) / 10, 100, 95, '');
      add('经营', '差评数', b.bad, 0, 2, '条', false);
    }
  }
  const cnt = s => ind.filter(i => i.status === s).length;
  const health = ind.length ? Math.round((cnt('ok') * 100 + cnt('warn') * 60) / ind.length) : null;
  const rateIn = (f, a, b) => {
    const r = q1(`SELECT COUNT(*) total, SUM(i.status='done') done FROM instances i WHERE i.date BETWEEN ? AND ? AND COALESCE(CASE WHEN i.src='tpl' THEN (SELECT freq FROM templates WHERE id=i.src_id) ELSE (SELECT recur FROM flex_tasks WHERE id=i.src_id) END,'daily')=?${sc.w}`, a, b, f, ...sc.p);
    return r.total ? Math.round((r.done || 0) * 100 / r.total) : null;
  };
  const ws = L.addDays(t, -(L.weekday(t) - 1)), cm = t.slice(0, 8) + '01', lme = L.addDays(cm, -1), lms = lme.slice(0, 8) + '01', ys = t.slice(0, 5) + '01-01';
  const completion = {
    cur: { day: rateIn('daily', y, y), week: rateIn('weekly', ws, t), month: rateIn('monthly', cm, t) },
    last: { day: rateIn('daily', lms, lme), week: rateIn('weekly', lms, lme), month: rateIn('monthly', lms, lme) },
    year: { day: rateIn('daily', ys, y), week: rateIn('weekly', ys, t), month: rateIn('monthly', ys, t) },
  };
  const cr = R(rows.filter(done), rows);
  const score = health == null || cr == null ? null : Math.round(health * 0.6 + cr * 0.4);
  const since = L.addDays('2021-03-01', Math.floor(hash('since' + u.id) * 1200));
  res.json({ user: { name: u.name, role: u.role_name, level: u.level, since }, store: { ...store, patrol_score: patrol?.score ?? null, patrol_at: patrol?.done_at || null },
    from, to, mode: week ? 'week' : 'month', health, completion_rate: cr, score, counts: { ok: cnt('ok'), warn: cnt('warn'), bad: cnt('bad') }, indicators: ind, completion });
});

function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
const BIZ_BASE = [0, 380, 460, 320];
const REVIEW_TOPICS = [
  ['隔音', '建议排查噪音源，尝试引导高噪房型客人，观察后续评价。'],
  ['早餐品种', '建议复盘早餐出品计划，高峰前补足热菜主食，并跟踪 9:00 断档检查。'],
  ['卫生间毛发', '建议加强 OK 房抽查比例，对相关服务员做清洁标准复训。'],
  ['前台排队', '建议早高峰增开退房通道，提前预制账单。'],
  ['空调噪音', '建议工程排查相关楼层风机盘管，必要时调房。'],
  ['WiFi 信号', '建议工程检测弱信号楼层 AP，补充信号覆盖。'],
];
function bizDay(sid, d) {
  const base = BIZ_BASE[sid] || 350;
  const wk = [5, 6].includes(L.weekday(d)) ? 1.12 : 1;
  const occ = Math.min(0.97, 0.7 + hash(sid + 'o' + d) * 0.22) * (wk > 1 ? 1.04 : 1);
  const adr = base / 0.82 * (0.92 + hash(sid + 'a' + d) * 0.16) * wk;
  const bad = hash(sid + 'r' + d) > 0.62 ? 1 + (hash(sid + 'r2' + d) > 0.8 ? 1 : 0) : 0;
  const topic = sid === 3 && hash(sid + 't' + d) > 0.35 ? 1 : Math.floor(hash(sid + 't' + d) * REVIEW_TOPICS.length);
  return { occ, adr, revpar: occ * adr, mpi: 92 + hash(sid + 'm' + d) * 24, bad, topic };
}
function bizRange(sid, from, to) {
  let n = 0, rev = 0, occ = 0, adr = 0, mpi = 0, bad = 0; const topics = {};
  for (let d = from; d <= to; d = L.addDays(d, 1)) {
    const b = bizDay(sid, d); n++; rev += b.revpar; occ += b.occ; adr += b.adr; mpi += b.mpi; bad += b.bad;
    if (b.bad) topics[b.topic] = (topics[b.topic] || 0) + b.bad;
  }
  return { revpar: rev / n, occ: occ / n, adr: adr / n, mpi: mpi / n, bad, topics };
}
const pct = (a, b) => (b ? Math.round((a - b) * 1000 / b) / 10 : 0);
const sgn = v => (v > 0 ? '+' : '') + v + '%';
app.get('/api/brief', (req, res) => {
  const sc = homeScope(req, res); if (!sc) return;
  const t = L.today(), y = L.addDays(t, -1);
  const week = req.query.mode === 'week';
  const from = week ? L.addDays(y, -6) : y, to = y;
  const pf = L.addDays(from, -7), pt = L.addDays(to, -7);
  const label = week ? '近 7 日' : '昨日';
  for (let d = pf; d <= t; d = L.addDays(d, 1)) D.ensureInstances(d, [sc.sid]);
  const st = (a, b) => q1(`SELECT COUNT(*) total, SUM(i.status='done') done, SUM(i.check_result IS NOT NULL) checked, SUM(i.check_result='good') good, SUM(i.check_result='bad') bad,
    SUM(i.status='done' AND substr(i.done_at,12,5)>i.due_time) late FROM instances i WHERE i.date BETWEEN ? AND ?${sc.w}`, a, b, ...sc.p);
  const cur = st(from, to), prev = st(pf, pt);
  const rate = x => (x.total ? Math.round((x.done || 0) * 1000 / x.total) / 10 : 0);
  const r1 = rate(cur), r0 = rate(prev);
  const pass = cur.checked ? Math.round((cur.good || 0) * 100 / cur.checked) : null;
  const rw = sc.mine ? ' AND r.assignee_id=?' : '';
  const rp = sc.mine ? [req.u.id] : [];
  const rects = q(`SELECT r.*, i.title FROM rectifications r LEFT JOIN instances i ON i.id=r.instance_id WHERE r.store_id=? AND r.status!='closed'${rw}${sc.cat ? ' AND i.category=?' : ''}`, sc.sid, ...rp, ...(sc.cat ? [sc.cat] : []));
  const lateRects = rects.filter(r => r.status === 'open' && r.deadline < t);
  const items = [];
  const overdue = q1(`SELECT COUNT(*) n FROM instances i WHERE i.date=? AND i.status='pending' AND i.due_time<?${sc.w}`, t, L.nowHM(), ...sc.p).n;
  if (overdue) items.push({ level: 'bad', title: `今日已有 ${overdue} 项超时未完成`, body: sc.mine ? '请尽快完成，超时 30 分钟会升级提醒店长。' : '建议查看超时任务，必要时临时改派或代为完成。', link: sc.mine ? '#/home' : '#/tasks?st=overdue&store=' + sc.sid });
  if (lateRects.length) items.push({ level: 'bad', title: `整改逾期 ${lateRects.length} 项`, body: `「${lateRects[0].title || lateRects[0].task}」等已过整改截止日期，${sc.mine ? '请尽快提交整改。' : '建议督促责任人提交，必要时复训。'}`, link: sc.mine ? '#/my-rect' : '#/rect?st=late' });
  if (cur.bad) {
    const b = q(`SELECT i.title FROM instances i WHERE i.date BETWEEN ? AND ? AND i.check_result='bad'${sc.w}`, from, to, ...sc.p);
    items.push({ level: 'warn', title: `${label}抽查不合格 ${cur.bad} 项`, body: `「${b[0].title}」${b.length > 1 ? ` 等 ${b.length} 项` : ''}，已下发培训和整改任务，请按期闭环。`, link: sc.mine ? '#/my-rect' : '#/rect' });
  }
  if (!sc.mine) {
    const rep = q(`SELECT i.title, COUNT(*) n FROM instances i WHERE i.date BETWEEN ? AND ? AND i.check_result='bad'${sc.w} GROUP BY i.title HAVING n>=2 ORDER BY n DESC LIMIT 1`, L.addDays(t, -14), t, ...sc.p)[0];
    if (rep) items.push({ level: 'warn', title: `问题重复出现：${rep.title}`, body: `14 天内 ${rep.n} 次抽查不合格，建议设为重点跟踪任务，每日定点检查。`, link: '#/issues' });
    const unchecked = q1(`SELECT COUNT(*) n FROM instances i WHERE i.date=? AND i.status='done' AND i.check_result IS NULL${sc.w}`, t, ...sc.p).n;
    if (unchecked && !sc.cat) items.push({ level: 'acc', title: `今日 ${unchecked} 项已完成待抽查`, body: '建议随机抽查 3-5 项，合格的给予肯定，不合格的写明原因并安排整改。', link: '#/desk' });
  }
  const zero = q(`SELECT i.title, tp.code FROM instances i JOIN templates tp ON i.src='tpl' AND tp.id=i.src_id WHERE i.date BETWEEN ? AND ? AND tp.tag='清零项'
    AND ((i.status='pending' AND i.date<?) OR i.check_result='bad')${sc.w}`, from, to, t, ...sc.p);
  if (zero.length) items.unshift({ level: 'bad', title: `清零项未达标 ${zero.length} 项`, body: `品牌审计第 ${zero.slice(0, 3).map(z => z.code).join('、')} 条「${zero[0].title}」${zero.length > 1 ? '等' : ''}${label}未完成或抽查不合格，审计中触发即整店清零，请优先处理。`, link: '#/standards?tag=' + encodeURIComponent('清零项') });
  if (!sc.mine && !sc.cat) {
    const rv = q1(`SELECT COUNT(*) n FROM instances i JOIN templates tp ON i.src='tpl' AND tp.id=i.src_id WHERE i.date BETWEEN ? AND ? AND tp.m='M2' AND i.status='done' AND i.check_result IS NULL${sc.w}`, L.addDays(t, -2), t, ...sc.p).n;
    if (rv) items.push({ level: 'acc', title: `M2 待店长复查 ${rv} 项`, body: '「下级做 + 店长复查」类品牌标准需要店长逐条复查，合格给予肯定，不合格写明原因并下发整改。', link: '#/tasks?m=M2&st=unchecked' });
  }
  const focus = q(`SELECT title, id FROM flex_tasks WHERE store_id=? AND source='focus' AND active=1 AND (end_date IS NULL OR end_date>=?)`, sc.sid, t);
  for (const f of focus.slice(0, 2)) {
    const r = q1(`SELECT COUNT(*) total, SUM(status='done') done FROM instances WHERE src='flex' AND src_id=? AND date BETWEEN ? AND ?`, f.id, L.addDays(t, -7), y);
    if (r.total) items.push({ level: r.done < r.total ? 'warn' : 'ok', title: `重点跟踪：${f.title.replace('【重点跟踪】', '')}`, body: `近 7 日完成 ${r.done || 0}/${r.total}，区域经理和运营经理持续跟进中。`, link: S_FOCUS(req.u) });
  }
  if (!items.length) items.push({ level: 'ok', title: '运营平稳', body: `${label}任务按时完成，暂无超时、逾期整改和重复问题。`, link: '' });
  const newRect = q1(`SELECT COUNT(*) n FROM rectifications r WHERE r.store_id=? AND substr(r.created_at,1,10) BETWEEN ? AND ?${rw}`, sc.sid, from, to, ...rp).n;
  const ops = {
    headline: `${label}${sc.mine ? '我的' : ''}任务完成率 **${r1}%**，周环比 **${sgn(Math.round((r1 - r0) * 10) / 10)}**${pass !== null ? `，抽查合格率 **${pass}%**` : ''}${newRect ? `，新增 **${newRect}** 项整改` : ''}${rects.length ? `，未闭环整改 **${rects.length}** 项` : ''}。`,
    items,
  };
  let biz = null;
  if (!sc.mine || req.u.level !== 'staff') {
    const b1 = bizRange(sc.sid, from, to), b0 = bizRange(sc.sid, pf, pt);
    const wow = pct(b1.revpar, b0.revpar);
    const comp = b1.mpi >= 104 ? '远超竞对' : b1.mpi >= 100 ? '略超竞对' : '低于竞对';
    const topicIds = Object.keys(b1.topics).sort((a, b) => b1.topics[b] - b1.topics[a]);
    const bitems = topicIds.map(k => ({ level: 'bad', title: `新增 ${b1.topics[k]} 条${REVIEW_TOPICS[k][0]}差评`, body: REVIEW_TOPICS[k][1], link: '' }));
    bitems.push({ level: 'acc', title: `出租率 ${(b1.occ * 100).toFixed(1)}% · 平均房价 ${b1.adr.toFixed(0)} 元`, body: `RevPAR 指数（MPI）${b1.mpi.toFixed(1)}，${comp}。`, link: '' });
    biz = {
      headline: `${label}RevPAR **${b1.revpar.toFixed(2)}**元，周环比**${sgn(wow)}**，${comp}${b1.bad ? `，新增**${b1.bad}**条${topicIds.length === 1 ? REVIEW_TOPICS[topicIds[0]][0] : ''}差评` : '，无新增差评'}。`,
      items: bitems,
      sim: true,
    };
  }
  res.json({ mode: week ? 'week' : 'day', from, to, ops, biz });
});
const S_FOCUS = u => (['region_manager', 'ops_manager', 'store_manager'].includes(u.level) ? '#/focus' : '#/home');

// ---------- brand standards (品牌审计 M-L-F) ----------
app.get('/api/standards', (req, res) => {
  const sids = visibleStores(req.u);
  const sid = Number(req.query.store) || sids[0];
  if (sid && !sids.includes(sid)) return deny(res);
  const t = L.today(), from = L.addDays(t, -14);
  const rows = q(`SELECT tp.*, r.name role_name, s.name scene_name, s.sort scene_sort,
      (SELECT COUNT(*) FROM instances i WHERE i.src='tpl' AND i.src_id=tp.id AND i.store_id=? AND i.date BETWEEN ? AND ?) n_total,
      (SELECT COUNT(*) FROM instances i WHERE i.src='tpl' AND i.src_id=tp.id AND i.store_id=? AND i.date BETWEEN ? AND ? AND i.status='done') n_done,
      (SELECT COUNT(*) FROM instances i WHERE i.src='tpl' AND i.src_id=tp.id AND i.store_id=? AND i.date BETWEEN ? AND ? AND i.check_result='bad') n_bad,
      (SELECT result FROM patrol_items pi JOIN patrols p ON p.id=pi.patrol_id WHERE pi.code=tp.code AND p.store_id=? AND p.status='done' ORDER BY p.done_at DESC LIMIT 1) last_patrol
    FROM templates tp LEFT JOIN roles r ON r.id=tp.role_id LEFT JOIN scenes s ON s.id=tp.scene_id WHERE tp.src='audit' ORDER BY tp.code`,
    sid, from, L.addDays(t, -1), sid, from, L.addDays(t, -1), sid, from, L.addDays(t, -1), sid);
  res.json({ store: sid, from, rows });
});
app.get('/api/feed', (req, res) => {
  const sids = visibleStores(req.u);
  const sid = Number(req.query.store) || sids[0];
  if (!sids.includes(sid)) return deny(res);
  const date = req.query.date || L.today();
  D.ensureInstances(date, [sid]);
  const rows = decorate(q(INST_SQL + " WHERE i.store_id=? AND i.date=? AND tp.f LIKE '%F4%' ORDER BY i.status='done' DESC, i.done_at DESC, i.due_time", sid, date));
  res.json({ store: sid, date, rows });
});

// ---------- dashboard & issues ----------
function storeStats(sids, from, to, cat) {
  const t = L.today(), hm = L.nowHM();
  return sids.map(sid => {
    const p = [sid, from, to];
    let c = '';
    if (cat) { c = ' AND category=?'; p.push(cat); }
    const s = q1(`SELECT COUNT(*) total, SUM(status='done') done, SUM(status='pending' AND (date<? OR (date=? AND due_time<?))) overdue,
      SUM(check_result IS NOT NULL) checked, SUM(check_result='good') good, SUM(check_result='bad') bad,
      SUM(origin='focus') focus_total, SUM(origin='focus' AND status='done') focus_done,
      SUM(status='done' AND substr(done_at,12,5)>due_time) late
      FROM instances WHERE store_id=? AND date BETWEEN ? AND ?${c}`, t, t, hm, ...p);
    const rect = q1(`SELECT SUM(r.status!='closed') open, SUM(r.status='open' AND r.deadline<?) late, SUM(r.status='closed') closed, COUNT(*) total
      FROM rectifications r LEFT JOIN instances i ON i.id=r.instance_id WHERE r.store_id=?${cat ? ' AND i.category=?' : ''}`, t, sid, ...(cat ? [cat] : []));
    const store = q1('SELECT * FROM stores WHERE id=?', sid);
    const total = s.total || 0;
    return { ...store, ...Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v || 0])), rate: total ? Math.round((s.done || 0) * 100 / total) : null,
      pass_rate: s.checked ? Math.round((s.good || 0) * 100 / s.checked) : null, rect_open: rect.open || 0, rect_late: rect.late || 0, rect_closed: rect.closed || 0,
      managers: D.storeManagers(sid).map(id => q1('SELECT name FROM users WHERE id=?', id).name) };
  });
}
app.get('/api/dashboard', (req, res) => {
  const sids = visibleStores(req.u);
  const t = L.today();
  const days = Number(req.query.days) || 7;
  const from = L.addDays(t, -(days - 1));
  for (let d = from; d <= t; d = L.addDays(d, 1)) D.ensureInstances(d, sids);
  const cat = catFilter(req.u);
  const ph = sids.map(() => '?').join(',') || 'NULL';
  const catSql = cat ? ' AND i.category=?' : '';
  const catP = cat ? [cat] : [];
  const trend = [];
  for (let d = from; d <= t; d = L.addDays(d, 1)) {
    const r = q1(`SELECT COUNT(*) total, SUM(status='done') done FROM instances i WHERE date=? AND store_id IN (${ph})${catSql}`, d, ...sids, ...catP);
    trend.push({ date: d, rate: r.total ? Math.round((r.done || 0) * 100 / r.total) : null });
  }
  const scenes = q(`SELECT s.id, s.name, COUNT(i.id) total, SUM(i.status='done') done, SUM(i.check_result='bad') bad FROM scenes s
    LEFT JOIN instances i ON i.scene_id=s.id AND i.date BETWEEN ? AND ? AND i.store_id IN (${ph})${catSql} WHERE s.active=1 GROUP BY s.id ORDER BY s.sort`, from, t, ...sids, ...catP)
    .map(s => ({ ...s, rate: s.total ? Math.round((s.done || 0) * 100 / s.total) : null }));
  const people = q(`SELECT u.id, u.name, r.name role_name, st.name store_name, COUNT(i.id) total, SUM(i.status='done') done, SUM(i.check_result='good') good, SUM(i.check_result='bad') bad
    FROM instances i JOIN users u ON u.id=i.assignee_id JOIN roles r ON r.id=u.role_id LEFT JOIN stores st ON st.id=i.store_id
    WHERE i.date BETWEEN ? AND ? AND i.date<? AND i.store_id IN (${ph})${catSql} GROUP BY u.id, i.store_id HAVING total>=3`, from, t, t, ...sids, ...catP)
    .map(p => ({ ...p, rate: Math.round((p.done || 0) * 100 / p.total) })).sort((a, b) => b.rate - a.rate || b.good - a.good);
  res.json({ from, to: t, today: storeStats(sids, t, t, cat), period: storeStats(sids, from, t, cat), trend, scenes, people });
});
app.get('/api/issues', (req, res) => {
  if (!isRegion(req.u) && req.u.level !== 'store_manager') return deny(res);
  const sids = visibleStores(req.u);
  const t = L.today();
  const from = L.addDays(t, -6);
  const cat = catFilter(req.u);
  const stats = storeStats(sids, from, L.addDays(t, -1), cat);
  const out = stats.map(s => {
    const issues = [];
    if (s.rate !== null && s.rate < 85) issues.push({ level: s.rate < 75 ? 'high' : 'mid', type: '完成率低', text: `近 7 日任务完成率 ${s.rate}%（目标 ≥85%）` });
    if (s.bad) issues.push({ level: s.bad >= 3 ? 'high' : 'mid', type: '抽查不合格', text: `近 7 日抽查不合格 ${s.bad} 次，合格率 ${s.pass_rate ?? '-'}%` });
    if (s.rect_late) issues.push({ level: 'high', type: '整改逾期', text: `${s.rect_late} 项整改已过截止日期未完成` });
    const rep = q(`SELECT i.title, s.name scene, COUNT(*) n FROM instances i LEFT JOIN scenes s ON s.id=i.scene_id WHERE i.store_id=? AND i.check_result='bad' AND i.date>=? ${cat ? 'AND i.category=?' : ''}
      GROUP BY i.src, i.src_id HAVING n>=2`, s.id, L.addDays(t, -14), ...(cat ? [cat] : []));
    for (const r of rep) issues.push({ level: 'high', type: '问题重复出现', text: `「${r.title}」14 日内不合格 ${r.n} 次`, scene: r.scene, title: r.title });
    const miss = q(`SELECT i.title, s.name scene, i.scene_id, COUNT(*) n, (SELECT COUNT(*) FROM instances j WHERE j.src=i.src AND j.src_id=i.src_id AND j.store_id=i.store_id AND j.date BETWEEN ? AND ?) total
      FROM instances i LEFT JOIN scenes s ON s.id=i.scene_id WHERE i.store_id=? AND i.status='pending' AND i.date BETWEEN ? AND ? ${cat ? 'AND i.category=?' : ''} GROUP BY i.src, i.src_id HAVING n>=2 ORDER BY n DESC LIMIT 5`,
      from, L.addDays(t, -1), s.id, from, L.addDays(t, -1), ...(cat ? [cat] : []));
    for (const m of miss) issues.push({ level: m.n >= 3 ? 'high' : 'mid', type: '任务漏做', text: `「${m.title}」近 7 日漏做 ${m.n}/${m.total} 次`, scene: m.scene, scene_id: m.scene_id, title: m.title });
    const lastPatrol = q1("SELECT * FROM patrols WHERE store_id=? AND status='done' ORDER BY done_at DESC LIMIT 1", s.id);
    const planned = q1("SELECT * FROM patrols WHERE store_id=? AND status='planned' ORDER BY planned_date LIMIT 1", s.id);
    const score = issues.reduce((a, i) => a + (i.level === 'high' ? 3 : 1), 0);
    return { store: s, issues, score, last_patrol: lastPatrol, planned };
  }).sort((a, b) => b.score - a.score);
  res.json(out);
});

// ---------- patrols ----------
app.get('/api/patrols', (req, res) => {
  const sids = visibleStores(req.u);
  if (!sids.length) return res.json([]);
  res.json(q(`SELECT p.*, st.name store_name, u.name creator_name FROM patrols p JOIN stores st ON st.id=p.store_id LEFT JOIN users u ON u.id=p.created_by
    WHERE p.store_id IN (${sids.map(() => '?').join(',')}) ORDER BY p.status='done', CASE WHEN p.status='done' THEN p.done_at END DESC, p.planned_date`, ...sids));
});
app.get('/api/patrols/:id', (req, res) => {
  const p = q1('SELECT p.*, st.name store_name FROM patrols p JOIN stores st ON st.id=p.store_id WHERE p.id=?', req.params.id);
  if (!p || !visibleStores(req.u).includes(p.store_id)) return deny(res);
  const items = q('SELECT pi.*, s.name scene_name FROM patrol_items pi LEFT JOIN scenes s ON s.id=pi.scene_id WHERE patrol_id=? ORDER BY id', p.id);
  const focus = q("SELECT id, title, active FROM flex_tasks WHERE ref=?", 'patrol:' + p.id);
  res.json({ ...p, items, focus });
});
app.post('/api/patrols', (req, res) => {
  if (req.u.level !== 'region_manager') return deny(res, '巡店计划由区域经理制定');
  const { store_id, planned_date, reason } = req.body;
  if (!store_id || !planned_date) return err(res, '请选择门店和巡店日期');
  const id = Number(run("INSERT INTO patrols(store_id,planned_date,reason,status,created_by,created_at) VALUES(?,?,?,'planned',?,?)", store_id, planned_date, reason || '', req.u.id, L.nowStr()).lastInsertRowid);
  const store = q1('SELECT name FROM stores WHERE id=?', store_id).name;
  D.notify(D.storeManagers(store_id), 'patrol', '区域经理巡店计划', `${planned_date} 巡店 ${store}：${reason || '例行巡店'}`, '#/patrol');
  D.audit(req.u.id, store_id, '加入巡店计划', `${planned_date} ${reason || ''}`);
  res.json({ ok: true, id });
});
app.post('/api/patrols/:id/complete', (req, res) => {
  const p = q1('SELECT * FROM patrols WHERE id=?', req.params.id);
  if (!p || req.u.level !== 'region_manager') return deny(res);
  const res0 = req.body.results || {};
  const tpls = q("SELECT * FROM templates WHERE src='audit' AND active=1 ORDER BY code");
  let earned = 0, max = 0, zero = [];
  D.tx(() => {
    run('DELETE FROM patrol_items WHERE patrol_id=?', p.id);
    for (const t of tpls) {
      const r = res0[t.code] || {};
      const result = ['pass', 'fail', 'na'].includes(r.result) ? r.result : 'pass';
      const mx = /^\d+$/.test(t.score) ? Number(t.score) : 0;
      if (result === 'fail' && !(r.comment || '').trim()) throw new Error(`第 ${t.code} 条「${t.title}」不达标，请写明问题`);
      if (result !== 'na') { max += mx; if (result === 'pass') earned += mx; }
      if (result === 'fail' && t.tag === '清零项') zero.push(t.code);
      run('INSERT INTO patrol_items(patrol_id,scene_id,item,score,max,comment,code,tag,result) VALUES(?,?,?,?,?,?,?,?,?)', p.id, t.scene_id, t.title,
        result === 'pass' ? mx : 0, mx, r.comment || '', t.code, t.tag, result);
    }
    const score = zero.length ? 0 : Math.round(earned * 100 / (max || 1));
    run("UPDATE patrols SET status='done', score=?, summary=?, done_at=? WHERE id=?", score, req.body.summary || '', L.nowStr(), p.id);
  });
  D.notify([...D.storeManagers(p.store_id), ...D.regionUsers(req.u.region_id, 'ops_manager')], 'patrol', zero.length ? '巡店报告：触发清零项' : '巡店报告已出', req.body.summary || '', '#/patrol/' + p.id);
  D.audit(req.u.id, p.store_id, '完成巡店', req.body.summary || '');
  res.json({ ok: true });
});
app.delete('/api/patrols/:id', (req, res) => {
  const p = q1('SELECT * FROM patrols WHERE id=?', req.params.id);
  if (!p || req.u.level !== 'region_manager' || p.status !== 'planned') return deny(res);
  run('DELETE FROM patrols WHERE id=?', p.id);
  D.audit(req.u.id, p.store_id, '取消巡店计划', p.planned_date);
  res.json({ ok: true });
});

// ---------- notifications ----------
app.get('/api/notifications', (req, res) => res.json(q('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100', req.u.id)));
app.post('/api/notifications/read', (req, res) => {
  if (req.body.id) run('UPDATE notifications SET read=1 WHERE id=? AND user_id=?', req.body.id, req.u.id);
  else run('UPDATE notifications SET read=1 WHERE user_id=?', req.u.id);
  res.json({ ok: true });
});
app.post('/api/reminders/run', (req, res) => {
  if (!['region_manager', 'store_manager'].includes(req.u.level)) return deny(res);
  const n = runReminders(L.today(), L.nowHM(), visibleStores(req.u));
  res.json({ ok: true, sent: n });
});

// ---------- settings / org ----------
const onlyRM = (req, res, next) => (req.u.level === 'region_manager' ? next() : deny(res, '仅区域经理可修改'));
app.get('/api/templates', (req, res) => res.json(q('SELECT t.*, r.name role_name, s.name scene_name FROM templates t LEFT JOIN roles r ON r.id=t.role_id LEFT JOIN scenes s ON s.id=t.scene_id ORDER BY s.sort, t.due_time')));
app.post('/api/templates', onlyRM, (req, res) => {
  const b = req.body;
  if (!(b.title || '').trim() || !b.scene_id || !b.role_id || !b.due_time) return err(res, '请填写完整');
  const vals = [b.scene_id, b.role_id, b.title.trim(), b.standard || '', b.due_time, b.freq || 'daily', b.freq_val || null, b.category || 'ops', b.need_photo ? 1 : 0, b.active === 0 ? 0 : 1];
  if (b.id) run('UPDATE templates SET scene_id=?,role_id=?,title=?,standard=?,due_time=?,freq=?,freq_val=?,category=?,need_photo=?,active=? WHERE id=?', ...vals, b.id);
  if (b.id && b.m) run('UPDATE templates SET m=?, f=?, need_value=? WHERE id=?', b.m, b.f || 'F1', b.need_value ? 1 : 0, b.id);
  else run('INSERT INTO templates(scene_id,role_id,title,standard,due_time,freq,freq_val,category,need_photo,active) VALUES(?,?,?,?,?,?,?,?,?,?)', ...vals);
  if (b.id && b.active === 0) run("DELETE FROM instances WHERE src='tpl' AND src_id=? AND date>=? AND status='pending'", b.id, L.today());
  D.audit(req.u.id, null, b.id ? '修改固定工作' : '新增固定工作', b.title);
  res.json({ ok: true });
});
app.post('/api/roles', onlyRM, (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return err(res, '请输入岗位名称');
  if (q1('SELECT 1 FROM roles WHERE name=?', name)) return err(res, '岗位已存在');
  run("INSERT INTO roles(name,level,sort) VALUES(?, 'staff', ?)", name, (q1('SELECT MAX(sort) m FROM roles').m || 0) + 1);
  D.audit(req.u.id, null, '新增岗位', name);
  res.json({ ok: true });
});
app.post('/api/scenes', onlyRM, (req, res) => {
  const name = (req.body.name || '').trim();
  if (req.body.id) { run('UPDATE scenes SET name=COALESCE(NULLIF(?,\'\'),name), active=? WHERE id=?', name, req.body.active === 0 ? 0 : 1, req.body.id); }
  else {
    if (!name) return err(res, '请输入场景名称');
    run('INSERT INTO scenes(name,sort) VALUES(?,?)', name, (q1('SELECT MAX(sort) m FROM scenes').m || 0) + 1);
  }
  D.audit(req.u.id, null, req.body.id ? '修改场景' : '新增场景', name);
  res.json({ ok: true });
});
app.post('/api/settings', onlyRM, (req, res) => {
  if (Array.isArray(req.body.reminder_times)) D.setSetting('reminder_times', req.body.reminder_times.filter(t => /^\d{2}:\d{2}$/.test(t)).sort());
  if (req.body.escalate_minutes !== undefined) D.setSetting('escalate_minutes', Math.max(0, Number(req.body.escalate_minutes) || 0));
  if (Array.isArray(req.body.patrol_checklist)) D.setSetting('patrol_checklist', req.body.patrol_checklist);
  D.audit(req.u.id, null, '修改设置', JSON.stringify(req.body).slice(0, 200));
  res.json({ ok: true });
});
app.post('/api/users', (req, res) => {
  const b = req.body;
  if (b.id) {
    const u = q1('SELECT * FROM users WHERE id=?', b.id);
    if (!u || !canManage(req.u, u.store_id)) return deny(res);
    run('UPDATE users SET name=COALESCE(?,name), role_id=COALESCE(?,role_id), active=COALESCE(?,active) WHERE id=?', b.name || null, b.role_id || null, b.active ?? null, u.id);
    if (b.active === 0) D.refreshPending(u.store_id);
    D.audit(req.u.id, u.store_id, b.active === 0 ? '停用人员' : '修改人员', u.name);
    return res.json({ ok: true });
  }
  if (!canManage(req.u, b.store_id)) return deny(res);
  if (!(b.name || '').trim() || !b.role_id) return err(res, '请填写姓名和岗位');
  const role = q1('SELECT * FROM roles WHERE id=?', b.role_id);
  if (!role || role.level !== 'staff') return err(res, '门店只能添加员工岗位');
  run('INSERT INTO users(name,role_id,region_id,store_id,phone) VALUES(?,?,?,?,?)', b.name.trim(), b.role_id, 1, b.store_id, b.phone || '');
  D.audit(req.u.id, b.store_id, '新增人员', `${b.name}（${role.name}）`);
  res.json({ ok: true });
});
app.get('/api/audit', (req, res) => {
  const sids = visibleStores(req.u);
  if (req.u.level === 'staff') return deny(res);
  res.json(q(`SELECT a.*, u.name user_name, st.name store_name FROM audit a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN stores st ON st.id=a.store_id
    WHERE a.store_id IS NULL OR a.store_id IN (${sids.map(() => '?').join(',') || 'NULL'}) ORDER BY a.id DESC LIMIT 300`, ...sids));
});

// ---------- reminders & escalation ----------
function runReminders(date, time, onlyStores) {
  const sids = onlyStores || q('SELECT id FROM stores').map(s => s.id);
  D.ensureInstances(date, sids);
  let n = 0;
  for (const sid of sids) {
    const store = q1('SELECT name FROM stores WHERE id=?', sid).name;
    const rows = q('SELECT * FROM instances WHERE store_id=? AND date=?', sid, date);
    if (!rows.length) continue;
    const byUser = {};
    for (const r of rows) if (r.status === 'pending') (byUser[r.assignee_id] ||= []).push(r);
    for (const [uid, list] of Object.entries(byUser)) {
      const od = list.filter(r => r.due_time < time).length;
      D.notify([Number(uid)], 'remind', `${time} 任务提醒：还有 ${list.length} 项未完成`, (od ? `其中 ${od} 项已超时。` : '') + list.slice(0, 4).map(r => `${r.due_time} ${r.title}`).join('；'), '#/my');
      n++;
    }
    const done = rows.filter(r => r.status === 'done').length;
    const od = rows.filter(r => r.status === 'pending' && r.due_time < time).length;
    const unchecked = rows.filter(r => r.status === 'done' && !r.check_result).length;
    D.notify(D.storeManagers(sid), 'remind', `${time} ${store} 完成情况：${done}/${rows.length}`, `超时未完成 ${od} 项，已完成待抽查 ${unchecked} 项。`, '#/tasks?store=' + sid);
    n++;
  }
  return n;
}
function tick() {
  try {
    const date = L.today(), time = L.nowHM();
    const times = D.getSetting('reminder_times', []);
    if (times.includes(time) && !q1('SELECT 1 FROM reminder_log WHERE date=? AND time=?', date, time)) {
      run('INSERT INTO reminder_log VALUES(?,?)', date, time);
      runReminders(date, time);
    }
    D.ensureInstances(date);
    const esc = D.getSetting('escalate_minutes', 30);
    for (const it of q("SELECT i.*, st.name store_name, u.name uname FROM instances i JOIN stores st ON st.id=i.store_id LEFT JOIN users u ON u.id=i.assignee_id WHERE i.date=? AND i.status='pending' AND i.escalated=0", date)) {
      if (L.addMinutes(it.due_time, esc) < time) {
        run('UPDATE instances SET escalated=1 WHERE id=?', it.id);
        D.notify(D.storeManagers(it.store_id), 'escalate', `超时升级：${it.title}`, `${it.store_name} ${it.uname || ''} 应于 ${it.due_time} 完成，已超时 ${esc} 分钟以上。`, '#/tasks?store=' + it.store_id);
      }
    }
    for (const r of q("SELECT r.*, st.name store_name, st.region_id FROM rectifications r JOIN stores st ON st.id=r.store_id WHERE r.status='open' AND r.deadline<? AND r.escalated=0", date)) {
      run('UPDATE rectifications SET escalated=1 WHERE id=?', r.id);
      D.notify([...D.storeManagers(r.store_id), ...D.regionUsers(r.region_id, 'region_manager'), ...D.regionUsers(r.region_id, 'ops_manager')], 'escalate', `整改逾期：${r.store_name}`, `${r.task}（截止 ${r.deadline}）`, '#/rect');
    }
  } catch (e) { console.error('tick', e); }
}
tick();
setInterval(tick, 30000);

app.use((e, req, res, next) => { console.error(e); res.status(400).json({ error: e.message || '出错了' }); });
app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log('LinkTask on :' + PORT));
