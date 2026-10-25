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
    stats: { kills: 0, bosses: 0, spellOk: 0, listenOk: 0, runs: 0, dailyDone: 0, maxCombo: 0, perfects: 0 },
    plan: { target: 10 },
    planDay: { date: '', done: 0, total: 0, complete: false },
    dailyLog: {},
    confuse: {},
    unit: {},            // listId -> 当前单元索引（0 起）
    unitMode: 'none',    // none | auto | 单元号(1起)
    unitList: 'cet4',
    wrongBook: {}        // word -> { n: 答错次数, t: 最近答错时间 }
  };
}

function loadSave() {
  try {
    var raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    var d = defaultSave();
    var s = JSON.parse(raw);
    ['coins', 'mastery', 'customLists', 'lastLists', 'lastDiff'].forEach(function (k) {
      if (s[k] !== undefined) d[k] = s[k];
    });
    ['upgrades', 'streak', 'best', 'settings', 'daily', 'ach', 'pets', 'stats', 'plan', 'planDay', 'dailyLog', 'confuse', 'unit', 'wrongBook'].forEach(function (k) {
      if (s[k]) d[k] = Object.assign(d[k], s[k]);
    });
    d.settings.qtypes = Object.assign(defaultSave().settings.qtypes, (s.settings || {}).qtypes || {});
    return d;
  } catch (e) { return defaultSave(); }
}

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
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

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

/* Boss 随机词缀 */
var BOSS_MODS = {
  haste: { icon: '⏱️', name: '时间压缩', desc: '答题时间 -25%' },
  rage:  { icon: '💢', name: '狂暴',     desc: '它的攻击伤害 +3' },
  thorn: { icon: '🌵', name: '荆棘',     desc: '答错额外受 1 点伤害' },
  drain: { icon: '🧲', name: '汲取',     desc: '你答错时它会回血' }
};

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
  { id: 'new_words',  icon: '🌱', txt: '遇到 8 个新单词',      goal: 8,  reward: 30 }
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
  ['pet1',        '🐣', '宠物之家', '获得一只宠物']
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
      this.ctx = this.cv.getContext('2d');
    }
    this.cv.width = window.innerWidth;
    this.cv.height = window.innerHeight;
  },
  burst: function (n) {
    try {
      this.ensure();
      var W = this.cv.width, H = this.cv.height;
      for (var i = 0; i < (n || 60); i++) {
        this.parts.push({
          x: W / 2 + (Math.random() - 0.5) * 120,
          y: H * 0.35,
          vx: (Math.random() - 0.5) * 16,
          vy: -(5 + Math.random() * 9),
          g: 0.35,
          s: 5 + Math.random() * 7,
          c: this.COLORS[Math.floor(Math.random() * this.COLORS.length)],
          r: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.3,
          life: 70 + Math.random() * 50
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
      c.clearRect(0, 0, this.cv.width, this.cv.height);
    }
  }
};

function shakeApp() {
  var a = $('app');
  a.classList.remove('shake');
  void a.offsetWidth;
  a.classList.add('shake');
  setTimeout(function () { a.classList.remove('shake'); }, 450);
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
    d.onclick = function () { onMatchCard(i); };
    grid.appendChild(d);
  });
  $('match-moves').textContent = '👟 步数 ' + match.moves;
  $('match-pairs').textContent = '🧩 ' + match.matched + '/' + match.total + ' 对';
}
function onMatchCard(i) {
  if (!match || match.lock || match.finished) return;
  var c = match.cards[i];
  if (c.open || c.done) return;
  c.open = true;
  match.openIdx.push(i);
  renderMatch();
  if (match.openIdx.length === 2) {
    match.moves++;
    var a = match.cards[match.openIdx[0]], b = match.cards[match.openIdx[1]];
    if (a.key === b.key && a.kind !== b.kind) {
      a.done = b.done = true;
      a.open = b.open = false;
      match.matched++;
      match.openIdx = [];
      save.mastery[a.key] ? save.mastery[a.key].seen++ : (save.mastery[a.key] = { lv: 0, seen: 1, ok: 0, wrong: 0, last: Date.now(), due: 0, wrongStreak: 0 });
      Sfx.correct(2 + match.matched);
      TTS.speak(a.key, true);
      renderMatch();
      persist();
      if (match.matched >= match.total) finishMatch();
    } else {
      match.lock = true;
      Sfx.tone(200, .12, 'sine', 0, .05);
      setTimeout(function () {
        if (!match) return;
        a.open = false; b.open = false;
        match.openIdx = [];
        match.lock = false;
        renderMatch();
      }, 750);
    }
  }
}
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
  if (run.mode === 'adventure' || run.mode === 'endless') addPressure(-8);
  Sfx.levelup();
  fx('⚡ 勇者爆发！+' + bonus + '🪙 生命+2', 'good', 50, 16);
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
var setupMode = 'adventure';

