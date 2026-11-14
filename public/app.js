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
window.addEventListener('hashchange', closeModal);
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
  if (it.status === 'missed') return '<span class="tag bad">逾期未完成</span>';
  return it.overdue ? '<span class="tag bad">超时未完成</span>' : '<span class="tag">待完成</span>';
}
function checkTag(it) {
  if (it.check_result === 'good') return '<span class="tag ok">抽查合格</span>';
  if (it.check_result === 'bad') return `<span class="tag bad">抽查不合格</span>${it.rect_status ? ` <span class="tag ${it.rect_status === 'closed' ? 'ok' : 'warn'}">整改${{ open: '中', submitted: '待复查', closed: '已闭环' }[it.rect_status]}</span>` : ''}`;
  return '';
}
const M_TEXT = { M1: '店长亲做', M2: '下级做·店长复查', M3: '分工·店长抽查', M4: '群拍反馈' };
const M_DESC = { M1: '店长亲做 + 亲反馈', M2: '减一层亲做 + 店长复查', M3: '多层分工 + 店长抽查', M4: '制度化群反馈（机制化入群）' };
const F_TEXT = { F1: '记录', F2: '拍照', F3: '计量', F4: '群拍', F5: '质量看板', F6: '判断标签' };
const TAG_CLS = { 清零项: 'bad', 重点项: 'warn', 关注项: 'acc', 跟踪项: '' };
const fText = f => (f || '').split('+').map(x => F_TEXT[x] || x).join('+');
const stdTags = t => (t.code ? `<span class="tag std">No.${esc(t.code)}</span>${t.tag && t.tag !== '基础项' ? ` <span class="tag ${TAG_CLS[t.tag] ?? ''}">${esc(t.tag)}</span>` : ''} <span class="tag m">${M_TEXT[t.m] || ''}</span>` : '');
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
  staff: [['sec', '我的工作'], ['my', '我的任务'], ['mycare', '员工美好'], ['my-rect', '我的整改'], ['repair', '工程报修'], ['complaints', '客诉登记'], ['engage', '敬业度调研'], ['pay', '我的绩效'], ['shift', '值班交接'], ['notices', '消息提醒'], ['sec', '品牌标准'], ['standards', '品牌标准库'], ['feed', '门店群拍墙']],
  store_manager: [['sec', '每日工作'], ['desk', '今日待办'], ['diag', '能力诊断'], ['onboard', '90 天上手'], ['shift', '值班交接'], ['complaints', '客诉闭环'], ['safety', '安全与应急'], ['tasks', '任务看板与抽查'], ['rect', '整改闭环'], ['my', '我的任务'],
    ['sec', '品牌标准'], ['standards', '品牌标准库'], ['feed', '门店群拍墙'], 
    ['sec', '分配'], ['assign', '场景分配'], ['leave', '休息与顶岗'], ['flex', '灵活任务'], ['sec', '监督'], ['focus', '重点跟踪'], ['issues', '问题预警'], ['patrol', '巡店与复查'], ['repair', '工程报修'], ['proc', '采购与物料'], ['suppliers', '供应商评价'], ['labor', '排班与人效'], ['train', '培训与认证'], ['pay', '绩效与薪酬'], ['team', '门店人员'], ['hrm', '人事指标'], ['care', '员工美好'], ['engage', '敬业度与留任'], ['audit', '操作日志'], ['notices', '消息提醒']],
  coach: [['sec', '教练'], ['coach', '本周辅导'], ['wcal', '工作日历'], ['engage', '敬业度与留任'], ['hrm', '人事指标'], ['care', '员工美好'], ['sec', '门店'], ['complaints', '客诉闭环'], ['safety', '安全与应急'], ['labor', '排班与人效'], ['rect', '整改闭环'], ['train', '培训与认证'], ['notices', '消息提醒'], ['standards', '品牌标准库']],
  hq: [['sec', '总部'], ['hq', '总部视角'], ['dataauth', '数据授权'], ['hrm', '人事指标'], ['care', '员工美好'], ['brands', '品牌标准'], ['wcal', '工作日历'], ['suppliers', '供应商评价'], ['notices', '消息提醒'], ['standards', '品牌标准库']],
  train_manager: [['sec', '培训'], ['train', '培训与认证'], ['standards', '品牌标准库'], ['notices', '消息提醒']],
  dev_manager: [['sec', '门店发展'], ['standards', '品牌标准库'], ['notices', '消息提醒']],
  build_manager: [['sec', '项目管理'], ['standards', '品牌标准库'], ['notices', '消息提醒']],
  hr_manager: [['sec', '人事'], ['hrm', '人事指标'], ['care', '员工美好'], ['people', '人员档案与梯队'], ['train', '培训与认证'], ['pay', '绩效与薪酬'], ['notices', '消息提醒'], ['sec', '品牌标准'], ['standards', '品牌标准库'], ['feed', '门店群拍墙']],
  ops_manager: [['sec', '区域运营'], ['dash', '区域运营看板'], ['hrm', '人事指标'], ['care', '员工美好'], ['issues', '问题门店'], ['tasks', '门店任务明细'], ['rect', '整改闭环'], ['focus', '重点跟踪'], ['patrol', '巡店与复查'], ['repair', '工程报修'], ['complaints', '客诉闭环'], ['safety', '安全与应急'], ['labor', '排班与人效'], ['proc', '采购与物料'], ['suppliers', '供应商评价'], ['notices', '消息提醒'], ['sec', '品牌标准'], ['standards', '品牌标准库'], ['feed', '门店群拍墙']],
  sales_manager: [['sec', '区域销售'], ['dash', '区域销售看板'], ['complaints', '客诉闭环'], ['issues', '问题门店'], ['tasks', '门店销售任务'], ['rect', '整改闭环'], ['notices', '消息提醒']],
  region_manager: [['sec', '全局'], ['dash', '区域看板'], ['coach', '教练辅导'], ['wcal', '工作日历'], ['hq', '总部视角'], ['people', '人事档案与梯队'], ['hrm', '人事指标'], ['care', '员工美好'], ['engage', '敬业度与留任'], ['issues', '问题门店筛选'], ['patrol', '巡店计划'], ['focus', '重点跟踪'],
    ['sec', '品牌标准'], ['standards', '品牌标准库'], ['feed', '门店群拍墙'], 
    ['sec', '门店'], ['tasks', '门店任务明细'], ['rect', '整改闭环'], ['repair', '工程报修'], ['complaints', '客诉闭环'], ['safety', '安全与应急'], ['labor', '排班与人效'], ['proc', '采购与物料'], ['suppliers', '供应商评价'], ['train', '培训与认证'], ['assign', '场景分配'], ['leave', '休息与顶岗'], ['team', '门店人员'],
    ['pay', '绩效与薪酬'], ['sec', '配置'], ['brands', '品牌标准'], ['scorecfg', '评价口径与预警'], ['dataauth', '数据授权'], ['settings', '岗位 / 场景 / 工作清单'], ['audit', '操作日志'], ['notices', '消息提醒']],
};
const HOME = { coach: 'coach', hq: 'hq', train_manager: 'home', dev_manager: 'home', build_manager: 'home', hr_manager: 'home', staff: 'home', store_manager: 'home', ops_manager: 'home', sales_manager: 'home', region_manager: 'home' };
const COMMON = ['home', 'work', 'me', 'notices', 'my', 'my-rect', 'standards', 'feed', 'group', 'task', 'app', 'upper', 'must', 'crew', 'person', 'leader', 'hrp', 'sp', 'frs', 'sbiz', 'report', 'repair', 'proj', 'proc', 'train', 'pay', 'shift', 'yi', 'complaints', 'safety', 'labor', 'suppliers', 'diag', 'onboard', 'engage', 'wcal', 'coach', 'hq', 'hrm', 'care', 'mycare'];
const rectRoute = () => (S.me.level === 'staff' ? 'my-rect' : 'rect');
const CENTER = { coach: '教练中心', hq: '总部视角', train_manager: '培训中心', dev_manager: '发展中心', build_manager: '项目中心', hr_manager: '人事中心', staff: '我的', store_manager: '店长中心', ops_manager: '运营中心', sales_manager: '营销中心', region_manager: '区域中心' };
const ICON = {
  home: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5V14l-3 3H5.5A1.5 1.5 0 0 1 4 15.5z"/><path d="M7 8h6M7 11h4"/>',
  notices: '<path d="M4 6.5C4 5 5.3 4 7 4h6c1.7 0 3 1 3 2.5v5c0 1.5-1.3 2.5-3 2.5H9l-3.5 2.5V14C4.6 13.7 4 12.8 4 11.5z"/>',
  work: '<rect x="4" y="4" width="5" height="5" rx="1.5"/><rect x="11" y="4" width="5" height="5" rx="1.5"/><rect x="4" y="11" width="5" height="5" rx="1.5"/><rect x="11" y="11" width="5" height="5" rx="1.5"/>',
  rect: '<path d="M10 3.5l5.5 2v4.2c0 3.3-2.3 5.8-5.5 6.8-3.2-1-5.5-3.5-5.5-6.8V5.5z"/><path d="M7.5 10l1.8 1.8 3.4-3.6"/>',
  me: '<circle cx="10" cy="7" r="3"/><path d="M4.5 16.5c.7-3 2.9-4.5 5.5-4.5s4.8 1.5 5.5 4.5"/>',
  more: '<circle cx="6.5" cy="6.5" r="2.5"/><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="6.5" cy="13.5" r="2.5"/><circle cx="13.5" cy="13.5" r="2.5"/>',
  cam: '<path d="M3 6.5h3l1.5-2h5l1.5 2h3v9.5H3z"/><circle cx="10" cy="11" r="3"/>',
  clock: '<circle cx="10" cy="10" r="6.5"/><path d="M10 6.5V10l2.5 1.5"/>',
  hour: '<path d="M6 3.5h8M6 16.5h8M7 3.5c0 4 6 4.5 6 6.5s-6 2.5-6 6.5M13 3.5c0 4-6 4.5-6 6.5"/>',
  cal: '<rect x="3.5" y="4.5" width="13" height="12" rx="2"/><path d="M3.5 8h13M7 3v3M13 3v3"/>',
};
const icon = (k, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 20 20" aria-hidden="true">${ICON[k]}</svg>`;
const TILE_COLORS = ['#3C7BF4', '#14A38B', '#F29A2E', '#7C6CF2', '#E5534B', '#2BA6DE', '#C2843A', '#5B8C5A'];
const navLabel = k => { for (const [kk, l] of NAV[S.me.level]) if (kk === k) return l; return { work: '工作台', me: CENTER[S.me.level], notices: '消息', group: '任务列表', task: '任务处理', app: '内部系统' }[k] || ''; };

function shell(route, html) {
  const root = ['home', 'notices', 'work', 'rect', 'my-rect', 'me'].includes(route);
  const rr = rectRoute();
  const tabs = [['home', '宏图', 'home'], ['notices', '消息', 'notices'], ['work', '工作台', 'work'], [rr, '整改', 'rect'], ['me', '我的', 'me']];
  $('#app').innerHTML = `<div class="phone">
  <header class="appbar">${root ? '<img class="logo" src="/icon.svg" alt="">' : '<a class="back" id="back" href="javascript:void 0" aria-label="返回">‹</a>'}
    <b>${root ? '宏图' : esc(navLabel(route))}</b><span class="sp"></span>
    <button class="dots" id="dots" aria-label="更多">···</button></header>
  <main class="main ${route === 'home' ? 'home' : ''}" id="main">${html}</main>
  <div class="foot">宏图计划 · 演示模式 · 数据为模拟数据 · <a href="${SESSION_URL}" target="_blank" rel="noopener">需要修改？提交需求</a></div>
  <nav class="tabbar">${tabs.map(([k, l, ic]) => `<a href="#/${k}" class="${route === k ? 'on' : ''}">${icon(ic)}${k === 'notices' && S.me.unread ? `<b>${S.me.unread > 99 ? '99+' : S.me.unread}</b>` : ''}<span>${l}</span></a>`).join('')}</nav>
  </div>`;
  const back = $('#back'); if (back) back.onclick = () => (history.length > 1 ? history.back() : (location.hash = '#/work'));
  $('#dots').onclick = () => sheet([['切换身份', () => { location.hash = '#/login'; }], ['刷新', () => route()], ['提交修改需求', () => window.open(SESSION_URL, '_blank')]]);
}
function sheet(items, title) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-bg sheet-bg"><div class="sheet">${title ? `<div class="sh">${esc(title)}</div>` : ''}${items.map(([l], i) => `<button data-i="${i}">${l}</button>`).join('')}<button class="cancel" data-close>取消</button></div></div>`;
  const bg = root.firstChild;
  bg.addEventListener('click', e => {
    if (e.target === bg || e.target.hasAttribute('data-close')) return closeModal();
    const b = e.target.closest('[data-i]'); if (b) { closeModal(); items[Number(b.dataset.i)][1](); }
  });
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
  const allowed = VIEWS[name] && (COMMON.includes(name) || NAV[S.me.level].some(([k]) => k === name) || (name === 'patrol' && S.me.level !== 'staff'));
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
  const stores = [...new Set(list.filter(u => u.level === 'staff').map(u => u.stores[0]))];
  const row = u => `<button class="urow" data-uid="${u.id}"><span class="av">${esc(u.name.slice(0, 1))}</span><span class="grow"><b>${esc(u.name)}</b><small>${esc(u.stores.join('、'))}</small></span><span class="tag">${esc(u.role_name)}</span></button>`;
  const lead = list.filter(u => ['region_manager', 'ops_manager', 'sales_manager', 'hr_manager', 'dev_manager', 'build_manager', 'train_manager', 'coach', 'hq'].includes(u.level));
  const group = (t, us) => `<div class="sec-t">${esc(t)}</div><div class="panel">${us.map(row).join('')}</div>`;
  $('#app').innerHTML = `<div class="phone">
    <header class="appbar"><img class="logo" src="/icon.svg" alt=""><b>宏图计划</b></header>
    <main class="main">
      <div class="hero"><h1>选择身份进入</h1><p>门店运营任务分发与闭环管理 · 演示模式，进入后可随时在右上角「···」切换身份，查看不同角色的视角。</p></div>
      ${group('区域管理', lead)}${group('门店店长', list.filter(u => u.level === 'store_manager'))}
      ${stores.map(s => group(s + ' · 员工', list.filter(u => u.level === 'staff' && u.stores[0] === s))).join('')}
    </main>
    <div class="foot">宏图计划 · 演示数据 · <a href="${SESSION_URL}" target="_blank" rel="noopener">需要修改？提交需求</a></div></div>`;
  document.querySelectorAll('[data-uid]').forEach(b => b.onclick = () => {
    localStorage.lt_uid = b.dataset.uid; S.meta = null; localStorage.removeItem('lt_store');
    location.hash = '#/home'; route();
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
// ---------- 任务分组折叠 + 说明问号 ----------
const KINDS = [['消防安全', /消防|烟感|温感|报警|监控|燃气|液化气|应急|疏散|消火栓|灭火|安全/], ['食品餐饮', /早餐|厨|食品|留样|餐具|出品|菜|食材|餐厅/], ['设施设备', /设备|空调|电梯|照明|维修|水电|锅炉|配电|机房|网络|灯|电视|门锁|热水|管道|工程/], ['清洁卫生', /清洁|卫生|5S|整洁|干净|污渍|异味|垃圾|消毒|毛发|灰尘/], ['宾客服务', /宾客|客人|入住|退房|礼仪|仪容|服务|交接|预订|欢迎|迎来送往|投诉|点评|晨会|巡视/], ['客房房务', /客房|查房|做房|房间|OK ?房|楼层/], ['物品备品', /布草|易耗品|备品|物品|库存|迷你吧|仓库|用品|物资/], ['证照制度', /证|合同|制度|培训|台账|记录|档案|公示/]];
function kindOf(t) {
  for (const [k, re] of KINDS) if (re.test(t.title || '')) return k;
  for (const [k, re] of KINDS) if (re.test(t.standard || '')) return k;
  return '其他';
}
const qm = (t, p = '') => (t.standard ? ((S.stdMap ||= {})[p + t.id] = t, `<button type="button" class="qm" data-std="${p}${t.id}" aria-label="查看说明">?</button>`) : '');
document.addEventListener('click', e => {
  const b = e.target.closest('[data-std]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const t = (S.stdMap || {})[b.dataset.std]; if (!t) return;
  modal(esc(t.title), `${t.code ? `<p class="muted small">条款 ${esc(t.code)}${t.tag ? ' · ' + esc(t.tag) : ''}${t.m ? ' · ' + esc(t.m) : ''}</p>` : ''}<div class="stdtxt">${esc(t.standard).replace(/\s*(\d{1,2})\.(?!\d)/g, '\n$1.').trim()}</div>`);
}, true);
function taskBoard(list, row, key, opts = {}) {
  S.tf ||= {};
  const F = [['all', '全部', () => true], ['todo', '待完成', t => t.status !== 'done'], ['od', '超时', t => t.overdue], ['photo', '需拍照', t => t.need_photo], ['std', '品牌标准', t => t.code]];
  if (opts.mine) F.splice(1, 0, ['mine', '我的', t => t.assignee_id === S.me.id]);
  const f = F.some(x => x[0] === S.tf[key]) ? S.tf[key] : 'all';
  const fl = list.filter(F.find(x => x[0] === f)[2]);
  const secs = [['od', '已超时', fl.filter(t => t.overdue)], ['todo', '待完成', fl.filter(t => t.status !== 'done' && !t.overdue)], ['done', '已完成', fl.filter(t => t.status === 'done')]];
  return `<div class="tfil" data-tf="${key}">${F.map(([k, l, fn]) => `<a data-f="${k}" class="${f === k ? 'on' : ''}">${l}<small>${list.filter(fn).length}</small></a>`).join('')}</div>
  ${secs.filter(x => x[2].length).map(([sk, sl, ts]) => {
    let inner;
    if (ts.length <= 6) inner = `<div class="tgrp flat"><div class="tgb">${ts.map(row).join('')}</div></div>`;
    else {
      const kinds = {}; ts.forEach(t => (kinds[kindOf(t)] ||= []).push(t));
      let ks = Object.entries(kinds);
      if (ks.length > 3) { const single = ks.filter(x => x[1].length === 1 && x[0] !== '其他'); if (single.length > 1) { ks = ks.filter(x => !single.includes(x)); const o = ks.find(x => x[0] === '其他'); const rest = single.flatMap(x => x[1]); o ? o[1].push(...rest) : ks.push(['其他', rest]); } }
      ks.sort((a, b) => (a[0] === '其他') - (b[0] === '其他') || b[1].length - a[1].length);
      inner = ks.map(([k, xs], i) => { const id = `${key}:${sk}:${k}`, open = S.open[id] ?? (sk === 'od' || (sk === 'todo' && i === 0));
        return `<details class="tgrp" data-k="${esc(id)}" ${open ? 'open' : ''}><summary><span>${k}</span><em>${xs.length} 项</em></summary><div class="tgb">${xs.map(row).join('')}</div></details>`; }).join('');
    }
    const id = `${key}:${sk}`;
    return sk === 'done' ? `<details class="tsec done tgrp0" data-k="${id}" ${S.open[id] ? 'open' : ''}><summary class="tsec-h">${sl}<b>${ts.length}</b><i>${S.open[id] ? '收起' : '展开'}</i></summary>${inner}</details>`
      : `<div class="tsec ${sk}"><div class="tsec-h">${sl}<b>${ts.length}</b></div>${inner}</div>`;
  }).join('') || '<div class="empty">没有符合条件的任务</div>'}`;
}
function bindBoard() {
  document.querySelectorAll('.tfil a').forEach(a => a.onclick = () => { S.tf[a.parentNode.dataset.tf] = a.dataset.f; route(); });
  document.querySelectorAll('details.tgrp,details.tsec').forEach(d => d.ontoggle = () => { S.open[d.dataset.k] = d.open; const i = d.querySelector(':scope>summary>i'); if (i) i.textContent = d.open ? '收起' : '展开'; });
}

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
  ${list.length ? taskBoard(list, t => `<div class="task ${t.status === 'done' ? 'done' : ''}"><div class="t">${esc(t.due_time)}</div><div class="b">
      <div class="ttl">${esc(t.title)}${qm(t)}</div>
      <div class="tsub">${esc(t.scene_name || '')} ${originTag(t.origin)} ${stdTags(t)} ${t.covered ? `<span class="tag acc">顶岗 · 替 ${esc(t.orig_name)}</span>` : ''} ${t.need_photo ? '<span class="tag">需拍照</span>' : ''} ${statusTag(t)} ${checkTag(t)}</div>
      ${t.check_comment ? `<div class="muted small">店长：${esc(t.check_comment)}</div>` : ''}</div>
      <div>${t.status === 'done' ? (t.check_result ? '' : `<button class="btn sm" data-undo="${t.id}">撤回</button>`) : `<button class="btn primary sm" data-done="${t.id}">完成</button>`}</div></div>`, 'my')
    : '<div class="list"><div class="empty">今天没有分配给你的任务</div></div>'}`;
  document.querySelectorAll('[data-done]').forEach(b => b.onclick = () => completeModal(list.find(t => t.id === Number(b.dataset.done))));
  document.querySelectorAll('[data-undo]').forEach(b => b.onclick = () => act(async () => { await api(`/instances/${b.dataset.undo}/undo`, {}); route(); }, '已撤回'));
  bindBoard();
};
function completeModal(t) { location.hash = '#/task/' + t.id; }
function completeModalOld(t, after) {
  modal('完成任务', `<div class="kv"><div>任务</div><div>${esc(t.title)}</div><div>标准</div><div class="pre">${esc(t.standard || '-')}</div><div>截止</div><div class="mono">${esc(t.date)} ${esc(t.due_time)}</div></div>
    ${t.code ? `<p class="muted small">品牌标准 No.${esc(t.code)} · ${M_DESC[t.m] || ''} · 反馈方式：${fText(t.f)}${(t.f || '').includes('F4') ? '（照片会同步到门店群拍墙）' : ''}</p>` : ''}
    <form id="f">${t.need_value ? '<label class="f"><span>计量读数（必填）</span><input name="reading" required placeholder="例如：巡检 15 个点位，异常 0 处 / 水温 52℃"></label>' : ''}<label class="f"><span>完成说明（可选）</span><textarea name="note" placeholder="例如：已补齐 3 个品种"></textarea></label>
    <label class="f"><span>现场照片${t.need_photo ? '（必传）' : '（可选）'}</span><input type="file" accept="image/*" capture="environment" ${t.need_photo ? 'required' : ''}></label>
    <div class="row"><span class="sp"></span><button class="btn" type="button" data-close>取消</button><button class="btn primary">确认完成</button></div></form>`, m => {
    m.querySelector('#f').onsubmit = async e => {
      e.preventDefault();
      const f = e.target; f.querySelector('.primary').disabled = true;
      const ok = await act(async () => api(`/instances/${t.id}/complete`, { note: f.note.value, reading: f.reading ? f.reading.value : '', photo: await filePhoto(f) }), '已完成');
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
  const mm = p.get('m') || '';
  const all0 = await api(`/tasks?store=${sid}&date=${date}`);
  const all = all0.filter(t => !mm || (mm === 'std' ? !t.code : t.m === mm));
  const filt = {
    '': () => true, pending: t => t.status === 'pending' && !t.overdue, overdue: t => t.overdue, done: t => t.status === 'done',
    unchecked: t => t.status === 'done' && !t.check_result, bad: t => t.check_result === 'bad', cover: t => t.covered,
  };
  const list = all.filter(t => (!scene || t.scene_id === Number(scene)) && filt[st](t));
  const link = (k, v) => { const q = new URLSearchParams({ store: sid, date, scene, st, m: mm }); q.set(k, v); return '#/tasks?' + q; };
  const cnt = k => all.filter(filt[k]).length;
  const canCheck = S.me.can.manage;
  const byScene = {};
  for (const t of list) (byScene[t.scene_name || '其他'] ||= []).push(t);
  const title = { ops_manager: '门店任务明细（运营）', sales_manager: '门店销售任务', region_manager: '门店任务明细' }[S.me.level] || '任务看板与抽查';
  $('#main').innerHTML = `<div class="row between"><h1>${title}</h1><div class="row">${storeSwitch('#/tasks', '&date=' + date)}<input type="date" value="${date}" onchange="location.hash='${link('date', '')}'.replace('date=','date='+this.value)"></div></div>
  <div class="tabs"><a href="${link('scene', '')}" class="${!scene ? 'on' : ''}">全部场景</a>${S.meta.scenes.map(s => `<a href="${link('scene', s.id)}" class="${Number(scene) === s.id ? 'on' : ''}">${esc(s.name)}</a>`).join('')}</div>
  <div class="tabs">${[['', '全部来源'], ['std', '日常运营'], ['M1', 'M1 店长亲做'], ['M2', 'M2 下级做·复查'], ['M3', 'M3 分工·抽查'], ['M4', 'M4 群拍']].map(([k, l]) => `<a href="${link('m', k)}" class="${mm === k ? 'on' : ''}">${l} <span class="muted">${all0.filter(t => !k || (k === 'std' ? !t.code : t.m === k)).length}</span></a>`).join('')}</div>
  <div class="tabs">${[['', '全部'], ['pending', '待完成'], ['overdue', '超时'], ['done', '已完成'], ['unchecked', mm === 'M2' ? '待复查' : '待抽查'], ['bad', '不合格'], ['cover', '顶岗']]
    .map(([k, l]) => `<a href="${link('st', k)}" class="${st === k ? 'on' : ''}">${l} <span class="muted">${cnt(k)}</span></a>`).join('')}</div>
  ${list.length ? Object.entries(byScene).map(([sc, ts]) => `<div class="list" style="margin-bottom:12px"><div class="hd">${esc(sc)}</div>
    ${ts.map(t => `<div class="task ${t.status === 'done' ? 'done' : ''}"><div class="t">${esc(t.due_time)}</div><div class="b">
      <div class="ttl">${esc(t.title)} ${originTag(t.origin)} ${stdTags(t)} ${t.category === 'sales' ? '<span class="tag">销售</span>' : ''}</div>
      <div class="row small" style="margin-top:2px"><span>${esc(t.assignee_name || '未分配')} <span class="muted">${esc(t.assignee_role || '')}</span></span>
        ${t.covered ? `<span class="tag acc">顶岗 · 原 ${esc(t.orig_name)}</span>` : ''} ${statusTag(t)} ${checkTag(t)} ${t.photo ? '<span class="tag">有照片</span>' : ''}</div></div>
      <div class="row">${canCheck && t.status === 'done' && !t.check_result ? `<button class="btn primary sm" data-chk="${t.id}">${t.m === 'M2' ? '复查' : '抽查'}</button>` : ''}<button class="btn sm" data-view="${t.id}">详情</button></div></div>`).join('')}</div>`).join('')
    : '<div class="list"><div class="empty">没有符合条件的任务</div></div>'}`;
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => taskDetail(Number(b.dataset.view)));
  document.querySelectorAll('[data-chk]').forEach(b => b.onclick = () => checkModal(all.find(t => t.id === Number(b.dataset.chk))));
};
async function taskDetail(id) {
  const t = await api('/instances/' + id);
  const manage = S.me.can.manage;
  modal(t.title, `<div class="kv">
    <div>门店 / 场景</div><div>${esc(t.store_name)} · ${esc(t.scene_name)}</div>
    ${t.code ? `<div>品牌标准</div><div>No.${esc(t.code)} · ${esc(t.sub || '')} · ${esc(t.tag || '')}${/^\d+$/.test(t.tscore || '') ? `（${esc(t.tscore)} 分）` : ''}</div>
    <div>M-L-F</div><div>${esc(t.m)} ${M_DESC[t.m] || ''} · ${esc(t.l || 'L1')} 动作层 · ${esc(t.f)} ${fText(t.f)}</div>` : ''}
    <div>标准</div><div class="pre">${esc(t.standard || '-')}</div>
    <div>截止</div><div class="mono">${esc(t.date)} ${esc(t.due_time)}</div>
    ${t.reading ? `<div>计量读数</div><div>${esc(t.reading)}</div>` : ''}
    <div>执行人</div><div>${esc(t.assignee_name)} ${t.covered ? `<span class="tag acc">顶岗 · 原 ${esc(t.orig_name)}</span>` : ''}</div>
    <div>状态</div><div>${statusTag(t)} ${checkTag(t)}</div>
    ${t.done_note ? `<div>完成说明</div><div>${esc(t.done_note)}</div>` : ''}
    ${t.check_result ? `<div>抽查</div><div>${esc(t.checker_name)}：${esc(t.check_comment)} <span class="muted small">${esc(t.checked_at)}</span></div>` : ''}
  </div>${t.photo ? `<img class="photo" src="${esc(t.photo)}" alt="现场照片">` : ''}
  ${t.rects.map(r => `<div class="note"><b>整改</b> ${rectStatus(r)}：${esc(r.task)}（截止 ${esc(r.deadline)}，责任人 ${esc(r.assignee_name)}）${r.submit_note ? '<br>反馈：' + esc(r.submit_note) : ''}</div>`).join('')}
  ${manage ? `<h2>店长操作</h2><div class="row">
    ${t.status === 'pending' ? `<select id="re">${userOptions(t.store_id, t.assignee_id)}</select><button class="btn sm" id="reb">临时改派</button><button class="btn sm" id="cmp">代为完成</button>` : ''}
    ${t.status === 'done' && !t.check_result ? `<button class="btn primary sm" id="chk">${t.m === 'M2' ? '复查' : '抽查'}</button>` : ''}</div>` : ''}`, m => {
    const reb = m.querySelector('#reb');
    if (reb) reb.onclick = () => act(async () => { await api(`/instances/${t.id}/reassign`, { user_id: m.querySelector('#re').value }); closeModal(); route(); }, '已改派');
    const cmp = m.querySelector('#cmp'); if (cmp) cmp.onclick = () => completeModal(t);
    const chk = m.querySelector('#chk'); if (chk) chk.onclick = () => checkModal(t);
  });
}
function checkModal(t) {
  modal((t.m === 'M2' ? '复查：' : '抽查：') + t.title, `<div class="kv"><div>执行人</div><div>${esc(t.assignee_name)}</div><div>完成时间</div><div class="mono">${esc(t.done_at || '-')}</div>
    ${t.code ? `<div>品牌标准</div><div>No.${esc(t.code)} · ${esc(t.tag || '')} · ${M_DESC[t.m] || ''}</div>` : ''}${t.reading ? `<div>计量读数</div><div>${esc(t.reading)}</div>` : ''}
    <div>标准</div><div class="pre">${esc(t.standard || '-')}</div>${t.done_note ? `<div>完成说明</div><div>${esc(t.done_note)}</div>` : ''}</div>
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
VIEWS.desk = async () => {
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
  $('#main').innerHTML = `<h1>今日待办 <span class="muted small" style="font-weight:400">${esc(S.me.today)} · 现在 ${esc(S.me.now)}</span></h1>
  <div class="grid g3">${d.today.map(s => `<div class="card"><div class="row between"><b>${esc(s.name)}</b><a class="small" href="#/tasks?store=${s.id}">任务看板</a></div>
    <div style="margin:8px 0">${rateBar(s.rate)}</div>
    <div class="row small"><span>今日 ${s.done}/${s.total}</span><span class="tag ${s.overdue ? 'bad' : ''}">超时 ${s.overdue}</span><span class="tag">已抽查 ${s.checked}</span><span class="tag ${s.rect_late ? 'bad' : ''}">整改未闭环 ${s.rect_open}</span></div>
    <div class="muted small" style="margin-top:6px">近 7 日完成率 ${d.period.find(x => x.id === s.id)?.rate ?? '-'}% · 抽查合格率 ${d.period.find(x => x.id === s.id)?.pass_rate ?? '-'}%</div></div>`).join('')}</div>
  <div class="grid g2" style="margin-top:12px">
    <div class="list"><div class="hd">随机抽查建议 <span class="muted small" style="font-weight:400">从今日已完成、未抽查的 ${unchecked.length} 项中随机选取</span><span class="sp"></span><a class="small" href="javascript:route()">换一批</a></div>
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
  S.tf ||= {};
  const F = [['all', '全部', () => true], ['mine', '已指定到人', t => t.explicit], ['std', '品牌标准', t => t.code], ['photo', '需拍照', t => t.need_photo]];
  const f = F.some(x => x[0] === S.tf.asg) ? S.tf.asg : 'all';
  const fn = F.find(x => x[0] === f)[2];
  const row = t => `<div class="arow"><div class="gt">${esc(t.title)}${qm(t, 'tp')}</div>
    <div class="gl">${icon('clock')}${esc(t.due_time)}<span class="gsep">·</span>${freqText(t.freq, t.freq_val)}<span class="gsep">·</span>${esc(t.role_name || '')}${t.code ? `<span class="tag">${esc(t.code)}</span>` : ''}${t.category === 'sales' ? '<span class="tag">销售</span>' : ''}${t.need_photo ? '<span class="tag">需拍照</span>' : ''}</div>
    <label class="asel"><span>执行人</span><select data-tpl="${t.id}" ${manage ? '' : 'disabled'}>${userOptions(sid, t.explicit ? t.user_id : '', { blank: '按岗位默认（' + (t.user_name || '无') + '）' })}</select></label></div>`;
  const scenes = S.meta.scenes.map(sc => ({ sc, own: d.owners.find(o => o.scene_id === sc.id), all: d.templates.filter(t => t.scene_id === sc.id) })).map(x => ({ ...x, tpls: x.all.filter(fn) }));
  const body = ({ sc, tpls }) => {
    if (tpls.length <= 6) return tpls.map(row).join('');
    const kinds = {}; tpls.forEach(t => (kinds[kindOf(t)] ||= []).push(t));
    return Object.entries(kinds).sort((a, b) => (a[0] === '其他') - (b[0] === '其他') || b[1].length - a[1].length).map(([k, xs]) => {
      const id = `asg:${sc.id}:${k}`;
      return `<details class="tgrp sub" data-k="${esc(id)}" ${S.open[id] ? 'open' : ''}><summary><span>${k}</span><em>${xs.length} 项</em></summary><div class="tgb">${xs.map(row).join('')}</div></details>`;
    }).join('');
  };
  $('#main').innerHTML = `<div class="row between"><h1>场景分配<button type="button" class="qm" id="asgHelp" aria-label="说明">?</button></h1>${storeSwitch('#/assign')}</div>
  <div class="tfil" data-tf="asg">${F.map(([k, l, g]) => `<a data-f="${k}" class="${f === k ? 'on' : ''}">${l}<small>${d.templates.filter(g).length}</small></a>`).join('')}</div>
  ${scenes.map((x, i) => {
    const id = `asg:${x.sc.id}`, open = S.open[id] ?? (i === 0);
    const own = x.own?.user_id ? userName(x.own.user_id) : '';
    const n = x.all.filter(t => t.explicit).length;
    return `<details class="tgrp scn" data-k="${id}" ${open ? 'open' : ''}><summary><span>${esc(x.sc.name)}</span><em>${x.tpls.length}${f === 'all' ? '' : '/' + x.all.length} 项</em>${own ? `<span class="own">${esc(own)}</span>` : '<span class="own none">未指定负责人</span>'}</summary>
      <div class="ahead"><label class="asel"><span>场景负责人</span><select data-owner="${x.sc.id}" ${manage ? '' : 'disabled'}>${userOptions(sid, x.own?.user_id, { blank: '未指定' })}</select></label>
      ${manage ? `<button class="btn sm" data-apply="${x.sc.id}">整场景交给负责人</button>` : ''}</div>
      ${n ? `<div class="muted small ahint">已单独指定到人 ${n} 项</div>` : ''}
      <div class="tgb">${x.tpls.length ? body(x) : `<div class="empty">${x.all.length ? '没有符合筛选的工作' : '该场景暂无固定工作'}</div>`}</div></details>`;
  }).join('')}`;
  $('#asgHelp').onclick = () => modal('场景分配说明', '<div class="stdtxt">固定运营工作按场景归类。店长为每个场景指定负责人，也可以把单项工作指给具体的人；没有单独指定的，按岗位默认分配给对应的人。\n调整后从今天起未完成的任务立即生效，执行人会收到通知。</div>');
  bindBoard();
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
    <td>${u.level === 'staff' ? `<button class="btn sm danger" data-off="${u.id}">离职 / 调岗</button>` : ''}</td></tr>`; }).join('')}</table></div>`;
  $('#f').onsubmit = async e => { e.preventDefault(); if (await act(() => api('/users', { ...formData(e.target), store_id: sid }), '已添加')) { await loadMeta(); route(); } };
  document.querySelectorAll('[data-role]').forEach(s => s.onchange = () => act(async () => { await api('/users', { id: Number(s.dataset.role), role_id: Number(s.value) }); await loadMeta(); }, '岗位已更新'));
  document.querySelectorAll('[data-off]').forEach(b => b.onclick = () => handoffModal(Number(b.dataset.off)));
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
  <div class="dcards">${d.today.map(s => { const p = d.period.find(x => x.id === s.id); return `<a class="dcard" href="#/tasks?store=${s.id}"><div class="dc-h"><b>${esc(s.name)}</b><span class="muted small">店长 ${esc(s.managers.join('、'))}</span><i>›</i></div>
    <div class="dbars"><div><span>今日完成率</span>${rateBar(s.rate)}</div><div><span>近 ${days} 日完成率</span>${rateBar(p.rate)}</div></div>
    <div class="dkv">${[['今日超时', s.overdue, s.overdue], ['迟交', p.late], ['抽查合格率', p.pass_rate == null ? '-' : p.pass_rate + '%'], ['整改未闭环', p.rect_open], ['整改逾期', p.rect_late, p.rect_late], ['重点跟踪', p.focus_total ? p.focus_done + '/' + p.focus_total : '-']]
      .map(([l, v, b]) => `<div class="${b ? 'bad' : ''}"><b>${v}</b><span>${l}</span></div>`).join('')}</div></a>`; }).join('')}</div>
  <div class="grid g2" style="margin-top:12px">
    <div class="card"><h3>区域每日完成率</h3><div class="chart">${d.trend.map(t => `<div class="c"><span>${t.rate ?? '-'}</span><i style="height:${(t.rate || 0) * 0.8 / max * 100}%;${t.rate !== null && t.rate < 85 ? 'background:var(--warn)' : ''}"></i><span>${t.date.slice(5)}</span></div>`).join('')}</div></div>
    <div class="card"><h3>各场景完成情况</h3>${d.scenes.filter(s => s.total).map(s => `<div class="row" style="margin:6px 0;flex-wrap:nowrap"><span class="lbl">${esc(s.name)}</span><div style="flex:1;min-width:0">${rateBar(s.rate)}</div><span class="small muted nw">不合格 ${s.bad || 0}</span></div>`).join('') || '<div class="empty">无数据</div>'}</div>
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
    <label class="f"><span>类型</span><select name="kind"><option value="patrol">例行巡店（提前通知店长）</option><option value="mystery">神秘访客（不通知，按宾客视角检查）</option></select></label>
    <label class="f"><span>巡店重点</span><textarea name="reason">${esc(reason || '')}</textarea></label>
    <div class="row"><span class="sp"></span><button class="btn primary">加入计划</button></div></form>`, m => {
    m.querySelector('#f').onsubmit = async e => { e.preventDefault(); if (await act(() => api('/patrols', formData(e.target)), '已加入计划')) { closeModal(); location.hash = '#/patrol'; } };
  });
}

// ---------- patrol ----------
VIEWS.patrol = async id => {
  if (id) return patrolDetail(Number(id));
  const list = await api('/patrols');
  const rm = S.me.level === 'region_manager', ops = S.me.level === 'ops_manager';
  const planned = list.filter(p => p.status === 'planned'), done = list.filter(p => p.status === 'done');
  const pr = p => `<div class="task"><div class="b"><div class="ttl">${esc(p.store_name)} ${p.kind === 'recheck' ? '<span class="tag warn">复查</span>' : p.kind === 'mystery' ? '<span class="tag acc">神秘访客</span>' : ''}${p.planned_date < S.me.today ? '<span class="tag bad">已过期</span>' : p.planned_date === S.me.today ? '<span class="tag acc">今天</span>' : ''}</div>
    <div class="muted small">${esc(p.planned_date)} · ${esc(p.reason || '例行巡店')}</div></div>
    <div class="row" style="gap:6px;flex:none">${rm || (['recheck', 'mystery'].includes(p.kind) && ops) ? `<a class="btn sm primary" href="#/patrol/${p.id}">${p.kind === 'recheck' ? '开始复查' : p.kind === 'mystery' ? '开始暗访' : '开始巡店'}</a>${rm ? `<button class="btn sm" data-cancel="${p.id}">取消</button>` : ''}` : `<a class="btn sm" href="#/patrol/${p.parent_id || p.id}">查看</a>`}</div></div>`;
  const dr = p => `<a class="task" href="#/patrol/${p.id}"><div class="b"><div class="ttl">${esc(p.store_name)} ${p.kind === 'recheck' ? '<span class="tag warn">复查</span>' : p.kind === 'mystery' ? '<span class="tag acc">神秘访客</span>' : p.recheck_result ? `<span class="tag ok">复查 ${esc(p.recheck_result)}</span>` : ''}</div>
    <div class="muted small">${esc(p.done_at)} · ${esc(p.creator_name || '')}</div><div class="small clamp2">${esc(p.summary)}</div></div><b class="pscore" style="${p.score < 85 ? 'color:var(--bad)' : ''}">${p.score}</b></a>`;
  $('#main').innerHTML = `<div class="pghd row between"><b>${rm ? '巡店计划' : '巡店与复查'}</b>${rm ? '<button class="btn primary sm" id="np">新增巡店计划</button>' : ''}</div>
  ${rm ? '<p class="small"><a href="#/issues">从问题门店筛选 ›</a></p>' : ''}
  <div class="sec-t2">待巡店 · 待复查 ${planned.length}</div><div class="list">${planned.map(pr).join('') || '<div class="empty">暂无巡店计划</div>'}</div>
  <div class="sec-t2">巡店报告 ${done.length}</div><div class="list">${done.map(dr).join('') || '<div class="empty">暂无巡店报告</div>'}</div>`;
  if (rm) $('#np').onclick = () => planModal(S.store, '');
  if (rm && qs().get('new')) planModal(Number(qs().get('store')) || S.store, '');
  document.querySelectorAll('[data-cancel]').forEach(b => b.onclick = () => confirm('取消该巡店计划？') && act(async () => { await api('/patrols/' + b.dataset.cancel, null, 'DELETE'); route(); }, '已取消'));
};
async function patrolDetail(id) {
  const p = await api('/patrols/' + id);
  const rm = S.me.level === 'region_manager', recheck = p.kind === 'recheck', mystery = p.kind === 'mystery';
  const canDo = p.status === 'planned' && (rm || ((recheck || mystery) && S.me.level === 'ops_manager'));
  if (canDo) {
    const std = await api('/standards?store=' + p.store_id);
    const codes = recheck ? new Set((p.codes || '').split(',')) : null;
    const base = std.rows.filter(c => c.active && (!codes || codes.has(String(c.code))));
    const prev = recheck && p.parent_id ? await api('/patrols/' + p.parent_id) : null;
    const pcm = Object.fromEntries((prev?.items || []).map(i => [String(i.code), i]));
    const scenes = [...new Set(base.map(c => c.scene_name))];
    const MODES = [['full', `全量审计 ${base.length} 条`], ['quick', '快速巡检'], ['scene', '专项（按场景）']];
    const st = { mode: mystery ? 'mystery' : 'full', scene: scenes[0] };
    const guest = base.filter(c => ['前台', '客房', '餐厅', '公区'].includes(c.scene_name) && c.tag !== '基础项');
    const pick = () => recheck ? base : mystery ? (guest.length >= 10 ? guest : base.filter(c => ['前台', '客房', '餐厅', '公区'].includes(c.scene_name))) : st.mode === 'full' ? base : st.mode === 'scene' ? base.filter(c => c.scene_name === st.scene)
      : base.filter(c => c.tag === '清零项' || c.tag === '重点项' || c.last_patrol === 'fail' || c.n_bad);
    const draw = () => {
      const rows = pick(), groups = {};
      for (const c of rows) (groups[c.scene_name] ||= []).push(c);
      $('#main').innerHTML = `<div class="pghd"><b>${recheck ? '巡店复查' : mystery ? '神秘访客检查' : '品牌审计巡店'} · ${esc(p.store_name)}</b></div>
      <p class="muted small" style="margin-top:-6px">计划 ${esc(p.planned_date)} · ${esc(p.reason || '例行巡店')}。${recheck ? '只复查上次不达标的项，通过后对应整改自动闭环。' : '默认达标；不达标项必须写明问题，可拍照，并默认现场生成整改任务。'}</p>
      ${mystery ? '<p class="muted small">按宾客视角检查前台、客房、餐厅、公区的清零项和重点项；店长事先不知情，结果单独计分（占品牌标准分 30%）。</p>' : ''}${recheck || mystery ? '' : `<div class="tfil">${MODES.map(([k, l]) => `<a class="${st.mode === k ? 'on' : ''}" data-md="${k}">${l}</a>`).join('')}</div>
      ${st.mode === 'scene' ? `<div class="tfil">${scenes.map(s => `<a class="${st.scene === s ? 'on' : ''}" data-scn="${esc(s)}">${esc(s)}</a>`).join('')}</div>` : ''}
      ${st.mode === 'quick' ? '<p class="muted small">快速巡检：清零项、重点项、上次巡店不达标、近 14 天抽查不合格的条款。</p>' : ''}`}
      <div class="scorebox" id="sb"></div>
      <form id="f">${Object.entries(groups).map(([sc, cs], gi) => `<details class="pg" ${gi === 0 || recheck ? 'open' : ''}><summary><b>${esc(sc)}</b><span class="muted small">${cs.length} 条</span><span class="sp"></span><span class="gf" data-gf="${esc(sc)}"></span></summary>
        ${cs.map(c => `<div class="pi" data-code="${c.code}" data-max="${/^\d+$/.test(c.score) ? c.score : 0}" data-tag="${esc(c.tag)}" data-sc="${esc(sc)}">
          <div class="pt"><span class="tag std">No.${c.code}</span> <b>${esc(c.title)}</b> ${c.tag !== '基础项' ? `<span class="tag ${TAG_CLS[c.tag] ?? ''}">${esc(c.tag)}</span>` : ''} <span class="muted small">${/^\d+$/.test(c.score) ? c.score + ' 分' : ''}</span>
            ${c.last_patrol === 'fail' && !recheck ? '<span class="tag warn">上次不达标</span>' : ''}${c.n_bad ? `<span class="tag warn">近14日抽查不合格 ${c.n_bad}</span>` : ''}</div>
          ${recheck && pcm[c.code] ? `<div class="small" style="color:var(--bad)">上次问题：${esc(pcm[c.code].comment)}${pcm[c.code].rect_status ? ` · 整改${({ open: '未提交', submitted: '已提交待复查', closed: '已闭环' })[pcm[c.code].rect_status] || ''}` : ''}</div>` : ''}
          <details class="sd"><summary>检查标准</summary><div class="pre small">${esc(c.standard)}</div></details>
          <div class="seg3">${[['pass', recheck ? '已整改' : '达标'], ['fail', '不达标'], ['na', '不适用']].map(([v, l]) => `<label><input type="radio" name="r${c.code}" value="${v}" ${v === 'pass' ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
          <div class="pfail" style="display:none"><input class="pc" name="c${c.code}" placeholder="问题描述（不达标必填）">
            <div class="row" style="gap:8px;margin-top:6px"><label class="btn sm">拍照<input type="file" accept="image/*" capture="environment" name="ph${c.code}" hidden></label><span class="muted small" data-phn="${c.code}"></span>
            ${recheck ? '' : `<label class="chk small" style="margin-left:auto"><input type="checkbox" name="k${c.code}" checked> 生成整改任务</label>`}</div></div></div>`).join('')}</details>`).join('') || '<div class="empty">没有符合条件的条款</div>'}
      <label class="f" style="margin-top:12px"><span>${recheck ? '复查结论' : '巡店结论'}</span><textarea name="summary" required placeholder="${recheck ? '整改落实情况、仍存在的问题' : '总体评价、主要问题、整改要求'}"></textarea></label>
      <p class="muted small">${recheck ? '' : `提交后：报告推送店长和运营经理${p.owner ? `，加盟店同步业主 ${esc(p.owner)}` : ''}；不达标项生成整改，并自动安排 ${p.recheck_days} 天后复查。`}</p>
      <div class="row"><span class="sp"></span><button class="btn primary">${recheck ? '提交复查结果' : '提交巡店报告'}</button></div></form>`;
      document.querySelectorAll('[data-md]').forEach(a => a.onclick = () => { st.mode = a.dataset.md; draw(); });
      document.querySelectorAll('[data-scn]').forEach(a => a.onclick = () => { st.scene = a.dataset.scn; draw(); });
      document.querySelectorAll('.pi input[type=file]').forEach(f => f.onchange = () => { document.querySelector(`[data-phn="${f.name.slice(2)}"]`).textContent = f.files[0] ? '已选 1 张' : ''; });
      const calc = () => {
        let e = 0, mx = 0, fail = 0, na = 0; const zero = [], gf = {};
        document.querySelectorAll('.pi').forEach(el => {
          const v = el.querySelector('input[type=radio]:checked').value, m = Number(el.dataset.max);
          el.classList.toggle('bad', v === 'fail'); el.querySelector('.pfail').style.display = v === 'fail' ? '' : 'none';
          if (v === 'na') { na++; return; }
          mx += m; if (v === 'pass') e += m; else { fail++; gf[el.dataset.sc] = (gf[el.dataset.sc] || 0) + 1; if (el.dataset.tag === '清零项') zero.push(el.dataset.code); }
        });
        const sc = zero.length ? 0 : Math.round(e * 100 / (mx || 1));
        $('#sb').innerHTML = `<div><b class="${zero.length || sc < 85 ? 'bad' : ''}">${sc}</b><span>${recheck ? '通过率' : '预估得分'}</span></div><div><b>${fail}</b><span>不达标</span></div><div><b>${na}</b><span>不适用</span></div><div><b class="${zero.length ? 'bad' : ''}">${zero.length}</b><span>清零项</span></div>`;
        document.querySelectorAll('[data-gf]').forEach(x => { const n = gf[x.dataset.gf]; x.innerHTML = n ? `<span class="tag bad">不达标 ${n}</span>` : ''; });
      };
      $('#f').onchange = calc; calc();
      $('#f').onsubmit = async ev => {
        ev.preventDefault(); const d = formData(ev.target), results = {}, f = ev.target;
        for (const c of rows) {
          const r = { result: d['r' + c.code], comment: d['c' + c.code] };
          if (r.result === 'fail') { const fi = f.querySelector(`[name="ph${c.code}"]`); if (fi?.files[0]) r.photo = await compressImage(fi.files[0]); if (!recheck) r.rect = !!d['k' + c.code]; }
          results[c.code] = r;
        }
        if (await act(() => api(`/patrols/${id}/complete`, { summary: d.summary, results, mode: st.mode }), recheck ? '复查结果已提交' : '巡店报告已提交')) route();
      };
    };
    draw();
    return;
  }
  const owner = qs().get('owner') === '1';
  const items = p.items.map(i => ({ ...i, result: i.result || (i.score < i.max ? 'fail' : 'pass') }));
  const fails = items.filter(i => i.result === 'fail'), zero = fails.filter(i => i.tag === '清零项');
  const groups = {};
  for (const i of items) (groups[i.scene_name || '其他'] ||= []).push(i);
  const RS = { open: ['warn', '整改中'], submitted: ['acc', '待复查'], closed: ['ok', '已闭环'] };
  const focusBtn = i => (rm && !owner ? `<a class="btn sm" href="#/focus?${new URLSearchParams({ new: 1, store: p.store_id, scene: i.scene_id || '', title: '每日检查：' + (i.code ? `No.${i.code} ` : '') + i.item, standard: i.comment ? '针对巡店问题：' + i.comment : '', ref: 'patrol:' + p.id })}">转为重点跟踪</a>` : '');
  const MODE_L = { full: '全量审计', quick: '快速巡检', scene: '专项', recheck: '复查', mystery: '神秘访客' };
  if (p.status !== 'done') { $('#main').innerHTML = `<div class="pghd"><b>${recheck ? '巡店复查' : '巡店计划'} · ${esc(p.store_name)}</b></div><p class="muted">计划 ${esc(p.planned_date)}：${esc(p.reason)}</p>${recheck ? `<p class="small"><a href="#/patrol/${p.parent_id}">查看原巡店报告 ›</a></p>` : ''}`; return; }
  const rc = p.recheck;
  $('#main').innerHTML = `<div class="pghd"><b>${owner ? '业主版巡店报告' : recheck ? '巡店复查结果' : '巡店报告'} · ${esc(p.store_name)}</b></div>
  <div class="scorebox"><div><b class="${zero.length || p.score < 85 ? 'bad' : ''}">${p.score}</b><span>${recheck ? '通过率' : '总分'}</span></div><div><b>${fails.length}</b><span>不达标</span></div><div><b>${items.filter(i => i.result === 'na').length}</b><span>不适用</span></div><div><b class="${zero.length ? 'bad' : ''}">${zero.length}</b><span>清零项</span></div></div>
  <p class="muted small">${MODE_L[p.mode] || '全量审计'} · 完成于 ${esc(p.done_at)}${zero.length ? ' · <b style="color:var(--bad)">触发清零项，总分记 0</b>' : ''}${p.owner_sent ? ` · 已同步业主 ${esc(p.owner || '')}` : ''}</p>
  ${!recheck && fails.length ? `<div class="ldr"><div class="row between"><b>整改与复查</b>${rc ? `<a class="small" href="#/patrol/${rc.id}">${rc.status === 'done' ? '复查结果 ›' : (rm || S.me.level === 'ops_manager') && !owner ? '开始复查 ›' : '复查详情 ›'}</a>` : ''}</div>
    <div class="wgrid">${[['整改任务', fails.filter(i => i.rect_id).length, '项'], ['已闭环', fails.filter(i => i.rect_status === 'closed').length, '项'], ['复查', rc ? (rc.status === 'done' ? p.recheck_result || '已完成' : rc.planned_date.slice(5)) : '-', '']].map(([l, v, u]) => `<div><b>${v}<small>${u}</small></b><span>${l}</span></div>`).join('')}</div></div>` : ''}
  ${recheck && p.parent ? `<p class="small"><a href="#/patrol/${p.parent_id}">原巡店报告（${esc(p.parent.done_at)}，${p.parent.score} 分）›</a></p>` : ''}
  <div class="note" style="margin-bottom:12px"><b>${recheck ? '复查结论' : '巡店结论'}</b><br>${esc(p.summary)}</div>
  <h2>不达标项（${fails.length}）</h2><div class="list">${fails.map(i => `<div class="task"><div class="b"><div class="ttl">${i.code ? `<span class="tag std">No.${esc(i.code)}</span> ` : ''}${esc(i.item)} ${i.tag && i.tag !== '基础项' ? `<span class="tag ${TAG_CLS[i.tag] ?? ''}">${esc(i.tag)}</span>` : ''}</div>
    <div class="muted small">${esc(i.scene_name || '')} · ${i.max} 分${i.rect_id && !owner ? ` · 整改人 ${esc(i.rect_assignee || '')} · ${esc(i.rect_deadline || '')} 截止` : ''}</div>
    <div class="small" style="color:var(--bad)">${esc(i.comment)}</div>${i.photo ? `<img class="photo" src="${esc(i.photo)}" alt="问题照片">` : ''}
    ${i.recheck ? `<div class="small">复查：${i.recheck === 'pass' ? '<span class="tag ok">已整改</span>' : `<span class="tag bad">仍不达标</span> ${esc(i.recheck_comment || '')}`}</div>` : ''}</div>
    <div class="row" style="gap:6px;flex-direction:column;align-items:flex-end">${i.rect_status ? `<span class="tag ${RS[i.rect_status][0]}">${RS[i.rect_status][1]}</span>` : ''}${focusBtn(i)}</div></div>`).join('') || '<div class="empty">全部达标</div>'}</div>
  ${owner ? '' : `<h2>逐项结果</h2>${Object.entries(groups).map(([sc, is]) => `<details class="pg"><summary><b>${esc(sc)}</b><span class="muted small">${is.filter(i => i.result === 'pass').length}/${is.filter(i => i.result !== 'na').length} 达标</span></summary>
    ${is.map(i => `<div class="pr"><span class="tag std">${i.code ? 'No.' + esc(i.code) : ''}</span> ${esc(i.item)}<span class="sp"></span>${i.result === 'pass' ? '<span class="tag ok">达标</span>' : i.result === 'na' ? '<span class="tag">不适用</span>' : '<span class="tag bad">不达标</span>'}</div>`).join('')}</details>`).join('')}
  ${p.focus.length ? `<h2>由本次巡店下发的重点跟踪</h2>${p.focus.map(f => `<div><a href="#/focus">${esc(f.title)}</a> ${f.active ? '<span class="tag ok">跟踪中</span>' : '<span class="tag">已停用</span>'}</div>`).join('')}` : ''}`}
  <div class="row" style="gap:8px;margin-top:12px">${p.owner && !recheck ? (owner ? `<a class="btn sm" href="#/patrol/${p.id}">完整报告</a>` : `<a class="btn sm" href="#/patrol/${p.id}?owner=1">业主版报告</a>`) : ''}${fails.some(i => i.rect_id) && !owner ? `<a class="btn sm" href="#/rect">整改闭环</a>` : ''}</div>
  ${owner ? `<p class="muted small">业主版只展示得分、问题、照片和整改进度，不含内部逐项明细。</p>` : ''}`;
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
  const tpls = (await api('/templates')).filter(t => t.src !== 'audit');
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
    <div class="card"><h3>品牌标准 / 巡店评分表</h3><p class="small">已融合《品牌审计线下检查标准 2026Q3（全季）》${st.audit_count} 条及 M-L-F 分解：自动生成门店固定工作，巡店按同一套条款打分。</p><a class="btn" href="#/standards">打开品牌标准库</a></div>
  </div>
  <div class="row between" style="margin-top:20px"><h2 style="margin:0">日常运营工作清单</h2><button class="btn primary" id="nt">新增固定工作</button></div>
  <p class="muted small">按场景和岗位定义每天、每周或每月要做的标准工作。各门店自动生成，由店长分配到人。品牌审计 ${st.audit_count} 条在 <a href="#/standards">品牌标准库</a> 维护。</p>
  <div class="tbl"><table><tr><th>场景</th><th>时间</th><th>工作内容</th><th>默认岗位</th><th>频次</th><th>类别</th><th></th></tr>
  ${tpls.map(t => `<tr style="${t.active ? '' : 'opacity:.5'}"><td>${esc(t.scene_name)}</td><td class="mono">${esc(t.due_time)}</td><td>${esc(t.title)} ${t.need_photo ? '<span class="tag">需拍照</span>' : ''}<div class="muted small">${esc(t.standard)}</div></td>
    <td>${esc(t.role_name)}</td><td>${freqText(t.freq, t.freq_val)}</td><td>${t.category === 'sales' ? '销售' : '运营'}</td><td><button class="btn sm" data-et="${t.id}">编辑</button></td></tr>`).join('')}</table></div>`;
  const reload = async () => { await loadMeta(); route(); };
  $('#fr').onsubmit = async e => { e.preventDefault(); if (await act(() => api('/roles', formData(e.target)), '岗位已新增')) reload(); };
  $('#fs').onsubmit = async e => { e.preventDefault(); if (await act(() => api('/scenes', formData(e.target)), '场景已新增')) reload(); };
  document.querySelectorAll('[data-sc]').forEach(a => a.onclick = () => confirm('停用该场景？其下固定工作将不再生成') && act(async () => { await api('/scenes', { id: Number(a.dataset.sc), active: 0 }); reload(); }, '已停用'));
  $('#fm').onsubmit = async e => { e.preventDefault(); const d = formData(e.target); if (await act(() => api('/settings', { reminder_times: d.times.split(/[,，\s]+/).filter(Boolean), escalate_minutes: d.esc }), '已保存')) reload(); };
  const edit = tplEdit;
  $('#nt').onclick = () => edit({});
  document.querySelectorAll('[data-et]').forEach(b => b.onclick = () => edit(tpls.find(t => t.id === Number(b.dataset.et))));
};
function tplEdit(t, after) {
  modal(t.id ? '编辑固定工作' : '新增固定工作', `<form id="ft"><div class="form2">
    <label class="f"><span>场景</span><select name="scene_id">${sceneOptions(t.scene_id)}</select></label>
    <label class="f"><span>默认岗位</span><select name="role_id">${S.meta.roles.filter(r => ['staff', 'store_manager'].includes(r.level)).map(r => `<option value="${r.id}" ${r.id === t.role_id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label></div>
    <label class="f"><span>工作内容</span><input name="title" value="${esc(t.title || '')}" required></label>
    <label class="f"><span>完成标准</span><textarea name="standard">${esc(t.standard || '')}</textarea></label>
    <div class="form2"><label class="f"><span>完成时间</span><input type="time" name="due_time" value="${t.due_time || '09:00'}"></label>
    <label class="f"><span>频次</span><select name="freq">${[['daily', '每日'], ['weekly', '每周'], ['monthly', '每月']].map(([k, l]) => `<option value="${k}" ${t.freq === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="f"><span>周几（1-7） / 每月几号</span><input type="number" name="freq_val" value="${t.freq_val || ''}" min="1" max="31"></label>
    <label class="f"><span>类别</span><select name="category"><option value="ops">运营</option><option value="sales" ${t.category === 'sales' ? 'selected' : ''}>销售</option></select></label></div>
    ${t.src === 'audit' ? `<div class="form2"><label class="f"><span>M 分工模式</span><select name="m">${Object.entries(M_DESC).map(([k, l]) => `<option value="${k}" ${t.m === k ? 'selected' : ''}>${k} ${l}</option>`).join('')}</select></label>
    <label class="f"><span>F 反馈机制（如 F1+F2）</span><input name="f" value="${esc(t.f || 'F1')}"></label></div><label class="f"><input type="checkbox" name="need_value" ${t.need_value ? 'checked' : ''}> 需要填写计量读数（F3）</label>` : ''}
    <label class="f"><input type="checkbox" name="need_photo" ${t.need_photo ? 'checked' : ''}> 需要拍照留证</label>
    ${t.id ? `<label class="f"><input type="checkbox" name="active" ${t.active ? 'checked' : ''}> 启用</label>` : ''}
    <div class="row"><span class="sp"></span><button class="btn primary">保存</button></div></form>`, m => {
    m.querySelector('#ft').onsubmit = async e => { e.preventDefault(); const d = formData(e.target);
      if (await act(() => api('/templates', { ...d, id: t.id, active: t.id ? (d.active ? 1 : 0) : 1 }), '已保存')) { closeModal(); route(); } };
  });
}

// ---------- audit ----------
VIEWS.audit = async () => {
  const list = await api('/audit');
  $('#main').innerHTML = `<h1>操作日志</h1><p class="muted small" style="margin-top:-6px">分配、顶岗、抽查、整改、巡店等关键操作都会留痕，方便追溯。</p>
  <div class="tbl"><table><tr><th>时间</th><th>操作人</th><th>门店</th><th>操作</th><th>内容</th></tr>
  ${list.map(a => `<tr><td class="mono">${esc(a.at)}</td><td>${esc(a.user_name)}</td><td>${esc(a.store_name || '区域')}</td><td>${esc(a.action)}</td><td class="small">${esc(a.detail)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">暂无</td></tr>'}</table></div>`;
};


// ---------- 宏图 home ----------
function gauge(rate, size, sw, color) {
  const r = (size - sw) / 2, c = 2 * Math.PI * r, arc = c * 0.75, v = rate == null ? 0 : Math.max(0.02, rate / 100) * arc;
  return `<svg class="gauge" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><g transform="rotate(135 ${size / 2} ${size / 2})">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${arc} ${c}"/>
    ${rate == null ? '' : `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${v} ${c}"/>`}</g></svg>`;
}
const rateColor = r => (r == null ? 'var(--track)' : r >= 90 ? 'var(--ring)' : r >= 75 ? 'var(--gold)' : 'var(--bad)');
const md = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const redNum = t => esc(t).replace(/(\d+)/, '<em>$1</em>');
const CN_WD = ['一', '二', '三', '四', '五', '六', '日'];
S.open = S.open || {};
VIEWS.home = async () => {
  const p = qs();
  const sid = pickStore(p.get('store'));
  const date = p.get('date') || S.me.today;
  const tab = p.get('tab') || 'day';
  const mode = p.get('m') || 'day';
  const [h, b] = await Promise.all([api(`/home?store=${sid}&date=${date}`), api(`/brief?store=${sid}&mode=${mode}`)]);
  const bt = p.get('bt') || (S.me.level === 'sales_manager' && b.biz ? 'biz' : b.biz && S.me.level !== 'staff' && S.me.level !== 'ops_manager' ? 'biz' : 'ops');
  const link = o => '#/home?' + new URLSearchParams({ store: sid, date, tab, m: mode, bt, pl: p.get('pl') || '', ...o });
  const br = bt === 'biz' && b.biz ? b.biz : b.ops;
  const full = h.tabs[tab];
  const pl = '';
  const list = pl ? full.filter(t => t.pillar === pl) : full;
  const cnt = k => `${h.tabs[k].filter(t => t.status === 'done').length}/${h.tabs[k].length}`;
  const done = list.filter(t => t.status === 'done');
  const ontime = done.filter(t => (t.done_at || '').slice(0, 10) < t.date || ((t.done_at || '').slice(0, 10) === t.date && t.done_at.slice(11, 16) <= t.due_time));
  const checked = list.filter(t => t.check_result), good = checked.filter(t => t.check_result === 'good');
  const R = (a, b2) => (b2.length ? Math.round(a.length * 100 / b2.length) : null);
  const PL = k => full.filter(t => t.pillar === k);
  const rings = [['完成率', R(done, list), `${done.length}/${list.length}`], ['准时率', R(ontime, done), `${ontime.length}/${done.length}`], ['合格率', R(good, checked), `${good.length}/${checked.length}`]];
  const groups = {};
  for (const t of list) {
    const key = tab === 'day' ? (t.scene_name || '其他') : tab === 'once' ? t.title : `${t.scene_name || '其他'}`;
    (groups[key] ||= []).push(t);
  }
  const gl = Object.entries(groups).map(([name, ts]) => ({ name, ts, time: ts.map(t => t.due_time).sort()[0], date: ts[0].date })).sort((x, y) => (tab === 'day' ? 0 : x.date.localeCompare(y.date)) || x.time.localeCompare(y.time));
  const mine = h.mine;
  const manage = S.me.can.manage;
  const stLabel = { day: '日任务', week: '周任务', month: '月任务', once: '非周期任务' };
  const multi = S.meta.stores.length > 1;
  const gKey = n => tab + ':' + n;
  const taskRow = t => `<div class="trow ${t.status === 'done' ? 'done' : ''}">
    <div class="tm">${tab === 'day' ? '' : `<small>${esc(t.date.slice(5))}</small>`}${esc(t.due_time)}</div>
    <div class="tb"><div class="tt">${esc(t.title)}${qm(t)} ${originTag(t.origin)} ${stdTags(t)} ${t.covered ? `<span class="tag acc">顶岗${mine ? ' · 替 ' + esc(t.orig_name) : ''}</span>` : ''} ${t.need_photo ? '<span class="tag">需拍照</span>' : ''}</div>
      <div class="ts">${mine ? esc(t.scene_name || '') : `${esc(t.assignee_name || '未分配')} · ${esc(t.assignee_role || '')}`}</div>
      <div class="tg">${statusTag(t)} ${checkTag(t)}</div></div>
    <div class="ta">${t.status === 'pending' && t.date <= S.me.today && (t.assignee_id === S.me.id || manage) ? `<button class="btn primary sm" data-done="${t.id}">完成</button>` : ''}
      ${manage && t.status === 'done' && !t.check_result ? `<button class="btn primary sm" data-chk="${t.id}">${t.m === 'M2' ? '复查' : '抽查'}</button>` : ''}
      <button class="btn sm" data-view="${t.id}">详情</button></div></div>`;
  $('#main').innerHTML = `
  <div class="storebar">
    <button class="storename" id="sp" ${multi ? '' : 'disabled'}>${esc(storeName(sid))}${multi ? '<i>▾</i>' : ''}</button>
    ${calMini(date)}
    <a class="ib" href="#/me">${icon('me')}<span>${esc(CENTER[S.me.level])}</span></a>
    <button class="ib" id="more">${icon('more')}<span>更多</span></button>
  </div>
  <section class="brief">
    <div class="btabs">${b.biz ? `<a href="${link({ bt: 'biz' })}" class="${bt === 'biz' ? 'on' : ''}">经营简报</a>` : ''}<a href="${link({ bt: 'ops' })}" class="${bt !== 'biz' || !b.biz ? 'on' : ''}">${mine ? '我的简报' : '运营简报'}</a>
      <span class="sp"></span><div class="seg"><a href="${link({ m: 'day' })}" class="${mode === 'day' ? 'on' : ''}">日</a><a href="${link({ m: 'week' })}" class="${mode === 'week' ? 'on' : ''}">周</a></div></div>
    <p class="headline">${md(br.headline)}</p>
    <div class="bcards">${br.items.map(it => `<a class="bcard ${it.level}" ${it.link ? `href="${esc(it.link)}"` : ''}><b>${it.level === 'bad' ? redNum(it.title) : esc(it.title)}</b><p>${esc(it.body)}</p></a>`).join('')}</div>
    <button class="aibtn" id="bd"><svg viewBox="0 0 20 20" class="ico"><path d="M10 2.5l1.6 4.6 4.9 1.4-4.9 1.4L10 14.5l-1.6-4.6-4.9-1.4 4.9-1.4zM15.5 13l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/></svg>简报详情</button>
  </section>
  <section class="tasks">
    <div class="ttabs">${['day', 'week', 'month', 'once'].map(k => `<a href="${link({ tab: k })}" class="${tab === k ? 'on' : ''}">${stLabel[k]}<small>${cnt(k)}</small></a>`).join('')}</div>
    <div class="rings">${rings.map(([l, r, c]) => `<div class="ring">${gauge(r, 92, 9, rateColor(r))}<div class="rv"><b>${r == null ? '-' : r}</b><small>${r == null ? '' : '%'}</small><span>${l}</span></div><em>${c}</em></div>`).join('')}</div>
    ${(() => { const z = list.filter(t => t.tag === '清零项'), b = list.filter(t => t.code); return b.length ? `<a class="stdbar" href="#/standards?store=${sid}"><span>品牌标准 <b>${b.filter(t => t.status === 'done').length}/${b.length}</b></span>${z.length ? `<span>清零项 <b class="${z.some(t => t.status !== 'done') ? 'bad' : ''}">${z.filter(t => t.status === 'done').length}/${z.length}</b></span>` : ''}<span class="sp"></span><span class="lk">品牌标准库 ›</span></a>` : ''; })()}
    <a class="stdbar feedbar" href="#/feed?store=${sid}&date=${date}"><span>${icon('cam')} 门店群拍墙</span><span class="sp"></span><span class="lk">M4 机制群拍 ›</span></a>
    <div class="timeline">${gl.length ? gl.map(g => {
      const d = g.ts.filter(t => t.status === 'done').length, od = g.ts.some(t => t.overdue);
      const open = S.open[gKey(g.name)] ?? (mine || gl.length <= 2);
      return `<div class="tl ${od ? 'od' : d === g.ts.length ? 'ok' : ''}"><i class="dot"></i>
        <div class="tcard" data-go="${esc(g.name)}"><div class="th"><b>${esc(g.name)}</b><span class="tt2">${tab === 'day' ? '' : esc(g.date.slice(5)) + ' '}${esc(g.time)}</span></div>
          <div class="tp"><span>已完成 <b>${d}/${g.ts.length}</b></span>${od ? '<span class="tag bad">有超时</span>' : ''}</div>
          <div class="segbar">${g.ts.map(t => `<i class="${t.status === 'done' ? 'd' : t.overdue ? 'b' : ''}"></i>`).join('')}</div>
          <div class="tmore">${g.ts.filter(t => t.status !== 'done').length ? `待完成 ${g.ts.filter(t => t.status !== 'done').length} 项` : '全部完成'} ›</div></div></div>`;
    }).join('') : `<div class="empty">${date > S.me.today ? '未来日期的任务会在当天生成' : `没有${stLabel[tab]}`}</div>`}</div>
  </section>`;
  if (multi) $('#sp').onclick = () => sheet(S.meta.stores.map(st => [esc(st.name) + (st.id === sid ? ' ✓' : ''), () => { location.hash = link({ store: st.id }); }]), '切换门店');
  $('#cal').onclick = () => calSheet(sid, date, d => { location.hash = link({ date: d }); });
  $('#more').onclick = e => moreMenu(e.currentTarget);
  document.querySelectorAll('[data-go]').forEach(el => el.onclick = () => { location.hash = '#/group?' + new URLSearchParams({ store: sid, date, tab, pl, g: el.dataset.go }); });
  $('#bd').onclick = () => modal(bt === 'biz' && b.biz ? '经营简报详情' : mine ? '我的简报详情' : '运营简报详情', `<p class="headline">${md(br.headline)}</p>
    ${br.items.map(it => `<div class="note"><b>${esc(it.title)}</b><br>${esc(it.body)} ${it.link ? `<a href="${esc(it.link)}" data-close>去处理</a>` : ''}</div>`).join('')}
    ${bt === 'biz' && b.biz ? '<p class="muted small">经营数据（RevPAR、出租率、平均房价、差评）为模拟数据，接入 PMS 和点评平台后自动更新。</p>' : `<p class="muted small">统计区间 ${esc(b.from)} 至 ${esc(b.to)}，与前一周同期对比。</p>`}`);
  document.querySelectorAll('[data-g]').forEach(el => el.onclick = () => { const k = el.dataset.g; const cur = el.parentElement.querySelector('.tlist'); S.open[k] = !cur; route(); });
  document.querySelectorAll('[data-done]').forEach(x => x.onclick = () => completeModal(list.find(t => t.id === Number(x.dataset.done))));
  document.querySelectorAll('[data-chk]').forEach(x => x.onclick = () => checkModal(list.find(t => t.id === Number(x.dataset.chk))));
  document.querySelectorAll('[data-view]').forEach(x => x.onclick = () => taskDetail(Number(x.dataset.view)));
};

// ---------- 品牌标准库 ----------
VIEWS.standards = async () => {
  const p = qs();
  const sid = pickStore(p.get('store'));
  const f = { scene: p.get('scene') || '', tag: p.get('tag') || '', m: p.get('m') || '', kw: p.get('kw') || '' };
  const d = await api('/standards?store=' + sid);
  const all = d.rows;
  const kw = f.kw.trim();
  const list = all.filter(c => (!f.scene || c.scene_name === f.scene) && (!f.tag || c.tag === f.tag) && (!f.m || c.m === f.m)
    && (!kw || c.code.includes(kw) || c.title.includes(kw) || (c.standard || '').includes(kw) || (c.sub || '').includes(kw)));
  const link = (k, v) => { const q = new URLSearchParams({ store: sid, ...f }); q.set(k, v); return '#/standards?' + q; };
  const cnt = (k, v) => all.filter(c => c[k] === v).length;
  const tab = (k, opts) => `<div class="tabs"><a href="${link(k, '')}" class="${!f[k] ? 'on' : ''}">全部</a>${opts.map(([v, l]) => `<a href="${link(k, v)}" class="${f[k] === v ? 'on' : ''}">${esc(l)} <span class="muted">${cnt(k === 'scene' ? 'scene_name' : k, v)}</span></a>`).join('')}</div>`;
  const scenes = [...new Set(all.map(c => c.scene_name))];
  const rate = c => (c.n_total ? Math.round(c.n_done * 100 / c.n_total) : null);
  const byScene = {};
  for (const c of list) (byScene[c.scene_name] ||= []).push(c);
  const rm = S.me.level === 'region_manager';
  $('#main').innerHTML = `<div class="row between"><h1>品牌标准库</h1>${storeSwitch('#/standards')}</div>
  <p class="muted small" style="margin-top:-6px">《品牌审计线下检查标准 2026Q3（全季）》M-L-F 分解 · 共 ${all.length} 条，已转为门店固定工作并用于巡店打分。执行情况为本店近 14 天（${esc(d.from.slice(5))} 起）。</p>
  <div class="panel stats">${['M1', 'M2', 'M3', 'M4'].map(m => `<a href="${link('m', f.m === m ? '' : m)}" class="${f.m === m ? 'on' : ''}"><b>${cnt('m', m)}</b><span>${m} ${M_TEXT[m]}</span></a>`).join('')}</div>
  ${tab('tag', ['清零项', '重点项', '关注项', '跟踪项', '基础项'].map(x => [x, x]))}
  ${tab('scene', scenes.map(x => [x, x]))}
  <form id="kw" class="row" style="margin:8px 0"><input name="kw" value="${esc(f.kw)}" placeholder="搜索条款号 / 关键词，如 018、早餐、布草" style="flex:1"><button class="btn sm">搜索</button></form>
  ${list.length ? Object.entries(byScene).map(([sc, cs]) => `<div class="list" style="margin-bottom:12px"><div class="hd">${esc(sc)}<span class="muted small" style="font-weight:400">${cs.length} 条</span></div>
    ${cs.map(c => { const r = rate(c); return `<div class="task std-row ${c.active ? '' : 'done'}" data-code="${c.code}"><div class="t mono">${c.code}</div><div class="b">
      <div class="ttl">${esc(c.title)} ${c.tag !== '基础项' ? `<span class="tag ${TAG_CLS[c.tag] ?? ''}">${esc(c.tag)}</span>` : ''} ${/^\d+$/.test(c.score) ? `<span class="muted small">${c.score} 分</span>` : ''}</div>
      <div class="row small" style="margin-top:3px"><span class="tag m">${esc(c.m)} ${M_TEXT[c.m]}</span><span class="tag">${esc(c.f)} ${fText(c.f)}</span><span class="muted">${esc(c.role_name || '')} · ${freqText(c.freq, c.freq_val)} ${esc(c.due_time)}</span></div>
      <div class="row small" style="margin-top:3px">${!c.active ? '<span class="tag">已停用</span>' : r === null ? '<span class="muted">近 14 天未排到</span>' : `<span class="tag ${r >= 90 ? 'ok' : r >= 70 ? 'warn' : 'bad'}">完成 ${c.n_done}/${c.n_total}</span>`}
        ${c.n_bad ? `<span class="tag bad">抽查不合格 ${c.n_bad}</span>` : ''}${c.last_patrol ? `<span class="tag ${c.last_patrol === 'fail' ? 'bad' : c.last_patrol === 'pass' ? 'ok' : ''}">上次巡店 ${{ pass: '达标', fail: '不达标', na: '不适用' }[c.last_patrol]}</span>` : ''}</div></div><div class="muted">›</div></div>`; }).join('')}</div>`).join('')
    : '<div class="list"><div class="empty">没有符合条件的条款</div></div>'}`;
  $('#kw').onsubmit = e => { e.preventDefault(); location.hash = link('kw', e.target.kw.value.trim()); };
  document.querySelectorAll('.std-row').forEach(el => el.onclick = () => {
    const c = all.find(x => x.code === el.dataset.code);
    modal(`No.${c.code} ${c.title}`, `<div class="kv"><div>目录</div><div>${esc(c.area)} › ${esc(c.sub)}</div><div>标签 / 分值</div><div>${esc(c.tag)}${/^\d+$/.test(c.score) ? ` · ${c.score} 分` : ''}${c.tag === '清零项' ? '（审计不达标整店清零）' : ''}</div>
      <div>M 分工</div><div>${esc(c.m)} ${M_DESC[c.m]}</div><div>L 层级</div><div>${esc(c.l || 'L1')} 动作层</div><div>F 反馈</div><div>${esc(c.f)} ${fText(c.f)}${c.need_photo ? ' · 需拍照' : ''}${c.need_value ? ' · 需填读数' : ''}</div>
      <div>门店执行</div><div>${esc(c.scene_name)} · ${esc(c.role_name || '')} · ${freqText(c.freq, c.freq_val)} ${esc(c.due_time)}（店长可在场景分配中调整到人）</div>
      ${c.note ? `<div>建议来源</div><div>${esc(c.note)}</div>` : ''}<div>检查标准</div><div class="pre">${esc(c.standard)}</div></div>
      <div class="row" style="margin-top:12px"><a class="btn" href="#/tasks?store=${sid}&m=${c.m}">查看今日任务</a><span class="sp"></span>${rm ? '<button class="btn primary" id="ed">调整频次 / 岗位</button>' : ''}</div>`, m => {
      const b = m.querySelector('#ed'); if (b) b.onclick = () => { closeModal(); tplEdit({ ...c }); };
    });
  });
};

// ---------- 门店群拍墙（M4 / F4） ----------
VIEWS.feed = async () => {
  const p = qs();
  const sid = pickStore(p.get('store'));
  const date = p.get('date') || S.me.today;
  const d = await api(`/feed?store=${sid}&date=${date}`);
  const done = d.rows.filter(t => t.status === 'done');
  $('#main').innerHTML = `<div class="row between"><h1>门店群拍墙</h1><div class="row">${storeSwitch('#/feed', '&date=' + date)}<input type="date" value="${date}" onchange="location.hash='#/feed?store=${sid}&date='+this.value"></div></div>
  <p class="muted small" style="margin-top:-6px">品牌标准中反馈方式含 F4（群拍）的条款，完成时拍照自动汇集到这里，店长和区域随时可看。今日已发 ${done.length}/${d.rows.length}。</p>
  <div class="feed">${d.rows.map(t => `<div class="fc ${t.status}" data-id="${t.id}">${t.photo ? `<img src="${esc(t.photo)}" alt="">` : `<div class="ph">${t.overdue ? '超时未拍' : '待拍照'}</div>`}
    <div class="fb"><div class="small"><span class="tag std">No.${esc(t.code)}</span> ${t.tag && t.tag !== '基础项' ? `<span class="tag ${TAG_CLS[t.tag] ?? ''}">${esc(t.tag)}</span>` : ''}</div><div class="ttl">${esc(t.title)}</div>
    <div class="muted small">${esc(t.assignee_name || '未分配')} · ${t.status === 'done' ? esc((t.done_at || '').slice(11, 16)) + ' 已发' : '截止 ' + esc(t.due_time)}</div></div></div>`).join('') || '<div class="empty">当天没有群拍任务</div>'}</div>`;
  document.querySelectorAll('.fc').forEach(el => el.onclick = () => taskDetail(Number(el.dataset.id)));
};

const NAV_DA = { pay: 'pay', hrm: 'hrm', care: 'care', people: 'hr', diag: 'diag' };
// ---------- 工作台 ----------
VIEWS.work = async () => {
  const yi = await api('/yi').catch(() => []);
  const secs = []; let cur = null;
  for (const [k, l] of NAV[S.me.level]) { if (k === 'sec') { cur = { t: l, items: [] }; secs.push(cur); } else if (S.me.level === 'staff' || !NAV_DA[k] || da(NAV_DA[k])) cur.items.push([k, l]); else if (k === 'pay') cur.items.push([k, '我的绩效与薪酬']); }
  let ci = 0;
  $('#main').innerHTML = `<h1>工作台</h1>${yi.length ? `<div class="sec-t">易系列 · 角色模块</div>${yi.map(yiCard).join('')}` : ''}${secs.filter(sc => sc.items.length).map(sc => `<div class="sec-t">${esc(sc.t)}</div><div class="panel tiles">${sc.items.map(([k, l]) =>
    `<a class="tile" href="#/${k}"><span class="tic" style="background:${TILE_COLORS[ci++ % TILE_COLORS.length]}">${esc(l.replace(/[^\u4e00-\u9fa5]/g, '').slice(0, 1))}</span><span>${esc(l)}</span></a>`).join('')}</div>`).join('')}
  <div class="sec-t">内部系统</div><div class="panel tiles">${Object.entries(APPS).map(([k, x]) => `<a class="tile" href="#/app/${k}"><span class="tic" style="background:${x.color}">${x.name.replace('易', '').slice(0, 1)}</span><span>${x.name}</span></a>`).join('')}</div>`;
};

VIEWS.dataauth = async () => {
  const d = await api('/data-auth');
  $('#main').innerHTML = `<div class="pghd"><b>数据授权</b></div><p class="muted small" style="margin-top:-6px">按角色设定能查看哪些敏感数据。本人自己的数据始终可见；后台接口按这张表统一拦截，没有授权的数据不会返回。${d.edit ? '修改会记入操作日志。' : '只读，由区域经理或总部维护。'}</p>
  <form id="daf">${d.roles.map(([rk, rl]) => `<div class="sec-t2">${esc(rl)}</div><div class="panel" style="display:flex;flex-wrap:wrap;gap:8px 16px;padding:10px 12px">${d.cats.map(([ck, cl]) => `<label class="small" style="display:inline-flex;align-items:center;gap:4px"><input type="checkbox" name="${rk}.${ck}" ${(d.auth[rk] || []).includes(ck) ? 'checked' : ''} ${d.edit ? '' : 'disabled'}> ${esc(cl)}</label>`).join('')}</div>`).join('')}
  <div class="sec-t2">数据范围说明</div><div class="ldr">${d.cats.map(([, cl, cd]) => `<div class="cfr"><span>${esc(cl)}</span><small class="muted">${esc(cd)}</small></div>`).join('')}</div>
  ${d.edit ? '<div class="row" style="gap:8px;margin-top:10px"><button type="button" class="btn" id="da-r">恢复默认</button><span class="sp"></span><button class="btn primary">保存</button></div>' : ''}</form>`;
  if (!d.edit) return;
  const f = $('#daf');
  f.onsubmit = e => { e.preventDefault(); const auth = {}; for (const [rk] of d.roles) auth[rk] = d.cats.map(([ck]) => ck).filter(ck => f.elements[rk + '.' + ck].checked); act(async () => { await api('/data-auth', { auth }); await refresh(); }, '已保存'); };
  $('#da-r').onclick = () => act(async () => { await api('/data-auth', { reset: true }); await refresh(); }, '已恢复默认');
};
// ---------- 我的 ----------
VIEWS.me = async () => {
  const [mt, rs] = await Promise.all([S.me.level === 'staff' || S.me.level === 'store_manager' ? api('/my/tasks') : Promise.resolve(null), api('/rectifications?mine=1')]);
  const open = rs.filter(r => r.status !== 'closed').length;
  $('#main').innerHTML = `<div class="profile"><span class="av lg">${esc(S.me.name.slice(0, 1))}</span><div><b>${esc(S.me.name)}</b><div class="muted small">${esc(S.me.role_name)} · ${esc(S.meta.stores.map(s => s.name).join('、'))}</div></div></div>
  <div class="panel stats">${mt ? `<a href="#/my"><b>${mt.filter(t => t.status === 'done').length}/${mt.length}</b><span>今日我的任务</span></a>` : `<a href="#/dash"><b>${S.meta.stores.length}</b><span>管辖门店</span></a>`}
    <a href="#/${rectRoute()}"><b>${open}</b><span>${S.me.level === 'staff' ? '待整改' : '我负责的整改'}</span></a><a href="#/notices"><b>${S.me.unread}</b><span>未读消息</span></a></div>
  <div class="panel menu">${[...(mt ? [['#/my', '我的任务']] : []), ['#/my-rect', '我的整改'], ['#/standards', '品牌标准库'], ['#/feed', '门店群拍墙'], ['#/notices', '消息提醒'], ['#/work', '工作台']].map(([h, l]) => `<a href="${h}">${l}<i>›</i></a>`).join('')}
    <a href="#/login">切换身份<i>›</i></a><a href="${SESSION_URL}" target="_blank" rel="noopener">提交修改需求<i>›</i></a></div>`;
};

// ---------- 日历弹窗 / 更多 ----------
async function calSheet(sid, sel, onPick) {
  const t = S.me.today, cur = sel.slice(0, 8) + '01';
  const months = [-2, -1, 0].map(k => { const d = new Date(cur + 'T00:00:00'); d.setMonth(d.getMonth() + k); return d.toISOString().slice(0, 8) + '01'; });
  const last = new Date(cur + 'T00:00:00'); last.setMonth(last.getMonth() + 1); last.setDate(0);
  const to = cur.slice(0, 8) + String(last.getDate()).padStart(2, '0');
  const rates = await api(`/calendar?store=${sid}&from=${months[0]}&to=${to}${S.me.level === 'staff' ? '&mine=1' : ''}`);
  const month = ms => {
    const d0 = new Date(ms + 'T00:00:00'), y = d0.getFullYear(), m = d0.getMonth();
    const n = new Date(y, m + 1, 0).getDate(), lead = (d0.getDay() + 6) % 7;
    let cells = '<i></i>'.repeat(lead);
    for (let i = 1; i <= n; i++) {
      const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`, r = rates[ds];
      cells += `<button data-d="${ds}" class="${ds === sel ? 'on' : ''} ${ds === t ? 'today' : ''}" ${ds > L30() ? 'disabled' : ''}><span>${i}</span>${ds <= t ? gauge(r ?? null, 30, 3, rateColor(r ?? null)) : '<b class="gp"></b>'}</button>`;
    }
    return `<div class="cm"><div class="cmt">${y}年${m + 1}月</div><div class="cg">${cells}</div></div>`;
  };
  $('#modal-root').innerHTML = `<div class="modal-bg sheet-bg"><div class="calsheet"><div class="ch"><button class="x" data-close>✕</button><b>选择查看日期</b><span></span></div>
    <div class="cw">${CN_WD.map(w => `<span>${w}</span>`).join('')}</div><div class="cbody">${months.map(month).join('')}</div></div></div>`;
  const bg = $('#modal-root').firstChild;
  bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-close]')) return closeModal(); const b = e.target.closest('[data-d]'); if (b) { closeModal(); onPick(b.dataset.d); } });
  const on = bg.querySelector('.cbody .on'); if (on) on.scrollIntoView({ block: 'center' });
}
const L30 = () => { const d = new Date(S.me.today + 'T00:00:00'); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); };
function moreMenu(btn) {
  const quick = { store_manager: [1, '切换为区域经理'], region_manager: [4, '切换为店长'], ops_manager: [4, '切换为店长'], hr_manager: [1, '切换为区域经理'], dev_manager: [1, '切换为区域经理'], train_manager: [1, '切换为区域经理'], coach: [4, '切换为店长'], hq: [1, '切换为区域经理'], build_manager: [1, '切换为区域经理'], sales_manager: [1, '切换为区域经理'], staff: [4, '切换为店长'] }[S.me.level];
  const items = [[quick[1], () => { localStorage.lt_uid = quick[0]; S.meta = null; location.hash = '#/home'; route(); }], ['工作台', () => { location.hash = '#/work'; }], ['品牌标准库', () => { location.hash = '#/standards'; }], ['切换其他身份', () => { location.hash = '#/login'; }]];
  const r = btn.getBoundingClientRect();
  $('#modal-root').innerHTML = `<div class="pop-bg"><div class="pop" style="top:${r.bottom + 6}px;right:${Math.max(8, innerWidth - r.right - 4)}px">${items.map(([l], i) => `<button data-i="${i}">${i === 0 ? '⇌ ' : ''}${esc(l)}</button>`).join('')}</div></div>`;
  const bg = $('#modal-root').firstChild;
  bg.onclick = e => { const b = e.target.closest('[data-i]'); closeModal(); if (b) items[Number(b.dataset.i)][1](); };
}

// ---------- 任务列表（点击时间轴卡片） ----------
const md2 = d => `${Number(d.slice(5, 7))}月${Number(d.slice(8))}日`;
VIEWS.group = async () => {
  const p = qs();
  const sid = pickStore(p.get('store'));
  const date = p.get('date') || S.me.today, tab = p.get('tab') || 'day', g = p.get('g') || '', pl = p.get('pl') || '';
  const h = await api(`/home?store=${sid}&date=${date}${S.me.level === 'staff' ? '&mine=1' : ''}`);
  const ts = h.tabs[tab].filter(t => (!pl || t.pillar === pl) && (tab === 'once' ? t.title : (t.scene_name || '其他')) === g);
  const manage = S.me.can.manage;
  const btn = t => (t.status === 'pending' && t.date <= S.me.today && (t.assignee_id === S.me.id || TEAM(t)) ? ['去完成', 'go'] : TEAM(t) && t.status === 'done' && !t.check_result ? [t.m === 'M2' ? '去复查' : '去抽查', 'go'] : ['查看', 'view']);
  $('#main').innerHTML = `<div class="bluepage"><div class="bp-hd">${esc(g)}${pl ? ` · ${esc(pl)}` : ''}</div><div class="bp-body">
    <h2 class="bp-t">任务列表 (${ts.filter(t => t.status === 'done').length}/${ts.length})</h2>
    ${ts.length ? taskBoard(ts, t => { const [l, k] = btn(t); return `<div class="gcard ${t.status === 'done' ? 'done' : ''} ${t.overdue ? 'od' : ''}" data-id="${t.id}">
      <div class="gt">${esc(t.title)}${qm(t)}</div>
      <div class="gl">${icon('clock')}建议 ${md2(t.date)} ${esc(t.due_time)}<span class="gsep">·</span>截止 23:59<span class="gsep">·</span>${esc(t.assignee_name || '未分配')}</div>
      <div class="gtags">${stdTags(t)} ${t.need_photo ? '<span class="tag">需拍照</span>' : ''} ${statusTag(t)} ${checkTag(t)}</div>
      <span class="gbtn ${k}">${l} →</span></div>`; }, 'grp', { mine: S.me.level !== 'staff' }) : '<div class="empty">没有任务</div>'}</div></div>`;
  document.querySelectorAll('.gcard').forEach(el => el.onclick = () => { location.hash = '#/task/' + el.dataset.id; });
  bindBoard();
};

// ---------- 任务处理页（AI 助手 + 内部系统） ----------
const APPS = {
  room: { name: '易客房', color: '#14A38B', re: /客房|布草|房间|OK ?房|做房|查房|迷你吧|易耗品|洗衣|床/, desc: '房态、做房、查房与布草管理' },
  eng: { name: '易工程', color: '#3C7BF4', re: /设备|空调|电梯|工程|维修|报修|水电|锅炉|照明|管道|能耗|巡检|配电/, desc: '报修工单、设备巡检与能耗抄表' },
  patrol: { name: '易巡店', color: '#7C6CF2', re: /巡|公区|外围|大堂|标识|绿化|停车/, desc: '巡店计划、检查表与问题追踪' },
  bf: { name: '易早餐', color: '#F29A2E', re: /早餐|餐厅|食品|留样|厨|出品|菜|餐具/, desc: '早餐备餐、补餐与食品安全' },
  safe: { name: '易安全', color: '#E5534B', re: /消防|安全|监控|燃气|液化气|天然气|应急|消火栓|疏散|治安|报警/, desc: '消防、监控、燃气与应急管理' },
  gop: { name: 'GOP管理', color: '#C2843A', re: /营收|成本|GOP|采购|收银|账|价格|房价|库存|预算|销售|客户/, desc: '营收、成本与 GOP 经营分析' },
};
const SCENE_APP = { 客房: 'room', 餐厅: 'bf', 后场: 'eng', 外围: 'patrol', 公区: 'patrol', 前台: 'gop', 营业功能区: 'room' };
function appsFor(t) {
  const s = (t.title || '') + (t.standard || '') + (t.scene_name || '');
  const ks = Object.keys(APPS).filter(k => APPS[k].re.test(s));
  if (!ks.length && SCENE_APP[t.scene_name]) ks.push(SCENE_APP[t.scene_name]);
  return ks.slice(0, 3);
}
const SCENE_COLOR = { 前台: '#3C7BF4', 餐厅: '#F29A2E', 客房: '#14A38B', 公区: '#7C6CF2', 外围: '#5B8C5A', 后场: '#C2843A', 营业功能区: '#2BA6DE' };
function aiPhoto(t) {
  const c = document.createElement('canvas'); c.width = 960; c.height = 720; const x = c.getContext('2d');
  const col = SCENE_COLOR[t.scene_name] || '#3C7BF4';
  const g = x.createLinearGradient(0, 0, 0, 720); g.addColorStop(0, '#F4F6FA'); g.addColorStop(0.55, col + '55'); g.addColorStop(1, col + 'AA');
  x.fillStyle = g; x.fillRect(0, 0, 960, 720);
  x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 2;
  for (let i = -8; i <= 8; i++) { x.beginPath(); x.moveTo(480, 330); x.lineTo(480 + i * 140, 720); x.stroke(); }
  for (let y = 380; y < 720; y += 50) { x.beginPath(); x.moveTo(0, y); x.lineTo(960, y); x.stroke(); }
  let seed = 0; for (const ch of t.title) seed = (seed * 31 + ch.charCodeAt(0)) % 9973;
  for (let i = 0; i < 5; i++) { const w = 90 + (seed * (i + 3)) % 120, h = 60 + (seed * (i + 7)) % 160; x.fillStyle = `rgba(255,255,255,${0.55 + i * 0.07})`; x.beginPath(); x.roundRect(80 + i * 165, 400 - h, w, h, 10); x.fill(); x.fillStyle = col; x.fillRect(80 + i * 165, 400 - h, w, 8); }
  x.fillStyle = 'rgba(20,24,32,.72)'; x.beginPath(); x.roundRect(30, 560, 900, 130, 16); x.fill();
  x.fillStyle = '#fff'; x.font = '600 34px sans-serif'; x.fillText(t.title.slice(0, 22), 56, 612);
  x.font = '24px sans-serif'; x.fillText(`${t.store_name || storeName(t.store_id)} · ${t.scene_name || ''} · ${S.me.today} ${new Date().toTimeString().slice(0, 5)}`, 56, 656);
  x.fillStyle = 'rgba(91,78,255,.92)'; x.beginPath(); x.roundRect(30, 30, 300, 52, 26); x.fill();
  x.fillStyle = '#fff'; x.font = '600 24px sans-serif'; x.fillText('✦ AI 生成 · 演示图片', 52, 64);
  return c.toDataURL('image/jpeg', 0.82);
}
function stdPoints(t) { return (t.standard || '').split(/\n|；|;|。/).map(x => x.replace(/^[\s\d.、()（）-]+/, '').trim()).filter(x => x.length > 3).slice(0, 5); }
VIEWS.task = async id => {
  const t = await api('/instances/' + id);
  const can = t.status === 'pending' && t.date <= S.me.today && (t.assignee_id === S.me.id || TEAM(t));
  const apps = appsFor(t);
  let photo = null;
  $('#main').innerHTML = `<div class="bluepage"><div class="bp-hd">${esc(t.scene_name || '任务')}</div><div class="bp-body">
    <div class="tk-card"><div class="gt">${esc(t.title)}</div>
      <div class="gtags">${originTag(t.origin)} ${stdTags(t)} ${statusTag(t)} ${checkTag(t)}</div>
      <div class="gl">${icon('clock')}建议完成时间：${md2(t.date)} ${esc(t.due_time)}　${icon('me')}${esc(t.assignee_name || '未分配')}${t.covered ? `（顶岗 · 原 ${esc(t.orig_name)}）` : ''}</div>
      ${t.code ? `<div class="gl">品牌标准 No.${esc(t.code)} · ${M_DESC[t.m] || ''} · 反馈：${fText(t.f)}</div>` : ''}
      <details class="sd" ${(t.standard || '').length < 80 ? 'open' : ''}><summary>执行标准</summary><div class="pre small">${esc(t.standard || '-')}</div></details></div>
    ${apps.length ? `<div class="sec-t2">相关内部系统</div><div class="approw">${apps.map(k => `<a href="#/app/${k}?task=${t.id}" class="appchip"><span style="background:${APPS[k].color}">${APPS[k].name.replace('易', '').slice(0, 1)}</span>${APPS[k].name}</a>`).join('')}</div>` : ''}
    ${can ? `<div class="ai"><div class="ai-h"><span class="aiav">AI</span><div><b>宏图 AI 助手</b><div class="muted small">演示功能：可以帮你生成照片、写完成说明、提交前预检</div></div></div>
      <div class="ai-btns"><button class="btn sm" id="ai-photo">✦ 生成现场照片</button><button class="btn sm" id="ai-note">✦ 写完成说明</button><button class="btn sm" id="ai-check">✦ 提交前预检</button></div>
      <div id="ai-out"></div></div>
    <form id="f" class="tk-form">
      ${t.need_value ? '<label class="f"><span>计量读数（必填）</span><input name="reading" required placeholder="例如：巡检 15 个点位，异常 0 处"></label>' : ''}
      <div class="f"><span>现场照片${t.need_photo ? '（必传）' : '（可选）'}</span><div class="ph-row"><div class="ph-prev" id="pv">${icon('cam')}</div>
        <label class="btn sm">拍照 / 相册<input type="file" accept="image/*" capture="environment" id="pf" hidden></label></div></div>
      <label class="f"><span>完成说明</span><textarea name="note" id="note" placeholder="例如：已按标准完成，无异常"></textarea></label>
      <button class="btn primary block">提交完成</button></form>`
    : `<div class="tk-card">${t.status === 'done' ? `<div class="gl">完成时间：${esc(t.done_at)}</div>${t.reading ? `<div class="gl">计量读数：${esc(t.reading)}</div>` : ''}${t.done_note ? `<div class="gl">完成说明：${esc(t.done_note)}</div>` : ''}${t.photo ? `<img class="tk-img" src="${esc(t.photo)}" alt="">` : ''}
      ${t.check_result ? `<div class="note">${t.check_result === 'good' ? '店长肯定' : '不合格'}：${esc(t.check_comment || '')}（${esc(t.checker_name || '')}）</div>` : ''}` : `<div class="muted">${t.date > S.me.today ? '未到执行日期' : '该任务由 ' + esc(t.assignee_name || '-') + ' 负责'}</div>`}
      <div class="row" style="margin-top:10px"><span class="sp"></span>${TEAM(t) && t.assignee_id !== S.me.id && t.status === 'done' && !t.check_result ? `<button class="btn primary" id="chk">${t.m === 'M2' ? '复查' : '抽查'}</button>` : ''}<button class="btn" id="det">完整记录</button></div></div>`}
  </div></div>`;
  if ($('#det')) $('#det').onclick = () => taskDetail(t.id);
  if ($('#chk')) $('#chk').onclick = () => checkModal(t);
  if (!can) return;
  const out = (html, cls = '') => { $('#ai-out').insertAdjacentHTML('beforeend', `<div class="ai-msg ${cls}">${html}</div>`); };
  const setPhoto = (src, ai) => { photo = src; $('#pv').innerHTML = `<img src="${src}" alt="">${ai ? '<i>AI 演示</i>' : ''}`; };
  $('#pf').onchange = async e => { if (e.target.files[0]) setPhoto(await compressImage(e.target.files[0])); };
  $('#ai-photo').onclick = () => { out('正在根据任务内容生成现场照片…', 'muted'); setTimeout(() => { setPhoto(aiPhoto(t), true); out(`已生成「${esc(t.title)}」的演示照片，图上标注「AI 生成」。<b>正式使用时应以现场实拍为准</b>，AI 只做构图辅助和质检。`); }, 700); };
  $('#ai-note').onclick = () => {
    const pts = stdPoints(t); const r = $('#f').reading ? $('#f').reading.value : '';
    $('#note').value = `已按标准完成「${t.title}」${pts.length ? '：' + pts.slice(0, 2).join('；') + ' 均已落实' : ''}${r ? `，读数 ${r}` : ''}，现场无异常。`;
    out('已根据执行标准写好完成说明，可以再修改。');
  };
  $('#ai-check').onclick = () => {
    const f = $('#f'), pts = stdPoints(t), items = [];
    if (t.need_photo) items.push([!!photo, '现场照片已上传']);
    if (t.need_value) items.push([!!(f.reading && f.reading.value.trim()), '计量读数已填写']);
    items.push([!!$('#note').value.trim(), '完成说明已填写']);
    out(`<b>提交前预检</b>${items.map(([ok, l]) => `<div>${ok ? '✅' : '⚠️'} ${l}</div>`).join('')}${pts.length ? `<div class="muted small" style="margin-top:4px">请对照确认：</div>${pts.map(x => `<div class="small">☐ ${esc(x)}</div>`).join('')}` : ''}<div class="muted small">演示：按规则检查，没有接入大模型。</div>`);
  };
  $('#f').onsubmit = async e => {
    e.preventDefault(); const d = formData(e.target);
    if (await act(() => api(`/instances/${t.id}/complete`, { note: d.note, reading: d.reading || '', photo }), '已完成')) history.length > 1 ? history.back() : (location.hash = '#/home');
  };
};

// ---------- 内部系统（演示） ----------
VIEWS.app = async key => {
  const a = APPS[key]; if (!a) { location.hash = '#/work'; return; }
  const tid = qs().get('task'); const sid = S.store;
  let sd = 0; for (const ch of key + S.me.today + sid) sd = (sd * 31 + ch.charCodeAt(0)) % 100003;
  const rn = (lo, hi) => { sd = (sd * 9301 + 49297) % 233280; return lo + Math.floor(sd / 233280 * (hi - lo + 1)); };
  const kpi = arr => `<div class="panel stats">${arr.map(([l, v]) => `<a><b>${v}</b><span>${l}</span></a>`).join('')}</div>`;
  const rows = arr => `<div class="list">${arr.map(([l, r, c]) => `<div class="task"><div class="b"><div class="ttl">${l}</div></div><span class="tag ${c || ''}">${r}</span></div>`).join('')}</div>`;
  const body = {
    room: () => { const st = ['OK', 'OK', 'OK', '脏', '住', '住', '住', '修']; const rooms = Array.from({ length: 24 }, (_, i) => [801 + i, st[rn(0, 7)]]);
      return kpi([['空净房', rooms.filter(r => r[1] === 'OK').length], ['待做房', rooms.filter(r => r[1] === '脏').length], ['住客房', rooms.filter(r => r[1] === '住').length], ['维修房', rooms.filter(r => r[1] === '修').length]])
        + `<div class="roomgrid">${rooms.map(([n, s]) => `<span class="rm ${{ OK: 'ok', 脏: 'warn', 住: 'acc', 修: 'bad' }[s]}">${n}<small>${s}</small></span>`).join('')}</div>`; },
    eng: () => kpi([['待派工单', rn(1, 4)], ['处理中', rn(1, 5)], ['今日完成', rn(3, 9)], ['设备巡检', rn(70, 100) + '%']]) + rows([['812 房空调不制冷', '处理中', 'warn'], ['大堂筒灯 2 盏不亮', '待派单', 'bad'], ['2 号电梯月度保养', '已完成', 'ok'], ['水电表抄录（每日）', '已完成', 'ok']]),
    patrol: () => kpi([['本月巡店', rn(1, 3)], ['最近得分', rn(82, 96)], ['待整改', rn(2, 8)], ['重点跟踪', rn(1, 3)]]) + rows([['大堂区域 70 条', '已检查', 'ok'], ['客房区域 49 条', '检查中', 'warn'], ['餐厅区域 36 条', '待检查', ''], ['后场区域 17 条', '待检查', '']]),
    bf: () => kpi([['预计用餐', rn(120, 260) + ' 人'], ['已用餐', rn(40, 120) + ' 人'], ['品种', rn(32, 40) + ' 种'], ['断档预警', rn(0, 2)]]) + rows([['热菜 · 炒饭', '余量 30%', 'warn'], ['面点 · 包子', '充足', 'ok'], ['饮品 · 豆浆', '充足', 'ok'], ['食品留样（48h）', '已留样', 'ok']]),
    safe: () => kpi([['消防主机', '正常'], ['监控在线', rn(95, 100) + '%'], ['燃气浓度', '0.0%'], ['今日隐患', rn(0, 2)]]) + rows([['消防报警主机自检', '正常', 'ok'], ['疏散通道 / 安全门', '畅通', 'ok'], ['厨房燃气报警器', '正常', 'ok'], ['消火栓压力巡检', '待巡检', 'warn']]),
    gop: () => kpi([['本月营收', rn(180, 260) + ' 万'], ['GOP 率', rn(38, 52) + '%'], ['人工成本率', rn(18, 26) + '%'], ['能耗成本率', rn(5, 9) + '%']]) + rows([['客房收入', '完成预算 ' + rn(88, 105) + '%', 'ok'], ['早餐收入', '完成预算 ' + rn(80, 100) + '%', 'warn'], ['布草洗涤成本', '环比 +' + rn(1, 6) + '%', 'warn'], ['OTA 佣金', '环比 -' + rn(1, 4) + '%', 'ok']]),
  }[key]();
  $('#main').innerHTML = `<div class="apphd" style="background:${a.color}"><span class="appic">${a.name.replace('易', '').slice(0, 1)}</span><div><b>${a.name}</b><div class="small">${a.desc} · ${esc(storeName(sid))}</div></div></div>
    <div class="note small" style="margin:10px 0">演示页面：展示宏图计划与内部系统的跳转衔接，数据为模拟，尚未接入真实${a.name}。</div>${body}
    ${tid ? `<a class="btn primary block" style="margin-top:14px" href="#/task/${tid}">返回任务继续完成</a>` : ''}`;
};

// ---------- 我的 / 店长中心 ----------
VIEWS.me = async () => {
  const p = qs();
  const sid = pickStore(p.get('store'));
  const mode = p.get('mode') || 'month', cp = p.get('cp') || 'cur';
  const staff = S.me.level === 'staff';
  const [d, rs] = await Promise.all([api(`/profile?store=${sid}&mode=${mode}${staff ? '&mine=1' : ''}`), api('/rectifications?mine=1')]);
  const link = o => '#/me?' + new URLSearchParams({ store: sid, mode, cp, ...o });
  const st = d.store, c = d.completion[cp];
  const ymd = s => (s ? `${s.slice(0, 4)}年${s.slice(5, 7)}月${s.slice(8, 10)}日` : '-');
  const open = rs.filter(r => r.status !== 'closed').length;
  $('#main').innerHTML = `<div class="pf-hd"><span class="pf-av">${esc(d.user.role.slice(0, 2))}</span><div><b>${esc(d.user.name)}</b><div class="muted">${esc(d.user.role)}任职：${d.user.since.replace(/-/g, '.')}-至今</div></div></div>
  <div class="pf-store"><div class="row between"><button class="storename sm" id="sp">${esc(st.name)}${S.meta.stores.length > 1 ? '<i>▾</i>' : ''}</button><span class="mono muted">${esc(st.code)}</span></div>
    <div class="row" style="gap:6px;margin:4px 0 8px"><span class="tag acc">${esc(st.brand || '')}</span><span class="tag acc">${esc(st.stype || '')}</span></div>
    <div class="pf-kv"><span>首次开业 ${ymd(st.open_date)}</span><span>房量 ${st.rooms || '-'}</span><span>品牌审计 ${st.patrol_score != null ? `<a href="#/standards?store=${sid}">${st.patrol_score} 分</a>` : '未检查'}</span><span>品牌一致性 未检查</span></div></div>
  <div class="pf-score"><div class="pf-st">${staff ? '个人综合分' : '宏图综合分'} <button class="q" id="q">?</button></div>
    <div class="pf-big"><b>${d.score ?? '--'}</b><span>分</span><div>取数：${d.from.slice(5).replace('-', '.')}-${d.to.slice(5).replace('-', '.')}<br>由健康度 ${d.health ?? '-'}、任务完成率 ${d.completion_rate ?? '-'}% 综合得出</div></div>
    <div class="pf-in"><div class="row between"><h3>${staff ? '我的工作健康度' : '门店健康度'} ${d.health ?? '-'}</h3><div class="seg"><a href="${link({ mode: 'week' })}" class="${mode === 'week' ? 'on' : ''}">周</a><a href="${link({ mode: 'month' })}" class="${mode === 'month' ? 'on' : ''}">月</a></div></div>
      <div class="hl3">${[['ok', '达标'], ['warn', '预警'], ['bad', '异常']].map(([k, l]) => `<button data-hs="${k}"><span><i class="hd ${k}"></i>${l}</span><b>${d.counts[k]}</b></button>`).join('')}</div>
      <button class="hdetail" id="hd"><span class="aiav">AI</span>健康度详情<i>›</i></button>
      <div class="hr"></div>
      <div class="row between"><h3>任务完成率</h3><div class="seg">${[['cur', '当期'], ['last', '上月'], ['year', '年度平均']].map(([k, l]) => `<a href="${link({ cp: k })}" class="${cp === k ? 'on' : ''}">${l}</a>`).join('')}</div></div>
      <div class="c3">${[['day', '日任务'], ['week', '周任务'], ['month', '月任务']].map(([k, l]) => `<div><span>${l}</span><b>${c[k] == null ? '-' : c[k] + '%'}</b></div>`).join('')}</div>
      <div class="muted small">取数：${{ cur: '当期最新任务完成率（日任务取昨日）', last: '上月任务完成率', year: '本年度平均任务完成率' }[cp]}</div></div></div>
  <div class="panel menu">${[...(staff || S.me.level === 'store_manager' ? [['#/my', '我的任务']] : []), ['#/' + rectRoute(), `我的整改${open ? ` <span class="tag warn">${open}</span>` : ''}`], ['#/standards', '品牌标准库'], ['#/feed', '门店群拍墙'], ['#/notices', '消息提醒'], ['#/work', '工作台']].map(([h, l]) => `<a href="${h}">${l}<i>›</i></a>`).join('')}
    <a href="#/login">切换身份<i>›</i></a><a href="${SESSION_URL}" target="_blank" rel="noopener">提交修改需求<i>›</i></a></div>`;
  if (S.meta.stores.length > 1) $('#sp').onclick = () => sheet(S.meta.stores.map(s => [esc(s.name) + (s.id === sid ? ' ✓' : ''), () => { location.hash = link({ store: s.id }); }]), '切换门店');
  $('#q').onclick = () => modal('综合分怎么算', `<p>综合分 = 健康度 × 60% + 任务完成率 × 40%。</p><p>健康度：${d.indicators.length} 项指标中，达标计 100 分，预警计 60 分，异常计 0 分，取平均。指标包括任务执行、抽查质量、品牌标准（清零项、M2 复查、F4 群拍等）、场景完成率${staff ? '' : '和经营数据'}。</p><p class="muted small">经营数据为模拟数据。</p>`);
  const hd = only => modal(staff ? '我的工作健康度' : '门店健康度详情', ['bad', 'warn', 'ok'].filter(k => !only || k === only).map(k => {
    const xs = d.indicators.filter(i => i.status === k); if (!xs.length) return '';
    return `<h3 style="margin-top:12px"><i class="hd ${k}"></i>${{ ok: '达标', warn: '预警', bad: '异常' }[k]} ${xs.length}</h3><div class="list">${xs.map(i => `<div class="task"><div class="b"><div class="ttl">${esc(i.name)} <span class="muted small">${esc(i.group)}</span></div><div class="muted small">${esc(i.rule)}</div></div><b class="${k === 'ok' ? '' : k}">${i.value}${esc(i.unit)}</b></div>`).join('')}</div>`;
  }).join('') + `<p class="muted small">取数 ${esc(d.from)} 至 ${esc(d.to)}。</p>`);
  $('#hd').onclick = () => hd();
  document.querySelectorAll('[data-hs]').forEach(b => b.onclick = () => hd(b.dataset.hs));
};

// ---------- 首页分流：区域管理层 / 店长 / 员工 ----------
const storeHome = VIEWS.home;
async function regionHome() {
  const P = qs();
  const rk = 'ops';
  const [d, iss, pts, biz] = await Promise.all([api('/dashboard'), api('/issues'), S.me.level === 'sales_manager' ? Promise.resolve([]) : api('/patrols'), api('/region/biz?days=7')]);
  const rows = d.week || d.today, today = d.today;
  const sum = k => today.reduce((a, s) => a + (s[k] || 0), 0);
  const tot = sum('total'), dn = sum('done');
  const wk = (d.week || []).reduce((a, s) => [a[0] + (s.done || 0), a[1] + (s.total || 0)], [0, 0]);
  const chk = rows.reduce((a, s) => [a[0] + (s.good || 0), a[1] + (s.checked || 0)], [0, 0]);
  const pc = (a, b) => (b ? Math.round(a * 100 / b) : null);
  const sales = S.me.level === 'sales_manager', rm = S.me.level === 'region_manager';
  const lvl = x => ({ high: 'bad', mid: 'warn', low: 'acc' }[x] || 'acc');
  const toStore = id => `#/home?view=store&store=${id}`;
  const planned = pts.filter(x => x.status === 'planned'), done = pts.filter(x => x.status === 'done').slice(0, 3);
  $('#main').innerHTML = `<div class="storebar"><button class="storename" disabled>${esc(S.me.region_name || '华东一区')} · 辖区 ${today.length} 店</button>
    <a class="ib" href="#/me">${icon('me')}<span>${esc(CENTER[S.me.level])}</span></a><button class="ib" id="more">${icon('more')}<span>更多</span></button></div>
  ${plBar('ops')}
  <section class="brief rg"><div class="btabs"><a class="on">${sales ? '销售看板' : '运营看板'}</a><span class="sp"></span><a href="#/dash" class="lk2">完整看板 ›</a></div>
    <div class="rkpi">${[['今日完成率', pc(dn, tot), '%', '#/tasks'], ['重点跟踪', sum('focus_total'), '', '#/focus'], ['抽查合格率', pc(chk[0], chk[1]), '%', '#/dash'], ['未闭环整改', sum('rect_open'), '', '#/rect'], ['逾期整改', sum('rect_late'), '', '#/rect?st=late'], ['问题门店', iss.length, '', '#/issues']]
      .map(([l, v, u, h], i) => `<a href="${h}" class="${i >= 4 && v ? 'bad' : ''}"><b>${v ?? '-'}<small>${v == null ? '' : u}</small></b><span>${l}</span></a>`).join('')}</div></section>
  <div class="sec-t2">门店运营执行排名</div>
  <div class="list">${rk === 'biz' ? [...biz].sort((a, b) => b.revpar - a.revpar).map((s, i) => `<a class="rank" href="${toStore(s.id)}"><span class="no">${i + 1}</span><div class="b"><b>${esc(s.name)}</b><div class="muted small">${esc(s.managers.join('、'))} · 出租率 ${s.occ}% · ADR ${s.adr} · MPI ${s.mpi}${s.bad ? ` · <span class="bad">差评 ${s.bad}</span>` : ''}</div></div>
      <div class="r"><b>${s.revpar}</b><span class="small ${s.revpar_delta < 0 ? 'bad' : 'muted'}">RevPAR ${s.revpar_delta > 0 ? '+' : ''}${s.revpar_delta}%</span></div></a>`).join('')
    : [...today].sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1)).map((s, i) => `<a class="rank" href="${toStore(s.id)}"><span class="no">${i + 1}</span>${gauge(s.rate, 40, 5, rateColor(s.rate))}<div class="b"><b>${esc(s.name)}</b><div class="muted small">${esc((s.managers || []).join('、'))} · 已完成 ${s.done}/${s.total}${s.overdue ? ` · <span style="color:var(--bad)">超时 ${s.overdue}</span>` : ''}</div></div>
      <div class="r"><b>${s.rate ?? '-'}%</b><span class="small ${s.rect_late ? 'bad' : 'muted'}">整改 ${s.rect_open}${s.rect_late ? ` / 逾期 ${s.rect_late}` : ''}</span></div></a>`).join('')}</div>
  <div class="sec-t2 row between"><span>${rm ? '重点关注 · 问题门店' : '问题门店筛选'}</span><a href="#/issues" class="small">全部 ›</a></div>
  ${iss.length ? iss.map(x => `<div class="iss"><a class="iss-h" href="${toStore(x.store.id)}"><b>${esc(x.store.name)}</b><span class="muted small">${esc((x.store.managers || []).join('、'))} · 完成率 ${x.store.rate ?? '-'}% · 合格率 ${x.store.pass_rate ?? '-'}%</span><i>›</i></a>
      ${x.issues.slice(0, 3).map(i => `<div class="iss-i"><span class="tag ${lvl(i.level)}">${esc(i.type)}</span><span>${esc(i.text)}</span></div>`).join('')}${x.issues.length > 3 ? `<div class="muted small">还有 ${x.issues.length - 3} 项…</div>` : ''}
      <div class="row iss-a"><a class="btn sm" href="#/tasks?store=${x.store.id}">任务明细</a><a class="btn sm" href="#/rect?store=${x.store.id}">整改</a>${rm ? `<a class="btn sm" href="#/patrol?new=1&store=${x.store.id}">加入巡店计划</a><a class="btn sm" data-follow="${x.store.id}">指派跟进</a><a class="btn primary sm" href="#/focus?new=1&store=${x.store.id}">重点跟踪</a>` : ''}</div></div>`).join('') : '<div class="list"><div class="empty">暂无问题门店</div></div>'}
  ${sales ? '' : `<div class="sec-t2 row between"><span>巡店计划</span><a href="#/patrol" class="small">${rm ? '新建 / 全部' : '全部'} ›</a></div>
  <div class="list">${planned.map(x => `<a class="task" href="#/patrol/${x.id}"><div class="t mono">${esc(x.planned_date.slice(5))}</div><div class="b"><div class="ttl">${esc(x.store_name)}</div><div class="muted small">${esc(x.reason || '例行巡店')}</div></div><span class="tag acc">待巡店</span></a>`).join('')}
    ${done.map(x => `<a class="task" href="#/patrol/${x.id}"><div class="t mono">${esc((x.done_at || '').slice(5, 10))}</div><div class="b"><div class="ttl">${esc(x.store_name)}</div><div class="muted small">${esc((x.summary || '').slice(0, 40))}</div></div><span class="tag ${x.score >= 90 ? 'ok' : x.score >= 80 ? 'warn' : 'bad'}">${x.score} 分</span></a>`).join('') || '<div class="empty">暂无巡店</div>'}</div>`}
  <div class="sec-t2">进入门店</div><div class="panel tiles">${today.map((s, i) => `<a class="tile" href="${toStore(s.id)}"><span class="tic" style="background:${TILE_COLORS[i % TILE_COLORS.length]}">${esc(s.name.slice(2, 3))}</span><span>${esc(s.name)}</span></a>`).join('')}</div>`;
  $('#more').onclick = e => moreMenu(e.currentTarget);
  bindFollow();
}

// ---------- 区域经理「人」视角 / 人事 ----------
const regionTabs = on => `<div class="rtabs">${[['dian', '店', '门店经营 · 运营 · 排名'], ['ren', '人', '店长 · 运营 · 人事 · 营销']].map(([k, l, d]) => `<a class="${on === k ? 'on' : ''}" href="#/home?tab=${k}"><b>${l}</b><span>${d}</span></a>`).join('')}</div>`;
const spark = (xs, hi) => { const mn = Math.min(...xs) - 6, mx = Math.max(...xs); return `<span class="spk">${xs.map((v, i) => `<i style="height:${Math.max(12, Math.round((v - mn) * 100 / (mx - mn || 1)))}%" class="${i === xs.length - 1 ? 'on' : ''}" title="${v}"></i>`).join('')}</span>`; };
const TIER_TAG = { 可晋升: 'ok', 稳定: 'acc', 需辅导: 'warn' };
const LV_TAG = { high: 'bad', mid: 'warn', low: 'acc' };
const DIMS = [['exec', '执行力'], ['brand', '品牌标准'], ['team', '团队带教'], ['biz', '经营结果']];
const dimBars = d => `<div class="dims">${DIMS.map(([k, l]) => `<div><span>${l}</span><i><em style="width:${d[k] ?? 0}%;background:${rateColor(d[k])}"></em></i><b>${d[k] ?? '-'}</b></div>`).join('')}</div>`;
const workGrid = items => `<div class="wgrid">${items.map(([l, v, u, sim]) => `<div><b>${v}<small>${u}</small></b><span>${l}${sim ? '<sup>*</sup>' : ''}</span></div>`).join('')}</div>`;
function bindFollow() {
  document.querySelectorAll('[data-follow]').forEach(b => b.onclick = async () => {
    const us = (await api('/users')).filter(u => ['ops_manager', 'hr_manager', 'sales_manager', 'store_manager'].includes(u.level));
    const sid = Number(b.dataset.follow), def = us.find(u => u.level === 'ops_manager');
    formModal(`指派跟进 · ${storeName(sid)}`, `<label class="f"><span>跟进人</span><select name="u">${us.map(u => `<option value="${u.id}" ${u === def ? 'selected' : ''}>${esc(u.name)} · ${esc(u.role_name)}</option>`).join('')}</select></label>
      <label class="f"><span>跟进事项</span><textarea name="n" required placeholder="例如：本周内到店复查早餐断档整改，周五前反馈"></textarea></label><p class="muted small">跟进人会收到提醒，并计入其月度工作清单。</p>`,
    d => act(() => api('/region/follow', { store_id: sid, user_id: Number(d.u), note: d.n }), '已指派'));
  });
}
async function regionPeople() {
  const d = await api('/region/people');
  const sms = d.people.filter(x => x.level === 'store_manager').sort((a, b) => a.rank - b.rank), fn = d.people.filter(x => x.level !== 'store_manager');
  $('#main').innerHTML = `<div class="storebar"><button class="storename" disabled>${esc(S.me.region_name || '华东一区')} · 管理团队 ${d.people.length} 人</button>
    <a class="ib" href="#/me">${icon('me')}<span>${esc(CENTER[S.me.level])}</span></a><button class="ib" id="more">${icon('more')}<span>更多</span></button></div>
  ${plBar('ren')}
  <div class="sec-t2 row between"><span>待我关注 · ${d.alerts.length}</span></div>
  <div class="list">${d.alerts.map(a => `<a class="task" href="#/leader/${a.who.id}"><span class="av s">${esc(a.who.name.slice(0, 1))}</span><div class="b"><div class="ttl">${esc(a.who.name)} <span class="muted small">${esc(a.who.stores.join('、'))}</span></div><div class="muted small">${esc(a.text)}</div></div><span class="tag ${LV_TAG[a.level]}">${esc(a.type)}</span></a>`).join('') || '<div class="empty">暂无需要关注的事项</div>'}</div>
  <div class="sec-t2 row between"><span>店长画像 · 区域排名</span><span class="muted small">近 30 天</span></div>
  ${sms.map(x => `<a class="ldr" href="#/leader/${x.id}"><div class="ldr-h"><span class="av">${esc(x.name.slice(0, 1))}</span><div class="grow"><b>${esc(x.name)}</b><span class="muted small">${esc(x.role_name)} · ${esc(x.stores.join('、'))}</span></div>
      <div class="ldr-s"><b>${x.total}</b><span>区域第 ${x.rank}/${d.sm_count}</span></div></div>
    ${dimBars(x.dims)}
    <div class="row between ldr-t"><span class="muted small">近 6 月综合分</span>${spark(x.trend)}<span class="small ${x.delta7 < 0 ? 'bad' : 'muted'}">7 日执行 ${x.delta7 > 0 ? '+' : ''}${x.delta7 ?? '-'}</span></div>
    ${workGrid(x.items)}</a>`).join('')}
  <div class="sec-t2">职能经理 · 本月工作</div>
  ${fn.map(x => `<a class="ldr" href="#/leader/${x.id}"><div class="ldr-h"><span class="av">${esc(x.name.slice(0, 1))}</span><div class="grow"><b>${esc(x.name)}</b><span class="muted small">${esc(x.role_name)} · 辖区 ${x.stores.length} 店</span></div><i class="muted">›</i></div>${workGrid(x.items)}</a>`).join('')}
  <p class="muted small">* 带星号的为模拟数据（督导、拜访、招聘等暂无系统记录），其余来自 App 内的巡店、抽查、培训和整改记录。</p>
  <a class="ldr link" href="#/people"><b>人事档案与人才梯队</b><span class="muted small">店长及以下全员资料、资历、业绩、预警 ›</span></a>`;
  $('#more').onclick = e => moreMenu(e.currentTarget);
}
VIEWS.leader = async id => {
  const [d, h] = await Promise.all([api('/region/people'), api('/hr/person/' + id)]);
  const x = d.people.find(p => p.id === Number(id));
  if (!x) throw new Error('无权查看');
  const pf = h.profile, sm = x.level === 'store_manager';
  const sids = sm ? S.meta.stores.filter(s => x.stores.includes(s.name)) : [];
  $('#main').innerHTML = `<div class="pghd"><b>${esc(x.name)} · ${esc(x.role_name)}</b></div>
  <div class="ldr"><div class="ldr-h"><span class="av">${esc(x.name.slice(0, 1))}</span><div class="grow"><b>${esc(x.name)}</b><span class="muted small">${esc(x.stores.join('、'))}</span><span class="muted small">入职 ${esc(pf.hire)} · 司龄 ${pf.tenure} 年 · ${esc(pf.edu)}</span></div>
    ${sm ? `<div class="ldr-s"><b>${x.total}</b><span>区域第 ${x.rank}/${d.sm_count}</span></div>` : ''}</div>
    ${sm ? dimBars(x.dims) + `<div class="row between ldr-t"><span class="muted small">近 6 月综合分</span>${spark(x.trend)}<span class="small muted">${x.trend.join(' · ')}</span></div>` : ''}</div>
  <div class="sec-t2">本月工作清单 · 管店 / 巡店 / 培训 / 指导</div><div class="ldr">${workGrid(x.items)}</div>
  ${d.alerts.filter(a => a.who.id === x.id).map(a => `<div class="iss-i"><span class="tag ${LV_TAG[a.level]}">${esc(a.type)}</span><span>${esc(a.text)}</span></div>`).join('')}
  ${sm ? `<div class="sec-t2">管辖门店</div>${sids.map(s => `<div class="iss"><a class="iss-h" href="#/home?view=store&store=${s.id}"><b>${esc(s.name)}</b><span class="muted small">进入门店首页</span><i>›</i></a>
      <div class="row iss-a"><a class="btn sm" href="#/tasks?store=${s.id}">任务明细</a><a class="btn sm" href="#/rect?store=${s.id}">整改</a><a class="btn sm" href="#/patrol?new=1&store=${s.id}">加入巡店计划</a><a class="btn sm" data-follow="${s.id}">指派跟进</a><a class="btn primary sm" href="#/focus?new=1&store=${s.id}">重点跟踪</a></div></div>`).join('')}` : ''}
  <div class="sec-t2">岗位履历</div><div class="list tl">${pf.history.slice().reverse().map(r => `<div class="task"><div class="t mono">${esc(r.from.slice(0, 7))}</div><div class="b"><div class="ttl">${esc(r.role)}</div><div class="muted small">${esc(r.store)}</div></div></div>`).join('')}</div>
  <a class="ldr link" href="#/hrp/${x.id}"><b>完整人事档案</b><span class="muted small">资料、证照、历史业绩、培训记录 ›</span></a>`;
  bindFollow();
};
async function hrBoard(home) {
  const p = qs(), d = await api('/hr/people');
  const sf = p.get('s') || '', rf = p.get('r') || '', tf = p.get('t') || '';
  const go = (k, v) => { const q = new URLSearchParams(p); v ? q.set(k, v) : q.delete(k); return `#/${home ? 'home' : 'people'}?${q}`; };
  const list = d.list.filter(x => (!sf || x.store.includes(sf)) && (!rf || x.role_name === rf) && (!tf || (tf === 'alert' ? x.alerts.length : x.tier === tf)));
  const alerts = d.list.flatMap(x => x.alerts.map(a => ({ ...a, x }))).sort((a, b) => 'hml'.indexOf(a.level[0]) - 'hml'.indexOf(b.level[0]));
  const cnt = t => d.list.filter(x => x.tier === t).length;
  const roles = [...new Set(d.list.map(x => x.role_name))];
  $('#main').innerHTML = `${home ? `<div class="storebar"><button class="storename" disabled>${esc(S.me.region_name || '华东一区')} · 人员 ${d.list.length} 人</button>
    <a class="ib" href="#/me">${icon('me')}<span>${esc(CENTER[S.me.level])}</span></a><button class="ib" id="more">${icon('more')}<span>更多</span></button></div>${plBar('ren')}` : '<div class="pghd"><b>人事档案与人才梯队</b></div>'}
  <section class="brief rg"><div class="btabs"><a class="on">人员看板</a><span class="muted small">店长及以下 · 近 3 月业绩</span></div>
    <div class="rkpi">${[['在册人数', d.list.length, '', ''], ['人员预警', alerts.length, 'alert', 'bad'], ['试用期', d.list.filter(x => x.in_probation).length, '', ''], ['可晋升', cnt('可晋升'), '可晋升', ''], ['稳定', cnt('稳定'), '稳定', ''], ['需辅导', cnt('需辅导'), '需辅导', 'bad']]
      .map(([l, v, t, c]) => `<a href="${go('t', t)}#list" class="${v && c ? c : ''} ${tf && tf === t ? 'sel' : ''}"><b>${v}</b><span>${l}</span></a>`).join('')}</div></section>
  <div class="sec-t2 row between"><span>人员预警 · ${alerts.length}</span><span class="muted small">试用期、证照、不合格、未获肯定</span></div>
  ${(() => { const row = a => `<a class="task" href="#/hrp/${a.x.id}"><div class="b"><div class="ttl">${esc(a.x.name)} <span class="muted small">${esc(a.x.role_name)} · ${esc(a.x.store)}</span></div><div class="muted small">${esc(a.text)}</div></div><span class="tag ${LV_TAG[a.level]}">${esc(a.type)}</span></a>`;
    return alerts.length ? `<div class="list">${alerts.slice(0, 5).map(row).join('')}</div>${alerts.length > 5 ? `<details class="tgrp" data-k="hral" ${S.open?.hral ? 'open' : ''}><summary>其余预警 <em>${alerts.length - 5} 项</em><i>${S.open?.hral ? '收起' : '展开'}</i></summary><div class="tgb">${alerts.slice(5).map(row).join('')}</div></details>` : ''}` : '<div class="list"><div class="empty">暂无预警</div></div>'; })()}
  <div class="sec-t2">关键岗位储备</div>
  <div class="bench">${d.bench.map(b => `<div class="iss"><b>${esc(b.store)}</b>${b.roles.map(r => `<div class="iss-i"><span class="tag ${r.candidates.length ? 'ok' : 'bad'}">${esc(r.role)}</span><span>${r.candidates.length ? r.candidates.map(c => `<a href="#/hrp/${c.id}">${esc(c.name)}</a><span class="muted small">（${esc(c.role_name)}）</span>`).join('、') : '<span class="bad">无储备人选</span>'}</span></div>`).join('')}</div>`).join('')}</div>
  <div class="sec-t2" id="list">人员档案 · ${list.length}</div>
  <div class="hrf"><select data-k="s"><option value="">全部门店</option>${S.meta.stores.map(s => `<option ${sf === s.name ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
    <select data-k="r"><option value="">全部岗位</option>${roles.map(r => `<option ${rf === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
    <select data-k="t"><option value="">全部梯队</option>${['可晋升', '稳定', '需辅导'].map(r => `<option ${tf === r ? 'selected' : ''}>${r}</option>`).join('')}<option value="alert" ${tf === 'alert' ? 'selected' : ''}>有预警</option></select></div>
  ${Object.entries(list.reduce((g, x) => ((g[x.level === 'store_manager' ? '店长' : x.store] ||= []).push(x), g), {})).map(([g, xs], gi) => { const k = 'hrg' + g, op = S.open?.[k] ?? (gi === 0 || !!(sf || rf || tf));
    return `<details class="tgrp" data-k="${esc(k)}" ${op ? 'open' : ''}><summary>${esc(g)} <em>${xs.length} 人 · 预警 ${xs.filter(x => x.alerts.length).length}</em><i>${op ? '收起' : '展开'}</i></summary><div class="tgb">${xs.map(x => `<a class="task hrow" href="#/hrp/${x.id}"><span class="av s">${esc(x.name.slice(0, 1))}</span><div class="b"><div class="ttl">${esc(x.name)} <span class="tag ${TIER_TAG[x.tier]}">${x.tier}</span>${x.alerts.length ? ` <span class="tag bad">预警 ${x.alerts.length}</span>` : ''}</div>
      <div class="muted small">${esc(x.role_name)} · ${esc(x.store)} · 司龄 ${x.tenure} 年${x.in_probation ? ' · 试用期' : ''}</div><div class="muted small">30 天完成 ${pct(x.s30.rate)} · 合格 ${pct(x.s30.pass)} · 肯定 ${x.s30.good}${x.s30.bad ? ` · <span class="bad">不合格 ${x.s30.bad}</span>` : ''}</div></div>
      <div class="r">${spark(x.trend)}<b class="gd g${x.avg3 >= 92 ? 'A' : x.avg3 >= 85 ? 'B' : x.avg3 >= 75 ? 'C' : 'D'}">${x.avg3}</b></div></a>`).join('')}</div></details>`; }).join('') || '<div class="list"><div class="empty">没有符合条件的人员</div></div>'}
  <p class="muted small">档案资料、证照、履历和无系统记录月份的业绩为模拟数据；有任务记录的月份按「完成率 50% + 合格率 30% + 准时率 20%」计算。</p>`;
  if (home) $('#more').onclick = e => moreMenu(e.currentTarget);
  document.querySelectorAll('.hrf select').forEach(el => el.onchange = () => { location.hash = go(el.dataset.k, el.value); });
  bindBoard();
}
VIEWS.people = () => hrBoard(false);
VIEWS.hrp = async id => {
  const h = await api('/hr/person/' + id), pf = h.profile, t = S.me.today;
  $('#main').innerHTML = `<div class="pghd"><b>人事档案 · ${esc(h.name)}</b></div>
  <div class="ldr"><div class="ldr-h"><span class="av">${esc(h.name.slice(0, 1))}</span><div class="grow"><b>${esc(h.name)} <span class="tag ${TIER_TAG[h.tier]}">${h.tier}</span></b><span class="muted small">${esc(h.role_name)} · ${esc(h.store)}</span></div>
    <div class="ldr-s"><b>${h.avg3}</b><span>近 3 月均分</span></div></div>
    ${h.alerts.map(a => `<div class="iss-i"><span class="tag ${LV_TAG[a.level]}">${esc(a.type)}</span><span>${esc(a.text)}</span></div>`).join('')}</div>
  <div class="sec-t2">基本资料</div><div class="ldr"><div class="kv">${[['性别', pf.gender], ['年龄', pf.age + ' 岁'], ['学历', pf.edu], ['手机', pf.phone || '-'], ['入职日期', pf.hire], ['司龄', pf.tenure + ' 年'], ['试用期', pf.in_probation ? `至 ${pf.probation_end}` : `已转正（${pf.probation_end}）`]].map(([k, v]) => `<div>${k}</div><div>${esc(v)}</div>`).join('')}</div></div>
  <div class="sec-t2">证照</div><div class="list">${pf.certs.map(c => `<div class="task"><div class="b"><div class="ttl">${esc(c.name)}</div><div class="muted small">有效期至 ${esc(c.expire)}</div></div><span class="tag ${c.expire < t ? 'bad' : c.expire <= L30() ? 'warn' : 'ok'}">${c.expire < t ? '已过期' : c.expire <= L30() ? '即将到期' : '有效'}</span></div>`).join('')}</div>
  <div class="sec-t2">资历 · 岗位履历</div><div class="list tl">${pf.history.slice().reverse().map((r, i) => `<div class="task"><div class="t mono">${esc(r.from.slice(0, 7))}</div><div class="b"><div class="ttl">${esc(r.role)}${i === 0 ? ' <span class="tag acc">现任</span>' : ''}</div><div class="muted small">${esc(r.store)}</div></div></div>`).join('')}</div>
  <div class="sec-t2 row between"><span>历史业绩 · 近 6 月</span><span class="muted small">A≥92 · B≥85 · C≥75</span></div>
  <div class="ldr"><div class="pbars">${h.perf.map(m => `<div><b class="gd g${m.grade}">${m.grade}</b><i><em style="height:${m.score}%;background:${rateColor(m.score)}"></em></i><span>${Number(m.ym.slice(5))}月</span><small>${m.score}</small></div>`).join('')}</div>
    <div class="ptab">${h.perf.slice().reverse().map(m => `<div><span>${esc(m.ym)}</span><span>${m.real ? `完成 ${pct(m.rate)} · 合格 ${pct(m.pass)} · 肯定 ${m.good}${m.bad ? ` · 不合格 ${m.bad}` : ''}` : '<em class="muted">模拟 · 无系统记录</em>'}</span><b>${m.score}</b></div>`).join('')}</div></div>
  <div class="sec-t2">近 30 天日常表现</div><div class="ldr">${workGrid([['任务完成率', h.s30.rate ?? '-', '%'], ['抽查合格率', h.s30.pass ?? '-', '%'], ['获得肯定', h.s30.good, '次'], ['不合格', h.s30.bad, '次']])}</div>
  <div class="sec-t2">培训档案 · ${h.trainings.length}</div><div class="list">${h.trainings.map(r => `<div class="task"><div class="b"><div class="ttl">${esc(r.training)}</div><div class="muted small">触发问题：${esc(r.title || r.reason || '-')}${r.creator ? ' · ' + esc(r.creator) + '安排' : ''} · ${esc((r.created_at || '').slice(0, 10))}</div></div>${rectStatus(r)}</div>`).join('') || '<div class="empty">暂无培训记录</div>'}</div>
  <div class="sec-t2">最近点评</div><div class="list">${h.checks.map(c => `<div class="task"><div class="t mono">${esc(c.date.slice(5))}</div><div class="b"><div class="ttl">${esc(c.title)}</div><div class="muted small">${esc(c.check_comment || '')}</div></div>${checkTag(c)}</div>`).join('') || '<div class="empty">暂无点评</div>'}</div>`;
};

async function staffHome() {
  const p = qs();
  const sid = pickStore(p.get('store'));
  const date = p.get('date') || S.me.today;
  const [h, rs] = await Promise.all([api(`/home?store=${sid}&date=${date}&mine=1`), api('/rectifications?mine=1')]);
  const all = [...h.tabs.day, ...h.tabs.week.filter(t => t.date === date), ...h.tabs.month.filter(t => t.date === date), ...h.tabs.once.filter(t => t.date === date)];
  const done = all.filter(t => t.status === 'done'), pend = all.filter(t => t.status !== 'done').sort((a, b) => a.due_time.localeCompare(b.due_time));
  const next = pend[0], od = pend.filter(t => t.overdue), r = all.length ? Math.round(done.length * 100 / all.length) : null;
  const openR = rs.filter(x => x.status !== 'closed');
  const fb = all.filter(t => t.check_result);
  const apps = [...new Set(all.flatMap(appsFor))].slice(0, 6);
  const hr = Number(S.me.now.slice(0, 2)), hi = hr < 11 ? '早上好' : hr < 14 ? '中午好' : hr < 18 ? '下午好' : '晚上好';
  const groups = {};
  for (const t of all) (groups[t.scene_name || '其他'] ||= []).push(t);
  $('#main').innerHTML = `<div class="sf-hd"><div><b>${hi}，${esc(S.me.name)}</b><div class="small">${esc(S.me.role_name)} · ${esc(storeName(sid))}</div></div><span class="sp"></span>${calMini(date, 'w')}<button class="ib w" id="more">${icon('more')}<span>更多</span></button></div>
  ${plBar('ops', sid)}
  <div class="sf-sum"><div class="ring">${gauge(r, 104, 10, rateColor(r))}<div class="rv"><b>${r ?? '-'}</b><small>${r == null ? '' : '%'}</small><span>${done.length}/${all.length}</span></div></div>
    <div class="sf-kv"><a href="#/my"><b>${pend.length}</b><span>待完成</span></a><a href="#/my" class="${od.length ? 'bad' : ''}"><b>${od.length}</b><span>已超时</span></a><a href="#/my-rect" class="${openR.length ? 'warn' : ''}"><b>${openR.length}</b><span>待整改</span></a><a href="#/my"><b>${fb.filter(t => t.check_result === 'good').length}</b><span>获肯定</span></a></div></div>
  <div class="mtiles">${(S.me.lead ? [['#/my', '我的任务', '任'], ['#/my-rect', '我的整改', '改'], ['assign', '派任务', '派'], ['#/must', '点评跟进', '评'], ['#/crew', '我的团队', '队'], ['#/standards', '品牌标准', '标'], ['#/feed', '群拍墙', '拍'], ['#/repair', '工程报修', '修']] : [['#/my', '我的任务', '任'], ['#/my-rect', '我的整改', '改'], ['#/repair', S.me.role_name === '工程' ? '维修工单' : '工程报修', '修'], ['#/standards', '品牌标准', '标']]).map(([h2, l, c], i) => `<a ${h2 === 'assign' ? 'id="asg"' : `href="${h2}"`}><span class="tic" style="background:${TILE_COLORS[i % TILE_COLORS.length]}">${c}</span><span>${l}</span></a>`).join('')}</div>
  ${next ? `<a class="sf-next" href="#/task/${next.id}"><div class="small">下一项任务 · ${next.overdue ? '<b style="color:#FFD2D2">已超时</b>' : '截止 ' + esc(next.due_time)}</div><b>${esc(next.title)}</b><div class="small">${esc(next.scene_name || '')} ${next.covered ? '· 顶岗替 ' + esc(next.orig_name) : ''}${next.need_photo ? ' · 需拍照' : ''}</div><span class="gbtn go">去完成 →</span></a>`
    : `<div class="sf-next done"><b>${all.length ? '今天的任务都完成了' : '今天没有任务'}</b><div class="small">${all.length ? '辛苦了，店长会随机抽查' : ''}</div></div>`}
  ${openR.length ? `<div class="sec-t2">我的整改</div><div class="list">${openR.slice(0, 3).map(x => `<a class="task" href="#/my-rect"><div class="b"><div class="ttl">${esc(x.task)}</div><div class="muted small">${esc(x.reason || '')} · 截止 ${esc(x.deadline)}</div></div>${rectStatus(x)}</a>`).join('')}</div>` : ''}
  ${fb.length ? `<div class="sec-t2">店长反馈</div><div class="list">${fb.map(t => `<a class="task" href="#/task/${t.id}"><div class="b"><div class="ttl">${esc(t.title)}</div><div class="muted small">${esc(t.check_comment || '')}</div></div>${checkTag(t)}</a>`).join('')}</div>` : ''}
  <div class="sec-t2">今日工作 · 按场景</div><div class="scgrid">${Object.entries(groups).map(([g, ts]) => { const d2 = ts.filter(t => t.status === 'done').length, rr = Math.round(d2 * 100 / ts.length), o2 = ts.filter(t => t.overdue).length;
    return `<a class="scb ${o2 ? 'od' : ''}" data-go="${esc(g)}"><div class="row between"><b>${esc(g)}</b>${gauge(rr, 38, 4, rateColor(rr))}</div><div class="big">${d2}<small>/${ts.length}</small></div><div class="muted small">最早 ${esc(ts.map(t => t.due_time).sort()[0])}</div>${o2 ? `<span class="tag bad">超时 ${o2}</span>` : ''}</a>`; }).join('') || '<div class="empty">没有任务</div>'}</div>
  ${S.me.lead ? `<div id="lead"></div>` : ''}
  ${apps.length ? `<div class="sec-t2">常用系统</div><div class="approw">${apps.map(k => `<a href="#/app/${k}" class="appchip"><span style="background:${APPS[k].color}">${APPS[k].name.replace('易', '').slice(0, 1)}</span>${APPS[k].name}</a>`).join('')}</div>` : ''}`;
  $('#more').onclick = e => moreMenu(e.currentTarget);
  $('#cal').onclick = () => calSheet(sid, date, d => { location.hash = '#/home?date=' + d; });
  if (S.me.lead) Promise.all([api(`/team?store=${sid}`), api(`/must?store=${sid}`)]).then(([team, must]) => {
    $('#asg').onclick = () => sheet(team.map(m => [`${esc(m.name)} <span class="muted small">${esc(m.role_name)}</span>`, () => assignModal(m, sid)]), '派任务给');
    const rv = must.filter(x => x.kind !== 'self');
    $('#lead').innerHTML = `<div class="sec-t2 row between"><span>待我点评 / 跟进</span><a href="#/must" class="small">全部 ${rv.length} ›</a></div><div class="list">${rv.slice(0, 4).map(mustRow).join('') || '<div class="empty">下级今天暂无待点评</div>'}</div>
      <div class="sec-t2 row between"><span>我的团队 · ${team.length} 人</span><a href="#/crew" class="small">全部 ›</a></div><div class="crews">${team.slice(0, 6).map(crewCard).join('')}</div>`;
  });
  document.querySelectorAll('[data-go]').forEach(el => el.onclick = () => { location.hash = '#/group?' + new URLSearchParams({ store: sid, date, tab: 'day', g: el.dataset.go }); });
}

// ---------- 店长 / 负一级管理者 ----------
const TEAM = t => S.me.can.manage || (S.me.team || []).includes(t.assignee_id);
const calMini = (date, cls = '') => `<button class="calmini ${cls}" id="cal">${icon('cal')}<span>${Number(date.slice(5, 7))}月${Number(date.slice(8))}日 周${CN_WD[(new Date(date + 'T00:00:00').getDay() + 6) % 7]}</span><i>▾</i></button>`;
const RHYTHM = [['08:30', '早会交班'], ['09:00', '早餐高峰'], ['11:00', '预抵核对'], ['14:00', '退房查房'], ['18:00', '入住高峰'], ['21:00', '日结复盘'], ['23:30', '夜审']];
const MUST_TAG = { self: 'acc', focus: 'bad', zero: 'bad', review: 'warn', again: 'warn', late: 'bad', spot: 'acc' };
const pct = v => (v == null ? '-' : v + '%');
function rhythmBar() {
  const now = S.me.now; let cur = -1; RHYTHM.forEach(([t], i) => { if (t <= now) cur = i; });
  return `<div class="rhythm">${RHYTHM.map(([t, l], i) => `<div class="${i === cur ? 'on' : i < cur ? 'past' : ''}"><b>${t}</b><span>${l}</span></div>`).join('')}</div>`;
}
const mustRow = x => `<a class="task" href="#/task/${x.t.id}"><div class="t mono">${esc(x.t.due_time)}</div><div class="b"><div class="ttl">${esc(x.t.title)}</div><div class="muted small">${esc(x.t.scene_name || '')} · ${esc(x.t.assignee_name || '')}</div></div><span class="tag ${MUST_TAG[x.kind]}">${esc(x.reason)}</span></a>`;
const crewCard = m => `<a class="crew" href="#/person/${m.id}"><span class="av">${esc(m.name.slice(0, 1))}</span><b>${esc(m.name)}</b><span class="muted small">${esc(m.role_name)}</span>
  ${m.leave ? '<span class="tag warn">休息</span>' : `<span class="small">${m.today.done}/${m.today.total}${m.today.overdue ? ` · <em class="bad">超时${m.today.overdue}</em>` : ''}</span>`}<span class="muted small">30天合格 ${pct(m.s30.pass)}</span></a>`;
async function managerHome() {
  const p = qs();
  const sid = pickStore(p.get('store'));
  const date = S.me.today;
  const [h, team, must, up, rs] = await Promise.all([api(`/home?store=${sid}&date=${date}`), api(`/team?store=${sid}`), api(`/must?store=${sid}`), api(`/upper?store=${sid}`), api(`/rectifications?store=${sid}`)]);
  const all = h.tabs.day, done = all.filter(t => t.status === 'done'), r = all.length ? Math.round(done.length * 100 / all.length) : null;
  const toCheck = all.filter(t => t.status === 'done' && !t.check_result).length, od = all.filter(t => t.overdue).length;
  const openR = rs.filter(x => x.status !== 'closed').length, upN = up.focus.length + up.rects.length;
  const groups = {}; for (const t of all) (groups[t.scene_name || '其他'] ||= []).push(t);
  const top = ts => { const c = {}; ts.forEach(t => { c[t.assignee_name] = (c[t.assignee_name] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0]).join('、'); };
  const tiles = [['#/flex', '派定制任务', '派', ''], ['#/upper', '上级安排', '上', upN], ['#/assign', '场景分配', '景', ''], ['#/must', '今日巡查', '巡', must.length], ['#/crew', '点评员工', '评', toCheck], ['#/rect', '培训整改', '训', openR], ['#/leave', '休息顶岗', '岗', ''], ['handover', '一键交班', '交', '']];
  $('#main').innerHTML = `<div class="storebar"><button class="storename" id="sw" ${S.meta.stores.length > 1 ? '' : 'disabled'}>${esc(storeName(sid))}${S.meta.stores.length > 1 ? '<i>▾</i>' : ''}</button>
    ${calMini(date)}<a class="ib" href="#/me">${icon('me')}<span>${esc(CENTER[S.me.level])}</span></a><button class="ib" id="more">${icon('more')}<span>更多</span></button></div>
  ${plBar('ops', sid)}
  ${rhythmBar()}
  <div class="sf-sum"><div class="ring">${gauge(r, 104, 10, rateColor(r))}<div class="rv"><b>${r ?? '-'}</b><small>${r == null ? '' : '%'}</small><span>${done.length}/${all.length}</span></div></div>
    <div class="sf-kv"><a href="#/home?view=store&store=${sid}"><b>${all.length - done.length}</b><span>待完成</span></a><a href="#/must" class="${od ? 'bad' : ''}"><b>${od}</b><span>已超时</span></a><a href="#/must" class="${toCheck ? 'warn' : ''}"><b>${toCheck}</b><span>待点评</span></a><a href="#/rect" class="${openR ? 'warn' : ''}"><b>${openR}</b><span>待整改</span></a></div></div>
  <div class="sec-t2">我的工作</div>
  <div class="mtiles">${tiles.map(([h2, l, c, n], i) => `<a ${h2 === 'handover' ? 'id="ho"' : `href="${h2}"`}><span class="tic" style="background:${TILE_COLORS[i % TILE_COLORS.length]}">${c}</span><span>${l}</span>${n ? `<b class="badge">${n}</b>` : ''}</a>`).join('')}</div>
  ${upN ? `<div class="sec-t2 row between"><span>上级安排</span><a href="#/upper" class="small">全部 ${upN} ›</a></div><div class="list">${up.focus.slice(0, 2).map(f => `<a class="task" href="#/upper"><div class="b"><div class="ttl">${esc(f.title)}</div><div class="muted small">${esc(f.creator || '区域')} 下发 · 每日 ${esc(f.due_time)} · ${esc(f.assignee_name || '')} 落实 · 历史执行 ${pct(f.rate)}</div></div>${f.today ? `<span class="tag ${f.today.status === 'done' ? 'ok' : 'warn'}">${f.today.status === 'done' ? '今日已落实' : '今日待落实'}</span>` : ''}</a>`).join('')}
    ${up.rects.slice(0, 2).map(x => `<a class="task" href="#/rect"><div class="b"><div class="ttl">${esc(x.task)}</div><div class="muted small">${esc(x.creator_role)} ${esc(x.creator)} · ${esc(x.assignee_name || '')} · 截止 ${esc(x.deadline)}</div></div>${rectStatus(x)}</a>`).join('')}</div>` : ''}
  <div class="sec-t2 row between"><span>今日必做推荐</span><a href="#/must" class="small">全部 ${must.length} ›</a></div>
  <div class="list">${must.slice(0, 5).map(mustRow).join('') || '<div class="empty">今天没有推荐巡查项</div>'}</div>
  <div class="sec-t2">场景运营</div>
  <div class="scgrid">${Object.entries(groups).map(([g, ts]) => { const d2 = ts.filter(t => t.status === 'done').length, rr = Math.round(d2 * 100 / ts.length), o2 = ts.filter(t => t.overdue).length;
    return `<a class="scb ${o2 ? 'od' : ''}" data-go="${esc(g)}"><div class="row between"><b>${esc(g)}</b>${gauge(rr, 38, 4, rateColor(rr))}</div><div class="big">${d2}<small>/${ts.length}</small></div><div class="muted small">${esc(top(ts))}</div>${o2 ? `<span class="tag bad">超时 ${o2}</span>` : ''}</a>`; }).join('')}</div>
  <div class="sec-t2 row between"><span>我的团队</span><a href="#/crew" class="small">全部 ${team.length} ›</a></div>
  <div class="crews">${team.slice(0, 8).map(crewCard).join('')}</div>`;
  $('#more').onclick = e => moreMenu(e.currentTarget);
  $('#cal').onclick = () => calSheet(sid, date, d => { location.hash = '#/home?' + new URLSearchParams({ view: 'store', store: sid, date: d }); });
  if (S.meta.stores.length > 1) $('#sw').onclick = () => sheet(S.meta.stores.map(s => [esc(s.name), () => { S.store = s.id; localStorage.lt_store = s.id; location.hash = '#/home?store=' + s.id; }]), '切换门店');
  $('#ho').onclick = () => handoverModal(team);
  document.querySelectorAll('[data-go]').forEach(el => el.onclick = () => { location.hash = '#/group?' + new URLSearchParams({ store: sid, date, tab: 'day', g: el.dataset.go }); });
}
function formModal(title, body, onSubmit) {
  modal(title, `<form id="mf">${body}<div class="row" style="margin-top:12px"><span class="sp"></span><button type="button" class="btn" data-close>取消</button><button class="btn primary">确定</button></form>`);
  $('#mf').onsubmit = async e => { e.preventDefault(); if (await onSubmit(formData(e.target))) { closeModal(); route(); } };
}
function handoverModal(team) {
  formModal('一键交班', `<p class="muted small">把我今天未完成的任务全部移交给接手人，接手人会收到提醒，任务显示为「顶岗」。</p>
    <label class="f"><span>接手人</span><select name="to" required>${team.filter(m => !m.leave).map(m => `<option value="${m.id}">${esc(m.name)} · ${esc(m.role_name)}</option>`).join('')}</select></label>
    <label class="f"><span>交班说明</span><textarea name="note" placeholder="例如：812 房投诉待回访，晚班请跟进"></textarea></label>`,
  d => act(() => api('/handover', { to_user_id: Number(d.to), note: d.note }), '已交班'));
}
function assignModal(u, sid) {
  const scenes = S.meta.scenes || [];
  formModal(`给 ${u.name} 派任务`, `<label class="f"><span>任务名称</span><input name="title" required placeholder="例如：每日 9:00 早餐台补餐检查"></label>
    <label class="f"><span>执行标准</span><textarea name="standard" placeholder="写清楚做到什么程度、怎么反馈"></textarea></label>
    <div class="row" style="gap:8px"><label class="f" style="flex:1"><span>场景</span><select name="scene_id">${scenes.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
    <label class="f" style="flex:1"><span>频次</span><select name="recur"><option value="once">一次性</option><option value="daily">每天</option><option value="weekly">每周</option></select></label></div>
    <div class="row" style="gap:8px"><label class="f" style="flex:1"><span>开始日期</span><input type="date" name="start_date" value="${S.me.today}"></label><label class="f" style="flex:1"><span>完成时间</span><input type="time" name="due_time" value="15:00"></label></div>
    <label class="chk"><input type="checkbox" name="need_photo"> 需要拍照反馈</label>`,
  d => act(() => api('/flex', { ...d, store_id: sid, assignee_id: u.id, scene_id: Number(d.scene_id) || null, recur_val: d.recur === 'weekly' ? new Date(d.start_date + 'T00:00:00').getDay() || 7 : null, need_photo: !!d.need_photo }), '已派发'));
}
function trainModal(u, sid, topic) {
  formModal(`给 ${u.name} 安排培训`, `<label class="f"><span>培训内容</span><textarea name="c" required>${esc(topic || '')}</textarea></label>
    <div class="row" style="gap:8px"><label class="f" style="flex:1"><span>培训日期</span><input type="date" name="d" value="${S.me.today}"></label><label class="f" style="flex:1"><span>时间</span><input type="time" name="tm" value="16:00"></label></div>
    <p class="muted small">员工学完后在任务里确认（需拍照或写心得），由你复查后关闭。</p>`,
  d => act(() => api('/flex', { store_id: sid, assignee_id: u.id, title: '【培训】' + d.c.split('\n')[0].slice(0, 30), standard: d.c + '\n完成后写明学习要点，由上级复查。', recur: 'once', start_date: d.d, due_time: d.tm }), '已安排培训'));
}
VIEWS.upper = async () => {
  const sid = pickStore(qs().get('store'));
  const up = await api(`/upper?store=${sid}`);
  $('#main').innerHTML = `<h1>上级安排 · ${esc(storeName(sid))}</h1>
  <div class="sec-t2">重点跟踪任务</div><div class="list">${up.focus.map(f => `<div class="task"><div class="b"><div class="ttl">${esc(f.title)}</div><div class="muted small">${esc(f.creator || '')} 下发 · ${f.recur === 'once' ? '一次性' : '每日'} ${esc(f.due_time)} · 落实人 ${esc(f.assignee_name || '-')} · 历史执行率 ${pct(f.rate)}</div><div class="small">${esc(f.standard || '')}</div></div>
      ${f.today ? `<a class="tag ${f.today.status === 'done' ? 'ok' : 'warn'}" href="#/task/${f.today.id}">${f.today.status === 'done' ? '今日已落实' : '今日待落实 ›'}</a>` : '<span class="tag">今日无</span>'}</div>`).join('') || '<div class="empty">暂无</div>'}</div>
  <div class="sec-t2">上级下发的整改</div><div class="list">${up.rects.map(x => `<a class="task" href="#/rect"><div class="b"><div class="ttl">${esc(x.task)}</div><div class="muted small">${esc(x.creator_role)} ${esc(x.creator)} · ${esc(x.reason || '')} · ${esc(x.assignee_name || '')} 截止 ${esc(x.deadline)}</div></div>${rectStatus(x)}</a>`).join('') || '<div class="empty">暂无</div>'}</div>
  <div class="sec-t2">巡店</div><div class="list">${up.patrols.map(x => `<a class="task" href="#/patrol/${x.id}"><div class="t mono">${esc((x.done_at || x.planned_date || '').slice(5, 10))}</div><div class="b"><div class="ttl">${x.status === 'done' ? '巡店报告' : '计划巡店'}</div><div class="muted small">${esc(x.reason || x.summary || '')}</div></div>${x.status === 'done' ? `<span class="tag ${x.score >= 90 ? 'ok' : 'warn'}">${x.score} 分</span>` : '<span class="tag acc">待巡店</span>'}</a>`).join('') || '<div class="empty">暂无</div>'}</div>`;
};
VIEWS.must = async () => {
  const sid = pickStore(qs().get('store'));
  const must = await api(`/must?store=${sid}`);
  const K = [['self', '我亲做'], ['focus', '上级重点跟踪'], ['zero', '清零项'], ['review', 'M2 待复查'], ['again', '昨日不合格复看'], ['late', '超时跟进'], ['spot', 'M3 随机抽查']];
  $('#main').innerHTML = `<h1>今日必做推荐</h1><p class="muted small">系统根据清零项、上级安排、M2 复查、昨日不合格、超时和随机抽查自动排出，逐项点进去完成、复查或点评。</p>
  ${K.map(([k, l]) => { const xs = must.filter(x => x.kind === k); return xs.length ? `<div class="sec-t2">${l} · ${xs.length}</div><div class="list">${xs.map(mustRow).join('')}</div>` : ''; }).join('') || '<div class="list"><div class="empty">今天没有推荐项</div></div>'}`;
};
VIEWS.crew = async () => {
  const sid = pickStore(qs().get('store'));
  const team = await api(`/team?store=${sid}`);
  $('#main').innerHTML = `<h1>我的团队 · ${team.length} 人</h1><div class="crews">${team.map(crewCard).join('') || '<div class="empty">暂无下级</div>'}</div>`;
};
VIEWS.person = async id => {
  const d = await api('/person/' + id), u = d.user, s = d.s30, sid = u.store_id;
  const self = u.id === S.me.id;
  const best = s.scenes.filter(x => x.total >= 3).sort((a, b) => b.rate - a.rate);
  $('#main').innerHTML = `<div class="pf-hd"><span class="pf-av">${esc(u.name.slice(0, 1))}</span><div><b>${esc(u.name)}</b><div class="muted">${esc(u.role_name)} · ${esc(storeName(sid))}${d.leave ? ' · <span class="tag warn">今日休息</span>' : ''}</div></div></div>
  ${self ? '' : `<div class="row" style="gap:8px;margin-bottom:12px"><button class="btn primary" id="as">派任务</button><button class="btn" id="tr">安排培训</button><a class="btn" href="#/leave">休息 / 顶岗</a></div>`}
  <div class="panel"><div class="sec-t2" style="margin-top:0">近 30 天能力画像</div>
    <div class="rings">${[['完成', s.rate], ['准时', s.ontime], ['合格', s.pass]].map(([l, r]) => `<div class="ring">${gauge(r, 84, 8, rateColor(r))}<div class="rv"><b>${r ?? '-'}</b><small>${r == null ? '' : '%'}</small><span>${l}</span></div></div>`).join('')}</div>
    <div class="c3"><div><span>任务</span><b>${s.done}/${s.total}</b></div><div><span>获肯定</span><b>${s.good}</b></div><div><span>需改进 / 培训</span><b>${s.bad} / ${s.training}</b></div></div>
    ${best.length ? `<div class="small" style="margin-top:6px">擅长：${best.slice(0, 2).map(x => `<span class="tag ok">${esc(x.name)} ${x.rate}%</span>`).join(' ')}　薄弱：${(best.length > 1 ? best.slice(-1) : []).filter(x => x.rate < 95 || x.bad).map(x => `<span class="tag warn">${esc(x.name)} ${x.rate}%${x.bad ? ' · 不合格 ' + x.bad : ''}</span>`).join(' ') || '暂无'}</div>` : ''}
    <div class="scbars">${s.scenes.map(x => `<div><span>${esc(x.name)}</span><i><em style="width:${x.rate || 0}%"></em></i><b>${pct(x.rate)}</b></div>`).join('')}</div></div>
  <div class="sec-t2">今日任务 ${d.today.filter(t => t.status === 'done').length}/${d.today.length}</div>
  <div class="list">${d.today.map(t => `<div class="task"><div class="t mono">${esc(t.due_time)}</div><div class="b"><div class="ttl">${esc(t.title)}</div><div>${statusTag(t)} ${checkTag(t)} ${stdTags(t)}</div></div>
    ${!self && t.status === 'done' && !t.check_result ? `<button class="btn primary sm" data-ck="${t.id}">点评</button>` : `<a class="btn sm" href="#/task/${t.id}">查看</a>`}</div>`).join('') || '<div class="empty">今日无任务</div>'}</div>
  <div class="sec-t2">最近点评</div><div class="list">${d.checks.map(t => `<a class="task" href="#/task/${t.id}"><div class="t mono">${esc(t.date.slice(5))}</div><div class="b"><div class="ttl">${esc(t.title)}</div><div class="muted small">${esc(t.check_comment || '')} · ${esc(t.checker_name || '')}</div></div>${checkTag(t)}</a>`).join('') || '<div class="empty">暂无</div>'}</div>
  <div class="sec-t2">培训与整改</div><div class="list">${d.rects.map(x => `<div class="task"><div class="b"><div class="ttl">${esc(x.task)}</div><div class="muted small">${esc(x.title || '')}${x.training ? ' · 培训：' + esc(x.training) : ''} · 截止 ${esc(x.deadline)}</div></div>${rectStatus(x)}</div>`).join('') || '<div class="empty">暂无</div>'}</div>`;
  if (self) return;
  $('#as').onclick = () => assignModal(u, sid);
  $('#tr').onclick = () => trainModal(u, sid, best.length ? `${best[best.length - 1].name}场景标准复训` : '');
  document.querySelectorAll('[data-ck]').forEach(b => b.onclick = () => checkModal(d.today.find(t => t.id === Number(b.dataset.ck))));
};

// ---------- 全角色一体化：四板块（经营 · 运营 · 人 · 加盟商）+ 待我处理 ----------
const PL = { ren: ['团队', '画像 · 梯队'], shop: ['管店', '门店画像'], biz: ['经营', '营收 · 口碑'], ops: ['运营', '任务 · 巡查'], fr: ['加盟商', '业主 · 诉求'] };
const PL_ROLE = { region_manager: ['ren', 'shop', 'biz', 'ops', 'fr'], ops_manager: ['ren', 'shop', 'ops'], sales_manager: ['shop', 'biz', 'ren', 'fr'], hr_manager: ['ren'], dev_manager: ['shop', 'ren'], build_manager: ['shop', 'ren'], train_manager: ['ren'], coach: ['ren', 'shop', 'ops'], hq: ['shop', 'biz', 'ren'], store_manager: ['biz', 'ops', 'ren', 'shop'], lead: ['ops', 'biz', 'ren'], staff: ['ops', 'ren'] };
const REGION_LV = ['region_manager', 'ops_manager', 'sales_manager', 'hr_manager', 'dev_manager', 'build_manager', 'train_manager', 'coach', 'hq'];
const isFrS = sid => (S.meta.stores.find(s => s.id === Number(sid)) || {}).stype === '加盟店';
function plList(sid) {
  const k = S.me.level === 'staff' && S.me.lead ? 'lead' : S.me.level;
  return (PL_ROLE[k] || ['ops']).filter(x => x !== 'biz' || da('biz'));
}
const da = k => (S.me.data_auth || []).includes(k);
const regionTeam = async () => { $('#main').innerHTML = `${plBar('ren')}<div class="pghd"><b>团队</b></div>${da('hrm') || da('care') ? '' : '<p class="muted">暂无团队数据授权，可请区域经理在「数据授权」中开通。</p>'}`; };
const plLab = k => (k === 'ren' && S.me.level === 'staff' ? (S.me.lead ? ['团队', '画像 · 预警'] : ['画像', '我的档案']) : PL[k]);
const plBar = (on, sid) => { const a = plList(sid); return `${a.length > 1 ? `<div class="pltabs n${a.length}">${a.map(k => `<a class="${on === k ? 'on' : ''}" href="#/home?${new URLSearchParams(sid ? { pl: k, store: sid } : { pl: k })}"><b>${plLab(k)[0]}</b><span>${plLab(k)[1]}</span></a>`).join('')}</div>` : ''}<div id="inbox"></div>`; };
const plHead = (title, sw) => `<div class="storebar"><button class="storename" ${sw ? 'id="sw"' : 'disabled'}>${esc(title)}${sw ? '<i>▾</i>' : ''}</button>
  <a class="ib" href="#/me">${icon('me')}<span>${esc(CENTER[S.me.level])}</span></a><button class="ib" id="more">${icon('more')}<span>更多</span></button></div>`;
function bindHead() {
  if ($('#more')) $('#more').onclick = e => moreMenu(e.currentTarget);
  const sw = $('#sw'); if (sw && S.meta.stores.length > 1) sw.onclick = () => sheet(S.meta.stores.map(s => [esc(s.name), () => { S.store = s.id; localStorage.lt_store = s.id; location.hash = '#/home?' + new URLSearchParams({ pl: qs().get('pl') || '', store: s.id }); }]), '切换门店');
}
const regionTitle = () => `${S.me.region_name || '华东一区'} · 辖区 ${S.meta.stores.length} 店`;
VIEWS.home = async () => {
  const lv = S.me.level, p = qs();
  if (p.get('view') === 'store') return storeHome();
  const region = REGION_LV.includes(lv), sid = region ? null : pickStore(p.get('store'));
  const list = plList(sid);
  let pl = p.get('pl') || (p.get('tab') === 'ren' ? 'ren' : '');
  if (!list.includes(pl)) pl = list.includes('ops') ? 'ops' : list[0];
  if (region) await ({ ops: regionHome, biz: regionBiz, ren: lv === 'hr_manager' ? () => hrBoard(true) : lv === 'train_manager' ? VIEWS.train : ['sales_manager', 'dev_manager', 'build_manager', 'hq'].includes(lv) ? regionTeam : regionPeople, fr: regionFr, shop: regionShop }[pl])();
  else if (lv === 'store_manager') await ({ ops: managerHome, biz: () => storeBizView(sid), ren: () => storePeopleView(sid), shop: () => storeShopView(sid) }[pl])();
  else if (pl === 'ren') await (S.me.lead ? storePeopleView(sid) : myPortrait(sid));
  else if (pl === 'biz') await storeBizView(sid);
  else await staffHome();
  if (lv === 'store_manager' && pl === 'ops') loadCockpit(sid);
  if (pl === 'ren' && lv !== 'staff' && lv !== 'train_manager' && da('hrm')) hrmCard(lv === 'store_manager' ? sid : 0);
  if (pl === 'ren' && lv !== 'staff' && lv !== 'train_manager' && da('care')) careCard(lv === 'store_manager' ? sid : 0);
  loadInbox(sid);
};
async function loadYi() {
  const xs = await api('/yi'); if (!xs.length || $('#yi')) return;
  const h = `<div id="yi">${xs.length > 1 ? `<div class="sec-t2">易系列 · 角色模块</div><div class="yig">${xs.map(m => `<a class="yit" href="#/yi?k=${m.k}"><b>${esc(m.name)}</b><span>${esc(m.sub)}</span>${m.alert ? '<i class="dot"></i>' : ''}</a>`).join('')}</div>` : yiCard(xs[0])}</div>`;
  const bar = $('#main .storebar') || $('#main .pghd'); bar ? bar.insertAdjacentHTML('afterend', h) : $('#main').insertAdjacentHTML('afterbegin', h);
}
const yiCard = m => `<section class="yic"><div class="row between"><b>${esc(m.name)}</b><span class="muted small">${esc(m.sub)}</span></div>
  <div class="rkpi">${m.kpis.map(([l, v, u]) => `<a><b>${v}<small>${u}</small></b><span>${esc(l)}</span></a>`).join('')}</div>
  ${m.alert ? `<div class="iss-i"><span class="tag bad">关注</span><span class="small">${esc(m.alert)}</span></div>` : ''}
  <div class="stags">${m.links.map(([h, l]) => `<a class="btn sm" href="${h}">${esc(l)} ›</a>`).join('')}</div></section>`;
VIEWS.yi = async () => { const xs = await api('/yi'), k = qs().get('k'); $('#main').innerHTML = `<div class="pghd"><b>易系列 · 角色模块</b></div>${xs.filter(m => !k || m.k === k).map(yiCard).join('')}${k ? '<p><a href="#/yi">查看全部模块 ›</a></p>' : ''}`; };
async function loadInbox(sid) {
  const el = $('#inbox'); if (!el) return;
  const xs = await api('/inbox' + (sid ? '?store=' + sid : ''));
  if (!$('#inbox')) return;
  const row = (x, i) => `<a class="task ibx" ${x.act ? `data-act="${esc(x.act)}"` : `href="${esc(x.link)}"`} data-i="${i}"><span class="tag ${x.lv}">${esc(x.tag)}</span><div class="b"><div class="ttl">${esc(x.title)}</div>${x.sub ? `<div class="muted small">${esc(x.sub)}</div>` : ''}</div><i class="chev">›</i></a>`;
  el.innerHTML = xs.length ? `<div class="sec-t2 row between"><span>待我处理 · ${xs.length}</span></div><div class="list">${xs.slice(0, 4).map(row).join('')}</div>
    ${xs.length > 4 ? `<details class="tgrp"><summary>其余 ${xs.length - 4} 项 <i>展开</i></summary><div class="list">${xs.slice(4).map((x, i) => row(x, i + 4)).join('')}</div></details>` : ''}` : '';
  el.querySelectorAll('[data-act]').forEach(a => a.onclick = () => inboxAct(a.dataset.act, xs[Number(a.dataset.i)], sid));
}
function inboxAct(code, x, sid) {
  const [k, id] = code.split(':');
  if (k === 'req') return replyReqModal(Number(id), x.title);
  if (k === 'report') return reportModal(sid);
  if (k === 'sugg') return formModal('人事建议 · ' + x.title, `<p class="small">${esc(x.sub)}</p><p><a href="${esc(x.link)}">查看人事档案 ›</a></p>
    <label class="f"><span>处理结果</span><select name="st"><option value="approved">同意，进入转正 / 晋升流程</option><option value="rejected">暂不同意，退回店长</option></select></label>
    <label class="f"><span>回复店长</span><textarea name="r" placeholder="例如：同意，安排下周三晋升面谈"></textarea></label>`, d => act(() => api(`/hr/suggest/${id}/reply`, { status: d.st, reply: d.r }), '已回复店长'));
}
function replyReqModal(id, title) {
  formModal('回复业主诉求', `<p class="small">${esc(title)}</p><label class="f"><span>回复 / 处理意见</span><textarea name="r" required placeholder="例如：管理费方案需结合续约统一谈，下周安排业主沟通会"></textarea></label>
    <label class="f"><span>安排业主沟通会（可选）</span><input type="date" name="m"></label><p class="muted small">选择日期后，会给店长生成「业主沟通会」任务，会后上传纪要；回复同步到店长的加盟商板块。</p>`,
  d => act(() => api(`/owner-reqs/${id}/reply`, { reply: d.r, meeting: d.m || null }), '已回复并同步店长'));
}
function reportModal(sid) {
  formModal('提交店长周报 · ' + storeName(sid), `<p class="muted small">系统已汇总近 7 天的运营执行、经营、口碑和门店画像数据，提交后推送区域经理批复。</p>
    <label class="f"><span>本周小结 / 需要支持</span><textarea name="n" placeholder="例如：早餐断档已整改；下周需营销支持协议客户"></textarea></label>`,
  d => act(() => api('/reports', { store_id: sid, note: d.n }), '周报已提交区域经理'));
}
function taskPreset(sid, title, standard) {
  api(`/team?store=${sid}`).then(team => formModal('转为任务', `<label class="f"><span>任务名称</span><input name="title" required value="${esc(title)}"></label>
    <label class="f"><span>执行标准</span><textarea name="standard">${esc(standard || '')}</textarea></label>
    <div class="row" style="gap:8px"><label class="f" style="flex:1"><span>执行人</span><select name="a">${team.map(m => `<option value="${m.id}">${esc(m.name)} · ${esc(m.role_name)}</option>`).join('')}</select></label>
    <label class="f" style="flex:1"><span>完成时间</span><input type="time" name="due_time" value="17:00"></label></div><label class="chk"><input type="checkbox" name="need_photo" checked> 需要拍照反馈</label>`,
  d => act(() => api('/flex', { store_id: sid, assignee_id: Number(d.a), title: d.title, standard: d.standard, recur: 'once', start_date: S.me.today, due_time: d.due_time, need_photo: !!d.need_photo }), '已派发')));
}
const dl = v => (v == null ? '' : `<em class="${v < 0 ? 'dn' : 'up'}">${v > 0 ? '+' : ''}${v}${typeof v === 'number' ? '%' : ''}</em>`);
const alertRows = xs => xs.map(a => `<div class="iss-i"><span class="tag ${LV_TAG[a.level] || a.level}">${esc(a.type)}</span><span>${esc(a.text)}</span></div>`).join('');
const scoreCard = (sc, link) => `<a class="ldr spc" href="${link}"><div class="ldr-h"><span class="sgd g${sc.grade}">${sc.grade}</span><div class="grow"><b>门店画像 <span class="tag acc">实验</span> <span class="tag ${sc.type_tag}">${esc(sc.type)}</span></b><span class="muted small">${esc(sc.tactic)}</span></div>
  <div class="ldr-s"><b>${sc.total}</b><span>${sc.rank ? `区域第 ${sc.rank}/${sc.of}` : '综合分'}</span></div></div><div class="muted small">短板：${sc.weak.map(w => `${esc(w.l)} ${w.v}`).join(' · ')}</div></a>`;
async function storeBizView(sid, sub) {
  const P = qs(), per = ['day', 'week', 'month'].includes(P.get('per')) ? P.get('per') : 'week';
  const [b, pf] = await Promise.all([api(`/store/${sid}/biz`), api(`/store/${sid}/profile`)]);
  const k = b[per], bg = b.budget, base = sub ? `#/sbiz/${sid}?` : `#/home?pl=biz&store=${sid}&`;
  $('#main').innerHTML = `${sub ? `<div class="pghd"><b>经营 · ${esc(storeName(sid))}</b></div>` : plHead(storeName(sid), S.meta.stores.length > 1) + plBar('biz', sid)}
  ${scoreCard(pf.score, '#/sp/' + sid)}
  <section class="brief rg bz"><div class="btabs"><a class="on">经营看板</a><span class="sp"></span><div class="seg sm">${[['day', '昨日'], ['week', '近7日'], ['month', '近30日']].map(([x, l]) => `<a class="${per === x ? 'on' : ''}" href="${base}per=${x}">${l}</a>`).join('')}</div></div>
    <div class="rkpi">${[['RevPAR', k.revpar, '元', k.revpar_delta], ['出租率', k.occ, '%', k.occ_delta], ['ADR', k.adr, '元', k.adr_delta], ['MPI', k.mpi, '', k.mpi_delta], ['差评', k.bad, '条'], ['点评分', b.score, '']]
      .map(([l, v, u, d], i) => `<a class="${i === 4 && v ? 'bad' : ''}"><b>${v}<small>${u}</small></b><span>${l} ${dl(d)}</span></a>`).join('')}</div><p class="muted small" style="margin:6px 0 0">对比${per === 'day' ? '上周同日' : per === 'week' ? '前 7 日' : '前 30 日'}</p></section>
  <div class="sec-t2 row between"><span>本月预算 · ${bg.days}/${bg.dim} 天</span><span class="muted small">时间进度 ${bg.time_pct}%</span></div>
  <div class="ldr"><div class="bud"><div class="row between"><span>营收 ${bg.rev_mtd} / ${bg.rev_target} 万</span><b class="${bg.ach < bg.time_pct - 3 ? 'bad' : ''}">达成 ${bg.ach}%</b></div><i><em style="width:${Math.min(100, bg.ach)}%"></em><u style="left:${bg.time_pct}%"></u></i></div>
    <div class="wgrid">${[['月累计 RevPAR', bg.mtd_revpar, '元'], ['预算 RevPAR', bg.target_revpar, '元'], ['月底预计', bg.forecast, '万'], ['预计达成', bg.forecast_pct, '%']].map(([l, v, u]) => `<div><b>${v}<small>${u}</small></b><span>${l}</span></div>`).join('')}</div></div>
  ${b.alerts.length ? `<div class="sec-t2">经营预警</div><div class="ldr">${alertRows(b.alerts)}</div>` : ''}
  <div class="sec-t2 row between"><span>宾客口碑 · 近 14 天差评 ${b.reviews.reduce((a, r) => a + r.n, 0)}</span><span class="muted small">点评分 ${b.score}</span></div>
  <div class="list">${b.reviews.map((r, i) => `<div class="task"><div class="t mono">${esc(r.date.slice(5))}</div><div class="b"><div class="ttl">「${esc(r.topic)}」差评 ${r.n} 条</div><div class="muted small">${esc(r.tip)}</div></div>${sub ? '' : `<button class="btn sm" data-rv="${i}">转整改</button>`}</div>`).join('') || '<div class="empty">近 14 天没有差评</div>'}</div>
  <div class="sec-t2 row between"><span>店长周报</span>${!sub && S.me.level === 'store_manager' ? '<button class="btn primary sm" id="rpt">生成并提交</button>' : ''}</div>
  <div class="list">${b.reports.map(r => `<a class="task" href="#/report/${r.id}"><div class="b"><div class="ttl">周报 ${esc(r.period)}</div><div class="muted small">${r.comment ? `${esc(r.reviewer || '区域经理')}：${esc(r.comment)}` : '等待区域经理批复'}</div></div><span class="tag ${r.status === 'reviewed' ? 'ok' : 'warn'}">${r.status === 'reviewed' ? '已批复' : '待批复'}</span></a>`).join('') || '<div class="empty">还没有提交过周报</div>'}</div>
  <p class="muted small">预算、点评、证照为模拟数据，接入 PMS / 点评系统后替换。</p>`;
  bindHead();
  if ($('#rpt')) $('#rpt').onclick = () => reportModal(sid);
  document.querySelectorAll('[data-rv]').forEach(x => x.onclick = () => { const r = b.reviews[Number(x.dataset.rv)]; taskPreset(sid, `【差评整改】${r.topic}`, `${r.date} 差评：${r.topic}\n${r.tip}\n完成后拍照反馈整改结果。`); });
}
VIEWS.sbiz = id => storeBizView(Number(id), true);
async function storePeopleView(sid) {
  const d = await api(`/store/${sid}/people`), L = d.list, sm = S.me.level === 'store_manager';
  const al = L.flatMap(x => x.alerts.map(a => ({ ...a, who: x })));
  const lvo = { high: 0, mid: 1, low: 2 }; al.sort((a, b) => lvo[a.level] - lvo[b.level]);
  const tiers = ['可晋升', '稳定', '需辅导'];
  const arow = a => `<a class="task" href="#/hrp/${a.who.id}"><span class="av s">${esc(a.who.name.slice(0, 1))}</span><div class="b"><div class="ttl">${esc(a.who.name)} <span class="muted small">${esc(a.who.role_name)}</span></div><div class="muted small">${esc(a.text)}</div></div><span class="tag ${LV_TAG[a.level]}">${esc(a.type)}</span></a>`;
  $('#main').innerHTML = `${plHead(storeName(sid), sm && S.meta.stores.length > 1)}${plBar('ren', sid)}
  <section class="brief rg"><div class="btabs"><a class="on">${sm ? '本店人员' : '我的团队'}</a><span class="muted small">与人事档案同一份数据</span></div>
    <div class="rkpi">${[['在册', L.length, '人'], ['预警', L.filter(x => x.alerts.length).length, '人'], ['试用期', L.filter(x => x.in_probation).length, '人'], ...tiers.map(t => [t, L.filter(x => x.tier === t).length, '人'])]
      .map(([l, v, u], i) => `<a class="${i === 1 && v ? 'bad' : ''}"><b>${v}<small>${u}</small></b><span>${l}</span></a>`).join('')}</div></section>
  <div class="sec-t2">人员预警 · ${al.length}</div><div class="list">${al.slice(0, 5).map(arow).join('') || '<div class="empty">暂无预警</div>'}</div>
  ${al.length > 5 ? `<details class="tgrp"><summary>其余 ${al.length - 5} 条 <i>展开</i></summary><div class="list">${al.slice(5).map(arow).join('')}</div></details>` : ''}
  ${d.bench.length ? `<div class="sec-t2">关键岗位储备</div><div class="ldr bench">${d.bench.filter(r => r.role !== '店长').map(r => `<div><b>${esc(r.role)}</b>${r.candidates.length ? r.candidates.map(c => `<a class="tag ok" href="#/hrp/${c.id}">${esc(c.name)}</a>`).join(' ') : '<span class="tag bad">无储备</span>'}</div>`).join('')}</div>` : ''}
  <div class="sec-t2 row between"><span>员工画像 · 按梯队</span><span class="muted small">近 3 月均分</span></div>
  ${tiers.map((t, ti) => { const xs = L.filter(x => x.tier === t); return xs.length ? `<details class="tgrp" ${ti !== 1 ? 'open' : ''}><summary><span class="tag ${TIER_TAG[t]}">${t}</span> <em>${xs.length} 人</em><i>${ti !== 1 ? '收起' : '展开'}</i></summary><div class="tgb">${xs.map(x => `<a class="task hrow" href="#/hrp/${x.id}"><span class="av s">${esc(x.name.slice(0, 1))}</span><div class="b"><div class="ttl">${esc(x.name)} <span class="muted small">${esc(x.role_name)}</span>${x.alerts.length ? ` <span class="tag warn">${x.alerts.length} 预警</span>` : ''}</div>
    <div class="muted small">司龄 ${x.tenure} 年${x.in_probation ? ' · 试用期' : ''} · 30 天完成 ${pct(x.s30.rate)} · 合格 ${pct(x.s30.pass)} · 肯定 ${x.s30.good}</div></div><div class="r">${spark(x.trend)}<b class="gd g${x.avg3 >= 92 ? 'A' : x.avg3 >= 85 ? 'B' : x.avg3 >= 75 ? 'C' : 'D'}">${x.avg3}</b></div></a>`).join('')}</div></details>` : ''; }).join('')}
  ${d.suggests.length ? `<div class="sec-t2">提交给人事的建议</div><div class="list">${d.suggests.map(h => `<a class="task" href="#/hrp/${h.user_id}"><div class="b"><div class="ttl">${esc(h.name)} · ${esc(h.kind)}建议</div><div class="muted small">${esc(h.note)}${h.reply ? ` · 人事：${esc(h.reply)}` : ''}</div></div><span class="tag ${h.status === 'open' ? 'warn' : h.status === 'approved' ? 'ok' : 'bad'}">${h.status === 'open' ? '待人事处理' : h.status === 'approved' ? '已同意' : '已退回'}</span></a>`).join('')}</div>` : ''}
  <p class="muted small">点进员工可查看完整档案，并派任务、安排培训、提交转正 / 晋升建议。档案资料与证照为模拟数据。</p>`;
  bindHead();
}
async function myPortrait(sid) {
  await VIEWS.hrp(S.me.id);
  $('#main').insertAdjacentHTML('afterbegin', `<div class="sf-hd"><div><b>我的画像</b><div class="small">${esc(S.me.role_name)} · ${esc(storeName(sid))}</div></div><span class="sp"></span><button class="ib w" id="more">${icon('more')}<span>更多</span></button></div>${plBar('ren', sid)}`);
  const h = $('.pghd'); if (h) h.remove();
  bindHead();
}
const REQ_ST = { open: ['warn', '待处理'], replied: ['acc', '区域已回复'], closed: ['ok', '已关闭'] };
async function storeFrView(sid, sub) {
  const f = await api('/franchise/' + sid), rm = S.me.level === 'region_manager', sm = S.me.level === 'store_manager';
  const head = sub ? `<div class="pghd"><b>加盟商 · ${esc(storeName(sid))}</b></div>` : plHead(storeName(sid), S.meta.stores.length > 1) + plBar('fr', sid);
  if (f.na) { $('#main').innerHTML = head + '<div class="list"><div class="empty">直营店，没有加盟商板块</div></div>'; return bindHead(); }
  const c = f.contract;
  $('#main').innerHTML = `${head}
  <div class="ldr"><div class="ldr-h"><span class="av">${esc(f.owner.slice(0, 1))}</span><div class="grow"><b>业主 ${esc(f.owner)}</b><span class="muted small">${esc(f.company)} · ${esc(f.phone)}</span></div><div class="ldr-s"><b class="${f.sat < 80 ? 'bad' : ''}">${f.sat}</b><span>业主满意度</span></div></div>
    <div class="kv">${[['合作模式', c.mode], ['合同期', `${c.start} 至 ${c.end}`], ['剩余', `${c.days} 天`], ['欠费', f.arrears ? f.arrears + ' 万元' : '无']].map(([k, v]) => `<div>${k}</div><div>${esc(v)}</div>`).join('')}</div>
    ${alertRows(f.alerts)}</div>
  <div class="sec-t2">投资回报</div><div class="ldr"><div class="wgrid">${[['总投资', f.invest, '万'], ['年营收', f.annual_rev, '万'], ['GOP 率', f.gop_rate, '%'], ['年 GOP', f.annual_gop, '万']].map(([l, v, u]) => `<div><b>${v}<small>${u}</small></b><span>${l}</span></div>`).join('')}</div>
    <div class="bud"><div class="row between"><span>累计回本进度</span><b>${f.payback >= 100 ? `已回本 · ${(f.payback / 100).toFixed(1)} 倍` : f.payback + '%'}</b></div><i><em style="width:${Math.min(100, f.payback)}%"></em></i></div></div>
  <div class="sec-t2">管理费缴纳 · 近 6 月</div><div class="fees">${f.fees.map(x => `<div class="${x.status === '逾期' ? 'bad' : x.status === '待缴' ? 'warn' : ''}"><span>${Number(x.ym.slice(5))}月</span><b>${x.fee}</b><small>${x.status}</small></div>`).join('')}</div>
  <div class="sec-t2 row between"><span>业主诉求与沟通</span>${sm ? '<button class="btn primary sm" id="nreq">+ 登记诉求</button>' : ''}</div>
  <div class="list">${f.reqs.map(o => `<div class="task req"><div class="b"><div class="ttl">${esc(o.title)} <span class="muted small">${esc(o.kind)}</span></div><div class="muted small">${esc(o.body || '')}</div>
    <div class="muted small">${esc((o.created_at || '').slice(5, 16))} ${esc(o.creator || '')} 登记${o.escalated ? ' · 已上报区域' : ''}</div>${o.reply ? `<div class="rply">${esc(o.replier || '区域经理')}：${esc(o.reply)}</div>` : ''}
    <div class="row" style="gap:6px;margin-top:6px">${sm && !o.escalated && o.status === 'open' ? `<button class="btn sm" data-esc="${o.id}">上报区域经理</button>` : ''}${sm && o.status !== 'closed' ? `<button class="btn sm" data-cls="${o.id}">关闭</button>` : ''}${rm && o.status === 'open' ? `<button class="btn primary sm" data-rep="${o.id}">回复 / 安排沟通会</button>` : ''}</div></div>
    <span class="tag ${REQ_ST[o.status][0]}">${REQ_ST[o.status][1]}</span></div>`).join('') || '<div class="empty">暂无诉求</div>'}</div>
  <div class="sec-t2">业主月报</div><div class="list">${f.reports.map(r => `<div class="task"><div class="t mono">${esc(r.ym.slice(5))}月</div><div class="b"><div class="ttl">营收 ${r.rev} 万 · GOP 率 ${r.gop_rate}%</div><div class="muted small">RevPAR ${r.revpar} · 出租率 ${r.occ}% · ADR ${r.adr}</div></div><span class="tag ok">已发送业主</span></div>`).join('')}</div>
  <div class="sec-t2">改造与投入计划</div><div class="list">${f.plans.map(p => `<div class="task"><div class="b"><div class="ttl">${esc(p.name)}</div><div class="muted small">预算 ${esc(p.budget)} · 计划 ${esc(p.date)}</div></div><span class="tag acc">${esc(p.status)}</span></div>`).join('')}</div>
  <p class="muted small">业主、合同、费用、回报数据为模拟数据。</p>`;
  bindHead();
  if ($('#nreq')) $('#nreq').onclick = () => formModal('登记业主诉求', `<label class="f"><span>类型</span><select name="k">${['经营', '费用', '改造', '人员', '品牌标准', '其他'].map(x => `<option>${x}</option>`).join('')}</select></label>
    <label class="f"><span>诉求</span><input name="t" required placeholder="例如：希望增加周末房价弹性"></label><label class="f"><span>详细说明</span><textarea name="b"></textarea></label>
    <label class="chk"><input type="checkbox" name="e" checked> 同时上报区域经理</label>`, d => act(() => api('/owner-reqs', { store_id: sid, kind: d.k, title: d.t, body: d.b, escalate: !!d.e }), '已登记'));
  document.querySelectorAll('[data-esc]').forEach(b => b.onclick = () => act(() => api(`/owner-reqs/${b.dataset.esc}/escalate`, {}), '已上报区域经理').then(route));
  document.querySelectorAll('[data-cls]').forEach(b => b.onclick = () => formModal('关闭诉求', '<label class="f"><span>处理结果</span><textarea name="n" placeholder="例如：已与业主达成一致"></textarea></label>', d => act(() => api(`/owner-reqs/${b.dataset.cls}/close`, { note: d.n }), '已关闭')));
  document.querySelectorAll('[data-rep]').forEach(b => b.onclick = () => replyReqModal(Number(b.dataset.rep), f.reqs.find(o => o.id === Number(b.dataset.rep)).title));
}
VIEWS.frs = id => storeFrView(Number(id), true);
async function regionFr() {
  const d = await api('/region/franchise'), xs = d.stores, rm = S.me.level === 'region_manager';
  const sum = k => Math.round(xs.reduce((a, x) => a + x[k], 0) * 10) / 10;
  $('#main').innerHTML = `${plHead(regionTitle())}${plBar('fr')}
  <section class="brief rg"><div class="btabs"><a class="on">加盟商看板</a><span class="muted small">${xs.length} 家加盟店</span></div>
    <div class="rkpi">${[['待处理诉求', d.reqs.filter(o => o.status === 'open').length, '条'], ['管理费欠费', sum('arrears'), '万'], ['平均满意度', xs.length ? Math.round(sum('sat') / xs.length) : '-', ''], ['一年内到期', xs.filter(x => x.contract.days <= 365).length, '家'], ['平均 GOP 率', xs.length ? Math.round(sum('gop_rate') / xs.length * 10) / 10 : '-', '%'], ['回本偏慢', xs.filter(x => x.alerts.some(a => a.type === '回本偏慢')).length, '家']]
      .map(([l, v, u], i) => `<a class="${[0, 1, 3].includes(i) && v ? 'bad' : ''}"><b>${v}<small>${u}</small></b><span>${l}</span></a>`).join('')}</div></section>
  <div class="sec-t2">加盟店 · 业主</div>
  ${xs.map(f => `<a class="ldr" href="#/frs/${f.store_id}"><div class="ldr-h"><span class="av">${esc(f.owner.slice(0, 1))}</span><div class="grow"><b>${esc(f.store)}</b><span class="muted small">业主 ${esc(f.owner)} · ${esc(f.company)} · 店长 ${esc(f.managers.join('、'))}</span></div><div class="ldr-s"><b class="${f.sat < 80 ? 'bad' : ''}">${f.sat}</b><span>满意度</span></div></div>
    <div class="wgrid">${[['合同剩余', f.contract.days, '天'], ['欠费', f.arrears, '万'], ['GOP 率', f.gop_rate, '%'], ['待处理诉求', f.open, '条']].map(([l, v, u]) => `<div><b>${v}<small>${u}</small></b><span>${l}</span></div>`).join('')}</div>
    <div class="bud"><div class="row between"><span class="small">回本进度</span><b class="small">${f.payback >= 100 ? `已回本 · ${(f.payback / 100).toFixed(1)} 倍` : f.payback + '%'}</b></div><i><em style="width:${Math.min(100, f.payback)}%"></em></i></div>${alertRows(f.alerts)}</a>`).join('') || '<div class="list"><div class="empty">辖区没有加盟店</div></div>'}
  <div class="sec-t2">业主诉求 · ${d.reqs.length}</div><div class="list">${d.reqs.map(o => `<div class="task req"><div class="b"><div class="ttl">${esc(o.store)}：${esc(o.title)}</div><div class="muted small">${esc(o.body || '')}</div><div class="muted small">${esc((o.created_at || '').slice(5, 16))} ${esc(o.creator || '')} ${o.escalated ? '上报' : '登记（未上报）'}</div>${o.reply ? `<div class="rply">${esc(o.replier || '')}：${esc(o.reply)}</div>` : ''}
    ${rm && o.status === 'open' ? `<div class="row" style="margin-top:6px"><button class="btn primary sm" data-rep="${o.id}">回复 / 安排沟通会</button></div>` : ''}</div><span class="tag ${REQ_ST[o.status][0]}">${REQ_ST[o.status][1]}</span></div>`).join('') || '<div class="empty">暂无</div>'}</div>
  <p class="muted small">业主、合同、费用、回报数据为模拟数据。</p>`;
  bindHead();
  document.querySelectorAll('[data-rep]').forEach(b => b.onclick = () => replyReqModal(Number(b.dataset.rep), d.reqs.find(o => o.id === Number(b.dataset.rep)).title));
}
const QUAD = [['潜力店', '运营好 · 经营弱'], ['标杆店', '运营好 · 经营好'], ['帮扶店', '运营弱 · 经营弱'], ['隐患店', '运营弱 · 经营好']];
async function storeMatrix(el, d) {
  d ||= await api('/region/stores'); if (!$(el)) return;
  $(el).innerHTML = `<div class="sec-t2 row between"><span>门店画像 · 四象限 <span class="tag acc">实验</span></span><span class="muted small">横轴经营 · 纵轴运营</span></div>
  <div class="quad">${QUAD.map(([t, l]) => `<div class="q ${STORE_TYPES_TAG[t]}"><b>${t}</b><span>${l}</span>${d.stores.filter(s => s.type === t).map(s => `<a href="#/sp/${s.id}"><i class="sgd g${s.grade}">${s.grade}</i>${esc(s.name)}<em>${s.total}</em></a>`).join('') || '<small>—</small>'}</div>`).join('')}</div>`;
}
const STORE_TYPES_TAG = { 标杆店: 'ok', 潜力店: 'acc', 隐患店: 'warn', 帮扶店: 'bad' };
async function regionBiz() {
  const biz = await api('/region/biz?days=7'), sm = k => biz.reduce((a, x) => a + x[k], 0), av = k => (biz.length ? Math.round(sm(k) / biz.length * 10) / 10 : null);
  $('#main').innerHTML = `${plHead(regionTitle())}${plBar('biz')}
  <section class="brief rg bz"><div class="btabs"><a class="on">经营看板</a><span class="muted small">近 7 日 · 较前 7 日</span></div>
    <div class="rkpi">${[['平均 RevPAR', Math.round(av('revpar')), '元', av('revpar_delta')], ['平均出租率', av('occ'), '%', av('occ_delta')], ['平均 ADR', Math.round(av('adr')), '元'], ['平均 MPI', av('mpi'), ''], ['差评', sm('bad'), '条'], ['经营下滑店', biz.filter(x => x.revpar_delta < -3).length, '家']]
      .map(([l, v, u, dd], i) => `<a class="${i >= 4 && v ? 'bad' : ''}"><b>${v ?? '-'}<small>${u}</small></b><span>${l} ${dl(dd)}</span></a>`).join('')}</div></section>
  <div class="sec-t2">门店经营排名</div>
  <div class="list">${[...biz].sort((a, b) => b.revpar - a.revpar).map((s, i) => `<a class="rank" href="#/sbiz/${s.id}"><span class="no">${i + 1}</span><div class="b"><b>${esc(s.name)}</b><div class="muted small">${esc(s.managers.join('、'))} · 出租率 ${s.occ}% · ADR ${s.adr} · MPI ${s.mpi}${s.bad ? ` · <span class="bad">差评 ${s.bad}</span>` : ''}</div></div>
    <div class="r"><b>${s.revpar}</b><span class="small ${s.revpar_delta < 0 ? 'bad' : 'muted'}">RevPAR ${s.revpar_delta > 0 ? '+' : ''}${s.revpar_delta}%</span></div></a>`).join('')}</div>`;
  bindHead();
}
VIEWS.report = async id => {
  const r = await api('/reports/' + id), b = r.body, rm = S.me.level === 'region_manager';
  $('#main').innerHTML = `<div class="pghd"><b>店长周报 · ${esc(r.store)}</b></div>
  <div class="ldr"><div class="ldr-h"><span class="sgd g${b.grade}">${b.grade}</span><div class="grow"><b>${esc(b.from)} ~ ${esc(b.to)}</b><span class="muted small">${esc(r.creator)} 提交于 ${esc(r.created_at.slice(5, 16))}</span></div><span class="tag ${r.status === 'reviewed' ? 'ok' : 'warn'}">${r.status === 'reviewed' ? '已批复' : '待批复'}</span></div>
    <div class="wgrid">${[['完成率', b.rate ?? '-', '%'], ['合格率', b.pass ?? '-', '%'], ['整改未闭环', b.rect_open, '项'], ['整改逾期', b.rect_late, '项'], ['RevPAR', b.revpar, '元'], ['出租率', b.occ, '%'], ['预算达成', b.ach, '%'], ['差评', b.bad, '条']].map(([l, v, u]) => `<div><b>${v}<small>${u}</small></b><span>${l}</span></div>`).join('')}</div></div>
  <div class="sec-t2">风险与短板</div><div class="ldr">${b.risks.map(x => `<div class="iss-i"><span class="tag warn">关注</span><span>${esc(x)}</span></div>`).join('') || '<span class="muted small">无</span>'}</div>
  ${b.note ? `<div class="sec-t2">店长小结</div><div class="ldr">${esc(b.note)}</div>` : ''}
  <div class="sec-t2">区域经理批复</div><div class="ldr">${r.comment ? `${esc(r.reviewer || '')}：${esc(r.comment)}` : rm ? '<button class="btn primary" id="rv">批复</button>' : '<span class="muted">等待批复</span>'}</div>`;
  if ($('#rv')) $('#rv').onclick = () => formModal('批复周报', '<label class="f"><span>批复意见</span><textarea name="c" required placeholder="例如：早餐整改效果好；下周重点盯 MPI"></textarea></label>', d => act(() => api(`/reports/${id}/review`, { comment: d.c }), '已批复，已通知店长'));
};
async function hrpActions(id) {
  if (!$('#main') || S.me.level === 'hr_manager' || Number(id) === S.me.id) return;
  const u = (S.meta.users || []).find(x => x.id === Number(id));
  if (!u || u.level !== 'staff' || !(S.me.level === 'store_manager' || (S.me.team || []).includes(u.id))) return;
  const box = document.createElement('div'); box.className = 'row hra';
  box.innerHTML = `<button class="btn primary sm" id="h-as">派任务</button><button class="btn sm" id="h-tr">安排培训</button><a class="btn sm" href="#/person/${u.id}">能力画像 · 点评</a><button class="btn sm" id="h-sg">转正 / 晋升建议</button>`;
  const hd = $('.pghd'); (hd || $('#main').firstChild).after(box);
  $('#h-as').onclick = () => assignModal(u, u.store_id);
  $('#h-tr').onclick = () => trainModal(u, u.store_id, '');
  $('#h-sg').onclick = () => formModal(`${u.name} · 人事建议`, `<label class="f"><span>建议类型</span><select name="k"><option>转正</option><option>晋升</option><option>调岗</option><option>重点辅导</option></select></label>
    <label class="f"><span>理由</span><textarea name="n" required placeholder="例如：近 3 月 A 级，可承担前台夜班带班"></textarea></label><p class="muted small">建议推送给人事经理，处理结果会回到「人」板块。</p>`,
  d => act(() => api('/hr/suggest', { user_id: u.id, kind: d.k, note: d.n }), '已提交人事经理'));
}
{ const hrp0 = VIEWS.hrp; VIEWS.hrp = async id => { await hrp0(id); await hrpActions(id); }; }

const DIFF = v => `<em class="${v < 0 ? 'dn' : 'up'}">${v > 0 ? '+' : ''}${v}</em>`;
function spBody(d) {
  const s = d.score, I = d.info, A = d.avg, rm = S.me.level === 'region_manager', sm = S.me.level === 'store_manager';
  const flags = [s.drop && ['bad', '等级下降', `近一月 ${s.drop.from} → ${s.drop.to}`], s.declines.length && ['warn', '连续下滑', `${s.declines.join('、')} 连续 2 个月下滑`], s.reno && ['acc', '改造提醒', s.reno.text]].filter(Boolean);
  const open = s.plans.filter(p => p.status === 'open'), closed = s.plans.filter(p => p.status !== 'open');
  const prow = p => `<div class="task plan"><div class="b"><div class="ttl">${esc(p.title)}</div><div class="muted small">${esc((d.dim_def.find(x => x[0] === p.dim) || [])[1] || '')} · 起点 ${p.base} → 目标 ${p.target}（当前 ${s.dims[p.dim]}） · ${esc(p.owner || '')} · ${esc(p.due)} 截止</div>
    ${p.status === 'open' ? `<div class="bud"><i><em style="width:${p.progress}%"></em></i></div><div class="muted small">进度 ${p.progress}%${p.updates.length ? ` · ${esc(p.updates[p.updates.length - 1].by)}：${esc(p.updates[p.updates.length - 1].note || '更新进度')}` : ''}</div>
    <div class="row" style="gap:6px;margin-top:6px">${sm || p.owner_id === S.me.id ? `<button class="btn sm" data-pp="${p.id}">更新进度</button>` : ''}${rm ? `<button class="btn primary sm" data-pc="${p.id}">结项</button>` : ''}</div>` : `<div class="muted small">${esc(p.result || '')}</div>`}</div>
    <span class="tag ${p.status === 'open' ? (p.due < S.me.today ? 'bad' : 'acc') : p.status === 'done' ? 'ok' : 'bad'}">${p.status === 'open' ? (p.due < S.me.today ? '已到期' : '进行中') : p.status === 'done' ? '已达成' : '未达成'}</span></div>`;
  return `<div class="ldr"><div class="ldr-h"><span class="sgd g${s.grade} lg">${s.grade}</span><div class="grow"><b>${esc(I.name)} <span class="tag ${s.type_tag}">${esc(s.type)}</span> <span class="tag acc">实验</span></b><span class="muted small">${esc(s.tactic)}</span></div><div class="ldr-s"><b>${s.total}</b><span>区域第 ${s.rank}/${s.of}</span></div></div>
    <div class="row between ldr-t"><span class="muted small">近 6 月</span><span class="gtr">${s.trend.map(t => `<i class="g${t.g}">${t.g}</i>`).join('')}</span><span class="muted small">区域均分 ${A.total} ${DIFF(s.total - A.total)}</span></div>
    <div class="stags">${s.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}${rm ? '<button class="btn sm" id="etag">编辑标签</button>' : s.tags.length ? '' : '<span class="muted small">无标签</span>'}<span class="muted small" style="margin-left:auto">同类${esc(s.type)}第 ${s.peer_rank}/${s.peers}</span></div></div>
  ${flags.length ? `<div class="ldr">${flags.map(([c, t, x]) => `<div class="iss-i"><span class="tag ${c}">${t}</span><span>${esc(x)}</span></div>`).join('')}</div>` : ''}
  ${d.lc ? lcBlock(d) : ''}
  <div class="sec-t2 row between"><span>六维评价 · 对标区域均值</span><span class="muted small">竖线为区域均值</span></div>
  <div class="ldr">${d.dim_def.map(([k, l, w]) => `<div class="sdim"><div class="row between"><span>${l} <small class="muted">${w}%</small></span><span class="nw"><b style="color:${rateColor(s.dims[k])}">${s.dims[k]}</b> <small class="muted">均 ${A[k]}</small> ${DIFF(s.dims[k] - A[k])}</span></div>
    <i><em style="width:${s.dims[k]}%;background:${rateColor(s.dims[k])}"></em><u style="left:${A[k]}%"></u></i><small class="muted">近 3 月 ${s.dim_trend[k].join(' › ')} · ${esc(s.why[k])}</small></div>`).join('')}</div>
  <div class="sec-t2">短板与建议</div><div class="ldr">${s.weak.map(w => `<div class="iss-i"><span class="tag warn">${esc(w.l)} ${w.v}</span><span>${esc(w.why)}</span></div>`).join('')}
    ${rm ? `<div class="row iss-a"><a class="btn sm" href="#/patrol?new=1&store=${I.id}">加入巡店</a><a class="btn sm" data-follow="${I.id}">指派跟进</a><a class="btn sm" href="#/focus?new=1&store=${I.id}">重点跟踪</a><button class="btn primary sm" id="nplan">制定提升计划</button></div>` : ''}</div>
  <div class="sec-t2">门店提升计划 · ${open.length} 项进行中</div><div class="list">${open.map(prow).join('') || '<div class="empty">暂无进行中的提升计划</div>'}</div>
  ${closed.length ? `<details class="tgrp"><summary>已结项 ${closed.length} 项 <i>展开</i></summary><div class="list">${closed.map(prow).join('')}</div></details>` : ''}
  <div class="sec-t2">门店档案</div><div class="ldr"><div class="kv">${[['品牌', I.brand], ['类型', I.stype], ['开业', `${I.open_date}（${I.age} 年）`], ['房量', I.rooms + ' 间'], ['商圈', I.area], ['主要竞对', I.rivals], ['店长', I.managers.join('、')], ...(I.owner ? [['业主', I.owner]] : []), ['编制 / 在岗', `${I.plan_staff} / ${I.staff} 人`], ['最近改造', I.renovate || '未改造']].map(([k, v]) => `<div>${k}</div><div>${esc(v)}</div>`).join('')}</div></div>`;
}
const SP_NOTE = d => `<p class="muted small">实验功能：评分 = ${d.dim_def.map(([, l, w]) => `${l} ${w}%`).join(' + ')}；${d.cfg ? Object.entries(d.cfg.grades).map(([g, v]) => `${g}≥${v}`).join(' · ') : ''}。经营轴 =（经营业绩 + 宾客口碑）/ 2，运营轴 =（品牌标准 + 运营执行）/ 2，以 ${d.cfg?.type_th ?? 82} 分为界分四类。商圈、竞对、改造、证照、历史月度分为模拟数据。${S.me.level === 'region_manager' ? ' <a href="#/scorecfg">调整口径 ›</a>' : ''}</p>`;
function bindSp(d) {
  const s = d.score, I = d.info;
  bindFollow(); if (d.lc) bindLc(d);
  if ($('#etag')) $('#etag').onclick = () => formModal('门店标签 · ' + I.name, `<div class="chks">${d.tag_opts.map(t => `<label class="chk"><input type="checkbox" name="t_${t}" ${s.tags.includes(t) ? 'checked' : ''}> ${t}</label>`).join('')}</div>`,
    f => act(() => api(`/store/${I.id}/tags`, { tags: d.tag_opts.filter(t => f['t_' + t]) }), '标签已更新'));
  if ($('#nplan')) $('#nplan').onclick = () => {
    const owners = (S.meta.users || []).filter(u => u.level === 'store_manager' || ['ops_manager', 'sales_manager', 'hr_manager'].includes(u.level));
    const w = s.weak[0];
    formModal('制定门店提升计划 · ' + I.name, `<label class="f"><span>提升维度</span><select name="dim">${d.dim_def.map(([k, l]) => `<option value="${k}" ${k === w.k ? 'selected' : ''}>${l}（当前 ${s.dims[k]}）</option>`).join('')}</select></label>
      <label class="f"><span>计划内容</span><textarea name="title" required>${esc(`30 天提升${w.l}：${w.why}`)}</textarea></label>
      <div class="row" style="gap:8px"><label class="f" style="flex:1"><span>目标分</span><input type="number" name="target" min="0" max="100" value="${Math.min(100, w.v + 8)}"></label><label class="f" style="flex:1"><span>截止日期</span><input type="date" name="due" value="${L30()}"></label></div>
      <label class="f"><span>负责人</span><select name="owner_id">${owners.map(u => `<option value="${u.id}" ${u.level === 'store_manager' && I.managers.includes(u.name) ? 'selected' : ''}>${esc(u.name)} · ${esc(u.role_name)}</option>`).join('')}</select></label>
      <p class="muted small">负责人和店长会收到提醒，店长每周在「管店」更新进度；到期后按当时画像分判断是否达成。</p>`,
    f => act(() => api('/store-plans', { store_id: I.id, dim: f.dim, title: f.title, target: Number(f.target), due: f.due, owner_id: Number(f.owner_id) }), '提升计划已下发'));
  };
  document.querySelectorAll('[data-pp]').forEach(b => b.onclick = () => { const p = s.plans.find(x => x.id === Number(b.dataset.pp)); formModal('更新提升计划进度', `<p class="small">${esc(p.title)}</p><label class="f"><span>进度 %</span><input type="number" name="pr" min="0" max="100" value="${p.progress}"></label><label class="f"><span>本周进展</span><textarea name="n" placeholder="例如：完成早餐动线调整，差评下降"></textarea></label>`, f => act(() => api(`/store-plans/${p.id}/progress`, { progress: Number(f.pr), note: f.n }), '进度已更新，已同步区域经理')); });
  document.querySelectorAll('[data-pc]').forEach(b => b.onclick = () => { const p = s.plans.find(x => x.id === Number(b.dataset.pc)); formModal('提升计划结项', `<p class="small">${esc(p.title)}</p><p class="small">目标 ${p.target} 分，当前 ${s.dims[p.dim]} 分，结项时按当前分判定是否达成。</p><label class="f"><span>结项意见</span><textarea name="n"></textarea></label>`, f => act(() => api(`/store-plans/${p.id}/close`, { note: f.n }), '已结项，已通知店长')); });
}
VIEWS.sp = async id => {
  const d = await api(`/store/${id}/profile`);
  $('#main').innerHTML = `<div class="pghd"><b>门店画像 · ${esc(d.info.name)}</b></div>${spBody(d)}
  <div class="row" style="gap:8px;flex-wrap:wrap"><a class="btn sm" href="#/home?view=store&store=${d.info.id}">运营看板</a><a class="btn sm" href="#/sbiz/${d.info.id}">经营看板</a>${d.info.owner && S.me.level !== 'ops_manager' ? `<a class="btn sm" href="#/frs/${d.info.id}">加盟商</a>` : ''}</div>${SP_NOTE(d)}`;
  bindSp(d);
};
async function storeShopView(sid) {
  const [d, f] = await Promise.all([api(`/store/${sid}/profile`), isFrS(sid) ? api('/franchise/' + sid) : null]);
  $('#main').innerHTML = `${plHead(storeName(sid), S.meta.stores.length > 1)}${plBar('shop', sid)}${spBody(d)}
  ${f && !f.na ? `<div class="sec-t2">加盟商</div><a class="ldr" href="#/frs/${sid}"><div class="ldr-h"><span class="av">${esc(f.owner.slice(0, 1))}</span><div class="grow"><b>业主 ${esc(f.owner)}</b><span class="muted small">${esc(f.company)}</span></div><div class="ldr-s"><b class="${f.sat < 80 ? 'bad' : ''}">${f.sat}</b><span>满意度</span></div></div>
    <div class="wgrid">${[['合同剩余', f.contract.days, '天'], ['欠费', f.arrears, '万'], ['GOP 率', f.gop_rate, '%'], ['未关闭诉求', f.reqs.filter(o => o.status !== 'closed').length, '条']].map(([l, v, u]) => `<div><b>${v}<small>${u}</small></b><span>${l}</span></div>`).join('')}</div>
    ${alertRows(f.alerts)}<div class="muted small" style="margin-top:6px">业主档案、投资回报、管理费、诉求与月报 ›</div></a>` : ''}
  <div class="sec-t2">采购与物料</div><a class="ldr" href="#/proc?store=${sid}"><div class="row between"><b>品牌统购率、库存、申领、盘点</b><i class="chev">›</i></div></a>
  <div class="sec-t2">工程报修</div><a class="ldr" href="#/repair?store=${sid}"><div class="wgrid w3">${[['未修好', d.repairs.open, '单'], ['超时', d.repairs.late, '单'], ['待确认', d.repairs.confirm, '单'], ['平均修复', d.repairs.avg_h ?? '-', '时'], ['准时率', d.repairs.ontime ?? '-', '%'], ['满意度', d.repairs.rating ?? '-', '星']].map(([l, v, u], i) => `<div class="${i === 1 && v ? 'bad' : ''}"><b>${v}<small>${u}</small></b><span>${l}</span></div>`).join('')}</div><div class="muted small" style="margin-top:6px">超时报修计入安全合规分 · 查看全部工单 ›</div></a>
  <div class="sec-t2">门店证照 · 年检</div><div class="list">${d.licenses.map((x, i) => `<div class="task"><div class="b"><div class="ttl">${esc(x.name)}</div><div class="muted small">有效期至 ${esc(x.expire)}${x.days >= 0 ? ` · 剩 ${x.days} 天` : ''}</div></div>${x.status !== 'ok' ? `<button class="btn sm" data-lic="${i}">生成任务</button>` : ''}<span class="tag ${x.status}">${x.status === 'bad' ? '已过期' : x.status === 'warn' ? '临期' : '有效'}</span></div>`).join('')}</div>${SP_NOTE(d)}`;
  bindHead(); bindSp(d);
  document.querySelectorAll('[data-lic]').forEach(x => x.onclick = () => { const l = d.licenses[Number(x.dataset.lic)]; taskPreset(sid, `【证照续办】${l.name}`, `${l.name}有效期至 ${l.expire}，请准备材料并办理续期 / 年检，上传新证照照片。`); });
}
async function regionShop() {
  const lv = S.me.level, tab = qs().get('lc') || (['dev_manager', 'build_manager'].includes(lv) ? 'pipe' : 'run');
  const [d, lcd] = await Promise.all([api('/region/stores'), api('/lifecycle')]), tf = qs().get('tag') || '', A = d.avg;
  if (tab !== 'run') { $('#main').innerHTML = `${plHead(regionTitle())}${plBar('shop')}${lcHead(lcd, tab)}${tab === 'pipe' ? funnelHtml(lcd) + await lcPipe(lcd) : lcFlow(lcd)}`; bindHead(); if ($('#npj')) $('#npj').onclick = projNew; if (tab === 'pipe') bindFunnel(lcd); return; }
  const xs = d.stores.filter(x => !tf || x.tags.includes(tf)), used = d.tag_opts.filter(t => d.stores.some(x => x.tags.includes(t)));
  const plansOpen = d.stores.reduce((a, x) => a + x.plans.filter(p => p.status === 'open').length, 0);
  $('#main').innerHTML = `${plHead(regionTitle())}${plBar('shop')}${lcHead(lcd, tab)}
  <section class="brief rg"><div class="btabs"><a class="on">门店画像</a><span class="tag acc">实验</span><span class="sp"></span><span class="muted small">区域均分 ${A.total}</span></div>
    <div class="rkpi">${[['S / A 店', d.stores.filter(x => 'SA'.includes(x.grade)).length, '家'], ['C / D 店', d.stores.filter(x => 'CD'.includes(x.grade)).length, '家'], ['等级下降', d.stores.filter(x => x.drop).length, '家'], ['连续下滑', d.stores.filter(x => x.declines.length).length, '家'], ['提升计划', plansOpen, '项'], ['改造提醒', d.stores.filter(x => x.reno).length, '家']]
      .map(([l, v, u], i) => `<a class="${[1, 2, 3].includes(i) && v ? 'bad' : ''}"><b>${v}<small>${u}</small></b><span>${l}</span></a>`).join('')}</div></section>
  <div id="smx"></div>
  <div class="tfil">${[['', '全部'], ...used.map(t => [t, t])].map(([t, l]) => `<a class="${tf === t ? 'on' : ''}" href="#/home?pl=shop${t ? '&tag=' + encodeURIComponent(t) : ''}">${esc(l)}<small>${t ? d.stores.filter(x => x.tags.includes(t)).length : d.stores.length}</small></a>`).join('')}</div>
  ${xs.map(s => `<a class="ldr" href="#/sp/${s.id}"><div class="ldr-h"><span class="sgd g${s.grade}">${s.grade}</span><div class="grow"><b>${esc(s.name)} <span class="tag ${s.type_tag}">${esc(s.type)}</span></b><span class="muted small">${esc(s.info.stype)} · ${esc(s.info.brand)} · ${s.info.rooms} 间 · 店长 ${esc(s.info.managers.join('、'))}</span></div><div class="ldr-s"><b>${s.total}</b><span>第 ${s.rank}/${s.of}</span></div></div>
    <div class="stags">${s.stage !== '成熟' ? `<span class="tag ${STG_C[s.stage]}">${s.stage}${s.stage === '爬坡' ? ' · 评分仅供参考' : ''}</span>` : ''}${s.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}${s.drop ? `<span class="tag bad">${s.drop.from}→${s.drop.to}</span>` : ''}${s.reno ? '<span class="tag acc">改造提醒</span>' : ''}<span class="gtr" style="margin-left:auto">${s.trend.map(t => `<i class="g${t.g}">${t.g}</i>`).join('')}</span></div>
    <div class="dmini">${d.dim_def.map(([k, l]) => `<div><span>${l}</span><b style="color:${rateColor(s.dims[k])}">${s.dims[k]}</b>${DIFF(s.dims[k] - A[k])}</div>`).join('')}</div>
    <div class="muted small">短板：${s.weak.map(w => `${esc(w.l)} ${w.v}`).join(' · ')}${s.plans.some(p => p.status === 'open') ? ` · 提升计划 ${s.plans.filter(p => p.status === 'open').length} 项进行中` : ''}</div></a>`).join('')}
  <p class="muted small">点门店进入完整画像，可编辑标签、制定提升计划、加入巡店或指派跟进。六维小格里的 ± 为与区域均值的差。</p>`;
  bindHead(); storeMatrix('#smx', d);
}

// ---------- 工程报修 ----------
const RP_ST = { open: ['bad', '待接单'], accepted: ['warn', '维修中'], done: ['acc', '待确认'], closed: ['ok', '已完成'] };
const rpRow = x => `<a class="task" href="#/repair/${x.id}"><div class="b"><div class="ttl">${esc(x.title)} ${x.urgency === 'urgent' ? '<span class="tag bad">紧急</span>' : ''}${x.late ? '<span class="tag bad">超时</span>' : ''}</div>
  <div class="muted small">${esc(x.location)}${S.meta.stores.length > 1 ? ' · ' + esc(x.store_name) : ''} · ${esc(x.creator_name)} ${esc(x.created_at.slice(5))} 报修 · ${x.assignee_name ? '工程 ' + esc(x.assignee_name) : '未指派'}</div>
  <div class="muted small">${x.status === 'closed' ? `${esc((x.done_at || '').slice(5))} 修复${x.rating ? ' · ' + '★'.repeat(x.rating) : ''}` : `${esc(x.due_at.slice(5))} 前修复`}</div></div><span class="tag ${RP_ST[x.status][0]}">${RP_ST[x.status][1]}</span></a>`;
function repairNew(sid) {
  modal('工程报修', `<form id="rf">${S.me.level !== 'staff' && S.meta.stores.length > 1 ? `<label class="f"><span>门店</span><select name="store_id">${storeOptions(sid)}</select></label>` : ''}
    <label class="f"><span>位置</span><input name="location" required placeholder="例如：12F 1208 房、大堂入口、餐厅后场"></label>
    <label class="f"><span>问题</span><input name="title" required placeholder="例如：空调不制冷"></label>
    <label class="f"><span>补充说明</span><textarea name="body" placeholder="现象、影响宾客情况"></textarea></label>
    <label class="f"><span>紧急程度</span><div class="seg3">${[['urgent', '紧急'], ['normal', '一般'], ['low', '不急']].map(([v, l]) => `<label><input type="radio" name="urgency" value="${v}" ${v === 'normal' ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></label>
    <label class="f"><span>现场照片</span><input type="file" accept="image/*" capture="environment"></label>
    <p class="muted small">提交后工程会收到提醒；超过时限未修好，先升级给店长，再升级到区域。</p>
    <div class="row"><span class="sp"></span><button class="btn primary">提交报修</button></div></form>`, m => {
    m.querySelector('#rf').onsubmit = async e => { e.preventDefault(); const d = formData(e.target);
      if (await act(async () => { const r = await api('/repairs', { ...d, store_id: Number(d.store_id) || sid, photo: await filePhoto(e.target) }); location.hash = '#/repair/' + r.id; }, '已报修，工程已收到提醒')) closeModal(); };
  });
}
VIEWS.repair = async id => {
  if (id) return repairDetail(Number(id));
  const sid = Number(qs().get('store')) || (S.meta.stores.length === 1 ? S.meta.stores[0].id : 0);
  const d = await api('/repairs' + (sid ? '?store=' + sid : '')), tab = qs().get('st') || 'todo';
  const F = { todo: x => ['open', 'accepted'].includes(x.status), late: x => x.late, done: x => x.status === 'done', closed: x => x.status === 'closed', mine: x => x.created_by === S.me.id || x.assignee_id === S.me.id };
  const L0 = [['todo', '待处理'], ['late', '超时'], ['done', '待确认'], ['closed', '已完成'], ['mine', '与我相关']];
  const st = d.stats, list = d.list.filter(F[tab]);
  $('#main').innerHTML = `<div class="pghd row between"><b>工程报修${sid && S.meta.stores.length > 1 ? ' · ' + esc(storeName(sid)) : ''}</b><button class="btn primary sm" id="nrp">我要报修</button></div>
  ${st ? `<div class="wgrid w3">${[['未修好', st.open, '单'], ['超时', st.late, '单'], ['待确认', st.confirm, '单'], ['近 30 天平均修复', st.avg_h ?? '-', '小时'], ['准时修复率', st.ontime ?? '-', '%'], ['满意度', st.rating ?? '-', '星']].map(([l, v, u], i) => `<div class="${i === 1 && v ? 'bad' : ''}"><b>${v}<small>${u}</small></b><span>${l}</span></div>`).join('')}</div>` : ''}
  <div class="tfil">${L0.map(([k, l]) => `<a class="${tab === k ? 'on' : ''}" href="#/repair?st=${k}${sid ? '&store=' + sid : ''}">${l}<small>${d.list.filter(F[k]).length}</small></a>`).join('')}</div>
  <div class="list">${list.map(rpRow).join('') || '<div class="empty">没有工单</div>'}</div>
  <p class="muted small">修复时限：紧急 ${d.sla.urgent} 小时 · 一般 ${d.sla.normal} 小时 · 不急 ${d.sla.low} 小时（区域经理可在「评价口径与预警」里调整）。超时报修计入门店画像的安全合规分。</p>`;
  $('#nrp').onclick = () => repairNew(sid || S.store || S.meta.stores[0]?.id);
};
async function repairDetail(id) {
  const x = await api('/repairs/' + id), c = x.can;
  $('#main').innerHTML = `<div class="pghd"><b>报修单 · ${esc(x.title)}</b></div>
  <div class="ldr"><div class="row between"><b>${esc(x.location)}</b><span class="tag ${RP_ST[x.status][0]}">${RP_ST[x.status][1]}</span></div>
    <div class="kv" style="margin-top:8px">${[['门店', x.store_name], ['紧急程度', x.urgency_label], ['报修人', `${x.creator_name} · ${x.created_at}`], ['修复时限', x.due_at + (x.late ? '（已超时）' : '')], ['工程', x.assignee_name || '未指派'], ...(x.esc_level ? [['升级', x.esc_level === 2 ? '已升级到区域' : '已升级店长']] : [])].map(([k, v]) => `<div>${k}</div><div>${esc(v)}</div>`).join('')}</div>
    ${x.body ? `<p class="small">${esc(x.body)}</p>` : ''}${x.photo ? `<img class="photo" src="${esc(x.photo)}" alt="报修照片">` : ''}</div>
  ${x.done_note ? `<div class="note"><b>维修情况</b> <span class="muted small">${esc(x.done_at || '')}</span><br>${esc(x.done_note)}${x.done_photo ? `<img class="photo" src="${esc(x.done_photo)}" alt="维修照片">` : ''}</div>` : ''}
  <div class="row" style="gap:8px;margin:12px 0;flex-wrap:wrap">${c.accept ? '<button class="btn primary" id="r-ac">接单</button>' : ''}${c.done ? '<button class="btn primary" id="r-dn">完成维修</button>' : ''}${c.confirm ? '<button class="btn primary" id="r-ok">确认修好</button><button class="btn danger" id="r-no">没修好，退回</button>' : ''}${c.assign ? '<button class="btn" id="r-as">指派工程</button>' : ''}</div>
  <div class="sec-t2">处理记录</div><div class="list">${x.log.map(l => `<div class="task"><div class="b"><div class="ttl">${esc(l.act)} · ${esc(l.by)}</div>${l.note ? `<div class="muted small">${esc(l.note)}</div>` : ''}</div><span class="muted small">${esc(l.at.slice(5))}</span></div>`).join('')}</div>`;
  const post = (op, body, msg) => act(async () => { await api(`/repairs/${id}/${op}`, body || {}); route(); }, msg);
  if ($('#r-ac')) $('#r-ac').onclick = () => post('accept', null, '已接单');
  if ($('#r-dn')) $('#r-dn').onclick = () => modal('完成维修', `<form id="df"><label class="f"><span>维修情况</span><textarea name="note" required placeholder="例如：更换压缩机电容，测试制冷正常"></textarea></label><label class="f"><span>维修后照片</span><input type="file" accept="image/*" capture="environment"></label><div class="row"><span class="sp"></span><button class="btn primary">提交，请报修人确认</button></div></form>`, m => {
    m.querySelector('#df').onsubmit = async e => { e.preventDefault(); if (await act(async () => api(`/repairs/${id}/done`, { note: e.target.note.value, photo: await filePhoto(e.target) }), '已提交，等待报修人确认')) { closeModal(); route(); } };
  });
  if ($('#r-ok')) $('#r-ok').onclick = () => formModal('确认修好', `<label class="f"><span>评价</span><div class="seg3">${[5, 4, 3, 2, 1].map(n => `<label><input type="radio" name="rating" value="${n}" ${n === 5 ? 'checked' : ''}><span>${n} 星</span></label>`).join('')}</div></label><label class="f"><span>备注</span><input name="note"></label>`, f => act(() => api(`/repairs/${id}/confirm`, f), '已关单'));
  if ($('#r-no')) $('#r-no').onclick = () => formModal('退回重修', '<label class="f"><span>还有什么问题</span><textarea name="note" required></textarea></label>', f => act(() => api(`/repairs/${id}/reject`, f), '已退回工程'));
  if ($('#r-as')) $('#r-as').onclick = async () => { const d = await api('/repairs?store=' + x.store_id); formModal('指派工程', `<label class="f"><span>指派给</span><select name="user_id">${d.engineers.sort((a, b) => (b.role_name === '工程') - (a.role_name === '工程')).map(u => `<option value="${u.id}">${esc(u.name)} · ${esc(u.role_name)}</option>`).join('')}</select></label>`, f => act(() => api(`/repairs/${id}/assign`, { user_id: Number(f.user_id) }), '已指派')); };
}

// ---------- 评价口径与预警 ----------
VIEWS.scorecfg = async () => {
  const { cfg: c, def, dims } = await api('/score-cfg'), rm = S.me.level === 'region_manager';
  const num = (name, v, u = '', mx = 100) => `<label class="cfi"><input type="number" name="${name}" value="${v}" min="0" max="${mx}" ${rm ? '' : 'disabled'}><small>${u}</small></label>`;
  const MG = [['exec', '执行力'], ['brand', '品牌标准'], ['team', '团队带教'], ['biz', '经营结果']];
  const row = (l, inp, d) => `<div class="cfr"><span>${l}${d != null ? ` <small class="muted">默认 ${d}</small>` : ''}</span>${inp}</div>`;
  $('#main').innerHTML = `<div class="pghd"><b>评价口径与预警</b></div><p class="muted small" style="margin-top:-6px">门店画像、店长综合分和各类预警按这里的口径实时计算。${rm ? '只有区域经理可以修改，改动会记入操作日志。' : '只读，由区域经理维护。'}</p>
  <form id="cf">
  <div class="sec-t2 row between"><span>门店画像 · 六项权重</span><span class="muted small" id="s-d"></span></div><div class="ldr">${dims.map(([k, l]) => row(l, num('dims.' + k, c.dims[k], '%'), def.dims[k])).join('')}</div>
  <div class="sec-t2">等级分数线</div><div class="ldr">${['S', 'A', 'B', 'C'].map(g => row(g + ' 级 ≥', num('grades.' + g, c.grades[g], '分'), def.grades[g])).join('')}${row('四类门店分界线', num('type_th', c.type_th, '分'), def.type_th)}</div>
  <div class="sec-t2 row between"><span>店长综合分 · 四项权重</span><span class="muted small" id="s-m"></span></div><div class="ldr">${MG.map(([k, l]) => row(l, num('mgr.' + k, c.mgr[k], '%'), def.mgr[k])).join('')}</div>
  <div class="sec-t2">扣分规则</div><div class="ldr">${row('运营执行：每条整改逾期扣', num('pen.rect_late', c.pen.rect_late, '分'), def.pen.rect_late)}${row('运营执行：每条整改未闭环扣', num('pen.rect_open', c.pen.rect_open, '分'), def.pen.rect_open)}${row('安全合规：每单报修超时扣', num('pen.repair_late', c.pen.repair_late, '分'), def.pen.repair_late)}</div>
  <div class="sec-t2">预警与时限</div><div class="ldr">${row('改造提醒：开业或上次改造满', num('reno_years', c.reno_years, '年', 20), def.reno_years)}${row('提升计划：到期前提醒', num('plan_days', c.plan_days, '天', 30), def.plan_days)}${row('巡店不达标：自动复查间隔', num('recheck_days', c.recheck_days, '天', 30), def.recheck_days)}
    ${row('报修时限：紧急', num('sla.urgent', c.sla.urgent, '小时', 240), def.sla.urgent)}${row('报修时限：一般', num('sla.normal', c.sla.normal, '小时', 240), def.sla.normal)}${row('报修时限：不急', num('sla.low', c.sla.low, '小时', 240), def.sla.low)}</div>
  <div class="sec-t2">员工提成 · 售卡 / 打扫</div><div class="ldr">${row('前台：银卡每张', num('comm.card_silver', c.comm.card_silver, '元', 999), def.comm.card_silver)}${row('前台：金卡每张', num('comm.card_gold', c.comm.card_gold, '元', 999), def.comm.card_gold)}${row('前台：铂金卡每张', num('comm.card_plat', c.comm.card_plat, '元', 999), def.comm.card_plat)}${row('前台：月售卡达到', num('comm.tier_cards', c.comm.tier_cards, '张', 999), def.comm.tier_cards)}${row('前台：达标后提成上浮', num('comm.tier_bonus', c.comm.tier_bonus, '%'), def.comm.tier_bonus)}
    ${row('客房：标准房每间', num('comm.room_std', c.comm.room_std, '元', 99), def.comm.room_std)}${row('客房：套房每间', num('comm.room_suite', c.comm.room_suite, '元', 99), def.comm.room_suite)}${row('客房：查房不合格每间扣', num('comm.room_fail', c.comm.room_fail, '元', 99), def.comm.room_fail)}</div>
  ${rm ? '<div class="row" style="gap:8px"><button type="button" class="btn" id="cf-r">恢复默认</button><span class="sp"></span><button class="btn primary">保存并重新计算</button></div>' : ''}</form>`;
  const f = $('#cf'), sum = p => [...f.querySelectorAll(`[name^="${p}."]`)].reduce((a, i) => a + Number(i.value || 0), 0);
  const upd = () => { for (const [p, el] of [['dims', '#s-d'], ['mgr', '#s-m']]) { const n = sum(p); $(el).innerHTML = `合计 <b style="color:${n === 100 ? 'var(--ok)' : 'var(--bad)'}">${n}</b> / 100`; } };
  f.oninput = upd; upd();
  if (!rm) return;
  f.onsubmit = async e => { e.preventDefault(); const o = {};
    for (const i of f.querySelectorAll('input[type=number]')) { const [a, b] = i.name.split('.'); if (b) (o[a] ||= {})[b] = Number(i.value); else o[a] = Number(i.value); }
    if (await act(() => api('/score-cfg', o), '已保存，画像和排名已按新口径计算')) route(); };
  $('#cf-r').onclick = () => confirm('恢复全部默认口径？') && act(async () => { await api('/score-cfg', { reset: true }); route(); }, '已恢复默认');
};


// ---------- 门店全生命周期 ----------
const HC = { red: ['bad', '高风险'], yellow: ['warn', '关注'], green: ['ok', '正常'] };
const STG_C = { 管道: 'acc', 筹备: 'warn', 爬坡: 'acc', 成熟: 'ok', 改造: 'warn', 续约评估: 'warn', 退出: 'bad', 已开业: 'ok' };
function lcHead(d, tab) {
  const y = d.year, tg = d.target;
  return `<section class="brief rg"><div class="btabs"><a class="on">门店全生命周期</a><span class="sp"></span><span class="muted small">${d.year_label} 年</span></div>
    <div class="lcbar">${d.stages.map(k => `<a href="#/home?pl=shop&lc=${['管道', '筹备', '退出'].includes(k) ? (k === '退出' ? 'flow' : 'pipe') : 'run'}"><b>${d.count[k]}</b><span>${k}</span></a>`).join('<i>›</i>')}</div>
    <div class="rkpi">${[['签约', `${y.sign}/${tg.sign}`, '家'], ['开业', `${y.open}/${tg.open}`, '家'], ['退出', y.exit, '家'], ['净增', y.net, '家'], ['管道房量', d.pipe_rooms, '间'], ['高风险项目', d.projects.filter(p => p.health === 'red').length, '个']]
      .map(([l, v, u], i) => `<a class="${i === 5 && v ? 'bad' : ''}"><b>${v}<small>${u}</small></b><span>${l}</span></a>`).join('')}</div></section>
  <div class="tfil">${[['run', '在营 · 画像'], ['pipe', '管道 · 筹备'], ['flow', '周转记录']].map(([k, l]) => `<a class="${tab === k ? 'on' : ''}" href="#/home?pl=shop&lc=${k}">${l}</a>`).join('')}</div>`;
}
const projCard = p => `<a class="ldr" href="#/proj/${p.id}"><div class="ldr-h"><span class="av">${esc(p.name.slice(0, 2))}</span><div class="grow"><b>${esc(p.name)} <span class="tag ${STG_C[p.stage]}">${p.stage}</span>${p.health ? ` <span class="tag ${HC[p.health][0]}">${HC[p.health][1]}</span>` : ''}</b>
  <span class="muted small">${esc(p.stype)} · ${p.rooms} 间 · 开发 ${esc(p.dev_name || '-')} · 项目经理 ${esc(p.build_name || '-')}</span></div><div class="ldr-s"><b>${p.progress}<small>%</small></b><span>节点</span></div></div>
  <div class="bud"><i><em style="width:${p.progress}%;background:${p.health === 'red' ? 'var(--bad)' : p.health === 'yellow' ? 'var(--warn)' : 'var(--ok)'}"></em></i></div>
  <div class="muted small">${p.cur ? `当前：${esc(p.cur.name)}（计划 ${p.cur.plan_date}${p.cur.late ? `，逾期 ${p.cur.slip} 天` : ''}）· ` : ''}签约 ${p.sign_date} · 预计开业 ${p.predicted_open}${p.shift ? `（顺延 ${p.shift} 天）` : ''}</div>
  ${p.why.length ? `<div class="stags">${p.why.map(([c, t]) => `<span class="tag ${c}">${esc(t)}</span>`).join('')}</div>` : ''}</a>`;
async function lcPipe(d) {
  const dev = ['region_manager', 'dev_manager'].includes(S.me.level);
  const act0 = d.projects.filter(p => ['管道', '筹备'].includes(p.stage));
  return `<div class="row between sec-t2"><span>管道店 · 已签约未进场 ${act0.filter(p => p.stage === '管道').length}</span>${dev ? '<button class="btn primary sm" id="npj">录入签约项目</button>' : ''}</div>
  ${act0.filter(p => p.stage === '管道').map(projCard).join('') || '<div class="list"><div class="empty">暂无管道店</div></div>'}
  <div class="sec-t2">筹备店 · 筹建中 ${act0.filter(p => p.stage === '筹备').length}</div>${act0.filter(p => p.stage === '筹备').map(projCard).join('') || '<div class="list"><div class="empty">暂无筹备店</div></div>'}
  <div class="sec-t2">新店爬坡</div>${d.stores.filter(s => s.stage === '爬坡').map(s => `<a class="ldr" href="#/sp/${s.id}"><div class="ldr-h"><span class="av">${esc(s.name.slice(2, 3))}</span><div class="grow"><b>${esc(s.name)} <span class="tag acc">爬坡</span></b><span class="muted small">开业第 ${s.days} 天 · ${s.rooms} 间 · ${esc(s.stype)}</span></div>
    <div class="ldr-s"><b class="${s.ramp.gap < 0 ? 'bad' : ''}">${s.ramp.gap >= 0 ? '+' : ''}${s.ramp.gap}</b><span>较基准</span></div></div>${rampChart(s.ramp)}</a>`).join('') || '<div class="list"><div class="empty">暂无爬坡期门店</div></div>'}
  <p class="muted small">节点：${d.nodes_def.map(n => n[1]).join(' → ')}。标准工程工期 ${d.build_std} 天。红色：签约超 90 天未完成设计、业主资金未到位或节点逾期 30 天以上；黄色：节点逾期或工期超标准。项目数据为模拟。</p>`;
}
const rampChart = r => `<div class="rampc">${r.weeks.map(w => `<i title="第 ${w.w} 周 ${w.occ}% / 基准 ${w.bench}%"><em style="height:${w.occ}%;background:${w.occ >= w.bench ? 'var(--ok)' : 'var(--warn)'}"></em><u style="bottom:${w.bench}%"></u></i>`).join('')}</div>
  <div class="muted small">每周出租率（柱）对比爬坡基准（横线）· 近 30 天 RevPAR 达成 ${r.revpar_rate}%${r.eval_done ? ' · 已完成新店评估' : r.days >= 90 ? ' · <b style="color:var(--warn)">待做 90 天评估</b>' : ` · 第 90 天做新店评估`}</div>`;
const lcFlow = d => `<div class="sec-t2">门店周转记录</div><div class="list">${d.events.map(e => `<a class="task" href="${e.store_id ? '#/sp/' + e.store_id : '#/proj/' + e.project_id}"><span class="tag ${['解约', '摘牌'].includes(e.kind) ? 'bad' : e.kind === '开业' ? 'ok' : e.kind === '签约' ? 'acc' : ''}">${esc(e.kind)}</span><div class="b"><div class="ttl">${esc(e.store || e.proj || '')}</div>${e.note ? `<div class="muted small">${esc(e.note)}</div>` : ''}</div><span class="muted small">${esc(e.at)}</span></a>`).join('') || '<div class="empty">暂无记录</div>'}</div>`;
function projNew() {
  const us = S.meta.users || [];
  formModal('录入签约项目', `<label class="f"><span>项目名称</span><input name="name" required placeholder="例如：杭州滨江店"></label>
    <div class="row" style="gap:8px"><label class="f" style="flex:1"><span>城市</span><input name="city"></label><label class="f" style="flex:1"><span>房量</span><input type="number" name="rooms" required min="1"></label></div>
    <div class="row" style="gap:8px"><label class="f" style="flex:1"><span>类型</span><select name="stype"><option>加盟店</option><option>直营店</option></select></label><label class="f" style="flex:1"><span>签约日期</span><input type="date" name="sign_date" value="${S.me.today}" required></label></div>
    <div class="row" style="gap:8px"><label class="f" style="flex:1"><span>业主</span><input name="owner"></label><label class="f" style="flex:1"><span>投资预算（万）</span><input type="number" name="budget"></label></div>
    <label class="f"><span>业主公司</span><input name="owner_company"></label>
    <label class="chk"><input type="checkbox" name="fund_ok"> 业主资金已到位</label>
    <p class="muted small">保存后按标准节奏生成 9 个节点计划（签约到开业约 190 天），开发经理、项目经理和区域经理会收到提醒。业主信息开业后带入加盟商档案。${us.length ? '' : ''}</p>`,
  f => act(async () => { const r = await api('/projects', { ...f, rooms: Number(f.rooms), budget: Number(f.budget) || 0 }); setTimeout(() => { location.hash = '#/proj/' + r.id; }, 0); }, '签约项目已录入'));
}
VIEWS.proj = async id => {
  const p = await api('/projects/' + id), rm = S.me.level === 'region_manager';
  const cur = p.nodes.find(n => !n.actual_date), bud = p.budget ? Math.round(p.paid * 100 / p.budget) : 0;
  $('#main').innerHTML = `<div class="pghd"><b>${esc(p.name)}</b></div>
  <div class="ldr"><div class="ldr-h"><span class="av">${esc(p.name.slice(0, 2))}</span><div class="grow"><b>${esc(p.name)} <span class="tag ${STG_C[p.stage]}">${p.stage}</span>${p.health ? ` <span class="tag ${HC[p.health][0]}">${HC[p.health][1]}</span>` : ''}</b><span class="muted small">${esc(p.brand)} · ${esc(p.stype)} · ${p.rooms} 间 · ${esc(p.city)}</span></div><div class="ldr-s"><b>${p.progress}<small>%</small></b><span>节点</span></div></div>
    ${p.why.length ? `<div class="stags">${p.why.map(([c, t]) => `<span class="tag ${c}">${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="kv" style="margin-top:8px">${[['签约', p.sign_date], ['计划开业', p.plan_open], ['预计开业', p.predicted_open + (p.shift ? `（顺延 ${p.shift} 天）` : '')], ['业主', `${p.owner || '-'}${p.owner_company && p.owner_company !== '-' ? ' · ' + p.owner_company : ''}`], ['资金', p.fund_ok ? '已到位' : '未到位'], ['开发经理', p.dev_name || '-'], ['项目经理', p.build_name || '-'], ...(p.exit_note ? [['解约原因', p.exit_note]] : [])].map(([k, v]) => `<div>${k}</div><div>${esc(v)}</div>`).join('')}</div></div>
  ${p.store_id ? `<a class="ldr" href="#/sp/${p.store_id}"><b>已开业，查看门店画像 ›</b></a>` : ''}
  <div class="sec-t2">签约到开业 · 节点</div><div class="list">${p.nodes.map(n => `<div class="task lcn ${n.actual_date ? 'done' : n === cur ? 'cur' : ''}"><span class="dot"></span><div class="b"><div class="ttl">${esc(n.name)} ${n.late ? `<span class="tag bad">逾期 ${n.slip} 天</span>` : n.actual_date && n.slip ? `<span class="tag warn">晚 ${n.slip} 天</span>` : ''}</div>
    <div class="muted small">计划 ${n.plan_date}${n.actual_date ? ` · 完成 ${n.actual_date}` : ''} · ${esc(n.owner_name || '-')}</div>
    ${n.data.note ? `<div class="small">${esc(n.data.note)}</div>` : ''}${n.data.fails?.length ? `<div class="small" style="color:var(--bad)">验收不合格 ${n.data.fails.length} 项：${n.data.fails.map(c => 'No.' + c).join('、')}</div>` : ''}${n.data.photo ? `<img class="photo" src="${esc(n.data.photo)}" alt="">` : ''}</div>
    <div class="row" style="gap:6px;flex:none">${p.can && p.status === 'active' && n === cur ? (n.key === 'open' ? (rm ? '<button class="btn primary sm" id="pj-open">确认开业</button>' : '') : `<button class="btn primary sm" data-nd="${n.key}">${n.key === 'accept' ? (n.data.rounds ? '复验' : '开始验收') : '完成'}</button>`) : ''}${rm && p.status === 'active' && !n.actual_date ? `<button class="btn sm" data-pl="${n.key}">改期</button>` : ''}</div></div>`).join('')}</div>
  <div class="sec-t2">筹建预算与工期</div><div class="ldr"><div class="wgrid">${[['投资预算', p.budget, '万'], ['已付款', p.paid, '万'], ['工程变更', p.changes, '万'], ['工期', p.build_days ?? '-', `/${p.build_std}天`]].map(([l, v, u]) => `<div><b>${v}<small>${u}</small></b><span>${l}</span></div>`).join('')}</div>
    <div class="bud"><i><em style="width:${Math.min(100, bud)}%"></em></i></div><div class="muted small">付款进度 ${bud}%${p.changes > p.budget * 0.05 ? ' · <b style="color:var(--warn)">工程变更超过预算 5%</b>' : ''}</div></div>
  <div class="sec-t2">开业前人员准备</div><div class="ldr"><div class="wgrid">${[['编制', p.staff_plan, '人'], ['已招聘', p.staff_hired, '人'], ['已培训认证', p.staff_trained, '人'], ['到位率', p.staff_plan ? Math.round(p.staff_hired * 100 / p.staff_plan) : 0, '%']].map(([l, v, u]) => `<div><b>${v}<small>${u}</small></b><span>${l}</span></div>`).join('')}</div>
    <div class="muted small" style="margin-top:6px">店长：${esc(p.sm_name || '未确定')}${p.stage !== '退出' ? ' · 店长和关键岗位可从「团队」的人才梯队里调配' : ''}</div></div>
  ${p.can && p.status === 'active' ? `<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm" id="pj-up">更新预算 / 人员 / 资金</button>${rm ? '<button class="btn danger sm" id="pj-exit">解约</button>' : ''}</div>` : ''}
  <div class="sec-t2">项目记录</div><div class="list">${p.events.map(e => `<div class="task"><span class="tag">${esc(e.kind)}</span><div class="b"><div class="ttl">${esc(e.note || e.kind)}</div><div class="muted small">${esc(e.by_name || '')}</div></div><span class="muted small">${esc(e.at)}</span></div>`).join('')}</div>`;
  document.querySelectorAll('[data-nd]').forEach(b => b.onclick = () => {
    const n = p.nodes.find(x => x.key === b.dataset.nd);
    if (n.key === 'accept') {
      const G = {}; for (const c of p.accept_items) (G[c.scene || '其他'] ||= []).push(c);
      modal('品牌验收 · ' + p.name, `<form id="af"><p class="muted small">开业版验收：品牌审计标准中的清零项和重点项共 ${p.accept_items.length} 条，勾选不合格项。全部合格才算通过；有不合格项会通知项目经理整改后复验。</p>
        ${Object.entries(G).map(([sc, cs]) => `<details class="pg"><summary><b>${esc(sc)}</b><span class="muted small">${cs.length} 条</span></summary>${cs.map(c => `<label class="chk small"><input type="checkbox" name="f_${c.code}" ${n.data.fails?.includes(String(c.code)) ? 'checked' : ''}> No.${c.code} ${esc(c.title)}</label>`).join('')}</details>`).join('')}
        <label class="f"><span>验收说明</span><textarea name="note"></textarea></label><div class="row"><span class="sp"></span><button class="btn primary">提交验收结果</button></div></form>`, m => {
        m.querySelector('#af').onsubmit = async e => { e.preventDefault(); const d = formData(e.target), fails = p.accept_items.filter(c => d['f_' + c.code]).map(c => String(c.code));
          if (await act(() => api(`/projects/${id}/node/accept`, { fails, note: d.note }), fails.length ? `${fails.length} 项不合格，已通知整改` : '品牌验收通过')) { closeModal(); route(); } };
      });
      return;
    }
    modal('完成节点 · ' + n.name, `<form id="nf"><label class="f"><span>完成日期</span><input type="date" name="actual_date" value="${S.me.today}"></label><label class="f"><span>说明</span><textarea name="note" placeholder="例如：施工图审查通过、消防验收合格证编号"></textarea></label><label class="f"><span>资料照片</span><input type="file" accept="image/*"></label><div class="row"><span class="sp"></span><button class="btn primary">确认完成</button></div></form>`, m => {
      m.querySelector('#nf').onsubmit = async e => { e.preventDefault(); const d = formData(e.target); if (await act(async () => api(`/projects/${id}/node/${n.key}`, { ...d, photo: await filePhoto(e.target) }), n.name + '已完成')) { closeModal(); route(); } };
    });
  });
  document.querySelectorAll('[data-pl]').forEach(b => b.onclick = () => { const n = p.nodes.find(x => x.key === b.dataset.pl); formModal('调整计划日期 · ' + n.name, `<label class="f"><span>新的计划日期</span><input type="date" name="plan_date" value="${n.plan_date}" required></label>`, f => act(() => api(`/projects/${id}/node/${n.key}`, f), '计划已调整')); });
  if ($('#pj-open')) $('#pj-open').onclick = () => formModal('确认开业 · ' + p.name, `<label class="f"><span>开业日期</span><input type="date" name="date" value="${S.me.today}"></label><p class="muted small">确认后建立门店档案，进入新店爬坡期（标签「新开业」），第 90 天做新店评估。</p>`, f => act(async () => { const r = await api(`/projects/${id}/open`, f); await loadMeta(); setTimeout(() => { location.hash = '#/sp/' + r.store_id; }, 0); }, '已开业'));
  if ($('#pj-up')) $('#pj-up').onclick = () => formModal('更新项目', `<div class="row" style="gap:8px"><label class="f" style="flex:1"><span>预算（万）</span><input type="number" name="budget" value="${p.budget}"></label><label class="f" style="flex:1"><span>已付款（万）</span><input type="number" name="paid" value="${p.paid}"></label><label class="f" style="flex:1"><span>变更（万）</span><input type="number" name="changes" value="${p.changes}"></label></div>
    <div class="row" style="gap:8px"><label class="f" style="flex:1"><span>编制</span><input type="number" name="staff_plan" value="${p.staff_plan}"></label><label class="f" style="flex:1"><span>已招聘</span><input type="number" name="staff_hired" value="${p.staff_hired}"></label><label class="f" style="flex:1"><span>已认证</span><input type="number" name="staff_trained" value="${p.staff_trained}"></label></div>
    <label class="f"><span>店长人选</span><input name="sm_name" value="${esc(p.sm_name || '')}"></label><label class="chk"><input type="checkbox" name="fund_ok" ${p.fund_ok ? 'checked' : ''}> 业主资金已到位</label>`, f => act(() => api(`/projects/${id}/update`, f), '已更新'));
  if ($('#pj-exit')) $('#pj-exit').onclick = () => formModal('项目解约 · ' + p.name, '<label class="f"><span>解约原因</span><textarea name="note" required></textarea></label>', f => act(() => api(`/projects/${id}/exit`, f), '已解约，记入周转记录'));
};
function lcBlock(d) {
  const lc = d.lc, rm = S.me.level === 'region_manager', I = d.info, r = lc.ramp;
  const order = ['签约', '筹备', '爬坡', '成熟', '改造', '续约评估', '退出'], at = order.indexOf(lc.stage);
  return `<div class="sec-t2 row between"><span>全生命周期 · ${esc(lc.stage)}</span>${lc.project_id ? `<a class="small" href="#/proj/${lc.project_id}">项目档案 ›</a>` : ''}</div>
  <div class="ldr"><div class="lcline">${order.map((k, i) => `<span class="${i < at ? 'past' : i === at ? 'now' : ''}">${k}</span>`).join('')}</div>
    ${r ? `<div class="sec-t3">新店爬坡 · 开业第 ${r.days} 天</div>${rampChart(r)}` : ''}
    <div class="lcev">${lc.events.slice().reverse().slice(0, 6).map(e => `<div><span class="muted small">${esc(e.at)}</span><b>${esc(e.kind)}</b><span class="small">${esc(e.note || '')}</span></div>`).join('')}</div>
    ${rm ? `<div class="row iss-a" style="flex-wrap:wrap">${r && !r.eval_done && r.days >= 90 ? '<button class="btn primary sm" data-lcs="eval">90 天新店评估</button>' : ''}${lc.stage === '爬坡' ? `<button class="btn sm" data-lcs="mature">转入成熟期</button>` : ''}${['成熟', '续约评估'].includes(lc.stage) ? '<button class="btn sm" data-lcs="改造">启动改造</button>' : ''}${I.stype === '加盟店' && lc.stage !== '退出' ? '<button class="btn sm" data-lcs="续约">续约</button><button class="btn sm" data-lcs="转让">转让</button>' : ''}${lc.stage !== '退出' ? '<button class="btn danger sm" data-lcs="解约">解约 / 摘牌</button>' : ''}</div>` : ''}</div>`;
}
function bindLc(d) {
  const I = d.info, r = d.lc.ramp;
  document.querySelectorAll('[data-lcs]').forEach(b => b.onclick = () => {
    const op = b.dataset.lcs;
    const T = { eval: ['90 天新店评估', `开业 ${r?.days} 天，近 4 周出租率较基准 ${r?.gap >= 0 ? '+' : ''}${r?.gap} 个点，RevPAR 达成 ${r?.revpar_rate}%。`, '评估结论：爬坡情况、主要问题、下阶段重点'],
      mature: ['转入成熟期', r && !r.ready ? '提示：建议开业满 6 个月且 RevPAR 达到基准 90% 后再转入。' : '转入后按成熟期六维评价参与区域排名。', '说明'],
      改造: ['启动改造', '门店进入改造阶段，标签改为「改造中」。', '改造范围、预算、预计完成时间'], 续约: ['续约', '记录续约结果。', '续约年限、条件变化'],
      转让: ['转让（换业主）', '记录新业主和交接事项。', '新业主、交接事项'], 解约: ['解约 / 摘牌', '门店退出后不再参与区域排名，历史数据保留。', '原因、交接事项、摘牌日期'] }[op];
    formModal(T[0] + ' · ' + I.name, `<p class="small">${esc(T[1])}</p>${op === '解约' ? '<label class="f"><span>类型</span><select name="k"><option>解约</option><option>摘牌</option></select></label>' : ''}<label class="f"><span>${T[2]}</span><textarea name="note" ${['解约', '转让'].includes(op) ? 'required' : ''}></textarea></label>`,
      f => act(() => api(`/store/${I.id}/stage`, { op: op === '解约' ? f.k : op, note: f.note }), '已记录'));
  });
}


// ---------- 执行分 · 提成 ----------
const commCard = c => c ? `<div class="ldr"><div class="row between"><b>${esc(c.kind)}</b><b class="amt">¥${c.amount}</b></div>
  <div class="cmi">${c.items.map(i => `<div><span>${esc(i.l)}</span><b>${i.n}</b><small>${i.unit > 0 ? '×¥' + i.unit : '−¥' + Math.abs(i.unit)}</small></div>`).join('')}</div><div class="muted small">本月 ${c.count} ${c.unit_label} · ${esc(c.tip)}</div></div>` : '';
async function fillExec(uid) {
  const el = $('#exs'); if (!el) return;
  const d = await api('/exec/' + uid).catch(() => null); if (!d || !$('#exs')) return;
  const m = d.me;
  el.innerHTML = `${m ? `<div class="sec-t2 row between"><span>我的执行分 · 本月激励</span><span class="muted small">${d.rank ? `全店第 ${d.rank}/${d.of}` : ''}</span></div>
  <div class="ldr"><div class="ldr-h"><span class="sgd ${m.score >= 90 ? 'gS' : m.score >= 80 ? 'gA' : m.score >= 70 ? 'gB' : 'gD'} lg">${m.score}</span><div class="grow"><b>${m.level}员工</b><span class="muted small">完成率 ${m.parts.rate ?? '-'}% · 准时率 ${m.parts.ontime ?? '-'}% · 合格率 ${m.parts.pass ?? '-'}% · 获肯定 ${m.parts.good}</span></div></div>
    <div class="bud"><i><em style="width:${Math.min(100, m.month_good * 100 / m.star_need)}%"></em></i></div><div class="muted small">${m.star_left ? `本月获肯定 ${m.month_good} 次，再 ${m.star_left} 次可评「月度星级员工」` : '本月已达「月度星级员工」标准'}</div></div>` : ''}${commCard(d.comm)}`;
}
{ const f0 = staffHome; staffHome = async () => { await f0(); const a = document.querySelector('.mtiles'); if (a && !$('#exs')) { const d = document.createElement('div'); d.id = 'exs'; a.before(d); } fillExec(S.me.id); }; }
{ const f0 = storePeopleView; storePeopleView = async sid => {
  await f0(sid);
  const xs = await api(`/store/${sid}/exec`).catch(() => null); if (!xs || !$('#main')) return;
  const box = document.createElement('div');
  const cm = xs.filter(x => x.comm).sort((a, b) => b.comm.amount - a.comm.amount);
  box.innerHTML = `<div class="sec-t2 row between"><span>执行分排行 · 近 30 天</span><span class="muted small">&lt;70 自动提醒辅导</span></div><div class="list">${xs.map(x => `<a class="task" href="#/hrp/${x.id}"><span class="rk">${x.rank}</span><div class="b"><div class="ttl">${esc(x.name)} <span class="muted small">${esc(x.role_name)}</span></div><div class="muted small">完成 ${x.parts.rate ?? '-'}% · 准时 ${x.parts.ontime ?? '-'}% · 获肯定 ${x.parts.good}</div></div><b class="pscore" style="color:${rateColor(x.score)}">${x.score}</b></a>`).join('') || '<div class="empty">暂无数据</div>'}</div>
  ${cm.length ? `<div class="sec-t2">本月提成 · 售卡 / 打扫</div><div class="list">${cm.map(x => `<a class="task" href="#/hrp/${x.id}"><div class="b"><div class="ttl">${esc(x.name)} <span class="muted small">${esc(x.role_name)}</span></div><div class="muted small">${esc(x.comm.kind)} · ${x.comm.count} ${x.comm.unit_label} · ${esc(x.comm.tip)}</div></div><b class="amt">¥${x.comm.amount}</b></a>`).join('')}</div>` : ''}`;
  const foot = $('#main').querySelector('.foot'); foot ? foot.before(box) : $('#main').appendChild(box);
}; }

// ---------- 职级路径 ----------
const careerHtml = c => c ? `<div class="sec-t2 row between"><span>职级路径 · ${esc(c.current)}</span>${c.next ? `<span class="muted small">晋升「${esc(c.next)}」 ${c.pct}%</span>` : ''}</div>
  <div class="ldr"><div class="lcline">${c.path.map(k => `<span class="${k === c.current ? 'now' : c.path.indexOf(k) < c.path.indexOf(c.current) ? 'past' : ''}">${k}</span>`).join('')}</div>
  ${c.conds.map(x => `<div class="iss-i"><span class="tag ${x.ok ? 'ok' : 'warn'}">${x.ok ? '已达成' : '未达成'}</span><span>${esc(x.t)} <small class="muted">（${esc(x.v)}）</small></span></div>`).join('')}</div>` : '';
async function appendCareer(id) {
  const c = await api('/career/' + id).catch(() => null); if (!c || !$('#main')) return;
  const box = document.createElement('div'); box.innerHTML = careerHtml(c);
  const hd = $('#main').querySelector('.pghd'); (hd ? hd.nextElementSibling || hd : $('#main').firstChild).after(box);
}
{ const f0 = VIEWS.leader; VIEWS.leader = async id => { await f0(id); appendCareer(id); }; }
{ const f0 = VIEWS.hrp; VIEWS.hrp = async id => { await f0(id); const u = (S.meta.users || []).find(x => x.id === Number(id)); if (u && (['店助', '前台经理', '客房经理'].includes(u.role_name) || u.level === 'store_manager')) appendCareer(id); }; }
{ const f0 = regionPeople; regionPeople = async () => {
  await f0();
  const xs = await api('/career-pool').catch(() => null); if (!xs || !$('#main')) return;
  const box = document.createElement('div');
  box.innerHTML = `<div class="sec-t2 row between"><span>储备店长池</span><span class="muted small">店助 / 部门经理 · 按晋升条件达成度</span></div><div class="list">${xs.map(x => `<a class="task" href="#/hrp/${x.id}"><div class="b"><div class="ttl">${esc(x.name)} <span class="muted small">${esc(x.role_name)} · ${esc(x.store)}</span></div><div class="muted small">${x.conds.filter(c => !c.ok).map(c => esc(c.t)).join('；') || '条件已全部达成，可安排带店实习'}</div></div><b class="pscore" style="color:${rateColor(x.pct)}">${x.pct}<small>%</small></b></a>`).join('')}</div>`;
  const foot = $('#main').querySelector('.foot'); foot ? foot.before(box) : $('#main').appendChild(box);
}; }

// ---------- 开发漏斗 ----------
function funnelHtml(d) {
  const f = d.funnel, mx = Math.max(1, f.steps[0].n), dev = ['region_manager', 'dev_manager'].includes(S.me.level);
  const leads = d.projects.filter(p => ['线索', '意向'].includes(p.stage));
  return `<div class="sec-t2 row between"><span>开发漏斗</span>${f.lead_to_sign != null ? `<span class="muted small">线索到签约平均 ${f.lead_to_sign} 天</span>` : ''}</div>
  <div class="ldr">${f.steps.map(s => `<div class="fnl"><span>${s.l}</span><i><em style="width:${Math.max(6, s.n * 100 / mx)}%"></em></i><b>${s.n}</b><small class="muted">${s.rate != null ? s.rate + '%' : ''}</small></div>`).join('')}</div>
  <div class="row between sec-t2"><span>线索 · 意向 ${leads.length}</span>${dev ? '<button class="btn sm" id="nld">录入线索</button>' : ''}</div>
  <div class="list">${leads.map(p => `<div class="task"><div class="b"><div class="ttl">${esc(p.name)} <span class="tag ${p.stage === '意向' ? 'acc' : ''}">${p.stage}</span></div><div class="muted small">${esc(p.city)} · ${p.rooms || '-'} 间 · 业主 ${esc(p.owner || '-')} · 开发 ${esc(p.dev_name || '-')}${p.exit_note ? ' · ' + esc(p.exit_note) : ''}</div></div>
    ${dev ? `<div class="row" style="gap:6px;flex:none">${p.stage === '线索' ? `<button class="btn sm" data-ld="intent:${p.id}">转意向</button>` : `<button class="btn primary sm" data-ld="sign:${p.id}">签约</button>`}<button class="btn sm" data-ld="drop:${p.id}">放弃</button></div>` : ''}</div>`).join('') || '<div class="empty">暂无线索</div>'}</div>
  <div class="sec-t2">节点贡献 · 结果回溯到人</div><div class="list">${d.contrib.map(c => `<div class="task"><div class="b"><div class="ttl">${esc(c.name)} <span class="muted small">${esc(c.role)}</span></div><div class="muted small">签约 ${c.signed} · 完成节点 ${c.nodes}${c.ontime_rate != null ? ` · 准时 ${c.ontime_rate}%` : ''}${c.opened.length ? ' · 开业店：' + c.opened.map(o => `${esc(o.name)}${o.gap != null ? `（爬坡 ${o.gap >= 0 ? '+' : ''}${o.gap}）` : ''}`).join('、') : ''}</div></div></div>`).join('')}</div>`;
}
function bindFunnel(d) {
  if ($('#nld')) $('#nld').onclick = () => formModal('录入开发线索', `<label class="f"><span>项目名称</span><input name="name" required></label><div class="row" style="gap:8px"><label class="f" style="flex:1"><span>城市</span><input name="city"></label><label class="f" style="flex:1"><span>房量</span><input type="number" name="rooms"></label></div><label class="f"><span>业主</span><input name="owner"></label><label class="f"><span>说明</span><textarea name="note"></textarea></label>`, f => act(() => api('/leads', f), '线索已录入'));
  document.querySelectorAll('[data-ld]').forEach(b => b.onclick = () => {
    const [op, id] = b.dataset.ld.split(':'), p = d.projects.find(x => x.id === Number(id));
    if (op === 'intent') return formModal('转为意向 · ' + p.name, '<label class="f"><span>说明</span><textarea name="note" placeholder="例如：意向书已签、已看样板店"></textarea></label>', f => act(() => api(`/leads/${id}/intent`, f), '已转意向'));
    if (op === 'drop') return formModal('放弃线索 · ' + p.name, '<label class="f"><span>放弃原因</span><textarea name="note" required></textarea></label>', f => act(() => api(`/leads/${id}/drop`, f), '已放弃'));
    formModal('签约 · ' + p.name, `<div class="row" style="gap:8px"><label class="f" style="flex:1"><span>签约日期</span><input type="date" name="sign_date" value="${S.me.today}"></label><label class="f" style="flex:1"><span>房量</span><input type="number" name="rooms" value="${p.rooms || ''}" required></label></div><label class="f"><span>投资预算（万）</span><input type="number" name="budget"></label><label class="chk"><input type="checkbox" name="fund_ok"> 业主资金已到位</label><p class="muted small">签约后生成 9 个节点，进入管道店。</p>`,
      f => act(() => api(`/leads/${id}/sign`, { ...f, rooms: Number(f.rooms) }), '已签约，进入管道店'));
  });
}


// ---------- 采购与物料 ----------
const RQ_ST = { open: ['warn', '待审批'], approved: ['acc', '配送中'], received: ['ok', '已收货'], rejected: ['bad', '已退回'] };
const rqRow = (r, can) => `<div class="task"><div class="b"><div class="ttl">${r.store ? esc(r.store) + ' · ' : ''}${r.items.map(x => `${esc(x.name)} ${x.qty}${esc(x.unit)}`).join('、')}</div><div class="muted small">${esc(r.creator || '')} ${esc((r.created_at || '').slice(5))} · ¥${r.items.reduce((a, x) => a + (x.amt || 0), 0)}${r.note ? ' · ' + esc(r.note) : ''}</div></div>
  <div class="row" style="gap:6px;flex:none">${can.approve && r.status === 'open' ? `<button class="btn primary sm" data-rq="approve:${r.id}">批准</button><button class="btn sm" data-rq="reject:${r.id}">退回</button>` : ''}${can.req && r.status === 'approved' ? `<button class="btn primary sm" data-rq="receive:${r.id}">确认收货</button>` : ''}<span class="tag ${RQ_ST[r.status][0]}">${RQ_ST[r.status][1]}</span></div></div>`;
function bindRq() { document.querySelectorAll('[data-rq]').forEach(b => b.onclick = () => { const [op, id] = b.dataset.rq.split(':');
  if (op === 'receive') return formModal('确认收货 · 供应商评价', [['on_time', '到货及时'], ['quality', '质量'], ['price', '价格']].map(([k, l]) => `<label class="f"><span>${l}</span><select name="${k}">${[5, 4, 3, 2, 1].map(n => `<option value="${n}">${n} 分</option>`).join('')}</select></label>`).join('') + '<label class="f"><span>问题说明（可选）</span><input name="note" placeholder="例如：晚到 40 分钟 / 2 包破损"></label>', x => act(() => api(`/requisitions/${id}/receive`, { rating: x }), '已收货，库存已更新'));
  act(async () => { await api(`/requisitions/${id}/${op}`, {}); route(); }, { approve: '已批准', reject: '已退回', receive: '已收货，库存已更新' }[op]); }); }
VIEWS.proc = async () => {
  const sid = Number(qs().get('store')) || (S.meta.stores.length === 1 ? S.meta.stores[0].id : 0);
  if (!sid) {
    const d = await api('/proc');
    $('#main').innerHTML = `<div class="pghd row between"><b>采购与物料 · 区域</b>${d.can_std ? '<button class="btn sm" id="pstd">统购标准</button>' : ''}</div>
    <p class="muted small" style="margin-top:-6px">品牌统购标准：${esc(d.std.must.join('、'))} 必须走统购，近 3 月统购率目标 ≥ ${d.std.rate}%。</p>
    <div class="list">${d.stores.map(s => `<a class="task" href="#/proc?store=${s.id}"><div class="b"><div class="ttl">${esc(s.name)}</div><div class="muted small">用量异常 ${s.abn} · 低于安全库存 ${s.low} · 待审批申领 ${s.open}</div></div><b class="pscore" style="color:${s.rate >= s.target ? 'var(--ok)' : 'var(--bad)'}">${s.rate ?? '-'}<small>%</small></b></a>`).join('')}</div>
    <div class="sec-t2">待处理申领</div><div class="list">${d.reqs.map(r => rqRow(r, { approve: d.can_approve })).join('') || '<div class="empty">暂无</div>'}</div>`;
    bindRq();
    if ($('#pstd')) $('#pstd').onclick = () => formModal('品牌统购标准', `<label class="f"><span>统购率目标 %</span><input type="number" name="rate" value="${d.std.rate}" min="1" max="100"></label><label class="f"><span>必须统购的品类（逗号分隔）</span><input name="must" value="${esc(d.std.must.join(','))}"></label>`, f => act(() => api('/proc/std', { rate: Number(f.rate), must: f.must.split(/[,，、\s]+/) }), '已保存'));
    return;
  }
  const d = await api('/proc?store=' + sid), can = { approve: d.can_approve, req: d.can_req }, tk = d.takes.find(k => k.status === 'planned');
  $('#main').innerHTML = `<div class="pghd row between"><b>采购与物料 · ${esc(d.store)}</b>${d.can_req ? '<button class="btn primary sm" id="nrq">物料申领</button>' : ''}</div>
  <div class="ldr"><div class="ldr-h"><div class="grow"><b>品牌统购率 · 近 3 月</b><span class="muted small">必须统购：${esc(d.must.join('、'))}</span></div><div class="ldr-s"><b class="${d.rate < d.target ? 'bad' : ''}">${d.rate ?? '-'}<small>%</small></b><span>目标 ${d.target}%</span></div></div>
    ${d.cats.map(c => `<div class="fnl"><span>${esc(c.cat)}</span><i><em style="width:${c.rate}%;background:${!c.must ? '#C9CDD2' : c.rate >= d.target ? 'var(--ok)' : 'var(--bad)'}"></em></i><b>${c.rate}%</b><small class="muted">${c.must ? '必须' : '自采'}</small></div>`).join('')}</div>
  ${tk ? `<div class="sec-t2">物料盘点 · ${esc(tk.date)}</div><div class="ldr"><div class="muted small">盘点人 ${esc(tk.assignee || '')}，逐项填写实盘数量，提交后更新库存并计算盘盈盘亏</div><button class="btn primary sm" id="stk" style="margin-top:8px">开始盘点</button></div>` : ''}
  <div class="sec-t2 row between"><span>库存与用量 · 近 30 天 ${d.rn} 间夜</span><span class="muted small">用量超标准 20% 标红</span></div>
  <div class="list">${d.mats.map(m => `<div class="task"><div class="b"><div class="ttl">${esc(m.name)} <span class="muted small">${esc(m.cat)}${m.central ? ' · 统购' : ''}</span>${m.low ? ' <span class="tag warn">低于安全库存</span>' : ''}${m.dev >= 20 ? ` <span class="tag bad">用量 +${m.dev}%</span>` : ''}</div><div class="muted small">库存 ${m.qty ?? 0}/${m.safety ?? 0}${esc(m.unit)} · 用量 ${m.use} / 标准 ${m.std_use}${esc(m.unit)}（每间夜 ${m.std_per_rn}）</div></div></div>`).join('')}</div>
  <div class="sec-t2">申领记录</div><div class="list">${d.reqs.map(r => rqRow(r, can)).join('') || '<div class="empty">暂无</div>'}</div>
  ${d.takes.filter(k => k.status === 'done').length ? `<div class="sec-t2">盘点记录</div><div class="list">${d.takes.filter(k => k.status === 'done').map(k => `<div class="task"><div class="b"><div class="ttl">${esc(k.date)} 盘点 · ${esc(k.assignee || '')}</div><div class="muted small">${k.items.filter(x => x.diff).map(x => `${esc(x.name)} ${x.diff > 0 ? '+' : ''}${x.diff}`).join('、') || '账实相符'}</div></div><b class="amt">¥${k.items.reduce((a, x) => a + x.amt, 0)}</b></div>`).join('')}</div>` : ''}`;
  bindRq();
  if ($('#nrq')) $('#nrq').onclick = () => formModal('物料申领', d.mats.map(m => `<div class="cfr"><span>${esc(m.name)} <small class="muted">库存 ${m.qty ?? 0}/${m.safety}${esc(m.unit)}${m.central ? ' · 统购' : ''}</small></span><label class="cfi"><input type="number" name="q_${m.id}" min="0" value="${m.low ? Math.ceil(m.safety - (m.qty || 0)) : ''}"><small>${esc(m.unit)}</small></label></div>`).join('') + '<label class="f"><span>备注</span><input name="note"></label>',
    f => act(() => api('/requisitions', { store_id: sid, note: f.note, items: d.mats.map(m => ({ mid: m.id, qty: Number(f['q_' + m.id]) || 0 })) }), '已提交，等待区域审批'));
  if ($('#stk')) $('#stk').onclick = () => formModal('物料盘点 · ' + tk.date, d.mats.map(m => `<div class="cfr"><span>${esc(m.name)} <small class="muted">账面 ${m.qty ?? 0}${esc(m.unit)}</small></span><label class="cfi"><input type="number" step="any" name="c_${m.id}" required><small>${esc(m.unit)}</small></label></div>`).join(''),
    f => act(() => api(`/stocktakes/${tk.id}/submit`, { counts: Object.fromEntries(d.mats.map(m => [m.id, f['c_' + m.id]])) }), '盘点已提交，库存已更新'));
};

// ---------- 培训与认证 ----------
const EN_ST = { enrolled: ['acc', '已报名'], passed: ['ok', '通过'], certified: ['ok', '已认证'], failed: ['bad', '未通过'] };
VIEWS.train = async () => {
  const d = await api('/train'), k = qs().get('k') || '全部';
  const cs = d.classes.filter(c => k === '全部' || c.kind === k);
  $('#main').innerHTML = `<div class="pghd row between"><b>培训与认证</b>${d.can_edit ? '<button class="btn primary sm" id="ncl">开班</button>' : ''}</div>
  <div class="tfil">${['全部', ...d.kinds, '师徒带教'].map(x => `<a class="${k === x ? 'on' : ''}" href="#/train?k=${encodeURIComponent(x)}">${x}</a>`).join('')}</div>
  ${k === '师徒带教' ? `<div class="list">${d.mentors.map(m => `<div class="task"><div class="b"><div class="ttl">${esc(m.mentee)} <span class="muted small">${esc(m.mentee_role)} · ${esc(m.store)}</span></div><div class="muted small">师傅 ${esc(m.mentor)} · 入职第 ${m.day} 天</div>
    <div class="stags">${['d30', 'd60', 'd90'].map(x => m.checks[x] ? `<span class="tag ok">${x.slice(1)} 天 ✓</span>` : m.day >= Number(x.slice(1)) ? `<button class="btn sm" data-mc="${m.id}:${x}">${x.slice(1)} 天验收</button>` : `<span class="tag">${x.slice(1)} 天</span>`).join('')}</div></div></div>`).join('') || '<div class="empty">暂无带教</div>'}</div>
    <p class="muted small">新员工入职即指定师傅，30 / 60 / 90 天分别验收；结果计入双方画像。</p>`
  : cs.map(c => `<div class="ldr"><div class="row between"><b>${esc(c.name)} <span class="tag">${esc(c.kind)}</span></b><span class="tag ${c.phase === '已结束' ? '' : c.phase === '进行中' ? 'acc' : 'warn'}">${c.phase}</span></div>
    <div class="muted small">${c.start} 至 ${c.end} · 讲师 ${esc(c.trainer || '-')} · ${c.enroll.length}/${c.seats} 人${c.cert ? ' · 认证：' + esc(c.cert) : ''}</div>
    <div class="list" style="margin-top:6px">${c.enroll.map(e => `<div class="task"><div class="b"><div class="ttl">${esc(e.name)} <span class="muted small">${esc(e.role_name)} · ${esc(e.store || '区域')}</span></div>${e.score ? `<div class="muted small">成绩 ${e.score}</div>` : ''}</div>${d.can_edit && e.status === 'enrolled' && c.phase !== '报名中' ? `<button class="btn sm" data-er="${e.id}">录入结果</button>` : ''}<span class="tag ${EN_ST[e.status][0]}">${EN_ST[e.status][1]}</span></div>`).join('') || '<div class="empty">暂无学员</div>'}</div>
    ${d.can_nominate && c.phase !== '已结束' ? `<button class="btn sm" data-en="${c.id}" style="margin-top:6px">${d.can_edit ? '添加学员' : '提名学员'}</button>` : ''}</div>`).join('') || '<div class="list"><div class="empty">暂无班级</div></div>'}
  <p class="muted small">店长班认证计入店长职级路径；经理班、店长班是储备店长的晋升条件。</p>`;
  if ($('#ncl')) $('#ncl').onclick = () => formModal('开班', `<label class="f"><span>班级名称</span><input name="name" required></label><label class="f"><span>类型</span><select name="kind">${d.kinds.map(x => `<option>${x}</option>`).join('')}</select></label><div class="row" style="gap:8px"><label class="f" style="flex:1"><span>开始</span><input type="date" name="start" required></label><label class="f" style="flex:1"><span>结束</span><input type="date" name="end" required></label></div><div class="row" style="gap:8px"><label class="f" style="flex:1"><span>名额</span><input type="number" name="seats" value="20"></label><label class="f" style="flex:1"><span>认证名称</span><input name="cert" placeholder="如：全季店长认证"></label></div>`, f => act(() => api('/train/classes', f), '已开班，已通知店长提名'));
  document.querySelectorAll('[data-en]').forEach(b => b.onclick = () => formModal('添加学员', `<label class="f"><span>学员</span><select name="u">${(S.meta.users || []).filter(u => ['staff', 'store_manager'].includes(u.level)).map(u => `<option value="${u.id}">${esc(u.name)} · ${esc(u.role_name)}</option>`).join('')}</select></label>`, f => act(() => api('/train/enroll', { class_id: Number(b.dataset.en), user_id: Number(f.u) }), '已报名')));
  document.querySelectorAll('[data-er]').forEach(b => b.onclick = () => formModal('录入考核结果', `<label class="f"><span>结果</span><select name="status"><option value="certified">取得认证</option><option value="passed">通过</option><option value="failed">未通过</option></select></label><label class="f"><span>成绩</span><input type="number" name="score"></label>`, f => act(() => api('/train/result', { id: Number(b.dataset.er), ...f }), '已录入')));
  document.querySelectorAll('[data-mc]').forEach(b => b.onclick = () => { const [id, kk] = b.dataset.mc.split(':'); formModal(`${kk.slice(1)} 天带教验收`, '<label class="f"><span>验收意见</span><textarea name="note" placeholder="例如：可独立完成退房查房"></textarea></label>', f => act(() => api(`/mentors/${id}/check`, { k: kk, note: f.note }), '已验收')); });
};

{ const f0 = VIEWS.train; VIEWS.train = async () => {
  await f0();
  const k = qs().get('k') || '全部', d = isRegionLv() ? await api('/train/insights').catch(() => null) : null;
  const top = document.createElement('div');
  if (d && k === '全部') top.innerHTML = `${d.alerts.length ? `<div class="sec-t2">达标培训提醒</div><div class="ldr">${d.alerts.map(a => `<div class="iss-i"><span class="tag ${a.type === '上岗门槛' ? 'bad' : 'warn'}">${a.type}</span><span>${esc(a.text)}</span></div>`).join('')}</div>` : ''}
    <div class="wgrid">${[['训后有效率', d.eff_rate ?? '-', '%'], ['人均学时', d.hours_per, '时'], ['培训费用', Math.round(d.cost / 1000) / 10, '万'], ['内训师', d.trainers.length, '人']].map(([l, v, u]) => `<div><b>${v}<small>${u}</small></b><span>${l}</span></div>`).join('')}</div>
    ${d.topics.length ? `<div class="sec-t2">建议开班 · 从问题反推</div><div class="list">${d.topics.map(t => `<div class="task"><div class="b"><div class="ttl">${t.code ? 'No.' + esc(t.code) + ' ' : ''}${esc(t.item)}</div><div class="muted small">近 60 天不合格 ${t.n} 次</div></div>${S.me.level !== 'hr_manager' ? `<button class="btn sm" data-tp="${esc(t.item)}">开专题班</button>` : ''}</div>`).join('')}</div>` : ''}
    <details class="tgrp"><summary>必修课与学分 · 内训师库 <i>展开</i></summary><div class="ldr">${Object.entries(d.credits.required).map(([r, cs]) => `<div class="iss-i"><span class="tag">${r}</span><span>必修：${cs.join('、')}</span></div>`).join('')}<div class="muted small">年度学分目标 ${d.credits.target} 分，每天培训计 4 分</div></div>
      <div class="list">${d.trainers.map(t => `<div class="task"><div class="b"><div class="ttl">${esc(t.name)} <span class="muted small">${esc(t.role_name)}</span></div><div class="muted small">授课 ${t.classes} 班 · 带徒 ${t.as_mentor} 人 · 90 天结业 ${t.done90}${t.mentor_score ? ` · 徒弟评分 ${t.mentor_score}` : ''}</div></div></div>`).join('')}</div></details>
    ${d.eff.length ? `<details class="tgrp"><summary>训后效果追踪 ${d.eff.length} 人 <i>展开</i></summary><div class="list">${d.eff.map(e => `<div class="task"><div class="b"><div class="ttl">${esc(e.name)} <span class="muted small">${esc(e.cname)}</span></div><div class="muted small">训前 ${e.before}% → 训后 ${e.after}%</div></div>${DIFF(e.after - e.before)}</div>`).join('')}</div></details>` : ''}`;
  const tf = $('#main').querySelector('.tfil'); if (tf && top.innerHTML) tf.after(top);
  document.querySelectorAll('[data-tp]').forEach(b => b.onclick = () => formModal('开专题班', `<label class="f"><span>班级名称</span><input name="name" value="专题：${esc(b.dataset.tp)}"></label><div class="row" style="gap:8px"><label class="f" style="flex:1"><span>开始</span><input type="date" name="start" required></label><label class="f" style="flex:1"><span>结束</span><input type="date" name="end" required></label></div>`, f => act(() => api('/train/classes', { ...f, kind: '品牌认证', seats: 20 }), '已开班')));
  document.querySelectorAll('[data-en]').forEach(b => { const s = document.createElement('button'); s.className = 'btn sm'; s.textContent = '建议报名'; s.style.margin = '6px 0 0 6px'; b.after(s);
    s.onclick = async () => { const xs = await api('/train/suggest/' + b.dataset.en); modal('建议报名人员', `<div class="list">${xs.map(x => `<div class="task"><div class="b"><div class="ttl">${esc(x.name)} <span class="muted small">${esc(x.role_name)} · ${esc(x.store)}</span></div><div class="muted small">${esc(x.why)}</div></div><button class="btn primary sm" data-sg="${x.id}">报名</button></div>`).join('') || '<div class="empty">暂无建议人员</div>'}</div>`, m => m.querySelectorAll('[data-sg]').forEach(y => y.onclick = () => act(async () => { await api('/train/enroll', { class_id: Number(b.dataset.en), user_id: Number(y.dataset.sg) }); y.replaceWith(Object.assign(document.createElement('span'), { className: 'tag ok', textContent: '已报名' })); }, '已报名'))); }; });
  if (k === '师徒带教') {
    document.querySelectorAll('[data-mc]').forEach(b => { const nb = b.cloneNode(true); b.replaceWith(nb); nb.onclick = () => { const [id, kk] = nb.dataset.mc.split(':');
      formModal(`${kk.slice(1)} 天带教验收 · 双方互评`, '<div class="row" style="gap:8px"><label class="f" style="flex:1"><span>师傅评徒弟（0-100）</span><input type="number" name="ms" min="0" max="100" required></label><label class="f" style="flex:1"><span>徒弟评师傅（0-100）</span><input type="number" name="ts" min="0" max="100" required></label></div><label class="f"><span>验收意见</span><textarea name="note"></textarea></label><p class="muted small">评分同时计入徒弟和师傅的画像。</p>',
        f => act(() => api(`/mentors/${id}/check`, { k: kk, note: f.note, mentee_score: Number(f.ms), mentor_score: Number(f.ts) }), '已验收')); }; });
    if (S.me.level === 'train_manager' || S.me.level === 'store_manager' || S.me.level === 'region_manager') {
      const btn = document.createElement('button'); btn.className = 'btn primary sm'; btn.textContent = '指定带教师傅'; btn.style.marginBottom = '8px'; $('#main').querySelector('.tfil').after(btn);
      btn.onclick = () => { const us = (S.meta.users || []).filter(u => u.level === 'staff');
        formModal('指定带教师傅', `<label class="f"><span>新员工</span><select name="m" id="mte">${us.map(u => `<option value="${u.id}">${esc(u.name)} · ${esc(u.role_name)} · ${esc(storeName(u.store_id))}</option>`).join('')}</select></label><label class="f"><span>师傅（同部门、执行分高的优先）</span><select name="t" id="mtr"></select></label>`, f => act(() => api('/mentors', { mentee_id: Number(f.m), mentor_id: Number(f.t) }), '已指定，双方已收到提醒'));
        const load = async () => { const xs = await api('/mentor-cands/' + $('#mte').value); $('#mtr').innerHTML = xs.map(x => `<option value="${x.id}">${esc(x.name)} · ${esc(x.role_name)}${x.score ? ' · 执行分 ' + x.score : ''} · ${esc(x.tier)}</option>`).join(''); };
        $('#mte').onchange = load; load(); };
    }
  }
}; }
const isRegionLv = () => REGION_LV.includes(S.me.level);
{ const f0 = VIEWS.hrp; VIEWS.hrp = async id => { await f0(id); const s = await api('/mentor-stats/' + id).catch(() => null); if (!s || !$('#main') || !(s.as_mentor || s.as_mentee)) return;
  const box = document.createElement('div'); box.innerHTML = `<div class="sec-t2">师徒带教评价</div><div class="ldr"><div class="wgrid">${[['带徒', s.as_mentor, '人'], ['徒弟评分', s.mentor_score ?? '-', ''], ['90天结业', s.done90, '人'], ['被带教评分', s.mentee_score ?? '-', '']].map(([l, v, u]) => `<div><b>${v}<small>${u}</small></b><span>${l}</span></div>`).join('')}</div></div>`;
  const foot = $('#main').querySelector('.foot'); foot ? foot.before(box) : $('#main').appendChild(box); }; }


// ---------- 绩效与薪酬 ----------
const paySheet = p => `<div class="ldr"><div class="row between"><b>${esc(p.ym)} 绩效单 · 预估</b><b class="amt">¥${p.total}</b></div>
  ${p.items.map(i => `<div class="iss-i"><span class="grow">${esc(i.l)}</span><b>¥${i.amt}</b></div>`).join('')}
  ${p.kind === 'sm' && p.assess ? `<div class="muted small" style="margin-top:6px">季度考核 ${p.assess.score} 分 · ${p.assess.parts.map(x => `${esc(x.l)} ${x.v}（${x.w}%）${x.note ? ' ' + esc(x.note) : ''}`).join('，')}</div>` : ''}
  ${p.kind === 'staff' ? `<div class="muted small" style="margin-top:6px">年度学分 ${p.credits}/${p.credit_target}${p.mentor.as_mentor ? ` · 带徒 ${p.mentor.as_mentor} 人` : ''} · 执行分系数：90 分以上 1.2，80 以上 1.0，70 以上 0.9，其余 0.8</div>` : ''}</div>`;
const APL = { open: ['warn', '处理中'], accepted: ['ok', '已采纳'], rejected: ['bad', '未采纳'] };
VIEWS.pay = async () => {
  const uid = Number(qs().get('uid')) || 0, mine = !uid && (S.me.level === 'staff' || !da('pay'));
  if (mine || uid) {
    const p = await api('/pay/' + (uid || S.me.id));
    $('#main').innerHTML = `<div class="pghd row between"><b>${uid ? esc(p.name) + ' · ' : '我的'}绩效与薪酬</b>${mine ? '<button class="btn sm" id="apl">申诉</button>' : ''}</div>${paySheet(p)}
    <div class="sec-t2">申诉记录</div><div class="list">${p.appeals.map(a => `<div class="task"><div class="b"><div class="ttl">${esc(a.item || '绩效')}：${esc(a.reason)}</div>${a.reply ? `<div class="muted small">回复：${esc(a.reply)}</div>` : ''}</div><span class="tag ${APL[a.status][0]}">${APL[a.status][1]}</span></div>`).join('') || '<div class="empty">暂无</div>'}</div>
    <p class="muted small">金额为模拟预估，以财务发放为准。</p>`;
    if ($('#apl')) $('#apl').onclick = () => formModal('绩效申诉', `<label class="f"><span>申诉项目</span><select name="item">${p.items.map(i => `<option>${esc(i.l.replace(/（.*/, ''))}</option>`).join('')}</select></label><label class="f"><span>理由</span><textarea name="reason" required></textarea></label>`, f => act(() => api('/pay/appeal', f), '已提交，店长和人事会处理'));
    return;
  }
  const sid = Number(qs().get('store')) || 0, d = await api('/pay-board' + (sid ? '?store=' + sid : ''));
  $('#main').innerHTML = `<div class="pghd"><b>绩效与薪酬</b></div>
  ${d.appeals.length ? `<div class="sec-t2">待处理申诉</div><div class="list">${d.appeals.map(a => `<div class="task"><div class="b"><div class="ttl">${esc(a.name)} · ${esc(a.store || '')} · ${esc(a.item || '绩效')}</div><div class="muted small">${esc(a.reason)}</div></div><button class="btn primary sm" data-ap="${a.id}">处理</button></div>`).join('')}</div>` : ''}
  ${d.sms.length ? `<div class="sec-t2">店长季度考核</div><div class="list">${d.sms.map(x => `<a class="task" href="#/pay?uid=${x.id}"><div class="b"><div class="ttl">${esc(x.name)}</div><div class="muted small">${x.assess ? `${x.assess.score} 分 · 奖金系数 ×${x.assess.coef}` : '未带店'}</div></div><span class="gchip g${x.assess?.grade || 'C'}">${x.assess?.grade || '-'}</span></a>`).join('')}</div>` : ''}
  <div class="sec-t2">员工本月绩效单</div><div class="list">${d.staff.map(x => `<a class="task" href="#/pay?uid=${x.id}"><div class="b"><div class="ttl">${esc(x.name)} <span class="muted small">${esc(x.role_name)} · ${esc(x.store)}</span></div><div class="muted small">执行分 ${x.exec ?? '-'} · 系数 ${x.coef}${x.items[2] ? ' · ' + esc(x.items[2].l) + ' ¥' + x.items[2].amt : ''}</div></div><b class="amt">¥${x.total}</b></a>`).join('')}</div>
  <p class="muted small">基本工资、提成为模拟数据。</p>`;
  document.querySelectorAll('[data-ap]').forEach(b => b.onclick = () => formModal('处理申诉', `<label class="f"><span>结果</span><select name="status"><option value="accepted">采纳</option><option value="rejected">不采纳</option></select></label><label class="f"><span>回复</span><textarea name="reply"></textarea></label>`, f => act(() => api('/pay/appeal/' + b.dataset.ap, f), '已回复')));
};

// ---------- 值班交接班 ----------
VIEWS.shift = async () => {
  const sid = Number(qs().get('store')) || S.me.store_id || S.meta.stores[0]?.id, d = await api('/shift?store=' + sid), p = d.pending;
  const blk = s => `<div class="ldr"><div class="row between"><b>${esc(s.date)} ${esc(s.shift)} · ${esc(s.by_name)}</b><span class="tag ${s.status === 'open' ? 'warn' : 'ok'}">${s.status === 'open' ? '待接班' : '已接班 · ' + esc(s.taker || '')}</span></div>
    ${s.issues.map(i => `<div class="iss-i"><span class="tag ${i.done ? 'ok' : 'bad'}">${i.done ? '已处理' : '遗留'}</span><span>${esc(i.text)}</span></div>`).join('')}
    ${[['宾客', s.guest], ['设备', s.equip], ['备用金', s.cash]].filter(x => x[1]).map(([l, v]) => `<div class="muted small">${l}：${esc(v)}</div>`).join('')}</div>`;
  $('#main').innerHTML = `<div class="pghd row between"><b>值班交接 · ${esc(d.store)}</b>${!p ? '<button class="btn primary sm" id="nsh">填写交班单</button>' : ''}</div>
  ${p ? `<div class="sec-t2">待接班</div>${blk(p)}${p.by !== S.me.id ? '<button class="btn primary" id="tk" style="width:100%">确认接班</button>' : '<p class="muted small">等待下一班确认接班</p>'}` : ''}
  ${d.carry.length && !p ? `<div class="sec-t2">上一班遗留 ${d.carry.length} 项（会自动带入本班交班单）</div><div class="ldr">${d.carry.map(i => `<div class="iss-i"><span class="tag bad">遗留</span><span>${esc(i.text)}</span></div>`).join('')}</div>` : ''}
  <div class="sec-t2">交班记录</div>${d.logs.filter(s => s.status === 'taken').map(blk).join('') || '<div class="list"><div class="empty">暂无</div></div>'}`;
  if ($('#tk')) $('#tk').onclick = () => formModal('确认接班', '<label class="f"><span>接班说明</span><textarea name="note" placeholder="例如：遗留问题已知悉，1208 回访由我跟进"></textarea></label>', f => act(() => api(`/shift/${p.id}/take`, f), '已接班'));
  if ($('#nsh')) $('#nsh').onclick = () => formModal('填写交班单', `<label class="f"><span>班次</span><select name="shift">${d.shifts.map(x => `<option>${x}</option>`).join('')}</select></label>
    ${d.carry.map((i, k) => `<label class="f row" style="gap:8px"><input type="checkbox" name="cd${k}"><span>上班遗留：${esc(i.text)}（勾选表示已处理）</span></label>`).join('')}
    <label class="f"><span>本班遗留问题（每行一条）</span><textarea name="iss"></textarea></label><label class="f"><span>宾客特殊需求</span><input name="guest"></label><label class="f"><span>设备异常</span><input name="equip"></label><label class="f"><span>备用金 / 钥匙</span><input name="cash"></label>`,
    f => act(() => api('/shift', { store_id: sid, shift: f.shift, guest: f.guest, equip: f.equip, cash: f.cash, issues: [...d.carry.map((i, k) => ({ ...i, done: !!f['cd' + k] })), ...(f.iss || '').split('\n').map(text => ({ text }))] }), '已交班，等待接班'));
};

// ---------- 品牌标准 ----------
VIEWS.brands = async () => {
  const d = await api('/brands');
  $('#main').innerHTML = `<div class="pghd"><b>品牌标准</b></div><p class="muted small" style="margin-top:-6px">不同品牌分别设定统购率、爬坡基准、品牌认证和筹建工期，门店按所属品牌考核和排名。</p>
  ${d.brands.map((b, i) => `<div class="ldr"><div class="row between"><b>${esc(b.name)}</b>${d.can_edit ? `<button class="btn sm" data-bd="${i}">编辑</button>` : ''}</div>
    <div class="muted small">统购率 ≥ ${b.rate}%（必须统购：${esc(b.must.join('、'))}）· 爬坡基准 ×${b.ramp} · 认证「${esc(b.cert)}」· 标准工期 ${b.open_days} 天</div>
    <div class="list" style="margin-top:6px">${b.stores.map((s, k) => `<a class="task" href="#/sp/${s.id}"><span class="rk">${k + 1}</span><div class="b"><div class="ttl">${esc(s.name)}</div><div class="muted small">统购率 ${s.rate ?? '-'}%</div></div><b>${s.score}</b><span class="gchip g${s.grade}">${s.grade}</span></a>`).join('') || '<div class="empty">本区域暂无该品牌门店</div>'}</div></div>`).join('')}`;
  document.querySelectorAll('[data-bd]').forEach(x => x.onclick = () => { const b = d.brands[Number(x.dataset.bd)];
    formModal('编辑 · ' + b.name, `<label class="f"><span>统购率目标 %</span><input type="number" name="rate" value="${b.rate}"></label><label class="f"><span>必须统购品类（逗号分隔）</span><input name="must" value="${esc(b.must.join(','))}"></label><label class="f"><span>爬坡基准系数</span><input type="number" step="0.01" name="ramp" value="${b.ramp}"></label><label class="f"><span>品牌认证名称</span><input name="cert" value="${esc(b.cert)}"></label><label class="f"><span>标准筹建工期（天）</span><input type="number" name="open_days" value="${b.open_days}"></label>`,
      f => act(() => api('/brands', { ...f, name: b.name, must: f.must.split(/[,，、\s]+/) }), '已保存')); });
};

// ---------- 离职 / 调岗交接 ----------
async function handoffModal(uid) {
  const d = await api('/handoff/' + uid), L2 = { tasks: '待办任务', rects: '整改', scenes: '负责场景', templates: '工作清单', mentees: '徒弟', takes: '盘点', repairs: '报修' };
  formModal(`${d.name} · 离职 / 调岗交接`, `<p class="muted small">共 ${d.count} 项未完成工作，提交后全部转交给接手人。</p>
    <div class="ldr">${Object.entries(d.items).filter(([, v]) => v.length).map(([k, v]) => `<div class="iss-i"><span class="tag">${L2[k]} ${v.length}</span><span class="muted small">${v.slice(0, 3).map(x => esc(x.title)).join('、')}${v.length > 3 ? ' 等' : ''}</span></div>`).join('') || '<div class="muted small">无未完成工作</div>'}</div>
    <label class="f"><span>类型</span><select name="mode" id="hm"><option value="leave">离职</option><option value="transfer">调岗到其他门店</option></select></label>
    <label class="f" id="hs" style="display:none"><span>调入门店</span><select name="store_id">${d.stores.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
    <div id="hlv"><label class="f"><span>离职原因</span><select name="reason">${['薪酬待遇', '排班与工作强度', '管理方式', '发展空间', '个人原因', '试用期不合格', '违纪辞退'].map(r => `<option>${r}</option>`).join('')}</select></label>
    <label class="f"><span>类型</span><select name="voluntary"><option value="1">主动离职</option><option value="0">被动离职</option></select></label><label class="f"><span>离职面谈记录</span><textarea name="note" placeholder="员工的真实离职原因、对门店的建议"></textarea></label></div>
    <label class="f"><span>接手人</span><select name="to">${d.cands.map(c => `<option value="${c.id}">${esc(c.name)} · ${esc(c.role_name)}</option>`).join('')}</select></label>`,
    f => act(async () => { await api('/handoff/' + uid, { ...f, to: Number(f.to), store_id: Number(f.store_id) }); await loadMeta(); }, '已交接'));
  $('#hm').onchange = () => { const tr = $('#hm').value === 'transfer'; $('#hs').style.display = tr ? '' : 'none'; $('#hlv').style.display = tr ? 'none' : ''; };
}

// ---------- 客诉闭环 ----------
const CP_ST = { open: ['warn', '待处理'], handled: ['acc', '待回访'], closed: ['ok', '已关闭'] }, CP_LV = { 一般: '', 严重: 'warn', 重大: 'bad' };
const sidQ = () => Number(qs().get('store')) || (S.me.store_id && !REGION_LV.includes(S.me.level) ? S.me.store_id : 0);
VIEWS.complaints = async () => {
  const sid = sidQ(), d = await api('/complaints' + (sid ? '?store=' + sid : '')), f = qs().get('f') || 'act', K = d.kpi;
  const xs = d.list.filter(c => f === 'all' || (f === 'act' ? c.status !== 'closed' : c.status === 'closed'));
  $('#main').innerHTML = `<div class="pghd row between"><b>客诉闭环${sid ? ' · ' + esc(storeName(sid)) : ''}</b>${sid || S.me.store_id ? '<button class="btn primary sm" id="ncp">登记客诉</button>' : ''}</div>
  <section class="yic"><div class="rkpi">${[['近 30 天', K.n30, '起'], ['处理中', K.open, '起'], ['已超时', K.late, '起'], ['按时处理', K.ontime ?? '-', '%'], ['回访满意', K.sat ?? '-', '/5'], ['补偿', K.comp, '元']].map(([l, v, u], i) => `<a class="${i === 2 && v ? 'bad' : ''}"><b>${v}<small>${u}</small></b><span>${l}</span></a>`).join('')}</div>
  <p class="muted small">时限：一般 ${d.sla.一般} 小时、严重 ${d.sla.严重} 小时、重大 ${d.sla.重大} 小时。补偿 ${d.comp_limit} 元以内店长决定，超出需运营经理审批。结果计入门店画像的宾客口碑分。</p></section>
  <div class="tfil">${[['act', '处理中'], ['done', '已关闭'], ['all', '全部']].map(([k, l]) => `<a class="${f === k ? 'on' : ''}" href="#/complaints?${new URLSearchParams(sid ? { store: sid, f: k } : { f: k })}">${l}</a>`).join('')}</div>
  <div class="list">${xs.map(c => `<div class="task"><div class="b"><div class="ttl"><span class="tag ${CP_LV[c.level]}">${c.level}</span> ${esc(c.body)}</div>
    <div class="muted small">${esc(c.store)} · ${esc(c.src)}${c.guest ? ' · ' + esc(c.guest) : ''}${c.room ? ' · ' + esc(c.room) + ' 房' : ''}${c.staff ? ' · 涉及 ' + esc(c.staff) : ''} · ${esc(c.created_at.slice(5, 16))}</div>
    ${c.handle_note ? `<div class="muted small">处理：${esc(c.handle_note)}${c.comp_amt ? ` · 补偿 ¥${c.comp_amt}${c.comp_kind ? '（' + esc(c.comp_kind) + '）' : ''} ${{ pending: '待审批', approved: '已批准', rejected: '未批准' }[c.comp_status] || ''}` : ''}</div>` : ''}
    ${c.cb_score ? `<div class="muted small">回访满意度 ${c.cb_score}/5${c.cb_note ? ' · ' + esc(c.cb_note) : ''}</div>` : ''}</div>
    <div class="row" style="gap:6px;flex:none;flex-direction:column;align-items:flex-end">${c.late ? '<span class="tag bad">超时</span>' : `<span class="tag ${CP_ST[c.status][0]}">${CP_ST[c.status][1]}</span>`}
    ${c.status === 'open' && !d.can_approve ? `<button class="btn primary sm" data-cp="handle:${c.id}">处理</button>` : ''}${c.comp_status === 'pending' && d.can_approve ? `<button class="btn primary sm" data-cp="comp:${c.id}">审批</button>` : ''}${c.status === 'handled' && c.comp_status !== 'pending' && !d.can_approve ? `<button class="btn sm" data-cp="callback:${c.id}">回访</button>` : ''}</div></div>`).join('') || '<div class="empty">暂无</div>'}</div>`;
  if ($('#ncp')) $('#ncp').onclick = () => formModal('登记客诉', `<label class="f"><span>来源</span><select name="src">${d.srcs.map(x => `<option>${x}</option>`).join('')}</select></label><label class="f"><span>等级</span><select name="level">${d.levels.map(x => `<option>${x}</option>`).join('')}</select></label>
    <label class="f"><span>宾客 / 渠道</span><input name="guest"></label><label class="f"><span>房号</span><input name="room"></label><label class="f"><span>投诉内容</span><textarea name="body" required></textarea></label>
    <label class="f"><span>涉及员工（可选）</span><select name="staff_id"><option value="">无</option>${d.staff.map(x => `<option value="${x.id}">${esc(x.name)} · ${esc(x.role_name)}</option>`).join('')}</select></label>`, x => act(() => api('/complaints', { ...x, store_id: sid || S.me.store_id }), '已登记，已通知店长'));
  document.querySelectorAll('[data-cp]').forEach(b => b.onclick = () => { const [op, id] = b.dataset.cp.split(':'), c = d.list.find(x => x.id === Number(id));
    if (op === 'handle') formModal('处理客诉', `<p class="small">${esc(c.body)}</p><label class="f"><span>处理结果</span><textarea name="note" required placeholder="例如：已致歉并换房"></textarea></label><label class="f"><span>补偿方式</span><input name="comp_kind" placeholder="例如：免房费一晚 / 送早餐券"></label><label class="f"><span>补偿金额（元，可为 0）</span><input type="number" name="comp_amt" value="0"></label><p class="muted small">超过 ${d.comp_limit} 元需运营经理审批。</p>`, x => act(() => api(`/complaints/${id}/handle`, x), '已处理'));
    if (op === 'comp') formModal('补偿审批', `<p class="small">${esc(c.store)}：${esc(c.body)}<br>处理：${esc(c.handle_note || '')}<br>补偿 ¥${c.comp_amt} ${esc(c.comp_kind || '')}</p><label class="f"><span>结果</span><select name="ok"><option value="1">批准</option><option value="">不批准</option></select></label>`, x => act(() => api(`/complaints/${id}/comp`, { ok: !!x.ok }), '已审批'));
    if (op === 'callback') formModal('宾客回访', `<p class="small">${esc(c.body)}</p><label class="f"><span>满意度</span><select name="score">${[5, 4, 3, 2, 1].map(n => `<option value="${n}">${n} 分</option>`).join('')}</select></label><label class="f"><span>回访记录</span><textarea name="note"></textarea></label>`, x => act(() => api(`/complaints/${id}/callback`, x), '已回访，客诉关闭'));
  });
};

// ---------- 安全与应急 ----------
VIEWS.safety = async () => {
  const sid = sidQ();
  if (!sid) { const d = await api('/safety'); $('#main').innerHTML = `<div class="pghd"><b>安全与应急</b></div><div class="list">${d.stores.map(s => `<a class="task" href="#/safety?store=${s.id}"><div class="b"><div class="ttl">${esc(s.name)}</div><div class="muted small">${s.n} 项计划</div></div>${s.late ? `<span class="tag bad">逾期 ${s.late}</span>` : ''}${s.soon ? `<span class="tag warn">7 天内 ${s.soon}</span>` : ''}${!s.late && !s.soon ? '<span class="tag ok">正常</span>' : ''}</a>`).join('')}</div>`; return; }
  const d = await api('/safety?store=' + sid);
  $('#main').innerHTML = `<div class="pghd"><b>安全与应急 · ${esc(d.store)}</b></div><p class="muted small" style="margin-top:-6px">按周期自动到期提醒，记录需上传现场照片；逾期和发现问题会扣门店画像的安全合规分。</p>
  <div class="list">${d.plans.map(p => `<div class="task"><div class="b"><div class="ttl">${esc(p.kind)} <span class="muted small">每 ${p.cycle} 天</span></div><div class="muted small">${esc(p.title)} · 上次 ${esc(p.last_date || '-')}${p.last ? (p.last.result === 'bad' ? ' · 有问题' : ' · 合格') : ''} · 下次 ${esc(p.next_date)}</div></div>
    <div class="row" style="gap:6px;flex:none">${p.late ? '<span class="tag bad">逾期</span>' : p.soon ? '<span class="tag warn">将到期</span>' : ''}<button class="btn sm ${p.late ? 'primary' : ''}" data-sf="${p.id}">记录</button></div></div>`).join('')}</div>
  <div class="sec-t2">执行记录</div><div class="list">${d.logs.map(l => `<div class="task"><div class="t mono">${esc(l.date.slice(5))}</div><div class="b"><div class="ttl">${esc(l.kind)}</div><div class="muted small">${esc(l.by_name || '')}${l.note ? ' · ' + esc(l.note) : ''}</div></div>${l.photo ? `<img class="thumb" src="${l.photo}">` : ''}<span class="tag ${l.result === 'ok' ? 'ok' : 'bad'}">${l.result === 'ok' ? '合格' : '有问题'}</span></div>`).join('') || '<div class="empty">暂无</div>'}</div>`;
  document.querySelectorAll('[data-sf]').forEach(b => b.onclick = () => { const p = d.plans.find(x => x.id === Number(b.dataset.sf));
    formModal(p.kind, `<p class="muted small">${esc(p.title)}</p><label class="f"><span>结果</span><select name="result"><option value="ok">合格</option><option value="bad">发现问题</option></select></label><label class="f"><span>记录说明</span><textarea name="note" placeholder="参与人数、发现的问题等"></textarea></label><label class="f"><span>现场照片${p.kind === '食品留样' ? '（可选）' : '（必传）'}</span><input type="file" accept="image/*" capture="environment"></label>`,
      async x => act(async () => api('/safety/' + p.id, { ...x, photo: await filePhoto($('#mf')) }), '已记录')); });
};

// ---------- 排班与人效 ----------
VIEWS.labor = async () => {
  const sid = sidQ() || S.meta.stores[0]?.id, from = qs().get('from') || '', d = await api(`/labor?store=${sid}${from ? '&from=' + from : ''}`), S2 = d.std;
  $('#main').innerHTML = `<div class="pghd"><b>排班与人效 · ${esc(d.store)}</b></div>
  ${d.region ? `<div class="tfil">${d.region.map(r => `<a class="${r.id === sid ? 'on' : ''}" href="#/labor?store=${r.id}">${esc(r.name.replace(/^.{2}/, ''))}<small>${r.cost_rate}%</small></a>`).join('')}</div>` : ''}
  <section class="yic"><div class="rkpi">${[['人房比', d.ratio, '', d.ratio > S2.ratio], ['人均间夜', d.rn_per, '/月'], ['人工成本率', d.cost_rate, '%', d.cost_rate > S2.cost_rate], ['加班合计', d.ot_total, '小时'], ['在岗人数', d.staff, '人'], ['房量', d.rooms, '间']].map(([l, v, u, bad]) => `<a class="${bad ? 'bad' : ''}"><b>${v}<small>${u}</small></b><span>${l}</span></a>`).join('')}</div>
  <p class="muted small">参考线：人房比 ≤ ${S2.ratio}，人工成本率 ≤ ${S2.cost_rate}%，个人月加班 ≤ ${S2.ot} 小时。人工成本按基本工资 × 1.35 估算，均为模拟数据。</p></section>
  <div class="sec-t2 row between"><span>本周排班 ${esc(d.sched.days[0].slice(5))} 起</span><span><a href="#/labor?store=${sid}&from=${addD(d.from, -7)}">上周</a> · <a href="#/labor?store=${sid}&from=${addD(d.from, 7)}">下周</a></span></div>
  <div class="tbl sched"><table><tr><th>姓名</th>${d.sched.days.map(x => `<th>${'一二三四五六日'[(new Date(x).getDay() + 6) % 7]}<br><small>${x.slice(8)}</small></th>`).join('')}</tr>
  ${d.sched.rows.map(r => `<tr><td>${esc(r.name)}<br><small class="muted">${esc(r.role_name)}</small></td>${r.cells.map((c, i) => `<td><button class="shc s${'早中夜休'.indexOf(c)}" ${d.can_edit ? `data-sh="${r.id}:${d.sched.days[i]}:${c}"` : 'disabled'}>${c}</button></td>`).join('')}</tr>`).join('')}</table></div>
  <div class="sec-t2">客房计件与人效</div><div class="list">${d.hk.map((h, i) => `<div class="task"><span class="rk">${i + 1}</span><div class="b"><div class="ttl">${esc(h.name)}</div><div class="muted small">本月 ${h.rooms} 间 · 工时 ${h.hours} 小时${h.amount != null ? ` · 提成 ¥${h.amount}` : ''}</div></div><b>${h.per_h}<small class="muted"> 间/时</small></b></div>`).join('')}</div>
  <div class="sec-t2">加班排行</div><div class="list">${d.ot.slice(0, 5).map(o => `<div class="task"><div class="b"><div class="ttl">${esc(o.name)} <span class="muted small">${esc(o.role_name)}</span></div></div><span class="tag ${o.ot > S2.ot ? 'bad' : ''}">${o.ot} 小时</span></div>`).join('')}</div>`;
  document.querySelectorAll('[data-sh]').forEach(b => b.onclick = () => { const [uid, date, c] = b.dataset.sh.split(':'), nx = '早中夜休'['早中夜休'.indexOf(c) + 1] || '早';
    act(async () => { await api('/labor/shift', { uid: Number(uid), date, shift: nx }); b.textContent = nx; b.className = 'shc s' + '早中夜休'.indexOf(nx); b.dataset.sh = `${uid}:${date}:${nx}`; }); });
};
const addD = (d, n) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

// ---------- 供应商评价 ----------
VIEWS.suppliers = async () => {
  const d = await api('/suppliers'), LVC = { 优选: 'ok', 合格: 'acc', 待改进: 'bad' };
  $('#main').innerHTML = `<div class="pghd"><b>供应商评价</b></div><p class="muted small" style="margin-top:-6px">门店收货时为统购供应商打分：到货及时 40%、质量 40%、价格 20%。85 分以上为优选，70 分以下待改进。</p>
  ${d.list.map(s => `<div class="ldr"><div class="row between"><b>${esc(s.name)} <span class="muted small">${esc(s.cats)}</span></b><span class="row" style="gap:6px"><b>${s.score ?? '-'}</b><span class="tag ${LVC[s.level] || ''}">${s.level}</span></span></div>
    <div class="muted small">到货及时 ${s.on_time ?? '-'} · 质量 ${s.quality ?? '-'} · 价格 ${s.price ?? '-'}（5 分制）· ${s.n} 次评价${s.issues ? ` · <b style="color:var(--bad)">问题 ${s.issues} 次</b>` : ''}</div>
    ${s.recent.filter(r => r.note).slice(0, 2).map(r => `<div class="iss-i"><span class="tag">${esc(r.store || '')}</span><span class="small">${esc(r.note)}</span></div>`).join('')}</div>`).join('')}`;
};

// ---------- 第三批：店长驾驶舱 / 教练 / 能力诊断 / 90 天上手 / 工作日历 / 敬业度 / 总部 ----------
const LVT = { bad: '红', warn: '黄', ok: '绿' };
const pbar = (v, c) => `<div class="pbar"><i style="width:${Math.max(0, Math.min(100, v))}%${c ? ';background:' + c : ''}"></i></div>`;
async function loadCockpit(sid) {
  const d = await api('/cockpit?store=' + sid); if ($('#ck')) return;
  const h = `<div id="ck">${d.multi ? `<div class="sec-t2">多店并排 · 只看异常</div><div class="yig">${d.multi.map(s => `<a class="yit" href="#/home?store=${s.id}"><b><span class="tag ${s.lv}">${LVT[s.lv]}</span> ${esc(s.name)}</b><span>画像 ${s.grade} · ${s.total} 分${s.assistant ? ' · 店助 ' + esc(s.assistant) : ''}</span><span>${s.why.length ? esc(s.why.join('、')) : '无异常'}</span></a>`).join('')}</div>` : ''}
  <section class="yic"><div class="row between"><b>今日三件事</b><span class="muted small">按影响大小排序</span></div>
  ${d.items.map((x, i) => `<a class="ck-i" href="${x.link || '#/home'}"><span class="rk">${i + 1}</span><div class="b"><div class="ttl"><span class="tag ${x.lv}">${esc(x.tag)}</span> ${esc(x.title)}</div><div class="muted small">建议：${esc(x.how)}${x.sub ? ' · ' + esc(x.sub) : ''}</div></div><span class="btn sm">去处理</span></a>`).join('') || '<div class="empty">今天没有紧急事项</div>'}
  ${d.onboard != null ? `<a class="ck-i" href="#/onboard"><div class="b"><div class="ttl">90 天上手 · 已验收 ${d.onboard}%</div>${pbar(d.onboard)}</div></a>` : ''}</section></div>`;
  const bar = $('#main .storebar') || $('#main .pghd'); bar ? bar.insertAdjacentHTML('afterend', h) : $('#main').insertAdjacentHTML('afterbegin', h);
}
VIEWS.coach = async () => {
  const d = await api('/coach');
  $('#main').innerHTML = `<div class="pghd"><b>本周辅导清单</b></div>
  <p class="muted small" style="margin-top:-6px">系统自动推进：${d.auto.join('、')}。教练只处理例外事项和辅导店长。</p>
  ${d.sms.map(m => `<div class="ldr"><div class="row between"><b>${esc(m.name)}</b><span class="row" style="gap:4px">${m.cert ? '' : '<span class="tag bad">未认证</span>'}${m.onboard ? `<span class="tag acc">上手第 ${m.onboard.day} 天</span>` : ''}</span></div>
    <div class="stags" style="margin:6px 0">${m.stores.map(s => `<span class="tag ${s.lv}">${esc(s.name)} ${s.grade}</span>`).join('')}${m.diag ? m.diag.weak.map(w => `<span class="tag">${w.l} ${w.v}</span>`).join('') : ''}</div>
    <ul class="todo">${m.todo.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    <div class="muted small">${m.last ? `上次辅导 ${esc(m.last.date)}：${esc(m.last.topic)}${m.last.next ? ' · 下一步 ' + esc(m.last.next) : ''}` : '本月未辅导'}</div>
    <div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap"><a class="btn sm" href="#/diag?uid=${m.id}">能力诊断</a>${m.onboard ? `<a class="btn sm" href="#/onboard?uid=${m.id}">90 天上手${m.onboard.wait ? ` · ${m.onboard.wait} 待验收` : ''}</a>` : ''}<button class="btn primary sm" data-cl="${m.id}">记录辅导</button></div></div>`).join('')}
  <div class="sec-t2">例外事项 · 需要人介入</div><div class="list">${d.exc.map(x => `<a class="task" href="${x.link}"><div class="b"><div class="ttl"><span class="tag ${x.lv}">${esc(x.tag)}</span> ${esc(x.title)}</div>${x.sub ? `<div class="muted small">${esc(x.sub)}</div>` : ''}</div></a>`).join('') || '<div class="empty">暂无</div>'}</div>
  <div class="sec-t2">我的辅导记录</div><div class="list">${d.logs.map(l => `<div class="task"><div class="t mono">${esc(l.date.slice(5))}</div><div class="b"><div class="ttl">${esc(l.sm_name)} · ${esc(l.topic)}</div><div class="muted small">${esc(l.note || '')}${l.next ? ' · 下一步 ' + esc(l.next) : ''}</div></div></div>`).join('') || '<div class="empty">暂无</div>'}</div>`;
  document.querySelectorAll('[data-cl]').forEach(b => b.onclick = () => { const m = d.sms.find(x => x.id === Number(b.dataset.cl));
    formModal('记录辅导 · ' + m.name, `<label class="f"><span>辅导主题</span><input name="topic" required value="${esc(m.diag?.weak[0] ? m.diag.weak[0].l + '能力提升' : '')}"></label><label class="f"><span>辅导内容</span><textarea name="note"></textarea></label><label class="f"><span>下一步（店长要做的）</span><input name="next"></label>`, x => act(() => api('/coach/log', { ...x, sm_id: m.id }), '已记录，已通知店长')); });
};
VIEWS.diag = async () => {
  const uid = Number(qs().get('uid')) || S.me.id, d = await api('/diag/' + uid);
  $('#main').innerHTML = `<div class="pghd"><b>店长能力诊断 · ${esc(d.user.name)}</b></div>
  <section class="yic"><div class="row between"><b>综合 ${d.total} 分</b><span class="muted small">由门店画像、统购和人效数据自动计算；前两月为模拟值</span></div>
  ${d.caps.map(c => { const df = c.v - c.trend[1], w = d.weak.includes(c.k); return `<div class="cap"><div class="row between"><span>${c.l}${w ? ' <span class="tag bad">短板</span>' : ''}</span><span><b>${c.v}</b> <small class="${df >= 0 ? 'up' : 'dn'}">${df >= 0 ? '↑' : '↓'}${Math.abs(df)}</small></span></div>${pbar(c.v, c.v < 70 ? 'var(--bad)' : c.v < 80 ? '#e6a23c' : '')}</div>`; }).join('')}</section>
  <div class="sec-t2">提升建议</div>${d.caps.filter(c => d.weak.includes(c.k)).map(c => `<div class="ldr"><b>${c.l}（${c.v} 分）</b>
    <div class="small" style="margin-top:4px">推荐课程：${esc(c.course)}</div>${c.bench ? `<div class="small">标杆做法：参考 ${esc(c.bench.name)}（${c.bench.v} 分）</div>` : ''}<div class="small">教练辅导：${esc(c.act)}</div>
    <div class="row" style="gap:6px;margin-top:8px"><a class="btn sm" href="#/train">查看培训班</a></div></div>`).join('')}`;
};
VIEWS.onboard = async () => {
  const uid = Number(qs().get('uid')) || S.me.id, d = await api('/onboard/' + uid);
  if (d.none) { $('#main').innerHTML = `<div class="pghd"><b>90 天上手 · ${esc(d.user.name)}</b></div><div class="empty">当前没有 90 天上手计划，新店长接店时由区域或教练开启。</div>`; return; }
  const ST = s => s.ok_at ? ['ok', '已验收'] : s.done_at ? ['acc', '待验收'] : s.late ? ['bad', '逾期'] : ['', '未完成'];
  $('#main').innerHTML = `<div class="pghd"><b>90 天上手 · ${esc(d.user.name)}</b></div>
  <section class="yic"><div class="row between"><b>第 ${Math.min(d.day, 90)} / 90 天</b><span class="muted small">教练 ${esc(d.coach || '-')} · ${esc(d.start)} 起</span></div>${pbar(d.pct)}<p class="muted small">已验收 ${d.pct}%。每项由店长完成，教练验收；最后一项与店长班认证打通。</p></section>
  ${[...new Set(d.steps.map(s => s.phase))].map(ph => `<div class="sec-t2">${ph}</div><div class="list">${d.steps.filter(s => s.phase === ph).map(s => { const [c, l] = ST(s); return `<div class="task"><div class="b"><div class="ttl">${esc(s.title)}</div><div class="muted small">${s.done_at ? '完成 ' + esc(s.done_at) : '截止 ' + esc(s.due)}${s.ok_name ? ' · ' + esc(s.ok_name) + ' 验收' : ''}${s.note ? ' · ' + esc(s.note) : ''}</div></div>
    <div class="row" style="gap:6px;flex:none"><span class="tag ${c}">${l}</span>${d.me && !s.done_at && s.k !== 'm3' ? `<button class="btn primary sm" data-ob="done:${s.k}">完成</button>` : ''}${d.can_ok && s.done_at && !s.ok_at ? `<button class="btn primary sm" data-ob="ok:${s.k}">验收</button>` : ''}${d.me && !s.done_at ? `<a class="btn sm" href="${s.link}">去做</a>` : ''}</div></div>`; }).join('')}</div>`).join('')}`;
  document.querySelectorAll('[data-ob]').forEach(b => b.onclick = () => { const [op, k] = b.dataset.ob.split(':');
    op === 'ok' ? act(async () => { await api(`/onboard/${uid}/${k}`, { op }); route(); }, '已验收') : formModal('完成', '<label class="f"><span>完成情况</span><textarea name="note"></textarea></label>', x => act(() => api(`/onboard/${uid}/${k}`, { op, note: x.note }), '已提交，等待教练验收')); });
};
const WK = '日一二三四五六', KC = { 巡店: 'acc', 神秘访客: 'bad', 开班: 'ok', 项目节点: 'warn', 安全: 'warn', 上手验收: 'acc', 辅导: 'ok' };
VIEWS.wcal = async () => {
  const d = await api('/wcal' + (qs().get('from') ? '?from=' + qs().get('from') : '')), days = [...Array(14)].map((_, i) => addD(d.from, i));
  $('#main').innerHTML = `<div class="pghd row between"><b>工作日历</b><button class="btn primary sm" id="nce">新增事项</button></div>
  <div class="row between small" style="margin:-4px 0 8px"><a href="#/wcal?from=${addD(d.from, -7)}">上周</a><span class="muted">${d.from.slice(5)} 至 ${d.to.slice(5)} · 巡店、神秘访客、开班、项目节点、安全、上手验收、辅导汇总</span><a href="#/wcal?from=${addD(d.from, 7)}">下周</a></div>
  ${days.map(x => { const it = d.items.filter(i => i.date === x); return `<div class="cal-d ${x === S.me.today ? 'on' : ''}"><div class="cal-h"><b>${x.slice(5)}</b> 周${WK[new Date(x + 'T00:00:00').getDay()]}</div>${it.map(i => `<a class="cal-i" ${i.link ? `href="${i.link}"` : ''}><span class="tag ${KC[i.kind] || ''}">${esc(i.kind)}</span> ${esc(i.title)}</a>`).join('') || '<span class="muted small">—</span>'}</div>`; }).join('')}`;
  $('#nce').onclick = () => formModal('新增事项', `<label class="f"><span>日期</span><input type="date" name="date" required value="${S.me.today}"></label><label class="f"><span>类型</span><select name="kind">${d.kinds.map(k => `<option>${k}</option>`).join('')}</select></label><label class="f"><span>门店（可选）</span><select name="store_id"><option value="">不指定</option>${storeOptions()}</select></label><label class="f"><span>事项</span><input name="title" required></label>`, x => act(() => api('/wcal', x), '已加入日历'));
};
VIEWS.engage = async () => {
  const sid = Number(qs().get('store')) || 0, d = await api('/engage' + (sid ? '?store=' + sid : ''));
  const C = d.cur, P = d.prev;
  $('#main').innerHTML = `<div class="pghd"><b>敬业度与留任 · ${esc(d.store)}</b></div>
  ${d.region ? `<div class="tfil">${d.region.map(r => `<a class="${r.name === d.store ? 'on' : ''}" href="#/engage?store=${r.id}">${esc(r.name.replace(/^.{2}/, ''))}<small>${r.total ?? '-'}${r.risk ? ' · 高危 ' + r.risk : ''}</small></a>`).join('')}</div>` : ''}
  ${d.can_fill && !d.done ? `<form class="yic" id="egf"><b>${d.q} 匿名调研</b><p class="muted small">5 题，1 分非常不同意，5 分非常同意。只统计门店汇总，不记录个人答案。</p>${d.questions.map((x, i) => `<label class="f"><span>${i + 1}. ${esc(x)}</span><select name="a${i}">${[5, 4, 3, 2, 1].map(n => `<option value="${n}">${n}</option>`).join('')}</select></label>`).join('')}<label class="f"><span>想说的话（可选）</span><input name="comment"></label><button class="btn primary">提交</button></form>` : d.can_fill ? '<p class="muted small">本季度调研已提交，谢谢。</p>' : ''}
  ${C ? `<section class="yic"><div class="rkpi">${[['参与', C.n ? Math.min(100, Math.round(C.n * 100 / d.staff)) : 0, '%'], ['敬业度', C.total ?? '-', '/5'], ['推荐值', C.enps ?? '-', '']].map(([l, v, u]) => `<a><b>${v}<small>${u}</small></b><span>${l}</span></a>`).join('')}</div>
    ${C.n ? d.questions.map((x, i) => { const df = P && P.n ? Math.round((C.avg[i] - P.avg[i]) * 10) / 10 : null; return `<div class="cap"><div class="row between"><span class="small">${esc(x)}</span><span><b>${C.avg[i]}</b>${df != null ? ` <small class="${df >= 0 ? 'up' : 'dn'}">${df >= 0 ? '↑' : '↓'}${Math.abs(df)}</small>` : ''}</span></div>${pbar(C.avg[i] * 20, C.avg[i] < 3.6 ? 'var(--bad)' : '')}</div>`; }).join('') : '<p class="muted small">本季度还没有回答</p>'}
    ${C.comments?.length ? `<div class="muted small" style="margin-top:6px">员工留言：${C.comments.map(esc).join('；')}</div>` : ''}<p class="muted small">箭头对比上季度。推荐值 = 愿意推荐（5 分）占比 − 不愿推荐（≤3 分）占比。</p></section>` : ''}
  ${d.risk ? `<div class="sec-t2">离职预警</div><p class="muted small" style="margin-top:-4px">结合执行分、完成率下滑、请假、加班、申诉和门店敬业度推算，建议店长 1 对 1 谈话。</p><div class="list">${d.risk.map(r => `<div class="task"><div class="b"><div class="ttl">${esc(r.name)} <span class="muted small">${esc(r.role_name)}</span></div><div class="muted small">${esc(r.why.join('、'))}</div>${r.talk ? `<div class="muted small">已谈话 ${esc(r.talk.date)}：${esc(r.talk.note)}</div>` : ''}</div>
    <div class="row" style="gap:6px;flex:none"><span class="tag ${r.level === '高' ? 'bad' : 'warn'}">${r.level}风险</span>${r.talk ? '' : `<button class="btn sm" data-tk="${r.id}">记录谈话</button>`}</div></div>`).join('') || '<div class="empty">暂无预警</div>'}</div>` : ''}`;
  if ($('#egf')) $('#egf').onsubmit = e => { e.preventDefault(); const f = formData(e.target); act(async () => { await api('/engage', { answers: [0, 1, 2, 3, 4].map(i => Number(f['a' + i])), comment: f.comment }); route(); }, '已匿名提交'); };
  document.querySelectorAll('[data-tk]').forEach(b => b.onclick = () => formModal('留任谈话', '<label class="f"><span>谈话记录</span><textarea name="note" required placeholder="员工的顾虑、约定的改进"></textarea></label>', x => act(() => api('/engage/talk', { uid: Number(b.dataset.tk), note: x.note }), '已记录')));
};
VIEWS.hq = async () => {
  const d = await api('/hq');
  $('#main').innerHTML = `<div class="pghd row between"><b>总部视角</b>${d.can_post ? '<button class="btn primary sm" id="nhq">下发政策</button>' : ''}</div>
  <p class="muted small" style="margin-top:-6px">华南一区、华北一区为模拟区域，用于演示跨区域对比。</p>
  ${d.regions.map(r => `<div class="ldr"><div class="row between"><b>${r.rank}. ${esc(r.name)}${r.sim ? ' <span class="tag">模拟</span>' : ''}</b><b>${r.avg ?? '-'}<small class="muted"> 分</small></b></div>
    <div class="muted small">${r.stores} 家店 · 统购率 ${r.proc ?? '-'}% · 近 30 天客诉 ${r.cp30} 起 · 店长 ${r.sm} 人 · ${r.coach ? `教练 ${r.coach} 人，人均带 ${r.ratio} 家店` : '未配教练'}</div>
    <div class="stags" style="margin-top:6px">${d.grades.map((g, i) => r.grades[i] ? `<span class="tag">${g} 级 ${r.grades[i]}</span>` : '').join('')}</div></div>`).join('')}
  <div class="sec-t2">跨区域储备店长（可晋升）</div><div class="list">${d.pool.map(p => `<div class="task"><div class="b"><div class="ttl">${esc(p.name)} <span class="muted small">${esc(p.role_name)}</span></div><div class="muted small">${esc(p.region || '')} · ${esc(p.store)}</div></div><span class="tag ${p.cert ? 'ok' : ''}">${p.cert ? '已认证' : '待店长班'}</span></div>`).join('') || '<div class="empty">暂无</div>'}</div>
  <div class="sec-t2">总部下发</div><div class="list">${d.notices.map(n => `<div class="task"><div class="b"><div class="ttl"><span class="tag acc">${esc(n.kind)}</span> ${esc(n.title)}</div><div class="muted small">${esc(n.body || '')} · ${esc(n.at.slice(0, 10))}</div></div></div>`).join('') || '<div class="empty">暂无</div>'}</div>`;
  if ($('#nhq')) $('#nhq').onclick = () => formModal('下发政策 / 标准', '<label class="f"><span>类型</span><select name="kind"><option>政策</option><option>标准</option><option>通知</option></select></label><label class="f"><span>标题</span><input name="title" required></label><label class="f"><span>内容</span><textarea name="body"></textarea></label>', x => act(() => api('/hq/notice', x), '已下发到各区域和门店'));
};

// ---------- 人事指标 ----------
const kp = (l, v, u, bad) => `<a class="${bad ? 'bad' : ''}"><b>${v ?? '-'}<small>${u}</small></b><span>${l}</span></a>`;
const hbar = (rows, tot) => rows.map(x => `<div class="cap"><div class="row between small"><span>${esc(x.l)}</span><span>${x.n}</span></div>${pbar(tot ? x.n * 100 / tot : 0)}</div>`).join('');
const hkpis = (A, th) => [kp('编制', A.P, '人'), kp('在岗', A.act, '人'), kp('满编率', A.fill, '%', A.fill < th.fill), kp('缺编', A.gaps, '人', A.gaps > 0), kp('月离职率', A.m_rate, '%', A.m_rate > th.month), kp('年化离职率', A.y_rate, '%'),
  kp('90 天流失', A.early_rate, '%', A.early_rate > th.early), kp('主动离职', A.vol_rate, '%'), kp('关键岗离职', A.key_rate, '%')].join('');
async function hrmCard(sid) {
  const d = await api('/hrm' + (sid ? '?store=' + sid : '')), A = d.sel || d.sum; if ($('#hrmc')) return;
  const h = `<a class="yic" id="hrmc" href="#/hrm${d.sel ? '?store=' + d.sel.id : ''}" style="display:block;color:inherit;text-decoration:none"><div class="row between"><b>人事指标</b><span class="muted small">编制 · 离职 · 招聘 · 合规 ›</span></div>
    <div class="rkpi">${[['满编率', A.fill, '%', A.fill < d.th.fill], ['缺编', A.gaps, '人', A.gaps > 0], ['月离职率', A.m_rate, '%', A.m_rate > d.th.month]].map(([l, v, u, b]) => `<div class="k ${b ? 'bad' : ''}"><b>${v}<small>${u}</small></b><span>${l}</span></div>`).join('')}</div>
    ${A.alerts.length ? `<div class="small" style="color:var(--bad)">${A.alerts.length} 项预警：${esc([...new Set(A.alerts.map(a => a.type))].join('、'))}</div>` : '<div class="muted small">暂无人事预警</div>'}</a>`;
  const t = $('#main .pltabs') || $('#main .storebar'); t ? t.insertAdjacentHTML('afterend', h) : $('#main').insertAdjacentHTML('afterbegin', h);
}
VIEWS.hrm = async () => {
  const sid = Number(qs().get('store')) || 0, d = await api('/hrm' + (sid ? '?store=' + sid : '')), s = d.sel, A = s || d.sum, th = d.th;
  const st = A.structure, tot = st.tenure.reduce((a, x) => a + x.n, 0), rsn = A.reasons.reduce((a, x) => a + x.n, 0);
  $('#main').innerHTML = `<div class="pghd row between"><b>人事指标 · ${esc(s ? s.name : S.me.region_name || '全部门店')}</b>${d.can_rec ? '<button class="btn primary sm" id="nrc">发起招聘</button>' : ''}</div>
  <p class="muted small" style="margin-top:-6px">近 12 个月口径。历史离职、招聘和兼职人数为模拟数据；现在办理的离职交接会实时计入。</p>
  ${d.stores.length > 1 ? `<div class="tfil"><a class="${s ? '' : 'on'}" href="#/hrm">全部</a>${d.stores.map(x => `<a class="${s && s.id === x.id ? 'on' : ''}" href="#/hrm?store=${x.id}">${esc(x.name.replace(/^.{2}/, ''))}</a>`).join('')}</div>` : ''}
  <section class="yic"><div class="rkpi">${hkpis(A, th)}</div><p class="muted small">月离职率 = 近 30 天离职 ÷ 在岗；90 天流失 = 入职 90 天内离职 ÷ 近 12 个月入职；关键岗位为店长、店助、前台经理、客房经理。</p></section>
  ${A.alerts.length ? `<div class="sec-t2">人事预警</div><div class="list">${A.alerts.map(a => `<a class="task" href="#/hrm?store=${a.sid || s?.id || ''}"><div class="b"><div class="ttl"><span class="tag ${a.lv}">${esc(a.type)}</span> ${a.store ? esc(a.store) + '：' : ''}${esc(a.text)}</div></div></a>`).join('')}</div>` : ''}
  ${s ? `<div class="sec-t2">编制明细 · ${s.rooms} 间房</div><div class="list">${s.plan.map(p => `<div class="task"><div class="b"><div class="ttl">${esc(p.pos)}${p.key ? ' <span class="tag acc">关键</span>' : ''}${p.shared ? ' <span class="tag">兼管</span>' : ''}</div><div class="muted small">编制 ${p.plan}${p.plan !== p.std ? `（标准 ${p.std}）` : ''} · 在岗 ${p.act}${p.gap && p.key ? ` · 已空缺 ${p.vac_days} 天` : ''}</div></div>
    <div class="row" style="gap:6px;flex:none">${p.gap ? `<span class="tag ${p.key ? 'bad' : 'warn'}">缺 ${p.gap}</span>` : p.act > p.plan ? '<span class="tag">超编</span>' : '<span class="tag ok">满编</span>'}${d.can_plan ? `<button class="btn sm" data-hp="${p.pos}" data-n="${p.plan}">调整</button>` : ''}</div></div>`).join('')}</div>
    <p class="muted small">标准编制按房量自动计算，人事经理可以按店调整。</p>` : `<div class="sec-t2">人事与经营对照</div><div class="list">${d.link.map(x => `<a class="task" href="#/hrm?store=${x.id}"><div class="b"><div class="ttl">${esc(x.name)} <span class="tag ${x.grade <= 'B' ? 'ok' : 'warn'}">画像 ${x.grade} · ${x.total}</span></div><div class="muted small">满编 ${x.fill}% · 年化离职 ${x.y_rate}% · 90 天流失 ${x.early_rate}% · 团队人才 ${x.team} · 近 30 天客诉 ${x.cp30}</div></div><span class="tag ${x.tstab >= 80 ? 'ok' : x.tstab >= 60 ? 'warn' : 'bad'}">人事稳定 ${x.stab} · 团队稳定 ${x.tstab}</span></a>`).join('')}</div>
    <p class="muted small">团队稳定 = 人事稳定 × 60% + 员工美好分 × 40%，占店长季度考核的 15%，也用于店长能力诊断的「团队」项。</p>`}
  <div class="sec-t2">招聘进度</div><div class="list">${A.recruit.map(r => `<div class="task"><div class="b"><div class="ttl">${r.store ? esc(r.store) + ' · ' : ''}${esc(r.pos)} ${r.n} 人</div><div class="muted small">${esc(r.channel)} · ${esc(r.opened)} 发起${r.cand ? ' · 候选人 ' + esc(r.cand) : ''}</div></div>
    <div class="row" style="gap:6px;flex:none"><span class="tag acc">${esc(r.stage)}</span>${d.can_rec ? `<button class="btn sm" data-rc="${r.id}" data-st="${r.stage}">推进</button>` : ''}</div></div>`).join('') || '<div class="empty">没有在招岗位</div>'}</div>
  <p class="muted small">近 12 个月到岗 ${A.filled ?? A.channels?.reduce((a, c) => a + c.n, 0) ?? 0} 人，平均到岗 ${A.fill_days ?? '-'} 天。</p>
  ${A.channels ? `<div class="ldr">${A.channels.map(c => `<div class="row between small" style="padding:3px 0"><span>${c.l}</span><span>到岗 ${c.n} 人 · 平均 ${c.days ?? '-'} 天 · 90 天留存 ${c.keep}%</span></div>`).join('')}<div class="muted small">90 天留存为模拟数据</div></div>` : ''}
  <div class="sec-t2">离职分析</div><section class="yic">${hbar(A.reasons, rsn) || '<span class="muted small">近 12 个月无离职</span>'}
    <p class="small" style="margin-top:8px">离职成本：近 12 个月 <b>${A.cost.toLocaleString()}</b> 元，平均每人 ${A.cost_per ? A.cost_per.toLocaleString() : '-'} 元。</p><p class="muted small">估算 = 招聘 ${d.cost_def.recruit} 元 + 入职培训 ${d.cost_def.train} 元 + 空岗期间按日薪 50% 计损失 + 新人爬坡期按月薪 30% 计损失。</p></section>
  <div class="list">${d.moves.map(m => `<div class="task"><div class="b"><div class="ttl">${esc(m.name)} <span class="muted small">${esc(m.role)}${s ? '' : ' · ' + esc(m.store)}</span></div><div class="muted small">${esc(m.date)} 离职 · ${esc(m.reason || '-')} · ${m.voluntary ? '主动' : '被动'}${m.hire && (Date.parse(m.date) - Date.parse(m.hire)) / 864e5 <= 90 ? ' · 入职 90 天内' : ''}</div>${m.note ? `<div class="muted small">面谈：${esc(m.note)}</div>` : ''}</div>${d.can_rec && !m.note ? `<button class="btn sm" data-ex="${m.id}">离职面谈</button>` : ''}</div>`).join('')}</div>
  <div class="sec-t2">内部流动</div><div class="ldr small">${s ? `晋升 ${s.flow.promote} 人 · 调出 ${s.flow.tout} 人 · 调入 ${s.flow.tin} 人` : `晋升 ${A.flow.promote} 人（晋升率 ${A.flow.promote_rate}%） · 跨店调动 ${A.flow.tout} 人<br>近 12 个月任命店长 ${A.flow.sm_appoint} 人，其中内部培养 ${A.flow.sm_internal} 人（储备店长到岗率 ${A.flow.sm_internal_rate ?? '-'}%）`}</div>
  <div class="sec-t2">人员结构</div><section class="yic"><b class="small">工龄</b>${hbar(st.tenure, tot)}<b class="small">年龄</b>${hbar(st.age, tot)}<b class="small">学历</b>${hbar(st.edu, tot)}<p class="muted small">另有兼职 ${st.pt} 人（模拟），外包 ${st.out} 人（PA、保安）。</p></section>
  <div class="sec-t2">用工合规</div><div class="list">${A.comp.map(c => `<a class="task" href="#/hrp/${c.uid}"><div class="b"><div class="ttl"><span class="tag ${c.lv}">${esc(c.type)}</span> ${esc(c.who)}${c.store ? ' <span class="muted small">' + esc(c.store) + '</span>' : ''}</div><div class="muted small">${esc(c.text)}</div></div></a>`).join('') || '<div class="empty">暂无合规风险</div>'}</div>`;
  const sOpt = s ? `<input type="hidden" name="store_id" value="${s.id}">` : `<label class="f"><span>门店</span><select name="store_id">${d.stores.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label>`;
  if ($('#nrc')) $('#nrc').onclick = () => formModal('发起招聘', `${sOpt}<label class="f"><span>岗位</span><select name="pos">${d.pos.map(p => `<option>${p}</option>`).join('')}</select></label><label class="f"><span>人数</span><input type="number" name="n" value="1" min="1"></label><label class="f"><span>渠道</span><select name="channel">${d.channels.map(c => `<option>${c}</option>`).join('')}</select></label>`, x => act(() => api('/hrm/recruit', { ...x, store_id: Number(x.store_id) }), '已发起'));
  document.querySelectorAll('[data-hp]').forEach(b => b.onclick = () => formModal('调整编制 · ' + b.dataset.hp, `<label class="f"><span>编制人数</span><input type="number" name="n" min="0" value="${b.dataset.n}"></label>`, x => act(() => api('/hrm/plan', { store_id: s.id, pos: b.dataset.hp, n: Number(x.n) }), '已调整')));
  const NX = { 待招: '面试', 面试: '待入职', 待入职: '已到岗' };
  document.querySelectorAll('[data-rc]').forEach(b => b.onclick = () => formModal('推进招聘', `<label class="f"><span>下一步</span><select name="stage"><option>${NX[b.dataset.st]}</option><option>已取消</option></select></label><label class="f"><span>候选人（可选）</span><input name="cand"></label>`, x => act(() => api('/hrm/recruit/' + b.dataset.rc, x), '已更新')));
  document.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => formModal('离职面谈', `<label class="f"><span>离职原因</span><select name="reason">${d.exit_reasons.map(r => `<option>${r}</option>`).join('')}</select></label><label class="f"><span>类型</span><select name="voluntary"><option value="1">主动离职</option><option value="0">被动离职</option></select></label><label class="f"><span>面谈记录</span><textarea name="note" required></textarea></label>`, x => act(() => api('/hrm/exit/' + b.dataset.ex, { ...x, voluntary: Number(x.voluntary) }), '已记录')));
};

// ---------- 员工美好 ----------
const grp = (title, badge, body, open) => `<details class="pg"${open ? ' open' : ''}><summary><b>${title}</b><span class="sp"></span>${badge || ''}<span class="muted">›</span></summary>${body}</details>`;
const stars = v => (v == null ? '-' : v + ' 分');
async function careCard(sid) {
  const d = await api('/care' + (sid ? '?store=' + sid : '')); if ($('#carec')) return;
  const s = d.sel, sc = s ? s.score : Math.round(d.list.reduce((a, x) => a + x.score, 0) / Math.max(1, d.list.length)), n = s ? s.alerts.length : d.list.reduce((a, x) => a + x.alerts, 0);
  const h = `<a class="yic" id="carec" href="#/care${s ? '?store=' + s.id : ''}" style="display:block;color:inherit;text-decoration:none"><div class="row between"><b>员工美好</b><span class="muted small">员工餐 · 活动 · 关怀 ›</span></div>
    <div class="rkpi"><div class="k ${sc < 70 ? 'bad' : ''}"><b>${sc}<small>分</small></b><span>员工美好分</span></div><div class="k"><b>${s ? stars(s.meal.rate.avg) : d.list.length + '<small>店</small>'}</b><span>${s ? '员工餐满意度' : '门店'}</span></div><div class="k ${n ? 'bad' : ''}"><b>${n}<small>项</small></b><span>待落实</span></div></div></a>`;
  const t = $('#hrmc') || $('#main .pltabs') || $('#main .storebar'); t ? t.insertAdjacentHTML('afterend', h) : $('#main').insertAdjacentHTML('afterbegin', h);
}
VIEWS.care = async () => {
  const sid = Number(qs().get('store')) || 0, d = await api('/care' + (sid ? '?store=' + sid : '')), s = d.sel, c = d.cfg;
  const tabs = d.stores.length > 1 ? `<div class="tfil"><a class="${s ? '' : 'on'}" href="#/care">全部</a>${d.stores.map(x => `<a class="${s && s.id === x.id ? 'on' : ''}" href="#/care?store=${x.id}">${esc(x.name.replace(/^.{2}/, ''))}</a>`).join('')}</div>` : '';
  let h = `<div class="pghd row between"><b>员工美好${s ? ' · ' + esc(s.name) : ''}</b>${d.is_hr ? '<button class="btn sm" id="ccfg">标准与预算</button>' : ''}</div>
  <p class="muted small" style="margin-top:-6px">餐标 ${c.meal_std} 元/人/天 · 活动预算 ${c.act_budget} 元/人/年 · 满意度低于 ${c.meal_th} 分提醒 · 意见 ${c.reply_h} 小时内回复。历史记录为模拟数据。</p>${tabs}`;
  if (!s) {
    h += `<div class="sec-t2">各店员工美好分</div><div class="list">${d.list.sort((a, b) => a.score - b.score).map(x => `<a class="task" href="#/care?store=${x.id}"><div class="b"><div class="ttl">${esc(x.name)}</div><div class="muted small">员工餐 ${stars(x.meal)} · 谈心覆盖 ${x.cover}% · 意见按时回复 ${x.inTime}% · 活动参与 ${x.join ?? '-'}% · 预算已用 ${Math.round(x.used * 100 / x.total)}%</div></div><div style="flex:none;text-align:right"><span class="tag ${x.score >= 80 ? 'ok' : x.score >= 70 ? 'warn' : 'bad'}">${x.score} 分</span>${x.alerts ? `<div class="muted small">${x.alerts} 项待落实</div>` : ''}</div></a>`).join('')}</div>
    <p class="muted small">员工美好分与人事指标合成「团队稳定」，占店长季度考核的 15%。</p>`;
    if (d.sms.length) h += grp('店长季度谈心', `<span class="tag ${d.sms.every(x => x.done) ? 'ok' : 'warn'}">${d.sms.filter(x => x.done).length}/${d.sms.length}</span>`, `<p class="muted small">区域经理和教练每季度和每位店长谈一次：店长本人的状态、工作负荷、带团队的难处。</p><div class="list">${d.sms.map(x => `<div class="task"><div class="b"><div class="ttl">${esc(x.name)} <span class="muted small">${esc(x.stores)}</span></div><div class="muted small">门店美好分 ${x.score} · 本月工作负荷 ${x.load}%（模拟）· ${x.last ? '上次谈心 ' + x.last : '本年未谈心'}</div>${x.note ? `<div class="muted small">${esc(x.note)}</div>` : ''}</div>${d.can_sm ? `<button class="btn sm" data-smt="${x.id}" data-n="${esc(x.name)}">${x.done ? '再记一次' : '记录谈心'}</button>` : `<span class="tag ${x.done ? 'ok' : 'warn'}">${x.done ? '本季已谈' : '未谈'}</span>`}</div>`).join('')}</div>`, !d.sms.every(x => x.done));
    if (d.pend.hard.length || d.pend.star.length) h += grp('待人事审批', `<span class="tag bad">${d.pend.hard.length + d.pend.star.length}</span>`, `<div class="list">${d.pend.hard.map(x => `<div class="task"><div class="b"><div class="ttl"><span class="tag bad">困难帮扶</span> ${esc(x.name)} <span class="muted small">${esc(x.store)}</span></div><div class="muted small">${esc(x.kind)} · 申请 ${x.amount} 元 · ${esc(x.reason)}</div></div>${d.is_hr ? `<button class="btn sm" data-hd="${x.id}">审批</button>` : ''}</div>`).join('')}${d.pend.star.map(x => `<div class="task"><div class="b"><div class="ttl"><span class="tag acc">月度之星</span> ${esc(x.name)} <span class="muted small">${esc(x.store)}</span></div><div class="muted small">${esc(x.reason)}</div></div>${d.is_hr ? `<button class="btn sm" data-st="${x.id}">审核</button>` : ''}</div>`).join('')}</div>`, true);
    if (d.corr) h += grp('离职关联分析', '<span class="tag">模拟</span>', `<p class="muted small">近 12 个月 ${d.corr.n} 名主动离职员工离职前的关怀情况，与在职员工对比，看哪些动作能留住人。</p>${d.corr.rows.map(r => `<div class="cap"><div class="small">${r.l}</div><div class="row between small"><span>离职员工 ${r.leave}%</span><span>在职员工 ${r.stay}%</span></div>${pbar(r.leave, '#e5484d')}${pbar(r.stay)}</div>`).join('')}`);
    $('#main').innerHTML = h; bindCare(d); return;
  }
  const A = s.alerts, can = d.can_do, sel = (nm, arr) => `<select name="${nm}">${arr.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>`;
  h += `<section class="yic"><div class="row between"><b>员工美好分 ${s.score}</b><span class="muted small">${s.n} 名员工</span></div>${s.parts.map(p => `<div class="cap"><div class="row between small"><span>${p.l} <span class="muted">· 权重 ${p.w}%</span></span><span>${p.v}</span></div>${pbar(p.v, p.v < 60 ? '#e5484d' : '')}</div>`).join('')}</section>`;
  if (A.length) h += `<div class="sec-t2">待落实 ${A.length} 项</div><div class="list">${A.map(a => `<div class="task"><div class="b"><div class="ttl"><span class="tag ${a.lv}">${esc(a.type)}</span> ${esc(a.text)}</div></div></div>`).join('')}</div>`;
  const m = s.meal;
  h += grp('员工餐', `<span class="tag ${m.rate.avg != null && m.rate.avg < m.th ? 'bad' : 'ok'}">${stars(m.rate.avg)}</span>`, `<div class="small">本周菜单 ${m.menu ? '' : '<span class="tag warn">未发布</span>'}${can ? ` <button class="btn sm" id="cmenu">${m.menu ? '修改' : '发布'}菜单</button>` : ''}</div>${m.menu ? `<pre class="small" style="white-space:pre-wrap;font-family:inherit;margin:6px 0">${esc(m.menu.body)}</pre>` : ''}
    <div class="muted small">近 4 周发布 ${m.pub} 次 · 本月 ${m.rNow.n} 人评价 ${stars(m.rNow.avg)} · 上月 ${stars(m.rLast.avg)}</div><div class="muted small">本月餐费 ${m.spend.toLocaleString()} 元 / 预算 ${m.budget.toLocaleString()} 元（${Math.round(m.spend * 100 / m.budget)}%，模拟）</div>
    ${m.rate.comments.length ? `<div class="small" style="margin-top:6px"><b>员工意见</b>${m.rate.comments.map(x => `<div class="muted">· ${esc(x)}</div>`).join('')}</div>` : ''}`, m.rate.avg != null && m.rate.avg < m.th);
  h += grp('员工活动', `<span class="muted small">预算已用 ${Math.round(s.budget.used * 100 / s.budget.total)}%</span>`, `<div class="small">本月生日 ${s.bdays.map(b => esc(b.name) + ' ' + b.day + ' 日').join('、') || '无'} ${s.bdays.length ? `<span class="tag ${s.bdDone ? 'ok' : 'warn'}">${s.bdDone ? '生日会已办' : '生日会未办'}</span>` : ''}</div>
    <div class="small">本季团建 <span class="tag ${s.teamDone ? 'ok' : 'warn'}">${s.teamDone ? '已办' : '未办'}</span> · 节日 ${s.hol.map(x => `${x.name} ${x.date}${x.done ? ' ✓' : ''}`).join('、') || '近期无'}</div>
    <div class="small">月度之星 ${s.starNow ? `${esc(s.starNow.name)} <span class="tag ${s.starNow.status === 'approved' ? 'ok' : 'acc'}">${s.starNow.status === 'approved' ? '已当选' : '待人事审核'}</span>` : '<span class="tag warn">本月未提名</span>'}${can && !s.starNow ? ' <button class="btn sm" id="cstar">提名</button>' : ''}</div>
    <p class="muted small">月度之星参考执行分和本月获得的认可，店长提名需写明理由，人事审核后公布。近 90 天活动参与率 ${s.join ?? '-'}%，没参加的员工会提醒补发礼品。</p>
    ${can ? '<button class="btn sm" id="cact">登记活动</button>' : ''}<div class="list" style="margin-top:6px">${s.acts.slice(0, 6).map(a => `<div class="task"><div class="b"><div class="ttl">${esc(a.title)}</div><div class="muted small">${esc(d.kinds[a.kind] || a.kind)} · ${a.date} · 参加 ${a.n_join}/${a.n_total} 人 · ${a.cost} 元</div></div></div>`).join('')}</div>`);
  const tl = s.talks.filter(x => !x.done), nw = s.newc.filter(x => !x.done), ng = s.night.filter(x => !x.done), fm = s.fam.filter(x => !x.done);
  h += grp('关怀维护', `<span class="tag ${tl.length + nw.length + ng.length + fm.length ? 'warn' : 'ok'}">谈心 ${s.cover}%</span>`, `${can ? '<button class="btn sm" id="clog">记录关怀</button>' : ''}
    <div class="small" style="margin-top:6px"><b>本季度一对一谈心</b> ${s.talks.length - tl.length}/${s.talks.length}，未谈：${tl.map(x => esc(x.name)).join('、') || '无'}</div>
    <div class="small"><b>新人 7/30/90 天关怀</b> ${s.newc.map(x => `${esc(x.name)} ${x.d} 天${x.done ? ' ✓' : x.late ? '（逾期）' : '（' + x.due + '）'}`).join('、') || '近期无新人'}</div>
    <div class="small"><b>夜班与高强度</b> ${s.night.map(x => `${esc(x.name)} 加班 ${x.ot} 小时${x.done ? ' ✓' : ''}`).join('、') || '无'}</div>
    <div class="small"><b>家属关怀</b> ${s.fam.map(x => `${esc(x.name)} ${x.ev}${x.done ? ' ✓' : ''}`).join('、') || '无'} <span class="muted">（模拟事件）</span></div>
    <div class="small"><b>宿舍与休息区</b> ${s.dormDone ? '<span class="tag ok">本月已检查</span>' : '<span class="tag warn">本月未检查</span>'}${can ? ' <button class="btn sm" id="cdorm">检查</button>' : ''} ${s.dorm.filter(x => !x.ok).slice(0, 1).map(x => `<span class="muted">上次问题：${esc(x.issues)}</span>`).join('')}</div>
    <p class="muted small">谈心和关怀记录只有店长、区域经理、教练和人事能看到。涉及骚扰、歧视、安全、欠薪或心理问题时勾选「转人事」，人事会收到提醒并跟进。</p>
    ${s.hard.length ? `<div class="small"><b>困难帮扶</b>${s.hard.map(x => `<div class="muted">· ${esc(x.name)} ${esc(x.kind)} ${x.amount} 元 <span class="tag ${x.status === 'approved' ? 'ok' : x.status === 'pending' ? 'acc' : ''}">${{ pending: '待人事审批', approved: '已通过', rejected: '未通过' }[x.status]}</span></div>`).join('')}</div>` : ''}${can ? ' <button class="btn sm" id="chard">代员工申请帮扶</button>' : ''}`, tl.length + nw.length > 0);
  h += grp('意见箱与员工声音', `<span class="tag ${s.sgOpen ? 'warn' : 'ok'}">${s.sgOpen} 条待回复</span>`, `<p class="muted small">意见匿名提交，店长看不到是谁提的。近 90 天 ${c.reply_h} 小时内回复率 ${s.inTime}%。</p><div class="list">${s.sg.map(x => `<div class="task"><div class="b"><div class="ttl"><span class="tag">${esc(x.cat)}</span> ${esc(x.body)}</div><div class="muted small">${x.at}${x.reply ? ' · 回复：' + esc(x.reply) : ''}</div></div>${!x.reply && can ? `<button class="btn sm" data-rp="${x.id}">回复</button>` : ''}</div>`).join('')}</div>
    <div class="small" style="margin-top:8px"><b>员工声音主题</b>（意见箱 + 敬业度调研留言 + 离职面谈，近 90 天）</div>${s.voice.map(v => `<div class="task"><div class="b"><div class="ttl">${esc(v.theme)} · ${v.n} 次</div><div class="muted small">${Object.entries(v.src).map(([k, n]) => k + ' ' + n).join(' · ')}${v.fix ? ' · 改进中：' + esc(v.fix.action) : ''}</div></div>${can ? (v.fix ? `<button class="btn sm" data-fd="${v.fix.id}">完成</button>` : `<button class="btn sm" data-fx="${esc(v.theme)}">改进</button>`) : ''}</div>`).join('') || '<div class="muted small">暂无</div>'}
    <p class="muted small">改进措施会通知全店员工，下季度敬业度调研看有没有改善。</p>`, s.sgOpen > 0);
  h += grp('认可墙', `<span class="muted small">${s.kudos.length} 条</span>`, `${can ? '<button class="btn sm" id="ckd">记一条认可</button>' : ''}<div class="list" style="margin-top:6px">${s.kudos.map(k => `<div class="task"><div class="b"><div class="ttl">${esc(k.to_name)} <span class="tag">${esc(k.from_kind)}${k.from_name && k.from_kind !== '宾客' ? ' · ' + esc(k.from_name) : ''}</span></div><div class="muted small">${esc(k.text)}</div></div></div>`).join('')}</div>`);
  h += grp('员工福利台账', `<span class="tag ${s.wfRate >= 90 ? 'ok' : 'warn'}">${s.wfRate}%</span>`, `<p class="muted small">${new Date().getFullYear()} 年度：${d.welf.join('、')}。点灰色项目登记已发放。</p>${s.welfare.map(w => `<div class="row small" style="gap:4px;flex-wrap:wrap;padding:4px 0;border-top:1px solid #f0f1f3"><b style="min-width:3.5em">${esc(w.name)}</b>${w.items.map(i => i.na ? `<span class="tag" style="opacity:.4">${i.i} 不适用</span>` : i.done ? `<span class="tag ok">${i.i}</span>` : `<button class="tag" ${can ? `data-wf="${w.id}" data-i="${i.i}"` : ''} style="border:0">${i.i}</button>`).join('')}</div>`).join('')}`);
  $('#main').innerHTML = h;
  const wk = '<input type="hidden" name="store_id" value="' + s.id + '">', staffSel = sel('user_id', s.talks);
  const on = (id, f) => { if ($('#' + id)) $('#' + id).onclick = f; };
  on('cmenu', () => formModal('本周员工餐菜单', `<label class="f"><span>菜单（每天一行）</span><textarea name="body" rows="6" required>${esc(m.menu?.body || '')}</textarea></label>`, x => act(() => api('/care/menu', { store_id: s.id, body: x.body }), '已发布，员工会收到通知')));
  on('cact', () => { modal('登记活动', `<form id="mf">${wk}<label class="f"><span>类型</span><select name="kind">${Object.entries(d.kinds).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label><label class="f"><span>名称</span><input name="title" required placeholder="例如：11 月生日会"></label><label class="f"><span>日期</span><input type="date" name="date" value="${new Date().toISOString().slice(0, 10)}"></label>
      <label class="f"><span>参加人数 / 应参加人数</span><div class="row" style="gap:6px"><input type="number" name="n_join" min="0" required><input type="number" name="n_total" min="1" value="${s.n}"></div></label><label class="f"><span>费用（元）</span><input type="number" name="cost" min="0" value="0"></label><label class="f"><span>活动照片（必传）</span><input type="file" accept="image/*" required></label>
      <div class="row" style="margin-top:12px"><span class="sp"></span><button type="button" class="btn" data-close>取消</button><button class="btn primary">确定</button></div></form>`);
    $('#mf').onsubmit = async e => { e.preventDefault(); const x = formData(e.target); if (await act(async () => api('/care/act', { ...x, store_id: s.id, photo: await filePhoto(e.target) }), '已登记')) { closeModal(); route(); } }; });
  on('cdorm', () => { modal('宿舍与员工休息区检查', `<form id="mf"><p class="muted small">检查卫生、热水、空调、消防通道、床位和门锁。</p><label class="f"><span>发现的问题（没有就留空）</span><textarea name="issues"></textarea></label><label class="f"><span>现场照片（必传）</span><input type="file" accept="image/*" required></label><div class="row" style="margin-top:12px"><span class="sp"></span><button type="button" class="btn" data-close>取消</button><button class="btn primary">确定</button></div></form>`);
    $('#mf').onsubmit = async e => { e.preventDefault(); if (await act(async () => api('/care/dorm', { store_id: s.id, issues: e.target.issues.value, photo: await filePhoto(e.target) }), '已记录')) { closeModal(); route(); } }; });
  on('clog', () => formModal('记录关怀', `<label class="f"><span>员工</span>${staffSel}</label><label class="f"><span>类型</span><select name="kind">${Object.entries(d.log_kinds).filter(([k]) => k !== 'sm_talk').map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
    <label class="f"><span>谈了什么 / 员工的诉求</span><textarea name="note" required></textarea></label><label class="f"><span>我要跟进的事（可选，会提醒自己）</span><input name="follow"></label><label class="row small" style="gap:6px"><input type="checkbox" name="escalate" value="1" style="width:auto"> 涉及敏感问题，转人事跟进</label>`,
    x => act(() => api('/care/log', { ...x, store_id: s.id, user_id: Number(x.user_id), escalate: !!x.escalate }), '已记录')));
  on('cstar', () => formModal('提名本月之星', `<label class="f"><span>员工</span>${staffSel}</label><label class="f"><span>推荐理由</span><textarea name="reason" required placeholder="执行分、获得的认可、具体事例"></textarea></label>`, x => act(() => api('/care/star', { user_id: Number(x.user_id), reason: x.reason }), '已提名，等待人事审核')));
  on('chard', () => formModal('困难帮扶申请', `<label class="f"><span>员工</span>${staffSel}</label><label class="f"><span>类型</span><select name="kind"><option>家人重病</option><option>意外受伤</option><option>生活困难</option><option>其他</option></select></label><label class="f"><span>申请金额（元）</span><input type="number" name="amount" min="0"></label><label class="f"><span>情况说明</span><textarea name="reason" required></textarea></label>`, x => act(() => api('/care/hardship', { ...x, user_id: Number(x.user_id) }), '已提交人事')));
  on('ckd', () => formModal('记一条认可', `<label class="f"><span>员工</span>${staffSel}</label><label class="f"><span>来源</span><select name="from_kind"><option>店长</option><option>宾客</option></select></label><label class="f"><span>认可内容</span><textarea name="text" required></textarea></label>`, x => act(() => api('/care/kudos', { ...x, to_user: Number(x.user_id) }), '已记录，员工会收到通知')));
  document.querySelectorAll('[data-rp]').forEach(b => b.onclick = () => formModal('回复意见', '<label class="f"><span>回复（全店员工可见）</span><textarea name="reply" required></textarea></label>', x => act(() => api('/care/suggest/' + b.dataset.rp, x), '已回复')));
  document.querySelectorAll('[data-fx]').forEach(b => b.onclick = () => formModal('改进措施 · ' + b.dataset.fx, '<label class="f"><span>改进措施</span><textarea name="action" required></textarea></label><label class="f"><span>完成期限</span><input type="date" name="due"></label>', x => act(() => api('/care/fix', { store_id: s.id, theme: b.dataset.fx, ...x }), '已发布')));
  document.querySelectorAll('[data-fd]').forEach(b => b.onclick = () => formModal('改进完成', '<label class="f"><span>改进结果</span><textarea name="result" required></textarea></label>', x => act(() => api('/care/fix', { store_id: s.id, id: Number(b.dataset.fd), result: x.result }), '已完成')));
  document.querySelectorAll('[data-wf]').forEach(b => b.onclick = async () => { if (await act(() => api('/care/welfare', { user_id: Number(b.dataset.wf), item: b.dataset.i }), '已登记')) route(); });
  bindCare(d);
};
function bindCare(d) {
  if ($('#ccfg')) $('#ccfg').onclick = () => formModal('员工美好标准与预算', `<label class="f"><span>员工餐标（元/人/天）</span><input type="number" name="meal_std" value="${d.cfg.meal_std}"></label><label class="f"><span>活动预算（元/人/年）</span><input type="number" name="act_budget" value="${d.cfg.act_budget}"></label><label class="f"><span>员工餐满意度提醒线（5 分制）</span><input type="number" step="0.1" name="meal_th" value="${d.cfg.meal_th}"></label><label class="f"><span>意见回复时限（小时）</span><input type="number" name="reply_h" value="${d.cfg.reply_h}"></label>`, x => act(() => api('/care/cfg', x), '已保存'));
  document.querySelectorAll('[data-smt]').forEach(b => b.onclick = () => formModal('店长季度谈心 · ' + b.dataset.n, '<label class="f"><span>店长的状态、负荷和难处</span><textarea name="note" required></textarea></label><label class="f"><span>需要店长做的事（会通知店长）</span><input name="follow"></label>', x => act(() => api('/care/log', { ...x, kind: 'sm_talk', user_id: Number(b.dataset.smt) }), '已记录')));
  document.querySelectorAll('[data-hd]').forEach(b => b.onclick = () => formModal('困难帮扶审批', '<label class="f"><span>结果</span><select name="ok"><option value="1">通过</option><option value="0">不通过</option></select></label><label class="f"><span>说明</span><input name="note"></label>', x => act(() => api('/care/hardship/' + b.dataset.hd, { ok: x.ok === '1', note: x.note }), '已处理')));
  document.querySelectorAll('[data-st]').forEach(b => b.onclick = () => formModal('月度之星审核', '<label class="f"><span>结果</span><select name="ok"><option value="1">通过并公布</option><option value="0">不通过</option></select></label>', x => act(() => api('/care/star/' + b.dataset.st, { ok: x.ok === '1' }), '已处理')));
}
VIEWS.mycare = async () => {
  const d = await api('/care/me'); if (d.none) { $('#main').innerHTML = '<div class="empty">没有所属门店</div>'; return; }
  const m = d.meal, g = d.grow;
  $('#main').innerHTML = `<div class="pghd"><b>员工美好</b></div>
  ${grp('本周员工餐', m.rated ? `<span class="tag ok">本月已评 ${m.rated.score} 分</span>` : '<span class="tag warn">本月待评价</span>', `${m.menu ? `<pre class="small" style="white-space:pre-wrap;font-family:inherit;margin:4px 0">${esc(m.menu.body)}</pre>` : '<div class="muted small">本周菜单还没发布</div>'}<div class="muted small">餐标 ${m.std} 元/人/天 · 全店本月平均 ${stars(m.avg)}</div>${m.rated ? '' : '<button class="btn sm primary" id="mrate" style="margin-top:6px">评价本月员工餐</button>'}`, !m.rated)}
  ${grp('我的成长', g.next ? `<span class="tag acc">下一步：${esc(g.next)}</span>` : '', `<div class="small">现岗位 ${esc(g.role)} · 执行分 ${g.exec ?? '-'} · 年度学分 ${g.credits}/24</div>${g.req.map(r => `<div class="row between small" style="padding:3px 0"><span>${r.ok ? '✓' : '○'} ${r.l}</span><span class="muted">${esc(r.v)}</span></div>`).join('')}
    <div class="muted small" style="margin-top:6px">履历：${g.history.map(h => `${h.from.slice(0, 7)} ${esc(h.role)}`).join(' → ')}</div><div class="muted small">证书：${g.certs.map(c => `${esc(c.name)}（${c.expire} 到期）`).join('、')}</div>`, true)}
  ${grp('我收到的认可', `<span class="muted small">${d.kudos.length} 条</span>`, `<button class="btn sm" id="mkd">认可一位同事</button><div class="list" style="margin-top:6px">${d.kudos.map(k => `<div class="task"><div class="b"><div class="ttl">${esc(k.from_kind === '宾客' ? '宾客' : k.from_name || k.from_kind)}</div><div class="muted small">${esc(k.text)}</div></div></div>`).join('') || '<div class="empty">暂无</div>'}</div>`)}
  ${grp('意见箱', '<span class="muted small">匿名</span>', `<p class="muted small">店长看不到是谁提的，48 小时内回复。</p><button class="btn sm" id="msg">提意见</button>${d.replies.map(r => `<div class="task"><div class="b"><div class="ttl"><span class="tag">${esc(r.cat)}</span> ${esc(r.body)}</div><div class="muted small">店长回复：${esc(r.reply)}</div></div></div>`).join('')}${d.fixes.map(f => `<div class="small muted">· 针对「${esc(f.theme)}」：${esc(f.action)}${f.status === 'done' ? '（已完成）' : ''}</div>`).join('')}`)}
  ${grp('活动与福利', '', `<div class="small">我的生日 ${d.bday.m} 月 ${d.bday.d} 日（模拟）</div>${d.acts.map(a => `<div class="small muted">· ${a.date} ${esc(a.title)}</div>`).join('')}<div class="row small" style="gap:4px;flex-wrap:wrap;margin-top:6px">${d.welfare.map(i => `<span class="tag ${i.done ? 'ok' : ''}" ${i.na ? 'style="opacity:.4"' : ''}>${i.i}${i.na ? ' 不适用' : i.done ? ' 已发' : ' 待发'}</span>`).join('')}</div>`)}
  ${grp('困难帮扶', d.hard.length ? `<span class="tag acc">${d.hard.length}</span>` : '', `<p class="muted small">遇到家人重病、意外等困难，可以向人事申请帮扶，申请内容只有店长和人事能看到。</p><button class="btn sm" id="mhd">申请帮扶</button>${d.hard.map(h => `<div class="small muted">· ${h.at.slice(0, 10)} ${esc(h.kind)} ${h.amount} 元 · ${{ pending: '审批中', approved: '已通过', rejected: '未通过' }[h.status]}${h.note ? ' · ' + esc(h.note) : ''}</div>`).join('')}`)}`;
  const on = (id, f) => { if ($('#' + id)) $('#' + id).onclick = f; };
  on('mrate', () => formModal('评价本月员工餐', '<label class="f"><span>满意度</span><select name="score"><option value="5">5 分 · 很满意</option><option value="4">4 分 · 满意</option><option value="3">3 分 · 一般</option><option value="2">2 分 · 不满意</option><option value="1">1 分 · 很不满意</option></select></label><label class="f"><span>意见（可选）</span><input name="comment"></label>', x => act(() => api('/care/rate', { score: Number(x.score), comment: x.comment }), '感谢评价')));
  on('msg', () => formModal('匿名意见', `<label class="f"><span>类别</span><select name="cat">${d.voice.map(v => `<option>${v}</option>`).join('')}</select></label><label class="f"><span>意见</span><textarea name="body" required></textarea></label>`, x => act(() => api('/care/suggest', x), '已匿名提交')));
  on('mkd', () => formModal('认可一位同事', `<label class="f"><span>同事</span><select name="to_user">${d.team.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label><label class="f"><span>想感谢 TA 什么</span><textarea name="text" required></textarea></label>`, x => act(() => api('/care/kudos', { to_user: Number(x.to_user), text: x.text }), '已送出')));
  on('mhd', () => formModal('申请困难帮扶', '<label class="f"><span>类型</span><select name="kind"><option>家人重病</option><option>意外受伤</option><option>生活困难</option><option>其他</option></select></label><label class="f"><span>申请金额（元）</span><input type="number" name="amount" min="0"></label><label class="f"><span>情况说明</span><textarea name="reason" required></textarea></label>', x => act(() => api('/care/hardship', x), '已提交人事')));
};

// 飞书企业自建应用适配：在飞书 / Lark 容器内隐藏自带顶栏，后续在此接入 h5sdk 免登（tt.requestAuthCode → 后端换取 user_access_token）
const IN_FEISHU = /Lark|Feishu/i.test(navigator.userAgent) || new URLSearchParams(location.search).get('feishu') === '1';
if (IN_FEISHU) document.body.classList.add('in-feishu');

route();
