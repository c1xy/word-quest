/* ============================================================
   单词大冒险 · 游戏逻辑
   依赖：words.js（WORD_LISTS / ALL_WORDS / MEANING_OF）
   ============================================================ */
'use strict';

/* ========================= 小工具 ========================= */
function $(id) { return document.getElementById(id); }
function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* ========================= 存档 ========================= */
var SAVE_KEY = 'wq_save_v1';

function defaultSave() {
  return {
    coins: 0,
    upgrades: { hp: 0, time: 0, shield: 0, coin: 0 },
    mastery: {},            // word -> {lv, seen, ok, wrong, last, due, wrongStreak}
    streak: { count: 0, last: '', todayCount: 0 },
    best: { adventure: 0, endless: 0 },
    settings: {
      sound: true, autoplay: true, bgm: false, rate: 0.9,
      qtypes: { c2e: true, e2c: false, spell: false, listen: false }
    },
    customLists: [],
    lastLists: null,
    lastDiff: 'normal',
    daily: { date: '', tasks: [] },
    ach: {},
    pets: {},
    pet: '',
    stats: { kills: 0, bosses: 0, spellOk: 0, listenOk: 0, runs: 0, dailyDone: 0, maxCombo: 0, perfects: 0, packDone: 0,
      labN: 0, labOk: 0, expWins: 0, packDoneMap: {} },   /* 词根实验室 / 每日远征 / 各主题包完成档案 */
    expedition: { date: '', best: 0, clearDate: '' },   /* 每日远征：当日最高分与首通日期 */
    modsSeen: {},         /* 已遭遇过的 BOSS 词缀档案（成就「词缀图鉴」） */
    plan: { target: 10 },
    planDay: { date: '', done: 0, total: 0, complete: false },
    dailyLog: {},
    confuse: {},
    xp: 0,               // 玩家经验（答题/击杀/通关获得）
    level: 1,            // 玩家等级
    talentPts: 0,        // 可用天赋点（每次升级 +1）
    talents: {},         // talentId -> 等级（0 起未解锁）
    unit: {},            // listId -> 当前单元索引（0 起）
    unitMode: 'none',    // none | auto | 单元号(1起)
    unitList: 'cet4',
    wrongBook: {},       // word -> { n: 答错次数, t: 最近答错时间 }
    sessionSize: 10,     // 本局词量（每关怪物数 / 复习总题数）
    poisonLog: [],       // 投毒战绩（谁毒倒了谁）：{ role:'set'|'play', words, cleared, total, win, pending?, t }
    poisonIssued: null,  // 最近一次发出的挑战码内容，用于核对回贴的成绩码
    rogue: { runs: 0, wins: 0, bestChain: 0, cursesSeen: {} },  // 词魂肉鸽档案（出征/加冕/最高连锁/遭遇过的诅咒）
    duel: { plays: 0, p1wins: 0, p2wins: 0 }                    // 双人对决战绩（红队/蓝队胜负）
  };
}

function loadSave() {
  try {
    var raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    return sanitizeSave(JSON.parse(raw));
  } catch (e) { return defaultSave(); }
}

/* ---------- 存档语义清洗 ----------
   JSON.parse 的 try/catch 只挡语法错；「导入存档」或旧版本落盘的语义脏数据
   （mastery 变字符串、xp 巨数、lv 负数等）会在启动后的随机位置引爆：
   严格模式下 getM 给字符串属性赋值抛 TypeError（答一题死一题）、addXp 近似死循环
   冻结主线程、结算 '★'.repeat(-1) 抛 RangeError。这里按白名单逐字段校验类型与
   范围（数值夹取、对象/数组类型检查），脏条目就地修正或丢弃，保证 loadSave 产出
   的存档恒定可玩——坏档降级重置字段而不是白屏/死锁。 */