function coinMult() { return 1 + 0.2 * (save.upgrades.coin || 0) + (run && run.pet === 'dragon' ? 0.15 : 0); }
function perQuestionSec() {
  var d = run.diff.sec;
  var base;
  if (run.mode === 'adventure') base = d - (run.stage - 1) * 0.3 + (save.upgrades.time || 0) * 2 + (run.stageBonus || 0);
  else if (run.mode === 'endless') base = d - run.kills * 0.12 + (save.upgrades.time || 0) * 2;
  else base = d + (save.upgrades.time || 0) * 2;
  if (run.pet === 'owl') base *= 1.15;
  if (run.mode === 'adventure' && run.bossStage && run.bossMod === 'haste') base *= 0.75;
  if (run.mode === 'adventure' && run.bossStage && run.enrage) base *= 0.88;
  base += (run.timerAdj || 0);
  return Math.max(4, base);
}

/* 是否为扣血/守城类模式 */
function combatLike() {
  return run && (run.mode === 'adventure' || run.mode === 'endless');
}

function startRun(mode, listIds, diffKey, explicitPool) {
  var diff = DIFFS[diffKey] || DIFFS.normal;
  var unitCtx = (mode === 'review' || mode === 'drill') ? null : resolveUnitCtx(listIds);
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
    hp: maxHp, maxHp: maxHp, shields: save.upgrades.shield || 0, hints: 0, hgStack: 0,
    coinsEarned: 0, reinforce: [], recent: [], records: [], recordsBy: {},
    monster: null, q: null, pendingRevenge: false, reviewTotal: 12,
    pet: save.pet || '', timerAdj: 0, hist: [], wrongTotal: 0,
    planQueue: (mode === 'plan') ? pool.slice() : null,
    unitCtx: unitCtx || null, unitSet: null,
    pressure: 0
  };
  if (run.unitCtx && run.unitCtx.words.length) {
    run.unitSet = {};
    run.unitCtx.words.forEach(function (x) { run.unitSet[x.w] = 1; });
  }
  if (mode === 'plan' || mode === 'review' || mode === 'drill') {
    run.reviewTotal = pool.length < 4 ? pool.length * 2 : pool.length;  /* 小词池对决：每词来两遍 */
  }

  save.lastLists = listIds; save.lastDiff = diffKey; persist();
  if (mode === 'plan') { ensurePlanDay(); save.planDay.total = pool.length; persist(); }

  showScreen('scr-battle');
  $('hero-emoji').textContent = (mode === 'adventure' || mode === 'endless') ? '🏰' : '🧙‍♂️';
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
  run.bossStage = (run.mode === 'adventure' && run.stage % 5 === 0);
  run.bossMod = run.bossStage ? rnd(Object.keys(BOSS_MODS)) : '';
  run.stageSize = run.bossStage ? 1 : (6 + (run.stage >= 10 ? 1 : 0) + (run.stage >= 20 ? 1 : 0));
  run.stageBonus = run.hgStack;  // 消耗沙漏
  run.hgStack = 0;

  if (run.pet === 'fairy' && run.mode === 'adventure' && run.pressure > 0) {
    addPressure(-5);
    fx('🧚 宠修城墙 压境-5%', 'good', 68, 60);
  }

  var themeIdx = (run.stage - 1) % THEMES.length;
  applyTheme(themeIdx);
  updateHUD();
  BGM.start(run.bossStage ? 'boss' : 'normal');

  var theme = THEMES[themeIdx];
  var story = theme[3][run.stage % theme[3].length];
  if (run.bossStage) {
    Sfx.boss();
    var mod = BOSS_MODS[run.bossMod];
    showBanner('⚠️ 第 ' + run.stage + ' 关 · BOSS 战',
      mod.icon + ' ' + mod.name + '：' + mod.desc + '<br>' + theme[1] + ' · ' + story,
      function () { nextMonster(); }, 2100);
  } else {
    var sub = story + (run.stage === 1 ? '<br>敌军已兵临城下，快速答对击退他们！' : '');
    showBanner('第 ' + run.stage + ' 关 · ' + theme[1], sub, function () { nextMonster(); }, 1500);
  }
}

