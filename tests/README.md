# Word Quest · 自动化测试

本目录是 Word Quest（背单词 RPG，纯前端 ES5 多文件）的自动化测试基建，随仓库提交。
三个文件各司其职：

| 文件 | 形态 | 耗时 | 覆盖 |
| --- | --- | --- | --- |
| `unit.test.js` | node 直跑，无浏览器 | 秒级 | 存档 sanitize 坏档自愈、成就解锁条件、SRS 排程边界、挑战码/成绩码/接力码/词境码编解码往返与坏码拒绝、词境参数边界、DEFLATE/base64url 管线 |
| `e2e.test.js` | playwright headless | 约 5-8 分钟 | 四组信息架构 12 入口、首访引导四态、投毒全链路（造毒→贴码→毒池→成绩码→回贴）、接力码全链路（战斗中导出→hash 恢复→run 级续接）、词境全链路（造境→生成码→贴码→开战→SRS 写回）、听写挑战、七种结算结构断言 |
| `run-all.js` | 一键运行器 | — | 切到仓库根 → 先 unit 后 e2e → 汇总判定，任何失败退出码非零 |

## 运行方法

```bash
# 全套（unit + e2e）
node tests/run-all.js

# 只跑其中一个
node tests/run-all.js unit
node tests/run-all.js e2e

# 单文件直跑
node tests/unit.test.js
node tests/e2e.test.js
```

全部通过时退出码为 0；任何 FAIL（或子进程异常退出）退出码为 1。
输出里每个断言一行 `PASS/FAIL`，结尾有 `unit: PASS x / FAIL y` 与 `e2e: PASS x / FAIL y` 汇总行。

## 依赖

- **node ≥ 16**（无其他 npm 依赖；unit 不装任何包即可跑）。
- **e2e 需要 playwright**：按顺序探测 `playwright` → `playwright-core` → 全局
  `@playwright/cli` 自带的 playwright-core。都找不到时 **e2e 整组 SKIP**（退出码仍为 0，
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