function numOr(v, dflt, min, max) {
  var n = (typeof v === 'number' && isFinite(v)) ? v : (typeof v === 'string' && v !== '' && isFinite(+v) ? +v : NaN);
  if (isNaN(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}
function intOr(v, dflt, min, max) { return Math.round(numOr(v, dflt, min, max)); }
function objOr(v) { return (v && typeof v === 'object' && !(v instanceof Array)) ? v : null; }
function arrOr(v) { return (v && v instanceof Array) ? v : null; }
function ownKey(o, k) { return Object.prototype.hasOwnProperty.call(o, k) && k !== '__proto__'; }

function sanitizeSave(src) {
  var s = objOr(src);
  var d = defaultSave();
  if (!s) return d;
  var i, k;
  /* 标量：数值夹取 */
  d.coins = intOr(s.coins, 0, 0, 99999999);
  d.xp = intOr(s.xp, 0, 0, 999999);
  d.level = intOr(s.level, 1, 1, 999);
  d.talentPts = intOr(s.talentPts, 0, 0, 999);
  d.sessionSize = intOr(s.sessionSize, 10, 1, 100);
  if (typeof s.lastDiff === 'string') d.lastDiff = s.lastDiff;   /* startRun 侧有 DIFFS[diffKey]||normal 兜底 */
  if (typeof s.pet === 'string') d.pet = s.pet;
  if (typeof s.unitMode === 'string') d.unitMode = s.unitMode;
  if (typeof s.unitList === 'string') d.unitList = s.unitList;
  if (objOr(s.poisonIssued)) {
    var pi = objOr(s.poisonIssued);
    d.poisonIssued = {
      words: (arrOr(pi.words) || []).filter(function (w) { return typeof w === 'string'; }).slice(0, 30),
      boss: typeof pi.boss === 'string' ? pi.boss : '',
      t: intOr(pi.t, 0, 0, 8.64e15)
    };
  } else if (typeof s.poisonIssued === 'string') d.poisonIssued = s.poisonIssued;
  else d.poisonIssued = null;
  d.lastLists = arrOr(s.lastLists) ? s.lastLists.filter(function (x) { return typeof x === 'string'; }) : null;

  var up = objOr(s.upgrades);
  if (up) ['hp', 'time', 'shield', 'coin'].forEach(function (key) { d.upgrades[key] = intOr(up[key], 0, 0, 50); });

  var st = objOr(s.streak);
  if (st) {
    d.streak.count = intOr(st.count, 0, 0, 99999);
    d.streak.todayCount = intOr(st.todayCount, 0, 0, 99999);
    if (typeof st.last === 'string') d.streak.last = st.last;
  }

  var bst = objOr(s.best);
  if (bst) {
    d.best.adventure = intOr(bst.adventure, 0, 0, 9999);
    d.best.endless = intOr(bst.endless, 0, 0, 999999);
  }

  /* settings：保留全部原始布尔/数值/字符串字段（含一次性迁移标记，避免迁移重跑
     把用户自开的题型再关掉），qtypes 逐项校验布尔 */
  var se = objOr(s.settings);
  if (se) {
    for (k in se) {
      if (!ownKey(se, k) || k === 'qtypes') continue;
      var sv = se[k];
      if (typeof sv === 'boolean' || typeof sv === 'number' || typeof sv === 'string') d.settings[k] = sv;
    }
    var qt = objOr(se.qtypes);
    if (qt) for (k in qt) if (ownKey(qt, k) && typeof qt[k] === 'boolean') d.settings.qtypes[k] = qt[k];
    d.settings.rate = numOr(d.settings.rate, 0.9, 0.5, 2);
  }

  /* mastery：词条必须为对象（脏字符串条目丢弃），lv 夹取 0-5——负/巨值曾令
     '★'.repeat 与 IV_MIN[lv] 引爆 */
  var ma = objOr(s.mastery);
  if (ma) for (k in ma) {
    if (!ownKey(ma, k)) continue;
    var m = objOr(ma[k]);
    if (!m) continue;
    d.mastery[k] = {
      lv: intOr(m.lv, 0, 0, 5),
      seen: intOr(m.seen, 0, 0, 1e9),
      ok: intOr(m.ok, 0, 0, 1e9),
      wrong: intOr(m.wrong, 0, 0, 1e9),
      last: intOr(m.last, 0, 0, 8.64e15),
      due: intOr(m.due, 0, 0, 8.64e15),
      wrongStreak: intOr(m.wrongStreak, 0, 0, 999),
      ease: numOr(m.ease, 2.0, 1.2, 2.8)
    };
  }

  /* customLists：逐条校验 {id,name,words:[词,释义]对}，设总量上限防 stringify 风暴 */
  var cl = arrOr(s.customLists);
  if (cl) {
    var total = 0, CL_TOTAL_MAX = 30000, PER_LIST_MAX = 3000;
    for (i = 0; i < cl.length && total < CL_TOTAL_MAX; i++) {
      var lo = objOr(cl[i]);
      if (!lo || typeof lo.id !== 'string' || !lo.id) continue;
      var ws = arrOr(lo.words);
      if (!ws) continue;
      var pairs = [];
      for (var ci = 0; ci < ws.length && pairs.length < PER_LIST_MAX && total < CL_TOTAL_MAX; ci++) {
        var p = arrOr(ws[ci]);
        if (p && p.length >= 2 && typeof p[0] === 'string' && typeof p[1] === 'string') { pairs.push([p[0], p[1]]); total++; }
      }
      if (pairs.length) d.customLists.push({
        id: lo.id,
        name: typeof lo.name === 'string' ? lo.name : '自定义词库',
        desc: typeof lo.desc === 'string' ? lo.desc : '自定义词库',
        words: pairs
      });
    }
  }

  /* 字典段：只收 own 原始值，挡 __proto__ 原型污染与错形条目 */
  var achS = objOr(s.ach);
  if (achS) for (k in achS) if (ownKey(achS, k) && achS[k]) d.ach[k] = 1;
  var petsS = objOr(s.pets);
  if (petsS) for (k in petsS) if (ownKey(petsS, k) && petsS[k]) d.pets[k] = 1;
  var modsS = objOr(s.modsSeen);
  if (modsS) for (k in modsS) if (ownKey(modsS, k)) d.modsSeen[k] = modsS[k] === 1 ? 1 : objOr(modsS[k]) || 1;
  var unitS = objOr(s.unit);
  if (unitS) for (k in unitS) if (ownKey(unitS, k)) d.unit[k] = intOr(unitS[k], 0, 0, 9999);
  var talS = objOr(s.talents);
  if (talS) for (k in talS) if (ownKey(talS, k)) d.talents[k] = intOr(talS[k], 0, 0, 99);
  var wbS = objOr(s.wrongBook);
  if (wbS) for (k in wbS) {
    if (!ownKey(wbS, k)) continue;
    var wb = objOr(wbS[k]);
    if (wb) d.wrongBook[k] = { n: intOr(wb.n, 1, 0, 1e9), t: intOr(wb.t, 0, 0, 8.64e15) };
  }
  var cfS = objOr(s.confuse);
  if (cfS) for (k in cfS) {
    if (!ownKey(cfS, k)) continue;
    var cf = objOr(cfS[k]);
    if (!cf) continue;
    var cfRow = {};
    for (var ck in cf) if (ownKey(cf, ck)) cfRow[ck] = intOr(cf[ck], 1, 0, 1e9);
    d.confuse[k] = cfRow;
  }
  var dlS = objOr(s.dailyLog);
  if (dlS) for (k in dlS) {
    if (!ownKey(dlS, k)) continue;
    var lg = objOr(dlS[k]);
    if (lg) d.dailyLog[k] = { a: intOr(lg.a, 0, 0, 1e9), c: intOr(lg.c, 0, 0, 1e9) };
  }

  var stt = objOr(s.stats);
  if (stt) for (k in stt) {
    if (!ownKey(stt, k)) continue;
    if (k === 'packDoneMap') {
      var pm = objOr(stt[k]);
      if (pm) for (var pk in pm) if (ownKey(pm, pk) && pm[pk]) d.stats.packDoneMap[pk] = 1;
    } else if (typeof stt[k] === 'number' && isFinite(stt[k])) d.stats[k] = Math.max(0, Math.min(1e15, stt[k]));
  }

  var exS = objOr(s.expedition);
  if (exS) d.expedition = {
    date: typeof exS.date === 'string' ? exS.date : '',
    best: intOr(exS.best, 0, 0, 1e9),
    clearDate: typeof exS.clearDate === 'string' ? exS.clearDate : ''
  };

  var plS = objOr(s.plan);
  if (plS) d.plan.target = intOr(plS.target, 10, 1, 100);
  var pdS = objOr(s.planDay);
  if (pdS) d.planDay = {
    date: typeof pdS.date === 'string' ? pdS.date : '',
    done: intOr(pdS.done, 0, 0, 1e9),
    total: intOr(pdS.total, 0, 0, 1e9),
    complete: pdS.complete === true
  };
  var dyS = objOr(s.daily);
  if (dyS) {
    d.daily.date = typeof dyS.date === 'string' ? dyS.date : '';
    var tks = arrOr(dyS.tasks);
    if (tks) d.daily.tasks = tks.filter(function (t) { return !!objOr(t) && typeof objOr(t).id === 'string'; })
      .map(function (t) { var o = objOr(t); return { id: o.id, prog: intOr(o.prog, 0, 0, 1e9), goal: intOr(o.goal, 1, 0, 1e9), done: o.done === true, claimed: o.claimed === true }; });
  }
  var pgl = arrOr(s.poisonLog);
  if (pgl) d.poisonLog = pgl.filter(function (e) { return !!objOr(e); }).slice(0, 20).map(function (e) {
    var o = objOr(e);
    return {
      role: o.role === 'set' ? 'set' : 'play',
      words: (arrOr(o.words) || []).filter(function (w) { return typeof w === 'string'; }).slice(0, 30),
      cleared: intOr(o.cleared, 0, 0, 1e9),
      total: intOr(o.total, 0, 0, 99),
      win: o.win === true,
      pending: o.pending === true,   /* 发码即记账的骨架标记：丢了会把「待回贴」误显示成毒计成功 */
      t: intOr(o.t, 0, 0, 8.64e15)
    };
  });
  /* 词魂肉鸽 / 双人对决档案（新增模式，旧档缺字段自动取默认） */
  var rgS = objOr(s.rogue);
  if (rgS) {
    d.rogue = {
      runs: intOr(rgS.runs, 0, 0, 1e9),
      wins: intOr(rgS.wins, 0, 0, 1e9),
      bestChain: intOr(rgS.bestChain, 0, 0, 1e9),
      cursesSeen: {}
    };
    var csS = objOr(rgS.cursesSeen);
    if (csS) for (k in csS) if (ownKey(csS, k)) d.rogue.cursesSeen[k] = 1;
  }
  var duS = objOr(s.duel);
  if (duS) d.duel = {
    plays: intOr(duS.plays, 0, 0, 1e9),
    p1wins: intOr(duS.p1wins, 0, 0, 1e9),
    p2wins: intOr(duS.p2wins, 0, 0, 1e9)
  };
  return d;
}

var persistTimer = null;   /* 先于 save 初始化声明：启动迁移里的 persist() 不与其竞争 */
var save = loadSave();
/* 一次性迁移：默认只保留选择题（可在设置里重新开启拼写题） */
if (!save.settings.choiceOnlyMigrated) {
  save.settings.qtypes.spell = false;
  save.settings.choiceOnlyMigrated = true;
  persist();
}
/* 一次性迁移：默认只保留"看中文释义选英文单词"一种题型 */
if (!save.settings.c2eOnlyMigrated) {
  save.settings.qtypes.c2e = true;
  save.settings.qtypes.e2c = false;
  save.settings.qtypes.listen = false;
  save.settings.qtypes.spell = false;
  save.settings.c2eOnlyMigrated = true;
  persist();
}
/* 一次性迁移：默认关闭背景音乐（可在设置里重新开启） */
if (!save.settings.bgmOffMigrated) {
  save.settings.bgm = false;
  save.settings.bgmOffMigrated = true;
  persist();
}
/* persist 全量序列化：每题会触发 2-4 次（resolve/killMonster/endRun…），大词库自定义
   词表会让 stringify 变成每题数百毫秒的主线程停顿。200ms 防抖合并同批写入；
   防抖期间页面被切走/关闭则立即落盘（visibilitychange/pagehide），丢档窗口为零。
   需要「写盘必须先于下一步」的场合（清档/导入前）用 persistCancel 撤销挂起写入。 */
function persistNow() {
  persistTimer = null;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
}
function persist() {
  if (persistTimer) return;
  persistTimer = setTimeout(persistNow, 200);
}
function persistCancel() { if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; } }
function persistFlush() { if (persistTimer) { clearTimeout(persistTimer); persistNow(); } }
document.addEventListener('visibilitychange', function () { if (document.hidden) persistFlush(); });
window.addEventListener('pagehide', persistFlush);

/* ========================= 音效（WebAudio 合成，无需素材） ========================= */
var Sfx = {
  ctx: null,
  ensure: function () {
    if (!save.settings.sound) return null;
    try {
      if (!this.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    } catch (e) { return null; }
  },
  tone: function (f, dur, type, delay, vol) {
    var c = this.ensure(); if (!c) return;
    try {
      var o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.value = f;
      var t = c.currentTime + (delay || 0);
      g.gain.setValueAtTime(vol || 0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  },
  correct: function (combo) {
    var s = Math.pow(2, Math.min(combo || 0, 12) / 12);   // 连击越高音调越高
    this.tone(523 * s, .1); this.tone(659 * s, .1, 'sine', .08); this.tone(784 * s, .18, 'sine', .16);
  },
  wrong:   function () { this.tone(220, .22, 'sawtooth', 0, .07); this.tone(150, .3, 'sawtooth', .1, .07); },
  kill:    function () { this.tone(392, .09); this.tone(523, .09, 'triangle', .07); this.tone(659, .09, 'triangle', .14); this.tone(880, .22, 'triangle', .21); },
  hurt:    function () { this.tone(180, .18, 'square', 0, .06); this.tone(110, .25, 'square', .1, .06); },
  coin:    function () { this.tone(1318, .08, 'square', 0, .04); },
  boss:    function () { this.tone(110, .4, 'sawtooth', 0, .09); this.tone(98, .5, 'sawtooth', .28, .09); },
  levelup: function () { this.tone(523, .1); this.tone(587, .1, 'triangle', .09); this.tone(659, .1, 'triangle', .18); this.tone(880, .28, 'triangle', .27); }
};

/* ========================= 背景音乐（WebAudio 程序合成 8-bit 循环） ========================= */
var BGM = {
  playing: false, timer: null, step: 0, nextT: 0, ctx: null, mode: 'normal',
  MEL: {
    normal: [69,0,76,0,74,0,72,0,69,0,72,74,76,0,74,0,69,0,76,0,79,0,76,0,74,72,69,0,72,0,74,0],
    boss:   [65,0,68,65,70,0,68,0,65,0,63,0,61,0,63,0,65,0,68,65,70,72,70,68,65,63,61,0,63,0,63,0]
  },
  ensure: function () {
    try {
      if (!this.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    } catch (e) { return null; }
  },
  note: function (midi, t, dur, type, vol) {
    try {
      var c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + dur + 0.05);
    } catch (e) {}
  },
  start: function (mode) {
    if (!save.settings.bgm) return;
    var c = this.ensure(); if (!c) return;
    this.mode = mode || 'normal';
    if (this.playing) return;
    this.playing = true; this.step = 0; this.nextT = c.currentTime + 0.15;
    var self = this;
    this.timer = setInterval(function () { self.sched(); }, 120);
  },
  sched: function () {
    if (!this.ctx) return;
    var c = this.ctx;
    /* 页面休眠/切后台后重新对齐时间轴，避免一次性补弹大量过期音符 */
    if (this.nextT < c.currentTime) this.nextT = c.currentTime + 0.1;
    var spb = this.mode === 'boss' ? 0.26 : 0.31;
    while (this.nextT < c.currentTime + 0.35) {
      var s = this.step;
      var mel = this.MEL[this.mode] || this.MEL.normal;
      if (mel[s]) this.note(mel[s], this.nextT, spb * 0.85, 'triangle', 0.05);
      if (s % 4 === 0) {
        var bass = this.mode === 'boss'
          ? ((Math.floor(s / 4) % 2 === 0) ? 41 : 38)
          : ((Math.floor(s / 4) % 2 === 0) ? 45 : 40);
        this.note(bass, this.nextT, spb * 1.7, 'square', 0.028);
      }
      this.step = (s + 1) % 32;
      this.nextT += spb;
    }
  },
  stop: function () {
    this.playing = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
};

/* ========================= 发音（系统 TTS） ========================= */
var TTS = {
  ok: false, voice: null,
  init: function () {
    if (!('speechSynthesis' in window)) return;
    var self = this;
    var pick = function () {
      var vs = window.speechSynthesis.getVoices();
      if (!vs.length) return;
      var v = null;
      vs.forEach(function (x) {
        var lang = x.lang || '';
        if (!v && /^en[-_]/i.test(lang)) v = x;
        if (/en[-_]us/i.test(lang)) v = x;
      });
      if (v) { self.voice = v; self.ok = true; }
    };
    pick();
    window.speechSynthesis.onvoiceschanged = pick;
    setTimeout(pick, 600);
  },
  speak: function (word, force) {
    if (!this.ok || !this.voice) return;
    if (!force && !save.settings.autoplay) return;
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(word);
      u.voice = this.voice; u.lang = 'en-US';
      u.rate = save.settings.rate || 0.9;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }
};

/* ========================= 语音跟读识别（Web Speech） ========================= */
var Rec = {
  ok: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  listening: false,
  start: function (word, cb) {
    if (!this.ok) { cb('unsupported'); return; }
    try {
      var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      var r = new SR();
      r.lang = 'en-US';
      r.interimResults = false;
      r.maxAlternatives = 3;
      var done = false;
      var to = setTimeout(function () {
        if (!done) { done = true; try { r.stop(); } catch (e) {} cb('timeout'); }
      }, 5000);
      r.onresult = function (e) {
        if (done) return;
        done = true; clearTimeout(to);
        var alts = [];
        try { for (var i = 0; i < e.results[0].length; i++) alts.push(e.results[0][i].transcript); } catch (err) {}
        var said = alts.join(' ').toLowerCase().replace(/[^a-z]/g, '');
        var target = word.toLowerCase().replace(/[^a-z]/g, '');
        cb(said.indexOf(target) >= 0 ? 'ok' : 'no', alts[0] || '');
      };
      r.onerror = function () { if (!done) { done = true; clearTimeout(to); cb('err'); } };
      r.onend = function () { if (!done) { done = true; clearTimeout(to); cb('no'); } };
      r.start();
    } catch (e) { cb('err'); }
  }
};

/* ========================= 游戏内容常量 ========================= */
var DIFFS = {
  easy:   { sec: 20, hp: 40, dmg: 4, name: '轻松' },
  normal: { sec: 14, hp: 30, dmg: 6, name: '标准' },
  hard:   { sec: 10, hp: 24, dmg: 8, name: '挑战' }
};

/* 记忆提示：图像 + 词根拆解 + 同根词家族 */
function memoOf(w) {
  var emoji = (typeof EMOJI_OF !== 'undefined' && EMOJI_OF[w]) ? EMOJI_OF[w] : '';
  var code = wordCode(w);
  var fam = wordFamily(w).slice(0, 3).map(function (x) { return x.w; });
  return { emoji: emoji, code: code, fam: fam };
}

var TYPE_LABEL = {
  c2e: '🇨🇳 选出对应的英文',
  e2c: '🇬🇧 选出正确的中文释义',
  spell: '🔤 根据释义拼出单词',
  listen: '👂 听发音，选出单词'
};

var MONSTERS = [
  ['👻', '小幽灵'], ['🧟', '僵尸'], ['👹', '小恶魔'], ['👾', '外星怪'],
  ['🦇', '蝙蝠怪'], ['🐺', '野狼'], ['🍄', '蘑菇怪'], ['🦂', '毒蝎'],
  ['🐙', '章鱼怪'], ['🧛', '吸血鬼'], ['🐍', '大蛇'], ['🕷️', '毒蜘蛛']
];
var BOSSES = [
  ['🐉', '炎龙 BOSS'], ['🐲', '暗黑龙 BOSS'], ['👿', '魔王 BOSS'],
  ['🦖', '暴龙 BOSS'], ['🐋', '深渊巨鲸 BOSS']
];
var THEMES = [
  ['theme-forest',  '迷雾森林', ['🌲', '🍂', '🍄', '✨'],
    ['树影婆娑，远处传来单词怪的低语…', '苔藓石碑上刻着古老的词汇咒文。', '雾越来越浓了，握紧你的剑！']],
  ['theme-desert',  '荒芜沙漠', ['🌵', '🦴', '☀️', '🐍'],
    ['烈日当空，沙丘后藏着潜伏的怪物。', '风沙中若隐若现的是古老废墟…', '骆驼的骸骨指向绿洲的方向。']],
  ['theme-snow',    '极寒冰原', ['❄️', '⛄', '🌨️', '🌊'],
    ['寒风刺骨，呵气成霜。', '冰面之下，有什么在游动…', '极光在天边静静舞动。']],
  ['theme-volcano', '熔岩火山', ['🌋', '🔥', '💀', '🪨'],
    ['大地在颤抖，熔岩在沸腾。', '灰烬漫天，小心脚下！', '龙息的灼热扑面而来。']],
  ['theme-castle',  '魔王城堡', ['🏰', '👑', '⚡', '🕯️'],
    ['魔王城堡的大门缓缓开启…', '王座厅传来阴森的回响。', '最终的决战，就在眼前！']]
];

/* Boss 随机词缀（前 4 条为挑战码 v1 兼容位，勿改顺序；新词缀只能追加在后。
   v2 编码容量：下标 i 的混合值 i*12+11，14 条最大 13*12+11=167 < 256，无需再扩格式） */
var BOSS_MODS = {
  haste: { icon: '⏱️', name: '时间压缩', desc: '答题时间 -25%' },
  rage:  { icon: '💢', name: '狂暴',     desc: '它的攻击伤害 +3' },
  thorn: { icon: '🌵', name: '荆棘',     desc: '答错额外受 1 点伤害' },
  drain: { icon: '🧲', name: '汲取',     desc: '你答错时它会回血' },
  freeze:{ icon: '🥶', name: '时停',     desc: '开题瞬间偷走你 4 秒' },
  greed: { icon: '💰', name: '贪婪',     desc: '金币 +50%，但你每答 1 题敌军压境 +2%' },
  ward:  { icon: '🪨', name: '石肤',     desc: '怪物有石肤护盾，抵挡第一次伤害' },
  silence:{ icon: '🔕', name: '沉默',    desc: '记忆提示与提示卡被封印' },
  tide:  { icon: '🌊', name: '狂潮',     desc: '敌军攻势每答 1 题 +1%（最多 +15%）' },
  molt:  { icon: '🧟', name: '不死',     desc: '每只怪第一次被击倒时会以 1 血爬起来' },
  famine:{ icon: '🥀', name: '贫瘠',     desc: '本场金币收益减半' },
  curse: { icon: '🎭', name: '诅咒',     desc: '连击封顶 3 连（热浪与爆发全部失效）' },
  fog:   { icon: '🌫️', name: '迷雾',     desc: '开题前 2 秒选项隐于迷雾，雾散才能看清' },
  hex:   { icon: '🔮', name: '妖印',     desc: '蓄力一击被封印，只能靠答题输出' }
};
/* 新遭遇的词缀记入档案（成就「词缀图鉴」用） */
function markModSeen(m) {
  if (!m) return;
  if (!save.modsSeen) save.modsSeen = {};
  if (!save.modsSeen[m]) { save.modsSeen[m] = 1; persist(); }
}

/* 宠物 */
var PETS = [
  { id: 'owl',    icon: '🦉', name: '睿智猫头鹰', desc: '所有答题时间 +15%',       price: 220 },
  { id: 'dragon', icon: '🐉', name: '黄金幼龙',   desc: '金币获取 +15%',           price: 260 },
  { id: 'fairy',  icon: '🧚', name: '治疗妖精',   desc: '每关开始回复 3 点生命',   price: 240 },
  { id: 'turtle', icon: '🐢', name: '不变玄龟',   desc: '受到的伤害 -1（至少 1 点）', price: 280 }
];
function petById(id) {
  var f = null;
  PETS.forEach(function (p) { if (p.id === id) f = p; });
  return f;
}

/* 掌握度升级后的间隔（分钟），答错立即到期 */
var IV_MIN = [0, 5, 30, 12 * 60, 48 * 60, 7 * 24 * 60];

var SHOP_ITEMS = [
  { id: 'potion',   icon: '🧱', name: '工兵抢修', desc: '敌军压境值 -25%', price: 30 },
  { id: 'shield',   icon: '🛡️', name: '护盾',     desc: '抵挡敌军的下一次攻势', price: 40 },
  { id: 'hourglass',icon: '⏳', name: '沙漏',     desc: '下一关每题时间 +3 秒', price: 35 },
  { id: 'hint',     icon: '💡', name: '提示卡 ×3', desc: '排除两个错误选项', price: 45 }
];

var UPGRADES = [
  { id: 'hp',    icon: '🏰', name: '城墙加固', desc: '敌军攻势 -8% / 级',   max: 5, base: 60 },
  { id: 'time',  icon: '⏱️', name: '从容思考', desc: '每题时限 +2 秒 / 级',  max: 3, base: 50 },
  { id: 'shield',icon: '🛡️', name: '开场护盾', desc: '每局开局护盾 ×1 / 级', max: 2, base: 80 },
  { id: 'coin',  icon: '🪙', name: '财富祝福', desc: '金币获取 +20% / 级',   max: 5, base: 70 }
];
function upgradeCost(u) {
  return Math.round(u.base * Math.pow(1.7, save.upgrades[u.id] || 0));
}

/* ========================= 每日任务 ========================= */
var TASK_DEFS = [
  { id: 'q_correct',  icon: '✏️', txt: '答对 20 道题',        goal: 20, reward: 30 },
  { id: 'spell_ok',   icon: '🔤', txt: '拼写题答对 5 次',      goal: 5,  reward: 25 },
  { id: 'listen_ok',  icon: '👂', txt: '听音题答对 3 次',      goal: 3,  reward: 25 },
  { id: 'boss_kill',  icon: '🐉', txt: '击败 1 个 BOSS',       goal: 1,  reward: 40 },
  { id: 'kill_total', icon: '⚔️', txt: '击杀 15 只怪物',       goal: 15, reward: 25 },
  { id: 'combo_hit',  icon: '🔥', txt: '达成 8 连击',          goal: 8,  reward: 30 },
  { id: 'run_any',    icon: '🏁', txt: '完成 1 局游戏',        goal: 1,  reward: 20 },
  { id: 'review_done',icon: '📖', txt: '完成 1 次复习模式',    goal: 1,  reward: 25 },
  { id: 'new_words',  icon: '🌱', txt: '遇到 8 个新单词',      goal: 8,  reward: 30 },
  { id: 'lab_ok',     icon: '🧪', txt: '词根实验室答对 5 题',  goal: 5,  reward: 20 },
  { id: 'exp_kill',   icon: '🚀', txt: '每日远征击破 10 名敌军', goal: 10, reward: 35 }
];
function taskDef(id) {
  var f = null;
  TASK_DEFS.forEach(function (d) { if (d.id === id) f = d; });
  return f;
}

/* 日期种子随机（同一天所有玩家任务一致） */
function hashStr(s) {
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(arr, rng) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function ensureDaily() {
  var today = new Date().toDateString();
  if (save.daily.date === today && save.daily.tasks.length) return;
  var rng = mulberry32(hashStr(today + '|wq'));
  var picks = seededShuffle(TASK_DEFS.map(function (d, i) { return i; }), rng).slice(0, 3);
  save.daily = {
    date: today,
    tasks: picks.map(function (i) {
      return { id: TASK_DEFS[i].id, goal: TASK_DEFS[i].goal, prog: 0, done: false, claimed: false };
    })
  };
  persist();
}
function bumpTask(id, n) {
  ensureDaily();
  save.daily.tasks.forEach(function (t) {
    if (t.id === id && !t.claimed) {
      t.prog = Math.min(t.goal, t.prog + (n || 1));
      if (t.prog >= t.goal && !t.done) { t.done = true; toast('📅 任务完成：' + (taskDef(id) || {}).txt); }
    }
  });
}
function setTask(id, v) {
  ensureDaily();
  save.daily.tasks.forEach(function (t) {
    if (t.id === id && !t.claimed && v > t.prog) {
      t.prog = Math.min(t.goal, v);
      if (t.prog >= t.goal && !t.done) { t.done = true; toast('📅 任务完成：' + (taskDef(id) || {}).txt); }
    }
  });
}
function renderDaily() {
  ensureDaily();
  var html = '';
  save.daily.tasks.forEach(function (t, i) {
    var def = taskDef(t.id); if (!def) return;
    var pct = Math.min(100, Math.round(t.prog / t.goal * 100));
    var right = t.claimed ? '<span class="task-done">✅ 已领取</span>'
      : (t.done ? '<button class="btn btn-tiny btn-primary btn-claim" data-i="' + i + '">领取 +' + def.reward + '</button>'
      : '<span class="task-count">' + t.prog + '/' + t.goal + '</span>');
    html += '<div class="task-row"><span>' + def.icon + '</span><span class="task-txt">' + def.txt +
      '</span><div class="task-bar"><div class="task-fill" style="width:' + pct + '%"></div></div>' + right + '</div>';
  });
  $('daily-tasks').innerHTML = html;
}
function claimDaily(i) {
  var t = save.daily.tasks[i];
  if (!t || t.claimed || !t.done) return;
  var def = taskDef(t.id);
  t.claimed = true;
  save.coins += def.reward;
  save.stats.dailyDone++;
  Sfx.coin();
  toast('📅 领取奖励：+' + def.reward + ' 🪙');
  checkAch(); persist(); renderDaily(); refreshHome();
}

/* ========================= 成就 ========================= */
var ACH = [
  ['first_blood', '🗡️', '初试锋芒', '击杀第一只单词怪'],
  ['boss1',       '🐉', '屠龙勇士', '击败一个 BOSS'],
  ['stage10',     '🧭', '远征者',   '抵达第 10 关'],
  ['endless50',   '👑', '无尽霸主', '无尽模式击杀 50 只'],
  ['combo10',     '🔥', '连击大师', '达成 10 连击'],
  ['combo20',     '⚡', '势不可挡', '达成 20 连击'],
  ['perfect',     '💎', '完美一局', '单局 10 题以上零失误'],
  ['master50',    '📚', '小词典',   '掌握 50 个单词'],
  ['master200',   '🎓', '词汇大师', '掌握 200 个单词'],
  ['spell50',     '🔤', '拼写行家', '拼写题累计答对 50 次'],
  ['listen30',    '👂', '金耳朵',   '听音题累计答对 30 次'],
  ['streak3',     '📅', '三日之约', '连续打卡 3 天'],
  ['streak7',     '🏅', '七日之约', '连续打卡 7 天'],
  ['rich',        '🪙', '小金库',   '同时持有 500 金币'],
  ['daily5',      '📋', '日课达人', '完成 5 个每日任务'],
  ['pet1',        '🐣', '宠物之家', '获得一只宠物'],
  ['lv5',         '⭐', '崭露头角', '玩家等级达到 Lv.5'],
  ['talent5',     '✨', '天赋异禀', '累计学习 5 级天赋'],
  ['poison_set',  '☠️', '投毒新手', '第一次发出挑战码'],
  ['poison_win',  '🗡️', '毒池生还', '通关一次噩梦毒池'],
  ['pack1',       '🧩', '主题挑战者', '主题挑战包通过第 1 关'],
  ['packs3',      '🎒', '包罗万象', '完成 3 个不同的主题挑战包'],
  ['exp1',        '🚀', '远征先锋', '通关一次每日远征'],
  ['lab30',       '🧪', '词根炼金师', '词根实验室累计答对 30 题'],
  ['mod_all',     '👁️', '词缀图鉴', '遭遇过全部 ' + Object.keys(BOSS_MODS).length + ' 种 BOSS 词缀'],
  ['rogue1',      '🎲', '词魂出征', '完成一局词魂肉鸽'],
  ['rogue_win',   '👑', '词魂加冕', '通关词魂肉鸽（击败第 6 关 BOSS）'],
  ['rogue_chain', '🔗', '连锁法师', '单局词根连锁 5 次'],
  ['rogue_curse', '📜', '诅咒图鉴', '遭遇过 6 种不同的全局诅咒'],
  ['duel1',       '🤝', '棋逢对手', '完成一局双人同屏对决'],
  ['duel_win',    '🏆', '对决之王', '在双人对决中累计取胜 3 次']
];
function masteredCount() {
  var n = 0;
  for (var w in save.mastery) { if (save.mastery[w].lv >= 5) n++; }
  return n;
}
function unlockAch(id) {
  if (save.ach[id]) return;
  save.ach[id] = 1;
  save.coins += 20;
  ACH.forEach(function (a) {
    if (a[0] === id) toast('🏆 成就解锁：' + a[1] + ' ' + a[2] + '  +20🪙');
  });
  Confetti.burst(36);
  persist();
}
function checkAch() {
  if (save.stats.kills >= 1) unlockAch('first_blood');
  if (save.stats.bosses >= 1) unlockAch('boss1');
  if (save.best.adventure >= 10) unlockAch('stage10');
  if (save.best.endless >= 50) unlockAch('endless50');
  if (save.stats.maxCombo >= 10) unlockAch('combo10');
  if (save.stats.maxCombo >= 20) unlockAch('combo20');
  if (save.stats.perfects >= 1) unlockAch('perfect');
  var mc = masteredCount();
  if (mc >= 50) unlockAch('master50');
  if (mc >= 200) unlockAch('master200');
  if (save.stats.spellOk >= 50) unlockAch('spell50');
  if (save.stats.listenOk >= 30) unlockAch('listen30');
  if (save.streak.count >= 3) unlockAch('streak3');
  if (save.streak.count >= 7) unlockAch('streak7');
  if (save.coins >= 500) unlockAch('rich');
  if (save.stats.dailyDone >= 5) unlockAch('daily5');
  if (Object.keys(save.pets).length >= 1) unlockAch('pet1');
  if (save.level >= 5) unlockAch('lv5');
  if (talentRankSum() >= 5) unlockAch('talent5');
  /* 发过挑战码即算布毒（含修复前只写 poisonIssued 未入战绩日志的旧存档） */
  if ((save.poisonLog || []).some(function (e) { return e.role === 'set'; }) || save.poisonIssued) unlockAch('poison_set');
  if ((save.poisonLog || []).some(function (e) { return e.role === 'play' && e.win; })) unlockAch('poison_win');
  if ((save.stats.packDone || 0) >= 1) unlockAch('pack1');
  if (Object.keys(save.stats.packDoneMap || {}).length >= 3) unlockAch('packs3');
  if ((save.stats.expWins || 0) >= 1) unlockAch('exp1');
  if ((save.stats.labOk || 0) >= 30) unlockAch('lab30');
  if (Object.keys(save.modsSeen || {}).length >= Object.keys(BOSS_MODS).length) unlockAch('mod_all');
  if (save.rogue && (save.rogue.runs || 0) >= 1) unlockAch('rogue1');
  if (save.rogue && (save.rogue.wins || 0) >= 1) unlockAch('rogue_win');
  if (save.rogue && (save.rogue.bestChain || 0) >= 5) unlockAch('rogue_chain');
  if (save.rogue && Object.keys(save.rogue.cursesSeen || {}).length >= 6) unlockAch('rogue_curse');
  if (save.duel && (save.duel.plays || 0) >= 1) unlockAch('duel1');
  if (save.duel && ((save.duel.p1wins || 0) + (save.duel.p2wins || 0)) >= 3) unlockAch('duel_win');
}

/* ========================= 玩家等级 & 天赋 =========================
   经验来自所有出题模式（答对/击杀/通关），升级 +1 天赋点；
   天赋为永久被动，各模式通用，写入 save.talents（旧存档缺字段自动取默认） */
var TALENTS = [
  { id: 'vigor',   icon: '🛡️', name: '钢铁城墙', desc: '敌军攻势 -5% / 级', max: 3 },
  { id: 'calm',    icon: '⏳', name: '从容不迫', desc: '每题答题时间 +1 秒 / 级', max: 2 },
  { id: 'magnet',  icon: '🪙', name: '财富磁石', desc: '金币获取 +10% / 级', max: 3 },
  { id: 'medic',   icon: '🧰', name: '战地抢修', desc: '每关开始压境值 -3% / 级', max: 2 },
  { id: 'soul',    icon: '🔥', name: '连击之魂', desc: '答对击退敌军的效果 +10% / 级', max: 2 },
  { id: 'sage',    icon: '💡', name: '智者启示', desc: '每局开局自带提示卡 +1 / 级', max: 2 },
  { id: 'will',    icon: '🕯️', name: '不灭意志', desc: '城破时续命一次：压境回落到 70%', max: 1 },
  { id: 'scholar', icon: '📖', name: '学者天赋', desc: '获得经验 +20% / 级', max: 3 },
  { id: 'focus',   icon: '🎯', name: '缓兵之计', desc: '复仇怪兽延后 2 题 / 级', max: 2 },
  { id: 'slayer',  icon: '🐉', name: '屠龙蓄能', desc: '击败 BOSS 金币 +25% / 级', max: 2 },
  { id: 'smite',   icon: '⚡', name: '蓄雷一击', desc: '每答对 6 题，下一击伤害翻倍', max: 1 },
  { id: 'haggle',  icon: '🧾', name: '行囊议价', desc: '商店补给价格 -15% / 级', max: 2 }
];
function talentLv(id) { return (save.talents && save.talents[id]) || 0; }
function xpNeed(lv) { return 60 + (lv - 1) * 45; }
function addXp(n) {
  save.xp += Math.round(n * (1 + 0.2 * talentLv('scholar')));
  /* 脏档防御：xp/level 异常（导入巨数 xp / level 为 0 或 NaN）曾让本循环迭代数亿次
     冻结主线程——表现为「玩着玩着突然白屏卡死」。夹取 + 500 次上限，超限直接归零 xp。 */
  if (!(save.level >= 1)) save.level = 1;
  if (!(typeof save.xp === 'number' && isFinite(save.xp))) save.xp = 0;
  var up = false, guard = 0;
  while (save.xp >= xpNeed(save.level) && guard++ < 500) {
    save.xp -= xpNeed(save.level);
    save.level++;
    save.talentPts++;
    up = true;
  }
  if (save.xp >= xpNeed(save.level)) save.xp = 0;
  if (up) {
    toast('⭐ 等级提升！Lv.' + save.level + ' · 获得 1 天赋点（主界面「✨ 天赋」加点）');
    Confetti.burst(50);
    Sfx.levelup();
  }
}
function talentRankSum() {
  var n = 0;
  TALENTS.forEach(function (t) { n += talentLv(t.id); });
  return n;
}
function openTalent() {
  showScreen('scr-talent');
  renderTalent();
}
function renderTalent() {
  $('talent-lv').textContent = save.level;
  $('talent-pts').textContent = save.talentPts;
  var need = xpNeed(save.level);
  $('talent-xp-text').textContent = save.xp + ' / ' + need + ' EXP';
  $('xp-fill').style.width = Math.min(100, save.xp / need * 100) + '%';
  var html = '';
  TALENTS.forEach(function (t) {
    var lv = talentLv(t.id);
    var maxed = lv >= t.max;
    html += '<div class="talent-item' + (maxed ? ' maxed' : '') + '">' +
      '<div class="talent-icon">' + t.icon + '</div>' +
      '<div class="talent-name">' + t.name + '</div>' +
      '<div class="talent-rank">' + '◆'.repeat(lv) + '◇'.repeat(t.max - lv) + '</div>' +
      '<div class="talent-desc">' + t.desc + '</div>' +
      '<button class="btn btn-tiny btn-primary talent-buy" data-t="' + t.id + '"' +
      (maxed || save.talentPts <= 0 ? ' disabled' : '') + '>' +
      (maxed ? '已满级' : (lv > 0 ? '升一级' : '解锁')) + '</button></div>';
  });
  $('talent-grid').innerHTML = html;
}
function buyTalent(id) {
  var t = null;
  TALENTS.forEach(function (x) { if (x.id === id) t = x; });
  if (!t) return;
  var lv = talentLv(id);
  if (lv >= t.max || save.talentPts <= 0) return;
  save.talentPts--;
  save.talents[id] = lv + 1;
  Sfx.levelup();
  toast('✨ ' + t.name + ' ' + (lv + 1 > 1 ? 'Lv.' + (lv + 1) : '解锁') + '！');
  persist();
  renderTalent();
  refreshHome();
}
function openAch() {
  showScreen('scr-ach');
  var n = 0;
  var html = '';
  ACH.forEach(function (a) {
    var got = !!save.ach[a[0]];
    if (got) n++;
    html += '<div class="ach-item' + (got ? '' : ' locked') + '"><div class="ach-icon">' + a[1] +
      '</div><div class="ach-name">' + a[2] + '</div><div class="ach-desc">' + a[3] +
      '</div>' + (got ? '' : '<div class="ach-lock">🔒 未解锁</div>') + '</div>';
  });
  $('ach-grid').innerHTML = html;
  $('ach-count').textContent = n + ' / ' + ACH.length;
}

/* ========================= 全局提示 Toast ========================= */
var toastQ = [], toastBusy = false;
function toast(msg) {
  toastQ.push(msg);
  pumpToast();
}
function pumpToast() {
  if (toastBusy || !toastQ.length) return;
  toastBusy = true;
  var m = toastQ.shift();
  var d = document.createElement('div');
  d.className = 'toast';
  d.textContent = m;
  $('toast-wrap').appendChild(d);
  setTimeout(function () {
    d.classList.add('out');
    setTimeout(function () { d.remove(); toastBusy = false; pumpToast(); }, 320);
  }, 2300);
}

/* ========================= 彩带粒子（Canvas） ========================= */
var Confetti = {
  cv: null, ctx: null, parts: [], raf: null,
  COLORS: ['#ffd166', '#7c5cff', '#3ddc84', '#ff5d73', '#7ce8ff', '#ffe9a8', '#ff9a5d'],
  ensure: function () {
    if (!this.cv) {
      this.cv = document.createElement('canvas');
      this.cv.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:250;';
      document.body.appendChild(this.cv);
    }
    if (!this.ctx) this.ctx = this.cv.getContext('2d');   /* release 后复用时重新取 context */
    this.cv.width = window.innerWidth;
    this.cv.height = window.innerHeight;
  },
  burst: function (n, ox, oy) {
    try {
      this.ensure();
      var W = this.cv.width, H = this.cv.height;
      var at = (ox !== undefined && oy !== undefined);
      var spread = at ? 60 : 120;
      for (var i = 0; i < (n || 60); i++) {
        this.parts.push({
          x: at ? ox : W / 2 + (Math.random() - 0.5) * spread,
          y: at ? oy : H * 0.35,
          vx: (Math.random() - 0.5) * (at ? 11 : 16),
          vy: -(4 + Math.random() * (at ? 7 : 9)),
          g: 0.35,
          s: 5 + Math.random() * 7,
          c: this.COLORS[Math.floor(Math.random() * this.COLORS.length)],
          r: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.3,
          life: (at ? 45 : 70) + Math.random() * 50
        });
      }
      if (!this.raf) this.loop();
    } catch (e) {}
  },
  loop: function () {
    var self = this;
    this.raf = requestAnimationFrame(function () { self.loop(); });
    var c = this.ctx;
    c.clearRect(0, 0, this.cv.width, this.cv.height);
    this.parts = this.parts.filter(function (p) {
      p.x += p.vx; p.y += p.vy; p.vy += p.g;
      p.r += p.vr; p.life--;
      if (p.life <= 0 || p.y > self.cv.height + 20) return false;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.r);
      c.fillStyle = p.c;
      c.globalAlpha = Math.min(1, p.life / 30);
      c.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
      c.restore();
      return true;
    });
    if (!this.parts.length) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
      this.release();
    }
  },
  /* 空闲即释放全屏 backing store：fixed canvas 的宽高属性归零后，
     浏览器可回收这块大画布内存，长玩期间不再常驻一份全屏位图 */
  release: function () {
    try {
      if (this.cv) { this.cv.width = 0; this.cv.height = 0; }
      if (this.ctx) this.ctx = null;
    } catch (e) {}
  }
};

function shakeApp(small) {
  var a = $('app');
  var cls = small ? 'shake-sm' : 'shake';
  a.classList.remove('shake', 'shake-sm');
  void a.offsetWidth;
  a.classList.add(cls);
  setTimeout(function () { a.classList.remove(cls); }, small ? 260 : 450);
}

/* ========================= 战斗视觉表现（怪物形象化 / 城防受击 / 蓄力一击） =========================
   原则：canvas 只在怪物刷新/受击时重绘一帧静态光环，动效全交给 CSS（transform/opacity），
   不新增常驻 rAF 循环，保证答题循环 60fps 与可作理性。 */

/* 词性 → 光环：金=名词盾环 / 红=动词火环 / 紫=形容词星芒 / 青=副词电弧 / 灰=其它尘埃环 */
var POS_AURA = {
  n:    { c: '#ffd166', kind: 'hex' },
  v:    { c: '#ff5d73', kind: 'flame' },
  adj:  { c: '#b48bff', kind: 'star' },
  adv:  { c: '#7ce8ff', kind: 'bolt' },
  prep: { c: '#8df0c2', kind: 'dust' },
  conj: { c: '#8df0c2', kind: 'dust' },
  pron: { c: '#8df0c2', kind: 'dust' }
};

function hexRing(c, cx, cy, R) {
  var i, a;
  c.beginPath();
  for (i = 0; i <= 6; i++) {
    a = i / 6 * Math.PI * 2 - Math.PI / 2;
    if (i === 0) c.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    else c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
  }
  c.stroke();
  for (i = 0; i < 6; i++) {
    a = i / 6 * Math.PI * 2 - Math.PI / 2;
    c.beginPath();
    c.arc(cx + Math.cos(a) * R * 1.14, cy + Math.sin(a) * R * 1.14, Math.max(1.5, R * 0.055), 0, Math.PI * 2);
    c.fillStyle = c.strokeStyle;
    c.fill();
  }
}
function flameRing(c, cx, cy, R, col, n) {
  c.fillStyle = col;
  for (var i = 0; i < n; i++) {
    var a0 = i / n * Math.PI * 2;
    var half = Math.PI / n * 0.62;
    c.beginPath();
    c.moveTo(cx + Math.cos(a0 - half) * R, cy + Math.sin(a0 - half) * R);
    c.lineTo(cx + Math.cos(a0) * R * 1.2, cy + Math.sin(a0) * R * 1.2);
    c.lineTo(cx + Math.cos(a0 + half) * R, cy + Math.sin(a0 + half) * R);
    c.closePath();
    c.fill();
  }
  c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
}
function starRing(c, cx, cy, R, col) {
  c.fillStyle = col;
  for (var i = 0; i < 8; i++) {
    var a0 = i / 8 * Math.PI * 2 - Math.PI / 2;
    var L = (i % 2 === 0) ? 1.22 : 1.08;
    var half = (i % 2 === 0) ? 0.14 : 0.1;
    c.beginPath();
    c.moveTo(cx + Math.cos(a0 - half) * R, cy + Math.sin(a0 - half) * R);
    c.lineTo(cx + Math.cos(a0) * R * L, cy + Math.sin(a0) * R * L);
    c.lineTo(cx + Math.cos(a0 + half) * R, cy + Math.sin(a0 + half) * R);
    c.closePath();
    c.fill();
  }
  c.setLineDash([2, 7]);
  c.beginPath(); c.arc(cx, cy, R * 0.86, 0, Math.PI * 2); c.stroke();
  c.setLineDash([]);
}
function boltRing(c, cx, cy, R, col) {
  var seg = Math.PI * 0.44;
  for (var i = 0; i < 3; i++) {
    var a0 = i * (Math.PI * 2 / 3) - Math.PI / 2;
    c.beginPath();
    c.arc(cx, cy, R, a0, a0 + seg);
    c.stroke();
    c.beginPath();
    for (var s = 0; s <= 5; s++) {
      var aa = a0 + (s / 5) * seg;
      var rr = R * (s % 2 === 0 ? 1.14 : 0.9);
      if (s === 0) c.moveTo(cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr);
      else c.lineTo(cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr);
    }
    c.stroke();
  }
}
function dustRing(c, cx, cy, R, col) {
  c.fillStyle = col;
  for (var i = 0; i < 12; i++) {
    var a = i / 12 * Math.PI * 2;
    c.beginPath();
    c.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, Math.max(1.5, R * 0.05), 0, Math.PI * 2);
    c.fill();
  }
}

/* 当前怪物的形象参数（由出题词的词性/掌握度 + 怪物血量决定） */
function monsterTraitOpts() {
  if (!run || !run.monster) return null;
  var word = run.q ? run.q.word : null;
  return {
    boss: run.monster.boss,
    hp: run.monster.hp,
    pos: word ? posOf(word.m) : '',
    lv: word ? ((save.mastery[word.w] || {}).lv || 0) : 0
  };
}

function paintMonsterVisual(o) {
  var cv = $('monster-aura'), emoji = $('monster-emoji');
  if (!cv || !emoji) return;
  if (!o) { cv.width = 0; return; }
  var F = parseFloat(getComputedStyle(emoji).fontSize) || 64;
  var S = Math.round(F * (o.boss ? 2.5 : 2.1));
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  /* 尺寸未变就复用同一 backing store：每题重设 width/height 会反复分配/释放
     一块新画布内存，长玩期间给渲染进程持续施压 */
  var W = Math.round(S * dpr);
  if (cv.width !== W || cv.height !== W) {
    cv.style.width = S + 'px';
    cv.style.height = S + 'px';
    cv.width = W;
    cv.height = W;
  }
  var c = cv.getContext('2d');
  if (!c) return;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, S, S);
  var cx = S / 2, cy = S / 2, R = S * 0.44;
  var aura = o.boss ? null : (POS_AURA[o.pos] || null);
  var col = o.boss ? '#ff5d73' : (aura ? aura.c : 'rgba(255,255,255,.55)');
  var alpha = o.lv >= 4 ? 0.5 : (o.lv <= 1 ? 1 : 0.8);
  c.globalAlpha = alpha;
  c.strokeStyle = col;
  c.lineWidth = Math.max(2, S * 0.032);
  c.lineCap = 'round';
  var kind = o.boss ? 'boss' : (aura ? aura.kind : 'dust');
  if (kind === 'boss') { flameRing(c, cx, cy, R, '#ff5d73', 14); c.strokeStyle = '#ffd166'; flameRing(c, cx, cy, R * 0.78, '#ffd166', 9); }
  else if (kind === 'hex') hexRing(c, cx, cy, R);
  else if (kind === 'flame') flameRing(c, cx, cy, R, col, 12);
  else if (kind === 'star') starRing(c, cx, cy, R, col);
  else if (kind === 'bolt') boltRing(c, cx, cy, R, col);
  else dustRing(c, cx, cy, R, col);
  /* 危险红晕：新词 / 弱项（lv≤1），提醒玩家这题别大意 */
  if (!o.boss && o.lv <= 1) {
    c.globalAlpha = 0.4;
    c.strokeStyle = '#ff5d73';
    c.setLineDash([4, 6]);
    c.beginPath(); c.arc(cx, cy, R * 1.18, 0, Math.PI * 2); c.stroke();
    c.setLineDash([]);
  }
  /* 难度之角：血量越厚角越多（2 血 2 角，3+ 血 4 角） */
  c.globalAlpha = alpha;
  var horns = o.hp >= 3 ? 4 : (o.hp === 2 ? 2 : 0);
  for (var h = 0; h < horns; h++) {
    var ang = -Math.PI / 2 + (h < 2 ? (h === 0 ? -0.5 : 0.5) : (h === 2 ? -0.95 : 0.95));
    var bx = cx + Math.cos(ang) * R * 0.9, by = cy + Math.sin(ang) * R * 0.9;
    var tx = cx + Math.cos(ang) * R * 1.26, ty = cy + Math.sin(ang) * R * 1.26;
    var px = Math.cos(ang + Math.PI / 2) * S * 0.05;
    var py = Math.sin(ang + Math.PI / 2) * S * 0.05;
    c.beginPath();
    c.moveTo(bx + px, by + py);
    c.lineTo(tx, ty);
    c.lineTo(bx - px, by - py);
    c.closePath();
    c.fillStyle = o.boss ? '#ffd166' : col;
    c.fill();
  }
  c.globalAlpha = 1;
}

/* 答完题后亮出词根符文（答题前显示会泄题底，答完展示帮助记忆） */
function revealRune(word) {
  var el = $('monster-rune');
  if (!el || !word) return;
  var p = parseCode(word.w);
  var bits = [];
  var pos = posOf(word.m);
  if (pos) bits.push(pos + '.');
  if (p && p.roots.length) {
    var r0 = p.roots[0], mean = '';
    CODE_ROOT.forEach(function (r) { if (r[0] === r0) mean = r[1]; });
    bits.push(r0 + (mean ? '(' + mean + ')' : ''));
  }
  if (!bits.length) { el.hidden = true; return; }
  el.textContent = '🪶 ' + bits.join(' · ');
  el.hidden = false;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

/* ---------- 城防受击：裂纹分档 + 火光烟雾 + 火花 ---------- */
var castleSmokeOn = false;
function updateCastleViz() {
  if (!run || !(run.mode === 'adventure' || run.mode === 'endless' || run.mode === 'expedition')) return;
  var wrap = $('pressure-wrap'), cw = $('castle-fx');
  if (!wrap || !cw) return;
  var p = run.pressure;
  wrap.classList.toggle('dmg-1', p >= 30 && p < 60);
  wrap.classList.toggle('dmg-2', p >= 60 && p < 85);
  wrap.classList.toggle('dmg-3', p >= 85);
  if (p >= 70 && !castleSmokeOn) {
    castleSmokeOn = true;
    ['💨', '🔥', '💨'].forEach(function (em, i) {
      var s = document.createElement('span');
      s.className = 'castle-smoke';
      s.textContent = em;
      s.style.animationDelay = (i * 0.6) + 's';
      cw.appendChild(s);
    });
  } else if (p < 40 && castleSmokeOn) {
    castleSmokeOn = false;
    Array.prototype.forEach.call(cw.querySelectorAll('.castle-smoke'), function (n) { n.remove(); });
  }
}
function castleHitFx() {
  var wrap = $('pressure-castle-wrap'), cw = $('castle-fx');
  if (!wrap || !cw) return;
  wrap.classList.remove('castle-hit');
  void wrap.offsetWidth;
  wrap.classList.add('castle-hit');
  setTimeout(function () { wrap.classList.remove('castle-hit'); }, 500);
  for (var i = 0; i < 2; i++) {
    var s = document.createElement('span');
    s.className = 'castle-spark';
    s.textContent = i ? '✨' : '💥';
    s.style.left = (6 + Math.random() * 26) + 'px';
    s.style.animationDelay = (i * 0.09) + 's';
    cw.appendChild(s);
    (function (node) { setTimeout(function () { node.remove(); }, 750); })(s);
  }
}

/* ---------- 通用小特效：斩击弧 / 白闪 / 红晕 / 冲击环 ---------- */
function monsterCenter() {
  var m = $('monster-emoji');
  if (!m) return null;
  var r = m.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}
function fxAt(cls, x, y, life) {
  var d = document.createElement('div');
  d.className = cls;
  d.style.left = x + 'px';
  d.style.top = y + 'px';
  $('fx-layer').appendChild(d);
  setTimeout(function () { d.remove(); }, life || 500);
}
function slashAtMonster() {
  var p = monsterCenter();
  if (!p) return;
  var d = document.createElement('div');
  d.className = 'fx-slash';
  d.style.left = (p.x - 45) + 'px';
  d.style.top = (p.y - 45) + 'px';
  $('fx-layer').appendChild(d);
  setTimeout(function () { d.remove(); }, 420);
}
function ringAtMonster(gold) {
  var p = monsterCenter();
  if (!p) return;
  var d = document.createElement('div');
  d.className = 'fx-ring' + (gold ? ' gold' : '');
  d.style.left = (p.x - 30) + 'px';
  d.style.top = (p.y - 30) + 'px';
  $('fx-layer').appendChild(d);
  setTimeout(function () { d.remove(); }, 560);
}
function fxScreenVignette(bad) {
  var d = document.createElement('div');
  d.className = bad ? 'fx-vignette' : 'fx-flash';
  $('fx-layer').appendChild(d);
  setTimeout(function () { d.remove(); }, 460);
}
function killBurstFx() {
  var p = monsterCenter();
  if (p) Confetti.burst(26, p.x, p.y);
  ringAtMonster(true);
  shakeApp(true);
}

/* ---------- 蓄力一击：答题时点击怪物（或 ⚡ 按钮），约 1 秒蓄满自动释放 ----------
   规则：每题限一次；伤害最多打到 1 血（不抢答题循环的击杀）；残血改为震慑击退压境。
   天赋联动：蓄雷一击 smite 伤害翻倍 / 连击之魂 soul 增强震慑 / 屠龙蓄能 slayer 对 BOSS 加金币。 */
var chargeSt = null;
function canCharge() {
  return !!(run && run.q && !run.q.locked && !run.ended && combatLike() &&
    $('memcard').hidden && $('banner').hidden &&
    activeMod() !== 'hex' &&   /* 妖印词缀：蓄力一击被封印 */
    !run.q.chargeUsed && (!chargeSt || !chargeSt.active));
}
function cancelCharge() {
  if (chargeSt) {
    clearTimeout(chargeSt.to);
    if (chargeSt.ring) chargeSt.ring.remove();
    chargeSt = null;
  }
  var fig = $('monster-figure');
  if (fig) fig.classList.remove('charging');
}
function tryStartCharge() {
  if (!run || !run.q || run.q.locked || run.ended) return;
  if (activeMod() === 'hex') {   /* 妖印词缀：给出一次提示，不弹窗轰炸 */
    if (!run.q.hexToasted) { run.q.hexToasted = 1; toast('🔮 妖印词缀：蓄力一击被封印！'); }
    return;
  }
  if (!canCharge()) return;
  cancelCharge();
  var fig = $('monster-figure');
  var ring = document.createElement('div');
  ring.className = 'charge-ring';
  fig.appendChild(ring);
  fig.classList.add('charging');
  var q = run.q, seq = runEpoch;
  chargeSt = {
    q: q, epoch: seq, ring: ring, active: true,
    to: setTimeout(function () {
      var st = chargeSt;
      cancelCharge();
      if (!st || !run || run.ended || runEpoch !== seq || run.q !== q || q.locked) return;
      releaseCharge(q);
    }, 900)
  };
  Sfx.tone(280, .1, 'sine', 0, .045);
  Sfx.tone(430, .25, 'sine', .12, .045);
}
function releaseCharge(q) {
  q.chargeUsed = true;
  $('btn-charge').hidden = true;
  var m = run.monster;
  if (!m) return;
  var smite = talentLv('smite') > 0;
  var dmg = smite ? 2 : 1;
  fxScreenVignette(false);
  slashAtMonster();
  var mon = $('monster-emoji');
  mon.classList.remove('hit');
  void mon.offsetWidth;
  mon.classList.add('hit');
  Sfx.tone(760, .14, 'square', 0, .07);
  Sfx.tone(980, .18, 'triangle', .06, .07);
  if (m.shield > 0) {
    m.shield--;
    fx('⚡ 蓄力一击击碎了石肤护盾！', 'good', 25, 22);
  } else if (m.hp > 1) {
    m.hp = Math.max(1, m.hp - dmg);
    fx('⚡ 蓄力一击 -' + dmg + (m.hp === 1 ? '·残血！' : ''), 'good', 25, 24);
    if (smite) fx('⚡⚡ 蓄雷强化 ×2', 'good', 25, 12);
  } else {
    var knock = Math.round(6 * (1 + 0.1 * talentLv('soul')));
    if (m.boss && talentLv('slayer')) {
      var g = 8 * talentLv('slayer');
      save.coins += g;
      run.coinsEarned += g;
      fx('🐉 屠龙蓄能 +' + g + '🪙', 'good', 30, 40);
    }
    addPressure(-knock);
    fx('⚡ 震慑！敌军压境 -' + knock + '%', 'good', 25, 24);
  }
  updateHUD();
  paintMonsterVisual(monsterTraitOpts());
}

/* ========================= 词汇密码（词根词缀拆解） ========================= */
var CODE_PREFIX = [
  ['inter', '之间'], ['trans', '横过'], ['under', '不足'], ['over', '过度'],
  ['anti', '反对'], ['auto', '自动'], ['sub', '下面'], ['dis', '分开/不'],
  ['com', '共同'], ['con', '共同'], ['pre', '预先'], ['pro', '向前'],
  ['im', '进入/不'], ['in', '进入/不'], ['ex', '向外'], ['re', '再次'],
  ['de', '向下/去除'], ['mis', '错误'], ['un', '不'], ['en', '使…'], ['bi', '双']
];
var CODE_ROOT = [
  ['spect', '看'], ['struct', '建造'], ['scrip', '写'], ['graph', '写/记录'],
  ['phon', '声音'], ['bio', '生命'], ['geo', '地球'], ['meter', '测量'],
  ['scope', '观察'], ['press', '压'], ['port', '携带'], ['dict', '说'],
  ['ject', '投掷'], ['duct', '引导'], ['tract', '拉'], ['form', '形状'],
  ['vis', '看'], ['vid', '看'], ['aud', '听'], ['mit', '送'], ['miss', '送'],
  ['fer', '带来'], ['cede', '走/让'], ['ceed', '走'], ['cur', '跑'],
  ['vert', '转'], ['rupt', '破裂'], ['sist', '站立'], ['tain', '持有'],
  ['cap', '抓/取'], ['pos', '放置'], ['pel', '推'], ['ven', '来'],
  ['loc', '地方'], ['nat', '出生'], ['temp', '时间'], ['termin', '终点'],
  ['lect', '选/收集'], ['text', '编织'], ['sens', '感觉'], ['sent', '感觉'],
  ['mem', '记忆'], ['ped', '脚'], ['man', '手'], ['cord', '心'], ['cent', '百'],
  ['ann', '年'], ['morph', '形态'], ['path', '感情'], ['psych', '心理'],
  ['lum', '光'], ['luc', '光'], ['grav', '重'], ['vac', '空'], ['volv', '转'],
  ['viv', '活'], ['vit', '生命'], ['corp', '身体'], ['gener', '产生'],
  ['greg', '群'], ['jud', '判断'], ['leg', '法律'], ['migr', '迁移'],
  ['min', '小'], ['nov', '新'], ['oper', '工作'], ['opt', '选择'],
  ['ord', '顺序'], ['pend', '悬挂'], ['pet', '寻求'], ['pict', '画'],
  ['pon', '放置'], ['popul', '人民'], ['punct', '刺'], ['reg', '统治'],
  ['rot', '转'], ['sci', '知道'], ['sect', '切'], ['sequ', '跟随'],
  ['sert', '放置'], ['serv', '保持'], ['sign', '标记'], ['simil', '相似'],
  ['soc', '社会'], ['sol', '太阳/单独'], ['son', '声音'], ['spir', '呼吸'],
  ['tact', '触摸'], ['tech', '技术'], ['terr', '大地'], ['test', '见证'],
  ['therm', '热'], ['tom', '切'], ['tox', '毒'], ['turb', '扰乱'],
  ['uni', '一'], ['urb', '城市'], ['val', '价值'], ['var', '变化'],
  ['ver', '真实'], ['verb', '词语'], ['vers', '转'], ['vic', '征服'],
  ['vinc', '征服'], ['voc', '喊/声音'], ['vol', '意愿'], ['vor', '吃'],
  ['tele', '远'], ['gram', '写/记录'], ['writ', '写'], ['photo', '光/照相'], ['hydro', '水']
];
var CODE_SUFFIX = [
  ['ation', '名词后缀'], ['ition', '名词后缀'], ['ment', '名词后缀'],
  ['ness', '名词后缀'], ['able', '能…的'], ['ible', '能…的'],
  ['ful', '充满…的'], ['less', '无…的'], ['ive', '…性的'], ['ous', '…多的'],
  ['al', '…的'], ['ic', '…的'], ['ly', '…地'], ['er', '…者'], ['or', '…者'],
  ['ist', '…的人'], ['ism', '主义'], ['ify', '使…化'], ['ize', '使…化']
];
function parseOnce(w, usePrefix) {
  try {
    var rest = w, segs = [], matched = 0, roots = [];
    if (usePrefix) {
      var prefs = CODE_PREFIX.slice().sort(function (a, b) { return b[0].length - a[0].length; });
      for (var i = 0; i < prefs.length; i++) {
        if (rest.length >= prefs[i][0].length + 2 && rest.indexOf(prefs[i][0]) === 0) {
          segs.push({ pos: -1, t: prefs[i][0] + '-(' + prefs[i][1] + ')' });
          matched += prefs[i][0].length;
          rest = rest.slice(prefs[i][0].length);
          break;
        }
      }
    }
    var sufs = CODE_SUFFIX.slice().sort(function (a, b) { return b[0].length - a[0].length; });
    var sufSeg = null;
    for (var j = 0; j < sufs.length; j++) {
      var L = rest.length - sufs[j][0].length;
      if (L >= 2 && rest.lastIndexOf(sufs[j][0]) === rest.length - sufs[j][0].length) {
        sufSeg = { pos: 99, t: '-' + sufs[j][0] + '(' + sufs[j][1] + ')' };
        matched += sufs[j][0].length;
        rest = rest.slice(0, L);
        break;
      }
    }
    var hits = [];
    var rlist = CODE_ROOT.slice().sort(function (a, b) { return b[0].length - a[0].length; });
    for (var k = 0; k < rlist.length && hits.length < 2; k++) {
      var r = rlist[k];
      var at = rest.indexOf(r[0]);
      while (at >= 0) {
        var overlap = hits.some(function (h) { return at < h.end && at + r[0].length > h.start; });
        if (!overlap) {
          hits.push({ start: at, end: at + r[0].length, pos: at, t: r[0] + '(' + r[1] + ')' });
          roots.push(r[0]);
          matched += r[0].length;
          break;
        }
        at = rest.indexOf(r[0], at + 1);
      }
    }
    hits.forEach(function (h) { segs.push(h); });
    if (sufSeg) segs.push(sufSeg);
    segs.sort(function (a, b) { return a.pos - b.pos; });
    var hasRoot = hits.length > 0;
    if (!hasRoot && segs.length < 2) return null;
    if (matched < w.length * 0.5) return null;
    return { text: segs.map(function (s) { return s.t; }).join(' + '), roots: roots, matched: matched };
  } catch (e) { return null; }
}
/* 双解析择优：避免把 mission 误拆成 mis+sion 而丢掉词根 miss */
var codeMemo = {};
function parseCode(w) {
  if (w in codeMemo) return codeMemo[w];
  var a = parseOnce(w, true);
  var b = parseOnce(w, false);
  var score = function (p) { return p ? p.matched + p.roots.length * 0.5 : -1; };
  codeMemo[w] = score(b) > score(a) ? b : a;
  return codeMemo[w];
}
function wordCode(w) {
  var p = parseCode(w);
  return p ? p.text : '';
}

/* 同根词家族：共享词根的其它单词（记忆卡片里展示，举一反三） */
var familyMemo = {};
function wordFamily(w) {
  if (w in familyMemo) return familyMemo[w];
  var mine = parseCode(w);
  var fam = [];
  if (mine && mine.roots.length) {
    var myRoots = {};
    mine.roots.forEach(function (r) { myRoots[r] = 1; });
    for (var i = 0; i < ALL_WORDS.length && fam.length < 3; i++) {
      var it = ALL_WORDS[i];
      if (it.w === w) continue;
      var p = parseCode(it.w);
      if (!p) continue;
      var share = p.roots.some(function (r) { return myRoots[r]; });
      if (share) fam.push(it);
    }
  }
  familyMemo[w] = fam;
  return fam;
}

/* ========================= 每日学习计划 ========================= */
function dateKey(d) {
  var x = d || new Date();
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
}
function logAnswer(ok) {
  var k = dateKey();
  var lg = save.dailyLog[k] || (save.dailyLog[k] = { a: 0, c: 0 });
  lg.a++;
  if (ok) lg.c++;
  /* dailyLog 按天只增不减：超过 120 天裁掉最旧 key，防长玩档案膨胀 */
  var keys = Object.keys(save.dailyLog);
  if (keys.length > 120) {
    keys.sort();
    keys.slice(0, keys.length - 120).forEach(function (old) { delete save.dailyLog[old]; });
  }
}
function ensurePlanDay() {
  var t = new Date().toDateString();
  if (save.planDay.date !== t) {
    save.planDay = { date: t, done: 0, total: 0, complete: false };
  }
}
function countDue() {
  var now = Date.now(), n = 0;
  for (var w in save.mastery) {
    var m = save.mastery[w];
    if (m.seen > 0 && m.lv < 5 && m.due && m.due <= now) n++;
  }
  return n;
}
function buildPlanPool(ids, unitCtx) {
  var pool = buildPool(ids);
  var now = Date.now();
  var due = pool.filter(function (x) {
    var m = save.mastery[x.w];
    return m && m.seen > 0 && m.lv < 5 && m.due && m.due <= now;
  }).sort(function (a, b) { return save.mastery[a.w].due - save.mastery[b.w].due; }).slice(0, 12);
  var seenSet = {};
  due.forEach(function (x) { seenSet[x.w] = 1; });
  var fresh = [];
  /* 单元模式：新词严格按当前单元顺序推进 */
  var src = (unitCtx && unitCtx.words.length) ? unitCtx.words : pool;
  src.forEach(function (x) {
    if (fresh.length < (save.plan.target || 10) && !save.mastery[x.w] && !seenSet[x.w]) fresh.push(x);
    seenSet[x.w] = seenSet[x.w] || (!save.mastery[x.w] ? 1 : seenSet[x.w]);
  });
  /* 单元新词不够时从全库补足 */
  for (var i = 0; i < pool.length && fresh.length < (save.plan.target || 10); i++) {
    var x2 = pool[i];
    if (!save.mastery[x2.w] && !seenSet[x2.w]) { fresh.push(x2); seenSet[x2.w] = 1; }
  }
  var all = due.concat(fresh);
  if (all.length < 4) all = buildReviewPool(ids);
  return shuffle(all);
}
function renderPlan() {
  ensurePlanDay();
  var card = $('plan-card');
  var dueN = Math.min(countDue(), 12);
  var target = save.plan.target || 10;
  var pct = save.planDay.total ? Math.min(1, save.planDay.done / save.planDay.total) : 0;
  if (save.planDay.complete) pct = 1;
  $('plan-ring').style.strokeDashoffset = (182.2 * (1 - pct)).toFixed(1);
  $('plan-ring-text').textContent = Math.round(pct * 100) + '%';
  $('plan-desc').textContent = save.planDay.complete
    ? '✅ 今日计划已完成，明天再来！'
    : '复习 ' + dueN + ' 个到期词 + 学 ' + target + ' 个新词';
  var btn = $('btn-plan');
  if (save.planDay.complete) {
    card.classList.add('done');
    btn.textContent = '💪 再练一局';
  } else {
    card.classList.remove('done');
    btn.textContent = save.planDay.done > 0 ? '▶ 继续计划 (' + save.planDay.done + '/' + save.planDay.total + ')' : '▶ 开始计划';
  }
}
function startPlan() {
  var ids = (save.lastLists || []).filter(function (id) { return !!listById(id); });
  if (!ids.length) ids = ['cet4'];
  startRun('plan', ids, 'normal');
}

/* ========================= 记忆配对 ========================= */
var match = null;
var matchTimer = null;
function stopMatchTimer() {
  if (matchTimer) { clearInterval(matchTimer); matchTimer = null; }
}

function openMatch() {
  if (!buildEnc()) { showLoadFail(); return; }
  showScreen('scr-match');
  startMatch();
}
function startMatch() {
  var ids = (save.lastLists || []).filter(function (id) { return !!listById(id); });
  if (!ids.length) ids = ['cet4'];
  var pool = buildPool(ids);
  if (pool.length < 4) pool = buildPool(['cet4']);
  /* 优先低掌握 / 到期词 */
  var now = Date.now();
  var scored = pool.map(function (x) {
    var m = save.mastery[x.w];
    var s = !m ? -2 : (5 - m.lv) * -1 + (m.due && m.due <= now ? -2 : 0);
    return { x: x, s: s + Math.random() };
  }).sort(function (a, b) { return a.s - b.s; });
  var picks = scored.slice(0, 8).map(function (o) { return o.x; });

  var cards = [];
  picks.forEach(function (p) {
    cards.push({ key: p.w, text: p.w, kind: 'w', open: false, done: false });
    cards.push({ key: p.w, text: p.m, kind: 'm', open: false, done: false });
  });
  cards = shuffle(cards);
  match = { cards: cards, openIdx: [], matched: 0, moves: 0, lock: false, t0: Date.now(), finished: false, total: picks.length };
  renderMatch();
  if (matchTimer) { clearInterval(matchTimer); matchTimer = null; }
  matchTimer = setInterval(function () {
    if (!match || match.finished) return;
    $('match-time').textContent = '⏱ ' + Math.floor((Date.now() - match.t0) / 1000) + ' 秒';
  }, 1000);
}
function renderMatch() {
  var grid = $('match-grid');
  grid.innerHTML = '';
  match.cards.forEach(function (c, i) {
    var d = document.createElement('div');
    d.className = 'mcard' + (c.open ? ' open' : '') + (c.done ? ' done' : '');
    d.innerHTML = '<div class="mcard-inner">' +
      '<div class="mcard-face mcard-back">🎴</div>' +
      '<div class="mcard-face mcard-front' + (c.kind === 'm' ? ' meaning' : '') + '">' + c.text + '</div>' +
      '</div>';
    grid.appendChild(d);
  });
  $('match-moves').textContent = '👟 步数 ' + match.moves;
  $('match-pairs').textContent = '🧩 ' + match.matched + '/' + match.total + ' 对';
}
/* 配对成功共享逻辑（点击翻转与拖拽撞击共用；掌握度 seen++ 语义与原版一致） */
function matchPairSuccess(a, b) {
  a.done = b.done = true;
  a.open = b.open = false;
  match.matched++;
  save.mastery[a.key] ? save.mastery[a.key].seen++ : (save.mastery[a.key] = { lv: 0, seen: 1, ok: 0, wrong: 0, last: Date.now(), due: 0, wrongStreak: 0 });
  Sfx.correct(2 + match.matched);
  TTS.speak(a.key, true);
  persist();
  if (match.matched >= match.total) finishMatch();
}
function onMatchCard(i) {
  if (!match || match.lock || match.finished) return;
  var c = match.cards[i];
  if (c.open || c.done) return;
  c.open = true;
  match.openIdx.push(i);
  if (match.openIdx.length === 2) {
    match.moves++;
    var a = match.cards[match.openIdx[0]], b = match.cards[match.openIdx[1]];
    if (a.key === b.key && a.kind !== b.kind) {
      match.openIdx = [];
      matchPairSuccess(a, b);
    } else {
      match.lock = true;
      Sfx.tone(200, .12, 'sine', 0, .05);
      setTimeout(function () {
        if (!match) return;
        a.open = false; b.open = false;
        match.openIdx = [];
        match.lock = false;
        /* 换屏后旧回调不再触碰隐藏屏 DOM（状态照常清理，防锁死） */
        if ($('scr-match').classList.contains('active')) renderMatch();
      }, 750);
    }
  }
  renderMatch();
}

/* ---------- 记忆配对：拖拽撞击配对（点击翻牌仍可用） ----------
   pointerdown 记牌 → 移动超 8px 视为拖拽（浮起跟手幽灵卡）→
   松手落在另一张卡上：同词异类 = 直接配对成功；否则亮出对方 0.75s 弹回。 */
var matchDrag = null;
function matchDragTargetAt(x, y, self) {
  var nodes = $('match-grid').querySelectorAll('.mcard');
  for (var k = 0; k < nodes.length; k++) {
    var r = nodes[k].getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return k === self ? -1 : k;
  }
  return -1;
}
function tryDragPair(i, t) {
  if (!match || match.finished) return;
  var a = match.cards[i], b = match.cards[t];
  if (!a || !b || a.done || b.done || a === b) return;
  if (a.key === b.key && a.kind !== b.kind) {
    match.moves++;
    matchPairSuccess(a, b);
    var el = $('match-grid').children[t];
    if (el) {
      var r = el.getBoundingClientRect();
      Confetti.burst(14, r.left + r.width / 2, r.top + r.height / 2);
    }
    renderMatch();
  } else {
    match.moves++;
    match.lock = true;
    Sfx.tone(200, .12, 'sine', 0, .05);
    b.open = true;
    renderMatch();
    setTimeout(function () {
      if (!match) return;
      b.open = false;
      /* 目标牌若原本经点击翻开（在 openIdx 里），翻回时同步清掉，避免 openIdx 残留幽灵牌 */
      var oi = match.openIdx.indexOf(t);
      if (oi >= 0) match.openIdx.splice(oi, 1);
      match.lock = false;
      if ($('scr-match').classList.contains('active')) renderMatch();
    }, 750);
  }
}
function bindMatchDrag() {
  var grid = $('match-grid');
  if (!grid) return;
  grid.addEventListener('pointerdown', function (e) {
    if (!match || match.finished || match.lock) return;
    var el = e.target.closest('.mcard');
    if (!el) return;
    var i = Array.prototype.indexOf.call(grid.querySelectorAll('.mcard'), el);
    if (i < 0) return;
    var c = match.cards[i];
    if (c.open || c.done) return;
    matchDrag = { i: i, x0: e.clientX, y0: e.clientY, moved: false, ghost: null, pid: e.pointerId };
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
  });
  grid.addEventListener('pointermove', function (e) {
    var st = matchDrag;
    if (!st || e.pointerId !== st.pid) return;
    if (!st.moved && Math.abs(e.clientX - st.x0) + Math.abs(e.clientY - st.y0) < 8) return;
    if (!st.moved) {
      st.moved = true;
      var src = grid.children[st.i];
      if (src) src.classList.add('drag-src');
      var g = document.createElement('div');
      g.className = 'mcard-ghost' + (match.cards[st.i].kind === 'm' ? ' meaning' : '');
      g.textContent = match.cards[st.i].text;
      document.body.appendChild(g);
      st.ghost = g;
    }
    if (st.ghost) {
      st.ghost.style.left = (e.clientX - 42) + 'px';
      st.ghost.style.top = (e.clientY - 32) + 'px';
    }
    var t = matchDragTargetAt(e.clientX, e.clientY, st.i);
    for (var k = 0; k < grid.children.length; k++) {
      grid.children[k].classList.toggle('drop-hint', k === t);
    }
  });
  grid.addEventListener('pointerup', function (e) { matchDragFinish(e, false); });
  grid.addEventListener('pointercancel', function (e) { matchDragFinish(e, true); });
}
function matchDragFinish(e, cancelled) {
  var st = matchDrag;
  if (!st || e.pointerId !== st.pid) return;
  matchDrag = null;
  var grid = $('match-grid');
  for (var k = 0; k < grid.children.length; k++) {
    grid.children[k].classList.remove('drop-hint', 'drag-src');
  }
  if (st.ghost) st.ghost.remove();
  if (cancelled || !st.moved) {
    if (!cancelled) onMatchCard(st.i);   /* 没怎么动 = 点击翻牌 */
    return;
  }
  var t = matchDragTargetAt(e.clientX, e.clientY, st.i);
  if (t >= 0) tryDragPair(st.i, t);
}
/* 拖拽兜底清理：息屏/切后台时部分浏览器不派发 pointerup/pointercancel，
   ghost 节点（position:fixed）会永久挂在 body 上随长玩累积 */
function matchDragAbort() {
  if (!matchDrag) return;
  var st = matchDrag;
  matchDrag = null;
  if (st.ghost) { try { st.ghost.remove(); } catch (e) {} }
  var grid = $('match-grid');
  if (grid) {
    for (var k = 0; k < grid.children.length; k++) grid.children[k].classList.remove('drop-hint', 'drag-src');
  }
}
document.addEventListener('visibilitychange', function () { if (document.hidden) matchDragAbort(); });
window.addEventListener('pagehide', matchDragAbort);
function finishMatch() {
  match.finished = true;
  stopMatchTimer();
  var secs = Math.floor((Date.now() - match.t0) / 1000);
  var coins = match.total * 3 + Math.max(0, 80 - secs);
  save.coins += coins;
  checkAch();
  persist();
  Sfx.levelup();
  Confetti.burst(80);
  toast('🃏 配对完成！' + match.moves + ' 步 / ' + secs + ' 秒，奖励 🪙' + coins);
  $('match-time').textContent = '⏱ ' + secs + ' 秒';
}

/* ========================= 词根合成实验室 =========================
   用「词汇密码」的拆解数据出题，10 题一轮，两种题型随机混合：
   🔍 拆解题：给出单词+释义，选出它真正的词根（只练拆解，不写学习进度）
   ⚗️ 合成题：给出前缀+词根(+后缀)零件，选出由这些零件组成的单词——
      本质是一次「看拆解认词」的复习，按作答结果写入 SRS（updateMastery）。
   答对得金币与 EXP，连对有加成，10 题全对另有全对大奖。 */
var lab = null;
var LAB_TOTAL = 10;
var labPoolMemo = null;
function labPool() {   /* 有拆解结果、有释义的内置词 */
  if (labPoolMemo) return labPoolMemo;
  labPoolMemo = [];
  ALL_WORDS.forEach(function (it) {
    var m = MEANING_OF[it.w];
    if (!m) return;
    var p = parseCode(it.w);
    if (p && p.roots.length && p.roots.length <= 2) labPoolMemo.push({ w: it.w, m: m, p: p });
  });
  return labPoolMemo;
}
function labRootMean(root) {
  var mean = '';
  CODE_ROOT.forEach(function (r) { if (r[0] === root) mean = r[1]; });
  return mean;
}
function labQuestion() {
  var pool = labPool();
  var it = pool[Math.floor(Math.random() * pool.length)];
  var root = it.p.roots[0];
  var q = { w: it.w, m: it.m, p: it.p, root: root, rootMean: labRootMean(root), locked: false };
  if (Math.random() < 0.5) {
    q.kind = 'split';
    var opts = [{ t: root, mean: q.rootMean, ok: true }];
    var guard = 0;
    while (opts.length < 4 && guard++ < 300) {
      var r2 = rnd(CODE_ROOT);
      if (r2[0] === root || opts.some(function (o) { return o.t === r2[0]; })) continue;
      opts.push({ t: r2[0], mean: r2[1], ok: false });
    }
    shuffle(opts);
    q.options = opts;
  } else {
    q.kind = 'merge';
    var opts2 = [{ w: it.w, ok: true }];
    var guard2 = 0;
    while (opts2.length < 4 && guard2++ < 400) {
      var w2 = pool[Math.floor(Math.random() * pool.length)];
      if (w2.w === it.w || opts2.some(function (o) { return o.w === w2.w; })) continue;
      /* 干扰项不能含正确答案的词根，否则「零件组成」无从排除 */
      var clash = w2.p.roots.some(function (r) { return it.p.roots.indexOf(r) >= 0; });
      if (clash) continue;
      opts2.push({ w: w2.w, ok: false });
    }
    shuffle(opts2);
    q.options = opts2;
  }
  for (var i = 0; i < q.options.length; i++) { if (q.options[i].ok) q.answer = i; }
  return q;
}
function openLab() {
  if (!buildEnc()) { showLoadFail(); return; }
  showScreen('scr-lab');
  $('lab-play').hidden = true;
  $('lab-done').hidden = true;
  $('lab-intro').hidden = false;
  $('btn-lab-start').hidden = false;
}
function startLab() {
  lab = { round: 0, ok: 0, streak: 0, maxStreak: 0, score: 0, coins: 0, q: null, locked: false };
  $('lab-intro').hidden = true;
  $('lab-done').hidden = true;
  $('lab-play').hidden = false;
  $('btn-lab-start').hidden = true;
  labNext();
}
function labNext() {
  if (!lab) return;
  if (lab.round >= LAB_TOTAL) { labFinish(); return; }
  lab.q = labQuestion();
  lab.locked = false;
  var q = lab.q;
  $('lab-round').textContent = '🧪 第 ' + (lab.round + 1) + '/' + LAB_TOTAL + ' 题';
  $('lab-streak').textContent = '🔥 连对 ' + lab.streak;
  $('lab-ok').textContent = '✅ 答对 ' + lab.ok;
  $('lab-score').textContent = lab.score + ' 分';
  $('lab-feedback').hidden = true;
  $('btn-lab-next').hidden = true;
  $('lab-opts').innerHTML = '';
  $('lab-opts').className = 'q-options lab-opts';
  $('lab-kind').textContent = q.kind === 'split' ? '🔍 拆解挑战：这个词里藏着哪个词根？' : '⚗️ 合成挑战：哪位单词由这些零件组成？';
  if (q.kind === 'split') {
    $('lab-word').hidden = false;
    $('lab-word').textContent = q.w;
    $('lab-mean').hidden = false;
    $('lab-mean').textContent = q.m;
    $('lab-pieces').hidden = true;
  } else {
    $('lab-word').hidden = true;   /* 合成题：单词就是答案，不能先亮出来 */
    $('lab-word').textContent = '';
    $('lab-mean').hidden = true;
    $('lab-mean').textContent = '';
    $('lab-pieces').hidden = false;
    $('lab-pieces').textContent = '🧩 ' + q.p.text;
  }
  q.options.forEach(function (opt, i) {
    var b = document.createElement('button');
    b.className = 'q-opt';
    b.dataset.i = String(i);
    b.innerHTML = '<i class="key-num">' + (i + 1) + '</i>' + (q.kind === 'split' ? opt.t + ' · ' + opt.mean : opt.w);
    $('lab-opts').appendChild(b);
  });
}
function labAnswer(i) {
  if (!lab || lab.locked || !lab.q) return;
  lab.locked = true;
  var q = lab.q;
  var ok = i === q.answer;
  save.stats.labN = (save.stats.labN || 0) + 1;
  var btns = $('lab-opts').children;
  var fb = '';
  if (ok) {
    lab.ok++;
    lab.streak++;
    lab.maxStreak = Math.max(lab.maxStreak, lab.streak);
    save.stats.labOk = (save.stats.labOk || 0) + 1;
    var gain = 3 + (lab.streak % 5 === 0 ? 5 : 0);   /* 连对每满 5 额外 +5🪙 */
    save.coins += gain;
    lab.coins += gain;
    lab.score += 10 + lab.streak * 2;
    addXp(2);
    bumpTask('lab_ok');
    btns[q.answer].classList.add('correct');
    Sfx.correct(lab.streak);
    Sfx.coin();
    fb = '✅ 拆对了！<b>' + q.w + '</b> = ' + q.p.text + '<br>' + q.m + '　🪙+' + gain;
    if (q.kind === 'merge') updateMastery(q.w, true, false);   /* 合成题：认出了这个词，写入 SRS */
  } else {
    lab.streak = 0;
    btns[i].classList.add('wrong');
    btns[q.answer].classList.add('correct');
    Sfx.wrong();
    fb = '❌ 正确答案是 <b>' + (q.kind === 'split' ? q.root + '（' + q.rootMean + '）' : q.w) + '</b><br><b>' + q.w + '</b> = ' + q.p.text + '<br>' + q.m;
    if (q.kind === 'merge') updateMastery(q.w, false, false);
  }
  if (typeof TTS !== 'undefined') TTS.speak(q.w, false);   /* 揭底时读一遍，听音强化 */
  $('lab-streak').textContent = '🔥 连对 ' + lab.streak;
  $('lab-ok').textContent = '✅ 答对 ' + lab.ok;
  $('lab-score').textContent = lab.score + ' 分';
  $('lab-feedback').innerHTML = fb;
  $('lab-feedback').hidden = false;
  $('btn-lab-next').hidden = false;
  $('btn-lab-next').textContent = lab.round + 1 >= LAB_TOTAL ? '🏁 查看成绩' : '➡️ 下一题';
  persist();
  checkAch();
}
function labFinish() {
  var perfect = lab.ok >= LAB_TOTAL;
  var bonus = 0;
  if (perfect) {
    bonus = 20;
    save.coins += bonus;
    lab.coins += bonus;
    lab.score += 50;
    Confetti.burst(80);
    Sfx.levelup();
  }
  $('lab-play').hidden = true;
  $('lab-done').hidden = false;
  $('lab-done-text').innerHTML = '本轮 ' + lab.ok + '/' + LAB_TOTAL + ' 题答对 · 最高连对 ' + lab.maxStreak +
    '<br>获得 🪙' + lab.coins + (perfect ? '　🏆 全对大奖 🪙' + bonus + ' +50 分！' : '') +
    '<br><span class="hint">合成题的作答已写入学习进度（间隔重复照常调度）</span>';
  persist();
}
function labNextOrFinish() {
  if (!lab) return;
  lab.round++;
  labNext();
}

/* ========================= 学习统计图表（Canvas） ========================= */
function drawStats() {
  var cv = $('stats-canvas');
  if (!cv) return;
  var dpr = window.devicePixelRatio || 1;
  var W = cv.clientWidth || 500, H = 260;
  cv.width = W * dpr; cv.height = H * dpr;
  var c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);
  c.font = '10px sans-serif';

  /* 顶：12 周学习热力图 */
  c.fillStyle = 'rgba(255,255,255,.5)';
  c.fillText('学习热力图（近 12 周）', 10, 12);
  var cell = Math.min(12, Math.floor((W - 80) / 12) - 2);
  var gap = 2;
  var levels = ['rgba(255,255,255,.08)', 'rgba(124,92,255,.35)', 'rgba(124,92,255,.6)', '#7c5cff', '#a48bff'];
  for (var wk = 0; wk < 12; wk++) {
    for (var dw = 0; dw < 7; dw++) {
      var offsetDays = (11 - wk) * 7 + (6 - dw);
      var day = new Date(Date.now() - offsetDays * 864e5);
      var a = (save.dailyLog[dateKey(day)] || { a: 0 }).a;
      var li = a === 0 ? 0 : (a < 6 ? 1 : (a < 16 ? 2 : (a < 31 ? 3 : 4)));
      c.fillStyle = levels[li];
      c.fillRect(10 + wk * (cell + gap), 20 + dw * (cell + gap), cell, cell);
      if (offsetDays === 0) {
        c.strokeStyle = '#3ddc84';
        c.lineWidth = 1.5;
        c.strokeRect(9.5 + wk * (cell + gap), 19.5 + dw * (cell + gap), cell + 1, cell + 1);
      }
    }
  }
  var lx = 10 + 12 * (cell + gap) + 4;
  ['少', '', '', '', '多'].forEach(function (t, li) {
    c.fillStyle = levels[li];
    c.fillRect(lx, 22 + li * (cell + gap), cell * 0.7, cell * 0.7);
    if (t) { c.fillStyle = 'rgba(255,255,255,.45)'; c.fillText(t, lx + cell * 0.7 + 3, 22 + li * (cell + gap) + cell * 0.65); }
  });

  /* 下左：近 7 天答题柱状图 */
  var yTop = 130;
  var days = [], maxA = 1;
  for (var i = 6; i >= 0; i--) {
    var d = new Date(Date.now() - i * 864e5);
    var lg = save.dailyLog[dateKey(d)] || { a: 0, c: 0 };
    days.push({ d: d, lg: lg });
    maxA = Math.max(maxA, lg.a);
  }
  var bw = Math.max(6, Math.floor(W * 0.5 / 7) - 5), gap2 = 5, x0 = 10;
  c.fillStyle = 'rgba(255,255,255,.5)';
  c.fillText('近 7 天答题', x0, yTop);
  days.forEach(function (day, idx) {
    var h = day.lg.a ? Math.max(3, day.lg.a / maxA * 76) : 2;
    var x = x0 + idx * (bw + gap2);
    c.fillStyle = idx === 6 ? '#3ddc84' : (day.lg.a ? '#7c5cff' : 'rgba(255,255,255,.12)');
    c.fillRect(x, yTop + 88 - h, bw, h);
    var wd = '日一二三四五六'[day.d.getDay()];
    c.fillStyle = idx === 6 ? '#3ddc84' : 'rgba(255,255,255,.4)';
    c.fillText(wd, x - 1, yTop + 102);
    if (day.lg.a) {
      c.fillStyle = 'rgba(255,255,255,.7)';
      c.fillText(day.lg.a, x - 3, yTop + 88 - h - 3);
    }
  });

  /* 下右：掌握度分布环形图 */
  var buckets = [0, 0, 0];
  ALL_WORDS.forEach(function (it) {
    var m = save.mastery[it.w];
    if (!m || m.seen === 0) buckets[0]++;
    else if (m.lv >= 5) buckets[2]++;
    else buckets[1]++;
  });
  var cx = W - 62, cy = yTop + 52, r = 34;
  var colors = ['rgba(255,255,255,.15)', '#7c5cff', '#ffd166'];
  var total = buckets[0] + buckets[1] + buckets[2];
  var ang = -Math.PI / 2;
  buckets.forEach(function (n, bi) {
    if (!n) return;
    var a2 = ang + n / total * Math.PI * 2;
    c.beginPath();
    c.moveTo(cx, cy);
    c.arc(cx, cy, r, ang, a2);
    c.closePath();
    c.fillStyle = colors[bi];
    c.fill();
    ang = a2;
  });
  c.beginPath();
  c.arc(cx, cy, 20, 0, Math.PI * 2);
  c.fillStyle = '#1c1650';
  c.fill();
  c.fillStyle = '#ffd166';
  c.font = 'bold 13px sans-serif';
  c.textAlign = 'center';
  c.fillText(buckets[2], cx, cy + 1);
  c.fillStyle = 'rgba(255,255,255,.55)';
  c.font = '9px sans-serif';
  c.fillText('已掌握', cx, cy + 12);
  c.textAlign = 'left';
  var legend = [['未学习', colors[0]], ['学习中', colors[1]], ['已掌握', colors[2]]];
  legend.forEach(function (l, li) {
    c.fillStyle = l[1];
    c.fillRect(W - 118, yTop + 96 + li * 7 - 46 + li * 7, 8, 8);
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.fillText(l[0] + ' ' + buckets[li], W - 106, yTop + 96 - 40 + li * 14);
  });
  c.fillStyle = 'rgba(255,255,255,.5)';
  c.fillText('掌握度分布', W - 118, yTop);
}

/* ========================= 连击爆发 ========================= */
function comboBurst() {
  var bonus = Math.round((10 + run.combo) * coinMult());
  save.coins += bonus;
  run.coinsEarned += bonus;
  if (run.mode === 'adventure' || run.mode === 'endless' || run.mode === 'expedition') addPressure(-8);
  Sfx.levelup();
  fx('⚡ 勇者爆发！+' + bonus + '🪙 生命+2', 'good', 50, 16);
  /* 全屏金色冲击波从战场中心扩散 */
  var d = document.createElement('div');
  d.className = 'fx-ring gold center-burst';
  $('fx-layer').appendChild(d);
  setTimeout(function () { d.remove(); }, 560);
  var bf = document.querySelector('.battlefield');
  if (bf) {
    bf.classList.remove('flash');
    void bf.offsetWidth;
    bf.classList.add('flash');
    setTimeout(function () { bf.classList.remove('flash'); }, 550);
  }
}

/* ========================= 掌握度 & 打卡 ========================= */
function getM(w) {
  return save.mastery[w] || (save.mastery[w] = { lv: 0, seen: 0, ok: 0, wrong: 0, last: 0, due: 0, wrongStreak: 0 });
}
function updateMastery(w, ok, retried) {
  var m = getM(w);
  m.seen++; m.last = Date.now();
  if (m.ease === undefined) m.ease = 2.0;
  if (ok) {
    m.ok++; m.lv = Math.min(5, m.lv + 1);
    /* 一次答对 → 间隔系数变长；重考后才答对 → 不加长 */
    if (!retried) m.ease = Math.min(2.8, m.ease + 0.05);
    m.due = Date.now() + IV_MIN[m.lv] * 60000 * m.ease;
    m.wrongStreak = 0;
  } else {
    m.wrong++; m.lv = Math.max(0, m.lv - 1);
    m.ease = Math.max(1.2, m.ease - 0.25);
    m.due = Date.now();
    m.wrongStreak = (m.wrongStreak || 0) + 1;
  }
}
function bumpToday() {
  var st = save.streak;
  var today = new Date().toDateString();
  if (st.last !== today) {
    var yest = new Date(Date.now() - 864e5).toDateString();
    st.count = (st.last === yest) ? st.count + 1 : 1;
    st.last = today; st.todayCount = 0;
  }
  st.todayCount++;
}

/* ========================= 词池 ========================= */
function allLists() { return WORD_LISTS.concat(save.customLists); }
function listById(id) {
  var found = null;
  allLists().some(function (l) { if (l.id === id) { found = l; return true; } });
  return found;
}
function buildPool(listIds) {
  var pool = [];
  listIds.forEach(function (id) {
    var l = listById(id);
    if (l) l.words.forEach(function (p) { pool.push({ w: p[0], m: p[1] }); });
  });
  return pool;
}

/* ========================= 单元制（像背单词书一样按单元推进新词） ========================= */
var UNIT_SIZE = 20;
function unitWords(listId, idx) {
  var l = listById(listId);
  if (!l) return [];
  var arr = l.words.slice(idx * UNIT_SIZE, (idx + 1) * UNIT_SIZE);
  return arr.map(function (p) { return { w: p[0], m: p[1] }; });
}
function unitCount(listId) {
  var l = listById(listId);
  return l ? Math.ceil(l.words.length / UNIT_SIZE) : 0;
}
function unitLearned(listId, idx) {
  return unitWords(listId, idx).filter(function (x) {
    var m = save.mastery[x.w];
    return m && m.seen > 0;
  }).length;
}
/* 当前本局生效的单元上下文（startRun 时解析） */
var setupUnit = { listId: '', mode: 'none', idx: 0 };

function resolveUnitCtx(ids) {
  var primary = null;
  ids.some(function (id) { if (WORD_LISTS.some(function (l) { return l.id === id; })) { primary = id; return true; } });
  if (!primary || save.unitMode === 'none') return { listId: '', mode: 'none', idx: 0, words: [] };
  var idx = save.unitMode === 'auto' ? (save.unit[primary] || 0) : (parseInt(save.unitMode, 10) - 1);
  idx = Math.max(0, Math.min(idx, unitCount(primary) - 1));
  return { listId: primary, mode: save.unitMode, idx: idx, words: unitWords(primary, idx) };
}
/* 单元全部见过 → 自动解锁下一单元 */
function checkUnitAdvance() {
  if (!run || !run.unitCtx || run.unitCtx.mode !== 'auto' || !run.unitCtx.listId) return;
  var listId = run.unitCtx.listId;
  var idx = save.unit[listId] || 0;
  if (idx >= unitCount(listId) - 1) return;
  var words = unitWords(listId, idx);
  var allSeen = words.every(function (x) { var m = save.mastery[x.w]; return m && m.seen > 0; });
  if (allSeen) {
    save.unit[listId] = idx + 1;
    run.unitCtx.idx = idx + 1;
    run.unitCtx.words = unitWords(listId, idx + 1);
    run.unitSet = {};
    run.unitCtx.words.forEach(function (x) { run.unitSet[x.w] = 1; });
    persist();
    toast('📔 Unit ' + (idx + 1) + ' 全部学过！自动进入 Unit ' + (idx + 2));
    Confetti.burst(36);
  }
}
function buildReviewPool(listIds) {
  var all = buildPool(listIds);
  var seen = all.filter(function (x) { var m = save.mastery[x.w]; return m && m.seen > 0 && m.lv < 5; });
  if (seen.length >= 4) return seen;
  var anySeen = all.filter(function (x) { var m = save.mastery[x.w]; return m && m.seen > 0; });
  if (anySeen.length >= 4) return anySeen;
  return all;
}

/* ========================= 主题挑战包（内置词典按主题筛选，主界面可选） =========================
   词池为显式注入（同投毒通道），答题照常走 updateMastery，学习进度与 SRS 完全互通 */
var ROOT_PACK_ROOTS = ['spect', 'port', 'dict', 'ject', 'duct', 'tract', 'form', 'mit', 'miss',
  'fer', 'pos', 'pon', 'sist', 'tain', 'vert', 'vers', 'scrip', 'struct', 'press', 'aud', 'vis', 'vid', 'cur', 'rupt', 'cap'];
var PACK_CAP = 120;    /* 词根家族包上限 */
var PAIR_PACK_PAIRS = 30;  /* 易混淆对包的对数 */

/* 词根家族：同根词按家族聚合（port/spect/dict…一次吃透一串词） */
function buildRootsPack() {
  var fam = {}, seen = {}, n = 0;
  ALL_WORDS.forEach(function (it) {
    if (seen[it.w]) return;
    var p = parseCode(it.w);
    if (!p) return;
    for (var i = 0; i < p.roots.length; i++) {
      if (ROOT_PACK_ROOTS.indexOf(p.roots[i]) >= 0) {
        (fam[p.roots[i]] = fam[p.roots[i]] || []).push(it);
        seen[it.w] = 1;
        n++;
        break;
      }
    }
  });
  /* 按家族规模从大到小聚合排列，学起来成串 */
  var out = [];
  Object.keys(fam).sort(function (a, b) { return fam[b].length - fam[a].length; }).forEach(function (r) {
    fam[r].forEach(function (it) { out.push({ w: it.w, m: it.m }); });
  });
  return out.slice(0, PACK_CAP);
}

/* 易混淆对：形近词（同长度恰 1 位字母不同）+ 变位词（同字母重排）成对打包 */
function confusablePair(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    if (a.charAt(i) !== b.charAt(i)) { diff++; if (diff > 1) return false; }
  }
  return diff === 1;
}
function buildConfusePack() {
  var byLen = {}, ana = {}, picked = [], used = {};
  ALL_WORDS.forEach(function (it) {
    if (!/^[a-z]{4,10}$/.test(it.w)) return;
    (byLen[it.w.length] = byLen[it.w.length] || []).push(it.w);
    var k = it.w.split('').sort().join('');
    (ana[k] = ana[k] || []).push(it.w);
  });
  var pairs = [];
  Object.keys(byLen).forEach(function (L) {
    var arr = byLen[L];
    for (var i = 0; i < arr.length; i++) {
      for (var j = i + 1; j < arr.length; j++) {
        if (confusablePair(arr[i], arr[j])) pairs.push([arr[i], arr[j]]);
      }
    }
  });
  Object.keys(ana).forEach(function (k) {
    if (ana[k].length > 1) pairs.push([ana[k][0], ana[k][1]]);
  });
  for (var i = 0; i < pairs.length && picked.length < PAIR_PACK_PAIRS * 2; i++) {
    [pairs[i][0], pairs[i][1]].forEach(function (w) {
      if (picked.length >= PAIR_PACK_PAIRS * 2 || used[w]) return;
      used[w] = 1;
      picked.push({ w: w, m: MEANING_OF[w] || '' });
    });
  }
  return picked.filter(function (x) { return x.m; });
}

/* 高频核心 / 学术词族：种子词表 × 内置词典取交集（构建器内再过滤一次兜底） */
var CORE_PACK_SEED = ["ability","absorb","access","account","achieve","acquire","adjust","admire","advance","advantage","advice","afford","agree","agriculture","alarm","ancient","announce","annoy","apologize","appear","appetite","apply","appreciate","approach","argue","arrange","arrest","artist","aspect","assess","assist","assume","attach","attempt","attend","attract","audience","authority","available","avoid","awake","award","aware","balance","ban","band","bargain","barrier","beam","behalf","benefit","betray","blame","blend","board","boost","border","bounce","brand","breath","brief","broad","budget","burst","campaign","candidate","capacity","capture","carbon","caution","celebrate","ceremony","chain","challenge","channel","chapter","character","charge","chase","cheat","cherish","chief","cite","climate","coach","collapse","colleague","combine","command","comment","commerce","communicate","compare","compensate","compete","complain","complete","concentrate","concern","conclude","concrete","confidence","confirm","confuse","connect","conquer","consent","consequence","consider","construct","consult","consume","contact","contain","contemporary","contest","context","continue","contract","contrary","contrast","contribute","convention","convince","cooperate","coordinate","corporate","correct","council","crash","credit","crime","crisis","criterion","crowd","crucial","cultivate","curious","current","customer","cycle","damage","debate","debt","decade","decide","decline","decorate","decrease","dedicate","defeat","defend","definite","degree","delay","delegate","delicate","deliver","demand","democracy","demonstrate","dense","deny","depart","depend","deposit","deprive","describe","deserve","desire","detect","develop","devote","diagnose","differ","digital","dilemma","diminish","diplomat","disable","disappear","disaster","discipline","disclose","discount","discover","discuss","disease","dismiss","disorder","display","distance","distinct","distinguish","distribute","diverse","divide","divorce","dominate","dramatic","drift","eager","earn","economic","economy","edition","educate","effect","efficient","effort","elaborate","element","eliminate","embarrass","emerge","emergency","emit","emotion","emphasize","employ","enable","encounter","encourage","endure","engage","engine","enormous","ensure","enterprise","entertain","enthusiasm","entitle","environment","equip","essential","establish","estimate","evaluate","eventually","evidence","evolution","exaggerate","examine","exceed","excellent","exchange","exclude","execute","exhaust","exhibit","exist","expand","expect","expense","experience","experiment","expert","explode","exploit","explore","express","extend","external","extraordinary","fabric","facilitate","factor","faculty","fade","fail","faint","faith","fake","favor","feature","federal","feedback","female","fiber","figure","finance","firm","flexible","flourish","focus","forecast","foreign","forge","formal","fortunate","fossil","foster","frame","fraud","frequent","friction","frontier","frustrate","function","fund","furious","furnish","furthermore","future","gallery","gather","generate","generous","genuine","glance","gloomy","grain","grand","grant","graphic","grasp","grateful","grave","gravity","greed","grief","guarantee","guilt","habit","halt","handle","harbor","harmony","haste","hazard","headline","heal","heap","hesitate","hierarchy","highlight","hinder","hollow","holy","horizon","household","humble","identify","ideology","ignorance","illustrate","imagine","imitate","immense","impact","implement","imply","impose","impress","improve","impulse","increase","incur","independent","indicate","indifferent","individual","industrial","inevitable","infect","infer","influence","infrastructure","inherit","initial","inject","innocent","innovation","input","inquire","insect","insert","inspire","install","instinct","institute","instruct","instrument","insult","insurance","integrate","intellect","intelligent","intend","intense","interact","interfere","internal","interpret","interrupt","interval","intervene","interview","intimate","invade","invest","investigate","invite","involve","isolate","issue","item","jail","jealous","joint","judge","junction","junior","jury","keen","kidnap","label","launch","layer","layout","league","lean","legend","legislation","legitimate","leisure","lens","liable","liberal","liberty","license","linger","link","literal","literature","loan","lobby","locate","logic","lonely","loose","lounge","luxury","magnet","magnificent","maintain","majority","manage","manifest","manipulate","manner","manufacture","margin","marine","mask","massive","mature","mechanism","medal","media","mediate","medium","melt","memorial","mental","mention","merchant","mercy","merge","merit","method","military","minor","miracle","mirror","misery","missile","mission","mobile","mode","moderate","modest","modify","monitor","monopoly","mood","moral","motion","motivate","mount","mourn","municipal","murder","muscle","mutual","mystery","myth","necessary","negative","negotiate","nerve","nervous","network","neutral","normal","notable","notion","nuclear","nurture","obligation","observe","obstacle","obtain","obvious","occupy","occur","offensive","offer","omit","opinion","opponent","opportunity","oppose","option","orbit","orchard","organic","organize","orient","origin","original","ornament","outcome","outline","outrage","outstanding","overcome","overhead","overlook","overturn","overwhelm","owe","ownership","oxygen","pact","panel","parade","paragraph","parallel","parcel","parliament","participate","partner","passion","passive","passport","patent","patience","pattern","pause","peak","penalty","pension","perceive","perform","permanent","permission","permit","persist","personnel","perspective","persuade","pessimistic","petition","phenomenon","philosophy","physical","physician","planet","plausible","plead","plot","poison","policy","polish","politician","pollute","ponder","portion","portrait","portray","positive","possess","possibility","postage","postpone","potential","poverty","practice","praise","precaution","precede","precious","precise","predict","prefer","prejudice","preliminary","premise","premium","prescribe","presence","preserve","prestige","prevail","prevent","previous","prey","primary","prime","primitive","principal","principle","prior","priority","privacy","privilege","probe","procedure","proceed","process","profession","professor","profile","profit","profound","progress","prohibit","project","prolong","prominent","promise","promote","prompt","prone","pronounce","proof","property","proportion","proposal","propose","prospect","prosper","protect","protein","protest","provide","provoke","publish","punctual","punish","purchase","pure","purpose","pursue","quality","quantity","quest","questionnaire","queue","quote","racial","radiate","random","rational","raw","readily","realistic","rebel","receipt","receive","reception","recipe","recite","recognize","recommend","recover","recruit","recycle","refine","reflect","reform","refuge","refuse","region","register","regulate","reign","reinforce","reject","relax","release","relevant","reluctant","rely","remain","remark","remedy","remind","remote","render","renew","rent","repair","replace","reproduce","republic","reputation","request","require","rescue","resemble","reserve","reside","resign","resolve","resort","respective","respond","restore","restrain","restrict","result","resume","retail","retain","retreat","reveal","revenue","reverse","review","revise","revolve","reward","rhythm","ribbon","ridiculous","rigid","rigorous","ritual","rival","robust","rocket","romantic","rotate","rough","route","routine","royal","ruin","rumor","rural","rust","sacrifice","salary","sample","sanction","satellite","satisfy","saturate","savage","scatter","scheme","scope","scout","scramble","script","scrutiny","sculpture","seal","secondary","secret","section","sector","secure","segment","seize","semester","sensation","sequence","series","serious","session","settle","severe","shabby","shade","share","shatter","shelter","shield","shift","shortage","shrink","siege","signal","significant","similar","sincere","sketch","skilled","slave","sleeve","slender","slide","slim","smash","soar","sole","solemn","solid","solution","solve","sophisticated","sore","sorrow","source","span","spare","sphere","spill","spin","spite","splash","split","spoil","sponsor","spontaneous","spouse","stable","staff","stagger","stain","stake","stale","standpoint","statement","status","steady","steep","steer","stem","stern","stiff","stimulate","sting","stir","stock","storage","strategy","stream","stress","strict","strive","studio","stuff","stumble","submit","subordinate","subscribe","subsequent","subsidy","substance","substantial","substitute","subtle","suburb","succeed","sufficient","summit","summon","superb","superior","supplement","support","suppose","suppress","supreme","surge","surplus","surround","survey","survive","suspect","sustain","swallow","swamp","swap","swear","sweat","swell","swift","switch","sword","symbol","sympathy","symptom","syndrome","systematic","tablet","tackle","talent","target","tariff","tease","tedious","temper","temporary","tempt","tenant","tendency","tender","tense","terminal","terminate","terrain","testify","texture","theme","theory","therapy","thereby","thorough","thread","threat","thrive","throne","throughout","tidy","tight","timid","tolerate","torture","toss","tough","toxic","trace","track","tragedy","trait","transaction","transfer","transform","translate","transmit","transparent","transport","trap","trauma","treaty","tremble","trend","trial","tribe","tribute","trigger","trim","triumph","troop","tropic","trust","tunnel","ultimate","unanimous","underestimate","undergo","undergraduate","underlie","underline","undermine","undertake","unemployment","unexpected","unfair","unfold","uniform","unify","union","unique","universal","universe","unprecedented","upgrade","uphold","upset","urban","urge","urgent","usage","utility","utilize","utmost","utter","vacant","valid","valuable","vanish","vapor","variation","variety","various","vary","vast","veil","velocity","venture","verify","versatile","version","vessel","veteran","vibrate","vice","vigorous","violate","violence","virtue","visible","vision","visual","vital","vivid","vocal","void","volcano","volume","voluntary","vote","voyage","wage","warehouse","warfare","warrior","weave","welfare","whereas","whisper","widespread","wisdom","wit","withdraw","withstand","witness","workshop","worship","worth","wound","wrap","wreck","yield","zeal","zone"];
var ACAD_PACK_SEED = ["academic","accumulate","accurate","accusation","acknowledge","adapt","adequate","adjust","adolescent","advocate","aesthetic","affect","allocate","ambiguous","amend","analogy","analyze","ancestor","anticipate","appendix","applicable","arbitrary","architecture","arithmetic","artificial","asset","atmosphere","attorney","authentic","autonomy","avenue","aviation","bachelor","bacteria","ballet","barren","beneath","bias","bibliography","biography","bizarre","boundary","bureaucracy","cabinet","canvas","cathedral","census","certainty","chamber","chaos","circulate","cite","client","collaborate","collapse","collar","commodity","compound","comprise","compulsory","conceive","conception","concise","condense","configuration","confine","conform","confront","congestion","conjunction","consensus","consistency","consolidate","constrain","contemplate","contemporary","contradict","converge","coordinate","cosmic","counsel","counterpart","criterion","crucial","crystal","curriculum","data","declaration","deduce","deficit","degrade","deliberate","denote","deposit","detach","deteriorate","devise","dialect","diameter","dictate","differentiate","diffuse","dimension","discourse","discrete","discrepancy","dissertation","doctrine","document","domain","drawback","eccentric","elaborate","electricity","elegant","elevate","eligible","empirical","enclose","endeavor","enhance","enlighten","enroll","enterprise","entity","epidemic","equivalent","erode","ethnic","exemplify","exert","expedition","explicit","feminine","flaw","flee","fluctuate","formulate","fossil","framework","frontier","fundamental","galaxy","genetic","geology","glacier","gravity","grid","hypothesis","ideology","illuminate","imperial","incentive","inclination","incorporate","inference","ingenious","ingredient","inherent","initiate","innovation","input","intact","integral","junction","laboratory","latitude","legislation","linguistic","literacy","livestock","longitude","magnitude","mammal","manuscript","margin","mathematical","mechanic","mechanism","medieval","metaphor","molecule","momentum","municipal","negative","neutral","nourish","nuclear","objective","oblige","observation","offspring","orbit","organic","overall","overlap","paragraph","parameter","particle","patent","peak","pedal","penetrate","perception","permeate","perpetual","phenomenon","philosopher","plague","plateau","polar","ponder","precision","predominant","preliminary","premise","primitive","probability","procedure","proficiency","profound","prominent","proof","proportion","proposition","prose","protein","prototype","punctual","qualification","quantitative","quotation","radar","radical","random","ratio","rational","recipient","reckon","refute","regime","region","reign","remainder","renaissance","render","reptile","resemblance","resource","resume","revelation","revenue","revolution","rigorous","ritual","rivalry","robot","robust","rural","satellite","scale","scheme","scope","secondary","sector","segment","sensation","sequence","session","shrink","significant","simultaneous","sociology","software","solidarity","spectator","spectrum","spontaneous","stability","steady","stimulus","subsequent","subsidy","substance","substantial","subtle","sufficient","summarize","superficial","supplement","suppress","surface","surgeon","surpass","surplus","susceptible","synthesis","systematic","tactic","tangible","technique","technology","telescope","temporary","tendency","terminal","territory","theft","therapy","thereby","thesis","thrive","transaction","transfer","transparent","transplant","trauma","trigger","ultimate","unanimous","undergraduate","underlying","uniform","unify","unprecedented","urban","utility","utilize","vaccine","valid","variation","vegetation","velocity","venture","verbal","verify","veteran","virtually","visible","visual","voluntary","warehouse","widespread","withdrawal","withstand","workshop","yield"];
var CORE_PACK_CAP = 500;   /* 高频核心包词量上限 */
var ACAD_PACK_CAP = 150;   /* 学术词族包词量上限（且与高频核心包不重复） */

/* 高频核心包：种子表按固定种子洗牌铺开再截取，避免按字母序截断 */
function buildCorePack() {
  var rng = mulberry32(hashStr('wq-core-pack'));
  var pool = [];
  CORE_PACK_SEED.forEach(function (w) {
    var it = MEANING_OF[w] !== undefined ? { w: w, m: MEANING_OF[w] } : null;
    if (it) pool.push(it);
  });
  return seededShuffle(pool, rng).slice(0, CORE_PACK_CAP);
}
/* 学术词族包：排除高频核心包已收录的词，两包不重复 */
function buildAcadPack() {
  var rng = mulberry32(hashStr('wq-acad-pack'));
  var coreSet = {};
  CORE_PACK_SEED.forEach(function (w) { coreSet[w] = 1; });
  var pool = [];
  ACAD_PACK_SEED.forEach(function (w) {
    if (coreSet[w] || MEANING_OF[w] === undefined) return;
    pool.push({ w: w, m: MEANING_OF[w] });
  });
  return seededShuffle(pool, rng).slice(0, ACAD_PACK_CAP);
}

var PACKS = [
  { id: 'roots',   icon: '🧩', name: '词根家族', desc: '同根词集中特训：port / spect / dict / ject…一串一串吃透，附词汇密码拆解', build: buildRootsPack },
  { id: 'confuse', icon: '🔀', name: '易混淆对', desc: '形近词成对出击：band/bend、quiet/quite…专治「看走眼」，干扰项全是它的孪生兄弟', build: buildConfusePack },
  { id: 'core',    icon: '⚡', name: '高频核心 500', desc: '考试最爱考的核心词 500 个（四六级交集高频表）：先混个脸熟，再各个击破', build: buildCorePack },
  { id: 'acad',    icon: '🎓', name: '学术词族', desc: '论文与学术场景高频词 150 个（hypothesis / paradigm / synthesis…），与高频核心包不重复', build: buildAcadPack }
];
function packById(id) {
  var f = null;
  PACKS.forEach(function (p) { if (p.id === id) f = p; });
  return f;
}
function packWords(p) { return p.build(); }

function openPacks() {
  showScreen('scr-packs');
  var html = '';
  PACKS.forEach(function (p) {
    var words = packWords(p);
    var learned = words.filter(function (x) { var m = save.mastery[x.w]; return m && m.seen > 0; }).length;
    html += '<div class="pack-card"><div class="pack-icon">' + p.icon + '</div>' +
      '<div class="pack-info"><div class="pack-name">' + p.name + '</div>' +
      '<div class="pack-desc">' + p.desc + '</div>' +
      '<div class="pack-progress">📚 ' + words.length + ' 词 · 已学 ' + learned + ' · ⭐ 已掌握 ' +
      words.filter(function (x) { var m = save.mastery[x.w]; return m && m.lv >= 5; }).length + '</div></div>' +
      '<button class="btn btn-primary btn-small pack-start" data-p="' + p.id + '">⚔️ 挑战</button></div>';
  });
  $('pack-list').innerHTML = html + '<p class="hint">主题包按主题筛选内置词库，冒险规则照常（BOSS / 商店 / 词缀都在）；学习进度与星级照常累积</p>';
}

function startPackRun(pid) {
  var p = packById(pid);
  if (!p) return;
  var pool = packWords(p);
  if (pool.length < 4) { toast('该主题包词量不足，无法开战'); return; }
  var ids = (save.lastLists || []).filter(function (id) { return !!listById(id); });
  if (!ids.length) ids = ['cet4'];
  startRun('adventure', ids, save.lastDiff || 'normal', pool);
  run.unitCtx = null;   /* 主题包以包内词为唯一词池，不受单元制调度 */
  run.unitSet = null;
  run.packId = p.id;
  toast(p.icon + ' 主题挑战「' + p.name + '」开始！');
}

/* ========================= 词魂肉鸽（一局制 roguelike）=========================
   复用冒险战斗引擎（run.mode='adventure' + run.rogue 规则标记，见 startRunCore）：
   · 开局三选一天赋 + 必选一条「全局诅咒」——把 BOSS 词缀放大成整局规则：
     诅咒 id 直接复用 BOSS_MODS 键，activeMod() 对其全局放行，14 条词缀的既有
     战斗钩子（狂潮/石肤/不死/迷雾/妖印/贪婪/贫瘠…）全部自动生效；
     放大部分（时之砂 ×0.7、怒火 ×1.4、荆棘 +2、汲取回血）在各自挂钩处补一条
     run.rogue 分支即可。每条诅咒自带开局补偿（提示卡/护盾）。
   · 一局 6 关：怪量 6→10 逐关递增，第 6 关 BOSS 决战；通关「词魂加冕」，
     城破即终；商店照常营业。
   · 学习数据零损失：出题/判定照常走 updateMastery 与间隔重复。 */
var ROGUE_STAGES = 6;
var ROGUE_TALENTS = [
  { id: 'mage',   icon: '🧙', name: '词根法师', desc: '同词根连锁：本题与上一题共用词根时答对 +8🪙 并累积连锁；每击杀一只怪，下一只怪入场 -1 血（溅射）' },
  { id: 'knight', icon: '🛡️', name: '复仇骑士', desc: '复仇怪倒戈成友军：现身时压境 -10%，其答错不伤城防；复仇词答对金币 ×2' },
  { id: 'ranger', icon: '🏹', name: '听音游侠', desc: '全场只出听音/拼写题（无英文语音时自动全拼写），答对金币 ×2' }
];
var ROGUE_CURSES = {
  haste:  { desc: '整局每题答题时间 ×0.7', boon: { h: 2 }, boonTxt: '开局 +2 提示卡' },
  rage:   { desc: '整局敌军每次攻势伤害 ×1.4', boon: { s: 1 }, boonTxt: '开局 +1 护盾' },
  thorn:  { desc: '整局答错额外压境 +2%', boon: { s: 1 }, boonTxt: '开局 +1 护盾' },
  drain:  { desc: '整局你每答错 1 题，在场怪物回 1 血', boon: { h: 2 }, boonTxt: '开局 +2 提示卡' },
  freeze: { desc: '整局每题开题被偷走 4 秒', boon: { h: 2 }, boonTxt: '开局 +2 提示卡' },
  greed:  { desc: '整局金币 +50%，但每答 1 题压境 +2%', boon: {}, boonTxt: '贪婪本身就是补偿' },
  ward:   { desc: '整局每只怪物都带 1 层石肤护盾', boon: { h: 2 }, boonTxt: '开局 +2 提示卡' },
  silence:{ desc: '整局记忆提示与提示卡封印', boon: { s: 2 }, boonTxt: '开局 +2 护盾' },
  tide:   { desc: '整局敌军攻势每答 1 题 +1%（最多 +15%）', boon: { s: 1 }, boonTxt: '开局 +1 护盾' },
  molt:   { desc: '整局每只怪第一次被击倒都会以 1 血爬起', boon: { s: 1 }, boonTxt: '开局 +1 护盾' },
  famine: { desc: '整局金币收益减半', boon: { h: 2 }, boonTxt: '开局 +2 提示卡' },
  curse:  { desc: '整局连击封顶 3 连', boon: { h: 2 }, boonTxt: '开局 +2 提示卡' },
  fog:    { desc: '整局每题前 2 秒选项隐于迷雾', boon: { s: 1 }, boonTxt: '开局 +1 护盾' },
  hex:    { desc: '整局蓄力一击封印，只能靠答题输出', boon: { s: 1 }, boonTxt: '开局 +1 护盾' }
};
function rogueTalent(id) {
  var f = null;
  ROGUE_TALENTS.forEach(function (t) { if (t.id === id) f = t; });
  return f;
}
var rogueDraft = null;   /* 当前草稿状态：{ phase:'talent'|'curse', talent, curse, talents[], curses[] } */
function rogueCareerHtml() {
  var r = save.rogue || { runs: 0, wins: 0, bestChain: 0, cursesSeen: {} };
  return '<span class="chip">🎲 出征 ' + (r.runs || 0) + '</span>' +
    '<span class="chip">👑 加冕 ' + (r.wins || 0) + '</span>' +
    '<span class="chip">📜 诅咒图鉴 ' + Object.keys(r.cursesSeen || {}).length + '/' + Object.keys(ROGUE_CURSES).length + '</span>' +
    '<span class="chip">🔗 最高连锁 ' + (r.bestChain || 0) + '</span>';
}
function openRogue() {
  if (!buildEnc()) { showLoadFail(); return; }
  rogueDraft = null;
  showScreen('scr-rogue');
  $('rogue-intro').hidden = false;
  $('rogue-draft').hidden = true;
  $('btn-rogue-start').hidden = false;
  $('btn-rogue-start').textContent = '🎲 开启征途';
  $('rogue-career').innerHTML = rogueCareerHtml();
}
function startRogueDraft() {
  if (!buildEnc()) { showLoadFail(); return; }
  var ids = (save.lastLists || []).filter(function (id) { return !!listById(id); });
  if (!ids.length) ids = ['cet4'];
  var pool = buildPool(ids);
  if (pool.length < 24) { pool = buildPool(['cet4']); toast('当前词库词量不足，已并入内置 CET-4 词池'); }
  if (pool.length < 24) { toast('词库加载异常，无法开启征途'); return; }
  showScreen('scr-rogue');
  rogueDraft = {
    phase: 'talent', talent: '', curse: '',
    talents: shuffle(ROGUE_TALENTS.map(function (t) { return t.id; })),
    curses: shuffle(Object.keys(ROGUE_CURSES)).slice(0, 3)
  };
  renderRogueDraft();
}
function renderRogueDraft() {
  if (!rogueDraft) return;
  $('rogue-intro').hidden = true;
  $('rogue-draft').hidden = false;
  $('btn-rogue-start').hidden = true;
  var isTalent = rogueDraft.phase === 'talent';
  $('rogue-draft-title').textContent = isTalent ? '🧬 第一步 · 三选一词魂天赋' : '💀 第二步 · 抽签必选一条全局诅咒';
  $('rogue-draft-hint').textContent = isTalent
    ? '点击一张卡片锁定天赋（决定你这一局的玩法形态）'
    : '诅咒无法拒绝，但每条都自带开局补偿——点击接受命运';
  var html = '';
  var list = isTalent ? rogueDraft.talents : rogueDraft.curses;
  list.forEach(function (id) {
    if (isTalent) {
      var t = rogueTalent(id);
      html += '<div class="rogue-card" data-rogue-t="' + id + '"><div class="rc-icon">' + t.icon + '</div>' +
        '<div class="rc-name">' + t.name + '</div><div class="rc-desc">' + t.desc + '</div></div>';
    } else {
      var m = BOSS_MODS[id] || { icon: '💀', name: id };
      var rc = ROGUE_CURSES[id] || { desc: '', boonTxt: '' };
      html += '<div class="rogue-card curse" data-rogue-c="' + id + '"><div class="rc-icon">' + m.icon + '</div>' +
        '<div class="rc-name">' + m.name + '</div><div class="rc-desc">' + rc.desc + '</div>' +
        '<div class="rc-boon">🎁 ' + rc.boonTxt + '</div></div>';
    }
  });
  $('rogue-cards').innerHTML = html;
}
function pickRogueTalent(id) {
  if (!rogueDraft || rogueDraft.phase !== 'talent') return;
  rogueDraft.talent = id;
  Sfx.coin();
  var el = document.querySelector('[data-rogue-t="' + id + '"]');
  if (el) el.classList.add('picked');
  setTimeout(function () {
    if (!rogueDraft) return;
    rogueDraft.phase = 'curse';
    renderRogueDraft();
  }, 280);
}
function pickRogueCurse(id) {
  if (!rogueDraft || rogueDraft.phase !== 'curse') return;
  rogueDraft.curse = id;
  Sfx.boss();
  var el = document.querySelector('[data-rogue-c="' + id + '"]');
  if (el) el.classList.add('picked');
  setTimeout(function () { if (rogueDraft) startRogueRun(); }, 300);
}
function startRogueRun() {
  var d = rogueDraft;
  rogueDraft = null;
  if (!d || !d.talent || !d.curse) return;
  var talent = rogueTalent(d.talent);
  var ids = (save.lastLists || []).filter(function (id) { return !!listById(id); });
  if (!ids.length) ids = ['cet4'];
  startRun('adventure', ids, 'normal', null, { talent: d.talent, curse: d.curse });
  if (!run || !run.rogue) return;   /* startRun 失败已由 goHomeSafe 兜底 */
  var rc = ROGUE_CURSES[d.curse] || {};
  if (rc.boon && rc.boon.h) run.hints += rc.boon.h;
  if (rc.boon && rc.boon.s) run.shields += rc.boon.s;
  save.rogue = save.rogue || { runs: 0, wins: 0, bestChain: 0, cursesSeen: {} };
  save.rogue.cursesSeen = save.rogue.cursesSeen || {};
  save.rogue.cursesSeen[d.curse] = 1;
  persist();
  updateHUD();
  var bm = BOSS_MODS[d.curse] || { icon: '💀', name: d.curse };
  showBanner('🎲 词魂征途 · 第 1 关',
    talent.icon + ' 天赋「' + talent.name + '」<br>' + bm.icon + ' 全局诅咒「' + bm.name + '」：' + (rc.desc || '') +
    '<br>🎁 ' + (rc.boonTxt || '') + ' · 6 关连打，第 6 关决战 BOSS',
    function () { nextMonster(); }, 3000);
}

/* ========================= 每日远征（种子化固定关卡） =========================
   词池与词缀由当日日期作种（同每日任务的种子随机思路）——同一天内所有玩家
   遇到同一批词、同一条词缀 schedule，难度自选；第二天自动换一副面孔。
   3 关：迎击 8 只 → 精英 10 只（挂当日词缀 A）→ BOSS 决战（挂当日词缀 B）。
   积分 = 击杀×10 + 答对×2 + 最高连击×5 + 通关 100；当日首通额外奖 80🪙。 */
var EXP_STAGES = [
  { size: 8,  boss: false, mod: -1 },   /* mod: -1=无词缀，0/1=expMods 下标 */
  { size: 10, boss: false, mod: 0 },
  { size: 1,  boss: true,  mod: 1 }
];
function expDayStamp() { return new Date().toDateString(); }
function planExpedition(listIds) {
  var ids = (listIds || []).filter(function (id) { return !!listById(id); });
  if (!ids.length) ids = ['cet4'];
  var rng = mulberry32(hashStr(expDayStamp() + '|expedition'));
  var words = seededShuffle(buildPool(ids), rng).slice(0, 20);
  var mods = seededShuffle(Object.keys(BOSS_MODS), rng);
  return { ids: ids, pool: words, expMods: [mods[0], mods[1]] };
}
function expScore(reason) {
  return run.kills * 10 + run.correct * 2 + run.maxCombo * 5 + (reason === 'done' ? 100 : 0);
}
function expTodayCleared() {
  return !!(save.expedition && save.expedition.clearDate === expDayStamp());
}

/* 加权选词：低掌握 / 没见过 / 到期该复习的优先 */
function pickWord() {
  if (run.mode === 'plan' && run.planQueue && run.planQueue.length) {
    return run.planQueue.shift();
  }
  for (var i = 0; i < run.reinforce.length; i++) {
    if (run.answered >= run.reinforce[i].at) {
      var item = run.reinforce.splice(i, 1)[0];
      run.pendingRevenge = true;
      return { w: item.w, m: item.m };
    }
  }
  /* 单元模式：新词严格按单元顺序推进（像背单词书），学完本单元才回退随机采样 */
  if (run.unitCtx && run.unitCtx.words.length) {
    for (var ui = 0; ui < run.unitCtx.words.length; ui++) {
      var uw = run.unitCtx.words[ui];
      if (!save.mastery[uw.w] && run.recent.indexOf(uw.w) < 0) return uw;
    }
  }
  var pool = run.pool, now = Date.now();
  var best = null, bestScore = -1;
  for (var k = 0; k < 16; k++) {
    var cand = pool[Math.floor(Math.random() * pool.length)];
    if (run.recent.indexOf(cand.w) >= 0) continue;
    var m = save.mastery[cand.w];
    var score;
    if (!m) score = 10 + Math.random() * 2;                 // 没学过的词最优先
    else if (m.lv >= 5) score = Math.random() * 0.8;        // 已掌握的几乎不出
    else score = (5 - m.lv) * 2 + (m.due && m.due <= now ? 1.5 : 0) + (m.wrongStreak ? 1.2 : 0) + Math.random() * 2;
    if (score > bestScore) { bestScore = score; best = cand; }
  }
  if (!best) best = pool[Math.floor(Math.random() * pool.length)];
  return best;
}

/* ========================= 出题 ========================= */
function posOf(m) {
  var mt = /^(n|v|adj|adv|prep|conj|pron)\b/.exec(m || '');
  return mt ? mt[1] : '';
}
function distractors(word, n) {
  var src = (run.pool.length >= 8 ? run.pool : ALL_WORDS);
  var pos = posOf(word.m);
  var cands = src.filter(function (x) { return x.w !== word.w; });
  var picked = [], used = {};
  /* 第零优先：噩梦关卡里，出题者在挑战码里指定的混淆词 */
  var poisonConf = run.poison && run.poison.confuseMap && run.poison.confuseMap[word.w];
  if (poisonConf) {
    poisonConf.forEach(function (ow) {
      if (picked.length >= n || used[ow]) return;
      for (var ci = 0; ci < cands.length; ci++) {
        if (cands[ci].w === ow) { used[ow] = 1; picked.push(cands[ci]); break; }
      }
    });
  }
  /* 第一优先：你曾经混淆过的词 */
  var conf = (save.confuse || {})[word.w];
  if (conf) {
    Object.keys(conf).sort(function (a, b) { return conf[b] - conf[a]; }).forEach(function (ow) {
      if (picked.length >= n || used[ow]) return;
      for (var ci = 0; ci < cands.length; ci++) {
        if (cands[ci].w === ow) { used[ow] = 1; picked.push(cands[ci]); break; }
      }
    });
  }
  /* 迷惑度打分：同词根 > 同开头两字母 > 首字母 > 同词性 > 长度接近 */
  var wp = parseCode(word.w);
  var wRoots = wp ? wp.roots : [];
  var scored = cands.map(function (x) {
    var s = Math.random() * 0.6;
    if (wRoots.length) {
      var xp = parseCode(x.w);
      if (xp && xp.roots.some(function (r) { return wRoots.indexOf(r) >= 0; })) s += 3;
    }
    if (x.w.slice(0, 2) === word.w.slice(0, 2)) s += 1.6;
    else if (x.w[0] === word.w[0]) s += 0.7;
    if (pos && posOf(x.m) === pos) s += 1.2;
    var dl = Math.abs(x.w.length - word.w.length);
    if (dl <= 1) s += 0.5;
    s -= dl * 0.2;
    return { x: x, s: s };
  }).sort(function (a, b) { return b.s - a.s; });
  scored.forEach(function (o) {
    if (picked.length < n && !used[o.x.w]) { used[o.x.w] = 1; picked.push(o.x); }
  });
  return picked;
}

function buildQuestion(word, avoidType) {
  var q = save.settings.qtypes;
  var types = [];
  if (q.c2e) types.push('c2e');
  if (q.e2c) types.push('e2c');
  if (q.spell && /^[a-z]{3,10}$/.test(word.w)) types.push('spell');
  if (q.listen && TTS.ok) types.push('listen');
  if (!types.length) types.push('c2e');
  /* 词魂肉鸽·听音游侠：全场只出听音/拼写题（无英文语音时自动全拼写） */
  if (run.rogue && run.rogue.talent === 'ranger') {
    var rt2 = [];
    if (TTS.ok) rt2.push('listen');
    if (/^[a-z]{3,10}$/.test(word.w)) rt2.push('spell');
    if (rt2.length) types = rt2;
  }
  if (avoidType && types.length > 1) types = types.filter(function (t) { return t !== avoidType; });
  var type = rnd(types);

  var question = { word: word, type: type, locked: false, retries: 0, isRevenge: !!run.pendingRevenge };
  run.pendingRevenge = false;

  if (type === 'c2e' || type === 'listen') {
    var opts = shuffle([{ w: word.w, m: word.m }].concat(distractors(word, 3)));
    question.options = opts.map(function (o) { return o.w; });
    question.answer = question.options.indexOf(word.w);
  } else if (type === 'e2c') {
    var opts2 = shuffle([{ w: word.w, m: word.m }].concat(distractors(word, 3)));
    question.options = opts2.map(function (o) { return o.m; });
    question.answer = question.options.indexOf(word.m);
  } else { // spell
    var letters = word.w.split('');
    question.letters = null; // 渲染时生成
    question.shuffled = shuffle(letters);
  }
  return question;
}

function typeTimeFactor(t) { return t === 'spell' ? 1.6 : (t === 'listen' ? 1.2 : 1); }

/* ========================= 战斗状态 ========================= */
var run = null;
var runEpoch = 0;   /* 局次号：每次 startRun +1，旧局遗留的延时回调用它识别自己已过期 */
var setupMode = 'adventure';

function coinMult() {
  var m = 1 + 0.2 * (save.upgrades.coin || 0) + 0.1 * talentLv('magnet') + (run && run.pet === 'dragon' ? 0.15 : 0);
  if (activeMod() === 'greed') m += 0.5;   /* 贪婪词缀：金币 +50% */
  if (activeMod() === 'famine') m *= 0.5;  /* 贫瘠词缀：金币收益减半 */
  return m;
}
function perQuestionSec() {
  var d = run.diff.sec;
  var base;
  if (run.mode === 'adventure') base = d - (run.stage - 1) * 0.3 + (save.upgrades.time || 0) * 2 + (run.stageBonus || 0);
  else if (run.mode === 'endless') base = d - run.kills * 0.12 + (save.upgrades.time || 0) * 2;
  else base = d + (save.upgrades.time || 0) * 2;
  base += talentLv('calm');                 /* 天赋：从容不迫 +1s/级 */
  if (run.pet === 'owl') base *= 1.15;
  if (run.mode === 'adventure' && run.bossStage && run.bossMod === 'haste') base *= 0.75;
  if (run.mode === 'expedition' && run.bossMod === 'haste') base *= 0.75;
  if (run.poison && run.poisonAffix === 'haste') base *= 0.75;
  if (run.rogue && run.rogue.curse === 'haste') base *= 0.7;   /* 全局诅咒·时之砂：放大版提速 */
  if (run.mode === 'adventure' && run.bossStage && run.enrage) base *= 0.88;
  if (activeMod() === 'freeze') base -= 4;  /* 词缀：时停，固定偷走 4 秒 */
  base += (run.timerAdj || 0);
  return Math.max(4, base);
}

/* 是否为扣血/守城类模式 */
function combatLike() {
  return run && (run.mode === 'adventure' || run.mode === 'endless' || run.mode === 'expedition');
}
/* 当前生效的 BOSS 词缀：词魂肉鸽的全局诅咒（整局）优先，其次是冒险 BOSS 关、
   远征关卡或噩梦毒池的挑战码词缀 */
function activeMod() {
  if (!run) return '';
  if (run.rogue && run.rogue.curse) return run.rogue.curse;
  if (run.mode === 'adventure' && run.bossStage && run.bossMod) return run.bossMod;
  if (run.mode === 'expedition' && run.bossMod) return run.bossMod;
  if (run.poison && run.poisonAffix) return run.poisonAffix;
  return '';
}

function startRun(mode, listIds, diffKey, explicitPool, rogueCfg) {
  /* 出战入口兜底：清空/重建期间任何一行抛异常都不允许停在「无题无怪无横幅」的
     半渲染战斗页——回主页并提示（存档已由 persistNow 保住） */
  try { startRunCore(mode, listIds, diffKey, explicitPool, rogueCfg); }
  catch (e) { noteError('startRun', e); goHomeSafe(); }
}
function startRunCore(mode, listIds, diffKey, explicitPool, rogueCfg) {
  if (!buildEnc()) { showLoadFail(); return; }   /* 词库未加载：出不了题，给可恢复提示 */
  var diff = DIFFS[diffKey] || DIFFS.normal;
  var unitCtx = (rogueCfg || mode === 'review' || mode === 'drill' || mode === 'expedition') ? null : resolveUnitCtx(listIds);
  var pool;
  if (explicitPool) pool = explicitPool.slice();
  else if (mode === 'review' || mode === 'drill') pool = buildReviewPool(listIds);
  else if (mode === 'plan') pool = buildPlanPool(listIds, unitCtx);
  else pool = buildPool(listIds);
  var maxHp = diff.hp + (save.upgrades.hp || 0) * 6;

  run = {
    mode: mode, listIds: listIds, diff: diff, diffKey: diffKey,
    pool: pool, stage: 1, stageSize: 6, killedInStage: 0, stageBonus: 0, bossStage: false, bossMod: '',
    kills: 0, answered: 0, correct: 0, combo: 0, maxCombo: 0,
    hp: maxHp, maxHp: maxHp, shields: save.upgrades.shield || 0, hints: talentLv('sage'), hgStack: 0,
    coinsEarned: 0, reinforce: [], recent: [], records: [], recordsBy: {},
    monster: null, q: null, pendingRevenge: false, reviewTotal: 12,
    pet: save.pet || '', timerAdj: 0, hist: [], wrongTotal: 0, timeline: [],
    willUsed: false, smiteN: 0, packId: '', expMods: null, expScore: 0,
    planQueue: (mode === 'plan') ? pool.slice() : null,
    unitCtx: unitCtx || null, unitSet: null,
    pressure: 0
  };
  /* 词魂肉鸽：规则标记随局创建（须在 beginStage 之前就位，beginStage 按 run.rogue 分支） */
  if (rogueCfg) run.rogue = { talent: rogueCfg.talent, curse: rogueCfg.curse, chainN: 0, lastRoots: null, splash: 0 };
  runEpoch++;   /* 旧局的延时回调（记忆卡/追击/击杀链）从此全部过期 */
  if (mode === 'expedition') {
    var ex = planExpedition(listIds);   /* 当日种子词池 + 词缀 schedule，覆盖普通词池 */
    run.pool = ex.pool;
    run.listIds = ex.ids;
    run.expMods = ex.expMods;
  }
  if (run.unitCtx && run.unitCtx.words.length) {
    run.unitSet = {};
    run.unitCtx.words.forEach(function (x) { run.unitSet[x.w] = 1; });
  }
  if (mode === 'plan') {
    run.reviewTotal = pool.length;
  } else if (mode === 'review' || mode === 'drill') {
    /* 普通复习/强化按"本局词量"取题；小词池对决每词来两遍 */
    run.reviewTotal = explicitPool
      ? (pool.length < 4 ? pool.length * 2 : pool.length)
      : Math.min(Math.max(save.sessionSize || 10, pool.length ? 1 : 0), pool.length);
  }

  save.lastLists = listIds; save.lastDiff = diffKey; persist();
  if (mode === 'plan') { ensurePlanDay(); save.planDay.total = pool.length; persist(); }

  showScreen('scr-battle');
  /* 清空上一局残留的题目/怪物/特效：横幅期间旧题还挂在 DOM 上会被误点误读 */
  $('q-type').textContent = '';
  $('q-prompt').textContent = '';
  $('q-prompt').className = 'q-prompt';
  $('q-options').innerHTML = '';
  $('q-options').className = 'q-options';
  $('q-options').hidden = false;
  $('q-spell').hidden = true;
  $('q-memo').hidden = true;
  $('q-memo').innerHTML = '';
  $('btn-replay').hidden = true;
  $('btn-hint').hidden = true;
  $('btn-memo').hidden = true;
  spellState = null;
  $('monster-emoji').textContent = '';
  $('monster-emoji').className = 'monster-emoji';
  $('monster-name').textContent = '';
  $('monster-name').className = 'monster-name';
  $('monster-hp-fill').style.width = '0%';
  $('boss-mod').hidden = true;
  $('timer-fill').style.width = '100%';
  $('timer-fill').className = 'timer-fill';
  $('fx-layer').innerHTML = '';
  /* 视觉互动层复位：光环 canvas / 词根符文 / 蓄力 / 城堡裂纹火光 / BOSS 氛围 / 连击热浪 */
  cancelCharge();
  paintMonsterVisual(null);
  $('monster-figure').classList.remove('boss');
  $('monster-rune').hidden = true;
  $('btn-charge').hidden = true;
  $('pressure-wrap').classList.remove('dmg-1', 'dmg-2', 'dmg-3');
  Array.prototype.forEach.call($('castle-fx').querySelectorAll('.castle-smoke,.castle-spark'), function (n) { n.remove(); });
  castleSmokeOn = false;
  $('scr-battle').classList.remove('boss-live', 'combo-heat-1', 'combo-heat-2', 'combo-heat-3');
  $('hero-emoji').textContent = (mode === 'adventure' || mode === 'endless' || mode === 'expedition') ? '🏰' : '🧙‍♂️';
  $('hero-hp-text').textContent = (mode === 'review') ? '📖 练习模式 · 不扣血'
    : (mode === 'plan' ? '🎯 今日计划 · 不扣血'
    : (mode === 'drill' ? '🔥 强化训练 · 不扣血' : '🏰 城防 100%'));
  updateHUD();
  BGM.stop();
  BGM.start('normal');

  if (mode === 'review') {
    applyTheme(0);
    showBanner('📖 复习开始！', '共 ' + run.reviewTotal + ' 只单词怪，不扣血放心练', function () { nextMonster(); }, 1500);
  } else if (mode === 'drill') {
    applyTheme(0);
    showBanner('🔥 错题强化训练', '专攻错题本 ' + run.reviewTotal + ' 题 · 不扣血', function () { nextMonster(); }, 1600);
  } else if (mode === 'plan') {
    applyTheme(0);
    var dueN = 0, freshN = 0;
    pool.forEach(function (x) { var m = save.mastery[x.w]; if (m && m.seen > 0) dueN++; else freshN++; });
    showBanner('🎯 今日学习计划', '复习 ' + dueN + ' 个到期词 · 新词 ' + freshN + ' 个 · 不扣血', function () { nextMonster(); }, 1700);
  } else {
    beginStage();
  }
}

function beginStage() {
  run.killedInStage = 0;
  run.enrage = false;
  if (run.rogue) {
    /* 词魂肉鸽：全局诅咒就是本局唯一词缀（不再叠 BOSS 随机词缀），
       第 6 关 BOSS 决战，普通关怪量 6→10 逐关递增 */
    run.bossStage = (run.stage >= ROGUE_STAGES);
    run.bossMod = '';
    run.stageSize = run.bossStage ? 1 : 5 + run.stage;
  } else if (run.mode === 'expedition') {
    var exSt = EXP_STAGES[Math.min(run.stage - 1, EXP_STAGES.length - 1)];
    run.bossStage = exSt.boss;
    run.bossMod = exSt.mod < 0 ? '' : (run.expMods || ['haste', 'rage'])[exSt.mod];
    run.stageSize = exSt.size;
  } else {
    run.bossStage = (run.mode === 'adventure' && run.stage % 5 === 0);
    run.bossMod = run.bossStage ? rnd(Object.keys(BOSS_MODS)) : '';
    run.stageSize = run.bossStage ? 1 : Math.max(4, save.sessionSize || 10);
  }
  markModSeen(run.bossMod);   /* 词缀图鉴：记下今天遭遇的词缀 */
  run.stageBonus = run.hgStack;  // 消耗沙漏
  run.hgStack = 0;

  if (run.pet === 'fairy' && run.mode === 'adventure' && run.pressure > 0) {
    addPressure(-5);
    fx('🧚 宠修城墙 压境-5%', 'good', 68, 60);
  }
  if (talentLv('medic') && combatLike() && run.pressure > 0) {
    addPressure(-3 * talentLv('medic'));
    fx('🧰 战地抢修 压境-' + (3 * talentLv('medic')) + '%', 'good', 68, 45);
  }

  var themeIdx = (run.stage - 1) % THEMES.length;
  applyTheme(themeIdx);
  updateHUD();
  BGM.start(run.bossStage ? 'boss' : 'normal');

  var theme = THEMES[themeIdx];
  var story = theme[3][run.stage % theme[3].length];
  if (run.bossStage) {
    Sfx.boss();
    if (run.rogue) {
      var rcB = ROGUE_CURSES[run.rogue.curse] || { desc: '' };
      var rcM = BOSS_MODS[run.rogue.curse] || { icon: '💀', name: '' };
      showBanner('⚠️ 第 ' + run.stage + ' 关 · 词魂 BOSS 战',
        rcM.icon + ' 全局诅咒「' + rcM.name + '」仍在生效<br>' + theme[1] + ' · ' + story,
        function () { nextMonster(); }, 2200);
    } else {
      var mod = BOSS_MODS[run.bossMod];
      showBanner('⚠️ 第 ' + run.stage + ' 关 · BOSS 战',
        mod.icon + ' ' + mod.name + '：' + mod.desc + '<br>' + theme[1] + ' · ' + story,
        function () { nextMonster(); }, 2100);
    }
  } else if (run.bossMod) {
    var em = BOSS_MODS[run.bossMod];   /* 远征精英关：整关带词缀，先读效果再开打 */
    showBanner('⚠️ 第 ' + run.stage + ' 关 · 精英来袭',
      em.icon + ' ' + em.name + '：' + em.desc + '<br>' + theme[1] + ' · ' + story,
      function () { nextMonster(); }, 2100);
  } else {
    var sub = story + (run.stage === 1 ? '<br>敌军已兵临城下，快速答对击退他们！' : '');
    showBanner('第 ' + run.stage + ' 关 · ' + theme[1], sub, function () { nextMonster(); }, 1500);
  }
}

function spawnMonster() {
  var boss = run.bossStage;
  var hp;
  if (run.poison) hp = 1;   /* 噩梦关卡：真实血量在出题时按毒词掌握度反向换算 */
  else if (boss) hp = run.stage >= 15 ? 4 : 3;
  else {
    var tough = (run.mode === 'endless') ? run.kills >= 12 : (run.mode === 'expedition' ? run.stage >= 2 : run.stage >= 6);
    hp = (combatLike() && tough && Math.random() < 0.25) ? 2 : 1;
  }
  var pick = boss ? rnd(BOSSES) : rnd(MONSTERS);
  /* 词魂肉鸽·词根法师：上一只怪被击杀时溅射，本怪入场 -1 血（至少 1） */
  if (run.rogue && run.rogue.splash) {
    run.rogue.splash = 0;
    hp = Math.max(1, hp - 1);
    fx('🔥 词根溅射：本怪入场 -1 血', 'good', 25, 20);
  }  run.monster = { emoji: pick[0], name: pick[1], hp: hp, maxHp: hp, boss: boss, hpSet: !run.poison,
    shield: (activeMod() === 'ward') ? 1 : 0 };   /* 石肤词缀：怪物带 1 层护盾 */
  var me = $('monster-emoji');
  me.textContent = pick[0];
  me.className = 'monster-emoji' + (boss ? ' boss boss-enter' : '');
  var fig = $('monster-figure');
  fig.classList.toggle('boss', boss);
  $('scr-battle').classList.toggle('boss-live', boss);
  if (boss) {
    /* BOSS 登场：从天而降砸落 + 冲击环 + 轻震 + 低音鼓点，存在感拉满 */
    shakeApp(true);
    Sfx.tone(90, .22, 'square', 0, .08);
    setTimeout(function () {
      if (run && run.monster && run.monster.boss) { ringAtMonster(false); shakeApp(true); }
    }, 380);
    setTimeout(function () {
      var cur = $('monster-emoji');
      if (cur && cur.classList.contains('boss-enter')) cur.classList.remove('boss-enter');
    }, 800);
  }
  paintMonsterVisual({ boss: boss, hp: hp, pos: '', lv: 0 });   /* 先画基础环，出题后按词性/掌握度重绘 */
  $('monster-name').textContent = run.poison ? ('☠️ ' + pick[1])
    : pick[1] + (boss ? '' : ' · Lv.' + Math.max(1, Math.floor((run.mode === 'endless' ? run.kills : run.stage * 2) / 2)));
  $('monster-name').className = boss ? 'monster-name boss-name' : 'monster-name';
  var modEl = $('boss-mod');
  if (boss && run.bossMod) {
    var bm = BOSS_MODS[run.bossMod];
    modEl.innerHTML = bm.icon + ' ' + bm.name;
    modEl.title = bm.desc;
    modEl.hidden = false;
  } else if (run.poison && run.poisonAffix && BOSS_MODS[run.poisonAffix]) {
    var pm = BOSS_MODS[run.poisonAffix];
    modEl.innerHTML = pm.icon + ' ' + pm.name;
    modEl.title = pm.desc + '（挑战码词缀）';
    modEl.hidden = false;
  } else if (run.rogue && run.rogue.curse && BOSS_MODS[run.rogue.curse]) {
    var rogM = BOSS_MODS[run.rogue.curse];
    modEl.innerHTML = rogM.icon + ' ' + rogM.name;
    modEl.title = '全局诅咒：' + (ROGUE_CURSES[run.rogue.curse] ? ROGUE_CURSES[run.rogue.curse].desc : rogM.desc);
    modEl.hidden = false;
  } else {
    modEl.hidden = true;
  }
  updateHUD();
}

function nextMonster() {
  try {
    if (!run || run.ended) return;
    spawnMonster();
    askNext(false, null);
  } catch (e) { noteError('nextMonster', e); recoverBattle(); }
}

function askNext(sameWord, avoidType) {
  if (!run || run.ended) return;
  var word;
  if (sameWord && run.q) {
    word = run.q.word;
  } else {
    word = pickWord();
  }
  /* 噩梦关卡：怪物血量按出题者对该词的掌握度反向换算（lv 越低怪越硬） */
  if (run.poison && run.monster && !run.monster.hpSet) {
    var lv = (run.poison.lvMap && run.poison.lvMap[word.w] !== undefined) ? run.poison.lvMap[word.w] : 0;
    var php = Math.max(1, Math.min(4, 5 - lv));
    run.monster.hp = php;
    run.monster.maxHp = php;
    run.monster.hpSet = true;
    run.monster.word = word.w;
    fx('☠️ 硬度 ' + php, 'bad', 25, 18);
    updateHUD();
  }
  var question = buildQuestion(word, avoidType);
  if (sameWord) question.retries = (run.q ? run.q.retries : 0) + 1;
  run.q = question;
  paintMonsterVisual(monsterTraitOpts());   /* 词性光环 + 血量角 + 掌握度热度（出题词定了才画） */
  renderQuestion();
}
function renderQuestion() {
  var q = run.q;
  /* 移开按钮焦点：避免按 Enter/空格 误触发上一个点过的按钮 */
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  $('q-type').textContent = TYPE_LABEL[q.type] + (q.isRevenge ? ' 　😈 复仇怪兽来袭！' : '');
  /* 词魂肉鸽·复仇骑士：复仇怪现身即倒戈，替你击退敌军 */
  if (run.rogue && run.rogue.talent === 'knight' && q.isRevenge && q.retries === 0) {
    addPressure(-10);
    fx('🛡️ 复仇怪倒戈！压境 -10%', 'good', 50, 38);
  }
  $('monster-rune').hidden = true;   /* 词根符文只在答题后揭示 */
  $('btn-charge').hidden = !combatLike();   /* 蓄力一击：仅守城类模式 */
  $('q-options').innerHTML = '';
  $('q-options').className = 'q-options';
  $('q-spell').hidden = true;
  $('q-options').hidden = false;
  $('btn-replay').hidden = q.type !== 'listen';
  $('btn-hint').hidden = true;
  $('btn-hint').disabled = run.hints <= 0;
  $('hint-count').textContent = run.hints;
  /* 沉默词缀：提示卡被封印 */
  var silenced = activeMod() === 'silence';
  if (silenced) { $('btn-hint').disabled = true; $('btn-spell-hint').disabled = true; }

  /* 记忆提示（词根 + 图像）：有内容才显示按钮，每题重置 */
  var memo = memoOf(q.word.w);
  $('q-memo').hidden = true;
  $('btn-memo').hidden = silenced || !(memo.emoji || memo.code);
  var memoHtml = '';
  if (memo.emoji) memoHtml += '<span class="memo-emoji">' + memo.emoji + '</span>';
  var body = '';
  if (memo.code) body += '<div class="memo-code">🔑 ' + memo.code + '</div>';
  if (memo.fam.length) body += '<div class="memo-fam">👨‍👩‍👧 同根词：' + memo.fam.join(' · ') + '</div>';
  if (!memo.code && !memo.fam.length) body = '<div class="memo-code">🖼️ 图像联想记忆</div>';
  memoHtml += '<span class="memo-body">' + body + '</span>';
  $('q-memo').innerHTML = memoHtml;

  var prompt = $('q-prompt');
  prompt.className = 'q-prompt';

  if (q.type === 'c2e') {
    prompt.textContent = q.word.m;
  } else if (q.type === 'e2c') {
    prompt.textContent = q.word.w;
  } else if (q.type === 'listen') {
    prompt.innerHTML = '🔊';
    prompt.className = 'q-prompt listen-prompt';
    setTimeout(function () { if (run && run.q === q) TTS.speak(q.word.w, true); }, 350);
  } else {
    prompt.textContent = q.word.m;
    $('q-options').hidden = true;
    $('q-spell').hidden = false;
    $('btn-spell-hint').disabled = run.hints <= 0 || activeMod() === 'silence';
    renderSpell();
  }

  if (q.type === 'c2e' || q.type === 'e2c' || q.type === 'listen') {
    q.options.forEach(function (opt, i) {
      var b = document.createElement('button');
      b.className = 'q-opt';
      b.innerHTML = '<i class="key-num">' + (i + 1) + '</i>' + opt;
      b.onclick = function () { onChoice(i, b); };
      $('q-options').appendChild(b);
    });
    if (run.hints > 0) $('btn-hint').hidden = false;
    /* 迷雾词缀：开题前 2 秒选项被雾遮住，硬猜有风险，先想词根再等雾散 */
    if (activeMod() === 'fog') {
      $('q-options').classList.add('fogged');
      var fogSeq = runEpoch;
      setTimeout(function () {
        if (!run || runEpoch !== fogSeq) return;
        var el = $('q-options');
        if (el && !(run.q && run.q.locked)) el.classList.remove('fogged');
      }, 2000);
    }
  }

  startTimer(perQuestionSec() * typeTimeFactor(q.type));
}

/* ---------- 拼写题 ---------- */
var spellState = null;

function renderSpell() {
  var q = run.q;
  spellState = { picked: [], hinted: [] };
  var slots = $('spell-slots');
  slots.innerHTML = '';
  for (var i = 0; i < q.word.w.length; i++) {
    var s = document.createElement('div');
    s.className = 'spell-slot';
    slots.appendChild(s);
  }
  var chips = $('spell-chips');
  chips.innerHTML = '';
  q.shuffled.forEach(function (ch, idx) {
    var b = document.createElement('button');
    b.className = 'spell-chip';
    b.textContent = ch;
    b.onclick = function () { tapChip(idx); };
    chips.appendChild(b);
  });
  updateSpellUI();
}

function updateSpellUI() {
  var q = run.q;
  var slots = $('spell-slots').children;
  for (var i = 0; i < slots.length; i++) {
    slots[i].textContent = spellState.picked[i] !== undefined ? q.shuffled[spellState.picked[i]] : '';
    slots[i].className = 'spell-slot' + (spellState.hinted.indexOf(i) >= 0 ? ' hinted' : '');
  }
  var chips = $('spell-chips').children;
  for (var j = 0; j < chips.length; j++) {
    chips[j].className = 'spell-chip' + (spellState.picked.indexOf(j) >= 0 ? ' used' : '');
  }
  $('btn-spell-submit').disabled = spellState.picked.length !== q.word.w.length;
}

function tapChip(idx) {
  if (!run || !run.q || run.q.locked || run.q.type !== 'spell') return;
  if (spellState.picked.indexOf(idx) >= 0) return;
  if (spellState.picked.length >= run.q.word.w.length) return;
  spellState.picked.push(idx);
  Sfx.tone(600 + spellState.picked.length * 40, .05, 'sine', 0, .04);
  updateSpellUI();
}
function spellBack() {
  if (!run || !run.q || run.q.locked || run.q.type !== 'spell') return;
  spellState.picked.pop();
  updateSpellUI();
}
function spellHint() {
  if (!run || !run.q || run.q.locked || run.q.type !== 'spell') return;
  if (run.hints <= 0) return;
  if (activeMod() === 'silence') { toast('🔕 沉默词缀：提示被封印！'); return; }
  var q = run.q;
  var need = q.word.w[spellState.picked.length];
  for (var i = 0; i < q.shuffled.length; i++) {
    if (spellState.picked.indexOf(i) < 0 && q.shuffled[i] === need) {
      spellState.hinted.push(spellState.picked.length);
      spellState.picked.push(i);
      run.hints--;
      $('btn-spell-hint').disabled = run.hints <= 0;
      $('hint-count').textContent = run.hints;
      Sfx.coin();
      updateSpellUI();
      return;
    }
  }
}
function submitSpell() {
  if (!run || !run.q || run.q.locked || run.q.type !== 'spell') return;
  var q = run.q;
  if (spellState.picked.length !== q.word.w.length) return;
  var str = spellState.picked.map(function (i) { return q.shuffled[i]; }).join('');
  if (str === q.word.w) {
    resolve(true);
  } else {
    resolve(false);
  }
}

/* ---------- 选择题 ---------- */
function onChoice(i, btn) {
  if (!run || !run.q || run.q.locked) return;
  var q = run.q;
  if (i === q.answer) {
    btn.classList.add('correct');
    $('q-options').classList.add('locked');
    resolve(true);
  } else {
    if (q.type === 'c2e' || q.type === 'listen') {
      save.confuse[q.word.w] = save.confuse[q.word.w] || {};
      save.confuse[q.word.w][q.options[i]] = (save.confuse[q.word.w][q.options[i]] || 0) + 1;
    }
    btn.classList.add('wrong');
    $('q-options').classList.add('locked');
    var correctBtn = $('q-options').children[q.answer];
    if (correctBtn) correctBtn.classList.add('correct');
    resolve(false);
  }
}

function useHint() {
  if (!run || !run.q || run.q.locked || run.hints <= 0) return;
  if (activeMod() === 'silence') { toast('🔕 沉默词缀：提示被封印！'); return; }
  var q = run.q;
  if (q.type !== 'c2e' && q.type !== 'e2c' && q.type !== 'listen') return;
  var wrongIdx = [];
  q.options.forEach(function (o, i) { if (i !== q.answer) wrongIdx.push(i); });
  shuffle(wrongIdx).slice(0, 2).forEach(function (i) {
    var b = $('q-options').children[i];
    if (b) b.classList.add('dim');
  });
  run.hints--;
  $('hint-count').textContent = run.hints;
  $('btn-hint').disabled = run.hints <= 0;
  if (run.hints <= 0) $('btn-hint').hidden = true;
  Sfx.coin();
  updateHUD();
}

/* ========================= 计时器 + 大军压境 ========================= */
var timerRAF = null, timerEnd = 0, timerDur = 1, lastTickT = 0;

function addPressure(n) {
  if (!run || run.ended) return;
  if (n < 0) { run.pressure = Math.max(0, run.pressure + n); updateHUD(); return; }
  run.pressure = Math.min(100, run.pressure + n);
  updateHUD();
  if (run.pressure >= 100) {
    /* 不灭意志天赋：每局一次，城破瞬间稳住城墙 */
    if (talentLv('will') && !run.willUsed) {
      run.willUsed = true;
      run.pressure = 70;
      updateHUD();
      fx('🕯️ 不灭意志！城墙稳住了！', 'good', 50, 30);
      toast('🕯️ 天赋「不灭意志」触发：压境回落到 70%');
      return;
    }
    stopTimer();
    shakeApp();
    fxScreenVignette(true);
    fx('💥 城墙失守！', 'bad', 50, 30);
    setTimeout(safe(function () { if (run && !run.ended) endRun('overrun'); }, 'overrun'), 700);
  }
}

function startTimer(sec) {
  stopTimer();
  timerDur = sec * 1000;
  timerEnd = performance.now() + timerDur;
  lastTickT = 0;
  tick();
}
function tick() {
  try {
    var now = performance.now();
    var dt = lastTickT ? Math.min(0.5, (now - lastTickT) / 1000) : 0;
    lastTickT = now;
    var left = timerEnd - now;
    var r = Math.max(0, left / timerDur);
    var f = $('timer-fill');
    f.style.width = (r * 100) + '%';
    f.className = 'timer-fill' + (r < 0.2 ? ' danger' : (r < 0.45 ? ' warn' : ''));
    /* 大军压境：答题期间敌军持续推进，关卡越高推得越快 */
    if (run && (run.mode === 'adventure' || run.mode === 'endless' || run.mode === 'expedition') && run.q && !run.q.locked && run.pressure < 100) {
      var creep = run.mode === 'endless' ? 0.5 + run.kills * 0.04 : 0.45 + (run.stage - 1) * 0.07;
      addPressure(creep * dt);
    }
    if (run && run.pressure >= 100) { timerRAF = null; return; }
    if (left <= 0) { timerRAF = null; onTimeout(); return; }
    timerRAF = requestAnimationFrame(tick);
  } catch (e) {
    /* rAF 链条绝不允许无声断掉：断掉=超时永不触发=题目永久答不动 */
    stopTimer();
    noteError('tick', e);
    setTimeout(scheduleRecover, 0);
  }
}
function stopTimer() {
  if (timerRAF) cancelAnimationFrame(timerRAF);
  timerRAF = null;
}
function onTimeout() {
  try {
    if (!run || !run.q || run.q.locked) return;
    var q = run.q;
    if (q.type === 'c2e' || q.type === 'e2c' || q.type === 'listen') {
      $('q-options').classList.add('locked');
      var cb = $('q-options').children[q.answer];
      if (cb) cb.classList.add('correct');
    }
    resolve(false, true);
  } catch (e) { noteError('onTimeout', e); recoverBattle(); }
}

/* ========================= 判定 & 战斗流程 ========================= */
function record(word) {
  if (!run.recordsBy[word.w]) {
    var r = { w: word.w, m: word.m, ok: 0, wrong: 0 };
    run.recordsBy[word.w] = r;
    run.records.push(r);
  }
  return run.recordsBy[word.w];
}

/* resolve 是主战斗链的总闸：锁题→掌握度→unit推进→击杀→续问，原先零保护，
   任一步抛异常（典型：脏档使 getM 给字符串属性赋值）就把玩家冻在
   「题已锁、表已停、无提示无恢复」的半渲染战斗页。这里整链兜底。 */
function resolve(ok, timedOut) {
  if (!run || !run.q || run.q.locked) return;
  try { resolveCore(ok, timedOut); }
  catch (e) { noteError('resolve', e); recoverBattle(); }
}
function resolveCore(ok, timedOut) {
  if (!run || !run.q || run.q.locked) return;
  var q = run.q;
  q.locked = true;
  stopTimer();
  cancelCharge();               /* 答题已锁定：进行中的蓄力作废 */
  $('btn-charge').hidden = true;
  var fogEl = $('q-options');   /* 迷雾词缀：作答即散雾，保证对错答案看得清 */
  if (fogEl) fogEl.classList.remove('fogged');
  run.answered++;
  bumpToday();
  logAnswer(ok);

  var word = q.word;
  var rec = record(word);
  updateMastery(word.w, ok, q.retries > 0);
  /* 词魂肉鸽·词根法师：先取上一题的词根作连锁参照，再记录本题词根 */
  var roguePrevRoots = null;
  if (run.rogue) {
    roguePrevRoots = run.rogue.lastRoots;
    var rpCur = parseCode(word.w);
    run.rogue.lastRoots = (rpCur && rpCur.roots) ? rpCur.roots.slice(0, 3) : [];
  }
  checkUnitAdvance();

  run.recent.push(word.w);
  if (run.recent.length > 3) run.recent.shift();

  /* 自适应难度：近 8 题正确率高则悄悄收紧时限，吃力则放宽 */
  run.hist.push(ok ? 1 : 0);
  if (run.hist.length > 8) run.hist.shift();
  if (run.hist.length >= 6) {
    var rate = run.hist.reduce(function (a, b) { return a + b; }, 0) / run.hist.length;
    if (rate >= 0.8) run.timerAdj = Math.max(-2, (run.timerAdj || 0) - 0.4);
    else if (rate <= 0.5) run.timerAdj = Math.min(2, (run.timerAdj || 0) + 0.4);
  }

  /* 贪婪词缀：金币 +50% 的代价——每答 1 题敌军压境 +2% */
  if (activeMod() === 'greed' && combatLike()) addPressure(2);

  if (ok) {
    run.correct++;
    run.combo++;
    if (activeMod() === 'curse' && run.combo > 3) run.combo = 3;   /* 诅咒词缀：连击封顶 3 连 */
    run.maxCombo = Math.max(run.maxCombo, run.combo);
    rec.ok++;
    run.timeline.push({ ok: 1, combo: run.combo });   /* 结算页节奏图数据 */
    addXp(2);
    /* 噩梦毒池：按实际作答的词记攻克——怪物血量>1 时题目会在毒词池随机轮转，
       若等 killMonster 只记怪物首题绑定的词，战报/成绩码会漏记后答对的毒词 */
    if (run.poison && run.poison.words.indexOf(word.w) >= 0) {
      run.poisonCleared[word.w] = true;
    }

    save.stats.maxCombo = Math.max(save.stats.maxCombo, run.combo);
    bumpTask('q_correct');
    if (q.type === 'spell') { save.stats.spellOk++; bumpTask('spell_ok'); }
    if (q.type === 'listen') { save.stats.listenOk++; bumpTask('listen_ok'); }
    setTask('combo_hit', run.combo);
    if (save.mastery[word.w] && save.mastery[word.w].seen === 1) bumpTask('new_words');
    if (run.combo > 0 && run.combo % 5 === 0) comboBurst();
    /* 答对击退敌军：连击越高退得越多（连击之魂天赋加成） */
    if (run.mode === 'adventure' || run.mode === 'endless' || run.mode === 'expedition') {
      addPressure(-(10 + Math.min(run.combo, 10) * 0.8) * (1 + 0.1 * talentLv('soul')));
    }
    /* 升到 3 星 = 攻克错题 */
    if (save.mastery[word.w] && save.mastery[word.w].lv >= 3 && save.wrongBook[word.w]) {
      delete save.wrongBook[word.w];
      toast('📕 已攻克错题：「' + word.w + '」');
      persist();
    }

    var gain = Math.round((5 + Math.min(run.combo, 10)) * coinMult());
    /* 词魂肉鸽天赋：听音游侠/复仇骑士金币 ×2；词根法师同根连锁 +8🪙 */
    if (run.rogue) {
      if (run.rogue.talent === 'ranger') gain *= 2;
      if (run.rogue.talent === 'knight' && q.isRevenge) gain *= 2;
      if (run.rogue.talent === 'mage' && q.retries === 0 && roguePrevRoots && roguePrevRoots.length) {
        var rcp = parseCode(word.w);
        if (rcp && rcp.roots.some(function (r0) { return roguePrevRoots.indexOf(r0) >= 0; })) {
          run.rogue.chainN = (run.rogue.chainN || 0) + 1;
          gain += 8;
          fx('🔗 词根连锁 ×' + run.rogue.chainN + '！', 'good', 25, 14);
        }
      }
    }
    save.coins += gain;
    run.coinsEarned += gain;

    /* 答对混过的词 → 清除混淆档案 */
    if ((q.type === 'c2e' || q.type === 'listen') && save.confuse && save.confuse[word.w]) {
      delete save.confuse[word.w];
    }

    Sfx.correct(run.combo);
    Sfx.coin();
    /* 蓄雷一击：每答对 6 题，下一击伤害翻倍；石肤词缀的护盾抵挡第一次伤害 */
    var dmg = 1;
    if (talentLv('smite')) {
      run.smiteN++;
      if (run.smiteN >= 6) { run.smiteN = 0; dmg = 2; fx('⚡ 蓄雷一击！伤害翻倍！', 'good', 25, 18); }
    }
    heroAttackFx('-' + (run.monster.boss ? dmg + '⚡' : dmg), gain, dmg === 2);
    if (run.monster.shield > 0) {
      run.monster.shield--;
      fx('🪨 石肤护盾抵挡了伤害！', 'bad', 25, 20);
    } else {
      run.monster.hp -= dmg;
    }
    if (run.monster.boss && run.monster.hp === 1 && !run.enrage) {
      run.enrage = true;
      fx('💢 BOSS 濒死狂暴！下一题提速！', 'bad', 25, 12);
    }
    updateHUD();
    paintMonsterVisual(monsterTraitOpts());   /* 血量变了：重画难度之角 */
    revealRune(word);                          /* 答完题：亮出词性 + 词根符文 */
    TTS.speak(word.w, false);

    if (run.monster.hp <= 0) {
      killMonster();
    } else {
      fx('BOSS 受伤了！再来！', 'good', 25, 22);
      var hitSeq = runEpoch;
      setTimeout(safe(function () {
        if (!run || run.ended || runEpoch !== hitSeq) return;
        askNext(false, null);
      }, 'hit-chain'), 700);
    }
  } else {
    run.combo = 0;
    run.wrongTotal++;
    rec.wrong++;
    run.timeline.push({ ok: 0, combo: 0 });   /* 结算页节奏图数据 */
    /* 错题入册（跨局累积） */
    var wb = save.wrongBook[word.w] || (save.wrongBook[word.w] = { n: 0, t: 0 });
    wb.n++;
    wb.t = Date.now();
    persist();
    if (run.mode !== 'review' && run.mode !== 'drill' && run.mode !== 'plan' && run.monster && run.monster.boss && run.bossMod === 'drain') {
      run.monster.hp = Math.min(run.monster.maxHp, run.monster.hp + 1);
      fx('🧲 BOSS 汲取回血 +1', 'bad', 22, 18);
      updateHUD();
    }
    if (run.mode === 'expedition' && run.bossMod === 'drain' && run.monster && run.monster.hp < run.monster.maxHp) {
      run.monster.hp++;   /* 远征精英关：汲取词缀对整关怪物生效 */
      fx('🧲 汲取词缀 怪物回血 +1', 'bad', 22, 18);
      updateHUD();
    }
    if (run.poison && run.poisonAffix === 'drain' && run.monster && run.monster.hp < run.monster.maxHp) {
      run.monster.hp++;
      fx('🧲 毒素反噬 怪物回血 +1', 'bad', 22, 18);
      updateHUD();
    }
    if (run.rogue && run.rogue.curse === 'drain' && run.monster && run.monster.hp < run.monster.maxHp) {
      run.monster.hp++;
      fx('🧲 汲取诅咒：怪物回血 +1', 'bad', 22, 18);
      updateHUD();
    }
    Sfx.wrong();
    $('q-card').classList.add('shake');
    setTimeout(function () { $('q-card').classList.remove('shake'); }, 450);
    fxScreenVignette(true);          /* 全屏红色边缘一闪：失误警示 */
    revealRune(word);
    if (combatLike()) castleHitFx(); /* 城堡被撞了一下：火花 + 抖动 */
    updateHUD();

    /* 局次守卫：撤退/城破/新开局后，旧局的记忆卡链不得再弹出或续问 */
    var missSeq = runEpoch;
    setTimeout(safe(function () {
      if (!run || run.ended || runEpoch !== missSeq) return;
      showMemCard(word, function () {
        monsterAttack(function () {
          if (q.retries < 1) {
            askNext(true, q.type);   // 立刻换题型重考同一个词
          } else {
            var queued = run.reinforce.some(function (r) { return r.w === word.w; });
            if (!queued && combatLike()) {
              run.reinforce.push({ w: word.w, m: word.m, at: run.answered + 4 + 2 * talentLv('focus') });
            }
            askNext(false, null);
          }
        });
      });
    }, 'miss-chain'), 650);
  }
}

function heroAttackFx(dmgText, coinGain, crit) {
  var hero = $('hero-emoji');
  hero.classList.remove('attack');
  void hero.offsetWidth;
  hero.classList.add('attack');
  var mon = $('monster-emoji');
  setTimeout(function () {
    mon.classList.remove('hit');
    void mon.offsetWidth;
    mon.classList.add('hit');
    slashAtMonster();               /* 斩击弧线扫过怪物 */
  }, 180);
  fx(dmgText, crit ? 'crit' : 'good', 22, 30);
  if (coinGain) fx('🪙 +' + coinGain, '', 30, 42);
}

function monsterAttack(cb) {
  var atkSeq0 = runEpoch;
  if (run.mode === 'review' || run.mode === 'plan' || run.mode === 'drill') {
    setTimeout(safe(function () { if (!run || run.ended || runEpoch !== atkSeq0) return; cb(); }, 'atk-review'), 250);
    return;
  }
  var mon = $('monster-emoji');
  /* 敌军攻势：换算成压境值（城墙加固 / 玄龟减伤） */
  var spike = run.diff.dmg * 2.2 + (run.monster.boss ? 4 : 0);
  if (run.monster.boss && run.bossMod === 'rage') spike *= 1.3;
  if (run.monster.boss && run.bossMod === 'thorn') spike += 5;
  if (run.poison && run.poisonAffix === 'rage') spike += 3;
  if (run.poison && run.poisonAffix === 'thorn') spike += 1;
  if (run.mode === 'expedition' && run.bossMod === 'rage') spike += 3;    /* 远征精英关：狂暴对整关生效 */
  if (run.mode === 'expedition' && run.bossMod === 'thorn') spike += 1;
  if (activeMod() === 'tide') spike += Math.min(15, run.answered);   /* 狂潮：每答 1 题攻势 +1% */
  if (run.rogue && run.rogue.curse === 'rage') spike *= 1.4;          /* 全局诅咒·怒火燎原 */
  if (run.rogue && run.rogue.curse === 'thorn') spike += 2;           /* 全局诅咒·荆棘之地 */
  /* 词魂肉鸽·复仇骑士：复仇题答错时友军按住兵刃，不伤城防 */
  var knightGuard = !!(run.rogue && run.rogue.talent === 'knight' && run.q && run.q.isRevenge);
  if (knightGuard) spike = 0;
  spike *= (1 - 0.08 * (save.upgrades.hp || 0));
  spike *= (1 - 0.05 * talentLv('vigor'));                            /* 天赋：钢铁城墙 */
  if (run.pet === 'turtle') spike *= 0.8;
  var atkSeq = runEpoch;   /* 若本局在 550ms 内终结/换局，不再续问旧题 */
  var after = function () { setTimeout(safe(function () { if (!run || run.ended || runEpoch !== atkSeq) return; cb(); }, 'atk-after'), 550); };

  if (run.shields > 0 && spike > 0) {
    run.shields--;
    fx('🛡️ 护盾抵挡敌军攻势！', 'good', 68, 45);
    Sfx.tone(880, .12, 'triangle', 0, .08);
    updateHUD();
    after();
    return;
  }
  if (spike > 0) {
    mon.classList.remove('hit');
    var hero = $('hero-emoji');
    hero.classList.remove('hurt');
    void hero.offsetWidth;
    hero.classList.add('hurt');
    Sfx.hurt();
    shakeApp();
    castleHitFx();   /* 城堡吃了一击：火花 + 抖动（裂纹分档由 updateCastleViz 依据压境值管理） */
    fx('敌军压境 +' + Math.round(spike) + '%', 'bad', 68, 45);
    addPressure(spike);
    if (run.pressure >= 100) return;   /* 城破流程已由 addPressure 触发 */
  } else {
    fx('🛡️ 复仇骑士：友军按住兵刃，城防无伤', 'good', 68, 45);
  }
  after();
}

function killMonster() {
  var m = run.monster;
  /* 不死词缀：每只怪第一次被击倒时以 1 血爬起来 */
  if (activeMod() === 'molt' && !m.moltUsed) {
    m.moltUsed = true;
    m.hp = 1;
    fx('🧟 不死词缀：它又爬起来了！', 'bad', 25, 22);
    updateHUD();
    var moltSeq = runEpoch;
    setTimeout(safe(function () {
      if (!run || run.ended || runEpoch !== moltSeq || run.monster !== m) return;
      askNext(false, null);
    }, 'molt-chain'), 800);
    return;
  }
  /* 毒词攻克已在 resolve 按实际答对的词记账（题目会在毒词池轮转，怪物首题绑定的词≠实际攻克） */
  run.kills++;
  save.stats.kills++;
  /* 词魂肉鸽·词根法师：击杀即溅射，下一只怪入场 -1 血 */
  if (run.rogue && run.rogue.talent === 'mage') run.rogue.splash = 1;
  addXp(m.boss ? 8 : 1);
  bumpTask('kill_total');
  if (run.mode === 'expedition') bumpTask('exp_kill');
  if (m.boss) { save.stats.bosses++; bumpTask('boss_kill'); }
  var me = $('monster-emoji');
  me.classList.add('dead');
  Sfx.kill();
  killBurstFx();   /* 定点粒子爆裂 + 冲击环 + 轻震 */
  if (m.boss) {
    $('scr-battle').classList.remove('boss-live');
    Confetti.burst(70);
  }
  var bonus = Math.round((m.boss ? 40 : 10) * coinMult() * (m.boss ? (1 + 0.25 * talentLv('slayer')) : 1));
  save.coins += bonus;
  run.coinsEarned += bonus;
  fx(m.boss ? 'BOSS 击败！🪙+' + bonus : '击杀！🪙+' + bonus, 'good', 25, 25);
  updateHUD();

  var killSeq = runEpoch;
  setTimeout(safe(function () {
    if (!run || run.ended || runEpoch !== killSeq) return;
    if (run.mode === 'review' || run.mode === 'plan' || run.mode === 'drill') {
      if (run.mode === 'plan') { ensurePlanDay(); save.planDay.done = run.kills; persist(); }
      if (run.kills >= run.reviewTotal) { endRun('done'); return; }
      nextMonster();
      return;
    }
    if (run.mode === 'endless') {
      save.best.endless = Math.max(save.best.endless, run.kills);
      persist();
      if (run.kills % 10 === 0) {
        addPressure(-6);
        fx('🏆 连杀奖励 压境-6%', 'good', 50, 20);
      }
      nextMonster();
      return;
    }
    // adventure
    run.killedInStage++;
    if (run.killedInStage >= run.stageSize) {
      stageClear();
    } else {
      nextMonster();
    }
  }, 'kill-chain'), 800);
}

function stageClear() {
  var bonus = Math.round((20 + run.stage * 2) * coinMult());
  save.coins += bonus;
  run.coinsEarned += bonus;
  addXp(8);
  if (run.mode === 'adventure' && !run.poison && !run.rogue) save.best.adventure = Math.max(save.best.adventure, run.stage);
  if (run.packId && !run.poison) markPackDone();   /* 主题挑战包：通过第 1 关那一刻即计完成 */
  persist();
  Sfx.levelup();
  Confetti.burst(60);
  if (run.poison) { endRun('done'); return; }   /* 噩梦关卡一战定胜负，不进商店 */
  if (run.rogue) {
    /* 词魂肉鸽：第 6 关 BOSS 拿下即加冕通关（+100🪙 加冕礼），城破之外的结算不进商店 */
    if (run.stage >= ROGUE_STAGES) {
      var rogueBonus = 100;
      save.coins += rogueBonus;
      run.coinsEarned += rogueBonus;
      persist();
      endRun('done');
      return;
    }
    openShop();
    return;
  }
  if (run.mode === 'expedition') {
    if (run.stage >= EXP_STAGES.length) { endRun('done'); return; }   /* BOSS 关拿下：远征告捷 */
    openShop();
    return;
  }
  openShop();
}

/* ========================= 商店 ========================= */
function openShop() {
  /* 商店重建段兜底：半空商店有 btn-next-stage 可逃生，但直接把局救活更顺 */
  try { openShopCore(); }
  catch (e) { noteError('openShop', e); recoverBattle(); }
}
function openShopCore() {
  showScreen('scr-shop');
  $('shop-coins').textContent = save.coins;
  $('shop-sub').textContent = '第 ' + run.stage + ' 关通关！奖励 🪙' + Math.round((20 + run.stage * 2) * coinMult()) + ' · 当前第 ' + run.stage + ' 关';

  var wrap = $('shop-items');
  wrap.innerHTML = '';
  SHOP_ITEMS.forEach(function (item) {
    var price = Math.max(1, Math.round(item.price * (1 - 0.15 * talentLv('haggle'))));   /* 天赋：行囊议价 */
    var div = document.createElement('div');
    div.className = 'shop-item';
    var owned = item.id === 'shield' ? '（现有 ' + run.shields + '）'
      : item.id === 'hint' ? '（现有 ' + run.hints + '）'
      : item.id === 'hourglass' ? (run.hgStack ? '（下关 +' + (run.hgStack) + 's）' : '')
      : '（当前压境 ' + Math.round(run.pressure) + '%）';
    div.innerHTML =
      '<div class="si-icon">' + item.icon + '</div>' +
      '<div class="si-name">' + item.name + '</div>' +
      '<div class="si-desc">' + item.desc + '</div>' +
      '<div class="si-owned">' + owned + '</div>';
    var btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = '🪙 ' + price;
    btn.disabled = save.coins < price;
    btn.onclick = function () {
      if (save.coins < price) return;
      save.coins -= price;
      if (item.id === 'potion') run.pressure = Math.max(0, run.pressure - 25);
      if (item.id === 'shield') run.shields++;
      if (item.id === 'hourglass') run.hgStack += 3;
      if (item.id === 'hint') run.hints += 3;
      Sfx.coin();
      persist();
      openShop();
    };
    div.appendChild(btn);
    wrap.appendChild(div);
  });

  var upWrap = $('shop-upgrades');
  upWrap.innerHTML = '';
  UPGRADES.forEach(function (u) {
    var lv = save.upgrades[u.id] || 0;
    var maxed = lv >= u.max;
    var cost = upgradeCost(u);
    var div = document.createElement('div');
    div.className = 'shop-item' + (maxed ? ' maxed' : '');
    div.innerHTML =
      '<div class="si-icon">' + u.icon + '</div>' +
      '<div class="si-name">' + u.name + ' Lv.' + lv + '</div>' +
      '<div class="si-desc">' + u.desc + '</div>' +
      '<div class="si-owned">' + (maxed ? '已满级' : '效果永久生效') + '</div>';
    var btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = maxed ? 'MAX' : '🪙 ' + cost;
    btn.disabled = maxed || save.coins < cost;
    btn.onclick = function () {
      if (maxed || save.coins < cost) return;
      save.coins -= cost;
      save.upgrades[u.id] = lv + 1;
      if (u.id === 'hp') run.pressure = Math.max(0, run.pressure - 8);
      Sfx.levelup();
      persist();
      openShop();
    };
    div.appendChild(btn);
    upWrap.appendChild(div);
  });

  var petWrap = $('shop-pets');
  petWrap.innerHTML = '';
  PETS.forEach(function (p) {
    var owned = !!save.pets[p.id];
    var div = document.createElement('div');
    div.className = 'shop-item' + (save.pet === p.id ? ' equipped' : '');
    div.innerHTML =
      '<div class="si-icon">' + p.icon + '</div>' +
      '<div class="si-name">' + p.name + '</div>' +
      '<div class="si-desc">' + p.desc + '</div>' +
      '<div class="si-owned">' + (save.pet === p.id ? '⚔️ 出战中' : (owned ? '已拥有' : '一次性买断')) + '</div>';
    var btn = document.createElement('button');
    btn.className = 'btn';
    if (!owned) {
      btn.textContent = '🪙 ' + p.price;
      btn.classList.add('btn-primary');
      btn.disabled = save.coins < p.price;
      btn.onclick = function () {
        if (save.coins < p.price) return;
        save.coins -= p.price;
        save.pets[p.id] = 1;
        save.pet = p.id;
        if (run) run.pet = p.id;
        Sfx.levelup();
        toast('🐣 获得宠物：' + p.name + '，已自动出战！');
        checkAch(); persist(); openShop(); updateHUD();
      };
    } else if (save.pet === p.id) {
      btn.textContent = '卸下';
      btn.onclick = function () {
        save.pet = '';
        if (run) run.pet = '';
        persist(); openShop(); updateHUD();
      };
    } else {
      btn.textContent = '装备';
      btn.onclick = function () {
        save.pet = p.id;
        if (run) run.pet = p.id;
        Sfx.coin();
        toast(p.icon + ' ' + p.name + ' 出战！');
        persist(); openShop(); updateHUD();
      };
    }
    div.appendChild(btn);
    petWrap.appendChild(div);
  });
}

/* ========================= 结算 ========================= */
/* 主题挑战包完成：按「通过第 1 关」计（stageClear 通关那一刻调用；endRun 非撤退结局兜底）。
   packDone 只记首次（旧成就 pack1 兼容），packDoneMap 按包记档案（成就「包罗万象」） */
function markPackDone() {
  if (!run || !run.packId) return;
  if (!save.stats.packDoneMap) save.stats.packDoneMap = {};
  var firstEver = !save.stats.packDone;
  var firstOfThis = !save.stats.packDoneMap[run.packId];
  if (!firstEver && !firstOfThis) return;
  save.stats.packDone = 1;
  save.stats.packDoneMap[run.packId] = 1;
  persist();
  if (firstEver) toast('🧩 主题挑战包完成成就达成！');
  else if (firstOfThis) toast('🧩 「' + (packById(run.packId) || {}).name + '」打包完成！成就 +1');
  checkAch();
}
/* 结算收局：原先「先构建全部结算 HTML，最后才置 run.ended + 切屏」——构建段抛异常
   （脏档 mastery[r.w].lv 为负/字符串 → '★'.repeat 抛 RangeError）则局收不掉，
   玩家卡在战斗页，点退出还会在同行反复炸。现在：先收局切屏，再分段降级构建。 */
function endRun(reason) {
  try { endRunCore(reason); }
  catch (e) {
    noteError('endRun', e);
    try { emergencyEndRun(reason); }
    catch (x) { try { goHomeSafe(); } catch (y) {} }
  }
}
function starsOf(lv) {
  lv = Math.max(0, Math.min(5, Math.floor(Number(lv) || 0)));   /* 脏档负/巨 lv 不再引爆 repeat */
  return '★'.repeat(lv) + '☆'.repeat(5 - lv);
}
function endRunCore(reason) {
  stopTimer();
  BGM.stop();
  cancelCharge();
  $('memcard').hidden = true;
  memCb = null;
  $('banner').hidden = true;
  if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
  run.ended = reason;   /* 关键：先收局——此后任何一步失败都不会把玩家冻在战斗页 */
  var titles = { dead: '💀 你倒下了…', overrun: '🏰 城墙失守…', quit: '🏳️ 撤退整顿', done: '🎉 复习完成！' };
  try {
    save.stats.runs++;
    bumpTask('run_any');
    /* 主题挑战包：通关第 1 关那一刻已在 stageClear 计完成（含之后撤退）；
       此处兜底「已进第 2 关（必经通关）后的非撤退结局」，第 1 关未通关非撤退结束不计 */
    if (run.packId && run.stage >= 2 && reason !== 'quit') markPackDone();
    if (reason === 'done') addXp(10);
    if (run.mode === 'review' || run.mode === 'drill') bumpTask('review_done');
    if (run.answered >= 10 && run.wrongTotal === 0) save.stats.perfects++;
    /* 每日远征：积分入档 + 当日首通奖励（积分=击杀×10+答对×2+最高连击×5+通关100） */
    if (run.mode === 'expedition') {
      var sc = expScore(reason);
      run.expScore = sc;
      var today = expDayStamp();
      var wasCleared = expTodayCleared();   /* 今天已经通关过 */
      var oldBest = (save.expedition && save.expedition.date === today) ? (save.expedition.best || 0) : 0;
      save.expedition = {
        date: today,
        best: Math.max(oldBest, sc),
        clearDate: (wasCleared || reason === 'done') ? today : ''   /* 跨日后旧 clearDate 一律作废 */
      };
      if (reason === 'done') {
        save.stats.expWins = (save.stats.expWins || 0) + 1;
        if (!wasCleared) {
          var eb = 80;
          save.coins += eb;
          run.coinsEarned += eb;
          Confetti.burst(90);
          toast('🚀 今日远征首通！奖励 🪙' + eb);
        }
      } else if (oldBest > 0 && sc > oldBest) {
        toast('🚀 远征新纪录：' + sc + ' 分！');
      }
      persist();
    }
    /* 词魂肉鸽入档：出征/加冕/诅咒图鉴/最高连锁（须在 checkAch 之前写好） */
    if (run.rogue) {
      save.rogue = save.rogue || { runs: 0, wins: 0, bestChain: 0, cursesSeen: {} };
      save.rogue.runs = (save.rogue.runs || 0) + 1;
      if (reason === 'done') save.rogue.wins = (save.rogue.wins || 0) + 1;
      if (run.rogue.curse) {
        save.rogue.cursesSeen = save.rogue.cursesSeen || {};
        save.rogue.cursesSeen[run.rogue.curse] = 1;
      }
      save.rogue.bestChain = Math.max(save.rogue.bestChain || 0, run.rogue.chainN || 0);
      persist();
    }
    checkAch();
    if (run.mode === 'drill' && reason === 'done') titles.done = '🔥 强化训练完成！';
    if (run.mode === 'expedition') {
      if (reason === 'done') titles.done = '🚀 远征告捷！';
      else if (reason === 'quit') titles.quit = '🏳️ 远征撤退';
    }
    if (run.poison && reason === 'done') titles.done = '☠️ 噩梦通关！';
    if (run.poison && reason === 'quit') titles.quit = '🏳️ 逃出毒池';
    if (run.rogue && reason === 'done') titles.done = '👑 词魂加冕！';
    if (run.rogue && reason === 'quit') titles.quit = '🏳️ 词魂撤退';
    if (run.mode === 'plan' && reason === 'done') {
      titles.done = '🎯 今日计划完成！';
      ensurePlanDay();
      if (!save.planDay.complete) {
        save.planDay.complete = true;
        var bonusP = 50;
        save.coins += bonusP;
        run.coinsEarned += bonusP;
        Confetti.burst(100);
        toast('🎯 今日计划完成！奖励 🪙' + bonusP);
        checkAch();
      }
    }
    if (run.mode === 'adventure' && !run.poison && !run.rogue) {
      save.best.adventure = Math.max(save.best.adventure, run.stage);
    } else if (run.mode === 'endless') {
      save.best.endless = Math.max(save.best.endless, run.kills);
    }
    persist();
  } catch (e) {
    /* 记账段失败不阻断结算展示：金币/远征/成就入档能保多少保多少 */
    noteError('endRun-stats', e);
    try { persistNow(); } catch (x) {}
  }

  showScreen('scr-result');
  try { $('result-title').textContent = titles[reason] || '⚔️ 冒险结束'; } catch (e) {}

  try {
    var acc = run.answered ? Math.round(run.correct / run.answered * 100) : 0;
    var stats = [];
    if (run.poison) stats.push('☠️ 毒词攻克 ' + Object.keys(run.poisonCleared || {}).length + '/' + run.poison.words.length);
    else if (run.mode === 'adventure' && run.rogue) {
      var rgt = rogueTalent(run.rogue.talent);
      stats.push('🎲 ' + (reason === 'done' ? '词魂加冕！' : '止步第 ' + run.stage + ' 关'), '⚔️ 击杀 ' + run.kills);
      if (rgt) stats.push(rgt.icon + ' ' + rgt.name);
      if ((run.rogue.chainN || 0) > 0) stats.push('🔗 词根连锁 ×' + run.rogue.chainN);
    } else if (run.mode === 'adventure') stats.push('🏆 抵达第 ' + run.stage + ' 关', '⚔️ 击杀 ' + run.kills);
    if (run.mode === 'endless') stats.push('⚔️ 击杀 ' + run.kills + ' 只');
    if (run.mode === 'expedition') stats.push('🚀 远征积分 ' + (run.expScore || 0), '⚔️ 击杀 ' + run.kills + ' / 19',
      '📈 今日最高 ' + ((save.expedition && save.expedition.date === expDayStamp()) ? save.expedition.best : 0));
    if (run.mode === 'review') stats.push('📖 复习 ' + run.kills + ' 词');
    if (run.mode === 'drill') stats.push('🔥 强化 ' + run.kills + ' 词');
    if (run.mode === 'plan') stats.push('🎯 计划完成 ' + run.kills + ' 词');
    stats.push('✏️ 答题 ' + run.answered + ' 题', '🎯 正确率 ' + acc + '%', '🔥 最高连击 ' + run.maxCombo, '🪙 获得 ' + run.coinsEarned, '📅 连续打卡 ' + save.streak.count + ' 天');
    $('result-stats').innerHTML = stats.map(function (s) { return '<span class="chip">' + s + '</span>'; }).join('');
  } catch (e) {
    try { $('result-stats').textContent = '✏️ 答题 ' + (run.answered || 0) + ' 题 · 本局战绩已保存'; } catch (x) {}
  }

  try {
    var wrongs = run.records.filter(function (r) { return r.wrong > 0; });
    var rows = run.records.map(function (r) {
      var lv = (save.mastery[r.w] || {}).lv || 0;
      var mark = r.wrong === 0 ? '✅' : '❌';
      return '<div class="rw-row"><span class="rw-mark">' + mark + '</span><span class="rw-word">' + r.w + '</span><span class="rw-mean">' + r.m + '</span><span class="rw-stars">' + starsOf(lv) + '</span></div>';
    });
    $('result-words').innerHTML = rows.length ? rows.join('') : '<p class="hint">本局没有遇到新单词</p>';
    $('btn-retry-wrong').hidden = wrongs.length < 2 || !!run.poison;
  } catch (e) {
    try { $('result-words').innerHTML = '<p class="hint">战报渲染失败，本局记录已保存</p>'; } catch (x) {}
    try { $('btn-retry-wrong').hidden = true; } catch (x) {}
  }

  try {
    /* 噩梦关卡结算：记录「我闯的毒」战绩，并备好成绩码 */
    if (run.poison) {
      logPoison({
        role: 'play',
        words: run.poison.words.slice(),
        cleared: Object.keys(run.poisonCleared || {}).length,
        total: run.poison.words.length,
        win: reason === 'done'
      });
    }
    $('btn-result-code').hidden = !run.poison;
    /* 一键投毒顺手化：有复仇词或混淆对可投时，投毒按钮脉动提示 */
    var canPoison = buildEnc() && (run.records.some(function (r) { return r.wrong >= 2 && ENC_INDEX[r.w] !== undefined; }) ||
      topConfusePairs(2).length > 0);
    $('btn-poison-export').classList.toggle('charged', canPoison);
  } catch (e) {
    try { $('btn-result-code').hidden = true; } catch (x) {}
  }

  try { refreshHome(); } catch (e) {}
  try { drawResultViz(); } catch (e) {}   /* 战绩可视化：屏幕可见后绘制才有宽度 */
  flushSwReload();
}
/* 结算兜底中最小可用版本：run.ended 已由 endRunCore 置位；这里只保证
   「切到结算页 + 一行说明」。连它都失败则 goHomeSafe 由外层接手。 */
function emergencyEndRun(reason) {
  try { stopTimer(); } catch (x) {}
  try { BGM.stop(); } catch (x) {}
  try { cancelCharge(); } catch (x) {}
  try { if (run) run.ended = reason || 'error'; } catch (x) {}
  try { $('memcard').hidden = true; memCb = null; $('banner').hidden = true; } catch (x) {}
  try { persistNow(); } catch (x) {}
  showScreen('scr-result');
  try {
    $('result-title').textContent = '⚔️ 冒险结束';
    $('result-stats').textContent = '结算渲染遇到问题，本局进度已保存';
    $('result-words').innerHTML = '';
    $('btn-result-code').hidden = true;
    $('btn-retry-wrong').hidden = true;
  } catch (x) {}
  try { refreshHome(); } catch (x) {}
  flushSwReload();
}

/* 结算页战绩可视化：一题一柱，绿柱高度=当时连击，红点=失误，星标=最高连击点 */
function drawResultViz() {
  var cv = $('result-canvas');
  if (!cv) return;
  var tl = run.timeline || [];
  if (!tl.length) { cv.hidden = true; return; }
  cv.hidden = false;
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var W = cv.clientWidth || 460, H = 96;
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  var c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);
  var pad = 10, top = 22, base = H - 18;
  var n = tl.length;
  var slot = (W - pad * 2) / n;
  var bw = Math.max(3, Math.min(22, slot - 2));
  /* 基线 */
  c.strokeStyle = 'rgba(255,255,255,.2)';
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(pad, base + .5); c.lineTo(W - pad, base + .5); c.stroke();
  var maxCombo = 0, maxAt = -1;
  for (var i = 0; i < n; i++) {
    if (tl[i].ok && tl[i].combo > maxCombo) { maxCombo = tl[i].combo; maxAt = i; }
  }
  for (i = 0; i < n; i++) {
    var x = pad + i * slot + (slot - bw) / 2;
    var t = tl[i];
    if (t.ok) {
      var h = Math.min(base - top, 8 + (t.combo - 1) * 5);
      var g = c.createLinearGradient(0, base - h, 0, base);
      g.addColorStop(0, '#3ddc84');
      g.addColorStop(1, 'rgba(61,220,132,.25)');
      c.fillStyle = g;
      c.fillRect(x, base - h, bw, h);
      if (i === maxAt && maxCombo >= 3) {
        c.fillStyle = '#ffd166';
        c.font = 'bold 10px sans-serif';
        c.textAlign = 'center';
        c.fillText('★' + maxCombo, x + bw / 2, base - h - 4);
      }
    } else {
      c.fillStyle = '#ff5d73';
      c.beginPath();
      c.arc(x + bw / 2, base + 6, 3.2, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.fillStyle = 'rgba(255,255,255,.55)';
  c.font = '10px sans-serif';
  c.textAlign = 'left';
  c.fillText('本局节奏 · 绿柱=答对（高度=当时连击）· 红点=失误', pad, 12);
}

function retryWrong() {
  var wrongs = run.records.filter(function (r) { return r.wrong > 0; });
  var pool = wrongs.map(function (r) { return { w: r.w, m: r.m }; });
  var ids = (save.lastLists || []).filter(function (id) { return !!listById(id); });
  if (!ids.length) ids = ['cet4'];
  startRun('review', ids, 'normal', pool);
}

/* ========================= HUD / 特效 / 覆盖层 ========================= */
function updateHUD() {
  if (!run) return;
  $('battle-coins').textContent = save.coins;

  var combo = $('battle-combo');
  if (run.combo >= 2) {
    combo.textContent = '🔥 ×' + run.combo;
    combo.classList.remove('show');
    void combo.offsetWidth;
    combo.classList.add('show');
  } else {
    combo.classList.remove('show');
  }
  /* 连击全屏节奏反馈：火光从屏幕边缘随连击升温、加快 */
  var heat = run.combo >= 10 ? 3 : (run.combo >= 6 ? 2 : (run.combo >= 3 ? 1 : 0));
  var scrB = $('scr-battle');
  scrB.classList.toggle('combo-heat-1', heat === 1);
  scrB.classList.toggle('combo-heat-2', heat === 2);
  scrB.classList.toggle('combo-heat-3', heat === 3);

  if (run.mode === 'adventure') {
    if (run.poison) {
      $('battle-stage').textContent = '☠️ 毒池 ' + run.kills + '/' + run.stageSize;
    } else if (run.rogue) {
      $('battle-stage').textContent = '🎲 ' + (run.bossStage ? '⚠️ ' : '') + '第 ' + run.stage + '/' + ROGUE_STAGES + ' 关';
    } else {
      $('battle-stage').textContent = (run.bossStage ? '⚠️ ' : '') + '第 ' + run.stage + ' 关';
    }
    var remain = run.stageSize - run.killedInStage;
    $('monster-queue').textContent = run.bossStage ? '' : '👹 ×' + remain;
  } else if (run.mode === 'expedition') {
    $('battle-stage').textContent = '🚀 第 ' + run.stage + '/' + EXP_STAGES.length + ' 关' +
      (run.bossStage ? ' ⚠️' : (run.bossMod ? ' ⚠️精英' : ''));
    var remainExp = run.stageSize - run.killedInStage;
    $('monster-queue').textContent = run.bossStage ? '' : '👹 ×' + remainExp;
  } else if (run.mode === 'endless') {
    $('battle-stage').textContent = '击杀 ' + run.kills;
    $('monster-queue').textContent = '';
  } else if (run.mode === 'plan') {
    $('battle-stage').textContent = '🎯 计划 ' + run.kills + '/' + run.reviewTotal;
    $('monster-queue').textContent = '';
  } else if (run.mode === 'drill') {
    $('battle-stage').textContent = '🔥 强化 ' + run.kills + '/' + run.reviewTotal;
    $('monster-queue').textContent = '';
  } else {
    $('battle-stage').textContent = '📖 复习 ' + run.kills + '/' + run.reviewTotal;
    $('monster-queue').textContent = '';
  }

  if (run.monster) {
    $('monster-hp-fill').style.width = (run.monster.hp / run.monster.maxHp * 100) + '%';
  }
  /* 大军压境条（守城模式） */
  var combat = (run.mode === 'adventure' || run.mode === 'endless' || run.mode === 'expedition');
  $('pressure-wrap').style.display = combat ? '' : 'none';
  var heroBar = $('hero-hp-fill').parentElement;
  heroBar.style.display = 'none';   /* 守城模式不再用血条 */
  if (combat) {
    var p = Math.round(run.pressure);
    $('pressure-fill').style.width = p + '%';
    $('pressure-army').style.left = p + '%';
    $('pressure-label').textContent = '城防 ' + Math.max(0, 100 - p) + '%';
    $('pressure-bar').classList.toggle('critical', p >= 70);
    $('hero-hp-text').textContent = '🏰 城防 ' + Math.max(0, 100 - p) + '%';
    updateCastleViz();   /* 城堡裂纹分档 + 火光烟雾随压境值变化 */
  }
  var buffs = [];
  if (run.shields) buffs.push('🛡️×' + run.shields);
  if (run.hgStack) buffs.push('⏳+' + run.hgStack + 's');
  if (run.hints) buffs.push('💡×' + run.hints);
  $('hero-buffs').textContent = buffs.join(' ');
  var petIcon = run.pet ? (petById(run.pet) || {}) : null;
  $('pet-emoji').textContent = petIcon ? petIcon.icon : '';
}

function fx(text, cls, x, y) {
  var d = document.createElement('div');
  d.className = 'fx-dmg' + (cls ? ' ' + cls : '');
  d.textContent = text;
  d.style.left = (x || 40) + '%';
  d.style.top = (y || 30) + '%';
  $('fx-layer').appendChild(d);
  setTimeout(function () { d.remove(); }, 1000);
}

var memCb = null;
function showMemCard(word, cb) {
  var emoji = (typeof EMOJI_OF !== 'undefined' && EMOJI_OF[word.w]) ? EMOJI_OF[word.w] : '';
  $('mem-emoji').textContent = emoji;
  $('mem-emoji').hidden = !emoji;
  $('mem-word').textContent = word.w;
  $('mem-meaning').textContent = word.m;
  var code = wordCode(word.w);
  $('mem-code').textContent = code ? '🔑 词汇密码：' + code : '';
  $('mem-code').hidden = !code;
  /* 同根词家族 */
  var fam = wordFamily(word.w);
  var famEl = $('mem-family');
  if (fam.length) {
    var html = '<div class="fam-label">👨‍👩‍👧 同根词家族（点击发音）</div>';
    fam.forEach(function (f) {
      html += '<button class="fam-chip" data-w="' + f.w + '">' + f.w + '<small>' + f.m.split('；')[0].replace(/^(n|v|adj|adv|prep|conj|pron)\.\s*/, '') + '</small></button>';
    });
    famEl.innerHTML = html;
    famEl.hidden = false;
  } else {
    famEl.hidden = true;
  }
  /* 跟读挑战（浏览器支持才显示） */
  $('mem-speak-btn').hidden = !Rec.ok;
  $('mem-speak-btn').classList.remove('listening');
  $('mem-speak-btn').disabled = false;
  $('mem-speak-btn').textContent = '🎤 跟读挑战 +5🪙';
  $('memcard').hidden = false;
  memCb = cb;
  TTS.speak(word.w, true);
}
function closeMemCard() {
  if ($('memcard').hidden) return;
  $('memcard').hidden = true;
  var cb = memCb; memCb = null;
  if (cb) cb();
}

var bannerTimer = null;
function showBanner(main, sub, cb, dur) {
  var box = $('banner-box');
  box.innerHTML = main + (sub ? '<small>' + sub + '</small>' : '');
  box.style.animation = 'none';
  void box.offsetWidth;
  box.style.animation = '';
  $('banner').hidden = false;
  if (bannerTimer) clearTimeout(bannerTimer);
  bannerTimer = setTimeout(function () {
    $('banner').hidden = true;
    if (cb) cb();
  }, dur || 1500);
}

function applyTheme(idx) {
  var t = THEMES[idx % THEMES.length];
  var scr = $('scr-battle');
  scr.className = 'screen active ' + t[0];
  makeDeco($('battle-deco'), t[2], 9);
}

function makeDeco(el, emojis, n) {
  el.innerHTML = '';
  for (var i = 0; i < n; i++) {
    var s = document.createElement('span');
    s.textContent = rnd(emojis);
    s.style.left = (Math.random() * 96) + '%';
    s.style.fontSize = (14 + Math.random() * 22) + 'px';
    s.style.animationDuration = (14 + Math.random() * 16) + 's';
    s.style.animationDelay = (-Math.random() * 20) + 's';
    el.appendChild(s);
  }
}

/* ========================= 错题本 ========================= */
function openWrongBook() {
  showScreen('scr-wrong');
  renderWrongBook();
}
function renderWrongBook() {
  var entries = Object.keys(save.wrongBook).map(function (w) {
    return { w: w, n: save.wrongBook[w].n, t: save.wrongBook[w].t };
  }).sort(function (a, b) { return b.n - a.n || b.t - a.t; });
  var totalWrong = entries.reduce(function (s, e) { return s + e.n; }, 0);
  $('wrong-stats').innerHTML =
    '<span class="chip">📕 待攻克 ' + entries.length + ' 词</span>' +
    '<span class="chip">✗ 累计答错 ' + totalWrong + ' 次</span>' +
    '<span class="chip">💡 答对升到 3 星自动出册</span>';
  if (!entries.length) {
    $('wrong-list').innerHTML = '<p class="hint">错题本是空的——答错的单词会自动记录在这里，快去守城吧！</p>';
    $('btn-drill').disabled = true;
    return;
  }
  $('btn-drill').disabled = entries.length < 2;
  var rows = entries.slice(0, 60).map(function (e) {
    var m = meaningOfAny(e.w) || '';
    var lv = (save.mastery[e.w] || {}).lv || 0;
    var stars = '★'.repeat(lv) + '☆'.repeat(5 - lv);
    return '<div class="rw-row"><span class="rw-mark">✗</span><span class="rw-word">' + e.w +
      '</span><span class="rw-mean">' + m + '</span><span class="rw-stars">×' + e.n + ' · ' + stars + '</span></div>';
  });
  var extra = entries.length > 60 ? '<p class="hint">仅显示前 60 个（按答错次数排序）</p>' : '';
  $('wrong-list').innerHTML = rows.join('') + extra;
}
function startDrill() {
  var entries = Object.keys(save.wrongBook).map(function (w) {
    return { w: w, n: save.wrongBook[w].n };
  }).sort(function (a, b) { return b.n - a.n; }).slice(0, 12);
  var pool = [];
  entries.forEach(function (e) {
    var m = meaningOfAny(e.w);
    if (m) pool.push({ w: e.w, m: m });
  });
  if (pool.length < 2) { toast('错题不足 2 个，先去积累一些吧'); return; }
  var ids = (save.lastLists || []).filter(function (id) { return !!listById(id); });
  if (!ids.length) ids = ['cet4'];
  startRun('drill', ids, 'normal', pool);
}

/* ========================= 屏幕切换 ========================= */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function (s) {
    s.classList.toggle('active', s.id === id);
  });
}

function refreshHome() {
  $('home-streak').textContent = save.streak.count;
  $('home-coins').textContent = save.coins;
  $('home-mastered').textContent = masteredCount();
  $('home-today').textContent = save.streak.todayCount;
  $('home-level').textContent = save.level;
  $('btn-talent').textContent = '✨ 天赋' + (save.talentPts > 0 ? ' +' + save.talentPts : '');
  /* 每日远征入口：当日已通关/历史最高分直接写在按钮上 */
  var expSub = $('exp-sub');
  if (expSub) {
    var sameDay = save.expedition && save.expedition.date === expDayStamp();
    expSub.textContent = expTodayCleared() ? ('今日已告捷 · 最高 ' + (sameDay ? save.expedition.best : 0) + ' 分')
      : (sameDay && save.expedition.best > 0 ? '今日最高 ' + save.expedition.best + ' 分 · 再冲一波'
      : '每日固定关卡 · 全员同题');
  }
  renderDaily();
  renderPlan();
  persist();
}

/* ========================= 出战设置 ========================= */
function openSetup(mode) {
  if (!buildEnc()) { showLoadFail(); return; }
  setupMode = mode;
  var titles = { adventure: '🧭 出战准备', endless: '♾️ 无尽挑战', review: '📖 复习设置', expedition: '🚀 每日远征' };
  $('setup-title').textContent = titles[mode] || titles.adventure;
  $('setup-diff-wrap').style.display = (mode === 'review') ? 'none' : '';
  renderSetupLists();

  var radios = document.querySelectorAll('input[name=diff]');
  radios.forEach(function (r) { r.checked = (r.value === save.lastDiff); });
  $('setup-size').value = String(save.sessionSize || 10);
  /* 远征词池/每关怪量全部由当日种子钉死（planExpedition 20 词 + EXP_STAGES），
     本局词量对远征无效——下拉禁用防误改（改了只会漏到以后的冒险/复习局） */
  $('setup-size').disabled = (mode === 'expedition');
  $('size-note').textContent = mode === 'review' ? '本次复习的单词数量'
    : (mode === 'expedition' ? '远征词量由今日种子决定（20 词）' : '每关出战的单词数量');

  showScreen('scr-setup');
}

function renderSetupLists() {
  var wrap = $('setup-lists');
  wrap.innerHTML = '';
  var last = (save.lastLists || []).filter(function (id) { return !!listById(id); });
  if (!last.length) last = ['cet4'];
  allLists().forEach(function (l) {
    var learned = 0, total = l.words.length;
    l.words.forEach(function (p) { var m = save.mastery[p[0]]; if (m && m.seen > 0) learned++; });
    var label = document.createElement('label');
    label.className = 'list-opt';
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = last.indexOf(l.id) >= 0;
    cb.dataset.listId = l.id;
    var info = document.createElement('div');
    info.innerHTML = '<div class="lst-name">' + l.name + '</div><div class="lst-sub">' + l.desc + ' · ' + total + ' 词 · 已学 ' + learned + '</div>';
    label.appendChild(cb);
    label.appendChild(info);
    if (l.id.indexOf('c') === 0 && l.id.length > 5) {
      var del = document.createElement('button');
      del.className = 'lst-del';
      del.textContent = '🗑️';
      del.title = '删除该词库';
      del.onclick = function (e) {
        e.preventDefault();
        if (!confirm('删除词库「' + l.name + '」？（学习记录保留）')) return;
        save.customLists = save.customLists.filter(function (x) { return x.id !== l.id; });
        persist();
        renderSetupLists();
        renderCustomLists();
      };
      label.appendChild(del);
    }
    wrap.appendChild(label);
  });
  updateSetupHint();
}

function updateSetupHint() {
  var ids = checkedListIds();
  var n = buildPool(ids).length;
  $('setup-hint').textContent = n ? ('共选择 ' + n + ' 个单词，加油！') : '至少选择一个词库';
  $('btn-start').disabled = n === 0;
  renderUnitRow(ids);
}

/* 单元模式选择行：词库勾选变化时刷新 */
function renderUnitRow(ids) {
  var primary = null;
  ids.some(function (id) { if (WORD_LISTS.some(function (l) { return l.id === id; })) { primary = id; return true; } });
  var row = $('unit-row'), hint = $('unit-hint'), sel = $('unit-select');
  if (!primary) { row.hidden = true; hint.hidden = true; return; }
  save.unitList = primary;
  row.hidden = false;
  hint.hidden = false;
  var cur = save.unit[primary] || 0;
  var opts = '<option value="none">不按单元（全库随机）</option>' +
    '<option value="auto">自动跟随进度（Unit ' + (cur + 1) + '）</option>';
  for (var i = 0; i < unitCount(primary); i++) {
    opts += '<option value="' + (i + 1) + '">Unit ' + (i + 1) + '（已学 ' + unitLearned(primary, i) + '/' + UNIT_SIZE + '）</option>';
  }
  sel.innerHTML = opts;
  sel.value = save.unitMode;
  $('unit-progress').textContent = primary === 'cet4' ? '四级进度 Unit ' + (cur + 1) + '/' + unitCount(primary) : '六级进度 Unit ' + (cur + 1) + '/' + unitCount(primary);
}

function checkedListIds() {
  var ids = [];
  document.querySelectorAll('#setup-lists input[type=checkbox]').forEach(function (cb) {
    if (cb.checked) ids.push(cb.dataset.listId);
  });
  return ids;
}

function startFromSetup() {
  var ids = checkedListIds();
  if (!ids.length) return;
  var diff = 'normal';
  document.querySelectorAll('input[name=diff]').forEach(function (r) {
    if (r.checked) diff = r.value;
  });
  if (setupMode === 'review') diff = 'normal';   /* 复习模式不继承战斗难度 */
  else save.lastDiff = diff;
  startRun(setupMode, ids, diff);
}

/* ========================= 图鉴 ========================= */
var codexFilter = 'all', codexQuery = '';

function openCodex() {
  if (!buildEnc()) { showLoadFail(); return; }
  showScreen('scr-codex');
  renderCodexStats();
  drawStats();
  renderCodexList();
  renderConfuse();
  renderCustomLists();
}

/* 易混淆词对：答错选择题时自动记录，答对后清除，可发起对决 */
function renderConfuse() {
  var el = $('confuse-list');
  var rows = [];
  var seenPair = {};
  for (var w in (save.confuse || {})) {
    var others = save.confuse[w];
    for (var o in others) {
      var key = [w, o].sort().join('|');
      if (seenPair[key]) { seenPair[key].n = Math.max(seenPair[key].n, others[o]); continue; }
      seenPair[key] = { a: w, b: o, n: others[o] };
    }
  }
  Object.keys(seenPair).forEach(function (k) { rows.push(seenPair[k]); });
  rows.sort(function (x, y) { return y.n - x.n; });
  if (!rows.length) {
    el.innerHTML = '<p class="hint">暂无混淆记录——选择题答错时会自动记下你搞混的词对</p>';
    return;
  }
  var html = '';
  rows.slice(0, 8).forEach(function (p, i) {
    html += '<div class="cf-row"><span class="cf-pair"><b>' + p.a + '</b> <span class="cf-vs">VS</span> <b>' + p.b + '</b></span>' +
      '<span class="cf-count">混淆 ×' + p.n + '</span>' +
      '<button class="btn btn-tiny btn-primary cf-duel" data-a="' + p.a + '" data-b="' + p.b + '">⚔️ 对决</button></div>';
  });
  el.innerHTML = html;
}
function meaningOfAny(w) {
  if (MEANING_OF[w]) return MEANING_OF[w];
  var found = '';
  save.customLists.forEach(function (l) {
    l.words.forEach(function (p) { if (p[0] === w && !found) found = p[1]; });
  });
  return found;
}
function startDuel(a, b) {
  var pool = [];
  [a, b].forEach(function (w) {
    var m = meaningOfAny(w);
    if (m) pool.push({ w: w, m: m });
  });
  if (pool.length < 2) { toast('词对数据缺失，无法对决'); return; }
  var ids = (save.lastLists || []).filter(function (id) { return !!listById(id); });
  if (!ids.length) ids = ['cet4'];
  toast('⚔️ 混淆对决：' + a + ' VS ' + b + '！');
  startRun('review', ids, 'normal', pool);
}

function renderCodexStats() {
  var total = 0, learned = 0, mastered = 0, wrongWords = 0;
  ALL_WORDS.forEach(function (it) {
    total++;
    var m = save.mastery[it.w];
    if (m && m.seen > 0) learned++;
    if (m && m.lv >= 5) mastered++;
    if (m && m.wrongStreak > 0) wrongWords++;
  });
  $('codex-stats').innerHTML =
    '<span class="chip">📚 词库 ' + total + ' 词</span>' +
    '<span class="chip">🔵 已学 ' + learned + '</span>' +
    '<span class="chip">⭐ 已掌握 ' + mastered + '</span>' +
    '<span class="chip">❌ 待巩固 ' + wrongWords + '</span>';
}

function renderCodexList() {
  var listEl = $('codex-list');
  var items = ALL_WORDS.slice();
  if (codexQuery) {
    var q = codexQuery.toLowerCase();
    items = items.filter(function (it) {
      return it.w.indexOf(q) >= 0 || it.m.toLowerCase().indexOf(q) >= 0;
    });
  }
  var filtered = items.filter(function (it) {
    var m = save.mastery[it.w];
    if (codexFilter === 'new') return !m || m.seen === 0;
    if (codexFilter === 'learning') return m && m.seen > 0 && m.lv < 5;
    if (codexFilter === 'mastered') return m && m.lv >= 5;
    if (codexFilter === 'wrong') return m && m.wrongStreak > 0;
    return true;
  });

  var CAP = 240;
  var rows = filtered.slice(0, CAP).map(function (it) {
    var m = save.mastery[it.w] || { lv: 0, seen: 0 };
    var stars = '★'.repeat(m.lv) + '☆'.repeat(5 - m.lv);
    var tag = '';
    if (m.lv >= 5) tag = '<span class="cx-tag mastered">已掌握</span>';
    else if (m.seen > 0) tag = '<span class="cx-tag learning">学习中</span>';
    else tag = '<span class="cx-tag new">未学</span>';
    return '<div class="cx-row" data-w="' + it.w + '"><span class="cx-word">' + it.w + '</span><span class="cx-mean">' + it.m + '</span><span class="cx-stars">' + stars + '</span>' + tag + '</div>';
  });
  var extra = filtered.length > CAP ? '<p class="hint">还有 ' + (filtered.length - CAP) + ' 个词未显示，可用搜索缩小范围</p>' : '';
  listEl.innerHTML = rows.length ? rows.join('') + extra : '<p class="hint">没有符合条件的单词</p>';
}

/* ========================= 单词详情卡 ========================= */
var woWord = '';
function humanizeDue(ms) {
  if (ms <= 0) return '现在';
  var min = ms / 60000;
  if (min < 60) return Math.round(min) + ' 分钟后';
  if (min < 1440) return Math.round(min / 60) + ' 小时后';
  return Math.round(min / 1440) + ' 天后';
}
function openWordDetail(w) {
  woWord = w;
  var mean = MEANING_OF[w] || meaningOfAny(w) || '';
  var wEmoji = (typeof EMOJI_OF !== 'undefined' && EMOJI_OF[w]) ? EMOJI_OF[w] + ' ' : '';
  $('wo-word').textContent = wEmoji + w;
  $('wo-meaning').textContent = mean;
  var code = wordCode(w);
  $('wo-code').textContent = code ? '🔑 词汇密码：' + code : '';
  $('wo-code').hidden = !code;
  var fam = wordFamily(w);
  var famEl = $('wo-family');
  if (fam.length) {
    var html = '<div class="fam-label">👨‍👩‍👧 同根词家族（点击发音）</div>';
    fam.forEach(function (f) {
      html += '<button class="fam-chip" data-w="' + f.w + '">' + f.w + '<small>' + f.m.split('；')[0].replace(/^(n|v|adj|adv|prep|conj|pron)\.\s*/, '') + '</small></button>';
    });
    famEl.innerHTML = html;
    famEl.hidden = false;
  } else famEl.hidden = true;
  var m = save.mastery[w];
  var stats = [];
  if (m) {
    stats.push('⭐ ' + '★'.repeat(m.lv) + '☆'.repeat(5 - m.lv));
    stats.push('👀 见过 ' + m.seen + ' 次');
    stats.push('✅ 答对 ' + m.ok);
    stats.push('❌ 答错 ' + m.wrong);
    stats.push('⏰ 下次复习 ' + humanizeDue(m.due - Date.now()));
  } else {
    stats.push('⬜ 还没学过这个词');
  }
  $('wo-stats').innerHTML = stats.map(function (s) { return '<span class="chip">' + s + '</span>'; }).join('');
  $('word-overlay').hidden = false;
}

function renderCustomLists() {
  var wrap = $('custom-lists');
  wrap.innerHTML = '';
  if (!save.customLists.length) {
    wrap.innerHTML = '<p class="hint">还没有自定义词库，粘贴你的单词表就能生成</p>';
    return;
  }
  save.customLists.forEach(function (l) {
    var row = document.createElement('div');
    row.className = 'cl-row';
    row.innerHTML = '<span class="cl-name">📘 ' + l.name + '</span><span class="cl-count">' + l.words.length + ' 词</span>';
    var del = document.createElement('button');
    del.className = 'btn btn-tiny danger';
    del.textContent = '删除';
    del.onclick = function () {
      if (!confirm('删除词库「' + l.name + '」？')) return;
      save.customLists = save.customLists.filter(function (x) { return x.id !== l.id; });
      persist();
      renderCustomLists();
    };
    row.appendChild(del);
    wrap.appendChild(row);
  });
}

function saveCustomList() {
  var name = $('custom-name').value.trim() || '我的词库';
  var text = $('custom-text').value;
  var words = [];
  text.split(/\r?\n/).forEach(function (line) {
    var mt = /^([A-Za-z][A-Za-z'\-]*)\s*[\s:：,，]\s*(.+)$/.exec(line.trim());
    if (mt) words.push([mt[1].toLowerCase(), mt[2].trim()]);
  });
  if (words.length < 3) { alert('至少需要 3 个有效单词行（格式：apple n. 苹果）'); return; }
  /* 量级护栏：词库贴大表后每次答题都要全量 stringify 存档（persist 风暴），中端真机
     每题数百毫秒停顿——这里限制单库与总量 */
  if (words.length > 3000) { alert('单个词库上限 3000 词，请拆分后再保存'); return; }
  var total = 0;
  save.customLists.forEach(function (l) { total += l.words.length; });
  if (save.customLists.length >= 30 || total + words.length > 30000) {
    alert('自定义词库总量已达上限（30 个库 / 30000 词），请先删除一些旧词库'); return;
  }
  save.customLists.push({ id: 'custom_' + Date.now(), name: name, desc: '自定义词库', words: words });
  persist();
  $('custom-name').value = '';
  $('custom-text').value = '';
  alert('已保存词库「' + name + '」，共 ' + words.length + ' 词！出战设置里勾选它即可。');
  renderCustomLists();
}

/* ========================= 设置 ========================= */
function openSettings() {
  showScreen('scr-settings');
  $('set-sound').checked = save.settings.sound;
  $('set-autoplay').checked = save.settings.autoplay;
  $('set-bgm').checked = save.settings.bgm !== false;
  $('set-rate').value = save.settings.rate;
  $('set-plan-target').value = String(save.plan.target || 10);
  $('plan-target-val').textContent = String(save.plan.target || 10);
  $('rate-val').textContent = save.settings.rate.toFixed(1);
  $('qt-c2e').checked = save.settings.qtypes.c2e;
  $('qt-e2c').checked = save.settings.qtypes.e2c;
  $('qt-spell').checked = save.settings.qtypes.spell;
  $('qt-listen').checked = save.settings.qtypes.listen;
  $('tts-note').textContent = TTS.ok ? '' : '（当前浏览器暂无英文语音，听音题不可用）';
  $('qt-listen').disabled = !TTS.ok;
}

function bindSettings() {
  $('set-sound').onchange = function () { save.settings.sound = this.checked; persist(); };
  $('set-autoplay').onchange = function () { save.settings.autoplay = this.checked; persist(); };
  $('set-bgm').onchange = function () {
    save.settings.bgm = this.checked; persist();
    if (!this.checked) BGM.stop();
    else if (run && !run.ended && $('scr-battle').classList.contains('active')) BGM.start(run.bossStage ? 'boss' : 'normal');
  };
  $('set-rate').oninput = function () {
    save.settings.rate = parseFloat(this.value);
    $('rate-val').textContent = save.settings.rate.toFixed(1);
    persist();
  };
  $('qt-c2e').onchange = function () { save.settings.qtypes.c2e = this.checked; persist(); };
  $('qt-e2c').onchange = function () { save.settings.qtypes.e2c = this.checked; persist(); };
  $('qt-spell').onchange = function () { save.settings.qtypes.spell = this.checked; persist(); };
  $('qt-listen').onchange = function () { save.settings.qtypes.listen = this.checked; persist(); };
  $('set-plan-target').onchange = function () {
    save.plan.target = parseInt(this.value, 10) || 10;
    $('plan-target-val').textContent = String(save.plan.target);
    persist(); renderPlan();
  };
  $('btn-reset').onclick = function () {
    if (!confirm('确定清空全部进度（掌握度、金币、记录）？此操作不可恢复！')) return;
    persistCancel();   /* 撤销挂起的防抖写入，否则 pagehide 落盘会把旧档写回去 */
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    location.reload();
  };
  $('btn-export').onclick = function () { openIO('export'); };
  $('btn-import').onclick = function () { openIO('import'); };
  $('io-cancel').onclick = function () { $('io-overlay').hidden = true; };
  $('io-copy').onclick = function () {
    var ta = $('io-text');
    ta.focus(); ta.select();
    try { document.execCommand('copy'); toast('已复制，粘贴到别处保存即可'); } catch (e) { toast('请手动全选复制'); }
  };
  $('io-ok').onclick = function () {
    if (ioMode === 'poison') { handlePoisonPaste($('io-text').value); return; }
    if (ioMode !== 'import') { $('io-overlay').hidden = true; return; }
    try {
      var data = JSON.parse($('io-text').value);
      if (!data || typeof data !== 'object' || !data.settings || !data.mastery) throw new Error('bad');
      /* 白名单清洗后再落盘：字段类型/数值范围不合格的脏档（mastery 字符串、巨量 xp、
         负 lv…）此前会原样持久化，之后每次启动在随机位置引爆（答一题死一题 / 主线程
         冻结 / 结算 RangeError）。清洗后仍不合格的条目就地修正或丢弃。 */
      var cleaned = sanitizeSave(data);
      persistCancel();   /* 撤销挂起的防抖写入，避免旧档在 reload 前覆盖导入档 */
      localStorage.setItem(SAVE_KEY, JSON.stringify(cleaned));
      location.reload();
    } catch (e) { toast('导入失败：存档格式不正确'); }
  };
}

/* ========================= 存档导出 / 导入 ========================= */
var ioMode = 'export';
function openIO(mode, payload) {
  ioMode = mode;
  var titles = {
    'export': '📤 导出存档（复制下面这段文本保管）',
    'import': '📥 导入存档（粘贴之前导出的文本）',
    'poison': '☠️ 粘贴挑战码（接受好友的投毒）',
    'poison-export': '⚔️ 挑战码已生成（复制发给好友，区分大小写）',
    'result-export': '📨 成绩码（复制回贴给出题者）'
  };
  $('io-title').textContent = titles[mode] || titles['export'];
  $('io-ok').textContent = mode === 'poison' ? '⚔️ 应战！' : (mode === 'import' ? '确定' : '关闭');
  var ta = $('io-text');
  ta.value = mode === 'export' ? JSON.stringify(save) : (payload !== undefined ? payload : '');
  ta.placeholder = mode === 'poison' ? '在此粘贴好友发来的挑战码…' : '';
  ta.readOnly = (mode === 'export' || mode === 'poison-export' || mode === 'result-export');
  var logEl = $('io-poison-log');
  if (mode === 'poison') { renderPoisonLog(logEl); logEl.hidden = false; }
  else logEl.hidden = true;
  $('io-overlay').hidden = false;
  if (mode === 'export' || mode === 'poison-export' || mode === 'result-export') {
    setTimeout(function () { ta.focus(); ta.select(); }, 60);
  }
}

/* ========================= 投毒挑战码（纯本地，零服务器） =========================
   挑战码 12-18 位，字符集 0-9 a-z A-Z _ -（区分大小写），双方词库一致即互通：
     [0]  'W' 挑战码 / 'R' 成绩码
     [1]  挑战码 v1（词缀 0-4）：BOSS 词缀*12 + 复仇词数N*3 + 词对数M（N+2M ≤ 5）
          挑战码 v2（词缀 5+，旧版无法解）：[1]=60+词缀高位(0-3)，[2]=词缀*12+N*3+M
          成绩码：胜负*32 + 毒词总数T
     [2]  成绩码专用：攻克位掩码（bit i = 第 i 个毒词被击败）；挑战码 v2 为扩展词缀位
     ...  毒词（词典去重序列索引，每词 2 字符）→ 每词掌握度 lv0-5（每 2 词 1 字符）
          → 随机填充位（凑满 12 位）→ 校验位（加权和 mod 64）
   应战规则：怪物血量 = 5 - 出题者对该词的掌握度（限 1-4，lv 越低怪越硬）
   ================================================================================ */
var POISON_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-';
var POISON_MIN_LEN = 12;

/* 词库指纹：内置词按出现顺序去重（与 words.js 一一对应）。
   惰性构建：words.js 加载失败（404 / 部署漏传 / SW 离线回落把 index.html 当 JS 吐出）
   时，此前的顶层 IIFE 直接 ALL_WORDS.forEach 抛 ReferenceError → init()/bindEvents()
   全部不执行 → 主页「看得见但全死」。现在顶层零依赖，缺失由 init() 显示可恢复提示。 */
var ENC_WORDS = null, ENC_INDEX = null;
function buildEnc() {
  if (ENC_WORDS) return ENC_WORDS;
  try {
    if (typeof ALL_WORDS === 'undefined' || !ALL_WORDS || !ALL_WORDS.length) return null;
    var seen = {}, arr = [];
    ALL_WORDS.forEach(function (it) { if (!seen[it.w]) { seen[it.w] = 1; arr.push(it.w); } });
    ENC_WORDS = arr;
    ENC_INDEX = {};
    arr.forEach(function (w, i) { ENC_INDEX[w] = i; });
  } catch (e) { ENC_WORDS = null; ENC_INDEX = null; return null; }
  return ENC_WORDS;
}

function pEncode2(n) { return POISON_CHARS.charAt(Math.floor(n / 64)) + POISON_CHARS.charAt(n % 64); }
function pDecode2(s, i) {
  var a = POISON_CHARS.indexOf(s.charAt(i)), b = POISON_CHARS.indexOf(s.charAt(i + 1));
  if (a < 0 || b < 0) return -1;
  return a * 64 + b;
}
function pChecksum(s) {
  var h = 0;
  for (var i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * (i + 7)) % 64;
  return POISON_CHARS.charAt(h);
}
function pFinish(body) {   /* 随机填充到最短 12 位，再追加校验位 */
  while (body.length < POISON_MIN_LEN - 1) body += POISON_CHARS.charAt(Math.floor(Math.random() * 64));
  return body + pChecksum(body);
}
function pValidate(c) {
  var m = c && c.charAt ? c.charAt(0).toUpperCase() : '';
  if (m !== 'W' && m !== 'R') return false;
  if (!c || c.length < POISON_MIN_LEN || c.length > 18) return false;
  for (var i = 0; i < c.length; i++) if (POISON_CHARS.indexOf(c.charAt(i)) < 0) return false;
  return pChecksum(c.slice(0, -1)) === c.charAt(c.length - 1);
}
function lvOf(w) {
  var m = save.mastery[w];
  return Math.max(0, Math.min(5, (m && m.lv) || 0));
}

/* 易混淆词对 Top-N（与图鉴 renderConfuse 同源逻辑），仅保留词典内词 */
function topConfusePairs(max) {
  var seenPair = {}, rows = [];
  for (var w in (save.confuse || {})) {
    var others = save.confuse[w];
    for (var o in others) {
      var key = [w, o].sort().join('|');
      if (seenPair[key]) { seenPair[key].n = Math.max(seenPair[key].n, others[o]); continue; }
      seenPair[key] = { a: w, b: o, n: others[o] };
    }
  }
  Object.keys(seenPair).forEach(function (k) { rows.push(seenPair[k]); });
  rows.sort(function (x, y) { return y.n - x.n; });
  if (!buildEnc()) return [];   /* 词库未加载：无内置词可配对 */
  return rows.filter(function (p) {
    return p.a !== p.b && ENC_INDEX[p.a] !== undefined && ENC_INDEX[p.b] !== undefined;
  }).slice(0, max);
}

/* 结算页「投毒」：把本场复仇怪物 + 混淆词对 + 1 条随机 BOSS 词缀编码成挑战码 */
function buildPoisonCode() {
  if (!run || !run.records || !buildEnc()) return null;
  var revs = run.records.filter(function (r) {
    return r.wrong >= 2 && ENC_INDEX[r.w] !== undefined;   /* 二次答错入队的复仇词 */
  }).sort(function (a, b) { return b.wrong - a.wrong; }).map(function (r) { return r.w; });
  var pairs = topConfusePairs(2).filter(function (p) {
    return revs.slice(0, 3).indexOf(p.a) < 0 || revs.slice(0, 3).indexOf(p.b) < 0;   /* 两词都已是复仇词的词对不再重复编码 */
  });
  var nR = Math.min(revs.length, 3);
  var nP = Math.min(pairs.length, Math.floor((5 - nR) / 2));
  if (!nR && !nP) return null;
  var words = revs.slice(0, nR);
  pairs.slice(0, nP).forEach(function (p) { words.push(p.a, p.b); });
  var T = words.length;
  var bossKeys = Object.keys(BOSS_MODS);
  var bossIdx = Math.floor(Math.random() * bossKeys.length);
  var mix = nR * 3 + nP;
  var body = 'W';
  if (bossIdx <= 4) {
    body += POISON_CHARS.charAt(bossIdx * 12 + mix);            /* v1：单字符装下词缀 0-4 */
  } else {
    var v = bossIdx * 12 + mix;                                  /* 14 条词缀 ≤ 13*12+11 = 167 < 256，v2 容量充足 */
    body += POISON_CHARS.charAt(60 + (v >> 6)) + POISON_CHARS.charAt(v & 63);   /* v2 转义 */
  }
  words.forEach(function (w) { body += pEncode2(ENC_INDEX[w]); });
  for (var i = 0; i < T; i += 2) {
    body += POISON_CHARS.charAt(lvOf(words[i]) * 6 + (i + 1 < T ? lvOf(words[i + 1]) : 0));
  }
  var seenW = {}, uniq = [];
  words.forEach(function (w) { if (!seenW[w]) { seenW[w] = 1; uniq.push(w); } });
  save.poisonIssued = { words: uniq, boss: bossKeys[bossIdx], t: Date.now() };
  markPoisonSetPending(uniq);   /* 发码即记账：写入待回贴的「我布的毒」骨架，「投毒新手」即时解锁 */
  persist();
  return pFinish(body);
}

function decodePoisonCode(c) {
  if (!pValidate(c) || c.charAt(0).toUpperCase() !== 'W') return null;
  var b1 = POISON_CHARS.indexOf(c.charAt(1));
  if (b1 < 0) return null;
  var bossIdx, mix, pos;
  if (b1 < 60) {
    bossIdx = Math.floor(b1 / 12); mix = b1 % 12; pos = 2;       /* v1：词缀 0-4 */
  } else {
    var b2 = POISON_CHARS.indexOf(c.charAt(2));
    if (b2 < 0) return null;
    var packedV = (b1 - 60) * 64 + b2;                           /* v2 转义：词缀 5+ */
    bossIdx = Math.floor(packedV / 12); mix = packedV % 12; pos = 3;
  }
  var nR = Math.floor(mix / 3), nP = mix % 3;
  if (nR > 3 || nP > 2 || nR + 2 * nP > 5) return null;
  var T = nR + 2 * nP;
  if (c.length < pos + 2 * T + Math.ceil(T / 2) + 1) return null;
  var enc = buildEnc();
  if (!enc) return null;   /* 词库未加载：无法解码 */
  var words = [], i, idx;
  for (i = 0; i < T; i++) {
    idx = pDecode2(c, pos); pos += 2;
    if (idx < 0 || idx >= enc.length) return null;
    words.push(enc[idx]);
  }
  var lvs = [];
  for (i = 0; i < T; i += 2) {
    var v = POISON_CHARS.indexOf(c.charAt(pos)); pos++;
    if (v < 0) return null;
    lvs.push(Math.floor(v / 6));
    if (i + 1 < T) lvs.push(v % 6);
  }
  var bossKeys = Object.keys(BOSS_MODS);
  if (!bossKeys[bossIdx]) return null;
  var revs = words.slice(0, nR).map(function (w, k) { return { w: w, lv: lvs[k] }; });
  var pairs = [];
  for (i = 0; i < nP; i++) {
    pairs.push([
      { w: words[nR + i * 2], lv: lvs[nR + i * 2] },
      { w: words[nR + i * 2 + 1], lv: lvs[nR + i * 2 + 1] }
    ]);
  }
  var items = words.map(function (w, k) { return { w: w, lv: lvs[k] }; });
  return { boss: bossKeys[bossIdx], revs: revs, pairs: pairs, items: items, words: words, lvs: lvs };
}

/* 噩梦关卡：用挑战码里的毒词作为显式词池注入 startRun（同 startDrill/startDuel 通道） */
function startNightmare(pd) {
  var pool = [];
  (pd.items || []).forEach(function (item) {
    var m = meaningOfAny(item.w);
    if (m && !pool.some(function (x) { return x.w === item.w; })) pool.push({ w: item.w, m: m });
  });
  if (!pool.length) { toast('挑战码里的毒词不在当前词库中'); return; }
  var lvMap = {};
  (pd.items || []).forEach(function (item) { lvMap[item.w] = item.lv; });
  var confuseMap = {};
  (pd.pairs || []).forEach(function (p) {
    (confuseMap[p[0].w] = confuseMap[p[0].w] || []).push(p[1].w);
    (confuseMap[p[1].w] = confuseMap[p[1].w] || []).push(p[0].w);
  });
  var ids = (save.lastLists || []).filter(function (id) { return !!listById(id); });
  if (!ids.length) ids = ['cet4'];
  startRun('adventure', ids, 'normal', pool);
  run.poison = { data: pd, words: pool.map(function (x) { return x.w; }), lvMap: lvMap, confuseMap: confuseMap };
  run.poisonAffix = pd.boss;
  markModSeen(pd.boss);   /* 词缀图鉴：应战也算遭遇过这条词缀 */
  run.poisonCleared = {};
  run.stageSize = pool.length;   /* 单一毒池一战定胜负 */
  run.unitCtx = null;
  run.unitSet = null;
  applyTheme(4);
  updateHUD();
  var mod = BOSS_MODS[pd.boss];
  showBanner('☠️ 噩梦毒池', '出题者的毒词 ×' + pool.length + ' · 血量随其掌握度反转' +
    (mod ? '<br>⚠️ 词缀 ' + mod.icon + ' ' + mod.name + '：' + mod.desc : ''),
    function () { nextMonster(); }, 2500);
}

/* 成绩码：谁攻克了哪些毒词 */
function buildResultCode() {
  if (!run || !run.poison || !run.poison.words.length || !buildEnc()) return null;
  var words = run.poison.words;
  var cleared = run.poisonCleared || {};
  var mask = 0;
  words.forEach(function (w, i) { if (cleared[w]) mask |= (1 << i); });
  var win = run.ended === 'done' ? 1 : 0;
  var T = words.length;
  var body = 'R' + POISON_CHARS.charAt(win * 32 + T) + POISON_CHARS.charAt(mask);
  words.forEach(function (w) { body += pEncode2(ENC_INDEX[w]); });
  return pFinish(body);
}

function decodeResultCode(c) {
  if (!pValidate(c) || c.charAt(0).toUpperCase() !== 'R') return null;
  var f = POISON_CHARS.indexOf(c.charAt(1));
  var win = f >= 32 ? 1 : 0, T = f % 32;
  var mask = POISON_CHARS.indexOf(c.charAt(2));
  if (T < 1 || T > 5 || mask < 0 || f < 0) return null;
  if (c.length < 3 + 2 * T + 1) return null;
  var enc = buildEnc();
  if (!enc) return null;   /* 词库未加载：无法解码 */
  var words = [], cleared = [];
  for (var i = 0; i < T; i++) {
    var idx = pDecode2(c, 3 + i * 2);
    if (idx < 0 || idx >= enc.length) return null;
    var w = enc[idx];
    words.push(w);
    if (mask & (1 << i)) cleared.push(w);
  }
  return { win: !!win, words: words, cleared: cleared, total: T };
}

/* 发码即记账：挑战码成功生成就写入一条「我布的毒」骨架条目（待回贴），
   「投毒新手」成就随之即时解锁；好友回贴战报后由 receiveResultReport 原位更新为真实战绩 */
function markPoisonSetPending(words) {
  save.poisonLog = save.poisonLog || [];
  var wk = words.slice().sort().join('|');
  var hit = null;
  for (var i = 0; i < save.poisonLog.length; i++) {
    var e = save.poisonLog[i];
    if (e && e.role === 'set' && e.pending && e.words &&
        e.words.slice().sort().join('|') === wk) { hit = e; break; }   /* 同一组毒词重复发码：只刷新时间，不重复记账 */
  }
  if (hit) {
    hit.t = Date.now();
  } else {
    save.poisonLog.unshift({ role: 'set', words: words.slice(), cleared: 0, total: words.length, win: null, pending: true, t: Date.now() });
    if (save.poisonLog.length > 20) save.poisonLog.length = 20;
  }
  checkAch();
}

/* 战绩：谁毒倒了谁（本地存档，向后兼容旧 wq_save_v1） */
function logPoison(entry) {
  entry.t = Date.now();
  save.poisonLog = save.poisonLog || [];
  save.poisonLog.unshift(entry);
  if (save.poisonLog.length > 20) save.poisonLog.length = 20;
  persist();
  checkAch();
}
function poisonAgo(t) {
  var d = Date.now() - t;
  if (d < 60e3) return '刚刚';
  if (d < 3600e3) return Math.floor(d / 60e3) + ' 分钟前';
  if (d < 86400e3) return Math.floor(d / 3600e3) + ' 小时前';
  return Math.floor(d / 86400e3) + ' 天前';
}
function renderPoisonLog(el) {
  var log = save.poisonLog || [];
  if (!log.length) {
    el.innerHTML = '<p class="hint">还没有投毒战绩——结算页「⚔️ 投毒」发出挑战，或在上面粘贴好友的挑战码，这里记录谁毒倒了谁</p>';
    return;
  }
  var html = '<div class="io-log-title">🏆 投毒战绩</div>';
  log.slice(0, 5).forEach(function (e) {
    var role = e.role === 'set' ? '☠️ 我布的毒' : '🗡️ 我闯的毒';
    var outcome = e.role === 'set'
      ? (e.win ? '对方通关 · 毒计被破解' : '对方未通关 · 毒计成功')
      : (e.win ? '通关成功' : '未能通关');
    /* 发码即记账的骨架条目：回贴前没有真实胜负，不冒充「毒计成功」 */
    if (e.pending) outcome = '等待好友回贴战报';
    var stat = (e.pending || e.cleared === undefined)
      ? '毒词 ×' + (e.total || (e.words || []).length || '?')
      : '攻克 ' + e.cleared + '/' + e.total;
    html += '<div class="io-log-row"><span class="io-log-role">' + role + '</span>' +
      '<span class="io-log-out">' + stat + ' · ' + outcome + '</span>' +
      '<span class="io-log-time">' + poisonAgo(e.t) + '</span></div>';
  });
  el.innerHTML = html;
}

/* 粘贴入口统一分发：W 开头 = 挑战码（应战），R 开头 = 成绩码（战报） */
function handlePoisonPaste(raw) {
  var c = (raw || '').trim();
  if (!c) { toast('请先粘贴挑战码'); return; }
  if (c.charAt(0).toUpperCase() === 'R') {
    var rep = decodeResultCode(c);
    if (!rep) { toast('成绩码无效，请检查是否完整复制'); return; }
    receiveResultReport(rep);
    $('io-overlay').hidden = true;
    return;
  }
  var pd = decodePoisonCode(c);
  if (!pd) { toast('挑战码无效，请检查是否完整复制（区分大小写）'); return; }
  $('io-overlay').hidden = true;
  startNightmare(pd);
}
function receiveResultReport(rep) {
  var issued = save.poisonIssued;
  var pSet = function (arr) { return arr.slice().sort().join('|'); };
  var mine = !!(issued && issued.words && issued.words.length === rep.words.length &&
    pSet(issued.words) === pSet(rep.words));
  /* 发码时已写入的待回贴骨架：战报一到原位更新为真实战绩，不再重复插入 */
  var hit = null;
  var log = save.poisonLog || [];
  for (var i = 0; i < log.length; i++) {
    var e = log[i];
    if (e && e.role === 'set' && e.pending && e.words &&
        e.words.length === rep.words.length && pSet(e.words) === pSet(rep.words)) { hit = e; break; }
  }
  if (hit) {
    hit.cleared = rep.cleared.length;
    hit.total = rep.total;
    hit.win = rep.win;
    hit.mine = true;   /* 骨架条目只有本机发码才会写入——必为自己布的毒 */
    hit.pending = false;
    hit.t = Date.now();
    persist();
    checkAch();
  } else {
    logPoison({
      role: 'set',
      words: rep.words.slice(),
      cleared: rep.cleared.length,
      total: rep.total,
      win: rep.win,
      mine: mine
    });
  }
  var head = mine ? '☠️ 你的毒计战报' : '📨 收到一份战报';
  var body = rep.win
    ? (mine ? '对方攻克了全部 ' + rep.total + ' 个毒词，毒计被破解！' : '对方通关，攻克 ' + rep.cleared.length + '/' + rep.total)
    : (mine ? '对方倒在你的毒池里，仅攻克 ' + rep.cleared.length + '/' + rep.total + '，毒计成功！' : '对方攻克 ' + rep.cleared.length + '/' + rep.total + '，未能通关');
  toast(head + '：' + body);
  if (!rep.win) Confetti.burst(80);
}

function doPoisonExport() {
  if (!run || !run.records) { toast('结算数据已失效'); return; }
  var code = buildPoisonCode();
  if (!code) { toast('本局没有可投毒的内容——需要答错 2 次的复仇词或混淆词对'); return; }
  /* 一键投毒：环境允许时直接进剪贴板，省一步「复制」 */
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(function () {
        toast('⚔️ 挑战码已自动复制，直接粘贴发给好友！');
      }, function () {});
    }
  } catch (e) {}
  openIO('poison-export', code);
}
function doResultExport() {
  var code = buildResultCode();
  if (!code) { toast('成绩码生成失败'); return; }
  openIO('result-export', code);
}

/* ========================= 双人热座对决（本地同屏轮流）=========================
   与战斗引擎完全独立（无 run 对象）：🔥 红队与 ❄️ 蓝队在同一台设备上轮流作答，
   各答 6 题（同一词库抽词、互不重复），每题 12 秒限时；得分 = 10 + 剩余秒数 +
   当前连击 ×2。作答间有交接横幅盖住题目防偷看。
   学习数据零损失：每题作答照常走 updateMastery / bumpToday / logAnswer，
   答错选择题也照常记入混淆档案。 */
var duel = null;
var duelTimerIv = null;
var DUEL_ROUNDS = 6;    /* 每人题数 */
var DUEL_SEC = 12;      /* 每题限时（秒） */
var DUEL_PLAYERS = [
  { icon: '🔥', name: '红队' },
  { icon: '❄️', name: '蓝队' }
];
function stopDuelTimer() {
  if (duelTimerIv) { clearInterval(duelTimerIv); duelTimerIv = null; }
}
function duelPool() {
  var ids = (save.lastLists || []).filter(function (id) { return !!listById(id); });
  if (!ids.length) ids = ['cet4'];
  var pool = buildPool(ids).filter(function (x) { return x.m; });
  if (pool.length < DUEL_ROUNDS * 2) pool = buildPool(['cet4']).filter(function (x) { return x.m; });
  return pool;
}
function openDuel() {
  if (!buildEnc()) { showLoadFail(); return; }
  stopDuelTimer();
  duel = null;
  showScreen('scr-duel');
  $('duel-intro').hidden = false;
  $('duel-play').hidden = true;
  $('duel-done').hidden = true;
  $('btn-duel-start').hidden = false;
  $('btn-duel-start').textContent = '⚔️ 开始对决';
  var d = save.duel || { plays: 0, p1wins: 0, p2wins: 0 };
  $('duel-career').textContent = '历史战绩：对战 ' + (d.plays || 0) + ' 场 · 🔥 红队胜 ' + (d.p1wins || 0) +
    ' 场 · ❄️ 蓝队胜 ' + (d.p2wins || 0) + ' 场';
}
function closeDuel() {
  stopDuelTimer();
  duel = null;
  showScreen('scr-home');
  refreshHome();
}
function startDuelGame() {
  if (!buildEnc()) { showLoadFail(); return; }
  var pool = duelPool();
  if (pool.length < DUEL_ROUNDS * 2) { toast('词库词量不足（至少 ' + (DUEL_ROUNDS * 2) + ' 词），无法对决'); return; }
  stopDuelTimer();
  duel = {
    pool: pool,
    words: shuffle(pool).slice(0, DUEL_ROUNDS * 2),
    qi: 0, turn: 0, phase: 'handoff',
    scores: [0, 0], combos: [0, 0], maxCombo: [0, 0], correct: [0, 0],
    q: null, end: 0, paused: 0
  };
  $('duel-intro').hidden = true;
  $('duel-done').hidden = true;
  $('duel-play').hidden = false;
  $('btn-duel-start').hidden = true;
  duelHandoff();
}
function duelScoreboard() {
  if (!duel) return;
  for (var s = 0; s < 2; s++) {
    var side = $('duel-side' + s);
    if (side) side.classList.toggle('turn', duel.phase !== 'done' && (duel.turn % 2) === s);
    var sc = $('duel-score' + s);
    if (sc) sc.textContent = duel.scores[s];
    var cb = $('duel-combo' + s);
    if (cb) cb.textContent = duel.combos[s] >= 2 ? '🔥×' + duel.combos[s] : '';
  }
}
function duelHandoff() {
  if (!duel) return;
  duel.phase = 'handoff';
  var p = DUEL_PLAYERS[duel.turn % 2];
  $('duel-qarea').hidden = true;
  $('duel-handoff').hidden = false;
  $('duel-ho-face').textContent = p.icon;
  $('duel-ho-txt').textContent = '轮到 ' + p.name;
  $('duel-ho-sub').textContent = '第 ' + (Math.floor(duel.turn / 2) + 1) + '/' + DUEL_ROUNDS + ' 题 · 全场 ' +
    (DUEL_ROUNDS * 2) + ' 问 · 每题 ' + DUEL_SEC + ' 秒';
  duelScoreboard();
}
function duelReady() {
  if (!duel || duel.phase !== 'handoff') return;
  duelShowQ();
}
/* 干扰项：同首字母 > 同词性 > 同长度 优先（轻量版 distractors，不依赖 run） */
function duelOptions(word) {
  var cands = duel.pool.filter(function (x) { return x.w !== word.w && x.m !== word.m; });
  var scored = cands.map(function (x) {
    var s = Math.random();
    if (x.w.charAt(0) === word.w.charAt(0)) s += 1.5;
    if (x.w.length === word.w.length) s += 0.5;
    var p1 = posOf(x.m), p2 = posOf(word.m);
    if (p1 && p1 === p2) s += 1;
    return { x: x, s: s };
  }).sort(function (a, b) { return b.s - a.s; });
  var words = [word.w];
  for (var i = 0; i < scored.length && words.length < 4; i++) {
    if (words.indexOf(scored[i].x.w) < 0) words.push(scored[i].x.w);
  }
  words = shuffle(words);
  return { words: words, answer: words.indexOf(word.w) };
}
function duelShowQ() {
  if (!duel) return;
  duel.phase = 'q';
  var word = duel.words[duel.qi % duel.words.length];
  var opts = duelOptions(word);
  duel.q = { word: word, options: opts.words, answer: opts.answer, locked: false };
  var p = DUEL_PLAYERS[duel.turn % 2];
  $('duel-handoff').hidden = true;
  $('duel-qarea').hidden = false;
  $('duel-qtype').textContent = p.icon + ' ' + p.name + ' · 第 ' + (duel.qi + 1) + '/' + (DUEL_ROUNDS * 2) + ' 问 · 看中文选英文';
  $('duel-prompt').textContent = word.m;
  $('duel-reveal').hidden = true;
  var wrap = $('duel-opts');
  wrap.innerHTML = '';
  wrap.className = 'q-options';
  duel.q.options.forEach(function (o, i) {
    var b = document.createElement('button');
    b.className = 'q-opt';
    b.innerHTML = '<i class="key-num">' + (i + 1) + '</i>' + o;
    b.onclick = function () { duelAnswer(i); };
    wrap.appendChild(b);
  });
  duelScoreboard();
  duel.end = Date.now() + DUEL_SEC * 1000;
  duel.paused = 0;
  startDuelTimer();
}
function startDuelTimer() {
  stopDuelTimer();
  duelTimerIv = setInterval(function () {
    if (!duel || duel.phase !== 'q') return;
    var left = Math.max(0, duel.end - Date.now());
    var fill = $('duel-timer-fill');
    if (fill) {
      fill.style.width = (left / (DUEL_SEC * 1000) * 100) + '%';
      fill.className = 'duel-timer-fill' + (left < 3000 ? ' danger' : '');
    }
    if (left <= 0) duelAnswer(-1);
  }, 100);
}
/* 切后台暂停计时：回来后从剩余时间继续，不让对手被判超时 */
document.addEventListener('visibilitychange', function () {
  if (!duel || duel.phase !== 'q') return;
  if (document.hidden) {
    duel.paused = Math.max(0, duel.end - Date.now());
    stopDuelTimer();
  } else if (duel.paused > 0) {
    duel.end = Date.now() + duel.paused;
    duel.paused = 0;
    startDuelTimer();
  }
});
function duelAnswer(i) {
  if (!duel || duel.phase !== 'q' || !duel.q || duel.q.locked) return;
  duel.q.locked = true;
  stopDuelTimer();
  duel.phase = 'reveal';
  var q = duel.q;
  var ok = i === q.answer;
  var me = duel.turn % 2;
  duel.combos[me] = ok ? duel.combos[me] + 1 : 0;
  duel.maxCombo[me] = Math.max(duel.maxCombo[me], duel.combos[me]);
  var gain = 0;
  if (ok) {
    var speed = Math.max(0, Math.ceil((duel.end - Date.now()) / 1000));
    gain = 10 + speed + duel.combos[me] * 2;
    duel.scores[me] += gain;
    duel.correct[me]++;
  }
  /* 学习数据写回：与主战斗同一条 SRS 路径（掌握度 / 打卡 / 日志 / 混淆档案） */
  bumpToday();
  logAnswer(ok);
  updateMastery(q.word.w, ok, false);
  if (ok) { bumpTask('q_correct'); addXp(2); }
  if (!ok && i >= 0) {
    save.confuse[q.word.w] = save.confuse[q.word.w] || {};
    save.confuse[q.word.w][q.options[i]] = (save.confuse[q.word.w][q.options[i]] || 0) + 1;
  }
  var btns = $('duel-opts').children;
  for (var b = 0; b < btns.length; b++) {
    if (b === q.answer) btns[b].classList.add('correct');
    else if (b === i) btns[b].classList.add('wrong');
  }
  $('duel-opts').classList.add('locked');
  $('duel-reveal').hidden = false;
  $('duel-reveal').innerHTML = ok
    ? ('✅ <b>' + q.word.w + '</b> — ' + q.word.m + '　<span class="duel-gain">+' + gain + ' 分</span>' +
       (duel.combos[me] >= 2 ? ' 🔥×' + duel.combos[me] : ''))
    : ('❌ 正确答案：<b>' + q.word.w + '</b> — ' + q.word.m);
  duelScoreboard();
  if (ok) { Sfx.correct(duel.combos[me]); Sfx.coin(); TTS.speak(q.word.w, false); }
  else Sfx.wrong();
  persist();
  setTimeout(function () {
    if (!duel) return;
    duel.qi++;
    duel.turn++;
    if (duel.turn >= DUEL_ROUNDS * 2) { duelFinish(); return; }
    duelHandoff();
  }, ok ? 1500 : 2000);
}
function duelFinish() {
  if (!duel) return;
  duel.phase = 'done';
  stopDuelTimer();
  $('duel-qarea').hidden = true;
  $('duel-handoff').hidden = true;
  $('duel-done').hidden = false;
  var s1 = duel.scores[0], s2 = duel.scores[1];
  var winner = s1 === s2 ? -1 : (s1 > s2 ? 0 : 1);
  save.duel = save.duel || { plays: 0, p1wins: 0, p2wins: 0 };
  save.duel.plays = (save.duel.plays || 0) + 1;
  var c1 = 25, c2 = 25, verdict = '🤝 平分秋色！';
  if (winner === 0) { save.duel.p1wins = (save.duel.p1wins || 0) + 1; c1 = 40; c2 = 15; verdict = '🔥 红队获胜！'; }
  else if (winner === 1) { save.duel.p2wins = (save.duel.p2wins || 0) + 1; c1 = 15; c2 = 40; verdict = '❄️ 蓝队获胜！'; }
  save.coins += c1 + c2;
  addXp(6);
  bumpTask('run_any');
  persist();
  checkAch();
  Sfx.levelup();
  Confetti.burst(80);
  var chips = '';
  for (var p = 0; p < 2; p++) {
    chips += '<span class="chip">' + DUEL_PLAYERS[p].icon + ' ' + DUEL_PLAYERS[p].name + ' ' + duel.scores[p] +
      ' 分 · 答对 ' + duel.correct[p] + '/' + DUEL_ROUNDS + ' · 最高连击 ×' + duel.maxCombo[p] + '</span>';
  }
  $('duel-result').innerHTML = '<div class="duel-verdict">' + verdict + '</div>' +
    '<div class="duel-result-chips">' + chips + '</div>' +
    '<p class="hint">🪙 红队 +' + c1 + ' · 蓝队 +' + c2 + ' · 全部作答已写入掌握度与间隔重复</p>';
  $('btn-duel-start').hidden = false;
  $('btn-duel-start').textContent = '🔄 再来一局';
  duelScoreboard();
}

/* ========================= 键盘操作 ========================= */
function onKey(e) {
  /* 双人对决：1-4 选项作答（当前出题方的键盘操作） */
  if ($('scr-duel') && $('scr-duel').classList.contains('active') && duel && duel.phase === 'q' && duel.q && !duel.q.locked) {
    var dn = parseInt(e.key, 10);
    if (dn >= 1 && dn <= 4) { e.preventDefault(); duelAnswer(dn - 1); }
    return;
  }
  /* 词根实验室：1-4 选项作答（与战斗页键位习惯一致） */
  if ($('scr-lab') && $('scr-lab').classList.contains('active') && lab && lab.q && !lab.locked) {
    var ln = parseInt(e.key, 10);
    if (ln >= 1 && ln <= 4) {
      var lb = $('lab-opts').children[ln - 1];
      if (lb) { e.preventDefault(); labAnswer(ln - 1); }
    }
    return;
  }
  if (!run || run.ended) return;
  if (!$('memcard').hidden || !$('banner').hidden) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeMemCard(); }
    return;
  }
  if (!$('scr-battle').classList.contains('active')) return;
  var q = run.q;
  if (!q || q.locked) return;

  if (q.type === 'spell') {
    if (e.key === 'Backspace') { e.preventDefault(); spellBack(); return; }
    if (e.key === 'Enter') { e.preventDefault(); submitSpell(); return; }
    if (e.key === ' ') { e.preventDefault(); return; }  // 防止误触焦点按钮
    var ch = '';
    if (e.key === 'Process' || e.isComposing) {
      /* 中文输入法模式下 key 是 'Process'（keyCode 229），改用物理键位识别 */
      var cm = /^Key([A-Z])$/.exec(e.code || '');
      if (cm) ch = cm[1].toLowerCase();
    } else {
      ch = e.key.toLowerCase();
    }
    if (/^[a-z]$/.test(ch)) {
      for (var i = 0; i < q.shuffled.length; i++) {
        if (q.shuffled[i] === ch && spellState && spellState.picked.indexOf(i) < 0) {
          e.preventDefault();
          tapChip(i);
          return;
        }
      }
    }
    return;
  }
  if (q.type === 'c2e' || q.type === 'e2c' || q.type === 'listen') {
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= 4) {
      e.preventDefault();
      var btn = $('q-options').children[n - 1];
      if (btn) onChoice(n - 1, btn);
    }
  }
}

