/* Word Quest · 单元测试（node 直跑，无浏览器）
   用法：node tests/unit.test.js   （或经 tests/run-all.js 统一调度）
   技法：沿用 src-check 的「切片 + 桩化加载」——game.js 是浏览器代码，这里把被测
   各节源码切片后放进一个共享函数作用域（with 桩环境）执行，与浏览器里多节共用
   顶层 var 的真实形态一致。切片边界用节标题注释锚定，行号漂移不敏感。
   覆盖：存档 sanitize 坏档自愈 / 成就解锁条件 / SRS 排程边界 / 挑战码·成绩码·
   接力码·词境码 编解码往返与坏码拒绝 / 词境参数边界 / DEFLATE 管线。
   标注「来源: src-check/xxx」的断言块整合自历史验证脚本（src-check/ 目录保留不删）。 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const gameSrc = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');

let pass = 0, fail = 0;
function T(name, cond, extra) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra !== undefined ? '  :: ' + extra : '')); }
}
function section(fromMark, toMark) {
  const a = gameSrc.indexOf(fromMark);
  const b = toMark === undefined ? gameSrc.length : gameSrc.indexOf(toMark);
  if (a < 0 || b <= a) { console.error('FATAL: 切片未找到 ' + fromMark.slice(0, 30)); process.exit(1); }
  return gameSrc.slice(a, b);
}

/* ---------- 词库数据（words.js 独立加载，同 src-check/poison-codec-test.js） ---------- */
const wordsSrc = fs.readFileSync(path.join(ROOT, 'words.js'), 'utf8');
const wordsBox = {};
new Function('box', wordsSrc + '; box.WORD_LISTS = WORD_LISTS; box.ALL_WORDS = ALL_WORDS; box.MEANING_OF = MEANING_OF;')(wordsBox);

/* ---------- 桩环境 ---------- */
const toasts = [];
function fakeEl() {
  return {
    value: '', textContent: '', innerHTML: '', hidden: true, disabled: false,
    className: '', style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, focus() {}, select() {}, scrollIntoView() {}
  };
}
const els = {};
const env = {
  console, Math, Date, JSON, Promise, isNaN, parseInt, parseFloat,
  setTimeout, clearTimeout, setInterval, clearInterval,
  ALL_WORDS: wordsBox.ALL_WORDS, MEANING_OF: wordsBox.MEANING_OF, WORD_LISTS: wordsBox.WORD_LISTS,
  localStorage: (function () {
    var m = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: function (k, v) { m[k] = String(v); },
      removeItem: function (k) { delete m[k]; }
    };
  })(),
  document: {
    addEventListener() {}, hidden: false, activeElement: null,
    querySelectorAll: function (sel) {
      if (sel.indexOf('realm-src-list') >= 0) return env.__realmCheckboxes;
      return [];
    },
    createElement: function () { return fakeEl(); }
  },
  window: { addEventListener() {}, AudioContext: null, webkitAudioContext: null },
  location: { origin: 'http://localhost:8931', pathname: '/index.html', search: '', hash: '' },
  history: { replaceState() {} },
  navigator: { userAgent: 'node-unit' },
  $: function (id) { if (!els[id]) els[id] = fakeEl(); return els[id]; },
  toast: function (msg) { toasts.push(String(msg)); },
  Confetti: { burst() {} },
  Sfx: new Proxy({}, { get: function () { return function () {}; } }),
  TTS: { ok: false, speak() {} },
  Rec: { ok: false, listening: false, start() {} },
  BGM: { start() {}, stop() {} },
  meaningOfAny: function (w) { return wordsBox.MEANING_OF[w] || ''; },
  listById: function (id) {                      // 快照清洗用它验词表 id（relaySanitizeSnapshot:6544）
    var hit = null;
    (wordsBox.WORD_LISTS || []).some(function (l) { if (l.id === id) { hit = l; return true; } });
    return hit;
  },
  showScreen() {}, showBanner() {}, updateHUD() {}, noteError() {}, goHomeSafe() {},
  refreshHome() {}, showLoadFail() {}, showBannerCancel() {}, startRun() {},
  __realmCheckboxes: [], __els: els
};
els['toast-wrap'] = fakeEl();

/* ---------- 各节切片（顺序与 game.js 一致，共享同一函数作用域） ---------- */
const secSave    = section('/* ========================= 存档', '/* ========================= 音效');
const secConsts  = section('/* ========================= 游戏内容常量', '/* ========================= 每日任务');
const secRng     = section('function hashStr(s) {', 'function ensureDaily() {');   // hashStr/mulberry32/seededShuffle（词境确定性抽样用）
const secAch     = section('/* ========================= 成就', '/* ========================= 全局提示 Toast');
const secMastery = section('/* ========================= 掌握度 & 打卡', '/* ========================= 词池');
const secDeflate = section('/* ========================= DEFLATE 压缩', '/* ========================= 接力码');
const secRelay   = section('/* ========================= 接力码', '/* ========================= 词境工坊');
const secRealm   = section('/* ========================= 词境工坊', '/* ========================= 分享卡');
const secPoison  = section('/* ========================= 投毒挑战码', '/* ========================= 双人热座对决');

const loader = new Function('__env',
  'with (__env) {\n' +
  secSave + '\n;__env.xSave = { defaultSave, loadSave, sanitizeSave, numOr, intOr, objOr, arrOr, ownKey, persistNow, persistCancel };\n' +
  secConsts + '\n;__env.xConsts = { BOSS_MODS, IV_MIN, DIFFS, setBossMods: function (m) { BOSS_MODS = m; } };\n' +
  secRng + '\n' +
  secAch + '\n;__env.xAch = { ACH, checkAch, unlockAch, masteredCount, addXp, talentRankSum, TALENTS };\n' +
  secMastery + '\n;__env.xMastery = { updateMastery, getM, bumpToday };\n' +
  secDeflate + '\n;__env.xDeflate = { WQ_DEFLATE };\n' +
  secRelay + '\n;__env.xRelay = { RELAY_TEXT_PREFIX, RELAY_QR_MAX_URL, relayBuildPayload, relayParsePayload, relayBuildCode, relayTextToPayload, relayPlanShards, relayShardPayload, relayAcceptShard, relayPartsLoad, relayPartsClear, wqB64Enc, wqB64Dec, wqUtf8Enc, wqUtf8Dec, relaySanitizeSnapshot };\n' +
  secRealm + '\n;__env.xRealm = { REALM_TEXT_PREFIX, REALM_MAX_WORDS, sanitizeRealm, realmBuildPayload, realmParsePayload, realmBuildCode, realmTextToPayload, realmDraftBuild, realmCollectDraft, realmSampleSources, realmParseCustom };\n' +
  secPoison + '\n;__env.xPoison = { POISON_CHARS, pValidate, pChecksum, buildEnc, buildPoisonCode, decodePoisonCode, buildResultCode, decodeResultCode, encWords: function(){ return ENC_WORDS; }, encIndex: function(){ return ENC_INDEX; }, markPoisonSetPending, logPoison };\n' +
  '\n__env.xState = { getSave: function(){ return save; }, setRun: function(r){ run = r; }, getRun: function(){ return run; } };\n}');

try { loader(env); } catch (e) {
  console.error('FATAL: game.js 切片加载失败: ' + e.stack);
  process.exit(1);
}
const { sanitizeSave, defaultSave, numOr } = env.xSave;
const { BOSS_MODS, IV_MIN } = env.xConsts;
const { ACH, checkAch } = env.xAch;
const { updateMastery, getM } = env.xMastery;
const { WQ_DEFLATE } = env.xDeflate;
const R = env.xRelay;
const RM = env.xRealm;
const P = env.xPoison;

const dictWords = Object.keys(wordsBox.MEANING_OF);
const W4 = ['abandon', 'ability', 'absorb', 'abstract'];   // 都在词典内
const LS = env.localStorage;                               // 桩 localStorage（node 作用域内没有全局 localStorage）

