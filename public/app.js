'use strict';
const SESSION_URL = 'https://app.devin.ai/sessions/ef423417d69549f78979ff3c5854b08f';
const S = { me: null, meta: null, store: Number(localStorage.lt_store) || null };
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WD = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

async function api(path, body, method) {
  const opt = { method: method || (body ? 'POST' : 'GET'), headers: { 'x-user-id': localStorage.lt_uid || '' } };
  if (body) { opt.headers['content-type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch('/api' + path, opt);
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { localStorage.removeItem('lt_uid'); location.hash = '#/login'; throw new Error(j.error || '请选择身份'); }
  if (!r.ok) throw new Error(j.error || '请求失败');
  return j;
}
function toast(msg, isErr) {
  const d = document.createElement('div'); d.textContent = msg; if (isErr) d.className = 'e';
  $('#toast').appendChild(d); setTimeout(() => d.remove(), 2600);
}
async function act(fn, okMsg) {
  try { await fn(); if (okMsg) toast(okMsg); return true; } catch (e) { toast(e.message, true); return false; }
}

// ---------- modal ----------
function modal(title, html, onMount) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-bg"><div class="modal"><h1><span>${esc(title)}</span><span class="x" data-close>关闭</span></h1>${html}</div></div>`;
  const bg = root.firstChild;
  bg.addEventListener('click', e => { if (e.target === bg || e.target.hasAttribute('data-close')) closeModal(); });
  if (onMount) onMount(bg.querySelector('.modal'));
}
function closeModal() { $('#modal-root').innerHTML = ''; }
function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') o[el.name] = el.checked; else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; } else if (el.type !== 'file') o[el.name] = el.value;
  }
  return o;
}
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = reject; img.src = url;
  });
}
async function filePhoto(form) {
  const f = form.querySelector('input[type=file]');
  return f && f.files[0] ? compressImage(f.files[0]) : null;
}

