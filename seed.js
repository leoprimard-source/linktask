const D = require('./db');
const L = require('./lib');
const { q, q1, run, tx } = D;
const A = require('./audit');

function rnd(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; }

const ROLES = [
  ['区域经理', 'region_manager'], ['运营经理', 'ops_manager'], ['营销经理', 'sales_manager'], ['店长', 'store_manager'],
  ['店助', 'staff'], ['前台经理', 'staff'], ['前台高级', 'staff'], ['前台中级', 'staff'], ['前台初级', 'staff'],
  ['客房经理', 'staff'], ['客房高级', 'staff'], ['客房中级', 'staff'], ['客房初级', 'staff'],
  ['餐厅厨师', 'staff'], ['工程', 'staff'], ['PA', 'staff'], ['保安', 'staff'],
];
const SCENES = A.SCENES;
// [scene, role, title, standard, due, freq, freq_val, category, photo]
const TPLS = [
  ['前台', '店长', '店长晨会及当日工作分配', '09:00 前完成晨会，明确当日各场景负责人与重点事项，记录到交班本', '09:15', 'daily', null, 'ops', 0],
  ['前台', '前台经理', '早班交接班核对', '核对备用金、房卡、交班本遗留事项，三方签字', '08:30', 'daily', null, 'ops', 0],
  ['前台', '前台初级', '前台台面及大堂 5S 检查', '台面无杂物，宣传物料摆放整齐，绿植无枯叶', '09:00', 'daily', null, 'ops', 1],
  ['前台', '前台中级', '预抵客人核对及房间预分', '核对当日预抵名单、特殊需求，完成预分房', '11:00', 'daily', null, 'ops', 0],
  ['前台', '前台高级', '会员 / VIP 到店欢迎准备', '欢迎卡、欢迎水果、升级房确认', '14:00', 'daily', null, 'ops', 0],
  ['前台', '前台高级', '夜审报表与房态核对', '房态与系统一致，夜审报表无差异', '23:30', 'daily', null, 'ops', 0],
  ['前台', '前台经理', 'OTA 点评 24 小时内回复', '当日新增点评全部回复，差评同步店长', '16:00', 'daily', null, 'sales', 0],
  ['前台', '店长', '协议客户拜访 / 回访', '每周至少拜访或电话回访 3 家协议客户并记录', '16:00', 'weekly', 2, 'sales', 0],
  ['餐厅', '餐厅厨师', '早餐开餐前出品及餐台检查', '06:45 前所有菜品到位，温度达标，标签齐全', '06:45', 'daily', null, 'ops', 1],
  ['餐厅', '餐厅厨师', '早餐补餐巡检（不断档）', '每 15 分钟巡检一次，单品剩余不低于 1/3', '08:00', 'daily', null, 'ops', 1],
  ['餐厅', '餐厅厨师', '食品留样与效期检查', '每餐留样 ≥125g 保存 48 小时，临期食材下架', '10:00', 'daily', null, 'ops', 0],
  ['餐厅', '店助', '早餐满意度与损耗记录', '记录用餐人数、损耗、客人意见', '11:00', 'daily', null, 'ops', 0],
  ['餐厅', '餐厅厨师', '后厨收档清洁与燃气关闭', '台面地面清洁，燃气总阀关闭并拍照', '14:00', 'daily', null, 'ops', 1],
  ['客房', '客房经理', '客房早会及房态分配', '按退房与续住分配清扫任务，传达当日重点', '08:30', 'daily', null, 'ops', 0],
  ['客房', '客房初级', '布草送洗及收货点数', '送洗与回收数量一致，破损单独登记', '11:00', 'daily', null, 'ops', 0],
  ['客房', '客房中级', '退房房间清扫进度跟进', '14:00 前退房房间完成率 ≥90%', '14:00', 'daily', null, 'ops', 0],
  ['客房', '客房经理', 'OK 房抽查（≥10%）', '按标准抽查 OK 房，问题房当场返工', '15:00', 'daily', null, 'ops', 1],
  ['客房', '客房初级', '迷你吧及易耗品补充', '按标准配置补齐，过期品更换', '16:00', 'daily', null, 'ops', 0],
  ['客房', '客房高级', '计划卫生（每周一项）', '按计划完成本周项目（如地毯清洗、空调滤网）', '15:00', 'weekly', 3, 'ops', 1],
  ['公区', '店长', '店长全店巡视', '覆盖前台、餐厅、客房楼层、后场，问题当场下发', '15:00', 'daily', null, 'ops', 0],
  ['公区', 'PA', '大堂及电梯厅清洁巡查', '地面无水渍，电梯镜面无手印', '09:30', 'daily', null, 'ops', 1],
  ['公区', 'PA', '公共卫生间两小时巡检签到', '纸品充足、无异味，签到表按时填写', '12:00', 'daily', null, 'ops', 0],
  ['公区', '保安', '楼层走廊及消防通道检查', '消防通道无堆物，安全出口指示灯正常', '10:00', 'daily', null, 'ops', 0],
  ['外围', '保安', '停车场及外围秩序巡查', '车辆有序停放，外围无乱贴广告', '09:00', 'daily', null, 'ops', 0],
  ['外围', 'PA', '外围绿化及垃圾点整理', '垃圾桶无满溢，绿化带无垃圾', '15:30', 'daily', null, 'ops', 0],
  ['外围', '工程', '门头、灯箱、店招亮灯检查', '18:30 亮灯，无缺笔断字', '18:30', 'daily', null, 'ops', 1],
  ['后场', '工程', '设备机房巡检（水电气暖）', '记录水压、电表、锅炉温度，异常立即报修', '10:30', 'daily', null, 'ops', 0],
  ['后场', '店助', '员工通道及更衣室卫生检查', '无私人物品乱放，更衣柜整洁', '17:00', 'daily', null, 'ops', 0],
  ['后场', '保安', '消防设施周检', '灭火器压力、消防栓、喷淋头检查并签字', '16:00', 'weekly', 1, 'ops', 1],
  ['后场', '店助', '仓库物资月度盘点', '账实相符，差异说明', '16:00', 'monthly', 28, 'ops', 0],
];
const CHECKLIST = [
  ['前台', '仪容仪表与服务礼仪', 10], ['前台', '前台台面及大堂 5S', 10],
  ['餐厅', '早餐品种与补餐不断档', 15], ['餐厅', '食品安全与留样', 10],
  ['客房', 'OK 房抽查质量', 15], ['客房', '布草与易耗品管理', 10],
  ['公区', '大堂与公共卫生间清洁', 10], ['外围', '门头灯箱与停车秩序', 5], ['后场', '消防与设备安全', 15],
];
const STAFF = [
  ['店助'], ['前台经理'], ['前台高级'], ['前台中级'], ['前台初级'], ['客房经理'], ['客房高级'], ['客房中级'], ['客房初级'],
  ['餐厅厨师'], ['工程'], ['PA'], ['保安'],
];
const NAMES = ['张伟', '王芳', '李娜', '刘强', '陈静', '杨磊', '黄敏', '周杰', '吴婷', '徐刚', '孙丽', '马超', '朱琳',
  '胡军', '郭洁', '何勇', '高燕', '林涛', '罗佳', '郑浩', '梁雪', '谢斌', '宋颖', '唐亮', '韩梅', '冯凯', '曹雨',
  '彭飞', '曾慧', '董鹏', '萧然', '田甜', '袁博', '潘悦', '蒋帆', '蔡琴', '余晨', '杜宇', '叶青'];