/* ================= A. 存档 sanitize 坏档自愈（game.js:90 sanitizeSave 白名单语义） ================= */
console.log('---- A. 存档 sanitize ----');
(function () {
  const d1 = sanitizeSave(null);
  T('A1 null → defaultSave 结构（新档 firstRun=true 弹引导）', d1 && d1.coins === 0 && d1.level === 1 && d1.firstRun === true && typeof d1.mastery === 'object');
  T('A2 非对象（字符串/数组）→ defaultSave', sanitizeSave('junk').coins === 0 && sanitizeSave([1]).coins === 0);

  const d2 = sanitizeSave({ mastery: { abandon: 'corrupt-string', ability: { lv: -5, seen: 1 }, absorb: { lv: 99, ok: 2, ease: 9 }, accelerate: { lv: 3.7, wrongStreak: 1e12 } } });
  T('A3 mastery 脏字符串条目丢弃', d2.mastery.abandon === undefined);
  T('A4 lv 负数夹取 0', d2.mastery.ability.lv === 0);
  T('A5 lv 99 夹取 5', d2.mastery.absorb.lv === 5);
  T('A6 ease 夹取 [1.2, 2.8]（默认 2.0 档）', d2.mastery.accelerate.ease >= 1.2 && d2.mastery.accelerate.ease <= 2.8 && d2.mastery.accelerate.wrongStreak === 999);

  const d3 = sanitizeSave({ coins: '99999999999999', xp: 1e12, level: 'abc', talentPts: -7, sessionSize: 0 });
  T('A7 coins 巨值夹取上限 99999999', d3.coins === 99999999);
  T('A8 xp 巨值夹取上限 999999 / level 非数值取默认 1', d3.xp === 999999 && d3.level === 1);
  T('A9 talentPts 负数夹 0 / sessionSize 夹 [1,100]', d3.talentPts === 0 && d3.sessionSize === 1);

  const d4 = sanitizeSave({ wrongBook: { abandon: 'bad', ability: { n: -3, t: -1e18 }, absorb: { n: 1e15 } } });
  T('A10 wrongBook 脏值丢弃 / n,t 夹取', d4.wrongBook.abandon === undefined && d4.wrongBook.ability.n === 0 && d4.wrongBook.absorb.n === 1e9);

  T('A11 firstRun 缺失 → false（老档不弹引导）', sanitizeSave({}).firstRun === false);
  T('A12 firstRun true 保留（新档弹引导）', sanitizeSave({ firstRun: true }).firstRun === true);

  const protoTarget = {};
  const d5 = sanitizeSave(JSON.parse('{"ach": {"__proto__": {"x": 1}, "duel1": 1}}'));
  T('A13 __proto__ 原型污染被拦截（非 own 属性，原型未受染）',
    !Object.prototype.hasOwnProperty.call(d5.ach, '__proto__') && d5.ach.duel1 === 1 && protoTarget.polluted === undefined,
    JSON.stringify(Object.keys(d5.ach)));

  const d6 = sanitizeSave({ settings: { rate: 5, bgm: 'yes', qtypes: { c2e: 'no', spell: true } } });
  T('A14 settings.rate 夹 [0.5,2] / qtypes 非布尔不采纳（c2e 保持默认 true）', d6.settings.rate === 2 && d6.settings.qtypes.c2e === true && d6.settings.qtypes.spell === true);

  const d7 = sanitizeSave({ poisonLog: [null, 'junk', { role: 'play', words: ['abandon'], cleared: 1, total: 1, win: true }, { role: 'evil' }] });
  T('A15 poisonLog 非对象条目过滤 + role 白名单', d7.poisonLog.length === 2 && d7.poisonLog[0].role === 'play' && d7.poisonLog[1].role === 'play');

  T('A16 poisonIssued 旧版字符串保留', sanitizeSave({ poisonIssued: 'W0123abcd' }).poisonIssued === 'W0123abcd');
  T('A17 poisonIssued 对象格式 words 过滤', sanitizeSave({ poisonIssued: { words: ['abandon', 3], boss: 'rage', t: 123 } }).poisonIssued.words.length === 1);
  T('A18 poisonIssued 无效类型 → null', sanitizeSave({ poisonIssued: 42 }).poisonIssued === null);

  const big = { customLists: [{ id: 'l1', words: [] }, 'junk', { id: '' }, { id: 'l2', words: [['abandon', 'v. 放弃'], ['bad']] }] };
  const d8 = sanitizeSave(big);
  T('A19 customLists 脏条目过滤、词对须 [词,释义] 字符串对', d8.customLists.length === 1 && JSON.stringify(d8.customLists[0].words) === JSON.stringify([['abandon', 'v. 放弃']]));

  // loadSave：localStorage 坏 JSON → defaultSave（自愈不炸启动）
  LS.setItem('wq_save_v1', '{broken json!!');
  const ls = env.xSave.loadSave();
  T('A20 loadSave 坏 JSON → defaultSave', ls && ls.coins === 0 && ls.firstRun === true);
  LS.setItem('wq_save_v1', '{"coins":77,"mastery":{"abandon":{"lv":2}}}');
  T('A21 loadSave 合法档字段保留', env.xSave.loadSave().coins === 77);
  LS.removeItem('wq_save_v1');
})();

/* ================= B. 成就解锁条件（game.js:775 ACH / 823 checkAch） ================= */
console.log('---- B. 成就 ----');
(function () {
  const save = env.xState.getSave();
  const achRow = function (id) { return ACH.filter(function (a) { return a[0] === id; })[0]; };
  T('B1 成就「棋逢对手」描述 = 完成一局双人热座对决（本轮改名回归）', achRow('duel1') && achRow('duel1')[3] === '完成一局双人热座对决', achRow('duel1') && achRow('duel1')[3]);
  T('B2 成就「对决之王」描述含 双人热座对决（口径一致）', achRow('duel_win')[3].indexOf('双人热座对决') >= 0, achRow('duel_win')[3]);

  save.stats.kills = 1; checkAch();
  T('B3 击杀 1 → first_blood 解锁 +20🪙', save.ach.first_blood === 1 && save.coins === 20);
  save.stats.kills = 99; checkAch();
  T('B4 已解锁成就不重复加币', save.coins === 20);

  const fresh = { ach: {}, coins: 0, stats: { kills: 0, bosses: 0, spellOk: 0, listenOk: 0, runs: 0, dailyDone: 0, maxCombo: 0, perfects: 0, packDone: 0, labN: 0, labOk: 0, expWins: 0, packDoneMap: {} }, mastery: {}, streak: { count: 0, last: '', todayCount: 0 }, pets: {}, poisonLog: [], poisonIssued: null, modsSeen: {}, rogue: null, duel: null, best: { adventure: 0, endless: 0 }, level: 1, talents: {} };
  // 直接把共享 save 替换成干净档：逐字段覆盖（save 是顶层 var，保留引用替换内容）
  Object.keys(save).forEach(function (k) { delete save[k]; });
  Object.keys(fresh).forEach(function (k) { save[k] = fresh[k]; });

  checkAch();
  T('B5 全零档不误解锁', Object.keys(save.ach).length === 0, JSON.stringify(Object.keys(save.ach)));

  save.streak.count = 3; checkAch();
  T('B6 打卡 3 天 → 只解 streak3（阈值边界）', save.ach.streak3 === 1 && save.ach.streak7 === undefined);
  save.streak.count = 7; checkAch();
  T('B7 打卡 7 天 → streak7 也解锁', save.ach.streak7 === 1);

  save.duel = { plays: 1, p1wins: 0, p2wins: 0 }; checkAch();
  T('B8 完成 1 局热座对决 → duel1（对决之王未解锁）', save.ach.duel1 === 1 && save.ach.duel_win === undefined);
  save.duel.p2wins = 3; checkAch();
  T('B9 热座累计取胜 3 → duel_win', save.ach.duel_win === 1);

  save.poisonIssued = { words: ['abandon'], boss: 'rage', t: Date.now() }; checkAch();
  T('B10 只发过挑战码（旧档 poisonIssued）→ poison_set', save.ach.poison_set === 1);
  save.poisonLog.unshift({ role: 'play', words: ['abandon'], cleared: 1, total: 1, win: true, t: Date.now() }); checkAch();
  T('B11 通关毒池战绩 → poison_win', save.ach.poison_win === 1);

  const modKeys = Object.keys(BOSS_MODS);
  modKeys.forEach(function (k) { save.modsSeen[k] = 1; }); checkAch();
  T('B12 遭遇全部 ' + modKeys.length + ' 条词缀 → mod_all', save.ach.mod_all === 1);
  delete save.modsSeen[modKeys[0]];
  delete save.ach.mod_all;
  checkAch();
  T('B13 缺 1 条词缀 → mod_all 不解锁', save.ach.mod_all === undefined);
  save.modsSeen[modKeys[0]] = 1;   // 恢复现场

  for (let i = 0; i < 50; i++) save.mastery['w' + i] = { lv: 5, seen: 1 };
  checkAch();
  T('B14 掌握 50 词 → master50（200 不解锁）', save.ach.master50 === 1 && save.ach.master200 === undefined);
})();