// ---------- helpers ----------
const users = () => S.meta.users;
const userName = id => users().find(u => u.id === Number(id))?.name || '-';
const storeName = id => S.meta.stores.find(s => s.id === Number(id))?.name || '-';
const sceneName = id => S.meta.scenes.find(s => s.id === Number(id))?.name || '-';
const storeStaff = sid => users().filter(u => u.store_id === Number(sid) || (u.level === 'store_manager' && S.meta.managerStores[u.id]?.includes(Number(sid))));
function rank(u) {
  if (!u) return 9;
  if (u.level === 'store_manager') return 0;
  if (u.role_name === '店助') return 1;
  if (/经理/.test(u.role_name)) return 2;
  if (/高级/.test(u.role_name)) return 3;
  if (/初级/.test(u.role_name)) return 5;
  return 4;
}
function userOptions(sid, sel, opts = {}) {
  const list = storeStaff(sid);
  return (opts.blank ? `<option value="">${esc(opts.blank)}</option>` : '') +
    list.map(u => `<option value="${u.id}" ${Number(sel) === u.id ? 'selected' : ''}>${esc(u.name)} · ${esc(u.role_name)}</option>`).join('');
}
const sceneOptions = sel => S.meta.scenes.map(s => `<option value="${s.id}" ${Number(sel) === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
const storeOptions = sel => S.meta.stores.map(s => `<option value="${s.id}" ${Number(sel) === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
function rateBar(rate) {
  if (rate === null || rate === undefined) return '<span class="muted">-</span>';
  return `<div class="row" style="gap:6px;flex-wrap:nowrap"><div class="bar ${rate < 75 ? 'low' : rate < 85 ? 'mid' : ''}" style="flex:1"><i style="width:${rate}%"></i></div><span class="mono">${rate}%</span></div>`;
}
function statusTag(it) {
  if (it.status === 'done') {
    const late = it.done_at && it.done_at.slice(11, 16) > it.due_time;
    return `<span class="tag ok">已完成 ${esc((it.done_at || '').slice(11, 16))}</span>${late ? ' <span class="tag warn">迟交</span>' : ''}`;
  }
  return it.overdue ? '<span class="tag bad">超时未完成</span>' : '<span class="tag">待完成</span>';
}
function checkTag(it) {
  if (it.check_result === 'good') return '<span class="tag ok">抽查合格</span>';
  if (it.check_result === 'bad') return `<span class="tag bad">抽查不合格</span>${it.rect_status ? ` <span class="tag ${it.rect_status === 'closed' ? 'ok' : 'warn'}">整改${{ open: '中', submitted: '待复查', closed: '已闭环' }[it.rect_status]}</span>` : ''}`;
  return '';
}
const originTag = o => ({ flex: '<span class="tag acc">灵活</span>', focus: '<span class="tag warn">重点跟踪</span>' }[o] || '');
const freqText = (f, v) => f === 'weekly' ? '每' + WD[v] : f === 'monthly' ? `每月 ${v} 日` : f === 'once' ? '一次性' : '每日';
const rectStatus = r => r.status === 'closed' ? '<span class="tag ok">已闭环</span>' : r.status === 'submitted' ? '<span class="tag acc">待复查</span>' : r.late ? '<span class="tag bad">逾期未整改</span>' : '<span class="tag warn">整改中</span>';
function qs() { const i = location.hash.indexOf('?'); return new URLSearchParams(i >= 0 ? location.hash.slice(i + 1) : ''); }
function pickStore(sel) {
  const ids = S.meta.stores.map(s => s.id);
  if (sel && ids.includes(Number(sel))) S.store = Number(sel);
  if (!ids.includes(S.store)) S.store = ids[0];
  localStorage.lt_store = S.store;
  return S.store;
}
function storeSwitch(route, extra = '') {
  if (S.meta.stores.length < 2) return `<span class="tag">${esc(storeName(S.store))}</span>`;
  return `<select onchange="location.hash='${route}?store='+this.value+'${extra}'">${storeOptions(S.store)}</select>`;
}

// ---------- nav ----------
const NAV = {
  staff: [['my', '我的任务'], ['my-rect', '我的整改'], ['notices', '消息提醒']],
  store_manager: [['sec', '每日工作'], ['home', '工作台'], ['tasks', '任务看板与抽查'], ['rect', '整改闭环'], ['my', '我的任务'],
    ['sec', '分配'], ['assign', '场景分配'], ['leave', '休息与顶岗'], ['flex', '灵活任务'], ['sec', '监督'], ['focus', '重点跟踪'], ['issues', '问题预警'], ['team', '门店人员'], ['audit', '操作日志'], ['notices', '消息提醒']],
  ops_manager: [['dash', '区域运营看板'], ['issues', '问题门店'], ['tasks', '门店任务明细'], ['rect', '整改闭环'], ['focus', '重点跟踪'], ['patrol', '巡店记录'], ['notices', '消息提醒']],
  sales_manager: [['dash', '区域销售看板'], ['issues', '问题门店'], ['tasks', '门店销售任务'], ['rect', '整改闭环'], ['notices', '消息提醒']],
  region_manager: [['sec', '全局'], ['dash', '区域看板'], ['issues', '问题门店筛选'], ['patrol', '巡店计划'], ['focus', '重点跟踪'],
    ['sec', '门店'], ['tasks', '门店任务明细'], ['rect', '整改闭环'], ['assign', '场景分配'], ['leave', '休息与顶岗'], ['team', '门店人员'],
    ['sec', '配置'], ['settings', '岗位 / 场景 / 工作清单'], ['audit', '操作日志'], ['notices', '消息提醒']],
};
const HOME = { staff: 'my', store_manager: 'home', ops_manager: 'dash', sales_manager: 'dash', region_manager: 'dash' };

function shell(route, html) {
  const nav = NAV[S.me.level].map(([k, l]) => k === 'sec' ? `<div class="sec">${l}</div>` : `<a href="#/${k}" class="${route === k ? 'on' : ''}">${l}</a>`).join('');
  $('#app').innerHTML = `
  <div class="top">
    <div class="brand"><img src="/icon.svg" alt="">职链 <span class="muted" style="font-weight:400">LinkTask</span></div>
    <div class="grow"></div>
    <a class="bell" href="#/notices" title="消息提醒">消息${S.me.unread ? `<b>${S.me.unread}</b>` : ''}</a>
    <div class="who"><span>${esc(S.me.name)}</span><span class="tag rn">${esc(S.me.role_name)}</span><a class="btn sm" href="#/login">切换身份</a></div>
  </div>
  <div class="layout"><nav class="nav">${nav}</nav><div class="content"><main class="main" id="main">${html}</main>
  <div class="foot">演示模式 · 数据为模拟数据 · <a href="${SESSION_URL}" target="_blank" rel="noopener">需要修改？提交需求</a></div></div></div>`;
}

// ---------- router ----------
const VIEWS = {};
async function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path] = h.split('?');
  const [name, arg] = path.split('/');
  if (name === 'login' || !localStorage.lt_uid) return renderLogin();
  try {
    S.me = await api('/me');
    if (!S.meta || S.meta.uid !== S.me.id) await loadMeta();
  } catch (e) { return renderLogin(); }
  const allowed = VIEWS[name] && (NAV[S.me.level].some(([k]) => k === name) || (name === 'patrol' && S.me.level !== 'staff'));
  if (!allowed) { location.hash = '#/' + HOME[S.me.level]; return; }
  const v = name;
  shell(v, '<div class="empty">加载中…</div>');
  try { await VIEWS[v](arg); } catch (e) { $('#main').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
async function loadMeta() {
  S.meta = await api('/meta');
  S.meta.uid = S.me.id;
  const all = await (await fetch('/api/users')).json();
  S.meta.managerStores = {};
  for (const u of all) if (u.level === 'store_manager') S.meta.managerStores[u.id] = S.meta.stores.filter(s => u.stores.includes(s.name)).map(s => s.id);
  pickStore();
}
async function refresh() { S.me = await api('/me'); await route(); }
window.addEventListener('hashchange', route);

// ---------- login ----------
async function renderLogin() {
  const list = await (await fetch('/api/users')).json();
  const groups = [['region_manager', '区域管理'], ['ops_manager', ''], ['sales_manager', ''], ['store_manager', '门店店长'], ['staff', '门店员工']];
  const stores = [...new Set(list.filter(u => u.level === 'staff').map(u => u.stores[0]))];
  const card = u => `<button class="card u" data-uid="${u.id}"><div class="row between"><b>${esc(u.name)}</b><span class="tag">${esc(u.role_name)}</span></div><div class="muted small">${esc(u.stores.join('、'))}</div></button>`;
  const lead = list.filter(u => ['region_manager', 'ops_manager', 'sales_manager'].includes(u.level));
  $('#app').innerHTML = `<div class="login">
    <div class="brand" style="font-size:20px;margin-bottom:4px"><img src="/icon.svg" alt="" style="width:28px;height:28px">职链 LinkTask</div>
    <p class="muted" style="margin-top:0">门店运营任务分发与闭环管理 · 演示模式：选择一个身份进入，可随时切换，查看不同角色的视角。</p>
    <h2>区域管理</h2><div class="grid g4">${lead.map(card).join('')}</div>
    <h2>门店店长</h2><div class="grid g4">${list.filter(u => u.level === 'store_manager').map(card).join('')}</div>
    ${stores.map(s => `<h2>${esc(s)} · 员工</h2><div class="grid g4">${list.filter(u => u.level === 'staff' && u.stores[0] === s).map(card).join('')}</div>`).join('')}
    <div class="foot" style="padding-left:0"><a href="${SESSION_URL}" target="_blank" rel="noopener">需要修改？提交需求</a></div>
  </div>`;
  document.querySelectorAll('[data-uid]').forEach(b => b.onclick = () => {
    localStorage.lt_uid = b.dataset.uid; S.meta = null; localStorage.removeItem('lt_store');
    const lvl = list.find(u => u.id === Number(b.dataset.uid)).level;
    location.hash = '#/' + HOME[lvl]; route();
  });
}

// ---------- notices ----------
VIEWS.notices = async () => {
  const list = await api('/notifications');
  const kindTag = { remind: '定时提醒', escalate: '<span class="tag bad">超时升级</span>', praise: '<span class="tag ok">肯定</span>', rectify: '<span class="tag warn">整改</span>',
    assign: '<span class="tag acc">分配</span>', cover: '<span class="tag acc">顶岗</span>', focus: '<span class="tag warn">重点跟踪</span>', patrol: '<span class="tag acc">巡店</span>', system: '系统' };
  const canRun = S.me.can.manage;
  $('#main').innerHTML = `<div class="row between"><h1>消息提醒</h1><div class="row">
    ${canRun ? '<button class="btn" id="run">立即发送一次定时提醒</button>' : ''}<button class="btn" id="readall">全部标为已读</button></div></div>
    <p class="muted small" style="margin-top:-6px">每天 ${esc(S.meta.settings.reminder_times.join('、'))} 自动提醒当事人未完成的任务，同时把门店完成情况推送给店长；超过截止时间 ${S.meta.settings.escalate_minutes} 分钟未完成会升级提醒店长，整改逾期会升级给区域经理和运营经理。</p>
    <div class="list">${list.length ? list.map(n => `<div class="notice ${n.read ? '' : 'unread'}"><div class="row between"><b>${esc(n.title)}</b><span class="muted small mono">${esc(n.created_at)}</span></div>
      <div class="small">${kindTag[n.kind] || ''} ${esc(n.body)} ${n.link ? `<a href="${esc(n.link)}">查看</a>` : ''}</div></div>`).join('') : '<div class="empty">暂无消息</div>'}</div>`;
  $('#readall').onclick = () => act(async () => { await api('/notifications/read', {}); await refresh(); });
  if (canRun) $('#run').onclick = () => act(async () => { const r = await api('/reminders/run', {}); toast(`已发送 ${r.sent} 条提醒`); await refresh(); });
};

// ---------- my tasks (staff + anyone) ----------
VIEWS.my = async () => {
  const p = qs();
  const date = p.get('date') || S.me.today;
  const list = await api('/my/tasks?date=' + date);
  const done = list.filter(t => t.status === 'done').length;
  const od = list.filter(t => t.overdue).length;
  const rects = (await api('/rectifications?mine=1')).filter(r => r.status !== 'closed');
  const byScene = {};
  for (const t of list) (byScene[t.scene_name || '其他'] ||= []).push(t);
  $('#main').innerHTML = `<div class="row between"><h1>我的任务</h1><input type="date" value="${date}" onchange="location.hash='#/my?date='+this.value"></div>
  <div class="grid g4" style="margin-bottom:14px">
    <div class="card kpi"><div class="l">今日任务</div><div class="v">${list.length}</div></div>
    <div class="card kpi"><div class="l">已完成</div><div class="v">${done}</div></div>
    <div class="card kpi"><div class="l">超时未完成</div><div class="v" style="color:${od ? 'var(--bad)' : 'inherit'}">${od}</div></div>
    <div class="card kpi"><div class="l">待整改</div><div class="v"><a href="#/my-rect">${rects.length}</a></div></div>
  </div>
  ${list.length ? Object.entries(byScene).map(([sc, ts]) => `<div class="list" style="margin-bottom:12px"><div class="hd">${esc(sc)}<span class="muted small" style="font-weight:400">${ts.filter(t => t.status === 'done').length}/${ts.length}</span></div>
    ${ts.map(t => `<div class="task ${t.status === 'done' ? 'done' : ''}"><div class="t">${esc(t.due_time)}</div><div class="b">
      <div class="ttl">${esc(t.title)} ${originTag(t.origin)} ${t.covered ? `<span class="tag acc">顶岗 · 替 ${esc(t.orig_name)}</span>` : ''} ${t.need_photo ? '<span class="tag">需拍照</span>' : ''}</div>
      <div class="muted small">${esc(t.standard)}</div>
      <div class="row small" style="margin-top:4px">${statusTag(t)} ${checkTag(t)} ${t.check_comment ? `<span class="muted">店长：${esc(t.check_comment)}</span>` : ''}</div></div>
      <div>${t.status === 'done' ? (t.check_result ? '' : `<button class="btn sm" data-undo="${t.id}">撤回</button>`) : `<button class="btn primary sm" data-done="${t.id}">完成</button>`}</div></div>`).join('')}</div>`).join('')
    : '<div class="list"><div class="empty">今天没有分配给你的任务</div></div>'}`;
  document.querySelectorAll('[data-done]').forEach(b => b.onclick = () => completeModal(list.find(t => t.id === Number(b.dataset.done))));
  document.querySelectorAll('[data-undo]').forEach(b => b.onclick = () => act(async () => { await api(`/instances/${b.dataset.undo}/undo`, {}); route(); }, '已撤回'));
};
function completeModal(t, after) {
  modal('完成任务', `<div class="kv"><div>任务</div><div>${esc(t.title)}</div><div>标准</div><div>${esc(t.standard || '-')}</div><div>截止</div><div class="mono">${esc(t.date)} ${esc(t.due_time)}</div></div>
    <form id="f"><label class="f"><span>完成说明（可选）</span><textarea name="note" placeholder="例如：已补齐 3 个品种"></textarea></label>
    <label class="f"><span>现场照片${t.need_photo ? '（必传）' : '（可选）'}</span><input type="file" accept="image/*" capture="environment" ${t.need_photo ? 'required' : ''}></label>
    <div class="row"><span class="sp"></span><button class="btn" type="button" data-close>取消</button><button class="btn primary">确认完成</button></div></form>`, m => {
    m.querySelector('#f').onsubmit = async e => {
      e.preventDefault();
      const f = e.target; f.querySelector('.primary').disabled = true;
      const ok = await act(async () => api(`/instances/${t.id}/complete`, { note: f.note.value, photo: await filePhoto(f) }), '已完成');
      f.querySelector('.primary').disabled = false;
      if (ok) { closeModal(); after ? after() : route(); }
    };
  });
}

// ---------- my rectifications ----------
VIEWS['my-rect'] = async () => {
  const list = await api('/rectifications?mine=1');
  $('#main').innerHTML = `<h1>我的整改</h1><p class="muted small" style="margin-top:-6px">店长抽查不合格的工作会生成整改任务：先看原因和培训要求，按期整改后提交，由店长复查。复查通过才算闭环。</p>
    ${rectCards(list, { mine: true })}`;
  bindRect(list);
};
function rectCards(list, o = {}) {
  if (!list.length) return '<div class="list"><div class="empty">没有整改记录</div></div>';
  return `<div class="grid g2">${list.map(r => `<div class="card">
    <div class="row between"><b>${esc(r.title || '整改')}</b>${rectStatus(r)}</div>
    <div class="muted small">${esc(r.store_name)} · ${esc(r.scene_name || '')} · 来源任务日期 ${esc(r.inst_date || '')}</div>
    <div class="kv" style="margin-top:8px"><div>不合格原因</div><div>${esc(r.reason)}</div><div>培训</div><div>${esc(r.training || '-')}</div>
      <div>整改任务</div><div>${esc(r.task)}</div><div>整改截止</div><div class="mono ${r.late ? '' : ''}" style="${r.late ? 'color:var(--bad)' : ''}">${esc(r.deadline)}</div>
      <div>责任人</div><div>${esc(r.assignee_name)}</div><div>下发人</div><div>${esc(r.creator_name)} <span class="muted small">${esc(r.created_at)}</span></div></div>
    ${r.submit_note ? `<div class="note"><b>整改反馈</b> <span class="muted small">${esc(r.submitted_at)}</span><br>${esc(r.submit_note)}${r.submit_photo ? `<img class="photo" src="${esc(r.submit_photo)}" alt="整改照片">` : ''}</div>` : ''}
    ${r.verify_comment ? `<div class="note"><b>复查意见</b>（${esc(r.verifier_name)}）：${esc(r.verify_comment)}</div>` : ''}
    <div class="row" style="margin-top:10px"><span class="sp"></span>
      ${r.status === 'open' && (o.mine || S.me.id === r.assignee_id) ? `<button class="btn primary sm" data-rsub="${r.id}">提交整改</button>` : ''}
      ${r.status === 'submitted' && S.me.can.manage ? `<button class="btn danger sm" data-rno="${r.id}">不通过</button><button class="btn primary sm" data-rok="${r.id}">复查通过，闭环</button>` : ''}
      ${r.status === 'open' && S.me.can.manage && !o.mine ? `<button class="btn sm" data-rok="${r.id}">现场复查通过</button>` : ''}
    </div></div>`).join('')}</div>`;
}
function bindRect(list) {
  document.querySelectorAll('[data-rsub]').forEach(b => b.onclick = () => {
    const r = list.find(x => x.id === Number(b.dataset.rsub));
    modal('提交整改', `<div class="kv"><div>整改任务</div><div>${esc(r.task)}</div><div>截止</div><div>${esc(r.deadline)}</div></div>
      <form id="f"><label class="f"><span>整改情况</span><textarea name="note" required></textarea></label>
      <label class="f"><span>整改照片（可选）</span><input type="file" accept="image/*" capture="environment"></label>
      <div class="row"><span class="sp"></span><button class="btn primary">提交</button></div></form>`, m => {
      m.querySelector('#f').onsubmit = async e => {
        e.preventDefault();
        if (await act(async () => api(`/rectifications/${r.id}/submit`, { note: e.target.note.value, photo: await filePhoto(e.target) }), '已提交，等待店长复查')) { closeModal(); route(); }
      };
    });
  });
  document.querySelectorAll('[data-rok]').forEach(b => b.onclick = () => modal('复查通过', `<form id="f"><label class="f"><span>复查意见</span><textarea name="comment">复查合格</textarea></label>
    <div class="row"><span class="sp"></span><button class="btn primary">确认闭环</button></div></form>`, m => {
    m.querySelector('#f').onsubmit = async e => { e.preventDefault(); if (await act(() => api(`/rectifications/${b.dataset.rok}/verify`, { pass: true, comment: e.target.comment.value }), '整改已闭环')) { closeModal(); route(); } };
  }));
  document.querySelectorAll('[data-rno]').forEach(b => b.onclick = () => modal('复查不通过', `<form id="f"><label class="f"><span>不通过原因</span><textarea name="comment" required></textarea></label>
    <label class="f"><span>新的整改截止日期</span><input type="date" name="deadline" required value="${addDays(S.me.today, 2)}"></label>
    <div class="row"><span class="sp"></span><button class="btn danger">退回重新整改</button></div></form>`, m => {
    m.querySelector('#f').onsubmit = async e => { e.preventDefault(); const d = formData(e.target); if (await act(() => api(`/rectifications/${b.dataset.rno}/verify`, { pass: false, ...d }), '已退回')) { closeModal(); route(); } };
  }));
}
function addDays(d, n) { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }

// ---------- tasks board ----------
VIEWS.tasks = async () => {
  const p = qs();
  const sid = pickStore(p.get('store'));
  const date = p.get('date') || S.me.today;
  const scene = p.get('scene') || '';
  const st = p.get('st') || '';
  const all = await api(`/tasks?store=${sid}&date=${date}`);
  const filt = {
    '': () => true, pending: t => t.status === 'pending' && !t.overdue, overdue: t => t.overdue, done: t => t.status === 'done',
    unchecked: t => t.status === 'done' && !t.check_result, bad: t => t.check_result === 'bad', cover: t => t.covered,
  };
  const list = all.filter(t => (!scene || t.scene_id === Number(scene)) && filt[st](t));
  const link = (k, v) => { const q = new URLSearchParams({ store: sid, date, scene, st }); q.set(k, v); return '#/tasks?' + q; };
  const cnt = k => all.filter(filt[k]).length;
  const canCheck = S.me.can.manage;
  const byScene = {};
  for (const t of list) (byScene[t.scene_name || '其他'] ||= []).push(t);
  const title = { ops_manager: '门店任务明细（运营）', sales_manager: '门店销售任务', region_manager: '门店任务明细' }[S.me.level] || '任务看板与抽查';
  $('#main').innerHTML = `<div class="row between"><h1>${title}</h1><div class="row">${storeSwitch('#/tasks', '&date=' + date)}<input type="date" value="${date}" onchange="location.hash='${link('date', '')}'.replace('date=','date='+this.value)"></div></div>
  <div class="tabs"><a href="${link('scene', '')}" class="${!scene ? 'on' : ''}">全部场景</a>${S.meta.scenes.map(s => `<a href="${link('scene', s.id)}" class="${Number(scene) === s.id ? 'on' : ''}">${esc(s.name)}</a>`).join('')}</div>
  <div class="tabs">${[['', '全部'], ['pending', '待完成'], ['overdue', '超时'], ['done', '已完成'], ['unchecked', '待抽查'], ['bad', '不合格'], ['cover', '顶岗']]
    .map(([k, l]) => `<a href="${link('st', k)}" class="${st === k ? 'on' : ''}">${l} <span class="muted">${cnt(k)}</span></a>`).join('')}</div>
  ${list.length ? Object.entries(byScene).map(([sc, ts]) => `<div class="list" style="margin-bottom:12px"><div class="hd">${esc(sc)}</div>
    ${ts.map(t => `<div class="task ${t.status === 'done' ? 'done' : ''}"><div class="t">${esc(t.due_time)}</div><div class="b">
      <div class="ttl">${esc(t.title)} ${originTag(t.origin)} ${t.category === 'sales' ? '<span class="tag">销售</span>' : ''}</div>
      <div class="row small" style="margin-top:2px"><span>${esc(t.assignee_name || '未分配')} <span class="muted">${esc(t.assignee_role || '')}</span></span>
        ${t.covered ? `<span class="tag acc">顶岗 · 原 ${esc(t.orig_name)}</span>` : ''} ${statusTag(t)} ${checkTag(t)} ${t.photo ? '<span class="tag">有照片</span>' : ''}</div></div>
      <div class="row">${canCheck && t.status === 'done' && !t.check_result ? `<button class="btn primary sm" data-chk="${t.id}">抽查</button>` : ''}<button class="btn sm" data-view="${t.id}">详情</button></div></div>`).join('')}</div>`).join('')
    : '<div class="list"><div class="empty">没有符合条件的任务</div></div>'}`;
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => taskDetail(Number(b.dataset.view)));
  document.querySelectorAll('[data-chk]').forEach(b => b.onclick = () => checkModal(all.find(t => t.id === Number(b.dataset.chk))));
};
async function taskDetail(id) {
  const t = await api('/instances/' + id);
  const manage = S.me.can.manage;
  modal(t.title, `<div class="kv">
    <div>门店 / 场景</div><div>${esc(t.store_name)} · ${esc(t.scene_name)}</div>
    <div>标准</div><div>${esc(t.standard || '-')}</div>
    <div>截止</div><div class="mono">${esc(t.date)} ${esc(t.due_time)}</div>
    <div>执行人</div><div>${esc(t.assignee_name)} ${t.covered ? `<span class="tag acc">顶岗 · 原 ${esc(t.orig_name)}</span>` : ''}</div>
    <div>状态</div><div>${statusTag(t)} ${checkTag(t)}</div>
    ${t.done_note ? `<div>完成说明</div><div>${esc(t.done_note)}</div>` : ''}
    ${t.check_result ? `<div>抽查</div><div>${esc(t.checker_name)}：${esc(t.check_comment)} <span class="muted small">${esc(t.checked_at)}</span></div>` : ''}
  </div>${t.photo ? `<img class="photo" src="${esc(t.photo)}" alt="现场照片">` : ''}
  ${t.rects.map(r => `<div class="note"><b>整改</b> ${rectStatus(r)}：${esc(r.task)}（截止 ${esc(r.deadline)}，责任人 ${esc(r.assignee_name)}）${r.submit_note ? '<br>反馈：' + esc(r.submit_note) : ''}</div>`).join('')}
  ${manage ? `<h2>店长操作</h2><div class="row">
    ${t.status === 'pending' ? `<select id="re">${userOptions(t.store_id, t.assignee_id)}</select><button class="btn sm" id="reb">临时改派</button><button class="btn sm" id="cmp">代为完成</button>` : ''}
    ${t.status === 'done' && !t.check_result ? '<button class="btn primary sm" id="chk">抽查</button>' : ''}</div>` : ''}`, m => {
    const reb = m.querySelector('#reb');
    if (reb) reb.onclick = () => act(async () => { await api(`/instances/${t.id}/reassign`, { user_id: m.querySelector('#re').value }); closeModal(); route(); }, '已改派');
    const cmp = m.querySelector('#cmp'); if (cmp) cmp.onclick = () => completeModal(t);
    const chk = m.querySelector('#chk'); if (chk) chk.onclick = () => checkModal(t);
  });
}
function checkModal(t) {
  modal('抽查：' + t.title, `<div class="kv"><div>执行人</div><div>${esc(t.assignee_name)}</div><div>完成时间</div><div class="mono">${esc(t.done_at || '-')}</div>
    <div>标准</div><div>${esc(t.standard || '-')}</div>${t.done_note ? `<div>完成说明</div><div>${esc(t.done_note)}</div>` : ''}</div>
    ${t.photo ? `<img class="photo" src="${esc(t.photo)}" alt="现场照片">` : ''}
    <form id="f" style="margin-top:12px">
      <div class="row" style="margin-bottom:10px"><label><input type="radio" name="result" value="good" checked> 合格，给予肯定</label><label><input type="radio" name="result" value="bad"> 不合格，下发整改</label></div>
      <label class="f"><span id="cl">肯定的话</span><textarea name="comment">执行到位，继续保持</textarea></label>
      <div id="rx" style="display:none">
        <label class="f"><span>培训内容</span><textarea name="training" placeholder="例如：现场复训补餐标准，演示 15 分钟巡检节奏"></textarea></label>
        <label class="f"><span>整改任务</span><textarea name="task" placeholder="例如：明日 8:00 前重新执行并拍照上传"></textarea></label>
        <div class="form2"><label class="f"><span>整改截止日期</span><input type="date" name="deadline" value="${addDays(S.me.today, 1)}"></label>
        <label class="f"><span>整改责任人</span><select name="assignee_id">${userOptions(t.store_id, t.assignee_id)}</select></label></div>
      </div>
      <div class="row"><span class="sp"></span><button class="btn primary">提交抽查结果</button></div></form>`, m => {
    const f = m.querySelector('#f');
    f.querySelectorAll('[name=result]').forEach(r => r.onchange = () => {
      const bad = f.result.value === 'bad';
      m.querySelector('#rx').style.display = bad ? '' : 'none';
      m.querySelector('#cl').textContent = bad ? '不合格原因（必填）' : '肯定的话';
      f.comment.value = bad ? '' : '执行到位，继续保持';
    });
    f.onsubmit = async e => {
      e.preventDefault();
      const d = formData(f);
      const body = { result: d.result, comment: d.comment };
      if (d.result === 'bad') body.rectify = { training: d.training, task: d.task, deadline: d.deadline, assignee_id: d.assignee_id };
      if (await act(() => api(`/instances/${t.id}/check`, body), d.result === 'good' ? '已给予肯定' : '已下发整改')) { closeModal(); route(); }
    };
  });
}

// ---------- store manager home ----------
VIEWS.home = async () => {
  const d = await api('/dashboard?days=7');
  const rects = await api('/rectifications');
  const leaves = (await api('/leaves?from=' + S.me.today)).filter(l => l.date === S.me.today);
  const todayTasks = [];
  for (const s of S.meta.stores) todayTasks.push(...await api(`/tasks?store=${s.id}&date=${S.me.today}`));
  const unchecked = todayTasks.filter(t => t.status === 'done' && !t.check_result);
  const overdue = todayTasks.filter(t => t.overdue);
  const toVerify = rects.filter(r => r.status === 'submitted');
  const lateRect = rects.filter(r => r.late);
  const sample = unchecked.slice().sort(() => Math.random() - 0.5).slice(0, 5);
  $('#main').innerHTML = `<h1>工作台 <span class="muted small" style="font-weight:400">${esc(S.me.today)} · 现在 ${esc(S.me.now)}</span></h1>
  <div class="grid g3">${d.today.map(s => `<div class="card"><div class="row between"><b>${esc(s.name)}</b><a class="small" href="#/tasks?store=${s.id}">任务看板</a></div>
    <div style="margin:8px 0">${rateBar(s.rate)}</div>
    <div class="row small"><span>今日 ${s.done}/${s.total}</span><span class="tag ${s.overdue ? 'bad' : ''}">超时 ${s.overdue}</span><span class="tag">已抽查 ${s.checked}</span><span class="tag ${s.rect_late ? 'bad' : ''}">整改未闭环 ${s.rect_open}</span></div>
    <div class="muted small" style="margin-top:6px">近 7 日完成率 ${d.period.find(x => x.id === s.id)?.rate ?? '-'}% · 抽查合格率 ${d.period.find(x => x.id === s.id)?.pass_rate ?? '-'}%</div></div>`).join('')}</div>
  <div class="grid g2" style="margin-top:12px">
    <div class="list"><div class="hd">随机抽查建议 <span class="muted small" style="font-weight:400">从今日已完成、未抽查的 ${unchecked.length} 项中随机选取</span><span class="sp"></span><a class="small" href="#/home">换一批</a></div>
      ${sample.length ? sample.map(t => `<div class="task"><div class="t">${esc(t.due_time)}</div><div class="b"><div class="ttl">${esc(t.title)}</div><div class="muted small">${esc(t.store_name)} · ${esc(t.scene_name)} · ${esc(t.assignee_name)}</div></div><button class="btn primary sm" data-chk="${t.id}">抽查</button></div>`).join('') : '<div class="empty">暂无待抽查任务</div>'}</div>
    <div class="list"><div class="hd">超时未完成 <span class="tag ${overdue.length ? 'bad' : ''}">${overdue.length}</span></div>
      ${overdue.length ? overdue.slice(0, 8).map(t => `<div class="task"><div class="t">${esc(t.due_time)}</div><div class="b"><div class="ttl">${esc(t.title)}</div><div class="muted small">${esc(t.store_name)} · ${esc(t.assignee_name)}</div></div><button class="btn sm" data-view="${t.id}">处理</button></div>`).join('') + (overdue.length > 8 ? `<div class="task"><a href="#/tasks?st=overdue">查看全部 ${overdue.length} 项</a></div>` : '') : '<div class="empty">没有超时任务</div>'}</div>
    <div class="list"><div class="hd">整改待复查 <span class="tag acc">${toVerify.length}</span> · 逾期 <span class="tag ${lateRect.length ? 'bad' : ''}">${lateRect.length}</span><span class="sp"></span><a class="small" href="#/rect">整改闭环</a></div>
      ${[...toVerify, ...lateRect].slice(0, 6).map(r => `<div class="task"><div class="b"><div class="ttl">${esc(r.title)}</div><div class="muted small">${esc(r.store_name)} · ${esc(r.assignee_name)} · 截止 ${esc(r.deadline)}</div></div>${rectStatus(r)}</div>`).join('') || '<div class="empty">没有待处理整改</div>'}</div>
    <div class="list"><div class="hd">今日休息与顶岗<span class="sp"></span><a class="small" href="#/leave">登记休息</a></div>
      ${leaves.map(l => `<div class="task"><div class="b"><div class="ttl">${esc(l.name)} <span class="muted small">${esc(l.role_name)}</span> 休息</div><div class="muted small">${esc(storeName(l.store_id))} · ${esc(l.note || '')} · 由 ${esc(l.cover_name || '店长')} 承接</div></div></div>`).join('') || '<div class="empty">今天没有人休息</div>'}</div>
  </div>`;
  document.querySelectorAll('[data-chk]').forEach(b => b.onclick = () => checkModal(todayTasks.find(t => t.id === Number(b.dataset.chk))));
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => taskDetail(Number(b.dataset.view)));
};

