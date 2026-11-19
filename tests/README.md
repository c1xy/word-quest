# Word Quest · 自动化测试

本目录是 Word Quest（背单词 RPG，纯前端 ES5 多文件）的自动化测试基建，随仓库提交。
三个文件各司其职：

| 文件 | 形态 | 耗时 | 覆盖 |
| --- | --- | --- | --- |
| `unit.test.js` | node 直跑，无浏览器 | 秒级 | 存档 sanitize 坏档自愈、**存档迁移矩阵**（v1 时代无 xp/talents/poisonLog 档 / 中间时代缺部分字段档 / 损坏 JSON / 字段类型错误脏档 / 现代全字段档往返——逐一走真实 `loadSave` 通道断言字段补全·成就不误触·进度保留）、成就解锁条件、SRS 排程边界、**H. 间隔重复排程（r17）**：SM-2 lite 档位阶梯（新词→1天→3天→7天→成熟）逐档答对核对 st/due、答错降档且立即到期、到期队列今日边界 + 最逾期优先排序、sanitize srs 白名单与 `__proto__` 拦截、旧档缺 srs 字段向后兼容 + 首次作答自动入学、空态 `startSrsReview`；**I. 词景/音节/例句（r17）**：SCENE_CATS ≥6 类且每类 ≥10 条、显式/EMOJI_OF 派生词景、抽象词空景、音节拆分（mon·ster / e·le·phant / 半元音 y / 不发音 e / 非法输入）、例句填空模板稳定性；挑战码/成绩码/接力码/词境码编解码往返与坏码拒绝、词境参数边界、DEFLATE/base64url 管线 |
| `e2e.test.js` | playwright headless | 约 10-13 分钟 | 四组信息架构 12 入口、首访引导四态、投毒全链路（造毒→贴码→毒池→成绩码→回贴）、接力码全链路（战斗中导出→hash 恢复→run 级续接）、词境全链路（造境→生成码→贴码→开战→SRS 写回）、听写挑战、七种结算结构断言、S8 弹层按钮组/Esc 逃生/图鉴返回刷新一致性回归、S9 键盘可达性（Tab 序列含四组入口/Enter 激活/图鉴词行·配对卡·肉鸽卡可聚焦/弹层焦点管理与 Esc）、S10 色弱冗余标记（词性文字徽标/选项 ✓✕ 字形/对错色 protan-deutan 投影距离阈值）、S11 触屏目标 ≥44px（四组 IA 每按钮 + 主页/设置/图鉴/战斗/结算/词境实测 rect，checkbox 取 label 命中区）、S12 焦点管理专项（触屏仿真下遍历答题/商店/弹层开关/词境工坊/记忆配对，逐交互断言 `document.activeElement` 不落 BODY、键盘锚点在可交互元素或面板容器）、S13 触屏注入（页内合成 pointer 事件驱动记忆配对全流程：tap 翻牌/拖拽撞击/失配弹回/pointercancel 中断/收官续局+计时立即归零，配对结果与焦点双断言）、S14 动效状态机 & 动效预算（统一转场 tokens `--t-dur`/`--t-ease` 同源、主页首屏渐入错峰、全部 `@keyframes` 属性白名单扫描（transform/opacity/filter/box-shadow，禁 layout 属性混入——注意 @keyframes 容器的 `CSSRule.type` 是 7 不是 8）、连击换挡重锤/答错抖动/正确词延迟强调/失血三档警示类名状态机、结算数字滚动落位、横幅点按跳过、切屏回顶）、S15 连局压测（r16：同一页面不重载连打 10 局完整对局——主线/远征/肉鸽/听写/热座各 2 局混排，每局结算/收官后回主页；全程零 pageerror + JS heap 增长 ≤8MB（每局回主页后 CDP `HeapProfiler.collectGarbage` 强制 GC 再采样 `performance.memory`，增长取第 10 局−第 1 局同主页状态差值，`S15-HEAP` 行入基线））、**S16 间隔重复与记忆画像（r17）**：页内真实 `srsReview` 晋升链/降档核对、主页「今日待复习」入口计数与空态文案（无到期不空开局）、复习会话答对晋升/答错降档实时落盘（localStorage 读档核对 st/due）与复习完成结算（⬆️晋升/⬇️降档 chips）、记忆画像三行（词根拆解/无词根音节兜底/联想行）+ 例句填空首字母提示 aria-expanded 展开→揭晓、结算三词卡（错词入选·点击直达画像）、词景覆盖率统计（SCENE-STATS 行入基线）+ 题面显示规则（e2c 显示且与 `sceneOf` 一致、c2e 防泄题不显示）、连击 5 里程碑 fx 单词串与 `run.comboWords` 一致、**S17 r18 特效状态机**：答对金色粒子迸发（.fx-gold ≥10 粒且带 --dx 位移矢量）、连击边缘光晕（#combo-glow.glow-1/2/3 与 combo-heat-N 档位同步抬升/回落互斥）、BOSS 出场（boss-enter+boss-live+名牌 bossNameIn 压入、900ms 按怪身份摘类）与受击表情帧（BOSS_HIT_FACE 变体切换+.hit-face 挂载、430ms 回正）、背景分层视差（主页/战斗 .bg-far+.deco-layer 双层指针 translate3d、战斗远层随主题着色）、结算评级（grade-b 撤退封顶不撒花 / grade-S 全对局 120 粒 Confetti 撒花）、**S18 记忆效果验收链（r19）**：一条完整记忆闭环走真实 UI——v1 时代旧档（无 srs/wrongBook/firstRun/迁移标记）经真实 loadSave 迁移（排程表/错题本补全·题型迁移照跑·旧进度保留·老玩家不弹引导·迁移结果落盘）→ 复习局新词学习（答错 srs st=0 立即到期 + 错题本入册落盘，同词重考答对晋升 1 天档）→ 时间快进后主页入口计数/最逾期优先队列 → 「今日待复习」会话按队列作答晋升（1天→3天→7天→成熟，每次落盘核对 st/due/掌握度）→ 掌握度满 3 星自动攻克错题出册（wrongBook 清空 + 📕 toast）→ 成熟档 30 天回归未到期回空态 + 图鉴词详情「记忆档位 成熟」徽章与记忆画像三行联动；附 **S18-G 内容质量抽查**：2909 词全量走真实 `renderWordProfile` 统计词根拆解/联想/例句三行覆盖率（`PROFILE-STATS` 行入基线，r19 基线 root 549 / 音节 fallback 1815 / 联想·例句 2909/2909 / 词景 331）、无词根词音节 fallback 生效抽查 ≥20 词（音节行 a·b·c 格式与 `syllablesOf` 一致）、记忆画像与词景图联动（331/331 词景词的联想行首=词景 emoji+类别钩子逐词核对）、S-PERF 性能预算（主页加载 ≤3s / 首次可交互 ≤5s / JS heap 采样打印 `PERF-BASELINE` 行作后续轮次对比基线） |
| `monkey.test.js` | playwright headless | 约 2 分钟 | WQ 版 monkey：随机挑可见可点元素真实点击（含偶尔双击）+ 随机键盘注入（Tab/Enter/Esc/方向键/数字/字母，聚焦输入框乱打字），漫游主页四组入口→战斗→配对→图鉴等界面。硬门槛：**全程零 pageerror** + 动作量达标（按时长折算 ≥0.85 动作/秒，防假跑）+ 到过 ≥2 个界面（防原地打转）+ 结尾页面仍可交互；`console.error` 只打印不判失败（headless 语音/自动播放降级属正常日志）。时长可用 `WQ_MONKEY_MS` 环境变量覆盖（如 `WQ_MONKEY_MS=30000`） |
| `run-all.js` | 一键运行器 | — | 切到仓库根 → 按参数运行对应套件（默认 `all` = unit + e2e；`monkey` 需显式传参）→ 汇总判定，任何失败退出码非零 |