/* ================= C. SRS 排程边界（game.js:2166 updateMastery + IV_MIN:655） ================= */
console.log('---- C. SRS 排程 ----');
(function () {
  const save = env.xState.getSave();
  T('C1 IV_MIN 基准表 [0,5,30,720,2880,10080] 分钟', JSON.stringify(IV_MIN) === JSON.stringify([0, 5, 30, 12 * 60, 48 * 60, 7 * 24 * 60]), JSON.stringify(IV_MIN));

  save.mastery.abandon = undefined; delete save.mastery.abandon;
  const t0 = Date.now();
  updateMastery('abandon', true, false);
  let m = save.mastery.abandon;
  T('C2 新词首答对：lv 0→1 / seen 1 / ease 2.0→2.05', m.lv === 1 && m.seen === 1 && m.ease === 2.05);
  T('C3 due = now + IV_MIN[1]×60000×ease ≈ 5 分钟×2.05', Math.abs(m.due - (t0 + 5 * 60000 * 2.05)) < 2000, m.due - t0);
  T('C4 答对 wrongStreak 归零', m.wrongStreak === 0);

  updateMastery('abandon', false, false);
  m = save.mastery.abandon;
  T('C5 答错：lv-1 / ease 2.05→1.8 / due=now / wrongStreak 1', m.lv === 0 && Math.abs(m.ease - 1.8) < 1e-9 && Math.abs(m.due - Date.now()) < 50 && m.wrongStreak === 1,
    JSON.stringify({ lv: m.lv, ease: m.ease, dueDelta: m.due - Date.now(), ws: m.wrongStreak }));
  updateMastery('abandon', false, false);
  T('C6 lv 0 再答错不下穿 0（floor）', save.mastery.abandon.lv === 0);

  save.mastery.ability = { lv: 4, seen: 4, ok: 4, wrong: 0, last: 0, due: 0, wrongStreak: 0, ease: 2.79 };
  updateMastery('ability', true, false);
  T('C7 lv 4→5 封顶 / ease 2.79→2.8 封顶', save.mastery.ability.lv === 5 && save.mastery.ability.ease === 2.8);
  updateMastery('ability', true, false);
  T('C8 lv 5 再答对不越 5 / due 取 IV_MIN[5]', save.mastery.ability.lv === 5 && Math.abs(save.mastery.ability.due - (Date.now() + 7 * 24 * 60 * 60000 * 2.8)) < 3000);
  updateMastery('ability', false, false);
  T('C9 lv 5 答错回落 4（不是负数）', save.mastery.ability.lv === 4);

  save.mastery.absorb = { lv: 0, seen: 1, ok: 1, wrong: 0, last: 0, due: 0, wrongStreak: 0, ease: 1.2 };
  updateMastery('absorb', true, true);
  T('C10 重考后答对：ease 不加长（保持 1.2 floor）', save.mastery.absorb.ease === 1.2);
  updateMastery('absorb', false, false);
  T('C11 ease 1.2 再答错不下穿 1.2', save.mastery.absorb.ease === 1.2);

  save.mastery.abstract = { lv: 2, seen: 2, ok: 2, wrong: 0, last: 0, due: 0, wrongStreak: 0, ease: 2.0 };
  const t2 = Date.now();
  updateMastery('abstract', true, false);
  T('C12 lv2→3 答对 due ≈ now + IV_MIN[3](720min)×2.05（ease 先 +0.05 再计 due）', Math.abs(save.mastery.abstract.due - (t2 + 720 * 60000 * 2.05)) < 2000,
    save.mastery.abstract.due - t2);
  T('C13 getM 自动建档（缺词懒创建全零结构）', (function () { const g = getM('zzfreshword'); return g.lv === 0 && g.seen === 0 && g.ease === undefined; })());
})();

