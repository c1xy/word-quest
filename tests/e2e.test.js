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
/* seed === null 表示完全不带存档（走 defaultSave：firstRun=true 新档） */
async function newContext(browser, seed) {
  const context = await browser.newContext({ viewport: { width: 420, height: 860 } });
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
  if (wantChipPart) ok(label + ' · 含 chip「' + wantChipPart + '」', r.chips.some(c => c.indexOf(wantChipPart) >= 0), JSON.stringify(r.chips));
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
        await B.page.click('#btn-result-code');
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