function importAudit() {
  if (q1("SELECT 1 FROM templates WHERE src='audit'")) return;
  tx(() => {
    for (const n of SCENES) if (!q1('SELECT 1 FROM scenes WHERE name=?', n)) run('INSERT INTO scenes(name,sort) VALUES(?,?)', n, q1('SELECT COALESCE(MAX(sort),0)+1 m FROM scenes').m);
    const id = (t, n) => q1(`SELECT id FROM ${t} WHERE name=?`, n)?.id || null;
    for (const c of A.CLAUSES) run(`INSERT INTO templates(scene_id,role_id,title,standard,due_time,freq,freq_val,category,need_photo,src,code,area,sub,score,tag,m,l,f,need_value)
      VALUES(?,?,?,?,?,?,?,'ops',?,'audit',?,?,?,?,?,?,?,?,?)`, id('scenes', c.scene), id('roles', c.role), c.item, c.standard, c.due_time, c.freq, c.freq_val, c.need_photo,
      c.code, c.area, c.sub, c.score, c.tag, c.m, c.l, c.f, c.need_value);
  });
}

function ensureHR() {
  if (!q1("SELECT 1 FROM roles WHERE level='hr_manager'")) run("INSERT INTO roles(name,level,sort) VALUES('人事经理','hr_manager',2)");
  if (!q1("SELECT 1 FROM users u JOIN roles r ON r.id=u.role_id WHERE r.level='hr_manager'"))
    run("INSERT INTO users(name,role_id,region_id,store_id,phone) VALUES('沈悦',(SELECT id FROM roles WHERE level='hr_manager'),1,NULL,'13916882046')");
}