/* ========================= 初始化 ========================= */
function bindEvents() {
  // 主菜单
  $('btn-adventure').onclick = function () { openSetup('adventure'); };
  $('btn-endless').onclick = function () { openSetup('endless'); };
  $('btn-review').onclick = function () { openSetup('review'); };
  $('btn-expedition').onclick = function () { openSetup('expedition'); };
  $('btn-codex').onclick = openCodex;
  $('btn-settings').onclick = openSettings;
  $('btn-help').onclick = function () { showScreen('scr-help'); };
  $('btn-ach').onclick = openAch;
  $('btn-ach-back').onclick = function () { showScreen('scr-home'); };
  $('btn-talent').onclick = openTalent;
  $('btn-talent-back').onclick = function () { showScreen('scr-home'); refreshHome(); };
  $('talent-grid').addEventListener('click', function (e) {
    var b = e.target.closest('.talent-buy');
    if (b) buyTalent(b.dataset.t);
  });
  $('btn-packs').onclick = openPacks;
  $('btn-packs-back').onclick = function () { showScreen('scr-home'); };
  $('pack-list').addEventListener('click', function (e) {
    var b = e.target.closest('.pack-start');
    if (b) startPackRun(b.dataset.p);
  });
  $('btn-plan').onclick = startPlan;
  $('btn-poison').onclick = function () { openIO('poison'); };
  $('btn-wrongbook').onclick = openWrongBook;
  $('btn-wrong-back').onclick = function () { showScreen('scr-home'); refreshHome(); };
  $('btn-drill').onclick = startDrill;
  $('btn-match').onclick = openMatch;
  $('btn-match-restart').onclick = startMatch;
  $('btn-match-back').onclick = function () { stopMatchTimer(); matchDragAbort(); match = null; showScreen('scr-home'); refreshHome(); };
  bindMatchDrag();   /* 记忆配对：拖拽撞击配对（点击翻牌仍可用） */
  // 词根合成实验室
  $('btn-lab').onclick = openLab;
  $('btn-lab-start').onclick = startLab;
  $('btn-lab-again').onclick = startLab;
  $('btn-lab-back').onclick = function () { showScreen('scr-home'); refreshHome(); };
  $('btn-lab-next').onclick = labNextOrFinish;
  $('lab-opts').addEventListener('click', function (e) {
    var b = e.target.closest('.q-opt');
    if (b) labAnswer(parseInt(b.dataset.i || b.getAttribute('data-i'), 10));
  });
  $('daily-tasks').addEventListener('click', function (e) {
    var b = e.target.closest('.btn-claim');
    if (b) claimDaily(parseInt(b.dataset.i, 10));
  });
  // 词魂肉鸽
  $('btn-rogue').onclick = openRogue;
  $('btn-rogue-start').onclick = startRogueDraft;
  $('btn-rogue-back').onclick = function () { showScreen('scr-home'); refreshHome(); };
  $('rogue-cards').addEventListener('click', function (e) {
    var tc = e.target.closest('[data-rogue-t]');
    if (tc) { pickRogueTalent(tc.getAttribute('data-rogue-t')); return; }
    var cc = e.target.closest('[data-rogue-c]');
    if (cc) pickRogueCurse(cc.getAttribute('data-rogue-c'));
  });
  // 双人对决
  $('btn-duel').onclick = openDuel;
  $('btn-duel-start').onclick = startDuelGame;
  $('btn-duel-ready').onclick = duelReady;
  $('btn-duel-back').onclick = function () {
    if (duel && duel.phase !== 'done' && duel.qi > 0 && !confirm('确定退出？当前对决进度将丢弃')) return;
    closeDuel();
  };

  // 设置页
  $('btn-setup-back').onclick = function () { showScreen('scr-home'); };
  $('btn-start').onclick = startFromSetup;
  $('setup-lists').addEventListener('change', updateSetupHint);
  $('unit-select').onchange = function () {
    save.unitMode = this.value;
    persist();
  };
  $('setup-size').onchange = function () {
    save.sessionSize = parseInt(this.value, 10) || 10;
    persist();
  };

  // 战斗页
  $('btn-quit').onclick = function () {
    if (confirm('确定退出本局？本局进度将在结算后记录')) endRun('quit');
  };
  $('btn-replay').onclick = function () { if (run && run.q) TTS.speak(run.q.word.w, true); };
  $('q-prompt').onclick = function () {
    if (run && run.q && run.q.type === 'listen') TTS.speak(run.q.word.w, true);
  };
  $('btn-hint').onclick = useHint;
  $('btn-memo').onclick = function () {
    var el = $('q-memo');
    el.hidden = !el.hidden;
    this.blur();
  };
  $('btn-spell-back').onclick = spellBack;
  $('btn-spell-submit').onclick = submitSpell;
  $('btn-spell-hint').onclick = spellHint;
  // 蓄力一击：点怪物或点 ⚡ 按钮都行
  $('btn-charge').onclick = function () { this.blur(); tryStartCharge(); };
  $('monster-figure').addEventListener('pointerdown', function (e) {
    if (!canCharge()) return;
    e.preventDefault();
    tryStartCharge();
  });

  // 记忆卡片
  $('mem-ok').onclick = closeMemCard;
  $('mem-speak').onclick = function () {
    var w = $('mem-word').textContent;
    if (w) TTS.speak(w, true);
  };
  $('mem-family').addEventListener('click', function (e) {
    var chip = e.target.closest('.fam-chip');
    if (chip) TTS.speak(chip.dataset.w, true);
  });
  $('mem-speak-btn').onclick = function () {
    if (Rec.listening) return;
    var word = $('mem-word').textContent;
    var b = this;
    Rec.listening = true;
    b.disabled = true;
    b.classList.add('listening');
    b.textContent = '🎙️ 请大声朗读…';
    Rec.start(word, function (res, heard) {
      Rec.listening = false;
      b.disabled = false;
      b.classList.remove('listening');
      b.textContent = '🎤 跟读挑战 +5🪙';
      if (res === 'ok') {
        save.coins += 5;
        persist();
        Sfx.correct(6);
        Confetti.burst(28);
        toast('🎤 发音很棒！+5 🪙');
      } else if (res === 'no') {
        toast('🤔 好像读成了「' + (heard || '…') + '」，再试一次！');
      } else if (res !== 'unsupported') {
        toast('🎙️ 没有听清，点击再试一次（需要麦克风权限）');
      }
    });
  };

  // 商店
  $('btn-next-stage').onclick = function () {
    run.stage++;
    showScreen('scr-battle');
    beginStage();
  };

  // 结算
  $('btn-again').onclick = function () {
    if (run.mode === 'review') openSetup('review');
    else if (run.mode === 'plan') { showScreen('scr-home'); refreshHome(); }
    else if (run.mode === 'drill') { openWrongBook(); }
    else if (run.poison) startNightmare(run.poison.data);
    else if (run.rogue) startRogueDraft();
    else if (run.packId) startPackRun(run.packId);
    else startRun(run.mode, run.listIds, run.diffKey);
  };
  $('btn-retry-wrong').onclick = retryWrong;
  $('btn-poison-export').onclick = doPoisonExport;
  $('btn-result-code').onclick = doResultExport;
  $('btn-result-home').onclick = function () { showScreen('scr-home'); refreshHome(); };

  // 图鉴
  $('btn-codex-back').onclick = function () { showScreen('scr-home'); };
  $('confuse-list').addEventListener('click', function (e) {
    var b = e.target.closest('.cf-duel');
    if (b) startDuel(b.dataset.a, b.dataset.b);
  });
  $('codex-list').addEventListener('click', function (e) {
    var row = e.target.closest('.cx-row');
    if (row && row.dataset.w && !e.target.closest('.fam-chip')) openWordDetail(row.dataset.w);
  });
  $('wo-close').onclick = function () { $('word-overlay').hidden = true; };
  $('wo-speak').onclick = function () { if (woWord) TTS.speak(woWord, true); };
  $('wo-family').addEventListener('click', function (e) {
    var chip = e.target.closest('.fam-chip');
    if (chip) TTS.speak(chip.dataset.w, true);
  });
  $('wo-master').onclick = function () {
    if (!woWord) return;
    var m = getM(woWord);
    m.lv = 5;
    m.due = Date.now() + IV_MIN[5] * 60000;
    persist();
    $('word-overlay').hidden = true;
    toast('⭐ 已标记「' + woWord + '」为已掌握');
    renderCodexStats(); drawStats(); renderCodexList();
  };
  $('wo-reset').onclick = function () {
    if (!woWord) return;
    delete save.mastery[woWord];
    persist();
    $('word-overlay').hidden = true;
    toast('♻️ 已重置「' + woWord + '」的学习记录');
    renderCodexStats(); drawStats(); renderCodexList();
  };
  $('codex-search').oninput = function () { codexQuery = this.value.trim(); renderCodexList(); };
  document.querySelectorAll('#codex-filters .filter').forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll('#codex-filters .filter').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      codexFilter = b.dataset.f;
      renderCodexList();
    };
  });
  $('btn-custom-save').onclick = saveCustomList;

  // 设置 / 帮助
  bindSettings();
  $('btn-poison-set').onclick = function () { openIO('poison'); };
  $('btn-settings-back').onclick = function () { showScreen('scr-home'); };
  $('btn-help-back').onclick = function () { showScreen('scr-home'); };

  // 键盘
  document.addEventListener('keydown', onKey);
  // 首次交互激活音频
  document.addEventListener('pointerdown', function () { Sfx.ensure(); }, { once: true });
  bindMobileKeyboard();
}

