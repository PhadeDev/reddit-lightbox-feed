// ==UserScript==
// @name         Reddit Lightbox Feed
// @namespace    https://github.com/PhadeDev/reddit-lightbox-feed
// @version      0.1.0
// @description  A denser Reddit feed layout, and posts that open in a lightbox with their comments so you never leave the page.
// @author       PhadeDev
// @match        https://www.reddit.com/*
// @run-at       document-idle
// @noframes
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @homepageURL  https://github.com/PhadeDev/reddit-lightbox-feed
// @supportURL   https://github.com/PhadeDev/reddit-lightbox-feed/issues
// @updateURL    https://raw.githubusercontent.com/PhadeDev/reddit-lightbox-feed/main/reddit-lightbox-feed.user.js
// @downloadURL  https://raw.githubusercontent.com/PhadeDev/reddit-lightbox-feed/main/reddit-lightbox-feed.user.js
// ==/UserScript==

(function () {
  'use strict';

  var VERSION = '0.1.0';

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                      */
  /* ------------------------------------------------------------------ */

  var LOG = [];
  function log() {
    var msg = Array.prototype.map.call(arguments, function (x) {
      return x && x.message ? x.message : String(x);
    }).join(' ');
    LOG.push(new Date().toISOString().slice(11, 19) + ' ' + msg);
    if (LOG.length > 60) LOG.shift();
    try { console.debug('[lightbox]', msg); } catch (e) { /* ignore */ }
  }

  var gm = {
    get: function (k, d) { try { return typeof GM_getValue === 'function' ? GM_getValue(k, d) : d; } catch (e) { return d; } },
    set: function (k, v) { try { if (typeof GM_setValue === 'function') GM_setValue(k, v); } catch (e) { /* ignore */ } },
    style: function (css) {
      try { if (typeof GM_addStyle === 'function') { GM_addStyle(css); return; } } catch (e) { /* fall through */ }
      var s = document.createElement('style');
      s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    },
    menu: function (title, fn) { try { if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand(title, fn); } catch (e) { /* ignore */ } },
    copy: function (text) { try { if (typeof GM_setClipboard === 'function') { GM_setClipboard(text, 'text'); return true; } } catch (e) { /* ignore */ } return false; }
  };

  function ago(utc, now) {
    var s = Math.max(0, (now || Date.now() / 1000) - utc);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min. ago';
    if (s < 86400) return Math.floor(s / 3600) + ' hr. ago';
    if (s < 86400 * 30) return Math.floor(s / 86400) + ' d ago';
    if (s < 86400 * 365) return Math.floor(s / 86400 / 30) + ' mo. ago';
    return Math.floor(s / 86400 / 365) + ' yr. ago';
  }

  function fmt(n) {
    n = +n || 0;
    return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '') + 'k' : String(n);
  }

  function pathOf(href) {
    try { return new URL(href, 'https://www.reddit.com').pathname.replace(/\/+$/, '').toLowerCase(); } catch (e) { return ''; }
  }

  function hashStr(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  function safeHref(h) {
    try {
      var u = new URL(h, location.origin);
      return /^https?:$/.test(u.protocol) ? u.href : '';
    } catch (e) { return ''; }
  }

  function el(tag, props) {
    var e = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'style') e.style.cssText = v;
        else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(e, arguments[i]);
    return e;
  }

  function append(parent, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(function (k) { append(parent, k); }); return; }
    parent.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }

  function svg(d) {
    var ns = 'http://www.w3.org/2000/svg';
    var s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'ic');
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    s.appendChild(p);
    return s;
  }

  var IC = {
    left: 'M15 5l-7 7 7 7',
    right: 'M9 5l7 7-7 7',
    x: 'M6 6l12 12M18 6L6 18',
    link: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
    share: 'M4 12v7h16v-7M12 3v13M7 8l5-5 5 5',
    comment: 'M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z',
    up: 'M12 19V6M5 12l7-7 7 7'
  };

  /* ------------------------------------------------------------------ */
  /* Safe rendering of Reddit's own comment HTML (no innerHTML)          */
  /* ------------------------------------------------------------------ */

  var ALLOW = {
    a: 1, p: 1, br: 1, em: 1, strong: 1, del: 1, s: 1, sup: 1, sub: 1, blockquote: 1, ul: 1, ol: 1, li: 1,
    code: 1, pre: 1, h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1, hr: 1, table: 1, thead: 1, tbody: 1, tr: 1,
    th: 1, td: 1, span: 1, div: 1
  };
  var DROP = {
    script: 1, style: 1, iframe: 1, object: 1, embed: 1, link: 1, meta: 1, form: 1, input: 1, textarea: 1,
    button: 1, svg: 1, img: 1, video: 1, audio: 1, noscript: 1, template: 1
  };

  function cleanInto(src, dst) {
    src.childNodes.forEach(function (n) {
      if (n.nodeType === 3) { dst.appendChild(document.createTextNode(n.nodeValue)); return; }
      if (n.nodeType !== 1) return;
      var t = n.tagName.toLowerCase();
      if (DROP[t]) return;
      if (!ALLOW[t]) { cleanInto(n, dst); return; }
      var c = document.createElement(t);
      if (t === 'a') {
        var h = safeHref(n.getAttribute('href'));
        if (h) { c.setAttribute('href', h); c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener noreferrer'); }
      }
      if (t === 'span' && n.classList.contains('md-spoiler-text')) {
        c.className = 'spoiler';
        c.title = 'Spoiler: click to reveal';
        c.addEventListener('click', function () { c.classList.add('shown'); });
      }
      cleanInto(n, c);
      dst.appendChild(c);
    });
  }

  function htmlToNodes(html) {
    var f = document.createDocumentFragment();
    if (!html) return f;
    var doc = new DOMParser().parseFromString(html, 'text/html');
    cleanInto(doc.body, f);
    return f;
  }

  /* ------------------------------------------------------------------ */
  /* Settings and menu                                                  */
  /* ------------------------------------------------------------------ */

  var cfg = { layout: gm.get('layout', true), lightbox: gm.get('lightbox', true) };

  /* ------------------------------------------------------------------ */
  /* Layout (CSS only, scoped to pages that contain a feed)             */
  /* ------------------------------------------------------------------ */

  var LAYOUT_CSS = [
    'shreddit-ad-post, article:has(shreddit-ad-post), shreddit-sidebar-ad { display: none !important; }',
    'body:has(shreddit-feed) #right-sidebar-container { display: none !important; }',
    '#subgrid-container:has(shreddit-feed) { max-width: none !important; width: 100% !important; }',
    '.main-container:has(shreddit-feed) { display: block !important; max-width: none !important; width: 100% !important; }',
    'main#main-content:has(shreddit-feed) { max-width: none !important; width: 100% !important; }',
    'shreddit-feed { display: grid !important; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 12px; align-items: start; }',
    'shreddit-feed > *:not(article) { grid-column: 1 / -1; }',
    'shreddit-feed > hr { display: none !important; }',
    'shreddit-feed > article { width: 100% !important; min-width: 0; margin: 0 !important; }',
    'shreddit-feed shreddit-post > [slot="post-media-container"] { max-height: 340px; overflow: hidden; }'
  ].join('\n');

  /* ------------------------------------------------------------------ */
  /* Lightbox styles (inside a shadow root, so Reddit CSS cannot leak in) */
  /* ------------------------------------------------------------------ */

  var LB_CSS = [
    ':host{all:initial;--surface:#1a1418;--surface2:#251c22;--line:#35293a;--fg:#f2ecf0;--muted:#a99ba3;--accent:#e0a3c8;--accent-bg:#532A45;--up:#ff7a45;--scrim:rgba(8,5,8,.72);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--fg)}',
    ':host([data-theme="light"]){--surface:#fff;--surface2:#F0ECF0;--line:#D0C4CC;--fg:#1f1519;--muted:#5f525a;--accent:#532A45;--accent-bg:#ead9e3;--up:#c8431a;--scrim:rgba(30,15,25,.55)}',
    '*{box-sizing:border-box}',
    'button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;padding:0}',
    ':focus-visible{outline:2px solid var(--accent);outline-offset:2px}',
    '.scrim{position:absolute;inset:0;background:var(--scrim);backdrop-filter:blur(5px)}',
    '.panel{position:relative;width:min(1140px,100%);height:min(920px,100%);background:var(--surface);border:1px solid var(--line);border-radius:14px;display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);grid-template-rows:auto minmax(0,1fr);overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.45);outline:none}',
    '.head{grid-column:1/-1;display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--line)}',
    '.ib{width:36px;height:36px;border-radius:8px;display:grid;place-items:center;color:var(--muted);text-decoration:none}',
    '.ib:hover{background:var(--surface2);color:var(--fg)}',
    '.ib[disabled]{opacity:.35;cursor:default}',
    '.ic{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}',
    '.cnt{font-size:12px;color:var(--muted);margin-inline:4px;font-variant-numeric:tabular-nums}',
    '.sp{flex:1}',
    '.hint{font-size:12px;color:var(--muted);margin-right:6px}',
    '.pane{overflow:auto;padding:20px 22px 28px;min-width:0}',
    '.post{border-right:1px solid var(--line);display:flex;flex-direction:column;gap:12px}',
    'h2{margin:0;font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-.01em;text-wrap:balance;overflow-wrap:anywhere}',
    '.meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12px;color:var(--muted)}',
    '.u{font-weight:600;color:var(--fg);text-decoration:none}',
    '.u:hover{color:var(--accent);text-decoration:underline}',
    '.av{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-size:10px;font-weight:600;color:#fff;flex:none}',
    '.chips{display:flex;gap:6px;flex-wrap:wrap}',
    '.chip{font-size:11px;font-weight:500;padding:1px 8px;border-radius:99px;background:var(--accent-bg);color:var(--fg)}',
    '.chip.nsfw{background:#8E1537;color:#fff}',
    '.media{margin:0;position:relative;border-radius:10px;overflow:hidden;border:1px solid var(--line);background:#000;display:flex;flex-direction:column;align-items:center}',
    '.mimg{display:block;max-width:100%;max-height:68vh;width:100%;object-fit:contain;background:#000}',
    '.media figcaption{position:absolute;left:10px;bottom:10px;background:rgba(0,0,0,.65);color:#fff;font-size:11px;padding:2px 8px;border-radius:99px;max-width:calc(100% - 20px)}',
    '.note{font-size:12px;color:var(--muted)}',
    '.gnav{position:absolute;top:50%;transform:translateY(-50%);width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;display:grid;place-items:center}',
    '.gnav:hover{background:rgba(0,0,0,.85)}',
    '.gp{left:10px}.gn{right:10px}',
    '.gate{position:relative}',
    '.blurred{filter:blur(28px)}',
    '.reveal{position:absolute;inset:0;margin:auto;width:max-content;height:max-content;padding:8px 16px;border-radius:99px;background:var(--surface);border:1px solid var(--line);font-weight:600}',
    '.body{overflow-wrap:anywhere}',
    '.body p,.ctext p{margin:0 0 10px;max-width:70ch}',
    '.body a,.ctext a{color:var(--accent)}',
    'blockquote{border-left:3px solid var(--line);margin:0 0 10px;padding-left:12px;color:var(--muted)}',
    'pre{overflow:auto;background:var(--surface2);padding:8px 10px;border-radius:8px}',
    'code{background:var(--surface2);padding:0 4px;border-radius:4px;font-size:13px}',
    'table{border-collapse:collapse;display:block;overflow:auto}th,td{border:1px solid var(--line);padding:4px 8px}',
    '.linkcard{display:flex;gap:12px;align-items:center;border:1px solid var(--line);background:var(--surface2);border-radius:10px;padding:10px 14px;text-decoration:none;color:var(--muted)}',
    '.linkcard b{color:var(--fg);font-weight:600}',
    '.xp{border-left:3px solid var(--accent-bg);padding-left:12px;display:flex;flex-direction:column;gap:10px}',
    '.acts{display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-top:1px solid var(--line);padding-top:10px;margin-top:4px}',
    '.pill{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border-radius:99px;background:var(--surface2);font-size:13px;font-weight:600;color:var(--fg);text-decoration:none;font-variant-numeric:tabular-nums}',
    'a.pill:hover,button.pill:hover{outline:1px solid var(--accent)}',
    '.pill .ic{width:15px;height:15px}',
    '.ch{display:flex;align-items:baseline;justify-content:space-between;margin:0 0 8px;gap:8px;flex-wrap:wrap}',
    '.ch h3{margin:0;font-size:15px;font-weight:600}',
    '.ch span{font-size:12px;color:var(--muted)}',
    '.reply{display:inline-block;margin-bottom:6px;color:var(--accent);font-weight:600;font-size:13px}',
    '.cm{display:grid;grid-template-columns:16px minmax(0,1fr);gap:6px;margin-top:12px}',
    '.line{position:relative;width:16px;border-radius:4px}',
    '.line::after{content:"";position:absolute;left:7px;top:6px;bottom:0;width:2px;background:var(--line);border-radius:2px}',
    '.line:hover::after{background:var(--accent)}',
    '.cm.fold .line::after{display:none}',
    '.chead{font-size:12px;color:var(--muted);display:flex;gap:6px;flex-wrap:wrap;align-items:center}',
    '.tag{font-size:11px;font-weight:600;padding:0 5px;border-radius:4px;background:var(--accent-bg);color:var(--fg)}',
    '.tag.mod{background:#153E35;color:#fff}',
    '.ctext{margin:2px 0 4px;overflow-wrap:anywhere}',
    '.cm.fold>div>.ctext,.cm.fold>div>.kids{display:none}',
    '.more a{color:var(--accent);font-size:12px}',
    '.spoiler{background:var(--fg);color:transparent;border-radius:3px;cursor:pointer}',
    '.spoiler.shown{background:var(--surface2);color:inherit}',
    '.err{border:1px dashed var(--line);border-radius:10px;padding:16px;color:var(--muted)}',
    '.err b{color:var(--fg)}',
    '.skel{height:14px;border-radius:7px;background:var(--surface2);margin:8px 0}',
    '@media (max-width:859px){.panel{grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto auto;overflow:auto;align-content:start;width:100%;height:100%;border-radius:0;border:0}.head{position:sticky;top:0;z-index:2;background:var(--surface)}.pane{overflow:visible;padding:16px}.post{border-right:0;border-bottom:1px solid var(--line)}.hint{display:none}h2{font-size:21px}}',
    '@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}'
  ].join('\n');

  /* ------------------------------------------------------------------ */
  /* Data                                                               */
  /* ------------------------------------------------------------------ */

  var cache = new Map();

  function loadPost(permalink) {
    if (cache.has(permalink)) return Promise.resolve(cache.get(permalink));
    var url = permalink.replace(/\/+$/, '') + '.json?limit=300&raw_json=1';
    return fetch(url, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('Reddit answered HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      var post = j && j[0] && j[0].data && j[0].data.children && j[0].data.children[0] && j[0].data.children[0].data;
      if (!post) throw new Error('Unexpected data shape');
      var out = { post: post, comments: (j[1] && j[1].data && j[1].data.children) || [] };
      cache.set(permalink, out);
      if (cache.size > 30) cache.delete(cache.keys().next().value);
      log('loaded post, top-level comment items:', out.comments.length);
      return out;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Lightbox                                                           */
  /* ------------------------------------------------------------------ */

  var host = null, root = null, ui = {};
  var S = { list: [], idx: -1, open: false, token: 0, lastFocus: null, prevHtml: '', prevBody: '' };

  function feedCards() {
    return Array.prototype.filter.call(document.querySelectorAll('shreddit-feed shreddit-post'), function (p) {
      return p.getAttribute('permalink') && p.getClientRects().length > 0;
    });
  }

  function build() {
    host = el('div', { id: 'lbx-host' });
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;padding:20px;';
    root = host.attachShadow({ mode: 'open' });
    try {
      var sheet = new CSSStyleSheet();
      sheet.replaceSync(LB_CSS);
      root.adoptedStyleSheets = [sheet];
    } catch (e) {
      var st = document.createElement('style');
      st.textContent = LB_CSS;
      root.appendChild(st);
    }
    ui.scrim = el('div', { class: 'scrim', onclick: function () { close(); } });
    ui.prev = el('button', { class: 'ib', type: 'button', 'aria-label': 'Previous post', onclick: function () { step(-1); } }, svg(IC.left));
    ui.next = el('button', { class: 'ib', type: 'button', 'aria-label': 'Next post', onclick: function () { step(1); } }, svg(IC.right));
    ui.count = el('span', { class: 'cnt' });
    ui.copy = el('button', { class: 'ib', type: 'button', 'aria-label': 'Copy link to this post', onclick: copyLink }, svg(IC.share));
    ui.open = el('a', { class: 'ib', 'aria-label': 'Open this post on Reddit', target: '_blank', rel: 'noopener', href: '#' }, svg(IC.link));
    ui.close = el('button', { class: 'ib', type: 'button', 'aria-label': 'Close', onclick: function () { close(); } }, svg(IC.x));
    ui.head = el('div', { class: 'head' }, ui.prev, ui.next, ui.count, el('span', { class: 'sp' }),
      el('span', { class: 'hint', text: 'J / K or arrow keys to move, Esc to close' }), ui.copy, ui.open, ui.close);
    ui.postPane = el('section', { class: 'pane post' });
    ui.cmPane = el('section', { class: 'pane', 'aria-label': 'Comments' });
    ui.panel = el('div', { class: 'panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Post', tabindex: '-1' }, ui.head, ui.postPane, ui.cmPane);
    root.appendChild(ui.scrim);
    root.appendChild(ui.panel);
    document.documentElement.appendChild(host);
  }

  function themeNow() {
    return document.documentElement.classList.contains('theme-dark') ? 'dark' : 'light';
  }

  function openFromCard(card) {
    S.list = feedCards().map(function (c) { return c.getAttribute('permalink'); });
    var pl = card.getAttribute('permalink');
    S.idx = S.list.indexOf(pl);
    show(pl, card.getAttribute('post-title'));
  }

  function show(pl, titleHint) {
    if (!host) build();
    var tok = ++S.token;
    if (!S.open) {
      S.open = true;
      S.lastFocus = document.activeElement;
      S.prevHtml = document.documentElement.style.overflow;
      S.prevBody = document.body.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      host.setAttribute('data-theme', themeNow());
      host.style.display = 'flex';
      ui.panel.focus({ preventScroll: true });
    }
    ui.prev.disabled = S.idx <= 0;
    ui.next.disabled = S.idx < 0 || S.idx >= S.list.length - 1;
    ui.count.textContent = S.idx >= 0 ? (S.idx + 1) + ' of ' + S.list.length : '';
    ui.open.setAttribute('href', location.origin + pl);
    ui.postPane.replaceChildren(
      el('h2', { text: titleHint || 'Loading...' }),
      el('div', { class: 'skel', style: 'width:60%' }), el('div', { class: 'skel', style: 'width:90%' }), el('div', { class: 'skel', style: 'width:75%' })
    );
    ui.cmPane.replaceChildren(el('div', { class: 'skel', style: 'width:40%' }), el('div', { class: 'skel' }), el('div', { class: 'skel', style: 'width:85%' }));
    ui.postPane.scrollTop = 0;
    ui.cmPane.scrollTop = 0;
    ui.panel.scrollTop = 0;
    loadPost(pl).then(function (d) {
      if (tok !== S.token) return;
      renderPost(d, pl);
    }).catch(function (e) {
      if (tok !== S.token) return;
      log('load failed:', e);
      renderError(e, pl, titleHint);
    });
  }

  function close() {
    if (!S.open) return;
    S.open = false;
    S.token++;
    host.style.display = 'none';
    document.documentElement.style.overflow = S.prevHtml;
    document.body.style.overflow = S.prevBody;
    var pl = S.list[S.idx];
    if (pl) {
      var card = document.querySelector('shreddit-feed shreddit-post[permalink="' + pl.replace(/"/g, '\\"') + '"]');
      if (card) card.scrollIntoView({ block: 'center' });
    }
    if (S.lastFocus && S.lastFocus.focus) { try { S.lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }

  function step(d) {
    var n = S.idx + d;
    if (S.idx < 0 || n < 0 || n >= S.list.length) return;
    S.idx = n;
    var pl = S.list[n];
    var card = document.querySelector('shreddit-feed shreddit-post[permalink="' + pl.replace(/"/g, '\\"') + '"]');
    show(pl, card && card.getAttribute('post-title'));
  }

  function copyLink() {
    var pl = S.list[S.idx];
    if (!pl) return;
    var url = location.origin + pl;
    if (!gm.copy(url) && navigator.clipboard) navigator.clipboard.writeText(url).catch(function () { /* ignore */ });
  }

  function avatar(sub) {
    var a = el('span', { class: 'av', text: (sub || '?').charAt(0).toUpperCase() });
    a.style.background = 'hsl(' + (hashStr(sub || '') % 360) + ' 45% 34%)';
    return a;
  }

  function dot() { return el('span', { text: '·' }); }

  function userLink(name) {
    if (!name || name === '[deleted]') return el('span', { text: '[deleted]' });
    return el('a', { class: 'u', href: '/user/' + encodeURIComponent(name) + '/', text: 'u/' + name });
  }

  function gate(node, label) {
    node.classList.add('blurred');
    var wrap = el('div', { class: 'gate' }, node);
    var btn = el('button', { class: 'reveal', type: 'button', text: label + ' - click to show' });
    btn.addEventListener('click', function () { node.classList.remove('blurred'); btn.remove(); });
    wrap.appendChild(btn);
    return wrap;
  }

  function previewUrl(p) {
    var im = p.preview && p.preview.images && p.preview.images[0];
    return im && im.source && im.source.url ? im.source.url : '';
  }

  function mediaGallery(p) {
    var items = ((p.gallery_data && p.gallery_data.items) || []).map(function (it) {
      var m = p.media_metadata && p.media_metadata[it.media_id];
      if (!m || m.status !== 'valid') return null;
      var s = m.s || {};
      return { src: s.u || s.gif || s.mp4 || '', cap: it.caption || '' };
    }).filter(function (x) { return x && x.src; });
    if (!items.length) return null;
    var i = 0;
    var img = el('img', { class: 'mimg', alt: '', referrerpolicy: 'no-referrer' });
    var cap = el('figcaption');
    function upd() {
      img.setAttribute('src', items[i].src);
      cap.textContent = 'Image ' + (i + 1) + ' of ' + items.length + (items[i].cap ? ' · ' + items[i].cap : '');
    }
    upd();
    var fig = el('figure', { class: 'media' }, img, cap);
    if (items.length > 1) {
      fig.appendChild(el('button', { class: 'gnav gp', type: 'button', 'aria-label': 'Previous image', onclick: function () { i = (i - 1 + items.length) % items.length; upd(); } }, svg(IC.left)));
      fig.appendChild(el('button', { class: 'gnav gn', type: 'button', 'aria-label': 'Next image', onclick: function () { i = (i + 1) % items.length; upd(); } }, svg(IC.right)));
    }
    return fig;
  }

  function mediaFor(p) {
    var out = [];
    var node = null;
    if (p.is_gallery) node = mediaGallery(p);
    else if (p.is_video && p.media && p.media.reddit_video && p.media.reddit_video.fallback_url) {
      var v = el('video', { class: 'mimg', controls: true, playsinline: true, loop: true, preload: 'metadata' });
      v.muted = true;
      var poster = previewUrl(p);
      if (poster) v.setAttribute('poster', poster);
      v.setAttribute('src', p.media.reddit_video.fallback_url);
      node = el('figure', { class: 'media' }, v);
      out.push(el('div', { class: 'note', text: 'This player has no sound. Use "Open on Reddit" in the top bar to hear it.' }));
    } else if (p.post_hint === 'image' && p.url) {
      node = el('figure', { class: 'media' }, el('img', { class: 'mimg', alt: '', src: p.url, referrerpolicy: 'no-referrer' }));
    } else if (!p.is_self && previewUrl(p) && /^(image|rich:video|hosted:video|link)$/.test(p.post_hint || '')) {
      node = el('figure', { class: 'media' }, el('img', { class: 'mimg', alt: '', src: previewUrl(p), referrerpolicy: 'no-referrer' }));
    }
    if (node) out.unshift((p.over_18 || p.spoiler) ? gate(node, p.over_18 ? 'NSFW' : 'Spoiler') : node);
    return out;
  }

  function externalCard(p) {
    if (p.is_self || !p.url) return null;
    var u = safeHref(p.url);
    if (!u) return null;
    var host2 = p.domain || '';
    if (/(^|\.)(reddit\.com|redd\.it)$/i.test(host2) || p.is_gallery || p.is_video || p.post_hint === 'image') return null;
    return el('a', { class: 'linkcard', href: u, target: '_blank', rel: 'noopener noreferrer' }, svg(IC.link), el('span', {}, el('b', { text: host2 }), el('br'), 'Opens in a new tab'));
  }

  function postBody(p) {
    var nodes = [];
    var src = p;
    var xp = p.crosspost_parent_list && p.crosspost_parent_list[0];
    if (xp) {
      var inner = el('div', { class: 'xp' },
        el('div', { class: 'meta' }, el('span', { text: 'Crossposted from' }), el('a', { class: 'u', href: '/r/' + xp.subreddit + '/', text: 'r/' + xp.subreddit }), dot(), userLink(xp.author)),
        el('b', { text: xp.title || '' }), mediaFor(xp), el('div', { class: 'body' }, htmlToNodes(xp.selftext_html)), externalCard(xp));
      nodes.push(inner);
    } else {
      nodes.push(mediaFor(src));
      if (src.selftext_html) nodes.push(el('div', { class: 'body' }, htmlToNodes(src.selftext_html)));
      nodes.push(externalCard(src));
    }
    return nodes;
  }

  function renderPost(d, pl) {
    var p = d.post;
    var link = location.origin + (p.permalink || pl);
    ui.open.setAttribute('href', link);
    var chips = [];
    if (p.link_flair_text) chips.push(el('span', { class: 'chip', text: p.link_flair_text }));
    if (p.over_18) chips.push(el('span', { class: 'chip nsfw', text: 'NSFW' }));
    if (p.spoiler) chips.push(el('span', { class: 'chip', text: 'Spoiler' }));
    if (p.stickied) chips.push(el('span', { class: 'chip', text: 'Pinned' }));
    ui.postPane.replaceChildren(
      el('div', { class: 'meta' }, avatar(p.subreddit),
        el('a', { class: 'u', href: '/r/' + p.subreddit + '/', text: 'r/' + p.subreddit }), dot(), userLink(p.author), dot(),
        el('span', { text: ago(p.created_utc) }),
        p.upvote_ratio != null ? [dot(), el('span', { text: Math.round(p.upvote_ratio * 100) + '% upvoted' })] : null),
      el('h2', { text: p.title || '' }),
      chips.length ? el('div', { class: 'chips' }, chips) : null,
      postBody(p),
      el('div', { class: 'acts' },
        el('span', { class: 'pill' }, svg(IC.up), fmt(p.score) + ' points'),
        el('span', { class: 'pill' }, svg(IC.comment), fmt(p.num_comments) + ' comments'))
    );
    var thread = el('div', { class: 'thread' });
    d.comments.forEach(function (c) { var n = commentNode(c, pl); if (n) thread.appendChild(n); });
    if (!d.comments.length) thread.appendChild(el('div', { class: 'note', text: 'No comments yet.' }));
    ui.cmPane.replaceChildren(
      el('div', { class: 'ch' }, el('h3', { text: fmt(p.num_comments) + ' comments' }), el('span', { text: 'Sorted by best. Read-only here.' })),
      el('a', { class: 'reply', href: link, target: '_blank', rel: 'noopener', text: 'Reply on Reddit' }),
      thread
    );
  }

  function renderError(e, pl, titleHint) {
    var link = location.origin + pl;
    ui.postPane.replaceChildren(
      el('h2', { text: titleHint || 'This post' }),
      el('div', { class: 'err' }, el('b', { text: 'Could not load this post here. ' }), String(e && e.message ? e.message : e),
        el('br'), el('a', { class: 'reply', href: link, target: '_blank', rel: 'noopener', text: 'Open it on Reddit instead' }))
    );
    ui.cmPane.replaceChildren();
  }

  function commentNode(c, pl) {
    if (!c) return null;
    if (c.kind === 'more') {
      var n = (c.data && c.data.count) || 0;
      return el('div', { class: 'more' }, el('a', { href: location.origin + pl + '/', target: '_blank', rel: 'noopener',
        text: n ? 'Load ' + n + ' more repl' + (n === 1 ? 'y' : 'ies') + ' on Reddit' : 'Continue this thread on Reddit' }));
    }
    if (c.kind !== 't1' || !c.data) return null;
    var d = c.data;
    var wrap = el('div', { class: 'cm' });
    var line = el('button', { class: 'line', type: 'button', 'aria-label': 'Collapse or expand this thread' });
    line.addEventListener('click', function () { wrap.classList.toggle('fold'); });
    var head = el('div', { class: 'chead' }, userLink(d.author),
      d.is_submitter ? el('span', { class: 'tag', text: 'OP' }) : null,
      d.distinguished === 'moderator' ? el('span', { class: 'tag mod', text: 'MOD' }) : null,
      d.stickied ? el('span', { class: 'tag', text: 'Pinned' }) : null,
      dot(), el('span', { text: ago(d.created_utc) }), dot(), el('span', { text: fmt(d.score) + ' points' }));
    var kids = el('div', { class: 'kids' });
    var replies = d.replies && d.replies.data && d.replies.data.children;
    if (replies) replies.forEach(function (r) { var k = commentNode(r, pl); if (k) kids.appendChild(k); });
    wrap.appendChild(line);
    wrap.appendChild(el('div', {}, head, el('div', { class: 'ctext' }, htmlToNodes(d.body_html)), kids));
    return wrap;
  }

  /* ------------------------------------------------------------------ */
  /* Opening a post from the feed                                       */
  /* ------------------------------------------------------------------ */

  var STOP_TAGS = { BUTTON: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1, 'RPL-DROPDOWN': 1, 'RPL-MENU': 1, 'SHREDDIT-PLAYER': 1,
    'SHREDDIT-POST-OVERFLOW-MENU': 1, 'SHREDDIT-JOIN-BUTTON': 1 };

  function wantsLightbox(path, card) {
    var own = pathOf(card.getAttribute('permalink'));
    for (var i = 0; i < path.length; i++) {
      var n = path[i];
      if (n === card) break;
      if (!n.tagName) continue;
      var t = n.tagName;
      var slot = n.getAttribute && n.getAttribute('slot');
      if (slot === 'post-media-container') return false;
      var label = ((n.getAttribute && (n.getAttribute('aria-label') || n.getAttribute('name'))) || '').toLowerCase();
      if (t === 'A') {
        var href = n.getAttribute('href') || '';
        if (slot === 'full-post-link' || slot === 'title') return true;
        var hp = pathOf(href);
        if (own && (hp === own || hp.indexOf(own + '/') === 0)) return true;
        if (/comment/.test(label)) return true;
        return false;
      }
      if (STOP_TAGS[t]) {
        return /comment/.test(label) || /comment/i.test((n.textContent || '').slice(0, 40));
      }
    }
    return true;
  }

  function onClick(e) {
    try {
      if (!cfg.lightbox || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      if (S.open) return;
      var path = e.composedPath ? e.composedPath() : [];
      var card = null;
      for (var i = 0; i < path.length; i++) { if (path[i].tagName === 'SHREDDIT-POST') { card = path[i]; break; } }
      if (!card || !card.closest('shreddit-feed') || !card.getAttribute('permalink')) return;
      if (!wantsLightbox(path, card)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      openFromCard(card);
    } catch (err) {
      log('click handler error:', err);
    }
  }

  function onKey(e) {
    if (!S.open || e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key;
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (k === 'ArrowRight' || k === 'j') { e.preventDefault(); e.stopPropagation(); step(1); }
    else if (k === 'ArrowLeft' || k === 'k') { e.preventDefault(); e.stopPropagation(); step(-1); }
    else if (k === 'Tab') {
      var f = Array.prototype.slice.call(root.querySelectorAll('button:not([disabled]),a[href]'));
      if (!f.length) return;
      var active = root.activeElement;
      if (e.shiftKey && (active === f[0] || active === ui.panel || !active)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && active === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Diagnostics (menu command, copies a short redacted report)          */
  /* ------------------------------------------------------------------ */

  function diag() {
    var o = [];
    var T = '[lightbox] ';
    function q(s) { return document.querySelectorAll(s).length; }
    function box(c) {
      var r = c.getBoundingClientRect();
      return c.tagName.toLowerCase() + (c.id ? '#' + c.id.slice(0, 24) : '') + ' ' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height);
    }
    o.push(T + 'v' + VERSION + ' layout=' + cfg.layout + ' lightbox=' + cfg.lightbox + ' viewport=' + innerWidth + 'x' + innerHeight + ' theme=' + themeNow());
    o.push(T + 'page=' + (location.pathname.length < 2 ? '/' : location.pathname.split('/')[1]));
    o.push(T + 'posts=' + q('shreddit-feed shreddit-post') + ' ads=' + q('shreddit-ad-post') + ' feeds=' + q('shreddit-feed') + ' fullPostLinks=' + q('shreddit-post a[slot="full-post-link"]'));
    var f = document.querySelector('shreddit-feed');
    if (f) {
      o.push(T + 'feed ancestors (feed to top):');
      var e = f, n = 0;
      while (e && e !== document.documentElement && n < 12) {
        var cs = getComputedStyle(e);
        o.push(T + '  ' + box(e) + ' display=' + cs.display + ' maxW=' + cs.maxWidth + ' cols=' + String(cs.gridTemplateColumns).slice(0, 60) + ' pos=' + cs.position);
        e = e.parentElement; n++;
      }
      ['.main-container', '.grid-container', '#subgrid-container'].forEach(function (sel) {
        var c = document.querySelector(sel);
        if (!c) { o.push(T + sel + ' not found'); return; }
        o.push(T + sel + ' children:');
        Array.prototype.slice.call(c.children, 0, 8).forEach(function (k) { o.push(T + '  ' + box(k)); });
      });
    }
    o.push(T + 'recent log:');
    LOG.slice(-15).forEach(function (x) { o.push(T + '  ' + x); });
    return o.join('\n');
  }

  /* ------------------------------------------------------------------ */
  /* Start                                                              */
  /* ------------------------------------------------------------------ */

  function init() {
    gm.menu('Layout: ' + (cfg.layout ? 'ON' : 'OFF') + ' (click to switch and reload)', function () { gm.set('layout', !cfg.layout); location.reload(); });
    gm.menu('Lightbox: ' + (cfg.lightbox ? 'ON' : 'OFF') + ' (click to switch and reload)', function () { gm.set('lightbox', !cfg.lightbox); location.reload(); });
    gm.menu('Copy diagnostics', function () {
      var t = diag();
      if (gm.copy(t)) console.log('[lightbox] diagnostics copied to the clipboard');
      else console.log(t);
    });
    if (cfg.layout) gm.style(LAYOUT_CSS);
    if (cfg.lightbox) {
      document.addEventListener('click', onClick, true);
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('popstate', function () { if (S.open) close(); });
    }
    log('started v' + VERSION, 'layout=' + cfg.layout, 'lightbox=' + cfg.lightbox);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ago: ago, fmt: fmt, pathOf: pathOf, safeHref: safeHref, hashStr: hashStr, wantsLightbox: wantsLightbox };
    return;
  }
  try { init(); } catch (err) { log('init failed:', err); }
})();
