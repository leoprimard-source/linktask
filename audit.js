// 品牌审计 202 条 × M-L-F 分解 → 门店固定运营工作（场景、默认岗位、频次、时间、留证方式）
const RAW = require('./data/brand_audit_2026q3.json');

const M_TEXT = { M1: '店长亲做', M2: '下级做·店长复查', M3: '多层分工·店长抽查', M4: '群拍反馈' };
const M_DESC = { M1: '店长亲做 + 亲反馈', M2: '减一层亲做 + 店长复查', M3: '多层分工 + 店长抽查', M4: '制度化群反馈（机制化入群）' };
const L_TEXT = { L1: '动作层', L2: '质量层', L3: '判断层' };
const F_TEXT = { F1: '记录', F2: '拍照', F3: '计量', F4: '群拍', F5: '质量看板', F6: '判断标签' };
const AREA_SCENE = { 大堂: '前台', 客房: '客房', 餐厅: '餐厅', 后场: '后场', 公共: '公区', 外围: '外围', 营业功能区: '营业功能区' };
const SCENES = ['前台', '餐厅', '客房', '公区', '外围', '后场', '营业功能区'];

const ENG1 = /水泵|消防水|排烟/;
const SEC = /消防|监控|安全门|疏散|避难|安全指示|应急灯|针孔|小卡片|禁烟|消火栓|梯控|演练|酒店正门/;
const ENG = /机房|电梯|空调|水箱|网络|WIFI|电视|水压|热水|照明|店招|外立面|墙面吊顶|天花|液化气|天然气|油烟|电工|信号|设备|线路|纱窗|窗户|硬件破损|维保|易巡检|净水器|仓库、/;
const BREAKFAST = /早餐|餐台|牛奶|鸡蛋|明档|器皿|城市味道/;

const num = c => Number(c.code);
const pick = (c, arr) => arr[num(c) % arr.length];
const scoreOf = c => (/^\d+$/.test(c.score) ? Number(c.score) : 0);
const hasF = (c, f) => c.f.split('+').includes(f);

function dept(c) {
  const s = c.sub + ' ' + c.item;
  if (ENG1.test(s)) return '工程';
  if (SEC.test(s)) return '保安';
  if (ENG.test(s)) return '工程';
  const sub = c.sub.split(/[/、]/)[0];
  if (/厨房|餐厅/.test(sub)) return '餐厅';
  if (/客房|卫生间|布草间|消毒间|楼层走道|洗衣房|健身房/.test(sub)) return '客房';
  if (/前台|大堂/.test(sub)) return '前台';
  if (sub === '公区') return c.m === 'M3' ? 'PA' : '店助';
  return '店助';
}
const ROLE_FIX = { '031': '客房经理', '177': '客房高级' };
function role(c) {
  if (ROLE_FIX[c.code]) return ROLE_FIX[c.code];
  if (c.m === 'M1') return '店长';
  const d = dept(c);
  if (d === '前台') return c.m === 'M2' ? '前台经理' : c.m === 'M4' ? '前台高级' : pick(c, ['前台初级', '前台中级', '前台高级']);
  if (d === '客房') return c.m === 'M2' ? '客房经理' : c.m === 'M4' ? '客房高级' : pick(c, ['客房初级', '客房中级', '客房高级']);
  if (d === '餐厅') return '餐厅厨师';
  return d;
}
function freq(c) {
  const s = c.sub + c.item;
  if (hasF(c, 'F3')) return ['daily', null];
  if (c.m === 'M1') return ['monthly', 1 + (num(c) % 28)];
  if (c.tag === '清零项' || c.tag === '重点项') return ['daily', null];
  if (c.m === 'M4' && /消防|监控|液化气|天然气|消火栓|应急/.test(s)) return ['daily', null];
  return ['weekly', 1 + (num(c) % 7)];
}
function due(c, r) {
  const fix = { 店长: '10:00', 前台经理: '11:00', 客房经理: '15:00', 工程: '10:30', 保安: '09:30', 店助: '16:00', PA: '11:30' };
  if (fix[r]) return fix[r];
  if (r === '餐厅厨师') return BREAKFAST.test(c.sub + c.item) ? '07:00' : '13:30';
  if (r.startsWith('前台')) return c.tag === '重点项' ? '20:00' : '10:30';
  return '14:30';
}

const CLAUSES = RAW.map(c => {
  const area = c.area.split('/')[0].replace('区域', '');
  const r = role(c), [fq, fv] = freq(c);
  return { ...c, scene: AREA_SCENE[area] || '后场', role: r, freq: fq, freq_val: fv, due_time: due(c, r),
    need_photo: hasF(c, 'F2') || hasF(c, 'F4') ? 1 : 0, need_value: hasF(c, 'F3') ? 1 : 0, max: scoreOf(c) };
});

module.exports = { CLAUSES, SCENES, M_TEXT, M_DESC, L_TEXT, F_TEXT, scoreOf };