/* ========================= 移动端竖屏：键盘弹出不遮挡输入/作答区 =========================
   仅窄屏（≤480px）启用，桌面零改动。键盘弹出（visualViewport 缩小）或输入框聚焦时，
   把聚焦的输入/作答元素滚进可视区：挑战码粘贴框、图鉴搜索、自定义词库编辑。 */
function bindMobileKeyboard() {
  if (!window.visualViewport) return;
  var mq = window.matchMedia('(max-width: 480px)');
  var timer = null;
  function reveal() {
    if (mq && !mq.matches) return;
    var ae = document.activeElement;
    if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT') && ae.type !== 'checkbox' && ae.type !== 'radio') {
      try { ae.scrollIntoView({ block: 'center' }); } catch (e) { ae.scrollIntoView(); }
    }
  }
  window.visualViewport.addEventListener('resize', function () {
    clearTimeout(timer); timer = setTimeout(reveal, 120);
  });
  document.addEventListener('focusin', function () {
    clearTimeout(timer); timer = setTimeout(reveal, 350);
  });
}

/* ========================= 异常兜底 & 渲染看门狗 =========================
   三层防线（存档始终先 persistNow 保住，恢复动作绝不丢档）：
   ① safe(fn)：主战斗链入口与延时回调统一包裹，异常时进入 recoverBattle；
   ② 全局 window error / unhandledrejection：限频提示 + 尝试恢复可玩状态（不静默吞掉，
      console 仍留痕）；
   ③ 看门狗：每 4s 只读检查「无活动屏 / 战斗页长期无题面 / 题面锁定但计时与续问链
      全停」三种停摆特征，持续数秒即触发恢复——重出题或回主页。
   局限（如实记录）：页面主线程被同步死循环整死或渲染进程崩溃时，页内 JS 心跳同死，
   看门狗与浏览器层面都无法自愈——这类只能靠 PWA 重载（controllerchange / 用户刷新）。 */