// ---------- scene assignment ----------
VIEWS.assign = async () => {
  const sid = pickStore(qs().get('store'));
  const d = await api(`/stores/${sid}/assign`);
  const manage = S.me.can.manage;
  $('#main').innerHTML = `<div class="row between"><h1>场景分配</h1>${storeSwitch('#/assign')}</div>
  <p class="muted small" style="margin-top:-6px">固定运营工作按场景归类。店长为每个场景指定负责人，也可以把单项工作指给具体的人；没有单独指定的，按岗位默认分配给对应的人。调整后从今天起未完成的任务立即生效，执行人会收到通知。</p>
  ${S.meta.scenes.map(sc => {
    const own = d.owners.find(o => o.scene_id === sc.id);
    const tpls = d.templates.filter(t => t.scene_id === sc.id);
    return `<div class="list" style="margin-bottom:12px"><div class="hd">${esc(sc.name)}<span class="sp"></span>
      <span class="small muted" style="font-weight:400">场景负责人</span><select data-owner="${sc.id}" ${manage ? '' : 'disabled'}>${userOptions(sid, own?.user_id, { blank: '未指定' })}</select>
      ${manage ? `<button class="btn sm" data-apply="${sc.id}">整个场景交给负责人</button>` : ''}</div>
      ${tpls.length ? `<div class="tbl" style="border:0;border-radius:0"><table><tr><th>时间</th><th>工作内容</th><th>频次</th><th>默认岗位</th><th>执行人</th></tr>
      ${tpls.map(t => `<tr><td class="mono">${esc(t.due_time)}</td><td>${esc(t.title)} ${t.category === 'sales' ? '<span class="tag">销售</span>' : ''} ${t.need_photo ? '<span class="tag">需拍照</span>' : ''}<div class="muted small">${esc(t.standard)}</div></td>
        <td>${freqText(t.freq, t.freq_val)}</td><td>${esc(t.role_name)}</td>
        <td><select data-tpl="${t.id}" ${manage ? '' : 'disabled'}>${userOptions(sid, t.explicit ? t.user_id : '', { blank: '按岗位默认（' + (t.user_name || '无') + '）' })}</select></td></tr>`).join('')}</table></div>` : '<div class="empty">该场景暂无固定工作</div>'}</div>`;
  }).join('')}`;
  document.querySelectorAll('[data-tpl]').forEach(s => s.onchange = () => act(async () => { await api(`/stores/${sid}/assign`, { template_id: Number(s.dataset.tpl), user_id: Number(s.value) || null }, 'PUT'); route(); }, '分配已更新'));
  document.querySelectorAll('[data-owner]').forEach(s => s.onchange = () => act(() => api(`/stores/${sid}/assign`, { scene_id: Number(s.dataset.owner), owner_id: Number(s.value) || null }, 'PUT'), '场景负责人已更新'));
  document.querySelectorAll('[data-apply]').forEach(b => b.onclick = () => {
    const sel = document.querySelector(`[data-owner="${b.dataset.apply}"]`);
    if (!sel.value) return toast('请先选择场景负责人', true);
    if (!confirm('把该场景所有固定工作都分配给 ' + userName(sel.value) + '？')) return;
    act(async () => { await api(`/stores/${sid}/assign`, { scene_id: Number(b.dataset.apply), owner_id: Number(sel.value), apply_scene: true }, 'PUT'); route(); }, '已整体分配');
  });
};

