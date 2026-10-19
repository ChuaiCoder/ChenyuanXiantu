# 架构与 v11 优化

项目保持服务端权威、单进程、单世界。多个浏览器操作同一角色；当前没有账号或多世界隔离。

## 依赖方向

- `shared/data.js`、各 `*-data.js`：配置与不依赖角色公式的描述。
- `shared/format.js`：无状态格式化函数；`data.js` 暂时重导出旧接口以兼容调用方。
- `shared/life.js`、`inventory.js`、`roots.js`、`combat.js`、`relic-state.js`：领域规则。
- `shared/state.js`：组合公式，兼容重导出状态创建及迁移接口。
- `shared/state-schema.js`：新角色默认值、旧版本状态规范化。
- `shared/presentation.js`：用规则生成丹药和场景选项文案；选项返回新对象。

配置不再导入状态公式，原七个共享模块组成的循环依赖已解除。行商展示与扣款共用 `merchantPrices`。测试检查共享模块依赖无环，防止新增配置再次反向引用规则。

## 写入与存档

丹药数量只能通过 `addPills`、`removePills`、`takePill` 更新；分阶丹药同时更新药阶和供 UI 使用的总量。采集、奇遇、炼丹、商店交付、寻道支付、战斗和突破均使用这些入口。批量扣除先确认可支付，再一次提交；寻道优先消耗低阶丹药，战斗按开战时选定的药阶扣除。

`syncPillGrades` 仅用于 v10 及更早存档的单次迁移，不再用于正常操作或序列化。v11 在迁移前检查库存一致性，矛盾数据不能通过重新分配药阶掩盖。存档外层 `saveVersion: 1` 不变，角色结构版本为 `S.v: 11`；旧版服务端不能读取 v11 存档。

`Engine.serialize()` 返回独立快照，不初始化寿元、不修补库存。新角色尚未入世或推进世界时可以保留空寿元账本；入世、战斗、衰老或寿元操作负责初始化。已有账本和旧世历史损失按原有迁移规则保留。

保存时间先写到快照，主档和镜像均写入成功后才更新内存中的 `lastTs`。继续沿用临时文件、flush、rename 和写入失败暂停/重试机制。`.bak` 是最新快照的镜像，不是历史版本；两个文件不构成跨文件事务。恢复依然先验证新引擎，成功后整体替换当前引擎。

## 指令与连接

系统指令在实际执行后返回成功，拒绝操作返回失败；概率突破失败也属于已执行。`executeAction` 统一转换为 `{ok, changed, reasonCode, message}`，旧 `dispatchAction` 保留布尔接口。条件拒绝产生的提示日志不算玩法状态提交，按周期保存。

WebSocket 接受旧的 `{type:'act', act}`，新版客户端增加可选字符串 `requestId`。关键指令只有 `changed` 时保存，写盘完成后才发送对应 `actionResult`；写盘失败返回 `storage_unavailable` 并暂停推进。高频修炼仍采用周期保存，不将其回执解释为逐次落盘保证。相同战斗偏好等无变化设置返回成功但不即时保存。

前端传输模块不依赖 Vue，创建时不连接。页面挂载调用 `startConnection`，卸载及开发热替换调用 `stopConnection`，停止时清除重试与心跳。断线后，旧 socket 的迟到消息不会覆盖新状态；首次收到快照后才允许发送操作。完整日志随状态帧发送，移除重复的 `logDelta`。

## 桌面外壳（Electron）

`electron/main.mjs` 把整套服务原样装进桌面进程，前端不做任何分叉：