var recoverCount = 0, lastRecoverT = 0, lastErrToastT = 0;
function noteError(where, e) {
  try { console.warn('[WQ ' + where + ']', e && (e.message || e)); } catch (x) {}
  var now = Date.now();
  if (now - lastErrToastT < 3000) return;   /* 限频：错误风暴时不刷屏 */
  lastErrToastT = now;
  try { toast('⚠️ 出现异常，已自动恢复'); } catch (x) {}
}
/* 战斗页恢复：作废旧局延时链（runEpoch++）→ 重出题；再失败就回主页。
   两处关键细节（长跑实测教训）：
   ① 限频期间不允许「静默丢恢复」——那会把冻结留到看门狗下一轮才救；
      改为挂起一个延迟重试，限频窗口一过立即补跑。
   ② 重建前给「可能仍存活的续问链」700ms 先行权：主线程短暂卡顿（如弹原生
      confirm / 渲染进程节流）后链会自己续上，此时重出题反而多跳一题；
      700ms 后若题面仍锁定+计时停摆，才作废重建。 */
var recoverPending = false;
function recoverBattle() {
  var now = Date.now();
  if (now - lastRecoverT < 2000) {
    if (!recoverPending) {
      recoverPending = true;
      setTimeout(function () { recoverPending = false; recoverBattle(); }, 2000 - (now - lastRecoverT) + 80);
    }
    return;
  }
  lastRecoverT = now;
  if (++recoverCount > 30) { goHomeSafe(); return; }
  try { persistNow(); } catch (e) {}
  try { stopTimer(); cancelCharge(); } catch (e) {}
  try { if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; } $('banner').hidden = true; } catch (e) {}
  try { $('memcard').hidden = true; memCb = null; } catch (e) {}
  try { $('io-overlay').hidden = true; } catch (e) {}
  if (run && !run.ended) {
    try {
      showScreen('scr-battle');
      setTimeout(function () {
        if (!run || run.ended) return;
        /* 宽限期内续问链已自行接手（弹了记忆卡/横幅/弹层，或题面解锁、计时在跑）→ 不重建 */
        var busy = ($('memcard') && !$('memcard').hidden) || ($('banner') && !$('banner').hidden) || ($('io-overlay') && !$('io-overlay').hidden);
        if (busy) return;
        if (run.q && run.q.locked && !timerRAF) { runEpoch++; askNext(false, null); }   /* 仍冻结才重建 */
      }, 700);
      return;
    } catch (e) { noteError('recoverBattle', e); }
  }
  goHomeSafe();
}
/* 安全回主页：结束当前局、停一切链路、保住存档、恢复主界面 */
function goHomeSafe() {
  try { if (run && !run.ended) run.ended = 'error'; } catch (e) {}
  try { persistNow(); } catch (e) {}
  try { stopTimer(); cancelCharge(); BGM.stop(); } catch (e) {}
  try { if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; } } catch (e) {}
  try { $('memcard').hidden = true; memCb = null; $('banner').hidden = true; } catch (e) {}
  runEpoch++;
  try { showScreen('scr-home'); } catch (e) {}
  try { refreshHome(); } catch (e) {}
  flushSwReload();
}
/* 通用恢复：按当前所处状态选择恢复动作（供全局错误钩子调用）。
   限频期间同样不丢恢复——挂起延迟重试（与 recoverBattle 同理） */
