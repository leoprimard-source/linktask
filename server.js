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
const LEVEL_LABEL = { region_manager: '区域经理', ops_manager: '运营经理', sales_manager: '营销经理', hr_manager: '人事经理', store_manager: '店长', staff: '员工' };

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

const isRegion = u => ['region_manager', 'ops_manager', 'sales_manager', 'hr_manager'].includes(u.level);
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

// ---------- 区域「人」视角 / 人事档案（档案、资历、历史业绩为模拟数据） ----------
const LADDER = { 前台高级: ['前台初级', '前台中级'], 前台中级: ['前台初级'], 前台经理: ['前台初级', '前台中级', '前台高级'], 客房高级: ['客房初级', '客房中级'], 客房中级: ['客房初级'],
  客房经理: ['客房初级', '客房中级', '客房高级'], 店助: ['前台高级', '前台经理'], 店长: ['前台经理', '店助'], 运营经理: ['店助', '店长'], 人事经理: ['人事专员', '人事主管'], 营销经理: ['销售专员', '销售经理'] };
const CERTS = { 餐厅厨师: ['健康证', '中式烹调师证'], 工程: ['电工证', '健康证'], 保安: ['消防设施操作员证', '保安员证'], 店长: ['健康证', '全季店长认证'], 店助: ['健康证', '消防安全管理人证'] };
const EDU = ['高中', '中专', '大专', '大专', '本科', '本科'];
const MGR = ['store_manager', 'ops_manager', 'hr_manager', 'sales_manager', 'region_manager'];
function profileOf(u) {
  const h = k => hash(k + u.id), t = L.today();
  const senior = MGR.includes(u.level) || /经理|店助|高级/.test(u.role_name);
  const hire = !senior && u.id % 6 === 1 ? L.addDays(t, -Math.floor(62 + h('p') * 26)) : L.addDays(t, -Math.floor((senior ? 1100 : 220) + h('hire') * (senior ? 1600 : 1000)));
  const days = Math.round((Date.parse(t) - Date.parse(hire)) / 864e5);
  const steps = [...(LADDER[u.role_name] || []), u.role_name];
  const stores = q('SELECT name FROM stores').map(s => s.name);
  const home = u.store_id ? q1('SELECT name FROM stores WHERE id=?', u.store_id).name : q('SELECT s.name FROM user_stores us JOIN stores s ON s.id=us.store_id WHERE us.user_id=?', u.id).map(s => s.name).join('、') || '华东一区';
  const history = steps.map((r, i) => ({ role: r, from: L.addDays(hire, Math.floor(days * i / steps.length * (0.85 + h('s' + i) * 0.3))), store: i === steps.length - 1 ? home : stores[Math.floor(h('st' + i) * stores.length)] }));
  history[0].from = hire;
  const certs = (CERTS[u.role_name] || ['健康证']).map((c, i) => ({ name: c, expire: L.addDays(t, Math.floor(h('c' + i) * 420) - 25) }));
  const probation_end = L.addDays(hire, 90);
  return { hire, tenure: Math.round(days / 36.5) / 10, probation_end, in_probation: probation_end >= t, edu: EDU[Math.floor(h('edu') * EDU.length)], age: 21 + Math.floor(h('age') * (senior ? 20 : 18)),
    gender: h('g') > 0.5 ? '女' : '男', phone: u.phone, certs, history };
}
const monthsBack = n => { const t = L.today(); const out = []; let m = t.slice(0, 8) + '01'; for (let i = 0; i < n; i++) { out.unshift(m); m = L.addDays(m, -1).slice(0, 8) + '01'; } return out; };
const grade = s => (s >= 92 ? 'A' : s >= 85 ? 'B' : s >= 75 ? 'C' : 'D');
function perfOf(u) {
  const t = L.today();
  return monthsBack(6).map((m, i) => {
    const end = i === 5 ? L.addDays(t, -1) : L.addDays(L.addDays(m, 32).slice(0, 8) + '01', -1);
    const s = pstats(u.id, m, end);
    let score, real = s.total >= 10 && s.done > 0;
    if (real) score = Math.round((s.rate ?? 0) * 0.5 + (s.pass ?? s.rate ?? 0) * 0.3 + (s.ontime ?? 0) * 0.2);
    else score = Math.round(76 + hash('pf' + u.id) * 16 + (hash('pm' + u.id + m) - 0.5) * 8);
    return { ym: m.slice(0, 7), score, grade: grade(score), real, total: s.total, rate: s.rate, pass: s.pass, good: s.good, bad: s.bad };
  });
}
function hrSummary(u) {
  const t = L.today(), pf = profileOf(u), perf = perfOf(u), s30 = pstats(u.id, L.addDays(t, -30), L.addDays(t, -1));
  const avg3 = Math.round(perf.slice(-3).reduce((a, x) => a + x.score, 0) / 3);
  const tier = avg3 >= 88 && pf.tenure >= 1 && s30.bad < 2 ? '可晋升' : avg3 < 78 || s30.bad >= 4 ? '需辅导' : '稳定';
  const alerts = [];
  if (pf.in_probation && pf.probation_end <= L.addDays(t, 30)) alerts.push({ level: 'mid', type: '试用期到期', text: `${pf.probation_end} 试用期到期，需完成转正评估` });
  for (const c of pf.certs) if (c.expire <= L.addDays(t, 60)) alerts.push({ level: c.expire < t ? 'high' : 'mid', type: '证照到期', text: `${c.name}${c.expire < t ? '已于 ' + c.expire + ' 过期' : '将于 ' + c.expire + ' 到期'}` });
  if (s30.bad >= 2) alerts.push({ level: s30.bad >= 3 ? 'high' : 'mid', type: '多次不合格', text: `近 30 天抽查不合格 ${s30.bad} 次` });
  if (s30.total >= 20 && !s30.good) alerts.push({ level: 'low', type: '长期未获肯定', text: `近 30 天完成 ${s30.done} 项，未获一次肯定` });
  if (u.level === 'staff' && ((pf.tenure < 0.5 && s30.bad >= 1) || (s30.total >= 20 && !s30.good && (s30.rate ?? 100) < 90) || (s30.bad >= 3 && avg3 < 80))) alerts.push({ level: 'mid', type: '离职风险', text: '近期表现波动且缺少正向反馈，建议店长谈心并同步人事' });
  return { id: u.id, name: u.name, role_name: u.role_name, level: u.level, store_id: u.store_id, store: u.store_id ? q1('SELECT name FROM stores WHERE id=?', u.store_id).name : '区域',
    hire: pf.hire, tenure: pf.tenure, edu: pf.edu, in_probation: pf.in_probation, avg3, tier, alerts, s30: { total: s30.total, rate: s30.rate, pass: s30.pass, good: s30.good, bad: s30.bad, training: s30.training },
    trend: perf.map(x => x.score) };
}
const hrAlertCount = u => q(USER_SQL + " WHERE u.active=1 AND u.region_id=? AND r.level IN ('staff','store_manager')", u.region_id).reduce((a, x) => a + hrSummary(x).alerts.length, 0);
const canHR = u => ['region_manager', 'hr_manager'].includes(u.level);
app.get('/api/hr/people', (req, res) => {
  if (!canHR(req.u)) return deny(res);
  const sids = visibleStores(req.u);
  const us = q(USER_SQL + ` WHERE u.active=1 AND r.level IN ('staff','store_manager') AND (u.store_id IN (${sids.map(() => '?').join(',')}) OR r.level='store_manager') ORDER BY r.sort, u.store_id, u.id`, ...sids);
  const list = us.map(hrSummary);
  for (const x of list) if (x.level === 'store_manager') x.store = q('SELECT s.name FROM user_stores us JOIN stores s ON s.id=us.store_id WHERE us.user_id=?', x.id).map(s => s.name).join('、');
  const KEY = ['店长', '店助', '前台经理', '客房经理'];
  const bench = sids.map(sid => ({ store_id: sid, store: q1('SELECT name FROM stores WHERE id=?', sid).name, roles: KEY.map(role => {
    const dept = role.slice(0, 2);
    const pool = list.filter(x => x.tier === '可晋升' && x.role_name !== role && (role === '店长' || role === '店助' ? ['店助', '前台经理', '客房经理'].includes(x.role_name) : x.role_name.startsWith(dept)) && (x.store_id === sid || role === '店长'));
    return { role, candidates: pool.slice(0, 3).map(x => ({ id: x.id, name: x.name, role_name: x.role_name, store: x.store })) };
  }) }));
  res.json({ list, bench });
});
app.get('/api/hr/person/:id', (req, res) => {
  const u = q1(USER_SQL + ' WHERE u.id=?', req.params.id);
  if (!u || !(canPeople(req.u, u) || u.id === req.u.id)) return deny(res);
  const sum = hrSummary(u);
  res.json({ ...sum, profile: profileOf(u), perf: perfOf(u),
    trainings: q("SELECT r.*, i.title, c.name creator FROM rectifications r LEFT JOIN instances i ON i.id=r.instance_id LEFT JOIN users c ON c.id=r.created_by WHERE r.assignee_id=? AND r.training!='' ORDER BY r.id DESC LIMIT 12", u.id),
    checks: decorate(q(INST_SQL + ' WHERE i.assignee_id=? AND i.check_result IS NOT NULL ORDER BY i.checked_at DESC LIMIT 10', u.id)) });
});
function leaderWork(u, from) {
  const n = (sql, ...p) => q1(sql, ...p).n;
  const real = {
    patrol: n("SELECT COUNT(*) n FROM patrols WHERE created_by=? AND status='done' AND done_at>=?", u.id, from),
    focus: n("SELECT COUNT(*) n FROM flex_tasks WHERE created_by=? AND source='focus' AND created_at>=?", u.id, from),
    flex: n("SELECT COUNT(*) n FROM flex_tasks WHERE created_by=? AND source='flex' AND created_at>=?", u.id, from),
    checks: n('SELECT COUNT(*) n FROM instances WHERE checked_by=? AND checked_at>=?', u.id, from),
    training: n("SELECT COUNT(*) n FROM rectifications WHERE created_by=? AND created_at>=? AND training!=''", u.id, from),
    closed: n('SELECT COUNT(*) n FROM rectifications WHERE verified_by=? AND verified_at>=?', u.id, from),
    follow: n("SELECT COUNT(*) n FROM audit WHERE action='指派跟进' AND detail LIKE ? AND at>=?", '→' + u.name + '：%', from),
  };
  const sim = k => Math.floor(hash(k + u.id) * 6) + 3;
  const items = {
    store_manager: [['巡查点评', real.checks, '次'], ['培训指导', real.training, '次'], ['整改闭环', real.closed, '项'], ['定制任务', real.flex, '项']],
    ops_manager: [['督导到店', sim('v'), '家次', 1], ['培训指导', sim('t'), '场', 1], ['跟进问题', real.follow, '项'], ['重点跟踪', n("SELECT COUNT(*) n FROM flex_tasks WHERE source='focus' AND active=1"), '项']],
    hr_manager: [['到店访谈', sim('v'), '家次', 1], ['组织培训', sim('t'), '场', 1], ['招聘入职', sim('h'), '人', 1], ['人员预警', hrAlertCount(u), '项']],
    sales_manager: [['协议客户拜访', sim('c') + 6, '家', 1], ['门店营销辅导', sim('m'), '次', 1], ['营销活动', sim('a') - 1, '场', 1], ['跟进问题', real.follow, '项']],
  }[u.level] || [];
  return { real, items };
}
app.get('/api/region/people', (req, res) => {
  if (!['region_manager', 'ops_manager'].includes(req.u.level)) return deny(res);
  const t = L.today(), y = L.addDays(t, -1), f30 = L.addDays(t, -30), sids = visibleStores(req.u);
  const s30 = storeStats(sids, f30, y), w1 = storeStats(sids, L.addDays(t, -7), y), w0 = storeStats(sids, L.addDays(t, -14), L.addDays(t, -8));
  const leaders = q(USER_SQL + " WHERE u.active=1 AND u.region_id=? AND r.level IN ('ops_manager','hr_manager','sales_manager','store_manager') ORDER BY r.sort, u.id", req.u.region_id);
  const avg = xs => { const v = xs.filter(x => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  const out = leaders.map(u => {
    const ss = u.level === 'store_manager' ? q('SELECT store_id FROM user_stores WHERE user_id=?', u.id).map(x => x.store_id) : sids;
    const w = leaderWork(u, f30);
    const o = { id: u.id, name: u.name, role_name: u.role_name, level: u.level, stores: ss.map(id => q1('SELECT name FROM stores WHERE id=?', id).name), items: w.items };
    if (u.level === 'store_manager') {
      const st = s30.filter(s => ss.includes(s.id));
      const exec = avg(st.map(s => s.rate));
      const brand = avg(ss.map(id => q1("SELECT score FROM patrols WHERE store_id=? AND status='done' ORDER BY done_at DESC LIMIT 1", id)?.score ?? Math.round(86 + hash('b' + id) * 8)));
      const team = avg(st.map(s => s.pass_rate));
      const biz = avg(ss.map(id => Math.max(0, Math.min(100, Math.round(60 + (bizRange(id, f30, y).mpi - 92) * 1.6)))));
      const total = Math.round((exec ?? 0) * 0.35 + (brand ?? 0) * 0.25 + (team ?? 0) * 0.2 + (biz ?? 0) * 0.2);
      const r1 = avg(w1.filter(s => ss.includes(s.id)).map(s => s.rate)), r0 = avg(w0.filter(s => ss.includes(s.id)).map(s => s.rate));
      Object.assign(o, { dims: { exec, brand, team, biz }, total, trend: [5, 4, 3, 2, 1].map(i => Math.round(total + (hash(i + 'tr' + u.id + 'x') - 0.5) * 10)).concat(total),
        delta7: r1 != null && r0 != null ? r1 - r0 : null, rect_late: st.reduce((a, s) => a + s.rect_late, 0), rect_open: st.reduce((a, s) => a + s.rect_open, 0) });
    }
    return o;
  });
  const sms = out.filter(x => x.level === 'store_manager').sort((a, b) => b.total - a.total);
  sms.forEach((x, i) => { x.rank = i + 1; });
  const alerts = [];
  for (const x of sms) {
    if (x.delta7 != null && x.delta7 <= -3) alerts.push({ level: x.delta7 <= -8 ? 'high' : 'mid', who: x, type: '执行率下滑', text: `近 7 日完成率比前 7 日下降 ${-x.delta7} 个百分点` });
    if (x.rect_late) alerts.push({ level: 'high', who: x, type: '整改逾期', text: `辖店有 ${x.rect_late} 项整改逾期未完成` });
    if (x.total < 80) alerts.push({ level: 'mid', who: x, type: '需重点帮扶', text: `店长综合分 ${x.total}，区域排名第 ${x.rank}` });
  }
  res.json({ people: out, alerts, sm_count: sms.length });
});
app.get('/api/region/biz', (req, res) => {
  if (!isRegion(req.u)) return deny(res);
  const t = L.today(), y = L.addDays(t, -1), days = Number(req.query.days) || 7;
  const from = L.addDays(t, -days), pf = L.addDays(from, -days), pt = L.addDays(from, -1);
  res.json(visibleStores(req.u).map(sid => {
    const c = bizRange(sid, from, y), p = bizRange(sid, pf, pt);
    return { id: sid, name: q1('SELECT name FROM stores WHERE id=?', sid).name, managers: D.storeManagers(sid).map(id => q1('SELECT name FROM users WHERE id=?', id).name),
      revpar: Math.round(c.revpar), occ: Math.round(c.occ * 1000) / 10, adr: Math.round(c.adr), mpi: Math.round(c.mpi * 10) / 10, bad: c.bad, revpar_delta: pct(c.revpar, p.revpar), occ_delta: Math.round((c.occ - p.occ) * 1000) / 10 };
  }));
});
app.post('/api/region/follow', (req, res) => {
  if (req.u.level !== 'region_manager') return deny(res);
  const { store_id, user_id, note } = req.body || {};
  const to = q1(USER_SQL + ' WHERE u.id=?', user_id), st = q1('SELECT name FROM stores WHERE id=?', store_id);
  if (!to || !st || !note) return err(res, '请选择跟进人并填写跟进事项');
  D.notify([to.id], 'focus', `区域经理指派跟进：${st.name}`, note, '#/home?view=store&store=' + store_id);
  D.audit(req.u.id, store_id, '指派跟进', `→${to.name}：${note}`);
  res.json({ ok: true });
});

// ---------- 四板块：门店档案 / 经营 / 证照 / 人 / 加盟商 / 门店画像（实验）/ 周报 / 待我处理（档案、预算、业主数据为模拟） ----------
const AREAS = { 1: ['商务区', '亚朵 · 桔子水晶 · 美居'], 2: ['交通枢纽', '汉庭优佳 · 亚朵 · 智选假日'], 3: ['旅游景区', '维也纳国际 · 亚朵 · 民宿集群'] };
const isFr = sid => q1('SELECT stype FROM stores WHERE id=?', sid)?.stype === '加盟店';
const daysTo = d => Math.round((Date.parse(d) - Date.parse(L.today())) / 864e5);
const canSee = (u, sid) => visibleStores(u).includes(Number(sid));
const clamp = v => Math.max(0, Math.min(100, Math.round(v)));
const sname = sid => q1('SELECT name FROM stores WHERE id=?', sid)?.name || '';
function storeInfo(sid) {
  const s = q1('SELECT * FROM stores WHERE id=?', sid);
  const staff = q1("SELECT COUNT(*) n FROM users u JOIN roles r ON r.id=u.role_id WHERE u.store_id=? AND u.active=1 AND r.level='staff'", sid).n;
  const [area, rivals] = AREAS[sid] || ['商务区', '-'];
  const age = Math.round((Date.parse(L.today()) - Date.parse(s.open_date || L.today())) / 864e5 / 36.5) / 10;
  return { id: sid, name: s.name, brand: s.brand, stype: s.stype, open_date: s.open_date, age, rooms: s.rooms, area, rivals, staff, plan_staff: staff + 1 + Math.floor(hash('ps' + sid) * 3), renovate: age >= 4 ? L.addDays(s.open_date, 1460 + Math.floor(hash('rn' + sid) * 200)) : null,
    managers: D.storeManagers(sid).map(id => q1('SELECT name FROM users WHERE id=?', id).name), owner: isFr(sid) ? OWNERS[sid]?.[0] || '' : null };
}
const LICS = ['营业执照', '特种行业许可证', '卫生许可证', '食品经营许可证', '电梯年检', '锅炉 / 压力容器年检', '消防设施检测'];
function licensesOf(sid) {
  const t = L.today();
  return LICS.map((n, i) => { const exp = L.addDays(t, Math.floor(hash('lic' + sid + i) * 420) - 12); const d = daysTo(exp); return { name: n, expire: exp, days: d, status: d < 0 ? 'bad' : d <= 45 ? 'warn' : 'ok' }; });
}
function storeBiz(sid) {
  const t = L.today(), y = L.addDays(t, -1), rooms = q1('SELECT rooms FROM stores WHERE id=?', sid).rooms || 150;
  const mk = (a, b) => ({ revpar: Math.round(a.revpar), occ: Math.round(a.occ * 1000) / 10, adr: Math.round(a.adr), mpi: Math.round(a.mpi * 10) / 10, bad: a.bad,
    revpar_delta: pct(a.revpar, b.revpar), occ_delta: Math.round((a.occ - b.occ) * 1000) / 10, adr_delta: pct(a.adr, b.adr), mpi_delta: Math.round((a.mpi - b.mpi) * 10) / 10 });
  const day = mk(bizRange(sid, y, y), bizRange(sid, L.addDays(y, -7), L.addDays(y, -7)));
  const week = mk(bizRange(sid, L.addDays(t, -7), y), bizRange(sid, L.addDays(t, -14), L.addDays(t, -8)));
  const month = mk(bizRange(sid, L.addDays(t, -30), y), bizRange(sid, L.addDays(t, -60), L.addDays(t, -31)));
  const ms = t.slice(0, 8) + '01', dim = new Date(Number(t.slice(0, 4)), Number(t.slice(5, 7)), 0).getDate(), el = Number(t.slice(8)) - 1;
  const target_revpar = Math.round((BIZ_BASE[sid] || 350) * 1.04);
  const mtd = el > 0 ? bizRange(sid, ms, y) : { revpar: 0 };
  const w = v => Math.round(v / 1000) / 10;
  const rev_target = w(target_revpar * rooms * dim), rev_mtd = w(mtd.revpar * rooms * el), forecast = el ? Math.round(rev_mtd / el * dim * 10) / 10 : 0;
  const budget = { target_revpar, mtd_revpar: Math.round(mtd.revpar), rev_target, rev_mtd, forecast, days: el, dim, time_pct: Math.round(el * 100 / dim),
    ach: rev_target ? Math.round(rev_mtd * 100 / rev_target) : 0, forecast_pct: rev_target ? Math.round(forecast * 100 / rev_target) : 0 };
  const reviews = [];
  for (let i = 1; i <= 14; i++) { const d = L.addDays(t, -i), b = bizDay(sid, d); if (b.bad) reviews.push({ date: d, n: b.bad, topic: REVIEW_TOPICS[b.topic][0], tip: REVIEW_TOPICS[b.topic][1] }); }
  const score = Math.round((4.86 - month.bad * 0.01 + hash('sc' + sid) * 0.06) * 100) / 100;
  const alerts = [];
  if (week.revpar_delta < -3) alerts.push({ level: week.revpar_delta < -8 ? 'high' : 'mid', type: '经营下滑', text: `近 7 日 RevPAR 较前 7 日 ${sgn(week.revpar_delta)}，${week.occ_delta < 0 ? '以出租率下降为主，建议加强 OTA 曝光和协议客户回访' : '以 ADR 下降为主，建议复盘价格策略和房型结构'}` });
  if (week.mpi < 100) alerts.push({ level: 'mid', type: 'MPI 落后', text: `近 7 日 MPI ${week.mpi}，市场份额落后竞对，建议对标 ${AREAS[sid]?.[1] || '竞对'} 调整价格` });
  if (budget.forecast_pct < 98) alerts.push({ level: budget.forecast_pct < 93 ? 'high' : 'mid', type: '预算风险', text: `按当前节奏，月底预计完成营收预算 ${budget.forecast_pct}%` });
  const tc = {}; reviews.forEach(r => { tc[r.topic] = (tc[r.topic] || 0) + r.n; });
  const top = Object.entries(tc).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 3) alerts.push({ level: 'mid', type: '差评集中', text: `近 14 天「${top[0]}」差评 ${top[1]} 条，建议转整改任务` });
  return { day, week, month, budget, reviews, score, alerts, rooms };
}
const OWNERS = { 2: ['周建平', '上海弘景投资有限公司', '138****6021'], 3: ['林国栋', '杭州西溪文旅置业有限公司', '139****3388'] };
function franchiseOf(sid) {
  const s = q1('SELECT * FROM stores WHERE id=?', sid), t = L.today(), h = k => hash(k + sid);
  const [owner, company, phone] = OWNERS[sid] || ['业主', '-', '-'];
  const start = s.open_date, end = L.addDays(start, 365 * 8 + 2), rooms = s.rooms || 150, base = BIZ_BASE[sid] || 350;
  const fees = monthsBack(6).map((m, i) => {
    const rev = Math.round(base * rooms * 30 / 1000) / 10, fee = Math.round((rev * 0.055 + 0.3) * 10) / 10;
    const status = i === 5 ? '待缴' : i === 4 && (sid === 3 || h('f2') > 0.75) ? '逾期' : '已缴';
    return { ym: m.slice(0, 7), rev, fee, status };
  });
  const arrears = Math.round(fees.filter(f => f.status === '逾期').reduce((a, f) => a + f.fee, 0) * 10) / 10;
  const invest = Math.round(rooms * (9.5 + h('iv') * 2.5)), gop_rate = Math.round((36 + h('gop') * 10) * 10) / 10;
  const years = (Date.parse(t) - Date.parse(start)) / 864e5 / 365;
  const annual_rev = Math.round(base * rooms * 365 / 10000), annual_gop = Math.round(annual_rev * gop_rate / 100);
  const payback = Math.round(annual_gop * 0.72 * years * 100 / invest);
  const sat = Math.round(sid === 3 ? 68 + h('st') * 10 : 82 + h('st') * 12);
  const reports = monthsBack(4).slice(0, 3).reverse().map(m => { const e = L.addDays(L.addDays(m, 32).slice(0, 8) + '01', -1), b = bizRange(sid, m, e);
    return { ym: m.slice(0, 7), revpar: Math.round(b.revpar), occ: Math.round(b.occ * 1000) / 10, adr: Math.round(b.adr), rev: Math.round(b.revpar * rooms * 30 / 1000) / 10, gop_rate: Math.round((gop_rate + (hash('gm' + sid + m) - 0.5) * 4) * 10) / 10 }; });
  const plans = [
    { name: '客房软装焕新（一期 40 间）', budget: Math.round(40 * (2 + h('p1'))) + ' 万', date: L.addDays(t, 45), status: h('p1') > 0.5 ? '待业主确认' : '已立项' },
    { name: '公区智能化升级（自助入住机 + 门锁）', budget: Math.round(18 + h('p2') * 12) + ' 万', date: L.addDays(t, 90), status: '方案沟通中' },
  ];
  if (years > 5) plans.unshift({ name: '全季 4.0 版本升级改造', budget: Math.round(rooms * 3.2) + ' 万', date: L.addDays(t, 150), status: '业主观望' });
  const alerts = [];
  if (daysTo(end) <= 365) alerts.push({ level: daysTo(end) <= 180 ? 'high' : 'mid', type: '合同到期', text: `特许经营合同 ${end} 到期，剩余 ${daysTo(end)} 天，需启动续约沟通` });
  if (arrears) alerts.push({ level: 'high', type: '费用逾期', text: `管理费逾期 ${arrears} 万元` });
  if (sat < 80) alerts.push({ level: 'mid', type: '满意度偏低', text: `业主满意度 ${sat} 分，建议区域经理安排沟通会` });
  if (payback < 60 && years > 3) alerts.push({ level: 'mid', type: '回本偏慢', text: `开业 ${Math.round(years * 10) / 10} 年，累计回本 ${payback}%` });
  return { store_id: sid, store: s.name, owner, company, phone, contract: { start, end, days: daysTo(end), mode: '特许经营 · 委托管理' }, fees, arrears,
    invest, gop_rate, annual_rev, annual_gop, payback, sat, reports, plans, alerts };
}
const REQ_SQL = `SELECT o.*, s.name store, c.name creator, r.name replier FROM owner_reqs o JOIN stores s ON s.id=o.store_id LEFT JOIN users c ON c.id=o.created_by LEFT JOIN users r ON r.id=o.replied_by`;
function seedOwnerReqs() {
  if (q1('SELECT COUNT(*) n FROM owner_reqs').n) return;
  const sm = sid => D.storeManagers(sid)[0], rm = q1("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.level='region_manager'")?.id, t = L.today();
  const ins = (sid, kind, title, body, status, esc_, reply, ago) => run('INSERT INTO owner_reqs(store_id,kind,title,body,status,escalated,created_by,created_at,reply,replied_by,replied_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    sid, kind, title, body, status, esc_, sm(sid), L.addDays(t, -ago) + ' 10:20', reply, reply ? rm : null, reply ? L.addDays(t, -ago + 2) + ' 16:00' : null);
  if (!sm(2) || !sm(3)) return;
  ins(3, '费用', '申请下调管理费比例', '业主认为近半年经营下滑，希望管理费由 5.5% 下调至 4.5%，并要求总部给出经营提升方案。', 'open', 1, null, 3);
  ins(3, '改造', '外立面翻新费用分摊', '外立面翻新预算 46 万，业主希望总部承担 30%。', 'replied', 1, '总部可承担设计费并协调供应商集采价，费用分摊需在续约谈判中一并讨论。', 12);
  ins(2, '经营', '希望增加协议客户资源', '周边园区新进驻两家企业，业主希望区域营销协助对接协议价。', 'open', 0, null, 2);
  ins(2, '人员', '前台人员流动较大', '业主关注近两个月前台离职 2 人，询问招聘和培训支持。', 'closed', 1, '人事经理已安排下周到店招聘，并提供前台标准化培训。', 20);
}
function storePeople(u, sid) {
  const team = canManage(u, sid) ? null : teamOf(u, sid).map(x => x.id);
  const us = q(USER_SQL + " WHERE u.active=1 AND u.store_id=? AND r.level='staff' ORDER BY r.sort, u.id", sid).filter(x => x.id !== u.id && (!team || team.includes(x.id)));
  return us.map(hrSummary);
}
const KEY_ROLES = ['店长', '店助', '前台经理', '客房经理'];
const benchOf = (list, sid) => KEY_ROLES.map(role => {
  const dept = role.slice(0, 2);
  const pool = list.filter(x => x.tier === '可晋升' && x.role_name !== role && (role === '店长' || role === '店助' ? ['店助', '前台经理', '客房经理'].includes(x.role_name) : x.role_name.startsWith(dept)) && (x.store_id === sid || role === '店长'));
  return { role, candidates: pool.slice(0, 3).map(x => ({ id: x.id, name: x.name, role_name: x.role_name, store: x.store })) };
});
const STORE_DIMS = [['biz', '经营业绩', 30], ['brand', '品牌标准', 20], ['ops', '运营执行', 20], ['guest', '宾客口碑', 15], ['team', '团队人才', 10], ['safe', '安全合规', 5]];
const STORE_TYPES = { 标杆店: ['ok', '经营和运营都好，总结经验在区域复制'], 潜力店: ['acc', '运营扎实但经营偏弱，营销经理重点发力'], 隐患店: ['warn', '经营尚可但运营偏弱，盯执行和品牌标准'], 帮扶店: ['bad', '经营和运营都偏弱，列入重点巡店和帮扶'] };
const sgrade = s => (s >= 90 ? 'S' : s >= 85 ? 'A' : s >= 78 ? 'B' : s >= 70 ? 'C' : 'D');
function storeScore(sid) {
  const t = L.today(), y = L.addDays(t, -1), f30 = L.addDays(t, -30);
  const st = storeStats([sid], f30, y)[0], b = bizRange(sid, f30, y);
  const ach = b.revpar * 100 / ((BIZ_BASE[sid] || 350) * 1.04);
  const patrol = q1("SELECT score FROM patrols WHERE store_id=? AND status='done' ORDER BY done_at DESC LIMIT 1", sid)?.score ?? Math.round(86 + hash('b' + sid) * 8);
  const people = q(USER_SQL + " WHERE u.active=1 AND u.store_id=? AND r.level='staff'", sid).map(hrSummary);
  const lic = licensesOf(sid);
  const coach = people.filter(x => x.tier === '需辅导').length, certBad = people.reduce((a, x) => a + x.alerts.filter(z => z.type === '证照到期' && z.level === 'high').length, 0);
  const bench = benchOf(people, sid).filter(r => r.role !== '店长' && !r.candidates.length).length;
  const d = {
    biz: clamp(ach * 0.6 + (60 + (b.mpi - 92) * 1.6) * 0.4),
    brand: clamp(patrol),
    ops: clamp((st.rate ?? 80) * 0.4 + (st.pass_rate ?? 80) * 0.3 + (100 - st.rect_late * 4 - st.rect_open) * 0.3),
    guest: clamp(100 - b.bad * 2.2),
    team: clamp(100 - coach * 100 / Math.max(1, people.length) * 0.8 - certBad * 4 - bench * 6),
    safe: clamp(100 - lic.filter(x => x.status === 'bad').length * 25 - lic.filter(x => x.status === 'warn').length * 8),
  };
  const total = Math.round(STORE_DIMS.reduce((a, [k, , w]) => a + d[k] * w, 0) / 100);
  const bx = Math.round((d.biz + d.guest) / 2), ox = Math.round((d.brand + d.ops) / 2), TH = 82;
  const type = bx >= TH && ox >= TH ? '标杆店' : ox >= TH ? '潜力店' : bx >= TH ? '隐患店' : '帮扶店';
  const why = { biz: `近 30 天 RevPAR 达成 ${Math.round(ach)}%，MPI ${Math.round(b.mpi)}`, brand: `最近一次巡店 ${patrol} 分`, ops: `完成率 ${st.rate ?? '-'}% · 合格率 ${st.pass_rate ?? '-'}% · 整改逾期 ${st.rect_late}`,
    guest: `近 30 天差评 ${b.bad} 条`, team: `需辅导 ${coach} 人 · 证照过期 ${certBad} · 关键岗位无储备 ${bench}`, safe: `证照年检过期 ${lic.filter(x => x.status === 'bad').length} · 临期 ${lic.filter(x => x.status === 'warn').length}` };
  const weak = STORE_DIMS.map(([k, l]) => ({ k, l, v: d[k], why: why[k] })).sort((a, b2) => a.v - b2.v).slice(0, 2);
  const trend = [5, 4, 3, 2, 1].map(i => Math.round(total + (hash(i + 'sg' + sid) - 0.5) * 8)).concat(total).map(v => ({ v, g: sgrade(v) }));
  return { id: sid, name: sname(sid), dims: d, total, grade: sgrade(total), axes: { biz: bx, ops: ox }, type, type_tag: STORE_TYPES[type][0], tactic: STORE_TYPES[type][1], weak, why, trend };
}
const TAG_OPTS = ['新开业', '店长交接期', '店长兼管', '重点帮扶', '改造中', '改造规划', '标杆复制'];
const tagsOf = sid => (q1('SELECT tags FROM stores WHERE id=?', sid)?.tags || '').split(',').filter(Boolean);
const GRADES = 'SABCD';
function renoOf(sid) {
  const i = storeInfo(sid), since = i.renovate || i.open_date;
  const yrs = Math.round((Date.parse(L.today()) - Date.parse(since)) / 864e5 / 36.5) / 10;
  return yrs >= 4 ? { years: yrs, text: `${i.renovate ? '距上次改造' : '开业至今'} ${yrs} 年，建议规划改造${i.owner ? '，并纳入业主沟通事项' : ''}` } : null;
}
const plansOf = sid => q("SELECT p.*, u.name owner FROM store_plans p LEFT JOIN users u ON u.id=p.owner_id WHERE p.store_id=? ORDER BY p.status!='open', p.id DESC", sid).map(p => ({ ...p, updates: JSON.parse(p.updates || '[]') }));
function regionScores(regionId) {
  const all = q('SELECT id FROM stores WHERE region_id=?', regionId).map(s => storeScore(s.id)).sort((a, b) => b.total - a.total);
  const avg = { total: Math.round(all.reduce((a, x) => a + x.total, 0) / (all.length || 1)) };
  STORE_DIMS.forEach(([k]) => { avg[k] = Math.round(all.reduce((a, x) => a + x.dims[k], 0) / (all.length || 1)); });
  all.forEach((x, i) => {
    x.rank = i + 1; x.of = all.length;
    const peers = all.filter(y => y.type === x.type); x.peer_rank = peers.indexOf(x) + 1; x.peers = peers.length;
    x.tags = tagsOf(x.id); x.reno = renoOf(x.id); x.plans = plansOf(x.id);
    const [pv, cur] = x.trend.slice(-2).map(t => t.g);
    x.drop = GRADES.indexOf(cur) > GRADES.indexOf(pv) ? { from: pv, to: cur } : null;
    x.dim_trend = {}; x.declines = [];
    STORE_DIMS.forEach(([k, l]) => {
      const v = x.dims[k], m1 = clamp(v + (hash(k + x.id + 'm1') - 0.42) * 8), m2 = clamp(m1 + (hash(k + x.id + 'm2') - 0.42) * 8);
      x.dim_trend[k] = [m2, m1, v];
      if (m2 > m1 && m1 > v) x.declines.push(l);
    });
  });
  return { all, avg };
}
const regionOfStore = sid => q1('SELECT region_id FROM stores WHERE id=?', sid).region_id;
app.get('/api/store/:sid/profile', (req, res) => {
  const sid = Number(req.params.sid); if (!canSee(req.u, sid) || req.u.level === 'staff') return deny(res);
  const { all, avg } = regionScores(regionOfStore(sid));
  res.json({ info: storeInfo(sid), score: all.find(x => x.id === sid), avg, licenses: licensesOf(sid), dim_def: STORE_DIMS, types: STORE_TYPES, tag_opts: TAG_OPTS });
});
app.get('/api/region/stores', (req, res) => {
  if (!isRegion(req.u)) return deny(res);
  const vs = visibleStores(req.u), { all, avg } = regionScores(req.u.region_id);
  const xs = all.filter(x => vs.includes(x.id)); xs.forEach(x => { x.info = storeInfo(x.id); });
  res.json({ stores: xs, avg, types: STORE_TYPES, dim_def: STORE_DIMS, tag_opts: TAG_OPTS });
});
app.post('/api/store/:sid/tags', (req, res) => {
  const sid = Number(req.params.sid); if (req.u.level !== 'region_manager' || !canSee(req.u, sid)) return deny(res);
  const tags = (req.body.tags || []).filter(t => TAG_OPTS.includes(t));
  run('UPDATE stores SET tags=? WHERE id=?', tags.join(','), sid);
  D.audit(req.u.id, sid, '门店标签', tags.join('、') || '清空');
  res.json({ ok: true });
});
app.post('/api/store-plans', (req, res) => {
  const b = req.body, sid = Number(b.store_id);
  if (req.u.level !== 'region_manager' || !canSee(req.u, sid)) return deny(res);
  const dim = STORE_DIMS.find(d => d[0] === b.dim); if (!dim) return err(res, '请选择提升维度');
  if (!(b.title || '').trim() || !b.owner_id || !b.due) return err(res, '请填写计划内容、负责人和截止日期');
  const base = storeScore(sid).dims[dim[0]];
  const id = Number(run('INSERT INTO store_plans(store_id,dim,title,base,target,owner_id,due,updates,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', sid, dim[0], b.title.trim(), base, Math.min(100, Number(b.target) || base + 8), Number(b.owner_id), b.due, '[]', req.u.id, L.nowStr()).lastInsertRowid);
  D.notify([...new Set([Number(b.owner_id), ...D.storeManagers(sid)])], 'plan', `${sname(sid)} 门店提升计划：${dim[1]}`, `${b.title.trim()}（目标 ${Math.min(100, Number(b.target) || base + 8)} 分，${b.due} 前）`, '#/sp/' + sid);
  D.audit(req.u.id, sid, '制定提升计划', dim[1] + '：' + b.title.trim());
  res.json({ ok: true, id });
});
app.post('/api/store-plans/:id/:op', (req, res) => {
  const p = q1('SELECT * FROM store_plans WHERE id=?', req.params.id); if (!p || !canSee(req.u, p.store_id)) return deny(res);
  const b = req.body;
  if (req.params.op === 'progress' && p.status === 'open' && (canManage(req.u, p.store_id) || p.owner_id === req.u.id)) {
    const pr = Math.max(0, Math.min(100, Number(b.progress) || 0)), ups = JSON.parse(p.updates || '[]');
    ups.push({ at: L.nowStr(), by: req.u.name, progress: pr, note: (b.note || '').trim() });
    run('UPDATE store_plans SET progress=?, updates=? WHERE id=?', pr, JSON.stringify(ups), p.id);
    D.notify(D.regionUsers(req.u.region_id, 'region_manager').filter(x => x !== req.u.id), 'plan', `${sname(p.store_id)} 提升计划进度 ${pr}%`, p.title + (b.note ? '：' + b.note : ''), '#/sp/' + p.store_id);
  } else if (req.params.op === 'close' && p.status === 'open' && req.u.level === 'region_manager') {
    const now = storeScore(p.store_id).dims[p.dim], st = now >= p.target ? 'done' : 'fail';
    run('UPDATE store_plans SET status=?, result=?, closed_at=? WHERE id=?', st, `结项得分 ${now}（起点 ${p.base}，目标 ${p.target}）${b.note ? '；' + b.note : ''}`, L.nowStr(), p.id);
    D.notify(D.storeManagers(p.store_id), 'plan', `提升计划已结项：${st === 'done' ? '达成' : '未达成'}`, p.title, '#/sp/' + p.store_id);
  } else return deny(res);
  res.json({ ok: true });
});
app.get('/api/store/:sid/biz', (req, res) => {
  const sid = Number(req.params.sid); if (!canSee(req.u, sid) || req.u.level === 'staff') return deny(res);
  res.json({ ...storeBiz(sid), info: storeInfo(sid), licenses: licensesOf(sid), reports: q('SELECT r.*, u.name reviewer FROM reports r LEFT JOIN users u ON u.id=r.reviewed_by WHERE r.store_id=? ORDER BY r.id DESC LIMIT 4', sid).map(r => ({ ...r, body: JSON.parse(r.body) })) });
});
app.get('/api/store/:sid/people', (req, res) => {
  const sid = Number(req.params.sid);
  if (!(canManage(req.u, sid) || (req.u.store_id === sid && LEADS[req.u.role_name]))) return deny(res);
  const list = storePeople(req.u, sid);
  res.json({ list, bench: canManage(req.u, sid) ? benchOf(list, sid) : [], suggests: q('SELECT h.*, u.name, u2.name replier FROM hr_suggest h JOIN users u ON u.id=h.user_id LEFT JOIN users u2 ON u2.id=h.replied_by WHERE h.store_id=? ORDER BY h.id DESC LIMIT 8', sid) });
});
const canPeople = (u, m) => canHR(u) || (u.level === 'ops_manager' && m.level === 'store_manager') || (m.store_id && canManage(u, m.store_id)) || leads(u, m.id);
app.post('/api/hr/suggest', (req, res) => {
  const m = q1(USER_SQL + ' WHERE u.id=?', req.body.user_id), { kind, note } = req.body;
  if (!m || !(canManage(req.u, m.store_id) || leads(req.u, m.id))) return deny(res);
  if (!kind || !(note || '').trim()) return err(res, '请选择建议类型并填写理由');
  run('INSERT INTO hr_suggest(user_id,store_id,kind,note,created_by,created_at) VALUES(?,?,?,?,?,?)', m.id, m.store_id, kind, note.trim(), req.u.id, L.nowStr());
  D.notify(D.regionUsers(req.u.region_id, 'hr_manager'), 'hr', `${sname(m.store_id)} ${req.u.name} 提交${kind}建议`, `${m.name}（${m.role_name}）：${note}`, '#/hrp/' + m.id);
  D.audit(req.u.id, m.store_id, '人事建议', `${kind}：${m.name}`);
  res.json({ ok: true });
});
app.post('/api/hr/suggest/:id/reply', (req, res) => {
  const h = q1('SELECT * FROM hr_suggest WHERE id=?', req.params.id);
  if (!h || req.u.level !== 'hr_manager') return deny(res);
  const st = req.body.status === 'rejected' ? 'rejected' : 'approved';
  run('UPDATE hr_suggest SET status=?, reply=?, replied_by=?, replied_at=? WHERE id=?', st, req.body.reply || '', req.u.id, L.nowStr(), h.id);
  const m = q1('SELECT name FROM users WHERE id=?', h.user_id);
  D.notify([h.created_by], 'hr', `人事经理已${st === 'approved' ? '同意' : '退回'}${h.kind}建议：${m.name}`, req.body.reply || '', '#/home?pl=ren');
  res.json({ ok: true });
});
app.get('/api/franchise/:sid', (req, res) => {
  const sid = Number(req.params.sid); if (!canSee(req.u, sid) || ['staff', 'hr_manager', 'ops_manager'].includes(req.u.level)) return deny(res);
  if (!isFr(sid)) return res.json({ na: true, store: sname(sid) });
  seedOwnerReqs();
  res.json({ ...franchiseOf(sid), reqs: q(REQ_SQL + ' WHERE o.store_id=? ORDER BY o.status=\'closed\', o.id DESC', sid) });
});
app.get('/api/region/franchise', (req, res) => {
  if (!['region_manager', 'sales_manager'].includes(req.u.level)) return deny(res);
  seedOwnerReqs();
  const sids = visibleStores(req.u).filter(isFr);
  res.json({ stores: sids.map(sid => { const f = franchiseOf(sid); delete f.reports; return { ...f, managers: D.storeManagers(sid).map(id => q1('SELECT name FROM users WHERE id=?', id).name), open: q1("SELECT COUNT(*) n FROM owner_reqs WHERE store_id=? AND status='open'", sid).n }; }),
    reqs: sids.length ? q(REQ_SQL + ` WHERE o.store_id IN (${sids.map(() => '?').join(',')}) ORDER BY o.status='closed', o.status='replied', o.id DESC`, ...sids) : [] });
});
app.post('/api/owner-reqs', (req, res) => {
  const b = req.body || {}; if (!canManage(req.u, b.store_id) || !isFr(b.store_id)) return deny(res);
  if (!(b.title || '').trim()) return err(res, '请填写诉求');
  const id = Number(run('INSERT INTO owner_reqs(store_id,kind,title,body,escalated,created_by,created_at) VALUES(?,?,?,?,?,?,?)', b.store_id, b.kind || '其他', b.title.trim(), b.body || '', b.escalate ? 1 : 0, req.u.id, L.nowStr()).lastInsertRowid);
  if (b.escalate) D.notify(D.regionUsers(req.u.region_id, 'region_manager'), 'owner', `${sname(b.store_id)} 上报业主诉求`, b.title, '#/home?pl=fr');
  D.audit(req.u.id, b.store_id, '业主诉求', b.title);
  res.json({ ok: true, id });
});
app.post('/api/owner-reqs/:id/:op', (req, res) => {
  const o = q1('SELECT * FROM owner_reqs WHERE id=?', req.params.id), op = req.params.op, b = req.body || {};
  if (!o) return deny(res);
  if (op === 'escalate' && canManage(req.u, o.store_id)) {
    run('UPDATE owner_reqs SET escalated=1 WHERE id=?', o.id);
    D.notify(D.regionUsers(req.u.region_id, 'region_manager'), 'owner', `${sname(o.store_id)} 上报业主诉求`, o.title, '#/home?pl=fr');
  } else if (op === 'reply' && req.u.level === 'region_manager') {
    if (!(b.reply || '').trim()) return err(res, '请填写回复');
    run("UPDATE owner_reqs SET status='replied', reply=?, replied_by=?, replied_at=?, escalated=1 WHERE id=?", b.reply.trim(), req.u.id, L.nowStr(), o.id);
    const sm = D.storeManagers(o.store_id);
    if (b.meeting) {
      const sc = q1('SELECT id FROM scenes ORDER BY id LIMIT 1')?.id || null;
      run(`INSERT INTO flex_tasks(store_id,scene_id,title,standard,assignee_id,recur,recur_val,start_date,end_date,due_time,need_photo,source,created_by,created_at,ref) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        o.store_id, sc, '【业主沟通会】' + o.title, `区域经理安排：${b.reply.trim()}\n会后上传会议纪要照片，并在诉求中更新结果。`, sm[0], 'once', null, b.meeting, b.meeting, '15:00', 1, 'flex', req.u.id, L.nowStr(), null);
      if (b.meeting <= L.today()) D.ensureInstances(L.today(), [o.store_id]);
    }
    D.notify(sm, 'owner', `区域经理已回复业主诉求：${o.title}`, b.reply + (b.meeting ? `（${b.meeting} 召开业主沟通会）` : ''), '#/frs/' + o.store_id);
    D.audit(req.u.id, o.store_id, '回复业主诉求', o.title);
  } else if (op === 'close' && canManage(req.u, o.store_id)) {
    run("UPDATE owner_reqs SET status='closed', closed_at=? WHERE id=?", L.nowStr(), o.id);
    if (o.escalated) D.notify(D.regionUsers(req.u.region_id, 'region_manager'), 'owner', `${sname(o.store_id)} 业主诉求已关闭`, o.title + (b.note ? '：' + b.note : ''), '#/home?pl=fr');
  } else return deny(res);
  res.json({ ok: true });
});
function weekReport(sid) {
  const t = L.today(), y = L.addDays(t, -1), f = L.addDays(t, -7);
  const st = storeStats([sid], f, y)[0], bz = storeBiz(sid), sc = storeScore(sid);
  return { from: f, to: y, rate: st.rate, pass: st.pass_rate, overdue: st.overdue, rect_open: st.rect_open, rect_late: st.rect_late, revpar: bz.week.revpar, revpar_delta: bz.week.revpar_delta,
    occ: bz.week.occ, adr: bz.week.adr, mpi: bz.week.mpi, bad: bz.week.bad, ach: bz.budget.ach, forecast_pct: bz.budget.forecast_pct, grade: sc.grade, total: sc.total,
    risks: [...bz.alerts.map(a => a.text), ...sc.weak.map(w => `${w.l}偏弱：${w.why}`)].slice(0, 4) };
}
app.post('/api/reports', (req, res) => {
  const sid = Number(req.body.store_id); if (req.u.level !== 'store_manager' || !canManage(req.u, sid)) return deny(res);
  const body = { ...weekReport(sid), note: (req.body.note || '').trim() };
  const period = body.from + '~' + body.to, old = q1('SELECT id, status FROM reports WHERE store_id=? AND period=?', sid, period);
  if (old && old.status === 'reviewed') return err(res, '本周周报已批复，不能重复提交');
  const id = old ? (run('UPDATE reports SET body=?, created_by=?, created_at=? WHERE id=?', JSON.stringify(body), req.u.id, L.nowStr(), old.id), old.id)
    : Number(run('INSERT INTO reports(store_id,period,body,created_by,created_at) VALUES(?,?,?,?,?)', sid, period, JSON.stringify(body), req.u.id, L.nowStr()).lastInsertRowid);
  D.notify(D.regionUsers(req.u.region_id, 'region_manager'), 'report', `${sname(sid)} 店长周报已提交`, `完成率 ${body.rate ?? '-'}% · RevPAR ${body.revpar}（${sgn(body.revpar_delta)}）`, '#/report/' + id);
  D.audit(req.u.id, sid, '提交周报', body.from + '~' + body.to);
  res.json({ ok: true, id });
});
app.get('/api/reports/:id', (req, res) => {
  const r = q1('SELECT r.*, s.name store, u.name creator, v.name reviewer FROM reports r JOIN stores s ON s.id=r.store_id LEFT JOIN users u ON u.id=r.created_by LEFT JOIN users v ON v.id=r.reviewed_by WHERE r.id=?', req.params.id);
  if (!r || !canSee(req.u, r.store_id) || req.u.level === 'staff') return deny(res);
  res.json({ ...r, body: JSON.parse(r.body) });
});
app.post('/api/reports/:id/review', (req, res) => {
  const r = q1('SELECT * FROM reports WHERE id=?', req.params.id);
  if (!r || req.u.level !== 'region_manager') return deny(res);
  run("UPDATE reports SET status='reviewed', comment=?, reviewed_by=?, reviewed_at=? WHERE id=?", req.body.comment || '已阅', req.u.id, L.nowStr(), r.id);
  D.notify([r.created_by], 'report', '区域经理已批复周报', req.body.comment || '已阅', '#/report/' + r.id);
  res.json({ ok: true });
});
app.get('/api/inbox', (req, res) => {
  const u = req.u, t = L.today(), hm = L.nowHM(), out = [], add = (tag, lv, title, sub, link, act) => out.push({ tag, lv, title, sub, link, act });
  const sids = visibleStores(u), sid = Number(req.query.store) || sids[0];
  if (u.level === 'staff') {
    const od = q("SELECT id,title,due_time FROM instances WHERE assignee_id=? AND date=? AND status='pending' AND due_time<? ORDER BY due_time", u.id, t, hm);
    od.slice(0, 3).forEach(x => add('超时', 'bad', x.title, `应于 ${x.due_time} 完成`, '#/task/' + x.id));
    q("SELECT task, deadline FROM rectifications WHERE assignee_id=? AND status='open' ORDER BY deadline LIMIT 3", u.id).forEach(x => add('整改', x.deadline < t ? 'bad' : 'warn', x.task, '截止 ' + x.deadline, '#/my-rect'));
    q("SELECT title FROM notifications WHERE user_id=? AND read=0 AND kind IN ('assign','cover') ORDER BY id DESC LIMIT 2", u.id).forEach(x => add('新任务', 'acc', x.title, '', '#/my'));
  }
  if (u.level === 'staff' && LEADS[u.role_name] && u.store_id) {
    const ids = teamOf(u, u.store_id).map(x => x.id);
    if (ids.length) { const n = q1(`SELECT COUNT(*) n FROM instances WHERE date=? AND status='done' AND check_result IS NULL AND assignee_id IN (${ids.map(() => '?').join(',')})`, t, ...ids).n; if (n) add('待点评', 'warn', `下级今日已完成 ${n} 项待点评`, '', '#/must'); }
  }
  if (u.level === 'store_manager' && sid) {
    const fx = q("SELECT i.id, i.title FROM instances i WHERE i.store_id=? AND i.date=? AND i.origin='focus' AND i.status='pending'", sid, t);
    if (fx.length) add('上级安排', 'bad', `重点跟踪今日待落实 ${fx.length} 项`, fx[0].title, '#/upper');
    const ck = q1("SELECT COUNT(*) n FROM instances WHERE store_id=? AND date=? AND status='done' AND check_result IS NULL", sid, t).n;
    if (ck) add('待点评', 'warn', `今日已完成 ${ck} 项待点评`, '', '#/must');
    const rv = q1("SELECT COUNT(*) n FROM rectifications WHERE store_id=? AND status='submitted'", sid).n;
    if (rv) add('待复查', 'warn', `整改已提交待复查 ${rv} 项`, '', '#/rect');
    q("SELECT * FROM patrols WHERE store_id=? AND status='planned' ORDER BY planned_date LIMIT 1", sid).forEach(p => add('巡店', 'acc', `区域经理 ${p.planned_date} 巡店`, p.reason || '例行巡店', '#/patrol/' + p.id));
    licensesOf(sid).filter(x => x.status !== 'ok').slice(0, 2).forEach(x => add('证照', x.status, `${x.name}${x.days < 0 ? '已过期' : x.days + ' 天后到期'}`, '到期日 ' + x.expire, '#/home?pl=biz&store=' + sid));
    if (isFr(sid)) { seedOwnerReqs(); q("SELECT * FROM owner_reqs WHERE store_id=? AND status='replied'", sid).forEach(o => add('区域回复', 'acc', o.title, '区域经理已回复，确认后关闭', '#/frs/' + sid)); }
    q("SELECT h.*, m.name FROM hr_suggest h JOIN users m ON m.id=h.user_id WHERE h.store_id=? AND h.status!='open' AND h.replied_at>=?", sid, L.addDays(t, -7) + ' 00:00').forEach(h => add('人事回复', h.status === 'approved' ? 'ok' : 'warn', `${h.name} ${h.kind}建议${h.status === 'approved' ? '已同意' : '被退回'}`, h.reply || '', '#/home?pl=ren&store=' + sid));
    q("SELECT * FROM reports WHERE store_id=? AND status='reviewed' AND reviewed_at>=?", sid, L.addDays(t, -7) + ' 00:00').forEach(r => add('周报批复', 'ok', `周报 ${r.period} 已批复`, r.comment, '#/report/' + r.id));
    const lw = q1('SELECT MAX(created_at) at FROM reports WHERE store_id=?', sid).at;
    if (!lw || lw < L.addDays(t, -6)) add('周报', 'acc', '本周周报未提交', '系统已汇总好数据，一键提交区域经理', '#/home?pl=biz&store=' + sid, 'report');
  }
  if (u.level === 'region_manager') {
    seedOwnerReqs();
    q(REQ_SQL + " WHERE o.escalated=1 AND o.status='open' ORDER BY o.id DESC").forEach(o => add('业主诉求', 'bad', `${o.store}：${o.title}`, (o.body || '').slice(0, 40), '#/home?pl=fr', 'req:' + o.id));
    q("SELECT r.*, s.name store FROM reports r JOIN stores s ON s.id=r.store_id WHERE r.status='submitted' ORDER BY r.id DESC").forEach(r => add('周报', 'warn', `${r.store} 店长周报待批复`, r.period, '#/report/' + r.id));
    q("SELECT p.*, s.name store FROM patrols p JOIN stores s ON s.id=p.store_id WHERE p.status='planned' AND p.planned_date<=? ORDER BY p.planned_date", L.addDays(t, 2)).forEach(p => add('巡店', 'acc', `${p.planned_date} 巡店 ${p.store}`, p.reason || '', '#/patrol/' + p.id));
    sids.filter(isFr).forEach(s => franchiseOf(s).alerts.filter(a => a.level === 'high').forEach(a => add(a.type, 'bad', `${sname(s)}：${a.text}`, '', '#/home?pl=fr')));
  }
  if (u.level === 'ops_manager') {
    q("SELECT r.task, r.deadline, s.name store FROM rectifications r JOIN stores s ON s.id=r.store_id WHERE r.status='open' AND r.deadline<? ORDER BY r.deadline LIMIT 4", t).forEach(r => add('整改逾期', 'bad', `${r.store}：${r.task}`, '截止 ' + r.deadline, '#/rect?st=late'));
    q("SELECT title, body FROM notifications WHERE user_id=? AND kind='focus' AND read=0 ORDER BY id DESC LIMIT 3", u.id).forEach(n => add('指派跟进', 'warn', n.title, n.body, '#/notices'));
  }
  if (u.level === 'sales_manager') {
    sids.forEach(s => storeBiz(s).alerts.filter(a => a.type !== '差评集中').slice(0, 1).forEach(a => add(a.type, a.level === 'high' ? 'bad' : 'warn', `${sname(s)}：${a.text}`, '', '#/home?pl=biz')));
    q("SELECT title, body FROM notifications WHERE user_id=? AND kind='focus' AND read=0 ORDER BY id DESC LIMIT 3", u.id).forEach(n => add('指派跟进', 'warn', n.title, n.body, '#/notices'));
  }
  if (u.level === 'hr_manager') {
    const hi = q(USER_SQL + " WHERE u.active=1 AND u.region_id=? AND r.level IN ('staff','store_manager')", u.region_id).map(hrSummary).filter(x => x.alerts.some(a => a.level === 'high'));
    if (hi.length) add('人员预警', 'bad', `${hi.length} 人有高风险预警`, hi.slice(0, 3).map(x => x.name).join('、'), '#/home?pl=ren');
    q("SELECT h.*, m.name, m2.name creator, s.name store FROM hr_suggest h JOIN users m ON m.id=h.user_id JOIN users m2 ON m2.id=h.created_by LEFT JOIN stores s ON s.id=h.store_id WHERE h.status='open' ORDER BY h.id DESC").forEach(h => add(h.kind + '建议', 'warn', `${h.store} ${h.name}`, `${h.creator}：${h.note}`, '#/hrp/' + h.user_id, 'sugg:' + h.id));
    q("SELECT title, body FROM notifications WHERE user_id=? AND kind='focus' AND read=0 ORDER BY id DESC LIMIT 3", u.id).forEach(n => add('指派跟进', 'warn', n.title, n.body, '#/notices'));
  }
  if (u.level === 'store_manager' && sid) {
    const sc = regionScores(regionOfStore(sid)).all.find(x => x.id === sid);
    sc.plans.filter(p => p.status === 'open').forEach(p => add('提升计划', p.due < t ? 'bad' : 'warn', p.title, `目标 ${p.target} 分 · ${p.due} 截止 · 进度 ${p.progress}%`, '#/home?pl=shop&store=' + sid));
    if (sc.drop) add('等级下降', 'bad', `门店画像 ${sc.drop.from} → ${sc.drop.to}`, '短板：' + sc.weak.map(w => w.l).join('、'), '#/home?pl=shop&store=' + sid);
  }
  if (u.level === 'region_manager') {
    regionScores(u.region_id).all.forEach(x => {
      if (x.drop) add('等级下降', 'bad', `${x.name}：门店画像 ${x.drop.from} → ${x.drop.to}`, '短板：' + x.weak.map(w => w.l).join('、'), '#/sp/' + x.id);
      if (x.declines.length) add('连续下滑', 'warn', `${x.name}：${x.declines.join('、')} 连续 2 个月下滑`, '', '#/sp/' + x.id);
      x.plans.filter(p => p.status === 'open' && p.due <= L.addDays(t, 3)).forEach(p => add('提升计划', p.due < t ? 'bad' : 'warn', `${x.name}：${p.title}`, `${p.due} ${p.due < t ? '已到期，待结项' : '即将到期'} · 进度 ${p.progress}%`, '#/sp/' + x.id));
      if (x.reno) add('改造提醒', 'acc', `${x.name}：${x.reno.text}`, '', '#/sp/' + x.id);
    });
  }
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
