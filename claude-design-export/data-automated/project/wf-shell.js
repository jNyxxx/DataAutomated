/* ============================================================
   wf-shell.js — shared chrome + sketch helpers
   Exposes: WF.sidebar, WF.topbar, WF.sketch*, WF.badge, etc.
   ============================================================ */
(function () {
  const WF = (window.WF = window.WF || {});

  /* ---------- tiny helpers ---------- */
  WF.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // deterministic jitter so "hand-drawn" lines look consistent across renders
  function jit(seed) { let x = Math.sin(seed * 99.13) * 9999; return (x - Math.floor(x)) - 0.5; }

  /* ---------- sidebar ---------- */
  const NAV = [
    { id: 'dashboard',   ic: '◧', label: 'Dashboard',          group: 'Overview' },
    { id: 'voc',         ic: '◑', label: 'Voice of Customer',  stream: 'voc',  group: 'Intelligence' },
    { id: 'competitive', ic: '◮', label: 'Competitive Signals',stream: 'comp', cnt: 3, group: 'Intelligence' },
    { id: 'journey',     ic: '◔', label: 'Journey Intelligence',stream: 'jrn', group: 'Intelligence' },
    { id: 'reports',     ic: '▤', label: 'Reports',            group: 'Workspace' },
    { id: 'settings',    ic: '⚙', label: 'Settings & Sources', group: 'Workspace' },
  ];

  WF.sidebar = function (active) {
    let groups = [], seen = {};
    NAV.forEach((n) => { if (!seen[n.group]) { seen[n.group] = []; groups.push(n.group); } seen[n.group].push(n); });
    const navHtml = groups.map((g) => `
      <div class="nav-group">${g}</div>
      <div class="nav">
        ${seen[g].map((n) => `
          <a class="${n.id === active ? 'active' : ''}" data-screen="${n.id}" ${n.soft ? 'style="opacity:.55"' : ''}>
            <span class="ic">${n.ic}</span>
            <span>${n.label}</span>
            ${n.cnt ? `<span class="cnt">${n.cnt}</span>` : (n.stream ? `<span class="stream-dot" style="background:var(--${n.stream})"></span>` : '')}
          </a>`).join('')}
      </div>`).join('');

    return `
    <aside class="side">
      <div class="logo">Data<span class="dot">●</span>Automated</div>
      <div class="tenant" title="Switch tenant / workspace">
        <span class="av">A</span>
        <span class="who"><b>Acme SaaS Inc.</b><span>workspace</span></span>
        <span class="car">⌄</span>
      </div>
      ${navHtml}
      <div class="plan">Plan · <b>Intelligence Core</b><br><span style="font-size:11px">All 3 services · weekly briefings</span></div>
    </aside>`;
  };

  /* ---------- top bar ---------- */
  WF.topbar = function (title, crumb, opts = {}) {
    return `
    <div class="topbar">
      <div>
        <h1>${title}</h1>
        <div class="crumb">${crumb || 'Acme SaaS Inc. · all data live'}</div>
      </div>
      <div class="spacer"></div>
      <div class="searchbar">⌕ <span>Search insights, signals…</span></div>
      ${opts.noRange ? '' : '<div class="chip">📅 Last 30 days <span class="car">⌄</span></div>'}
      <div class="health" title="Source health — click to manage">
        <span class="bars">
          <span class="b"></span><span class="b"></span><span class="b"></span>
          <span class="b"></span><span class="b stale"></span><span class="b err"></span><span class="b"></span>
        </span>
        <span>5 / 7 healthy</span>
      </div>
      <div class="iconbtn" title="Notifications">🔔<span class="pip"></span></div>
      <div class="iconbtn" title="Account">A</div>
    </div>`;
  };

  /* ---------- badges / tags ---------- */
  WF.badge = (txt, kind) => `<span class="badge ${kind || ''}">${txt}</span>`;
  WF.streamTag = (s, label) => `<span class="stream-tag ${s}">${label || ({ voc: 'VoC', comp: 'Competitive', jrn: 'Journey', sys: 'System' }[s])}</span>`;

  /* ---------- SKETCH CHARTS (simple shapes only) ---------- */

  // rough line / area chart
  WF.sketchLine = function (vals, opts = {}) {
    const w = opts.w || 320, h = opts.h || 110, pad = 16;
    const max = Math.max(...vals) * 1.12, min = Math.min(...vals, 0);
    const n = vals.length;
    const X = (i) => pad + (i * (w - pad * 2)) / (n - 1);
    const Y = (v) => h - pad - ((v - min) / (max - min)) * (h - pad * 2);
    const pts = vals.map((v, i) => [X(i) + jit(i + 1) * 2, Y(v) + jit(i + 7) * 2]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = line + ` L${(w - pad).toFixed(1)} ${h - pad} L${pad} ${h - pad} Z`;
    const cls = opts.stream || 'voc';
    const grid = opts.grid === false ? '' : [0.33, 0.66].map((g) => `<line class="grid" x1="${pad}" y1="${pad + g * (h - 2 * pad)}" x2="${w - pad}" y2="${pad + g * (h - 2 * pad)}"/>`).join('');
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="height:${h}px">
      ${grid}
      ${opts.area !== false ? `<path class="area ${cls}" d="${area}"/>` : ''}
      <path class="line ${cls}" d="${line}"/>
      <line class="axis" x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}"/>
      ${opts.dot !== false ? `<circle class="dot" cx="${pts[n - 1][0]}" cy="${pts[n - 1][1]}" r="4" style="stroke:var(--${cls})"/>` : ''}
    </svg>`;
  };

  // sparkline (no axis)
  WF.spark = function (vals, stream) {
    const w = 120, h = 30;
    const max = Math.max(...vals), min = Math.min(...vals);
    const X = (i) => (i * w) / (vals.length - 1);
    const Y = (v) => h - 3 - ((v - min) / (max - min || 1)) * (h - 6);
    const d = vals.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
    return `<svg class="chart spark" viewBox="0 0 ${w} ${h}" style="height:${h}px;width:${w}px"><path class="line ${stream || 'sys'}" style="stroke-width:2" d="${d}"/></svg>`;
  };

  // bar chart
  WF.sketchBars = function (data, opts = {}) {
    const w = opts.w || 320, h = opts.h || 120, pad = 18;
    const max = Math.max(...data.map((d) => d.v)) * 1.1;
    const bw = (w - pad * 2) / data.length;
    const cls = opts.stream || 'jrn';
    const bars = data.map((d, i) => {
      const bh = (d.v / max) * (h - pad * 2);
      const x = pad + i * bw + bw * 0.16, y = h - pad - bh, ww = bw * 0.68;
      return `<rect class="bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${ww.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" style="fill:var(--${cls}-wash)"/>
        <text class="lab" x="${(x + ww / 2).toFixed(1)}" y="${h - 5}" text-anchor="middle">${d.l}</text>`;
    }).join('');
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" style="height:${h}px">
      <line class="axis" x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}"/>${bars}</svg>`;
  };

  // half-circle gauge (0..1)
  WF.gauge = function (val, stream) {
    const r = 46, cx = 56, cy = 56, circ = Math.PI * r;
    const off = circ * (1 - val);
    const cls = stream || 'comp';
    return `<svg viewBox="0 0 112 64" style="width:112px;height:64px" class="chart">
      <path d="M10 56 A46 46 0 0 1 102 56" fill="none" stroke="var(--fill-2)" stroke-width="10" stroke-linecap="round"/>
      <path d="M10 56 A46 46 0 0 1 102 56" fill="none" stroke="var(--${cls})" stroke-width="10" stroke-linecap="round"
        stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/>
    </svg>`;
  };

  // donut sentiment split
  WF.donut = function (segs) { // segs:[{v,stream}]
    const total = segs.reduce((a, s) => a + s.v, 0);
    let acc = 0, r = 38, c = 2 * Math.PI * r, cx = 50, cy = 50;
    const arcs = segs.map((s) => {
      const frac = s.v / total, dash = frac * c;
      const el = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--${s.stream})" stroke-width="16"
        stroke-dasharray="${dash.toFixed(1)} ${(c - dash).toFixed(1)}" stroke-dashoffset="${(-acc).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>`;
      acc += dash; return el;
    }).join('');
    return `<svg viewBox="0 0 100 100" style="width:96px;height:96px" class="chart">${arcs}</svg>`;
  };

  /* ---------- skeleton block ---------- */
  WF.skel = (w, h) => `<div class="skel" style="width:${w};height:${h || '12px'}"></div>`;

  /* ---------- sketch chart placeholder w/ caption ---------- */
  WF.placeholder = (label, h) => `<div style="height:${h || 120}px;border:1.5px dashed var(--line-soft);border-radius:10px;
    display:grid;place-items:center;color:var(--ink-faint);background:repeating-linear-gradient(45deg,transparent,transparent 7px,var(--fill-3) 7px,var(--fill-3) 14px);font-size:12px">${label}</div>`;
})();
