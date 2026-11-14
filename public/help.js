// 说明体系：指标小问号、板块说明抽屉、说明中心、责任人咨询
const HV = '2026-11-15';
const HELP_GROUPS = [['门店执行', ['home', 'must', 'deleg']], ['巡店与整改', ['pfind', 'patrol', 'rect', 'issues']], ['团队', ['hrm', 'care']], ['区域与经营', ['dash', 'coach', 'sbiz']], ['系统', ['dataauth']]];
const HELP_DOCS = {
  home: { t: '首页', use: '每个角色登录后先看这里：我的工作入口、一天时间节奏、待我处理和关键指标。',
    roles: [['店长、门店角色', '看本店今日任务、待我处理、执行分'], ['区域经理、教练等管理角色', '看所辖门店异常、看板入口'], ['员工', '看自己的任务和执行分']],
    flow: ['看「我的工作」入口', '按「一天时间」节奏推进', '处理「待我处理」', '看指标是否达标'],
    rules: ['过了当天没完成的任务自动变为「逾期未完成」，不能补做，照常计入执行分', '「待我处理」每类最多显示前几条，点进去看全部'],
    faq: [['为什么昨天的任务不见了？', '过了当天未完成的任务已标为逾期未完成，可以在任务列表筛选查看。']], metrics: ['执行分', '完成率', '逾期未完成'] },
  must: { t: '待我处理', use: '汇总需要你本人动手的事：超时任务、待抽查、待复查整改、授权待复核、审批、预警。',
    roles: [['所有角色', '只看到自己需要处理的事']], flow: ['系统按规则生成待办', '点进单据处理', '处理完自动消失'],
    rules: ['同一件事只出现一次，不在多个模块重复提醒', '超时任务按门店合并成一条提醒'], faq: [['待办做完了还在？', '刷新页面；如果单据仍未闭环（例如整改还没复查），会继续显示。']], metrics: ['完成率'] },
  deleg: { t: '任务授权下转', use: '店长把自己要做的任务交给本店店助或主管执行，出差、休假或培训下属时使用。',
    roles: [['店长', '发起、收回授权，复核授权任务'], ['店助、前台经理、客房经理', '接手执行，不能再转授'], ['区域经理、运营经理、教练', '查看各店授权比例和明细，不能操作']],
    flow: ['店长选择授权方式', '选择本店接手人', '接手人执行', '店长复核', '到期或收回后任务回到店长'],
    rules: ['三种方式：单条任务、按任务长期、按时段整体', '整体授权最长 {deleg_all} 天，按任务授权最长 {deleg_task} 天', '只能转给本店在职的店助、前台经理、客房经理，当天请假的人不会接到', '接手人不能二次转授，也不能临时改派', '清零项必须由店长复核', '转出比例超过 {deleg_warn}% 标红，区域经理、运营经理、教练可见', '收回后没完成的任务回到店长，已完成的保留记录'],
    faq: [['执行分记在谁身上？', '记在接手人身上；任务上标注「授权 · 原店长」。'], ['授权以后店长还要负责吗？', '要。责任不转，需要复核的任务会进店长的待我处理。']], metrics: ['转出比例'] },
  pfind: { t: '巡店筛选', use: '按问题找门店，再一键排进本日、本周、本月巡店计划。',
    roles: [['区域经理、教练', '筛选并加入计划'], ['运营经理', '只能查看筛选结果'], ['店长及门店角色', '不可用']],
    flow: ['输入关键词或点标签', '叠加条件：近 7/30/90 天、C/D 级、超 {stale} 天未巡、未排计划', '看匹配原因和证据', '勾选门店', '加入本日、本周或本月'],
    rules: ['运营标签匹配客诉、抽查不合格、巡店不达标、报修、漏做任务；排序加权：客诉 3、抽查和巡店 2、报修 1、漏做 0.5', '经营、加盟商、团队标签按系统指标判断，例如满编率低于 {fill}%、月离职率高于 {month}%', '同一家店同一天同类计划只能有一条', '同一人一天排超过 {patrol_day_max} 家会提示', '巡店重点自动带上筛选原因，开始巡店时自动选对应场景，比如早餐差对应餐厅'],
    faq: [['本周、本月排在哪天？', '自动排到周期内已排巡店最少的一天，可以在巡店计划里改。']], metrics: ['满编率', '月离职率', '员工美好分', '执行分'] },
  patrol: { t: '巡店计划', use: '安排、执行和跟踪巡店，看完成率、覆盖率和巡店效果。',
    roles: [['区域经理、教练', '制定计划、执行巡店、取消'], ['运营经理', '执行复查和神秘访客'], ['店长', '看本店被巡计划和结果']],
    flow: ['制定计划（本日、本周、本月或指定日期）', '到店开始巡店：全量、专项或神秘访客', '逐项打分拍照', '提交报告并生成整改', '按 {recheck_days} 天安排复查', '看巡店效果'],
    rules: ['过去日期不能排计划', '不达标项自动生成整改，派给店长', '巡店效果比较巡店前后各 14 天同类问题数'], faq: [['逾期未巡怎么办？', '计划标红并进待我处理，可以改期或取消。']], metrics: ['巡店完成率', '本月覆盖'] },
  rect: { t: '整改闭环', use: '跟踪抽查、巡店、客诉产生的整改，从派发到复查闭环。',
    roles: [['被派整改的人', '按期提交整改证据'], ['店长、检查人', '复查通过或退回'], ['区域经理、运营经理', '看各店整改闭环率']],
    flow: ['发现问题', '生成整改并派人', '提交整改', '复查', '闭环或退回重做'], rules: ['整改没提交不能复查', '已闭环的整改不能再次提交', '超期未改进入升级提醒'], faq: [], metrics: ['完成率'] },
  issues: { t: '问题门店', use: '集中看所辖门店的异常和风险，决定先去哪家。', roles: [['区域经理、教练、运营经理', '查看并跟进']], flow: ['看异常列表', '进入门店详情', '安排巡店或辅导'], rules: ['和巡店筛选共用证据来源'], faq: [], metrics: ['门店画像'] },
  hrm: { t: '人事指标', use: '看编制、在岗、满编率、离职、招聘、合规，发现人员不稳的门店。',
    roles: [['人事经理', '看全区域，调整编制，推进招聘'], ['区域经理、教练、运营经理、总部', '看各店对比和人事与经营对照'], ['店长', '看本店，发起招聘，填写离职面谈']],
    flow: ['看预警', '定位缺编岗位', '发起招聘', '跟进到岗', '复盘离职原因'],
    rules: ['预警线：满编率低于 {fill}%、关键岗空缺超过 {vac} 天、月离职率超过 {month}%、90 天流失率超过 {early}%', '编制按房量计算，人事经理可以按店微调'], faq: [], metrics: ['满编率', '月离职率', '90 天流失', '关键岗空缺', '离职成本', '人事稳定', '团队稳定'] },
  care: { t: '员工美好', use: '员工餐、活动、关怀、员工声音、认可、福利，算成门店员工美好分。',
    roles: [['店长', '执行员工餐、活动、谈心、宿舍检查等'], ['区域经理、教练', '看排名，和店长季度谈心'], ['人事经理', '设定标准，审批帮扶和月度之星'], ['员工', '评价员工餐、提意见、认可同事']],
    flow: ['系统按周期生成关怀任务', '店长执行并上传照片', '员工反馈', '算员工美好分', '低分门店进辅导清单'],
    rules: ['员工餐标准 {meal_std} 元/人/天，活动预算 {act_budget} 元/人/年', '员工餐评分低于 {meal_th} 分提醒', '意见需 {reply_h} 小时内回复', '活动和宿舍检查必须上传照片'], faq: [], metrics: ['员工美好分', '团队稳定'] },
  dash: { t: '区域看板', use: '区域经营和执行总览。', roles: [['区域经理、运营经理、总部', '查看']], flow: ['看总览', '找落后门店', '下钻处理'], rules: ['经营数据需要「经营数据」授权'], faq: [], metrics: ['RevPAR', 'MPI', '统购率', '门店画像'] },
  coach: { t: '教练辅导', use: '教练按店长诊断制定辅导清单，到店辅导并记录。', roles: [['教练', '辅导、记录、验收'], ['区域经理', '查看辅导进度']], flow: ['看店长诊断短板', '定辅导项', '到店辅导', '记录', '复盘改善'], rules: ['员工美好分低的门店自动进辅导清单'], faq: [], metrics: ['团队稳定'] },
  sbiz: { t: '门店经营', use: '看门店收入、预算、RevPAR、MPI 等经营数据。', roles: [['店长、店助', '看本店'], ['有经营授权的管理角色', '看各店']], flow: ['看本月达成', '对比竞对', '定改进动作'], rules: ['需要「经营数据」授权'], faq: [], metrics: ['RevPAR', 'MPI', '统购率'] },
  dataauth: { t: '数据授权', use: '按角色控制谁能看哪些敏感数据。', roles: [['区域经理、总部', '修改授权'], ['人事经理', '只读'], ['其他角色', '不可见']],
    flow: ['选择角色', '勾选数据类别', '保存', '接口立即按新授权拦截'], rules: ['本人数据不受限制', '没有联系方式授权时，别人的手机号打码显示', '每次修改记入操作日志'], faq: [['为什么我看不到某个页面？', '看本说明里的「你的权限」，缺哪类授权就找区域经理或总部开通。']], metrics: [] }
};
const METRICS = {
  执行分: { def: '个人执行任务的综合得分', calc: '按时完成、抽查合格加分，逾期、不合格扣分', src: '任务、抽查记录', target: '80 分以上', freq: '实时' },
  完成率: { def: '应完成任务中已完成的比例', calc: '已完成 ÷ 应完成', src: '任务', target: '95% 以上', freq: '实时' },
  逾期未完成: { def: '过了当天仍未完成的任务', calc: '次日自动转换，不能补做', src: '任务', target: '0', freq: '每日' },
  转出比例: { def: '店长自己的任务中授权给别人的比例', calc: '过去 7 天加未来 7 天，授权任务数 ÷ 店长任务总数', src: '任务授权', target: '不超过 {deleg_warn}%', freq: '实时' },
  巡店完成率: { def: '计划巡店中已完成的比例', calc: '已完成 ÷ 计划数，分本日、本周、本月', src: '巡店计划', target: '100%', freq: '实时' },
  本月覆盖: { def: '本月巡过的门店占所辖门店的比例', calc: '本月完成巡店的门店数 ÷ 所辖门店数', src: '巡店计划', target: '100%', freq: '实时' },
  满编率: { def: '在岗人数占编制的比例', calc: '在岗 ÷ 编制，编制按房量和岗位算', src: '人员、编制', target: '不低于 {fill}%', freq: '每日' },
  月离职率: { def: '近 30 天离职人数占平均在岗人数的比例', calc: '近 30 天离职 ÷ 在岗', src: '离职交接', target: '不超过 {month}%', freq: '每日' },
  '90 天流失': { def: '入职 90 天内离职的比例', calc: '90 天内离职的新员工 ÷ 同期入职人数', src: '入离职记录', target: '不超过 {early}%', freq: '每日' },
  关键岗空缺: { def: '店长、店助、前台经理、客房经理岗位空缺', calc: '空缺岗位与空缺天数', src: '编制、人员', target: '空缺不超过 {vac} 天', freq: '每日' },
  离职成本: { def: '人员流失带来的估算成本', calc: '招聘费 600 元 + 培训费 1200 元 + 空岗期间日薪的一半 + 新人爬坡期月薪的 30%', src: '离职记录、薪酬', target: '越低越好', freq: '每月' },
  人事稳定: { def: '人事指标的综合稳定分', calc: '满编率、离职率、90 天流失、关键岗空缺加权', src: '人事指标', target: '80 分以上', freq: '每日' },
  团队稳定: { def: '店长考核里的团队稳定分', calc: '人事稳定 × 60% + 员工美好分 × 40%', src: '人事指标、员工美好', target: '80 分以上', freq: '每日' },
  员工美好分: { def: '门店员工关怀执行情况', calc: '员工餐、菜单、活动、谈心、新人关怀、意见回复、宿舍检查 7 项加权', src: '员工美好记录', target: '75 分以上', freq: '每日' },
  RevPAR: { def: '每间可售房收入', calc: '客房收入 ÷ 可售房间夜数', src: '经营数据', target: '不低于预算', freq: '每日' },
  MPI: { def: '出租率市场指数', calc: '本店出租率 ÷ 竞争群平均出租率 × 100', src: '经营数据、竞对', target: '100 以上', freq: '每日' },
  统购率: { def: '采购中走集团统购的比例', calc: '统购金额 ÷ 采购总额', src: '采购', target: '按品牌标准', freq: '每月' },
  门店画像: { def: '门店综合等级 A 到 D', calc: '经营、品质、执行、团队等维度加权', src: '多个模块', target: 'B 级以上', freq: '每日' }
};
let HELP = null;
const helpLoad = async () => HELP || (HELP = await api('/help'));
const hfill = s => String(s).replace(/\{(\w+)\}/g, (m, k) => HELP?.th?.[k] ?? m);
const helpBar = route => HELP_DOCS[route] ? `<a class="hlp" href="javascript:void 0" onclick="helpOpen('${route}')">说明</a>` : '';
function helpDecorate(route) {
  const main = $('#main'); if (!main) return;
  const keys = Object.keys(METRICS).sort((a, b) => b.length - a.length), seen = new Set();
  main.querySelectorAll('div, span, b, h3, th, dt').forEach(el => {
    if (el.children.length || el.closest('button, .tag, .qm, .hdoc, .hint, .modal, .hrow')) return;
    const tx = el.textContent.trim(), k = keys.find(m => tx.startsWith(m) && tx.length <= m.length + 20 && !/\d{2,}%|：/.test(tx.slice(m.length)));
    if (!k || seen.has(k + el.parentElement?.className)) return;
    seen.add(k + el.parentElement?.className);
    el.insertAdjacentHTML('beforeend', `<i class="qm" data-m="${esc(k)}" role="button" aria-label="${esc(k)}说明">?</i>`);
  });
  main.querySelectorAll('.qm').forEach(q => q.onclick = e => { e.preventDefault(); e.stopPropagation(); metricOpen(q.dataset.m); });
  const hk = 'lt_hint_' + S.me.id + '_' + route;
  if (HELP_DOCS[route] && !localStorage[hk] && route !== 'help') {
    main.insertAdjacentHTML('afterbegin', `<div class="hint" id="hint"><span>第一次使用「${esc(HELP_DOCS[route].t)}」？${esc(HELP_DOCS[route].use)}</span><a href="javascript:void 0" id="hint-o">看说明</a><a href="javascript:void 0" id="hint-x">知道了</a></div>`);
    $('#hint-x').onclick = () => { localStorage[hk] = 1; $('#hint').remove(); };
    $('#hint-o').onclick = () => { localStorage[hk] = 1; $('#hint').remove(); helpOpen(route); };
  }
}
async function metricOpen(k) {
  await helpLoad(); const m = METRICS[k];
  modal(k, `<dl class="mdl">${[['定义', m.def], ['计算口径', m.calc], ['数据来源', m.src], ['目标和预警线', m.target], ['更新频率', m.freq]].map(([a, b]) => `<dt>${a}</dt><dd>${esc(hfill(b))}</dd>`).join('')}</dl>
    <p class="muted sm">相关说明：${Object.entries(HELP_DOCS).filter(([, d]) => d.metrics.includes(k)).map(([key, d]) => `<a href="#/help/${key}">${esc(d.t)}</a>`).join('、') || '无'}</p>`);
}
function helpBody(key) {
  const d = HELP_DOCS[key], o = HELP.owners[key], cats = HELP.cats || [], mine = HELP.mine_da || [];
  return `<div class="hsec"><h3>用途</h3><p>${esc(d.use)}</p></div>
  <div class="hsec"><h3>操作流程</h3><div class="hflow">${d.flow.map((s, i) => `<div class="hstep"><b>${i + 1}</b>${esc(hfill(s))}</div>`).join('<span class="harr">↓</span>')}</div></div>
  <div class="hsec"><h3>谁能用</h3><table class="htbl"><tr><th>角色</th><th>能做什么</th></tr>${d.roles.map(([r, c]) => `<tr><td>${esc(r)}</td><td>${esc(c)}</td></tr>`).join('')}</table></div>
  <div class="hsec"><h3>你的权限</h3><p class="sm">你是「${esc(S.me.role_name || CENTER[S.me.level] || '')}」。敏感数据：${cats.map(([k, l]) => `<span class="htag ${mine.includes(k) ? 'on' : ''}">${mine.includes(k) ? '可看' : '不可看'} · ${esc(l)}</span>`).join(' ')}</p><p class="muted sm">本人数据不受限制。需要开通请找区域经理或总部。</p></div>
  <div class="hsec"><h3>规则与约束</h3><ol>${d.rules.map(r => `<li>${esc(hfill(r))}</li>`).join('')}</ol></div>
  ${d.faq.length ? `<div class="hsec"><h3>常见问题</h3>${d.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>` : ''}
  ${d.metrics.length ? `<div class="hsec"><h3>相关指标</h3>${d.metrics.map(m => `<a class="htag on" href="javascript:void 0" onclick="metricOpen('${m}')">${esc(m)} ?</a>`).join(' ')}</div>` : ''}
  <div class="hsec hown"><h3>责任人</h3>${o ? `<p><b>${esc(o.name)}</b> · ${esc(o.role)} · ${esc(o.phone || '')}</p>
    ${o.id !== S.me.id ? `<button class="btn sm" onclick="helpAsk('${key}','ask')">咨询</button> <button class="btn sm" onclick="helpAsk('${key}','unclear')">没看懂</button>` : '<p class="muted sm">你是这篇说明的责任人，咨询会进你的待我处理。</p>'}` : '<p class="muted">暂未指定</p>'}
    ${HELP.can_edit ? `<p class="sm">指定责任人：<select onchange="helpSetOwner('${key}',this.value)"><option value="">选择</option>${HELP.users.map(x => `<option value="${x.id}">${esc(x.name)} · ${esc(x.role_name)}</option>`).join('')}</select></p>` : ''}</div>
  <p class="muted sm">版本 ${HV} · 指标口径和阈值读取系统当前配置</p>`;
}
async function helpOpen(key) {
  await helpLoad();
  modal(HELP_DOCS[key].t + ' · 说明', `<div class="hdoc">${helpBody(key)}</div><a class="btn primary" style="display:block;text-align:center;margin-top:12px" href="#/help/${key}">查看完整文档</a>`);
}
function helpAsk(key, kind) {
  const t = HELP_DOCS[key].t;
  modal(kind === 'unclear' ? '没看懂：' + t : '咨询：' + t, `<form id="hq"><textarea name="text" rows="4" maxlength="1000" placeholder="${kind === 'unclear' ? '哪里没看懂（选填）' : '写下你的问题'}"></textarea><button class="btn primary" style="margin-top:10px">发送给责任人</button></form>`, m => {
    m.querySelector('#hq').onsubmit = async e => { e.preventDefault(); let r; if (await act(async () => { r = await api('/help/ask', { key, title: t, kind, text: e.target.text.value }); })) { toast('已发送给 ' + r.owner); closeModal(); } };
  });
}
async function helpSetOwner(key, id) { if (id && await act(() => api('/help/owner', { key, user_id: Number(id) }), '已指定')) { HELP = null; await helpLoad(); helpOpen(key); } }
VIEWS.help = async arg => {
  HELP = null; await helpLoad(); const main = $('#main');
  if (arg === 'inbox') {
    const r = await api('/help/q'), row = (x, own) => `<div class="card"><b>${esc(x.kind === 'unclear' ? '没看懂' : '咨询')} · ${esc(x.title)}</b><p class="sm">${esc(own ? x.from : '责任人 ' + x.owner)} · ${esc(x.created_at)}</p><p>${esc(x.text || '（未填写）')}</p>
      ${x.reply ? `<p class="sm ok">回复：${esc(x.reply)}</p>` : own ? `<form data-id="${x.id}" class="hrep"><input name="reply" maxlength="1000" placeholder="回复"><button class="btn sm">回复</button></form>` : '<p class="muted sm">等待回复</p>'}</div>`;
    main.innerHTML = `<div class="pghd"><a class="back" href="#/help">‹</a><b>咨询与反馈</b></div><div class="sec-t2">我收到的（${r.inbox.filter(x => !x.reply).length} 条待回复）</div>${r.inbox.map(x => row(x, 1)).join('') || '<div class="empty">暂无</div>'}<div class="sec-t2">我提交的</div>${r.mine.map(x => row(x, 0)).join('') || '<div class="empty">暂无</div>'}`;
    main.querySelectorAll('.hrep').forEach(f => f.onsubmit = async e => { e.preventDefault(); if (await act(() => api(`/help/q/${f.dataset.id}/reply`, { reply: f.reply.value }), '已回复')) VIEWS.help('inbox'); });
    return;
  }
  if (arg && HELP_DOCS[arg]) { main.innerHTML = `<div class="pghd"><a class="back" href="#/help">‹</a><b>${esc(HELP_DOCS[arg].t)}</b></div><div class="hdoc">${helpBody(arg)}</div>`; return; }
  const list = kw => HELP_GROUPS.map(([g, ks]) => { const hit = ks.filter(k => !kw || JSON.stringify(HELP_DOCS[k]).includes(kw)); return hit.length ? `<div class="sec-t2">${g}</div><div class="card">${hit.map(k => `<a class="hrow" href="#/help/${k}"><b>${esc(HELP_DOCS[k].t)}</b><span class="muted sm">${esc(HELP_DOCS[k].use)}</span><span class="muted sm">责任人：${esc(HELP.owners[k]?.name || '未指定')}</span></a>`).join('')}</div>` : ''; }).join('')
    + `<div class="sec-t2">指标口径</div><div class="card"><table class="htbl"><tr><th>指标</th><th>计算口径</th><th>目标</th></tr>${Object.entries(METRICS).filter(([k, m]) => !kw || (k + m.calc + m.def).includes(kw)).map(([k, m]) => `<tr><td><a href="javascript:void 0" onclick="metricOpen('${k}')">${esc(k)}</a></td><td>${esc(hfill(m.calc))}</td><td>${esc(hfill(m.target))}</td></tr>`).join('')}</table></div>`;
  main.innerHTML = `<input id="hs" placeholder="搜索说明或指标，例如 授权、满编率" style="width:100%;margin-bottom:8px"><a class="btn sm" href="#/help/inbox">咨询与反馈</a><div id="hl">${list('')}</div>`;
  $('#hs').oninput = e => { $('#hl').innerHTML = list(e.target.value.trim()); };
};
