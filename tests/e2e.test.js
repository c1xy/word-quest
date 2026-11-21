/* Word Quest · e2e 端到端测试（playwright headless）
   用法：node tests/e2e.test.js   （或经 tests/run-all.js 统一调度）
   覆盖：
     S1 四组信息架构 12 入口逐一点击可达
     S2 首访引导四态（新档显示 / 点条进主线 / 首通后隐藏 / 旧档无字段隐藏）
     S3 投毒全链路（造毒→贴码→毒池→成绩码→回贴战报）
     S4 接力码全链路（战斗中导出→hash 恢复→run 级续接）
     S5 词境全链路（造境→生成词境码→贴码→开战→SRS 写回）
     S6 听写挑战（headless 无语音包自动降级首字母；无麦克风跟读行自动隐藏 = graceful skip）
     S7 七种结算结构断言（冒险/无尽/复习/远征/听写/词魂肉鸽/毒池）
     S8 R11 一致性回归（io 弹层按钮组随模式自适应 / Esc 逃生通道 / 图鉴返回刷新主页 chips）
     S9 键盘可达性（Tab 序列含四组入口 / Enter 激活 / div 卡片可聚焦+Enter / 弹层焦点管理+Esc）
     S10 色弱冗余标记（词性文字徽标 / ✓✕ 字形 / 对错色 protan-deutan 投影距离阈值）
     S11 触屏目标 ≥44px（四组 IA 每个按钮 + 设置/图鉴/战斗实测 rect；checkbox 取 label 命中区）
     S12 焦点管理专项（触屏仿真：答题/商店/弹层开关/词境工坊/记忆配对逐交互断言
         activeElement 不落 BODY，键盘锚点始终在可交互元素或面板容器上）
     S13 触屏注入（页内合成 pointer 事件驱动记忆配对全流程：tap 翻牌/拖拽撞击/失配弹回/
         pointercancel 中断/收官续局，配对结果与焦点双断言）
     S14 动效状态机 & 动效预算（r15：统一转场 tokens --t-dur/--t-ease 同源、主页首屏
         渐入错峰、@keyframes 属性白名单（transform/opacity/filter/box-shadow）扫描、
         连击换挡/答错抖动/正确词延迟强调/失血三档警示类名状态机、结算数字滚动落位、
         横幅点按跳过、切屏回顶）
     S15 连局压测（r16：同一页面不重载连打 10 局完整对局——主线/远征/肉鸽/听写/热座各
         2 局混排，每局结算/收官后回主页；断言全程零 pageerror + 每局回主页 + JS heap
         增长 ≤8MB（每局 CDP 强制 GC 后采样 performance.memory，S15-HEAP 行入基线））
     S16 间隔重复与记忆画像（r17：SM-2 lite 排程计算/晋升降档/到期队列与空态/复习会话
         落盘/记忆画像三行+例句填空展开/结算三词卡/词景覆盖率统计（SCENE-STATS 行）/
         题面词景显示规则与防泄题/连击里程碑单词串 fx；r18：晋升/降档 chips 改按
         「局首档→收局档」净变化计数——先错后对计晋升、连错两次计降档）
     S17 r18 特效状态机（答对金色粒子迸发 .fx-gold、连击边缘光晕 combo-glow 与
         combo-heat 档位同步、BOSS 出场 boss-enter/名牌压入与受击表情帧 .hit-face
         430ms 回正、背景分层视差 .bg-far+.deco-layer 双层 translate3d、结算评级
         grade-S/A/B 徽章与 S 级 120 粒撒花/B 级不撒花；r18b 补：跨档 pulse 摘除
         定时器到期自清零 comboGlowTimer/comboTierTimer、连击回落态 combo-heat-*与
         glow-*全摘）
     S18 记忆效果验收链（r19：旧档迁移兼容→新词学习→答错入错题→到期复习→再答对
         晋升→攻克出册→成熟→队列空态收口，全程断言档位/队列/存档字段；附 2909 词
         记忆画像内容覆盖率统计 PROFILE-STATS 行 + 无词根音节 fallback 抽查 ≥20 词
         + 词景与联想行联动）
     S-PERF 性能预算（本地服务：主页加载 ≤3s、首次可交互 ≤5s、JS heap 采样入 PERF-BASELINE 行）
   依赖：playwright 或 playwright-core（找不到时整组 SKIP，退出码 0 并说明原因），
   浏览器可执行文件依次探测 playwright 自带 chromium → 环境变量 WQ_CHROME_PATH →
   本机 Chrome/Edge。麦克风/摄像头相关能力 headless 下不可用，用例按游戏内降级路径验证。 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let BASE_URL = 'http://127.0.0.1:0';

/* ---------- playwright 解析 ---------- */
function resolvePlaywright() {
  const candidates = ['playwright', 'playwright-core',
    'C:/Users/j/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core'];
  for (const c of candidates) {
    try { return { pw: require(c), via: c }; } catch (e) { /* next */ }
  }
  return null;
}
function resolveBrowserExecutable(pw) {
  const tryPath = p => (p && fs.existsSync(p)) ? p : null;
  try {
    const bundled = pw.chromium.executablePath();
    if (bundled && fs.existsSync(bundled)) return bundled;
  } catch (e) { /* playwright-core 无内置浏览器 */ }
  const envPath = process.env.WQ_CHROME_PATH;
  if (tryPath(envPath)) return envPath;
  const guesses = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  ];
  for (const g of guesses) if (tryPath(g)) return g;
  return null;
}