function spawnMonster() {
  var boss = run.bossStage;
  var hp;
  if (boss) hp = run.stage >= 15 ? 4 : 3;
  else {
    var tough = (run.mode === 'endless') ? run.kills >= 12 : run.stage >= 6;
    hp = (combatLike() && tough && Math.random() < 0.25) ? 2 : 1;
  }
  var pick = boss ? rnd(BOSSES) : rnd(MONSTERS);
  run.monster = { emoji: pick[0], name: pick[1], hp: hp, maxHp: hp, boss: boss };
  var me = $('monster-emoji');
  me.textContent = pick[0];
  me.className = 'monster-emoji' + (boss ? ' boss' : '');
  $('monster-name').textContent = pick[1] + (boss ? '' : ' · Lv.' + Math.max(1, Math.floor((run.mode === 'endless' ? run.kills : run.stage * 2) / 2)));
  $('monster-name').className = boss ? 'monster-name boss-name' : 'monster-name';
  var modEl = $('boss-mod');
  if (boss && run.bossMod) {
    var bm = BOSS_MODS[run.bossMod];
    modEl.innerHTML = bm.icon + ' ' + bm.name;
    modEl.title = bm.desc;
    modEl.hidden = false;
  } else {
    modEl.hidden = true;
  }
  updateHUD();
}

function nextMonster() {
  if (!run || run.ended) return;
  spawnMonster();
  askNext(false, null);
}