var recoverUIPending = false;
function recoverUI() {
  var now = Date.now();
  if (now - lastRecoverT < 3000) {
    if (!recoverUIPending) {
      recoverUIPending = true;
      setTimeout(function () { recoverUIPending = false; recoverUI(); }, 3000 - (now - lastRecoverT) + 80);
    }
    return;
  }
  lastRecoverT = now;
  var act = null;
  try { act = document.querySelector('.screen.active'); } catch (e) {}
  if (run && !run.ended) { recoverBattle(); return; }
  if (!act) { goHomeSafe(); return; }
  if (act.id === 'scr-battle') goHomeSafe();
}
function scheduleRecover() { try { recoverUI(); } catch (e) { try { goHomeSafe(); } catch (x) {} } }
/* safe(fn)：把任意入口/回调变成「异常即恢复」 */
function safe(fn, where) {
  return function () {
    try { return fn.apply(this, arguments); }
    catch (e) { noteError(where || 'safe', e); recoverBattle(); }
  };
}
/* 全局兜底：只处理脚本异常（带 message）；资源加载错误由 words.js 专项处理 */
window.addEventListener('error', function (e) {
  if (!e || !e.message) return;
  noteError('window.onerror: ' + (e.filename || '') + ':' + (e.lineno || ''), e.error || e.message);
  setTimeout(scheduleRecover, 50);
});
window.addEventListener('unhandledrejection', function (e) {
  noteError('unhandledrejection', e && e.reason);
  setTimeout(scheduleRecover, 50);
});