/* ---------- 汇总 ---------- */
let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; failures.push(name); console.log('FAIL  ' + name + (extra !== undefined ? '  :: ' + extra : '')); }
}
function skip(name, reason) { console.log('SKIP  ' + name + (reason ? '  :: ' + reason : '')); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- 静态服务器（自带启动/停止，Cache-Control: no-cache 与 server.py 同语义） ---------- */
function startServer() {
  const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json',
    '.webmanifest': 'application/manifest+json', '.png': 'image/png',
    '.ico': 'image/x-icon', '.svg': 'image/svg+xml'
  };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
    if (p === '/' || p === '') p = '/index.html';
    const fp = path.join(ROOT, p);
    if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(fp, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/* ---------- 通用页内工具 ---------- */
const SAVE_KEY = 'wq_save_v1';
const DICT_WORDS = ['abandon', 'ability', 'absorb', 'abstract', 'academic', 'accelerate', 'accent', 'access'];
function baseSave() {
  return {
    coins: 30, mastery: {}, ach: {}, pets: {}, talents: {}, wrongBook: {},
    stats: { kills: 0, bosses: 0, spellOk: 0, listenOk: 0, runs: 0, dailyDone: 0, maxCombo: 0, perfects: 0, packDone: 0, labN: 0, labOk: 0, expWins: 0, packDoneMap: {} },
    best: { adventure: 0, endless: 0 }, streak: { count: 0, last: '', todayCount: 0 },
    lastLists: ['cet4'], firstRun: false
  };
}
/* seed === null 表示完全不带存档（走 defaultSave：firstRun=true 新档）
   opts.touch: 触屏仿真上下文（hasTouch+isMobile）——S11 触控目标实测 / S12 焦点管理 /
   S13 触屏注入用例需要。此前 S11 传了 {touch:true} 但第三参被静默丢弃，
   一直跑在纯鼠标上下文里（r14 自查修正） */
async function newContext(browser, seed, opts) {
  const context = await browser.newContext({
    viewport: { width: 420, height: 860 },
    hasTouch: !!(opts && opts.touch),
    isMobile: !!(opts && opts.touch)
  });
  if (seed !== null) {
    /* 注意：addInitScript 会序列化函数体，模块闭包变量（SAVE_KEY）在页面里不存在，
       必须用字面量键名；存档内容经 arg 传入。另：种子只落一次（wq_seed_done 标记），
       否则恢复存档后的 location.reload 会再次跑 init 脚本、把恢复档盖回种子。 */
    await context.addInitScript(s => {
      try {
        if (localStorage.getItem('wq_seed_done') !== '1') {
          localStorage.clear();
          localStorage.setItem('wq_save_v1', s);
          localStorage.setItem('wq_seed_done', '1');
        }
      } catch (e) {}
    }, JSON.stringify(seed || baseSave()));
  }
  const page = await context.newPage();
  page.on('dialog', d => d.accept().catch(() => {}));
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  return { context, page, errors };
}
async function gotoHome(page) {
  await page.goto(BASE_URL + '/', { waitUntil: 'load' });
  await page.waitForSelector('#scr-home.active', { timeout: 15000 });
}
async function backHome(page) {
  await page.waitForSelector('#scr-home.active', { timeout: 8000 });
}
/* 页内读取战斗状态（不用 const run 遮蔽全局 run，避免 TDZ） */
const READ_STATE = () => {
  const vis = el => el && el.getClientRects().length > 0;
  const r = (typeof run === 'undefined') ? null : run;
  const mem = document.getElementById('memcard');
  return {
    ended: r ? !!r.ended : true,
    shop: document.getElementById('scr-shop').classList.contains('active'),
    memcard: vis(mem),
    locked: !r || !r.q || !!r.q.locked,
    word: r && r.q && r.q.word ? r.q.word.w : null,
    meaning: r && r.q && r.q.word ? r.q.word.m : null,
    qtype: r && r.q ? r.q.type : null,
    opts: Array.from(document.querySelectorAll('#q-options .q-opt')).map(b => b.textContent.replace(/^[0-9]+/, '').trim())
  };
};
/* 选择题点击一题（找到正确项并点击，返回是否点过） */
async function clickCorrectOnce(page) {
  const st = await page.evaluate(READ_STATE);
  if (st.ended || st.shop || st.locked || !st.opts.length) return false;
  const want = st.qtype === 'e2c' ? st.meaning : st.word;
  const idx = st.opts.findIndex(o => o === want);
  if (idx < 0) return false;
  await page.click('#q-options .q-opt >> nth=' + idx).catch(() => {});
  return true;
}
/* 战斗自动作答：mode='n'（答 n 题）| 'shop'（打通到商店）| 'end'（打到结算） */
async function battleChoice(page, mode) {
  const maxSteps = mode === 'end' ? 120 : (mode === 'shop' ? 120 : 40);
  let answered = 0, target = typeof mode === 'number' ? mode : 0;
  for (let i = 0; i < maxSteps; i++) {
    const st = await page.evaluate(READ_STATE).catch(() => null);
    if (!st) { await sleep(300); continue; }
    if (st.ended) return 'ended';
    if (st.shop) return 'shop';
    if (st.memcard) { await page.click('#mem-ok').catch(() => {}); await sleep(300); continue; }
    if (st.locked) { await sleep(350); continue; }
    if (typeof mode === 'number' && answered >= target) return 'answered-' + answered;
    if (await clickCorrectOnce(page)) { answered++; await sleep(1100); }
    else await sleep(300);
  }
  return 'timeout';
}
/* 故意答错 1 次（造复仇词用；记忆卡由后续循环正常关闭） */
async function answerWrongOnce(page) {
  for (let i = 0; i < 30; i++) {
    const st = await page.evaluate(READ_STATE);
    if (st.ended) return false;
    if (st.memcard) { await page.click('#mem-ok').catch(() => {}); await sleep(300); continue; }
    if (st.locked) { await sleep(350); continue; }
    const wrongIdx = Math.max(0, st.opts.findIndex(o => o !== st.word));
    await page.click('#q-options .q-opt >> nth=' + wrongIdx).catch(() => {});
    await sleep(1100);
    return true;
  }
  return false;
}
/* 听写拼写循环：拼写 run.q.word.w 后提交；非拼写题（连字符词等）走选择逻辑。
   拼写 chip 带浮动动画，坐标点击会被 playwright 稳定性等待卡死（计时到点反而弹记忆卡），
   故 chips/提交/退格走页内 DOM click（真实触发游戏自身 onclick 处理器），每步前先关记忆卡 */
async function battleSpell(page, words) {
  for (let k = 0; k < words; k++) {
    let done = false;
    for (let i = 0; i < 60 && !done; i++) {
      const st = await page.evaluate(() => {
        const vis = el => el && el.getClientRects().length > 0;
        const r = (typeof run === 'undefined') ? null : run;
        return {
          ended: r ? !!r.ended : true,
          memcard: vis(document.getElementById('memcard')),
          locked: !r || !r.q || !!r.q.locked,
          word: r && r.q && r.q.word ? r.q.word.w : null,
          meaning: r && r.q && r.q.word ? r.q.word.m : null,
          qtype: r && r.q ? r.q.type : null,
          opts: Array.from(document.querySelectorAll('#q-options .q-opt')).map(b => b.textContent.replace(/^[0-9]+/, '').trim()),
          slots: Array.from(document.querySelectorAll('.spell-slot')).map(x => x.textContent || '').join(''),
          chips: Array.from(document.querySelectorAll('#spell-chips .spell-chip'))
            .map((c, idx) => ({ t: c.textContent.trim(), used: c.className.indexOf('used') >= 0, idx: idx }))
        };
      });
      if (st.ended) return 'ended';
      if (st.memcard) { await page.evaluate(() => document.getElementById('mem-ok').click()); await sleep(300); continue; }
      if (st.qtype !== 'spell') {                     // 混入的选择题（无纯 a-z 词等）
        const want = st.qtype === 'e2c' ? st.meaning : st.word;
        const idx = st.opts.findIndex(o => o === want);
        if (idx >= 0) { await page.evaluate(i => document.querySelectorAll('#q-options .q-opt')[i].click(), idx); await sleep(1200); done = true; }
        else await sleep(300);
        continue;
      }
      if (st.locked) { await sleep(350); continue; }
      if (st.slots === st.word) {
        await page.evaluate(() => document.getElementById('btn-spell-submit').click());
        done = true;
        await sleep(1300);
        continue;
      }
      // 依词序点击未使用的字母 chip（页内 DOM click，规避浮动动画的稳定性等待）
      // 注意：必须用数组按词序收集 chip 下标——Object.keys 的数字键会按升序重排，字母次序就错了
      const order = [];
      const usedIdx = new Set();
      let missing = false;
      for (const ch of st.word) {
        const hit = st.chips.find(c => !usedIdx.has(c.idx) && !c.used && c.t === ch);
        if (!hit) { missing = true; break; }
        usedIdx.add(hit.idx);
        order.push(hit.idx);
      }
      if (missing) { await sleep(300); continue; }
      await page.evaluate(ord => {
        const chips = document.querySelectorAll('#spell-chips .spell-chip');
        ord.forEach(idx => chips[idx].click());
      }, order);
      await sleep(250);
      const slots2 = await page.evaluate(() => Array.from(document.querySelectorAll('.spell-slot')).map(x => x.textContent || '').join(''));
      if (slots2 === st.word) {
        await page.evaluate(() => document.getElementById('btn-spell-submit').click());
        done = true;
        await sleep(1300);
      } else if (slots2.length) {
        await page.evaluate(() => { for (let b = 0; b < 12; b++) document.getElementById('btn-spell-back').click(); });
        await sleep(200);
      }
    }
    if (!done) return 'stuck';
  }
  return 'ok';
}
/* 换种子存档：先取消游戏挂起的防抖写盘（persistCancel），再覆写 wq_save_v1 并 reload——
   否则 pagehide 的 persistFlush（丢档窗口为零的兜底）会把旧档盖回种子（S16 首跑实测踩坑） */
async function reseedSave(page, seed) {
  await page.evaluate(s => {
    if (typeof persistCancel === 'function') persistCancel();
    localStorage.setItem('wq_save_v1', JSON.stringify(s));
  }, seed);
  await page.reload({ waitUntil: 'load' });
}
/* 撤退或已结算：局若已自然结束（如 review 队列打满自动收官），直接进结算 */
async function quitOrSettled(page) {
  const st = await page.evaluate(() => ({
    result: document.getElementById('scr-result').classList.contains('active'),
    battle: document.getElementById('scr-battle').classList.contains('active'),
    ended: (typeof run !== 'undefined' && run) ? !!run.ended : true
  }));
  if (st.result) return;
  await quitBattle(page);
}
/* 结算页结构断言 */
async function assertResult(page, label, wantTitle, wantChipPart) {
  const r = await page.evaluate(() => ({
    active: document.getElementById('scr-result').classList.contains('active'),
    title: document.getElementById('result-title').textContent,
    chips: Array.from(document.querySelectorAll('#result-stats .chip')).map(c => c.textContent.trim()),
    rows: document.querySelectorAll('#result-words .rw-row').length,
    homeBtn: !!document.getElementById('btn-result-home'),
    againVisible: !document.getElementById('btn-again').hidden,
    sections: Array.from(document.querySelectorAll('#scr-result .section-title')).map(e => e.textContent.trim())
  }));
  ok(label + ' · scr-result 激活', r.active);
  ok(label + ' · 标题=' + wantTitle, r.title === wantTitle, r.title);
  ok(label + ' · 核心数据 chips≥3（实际 ' + r.chips.length + '）', r.chips.length >= 3, JSON.stringify(r.chips));
  ok(label + ' · 词表行 ≥1', r.rows >= 1, r.rows);
  ok(label + ' · 返回主页按钮在位', r.homeBtn);
  ok(label + ' · 再来一局按钮在位', r.againVisible);
  ok(label + ' · 「📜 本局单词回顾」节标题在位（七种结算同源结构）', r.sections.indexOf('📜 本局单词回顾') >= 0, JSON.stringify(r.sections));
  if (wantChipPart) {
    /* r15 数字滚动：结算 chips 数字 620ms 内从 0 滚到终值——含数字的 chip 断言
       轮询到滚动结束（最多 1.2s），避免在滚动中途读走「听写 0 词」这类瞬时值 */
    const t0 = Date.now();
    let hit = false, chipsNow = r.chips;
    while (Date.now() - t0 < 1200) {
      chipsNow = await page.evaluate(() => Array.from(document.querySelectorAll('#result-stats .chip')).map(c => c.textContent.trim()));
      if (chipsNow.some(c => c.indexOf(wantChipPart) >= 0)) { hit = true; break; }
      await sleep(150);
    }
    ok(label + ' · 含 chip「' + wantChipPart + '」', hit, JSON.stringify(chipsNow));
  }
}
/* 出战设置 → 开战 */
async function startBattleFromSetup(page, mode, size) {
  await page.click(mode === 'endless' ? '#btn-endless' : mode === 'review' ? '#btn-review'
    : mode === 'expedition' ? '#btn-expedition' : mode === 'dictation' ? '#btn-dict' : '#btn-adventure');
  await page.waitForSelector('#scr-setup.active', { timeout: 5000 });
  if (size) {
    await page.selectOption('#setup-size', String(size));
    await sleep(150);
  }
  await page.click('#btn-start');
  await page.waitForSelector('#scr-battle.active', { timeout: 8000 });
}
/* 撤退进结算：先把可能盖住按钮的记忆卡弹层关干净，再点退出 */
async function quitBattle(page) {
  for (let i = 0; i < 15; i++) {
    const vis = await page.evaluate(() => {
      const mem = document.getElementById('memcard');
      return !!(mem && !mem.hidden && mem.getClientRects().length > 0);
    });
    if (!vis) break;
    await page.click('#mem-ok').catch(() => {});
    await sleep(280);
  }
  await page.click('#btn-quit');
}
/* 答一题后撤退进结算 */
async function answerOnceThenQuit(page, label, wantTitle, wantChip) {
  await battleChoice(page, 1);
  await quitBattle(page);
  await waitResult(page, 15000);
  await assertResult(page, label, wantTitle, wantChip);
}
/* 战斗 → 结算页等待：run.ended 在 showScreen 之前置位（endRunCore 先收局再切屏），
   battleChoice/battleSpell 观察到 ended 返回时结算页可能尚未激活，固定 sleep 有竞态；
   环境抖动（watchdog 恢复 / 计时漂移）还可能让切屏晚到数秒。这里轮询至 scr-result 激活，
   超时抛出带战场快照的错误——失败时能直接看到局停在哪个屏/哪个状态，而不是裸 locator 超时 */
async function battleSnap(page) {
  return await page.evaluate(() => {
    const act = (document.querySelector('.screen.active') || {}).id || null;
    const r = (typeof run === 'undefined') ? null : run;
    const vis = id => { const el = document.getElementById(id); return !!el && !el.hidden && el.getClientRects().length > 0; };
    return {
      act: act, ended: r ? r.ended : null,
      mode: r ? r.mode : null, poison: !!(r && r.poison), realm: !!(r && r.realm),
      pressure: r ? Math.round(r.pressure || 0) : null, kills: r ? r.kills : null, stageSize: r ? r.stageSize : null,
      qtype: r && r.q ? r.q.type : null, locked: r && r.q ? !!r.q.locked : null,
      memcard: vis('memcard'), banner: vis('banner'), io: vis('io-overlay')
    };
  }).catch(() => ({ act: 'eval-error（执行上下文不可用，页面可能在导航）' }));
}
async function waitResult(page, budgetMs) {
  const t0 = Date.now();
  let snap = null;
  while (Date.now() - t0 < budgetMs) {
    snap = await battleSnap(page);
    if (snap.act === 'scr-result') return;
    await sleep(400);
  }
  throw new Error('结算页 ' + Math.round(budgetMs / 1000) + 's 未激活 · 战场快照 ' + JSON.stringify(snap));
}

/* ================= 主流程 ================= */
const resolvable = resolvePlaywright();
if (!resolvable) {
  skip('e2e 全组', '未找到 playwright / playwright-core（npm i playwright 或全局 @playwright/cli 后重试）');
  console.log('========================================');
  console.log('e2e: PASS ' + pass + ' / FAIL ' + fail + ' / SKIP 全组');
  process.exitCode = 0;
} else {
  (async () => {
    const { pw } = resolvable;
    const exe = resolveBrowserExecutable(pw);
    if (!exe) {
      skip('e2e 全组', '未找到可用的浏览器可执行文件（可设 WQ_CHROME_PATH 指定）');
      console.log('========================================');
      console.log('e2e: PASS ' + pass + ' / FAIL ' + fail + ' / SKIP 全组');
      return;
    }
    console.log('（浏览器: ' + exe + ' · playwright: ' + resolvable.via + '）');
    const server = await startServer();
    BASE_URL = 'http://127.0.0.1:' + server.address().port;
    let browser = null;
    try {
      browser = await pw.chromium.launch({ executablePath: exe, headless: true });

      /* ============ S1 · 四组信息架构 12 入口逐一点击可达 ============ */
      console.log('---- S1 四组 12 入口 ----');
      {
        const { context, page, errors } = await newContext(browser);
        await gotoHome(page);
        const entries = [
          ['btn-adventure', '#scr-setup.active', '#btn-setup-back', '主线冒险'],
          ['btn-rogue', '#scr-rogue.active', '#btn-rogue-back', '词魂肉鸽'],
          ['btn-expedition', '#scr-setup.active', '#btn-setup-back', '每日远征'],
          ['btn-lab', '#scr-lab.active', '#btn-lab-back', '词根合成实验室'],
          ['btn-dict', '#scr-setup.active', '#btn-setup-back', '听写挑战'],
          ['btn-poison', null, '#io-cancel', '投毒挑战码（io 弹层）'],
          ['btn-duel', '#scr-duel.active', '#btn-duel-back', '双人热座对决'],
          ['btn-realm', '#scr-realm.active', '#btn-realm-back', '词境工坊'],
          ['btn-packs', '#scr-packs.active', '#btn-packs-back', '主题挑战包'],
          ['btn-endless', '#scr-setup.active', '#btn-setup-back', '无尽挑战'],
          ['btn-review', '#scr-setup.active', '#btn-setup-back', '复习模式'],
          ['btn-match', '#scr-match.active', '#btn-match-back', '记忆配对']
        ];
        for (const [btn, target, backBtn, label] of entries) {
          await page.click('#' + btn);
          if (target) await page.waitForSelector(target, { timeout: 5000 });
          else await page.waitForSelector('#io-overlay:not([hidden])', { timeout: 5000 });
          const backVisible = await page.evaluate(b => { const e = document.querySelector(b); return !!e && e.getClientRects().length > 0; }, backBtn);
          ok('S1 ' + label + '（#' + btn + '）可达且有返回口', backVisible, backBtn);
          await page.click(backBtn);
          await backHome(page);
        }
        ok('S1 无页面异常（pageerror=0）', errors.length === 0, errors.join(' | '));
        await context.close();
      }

      /* ============ S2 · 首访引导四态 ============ */
      console.log('---- S2 首访引导四态 ----');
      {
        // ① 全新存档（无 wq_save_v1 → defaultSave.firstRun=true）→ 引导条显示
        const a = await newContext(browser, null);
        await gotoHome(a.page);
        await sleep(300);
        ok('S2-① 新档引导条显示', await a.page.evaluate(() => !document.getElementById('btn-guide').hidden));
        const gh = await a.page.evaluate(() => Math.round(document.getElementById('btn-guide').getBoundingClientRect().height));
        ok('S2-① 引导条触控目标 ≥44px（实测 ' + gh + 'px，r14 遗留池 41px 修复）', gh >= 44, gh);
        // ② 点引导条 → 进主线冒险出战准备
        await a.page.click('#btn-guide');
        await a.page.waitForSelector('#scr-setup.active', { timeout: 5000 });
        ok('S2-② 引导条点击 → 主线冒险出战准备', true);
        await a.page.click('#btn-setup-back');
        await backHome(a.page);
        ok('S2-②b 未首通前引导条仍在', await a.page.evaluate(() => !document.getElementById('btn-guide').hidden));
        // ③ 完成首次通关（stageClear）→ 永久隐藏
        await a.page.click('#btn-adventure');
        await a.page.waitForSelector('#scr-setup.active', { timeout: 5000 });
        // setup-size 最低 10 词（下拉无 5），第 1 关 10 怪由 battleChoice('shop') 打穿
        // (default 10)
        await a.page.click('#btn-start');
        await a.page.waitForSelector('#scr-battle.active', { timeout: 8000 });
        const finish = await battleChoice(a.page, 'shop');   // 5 词 × 第 1 关 → stageClear → 商店
        ok('S2-③ 首关打通（进入商店）', finish === 'shop', finish);
        const shopSub = await a.page.textContent('#shop-sub');
        ok('S2-③ 商店副标题指向下一关（「下一关 第 2 关」，不再重复「当前第 1 关」）', shopSub.indexOf('下一关 第 2 关') >= 0 && shopSub.indexOf('当前第') < 0, shopSub);
        ok('S2-③b 存档 firstRun 已置 false', await a.page.evaluate(() => JSON.parse(localStorage.getItem('wq_save_v1')).firstRun === false));
        await a.page.click('#btn-next-stage');
        await a.page.waitForSelector('#scr-battle.active', { timeout: 8000 });
        await quitBattle(a.page);   // confirm 对话框已自动 accept → 撤退结算
        await a.page.waitForSelector('#scr-result.active', { timeout: 8000 });
        await a.page.click('#btn-result-home');
        await backHome(a.page);
        ok('S2-③c 首通后引导条永久隐藏', await a.page.evaluate(() => document.getElementById('btn-guide').hidden === true));
        await a.context.close();
        // ④ 旧版本存档（无 firstRun 字段）→ 视为老玩家，引导条不弹
        const old = baseSave(); delete old.firstRun;
        const b = await newContext(browser, old);
        await gotoHome(b.page);
        await sleep(400);
        const s24 = await b.page.evaluate(() => ({
          guideHidden: document.getElementById('btn-guide').hidden,
          firstRun: (typeof save !== 'undefined' && save) ? save.firstRun : null,
          lsCoins: JSON.parse(localStorage.getItem('wq_save_v1') || '{}').coins
        }));
        ok('S2-④ 旧档（无 firstRun 字段）引导条不弹', s24.guideHidden === true, JSON.stringify(s24));
        await b.context.close();
      }

      /* ============ S3 · 投毒全链路（造毒→贴码→毒池→成绩码→回贴） ============ */
      console.log('---- S3 投毒全链路 ----');
      let poisonCode = null, resultCode = null;
      {
        // A（出题方）：答错 2 次 → 撤退 → 结算页「⚔️ 投毒」
        const A = await newContext(browser);
        await gotoHome(A.page);
        await startBattleFromSetup(A.page, 'adventure');
        await answerWrongOnce(A.page);
        await answerWrongOnce(A.page);
        const recOk = await A.page.evaluate(() => (run.records || []).some(r => r.wrong >= 2));
        ok('S3-A 复仇词就位（wrong≥2）', recOk);
        await quitBattle(A.page);
        await A.page.waitForSelector('#scr-result.active', { timeout: 8000 });
        await A.page.click('#btn-poison-export');
        await A.page.waitForSelector('#io-overlay:not([hidden])', { timeout: 5000 });
        poisonCode = await A.page.inputValue('#io-text');
        ok('S3-A 挑战码生成（W 前缀 12-18 位）', /^W[0-9A-Za-z_-]{11,17}$/.test(poisonCode || ''), poisonCode);
        const genBtns = await A.page.evaluate(() => ({
          okLabel: document.getElementById('io-ok').textContent,
          cancelHidden: document.getElementById('io-cancel').hidden,
          copyHidden: document.getElementById('io-copy').hidden
        }));
        ok('S3-A 码生成态按钮组自适应（复制在位 · 无同义「取消」）', genBtns.cancelHidden && !genBtns.copyHidden && genBtns.okLabel === '关闭', JSON.stringify(genBtns));
        await A.page.click('#io-ok');
        await A.context.close();

        // B（应战方）：主页投毒入口贴码 → 噩梦毒池
        const B = await newContext(browser);
        await gotoHome(B.page);
        await B.page.click('#btn-poison');
        await B.page.waitForSelector('#io-overlay:not([hidden])', { timeout: 5000 });
        const pasteBtns = await B.page.evaluate(() => ({
          okLabel: document.getElementById('io-ok').textContent,
          cancelHidden: document.getElementById('io-cancel').hidden,
          copyHidden: document.getElementById('io-copy').hidden
        }));
        ok('S3-B 贴码态按钮组自适应（应战+取消在位 · 无「复制空文本」）', !pasteBtns.cancelHidden && pasteBtns.copyHidden && pasteBtns.okLabel === '⚔️ 应战！', JSON.stringify(pasteBtns));
        await B.page.fill('#io-text', poisonCode);
        await B.page.click('#io-ok');
        await B.page.waitForSelector('#scr-battle.active', { timeout: 8000 });
        const poisonRun = await B.page.evaluate(() => !!run && !!run.poison && run.poison.words.length >= 1 && !run.ended);
        ok('S3-B 贴码进入毒池（run.poison 就位）', poisonRun);
        let finish = await battleChoice(B.page, 'end');
        try {
          await waitResult(B.page, 15000);
        } catch (e) {
          /* 极罕见的环境抖动：battleChoice 已返回但结算页始终未激活（实测一次：
             全套用时骤减 + #scr-result 10s 超时，复跑 6 次/隔离复现 3 次均不复现）。
             战斗链路本身在 9/9 次运行中正常——此处重试一次完整流程：回主页重新贴
             同一枚码再战，而非让整组测试因裸超时崩掉；快照已随异常打印供诊断。 */
          console.log('S3-B 第一次等待结算未果，重试一次 :: ' + e.message);
          await B.page.goto(BASE_URL + '/', { waitUntil: 'load' });
          await B.page.waitForSelector('#scr-home.active', { timeout: 15000 });
          await B.page.click('#btn-poison');
          await B.page.waitForSelector('#io-overlay:not([hidden])', { timeout: 5000 });
          await B.page.fill('#io-text', poisonCode);
          await B.page.click('#io-ok');
          await B.page.waitForSelector('#scr-battle.active', { timeout: 8000 });
          finish = await battleChoice(B.page, 'end');
          await waitResult(B.page, 20000);
        }
        ok('S3-B 毒池终局出结算', finish === 'ended', finish);
        const resultTitle = await B.page.textContent('#result-title');
        ok('S3-B 毒池结算标题（☠️ 噩梦通关！）', resultTitle === '☠️ 噩梦通关！', resultTitle);
        const rcVisible = await B.page.evaluate(() => !document.getElementById('btn-result-code').hidden);
        ok('S3-B 「📨 复制成绩码」按钮在位', rcVisible);
        /* 点击走一次重试：本机偶发环境抖动（上方 waitResult 重试同源，r15 实测一次
           「结算页已激活、hidden=false，但 click 连续 30s 报 not visible」；隔离复跑 9 次
           均不复现）。重试前先确认结算页仍激活——真回归会连续失败，不会被它掩盖 */
        let clickErr = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const still = await B.page.evaluate(() => (document.querySelector('.screen.active') || {}).id === 'scr-result');
            if (!still) throw new Error('结算页未激活（环境抖动或回归）');
            await B.page.click('#btn-result-code', { timeout: 12000 });
            clickErr = null;
            break;
          } catch (e) {
            clickErr = e;
            if (attempt === 0) { console.log('S3-B 复制成绩码首次点击未果，重试一次 :: ' + e.message.split('\n')[0]); await sleep(2000); }
          }
        }
        if (clickErr) throw clickErr;
        await B.page.waitForSelector('#io-overlay:not([hidden])', { timeout: 5000 });
        resultCode = await B.page.inputValue('#io-text');
        ok('S3-B 成绩码生成（R 前缀 12-18 位）', /^R[0-9A-Za-z_-]{11,17}$/.test(resultCode || ''), resultCode);
        const poisonLog = await B.page.evaluate(() => (JSON.parse(localStorage.getItem('wq_save_v1')).poisonLog || [])[0]);
        ok('S3-B 我闯的毒战绩入档（role=play win=true）', poisonLog && poisonLog.role === 'play' && poisonLog.win === true, JSON.stringify(poisonLog));
        await B.context.close();

        // A：回贴成绩码 → 战报核对
        const A2 = await newContext(browser);
        await gotoHome(A2.page);
        await A2.page.click('#btn-poison');
        await A2.page.waitForSelector('#io-overlay:not([hidden])', { timeout: 5000 });
        await A2.page.fill('#io-text', resultCode);
        await A2.page.click('#io-ok');
        await sleep(700);
        const setLog = await A2.page.evaluate(() => (JSON.parse(localStorage.getItem('wq_save_v1')).poisonLog || []).find(e => e.role === 'set'));
        ok('S3-A 成绩码回贴 → 「我布的毒」战绩更新为对方通关（win=true 非 pending）', setLog && setLog.win === true && !setLog.pending, JSON.stringify(setLog));
        const overlayClosed = await A2.page.evaluate(() => document.getElementById('io-overlay').hidden);
        ok('S3-A 战报处理后弹层自动关闭', overlayClosed);
        await A2.context.close();
      }

      /* ============ S4 · 接力码全链路（战斗中导出→hash 恢复→run 级续接） ============ */
      console.log('---- S4 接力码全链路 ----');
      {
        // A：进入冒险并答 2 题保持对局活跃 → 战斗页 📲 生成含对局快照的接力码
        const A = await newContext(browser);
        await gotoHome(A.page);
        await startBattleFromSetup(A.page, 'adventure');
        await battleChoice(A.page, 1);   // 答 1 题（对局活跃、未结束）
        const mid = await A.page.evaluate(() => ({ mode: run.mode, stage: run.stage, killed: run.killedInStage, coins: run.coinsEarned, ended: run.ended, q: !!run.q }));
        ok('S4-A 对局进行中（stage=' + mid.stage + ' · 局内获得 ' + mid.coins + '🪙）', !mid.ended && mid.mode === 'adventure' && mid.coins >= 10, JSON.stringify(mid));
        await A.page.click('#btn-battle-relay');
        await A.page.waitForSelector('#relay-overlay:not([hidden])', { timeout: 5000 });
        const runOpt = await A.page.evaluate(() => !document.getElementById('relay-run-opt').hidden && document.getElementById('relay-include-run').checked);
        ok('S4-A 「连同进行中的对局一起接力」默认勾选', runOpt);
        await A.page.click('#btn-relay-gen');
        await A.page.waitForSelector('#relay-qr-wrap:not([hidden])', { timeout: 5000 });
        const relayText = await A.page.inputValue('#relay-text');
        ok('S4-A 接力码文本生成（R1. 前缀）', relayText.indexOf('R1.') === 0 && relayText.length > 40);
        const shardUrls = await A.page.evaluate(() => {
          const plan = relayPlanShards(relayBuildPayload(true), relayBaseUrlLen());
          return plan.shards.map((b64, i) => location.origin + location.pathname + '#r=' + (i + 1) + '/' + plan.n + '.' + b64);
        });
        ok('S4-A 接力码分片 URL 生成（' + shardUrls.length + ' 片）', shardUrls.length >= 1);
        await A.context.close();

        // B：逐片访问 hash URL → 集齐弹恢复确认（含续接选项）→ 确认恢复 → reload 后自动续接
        const B = await newContext(browser);
        for (let i = 0; i < shardUrls.length; i++) {
          await B.page.goto(shardUrls[i], { waitUntil: 'load' });
          if (i > 0) { await B.page.reload({ waitUntil: 'load' }); }   // 同页换 hash 是软导航：必须 reload 才会重跑 init 的 relayCheckHash
          await B.page.waitForSelector('#relay-overlay:not([hidden])', { timeout: 12000 });
          if (i < shardUrls.length - 1) {
            const note = await B.page.textContent('#relay-parts-note');
            ok('S4-B 第 ' + (i + 1) + ' 片已收下（进度暂存提示）', note.indexOf('已收到') >= 0, note);
          }
        }
        const s4d = await B.page.evaluate(() => ({
          confirmHidden: document.getElementById('relay-confirm').hidden,
          genHidden: document.getElementById('relay-gen').hidden,
          note: document.getElementById('relay-parts-note').textContent,
          parts: localStorage.getItem('wq_relay_parts'),
          warn: document.getElementById('relay-warn').textContent.slice(0, 60)
        }));
        const confirmShown = !s4d.confirmHidden;
        ok('S4-B 集齐后自动弹恢复确认框', confirmShown, JSON.stringify(s4d));
        const resumeOpt = await B.page.evaluate(() => !document.getElementById('relay-resume-opt').hidden && document.getElementById('relay-resume-run').checked);
        ok('S4-B 「同时续接进行中的对局」默认勾选', resumeOpt);
        const warn = await B.page.textContent('#relay-warn');
        ok('S4-B 确认框展示存档摘要 + 覆盖警示 + 自动备份', warn.indexOf('收到存档') >= 0 && warn.indexOf('覆盖本机现有进度') >= 0);
        await B.page.click('#btn-relay-apply');
        await B.page.waitForLoadState('load');
        await B.page.waitForSelector('#scr-battle.active', { timeout: 15000 });
        await sleep(900);
        const resumed = await B.page.evaluate(() => ({ active: document.getElementById('scr-battle').classList.contains('active'), mode: run && run.mode, stage: run && run.stage, ended: run && run.ended, coins: run && run.coinsEarned }));
        ok('S4-B reload 后 run 级续接（回到战斗页 adventure）', resumed.active && resumed.mode === 'adventure' && !resumed.ended, JSON.stringify(resumed));
        ok('S4-B 续接保留对局数据（关卡/金币）', resumed.stage === mid.stage && resumed.coins === mid.coins, JSON.stringify(resumed));
        const bSave = await B.page.evaluate(() => JSON.parse(localStorage.getItem('wq_save_v1')).coins);
        ok('S4-B 存档已恢复（coins = 种子 30 + 局内获得）', bSave === 30 + mid.coins, 'coins=' + bSave);
        await B.context.close();
      }

      /* ============ S5 · 词境全链路（造境→生成码→贴码→开战→SRS） ============ */
      console.log('---- S5 词境全链路 ----');
      {
        const A = await newContext(browser);
        await gotoHome(A.page);
        await A.page.click('#btn-realm');
        await A.page.waitForSelector('#scr-realm.active', { timeout: 5000 });
        await A.page.fill('#realm-custom-text', 'abandon v. 放弃\nability 能力\nabsorb 吸收\nabstract 抽象');
        await A.page.click('#btn-realm-gen');
        await A.page.waitForSelector('#realm-share:not([hidden])', { timeout: 5000 });
        const realmCode = await A.page.inputValue('#realm-text');
        ok('S5-A 词境码生成（RM. 前缀）', (realmCode || '').indexOf('RM.') === 0 && realmCode.length > 20, realmCode && realmCode.slice(0, 24) + '…');
        await A.context.close();

        const B = await newContext(browser);
        await gotoHome(B.page);
        await B.page.click('#btn-realm');
        await B.page.waitForSelector('#scr-realm.active', { timeout: 5000 });
        await B.page.fill('#realm-in-text', realmCode);
        await B.page.click('#btn-realm-parse');
        await B.page.waitForSelector('#realm-confirm:not([hidden])', { timeout: 5000 });
        const confirmTxt = await B.page.textContent('#realm-confirm-body');
        ok('S5-B 贴码解析出词境确认框（词量/参数摘要）', confirmTxt.indexOf('收到词境') >= 0 && confirmTxt.indexOf('词量 4') >= 0, confirmTxt.slice(0, 90));
        await B.page.click('#btn-realm-confirm-play');
        await B.page.waitForSelector('#scr-battle.active', { timeout: 8000 });
        const realmRun = await B.page.evaluate(() => !!run && !!run.realm && run.stageSize === 4 && !run.ended);
        ok('S5-B 开战进入词境（一战定胜负 stageSize=4）', realmRun);
        const finish = await battleChoice(B.page, 'end');
        await waitResult(B.page, 15000);   /* 与 S3-B 同源竞态：ended 先于切屏置位 */
        ok('S5-B 词境通关出结算', finish === 'ended', finish);
        const realmTitle = await B.page.textContent('#result-title');
        ok('S5-B 词境结算标题（🌌 词境通关！）', realmTitle === '🌌 词境通关！', realmTitle);
        const srs = await B.page.evaluate(() => {
          const m = JSON.parse(localStorage.getItem('wq_save_v1')).mastery;
          const w = m['abandon'] || {};
          return { lv: w.lv, seen: w.seen, ok: w.ok, due: w.due || 0 };
        });
        ok('S5-B SRS 写回（abandon lv=1 seen=1 ok=1）', srs.lv === 1 && srs.seen === 1 && srs.ok === 1, JSON.stringify(srs));
        ok('S5-B SRS 排程 due 已入未来（间隔重复挂上）', srs.due > Date.now(), srs.due - Date.now());
        await B.context.close();
      }

      /* ============ S6 · 听写挑战（headless 无语音降级 + 无麦克风跟读隐藏） ============ */
      console.log('---- S6 听写挑战 ----');
      {
        const { page, context, errors } = await newContext(browser);
        await gotoHome(page);
        await page.click('#btn-dict');
        await page.waitForSelector('#scr-setup.active', { timeout: 5000 });
        const title = await page.textContent('#setup-title');
        ok('S6 听写挑战出战准备（标题含听写）', (title || '').indexOf('听写') >= 0, title);
        const speakRow = await page.evaluate(() => {
          const row = document.getElementById('speak-row');
          const recOk = (typeof Rec !== 'undefined') && Rec.ok;
          return { hidden: !row || row.hidden, recOk: recOk };
        });
        if (speakRow.recOk) {
          skip('S6 跟读行隐藏断言', 'headless 环境意外具备语音识别（Rec.ok=true）——麦克风用例按约定 graceful skip');
        } else {
          ok('S6 无麦克风 → 🎤 跟读行自动隐藏（graceful 路径）', speakRow.hidden, JSON.stringify(speakRow));
        }
        await page.selectOption('#setup-size', '10');   // 下拉最低 10 词
        await page.click('#btn-start');
        await page.waitForSelector('#scr-battle.active', { timeout: 8000 });
        const r = await battleSpell(page, 10);
        await sleep(600);
        const s6d = await page.evaluate(() => ({
          screen: (document.querySelector('.screen.active') || {}).id || null,
          ended: run ? run.ended : null, kills: run ? run.kills : null,
          qtype: run && run.q ? run.q.type : null,
          locked: run && run.q ? run.q.locked : null,
          slots: Array.from(document.querySelectorAll('.spell-slot')).map(x => x.textContent || '').join(''),
          word: run && run.q && run.q.word ? run.q.word.w : null
        }));
        const probe = r === 'stuck' ? await page.evaluate(() => {
          const chips = document.querySelectorAll('#spell-chips .spell-chip');
          const before = Array.from(document.querySelectorAll('.spell-slot')).map(x => x.textContent || '').join('');
          if (chips[0]) chips[0].click();
          const after = Array.from(document.querySelectorAll('.spell-slot')).map(x => x.textContent || '').join('');
          return {
            chipN: chips.length, chip0Text: chips[0] ? chips[0].textContent : null,
            chip0Class: chips[0] ? chips[0].className : null,
            qSpellHidden: document.getElementById('q-spell').hidden,
            speakPhase: document.getElementById('q-speak').hidden === false,
            picked: (typeof spellState !== 'undefined' && spellState) ? spellState.picked.slice() : null,
            slotsBefore: before, slotsAfter: after,
            memVisible: (function(){ const m = document.getElementById('memcard'); return !!(m && !m.hidden && m.getClientRects().length > 0); })()
          };
        }) : null;
        ok('S6 听写 10 词完成出结算', r === 'ok' || r === 'ended', r + ' ' + JSON.stringify(s6d) + (probe ? ' PROBE=' + JSON.stringify(probe) : ''));
        await assertResult(page, 'S6-听写(done)', '🎧 听写挑战完成！', '🎧 听写 10 词');
        ok('S6 无页面异常（pageerror=0）', errors.length === 0, errors.join(' | '));
        await context.close();
      }

      /* ============ S7 · 七种结算结构断言 ============ */
      console.log('---- S7 七种结算结构 ----');
      {
        // ① 冒险（撤退）
        const c1 = await newContext(browser);
        await gotoHome(c1.page);
        await startBattleFromSetup(c1.page, 'adventure');
        await answerOnceThenQuit(c1.page, 'S7-①冒险(quit)', '🏳️ 撤退整顿', '🏆 抵达第 1 关');
        await c1.context.close();
        // ② 无尽（撤退）
        const c2 = await newContext(browser);
        await gotoHome(c2.page);
        await startBattleFromSetup(c2.page, 'endless');
        await answerOnceThenQuit(c2.page, 'S7-②无尽(quit)', '🏳️ 撤退整顿', '⚔️ 击杀');
        await c2.context.close();
        // ③ 复习（撤退）：种子已学词，review 池才有内容
        const seeded = baseSave();
        DICT_WORDS.forEach((w, i) => { seeded.mastery[w] = { lv: 2, seen: 3, ok: 2, wrong: 1, last: 0, due: 0, wrongStreak: 0, ease: 2.0 }; });
        const c3 = await newContext(browser, seeded);
        await gotoHome(c3.page);
        await startBattleFromSetup(c3.page, 'review');
        await answerOnceThenQuit(c3.page, 'S7-③复习(quit)', '🏳️ 复习中途退出', '📖 复习');
        await c3.context.close();
        // ④ 每日远征（撤退）
        const c4 = await newContext(browser);
        await gotoHome(c4.page);
        await startBattleFromSetup(c4.page, 'expedition', null);
        await answerOnceThenQuit(c4.page, 'S7-④远征(quit)', '🏳️ 远征撤退', '🚀 远征积分');
        await c4.context.close();
        // ⑤ 听写（撤退）：拼 1 词后退出
        const c5 = await newContext(browser);
        await gotoHome(c5.page);
        await startBattleFromSetup(c5.page, 'dictation');
        const spellR = await battleSpell(c5.page, 1);
        ok('S7-⑤ 听写拼写 1 词成功', spellR === 'ok' || spellR === 'ended', spellR);
        await quitBattle(c5.page);
        await c5.page.waitForSelector('#scr-result.active', { timeout: 8000 });
        await assertResult(c5.page, 'S7-⑤听写(quit)', '🏳️ 听写中途退出', '🎧 听写');
        await c5.context.close();
        // ⑥ 词魂肉鸽（撤退）：天赋三选一 → 诅咒签 → 开战
        const c6 = await newContext(browser);
        await gotoHome(c6.page);
        await c6.page.click('#btn-rogue');
        await c6.page.waitForSelector('#scr-rogue.active', { timeout: 5000 });
        await c6.page.click('#btn-rogue-start');
        await c6.page.waitForSelector('[data-rogue-t]', { timeout: 5000 });
        // 天赋三选一是随机的：ranger（听音游侠）会把全场题强制成拼写题，选择题作答循环答不了
        // ——点非 ranger 的那张（三选一至多出现一张 ranger，必有余下两张可选）
        const tIds = await c6.page.evaluate(() => Array.from(document.querySelectorAll('[data-rogue-t]')).map(el => el.getAttribute('data-rogue-t')));
        const pickT = tIds.find(id => id !== 'ranger') || tIds[0];
        await c6.page.click('[data-rogue-t="' + pickT + '"]');
        await c6.page.waitForSelector('[data-rogue-c]', { timeout: 5000 });
        await c6.page.click('[data-rogue-c]');
        await c6.page.waitForSelector('#scr-battle.active', { timeout: 8000 });
        const rogueRun = await c6.page.evaluate(() => !!run && !!run.rogue && !run.ended);
        ok('S7-⑥ 肉鸽开局（run.rogue 就位）', rogueRun);
        await answerOnceThenQuit(c6.page, 'S7-⑥肉鸽(quit)', '🏳️ 词魂撤退', '🎲');
        await c6.context.close();
        // ⑦ 毒池应战（撤退）—— 复用 S3 挑战码（毒怪 hp≥2，答 1 题不致终局）
        const c7 = await newContext(browser);
        await gotoHome(c7.page);
        await c7.page.click('#btn-poison');
        await c7.page.waitForSelector('#io-overlay:not([hidden])', { timeout: 5000 });
        await c7.page.fill('#io-text', poisonCode);
        await c7.page.click('#io-ok');
        await c7.page.waitForSelector('#scr-battle.active', { timeout: 8000 });
        await battleChoice(c7.page, 1);
        const stillFighting = await c7.page.evaluate(() => run && !run.ended);
        if (stillFighting) await c7.page.click('#btn-quit');
        await waitResult(c7.page, 15000);   /* 答对一题也可能正好击杀末只毒怪（撤退/终局二选一，都出同一结算屏） */
        await assertResult(c7.page, 'S7-⑦毒池(quit)', '🏳️ 逃出毒池', '☠️ 毒词攻克');
        await c7.context.close();
      }

      /* ============ S8 · R11 一致性回归（弹层按钮组 / Esc 逃生 / 图鉴返回刷新主页） ============ */
      console.log('---- S8 一致性回归 ----');
      {
        const c8 = await newContext(browser);
        await gotoHome(c8.page);
        // ① 导出存档态：按钮组自适应（关闭在位、无同义取消）+ Esc 逃生通道
        await c8.page.click('#btn-settings');
        await c8.page.waitForSelector('#scr-settings.active', { timeout: 5000 });
        await c8.page.click('#btn-export');
        await c8.page.waitForSelector('#io-overlay:not([hidden])', { timeout: 5000 });
        const expBtns = await c8.page.evaluate(() => ({
          okLabel: document.getElementById('io-ok').textContent,
          cancelHidden: document.getElementById('io-cancel').hidden,
          copyHidden: document.getElementById('io-copy').hidden
        }));
        ok('S8-① 导出态按钮组自适应（复制+关闭在位 · 无同义「取消」）', !expBtns.copyHidden && expBtns.cancelHidden && expBtns.okLabel === '关闭', JSON.stringify(expBtns));
        await c8.page.keyboard.press('Escape');
        await sleep(200);
        const escClosed = await c8.page.evaluate(() => document.getElementById('io-overlay').hidden);
        ok('S8-① Esc 关闭存档弹层（io 弹层补齐逃生通道）', escClosed);
        // ② 导入态：粘贴类隐藏「复制」，取消仍在
        await c8.page.click('#btn-import');
        await c8.page.waitForSelector('#io-overlay:not([hidden])', { timeout: 5000 });
        const impBtns = await c8.page.evaluate(() => ({
          okLabel: document.getElementById('io-ok').textContent,
          cancelHidden: document.getElementById('io-cancel').hidden,
          copyHidden: document.getElementById('io-copy').hidden
        }));
        ok('S8-② 导入态按钮组自适应（确定+取消在位 · 无「复制」）', !impBtns.cancelHidden && impBtns.copyHidden && impBtns.okLabel === '确定', JSON.stringify(impBtns));
        await c8.page.keyboard.press('Escape');
        await sleep(150);
        await c8.page.click('#btn-settings-back');
        await c8.page.waitForSelector('#scr-home.active', { timeout: 8000 });
        // ③ 图鉴「标记已掌握」→ 返回主页，主页「已掌握」chips 即时同步（不 reload）
        const chipBefore = await c8.page.evaluate(() => document.getElementById('home-mastered').textContent);
        await c8.page.click('#btn-codex');
        await c8.page.waitForSelector('#scr-codex.active', { timeout: 5000 });
        await sleep(400);
        await c8.page.evaluate(() => document.querySelector('#codex-list .cx-row').click());
        await c8.page.waitForSelector('#word-overlay:not([hidden])', { timeout: 5000 });
        await c8.page.click('#wo-master');   // 标记后详情卡自动关闭
        await sleep(300);
        const savedN = await c8.page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('wq_save_v1')).mastery).filter(m => m.lv >= 5).length);
        await c8.page.click('#btn-codex-back');
        await c8.page.waitForSelector('#scr-home.active', { timeout: 8000 });
        await sleep(200);
        const chipAfter = await c8.page.evaluate(() => document.getElementById('home-mastered').textContent);
        ok('S8-③ 图鉴标记已掌握入档（save 掌握数=' + savedN + '）', savedN >= 1);
        ok('S8-③ 返回主页「已掌握」chips 同步（' + chipBefore + ' → ' + chipAfter + '，无 reload）', String(chipAfter) === String(savedN) && String(chipAfter) !== String(chipBefore), 'chip=' + chipAfter);
        ok('S8 无页面异常（pageerror=0）', c8.errors.length === 0, c8.errors.join(' | '));
        await c8.context.close();
      }

      /* ============ S9 · 键盘可达性（Tab 序 / Enter 激活 / div 卡片 / 弹层焦点） ============ */
      console.log('---- S9 键盘可达性 ----');
      {
        const c9 = await newContext(browser);
        const page = c9.page;
        await gotoHome(page);
        await sleep(300);
        // ① 主页 Tab 序列覆盖四组 IA 12 入口 + 工具行（DOM 顺序 = 视觉顺序）
        const ids = [];
        for (let i = 0; i < 40; i++) {
          await page.keyboard.press('Tab');
          const cur = await page.evaluate(() => document.activeElement.id || '');
          if (!cur) break;
          if (ids.indexOf(cur) < 0) ids.push(cur); else break;   // 循环回起点即收
        }
        const need9 = ['btn-adventure', 'btn-rogue', 'btn-expedition', 'btn-lab', 'btn-dict', 'btn-poison',
          'btn-duel', 'btn-realm', 'btn-packs', 'btn-endless', 'btn-review', 'btn-match',
          'btn-wrongbook', 'btn-codex', 'btn-ach', 'btn-talent', 'btn-settings', 'btn-help', 'btn-feedback'];
        const missing9 = need9.filter(id => ids.indexOf(id) < 0);
        ok('S9-① 主页 Tab 序列含四组 IA 12 入口 + 工具行（缺 ' + missing9.length + '）', missing9.length === 0, missing9.join(','));
        // ② Enter 激活（四组入口之一：词魂肉鸽）
        await page.focus('#btn-rogue');
        await page.keyboard.press('Enter');
        let enterOk = false;
        try { await page.waitForSelector('#scr-rogue.active', { timeout: 4000 }); enterOk = true; } catch (e) {}
        ok('S9-② 焦点 + Enter 激活 btn-rogue → scr-rogue', enterOk);
        await page.click('#btn-rogue-back');
        await backHome(page);
        // ③ 图鉴词行（div）可聚焦 + Enter 打开详情卡 + Esc 关闭 + 焦点归还
        await page.click('#btn-codex');
        await page.waitForSelector('#scr-codex.active', { timeout: 5000 });
        await sleep(400);
        const cx = await page.evaluate(() => {
          const row = document.querySelector('#codex-list .cx-row');
          if (!row) return null;
          row.focus();
          return { focused: document.activeElement === row, tabindex: row.getAttribute('tabindex'), role: row.getAttribute('role') };
        });
        ok('S9-③ 图鉴词行可聚焦（tabindex=0 role=button）', !!cx && cx.focused && cx.tabindex === '0' && cx.role === 'button', JSON.stringify(cx));
        await page.keyboard.press('Enter');
        let cxOpen = false;
        try { await page.waitForSelector('#word-overlay:not([hidden])', { timeout: 4000 }); cxOpen = true; } catch (e) {}
        ok('S9-③ 词行 Enter → 单词详情卡打开', cxOpen);
        const focusIn = await page.evaluate(() => !!document.activeElement.closest('#word-overlay'));
        ok('S9-③ 弹层打开后焦点已移入弹层（免 Tab 穿背景页）', focusIn);
        await page.keyboard.press('Escape');
        await sleep(200);
        const cxBack = await page.evaluate(() => ({
          closed: document.getElementById('word-overlay').hidden,
          backCls: String(document.activeElement.className || '')
        }));
        ok('S9-③ Esc 关闭词详情卡（弹层补逃生通道）', cxBack.closed);
        ok('S9-③ 关闭后焦点归还触发词行', cxBack.backCls.indexOf('cx-row') >= 0, cxBack.backCls);
        await page.click('#btn-codex-back');
        await backHome(page);
        // ④ 记忆配对卡（div）可聚焦 + Enter 翻牌
        await page.click('#btn-match');
        await page.waitForSelector('#scr-match.active', { timeout: 5000 });
        await sleep(350);
        const mc = await page.evaluate(() => {
          const c = document.querySelector('#match-grid .mcard');
          if (!c) return null;
          c.focus();
          return { focused: document.activeElement === c, tabindex: c.getAttribute('tabindex'), role: c.getAttribute('role') };
        });
        ok('S9-④ 配对卡可聚焦（tabindex=0 role=button）', !!mc && mc.focused && mc.tabindex === '0' && mc.role === 'button', JSON.stringify(mc));
        await page.keyboard.press('Enter');
        await sleep(350);
        const mcOpen = await page.evaluate(() => {
          const c = document.querySelector('#match-grid .mcard');
          return c && c.className.indexOf('open') >= 0;
        });
        ok('S9-④ 配对卡 Enter → 翻牌（open 类挂上）', mcOpen === true);
        await page.click('#btn-match-back');
        await backHome(page);
        // ⑤ 肉鸽天赋三选一（div 卡）键盘锁定
        await page.click('#btn-rogue');
        await page.waitForSelector('#scr-rogue.active', { timeout: 5000 });
        await page.click('#btn-rogue-start');
        await page.waitForSelector('[data-rogue-t]', { timeout: 5000 });
        const rc = await page.evaluate(() => {
          const c = document.querySelector('[data-rogue-t]');
          c.focus();
          return { focused: document.activeElement === c, tabindex: c.getAttribute('tabindex'), role: c.getAttribute('role'), id: c.getAttribute('data-rogue-t') };
        });
        ok('S9-⑤ 肉鸽天赋卡可聚焦（tabindex=0 role=button）', !!rc && rc.focused && rc.tabindex === '0' && rc.role === 'button', JSON.stringify(rc));
        await page.keyboard.press('Enter');
        await sleep(250);
        const rcPick = await page.evaluate(id0 => (typeof rogueDraft !== 'undefined' && rogueDraft) ? rogueDraft.talent === id0 : false, rc ? rc.id : '');
        ok('S9-⑤ 天赋卡 Enter → 锁定（rogueDraft.talent 命中）', rcPick === true);
        await page.click('#btn-rogue-back');
        await backHome(page);
        // ⑥ io 弹层焦点管理：打开即入弹层，Esc 关闭归还触发按钮
        await page.click('#btn-settings');
        await page.waitForSelector('#scr-settings.active', { timeout: 5000 });
        await page.click('#btn-import');
        await page.waitForSelector('#io-overlay:not([hidden])', { timeout: 5000 });
        const ioIn = await page.evaluate(() => ({
          inOverlay: !!document.activeElement.closest('#io-overlay'),
          id: document.activeElement.id || document.activeElement.tagName
        }));
        ok('S9-⑥ io 弹层打开后焦点入弹层（' + ioIn.id + '）', ioIn.inOverlay);
        await page.keyboard.press('Escape');
        await sleep(200);
        const ioBack = await page.evaluate(() => ({
          closed: document.getElementById('io-overlay').hidden,
          focusId: document.activeElement.id || ''
        }));
        ok('S9-⑥ Esc 关闭 io 弹层且焦点归还 #btn-import', ioBack.closed && ioBack.focusId === 'btn-import', JSON.stringify(ioBack));
        ok('S9 无页面异常（pageerror=0）', c9.errors.length === 0, c9.errors.join(' | '));
        await c9.context.close();
      }

      /* ============ S10 · 色弱冗余标记（词性徽标 / ✓✕ 字形 / 投影距离） ============ */
      console.log('---- S10 色弱冗余标记 ----');
      {
        const seed10 = baseSave();
        seed10.settings = { sound: true, autoplay: false, bgm: false, rate: 0.9, qtypes: { c2e: true, e2c: true, spell: false, listen: false } };
        const c10 = await newContext(browser, seed10);
        const page = c10.page;
        await gotoHome(page);
        await startBattleFromSetup(page, 'adventure');
        // ① 词性文字徽标：与出题词词性一致（BOSS / 无词性词隐藏 = 正确降级）
        await page.waitForFunction(() => typeof run !== 'undefined' && run && run.q && !run.q.locked
          && document.querySelectorAll('#q-options .q-opt').length >= 2, { timeout: 15000 });
        await sleep(200);
        const posChk = await page.evaluate(() => {
          var POS_TXT = { n: '名词', v: '动词', adj: '形容词', adv: '副词', prep: '虚词', conj: '虚词', pron: '虚词' };
          var el = document.getElementById('monster-pos');
          var pos = run.q && run.q.word ? posOf(run.q.word.m) : '';
          var boss = run.monster ? !!run.monster.boss : false;
          return {
            hidden: el ? el.hidden : null, text: el ? el.textContent : null,
            want: POS_TXT[pos] || null, boss: boss
          };
        });
        if (posChk.boss || !posChk.want) {
          ok('S10-① 词性徽标正确降级（BOSS/无词性词 → 隐藏）', posChk.hidden === true, JSON.stringify(posChk));
        } else {
          ok('S10-① 词性徽标在位且文字=词性（' + posChk.text + '）', posChk.hidden === false && posChk.text === posChk.want, JSON.stringify(posChk));
        }
        // ② 故意答错一题：correct/wrong 选项各带 ✓ / ✕ 字形（形状冗余，不依赖色觉）
        const st10 = await page.evaluate(() => ({
          opts: Array.from(document.querySelectorAll('#q-options .q-opt')).map(b => b.textContent.replace(/^[0-9]+/, '').trim()),
          qtype: run.q.type,
          word: run.q.word ? run.q.word.w : null,
          meaning: run.q.word ? run.q.word.m : null
        }));
        const wrongIdx = Math.max(0, st10.opts.findIndex(o => o !== (st10.qtype === 'e2c' ? st10.meaning : st10.word)));
        await page.click('#q-options .q-opt >> nth=' + wrongIdx);
        await sleep(300);
        const marks = await page.evaluate(() => {
          const pick = cls => {
            const el = document.querySelector('#q-options .' + cls);
            return el ? { glyph: getComputedStyle(el, '::before').content, border: getComputedStyle(el).borderTopColor } : null;
          };
          return { correct: pick('correct'), wrong: pick('wrong') };
        });
        ok('S10-② 正确选项带 ✓ 字形冗余标记', !!marks.correct && String(marks.correct.glyph).indexOf('✓') >= 0, JSON.stringify(marks.correct));
        ok('S10-② 选错选项带 ✕ 字形冗余标记', !!marks.wrong && String(marks.wrong.glyph).indexOf('✕') >= 0, JSON.stringify(marks.wrong));
        // ③ 数值投影：对错状态色经 protanopia/deuteranopia 矩阵投影后仍可区分（阈值 40/765）
        const projDist = await page.evaluate(() => {
          var PROT = [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998];
          var DEUT = [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.011820, 0.042940, 0.968881];
          var hex2 = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
          var proj = (rgb, m) => [0, 1, 2].map(i => Math.max(0, Math.min(255, m[i * 3] * rgb[0] + m[i * 3 + 1] * rgb[1] + m[i * 3 + 2] * rgb[2])));
          var dst = (a, b) => Math.round(Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2));
          var good = hex2(getComputedStyle(document.documentElement).getPropertyValue('--c-good').trim());
          var badc = hex2(getComputedStyle(document.documentElement).getPropertyValue('--c-bad').trim());
          return { protan: dst(proj(good, PROT), proj(badc, PROT)), deutan: dst(proj(good, DEUT), proj(badc, DEUT)) };
        });
        ok('S10-③ 对错色 protan 投影距离 ≥40（实际 ' + projDist.protan + '）', projDist.protan >= 40, JSON.stringify(projDist));
        ok('S10-③ 对错色 deutan 投影距离 ≥40（实际 ' + projDist.deutan + '，✓✕ 字形为冗余兜底）', projDist.deutan >= 40, JSON.stringify(projDist));
        /* 清场：关掉记忆卡让战斗继续，撤退进结算结束本局 */
        await page.waitForFunction(() => !document.getElementById('memcard').hidden, { timeout: 8000 }).catch(() => {});
        await page.click('#mem-ok').catch(() => {});
        await sleep(300);
        await quitBattle(page);
        await waitResult(page, 15000);
        ok('S10 无页面异常（pageerror=0）', c10.errors.length === 0, c10.errors.join(' | '));
        await c10.context.close();
      }

      /* ============ S11 · 触屏目标 ≥44px（实测 rect；checkbox/radio 取 label 命中区） ============ */
      console.log('---- S11 触屏目标 ≥44px ----');
      {
        const c11 = await newContext(browser, baseSave(), { touch: true });
        const page = c11.page;
        await gotoHome(page);
        await sleep(400);
        /* 收集当前页全部可交互元素的命中区 rect（弹层内元素也含；checkbox/radio 用包裹
           label 的 rect——触屏点的是 label；背景屏被弹层覆盖时不算可命中） */
        const MEASURE = () => {
          const els = document.querySelectorAll('button, a[href], input, select, textarea, [onclick], .cx-row, .mcard, .filter, [role="button"], .q-opt, .spell-chip');
          const out = [];
          const seen = new Set();
          els.forEach(el => {
            if (seen.has(el)) return; seen.add(el);
            if (el.closest('[hidden]')) return;
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') return;
            let r = el.getBoundingClientRect();
            const wrapped = (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) ? el.closest('label') : null;
            if (wrapped) r = wrapped.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) return;
            if (!el.closest('.overlay') && !el.closest('.screen.active')) return;
            out.push({ sel: (el.id ? '#' + el.id : '.' + String(el.className).trim().split(/\s+/).join('.')), w: Math.round(r.width), h: Math.round(r.height) });
          });
          return out;
        };
        const assert44 = (label, rects) => {
          const small = rects.filter(r => Math.min(r.w, r.h) < 44);
          ok('S11 ' + label + ' 全部交互目标 ≥44px（' + rects.length + ' 个，小 ' + small.length + '）', small.length === 0, JSON.stringify(small.slice(0, 6)));
        };
        // ① 四组 IA：菜单分组内每个按钮逐一实测（ask 指定规模）
        const groupBtns = await page.evaluate(() => Array.from(document.querySelectorAll('.menu-group-body .btn')).map(b => {
          const r = b.getBoundingClientRect();
          return { id: b.id, w: Math.round(r.width), h: Math.round(r.height) };
        }));
        const smallGroup = groupBtns.filter(b => Math.min(b.w, b.h) < 44);
        ok('S11-① 四组 IA ' + groupBtns.length + ' 个按钮逐一 ≥44px（' + groupBtns.map(b => b.id).join(',') + '）', groupBtns.length >= 9 && smallGroup.length === 0, JSON.stringify(groupBtns));
        // ② 主页整页（含更多玩法行/工具行/chips 内按钮）
        assert44('主页整页', await page.evaluate(MEASURE));
        // ③ 出战设置
        await page.click('#btn-adventure');
        await page.waitForSelector('#scr-setup.active', { timeout: 5000 });
        await sleep(300);
        assert44('出战设置', await page.evaluate(MEASURE));
        await page.click('#btn-start');
        await page.waitForSelector('#scr-battle.active', { timeout: 8000 });
        // ④ 战斗页：等首题亮出再测（横幅期 q-options 未渲染会漏测）
        await page.waitForFunction(() => typeof run !== 'undefined' && run && run.q && document.querySelectorAll('#q-options .q-opt, #spell-chips .spell-chip').length > 0, { timeout: 15000 }).catch(() => {});
        await sleep(300);
        assert44('战斗页（首题亮出）', await page.evaluate(MEASURE));
        await page.click('#btn-quit');
        await page.waitForSelector('#scr-result.active', { timeout: 8000 });
        assert44('结算页', await page.evaluate(MEASURE));
        await page.click('#btn-result-home');
        await backHome(page);
        // ⑤ 图鉴 + 设置 + 词境（触屏 rect 最容易塌的三页）
        await page.click('#btn-codex');
        await page.waitForSelector('#scr-codex.active', { timeout: 5000 });
        await sleep(350);
        assert44('单词图鉴', await page.evaluate(MEASURE));
        await page.click('#btn-codex-back');
        await backHome(page);
        await page.click('#btn-settings');
        await page.waitForSelector('#scr-settings.active', { timeout: 5000 });
        assert44('设置页', await page.evaluate(MEASURE));
        await page.click('#btn-settings-back');
        await backHome(page);
        await page.click('#btn-realm');
        await page.waitForSelector('#scr-realm.active', { timeout: 5000 });
        await sleep(250);
        assert44('词境工坊', await page.evaluate(MEASURE));
        await page.click('#btn-realm-back');
        await backHome(page);
        // ⑥ 记忆配对（触屏高频界面，r14 起纳入实测）
        await page.click('#btn-match');
        await page.waitForSelector('#scr-match.active', { timeout: 5000 });
        await sleep(300);
        assert44('记忆配对', await page.evaluate(MEASURE));
        ok('S11 无页面异常（pageerror=0）', c11.errors.length === 0, c11.errors.join(' | '));
        await c11.context.close();
      }

      /* ============ S12 · 焦点管理专项：四组 IA 主要交互后焦点不掉 BODY ============
         遍历 答题 / 商店 / 弹层开关 / 词境工坊 / 记忆配对（触屏流程），每次交互后断言
         document.activeElement 落在可交互元素或面板容器上——混合设备（触屏+键盘）的
         键盘锚点不允许悬空到 BODY（r14 新增维度）。触屏仿真上下文（tap 输入）。 */
      console.log('---- S12 焦点不掉 BODY（触屏仿真） ----');
      {
        const seed12 = baseSave();
        seed12.coins = 300;   // 保底可购买，商店重建断言不必看金币脸色
        const c12 = await newContext(browser, seed12, { touch: true });
        const page = c12.page;
        await gotoHome(page);
        /* 焦点判定：activeElement 不得是 BODY，且必须落在可交互元素或激活面板容器内 */
        const assertFocus = async (label) => {
          const r = await page.evaluate(() => {
            const ae = document.activeElement;
            if (!ae || ae === document.body) return { ok: false, ae: 'BODY' };
            const interactive = ae.closest('button, a[href], input, select, textarea, [tabindex], [role="button"], .q-opt, .mcard, .spell-chip');
            const panel = ae.closest('.screen.active, .overlay');
            if (interactive || panel) return { ok: true, ae: (ae.id || ae.className || ae.tagName).toString().slice(0, 30) };
            return { ok: false, ae: (ae.id || ae.className || ae.tagName).toString().slice(0, 30) };
          });
          ok(label, r.ok, 'activeElement=' + r.ae);
        };
        // ① 答题：tap 选项 → 焦点在按钮；下一题渲染（renderQuestion 移焦）→ 焦点在战斗屏容器
        await page.tap('#btn-adventure');
        await page.waitForSelector('#scr-setup.active', { timeout: 5000 });
        await assertFocus('S12-① 进出战设置后焦点在面板');
        await page.tap('#btn-start');
        await page.waitForSelector('#scr-battle.active', { timeout: 8000 });
        await page.waitForFunction(() => typeof run !== 'undefined' && run && run.q && !run.q.locked
          && document.querySelectorAll('#q-options .q-opt').length >= 2, { timeout: 15000 });
        await sleep(250);
        const st12 = await page.evaluate(() => ({
          opts: Array.from(document.querySelectorAll('#q-options .q-opt')).map(b => b.textContent.replace(/^[0-9]+/, '').trim()),
          qtype: run.q.type, word: run.q.word ? run.q.word.w : null, meaning: run.q.word ? run.q.word.m : null
        }));
        const want12 = st12.qtype === 'e2c' ? st12.meaning : st12.word;
        const idx12 = st12.opts.findIndex(o => o === want12);
        ok('S12-① 战斗选择题就位', idx12 >= 0, JSON.stringify(st12.opts));
        await page.tap('#q-options .q-opt >> nth=' + idx12);
        await sleep(250);
        await assertFocus('S12-① 答题 tap 后焦点落在选项/弹层（不掉 BODY）');
        await sleep(1700);   // 等下一题渲染（renderQuestion 移交焦点给 scr-battle 容器）
        await assertFocus('S12-① 下一题渲染后焦点在战斗屏容器（不掉 BODY）');
        // ② 商店：打穿第 1 关 → tap 购买 → 整店重建后焦点续接货架按钮
        const shopR = await battleChoice(page, 'shop');
        ok('S12-② 打通第 1 关进商店', shopR === 'shop', shopR);
        await sleep(300);
        const buyIdx = await page.evaluate(() => {
          const bs = Array.from(document.querySelectorAll('#shop-items button')).filter(b => !b.disabled);
          return bs.length ? Array.prototype.indexOf.call(document.querySelectorAll('#shop-items button'), bs[0]) : -1;
        });
        if (buyIdx >= 0) {
          await page.tap('#shop-items button >> nth=' + buyIdx);
          await sleep(350);
          await assertFocus('S12-② 商店购买整店重建后焦点续接货架/面板（不掉 BODY）');
        } else {
          skip('S12-② 商店购买重建焦点续接', '货架全部买不起（金币不足）');
        }
        await page.tap('#btn-next-stage');
        await page.waitForSelector('#scr-battle.active', { timeout: 8000 });
        await sleep(400);
        await quitBattle(page);
        await waitResult(page, 15000);
        await page.tap('#btn-result-home');
        await page.waitForSelector('#scr-home.active', { timeout: 8000 });
        await sleep(200);
        await assertFocus('S12-② 结算回主页焦点在 scr-home 容器');
        // ③ 弹层开关：设置→导入（焦点入弹层）→Esc（焦点归还触发键）→返回；图鉴词卡同查
        await page.tap('#btn-settings');
        await page.waitForSelector('#scr-settings.active', { timeout: 5000 });
        await assertFocus('S12-③ 进设置页焦点在面板');
        await page.tap('#btn-import');
        await page.waitForSelector('#io-overlay:not([hidden])', { timeout: 5000 });
        await assertFocus('S12-③ io 弹层打开焦点入弹层');
        await page.keyboard.press('Escape');
        await sleep(200);
        await assertFocus('S12-③ Esc 关弹层焦点归还（不掉 BODY）');
        await page.tap('#btn-settings-back');
        await page.waitForSelector('#scr-home.active', { timeout: 8000 });
        await sleep(200);
        await page.tap('#btn-codex');
        await page.waitForSelector('#scr-codex.active', { timeout: 5000 });
        await sleep(350);
        await page.tap('#codex-list .cx-row');
        await page.waitForSelector('#word-overlay:not([hidden])', { timeout: 5000 });
        await assertFocus('S12-③ 词详情卡打开焦点入弹层');
        await page.keyboard.press('Escape');
        await sleep(200);
        await assertFocus('S12-③ Esc 关词卡焦点归还词行（不掉 BODY）');
        await page.tap('#btn-codex-back');
        await page.waitForSelector('#scr-home.active', { timeout: 8000 });
        await sleep(200);
        await assertFocus('S12-③ 图鉴返回主页焦点在面板');
        // ④ 词境工坊：输入框聚焦 → 生成 → 焦点仍在触发按钮 → 返回
        await page.tap('#btn-realm');
        await page.waitForSelector('#scr-realm.active', { timeout: 5000 });
        await page.tap('#realm-custom-text');
        await assertFocus('S12-④ 词境文本域 tap 后聚焦文本域');
        await page.fill('#realm-custom-text', 'abandon v. 放弃\nability 能力\nabsorb 吸收\nabstract 抽象');   // 与 S5 同源 4 词（词境最少词数门槛）
        await page.tap('#btn-realm-gen');
        await page.waitForSelector('#realm-share:not([hidden])', { timeout: 5000 });
        await assertFocus('S12-④ 生成词境码后焦点仍在触发按钮（不掉 BODY）');
        await page.tap('#btn-realm-back');
        await page.waitForSelector('#scr-home.active', { timeout: 8000 });
        await sleep(200);
        await assertFocus('S12-④ 词境返回主页焦点在面板');
        // ⑤ 记忆配对触屏流程：逐对 tap 配对整盘，每次交互后焦点不掉 BODY；收官焦点到「再来一局」
        await page.tap('#btn-match');
        await page.waitForSelector('#scr-match.active', { timeout: 5000 });
        await sleep(350);
        await assertFocus('S12-⑤ 进配对屏焦点在面板');
        for (let round = 0; round < 10; round++) {
          const pair = await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll('#match-grid .mcard'));
            const info = cards.map((c, i) => {
              const t = c.textContent.replace(/\s+/g, ' ').trim().replace(/^[^A-Za-z\u4e00-\u9fa5]*/, '');
              return { i: i, done: c.classList.contains('done'), isWord: /^[a-zA-Z][a-zA-Z-]+$/.test(t), text: t };
            });
            const w = info.find(c => c.isWord && !c.done);
            if (!w) return null;
            const def = (typeof MEANING_OF !== 'undefined') ? MEANING_OF[w.text] : null;
            const d = info.find(c => !c.done && !c.isWord && def && c.text === def);
            return w && d ? { wi: w.i, di: d.i } : null;
          });
          if (!pair) break;
          /* 触屏仿真偶发丢 tap / 撞上失配锁（r15 实测一次 1/8 对；隔离复跑 5×8/8 全成、
             基线 R14 也在本节抖过）。两条护栏，均不掩盖真回归：
             ① 每次 tap 前等 match.lock 释放（失配后 750ms 锁定期内 tap 被游戏忽略）；
             ② 词卡 tap 后校验 .open，未开补 tap 一次——词卡是本轮首个翻牌且游戏对
                已开卡直接忽略 tap（onMatchCard 的 c.open 短路），补 tap 无副作用；
             ③ 释义卡（完成配对的那一下）绝不按 .open 校验/补 tap：配对成功时游戏立即
                done=true 且 open=false，对着已配对卡（pointer-events:none + matchPop）
                补 tap 会让 playwright 卡死在 not stable/intercepts（r15 首版加固误伤，已撤）。
             游戏侧若真坏了（tap 翻不开牌），补 tap 后仍 open=false，8/8 断言照常失败 */
          await page.waitForFunction(() => !(typeof match !== 'undefined' && match && match.lock), { timeout: 2500 }).catch(() => {});
          await page.tap('#match-grid .mcard >> nth=' + pair.wi);
          await sleep(260);
          const wOpen = await page.evaluate(i => document.querySelectorAll('#match-grid .mcard')[i].classList.contains('open'), pair.wi);
          if (!wOpen) {
            await page.waitForFunction(() => !(typeof match !== 'undefined' && match && match.lock), { timeout: 2500 }).catch(() => {});
            await page.tap('#match-grid .mcard >> nth=' + pair.wi);
            await sleep(260);
          }
          await page.waitForFunction(() => !(typeof match !== 'undefined' && match && match.lock), { timeout: 2500 }).catch(() => {});
          await page.tap('#match-grid .mcard >> nth=' + pair.di);
          await sleep(300);
          await assertFocus('S12-⑤ 配对第 ' + (round + 1) + ' 对后焦点不掉 BODY');
        }
        const pairs12 = await page.evaluate(() => document.getElementById('match-pairs').textContent);
        ok('S12-⑤ 配对整盘完成（' + pairs12.trim() + '）', pairs12.indexOf('/8') >= 0 && pairs12.indexOf('8/8') >= 0, pairs12);
        await assertFocus('S12-⑤ 收官焦点在「再来一局」按钮（不掉 BODY）');
        await page.tap('#btn-match-restart');
        await sleep(400);
        await assertFocus('S12-⑤ tap 再来一局后焦点仍在面板内');
        ok('S12 无页面异常（pageerror=0）', c12.errors.length === 0, c12.errors.join(' | '));
        await c12.context.close();
      }

      /* ============ S13 · 触屏注入：pointer/touch 事件驱动记忆配对全流程 ============
         页内合成 PointerEvent 注入（tap 翻牌 / 拖拽撞击 / 失配弹回 / pointercancel 中断 /
         收官续局），全流程断言配对结果与焦点不落 BODY（r14 新增维度）。 */
      console.log('---- S13 触屏注入配对全流程 ----');
      {
        const c13 = await newContext(browser, baseSave(), { touch: true });
        const page = c13.page;
        await gotoHome(page);
        await page.tap('#btn-match');
        await page.waitForSelector('#scr-match.active', { timeout: 5000 });
        await sleep(350);
        const pairsState = () => page.evaluate(() => document.getElementById('match-pairs').textContent.trim());
        const aeDesc = () => page.evaluate(() => {
          const ae = document.activeElement;
          return ae === document.body ? 'BODY' : (ae.id || ae.className || ae.tagName).toString().slice(0, 28);
        });
        const findPairIdx = () => page.evaluate(() => {
          const cards = Array.from(document.querySelectorAll('#match-grid .mcard'));
          const info = cards.map((c, i) => {
            const t = c.textContent.replace(/\s+/g, ' ').trim().replace(/^[^A-Za-z\u4e00-\u9fa5]*/, '');
            return { i: i, done: c.classList.contains('done'), isWord: /^[a-zA-Z][a-zA-Z-]+$/.test(t), text: t };
          });
          const w = info.find(c => c.isWord && !c.done);
          if (!w) return null;
          const def = (typeof MEANING_OF !== 'undefined') ? MEANING_OF[w.text] : null;
          const d = info.find(c => !c.done && !c.isWord && def && c.text === def);
          const wrong = info.find(c => !c.done && !c.isWord && (!def || c.text !== def));
          return { wi: w.i, di: d ? d.i : -1, wrongDi: wrong ? wrong.i : -1, left: info.filter(c => !c.done).length };
        });
        /* 页内 pointer 事件注入器：tap = pointerdown+pointerup 原地点击；
           synthetic pointerId 自选，setPointerCapture 对伪指针抛错由游戏自身 try/catch 兜住 */
        const tapCard = (wi) => page.evaluate(w => {
          const cards = document.querySelectorAll('#match-grid .mcard');
          const r = cards[w].getBoundingClientRect();
          const o = { bubbles: true, cancelable: true, pointerId: 11, pointerType: 'touch', isPrimary: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
          cards[w].dispatchEvent(new PointerEvent('pointerdown', o));
          cards[w].dispatchEvent(new PointerEvent('pointerup', o));
        }, wi);
        // ① 失配弹回：tap 词卡 + tap 错误释义卡 → 锁定弹回，步数+1、对数不变、焦点不落 BODY
        let st = await findPairIdx();
        ok('S13-① 前置：配对局面可读（剩 ' + (st ? st.left : '?') + ' 张）', !!st && st.wrongDi >= 0, JSON.stringify(st));
        await tapCard(st.wi);
        await sleep(260);
        await tapCard(st.wrongDi);
        await sleep(200);
        const mismatchState = await page.evaluate(() => ({
          pairs: document.getElementById('match-pairs').textContent.trim(),
          moves: document.getElementById('match-moves').textContent.trim(),
          openN: document.querySelectorAll('#match-grid .mcard.open').length,
          ghost: document.querySelectorAll('.mcard-ghost').length
        }));
        ok('S13-① 失配锁定（对数 0/8 · 开牌 2 · 无 ghost 残留）', mismatchState.pairs.indexOf('0/8') >= 0 && mismatchState.openN === 2 && mismatchState.ghost === 0, JSON.stringify(mismatchState));
        ok('S13-① 失配后焦点不落 BODY（' + (await aeDesc()) + '）', (await aeDesc()) !== 'BODY', await aeDesc());
        await sleep(850);   // 等弹回（750ms 锁定）
        const bounced = await page.evaluate(() => ({ openN: document.querySelectorAll('#match-grid .mcard.open').length, locked: !match || match.lock }));
        ok('S13-① 0.75s 后弹回复位（开牌 ' + bounced.openN + ' · 解锁）', bounced.openN === 0 && !bounced.locked, JSON.stringify(bounced));
        // ② 拖拽撞击配对：pointerdown→move 序→pointerup 落到同词异类卡
        st = await findPairIdx();
        await page.evaluate(({ wi, di }) => {
          const cards = document.querySelectorAll('#match-grid .mcard');
          const rect = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
          const a = rect(cards[wi]), b = rect(cards[di]);
          const o = p => ({ bubbles: true, cancelable: true, pointerId: 21, pointerType: 'touch', isPrimary: true, clientX: p.x, clientY: p.y });
          const grid = document.getElementById('match-grid');
          cards[wi].dispatchEvent(new PointerEvent('pointerdown', o(a)));
          for (let k = 1; k <= 3; k++) grid.dispatchEvent(new PointerEvent('pointermove', o({ x: a.x + (b.x - a.x) * k / 3, y: a.y + (b.y - a.y) * k / 3 })));
          cards[di].dispatchEvent(new PointerEvent('pointerup', o(b)));
        }, { wi: st.wi, di: st.di });
        await sleep(250);
        let ps = await pairsState();
        ok('S13-② 拖拽撞击配对成功（' + ps + '）', ps.indexOf('1/8') >= 0, ps);
        ok('S13-② 拖拽配对后焦点不落 BODY（' + (await aeDesc()) + '）', (await aeDesc()) !== 'BODY', await aeDesc());
        // ③ pointercancel 中断拖拽：ghost 清理、局面可继续
        const cancelSt = await page.evaluate(() => {
          const cards = document.querySelectorAll('#match-grid .mcard');
          const free = Array.prototype.findIndex.call(cards, c => !c.classList.contains('done'));
          const r = cards[free].getBoundingClientRect();
          const o = { bubbles: true, cancelable: true, pointerId: 31, pointerType: 'touch', isPrimary: true, clientX: r.left + 8, clientY: r.top + 8 };
          cards[free].dispatchEvent(new PointerEvent('pointerdown', o));
          document.getElementById('match-grid').dispatchEvent(new PointerEvent('pointermove', Object.assign({}, o, { clientX: o.clientX + 46, clientY: o.clientY + 30 })));
          const during = document.querySelectorAll('.mcard-ghost').length;
          document.getElementById('match-grid').dispatchEvent(new PointerEvent('pointercancel', o));
          return { during: during, after: document.querySelectorAll('.mcard-ghost').length };
        });
        await sleep(200);
        ok('S13-③ pointercancel 清 ghost（中 ' + cancelSt.during + ' → 后 ' + cancelSt.after + '）', cancelSt.during === 1 && cancelSt.after === 0, JSON.stringify(cancelSt));
        // ④ tap 翻牌逐对推进到收官（每次配对后焦点不落 BODY）
        for (let round = 0; round < 10; round++) {
          const p2 = await findPairIdx();
          if (!p2 || p2.di < 0) break;
          await tapCard(p2.wi);
          await sleep(240);
          await tapCard(p2.di);
          await sleep(230);
          const d = await aeDesc();
          if (d === 'BODY') { ok('S13-④ 第 ' + (round + 1) + ' 对 tap 配对后焦点不落 BODY', false, 'BODY'); break; }
          ps = await pairsState();
          if (ps.indexOf('8/8') >= 0) break;
        }
        ps = await pairsState();
        ok('S13-④ tap 流程打完整盘（' + ps + '）', ps.indexOf('8/8') >= 0, ps);
        // ⑤ 收官：焦点到「再来一局」，tap 续局开出新盘
        const finDesc = await aeDesc();
        ok('S13-⑤ 收官焦点在「再来一局」（' + finDesc + '）', await page.evaluate(() => document.activeElement === document.getElementById('btn-match-restart')), finDesc);
        const timeBeforeRestart = await page.evaluate(() => document.getElementById('match-time').textContent.trim());
        await page.tap('#btn-match-restart');
        await sleep(450);
        const timeAfterRestart = await page.evaluate(() => document.getElementById('match-time').textContent.trim());
        ok('S13-⑤ 续局计时立即归零（' + timeBeforeRestart + ' → ' + timeAfterRestart + '，r15 遗留清零回归）',
          /0\s*秒/.test(timeAfterRestart), timeAfterRestart);
        ps = await pairsState();
        ok('S13-⑤ 续局新盘（' + ps + '）', ps.indexOf('0/8') >= 0, ps);
        ok('S13-⑤ 续局后焦点不落 BODY（' + (await aeDesc()) + '）', (await aeDesc()) !== 'BODY', await aeDesc());
        ok('S13 无页面异常（pageerror=0）', c13.errors.length === 0, c13.errors.join(' | '));
        await c13.context.close();
      }

      /* ============ S14 · r15 动效状态机 & 动效预算 ============
         手感层的类名/属性状态机断言 + 动效性能预算回归：
         A. 统一转场：:root 挂 --t-dur/--t-ease；屏切换/弹层容器/弹层卡片/对决揭示
            四处 animation-duration 同源（= --t-dur 计算值 0.32s）。
         B. 主页首屏渐入：logo 同时挂 homeIn+logoBob，第 4 块（stat-chips）错峰 135ms。
         C. 关键帧预算：扫 styleSheets 全部 @keyframes，属性 ⊆ {transform,opacity,
            filter,box-shadow}——只许合成/绘制层属性，禁止 width/left/margin 等
            layout 属性混入（答题循环 60fps 底线的回归护栏）。
         D. 连击节奏：连答 3 → scr-battle.combo-heat-1 + 徽章 .show+.tier-up（换挡重锤）；
            答错（连击≥3 被打断）→ q-card.shake + .q-opt.wrong + 正确项
            .correct.reveal（延迟强调）+ 💔 连击中断 fx。
         E. 失血警示层次：注入 addPressure 直达 55%/90%——pressure-wrap.w50/.w90、
            dmg-1/dmg-3 裂纹分档、critical 条、标签文案三档联动。
         F. 结算数字滚动：.rs-n 滚动完成后 data-v === textContent（不残留中间值）。
         G. 横幅点按跳过：tap #banner → 立即 hidden 且后续题目照常渲染。
         H. 切屏回顶：图鉴滚到深处 → 返回主页 scrollY===0（r15 瑕疵修复回归）。 */
      console.log('---- S14 动效状态机 & 动效预算 ----');
      {
        const c14 = await newContext(browser, baseSave());
        const page = c14.page;
        const errors14 = [];
        page.on('pageerror', e => errors14.push(e.message));
        await page.goto(BASE_URL + '/', { waitUntil: 'load' });
        await page.waitForSelector('#scr-home.active', { timeout: 15000 });

        // A. 统一转场 tokens 与四处出场动效同源
        const uni = await page.evaluate(() => {
          const cs = el => getComputedStyle(el);
          const root = document.documentElement;
          const home = document.getElementById('scr-home');
          const memOv = document.getElementById('memcard');
          const memBox = memOv.querySelector('.memcard-box');
          const duelRev = document.getElementById('duel-reveal');
          return {
            tDur: root.style.getPropertyValue('--t-dur') || getComputedStyle(root).getPropertyValue('--t-dur').trim(),
            tEase: root.style.getPropertyValue('--t-ease') || getComputedStyle(root).getPropertyValue('--t-ease').trim(),
            homeDur: cs(home).animationDuration,
            memOvDur: cs(memOv).animationDuration,
            memBoxDur: cs(memBox).animationDuration,
            duelDur: cs(duelRev).animationDuration
          };
        });
        ok('S14-A :root 挂 --t-dur/--t-ease（' + uni.tDur + ' / ' + uni.tEase.slice(0, 26) + '…）',
          uni.tDur.indexOf('s') >= 0 && uni.tEase.indexOf('cubic-bezier') >= 0, JSON.stringify(uni));
        ok('S14-A 屏切换/弹层容器/弹层卡片/对决揭示时长同源（' + [uni.homeDur, uni.memOvDur, uni.memBoxDur, uni.duelDur].join(' / ') + '）',
          uni.homeDur === uni.memOvDur && uni.memOvDur === uni.memBoxDur && uni.memBoxDur === uni.duelDur && uni.homeDur !== '0s',
          JSON.stringify(uni));

        // B. 主页首屏渐入：logo 双动画 + 逐块错峰
        const homeFx = await page.evaluate(() => {
          const cs = el => getComputedStyle(el);
          const kids = document.querySelectorAll('.home-inner > *');
          return {
            logoName: cs(document.querySelector('.logo')).animationName,
            logoDur: cs(document.querySelector('.logo')).animationDuration,
            chipsDelay: cs(kids[3]).animationDelay,
            chipsName: cs(kids[3]).animationName
          };
        });
        ok('S14-B logo 挂 homeIn+logoBob（' + homeFx.logoName + '）',
          homeFx.logoName.indexOf('homeIn') >= 0 && homeFx.logoName.indexOf('logoBob') >= 0, homeFx.logoName);
        ok('S14-B 首屏逐块错峰（第 4 块 delay=' + homeFx.chipsDelay + '）',
          homeFx.chipsName.indexOf('homeIn') >= 0 && parseFloat(homeFx.chipsDelay) > 0 && parseFloat(homeFx.chipsDelay) <= 0.2, JSON.stringify(homeFx));

        // C. 关键帧预算：全部 @keyframes 属性 ⊆ 合成/绘制层白名单
        /* 注意：@keyframes 容器的 CSSRule.type 是 7（KEYFRAMES_RULE），8 是容器内层的
           KEYFRAME_RULE——首版按 8 过滤顶层规则，扫过 0 组，断言空转。这里改用
           instanceof CSSKeyframesRule 判定（S14-C 扫过 0 组 = 测试自身的 bug，r15 修正） */
        const kfScan = await page.evaluate(() => {
          const ALLOWED = ['transform', 'opacity', 'filter', 'box-shadow'];
          const bad = [];
          let count = 0;
          for (const ss of Array.from(document.styleSheets)) {
            let rules;
            try { rules = ss.cssRules; } catch (e) { continue; }
            if (!rules) continue;
            for (let i = 0; i < rules.length; i++) {
              const r = rules[i];
              const isKf = (typeof CSSKeyframesRule !== 'undefined' && r instanceof CSSKeyframesRule) || r.type === 7;
              if (!isKf) continue;
              count++;
              const kfs = r.cssRules || [];
              for (let j = 0; j < kfs.length; j++) {
                const st = kfs[j].style;
                for (let k = 0; k < st.length; k++) {
                  const p = st[k];
                  if (ALLOWED.indexOf(p) < 0) bad.push(r.name + ':' + p);
                }
              }
            }
          }
          return { bad: bad, count: count };
        });
        ok('S14-C 关键帧预算：@keyframes 属性全在 transform/opacity/filter/box-shadow 内（扫过 ' + kfScan.count + ' 组）',
          kfScan.bad.length === 0 && kfScan.count > 0, kfScan.bad.join(' | ') || ('count=' + kfScan.count));

        // D. 战斗动效状态机：连击档位 / 答错抖动+正确词高亮 / 连击中断反馈
        await page.click('#btn-endless');
        await page.waitForSelector('#scr-setup.active', { timeout: 5000 });
        await page.click('#btn-start');
        await page.waitForSelector('#scr-battle.active', { timeout: 8000 });
        // 连答 3 题正确（无尽模式怪 1 血，连击跨过 heat-1 档）；拼写题（无选项）等待超时换题不计次
        let comboState = { combo: 0, show: false, tier: false, heat1: false };
        for (let i = 0; i < 16 && comboState.combo < 3; i++) {
          const st = await page.evaluate(READ_STATE);
          if (st.ended) break;
          if (st.memcard) { await page.click('#mem-ok').catch(() => {}); await sleep(300); continue; }
          if (st.locked) { await sleep(300); continue; }
          const want = st.qtype === 'e2c' ? st.meaning : st.word;
          const idx = st.opts.findIndex(o => o === want);
          if (idx < 0) { await sleep(400); continue; }
          await page.click('#q-options .q-opt >> nth=' + idx);
          comboState = await page.evaluate(() => {
            const b = document.getElementById('battle-combo');
            const s = document.getElementById('scr-battle');
            return { show: b.classList.contains('show'), tier: b.classList.contains('tier-up'),
              heat1: s.classList.contains('combo-heat-1'), combo: (typeof run !== 'undefined' && run) ? run.combo : 0 };
          });
          await sleep(1100);
        }
        ok('S14-D 连击徽章 .show（连答至 ≥3 连）', comboState.combo >= 3 && comboState.show, JSON.stringify(comboState));
        ok('S14-D 连击跨档徽章重锤 .tier-up（3 连档位抬升瞬间）', comboState.tier);
        ok('S14-D 全屏火浪档位 combo-heat-1（≥3 连）', comboState.heat1);
        // 答错 1 次：抖动 + ✕ + 正确项 .correct.reveal 双类 + 连击中断 fx（连击 3 已攒够）
        let shakeSeen = false, revealSeen = false, breakFxSeen = false;
        for (let t = 0; t < 25 && !shakeSeen; t++) {
          const st = await page.evaluate(READ_STATE);
          if (st.ended) break;
          if (st.memcard) { await page.click('#mem-ok').catch(() => {}); await sleep(280); continue; }
          if (st.locked) { await sleep(300); continue; }
          const wrongIdx = Math.max(0, st.opts.findIndex(o => o !== st.word));
          await page.click('#q-options .q-opt >> nth=' + wrongIdx);
          const fx = await page.evaluate(() => ({
            shake: document.getElementById('q-card').classList.contains('shake'),
            wrong: document.querySelectorAll('#q-options .q-opt.wrong').length,
            reveal: document.querySelectorAll('#q-options .q-opt.correct.reveal').length,
            brk: Array.prototype.some.call(document.querySelectorAll('#fx-layer .fx-dmg'), n => n.textContent.indexOf('连击被打断') >= 0)
          }));
          shakeSeen = fx.shake;
          revealSeen = fx.wrong >= 1 && fx.reveal === 1;
          breakFxSeen = fx.brk;
          await sleep(500);
        }
        ok('S14-D 答错题卡抖动 .shake', shakeSeen);
        ok('S14-D 答错标 ✕ 且正确项挂 .correct.reveal（延迟强调双类）', revealSeen);
        ok('S14-D 连击≥3 被打断出现 💔 中断反馈', breakFxSeen);
        // 关掉可能弹出的记忆卡再注入压境值（怪 1 血无尽局答错后必有记忆卡链）
        for (let t = 0; t < 10; t++) {
          const st = await page.evaluate(READ_STATE);
          if (!st.memcard) break;
          await page.click('#mem-ok').catch(() => {});
          await sleep(280);
        }
        // E. 失血警示层次：注入 addPressure（真实游戏函数）直达三档（52 → w50/dmg-1，+40 → 92 w90/dmg-3/critical）
        const w50 = await page.evaluate(() => { addPressure(52); return {
          wrap: document.getElementById('pressure-wrap').className,
          label: document.getElementById('pressure-label').textContent }; });
        ok('S14-E 过半档：pressure-wrap 挂 w50+dmg-1（' + w50.label + '）',
          w50.wrap.indexOf('w50') >= 0 && w50.wrap.indexOf('dmg-1') >= 0, w50.wrap);
        const w90 = await page.evaluate(() => { addPressure(40); return {
          wrap: document.getElementById('pressure-wrap').className,
          bar: document.getElementById('pressure-bar').className,
          label: document.getElementById('pressure-label').textContent }; });
        ok('S14-E 危急档：w90+dmg-3+critical 全挂（' + w90.label + '）',
          w90.wrap.indexOf('w90') >= 0 && w90.wrap.indexOf('dmg-3') >= 0 && w90.bar.indexOf('critical') >= 0, w90.wrap + ' / ' + w90.bar);
        // 撤退进结算（F. 数字滚动断言）
        await quitBattle(page);
        await waitResult(page, 15000);
        await sleep(850);   // 等 620ms 数字滚动收官
        const roll = await page.evaluate(() => {
          const ns = Array.from(document.querySelectorAll('#result-stats .rs-n'));
          return {
            n: ns.length,
            done: ns.every(b => b.textContent === b.getAttribute('data-v')),
            chipAnim: getComputedStyle(document.querySelector('#result-stats .chip')).animationName
          };
        });
        ok('S14-F 结算数字滚动落位：.rs-n ' + roll.n + ' 个且 data-v===textContent', roll.n >= 3 && roll.done,
          JSON.stringify(roll));
        ok('S14-F 结算 chips 逐个上浮（homeIn）', roll.chipAnim.indexOf('homeIn') >= 0, roll.chipAnim);
        // G. 横幅点按跳过：再开一局冒险，横幅出现即点
        await page.click('#btn-result-home');
        await page.waitForSelector('#scr-home.active', { timeout: 8000 });
        await page.click('#btn-adventure');
        await page.waitForSelector('#scr-setup.active', { timeout: 5000 });
        await page.click('#btn-start');
        await page.waitForSelector('#banner:not([hidden])', { timeout: 8000 });
        await page.click('#banner');
        const bannerGone = await page.evaluate(() => document.getElementById('banner').hidden);
        ok('S14-G 横幅点按立即跳过（hidden=true）', bannerGone);
        await sleep(600);
        const qReady = await page.evaluate(() => typeof run !== 'undefined' && !!run && !!run.q
          && document.getElementById('scr-battle').classList.contains('active'));
        ok('S14-G 跳过后题目照常渲染（run.q 就位）', qReady);
        // H. 切屏回顶：图鉴滚到深处 → 返回主页 scrollY===0
        await quitBattle(page);
        await waitResult(page, 15000);
        await sleep(850);
        await page.click('#btn-result-home');
        await page.waitForSelector('#scr-home.active', { timeout: 8000 });
        await page.click('#btn-codex');
        await page.waitForSelector('#scr-codex.active', { timeout: 5000 });
        await page.evaluate(() => window.scrollTo(0, 99999));
        await sleep(150);
        const deepY = await page.evaluate(() => window.scrollY);
        await page.click('#btn-codex-back');
        await page.waitForSelector('#scr-home.active', { timeout: 8000 });
        const backY = await page.evaluate(() => window.scrollY);
        ok('S14-H 图鉴深处滚动生效（scrollY=' + deepY + '）', deepY > 200, 'deepY=' + deepY);
        ok('S14-H 返回主页回顶（scrollY=' + backY + '，r15 瑕疵修复回归）', backY === 0, 'backY=' + backY);
        ok('S14 无页面异常（pageerror=0）', errors14.length === 0, errors14.join(' | '));
        await c14.context.close();
      }

      /* ============ S15 · 连局压测：同一页面连打 10 局完整对局（r16 新增维度） ============
         主线/远征/肉鸽/听写/热座 各 2 局混排（顺序 1-5 再来一轮），全程不 reload——
         这正是泄漏/异常积累的温床。每局完整走到结算屏（热座为收官面板）并点「返回主页」。
         断言：A 每局结算判定逐局核对 + 返回主页成功；B 全程零 pageerror（逐局）；
         C JS heap 增长 ≤8MB——每局回主页后 CDP 强制 GC（HeapProfiler.collectGarbage，
         与 NV 压测同款手法）再采样 performance.memory，增长量 = 第 10 局采样 − 第 1 局采样
         （同主页状态对比，日常 GC 抖动不进差值）；performance.memory 不可得时按 SKIP。 */
      console.log('---- S15 连局压测（10 局混排） ----');
      {
        const c15 = await newContext(browser);
        const page = c15.page;
        const errors15 = [];
        page.on('pageerror', e => errors15.push(e.message));
        await page.goto(BASE_URL + '/', { waitUntil: 'load' });
        await page.waitForSelector('#scr-home.active', { timeout: 15000 });
        /* CDP 强制 GC 会话：建一次全程复用；会话断开等异常只影响当次采样精度 */
        const cdp15 = await page.context().newCDPSession(page);
        const heapMB = async () => {
          try { await cdp15.send('HeapProfiler.collectGarbage'); } catch (e) {}
          return page.evaluate(() => performance.memory
            ? Math.round(performance.memory.usedJSHeapSize / 1048576 * 10) / 10 : null);
        };
        const heapStart = await heapMB();   // 开局前采样（诊断用，不进增长差值）
        /* 结算收口：结算屏标题核对 → 返回主页按钮 → scr-home 激活 */
        const settleAndHome = async (label, wantTitle) => {
          await waitResult(page, 15000);
          const r = await page.evaluate(() => ({
            active: document.getElementById('scr-result').classList.contains('active'),
            title: document.getElementById('result-title').textContent,
            homeBtn: !!document.getElementById('btn-result-home')
          }));
          ok('S15 ' + label + ' · 结算屏激活且标题=' + wantTitle, r.active && r.title === wantTitle, JSON.stringify(r));
          ok('S15 ' + label + ' · 返回主页按钮在位', r.homeBtn);
          await page.click('#btn-result-home');
          await page.waitForSelector('#scr-home.active', { timeout: 8000 });
          ok('S15 ' + label + ' · 已回主页', true);
        };
        /* 热座收官收口：duel-done 面板 + 判定文案 + 战绩入档（plays +1）→ ← 返回 → scr-home */
        const duelDoneAndHome = async (label, playsBefore) => {
          const r = await page.evaluate(p0 => ({
            done: !document.getElementById('duel-done').hidden,
            verdict: (document.querySelector('#duel-result .duel-verdict') || {}).textContent || '',
            chips: document.querySelectorAll('#duel-result .chip').length,
            plays: (JSON.parse(localStorage.getItem('wq_save_v1')).duel || {}).plays || 0,
            p0: p0
          }), playsBefore);
          ok('S15 ' + label + ' · 对决收官面板（判定=' + r.verdict + ' · 双队 chips=' + r.chips + '）',
            r.done && r.chips >= 2 && (r.verdict.indexOf('获胜') >= 0 || r.verdict.indexOf('平分秋色') >= 0), JSON.stringify(r));
          ok('S15 ' + label + ' · 对局战绩入档（plays ' + r.p0 + ' → ' + r.plays + '）', r.plays === r.p0 + 1, JSON.stringify(r));
          await page.click('#btn-duel-back');
          await page.waitForSelector('#scr-home.active', { timeout: 8000 });
          ok('S15 ' + label + ' · 已回主页', true);
        };
        /* 热座一整局：进对决屏 → 12 问轮流交接（ready → 点正确项 → 揭晓 1.5s）→ 收官面板；
           首次交接/首次出题各锚定一次焦点断言（r15 遗留清零回归：handoff 焦点交
           #btn-duel-ready、出题后交 #scr-duel 屏容器）。返回 turn 数供诊断 */
        const duelPlayFull = async (label) => {
          await page.click('#btn-duel');
          await page.waitForSelector('#scr-duel.active', { timeout: 5000 });
          await page.click('#btn-duel-start');
          const focusChecked = { handoff: false, q: false };
          for (let guard = 0; guard < 80; guard++) {
            const st = await page.evaluate(() => {
              const d = (typeof duel === 'undefined') ? null : duel;
              return {
                phase: d ? d.phase : null, turn: d ? d.turn : 0,
                donePanel: !document.getElementById('duel-done').hidden,
                answer: d && d.q ? d.q.answer : null,
                locked: d && d.q ? !!d.q.locked : true
              };
            });
            if (st.donePanel) return st.turn;
            if (!st.phase) return -1;
            if (st.phase === 'handoff') {
              if (!focusChecked.handoff) {
                focusChecked.handoff = true;
                const ae = await page.evaluate(() => (document.activeElement || {}).id || '');
                ok('S15 ' + label + ' · 交接横幅焦点锚定 #btn-duel-ready（r15 遗留清零回归）', ae === 'btn-duel-ready', 'activeElement=' + ae);
              }
              await page.click('#btn-duel-ready'); await sleep(220); continue;
            }
            if (st.phase === 'q' && !st.locked && st.answer !== null) {
              if (!focusChecked.q) {
                focusChecked.q = true;
                const ae = await page.evaluate(() => (document.activeElement || {}).id || '');
                ok('S15 ' + label + ' · 出题后焦点锚定 #scr-duel 容器（r15 遗留清零对称回归）', ae === 'scr-duel', 'activeElement=' + ae);
              }
              await page.click('#duel-opts .q-opt >> nth=' + st.answer).catch(() => {});
              await sleep(1750);   /* 揭晓停留 1.5s（答对路径）后进下一题交接 */
              continue;
            }
            await sleep(280);
          }
          return -2;
        };
        /* 肉鸽开局共用：天赋避开 ranger（全场强制拼写题，选择题循环答不了）→ 诅咒签 → 开战 */
        const rogueStart = async () => {
          await page.click('#btn-rogue');
          await page.waitForSelector('#scr-rogue.active', { timeout: 5000 });
          await page.click('#btn-rogue-start');
          await page.waitForSelector('[data-rogue-t]', { timeout: 5000 });
          const tIds = await page.evaluate(() => Array.from(document.querySelectorAll('[data-rogue-t]')).map(el => el.getAttribute('data-rogue-t')));
          await page.click('[data-rogue-t="' + (tIds.find(id => id !== 'ranger') || tIds[0]) + '"]');
          await page.waitForSelector('[data-rogue-c]', { timeout: 5000 });
          await page.click('[data-rogue-c]');
          await page.waitForSelector('#scr-battle.active', { timeout: 8000 });
        };
        /* 每局结束后统一收口：heap 采样 + 逐局零 pageerror */
        const afterGame = async (n) => {
          heaps15.push(await heapMB());
          ok('S15 第' + n + '局 · 零 pageerror（累计 ' + errors15.length + '）', errors15.length === 0, errors15.join(' | '));
        };
        const heaps15 = [];

        /* ---------- 第 1-5 局 ---------- */
        await startBattleFromSetup(page, 'adventure');
        await battleChoice(page, 2);
        await quitBattle(page);
        await settleAndHome('第1局·主线冒险', '🏳️ 撤退整顿');
        await afterGame(1);

        await startBattleFromSetup(page, 'expedition', null);
        await battleChoice(page, 1);
        await quitBattle(page);
        await settleAndHome('第2局·每日远征', '🏳️ 远征撤退');
        await afterGame(2);

        await rogueStart();
        await battleChoice(page, 1);
        await quitBattle(page);
        await settleAndHome('第3局·词魂肉鸽', '🏳️ 词魂撤退');
        await afterGame(3);

        await startBattleFromSetup(page, 'dictation', 10);
        const d15a = await battleSpell(page, 10);   // 全 10 词拼完 = 自然终局
        ok('S15 第4局·听写 · 10 词拼完（' + d15a + '）', d15a === 'ok' || d15a === 'ended', d15a);
        await settleAndHome('第4局·听写挑战', '🎧 听写挑战完成！');
        await afterGame(4);

        let duelPlays = await page.evaluate(() => (JSON.parse(localStorage.getItem('wq_save_v1')).duel || {}).plays || 0);
        const duelTurns1 = await duelPlayFull('第5局·热座');
        ok('S15 第5局·热座 · 12 问打满（turn=' + duelTurns1 + '）', duelTurns1 === 12, 'turn=' + duelTurns1);
        await duelDoneAndHome('第5局·热座对决', duelPlays);
        await afterGame(5);

        /* ---------- 第 6-10 局 ---------- */
        await startBattleFromSetup(page, 'adventure');
        await battleChoice(page, 1);
        await quitBattle(page);
        await settleAndHome('第6局·主线冒险', '🏳️ 撤退整顿');
        await afterGame(6);

        await startBattleFromSetup(page, 'expedition', null);
        await battleChoice(page, 1);
        await quitBattle(page);
        await settleAndHome('第7局·每日远征', '🏳️ 远征撤退');
        await afterGame(7);

        await rogueStart();
        await battleChoice(page, 1);
        await quitBattle(page);
        await settleAndHome('第8局·词魂肉鸽', '🏳️ 词魂撤退');
        await afterGame(8);

        await startBattleFromSetup(page, 'dictation', 10);
        await battleSpell(page, 3);
        await quitBattle(page);
        await settleAndHome('第9局·听写挑战', '🏳️ 听写中途退出');
        await afterGame(9);

        duelPlays = await page.evaluate(() => (JSON.parse(localStorage.getItem('wq_save_v1')).duel || {}).plays || 0);
        const duelTurns2 = await duelPlayFull('第10局·热座');
        ok('S15 第10局·热座 · 12 问打满（turn=' + duelTurns2 + '）', duelTurns2 === 12, 'turn=' + duelTurns2);
        await duelDoneAndHome('第10局·热座对决', duelPlays);
        await afterGame(10);

        /* ---------- 压测总判定：零 pageerror + heap 增长 ≤8MB ---------- */
        ok('S15 全程零 pageerror（10 局累计 ' + errors15.length + '）', errors15.length === 0, errors15.slice(0, 6).join(' | '));
        if (heaps15.length === 10 && heaps15.every(h => h !== null)) {
          const growth = Math.round((heaps15[9] - heaps15[0]) * 10) / 10;
          ok('S15 JS heap 增长 ≤8MB（第1局后 ' + heaps15[0] + 'MB → 第10局后 ' + heaps15[9] + 'MB，增长 ' + growth + 'MB，开局前 ' + heapStart + 'MB）',
            growth <= 8, 'growth=' + growth);
          /* 基线行（供后续轮次对比，勿删除） */
          console.log('S15-HEAP ' + JSON.stringify({ heapStartMB: heapStart, samplesMB: heaps15, growthMB: growth }));
        } else {
          skip('S15 JS heap 增长 ≤8MB', 'performance.memory 不可得（samples=' + JSON.stringify(heaps15) + '）');
        }
        await c15.context.close();
      }

      /* ============ S16 · 间隔重复与记忆画像（r17 新增维度） ============
         A 排程计算：页内真实 srsReview 走「新词→1天→3天→7天→成熟」晋升链与答错降档
         B 到期队列：空态文案（无到期不空开局）/ 主页入口计数 / 明天才到期与远期成熟不入队
         C 复习会话：答对晋升+落盘（st/due 写回 localStorage）/ 答错降档+立即到期 /
           复习完成结算（晋升·降档 chips）
         D 记忆画像：词根拆解行 / 无词根词音节兜底 / 联想一行 / 例句填空（首字母提示
           aria-expanded 展开 → 揭晓换真词）
         E 结算三词卡：错词入选，点击直达记忆画像
         F 词景：映射 ≥6 类且每类 ≥10 条 / 全库覆盖率统计（SCENE-STATS 基线行）/
           题面仅词面暴露题型显示（e2c）且内容与 sceneOf 一致 / c2e 防泄题不显示
         G 连击 5 里程碑 fx 显示所连单词串（🔗 5 连击：… 与 run.comboWords 一致） */
      console.log('---- S16 间隔重复与记忆画像（r17） ----');
      {
        /* ---------- A. 排程计算：晋升链 / 降档（页内真实函数） ---------- */
        const c16a = await newContext(browser);
        {
          const page = c16a.page;
          const errorsA = [];
          page.on('pageerror', e => errorsA.push(e.message));
          await gotoHome(page);
          const chain = await page.evaluate(() => {
            const DAY = 864e5, out = [];
            const snap = w => { const e = (JSON.parse(JSON.stringify(save.srs)))[w]; return e; };
            srsReview('abandon', true);   // 生词首答对 → 1 天档
            let t = Date.now(), e = snap('abandon');
            out.push({ k: 'st1', st: e.st, dt: e.due - t });
            srsReview('abandon', true); t = Date.now(); e = snap('abandon');   // → 3 天档
            out.push({ k: 'st2', st: e.st, dt: e.due - t });
            srsReview('abandon', true); t = Date.now(); e = snap('abandon');   // → 7 天档
            out.push({ k: 'st3', st: e.st, dt: e.due - t });
            srsReview('abandon', true); t = Date.now(); e = snap('abandon');   // → 成熟
            out.push({ k: 'st4', st: e.st, dt: e.due - t });
            srsReview('abandon', true); t = Date.now(); e = snap('abandon');   // 成熟维持
            out.push({ k: 'st4b', st: e.st, dt: e.due - t });
            srsReview('abandon', false); e = snap('abandon');                  // 答错降档
            out.push({ k: 'down', st: e.st, dueNow: e.due <= Date.now() });
            srsReview('ability', false); const e2 = snap('ability');           // 新词答错维持新词
            out.push({ k: 'down0', st: e2.st, dueNow: e2.due <= Date.now() });
            out.push({ k: 'iv', iv: JSON.parse(JSON.stringify(SRS_INTERVAL_DAYS)), max: SRS_STAGE_MAX });
            return out;
          });
          ok('S16-A 档位阶梯常量 [1,3,7,30] / 上限 4', JSON.stringify(chain[7].iv) === '[1,3,7,30]' && chain[7].max === 4, JSON.stringify(chain[7].iv) + '/' + chain[7].max);
          ok('S16-A 生词答对 → 1 天档（due≈+1 天）', chain[0].st === 1 && Math.abs(chain[0].dt - 864e5) < 3000, JSON.stringify(chain[0]));
          ok('S16-A 1天档答对 → 3 天档（due≈+3 天）', chain[1].st === 2 && Math.abs(chain[1].dt - 3 * 864e5) < 3000, JSON.stringify(chain[1]));
          ok('S16-A 3天档答对 → 7 天档（due≈+7 天）', chain[2].st === 3 && Math.abs(chain[2].dt - 7 * 864e5) < 3000, JSON.stringify(chain[2]));
          ok('S16-A 7天档答对 → 成熟（due≈+30 天）', chain[3].st === 4 && Math.abs(chain[3].dt - 30 * 864e5) < 3000, JSON.stringify(chain[3]));
          ok('S16-A 成熟档答对维持成熟（30 天回归）', chain[4].st === 4 && Math.abs(chain[4].dt - 30 * 864e5) < 3000, JSON.stringify(chain[4]));
          ok('S16-A 答错降档且立即到期', chain[5].st === 3 && chain[5].dueNow, JSON.stringify(chain[5]));
          ok('S16-A 新词答错维持新词档', chain[6].st === 0 && chain[6].dueNow, JSON.stringify(chain[6]));
          ok('S16-A 排程零页面异常', errorsA.length === 0, errorsA.join(' | '));
        }
        await c16a.context.close();

        /* ---------- B. 空态：无到期词 → 明确空态文案，不空开局 ---------- */
        const c16b = await newContext(browser);
        {
          const page = c16b.page;
          await gotoHome(page);
          const emptySub = await page.textContent('#srs-sub');
          ok('S16-B 无到期词入口空态文案（今日没有到期词…）', emptySub.indexOf('今日没有到期词') >= 0, emptySub);
          await page.click('#btn-srs-review');
          await sleep(500);
          const after = await page.evaluate(() => ({
            home: document.getElementById('scr-home').classList.contains('active'),
            battle: document.getElementById('scr-battle').classList.contains('active'),
            toast: (document.querySelector('#toast-wrap .toast:last-child') || {}).textContent || ''
          }));
          ok('S16-B 点击后仍留主页（不空开局）', after.home && !after.battle, JSON.stringify(after));
          ok('S16-B 空态 toast 提示', after.toast.indexOf('今天没有到期') >= 0, after.toast);
        }
        await c16b.context.close();

        /* ---------- B2+C. 到期队列入口 → 复习会话：答对晋升/答错降档并落盘 ----------
           r18 口径回归（遗留池）：absorb 种子为「新词档 st=0」——答错（新词维持 0 档）
           后立即重考答对 → 实际晋升 0→1，结算 chips 必须计入 ⬆️晋升（旧口径按
           「有答错=降档」把它错记成 ⬇️）；ability 种子 st=2 连错两次 → 实际降档 ⬇️。 */
        const seedSrs = baseSave();
        seedSrs.settings = { choiceOnlyMigrated: true, c2eOnlyMigrated: true, bgmOffMigrated: true,
          qtypes: { c2e: true, e2c: false, spell: false, listen: false } };
        const DAY_MS = 864e5;
        seedSrs.srs = {
          abandon: { st: 1, due: Date.now() - 3 * DAY_MS, ok: 1, wrong: 0, t: Date.now() },   // 最逾期
          absorb: { st: 0, due: Date.now() - 1 * DAY_MS, ok: 0, wrong: 1, t: Date.now() },   // 新词档：先错后对 → 晋升
          ability: { st: 2, due: Date.now() - 12 * 3600e3, ok: 2, wrong: 0, t: Date.now() }, // 1天档：连错两次 → 降档
          accent: { st: 1, due: Date.now() + 36 * 3600e3, ok: 1, wrong: 0, t: Date.now() },   // 36h 后=明天才到期 → 不计入今日
          account: { st: 4, due: Date.now() + 20 * DAY_MS, ok: 5, wrong: 0, t: Date.now() }   // 成熟远期 → 不计入
        };
        const c16c = await newContext(browser, seedSrs);
        {
          const page = c16c.page;
          const errorsC = [];
          page.on('pageerror', e => errorsC.push(e.message));
          await gotoHome(page);
          const sub = await page.textContent('#srs-sub');
          ok('S16-B2 入口计数「今日到期 3 词」（明天的 accent / 远期 account 不计）',
            sub.indexOf('今日到期 3 词') >= 0, sub);
          await page.click('#btn-srs-review');
          await page.waitForSelector('#scr-battle.active', { timeout: 8000 });
          await page.waitForFunction(() => typeof run !== 'undefined' && run && run.q, { timeout: 15000 });
          const sess0 = await page.evaluate(() => ({ mode: run.mode, total: run.reviewTotal, word: run.q.word.w,
            banner: document.getElementById('banner-box').textContent }));
          ok('S16-C 会话 mode=srs / 词队列=3', sess0.mode === 'srs' && sess0.total === 3, JSON.stringify(sess0));
          ok('S16-C 横幅为「今日待复习 · 答对晋升/答错降档」',
            sess0.banner.indexOf('今日待复习') >= 0 && sess0.banner.indexOf('答对晋升') >= 0 && sess0.banner.indexOf('不扣血') >= 0, sess0.banner);
          ok('S16-C 队列最逾期优先（第 1 词=abandon）', sess0.word === 'abandon', sess0.word);

          /* 答对 abandon：st 1→2，due≈+3 天，并已落盘（localStorage 读档核对） */
          await battleChoice(page, 1);
          await sleep(500);
          const savedUp = await page.evaluate(() => JSON.parse(localStorage.getItem('wq_save_v1')).srs.abandon);
          ok('S16-C 答对晋升落盘：abandon st 1→2', savedUp.st === 2, JSON.stringify(savedUp));
          ok('S16-C 答对排程落盘：due≈now+3 天', Math.abs(savedUp.due - (Date.now() + 3 * 864e5)) < 5000, savedUp.due - Date.now());

          /* 答错 absorb（新词档 st=0）：维持 0 档且 due≤now（记忆卡弹出即已落盘）→ 重考答对晋升 1 */
          await page.waitForFunction(() => typeof run !== 'undefined' && run && run.q && run.q.word.w === 'absorb', { timeout: 15000 });
          await answerWrongOnce(page);
          await page.waitForSelector('#memcard:not([hidden])', { timeout: 8000 });
          const savedDown = await page.evaluate(() => JSON.parse(localStorage.getItem('wq_save_v1')).srs.absorb);
          ok('S16-C 新词答错维持新词档（st 0→0）且立即到期', savedDown.st === 0 && savedDown.due <= Date.now(), JSON.stringify(savedDown));
          await page.click('#mem-ok');
          await page.waitForFunction(() => typeof run !== 'undefined' && run && run.q && !run.q.locked, { timeout: 15000 });
          const retryWord = await page.evaluate(() => run.q.word.w);
          ok('S16-C 答错后同词重考（absorb）', retryWord === 'absorb', retryWord);
          await battleChoice(page, 1);
          await sleep(500);
          const savedRetry = await page.evaluate(() => JSON.parse(localStorage.getItem('wq_save_v1')).srs.absorb);
          ok('S16-C 先错后对（新词档）实际晋升 st 0→1（r18 口径：同词先错后对不再错记为降档）', savedRetry.st === 1, JSON.stringify(savedRetry));

          /* 答错 ability 两次（1天档）：降档路径——重考再错 → 复仇/重出题链自动续打至结算 */
          await page.waitForFunction(() => typeof run !== 'undefined' && run && run.q && run.q.word.w === 'ability', { timeout: 20000 });
          await answerWrongOnce(page);
          await page.waitForSelector('#memcard:not([hidden])', { timeout: 8000 });
          const savedAbility1 = await page.evaluate(() => JSON.parse(localStorage.getItem('wq_save_v1')).srs.ability);
          ok('S16-C ability 答错降档 st 2→1', savedAbility1.st === 1, JSON.stringify(savedAbility1));
          await page.click('#mem-ok');
          await page.waitForFunction(() => typeof run !== 'undefined' && run && run.q && !run.q.locked, { timeout: 15000 });
          await answerWrongOnce(page);
          await page.waitForSelector('#memcard:not([hidden])', { timeout: 8000 });
          const savedAbility2 = await page.evaluate(() => JSON.parse(localStorage.getItem('wq_save_v1')).srs.ability);
          ok('S16-C ability 重考再错再降 st 1→0（低于局首档=真降档）', savedAbility2.st === 0, JSON.stringify(savedAbility2));
          await page.click('#mem-ok');
          /* 队列打完 → 池子重出旧词，全自动答对至 kills=3 自动结算（chips 断言） */
          await battleChoice(page, 'end');
          await waitResult(page, 20000);
          await assertResult(page, 'S16-C 复习完成', '🧠 今日待复习完成！', '🧠 复习 3 词');
          const chips = await page.evaluate(() => Array.from(document.querySelectorAll('#result-stats .chip')).map(c => c.textContent.trim()));
          ok('S16-C 结算含「⬆️ 晋升 2 词」（abandon 直接答对 + absorb 先错后对）',
            chips.some(c => c.indexOf('⬆️ 晋升 2') >= 0), JSON.stringify(chips));
          ok('S16-C 结算含「⬇️ 降档 1 词」（ability 连错两次净降档）',
            chips.some(c => c.indexOf('⬇️ 降档 1') >= 0), JSON.stringify(chips));
          ok('S16-C 全程零页面异常', errorsC.length === 0, errorsC.join(' | '));

          /* ---------- E. 结算三词卡：错词入选（错得多靠前），点击直达记忆画像 ---------- */
          const mem3 = await page.evaluate(() => ({
            visible: !document.getElementById('mem3-card').hidden,
            rows: Array.from(document.querySelectorAll('#mem3-list .mem3-row')).map(b => ({
              w: b.dataset.w,
              scene: b.querySelector('.mem3-scene').textContent,
              why: b.querySelector('.mem3-why').textContent
            })),
            hint: (document.querySelector('#mem3-card .hint') || {}).textContent || ''
          }));
          ok('S16-E 三词卡可见且错词 ability（2 错）/absorb（1 错）入选（2 行）',
            mem3.visible && mem3.rows.length === 2 && mem3.rows[0].w === 'ability' && mem3.rows[1].w === 'absorb', JSON.stringify(mem3));
          ok('S16-E 行内标注答错原因（❌ 答错 2 次）', mem3.rows.length && mem3.rows[0].why.indexOf('❌ 答错 2') >= 0, mem3.rows.length ? mem3.rows[0].why : '');
          await page.click('#mem3-list .mem3-row');
          await page.waitForSelector('#word-overlay:not([hidden])', { timeout: 5000 });
          const woFromMem3 = await page.evaluate(() => ({
            word: document.getElementById('wo-word').textContent,
            profile: !document.getElementById('wo-profile').hidden
          }));
          ok('S16-E 点击三词卡直达记忆画像（首行=错得最多的 ability）', woFromMem3.word.indexOf('ability') >= 0 && woFromMem3.profile, JSON.stringify(woFromMem3));
          await page.click('#wo-close');
          await page.click('#btn-result-home');
          await backHome(page);
        }
        await c16c.context.close();

        /* ---------- D. 记忆画像：词根拆解 / 音节兜底 / 例句填空 ---------- */
        const c16d = await newContext(browser);
        {
          const page = c16d.page;
          const errorsD = [];
          page.on('pageerror', e => errorsD.push(e.message));
          await gotoHome(page);
          await page.click('#btn-codex');
          await page.waitForSelector('#scr-codex.active', { timeout: 5000 });
          /* ① 有词根词 transport：🧩 拆解行 + 💡 联想 + ✍️ 例句 + 首字母展开 + 揭晓 */
          await page.fill('#codex-search', 'transport');
          await page.waitForSelector('#codex-list .cx-row', { timeout: 5000 });
          await page.click('#codex-list .cx-row');
          await page.waitForSelector('#word-overlay:not([hidden])', { timeout: 5000 });
          const prof1 = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('#wo-profile .wp-row')).map(r => ({
              tag: r.querySelector('.wp-tag').textContent,
              val: r.querySelector('.wp-val').textContent
            }));
            return {
              rows: rows,
              hintBtn: !!document.getElementById('wo-cloze-hint'),
              revealBtn: !!document.getElementById('wo-cloze-reveal'),
              clozeVal: (document.querySelector('.wp-cloze .wp-val') || {}).textContent || ''
            };
          });
          ok('S16-D 记忆画像四行结构（拆解/联想/例句/词族 · r20 新增词族行）', prof1.rows.length === 4 &&
            prof1.rows[0].tag.indexOf('拆解') >= 0 && prof1.rows[1].tag.indexOf('联想') >= 0 && prof1.rows[2].tag.indexOf('例句') >= 0 && prof1.rows[3].tag.indexOf('词族') >= 0,
            JSON.stringify(prof1.rows));
          ok('S16-D 词族行：port 词根 + 同根词放射列表（点击互跳）',
            prof1.rows[3].val.indexOf('port') >= 0 && prof1.rows[3].val.length > 10, prof1.rows[3].val);
          ok('S16-D transport 拆解行复用词汇密码（含 trans/port）',
            prof1.rows[0].val.indexOf('trans') >= 0 && prof1.rows[0].val.indexOf('port') >= 0, prof1.rows[0].val);
          ok('S16-D 联想行带词景或钩子（非空）', prof1.rows[1].val.length >= 4, prof1.rows[1].val);
          ok('S16-D 例句挖空 ____', prof1.clozeVal.indexOf('____') >= 0, prof1.clozeVal);
          await page.click('#wo-cloze-hint');
          const hint1 = await page.evaluate(() => ({
            expanded: document.getElementById('wo-cloze-hint').getAttribute('aria-expanded'),
            text: document.getElementById('wo-cloze-hinttext').textContent,
            visible: !document.getElementById('wo-cloze-hinttext').hidden
          }));
          ok('S16-D 首字母提示展开（aria-expanded=true · T·9 字母）',
            hint1.expanded === 'true' && hint1.visible && /首字母 T/i.test(hint1.text) && hint1.text.indexOf('9') >= 0, JSON.stringify(hint1));
          await page.click('#wo-cloze-hint');
          const hint2 = await page.evaluate(() => ({
            expanded: document.getElementById('wo-cloze-hint').getAttribute('aria-expanded'),
            hidden: document.getElementById('wo-cloze-hinttext').hidden
          }));
          ok('S16-D 提示可收起（aria-expanded=false）', hint2.expanded === 'false' && hint2.hidden, JSON.stringify(hint2));
          await page.click('#wo-cloze-reveal');
          const revealed = await page.evaluate(() => (document.querySelector('.wp-cloze .wp-val') || {}).textContent || '');
          ok('S16-D 揭晓后挖空换真词 transport', revealed.indexOf('transport') >= 0 && revealed.indexOf('____') < 0, revealed);
          await page.click('#wo-close');
          /* ② 无词根词 abandon：fallback 音节拆分行 */
          await page.fill('#codex-search', 'abandon');
          await page.waitForSelector('#codex-list .cx-row', { timeout: 5000 });
          await page.click('#codex-list .cx-row');
          await page.waitForSelector('#word-overlay:not([hidden])', { timeout: 5000 });
          const prof2 = await page.evaluate(() => {
            const r0 = document.querySelector('#wo-profile .wp-row');
            return { tag: r0.querySelector('.wp-tag').textContent, val: r0.querySelector('.wp-val').textContent };
          });
          ok('S16-D 无词根词 fallback 音节拆分（abandon → a·ban·don）',
            prof2.tag.indexOf('音节') >= 0 && prof2.val === 'a·ban·don', JSON.stringify(prof2));
          ok('S16-D 记忆画像零页面异常', errorsD.length === 0, errorsD.join(' | '));
          await page.click('#wo-close');
          await page.click('#btn-codex-back');
          await backHome(page);

          /* ---------- F. 词景：覆盖率统计 + 题面显示规则 ---------- */
          const stats = await page.evaluate(() => {
            const per = SCENE_CATS.map(c => ({ id: c.id, n: Object.keys(c.words).length }));
            let covered = 0;
            ALL_WORDS.forEach(it => { if (sceneOf(it.w)) covered++; });
            return { cats: SCENE_CATS.length, per: per, covered: covered, total: ALL_WORDS.length };
          });
          ok('S16-F 词景 ≥6 类（实际 ' + stats.cats + '）', stats.cats >= 6, stats.cats);
          ok('S16-F 每类显式映射 ≥10 条', stats.per.every(p => p.n >= 10), JSON.stringify(stats.per));
          ok('S16-F 全库词景覆盖 ≥300 词（' + stats.covered + '/' + stats.total + '）',
            stats.covered >= 300, stats.covered + '/' + stats.total);
          /* 基线行（供后续轮次对比覆盖率，勿删除） */
          console.log('SCENE-STATS ' + JSON.stringify({ covered: stats.covered, total: stats.total,
            pct: Math.round(stats.covered / stats.total * 1000) / 10, perCat: stats.per }));

          /* 题面规则：e2c-only 局——词面已暴露 → 词景显示且内容与 sceneOf 一致。
             词池用 8 词景 + 8 非词景的自定义词库（50/50 稳定抽样，避免按内置词库
             ~10% 词景密度抽 12 题撞不到 2 例的偶然失败）；换种子直接覆写
             wq_save_v1（wq_seed_done 仍为 '1'，init 脚本不会再盖回） */
          const seedE2c = baseSave();
          seedE2c.settings = { choiceOnlyMigrated: true, c2eOnlyMigrated: true, bgmOffMigrated: true,
            qtypes: { c2e: false, e2c: true, spell: false, listen: false } };
          seedE2c.customLists = [{ id: 'custom_scene', name: '词景抽样', desc: 'S16 词景抽样', words: [
            ['castle', 'n. 城堡'], ['insect', 'n. 昆虫'], ['volcano', 'n. 火山'], ['tunnel', 'n. 隧道'],
            ['beach', 'n. 海滩'], ['anxiety', 'n. 焦虑'], ['leap', 'n. 跳跃 v. 跳'], ['appetite', 'n. 食欲；欲望'],
            ['ability', 'n. 能力；才能'], ['abandon', 'v. 放弃；抛弃'], ['absorb', 'v. 吸收；吸引'],
            ['academic', 'adj. 学术的'], ['achieve', 'v. 实现；达到'], ['acquire', 'v. 获得；学到'],
            ['adequate', 'adj. 充足的'], ['advantage', 'n. 优势']
          ] }];
          seedE2c.lastLists = ['custom_scene'];
          await reseedSave(page, seedE2c);
          await page.waitForSelector('#scr-home.active', { timeout: 15000 });
          await page.click('#btn-review');
          await page.waitForSelector('#scr-setup.active', { timeout: 5000 });
          await page.click('#btn-start');
          await page.waitForSelector('#scr-battle.active', { timeout: 8000 });
          let withScene = 0, noScene = 0, mismatch = null;
          for (let i = 0; i < 12 && (withScene < 2 || noScene < 2); i++) {
            await page.waitForFunction(() => typeof run !== 'undefined' && run && run.q && !run.q.locked && !run.ended, { timeout: 15000 }).catch(() => {});
            if (await page.evaluate(() => (typeof run !== 'undefined' && run) ? !!run.ended : true)) break;
            const chk = await page.evaluate(() => ({
              word: run.q.word.w,
              sceneExpected: sceneOf(run.q.word.w),
              shown: !document.getElementById('q-scene').hidden,
              content: document.getElementById('q-scene').textContent
            }));
            if (chk.sceneExpected) {
              withScene++;
              if (!chk.shown || chk.content !== chk.sceneExpected) mismatch = chk;
            } else {
              noScene++;
              if (chk.shown) mismatch = chk;
            }
            await clickCorrectOnce(page);
            await sleep(1150);
          }
          ok('S16-F e2c 题面词景显示 ≥2 例且与 sceneOf 一致', withScene >= 2 && !mismatch, JSON.stringify({ withScene, mismatch }));
          ok('S16-F 无景词题面保持隐藏 ≥2 例', noScene >= 2, JSON.stringify({ noScene }));

          /* c2e 防泄题：词就是答案 → 词景不自动显示 */
          await quitOrSettled(page);
          await waitResult(page, 15000);
          await page.click('#btn-result-home');
          await backHome(page);
          const seedC2e = baseSave();
          seedC2e.settings = { choiceOnlyMigrated: true, c2eOnlyMigrated: true, bgmOffMigrated: true,
            qtypes: { c2e: true, e2c: false, spell: false, listen: false } };
          await reseedSave(page, seedC2e);
          await page.waitForSelector('#scr-home.active', { timeout: 15000 });
          await page.click('#btn-review');
          await page.waitForSelector('#scr-setup.active', { timeout: 5000 });
          await page.click('#btn-start');
          await page.waitForSelector('#scr-battle.active', { timeout: 8000 });
          let shownInC2e = 0, checkedC2e = 0;
          for (let i = 0; i < 6; i++) {
            await page.waitForFunction(() => typeof run !== 'undefined' && run && run.q && !run.q.locked && !run.ended, { timeout: 15000 }).catch(() => {});
            if (await page.evaluate(() => (typeof run !== 'undefined' && run) ? !!run.ended : true)) break;
            const chk = await page.evaluate(() => ({ shown: !document.getElementById('q-scene').hidden }));
            checkedC2e++;
            if (chk.shown) shownInC2e++;
            await clickCorrectOnce(page);
            await sleep(1150);
          }
          ok('S16-F c2e 题（词=答案）词景不自动显示，防泄题（' + checkedC2e + ' 题抽检）', shownInC2e === 0, shownInC2e);

          /* ---------- G. 连击 5 里程碑 fx：显示所连单词串 ---------- */
          await quitOrSettled(page);
          await waitResult(page, 15000);
          await page.click('#btn-result-home');
          await backHome(page);
          await page.click('#btn-review');
          await page.waitForSelector('#scr-setup.active', { timeout: 5000 });
          await page.click('#btn-start');
          await page.waitForSelector('#scr-battle.active', { timeout: 8000 });
          await battleChoice(page, 4);   // 4 连击铺垫（每答对即击杀，连击不中断）
          let comboFx = null, comboTries = 0;
          while (comboTries < 6 && !(comboFx && comboFx.text)) {
            comboTries++;
            await page.waitForFunction(() => typeof run !== 'undefined' && run && run.q && !run.q.locked && !run.ended, { timeout: 15000 }).catch(() => {});
            const comboNow = await page.evaluate(() => (typeof run !== 'undefined' && run && !run.ended) ? run.combo : -1);
            if (comboNow < 0) break;
            await clickCorrectOnce(page);
            if (comboNow === 4) {   // 这一次点击把连击推到 5 → comboBurst → fx 立即出现（存活 1s）
              comboFx = await page.evaluate(() => {
                const el = document.querySelector('#fx-layer .fx-dmg.combo-chain');
                return { text: el ? el.textContent : '', words: (typeof run !== 'undefined' && run) ? run.comboWords.slice() : [] };
              });
              break;
            }
            await sleep(1150);
          }
          ok('S16-G 连击 5 fx 显示单词串（🔗 5 连击：…）',
            !!comboFx && comboFx.text.indexOf('🔗 5 连击：') === 0 && comboFx.text.indexOf(comboFx.words.join(' · ')) >= 0,
            JSON.stringify(comboFx));
          ok('S16-G 单词串 = 本轮连续答对的 5 个词', !!comboFx && comboFx.words.length === 5, JSON.stringify(comboFx && comboFx.words));
          ok('S16-D/F/G 零页面异常', errorsD.length === 0, errorsD.join(' | '));
          await quitOrSettled(page);
          await waitResult(page, 15000);
          await page.click('#btn-result-home');
          await backHome(page);
        }
        await c16d.context.close();
      }

      /* ============ S17 · r18 特效状态机 ============
         A. 答对金色粒子迸发：fx-layer 出现 ≥10 个 .fx-gold，每粒挂 --dx/--dy 位移矢量
            （纯 transform/opacity 合成动画；关键帧白名单由 S14-C 全局扫描兜底）。
         B. 连击边缘光晕（与 R15 combo-heat 同档独立成层）：3/6/10 连 →
            #combo-glow.glow-1/2/3 与 scr-battle.combo-heat-N 同步挂载、回落互斥摘除。
         B2. 特效定时器自清零（r18b）：跨档 pulse/tier-up 摘除定时器到期后句柄归零
             （comboGlowTimer/comboTierTimer 不留 stale 句柄）。
         B3. 连击回落态（r18b 补断言）：答错断连 → combo-heat-1/2/3 与 glow-1/2/3(+pulse)
             全摘、连击徽章 .show 摘除（此前只断言升档，回落是状态机盲区）。
         C. BOSS 出场/受击表情帧：注入 bossStage 走真实 nextMonster——出场瞬间
            .boss-enter + boss-live、900ms 后按怪身份摘类；答对 BOSS 一题受击瞬间
            emoji 切到 BOSS_HIT_FACE 变体 + .hit-face，430ms 后回正。
         D. 背景分层视差（懒渲染）：主页/战斗各挂 .bg-far 远层 + .deco-layer 近层；
            指针移动后两层 translate3d 生效，战斗远层随主题换色。 */
      console.log('---- S17 r18 特效状态机 ----');
      {
        const c17 = await newContext(browser, baseSave());
        const page = c17.page;
        const errors17 = [];
        page.on('pageerror', e => errors17.push(e.message));
        await page.goto(BASE_URL + '/', { waitUntil: 'load' });
        await page.waitForSelector('#scr-home.active', { timeout: 15000 });

        // A0/D1. 主页视差双层 + 指针驱动
        const homeLayers = await page.evaluate(() => ({
          far: !!document.getElementById('home-bg-far'),
          near: !!document.getElementById('home-deco'),
          farBg: (getComputedStyle(document.getElementById('home-bg-far')).backgroundImage || '').indexOf('radial-gradient') >= 0
        }));
        ok('S17-D 主页双层挂载（.bg-far + .deco-layer）且远层为渐变色块',
          homeLayers.far && homeLayers.near && homeLayers.farBg, JSON.stringify(homeLayers));
        await page.mouse.move(90, 90);
        await page.mouse.move(340, 760, { steps: 6 });
        await sleep(300);
        const homeT = await page.evaluate(() => ({
          far: document.getElementById('home-bg-far').style.transform,
          near: document.getElementById('home-deco').style.transform
        }));
        ok('S17-D 指针驱动视差：far/near 层 translate3d 生效',
          /^translate3d\(/.test(homeT.far || '') && /^translate3d\(/.test(homeT.near || ''), JSON.stringify(homeT));

        // 进入无尽战斗（一怪一血、无商店，适合连击/粒子链路）
        await page.click('#btn-endless');
        await page.waitForSelector('#scr-setup.active', { timeout: 5000 });
        await page.click('#btn-start');
        await page.waitForSelector('#scr-battle.active', { timeout: 8000 });
        await page.waitForFunction(() => typeof run !== 'undefined' && run && run.q, { timeout: 15000 });
        // D2. 战斗远层随主题着色 + 指针位移
        const farBattle = await page.evaluate(() => ({
          theme: (document.getElementById('scr-battle').className.match(/theme-\w+/) || [''])[0],
          bg: (getComputedStyle(document.getElementById('battle-bg-far')).backgroundImage || '').indexOf('radial-gradient') >= 0
        }));
        ok('S17-D 战斗远层存在且随主题（' + farBattle.theme + '）着色', farBattle.bg, JSON.stringify(farBattle));
        await page.mouse.move(120, 300);
        await page.mouse.move(330, 620, { steps: 5 });
        await sleep(260);
        const farT = await page.evaluate(() => document.getElementById('battle-bg-far').style.transform);
        ok('S17-D 战斗远层指针位移生效', /^translate3d\(/.test(farT || ''), farT);

        // A/B. 连答至 10 连：金色粒子、glow 档位、热浪同步
        const READ17 = () => {
          const r = (typeof run === 'undefined') ? null : run;
          const mem = document.getElementById('memcard');
          return {
            ended: r ? !!r.ended : true,
            memcard: !!(mem && !mem.hidden && mem.getClientRects().length > 0),
            locked: !r || !r.q || !!r.q.locked,
            word: r && r.q && r.q.word ? r.q.word.w : null,
            meaning: r && r.q && r.q.word ? r.q.word.m : null,
            qtype: r && r.q ? r.q.type : null,
            opts: Array.from(document.querySelectorAll('#q-options .q-opt')).map(b => b.textContent.replace(/^[0-9]+/, '').trim())
          };
        };
        let goldSeen = null, glow1 = null, glow2 = null, glow3 = null, comboN = 0;
        for (let i = 0; i < 26 && comboN < 10; i++) {
          const st = await page.evaluate(READ17);
          if (st.ended) break;
          if (st.memcard) { await page.click('#mem-ok').catch(() => {}); await sleep(280); continue; }
          if (st.locked) { await sleep(300); continue; }
          const want = st.qtype === 'e2c' ? st.meaning : st.word;
          const idx = st.opts.findIndex(o => o === want);
          if (idx < 0) { await sleep(350); continue; }
          await page.click('#q-options .q-opt >> nth=' + idx);
          if (i === 0) {
            await sleep(240);   // heroAttackFx 命中拍在 180ms 后
            goldSeen = await page.evaluate(() => {
              const g = Array.from(document.querySelectorAll('#fx-layer .fx-gold'));
              return {
                n: g.length,
                vec: g.slice(0, 3).every(x => /px$/.test(x.style.getPropertyValue('--dx') || ''))
              };
            });
          }
          if (i === 2) glow1 = await page.evaluate(() => ({
            g: document.getElementById('combo-glow').classList.contains('glow-1'),
            h: document.getElementById('scr-battle').classList.contains('combo-heat-1')
          }));
          if (i === 5) glow2 = await page.evaluate(() => ({
            g2: document.getElementById('combo-glow').classList.contains('glow-2'),
            g1off: !document.getElementById('combo-glow').classList.contains('glow-1'),
            h2: document.getElementById('scr-battle').classList.contains('combo-heat-2')
          }));
          if (i === 9) glow3 = await page.evaluate(() => ({
            g3: document.getElementById('combo-glow').classList.contains('glow-3'),
            h3: document.getElementById('scr-battle').classList.contains('combo-heat-3')
          }));
          comboN = await page.evaluate(() => run.combo);
          await sleep(1050);
        }
        ok('S17-A 答对金色粒子迸发（≥10 粒且带 --dx 位移矢量）', !!goldSeen && goldSeen.n >= 10 && goldSeen.vec, JSON.stringify(goldSeen));
        ok('S17-B 3 连：combo-glow.glow-1 与 combo-heat-1 同步', !!glow1 && glow1.g && glow1.h, JSON.stringify(glow1));
        ok('S17-B 6 连：glow-2 抬升且 glow-1 摘除（与 combo-heat-2 同步）', !!glow2 && glow2.g2 && glow2.g1off && glow2.h2, JSON.stringify(glow2));
        ok('S17-B 10 连：glow-3 满档（与 combo-heat-3 同步）', !!glow3 && glow3.g3 && glow3.h3, JSON.stringify(glow3));
        ok('S17-B 连击 ≥10 累计达成', comboN >= 10, 'combo=' + comboN);

        // B2. 特效定时器自清零（r18b）：10 连后的跨档 pulse 摘除定时器到期后句柄归零，
        //     不留 stale 句柄（与 hitFaceTimer/persistNow 自清零约定一致，r18 修正前
        //     comboGlowTimer/comboTierTimer 触发后仍持旧句柄）
        await sleep(720);   // >640ms glow pulse 摘除窗口（tier-up 徽章 540ms 窗口也早已过）
        const timersZero = await page.evaluate(() => ({
          glow: typeof comboGlowTimer === 'undefined' ? -1 : comboGlowTimer,
          tier: typeof comboTierTimer === 'undefined' ? -1 : comboTierTimer,
          pulseGone: !document.getElementById('combo-glow').classList.contains('pulse'),
          tierGone: !document.getElementById('battle-combo').classList.contains('tier-up')
        }));
        ok('S17-B2 跨档 pulse 摘除定时器到期自清零（comboGlowTimer/comboTierTimer 归零且 pulse/tier-up 已摘）',
          timersZero.glow === 0 && timersZero.tier === 0 && timersZero.pulseGone && timersZero.tierGone, JSON.stringify(timersZero));

        // B3. 连击回落态（r18b 补断言）：答错断连 → combo-heat-1/2/3 与 glow-1/2/3(+pulse)
        //     全摘、徽章 .show 摘除——此前 S14/S17 只断言升档，回落态是特效状态机的盲区
        await page.waitForFunction(() => {
          const r = typeof run === 'undefined' ? null : run;
          const mem = document.getElementById('memcard');
          return !!(r && r.q && !r.q.locked && mem && mem.hidden);
        }, { timeout: 15000 });
        const dropRead = await page.evaluate(() => {
          const r = run;
          return {
            word: r.q.word.w, meaning: r.q.word.m, qtype: r.q.type,
            opts: Array.from(document.querySelectorAll('#q-options .q-opt')).map(b => b.textContent.replace(/^[0-9]+/, '').trim())
          };
        });
        const wrongIdx17 = dropRead.opts.findIndex(o => o !== (dropRead.qtype === 'e2c' ? dropRead.meaning : dropRead.word));
        if (wrongIdx17 >= 0) {
          await page.click('#q-options .q-opt >> nth=' + wrongIdx17);
          await sleep(320);
          const dropGlow = await page.evaluate(() => ({
            combo: run.combo,
            heat: ['combo-heat-1', 'combo-heat-2', 'combo-heat-3'].filter(c => document.getElementById('scr-battle').classList.contains(c)),
            glow: ['glow-1', 'glow-2', 'glow-3', 'pulse'].filter(c => document.getElementById('combo-glow').classList.contains(c)),
            badgeShow: document.getElementById('battle-combo').classList.contains('show')
          }));
          ok('S17-B3 连击回落：答错断连后 combo-heat-* 与 glow-*（含 pulse）全摘、徽章隐藏',
            dropGlow.combo === 0 && dropGlow.heat.length === 0 && dropGlow.glow.length === 0 && !dropGlow.badgeShow, JSON.stringify(dropGlow));
          // 关掉答错后弹出的记忆卡（miss-chain 延迟 650ms 弹出，先等它出现再关），
          // 否则卡片会一直挡住答题链，C 段 waitForFunction(!locked) 必超时
          await page.waitForSelector('#memcard:not([hidden])', { timeout: 4000 }).catch(() => {});
          for (let t = 0; t < 10; t++) {
            const stM = await page.evaluate(READ17);
            if (!stM.memcard) break;
            await page.click('#mem-ok').catch(() => {});
            await sleep(280);
          }
        } else {
          skip('S17-B3 连击回落', '当前题面无可点击的错误选项');
        }

        // C. BOSS 出场 + 受击表情帧（注入 bossStage 走真实 nextMonster）
        await page.waitForFunction(() => typeof run !== 'undefined' && run && run.q && !run.q.locked, { timeout: 15000 });
        const bossSpawn = await page.evaluate(() => {
          run.bossStage = true;
          nextMonster();
          return {
            emoji: run.monster && run.monster.emoji,
            enter: document.getElementById('monster-emoji').classList.contains('boss-enter'),
            live: document.getElementById('scr-battle').classList.contains('boss-live'),
            nameAnim: getComputedStyle(document.getElementById('monster-name')).animationName
          };
        });
        ok('S17-C BOSS 出场：boss-enter + boss-live + 名牌压入动画', bossSpawn.enter && bossSpawn.live &&
          bossSpawn.nameAnim.indexOf('bossNameIn') >= 0, JSON.stringify(bossSpawn));
        await page.waitForFunction(() => typeof run !== 'undefined' && run && run.q && !run.q.locked, { timeout: 15000 });
        await sleep(950);
        const enterGone = await page.evaluate(() => !document.getElementById('monster-emoji').classList.contains('boss-enter'));
        ok('S17-C 出场动画按怪身份收尾（900ms 后 boss-enter 摘类）', enterGone, 'removed=' + enterGone);
        const stBoss = await page.evaluate(READ17);
        const wantBoss = stBoss.qtype === 'e2c' ? stBoss.meaning : stBoss.word;
        const idxBoss = stBoss.opts.findIndex(o => o === wantBoss);
        if (idxBoss >= 0) {
          await page.click('#q-options .q-opt >> nth=' + idxBoss);
          await sleep(260);
          const face = await page.evaluate(() => ({
            txt: document.getElementById('monster-emoji').textContent,
            cls: document.getElementById('monster-emoji').className,
            boss: run.monster && run.monster.boss,
            orig: run.monster && run.monster.emoji
          }));
          const FACE = { '🐉': '😵', '🐲': '😵‍💫', '👿': '😖', '🦖': '🥴', '🐋': '😵' };
          const wantFace = FACE[bossSpawn.emoji];
          ok('S17-C BOSS 受击切表情帧（' + bossSpawn.emoji + '→' + wantFace + '）且挂 .hit-face',
            face.boss && face.txt === wantFace && face.cls.indexOf('hit-face') >= 0, JSON.stringify(face));
          await sleep(500);
          const back = await page.evaluate(() => ({
            txt: document.getElementById('monster-emoji').textContent,
            cls: document.getElementById('monster-emoji').className
          }));
          ok('S17-C 430ms 后表情回正（.hit-face 摘除）', back.txt === bossSpawn.emoji && back.cls.indexOf('hit-face') < 0, JSON.stringify(back));
        } else {
          skip('S17-C BOSS 受击表情帧', 'BOSS 题未渲染出可点击选项');
        }

        // 撤退进结算：高正确率撤退封顶 B（评级徽章状态机 + 不触发 S/A 档撒花）
        for (let t = 0; t < 10; t++) {
          const st = await page.evaluate(READ17);
          if (!st.memcard) break;
          await page.click('#mem-ok').catch(() => {});
          await sleep(280);
        }
        await page.evaluate(() => { window.__gradeBursts = []; const oB = Confetti.burst.bind(Confetti); Confetti.burst = function (n, x, y) { window.__gradeBursts.push(n || 0); return oB(n, x, y); }; });
        await page.click('#btn-quit');
        await waitResult(page, 15000);
        const gradeQuit = await page.evaluate(() => ({
          cls: (document.getElementById('result-grade').className || '').toLowerCase(),
          visible: !document.getElementById('result-grade').hidden,
          cap: (document.querySelector('#result-grade .grade-cap') || {}).textContent || '',
          bursts: window.__gradeBursts
        }));
        ok('S17-D2 撤退局评级徽章 grade-b（封顶不授 S/A）', gradeQuit.visible && gradeQuit.cls.indexOf('grade-b') >= 0, JSON.stringify(gradeQuit));
        ok('S17-D2 B 级不触发 120/80 粒的 S/A 档撒花（成就/升级小爆发不计）',
          gradeQuit.bursts.indexOf(120) < 0 && gradeQuit.bursts.indexOf(80) < 0, 'bursts=' + JSON.stringify(gradeQuit.bursts));

        // 复习局全对 ≥5 题 → grade-S + 120 粒撒花（S 级撒花主链路）
        await page.click('#btn-result-home');
        await backHome(page);
        await page.click('#btn-review');
        await page.waitForSelector('#scr-setup.active', { timeout: 5000 });
        await page.click('#btn-start');
        await page.waitForSelector('#scr-battle.active', { timeout: 8000 });
        for (let i = 0; i < 90; i++) {
          const st = await page.evaluate(READ17);
          if (st.ended) break;
          if (st.memcard) { await page.click('#mem-ok').catch(() => {}); await sleep(280); continue; }
          if (st.locked) { await sleep(300); continue; }
          const want = st.qtype === 'e2c' ? st.meaning : st.word;
          const idx = st.opts.findIndex(o => o === want);
          if (idx < 0) { await sleep(350); continue; }
          await page.click('#q-options .q-opt >> nth=' + idx);
          await sleep(1050);
        }
        await waitResult(page, 20000);
        const gradeS = await page.evaluate(() => ({
          cls: (document.getElementById('result-grade').className || '').toLowerCase(),
          cap: (document.querySelector('#result-grade .grade-cap') || {}).textContent || '',
          bursts: window.__gradeBursts
        }));
        ok('S17-D2 复习全对局 grade-S（无伤通关徽章）', gradeS.cls.indexOf('grade-s') >= 0, JSON.stringify(gradeS));
        ok('S17-D2 S 级撒花（120 粒 Confetti 爆发）', gradeS.bursts.indexOf(120) >= 0, 'bursts=' + JSON.stringify(gradeS.bursts));
        ok('S17 全程零页面异常', errors17.length === 0, errors17.join(' | '));
        await page.click('#btn-result-home');
        await backHome(page);
        await c17.context.close();
      }

      /* ============ S18 · 记忆效果验收链（r19 新增维度） ============
         一条从旧档到成熟的完整记忆闭环（同一 context 全程贯通，全部走真实 UI 作答与落盘核对）：
         A 旧档迁移兼容：v1 时代存档（无 srs/wrongBook/firstRun/一次性迁移标记）走真实 loadSave
           通道——srs 排程表/错题本自动补全、题型迁移照跑、旧进度保留、老玩家不弹引导、迁移结果落盘
         B 新词学习→答错入错题：复习局真实作答——新词答错 srs 维持新词档且立即到期（今日回
           队列）+ 错题本入册（n/t 落盘），记忆卡关闭后同词重考答对 → 晋升 1 天档（due≈+1d）
         C 到期复习：时间快进后主页入口计数（今日到期 N 词）/ 最逾期优先队列 → 「今日待复习」
           会话按队列顺序作答，答对晋升 3 天档；种子存档经 reload 往返核实
         C2 队列上限：21 词到期 → 入口计数带「本次先复习 20 词」截断提示、会话队列
           =SRS_SESSION_MAX=20 且横幅注明截断（最逾期优先不被截断破坏）
         D 再答对晋升：7 天档晋升 + 掌握度满 3 星自动攻克错题（wrongBook 清册 + 📕 toast）
         E 晋升成熟：7 天档答对 → 成熟档（30 天回归）落盘，掌握度 4 星
         F 闭环收口：队列清空回空态文案；图鉴词详情「记忆档位 成熟」徽章 + 记忆画像三行联动
         G 内容质量抽查（2909 词全量走真实 renderWordProfile）：词根拆解/联想/例句三行覆盖率
           统计（PROFILE-STATS 基线行）+ 无词根词音节 fallback 生效抽查 ≥20 词（音节行格式
           与 syllablesOf 一致）+ 记忆画像与词景图联动（词景词联想行首 = 词景 emoji + 类别钩子） */
      console.log('---- S18 记忆效果验收链（r19） ----');
      {
        /* 种子 = v1 时代旧档（A 节断言迁移），此后 B~F 全链路都在这份迁移后的存档上走完。
           注意：无 srs / wrongBook / firstRun / xp / 一次性迁移标记——r17 之前的历史形态 */
        const legacySeed = {
          coins: 120,
          upgrades: { hp: 2, time: 1, shield: 0, coin: 1 },
          mastery: { abandon: { lv: 3, seen: 5, ok: 4, wrong: 1, last: 1700000000000, due: 0, wrongStreak: 0 } },
          streak: { count: 2, last: '2026-01-01', todayCount: 1 },
          best: { adventure: 6, endless: 12 },
          settings: { sound: true, autoplay: true, rate: 0.9, qtypes: { c2e: false, e2c: true, spell: true, listen: false } },
          customLists: [{ id: 'custom_chain', name: '记忆闭环链', desc: 'S18 记忆效果验收链', words: [['transport', 'v. 运输；传送 n. 运输']] }],
          lastLists: ['custom_chain'],
          lastDiff: 'normal',
          daily: { date: '', tasks: [] },
          ach: {}, pets: {}, pet: '',
          stats: { kills: 0, bosses: 0, spellOk: 0, listenOk: 0, runs: 2, dailyDone: 0, maxCombo: 4, perfects: 0, packDone: 0, labN: 0, labOk: 0, expWins: 0, packDoneMap: {} }
        };
        const c18 = await newContext(browser, legacySeed);
        const errors18 = [];
        c18.page.on('pageerror', e => errors18.push(e.message));
        const page = c18.page;
        const DAY = 864e5;
        /* 读落盘存档：先冲掉 persist 防抖，保证读到最新磁盘态（档位/队列断言一律以磁盘为准） */
        const diskSave = () => page.evaluate(() => {
          if (typeof persistFlush === 'function') persistFlush();
          return JSON.parse(localStorage.getItem('wq_save_v1'));
        });
        /* 时间快进：以当前落盘档为基线改 srs 到期 → 整档重种 + reload（同时核实存档往返保真） */
        async function skipToOverdue(mutate) {
          const cur = await diskSave();
          mutate(cur, Date.now());
          await reseedSave(page, cur);
          await page.waitForSelector('#scr-home.active', { timeout: 15000 });
        }
        /* 轮询收集 toast（toast 队列串行播放 2300ms/条，任务完成等提示可能排在攻克提示前面） */
        async function pollToast(pg, needle, budgetMs) {
          const t0 = Date.now();
          let found = '';
          while (Date.now() - t0 < budgetMs) {
            const ts = await pg.evaluate(() => Array.from(document.querySelectorAll('#toast-wrap .toast')).map(t => t.textContent));
            const hit = ts.find(t => t.indexOf(needle) >= 0);
            if (hit) { found = hit; break; }
            await sleep(200);
          }
          return found;
        }

        /* ---------- A. 旧档迁移兼容（v1 时代档 → 真实 loadSave 通道） ---------- */
        {
          await gotoHome(page);
          const mig = await page.evaluate(() => ({
            srsType: typeof save.srs, srsKeys: Object.keys(save.srs || {}).length,
            wbKeys: Object.keys(save.wrongBook || {}).length,
            abLv: save.mastery.abandon ? save.mastery.abandon.lv : null,
            abOk: save.mastery.abandon ? save.mastery.abandon.ok : null,
            coins: save.coins, bestAdv: save.best.adventure,
            m1: save.settings.choiceOnlyMigrated, m2: save.settings.c2eOnlyMigrated,
            qtC2e: save.settings.qtypes.c2e, qtE2c: save.settings.qtypes.e2c,
            firstRun: save.firstRun,
            srsSub: document.getElementById('srs-sub').textContent
          }));
          ok('S18-A 旧档 srs 排程表自动补全（空对象，向后兼容）', mig.srsType === 'object' && mig.srsKeys === 0, JSON.stringify(mig));
          ok('S18-A 旧档错题本自动补全（空对象）', mig.wbKeys === 0, JSON.stringify(mig));
          ok('S18-A 旧进度保留：abandon lv3/ok4 · 金币 120 · 冒险最佳 6', mig.abLv === 3 && mig.abOk === 4 && mig.coins === 120 && mig.bestAdv === 6, JSON.stringify(mig));
          ok('S18-A 一次性题型迁移照跑（e2c/spell 关 → c2e 单题型 + 迁移标记置位）',
            mig.m1 === true && mig.m2 === true && mig.qtC2e === true && mig.qtE2c === false, JSON.stringify(mig));
          ok('S18-A 旧档视为老玩家（firstRun=false 不弹引导）', mig.firstRun === false, JSON.stringify(mig));
          ok('S18-A 迁移后入口空态文案（无 srs 记录 → 今日没有到期词）', mig.srsSub.indexOf('今日没有到期词') >= 0, mig.srsSub);
          const diskMig = await diskSave();
          ok('S18-A 迁移结果已落盘（localStorage 里 srs/wrongBook/迁移标记齐全）',
            diskMig.srs && Object.keys(diskMig.srs).length === 0 && diskMig.wrongBook &&
            Object.keys(diskMig.wrongBook).length === 0 && diskMig.settings.choiceOnlyMigrated === true,
            JSON.stringify({ srs: Object.keys(diskMig.srs || {}).length, wb: Object.keys(diskMig.wrongBook || {}).length, m1: diskMig.settings.choiceOnlyMigrated }));
        }

        /* ---------- B. 新词学习 → 答错入错题 → 重考答对晋升 1 天档（真实复习局） ---------- */
        await page.click('#btn-review');
        await page.waitForSelector('#scr-setup.active', { timeout: 5000 });
        await page.click('#btn-start');
        await page.waitForSelector('#scr-battle.active', { timeout: 8000 });
        await page.waitForFunction(() => typeof run !== 'undefined' && run && run.q, { timeout: 15000 });
        const b0 = await page.evaluate(() => ({ mode: run.mode, word: run.q.word.w, qtype: run.q.type }));
        ok('S18-B 复习局开打（单词条池 · c2e 题型）', b0.mode === 'review' && b0.word === 'transport' && b0.qtype === 'c2e', JSON.stringify(b0));
        await answerWrongOnce(page);
        await page.waitForSelector('#memcard:not([hidden])', { timeout: 8000 });
        const bWrong = await diskSave();
        ok('S18-B 新词答错：srs 维持新词档 st=0 且立即到期（今日回队列）',
          bWrong.srs.transport && bWrong.srs.transport.st === 0 && bWrong.srs.transport.due <= Date.now() &&
          bWrong.srs.transport.wrong === 1 && bWrong.srs.transport.ok === 0, JSON.stringify(bWrong.srs.transport));
        ok('S18-B 答错入错题本：wrongBook.transport={n:1,t} 落盘',
          bWrong.wrongBook.transport && bWrong.wrongBook.transport.n === 1 && bWrong.wrongBook.transport.t > 0,
          JSON.stringify(bWrong.wrongBook.transport));
        ok('S18-B 掌握度字段同步：seen=1 / wrong=1 / lv=0',
          bWrong.mastery.transport && bWrong.mastery.transport.seen === 1 && bWrong.mastery.transport.wrong === 1 &&
          bWrong.mastery.transport.lv === 0, JSON.stringify(bWrong.mastery.transport));
        await page.click('#mem-ok');
        await page.waitForFunction(() => typeof run !== 'undefined' && run && run.q && run.q.word.w === 'transport' && !run.q.locked, { timeout: 15000 });
        await battleChoice(page, 1);
        const bRight = await diskSave();
        ok('S18-B 同词重考答对晋升 1 天档：st 0→1 且 due≈+1 天',
          bRight.srs.transport.st === 1 && Math.abs(bRight.srs.transport.due - (Date.now() + DAY)) < 5000,
          JSON.stringify(bRight.srs.transport));
        ok('S18-B 错题本仍在册（1 星未攻克）', bRight.wrongBook.transport && bRight.wrongBook.transport.n === 1,
          JSON.stringify(bRight.wrongBook));
        ok('S18-B 掌握度晋升：lv 0→1 / ok=1 / seen=2',
          bRight.mastery.transport.lv === 1 && bRight.mastery.transport.ok === 1 && bRight.mastery.transport.seen === 2,
          JSON.stringify(bRight.mastery.transport));
        /* 单词条池从出战设置进复习局：reviewTotal = min(sessionSize, pool)=1，重考答对即自动收官 */
        await waitResult(page, 15000);
        await assertResult(page, 'S18-B 新词学习收官', '🎉 复习完成！', '📖 复习 1 词');
        await page.click('#btn-result-home');
        await backHome(page);

        /* ---------- C. 到期复习：入口计数 / 最逾期优先队列 / 会话按队列作答晋升 ---------- */
        await skipToOverdue((s, now) => {
          s.srs.abandon = { st: 1, due: now - 3 * DAY, ok: 1, wrong: 0, t: now };   // 更逾期的老档词（1 天档）
          s.srs.transport.due = now - DAY;                                          // 链上词：昨天到期
        });
        const q1 = await page.evaluate(() => ({
          sub: document.getElementById('srs-sub').textContent,
          queue: srsDueList().map(x => ({ w: x.w, st: x.st, due: x.due }))
        }));
        ok('S18-C 入口计数「今日到期 2 词」（时间快进后两条档位都逾期）', q1.sub.indexOf('今日到期 2 词') >= 0, q1.sub);
        ok('S18-C 队列最逾期优先：abandon(-3 天) 在 transport(-1 天) 前',
          q1.queue.length === 2 && q1.queue[0].w === 'abandon' && q1.queue[1].w === 'transport' &&
          q1.queue[0].due <= q1.queue[1].due, JSON.stringify(q1.queue));
        ok('S18-C 队列条目带档位快照（st=1 × 2 · reload 后存档往返完好）',
          q1.queue.length === 2 && q1.queue.every(x => x.st === 1), JSON.stringify(q1.queue));
        await page.click('#btn-srs-review');
        await page.waitForSelector('#scr-battle.active', { timeout: 8000 });
        await page.waitForFunction(() => typeof run !== 'undefined' && run && run.q, { timeout: 15000 });
        const c0 = await page.evaluate(() => ({ mode: run.mode, total: run.reviewTotal, word: run.q.word.w }));
        ok('S18-C 会话 mode=srs / 词队列=2 / 首词=最逾期的 abandon', c0.mode === 'srs' && c0.total === 2 && c0.word === 'abandon', JSON.stringify(c0));
        await battleChoice(page, 1);
        const cAb = await diskSave();
        ok('S18-C abandon 答对晋升 1→2（3 天档 · due≈+3 天）',
          cAb.srs.abandon.st === 2 && Math.abs(cAb.srs.abandon.due - (Date.now() + 3 * DAY)) < 5000, JSON.stringify(cAb.srs.abandon));
        await page.waitForFunction(() => typeof run !== 'undefined' && run && run.q && run.q.word.w === 'transport' && !run.q.locked, { timeout: 15000 });
        await battleChoice(page, 1);
        const cTr = await diskSave();
        ok('S18-C transport 答对晋升 1→2（3 天档 · due≈+3 天）',
          cTr.srs.transport.st === 2 && Math.abs(cTr.srs.transport.due - (Date.now() + 3 * DAY)) < 5000, JSON.stringify(cTr.srs.transport));
        await waitResult(page, 20000);
        await assertResult(page, 'S18-C 复习完成', '🧠 今日待复习完成！', '🧠 复习 2 词');
        const cChips = await page.evaluate(() => Array.from(document.querySelectorAll('#result-stats .chip')).map(c => c.textContent.trim()));
        ok('S18-C 结算 chips 记账「⬆️ 晋升 2 词 / ⬇️ 降档 0 词」（局首档→收局档净变化）',
          cChips.some(c => c.indexOf('⬆️ 晋升 2') >= 0) && cChips.some(c => c.indexOf('⬇️ 降档 0') >= 0), JSON.stringify(cChips));
        await page.click('#btn-result-home');
        await backHome(page);

        /* ---------- D. 再答对晋升 3→7 天档 + 掌握度满 3 星攻克错题出册 ---------- */
        await skipToOverdue((s, now) => {
          s.srs.abandon.due = now - 2 * 3600e3;
          s.srs.transport.due = now - 3600e3;
        });
        const q2 = await page.evaluate(() => ({
          sub: document.getElementById('srs-sub').textContent,
          queue: srsDueList().map(x => x.w)
        }));
        ok('S18-D 再度到期：入口计数 2 词（3 天档到期回队列）', q2.sub.indexOf('今日到期 2 词') >= 0, q2.sub);
        ok('S18-D 队列仍按最逾期优先（abandon 先于 transport）',
          q2.queue.length === 2 && q2.queue[0] === 'abandon' && q2.queue[1] === 'transport', JSON.stringify(q2.queue));
        await page.click('#btn-srs-review');
        await page.waitForSelector('#scr-battle.active', { timeout: 8000 });
        await page.waitForFunction(() => typeof run !== 'undefined' && run && run.q, { timeout: 15000 });
        await battleChoice(page, 1);   // abandon 答对 → 3→7 天档
        await page.waitForFunction(() => typeof run !== 'undefined' && run && run.q && run.q.word.w === 'transport' && !run.q.locked, { timeout: 15000 });
        await battleChoice(page, 1);   // transport 答对 → 3→7 天档 + 掌握度满 3 星攻克出册
        const dToast = await pollToast(page, '已攻克错题', 8000);
        const dSave = await diskSave();
        ok('S18-D transport 晋升 7 天档：st 2→3 且 due≈+7 天',
          dSave.srs.transport.st === 3 && Math.abs(dSave.srs.transport.due - (Date.now() + 7 * DAY)) < 5000, JSON.stringify(dSave.srs.transport));
        ok('S18-D 「📕 已攻克错题」toast 提到 transport', dToast.indexOf('transport') >= 0, JSON.stringify(dToast));
        ok('S18-D 错题本清册（3 星攻克出册）', Object.keys(dSave.wrongBook).length === 0, JSON.stringify(dSave.wrongBook));
        ok('S18-D 掌握度 3 星（lv=3）', dSave.mastery.transport.lv === 3, dSave.mastery.transport.lv);
        await waitResult(page, 20000);
        await assertResult(page, 'S18-D 复习完成', '🧠 今日待复习完成！', '🧠 复习 2 词');
        await page.click('#btn-result-home');
        await backHome(page);

        /* ---------- E. 7 天档答对 → 成熟（30 天回归） ---------- */
        await skipToOverdue((s, now) => {
          s.srs.abandon.due = now - 2 * 3600e3;
          s.srs.transport.due = now - 3600e3;
        });
        const q3 = await page.evaluate(() => ({
          sub: document.getElementById('srs-sub').textContent,
          queue: srsDueList().map(x => x.w)
        }));
        ok('S18-E 7 天档到期：入口计数 2 词', q3.sub.indexOf('今日到期 2 词') >= 0, q3.sub);
        await page.click('#btn-srs-review');
        await page.waitForSelector('#scr-battle.active', { timeout: 8000 });
        await page.waitForFunction(() => typeof run !== 'undefined' && run && run.q, { timeout: 15000 });
        await battleChoice(page, 1);
        await page.waitForFunction(() => typeof run !== 'undefined' && run && run.q && run.q.word.w === 'transport' && !run.q.locked, { timeout: 15000 });
        await battleChoice(page, 1);
        const eSave = await diskSave();
        ok('S18-E transport 晋升成熟档：st=4 且 due≈+30 天（SM-2 lite 固定回归）',
          eSave.srs.transport.st === 4 && Math.abs(eSave.srs.transport.due - (Date.now() + 30 * DAY)) < 5000, JSON.stringify(eSave.srs.transport));
        ok('S18-E abandon 同步成熟（st=4）', eSave.srs.abandon.st === 4, eSave.srs.abandon.st);
        ok('S18-E 掌握度 4 星', eSave.mastery.transport.lv === 4, eSave.mastery.transport.lv);
        ok('S18-E 排程词条字段集完整（st/due/ok/wrong/t 五字段齐全 · 存档往返无损）',
          ['st', 'due', 'ok', 'wrong', 't'].every(k => typeof eSave.srs.transport[k] === 'number') &&
          eSave.srs.transport.ok >= 4 && eSave.srs.transport.wrong === 1, JSON.stringify(eSave.srs.transport));
        await waitResult(page, 20000);
        await assertResult(page, 'S18-E 复习完成', '🧠 今日待复习完成！', '🧠 复习 2 词');
        const eChips = await page.evaluate(() => Array.from(document.querySelectorAll('#result-stats .chip')).map(c => c.textContent.trim()));
        ok('S18-E 结算 chips 记账「⬆️ 晋升 2 词」（双词 7 天档→成熟）',
          eChips.some(c => c.indexOf('⬆️ 晋升 2') >= 0) && eChips.some(c => c.indexOf('⬇️ 降档 0') >= 0), JSON.stringify(eChips));
        await page.click('#btn-result-home');
        await backHome(page);

        /* ---------- F. 闭环收口：队列清空回空态 + 词详情「记忆档位 成熟」+ 记忆画像联动 ---------- */
        const f0 = await page.evaluate(() => ({
          sub: document.getElementById('srs-sub').textContent,
          dueN: srsCountToday()
        }));
        ok('S18-F 成熟档 30 天回归未到期：入口回空态文案（记忆闭环走完）', f0.dueN === 0 && f0.sub.indexOf('今日没有到期词') >= 0, JSON.stringify(f0));
        await page.click('#btn-codex');
        await page.waitForSelector('#scr-codex.active', { timeout: 5000 });
        await page.fill('#codex-search', 'transport');
        await page.waitForSelector('#codex-list .cx-row', { timeout: 5000 });
        await page.click('#codex-list .cx-row');
        await page.waitForSelector('#word-overlay:not([hidden])', { timeout: 5000 });
        const fWo = await page.evaluate(() => ({
          word: document.getElementById('wo-word').textContent,
          chips: Array.from(document.querySelectorAll('#wo-stats .chip')).map(c => c.textContent),
          rows: Array.from(document.querySelectorAll('#wo-profile .wp-row')).map(r => ({
            tag: r.querySelector('.wp-tag').textContent, val: r.querySelector('.wp-val').textContent }))
        }));
        ok('S18-F 词详情档位徽章「🧠 记忆档位 成熟」', fWo.chips.some(c => c.indexOf('记忆档位 成熟') >= 0), JSON.stringify(fWo.chips));
        /* 「⏰ 下次复习」与「今日待复习」同源（r19 低危清账回归钉）：有排程的词读 srs.due
           ——成熟档显示「30 天后」；修复前读 legacy mastery.due（4 星 ≈48h·ease，会显示
           「2 天后」，与档位徽章/入口队列各说各话） */
        ok('S18-F 「⏰ 下次复习」读排程 srs.due（成熟档 30 天后 · 与今日待复习同口径）',
          fWo.chips.some(c => c.indexOf('⏰ 下次复习 30 天后') >= 0), JSON.stringify(fWo.chips));
        ok('S18-F 记忆画像四行在位（拆解/联想/例句/词族 · r20 词族行新增）',
          fWo.rows.length === 4 && fWo.rows[0].tag.indexOf('拆解') >= 0 &&
          fWo.rows[1].tag.indexOf('联想') >= 0 && fWo.rows[2].tag.indexOf('例句') >= 0 && fWo.rows[3].tag.indexOf('词族') >= 0, JSON.stringify(fWo.rows));
        ok('S18-F 拆解行复用词汇密码（trans/port）', fWo.rows[0].val.indexOf('trans') >= 0 && fWo.rows[0].val.indexOf('port') >= 0, fWo.rows[0].val);
        await page.click('#wo-close');
        await page.click('#btn-codex-back');
        await backHome(page);

        /* ---------- C2. 队列上限：>20 词到期 → 入口提示截断 + 会话只带最逾期 20 词 ---------- */
        const FILLERS = ['ability', 'absorb', 'academic', 'accent', 'access', 'achieve', 'acquire', 'adjust',
          'admire', 'advance', 'advice', 'afford', 'agree', 'alarm', 'ancient', 'annoy', 'apologize', 'appear', 'apply'];
        await skipToOverdue((s, now) => {
          s.srs.abandon.due = now - 3 * 3600e3;                    // 最逾期 → 队首
          s.srs.transport.due = now - 2 * 3600e3;
          FILLERS.forEach((w, i) => { s.srs[w] = { st: 1, due: now - 60e3 * (i + 1), ok: 1, wrong: 0, t: now }; });
        });
        const q4 = await page.evaluate(() => ({
          sub: document.getElementById('srs-sub').textContent,
          dueN: srsCountToday(),
          first: (srsDueList()[0] || {}).w
        }));
        ok('S18-C2 21 词到期：入口计数带截断提示「今日到期 21 词 · 本次先复习 20 词」',
          q4.dueN === 21 && q4.sub.indexOf('今日到期 21 词') >= 0 && q4.sub.indexOf('本次先复习 20 词') >= 0, JSON.stringify(q4));
        ok('S18-C2 队首仍是最逾期的 abandon', q4.first === 'abandon', q4.first);
        await page.click('#btn-srs-review');
        await page.waitForSelector('#scr-battle.active', { timeout: 8000 });
        await page.waitForFunction(() => typeof run !== 'undefined' && run && run.q, { timeout: 15000 });
        const ov = await page.evaluate(() => ({
          total: run.reviewTotal, first: run.q.word.w,
          banner: document.getElementById('banner-box').textContent
        }));
        ok('S18-C2 会话队列截断为 20 词（SRS_SESSION_MAX）且首词=abandon', ov.total === 20 && ov.first === 'abandon', JSON.stringify(ov));
        ok('S18-C2 横幅注明「今日到期 21 词，本次先复习最逾期的 20 词」',
          ov.banner.indexOf('今日到期 21 词') >= 0 && ov.banner.indexOf('本次先复习最逾期的 20 词') >= 0, ov.banner);
        await quitOrSettled(page);
        await waitResult(page, 15000);
        await page.click('#btn-result-home');
        await backHome(page);

        /* ---------- G. 内容质量抽查（2909 词全量走真实 renderWordProfile 渲染） ---------- */
        const g = await page.evaluate(() => {
          const box = document.getElementById('wo-profile');
          let root = 0, syl = 0, neither = 0, assoc = 0, cloze = 0, sceneN = 0, sceneLinked = 0;
          let compMismatch = null;
          const sylSample = [], sceneSample = [];
          for (let i = 0; i < ALL_WORDS.length; i++) {
            const it = ALL_WORDS[i];
            renderWordProfile(it.w, meaningOfAny(it.w) || it.m);
            const rows = Array.from(box.querySelectorAll('.wp-row')).map(r => ({
              tag: r.querySelector('.wp-tag').textContent, val: r.querySelector('.wp-val').textContent }));
            const code = wordCode(it.w), s = syllablesOf(it.w), sc = sceneOf(it.w);
            if (code) root++;
            else if (s) { syl++; if (sylSample.length < 25) sylSample.push(it.w); }
            else neither++;
            const assocRow = rows.find(r => r.tag.indexOf('联想') >= 0);
            if (assocRow && assocRow.val && assocRow.val.length >= 4) assoc++;
            const clozeVal = (box.querySelector('.wp-cloze .wp-val') || {}).textContent || '';
            if (clozeVal.indexOf('____') >= 0) cloze++;
            if (sc) {
              sceneN++;
              const want = sc + ' ' + (sceneHookOf(it.w) || '把画面记进这个词里');
              if (assocRow && assocRow.val === want) sceneLinked++;
              else if (!compMismatch) compMismatch = { w: it.w, got: assocRow ? assocRow.val : null, want: want };
              if (sceneSample.length < 12) sceneSample.push(it.w);
            }
          }
          /* 无词根 fallback 抽查：逐词重渲染，音节行必须为首行且与 syllablesOf 一致 */
          const sylChecks = sylSample.map(w => {
            renderWordProfile(w, meaningOfAny(w) || '');
            const r0 = box.querySelector('.wp-row');
            const tag = r0 ? r0.querySelector('.wp-tag').textContent : '';
            const val = r0 ? r0.querySelector('.wp-val').textContent : '';
            return { w: w, ok: tag.indexOf('音节') >= 0 && /^[a-z]+(·[a-z]+)+$/.test(val) && val === syllablesOf(w), val: val };
          });
          return { total: ALL_WORDS.length, root: root, syl: syl, neither: neither, assoc: assoc, cloze: cloze,
            sceneN: sceneN, sceneLinked: sceneLinked, compMismatch: compMismatch, sylChecks: sylChecks };
        });
        ok('S18-G 词典全量 2909 词', g.total === 2909, g.total);
        /* R20 词根扩容后锁定 ≥1020 词（35%）——r19 基线 549（18.9%），扩容库见 words.js CODE_ROOT_EXT；
           音节 fallback 随词根覆盖上移同步下调（r19 基线 1815，大量词由音节兜底升级为词根拆解） */
        ok('S18-G 词根拆解覆盖 ' + g.root + '/' + g.total + '（R20 锁定 ≥1020 = 35%）', g.root >= 1020, g.root);
        ok('S18-G 覆盖守恒：词根 + 音节 + 双无 = ' + g.total, g.root + g.syl + g.neither === g.total, g.root + '+' + g.syl + '+' + g.neither);
        ok('S18-G 无词根词音节 fallback 覆盖 ' + g.syl + ' 词（R20 下调 ≥1100）', g.syl >= 1100, g.syl);
        ok('S18-G 联想行 100% 覆盖（' + g.assoc + '/' + g.total + ' · 无词根无音节词走「闭上眼」兜底）',
          g.assoc === g.total, g.assoc + '/' + g.total);
        ok('S18-G 例句填空 100% 覆盖（' + g.cloze + '/' + g.total + ' · 按词性模板挖空 ____）',
          g.cloze === g.total, g.cloze + '/' + g.total);
        ok('S18-G 无词根 fallback 生效抽查 ≥20 词（实际 ' + g.sylChecks.length + ' · 音节行 a·b·c 格式与 syllablesOf 一致）',
          g.sylChecks.length >= 20 && g.sylChecks.every(x => x.ok), JSON.stringify(g.sylChecks.filter(x => !x.ok)));
        ok('S18-G 词景与联想行联动 100%（' + g.sceneLinked + '/' + g.sceneN + ' · 联想行首=词景 emoji+类别钩子）',
          g.sceneN >= 300 && g.sceneLinked === g.sceneN, JSON.stringify(g.compMismatch || (g.sceneLinked + '/' + g.sceneN)));
        /* 基线行（供后续轮次对比内容覆盖率，勿删除；与 SCENE-STATS 同期记录） */
        console.log('PROFILE-STATS ' + JSON.stringify({ total: g.total, root: g.root,
          rootPct: Math.round(g.root / g.total * 1000) / 10, sylFallback: g.syl, neither: g.neither,
          assoc: g.assoc, cloze: g.cloze, scene: g.sceneN, sceneLinked: g.sceneLinked }));
        ok('S18 全程零页面异常（迁移→学习→错题→复习→晋升→攻克→成熟→收口）', errors18.length === 0, errors18.join(' | '));
        await c18.context.close();
      }

      /* ============ S19 · 记忆科学二期（r20）：FSRS 调度 / 易混词对比卡 / 词族图谱 / 双例句 / 记忆报告 ============ */
      console.log('---- S19 记忆科学二期（r20） ----');
      {
        const seed19 = baseSave();
        seed19.mastery.abandon = { lv: 1, seen: 2, ok: 1, wrong: 1, last: 1700000000000, due: 0, wrongStreak: 0 };
        seed19.srs = {
          abandon: { st: 1, due: Date.now() - 864e5, ok: 1, wrong: 1, t: Date.now() - 864e5 },
          absorb: { st: 2, due: Date.now() + 2 * 864e5, ok: 2, wrong: 0, t: Date.now() - 3 * 864e5 },
          access: { st: 0, due: Date.now() - 1000, ok: 0, wrong: 1, t: Date.now() - 864e5 }
        };
        seed19.wrongBook = {
          abandon: { n: 2, t: Date.now() - 864e5 },
          absorb: { n: 1, t: Date.now() - 2 * 864e5 },
          access: { n: 1, t: Date.now() - 864e5 }
        };
        seed19.streak = { count: 5, last: new Date().toDateString(), todayCount: 7 };
        const c19 = await newContext(browser, seed19);
        const errors19 = [];
        c19.page.on('pageerror', e => errors19.push(e.message));
        const page = c19.page;
        const diskSave19 = () => page.evaluate(() => {
          if (typeof persistFlush === 'function') persistFlush();
          return JSON.parse(localStorage.getItem('wq_save_v1'));
        });

        /* ---------- A. 调度算法：设置页 select + FSRS 切换落盘 + d/s 双参数 + 往返 ---------- */
        await gotoHome(page);
        await page.click('#btn-settings');
        await page.waitForSelector('#scr-settings.active', { timeout: 8000 });
        const schedA = await page.evaluate(() => ({
          exists: !!document.getElementById('set-sched'),
          value: document.getElementById('set-sched').value,
          options: Array.from(document.getElementById('set-sched').options).map(o => o.value)
        }));
        ok('S19-A 设置页『调度算法』存在且默认 sm2', schedA.exists && schedA.value === 'sm2' &&
          schedA.options.indexOf('fsrs') >= 0, JSON.stringify(schedA));
        await page.selectOption('#set-sched', 'fsrs');
        await page.waitForTimeout(300);
        const schedB = await (await diskSave19()).settings.scheduler;
        ok('S19-A 切 FSRS 后 settings.scheduler 落盘为 fsrs', schedB === 'fsrs', schedB);
        /* 页内真实作答（走真实 updateMastery 链路）：老档懒派生 + 双参数落盘 */
        const fsrsAns = await page.evaluate(() => {
          updateMastery('abandon', true, false);
          if (typeof persistFlush === 'function') persistFlush();   /* persist 是防抖写，断言前先冲盘 */
          const e = (JSON.parse(localStorage.getItem('wq_save_v1')).srs || {}).abandon;
          return { d: e.d, s: e.s, st: e.st, dueGapDays: (e.due - Date.now()) / 864e5 };
        });
        ok('S19-A FSRS 作答落盘 D/S 双参数（D∈[1,10] / S>0 / due=now+S 天）',
          fsrsAns.d >= 1 && fsrsAns.d <= 10 && fsrsAns.s > 0 && Math.abs(fsrsAns.dueGapDays - fsrsAns.s) < 0.2,
          JSON.stringify(fsrsAns));
        await page.selectOption('#set-sched', 'sm2');
        await page.waitForTimeout(300);
        const sm2Back = await page.evaluate(() => {
          updateMastery('abandon', true, false);   /* SM-2 日阶梯：FSRS 期已晋 st=2 → 答对晋升 3，due=+7 天 */
          if (typeof persistFlush === 'function') persistFlush();
          const after = (JSON.parse(localStorage.getItem('wq_save_v1')).srs || {}).abandon;
          return { st: after.st, dueGapDays: (after.due - Date.now()) / 864e5, dKept: after.d, sKept: after.s };
        });
        ok('S19-A 切回 SM-2：st 照常晋升 / due=+7 天日阶梯 / FSRS d/s 字段留存不改写',
          sm2Back.st === 3 && Math.abs(sm2Back.dueGapDays - 7) < 0.05 && sm2Back.dKept !== undefined && sm2Back.sKept !== undefined,
          JSON.stringify(sm2Back));
        await page.click('#btn-settings-back');
        await backHome(page);

        /* ---------- B. 易混词对比卡（词详情 + 复习会话记忆卡槽位） ---------- */
        await page.click('#btn-codex');
        await page.waitForSelector('#scr-codex.active', { timeout: 8000 });
        await page.evaluate(() => openWordDetail('affect'));
        await page.waitForSelector('#word-overlay:not([hidden])', { timeout: 5000 });
        const cc = await page.evaluate(() => {
          const el = document.getElementById('wo-confuse');
          const grid = el.querySelector('.cc-grid');
          const cols = el.querySelectorAll('.cc-col');
          const src = el.querySelector('.cc-src');
          return {
            visible: !el.hidden,
            cols: cols.length,
            hl: el.querySelectorAll('.cc-hl').length,
            src: src ? src.textContent : '',
            hasEffect: el.textContent.indexOf('effect') >= 0,
            sents: el.querySelectorAll('.cc-sent').length
          };
        });
        ok('S19-B 词详情易混词对比卡：两词并列 + 差异字符高亮 + 来源标注 + 对比例句',
          cc.visible && cc.cols === 2 && cc.hl >= 2 && cc.src.indexOf('预置种子对') >= 0 &&
          cc.hasEffect && cc.sents === 2, JSON.stringify(cc));
        await page.evaluate(() => closeWordOverlay());
        const memConfuse = await page.evaluate(() => {
          run = { mode: 'srs', ended: false };          /* 模拟复习会话上下文（仅验证槽位渲染，不开真实战局） */
          const shown = injectConfuseCompare('affect', 'mem-confuse', true);
          const vis = !document.getElementById('mem-confuse').hidden;
          run = undefined;                              /* 还原，防污染后续用例 */
          injectConfuseCompare('affect', 'mem-confuse', true);
          const hiddenBack = document.getElementById('mem-confuse').hidden;
          return { shown: shown, vis: vis, hiddenBack: hiddenBack };
        });
        ok('S19-B 复习会话（run.mode=srs）记忆卡注入对比卡 / 非 srs 槽位隐藏',
          memConfuse.shown && memConfuse.vis && memConfuse.hiddenBack, JSON.stringify(memConfuse));

        /* ---------- C. 同根词族图谱（词族行 + 点击互跳） ---------- */
        await page.evaluate(() => openWordDetail('transport'));
        await page.waitForSelector('#word-overlay:not([hidden])', { timeout: 5000 });
        const clan = await page.evaluate(() => {
          const row = document.querySelector('#wo-profile .wp-clan');
          if (!row) return null;
          const chips = Array.from(row.querySelectorAll('.clan-chip'));
          return {
            visible: row.offsetParent !== null,
            root: (row.querySelector('.clan-root') || {}).textContent || '',
            chips: chips.length,
            first: chips.length ? chips[0].dataset.w : ''
          };
        });
        ok('S19-C 词族行可见：port 词根 + 同根词放射列表（≥3 块可跳）',
          !!clan && clan.visible && clan.root === 'port' && clan.chips >= 3, JSON.stringify(clan));
        await page.evaluate(() => {
          const chip = document.querySelector('#wo-profile .wp-clan .clan-chip');
          chip.click();                                  /* 点击同根词块 → 互跳画像 */
        });
        const jumped = await page.evaluate(() => document.getElementById('wo-word').textContent.trim());
        ok('S19-C 点击同根词块互跳画像（wo-word 变为同根词 ' + jumped + '）', jumped && jumped !== 'transport' &&
          jumped.indexOf('transport') < 0, jumped);
        await page.evaluate(() => closeWordOverlay());

        /* ---------- D. 双例句切换（语料词 rigid） ---------- */
        await page.evaluate(() => openWordDetail('rigid'));
        await page.waitForSelector('#word-overlay:not([hidden])', { timeout: 5000 });
        const sent1 = await page.evaluate(() => ({
          cloze: (document.querySelector('#wo-profile .wp-cloze .wp-val') || {}).textContent || '',
          idx: (document.querySelector('#wo-profile .cloze-idx') || {}).textContent || '',
          hasNext: !!document.getElementById('wo-cloze-next')
        }));
        await page.click('#wo-cloze-next');
        const sent2 = await page.evaluate(() => ({
          cloze: (document.querySelector('#wo-profile .wp-cloze .wp-val') || {}).textContent || '',
          idx: (document.querySelector('#wo-profile .cloze-idx') || {}).textContent || ''
        }));
        ok('S19-D 语料词双例句：句 1 挖空 ____ + 指示 1/2 → 换一句后 2/2 且句面变化',
          sent1.cloze.indexOf('____') >= 0 && sent1.idx === '1/2' && sent1.hasNext &&
          sent2.idx === '2/2' && sent2.cloze !== sent1.cloze && sent2.cloze.indexOf('____') >= 0,
          JSON.stringify({ s1: sent1, s2: sent2 }));
        await page.evaluate(() => closeWordOverlay());
        await page.click('#btn-codex-back');
        await backHome(page);

        /* ---------- E. 🧠 记忆报告（与 localStorage 严格同源） ---------- */
        ok('S19-E 主页新增 🧠 记忆报告 入口', await page.evaluate(() => !!document.getElementById('btn-memreport')), '');
        await page.click('#btn-memreport');
        await page.waitForSelector('#scr-memreport.active', { timeout: 8000 });
        const rep = await page.evaluate(() => {
          const tiers = Array.from(document.querySelectorAll('#mr-tiers .mr-tier-n')).map(b => Number(b.textContent));
          const hot1 = document.querySelector('#mr-hotspots .mr-hot');
          return {
            tiers: tiers,
            canvas: !!document.getElementById('mr-canvas') && !!document.getElementById('mr-canvas').getContext,
            hot1: hot1 ? { w: hot1.querySelector('.mr-hot-word').textContent, score: hot1.querySelector('.mr-hot-score').textContent } : null,
            hotN: document.querySelectorAll('#mr-hotspots .mr-hot').length,
            streak: (document.getElementById('mr-streak') || {}).textContent || '',
            dataDays: (document.getElementById('mr-canvas').getAttribute('data-days')) || '',
            dataTotal: (document.getElementById('mr-canvas').getAttribute('data-total')) || ''
          };
        });
        const diskRep = await diskSave19();
        /* 与 localStorage 同源核对：档位分布（abandon st1 / absorb st2 / access st0）
           + 遗忘热点 Top1 = 错次×逾期加权最大者 + 连续天数 */
        const wantTiers = [0, 0, 0, 0, 0];
        Object.keys(diskRep.srs || {}).forEach(k => {
          const st = Math.max(0, Math.min(4, diskRep.srs[k].st | 0));
          wantTiers[st]++;
        });
        ok('S19-E 档位分布与 localStorage 一致（' + JSON.stringify(rep.tiers) + '）',
          JSON.stringify(rep.tiers) === JSON.stringify(wantTiers) && rep.tiers.reduce((a, b) => a + b, 0) === 3,
          JSON.stringify({ got: rep.tiers, want: wantTiers }));
        ok('S19-E 未来 7 天到期曲线 canvas 就绪（ctx 可取）', rep.canvas === true, rep.canvas);
        ok('S19-E 遗忘热点 Top1 = abandon（错 2 次 × 已逾期加权最高）且共 3 个热点',
          rep.hot1 && rep.hot1.w === 'abandon' && rep.hotN === 3, JSON.stringify({ hot1: rep.hot1, n: rep.hotN }));
        ok('S19-E 连续学习天数与存档一致（streak 5 天 / 今日 7 题）',
          rep.streak.indexOf('5') >= 0 && rep.streak.indexOf('7') >= 0, rep.streak);
        /* R20b 回归钉：到期曲线柱值与 localStorage 同源一致。镜像 memReportData 分桶语义
           （逾期→今天桶 / 远期→+6 桶；epoch 毫秒严禁 |0 截断——曾致曲线全 0 或全塌今天） */
        const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
        const wantDays = [0, 0, 0, 0, 0, 0, 0];
        Object.keys(diskRep.srs || {}).forEach(k => {
          const e = diskRep.srs[k];
          const due = (typeof e.due === 'number' && isFinite(e.due)) ? e.due : 0;
          if (!(due > 0)) return;
          let idx = Math.floor((due - startOfToday.getTime()) / 864e5);
          if (idx < 0) idx = 0;
          if (idx > 6) idx = 6;
          wantDays[idx]++;
        });
        ok('S19-E 到期曲线柱值与 localStorage 逐桶一致（' + rep.dataDays + '）',
          rep.dataDays === wantDays.join(',') && Number(rep.dataTotal) === wantDays.reduce((a2, b2) => a2 + b2, 0),
          JSON.stringify({ got: rep.dataDays, want: wantDays.join(',') }));
        ok('S19-E 曲线含逾期存量（今天桶 ≥1）且总量 = 到期词数',
          wantDays[0] >= 1 && Number(rep.dataTotal) === Object.keys(diskRep.srs).filter(k => diskRep.srs[k].due > 0).length,
          JSON.stringify({ wantDays: wantDays, total: rep.dataTotal }));
        await page.click('#btn-memreport-back');
        await backHome(page);
        ok('S19 全程零页面异常', errors19.length === 0, errors19.join(' | '));
        await c19.context.close();
      }

      /* ============ S-PERF · 性能预算基线（本地服务 · 每轮对比） ============ */
      console.log('---- S-PERF 性能预算 ----');
      {
        const cP = await newContext(browser, null);
        const t0 = Date.now();
        await cP.page.goto(BASE_URL + '/', { waitUntil: 'load' });
        const tLoad = Date.now();
        await cP.page.waitForSelector('#scr-home.active', { timeout: 15000 });
        /* 「可交互」判定：主页激活且 game.js 初始化完成（refreshHome 可用、入口按钮可点）。
           再真实点一次入口按钮证明处理器已挂上（进出战准备即回）。 */
        await cP.page.waitForFunction(() => typeof window.refreshHome === 'function'
          && document.getElementById('scr-home').classList.contains('active'), { timeout: 15000 });
        const tInteractive = Date.now();
        const nav = await cP.page.evaluate(() => {
          const n = (performance.getEntriesByType('navigation') || [])[0];
          return n ? { loadEventEnd: Math.round(n.loadEventEnd), domContentLoaded: Math.round(n.domContentLoadedEventEnd), start: Math.round(n.startTime) } : null;
        });
        const loadMs = nav && nav.loadEventEnd > 0 ? nav.loadEventEnd - nav.start : (tLoad - t0);
        const interactMs = tInteractive - t0;
        ok('S-PERF 主页加载完成 ≤3000ms（实际 ' + loadMs + 'ms）', loadMs <= 3000, 'loadMs=' + loadMs);
        ok('S-PERF 首次可交互 ≤5000ms（实际 ' + interactMs + 'ms）', interactMs <= 5000, 'interactMs=' + interactMs);
        /* JS heap 采样①：加载完成后 */
        const heap1 = await cP.page.evaluate(() => (performance.memory
          ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize, limit: performance.memory.jsHeapSizeLimit }
          : null));
        if (heap1) {
          ok('S-PERF heap 采样可得（Chromium performance.memory）', heap1.used > 0);
        } else {
          skip('S-PERF heap 采样', '当前浏览器不暴露 performance.memory');
        }
        /* 真实可交互性证明：入口按钮点击有响应（进出战准备后再 Esc 返回） */
        await cP.page.click('#btn-adventure');
        await cP.page.waitForSelector('#scr-setup.active', { timeout: 5000 });
        await cP.page.click('#btn-setup-back');
        await cP.page.waitForSelector('#scr-home.active', { timeout: 5000 });
        /* JS heap 采样②：一轮主页↔出战设置往返后（供后续轮次对比增长） */
        const heap2 = await cP.page.evaluate(() => (performance.memory
          ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize, limit: performance.memory.jsHeapSizeLimit }
          : null));
        const mb = n => (n / 1048576).toFixed(1) + 'MB';
        /* 基线行（供后续轮次对比，勿删除；阈值调整需记录原因） */
        console.log('PERF-BASELINE ' + JSON.stringify({
          loadMs: loadMs, interactiveMs: interactMs,
          heapAfterLoad: heap1 ? { usedMB: mb(heap1.used), totalMB: mb(heap1.total) } : null,
          heapAfterTour: heap2 ? { usedMB: mb(heap2.used), totalMB: mb(heap2.total) } : null,
          ua: await cP.page.evaluate(() => navigator.userAgent)
        }));
        await cP.context.close();
      }

      await browser.close();
    } catch (e) {
      fail++;
      failures.push('e2e 主流程异常: ' + e.message);
      console.error('E2E 主流程异常: ' + e.stack);
      process.exitCode = 1;
    } finally {
      try { if (browser) await browser.close(); } catch (e) {}
      try { server.close(); } catch (e) {}
    }
    console.log('========================================');
    console.log('e2e: PASS ' + pass + ' / FAIL ' + fail + (failures.length ? '  → ' + failures.join(' | ') : ''));
    if (fail) process.exitCode = 1;
  })().catch(e => { console.error('E2E FATAL: ' + e.stack); process.exitCode = 1; });
}