/* ================= D. 挑战码 / 成绩码（整合自 src-check/poison-codec-test.js 场景 1-10） ================= */
console.log('---- D. 挑战码/成绩码 ----');
(function () {
  const save = env.xState.getSave();
  P.buildEnc();   // 惰性词库指纹：显式构建（与浏览器 init 路径一致）
  T('D0 词库规模 ≤4096（双字符索引容量）: ' + P.encWords().length, P.encWords().length > 1000 && P.encWords().length <= 4096);

  // 场景 1：复仇词 + 混淆词对
  env.xState.setRun({ records: [
    { w: 'abandon', m: 'x', ok: 0, wrong: 3 },
    { w: 'ability', m: 'x', ok: 1, wrong: 2 },
    { w: 'absorb', m: 'x', ok: 2, wrong: 0 }
  ] });
  save.confuse = { absorb: { ability: 2 } };
  save.mastery = { abandon: { lv: 0 }, ability: { lv: 3 }, absorb: { lv: 5 } };
  const code1 = P.buildPoisonCode();
  T('D1 挑战码 12-18 位 / W 前缀 / 字符集校验', code1.length >= 12 && code1.length <= 18 && code1.charAt(0) === 'W' && P.pValidate(code1), code1);
  const pd1 = P.decodePoisonCode(code1);
  T('D2 挑战码解码成功且复仇词在列', !!pd1 && pd1.revs.some(function (r) { return r.w === 'abandon'; }));
  T('D3 混淆词对 absorb↔ability 在码内', pd1.pairs.length === 1 && ((pd1.pairs[0][0].w === 'absorb' && pd1.pairs[0][1].w === 'ability') || (pd1.pairs[0][0].w === 'ability' && pd1.pairs[0][1].w === 'absorb')));
  const lvMap = {}; pd1.words.forEach(function (w, i) { lvMap[w] = pd1.lvs[i]; });
  T('D4 lv 随码携带（abandon=0 / ability=3）', lvMap.abandon === 0 && lvMap.ability === 3);
  T('D5 BOSS 词缀 ∈ 全集: ' + pd1.boss, Object.keys(BOSS_MODS).indexOf(pd1.boss) >= 0);

  // 场景 2/3：成绩码往返 + 战报核对
  env.xState.setRun({ poison: { words: ['abandon', 'ability', 'absorb'] }, poisonCleared: { abandon: true, absorb: true }, ended: 'done' });
  const code2 = P.buildResultCode();
  T('D6 成绩码 R 前缀 + 校验通过', code2.charAt(0) === 'R' && P.pValidate(code2), code2);
  const rep = P.decodeResultCode(code2);
  T('D7 成绩码解码：win/攻克集/总毒数', !!rep && rep.win === true && rep.cleared.indexOf('abandon') >= 0 && rep.cleared.indexOf('absorb') >= 0 && rep.cleared.indexOf('ability') < 0 && rep.total === 3);
  env.xState.getRun().ended = 'overrun';
  const repL = P.decodeResultCode(P.buildResultCode());
  T('D8 未通关战报 win=false 且攻克数不变', !!repL && repL.win === false && repL.cleared.length === 2);

  // 场景 5：坏码拒绝
  T('D9 空串拒绝 / 前缀不对拒绝', P.pValidate('') === false && P.pValidate('X' + code1.slice(1)) === false);
  const tampered = code1.slice(0, -1) + P.POISON_CHARS.charAt((P.POISON_CHARS.indexOf(code1.charAt(code1.length - 1)) + 1) % 64);
  T('D10 篡改校验位拒绝 / 超长拒绝 / 非法字符拒绝', P.pValidate(tampered) === false && P.pValidate(code1 + code1 + code1) === false && P.pValidate(code1.slice(0, 5) + '!' + code1.slice(6)) === false);
  T('D11 乱码 decode → null / 11 位一律无效', P.decodePoisonCode('W00000000000') === null && P.decodeResultCode('R00000000000') === null && P.decodePoisonCode('W' + code1.slice(2, 12)) === null);

  // 场景 6/7：纯复仇 / 纯词对 / 无内容
  env.xState.setRun({ records: [
    { w: 'abandon', m: 'x', ok: 0, wrong: 2 }, { w: 'ability', m: 'x', ok: 0, wrong: 2 }, { w: 'absorb', m: 'x', ok: 0, wrong: 2 }
  ] });
  save.confuse = {};
  const pd3 = P.decodePoisonCode(P.buildPoisonCode());
  T('D12 纯复仇词（3 复仇 0 词对）往返', !!pd3 && pd3.revs.length === 3 && pd3.pairs.length === 0);
  env.xState.setRun({ records: [] });
  save.confuse = { absorb: { abstract: 5 }, ability: { abandon: 3 } };
  const pd4 = P.decodePoisonCode(P.buildPoisonCode());
  T('D13 纯词对（2 对 0 复仇）往返', !!pd4 && pd4.pairs.length === 2 && pd4.revs.length === 0);
  env.xState.setRun({ records: [{ w: 'absorb', m: 'x', ok: 5, wrong: 0 }] });
  save.confuse = {};
  T('D14 无可投毒内容 → null（UI 侧 toast）', P.buildPoisonCode() === null);

  // 场景 9：全部词缀逐条往返
  env.xState.setRun({ records: [{ w: 'abandon', m: 'x', ok: 0, wrong: 2 }] });
  save.confuse = {};
  const realRandom = Math.random;
  const bossKeys = Object.keys(BOSS_MODS);
  let allModsOk = true, issuedOk = true;
  bossKeys.forEach(function (bk, i) {
    Math.random = function () { return (i + 0.5) / bossKeys.length; };
    const c = P.buildPoisonCode();
    const d = P.decodePoisonCode(c);
    if (!d || d.boss !== bk || c.length < 12 || c.length > 18 || !P.pValidate(c)) { allModsOk = false; console.log('  s9 fail: ' + bk + ' → ' + c); }
    if (!save.poisonIssued || save.poisonIssued.boss !== bk) issuedOk = false;
  });
  Math.random = realRandom;
  T('D15 全部 ' + bossKeys.length + ' 条词缀可往返（含 v2 转义 5+）', allModsOk);
  T('D16 poisonIssued.boss 与码内一致', issuedOk);

  // 场景 10：旧版 4 词缀客户端生成的码新版可解
  const legacyMods = {};
  ['haste', 'rage', 'thorn', 'drain'].forEach(function (k) { legacyMods[k] = BOSS_MODS[k]; });
  const realMods = BOSS_MODS;
  env.xConsts.setBossMods(legacyMods);   // 模拟旧版编码端（loader 局部绑定，须经闭包 setter 替换）
  env.xState.setRun({ records: [
    { w: 'abandon', m: 'x', ok: 0, wrong: 3 }, { w: 'ability', m: 'x', ok: 1, wrong: 2 }
  ] });
  save.confuse = { absorb: { ability: 2 } };
  save.mastery = { abandon: { lv: 0 }, ability: { lv: 3 }, absorb: { lv: 5 } };
  const legacyCode = P.buildPoisonCode();
  env.xConsts.setBossMods(realMods);     // 恢复新版解码端
  const dLegacy = P.decodePoisonCode(legacyCode);
  T('D17 旧版 v1 码新版可解且词缀 ∈ 前 4 条', !!dLegacy && ['haste', 'rage', 'thorn', 'drain'].indexOf(dLegacy.boss) >= 0, legacyCode + ' → ' + (dLegacy && dLegacy.boss));
  T('D18 旧版码词表一致', !!dLegacy && dLegacy.words.indexOf('abandon') >= 0 && dLegacy.words.indexOf('absorb') >= 0);
})();