- 主进程挑选空闲端口（31700 起），以 `ELECTRON_RUN_AS_NODE=1` + `process.execPath` 把 `server/index.mjs` 作为子进程拉起（生产模式服务 `dist/`），存档指向 `app.getPath('userData')/save.json`，与浏览器版默认存档互不影响。
- 就绪探测用 HTTP 轮询本地端口；服务意外退出时弹窗提示并退出，不留空白窗口。退出时同步结束子进程。
- 渲染进程加载 `http://127.0.0.1:<port>/`，WebSocket 地址仍由 `location.host` 推导，因此与浏览器版共用同一套连接层与全部玩法逻辑。
- 单实例锁：第二个实例直接退出并聚焦已有窗口。存档锁只保证跨进程互斥，桌面版仍希望用户只开一个窗口。
- 无边框窗口用 `titleBarStyle: 'hidden'` + `titleBarOverlay`；前端检测到 `window.gameShell.desktop`（由 `electron/preload.cjs` 注入）时渲染顶栏，并通过 IPC `titlebar-theme` 让系统窗口按钮跟随三套主题换色。浏览器访问时该对象不存在，样式与行为完全不变。
- 受限环境（虚拟机 / 容器 / 受管控桌面）中 Chromium 沙箱会让 GPU 进程反复崩溃（`exit_code=-1073741819`）并直接结束应用，故默认 `--no-sandbox`；应用只加载本地打包内容，不访问外部页面，`XY_ENABLE_SANDBOX=1` 可恢复沙箱。

两个必须遵守的构建约束：

- `package.json` 声明了 `"type": "module"`，此时 Electron 主进程入口必须是 ESM；若改用 `.cjs`，Electron 会退化为普通 Node 运行，`require('electron')` 只能拿到 npm 包。
- Electron 内置模块是 CJS 实现，ESM 具名导入（`import { app } from 'electron'`）在部分版本下会解析到 `node_modules/electron`（只导出二进制路径）。`main.mjs` 统一用 `createRequire` 取 `app/BrowserWindow`。

打包使用 `electron-builder`：`asar: false`（子进程需直接读取 `server/`、`shared/` 文件），`electronDist` 指向 `node_modules/electron/dist` 复用已解压的 Electron —— 既省去重复下载，也避开在部分环境（实时扫描占用句柄）下「解压到 `.tmp` 再改名」这一步的 `EPERM` 失败。

## 本次开源评估（2026-09-16）

承接战斗设计稿第 21 节的四项目评估，本轮另比较以下工程实现；维护时间来自本次 GitHub 仓库元数据，未进行完整第三方依赖安全审计。