## 运行方法

```bash
# 全套回归（unit + e2e）
node tests/run-all.js

# 只跑其中一个
node tests/run-all.js unit
node tests/run-all.js e2e
node tests/run-all.js monkey     # 2 分钟随机漫游压测，发版前手动跑一次

# 单文件直跑
node tests/unit.test.js
node tests/e2e.test.js
node tests/monkey.test.js
WQ_MONKEY_MS=30000 node tests/monkey.test.js   # 快速冒烟 30 秒版
```

全部通过时退出码为 0；任何 FAIL（或子进程异常退出）退出码为 1。
输出里每个断言一行 `PASS/FAIL`，结尾有 `unit: PASS x / FAIL y` 与 `e2e: PASS x / FAIL y` 汇总行。

## 依赖

- **node ≥ 16**（无其他 npm 依赖；unit 不装任何包即可跑）。
- **e2e / monkey 需要 playwright**：按顺序探测 `playwright` → `playwright-core` → 全局
  `@playwright/cli` 自带的 playwright-core。都找不到时 **e2e / monkey 整组 SKIP**（退出码仍为 0，
  输出 SKIP 原因；unit 结果照常判定）。安装任一即可：
  ```bash
  npm i -D playwright        # 或 playwright-core（体积更小）
  ```
- **浏览器可执行文件**：依次探测 playwright 自带 chromium → 环境变量 `WQ_CHROME_PATH`
  → 本机 Chrome/Edge 常见安装路径（Windows）。都没有时 e2e 整组 SKIP。
  指定浏览器示例：
  ```bash
  WQ_CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" node tests/run-all.js
  ```

