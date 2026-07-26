/* Takeover PoC runtime. Host-agnostic: Vercel, Netlify, Cloudflare Pages,
   GitHub Pages, whatever the dangling record points at.

   Renders the evidence straight from the browser so a single screenshot
   proves the hostname, the path and the timestamp — the repo never has to
   be edited per engagement.

   Network activity: exactly one same-origin HEAD to this page's own URL,
   to read back its own response headers as evidence. Nothing is sent
   anywhere, nothing third-party is contacted, no visitor is logged. */

(function () {
  'use strict';

  // ------------------------------------------------------------------
  // IDENTITY — the only thing to change when reusing this template.
  // Everything the page renders (footer, signature, devtools banner,
  // report block, easter egg) is driven from here.
  // Three places stay outside JS reach; see "Use as a template" in the
  // README: the <pre class="banner"> ASCII art, <meta name="author">,
  // and the X-PoC-* values in vercel.json / _headers.
  // ------------------------------------------------------------------
  var CONFIG = {
    handle: 'pablodlz',
    contact: 'pablogalerani@gmail.com',
    profile: 'https://github.com/pablodlz',
    repo: 'https://github.com/pablodlz/subdomain-takeover-poc'
  };

  var host = location.hostname || '(file://)';
  var url = location.href;
  var path = (location.pathname || '/') + (location.search || '');
  var now = new Date();
  var stamp = now.toISOString().replace(/\.\d{3}Z$/, 'Z');

  // a path other than "/" proves control of the whole namespace, whether we
  // got here via a catch-all rewrite (Vercel/Netlify) or via 404.html.
  var root = document.querySelector('.term');
  var deepPath = (root && root.getAttribute('data-notfound') === '1') ||
    (location.pathname !== '/' && location.pathname !== '/index.html');

  // filled in asynchronously by readOwnHeaders()
  var UNKNOWN_SERVICE = 'an unclaimed third-party hosting origin';
  var service = UNKNOWN_SERVICE;
  var headerDump = '(not read yet)';

  // ------------------------------------------------------------------
  // deterministic evidence id: same host + same day => same id.
  // lets a triager re-run the PoC and match it to the report.
  // ------------------------------------------------------------------
  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
    }
    return h;
  }

  function hex4(n) {
    return ('0000' + n.toString(16).toUpperCase()).slice(-4);
  }

  var day = stamp.slice(0, 10);
  var seed = host + '|' + day + '|' + CONFIG.handle;
  var fingerprint =
    CONFIG.handle.slice(0, 4).toUpperCase() + '-' +
    hex4(fnv1a(seed) & 0xffff) + '-' +
    hex4(fnv1a(seed + '#2') & 0xffff);

  // apex-ish label for the cookie-scope line (display only, not a PSL lookup).
  // IP literals have no apex, so they are used verbatim.
  var labels = host.split('.');
  var isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.indexOf(':') !== -1;
  var apex = (!isIp && labels.length > 2) ? labels.slice(-2).join('.') : host;

  function set(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  // ------------------------------------------------------------------
  // read this page's own response headers back off the wire.
  // same-origin, so every header is exposed — including the platform
  // fingerprint that proves the response came from a third party.
  // ------------------------------------------------------------------
  // Platform fingerprints, most specific first. `match` is an optional regex
  // on the header value, for platforms that only differ by value.
  // Add a row when you meet a host that isn't recognised — that is the only
  // part of this file that is ever platform-specific.
  var PLATFORMS = [
    { header: 'x-vercel-id', name: 'Vercel' },
    { header: 'x-nf-request-id', name: 'Netlify' },
    { header: 'x-github-request-id', name: 'GitHub Pages' },
    { header: 'x-render-origin-server', name: 'Render' },
    { header: 'x-pantheon-styx-hostname', name: 'Pantheon' },
    { header: 'x-shopid', name: 'Shopify' },
    { header: 'fly-request-id', name: 'Fly.io' },
    { header: 'x-amz-request-id', name: 'AWS S3 / CloudFront' },
    { header: 'x-amz-id-2', name: 'AWS S3 / CloudFront' },
    { header: 'x-ms-request-id', name: 'Azure' },
    { header: 'server', match: /vegur/i, name: 'Heroku' },
    { header: 'via', match: /vegur/i, name: 'Heroku' },
    { header: 'server', match: /surge/i, name: 'Surge.sh' },
    { header: 'server', match: /squarespace/i, name: 'Squarespace' },
    { header: 'server', match: /^Google Frontend/i, name: 'Google Cloud / Firebase Hosting' },
    { header: 'server', match: /cloudflare/i, name: 'Cloudflare' },
    { header: 'cf-ray', name: 'Cloudflare' },
    { header: 'x-served-by', name: 'Fastly-fronted origin' }
  ];

  // Headers worth printing as evidence: platform fingerprints, cache and
  // robots policy, and our own trail headers where the platform allows them.
  var SHOW = [
    'server', 'via', 'x-served-by', 'x-cache',
    'x-vercel-id', 'x-vercel-cache', 'x-nf-request-id', 'x-github-request-id',
    'x-render-origin-server', 'x-pantheon-styx-hostname', 'x-shopid',
    'fly-request-id', 'x-amz-request-id', 'x-amz-id-2', 'x-ms-request-id',
    'cf-ray', 'x-cloud-trace-context',
    'content-type', 'cache-control', 'x-robots-tag',
    'strict-transport-security',
    'x-poc-researcher', 'x-poc-contact', 'x-poc-notice'
  ];

  function renderHeaders(res) {
    var found = [];
    SHOW.forEach(function (name) {
      var v = res.headers.get(name);
      if (v) found.push([name, v]);
    });

    for (var i = 0; i < PLATFORMS.length; i++) {
      var v = res.headers.get(PLATFORMS[i].header);
      if (v && (!PLATFORMS[i].match || PLATFORMS[i].match.test(v))) {
        service = PLATFORMS[i].name;
        break;
      }
    }

    // unrecognised platform: name it by its own Server header rather than
    // falling back to a vague label.
    if (service === UNKNOWN_SERVICE) {
      var srv = res.headers.get('server');
      if (srv) service = 'the origin behind "' + srv + '"';
    }

    var pad = 0;
    found.forEach(function (r) { pad = Math.max(pad, r[0].length); });

    var lines = ['HTTP ' + res.status + (res.statusText ? ' ' + res.statusText : '')];
    found.forEach(function (r) {
      lines.push(r[0] + new Array(pad - r[0].length + 2).join(' ') + ' : ' + r[1]);
    });
    if (!found.length) lines.push('(no headers exposed to script)');

    headerDump = lines.join('\n');
    set('headers', headerDump);
    set('e-origin', service + ' — project controlled by @' + CONFIG.handle);

    var st = res.headers.get('strict-transport-security');
    var warn = document.getElementById('hsts-warn');
    if (warn && st) warn.hidden = false;
  }

  function readOwnHeaders() {
    if (!window.fetch) {
      headerDump = '(fetch unavailable in this browser)';
      set('headers', headerDump);
      return;
    }
    fetch(url, { method: 'HEAD', cache: 'no-store' })
      .then(renderHeaders)
      .catch(function () {
        return fetch(url, { method: 'GET', cache: 'no-store' }).then(renderHeaders);
      })
      .catch(function () {
        headerDump = '(could not read own headers — run `curl -sI ' + url + '` instead)';
        set('headers', headerDump);
      });
  }

  // ------------------------------------------------------------------
  // boot sequence
  // ------------------------------------------------------------------
  var log = document.getElementById('boot-log');

  var script = [
    { t: 'dig +short ' + host, d: 260 },
    { t: '-> record resolves to a third-party origin nobody claimed', c: 'out', d: 220 },
    { t: 'curl -sI https://' + host + '/', d: 300 },
    { t: '-> 404 / "project not found" from the hosting platform', c: 'out', d: 220 },
    { t: 'claim ' + host, d: 340 },
    { t: '-> origin claimed. dangling record now points at me.', c: 'hit', d: 380 }
  ];

  if (deepPath) {
    script.push({ t: 'curl -s https://' + host + path, d: 240 });
    script.push({ t: '-> arbitrary path served, HTTP 200: ' + path, c: 'hit', d: 320 });
  }

  var reduce = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function reveal() {
    ['verdict', 'evidence', 'impact', 'foot'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = false;
    });
  }

  function typeLine(i) {
    if (i >= script.length) {
      var last = log.lastElementChild;
      if (last) last.classList.add('cursor');
      reveal();
      return;
    }
    var step = script[i];
    var li = document.createElement('li');
    if (step.c) li.className = step.c;
    li.textContent = step.t;
    log.appendChild(li);
    setTimeout(function () { typeLine(i + 1); }, reduce ? 0 : step.d);
  }

  if (log) {
    if (reduce) {
      script.forEach(function (step) {
        var li = document.createElement('li');
        if (step.c) li.className = step.c;
        li.textContent = step.t;
        log.appendChild(li);
      });
      reveal();
    } else {
      typeLine(0);
    }
  }

  // ------------------------------------------------------------------
  // evidence fields
  // ------------------------------------------------------------------
  set('e-host', host);
  set('e-url', url);
  set('e-path', path + (deepPath ? '  (unmapped path, served anyway)' : ''));
  set('e-scheme', location.protocol.replace(':', '') +
    (location.protocol === 'https:' ? '  (valid cert issued to the hijacked host)' : ''));
  set('e-time', stamp);
  set('e-origin', service + ' — controlled by @' + CONFIG.handle);
  set('e-who', '@' + CONFIG.handle + '  <' + CONFIG.contact + '>');
  set('e-fp', fingerprint);
  set('sig-line', CONFIG.handle + ' was here — ' + stamp + ' — ' + fingerprint);

  var apexEl = document.querySelector('.apex');
  if (apexEl) apexEl.textContent = apex;

  // footer identity, driven from CONFIG so the template has one source of truth
  var profileEl = document.getElementById('f-profile');
  if (profileEl) {
    profileEl.href = CONFIG.profile;
    profileEl.textContent = CONFIG.profile.replace(/^https?:\/\//, '');
  }
  var mailEl = document.getElementById('f-mail');
  if (mailEl) {
    mailEl.href = 'mailto:' + CONFIG.contact;
    mailEl.textContent = CONFIG.contact;
  }
  // the one link a confused domain owner actually needs
  var secEl = document.getElementById('f-security');
  if (secEl) secEl.href = CONFIG.repo + '/blob/main/SECURITY.md';

  readOwnHeaders();

  // ------------------------------------------------------------------
  // copy-ready report block
  // ------------------------------------------------------------------
  function reportMarkdown() {
    return [
      '## Subdomain Takeover — Proof of Concept',
      '',
      '| field | value |',
      '| --- | --- |',
      '| Vulnerable host | `' + host + '` |',
      '| URL served | ' + url + ' |',
      '| Path requested | `' + path + '`' + (deepPath ? ' (unmapped, served anyway)' : '') + ' |',
      '| Third-party origin | ' + service + ', under my control |',
      '| PoC source | ' + CONFIG.repo + ' |',
      '| Captured (UTC) | ' + stamp + ' |',
      '| Evidence ID | `' + fingerprint + '` |',
      '| Researcher | @' + CONFIG.handle + ' (' + CONFIG.contact + ') |',
      '',
      '### Summary',
      'The DNS record for `' + host + '` points at a hosting origin that ' + apex + ' never',
      'claimed. I claimed it, so traffic to this hostname is now served from content I',
      'control — with a valid TLS certificate issued to your name.',
      '',
      '### Steps to reproduce',
      '1. `dig +short ' + host + '` — the record points at a third-party platform.',
      '2. `curl -sI https://' + host + '/` — note the platform fingerprint in the headers.',
      '3. Browse `https://' + host + '/` — the PoC page is served over TLS on your hostname.',
      '4. Any path resolves to the same origin, e.g. `https://' + host + '/admin/login`.',
      '',
      '### Response headers observed',
      '```',
      headerDump,
      '```',
      '',
      '### Impact',
      'Phishing on a trusted hostname, cookie read/write within `*.' + apex + '` scope,',
      'CSP/CORS allowlist bypass, abuse of domain-validated flows (TLS issuance, OAuth',
      'redirect allowlists), and brand/reputation damage. I also control the response',
      'headers on this hostname.',
      '',
      '### Remediation',
      'Remove the dangling DNS record, or reclaim the resource on ' + service + '.',
      'Remove the record first — the origin becomes claimable again the moment I release it.',
      '',
      '### Note',
      'Good-faith test. No data collected, no traffic intercepted, no visitors logged.',
      'The PoC is served with `Cache-Control: no-store` and `X-Robots-Tag: noindex`, and is',
      'taken down as soon as the record is fixed.'
    ].join('\n');
  }

  var copyBtn = document.getElementById('copy-md');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var text = reportMarkdown();
      var done = function () {
        copyBtn.classList.add('done');
        copyBtn.textContent = 'copied to clipboard';
        setTimeout(function () {
          copyBtn.classList.remove('done');
          copyBtn.textContent = 'copy report block';
        }, 2200);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else {
        fallback();
      }
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { /* noop */ }
        document.body.removeChild(ta);
      }
    });
  }

  // ------------------------------------------------------------------
  // verbose recon panel
  // ------------------------------------------------------------------
  function verboseDump() {
    var nav = window.navigator || {};
    var rows = [
      ['location.href', url],
      ['location.origin', location.origin],
      ['location.hostname', host],
      ['location.protocol', location.protocol],
      ['location.port', location.port || '(default)'],
      ['document.domain', document.domain],
      ['document.referrer', document.referrer || '(none)'],
      ['document.cookie', document.cookie ? '(' + document.cookie.split(';').length + ' cookie(s) readable on this host)' : '(none readable)'],
      ['localStorage', (function () { try { return 'accessible for ' + location.origin; } catch (e) { return 'blocked'; } })()],
      ['isSecureContext', String(window.isSecureContext)],
      ['captured (utc)', stamp],
      ['captured (local)', now.toString()],
      ['timezone', (Intl.DateTimeFormat().resolvedOptions() || {}).timeZone || '(unknown)'],
      ['evidence id', fingerprint],
      ['served by', service],
      ['poc source', CONFIG.repo],
      ['researcher', '@' + CONFIG.handle],
      ['user agent', nav.userAgent || '(unknown)']
    ];
    var pad = 0;
    rows.forEach(function (r) { pad = Math.max(pad, r[0].length); });
    return rows.map(function (r) {
      return r[0] + new Array(pad - r[0].length + 2).join(' ') + ' : ' + r[1];
    }).join('\n');
  }

  var vBtn = document.getElementById('toggle-verbose');
  var vPre = document.getElementById('verbose');
  if (vBtn && vPre) {
    vBtn.addEventListener('click', function () {
      var open = vPre.hidden;
      vPre.hidden = !open;
      vBtn.setAttribute('aria-expanded', String(open));
      vBtn.textContent = open ? 'hide recon' : 'verbose recon';
      if (open) vPre.textContent = verboseDump();
    });
  }

  // ------------------------------------------------------------------
  // trail: signature in devtools, for whoever goes looking
  // ------------------------------------------------------------------
  try {
    console.log(
      '%c ' + CONFIG.handle + ' was here. ',
      'background:#05080a;color:#7dfab0;font:bold 14px monospace;padding:6px 10px;border:1px solid #7dfab0'
    );
    console.log(
      '%c' + [
        '',
        '  host        ' + host,
        '  evidence    ' + fingerprint,
        '  captured    ' + stamp,
        '  contact     ' + CONFIG.contact,
        '',
        '  Authorized bug bounty PoC. Nothing here is collected or exfiltrated.',
        '  Fix: delete the dangling DNS record, then ping me to tear this down.',
        ''
      ].join('\n'),
      'color:#3f8a63;font:12px monospace'
    );
  } catch (e) { /* noop */ }

  // easter egg: type the handle anywhere
  var buf = '';
  document.addEventListener('keydown', function (ev) {
    if (ev.key && ev.key.length === 1) {
      buf = (buf + ev.key.toLowerCase()).slice(-CONFIG.handle.length);
      if (buf === CONFIG.handle) {
        var banner = document.querySelector('.banner');
        banner.classList.add('glitch');
        if (vPre && vPre.hidden && vBtn) vBtn.click();
        setTimeout(function () { banner.classList.remove('glitch'); }, 1400);
      }
    }
  });
})();
