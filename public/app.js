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
  staff: [['sec', '我的工作'], ['my', '我的任务'], ['my-rect', '我的整改'], ['notices', '消息提醒'], ['sec', '品牌标准'], ['standards', '品牌标准库'], ['feed', '门店群拍墙']],
  store_manager: [['sec', '每日工作'], ['desk', '今日待办'], ['tasks', '任务看板与抽查'], ['rect', '整改闭环'], ['my', '我的任务'],
    ['sec', '品牌标准'], ['standards', '品牌标准库'], ['feed', '门店群拍墙'], 
    ['sec', '分配'], ['assign', '场景分配'], ['leave', '休息与顶岗'], ['flex', '灵活任务'], ['sec', '监督'], ['focus', '重点跟踪'], ['issues', '问题预警'], ['team', '门店人员'], ['audit', '操作日志'], ['notices', '消息提醒']],
  hr_manager: [['sec', '人事'], ['people', '人员档案与梯队'], ['notices', '消息提醒'], ['sec', '品牌标准'], ['standards', '品牌标准库'], ['feed', '门店群拍墙']],
  ops_manager: [['sec', '区域运营'], ['dash', '区域运营看板'], ['issues', '问题门店'], ['tasks', '门店任务明细'], ['rect', '整改闭环'], ['focus', '重点跟踪'], ['patrol', '巡店记录'], ['notices', '消息提醒'], ['sec', '品牌标准'], ['standards', '品牌标准库'], ['feed', '门店群拍墙']],
  sales_manager: [['sec', '区域销售'], ['dash', '区域销售看板'], ['issues', '问题门店'], ['tasks', '门店销售任务'], ['rect', '整改闭环'], ['notices', '消息提醒']],
  region_manager: [['sec', '全局'], ['dash', '区域看板'], ['people', '人事档案与梯队'], ['issues', '问题门店筛选'], ['patrol', '巡店计划'], ['focus', '重点跟踪'],
    ['sec', '品牌标准'], ['standards', '品牌标准库'], ['feed', '门店群拍墙'], 
    ['sec', '门店'], ['tasks', '门店任务明细'], ['rect', '整改闭环'], ['assign', '场景分配'], ['leave', '休息与顶岗'], ['team', '门店人员'],
    ['sec', '配置'], ['settings', '岗位 / 场景 / 工作清单'], ['audit', '操作日志'], ['notices', '消息提醒']],
};
const HOME = { hr_manager: 'home', staff: 'home', store_manager: 'home', ops_manager: 'home', sales_manager: 'home', region_manager: 'home' };
const COMMON = ['home', 'work', 'me', 'notices', 'my', 'my-rect', 'standards', 'feed', 'group', 'task', 'app', 'upper', 'must', 'crew', 'person', 'leader', 'hrp'];
const rectRoute = () => (S.me.level === 'staff' ? 'my-rect' : 'rect');
const CENTER = { hr_manager: '人事中心', staff: '我的', store_manager: '店长中心', ops_manager: '运营中心', sales_manager: '营销中心', region_manager: '区域中心' };
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
  const lead = list.filter(u => ['region_manager', 'ops_manager', 'sales_manager', 'hr_manager'].includes(u.level));
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
    const std = await api('/standards?store=' + p.store_id);
    const rows = std.rows.filter(c => c.active);
    const groups = {};
    for (const c of rows) (groups[c.scene_name] ||= []).push(c);
    $('#main').innerHTML = `<h1>品牌审计巡店 · ${esc(p.store_name)}</h1>
    <p class="muted small" style="margin-top:-6px">计划 ${esc(p.planned_date)} · 重点：${esc(p.reason || '例行巡店')}。按《品牌审计线下检查标准 2026Q3》${rows.length} 条逐项判定，默认达标；清零项不达标则总分记 0。</p>
    <div class="scorebox" id="sb"></div>
    <form id="f">${Object.entries(groups).map(([sc, cs]) => `<details class="pg" ${sc === '前台' ? 'open' : ''}><summary><b>${esc(sc)}</b><span class="muted small">${cs.length} 条</span><span class="sp"></span><span class="gf" data-gf="${esc(sc)}"></span></summary>
      ${cs.map(c => `<div class="pi" data-code="${c.code}" data-max="${/^\d+$/.test(c.score) ? c.score : 0}" data-tag="${esc(c.tag)}" data-sc="${esc(sc)}">
        <div class="pt"><span class="tag std">No.${c.code}</span> <b>${esc(c.title)}</b> ${c.tag !== '基础项' ? `<span class="tag ${TAG_CLS[c.tag] ?? ''}">${esc(c.tag)}</span>` : ''} <span class="muted small">${/^\d+$/.test(c.score) ? c.score + ' 分' : ''}</span>
          ${c.last_patrol === 'fail' ? '<span class="tag warn">上次不达标</span>' : ''}${c.n_bad ? `<span class="tag warn">近14日抽查不合格 ${c.n_bad}</span>` : ''}</div>
        <details class="sd"><summary>检查标准</summary><div class="pre small">${esc(c.standard)}</div></details>
        <div class="seg3">${[['pass', '达标'], ['fail', '不达标'], ['na', '不适用']].map(([v, l]) => `<label><input type="radio" name="r${c.code}" value="${v}" ${v === 'pass' ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
        <input class="pc" name="c${c.code}" placeholder="问题描述（不达标必填）" style="display:none"></div>`).join('')}</details>`).join('')}
    <label class="f" style="margin-top:12px"><span>巡店结论</span><textarea name="summary" required placeholder="总体评价、主要问题、整改要求"></textarea></label>
    <div class="row"><span class="sp"></span><button class="btn primary">提交巡店报告</button></div></form>`;
    const calc = () => {
      let e = 0, mx = 0, fail = 0, na = 0; const zero = [], gf = {};
      document.querySelectorAll('.pi').forEach(el => {
        const v = el.querySelector('input[type=radio]:checked').value, m = Number(el.dataset.max);
        el.classList.toggle('bad', v === 'fail'); el.querySelector('.pc').style.display = v === 'fail' ? '' : 'none';
        if (v === 'na') { na++; return; }
        mx += m; if (v === 'pass') e += m; else { fail++; gf[el.dataset.sc] = (gf[el.dataset.sc] || 0) + 1; if (el.dataset.tag === '清零项') zero.push(el.dataset.code); }
      });
      const sc = zero.length ? 0 : Math.round(e * 100 / (mx || 1));
      $('#sb').innerHTML = `<div><b class="${zero.length || sc < 85 ? 'bad' : ''}">${sc}</b><span>预估得分</span></div><div><b>${fail}</b><span>不达标</span></div><div><b>${na}</b><span>不适用</span></div><div><b class="${zero.length ? 'bad' : ''}">${zero.length}</b><span>清零项</span></div>`;
      document.querySelectorAll('[data-gf]').forEach(x => { const n = gf[x.dataset.gf]; x.innerHTML = n ? `<span class="tag bad">不达标 ${n}</span>` : ''; });
    };
    $('#f').onchange = calc; calc();
    $('#f').onsubmit = async e => {
      e.preventDefault(); const d = formData(e.target); const results = {};
      for (const c of rows) results[c.code] = { result: d['r' + c.code], comment: d['c' + c.code] };
      if (await act(() => api(`/patrols/${id}/complete`, { summary: d.summary, results }), '巡店报告已提交')) route();
    };
    return;
  }
  const items = p.items.map(i => ({ ...i, result: i.result || (i.score < i.max ? 'fail' : 'pass') }));
  const fails = items.filter(i => i.result === 'fail'), zero = fails.filter(i => i.tag === '清零项');
  const groups = {};
  for (const i of items) (groups[i.scene_name || '其他'] ||= []).push(i);
  const focusBtn = i => (rm ? `<a class="btn sm" href="#/focus?${new URLSearchParams({ new: 1, store: p.store_id, scene: i.scene_id || '', title: '每日检查：' + (i.code ? `No.${i.code} ` : '') + i.item, standard: i.comment ? '针对巡店问题：' + i.comment : '', ref: 'patrol:' + p.id })}">转为重点跟踪</a>` : '');
  $('#main').innerHTML = `<h1>巡店报告 · ${esc(p.store_name)}</h1>
  ${p.status === 'done' ? `<div class="scorebox"><div><b class="${zero.length || p.score < 85 ? 'bad' : ''}">${p.score}</b><span>总分</span></div><div><b>${fails.length}</b><span>不达标</span></div><div><b>${items.filter(i => i.result === 'na').length}</b><span>不适用</span></div><div><b class="${zero.length ? 'bad' : ''}">${zero.length}</b><span>清零项</span></div></div>
  <p class="muted small">完成于 ${esc(p.done_at)} · 已下发重点跟踪 ${p.focus.length} 项${zero.length ? ' · <b style="color:var(--bad)">触发清零项，总分记 0</b>' : ''}</p>
  <div class="note" style="margin-bottom:12px"><b>巡店结论</b><br>${esc(p.summary)}</div>
  <h2>不达标项（${fails.length}）</h2><div class="list">${fails.map(i => `<div class="task"><div class="b"><div class="ttl">${i.code ? `<span class="tag std">No.${esc(i.code)}</span> ` : ''}${esc(i.item)} ${i.tag && i.tag !== '基础项' ? `<span class="tag ${TAG_CLS[i.tag] ?? ''}">${esc(i.tag)}</span>` : ''} <span class="muted small">${esc(i.scene_name || '')} · ${i.max} 分</span></div>
    <div class="small" style="color:var(--bad)">${esc(i.comment)}</div></div><div>${focusBtn(i)}</div></div>`).join('') || '<div class="empty">全部达标</div>'}</div>
  <h2>逐项结果</h2>${Object.entries(groups).map(([sc, is]) => `<details class="pg"><summary><b>${esc(sc)}</b><span class="muted small">${is.filter(i => i.result === 'pass').length}/${is.filter(i => i.result !== 'na').length} 达标</span></summary>
    ${is.map(i => `<div class="pr"><span class="tag std">${i.code ? 'No.' + esc(i.code) : ''}</span> ${esc(i.item)}<span class="sp"></span>${i.result === 'pass' ? '<span class="tag ok">达标</span>' : i.result === 'na' ? '<span class="tag">不适用</span>' : '<span class="tag bad">不达标</span>'}</div>`).join('')}</details>`).join('')}
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

// ---------- 工作台 ----------
VIEWS.work = async () => {
  const secs = []; let cur = null;
  for (const [k, l] of NAV[S.me.level]) { if (k === 'sec') { cur = { t: l, items: [] }; secs.push(cur); } else cur.items.push([k, l]); }
  let ci = 0;
  $('#main').innerHTML = `<h1>工作台</h1>${secs.map(sc => `<div class="sec-t">${esc(sc.t)}</div><div class="panel tiles">${sc.items.map(([k, l]) =>
    `<a class="tile" href="#/${k}"><span class="tic" style="background:${TILE_COLORS[ci++ % TILE_COLORS.length]}">${esc(l.replace(/[^\u4e00-\u9fa5]/g, '').slice(0, 1))}</span><span>${esc(l)}</span></a>`).join('')}</div>`).join('')}
  <div class="sec-t">内部系统</div><div class="panel tiles">${Object.entries(APPS).map(([k, x]) => `<a class="tile" href="#/app/${k}"><span class="tic" style="background:${x.color}">${x.name.replace('易', '').slice(0, 1)}</span><span>${x.name}</span></a>`).join('')}</div>`;
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
  const quick = { store_manager: [1, '切换为区域经理'], region_manager: [4, '切换为店长'], ops_manager: [4, '切换为店长'], hr_manager: [1, '切换为区域经理'], sales_manager: [1, '切换为区域经理'], staff: [4, '切换为店长'] }[S.me.level];
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
VIEWS.home = async () => {
  const lv = S.me.level, p = qs();
  if (lv === 'hr_manager' && p.get('view') !== 'store') return hrBoard(true);
  if (['region_manager', 'ops_manager', 'sales_manager'].includes(lv) && p.get('view') !== 'store') return regionHome();
  if (lv === 'staff') return staffHome();
  if (p.get('view') === 'store') return storeHome();
  return managerHome();
};
async function regionHome() {
  const P = qs(), tab = S.me.level === 'region_manager' && P.get('tab') === 'ren' ? 'ren' : 'dian';
  if (tab === 'ren') return regionPeople();
  const rk = P.get('rk') === 'biz' || (S.me.level === 'sales_manager' && P.get('rk') !== 'ops') ? 'biz' : 'ops';
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
  ${rm ? regionTabs('dian') : ''}
  <section class="brief rg"><div class="btabs"><a class="on">${sales ? '销售看板' : '运营看板'}</a><span class="sp"></span><a href="#/dash" class="lk2">完整看板 ›</a></div>
    <div class="rkpi">${[['今日完成率', pc(dn, tot), '%', '#/tasks'], ['重点跟踪', sum('focus_total'), '', '#/focus'], ['抽查合格率', pc(chk[0], chk[1]), '%', '#/dash'], ['未闭环整改', sum('rect_open'), '', '#/rect'], ['逾期整改', sum('rect_late'), '', '#/rect?st=late'], ['问题门店', iss.length, '', '#/issues']]
      .map(([l, v, u, h], i) => `<a href="${h}" class="${i >= 4 && v ? 'bad' : ''}"><b>${v ?? '-'}<small>${v == null ? '' : u}</small></b><span>${l}</span></a>`).join('')}</div></section>
  <section class="brief rg bz"><div class="btabs"><a class="on">经营看板</a><span class="muted small">近 7 日 · 较前 7 日</span><span class="sp"></span><a href="#/dash" class="lk2">详情 ›</a></div>
    <div class="rkpi">${(() => { const sm = k => biz.reduce((a, x) => a + x[k], 0), av = k => biz.length ? Math.round(sm(k) / biz.length * 10) / 10 : null, dl = av('revpar_delta');
      return [['平均 RevPAR', Math.round(av('revpar')), '元', dl], ['平均出租率', av('occ'), '%', av('occ_delta')], ['平均 ADR', Math.round(av('adr')), '元'], ['平均 MPI', av('mpi'), ''], ['差评', sm('bad'), '条'], ['经营下滑店', biz.filter(x => x.revpar_delta < -3).length, '家']]
        .map(([l, v, u, dd], i) => `<a href="#/dash" class="${i >= 4 && v ? 'bad' : ''}"><b>${v ?? '-'}<small>${u}</small></b><span>${l}${dd != null ? ` <em class="${dd < 0 ? 'dn' : 'up'}">${dd > 0 ? '+' : ''}${dd}</em>` : ''}</span></a>`).join(''); })()}</div></section>
  <div class="sec-t2 row between"><span>门店排名</span><div class="seg sm">${[['ops', '运营执行'], ['biz', '经营']].map(([k, l]) => `<a class="${rk === k ? 'on' : ''}" href="#/home?rk=${k}">${l}</a>`).join('')}</div></div>
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
  ${regionTabs('ren')}
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
    <a class="ib" href="#/me">${icon('me')}<span>${esc(CENTER[S.me.level])}</span></a><button class="ib" id="more">${icon('more')}<span>更多</span></button></div>` : '<div class="pghd"><b>人事档案与人才梯队</b></div>'}
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
  <div class="sf-sum"><div class="ring">${gauge(r, 104, 10, rateColor(r))}<div class="rv"><b>${r ?? '-'}</b><small>${r == null ? '' : '%'}</small><span>${done.length}/${all.length}</span></div></div>
    <div class="sf-kv"><a href="#/my"><b>${pend.length}</b><span>待完成</span></a><a href="#/my" class="${od.length ? 'bad' : ''}"><b>${od.length}</b><span>已超时</span></a><a href="#/my-rect" class="${openR.length ? 'warn' : ''}"><b>${openR.length}</b><span>待整改</span></a><a href="#/my"><b>${fb.filter(t => t.check_result === 'good').length}</b><span>获肯定</span></a></div></div>
  <div class="mtiles">${(S.me.lead ? [['#/my', '我的任务', '任'], ['#/my-rect', '我的整改', '改'], ['assign', '派任务', '派'], ['#/must', '点评跟进', '评'], ['#/crew', '我的团队', '队'], ['#/standards', '品牌标准', '标'], ['#/feed', '群拍墙', '拍'], ['#/notices', '消息提醒', '信']] : [['#/my', '我的任务', '任'], ['#/my-rect', '我的整改', '改'], ['#/standards', '品牌标准', '标'], ['#/feed', '群拍墙', '拍']]).map(([h2, l, c], i) => `<a ${h2 === 'assign' ? 'id="asg"' : `href="${h2}"`}><span class="tic" style="background:${TILE_COLORS[i % TILE_COLORS.length]}">${c}</span><span>${l}</span></a>`).join('')}</div>
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

// 飞书企业自建应用适配：在飞书 / Lark 容器内隐藏自带顶栏，后续在此接入 h5sdk 免登（tt.requestAuthCode → 后端换取 user_access_token）
const IN_FEISHU = /Lark|Feishu/i.test(navigator.userAgent) || new URLSearchParams(location.search).get('feishu') === '1';
if (IN_FEISHU) document.body.classList.add('in-feishu');

route();