// ---------- leave & cover ----------
VIEWS.leave = async () => {
  const sid = pickStore(qs().get('store'));
  const list = (await api('/leaves?from=' + addDays(S.me.today, -14))).filter(l => l.store_id === sid);
  const staff = storeStaff(sid).filter(u => u.level === 'staff');
  const dir = (a, b) => { const ra = rank(users().find(u => u.id === a)), rb = rank(users().find(u => u.id === b)); return rb < ra ? '<span class="tag warn">向上承接</span>' : rb > ra ? '<span class="tag acc">向下承接</span>' : '<span class="tag">平级承接</span>'; };
  $('#main').innerHTML = `<div class="row between"><h1>休息与顶岗</h1>${storeSwitch('#/leave')}</div>
  <p class="muted small" style="margin-top:-6px">员工休息时，他当天的全部任务自动转给承接人。可以向上（店长、店助、经理）、平级或向下承接；不选承接人默认由店长承接。</p>
  <div class="card" style="margin-bottom:14px"><form id="f"><div class="form2">
    <label class="f"><span>休息人员</span><select name="user_id" id="lu">${staff.map(u => `<option value="${u.id}">${esc(u.name)} · ${esc(u.role_name)}</option>`).join('')}</select></label>
    <label class="f"><span>承接人</span><select name="cover_user_id" id="lc"></select></label>
    <label class="f"><span>开始日期</span><input type="date" name="date" value="${S.me.today}"></label>
    <label class="f"><span>天数</span><input type="number" name="days" value="1" min="1" max="31"></label>
    <label class="f"><span>备注</span><input name="note" placeholder="轮休 / 病假 / 事假"></label></div>
    <div class="row"><span id="ld" class="small"></span><span class="sp"></span><button class="btn primary">登记休息并转交任务</button></div></form></div>
  <div class="tbl"><table><tr><th>日期</th><th>休息人员</th><th>承接人</th><th>方式</th><th>备注</th><th></th></tr>
  ${list.map(l => `<tr><td class="mono">${esc(l.date)}</td><td>${esc(l.name)} <span class="muted small">${esc(l.role_name)}</span></td><td>${esc(l.cover_name || '店长')} <span class="muted small">${esc(l.cover_role || '')}</span></td>
    <td>${dir(l.user_id, l.cover_user_id || storeStaff(sid).find(u => u.level === 'store_manager')?.id)}</td><td>${esc(l.note)}</td><td>${l.date >= S.me.today ? `<button class="btn sm danger" data-del="${l.id}">取消</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">近期没有休息记录</td></tr>'}</table></div>`;
  const lu = $('#lu'), lc = $('#lc');
  const fill = () => {
    const me = Number(lu.value);
    const opts = storeStaff(sid).filter(u => u.id !== me).sort((a, b) => rank(a) - rank(b));
    const self = users().find(u => u.id === me);
    lc.innerHTML = '<option value="">店长承接</option>' + opts.map(u => `<option value="${u.id}">${rank(u) < rank(self) ? '↑' : rank(u) > rank(self) ? '↓' : '→'} ${esc(u.name)} · ${esc(u.role_name)}</option>`).join('');
    const same = opts.find(u => u.role_name.replace(/初级|中级|高级|经理/, '') === self.role_name.replace(/初级|中级|高级|经理/, '') && u.id !== me);
    if (same) lc.value = same.id;
  };
  lu.onchange = fill; fill();
  $('#f').onsubmit = async e => { e.preventDefault(); if (await act(() => api('/leaves', formData(e.target)), '已登记，任务已转交承接人')) route(); };
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = () => act(async () => { await api('/leaves/' + b.dataset.del, null, 'DELETE'); route(); }, '已取消，任务已归还'));
};

