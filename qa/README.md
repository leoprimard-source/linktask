# qa：演示数据生成与测试脚本

所有脚本都在**数据副本**上运行，不要指向正式数据目录。Node 22+（使用内置 `node:sqlite`）。

## 启动测试服务
```bash
bash qa/start.sh 3130 /path/to/data-copy 0          # 端口 数据目录 [拨时间天数] [fresh]
SRC_DATA=/path/to/src bash qa/start.sh 3130 /tmp/lt-test 0 fresh   # 先复制再启动
```
`fake-date.js` 通过 `LT_OFF_DAYS` 把系统日期前后拨若干天，用于测试逾期、上手天数等。

## 生成数据
| 脚本 | 用途 |
|---|---|
| `grow.js` | 把 4 店演示数据扩成 12 店、6 位店长、约 90 天历史：`DATA_DIR=副本目录 node qa/grow.js` |
| `prov.js` | 从 12 店副本生成省区 300 店压测数据（10 个区域、储备区域经理、储备店长）：`DATA_DIR=副本目录 DAYS=30 node qa/prov.js` |
| `scale.js` / `perf.js` | 克隆门店做规模压测与接口耗时 |

## 接口测试（服务需先启动；`P`=端口，`DB`=该服务的数据库文件）
| 脚本 | 覆盖 |
|---|---|
| `flow.js` | 任务流转与越权（26 项） |
| `stage.js` | 店长分阶段、授权阶梯、负一层审批、储备店长（27 项） |
| `shift.js` | 24 小时排班、规则检查、发布、在岗、打卡、任务按班次派发（14 项） |
| `leak.js` | 跨区域越权探测：`P=3120 DB=... node qa/leak.js <uid>` |
| `sweep.js` | 全角色 GET 矩阵 |
| `xss.js` | 输入转义 |

例：`P=3130 DB=/tmp/lt-test/linktask.db node qa/flow.js`

## 界面检查（390px 手机宽度）
需要 `playwright-core` 和 Chrome：`PW_CORE=/path/to/playwright-core CHROME=/path/to/chrome`。
- `audit2.js '[[uid,"route","name"],...]'`：逐个身份打开页面，记录 JS 错误和 4xx/5xx 接口，截图到 `SHOTS` 目录（默认 qa/）。
- `order.js`：检查店长首页、团队页的板块顺序。

脚本里默认端口为 3120（300 店）或 3103/3130（12 店），可用 `P` 覆盖。

## 宁镇省区（真实架构）
- `ningzhen.js`：在一份全新的 12 店副本上导入真实省区架构（306 店、11 位城市总、260 位店长、省区职能岗），表里没有的人保持虚拟，名字后带 `\u2063虚` 标记，前端显示为小字「虚」。人员表先导出为 JSON：`{ fn: [[岗位, 姓名]], hotels: [[酒店, 城市总, 店长]] }`，用法 `DATA_DIR=dir NZ_JSON=nz.json DAYS=30 node qa/ningzhen.js`。真实人员表不进仓库。
- `mask.js`：对外分享前把真名打码（严古梅 → 严*梅），用法 `DATA_DIR=dir node qa/mask.js`。