| 实现与源码 | 许可证和维护状态 | 决策、成本及风险 |
| --- | --- | --- |
| [Redux createStore](https://github.com/reduxjs/redux/blob/master/src/createStore.ts) | MIT；未归档；最近推送 2026-09-08 | 阅读 dispatch 输入校验、reducer 调用和订阅通知顺序，采用明确提交边界的思路。当前引擎存在大量可变领域状态，整体引入 Redux 需要重写系统和旧档接口；本轮保留现有引擎，不增加框架，也不复制源码。官方源码建议新 Redux 项目使用 Toolkit，不采用旧 createStore 作为新依赖。 |
| [npm/write-file-atomic](https://github.com/npm/write-file-atomic/blob/main/lib/index.js) | ISC；未归档；最近推送 2026-07-02 | 阅读临时文件、fsync、rename、同文件写入排队和失败清理。项目已有同步单写者存档实现，可复用现有能力；不为单进程写档增加异步排队依赖。本轮修复保存时间的提交顺序并加入真实失败测试。其原子性仍按单文件计算，也不能提供两个文件的事务。 |

优先复用现有成熟模块和 Node 文件 API，没有复制第三方源码或增加运行时依赖。

## 验证与后续边界

`npm test` 包含 132 项系统断言及 98 项 Node 回归测试，覆盖配置依赖、纯快照、混合药阶、旧档迁移、损坏新档、操作回执、写盘失败、连接清理及真实 WebSocket 流程。`npm run build` 验证生产前端。测试使用临时或独立存档。

Playwright 使用独立端口和测试存档检查入世、丹器描述、炼丹即时更新、满气血服药拒绝和刷新重连后库存保留。390px 手机页面没有横向溢出，浏览器控制台没有错误或警告。截图：`output/playwright/architecture-mobile.png`；自动测试记录：`output/architecture-final-test.txt`。默认游戏存档未用于测试。

本轮没有改变灵根、筑基上限、十五分钟一年、战败折寿或半自动战斗的数值规则。现有 Engine prototype 混入、分散的主活动字段、世界推进大方法仍保留；tick 的关键保存判断仍借助日志和战斗字段。后续应迁移为明确的领域事件和集中活动转换，再逐步下放世界推进职责；不将本轮描述为所有系统已经完全隔离。

## 过时代码清理（2026-09-16）

按实际调用、Vue 模板、协议动作与回归测试交叉检查，移除了无调用的旧寿元/战斗公式、道果辅助方法、飞升别名和闲置变量。飞升测试改用现行 `openRealm` / `prepare` 入口，仍覆盖道基上限与材料要求。战斗计时和读档校验共用 `ROUND_SECONDS`，回合时长保持 1.6 秒。

`App.vue` 直接使用 `CombatPage.vue`，删除只转发组件的 `TaoPage.vue`；清除旧讨伐界面及未实现悬停提示框的样式，保留动态特效样式。战斗按钮每项只计算一次行动信息。

历史浏览器版及三个失效调试/截图脚本经 SHA-256 校验后归档至 `output/archives/legacy-code-20260916.zip`，不再混入当前源码。正式回归和节奏分析工具保留。旧存档战斗结算、旧筑基材料与灵根兼容逻辑仍参与恢复，不能按“旧版”字样删除。此次仅清理已确认的冗余代码，无需新增依赖或改变现行玩法。

清理后验证：132 项系统断言和 98 项 Node 回归全部通过，生产构建通过（47 个模块）。记录见 `output/cleanup-test.txt` 和 `output/cleanup-build.txt`；本次未重新进行浏览器交互检查。

## 重启存档保护（2026-09-17）

现场存在持续写入 v5 角色快照的旧服务：主档反复回到第 3 世、余寿 0，而 `.bak` 是已进入第 4 世且仍有余寿的 v11 完整快照。因此新服务每次读主档都会恢复死亡状态。现场原档已另存 `output/restart-investigation/`，停止旧进程后已从有效备份恢复；不以增加寿元或自动转世掩盖存档覆盖。

服务在读档前取得覆盖整个进程生命周期的存档锁。路径解析到真实位置，同一存档即使使用不同端口也互斥。正常退出释放锁；异常退出后以 10 秒过期阈值、2 秒心跳和最多 12 次间隔 1 秒的重试接管。HTTP 监听成功后才启用自动保存和退出保存，端口冲突等启动失败不会写回快照。锁失效按库默认行为终止进程，不继续写入。

本次比较 [proper-lockfile](https://github.com/moxystudio/node-proper-lockfile) 与 [npm/lockfile](https://github.com/npm/lockfile) 的官方说明、源码及 npm 发布元数据：前者 MIT、4.1.2 发布于 2021-01-25，后者 ISC、1.0.4 发布于 2018-04-17，均已多年未发布新版。前者提供原子建目录、持续更新 mtime、锁失效检测和退出清理；后者以排他创建文件及 ctime 判断过期，缺少适合长期服务的心跳。直接复用并锁定 `proper-lockfile@4.1.2`，增加 3 个间接依赖；未复制第三方源码，安装禁用脚本。此评估不代表完整安全审计。

锁是合作式保护：不遵守锁协议的历史进程仍须停止；不能在服务运行时手动删除锁目录，也不能用不同过期参数同时访问同一存档。真实子进程测试覆盖连续异常退出重启、不同端口争用同一存档、端口冲突和失败启动后的锁释放。

验证结果：132 项系统断言、101 项 Node 回归及生产构建全部通过；记录位于 `output/restart-investigation/full-tests.txt` 和 `build.txt`。默认存档已在互斥锁内从现场备份恢复，并重新读档核对完整角色状态；恢复记录为 `output/restart-investigation/recovery.json`。未额外启动后台游戏服务，用户可在自己的终端运行启动命令。