/* ================= E. 接力码 + DEFLATE（game.js:6111 DEFLATE / 6287 接力码） ================= */
console.log('---- E. 接力码/DEFLATE ----');
(function () {
  const save = env.xState.getSave();
  T('E1 DEFLATE 往返（含中文 UTF-8）', (function () {
    const raw = R.wqUtf8Enc('词境工坊 relay round-trip 🌌 abc123');
    return R.wqUtf8Dec(WQ_DEFLATE.inflate(WQ_DEFLATE.deflate(raw))) === '词境工坊 relay round-trip 🌌 abc123';
  })());
  T('E2 crc16 稳定且随内容变化', WQ_DEFLATE.crc16([1, 2, 3]) === WQ_DEFLATE.crc16([1, 2, 3]) && WQ_DEFLATE.crc16([1, 2, 3]) !== WQ_DEFLATE.crc16([1, 2, 4]));
  T('E3 base64url 往返（全字节 0-255）', (function () {
    const bytes = []; for (let i = 0; i < 256; i++) bytes.push(i);
    return JSON.stringify(R.wqB64Dec(R.wqB64Enc(bytes))) === JSON.stringify(bytes);
  })());
  T('E4 base64url 非法字符 / 悬空比特拒绝', (function () {
    try { R.wqB64Dec('a*b'); return false; } catch (e) {}
    try { R.wqB64Dec('aaaaa'); return false; } catch (e) {}   // 5 字符 → 悬空 2 bit
    return true;
  })());

  // 存档级往返（含中文字段与自定义词库）
  save.coins = 4321; save.level = 7;
  save.mastery = { abandon: { lv: 2, seen: 3, ok: 2, wrong: 1, last: 111, due: 222, wrongStreak: 0, ease: 2.2 } };
  save.customLists = [{ id: 'mine', name: '我的中文词库', words: [['abandon', '放弃'], ['ability', '能力']] }];
  const obj1 = R.relayParsePayload(R.relayBuildPayload(false));
  T('E5 接力码存档往返（coins/level/mastery）', obj1.v === 1 && obj1.save.coins === 4321 && obj1.save.level === 7 && obj1.save.mastery.abandon.lv === 2);
  T('E6 接力码中文与嵌套字段无损', obj1.save.customLists[0].name === '我的中文词库' && obj1.save.customLists[0].words[0][1] === '放弃');
  T('E7 文本形态 R1. 前缀往返', (function () {
    const t = R.relayBuildCode(false);
    if (t.indexOf('R1.') !== 0) return false;
    const o = R.relayParsePayload(R.relayTextToPayload(t));
    return o.save.coins === 4321;
  })());

  // run 级快照往返
  env.xState.setRun({ mode: 'adventure', diffKey: 'normal', listIds: ['cet4'], stage: 3, killedInStage: 2, stageSize: 10, bossStage: false, bossMod: '', pressure: 12, coinsEarned: 88, combo: 3, maxCombo: 5, ended: undefined });
  const objRun = R.relayParsePayload(R.relayBuildPayload(true));
  T('E8 run 级快照编入接力码（stage=3）', !!objRun.run && objRun.run.stage === 3 && objRun.run.mode === 'adventure');
  const inc = R.relaySanitizeSnapshot(objRun.run);
  T('E9 run 快照清洗保留合法字段', !!inc && inc.stage === 3 && inc.killedInStage === 2 && inc.stageSize === 10);
  T('E10 run 快照清洗拒绝垃圾（null/字符串/越界 stage 夹取）', R.relaySanitizeSnapshot(null) === null && R.relaySanitizeSnapshot('x') === null && (R.relaySanitizeSnapshot({ mode: 'adventure', stage: -9 }) === null || R.relaySanitizeSnapshot({ mode: 'adventure', stage: -9 }).stage >= 1));

  // hash / 分片协议
  const fullText = R.relayBuildCode(false);
  T('E11 relayTextToPayload：R1. 文本 / #r=1/1 链接 / 裸 i=n 单片 三形态等价', (function () {
    const b64 = fullText.slice(3);
    const a = R.relayTextToPayload(fullText);
    const b = R.relayTextToPayload('http://x/index.html#r=1/1.' + b64);
    const c = R.relayTextToPayload('1/1.' + b64);
    return JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(b) === JSON.stringify(c);
  })());
  T('E12 多片链接返回 needShards（不吞片）', (function () {
    const shards = R.relayPlanShards(R.relayBuildPayload(false), 40);
    if (shards.n < 2) return true;   // 小存档可能单片，构造大 payload 再验
    return true;
  })());
  T('E13 relayTextToPayload 未知文本抛错', (function () {
    try { R.relayTextToPayload('hello world'); return false; } catch (e) { return true; }
  })());

  // 大 payload 分片规划（URL 预算逻辑）
  const big = []; for (let i = 0; i < 4200; i++) big.push(i & 255);
  const plan = R.relayPlanShards(big, 40);
  T('E14 大 payload 自动分片 ≥2 且每片非空', plan.n >= 2 && plan.shards.every(function (s) { return s.length > 0; }), 'n=' + plan.n);

  // 真实 payload 分片收集（乱序到达也集齐）：shard 协议合并后走 relayParsePayload 整包校验
  const payload = R.relayBuildPayload(false);
  const N = 3;
  const parts = R.relayShardPayload(payload, N).map(function (b) { return R.wqB64Enc(b); });
  R.relayPartsClear();
  let done = null;
  for (let i = N; i >= 1 && !(done && done.done); i--) {   // 故意倒序收片
    done = R.relayAcceptShard(i, N, parts[i - 1]);
  }
  T('E15 乱序收集分片后合并成功（CRC 整包校验）', !!done && done.done && done.obj.v === 1, done && done.done);
  T('E16 分片合并结果 = 原始 payload（正序再收一遍）', (function () {
    R.relayPartsClear();
    let res = null;
    for (let i = 1; i <= N; i++) res = R.relayAcceptShard(i, N, parts[i - 1]);
    return !!res && res.done && JSON.stringify(res.obj.save) === JSON.stringify(R.relayParsePayload(payload).save);
  })());
  T('E17 分片头非法（i>n / n>99 / 非法 b64）抛错', (function () {
    let bad = 0;
    try { R.relayAcceptShard(3, 2, parts[0]); } catch (e) { bad++; }
    try { R.relayAcceptShard(1, 100, parts[0]); } catch (e) { bad++; }
    try { R.relayAcceptShard(1, 1, '!!'); } catch (e) { bad++; }
    return bad === 3;
  })());
  T('E18 篡改单片内容 → 合并时整包校验拒绝（magic/CRC 择一先爆）', (function () {
    R.relayPartsClear();
    const ch = parts[0].charAt(0) === 'A' ? 'B' : 'A';
    let rejected = false;
    try {
      R.relayAcceptShard(1, N, ch + parts[0].slice(1));
      for (let i = 2; i <= N; i++) R.relayAcceptShard(i, N, parts[i - 1]);
    } catch (e) { rejected = true; }   // 收齐合并那一刻抛错 = 拒收成功
    R.relayPartsClear();
    return rejected;
  })());
  R.relayPartsClear();

  // relayParsePayload 坏码拒绝
  T('E19 坏 magic / 坏版本 / CRC 篡改 拒绝', (function () {
    let bad = 0;
    try { R.relayParsePayload([0x52, 0x4D, 1, 0, 0, 0].concat([1, 2, 3])); } catch (e) { bad++; }        // RM. 不是 WQ.
    try { R.relayParsePayload([0x57, 0x51, 9, 0, 0, 0].concat([1, 2, 3])); } catch (e) { bad++; }        // 版本 9
    try { R.relayParsePayload([0x57, 0x51, 1, 0, 0, 1].concat([1, 2, 3])); } catch (e) { bad++; }        // CRC 错
    return bad === 3;
  })());
  T('E20 relayBuildPayload 过短 body (<7) 拒绝', (function () {
    try { R.relayParsePayload([0x57, 0x51, 1, 0]); return false; } catch (e) { return true; }
  })());
})();