// ---------- flex / focus tasks ----------
function flexForm(o = {}) {
  const sid = o.store_id || S.store;
  return `<form id="ff"><div class="form2">
    ${o.focus || S.meta.stores.length > 1 ? `<label class="f"><span>门店</span><select name="store_id" id="fs">${storeOptions(sid)}</select></label>` : `<input type="hidden" name="store_id" value="${sid}">`}
    <label class="f"><span>场景</span><select name="scene_id">${sceneOptions(o.scene_id)}</select></label></div>
    <label class="f"><span>任务名称</span><input name="title" required value="${esc(o.title || '')}" placeholder="${o.focus ? '例如：每日 9:00 早餐不断档检查' : '例如：周五团队房预排'}"></label>
    <label class="f"><span>完成标准</span><textarea name="standard" placeholder="写清楚怎样算完成">${esc(o.standard || '')}</textarea></label>
    <div class="form2"><label class="f"><span>执行人</span><select name="assignee_id" id="fa">${userOptions(sid, o.assignee_id)}</select></label>
    <label class="f"><span>完成时间</span><input type="time" name="due_time" value="${o.due_time || '09:00'}" required></label>
    <label class="f"><span>周期</span><select name="recur" id="fr"><option value="once">一次性</option><option value="daily" ${o.focus ? 'selected' : ''}>每日</option><option value="weekly">每周</option><option value="monthly">每月</option></select></label>
    <label class="f" id="frv" style="display:none"><span>周几 / 几号</span><input type="number" name="recur_val" min="1" max="31" value="1"></label>
    <label class="f"><span>开始日期</span><input type="date" name="start_date" value="${S.me.today}"></label>
    <label class="f" id="fe"><span>结束日期（可选）</span><input type="date" name="end_date" value="${o.focus ? addDays(S.me.today, 29) : ''}"></label></div>
    <label class="f"><input type="checkbox" name="need_photo" ${o.focus ? 'checked' : ''}> 需要拍照留证</label>
    <input type="hidden" name="ref" value="${esc(o.ref || '')}">
    <div class="row"><span class="sp"></span><button class="btn primary">${o.focus ? '下发重点跟踪任务' : '分配任务'}</button></div></form>`;
}
function bindFlexForm(m, source) {
  const fr = m.querySelector('#fr'), frv = m.querySelector('#frv'), fe = m.querySelector('#fe');
  const sync = () => { frv.style.display = ['weekly', 'monthly'].includes(fr.value) ? '' : 'none'; fe.style.display = fr.value === 'once' ? 'none' : ''; frv.querySelector('span').textContent = fr.value === 'weekly' ? '周几（1-7）' : '每月几号'; };
  fr.onchange = sync; sync();
  const fs = m.querySelector('#fs'); if (fs) fs.onchange = () => { m.querySelector('#fa').innerHTML = userOptions(fs.value); };
  m.querySelector('#ff').onsubmit = async e => {
    e.preventDefault();
    if (await act(() => api('/flex', { ...formData(e.target), source }), source === 'focus' ? '重点跟踪任务已下发' : '任务已分配')) { closeModal(); location.hash = source === 'focus' ? '#/focus' : '#/flex'; route(); }
  };
}
function flexTable(list, o = {}) {
  if (!list.length) return '<div class="list"><div class="empty">暂无任务</div></div>';
  return `<div class="tbl"><table><tr><th>任务</th><th>门店 / 场景</th><th>执行人</th><th>周期</th><th>近 7 次</th><th class="n">完成</th><th></th></tr>
  ${list.map(f => `<tr><td>${esc(f.title)} ${f.active ? '' : '<span class="tag">已停用</span>'}<div class="muted small">${esc(f.standard)}</div><div class="muted small">由 ${esc(f.creator_name)} 于 ${esc((f.created_at || '').slice(0, 10))} 创建</div></td>
    <td>${esc(f.store_name)}<div class="muted small">${esc(f.scene_name || '')}</div></td>
    <td>${o.canEdit && f.active ? `<select data-fa="${f.id}">${userOptions(f.store_id, f.assignee_id)}</select>` : esc(f.assignee_name)}</td>
    <td>${freqText(f.recur, f.recur_val)} <span class="mono">${esc(f.due_time)}</span><div class="muted small mono">${esc(f.start_date)}${f.end_date && f.recur !== 'once' ? ' ~ ' + esc(f.end_date) : ''}</div></td>
    <td><span class="dots">${f.recent.map(r => `<i class="${r.check_result === 'bad' ? 'b' : r.status === 'done' ? 'd' : r.date < S.me.today ? 'p' : ''}" title="${r.date}"></i>`).join('')}</span></td>
    <td class="n mono">${f.done}/${f.total}${f.bad ? `<div class="small" style="color:var(--bad)">不合格 ${f.bad}</div>` : ''}</td>
    <td>${o.canStop(f) && f.active ? `<button class="btn sm danger" data-stop="${f.id}">停用</button>` : ''}</td></tr>`).join('')}</table></div>
  <p class="muted small"><span class="dots"><i class="d"></i></span> 已完成 <span class="dots"><i class="p"></i></span> 漏做 <span class="dots"><i class="b"></i></span> 抽查不合格 <span class="dots"><i></i></span> 待完成</p>`;
}
function bindFlexTable() {
  document.querySelectorAll('[data-fa]').forEach(s => s.onchange = () => act(() => api('/flex/' + s.dataset.fa, { assignee_id: Number(s.value) }, 'PUT'), '执行人已更新'));
  document.querySelectorAll('[data-stop]').forEach(b => b.onclick = () => confirm('停用后不再生成新任务，确认？') && act(async () => { await api('/flex/' + b.dataset.stop, { active: 0 }, 'PUT'); route(); }, '已停用'));
}
VIEWS.flex = async () => {
  const list = await api('/flex?source=flex');
  $('#main').innerHTML = `<div class="row between"><h1>灵活任务</h1><button class="btn primary" id="nf">新增灵活任务</button></div>
  <p class="muted small" style="margin-top:-6px">固定工作之外，店长可以随时安排一次性或周期性（每日、每周、每月）的任务给指定的人，执行和抽查跟固定工作一样。</p>${flexTable(list, { canEdit: true, canStop: () => true })}`;
  bindFlexTable();
  $('#nf').onclick = () => modal('新增灵活任务', flexForm(), m => bindFlexForm(m, 'flex'));
};
VIEWS.focus = async () => {
  const p = qs();
  const list = await api('/flex?source=focus');
  const rm = S.me.level === 'region_manager';
  $('#main').innerHTML = `<div class="row between"><h1>重点跟踪任务</h1>${rm ? '<button class="btn primary" id="nf">新增重点跟踪</button>' : ''}</div>
  <p class="muted small" style="margin-top:-6px">区域经理针对巡店或数据发现的问题，给单个门店下发重点跟踪任务（比如每天 9:00 检查早餐）。执行、提醒、抽查、整改都和门店日常工作一样，区域经理和运营经理可以持续看到执行情况。</p>
  ${flexTable(list, { canEdit: S.me.can.manage, canStop: () => rm })}`;
  bindFlexTable();
  const open = o => modal('新增重点跟踪任务', flexForm({ focus: true, ...o }), m => bindFlexForm(m, 'focus'));
  if (rm) $('#nf').onclick = () => open({});
  if (rm && p.get('new')) open({ store_id: Number(p.get('store')) || null, scene_id: Number(p.get('scene')) || null, title: p.get('title') || '', standard: p.get('standard') || '', ref: p.get('ref') || '' });
};