function askNext(sameWord, avoidType) {
  if (!run || run.ended) return;
  var word;
  if (sameWord && run.q) {
    word = run.q.word;
  } else {
    word = pickWord();
  }
  var question = buildQuestion(word, avoidType);
  if (sameWord) question.retries = (run.q ? run.q.retries : 0) + 1;
  run.q = question;
  renderQuestion();
}
function renderQuestion() {
  var q = run.q;
  /* 移开按钮焦点：避免按 Enter/空格 误触发上一个点过的按钮 */
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  $('q-type').textContent = TYPE_LABEL[q.type] + (q.isRevenge ? ' 　😈 复仇怪兽来袭！' : '');
  $('q-options').innerHTML = '';
  $('q-options').className = 'q-options';
  $('q-spell').hidden = true;
  $('q-options').hidden = false;
  $('btn-replay').hidden = q.type !== 'listen';
  $('btn-hint').hidden = true;
  $('btn-hint').disabled = run.hints <= 0;
  $('hint-count').textContent = run.hints;

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
    $('btn-spell-hint').disabled = run.hints <= 0;
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
    stopTimer();
    fx('💥 城墙失守！', 'bad', 50, 30);
    setTimeout(function () { if (run && !run.ended) endRun('overrun'); }, 700);
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
  var now = performance.now();
  var dt = lastTickT ? Math.min(0.5, (now - lastTickT) / 1000) : 0;
  lastTickT = now;
  var left = timerEnd - now;
  var r = Math.max(0, left / timerDur);
  var f = $('timer-fill');
  f.style.width = (r * 100) + '%';
  f.className = 'timer-fill' + (r < 0.2 ? ' danger' : (r < 0.45 ? ' warn' : ''));
  /* 大军压境：答题期间敌军持续推进，关卡越高推得越快 */
  if (run && (run.mode === 'adventure' || run.mode === 'endless') && run.q && !run.q.locked && run.pressure < 100) {
    var creep = run.mode === 'endless' ? 0.5 + run.kills * 0.04 : 0.45 + (run.stage - 1) * 0.07;
    addPressure(creep * dt);
  }
  if (run && run.pressure >= 100) { timerRAF = null; return; }
  if (left <= 0) { timerRAF = null; onTimeout(); return; }
  timerRAF = requestAnimationFrame(tick);
}
function stopTimer() {
  if (timerRAF) cancelAnimationFrame(timerRAF);
  timerRAF = null;
}
function onTimeout() {
  if (!run || !run.q || run.q.locked) return;
  var q = run.q;
  if (q.type === 'c2e' || q.type === 'e2c' || q.type === 'listen') {
    $('q-options').classList.add('locked');
    var cb = $('q-options').children[q.answer];
    if (cb) cb.classList.add('correct');
  }
  resolve(false, true);
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

function resolve(ok, timedOut) {
  if (!run || !run.q || run.q.locked) return;
  var q = run.q;
  q.locked = true;
  stopTimer();
  run.answered++;
  bumpToday();
  logAnswer(ok);

  var word = q.word;
  var rec = record(word);
  updateMastery(word.w, ok, q.retries > 0);
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

  if (ok) {
    run.correct++;
    run.combo++;
    run.maxCombo = Math.max(run.maxCombo, run.combo);
    rec.ok++;

    save.stats.maxCombo = Math.max(save.stats.maxCombo, run.combo);
    bumpTask('q_correct');
    if (q.type === 'spell') { save.stats.spellOk++; bumpTask('spell_ok'); }
    if (q.type === 'listen') { save.stats.listenOk++; bumpTask('listen_ok'); }
    setTask('combo_hit', run.combo);
    if (save.mastery[word.w] && save.mastery[word.w].seen === 1) bumpTask('new_words');
    if (run.combo > 0 && run.combo % 5 === 0) comboBurst();
    /* 答对击退敌军：连击越高退得越多 */
    if (run.mode === 'adventure' || run.mode === 'endless') {
      addPressure(-(10 + Math.min(run.combo, 10) * 0.8));
    }
    /* 升到 3 星 = 攻克错题 */
    if (save.mastery[word.w] && save.mastery[word.w].lv >= 3 && save.wrongBook[word.w]) {
      delete save.wrongBook[word.w];
      toast('📕 已攻克错题：「' + word.w + '」');
      persist();
    }

    var gain = Math.round((5 + Math.min(run.combo, 10)) * coinMult());
    save.coins += gain;
    run.coinsEarned += gain;

    /* 答对混过的词 → 清除混淆档案 */
    if ((q.type === 'c2e' || q.type === 'listen') && save.confuse && save.confuse[word.w]) {
      delete save.confuse[word.w];
    }

    Sfx.correct(run.combo);
    Sfx.coin();
    heroAttackFx('-' + (run.monster.boss ? '1⚡' : '1'), gain);
    run.monster.hp--;
    if (run.monster.boss && run.monster.hp === 1 && !run.enrage) {
      run.enrage = true;
      fx('💢 BOSS 濒死狂暴！下一题提速！', 'bad', 25, 12);
    }
    updateHUD();
    TTS.speak(word.w, false);

    if (run.monster.hp <= 0) {
      killMonster();
    } else {
      fx('BOSS 受伤了！再来！', 'good', 25, 22);
      setTimeout(function () {
        if (!run || run.ended) return;
        askNext(false, null);
      }, 700);
    }
  } else {
    run.combo = 0;
    run.wrongTotal++;
    rec.wrong++;
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
    Sfx.wrong();
    $('q-card').classList.add('shake');
    setTimeout(function () { $('q-card').classList.remove('shake'); }, 450);
    updateHUD();

    setTimeout(function () {
      showMemCard(word, function () {
        monsterAttack(function () {
          if (q.retries < 1) {
            askNext(true, q.type);   // 立刻换题型重考同一个词
          } else {
            var queued = run.reinforce.some(function (r) { return r.w === word.w; });
            if (!queued && combatLike()) {
              run.reinforce.push({ w: word.w, m: word.m, at: run.answered + 4 });
            }
            askNext(false, null);
          }
        });
      });
    }, 650);
  }
}

function heroAttackFx(dmgText, coinGain) {
  var hero = $('hero-emoji');
  hero.classList.remove('attack');
  void hero.offsetWidth;
  hero.classList.add('attack');
  var mon = $('monster-emoji');
  setTimeout(function () {
    mon.classList.remove('hit');
    void mon.offsetWidth;
    mon.classList.add('hit');
  }, 180);
  fx(dmgText, 'good', 22, 30);
  if (coinGain) fx('🪙 +' + coinGain, '', 30, 42);
}

function monsterAttack(cb) {
  if (run.mode === 'review' || run.mode === 'plan' || run.mode === 'drill') { setTimeout(cb, 250); return; }
  var mon = $('monster-emoji');
  /* 敌军攻势：换算成压境值（城墙加固 / 玄龟减伤） */
  var spike = run.diff.dmg * 2.2 + (run.monster.boss ? 4 : 0);
  if (run.monster.boss && run.bossMod === 'rage') spike *= 1.3;
  if (run.monster.boss && run.bossMod === 'thorn') spike += 5;
  spike *= (1 - 0.08 * (save.upgrades.hp || 0));
  if (run.pet === 'turtle') spike *= 0.8;
  var after = function () { setTimeout(cb, 550); };

  if (run.shields > 0) {
    run.shields--;
    fx('🛡️ 护盾抵挡敌军攻势！', 'good', 68, 45);
    Sfx.tone(880, .12, 'triangle', 0, .08);
    updateHUD();
    after();
    return;
  }
  mon.classList.remove('hit');
  var hero = $('hero-emoji');
  hero.classList.remove('hurt');
  void hero.offsetWidth;
  hero.classList.add('hurt');
  Sfx.hurt();
  shakeApp();
  fx('敌军压境 +' + Math.round(spike) + '%', 'bad', 68, 45);
  addPressure(spike);
  if (run.pressure >= 100) return;   /* 城破流程已由 addPressure 触发 */
  after();
}

function killMonster() {
  var m = run.monster;
  run.kills++;
  save.stats.kills++;
  bumpTask('kill_total');
  if (m.boss) { save.stats.bosses++; bumpTask('boss_kill'); }
  var me = $('monster-emoji');
  me.classList.add('dead');
  Sfx.kill();
  if (m.boss) Confetti.burst(70);
  var bonus = Math.round((m.boss ? 40 : 10) * coinMult());
  save.coins += bonus;
  run.coinsEarned += bonus;
  fx(m.boss ? 'BOSS 击败！🪙+' + bonus : '击杀！🪙+' + bonus, 'good', 25, 25);
  updateHUD();

  setTimeout(function () {
    if (!run || run.ended) return;
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
  }, 800);
}

function stageClear() {
  var bonus = Math.round((20 + run.stage * 2) * coinMult());
  save.coins += bonus;
  run.coinsEarned += bonus;
  save.best.adventure = Math.max(save.best.adventure, run.stage);
  persist();
  Sfx.levelup();
  Confetti.burst(60);
  openShop();
}

/* ========================= 商店 ========================= */
function openShop() {
  showScreen('scr-shop');
  $('shop-coins').textContent = save.coins;
  $('shop-sub').textContent = '第 ' + run.stage + ' 关通关！奖励 🪙' + Math.round((20 + run.stage * 2) * coinMult()) + ' · 当前第 ' + run.stage + ' 关';

  var wrap = $('shop-items');
  wrap.innerHTML = '';
  SHOP_ITEMS.forEach(function (item) {
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
    btn.textContent = '🪙 ' + item.price;
    btn.disabled = save.coins < item.price;
    btn.onclick = function () {
      if (save.coins < item.price) return;
      save.coins -= item.price;
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
function endRun(reason) {
  stopTimer();
  BGM.stop();
  $('memcard').hidden = true;
  memCb = null;
  $('banner').hidden = true;
  if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
  save.stats.runs++;
  bumpTask('run_any');
  if (run.mode === 'review' || run.mode === 'drill') bumpTask('review_done');
  if (run.answered >= 10 && run.wrongTotal === 0) save.stats.perfects++;
  checkAch();
  var titles = { dead: '💀 你倒下了…', overrun: '🏰 城墙失守…', quit: '🏳️ 撤退整顿', done: '🎉 复习完成！' };
  if (run.mode === 'drill' && reason === 'done') titles.done = '🔥 强化训练完成！';
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
  $('result-title').textContent = titles[reason] || '⚔️ 冒险结束';

  if (run.mode === 'adventure') {
    save.best.adventure = Math.max(save.best.adventure, run.stage);
  } else if (run.mode === 'endless') {
    save.best.endless = Math.max(save.best.endless, run.kills);
  }
  persist();

  var acc = run.answered ? Math.round(run.correct / run.answered * 100) : 0;
  var stats = [];
  if (run.mode === 'adventure') stats.push('🏆 抵达第 ' + run.stage + ' 关', '⚔️ 击杀 ' + run.kills);
  if (run.mode === 'endless') stats.push('⚔️ 击杀 ' + run.kills + ' 只');
  if (run.mode === 'review') stats.push('📖 复习 ' + run.kills + ' 词');
  if (run.mode === 'drill') stats.push('🔥 强化 ' + run.kills + ' 词');
  if (run.mode === 'plan') stats.push('🎯 计划完成 ' + run.kills + ' 词');
  stats.push('✏️ 答题 ' + run.answered + ' 题', '🎯 正确率 ' + acc + '%', '🔥 最高连击 ' + run.maxCombo, '🪙 获得 ' + run.coinsEarned, '📅 连续打卡 ' + save.streak.count + ' 天');
  $('result-stats').innerHTML = stats.map(function (s) { return '<span class="chip">' + s + '</span>'; }).join('');

  var wrongs = run.records.filter(function (r) { return r.wrong > 0; });
  var rows = run.records.map(function (r) {
    var lv = (save.mastery[r.w] || {}).lv || 0;
    var stars = '★'.repeat(lv) + '☆'.repeat(5 - lv);
    var mark = r.wrong === 0 ? '✅' : '❌';
    return '<div class="rw-row"><span class="rw-mark">' + mark + '</span><span class="rw-word">' + r.w + '</span><span class="rw-mean">' + r.m + '</span><span class="rw-stars">' + stars + '</span></div>';
  });
  $('result-words').innerHTML = rows.length ? rows.join('') : '<p class="hint">本局没有遇到新单词</p>';
  $('btn-retry-wrong').hidden = wrongs.length < 2;

  run.ended = reason;
  showScreen('scr-result');
  refreshHome();
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

  if (run.mode === 'adventure') {
    $('battle-stage').textContent = (run.bossStage ? '⚠️ ' : '') + '第 ' + run.stage + ' 关';
    var remain = run.stageSize - run.killedInStage;
    $('monster-queue').textContent = run.bossStage ? '' : '👹 ×' + remain;
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
  var combat = (run.mode === 'adventure' || run.mode === 'endless');
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
  $('home-best').textContent = Math.max(save.best.adventure, save.best.endless);
  $('home-mastered').textContent = masteredCount();
  $('home-today').textContent = save.streak.todayCount;
  renderDaily();
  renderPlan();
  persist();
}

/* ========================= 出战设置 ========================= */
function openSetup(mode) {
  setupMode = mode;
  var titles = { adventure: '🧭 出战准备', endless: '♾️ 无尽挑战', review: '📖 复习设置' };
  $('setup-title').textContent = titles[mode];
  $('setup-diff-wrap').style.display = (mode === 'review') ? 'none' : '';
  renderSetupLists();

  var radios = document.querySelectorAll('input[name=diff]');
  radios.forEach(function (r) { r.checked = (r.value === save.lastDiff); });

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
  $('wo-word').textContent = w;
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
    if (ioMode !== 'import') { $('io-overlay').hidden = true; return; }
    try {
      var data = JSON.parse($('io-text').value);
      if (!data || typeof data !== 'object' || !data.settings || !data.mastery) throw new Error('bad');
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      location.reload();
    } catch (e) { toast('导入失败：存档格式不正确'); }
  };
}

/* ========================= 存档导出 / 导入 ========================= */
var ioMode = 'export';
function openIO(mode) {
  ioMode = mode;
  $('io-title').textContent = mode === 'export' ? '📤 导出存档（复制下面这段文本保管）' : '📥 导入存档（粘贴之前导出的文本）';
  var ta = $('io-text');
  ta.value = mode === 'export' ? JSON.stringify(save) : '';
  ta.readOnly = mode === 'export';
  $('io-overlay').hidden = false;
  if (mode === 'export') setTimeout(function () { ta.focus(); ta.select(); }, 60);
}

/* ========================= 键盘操作 ========================= */
function onKey(e) {
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
  $('btn-codex').onclick = openCodex;
  $('btn-settings').onclick = openSettings;
  $('btn-help').onclick = function () { showScreen('scr-help'); };
  $('btn-ach').onclick = openAch;
  $('btn-ach-back').onclick = function () { showScreen('scr-home'); };
  $('btn-plan').onclick = startPlan;
  $('btn-wrongbook').onclick = openWrongBook;
  $('btn-wrong-back').onclick = function () { showScreen('scr-home'); refreshHome(); };
  $('btn-drill').onclick = startDrill;
  $('btn-match').onclick = openMatch;
  $('btn-match-restart').onclick = startMatch;
  $('btn-match-back').onclick = function () { stopMatchTimer(); showScreen('scr-home'); refreshHome(); };
  $('daily-tasks').addEventListener('click', function (e) {
    var b = e.target.closest('.btn-claim');
    if (b) claimDaily(parseInt(b.dataset.i, 10));
  });

  // 设置页
  $('btn-setup-back').onclick = function () { showScreen('scr-home'); };
  $('btn-start').onclick = startFromSetup;
  $('setup-lists').addEventListener('change', updateSetupHint);
  $('unit-select').onchange = function () {
    save.unitMode = this.value;
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
  $('btn-spell-back').onclick = spellBack;
  $('btn-spell-submit').onclick = submitSpell;
  $('btn-spell-hint').onclick = spellHint;

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
    else startRun(run.mode, run.listIds, run.diffKey);
  };
  $('btn-retry-wrong').onclick = retryWrong;
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
  $('btn-settings-back').onclick = function () { showScreen('scr-home'); };
  $('btn-help-back').onclick = function () { showScreen('scr-home'); };

  // 键盘
  document.addEventListener('keydown', onKey);
  // 首次交互激活音频
  document.addEventListener('pointerdown', function () { Sfx.ensure(); }, { once: true });
}

function init() {
  makeDeco($('home-deco'), ['🌲', '✨', '🍄', '🦋', '🌟', '⛰️'], 10);
  TTS.init();
  bindEvents();
  refreshHome();
  showScreen('scr-home');
  /* PWA：本地服务 / https 下注册离线缓存（双击 file:// 打开时自动跳过） */
  if ('serviceWorker' in navigator &&
      (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    try { navigator.serviceWorker.register('./sw.js').catch(function () {}); } catch (e) {}
  }
}

init();
