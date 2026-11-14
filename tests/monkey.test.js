/* Word Quest · monkey test（WQ 版随机漫游）
   用法：node tests/monkey.test.js   （或经 tests/run-all.js monkey 显式调度）
   做什么：在真实页面里当 2 分钟「猴子」——随机挑可见可点元素真实点击（mouse 事件，
   含双击）+ 随机键盘注入（Tab/Enter/Esc/方向键/数字/字母，聚焦输入框时乱打字），
   覆盖主页四组入口、战斗答题、记忆配对、图鉴/设置/词境等全部界面。
   断言什么：全程零 pageerror（硬门槛）、动作量达标（按时长折算 ≥0.85 动作/秒，防「假跑」）、
   漫游过 ≥2 个界面（防原地打转）；console.error 只打印不判失败（headless 语音/自动播放降级
   会有正常报错日志，详见 tests/README.md）。
   时长可用环境变量覆盖：WQ_MONKEY_MS=30000 node tests/monkey.test.js
   依赖：同 e2e（playwright → playwright-core → 全局 @playwright/cli；浏览器探测同 e2e）。 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* ---------- playwright / 浏览器解析（与 e2e.test.js 同语义，独立自包含） ---------- */
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
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- 静态服务器（与 e2e 同语义：临时端口 + no-cache） ---------- */
function startServer() {
  const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json',
    '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon'
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

/* ---------- 猴子的动作素材 ---------- */
/* 可点候选：按钮/选项/配对卡/图鉴行/页签/复选/下拉/输入/ chips——一次 querySelectorAll 全收 */
const PICK_CANDIDATES = `(() => {
  const nodes = document.querySelectorAll('button, .opt, .mcard, .cx-row, .tab, [role="button"], input, select, textarea, .fam-chip, .chip-btn');
  const vw = innerWidth, vh = innerHeight, out = [];
  for (const el of nodes) {
    if (el.disabled) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue;
    /* 只要视口内元素：视口外的下一拍再滚动到它（见 PICK 的 offscreen 分支） */
    if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) { out.push({ off: true, y: (r.top + r.bottom) / 2 }); continue; }
    out.push({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, r.height * 0.34)), tag: el.tagName, id: el.id || '', cls: (el.className && el.className.baseVal !== undefined ? '' : String(el.className || '')).slice(0, 24) });
  }
  return out;
})()`;
/* 滚动一拍：把视口外元素滚进来，扩大下一拍的可点面 */
const SCROLL_SOME = `(() => { window.scrollBy(0, (Math.random() * 2 - 1) * 320); return true; })()`;

const KEY_POOL = ['Tab', 'Shift+Tab', 'Enter', ' ', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', '1', '2', '3', '4', 'Backspace', 'a', 'b', 'p', 'm', 's'];
const TYPE_POOL = ['abandon', 'apple', 'test', '123', 'x'];

(async () => {
  const found = resolvePlaywright();
  if (!found) { console.log('SKIP  monkey（未找到 playwright/playwright-core，安装方法见 tests/README.md）'); return; }
  const { pw, via } = found;
  const exe = resolveBrowserExecutable(pw);
  if (!exe) { console.log('SKIP  monkey（未找到浏览器可执行文件，可用 WQ_CHROME_PATH 指定）'); return; }

  const DURATION_MS = Math.max(10000, parseInt(process.env.WQ_MONKEY_MS || '120000', 10) || 120000);
  const server = await startServer();
  const port = server.address().port;
  const BASE_URL = 'http://127.0.0.1:' + port;
  let browser = null;
  console.log('monkey 启动：playwright=' + via + ' 浏览器=' + exe + ' 时长=' + (DURATION_MS / 1000) + 's @ ' + BASE_URL);

  try {
    browser = await pw.chromium.launch({ headless: true, executablePath: exe });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
    /* 种子档：解锁全题型（拼写/听写也进池）+ 少量掌握度 + firstRun=false（不卡新手引导条） */
    await context.addInitScript(seed => {
      try {
        if (localStorage.getItem('wq_seed_done') !== '1') {
          localStorage.clear();
          localStorage.setItem('wq_save_v1', seed);
          localStorage.setItem('wq_seed_done', '1');
        }
      } catch (e) {}
    }, JSON.stringify({
      coins: 50, mastery: { abandon: { lv: 2, seen: 3, ok: 2, wrong: 1, last: 1700000000000, due: 0, wrongStreak: 0, ease: 2.0 } },
      ach: {}, pets: {}, talents: {}, wrongBook: {}, poisonLog: [],
      stats: { kills: 0, bosses: 0, spellOk: 0, listenOk: 0, runs: 0, dailyDone: 0, maxCombo: 0, perfects: 0, packDone: 0, labN: 0, labOk: 0, expWins: 0, packDoneMap: {} },
      best: { adventure: 0, endless: 0 }, streak: { count: 0, last: '', todayCount: 0 },
      settings: { sound: true, autoplay: true, bgm: false, rate: 0.9, qtypes: { c2e: true, e2c: true, spell: true, listen: true } },
      lastLists: ['cet4'], firstRun: false
    }));

    const page = await context.newPage();
    page.on('dialog', d => d.accept().catch(() => {}));
    const errors = [];
    const consoleErrors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 160)); });

    await page.goto(BASE_URL + '/', { waitUntil: 'load' });
    await page.waitForSelector('#scr-home.active', { timeout: 15000 });

    /* ---------- 猴子主循环 ---------- */
    let clicks = 0, keys = 0, scrolls = 0, misses = 0;
    const screens = {};
    const t0 = Date.now();
    let i = 0;
    while (Date.now() - t0 < DURATION_MS) {
      i++;
      /* 每 8 拍记一次当前界面（漫游广度统计） */
      if (i % 8 === 0) {
        try {
          const scr = await page.evaluate(() => {
            const a = document.querySelector('.screen.active');
            return a ? a.id : '(none)';
          });
          screens[scr] = (screens[scr] || 0) + 1;
        } catch (e) { /* 导航中 */ }
      }
      /* 每 20 拍滚一滚：让视口外控件也有被点到的机会 */
      if (i % 20 === 0) {
        try { await page.evaluate(SCROLL_SOME); scrolls++; } catch (e) { /* 页面跳转中 */ }
        await sleep(30);
        continue;
      }
      /* 30% 拍键盘注入，70% 拍真实点击 */
      if (Math.random() < 0.3) {
        keys++;
        try {
          const key = KEY_POOL[Math.floor(Math.random() * KEY_POOL.length)];
          await page.keyboard.press(key);
          /* 聚焦在输入框时偶尔补一串乱打字（拼写题/搜索框/自定义词库文本域） */
          if (Math.random() < 0.4) {
            const isText = await page.evaluate(() => {
              const a = document.activeElement;
              return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && !a.disabled && !a.readOnly;
            });
            if (isText) await page.keyboard.type(TYPE_POOL[Math.floor(Math.random() * TYPE_POOL.length)], { delay: 8 });
          }
        } catch (e) { misses++; }
      } else {
        clicks++;
        try {
          const cands = await page.evaluate(PICK_CANDIDATES);
          const clickable = cands.filter(c => !c.off);
          const offscreen = cands.filter(c => c.off);
          let target = null;
          if (clickable.length && (Math.random() > 0.25 || !offscreen.length)) {
            target = clickable[Math.floor(Math.random() * clickable.length)];
          } else if (offscreen.length) {
            /* 滚到那条视口外元素的位置附近，下一拍就有机会点到 */
            const y = offscreen[Math.floor(Math.random() * offscreen.length)].y;
            await page.evaluate(dy => window.scrollBy(0, dy), Math.sign(y - 400) * Math.min(Math.abs(y - 400), 420));
            scrolls++;
            continue;
          }
          if (target) {
            await page.mouse.move(target.x, target.y);
            await page.mouse.down();
            await page.mouse.up();
            if (Math.random() < 0.06) { await page.mouse.down(); await page.mouse.up(); }   /* 偶尔双击 */
          } else { misses++; }
        } catch (e) { misses++; }   /* 元素在 eval 与 click 之间被移除 = 正常猴子日常 */
      }
      await sleep(120 + Math.floor(Math.random() * 100));
    }
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const screenLine = Object.keys(screens).map(k => k + '×' + screens[k]).join(' ');

    /* ---------- 断言 ---------- */
    ok('monkey 零 pageerror（全程 ' + secs + 's / 点击 ' + clicks + ' / 键盘 ' + keys + ' / 滚动 ' + scrolls + ' / 落空 ' + misses + '）',
      errors.length === 0, errors.slice(0, 6).join(' | '));
    /* 动作量按时长折算（≥0.85 动作/秒）：2 分钟 ≈ ≥102，短时长冒烟（WQ_MONKEY_MS）也有效 */
    ok('monkey 动作量达标（点击+键盘 ≥0.85/秒 × ' + secs + 's）', clicks + keys >= Math.max(20, parseFloat(secs) * 0.85), 'clicks=' + clicks + ' keys=' + keys);
    ok('monkey 漫游广度（到过 ≥2 个界面）', Object.keys(screens).filter(k => k !== '(none)').length >= 2, screenLine);
    ok('monkey 页面仍可交互（结尾 evaluate 1+1=2）', (await page.evaluate(() => 1 + 1)) === 2);
    if (consoleErrors.length) {
      console.log('INFO  console.error ×' + consoleErrors.length + '（不判失败，headless 语音/自动播放降级属正常）：');
      const uniq = Array.from(new Set(consoleErrors)).slice(0, 5);
      uniq.forEach(t => console.log('        ' + t));
    }
    console.log('MONKEY-TRACE ' + JSON.stringify({ secs: Number(secs), clicks: clicks, keys: keys, scrolls: scrolls, misses: misses, screens: screens }));

    await context.close();
  } catch (e) {
    fail++;
    failures.push('monkey 主流程异常: ' + e.message);
    console.error('MONKEY 主流程异常: ' + e.stack);
    process.exitCode = 1;
  } finally {
    try { if (browser) await browser.close(); } catch (e) {}
    try { server.close(); } catch (e) {}
  }
  console.log('========================================');
  console.log('monkey: PASS ' + pass + ' / FAIL ' + fail + (failures.length ? '  → ' + failures.join(' | ') : ''));
  if (fail) process.exitCode = 1;
})().catch(e => { console.error('MONKEY FATAL: ' + e.stack); process.exitCode = 1; });