/* ---------- 渲染看门狗 ---------- */
var wdTimer = null, wdRecoveries = 0;
var wdNoScreenSince = 0, wdStuckBattleSince = 0;
function startWatchdog() {
  if (window.__wqWatchdogOff || wdTimer) return;
  wdTimer = setInterval(function () {
    if (document.hidden) return;   /* 后台节流不算停摆 */
    try { watchdogCheck(); } catch (e) {}
  }, 4000);
}
function wdRecover(kind) {
  wdNoScreenSince = 0;
  wdStuckBattleSince = 0;
  if (wdRecoveries >= 6) return;   /* 一个会话最多自动恢复 6 次，防循环 */
  wdRecoveries++;
  noteError('watchdog:' + kind, null);
  scheduleRecover();
}
function watchdogCheck() {
  var now = Date.now();
  var io = $('io-overlay'), mem = $('memcard'), ban = $('banner');
  if ((io && !io.hidden) || (mem && !mem.hidden) || (ban && !ban.hidden)) {   /* 弹层开着：交互流程中，不判停摆 */
    wdNoScreenSince = 0; wdStuckBattleSince = 0;
    return;
  }
  var act = document.querySelector('.screen.active');
  /* 特征①：全屏灭活（.screen 全无 active）——白屏形态之一 */
  if (!act) {
    if (!wdNoScreenSince) wdNoScreenSince = now;
    else if (now - wdNoScreenSince > 4000) wdRecover('blank');
    return;
  }
  wdNoScreenSince = 0;
  if (act.id !== 'scr-battle') { wdStuckBattleSince = 0; return; }
  var hasQ = $('q-options').children.length > 0 || !$('q-spell').hidden || (($('q-prompt').textContent || '').length > 0);
  var frozenSig = run && run.q && run.q.locked && !timerRAF;   /* 题面锁定且计时/续问链全停（正常至多存在 1.5s） */
  /* 特征②：战斗已结束却滞留战斗页（endRun 半途失败的历史形态）——
     无题面或有残留的锁定题面都算；还能正常作答的解锁题面不算 */
  if (!run || run.ended) {
    if (!hasQ || frozenSig) {
      if (!wdStuckBattleSince) wdStuckBattleSince = now;
      else if (now - wdStuckBattleSince > 6000) wdRecover('battle-dead');
    } else wdStuckBattleSince = 0;
    return;
  }
  /* 特征③：局还活着但 8s 无题面（startRun/renderQuestion 半渲染冻结） */
  if (!hasQ) {
    if (!wdStuckBattleSince) wdStuckBattleSince = now;
    else if (now - wdStuckBattleSince > 8000) wdRecover('battle-no-q');
    return;
  }
  /* 特征④：题面在但已锁定、计时停摆且无任何弹层/续问链在跑——主链异常后
     「永远答不动的题面」的直接形态 */
  if (frozenSig) {
    if (!wdStuckBattleSince) wdStuckBattleSince = now;
    else if (now - wdStuckBattleSince > 8000) wdRecover('battle-frozen');
    return;
  }
  wdStuckBattleSince = 0;
}