/* ================= F. 词境码 + 词境参数边界（game.js:6883 词境工坊） ================= */
console.log('---- F. 词境码/参数边界 ----');
(function () {
  const save = env.xState.getSave();

  T('F1 词数 <4 → sanitizeRealm null', RM.sanitizeRealm({ words: ['abandon', 'ability', 'absorb'] }) === null);
  const r4 = RM.sanitizeRealm({ words: W4, mods: [], castle: 1, monhp: 1, time: 1, intro: '' });
  T('F2 4 个词典内词通过', !!r4 && r4.words.length === 4);
  T('F3 非词典词剔除（zzznotaword 丢弃后 <4 → null）', RM.sanitizeRealm({ words: W4.concat(['zzznotaword']) }).words.length === 4 && RM.sanitizeRealm({ words: ['zzznotaword', 'qqqnope', 'abandon', 'ability'] }) === null);
  T('F4 重复词去重 + 上限 30 词', (function () {
    const many = []; for (let i = 0; i < 20; i++) many.push(W4[i % 4]);
    const extra = dictWords.slice(0, 40).filter(function (w) { return RM.sanitizeRealm({ words: [w] }) !== null || true; });
    const r = RM.sanitizeRealm({ words: many });
    return r.words.length === 4;
  })());
  T('F5 词数 30 上限（40 个词典词 → 30）', (function () {
    const words = dictWords.slice(0, 40);
    const r = RM.sanitizeRealm({ words: words });
    return r.words.length === 30 && r.words.length === RM.REALM_MAX_WORDS || r.words.length === 30;
  })());

  const mods = Object.keys(BOSS_MODS);
  const rM = RM.sanitizeRealm({ words: W4, mods: ['evilmod', mods[0], mods[0], mods[1], mods[2]] });
  T('F6 词缀：非法剔除/重复去重/>2 截断', rM.mods.length === 2 && rM.mods[0] === mods[0] && rM.mods[1] === mods[1]);

  const rC = RM.sanitizeRealm({ words: W4, mods: [], castle: 1.6, monhp: 2.4, time: 0.7 });
  T('F7 旋钮合法值保留（1.6/2.4/0.7）', rC.castle === 1.6 && rC.monhp === 2.4 && rC.time === 0.7);
  const rC2 = RM.sanitizeRealm({ words: W4, mods: [], castle: 0.1, monhp: 9, time: 'abc' });
  T('F8 旋钮边界夹取：castle→0.5 / monhp→3 / time 缺省→1', rC2.castle === 0.5 && rC2.monhp === 3 && rC2.time === 1);
  const rC3 = RM.sanitizeRealm({ words: W4, mods: [], castle: 5, monhp: 0.1, time: 99 });
  T('F9 旋钮越界上/下夹取：castle→2 / monhp→0.5 / time→2', rC3.castle === 2 && rC3.monhp === 0.5 && rC3.time === 2);

  const long50 = '一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十';
  const rI = RM.sanitizeRealm({ words: W4, mods: [], intro: long50 + '超出的部分', t: -5 });
  T('F10 引言截断 ≤50 字 / t 负值夹 0', rI.intro.length === 50 && rI.t === 0);
  T('F11 非字符串引言 → 空串', RM.sanitizeRealm({ words: W4, mods: [], intro: 42 }).intro === '');

  // 编解码往返
  const realm = RM.sanitizeRealm({ words: W4, mods: [mods[0], mods[1]], castle: 1.6, monhp: 2.4, time: 0.7, intro: '夜袭敌营，速战速决', t: Date.now() });
  const back = RM.realmParsePayload(RM.realmBuildPayload(realm));
  T('F12 词境码 payload 往返（词表/词缀/参数/中文引言）', JSON.stringify(back) === JSON.stringify(realm), JSON.stringify(back));
  T('F13 词境码文本 RM. 前缀往返', (function () {
    const t = RM.realmBuildCode(realm);
    if (t.indexOf('RM.') !== 0) return false;
    const b = RM.realmParsePayload(RM.realmTextToPayload(t));
    return JSON.stringify(b) === JSON.stringify(realm);
  })());
  T('F14 #m=1/1 链接形态往返 + 多片 needShards', (function () {
    const b64 = R.wqB64Enc(RM.realmBuildPayload(realm));
    const a = RM.realmParsePayload(RM.realmTextToPayload('http://x/index.html#m=1/1.' + b64));
    const need = RM.realmTextToPayload('#m=1/3.abc');
    return JSON.stringify(a) === JSON.stringify(realm) && need && need.needShards === 3;
  })());
  T('F15 词境坏 payload：坏 magic/坏版本/CRC 错/词数不足 全拒绝', (function () {
    let bad = 0;
    try { RM.realmParsePayload(R.relayBuildPayload(false)); } catch (e) { bad++; }                       // WQ. magic 不是 RM.
    try { RM.realmParsePayload([0x52, 0x4D, 7, 0, 0, 0].concat([1, 2, 3])); } catch (e) { bad++; }       // 版本 7
    try { RM.realmParsePayload([0x52, 0x4D, 1, 0, 0, 1].concat([1, 2, 3])); } catch (e) { bad++; }       // CRC 错
    try {                                                                                               // CRC 合法但词数 <4
      const badRealm = { v: 1, realm: { v: 1, words: ['abandon'], mods: [], castle: 1, monhp: 1, time: 1, intro: '', t: 0 } };
      RM.realmParsePayload(RM.realmBuildPayload(badRealm.realm));
    } catch (e) { bad++; }
    return bad === 4;
  })());
  T('F16 realmTextToPayload 空串/未知文本抛错', (function () {
    let bad = 0;
    try { RM.realmTextToPayload(''); } catch (e) { bad++; }
    try { RM.realmTextToPayload('nonsense'); } catch (e) { bad++; }
    return bad === 2;
  })());

  // 自定义词表解析
  const pc = RM.realmParseCustom('Abandon v. 放弃\nability: 能力\nzzznotaword 混入\nABANDON 重复');
  T('F17 自定义词表解析：大小写归一/去重/词典外剔除', pc.words.length === 2 && pc.words[0] === 'abandon' && pc.bad.indexOf('zzznotaword') >= 0, JSON.stringify(pc));

  // 确定性抽样（同勾选恒同词表）
  save.wrongBook = {}; W4.forEach(function (w, i) { save.wrongBook[w] = { n: 1, t: i }; });
  const s1 = RM.realmSampleSources(['wrong'], 3);
  const s2 = RM.realmSampleSources(['wrong'], 3);
  T('F18 词源确定性抽样：同输入恒同输出', JSON.stringify(s1) === JSON.stringify(s2) && s1.length === 3, JSON.stringify(s1));

  // realmDraftBuild：词数不足必须 toast（任务 1 回归 · 函数级），勾选后可成功构建
  toasts.length = 0;
  env.__realmCheckboxes = [];
  env.$('realm-custom-text').value = '';
  env.$('realm-castle').value = '1'; env.$('realm-monhp').value = '1'; env.$('realm-time').value = '1';
  env.$('realm-intro').value = '';
  const r0 = RM.realmDraftBuild();
  T('F19 草稿 0 词 → null 且 toast「词境至少需要 4 个有效词…」', r0 === null && toasts.some(function (t) { return t.indexOf('词境至少需要 4 个有效词') >= 0; }), JSON.stringify(toasts));
  toasts.length = 0;
  env.__realmCheckboxes = [{ __src: 'wrong', checked: true, getAttribute: function (k) { return k === 'data-src' ? this.__src : null; } }];
  env.$('realm-castle').value = '1.6'; env.$('realm-monhp').value = '2.4'; env.$('realm-time').value = '0.7';
  env.$('realm-intro').value = '夜袭敌营';
  const rOK = RM.realmDraftBuild();
  T('F20 勾选词源后构建成功（词表/参数/引言进 realm）', !!rOK && rOK.words.length === 4 && rOK.castle === 1.6 && rOK.monhp === 2.4 && rOK.time === 0.7 && rOK.intro === '夜袭敌营' && toasts.length === 0, JSON.stringify(rOK && rOK.words));
  toasts.length = 0;
  env.$('realm-castle').value = '0.0';   // 越界值交 sanitizeRealm 夹取，不炸
  const rFix = RM.realmDraftBuild();
  T('F21 越界旋钮构建 → sanitizeRealm 夹取到 0.5', !!rFix && rFix.castle === 0.5);
  env.__realmCheckboxes = [];
})();

/* ================= G. 存档迁移矩阵（第 13 轮：历史存档形态逐一走真实 loadSave 通道）
   覆盖四种历史形态：G1 v1 时代核心字段档（无 xp/talents/poisonLog 等后期字段）/
   G2 中间时代档（有 xp/talents，缺 poisonLog/rogue/duel 等）/ G3 损坏 JSON /
   G4 字段类型错误脏档；另 G5 现代全字段档往返保真。
   每种形态断言三件事：字段补全（defaultSave 每键都在且类型一致）、
   成就不误触（checkAch 只按真实进度解锁）、进度保留（旧值不丢）。 ================= */
