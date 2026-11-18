// ==UserScript==
// @name         Reddit Lightbox Feed
// @namespace    https://github.com/PhadeDev/reddit-lightbox-feed
// @version      0.14.1
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
// @grant        GM_xmlhttpRequest
// @connect      fonts.googleapis.com
// @connect      fonts.gstatic.com
// @homepageURL  https://github.com/PhadeDev/reddit-lightbox-feed
// @supportURL   https://github.com/PhadeDev/reddit-lightbox-feed/issues
// @updateURL    https://raw.githubusercontent.com/PhadeDev/reddit-lightbox-feed/main/reddit-lightbox-feed.user.js
// @downloadURL  https://raw.githubusercontent.com/PhadeDev/reddit-lightbox-feed/main/reddit-lightbox-feed.user.js
// ==/UserScript==

(function () {
  'use strict';

  var VERSION = '0.14.1';

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

  function setKids(parent) {
    parent.replaceChildren();
    for (var i = 1; i < arguments.length; i++) append(parent, arguments[i]);
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
    up: 'M12 19V6M5 12l7-7 7 7',
    down: 'M12 5v13M5 12l7 7 7-7',
    menu: 'M4 6h16M4 12h16M4 18h16',
    save: 'M6 3h12v18l-6-4-6 4z',
    hide: 'M3 3l18 18M10.6 5.2A9.5 9.5 0 0 1 12 5c6 0 9.5 7 9.5 7a15 15 0 0 1-2.6 3.3M6.4 6.5C3.9 8.2 2.5 12 2.5 12S6 19 12 19a9 9 0 0 0 4-1M9.9 9.9a3 3 0 0 0 4.2 4.2',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    plus: 'M12 5v14M5 12h14',
    bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0',
    reply: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 6 6v3'
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
  /* Lexend: fetched once, kept in storage, added as a page font          */
  /* ------------------------------------------------------------------ */

  var FONTST = 'not started';

  function gmFetch(url, type) {
    return new Promise(function (resolve, reject) {
      if (typeof GM_xmlhttpRequest !== 'function') { reject(new Error('the userscript manager cannot make this request')); return; }
      GM_xmlhttpRequest({
        method: 'GET', url: url, responseType: type || 'text', timeout: 20000,
        onload: function (r) { if (r.status >= 200 && r.status < 300) resolve(r.response); else reject(new Error('HTTP ' + r.status)); },
        onerror: function () { reject(new Error('network error')); },
        ontimeout: function () { reject(new Error('timed out')); }
      });
    });
  }

  function bufToB64(buf) {
    var u = new Uint8Array(buf), out = '', i;
    for (i = 0; i < u.length; i += 0x8000) out += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(out);
  }

  function b64ToBuf(b) {
    var t = atob(b), u = new Uint8Array(t.length), i;
    for (i = 0; i < t.length; i++) u[i] = t.charCodeAt(i);
    return u.buffer;
  }

  function isWoff2(buf) {
    var u = new Uint8Array(buf);
    return u.length > 1000 && u[0] === 0x77 && u[1] === 0x4F && u[2] === 0x46 && u[3] === 0x32;
  }

  function loadLexend() {
    var cached = gm.get('lexendB64', '');
    var source = 'storage';
    var p;
    if (cached) p = Promise.resolve(b64ToBuf(cached));
    else {
      source = 'downloaded';
      p = gmFetch('https://fonts.googleapis.com/css2?family=Lexend:wght@100..900&display=swap').then(function (css) {
        var m = /\/\*\s*latin\s*\*\/\s*@font-face\s*\{[^}]*?url\((https:[^)]+)\)/.exec(String(css));
        if (!m) throw new Error('the font list had no Latin file');
        return gmFetch(m[1], 'arraybuffer');
      }).then(function (buf) {
        if (!isWoff2(buf)) throw new Error('the font file was not what was expected');
        try { gm.set('lexendB64', bufToB64(buf)); } catch (e) { /* not cached */ }
        return buf;
      });
    }
    FONTST = 'loading (' + source + ')';
    return p.then(function (buf) {
      if (typeof FontFace !== 'function' || !document.fonts) throw new Error('this browser cannot add fonts from a file');
      var face = new FontFace('LBX Lexend', buf, { weight: '100 900', style: 'normal' });
      return face.load();
    }).then(function (face) {
      document.fonts.add(face);
      FONTST = 'ready (' + source + ')';
      log('font: Lexend ready (' + source + ')');
    }).catch(function (err) {
      if (cached) { try { gm.set('lexendB64', ''); } catch (e) { /* ignore */ } }
      FONTST = 'failed: ' + String((err && err.message) || err);
      log('font: Lexend not loaded:', FONTST);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Settings and menu                                                  */
  /* ------------------------------------------------------------------ */

  var cfg = { layout: gm.get('layout', true), lightbox: gm.get('lightbox', true), cards: gm.get('cards', true), rail: gm.get('rail', true), extra: gm.get('extra', false), homeSort: gm.get('homeSort', 'hot'), notifs: gm.get('notifs', true), font: gm.get('font', true) };

  /* Lexend: downloaded once from Google Fonts (an open font), kept in this
     script's own storage and added to the page. A copy installed on this PC is
     tried too, and if neither is there the normal fonts are used. */
  var SYS_FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
  var FONT_STACK = cfg.font ? "'LBX Lexend','Lexend Medium','Lexend'," + SYS_FONT : SYS_FONT;
  var FONT_CSS = [
    'html.lbx-font,html.lbx-font body,html.lbx-font *{font-family:' + FONT_STACK + ' !important}',
    'html.lbx-font code,html.lbx-font pre,html.lbx-font kbd,html.lbx-font samp{font-family:ui-monospace,Menlo,Consolas,monospace !important}'
  ].join('\n');

  /* ------------------------------------------------------------------ */
  /* Layout (CSS only, scoped to pages that contain a feed)             */
  /* ------------------------------------------------------------------ */

  /* Fallback: used when our own cards are off or unavailable. Reddit's own cards, in a grid. */
  var LAYOUT_FALLBACK = [
    'html:not(.lbx-own) body:has(shreddit-feed) #right-sidebar-container { display: none !important; }',
    'html:not(.lbx-own) #subgrid-container:has(shreddit-feed) { max-width: none !important; width: 100% !important; }',
    'html:not(.lbx-own) .main-container:has(shreddit-feed) { display: block !important; max-width: none !important; width: 100% !important; }',
    'html:not(.lbx-own) main#main-content:has(shreddit-feed) { max-width: none !important; width: 100% !important; }',
    'html:not(.lbx-own) shreddit-feed { display: grid !important; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 12px; align-items: start; }',
    'html:not(.lbx-own) shreddit-feed > *:not(article) { grid-column: 1 / -1; }',
    'html:not(.lbx-own) shreddit-feed > hr { display: none !important; }',
    'html:not(.lbx-own) shreddit-feed > article { width: 100% !important; min-width: 0; margin: 0 !important; }',
    'html:not(.lbx-own) shreddit-feed shreddit-post > [slot="post-media-container"] { max-height: 340px; overflow: hidden; }'
  ].join('\n');

  /* Own-card mode: Reddit keeps loading posts invisibly (the load-after placeholder stays on screen), we draw the cards. */
  var LAYOUT_OWN = [
    'shreddit-ad-post, article:has(shreddit-ad-post), shreddit-sidebar-ad { display: none !important; }',
    'html.lbx-wait shreddit-feed { visibility: hidden; }',
    'html.lbx-own body:has(shreddit-feed) #right-sidebar-container { display: none !important; }',
    'html.lbx-own body:has(shreddit-feed) community-highlight-carousel { display: none !important; }',
    'html.lbx-own body:has(shreddit-feed) shreddit-layout-event-setter { display: none !important; }',
    'html.lbx-own #subgrid-container:has(shreddit-feed) { max-width: none !important; width: 100% !important; }',
    'html.lbx-own #subgrid-container:has(shreddit-feed) > .main-container { flex: 1 1 auto; min-width: 0; }',
    'html.lbx-own .main-container:has(shreddit-feed) { display: block !important; max-width: none !important; width: 100% !important; }',
    'html.lbx-own main#main-content:has(shreddit-feed) { max-width: none !important; width: 100% !important; }',
    'html.lbx-own shreddit-feed { display: block !important; }',
    'html.lbx-own shreddit-feed > *:not(faceplate-partial[slot="load-after"]) { display: none !important; }',
    'html.lbx-own shreddit-feed > faceplate-partial[slot="load-after"] { display: block !important; min-height: 4px; }',
    'html.lbx-own.lbx-sorts shreddit-sort-dropdown { display: none !important; }',
    'html.lbx-own.lbx-comm create-post-entry-point-wrapper, html.lbx-own.lbx-comm shreddit-subreddit-header-buttons { display: none !important; }',
    'html.lbx-own.lbx-comm #subreddit-banner-img { -webkit-mask-image: linear-gradient(to bottom, #000 30%, rgba(0,0,0,0) 100%); mask-image: linear-gradient(to bottom, #000 30%, rgba(0,0,0,0) 100%); border-radius: 0 !important; }',
    'html.lbx-own.lbx-sugg div:has(> shreddit-feed) { display: flex !important; flex-direction: column; }',
    'html.lbx-own.lbx-sugg shreddit-feed { display: contents !important; }',
    'html.lbx-own.lbx-sugg #lbx-feed-host { order: 1; }',
    'html.lbx-own.lbx-sugg shreddit-feed > in-feed-community-recommendations { display: block !important; order: 0; margin-bottom: 12px; }',
    'html.lbx-own.lbx-sugg shreddit-feed > faceplate-partial[slot="load-after"] { order: 2; }',
    '@media (min-width: 900px) {',
    '  html.lbx-rail div:has(> #left-sidebar-container) { grid-template-columns: var(--lbx-rail-w, 64px) minmax(0, 1fr) !important; }',
    '  html.lbx-rail #flex-left-nav-container { display: none !important; }',
    '  html.lbx-rail #left-sidebar-container { width: var(--lbx-rail-w, 64px) !important; }',
    '}'
  ].join('\n');

  var LAYOUT_CSS = LAYOUT_FALLBACK + '\n' + LAYOUT_OWN;

  /* ------------------------------------------------------------------ */
  /* Lightbox styles (inside a shadow root, so Reddit CSS cannot leak in) */
  /* ------------------------------------------------------------------ */

  var HC_CSS = [
    '.hcard{position:fixed;z-index:60;width:292px;background:var(--surface);color:var(--fg);border:1px solid var(--line);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.45);padding:14px;font:13px/1.45 ' + FONT_STACK + '}',
    '.hcard .hh{display:flex;gap:12px;align-items:center}',
    '.hcard .hav{width:52px;height:52px;border-radius:50%;flex:none;display:grid;place-items:center;font-weight:700;font-size:20px;color:#fff;overflow:hidden;background:var(--accent-bg)}',
    '.hcard .hav img{width:100%;height:100%;object-fit:cover;display:block}',
    '.hcard .hn{font-weight:700;font-size:15px;overflow-wrap:anywhere}',
    '.hcard .hs{color:var(--muted);font-size:12px}',
    '.hcard .ha{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}',
    '.hcard .hb{flex:1 1 auto;text-align:center;padding:7px 12px;border-radius:99px;border:1px solid var(--line);color:var(--fg);text-decoration:none;font-weight:600;font-size:13px}',
    '.hcard .hb:hover{border-color:var(--accent)}',
    '.hcard .hb.pri{background:var(--accent-bg)}',
    '.hcard .hm{margin-top:10px;color:var(--muted);font-size:12px}',
    '.hcard .er2{color:#ff9a9a}',
    '.hcard .hbio{margin:10px 0 0;font-size:13px;overflow-wrap:anywhere}',
    '.hcard .hstats{display:flex;gap:22px;margin-top:10px}',
    '.hcard .hst{display:flex;flex-direction:column}',
    '.hcard .hst b{font-size:15px}',
    '.hcard .hst span{color:var(--muted);font-size:12px}',
    '.hcard .hb.fol{background:var(--accent-bg);cursor:pointer}',
    '.hcard .hb.fol.on{background:transparent}'
  ].join('\n');

  var LB_CSS = [
    ':host{all:initial;--surface:#1a1418;--surface2:#251c22;--line:#35293a;--fg:#f2ecf0;--muted:#a99ba3;--accent:#e0a3c8;--accent-bg:#532A45;--up:#3fb950;--down:#f85149;--gold:#F6A800;--scrim:rgba(8,5,8,.72);font:14px/1.5 ' + FONT_STACK + ';color:var(--fg)}',
    ':host([data-theme="light"]){--surface:#fff;--surface2:#F0ECF0;--line:#D0C4CC;--fg:#1f1519;--muted:#5f525a;--accent:#532A45;--accent-bg:#ead9e3;--up:#1a8f3c;--down:#c62828;--scrim:rgba(30,15,25,.55)}',
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
    '.acts.stick{position:sticky;top:-20px;z-index:4;margin:0 -22px;padding:8px 22px;background:var(--surface);border-top:0;border-bottom:1px solid var(--line)}',
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
    'img.mimg[role="button"]{cursor:zoom-in}',
    '.zoom{display:none;position:absolute;inset:0;z-index:20;background:rgba(0,0,0,.94);align-items:center;justify-content:center;overflow:auto}',
    '.zoom.on{display:flex}',
    '.zoom img{max-width:100%;max-height:100%;object-fit:contain;cursor:zoom-in;display:block}',
    '.zoom.full.on{display:block}',
    '.zoom.full img{max-width:none;max-height:none;margin:0 auto;cursor:zoom-out}',
    '.zx{position:fixed;top:12px;right:12px;z-index:21;background:rgba(0,0,0,.6);color:#fff}',
    '.zh{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:21;background:rgba(0,0,0,.65);color:#fff;font-size:12px;padding:3px 12px;border-radius:99px;max-width:calc(100vw - 32px);text-align:center}',
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
    '.vgrp{padding:0 2px;gap:0}',
    '.pb{width:30px;height:26px;border-radius:99px;display:grid;place-items:center;color:var(--muted)}',
    '.pb:hover{color:var(--fg)}',
    '.pb.on.up,.psc.up{color:var(--up)}',
    '.pb.on.dn,.psc.dn{color:var(--down)}',
    '.psc{min-width:30px;text-align:center;font-weight:600;font-variant-numeric:tabular-nums}',
    '.pbtn{cursor:pointer;color:var(--muted)}',
    '.pbtn:hover{color:var(--fg)}',
    '.pbtn.sv.on{color:var(--gold)}',
    '.pbtn.sv.on .ic{fill:currentColor}',
    '.ch{display:flex;align-items:baseline;justify-content:space-between;margin:0 0 8px;gap:8px;flex-wrap:wrap}',
    '.ch h3{margin:0;font-size:15px;font-weight:600}',
    '.ch span{font-size:12px;color:var(--muted)}',
    '.reply{display:inline-block;margin-bottom:6px;color:var(--accent);font-weight:600;font-size:13px}',
    '.cm{display:grid;grid-template-columns:16px minmax(0,1fr);gap:6px;margin-top:12px}',
    '.line{position:relative;width:16px;border-radius:4px}',
    '.line::after{content:"";position:absolute;left:6px;top:6px;bottom:0;width:3px;background:var(--line);border-radius:3px}',
    '.line:hover::after{filter:brightness(1.5)}',
    '.cm.d0>.line::after{background:#5b9cff}',
    '.cm.d1>.line::after{background:#ff6b6b}',
    '.cm.d2>.line::after{background:#4fd18b}',
    '.cm.d3>.line::after{background:#F6A800}',
    '.cm.d4>.line::after{background:#b07cff}',
    '.cm.d5>.line::after{background:#ff9f43}',
    '.cm.fold .line::after{display:none}',
    '.cact{display:flex;gap:2px;align-items:center;flex-wrap:wrap;margin-top:4px}',
    '.cb{height:26px;min-width:26px;padding:0 8px;border-radius:99px;display:inline-flex;align-items:center;justify-content:center;gap:4px;color:var(--muted);font-size:12px;font-weight:500}',
    '.cb:hover{background:var(--surface2);color:var(--fg)}',
    '.cb .ic{width:14px;height:14px}',
    '.cb.on.up{color:var(--up)}.cb.on.dn{color:var(--down)}.cb.on.sv{color:var(--accent)}',
    '.pts{min-width:22px;text-align:center;font-size:12px;font-weight:600;color:var(--muted);font-variant-numeric:tabular-nums}',
    '.er{color:#ff9a9a;font-size:12px}',
    '.cmp{margin:8px 0;display:flex;flex-direction:column;gap:6px}',
    '.cmp textarea{width:100%;min-height:84px;resize:vertical;background:var(--surface2);color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit}',
    '.cmp .row{display:flex;gap:8px;align-items:center}',
    '.cnote{margin:6px 0;padding:6px 12px;border-radius:8px;font-size:13px}',
    '.cnote.ok{background:rgba(63,185,80,.16);color:var(--up)}',
    '.cnote.bad{background:rgba(248,81,73,.16);color:var(--down)}',
    '@keyframes lbxfresh{from{background:rgba(246,168,0,.28)}to{background:rgba(246,168,0,0)}}',
    '.fresh{animation:lbxfresh 2.6s ease-out;border-radius:8px}',
    '.hint2{margin-left:auto;font-size:11px;color:var(--muted)}',
    '.go{padding:5px 14px;border-radius:99px;background:var(--accent-bg);color:var(--fg);font-weight:600;font-size:13px}',
    '.go:disabled{opacity:.5;cursor:default}',
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
    '@media (max-width:859px){.panel{grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto auto;overflow:auto;align-content:start;width:100%;height:100%;border-radius:0;border:0}.head{position:sticky;top:0;z-index:2;background:var(--surface)}.pane{overflow:visible;padding:16px}.post{border-right:0;border-bottom:1px solid var(--line)}.hint{display:none}h2{font-size:21px}.acts.stick{top:49px;margin:0 -16px;padding:8px 16px}}',
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
      sheet.replaceSync(LB_CSS + '\n' + HC_CSS);
      root.adoptedStyleSheets = [sheet];
    } catch (e) {
      var st = document.createElement('style');
      st.textContent = LB_CSS + '\n' + HC_CSS;
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
    ui.hover = hoverAttach(root);
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
    closeZoom();
    ui.prev.disabled = S.idx <= 0;
    ui.next.disabled = S.idx < 0 || S.idx >= S.list.length - 1;
    ui.count.textContent = S.idx >= 0 ? (S.idx + 1) + ' of ' + S.list.length : '';
    ui.open.setAttribute('href', location.origin + pl);
    setKids(ui.postPane,
      el('h2', { text: titleHint || 'Loading...' }),
      el('div', { class: 'skel', style: 'width:60%' }), el('div', { class: 'skel', style: 'width:90%' }), el('div', { class: 'skel', style: 'width:75%' })
    );
    setKids(ui.cmPane,el('div', { class: 'skel', style: 'width:40%' }), el('div', { class: 'skel' }), el('div', { class: 'skel', style: 'width:85%' }));
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
    closeZoom();
    if (ui.hover) ui.hover.hide();
    S.open = false;
    S.token++;
    host.style.display = 'none';
    document.documentElement.style.overflow = S.prevHtml;
    document.body.style.overflow = S.prevBody;
    var pl = S.list[S.idx];
    if (pl) {
      var card = cardForPl(pl);
      if (card && card.scrollIntoView) card.scrollIntoView({ block: 'center' });
    }
    if (S.lastFocus && S.lastFocus.focus) { try { S.lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }

  function step(d) {
    var n = S.idx + d;
    if (S.idx < 0 || n < 0 || n >= S.list.length) return;
    S.idx = n;
    var pl = S.list[n];
    show(pl, titleForPl(pl));
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
    return el('a', { class: 'u usr', 'data-user': name, href: '/user/' + encodeURIComponent(name) + '/', text: 'u/' + name });
  }

  /* ------------------------------------------------------------------ */
  /* User hover card: details from /user/NAME/about.json, Start chat is  */
  /* a plain link to Reddit's chat, Follow stays on Reddit's own page.   */
  /* ------------------------------------------------------------------ */

  var HC = { data: {}, fol: {}, showT: 0, hideT: 0, cur: '', chat: 'not used yet' };

  /* Start chat: the same call Reddit's own chat link component makes (read from
     its code): the chat panel's openChatUrl with a path like /user/NAME. */
  function openChatFor(e, path, fullUrl) {
    if (e.button > 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    var host = document.querySelector('reddit-chat-host');
    if (!host || typeof host.openChatUrl !== 'function') {
      HC.chat = 'chat panel not found, link left to open normally';
      log('chat: ' + HC.chat);
      return;
    }
    if (e.preventDefault) e.preventDefault();
    try {
      var wasStarted = !!host.hasChatClientActivated;
      host.openChatUrl(path);
      HC.chat = 'called the chat panel with ' + String(path).replace(/^\/user\/.*/, '/user/<name>') + (wasStarted ? ' (panel already started)' : ' (panel was not started yet, will call again once it is)');
      log('chat: ' + HC.chat);
      /* A panel that has not started yet only remembers the address, and its
         auto-open invite wins at start-up. Once it is running the same call
         navigates properly, so call again then. */
      if (!wasStarted) {
        var tries = 0;
        var iv = setInterval(function () {
          var ready = false;
          try {
            var sr = host.getShadowRoot ? host.getShadowRoot() : null;
            ready = !!(host.hasChatClientActivated && sr && sr.querySelector('rs-history'));
          } catch (x) { ready = false; }
          if (ready || ++tries > 30) {
            clearInterval(iv);
            if (ready) {
              try { host.openChatUrl(path); HC.chat += ' | called again after the panel started'; log('chat: called the chat panel again after it started'); } catch (x2) { log('chat: second call failed:', x2); }
            } else { HC.chat += ' | the panel never reported that it had started'; log('chat: the panel did not report starting'); }
          }
        }, 200);
      }
      if (e.detail === 0 && host.updateComplete && host.updateComplete.then) {
        host.updateComplete.then(function () { try { if (host.setFocusOnChatWidget) host.setFocusOnChatWidget(); } catch (x) { /* ignore */ } });
      }
    } catch (er) {
      HC.chat = 'the chat panel refused, opened the chat page in a new tab';
      log('chat: the chat panel refused:', er);
      window.open(fullUrl, '_blank', 'noopener');
    }
  }

  function userAbout(name) {
    var k = String(name).toLowerCase();
    if (!HC.data[k]) {
      HC.data[k] = fetch('/user/' + encodeURIComponent(name) + '/about.json?raw_json=1', { credentials: 'same-origin' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (j) { return (j && j.data) || {}; });
      HC.data[k].catch(function () { delete HC.data[k]; });
    }
    return HC.data[k];
  }

  function redditorFor(utc) {
    var days = Math.max(0, Math.floor((Date.now() / 1000 - utc) / 86400));
    var y = Math.floor(days / 365), m = Math.floor(days / 30);
    if (y >= 1) return y + (y === 1 ? ' year' : ' years');
    if (m >= 1) return m + (m === 1 ? ' month' : ' months');
    return days + (days === 1 ? ' day' : ' days');
  }

  function hoverAttach(rootNode) {
    var pop = el('div', { class: 'hcard', role: 'dialog', 'aria-label': 'User details' });
    pop.style.display = 'none';
    rootNode.appendChild(pop);

    function hideNow() { clearTimeout(HC.showT); pop.style.display = 'none'; HC.cur = ''; }
    function hide() { clearTimeout(HC.showT); clearTimeout(HC.hideT); HC.hideT = setTimeout(hideNow, 220); }
    function keep() { clearTimeout(HC.hideT); }
    function anchorOf(t) { return t && t.closest ? t.closest('a.usr') : null; }
    function inPop(t) { return !!(t && t.closest && t.closest('.hcard')); }

    function place(a) {
      var r = a.getBoundingClientRect ? a.getBoundingClientRect() : { left: 8, top: 8, bottom: 8 };
      pop.style.display = 'block';
      var h = pop.offsetHeight || 170;
      var vw = window.innerWidth || 1200, vh = window.innerHeight || 800;
      var left = Math.max(8, Math.min(r.left, vw - 292 - 8));
      var top = r.bottom + 6;
      if (top + h > vh - 8) top = Math.max(8, r.top - h - 6);
      pop.style.left = Math.round(left) + 'px';
      pop.style.top = Math.round(top) + 'px';
    }

    function stat(n, label) {
      return el('div', { class: 'hst' }, el('b', { text: Number(n || 0).toLocaleString('en-GB') }), el('span', { text: label }));
    }

    function render(a, name, d, note) {
      var enc = encodeURIComponent(name);
      var sr = d && d.subreddit ? d.subreddit : null;
      var adult = !!(sr && sr.over_18);
      var av = el('span', { class: 'hav', text: name.charAt(0).toUpperCase() });
      av.style.background = 'hsl(' + (hashStr(name) % 360) + ' 45% 34%)';
      var img = d && !adult ? (d.snoovatar_img || d.icon_img || '') : '';
      if (/^https:\/\//i.test(img)) {
        var im = el('img', { src: img, alt: '', referrerpolicy: 'no-referrer' });
        im.addEventListener('error', function () { if (im.remove) im.remove(); });
        av.appendChild(im);
      }
      var sub = note || '';
      if (d && !note) {
        if (d.is_suspended) sub = 'This account is suspended.';
        else if (d.created_utc) sub = 'Joined ' + new Date(d.created_utc * 1000).toLocaleDateString('en-GB') + ' · Redditor for ' + redditorFor(d.created_utc);
      }
      var kids = [el('div', { class: 'hh' }, av, el('div', {}, el('div', { class: 'hn', text: 'u/' + name }), el('div', { class: 'hs', text: sub })))];
      if (d && !note && !d.is_suspended) {
        if (adult) kids.push(el('div', { class: 'hm', text: '18+ profile: the picture and bio are hidden here.' }));
        else if (sr && sr.public_description) kids.push(el('p', { class: 'hbio', text: String(sr.public_description).slice(0, 300) }));
        kids.push(el('div', { class: 'hstats' }, stat(d.link_karma, 'Post karma'), stat(d.comment_karma, 'Comment karma')));
      }
      var actions = [];
      var msg = el('div', { class: 'hm er2' });
      msg.style.display = 'none';
      if (!d || !d.is_suspended) {
        if (d && sr && sr.display_name && d.accept_followers !== false) {
          var isF = function () { return HC.fol[name] !== undefined ? HC.fol[name] : !!sr.user_is_subscriber; };
          var fb = el('button', { class: 'hb fol', type: 'button' });
          var paintF = function () { var on = isF(); fb.textContent = on ? 'Following' : 'Follow'; fb.className = 'hb fol' + (on ? ' on' : ''); fb.setAttribute('aria-pressed', String(on)); };
          paintF();
          fb.addEventListener('click', function () {
            var prev = isF();
            HC.fol[name] = !prev;
            paintF();
            msg.style.display = 'none';
            postApi('/api/subscribe', { action: prev ? 'unsub' : 'sub', sr_name: sr.display_name, skip_initial_defaults: 'true' }).catch(function (e) {
              HC.fol[name] = prev;
              paintF();
              msg.textContent = (prev ? 'Unfollowing' : 'Following') + ' did not work: ' + String((e && e.message) || e);
              msg.style.display = '';
            });
          });
          actions.push(fb);
        }
        var chatUrl = 'https://chat.reddit.com/user/' + enc;
        var chatA = el('a', { class: 'hb pri', href: chatUrl, target: '_blank', rel: 'noopener noreferrer', 'data-testid': 'private-chat-button', text: 'Start chat' });
        chatA.addEventListener('click', function (e) { openChatFor(e, '/user/' + enc, chatUrl); });
        var chatNode = chatA;
        actions.push(chatNode);
        actions.push(el('a', { class: 'hb', href: '/user/' + enc + '/', text: 'View profile' }));
      }
      kids.push(el('div', { class: 'ha' }, actions));
      kids.push(msg);
      setKids(pop, kids);
      place(a);
    }

    function show(a) {
      var name = a.getAttribute('data-user');
      if (!name) return;
      HC.cur = name;
      keep();
      render(a, name, null, 'Loading...');
      userAbout(name).then(function (d) { if (HC.cur === name) render(a, name, d); },
        function () { if (HC.cur === name) render(a, name, null, 'Details are not available.'); });
    }

    rootNode.addEventListener('mouseover', function (e) {
      if (inPop(e.target)) { keep(); return; }
      var a = anchorOf(e.target);
      if (!a) return;
      keep();
      clearTimeout(HC.showT);
      HC.showT = setTimeout(function () { show(a); }, 350);
    });
    rootNode.addEventListener('mouseout', function (e) { if (anchorOf(e.target) || inPop(e.target)) hide(); });
    rootNode.addEventListener('focusin', function (e) {
      if (inPop(e.target)) { keep(); return; }
      var a = anchorOf(e.target);
      if (a) show(a);
    });
    rootNode.addEventListener('focusout', function (e) { if (anchorOf(e.target) || inPop(e.target)) hide(); });
    return { hide: hideNow, pop: pop };
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

  function openZoom(src) {
    if (!ui.zoom) {
      ui.zimg = el('img', { alt: '', referrerpolicy: 'no-referrer' });
      ui.zx = el('button', { class: 'ib zx', type: 'button', 'aria-label': 'Close image', onclick: function () { closeZoom(); } }, svg(IC.x));
      ui.zoom = el('div', { class: 'zoom', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Full-size image' }, ui.zx,
        el('span', { class: 'zh', text: 'Click the image to switch between fit and full size. Esc to close.' }), ui.zimg);
      ui.zimg.addEventListener('click', function (e) { e.stopPropagation(); ui.zoom.classList.toggle('full'); });
      ui.zoom.addEventListener('click', function (e) { if (e.target === ui.zoom) closeZoom(); });
      root.appendChild(ui.zoom);
    }
    ui.zimg.setAttribute('src', src);
    ui.zoom.classList.remove('full');
    ui.zoom.classList.add('on');
    ui.zx.focus();
  }

  function zoomOpen() { return !!(ui.zoom && ui.zoom.classList.contains('on')); }

  function closeZoom() {
    if (!zoomOpen()) return;
    ui.zoom.classList.remove('on', 'full');
    if (ui.panel && ui.panel.focus) ui.panel.focus({ preventScroll: true });
  }

  function zoomable(img, getSrc) {
    img.setAttribute('tabindex', '0');
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', 'Enlarge image');
    img.setAttribute('title', 'Click to enlarge');
    var go = function () {
      var fig = img.parentNode;
      if (fig && fig.classList && fig.classList.contains('blurred')) return;
      var u = getSrc();
      if (u) openZoom(u);
    };
    img.addEventListener('click', go);
    img.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    return img;
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
    zoomable(img, function () { return items[i].src; });
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
      node = el('figure', { class: 'media' }, zoomable(el('img', { class: 'mimg', alt: '', src: p.url, referrerpolicy: 'no-referrer' }), function () { return p.url; }));
    } else if (!p.is_self && previewUrl(p) && /^(image|rich:video|hosted:video|link)$/.test(p.post_hint || '')) {
      node = el('figure', { class: 'media' }, zoomable(el('img', { class: 'mimg', alt: '', src: previewUrl(p), referrerpolicy: 'no-referrer' }), function () { return previewUrl(p); }));
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

  function postActions(p, pl) {
    var id = p.name;
    var v0 = p.likes === true ? 1 : (p.likes === false ? -1 : 0);
    function curV() { return own.votes[id] !== undefined ? own.votes[id] : v0; }
    function curS() { return own.saved[id] !== undefined ? !!own.saved[id] : !!p.saved; }
    var upB = el('button', { class: 'pb up', type: 'button', 'aria-label': 'Upvote' }, svg(IC.up));
    var sc = el('span', { class: 'psc' });
    var dnB = el('button', { class: 'pb dn', type: 'button', 'aria-label': 'Downvote' }, svg(IC.down));
    var svL = el('span', { text: 'Save' });
    var svB = el('button', { class: 'pill pbtn sv', type: 'button' }, svg(IC.save), svL);
    var cpB = el('button', { class: 'pill pbtn', type: 'button' }, svg(IC.share), el('span', { text: 'Copy link' }));
    var hdB = el('button', { class: 'pill pbtn', type: 'button' }, svg(IC.hide), el('span', { text: 'Hide' }));
    var msg = el('span', { class: 'er' });
    msg.style.display = 'none';
    var msgT = 0;
    function say(t) {
      msg.textContent = t;
      msg.style.display = '';
      clearTimeout(msgT);
      msgT = setTimeout(function () { msg.style.display = 'none'; }, 4500);
    }
    function why(e) { return String((e && e.message) || e); }
    function paint() {
      var v = curV();
      upB.className = 'pb up' + (v > 0 ? ' on' : '');
      dnB.className = 'pb dn' + (v < 0 ? ' on' : '');
      upB.setAttribute('aria-pressed', String(v > 0));
      dnB.setAttribute('aria-pressed', String(v < 0));
      sc.className = 'psc' + (v > 0 ? ' up' : (v < 0 ? ' dn' : ''));
      sc.textContent = fmt((p.score || 0) + (v - v0));
      var sv = curS();
      svB.className = 'pill pbtn sv' + (sv ? ' on' : '');
      svB.setAttribute('aria-pressed', String(sv));
      svL.textContent = sv ? 'Saved' : 'Save';
    }
    function cast(want) {
      var prev = curV();
      var next = prev === want ? 0 : want;
      applyVote(id, next);
      paint();
      postApi('/api/vote', { id: id, dir: String(next) }).catch(function (e) { applyVote(id, prev); paint(); say('Voting did not work: ' + why(e)); });
    }
    upB.addEventListener('click', function () { cast(1); });
    dnB.addEventListener('click', function () { cast(-1); });
    svB.addEventListener('click', function () {
      var prev = curS();
      applySaved(id, !prev);
      paint();
      postApi(prev ? '/api/unsave' : '/api/save', { id: id }).catch(function (e) { applySaved(id, prev); paint(); say('Saving did not work: ' + why(e)); });
    });
    cpB.addEventListener('click', function () {
      var url = location.origin + (p.permalink || pl);
      if (!gm.copy(url) && navigator.clipboard) navigator.clipboard.writeText(url).catch(function () { /* ignore */ });
      say('Link copied');
    });
    hdB.addEventListener('click', function () {
      own.hid[id] = true;
      paintCard(id);
      postApi('/api/hide', { id: id }).then(function () {
        if (S.idx >= 0 && S.idx < S.list.length - 1) step(1); else close();
      }, function (e) { own.hid[id] = false; paintCard(id); say('Hiding did not work: ' + why(e)); });
    });
    paint();
    return el('div', { class: 'acts stick' }, el('span', { class: 'pill vgrp' }, upB, sc, dnB), svB, cpB, hdB, msg);
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
    setKids(ui.postPane,
      el('div', { class: 'meta' }, avatar(p.subreddit),
        el('a', { class: 'u', href: '/r/' + p.subreddit + '/', text: 'r/' + p.subreddit }), dot(), userLink(p.author), dot(),
        el('span', { text: ago(p.created_utc) }),
        p.upvote_ratio != null ? [dot(), el('span', { text: Math.round(p.upvote_ratio * 100) + '% upvoted' })] : null),
      el('h2', { text: p.title || '' }),
      chips.length ? el('div', { class: 'chips' }, chips) : null,
      postActions(p, pl),
      postBody(p)
    );
    var thread = el('div', { class: 'thread' });
    d.comments.forEach(function (c) { var n = commentNode(c, pl); if (n) thread.appendChild(n); });
    var noneNote = null;
    if (!d.comments.length) { noneNote = el('div', { class: 'note', text: 'No comments yet.' }); thread.appendChild(noneNote); }
    var topSlot = el('div', { class: 'cslot' });
    var addB = (p.archived || p.locked || !p.name) ? el('div', { class: 'note', text: 'Comments are closed on this post.' }) : el('button', { class: 'go', type: 'button', text: 'Add a comment' });
    var topC = null;
    if (addB.tagName === 'BUTTON') addB.addEventListener('click', function () {
      if (topC && topC.box.parentNode) { topC.ta.focus(); return; }
      topC = composer(p.name, pl, function (nd) {
        var n = commentNode({ kind: 't1', data: nd }, pl);
        if (noneNote && noneNote.parentNode) noneNote.parentNode.removeChild(noneNote);
        if (n) prepend(thread, n);
        return n;
      }, 'Add a comment');
      topSlot.appendChild(topC.box);
      topC.ta.focus();
    });
    ui.curPost = p;
    ui.chead = el('h3', { text: fmt(p.num_comments) + ' comments' });
    ui.notice = el('div', { class: 'cnote', role: 'status' });
    ui.notice.style.display = 'none';
    setKids(ui.cmPane,
      el('div', { class: 'ch' }, ui.chead, el('span', { text: 'Sorted by best.' })),
      ui.notice,
      addB,
      topSlot,
      thread
    );
  }

  function renderError(e, pl, titleHint) {
    var link = location.origin + pl;
    setKids(ui.postPane,
      el('h2', { text: titleHint || 'This post' }),
      el('div', { class: 'err' }, el('b', { text: 'Could not load this post here. ' }), String(e && e.message ? e.message : e),
        el('br'), el('a', { class: 'reply', href: link, target: '_blank', rel: 'noopener', text: 'Open it on Reddit instead' }))
    );
    setKids(ui.cmPane);
  }

  /* ------------------------------------------------------------------ */
  /* Account actions (hide, save, vote, reply). These use Reddit's own   */
  /* long-standing /api/ endpoints with your logged-in session. Nothing  */
  /* is assumed to have worked: failures are shown and undone.           */
  /* ------------------------------------------------------------------ */

  var ACT = { uh: '', uhP: null, last: 'none yet' };

  var ME = { p: null };

  function getMe() {
    if (!ME.p) {
      ME.p = fetch('/api/me.json', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) {
        var d = (j && j.data) || {};
        if (!d.name) ME.p = null;
        return d;
      });
      ME.p.catch(function () { ME.p = null; });
    }
    return ME.p;
  }

  function modhash() {
    if (ACT.uh) return Promise.resolve(ACT.uh);
    if (!ACT.uhP) {
      ACT.uhP = getMe().then(function (d) {
        if (!d.modhash) throw new Error('you do not seem to be signed in here');
        ACT.uh = d.modhash;
        return d.modhash;
      });
      ACT.uhP.catch(function () { ACT.uhP = null; });
    }
    return ACT.uhP;
  }

  function postApi(path, fields, method) {
    var label = path.replace('/api/', '');
    function once() {
      return modhash().then(function (uh) {
        var body = new URLSearchParams();
        Object.keys(fields).forEach(function (k) { body.set(k, fields[k]); });
        body.set('uh', uh);
        body.set('api_type', 'json');
        return fetch(path, { method: method || 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Modhash': uh }, body: body.toString() });
      }).then(function (r) {
        if (!r.ok) {
          var err = new Error(r.status === 429 ? 'Reddit says slow down (HTTP 429). Wait a few seconds and try again.' : 'Reddit answered HTTP ' + r.status);
          err.status = r.status;
          throw err;
        }
        return r.text();
      });
    }
    return once().catch(function (e) {
      if (e && (e.status === 401 || e.status === 403)) {
        log('token may have expired, fetching a fresh one and trying once more');
        ACT.uh = '';
        ACT.uhP = null;
        ME.p = null;
        return once();
      }
      if (e && e.status >= 500 && path !== '/api/comment' && path !== '/api/submit') {
        log('Reddit server error ' + e.status + ', trying once more');
        return new Promise(function (res) { setTimeout(res, 700); }).then(once);
      }
      throw e;
    }).then(function (t) {
      var j = null;
      try { j = JSON.parse(t); } catch (e) { j = null; }
      var errs = j && j.json && j.json.errors;
      if (errs && errs.length) throw new Error(String(errs[0][1] || errs[0][0] || 'refused'));
      ACT.last = label + ' ok';
      return j;
    }).catch(function (e) {
      ACT.last = label + ' failed: ' + String((e && e.message) || e);
      log('account action failed:', ACT.last);
      throw e;
    });
  }

  function prepend(parent, node) {
    if (parent.firstChild) parent.insertBefore(node, parent.firstChild);
    else parent.appendChild(node);
  }

  /* A line of status at the top of the comments column (posted, or why not) */
  function lbNotice(msg, bad) {
    if (!ui.notice) return;
    ui.notice.textContent = msg;
    ui.notice.className = 'cnote ' + (bad ? 'bad' : 'ok');
    ui.notice.style.display = '';
    clearTimeout(ui.noticeT);
    ui.noticeT = setTimeout(function () { if (ui.notice) ui.notice.style.display = 'none'; }, 7000);
  }

  function bumpCount() {
    var p = ui.curPost;
    if (!p) return;
    p.num_comments = (p.num_comments || 0) + 1;
    if (ui.chead) ui.chead.textContent = fmt(p.num_comments) + ' comments';
    var op = own.posts.get(p.name);
    if (op && op !== p) op.num_comments = (op.num_comments || 0) + 1;
    var c = op && cardOf(p.name);
    var lab = c && c.querySelector('[data-act="open"] span');
    if (lab && op) lab.textContent = fmt(op.num_comments);
  }

  function htmlEscape(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function htmlDecode(h) {
    return String(h).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/g, "'").replace(/&amp;/g, '&');
  }

  /* Whatever Reddit sent back, make something we can show: your own words
     when its copy is missing, decoded HTML when it was escaped. */
  function newComment(nd, text) {
    var d = nd ? Object.assign({}, nd) : {};
    var html = String(d.body_html || '');
    if (html && /&lt;/.test(html) && !/</.test(html)) html = htmlDecode(html);
    if (!html) {
      html = '<div class="md"><p>' + htmlEscape(text || d.body || '').replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>') + '</p></div>';
    }
    d.body_html = html;
    d.author = d.author || own.me || 'you';
    d.created_utc = d.created_utc || Date.now() / 1000;
    d.score = d.score != null ? d.score : 1;
    d.likes = d.likes != null ? d.likes : true;
    d.replies = '';
    if (!d.name && d.id) d.name = /^t1_/.test(d.id) ? d.id : 't1_' + d.id;
    return d;
  }

  function composer(thingId, pl, onDone, placeholder) {
    var ta = el('textarea', { rows: '4', placeholder: placeholder || 'Write a reply...', 'aria-label': 'Write a reply', maxlength: '10000' });
    var er = el('div', { class: 'er', role: 'alert' });
    er.style.display = 'none';
    var go = el('button', { class: 'go', type: 'button', text: 'Post reply' });
    var cancel = el('button', { class: 'cb', type: 'button', text: 'Cancel' });
    var box = el('div', { class: 'cmp' }, ta, er, el('div', { class: 'row' }, go, cancel, el('span', { class: 'hint2', text: 'Ctrl+Enter to post' })));
    function send() {
      var t = String(ta.value || '').trim();
      if (!t) { er.textContent = 'Write something first.'; er.style.display = 'block'; return; }
      if (go.disabled) return;
      go.disabled = true;
      go.textContent = 'Posting...';
      er.style.display = 'none';
      postApi('/api/comment', { thing_id: thingId, text: t, raw_json: '1' }).then(function (j) {
        var th = j && j.json && j.json.data && j.json.data.things && j.json.data.things[0];
        var nd = th && th.data ? th.data : null;
        cache.delete(pl);
        if (box.parentNode) box.parentNode.removeChild(box);
        var node = null;
        try {
          node = onDone(newComment(nd, t));
        } catch (e) {
          log('showing the new comment failed:', e);
        }
        bumpCount();
        if (node) {
          lbNotice(nd ? 'Comment posted.' : 'Comment sent. Reddit did not send a copy back, so refresh to check it is there.', false);
          if (node.classList) node.classList.add('fresh');
          if (node.scrollIntoView) node.scrollIntoView({ block: 'nearest' });
        } else lbNotice('Your comment was posted, but could not be shown here. Reload the page to see it.', true);
      }, function (e) {
        go.disabled = false;
        go.textContent = 'Post reply';
        er.textContent = 'Could not post: ' + String((e && e.message) || e);
        er.style.display = 'block';
        lbNotice('Your comment was not posted: ' + String((e && e.message) || e), true);
      });
    }
    go.addEventListener('click', send);
    cancel.addEventListener('click', function () { if (box.parentNode) box.parentNode.removeChild(box); });
    ta.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); send(); } });
    return { box: box, ta: ta };
  }

  function commentActions(d, pl, slot) {
    var st = { v: d.likes === true ? 1 : (d.likes === false ? -1 : 0), saved: !!d.saved };
    var v0 = st.v;
    var upB = el('button', { class: 'cb up', type: 'button', 'aria-label': 'Upvote comment' }, svg(IC.up));
    var dnB = el('button', { class: 'cb dn', type: 'button', 'aria-label': 'Downvote comment' }, svg(IC.down));
    var pts = el('span', { class: 'pts' });
    var svL = el('span', { text: 'Save' });
    var svB = el('button', { class: 'cb sv', type: 'button' }, svg(IC.save), svL);
    var rpB = el('button', { class: 'cb', type: 'button' }, svg(IC.reply), el('span', { text: 'Reply' }));
    var msg = el('span', { class: 'er' });
    msg.style.display = 'none';
    function paint() {
      upB.className = 'cb up' + (st.v > 0 ? ' on' : '');
      dnB.className = 'cb dn' + (st.v < 0 ? ' on' : '');
      upB.setAttribute('aria-pressed', String(st.v > 0));
      dnB.setAttribute('aria-pressed', String(st.v < 0));
      pts.textContent = fmt((d.score || 0) + (st.v - v0));
      svB.className = 'cb sv' + (st.saved ? ' on' : '');
      svB.setAttribute('aria-pressed', String(st.saved));
      svB.setAttribute('aria-label', st.saved ? 'Unsave comment' : 'Save comment');
      svL.textContent = st.saved ? 'Saved' : 'Save';
    }
    function fail(e, label) {
      msg.textContent = label + ' did not work: ' + String((e && e.message) || e);
      msg.style.display = '';
      setTimeout(function () { msg.style.display = 'none'; }, 6000);
    }
    function cvote(want) {
      var prev = st.v;
      st.v = prev === want ? 0 : want;
      paint();
      postApi('/api/vote', { id: d.name, dir: String(st.v) }).catch(function (e) { st.v = prev; paint(); fail(e, 'Voting'); });
    }
    upB.addEventListener('click', function () { cvote(1); });
    dnB.addEventListener('click', function () { cvote(-1); });
    svB.addEventListener('click', function () {
      var prev = st.saved;
      st.saved = !prev;
      paint();
      postApi(prev ? '/api/unsave' : '/api/save', { id: d.name }).catch(function (e) { st.saved = prev; paint(); fail(e, 'Saving'); });
    });
    var openC = null;
    rpB.addEventListener('click', function () {
      if (openC && openC.box.parentNode) { openC.ta.focus(); return; }
      openC = composer(d.name, pl, function (nd) {
        var n = commentNode({ kind: 't1', data: nd }, pl, (slot.depth || 0) + 1);
        if (n) prepend(slot.kids, n);
        return n;
      }, 'Reply to u/' + (d.author || 'this comment'));
      slot.cslot.appendChild(openC.box);
      openC.ta.focus();
    });
    paint();
    return el('div', { class: 'cact' }, upB, pts, dnB, svB, rpB, msg);
  }

  function commentNode(c, pl, depth) {
    depth = depth || 0;
    if (!c) return null;
    if (c.kind === 'more') {
      var n = (c.data && c.data.count) || 0;
      return el('div', { class: 'more' }, el('a', { href: location.origin + pl + '/', target: '_blank', rel: 'noopener',
        text: n ? 'Load ' + n + ' more repl' + (n === 1 ? 'y' : 'ies') + ' on Reddit' : 'Continue this thread on Reddit' }));
    }
    if (c.kind !== 't1' || !c.data) return null;
    var d = c.data;
    var wrap = el('div', { class: 'cm d' + (depth % 6) });
    var line = el('button', { class: 'line', type: 'button', 'aria-label': 'Collapse or expand this thread' });
    line.addEventListener('click', function () { wrap.classList.toggle('fold'); });
    var head = el('div', { class: 'chead' }, userLink(d.author),
      d.is_submitter ? el('span', { class: 'tag', text: 'OP' }) : null,
      d.distinguished === 'moderator' ? el('span', { class: 'tag mod', text: 'MOD' }) : null,
      d.stickied ? el('span', { class: 'tag', text: 'Pinned' }) : null,
      dot(), el('span', { text: ago(d.created_utc) }), (d.archived || !d.name) ? dot() : null, (d.archived || !d.name) ? el('span', { text: fmt(d.score) + ' points' }) : null);
    var kids = el('div', { class: 'kids' });
    var replies = d.replies && d.replies.data && d.replies.data.children;
    if (replies) replies.forEach(function (r) { var k = commentNode(r, pl, depth + 1); if (k) kids.appendChild(k); });
    wrap.appendChild(line);
    var cslot = el('div', { class: 'cslot' });
    var acts = (d.archived || !d.name) ? null : commentActions(d, pl, { kids: kids, cslot: cslot, depth: depth });
    wrap.appendChild(el('div', {}, head, el('div', { class: 'ctext' }, htmlToNodes(d.body_html)), acts, cslot, kids));
    return wrap;
  }

  /* ------------------------------------------------------------------ */
  /* Opening a post from the feed                                       */
  /* ------------------------------------------------------------------ */

  /* ------------------------------------------------------------------ */
  /* Own cards: drawn from Reddit's post data, in the mock-up style      */
  /* ------------------------------------------------------------------ */

  var TOK = [
    ':host{all:initial;--surface:#1a1418;--surface2:#251c22;--line:#35293a;--fg:#f2ecf0;--muted:#a99ba3;--accent:#e0a3c8;--accent-bg:#532A45;--up:#3fb950;--down:#f85149;--gold:#F6A800;--gold-ink:#1f1519;font:14px/1.5 ' + FONT_STACK + ';color:var(--fg)}',
    ':host([data-theme="light"]){--surface:#fff;--surface2:#F0ECF0;--line:#D0C4CC;--fg:#1f1519;--muted:#5f525a;--accent:#532A45;--accent-bg:#ead9e3;--up:#1a8f3c;--down:#c62828}',
    '*{box-sizing:border-box}',
    'button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;padding:0}',
    ':focus-visible{outline:2px solid var(--accent);outline-offset:2px}',
    '.ic{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}'
  ].join('\n') + '\n';

  var FEED_CSS = TOK + [
    '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;align-items:stretch;padding:4px 0 24px}',
    '.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;display:flex;flex-direction:column;overflow:hidden;min-width:0;cursor:pointer;transition:border-color .15s}',
    '.card:hover{border-color:var(--accent)}',
    '.thumb{height:150px;background:var(--surface2);position:relative;flex:none;overflow:hidden}',
    '.thumb img,.thumb svg.art{display:block;width:100%;height:100%}',
    '.thumb img{object-fit:cover}',
    '.badge{position:absolute;left:8px;bottom:8px;background:rgba(0,0,0,.65);color:#fff;font-size:11px;padding:1px 8px;border-radius:99px}',
    '.cmain{padding:12px 14px 10px;display:flex;flex-direction:column;gap:6px;flex:1;min-width:0}',
    '.meta{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);flex-wrap:wrap;min-width:0}',
    '.av{width:18px;height:18px;border-radius:50%;display:grid;place-items:center;font-size:10px;font-weight:600;color:#fff;flex:none}',
    '.sub{font-weight:600;color:var(--fg);text-decoration:none}',
    '.sub:hover{color:var(--accent);text-decoration:underline}',
    'h3{margin:0;font-size:15px;line-height:1.35;font-weight:600;overflow-wrap:anywhere;text-wrap:balance}',
    'h3 a{text-decoration:none;color:inherit}',
    '.flairs{display:flex;gap:6px;flex-wrap:wrap}',
    '.chip{font-size:11px;font-weight:500;padding:1px 8px;border-radius:99px;background:var(--accent-bg);color:var(--fg)}',
    '.chip.nsfw{background:#8E1537;color:#fff}',
    'a.chip.fl{text-decoration:none;color:var(--fg)}',
    'a.chip.fl:hover{outline:1px solid var(--accent)}',
    '.snip{margin:0;color:var(--muted);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}',
    '.nothumb .snip{-webkit-line-clamp:5}',
    '.acts{display:flex;align-items:center;gap:4px;margin-top:auto;padding-top:6px;flex-wrap:wrap}',
    '.vote{display:inline-flex;align-items:center;background:var(--surface2);border-radius:99px}',
    '.vb{width:30px;height:28px;display:grid;place-items:center;color:var(--muted);border-radius:99px}',
    '.vb:hover{color:var(--fg)}',
    '.vb.up.on{color:var(--up)}.vb.dn.on{color:var(--down)}',
    '.sc{min-width:30px;text-align:center;font-weight:600;font-size:13px;font-variant-numeric:tabular-nums}',
    '.sc.up{color:var(--up)}.sc.dn{color:var(--down)}',
    '.ab{height:28px;padding:0 9px;border-radius:99px;display:inline-flex;align-items:center;gap:6px;color:var(--muted);font-size:13px;font-variant-numeric:tabular-nums}',
    '.ab:hover{background:var(--surface2);color:var(--fg)}',
    '.ab .ic{width:16px;height:16px}',
    '.card{position:relative}',
    '.sp2{flex:1}',
    '.ib2{width:28px;height:28px;border-radius:99px;display:grid;place-items:center;color:var(--muted)}',
    '.ib2:hover{background:var(--surface2);color:var(--fg)}',
    '.ib2.sv.on{color:var(--gold)}',
    '.ib2.sv.on .ic{fill:currentColor}',
    '.card.saved,.card.saved:hover{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold),0 0 16px rgba(246,168,0,.22)}',
    '.card.vup,.card.vup:hover{border-color:var(--up);box-shadow:0 0 0 1px var(--up),0 0 16px rgba(63,185,80,.25)}',
    '.card.vdn,.card.vdn:hover{border-color:var(--down);box-shadow:0 0 0 1px var(--down),0 0 16px rgba(248,81,73,.25)}',
    '.card.saved.vup,.card.saved.vup:hover{box-shadow:0 0 0 1px var(--up),0 0 0 3px var(--gold),0 0 16px rgba(246,168,0,.22)}',
    '.card.saved.vdn,.card.saved.vdn:hover{box-shadow:0 0 0 1px var(--down),0 0 0 3px var(--gold),0 0 16px rgba(246,168,0,.22)}',
    '.hov{display:none;position:absolute;inset:0;background:var(--surface);flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--muted);z-index:2}',
    '.card.hid > :not(.hov){visibility:hidden}',
    '.card.hid .hov{display:flex}',
    '.card.hid{cursor:default;border-style:dashed}',
    '.undo{padding:5px 16px;border-radius:99px;border:1px solid var(--line);color:var(--fg);font-weight:600;font-size:13px}',
    '.undo:hover{border-color:var(--accent)}',
    '.pmenu{position:fixed;z-index:40;width:220px;background:var(--surface);border:1px solid var(--line);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.45);padding:6px;flex-direction:column}',
    '.mi{display:block;width:100%;text-align:left;padding:8px 12px;border-radius:6px;color:var(--fg);text-decoration:none;font-size:13px;cursor:pointer;background:none;border:0;font:inherit}',
    '.mi:hover{background:var(--surface2)}',
    '.bl{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-self:start}',
    '.fchip{border-color:var(--gold)}',
    '.about{position:fixed;top:56px;right:0;bottom:0;z-index:35;width:min(420px,100vw);background:var(--surface);color:var(--fg);border-left:1px solid var(--line);box-shadow:-12px 0 32px rgba(0,0,0,.4);overflow:auto;outline:none}',
    '.ab-head{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--surface);border-bottom:1px solid var(--line);z-index:1}',
    '.ab-body{padding:14px 16px 28px;display:flex;flex-direction:column;gap:10px}',
    '.ab-body h2{margin:0;font-size:20px}',
    '.ab-body h3{margin:10px 0 0;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}',
    '.ab-t{font-weight:600}',
    '.ab-s{color:var(--muted);font-size:13px}',
    '.ab-d{margin:0}',
    '.bm{display:block;padding:9px 14px;border:1px solid var(--line);border-radius:99px;color:var(--fg);text-decoration:none;text-align:center;font-weight:600;font-size:13px}',
    '.bm:hover{border-color:var(--accent)}',
    '.rule{border-bottom:1px solid var(--line)}',
    '.rh{display:flex;gap:12px;align-items:center;width:100%;text-align:left;padding:10px 2px;font-weight:600;font-size:14px}',
    '.rn{color:var(--muted);min-width:18px}',
    '.rb{display:none;padding:0 2px 12px 30px;color:var(--muted);font-size:13px;overflow-wrap:anywhere}',
    '.rule.open .rb{display:block}',
    '.ab-h{font-size:13px;color:var(--muted);overflow-wrap:anywhere}',
    '.ab-h a,.rb a{color:var(--accent)}',
    '.ab-m{display:flex;flex-direction:column;gap:8px;align-items:flex-start}',
    '.err{color:#ff9a9a}',
    '.skel{height:14px;border-radius:6px;background:var(--surface2)}',
    '.bar{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;padding:0 0 10px}',
    '.bar .sg{justify-self:end}',
    '.ctr{display:flex;flex-direction:column;align-items:center;gap:8px}',
    '.times{display:inline-flex;flex-wrap:wrap;justify-content:center;gap:2px;padding:3px;background:var(--surface);border:1px solid var(--line);border-radius:99px}',
    '.so.sm{padding:3px 12px;font-size:12px}',
    '.sorts{display:inline-flex;gap:2px;padding:3px;background:var(--surface);border:1px solid var(--accent);border-radius:99px}',
    '.so{padding:4px 16px;border-radius:99px;color:var(--muted);font-size:13px;font-weight:600;text-decoration:none}',
    '.so:hover{color:var(--fg)}',
    '.so.on{background:var(--gold);color:var(--gold-ink)}',
    '.sg{display:inline-flex;align-items:center;height:32px;padding:0 16px;border:1px solid var(--accent);border-radius:99px;background:var(--accent-bg);color:var(--fg);font-size:13px;font-weight:600;text-decoration:none;white-space:nowrap}',
    '.sg:hover,.sg[aria-pressed="true"]{background:var(--accent);color:var(--gold-ink)}',
    '.sg .ic{width:14px;height:14px;margin-right:6px}',
    '.sg:has(> .ic:only-child) .ic{margin-right:0}',
    '.sg.join.on{background:transparent;color:var(--fg)}',
    '.mi.dis{color:var(--muted);cursor:default}',
    '.mi.dis:hover{background:none}',
    '.rowsep{grid-column:1/-1;height:16px;position:relative;pointer-events:none}',
    '.rowsep::before{content:"";position:absolute;left:0;right:0;top:50%;height:1px;background:linear-gradient(to right,var(--accent),rgba(0,0,0,0) 85%);opacity:.55}',
    '.rowsep::after{content:"\\203A \\203A \\203A";position:absolute;left:0;top:50%;transform:translateY(-50%);padding:0 10px 0 2px;background:var(--color-neutral-background,#0e1113);color:var(--accent);opacity:.8;font-size:12px;letter-spacing:2px}',
    '.sg.cta{background:var(--gold);border-color:var(--gold);color:var(--gold-ink)}',
    '.sg.cta:hover{filter:brightness(1.1);background:var(--gold);color:var(--gold-ink)}',
    '.br{display:flex;gap:8px;align-items:center;justify-self:end}',
    '.bell{position:relative}',
    '.bell .ic{margin-right:0}',
    '.bn{position:absolute;top:-6px;right:-4px;min-width:17px;height:17px;padding:0 4px;border-radius:99px;background:var(--down);color:#fff;font-size:11px;font-weight:700;display:grid;place-items:center}',
    '.card.muted{display:none}',
    '.cpost{position:fixed;inset:0;z-index:45;display:none;align-items:center;justify-content:center;padding:16px}',
    '.cp-scrim{position:absolute;inset:0;background:rgba(8,5,8,.72)}',
    '.cp-dlg{position:relative;width:min(640px,100%);max-height:92vh;overflow:auto;background:var(--surface);color:var(--fg);border:1px solid var(--line);border-radius:14px;padding:18px 20px;display:flex;flex-direction:column;gap:10px;box-shadow:0 24px 80px rgba(0,0,0,.5)}',
    '.cp-dlg h2{margin:0;font-size:18px}',
    '.cp-row{display:flex;gap:8px;align-items:center}',
    '.cp-row input[type=text]{flex:1}',
    '.cp-dlg input[type=text],.cp-dlg input[type=url],.cp-dlg textarea,.cp-dlg select{width:100%;background:var(--surface2);color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:inherit}',
    '.cp-dlg textarea{min-height:150px;resize:vertical}',
    '.cp-pre{color:var(--muted);font-weight:600}',
    '.cp-tabs{display:inline-flex;gap:2px;padding:3px;border:1px solid var(--line);border-radius:99px;align-self:flex-start}',
    '.cp-tab{padding:4px 16px;border-radius:99px;color:var(--muted);font-weight:600;font-size:13px}',
    '.cp-tab.on{background:var(--gold);color:var(--gold-ink)}',
    '.cp-chk{display:inline-flex;gap:6px;align-items:center;font-size:13px;color:var(--muted)}',
    '.cp-err{color:#ff9a9a;font-size:13px}',
    '.cp-ok{color:var(--up);font-size:13px}',
    '.sentinel{height:2px}',
    '.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:50;background:var(--fg);color:var(--surface);padding:8px 16px;border-radius:99px;font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,.35);max-width:calc(100vw - 32px)}',
    '@media (prefers-reduced-motion:reduce){*{transition:none!important}}'
  ].join('\n');

  function adopt(rootNode, css) {
    try {
      var sh = new CSSStyleSheet();
      sh.replaceSync(css);
      rootNode.adoptedStyleSheets = [sh];
    } catch (e) {
      var st = document.createElement('style');
      st.textContent = css;
      rootNode.appendChild(st);
    }
  }

  function rng(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function docEl() { return document.documentElement; }

  function nsfwOf(p) {
    var xp = p.crosspost_parent_list && p.crosspost_parent_list[0];
    return !!(p.over_18 || (xp && xp.over_18));
  }

  function thumbFor(p, depth) {
    if (!p || p.over_18 || p.spoiler) return '';
    if (p.is_gallery && p.gallery_data && p.gallery_data.items && p.gallery_data.items.length && p.media_metadata) {
      var m = p.media_metadata[p.gallery_data.items[0].media_id];
      if (m && m.status === 'valid') {
        var pv = (m.p || []).filter(function (x) { return x.x >= 300; })[0];
        var gu = (pv && pv.u) || (m.s && (m.s.u || m.s.gif));
        if (gu) return gu;
      }
    }
    var im = p.preview && p.preview.images && p.preview.images[0];
    if (im) {
      var rs = (im.resolutions || []).filter(function (x) { return x.width >= 320; })[0];
      var cand = (rs && rs.url) || (im.source && im.source.url);
      if (cand) return cand;
    }
    if (/^https?:/.test(p.thumbnail || '')) return p.thumbnail;
    var xp = p.crosspost_parent_list && p.crosspost_parent_list[0];
    if (xp && !depth) return thumbFor(xp, 1);
    return '';
  }

  function snippetOf(p) {
    if (nsfwOf(p)) return '';
    var t = p.selftext || '';
    var xp = p.crosspost_parent_list && p.crosspost_parent_list[0];
    if (!t && xp) t = xp.selftext || '';
    t = t.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_~`>#]/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    return t.length > 260 ? t.slice(0, 257) + '...' : t;
  }

  function artNode(p) {
    var ns = 'http://www.w3.org/2000/svg';
    var h = hashStr(p.subreddit || 'x') % 360;
    var r = rng(hashStr(p.name || 'x'));
    var s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 320 200');
    s.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    s.setAttribute('class', 'art');
    function mk(tag, attrs) {
      var e = document.createElementNS(ns, tag);
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      return e;
    }
    var gid = 'g' + hashStr(p.name || 'x');
    var defs = mk('defs', {});
    var lg = mk('linearGradient', { id: gid, x1: '0', y1: '0', x2: '1', y2: '1' });
    lg.appendChild(mk('stop', { offset: '0', 'stop-color': 'hsl(' + h + ' 48% 30%)' }));
    lg.appendChild(mk('stop', { offset: '1', 'stop-color': 'hsl(' + ((h + 45) % 360) + ' 52% 15%)' }));
    defs.appendChild(lg);
    s.appendChild(defs);
    s.appendChild(mk('rect', { width: '320', height: '200', fill: 'url(#' + gid + ')' }));
    for (var i = 0; i < 6; i++) {
      s.appendChild(mk('circle', { cx: String(Math.round(r() * 320)), cy: String(Math.round(r() * 200)), r: String(Math.round(18 + r() * 60)), fill: 'hsl(' + Math.round(h + r() * 70) + ' 62% 58%)', opacity: (0.1 + r() * 0.16).toFixed(2) }));
    }
    if (p.is_video) {
      s.appendChild(mk('circle', { cx: '160', cy: '100', r: '26', fill: '#000', opacity: '.55' }));
      s.appendChild(mk('path', { d: 'M152 87l22 13-22 13z', fill: '#fff' }));
    }
    return s;
  }

  /* Card data read straight from the shreddit-post element, so cards do not
     depend on Reddit's data endpoints (/by_id/ answered HTTP 403 in testing). */
  function attrNum(e, n) {
    var v = parseInt(String(e.getAttribute(n) || '').replace(/[^\d-]/g, ''), 10);
    return isNaN(v) ? 0 : v;
  }

  function isoToUtc(s) {
    if (!s) return 0;
    var t = Date.parse(String(s).replace(/(\.\d{3})\d+/, '$1').replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));
    return isNaN(t) ? 0 : Math.floor(t / 1000);
  }

  function domThumb(e) {
    var sels = ['[slot="thumbnail"]', '[slot="post-media-container"]'];
    for (var i = 0; i < sels.length; i++) {
      var c = e.querySelector(sels[i]);
      if (!c) continue;
      var m = c.querySelector('img[src], faceplate-img[src], shreddit-player[poster], shreddit-player-2[poster]');
      var u = m && (m.getAttribute('src') || m.getAttribute('poster'));
      if (/^https:\/\//i.test(u || '')) return u;
    }
    return '';
  }

  var NSFW_ATTR = /nsfw|over.?18|adult|mature/i;
  var NSFW_SEL = '[class*="nsfw" i],[data-testid*="nsfw" i],[aria-label*="nsfw" i],[alt*="nsfw" i],[slot*="nsfw" i]';

  function domNsfw(e) {
    var names = typeof e.getAttributeNames === 'function' ? e.getAttributeNames() : [];
    for (var i = 0; i < names.length; i++) {
      if (NSFW_ATTR.test(names[i]) && !/^(false|0|no)$/i.test(e.getAttribute(names[i]) || '')) return true;
    }
    if (e.querySelector(NSFW_SEL)) return true;
    var fl = e.querySelector('shreddit-post-flair');
    return !!(fl && /^\s*nsfw\s*$/i.test(fl.textContent || ''));
  }

  function flairHrefOf(fl) {
    var a = fl && fl.querySelector ? fl.querySelector('a') : null;
    var h = a && a.getAttribute('href');
    if (!h || !/flair_name/.test(h)) return '';
    try {
      var u = new URL(h, location.origin);
      return u.origin === location.origin ? u.pathname + u.search : '';
    } catch (e) { return ''; }
  }

  function flairHref(p) {
    if (p.flair_href) return p.flair_href;
    if (!p.subreddit || !p.link_flair_text) return '';
    return '/r/' + encodeURIComponent(p.subreddit) + '/?f=' + encodeURIComponent('flair_name:"' + p.link_flair_text + '"');
  }

  function flairChip(p) {
    var h = flairHref(p);
    return h ? el('a', { class: 'chip fl', href: h, title: 'Show only posts with this flair', text: p.link_flair_text })
      : el('span', { class: 'chip', text: p.link_flair_text });
  }

  function domPost(e) {
    var id = e.getAttribute('id') || '';
    var pl = e.getAttribute('permalink') || '';
    if (pl && !/\/$/.test(pl)) pl += '/';
    var type = String(e.getAttribute('post-type') || '').toLowerCase();
    var sub = e.getAttribute('subreddit-name') || String(e.getAttribute('subreddit-prefixed-name') || '').replace(/^r\//, '');
    var title = e.getAttribute('post-title') || '';
    if (!title) { var tl = e.querySelector('[slot="title"]'); title = tl ? String(tl.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
    var created = isoToUtc(e.getAttribute('created-timestamp'));
    if (!created) { var ta = e.querySelector('faceplate-timeago[ts]'); created = ta ? isoToUtc(ta.getAttribute('ts')) : 0; }
    var fl = e.querySelector('shreddit-post-flair');
    var body = e.querySelector('[slot="text-body"]');
    var nsfw = domNsfw(e);
    return {
      name: id, title: title, subreddit: sub, author: e.getAttribute('author') || '', permalink: pl,
      score: attrNum(e, 'score'), num_comments: attrNum(e, 'comment-count'), created_utc: created,
      link_flair_text: fl ? String(fl.textContent || '').replace(/\s+/g, ' ').trim() : '',
      flair_href: flairHrefOf(fl),
      over_18: nsfw, spoiler: e.hasAttribute('spoiler'), stickied: false, likes: null,
      is_self: type === 'text', is_video: type === 'video', is_gallery: type === 'gallery',
      domain: e.getAttribute('domain') || '', url: e.getAttribute('content-href') || '',
      thumbnail: nsfw ? '' : domThumb(e),
      selftext: (nsfw || !body) ? '' : String(body.textContent || '').replace(/\s+/g, ' ').trim()
    };
  }

  var own = {
    feed: null, host: null, root: null, grid: null, sentinel: null, toastEl: null,
    shown: [], have: {}, posts: new Map(), plToId: {}, cards: {}, votes: {}, v0: {},
    busy: false, failed: '', failAt: 0, apiOk: -1, apiDead: '', br: null, bellB: null, bellN: null, bellDone: false, mutedB: null, times: null, center: null, joinB: null, joinL: null, moreB: null, subSt: null, rowT: 0, rowW: 0, ro: null, sub: '', left: null, aboutB: null, flairB: null, fchip: null, about: null, aboutBody: null, aboutX: null, aboutSub: '', preT: 0, touched: {}, vtouched: {}, voteMap: null, votesP: null, savedSet: null, savedP: null, createB: null, hover: null, menu: null, menuId: '', saved: {}, hid: {}, fol: {}, pre: {}, bar: null, sg: null, sorts: null, sortKey: '~', mo: null, moT: 0, io: null, pokeAt: 0, toastT: 0
  };

  function toast(msg) {
    if (!own.toastEl) return;
    own.toastEl.textContent = msg;
    own.toastEl.style.display = 'block';
    clearTimeout(own.toastT);
    own.toastT = setTimeout(function () { own.toastEl.style.display = 'none'; }, 3200);
  }

  function badgeText(p) {
    if (nsfwOf(p)) return 'NSFW';
    if (p.spoiler) return 'Spoiler';
    if (p.is_gallery) { var gn = p.gallery_data && p.gallery_data.items && p.gallery_data.items.length; return gn ? gn + ' images' : 'Gallery'; }
    if (p.is_video) return 'Video';
    if (p.crosspost_parent_list && p.crosspost_parent_list.length) return 'Crosspost';
    if (!p.is_self && p.domain && !/(^|\.)(reddit\.com|redd\.it)$/i.test(p.domain) && !/^self\./.test(p.domain)) return p.domain;
    return '';
  }

  function voteBox(p) {
    var v = own.votes[p.name] || 0;
    var score = (p.score || 0) + (v - (own.v0[p.name] || 0));
    return el('span', { class: 'vote', role: 'group', 'aria-label': 'Vote' },
      el('button', { class: 'vb up' + (v > 0 ? ' on' : ''), type: 'button', 'data-act': 'up', 'aria-label': 'Upvote', 'aria-pressed': String(v > 0) }, svg(IC.up)),
      el('span', { class: 'sc' + (v ? (v > 0 ? ' up' : ' dn') : ''), text: p.hide_score && !v ? '•' : fmt(score) }),
      el('button', { class: 'vb dn' + (v < 0 ? ' on' : ''), type: 'button', 'data-act': 'down', 'aria-label': 'Downvote', 'aria-pressed': String(v < 0) }, svg(IC.down)));
  }

  function cardEl(p) {
    var thumb = thumbFor(p);
    var nsfw = nsfwOf(p);
    var hasT = !!thumb || nsfw || !!p.is_video || !!p.is_gallery;
    var badge = badgeText(p);
    var media = null;
    if (hasT) {
      var inner;
      if (thumb) {
        inner = el('img', { src: thumb, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
        inner.addEventListener('error', function () { if (inner.replaceWith) inner.replaceWith(artNode(p)); });
      } else inner = artNode(p);
      media = el('div', { class: 'thumb' }, inner, badge ? el('span', { class: 'badge', text: badge }) : null);
    }
    var chips = [];
    if (p.link_flair_text) chips.push(flairChip(p));
    if (nsfw) chips.push(el('span', { class: 'chip nsfw', text: 'NSFW' }));
    if (p.stickied) chips.push(el('span', { class: 'chip', text: 'Pinned' }));
    var av = el('span', { class: 'av', text: (p.subreddit || '?').charAt(0).toUpperCase() });
    av.style.background = 'hsl(' + (hashStr(p.subreddit || '') % 360) + ' 45% 34%)';
    var snip = snippetOf(p);
    own.v0[p.name] = p.likes === true ? 1 : (p.likes === false ? -1 : 0);
    own.votes[p.name] = own.v0[p.name];
    return el('article', { class: 'card' + (hasT ? '' : ' nothumb'), 'data-id': p.name, tabindex: '0', role: 'listitem', 'aria-label': p.title || '' },
      media,
      el('div', { class: 'cmain' },
        el('div', { class: 'meta' }, av, el('a', { class: 'sub', href: '/r/' + p.subreddit + '/', text: 'r/' + p.subreddit }), (p.author && p.author !== '[deleted]') ? dot() : null, (p.author && p.author !== '[deleted]') ? el('a', { class: 'sub usr', 'data-user': p.author, href: '/user/' + encodeURIComponent(p.author) + '/', text: 'u/' + p.author }) : null, p.created_utc ? dot() : null, p.created_utc ? el('span', { text: ago(p.created_utc) }) : null),
        el('h3', {}, el('a', { class: 'tl', href: p.permalink, text: p.title || '' })),
        chips.length ? el('div', { class: 'flairs' }, chips) : null,
        snip ? el('p', { class: 'snip', text: snip }) : null,
        el('div', { class: 'acts' }, voteBox(p),
          el('button', { class: 'ab', type: 'button', 'data-act': 'open', 'aria-label': fmt(p.num_comments) + ' comments' }, svg(IC.comment), el('span', { text: fmt(p.num_comments) })),
          el('span', { class: 'sp2' }),
          el('button', { class: 'ib2 sv', type: 'button', 'data-act': 'save', 'aria-pressed': 'false', 'aria-label': 'Save post', title: 'Save' }, svg(IC.save)),
          el('button', { class: 'ib2', type: 'button', 'data-act': 'hide', 'aria-label': 'Hide post', title: 'Hide' }, svg(IC.hide)),
          el('button', { class: 'ib2', type: 'button', 'data-act': 'more', 'aria-haspopup': 'menu', 'aria-label': 'More actions', title: 'More' }, svg(IC.more)))),
      el('div', { class: 'hov' }, svg(IC.hide), el('span', { text: 'Post hidden' }), el('button', { class: 'undo', type: 'button', 'data-act': 'unhide', text: 'Undo' })));
  }

  function deepFind(start, test) {
    var queue = [start];
    var guard = 0;
    while (queue.length && guard++ < 4000) {
      var n = queue.shift();
      if (n.nodeType === 1 && test(n)) return n;
      var kids = n.children ? Array.prototype.slice.call(n.children) : [];
      if (n.shadowRoot) kids = kids.concat(Array.prototype.slice.call(n.shadowRoot.children));
      kids.forEach(function (k) { queue.push(k); });
    }
    return null;
  }

  function findVoteButton(id, dir) {
    var orig = document.querySelector('shreddit-post[id="' + id + '"]');
    if (!orig) return null;
    var word = dir === 'up' ? 'upvote' : 'downvote';
    var re = new RegExp('(^|[^a-z])' + word, 'i');
    return deepFind(orig, function (n) {
      return n.tagName === 'BUTTON' && (n.hasAttribute(word) || re.test(n.getAttribute('aria-label') || ''));
    });
  }

  function applyVote(id, v) {
    own.votes[id] = v;
    own.vtouched[id] = true;
    var c = cardOf(id), p = own.posts.get(id);
    var old = c && c.querySelector('.vote');
    if (old && p) old.replaceWith(voteBox(p));
    paintCard(id);
    syncVote(id);
  }

  function applySaved(id, on) {
    own.saved[id] = on;
    own.touched[id] = true;
    paintCard(id);
    syncSaved(id);
  }

  function vote(id, dir) {
    if (!own.posts.get(id)) return;
    var cur = own.votes[id] || 0;
    var want = dir === 'up' ? 1 : -1;
    var next = cur === want ? 0 : want;
    applyVote(id, next);
    postApi('/api/vote', { id: id, dir: String(next) }).then(function () { log('vote saved', dir); }, function (e) {
      applyVote(id, cur);
      toast('Voting did not work: ' + String((e && e.message) || e));
    });
  }

  function readMineCache() {
    try {
      var c = JSON.parse(gm.get('mine', '') || 'null');
      if (c && Array.isArray(c.saved) && c.votes && typeof c.votes === 'object') return c;
    } catch (e) { /* ignore */ }
    return null;
  }

  var cacheT = 0;
  function saveMineCache() {
    clearTimeout(cacheT);
    cacheT = setTimeout(function () {
      try {
        var votes = {};
        Object.keys(own.voteMap || {}).slice(-600).forEach(function (k) { votes[k] = own.voteMap[k]; });
        gm.set('mine', JSON.stringify({ u: own.me || '', saved: Object.keys(own.savedSet || {}).slice(-600), votes: votes }));
      } catch (e) { /* ignore */ }
    }, 250);
  }

  /* what you saved or voted on last time, so cards are right on the first paint */
  function useMineCache() {
    var c = readMineCache();
    if (!c) return;
    own.savedSet = {};
    c.saved.forEach(function (k) { own.savedSet[k] = 1; });
    own.voteMap = c.votes;
    own.me = c.u || '';
  }

  function syncSaved(id) {
    if (!own.savedSet) own.savedSet = {};
    if (own.saved[id]) own.savedSet[id] = 1; else delete own.savedSet[id];
    saveMineCache();
  }

  function syncVote(id) {
    if (!own.voteMap) own.voteMap = {};
    var v = own.votes[id] || 0;
    if (v) own.voteMap[id] = v; else delete own.voteMap[id];
    saveMineCache();
  }

  function loadSaved() {
    if (own.savedP) return own.savedP;
    own.savedP = getMe().then(function (me) {
      if (!me.name) throw new Error('not signed in');
      own.me = me.name;
      var set = {};
      function page(after, n) {
        var u = '/user/' + encodeURIComponent(me.name) + '/saved.json?limit=100&raw_json=1' + (after ? '&after=' + encodeURIComponent(after) : '');
        return getJson(u).then(function (d) {
          ((d && d.data && d.data.children) || []).forEach(function (c) { if (c && c.kind === 't3' && c.data && c.data.name) set[c.data.name] = 1; });
          var nx = d && d.data && d.data.after;
          return nx && n < 3 ? page(nx, n + 1) : set;
        });
      }
      return page('', 0);
    }).then(function (set) {
      Object.keys(own.touched).forEach(function (id) { if (own.saved[id]) set[id] = 1; else delete set[id]; });
      own.savedSet = set;
      markSaved();
      saveMineCache();
    }, function (e) { if (!own.savedSet) own.savedSet = {}; log('saved list unavailable:', (e && e.message) || e); });
    return own.savedP;
  }

  function loadVotes() {
    if (own.votesP) return own.votesP;
    own.votesP = getMe().then(function (me) {
      if (!me.name) throw new Error('not signed in');
      own.me = me.name;
      var old = own.voteMap || {};
      function walk(kind, val) {
        var map = {};
        function page(after, n) {
          var u = '/user/' + encodeURIComponent(me.name) + '/' + kind + '.json?limit=100&raw_json=1' + (after ? '&after=' + encodeURIComponent(after) : '');
          return getJson(u).then(function (d) {
            ((d && d.data && d.data.children) || []).forEach(function (c) { if (c && c.kind === 't3' && c.data && c.data.name) map[c.data.name] = val; });
            var nx = d && d.data && d.data.after;
            return nx && n < 2 ? page(nx, n + 1) : null;
          });
        }
        return page('', 0).then(function () { return map; }, function (e) {
          log(kind + ' list unavailable:', (e && e.message) || e);
          var keep = {};
          Object.keys(old).forEach(function (k) { if (old[k] === val) keep[k] = val; });
          return keep;
        });
      }
      return Promise.all([walk('upvoted', 1), walk('downvoted', -1)]).then(function (r) {
        var m = {};
        Object.keys(r[0]).forEach(function (k) { m[k] = 1; });
        Object.keys(r[1]).forEach(function (k) { m[k] = -1; });
        return m;
      });
    }).then(function (map) {
      Object.keys(own.vtouched).forEach(function (id) { var v = own.votes[id] || 0; if (v) map[id] = v; else delete map[id]; });
      own.voteMap = map;
      markVotes();
      saveMineCache();
    }, function (e) { if (!own.voteMap) own.voteMap = {}; log('vote lists unavailable:', (e && e.message) || e); });
    return own.votesP;
  }

  function markVotes() {
    if (!own.voteMap) return;
    own.shown.forEach(function (id) {
      if (own.vtouched[id]) return;
      var v = own.voteMap[id] || 0;
      if ((own.votes[id] || 0) !== v) {
        own.v0[id] = v;
        own.votes[id] = v;
        var c = cardOf(id), p = own.posts.get(id);
        var old = c && c.querySelector('.vote');
        if (old && p) old.replaceWith(voteBox(p));
      }
      paintCard(id);
    });
  }

  function markSaved() {
    if (!own.savedSet) return;
    own.shown.forEach(function (id) {
      if (own.touched[id]) return;
      var want = !!own.savedSet[id];
      if (!!own.saved[id] !== want) { own.saved[id] = want; paintCard(id); }
    });
  }

  function cardOf(id) { return own.cards[id] || null; }

  function paintCard(id) {
    var c = cardOf(id);
    if (!c) return;
    c.classList.toggle('hid', !!own.hid[id]);
    c.classList.toggle('saved', !!own.saved[id]);
    var mp = own.posts.get(id);
    c.classList.toggle('muted', !!(mp && isMuted(mp.subreddit)));
    c.classList.toggle('vup', (own.votes[id] || 0) > 0);
    c.classList.toggle('vdn', (own.votes[id] || 0) < 0);
    var sv = c.querySelector('[data-act="save"]');
    if (sv) {
      sv.className = 'ib2 sv' + (own.saved[id] ? ' on' : '');
      sv.setAttribute('aria-pressed', String(!!own.saved[id]));
      sv.setAttribute('aria-label', own.saved[id] ? 'Unsave post' : 'Save post');
      sv.setAttribute('title', own.saved[id] ? 'Saved' : 'Save');
    }
  }

  function doSave(id) {
    var prev = !!own.saved[id];
    own.touched[id] = true;
    own.saved[id] = !prev;
    paintCard(id);
    syncSaved(id);
    postApi(prev ? '/api/unsave' : '/api/save', { id: id }).then(function () { toast(prev ? 'Removed from saved' : 'Saved'); }, function (e) {
      own.saved[id] = prev;
      paintCard(id);
      syncSaved(id);
      toast('Saving did not work: ' + String((e && e.message) || e));
    });
  }

  function doHide(id) {
    own.hid[id] = true;
    paintCard(id);
    closeMenu();
    postApi('/api/hide', { id: id }).catch(function (e) {
      own.hid[id] = false;
      paintCard(id);
      toast('Hiding did not work: ' + String((e && e.message) || e));
    });
  }

  function doUnhide(id) {
    own.hid[id] = false;
    paintCard(id);
    postApi('/api/unhide', { id: id }).catch(function (e) {
      own.hid[id] = true;
      paintCard(id);
      toast('Undo did not work: ' + String((e && e.message) || e));
    });
  }

  function doFollow(id) {
    var prev = !!own.fol[id];
    own.fol[id] = !prev;
    postApi('/api/follow_post', { fullname: id, follow: prev ? 'false' : 'true' }).then(function () { toast(prev ? 'Stopped following this post' : 'Following this post'); }, function (e) {
      own.fol[id] = prev;
      toast('Follow post did not work: ' + String((e && e.message) || e));
    });
  }

  function closeMenu() {
    if (own.menu) own.menu.style.display = 'none';
    own.menuId = '';
  }

  function openMenu(id, btn) {
    var p = own.posts.get(id);
    if (!p) return;
    if (!own.menu) {
      own.menu = el('div', { class: 'pmenu', role: 'menu' });
      own.menu.style.display = 'none';
      own.root.appendChild(own.menu);
    }
    if (own.menuId === id && own.menu.style.display !== 'none') { closeMenu(); return; }
    own.menuId = id;
    var url = location.origin + p.permalink;
    function item(label, fn) {
      return el('button', { class: 'mi', type: 'button', role: 'menuitem', text: label, onclick: function () { closeMenu(); fn(); } });
    }
    function link(label, href) {
      return el('a', { class: 'mi', role: 'menuitem', href: href, target: '_blank', rel: 'noopener noreferrer', text: label, onclick: function () { closeMenu(); } });
    }
    setKids(own.menu,
      item(own.saved[id] ? 'Unsave' : 'Save', function () { doSave(id); }),
      item('Hide', function () { doHide(id); }),
      item(own.fol[id] ? 'Stop following this post' : 'Follow post', function () { doFollow(id); }),
      item('Copy link', function () {
        if (!gm.copy(url) && navigator.clipboard) navigator.clipboard.writeText(url).catch(function () { /* ignore */ });
        toast('Link copied');
      }),
      link('Open on Reddit', url),
      link('Give an award (opens the post on Reddit)', url),
      item('Hide r/' + p.subreddit + ' from my feed (this script only)', function () { setMuted(p.subreddit, true); toast('r/' + p.subreddit + ' is hidden here. Undo it from "Muted" in the bar.'); }),
      link('Report (opens the post on Reddit)', url));
    var r = btn && btn.getBoundingClientRect ? btn.getBoundingClientRect() : { right: 300, bottom: 100, top: 100 };
    own.menu.style.display = 'flex';
    var h = own.menu.offsetHeight || 220;
    var vw = window.innerWidth || 1200, vh = window.innerHeight || 800;
    var left = Math.max(8, Math.min(r.right - 220, vw - 228));
    var top = r.bottom + 4;
    if (top + h > vh - 8) top = Math.max(8, r.top - h - 4);
    own.menu.style.left = Math.round(left) + 'px';
    own.menu.style.top = Math.round(top) + 'px';
  }

  function prefetch(card) {
    var id = card && card.getAttribute('data-id');
    var p = id && own.posts.get(id);
    if (!p || own.pre[id] || cache.has(p.permalink)) return;
    own.pre[id] = 1;
    loadPost(p.permalink).catch(function () { delete own.pre[id]; });
  }

  function openOwn(id) {
    var p = own.posts.get(id);
    if (!p) return;
    var vis = own.shown.filter(function (i) { var q = own.posts.get(i); return !own.hid[i] && !(q && isMuted(q.subreddit)); });
    S.list = vis.map(function (i) { return own.posts.get(i).permalink; });
    S.idx = vis.indexOf(id);
    show(p.permalink, p.title);
  }

  function onOwnClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (own.menu && !t.closest('.pmenu') && !t.closest('[data-act="more"]') && !t.closest('.bl')) closeMenu();
    var card = t.closest('.card');
    if (!card) return;
    var id = card.getAttribute('data-id');
    var btn = t.closest('[data-act]');
    if (btn) {
      var a = btn.getAttribute('data-act');
      if (a === 'unhide') { e.preventDefault(); doUnhide(id); return; }
      if (own.hid[id]) return;
      if (a === 'save') { e.preventDefault(); doSave(id); return; }
      if (a === 'hide') { e.preventDefault(); doHide(id); return; }
      if (a === 'more') { e.preventDefault(); openMenu(id, btn); return; }
      if (a === 'up' || a === 'down') { e.preventDefault(); vote(id, a, card); return; }
      if (a === 'open') { e.preventDefault(); openOwn(id); return; }
    }
    if (own.hid[id]) return;
    if (t.closest('a.sub')) return;
    if (t.closest('a.usr')) return;
    if (t.closest('a.fl')) return;
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    openOwn(id);
  }

  function onOwnKey(e) {
    if (e.key === 'Escape' && own.menu && own.menu.style.display !== 'none') { e.preventDefault(); closeMenu(); return; }
    if (e.key === 'Escape' && own.about && own.about.style.display !== 'none') { e.preventDefault(); closeAbout(); return; }
    if ((e.key === 'Enter') && e.target && e.target.classList && e.target.classList.contains('card')) {
      e.preventDefault();
      openOwn(e.target.getAttribute('data-id'));
    }
  }

  /* Optional extra detail (images, NSFW flag, text) from Reddit's data
     endpoints. Cards work without it, so a refusal is not an error. */
  var API_PATHS = [
    function (ids) { return '/by_id/' + ids.join(',') + '.json?raw_json=1'; },
    function (ids) { return '/api/info.json?id=' + ids.join(',') + '&raw_json=1'; }
  ];

  function fetchListing(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      var m = new Map();
      ((j && j.data && j.data.children) || []).forEach(function (c) { if (c && c.data && c.data.name) m.set(c.data.name, c.data); });
      if (!m.size) throw new Error('no posts returned');
      return m;
    });
  }

  function enrich(ids) {
    if (!cfg.extra || own.apiDead) return Promise.resolve(new Map());
    var order = own.apiOk >= 0 ? [own.apiOk] : [0, 1];
    var notes = [];
    function tryAt(k) {
      if (k >= order.length) {
        if (own.apiOk < 0) { own.apiDead = notes.join('; '); log('extra post data unavailable, using the page data only:', own.apiDead); }
        return Promise.resolve(new Map());
      }
      var ix = order[k];
      return fetchListing(API_PATHS[ix](ids)).then(function (m) { own.apiOk = ix; return m; }, function (err) {
        notes.push((ix ? 'api/info ' : 'by_id ') + ((err && err.message) || err));
        return tryAt(k + 1);
      });
    }
    return tryAt(0);
  }

  function clearCards() {
    own.shown = []; own.have = {}; own.cards = {}; own.busy = false;
    if (own.grid) setKids(own.grid);
    docEl().classList.remove('lbx-own');
  }

  function resetOwn() {
    if (own.mo) { own.mo.disconnect(); own.mo = null; }
    if (own.io) { own.io.disconnect(); own.io = null; }
    clearCards();
  }

  var SORTS = [['best', 'Best'], ['hot', 'Hot'], ['new', 'New'], ['top', 'Top'], ['rising', 'Rising']];

  function sortInfo(path) {
    var m = /^\/(?:r\/([^\/]+)\/)?(?:(best|hot|new|top|rising)\/?)?$/i.exec(path || '');
    return m ? { sub: m[1] || '', cur: String(m[2] || '').toLowerCase() } : null;
  }

  var TIMES = [['hour', 'Now'], ['day', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['year', 'This Year'], ['all', 'All Time']];

  /* The page's current sort when the address has none (your default sort).
     Read from Reddit's own more-posts address, then the sort dropdown. */
  function detectSort() {
    var p = document.querySelector('shreddit-feed faceplate-partial[slot="load-after"]');
    var src = String((p && p.getAttribute('src')) || '').split('?')[0];
    var m = /\/(best|hot|new|top|rising)\/?$/i.exec(src);
    if (m) return m[1].toLowerCase();
    var dd = document.querySelector('shreddit-sort-dropdown');
    if (dd) {
      var names = ['selected-sort', 'sort', 'value', 'selected'];
      for (var i = 0; i < names.length; i++) {
        var v = String(dd.getAttribute(names[i]) || '').trim();
        if (/^(best|hot|new|top|rising)$/i.test(v)) return v.toLowerCase();
      }
      var tx = String(dd.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^(best|hot|new|top|rising)$/i.test(tx)) return tx.toLowerCase();
    }
    return '';
  }

  function detectTime() {
    try {
      var t = new URLSearchParams(location.search || '').get('t');
      if (t) return t;
    } catch (e) { /* ignore */ }
    var p = document.querySelector('shreddit-feed faceplate-partial[slot="load-after"]');
    var m = /[?&]t=(hour|day|week|month|year|all)/i.exec(String((p && p.getAttribute('src')) || ''));
    return m ? m[1].toLowerCase() : 'day';
  }

  function updateSort() {
    if (!own.sorts) return;
    var info = sortInfo(location.pathname);
    var det = info && !info.cur ? detectSort() : '';
    var curSort = info ? (info.cur || det || (info.sub ? '' : 'best')) : '';
    var tm = curSort === 'top' ? detectTime() : '';
    var key = (info ? info.sub + '|' + info.cur : '') + '|' + (location.search || '') + '|' + curSort + '|' + tm;
    if (key === own.sortKey) return;
    own.sortKey = key;
    own.sub = info ? info.sub : '';
    var showLeft = !!own.sub && !/^(popular|all|home)$/i.test(own.sub);
    if (own.left) own.left.style.display = info ? '' : 'none';
    if (own.aboutB) own.aboutB.style.display = showLeft ? '' : 'none';
    if (own.flairB) own.flairB.style.display = showLeft ? '' : 'none';
    if (own.joinB) own.joinB.style.display = showLeft ? '' : 'none';
    if (own.moreB) own.moreB.style.display = showLeft ? '' : 'none';
    if (showLeft) refreshJoin(own.sub);
    if (own.createB) own.createB.setAttribute('href', showLeft ? '/r/' + encodeURIComponent(own.sub) + '/submit/' : '/submit/');
    docEl().classList.toggle('lbx-comm', showLeft);
    var fl = showLeft ? currentFlair() : '';
    if (own.fchip) {
      own.fchip.style.display = fl ? '' : 'none';
      if (fl) { own.fchip.setAttribute('href', location.pathname); own.fchip.setAttribute('title', 'Clear the flair filter'); own.fchip.textContent = 'Flair: ' + fl.trim() + '  ✕'; }
    }
    docEl().classList.toggle('lbx-sorts', !!info);
    if (!info) { own.sorts.style.display = 'none'; if (own.times) own.times.style.display = 'none'; return; }
    own.sorts.style.display = '';
    var base = info.sub ? '/r/' + info.sub + '/' : '/';
    var cur = curSort;
    var links = SORTS.filter(function (x) { return !(info.sub && x[0] === 'best'); }).map(function (x) {
      var on = cur === x[0];
      var a = el('a', { class: 'so' + (on ? ' on' : ''), href: (x[0] === 'best' && !info.sub) ? '/' : base + x[0] + '/', text: x[1] });
      if (on) a.setAttribute('aria-current', 'page');
      return a;
    });
    setKids.apply(null, [own.sorts].concat(links));
    if (own.times) {
      own.times.style.display = cur === 'top' ? '' : 'none';
      if (cur === 'top') {
        setKids.apply(null, [own.times].concat(TIMES.map(function (x) {
          var on = tm === x[0];
          var a = el('a', { class: 'so sm' + (on ? ' on' : ''), href: base + 'top/?t=' + x[0], text: x[1] });
          if (on) a.setAttribute('aria-current', 'true');
          return a;
        })));
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Community details: about, rules, bookmarks and flair filter         */
  /* ------------------------------------------------------------------ */

  var SUBI = {}, FLI = {};

  function getJson(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  var SUBA = {};
  function subAbout(sub) {
    var k = sub.toLowerCase();
    if (!SUBA[k]) {
      SUBA[k] = getJson('/r/' + encodeURIComponent(sub) + '/about.json?raw_json=1');
      SUBA[k].catch(function () { delete SUBA[k]; });
    }
    return SUBA[k];
  }

  function subData(sub) {
    var k = sub.toLowerCase();
    if (!SUBI[k]) {
      var b = '/r/' + encodeURIComponent(sub);
      var soft = function (u) { return getJson(u).catch(function () { return null; }); };
      SUBI[k] = Promise.all([subAbout(sub).catch(function () { return null; }), soft(b + '/about/rules.json?raw_json=1'), soft(b + '/api/widgets?raw_json=1')]).then(function (a) {
        return { about: a[0] && a[0].data, rules: a[1] && a[1].rules, widgets: a[2] };
      });
    }
    return SUBI[k];
  }

  function flairList(sub) {
    var k = sub.toLowerCase();
    if (!FLI[k]) {
      FLI[k] = getJson('/r/' + encodeURIComponent(sub) + '/api/link_flair_v2.json').then(function (l) {
        return (Array.isArray(l) ? l : []).filter(function (x) { return x && x.text; }).map(function (x) { return String(x.text); });
      }).catch(function () { return []; });
    }
    return FLI[k];
  }

  function widgetBlocks(w) {
    var out = [];
    if (!w || !w.items) return out;
    var order = [].concat((w.layout && w.layout.topbar && w.layout.topbar.order) || [], (w.layout && w.layout.sidebar && w.layout.sidebar.order) || []);
    if (!order.length) order = Object.keys(w.items);
    function link(x) {
      var u = x && safeHref(x.url);
      return u && x.text ? { text: String(x.text), url: u } : null;
    }
    order.forEach(function (id) {
      var it = w.items[id];
      if (!it) return;
      var links = [];
      if (it.kind === 'button') (it.buttons || []).forEach(function (b) { var l = link(b); if (l) links.push(l); });
      else if (it.kind === 'menu') (it.data || []).forEach(function (m) {
        if (m && m.children) m.children.forEach(function (c) { var l = link(c); if (l) links.push(l); });
        else { var l2 = link(m); if (l2) links.push(l2); }
      });
      if (links.length) out.push({ title: it.shortName || 'Community bookmarks', links: links });
      else if (it.kind === 'text-area' && it.textHtml) out.push({ title: it.shortName || '', html: it.textHtml });
    });
    return out;
  }

  function currentFlair() {
    try {
      var f = new URLSearchParams(location.search || '').get('f');
      var m = f && /^flair_name:"([\s\S]*)"$/.exec(f);
      return m ? m[1] : '';
    } catch (e) { return ''; }
  }

  function ensureAbout() {
    if (own.about) return;
    own.aboutBody = el('div', { class: 'ab-body' });
    own.aboutX = el('button', { class: 'ib2', type: 'button', 'aria-label': 'Close details', onclick: function () { closeAbout(); } }, svg(IC.x));
    own.about = el('aside', { class: 'about', role: 'dialog', 'aria-label': 'Community details', tabindex: '-1' },
      el('div', { class: 'ab-head' }, el('b', { text: 'About this community' }), own.aboutX), own.aboutBody);
    own.about.style.display = 'none';
    own.root.appendChild(own.about);
  }

  function closeAbout() {
    if (own.about) own.about.style.display = 'none';
  }

  function openAbout(sub) {
    ensureAbout();
    if (own.about.style.display !== 'none' && own.aboutSub === sub) { closeAbout(); return; }
    own.aboutSub = sub;
    own.about.style.display = 'block';
    setKids(own.aboutBody, el('div', { class: 'skel', style: 'width:60%' }), el('div', { class: 'skel' }), el('div', { class: 'skel', style: 'width:80%' }));
    if (own.about.focus) own.about.focus({ preventScroll: true });
    subData(sub).then(function (d) {
      if (own.aboutSub !== sub) return;
      var a = d.about || {};
      var kids = [];
      kids.push(el('h2', { text: 'r/' + (a.display_name || sub) }));
      if (a.title && a.title !== a.display_name) kids.push(el('div', { class: 'ab-t', text: a.title }));
      var stats = [];
      if (a.subscribers != null) stats.push(fmt(a.subscribers) + ' members');
      var online = a.active_user_count != null ? a.active_user_count : a.accounts_active;
      if (online != null) stats.push(fmt(online) + ' online');
      if (a.created_utc) stats.push('Created ' + new Date(a.created_utc * 1000).toLocaleDateString('en-GB'));
      if (a.over18) stats.push('18+');
      if (stats.length) kids.push(el('div', { class: 'ab-s', text: stats.join(' · ') }));
      if (a.public_description) kids.push(el('p', { class: 'ab-d', text: a.public_description }));
      widgetBlocks(d.widgets).forEach(function (b) {
        kids.push(el('h3', { text: b.title || 'More' }));
        if (b.links) b.links.forEach(function (l) { kids.push(el('a', { class: 'bm', href: l.url, target: '_blank', rel: 'noopener noreferrer', text: l.text })); });
        else kids.push(el('div', { class: 'ab-h' }, htmlToNodes(b.html)));
      });
      var rules = d.rules || [];
      if (rules.length) {
        kids.push(el('h3', { text: 'Rules' }));
        rules.forEach(function (r, i) {
          var body = el('div', { class: 'rb' }, htmlToNodes(r.description_html || ''));
          var head = el('button', { class: 'rh', type: 'button', 'aria-expanded': 'false' }, el('span', { class: 'rn', text: String(i + 1) }), el('span', { text: r.short_name || 'Rule ' + (i + 1) }));
          var box = el('div', { class: 'rule' }, head, body);
          head.addEventListener('click', function () {
            var on = !box.classList.contains('open');
            box.classList.toggle('open', on);
            head.setAttribute('aria-expanded', String(on));
          });
          kids.push(box);
        });
      }
      if (a.description_html) {
        var more = el('div', { class: 'ab-h' }, htmlToNodes(a.description_html));
        more.style.display = 'none';
        var mb = el('button', { class: 'sg', type: 'button', text: 'Show full sidebar text' });
        mb.addEventListener('click', function () { var on = more.style.display === 'none'; more.style.display = on ? '' : 'none'; mb.textContent = on ? 'Hide full sidebar text' : 'Show full sidebar text'; });
        kids.push(el('div', { class: 'ab-m' }, mb, more));
      }
      if (!d.about && !d.rules) kids.push(el('div', { class: 'err', text: 'Reddit would not give the details for this community here.' }));
      kids.push(el('a', { class: 'bm', href: '/r/' + encodeURIComponent(sub) + '/about/', text: 'Open the full community page on Reddit' }));
      setKids(own.aboutBody, kids);
    });
  }

  function openFlairs(sub, btn) {
    if (!own.menu) {
      own.menu = el('div', { class: 'pmenu', role: 'menu' });
      own.menu.style.display = 'none';
      own.root.appendChild(own.menu);
    }
    if (own.menuId === 'flairs' && own.menu.style.display !== 'none') { closeMenu(); return; }
    own.menuId = 'flairs';
    setKids(own.menu, el('div', { class: 'mi', text: 'Loading flairs...' }));
    var r = btn && btn.getBoundingClientRect ? btn.getBoundingClientRect() : { left: 20, bottom: 80, top: 60 };
    own.menu.style.display = 'flex';
    own.menu.style.left = Math.max(8, Math.round(r.left)) + 'px';
    own.menu.style.top = Math.round(r.bottom + 4) + 'px';
    flairList(sub).then(function (names) {
      if (own.menuId !== 'flairs') return;
      var seen = {};
      own.shown.forEach(function (id) {
        var p = own.posts.get(id);
        if (p && p.link_flair_text && String(p.subreddit).toLowerCase() === sub.toLowerCase()) seen[p.link_flair_text.trim()] = flairHref(p);
      });
      var items = names.map(function (t) {
        return { text: t.trim(), href: seen[t.trim()] || ('/r/' + encodeURIComponent(sub) + '/?f=' + encodeURIComponent('flair_name:"' + t + '"')) };
      });
      Object.keys(seen).forEach(function (t) { if (!items.some(function (x) { return x.text === t; })) items.push({ text: t, href: seen[t] }); });
      var kids = [];
      if (currentFlair()) kids.push(el('a', { class: 'mi', role: 'menuitem', href: location.pathname, text: 'Clear the flair filter' }));
      items.forEach(function (x) { kids.push(el('a', { class: 'mi', role: 'menuitem', href: x.href, text: x.text })); });
      if (!items.length) kids.push(el('div', { class: 'mi', text: 'No flairs found for this community.' }));
      setKids(own.menu, kids);
      own.menu.style.maxHeight = '60vh';
      own.menu.style.overflowY = 'auto';
    });
  }

  /* ------------------------------------------------------------------ */
  /* Join, favourite and custom feeds, in the bar                        */
  /* ------------------------------------------------------------------ */

  function paintJoin() {
    var st = own.subSt && own.subSt.sub === own.sub ? own.subSt : null;
    var on = !!(st && st.joined);
    if (own.joinL) own.joinL.textContent = on ? 'Joined' : 'Join';
    if (own.joinB) {
      own.joinB.className = 'sg join' + (on ? ' on' : '');
      own.joinB.setAttribute('aria-pressed', String(on));
    }
  }

  function refreshJoin(sub) {
    if (!sub || (own.subSt && own.subSt.sub === sub)) { paintJoin(); return; }
    own.subSt = { sub: sub, joined: false, fav: false, loaded: false };
    paintJoin();
    subAbout(sub).then(function (j) {
      var a = j && j.data;
      if (!own.subSt || own.subSt.sub !== sub || own.subSt.touched) return;
      own.subSt.joined = !!(a && a.user_is_subscriber);
      own.subSt.fav = !!(a && a.user_has_favorited);
      own.subSt.loaded = true;
      paintJoin();
    }, function () { /* leave the button as Join */ });
  }

  function toggleJoin() {
    var sub = own.sub;
    if (!sub) return;
    refreshJoin(sub);
    var st = own.subSt;
    var prev = st.joined;
    st.touched = true;
    st.joined = !prev;
    paintJoin();
    postApi('/api/subscribe', { action: prev ? 'unsub' : 'sub', sr_name: sub, skip_initial_defaults: 'true' }).then(function () {
      toast(prev ? 'Left r/' + sub : 'Joined r/' + sub);
    }, function (e) {
      st.joined = prev;
      paintJoin();
      toast((prev ? 'Leaving' : 'Joining') + ' did not work: ' + String((e && e.message) || e));
    });
  }

  function menuShell() {
    if (!own.menu) {
      own.menu = el('div', { class: 'pmenu', role: 'menu' });
      own.menu.style.display = 'none';
      own.root.appendChild(own.menu);
    }
    return own.menu;
  }

  function placeMenu(btn, w) {
    var r = btn && btn.getBoundingClientRect ? btn.getBoundingClientRect() : { left: 20, bottom: 80, top: 60 };
    var m = own.menu;
    m.style.display = 'flex';
    var vw = (typeof window !== 'undefined' && window.innerWidth) || 1200;
    m.style.left = Math.max(8, Math.min(Math.round(r.left), vw - (w || 240) - 8)) + 'px';
    m.style.top = Math.round(r.bottom + 4) + 'px';
  }

  function menuItem(label, fn) {
    return el('button', { class: 'mi', type: 'button', role: 'menuitem', text: label, onclick: function () { fn(); } });
  }

  function openCommunityMenu(btn) {
    var sub = own.sub;
    if (!sub) return;
    menuShell();
    if (own.menuId === 'comm' && own.menu.style.display !== 'none') { closeMenu(); return; }
    own.menuId = 'comm';
    refreshJoin(sub);
    var st = own.subSt;
    var items = [];
    if (st && st.joined) {
      items.push(menuItem(st.fav ? 'Remove from favourites' : 'Add to favourites', function () {
        closeMenu();
        var prev = !!st.fav;
        st.fav = !prev;
        postApi('/api/favorite', { make_favorite: String(!prev), sr_name: sub }).then(function () { toast(prev ? 'Removed from favourites' : 'Added to favourites'); }, function (e) {
          st.fav = prev;
          toast('Favourites did not work: ' + String((e && e.message) || e));
        });
      }));
    } else items.push(el('div', { class: 'mi dis', text: 'Join this community to add it to favourites' }));
    items.push(menuItem('Add to custom feed...', function () { openFeedChooser(btn, sub); }));
    items.push(menuItem(isMuted(sub) ? 'Unmute r/' + sub + ' in my feed' : 'Mute r/' + sub + ' in my feed (this script only)', function () {
      closeMenu();
      setMuted(sub, !isMuted(sub));
      toast(isMuted(sub) ? 'r/' + sub + ' is hidden here' : 'Unmuted r/' + sub);
    }));
    items.push(menuItem('Copy community link', function () {
      var url = location.origin + '/r/' + encodeURIComponent(sub) + '/';
      if (!gm.copy(url) && navigator.clipboard) navigator.clipboard.writeText(url).catch(function () { /* ignore */ });
      closeMenu();
      toast('Link copied');
    }));
    items.push(el('a', { class: 'mi', role: 'menuitem', href: '/r/' + encodeURIComponent(sub) + '/about/', text: 'Open community page on Reddit', onclick: function () { closeMenu(); } }));
    setKids(own.menu, items);
    own.menu.style.maxHeight = '';
    own.menu.style.overflowY = '';
    placeMenu(btn, 260);
  }

  function openFeedChooser(btn, sub) {
    own.menuId = 'comm';
    setKids(own.menu, el('div', { class: 'mi', text: 'Loading your custom feeds...' }));
    getJson('/api/multi/mine?expand_srs=false&raw_json=1').then(function (list) {
      if (own.menuId !== 'comm') return;
      var feeds = (Array.isArray(list) ? list : []).map(function (x) { return x && x.data; }).filter(function (d) { return d && d.path; });
      var kids = [el('div', { class: 'mi dis', text: 'Add r/' + sub + ' to:' })];
      feeds.forEach(function (d) {
        kids.push(menuItem(d.display_name || d.name || d.path, function () {
          closeMenu();
          postApi('/api/multi' + d.path.replace(/\/+$/, '') + '/r/' + encodeURIComponent(sub), { model: JSON.stringify({ name: sub }) }, 'PUT').then(function () {
            toast('Added to ' + (d.display_name || d.name));
          }, function (e) { toast('Adding to the feed did not work: ' + String((e && e.message) || e)); });
        }));
      });
      if (!feeds.length) kids.push(el('div', { class: 'mi', text: 'You have no custom feeds yet.' }));
      setKids(own.menu, kids);
    }, function (e) { setKids(own.menu, el('div', { class: 'mi', text: 'Could not load your custom feeds: ' + String((e && e.message) || e) })); });
  }

  /* ------------------------------------------------------------------ */
  /* Reading-order guide: a faint arrowed line between rows of cards     */
  /* ------------------------------------------------------------------ */

  function layoutRows() {
    var g = own.grid;
    if (!g) return;
    Array.prototype.slice.call(g.querySelectorAll('.rowsep')).forEach(function (x) { if (x.parentNode) x.parentNode.removeChild(x); });
    var cards = Array.prototype.slice.call(g.querySelectorAll('.card')).filter(function (c) { return !(c.classList && c.classList.contains('muted')); });
    var rowTop = null, firsts = [];
    cards.forEach(function (c) {
      var top = c.offsetTop || 0;
      if (rowTop === null || top > rowTop + 4) { firsts.push(c); rowTop = top; }
    });
    firsts.slice(1).forEach(function (c) { g.insertBefore(el('div', { class: 'rowsep', 'aria-hidden': 'true' }), c); });
  }

  function schedRows() {
    clearTimeout(own.rowT);
    own.rowT = setTimeout(layoutRows, 140);
  }

  function watchRows() {
    if (own.ro || !own.grid) return;
    if (typeof ResizeObserver === 'function') {
      own.ro = new ResizeObserver(function () {
        var w = own.grid.clientWidth;
        if (w !== own.rowW) { own.rowW = w; schedRows(); }
      });
      own.ro.observe(own.grid);
    } else {
      own.ro = { disconnect: function () { /* none */ } };
      if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', schedRows);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Muted communities (hidden in this script only, nothing sent to Reddit) */
  /* ------------------------------------------------------------------ */

  var MUTE = { map: null };

  function mutedMap() {
    if (!MUTE.map) {
      MUTE.map = {};
      try { JSON.parse(gm.get('muted', '[]') || '[]').forEach(function (n) { MUTE.map[String(n).toLowerCase()] = String(n); }); } catch (e) { /* ignore */ }
    }
    return MUTE.map;
  }

  function isMuted(sub) { return !!(sub && mutedMap()[String(sub).toLowerCase()]); }

  function updateMutedBtn() {
    if (!own.mutedB) return;
    var n = Object.keys(mutedMap()).length;
    own.mutedB.style.display = n ? '' : 'none';
    own.mutedB.textContent = 'Muted (' + n + ')';
  }

  function setMuted(sub, on) {
    var k = String(sub).toLowerCase();
    if (on) mutedMap()[k] = String(sub); else delete mutedMap()[k];
    gm.set('muted', JSON.stringify(Object.keys(mutedMap()).map(function (x) { return mutedMap()[x]; })));
    own.shown.forEach(paintCard);
    updateMutedBtn();
    schedRows();
  }

  function openMutedMenu(btn) {
    menuShell();
    if (own.menuId === 'muted' && own.menu.style.display !== 'none') { closeMenu(); return; }
    own.menuId = 'muted';
    var names = Object.keys(mutedMap()).map(function (k) { return mutedMap()[k]; });
    var kids = [el('div', { class: 'mi dis', text: 'Hidden from your feed in this script:' })];
    names.forEach(function (n) { kids.push(menuItem('Unmute r/' + n, function () { closeMenu(); setMuted(n, false); toast('Unmuted r/' + n); })); });
    if (!names.length) kids.push(el('div', { class: 'mi', text: 'No muted communities.' }));
    setKids(own.menu, kids);
    own.menu.style.maxHeight = '';
    own.menu.style.overflowY = '';
    placeMenu(btn, 260);
  }

  /* ------------------------------------------------------------------ */
  /* Opening a post by its address (used by notifications and new posts) */
  /* ------------------------------------------------------------------ */

  function openPermalink(pl, title) {
    if (!pl) return;
    S.list = [pl];
    S.idx = 0;
    show(pl, title || '');
  }

  /* ------------------------------------------------------------------ */
  /* Notifications dropdown, from the classic inbox                      */
  /* ------------------------------------------------------------------ */

  var NT = { host: null, root: null, panel: null, list: null, sub: null, note: null, items: null, open: false, err: '', retryMs: 4000 };

  var NCSS = TOK + [
    '.np{width:min(470px,calc(100vw - 24px));max-height:min(72vh,640px);display:flex;flex-direction:column;background:var(--surface);color:var(--fg);border:1px solid var(--line);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.5);outline:none;overflow:hidden}',
    '.nh{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line)}',
    '.nh b{font-size:17px}',
    '.sp3{flex:1}',
    '.nsub{color:var(--muted);font-size:14px}',
    '.nbtn{padding:6px 14px;border-radius:99px;border:1px solid var(--accent);background:var(--accent-bg);font-size:14px;font-weight:600}',
    '.nbtn:hover{background:var(--accent);color:var(--gold-ink)}',
    '.nx{width:28px;height:28px;border-radius:99px;display:grid;place-items:center;color:var(--muted)}',
    '.nlist{overflow:auto;display:flex;flex-direction:column}',
    '.nit{display:flex;gap:12px;text-align:left;padding:14px 16px;border-bottom:1px solid var(--line);width:100%;align-items:flex-start}',
    '.nit:hover{background:var(--surface2)}',
    '.nit .dot{width:8px;height:8px;border-radius:50%;background:var(--gold);margin-top:6px;flex:none;visibility:hidden}',
    '.nit.new .dot{visibility:visible}',
    '.nit .nt{font-weight:600;font-size:16px;line-height:1.4;overflow-wrap:anywhere}',
    '.nit .nb{color:var(--muted);font-size:15px;line-height:1.45;margin-top:2px;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
    '.nit .nw{color:var(--muted);font-size:13px;margin-top:4px}',
    '.nmsg{padding:14px 18px;color:var(--muted);text-align:center;font-size:15px}',
    '.nmsg.er{color:#ff9a9a}',
    '.nmsg.info{color:var(--muted)}',
    '.nf{display:block;padding:14px;text-align:center;color:var(--accent);font-size:15px;font-weight:600;text-decoration:none;border-top:1px solid var(--line)}'
  ].join('\n');

  function ntTitle(d) {
    var who = d.author ? 'u/' + d.author : 'Someone';
    var where = d.subreddit_name_prefixed ? ' in ' + d.subreddit_name_prefixed : '';
    if (d.was_comment === false || /^t4_/.test(String(d.name || ''))) return 'Message from ' + who + (d.subject ? ': ' + d.subject : '');
    if (d.type === 'post_reply') return who + ' replied to your post' + where;
    if (d.type === 'username_mention') return who + ' mentioned you' + where;
    return who + ' replied to your comment' + where;
  }

  function ntPostPath(ctx) {
    var m = /^(\/r\/[^\/?#]+\/comments\/[a-z0-9]+\/[^\/?#]*\/?)/i.exec(String(ctx || ''));
    return m ? m[1].replace(/\/?$/, '/') : '';
  }

  function setBell(n) {
    if (!own.bellN) return;
    own.bellN.textContent = n > 99 ? '99+' : String(n);
    own.bellN.style.display = n ? '' : 'none';
  }

  function refreshBell() {
    if (!own.bellN || own.bellDone) return;
    own.bellDone = true;
    getMe().then(function (d) { setBell(parseInt(d.inbox_count, 10) || 0); }, function () { own.bellDone = false; });
  }

  function ntUnread() {
    return (NT.items || []).filter(function (d) { return d.new; }).length;
  }

  function ntCounts() {
    var n = ntUnread();
    if (NT.sub) NT.sub.textContent = NT.items ? (n ? n + ' unread' : 'all read') : '';
    if (NT.items && NT.items.length < 30) setBell(n);
  }

  function renderNotif() {
    if (!NT.list) return;
    var kids = [];
    (NT.items || []).forEach(function (d) {
      var body = String(d.body || '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_~\`>#]/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, 180);
      var b = el('button', { class: 'nit' + (d.new ? ' new' : ''), type: 'button' }, el('span', { class: 'dot' }),
        el('span', {}, el('div', { class: 'nt', text: ntTitle(d) }), body ? el('div', { class: 'nb', text: body }) : null, el('div', { class: 'nw', text: ago(d.created_utc) })));
      b.addEventListener('click', function () {
        var pl = ntPostPath(d.context);
        if (d.new && d.name) {
          d.new = false;
          b.className = 'nit';
          ntCounts();
          postApi('/api/read_message', { id: d.name }).catch(function () { /* leave it read here */ });
        }
        if (pl) { closeNotif(); openPermalink(pl, d.link_title); } else window.open('/message/inbox/', '_blank', 'noopener');
      });
      kids.push(b);
    });
    if (!kids.length) kids.push(el('div', { class: 'nmsg', text: 'Nothing in your inbox.' }));
    setKids(NT.list, kids);
    ntCounts();
  }

  function loadNotif() {
    setKids(NT.list, el('div', { class: 'nmsg', text: 'Loading...' }));
    getJson('/message/inbox.json?limit=30&raw_json=1').then(function (j) {
      NT.items = ((j && j.data && j.data.children) || []).map(function (c) { return c && c.data; }).filter(Boolean);
      NT.err = '';
      renderNotif();
    }, function (e) {
      NT.err = String((e && e.message) || e);
      setKids(NT.list, el('div', { class: 'nmsg er', text: 'Could not load notifications: ' + NT.err }));
    });
  }

  function ntNote(text, bad) {
    if (!NT.note) return;
    NT.note.textContent = text || '';
    NT.note.className = 'nmsg ' + (bad ? 'er' : 'info');
    NT.note.style.display = text ? '' : 'none';
  }

  /* Marks the unread items read by name. Reddit rate-limits the "read all"
     call hard, so this uses the per-item call (many names in one request),
     waits and tries once more if told to slow down, and puts the dots back
     if it still does not work. */
  function markAllRead() {
    var unread = (NT.items || []).filter(function (d) { return d.new && d.name; });
    if (!unread.length) { ntNote('Everything here is already read.', false); return; }
    unread.forEach(function (d) { d.new = false; });
    renderNotif();
    setBell(0);
    var ids = unread.map(function (d) { return d.name; }).join(',');
    function attempt(n) {
      return postApi('/api/read_message', { id: ids }).catch(function (e) {
        if (n === 0 && e && e.status === 429) {
          ntNote('Reddit says slow down. Trying again in a few seconds...', false);
          return new Promise(function (res) { setTimeout(res, NT.retryMs); }).then(function () { return attempt(1); });
        }
        throw e;
      });
    }
    attempt(0).then(function () { ntNote('', false); }, function (e) {
      unread.forEach(function (d) { d.new = true; });
      renderNotif();
      ntNote('Marking as read did not work: ' + String((e && e.message) || e), true);
    });
  }

  function ensureNotif() {
    if (NT.host) return;
    NT.host = el('div', { id: 'lbx-notif-host' });
    NT.host.style.cssText = 'position:fixed;top:60px;right:12px;z-index:2147482000;display:none;';
    NT.root = NT.host.attachShadow({ mode: 'open' });
    adopt(NT.root, NCSS);
    NT.sub = el('span', { class: 'nsub' });
    NT.list = el('div', { class: 'nlist' });
    NT.note = el('div', { class: 'nmsg info', role: 'status' });
    NT.note.style.display = 'none';
    var all = el('button', { class: 'nbtn', type: 'button', text: 'Mark all read' });
    all.addEventListener('click', markAllRead);
    NT.panel = el('section', { class: 'np', role: 'dialog', 'aria-label': 'Notifications', tabindex: '-1' },
      el('div', { class: 'nh' }, el('b', { text: 'Notifications' }), NT.sub, el('span', { class: 'sp3' }), all,
        el('button', { class: 'nx', type: 'button', 'aria-label': 'Close notifications', onclick: function () { closeNotif(); } }, svg(IC.x))),
      NT.note,
      NT.list,
      el('a', { class: 'nf', href: '/notifications', target: '_blank', rel: 'noopener', text: 'See all notifications on Reddit' }));
    NT.root.appendChild(NT.panel);
    NT.panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeNotif(); });
    document.body.appendChild(NT.host);
  }

  function ntOutside(e) {
    var path = e.composedPath ? e.composedPath() : [];
    if (NT.host && path.indexOf(NT.host) >= 0) return;
    if (own.bellB && path.indexOf(own.bellB) >= 0) return;
    for (var i = 0; i < path.length; i++) { if (path[i] && path[i].tagName === 'A' && /^notifications-inbox/.test(String(path[i].getAttribute('id') || ''))) return; }
    closeNotif();
  }

  function openNotif() {
    ensureNotif();
    NT.host.setAttribute('data-theme', themeNow());
    NT.host.style.display = 'block';
    NT.open = true;
    if (NT.panel.focus) NT.panel.focus({ preventScroll: true });
    loadNotif();
    setTimeout(function () { if (NT.open) document.addEventListener('click', ntOutside, true); }, 0);
  }

  function closeNotif() {
    if (!NT.host) return;
    NT.host.style.display = 'none';
    NT.open = false;
    document.removeEventListener('click', ntOutside, true);
  }

  function toggleNotif() { if (NT.open) closeNotif(); else openNotif(); }

  /* Reddit's own bell in the header opens this dropdown instead of the page */
  function onBellClick(e) {
    if (!cfg.notifs || e.defaultPrevented || e.button > 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    var path = e.composedPath ? e.composedPath() : [];
    if (NT.host && path.indexOf(NT.host) >= 0) return;
    for (var i = 0; i < path.length; i++) {
      var n = path[i];
      if (n && n.tagName === 'A' && /^notifications-inbox/.test(String(n.getAttribute('id') || ''))) {
        e.preventDefault();
        e.stopPropagation();
        toggleNotif();
        return;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Create a post (text or link) without leaving the page               */
  /* ------------------------------------------------------------------ */

  var CP = { wrap: null, kind: 'self', ft: {}, path: '', postTitle: '' };

  function cpSub() { return String((CP.sub && CP.sub.value) || '').trim().replace(/^\/?r\//i, ''); }

  function setCpKind(k) {
    CP.kind = k;
    CP.tabSelf.className = 'cp-tab' + (k === 'self' ? ' on' : '');
    CP.tabLink.className = 'cp-tab' + (k === 'link' ? ' on' : '');
    CP.body.style.display = k === 'self' ? '' : 'none';
    CP.url.style.display = k === 'link' ? '' : 'none';
  }

  function cpMsg(text, bad) {
    CP.msg.textContent = text || '';
    CP.msg.className = bad ? 'cp-err' : 'cp-ok';
    CP.msg.style.display = text ? '' : 'none';
  }

  function loadCpFlairs() {
    var sub = cpSub();
    CP.flair.style.display = 'none';
    CP.ft = {};
    if (!/^[A-Za-z0-9_]{2,21}$/.test(sub)) return;
    getJson('/r/' + encodeURIComponent(sub) + '/api/link_flair_v2.json').then(function (list) {
      if (cpSub() !== sub) return;
      var opts = [el('option', { value: '', text: 'No flair' })];
      (Array.isArray(list) ? list : []).forEach(function (x) {
        if (x && x.id && x.text) { CP.ft[x.id] = String(x.text).trim(); opts.push(el('option', { value: x.id, text: String(x.text).trim() })); }
      });
      if (opts.length > 1) { setKids.apply(null, [CP.flair].concat(opts)); CP.flair.style.display = ''; }
    }, function () { /* no flair list: posting still works if the community does not need one */ });
  }

  function closeCreate() { if (CP.wrap) CP.wrap.style.display = 'none'; }

  function submitCreate() {
    if (CP.go.disabled) return;
    var sub = cpSub();
    var title = String(CP.title.value || '').trim();
    if (!/^[A-Za-z0-9_]{2,21}$/.test(sub)) { cpMsg('Choose a community (letters, numbers and underscores).', true); return; }
    if (!title) { cpMsg('Add a title.', true); return; }
    var f = { kind: CP.kind, sr: sub, title: title, resubmit: 'true', sendreplies: 'true', raw_json: '1' };
    if (CP.kind === 'link') {
      var raw = String(CP.url.value || '').trim();
      var u = /^https?:\/\//i.test(raw) ? safeHref(raw) : '';
      if (!u) { cpMsg('Add a link starting with http:// or https://', true); return; }
      f.url = u;
    } else f.text = String(CP.body.value || '');
    if (CP.nsfw.checked) f.nsfw = 'true';
    if (CP.spoiler.checked) f.spoiler = 'true';
    var fid = String(CP.flair.value || '');
    if (fid) { f.flair_id = fid; if (CP.ft[fid]) f.flair_text = CP.ft[fid]; }
    CP.go.disabled = true;
    CP.go.textContent = 'Posting...';
    cpMsg('', false);
    postApi('/api/submit', f).then(function (j) {
      var data = j && j.json && j.json.data;
      var url = data && data.url ? String(data.url) : '';
      var path = '';
      try { path = url ? new URL(url, location.origin).pathname : ''; } catch (e) { path = ''; }
      CP.path = path;
      CP.postTitle = title;
      CP.openB.style.display = path ? '' : 'none';
      cpMsg(path ? 'Posted.' : 'Posted. Reddit did not send the address back, so check your profile.', false);
      CP.title.value = ''; CP.body.value = ''; CP.url.value = '';
    }, function (e) {
      cpMsg('Not posted: ' + String((e && e.message) || e), true);
    }).then(function () {
      CP.go.disabled = false;
      CP.go.textContent = 'Post';
    });
  }

  function ensureCreate() {
    if (CP.wrap) return;
    CP.sub = el('input', { type: 'text', placeholder: 'community', 'aria-label': 'Community', maxlength: '24', autocomplete: 'off' });
    CP.title = el('input', { type: 'text', placeholder: 'Title', 'aria-label': 'Title', maxlength: '300' });
    CP.body = el('textarea', { placeholder: 'Text (optional)', 'aria-label': 'Post text', maxlength: '40000' });
    CP.url = el('input', { type: 'url', placeholder: 'https://', 'aria-label': 'Link address' });
    CP.nsfw = el('input', { type: 'checkbox' });
    CP.spoiler = el('input', { type: 'checkbox' });
    CP.flair = el('select', { 'aria-label': 'Flair' });
    CP.flair.style.display = 'none';
    CP.msg = el('div', { class: 'cp-err', role: 'alert' });
    CP.msg.style.display = 'none';
    CP.tabSelf = el('button', { class: 'cp-tab on', type: 'button', text: 'Text' });
    CP.tabLink = el('button', { class: 'cp-tab', type: 'button', text: 'Link' });
    CP.tabSelf.addEventListener('click', function () { setCpKind('self'); });
    CP.tabLink.addEventListener('click', function () { setCpKind('link'); });
    CP.go = el('button', { class: 'sg cta', type: 'button', text: 'Post' });
    CP.go.addEventListener('click', submitCreate);
    CP.openB = el('button', { class: 'sg', type: 'button', text: 'Open your post' });
    CP.openB.style.display = 'none';
    CP.openB.addEventListener('click', function () { closeCreate(); openPermalink(CP.path, CP.postTitle); });
    CP.sub.addEventListener('change', loadCpFlairs);
    var full = el('a', { class: 'sg', href: '/submit/', target: '_blank', rel: 'noopener', text: 'Open the full form on Reddit' });
    var dlg = el('div', { class: 'cp-dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Create post' },
      el('div', { class: 'cp-row' }, el('h2', { text: 'Create post' }), el('span', { class: 'sp2' }),
        el('button', { class: 'ib2', type: 'button', 'aria-label': 'Close', onclick: function () { closeCreate(); } }, svg(IC.x))),
      el('div', { class: 'cp-row' }, el('span', { class: 'cp-pre', text: 'r/' }), CP.sub),
      el('div', { class: 'cp-tabs' }, CP.tabSelf, CP.tabLink),
      CP.title, CP.body, CP.url, CP.flair,
      el('div', { class: 'cp-row' }, el('label', { class: 'cp-chk' }, CP.nsfw, 'NSFW'), el('label', { class: 'cp-chk' }, CP.spoiler, 'Spoiler')),
      CP.msg,
      el('div', { class: 'cp-row' }, CP.go, CP.openB, el('span', { class: 'sp2' }), full));
    CP.url.style.display = 'none';
    CP.wrap = el('div', { class: 'cpost' }, el('div', { class: 'cp-scrim', onclick: function () { closeCreate(); } }), dlg);
    CP.wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeCreate(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submitCreate(); }
    });
    own.root.appendChild(CP.wrap);
  }

  function openCreate() {
    ensureCreate();
    var sub = own.sub && !/^(popular|all|home)$/i.test(own.sub) ? own.sub : '';
    if (sub) CP.sub.value = sub;
    CP.wrap.style.display = 'flex';
    cpMsg('', false);
    CP.openB.style.display = 'none';
    loadCpFlairs();
    if (CP.title.focus) CP.title.focus();
  }

  function toggleSugg() {
    var on = !docEl().classList.contains('lbx-sugg');
    docEl().classList.toggle('lbx-sugg', on);
    if (own.sg) own.sg.setAttribute('aria-pressed', String(on));
  }

  function ensureHost(f) {
    if (!own.host) {
      own.host = el('div', { id: 'lbx-feed-host' });
      own.host.style.cssText = 'display:block;width:100%;';
      own.root = own.host.attachShadow({ mode: 'open' });
      adopt(own.root, FEED_CSS + '\n' + HC_CSS);
      own.grid = el('div', { class: 'grid', role: 'list' });
      own.sentinel = el('div', { class: 'sentinel' });
      own.toastEl = el('div', { class: 'toast', role: 'status' });
      own.toastEl.style.display = 'none';
      own.sg = el('button', { class: 'sg', type: 'button', 'aria-pressed': 'false', text: 'Suggested communities' });
      own.sorts = el('nav', { class: 'sorts', 'aria-label': 'Sort posts' });
      own.times = el('nav', { class: 'times', 'aria-label': 'Time range for top posts' });
      own.times.style.display = 'none';
      own.center = el('div', { class: 'ctr' }, own.sorts, own.times);
      own.aboutB = el('button', { class: 'sg', type: 'button', text: 'About and rules' });
      own.flairB = el('button', { class: 'sg', type: 'button', 'aria-haspopup': 'menu', text: 'Flairs' });
      own.fchip = el('a', { class: 'sg fchip' });
      own.fchip.style.display = 'none';
      own.aboutB.addEventListener('click', function () { if (own.sub) openAbout(own.sub); });
      own.flairB.addEventListener('click', function () { if (own.sub) openFlairs(own.sub, own.flairB); });
      own.createB = el('a', { class: 'sg cta', href: '/submit/' }, svg(IC.plus), el('span', { text: 'Create post' }));
      own.createB.addEventListener('click', function (e) {
        if (e.button > 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        if (e.preventDefault) e.preventDefault();
        openCreate();
      });
      own.joinL = el('span', { text: 'Join' });
      own.joinB = el('button', { class: 'sg join', type: 'button', 'aria-pressed': 'false' }, own.joinL);
      own.moreB = el('button', { class: 'sg', type: 'button', 'aria-haspopup': 'menu', 'aria-label': 'More community actions', title: 'More' }, svg(IC.more));
      own.joinB.addEventListener('click', function () { toggleJoin(); });
      own.moreB.addEventListener('click', function () { openCommunityMenu(own.moreB); });
      own.left = el('div', { class: 'bl' }, own.createB, own.aboutB, own.flairB, own.joinB, own.moreB, own.fchip);
      own.bellN = el('span', { class: 'bn' });
      own.bellN.style.display = 'none';
      own.bellB = el('button', { class: 'sg bell', type: 'button', 'aria-label': 'Notifications', title: 'Notifications' }, svg(IC.bell), own.bellN);
      own.bellB.addEventListener('click', function () { toggleNotif(); });
      if (!cfg.notifs) own.bellB.style.display = 'none';
      own.mutedB = el('button', { class: 'sg', type: 'button', 'aria-haspopup': 'menu', text: 'Muted (0)' });
      own.mutedB.style.display = 'none';
      own.mutedB.addEventListener('click', function () { openMutedMenu(own.mutedB); });
      own.br = el('div', { class: 'br' }, own.bellB, own.mutedB, own.sg);
      own.bar = el('div', { class: 'bar' }, own.left, own.center, own.br);
      own.sg.addEventListener('click', toggleSugg);
      own.root.appendChild(own.bar);
      own.root.appendChild(own.grid);
      own.root.appendChild(own.sentinel);
      own.root.appendChild(own.toastEl);
      own.root.addEventListener('click', onOwnClick);
      own.root.addEventListener('keydown', onOwnKey);
      own.hover = hoverAttach(own.root);
      own.root.addEventListener('mouseover', function (e) {
        var c = e.target && e.target.closest ? e.target.closest('.card') : null;
        if (!c) return;
        clearTimeout(own.preT);
        own.preT = setTimeout(function () { prefetch(c); }, 250);
      });
    }
    if (!own.host.isConnected || own.host.parentNode !== f.parentNode) f.parentNode.insertBefore(own.host, f);
    own.host.setAttribute('data-theme', themeNow());
    updateSort();
    updateMutedBtn();
    refreshBell();
  }

  function pokeMore() {
    var f = own.feed;
    if (!f || Date.now() - own.pokeAt < 4000) return;
    var p = f.querySelector('faceplate-partial[slot="load-after"]');
    if (!p) return;
    own.pokeAt = Date.now();
    var n = f.querySelectorAll('shreddit-post').length;
    setTimeout(function () {
      if (f.querySelectorAll('shreddit-post').length > n) return;
      try {
        if (typeof p.load === 'function') { p.load(); log('asked the load-after placeholder to load'); }
        else { p.setAttribute('loading', 'eager'); log('set the load-after placeholder to eager'); }
      } catch (err) { log('load more failed:', err); }
    }, 1500);
  }

  function nearBottom() {
    return own.sentinel && own.sentinel.getBoundingClientRect().top < innerHeight + 1500;
  }

  function watchSentinel() {
    if (own.io || typeof IntersectionObserver !== 'function') return;
    own.io = new IntersectionObserver(function (es) {
      if (es.some(function (x) { return x.isIntersecting; })) pokeMore();
    }, { rootMargin: '1500px 0px' });
    own.io.observe(own.sentinel);
  }

  function scanFeed() {
    if (!cfg.cards) return;
    var f = document.querySelector('shreddit-feed');
    if (f !== own.feed) {
      resetOwn();
      own.feed = f;
      if (f && typeof MutationObserver === 'function') {
        own.mo = new MutationObserver(function () { clearTimeout(own.moT); own.moT = setTimeout(scanFeed, 150); });
        own.mo.observe(f, { childList: true, subtree: true });
      }
    }
    if (!f) { docEl().classList.remove('lbx-wait'); return; }
    if (own.failed && Date.now() - own.failAt < 30000) return;
    var ids = [], seen = {}, els = {};
    Array.prototype.forEach.call(f.querySelectorAll('shreddit-post'), function (p) {
      var id = p.getAttribute('id');
      if (/^t3_[a-z0-9]+$/i.test(id || '') && !seen[id]) { seen[id] = 1; ids.push(id); els[id] = p; }
    });
    if (!ids.length) return;
    if (own.shown.length && ids.indexOf(own.shown[0]) < 0) clearCards();
    ensureHost(f);
    if (own.shown.length && own.grid.querySelectorAll('.card').length !== own.shown.length) {
      setKids(own.grid);
      own.shown.forEach(function (id) { own.grid.appendChild(own.cards[id]); });
      schedRows();
    }
    if (own.busy) return;
    var batch = ids.filter(function (id) { return !own.have[id]; }).slice(0, 60);
    if (!batch.length) { if (own.shown.length && nearBottom()) pokeMore(); return; }
    own.busy = true;
    batch.forEach(function (id) { own.have[id] = 1; });
    enrich(batch).then(function (map) {
      batch.forEach(function (id) {
        var p = map.get(id);
        if (!p) { try { p = domPost(els[id]); } catch (er) { log('card data error:', er); } }
        if (!p || !p.permalink || !p.title) return;
        own.posts.set(id, p);
        own.plToId[p.permalink] = id;
        if (own.voteMap && own.voteMap[id]) p.likes = own.voteMap[id] > 0;
        var c = cardEl(p);
        own.cards[id] = c;
        if (own.savedSet && own.savedSet[id] && !own.touched[id]) own.saved[id] = true;
        own.grid.appendChild(c);
        own.shown.push(id);
      });
      own.busy = false;
      watchRows();
      schedRows();
      if (own.shown.length) {
        own.shown.forEach(function (i) { paintCard(i); });
        loadSaved();
        loadVotes();
        docEl().classList.add('lbx-own');
        docEl().classList.remove('lbx-wait');
        watchSentinel();
      } else docEl().classList.remove('lbx-wait');
      setTimeout(scanFeed, 60);
    }).catch(function (err) {
      own.busy = false;
      own.failed = String((err && err.message) || err);
      own.failAt = Date.now();
      log('own cards unavailable, showing Reddit cards instead:', own.failed);
      batch.forEach(function (id) { delete own.have[id]; });
      clearCards();
      docEl().classList.remove('lbx-wait');
    });
  }

  function cardForPl(pl) {
    var id = own.plToId[pl];
    if (id && own.cards[id]) return own.cards[id];
    return document.querySelector('shreddit-feed shreddit-post[permalink="' + String(pl).replace(/\/+$/, '').replace(/"/g, '\\"') + '"]');
  }

  function titleForPl(pl) {
    var id = own.plToId[pl];
    if (id && own.posts.get(id)) return own.posts.get(id).title;
    var c = document.querySelector('shreddit-feed shreddit-post[permalink="' + String(pl).replace(/\/+$/, '').replace(/"/g, '\\"') + '"]');
    return c ? c.getAttribute('post-title') : null;
  }

  /* ------------------------------------------------------------------ */
  /* Left icon rail                                                      */
  /* ------------------------------------------------------------------ */

  var RAIL_CSS = TOK + [
    ':host{display:block}',
    '@media (max-width:899px){:host{display:none}}',
    '.rail{height:100%;display:flex;flex-direction:column;overflow:hidden;border-right:1px solid var(--line)}',
    '.top{display:flex;align-items:center;padding:8px 14px}',
    '.tg{width:36px;height:36px;border-radius:8px;display:grid;place-items:center;color:var(--muted)}',
    '.tg:hover{background:var(--surface2);color:var(--fg)}',
    '.list{flex:1;overflow-y:auto;overflow-x:hidden;padding:0 10px 16px;scrollbar-width:thin}',
    '.it{display:flex;align-items:center;gap:12px;height:40px;padding:0 8px;border-radius:8px;color:var(--muted);text-decoration:none;white-space:nowrap}',
    '.it:hover{background:var(--surface2);color:var(--fg)}',
    '.it.on{background:var(--accent-bg);color:var(--fg)}',
    '.it .ic{width:22px;height:22px}',
    '.lb{overflow:hidden;text-overflow:ellipsis;min-width:0}',
    '.avi,.avl{width:24px;height:24px;border-radius:50%;flex:none;object-fit:cover}',
    '.avl{display:grid;place-items:center;font-size:11px;font-weight:600;color:#fff}',
    '.sep{height:1px;background:var(--line);margin:8px 6px}',
    'h4{margin:12px 8px 4px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}',
    '.note{padding:8px;font-size:12px;color:var(--muted)}',
    '.collapsed .lb,.collapsed h4,.collapsed .note{display:none}',
    '.collapsed .it{justify-content:center;padding:0}',
    '.collapsed .top{justify-content:center;padding:8px 0}'
  ].join('\n');

  var RAIL_NAV = [
    { t: 'Home', h: '/', d: 'M3 11l9-8 9 8M5 10v10h14V10' },
    { t: 'Popular', h: '/r/popular/', d: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z' },
    { t: 'News', h: '/news/', d: 'M5 4h12v16H5zM8 8h6M8 12h6M8 16h4' },
    { t: 'Explore', h: '/explore/', d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15 9l-2 5-5 2 2-5z' }
  ];

  var rail = { host: null, root: null, wrap: null, list: null, open: !!gm.get('railOpen', false), subs: null, err: '', path: '' };

  function loadSubs() {
    var out = [];
    function page(after, n) {
      var url = '/subreddits/mine/subscriber.json?limit=100&raw_json=1' + (after ? '&after=' + encodeURIComponent(after) : '');
      return fetch(url, { credentials: 'same-origin' }).then(function (r) {
        if (!r.ok) throw new Error('Reddit answered HTTP ' + r.status);
        return r.json();
      }).then(function (j) {
        var d = (j && j.data) || {};
        (d.children || []).forEach(function (c) {
          var x = c.data || {};
          if (!x.display_name) return;
          var icon = x.over18 ? '' : (x.community_icon || x.icon_img || '');
          out.push({ n: x.display_name, u: x.url || ('/r/' + x.display_name + '/'), i: /^https?:/.test(icon) ? icon : '', fav: !!x.user_has_favorited });
        });
        if (d.after && n < 4) return page(d.after, n + 1);
        out.sort(function (a, b) { return (b.fav - a.fav) || (a.n.toLowerCase() < b.n.toLowerCase() ? -1 : 1); });
        log('rail communities:', out.length);
        return out;
      });
    }
    return page('', 0);
  }

  function railItem(icon, label, href, on) {
    return el('a', { class: 'it' + (on ? ' on' : ''), href: href, title: label }, icon, el('span', { class: 'lb', text: label }));
  }

  function railAvatar(s) {
    var letter = el('span', { class: 'avl', text: s.n.charAt(0).toUpperCase() });
    letter.style.background = 'hsl(' + (hashStr(s.n) % 360) + ' 45% 34%)';
    if (!s.i) return letter;
    var img = el('img', { class: 'avi', src: s.i, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', function () { if (img.replaceWith) img.replaceWith(letter); });
    return img;
  }

  function homeHref() {
    return cfg.homeSort && cfg.homeSort !== 'best' ? '/' + cfg.homeSort + '/' : '/';
  }

  function renderRail() {
    if (!rail.list) return;
    var path = location.pathname.toLowerCase();
    rail.path = location.pathname;
    function active(h) { return h === '/' ? path === '/' : path.indexOf(h.toLowerCase().replace(/\/$/, '')) === 0; }
    var kids = RAIL_NAV.map(function (n) {
      if (n.t === 'Home') return railItem(svg(n.d), n.t, homeHref(), /^\/(best|hot|new|top|rising)?\/?$/.test(path));
      return railItem(svg(n.d), n.t, n.h, active(n.h));
    });
    kids.push(el('div', { class: 'sep' }));
    kids.push(el('h4', { text: 'Your communities' }));
    if (rail.subs && rail.subs.length) {
      rail.subs.forEach(function (s) { kids.push(railItem(railAvatar(s), 'r/' + s.n, s.u, active(s.u))); });
    } else if (rail.err) {
      kids.push(el('div', { class: 'note', text: 'Your communities could not be loaded (' + rail.err + ').' }));
    } else {
      kids.push(el('div', { class: 'note', text: 'Loading...' }));
    }
    setKids(rail.list, kids);
    rail.wrap.className = 'rail' + (rail.open ? '' : ' collapsed');
    docEl().style.setProperty('--lbx-rail-w', rail.open ? '232px' : '64px');
  }

  function toggleRail() {
    rail.open = !rail.open;
    gm.set('railOpen', rail.open);
    renderRail();
  }

  function buildRail() {
    rail.host = el('div', { id: 'lbx-rail-host' });
    rail.host.style.cssText = 'position:fixed;left:0;top:56px;bottom:0;width:var(--lbx-rail-w,64px);z-index:3;';
    rail.root = rail.host.attachShadow({ mode: 'open' });
    adopt(rail.root, RAIL_CSS);
    rail.list = el('div', { class: 'list' });
    rail.wrap = el('nav', { class: 'rail', 'aria-label': 'Communities' },
      el('div', { class: 'top' }, el('button', { class: 'tg', type: 'button', 'aria-label': 'Expand or collapse the left menu', onclick: toggleRail }, svg(IC.menu))),
      rail.list);
    rail.root.appendChild(rail.wrap);
    document.body.appendChild(rail.host);
    docEl().classList.add('lbx-rail');
    renderRail();
    loadSubs().then(function (list) { rail.subs = list; renderRail(); }).catch(function (e) {
      rail.err = String((e && e.message) || e);
      log('rail communities failed:', rail.err);
      renderRail();
    });
  }

  function railWanted() {
    return !!document.querySelector('#left-sidebar-container') && !/^\/chat(\/|$)/i.test(location.pathname);
  }

  function ensureRail() {
    if (!cfg.rail || !document.body) return;
    if (!railWanted()) {
      if (rail.host) rail.host.style.display = 'none';
      docEl().classList.remove('lbx-rail');
      return;
    }
    if (!rail.host) buildRail();
    else {
      if (!rail.host.isConnected) document.body.appendChild(rail.host);
      rail.host.style.display = '';
      docEl().classList.add('lbx-rail');
    }
    rail.host.setAttribute('data-theme', themeNow());
    if (rail.path !== location.pathname) renderRail();
  }

  function tick() {
    try {
      if (cfg.rail) ensureRail();
      if (cfg.cards) scanFeed();
      if (host) host.setAttribute('data-theme', themeNow());
    } catch (err) { log('tick error:', err); }
  }

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
      if (S.open || docEl().classList.contains('lbx-own')) return;
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
    if (!S.open) return;
    var ae = root && root.activeElement;
    if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (ae.blur) ae.blur(); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key;
    if (zoomOpen()) {
      if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); closeZoom(); }
      else if (k === 'Tab') { e.preventDefault(); if (ui.zx) ui.zx.focus(); }
      else if (k === 'ArrowRight' || k === 'ArrowLeft' || k === 'j' || k === 'k') { e.stopPropagation(); }
      return;
    }
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
    var sdd = document.querySelector('shreddit-sort-dropdown');
    o.push(T + 'sort dropdown: ' + (sdd ? 'attrs=' + (sdd.getAttributeNames ? sdd.getAttributeNames().join(' ') : '?') + ' text="' + String(sdd.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30) + '" detected=' + detectSort() : 'none'));
    var fp = document.querySelector('shreddit-feed shreddit-post');
    o.push(T + 'first post attributes: ' + (fp && fp.getAttributeNames ? fp.getAttributeNames().join(' ') : 'none') + ' | nsfwFlagged=' + own.shown.filter(function (i) { return own.posts.get(i) && own.posts.get(i).over_18; }).length + ' withImage=' + own.shown.filter(function (i) { return own.posts.get(i) && !!thumbFor(own.posts.get(i)); }).length);
    if (docEl().classList.contains('lbx-comm')) {
      var hd = document.querySelector('#subgrid-container > div');
      o.push(T + 'community header (first div in #subgrid-container):');
      (function walkH(n, dp) { if (!n || dp > 3 || o.length > 400) return; Array.prototype.slice.call(n.children, 0, 6).forEach(function (k) { o.push(T + '  ' + new Array(dp + 1).join(' ') + box(k)); walkH(k, dp + 1); }); })(hd, 0);
    }
    o.push(T + 'own cards shown=' + own.shown.length + ' failed=' + (own.failed || 'no') + ' lastAction=' + ACT.last + ' chat=' + HC.chat + ' font=' + (cfg.font ? FONTST : 'off') + ' extraData=' + (!cfg.extra ? 'off' : own.apiOk >= 0 ? 'ok(' + own.apiOk + ')' : (own.apiDead || 'untried')) + ' html.lbx-own=' + docEl().classList.contains('lbx-own') +
      ' rail=' + (rail.host ? 'built' : 'no') + ' communities=' + (rail.subs ? rail.subs.length : 'n/a') + (rail.err ? ' railError=' + rail.err : '') +
      ' cfg=' + JSON.stringify(cfg));
    o.push(T + 'recent log:');
    LOG.slice(-15).forEach(function (x) { o.push(T + '  ' + x); });
    return o.join('\n');
  }

  /* ------------------------------------------------------------------ */
  /* Start                                                              */
  /* ------------------------------------------------------------------ */

  /* ------------------------------------------------------------------ */
  /* Structure report: a richer, redacted snapshot used to design the    */
  /* next version. Names of attributes only, no post text or usernames.  */
  /* ------------------------------------------------------------------ */

  function structureReport() {
    var T = '[lightbox] ';
    var o = [];
    function add(s) { o.push(T + s); }
    function nm(e) { return e.tagName.toLowerCase() + (e.id ? '#' + String(e.id).slice(0, 24) : ''); }
    function box(e) {
      var r = e.getBoundingClientRect();
      return Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height);
    }
    var SAFE = /^(view-type|post-type|domain|nsfw|is-nsfw|spoiler|is-spoiler|promoted|is-promoted|stickied|is-stickied|locked|archived|item-state|feedindex|is-.*|.*nsfw.*|.*adult.*|.*over.?18.*)$/i;
    function an(e, withVals) {
      return Array.prototype.map.call(e.attributes, function (a) {
        if (a.name === 'class' || a.name === 'style') return '';
        var v = '';
        if (withVals && SAFE.test(a.name)) v = '=' + String(a.value).slice(0, 20);
        else if (a.name === 'slot' || a.name === 'role' || a.name === 'type' || a.name === 'data-testid') v = '=' + String(a.value).slice(0, 24);
        return a.name + v;
      }).filter(Boolean).join(',');
    }
    function sk(e, dp, out, max) {
      if (out.length >= max || dp > 4) return;
      var t = e.tagName.toLowerCase();
      var extra = '';
      if (t === 'img') {
        try {
          var u = new URL(e.currentSrc || e.getAttribute('src') || '', location.href);
          extra = ' src=' + u.hostname + '/' + (u.pathname.split('/')[1] || '');
        } catch (x) { extra = ' src=?'; }
      }
      var kids = e.children.length;
      var a = an(e, false);
      var txt = (!kids && e.textContent && e.textContent.trim()) ? ' text=' + e.textContent.trim().length + 'ch' : '';
      out.push('  '.repeat(dp) + t + (a ? ' [' + a + ']' : '') + extra + txt);
      Array.prototype.slice.call(e.children, 0, 8).forEach(function (c) { sk(c, dp + 1, out, max); });
    }
    function allRoots() {
      var r = [document];
      for (var i = 0; i < r.length; i++) {
        r[i].querySelectorAll('*').forEach(function (e) { if (e.shadowRoot) r.push(e.shadowRoot); });
      }
      return r;
    }
    function upOne(e) { return e.parentElement || (e.getRootNode && e.getRootNode().host) || null; }
    function firstTextHit(re) {
      var roots = allRoots();
      for (var i = 0; i < roots.length; i++) {
        var w = document.createTreeWalker(roots[i], NodeFilter.SHOW_TEXT);
        var n;
        while ((n = w.nextNode())) {
          if (re.test(n.nodeValue.trim()) && n.parentElement && n.parentElement.getClientRects().length) return n.parentElement;
        }
      }
      return null;
    }
    function chainOf(e, max) {
      var out = [];
      var k = 0;
      while (e && e !== document.body && k < max) {
        var cs = getComputedStyle(e);
        var slot = e.getAttribute && e.getAttribute('slot');
        out.push(nm(e) + (slot ? '[slot=' + slot + ']' : '') + ' (' + cs.position + ' ' + box(e) + (e.getRootNode && e.getRootNode() !== document ? ' shadow' : '') + ')');
        e = upOne(e); k++;
      }
      return out;
    }
    function sec(name, fn) {
      try { fn(); } catch (err) { add(name + ' section failed: ' + (err && err.message)); }
    }

    add('structure report, script v' + VERSION + ', viewport ' + innerWidth + 'x' + innerHeight + ', page=' + (location.pathname.length < 2 ? '/' : location.pathname.split('/')[1]) + ', theme=' + themeNow());
    var feed = document.querySelector('shreddit-feed');

    sec('feed', function () {
      if (!feed) { add('no shreddit-feed on this page'); return; }
      var runs = [], last = '', n = 0;
      Array.prototype.forEach.call(feed.children, function (c) {
        var t = c.tagName.toLowerCase();
        if (t === last) n++;
        else { if (last) runs.push(last + 'x' + n); last = t; n = 1; }
      });
      if (last) runs.push(last + 'x' + n);
      add('feed children (' + feed.children.length + '): ' + runs.slice(0, 40).join(' '));
      var first = {};
      Array.prototype.forEach.call(feed.children, function (a) {
        if (a.tagName !== 'ARTICLE') return;
        var c = a.firstElementChild;
        var k = c ? c.tagName.toLowerCase() : '(empty)';
        first[k] = (first[k] || 0) + 1;
      });
      add('article first-child tags: ' + JSON.stringify(first));
      var odd = 0;
      Array.prototype.forEach.call(feed.children, function (c) {
        if (odd >= 4) return;
        if (c.tagName === 'ARTICLE' && c.querySelector('shreddit-post')) return;
        odd++;
        var lines = [];
        sk(c, 0, lines, 14);
        add('non-post feed child #' + odd + ': ' + nm(c) + ' ' + box(c));
        lines.forEach(function (l) { add('  ' + l); });
      });
    });

    sec('labels', function () {
      [[/^suggested communities$/i, 'Suggested communities heading'], [/^community highlights$/i, 'Community highlights heading'], [/^suggested for you$/i, 'Suggested-for-you label']].forEach(function (p) {
        var hit = firstTextHit(p[0]);
        if (!hit) { add(p[1] + ': not found'); return; }
        add(p[1] + ' ancestors: ' + chainOf(hit, 10).map(function (s) { return s.replace(/ \(.*\)$/, ''); }).join(' < '));
      });
    });

    sec('posts', function () {
      var posts = Array.prototype.slice.call(document.querySelectorAll('shreddit-post'));
      var groups = {};
      posts.forEach(function (p) {
        var k = (p.getAttribute('view-type') || '?') + '/' + (p.getAttribute('post-type') || '?');
        (groups[k] = groups[k] || []).push(p);
      });
      var keys = Object.keys(groups);
      add('post groups (view-type/post-type): ' + keys.map(function (k) { return k + 'x' + groups[k].length; }).join(' '));
      keys.slice(0, 6).forEach(function (k) {
        var p = groups[k][0], lines = [];
        add('sample ' + k + ': attrs ' + an(p, true).slice(0, 700));
        add('  size ' + box(p) + ' shadow=' + !!p.shadowRoot);
        sk(p, 0, lines, 12);
        lines.forEach(function (l) { add('  ' + l); });
      });
      var nsfw = posts.filter(function (p) {
        return /nsfw/i.test(p.textContent || '') || Array.prototype.some.call(p.attributes, function (a) { return /nsfw|18/i.test(a.name); });
      })[0];
      if (nsfw) {
        var nl = [];
        add('nsfw-looking post: attrs ' + an(nsfw, true).slice(0, 700));
        sk(nsfw, 0, nl, 12);
        nl.forEach(function (l) { add('  ' + l); });
      } else add('nsfw-looking post: none on this page');
    });

    sec('left nav', function () {
      var pop = firstTextHit(/^popular$/i);
      if (pop) { add('left nav, ancestors of the Popular link:'); chainOf(pop, 14).forEach(function (l) { add('  ' + l); }); }
      else add('left nav: Popular link not found');
      var cand = document.getElementById('left-sidebar-container') || document.querySelector('flex-left-nav-container') || document.querySelector('nav');
      if (cand) add('nav candidate: ' + nm(cand) + ' ' + box(cand) + ' attrs ' + an(cand, false));
      var tg = [];
      allRoots().forEach(function (r) {
        r.querySelectorAll('button').forEach(function (b) {
          var rr = b.getBoundingClientRect();
          var lb = (b.getAttribute('aria-label') || '') + ' ' + (b.id || '');
          if (rr.left < 320 && rr.top < 140 && rr.width > 0 && /nav|menu|sidebar|collapse|expand/i.test(lb)) tg.push(nm(b) + ' ' + box(b) + ' attrs ' + an(b, false) + ' label=' + String(b.getAttribute('aria-label') || '').slice(0, 30));
        });
      });
      add('nav toggle candidates: ' + (tg.length ? tg.length : 'none'));
      tg.slice(0, 4).forEach(function (l) { add('  ' + l); });
    });

    sec('page chrome', function () {
      var main = document.querySelector('main#main-content') || document.querySelector('main');
      if (main) {
        var ct = {};
        main.querySelectorAll('*').forEach(function (e) {
          if (e.tagName.indexOf('-') > 0 && !e.closest('shreddit-feed')) { var t = e.tagName.toLowerCase(); ct[t] = (ct[t] || 0) + 1; }
        });
        add('custom tags in main outside the feed: ' + Object.keys(ct).sort(function (a, b) { return ct[b] - ct[a]; }).slice(0, 30).map(function (t) { return t + 'x' + ct[t]; }).join(' '));
      }
      var rs = document.getElementById('right-sidebar-container');
      add('#right-sidebar-container: ' + (rs ? box(rs) : 'not found'));
    });

    return o.join('\n') + '\n' + diag();
  }

  function init() {
    gm.menu('Layout: ' + (cfg.layout ? 'ON' : 'OFF') + ' (click to switch and reload)', function () { gm.set('layout', !cfg.layout); location.reload(); });
    gm.menu('Lightbox: ' + (cfg.lightbox ? 'ON' : 'OFF') + ' (click to switch and reload)', function () { gm.set('lightbox', !cfg.lightbox); location.reload(); });
    gm.menu('Own cards: ' + (cfg.cards ? 'ON' : 'OFF') + ' (click to switch and reload)', function () { gm.set('cards', !cfg.cards); location.reload(); });
    gm.menu('Home button opens: ' + (cfg.homeSort === 'best' ? 'Reddit default (Best)' : 'Hot') + ' (click to switch and reload)', function () { gm.set('homeSort', cfg.homeSort === 'best' ? 'hot' : 'best'); location.reload(); });
    gm.menu('Notifications dropdown: ' + (cfg.notifs ? 'ON' : 'OFF') + ' (click to switch and reload)', function () { gm.set('notifs', !cfg.notifs); location.reload(); });
    gm.menu('Font Lexend (from this PC): ' + (cfg.font ? 'ON' : 'OFF') + ' (click to switch and reload)', function () { gm.set('font', !cfg.font); location.reload(); });
    gm.menu('Left icon rail: ' + (cfg.rail ? 'ON' : 'OFF') + ' (click to switch and reload)', function () { gm.set('rail', !cfg.rail); location.reload(); });
    gm.menu('Copy diagnostics', function () {
      var t = diag();
      if (gm.copy(t)) console.log('[lightbox] diagnostics copied to the clipboard');
      else console.log(t);
    });
    gm.menu('Copy structure report (for designing the next version)', function () {
      var t = structureReport();
      if (gm.copy(t)) console.log('[lightbox] structure report copied to the clipboard (' + t.split('\n').length + ' lines)');
      else console.log(t);
    });
    if (cfg.font) { docEl().classList.add('lbx-font'); gm.style(FONT_CSS); loadLexend(); }
    if (cfg.layout) gm.style(LAYOUT_CSS);
    if (cfg.cards && cfg.layout) {
      docEl().classList.add('lbx-wait');
      setTimeout(function () { docEl().classList.remove('lbx-wait'); }, 5000);
    }
    if (cfg.cards) {
      useMineCache();
      if (sortInfo(location.pathname)) { loadSaved(); loadVotes(); }
    }
    if (cfg.cards || cfg.rail) {
      (function loop() { tick(); setTimeout(loop, own.shown.length ? 800 : 250); })();
    }
    if (cfg.notifs) document.addEventListener('click', onBellClick, true);
    if (cfg.lightbox) {
      document.addEventListener('click', onClick, true);
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('popstate', function () { if (S.open) close(); });
    }
    log('started v' + VERSION, 'layout=' + cfg.layout, 'lightbox=' + cfg.lightbox);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ago: ago, fmt: fmt, pathOf: pathOf, safeHref: safeHref, hashStr: hashStr, wantsLightbox: wantsLightbox, structureReport: structureReport,
      _test: { build: build, renderPost: renderPost, renderError: renderError, ui: function () { return ui; },
        own: own, rail: rail, S: S, newComment: newComment, postActions: postActions, loadLexend: loadLexend, fontState: function () { return FONTST; }, fontStack: FONT_STACK, fontCss: FONT_CSS, ncss: NCSS, nt: function () { return NT; }, cp: function () { return CP; }, openNotif: openNotif, closeNotif: closeNotif, onBellClick: onBellClick, markAllRead: markAllRead, openPermalink: openPermalink, setMuted: setMuted, isMuted: isMuted, openMutedMenu: openMutedMenu, updateMutedBtn: updateMutedBtn, openCreate: openCreate, submitCreate: submitCreate, ntTitle: ntTitle, ntPostPath: ntPostPath, railWanted: railWanted, hc: function () { return HC; }, homeHref: homeHref, detectSort: detectSort, layoutRows: layoutRows, toggleJoin: toggleJoin, refreshJoin: refreshJoin, openCommunityMenu: openCommunityMenu, scanFeed: scanFeed, domPost: domPost, useMineCache: useMineCache, saveMineCache: saveMineCache, getMe: getMe, loadSaved: loadSaved, loadVotes: loadVotes, markVotes: markVotes, markSaved: markSaved, paintCard: paintCard, openAbout: openAbout, closeAbout: closeAbout, openFlairs: openFlairs, widgetBlocks: widgetBlocks, currentFlair: currentFlair, flairHref: flairHref, doHide: doHide, doSave: doSave, doUnhide: doUnhide, openMenu: openMenu, closeMenu: closeMenu, prefetch: prefetch, ACT: ACT, postApi: postApi, composer: composer, commentNode: commentNode, userAbout: userAbout, redditorFor: redditorFor, updateSort: updateSort, sortInfo: sortInfo, openZoom: openZoom, closeZoom: closeZoom, zoomOpen: zoomOpen, onKey: onKey, toggleSugg: toggleSugg, cardEl: cardEl, thumbFor: thumbFor, snippetOf: snippetOf, ensureRail: ensureRail,
        renderRail: renderRail, toggleRail: toggleRail, setCfg: function (k, v) { cfg[k] = v; }, onOwnClick: onOwnClick, onOwnKey: onOwnKey, loadSubs: loadSubs, step: step, close: close } };
    return;
  }
  try { init(); } catch (err) { log('init failed:', err); }
})();