/* ---------- 词库加载失败的可恢复提示 ---------- */
function showLoadFail() {
  try {
    var exist = $('wq-loadfail');
    if (exist) { exist.hidden = false; return; }
    var ov = document.createElement('div');
    ov.id = 'wq-loadfail';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(10,8,24,.94);color:#fff;' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font-size:16px;text-align:center;padding:24px;';
    var ic = document.createElement('div'); ic.style.fontSize = '44px'; ic.textContent = '📖';
    var t1 = document.createElement('div'); t1.textContent = '词库资源（words.js）加载失败，游戏无法出题。';
    var t2 = document.createElement('div');
    t2.style.cssText = 'opacity:.75;font-size:13px;line-height:1.6;';
    t2.textContent = '请检查网络后刷新重试；你的存档保存在本机，不会丢失。';
    var btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = '🔄 刷新重试';
    btn.onclick = function () { location.reload(); };
    ov.appendChild(ic); ov.appendChild(t1); ov.appendChild(t2); ov.appendChild(btn);
    document.body.appendChild(ov);
  } catch (e) {}
}

/* ---------- SW 更新接管：战斗中挂起，结算/回主页后再刷 ----------
   index.html 的 controllerchange 自愈原本立即 location.reload()——正在战斗时触发
   会瞬间白闪并丢掉整局。这里把「是否战斗中」的判断交给游戏侧。 */
var swReloadPending = false;
window.__wqDeferReload = function () {
  var act = null;
  try { act = document.querySelector('.screen.active'); } catch (e) {}
  if (act && act.id === 'scr-battle' && run && !run.ended) {
    swReloadPending = true;
    return true;
  }
  return false;
};
function flushSwReload() {
  if (!swReloadPending) return;
  swReloadPending = false;
  var act = null;
  try { act = document.querySelector('.screen.active'); } catch (e) {}
  if (act && act.id === 'scr-battle' && run && !run.ended) { swReloadPending = true; return; }   /* 又开了一局：继续等 */
  window.__wqSelfHealed = true;
  try { location.reload(); } catch (e) {}
}

function init() {
  var wordsOk = !!buildEnc();
  makeDeco($('home-deco'), ['🌲', '✨', '🍄', '🦋', '🌟', '⛰️'], 10);
  TTS.init();
  bindEvents();
  refreshHome();
  showScreen('scr-home');
  startWatchdog();
  if (!wordsOk) showLoadFail();   /* 词库加载失败：给可恢复提示，而不是无声死页 */
  /* PWA：本地服务 / https 下注册离线缓存（双击 file:// 打开时自动跳过）。
     updateViaCache:'none'：SW 脚本的更新检查绕过 HTTP 缓存——否则 sw.js 自身被
     启发式新鲜缓存时（本地 python 服务器只发 Last-Modified 不发 Cache-Control），
     浏览器会连续多次加载都用旧 SW 字节，版本更新迟迟不生效 */
  if ('serviceWorker' in navigator &&
      (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    try { navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(function () {}); } catch (e) {}
  }
}

init();
