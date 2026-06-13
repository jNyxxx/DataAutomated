/* ============================================================
   wf-dashboard.js — 4 distinct dashboard layout approaches
   WF.dashboard(variant)  variant: 'A' | 'B' | 'C' | 'D'
   ============================================================ */
(function () {
  const WF = window.WF;
  const { badge, streamTag, sketchLine, sketchBars, gauge, spark } = WF;

  /* ---------------- shared mock data (isolated so API can replace) ---------------- */
  const DATA = {
    kpis: [
      { lab: 'VoC Sentiment', stream: 'voc', val: '+0.42', delta: '▲ 0.08 vs last wk', dir: 'up', spark: [3, 4, 3, 5, 4, 6, 6, 7] },
      { lab: 'Churn Risk', stream: 'voc', val: '18%', delta: '▲ 4 pts — watch', dir: 'dn', spark: [2, 2, 3, 3, 4, 5, 6, 7] },
      { lab: 'New Signals (48h)', stream: 'comp', val: '12', delta: '3 critical', dir: 'dn', spark: [4, 3, 5, 4, 6, 5, 7, 9] },
      { lab: 'Top Funnel Drop', stream: 'jrn', val: '54%', delta: 'Checkout step', dir: 'dn', spark: [6, 6, 7, 6, 8, 7, 8, 9] },
      { lab: 'Agent Runs (24h)', stream: 'sys', val: '38', delta: 'all healthy', dir: 'up', spark: [5, 6, 5, 7, 6, 7, 8, 8] },
    ],
    attention: [
      { stream: 'voc',  urg: 'crit', ttl: 'Churn risk on Growth cohort jumped to 28%', meta: ['VoC · Churn Early Warning', 'driver: pricing confusion', '14m ago'] },
      { stream: 'comp', urg: 'crit', ttl: 'Rival "Northbeam" cut Pro pricing 30%', meta: ['Competitive · pricing', 'source: pricing page', '1h ago'] },
      { stream: 'jrn',  urg: 'high', ttl: 'Checkout step drop-off spiked to 54% on mobile', meta: ['Journey · ux_friction', 'projected lift +9%', '2h ago'] },
      { stream: 'comp', urg: 'high', ttl: '"Northbeam" posted 6 enterprise AE roles', meta: ['Competitive · hiring', 'source: LinkedIn', '5h ago'] },
      { stream: 'voc',  urg: 'med',  ttl: 'Rising theme: onboarding setup time (42 mentions)', meta: ['VoC · theme', 'sentiment −0.3', '8h ago'] },
    ],
    signals: [
      { urg: 'crit', ttl: 'Northbeam cut Pro tier 30%', meta: ['pricing', 'pricing page', '1h ago'] },
      { urg: 'high', ttl: 'Northbeam: 6 enterprise AE openings', meta: ['hiring', 'LinkedIn', '5h ago'] },
      { urg: 'med',  ttl: 'Loop.io shipped AI summary feature', meta: ['product', 'changelog', '1d ago'] },
      { urg: 'low',  ttl: 'G2 rating for Loop.io ticked to 4.6', meta: ['reviews', 'G2', '2d ago'] },
    ],
    themes: [
      { nm: 'Pricing clarity', ct: 64, pct: 100, urg: 'high' },
      { nm: 'Onboarding time', ct: 42, pct: 66, urg: 'med' },
      { nm: 'Mobile bugs', ct: 31, pct: 48, urg: 'high' },
      { nm: 'Reporting depth', ct: 22, pct: 34, urg: 'low' },
    ],
    funnel: [
      { l: 'Landing', v: 100, drop: '' },
      { l: 'Sign-up', v: 72, drop: '−28%' },
      { l: 'Activation', v: 58, drop: '−19%' },
      { l: 'Checkout', v: 27, drop: '−54%' },
    ],
    agents: [
      { nm: 'VoC Agent', stream: 'voc', st: 'ok', t: 'ran 12m ago · 60s · 480 items' },
      { nm: 'Competitive Signal Agent', stream: 'comp', st: 'sync', t: 'running now · mining G2 + news' },
      { nm: 'Journey Agent', stream: 'jrn', st: 'ok', t: 'ran 1h ago · 38s' },
    ],
    sources: [
      { nm: 'Zendesk', st: 'ok', t: 'synced 6m ago' },
      { nm: 'Typeform', st: 'ok', t: 'synced 22m ago' },
      { nm: 'Intercom', st: 'stale', t: 'last sync 3d ago' },
      { nm: 'News API', st: 'ok', t: 'synced 8m ago' },
      { nm: 'Mixpanel', st: 'err', t: 'auth expired' },
      { nm: 'G2 scraper', st: 'ok', t: 'synced 1h ago' },
      { nm: 'Segment', st: 'off', t: 'not connected' },
    ],
  };

  /* ---------------- reusable blocks ---------------- */
  function kpiRow() {
    return `<div class="kpi-row">${DATA.kpis.map((k) => `
      <div class="kpi">
        <div class="lab"><span class="d ${k.stream}"></span>${k.lab}</div>
        <div class="val">${k.val}</div>
        <div class="delta ${k.dir}">${k.delta}</div>
        <div class="spark">${spark(k.spark, k.stream)}</div>
      </div>`).join('')}</div>`;
  }

  function attnFeed(limit) {
    const items = DATA.attention.slice(0, limit || DATA.attention.length);
    return `<div class="feed">${items.map((a) => `
      <div class="row-item ${a.urg === 'crit' ? 'crit' : ''}">
        <div class="body">
          <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:3px">
            ${streamTag(a.stream)} ${badge(a.urg.toUpperCase(), a.urg)}
          </div>
          <div class="ttl">${a.ttl}</div>
          <div class="meta-line">${a.meta.map((m) => `<span>${m}</span>`).join('<span>·</span>')}</div>
        </div>
        <span class="car">›</span>
      </div>`).join('')}</div>`;
  }

  function vocSnapshot() {
    return `<div class="panel edge-voc">
      <div class="panel-h">${streamTag('voc')}<h3>Voice of Customer</h3><span class="spacer"></span><span class="act">Open</span></div>
      <div class="mini" style="margin-bottom:4px">Sentiment trend · 30d</div>
      ${sketchLine([2, 3, 2, 4, 3, 5, 4, 6, 5, 7], { stream: 'voc', h: 88 })}
      <div class="kv"><span>Churn risk</span><b>18% ▲</b></div>
      <div class="kv"><span>Urgent unresolved themes</span><b>3</b></div>
      <div class="note inl">VoC snapshot: latest sentiment, churn score & top urgent themes.</div>
      <div style="margin-top:8px">${DATA.themes.slice(0, 3).map((t) => themeBar(t)).join('')}</div>
    </div>`;
  }

  function compSnapshot() {
    return `<div class="panel edge-comp">
      <div class="panel-h">${streamTag('comp')}<h3>Competitive Signals</h3><span class="spacer"></span><span class="act">Open</span></div>
      <div class="mini" style="margin-bottom:8px">Latest signals · by urgency</div>
      <div class="feed">${DATA.signals.slice(0, 3).map((s) => `
        <div class="row-item ${s.urg === 'crit' ? 'crit' : ''}" style="padding:8px 10px">
          <div class="body"><div style="display:flex;gap:6px;margin-bottom:2px">${badge(s.urg.toUpperCase(), s.urg)}<span class="mini">${s.meta[0]}</span></div>
          <div class="ttl" style="font-size:13.5px">${s.ttl}</div>
          <div class="meta-line">${s.meta[1]} · ${s.meta[2]}</div></div></div>`).join('')}</div>
      <div class="note inl">Competitive snapshot: newest signals, critical ones flagged red.</div>
    </div>`;
  }

  function jrnSnapshot() {
    return `<div class="panel edge-jrn">
      <div class="panel-h">${streamTag('jrn')}<h3>Journey Intelligence</h3><span class="spacer"></span><span class="act">Open</span></div>
      <div class="mini" style="margin-bottom:8px">Activation funnel · drop-off by step</div>
      ${miniFunnel()}
      <div class="kv" style="margin-top:8px"><span>Top friction point</span><b style="color:var(--crit)">Checkout · mobile</b></div>
      <div class="kv"><span>Recommended fix lift</span><b>+9%</b></div>
      <div class="note inl">Journey snapshot: funnel drop-off + the single biggest friction point.</div>
    </div>`;
  }

  function themeBar(t) {
    return `<div class="theme"><span class="nm">${t.nm} ${badge(t.urg, t.urg)}</span>
      <span class="track"><span class="fill" style="width:${t.pct}%"></span></span><span class="ct">${t.ct}</span></div>`;
  }

  function miniFunnel() {
    const max = 100;
    return `<div class="funnel">${DATA.funnel.map((f) => `
      <div class="fstep"><span class="fl">${f.l}</span>
        <span class="fbar-wrap"><span class="fbar" style="width:${(f.v / max) * 100}%">${f.v}%</span></span>
        <span class="drop">${f.drop}</span></div>`).join('')}</div>`;
  }

  function agentsPanel() {
    return `<div class="panel">
      <div class="panel-h">${streamTag('sys')}<h3>Agent Runs</h3><span class="sub">LangGraph · last 24h</span><span class="spacer"></span><span class="act">LangSmith ↗</span></div>
      <div class="feed">${DATA.agents.map((a) => `
        <div class="row-item" style="padding:8px 11px;align-items:center">
          <span class="sdot ${a.st}"></span>
          <div class="body"><div class="ttl" style="font-size:13.5px">${a.nm}</div><div class="meta-line">${a.t}</div></div>
          ${a.st === 'sync' ? badge('SYNCING', 'med') : a.st === 'ok' ? badge('OK', 'pos') : badge('ERROR', 'high')}
        </div>`).join('')}</div>
      <div class="note inl">Live agent status — observable, never blocks the dashboard.</div>
    </div>`;
  }

  function sourcesPanel() {
    return `<div class="panel">
      <div class="panel-h">${streamTag('sys')}<h3>Source Health</h3><span class="sub">5 / 7 healthy</span><span class="spacer"></span><span class="act">Manage</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px">
        ${DATA.sources.map((s) => `
        <div class="kv" style="border-bottom:1.5px dashed var(--line-soft)">
          <span style="display:flex;align-items:center;gap:8px"><span class="sdot ${s.st}"></span>${s.nm}</span>
          <span class="mini">${s.t}</span></div>`).join('')}
      </div>
      <div class="note inl">Connected / stale / error / disconnected — at a glance.</div>
    </div>`;
  }

  /* ================= VARIANT A — KPI row + 3-column streams ================= */
  function variantA() {
    return `
      ${kpiRow()}
      <div class="panel" style="border-width:2.5px">
        <div class="panel-h"><h3>⚑ Needs Attention</h3><span class="sub">urgent items across all 3 streams</span><span class="spacer"></span><span class="act">View queue (5)</span></div>
        ${attnFeed(3)}
        <div class="note inl">Unified priority queue — the "what changed & what matters" answer in &lt;10s.</div>
      </div>
      <div class="section-label">Intelligence streams</div>
      <div class="g3">${vocSnapshot()}${compSnapshot()}${jrnSnapshot()}</div>
      <div class="g2">${agentsPanel()}${sourcesPanel()}</div>`;
  }

  /* ================= VARIANT B — prioritized feed first, streams secondary ================= */
  function variantB() {
    return `
      ${kpiRow()}
      <div class="g-2-1">
        <div class="panel" style="border-width:2.5px">
          <div class="panel-h"><h3>⚑ Needs Attention</h3><span class="sub">single prioritized stream · newest first</span><span class="spacer"></span>
            <span class="chip" style="padding:3px 9px;font-size:12px">all streams ⌄</span></div>
          ${attnFeed()}
          <div class="note inl">Layout B leads with ONE decision feed; streams are summarized in the rail.</div>
        </div>
        <div class="stack">
          <div class="panel alt">
            <div class="panel-h"><h3 style="font-size:15px">Stream summary</h3></div>
            <div class="kv"><span>${streamTag('voc')}</span><b>+0.42 · churn 18%▲</b></div>
            <div class="kv"><span>${streamTag('comp')}</span><b>12 new · 3 critical</b></div>
            <div class="kv"><span>${streamTag('jrn')}</span><b>54% checkout drop</b></div>
          </div>
          ${agentsPanel()}
          ${sourcesPanel()}
        </div>
      </div>`;
  }

  /* ================= VARIANT C — three vertical lanes ================= */
  function variantC() {
    return `
      ${kpiRow()}
      <div class="lane-wrap">
        <div class="lane">
          <div class="lane-head voc">${streamTag('voc')} Voice of Customer</div>
          <div class="panel edge-voc"><div class="mini" style="margin-bottom:4px">Sentiment · 30d</div>
            ${sketchLine([2, 3, 2, 4, 3, 5, 4, 6, 5, 7], { stream: 'voc', h: 80 })}
            <div class="kv"><span>Churn risk</span><b>18% ▲</b></div></div>
          <div class="panel"><div class="panel-h"><h3 style="font-size:14px">Top themes</h3></div>${DATA.themes.map(themeBar).join('')}</div>
        </div>
        <div class="lane">
          <div class="lane-head comp">${streamTag('comp')} Competitive</div>
          <div class="panel edge-comp"><div class="mini" style="margin-bottom:6px">Signal feed · by urgency</div>
            <div class="feed">${DATA.signals.map((s) => `
              <div class="row-item ${s.urg === 'crit' ? 'crit' : ''}" style="padding:8px 10px"><div class="body">
              <div style="display:flex;gap:6px;margin-bottom:2px">${badge(s.urg.toUpperCase(), s.urg)}<span class="mini">${s.meta[0]}</span></div>
              <div class="ttl" style="font-size:13.5px">${s.ttl}</div>
              <div class="meta-line">${s.meta[1]} · ${s.meta[2]}</div></div></div>`).join('')}</div></div>
        </div>
        <div class="lane">
          <div class="lane-head jrn">${streamTag('jrn')} Journey</div>
          <div class="panel edge-jrn"><div class="mini" style="margin-bottom:6px">Activation funnel</div>${miniFunnel()}</div>
          <div class="panel"><div class="panel-h"><h3 style="font-size:14px">Top friction</h3></div>
            <div class="row-item crit"><div class="body"><div class="ttl" style="font-size:13.5px">Checkout · mobile</div>
            <div class="meta-line">ux_friction · projected lift +9%</div></div></div></div>
        </div>
      </div>
      <div class="g2">${agentsPanel()}${sourcesPanel()}</div>
      <div class="note inl">Layout C: three equal lanes — one mental model per stream, scan top-to-bottom.</div>`;
  }

  /* ================= VARIANT D — bento mosaic ================= */
  function variantD() {
    return `
      <div class="bento">
        <div class="panel span2 span2r" style="border-width:2.5px">
          <div class="panel-h"><h3>⚑ Needs Attention</h3><span class="spacer"></span><span class="act">5</span></div>
          ${attnFeed(4)}
        </div>
        <div class="kpi"><div class="lab"><span class="d voc"></span>Sentiment</div><div class="val">+0.42</div><div class="delta up">▲ 0.08</div></div>
        <div class="kpi"><div class="lab"><span class="d comp"></span>New signals</div><div class="val">12</div><div class="delta dn">3 critical</div></div>
        <div class="panel edge-voc"><div class="panel-h"><h3 style="font-size:14px">Churn risk</h3></div>
          <div class="gauge-wrap">${gauge(0.18, 'comp')}<div class="gauge-num">18%<small>Growth cohort ▲</small></div></div></div>
        <div class="panel edge-jrn"><div class="panel-h"><h3 style="font-size:14px">Funnel</h3></div>${miniFunnel()}</div>
        <div class="panel span2 edge-comp"><div class="panel-h">${streamTag('comp')}<h3 style="font-size:14px">Critical signal</h3></div>
          <div class="row-item crit"><div class="body"><div class="ttl">Northbeam cut Pro pricing 30%</div>
          <div class="meta-line">pricing · pricing page · 1h ago</div></div></div></div>
        <div class="panel span2 edge-voc"><div class="panel-h">${streamTag('voc')}<h3 style="font-size:14px">Sentiment trend</h3></div>
          ${sketchLine([2, 3, 2, 4, 3, 5, 4, 6, 5, 7], { stream: 'voc', h: 70 })}</div>
        <div class="panel span2">${agentsPanelInline()}</div>
        <div class="panel span2">${sourcesInline()}</div>
      </div>
      <div class="note inl">Layout D: bento mosaic — mixed tile sizes, glanceable, rearrangeable.</div>`;
  }
  function agentsPanelInline() {
    return `<div class="panel-h">${streamTag('sys')}<h3 style="font-size:14px">Agent runs</h3></div>
      <div style="display:flex;gap:14px;flex-wrap:wrap">${DATA.agents.map((a) => `<span style="display:flex;align-items:center;gap:6px;font-size:13px"><span class="sdot ${a.st}"></span>${a.nm.replace(' Agent', '')}</span>`).join('')}</div>`;
  }
  function sourcesInline() {
    return `<div class="panel-h">${streamTag('sys')}<h3 style="font-size:14px">Source health · 5/7</h3></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">${DATA.sources.map((s) => `<span style="display:flex;align-items:center;gap:5px;font-size:12.5px"><span class="sdot ${s.st}"></span>${s.nm}</span>`).join('')}</div>`;
  }

  const VARIANTS = { A: variantA, B: variantB, C: variantC, D: variantD };
  const TITLES = {
    A: 'KPI row + 3-column streams', B: 'Prioritized feed first',
    C: 'Three vertical lanes', D: 'Bento mosaic',
  };

  WF.dashboard = function (variant) {
    return (VARIANTS[variant] || variantA)();
  };
  WF.dashboardTitle = (v) => TITLES[v] || '';
})();