function seed() {
  if (q1('SELECT 1 FROM regions')) { importAudit(); ensureHR(); return false; }
  const T = L.today();
  const r = rnd(42);
  tx(() => {
    D.setSetting('reminder_times', ['10:00', '15:00', '21:00']);
    D.setSetting('escalate_minutes', 30);
    run("INSERT INTO regions(id,name) VALUES(1,'华东一区')");
    const stores = [[1, '上海虹桥店', 'SH-HQ', '上海市闵行区申长路 88 号'], [2, '上海静安店', 'SH-JA', '上海市静安区南京西路 1266 号'], [3, '杭州西湖店', 'HZ-XH', '杭州市西湖区北山街 25 号']];
    for (const s of stores) run('INSERT INTO stores(id,region_id,name,code,address) VALUES(?,1,?,?,?)', ...s);
    for (const [id, v] of Object.entries({ 1: ['全季 4.0', '直营店', '2021-06-18', 168], 2: ['全季 4.0', '加盟店', '2022-09-30', 132], 3: ['全季 3.6', '加盟店', '2019-04-26', 205] })) run('UPDATE stores SET brand=?, stype=?, open_date=?, rooms=? WHERE id=?', ...v, Number(id));
    ROLES.forEach(([n, l], i) => run('INSERT INTO roles(name,level,sort) VALUES(?,?,?)', n, l, i));
    const rid = n => q1('SELECT id FROM roles WHERE name=?', n).id;
    SCENES.forEach((n, i) => run('INSERT INTO scenes(name,sort) VALUES(?,?)', n, i));
    const sid = n => q1('SELECT id FROM scenes WHERE name=?', n).id;
    for (const t of TPLS) run('INSERT INTO templates(scene_id,role_id,title,standard,due_time,freq,freq_val,category,need_photo) VALUES(?,?,?,?,?,?,?,?,?)',
      sid(t[0]), rid(t[1]), t[2], t[3], t[4], t[5], t[6], t[7], t[8]);
    for (const c of A.CLAUSES) run(`INSERT INTO templates(scene_id,role_id,title,standard,due_time,freq,freq_val,category,need_photo,src,code,area,sub,score,tag,m,l,f,need_value)
      VALUES(?,?,?,?,?,?,?,'ops',?,'audit',?,?,?,?,?,?,?,?,?)`, sid(c.scene), rid(c.role), c.item, c.standard, c.due_time, c.freq, c.freq_val, c.need_photo,
      c.code, c.area, c.sub, c.score, c.tag, c.m, c.l, c.f, c.need_value);
    const addUser = (name, role, store) => Number(run('INSERT INTO users(name,role_id,region_id,store_id,phone) VALUES(?,?,1,?,?)', name, rid(role), store, '138' + String(10000000 + Math.floor(r() * 89999999))).lastInsertRowid);
    addUser('王建国', '区域经理', null);
    addUser('李敏', '运营经理', null);
    addUser('赵磊', '营销经理', null);
    const m1 = addUser('陈峰', '店长', null);
    const m2 = addUser('刘洋', '店长', null);
    run('INSERT INTO user_stores VALUES(?,1),(?,2),(?,3)', m1, m1, m2);
    let ni = 0;
    for (const s of [1, 2, 3]) for (const [role] of STAFF) addUser(NAMES[ni++ % NAMES.length], role, s);
    // scene owners: 前台→前台经理, 餐厅→厨师, 客房→客房经理, 公区→店助, 外围→保安, 后场→工程
    const ownerRole = { 前台: '前台经理', 餐厅: '餐厅厨师', 客房: '客房经理', 公区: '店助', 外围: '保安', 后场: '工程', 营业功能区: '客房经理' };
    for (const s of [1, 2, 3]) for (const sc of SCENES) {
      const u = q1('SELECT id FROM users WHERE store_id=? AND role_id=?', s, rid(ownerRole[sc]));
      run('INSERT INTO scene_owners VALUES(?,?,?)', s, sid(sc), u.id);
    }
    // 静安店的店助同时承接餐厅满意度记录 → 改派前台经理（示范店长自定义分配）
    const tplSat = q1("SELECT id FROM templates WHERE title LIKE '早餐满意度%'").id;
    run('INSERT INTO assignments VALUES(2,?,?)', tplSat, q1('SELECT id FROM users WHERE store_id=2 AND role_id=?', rid('前台经理')).id);

    // focus task from a past patrol at 西湖店
    const rm = 1;
    const chef3 = q1('SELECT id FROM users WHERE store_id=3 AND role_id=?', rid('餐厅厨师')).id;
    const p1 = Number(run("INSERT INTO patrols(store_id,planned_date,reason,status,score,summary,created_by,created_at,done_at) VALUES(3,?,?, 'done', 78, ?, 1, ?, ?)",
      L.addDays(T, -6), '近 7 日完成率偏低，早餐投诉 2 起', '早餐 8:20 左右热菜断档 2 个品种，补餐不及时；OK 房抽查 2 间卫生间有毛发。', L.addDays(T, -8) + ' 10:00', L.addDays(T, -6) + ' 11:30').lastInsertRowid);
    const FAILS = { '020': '8:20 热菜断档 2 个品种，补餐不及时', '019': '特色品种未按标准出品', '029': '抽查 2 间 OK 房卫生间有毛发', '101': '早餐高峰地面有残渣未及时清理',
      '047': '1 间客房一次性用品缺牙刷', '119': '早餐宣传牌信息过期' };
    const NA = new Set(['049', '113', '201']);
    let earned = 0, maxSum = 0;
    for (const c of A.CLAUSES) {
      const result = NA.has(c.code) ? 'na' : FAILS[c.code] ? 'fail' : 'pass';
      if (result !== 'na') { maxSum += c.max; if (result === 'pass') earned += c.max; }
      run('INSERT INTO patrol_items(patrol_id,scene_id,item,score,max,comment,code,tag,result) VALUES(?,?,?,?,?,?,?,?,?)', p1, sid(c.scene), c.item,
        result === 'pass' ? c.max : 0, c.max, FAILS[c.code] || '', c.code, c.tag, result);
    }
    run('UPDATE patrols SET score=? WHERE id=?', Math.round(earned * 100 / maxSum), p1);
    run("INSERT INTO flex_tasks(store_id,scene_id,title,standard,assignee_id,recur,start_date,end_date,due_time,need_photo,source,created_by,created_at,ref) VALUES(3,?,?,?,?,'daily',?,?,'09:00',1,'focus',?,?,?)",
      sid('餐厅'), '【重点跟踪】每日 9:00 早餐不断档检查', '9:00 拍照上传早餐台全景，所有热菜、主食剩余量不低于 1/3', chef3, L.addDays(T, -5), L.addDays(T, 24), rm, L.addDays(T, -6) + ' 12:00', 'patrol:' + p1);
    run("INSERT INTO patrols(store_id,planned_date,reason,status,created_by,created_at) VALUES(3,?,?,'planned',1,?)", L.addDays(T, 2), '复查早餐断档整改效果', L.addDays(T, -1) + ' 18:00');
    run("INSERT INTO patrols(store_id,planned_date,reason,status,created_by,created_at) VALUES(2,?,?,'planned',1,?)", L.addDays(T, 4), '例行季度巡店', L.addDays(T, -1) + ' 18:05');

    // flex tasks by store managers
    const fd = q1('SELECT id FROM users WHERE store_id=1 AND role_id=?', rid('前台经理')).id;
    run("INSERT INTO flex_tasks(store_id,scene_id,title,standard,assignee_id,recur,recur_val,start_date,due_time,source,created_by,created_at) VALUES(1,?,?,?,?,'weekly',5,?,'17:00','flex',?,?)",
      sid('前台'), '周五团队房预排及接待准备', '核对周末团队名单、分房、早餐券', fd, L.addDays(T, -20), m1, L.addDays(T, -20) + ' 09:00');
    const eng2 = q1('SELECT id FROM users WHERE store_id=2 AND role_id=?', rid('工程')).id;
    run("INSERT INTO flex_tasks(store_id,scene_id,title,standard,assignee_id,recur,start_date,due_time,need_photo,source,created_by,created_at) VALUES(2,?,?,?,?,'once',?,'16:00',1,'flex',?,?)",
      sid('客房'), '8 楼 806 空调异响维修', '维修完成后试机 30 分钟并拍照', eng2, T, m1, T + ' 08:40');
  });

  // a leave today: 虹桥店 前台初级休息，由前台中级承接（平级）, 静安客房初级休息由客房经理向上承接
  const rid2 = n => q1('SELECT id FROM roles WHERE name=?', n).id;
  const u1 = q1('SELECT id FROM users WHERE store_id=1 AND role_id=?', rid2('前台初级')).id;
  const c1 = q1('SELECT id FROM users WHERE store_id=1 AND role_id=?', rid2('前台中级')).id;
  const u2 = q1('SELECT id FROM users WHERE store_id=2 AND role_id=?', rid2('客房初级')).id;
  const c2 = q1('SELECT id FROM users WHERE store_id=2 AND role_id=?', rid2('客房经理')).id;
  run('INSERT INTO leaves(user_id,date,cover_user_id,note,created_by) VALUES(?,?,?,?,4)', u1, T, c1, '轮休');
  run('INSERT INTO leaves(user_id,date,cover_user_id,note,created_by) VALUES(?,?,?,?,4)', u2, T, c2, '病假');
  // history: last 14 days
  const storeQuality = { 1: 0.93, 2: 0.88, 3: 0.74 };
  const tplInfo = Object.fromEntries(q('SELECT id, m, need_value FROM templates').map(t => [t.id, t]));
  const CHECK_RATE = { M1: 0, M2: 0.9, M3: 0.25, M4: 0.3 };
  for (let d = -14; d <= 0; d++) {
    const date = L.addDays(T, d);
    D.ensureInstances(date);
    if (d === 0) continue;
    const rows = q('SELECT * FROM instances WHERE date=?', date);
    tx(() => {
      for (const it of rows) {
        let p = storeQuality[it.store_id];
        if (it.store_id === 3 && it.scene_id === 2 && d < -6) p -= 0.25;
        if (it.origin === 'focus') p = 0.85;
        if (r() < p) {
          const late = r() < 0.15 ? 25 : -Math.floor(r() * 20);
          const doneAt = date + ' ' + L.addMinutes(it.due_time, late);
          let check = null, comment = null, by = null;
          const ti = it.src === 'tpl' ? tplInfo[it.src_id] : null;
          if (r() < (ti && ti.m ? CHECK_RATE[ti.m] : 0.25)) {
            const bad = r() < (it.store_id === 3 ? 0.3 : 0.1);
            check = bad ? 'bad' : 'good';
            comment = bad ? '未达标准：' + (it.need_photo ? '照片显示现场不达标' : '记录不完整') : '执行到位，继续保持';
            by = D.storeManagers(it.store_id)[0];
          }
          run("UPDATE instances SET status='done', done_at=?, done_note=?, check_result=?, check_comment=?, checked_by=?, checked_at=? WHERE id=?",
            doneAt, r() < 0.3 ? '已按标准完成' : '', check, comment, by, check ? date + ' 17:30' : null, it.id);
          if (it.need_photo) run("UPDATE instances SET photo='/demo-photo.svg' WHERE id=?", it.id);
          if (ti && ti.need_value) run('UPDATE instances SET reading=? WHERE id=?', `巡检 ${12 + Math.floor(r() * 6)} 个点位，异常 ${r() < 0.15 ? 1 : 0} 处`, it.id);
          if (check === 'bad') {
            const dl = L.addDays(date, 3);
            const closed = dl < T && r() < 0.7;
            run(`INSERT INTO rectifications(instance_id,store_id,assignee_id,reason,training,task,deadline,status,created_by,created_at,submit_note,submitted_at,verify_comment,verified_by,verified_at)
              VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, it.id, it.store_id, it.assignee_id, comment, '由店长现场复训标准流程 15 分钟', '按标准重新执行并拍照上传', dl,
              closed ? 'closed' : 'open', by, date + ' 17:30', closed ? '已整改完成' : null, closed ? L.addDays(date, 2) + ' 10:00' : null, closed ? '复查合格' : null, closed ? by : null, closed ? L.addDays(date, 2) + ' 16:00' : null);
          }
        } else if (r() < 0.2) {
          // left pending (missed)
        }
      }
    });
  }
  // today: early tasks done
  const now = L.nowHM();
  const todayRows = q("SELECT * FROM instances WHERE date=? AND due_time<?", T, now);
  tx(() => { for (const it of todayRows) if (r() < storeQuality[it.store_id]) run("UPDATE instances SET status='done', done_at=?, photo=CASE WHEN need_photo=1 THEN '/demo-photo.svg' END WHERE id=?", T + ' ' + L.addMinutes(it.due_time, -5), it.id); });
  D.refreshPending(1); D.refreshPending(2);
  run('UPDATE instances SET escalated=1 WHERE date<=?', T);
  run('UPDATE rectifications SET escalated=1');
  D.notify([4], 'escalate', '超时升级：早餐补餐巡检（不断档）', '上海静安店 应于 08:00 完成，已超时 30 分钟以上。', '#/tasks?store=2');
  D.notify([5], 'escalate', '整改逾期：杭州西湖店', '按标准重新执行并拍照上传（已过截止日期）', '#/rect');
  D.notify([1, 2], 'system', '欢迎使用宏图计划', '这是演示数据：3 家门店、近 14 天的任务记录（已融合品牌审计 202 条 M-L-F 分解）、1 次已完成巡店和 1 个重点跟踪任务。', '#/standards');
  D.audit(1, null, '初始化', '载入演示数据');
  ensureHR();
  return true;
}
module.exports = { seed };