## 实现要点（改测试前先读）

- **unit 的切片/桩化加载**：`game.js` 是浏览器代码（顶层就有 `document.addEventListener`），
  unit.test.js 沿用 src-check 的手法——按节标题注释把被测源码切片，放进一个共享函数作用域
  （`with(桩环境)`）执行，与浏览器里多节共用顶层 `var` 的真实形态一致。切片边界用
  `/* ===== xxx ===== */` 节标题锚定，行号漂移不敏感；给 `game.js` 增删**节标题**时要同步改切片锚点。
  注意：切片内 `var BOSS_MODS` 等是 loader 局部绑定，从外部替换要走导出的闭包 setter
  （`xConsts.setBossMods`），直接改 `env.BOSS_MODS` 不生效。
- **e2e 的种子存档**：`newContext()` 用 `addInitScript` 注入 `localStorage` 种子。两个坑已踩过：
  1) 函数体会被序列化，模块闭包变量在页面里**不存在**，键名必须写字面量 `'wq_save_v1'`；
  2) 种子只落一次（`wq_seed_done` 标记），否则恢复存档后的 `location.reload()` 会把恢复档
  盖回种子。
- **e2e 的 hash 协议**：同一页面只换 `#r=...` hash 是软导航，不会重跑 `init()` 里的
  `relayCheckHash`——分片收集用例在每次 goto 后显式 `page.reload()`。
- **拼写题点击**：拼写 chip 带浮动 CSS 动画，坐标点击会被 playwright 的稳定性等待卡死
  （等计时到点反而弹记忆卡），`battleSpell` 改走页内 DOM `click()`（真实触发游戏自身
  onclick 处理器），每步前先关闭记忆卡弹层。
- **麦克风/摄像头用例的 graceful skip**：headless 环境若具备 `SpeechRecognition`（新版
  headless Chrome 会暴露 API），跟读行会显示——该断言按 SKIP 处理并说明原因；不具备时
  断言「跟读行自动隐藏」即游戏自身的降级路径。听写题面无语音包时自动降级为首字母提示，
  用例按降级路径照常作答。
- **静态服务器**：e2e 自带启动/停止逻辑（临时端口 + `Cache-Control: no-cache`，与
  `server.py` 同语义），无需手工起服务，跑完自动关闭。

## 与发版纪律的关系

- 这些测试不参与线上缓存：`sw.js` 预缓存清单不含 `tests/`，改动测试**不需要**递增 sw.js 版本号；
  但改动 `game.js / index.html / style.css / words.js / libs/*` 时必须按发版纪律递增
  `sw.js` 的 CACHE 版本并同步 `index.html` 的 `?v=` 时间戳。
- 历史 GUI 验证脚本（仓库外 `src-check/`）保留不删；`unit.test.js` 中标注
  「来源: src-check/xxx」的断言块整合自其中的精华场景。
