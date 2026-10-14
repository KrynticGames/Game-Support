(function () {
  'use strict';
  var script = document.currentScript;
  var game = script && script.dataset.game;
  if (!['word-havoc', 'brain-attack'].includes(game)) return;
  var endpoint = 'https://word-combat-relay.up.railway.app/activity/events';
  var disabledKey = 'kryntic.activity.disabled.v1';
  var test = new URLSearchParams(location.search).get('activity_test') === '1' || navigator.webdriver === true;
  var visitor, session, activeMatch = null, mode = 'menu', queue = [], sending = false, activeSeconds = 0;
  var lastTick = Date.now(), dirty = false, retryCount = 0;
  function uuid() { return crypto.randomUUID(); }
  function allowed() { try { return localStorage.getItem(disabledKey) !== '1' && navigator.doNotTrack !== '1' && navigator.globalPrivacyControl !== true; } catch (_) { return false; } }
  try {
    visitor = localStorage.getItem('kryntic.activity.visitor.v1');
    if (!visitor && allowed()) { visitor = uuid(); localStorage.setItem('kryntic.activity.visitor.v1', visitor); }
    var key = 'kryntic.activity.session.' + game;
    var previous = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (previous && Date.now() - previous.at < 1800000 && previous.test === test) { session = previous.id; activeSeconds = Number(previous.seconds) || 0; }
    else session = uuid();
    sessionStorage.setItem(key, JSON.stringify({id: session, at: Date.now(), test: test, seconds: activeSeconds}));
  } catch (_) { return; }
  function emit(event, extra) {
    if (!allowed() || !visitor) return;
    queue.push(Object.assign({id: uuid(), game: game, visitor: visitor, session: session, event: event, mode: mode, match: activeMatch, seconds: Math.floor(activeSeconds), test: test}, extra || {}));
    if (queue.length > 50) queue.shift();
    dirty = true;
    void flush();
  }
  async function flush() {
    if (sending || !queue.length || !allowed()) return;
    sending = true;
    var batch = queue.slice(0, 12);
    try {
      var response = await fetch(endpoint, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({events: batch}), keepalive: true, credentials: 'omit', referrerPolicy: 'no-referrer'});
      if (!response.ok) throw new Error('Activity endpoint unavailable');
      queue.splice(0, batch.length); retryCount = 0;
    } catch (_) { retryCount++; }
    sending = false;
    if (queue.length && retryCount < 4) setTimeout(flush, Math.min(30000, 1000 * Math.pow(2, retryCount)));
  }
  function tick() {
    var now = Date.now();
    if (document.visibilityState === 'visible') activeSeconds += Math.min(5, (now - lastTick) / 1000);
    lastTick = now;
    try { sessionStorage.setItem(key, JSON.stringify({id: session, at: now, test: test, seconds: activeSeconds})); } catch (_) {}
  }
  window.KrynticActivity = {
    reset: function () { activeMatch = null; mode = 'setup'; },
    start: function (nextMode) { mode = nextMode; activeMatch = uuid(); emit('match_start'); },
    ensureStart: function (nextMode) { if (!activeMatch) this.start(nextMode); },
    finish: function () { if (!activeMatch) return; emit('match_complete'); activeMatch = null; },
    event: function (name) { emit(name); }
  };
  document.addEventListener('click', function (e) {
    var target = e.target.closest('button');
    if (!target) return;
    var play = game === 'word-havoc' ? ['chooseCpuBtn','chooseOnlineBtn','chooseLocalBtn'] : ['startBtn','dailyBtn','practiceBtn'];
    if (play.includes(target.id)) emit('play_click');
  }, true);
  setInterval(tick, 1000);
  setInterval(function () { tick(); if (allowed() && document.visibilityState === 'visible') emit('engagement'); }, 30000);
  document.addEventListener('visibilitychange', function () { tick(); if (document.visibilityState === 'hidden') emit('engagement'); });
  window.addEventListener('pagehide', function () { tick(); emit('session_end'); });
  window.addEventListener('online', function () { retryCount = 0; void flush(); });
  window.addEventListener('storage', function (e) { if (e.key === disabledKey && !allowed()) queue = []; });
  document.addEventListener('DOMContentLoaded', function () {
    if (game === 'brain-attack') {
      var box = document.querySelector('#startModal');
      if (box) { var link = document.createElement('a'); link.textContent = 'Privacy & activity preferences'; link.href = '../brain-attack-privacy.html'; link.style.cssText = 'display:block;margin:12px auto 0;color:#b8d2cf;font:12px system-ui;text-align:center'; box.appendChild(link); }
    }
  });
  emit('page_view');
})();
