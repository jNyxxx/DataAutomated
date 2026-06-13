/* ============================================================
   wf-screens.js — VoC, Competitive, Journey, Settings wireframes
   ============================================================ */
(function () {
  const WF = window.WF;
  const { badge, streamTag, sketchLine, sketchBars, gauge, donut, placeholder } = WF;

  /* filter bar */
  function filterBar(filters) {
    return `<div class="panel" style="padding:10px 14px">
      <div style="display:flex;gap:9px;flex-wrap:wrap;align-items:center">
        <span class="mini" style="margin-right:4px">Filter ▸</span>
        ${filters.map((f) => `<span class="chip">${f} <span class="car">⌄</span></span>`).join('')}
        <span class="spacer" style="flex:1"></span>
        <span class="chip">📅 Last 30 days <span class="car">⌄</span></span>
        <span class="btn" style="padding:4px 12px">Reset</span>
      </div>
    </div>`;
  }

  /* ============================ VOICE OF CUSTOMER ============================ */
  WF.voc = function (listMode) {
    const themes = [
      { nm: 'Pricing clarity', ct: 64, pct: 100, urg: 'high', sent: 'neg' },
      { nm: 'Onboarding time', ct: 42, pct: 66, urg: 'med', sent: 'neg' },
      { nm: 'Mobile bugs', ct: 31, pct: 48, urg: 'high', sent: 'neg' },
      { nm: 'Support quality', ct: 28, pct: 44, urg: 'low', sent: 'pos' },
      { nm: 'Reporting depth', ct: 22, pct: 34, urg: 'low', sent: 'neu' },
    ];
    const feedback = [
      { src: 'Zendesk', sent: 'neg', urg: 'high', txt: '"Couldn\'t tell which plan I was on — billing page is confusing."', when: '2h ago', theme: 'Pricing' },
      { src: 'Typeform', sent: 'neg', urg: 'med', txt: '"Setup took 40 minutes, almost gave up before activation."', when: '5h ago', theme: 'Onboarding' },
      { src: 'Intercom', sent: 'pos', urg: 'low', txt: '"Support team resolved my issue in minutes, great experience."', when: '8h ago', theme: 'Support' },
      { src: 'G2', sent: 'neu', urg: 'low', txt: '"Solid product, reporting could go deeper for our team."', when: '1d ago', theme: 'Reporting' },
    ];

    const themesPanel = `<div class="panel edge-voc">
      <div class="panel-h"><h3>Top Themes</h3><span class="sub">clustered · 30d</span><span class="spacer"></span><span class="act">Theme taxonomy</span></div>
      ${themes.map((t) => `<div class="theme"><span class="nm">${t.nm} ${badge(t.urg, t.urg)}</span>
        <span class="track"><span class="fill" style="width:${t.pct}%"></span></span><span class="ct">${t.ct}</span></div>`).join('')}
      <div class="note inl">Theme Taxonomy Engine output — count + urgency per theme.</div>
    </div>`;

    const listPanel = listMode === 'table'
      ? `<table class="wf"><thead><tr><th>Source</th><th>Sentiment</th><th>Urgency</th><th>Feedback</th><th>Theme</th><th>When</th></tr></thead>
         <tbody>${feedback.map((f) => `<tr><td>${f.src}</td><td>${badge(f.sent, f.sent)}</td><td>${badge(f.urg, f.urg)}</td>
         <td style="max-width:320px">${f.txt}</td><td>${f.theme}</td><td class="mini">${f.when}</td></tr>`).join('')}</tbody></table>`
      : `<div class="feed">${feedback.map((f) => `<div class="row-item"><div class="body">
         <div style="display:flex;gap:6px;margin-bottom:3px;flex-wrap:wrap">${badge(f.sent, f.sent)}${badge(f.urg, f.urg)}<span class="mini">${f.src} · ${f.theme} · ${f.when}</span></div>
         <div class="ttl" style="font-weight:400">${f.txt}</div></div><span class="car">›</span></div>`).join('')}</div>`;

    return `
      ${WF.topbar('Voice of Customer', 'Acme SaaS Inc. · ' + streamTagText('voc'))}
      ${filterBar(['Source: all', 'Sentiment: all', 'Urgency: all'])}
      <div class="g3">
        <div class="panel edge-voc"><div class="panel-h">${streamTag('voc')}<h3 style="font-size:15px">Sentiment trend</h3></div>
          <div class="val" style="font-size:26px;font-weight:700">+0.42 <span class="badge pos">positive</span></div>
          ${sketchLine([2, 3, 2, 4, 3, 5, 4, 6, 5, 7], { stream: 'voc', h: 96 })}
          <div class="mini">▲ 0.08 vs previous 30 days</div></div>
        <div class="panel edge-voc"><div class="panel-h">${streamTag('voc')}<h3 style="font-size:15px">Churn risk</h3></div>
          <div class="gauge-wrap">${gauge(0.18, 'comp')}<div class="gauge-num">18%<small>Growth cohort ▲ 4pts</small></div></div>
          <div class="note inl">Churn Early Warning — fires 2–4 wks ahead of revenue impact.</div></div>
        <div class="panel edge-voc"><div class="panel-h">${streamTag('voc')}<h3 style="font-size:15px">Sentiment mix</h3></div>
          <div style="display:flex;align-items:center;gap:14px"><div>${donut([{ v: 56, stream: 'voc' }, { v: 26, stream: 'comp' }, { v: 18, stream: 'sys' }])}</div>
          <div style="font-size:13px"><div class="kv"><span>● Positive</span><b>56%</b></div><div class="kv"><span>● Negative</span><b>26%</b></div><div class="kv"><span>● Neutral</span><b>18%</b></div></div></div></div>
      </div>
      <div class="panel alt">
        <div class="panel-h">${streamTag('voc')}<h3>Executive Narrative</h3><span class="sub">AI-generated · gpt-4o</span><span class="spacer"></span><span class="act">Regenerate</span></div>
        <p style="margin:0;font-size:15px;line-height:1.6;max-width:80ch">Sentiment held positive this month (<b>+0.42</b>), but a <b>4-point rise in churn risk</b> on the Growth cohort warrants attention. The dominant driver is <b>pricing clarity</b> (64 mentions) — customers can't tell which plan they're on. Onboarding time is the secondary theme. <b>Recommended action:</b> clarify the billing page and trim activation steps; modeled impact is a 2–3 pt churn reduction.</p>
        <div class="note inl">Plain-language interpretation — "what it means + what to do", not just numbers.</div>
      </div>
      ${themesPanel}
      <div class="panel">
        <div class="panel-h"><h3>Raw Feedback Sample</h3><span class="sub">processed in transit · not persisted</span><span class="spacer"></span><span class="act">Export</span></div>
        ${listPanel}
        <div class="note inl">Toggle "List style" in the toolbar to compare cards vs table.</div>
      </div>
      <div class="g2">
        ${stateDemo('Empty state', `<div class="empty"><div class="big">◔</div><h4>No feedback connected yet</h4>
          <p class="mini" style="max-width:42ch;margin:6px auto 14px">Connect Zendesk, Typeform, or Intercom to start ingesting customer signals.</p>
          <span class="btn solid">+ Connect a source</span></div>`)}
        ${stateDemo('Loading skeleton', `<div class="stack" style="gap:9px">
          ${WF.skel('60%', '16px')}${WF.skel('100%', '12px')}${WF.skel('92%', '12px')}${WF.skel('80%', '12px')}
          <div style="display:flex;gap:9px;margin-top:6px">${WF.skel('30%', '40px')}${WF.skel('30%', '40px')}${WF.skel('30%', '40px')}</div></div>`)}
      </div>`;
  };

  function streamTagText(s) { return { voc: 'Voice of Customer', comp: 'Competitive Signals', jrn: 'Journey Intelligence' }[s]; }
  function stateDemo(label, inner) {
    return `<div class="panel"><div class="panel-h"><h3 style="font-size:14px">State · ${label}</h3>${badge('demo', 'low')}</div>${inner}</div>`;
  }

  /* ============================ COMPETITIVE SIGNALS ============================ */
  WF.competitive = function () {
    const groups = [
      { urg: 'crit', items: [{ comp: 'Northbeam', type: 'pricing', ttl: 'Cut Pro tier pricing by 30%', ctx: 'Direct pressure on your mid-market deals — expect price objections in active pipeline.', src: 'pricing page', when: '1h ago' }] },
      { urg: 'high', items: [
        { comp: 'Northbeam', type: 'hiring', ttl: 'Posted 6 enterprise AE roles', ctx: 'Signals an upmarket push into your enterprise segment.', src: 'LinkedIn', when: '5h ago' },
        { comp: 'Loop.io', type: 'product', ttl: 'Shipped AI summary feature', ctx: 'Overlaps your roadmap differentiator; watch positioning.', src: 'changelog', when: '1d ago' },
      ] },
      { urg: 'med', items: [
        { comp: 'Loop.io', type: 'reviews', ttl: 'G2 rating ticked up to 4.6', ctx: 'Reputation trending up — monitor review themes.', src: 'G2', when: '2d ago' },
        { comp: 'Vantix', type: 'news', ttl: 'Raised $20M Series B', ctx: 'More runway for aggressive GTM in the next 2 quarters.', src: 'TechCrunch', when: '3d ago' },
      ] },
    ];
    return `
      ${WF.topbar('Competitive Signals', 'Acme SaaS Inc. · tracking 4 competitors')}
      ${filterBar(['Competitor: all', 'Type: all', 'Urgency: all'])}
      <div class="g-2-1">
        <div class="stack">
          ${groups.map((g) => `
            <div class="section-label">${g.urg === 'crit' ? '⚠ Critical' : g.urg === 'high' ? 'High urgency' : 'Medium urgency'} · ${g.items.length}</div>
            <div class="stack" style="gap:9px">${g.items.map((s) => `
              <div class="panel ${s.urg === 'crit' ? '' : ''} ${g.urg === 'crit' ? 'edge-comp' : ''}" style="${g.urg === 'crit' ? 'background:var(--comp-wash)' : ''}">
                <div class="panel-h" style="margin-bottom:8px">${badge(g.urg.toUpperCase(), g.urg)}${streamTag('comp', s.type)}<span class="spacer"></span><span class="mini">${s.src} · ${s.when}</span></div>
                <h3 style="margin:0 0 4px;font-size:16px"><b>${s.comp}</b> — ${s.ttl}</h3>
                <p style="margin:6px 0 0;font-size:13.5px;color:var(--ink-soft);max-width:70ch"><b style="color:var(--comp)">Strategic context:</b> ${s.ctx}</p>
                <div style="margin-top:9px;display:flex;gap:8px"><span class="btn" style="padding:4px 11px">Mark read</span><span class="btn" style="padding:4px 11px">Share to Slack</span></div>
              </div>`).join('')}</div>`).join('')}
          <div class="note inl">Feed grouped by urgency; critical items get the red treatment + always show source & detected time.</div>
        </div>
        <div class="stack">
          <div class="panel"><div class="panel-h"><h3 style="font-size:15px">Strategic Context</h3></div>
            <p class="mini" style="margin:0 0 8px;line-height:1.5">Aligned to your positioning: <b>mid-market, value-led</b>. Two of three critical/high signals point to <b>Northbeam moving upmarket</b> on price and hiring.</p>
            <div class="kv"><span>Signals (7d)</span><b>12</b></div>
            <div class="kv"><span>Critical open</span><b style="color:var(--crit)">1</b></div>
            <div class="kv"><span>Top competitor</span><b>Northbeam</b></div>
          </div>
          <div class="panel"><div class="panel-h"><h3 style="font-size:15px">Signal velocity</h3></div>
            ${sketchBars([{ l: 'Mon', v: 2 }, { l: 'Tue', v: 4 }, { l: 'Wed', v: 3 }, { l: 'Thu', v: 6 }, { l: 'Fri', v: 9 }], { stream: 'comp', h: 110 })}
            <div class="mini">Detected signals per day</div></div>
          <div class="panel"><div class="panel-h"><h3 style="font-size:15px">Tracked competitors</h3><span class="spacer"></span><span class="act">+ Add</span></div>
            ${['Northbeam', 'Loop.io', 'Vantix', 'Brightline'].map((c) => `<div class="kv"><span>${c}</span><span class="mini">${Math.floor(Math.random() * 5 + 1)} signals</span></div>`).join('')}</div>
        </div>
      </div>`;
  };

  /* ============================ JOURNEY INTELLIGENCE ============================ */
  WF.journey = function () {
    const funnel = [
      { l: 'Landing page', v: 100, n: '12,400', drop: '' },
      { l: 'Sign-up start', v: 72, n: '8,928', drop: '−28%' },
      { l: 'Account created', v: 61, n: '7,564', drop: '−15%' },
      { l: 'Activation', v: 58, n: '7,192', drop: '−5%' },
      { l: 'Checkout start', v: 41, n: '5,084', drop: '−29%' },
      { l: 'Purchase', v: 19, n: '2,356', drop: '−54%' },
    ];
    const recs = [
      { ttl: 'Simplify mobile checkout to one screen', cause: 'ux_friction', lift: '+9.0%', conf: 'high' },
      { ttl: 'Add plan comparison before checkout', cause: 'expectation', lift: '+3.5%', conf: 'med' },
      { ttl: 'Clarify pricing copy on sign-up', cause: 'messaging', lift: '+2.1%', conf: 'med' },
    ];
    return `
      ${WF.topbar('Journey Intelligence', 'Acme SaaS Inc. · Activation funnel')}
      ${filterBar(['Funnel: Activation', 'Segment: all', 'Device: all'])}
      <div class="g-2-1">
        <div class="panel edge-jrn">
          <div class="panel-h">${streamTag('jrn')}<h3>Activation Funnel</h3><span class="sub">drop-off by step · 30d</span><span class="spacer"></span><span class="act">Compare cohorts</span></div>
          <div class="funnel">${funnel.map((f) => `<div class="fstep"><span class="fl">${f.l}</span>
            <span class="fbar-wrap"><span class="fbar" style="width:${f.v}%;${f.drop === '−54%' ? 'background:var(--comp-wash);border-color:var(--crit)' : ''}">${f.v}% · ${f.n}</span></span>
            <span class="drop">${f.drop}</span></div>`).join('')}</div>
          <div class="note inl">Full-fidelity funnel — biggest leak (checkout, −54%) flagged red.</div>
        </div>
        <div class="stack">
          <div class="panel edge-jrn"><div class="panel-h"><h3 style="font-size:15px">Friction Diagnosis</h3></div>
            <div class="row-item crit" style="margin-bottom:8px"><div class="body"><div class="ttl">Checkout · mobile</div>
              <div class="meta-line">friction score 0.81 · rage-clicks + input hesitation</div></div></div>
            <div class="kv"><span>Root cause</span><b>${badge('ux_friction', 'high')}</b></div>
            <div class="kv"><span>Affected sessions</span><b>3,084</b></div>
            <div class="kv"><span>Est. revenue at risk</span><b style="color:var(--crit)">$28K/mo</b></div>
          </div>
          <div class="panel"><div class="panel-h"><h3 style="font-size:15px">Drop-off by device</h3></div>
            ${sketchBars([{ l: 'Desktop', v: 32 }, { l: 'Tablet', v: 44 }, { l: 'Mobile', v: 54 }], { stream: 'jrn', h: 104 })}</div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-h">${streamTag('jrn')}<h3>Recommended Actions</h3><span class="sub">prioritized by projected lift</span></div>
        <table class="wf"><thead><tr><th>Recommendation</th><th>Root cause</th><th>Confidence</th><th class="num">Projected lift</th><th></th></tr></thead>
          <tbody>${recs.map((r) => `<tr><td><b>${r.ttl}</b></td><td>${badge(r.cause, r.cause === 'ux_friction' ? 'high' : 'med')}</td>
            <td>${badge(r.conf, r.conf === 'high' ? 'pos' : 'low')}</td><td class="num"><b style="color:var(--ok)">${r.lift}</b></td>
            <td><span class="btn" style="padding:3px 10px">Plan fix</span></td></tr>`).join('')}</tbody></table>
        <div class="note inl">Each fix carries a modeled conversion lift — sorted so the highest-impact action is first.</div>
      </div>
      ${stateDemo('Segment data not yet available (placeholder)', `<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        ${placeholder('cohort comparison — connect Mixpanel/Segment to populate', 96)}
        <div style="flex:1;min-width:200px"><p class="mini" style="margin:0">Cohort & segment breakdowns appear here once a behavioral source is connected. The funnel above runs on event data already flowing in.</p>
        <span class="btn solid" style="margin-top:10px">+ Connect Mixpanel</span></div></div>`)}`;
  };

  /* ============================ REPORTS / BRIEFINGS ============================ */
  WF.reports = function () {
    const library = [
      { ttl: 'Weekly Intelligence Briefing', period: 'Jun 9 – Jun 15', type: 'sys',  gen: 'today · 9:02 AM', pages: '6', st: 'ready' },
      { ttl: 'Competitive Brief — Northbeam', period: 'Jun 12',        type: 'comp', gen: '1d ago',           pages: '3', st: 'ready' },
      { ttl: 'VoC Deep-Dive — Pricing clarity', period: 'Jun 1 – 15',  type: 'voc',  gen: '2d ago',           pages: '8', st: 'ready' },
      { ttl: 'Activation Funnel Review',     period: 'May · monthly',   type: 'jrn',  gen: 'building now…',     pages: '—', st: 'gen' },
      { ttl: 'Monthly Board Pack',           period: 'June',            type: 'sys',  gen: 'queued · Jul 1',    pages: '—', st: 'sched' },
      { ttl: 'Weekly Intelligence Briefing', period: 'Jun 2 – Jun 8',   type: 'sys',  gen: '1w ago',           pages: '6', st: 'ready' },
    ];
    const stMap = { ready: ['Ready', 'pos', 'ok'], gen: ['Generating', 'med', 'sync'], sched: ['Scheduled', 'low', 'off'] };
    const typeLabel = { sys: 'Executive', voc: 'Voice of Customer', comp: 'Competitive', jrn: 'Journey' };

    const templates = [
      { nm: 'Executive Weekly',     stream: 'sys',  lbl: 'All streams', desc: 'Leadership briefing across all three services' },
      { nm: 'VoC Deep-Dive',        stream: 'voc',  lbl: null,          desc: 'Theme clusters, sentiment + verbatim samples' },
      { nm: 'Competitive Brief',    stream: 'comp', lbl: null,          desc: 'Signals grouped by urgency + strategic context' },
      { nm: 'Journey Funnel Review',stream: 'jrn',  lbl: null,          desc: 'Drop-off analysis + recommended fixes' },
    ];

    const recipients = [
      { n: 'Dana R.', r: 'CEO', ch: 'email' },
      { n: 'Marcus L.', r: 'VP Product', ch: 'email + Slack' },
      { n: 'Priya S.', r: 'Head of CX', ch: 'Slack' },
    ];

    const cover = `<div style="border:2px solid var(--line);border-radius:var(--radius-sm);background:var(--fill);
        box-shadow:var(--shadow-sm);padding:13px 12px;display:flex;flex-direction:column;gap:7px;min-height:188px">
        <div class="mini" style="font-size:9px;letter-spacing:.6px;color:var(--ink-faint)">DATAAUTOMATED · WEEKLY</div>
        <div style="font-weight:700;font-size:14px;line-height:1.15">Intelligence<br>Briefing</div>
        <div style="display:flex;flex-direction:column;gap:5px;margin-top:2px">
          ${WF.skel('86%', '6px')}${WF.skel('100%', '6px')}${WF.skel('94%', '6px')}${WF.skel('72%', '6px')}</div>
        <div style="display:flex;gap:5px;margin-top:auto">
          <span style="width:9px;height:9px;border-radius:50%;background:var(--voc)"></span>
          <span style="width:9px;height:9px;border-radius:50%;background:var(--comp)"></span>
          <span style="width:9px;height:9px;border-radius:50%;background:var(--jrn)"></span>
        </div></div>`;

    const highlights = [
      { s: 'voc',  t: 'Sentiment held +0.42, but <b>pricing clarity</b> is the top theme (64 mentions).' },
      { s: 'comp', t: '<b>Northbeam</b> cut Pro pricing 30% — pressure on mid-market deals.' },
      { s: 'jrn',  t: 'Mobile checkout drop-off spiked to <b>54%</b>; modeled fix +9% lift.' },
    ];

    return `
      ${WF.topbar('Reports', 'Acme SaaS Inc. · weekly briefings + on-demand')}
      <div class="panel" style="padding:10px 14px">
        <div style="display:flex;gap:9px;flex-wrap:wrap;align-items:center">
          <span class="mini" style="margin-right:4px">Filter ▸</span>
          ${['Type: all', 'Stream: all', 'Status: all'].map((f) => `<span class="chip">${f} <span class="car">⌄</span></span>`).join('')}
          <span class="spacer" style="flex:1"></span>
          <span class="chip">📅 Last 90 days <span class="car">⌄</span></span>
          <span class="btn solid" style="padding:5px 13px">+ New report</span>
        </div>
      </div>

      <div class="g-2-1">
        <div class="panel alt">
          <div class="panel-h">${streamTag('sys', 'All streams')}<h3>Latest Briefing</h3>
            <span class="sub">Week of Jun 9 · auto-generated Mon 9:02 AM</span><span class="spacer"></span>${badge('Ready', 'pos')}</div>
          <div style="display:grid;grid-template-columns:138px 1fr;gap:16px;align-items:start">
            ${cover}
            <div>
              <p style="margin:0 0 12px;font-size:14.5px;line-height:1.55;max-width:66ch">This week's headline: a <b>4-point rise in churn risk</b> on the Growth cohort, driven by <b>pricing confusion</b>, lands the same week a key rival cut prices. Journey data shows the leak compounding at mobile checkout.</p>
              <div class="stack" style="gap:8px">
                ${highlights.map((h) => `<div class="row-item" style="padding:8px 11px">
                  <div class="body"><div style="margin-bottom:3px">${streamTag(h.s)}</div>
                  <div class="ttl" style="font-weight:400;font-size:13.5px">${h.t}</div></div></div>`).join('')}
              </div>
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
            <span class="btn solid">Open full report</span>
            <span class="btn">⤓ Download PDF</span>
            <span class="btn">Share to Slack</span>
          </div>
          <div class="note inl">Generated briefing = exec narrative + per-stream highlights, the same "what it means + what to do" framing used across the app.</div>
        </div>

        <div class="stack">
          <div class="panel">
            <div class="panel-h"><h3 style="font-size:15px">This edition</h3></div>
            ${WF.sketchLine([4, 5, 4, 6, 5, 6, 7, 8], { stream: 'jrn', h: 84, area: true })}
            <div class="kv"><span>Pages</span><b>6</b></div>
            <div class="kv"><span>Sources synthesized</span><b>6</b></div>
            <div class="kv"><span>Signals included</span><b>41</b></div>
            <div class="kv"><span>Period</span><b>7 days</b></div>
          </div>
          <div class="panel">
            <div class="panel-h"><h3 style="font-size:15px">Delivery</h3><span class="spacer"></span><span class="act">Edit</span></div>
            ${recipients.map((p) => `<div class="kv" style="align-items:center">
              <span style="display:flex;align-items:center;gap:8px"><span class="av" style="width:24px;height:24px;display:grid;place-items:center;border:1.5px solid var(--line);border-radius:7px;background:var(--fill-3);font-weight:700;font-size:11px">${p.n[0]}</span><span><b style="font-weight:700">${p.n}</b> <span class="mini">· ${p.r}</span></span></span>
              <span class="mini">${p.ch}</span></div>`).join('')}
            <div class="kv"><span>Next send</span><b>Mon · 9:00 AM</b></div>
            <div class="note inl">Auto-delivered on the n8n schedule; recipients & channels managed here.</div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-h"><h3>Report Library</h3><span class="sub">generated + scheduled</span><span class="spacer"></span><span class="act">Export all</span></div>
        <table class="wf"><thead><tr><th>Report</th><th>Type</th><th>Period</th><th>Generated</th><th class="num">Pages</th><th>Status</th><th></th></tr></thead>
          <tbody>${library.map((r) => {
            const st = stMap[r.st];
            return `<tr>
              <td><span style="display:flex;align-items:center;gap:8px"><span class="sdot ${st[2]}"></span><b>${r.ttl}</b></span></td>
              <td>${streamTag(r.type, typeLabel[r.type])}</td>
              <td class="mini">${r.period}</td>
              <td class="mini">${r.gen}</td>
              <td class="num">${r.pages}</td>
              <td>${badge(st[0], st[1])}</td>
              <td>${r.st === 'ready' ? '<span style="display:flex;gap:6px;justify-content:flex-end"><span class="act">View</span><span class="act">PDF</span></span>' : (r.st === 'gen' ? '<span class="mini">~2 min</span>' : '<span class="act">Edit</span>')}</td>
            </tr>`;
          }).join('')}</tbody></table>
        <div class="note inl">Mix of auto-generated briefings and on-demand reports; one row shows live generation status, one is scheduled.</div>
      </div>

      <div class="g2">
        <div class="panel">
          <div class="panel-h"><h3 style="font-size:15px">Report Templates</h3><span class="sub">start from a structure</span><span class="spacer"></span><span class="act">+ Custom</span></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">
            ${templates.map((t) => `<div class="row-item" style="flex-direction:column;align-items:stretch;gap:7px;padding:11px 12px">
              <div>${streamTag(t.stream, t.lbl || undefined)}</div>
              <div class="ttl" style="font-size:14px">${t.nm}</div>
              <div class="meta-line" style="margin-top:0">${t.desc}</div>
              <span class="btn" style="padding:4px 11px;align-self:flex-start;margin-top:2px">Use template</span></div>`).join('')}
          </div>
          <div class="note inl">Each template maps to one service's output shape; "Custom" opens a section builder.</div>
        </div>
        <div class="stack">
          <div class="panel">
            <div class="panel-h"><h3 style="font-size:15px">Schedule</h3><span class="spacer"></span><span class="act">Manage</span></div>
            <div class="kv"><span>Executive Weekly</span><b>Mon · 9:00 AM</b></div>
            <div class="kv"><span>Competitive digest</span><b>Daily · 8:00 AM</b></div>
            <div class="kv"><span>VoC summary</span><b>Fri · 4:00 PM</b></div>
            <div class="kv"><span>Board pack</span><b>1st of month</b></div>
            <div class="note inl">Cadence mirrors the automation schedule — generation is hands-off.</div>
          </div>
          <div class="panel">
            <div class="panel-h"><h3 style="font-size:15px">Output formats</h3></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${['PDF', 'Slack message', 'Email digest', 'Notion page', 'CSV data'].map((f, i) => `<span class="chip" ${i < 2 ? 'style="background:var(--fill-2);border-color:var(--line);font-weight:700"' : ''}>${f}</span>`).join('')}
            </div>
            <div class="note inl">PDF + Slack are the MVP delivery formats; others stub the roadmap.</div>
          </div>
        </div>
      </div>

      <div class="g2">
        ${stateDemo('Empty state', `<div class="empty"><div class="big">▤</div><h4>No reports generated yet</h4>
          <p class="mini" style="max-width:44ch;margin:6px auto 14px">Your first weekly briefing generates automatically once a data source has been syncing for 7 days — or build one on demand.</p>
          <span class="btn solid">+ Build a report now</span></div>`)}
        ${stateDemo('Generating', `<div class="row-item" style="align-items:center"><span class="sdot sync"></span>
          <div class="body"><div class="ttl">Activation Funnel Review</div>
          <div class="meta-line">synthesizing 6 sources · drafting narrative · ~2 min remaining</div></div></div>
          <div class="stack" style="gap:9px;margin-top:10px">${WF.skel('70%', '14px')}${WF.skel('100%', '11px')}${WF.skel('88%', '11px')}</div>`)}
      </div>`;
  };

  /* ============================ SETTINGS / DATA SOURCES ============================ */
  WF.settings = function () {
    const connected = [
      { nm: 'Zendesk', kind: 'VoC · support tickets', st: 'ok', t: 'synced 6m ago', cred: '•••• configured' },
      { nm: 'Typeform', kind: 'VoC · surveys', st: 'ok', t: 'synced 22m ago', cred: '•••• configured' },
      { nm: 'Intercom', kind: 'VoC · conversations', st: 'stale', t: 'last sync 3d ago', cred: '•••• configured' },
      { nm: 'News API', kind: 'Competitive · news', st: 'sync', t: 'syncing now…', cred: '•••• configured' },
      { nm: 'Mixpanel', kind: 'Journey · events', st: 'err', t: 'auth expired — reconnect', cred: '⚠ token invalid' },
      { nm: 'G2 scraper', kind: 'Competitive · reviews', st: 'ok', t: 'synced 1h ago', cred: 'public · no auth' },
    ];
    const available = [
      ['Zendesk', 'support'], ['Typeform', 'surveys'], ['Intercom', 'chat'], ['News API', 'news'],
      ['Shopify', 'commerce'], ['Mixpanel', 'analytics'], ['Segment', 'CDP'], ['LinkedIn', 'jobs'],
    ];
    const stLabel = { ok: ['OK', 'pos'], stale: ['STALE', 'med'], err: ['ERROR', 'high'], sync: ['SYNCING', 'med'], off: ['OFF', 'low'] };
    return `
      ${WF.topbar('Settings & Data Sources', 'Acme SaaS Inc. · 6 connected · 1 needs attention', { noRange: true })}
      <div class="panel" style="padding:10px 14px"><div style="display:flex;gap:8px;flex-wrap:wrap">
        ${['Data Sources', 'Alert Preferences', 'Team & Roles', 'Billing & Plan', 'API Keys'].map((t, i) => `<span class="chip" ${i === 0 ? 'style="background:var(--fill-2);border-color:var(--line);font-weight:700"' : ''}>${t}</span>`).join('')}
      </div></div>

      <div class="panel">
        <div class="panel-h"><h3>Connected Sources</h3><span class="sub">6 of 7 healthy</span><span class="spacer"></span><span class="btn solid" style="padding:5px 12px">+ Add connection</span></div>
        <table class="wf"><thead><tr><th>Source</th><th>Feeds</th><th>Status</th><th>Last synced</th><th>Credentials</th><th></th></tr></thead>
          <tbody>${connected.map((s) => `<tr>
            <td><span style="display:flex;align-items:center;gap:8px"><span class="sdot ${s.st}"></span><b>${s.nm}</b></span></td>
            <td class="mini">${s.kind}</td>
            <td>${badge(stLabel[s.st][0], stLabel[s.st][1])}</td>
            <td class="mini">${s.t}</td>
            <td class="mini">${s.cred}</td>
            <td>${s.st === 'err' ? '<span class="btn" style="padding:3px 10px">Reconnect</span>' : '<span class="act">Manage</span>'}</td>
          </tr>`).join('')}</tbody></table>
        <div class="note inl">Status surfaces connected / stale / syncing / error / disconnected; secrets never shown — only "configured".</div>
      </div>

      <div class="g2">
        <div class="panel">
          <div class="panel-h"><h3 style="font-size:15px">Add a Connection</h3><span class="sub">pre-built connectors</span></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">
            ${available.map(([n, k]) => `<div class="row-item" style="padding:9px 11px;align-items:center">
              <span class="av" style="width:26px;height:26px;display:grid;place-items:center;border:1.5px solid var(--line);border-radius:7px;background:var(--fill-3);font-weight:700;font-size:12px">${n[0]}</span>
              <div class="body"><div class="ttl" style="font-size:13.5px">${n}</div><div class="meta-line">${k}</div></div>
              <span class="btn" style="padding:3px 11px">Connect</span></div>`).join('')}
          </div>
          <div class="note inl">MVP connector set (Zendesk, Typeform, Intercom, News, Shopify, Mixpanel, Segment) — adding one opens the credential flow.</div>
        </div>
        <div class="stack">
          <div class="panel" style="background:var(--comp-wash);border-color:var(--crit)">
            <div class="panel-h"><h3 style="font-size:15px">⚠ Mixpanel needs attention</h3></div>
            <p class="mini" style="margin:0 0 10px">Auth token expired 2 days ago — Journey event ingestion is paused. Reconnect to resume the behavioral funnel.</p>
            <span class="btn solid">Reconnect Mixpanel</span>
          </div>
          <div class="panel">
            <div class="panel-h"><h3 style="font-size:15px">Sync schedule</h3></div>
            <div class="kv"><span>Feedback ingestion</span><b>every 6h</b></div>
            <div class="kv"><span>Competitive monitor</span><b>every 2h</b></div>
            <div class="kv"><span>Weekly report</span><b>Mon 9:00 AM</b></div>
            <div class="note inl">Cadence mirrors the n8n automation schedule — read-only here.</div>
          </div>
        </div>
      </div>`;
  };
})();
