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
const LEVEL_LABEL = { region_manager: '区域经理', ops_manager: '运营经理', sales_manager: '营销经理', hr_manager: '人事经理', dev_manager: '开发经理', build_manager: '项目经理', train_manager: '培训经理', coach: '教练', hq: '总部运营', store_manager: '店长', staff: '员工' };

app.get('/api/users', (req, res) => {
  const users = q(USER_SQL + ' WHERE u.active=1 ORDER BY r.sort, u.store_id, u.id');
  const stores = q('SELECT * FROM stores');
  const us = q('SELECT * FROM user_stores'), rg = Object.fromEntries(q('SELECT id, name FROM regions').map(r => [r.id, r.name]));
  res.json(users.map(u => ({ id: u.id, name: u.name, role_name: u.role_name, level: u.level,
    stores: u.level === 'store_manager' ? us.filter(x => x.user_id === u.id).map(x => stores.find(s => s.id === x.store_id)?.name)
      : u.store_id ? [stores.find(s => s.id === u.store_id)?.name] : [rg[u.region_id] || ''], reserve: u.reserve || null })));
});

const tooLong = v => typeof v === 'string' ? !v.startsWith('data:image/') && v.length > 5000 : v && typeof v === 'object' ? Object.values(v).some(tooLong) : false;
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET') { memoReset(); D.shiftReset(); }
  if (req.method !== 'GET' && tooLong(req.body)) return res.status(400).json({ error: '内容过长，请精简到 5000 字以内' });
  const id = Number(req.get('x-user-id'));
  const u = id && q1(USER_SQL + ' WHERE u.id=? AND u.active=1', id);
  if (!u) return res.status(401).json({ error: '请选择身份' });
  if (u.level === 'hq' && u.view_region) { u.home_region = u.region_id; u.region_id = u.view_region; }
  req.u = u;
  next();
});

const DA_CATS = [['biz', '经营数据', '营收、利润、预算与门店经营报表'], ['pay', '薪酬绩效', '他人的工资、绩效单、奖金与申诉'], ['hr', '人事档案', '他人的个人档案、执行分明细、晋升路径、门店人员名单'], ['hrm', '人事指标', '编制、满编率、离职率、招聘、离职成本'], ['care', '员工关怀与帮扶', '关怀记录、困难帮扶、福利台账、员工声音'], ['risk', '离职预警', '离职风险名单与原因'], ['diag', '店长诊断与上手', '店长能力诊断、90 天上手进度'], ['mentor', '带教统计', '他人的带教记录与统计'], ['pii', '联系方式', '他人的手机号等个人联系方式，未授权时打码显示']];
const DA_ROLES = [['region_manager', '区域经理'], ['ops_manager', '运营经理'], ['sales_manager', '营销经理'], ['hr_manager', '人事经理'], ['dev_manager', '开发经理'], ['build_manager', '项目经理'], ['train_manager', '培训经理'], ['coach', '教练'], ['reserve_rm', '储备区域经理'], ['hq', '总部运营'], ['store_manager', '店长'], ['assistant', '店助'], ['lead', '主管（前台经理、客房经理）'], ['staff', '员工']];
const DA_DEF = { region_manager: ['biz', 'pay', 'hr', 'hrm', 'care', 'risk', 'diag', 'mentor', 'pii'], ops_manager: ['biz', 'hr', 'hrm', 'care', 'risk'], sales_manager: ['biz', 'hrm'], hr_manager: ['pay', 'hr', 'hrm', 'care', 'risk', 'diag', 'mentor', 'pii'], dev_manager: ['hrm'], build_manager: ['hrm'], train_manager: ['hr', 'diag', 'mentor'], coach: ['pay', 'biz', 'hr', 'hrm', 'care', 'risk', 'diag', 'mentor'], reserve_rm: ['biz', 'hrm', 'care', 'risk', 'diag', 'mentor'], hq: ['biz', 'hrm', 'care', 'diag'], store_manager: ['biz', 'pay', 'hr', 'hrm', 'care', 'risk', 'mentor', 'pii'], assistant: ['biz', 'hr', 'mentor', 'pii', 'care'], lead: ['hr', 'mentor'], staff: [] };
let DA_CACHE = null;
const daAuth = () => DA_CACHE || (DA_CACHE = { ...DA_DEF, ...D.getSetting('data_auth', {}) });
{ const s0 = D.getSetting('data_auth', null); if (s0 && s0.coach && !D.getSetting('da_mig_coach_pay', 0)) { if (!s0.coach.includes('pay')) s0.coach.push('pay'); D.setSetting('data_auth', s0); D.setSetting('da_mig_coach_pay', 1); } }
{ const s0 = D.getSetting('data_auth', null); if (s0 && s0.assistant && !D.getSetting('da_mig_assist_care', 0)) { if (!s0.assistant.includes('care')) s0.assistant.push('care'); D.setSetting('data_auth', s0); D.setSetting('da_mig_assist_care', 1); } }
const daKey = u => u.reserve === 'rm' ? 'reserve_rm' : u.level !== 'staff' ? u.level : u.role_name === '店助' ? 'assistant' : LEADS[u.role_name] ? 'lead' : 'staff';
const daCan = (u, k) => (daAuth()[daKey(u)] || []).includes(k);
const DA_ROUTES = [[/^\/(region\/biz|store\/\d+\/biz)(\/|$)/, 'biz'], [/^\/pay\/(\d+)$/, 'pay', 1], [/^\/pay-board$/, 'pay'], [/^\/(hr\/people|region\/people|store\/\d+\/people)$/, 'hr'], [/^\/(hr\/person|person|exec|career)\/(\d+)$/, 'hr', 2],
  [/^\/hrm$/, 'hrm'], [/^\/care$/, 'care'], [/^\/(diag|onboard)\/(\d+)$/, 'diag', 2], [/^\/mentor-stats\/(\d+)$/, 'mentor', 1]];
const maskPhone = v => typeof v === 'string' && v.length > 6 ? v.slice(0, 3) + '****' + v.slice(-4) : v;
app.use('/api', (req, res, next) => {
  const pii = daCan(req.u, 'pii'), pay = daCan(req.u, 'pay');
  if (pii && pay) return next();
  const uid = req.u.id;
  res.json = body => res.type('json').send(JSON.stringify(body, function (k, v) {
    if (!pii && k === 'phone' && this.id !== uid && v !== req.u.phone) return maskPhone(v);
    if (!pay && k === 'comm') { const o = this.id ?? this.me?.id; if (o != null && o !== uid) return undefined; }
    return v;
  }));
  next();
});
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET') return next();
  for (const [re, k, gi] of DA_ROUTES) {
    const m = req.path.match(re); if (!m) continue;
    if ((gi && Number(m[gi]) === req.u.id) || daCan(req.u, k)) return next();
    return res.status(403).json({ error: '未获授权查看此类数据，可请区域经理在「数据授权」中开通', da: k });
  }
  next();
});

const isRegion = u => ['region_manager', 'ops_manager', 'sales_manager', 'hr_manager', 'dev_manager', 'build_manager', 'train_manager', 'coach', 'hq'].includes(u.level);
function visibleStores(u) {
  if (isRegion(u)) return q('SELECT id FROM stores WHERE region_id=?', u.region_id).map(s => s.id);
  if (u.level === 'store_manager') return q('SELECT store_id FROM user_stores WHERE user_id=?', u.id).map(s => s.store_id);
  if (u.reserve === 'sm_off') return q("SELECT DISTINCT store_id FROM rsv_tasks WHERE user_id=? AND store_id IS NOT NULL AND status='open'", u.id).map(s => s.store_id);
  return u.store_id ? [u.store_id] : [];
}
const canManage = (u, sid) => (rmLike(u) || u.level === 'store_manager') && visibleStores(u).includes(Number(sid));
const catFilter = u => (u.level === 'sales_manager' ? 'sales' : u.level === 'ops_manager' ? 'ops' : null);
const inStore = (x, sid) => x.store_id === Number(sid) || D.storeManagers(Number(sid)).includes(x.id);
const MEMO = new Map(); let memoAt = 0;
const memoReset = () => { MEMO.clear(); memoAt = Date.now(); };
const memo = (name, fn) => (...a) => {
  if (Date.now() - memoAt > 30000) memoReset();
  const k = name + JSON.stringify(a);
  if (!MEMO.has(k)) MEMO.set(k, fn(...a));
  return structuredClone(MEMO.get(k));
};
function deny(res, msg) { res.status(403).json({ error: msg || '无权限' }); }
function err(res, msg) { res.status(400).json({ error: msg }); }
const STAFF_ALL = ['前台经理', '前台高级', '前台中级', '前台初级', '客房经理', '客房高级', '客房中级', '客房初级', '餐厅厨师', '餐厅服务员', '工程', 'PA', '保安'];
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
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/);
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64'), h = buf.subarray(0, 4).toString('hex');
  if (!(h.startsWith('89504e47') || h.startsWith('ffd8ff') || h.startsWith('52494646') || h.startsWith('47494638'))) return null;
  const name = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + (m[1] === 'png' ? 'png' : 'jpg');
  fs.writeFileSync(path.join(D.DATA_DIR, 'uploads', name), buf);
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
  return rows.map(r => ({ ...r, pillar: r.tpillar || pillarOf(r), overdue: r.status === 'missed' || r.status === 'pending' && (r.date < t || (r.date === t && r.due_time < hm)),
    covered: !r.deleg_id && r.orig_assignee_id && r.assignee_id !== r.orig_assignee_id }));
}

// ---------- me / meta ----------
app.post('/api/me/region', (req, res) => {
  const u = req.u, rid = Number((req.body || {}).region_id), r = q1('SELECT * FROM regions WHERE id=?', rid);
  if (u.level !== 'hq') return deny(res, '只有总部和省区可以切换区域');
  if (!r) return err(res, '区域不存在');
  run('UPDATE users SET view_region=? WHERE id=?', rid === (u.home_region ?? u.region_id) ? null : rid, u.id); D.audit(u.id, null, '切换查看区域', r.name); res.json({ ok: true });
});
app.get('/api/me', (req, res) => {
  const u = req.u;
  const rg = q1('SELECT r.name, p.name pname FROM regions r LEFT JOIN provinces p ON p.id=r.province_id WHERE r.id=?', u.region_id);
  const unread = q1('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read=0', u.id).n;
  res.json({ ...u, region_name: rg?.name, province_name: rg?.pname, level_label: LEVEL_LABEL[u.level], stores: visibleStores(u), unread, today: L.today(), now: L.nowHM(),
    can: { manage: ['region_manager', 'coach', 'store_manager'].includes(u.level), region: isRegion(u), patrol: rmLike(u), settings: u.level === 'region_manager' },
    category: catFilter(u), data_auth: daAuth()[daKey(u)] || [], da_admin: ['region_manager', 'hq'].includes(u.level), team: u.store_id ? teamOf(u, u.store_id).map(x => x.id) : [], lead: !!LEADS[u.role_name], shift: myShift(u) });
});
app.get('/api/data-auth', (req, res) => {
  if (!['region_manager', 'hq', 'hr_manager'].includes(req.u.level)) return deny(res);
  res.json({ cats: DA_CATS, roles: DA_ROLES, auth: daAuth(), def: DA_DEF, edit: ['region_manager', 'hq'].includes(req.u.level) });
});
app.post('/api/data-auth', (req, res) => {
  const u = req.u; if (!['region_manager', 'hq'].includes(u.level)) return deny(res);
  if (req.body.reset) { D.setSetting('data_auth', {}); DA_CACHE = null; D.audit(u.id, null, '数据授权', '恢复默认'); return res.json({ ok: true }); }
  const src = req.body.auth || {}, ks = DA_CATS.map(c => c[0]), o = {};
  for (const [rk] of DA_ROLES) o[rk] = Array.isArray(src[rk]) ? ks.filter(k => src[rk].includes(k)) : daAuth()[rk];
  if (!o.region_manager.length && !o.hq.length) return err(res, '区域经理和总部不能同时没有任何授权');
  const diff = DA_ROLES.filter(([rk]) => JSON.stringify(o[rk]) !== JSON.stringify(daAuth()[rk])).map(([, l]) => l);
  D.setSetting('data_auth', o); DA_CACHE = null; D.audit(u.id, null, '数据授权', diff.length ? '调整：' + diff.join('、') : '无变化');
  res.json({ ok: true });
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
  if (it.status === 'missed' || (it.status === 'pending' && it.date < L.today())) return err(res, '该任务已逾期未完成，不能补做');
  if (it.status === 'done') return err(res, '任务已完成');
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
  if (it.status !== 'done' || it.date < L.today()) return err(res, '只能撤回今天已完成的任务');
  run("UPDATE instances SET status='pending', done_at=NULL WHERE id=?", it.id);
  D.audit(req.u.id, it.store_id, '撤回完成', it.title);
  res.json({ ok: true });
});
app.post('/api/instances/:id/reassign', (req, res) => {
  const it = q1('SELECT * FROM instances WHERE id=?', req.params.id);
  if (!it || !canManage(req.u, it.store_id)) return deny(res);
  const to = q1('SELECT * FROM users WHERE id=? AND active=1', req.body.user_id);
  if (!to || !inStore(to, it.store_id)) return err(res, '请选择本店在职人员');
  run('UPDATE instances SET assignee_id=? WHERE id=?', to.id, it.id);
  D.notify([to.id], 'assign', '新增临时任务', `${it.date} ${it.due_time} ${it.title}`, '#/my');
  D.audit(req.u.id, it.store_id, '临时改派', `${it.title} → ${to.name}`);
  res.json({ ok: true });
});
app.post('/api/instances/:id/check', (req, res) => {
  const it = q1('SELECT * FROM instances WHERE id=?', req.params.id);
  if (!it || (!apprOk(req.u, it.store_id) && !leads(req.u, it.assignee_id))) return deny(res, '只有店长、区域经理或直属上级可以点评');
  const { result, comment, rectify } = req.body;
  if (it.status !== 'done') return err(res, '任务还未完成，不能抽查');
  if (it.check_result) return err(res, '该任务已抽查过');
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
  if (!u || (!apprOk(req.u, u.store_id) && !leads(req.u, u.id))) return deny(res);
  if (!date) return err(res, '请选择日期');
  if (cover_user_id) { const cu = q1('SELECT * FROM users WHERE id=? AND active=1', cover_user_id); if (!cu || cu.id === u.id || !inStore(cu, u.store_id)) return err(res, '顶岗人需为本店其他在职人员'); }
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
  if (source === 'focus' && !rmLike(req.u)) return deny(res, '重点跟踪任务由区域经理或教练创建');
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
  if (f.source === 'focus' && !rmLike(req.u) && req.body.active === 0) return deny(res, '重点跟踪任务只能由区域经理或教练关闭');
  if (req.body.active !== undefined) run('UPDATE flex_tasks SET active=? WHERE id=?', req.body.active ? 1 : 0, f.id);
  if (req.body.assignee_id) { run('UPDATE flex_tasks SET assignee_id=? WHERE id=?', req.body.assignee_id, f.id); D.refreshPending(f.store_id); }
  if (req.body.active === 0) run("DELETE FROM instances WHERE src='flex' AND src_id=? AND date>=? AND status='pending'", f.id, L.today());
  D.audit(req.u.id, f.store_id, req.body.active === 0 ? '停用任务' : '修改任务', f.title);
  res.json({ ok: true });
});

// ---------- rectifications ----------
const RECT_SQL = `SELECT r.*, COALESCE(i.title, r.title) title, i.date inst_date, i.scene_id, s.name scene_name, st.name store_name, u.name assignee_name, c.name creator_name, v.name verifier_name
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
  if (!['open', 'rejected'].includes(r.status)) return err(res, r.status === 'closed' ? '整改已闭环' : '整改已提交，等待复查');
  if (!(req.body.note || '').trim()) return err(res, '请说明整改情况');
  run("UPDATE rectifications SET status='submitted', submit_note=?, submit_photo=?, submitted_at=? WHERE id=?", req.body.note, savePhoto(req.body.photo) || r.submit_photo, L.nowStr(), r.id);
  D.notify([r.created_by, ...D.storeManagers(r.store_id)], 'rectify', '整改已提交，待复查', req.body.note, '#/rect');
  D.audit(req.u.id, r.store_id, '提交整改', req.body.note);
  res.json({ ok: true });
});
app.post('/api/rectifications/:id/verify', (req, res) => {
  const r = q1('SELECT * FROM rectifications WHERE id=?', req.params.id);
  if (!r || !apprOk(req.u, r.store_id)) return deny(res);
  if (r.status !== 'submitted') return err(res, r.status === 'closed' ? '整改已闭环' : '整改还未提交，不能复查');
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

const PAGG = new Map();
function pagg(from, to) {
  const k = from + to;
  let e = PAGG.get(k);
  if (!e || Date.now() - e.at > (to < L.today() ? 600000 : 30000)) {
    const m = new Map();
    for (const r of q(`SELECT assignee_id uid, COUNT(*) total, SUM(status='done') done,
      SUM(status='done' AND (substr(COALESCE(done_at,''),1,10)<date OR (substr(COALESCE(done_at,''),1,10)=date AND substr(done_at,12,5)<=due_time))) ot,
      SUM(COALESCE(check_result,'')!='') ck, SUM(check_result='good') good, SUM(check_result='bad') bad FROM instances WHERE date BETWEEN ? AND ? GROUP BY assignee_id`, from, to)) m.set(r.uid, r);
    const tr = new Map(q("SELECT assignee_id uid, COUNT(*) n FROM rectifications WHERE created_at>=? AND training!='' GROUP BY assignee_id", from).map(r => [r.uid, r.n]));
    if (PAGG.size > 50) PAGG.clear();
    PAGG.set(k, e = { at: Date.now(), m, tr });
  }
}
function pstatsLite(uid, from, to) {
  const k = from + to; pagg(from, to); const e = PAGG.get(k), r = e.m.get(uid) || { total: 0, done: 0, ot: 0, ck: 0, good: 0, bad: 0 };
  const P = (a, b) => (b ? Math.round(a * 100 / b) : null);
  return { total: r.total, done: r.done, rate: P(r.done, r.total), ontime: P(r.ot, r.done), pass: P(r.good, r.ck), good: r.good, bad: r.bad, training: e.tr.get(uid) || 0 };
}
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
    rects: q('SELECT r.*, COALESCE(i.title, r.title) title FROM rectifications r LEFT JOIN instances i ON i.id=r.instance_id WHERE r.assignee_id=? ORDER BY r.id DESC LIMIT 6', m.id) });
});
app.get('/api/must', (req, res) => {
  const sc = homeScope(req, res); if (!sc) return;
  const t = L.today(), y = L.addDays(t, -1);
  const mgr = apprOk(req.u, sc.sid), ids = new Set(teamOf(req.u, sc.sid).map(x => x.id));
  const mine = r => mgr || ids.has(r.assignee_id);
  const T = decorate(q(INST_SQL + ' WHERE i.store_id=? AND i.date=?', sc.sid, t)).filter(r => mine(r) || r.assignee_id === req.u.id);
  const out = [], seen = new Set();
  const push = (kind, reason, r) => { if (!seen.has(r.id)) { seen.add(r.id); out.push({ kind, reason, t: r }); } };
  T.filter(r => r.assignee_id === req.u.id && r.status !== 'done').forEach(r => push('self', '我亲做', r));
  T.filter(r => r.origin === 'focus' && r.assignee_id !== req.u.id).forEach(r => push('focus', '上级重点跟踪', r));
  const zs = T.filter(r => r.tag === '清零项' && r.status !== 'done' && !seen.has(r.id)).sort((a, b) => (a.due_time || '').localeCompare(b.due_time || ''));
  if (mgr && zs.length > 1) { push('zero', `清零项未完成 ${zs.length} 项，系统已提醒执行人和主管；最早 ${zs[0].due_time || '今日'} 到期`, zs[0]); out[out.length - 1].n = zs.length; }
  else zs.forEach(r => push('zero', '清零项：当日必须完成', r));
  if (mgr) T.filter(r => r.deleg_review && r.status === 'done' && !r.check_result).forEach(r => push('review', '授权任务：待复核', r));
  T.filter(r => r.m === 'M2' && r.status === 'done' && !r.check_result).forEach(r => push('review', 'M2：待复查', r));
  const yb = q("SELECT src, src_id FROM instances WHERE store_id=? AND date=? AND check_result='bad'", sc.sid, y);
  T.filter(r => yb.some(b => b.src === r.src && b.src_id === r.src_id)).forEach(r => push('again', '昨日点评不合格，今日复看', r));
  T.filter(r => r.overdue && r.status !== 'done').slice(0, 6).forEach(r => push('late', '已超时，跟进原因', r));
  if (mgr) riskSample(T.filter(r => r.status === 'done' && !r.check_result && r.assignee_id !== req.u.id && !seen.has(r.id)), yb, t).forEach(([r, why]) => push('spot', '风险抽查：' + why, r));
  else T.filter(r => r.m === 'M3' && r.status === 'done' && !r.check_result).sort((a, b) => hash(t + a.id) - hash(t + b.id)).slice(0, 3).forEach(r => push('spot', 'M3：随机抽查', r));
  res.json(out);
});
app.get('/api/upper', (req, res) => {
  const sc = homeScope(req, res); if (!sc) return;
  const t = L.today();
  const focus = q(`SELECT f.*, u.name assignee_name, c.name creator FROM flex_tasks f LEFT JOIN users u ON u.id=f.assignee_id LEFT JOIN users c ON c.id=f.created_by
    WHERE f.store_id=? AND f.source='focus' AND (f.end_date IS NULL OR f.end_date>=?) ORDER BY f.id DESC`, sc.sid, t)
    .map(f => ({ ...f, today: q1("SELECT id, status FROM instances WHERE src='flex' AND src_id=? AND date=?", f.id, t) || null,
      rate: q1("SELECT ROUND(AVG(status='done')*100) r FROM instances WHERE src='flex' AND src_id=? AND date<?", f.id, t).r }));
  const rects = q(`SELECT r.*, u.name assignee_name, c.name creator, cr.name creator_role, COALESCE(i.title, r.title) title FROM rectifications r JOIN users c ON c.id=r.created_by JOIN roles cr ON cr.id=c.role_id
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
  const rows = q(`SELECT i.date, COUNT(*) total, SUM(i.status='done') done FROM instances i WHERE i.date BETWEEN ? AND ?${sc.w} GROUP BY i.date`, req.query.from || L.addDays(t, -60), req.query.to || t, ...sc.p);
  res.json(Object.fromEntries(rows.filter(r => r.date <= t).map(r => [r.date, Math.round((r.done || 0) * 100 / r.total)])));
});

app.get('/api/profile', (req, res) => {
  const sc = homeScope(req, res); if (!sc) return;
  const u = req.u, t = L.today(), y = L.addDays(t, -1);
  const week = req.query.mode === 'week';
  const ms = (t.endsWith('-01') ? y : t).slice(0, 8) + '01';
  const from = week ? L.addDays(t, -7) : ms, to = y;
  const store = q1('SELECT * FROM stores WHERE id=?', sc.sid);
  const patrol = q1("SELECT score, done_at FROM patrols WHERE store_id=? AND status='done' AND COALESCE(kind,'patrol')='patrol' ORDER BY done_at DESC LIMIT 1", sc.sid);
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
  const occ = rampFactor(sid, d) * Math.min(0.97, 0.7 + hash(sid + 'o' + d) * 0.22) * (wk > 1 ? 1.04 : 1);
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
  const rects = q(`SELECT r.*, COALESCE(i.title, r.title) title FROM rectifications r LEFT JOIN instances i ON i.id=r.instance_id WHERE r.store_id=? AND r.status!='closed'${rw}${sc.cat ? ' AND i.category=?' : ''}`, sc.sid, ...rp, ...(sc.cat ? [sc.cat] : []));
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
    AND ((i.status IN ('pending','missed') AND i.date<?) OR i.check_result='bad')${sc.w}`, from, to, t, ...sc.p);
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
function storeStats0(sids, from, to, cat) {
  const t = L.today(), hm = L.nowHM();
  return sids.map(sid => {
    const p = [sid, from, to];
    let c = '';
    if (cat) { c = ' AND category=?'; p.push(cat); }
    const s = q1(`SELECT COUNT(*) total, SUM(status='done') done, SUM(status='missed' OR (status='pending' AND (date<? OR (date=? AND due_time<?)))) overdue,
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
      FROM instances i LEFT JOIN scenes s ON s.id=i.scene_id WHERE i.store_id=? AND i.status IN ('pending','missed') AND i.date BETWEEN ? AND ? ${cat ? 'AND i.category=?' : ''} GROUP BY i.src, i.src_id HAVING n>=2 ORDER BY n DESC LIMIT 5`,
      from, L.addDays(t, -1), s.id, from, L.addDays(t, -1), ...(cat ? [cat] : []));
    for (const m of miss) issues.push({ level: m.n >= 3 ? 'high' : 'mid', type: '任务漏做', text: `「${m.title}」近 7 日漏做 ${m.n}/${m.total} 次`, scene: m.scene, scene_id: m.scene_id, title: m.title });
    const lastPatrol = q1("SELECT * FROM patrols WHERE store_id=? AND status='done' AND COALESCE(kind,'patrol')='patrol' ORDER BY done_at DESC LIMIT 1", s.id);
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
  return { hire, tenure: Math.round(days / 36.5) / 10, probation_end, in_probation: probation_end >= t, edu: EDU[Math.floor(hx('edu' + u.id) * EDU.length)], age: 21 + Math.floor(hx('age' + u.id) * (senior ? 20 : 18)),
    gender: h('g') > 0.5 ? '女' : '男', phone: u.phone, certs, history };
}
const monthsBack = n => { const t = L.today(); const out = []; let m = t.slice(0, 8) + '01'; for (let i = 0; i < n; i++) { out.unshift(m); m = L.addDays(m, -1).slice(0, 8) + '01'; } return out; };
const grade = s => (s >= 92 ? 'A' : s >= 85 ? 'B' : s >= 75 ? 'C' : 'D');
function perfOf(u) {
  const t = L.today();
  return monthsBack(6).map((m, i) => {
    const end = i === 5 ? L.addDays(t, -1) : L.addDays(L.addDays(m, 32).slice(0, 8) + '01', -1);
    const s = pstatsLite(u.id, m, end);
    let score, real = s.total >= 10 && s.done > 0;
    if (real) score = Math.round((s.rate ?? 0) * 0.5 + (s.pass ?? s.rate ?? 0) * 0.3 + (s.ontime ?? 0) * 0.2);
    else score = Math.round(76 + hash('pf' + u.id) * 16 + (hash('pm' + u.id + m) - 0.5) * 8);
    return { ym: m.slice(0, 7), score, grade: grade(score), real, total: s.total, rate: s.rate, pass: s.pass, good: s.good, bad: s.bad };
  });
}
const hrSummary = u => {
  if (Date.now() - memoAt > 30000) memoReset();
  const k = 'hs' + u.id;
  if (!MEMO.has(k)) MEMO.set(k, hrSummary0(u));
  return structuredClone(MEMO.get(k));
};
function hrSummary0(u) {
  const t = L.today(), pf = profileOf(u), perf = perfOf(u), s30 = pstatsLite(u.id, L.addDays(t, -30), L.addDays(t, -1));
  const avg3 = Math.round(perf.slice(-3).reduce((a, x) => a + x.score, 0) / 3);
  const tier = avg3 >= 88 && pf.tenure >= 1 && s30.bad < 2 ? '可晋升' : avg3 < 78 || s30.bad >= 4 ? '需辅导' : '稳定';
  const alerts = [];
  if (pf.in_probation && pf.probation_end <= L.addDays(t, 30)) alerts.push({ level: 'mid', type: '试用期到期', text: `${pf.probation_end} 试用期到期，需完成转正评估` });
  for (const c of pf.certs) if (c.expire <= L.addDays(t, 60)) alerts.push({ level: c.expire < t ? 'high' : 'mid', type: '证照到期', text: `${c.name}${c.expire < t ? '已于 ' + c.expire + ' 过期' : '将于 ' + c.expire + ' 到期'}` });
  if (s30.bad >= 2) alerts.push({ level: s30.bad >= 3 ? 'high' : 'mid', type: '多次不合格', text: `近 30 天抽查不合格 ${s30.bad} 次` });
  if (s30.total >= 20 && !s30.good) alerts.push({ level: 'low', type: '长期未获肯定', text: `近 30 天完成 ${s30.done} 项，未获一次肯定` });
  if (u.level === 'staff' && ((pf.tenure < 0.5 && s30.bad >= 1) || (s30.total >= 20 && !s30.good && (s30.rate ?? 100) < 90) || (s30.bad >= 3 && avg3 < 80))) alerts.push({ level: 'mid', type: '离职风险', text: '近期表现波动且缺少正向反馈，建议店长谈心并同步人事' });
  return { id: u.id, name: u.name, role_name: u.role_name, level: u.level, reserve: u.reserve || null, store_id: u.store_id, store: u.store_id ? q1('SELECT name FROM stores WHERE id=?', u.store_id).name : '区域',
    hire: pf.hire, tenure: pf.tenure, edu: pf.edu, in_probation: pf.in_probation, avg3, tier, alerts, s30: { total: s30.total, rate: s30.rate, pass: s30.pass, good: s30.good, bad: s30.bad, training: s30.training },
    trend: perf.map(x => x.score) };
}
const hrAlertCount = u => q(USER_SQL + " WHERE u.active=1 AND u.region_id=? AND r.level IN ('staff','store_manager')", u.region_id).reduce((a, x) => a + hrSummary(x).alerts.length, 0);
const canHR = u => ['region_manager', 'hr_manager', 'coach'].includes(u.level) && u.reserve !== 'rm';
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
    const rs = role === '店长' ? list.filter(x => x.reserve === 'sm') : [], pl = [...rs, ...pool.filter(x => !rs.includes(x))];
  return { role, candidates: pl.slice(0, 3).map(x => ({ id: x.id, name: x.name, role_name: x.reserve === 'sm' ? x.role_name + ' · 储备店长' : x.role_name, store: x.store })) };
  }) }));
  res.json({ list, bench });
});
app.get('/api/hr/person/:id', (req, res) => {
  const u = q1(USER_SQL + ' WHERE u.id=?', req.params.id);
  if (!u || !(canPeople(req.u, u) || u.id === req.u.id)) return deny(res);
  const sum = hrSummary(u);
  res.json({ ...sum, profile: profileOf(u), perf: perfOf(u),
    trainings: q("SELECT r.*, COALESCE(i.title, r.title) title, c.name creator FROM rectifications r LEFT JOIN instances i ON i.id=r.instance_id LEFT JOIN users c ON c.id=r.created_by WHERE r.assignee_id=? AND r.training!='' ORDER BY r.id DESC LIMIT 12", u.id),
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
  if (!['region_manager', 'ops_manager', 'coach'].includes(req.u.level)) return deny(res);
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
      const brand = avg(ss.map(id => q1("SELECT score FROM patrols WHERE store_id=? AND status='done' AND COALESCE(kind,'patrol')='patrol' ORDER BY done_at DESC LIMIT 1", id)?.score ?? Math.round(86 + hash('b' + id) * 8)));
      const team = avg(st.map(s => s.pass_rate));
      const biz = avg(ss.map(id => Math.max(0, Math.min(100, Math.round(60 + (bizRange(id, f30, y).mpi - 92) * 1.6)))));
      const W = cfg().mgr, total = Math.round(((exec ?? 0) * W.exec + (brand ?? 0) * W.brand + (team ?? 0) * W.team + (biz ?? 0) * W.biz) / 100);
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
  if (!rmLike(req.u)) return deny(res);
  const { store_id, user_id, note } = req.body || {};
  const to = q1(USER_SQL + ' WHERE u.id=?', user_id), st = q1('SELECT name FROM stores WHERE id=?', store_id);
  if (!to || !st || !note) return err(res, '请选择跟进人并填写跟进事项');
  D.notify([to.id], 'focus', `区域经理指派跟进：${st.name}`, note, '#/home?view=store&store=' + store_id);
  D.audit(req.u.id, store_id, '指派跟进', `→${to.name}：${note}`);
  res.json({ ok: true });
});

// ---------- 四板块：门店档案 / 经营 / 证照 / 人 / 加盟商 / 门店画像（实验）/ 周报 / 待我处理（档案、预算、业主数据为模拟） ----------
const AREAS = { 4: ['商务区', '亚朵 · 美居 · 智选假日'], 1: ['商务区', '亚朵 · 桔子水晶 · 美居'], 2: ['交通枢纽', '汉庭优佳 · 亚朵 · 智选假日'], 3: ['旅游景区', '维也纳国际 · 亚朵 · 民宿集群'] };
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
  const rs = role === '店长' ? list.filter(x => x.reserve === 'sm') : [], pl = [...rs, ...pool.filter(x => !rs.includes(x))];
  return { role, candidates: pl.slice(0, 3).map(x => ({ id: x.id, name: x.name, role_name: x.reserve === 'sm' ? x.role_name + ' · 储备店长' : x.role_name, store: x.store })) };
});
const CFG_DEF = { dims: { biz: 30, brand: 20, ops: 20, guest: 15, team: 10, safe: 5 }, grades: { S: 90, A: 85, B: 78, C: 70 }, type_th: 82, mgr: { exec: 35, brand: 25, team: 20, biz: 20 },
  pen: { rect_late: 4, rect_open: 1, repair_late: 6 }, reno_years: 4, plan_days: 3, recheck_days: 7, sla: { urgent: 4, normal: 24, low: 72 },
  comm: { card_silver: 10, card_gold: 25, card_plat: 50, tier_cards: 20, tier_bonus: 20, room_std: 4, room_suite: 8, room_fail: 4 } };
let CFG_CACHE = null;
function cfg() {
  if (CFG_CACHE) return CFG_CACHE;
  const c = D.getSetting('score_cfg', {}), o = JSON.parse(JSON.stringify(CFG_DEF));
  for (const k of Object.keys(o)) if (c[k] != null) o[k] = typeof o[k] === 'object' ? { ...o[k], ...c[k] } : c[k];
  return (CFG_CACHE = o);
}
const STORE_DIM_BASE = [['biz', '经营业绩'], ['brand', '品牌标准'], ['ops', '运营执行'], ['guest', '宾客口碑'], ['team', '团队人才'], ['safe', '安全合规']];
const STORE_DIMS_FN = () => STORE_DIM_BASE.map(([k, l]) => [k, l, cfg().dims[k]]);
const STORE_TYPES = { 标杆店: ['ok', '经营和运营都好，总结经验在区域复制'], 潜力店: ['acc', '运营扎实但经营偏弱，营销经理重点发力'], 隐患店: ['warn', '经营尚可但运营偏弱，盯执行和品牌标准'], 帮扶店: ['bad', '经营和运营都偏弱，列入重点巡店和帮扶'] };
const sgrade = s => { const g = cfg().grades; return s >= g.S ? 'S' : s >= g.A ? 'A' : s >= g.B ? 'B' : s >= g.C ? 'C' : 'D'; };
function storeScore0(sid) {
  const t = L.today(), y = L.addDays(t, -1), f30 = L.addDays(t, -30);
  const st = storeStats([sid], f30, y)[0], b = bizRange(sid, f30, y);
  const ach = b.revpar * 100 / ((BIZ_BASE[sid] || 350) * 1.04);
  const patrol = q1("SELECT score FROM patrols WHERE store_id=? AND status='done' AND COALESCE(kind,'patrol')='patrol' ORDER BY done_at DESC LIMIT 1", sid)?.score ?? Math.round(86 + hash('b' + sid) * 8);
  const people = q(USER_SQL + " WHERE u.active=1 AND u.store_id=? AND r.level='staff'", sid).map(hrSummary);
  const lic = licensesOf(sid);
  const coach = people.filter(x => x.tier === '需辅导').length, certBad = people.reduce((a, x) => a + x.alerts.filter(z => z.type === '证照到期' && z.level === 'high').length, 0);
  const bench = benchOf(people, sid).filter(r => r.role !== '店长' && !r.candidates.length).length;
  const C = cfg(), rpLate = repairLate(sid);
  const mys = q1("SELECT score, done_at FROM patrols WHERE store_id=? AND status='done' AND kind='mystery' AND done_at>=? ORDER BY done_at DESC LIMIT 1", sid, L.addDays(t, -90));
  const d = {
    biz: clamp(ach * 0.6 + (60 + (b.mpi - 92) * 1.6) * 0.4),
    brand: clamp(mys ? patrol * 0.7 + mys.score * 0.3 : patrol),
    ops: clamp((st.rate ?? 80) * 0.4 + (st.pass_rate ?? 80) * 0.3 + (100 - st.rect_late * C.pen.rect_late - st.rect_open * C.pen.rect_open) * 0.3),
    guest: clamp(100 - b.bad * 2.2 - cpPenalty(sid)),
    team: clamp(100 - coach * 100 / Math.max(1, people.length) * 0.8 - certBad * 4 - bench * 6),
    safe: clamp(100 - lic.filter(x => x.status === 'bad').length * 25 - lic.filter(x => x.status === 'warn').length * 8 - rpLate * C.pen.repair_late - safePenalty(sid)),
  };
  const total = Math.round(STORE_DIMS_FN().reduce((a, [k, , w]) => a + d[k] * w, 0) / 100);
  const bx = Math.round((d.biz + d.guest) / 2), ox = Math.round((d.brand + d.ops) / 2), TH = C.type_th;
  const type = bx >= TH && ox >= TH ? '标杆店' : ox >= TH ? '潜力店' : bx >= TH ? '隐患店' : '帮扶店';
  const why = { biz: `近 30 天 RevPAR 达成 ${Math.round(ach)}%，MPI ${Math.round(b.mpi)}`, brand: `最近一次巡店 ${patrol} 分${mys ? ` · 神秘访客 ${mys.score} 分` : ''}`, ops: `完成率 ${st.rate ?? '-'}% · 合格率 ${st.pass_rate ?? '-'}% · 整改逾期 ${st.rect_late}`,
    guest: `近 30 天差评 ${b.bad} 条`, team: `需辅导 ${coach} 人 · 证照过期 ${certBad} · 关键岗位无储备 ${bench}`, safe: `证照年检过期 ${lic.filter(x => x.status === 'bad').length} · 临期 ${lic.filter(x => x.status === 'warn').length} · 报修超时 ${rpLate}` };
  const weak = STORE_DIMS_FN().map(([k, l]) => ({ k, l, v: d[k], why: why[k] })).sort((a, b2) => a.v - b2.v).slice(0, 2);
  const trend = [5, 4, 3, 2, 1].map(i => Math.round(total + (hash(i + 'sg' + sid) - 0.5) * 8)).concat(total).map(v => ({ v, g: sgrade(v) }));
  return { id: sid, name: sname(sid), dims: d, total, grade: sgrade(total), axes: { biz: bx, ops: ox }, type, type_tag: STORE_TYPES[type][0], tactic: STORE_TYPES[type][1], weak, why, trend };
}
const TAG_OPTS = ['新开业', '店长交接期', '店长兼管', '重点帮扶', '改造中', '改造规划', '标杆复制'];
const tagsOf = sid => (q1('SELECT tags FROM stores WHERE id=?', sid)?.tags || '').split(',').filter(Boolean);
const GRADES = 'SABCD';
function renoOf(sid) {
  const i = storeInfo(sid), since = i.renovate || i.open_date;
  const yrs = Math.round((Date.parse(L.today()) - Date.parse(since)) / 864e5 / 36.5) / 10;
  return yrs >= cfg().reno_years ? { years: yrs, text: `${i.renovate ? '距上次改造' : '开业至今'} ${yrs} 年，建议规划改造${i.owner ? '，并纳入业主沟通事项' : ''}` } : null;
}
const plansOf = sid => q("SELECT p.*, u.name owner FROM store_plans p LEFT JOIN users u ON u.id=p.owner_id WHERE p.store_id=? ORDER BY p.status!='open', p.id DESC", sid).map(p => ({ ...p, updates: JSON.parse(p.updates || '[]') }));
const storeScore = memo('ss', storeScore0), storeStats = memo('st', storeStats0);
function regionScores(regionId) {
  const all = q("SELECT id FROM stores WHERE region_id=? AND COALESCE(lc_stage,'')!='退出'", regionId).map(s => storeScore(s.id)).sort((a, b) => b.total - a.total);
  const avg = { total: Math.round(all.reduce((a, x) => a + x.total, 0) / (all.length || 1)) };
  STORE_DIMS_FN().forEach(([k]) => { avg[k] = Math.round(all.reduce((a, x) => a + x.dims[k], 0) / (all.length || 1)); });
  all.forEach((x, i) => {
    x.rank = i + 1; x.of = all.length;
    const peers = all.filter(y => y.type === x.type); x.peer_rank = peers.indexOf(x) + 1; x.peers = peers.length;
    x.tags = tagsOf(x.id); x.stage = storeStage(x.id); x.reno = renoOf(x.id); x.plans = plansOf(x.id);
    const [pv, cur] = x.trend.slice(-2).map(t => t.g);
    x.drop = GRADES.indexOf(cur) > GRADES.indexOf(pv) ? { from: pv, to: cur } : null;
    x.dim_trend = {}; x.declines = [];
    STORE_DIMS_FN().forEach(([k, l]) => {
      const v = x.dims[k], m1 = clamp(v + (hash(k + x.id + 'm1') - 0.42) * 8), m2 = clamp(m1 + (hash(k + x.id + 'm2') - 0.42) * 8);
      x.dim_trend[k] = [m2, m1, v];
      if (m2 > m1 && m1 > v) x.declines.push(l);
    });
    if (x.stage === "爬坡") { x.drop = null; x.declines = []; x.trend = x.trend.slice(-Math.max(1, Math.ceil(dBetween(openOf(x.id), L.today()) / 30))); STORE_DIM_BASE.forEach(([k]) => { x.dim_trend[k] = [x.dims[k]]; }); }
  });
  return { all, avg };
}
const regionOfStore = sid => q1('SELECT region_id FROM stores WHERE id=?', sid).region_id;
app.get('/api/store/:sid/profile', (req, res) => {
  const sid = Number(req.params.sid); if (!canSee(req.u, sid) || (req.u.level === 'staff' && !daCan(req.u, 'biz'))) return deny(res);
  const { all, avg } = regionScores(regionOfStore(sid));
  res.json({ info: storeInfo(sid), score: all.find(x => x.id === sid), avg, licenses: licensesOf(sid), repairs: repairStats(sid), lc: lcOf(sid), cfg: cfg(), dim_def: STORE_DIMS_FN(), types: STORE_TYPES, tag_opts: TAG_OPTS });
});
app.get('/api/region/stores', (req, res) => {
  if (!isRegion(req.u)) return deny(res);
  const vs = visibleStores(req.u), { all, avg } = regionScores(req.u.region_id);
  const xs = all.filter(x => vs.includes(x.id)); xs.forEach(x => { x.info = storeInfo(x.id); });
  res.json({ stores: xs, avg, cfg: cfg(), types: STORE_TYPES, dim_def: STORE_DIMS_FN(), tag_opts: TAG_OPTS });
});
app.post('/api/store/:sid/tags', (req, res) => {
  const sid = Number(req.params.sid); if (!rmLike(req.u) || !canSee(req.u, sid)) return deny(res);
  const tags = (req.body.tags || []).filter(t => TAG_OPTS.includes(t));
  run('UPDATE stores SET tags=? WHERE id=?', tags.join(','), sid);
  D.audit(req.u.id, sid, '门店标签', tags.join('、') || '清空');
  res.json({ ok: true });
});
app.post('/api/store-plans', (req, res) => {
  const b = req.body, sid = Number(b.store_id);
  if (!rmLike(req.u) || !canSee(req.u, sid)) return deny(res);
  const dim = STORE_DIMS_FN().find(d => d[0] === b.dim); if (!dim) return err(res, '请选择提升维度');
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
  } else if (req.params.op === 'close' && p.status === 'open' && rmLike(req.u)) {
    const now = storeScore(p.store_id).dims[p.dim], st = now >= p.target ? 'done' : 'fail';
    run('UPDATE store_plans SET status=?, result=?, closed_at=? WHERE id=?', st, `结项得分 ${now}（起点 ${p.base}，目标 ${p.target}）${b.note ? '；' + b.note : ''}`, L.nowStr(), p.id);
    D.notify(D.storeManagers(p.store_id), 'plan', `提升计划已结项：${st === 'done' ? '达成' : '未达成'}`, p.title, '#/sp/' + p.store_id);
  } else return deny(res);
  res.json({ ok: true });
});
app.get('/api/store/:sid/biz', (req, res) => {
  const sid = Number(req.params.sid); if (!canSee(req.u, sid) || (req.u.level === 'staff' && !daCan(req.u, 'biz'))) return deny(res);
  res.json({ ...storeBiz(sid), info: storeInfo(sid), licenses: licensesOf(sid), reports: q('SELECT r.*, u.name reviewer FROM reports r LEFT JOIN users u ON u.id=r.reviewed_by WHERE r.store_id=? ORDER BY r.id DESC LIMIT 4', sid).map(r => ({ ...r, body: JSON.parse(r.body) })) });
});
app.get('/api/store/:sid/people', (req, res) => {
  const sid = Number(req.params.sid);
  if (!(canManage(req.u, sid) || (req.u.store_id === sid && LEADS[req.u.role_name]))) return deny(res);
  const list = storePeople(req.u, sid);
  res.json({ list, bench: canManage(req.u, sid) ? benchOf(list, sid) : [], suggests: q('SELECT h.*, u.name, u2.name replier FROM hr_suggest h JOIN users u ON u.id=h.user_id LEFT JOIN users u2 ON u2.id=h.replied_by WHERE h.store_id=? ORDER BY h.id DESC LIMIT 8', sid) });
});
const sameRegion = (u, x) => u.level === 'hq' || !x || (x.store_id ? regionOfStore(x.store_id) === u.region_id : x.region_id === u.region_id);
const canPeople = (u, m) => (canHR(u) && sameRegion(u, m)) || (u.level === 'ops_manager' && m.level === 'store_manager' && sameRegion(u, m)) || (m.store_id && canManage(u, m.store_id)) || leads(u, m.id);
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
  if (!['region_manager', 'coach', 'sales_manager'].includes(req.u.level)) return deny(res);
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
  } else if (op === 'reply' && rmLike(req.u)) {
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
  if (!r || !rmLike(req.u)) return deny(res);
  run("UPDATE reports SET status='reviewed', comment=?, reviewed_by=?, reviewed_at=? WHERE id=?", req.body.comment || '已阅', req.u.id, L.nowStr(), r.id);
  D.notify([r.created_by], 'report', '区域经理已批复周报', req.body.comment || '已阅', '#/report/' + r.id);
  res.json({ ok: true });
});
function buildInbox(u, query) {
  const t = L.today(), hm = L.nowHM(), out = [], add = (tag, lv, title, sub, link, act) => out.push({ tag, lv, title, sub, link, act });
  const sids = visibleStores(u), sid = Number(query.store) || sids[0];
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
    if (ck) add('待点评', 'warn', `今日风险抽查 ${Math.min(6, ck)} 项`, `已完成 ${ck} 项，按风险抽 6 项，其余免检`, '#/must');
    const rv = q1("SELECT COUNT(*) n FROM rectifications WHERE store_id=? AND status='submitted'", sid).n;
    if (rv) add('待复查', 'warn', `整改已提交待复查 ${rv} 项`, '', '#/rect');
    q("SELECT * FROM patrols WHERE store_id=? AND status='planned' AND COALESCE(kind,'patrol')='patrol' ORDER BY planned_date LIMIT 1", sid).forEach(p => add('巡店', 'acc', `区域经理 ${p.planned_date} 巡店`, p.reason || '例行巡店', '#/patrol/' + p.id));
    licensesOf(sid).filter(x => x.status !== 'ok').slice(0, 2).forEach(x => add('证照', x.status, `${x.name}${x.days < 0 ? '已过期' : x.days + ' 天后到期'}`, '到期日 ' + x.expire, '#/home?pl=biz&store=' + sid));
    if (isFr(sid)) { seedOwnerReqs(); q("SELECT * FROM owner_reqs WHERE store_id=? AND status='replied'", sid).forEach(o => add('区域回复', 'acc', o.title, '区域经理已回复，确认后关闭', '#/frs/' + sid)); }
    q("SELECT h.*, m.name FROM hr_suggest h JOIN users m ON m.id=h.user_id WHERE h.store_id=? AND h.status!='open' AND h.replied_at>=?", sid, L.addDays(t, -7) + ' 00:00').forEach(h => add('人事回复', h.status === 'approved' ? 'ok' : 'warn', `${h.name} ${h.kind}建议${h.status === 'approved' ? '已同意' : '被退回'}`, h.reply || '', '#/home?pl=ren&store=' + sid));
    q("SELECT * FROM reports WHERE store_id=? AND status='reviewed' AND reviewed_at>=?", sid, L.addDays(t, -7) + ' 00:00').forEach(r => add('周报批复', 'ok', `周报 ${r.period} 已批复`, r.comment, '#/report/' + r.id));
    const lw = q1('SELECT MAX(created_at) at FROM reports WHERE store_id=?', sid).at;
    if (!lw || lw < L.addDays(t, -6)) add('周报', 'acc', '本周周报未提交', '系统已汇总好数据，一键提交区域经理', '#/home?pl=biz&store=' + sid, 'report');
  }
  if (rmLike(u)) {
    seedOwnerReqs();
    q(REQ_SQL + " WHERE o.escalated=1 AND o.status='open' ORDER BY o.id DESC").forEach(o => add('业主诉求', 'bad', `${o.store}：${o.title}`, (o.body || '').slice(0, 40), '#/home?pl=fr', 'req:' + o.id));
    q("SELECT r.*, s.name store FROM reports r JOIN stores s ON s.id=r.store_id WHERE r.status='submitted' ORDER BY r.id DESC").forEach(r => add('周报', 'warn', `${r.store} 店长周报待批复`, r.period, '#/report/' + r.id));
    q("SELECT p.*, s.name store FROM patrols p JOIN stores s ON s.id=p.store_id WHERE p.status='planned' AND p.planned_date<=? ORDER BY p.planned_date", L.addDays(t, 2)).forEach(p => add(p.kind === 'mystery' ? '神秘访客' : p.kind === 'recheck' ? '巡店复查' : '巡店', 'acc', `${p.planned_date} ${p.kind === 'mystery' ? '神秘访客' : '巡店'} ${p.store}`, p.reason || '', '#/patrol/' + p.id));
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
  if (u.level === 'staff' && u.store_id) {
    if (isEng(u)) q("SELECT * FROM repairs WHERE store_id=? AND (status='open' OR (status='accepted' AND assignee_id=?)) ORDER BY due_at LIMIT 4", u.store_id, u.id)
      .forEach(x => add(x.status === 'open' ? '待接单' : '维修中', x.due_at < L.nowStr() ? 'bad' : x.urgency === 'urgent' ? 'warn' : 'acc', `${x.location} ${x.title}`, `${RP_URG[x.urgency]} · ${x.due_at} 前修复`, '#/repair/' + x.id));
    q("SELECT * FROM repairs WHERE created_by=? AND status='done'", u.id).forEach(x => add('报修待确认', 'warn', x.title, '工程已修好，请确认', '#/repair/' + x.id));
  }
  if ((u.level === 'store_manager' || (u.level === 'staff' && LEADS[u.role_name])) && sid) {
    const ids = u.level === 'store_manager' ? null : teamOf(u, sid).map(x => x.id);
    execBoard(sid).filter(x => x.score < 70 && (!ids || ids.includes(x.id))).slice(0, 2).forEach(x => add('执行分偏低', 'warn', `${x.name} 执行分 ${x.score}`, `完成率 ${x.parts.rate ?? '-'}% · 准时率 ${x.parts.ontime ?? '-'}% · 建议谈心辅导`, '#/hrp/' + x.id));
  }
  if (u.level === 'store_manager' && sid) {
    q("SELECT * FROM repairs WHERE store_id=? AND status IN ('open','accepted') AND due_at<? ORDER BY due_at LIMIT 3", sid, L.nowStr()).forEach(x => add('报修超时', 'bad', `${x.location} ${x.title}`, `应于 ${x.due_at} 修复`, '#/repair/' + x.id));
    q("SELECT p.*, s.name store FROM patrols p JOIN stores s ON s.id=p.store_id WHERE p.store_id=? AND p.kind='recheck' AND p.status='planned'", sid).forEach(p => add('巡店复查', 'warn', `${p.planned_date} 复查 ${(p.codes || '').split(',').length} 项`, '整改未完成的项复查会再次不达标', '#/patrol/' + p.parent_id));
  }
  if (['region_manager', 'coach', 'ops_manager'].includes(u.level) && sids.length) {
    q(`SELECT p.*, s.name store FROM repairs p JOIN stores s ON s.id=p.store_id WHERE p.esc_level=2 AND p.status IN ('open','accepted') AND p.store_id IN (${sids.map(() => '?').join(',')})`, ...sids).forEach(x => add('报修升级', 'bad', `${x.store}：${x.title}`, `${x.location} · 应于 ${x.due_at} 修复`, '#/repair/' + x.id));
  }
  if (['region_manager', 'dev_manager', 'build_manager'].includes(u.level)) {
    q(PJ_SQL + " WHERE p.region_id=? AND p.status='active'", u.region_id).map(projOf).forEach(p => {
      const mine = u.level === 'region_manager' || p.dev_id === u.id || p.build_id === u.id;
      if (!mine) return;
      if (p.health === 'red') add('项目风险', 'bad', `${p.name}：${p.why.filter(w => w[0] === 'bad').map(w => w[1]).join('；')}`, `${p.stage} · 预计 ${p.predicted_open} 开业`, '#/proj/' + p.id);
      else if (p.cur?.late) add('节点逾期', 'warn', `${p.name}：${p.cur.name}逾期 ${p.cur.slip} 天`, `计划 ${p.cur.plan_date} · 开业顺延至 ${p.predicted_open}`, '#/proj/' + p.id);
    });
  }
  if (rmLike(u)) q("SELECT id, name FROM stores WHERE region_id=?", u.region_id).filter(s => storeStage(s.id) === '爬坡').forEach(s => {
    const r = rampOf(s.id);
    if (r.eval_due) add('新店评估', 'warn', `${s.name} 开业满 ${r.days} 天，待做 90 天新店评估`, `近 4 周出租率较爬坡基准 ${r.gap >= 0 ? '+' : ''}${r.gap} 个点`, '#/sp/' + s.id);
    if (r.ready) add('转入成熟', 'acc', `${s.name} 已满 6 个月且 RevPAR 达标，可转入成熟期`, '', '#/sp/' + s.id);
  });
  if (u.level === 'store_manager' && sid) {
    q("SELECT * FROM stocktakes WHERE store_id=? AND status='planned'", sid).forEach(k => add('物料盘点', 'warn', `${k.date} 物料盘点待提交`, '逐项清点库存，提交差异', '#/proc?store=' + sid));
    q("SELECT * FROM requisitions WHERE store_id=? AND status='approved'", sid).forEach(r => add('物料到货', 'acc', '统购物料已批准配送，到货后确认收货', JSON.parse(r.items).map(x => x.name).join('、'), '#/proc?store=' + sid));
    const p = procOf(sid); if (p.rate != null && p.rate < p.target) add('统购率', 'bad', `近 3 月统购率 ${p.rate}%，低于品牌标准 ${p.target}%`, '必须统购：' + p.must.join('、'), '#/proc?store=' + sid);
    q(`SELECT m.*, a.name mentee, a.store_id FROM mentors m JOIN users a ON a.id=m.mentee_id WHERE a.store_id=? AND m.status='active'`, sid).forEach(m => { const d = dBetween(m.start, t), ch = JSON.parse(m.checks || '{}'), k = d >= 90 && !ch.d90 ? 'd90' : d >= 60 && !ch.d60 ? 'd60' : d >= 30 && !ch.d30 ? 'd30' : null; if (k) add('师徒带教', 'warn', `${m.mentee} 入职 ${d} 天，${k.slice(1)} 天带教验收待确认`, '', '#/train'); });
  }
  if (['store_manager', 'staff'].includes(u.level) && (u.store_id || sid)) { const ss = q1("SELECT s.*, a.name n FROM shift_logs s JOIN users a ON a.id=s.by WHERE s.store_id=? AND s.status='open' AND s.by!=?", sid || u.store_id, u.id); if (ss && (u.level !== 'staff' || /经理|店助|前台/.test(u.role_name))) add('待接班', 'warn', `${ss.n} 的${ss.shift}交班单待接班`, `遗留问题 ${JSON.parse(ss.issues).filter(i => !i.done).length} 项`, '#/shift'); }
  if (u.level === 'store_manager' || (u.store_id && /店助|经理/.test(u.role_name))) for (const s0 of (sid ? [sid] : visibleStores(u))) {
    q("SELECT * FROM complaints WHERE store_id=? AND status IN ('open','handled')", s0).map(cpOf).forEach(c => add(c.status === 'open' ? (c.late ? '客诉超时' : '客诉') : '客诉回访', c.late || c.level !== '一般' ? 'bad' : 'warn', `${c.level} · ${c.src}：${c.body}`, c.status === 'open' ? `限 ${c.due_at.slice(5, 16)} 前处理` : c.comp_status === 'pending' ? '补偿待区域审批' : '待回访宾客', '#/complaints?store=' + s0));
    safeOf(s0).filter(p => p.late || (p.next_date === L.today() && p.cycle > 1)).forEach(p => add('安全', p.late ? 'bad' : 'warn', `${p.kind}${p.late ? '已逾期' : '今天到期'}`, `${p.title} · 应于 ${p.next_date}`, '#/safety?store=' + s0));
  }
  if (['region_manager', 'coach', 'ops_manager'].includes(u.level)) q(`SELECT c.*, s.name sn FROM complaints c JOIN stores s ON s.id=c.store_id WHERE c.comp_status='pending' AND c.store_id IN (${visibleStores(u).join(',') || 'NULL'})`).forEach(c => add('补偿审批', 'warn', `${c.sn} 客诉补偿 ¥${c.comp_amt}`, c.body, '#/complaints'));
  if (u.level === 'store_manager' || u.level === 'hr_manager') q(`SELECT a.*, x.name FROM pay_appeals a JOIN users x ON x.id=a.user_id WHERE a.status='open' AND x.store_id IN (${visibleStores(u).join(',') || 'NULL'})`).forEach(a => add('绩效申诉', 'warn', `${a.name}：${a.item || '绩效'}申诉`, a.reason, '#/pay'));
  if (u.level === 'staff' && u.store_id) q("SELECT * FROM stocktakes WHERE assignee_id=? AND status='planned'", u.id).forEach(k => add('物料盘点', 'warn', `${k.date} 物料盘点`, '逐项清点库存，提交差异', '#/proc?store=' + u.store_id));
  if (['region_manager', 'coach', 'ops_manager'].includes(u.level)) q(`SELECT r.*, s.name store FROM requisitions r JOIN stores s ON s.id=r.store_id WHERE r.status='open'`).forEach(r => add('物料申领', 'warn', `${r.store} 申领待审批`, JSON.parse(r.items).map(x => `${x.name} ${x.qty}${x.unit}`).join('、'), '#/proc'));
  if (['train_manager', 'hr_manager', 'region_manager', 'coach'].includes(u.level)) trainAlerts(u.region_id).slice(0, 4).forEach(a => add(a.type, a.type === '上岗门槛' ? 'bad' : 'warn', a.text, '', '#/train'));
  if (u.level === 'train_manager') {
    q('SELECT * FROM train_classes WHERE region_id=? AND start BETWEEN ? AND ?', u.region_id, t, L.addDays(t, 14)).forEach(c => add('即将开班', 'acc', `${c.start} ${c.name}`, `已报名 ${q1('SELECT COUNT(*) n FROM train_enroll WHERE class_id=?', c.id).n}/${c.seats}`, '#/train'));
    q("SELECT c.name, COUNT(*) n FROM train_enroll e JOIN train_classes c ON c.id=e.class_id WHERE c.end<? AND e.status='enrolled' GROUP BY c.id", t).forEach(c => add('待录成绩', 'warn', `${c.name} 有 ${c.n} 人待录入考核结果`, '', '#/train'));
  }
  if (u.level === 'ops_manager') q("SELECT p.*, s.name store FROM patrols p JOIN stores s ON s.id=p.store_id WHERE p.kind='recheck' AND p.status='planned' AND p.planned_date<=? ORDER BY p.planned_date", L.addDays(t, 2)).forEach(p => add('巡店复查', 'acc', `${p.planned_date} 复查 ${p.store}`, p.reason, '#/patrol/' + p.id));
  if (u.level === 'store_manager' && sid) {
    const sc = regionScores(regionOfStore(sid)).all.find(x => x.id === sid);
    sc.plans.filter(p => p.status === 'open').forEach(p => add('提升计划', p.due < t ? 'bad' : 'warn', p.title, `目标 ${p.target} 分 · ${p.due} 截止 · 进度 ${p.progress}%`, '#/home?pl=shop&store=' + sid));
    if (sc.drop) add('等级下降', 'bad', `门店画像 ${sc.drop.from} → ${sc.drop.to}`, '短板：' + sc.weak.map(w => w.l).join('、'), '#/home?pl=shop&store=' + sid);
  }
  if (rmLike(u)) {
    regionScores(u.region_id).all.forEach(x => {
      if (x.drop) add('等级下降', 'bad', `${x.name}：门店画像 ${x.drop.from} → ${x.drop.to}`, '短板：' + x.weak.map(w => w.l).join('、'), '#/sp/' + x.id);
      if (x.declines.length) add('连续下滑', 'warn', `${x.name}：${x.declines.join('、')} 连续 2 个月下滑`, '', '#/sp/' + x.id);
      x.plans.filter(p => p.status === 'open' && p.due <= L.addDays(t, cfg().plan_days)).forEach(p => add('提升计划', p.due < t ? 'bad' : 'warn', `${x.name}：${p.title}`, `${p.due} ${p.due < t ? '已到期，待结项' : '即将到期'} · 进度 ${p.progress}%`, '#/sp/' + x.id));
      if (x.reno) add('改造提醒', 'acc', `${x.name}：${x.reno.text}`, '', '#/sp/' + x.id);
    });
  }
  if (['hr_manager', 'region_manager', 'coach', 'store_manager'].includes(u.level)) (u.level === 'store_manager' ? [sid] : sids).filter(Boolean).forEach(s => hrStats(s).alerts.filter(a => a.lv === 'bad' || u.level !== 'store_manager').slice(0, 2).forEach(a => add(a.type, a.lv, `${sname(s)}：${a.text}`, '', '#/hrm?store=' + s)));
  if (u.level === 'store_manager' && sid) careOf(sid).alerts.sort((a, b) => (a.lv === 'bad' ? 0 : 1) - (b.lv === 'bad' ? 0 : 1)).slice(0, 4).forEach(a => add('员工美好', a.lv, a.text, a.type, '#/care?store=' + sid));
  if (u.level === 'hr_manager') { const hp = q(`SELECT COUNT(*) n FROM hardship WHERE status='pending' AND store_id IN (${sids.join(',') || 0})`)[0].n, sp = q(`SELECT COUNT(*) n FROM care_star WHERE status='pending' AND store_id IN (${sids.join(',') || 0})`)[0].n;
    if (hp) add('困难帮扶', 'bad', `${hp} 条帮扶申请待审批`, '', '#/care'); if (sp) add('月度之星', 'warn', `${sp} 条月度之星提名待审核`, '', '#/care'); }
  if (['region_manager', 'coach', 'hr_manager'].includes(u.level)) { sids.map(careOf).filter(x => x.score < 70).forEach(x => add('员工美好', 'warn', `${x.name} 员工美好分 ${x.score}`, x.alerts.slice(0, 2).map(a => a.text).join('；'), '#/care?store=' + x.id));
    if (u.level !== 'hr_manager') { const qs0 = qStart(L.today()), left = [...new Set(sids.flatMap(s => D.storeManagers(s)))].filter(id => !q1("SELECT 1 x FROM care_log WHERE user_id=? AND kind='sm_talk' AND date>=?", id, qs0)); if (left.length) add('店长谈心', 'warn', `本季度还有 ${left.length} 位店长未谈心`, left.map(id => q1('SELECT name FROM users WHERE id=?', id).name).join('、'), '#/care'); } }
  q("SELECT id, title, kind FROM help_q WHERE owner_id=? AND reply IS NULL ORDER BY id DESC LIMIT 3", u.id).forEach(x => add(x.kind === 'unclear' ? '说明反馈' : '咨询', 'acc', x.title, '待你回复', '#/help/inbox'));
  return out;
}
const WEEKLY_TAGS = ['员工美好', '月离职率高', '关键岗位空缺', '满编率低', '90天流失高', '统购率', '师徒带教', '人事预警'];
const ASSIST_TAGS = ['员工美好', '物料盘点'];
const assistOf = sid => q1("SELECT u.id, u.name FROM users u JOIN roles r ON r.id=u.role_id WHERE u.store_id=? AND u.active=1 AND r.name='店助' ORDER BY u.id", sid);
function slimInbox(u, sid, out) {
  if (u.level !== 'store_manager' || !sid) return out;
  const as = assistOf(sid), keep = [], toA = [], wk = [];
  out.forEach(x => (as && ASSIST_TAGS.includes(x.tag) ? toA : WEEKLY_TAGS.includes(x.tag) ? wk : keep).push(x));
  if (toA.length) keep.push({ tag: '已交店助', lv: 'ok', title: `${toA.length} 项已交店助 ${as.name} 跟进`, sub: [...new Set(toA.map(x => x.tag))].join('、'), link: '#/care', slim: 1 });
  if (wk.length) keep.push({ tag: '本周关注', lv: 'acc', title: `${wk.length} 项每周看一次即可`, sub: wk.map(x => x.title).slice(0, 3).join('；'), link: '#/hrm', slim: 1 });
  return keep;
}
app.get('/api/inbox', (req, res) => {
  const u = req.u, sids = visibleStores(u), sid = Number(req.query.store) || sids[0];
  let out = buildInbox(u, req.query);
  if (u.level === 'store_manager' && req.query.full !== '1') out = slimInbox(u, sid, out);
  if (u.level === 'staff' && u.role_name === '店助' && u.store_id) {
    const sm = D.storeManagers(u.store_id)[0], smu = sm && q1(USER_SQL + ' WHERE u.id=? AND u.active=1', sm);
    if (smu) buildInbox(smu, { store: u.store_id }).filter(x => ASSIST_TAGS.includes(x.tag) && !out.some(o => o.tag === x.tag)).forEach(x => out.push({ ...x, tag: '店长交办·' + x.tag }));
  }
  res.json(out);
});
const BUDGET_MIN = n => (n <= 1 ? 60 : n === 2 ? 90 : 120);
function timeOf(u) {
  const t = L.today(), sids = visibleStores(u);
  const stores = sids.map(sid => {
    const own = q("SELECT need_photo, status FROM instances WHERE store_id=? AND date=? AND assignee_id=?", sid, t, u.id);
    const oth = q1("SELECT COUNT(*) n FROM instances WHERE store_id=? AND date=? AND assignee_id!=?", sid, t, u.id).n;
    const zero = q1("SELECT COUNT(*) n FROM instances i JOIN templates tp ON i.src='tpl' AND tp.id=i.src_id WHERE i.store_id=? AND i.date=? AND tp.tag='清零项' AND i.assignee_id!=?", sid, t, u.id).n;
    const rv = q1("SELECT COUNT(*) n FROM instances WHERE store_id=? AND date=? AND deleg_review=1", sid, t).n;
    const rc = q1("SELECT COUNT(*) n FROM rectifications WHERE store_id=? AND status='submitted'", sid).n;
    const full = buildInbox(u, { store: sid }).filter(x => !['待点评', '待复查'].includes(x.tag));
    const ib = slimInbox(u, sid, full).filter(x => !x.slim).length;
    const ownMin = own.reduce((a, r) => a + (r.need_photo ? 4 : 3), 0);
    const parts = [['本人任务', ownMin], ['风险抽查', Math.min(6, oth)], ['清零项盯办', zero ? 2 : 0], ['授权复核', rv * 2], ['整改复查', rc * 2], ['待我处理', Math.round(ib * 2.5)], ['看板与早会', 10]];
    const before = ownMin + Math.round(oth * 0.3) + zero + rv * 2 + rc * 2 + Math.round(full.length * 2.5) + 10;
    return { sid, name: sname(sid), min: parts.reduce((a, p) => a + p[1], 0), before, left: own.filter(r => r.status === 'pending').length, parts };
  });
  const stg = u.level === 'store_manager' ? stageOf(u.id) : null, total = stores.reduce((a, x) => a + x.min, 0), budget = stg?.budget || BUDGET_MIN(sids.length), tips = [];
  if (total > budget) {
    const agg = {}; stores.forEach(x => x.parts.forEach(([k, v]) => { agg[k] = (agg[k] || 0) + v; }));
    const TIP = { 本人任务: '把基础项按任务授权给店助，自己只复核', 待我处理: '非当天必办的提醒交店助或改为每周看', 授权复核: '对稳定的接手人取消复核要求（清零项除外）', 整改复查: '整改复查交给主管初查，店长只看不合格' };
    Object.entries(agg).filter(([k]) => TIP[k]).sort((a, b) => b[1] - a[1]).slice(0, 2).forEach(([k, v]) => tips.push(`${k}约 ${v} 分钟：${TIP[k]}`));
  }
  return { stage: stg?.l, total, budget, over: total > budget, before: stores.reduce((a, x) => a + x.before, 0), stores, tips };
}
app.get('/api/timebudget', (req, res) => {
  if (req.u.level !== 'store_manager') return deny(res);
  res.json(timeOf(req.u));
});
function riskSample(list, yb, t, n = 6) {
  return list.map(r => {
    const why = []; let sc = hash(t + 'rs' + r.id);
    if (r.tag === '清零项') { sc += 3; why.push('清零项'); }
    if (yb.some(b => b.src === r.src && b.src_id === r.src_id)) { sc += 3; why.push('昨日不合格'); }
    if (r.tag === '关注项') { sc += 2; why.push('关注项'); }
    if (r.need_photo) { sc += 1; why.push('有照片'); }
    return [r, why.join('、') || '随机', sc];
  }).sort((a, b) => b[2] - a[2]).slice(0, n);
}

// ---------- 教练工作台 ----------
function goScore(u, sid, sc, t) {
  const why = []; let s = 0; const x = sc[sid];
  if (x && ['C', 'D'].includes(x.grade)) { s += x.grade === 'D' ? 5 : 3; why.push(`画像 ${x.grade} 级 ${x.total} 分`); }
  if (x && x.drop) { s += 3; why.push(`等级下降 ${x.drop.from}→${x.drop.to}`); }
  const rl = q1("SELECT COUNT(*) n FROM rectifications WHERE store_id=? AND status!='closed' AND deadline<?", sid, t).n; if (rl) { s += Math.min(4, rl); why.push(`整改逾期 ${rl} 条`); }
  const cp = q1("SELECT COUNT(*) n FROM complaints WHERE store_id=? AND status!='closed'", sid).n; if (cp) { s += Math.min(4, cp * 1.5); why.push(`客诉未关 ${cp} 条`); }
  const y = L.addDays(t, -1), mr = q1("SELECT COUNT(*) n, SUM(status='missed') m FROM instances WHERE store_id=? AND date=?", sid, y);
  if (mr.n && mr.m / mr.n > 0.3) { s += 2; why.push(`昨日漏做 ${Math.round(mr.m * 100 / mr.n)}%`); }
  const cr = careOf(sid); if (cr.score < 70) { s += 2; why.push(`员工美好 ${cr.score} 分`); }
  const lp = q1("SELECT MAX(COALESCE(substr(done_at,1,10), planned_date)) d FROM patrols WHERE store_id=? AND status='done'", sid).d;
  const gap = lp ? dBetween(lp, t) : 999; if (gap > 30) { s += 2; why.push(lp ? `${gap} 天未巡` : '从未巡店'); }
  const planned = q1("SELECT planned_date FROM patrols WHERE store_id=? AND status='planned' AND planned_date BETWEEN ? AND ? ORDER BY planned_date", sid, t, L.addDays(t, 7));
  return { sid, name: sname(sid), grade: x && x.grade, score: Math.round(s * 10) / 10, why, last: lp, planned: planned && planned.planned_date };
}
app.get('/api/cdesk', (req, res) => {
  const u = req.u; if (!rmLike(u)) return deny(res);
  const t = L.today(), sids = visibleStores(u), sc = Object.fromEntries(regionScores(u.region_id).all.map(x => [x.id, x]));
  const all = sids.map(sid => goScore(u, sid, sc, t)).filter(g => g.score > 0).sort((a, b) => b.score - a.score);
  const go = all.filter(g => !g.planned).slice(0, 5), watch = all.filter(g => !go.includes(g));
  const qs0 = qStart(t), ms = t.slice(0, 7) + '-01';
  const sms = [...new Set(sids.flatMap(s => D.storeManagers(s)))].map(id => {
    const m = q1(USER_SQL + ' WHERE u.id=? AND u.active=1', id); if (!m) return null;
    const tb = timeOf(m), dg = smDiag(id), st = smStores(id), dl = st.flatMap(delegStats).filter(d => d.sm_id === id);
    const tot = dl.reduce((a, d) => a + d.total, 0), dd = dl.reduce((a, d) => a + d.deleg, 0);
    const lc = q1('SELECT MAX(date) d FROM coach_logs WHERE sm_id=?', id).d, lt = q1("SELECT MAX(date) d FROM care_log WHERE user_id=? AND kind='sm_talk'", id).d;
    const grades = st.map(s => sc[s] && sc[s].grade).filter(Boolean);
    const risk = grades.filter(g => ['C', 'D'].includes(g)).length * 3 + (tb.over ? 2 : 0) + (dg ? Math.max(0, 75 - dg.total) / 5 : 0) + (!lc || dBetween(lc, t) > 30 ? 1 : 0) + (tot && dd * 100 / tot > 50 ? 1 : 0);
    return { id, name: m.name, stage: stageOf(id)?.l, stores: st.map(s => ({ id: s, name: sname(s), grade: sc[s] && sc[s].grade })), time: tb.total, budget: tb.budget, over: tb.over, deleg: tot ? Math.round(dd * 100 / tot) : 0,
      diag: dg && dg.total, weak: dg ? dg.caps.filter(c => dg.weak.includes(c.k)).map(c => c.l).slice(0, 2) : [], last_coach: lc, last_talk: lt, talk_due: (!lt || lt < qs0) && !q1("SELECT 1 x FROM cal_events WHERE kind='店长谈心' AND title LIKE ? AND date>=?", '%#' + id, t), talk_sched: q1("SELECT MIN(date) d FROM cal_events WHERE kind='店长谈心' AND title LIKE ? AND date>=?", '%#' + id, t).d, risk: Math.round(risk * 10) / 10 };
  }).filter(Boolean).sort((a, b) => b.risk - a.risk);
  const LV = { bad: 3, warn: 2, acc: 1, ok: 0 }, grp = {};
  buildInbox(u, {}).forEach(x => { const g = grp[x.tag] || (grp[x.tag] = { tag: x.tag, lv: x.lv, n: 0, items: [] }); g.n++; if (LV[x.lv] > LV[g.lv]) g.lv = x.lv; if (g.items.length < 3) g.items.push(x); });
  const exc = Object.values(grp).sort((a, b) => LV[b.lv] - LV[a.lv] || b.n - a.n);
  const pm = q1("SELECT COUNT(*) n, SUM(status='done') d, COUNT(DISTINCT CASE WHEN status='done' THEN store_id END) c FROM patrols WHERE planned_date>=? AND planned_date<=? AND store_id IN (" + (sids.join(',') || 0) + ')', ms, t.slice(0, 7) + '-31');
  res.json({ stores: sids.length, go, watch: watch.slice(0, 15), watch_n: watch.length, sms, exc,
    cap: { patrol_plan: pm.n, patrol_done: pm.d || 0, covered: pm.c || 0, month_cap: Math.max(1, Math.round(sids.length * 1.5)), talk_due: sms.filter(m => m.talk_due).length, over: sms.filter(m => m.over).length } });
});
app.post('/api/cdesk/autocal', (req, res) => {
  const u = req.u; if (!rmLike(u)) return deny(res);
  const t = L.today(), qs0 = qStart(t), sids = visibleStores(u);
  const due = [...new Set(sids.flatMap(s => D.storeManagers(s)))].filter(id => !q1("SELECT 1 x FROM care_log WHERE user_id=? AND kind='sm_talk' AND date>=?", id, qs0))
    .filter(id => !q1("SELECT 1 x FROM cal_events WHERE kind='店长谈心' AND title LIKE ? AND date>=?", '%#' + id, t));
  let d = t, n = 0; const made = [];
  for (const id of due) {
    while (n >= 2 || [0, 6].includes(new Date(d + 'T00:00:00').getDay())) { d = L.addDays(d, 1); n = 0; }
    const m = q1('SELECT name FROM users WHERE id=?', id), st = smStores(id)[0];
    run('INSERT INTO cal_events(region_id,date,kind,title,store_id,by) VALUES(?,?,?,?,?,?)', u.region_id, d, '店长谈心', `季度谈心：${m.name} #${id}`, st || null, u.id);
    made.push({ date: d, name: m.name }); n++;
  }
  D.audit(u.id, null, '自动排谈心', `${made.length} 位店长`);
  res.json({ ok: true, made });
});

// ---------- patrols ----------
// ---------- 店长任务授权下转 ----------
const rmLike = u => ['region_manager', 'coach'].includes(u.level);
const DELEG_ROLES = ['店助', '前台经理', '客房经理'];
const delegCands = sid => q("SELECT u.id, u.name, r.name role_name FROM users u JOIN roles r ON r.id=u.role_id WHERE u.store_id=? AND u.active=1 AND r.name IN ('店助','前台经理','客房经理') ORDER BY u.id", sid);
function delegStats(sid) {
  const t = L.today(), f = L.addDays(t, -6), sm = D.storeManagers(sid);
  return sm.map(id => {
    const r = q1("SELECT COUNT(*) n, SUM(deleg_id IS NOT NULL) d FROM instances WHERE store_id=? AND orig_assignee_id=? AND date BETWEEN ? AND ?", sid, id, f, L.addDays(t, 7));
    const ds = q("SELECT d.*, u.name to_name FROM delegations d JOIN users u ON u.id=d.to_id WHERE d.store_id=? AND d.from_id=? AND d.active=1 AND d.end>=? ORDER BY d.id DESC", sid, id, t);
    const ratio = r.n ? Math.round((r.d || 0) * 100 / r.n) : 0;
    return { sm_id: id, sm: q1('SELECT name FROM users WHERE id=?', id)?.name, total: r.n, deleg: r.d || 0, ratio, warn: ratio > 50, list: ds };
  });
}
app.get('/api/deleg', (req, res) => {
  const u = req.u, t = L.today();
  if (u.level === 'store_manager') {
    const sid = visibleStores(u).includes(Number(req.query.store)) ? Number(req.query.store) : visibleStores(u)[0];
    const mine = q("SELECT d.*, u.name to_name FROM delegations d JOIN users u ON u.id=d.to_id WHERE d.from_id=? AND d.store_id=? ORDER BY d.active DESC, d.id DESC LIMIT 40", u.id, sid);
    const tasks = q("SELECT src, src_id, title, MIN(due_time) due_time FROM instances WHERE store_id=? AND orig_assignee_id=? AND date>=? GROUP BY src, src_id ORDER BY due_time", sid, u.id, L.addDays(t, -7));
    const stg = stageOf(u.id);
    return res.json({ mode: 'sm', stage: stg && { k: stg.k, l: stg.l, perm: stg.perm }, appr: stg?.k === 'multi' ? neg1(sid) : null, store_id: sid, mine, tasks, cands: delegCands(sid), stats: delegStats(sid).find(x => x.sm_id === u.id) || null });
  }
  if (!['region_manager', 'ops_manager', 'coach'].includes(u.level)) return deny(res);
  res.json({ mode: 'view', stores: visibleStores(u).map(sid => ({ id: sid, name: sname(sid), sms: delegStats(sid) })) });
});
app.post('/api/deleg', (req, res) => {
  const u = req.u, b = req.body || {}, t = L.today();
  if (u.level !== 'store_manager') return deny(res, '只有店长可以授权下转自己的任务');
  const scope = ['one', 'task', 'all', 'appr'].includes(b.scope) ? b.scope : null;
  if (!scope) return err(res, '请选择授权范围');
  const stg = stageOf(u.id);
  if (stg && !stg.scopes.includes(scope)) return err(res, `${stg.l}：${stg.perm}`);
  if (scope === 'appr') return delegAppr(res, u, b);
  let sid = Number(b.store_id), start = b.start || t, end = b.end || start, src = null, src_id = null, inst = null, title = '';
  if (scope === 'one') {
    inst = q1('SELECT * FROM instances WHERE id=?', b.inst_id);
    if (inst?.deleg_id) return err(res, '该任务已授权');
    if (!inst || inst.assignee_id !== u.id) return err(res, '只能授权自己名下的任务');
    if (inst.status !== 'pending' || inst.date < t) return err(res, '只能授权今天及以后未完成的任务');
    sid = inst.store_id; start = end = inst.date; title = inst.title;
  }
  if (!visibleStores(u).includes(sid) || !canManage(u, sid)) return deny(res);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start < t || end < start) return err(res, '请填写正确的起止日期（不早于今天）');
  if (end > L.addDays(start, scope === 'all' ? 30 : 90)) return err(res, scope === 'all' ? '整体授权最长 30 天' : '按任务授权最长 90 天');
  if (scope === 'task') {
    const x = q1("SELECT src, src_id, title FROM instances WHERE store_id=? AND orig_assignee_id=? AND src=? AND src_id=? LIMIT 1", sid, u.id, b.src, b.src_id);
    if (!x) return err(res, '只能授权自己负责的任务');
    src = x.src; src_id = x.src_id; title = x.title;
  }
  if (scope === 'all') title = '全部亲做任务';
  const to = q1('SELECT u.*, r.name role_name FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=? AND u.active=1', b.to_id);
  if (!to || to.store_id !== sid || !DELEG_ROLES.includes(to.role_name)) return err(res, '只能授权给本店在职的店助或主管');
  if (stg?.must && scope !== 'all' && isMust(title) && to.reserve !== 'sm') return err(res, '单店店长的必做项（' + MUST_KW.join('、') + '）只能授权给店内储备店长');
  if (stg?.cap && scope === 'task') { const s0 = delegStats(sid).find(x => x.sm_id === u.id); if (s0 && s0.ratio >= stg.cap) return err(res, `${stg.l}转出比例上限 ${stg.cap}%，当前 ${s0.ratio}%`); }
  if (scope === 'one' && q1('SELECT 1 FROM leaves WHERE user_id=? AND date=?', to.id, start)) return err(res, `${to.name} 当天休息，请换人`);
  const id = Number(run('INSERT INTO delegations(store_id,from_id,to_id,scope,inst_id,src,src_id,title,start,end,review,active,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,1,?)',
    sid, u.id, to.id, scope, inst?.id || null, src, src_id, title, start, end, b.review === false || b.review === 0 ? 0 : 1, L.nowStr()).lastInsertRowid);
  for (let d = start; d <= end && d <= L.addDays(t, 30); d = L.addDays(d, 1)) { D.ensureInstances(d, [sid]); D.applyDeleg(d); }
  const n = q1('SELECT COUNT(*) n FROM instances WHERE deleg_id=?', id).n;
  D.notify([to.id], 'assign', '店长授权任务', `${u.name} 将「${title}」授权给你（${start}${end !== start ? ' 至 ' + end : ''}）`, '#/my');
  D.audit(u.id, sid, '任务授权下转', `${title} → ${to.name} ${start}~${end}`);
  res.json({ ok: true, id, n });
});
app.post('/api/deleg/:id/revoke', (req, res) => {
  const d = q1('SELECT * FROM delegations WHERE id=?', req.params.id);
  if (!d || d.from_id !== req.u.id) return deny(res, '只有授权的店长本人可以撤销');
  if (!d.active) return err(res, '该授权已撤销');
  const n = run("UPDATE instances SET assignee_id=?, deleg_id=NULL, deleg_review=NULL WHERE deleg_id=? AND status='pending' AND date>=?", d.from_id, d.id, L.today()).changes;
  run('UPDATE delegations SET active=0, revoked_at=? WHERE id=?', L.nowStr(), d.id);
  D.notify([d.to_id], 'assign', '店长收回授权', `「${d.title}」已收回，未完成的 ${n} 项回到店长`, '#/my');
  D.audit(req.user?.id || req.u.id, d.store_id, '撤销任务授权', d.title);
  res.json({ ok: true, n });
});

// ---------- 巡店筛选 ----------
const PF_OPS = { 早餐差: ['早餐', '补餐', '菜品', '餐厅'], 卫生差: ['卫生', '头发', '污渍', '打扫', '清洁', '异味'], 隔音差: ['隔音', '噪音', '吵'], 服务态度: ['态度', '服务', '冷淡', '不耐烦'], 设施故障: ['空调', '维修', '失灵', '漏水', '热水', '坏'], 前台等待: ['等待', '排队', '入住慢'] };
const PF_SCENE = { 早餐差: '餐厅', 卫生差: '客房', 隔音差: '客房', 服务态度: '前台', 前台等待: '前台', 设施故障: '后场' };
const PF_GROUPS = [['运营', Object.keys(PF_OPS), null], ['经营', ['RevPAR 偏低', '预算未达成', 'MPI 偏低', '统购率低'], 'biz'], ['加盟商', ['业主诉求未关', '管理费逾期', '合同快到期', '业主满意度低'], 'biz'], ['团队', ['满编率低', '离职率高', '关键岗空缺', '员工美好分低', '执行率低'], 'hrm']];
function pfEvidence(sid, terms, from, to) {
  if (!terms.length) return [];
  const lk = c => '(' + terms.map(() => `${c} LIKE ?`).join(' OR ') + ')', A = terms.map(x => '%' + x + '%');
  const ev = [];
  q(`SELECT substr(created_at,1,10) d, src, body FROM complaints WHERE store_id=? AND substr(created_at,1,10) BETWEEN ? AND ? AND ${lk('body')} ORDER BY created_at DESC`, sid, from, to, ...A).forEach(x => ev.push({ src: '客诉', d: x.d, text: `${x.src}：${x.body}` }));
  q(`SELECT date d, title, check_comment c FROM instances WHERE store_id=? AND check_result='bad' AND date BETWEEN ? AND ? AND ${lk("(title||' '||COALESCE(check_comment,''))")} ORDER BY date DESC`, sid, from, to, ...A).forEach(x => ev.push({ src: '抽查不合格', d: x.d, text: `${x.title}：${x.c || ''}` }));
  q(`SELECT substr(p.done_at,1,10) d, pi.item, pi.comment FROM patrol_items pi JOIN patrols p ON p.id=pi.patrol_id WHERE p.store_id=? AND pi.result='fail' AND substr(p.done_at,1,10) BETWEEN ? AND ? AND ${lk("(COALESCE(pi.item,'')||' '||COALESCE(pi.comment,''))")}`, sid, from, to, ...A).forEach(x => ev.push({ src: '巡店不达标', d: x.d, text: `${x.item || ''}：${x.comment || ''}` }));
  q(`SELECT substr(created_at,1,10) d, title, location FROM repairs WHERE store_id=? AND substr(created_at,1,10) BETWEEN ? AND ? AND ${lk("(COALESCE(title,'')||' '||COALESCE(body,'')||' '||COALESCE(location,''))")}`, sid, from, to, ...A).forEach(x => ev.push({ src: '报修', d: x.d, text: `${x.location || ''} ${x.title}` }));
  q(`SELECT title, COUNT(*) n, MAX(date) d FROM instances WHERE store_id=? AND status='missed' AND date BETWEEN ? AND ? AND ${lk('title')} GROUP BY src, src_id`, sid, from, to, ...A).forEach(x => ev.push({ src: '漏做', d: x.d, text: `${x.title} 漏做 ${x.n} 次` }));
  return ev;
}
const PF_W = { 客诉: 3, 抽查不合格: 2, 巡店不达标: 2, 报修: 1, 漏做: 0.5 };
function pfMetric(sid, tag) {
  const one = (hit, text) => hit ? [{ src: '指标', d: L.today(), text }] : [];
  try {
    if (['RevPAR 偏低', '预算未达成', 'MPI 偏低'].includes(tag)) { const b = storeBiz(sid);
      if (tag === 'RevPAR 偏低') return one(b.week.revpar_delta < -3, `近 7 日 RevPAR 环比 ${b.week.revpar_delta}%`);
      if (tag === '预算未达成') return one(b.budget.forecast_pct < 98, `月底预计完成预算 ${b.budget.forecast_pct}%`);
      return one(b.week.mpi < 100, `近 7 日 MPI ${b.week.mpi}`); }
    if (tag === '统购率低') { const p = procOf(sid); return one(p.rate != null && p.rate < p.target, `统购率 ${p.rate}%（目标 ${p.target}%）`); }
    if (['业主诉求未关', '管理费逾期', '合同快到期', '业主满意度低'].includes(tag)) { if (!isFr(sid)) return [];
      if (tag === '业主诉求未关') { const n = q1("SELECT COUNT(*) n FROM owner_reqs WHERE store_id=? AND status='open'", sid).n; return one(n > 0, `业主诉求未关闭 ${n} 条`); }
      const f = franchiseOf(sid);
      if (tag === '管理费逾期') return one(f.arrears > 0, `管理费逾期 ${f.arrears} 万元`);
      if (tag === '合同快到期') return one(f.contract.days <= 365, `特许合同剩余 ${f.contract.days} 天`);
      return one(f.sat < 80, `业主满意度 ${f.sat} 分`); }
    if (tag === '员工美好分低') { const c = careOf(sid); return one(c.score < 75, `员工美好分 ${c.score}`); }
    if (tag === '执行率低') { const s = storeStats([sid], L.addDays(L.today(), -7), L.addDays(L.today(), -1))[0]; return one(s && s.rate != null && s.rate < 85, `近 7 日任务完成率 ${s?.rate}%`); }
    const h = hrStats(sid), kv = Array.isArray(h.key_vac) ? h.key_vac.length : Number(h.key_vac) || 0;
    if (tag === '满编率低') return one(h.fill < 90, `满编率 ${h.fill}%`);
    if (tag === '离职率高') return one(h.m_rate > 5, `月离职率 ${h.m_rate}%`);
    if (tag === '关键岗空缺') return one(kv > 0, `关键岗空缺 ${kv} 个`);
  } catch { return []; }
  return [];
}
function pickPatrolDate(period) {
  const t = L.today(); let a = t, b = t;
  if (period === 'week') { b = L.addDays(t, 7 - L.weekday(t)); a = b > t ? L.addDays(t, 1) : t; }
  if (period === 'month') { b = L.addDays(L.addDays(t.slice(0, 8) + '01', 32).slice(0, 8) + '01', -1); a = b > t ? L.addDays(t, 1) : t; }
  let best = a, bn = 1e9;
  for (let d = a; d <= b; d = L.addDays(d, 1)) { const n = q1("SELECT COUNT(*) n FROM patrols WHERE planned_date=? AND status='planned'", d).n; if (n < bn) { bn = n; best = d; } }
  return best;
}
app.get('/api/patrol-find', (req, res) => {
  if (!['region_manager', 'ops_manager', 'coach'].includes(req.u.level)) return deny(res);
  const t = L.today(), days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30, from = L.addDays(t, -days);
  const tag = String(req.query.tag || ''), kw = String(req.query.q || '').trim().slice(0, 40);
  const groups = PF_GROUPS.filter(g => !g[2] || daCan(req.u, g[2])).map(([l, tags]) => ({ l, tags }));
  const metric = groups.some(g => g.l !== '运营' && g.tags.includes(tag));
  const terms = PF_OPS[tag] || (metric ? [] : kw ? kw.split(/[\s,，、]+/).filter(Boolean).slice(0, 6) : []);
  const scores = regionScores(req.u.region_id).all;
  const rows = visibleStores(req.u).map(sid => {
    const ev = metric ? pfMetric(sid, tag) : pfEvidence(sid, terms, from, t);
    const n = {}; ev.forEach(e => { n[e.src] = (n[e.src] || 0) + 1; });
    const score = metric ? ev.length * 5 : Math.round(Object.entries(n).reduce((a, [k, v]) => a + (PF_W[k] || 1) * v, 0));
    const last = q1("SELECT done_at, score FROM patrols WHERE store_id=? AND status='done' AND COALESCE(kind,'patrol')='patrol' ORDER BY done_at DESC LIMIT 1", sid);
    const planned = q1("SELECT planned_date FROM patrols WHERE store_id=? AND status='planned' ORDER BY planned_date LIMIT 1", sid);
    return { id: sid, name: sname(sid), grade: scores.find(x => x.id === sid)?.grade || '-', n, score, ev: ev.slice(0, 6), last, planned, stale: !last || last.done_at.slice(0, 10) < L.addDays(t, -30) };
  }).filter(r => (!(terms.length || metric) || r.score > 0) && (!req.query.grade || 'CD'.includes(r.grade)) && (!req.query.stale || r.stale) && (!req.query.unplanned || !r.planned))
    .sort((a, b) => b.score - a.score);
  res.json({ groups, tag, q: kw, days, scene: PF_SCENE[tag] || null, rows, can_plan: rmLike(req.u) });
});
app.get('/api/patrol-track', (req, res) => {
  if (!['region_manager', 'ops_manager', 'coach'].includes(req.u.level)) return deny(res);
  const t = L.today(), sids = visibleStores(req.u), ph = sids.map(() => '?').join(',');
  const ws = L.addDays(t, -(L.weekday(t) - 1)), ms = t.slice(0, 8) + '01', me = L.addDays(L.addDays(ms, 32).slice(0, 8) + '01', -1);
  const per = (a, b) => { const r = q1(`SELECT COUNT(*) n, SUM(status='done') d, SUM(status='planned' AND planned_date<?) od FROM patrols WHERE store_id IN (${ph}) AND COALESCE(kind,'patrol')!='recheck' AND planned_date BETWEEN ? AND ?`, t, ...sids, a, b);
    return { n: r.n, done: r.d || 0, overdue: r.od || 0, rate: r.n ? Math.round((r.d || 0) * 100 / r.n) : null }; };
  const cov = q1(`SELECT COUNT(DISTINCT store_id) n FROM patrols WHERE store_id IN (${ph}) AND status='done' AND COALESCE(kind,'patrol')='patrol' AND substr(done_at,1,10)>=?`, ...sids, ms).n;
  const effect = q(`SELECT p.id, p.store_id, p.focus, substr(p.done_at,1,10) d FROM patrols p WHERE p.store_id IN (${ph}) AND p.status='done' AND p.focus IS NOT NULL AND substr(p.done_at,1,10)>=? ORDER BY p.done_at DESC LIMIT 20`, ...sids, L.addDays(t, -60))
    .map(p => { const terms = PF_OPS[p.focus] || p.focus.split(/[\s,，、]+/).filter(Boolean);
      const before = pfEvidence(p.store_id, terms, L.addDays(p.d, -14), L.addDays(p.d, -1)).length, after = pfEvidence(p.store_id, terms, L.addDays(p.d, 1), L.addDays(p.d, 14)).length;
      return { ...p, store: sname(p.store_id), before, after, days_after: Math.min(14, Math.round((Date.parse(t) - Date.parse(p.d)) / 864e5)) }; });
  res.json({ day: per(t, t), week: per(ws, L.addDays(ws, 6)), month: per(ms, me), coverage: { done: cov, total: sids.length }, effect, ranges: { day: [t, t], week: [ws, L.addDays(ws, 6)], month: [ms, me] } });
});

app.get('/api/patrols', (req, res) => {
  const sids = visibleStores(req.u);
  if (!sids.length) return res.json([]);
  res.json(q(`SELECT p.*, st.name store_name, u.name creator_name FROM patrols p JOIN stores st ON st.id=p.store_id LEFT JOIN users u ON u.id=p.created_by
    WHERE p.store_id IN (${sids.map(() => '?').join(',')})${isRegion(req.u) ? '' : " AND NOT (p.kind='mystery' AND p.status='planned')"} ORDER BY p.status='done', CASE WHEN p.status='done' THEN p.done_at END DESC, p.planned_date`, ...sids));
});
app.get('/api/patrols/:id', (req, res) => {
  const p = q1('SELECT p.*, st.name store_name FROM patrols p JOIN stores st ON st.id=p.store_id WHERE p.id=?', req.params.id);
  if (!p || !visibleStores(req.u).includes(p.store_id) || (p.kind === 'mystery' && p.status === 'planned' && !isRegion(req.u))) return deny(res);
  const items = q(`SELECT pi.*, s.name scene_name, r.status rect_status, r.deadline rect_deadline, au.name rect_assignee FROM patrol_items pi LEFT JOIN scenes s ON s.id=pi.scene_id
    LEFT JOIN rectifications r ON r.id=pi.rect_id LEFT JOIN users au ON au.id=r.assignee_id WHERE patrol_id=? ORDER BY pi.id`, p.id);
  const focus = q("SELECT id, title, active FROM flex_tasks WHERE ref=?", 'patrol:' + p.id);
  const recheck = q1("SELECT id, planned_date, status, done_at, score FROM patrols WHERE parent_id=? ORDER BY id DESC LIMIT 1", p.id);
  const parent = p.parent_id ? q1('SELECT id, done_at, score FROM patrols WHERE id=?', p.parent_id) : null;
  res.json({ ...p, pf_focus: p.focus, items, focus, recheck, parent, owner: isFr(p.store_id) ? OWNERS[p.store_id]?.[0] || '业主' : null, recheck_days: cfg().recheck_days });
});
app.post('/api/patrols', (req, res) => {
  if (!rmLike(req.u)) return deny(res, '巡店计划由区域经理或教练制定');
  const { store_id, reason } = req.body, kind = req.body.kind === 'mystery' ? 'mystery' : 'patrol';
  let planned_date = req.body.planned_date;
  if (!visibleStores(req.u).includes(Number(store_id))) return deny(res);
  if (['day', 'week', 'month'].includes(req.body.period)) planned_date = pickPatrolDate(req.body.period);
  if (!store_id || !/^\d{4}-\d{2}-\d{2}$/.test(planned_date || '')) return err(res, '请选择门店和巡店日期');
  if (planned_date < L.today()) return err(res, '巡店日期不能早于今天');
  if (q1("SELECT 1 FROM patrols WHERE store_id=? AND planned_date=? AND status='planned' AND COALESCE(kind,'patrol')=?", store_id, planned_date, kind)) return err(res, `${sname(Number(store_id))} ${planned_date} 已在巡店计划中`);
  const focus = String(req.body.focus || '').slice(0, 40) || null;
  const id = Number(run("INSERT INTO patrols(store_id,planned_date,reason,status,created_by,created_at,kind,focus) VALUES(?,?,?,'planned',?,?,?,?)", store_id, planned_date, String(reason || '').slice(0, 300), req.u.id, L.nowStr(), kind, focus).lastInsertRowid);
  const sameDay = q1("SELECT COUNT(*) n FROM patrols WHERE created_by=? AND planned_date=? AND status='planned'", req.u.id, planned_date).n;
  res.locals.extra = { planned_date, warn: sameDay > 3 ? `${planned_date} 已安排 ${sameDay} 家店，行程可能过紧` : '' };
  const store = q1('SELECT name FROM stores WHERE id=?', store_id).name;
  if (kind === 'mystery') { D.audit(req.u.id, store_id, '安排神秘访客', planned_date); return res.json({ ok: true, id, ...res.locals.extra }); }
  D.notify(D.storeManagers(store_id), 'patrol', '区域经理巡店计划', `${planned_date} 巡店 ${store}：${reason || '例行巡店'}`, '#/patrol');
  D.audit(req.u.id, store_id, '加入巡店计划', `${planned_date} ${reason || ''}`);
  res.json({ ok: true, id, ...res.locals.extra });
});
app.post('/api/patrols/:id/complete', (req, res) => {
  const p = q1('SELECT * FROM patrols WHERE id=?', req.params.id);
  const recheck = p?.kind === 'recheck', mystery = p?.kind === 'mystery';
  if (!p || p.status !== 'planned' || !visibleStores(req.u).includes(p.store_id) || !(rmLike(req.u) || ((recheck || mystery) && req.u.level === 'ops_manager'))) return deny(res);
  const res0 = req.body.results || {}, mode = recheck ? 'recheck' : mystery ? 'mystery' : ['quick', 'scene'].includes(req.body.mode) ? req.body.mode : 'full';
  const all = q("SELECT * FROM templates WHERE src='audit' AND active=1 ORDER BY code");
  const want = recheck ? new Set((p.codes || '').split(',')) : mode === 'full' ? null : new Set(Object.keys(res0));
  const tpls = want ? all.filter(t => want.has(String(t.code))) : all;
  if (!tpls.length) return err(res, '请至少检查一项');
  const C = cfg(), t = L.today(), now = L.nowStr(), rectTo = new Set();
  let earned = 0, max = 0, pass = 0; const zero = [], fails = [];
  D.tx(() => {
    run('DELETE FROM patrol_items WHERE patrol_id=?', p.id);
    for (const tp of tpls) {
      const r = res0[tp.code] || {};
      const result = ['pass', 'fail', 'na'].includes(r.result) ? r.result : 'pass';
      const mx = /^\d+$/.test(tp.score) ? Number(tp.score) : 0, cm = (r.comment || '').trim();
      if (result === 'fail' && !cm) throw new Error(`第 ${tp.code} 条「${tp.title}」不达标，请写明问题`);
      if (result !== 'na') { max += mx; if (result === 'pass') { earned += mx; pass++; } }
      if (result === 'fail') { fails.push(tp.code); if (tp.tag === '清零项') zero.push(tp.code); }
      let rect = null;
      if (result === 'fail' && !recheck && r.rect !== false) {
        const owner = q1('SELECT user_id FROM scene_owners WHERE store_id=? AND scene_id=?', p.store_id, tp.scene_id)?.user_id || D.storeManagers(p.store_id)[0];
        rect = Number(run(`INSERT INTO rectifications(instance_id,store_id,assignee_id,reason,training,task,deadline,status,created_by,created_at,source,title,ref) VALUES(NULL,?,?,?,?,?,?,'open',?,?,'patrol',?,?)`,
          p.store_id, owner, cm, '', `按品牌标准 No.${tp.code} 整改：${tp.title}，完成后拍照提交`, L.addDays(t, Math.max(1, C.recheck_days - 2)), req.u.id, now, `巡店 No.${tp.code} ${tp.title}`, 'patrol:' + p.id).lastInsertRowid);
        rectTo.add(owner);
      }
      run('INSERT INTO patrol_items(patrol_id,scene_id,item,score,max,comment,code,tag,result,photo,rect_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)', p.id, tp.scene_id, tp.title,
        result === 'pass' ? mx : 0, mx, cm, tp.code, tp.tag, result, savePhoto(r.photo), rect);
      if (recheck) {
        run('UPDATE patrol_items SET recheck=?, recheck_comment=? WHERE patrol_id=? AND code=?', result, cm, p.parent_id, tp.code);
        const rid = q1('SELECT rect_id FROM patrol_items WHERE patrol_id=? AND code=?', p.parent_id, tp.code)?.rect_id;
        if (rid && result === 'pass') run("UPDATE rectifications SET status='closed', verify_comment='巡店复查通过', verified_by=?, verified_at=? WHERE id=? AND status!='closed'", req.u.id, now, rid);
        if (rid && result === 'fail') run("UPDATE rectifications SET status='open', deadline=?, verify_comment=?, verified_by=?, verified_at=?, escalated=0 WHERE id=?", L.addDays(t, 3), '巡店复查未通过：' + cm, req.u.id, now, rid);
      }
    }
    const judged = tpls.filter(tp => (res0[tp.code] || {}).result !== 'na').length;
    const score = recheck ? Math.round(pass * 100 / (judged || 1)) : zero.length ? 0 : Math.round(earned * 100 / (max || 1));
    run("UPDATE patrols SET status='done', score=?, summary=?, done_at=?, mode=?, owner_sent=? WHERE id=?", score, req.body.summary || '', now, mode, !recheck && isFr(p.store_id) ? now : null, p.id);
    if (recheck) run('UPDATE patrols SET recheck_result=? WHERE id=?', `${pass}/${tpls.length} 项通过`, p.parent_id);
    else if (fails.length) run("INSERT INTO patrols(store_id,planned_date,reason,status,created_by,created_at,kind,parent_id,codes) VALUES(?,?,?,'planned',?,?,'recheck',?,?)",
      p.store_id, L.addDays(t, C.recheck_days), `复查上次巡店 ${fails.length} 项不达标`, req.u.id, now, p.id, fails.join(','));
  });
  const sm = D.storeManagers(p.store_id), ops = D.regionUsers(req.u.region_id, 'ops_manager');
  if (recheck) D.notify([...sm, ...D.regionUsers(req.u.region_id, 'region_manager')], 'patrol', `巡店复查完成：${pass}/${tpls.length} 项通过`, req.body.summary || '', '#/patrol/' + p.parent_id);
  else {
    D.notify([...sm, ...ops], 'patrol', mystery ? '神秘访客检查结果' : zero.length ? '巡店报告：触发清零项' : '巡店报告已出', `${req.body.summary || ''}${fails.length ? `（不达标 ${fails.length} 项已生成整改，${L.addDays(t, C.recheck_days)} 复查）` : ''}`, '#/patrol/' + p.id);
    if (rectTo.size) D.notify([...rectTo], 'rectify', '巡店整改任务', `${sname(p.store_id)} 巡店不达标项已指派给你，请按期整改并拍照提交`, '#/my-rect');
  }
  D.audit(req.u.id, p.store_id, recheck ? '完成巡店复查' : '完成巡店', req.body.summary || '');
  res.json({ ok: true });
});
app.delete('/api/patrols/:id', (req, res) => {
  const p = q1('SELECT * FROM patrols WHERE id=?', req.params.id);
  if (!p || !rmLike(req.u) || p.status !== 'planned') return deny(res);
  run('DELETE FROM patrols WHERE id=?', p.id);
  D.audit(req.u.id, p.store_id, '取消巡店计划', p.planned_date);
  res.json({ ok: true });
});

// ---------- score config ----------
app.get('/api/score-cfg', (req, res) => {
  if (req.u.level === 'staff') return deny(res);
  res.json({ cfg: cfg(), def: CFG_DEF, dims: STORE_DIM_BASE });
});
app.post('/api/score-cfg', (req, res) => {
  if (!rmLike(req.u)) return deny(res, '仅区域经理或教练可修改');
  const b = req.body || {};
  if (b.reset) { D.setSetting('score_cfg', {}); CFG_CACHE = null; D.audit(req.u.id, null, '评价口径', '恢复默认'); return res.json({ ok: true }); }
  const o = {};
  for (const [k, v] of Object.entries(CFG_DEF)) {
    if (typeof v === 'object') { o[k] = {}; for (const kk of Object.keys(v)) o[k][kk] = Number(b[k]?.[kk] ?? v[kk]); }
    else o[k] = Number(b[k] ?? v);
  }
  const vals = Object.values(o).flatMap(v => (typeof v === 'object' ? Object.values(v) : [v]));
  if (vals.some(v => !Number.isFinite(v) || v < 0 || v > 1000)) return err(res, '请填写 0 以上的数字');
  const sum = x => Object.values(x).reduce((a, v) => a + v, 0);
  if (sum(o.dims) !== 100) return err(res, `门店画像六项权重合计须为 100（当前 ${sum(o.dims)}）`);
  if (sum(o.mgr) !== 100) return err(res, `店长综合分四项权重合计须为 100（当前 ${sum(o.mgr)}）`);
  const g = o.grades;
  if (!(g.S <= 100 && g.S > g.A && g.A > g.B && g.B > g.C)) return err(res, '等级分数线须满足 100 ≥ S > A > B > C');
  if (o.type_th > 100 || o.reno_years < 1 || o.plan_days < 1 || o.recheck_days < 1 || Object.values(o.sla).some(v => v <= 0)) return err(res, '阈值超出范围');
  D.setSetting('score_cfg', o); CFG_CACHE = null;
  D.audit(req.u.id, null, '评价口径', JSON.stringify(o).slice(0, 200));
  res.json({ ok: true });
});

// ---------- repairs ----------
const RP_URG = { urgent: '紧急', normal: '一般', low: '不急' };
const addHours = (str, h) => new Date(Date.parse(str.replace(' ', 'T') + ':00Z') + h * 36e5).toISOString().slice(0, 16).replace('T', ' ');
const hoursBetween = (a, b) => (Date.parse(b.replace(' ', 'T') + ':00Z') - Date.parse(a.replace(' ', 'T') + ':00Z')) / 36e5;
const engineersOf = sid => q("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.store_id=? AND u.active=1 AND r.name='工程'", sid).map(x => x.id);
const isEng = u => u.role_name === '工程';
const repairLate = sid => q1("SELECT COUNT(*) n FROM repairs WHERE store_id=? AND status IN ('open','accepted') AND due_at<?", sid, L.nowStr()).n;
function repairStats(sid) {
  const n = st => q1(`SELECT COUNT(*) n FROM repairs WHERE store_id=? AND status IN (${st.map(() => '?').join(',')})`, sid, ...st).n;
  const cl = q("SELECT created_at, done_at, due_at, rating FROM repairs WHERE store_id=? AND status='closed' AND created_at>=?", sid, L.addDays(L.today(), -30));
  const avg = xs => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 10) / 10 : null);
  return { open: n(['open', 'accepted']), late: repairLate(sid), confirm: n(['done']), closed30: cl.length, avg_h: avg(cl.map(x => hoursBetween(x.created_at, x.done_at))),
    ontime: cl.length ? Math.round(cl.filter(x => x.done_at <= x.due_at).length * 100 / cl.length) : null, rating: avg(cl.filter(x => x.rating).map(x => x.rating)) };
}
const RP_SQL = `SELECT p.*, s.name store_name, c.name creator_name, a.name assignee_name FROM repairs p JOIN stores s ON s.id=p.store_id
  LEFT JOIN users c ON c.id=p.created_by LEFT JOIN users a ON a.id=p.assignee_id`;
function rpOut(u, x) {
  const mgr = canManage(u, x.store_id), sup = mgr || (u.level === 'ops_manager' && visibleStores(u).includes(x.store_id));
  const eng = isEng(u) && u.store_id === x.store_id, mine = x.created_by === u.id;
  return { ...x, log: JSON.parse(x.log || '[]'), late: ['open', 'accepted'].includes(x.status) && x.due_at < L.nowStr(), urgency_label: RP_URG[x.urgency] || x.urgency,
    can: { accept: x.status === 'open' && (eng || mgr), done: x.status === 'accepted' && (x.assignee_id === u.id || sup), confirm: x.status === 'done' && (mine || mgr), assign: ['open', 'accepted'].includes(x.status) && mgr } };
}
function rpVisible(u, x) {
  if (!x || !visibleStores(u).includes(x.store_id)) return false;
  return u.level !== 'staff' || isEng(u) || x.created_by === u.id || LEADS[u.role_name];
}
const rpLog = (x, u, act, note) => JSON.stringify([...JSON.parse(x.log || '[]'), { at: L.nowStr(), by: u.name, act, note: note || '' }]);
app.get('/api/repairs', (req, res) => {
  const u = req.u, sids = visibleStores(u).filter(s => !req.query.store || s === Number(req.query.store));
  if (!sids.length) return res.json({ list: [], engineers: [] });
  const rows = q(RP_SQL + ` WHERE p.store_id IN (${sids.map(() => '?').join(',')}) ORDER BY CASE p.status WHEN 'open' THEN 0 WHEN 'accepted' THEN 1 WHEN 'done' THEN 2 ELSE 3 END, p.due_at, p.id DESC LIMIT 200`, ...sids);
  res.json({ list: rows.filter(x => rpVisible(u, x)).map(x => rpOut(u, x)), stats: sids.length === 1 ? repairStats(sids[0]) : null, sla: cfg().sla, urg: RP_URG,
    engineers: q(USER_SQL + ` WHERE u.active=1 AND u.store_id IN (${sids.map(() => '?').join(',')}) AND r.level='staff'`, ...sids).map(x => ({ id: x.id, name: x.name, role_name: x.role_name, store_id: x.store_id })) });
});
app.get('/api/repairs/:id', (req, res) => {
  const x = q1(RP_SQL + ' WHERE p.id=?', req.params.id);
  if (!rpVisible(req.u, x)) return deny(res);
  res.json(rpOut(req.u, x));
});
app.post('/api/repairs', (req, res) => {
  const u = req.u, b = req.body || {}, sid = u.level === 'staff' ? u.store_id : Number(b.store_id);
  if (!sid || !visibleStores(u).includes(sid)) return deny(res);
  if (!(b.title || '').trim() || !(b.location || '').trim()) return err(res, '请填写报修位置和问题');
  const urg = RP_URG[b.urgency] ? b.urgency : 'normal', now = L.nowStr(), eng = engineersOf(sid);
  const id = Number(run('INSERT INTO repairs(store_id,location,title,body,urgency,photo,status,created_by,created_at,due_at,assignee_id,log) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    sid, b.location.trim(), b.title.trim(), b.body || '', urg, savePhoto(b.photo), 'open', u.id, now, addHours(now, cfg().sla[urg]), eng[0] || null, JSON.stringify([{ at: now, by: u.name, act: '报修', note: b.title.trim() }])).lastInsertRowid);
  D.notify(urg === 'urgent' ? [...eng, ...D.storeManagers(sid)] : eng, 'repair', `${RP_URG[urg]}报修：${b.title.trim()}`, `${b.location.trim()} · ${u.name} 报修，${cfg().sla[urg]} 小时内修复`, '#/repair/' + id);
  D.audit(u.id, sid, '工程报修', b.title.trim());
  res.json({ ok: true, id });
});
app.post('/api/repairs/:id/:op', (req, res) => {
  const u = req.u, x0 = q1(RP_SQL + ' WHERE p.id=?', req.params.id), op = req.params.op, b = req.body || {};
  if (!rpVisible(u, x0)) return deny(res);
  const x = rpOut(u, x0), now = L.nowStr();
  if (op === 'accept' && x.can.accept) {
    run("UPDATE repairs SET status='accepted', assignee_id=?, accepted_at=?, log=? WHERE id=?", isEng(u) ? u.id : x.assignee_id || u.id, now, rpLog(x0, u, '接单'), x.id);
    D.notify([x.created_by], 'repair', `报修已接单：${x.title}`, `${u.name} 已接单处理`, '#/repair/' + x.id);
  } else if (op === 'done' && x.can.done) {
    if (!(b.note || '').trim()) return err(res, '请说明维修情况');
    run("UPDATE repairs SET status='done', done_at=?, done_note=?, done_photo=COALESCE(?, done_photo), log=? WHERE id=?", now, b.note.trim(), savePhoto(b.photo), rpLog(x0, u, '完成维修', b.note.trim()), x.id);
    D.notify([x.created_by], 'repair', `报修已修好，请确认：${x.title}`, b.note.trim(), '#/repair/' + x.id);
  } else if (op === 'confirm' && x.can.confirm) {
    const rating = Math.max(1, Math.min(5, Number(b.rating) || 5));
    run("UPDATE repairs SET status='closed', closed_at=?, rating=?, log=? WHERE id=?", now, rating, rpLog(x0, u, '确认关单', `评价 ${rating} 星 ${b.note || ''}`), x.id);
    D.notify([x.assignee_id].filter(Boolean), 'repair', `报修已确认关单：${x.title}`, `评价 ${rating} 星`, '#/repair/' + x.id);
  } else if (op === 'reject' && x.can.confirm) {
    if (!(b.note || '').trim()) return err(res, '请说明未修好的情况');
    run("UPDATE repairs SET status='accepted', done_at=NULL, log=? WHERE id=?", rpLog(x0, u, '退回重修', b.note.trim()), x.id);
    D.notify([x.assignee_id].filter(Boolean), 'repair', `报修被退回：${x.title}`, b.note.trim(), '#/repair/' + x.id);
  } else if (op === 'assign' && x.can.assign) {
    const to = q1(USER_SQL + ' WHERE u.id=? AND u.active=1', b.user_id);
    if (!to || to.store_id !== x.store_id) return err(res, '请选择本店人员');
    run("UPDATE repairs SET assignee_id=?, status='accepted', accepted_at=COALESCE(accepted_at, ?), log=? WHERE id=?", to.id, now, rpLog(x0, u, '指派', to.name), x.id);
    D.notify([to.id], 'repair', `报修指派给你：${x.title}`, `${x.location} · 截止 ${x.due_at}`, '#/repair/' + x.id);
  } else return deny(res);
  D.audit(u.id, x.store_id, '报修' + ({ accept: '接单', done: '完成', confirm: '关单', reject: '退回', assign: '指派' }[op]), x.title);
  res.json({ ok: true });
});
function seedRepairs() {
  if (q1('SELECT COUNT(*) n FROM repairs').n) return;
  const now = L.nowStr(), t = L.today();
  const pick = (sid, re) => q("SELECT u.id, u.name FROM users u JOIN roles r ON r.id=u.role_id WHERE u.store_id=? AND u.active=1 AND r.name LIKE ?", sid, re)[0];
  const H = [['2208 房空调不制冷', '22F 2208', 'urgent'], ['大堂自动感应门异响', '大堂入口', 'normal'], ['前台打印机卡纸', '前台', 'low'], ['3 楼走廊筒灯不亮', '3F 走廊', 'normal'], ['早餐厅冷柜温度偏高', '餐厅后场', 'urgent'], ['1506 房淋浴水压小', '15F 1506', 'normal']];
  for (const s of q('SELECT id FROM stores')) {
    const eng = engineersOf(s.id)[0], fd = pick(s.id, '前台%') || pick(s.id, '%'), hk = pick(s.id, '客房%') || fd;
    if (!fd) continue;
    const ins = (h, st, by, created, done, rating) => {
      const due = addHours(created, cfg().sla[h[2]]);
      run('INSERT INTO repairs(store_id,location,title,body,urgency,status,created_by,created_at,due_at,assignee_id,accepted_at,done_at,done_note,closed_at,rating,esc_level,log) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        s.id, h[1], h[0], '', h[2], st, by.id, created, due, eng || null, st === 'open' ? null : addHours(created, 0.5), done, done ? '已更换配件，测试正常' : null, st === 'closed' ? addHours(done, 1) : null, rating, st !== 'closed' && due < now ? 1 : 0,
        JSON.stringify([{ at: created, by: by.name, act: '报修', note: h[0] }]));
    };
    for (let i = 0; i < 5; i++) { const c = L.addDays(t, -3 - i * 5) + ' ' + String(8 + i).padStart(2, '0') + ':20', h = H[(i + s.id) % H.length]; ins(h, 'closed', i % 2 ? hk : fd, c, addHours(c, (s.id === 3 ? 14 : 3) + i * 2), 3 + ((i + s.id) % 3)); }
    if (s.id === 3) { ins(H[0], 'accepted', hk, addHours(now, -6), null, null); ins(H[1], 'open', fd, addHours(now, -3), null, null); }
    else if (s.id === 1) ins(H[2], 'done', fd, addHours(now, -20), addHours(now, -2), null);
    else ins(H[3], 'open', hk, addHours(now, -2), null, null);
  }
}
seedRepairs();

// ---------- lifecycle ----------
const LC_NODES = [['sign', '签约', 0], ['design', '设计', 30], ['permit', '证照报建', 50], ['build', '工程筹建', 150], ['fire', '消防验收', 160], ['accept', '品牌验收', 170], ['hire', '招聘培训', 178], ['trial', '试营业', 185], ['open', '正式开业', 190]];
const LC_STAGES = ['管道', '筹备', '爬坡', '成熟', '改造', '续约评估', '退出'];
const BUILD_STD = 120;
const dBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const isDev = u => ['region_manager', 'dev_manager', 'build_manager'].includes(u.level);
const PJ_SQL = `SELECT p.*, d.name dev_name, b.name build_name FROM projects p LEFT JOIN users d ON d.id=p.dev_id LEFT JOIN users b ON b.id=p.build_id`;
function projOf(p) {
  const t = L.today();
  const nodes = q('SELECT n.*, u.name owner_name FROM project_nodes n LEFT JOIN users u ON u.id=n.owner_id WHERE n.project_id=? ORDER BY n.sort', p.id).map(n => {
    const late = !n.actual_date && n.plan_date < t;
    return { ...n, data: JSON.parse(n.data || '{}'), late, slip: n.actual_date ? Math.max(0, dBetween(n.plan_date, n.actual_date)) : late ? dBetween(n.plan_date, t) : 0 };
  });
  const cur = nodes.find(n => !n.actual_date), done = nodes.filter(n => n.actual_date);
  const shift = p.status === 'active' ? Math.max(0, done.length ? done[done.length - 1].slip : 0, cur?.late ? cur.slip : 0) : 0;
  const plan_open = nodes[nodes.length - 1]?.plan_date;
  const stage = p.status === 'lead' ? '线索' : p.status === 'intent' ? '意向' : p.status === 'drop' ? '放弃' : p.status === 'exit' ? '退出' : p.status === 'opened' ? '已开业' : nodes.find(n => n.key === 'permit')?.actual_date ? '筹备' : '管道';
  const why = [];
  if (p.status === 'active' && stage === '管道' && dBetween(p.sign_date, t) > 90 && !nodes.find(n => n.key === 'design')?.actual_date) why.push(['bad', `签约 ${dBetween(p.sign_date, t)} 天仍未完成设计，存在流失风险`]);
  if (p.status === 'active' && !p.fund_ok) why.push(['bad', '业主资金未到位']);
  if (p.status === 'active' && cur?.late) why.push([cur.slip >= 30 ? 'bad' : 'warn', `${cur.name}逾期 ${cur.slip} 天`]);
  if (cur?.key === 'accept' && cur.data.fails?.length) why.push(['warn', `品牌验收 ${cur.data.fails.length} 项不合格，整改后复验`]);
  const b = nodes.find(n => n.key === 'build'), pm = nodes.find(n => n.key === 'permit');
  const bStart = pm?.actual_date, bDays = bStart ? dBetween(bStart, b?.actual_date || t) : null;
  const bstd = brands()[p.brand]?.open_days || BUILD_STD;
  if (bDays != null && !b.actual_date && bDays > bstd) why.push(['warn', `工期已 ${bDays} 天，超过${p.brand || ''}标准 ${bstd} 天`]);
  const health = p.status !== 'active' ? null : why.some(w => w[0] === 'bad') ? 'red' : why.length ? 'yellow' : 'green';
  return { ...p, stage, nodes, cur: cur ? { key: cur.key, name: cur.name, plan_date: cur.plan_date, late: cur.late, slip: cur.slip } : null, shift, plan_open,
    predicted_open: plan_open ? L.addDays(plan_open, shift) : null, health, why, build_days: bDays, build_std: bstd, progress: Math.round(done.length * 100 / (nodes.length || 1)) };
}
const OPEN_CACHE = {};
const openOf = sid => (OPEN_CACHE[sid] ??= q1('SELECT open_date FROM stores WHERE id=?', sid)?.open_date || '2000-01-01');
const rampFactor = (sid, d) => { const n = dBetween(openOf(sid), d); return n >= 180 ? 1 : 0.62 + 0.38 * Math.max(0, n) / 180; };
const rampBench = w => 0.55 + 0.3 * Math.min(1, w / 26);
function storeStage(sid) {
  const s = q1('SELECT * FROM stores WHERE id=?', sid);
  if (s.lc_stage === '退出') return '退出';
  if (s.lc_stage !== '成熟' && dBetween(s.open_date, L.today()) < 180) return '爬坡';
  if (tagsOf(sid).includes('改造中')) return '改造';
  if (isFr(sid) && daysTo(L.addDays(s.open_date, 365 * 8 + 2)) <= 365) return '续约评估';
  return '成熟';
}
const eventsOf = sid => q('SELECT e.*, u.name by_name FROM store_events e LEFT JOIN users u ON u.id=e.by WHERE e.store_id=? ORDER BY e.at, e.id', sid);
function rampOf(sid) {
  const od = openOf(sid), t = L.today(), days = dBetween(od, t);
  if (days >= 180 && q1('SELECT lc_stage FROM stores WHERE id=?', sid).lc_stage === '成熟') return null;
  const weeks = [];
  for (let w = 1; w <= Math.min(26, Math.floor(days / 7)); w++) {
    const f = L.addDays(od, (w - 1) * 7), b = bizRange(sid, f, L.addDays(f, 6));
    weeks.push({ w, occ: Math.round(b.occ * 100), bench: Math.round(rampBench(w) * (brands()[brandOf(sid)]?.ramp || 1) * 100) });
  }
  const last = weeks.slice(-4), gap = last.length ? Math.round(last.reduce((a, x) => a + x.occ - x.bench, 0) / last.length) : 0;
  const rv = bizRange(sid, L.addDays(t, -30), L.addDays(t, -1)).revpar, base = BIZ_BASE[sid] || 350;
  const evs = eventsOf(sid);
  return { days, weeks, gap, revpar_rate: Math.round(rv * 100 / base), eval_done: evs.some(e => e.kind === '新店评估'), eval_due: days >= 90 && !evs.some(e => e.kind === '新店评估'),
    ready: days >= 180 && rv >= base * 0.9 };
}
function lcOf(sid) {
  const stage = storeStage(sid), pj = q1('SELECT id FROM projects WHERE store_id=?', sid);
  return { stage, stages: LC_STAGES, events: eventsOf(sid), ramp: stage === '爬坡' ? rampOf(sid) : null, project_id: pj?.id || null };
}
app.get('/api/lifecycle', (req, res) => {
  if (!isRegion(req.u)) return deny(res);
  const t = L.today(), y = t.slice(0, 4), u = req.u;
  const projects = q(PJ_SQL + ' WHERE p.region_id=? ORDER BY p.sign_date DESC', u.region_id).map(projOf);
  const stores = q('SELECT id, name, open_date, rooms, stype FROM stores WHERE region_id=? ORDER BY id', u.region_id).map(s => ({ ...s, stage: storeStage(s.id), days: dBetween(s.open_date, t), ramp: storeStage(s.id) === '爬坡' ? rampOf(s.id) : null }));
  const count = {};
  for (const k of LC_STAGES) count[k] = 0;
  projects.forEach(p => { if (p.stage === '管道' || p.stage === '筹备') count[p.stage]++; else if (p.stage === '退出') count['退出']++; });
  stores.forEach(s => count[s.stage]++);
  const evs = q("SELECT e.*, s.name store, p.name proj FROM store_events e LEFT JOIN stores s ON s.id=e.store_id LEFT JOIN projects p ON p.id=e.project_id WHERE COALESCE(s.region_id, p.region_id)=? ORDER BY e.at DESC, e.id DESC LIMIT 30", u.region_id);
  const tgt = D.getSetting('dev_target', { sign: 8, open: 4 });
  const yr = { sign: evs.filter(e => e.kind === '签约' && e.at.startsWith(y)).length, open: evs.filter(e => e.kind === '开业' && e.at.startsWith(y)).length,
    exit: evs.filter(e => ['解约', '摘牌'].includes(e.kind) && e.at.startsWith(y)).length };
  yr.net = yr.open - evs.filter(e => ['解约', '摘牌'].includes(e.kind) && e.store_id && e.at.startsWith(y)).length;
  const pipeRooms = projects.filter(p => ['管道', '筹备'].includes(p.stage)).reduce((a, p) => a + p.rooms, 0);
  res.json({ count, stages: LC_STAGES, projects, stores, events: evs, funnel: funnelOf(projects, q('SELECT * FROM store_events WHERE project_id IS NOT NULL')), contrib: contribOf(projects), target: tgt, year: yr, year_label: y, pipe_rooms: pipeRooms, nodes_def: LC_NODES, build_std: BUILD_STD });
});
app.get('/api/projects/:id', (req, res) => {
  const p = q1(PJ_SQL + ' WHERE p.id=?', req.params.id);
  if (!p || !isRegion(req.u) || p.region_id !== req.u.region_id) return deny(res);
  const acc = q("SELECT code, title, tag, s.name scene FROM templates t LEFT JOIN scenes s ON s.id=t.scene_id WHERE t.src='audit' AND t.active=1 AND t.tag IN ('清零项','重点项') ORDER BY t.code");
  res.json({ ...projOf(p), events: q('SELECT e.*, u.name by_name FROM store_events e LEFT JOIN users u ON u.id=e.by WHERE e.project_id=? ORDER BY e.at, e.id', p.id), accept_items: acc, can: isDev(req.u) });
});
function nodeOwner(key, p) {
  if (['sign', 'design'].includes(key)) return p.dev_id;
  if (key === 'hire') return D.regionUsers(p.region_id, 'hr_manager')[0] || p.build_id;
  if (['trial', 'open'].includes(key)) return D.regionUsers(p.region_id, 'region_manager')[0];
  return p.build_id;
}
app.post('/api/projects', (req, res) => {
  const u = req.u, b = req.body || {};
  if (!['region_manager', 'dev_manager'].includes(u.level)) return deny(res, '由区域经理或开发经理录入签约项目');
  if (!(b.name || '').trim() || !b.sign_date || !Number(b.rooms)) return err(res, '请填写项目名称、签约日期和房量');
  const dev = Number(b.dev_id) || (u.level === 'dev_manager' ? u.id : D.regionUsers(u.region_id, 'dev_manager')[0]) || null;
  const build = Number(b.build_id) || D.regionUsers(u.region_id, 'build_manager')[0] || null;
  const id = Number(run('INSERT INTO projects(region_id,name,city,brand,stype,rooms,owner,owner_company,dev_id,build_id,sign_date,fund_ok,budget,paid,changes,staff_plan,staff_hired,staff_trained,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,?,0,0,?,?)',
    u.region_id, b.name.trim(), b.city || '', b.brand || '全季 4.0', b.stype || '加盟店', Number(b.rooms), b.owner || '', b.owner_company || '', dev, build, b.sign_date, b.fund_ok ? 1 : 0, Number(b.budget) || Math.round(Number(b.rooms) * 10), Math.round(Number(b.rooms) * 0.18), 'active', L.nowStr()).lastInsertRowid);
  const p = q1('SELECT * FROM projects WHERE id=?', id);
  LC_NODES.forEach(([k, n, off], i) => run('INSERT INTO project_nodes(project_id,key,name,sort,plan_date,actual_date,owner_id) VALUES(?,?,?,?,?,?,?)', id, k, n, i, L.addDays(b.sign_date, off), k === 'sign' ? b.sign_date : null, nodeOwner(k, p)));
  run('INSERT INTO store_events(project_id,kind,at,note,by) VALUES(?,?,?,?,?)', id, '签约', b.sign_date, `${b.name.trim()} · ${b.rooms} 间 · ${b.stype || '加盟店'}`, u.id);
  D.notify([dev, build, ...D.regionUsers(u.region_id, 'region_manager')].filter(x => x && x !== u.id), 'project', `新签约项目：${b.name.trim()}`, `${b.sign_date} 签约，计划 ${L.addDays(b.sign_date, 190)} 开业`, '#/proj/' + id);
  D.audit(u.id, null, '新签约项目', b.name.trim());
  res.json({ ok: true, id });
});
app.post('/api/projects/:id/node/:key', (req, res) => {
  const u = req.u, p = q1('SELECT * FROM projects WHERE id=?', req.params.id), b = req.body || {};
  if (!p || !isDev(u) || p.region_id !== u.region_id || p.status !== 'active') return deny(res);
  const nodes = q('SELECT * FROM project_nodes WHERE project_id=? ORDER BY sort', p.id), i = nodes.findIndex(n => n.key === req.params.key), n = nodes[i];
  if (!n) return err(res, '节点不存在');
  if (b.plan_date) {
    if (u.level !== 'region_manager') return deny(res, '调整计划日期需区域经理确认');
    run('UPDATE project_nodes SET plan_date=? WHERE id=?', b.plan_date, n.id);
    D.audit(u.id, null, '调整项目节点', `${p.name} ${n.name} → ${b.plan_date}`);
    return res.json({ ok: true });
  }
  if (nodes.slice(0, i).some(x => !x.actual_date)) return err(res, '请先完成前面的节点');
  if (n.key === 'open') return err(res, '正式开业请用「确认开业」');
  const data = { ...JSON.parse(n.data || '{}'), by: u.id, note: b.note || '', photo: savePhoto(b.photo) || JSON.parse(n.data || '{}').photo || null };
  if (n.key === 'accept') {
    const fails = (b.fails || []).map(String);
    data.fails = fails; data.rounds = (data.rounds || 0) + 1;
    if (fails.length) {
      run('UPDATE project_nodes SET data=? WHERE id=?', JSON.stringify(data), n.id);
      D.notify([p.build_id, ...D.regionUsers(p.region_id, 'region_manager')].filter(Boolean), 'project', `${p.name} 品牌验收未通过`, `${fails.length} 项不合格，整改后复验`, '#/proj/' + p.id);
      D.audit(u.id, null, '品牌验收', `${p.name} 不合格 ${fails.length} 项`);
      return res.json({ ok: true, passed: false });
    }
  }
  const date = b.actual_date || L.today();
  run('UPDATE project_nodes SET actual_date=?, data=? WHERE id=?', date, JSON.stringify(data), n.id);
  const nx = nodes[i + 1];
  if (nx) D.notify([nx.owner_id].filter(Boolean), 'project', `${p.name}：${n.name}已完成`, `下一节点「${nx.name}」计划 ${nx.plan_date}`, '#/proj/' + p.id);
  if (n.key === 'permit') run('INSERT INTO store_events(project_id,kind,at,note,by) VALUES(?,?,?,?,?)', p.id, '进场筹建', date, '证照报建完成，进入工程筹建', u.id);
  D.audit(u.id, null, '项目节点完成', `${p.name} ${n.name}`);
  res.json({ ok: true, passed: true });
});
app.post('/api/projects/:id/update', (req, res) => {
  const u = req.u, p = q1('SELECT * FROM projects WHERE id=?', req.params.id), b = req.body || {};
  if (!p || !isDev(u) || p.region_id !== u.region_id) return deny(res);
  const f = ['budget', 'paid', 'changes', 'staff_plan', 'staff_hired', 'staff_trained'].filter(k => b[k] !== undefined && b[k] !== '');
  for (const k of f) run(`UPDATE projects SET ${k}=? WHERE id=?`, Math.max(0, Number(b[k]) || 0), p.id);
  if (b.fund_ok !== undefined) run('UPDATE projects SET fund_ok=? WHERE id=?', b.fund_ok ? 1 : 0, p.id);
  if (b.sm_name !== undefined) run('UPDATE projects SET sm_name=? WHERE id=?', b.sm_name, p.id);
  D.audit(u.id, null, '更新项目', p.name);
  res.json({ ok: true });
});
app.post('/api/projects/:id/open', (req, res) => {
  const u = req.u, p = q1('SELECT * FROM projects WHERE id=?', req.params.id);
  if (!p || u.level !== 'region_manager' || p.region_id !== u.region_id || p.status !== 'active') return deny(res);
  const nodes = q('SELECT * FROM project_nodes WHERE project_id=? ORDER BY sort', p.id);
  if (nodes.filter(n => n.key !== 'open').some(n => !n.actual_date)) return err(res, '开业前节点尚未全部完成');
  const smU = p.sm_name && q1(USER_SQL + " WHERE u.name=? AND r.level='store_manager'", p.sm_name);
  if (smU && !smCertified(smU.id) && !(req.body || {}).force) return err(res, `店长 ${smU.name} 未完成店长班认证，不能接店`);
  const t = (req.body || {}).date || L.today();
  const sid = Number(run('INSERT INTO stores(region_id,name,code,address,brand,stype,open_date,rooms,tags) VALUES(?,?,?,?,?,?,?,?,?)', p.region_id, p.name, 'NEW' + p.id, p.city || '', p.brand, p.stype, t, p.rooms, '新开业').lastInsertRowid);
  run("UPDATE project_nodes SET actual_date=? WHERE project_id=? AND key='open'", t, p.id);
  run("UPDATE projects SET status='opened', store_id=? WHERE id=?", sid, p.id);
  run('UPDATE store_events SET store_id=? WHERE project_id=?', sid, p.id);
  run('INSERT INTO store_events(store_id,project_id,kind,at,note,by) VALUES(?,?,?,?,?,?)', sid, p.id, '开业', t, `${p.rooms} 间，进入新店爬坡期`, u.id);
  D.notify([p.dev_id, p.build_id, ...D.regionUsers(p.region_id, 'ops_manager'), ...D.regionUsers(p.region_id, 'hr_manager')].filter(Boolean), 'project', `${p.name} 正式开业`, '进入爬坡期，90 天做新店评估', '#/sp/' + sid);
  D.audit(u.id, sid, '门店开业', p.name);
  res.json({ ok: true, store_id: sid });
});
app.post('/api/projects/:id/exit', (req, res) => {
  const u = req.u, p = q1('SELECT * FROM projects WHERE id=?', req.params.id), note = ((req.body || {}).note || '').trim();
  if (!p || u.level !== 'region_manager' || p.region_id !== u.region_id || p.status !== 'active') return deny(res);
  if (!note) return err(res, '请填写解约原因');
  run("UPDATE projects SET status='exit', exit_note=? WHERE id=?", note, p.id);
  run('INSERT INTO store_events(project_id,kind,at,note,by) VALUES(?,?,?,?,?)', p.id, '解约', L.today(), note, u.id);
  D.audit(u.id, null, '项目解约', p.name + '：' + note);
  res.json({ ok: true });
});
app.post('/api/store/:sid/stage', (req, res) => {
  const u = req.u, sid = Number(req.params.sid), b = req.body || {}, note = (b.note || '').trim();
  if (u.level !== 'region_manager' || !canSee(u, sid)) return deny(res);
  const KINDS = { mature: '转入成熟', eval: '新店评估', 续约: '续约', 转让: '转让', 解约: '解约', 摘牌: '摘牌', 改造: '改造' };
  const kind = KINDS[b.op]; if (!kind) return err(res, '操作无效');
  if (['解约', '摘牌', '转让'].includes(kind) && !note) return err(res, '请填写原因和交接事项');
  if (kind === '转入成熟') run("UPDATE stores SET lc_stage='成熟' WHERE id=?", sid);
  if (['解约', '摘牌'].includes(kind)) run("UPDATE stores SET lc_stage='退出' WHERE id=?", sid);
  if (kind === '改造') { const tg = tagsOf(sid).filter(x => x !== '改造规划'); if (!tg.includes('改造中')) tg.push('改造中'); run('UPDATE stores SET tags=? WHERE id=?', tg.join(','), sid); }
  if (kind === '转入成熟') run('UPDATE stores SET tags=? WHERE id=?', tagsOf(sid).filter(x => x !== '新开业').join(','), sid);
  run('INSERT INTO store_events(store_id,kind,at,note,by) VALUES(?,?,?,?,?)', sid, kind, b.date || L.today(), note, u.id);
  D.notify(D.storeManagers(sid), 'project', `${sname(sid)}：${kind}`, note, '#/home?pl=shop&store=' + sid);
  D.audit(u.id, sid, '门店周转', kind + ' ' + note);
  res.json({ ok: true });
});
function seedLifecycle() {
  run("UPDATE roles SET name='项目经理' WHERE name='筹建经理'");
  if (D.getSetting('lc_seeded', 0)) return;
  const t = L.today();
  D.tx(() => {
    for (const [n, lv] of [['开发经理', 'dev_manager'], ['项目经理', 'build_manager']]) if (!q1('SELECT 1 FROM roles WHERE name=?', n)) run('INSERT INTO roles(name,level,sort) VALUES(?,?,?)', n, lv, 3);
    const rid = n => q1('SELECT id FROM roles WHERE name=?', n).id;
    const add = (name, role, store) => Number(run('INSERT INTO users(name,role_id,region_id,store_id,phone) VALUES(?,?,1,?,?)', name, rid(role), store, '137' + String(10000000 + Math.floor(hash(name) * 89999999))).lastInsertRowid);
    const dev = add('何俊', '开发经理', null), build = add('吴涛', '项目经理', null);
    const rm = D.regionUsers(1, 'region_manager')[0], hr = D.regionUsers(1, 'hr_manager')[0];
    const od = L.addDays(t, -75);
    const sid = Number(run('INSERT INTO stores(region_id,name,code,address,brand,stype,open_date,rooms,tags) VALUES(1,?,?,?,?,?,?,?,?)', '苏州金鸡湖店', 'SZ001', '苏州工业园区星海街 88 号', '全季 4.0', '直营店', od, 156, '新开业').lastInsertRowid);
    const sm = add('顾磊', '店长', null); run('INSERT INTO user_stores VALUES(?,?)', sm, sid);
    const ST = [['店助', '钱佳'], ['前台经理', '许诺'], ['前台高级', '蒋玥'], ['前台初级', '沈一帆'], ['客房经理', '韩梅'], ['客房中级', '杨柳'], ['客房初级', '朱丽'], ['餐厅厨师', '秦川'], ['工程', '尤明'], ['PA', '施红'], ['保安', '孔军']];
    for (const [r, n] of ST) add(n, r, sid);
    const owner = { 前台: '前台经理', 餐厅: '餐厅厨师', 客房: '客房经理', 公区: '店助', 外围: '保安', 后场: '工程', 营业功能区: '客房经理' };
    for (const sc of q('SELECT id, name FROM scenes')) { const uid = q1('SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.store_id=? AND r.name=?', sid, owner[sc.name] || '店助')?.id; if (uid) run('INSERT OR IGNORE INTO scene_owners VALUES(?,?,?)', sid, sc.id, uid); }
    const mk = (name, city, stype, rooms, own, comp, sign, fund, budget, paid, changes, sp, sh, st, done, extra = {}) => {
      const id = Number(run('INSERT INTO projects(region_id,name,city,brand,stype,rooms,owner,owner_company,dev_id,build_id,sign_date,fund_ok,budget,paid,changes,staff_plan,staff_hired,staff_trained,status,store_id,exit_note,sm_name,created_at) VALUES(1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        name, city, '全季 4.0', stype, rooms, own, comp, dev, build, sign, fund, budget, paid, changes, sp, sh, st, extra.status || 'active', extra.store_id || null, extra.exit_note || null, extra.sm_name || null, sign + ' 10:00').lastInsertRowid);
      const p = { region_id: 1, dev_id: dev, build_id: build };
      LC_NODES.forEach(([k, n, off], i) => run('INSERT INTO project_nodes(project_id,key,name,sort,plan_date,actual_date,owner_id,data) VALUES(?,?,?,?,?,?,?,?)', id, k, n, i, L.addDays(sign, off), done[k] || null, nodeOwner(k, p), extra.data?.[k] ? JSON.stringify(extra.data[k]) : null));
      run('INSERT INTO store_events(project_id,store_id,kind,at,note,by) VALUES(?,?,?,?,?,?)', id, extra.store_id || null, '签约', sign, `${name} · ${rooms} 间 · ${stype}`, dev);
      if (done.permit) run('INSERT INTO store_events(project_id,store_id,kind,at,note,by) VALUES(?,?,?,?,?,?)', id, extra.store_id || null, '进场筹建', done.permit, '证照报建完成，进入工程筹建', build);
      return id;
    };
    const s1 = L.addDays(t, -120); mk('南京新街口店', '南京', '加盟店', 180, '孙志强', '南京鼎盛酒店管理有限公司', s1, 0, 1800, 120, 0, 32, 0, 0, { sign: s1 });
    const s2 = L.addDays(t, -20); mk('宁波天一广场店', '宁波', '加盟店', 140, '陈慧', '宁波甬江置业有限公司', s2, 1, 1450, 260, 0, 26, 0, 0, { sign: s2 });
    const s3 = L.addDays(t, -140); mk('无锡万象城店', '无锡', '加盟店', 168, '周文斌', '无锡锡城投资集团', s3, 1, 1800, 1150, 60, 30, 12, 0, { sign: s3, design: L.addDays(s3, 28), permit: L.addDays(s3, 52) });
    const s4 = L.addDays(t, -175); mk('合肥天鹅湖店', '合肥', '直营店', 150, '华住直营', '-', s4, 1, 1600, 1480, 85, 28, 24, 15, { sign: s4, design: L.addDays(s4, 31), permit: L.addDays(s4, 49), build: L.addDays(s4, 152), fire: L.addDays(s4, 163) }, { sm_name: '待定' });
    const s5 = L.addDays(od, -192);
    const pj5 = mk('苏州金鸡湖店', '苏州', '直营店', 156, '华住直营', '-', s5, 1, 1650, 1650, 40, 26, 26, 26, { sign: s5, design: L.addDays(s5, 29), permit: L.addDays(s5, 50), build: L.addDays(s5, 155), fire: L.addDays(s5, 163), accept: L.addDays(s5, 172), hire: L.addDays(s5, 178), trial: L.addDays(s5, 184), open: od }, { status: 'opened', store_id: sid, sm_name: '顾磊', data: { accept: { fails: [], rounds: 2, note: '首轮 3 项不合格，整改后复验通过' } } });
    run('INSERT INTO store_events(project_id,store_id,kind,at,note,by) VALUES(?,?,?,?,?,?)', pj5, sid, '开业', od, '156 间，进入新店爬坡期', rm);
    const s6 = L.addDays(t, -300); const pj6 = mk('上海徐家汇店', '上海', '加盟店', 120, '黄海', '上海汇金物业有限公司', s6, 0, 1300, 0, 0, 24, 0, 0, { sign: s6 }, { status: 'exit', exit_note: '业主资金链问题，签约后 6 个月未进场，双方协商解约' });
    run('INSERT INTO store_events(project_id,kind,at,note,by) VALUES(?,?,?,?,?)', pj6, '解约', L.addDays(t, -60), '业主资金链问题，签约后 6 个月未进场，双方协商解约', rm);
    for (const s of q("SELECT id, open_date FROM stores WHERE id IN (1,2,3)")) {
      run('INSERT INTO store_events(store_id,kind,at,note,by) VALUES(?,?,?,?,?)', s.id, '签约', L.addDays(s.open_date, -200), '', rm);
      run('INSERT INTO store_events(store_id,kind,at,note,by) VALUES(?,?,?,?,?)', s.id, '开业', s.open_date, '', rm);
      run('INSERT INTO store_events(store_id,kind,at,note,by) VALUES(?,?,?,?,?)', s.id, '转入成熟', L.addDays(s.open_date, 183), '爬坡期结束，RevPAR 达到区域基准', rm);
      run("UPDATE stores SET lc_stage='成熟' WHERE id=?", s.id);
    }
    const r3 = storeInfo(3).renovate; if (r3) run('INSERT INTO store_events(store_id,kind,at,note,by) VALUES(3,?,?,?,?)', '改造', r3, '公区及 60 间客房软装焕新', rm);
    void hr;
    D.setSetting('lc_seeded', 1);
  });
}
seedLifecycle();

// ---------- 执行分 ----------
function execScore(uid) {
  const t = L.today(), s = pstatsLite(uid, L.addDays(t, -30), L.addDays(t, -1));
  if (!s.total) return null;
  const score = clamp((s.rate ?? 80) * 0.4 + (s.ontime ?? 80) * 0.25 + (s.pass ?? 80) * 0.25 + Math.min(10, s.good * 2));
  const ms = pstatsLite(uid, t.slice(0, 8) + '01', t), STAR = 8;
  return { score, level: score >= 90 ? '金牌' : score >= 80 ? '银牌' : score >= 70 ? '合格' : '待提升', parts: { rate: s.rate, ontime: s.ontime, pass: s.pass, good: s.good }, month_good: ms.good, star_need: STAR, star_left: Math.max(0, STAR - ms.good) };
}
function execBoard(sid) {
  return q(USER_SQL + " WHERE u.active=1 AND u.store_id=? AND r.level='staff'", sid).map(u => ({ id: u.id, name: u.name, role_name: u.role_name, ...(execScore(u.id) || { score: null }), comm: commOf(u) }))
    .filter(x => x.score != null).sort((a, b) => b.score - a.score).map((x, i, a) => ({ ...x, rank: i + 1, of: a.length }));
}
app.get('/api/exec/:uid', (req, res) => {
  const u = req.u, x = q1(USER_SQL + ' WHERE u.id=?', req.params.uid);
  if (!x || !(x.id === u.id || canSee(u, x.store_id) && u.level !== 'staff' || leads(u, x.id))) return deny(res);
  const b = x.store_id ? execBoard(x.store_id) : [], me = b.find(y => y.id === x.id) || execScore(x.id);
  res.json({ me, comm: commOf(x), rank: me?.rank, of: b.length, rule: '近 30 天：完成率 40% + 准时率 25% + 抽查合格率 25% + 获肯定每次 2 分（最多 10 分）；≥90 金牌、≥80 银牌、≥70 合格' });
});
app.get('/api/store/:sid/exec', (req, res) => {
  const sid = Number(req.params.sid);
  if (!canSee(req.u, sid) || req.u.level === 'staff' && !LEADS[req.u.role_name]) return deny(res);
  res.json(execBoard(sid));
});

// ---------- 提成激励 ----------
const hx = k => { const v = Math.sin(hash(k) * 1e6 + 1) * 1e4; return v - Math.floor(v); };
function commOf(u) {
  const C = cfg().comm, t = L.today(), m0 = t.slice(0, 8) + '01', days = [];
  for (let d = m0; d <= t; d = L.addDays(d, 1)) days.push(d);
  if (/^前台/.test(u.role_name)) {
    const T = [['银卡', C.card_silver], ['金卡', C.card_gold], ['铂金卡', C.card_plat]], n = [0, 0, 0];
    for (const d of days) { const h = hx('cd' + u.id + d); if (h > 0.45) n[0]++; if (h > 0.78) n[1]++; if (h > 0.95) n[2]++; }
    const cards = n[0] + n[1] + n[2], base = T.reduce((a, [, p], i) => a + n[i] * p, 0), hit = cards >= C.tier_cards;
    return { kind: '售卡提成', items: T.map(([l, p], i) => ({ l, n: n[i], unit: p, amt: n[i] * p })), count: cards, unit_label: '张', amount: Math.round(base * (hit ? 1 + C.tier_bonus / 100 : 1)),
      tip: hit ? `本月已达 ${C.tier_cards} 张，提成上浮 ${C.tier_bonus}%` : `再售 ${C.tier_cards - cards} 张，本月提成整体上浮 ${C.tier_bonus}%` };
  }
  if (/^客房(高级|中级|初级)$/.test(u.role_name)) {
    let std = 0, suite = 0;
    for (const d of days.slice(0, -1)) { std += 9 + Math.floor(hx('rm' + u.id + d) * 6); suite += hx('rs' + u.id + d) > 0.7 ? 1 : 0; }
    const bad = q1("SELECT COUNT(*) n FROM instances WHERE assignee_id=? AND date>=? AND check_result='bad'", u.id, m0).n + Math.floor(hash('rf' + u.id + m0) * 3);
    const amount = std * C.room_std + suite * C.room_suite - bad * C.room_fail;
    return { kind: '打扫提成', items: [{ l: '标准房', n: std, unit: C.room_std, amt: std * C.room_std }, { l: '套房', n: suite, unit: C.room_suite, amt: suite * C.room_suite }, { l: '查房不合格扣减', n: bad, unit: -C.room_fail, amt: -bad * C.room_fail }],
      count: std + suite, unit_label: '间', amount, tip: bad ? `查房不合格 ${bad} 间，已扣 ${bad * C.room_fail} 元` : '本月查房全部合格' };
  }
  return null;
}

// ---------- 店长职级路径 ----------
const CAREER = ['储备店长', '店长', '资深店长', '多店店长', '区域储备'];
function careerOf(u) {
  const pf = profileOf(u), hs = hrSummary(u);
  const certs = pf.certs.map(c => c.name), certOk = n => certs.includes(n) || trainCert(u.id, n);
  if (u.level === 'store_manager') {
    const sids = q('SELECT store_id FROM user_stores WHERE user_id=?', u.id).map(x => x.store_id);
    const sc = regionScores(u.region_id).all.filter(x => sids.includes(x.id)), avg = sc.length ? Math.round(sc.reduce((a, x) => a + x.total, 0) / sc.length) : 0;
    const smYears = Math.round(pf.tenure * 0.6 * 10) / 10, G = cfg().grades;
    const cur = sids.length >= 2 ? '多店店长' : smYears >= 3 ? '资深店长' : '店长';
    const bench = q(USER_SQL + ` WHERE u.active=1 AND r.name IN ('店助','前台经理','客房经理') AND u.store_id IN (${sids.map(() => '?').join(',') || 'NULL'})`, ...sids).map(hrSummary).filter(x => x.tier === '可晋升').length;
    const C = { 店长: [['任店长满 2 年', smYears >= 2, `${smYears} 年`], [`所辖门店画像 ≥ ${G.B} 分（B）`, avg >= G.B, `${avg} 分`], ['完成「店长班」并取得全季店长认证', certOk('全季店长认证'), certOk('全季店长认证') ? '已认证' : '未认证']],
      资深店长: [['任资深店长满 1 年', smYears >= 4, `${smYears} 年`], [`门店画像 ≥ ${G.A} 分（A）`, avg >= G.A, `${avg} 分`], ['带出储备店长 ≥ 1 人', bench >= 1, `${bench} 人`]],
      多店店长: [['兼管 2 店以上满 1 年', sids.length >= 2 && smYears >= 4, `${sids.length} 店`], [`所辖门店平均 ≥ ${G.A} 分`, avg >= G.A, `${avg} 分`], ['完成「区域经理班」', certOk('区域经理班'), certOk('区域经理班') ? '已完成' : '未完成'], ['区域经理推荐', false, '待推荐']] };
    return careerRes(cur, C[cur] || []);
  }
  if (['店助', '前台经理', '客房经理'].includes(u.role_name)) {
    const a3 = perfOf(u).slice(-3).map(x => x.grade).join('');
    return careerRes('储备店长', [['司龄满 2 年', pf.tenure >= 2, `${pf.tenure} 年`], ['近 3 月业绩均为 A 或 B，且至少 2 个 A', (a3.match(/A/g) || []).length >= 2 && !/[CD]/.test(a3), a3 || '-'],
      ['完成「经理班」', certOk('经理班'), certOk('经理班') ? '已完成' : '未完成'], ['完成「店长班」', certOk('店长班') || certOk('全季店长认证'), certOk('店长班') ? '已完成' : '未完成'], ['人才梯队为「可晋升」', hs.tier === '可晋升', hs.tier]], true);
  }
  return null;
}
function careerRes(cur, conds, pool) {
  const i = CAREER.indexOf(cur), ok = conds.filter(c => c[1]).length;
  return { path: CAREER, current: pool ? '储备店长候选' : cur, next: pool ? '储备店长' : CAREER[i + 1] || null, conds: conds.map(([t, k, v]) => ({ t, ok: k, v })), pct: conds.length ? Math.round(ok * 100 / conds.length) : 0 };
}
const trainCert = (uid, name) => { try { return !!q1("SELECT 1 FROM train_enroll e JOIN train_classes c ON c.id=e.class_id WHERE e.user_id=? AND e.status='certified' AND (c.name LIKE ? OR c.cert=?)", uid, '%' + name + '%', name); } catch { return false; } };
app.get('/api/career/:uid', (req, res) => {
  const x = q1(USER_SQL + ' WHERE u.id=?', req.params.uid);
  if (!x || !(x.id === req.u.id || (isRegion(req.u) && sameRegion(req.u, x)) || (req.u.level === 'store_manager' && visibleStores(req.u).includes(x.store_id)))) return deny(res);
  res.json(careerOf(x));
});
app.get('/api/career-pool', (req, res) => {
  if (!isRegion(req.u) && req.u.level !== 'store_manager') return deny(res);
  const sids = visibleStores(req.u);
  const xs = q(USER_SQL + ` WHERE u.active=1 AND r.name IN ('店助','前台经理','客房经理') AND u.store_id IN (${sids.map(() => '?').join(',') || 'NULL'})`, ...sids)
    .map(u => ({ id: u.id, name: u.name, role_name: u.role_name, store: sname(u.store_id), ...careerOf(u) })).sort((a, b) => b.pct - a.pct);
  res.json(xs);
});

// ---------- 开发线索与漏斗 ----------
app.post('/api/leads', (req, res) => {
  const u = req.u, b = req.body || {};
  if (!['region_manager', 'dev_manager'].includes(u.level)) return deny(res);
  if (!(b.name || '').trim()) return err(res, '请填写项目名称');
  const id = Number(run("INSERT INTO projects(region_id,name,city,brand,stype,rooms,owner,owner_company,dev_id,status,exit_note,created_at,fund_ok,budget,paid,changes,staff_plan,staff_hired,staff_trained) VALUES(?,?,?,?,?,?,?,?,?,'lead',?,?,0,0,0,0,0,0,0)",
    u.region_id, b.name.trim(), b.city || '', '全季 4.0', b.stype || '加盟店', Number(b.rooms) || 0, b.owner || '', b.owner_company || '', u.level === 'dev_manager' ? u.id : D.regionUsers(u.region_id, 'dev_manager')[0] || u.id, b.note || '', L.nowStr()).lastInsertRowid);
  run('INSERT INTO store_events(project_id,kind,at,note,by) VALUES(?,?,?,?,?)', id, '线索', L.today(), b.note || '', u.id);
  D.audit(u.id, null, '录入开发线索', b.name.trim());
  res.json({ ok: true, id });
});
app.post('/api/leads/:id/:op', (req, res) => {
  const u = req.u, p = q1('SELECT * FROM projects WHERE id=?', req.params.id), b = req.body || {}, op = req.params.op;
  if (!p || !['region_manager', 'dev_manager'].includes(u.level) || p.region_id !== u.region_id || !['lead', 'intent'].includes(p.status)) return deny(res);
  if (op === 'intent') { run("UPDATE projects SET status='intent' WHERE id=?", p.id); run('INSERT INTO store_events(project_id,kind,at,note,by) VALUES(?,?,?,?,?)', p.id, '意向', L.today(), b.note || '', u.id); }
  else if (op === 'drop') { if (!(b.note || '').trim()) return err(res, '请填写放弃原因'); run("UPDATE projects SET status='drop', exit_note=? WHERE id=?", b.note, p.id); run('INSERT INTO store_events(project_id,kind,at,note,by) VALUES(?,?,?,?,?)', p.id, '放弃', L.today(), b.note, u.id); }
  else if (op === 'sign') {
    const sd = b.sign_date || L.today(), rooms = Number(b.rooms) || p.rooms;
    if (!rooms) return err(res, '请填写房量');
    run("UPDATE projects SET status='active', sign_date=?, rooms=?, fund_ok=?, budget=?, staff_plan=?, build_id=COALESCE(build_id, ?) WHERE id=?", sd, rooms, b.fund_ok ? 1 : 0, Number(b.budget) || rooms * 10, Math.round(rooms * 0.18), D.regionUsers(p.region_id, 'build_manager')[0] || null, p.id);
    const p2 = q1('SELECT * FROM projects WHERE id=?', p.id);
    LC_NODES.forEach(([k, n, off], i) => run('INSERT INTO project_nodes(project_id,key,name,sort,plan_date,actual_date,owner_id,data) VALUES(?,?,?,?,?,?,?,?)', p.id, k, n, i, L.addDays(sd, off), k === 'sign' ? sd : null, nodeOwner(k, p2), k === 'sign' ? JSON.stringify({ by: u.id }) : null));
    run('INSERT INTO store_events(project_id,kind,at,note,by) VALUES(?,?,?,?,?)', p.id, '签约', sd, `${p.name} · ${rooms} 间 · ${p.stype}`, u.id);
    D.notify([p2.build_id, ...D.regionUsers(p.region_id, 'region_manager')].filter(x => x && x !== u.id), 'project', `新签约项目：${p.name}`, `${sd} 签约，计划 ${L.addDays(sd, 190)} 开业`, '#/proj/' + p.id);
  } else return deny(res);
  D.audit(u.id, null, '开发线索' + { intent: '转意向', drop: '放弃', sign: '签约' }[op], p.name);
  res.json({ ok: true });
});
function funnelOf(projects, evs) {
  const sg = p => ({ lead: 0, intent: 1, drop: p.sign_date ? 2 : -1, active: p.stage === '筹备' ? 3 : 2, exit: 2, opened: 4 }[p.status]);
  const reach = k => projects.filter(p => sg(p) >= k || (p.status === 'drop' && k <= (evs.some(e => e.project_id === p.id && e.kind === '意向') ? 1 : 0))).length;
  const steps = ['线索', '意向', '签约', '进场', '开业'].map((l, i) => ({ l, n: reach(i) }));
  steps.forEach((s, i) => { s.rate = i ? (steps[i - 1].n ? Math.round(s.n * 100 / steps[i - 1].n) : null) : null; });
  const signed = projects.filter(p => p.sign_date && p.created_at), days = signed.map(p => dBetween(p.created_at.slice(0, 10), p.sign_date)).filter(d => d >= 0);
  return { steps, lead_to_sign: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null };
}
function contribOf(projects) {
  const M = {};
  const who = id => (M[id] ||= { id, name: q1(USER_SQL + ' WHERE u.id=?', id)?.name || '-', role: LEVEL_LABEL[q1(USER_SQL + ' WHERE u.id=?', id)?.level] || '', signed: 0, nodes: 0, ontime: 0, opened: [] });
  for (const p of projects) {
    if (p.sign_date && p.dev_id) who(p.dev_id).signed++;
    for (const n of p.nodes || []) if (n.actual_date && n.key !== 'sign') { const by = n.data.by || n.owner_id; if (!by) continue; const w = who(by); w.nodes++; if (!n.slip) w.ontime++; }
    if (p.status === 'opened' && p.store_id) { const r = rampOf(p.store_id); [p.dev_id, p.build_id].filter(Boolean).forEach(id => who(id).opened.push({ name: p.name, gap: r ? r.gap : null })); }
  }
  return Object.values(M).map(x => ({ ...x, ontime_rate: x.nodes ? Math.round(x.ontime * 100 / x.nodes) : null })).sort((a, b) => b.signed + b.nodes - a.signed - a.nodes);
}
function seedLeads() {
  if (D.getSetting('lc2_seeded', 0)) return;
  const dev = D.regionUsers(1, 'dev_manager')[0]; if (!dev) return;
  const t = L.today();
  for (const [name, city, rooms, owner, st, ago, note] of [['杭州滨江星光店', '杭州', 160, '赵总', 'lead', 12, '业主自有物业，正在比较两个品牌'], ['常州新北万达店', '常州', 130, '钱总', 'lead', 30, '商业综合体配套'], ['嘉兴南湖店', '嘉兴', 110, '冯总', 'lead', 45, ''],
    ['上海虹口足球场店', '上海', 150, '褚总', 'intent', 40, '已看过样板店，等待投资测算'], ['南通万象城店', '南通', 145, '卫总', 'intent', 60, '意向书已签'], ['绍兴柯桥店', '绍兴', 120, '蒋总', 'drop', 80, '物业产权不清晰']]) {
    const id = Number(run("INSERT INTO projects(region_id,name,city,brand,stype,rooms,owner,owner_company,dev_id,status,exit_note,created_at,fund_ok,budget,paid,changes,staff_plan,staff_hired,staff_trained) VALUES(1,?,?,'全季 4.0','加盟店',?,?,'',?,?,?,?,0,0,0,0,0,0,0)", name, city, rooms, owner, dev, st, note, L.addDays(t, -ago) + ' 10:00').lastInsertRowid);
    run('INSERT INTO store_events(project_id,kind,at,note,by) VALUES(?,?,?,?,?)', id, '线索', L.addDays(t, -ago), '', dev);
    if (st !== 'lead') run('INSERT INTO store_events(project_id,kind,at,note,by) VALUES(?,?,?,?,?)', id, st === 'drop' ? '放弃' : '意向', L.addDays(t, -Math.floor(ago / 2)), st === 'drop' ? note : '', dev);
  }
  for (const p of q("SELECT * FROM projects WHERE sign_date IS NOT NULL")) run('UPDATE projects SET created_at=? WHERE id=?', L.addDays(p.sign_date, -40 - Math.floor(hash('ld' + p.id) * 50)) + ' 10:00', p.id);
  D.setSetting('lc2_seeded', 1);
}
seedLeads();

// ---------- 采购与物料 ----------
const PROC_STD = { rate: 85, must: ['布草', '客用品', '床品', '早餐原料'] };
const MATS = [['布草', '浴巾', '条', 1, 0.5, 28], ['布草', '面巾', '条', 1, 0.5, 9], ['床品', '床单', '张', 1, 0.6, 45], ['床品', '被套', '张', 1, 0.6, 68], ['客用品', '洗护套装', '套', 1, 1.1, 3.2], ['客用品', '一次性拖鞋', '双', 1, 1.0, 1.5],
  ['早餐原料', '鸡蛋', '枚', 1, 1.6, 0.9], ['早餐原料', '咖啡豆', 'kg', 1, 0.01, 120], ['清洁用品', '多功能清洁剂', '瓶', 0, 0.02, 18], ['工程备件', 'LED 筒灯', '只', 0, 0.004, 35], ['工程备件', '空调滤网', '片', 0, 0.006, 22]];
const procStd = () => ({ ...PROC_STD, ...D.getSetting('proc_std', {}) });
function procOf(sid) {
  const t = L.today(), f30 = L.addDays(t, -30), b = bizRange(sid, f30, L.addDays(t, -1)), rooms = q1('SELECT rooms FROM stores WHERE id=?', sid)?.rooms || 150;
  const rn = Math.round(rooms * b.occ * 30), bs = brands()[brandOf(sid)], std = bs ? { rate: bs.rate, must: bs.must } : procStd();
  const mats = q('SELECT m.*, s.qty, s.safety FROM materials m LEFT JOIN store_stock s ON s.material_id=m.id AND s.store_id=? ORDER BY m.id', sid).map(m => {
    const use = Math.round(m.std_per_rn * rn * (0.92 + hx('mu' + sid + m.id) * (sid === 3 ? 0.45 : 0.28)) * 10) / 10, stdUse = Math.round(m.std_per_rn * rn * 10) / 10;
    return { ...m, use, std_use: stdUse, dev: stdUse ? Math.round((use / stdUse - 1) * 100) : 0, low: m.qty != null && m.qty < m.safety };
  });
  const cats = {};
  for (const p of q('SELECT * FROM purchases WHERE store_id=? AND month>=?', sid, L.addDays(t, -92).slice(0, 7))) { const c = cats[p.cat] ||= { cat: p.cat, total: 0, central: 0 }; c.total += p.amount; if (p.central) c.central += p.amount; }
  const must = Object.values(cats).filter(c => std.must.includes(c.cat)), tot = must.reduce((a, c) => a + c.total, 0), cen = must.reduce((a, c) => a + c.central, 0);
  return { rn, brand: brandOf(sid), rate: tot ? Math.round(cen * 100 / tot) : null, target: std.rate, must: std.must, cats: Object.values(cats).map(c => ({ ...c, rate: Math.round(c.central * 100 / (c.total || 1)), must: std.must.includes(c.cat) })),
    mats, abn: mats.filter(m => m.dev >= 20), low: mats.filter(m => m.low),
    reqs: q('SELECT r.*, u.name creator FROM requisitions r LEFT JOIN users u ON u.id=r.created_by WHERE r.store_id=? ORDER BY r.id DESC LIMIT 20', sid).map(r => ({ ...r, items: JSON.parse(r.items || '[]') })),
    takes: q('SELECT k.*, u.name assignee FROM stocktakes k LEFT JOIN users u ON u.id=k.assignee_id WHERE k.store_id=? ORDER BY k.id DESC LIMIT 6', sid).map(k => ({ ...k, items: JSON.parse(k.items || '[]') })) };
}
app.get('/api/proc', (req, res) => {
  const u = req.u, sids = visibleStores(u);
  if (u.level === 'staff' && !['店助'].includes(u.role_name)) return deny(res);
  const sid = Number(req.query.store);
  if (sid) { if (!sids.includes(sid)) return deny(res); return res.json({ store: sname(sid), ...procOf(sid), can_approve: ['region_manager', 'ops_manager'].includes(u.level), can_req: canManage(u, sid) || u.role_name === '店助' }); }
  res.json({ std: procStd(), stores: sids.map(s => { const p = procOf(s); return { id: s, name: sname(s), rate: p.rate, target: p.target, abn: p.abn.length, low: p.low.length, open: p.reqs.filter(r => r.status === 'open').length }; }).sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0)),
    reqs: q(`SELECT r.*, s.name store, u.name creator FROM requisitions r JOIN stores s ON s.id=r.store_id LEFT JOIN users u ON u.id=r.created_by WHERE r.status IN ('open','approved') AND r.store_id IN (${sids.map(() => '?').join(',') || 'NULL'}) ORDER BY r.id DESC`, ...sids).map(r => ({ ...r, items: JSON.parse(r.items || '[]') })),
    can_approve: ['region_manager', 'ops_manager'].includes(u.level), can_std: u.level === 'region_manager' });
});
app.post('/api/proc/std', (req, res) => {
  if (req.u.level !== 'region_manager') return deny(res);
  const rate = Number(req.body.rate), must = (req.body.must || []).filter(Boolean);
  if (!(rate > 0 && rate <= 100) || !must.length) return err(res, '请填写统购率目标和必须统购的品类');
  D.setSetting('proc_std', { rate, must }); D.audit(req.u.id, null, '统购标准', `${rate}% ${must.join('、')}`); res.json({ ok: true });
});
app.post('/api/requisitions', (req, res) => {
  const u = req.u, b = req.body || {}, sid = Number(b.store_id);
  if (!(canManage(u, sid) || (u.role_name === '店助' && u.store_id === sid))) return deny(res);
  const items = (b.items || []).map(x => ({ mid: Number(x.mid), qty: Number(x.qty) })).filter(x => x.qty > 0 && q1('SELECT 1 FROM materials WHERE id=?', x.mid));
  if (!items.length) return err(res, '请填写申领数量');
  items.forEach(x => { const m = q1('SELECT name, unit, price, central FROM materials WHERE id=?', x.mid); Object.assign(x, { name: m.name, unit: m.unit, amt: Math.round(m.price * x.qty), central: m.central }); });
  const id = Number(run("INSERT INTO requisitions(store_id,items,status,note,created_by,created_at) VALUES(?,?,'open',?,?,?)", sid, JSON.stringify(items), b.note || '', u.id, L.nowStr()).lastInsertRowid);
  D.notify([...D.regionUsers(u.region_id, 'ops_manager')], 'proc', `${sname(sid)} 物料申领`, items.map(x => `${x.name} ${x.qty}${x.unit}`).join('、'), '#/proc');
  D.audit(u.id, sid, '物料申领', items.map(x => x.name).join('、'));
  res.json({ ok: true, id });
});
app.post('/api/requisitions/:id/:op', (req, res) => {
  const u = req.u, r = q1('SELECT * FROM requisitions WHERE id=?', req.params.id), op = req.params.op;
  if (!r || !visibleStores(u).includes(r.store_id)) return deny(res);
  const items = JSON.parse(r.items || '[]');
  if (op === 'approve' && r.status === 'open' && ['region_manager', 'ops_manager'].includes(u.level)) {
    run("UPDATE requisitions SET status='approved', approved_by=? WHERE id=?", u.id, r.id);
    D.notify(D.storeManagers(r.store_id), 'proc', '物料申领已批准，统购配送中', items.map(x => x.name).join('、'), '#/proc?store=' + r.store_id);
  } else if (op === 'reject' && r.status === 'open' && ['region_manager', 'ops_manager'].includes(u.level)) {
    run("UPDATE requisitions SET status='rejected', note=? WHERE id=?", (req.body || {}).note || '', r.id);
    D.notify([r.created_by], 'proc', '物料申领被退回', (req.body || {}).note || '', '#/proc?store=' + r.store_id);
  } else if (op === 'receive' && r.status === 'approved' && (canManage(u, r.store_id) || u.role_name === '店助')) {
    run("UPDATE requisitions SET status='received', received_at=? WHERE id=?", L.nowStr(), r.id);
    for (const x of items) run('INSERT INTO store_stock(store_id,material_id,qty,safety) VALUES(?,?,?,0) ON CONFLICT(store_id,material_id) DO UPDATE SET qty=qty+excluded.qty', r.store_id, x.mid, x.qty);
    for (const x of items) run('INSERT INTO purchases(store_id,month,cat,amount,central) VALUES(?,?,?,?,?)', r.store_id, L.today().slice(0, 7), q1('SELECT cat FROM materials WHERE id=?', x.mid).cat, x.amt, x.central ? 1 : 0);
    const rt = (req.body || {}).rating;
    if (rt && rt.on_time) for (const sp of [...new Set(items.map(x => supOfCat(q1('SELECT cat FROM materials WHERE id=?', x.mid).cat)?.id).filter(Boolean))])
      run('INSERT INTO supplier_ratings(supplier_id,store_id,req_id,on_time,quality,price,note,by,at) VALUES(?,?,?,?,?,?,?,?,?)', sp, r.store_id, r.id, Number(rt.on_time), Number(rt.quality) || 4, Number(rt.price) || 4, rt.note || '', u.id, L.nowStr());
  } else return deny(res);
  D.audit(u.id, r.store_id, '物料申领' + { approve: '批准', reject: '退回', receive: '收货' }[op], '');
  res.json({ ok: true });
});
app.post('/api/stocktakes', (req, res) => {
  const u = req.u, sid = Number((req.body || {}).store_id);
  if (!canManage(u, sid) && u.level !== 'ops_manager') return deny(res);
  const asg = q1("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.store_id=? AND u.active=1 AND r.name='店助'", sid)?.id || D.storeManagers(sid)[0];
  const id = Number(run("INSERT INTO stocktakes(store_id,date,status,assignee_id,created_by,created_at) VALUES(?,?,'planned',?,?,?)", sid, (req.body || {}).date || L.today(), asg, u.id, L.nowStr()).lastInsertRowid);
  D.notify([asg], 'proc', `${sname(sid)} 物料盘点任务`, '请逐项清点库存并提交差异', '#/proc?store=' + sid);
  res.json({ ok: true, id });
});
app.post('/api/stocktakes/:id/submit', (req, res) => {
  const u = req.u, k = q1('SELECT * FROM stocktakes WHERE id=?', req.params.id);
  if (!k || k.status !== 'planned' || !(k.assignee_id === u.id || canManage(u, k.store_id))) return deny(res);
  const got = (req.body || {}).counts || {}, items = [];
  for (const m of q('SELECT m.id, m.name, m.unit, m.price, s.qty FROM materials m LEFT JOIN store_stock s ON s.material_id=m.id AND s.store_id=?', k.store_id)) {
    const actual = got[m.id] === undefined || got[m.id] === '' ? null : Number(got[m.id]);
    if (actual == null || !Number.isFinite(actual)) return err(res, `请填写「${m.name}」的实盘数量`);
    items.push({ mid: m.id, name: m.name, unit: m.unit, book: m.qty ?? 0, actual, diff: Math.round((actual - (m.qty ?? 0)) * 10) / 10, amt: Math.round((actual - (m.qty ?? 0)) * m.price) });
    run('INSERT INTO store_stock(store_id,material_id,qty,safety) VALUES(?,?,?,0) ON CONFLICT(store_id,material_id) DO UPDATE SET qty=excluded.qty', k.store_id, m.id, actual);
  }
  run("UPDATE stocktakes SET status='done', items=?, done_by=?, done_at=? WHERE id=?", JSON.stringify(items), u.id, L.nowStr(), k.id);
  const loss = items.reduce((a, x) => a + Math.min(0, x.amt), 0);
  D.notify([...D.storeManagers(k.store_id), ...D.regionUsers(u.region_id, 'ops_manager')], 'proc', `${sname(k.store_id)} 盘点完成`, `盘亏 ${-loss} 元`, '#/proc?store=' + k.store_id);
  res.json({ ok: true });
});

// ---------- 培训与认证 ----------
const TR_KINDS = ['店长班', '经理班', '品牌认证', '新员工入职'];
const isTrain = u => ['train_manager', 'region_manager', 'hr_manager'].includes(u.level);
app.get('/api/train', (req, res) => {
  const u = req.u; if (!isRegion(u) && u.level !== 'store_manager') return deny(res);
  const sids = visibleStores(u), t = L.today();
  const classes = q('SELECT c.*, u.name trainer FROM train_classes c LEFT JOIN users u ON u.id=c.trainer_id WHERE c.region_id=? ORDER BY c.start DESC', u.region_id).map(c => {
    const en = q(`SELECT e.*, u.name, r.name role_name, s.name store FROM train_enroll e JOIN users u ON u.id=e.user_id JOIN roles r ON r.id=u.role_id LEFT JOIN stores s ON s.id=u.store_id WHERE e.class_id=?`, c.id)
      .filter(e => isRegion(u) || sids.includes(q1('SELECT store_id FROM users WHERE id=?', e.user_id).store_id) || q1('SELECT 1 FROM user_stores WHERE user_id=? AND store_id IN (' + (sids.join(',') || 'NULL') + ')', e.user_id));
    return { ...c, enroll: en, phase: c.end < t ? '已结束' : c.start <= t ? '进行中' : '报名中' };
  });
  const mentors = q(`SELECT m.*, a.name mentee, ar.name mentee_role, b.name mentor, s.name store FROM mentors m JOIN users a ON a.id=m.mentee_id JOIN roles ar ON ar.id=a.role_id JOIN users b ON b.id=m.mentor_id LEFT JOIN stores s ON s.id=a.store_id WHERE a.store_id IN (${sids.join(',') || 'NULL'}) ORDER BY m.start DESC`)
    .map(m => ({ ...m, checks: JSON.parse(m.checks || '{}'), day: dBetween(m.start, t) }));
  res.json({ kinds: TR_KINDS, classes, mentors, can_edit: isTrain(u), can_nominate: u.level === 'store_manager' || isTrain(u) });
});
app.post('/api/train/classes', (req, res) => {
  const u = req.u, b = req.body || {}; if (!isTrain(u)) return deny(res);
  if (!(b.name || '').trim() || !TR_KINDS.includes(b.kind) || !b.start || !b.end) return err(res, '请填写班级名称、类型和日期');
  const id = Number(run('INSERT INTO train_classes(region_id,name,kind,cert,start,end,seats,trainer_id,note) VALUES(?,?,?,?,?,?,?,?,?)', u.region_id, b.name.trim(), b.kind, b.cert || '', b.start, b.end, Number(b.seats) || 20, u.id, b.note || '').lastInsertRowid);
  D.notify(D.regionUsers(u.region_id, 'store_manager'), 'train', `开班：${b.name.trim()}`, `${b.start} 至 ${b.end}，可在「培训与认证」提名学员`, '#/train');
  res.json({ ok: true, id });
});
app.post('/api/train/enroll', (req, res) => {
  const u = req.u, b = req.body || {}, c = q1('SELECT * FROM train_classes WHERE id=?', b.class_id), x = q1(USER_SQL + ' WHERE u.id=?', b.user_id);
  if (!c || !x || !(isTrain(u) || (u.level === 'store_manager' && visibleStores(u).includes(x.store_id)))) return deny(res);
  if (q1('SELECT 1 FROM train_enroll WHERE class_id=? AND user_id=?', c.id, x.id)) return err(res, '已报名');
  run("INSERT INTO train_enroll(class_id,user_id,status,created_at,by) VALUES(?,?,'enrolled',?,?)", c.id, x.id, L.nowStr(), u.id);
  D.notify([x.id, ...D.regionUsers(c.region_id, 'train_manager')].filter(i => i !== u.id), 'train', `${c.name} 报名：${x.name}`, `${c.start} 开班`, '#/train');
  res.json({ ok: true });
});
app.post('/api/train/result', (req, res) => {
  const u = req.u, b = req.body || {}, e = q1('SELECT * FROM train_enroll WHERE id=?', b.id);
  if (!e || !isTrain(u) || !['passed', 'certified', 'failed'].includes(b.status)) return deny(res);
  run('UPDATE train_enroll SET status=?, score=? WHERE id=?', b.status, Number(b.score) || null, e.id);
  const c = q1('SELECT * FROM train_classes WHERE id=?', e.class_id);
  D.notify([e.user_id, ...D.storeManagers(q1('SELECT store_id FROM users WHERE id=?', e.user_id).store_id || 0)], 'train', `${c.name}：${{ passed: '考核通过', certified: '取得认证', failed: '未通过' }[b.status]}`, b.score ? `成绩 ${b.score}` : '', '#/train');
  res.json({ ok: true });
});
app.post('/api/mentors/:id/check', (req, res) => {
  const u = req.u, m = q1('SELECT m.*, a.store_id FROM mentors m JOIN users a ON a.id=m.mentee_id WHERE m.id=?', req.params.id), k = (req.body || {}).k;
  if (!m || !['d30', 'd60', 'd90'].includes(k) || !(m.mentor_id === u.id || canManage(u, m.store_id) || isTrain(u))) return deny(res);
  const ch = JSON.parse(m.checks || '{}'), b2 = req.body || {}; ch[k] = { at: L.today(), by: u.name, note: b2.note || '', mentee_score: Number(b2.mentee_score) || null, by_mentee: Number(b2.mentor_score) || null };
  run('UPDATE mentors SET checks=?, status=? WHERE id=?', JSON.stringify(ch), k === 'd90' ? 'done' : 'active', m.id);
  res.json({ ok: true });
});
// ---------- 培训增强 ----------
const smCertified = uid => trainCert(uid, '全季店长认证') || trainCert(uid, '店长班');
function trainAlerts(regionId) {
  const out = [];
  for (const u of q(USER_SQL + " WHERE u.active=1 AND u.region_id=? AND r.level='store_manager'", regionId)) if (!smCertified(u.id)) out.push({ uid: u.id, name: u.name, type: '上岗门槛', text: `店长 ${u.name} 未完成店长班认证，按规定需完成后方可独立接店` });
  const t = L.today();
  for (const e of q("SELECT e.*, c.name cname, c.end, u.name FROM train_enroll e JOIN train_classes c ON c.id=e.class_id JOIN users u ON u.id=e.user_id WHERE e.status='certified' AND c.region_id=?", regionId)) {
    const exp = L.addDays(e.end, 365); if (daysTo(exp) <= 60) out.push({ uid: e.user_id, name: e.name, type: '复训', text: `${e.name} 的「${e.cname}」认证 ${exp} 到期，需安排复训` });
  }
  return out;
}
app.get('/api/train/suggest/:cid', (req, res) => {
  const c = q1('SELECT * FROM train_classes WHERE id=?', req.params.cid); if (!c || !isTrain(req.u) && req.u.level !== 'store_manager') return deny(res);
  const sids = visibleStores(req.u), inC = new Set(q('SELECT user_id FROM train_enroll WHERE class_id=?', c.id).map(x => x.user_id));
  const pool = q(USER_SQL + ` WHERE u.active=1 AND (u.store_id IN (${sids.join(',') || 'NULL'}) OR r.level='store_manager')`).filter(u => !inC.has(u.id));
  let xs = [];
  if (c.kind === '店长班') xs = [...pool.filter(u => u.level === 'store_manager' && !smCertified(u.id)).map(u => ({ u, why: '店长未认证，接店门槛' })),
    ...pool.filter(u => ['店助', '前台经理', '客房经理'].includes(u.role_name)).map(u => ({ u, c: careerOf(u) })).filter(x => x.c.pct >= 60).sort((a, b) => b.c.pct - a.c.pct).map(x => ({ u: x.u, why: `储备店长达成度 ${x.c.pct}%` }))];
  else if (c.kind === '经理班') xs = pool.filter(u => /高级$/.test(u.role_name)).map(u => ({ u, s: hrSummary(u) })).filter(x => x.s.tier === '可晋升').map(x => ({ u: x.u, why: '梯队「可晋升」' }));
  else if (c.kind === '品牌认证') xs = pool.filter(u => u.level === 'staff' && !trainCert(u.id, c.cert || c.name)).slice(0, 12).map(u => ({ u, why: '尚未取得品牌认证' }));
  else xs = pool.filter(u => u.level === 'staff' && profileOf(u).in_probation).map(u => ({ u, why: '试用期新员工' }));
  const seen = new Set(); xs = xs.filter(x => !seen.has(x.u.id) && seen.add(x.u.id));
  res.json(xs.slice(0, 12).map(x => ({ id: x.u.id, name: x.u.name, role_name: x.u.role_name, store: x.u.store_id ? sname(x.u.store_id) : '', why: x.why })));
});
app.get('/api/mentor-cands/:uid', (req, res) => {
  const m = q1(USER_SQL + ' WHERE u.id=?', req.params.uid); if (!m || !((isTrain(req.u) && sameRegion(req.u, m)) || canManage(req.u, m.store_id))) return deny(res);
  const dept = m.role_name.slice(0, 2);
  res.json(q(USER_SQL + " WHERE u.active=1 AND u.store_id=? AND r.level='staff' AND u.id!=?", m.store_id, m.id).map(u => ({ id: u.id, name: u.name, role_name: u.role_name, same: u.role_name.startsWith(dept), score: execScore(u.id)?.score ?? null, tier: hrSummary(u).tier }))
    .filter(x => !/初级|PA/.test(x.role_name)).sort((a, b) => b.same - a.same || (b.score ?? 0) - (a.score ?? 0)).slice(0, 8));
});
app.post('/api/mentors', (req, res) => {
  const b = req.body || {}, m = q1(USER_SQL + ' WHERE u.id=?', b.mentee_id), t = q1(USER_SQL + ' WHERE u.id=?', b.mentor_id);
  if (!m || !t || t.store_id !== m.store_id || !(isTrain(req.u) || canManage(req.u, m.store_id))) return deny(res);
  const cur = q1("SELECT * FROM mentors WHERE mentee_id=? AND status='active'", m.id);
  if (cur) run('UPDATE mentors SET mentor_id=? WHERE id=?', t.id, cur.id); else run("INSERT INTO mentors(mentee_id,mentor_id,start,checks,status) VALUES(?,?,?,'{}','active')", m.id, t.id, profileOf(m).hire);
  D.notify([t.id, m.id], 'train', `带教师傅：${t.name} → ${m.name}`, '按 30 / 60 / 90 天完成带教验收，双方互评计入画像', '#/train?k=%E5%B8%88%E5%BE%92%E5%B8%A6%E6%95%99');
  res.json({ ok: true });
});
function mentorStats(uid) {
  const as = q('SELECT * FROM mentors WHERE mentor_id=?', uid).map(m => JSON.parse(m.checks || '{}')), be = q('SELECT * FROM mentors WHERE mentee_id=?', uid).map(m => JSON.parse(m.checks || '{}'));
  const avg = xs => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const s1 = as.flatMap(c => Object.values(c).map(x => x.by_mentee).filter(Boolean)), s2 = be.flatMap(c => Object.values(c).map(x => x.mentee_score).filter(Boolean));
  return { as_mentor: as.length, mentor_score: avg(s1), done90: as.filter(c => c.d90).length, as_mentee: be.length, mentee_score: avg(s2) };
}
app.get('/api/mentor-stats/:uid', (req, res) => {
  const x = q1(USER_SQL + ' WHERE u.id=?', req.params.uid);
  if (!x || !(x.id === req.u.id || (isRegion(req.u) && sameRegion(req.u, x)) || canManage(req.u, x.store_id) || leads(req.u, x.id))) return deny(res);
  res.json(mentorStats(x.id));
});
function trainInsights(regionId) {
  const t = L.today(), f60 = L.addDays(t, -60);
  const topics = q(`SELECT pi.code, pi.item, COUNT(*) n FROM patrol_items pi JOIN patrols p ON p.id=pi.patrol_id JOIN stores s ON s.id=p.store_id WHERE pi.result='fail' AND s.region_id=? AND p.done_at>=? GROUP BY pi.code ORDER BY n DESC LIMIT 3`, regionId, f60)
    .concat(q(`SELECT i.title item, COUNT(*) n FROM instances i JOIN stores s ON s.id=i.store_id WHERE i.check_result='bad' AND s.region_id=? AND i.date>=? GROUP BY i.title ORDER BY n DESC LIMIT 3`, regionId, f60));
  const eff = q("SELECT e.*, c.end, c.name cname FROM train_enroll e JOIN train_classes c ON c.id=e.class_id WHERE c.region_id=? AND c.end<=? AND e.status IN ('passed','certified')", regionId, L.addDays(t, -14)).map(e => {
    const a = pstats(e.user_id, L.addDays(e.end, -45), L.addDays(e.end, -1)), b = pstats(e.user_id, L.addDays(e.end, 1), L.addDays(t, -1));
    return { name: q1('SELECT name FROM users WHERE id=?', e.user_id).name, cname: e.cname, before: a.total ? a.pass ?? a.rate : null, after: b.total ? b.pass ?? b.rate : null };
  }).filter(x => x.before && x.after);
  const classes = q('SELECT c.*, (SELECT COUNT(*) FROM train_enroll WHERE class_id=c.id) n FROM train_classes c WHERE c.region_id=?', regionId);
  const hours = classes.reduce((a, c) => a + (c.hours || dBetween(c.start, c.end) * 6 + 6) * c.n, 0), cost = classes.reduce((a, c) => a + (c.cost || c.n * 400), 0);
  const staff = q1("SELECT COUNT(*) n FROM users u JOIN roles r ON r.id=u.role_id WHERE u.active=1 AND u.region_id=? AND r.level IN ('staff','store_manager')", regionId).n;
  const trainers = q('SELECT u.id, u.name, r.name role_name FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id IN (SELECT trainer_id FROM train_classes WHERE region_id=? UNION SELECT mentor_id FROM mentors)', regionId).map(u => ({ ...u, classes: q1('SELECT COUNT(*) n FROM train_classes WHERE trainer_id=?', u.id).n, ...mentorStats(u.id) }));
  return { topics, eff, eff_rate: eff.length ? Math.round(eff.filter(x => x.after > x.before).length * 100 / eff.length) : null, hours_per: staff ? Math.round(hours / staff * 10) / 10 : 0, cost, trainers, alerts: trainAlerts(regionId),
    credits: { target: 24, required: { 店长: ['店长班', '品牌认证'], 店助: ['经理班', '品牌认证'], 前台经理: ['经理班', '品牌认证'], 客房经理: ['经理班', '品牌认证'], 员工: ['新员工入职', '品牌认证'] } } };
}
app.get('/api/train/insights', (req, res) => { if (!isRegion(req.u)) return deny(res); res.json(trainInsights(req.u.region_id)); });

function seedProcTrain() {
  if (D.getSetting('pt_seeded', 0)) return;
  const t = L.today();
  D.tx(() => {
    if (!q1('SELECT 1 FROM roles WHERE name=?', '培训经理')) run("INSERT INTO roles(name,level,sort) VALUES('培训经理','train_manager',3)");
    const tm = Number(run("INSERT INTO users(name,role_id,region_id,store_id,phone) VALUES('唐琳',(SELECT id FROM roles WHERE name='培训经理'),1,NULL,'13761205539')").lastInsertRowid);
    MATS.forEach(([cat, name, unit, central, std, price]) => run('INSERT INTO materials(cat,name,unit,central,std_per_rn,price) VALUES(?,?,?,?,?,?)', cat, name, unit, central, std, price));
    const stores = q('SELECT id, rooms FROM stores');
    for (const s of stores) {
      for (const m of q('SELECT * FROM materials')) { const safety = Math.ceil(m.std_per_rn * s.rooms * 0.8 * 7); run('INSERT OR REPLACE INTO store_stock(store_id,material_id,qty,safety) VALUES(?,?,?,?)', s.id, m.id, Math.round(safety * (0.6 + hx('st' + s.id + m.id) * 1.4)), safety); }
      for (let i = 0; i < 3; i++) { const mon = L.addDays(t, -30 * i).slice(0, 7);
        for (const cat of [...new Set(MATS.map(x => x[0]))]) { const amt = Math.round(s.rooms * (cat === '早餐原料' ? 60 : cat === '工程备件' ? 12 : 30) * (0.8 + hx('pa' + s.id + cat + i) * 0.4)), cr = PROC_STD.must.includes(cat) ? (s.id === 3 ? 0.62 : s.id === 2 ? 0.84 : 0.93) + (hx('pc' + s.id + cat + i) - 0.5) * 0.1 : 0.3;
          run('INSERT INTO purchases(store_id,month,cat,amount,central) VALUES(?,?,?,?,1),(?,?,?,?,0)', s.id, mon, cat, Math.round(amt * cr), s.id, mon, cat, Math.round(amt * (1 - cr))); } }
      const asg = q1("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.store_id=? AND r.name='店助'", s.id)?.id;
      if (asg) run("INSERT INTO stocktakes(store_id,date,status,assignee_id,created_by,created_at) VALUES(?,?,'planned',?,?,?)", s.id, t, asg, tm, L.nowStr());
    }
    run("INSERT INTO requisitions(store_id,items,status,note,created_by,created_at) VALUES(3,?,'open','旺季前补货',?,?)", JSON.stringify([{ mid: 1, name: '浴巾', unit: '条', qty: 200, amt: 5600, central: 1 }, { mid: 5, name: '洗护套装', unit: '套', qty: 1500, amt: 4800, central: 1 }]), D.storeManagers(3)[0], L.nowStr());
    const cls = [['2026 第三期店长班', '店长班', '全季店长认证', L.addDays(t, -50), L.addDays(t, -36), 12], ['2026 第四期经理班', '经理班', '经理班', L.addDays(t, 10), L.addDays(t, 17), 20], ['全季 4.0 品牌标准认证', '品牌认证', '全季 4.0 品牌认证', L.addDays(t, -3), L.addDays(t, 4), 30], ['11 月新员工入职培训', '新员工入职', '', L.addDays(t, -10), L.addDays(t, -8), 25]];
    const cids = cls.map(([n, k, c, a, b2, seats]) => Number(run('INSERT INTO train_classes(region_id,name,kind,cert,start,end,seats,trainer_id,note) VALUES(1,?,?,?,?,?,?,?,?)', n, k, c, a, b2, seats, tm, '').lastInsertRowid));
    const pick = re => q(USER_SQL + ' WHERE u.active=1 AND r.name LIKE ?', re).map(x => x.id);
    pick('店助').slice(0, 3).forEach((id, i) => run('INSERT INTO train_enroll(class_id,user_id,status,score,created_at,by) VALUES(?,?,?,?,?,?)', cids[0], id, i < 2 ? 'certified' : 'failed', i < 2 ? 88 - i * 4 : 68, L.nowStr(), tm));
    [...pick('前台经理'), ...pick('客房经理')].slice(0, 4).forEach(id => run("INSERT INTO train_enroll(class_id,user_id,status,created_at,by) VALUES(?,?,'enrolled',?,?)", cids[1], id, L.nowStr(), tm));
    [...pick('前台高级'), ...pick('客房高级')].slice(0, 5).forEach(id => run("INSERT INTO train_enroll(class_id,user_id,status,created_at,by) VALUES(?,?,'enrolled',?,?)", cids[2], id, L.nowStr(), tm));
    for (const s of stores) {
      const staff = q(USER_SQL + " WHERE u.active=1 AND u.store_id=? AND r.level='staff'", s.id), newbies = staff.filter(x => profileOf(x).in_probation).slice(0, 2);
      for (const n of newbies) { const dept = n.role_name.slice(0, 2), mentor = staff.find(x => x.id !== n.id && x.role_name.startsWith(dept) && /高级|经理/.test(x.role_name)) || staff.find(x => x.role_name === '店助');
        if (!mentor) continue; const st = profileOf(n).hire, d = dBetween(st, t), ch = {};
        if (d >= 30) ch.d30 = { at: L.addDays(st, 30), by: mentor.name, note: '岗位基础流程掌握' }; if (d >= 60 && hx('mt' + n.id) > 0.4) ch.d60 = { at: L.addDays(st, 61), by: mentor.name, note: '可独立当班' };
        run('INSERT INTO mentors(mentee_id,mentor_id,start,checks,status) VALUES(?,?,?,?,?)', n.id, mentor.id, st, JSON.stringify(ch), 'active'); }
      if (!newbies.length) { const a = staff.find(x => /初级/.test(x.role_name)), m = staff.find(x => /高级/.test(x.role_name)); if (a && m) run('INSERT INTO mentors(mentee_id,mentor_id,start,checks,status) VALUES(?,?,?,?,?)', a.id, m.id, L.addDays(t, -40), JSON.stringify({ d30: { at: L.addDays(t, -10), by: m.name, note: '已掌握基础流程' } }), 'active'); }
    }
    D.setSetting('pt_seeded', 1);
  });
}
seedProcTrain();

// ---------- 绩效与薪酬 ----------
const BASE_PAY = { 店助: 7800, 前台经理: 6800, 客房经理: 6600, 前台高级: 5200, 前台中级: 4800, 前台初级: 4300, 客房高级: 4900, 客房中级: 4500, 客房初级: 4100, 餐厅厨师: 5000, 餐厅服务员: 4000, 保安: 4200, 店长: 12000 };
const perfCoef = s => (s >= 90 ? 1.2 : s >= 80 ? 1 : s >= 70 ? 0.9 : 0.8);
function smAssess(u) {
  const sids = q('SELECT store_id FROM user_stores WHERE user_id=?', u.id).map(x => x.store_id); if (!sids.length) return null;
  const sc = sids.map(s => storeScore(s).total), avg = Math.round(sc.reduce((a, b) => a + b, 0) / sc.length);
  const pr = sids.map(s => procOf(s)).filter(p => p.rate != null), proc = pr.length ? Math.round(pr.reduce((a, p) => a + Math.min(100, p.rate * 100 / p.target), 0) / pr.length) : 100;
  const bench = q(USER_SQL + ` WHERE u.active=1 AND u.store_id IN (${sids.join(',')})`).filter(x => hrSummary(x).tier === '可晋升').length;
  const stab = stabOf(sids), score = Math.round(avg * 0.5 + proc * 0.2 + Math.min(100, bench * 25) * 0.15 + stab * 0.15), g = score >= 90 ? 'S' : score >= 85 ? 'A' : score >= 78 ? 'B' : score >= 70 ? 'C' : 'D';
  return { score, grade: g, coef: { S: 1.5, A: 1.2, B: 1, C: 0.8, D: 0.5 }[g], parts: [{ l: '门店画像均分', v: avg, w: 50 }, { l: '统购达成', v: proc, w: 20 }, { l: '人才储备', v: Math.min(100, bench * 25), w: 15, note: `可晋升 ${bench} 人` }, { l: '团队稳定', v: stab, w: 15, note: '人事稳定 60%（满编率、离职率、新人流失、关键岗空缺）+ 员工美好 40%' }] };
}
function payOf(u) {
  const ym = L.today().slice(0, 7), base = BASE_PAY[u.role_name] || 4500;
  if (u.level === 'store_manager') { const a = smAssess(u); return { ym, kind: 'sm', base, assess: a, bonus: Math.round(base * 0.3 * (a?.coef ?? 1)), total: base + Math.round(base * 0.3 * (a?.coef ?? 1)), items: [{ l: '基本工资', amt: base }, { l: `季度绩效奖金（${a?.grade ?? '-'} 级 × ${a?.coef ?? 1}）`, amt: Math.round(base * 0.3 * (a?.coef ?? 1)) }] }; }
  const ex = execScore(u.id), cm = commOf(u), coef = perfCoef(ex?.score ?? 80), perf = Math.round(base * 0.2 * coef);
  const credits = q("SELECT c.start, c.end FROM train_enroll e JOIN train_classes c ON c.id=e.class_id WHERE e.user_id=? AND e.status IN ('passed','certified') AND c.start>=?", u.id, ym.slice(0, 4) + '-01-01').reduce((a, c) => a + (dBetween(c.start, c.end) + 1) * 4, 0);
  const ms = mentorStats(u.id), mb = q('SELECT checks FROM mentors WHERE mentor_id=?', u.id).reduce((a, m) => a + Object.keys(JSON.parse(m.checks || '{}')).length * 100, 0);
  const items = [{ l: '基本工资', amt: base }, { l: `绩效工资（执行分 ${ex?.score ?? '-'} × ${coef}）`, amt: perf }];
  if (cm) items.push({ l: cm.kind, amt: cm.amount }); if (mb) items.push({ l: `带教津贴（验收 ${mb / 100} 次）`, amt: mb });
  return { ym, kind: 'staff', base, exec: ex?.score ?? null, coef, credits, credit_target: 24, mentor: ms, items, total: items.reduce((a, x) => a + x.amt, 0) };
}
app.get('/api/pay/:uid', (req, res) => {
  const x = q1(USER_SQL + ' WHERE u.id=?', req.params.uid); if (!x || !(x.id === req.u.id || canPeople(req.u, x))) return deny(res);
  res.json({ name: x.name, role_name: x.role_name, ...payOf(x), appeals: q('SELECT * FROM pay_appeals WHERE user_id=? ORDER BY id DESC', x.id), simulated: true });
});
app.get('/api/pay-board', (req, res) => {
  const u = req.u, sids = visibleStores(u); if (u.level === 'staff' || !(canHR(u) || u.level === 'store_manager')) return deny(res);
  const sid = Number(req.query.store);
  const us = q(USER_SQL + ` WHERE u.active=1 AND r.level='staff' AND u.store_id IN (${(sid ? [sid] : sids).join(',') || 'NULL'})`);
  const sms = canHR(u) ? q(USER_SQL + " WHERE u.active=1 AND r.level='store_manager' AND u.region_id=?", u.region_id) : [];
  res.json({ staff: us.map(x => ({ id: x.id, name: x.name, role_name: x.role_name, store: sname(x.store_id), ...payOf(x) })).sort((a, b) => b.total - a.total), sms: sms.map(x => ({ id: x.id, name: x.name, ...payOf(x) })),
    appeals: q(`SELECT a.*, u.name, s.name store FROM pay_appeals a JOIN users u ON u.id=a.user_id LEFT JOIN stores s ON s.id=u.store_id WHERE a.status='open' AND u.store_id IN (${sids.join(',') || 'NULL'})`) });
});
app.post('/api/pay/appeal', (req, res) => {
  const u = req.u, r = ((req.body || {}).reason || '').trim(); if (!r) return err(res, '请填写申诉理由');
  if (q1("SELECT 1 x FROM pay_appeals WHERE user_id=? AND ym=? AND COALESCE(item,'')=? AND status='open'", u.id, L.today().slice(0, 7), (req.body || {}).item || '')) return err(res, '本月这一项已有申诉在处理');
  run("INSERT INTO pay_appeals(user_id,ym,item,reason,status,created_at) VALUES(?,?,?,?,'open',?)", u.id, L.today().slice(0, 7), (req.body || {}).item || '', r, L.nowStr());
  D.notify([...D.storeManagers(u.store_id || 0), ...D.regionUsers(u.region_id, 'hr_manager')], 'pay', `${u.name} 提交绩效申诉`, r, '#/pay');
  res.json({ ok: true });
});
app.post('/api/pay/appeal/:id', (req, res) => {
  const a = q1('SELECT a.*, u.store_id FROM pay_appeals a JOIN users u ON u.id=a.user_id WHERE a.id=?', req.params.id), b = req.body || {};
  if (!a || a.status !== 'open' || !(canManage(req.u, a.store_id) || canHR(req.u)) || !['accepted', 'rejected'].includes(b.status) || a.user_id === req.u.id) return deny(res);
  run('UPDATE pay_appeals SET status=?, reply=?, by=?, replied_at=? WHERE id=?', b.status, b.reply || '', req.u.id, L.nowStr(), a.id);
  D.notify([a.user_id], 'pay', `绩效申诉${b.status === 'accepted' ? '已采纳' : '未采纳'}`, b.reply || '', '#/pay');
  res.json({ ok: true });
});

// ---------- 离职 / 调岗交接 ----------
function openItemsOf(uid) {
  const t = L.today();
  return {
    tasks: q("SELECT id, title, date FROM instances WHERE assignee_id=? AND status='pending' AND date>=?", uid, t),
    rects: q("SELECT r.id, COALESCE(i.title, r.task) title, r.deadline FROM rectifications r LEFT JOIN instances i ON i.id=r.instance_id WHERE r.assignee_id=? AND r.status IN ('open','submitted','rejected')", uid),
    scenes: q('SELECT so.scene_id id, sc.name title FROM scene_owners so JOIN scenes sc ON sc.id=so.scene_id WHERE so.user_id=?', uid),
    templates: q('SELECT a.template_id id, t.title FROM assignments a JOIN templates t ON t.id=a.template_id WHERE a.user_id=?', uid),
    mentees: q("SELECT m.id, u.name title FROM mentors m JOIN users u ON u.id=m.mentee_id WHERE m.mentor_id=? AND m.status='active'", uid),
    takes: q("SELECT id, date title FROM stocktakes WHERE assignee_id=? AND status='planned'", uid),
    repairs: q("SELECT id, title FROM repairs WHERE assignee_id=? AND status IN ('open','accepted')", uid),
  };
}
app.get('/api/handoff/:uid', (req, res) => {
  const x = q1(USER_SQL + ' WHERE u.id=?', req.params.uid); if (!x || !(canManage(req.u, x.store_id) || (canHR(req.u) && sameRegion(req.u, x)))) return deny(res);
  const items = openItemsOf(x.id), dept = x.role_name.slice(0, 2);
  const cands = q(USER_SQL + " WHERE u.active=1 AND u.store_id=? AND u.id!=? AND r.level IN ('staff','store_manager')", x.store_id, x.id).sort((a, b) => b.role_name.startsWith(dept) - a.role_name.startsWith(dept)).map(c => ({ id: c.id, name: c.name, role_name: c.role_name }));
  res.json({ name: x.name, role_name: x.role_name, store_id: x.store_id, items, count: Object.values(items).reduce((a, v) => a + v.length, 0), cands, stores: visibleStores(req.u).filter(s => s !== x.store_id).map(s => ({ id: s, name: sname(s) })) });
});
app.post('/api/handoff/:uid', (req, res) => {
  const x = q1(USER_SQL + ' WHERE u.id=?', req.params.uid), b = req.body || {}, to = q1(USER_SQL + ' WHERE u.id=?', b.to);
  if (!x || !to || to.store_id !== x.store_id || !(canManage(req.u, x.store_id) || canHR(req.u)) || !['leave', 'transfer'].includes(b.mode)) return deny(res);
  if (b.mode === 'transfer' && !visibleStores(req.u).includes(Number(b.store_id))) return err(res, '请选择调入门店');
  const it = openItemsOf(x.id), t = L.today();
  D.tx(() => {
    run("UPDATE instances SET assignee_id=? WHERE assignee_id=? AND status='pending' AND date>=?", to.id, x.id, t);
    run("UPDATE rectifications SET assignee_id=? WHERE assignee_id=? AND status IN ('open','submitted','rejected')", to.id, x.id);
    run('UPDATE scene_owners SET user_id=? WHERE user_id=?', to.id, x.id); run('UPDATE assignments SET user_id=? WHERE user_id=?', to.id, x.id);
    run("UPDATE mentors SET mentor_id=? WHERE mentor_id=? AND status='active'", to.id, x.id);
    run("UPDATE stocktakes SET assignee_id=? WHERE assignee_id=? AND status='planned'", to.id, x.id);
    run("UPDATE repairs SET assignee_id=? WHERE assignee_id=? AND status IN ('open','accepted')", to.id, x.id);
    if (b.mode === 'leave') run('UPDATE users SET active=0 WHERE id=?', x.id); else run('UPDATE users SET store_id=? WHERE id=?', Number(b.store_id), x.id);
  });
  const pfx = profileOf(x);
  run('INSERT INTO hr_moves(store_id,user_id,name,role,pos,kind,date,hire,reason,voluntary,note,to_store,by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', x.store_id, x.id, x.name, x.role_name, posOf(x.role_name), b.mode, t, pfx.hire,
    b.mode === 'leave' ? (EXIT_R.includes(b.reason) ? b.reason : '个人原因') : null, b.mode === 'leave' ? (String(b.voluntary) === '0' ? 0 : 1) : null, b.note || '', b.mode === 'transfer' ? Number(b.store_id) : null, req.u.id);
  const n = Object.values(it).reduce((a, v) => a + v.length, 0), what = b.mode === 'leave' ? '离职' : '调岗至 ' + sname(Number(b.store_id));
  D.notify([to.id], 'assign', `${x.name} ${what}，${n} 项工作已交接给你`, Object.entries({ tasks: '任务', rects: '整改', scenes: '场景', templates: '清单', mentees: '徒弟', takes: '盘点', repairs: '报修' }).filter(([k]) => it[k].length).map(([k, l]) => `${l} ${it[k].length}`).join('、'), '#/my');
  D.audit(req.u.id, x.store_id, '人员' + (b.mode === 'leave' ? '离职交接' : '调岗交接'), `${x.name} → ${to.name}，${n} 项`);
  res.json({ ok: true, n });
});

// ---------- 品牌标准 ----------
const BRAND_DEF = { '全季 4.0': { rate: 85, must: ['布草', '客用品', '床品', '早餐原料'], ramp: 1, cert: '全季 4.0 品牌认证', open_days: 120 }, '全季 3.6': { rate: 80, must: ['布草', '客用品', '床品'], ramp: 0.95, cert: '全季 3.6 品牌认证', open_days: 120 } };
const brands = () => { const s = D.getSetting('brand_std', {}), out = {}; for (const b of [...new Set([...Object.keys(BRAND_DEF), ...q('SELECT DISTINCT brand FROM stores WHERE brand IS NOT NULL').map(x => x.brand), ...q('SELECT DISTINCT brand FROM projects WHERE brand IS NOT NULL').map(x => x.brand)])]) out[b] = { ...PROC_STD, ramp: 1, cert: b + ' 品牌认证', open_days: 120, ...BRAND_DEF[b], ...s[b] }; return out; };
const brandOf = sid => q1('SELECT brand FROM stores WHERE id=?', sid)?.brand;
app.get('/api/brands', (req, res) => {
  if (!isRegion(req.u)) return deny(res);
  const B = brands(), sids = visibleStores(req.u);
  res.json({ brands: Object.entries(B).map(([name, v]) => ({ name, ...v, stores: sids.filter(s => brandOf(s) === name).map(s => { const p = procOf(s), sc = storeScore(s); return { id: s, name: sname(s), score: sc.total, grade: sc.grade, rate: p.rate }; }).sort((a, b) => b.score - a.score) })), can_edit: req.u.level === 'region_manager' });
});
app.post('/api/brands', (req, res) => {
  if (req.u.level !== 'region_manager') return deny(res);
  const b = req.body || {}, s = D.getSetting('brand_std', {}), must = (b.must || []).filter(Boolean);
  if (!b.name || !(Number(b.rate) > 0 && Number(b.rate) <= 100) || !must.length) return err(res, '请填写统购率目标和必须统购的品类');
  s[b.name] = { rate: Number(b.rate), must, ramp: Number(b.ramp) || 1, cert: b.cert || '', open_days: Number(b.open_days) || 120 }; D.setSetting('brand_std', s);
  D.audit(req.u.id, null, '品牌标准', `${b.name} 统购 ${b.rate}%`); res.json({ ok: true });
});

// ---------- 值班交接班 ----------
const SHIFTS = ['早班', '中班', '夜班'];
app.get('/api/shift', (req, res) => {
  const u = req.u, sid = Number(req.query.store) || u.store_id; if (!visibleStores(u).includes(sid)) return deny(res);
  const logs = q('SELECT s.*, a.name by_name, b.name taker FROM shift_logs s LEFT JOIN users a ON a.id=s.by LEFT JOIN users b ON b.id=s.taken_by WHERE s.store_id=? ORDER BY s.id DESC LIMIT 15', sid).map(s => ({ ...s, issues: JSON.parse(s.issues || '[]') }));
  const last = logs.find(s => s.status === 'taken'), carry = last ? last.issues.filter(i => !i.done) : [];
  res.json({ store: sname(sid), shifts: SHIFTS, logs, carry, pending: logs.find(s => s.status === 'open') || null });
});
app.post('/api/shift', (req, res) => {
  const u = req.u, b = req.body || {}, sid = Number(b.store_id) || u.store_id; if (!visibleStores(u).includes(sid) || !SHIFTS.includes(b.shift)) return deny(res);
  if (q1("SELECT 1 FROM shift_logs WHERE store_id=? AND status='open'", sid)) return err(res, '上一班交班单尚未被接班');
  const issues = (b.issues || []).map(x => ({ text: String(x.text || x).trim(), done: !!x.done, from: x.from || L.today() })).filter(x => x.text);
  const id = Number(run("INSERT INTO shift_logs(store_id,date,shift,by,issues,guest,equip,cash,status,created_at) VALUES(?,?,?,?,?,?,?,?,'open',?)", sid, L.today(), b.shift, u.id, JSON.stringify(issues), b.guest || '', b.equip || '', b.cash || '', L.nowStr()).lastInsertRowid);
  D.notify(q(USER_SQL + " WHERE u.active=1 AND u.store_id=? AND (r.name IN ('店助','前台经理','客房经理') OR r.name LIKE '前台%') AND u.id!=?", sid, u.id).map(x => x.id), 'shift', `${b.shift}交班单待接班`, `遗留问题 ${issues.filter(i => !i.done).length} 项`, '#/shift');
  res.json({ ok: true, id });
});
app.post('/api/shift/:id/take', (req, res) => {
  const u = req.u, s = q1('SELECT * FROM shift_logs WHERE id=?', req.params.id);
  if (!s || s.status !== 'open' || s.by === u.id || !visibleStores(u).includes(s.store_id)) return deny(res);
  run("UPDATE shift_logs SET status='taken', taken_by=?, taken_at=?, take_note=? WHERE id=?", u.id, L.nowStr(), (req.body || {}).note || '', s.id);
  D.notify([s.by], 'shift', `${u.name} 已接班`, (req.body || {}).note || '', '#/shift');
  res.json({ ok: true });
});
function seedBatchA() {
  if (D.getSetting('ba_seeded', 0)) return;
  D.tx(() => {
    const lead = q1(USER_SQL + " WHERE u.store_id=1 AND r.name='前台经理'"), next = q1(USER_SQL + " WHERE u.store_id=1 AND r.name='店助'");
    if (lead && next) {
      run("INSERT INTO shift_logs(store_id,date,shift,by,issues,guest,equip,cash,status,created_at,taken_by,taken_at) VALUES(1,?,'夜班',?,?,?,?,?,'taken',?,?,?)", L.addDays(L.today(), -1), lead.id, JSON.stringify([{ text: '1208 房客人投诉空调噪音，已换房，需回访', done: false, from: L.addDays(L.today(), -1) }, { text: '早餐咖啡机出水慢', done: true }]), '8 点有 12 人团队入住，需提前排房', '3 楼走廊筒灯不亮，已报修', '备用金 2000 元已核对', L.addDays(L.today(), -1) + ' 23:50', next.id, L.today() + ' 07:55');
      run("INSERT INTO shift_logs(store_id,date,shift,by,issues,guest,equip,cash,status,created_at) VALUES(1,?,'早班',?,?,?,?,?,'open',?)", L.today(), next.id, JSON.stringify([{ text: '1208 房客人投诉空调噪音，已换房，需回访', done: true }, { text: '团队房已排好，钥匙卡在前台抽屉', done: false }]), '1502 VIP 下午 3 点抵店，需水果欢迎', '', '备用金 2000 元已核对', L.today() + ' 14:58');
    }
    const st = q1(USER_SQL + " WHERE u.store_id=3 AND r.name='客房初级'");
    if (st) run("INSERT INTO pay_appeals(user_id,ym,item,reason,status,created_at) VALUES(?,?,'打扫提成','11 月 8 日 1106 房查房不合格是客人退房后弄乱的，申请撤销扣减','open',?)", st.id, L.today().slice(0, 7), L.nowStr());
    D.setSetting('ba_seeded', 1);
  });
}
seedBatchA();

const addDT = (dt, m) => { const d = new Date(dt.replace(' ', 'T') + ':00'); d.setMinutes(d.getMinutes() + m); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
// ---------- 客诉闭环 ----------
const CP_SLA = { 一般: 24, 严重: 4, 重大: 2 }, CP_SRC = ['当面', '电话', 'OTA 差评', '400 热线'], COMP_LIMIT = 200;
const cpOf = c => ({ ...c, late: c.status === 'open' && c.due_at < L.nowStr(), cb_due: c.status === 'handled' });
const CP_SQL = 'SELECT c.*, s.name store, x.name staff, o.name owner FROM complaints c LEFT JOIN stores s ON s.id=c.store_id LEFT JOIN users x ON x.id=c.staff_id LEFT JOIN users o ON o.id=c.owner_id';
app.get('/api/complaints', (req, res) => {
  const u = req.u, sids = visibleStores(u), sid = Number(req.query.store); if (sid && !sids.includes(sid)) return deny(res);
  const xs = q(CP_SQL + ` WHERE c.store_id IN (${(sid ? [sid] : sids).join(',') || 'NULL'}) ORDER BY c.id DESC LIMIT 80`).map(cpOf), d30 = L.addDays(L.today(), -30);
  const m = xs.filter(c => c.created_at >= d30), done = m.filter(c => c.status === 'closed');
  res.json({ list: xs, srcs: CP_SRC, levels: Object.keys(CP_SLA), sla: CP_SLA, comp_limit: COMP_LIMIT, staff: q(USER_SQL + ` WHERE u.active=1 AND u.store_id IN (${(sid ? [sid] : sids).join(',') || 'NULL'}) AND r.level='staff'`).map(x => ({ id: x.id, name: x.name, role_name: x.role_name })),
    kpi: { n30: m.length, open: xs.filter(c => c.status === 'open').length, late: xs.filter(c => c.late).length, ontime: m.filter(c => c.handled_at).length ? Math.round(m.filter(c => c.handled_at && c.handled_at <= c.due_at).length * 100 / m.filter(c => c.handled_at).length) : null, sat: done.length ? Math.round(done.reduce((a, c) => a + (c.cb_score || 0), 0) * 10 / done.length) / 10 : null, comp: m.reduce((a, c) => a + (c.comp_status === 'approved' ? c.comp_amt : 0), 0) },
    can_approve: ['region_manager', 'ops_manager'].includes(u.level) });
});
app.post('/api/complaints', (req, res) => {
  const u = req.u, b = req.body || {}, sid = Number(b.store_id) || u.store_id;
  if (!visibleStores(u).includes(sid) || !CP_SLA[b.level] || !(b.body || '').trim()) return err(res, '请填写投诉内容和等级');
  const owner = D.storeManagers(sid)[0], due = addDT(L.nowStr(), CP_SLA[b.level] * 60);
  const id = Number(run("INSERT INTO complaints(store_id,src,level,guest,room,body,staff_id,owner_id,status,due_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,'open',?,?,?)", sid, b.src || '当面', b.level, b.guest || '', b.room || '', b.body, Number(b.staff_id) || null, owner || null, due, u.id, L.nowStr()).lastInsertRowid);
  D.notify([owner, ...(b.level === '重大' ? D.regionUsers(q1('SELECT region_id FROM stores WHERE id=?', sid).region_id, 'ops_manager') : [])].filter(Boolean), 'complaint', `${b.level}客诉：${b.src || '当面'}`, `${b.body} · ${CP_SLA[b.level]} 小时内处理`, '#/complaints?store=' + sid);
  res.json({ ok: true, id });
});
app.post('/api/complaints/:id/:op', (req, res) => {
  const u = req.u, c = q1('SELECT * FROM complaints WHERE id=?', req.params.id), b = req.body || {}, op = req.params.op;
  if (!c || !visibleStores(u).includes(c.store_id)) return deny(res);
  const mgr = canManage(u, c.store_id) || u.role_name === '店助' || /经理$/.test(u.role_name);
  if (op === 'handle' && c.status === 'open' && mgr) {
    const amt = Number(b.comp_amt) || 0, cs = !amt ? 'none' : amt <= COMP_LIMIT ? 'approved' : 'pending';
    run("UPDATE complaints SET status='handled', handle_note=?, handled_at=?, comp_amt=?, comp_status=?, comp_kind=? WHERE id=?", b.note || '', L.nowStr(), amt, cs, b.comp_kind || '', c.id);
    if (cs === 'pending') D.notify(D.regionUsers(q1('SELECT region_id FROM stores WHERE id=?', c.store_id).region_id, 'ops_manager'), 'complaint', `客诉补偿待审批 ¥${amt}`, `${sname(c.store_id)}：${c.body}`, '#/complaints');
  } else if (op === 'comp' && c.comp_status === 'pending' && ['region_manager', 'ops_manager'].includes(u.level)) {
    run('UPDATE complaints SET comp_status=?, comp_by=? WHERE id=?', b.ok ? 'approved' : 'rejected', u.id, c.id);
    D.notify(D.storeManagers(c.store_id), 'complaint', `客诉补偿${b.ok ? '已批准' : '未批准'} ¥${c.comp_amt}`, c.body, '#/complaints?store=' + c.store_id);
  } else if (op === 'callback' && c.status === 'handled' && mgr && c.comp_status !== 'pending') {
    const sc = Number(b.score); if (!(sc >= 1 && sc <= 5)) return err(res, '请选择回访满意度');
    run("UPDATE complaints SET status='closed', cb_score=?, cb_note=?, closed_at=? WHERE id=?", sc, b.note || '', L.nowStr(), c.id);
  } else return deny(res);
  D.audit(u.id, c.store_id, '客诉' + { handle: '处理', comp: '补偿审批', callback: '回访关闭' }[op], c.body.slice(0, 30));
  res.json({ ok: true });
});
const cpPenalty = sid => { const d = L.addDays(L.today(), -30), xs = q('SELECT * FROM complaints WHERE store_id=? AND created_at>=?', sid, d).map(cpOf);
  return xs.filter(c => c.late).length * 4 + xs.filter(c => c.level !== '一般').length * 3 + xs.filter(c => c.cb_score && c.cb_score <= 2).length * 2; };

// ---------- 安全与应急 ----------
const SAFE_DEF = [['消防演练', '全员消防疏散演练', 90], ['应急预案演练', '停电 / 电梯困人应急演练', 180], ['特种设备年检', '电梯、锅炉年检', 365], ['消防设施巡检', '灭火器、消防栓、应急灯巡检', 30], ['食品留样', '早餐留样 48 小时', 1]];
const safeOf = sid => q('SELECT * FROM safety_plans WHERE store_id=? ORDER BY next_date', sid).map(p => ({ ...p, late: p.next_date < L.today(), soon: p.next_date >= L.today() && p.next_date <= L.addDays(L.today(), 7), last: q1('SELECT l.*, u.name by_name FROM safety_logs l LEFT JOIN users u ON u.id=l.by WHERE l.plan_id=? ORDER BY l.id DESC LIMIT 1', p.id) }));
const safePenalty = sid => { const ps = safeOf(sid); return ps.filter(p => p.late).length * 8 + q("SELECT COUNT(*) n FROM safety_logs WHERE store_id=? AND result='bad' AND date>=?", sid, L.addDays(L.today(), -90))[0].n * 5; };
app.get('/api/safety', (req, res) => {
  const u = req.u, sids = visibleStores(u), sid = Number(req.query.store);
  if (sid && !sids.includes(sid)) return deny(res);
  if (sid) return res.json({ store: sname(sid), plans: safeOf(sid), logs: q('SELECT l.*, p.kind, u.name by_name FROM safety_logs l JOIN safety_plans p ON p.id=l.plan_id LEFT JOIN users u ON u.id=l.by WHERE l.store_id=? ORDER BY l.id DESC LIMIT 20', sid) });
  res.json({ stores: sids.map(s => { const ps = safeOf(s); return { id: s, name: sname(s), late: ps.filter(p => p.late).length, soon: ps.filter(p => p.soon).length, n: ps.length }; }) });
});
app.post('/api/safety/:pid', (req, res) => {
  const u = req.u, p = q1('SELECT * FROM safety_plans WHERE id=?', req.params.pid), b = req.body || {};
  if (!p || !visibleStores(u).includes(p.store_id) || !['ok', 'bad'].includes(b.result)) return deny(res);
  if (p.kind !== '食品留样' && !b.photo) return err(res, '请上传现场照片');
  run('INSERT INTO safety_logs(plan_id,store_id,date,by,result,note,photo) VALUES(?,?,?,?,?,?,?)', p.id, p.store_id, L.today(), u.id, b.result, b.note || '', b.photo || '');
  run('UPDATE safety_plans SET last_date=?, next_date=? WHERE id=?', L.today(), L.addDays(L.today(), p.cycle), p.id);
  if (b.result === 'bad') D.notify(D.storeManagers(p.store_id), 'safety', `${p.kind}发现问题`, b.note || '', '#/safety?store=' + p.store_id);
  D.audit(u.id, p.store_id, '安全记录', `${p.kind} ${b.result === 'ok' ? '合格' : '有问题'}`);
  res.json({ ok: true });
});

// ---------- 排班与人效 ----------
const SH_K = ['早', '中', '夜', '休'];
const canSched = (u, x) => apprOk(u, x.store_id) || leads(u, x.id);
const hmMin = hm => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const SH_ORDER = ['店助', '前台经理', '前台', '客房经理', '客房', '餐厅', '保安', '工程'];
function schedOf(sid, from, u) {
  const us = q(USER_SQL + " WHERE u.active=1 AND u.store_id=? AND r.level='staff'", sid), days = [...Array(7)].map((_, i) => L.addDays(from, i));
  const all = [...[...Array(7)].map((_, i) => L.addDays(from, i - 7)), ...days], M = Object.fromEntries(all.map(d => [d, D.shiftMap(sid, d)])), SD = D.SHIFT_DEF;
  const ord = r => { const i = SH_ORDER.indexOf(r.g); return i < 0 ? 99 : i; };
  const rows = us.map(x => ({ id: x.id, name: x.name, role_name: x.role_name, g: D.shiftGroup(x.role_name), opts: [...D.roleShifts(x.role_name), D.restCode(x.role_name)], edit: !!u && canSched(u, x), cells: days.map(d => M[d].get(x.id)) })).sort((a, b) => ord(a) - ord(b) || a.id - b.id);
  const issues = [], rooms = q1('SELECT rooms FROM stores WHERE id=?', sid)?.rooms || 100, need = Math.ceil(rooms * 0.85 * 0.6 / 13);
  const d1 = [], hks = [];
  for (const d of days) {
    const cnt = {}; rows.forEach(r => { const c = M[d].get(r.id); cnt[c] = (cnt[c] || 0) + 1; });
    for (const c of ['A', 'B', 'C', 'D']) if (!cnt[c]) issues.push({ lv: 'bad', day: d, text: `${d.slice(5)} ${c} 班（${SD[c][0]} ${SD[c][1]}–${SD[c][2]}）无人在岗` });
    if (cnt.D === 1) d1.push(d.slice(5));
    hks.push(rows.filter(r => r.g === '客房' && M[d].get(r.id) === '常').length);
  }
  if (d1.length) issues.push({ lv: 'warn', day: days[0], text: `${d1.join('、')} 06:00 前餐厅只有 1 人，建议 2 人` });
  const hka = Math.round(hks.reduce((a, b) => a + b, 0) * 10 / hks.length) / 10;
  if (hka < need) issues.push({ lv: 'warn', day: days[0], text: `本周客房平均在岗 ${hka} 人，按房量约需 ${need} 人，可用计件或外包补位` });
  for (const r of rows) {
    let run0 = 0, prevEnd = null;
    all.forEach((d, i) => {
      const c = M[d].get(r.id), df = SD[c];
      if (!df || !df[1]) { run0 = 0; prevEnd = null; return; }
      const st = i * 1440 + hmMin(df[1]), en = i * 1440 + hmMin(df[2]) + (df[1] > df[2] ? 1440 : 0);
      if (i >= 7 && prevEnd != null && st - prevEnd < 720) issues.push({ lv: 'bad', day: d, uid: r.id, text: `${r.name} ${d.slice(5)} ${c} 班与上一班间隔不足 12 小时` });
      run0++; if (i >= 7 && run0 === 7) issues.push({ lv: 'bad', day: d, uid: r.id, text: `${r.name} 到 ${d.slice(5)} 已连续上班 7 天，需要安排休息（做六休一）` });
      prevEnd = en;
    });
  }
  issues.sort((a, b) => (a.lv === 'bad' ? 0 : 1) - (b.lv === 'bad' ? 0 : 1) || a.day.localeCompare(b.day));
  return { days, rows, issues, pub: q1('SELECT s.at, u.name FROM sched_pub s LEFT JOIN users u ON u.id=s.by WHERE s.store_id=? AND s.week=?', sid, from) || null };
}
function attendOf(sid, rows, days) {
  const t = L.today(), hm = L.nowHM(), SD = D.SHIFT_DEF;
  return rows.map(r => {
    const o = { id: r.id, name: r.name, role_name: r.role_name, work: 0, late: 0, early: 0, miss: 0, ot: 0, today: null };
    days.forEach((d, i) => {
      const c = r.cells[i], df = SD[c]; if (!df || !df[1] || d > t) return;
      const pu = Object.fromEntries(q('SELECT kind, at FROM punches WHERE user_id=? AND date=?', r.id, d).map(x => [x.kind, x.at]));
      if (d === t) { o.today = { code: c, in: pu.in || null, out: pu.out || null, late: !!pu.in && hmMin(pu.in) > hmMin(df[1]) + 5, absent: !pu.in && hm > df[1] && df[1] <= df[2] }; if (pu.in && hmMin(pu.in) > hmMin(df[1]) + 5) o.late++; return; }
      o.work++;
      const h1 = hx('pa' + r.id + d), h2 = hx('po' + r.id + d);
      if (!pu.in && h1 < 0.02) { o.miss++; return; }
      const inM = pu.in ? hmMin(pu.in) : hmMin(df[1]) + (h1 < 0.08 ? 5 + Math.round(h1 * 300) : -Math.round(h1 * 15));
      if (inM > hmMin(df[1]) + 5) o.late++;
      if (!pu.out && h2 < 0.03) o.early++; else if (!pu.out && h2 > 0.7) o.ot += Math.round((h2 - 0.7) * 300);
    });
    o.ot = Math.round(o.ot / 6) / 10; return o;
  });
}
function myShift(u) {
  if (u.level !== 'staff' || !u.store_id) return null;
  const t = L.today(), hm = L.nowHM(), y = L.addDays(t, -1), sid = u.store_id, SD = D.SHIFT_DEF, yc = D.shiftMap(sid, y).get(u.id), yd = SD[yc];
  let date = t, code = D.shiftMap(sid, t).get(u.id);
  if (yd && yd[1] && yd[1] > yd[2] && hm <= yd[2]) { date = y; code = yc; }
  const df = SD[code] || SD['常'], rot = D.roleShifts(u.role_name), i = rot.indexOf(code), g = D.shiftGroup(u.role_name);
  const peers = q(USER_SQL + " WHERE u.store_id=? AND u.active=1 AND r.level='staff' AND u.id!=?", sid, u.id).filter(p => D.shiftGroup(p.role_name) === g);
  const who = (c, dt) => peers.filter(p => D.shiftMap(sid, dt).get(p.id) === c).map(p => p.name);
  const ring = rot.length > 1 && i >= 0, pc = ring ? rot[(i + rot.length - 1) % rot.length] : null, nc = ring ? rot[(i + 1) % rot.length] : null;
  const pu = Object.fromEntries(q('SELECT kind, at FROM punches WHERE user_id=? AND date=?', u.id, date).map(r => [r.kind, r.at]));
  const night = !!df[1] && df[1] > df[2];
  return { date, code, label: df[0], start: df[1], end: df[2], rest: !df[1],
    prev: pc && { code: pc, names: who(pc, i === 0 ? L.addDays(date, -1) : date) }, next: nc && { code: nc, names: who(nc, night ? L.addDays(date, 1) : date) }, punch: pu };
}
function laborOf(sid) {
  const t = L.today(), f30 = L.addDays(t, -30), b = bizRange(sid, f30, L.addDays(t, -1)), rooms = q1('SELECT rooms FROM stores WHERE id=?', sid).rooms;
  const us = q(USER_SQL + " WHERE u.active=1 AND u.store_id=? AND r.level IN ('staff','store_manager')", sid), rn = Math.round(rooms * b.occ * 30), rev = Math.round(b.revpar * rooms * 30);
  const cost = us.reduce((a, x) => a + (BASE_PAY[x.role_name] || 4500) * 1.35, 0), ot = us.map(x => ({ id: x.id, name: x.name, role_name: x.role_name, ot: Math.round(hx('ot' + x.id + t.slice(0, 7)) * 26) }));
  const hk = us.filter(x => /^客房(高级|中级|初级)$/.test(x.role_name)).map(x => { const c = commOf(x), h = 8 * 22 + ot.find(o => o.id === x.id).ot; return { id: x.id, name: x.name, rooms: c?.count || 0, hours: h, per_h: Math.round((c?.count || 0) * 10 / h) / 10, amount: c?.amount || 0 }; }).sort((a, b) => b.per_h - a.per_h);
  return { rooms, staff: us.length, ratio: Math.round(us.length * 100 / rooms) / 100, rn, rn_per: Math.round(rn / Math.max(1, us.length)), rev, cost: Math.round(cost), cost_rate: rev ? Math.round(cost * 1000 / rev) / 10 : null, ot: ot.sort((a, b) => b.ot - a.ot), ot_total: ot.reduce((a, x) => a + x.ot, 0), hk, std: { ratio: 0.1, cost_rate: 8, ot: 20 } };
}
app.get('/api/labor', (req, res) => {
  const u = req.u, sids = visibleStores(u), sid = Number(req.query.store) || u.store_id;
  if (!sids.includes(sid) || (u.level === 'staff' && !LEADS[u.role_name] && !apprOk(u, sid))) return deny(res);
  const mon = L.addDays(L.today(), -((new Date(L.today()).getDay() + 6) % 7)), from = req.query.from || mon;
  const lo = laborOf(sid); if (!daCan(u, 'pay')) lo.hk = lo.hk.map(x => ({ ...x, amount: null }));
  if (u.level === 'staff') { lo.cost = null; lo.cost_rate = null; }
  const sched = schedOf(sid, from, u);
  res.json({ store: sname(sid), store_id: sid, ...lo, sched, from, defs: D.SHIFT_DEF, attend: attendOf(sid, sched.rows, sched.days), can_edit: sched.rows.some(r => r.edit), can_pub: apprOk(u, sid),
    region: isRegion(u) ? sids.map(s => { const l = laborOf(s); return { id: s, name: sname(s), ratio: l.ratio, cost_rate: l.cost_rate, ot_total: l.ot_total, rn_per: l.rn_per }; }) : null, simulated: true });
});
app.post('/api/labor/shift', (req, res) => {
  const u = req.u, b = req.body || {}, x = q1(USER_SQL + ' WHERE u.id=?', b.uid);
  if (!x || !canSched(u, x)) return deny(res, '只能给自己负责的员工排班');
  if (![...D.roleShifts(x.role_name), D.restCode(x.role_name), '休'].includes(b.shift) || !/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) return err(res, '该岗位没有这个班次');
  run('INSERT INTO schedules(store_id,user_id,date,shift) VALUES(?,?,?,?) ON CONFLICT(user_id,date) DO UPDATE SET shift=excluded.shift', x.store_id, x.id, b.date, b.shift);
  D.shiftReset(); if (b.date >= L.today()) D.refreshPending(x.store_id, b.date, L.addDays(b.date, 1));
  res.json({ ok: true });
});
app.post('/api/labor/publish', (req, res) => {
  const u = req.u, b = req.body || {}, sid = Number(b.store_id);
  if (!apprOk(u, sid)) return deny(res, '由店长或获得审批授权的负一层发布');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.from || '')) return err(res, '请选择排班周');
  const s = schedOf(sid, b.from, u), bad = s.issues.filter(i => i.lv === 'bad');
  if (bad.length) return err(res, `还有 ${bad.length} 个问题要先处理：${bad.slice(0, 3).map(i => i.text).join('；')}`);
  run('INSERT INTO sched_pub(store_id,week,by,at) VALUES(?,?,?,?) ON CONFLICT(store_id,week) DO UPDATE SET by=excluded.by, at=excluded.at', sid, b.from, u.id, L.nowStr());
  D.notify(s.rows.map(r => r.id), 'assign', `${b.from.slice(5)} 起一周排班已发布`, `${sname(sid)} · ${u.name} 发布`, '#/home');
  D.audit(u.id, sid, '发布排班', b.from); res.json({ ok: true });
});
app.get('/api/onduty', (req, res) => {
  const u = req.u, sid = Number(req.query.store) || u.store_id; if (!sid || !visibleStores(u).includes(sid)) return deny(res);
  const t = L.today(), hm = L.nowHM(), m = D.shiftMap(sid, t), py = D.shiftMap(sid, L.addDays(t, -1)), SD = D.SHIFT_DEF;
  const us = q(USER_SQL + " WHERE u.store_id=? AND u.active=1 AND r.level='staff'", sid), on = us.filter(x => D.onShift(sid, x.id, t, hm)), G = {};
  for (const x of on) { const c = m.get(x.id), df = SD[c], cur = df && df[1] && (df[1] <= df[2] ? hm >= df[1] && hm <= df[2] : hm >= df[1]) ? c : py.get(x.id); (G[D.shiftGroup(x.role_name)] ||= []).push({ name: x.name, role_name: x.role_name, code: cur }); }
  const HO = [['06:00', '餐厅到岗备早餐'], ['07:00', '开餐'], ['08:00', '前台夜班交白班 · 保安交接 · 客房到岗'], ['14:00', '餐厅下班'], ['17:30', '客房下班交接'], ['20:00', '前台白班交夜班 · 保安上岗']];
  const nx = HO.find(h => h[0] > hm) || HO[0], night = hm >= '20:00' || hm < '08:00';
  const gaps = [...(!G['前台'] && !G['前台经理'] ? ['前台没有人在岗'] : []), ...(night && !G['保安'] ? ['夜间保安没有人在岗'] : [])];
  const ord = g => { const i = SH_ORDER.indexOf(g); return i < 0 ? 99 : i; };
  res.json({ now: hm, on: on.length, total: us.length, groups: Object.entries(G).map(([g, xs]) => ({ g, xs })).sort((a, b) => ord(a.g) - ord(b.g)), next: { at: nx[0], text: nx[1] }, gaps });
});
app.post('/api/punch', (req, res) => {
  const u = req.u, s = myShift(u), k = (req.body || {}).kind; if (!s) return deny(res, '只有门店员工需要打卡');
  if (s.rest) return err(res, '今天休息，不需要打卡');
  if (!['in', 'out'].includes(k)) return err(res, '操作无效');
  if (k === 'out' && !s.punch.in) return err(res, '请先打上班卡');
  if (s.punch[k]) return err(res, '已经打过卡了');
  const at = L.nowHM(); run('INSERT OR IGNORE INTO punches(user_id,date,kind,at) VALUES(?,?,?,?)', u.id, s.date, k, at);
  const late = k === 'in' && hmMin(at) > hmMin(s.start) + 5 && s.start <= s.end;
  res.json({ ok: true, at, msg: k === 'in' ? (late ? `已打卡 ${at}，迟到` : `上班打卡 ${at}`) : `下班打卡 ${at}` });
});


// ---------- 供应商评价 ----------
const supOfCat = cat => q1('SELECT * FROM suppliers WHERE cats LIKE ?', '%' + cat + '%');
function supStats(sids) {
  return q('SELECT * FROM suppliers ORDER BY id').map(s => {
    const rs = q(`SELECT r.*, st.name store FROM supplier_ratings r LEFT JOIN stores st ON st.id=r.store_id WHERE r.supplier_id=? AND r.store_id IN (${sids.join(',') || 'NULL'}) ORDER BY r.id DESC`, s.id);
    const avg = k => (rs.length ? Math.round(rs.reduce((a, r) => a + r[k], 0) * 10 / rs.length) / 10 : null);
    const sc = rs.length ? Math.round((avg('on_time') * 0.4 + avg('quality') * 0.4 + avg('price') * 0.2) * 20) : null;
    return { ...s, n: rs.length, on_time: avg('on_time'), quality: avg('quality'), price: avg('price'), score: sc, issues: rs.filter(r => r.quality <= 2 || r.on_time <= 2).length, recent: rs.slice(0, 4), level: sc == null ? '-' : sc >= 85 ? '优选' : sc >= 70 ? '合格' : '待改进' };
  });
}
app.get('/api/suppliers', (req, res) => { const u = req.u; if (u.level === 'staff' && u.role_name !== '店助') return deny(res); res.json({ list: supStats(visibleStores(u)).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)) }); });

function seedBatchB() {
  if (D.getSetting('bb_seeded', 0)) return;
  const t = L.today(), sids = q('SELECT id FROM stores').map(x => x.id);
  D.tx(() => {
    for (const s of sids) SAFE_DEF.forEach(([k, title, cyc], i) => { const last = L.addDays(t, -Math.floor(hx('sf' + s + k) * cyc * 1.15) - (cyc === 1 ? 0 : 1)); run('INSERT INTO safety_plans(store_id,kind,title,cycle,last_date,next_date) VALUES(?,?,?,?,?,?)', s, k, title, cyc, last, L.addDays(last, cyc)); });
    for (const s of sids) for (const p of q('SELECT * FROM safety_plans WHERE store_id=? AND cycle>1', s)) run('INSERT INTO safety_logs(plan_id,store_id,date,by,result,note,photo) VALUES(?,?,?,?,?,?,?)', p.id, s, p.last_date, D.storeManagers(s)[0] || null, hx('sr' + p.id) < 0.15 ? 'bad' : 'ok', hx('sr' + p.id) < 0.15 ? '应急灯 2 处不亮，已报修' : '按预案完成', '');
    [['华洁布草洗涤', '布草'], ['洁丽雅客用品', '客用品'], ['梦洁酒店床品', '床品'], ['鲜丰早餐食材', '早餐原料'], ['本地五金工程', '工程备件']].forEach(([n, c]) => run('INSERT INTO suppliers(name,cats) VALUES(?,?)', n, c));
    for (const s of sids) for (const sp of q('SELECT * FROM suppliers')) for (let i = 0; i < 3; i++) { const h = hx('sp' + s + sp.id + i), bad = sp.id === 4 && h < 0.5;
      run('INSERT INTO supplier_ratings(supplier_id,store_id,on_time,quality,price,note,by,at) VALUES(?,?,?,?,?,?,?,?)', sp.id, s, bad ? 2 : 4 + (h > 0.5 ? 1 : 0), bad ? 3 : 4 + (h > 0.7 ? 1 : 0), 3 + (h > 0.3 ? 1 : 0), bad ? '早餐面包晚到 40 分钟，影响开餐' : '', D.storeManagers(s)[0] || null, L.addDays(t, -i * 9 - 2) + ' 10:00'); }
    const cps = [[1, 'OTA 差评', '一般', '携程', '1206', '隔音差，夜里被走廊声音吵醒', -3, 'closed', 4], [1, '当面', '严重', '王先生', '1508', '入住时房间未打扫，等待 40 分钟', -1, 'handled', null], [3, '电话', '一般', '李女士', '806', '早餐 9 点后补餐不及时', 0, 'open', null], [3, 'OTA 差评', '严重', '美团', '1102', '卫生间有头发，床单有污渍', -2, 'closed', 2], [2, '当面', '一般', '陈先生', '603', '空调遥控器失灵', -5, 'closed', 5]];
    for (const [s, src, lv, g, rm, body, off, st, cb] of cps) { const hk = q1(USER_SQL + " WHERE u.store_id=? AND r.name LIKE '客房%级'", s), at = L.addDays(t, off) + ' 09:30', due = addDT(at, CP_SLA[lv] * 60);
      run('INSERT INTO complaints(store_id,src,level,guest,room,body,staff_id,owner_id,status,due_at,created_by,created_at,handle_note,handled_at,comp_amt,comp_status,cb_score,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        s, src, lv, g, rm, body, /卫生|打扫|头发/.test(body) ? hk?.id : null, D.storeManagers(s)[0] || null, st, off === 0 ? addDT(L.nowStr(), -60) : due, D.storeManagers(s)[0] || null, off === 0 ? addDT(L.nowStr(), -24 * 60 - 60) : at, st === 'open' ? null : '已致歉并处理', st === 'open' ? null : addDT(at, 60), lv === '严重' ? 300 : 0, lv === '严重' ? (st === 'handled' ? 'pending' : 'approved') : 'none', cb, st === 'closed' ? addDT(at, 26 * 60) : null); }
    D.setSetting('bb_seeded', 1);
  });
}
seedBatchB();

// ---------- 第三批：教练 / 店长驾驶舱 / 多店 / 90 天上手 / 能力诊断 / 工作日历 / 敬业度 / 总部 ----------
const smStores = uid => q('SELECT store_id FROM user_stores WHERE user_id=?', uid).map(x => x.store_id);
const smList = rid => q(USER_SQL + " WHERE u.active=1 AND u.region_id=? AND r.level='store_manager' ORDER BY u.id", rid);
const isCoach = u => ['coach', 'region_manager', 'hq'].includes(u.level);
const CAP = [['biz', '经营', '店长班 · 收益与预算管理', '每周一起看经营周报，定出房价与渠道动作'], ['brand', '标准', '品牌认证复训', '陪同做一次快速巡检，现场讲解清零项'], ['team', '团队', '经理班 · 团队与梯队', '一起梳理梯队，确定 1 名可培养的储备'],
  ['ops', '执行', '店长班 · 班次节奏', '检查固定工作清单的抽查记录，纠正一个班次'], ['guest', '客诉', '店长班 · 宾客关系', '复盘近 30 天客诉，确定 2 条服务改进'], ['cost', '成本', '店长班 · 成本与采购', '对照统购率和人工成本率，确定一项降本动作']];
function smDiag(uid) {
  const sids = smStores(uid); if (!sids.length) return null;
  const all = regionScores(regionOfStore(sids[0])).all, mine = all.filter(x => sids.includes(x.id)); if (!mine.length) return null;
  const avg = k => Math.round(mine.reduce((a, x) => a + x.dims[k], 0) / mine.length);
  const pr = sids.map(procOf).filter(p => p.rate != null), procA = pr.length ? pr.reduce((a, p) => a + Math.min(100, p.rate * 100 / p.target), 0) / pr.length : 100;
  const lab = sids.map(laborOf), labA = lab.reduce((a, l) => a + clamp(100 - Math.max(0, l.cost_rate - 8) * 5 - Math.max(0, l.ot_total / l.staff - 20) * 2), 0) / lab.length;
  const val = { biz: avg('biz'), brand: avg('brand'), team: Math.round(avg('team') * 0.5 + stabOf(sids) * 0.5), ops: avg('ops'), guest: avg('guest'), cost: clamp(Math.round(procA * 0.6 + labA * 0.4)) };
  const best = k => k === 'cost' ? null : all.filter(x => !sids.includes(x.id)).sort((a, b) => b.dims[k] - a.dims[k])[0];
  const caps = CAP.map(([k, l, course, act]) => { const v = val[k], p1 = clamp(Math.round(v + (hx('dg1' + uid + k) - 0.6) * 10)), p2 = clamp(Math.round(p1 + (hx('dg2' + uid + k) - 0.6) * 10)), b = best(k);
    return { k, l, v, trend: [p2, p1, v], course, act, bench: b && b.dims[k] > v ? { id: b.id, name: b.name, v: b.dims[k] } : null }; });
  const weak = [...caps].sort((a, b) => a.v - b.v).filter((c, i) => i === 0 || c.v < 80).slice(0, 2);
  return { sids, caps, weak: weak.map(w => w.k), total: Math.round(caps.reduce((a, c) => a + c.v, 0) / caps.length) };
}
app.get('/api/diag/:uid', (req, res) => {
  const x = q1(USER_SQL + ' WHERE u.id=?', req.params.uid); if (!x || x.level !== 'store_manager') return err(res, '仅适用于店长');
  if (!(x.id === req.u.id || (isRegion(req.u) && sameRegion(req.u, x)))) return deny(res);
  res.json({ user: { id: x.id, name: x.name }, ...smDiag(x.id), sim: true });
});
const CK_W = { 客诉回访: 3, 客诉: 3, 安全: 3, 上岗门槛: 3, 超时: 2, 整改: 2, 补偿审批: 3, 离职预警: 2 };
const CK_ACT = { 待接班: '确认接班，未完成的问题安排到人', 物料盘点: '指派店助今天完成盘点', 周报: '一键提交周报', 待点评: '逐条点评，给做得好的员工点肯定', 提升计划: '更新提升计划进度', 离职预警: '安排一次一对一谈话' };
app.get('/api/cockpit', async (req, res) => {
  const u = req.u; if (u.level !== 'store_manager') return deny(res);
  const sids = visibleStores(u), sid = Number(req.query.store) || sids[0];
  const ib = await (await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/inbox?store=${sid}`, { headers: { 'x-user-id': String(u.id) } })).json();
  const items = (Array.isArray(ib) ? ib : []).map(x => ({ ...x, w: ({ bad: 3, warn: 2, acc: 1 }[x.lv] || 1) * 2 + (Object.entries(CK_W).find(([k]) => (x.tag || '').includes(k))?.[1] || 0), how: CK_ACT[x.tag] || (x.lv === 'bad' ? '今天必须处理' : '今天内处理') })).sort((a, b) => b.w - a.w).slice(0, 3);
  const dg = smDiag(u.id), wk = dg && dg.caps.find(c => c.k === dg.weak[0]);
  if (wk && items.length < 3) items.push({ tag: '能力提升', lv: 'acc', title: `本月短板：${wk.l}（${wk.v} 分）`, how: wk.act, link: '#/diag?uid=' + u.id });
  const multi = sids.length > 1 ? sids.map(s => multiOf(s)) : null;
  res.json({ items, multi, onboard: q1('SELECT 1 FROM onboard_plan WHERE user_id=?', u.id) ? obOf(u.id).pct : null });
});
function multiOf(sid) {
  const sc = storeScore(sid), t = L.today();
  const rl = q1("SELECT COUNT(*) n FROM rectifications WHERE store_id=? AND status!='closed' AND deadline<?", sid, t).n;
  const cp = q("SELECT * FROM complaints WHERE store_id=? AND status!='closed'", sid).map(cpOf), cl = cp.filter(c => c.late).length, sl = safeOf(sid).filter(p => p.late).length;
  const od = q1("SELECT COUNT(*) n FROM instances WHERE store_id=? AND date=? AND status='pending' AND due_time<?", sid, t, L.nowHM()).n;
  const asg = q1("SELECT u.name FROM users u JOIN roles r ON r.id=u.role_id WHERE u.store_id=? AND r.name='店助' AND u.active=1", sid)?.name;
  const lv = rl >= 3 || cl || sl || sc.grade === 'D' ? 'bad' : rl || cp.length || od > 3 || sc.grade === 'C' ? 'warn' : 'ok';
  const why = [rl && `整改逾期 ${rl}`, cl && `客诉超时 ${cl}`, sl && `安全逾期 ${sl}`, cp.length && !cl && `客诉处理中 ${cp.length}`, od && `任务超时 ${od}`].filter(Boolean);
  return { id: sid, name: sname(sid), grade: sc.grade, total: sc.total, lv, why, assistant: asg || null };
}
const OB_STEPS = [['d1', '第 1 周', '熟悉门店档案、画像与证照', 7, '#/home?pl=shop'], ['d2', '第 1 周', '与核心员工逐一面谈，认识团队', 7, '#/team'], ['d3', '第 1 周', '检查安全计划与特种设备年检', 7, '#/safety'],
  ['w1', '第 2-4 周', '掌握班次节奏与固定工作清单', 28, '#/tasks'], ['w2', '第 2-4 周', '独立完成一次快速巡检', 28, '#/patrol'], ['w3', '第 2-4 周', '主持值班交接班', 28, '#/shift'], ['w4', '第 2-4 周', '独立处理一次客诉全流程', 28, '#/complaints'],
  ['m1', '第 2-3 月', '独立完成一次月度经营复盘', 60, '#/home?pl=biz'], ['m2', '第 2-3 月', '针对画像短板制定提升计划', 75, '#/diag'], ['m3', '第 2-3 月', '取得店长班认证', 90, '#/train']];
function obOf(uid) {
  const pl = q1('SELECT * FROM onboard_plan WHERE user_id=?', uid); if (!pl) return null;
  const rows = Object.fromEntries(q('SELECT o.*, u.name ok_name FROM onboard o LEFT JOIN users u ON u.id=o.ok_by WHERE o.user_id=?', uid).map(r => [r.step, r])), t = L.today();
  const steps = OB_STEPS.map(([k, phase, title, d, link]) => { const r = rows[k] || {}, due = L.addDays(pl.start, d), done = k === 'm3' ? (smCertified(uid) ? r.done_at || t : null) : r.done_at;
    return { k, phase, title, link: k === 'm2' ? '#/diag?uid=' + uid : link, due, done_at: done || null, note: r.note || '', ok_at: r.ok_at || (k === 'm3' && done ? done : null), ok_name: r.ok_name || (k === 'm3' && done ? '培训认证' : null), late: !done && due < t }; });
  const ok = steps.filter(s => s.ok_at).length;
  return { start: pl.start, day: dBetween(pl.start, t) + 1, coach: q1('SELECT name FROM users WHERE id=?', pl.coach_id)?.name, coach_id: pl.coach_id, steps, pct: Math.round(ok * 100 / steps.length), wait: steps.filter(s => s.done_at && !s.ok_at).length };
}
app.get('/api/onboard/:uid', (req, res) => {
  const x = q1(USER_SQL + ' WHERE u.id=?', req.params.uid); if (!x) return deny(res);
  if (!(x.id === req.u.id || (isRegion(req.u) && sameRegion(req.u, x)))) return deny(res);
  const o = obOf(x.id); res.json(o ? { user: { id: x.id, name: x.name }, ...o, can_ok: isCoach(req.u) || req.u.id === o.coach_id, me: x.id === req.u.id } : { user: { id: x.id, name: x.name }, none: true });
});
app.post('/api/onboard/:uid/:k', (req, res) => {
  const uid = Number(req.params.uid), k = req.params.k, o = obOf(uid); if (!o || !OB_STEPS.find(s => s[0] === k) || k === 'm3') return err(res, '该项不可操作');
  const s = o.steps.find(x => x.k === k);
  if (req.body.op === 'done') { if (req.u.id !== uid) return deny(res);
    run('INSERT INTO onboard(user_id,step,done_at,note) VALUES(?,?,?,?) ON CONFLICT(user_id,step) DO UPDATE SET done_at=excluded.done_at, note=excluded.note', uid, k, L.today(), req.body.note || '');
    if (o.coach_id) D.notify([o.coach_id], 'onboard', `${q1('SELECT name FROM users WHERE id=?', uid).name} 完成「${s.title}」，待验收`, req.body.note || '', '#/onboard?uid=' + uid);
  } else if (req.body.op === 'ok') { if (!(isCoach(req.u) || req.u.id === o.coach_id)) return deny(res); if (!s.done_at) return err(res, '店长尚未完成');
    run('UPDATE onboard SET ok_by=?, ok_at=? WHERE user_id=? AND step=?', req.u.id, L.today(), uid, k); D.notify([uid], 'onboard', `「${s.title}」已验收`, '', '#/onboard?uid=' + uid);
  } else return err(res, '操作无效');
  D.audit(req.u.id, null, '90 天上手', `${uid} ${k} ${req.body.op}`); res.json({ ok: true });
});
app.get('/api/coach', (req, res) => {
  if (!isCoach(req.u)) return deny(res);
  const rid = req.u.region_id, t = L.today();
  const sms = smList(rid).map(m => { const dg = smDiag(m.id), ob = obOf(m.id), last = q1('SELECT * FROM coach_logs WHERE sm_id=? ORDER BY date DESC, id DESC LIMIT 1', m.id), ms = smStores(m.id).map(multiOf);
    const todo = [...(dg ? dg.caps.filter(c => dg.weak.includes(c.k)).map(c => `${c.l} ${c.v} 分：${c.act}`) : []), ...(ob && ob.wait ? [`90 天上手：${ob.wait} 项待验收`] : []), ...(!smCertified(m.id) ? ['未取得店长班认证，安排报名'] : [])];
    const pri = (ms.some(s => s.lv === 'bad') ? 3 : 0) + (dg ? (80 - Math.min(80, dg.total)) / 5 : 0) + (ob ? 2 : 0) + (!last || dBetween(last.date, t) > 14 ? 1 : 0);
    return { id: m.id, name: m.name, stores: ms, diag: dg && { total: dg.total, weak: dg.caps.filter(c => dg.weak.includes(c.k)).map(c => ({ k: c.k, l: c.l, v: c.v })) }, onboard: ob && { pct: ob.pct, day: ob.day, wait: ob.wait }, cert: !!smCertified(m.id), last, todo, pri };
  }).sort((a, b) => b.pri - a.pri);
  const exc = [];
  visibleStores(req.u).forEach(sid => { const n = sname(sid);
    q("SELECT * FROM complaints WHERE store_id=? AND comp_status='pending'", sid).forEach(c => exc.push({ lv: 'warn', tag: '补偿审批', title: `${n}：${c.body}`, sub: `补偿 ¥${c.comp_amt}`, link: '#/complaints' }));
    q("SELECT * FROM complaints WHERE store_id=? AND status!='closed' AND level='重大'", sid).forEach(c => exc.push({ lv: 'bad', tag: '重大客诉', title: `${n}：${c.body}`, sub: '', link: '#/complaints' }));
    const sl = safeOf(sid).filter(p => p.late); if (sl.length) exc.push({ lv: 'bad', tag: '安全逾期', title: `${n}：${sl.map(p => p.kind).join('、')}`, sub: '系统已提醒店长', link: '#/safety?store=' + sid });
    const rl = q1("SELECT COUNT(*) n FROM rectifications WHERE store_id=? AND status!='closed' AND deadline<?", sid, L.addDays(t, -3)).n; if (rl) exc.push({ lv: 'warn', tag: '整改久拖', title: `${n}：${rl} 条整改逾期超过 3 天`, sub: '自动提醒无效，需要介入', link: '#/rect' });
  });
  res.json({ sms, exc, logs: q('SELECT l.*, u.name sm_name FROM coach_logs l JOIN users u ON u.id=l.sm_id WHERE l.coach_id=? ORDER BY l.date DESC, l.id DESC LIMIT 10', req.u.id), auto: ['任务提醒与超时升级', '整改到期提醒与复查安排', '统购率、库存与盘点预警', '证照、安全计划到期提醒', '新店长上手进度提醒'] });
});
app.post('/api/coach/log', (req, res) => {
  if (!isCoach(req.u)) return deny(res); const b = req.body, sm = q1(USER_SQL + ' WHERE u.id=?', b.sm_id);
  if (!sm || sm.level !== 'store_manager' || !(b.topic || '').trim()) return err(res, '请选择店长并填写辅导主题');
  run('INSERT INTO coach_logs(sm_id,coach_id,date,topic,note,next) VALUES(?,?,?,?,?,?)', sm.id, req.u.id, L.today(), b.topic, b.note || '', b.next || '');
  D.notify([sm.id], 'coach', `${req.u.name} 的辅导记录：${b.topic}`, b.next ? '下一步：' + b.next : '', '#/diag?uid=' + sm.id); res.json({ ok: true });
});
app.get('/api/wcal', (req, res) => {
  if (!isRegion(req.u)) return deny(res);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : L.addDays(L.today(), -((new Date(L.today()).getDay() + 6) % 7)), to = L.addDays(from, 13), rid = req.u.region_id, sids = visibleStores(req.u), ph = sids.map(() => '?').join(','), xs = [];
  const add = (date, kind, title, link) => xs.push({ date, kind, title, link });
  q(`SELECT * FROM patrols WHERE store_id IN (${ph}) AND status='planned' AND planned_date BETWEEN ? AND ?`, ...sids, from, to).forEach(p => add(p.planned_date, p.kind === 'mystery' ? '神秘访客' : '巡店', sname(p.store_id) + (p.reason ? ' · ' + p.reason : ''), '#/patrol'));
  q('SELECT * FROM train_classes WHERE region_id=? AND start BETWEEN ? AND ?', rid, from, to).forEach(c => add(c.start, '开班', c.name, '#/train'));
  q(`SELECT n.*, p.name pname FROM project_nodes n JOIN projects p ON p.id=n.project_id WHERE n.actual_date IS NULL AND n.plan_date BETWEEN ? AND ?`, from, to).forEach(n => add(n.plan_date, '项目节点', `${n.pname} · ${n.name}`, '#/project/' + n.project_id));
  sids.forEach(s => safeOf(s).filter(p => p.next_date >= from && p.next_date <= to && p.cycle > 1).forEach(p => add(p.next_date, '安全', `${sname(s)} · ${p.kind}`, '#/safety?store=' + s)));
  smList(rid).forEach(m => { const o = obOf(m.id); if (o) o.steps.filter(s => !s.ok_at && s.due >= from && s.due <= to).forEach(s => add(s.due, '上手验收', `${m.name} · ${s.title}`, '#/onboard?uid=' + m.id)); });
  q('SELECT * FROM coach_logs WHERE coach_id=? AND date BETWEEN ? AND ?', req.u.id, from, to).forEach(l => add(l.date, '辅导', l.topic, '#/coach'));
  q('SELECT * FROM cal_events WHERE region_id=? AND date BETWEEN ? AND ?', rid, from, to).forEach(e => add(e.date, e.kind, (e.store_id ? sname(e.store_id) + ' · ' : '') + e.title, ''));
  res.json({ from, to, items: xs.sort((a, b) => a.date.localeCompare(b.date)), kinds: ['业主沟通会', '区域例会', '门店走访', '其他'] });
});
app.post('/api/wcal', (req, res) => {
  if (!isRegion(req.u)) return deny(res); const b = req.body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '') || !(b.title || '').trim()) return err(res, '请填写日期和事项');
  run('INSERT INTO cal_events(region_id,date,kind,title,store_id,by) VALUES(?,?,?,?,?,?)', req.u.region_id, b.date, b.kind || '其他', b.title, Number(b.store_id) || null, req.u.id); res.json({ ok: true });
});
const EG_Q = ['我清楚自己每天要做什么', '我的付出能得到认可', '店长关心我的成长', '我愿意推荐朋友来这里工作', '一年后我仍打算在这里工作'];
const quarter = d => d.slice(0, 4) + '-Q' + (Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1);
const prevQ = qq => { const [y, n] = [Number(qq.slice(0, 4)), Number(qq.slice(-1))]; return n > 1 ? `${y}-Q${n - 1}` : `${y - 1}-Q4`; };
function egStats(sid, qq) {
  const rs = q('SELECT * FROM survey_resp WHERE store_id=? AND q=?', sid, qq); if (!rs.length) return { n: 0 };
  const avg = EG_Q.map((_, i) => Math.round(rs.reduce((a, r) => a + r['a' + (i + 1)], 0) / rs.length * 10) / 10), pro = rs.filter(r => r.a4 >= 5).length, det = rs.filter(r => r.a4 <= 3).length;
  return { n: rs.length, avg, total: Math.round(avg.reduce((a, b) => a + b, 0) / avg.length * 10) / 10, enps: Math.round((pro - det) * 100 / rs.length), comments: rs.filter(r => r.comment).map(r => r.comment).slice(-5) };
}
function riskOf(sid) {
  const t = L.today(), eg = egStats(sid, quarter(t)), ot = Object.fromEntries(laborOf(sid).ot.map(o => [o.id, o.ot]));
  return q(USER_SQL + " WHERE u.active=1 AND u.store_id=? AND r.level='staff'", sid).map(u => {
    const ex = execScore(u.id), cur = pstats(u.id, L.addDays(t, -30), L.addDays(t, -1)), pv = pstats(u.id, L.addDays(t, -60), L.addDays(t, -31)), why = []; let s = 0;
    if (ex && ex.score < 70) { s += 30; why.push(`执行分 ${ex.score}`); }
    if (cur.rate != null && pv.rate != null && pv.rate - cur.rate >= 8) { s += 25; why.push(`完成率下滑 ${pv.rate - cur.rate} 个点`); }
    const lv = q1('SELECT COUNT(*) n FROM leaves WHERE user_id=? AND date>=?', u.id, L.addDays(t, -30)).n; if (lv >= 3) { s += 20; why.push(`近 30 天请假 ${lv} 天`); }
    if ((ot[u.id] || 0) > 24) { s += 20; why.push(`月加班 ${ot[u.id]} 小时`); }
    if (q1("SELECT 1 FROM pay_appeals WHERE user_id=? AND status='rejected'", u.id)) { s += 15; why.push('绩效申诉未通过'); }
    if (eg.n && eg.avg[4] < 3.6) { s += 10; why.push('门店留任意愿偏低'); }
    if (hx('rk' + u.id) > 0.86) { s += 25; why.push('近期多次调班（模拟）'); }
    const tk = q1('SELECT * FROM talks WHERE user_id=? ORDER BY date DESC LIMIT 1', u.id);
    return { id: u.id, name: u.name, role_name: u.role_name, score: s, level: s >= 40 ? '高' : s >= 20 ? '中' : '低', why, talk: tk && dBetween(tk.date, t) <= 30 ? tk : null };
  }).filter(x => x.score >= 20).sort((a, b) => b.score - a.score);
}
app.get('/api/engage', (req, res) => {
  const u = req.u, sids = visibleStores(u), sid = Number(req.query.store) || sids[0]; if (!sids.includes(sid)) return deny(res);
  const qq = quarter(L.today()), mgr = u.level !== 'staff' || !!LEADS[u.role_name];
  res.json({ store: sname(sid), q: qq, questions: EG_Q, done: !!q1('SELECT 1 FROM survey_done WHERE user_id=? AND q=?', u.id, qq), can_fill: ['staff', 'store_manager'].includes(u.level),
    cur: mgr ? egStats(sid, qq) : null, prev: mgr ? egStats(sid, prevQ(qq)) : null, staff: q1("SELECT COUNT(*) n FROM users u JOIN roles r ON r.id=u.role_id WHERE u.active=1 AND u.store_id=? AND r.level='staff'", sid).n,
    risk: (u.level === 'store_manager' || isRegion(u)) && daCan(u, 'risk') ? riskOf(sid) : null, region: isRegion(u) ? sids.map(s => ({ id: s, name: sname(s), ...egStats(s, qq), risk: daCan(u, 'risk') ? riskOf(s).filter(r => r.level === '高').length : null })) : null });
});
app.post('/api/engage', (req, res) => {
  const u = req.u, qq = quarter(L.today()), a = (req.body.answers || []).map(Number), sid = u.store_id || visibleStores(u)[0];
  if (!['staff', 'store_manager'].includes(u.level) || !sid) return deny(res);
  if (a.length !== 5 || a.some(v => !(v >= 1 && v <= 5))) return err(res, '请回答全部 5 题');
  if (q1('SELECT 1 FROM survey_done WHERE user_id=? AND q=?', u.id, qq)) return err(res, '本季度已填写');
  D.tx(() => { run('INSERT INTO survey_done(user_id,q) VALUES(?,?)', u.id, qq); run('INSERT INTO survey_resp(store_id,q,a1,a2,a3,a4,a5,comment,at) VALUES(?,?,?,?,?,?,?,?,?)', sid, qq, ...a, (req.body.comment || '').slice(0, 200), L.today()); });
  res.json({ ok: true });
});
app.post('/api/engage/talk', (req, res) => {
  const x = q1(USER_SQL + ' WHERE u.id=?', req.body.uid); if (!x || !canManage(req.u, x.store_id) && !isCoach(req.u)) return deny(res);
  if (!(req.body.note || '').trim()) return err(res, '请填写谈话记录');
  run('INSERT INTO talks(user_id,by,date,note) VALUES(?,?,?,?)', x.id, req.u.id, L.today(), req.body.note); D.audit(req.u.id, x.store_id, '留任谈话', x.name); res.json({ ok: true });
});
app.get('/api/hq', (req, res) => {
  if (!['hq', 'region_manager'].includes(req.u.level)) return deny(res);
  const regs = q('SELECT * FROM regions').map(r => { const sc = regionScores(r.id).all, sids = sc.map(x => x.id), pr = sids.map(procOf).filter(p => p.rate != null);
    return { id: r.id, name: r.name, stores: sc.length, avg: sc.length ? Math.round(sc.reduce((a, x) => a + x.total, 0) / sc.length) : null, grades: [...GRADES].map(g => sc.filter(x => x.grade === g).length),
      proc: pr.length ? Math.round(pr.reduce((a, p) => a + p.rate, 0) / pr.length) : null, cp30: sids.length ? q1(`SELECT COUNT(*) n FROM complaints WHERE store_id IN (${sids.join(',')}) AND created_at>=?`, L.addDays(L.today(), -30)).n : 0,
      sm: smList(r.id).length, rsm: q1("SELECT COUNT(*) n FROM users u JOIN stores s ON s.id=u.store_id WHERE s.region_id=? AND u.active=1 AND u.reserve='sm'", r.id).n, rrm: q1("SELECT COUNT(*) n FROM users WHERE region_id=? AND active=1 AND reserve='rm'", r.id).n, coach: q1("SELECT COUNT(*) n FROM users u JOIN roles r ON r.id=u.role_id WHERE u.region_id=? AND r.level='coach' AND u.active=1 AND COALESCE(u.reserve,'')!='rm'", r.id).n, sim: false }; });
  const SIM = [['华南一区', 6, 84, [1, 2, 2, 1, 0], 81, 9, 5, 1], ['华北一区', 5, 79, [0, 1, 2, 1, 1], 76, 14, 5, 0]].map(([name, stores, avg, grades, proc, cp30, sm, coach], i) => ({ id: -1 - i, name, stores, avg, grades, proc, cp30, sm, coach, sim: true }));
  const all = [...regs, ...(regs.length >= 3 ? [] : SIM)].sort((a, b) => (b.avg || 0) - (a.avg || 0)).map((x, i) => ({ ...x, rank: i + 1, ratio: x.coach ? Math.round(x.stores / x.coach * 10) / 10 : null }));
  const pool = q(USER_SQL + " WHERE u.active=1 AND r.level='staff' AND (r.name='店助' OR r.name LIKE '%经理')").map(x => ({ id: x.id, name: x.name, role_name: x.role_name, store: x.store_id ? sname(x.store_id) : '', region: q1('SELECT name FROM regions WHERE id=?', x.region_id)?.name, tier: hrSummary(x).tier, cert: !!smCertified(x.id), reserve: x.reserve || null })).filter(x => x.tier === '可晋升' || x.reserve === 'sm').sort((a, b) => (b.reserve === 'sm') - (a.reserve === 'sm'));
  res.json({ grades: [...GRADES], regions: all, cur: req.u.region_id, province: q1('SELECT p.name FROM provinces p JOIN regions r ON r.province_id=p.id WHERE r.id=?', req.u.region_id)?.name, pool, notices: q('SELECT n.*, u.name by_name FROM hq_notices n LEFT JOIN users u ON u.id=n.by ORDER BY n.id DESC LIMIT 10'), can_post: req.u.level === 'hq' });
});
app.post('/api/hq/notice', (req, res) => {
  if (req.u.level !== 'hq') return deny(res); const b = req.body; if (!(b.title || '').trim()) return err(res, '请填写标题');
  run('INSERT INTO hq_notices(title,body,kind,by,at) VALUES(?,?,?,?,?)', b.title, b.body || '', b.kind || '政策', req.u.id, L.nowStr());
  const ids = q("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.active=1 AND r.level NOT IN ('staff','hq')").map(x => x.id);
  D.notify(ids, 'hq', `总部${b.kind || '政策'}：${b.title}`, b.body || '', '#/notices'); res.json({ ok: true, n: ids.length });
});
function seedBatchC() {
  if (D.getSetting('bc_seeded', 0)) return;
  const t = L.today();
  D.tx(() => {
    for (const [rn, lv, nm, ph] of [['教练', 'coach', '周宁', '13761205561'], ['总部运营', 'hq', '林海', '13761205562']]) {
      if (!q1('SELECT 1 FROM roles WHERE name=?', rn)) run('INSERT INTO roles(name,level,sort) VALUES(?,?,2)', rn, lv);
      run('INSERT INTO users(name,role_id,region_id,store_id,phone) VALUES(?,(SELECT id FROM roles WHERE name=?),1,NULL,?)', nm, rn, ph);
    }
    const coach = q1("SELECT id FROM users WHERE name='周宁'").id, gl = q1("SELECT id FROM users WHERE name='顾磊'")?.id;
    if (gl) { run('INSERT OR IGNORE INTO onboard_plan(user_id,start,coach_id) VALUES(?,?,?)', gl, L.addDays(t, -40), coach);
      [['d1', -36, '已看完档案和证照'], ['d2', -34, '面谈 11 人'], ['d3', -33, ''], ['w1', -20, ''], ['w3', -12, '连续一周主持早班交接'], ['w2', -3, '快速巡检 1 次，发现 3 项']].forEach(([k, d, n], i) =>
        run('INSERT OR IGNORE INTO onboard(user_id,step,done_at,note,ok_by,ok_at) VALUES(?,?,?,?,?,?)', gl, k, L.addDays(t, d), n, i < 5 ? coach : null, i < 5 ? L.addDays(t, d + 2) : null)); }
    const sm1 = q1("SELECT id FROM users WHERE name='刘洋'")?.id;
    if (sm1) run('INSERT INTO coach_logs(sm_id,coach_id,date,topic,note,next) VALUES(?,?,?,?,?,?)', sm1, coach, L.addDays(t, -9), '统购率偏低', '布草和早餐原料仍有本地采购', '两周内切换统购供应商');
    const qq = quarter(t), pq = prevQ(qq);
    for (const s of q('SELECT id FROM stores')) for (const [qx, base] of [[pq, 0.1], [qq, 0]]) for (let i = 0; i < 6 + Math.floor(hx('eg' + s.id + qx) * 5); i++) {
      const lo = s.id === 3 ? 2.6 : 3.2, a = [1, 2, 3, 4, 5].map(j => Math.max(1, Math.min(5, Math.round(lo + base * 5 + hx('ea' + s.id + qx + i + j) * 2.4))));
      run('INSERT INTO survey_resp(store_id,q,a1,a2,a3,a4,a5,comment,at) VALUES(?,?,?,?,?,?,?,?,?)', s.id, qx, ...a, i === 0 ? (s.id === 3 ? '夜班人手太紧，经常加班' : '希望多一些技能培训') : '', qx === qq ? L.addDays(t, -i) : L.addDays(t, -95));
    }
    run('INSERT INTO hq_notices(title,body,kind,by,at) VALUES(?,?,?,?,?)', '2026 年冬季消防专项检查', '各区域 12 月 15 日前完成全员消防演练并上传照片', '标准', q1("SELECT id FROM users WHERE name='林海'").id, L.addDays(t, -2) + ' 10:00');
  });
  D.setSetting('bc_seeded', 1);
}
seedBatchC();

// ---------- 易 X 角色模块 ----------
const YI_ROLE = { dev_manager: ['dev'], build_manager: ['build'], train_manager: ['train'], hr_manager: ['hr'], region_manager: ['dev', 'build', 'train', 'hr'] };
app.get('/api/yi', (req, res) => {
  const u = req.u, ks = YI_ROLE[u.level] || []; if (!ks.length) return res.json([]);
  const t = L.today(), y = t.slice(0, 4), out = [];
  const pj = ks.some(k => ['dev', 'build'].includes(k)) ? q(PJ_SQL + ' WHERE p.region_id=?', u.region_id).map(projOf) : [];
  if (ks.includes('dev')) {
    const tg = D.getSetting('dev_target', { sign: 8, open: 4 }), sg = pj.filter(p => p.sign_date?.startsWith(y)).length, f = funnelOf(pj, q('SELECT * FROM store_events WHERE project_id IS NOT NULL'));
    const risk = pj.filter(p => p.stage === '管道' && p.health === 'red');
    out.push({ k: 'dev', name: '易开发', sub: '线索 · 签约 · 漏斗', kpis: [['线索 / 意向', pj.filter(p => ['lead', 'intent'].includes(p.status)).length, '个'], ['本年签约', `${sg}/${tg.sign}`, '家'], ['线索到签约', f.lead_to_sign ?? '-', '天']],
      alert: risk.length ? `${risk.length} 个管道项目有流失风险：${risk.map(p => p.name).join('、')}` : '', links: [['#/home?pl=shop&lc=pipe', '开发漏斗与线索'], ['#/home?pl=shop&lc=flow', '周转记录']] });
  }
  if (ks.includes('build')) {
    const act = pj.filter(p => p.status === 'active'), late = act.filter(p => p.cur?.late), soon = act.filter(p => p.predicted_open && dBetween(t, p.predicted_open) <= 90);
    out.push({ k: 'build', name: '易筹建', sub: '节点 · 工期 · 验收', kpis: [['在建项目', act.length, '个'], ['节点逾期', late.length, '个'], ['90 天内开业', soon.length, '家']],
      alert: late.length ? late.map(p => `${p.name}「${p.cur.name}」逾期 ${p.cur.slip} 天`).join('；') : '', links: [['#/home?pl=shop&lc=pipe', '项目看板'], ...late.slice(0, 2).map(p => ['#/proj/' + p.id, p.name])] });
  }
  if (ks.includes('train')) {
    const al = trainAlerts(u.region_id), cl = q('SELECT * FROM train_classes WHERE region_id=?', u.region_id), ing = cl.filter(c => c.start <= t && c.end >= t).length, up = cl.filter(c => c.start > t).length;
    out.push({ k: 'train', name: '易培训', sub: '开班 · 认证 · 带教', kpis: [['未达标', al.length, '人'], ['在训 / 待开', `${ing}/${up}`, '班'], ['带教中', q("SELECT COUNT(*) n FROM mentors m JOIN users x ON x.id=m.mentee_id WHERE m.status='active' AND x.region_id=?", u.region_id)[0].n, '对']],
      alert: al.slice(0, 2).map(a => a.text).join('；'), links: [['#/train', '培训与认证'], ['#/train?k=' + encodeURIComponent('店长班'), '店长班'], ['#/train?k=' + encodeURIComponent('师徒带教'), '师徒带教']] });
  }
  if (ks.includes('hr')) {
    const ps = q(USER_SQL + " WHERE u.active=1 AND u.region_id=? AND r.level IN ('staff','store_manager')", u.region_id), hs = ps.map(hrSummary), sids = visibleStores(u);
    const ap = q(`SELECT COUNT(*) n FROM pay_appeals a JOIN users x ON x.id=a.user_id WHERE a.status='open' AND x.store_id IN (${sids.join(',') || 'NULL'})`)[0].n;
    out.push({ k: 'hr', name: '易人事', sub: '档案 · 绩效 · 交接', kpis: [['在职', ps.length, '人'], ['人事预警', hs.filter(h => h.alerts.length).length, '人'], ['待处理申诉', ap, '条']],
      alert: '', links: [['#/people', '人员档案与梯队'], ['#/pay', '绩效与薪酬'], ['#/train', '培训认证']] });
  }
  res.json(out);
});

// ---------- notifications ----------
app.get('/api/notifications', (req, res) => res.json(q('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100', req.u.id)));
app.post('/api/notifications/read', (req, res) => {
  if (req.body.id) run('UPDATE notifications SET read=1 WHERE id=? AND user_id=?', req.body.id, req.u.id);
  else if (Array.isArray(req.body.ids)) req.body.ids.slice(0, 200).forEach(id => run('UPDATE notifications SET read=1 WHERE id=? AND user_id=?', Number(id), req.u.id));
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
const markMissed = () => run("UPDATE instances SET status='missed' WHERE status='pending' AND date<?", L.today()).changes;
function tick() {
  try {
    const date = L.today(), time = L.nowHM();
    markMissed();
    const times = D.getSetting('reminder_times', []);
    if (times.includes(time) && !q1('SELECT 1 FROM reminder_log WHERE date=? AND time=?', date, time)) {
      run('INSERT INTO reminder_log VALUES(?,?)', date, time);
      runReminders(date, time);
    }
    D.ensureInstances(date);
    const esc = D.getSetting('escalate_minutes', 30), escBy = {};
    for (const it of q("SELECT i.*, st.name store_name, u.name uname FROM instances i JOIN stores st ON st.id=i.store_id LEFT JOIN users u ON u.id=i.assignee_id WHERE i.date=? AND i.status='pending' AND i.escalated=0", date)) {
      if (L.addMinutes(it.due_time, esc) < time) {
        run('UPDATE instances SET escalated=1 WHERE id=?', it.id);
        (escBy[it.store_id] ||= []).push(it);
      }
    }
    for (const [sid, list] of Object.entries(escBy)) D.notify(D.storeManagers(Number(sid)), 'escalate', list.length > 1 ? `超时升级：${list[0].store_name} ${list.length} 项任务超时` : `超时升级：${list[0].title}`,
      list.slice(0, 4).map(x => `${x.due_time} ${x.title}（${x.uname || '未分配'}）`).join('；') + (list.length > 4 ? ` 等 ${list.length} 项` : '') + `，已超时 ${esc} 分钟以上。`, '#/tasks?store=' + sid);
    for (const r of q("SELECT r.*, st.name store_name, st.region_id FROM rectifications r JOIN stores st ON st.id=r.store_id WHERE r.status='open' AND r.deadline<? AND r.escalated=0", date)) {
      run('UPDATE rectifications SET escalated=1 WHERE id=?', r.id);
      D.notify([...D.storeManagers(r.store_id), ...D.regionUsers(r.region_id, 'region_manager'), ...D.regionUsers(r.region_id, 'ops_manager')], 'escalate', `整改逾期：${r.store_name}`, `${r.task}（截止 ${r.deadline}）`, '#/rect');
    }
    const now = L.nowStr();
    for (const x of q("SELECT p.*, st.name store_name, st.region_id FROM repairs p JOIN stores st ON st.id=p.store_id WHERE p.status IN ('open','accepted') AND p.due_at<? AND p.esc_level<2", now)) {
      if (x.esc_level === 0) {
        run('UPDATE repairs SET esc_level=1 WHERE id=?', x.id);
        D.notify(D.storeManagers(x.store_id), 'escalate', `报修超时：${x.title}`, `${x.store_name} ${x.location}，应于 ${x.due_at} 前修复`, '#/repair/' + x.id);
      } else if (addHours(x.due_at, cfg().sla[x.urgency] || 24) < now) {
        run('UPDATE repairs SET esc_level=2 WHERE id=?', x.id);
        D.notify([...D.regionUsers(x.region_id, 'region_manager'), ...D.regionUsers(x.region_id, 'ops_manager')], 'escalate', `报修严重超时：${x.store_name}`, `${x.title}（${x.location}），应于 ${x.due_at} 前修复`, '#/repair/' + x.id);
      }
    }
  } catch (e) { console.error('tick', e); }
}
tick();
setInterval(tick, 30000);

app.use((e, req, res, next) => { console.error(e); res.status(400).json({ error: e.message || '出错了' }); });
app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
const PORT = Number(process.env.PORT) || 3000;
// ---------- 人事指标：编制 / 满编率 / 离职率 / 招聘 / 流动 / 合规（历史离职、招聘、兼职为模拟数据） ----------
const HC_KEY = ['店长', '店助', '前台经理', '客房经理'];
const HC_POS = ['店长', '店助', '前台经理', '前台', '客房经理', '客房', '餐厅', '工程', 'PA', '保安'];
const posOf = r => (/^前台(高级|中级|初级)$/.test(r) ? '前台' : /^客房(高级|中级|初级)$/.test(r) ? '客房' : r === '餐厅厨师' ? '餐厅' : r);
const HC_TH = { fill: 90, vac: 15, month: 5, early: 30 };
const EXIT_R = ['薪酬待遇', '排班与工作强度', '管理方式', '发展空间', '个人原因', '试用期不合格', '违纪辞退'];
const REC_CH = ['内推', '门店招聘', '招聘平台'], REC_ST = ['待招', '面试', '待入职', '已到岗'];
const LEAVE_COST = { recruit: 600, train: 1200, ramp: 0.3, vacancy: 0.5 };
const HRM_LV = ['hr_manager', 'region_manager', 'coach', 'ops_manager', 'hq', 'store_manager', 'sales_manager', 'dev_manager', 'build_manager'];
function hcStd(sid) {
  const rooms = q1('SELECT rooms FROM stores WHERE id=?', sid)?.rooms || 150;
  return { 店长: 1, 店助: rooms >= 200 ? 2 : 1, 前台经理: 1, 前台: rooms >= 180 ? 4 : 3, 客房经理: 1, 客房: rooms >= 180 ? 5 : rooms >= 150 ? 4 : 3, 餐厅: 1, 工程: 1, PA: 1, 保安: 1 };
}
const contractEnd = hire => { let e = L.addDays(hire, 1095); const t = L.today(); while (e < t) e = L.addDays(e, 1095); return e; };
const r1 = n => Math.round(n * 10) / 10;
function hcPeople(sid) {
  const sm = q('SELECT us.user_id id FROM user_stores us JOIN users u ON u.id=us.user_id WHERE us.store_id=? AND u.active=1', sid).map(x => q1(USER_SQL + ' WHERE u.id=?', x.id));
  const us = q(USER_SQL + " WHERE u.active=1 AND u.store_id=? AND r.level='staff'", sid);
  return [...sm.map(x => ({ ...x, pos: '店长' })), ...us.map(x => ({ ...x, pos: posOf(x.role_name) }))];
}
function leaveCost(m, fillDays) { const b = BASE_PAY[m.role] || 4500; return Math.round(LEAVE_COST.recruit + LEAVE_COST.train + (fillDays || 21) * b / 30 * LEAVE_COST.vacancy + b * LEAVE_COST.ramp); }
function hrStats(sid) {
  const t = L.today(), y1 = L.addDays(t, -365), m1 = L.addDays(t, -30), std = hcStd(sid);
  const ov = Object.fromEntries(q('SELECT pos, n FROM hc_plan WHERE store_id=?', sid).map(x => [x.pos, x.n]));
  const people = hcPeople(sid), act = people.length;
  const mv = q('SELECT * FROM hr_moves WHERE store_id=? AND date>=? ORDER BY date DESC, id DESC', sid, y1), lv = mv.filter(m => m.kind === 'leave');
  const plan = HC_POS.map(p => { const n = ov[p] ?? std[p], a = people.filter(x => x.pos === p).length, last = lv.find(m => m.pos === p);
    return { pos: p, key: HC_KEY.includes(p), std: std[p], plan: n, act: a, gap: Math.max(0, n - a), vac_days: n > a ? (last ? dBetween(last.date, t) : 30) : 0,
      shared: p === '店长' && people.some(x => x.pos === '店长' && smStores(x.id).length > 1) }; });
  const P = plan.reduce((a, x) => a + x.plan, 0), gaps = plan.reduce((a, x) => a + x.gap, 0);
  const pf = people.map(x => ({ x, p: profileOf(x) }));
  const hires = pf.filter(o => o.p.hire >= y1).length + q("SELECT COALESCE(SUM(n),0) n FROM recruit WHERE store_id=? AND stage='已到岗' AND filled>=?", sid, y1)[0].n;
  const early = lv.filter(m => m.hire && dBetween(m.hire, m.date) <= 90).length, keyLv = lv.filter(m => HC_KEY.includes(m.pos)).length;
  const m_leave = lv.filter(m => m.date >= m1).length, vol = lv.filter(m => m.voluntary).length, base = Math.max(1, act);
  const rec = q('SELECT * FROM recruit WHERE store_id=? ORDER BY id DESC', sid), open = rec.filter(r => !['已到岗', '已取消'].includes(r.stage));
  const filled = rec.filter(r => r.stage === '已到岗' && r.filled >= y1), fillDays = filled.length ? Math.round(filled.reduce((a, r) => a + dBetween(r.opened, r.filled), 0) / filled.length) : null;
  const dy = o => dBetween(o.p.hire, t);
  const structure = {
    tenure: [['不满 3 个月', 0, 90], ['3-12 个月', 90, 365], ['1-3 年', 365, 1095], ['3 年以上', 1095, 1e9]].map(([l, a, b]) => ({ l, n: pf.filter(o => dy(o) >= a && dy(o) < b).length })),
    age: [['25 岁以下', 0, 25], ['25-34 岁', 25, 35], ['35-44 岁', 35, 45], ['45 岁以上', 45, 200]].map(([l, a, b]) => ({ l, n: pf.filter(o => o.p.age >= a && o.p.age < b).length })),
    edu: ['高中', '中专', '大专', '本科'].map(l => ({ l, n: pf.filter(o => o.p.edu === l).length })),
    pt: Math.round(act * (0.08 + hx('pt' + sid) * 0.12)), out: people.filter(x => ['PA', '保安'].includes(x.pos)).length };
  const comp = [], lab = laborOf(sid);
  for (const o of pf) {
    const w = { who: o.x.name, uid: o.x.id }, ce = contractEnd(o.p.hire);
    if (ce <= L.addDays(t, 60)) comp.push({ ...w, type: '合同到期', lv: ce <= L.addDays(t, 15) ? 'bad' : 'warn', text: `劳动合同 ${ce} 到期，需续签或办理终止` });
    const hc = o.p.certs.find(c => c.name === '健康证');
    if (hc && hc.expire <= L.addDays(t, 30)) comp.push({ ...w, type: '健康证', lv: hc.expire < t ? 'bad' : 'warn', text: hc.expire < t ? `健康证已于 ${hc.expire} 过期，补办前不得上岗` : `健康证 ${hc.expire} 到期，需提前复检` });
    if (o.p.in_probation && o.p.probation_end <= L.addDays(t, 15)) comp.push({ ...w, type: '试用期', lv: 'warn', text: `试用期 ${o.p.probation_end} 到期，需完成转正评估` });
  }
  lab.ot.filter(o => o.ot > 36).forEach(o => comp.push({ who: people.find(x => x.id === o.id)?.name || o.name, uid: o.id, type: '超时加班', lv: 'bad', text: `本月加班 ${o.ot} 小时，超过每月 36 小时法定上限` }));
  const fill = Math.round(act * 100 / P), y_rate = r1(lv.length * 100 / base), m_rate = r1(m_leave * 100 / base), early_rate = hires ? Math.round(early * 100 / hires) : 0;
  const keyVac = plan.filter(x => x.key && x.gap), costs = lv.map(m => leaveCost(m, fillDays)), cost = costs.reduce((a, b) => a + b, 0);
  const stab = clamp(100 - Math.max(0, y_rate - 30) * 0.8 - Math.max(0, early_rate - 20) * 0.6 - Math.max(0, 100 - fill) * 0.8 - keyVac.length * 8);
  const alerts = [];
  if (fill < HC_TH.fill) alerts.push({ lv: 'warn', type: '满编率低', text: `满编率 ${fill}%，缺 ${gaps} 人（${plan.filter(x => x.gap).map(x => x.pos + ' ' + x.gap).join('、')}）` });
  keyVac.filter(x => x.vac_days > HC_TH.vac).forEach(x => alerts.push({ lv: 'bad', type: '关键岗位空缺', text: `${x.pos}空缺 ${x.vac_days} 天` }));
  if (m_rate > HC_TH.month) alerts.push({ lv: 'bad', type: '月离职率高', text: `近 30 天离职 ${m_leave} 人，离职率 ${m_rate}%` });
  if (early_rate > HC_TH.early) alerts.push({ lv: 'warn', type: '新人流失高', text: `近 12 个月新人 90 天内流失率 ${early_rate}%` });
  const cb = comp.filter(c => c.lv === 'bad'); if (cb.length) alerts.push({ lv: 'warn', type: '用工合规', text: `${cb.length} 项合规风险：${[...new Set(cb.map(c => c.type))].join('、')}` });
  return { id: sid, name: sname(sid), rooms: q1('SELECT rooms FROM stores WHERE id=?', sid)?.rooms, plan, P, act, fill, gaps, key_vac: keyVac, hires, leaves: lv.length, m_leave, m_rate, y_rate, early, early_rate,
    vol, vol_rate: lv.length ? Math.round(vol * 100 / lv.length) : null, key_leave: keyLv, key_rate: r1(keyLv * 100 / Math.max(1, people.filter(x => HC_KEY.includes(x.pos)).length)),
    reasons: EXIT_R.map(r => ({ l: r, n: lv.filter(m => m.reason === r).length })).filter(x => x.n), structure,
    recruit: open, fill_days: fillDays, filled: filled.length, flow: { promote: mv.filter(m => m.kind === 'promote').length, tout: mv.filter(m => m.kind === 'transfer').length, tin: q1("SELECT COUNT(*) n FROM hr_moves WHERE to_store=? AND kind='transfer' AND date>=?", sid, y1).n },
    cost, cost_per: costs.length ? Math.round(cost / costs.length) : null, comp, stab, alerts };
}
function hrAgg(all, sids) {
  const t = L.today(), y1 = L.addDays(t, -365), S = k => all.reduce((a, x) => a + (x[k] || 0), 0), act = Math.max(1, S('act')), hires = S('hires'), leaves = S('leaves');
  const merge = k => { const o = {}; all.forEach(x => x.structure[k].forEach(z => { o[z.l] = (o[z.l] || 0) + z.n; })); return Object.entries(o).map(([l, n]) => ({ l, n })); };
  const rs = {}; all.forEach(x => x.reasons.forEach(z => { rs[z.l] = (rs[z.l] || 0) + z.n; }));
  const rec = sids.length ? q(`SELECT * FROM recruit WHERE store_id IN (${sids.join(',')}) AND stage='已到岗' AND filled>=?`, y1) : [];
  const channels = REC_CH.map(c => { const r = rec.filter(x => x.channel === c); return { l: c, n: r.length, days: r.length ? Math.round(r.reduce((a, x) => a + dBetween(x.opened, x.filled), 0) / r.length) : null, keep: Math.round({ 内推: 91, 门店招聘: 84, 招聘平台: 73 }[c] + (hx('kp' + c + sids.join()) - 0.5) * 6) }; });
  const ap = sids.length ? q(`SELECT * FROM hr_moves WHERE kind='appoint' AND store_id IN (${sids.join(',')}) AND date>=?`, y1) : [];
  const fd = all.filter(x => x.fill_days != null);
  return { P: S('P'), act: S('act'), fill: Math.round(S('act') * 100 / Math.max(1, S('P'))), gaps: S('gaps'), hires, leaves, m_leave: S('m_leave'), m_rate: r1(S('m_leave') * 100 / act), y_rate: r1(leaves * 100 / act),
    early: S('early'), early_rate: hires ? Math.round(S('early') * 100 / hires) : 0, vol_rate: leaves ? Math.round(S('vol') * 100 / leaves) : null, key_leave: S('key_leave'),
    key_rate: r1(S('key_leave') * 100 / Math.max(1, all.reduce((a, x) => a + x.plan.filter(p => p.key).reduce((b, p) => b + p.act, 0), 0))),
    reasons: Object.entries(rs).map(([l, n]) => ({ l, n })).sort((a, b) => b.n - a.n), structure: { tenure: merge('tenure'), age: merge('age'), edu: merge('edu'), pt: all.reduce((a, x) => a + x.structure.pt, 0), out: all.reduce((a, x) => a + x.structure.out, 0) },
    recruit: all.flatMap(x => x.recruit.map(r => ({ ...r, store: x.name }))), fill_days: fd.length ? Math.round(fd.reduce((a, x) => a + x.fill_days, 0) / fd.length) : null, channels,
    flow: { promote: all.reduce((a, x) => a + x.flow.promote, 0), tout: all.reduce((a, x) => a + x.flow.tout, 0), tin: all.reduce((a, x) => a + x.flow.tin, 0), promote_rate: r1(all.reduce((a, x) => a + x.flow.promote, 0) * 100 / act),
      sm_appoint: ap.length, sm_internal: ap.filter(x => x.src === 'internal').length, sm_internal_rate: ap.length ? Math.round(ap.filter(x => x.src === 'internal').length * 100 / ap.length) : null },
    cost: S('cost'), cost_per: leaves ? Math.round(S('cost') / leaves) : null, comp: all.flatMap(x => x.comp.map(c => ({ ...c, store: x.name }))),
    key_vac: all.flatMap(x => x.key_vac.map(k => ({ ...k, store: x.name, sid: x.id }))), stab: all.length ? Math.round(all.reduce((a, x) => a + x.stab, 0) / all.length) : null,
    alerts: all.flatMap(x => x.alerts.map(a => ({ ...a, store: x.name, sid: x.id }))) };
}
const stabOf = sids => (sids.length ? Math.round(sids.reduce((a, s) => a + stabMix(s), 0) / sids.length) : 100);
app.get('/api/hrm', (req, res) => {
  const u = req.u; if (!HRM_LV.includes(u.level)) return deny(res);
  const sids = visibleStores(u), sid = Number(req.query.store) || 0; if (sid && !sids.includes(sid)) return deny(res);
  const all = sids.map(hrStats), sel = sid ? all.find(x => x.id === sid) : sids.length === 1 ? all[0] : null, t = L.today();
  const link = all.map(x => { const sc = storeScore(x.id); return { id: x.id, name: x.name, grade: sc.grade, total: sc.total, team: sc.dims.team, cp30: q1('SELECT COUNT(*) n FROM complaints WHERE store_id=? AND created_at>=?', x.id, L.addDays(t, -30)).n, fill: x.fill, y_rate: x.y_rate, early_rate: x.early_rate, stab: x.stab, tstab: stabMix(x.id) }; });
  const ms = sel ? [sel.id] : sids;
  const moves = ms.length ? q(`SELECT m.*, s.name store FROM hr_moves m LEFT JOIN stores s ON s.id=m.store_id WHERE m.kind='leave' AND m.store_id IN (${ms.join(',')}) AND m.date>=? ORDER BY m.date DESC LIMIT 20`, L.addDays(t, -365)) : [];
  res.json({ sum: hrAgg(all, sids), stores: all.map(x => ({ id: x.id, name: x.name })), link, sel, moves, th: HC_TH, cost_def: LEAVE_COST, can_plan: ['region_manager', 'hr_manager'].includes(u.level), can_rec: canHR(u) || u.level === 'store_manager',
    exit_reasons: EXIT_R, channels: REC_CH, pos: HC_POS, sim: true });
});
app.post('/api/hrm/plan', (req, res) => {
  const b = req.body || {}, sid = Number(b.store_id), n = Number(b.n);
  if (!['region_manager', 'hr_manager'].includes(req.u.level) || !visibleStores(req.u).includes(sid)) return deny(res); if (!HC_POS.includes(b.pos) || !(n >= 0 && n <= 30)) return err(res, '请填写编制人数');
  run('INSERT INTO hc_plan(store_id,pos,n) VALUES(?,?,?) ON CONFLICT(store_id,pos) DO UPDATE SET n=excluded.n', sid, b.pos, Math.round(n));
  D.audit(req.u.id, sid, '调整编制', `${b.pos} ${Math.round(n)} 人`); res.json({ ok: true });
});
const canRec = (u, sid) => visibleStores(u).includes(sid) && (canHR(u) || u.level === 'store_manager');
app.post('/api/hrm/recruit', (req, res) => {
  const b = req.body || {}, sid = Number(b.store_id); if (!canRec(req.u, sid)) return deny(res); if (!HC_POS.includes(b.pos)) return err(res, '请选择岗位');
  run("INSERT INTO recruit(store_id,pos,n,stage,channel,opened,by) VALUES(?,?,?,'待招',?,?,?)", sid, b.pos, Math.max(1, Number(b.n) || 1), REC_CH.includes(b.channel) ? b.channel : '招聘平台', L.today(), req.u.id);
  if (req.u.level === 'store_manager') D.notify(D.regionUsers(regionOfStore(sid), 'hr_manager'), 'hr', `${sname(sid)} 发起招聘：${b.pos}`, '', '#/hrm?store=' + sid);
  res.json({ ok: true });
});
app.post('/api/hrm/recruit/:id', (req, res) => {
  const r = q1('SELECT * FROM recruit WHERE id=?', req.params.id), b = req.body || {}; if (!r || !canRec(req.u, r.store_id)) return deny(res);
  if (![...REC_ST, '已取消'].includes(b.stage)) return err(res, '状态不正确');
  run('UPDATE recruit SET stage=?, cand=COALESCE(?,cand), filled=? WHERE id=?', b.stage, b.cand || null, b.stage === '已到岗' ? L.today() : null, r.id); res.json({ ok: true });
});
app.post('/api/hrm/exit/:id', (req, res) => {
  const m = q1('SELECT * FROM hr_moves WHERE id=?', req.params.id), b = req.body || {}; if (!m || !(canHR(req.u) || canManage(req.u, m.store_id))) return deny(res);
  run('UPDATE hr_moves SET reason=COALESCE(?,reason), voluntary=COALESCE(?,voluntary), note=? WHERE id=?', EXIT_R.includes(b.reason) ? b.reason : null, b.voluntary == null ? null : Number(b.voluntary), b.note || '', m.id); res.json({ ok: true });
});
const NM = '张王李赵刘陈杨黄周吴徐孙马朱胡郭何林罗高', GN = ['婷', '杰', '敏', '强', '丽', '磊', '静', '鹏', '雪', '浩', '芳', '涛', '琳', '宇', '倩', '凯'];
function seedHR() {
  if (D.getSetting('hr_seeded', 0)) return;
  const t = L.today(), ROLE = ['前台初级', '前台初级', '前台中级', '客房初级', '客房初级', '客房中级', '客房高级', 'PA', '保安', '餐厅厨师', '前台高级', '工程'];
  D.tx(() => {
    for (const s of q('SELECT id FROM stores')) {
      const sid = s.id, n = 4 + Math.floor(hx('hl' + sid) * 4) + (sid === 3 ? 3 : 0);
      for (let i = 0; i < n; i++) {
        const k = 'hm' + sid + '-' + i, date = sid === 3 && i < 1 ? L.addDays(t, -6) : L.addDays(t, -Math.floor(12 + hx(k + 'd') * 345));
        const role = ROLE[Math.floor(hx(k + 'r') * ROLE.length)], short = hx(k + 's') < 0.22, hire = L.addDays(date, -(short ? 18 + Math.floor(hx(k + 'h') * 65) : 120 + Math.floor(hx(k + 'h') * 700)));
        const pass = short && hx(k + 'p') < 0.3, rr = hx(k + 'x'), reason = pass ? '试用期不合格' : rr < 0.04 ? '违纪辞退' : EXIT_R[Math.floor(hx(k + 'y') * 5)];
        const note = hx(k + 'n') < 0.55 ? { 薪酬待遇: '同区域竞品前台月薪高 500 元', 排班与工作强度: '连续夜班多，休息不规律', 管理方式: '觉得批评多、表扬少', 发展空间: '一年多没有晋升机会', 个人原因: '回老家照顾家人', 试用期不合格: '多次查房不合格', 违纪辞退: '私收现金' }[reason] : '';
        run("INSERT INTO hr_moves(store_id,name,role,pos,kind,date,hire,reason,voluntary,note) VALUES(?,?,?,?,'leave',?,?,?,?,?)", sid, NM[Math.floor(hx(k + 'a') * NM.length)] + GN[Math.floor(hx(k + 'b') * GN.length)], role, posOf(role), date, hire, reason, ['试用期不合格', '违纪辞退'].includes(reason) ? 0 : 1, note);
        if (hx(k + 'f') < 0.85) { const op = L.addDays(date, -2), fd = L.addDays(op, 8 + Math.floor(hx(k + 'g') * 34)); if (fd < t) run("INSERT INTO recruit(store_id,pos,n,stage,channel,opened,filled,cand) VALUES(?,?,1,'已到岗',?,?,?,?)", sid, posOf(role), REC_CH[Math.floor(hx(k + 'c') * 3)], op, fd, NM[Math.floor(hx(k + 'e') * NM.length)] + GN[Math.floor(hx(k + 'q') * GN.length)]); }
      }
      if (sid === 3) run("INSERT INTO hr_moves(store_id,name,role,pos,kind,date,hire,reason,voluntary,note) VALUES(3,'郑凯','店助','店助','leave',?,?,'发展空间',1,'外部品牌给了店长岗位')", L.addDays(t, -22), L.addDays(t, -900));
      for (let i = 0; i < 1 + Math.floor(hx('pr' + sid) * 3); i++) run("INSERT INTO hr_moves(store_id,name,role,pos,kind,date,to_pos) VALUES(?,?,?,?,'promote',?,?)", sid, NM[Math.floor(hx('pn' + sid + i) * NM.length)] + GN[i + sid], '前台中级', '前台', L.addDays(t, -Math.floor(20 + hx('pd' + sid + i) * 300)), '前台高级');
      if (sid !== 4) run("INSERT INTO hr_moves(store_id,name,role,pos,kind,date,to_store) VALUES(?,?,'客房中级','客房','transfer',?,?)", sid, '韩' + GN[sid + 5], L.addDays(t, -Math.floor(40 + hx('tr' + sid) * 200)), sid === 3 ? 1 : sid + 1);
      const std = hcStd(sid), pp = hcPeople(sid);
      HC_POS.forEach(p => { const g = std[p] - pp.filter(x => x.pos === p).length; if (g > 0) run('INSERT INTO recruit(store_id,pos,n,stage,channel,opened) VALUES(?,?,?,?,?,?)', sid, p, g, ['待招', '面试', '待入职'][Math.floor(hx('rc' + sid + p) * 3)], REC_CH[Math.floor(hx('rh' + sid + p) * 3)], L.addDays(t, -Math.floor(4 + hx('ro' + sid + p) * 22))); });
    }
    [[4, 'external', -40], [1, 'internal', -200], [3, 'internal', -310]].forEach(([sid, src, d]) => run("INSERT INTO hr_moves(store_id,name,role,pos,kind,date,src) VALUES(?,?,'店长','店长','appoint',?,?)", sid, sid === 4 ? '顾磊' : sid === 1 ? '陈峰' : '刘洋', L.addDays(t, d), src));
    D.setSetting('hr_seeded', 1);
  });
}
seedHR();

// ---------- 员工美好：员工餐 / 活动 / 关怀维护（历史记录为模拟数据） ----------
const CARE_DEF = { meal_std: 20, act_budget: 800, meal_th: 4, reply_h: 48 };
const careCfg = () => ({ ...CARE_DEF, ...D.getSetting('care_cfg', {}) });
const HOLI = [['端午节', '2026-06-19'], ['中秋节', '2026-09-25'], ['元旦', '2027-01-01'], ['春节', '2027-02-06'], ['妇女节', '2027-03-08'], ['端午节', '2027-06-09']];
const WELF = ['工服', '年度体检', '工龄奖', '节日礼品', '员工住宿'];
const VOICE = ['员工餐', '排班', '宿舍休息区', '薪酬', '管理方式', '培训发展', '设备工具', '其他'];
const EXIT2V = { 薪酬待遇: '薪酬', 排班与工作强度: '排班', 管理方式: '管理方式', 发展空间: '培训发展' };
const KW2V = [[/餐|饭|菜/, '员工餐'], [/排班|夜班|休息|加班/, '排班'], [/宿舍|休息室/, '宿舍休息区'], [/工资|薪|提成|奖金/, '薪酬'], [/店长|批评|认可|尊重/, '管理方式'], [/培训|晋升|成长/, '培训发展'], [/设备|工具|吸尘|布草车/, '设备工具']];
const CARE_KIND = { birthday: '生日会', holiday: '节日关怀', team: '团建', other: '其他活动' };
const LOG_KIND = { talk: '一对一谈心', new7: '新人 7 天关怀', new30: '新人 30 天关怀', new90: '新人 90 天关怀', family: '家属关怀', night: '夜班与高强度关怀', sm_talk: '店长季度谈心' };
const wkOf = d => L.addDays(d, -((new Date(d + 'T00:00:00').getDay() + 6) % 7));
const qStart = d => d.slice(0, 5) + String(Math.floor((Number(d.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0') + '-01';
const bdOf = id => ({ m: 1 + Math.floor(hx('bm' + id) * 12), d: 1 + Math.floor(hx('bdd' + id) * 28) });
const CARE_LV = ['hr_manager', 'region_manager', 'coach', 'ops_manager', 'hq', 'store_manager'];
const canCareDo = (u, sid) => visibleStores(u).includes(Number(sid)) && (['store_manager', 'region_manager', 'coach', 'hr_manager'].includes(u.level) || (u.role_name === '店助' && Number(u.store_id) === Number(sid)));
const nextRole = r => Object.keys(LADDER).find(k => LADDER[k][LADDER[k].length - 1] === r) || (['店助', '前台经理', '客房经理'].includes(r) ? '店长' : null);
function careOf(sid) {
  const t = L.today(), ym = t.slice(0, 7), qs0 = qStart(t), y0 = t.slice(0, 4) + '-01-01', c = careCfg(), wk = wkOf(t), d90 = L.addDays(t, -90);
  const staff = hcPeople(sid).filter(x => x.pos !== '店长'), n = Math.max(1, staff.length), ids = staff.map(x => x.id);
  const menu = q1('SELECT * FROM meal_menu WHERE store_id=? AND week=?', sid, wk), weeks = [0, 7, 14, 21].map(k => L.addDays(wk, -k)), pub = weeks.filter(w => q1('SELECT 1 x FROM meal_menu WHERE store_id=? AND week=?', sid, w)).length;
  const rt = m => { const r = q('SELECT score, comment FROM meal_rate WHERE store_id=? AND ym=?', sid, m); return { n: r.length, avg: r.length ? r1(r.reduce((a, x) => a + x.score, 0) / r.length) : null, comments: r.filter(x => x.comment).map(x => x.comment).slice(-4) }; };
  const lm = L.addDays(ym + '-01', -1).slice(0, 7), rNow = rt(ym), rLast = rt(lm), rate = rNow.n >= 3 ? rNow : rLast, dom = Number(t.slice(8, 10));
  const spend = Math.round(n * c.meal_std * dom * (0.88 + hx('ms' + sid + ym) * 0.25)), budget = n * c.meal_std * dom;
  const acts = q('SELECT * FROM care_act WHERE store_id=? AND date>=? ORDER BY date DESC', sid, y0);
  const bdays = staff.filter(x => bdOf(x.id).m === Number(t.slice(5, 7))).map(x => ({ id: x.id, name: x.name, day: bdOf(x.id).d }));
  const bdDone = acts.some(a => a.kind === 'birthday' && a.date.startsWith(ym)), teamDone = acts.some(a => a.kind === 'team' && a.date >= qs0);
  const star = q("SELECT s.*, u.name FROM care_star s JOIN users u ON u.id=s.user_id WHERE s.store_id=? ORDER BY s.ym DESC, s.id DESC LIMIT 6", sid), starNow = star.find(s => s.ym === ym);
  const hol = HOLI.filter(h => h[1] >= L.addDays(t, -20) && h[1] <= L.addDays(t, 45)).map(([nm, d]) => ({ name: nm, date: d, done: acts.some(a => a.kind === 'holiday' && a.title.includes(nm) && a.date >= L.addDays(d, -20)) }));
  const used = acts.reduce((a, x) => a + (x.cost || 0), 0), a90 = acts.filter(a => a.date >= d90 && a.n_total), join = a90.length ? Math.round(a90.reduce((a, x) => a + x.n_join, 0) * 100 / a90.reduce((a, x) => a + x.n_total, 0)) : null;
  const logs = ids.length ? q(`SELECT * FROM care_log WHERE store_id=? AND user_id IN (${ids.join(',')}) ORDER BY date DESC`, sid) : [];
  const lastTalk = id => { const a = logs.find(l => l.user_id === id && l.kind === 'talk'), b = q1('SELECT date FROM talks WHERE user_id=? ORDER BY date DESC LIMIT 1', id); return [a?.date, b?.date].filter(Boolean).sort().pop() || null; };
  const talks = staff.map(x => ({ id: x.id, name: x.name, role: x.role_name, last: lastTalk(x.id) })).map(x => ({ ...x, done: !!x.last && x.last >= qs0 })), cover = Math.round(talks.filter(x => x.done).length * 100 / n);
  const newc = []; for (const x of staff) { const p = profileOf(x); if (dBetween(p.hire, t) > 100) continue; for (const d of [7, 30, 90]) { const due = L.addDays(p.hire, d); if (due > L.addDays(t, 7)) continue; const lg = logs.find(l => l.user_id === x.id && l.kind === 'new' + d); newc.push({ id: x.id, name: x.name, k: 'new' + d, d, due, done: !!lg, late: !lg && dBetween(due, t) > 3 }); } }
  const dueN = newc.filter(x => x.due <= t), newRate = dueN.length ? Math.round(dueN.filter(x => x.done).length * 100 / dueN.length) : 100;
  const sg = q('SELECT * FROM suggest WHERE store_id=? ORDER BY id DESC', sid), hrs = s => (Date.parse((s.reply_at || L.nowStr()).replace(' ', 'T')) - Date.parse(s.at.replace(' ', 'T'))) / 36e5;
  const sg90 = sg.filter(s => s.at >= d90), inTime = sg90.length ? Math.round(sg90.filter(s => s.reply_at && hrs(s) <= c.reply_h).length * 100 / sg90.length) : 100, sgOpen = sg.filter(s => !s.reply_at);
  const dorm = q('SELECT * FROM dorm_check WHERE store_id=? ORDER BY date DESC LIMIT 6', sid), dormDone = dorm.some(x => x.date.startsWith(ym));
  const hard = q('SELECT h.*, u.name FROM hardship h JOIN users u ON u.id=h.user_id WHERE h.store_id=? ORDER BY h.id DESC LIMIT 10', sid);
  const yr = t.slice(0, 4), wf = ids.length ? q(`SELECT * FROM welfare WHERE year=? AND user_id IN (${ids.join(',')})`, yr) : [];
  const welfare = staff.map(x => { const tn = profileOf(x).tenure; return { id: x.id, name: x.name, items: WELF.map(i => ({ i, na: i === '工龄奖' && tn < 1, done: wf.some(w => w.user_id === x.id && w.item === i) })) }; });
  const wfAll = welfare.flatMap(w => w.items.filter(i => !i.na)), wfRate = wfAll.length ? Math.round(wfAll.filter(i => i.done).length * 100 / wfAll.length) : 100;
  const kudos = q('SELECT k.*, a.name to_name, b.name from_name FROM kudos k JOIN users a ON a.id=k.to_user LEFT JOIN users b ON b.id=k.from_user WHERE k.store_id=? ORDER BY k.id DESC LIMIT 20', sid);
  const lab = laborOf(sid), night = lab.ot.filter(o => o.ot > 24 && ids.includes(o.id)).map(o => ({ id: o.id, name: o.name, ot: o.ot, done: logs.some(l => l.user_id === o.id && l.kind === 'night' && l.date.startsWith(ym)) }));
  const fam = staff.filter(x => hx('fe' + x.id + ym) < 0.1).map(x => ({ id: x.id, name: x.name, ev: ['结婚', '家中添丁', '家人住院'][Math.floor(hx('fk' + x.id + ym) * 3)], done: logs.some(l => l.user_id === x.id && l.kind === 'family' && l.date.startsWith(ym)) }));
  const vc = Object.fromEntries(VOICE.map(v => [v, { n: 0, src: {} }])), bump = (v, s) => { vc[v].n++; vc[v].src[s] = (vc[v].src[s] || 0) + 1; };
  sg90.forEach(s => bump(VOICE.includes(s.cat) ? s.cat : '其他', '意见箱'));
  q('SELECT comment FROM survey_resp WHERE store_id=? AND at>=? AND comment<>\'\'', sid, d90).forEach(r => { const k = KW2V.find(([re]) => re.test(r.comment)); bump(k ? k[1] : '其他', '敬业度调研'); });
  q("SELECT reason FROM hr_moves WHERE store_id=? AND kind='leave' AND date>=?", sid, L.addDays(t, -180)).forEach(m => EXIT2V[m.reason] && bump(EXIT2V[m.reason], '离职面谈'));
  const fixes = q('SELECT * FROM voice_fix WHERE store_id=? ORDER BY id DESC LIMIT 10', sid);
  const voice = VOICE.map(v => ({ theme: v, ...vc[v], fix: fixes.find(f => f.theme === v && f.status === 'open') || null })).filter(v => v.n).sort((a, b) => b.n - a.n);
  const parts = [['员工餐满意度', rate.avg != null ? clamp(rate.avg * 20) : 80, 20], ['菜单发布', pub * 25, 10], ['员工活动', Math.round(((bdays.length ? +bdDone : 1) + +teamDone + +!!starNow) * 100 / 3), 15], ['一对一谈心覆盖', cover, 20],
    ['新人关怀', newRate, 10], ['意见 48 小时回复', inTime, 15], ['宿舍休息区检查', dormDone ? 100 : dom > 20 ? 0 : 60, 10]].map(([l, v, w]) => ({ l, v, w }));
  const score = Math.round(parts.reduce((a, p) => a + p.v * p.w, 0) / 100), A = [];
  if (!menu) A.push({ lv: 'warn', type: '员工餐', text: '本周员工餐菜单还没有发布' });
  if (rate.avg != null && rate.avg < c.meal_th) A.push({ lv: 'bad', type: '员工餐', text: `员工餐满意度 ${rate.avg} 分，低于 ${c.meal_th} 分，请查看意见并改进` });
  if (bdays.length && !bdDone) A.push({ lv: 'warn', type: '员工活动', text: `本月 ${bdays.length} 人过生日，生日会还没办` });
  hol.filter(h => !h.done && h.date <= L.addDays(t, 7)).forEach(h => A.push({ lv: 'warn', type: '员工活动', text: `${h.name}（${h.date}）节日关怀待安排` }));
  if (!teamDone && Number(t.slice(5, 7)) % 3 === 0) A.push({ lv: 'warn', type: '员工活动', text: '本季度团建还没办' });
  if (!starNow && dom >= 25) A.push({ lv: 'warn', type: '员工活动', text: '本月之星还没提名' });
  newc.filter(x => x.late).forEach(x => A.push({ lv: 'bad', type: '新人关怀', text: `${x.name} 入职 ${x.d} 天关怀已逾期（应于 ${x.due}）` }));
  if (cover < 100 && Number(t.slice(5, 7)) % 3 === 0) A.push({ lv: 'warn', type: '谈心', text: `本季度一对一谈心覆盖 ${cover}%，还有 ${talks.filter(x => !x.done).length} 人未谈` });
  sgOpen.filter(s => hrs(s) > 24).forEach(s => A.push({ lv: hrs(s) > c.reply_h ? 'bad' : 'warn', type: '意见箱', text: `「${s.body.slice(0, 16)}」已 ${Math.round(hrs(s))} 小时未回复` }));
  if (!dormDone && dom > 20) A.push({ lv: 'warn', type: '宿舍检查', text: '本月宿舍和员工休息区还没检查' });
  night.filter(x => !x.done).forEach(x => A.push({ lv: 'warn', type: '高强度关怀', text: `${x.name} 本月加班 ${x.ot} 小时，建议安排调休或夜宵补贴` }));
  fam.filter(x => !x.done).forEach(x => A.push({ lv: 'warn', type: '家属关怀', text: `${x.name} ${x.ev}，建议慰问（模拟事件）` }));
  voice.filter(v => v.n >= 3 && !v.fix).forEach(v => A.push({ lv: 'warn', type: '员工声音', text: `近 90 天「${v.theme}」被提到 ${v.n} 次，需要制定改进措施` }));
  return { id: sid, name: sname(sid), n: staff.length, score, parts, alerts: A,
    meal: { std: c.meal_std, menu, pub, rate, rNow, rLast, spend, budget, th: c.meal_th }, acts: acts.slice(0, 12), bdays, bdDone, teamDone, star, starNow, hol,
    budget: { per: c.act_budget, total: c.act_budget * n, used }, join, talks, cover, newc, newRate, sg: sg.slice(0, 12), sgOpen: sgOpen.length, inTime, dorm, dormDone, hard, welfare, wfRate, kudos, night, fam, voice, fixes, qs: qs0 };
}
const stabMix = s => Math.round(hrStats(s).stab * 0.6 + careOf(s).score * 0.4);
function leaveCorr(sids) {
  const t = L.today(), act = sids.map(careOf), cover = Math.round(act.reduce((a, x) => a + x.cover, 0) / Math.max(1, act.length)), join = Math.round(act.reduce((a, x) => a + (x.join ?? 75), 0) / Math.max(1, act.length));
  const lv = sids.length ? q(`SELECT id FROM hr_moves WHERE kind='leave' AND voluntary=1 AND store_id IN (${sids.join(',')}) AND date>=?`, L.addDays(t, -365)) : [];
  const f = k => Math.round(lv.reduce((a, m) => a + hx(k + m.id), 0) / Math.max(1, lv.length) * 100);
  return { n: lv.length, rows: [{ l: '最近一季度有一对一谈心', leave: Math.round(f('lt') * 0.5), stay: cover }, { l: '近 90 天参加员工活动', leave: Math.round(f('la') * 0.7), stay: join }, { l: '提的意见得到回复', leave: Math.round(40 + f('ls') * 0.3), stay: 88 }, { l: '近 30 天收到过认可', leave: Math.round(f('lk') * 0.4), stay: 64 }] };
}
app.get('/api/care', (req, res) => {
  const u = req.u; if (!CARE_LV.includes(u.level) && u.role_name !== '店助') return deny(res);
  const sids = visibleStores(u), sid = Number(req.query.store) || (sids.length === 1 ? sids[0] : 0); if (sid && !sids.includes(sid)) return deny(res);
  const t = L.today(), qs0 = qStart(t), c = careCfg();
  const list = sids.map(s => { const x = careOf(s); return { id: s, name: x.name, score: x.score, alerts: x.alerts.length, meal: x.meal.rate.avg, cover: x.cover, inTime: x.inTime, join: x.join, used: x.budget.used, total: x.budget.total }; });
  const sms = ['region_manager', 'coach', 'hr_manager', 'hq'].includes(u.level) ? [...new Set(sids.flatMap(s => D.storeManagers(s)))].map(id => { const m = q1(USER_SQL + ' WHERE u.id=?', id), l = q1("SELECT * FROM care_log WHERE user_id=? AND kind='sm_talk' ORDER BY date DESC LIMIT 1", id), ss = smStores(id).filter(s => sids.includes(s));
    return { id, name: m.name, stores: ss.map(sname).join('、'), score: Math.round(ss.reduce((a, s) => a + careOf(s).score, 0) / Math.max(1, ss.length)), last: l?.date || null, note: l?.note || '', done: !!l && l.date >= qs0, load: Math.round(55 + hx('ld' + id + t.slice(0, 7)) * 40) }; }) : [];
  const pend = { hard: q(`SELECT h.*, u.name, s.name store FROM hardship h JOIN users u ON u.id=h.user_id JOIN stores s ON s.id=h.store_id WHERE h.status='pending' AND h.store_id IN (${sids.join(',') || 0})`), star: q(`SELECT x.*, u.name, s.name store FROM care_star x JOIN users u ON u.id=x.user_id JOIN stores s ON s.id=x.store_id WHERE x.status='pending' AND x.store_id IN (${sids.join(',') || 0})`) };
  res.json({ cfg: c, list, sel: sid ? careOf(sid) : null, sms, pend, corr: sid ? null : leaveCorr(sids), stores: sids.map(s => ({ id: s, name: sname(s) })), can_do: sid ? canCareDo(u, sid) : false, is_hr: u.level === 'hr_manager',
    can_sm: ['region_manager', 'coach'].includes(u.level), kinds: CARE_KIND, log_kinds: LOG_KIND, welf: WELF, voice: VOICE, holi: HOLI, sim: true });
});
app.post('/api/care/cfg', (req, res) => { if (req.u.level !== 'hr_manager') return deny(res); const b = req.body || {}, o = {}; for (const k of Object.keys(CARE_DEF)) if (Number(b[k]) > 0) o[k] = Number(b[k]); D.setSetting('care_cfg', { ...D.getSetting('care_cfg', {}), ...o }); res.json({ ok: true }); });
const mineStore = u => u.store_id || smStores(u.id)[0];
app.post('/api/care/menu', (req, res) => { const b = req.body || {}, sid = Number(b.store_id); if (!canCareDo(req.u, sid)) return deny(res); if (!(b.body || '').trim()) return err(res, '请填写菜单');
  run('INSERT INTO meal_menu(store_id,week,body,by,at) VALUES(?,?,?,?,?) ON CONFLICT(store_id,week) DO UPDATE SET body=excluded.body, by=excluded.by, at=excluded.at', sid, wkOf(L.today()), b.body.trim(), req.u.id, L.nowStr());
  D.notify(hcPeople(sid).filter(x => x.pos !== '店长').map(x => x.id), 'care', '本周员工餐菜单已发布', b.body.trim().slice(0, 40), '#/mycare'); res.json({ ok: true }); });
app.post('/api/care/rate', (req, res) => { const b = req.body || {}, s = Number(b.score), sid = req.u.store_id; if (req.u.level !== 'staff' || !sid) return deny(res); if (!(s >= 1 && s <= 5)) return err(res, '请打 1 到 5 分');
  const ym = L.today().slice(0, 7); if (q1('SELECT 1 x FROM meal_rate WHERE user_id=? AND ym=?', req.u.id, ym)) return err(res, '本月已评价');
  run('INSERT INTO meal_rate(user_id,ym,store_id,score,comment) VALUES(?,?,?,?,?)', req.u.id, ym, sid, Math.round(s), (b.comment || '').trim()); res.json({ ok: true }); });
app.post('/api/care/act', (req, res) => { const b = req.body || {}, sid = Number(b.store_id); if (!canCareDo(req.u, sid)) return deny(res); if (!CARE_KIND[b.kind] || !(b.title || '').trim()) return err(res, '请填写活动类型和名称');
  const ph = savePhoto(b.photo); if (!ph) return err(res, '请上传活动照片');
  run('INSERT INTO care_act(store_id,kind,title,date,n_join,n_total,cost,photo,note,by) VALUES(?,?,?,?,?,?,?,?,?,?)', sid, b.kind, b.title.trim(), b.date || L.today(), Number(b.n_join) || 0, Number(b.n_total) || hcPeople(sid).length - 1, Number(b.cost) || 0, ph, b.note || '', req.u.id);
  if (Number(b.n_total) > Number(b.n_join)) D.notify(D.storeManagers(sid), 'care', `${b.title}：${Number(b.n_total) - Number(b.n_join)} 人没参加`, '值班或休假没参加的员工，建议补发礼品或另行安排', '#/care?store=' + sid);
  res.json({ ok: true }); });
app.post('/api/care/log', (req, res) => { const b = req.body || {}, sid = Number(b.store_id), uid = Number(b.user_id); if (!LOG_KIND[b.kind]) return err(res, '类型不正确'); if (!(b.note || '').trim()) return err(res, '请填写记录');
  if (b.kind === 'sm_talk') { if (!['region_manager', 'coach'].includes(req.u.level) || !smStores(uid).some(s => visibleStores(req.u).includes(s))) return deny(res); }
  else if (!canCareDo(req.u, sid) || q1('SELECT store_id FROM users WHERE id=?', uid)?.store_id !== sid) return deny(res);
  run('INSERT INTO care_log(store_id,user_id,kind,date,note,follow,by) VALUES(?,?,?,?,?,?,?)', b.kind === 'sm_talk' ? smStores(uid)[0] : sid, uid, b.kind, L.today(), b.note.trim(), b.follow || '', req.u.id);
  if (b.follow) D.notify([b.kind === 'sm_talk' ? uid : req.u.id], 'care', `${LOG_KIND[b.kind]}跟进事项`, b.follow, b.kind === 'sm_talk' ? '#/care' : '#/care?store=' + sid);
  if (b.escalate) D.notify(D.regionUsers(regionOfStore(sid || smStores(uid)[0]), 'hr_manager'), 'care', '员工关怀需要人事介入', `${LOG_KIND[b.kind]}：${b.note.trim().slice(0, 40)}`, '#/care?store=' + sid);
  res.json({ ok: true }); });
app.post('/api/care/suggest', (req, res) => { const b = req.body || {}, sid = req.u.store_id; if (req.u.level !== 'staff' || !sid) return deny(res); if (!(b.body || '').trim()) return err(res, '请填写意见');
  run("INSERT INTO suggest(store_id,cat,body,at) VALUES(?,?,?,?)", sid, VOICE.includes(b.cat) ? b.cat : '其他', b.body.trim(), L.nowStr());
  D.notify(D.storeManagers(sid), 'care', '意见箱收到一条匿名意见', `${b.cat || '其他'}：${b.body.trim().slice(0, 30)}，请 48 小时内回复`, '#/care?store=' + sid); res.json({ ok: true }); });
app.post('/api/care/suggest/:id', (req, res) => { const s = q1('SELECT * FROM suggest WHERE id=?', req.params.id), b = req.body || {}; if (!s || !canCareDo(req.u, s.store_id)) return deny(res); if (!(b.reply || '').trim()) return err(res, '请填写回复');
  run('UPDATE suggest SET reply=?, reply_at=?, reply_by=? WHERE id=?', b.reply.trim(), L.nowStr(), req.u.id, s.id); res.json({ ok: true }); });
app.post('/api/care/dorm', (req, res) => { const b = req.body || {}, sid = Number(b.store_id); if (!canCareDo(req.u, sid)) return deny(res); const ph = savePhoto(b.photo); if (!ph) return err(res, '请上传现场照片');
  run('INSERT INTO dorm_check(store_id,date,ok,issues,photo,by) VALUES(?,?,?,?,?,?)', sid, L.today(), b.issues ? 0 : 1, b.issues || '', ph, req.u.id); res.json({ ok: true }); });
app.post('/api/care/hardship', (req, res) => { const b = req.body || {}, u = req.u, uid = u.level === 'staff' ? u.id : Number(b.user_id), sid = q1('SELECT store_id FROM users WHERE id=?', uid)?.store_id;
  if (!sid || (u.level !== 'staff' && !canCareDo(u, sid))) return deny(res); if (!(b.reason || '').trim()) return err(res, '请说明情况');
  run("INSERT INTO hardship(store_id,user_id,kind,amount,reason,status,at,by) VALUES(?,?,?,?,?,'pending',?,?)", sid, uid, b.kind || '生活困难', Number(b.amount) || 0, b.reason.trim(), L.nowStr(), u.id);
  D.notify(D.regionUsers(regionOfStore(sid), 'hr_manager'), 'care', '新的困难帮扶申请', `${sname(sid)}：${b.kind || '生活困难'}`, '#/care'); res.json({ ok: true }); });
app.post('/api/care/hardship/:id', (req, res) => { const h = q1('SELECT * FROM hardship WHERE id=?', req.params.id), b = req.body || {}; if (!h || req.u.level !== 'hr_manager' || !visibleStores(req.u).includes(h.store_id)) return deny(res); if (h.status !== 'pending') return err(res, '已处理');
  run('UPDATE hardship SET status=?, note=?, hr_by=? WHERE id=?', b.ok ? 'approved' : 'rejected', b.note || '', req.u.id, h.id);
  D.notify([h.user_id, ...D.storeManagers(h.store_id)], 'care', b.ok ? '困难帮扶申请已通过' : '困难帮扶申请未通过', b.note || '', '#/mycare'); res.json({ ok: true }); });
app.post('/api/care/welfare', (req, res) => { const b = req.body || {}, uid = Number(b.user_id), sid = q1('SELECT store_id FROM users WHERE id=?', uid)?.store_id; if (!sid || !canCareDo(req.u, sid)) return deny(res); if (!WELF.includes(b.item)) return err(res, '福利项目不正确');
  run('INSERT OR IGNORE INTO welfare(user_id,item,year,done_at,by) VALUES(?,?,?,?,?)', uid, b.item, L.today().slice(0, 4), L.today(), req.u.id); res.json({ ok: true }); });
app.post('/api/care/kudos', (req, res) => { const b = req.body || {}, to = q1(USER_SQL + ' WHERE u.id=?', Number(b.to_user)); if (!to || !to.store_id || !(b.text || '').trim()) return err(res, '请选择同事并填写认可内容');
  const u = req.u, fk = u.level === 'staff' ? '同事' : b.from_kind === '宾客' ? '宾客' : '店长';
  if (u.level === 'staff' ? u.store_id !== to.store_id || u.id === to.id : !canCareDo(u, to.store_id)) return deny(res);
  run('INSERT INTO kudos(store_id,to_user,from_user,from_kind,text,at) VALUES(?,?,?,?,?,?)', to.store_id, to.id, fk === '宾客' ? null : u.id, fk, b.text.trim(), L.nowStr());
  D.notify([to.id], 'praise', `收到${fk === '宾客' ? '宾客' : u.name}的认可`, b.text.trim(), '#/mycare'); res.json({ ok: true }); });
app.post('/api/care/star', (req, res) => { const b = req.body || {}, uid = Number(b.user_id), sid = q1('SELECT store_id FROM users WHERE id=?', uid)?.store_id, ym = L.today().slice(0, 7);
  if (!sid || !canCareDo(req.u, sid)) return deny(res); if (!(b.reason || '').trim()) return err(res, '请填写推荐理由'); if (q1("SELECT 1 x FROM care_star WHERE store_id=? AND ym=? AND status<>'rejected'", sid, ym)) return err(res, '本月已提名');
  run("INSERT INTO care_star(store_id,user_id,ym,reason,status,by) VALUES(?,?,?,?,'pending',?)", sid, uid, ym, b.reason.trim(), req.u.id);
  D.notify(D.regionUsers(regionOfStore(sid), 'hr_manager'), 'care', `${sname(sid)} 提名本月之星`, b.reason.trim().slice(0, 30), '#/care'); res.json({ ok: true }); });
app.post('/api/care/star/:id', (req, res) => { const s = q1('SELECT * FROM care_star WHERE id=?', req.params.id), b = req.body || {}; if (!s || req.u.level !== 'hr_manager' || !visibleStores(req.u).includes(s.store_id)) return deny(res); if (s.status !== 'pending') return err(res, '已处理');
  run('UPDATE care_star SET status=? WHERE id=?', b.ok ? 'approved' : 'rejected', s.id);
  if (b.ok) { run("INSERT INTO kudos(store_id,to_user,from_user,from_kind,text,at) VALUES(?,?,?,'店长',?,?)", s.store_id, s.user_id, s.by, `当选 ${s.ym} 月度之星：${s.reason}`, L.nowStr()); D.notify([s.user_id], 'praise', `你当选 ${s.ym} 月度之星`, s.reason, '#/mycare'); }
  res.json({ ok: true }); });
app.post('/api/care/fix', (req, res) => { const b = req.body || {}, sid = Number(b.store_id); if (!canCareDo(req.u, sid)) return deny(res);
  if (b.id) { const f = q1('SELECT * FROM voice_fix WHERE id=? AND store_id=?', Number(b.id), sid); if (!f) return deny(res); run("UPDATE voice_fix SET status='done', result=?, done_at=? WHERE id=?", b.result || '', L.today(), f.id); return res.json({ ok: true }); }
  if (!VOICE.includes(b.theme) || !(b.action || '').trim()) return err(res, '请填写改进措施');
  run("INSERT INTO voice_fix(store_id,theme,action,status,due,by,at) VALUES(?,?,?,'open',?,?,?)", sid, b.theme, b.action.trim(), b.due || L.addDays(L.today(), 30), req.u.id, L.today());
  D.notify(hcPeople(sid).filter(x => x.pos !== '店长').map(x => x.id), 'care', `门店针对「${b.theme}」的改进`, b.action.trim(), '#/mycare'); res.json({ ok: true }); });
app.get('/api/care/me', (req, res) => {
  const u = req.u, sid = u.store_id; if (!sid) return res.json({ none: true });
  const t = L.today(), ym = t.slice(0, 7), c = careOf(sid), p = profileOf(u), ex = execScore(u.id), nx = nextRole(u.role_name);
  const credits = q("SELECT c.start, c.end FROM train_enroll e JOIN train_classes c ON c.id=e.class_id WHERE e.user_id=? AND e.status IN ('passed','certified') AND c.start>=?", u.id, t.slice(0, 4) + '-01-01').reduce((a, x) => a + (dBetween(x.start, x.end) + 1) * 4, 0);
  const cert = p.certs.filter(x => x.name !== '健康证'), mon = Math.round(dBetween(p.history[p.history.length - 1].from, t) / 30);
  const req2 = nx ? [{ l: '执行分 85 分以上', ok: (ex?.score ?? 0) >= 85, v: ex ? ex.score + ' 分' : '暂无' }, { l: '年度学分 24 分', ok: credits >= 24, v: credits + ' 分' }, { l: '品牌认证在有效期内', ok: cert.length ? cert.every(x => x.expire >= t) : false, v: cert.length ? cert.map(x => x.expire).join('、') + ' 到期' : '未认证' }, { l: '现岗位满 6 个月', ok: mon >= 6, v: mon + ' 个月' }] : [];
  res.json({ meal: { std: c.meal.std, menu: c.meal.menu, rated: q1('SELECT score, comment FROM meal_rate WHERE user_id=? AND ym=?', u.id, ym) || null, avg: c.meal.rate.avg },
    acts: c.acts.slice(0, 5).map(a => ({ kind: a.kind, title: a.title, date: a.date })), bday: bdOf(u.id), kudos: q('SELECT k.*, b.name from_name FROM kudos k LEFT JOIN users b ON b.id=k.from_user WHERE k.to_user=? ORDER BY k.id DESC LIMIT 10', u.id),
    welfare: c.welfare.find(w => w.id === u.id)?.items || [], replies: c.sg.filter(s => s.reply).slice(0, 5).map(s => ({ cat: s.cat, body: s.body, reply: s.reply })), fixes: c.fixes.slice(0, 5),
    hard: q('SELECT kind, amount, status, note, at FROM hardship WHERE user_id=? ORDER BY id DESC LIMIT 3', u.id), team: hcPeople(sid).filter(x => x.id !== u.id && x.pos !== '店长').map(x => ({ id: x.id, name: x.name })),
    grow: { role: u.role_name, next: nx, req: req2, history: p.history, certs: p.certs, credits, exec: ex?.score ?? null }, voice: VOICE });
});
function seedCare() {
  if (D.getSetting('care_seeded', 0)) return;
  const t = L.today(), ym = t.slice(0, 7), lm = L.addDays(ym + '-01', -1).slice(0, 7), wk = wkOf(t);
  const MENU = ['周一 红烧肉 / 番茄炒蛋 / 青菜豆腐汤', '周二 宫保鸡丁 / 清炒时蔬 / 紫菜蛋花汤', '周三 鱼香肉丝 / 土豆丝 / 冬瓜排骨汤', '周四 糖醋里脊 / 蒜蓉西兰花 / 玉米汤', '周五 黄焖鸡 / 炒豆芽 / 酸辣汤'];
  const CMT = ['菜量可以再多一点', '夜班没有热饭', '周三的鱼不新鲜', '口味不错', '希望多一些蔬菜', '饭点经常排队', ''];
  D.tx(() => {
    for (const s of q('SELECT id FROM stores')) {
      const sid = s.id, st = hcPeople(sid).filter(x => x.pos !== '店长'), sm = D.storeManagers(sid)[0] || null, weak = sid === 3, k = x => hx(x + sid);
      [0, 7, 14, 21].forEach((d, i) => { if (!(weak && i < 2) && !(sid === 4 && i === 0)) run('INSERT OR IGNORE INTO meal_menu(store_id,week,body,by,at) VALUES(?,?,?,?,?)', sid, L.addDays(wk, -d), MENU.join('\n'), sm, L.addDays(wk, -d - 2) + ' 17:00'); });
      for (const m of [lm, ym]) st.forEach((u, i) => { if (m === ym && hx('mr' + u.id) < 0.5) return; const sc = Math.max(1, Math.min(5, Math.round((weak ? 3.3 : 4.5) + (hx('ms' + u.id + m) - 0.5) * 2)));
        run('INSERT OR IGNORE INTO meal_rate(user_id,ym,store_id,score,comment) VALUES(?,?,?,?,?)', u.id, m, sid, sc, sc <= 3 ? CMT[Math.floor(hx('mc' + u.id + m) * 3)] : hx('mk' + u.id) < 0.3 ? CMT[3 + Math.floor(hx('ml' + u.id) * 3)] : ''); });
      for (let i = 1; i <= 6; i++) { const d = L.addDays(ym + '-15', -30 * i); if (!(weak && i < 2)) run("INSERT INTO care_act(store_id,kind,title,date,n_join,n_total,cost,photo,note,by) VALUES(?,'birthday',?,?,?,?,?,'sim','',?)", sid, d.slice(5, 7).replace(/^0/, '') + ' 月生日会', d, 2 + Math.floor(k('bj' + i) * 3), 3 + Math.floor(k('bt' + i) * 2), 300 + Math.floor(k('bc' + i) * 200), sm); }
      if (sid !== 3) run("INSERT INTO care_act(store_id,kind,title,date,n_join,n_total,cost,photo,note,by) VALUES(?,'birthday',?,?,?,?,?,'sim','',?)", sid, Number(t.slice(5, 7)) + ' 月生日会', L.addDays(t, -3), 3, 4, 420, sm);
      run("INSERT INTO care_act(store_id,kind,title,date,n_join,n_total,cost,photo,note,by) VALUES(?,'holiday','中秋节关怀：月饼和水果',?,?,?,?,'sim','',?)", sid, '2026-09-24', st.length, st.length, st.length * 80, sm);
      if (!weak) run("INSERT INTO care_act(store_id,kind,title,date,n_join,n_total,cost,photo,note,by) VALUES(?,'team',?,?,?,?,?,'sim','',?)", sid, sid === 1 ? '秋季团建：西湖徒步' : '团建：员工聚餐和桌游', L.addDays(t, -12 - sid), st.length - 2, st.length, st.length * 120, sm);
      st.forEach(u => { if (hx('tk' + u.id) < (weak ? 0.3 : 0.7)) run("INSERT INTO care_log(store_id,user_id,kind,date,note,follow,by) VALUES(?,?,'talk',?,?,?,?)", sid, u.id, L.addDays(t, -Math.floor(2 + hx('td' + u.id) * 40)), ['想学前台收银，希望安排轮岗', '家里老人生病，希望调成白班', '对现在的工作比较满意', '觉得布草车太旧，推起来费力'][Math.floor(hx('tn' + u.id) * 4)], '', sm);
        const p = profileOf(u); if (dBetween(p.hire, t) <= 100) [7, 30].forEach(d => { if (L.addDays(p.hire, d) < t && !(weak && d === 30)) run("INSERT INTO care_log(store_id,user_id,kind,date,note,follow,by) VALUES(?,?,?,?,?,'',?)", sid, u.id, 'new' + d, L.addDays(p.hire, d), d === 7 ? '已熟悉岗位和同事，师傅带得好' : '适应良好，排班希望固定', sm); });
        WELF.forEach(w => { if (hx('wf' + u.id + w) < (w === '年度体检' ? 0.6 : 0.85)) run('INSERT OR IGNORE INTO welfare(user_id,item,year,done_at,by) VALUES(?,?,?,?,?)', u.id, w, t.slice(0, 4), L.addDays(t, -Math.floor(hx('wd' + u.id + w) * 200)), sm); }); });
      [['员工餐', '夜班员工希望能留一份热饭', 30, 1], ['设备工具', '吸尘器坏了一周还没修', 9, 1], ['排班', '希望排班表能提前一周公布', 4, sid !== 3], ['宿舍休息区', '休息室空调不制冷', 3, 0]].forEach(([cat, body, d, rep], i) => {
        const at = L.addDays(t, -d) + ' 10:00'; run('INSERT INTO suggest(store_id,cat,body,at,reply,reply_at,reply_by) VALUES(?,?,?,?,?,?,?)', sid, cat, body, at, rep ? '收到，已安排，本周内解决' : null, rep ? L.addDays(t, -d + 1) + ' 09:00' : null, rep ? sm : null); });
      if (!weak || sid === 1) run("INSERT INTO dorm_check(store_id,date,ok,issues,photo,by) VALUES(?,?,1,'','sim',?)", sid, L.addDays(t, -5), sm);
      run("INSERT INTO dorm_check(store_id,date,ok,issues,photo,by) VALUES(?,?,0,'宿舍热水器水温不稳，已报修','sim',?)", sid, L.addDays(t, -35), sm);
      const top = st.slice().sort((a, b) => hx('kx' + b.id) - hx('kx' + a.id));
      top.slice(0, 4).forEach((u, i) => run('INSERT INTO kudos(store_id,to_user,from_user,from_kind,text,at) VALUES(?,?,?,?,?,?)', sid, u.id, i === 1 ? null : i === 2 ? top[0].id : sm, ['店长', '宾客', '同事', '店长'][i], ['早高峰主动帮前台分流，宾客等候时间明显缩短', '携程点评：前台小姐姐很热情，帮我们安排了安静的房间', '我请假时主动帮我顶班', '连续 30 天查房零不合格'][i], L.addDays(t, -i * 4) + ' 15:00'));
      if (top[0]) run("INSERT INTO care_star(store_id,user_id,ym,reason,status,by) VALUES(?,?,?,?,'approved',?)", sid, top[0].id, lm, '执行分全店第一，月内获 6 次肯定', sm);
    }
    const w = q1("SELECT id, store_id FROM users WHERE store_id=3 AND active=1 AND role_id IN (SELECT id FROM roles WHERE level='staff') ORDER BY id LIMIT 1");
    if (w) run("INSERT INTO hardship(store_id,user_id,kind,amount,reason,status,at,by) VALUES(3,?,'家人重病',3000,'母亲住院手术，申请临时困难补助','pending',?,?)", w.id, L.addDays(t, -1) + ' 11:00', w.id);
    const w2 = q1("SELECT id FROM users WHERE store_id=3 AND active=1 AND role_id IN (SELECT id FROM roles WHERE level='staff') ORDER BY id DESC LIMIT 1");
    if (w2) run("INSERT INTO care_star(store_id,user_id,ym,reason,status,by) VALUES(3,?,?,'本月宾客表扬 3 次，主动承担夜班','pending',?)", w2.id, ym, D.storeManagers(3)[0] || null);
    D.setSetting('care_seeded', 1);
  });
}
seedCare();
for (const [n, lv] of [['省区总经理', 'hq'], ['储备区域经理', 'coach']]) if (!q1('SELECT 1 FROM roles WHERE name=?', n)) run('INSERT INTO roles(name,level,sort) VALUES(?,?,0)', n, lv);
if (!q1('SELECT 1 FROM provinces')) run("INSERT INTO provinces(id,name) VALUES(1,'华东省区')");
run('UPDATE regions SET province_id=1 WHERE province_id IS NULL');

// ---------- 说明文档：责任人与咨询 ----------
D.db.exec('CREATE TABLE IF NOT EXISTS help_q(id INTEGER PRIMARY KEY, hkey TEXT, title TEXT, kind TEXT, text TEXT, user_id INTEGER, owner_id INTEGER, created_at TEXT, reply TEXT, replied_at TEXT)');
const HELP_OWNER_DEF = { home: 'ops_manager', must: 'ops_manager', deleg: 'ops_manager', pfind: 'region_manager', patrol: 'region_manager', rect: 'ops_manager', issues: 'region_manager', hrm: 'hr_manager', care: 'hr_manager', dataauth: 'hq', dash: 'region_manager', coach: 'coach', sbiz: 'sales_manager' };
const helpOwners = () => ({ ...HELP_OWNER_DEF, ...D.getSetting('help_owner', {}) });
const helpOwnerOf = (u, k) => {
  const v = helpOwners()[k];
  if (!v) return null;
  const sel = 'SELECT u.id, u.name, u.phone, r.name role_name, r.level FROM users u JOIN roles r ON r.id=u.role_id WHERE u.active=1 AND ';
  return typeof v === 'number' ? q1(sel + 'u.id=?', v) : (q1(sel + 'r.level=? AND u.region_id=? ORDER BY u.id', v, u.region_id) || q1(sel + 'r.level=? ORDER BY u.id', v));
};
const canEditHelp = u => ['region_manager', 'hq'].includes(u.level);
app.get('/api/help', (req, res) => {
  const u = req.u, owners = {};
  for (const k of Object.keys(helpOwners())) {
    const o = helpOwnerOf(u, k);
    if (o) owners[k] = { id: o.id, name: o.name, role: o.role_name, phone: o.phone };
  }
  const c = cfg(), cc = careCfg();
  res.json({ owners, cats: DA_CATS, mine_da: [...(daAuth()[daKey(u)] || [])], can_edit: canEditHelp(u), th: { ...HC_TH, ...cc, recheck_days: c.recheck_days, deleg_all: 30, deleg_task: 90, deleg_warn: 50, patrol_day_max: 3, stale: 30 },
    users: canEditHelp(u) ? q("SELECT u.id, u.name, r.name role_name FROM users u JOIN roles r ON r.id=u.role_id WHERE u.active=1 AND r.level NOT IN ('staff') AND u.store_id IS NULL ORDER BY u.id") : [] });
});
app.post('/api/help/owner', (req, res) => {
  if (!canEditHelp(req.u)) return deny(res, '说明责任人由区域经理或总部指定');
  const { key, user_id } = req.body || {};
  if (!HELP_OWNER_DEF[key]) return err(res, '没有这篇说明');
  if (!q1('SELECT 1 FROM users WHERE id=? AND active=1', user_id)) return err(res, '责任人不存在或已停用');
  const m = D.getSetting('help_owner', {}); m[key] = Number(user_id); D.setSetting('help_owner', m);
  D.audit(req.u.id, null, '指定说明责任人', key + ' → ' + user_id);
  res.json({ ok: true });
});
app.post('/api/help/ask', (req, res) => {
  const u = req.u, { key, title, kind, text } = req.body || {};
  const o = helpOwnerOf(u, key);
  if (!o) return err(res, '这篇说明还没有责任人');
  if (o.id === u.id) return err(res, '你就是这篇说明的责任人');
  const k = kind === 'unclear' ? 'unclear' : 'ask', tx = String(text || '').trim().slice(0, 1000);
  if (k === 'ask' && !tx) return err(res, '请写下你的问题');
  if (q1("SELECT 1 FROM help_q WHERE user_id=? AND hkey=? AND kind=? AND text=? AND created_at>?", u.id, key, k, tx, L.nowStr().slice(0, 10))) return err(res, '同样的问题今天已经提交过');
  const tt = String(title || key).slice(0, 60);
  const id = Number(run('INSERT INTO help_q(hkey,title,kind,text,user_id,owner_id,created_at) VALUES(?,?,?,?,?,?,?)', key, tt, k, tx, u.id, o.id, L.nowStr()).lastInsertRowid);
  D.notify([o.id], 'assign', k === 'unclear' ? '说明没看懂：' + tt : '咨询：' + tt, `${u.name}：${tx || '这篇说明没看懂'}`, '#/help/inbox');
  res.json({ ok: true, id, owner: o.name });
});
app.get('/api/help/q', (req, res) => {
  const u = req.u, f = r => ({ ...r, from: q1('SELECT name FROM users WHERE id=?', r.user_id)?.name, owner: q1('SELECT name FROM users WHERE id=?', r.owner_id)?.name });
  res.json({ inbox: q('SELECT * FROM help_q WHERE owner_id=? ORDER BY reply IS NOT NULL, id DESC LIMIT 100', u.id).map(f), mine: q('SELECT * FROM help_q WHERE user_id=? ORDER BY id DESC LIMIT 50', u.id).map(f) });
});
app.post('/api/help/q/:id/reply', (req, res) => {
  const r = q1('SELECT * FROM help_q WHERE id=?', req.params.id), tx = String(req.body?.reply || '').trim().slice(0, 1000);
  if (!r || r.owner_id !== req.u.id) return deny(res, '只有说明责任人可以回复');
  if (r.reply) return err(res, '已回复过');
  if (!tx) return err(res, '请填写回复');
  run('UPDATE help_q SET reply=?, replied_at=? WHERE id=?', tx, L.nowStr(), r.id);
  D.notify([r.user_id], 'assign', '咨询已回复：' + r.title, tx, '#/help/inbox');
  res.json({ ok: true });
});


// ---------- 店长阶段 ----------
const STAGES = {
  ext: { l: '外招新店长', days: 90, focus: '熟悉品牌标准和流程', budget: 120, scopes: ['one'], perm: '只能授权单次任务；每天的标准任务本人做' },
  int: { l: '内提新店长', days: 60, focus: '沟通和管理', budget: 90, scopes: ['one', 'task', 'all'], cap: 30, perm: '可以授权，转出比例上限 30%' },
  reserve: { l: '储备店长（不管店）', days: 90, focus: '辅助区域经理，积累经验', scopes: [], perm: '只看被指派的门店，只读；任务由区域经理或教练指派' },
  single: { l: '单店店长', focus: '守住底线', scopes: ['one', 'task', 'all'], cap: 30, must: true, perm: '店长必做项只能授权给店内储备店长；其余基础项可以授权，转出比例上限 30%' },
  multi: { l: '多店店长', focus: '管人管结果', scopes: ['one', 'task', 'all', 'appr'], perm: '可以按整类授权；可以把员工抽查、整改复查、请假和排班审批授权给负一层' },
};
const STAGE_STEPS = {
  ext: [['e1', '第 1-2 周', '跟岗：前台全流程亲自做一遍', 14, '#/tasks'], ['e2', '第 1-2 周', '跟岗：客房全流程亲自做一遍', 14, '#/tasks'], ['e3', '第 1-2 周', '跟岗：工程与安全巡检亲自做一遍', 14, '#/safety'], ['e4', '第 3-4 周', '去标杆店跟岗 2 天', 28, '#/home?pl=shop'],
    ['e5', '第 1-8 周', '每周标准考核（累计 4 次）', 56, '#/standards'], ['e6', '第 30 天', '教练 30 天评估', 30, '#/diag'], ['e7', '第 60 天', '教练 60 天评估', 60, '#/diag'], ['e8', '第 90 天', '取得店长班认证并通过 90 天评估', 90, '#/train']],
  int: [['i1', '第 1-2 周', '和每位员工一对一面谈', 14, '#/team'], ['i2', '第 1-2 周', '连续一周主持晨会', 14, '#/tasks'], ['i3', '第 3-4 周', '完成一次排班与人效优化', 28, '#/labor'], ['i4', '第 3-4 周', '独立处理一次客诉全流程', 28, '#/complaints'],
    ['i5', '第 1 月', '教练陪同参加第一次业主会议', 30, '#/frs'], ['i6', '第 30 天', '员工匿名评价（360）', 30, '#/engage'], ['i7', '第 2 月', '连续 4 周提交经营周报', 60, '#/report'], ['i8', '第 60 天', '教练 60 天评估', 60, '#/diag']],
  reserve: [['r1', '第 1 月', '随区域经理巡店 3 次并提交随行记录', 30, '#/rsv'], ['r2', '第 1-3 月', '轮岗满 3 家店（标杆店、问题店都要有）', 90, '#/rsv'], ['r3', '第 1-3 月', '完成 1 份区域专题分析或开业筹备清单', 90, '#/rsv'], ['r4', '按需', '店长休假时顶岗 1 次，无事故', 120, '#/rsv']],
};
const MUST_KW = ['晨会', '经营日报', '日报', '抽查', '客诉', '安全', '谈心'];
const isMust = title => MUST_KW.some(k => (title || '').includes(k));
const RSV_KINDS = ['规划', '巡店随行', '轮岗', '顶岗'];
function stageOf(uid) {
  const x = q1(USER_SQL + ' WHERE u.id=?', uid); if (!x) return null;
  const t = L.today(), row = q1('SELECT * FROM sm_stage WHERE user_id=?', uid), ob = q1('SELECT start FROM onboard_plan WHERE user_id=?', uid);
  let rec;
  if (x.reserve === 'sm_off') rec = 'reserve';
  else if (x.level !== 'store_manager') return null;
  else rec = ob && dBetween(ob.start, t) < 90 ? 'ext' : smStores(uid).length > 1 ? 'multi' : 'single';
  const k = row?.stage || rec, start = row?.start || (k === 'ext' && ob ? ob.start : t);
  return { k, ...STAGES[k], rec, start, day: dBetween(start, t) + 1, set: !!row, x };
}
const apprDeleg = (sid, uid) => q1("SELECT d.*, u.name from_name FROM delegations d JOIN users u ON u.id=d.from_id WHERE d.store_id=? AND d.to_id=? AND d.scope='appr' AND d.active=1 AND d.start<=? AND d.end>=?", sid, uid, L.today(), L.today());
const apprOk = (u, sid) => canManage(u, sid) || (u.level === 'staff' && u.store_id === Number(sid) && !!apprDeleg(Number(sid), u.id));
const neg1 = sid => delegCands(sid).map(c => { const e = execScore(c.id); return { ...c, score: e ? e.score : null, cert: !!e && e.score >= 80, reserve: q1('SELECT reserve FROM users WHERE id=?', c.id)?.reserve === 'sm', appr: !!apprDeleg(sid, c.id) }; });
function stageSteps(uid, st) {
  const L0 = STAGE_STEPS[st.k]; if (!L0) return [];
  const t = L.today(), rows = Object.fromEntries(q('SELECT s.*, u.name ok_name FROM stage_steps s LEFT JOIN users u ON u.id=s.ok_by WHERE s.user_id=? AND s.stage=?', uid, st.k).map(r => [r.step, r]));
  return L0.map(([k, phase, title, d, link]) => { const r = rows[k] || {}, due = L.addDays(st.start, d); return { k, phase, title, link, due, done_at: r.done_at || null, note: r.note || '', ok_at: r.ok_at || null, ok_name: r.ok_name || null, late: !r.done_at && due < t }; });
}
function stageGrad(uid, st, steps) {
  const sids = smStores(uid), t = L.today(), G = [], okN = steps.filter(s => s.ok_at).length;
  let grades = [], pass = null;
  if (sids.length) {
    const sc = Object.fromEntries(regionScores(regionOfStore(sids[0])).all.map(s => [s.id, s.grade]));
    grades = sids.map(s => ({ id: s, name: sname(s), grade: sc[s] || null }));
    const r = q1(`SELECT SUM(check_result='good') g, SUM(COALESCE(check_result,'')!='') n FROM instances WHERE date>=? AND store_id IN (${sids.join(',')})`, L.addDays(t, -30));
    pass = r.n ? Math.round(r.g * 100 / r.n) : null;
  }
  const gb = grades.length > 0 && grades.every(x => ['A', 'B'].includes(x.grade)), gs = grades.map(x => x.grade || '—').join(' / ') || '—';
  const step = ['任务包全部验收', steps.length > 0 && okN === steps.length, `${okN}/${steps.length}`];
  if (st.k === 'ext') { const c = !!smCertified(uid); G.push(step, ['取得店长班认证', c, c ? '已认证' : '未认证'], ['门店达到 B 级及以上', gb, gs], ['抽查合格率 ≥ 90%', (pass ?? 0) >= 90, (pass ?? '—') + '%']); }
  if (st.k === 'int') { const dg = smDiag(uid); G.push(step, ['门店达到 B 级及以上', gb, gs], ['能力诊断 ≥ 75 分', !!dg && dg.total >= 75, dg ? dg.total + ' 分' : '—']); }
  if (st.k === 'reserve') { const rot = q1("SELECT COUNT(DISTINCT store_id) n FROM rsv_tasks WHERE user_id=? AND kind='轮岗' AND status='done'", uid).n, dn = q1("SELECT COUNT(*) n FROM rsv_tasks WHERE user_id=? AND status='done'", uid).n;
    G.push(step, ['轮岗满 3 家店', rot >= 3, rot + ' 家'], ['完成指派任务 ≥ 5 项', dn >= 5, dn + ' 项']); }
  if (st.k === 'single') { const n1 = sids.flatMap(neg1).filter(c => c.cert).length, dg = smDiag(uid);
    G.push(['门店达到 B 级及以上', gb, gs], ['能力诊断 ≥ 80 分', !!dg && dg.total >= 80, dg ? dg.total + ' 分' : '—'], ['负一层至少 1 人认证（执行分 ≥ 80）', n1 > 0, n1 + ' 人']); }
  if (st.k === 'multi') { const no = sids.filter(s => !neg1(s).some(c => c.cert)).length, cd = grades.filter(x => ['C', 'D'].includes(x.grade));
    G.push(['名下门店没有 C、D 级', !cd.length, cd.length ? cd.map(x => x.name + ' ' + x.grade).join('、') : gs], ['每家店都有认证的负一层', !no, no ? no + ' 家店没有' : '都有']); }
  return { items: G.map(([l, ok, v]) => ({ l, ok, v })), all: G.every(g => g[1]), n: sids.length };
}
function stageSuggest(st, gr) {
  if (['ext', 'int'].includes(st.k) && gr.all) return { to: gr.n > 1 ? 'multi' : 'single', text: '毕业条件已全部达成，建议升阶' };
  if (st.k === 'reserve' && gr.all) return { to: 'int', text: '可以安排接店，按内提新店长进入' };
  if (st.k === 'single' && gr.n > 1) return { to: 'multi', text: '已经兼管多家店，建议切换为多店店长' };
  if (st.k === 'single' && gr.all) return { to: null, text: '已具备兼管条件，可以由区域经理安排第二家店' };
  if (st.k === 'multi' && gr.n <= 1) return { to: 'single', text: '只管 1 家店，建议切换为单店店长' };
  if (st.k === 'multi' && !gr.all) return { to: null, text: '有门店掉级或缺少认证的负一层，建议教练评估是否减少兼管' };
  return null;
}
const canStageSet = (u, x) => ['region_manager', 'coach', 'hq'].includes(u.level) && u.reserve !== 'rm' && sameRegion(u, x);
app.get('/api/stage/:uid', (req, res) => {
  const st = stageOf(Number(req.params.uid)); if (!st) return err(res, '仅适用于店长和储备店长');
  const x = st.x; if (!(x.id === req.u.id || (isRegion(req.u) && sameRegion(req.u, x)))) return deny(res);
  const steps = stageSteps(x.id, st), grad = stageGrad(x.id, st, steps), sids = smStores(x.id);
  res.json({ user: { id: x.id, name: x.name }, stage: st.k, label: st.l, focus: st.focus, perm: st.perm, days: st.days || null, budget: st.budget || BUDGET_MIN(sids.length), start: st.start, day: st.day, set: st.set, rec: st.rec,
    steps, grad, suggest: stageSuggest(st, grad), must: st.must ? MUST_KW : null, stores: sids.map(s => ({ id: s, name: sname(s), neg1: neg1(s) })), me: x.id === req.u.id, can_set: canStageSet(req.u, x),
    opts: Object.entries(STAGES).filter(([k]) => (k === 'reserve') === (x.reserve === 'sm_off')).map(([k, v]) => ({ k, l: v.l })) });
});
app.post('/api/stage/:uid', (req, res) => {
  const st = stageOf(Number(req.params.uid)), k = (req.body || {}).stage; if (!st) return err(res, '仅适用于店长和储备店长');
  if (!canStageSet(req.u, st.x)) return deny(res, '只有区域经理、教练可以调整店长阶段');
  if (!STAGES[k] || (k === 'reserve') !== (st.x.reserve === 'sm_off')) return err(res, '阶段无效');
  run('INSERT INTO sm_stage(user_id,stage,start,set_by,note) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET stage=excluded.stage, start=excluded.start, set_by=excluded.set_by, note=excluded.note', st.x.id, k, L.today(), req.u.id, (req.body || {}).note || '');
  D.notify([st.x.id], 'assign', `你的阶段调整为「${STAGES[k].l}」`, STAGES[k].perm, '#/stage');
  D.audit(req.u.id, null, '店长阶段', `${st.x.name} ${st.l} → ${STAGES[k].l}`); res.json({ ok: true });
});
app.post('/api/stage/:uid/step/:k', (req, res) => {
  const st = stageOf(Number(req.params.uid)); if (!st) return err(res, '仅适用于店长和储备店长');
  const s = stageSteps(st.x.id, st).find(z => z.k === req.params.k), op = (req.body || {}).op; if (!s) return err(res, '该项不存在');
  if (op === 'done') { if (req.u.id !== st.x.id) return deny(res);
    run('INSERT INTO stage_steps(user_id,stage,step,done_at,note) VALUES(?,?,?,?,?) ON CONFLICT(user_id,stage,step) DO UPDATE SET done_at=excluded.done_at, note=excluded.note', st.x.id, st.k, s.k, L.today(), req.body.note || '');
    const sup = q1('SELECT set_by FROM sm_stage WHERE user_id=?', st.x.id)?.set_by; if (sup) D.notify([sup], 'assign', `${st.x.name} 完成「${s.title}」，待验收`, req.body.note || '', '#/stage?uid=' + st.x.id);
  } else if (op === 'ok') { if (!canStageSet(req.u, st.x)) return deny(res); if (!s.done_at) return err(res, '还未完成，不能验收');
    run('UPDATE stage_steps SET ok_by=?, ok_at=? WHERE user_id=? AND stage=? AND step=?', req.u.id, L.today(), st.x.id, st.k, s.k); D.notify([st.x.id], 'assign', `「${s.title}」已验收`, '', '#/stage');
  } else return err(res, '操作无效');
  res.json({ ok: true });
});
function delegAppr(res, u, b) {
  const t = L.today(), sid = Number(b.store_id), start = b.start || t, end = b.end || L.addDays(t, 30);
  if (!canManage(u, sid)) return deny(res);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start < t || end < start || end > L.addDays(start, 90)) return err(res, '审批授权最长 90 天，起始日期不早于今天');
  const to = q1(USER_SQL + ' WHERE u.id=? AND u.active=1', b.to_id);
  if (!to || to.store_id !== sid || !DELEG_ROLES.includes(to.role_name)) return err(res, '只能授权给本店在职的店助或经理');
  run("UPDATE delegations SET active=0 WHERE store_id=? AND scope='appr' AND active=1", sid);
  const id = Number(run("INSERT INTO delegations(store_id,from_id,to_id,scope,title,start,end,review,active,created_at) VALUES(?,?,?,'appr',?,?,?,0,1,?)", sid, u.id, to.id, '审批：员工抽查、整改复查、请假、排班', start, end, L.nowStr()).lastInsertRowid);
  D.notify([to.id], 'assign', '店长授权审批', `${u.name} 将「${sname(sid)}」的员工抽查、整改复查、请假和排班审批授权给你（${start} 至 ${end}）`, '#/todo');
  D.audit(u.id, sid, '审批授权', `${to.name} ${start}~${end}`); res.json({ ok: true, id });
}
app.get('/api/rsv', (req, res) => {
  const u = req.u, T = uid => q("SELECT t.*, s.name store, b.name by_name FROM rsv_tasks t LEFT JOIN stores s ON s.id=t.store_id LEFT JOIN users b ON b.id=t.by_id WHERE t.user_id=? ORDER BY t.status='done', t.due", uid);
  if (u.reserve === 'sm_off') { const st = stageOf(u.id); return res.json({ mode: 'me', tasks: T(u.id), stage: st && { l: st.l, day: st.day, perm: st.perm } }); }
  if (!isRegion(u)) return deny(res);
  const off = q(USER_SQL + " WHERE u.active=1 AND u.reserve='sm_off' AND u.region_id=?", u.region_id).map(x => ({ id: x.id, name: x.name, day: stageOf(x.id)?.day, tasks: T(x.id) }));
  const ins = q(USER_SQL + " WHERE u.active=1 AND u.reserve='sm' AND u.store_id IN (SELECT id FROM stores WHERE region_id=?)", u.region_id).map(x => ({ id: x.id, name: x.name, role_name: x.role_name, store: sname(x.store_id), score: execScore(x.id)?.score ?? null }));
  res.json({ mode: 'region', off, ins, kinds: RSV_KINDS, stores: visibleStores(u).map(s => ({ id: s, name: sname(s) })), can_assign: ['region_manager', 'coach'].includes(u.level) && u.reserve !== 'rm' });
});
app.post('/api/rsv', (req, res) => {
  const u = req.u, b = req.body || {}, x = q1(USER_SQL + ' WHERE u.id=? AND u.active=1', b.user_id);
  if (!(['region_manager', 'coach'].includes(u.level) && u.reserve !== 'rm')) return deny(res, '储备店长的任务由区域经理或教练指派');
  if (!x || x.reserve !== 'sm_off' || !sameRegion(u, x)) return err(res, '只能指派给本区域的储备店长');
  if (!RSV_KINDS.includes(b.kind) || !String(b.title || '').trim()) return err(res, '请选择类型并填写任务');
  const sid = b.store_id ? Number(b.store_id) : null; if (sid && !visibleStores(u).includes(sid)) return err(res, '门店不在本区域');
  if (b.kind !== '规划' && !sid) return err(res, '巡店随行、轮岗、顶岗需要选择门店');
  run('INSERT INTO rsv_tasks(user_id,by_id,store_id,kind,title,due,created_at) VALUES(?,?,?,?,?,?,?)', x.id, u.id, sid, b.kind, String(b.title).trim(), b.due || L.addDays(L.today(), 14), L.nowStr());
  D.notify([x.id], 'assign', `${u.name} 给你指派了${b.kind}任务`, String(b.title).trim(), '#/rsv'); res.json({ ok: true });
});
app.post('/api/rsv/:id', (req, res) => {
  const u = req.u, r = q1('SELECT * FROM rsv_tasks WHERE id=?', req.params.id), b = req.body || {}; if (!r) return err(res, '任务不存在');
  if (b.op === 'done') { if (r.user_id !== u.id || r.status !== 'open') return deny(res); run("UPDATE rsv_tasks SET status='done', note=?, done_at=? WHERE id=?", b.note || '', L.nowStr(), r.id); D.notify([r.by_id], 'assign', `${u.name} 完成「${r.title}」`, b.note || '', '#/rsv'); }
  else if (b.op === 'score') { const x = q1(USER_SQL + ' WHERE u.id=?', r.user_id); if (!(r.by_id === u.id || (['region_manager', 'coach'].includes(u.level) && u.reserve !== 'rm' && sameRegion(u, x)))) return deny(res);
    const s = Number(b.score); if (!(s >= 1 && s <= 5)) return err(res, '评分为 1 到 5'); run('UPDATE rsv_tasks SET score=? WHERE id=?', s, r.id); }
  else return err(res, '操作无效');
  res.json({ ok: true });
});
if (!D.getSetting('seed_stage_v1', 0)) D.tx(() => {
  if (!q1("SELECT 1 FROM roles WHERE name='储备店长'")) run("INSERT INTO roles(name,level,sort) VALUES('储备店长','staff',0)");
  const rid = q1("SELECT id FROM roles WHERE name='储备店长'").id, t = L.today(), reg = q1('SELECT MIN(id) id FROM regions').id;
  const rm = q1("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.level='region_manager' AND u.region_id=? AND u.active=1 ORDER BY u.id", reg)?.id || null;
  const st = q('SELECT id FROM stores WHERE region_id=? ORDER BY id LIMIT 4', reg).map(s => s.id);
  [['许文博', '13761205571', 50, 3], ['郑雅琪', '13761205572', 20, 1]].forEach(([nm, ph, ago, rot]) => {
    if (q1('SELECT 1 FROM users WHERE name=? AND reserve=?', nm, 'sm_off')) return;
    const id = Number(run("INSERT INTO users(name,role_id,region_id,store_id,phone,reserve) VALUES(?,?,?,NULL,?,'sm_off')", nm, rid, reg, ph).lastInsertRowid);
    run('INSERT OR REPLACE INTO sm_stage(user_id,stage,start,set_by,note) VALUES(?,?,?,?,?)', id, 'reserve', L.addDays(t, -ago), rm, '');
    const add = (sid, kind, title, due, done, sc) => run('INSERT INTO rsv_tasks(user_id,by_id,store_id,kind,title,due,status,note,score,created_at,done_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)', id, rm, sid, kind, title, due, done ? 'done' : 'open', done ? '已完成，记录已提交' : '', sc, L.addDays(t, -ago) + ' 09:00', done ? due + ' 18:00' : null);
    for (let i = 0; i < rot && i < st.length; i++) add(st[i], '轮岗', `${sname(st[i])} 轮岗 2 周`, L.addDays(t, -ago + 14 * (i + 1)), true, 4);
    add(st[rot % st.length] || null, '轮岗', `${sname(st[rot % st.length])} 轮岗 2 周`, L.addDays(t, 10), false, null);
    add(null, '规划', '整理区域下季度开业筹备清单', L.addDays(t, 7), false, null);
    add(st[0] || null, '巡店随行', '随区域经理巡店并提交随行记录', L.addDays(t, -5), true, 5);
    run("INSERT OR IGNORE INTO stage_steps(user_id,stage,step,done_at,note,ok_by,ok_at) VALUES(?,?,?,?,?,?,?)", id, 'reserve', 'r1', L.addDays(t, -8), '随行 3 次', rm, L.addDays(t, -6));
  });
  for (const [nm, k, ago, done] of [['何静', 'ext', 20, ['e1', 'e2']], ['马超', 'int', 25, ['i1', 'i2', 'i4']]]) {
    const x = q1(USER_SQL + " WHERE u.name=? AND r.level='store_manager'", nm); if (!x) continue;
    run('INSERT OR IGNORE INTO sm_stage(user_id,stage,start,set_by,note) VALUES(?,?,?,?,?)', x.id, k, L.addDays(t, -ago), rm, '');
    done.forEach((s, i) => run('INSERT OR IGNORE INTO stage_steps(user_id,stage,step,done_at,note,ok_by,ok_at) VALUES(?,?,?,?,?,?,?)', x.id, k, s, L.addDays(t, -ago + 5 + i * 3), '', i < done.length - 1 ? rm : null, i < done.length - 1 ? L.addDays(t, -ago + 7 + i * 3) : null));
  }
  if (!q1("SELECT 1 FROM users WHERE reserve='sm'")) q("SELECT id FROM stores ORDER BY id").filter((_, i) => i % 3 === 0).forEach(st0 => {
    const a = q1("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.store_id=? AND u.active=1 AND r.name='店助' ORDER BY u.id", st0.id); if (a) run("UPDATE users SET reserve='sm' WHERE id=?", a.id); });
  D.setSetting('seed_stage_v1', 1);
});

if (!D.getSetting('seed_shift_v1', 0)) {
  const t = L.today(), SN = '张王李赵刘陈杨黄周吴徐孙马朱胡郭何林罗高', GN = ['晓东', '文静', '佳怡', '俊杰', '海燕', '雪梅', '志强', '婷婷', '建华', '秀英', '国庆', '丽娜', '振宇', '小燕', '春生', '美玲', '永刚', '玉兰', '德明', '红梅'];
  D.tx(() => {
    if (!q1("SELECT 1 FROM roles WHERE name='餐厅服务员'")) run("INSERT INTO roles(name,level,sort) VALUES('餐厅服务员','staff',0)");
    const rid = n => q1('SELECT id FROM roles WHERE name=?', n).id, waiter = rid('餐厅服务员'), guard = rid('保安'), scene = n => q1('SELECT id FROM scenes WHERE name=?', n)?.id || 1;
    q('SELECT id, region_id FROM stores ORDER BY id').forEach((st, i) => {
      const add = (role, k) => run('INSERT INTO users(name,role_id,region_id,store_id,phone) VALUES(?,?,?,?,?)', SN[(i * 7 + k) % SN.length] + GN[(i * 3 + k * 5) % GN.length], role, st.region_id, st.id, '139' + String(10000000 + st.id * 10 + k).slice(-8));
      if (!q1('SELECT 1 FROM users WHERE store_id=? AND role_id=? AND active=1', st.id, waiter)) add(waiter, 1);
      if (q1('SELECT COUNT(*) n FROM users WHERE store_id=? AND role_id=? AND active=1', st.id, guard).n < 2) add(guard, 2);
      for (let k = q1("SELECT COUNT(*) n FROM users u JOIN roles r ON r.id=u.role_id WHERE u.store_id=? AND u.active=1 AND r.name IN ('前台高级','前台中级','前台初级')", st.id).n; k < 3; k++) add(rid('前台初级'), 3 + k);
    });
    const tp = (role, sc, title, std, due, photo) => { if (!q1('SELECT 1 FROM templates WHERE role_id=? AND title=?', role, title)) run("INSERT INTO templates(scene_id,role_id,title,standard,due_time,freq,category,need_photo,active,src) VALUES(?,?,?,?,?,'daily','ops',?,1,'std')", scene(sc), role, title, std, due, photo); };
    tp(waiter, '餐厅', '早餐摆台及保温设备开启', '06:45 前完成摆台、餐具和保温设备开启，拍照留档', '06:45', 1);
    tp(waiter, '餐厅', '开餐迎宾及早餐台补餐', '07:00 准时开餐；高峰期每 15 分钟巡台补餐', '07:30', 0);
    tp(waiter, '餐厅', '收餐清洁及餐具消毒', '收餐后完成台面清洁和餐具消毒并记录', '10:00', 0);
    tp(guard, '外围', '夜间巡楼签到', '02:00 完成全楼层巡查，记录异常', '02:00', 1);
    tp(guard, '后场', '夜间情况交接记录', '下班前把夜间情况写入交接记录', '07:45', 0);
    const RT = { '09:00': '20:30', '09:30': '21:00', '10:00': '22:00', '16:00': '21:30' };
    for (const [a, b2] of Object.entries(RT)) run('UPDATE templates SET due_time=? WHERE role_id=? AND due_time=?', b2, guard, a);
    run("UPDATE instances SET due_time=(SELECT due_time FROM templates WHERE id=instances.src_id) WHERE src='tpl' AND status='pending' AND date>=? AND src_id IN (SELECT id FROM templates WHERE role_id=?)", t, guard);
    D.setSetting('seed_shift_v1', 1);
  });
  D.shiftReset();
  const sids = q('SELECT id FROM stores').map(s => s.id), last = sids.length > 50 ? L.addDays(t, 7) : (q1('SELECT MAX(date) m FROM instances').m || t);
  for (let d = t; d <= L.addDays(t, 7); d = L.addDays(d, 1)) D.ensureInstances(d, sids);
  for (const sid of sids) D.refreshPending(sid, t, last);
}

app.listen(PORT, () => console.log('LinkTask on :' + PORT));