// ---------- team ----------
VIEWS.team = async () => {
  const sid = pickStore(qs().get('store'));
  const tasks = await api(`/tasks?store=${sid}&date=${S.me.today}`);
  const leaves = (await api('/leaves?from=' + S.me.today)).filter(l => l.date === S.me.today);
  const list = storeStaff(sid);
  const staffRoles = S.meta.roles.filter(r => r.level === 'staff');
  $('#main').innerHTML = `<div class="row between"><h1>门店人员</h1>${storeSwitch('#/team')}</div>
  <div class="card" style="margin-bottom:14px"><form id="f" class="row"><input name="name" placeholder="姓名" required><select name="role_id">${staffRoles.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select>
    <input name="phone" placeholder="手机（可选）"><button class="btn primary">添加员工</button><span class="muted small">没有合适的岗位？${S.me.level === 'region_manager' ? '<a href="#/settings">去新增岗位</a>' : '请区域经理在配置中新增'}</span></form></div>
  <div class="tbl"><table><tr><th>姓名</th><th>岗位</th><th class="n">今日任务</th><th class="n">已完成</th><th>状态</th><th></th></tr>
  ${list.map(u => { const ts = tasks.filter(t => t.assignee_id === u.id); const lv = leaves.find(l => l.user_id === u.id);
    return `<tr><td>${esc(u.name)}</td><td>${u.level === 'staff' ? `<select data-role="${u.id}">${staffRoles.map(r => `<option value="${r.id}" ${r.id === u.role_id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>` : esc(u.role_name)}</td>
    <td class="n mono">${ts.length}</td><td class="n mono">${ts.filter(t => t.status === 'done').length}</td><td>${lv ? `<span class="tag warn">休息 · ${esc(lv.cover_name || '店长')}承接</span>` : '<span class="tag ok">在岗</span>'}</td>
    <td>${u.level === 'staff' ? `<button class="btn sm danger" data-off="${u.id}">停用</button>` : ''}</td></tr>`; }).join('')}</table></div>`;
  $('#f').onsubmit = async e => { e.preventDefault(); if (await act(() => api('/users', { ...formData(e.target), store_id: sid }), '已添加')) { await loadMeta(); route(); } };
  document.querySelectorAll('[data-role]').forEach(s => s.onchange = () => act(async () => { await api('/users', { id: Number(s.dataset.role), role_id: Number(s.value) }); await loadMeta(); }, '岗位已更新'));
  document.querySelectorAll('[data-off]').forEach(b => b.onclick = () => confirm('停用后其未完成任务会按岗位重新分配，确认？') && act(async () => { await api('/users', { id: Number(b.dataset.off), active: 0 }); await loadMeta(); route(); }, '已停用'));
};

// ---------- region dashboard ----------
VIEWS.dash = async () => {
  const days = Number(qs().get('days')) || 7;
  const d = await api('/dashboard?days=' + days);
  const sales = S.me.category === 'sales';
  const max = 100;
  const top = d.people.slice(0, 5), bottom = d.people.slice(-5).reverse();
  $('#main').innerHTML = `<div class="row between"><h1>${sales ? '区域销售看板' : '区域运营看板'}</h1>
    <div class="tabs" style="margin:0">${[7, 14].map(n => `<a href="#/dash?days=${n}" class="${days === n ? 'on' : ''}">近 ${n} 日</a>`).join('')}</div></div>
  ${S.me.category ? `<p class="muted small" style="margin-top:-6px">你的权限：只看${sales ? '销售' : '运营'}类工作。</p>` : ''}
  <div class="tbl"><table><tr><th>门店</th><th>店长</th><th style="min-width:130px">今日完成率</th><th class="n">今日超时</th><th style="min-width:130px">近 ${days} 日完成率</th><th class="n">迟交</th><th class="n">抽查合格率</th><th class="n">整改未闭环</th><th class="n">整改逾期</th><th class="n">重点跟踪</th></tr>
  ${d.today.map(s => { const p = d.period.find(x => x.id === s.id); return `<tr class="click" onclick="location.hash='#/tasks?store=${s.id}'"><td><b>${esc(s.name)}</b></td><td>${esc(s.managers.join('、'))}</td>
    <td>${rateBar(s.rate)}</td><td class="n mono" style="${s.overdue ? 'color:var(--bad)' : ''}">${s.overdue}</td><td>${rateBar(p.rate)}</td><td class="n mono">${p.late}</td>
    <td class="n mono">${p.pass_rate ?? '-'}${p.pass_rate !== null ? '%' : ''}</td><td class="n mono">${p.rect_open}</td><td class="n mono" style="${p.rect_late ? 'color:var(--bad)' : ''}">${p.rect_late}</td>
    <td class="n mono">${p.focus_total ? p.focus_done + '/' + p.focus_total : '-'}</td></tr>`; }).join('')}</table></div>
  <div class="grid g2" style="margin-top:12px">
    <div class="card"><h3>区域每日完成率</h3><div class="chart">${d.trend.map(t => `<div class="c"><span>${t.rate ?? '-'}</span><i style="height:${(t.rate || 0) * 0.8 / max * 100}%;${t.rate !== null && t.rate < 85 ? 'background:var(--warn)' : ''}"></i><span>${t.date.slice(5)}</span></div>`).join('')}</div></div>
    <div class="card"><h3>各场景完成情况</h3>${d.scenes.filter(s => s.total).map(s => `<div class="row" style="margin:6px 0;flex-wrap:nowrap"><span style="width:44px">${esc(s.name)}</span><div style="flex:1">${rateBar(s.rate)}</div><span class="small muted" style="width:80px;text-align:right">不合格 ${s.bad || 0}</span></div>`).join('') || '<div class="empty">无数据</div>'}</div>
    <div class="card"><h3>执行之星（完成率前 5）</h3>${peopleRows(top)}</div>
    <div class="card"><h3>需要关注（完成率后 5）</h3>${peopleRows(bottom)}</div>
  </div>`;
};
function peopleRows(list) {
  return list.length ? `<table>${list.map(p => `<tr><td>${esc(p.name)} <span class="muted small">${esc(p.role_name)}</span><div class="muted small">${esc(p.store_name)}</div></td><td style="width:45%">${rateBar(p.rate)}</td>
    <td class="n small"><span style="color:var(--ok)">优 ${p.good || 0}</span> · <span style="color:var(--bad)">差 ${p.bad || 0}</span></td></tr>`).join('')}</table>` : '<div class="empty">无数据</div>';
}

// ---------- issues / patrol screening ----------
VIEWS.issues = async () => {
  const p = qs();
  const type = p.get('type') || '';
  const data = await api('/issues');
  const rm = S.me.level === 'region_manager';
  const types = [...new Set(data.flatMap(d => d.issues.map(i => i.type)))];
  const rows = data.map(d => ({ ...d, shown: d.issues.filter(i => !type || i.type === type) })).filter(d => !type || d.shown.length);
  $('#main').innerHTML = `<h1>${rm ? '问题门店筛选' : '问题预警'}</h1>
  <p class="muted small" style="margin-top:-6px">根据近 7 日数据自动识别：完成率低于 85%、抽查不合格、整改逾期、同一问题 14 日内重复出现、任务反复漏做。${rm ? '可以直接加入巡店计划，或给门店下发重点跟踪任务。' : ''}</p>
  <div class="tabs"><a href="#/issues" class="${!type ? 'on' : ''}">全部</a>${types.map(t => `<a href="#/issues?type=${encodeURIComponent(t)}" class="${type === t ? 'on' : ''}">${esc(t)}</a>`).join('')}</div>
  <div class="grid">${rows.map(d => `<div class="card">
    <div class="row between"><div><b>${esc(d.store.name)}</b> <span class="muted small">店长 ${esc(d.store.managers.join('、'))}</span></div>
      <div class="row">${d.score >= 8 ? '<span class="tag bad">高风险</span>' : d.score >= 3 ? '<span class="tag warn">需关注</span>' : '<span class="tag ok">正常</span>'}
      ${rm ? `<button class="btn sm" data-plan="${d.store.id}">加入巡店计划</button>` : ''}</div></div>
    <div class="row small muted" style="margin:4px 0 8px"><span>近 7 日完成率 ${d.store.rate ?? '-'}%</span><span>抽查合格率 ${d.store.pass_rate ?? '-'}%</span><span>整改未闭环 ${d.store.rect_open}</span>
      <span>上次巡店 ${d.last_patrol ? esc(d.last_patrol.done_at.slice(0, 10)) + '（' + d.last_patrol.score + ' 分）' : '无'}</span>${d.planned ? `<span class="tag acc">已计划 ${esc(d.planned.planned_date)} 巡店</span>` : ''}</div>
    ${d.shown.length ? d.shown.map(i => `<div class="issue"><span class="tag ${i.level === 'high' ? 'bad' : 'warn'}">${esc(i.type)}</span><span class="sp">${esc(i.text)}</span>
      ${rm && i.title ? `<button class="btn sm" data-focus='${esc(JSON.stringify({ store: d.store.id, scene: i.scene_id || S.meta.scenes.find(s => s.name === i.scene)?.id || '', title: i.title }))}'>重点跟踪</button>` : ''}</div>`).join('') : '<div class="muted small">没有发现问题</div>'}
    ${rm ? `<div class="row" style="margin-top:8px"><span class="sp"></span><button class="btn sm" data-focus='${esc(JSON.stringify({ store: d.store.id }))}'>给该店下发重点跟踪任务</button></div>` : ''}
  </div>`).join('')}</div>`;
  document.querySelectorAll('[data-plan]').forEach(b => b.onclick = () => {
    const d = data.find(x => x.store.id === Number(b.dataset.plan));
    planModal(d.store.id, d.issues.map(i => i.type + '：' + i.text).join('；').slice(0, 300));
  });
  document.querySelectorAll('[data-focus]').forEach(b => b.onclick = () => {
    const o = JSON.parse(b.dataset.focus);
    location.hash = '#/focus?' + new URLSearchParams({ new: 1, store: o.store, scene: o.scene || '', title: o.title ? '每日检查：' + o.title : '' });
  });
};
function planModal(storeId, reason) {
  modal('加入巡店计划', `<form id="f"><label class="f"><span>门店</span><select name="store_id">${storeOptions(storeId)}</select></label>
    <label class="f"><span>计划日期</span><input type="date" name="planned_date" value="${addDays(S.me.today, 1)}" required></label>
    <label class="f"><span>巡店重点</span><textarea name="reason">${esc(reason || '')}</textarea></label>
    <div class="row"><span class="sp"></span><button class="btn primary">加入计划</button></div></form>`, m => {
    m.querySelector('#f').onsubmit = async e => { e.preventDefault(); if (await act(() => api('/patrols', formData(e.target)), '已加入巡店计划，店长已收到通知')) { closeModal(); location.hash = '#/patrol'; } };
  });
}

// ---------- patrol ----------
VIEWS.patrol = async id => {
  if (id) return patrolDetail(Number(id));
  const list = await api('/patrols');
  const rm = S.me.level === 'region_manager';
  const planned = list.filter(p => p.status === 'planned'), done = list.filter(p => p.status === 'done');
  $('#main').innerHTML = `<div class="row between"><h1>${rm ? '巡店计划' : '巡店记录'}</h1>${rm ? '<div class="row"><a class="btn" href="#/issues">从问题门店筛选</a><button class="btn primary" id="np">新增巡店计划</button></div>' : ''}</div>
  <h2>待巡店</h2><div class="tbl"><table><tr><th>日期</th><th>门店</th><th>巡店重点</th><th></th></tr>
  ${planned.map(p => `<tr><td class="mono">${esc(p.planned_date)} ${p.planned_date < S.me.today ? '<span class="tag bad">已过期</span>' : p.planned_date === S.me.today ? '<span class="tag acc">今天</span>' : ''}</td><td>${esc(p.store_name)}</td><td class="small">${esc(p.reason)}</td>
    <td style="white-space:nowrap">${rm ? `<a class="btn sm primary" href="#/patrol/${p.id}">开始巡店打分</a> <button class="btn sm danger" data-cancel="${p.id}">取消</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">暂无巡店计划</td></tr>'}</table></div>
  <h2>巡店报告</h2><div class="tbl"><table><tr><th>完成时间</th><th>门店</th><th class="n">得分</th><th>巡店结论</th><th></th></tr>
  ${done.map(p => `<tr class="click" onclick="location.hash='#/patrol/${p.id}'"><td class="mono">${esc(p.done_at)}</td><td>${esc(p.store_name)}</td><td class="n mono" style="${p.score < 85 ? 'color:var(--bad)' : ''}">${p.score}</td><td class="small">${esc(p.summary)}</td><td><a href="#/patrol/${p.id}">查看</a></td></tr>`).join('') || '<tr><td colspan="5" class="empty">暂无巡店报告</td></tr>'}</table></div>`;
  if (rm) $('#np').onclick = () => planModal(S.store, '');
  document.querySelectorAll('[data-cancel]').forEach(b => b.onclick = () => confirm('取消该巡店计划？') && act(async () => { await api('/patrols/' + b.dataset.cancel, null, 'DELETE'); route(); }, '已取消'));
};
async function patrolDetail(id) {
  const p = await api('/patrols/' + id);
  const rm = S.me.level === 'region_manager';
  if (p.status === 'planned' && rm) {
    const items = S.meta.settings.patrol_checklist;
    $('#main').innerHTML = `<div class="row between"><h1>巡店打分 · ${esc(p.store_name)}</h1><a href="#/patrol">返回</a></div>
    <p class="muted small" style="margin-top:-6px">计划日期 ${esc(p.planned_date)} · 重点：${esc(p.reason || '例行巡店')}</p>
    <form id="f"><div class="tbl"><table><tr><th>场景</th><th>检查项</th><th class="n">满分</th><th>得分</th><th>问题描述</th></tr>
    ${items.map(([sc, it, mx], i) => `<tr><td>${esc(sc)}</td><td>${esc(it)}</td><td class="n mono">${mx}</td><td><input type="number" name="s${i}" min="0" max="${mx}" value="${mx}" style="width:70px"></td><td><input name="c${i}" placeholder="发现的问题" style="width:100%"></td></tr>`).join('')}</table></div>
    <label class="f" style="margin-top:12px"><span>巡店结论</span><textarea name="summary" required placeholder="总体评价、主要问题、整改要求"></textarea></label>
    <div class="row"><span class="sp"></span><button class="btn primary">提交巡店报告</button></div></form>`;
    $('#f').onsubmit = async e => {
      e.preventDefault(); const d = formData(e.target);
      const body = { summary: d.summary, items: items.map(([sc, it, mx], i) => ({ scene: sc, item: it, max: mx, score: d['s' + i], comment: d['c' + i] })) };
      if (await act(() => api(`/patrols/${id}/complete`, body), '巡店报告已提交')) route();
    };
    return;
  }
  $('#main').innerHTML = `<div class="row between"><h1>巡店报告 · ${esc(p.store_name)}</h1><a href="#/patrol">返回</a></div>
  ${p.status === 'done' ? `<div class="grid g4" style="margin-bottom:12px"><div class="card kpi"><div class="l">总分</div><div class="v" style="${p.score < 85 ? 'color:var(--bad)' : ''}">${p.score}</div></div>
    <div class="card kpi"><div class="l">完成时间</div><div class="v small mono" style="font-size:14px">${esc(p.done_at)}</div></div><div class="card kpi"><div class="l">已下发重点跟踪</div><div class="v">${p.focus.length}</div></div></div>
  <div class="note" style="margin-bottom:12px"><b>巡店结论</b><br>${esc(p.summary)}</div>
  <div class="tbl"><table><tr><th>场景</th><th>检查项</th><th class="n">得分</th><th>问题</th><th></th></tr>
  ${p.items.map(i => { const low = i.score < i.max * 0.8 || i.comment;
    return `<tr><td>${esc(i.scene_name || '')}</td><td>${esc(i.item)}</td><td class="n mono" style="${i.score < i.max * 0.8 ? 'color:var(--bad)' : ''}">${i.score}/${i.max}</td><td class="small">${esc(i.comment)}</td>
    <td>${rm && low ? `<a class="btn sm" href="#/focus?${new URLSearchParams({ new: 1, store: p.store_id, scene: i.scene_id || '', title: '每日检查：' + i.item, standard: i.comment ? '针对巡店问题：' + i.comment : '', ref: 'patrol:' + p.id })}">转为重点跟踪</a>` : ''}</td></tr>`; }).join('')}</table></div>
  ${p.focus.length ? `<h2>由本次巡店下发的重点跟踪</h2>${p.focus.map(f => `<div><a href="#/focus">${esc(f.title)}</a> ${f.active ? '<span class="tag ok">跟踪中</span>' : '<span class="tag">已停用</span>'}</div>`).join('')}` : ''}`
  : `<p class="muted">计划 ${esc(p.planned_date)} 巡店，重点：${esc(p.reason)}</p>`}`;
}

// ---------- rectifications ----------
VIEWS.rect = async () => {
  const st = qs().get('st') || 'active';
  const all = await api('/rectifications');
  const f = { active: r => r.status !== 'closed', submitted: r => r.status === 'submitted', late: r => r.late, closed: r => r.status === 'closed', all: () => true };
  const list = all.filter(f[st]);
  const rate = all.length ? Math.round(all.filter(r => r.status === 'closed').length * 100 / all.length) : 0;
  $('#main').innerHTML = `<h1>整改闭环</h1>
  <p class="muted small" style="margin-top:-6px">闭环流程：抽查不合格 → 写明原因 → 培训 → 规定整改任务和日期 → 员工提交整改 → 店长复查（通过即闭环，不通过就退回并重新定日期）。整体闭环率 ${rate}%。</p>
  <div class="tabs">${[['active', '未闭环'], ['submitted', '待复查'], ['late', '逾期'], ['closed', '已闭环'], ['all', '全部']].map(([k, l]) => `<a href="#/rect?st=${k}" class="${st === k ? 'on' : ''}">${l} <span class="muted">${all.filter(f[k]).length}</span></a>`).join('')}</div>
  ${rectCards(list)}`;
  bindRect(list);
};

// ---------- settings ----------
VIEWS.settings = async () => {
  const tpls = await api('/templates');
  const st = S.meta.settings;
  $('#main').innerHTML = `<h1>岗位 / 场景 / 工作清单</h1>
  <div class="grid g2">
    <div class="card"><h3>岗位</h3><div class="row" style="margin-bottom:8px">${S.meta.roles.map(r => `<span class="tag ${r.level === 'staff' ? '' : 'acc'}">${esc(r.name)}</span>`).join('')}</div>
      <form id="fr" class="row"><input name="name" placeholder="新岗位，如：夜审、礼宾" required><button class="btn">新增岗位</button></form></div>
    <div class="card"><h3>门店场景</h3><div class="row" style="margin-bottom:8px">${S.meta.scenes.map(s => `<span class="tag">${esc(s.name)} <a href="javascript:void 0" data-sc="${s.id}" title="停用">×</a></span>`).join('')}</div>
      <form id="fs" class="row"><input name="name" placeholder="新场景，如：会议室、康体" required><button class="btn">新增场景</button></form></div>
    <div class="card"><h3>提醒规则</h3><form id="fm">
      <label class="f"><span>每日定点提醒时间（逗号分隔）</span><input name="times" value="${esc(st.reminder_times.join(','))}"></label>
      <label class="f"><span>超时多少分钟后升级提醒店长</span><input type="number" name="esc" value="${st.escalate_minutes}"></label>
      <button class="btn">保存</button></form></div>
    <div class="card"><h3>巡店评分表</h3><form id="fp"><label class="f"><span>每行一项：场景|检查项|满分</span><textarea name="cl" rows="8" style="font-family:var(--mono);font-size:12px">${esc(st.patrol_checklist.map(x => x.join('|')).join('\n'))}</textarea></label><button class="btn">保存</button></form></div>
  </div>
  <div class="row between" style="margin-top:20px"><h2 style="margin:0">固定运营工作清单</h2><button class="btn primary" id="nt">新增固定工作</button></div>
  <p class="muted small">按场景和岗位定义每天、每周或每月要做的标准工作。各门店自动生成，由店长分配到人。</p>
  <div class="tbl"><table><tr><th>场景</th><th>时间</th><th>工作内容</th><th>默认岗位</th><th>频次</th><th>类别</th><th></th></tr>
  ${tpls.map(t => `<tr style="${t.active ? '' : 'opacity:.5'}"><td>${esc(t.scene_name)}</td><td class="mono">${esc(t.due_time)}</td><td>${esc(t.title)} ${t.need_photo ? '<span class="tag">需拍照</span>' : ''}<div class="muted small">${esc(t.standard)}</div></td>
    <td>${esc(t.role_name)}</td><td>${freqText(t.freq, t.freq_val)}</td><td>${t.category === 'sales' ? '销售' : '运营'}</td><td><button class="btn sm" data-et="${t.id}">编辑</button></td></tr>`).join('')}</table></div>`;
  const reload = async () => { await loadMeta(); route(); };
  $('#fr').onsubmit = async e => { e.preventDefault(); if (await act(() => api('/roles', formData(e.target)), '岗位已新增')) reload(); };
  $('#fs').onsubmit = async e => { e.preventDefault(); if (await act(() => api('/scenes', formData(e.target)), '场景已新增')) reload(); };
  document.querySelectorAll('[data-sc]').forEach(a => a.onclick = () => confirm('停用该场景？其下固定工作将不再生成') && act(async () => { await api('/scenes', { id: Number(a.dataset.sc), active: 0 }); reload(); }, '已停用'));
  $('#fm').onsubmit = async e => { e.preventDefault(); const d = formData(e.target); if (await act(() => api('/settings', { reminder_times: d.times.split(/[,，\s]+/).filter(Boolean), escalate_minutes: d.esc }), '已保存')) reload(); };
  $('#fp').onsubmit = async e => { e.preventDefault(); const cl = e.target.cl.value.split('\n').map(l => l.split('|').map(x => x.trim())).filter(x => x.length === 3 && x[1]).map(([a, b, c]) => [a, b, Number(c) || 0]);
    if (await act(() => api('/settings', { patrol_checklist: cl }), '评分表已保存')) reload(); };
  const edit = t => modal(t.id ? '编辑固定工作' : '新增固定工作', `<form id="ft"><div class="form2">
    <label class="f"><span>场景</span><select name="scene_id">${sceneOptions(t.scene_id)}</select></label>
    <label class="f"><span>默认岗位</span><select name="role_id">${S.meta.roles.filter(r => ['staff', 'store_manager'].includes(r.level)).map(r => `<option value="${r.id}" ${r.id === t.role_id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label></div>
    <label class="f"><span>工作内容</span><input name="title" value="${esc(t.title || '')}" required></label>
    <label class="f"><span>完成标准</span><textarea name="standard">${esc(t.standard || '')}</textarea></label>
    <div class="form2"><label class="f"><span>完成时间</span><input type="time" name="due_time" value="${t.due_time || '09:00'}"></label>
    <label class="f"><span>频次</span><select name="freq">${[['daily', '每日'], ['weekly', '每周'], ['monthly', '每月']].map(([k, l]) => `<option value="${k}" ${t.freq === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="f"><span>周几（1-7） / 每月几号</span><input type="number" name="freq_val" value="${t.freq_val || ''}" min="1" max="31"></label>
    <label class="f"><span>类别</span><select name="category"><option value="ops">运营</option><option value="sales" ${t.category === 'sales' ? 'selected' : ''}>销售</option></select></label></div>
    <label class="f"><input type="checkbox" name="need_photo" ${t.need_photo ? 'checked' : ''}> 需要拍照留证</label>
    ${t.id ? `<label class="f"><input type="checkbox" name="active" ${t.active ? 'checked' : ''}> 启用</label>` : ''}
    <div class="row"><span class="sp"></span><button class="btn primary">保存</button></div></form>`, m => {
    m.querySelector('#ft').onsubmit = async e => { e.preventDefault(); const d = formData(e.target);
      if (await act(() => api('/templates', { ...d, id: t.id, active: t.id ? (d.active ? 1 : 0) : 1 }), '已保存')) { closeModal(); route(); } };
  });
  $('#nt').onclick = () => edit({});
  document.querySelectorAll('[data-et]').forEach(b => b.onclick = () => edit(tpls.find(t => t.id === Number(b.dataset.et))));
};

// ---------- audit ----------
VIEWS.audit = async () => {
  const list = await api('/audit');
  $('#main').innerHTML = `<h1>操作日志</h1><p class="muted small" style="margin-top:-6px">分配、顶岗、抽查、整改、巡店等关键操作都会留痕，方便追溯。</p>
  <div class="tbl"><table><tr><th>时间</th><th>操作人</th><th>门店</th><th>操作</th><th>内容</th></tr>
  ${list.map(a => `<tr><td class="mono">${esc(a.at)}</td><td>${esc(a.user_name)}</td><td>${esc(a.store_name || '区域')}</td><td>${esc(a.action)}</td><td class="small">${esc(a.detail)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">暂无</td></tr>'}</table></div>`;
};

route();