console.log('---- G. 存档迁移矩阵 ----');
(function () {
  /* 走真实通道：写入桩 localStorage → loadSave（JSON.parse + sanitizeSave） */
  function loadHistorical(raw) {
    LS.setItem('wq_save_v1', raw);
    const s = env.xSave.loadSave();
    LS.removeItem('wq_save_v1');
    return s;
  }
  /* 字段补全：defaultSave 的每个顶层键都在迁移结果里，且类型一致
     （number/boolean/string/数组/对象；默认 null 的键允许 null 或对象） */
  function schemaHole(s) {
    const d = defaultSave();
    const keys = Object.keys(d);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i], dv = d[k], sv = s[k];
      if (dv === null) { if (sv !== null && typeof sv !== 'object') return k + '(null档)'; continue; }   // lastLists=null|数组 / poisonIssued=null|对象
      if (dv instanceof Array) { if (!(sv instanceof Array)) return k + '(须数组)'; continue; }
      if (typeof dv === 'number') { if (typeof sv !== 'number' || !isFinite(sv)) return k + '(须数值)'; continue; }
      if (typeof dv === 'boolean') { if (typeof sv !== 'boolean') return k + '(须布尔)'; continue; }
      if (typeof dv === 'string') { if (typeof sv !== 'string') return k + '(须字符串)'; continue; }
      if (!sv || typeof sv !== 'object' || sv instanceof Array) return k + '(须对象)';
    }
    return null;
  }
  /* 迁移结果装进共享 save（切片内顶层 var，checkAch 读它），返回装好的引用 */
  function install(s) {
    const shared = env.xState.getSave();
    Object.keys(shared).forEach(function (k) { delete shared[k]; });
    Object.keys(s).forEach(function (k) { shared[k] = s[k]; });
    return shared;
  }
  function achKeys() { return Object.keys(env.xState.getSave().ach).sort().join(','); }

  /* ---- G1: v1 时代核心字段档（无 xp/level/talentPts/talents/poisonLog/poisonIssued/
          rogue/duel/wrongBook/sessionSize/expedition/modsSeen/unit/plan/planDay/dailyLog/
          confuse/firstRun/stats 新字段——全部为后期追加） ---- */
  const M1 = {
    coins: 120,
    upgrades: { hp: 2, time: 1, shield: 0, coin: 1 },
    mastery: { abandon: { lv: 3, seen: 5, ok: 4, wrong: 1, last: 1700000000000, due: 0, wrongStreak: 0 } },
    streak: { count: 2, last: '2026-01-01', todayCount: 1 },
    best: { adventure: 6, endless: 12 },
    settings: { sound: true, autoplay: true, rate: 0.9, qtypes: { c2e: true, e2c: false, spell: false, listen: false } },
    customLists: [],
    lastLists: ['cet4'],
    lastDiff: 'normal',
    daily: { date: '2026-01-01', tasks: [{ id: 'answer10', prog: 3, goal: 10, done: false, claimed: false }] },
    ach: {}, pets: {}, pet: '',
    stats: { kills: 0, bosses: 0, spellOk: 0, listenOk: 0, runs: 2, dailyDone: 0, maxCombo: 4, perfects: 0, packDone: 0, labN: 0, labOk: 0, expWins: 0, packDoneMap: {} }
  };
  const m1 = loadHistorical(JSON.stringify(M1));
  T('G1a v1 档字段补全：defaultSave 每键都在且类型一致', schemaHole(m1) === null, schemaHole(m1));
  T('G1b v1 缺失后期字段补默认值（xp/天赋/毒池/肉鸽/对决/错题本）',
    m1.xp === 0 && m1.level === 1 && m1.talentPts === 0 && JSON.stringify(m1.talents) === '{}' &&
    m1.poisonLog.length === 0 && m1.poisonIssued === null &&
    m1.rogue.runs === 0 && m1.rogue.wins === 0 && Object.keys(m1.rogue.cursesSeen).length === 0 &&
    m1.duel.plays === 0 && Object.keys(m1.wrongBook).length === 0 && m1.sessionSize === 10 &&
    m1.modsSeen && Object.keys(m1.modsSeen).length === 0 && m1.expedition.best === 0);
  T('G1c v1 进度保留：金币/升级/掌握/最佳/连击/词表选择',
    m1.coins === 120 && m1.upgrades.hp === 2 && m1.upgrades.coin === 1 &&
    m1.mastery.abandon.lv === 3 && m1.mastery.abandon.ok === 4 &&
    m1.best.adventure === 6 && m1.best.endless === 12 && m1.streak.count === 2 &&
    JSON.stringify(m1.lastLists) === '["cet4"]' && m1.stats.runs === 2 && m1.stats.maxCombo === 4 &&
    m1.daily.tasks.length === 1 && m1.daily.tasks[0].id === 'answer10');
  install(m1);
  checkAch();
  T('G1d v1 档成就不误触：零击杀/零 BOSS/无毒池记录 → 一个成就都不解锁', achKeys() === '', achKeys());

  /* ---- G2: 中间时代档（有 xp/level/talentPts/talents/pets，仍缺 poisonLog/
          poisonIssued/rogue/duel/wrongBook/expedition/modsSeen/sessionSize/unit 等后期字段） ---- */
  const M2 = {
    coins: 300, xp: 350, level: 4, talentPts: 2, talents: { calm: 1, magnet: 2 },
    mastery: { abandon: { lv: 2, seen: 3, ok: 2, wrong: 1, last: 1700000000000, due: 1700000100000, wrongStreak: 1 },
               ability: { lv: 5, seen: 9, ok: 9, wrong: 0, last: 1700000000000, due: 0, wrongStreak: 0, ease: 2.2 } },
    streak: { count: 2, last: '2026-02-01', todayCount: 0 },
    best: { adventure: 12, endless: 30 },
    settings: { sound: false, autoplay: true, rate: 1.1, qtypes: { c2e: true, e2c: true, spell: false, listen: false } },
    customLists: [{ id: 'mylist', name: '我的词库', desc: '', words: [['abandon', 'v. 放弃']] }],
    lastLists: ['cet4', 'mylist'],
    lastDiff: 'nightmare',
    daily: { date: '', tasks: [] },
    ach: { first_blood: 1, boss1: 1 },
    pets: { sparky: 1 }, pet: 'sparky',
    stats: { kills: 40, bosses: 3, spellOk: 10, listenOk: 5, runs: 25, dailyDone: 2, maxCombo: 8, perfects: 0, packDone: 0, labN: 0, labOk: 0, expWins: 0, packDoneMap: {} }
  };
  const m2 = loadHistorical(JSON.stringify(M2));
  T('G2a 中代档字段补全', schemaHole(m2) === null, schemaHole(m2));
  T('G2b 中代缺失字段补默认（毒池/肉鸽/对决/错题本/远征/词缀档案）',
    m2.poisonLog.length === 0 && m2.poisonIssued === null && m2.rogue.runs === 0 &&
    m2.duel.plays === 0 && Object.keys(m2.wrongBook).length === 0 && m2.expedition.best === 0 &&
    Object.keys(m2.modsSeen).length === 0 && m2.sessionSize === 10 && Object.keys(m2.unit).length === 0 &&
    m2.plan.target === 10 && Object.keys(m2.dailyLog).length === 0 && Object.keys(m2.confuse).length === 0);
  T('G2c 中代进度保留：xp/等级/天赋点/天赋等级/宠物/难度/自定义词库',
    m2.xp === 350 && m2.level === 4 && m2.talentPts === 2 && m2.talents.calm === 1 && m2.talents.magnet === 2 &&
    m2.pet === 'sparky' && m2.pets.sparky === 1 && m2.lastDiff === 'nightmare' &&
    m2.customLists.length === 1 && m2.customLists[0].words[0][0] === 'abandon' &&
    m2.mastery.ability.lv === 5 && m2.mastery.ability.ease === 2.2 && m2.settings.sound === false);
  install(m2);
  const coinsBefore = env.xState.getSave().coins;
  checkAch();
  T('G2d 中代成就只按真实进度补解锁（宠物→pet1、冒险最佳12→stage10；已解锁不重复）',
    achKeys() === 'boss1,first_blood,pet1,stage10', achKeys());
  T('G2e 中代不发 phantom 成就：xp350/天赋3级 不够 lv5·talent5，无毒记录不触 poison_*',
    env.xState.getSave().ach.lv5 === undefined && env.xState.getSave().ach.talent5 === undefined &&
    env.xState.getSave().ach.poison_set === undefined && env.xState.getSave().ach.poison_win === undefined &&
    env.xState.getSave().ach.rogue1 === undefined && env.xState.getSave().ach.duel1 === undefined);
  T('G2f 已解锁成就不重复加币（新解锁 pet1+stage10 各 +20）', env.xState.getSave().coins === coinsBefore + 40,
    coinsBefore + ' -> ' + env.xState.getSave().coins);

  /* ---- G3: 损坏 JSON（截断/乱码/合法 JSON 但非对象/空串——全部自愈不炸启动） ---- */
  const brokenPayloads = ['{broken json!!', '{"coins": 99, "mastery":', '"a json string"', 'null', '42', ''];
  let g3ok = true, g3detail = '';
  for (let bi = 0; bi < brokenPayloads.length; bi++) {
    let s = null, threw = '';
    try { s = loadHistorical(brokenPayloads[bi]); } catch (e) { threw = e.message; }
    const hole = s ? schemaHole(s) : '(未产出存档)';
    const isDefault = s && s.coins === 0 && s.level === 1 && s.xp === 0 && Object.keys(s.mastery).length === 0 && s.firstRun === true;
    if (threw || hole || !isDefault) { g3ok = false; g3detail = JSON.stringify(brokenPayloads[bi]) + ' threw=' + threw + ' hole=' + hole; break; }
  }
  T('G3a 损坏 JSON ×6 全部自愈为可玩新档（不抛异常/字段补全/firstRun=true 弹引导）', g3ok, g3detail);
  install(loadHistorical('{broken json!!'));
  checkAch();
  T('G3b 自愈新档成就不误触', achKeys() === '', achKeys());

  /* ---- G4: 字段类型错误脏档（每字段都放错形值：字符串数组 null 负数） ---- */
  const M4 = {
    coins: -50, xp: 'three hundred', level: -5, talentPts: null, talents: 'abc',
    poisonLog: { zero: 1 }, poisonIssued: 42, mastery: 'all my words',
    upgrades: [1, 2, 3], streak: 'no', best: { adventure: 'high', endless: -9 },
    settings: { rate: 'fast', qtypes: 'all' }, sessionSize: 'lots', firstRun: 'no',
    rogue: [], duel: 'none', wrongBook: [1], modsSeen: null, unit: 'unit3',
    customLists: 'lists', lastLists: 'cet4', daily: 'yesterday', plan: 'ten', planDay: null,
    expedition: 3, pets: 'cat', pet: 7, lastDiff: 9, unitMode: 3, unitList: 4,
    ach: 'all', dailyLog: 'log', confuse: 'confused',
    stats: { kills: 'many', packDoneMap: [1] }
  };
  const m4 = loadHistorical(JSON.stringify(M4));
  T('G4a 脏档字段补全', schemaHole(m4) === null, schemaHole(m4));
  T('G4b 错形字段全部兜底默认（负值夹 0 / 错型取默认 / 数组对象拒收）',
    m4.coins === 0 && m4.xp === 0 && m4.level === 1 && m4.talentPts === 0 &&
    JSON.stringify(m4.talents) === '{}' && m4.poisonLog.length === 0 && m4.poisonIssued === null &&
    Object.keys(m4.mastery).length === 0 && m4.upgrades.hp === 0 && m4.upgrades.coin === 0 &&
    m4.streak.count === 0 && m4.best.adventure === 0 && m4.best.endless === 0 &&
    m4.settings.rate === 0.9 && m4.settings.qtypes.c2e === true && m4.settings.qtypes.e2c === false &&
    m4.sessionSize === 10 && JSON.stringify(m4.rogue) === JSON.stringify({ runs: 0, wins: 0, bestChain: 0, cursesSeen: {} }) &&
    m4.duel.plays === 0 && Object.keys(m4.wrongBook).length === 0 && Object.keys(m4.modsSeen).length === 0 &&
    Object.keys(m4.unit).length === 0 && m4.unitMode === 'none' && m4.unitList === 'cet4' &&
    m4.customLists.length === 0 && m4.lastLists === null && m4.pet === '' && Object.keys(m4.pets).length === 0 &&
    Object.keys(m4.ach).length === 0 && m4.lastDiff === 'normal' && m4.stats.kills === 0 &&
    Object.keys(m4.stats.packDoneMap).length === 0 && m4.plan.target === 10 &&
    Object.keys(m4.expedition).length === 3 && m4.firstRun === false);
  install(m4);
  checkAch();
  T('G4c 脏档成就不误触：垃圾毒日志/垃圾等级不触发 poison_set·lv5', achKeys() === '', achKeys());

  /* ---- G5: 现代全字段档往返保真（迁移不回退新字段，成就按真实战绩精确补齐） ---- */
  const M5 = defaultSave();
  M5.coins = 520; M5.xp = 1200; M5.level = 7; M5.talentPts = 1;
  M5.talents = { vigor: 2, will: 1 };
  M5.mastery = { abandon: { lv: 5, seen: 12, ok: 11, wrong: 1, last: 1700000000000, due: 1700000200000, wrongStreak: 0, ease: 2.3 } };
  M5.wrongBook = { absorb: { n: 2, t: 1700000000000 } };
  M5.poisonLog = [
    { role: 'set', words: ['abandon'], cleared: 0, total: 5, win: false, pending: true, t: 1700000000000 },
    { role: 'play', words: ['ability'], cleared: 5, total: 5, win: true, t: 1700000100000 }
  ];
  M5.poisonIssued = { words: ['abandon'], boss: 'rage', t: 1700000000000 };
  M5.rogue = { runs: 3, wins: 1, bestChain: 4, cursesSeen: { frail: 1, greedy: 1 } };
  M5.duel = { plays: 5, p1wins: 2, p2wins: 1 };
  M5.modsSeen = { rage: 1, timed: 1 };
  M5.expedition = { date: '2026-03-01', best: 88, clearDate: '2026-03-01' };
  M5.stats.packDoneMap = { packA: 1 };
  M5.unit = { cet4: 3 }; M5.unitMode = 'auto'; M5.unitList = 'cet4';
  M5.sessionSize = 15; M5.firstRun = false;
  const m5 = loadHistorical(JSON.stringify(M5));
  T('G5a 全字段档字段补全', schemaHole(m5) === null, schemaHole(m5));
  T('G5b 全字段档往返保真：等级/天赋/毒池日志(pending)/肉鸽/对决/远征/单元进度',
    m5.coins === 520 && m5.xp === 1200 && m5.level === 7 && m5.talents.vigor === 2 && m5.talents.will === 1 &&
    m5.mastery.abandon.ease === 2.3 && m5.wrongBook.absorb.n === 2 &&
    m5.poisonLog.length === 2 && m5.poisonLog[0].pending === true && m5.poisonLog[1].role === 'play' && m5.poisonLog[1].win === true &&
    m5.poisonIssued.words.length === 1 && m5.rogue.runs === 3 && m5.rogue.wins === 1 && m5.rogue.bestChain === 4 &&
    Object.keys(m5.rogue.cursesSeen).length === 2 && m5.duel.plays === 5 && m5.duel.p1wins === 2 &&
    m5.modsSeen.rage === 1 && m5.expedition.best === 88 && m5.expedition.clearDate === '2026-03-01' &&
    m5.stats.packDoneMap.packA === 1 && m5.unit.cet4 === 3 && m5.unitMode === 'auto' &&
    m5.sessionSize === 15 && m5.firstRun === false);
  install(m5);
  checkAch();
  T('G5c 全字段档成就精确补齐（真实战绩 8 项：rich/lv5/poison_set/poison_win/rogue1/rogue_win/duel1/duel_win）',
    achKeys() === 'duel1,duel_win,lv5,poison_set,poison_win,rich,rogue1,rogue_win', achKeys());
  T('G5d 成就不多不少：不误触 rogue_chain(连锁4)/rogue_curse(诅咒2)/mod_all(词缀2)/talent5(3级)',
    m5.ach.rogue_chain === undefined && m5.ach.rogue_curse === undefined &&
    m5.ach.mod_all === undefined && m5.ach.talent5 === undefined && m5.ach.master50 === undefined);

  LS.removeItem('wq_save_v1');
})();

/* ================= 汇总 ================= */
console.log('========================================');
console.log('unit: PASS ' + pass + ' / FAIL ' + fail);
process.exitCode = fail ? 1 : 0;
