/* ══════════════════════════════════════════════════════════════════════
   views-app.js — the eleven console modules.

   Each module is { title, crumb, render() → html, mount() } so the
   router can treat them uniformly. Rendering is one-directional: change
   the store, then re-render. No module reaches into another's DOM.
   ══════════════════════════════════════════════════════════════════════ */

window.VL = window.VL || {};

(() => {
  "use strict";
  const V = window.VL;
  const { icon, nf, tonnes, signed, escapeHtml, toast, rollTo, dialog, paintRange } = V.UI;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const S = () => V.Store;

  const panel = (title, note, body, cls = "") => `
    <div class="panel ${cls}">
      <div class="panel-hd"><h2>${title}</h2>${note ? `<span class="hd-note">${note}</span>` : ""}</div>
      ${body}
    </div>`;

  const chartPanel = (title, note, id, extra = "") => `
    <div class="panel">
      <div class="panel-hd"><h2>${title}</h2>${note ? `<span class="hd-note">${note}</span>` : ""}</div>
      <div class="chart-wrap" id="${id}"><div class="chart-host"></div></div>
      ${extra}
    </div>`;

  /* ══════════════════════════════════════════════════════════════════
     1 · OVERVIEW
     ══════════════════════════════════════════════════════════════════ */
  const overview = {
    title: "Overview",
    crumb: "TRACK",
    render() {
      return `
        <div class="module">
          <div class="wall g4" id="kpis"></div>

          <div class="wall g-hero stack">
            <div class="panel">
              <div class="panel-hd"><h2>Your score</h2>
                <span class="hd-note" id="periodLabel"></span></div>
              <div class="score-dial" id="scoreDial"></div>
              <div class="score-read">
                <div class="grade" id="scoreGrade">—</div>
                <div class="val" id="scoreNum"></div>
              </div>
              <p class="plain" id="scorePlain"></p>
              <details class="more"><summary>How this score is worked out</summary>
                <div class="subs" id="subScores"></div></details>
            </div>
            ${chartPanel("Your carbon, month by month", "LAST 12 MONTHS", "trendWrap", `
              <div class="legend">
                <span><i style="background:var(--gross)"></i>EMITTED</span>
                <span><i style="background:var(--good)"></i>SAVED</span>
                <span><i class="line" style="background:var(--accent)"></i>OVERALL</span>
              </div>`)}
          </div>

          <div class="wall g-split stack">
            ${chartPanel("Where your carbon comes from", "", "catWrap")}
            <div class="panel panel-flush">
              <div class="panel-hd" style="padding:16px 18px 0;margin-bottom:6px">
                <h2>What to fix first</h2>
                <span class="hd-note">TOP 3 FOR YOU</span></div>
              <div id="insightFeed"></div>
            </div>
          </div>

          <details class="more more-wall">
            <summary>Show detailed breakdown <em>emission scopes and resource use, for specialists</em></summary>
          <div class="wall g-split stack">
            <div class="panel">
              <div class="panel-hd"><h2>Emission scopes</h2><span class="hd-note">GHG PROTOCOL</span></div>
              <div id="scopeDonut" style="max-width:200px;margin:0 auto"></div>
              <div class="subs" id="scopeKeys" style="margin-top:12px"></div>
              <div class="panel-hd" style="margin-top:20px;padding-top:16px;border-top:1px solid var(--line-1)">
                <h2>Resource use</h2><span class="hd-note">PER PERSON / MONTH</span></div>
              <div class="subs" style="margin-top:0;padding-top:0;border-top:0" id="resources"></div>
            </div>
          </div>
          </details>
        </div>`;
    },

    mount() {
      const { months, agg, score } = S().summary();
      const series = S().trend(12);

      $("#periodLabel").textContent = months.length === 1
        ? V.monthLabel(months[0])
        : `${V.monthLabel(months[0])} — ${V.monthLabel(months[months.length - 1])}`;

      /* score */
      V.Charts.scoreDial($("#scoreDial"), score.composite);
      const grade = $("#scoreGrade");
      grade.textContent = score.grade;
      grade.style.color = V.bandVar(score.composite);
      $("#scoreNum").innerHTML = `<b>${nf(score.composite, 0)}</b> out of 100`;
      $("#scorePlain").textContent = score.composite >= 67
        ? "Good. You are ahead of most organisations your size."
        : score.composite >= 40
        ? "Average. A few of the fixes below would move you up a grade."
        : "Needs attention. Start with the top fix below.";

      $("#subScores").innerHTML = score.subscores.map(s => {
        const detail = s.key === "carbon"    ? `${nf(s.observed, 1)} kg/emp/mo`
                     : s.key === "renewable" ? `${nf(s.observed, 1)}% of kWh`
                     : s.key === "diversion" ? `${nf(s.observed, 1)}% of waste`
                     : s.key === "mobility"  ? `${nf(s.observed, 1)}% of km`
                     : `${nf(score.waterPEM, 2)} kL · ${nf(score.paperPEM, 2)} kg`;
        return `<div class="meter-row">
            <span class="m-name">${s.label} <em>· ${detail}</em></span>
            <span class="m-val" style="color:${V.bandVar(s.value)}">${nf(s.value, 0)}</span>
            <span class="meter"><i style="width:${V.clamp01(s.value/100)*100}%;background:${V.bandVar(s.value)}"></i></span>
          </div>`;
      }).join("");

      /* KPI tiles */
      const emp = Math.max(1, S().org.headcount);
      const perEmp = agg.net / emp / months.length;
      const renPct = agg.energy ? (100 * agg.renewable) / agg.energy : 0;
      const divPct = agg.waste ? (100 * agg.diverted) / agg.waste : 0;

      const tiles = [
        { id:"kNet", label:"Carbon footprint", value: agg.net/1000, dec:1, unit:"tonnes CO₂",
          note:`over ${months.length} month${months.length>1?"s":""}`,
          chip:null, spark: series.map(s=>s.net), color:"var(--accent)" },
        { id:"kInt", label:"Per person, per month", value: perEmp, dec:0, unit:"kg CO₂",
          note:`goal: under ${V.BANDS.carbon.target} kg`,
          chip: score.subscores.find(s=>s.key==="carbon").value,
          spark: series.map(s=>s.net), color:"var(--gross-hi)" },
        { id:"kRen", label:"Clean electricity", value: renPct, dec:0, unit:"%",
          note:"from solar or green power",
          chip: score.subscores.find(s=>s.key==="renewable").value,
          spark: series.map(s=>s.avoided), color:"var(--good)" },
        { id:"kDiv", label:"Waste recycled", value: divPct, dec:0, unit:"%",
          note:"kept out of landfill",
          chip: score.subscores.find(s=>s.key==="diversion").value,
          spark: series.map(s=>s.avoided), color:"var(--good)" }
      ];

      $("#kpis").innerHTML = tiles.map(t => `
        <div class="panel kpi">
          <div class="kpi-top">
            <div><div class="eyebrow">${t.label}</div>
              <div class="fig" style="margin-top:8px"><span id="${t.id}">0</span><u>${t.unit}</u></div></div>
            <div class="kpi-spark" id="${t.id}S"></div>
          </div>
          <div class="kpi-foot">
            ${t.chip != null
              ? `<span class="chip chip-${V.bandFor(t.chip)}"><i></i>${
                   t.chip >= 67 ? "On track" : t.chip >= 40 ? "Needs work" : "Off track"}</span>`
              : `<span class="chip chip-flat"><i></i>${nf(agg.net/1000/months.length,1)} t a month</span>`}
            <span class="kpi-note">${t.note}</span>
          </div>
        </div>`).join("");
      tiles.forEach(t => {
        rollTo($("#"+t.id), t.value, t.dec);
        V.Charts.sparkline($("#"+t.id+"S"), t.spark, t.color);
      });

      /* trend */
      V.Charts.trend($("#trendWrap"), series);
      /* categories */
      const catRows = V.CATEGORIES.filter(c => c.kind === "charge")
        .map(c => ({ name: c.name, color: V.catColor(c.id), value: Math.max(0, agg.byCat[c.id]),
                     count: S().live().filter(e => V.byId[e.factorId].cat === c.id &&
                       months.includes(V.ymOf(e.date))).length }))
        .sort((a, b) => b.value - a.value);
      V.Charts.categoryBars($("#catWrap"), catRows, agg.gross);

      /* scopes */
      const scopeMeta = [
        { n:1, color:"var(--series-5)", d:"Fuel burnt directly" },
        { n:2, color:"var(--series-1)", d:"Purchased electricity" },
        { n:3, color:"var(--series-7)", d:"Upstream & downstream" }
      ];
      const scopeTotal = scopeMeta.reduce((t, m) => t + Math.max(0, agg.byScope[m.n]), 0) || 1;
      V.Charts.donut($("#scopeDonut"),
        scopeMeta.map(m => ({ value: Math.max(0, agg.byScope[m.n]), color: m.color })),
        "t CO₂e gross", tonnes(agg.gross));
      $("#scopeKeys").innerHTML = scopeMeta.map(m => {
        const v = Math.max(0, agg.byScope[m.n]);
        return `<div class="meter-row">
            <span class="m-name"><span style="display:inline-block;width:7px;height:7px;border-radius:2px;background:${m.color};margin-right:7px"></span>Scope ${m.n} <em>· ${m.d}</em></span>
            <span class="m-val">${tonnes(v)} t · ${nf(100*v/scopeTotal,0)}%</span>
          </div>`;
      }).join("");

      /* resources */
      const mo = months.length;
      const res = [
        { n:"Electricity", v:agg.energy/emp/mo, u:"kWh", t:60, c:220 },
        { n:"Water",       v:agg.water/emp/mo,  u:"kL",  t:V.WATER_BAND.target, c:V.WATER_BAND.ceiling },
        { n:"Paper",       v:agg.paper/emp/mo,  u:"kg",  t:V.PAPER_BAND.target, c:V.PAPER_BAND.ceiling },
        { n:"Waste",       v:agg.waste/emp/mo,  u:"kg",  t:6,  c:24 }
      ];
      $("#resources").innerHTML = res.map(r => {
        const sc = V.normalise(r.v, r.t, r.c);
        return `<div class="meter-row">
            <span class="m-name">${r.n} <em>· good ≤ ${nf(r.t, r.t<10?1:0)} ${r.u}</em></span>
            <span class="m-val" style="color:${V.bandVar(sc)}">${nf(r.v, r.v<10?2:0)} ${r.u}</span>
            <span class="meter"><i style="width:${V.clamp01(r.v/r.c)*100}%;background:${V.bandVar(sc)}"></i>
              <u style="left:${V.clamp01(r.t/r.c)*100}%"></u></span>
          </div>`;
      }).join("");

      /* insights */
      $("#insightFeed").innerHTML = buildInsights(agg, score, months).map(i => `
        <div class="finding">
          <div class="f-sev ${i.sev}">${icon(i.icon, 14)}</div>
          <div>
            <h3>${i.title}</h3><p>${i.body}</p>
            ${i.action ? `<div class="f-meta"><a class="chip chip-accent" href="#${i.action[1]}">
              <i></i>${i.action[0]}</a></div>` : ""}
          </div>
        </div>`).join("");
    }
  };

  /** Rule-based recommendations, each one quantified from the ledger. */
  function buildInsights(agg, score, months) {
    const out = [];
    const emitting = V.CATEGORIES.filter(c => c.kind === "charge")
      .map(c => ({ c, v: Math.max(0, agg.byCat[c.id]) })).sort((a, b) => b.v - a.v);

    if (emitting[0] && emitting[0].v > 0) {
      const top = emitting[0];
      out.push({ sev:"low", icon:"bolt",
        title:`${top.c.name} is your biggest source of carbon`,
        body:`It makes up <b>${nf(100*top.v/(agg.gross||1),0)}%</b> of your footprint. Cutting it by a tenth saves <b>${tonnes(top.v*0.1)} tonnes</b>.`,
        action:["Try it in the planner","/app/simulate"] });
    }

    const weakest = score.subscores.slice().sort((a, b) => a.value - b.value)[0];
    if (weakest) {
      const gain = (100 - weakest.value) * weakest.weight;
      out.push({ sev: weakest.band === "bad" ? "high" : "medium", icon:"target",
        title:`${weakest.label} is pulling your score down`,
        body:`It scores <b>${nf(weakest.value,0)} out of 100</b>. Fixing it could raise your overall score from <b>${nf(score.composite,0)}</b> to <b>${nf(Math.min(100,score.composite+gain),0)}</b>.`,
        action:["See your goals","/app/targets"] });
    }

    if (agg.energy > 0) {
      const gap = Math.max(0, 0.6 * agg.energy - agg.renewable);
      if (gap > 0) out.push({ sev:"medium", icon:"sun",
        title:"Too little of your electricity is clean",
        body:`The goal is 60% from solar or green power. Getting there would save about <b>${tonnes(gap*0.716)} tonnes</b> of CO₂.`,
        action:["Try solar in the planner","/app/simulate"] });
    }

    const landfill = agg.waste - agg.diverted;
    if (landfill > 0) {
      out.push({ sev:"medium", icon:"recycle",
        title:"A lot of waste still goes to landfill",
        body:`<b>${nf(landfill,0)} kg</b> was thrown away. Recycling or composting half of it would save about <b>${tonnes(landfill*0.5*(0.586+0.9))} tonnes</b> of CO₂.`,
        action:["Try it in the planner","/app/simulate"] });
    }

    const anomalies = V.Analytics.detectAnomalies(S().entries, { months: 12 })
      .filter(a => !a.isGood).slice(0, 1);
    if (anomalies.length) {
      const a = anomalies[0];
      out.push({ sev:"high", icon:"warning",
        title:`Something looks unusual in ${V.monthLabel(a.month)}`,
        body:`${a.factor.label} was much higher than normal that month, adding <b>${tonnes(Math.abs(a.co2Impact))} tonnes</b> of CO₂. It may be a fault or a wrong meter reading.`,
        action:["Take a look","/app/insights"] });
    }
    // Most urgent first, and only three: a short list gets acted on.
    const rank = { high: 0, medium: 1, low: 2 };
    return out.sort((x, y) => rank[x.sev] - rank[y.sev]).slice(0, 3);
  }

  /* ══════════════════════════════════════════════════════════════════
     2 · SIMULATOR
     ══════════════════════════════════════════════════════════════════ */
  const simulate = {
    title: "What-if planner",
    crumb: "PLAN",
    positions: {},

    render() {
      return `
        <div class="module">
          <div class="wall g-split sim-grid">
            <div class="panel">
              <div class="panel-hd"><h2>Changes you could make</h2>
                <button class="btn btn-sm" id="simReset">${icon("reset",13)} Reset</button></div>
              <div class="playbooks">
                ${V.Simulate.PLAYBOOKS.map(p => `<button class="btn btn-sm" data-playbook="${p.id}"
                  title="${escapeHtml(p.note)}">${escapeHtml(p.name)}</button>`).join("")}
              </div>
              <div id="levers" style="margin-top:10px"></div>
            </div>

            <div class="panel">
              <div class="panel-hd"><h2>Simulated position</h2>
                <span class="hd-note" id="simPeriod"></span></div>
              <div class="sim-result" id="simResult"></div>
              <div class="chart-wrap mt-16" id="waterfallWrap"><div class="chart-host"></div></div>
              <div id="simNote" class="prose" style="font-size:var(--fs-small);margin-top:14px"></div>
            </div>
          </div>

          <div class="wall g2 stack">
            <div class="panel">
              <div class="panel-hd"><h2>Score movement</h2></div>
              <div id="simScores"></div>
            </div>
            <div class="panel">
              <div class="panel-hd"><h2>Attribution</h2>
                <span class="hd-note">EACH LEVER RUN ALONE</span></div>
              <div id="simAttrib"></div>
            </div>
          </div>
        </div>`;
    },

    mount() {
      const self = simulate;
      if (!Object.keys(self.positions).length) {
        V.Simulate.LEVERS.forEach(l => (self.positions[l.id] = l.def));
      }

      $("#levers").innerHTML = V.Simulate.LEVERS.map(l => `
        <div class="lever">
          <div class="lever-top"><b>${escapeHtml(l.name)}</b>
            <span class="lv-val" id="lv-${l.id}">${self.positions[l.id]}%</span></div>
          <input type="range" id="rng-${l.id}" min="0" max="${l.max}" step="${l.step}"
            value="${self.positions[l.id]}" aria-label="${escapeHtml(l.name)}">
          <p>${escapeHtml(l.detail)}</p>
          <div class="lv-capex">${escapeHtml(l.capex)}</div>
        </div>`).join("");

      V.Simulate.LEVERS.forEach(l => {
        const rng = $("#rng-" + l.id);
        paintRange(rng);
        rng.addEventListener("input", () => {
          self.positions[l.id] = +rng.value;
          $("#lv-" + l.id).textContent = rng.value + "%";
          paintRange(rng);
          self.recompute();
        });
      });

      $$("[data-playbook]").forEach(btn => btn.addEventListener("click", () => {
        const pb = V.Simulate.PLAYBOOKS.find(p => p.id === btn.dataset.playbook);
        V.Simulate.LEVERS.forEach(l => (self.positions[l.id] = pb.positions[l.id] || 0));
        V.Simulate.LEVERS.forEach(l => {
          const rng = $("#rng-" + l.id);
          rng.value = self.positions[l.id];
          $("#lv-" + l.id).textContent = rng.value + "%";
          paintRange(rng);
        });
        self.recompute();
        toast(pb.name + " loaded", pb.note, "info");
      }));

      $("#simReset").addEventListener("click", () => {
        V.Simulate.LEVERS.forEach(l => {
          self.positions[l.id] = 0;
          const rng = $("#rng-" + l.id);
          rng.value = 0; $("#lv-" + l.id).textContent = "0%"; paintRange(rng);
        });
        self.recompute();
      });

      self.recompute();
    },

    recompute() {
      const months = S().months();
      const r = V.Simulate.run(S().entries, simulate.positions, months, S().org.headcount);
      const el = $("#simResult");
      if (!el) return;

      $("#simPeriod").textContent = `${months.length} MONTH PERIOD`;

      el.innerHTML = `
        <div><div class="eyebrow">Saving</div>
          <div class="sim-delta" style="color:${r.savingKg > 0 ? "var(--good)" : "var(--text-3)"}">
            ${r.savingKg > 0 ? "−" : ""}${nf(Math.abs(r.savingPct), 0)}%</div>
          <div class="kpi-note">${tonnes(r.savingKg)} t over the period</div></div>
        <div><div class="eyebrow">Score</div>
          <div class="grade-move">
            <span class="gm" style="color:${V.bandVar(r.baseScore.composite)}">${r.baseScore.grade}</span>
            <span class="gm-arrow">${icon("arrow", 15)}</span>
            <span class="gm" style="color:${V.bandVar(r.simScore.composite)}">${r.simScore.grade}</span></div>
          <div class="kpi-note">${nf(r.baseScore.composite,1)} → ${nf(r.simScore.composite,1)}</div></div>
        <div><div class="eyebrow">Annualised</div>
          <div class="sim-delta" style="font-size:22px">${tonnes(r.annualisedSaving)}<span
            style="font-size:var(--fs-small);color:var(--text-3)"> t/yr</span></div>
          <div class="kpi-note">${r.active.length} lever${r.active.length===1?"":"s"} engaged</div></div>`;

      /* waterfall */
      const steps = [{ label:"Current net", value: r.baseAgg.net, type:"total" }];
      r.attribution.forEach(a => steps.push({
        label: a.lever.name, value: -a.saving, note: `${a.pct}% · run alone`
      }));
      if (Math.abs(r.overlap) > 1) steps.push({ label:"Lever overlap", value: r.overlap,
        note:"double-counting removed" });
      steps.push({ label:"Simulated net", value: r.simAgg.net, type:"total" });
      V.Charts.waterfall($("#waterfallWrap"), steps);

      $("#simNote").innerHTML = r.active.length
        ? `Each lever is also run <b>alone</b> to attribute its saving. Because levers overlap —
           solar and a PPA both displace the same grid draw — the solo savings sum to
           <b>${tonnes(r.attribution.reduce((s,a)=>s+a.saving,0))} t</b> while the combined
           saving is <b>${tonnes(r.savingKg)} t</b>. The difference is shown as its own bar
           rather than hidden.`
        : `Move a lever to model an intervention. Each one rewrites a copy of the ledger and
           re-runs the production scoring engine — there is no estimate anywhere in the model.`;

      /* score movement */
      $("#simScores").innerHTML = r.simScore.subscores.map((s, i) => {
        const base = r.baseScore.subscores[i];
        const delta = s.value - base.value;
        return `<div class="meter-row">
            <span class="m-name">${s.label}</span>
            <span class="m-val">${nf(base.value,0)} <span style="color:var(--text-4)">→</span>
              <span style="color:${V.bandVar(s.value)}">${nf(s.value,0)}</span>
              ${Math.abs(delta) >= 0.5 ? `<span style="color:var(--good)"> ${signed(delta,0)}</span>` : ""}</span>
            <span class="meter">
              <i style="width:${V.clamp01(s.value/100)*100}%;background:${V.bandVar(s.value)}"></i>
              <u style="left:${V.clamp01(base.value/100)*100}%"></u></span>
          </div>`;
      }).join("");

      /* attribution */
      const max = Math.max(1, ...r.attribution.map(a => a.saving));
      $("#simAttrib").innerHTML = r.attribution.length ? r.attribution.map(a => `
        <div class="meter-row">
          <span class="m-name">${escapeHtml(a.lever.name)} <em>· ${a.pct}%</em></span>
          <span class="m-val" style="color:var(--good)">${tonnes(a.saving)} t</span>
          <span class="meter"><i style="width:${(a.saving/max)*100}%;background:var(--good)"></i></span>
        </div>`).join("")
        : `<div class="empty"><p>No levers engaged yet.</p></div>`;
    }
  };

  /* ══════════════════════════════════════════════════════════════════
     3 · POST ENTRY
     ══════════════════════════════════════════════════════════════════ */
  const post = {
    title: "Add activity",
    crumb: "TRACK",
    form: { cat:"electricity", factorId:1, qty:17800, date:null, ref:"", dept:"facilities" },

    render() {
      if (!post.form.date) post.form.date = V.todayISO();
      return `
        <div class="module">
          <div class="wall g-split" style="grid-template-columns:minmax(0,1fr) minmax(0,340px)">
            <div class="panel">
              <div class="panel-hd"><h2>Add an activity</h2>
                <span class="hd-note">CO₂ WORKED OUT FOR YOU</span></div>
              <div class="cat-grid" id="catGrid"></div>

              <div class="form-row c3">
                <div class="field"><label for="actSel">Activity</label>
                  <select id="actSel" class="ctl"></select></div>
                <div class="field"><label for="qtyIn">Quantity</label>
                  <div class="qty-wrap"><input id="qtyIn" class="ctl ctl-mono ctl-right" type="number"
                    step="any" min="0" inputmode="decimal"><span class="unit" id="qtyUnit">kWh</span></div></div>
                <div class="field"><label for="dateIn">Activity date</label>
                  <input id="dateIn" class="ctl" type="date"></div>
              </div>

              <div class="form-row c2">
                <div class="field"><label for="deptSel">Department</label>
                  <select id="deptSel" class="ctl">${V.DEPARTMENTS.map(d =>
                    `<option value="${d.id}">${d.name}</option>`).join("")}</select></div>
                <div class="field"><label for="refIn">Reference</label>
                  <input id="refIn" class="ctl" type="text" placeholder="Invoice, meter, PO number"
                    autocomplete="off"></div>
              </div>

              <div class="readout" id="readout">
                <div class="ro-top"><span class="eyebrow">Carbon impact</span>
                  <span class="ro-calc" id="roCalc"></span></div>
                <div class="ro-out" id="roOut">—</div>
                <div class="ro-meta" id="roMeta"></div>
                <div class="ro-cite" id="roCite"></div>
              </div>

              <div class="row center wrapflex mt-16" style="gap:12px">
                <button class="btn btn-primary" id="postBtn">${icon("plus",14)} Add activity</button>
                <span class="kpi-note">NOTHING IS SAVED UNTIL YOU CLICK ADD</span>
              </div>
            </div>

            <div class="panel panel-flush">
              <div class="panel-hd" style="padding:16px 18px 0;margin-bottom:6px">
                <h2>Recently added</h2></div>
              <div id="recent"></div>
            </div>
          </div>
        </div>`;
    },

    mount() {
      post.paint();
      $("#actSel").onchange = e => { post.form.factorId = +e.target.value; post.readout(); };
      $("#qtyIn").oninput   = e => { post.form.qty = parseFloat(e.target.value); post.readout(); };
      $("#dateIn").onchange = e => { post.form.date = e.target.value; };
      $("#deptSel").onchange= e => { post.form.dept = e.target.value; };
      $("#refIn").oninput   = e => { post.form.ref = e.target.value; };
      $("#refIn").onkeydown = e => { if (e.key === "Enter") post.submit(); };
      $("#postBtn").onclick = () => post.submit();
    },

    paint() {
      $("#catGrid").innerHTML = V.CATEGORIES.map(c => `
        <button class="cat-btn ${c.id === post.form.cat ? "on" : ""}" data-cat="${c.id}"
          aria-pressed="${c.id === post.form.cat}">
          <span class="cb-name"><i style="background:${V.catColor(c.id)}"></i>${c.name}</span>
          <span class="cb-kind">${c.kind === "credit" ? "saves carbon" : "adds carbon"}</span>
        </button>`).join("");

      $$("#catGrid .cat-btn").forEach(b => b.addEventListener("click", () => {
        post.form.cat = b.dataset.cat;
        post.form.factorId = V.FACTORS.find(f => f.cat === post.form.cat).id;
        post.paint();
      }));

      const opts = V.FACTORS.filter(f => f.cat === post.form.cat);
      if (!opts.some(f => f.id === post.form.factorId)) post.form.factorId = opts[0].id;
      $("#actSel").innerHTML = opts.map(f =>
        `<option value="${f.id}" ${f.id === post.form.factorId ? "selected" : ""}>${escapeHtml(f.label)}</option>`).join("");

      $("#qtyIn").value = post.form.qty;
      $("#dateIn").value = post.form.date;
      $("#dateIn").max = V.todayISO();
      $("#deptSel").value = post.form.dept;
      $("#refIn").value = post.form.ref;

      post.readout();
      post.recent();
    },

    readout() {
      const f = V.byId[post.form.factorId];
      const qty = post.form.qty;
      $("#qtyUnit").textContent = f.unit;
      const valid = qty > 0 && Number.isFinite(qty);
      $("#readout").classList.toggle("pending", !valid);
      $("#postBtn").disabled = !valid;

      if (!valid) {
        $("#roCalc").textContent = "awaiting a quantity";
        $("#roOut").innerHTML = "—";
        $("#roMeta").innerHTML = ""; $("#roCite").textContent = "";
        return;
      }

      const co2 = Math.round(qty * f.f * 1000) / 1000;
      $("#roCalc").textContent = `${nf(qty, qty<10?2:0)} ${f.unit} × ${f.f<0?"−":""}${Math.abs(f.f)} kg/${f.unit}`;
      $("#roOut").innerHTML = `${co2<0?"−":""}${nf(Math.abs(co2),1)}<span>kg CO₂e</span>`;
      $("#roOut").style.color = co2 < 0 ? "var(--good)" : "var(--text-1)";

      const feeds = [
        f.rk === "energy" && f.ren ? "renewable share" : null,
        f.div ? "waste diversion" : null,
        f.low ? "low-carbon mobility" : null,
        f.rk === "water" ? "water intensity" : null,
        f.rk === "paper" ? "paper intensity" : null
      ].filter(Boolean);

      $("#roMeta").innerHTML = `
        <span class="chip chip-flat"><i></i>Scope ${f.scope}</span>
        <span class="chip ${co2<0?"chip-good":"chip-warn"}"><i></i>${co2<0?"Credit":"Charge"}</span>
        <span class="chip chip-flat"><i></i>${V.srcTag(f.src)}</span>
        ${feeds.length ? `<span class="chip chip-flat"><i></i>feeds ${feeds.join(" + ")}</span>` : ""}`;
      $("#roCite").textContent = f.src;
    },

    async submit() {
      try {
        const entry = await S().addEntry({ ...post.form });
        const f = V.byId[entry.factorId];
        toast("Activity added",
          `${f.label} · ${entry.co2<0?"−":""}${nf(Math.abs(entry.co2),1)} kg CO₂e`);
        post.form.ref = "";
        post.paint();
        V.App.refreshShell();
      } catch (err) {
        toast("Could not post the entry", err.message, "err");
      }
    },

    recent() {
      const rows = V.Chain.order(S().live()).slice(-9).reverse();
      $("#recent").innerHTML = rows.length ? rows.map(e => {
        const f = V.byId[e.factorId];
        return `<div class="recent-row">
            <span class="rr-name"><i style="background:${V.catColor(f.cat)}"></i>${escapeHtml(f.label)}</span>
            <span class="rr-val ${e.co2<0?"credit":""}">${e.co2<0?"−":""}${nf(Math.abs(e.co2),1)}</span>
            <span class="rr-meta">${V.dateLabel(e.date)} · ${nf(e.qty, e.qty<10?2:0)} ${f.unit}${
              e.ref ? " · " + escapeHtml(e.ref) : ""}</span>
          </div>`;
      }).join("") : `<div class="empty"><p>No entries yet.</p></div>`;
    }
  };

  /* ══════════════════════════════════════════════════════════════════
     4 · LEDGER
     ══════════════════════════════════════════════════════════════════ */
  const ledger = {
    title: "Activity log",
    crumb: "TRACK",
    f: { cat:"", month:"", scope:"", dept:"", q:"", voided:false },
    sort: { key:"date", dir:-1 },
    page: 1, size: 25,

    render() {
      return `
        <div class="module"><div class="wall"><div class="panel panel-flush">
          <div class="panel-hd" style="padding:16px 18px 0">
            <h2>Activity log</h2><span class="hd-note" id="ledgerCount"></span></div>

          <div style="padding:0 18px 16px">
            <div class="filters">
              <div class="field"><label for="fCat">Category</label><select id="fCat" class="ctl">
                <option value="">All categories</option>
                ${V.CATEGORIES.map(c=>`<option value="${c.id}">${c.name}</option>`).join("")}</select></div>
              <div class="field"><label for="fMonth">Month</label><select id="fMonth" class="ctl"></select></div>
              <div class="field"><label for="fDept">Department</label><select id="fDept" class="ctl">
                <option value="">All departments</option>
                ${V.DEPARTMENTS.map(d=>`<option value="${d.id}">${d.name}</option>`).join("")}</select></div>
              <div class="field"><label for="fScope">Emission type</label><select id="fScope" class="ctl">
                <option value="">All scopes</option><option value="1">Scope 1</option>
                <option value="2">Scope 2</option><option value="3">Scope 3</option></select></div>
              <div class="field grow"><label for="fSearch">Search</label>
                <input id="fSearch" class="ctl" type="search" placeholder="Activity or reference — press /"></div>
              <label class="check" style="padding-bottom:10px"><input type="checkbox" id="fVoided"> show voided</label>
              <button class="btn" id="csvBtn">${icon("download",14)} Export CSV</button>
            </div>
          </div>

          <div class="tbl-scroll">
            <table id="ledgerTable">
              <thead><tr>
                <th class="sortable" data-key="date" style="width:108px">Date <span class="arrow"></span></th>
                <th style="width:126px">Category</th>
                <th>Activity</th>
                <th style="width:120px">Department</th>
                <th class="r sortable" data-key="qty" style="width:126px">Quantity <span class="arrow"></span></th>
                <th class="r sortable" data-key="co2" style="width:112px">kg CO₂e <span class="arrow"></span></th>
                <th style="width:58px">Scope</th><th style="width:44px"></th>
              </tr></thead>
              <tbody id="ledgerBody"></tbody>
            </table>
          </div>

          <div class="tbl-foot">
            <span id="ledgerSum"></span><div class="pager" id="pager"></div>
          </div>
        </div></div></div>`;
    },

    mount() {
      const L = ledger;
      $("#fCat").value = L.f.cat; $("#fScope").value = L.f.scope;
      $("#fDept").value = L.f.dept; $("#fSearch").value = L.f.q; $("#fVoided").checked = L.f.voided;

      $("#fCat").onchange   = e => { L.f.cat = e.target.value; L.page = 1; L.paint(); };
      $("#fScope").onchange = e => { L.f.scope = e.target.value; L.page = 1; L.paint(); };
      $("#fDept").onchange  = e => { L.f.dept = e.target.value; L.page = 1; L.paint(); };
      $("#fSearch").oninput = e => { L.f.q = e.target.value; L.page = 1; L.paint(); };
      $("#fVoided").onchange= e => { L.f.voided = e.target.checked; L.page = 1; L.paint(); };
      $("#csvBtn").onclick  = () => {
        V.UI.download(`terrawise-activity-${V.todayISO()}.csv`, S().csv());
        toast("Activity log downloaded", `${S().entries.length} rows`);
      };
      $$("#ledgerTable th.sortable").forEach(th => th.addEventListener("click", () => {
        const k = th.dataset.key;
        L.sort = L.sort.key === k ? { key:k, dir:-L.sort.dir } : { key:k, dir:-1 };
        L.paint();
      }));
      L.paint();
    },

    paint() {
      const L = ledger;
      const months = [...new Set(S().entries.map(e => V.ymOf(e.date)))].sort().reverse();
      $("#fMonth").innerHTML = `<option value="">All months</option>` +
        months.map(m => `<option value="${m}" ${m===L.f.month?"selected":""}>${V.monthLabel(m)}</option>`).join("");
      $("#fMonth").onchange = e => { L.f.month = e.target.value; L.page = 1; L.paint(); };

      const q = L.f.q.trim().toLowerCase();
      let rows = S().entries.filter(e => {
        const f = V.byId[e.factorId]; if (!f) return false;
        if (!L.f.voided && e.status === "voided") return false;
        if (L.f.cat && f.cat !== L.f.cat) return false;
        if (L.f.month && V.ymOf(e.date) !== L.f.month) return false;
        if (L.f.scope && String(f.scope) !== L.f.scope) return false;
        if (L.f.dept && e.dept !== L.f.dept) return false;
        if (q && !`${f.label} ${e.ref} ${V.CAT[f.cat].name}`.toLowerCase().includes(q)) return false;
        return true;
      });

      const dir = L.sort.dir;
      rows.sort((a, b) => L.sort.key === "co2" ? (a.co2 - b.co2) * dir
        : L.sort.key === "qty" ? (a.qty - b.qty) * dir
        : (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) * dir);

      $$("#ledgerTable th.sortable").forEach(th => {
        th.querySelector(".arrow").textContent =
          th.dataset.key === L.sort.key ? (dir === -1 ? "▼" : "▲") : "";
      });

      const total = rows.length;
      const pages = Math.max(1, Math.ceil(total / L.size));
      L.page = Math.min(L.page, pages);
      const slice = rows.slice((L.page - 1) * L.size, L.page * L.size);

      $("#ledgerBody").innerHTML = slice.length ? slice.map(e => {
        const f = V.byId[e.factorId], c = V.CAT[f.cat], voided = e.status === "voided";
        return `<tr class="${voided?"voided":""}">
          <td class="mono faint" style="white-space:nowrap">${V.dateLabel(e.date)}</td>
          <td><span class="dot-tag"><i style="background:${V.catColor(f.cat)}"></i>${c.name}</span></td>
          <td><span class="${voided?"strike":""}">${escapeHtml(f.label)}</span>
            ${e.ref ? `<div class="faint" style="font-size:var(--fs-micro);margin-top:2px">${escapeHtml(e.ref)}</div>` : ""}
            ${voided && e.voidReason ? `<div style="color:var(--bad);font-size:var(--fs-micro);margin-top:2px">voided — ${escapeHtml(e.voidReason)}</div>` : ""}</td>
          <td class="faint">${V.DEPT[e.dept]?.name || "—"}</td>
          <td class="r">${nf(e.qty, e.qty<10?2:0)} <span class="faint">${f.unit}</span></td>
          <td class="r ${e.co2<0&&!voided?"credit":""}"><span class="${voided?"strike":""}">${e.co2<0?"−":""}${nf(Math.abs(e.co2),1)}</span></td>
          <td class="mono faint">S${f.scope}</td>
          <td>${voided?"":`<button class="icon-btn" data-void="${e.id}" title="Void entry" aria-label="Void entry">${icon("close",13)}</button>`}</td>
        </tr>`;
      }).join("") : `<tr><td colspan="8"><div class="empty">
          <div class="e-title">Nothing matches these filters</div>
          <p>Clear a filter, or widen the month range.</p></div></td></tr>`;

      $("#ledgerBody").onclick = async ev => {
        const btn = ev.target.closest("[data-void]"); if (!btn) return;
        const entry = S().byId(btn.dataset.void);
        const f = V.byId[entry.factorId];
        const reason = await dialog({
          title: "Void this entry?",
          body: `<p><b>${escapeHtml(f.label)}</b> — ${nf(entry.qty,0)} ${f.unit} on
                 ${V.dateLabel(entry.date)}, ${nf(Math.abs(entry.co2),1)} kg CO₂e.</p>
                 <p style="margin-top:8px">The row is kept for audit and struck through — it stops
                 counting toward every total. A reason is required, and the ledger has no delete.</p>`,
          confirmLabel: "Void entry", danger: true,
          input: { label: "Reason", placeholder: "Duplicate of invoice 4471" }
        });
        if (!reason) return;
        await S().voidEntry(entry.id, reason);
        toast("Entry voided", "Kept for audit, removed from every total", "info");
        ledger.paint();
        V.App.refreshShell();
      };

      const net = rows.reduce((s, e) => s + (e.status === "voided" ? 0 : e.co2), 0);
      const issued = rows.filter(e => e.status !== "voided" && e.co2 > 0).reduce((s, e) => s + e.co2, 0);
      $("#ledgerSum").innerHTML =
        `<b>${total}</b> matching · issued <b>${nf(issued,0)}</b> kg · net <b>${nf(net,0)}</b> kg CO₂e`;
      $("#ledgerCount").textContent = `${S().entries.length} ON FILE`;

      const from = Math.max(1, Math.min(L.page - 2, pages - 4));
      const to = Math.min(pages, from + 4);
      let html = `<button ${L.page===1?"disabled":""} data-page="${L.page-1}">‹</button>`;
      for (let p = from; p <= to; p++)
        html += `<button class="${p===L.page?"on":""}" data-page="${p}">${p}</button>`;
      html += `<button ${L.page===pages?"disabled":""} data-page="${L.page+1}">›</button>`;
      const pager = $("#pager");
      pager.innerHTML = html;
      pager.onclick = ev => {
        const b = ev.target.closest("[data-page]");
        if (!b || b.disabled) return;
        L.page = +b.dataset.page; L.paint(); $(".canvas").scrollTop = 0;
      };
    }
  };

  /* ══════════════════════════════════════════════════════════════════
     5 · INTEGRITY
     ══════════════════════════════════════════════════════════════════ */
  const integrity = {
    title: "Data check",
    crumb: "VERIFY",
    render() {
      return `
        <div class="module">
          <div class="wall"><div class="panel">
            <div class="panel-hd"><h2>Is the data untouched?</h2>
              <span class="hd-note">EVERY ENTRY IS LOCKED TO THE ONE BEFORE IT</span></div>
            <div class="chain-head" id="chainHead"></div>
            <div class="row wrapflex mt-16" style="gap:10px">
              <button class="btn btn-primary" id="verifyBtn">${icon("shield",14)} Check all records</button>
              <button class="btn" id="tamperBtn">${icon("warning",14)} Try editing a record</button>
              <button class="btn" id="resealBtn">${icon("reset",14)} Reset the lock</button>
            </div>
            <div class="verify-bar" id="verifyBar" hidden><i></i></div>
            <div id="verifyOut" class="mt-16"></div>
          </div></div>

          <div class="wall g2 stack">
            <div class="panel">
              <div class="panel-hd"><h2>How it works <span class="faint">(technical)</span></h2></div>
              <div class="prose" style="font-size:var(--fs-small)">
                <p>Each entry is hashed together with the hash of the entry before it:</p>
              </div>
              <div class="code-block" style="margin-top:12px">H(0) = 0000…0000                     (genesis)
H(n) = SHA-256( H(n−1) ‖ canonical(entry n) )

canonical(e) = id | date | factor_id | qty(3dp)
             | co2e(3dp) | dept | status | reference</div>
              <div class="prose mt-12" style="font-size:var(--fs-small)">
                <p>Fixing the field order and the numeric precision matters: if the serialisation
                   varied, two machines would compute different digests for the same ledger and
                   the proof would be worthless.</p>
                <p>SHA-256 is implemented in the project rather than taken from
                   <code>crypto.subtle</code>, which is unavailable on <code>file://</code> pages.
                   The implementation was verified byte-for-byte against Node's crypto module.</p>
              </div>
            </div>
            <div class="panel panel-flush">
              <div class="panel-hd" style="padding:16px 18px 0;margin-bottom:0">
                <h2>Block explorer</h2><span class="hd-note" id="blockCount"></span></div>
              <div class="chain-steps" id="blocks"></div>
            </div>
          </div>
        </div>`;
    },

    mount() {
      integrity.paintHead();
      integrity.paintBlocks();
      $("#verifyBtn").onclick = () => integrity.verify();
      $("#resealBtn").onclick = () => {
        S().reseal(); S().persist();
        integrity.paintHead(); integrity.paintBlocks();
        $("#verifyOut").innerHTML = "";
        toast("Records locked again", "Every record re-checked from the start", "info");
      };
      $("#tamperBtn").onclick = async () => {
        const ok = await dialog({
          title: "Try editing a record?",
          body: `<p>This will silently alter the quantity on one historical entry — exactly what
                 a bad actor editing the database directly would do — <b>without</b> updating its
                 hash.</p><p style="margin-top:8px">Then run the verifier and watch it find the
                 row. Re-sealing afterwards restores a clean chain.</p>`,
          confirmLabel: "Alter an entry"
        });
        if (!ok) return;
        const result = S().tamper();
        if (!result) return;
        integrity.paintBlocks();
        toast("Entry altered", `${result.entry.id}: ${nf(result.before,2)} → ${nf(result.entry.qty,2)}`, "err");
        integrity.verify();
      };
    },

    paintHead() {
      const head = S().head;
      const r = S().verifyChain();
      $("#chainHead").className = "chain-head" + (r.ok ? "" : " broken");
      $("#chainHead").innerHTML = `
        <div class="ch-ico">${icon(r.ok ? "shield" : "warning", 19)}</div>
        <div style="flex:1;min-width:0">
          <div class="ch-label">Data-check code · ${S().entries.length} records</div>
          <div class="ch-hash">${S().head}</div>
        </div>
        <span class="chip ${r.ok ? "chip-good" : "chip-bad"}"><i></i>${r.ok ? "Sealed" : "Broken"}</span>`;
    },

    paintBlocks() {
      const ordered = V.Chain.order(S().entries);
      $("#blockCount").textContent = `${ordered.length} BLOCKS`;
      $("#blocks").innerHTML = ordered.slice(-60).reverse().map((e, i) => {
        const n = ordered.length - i;
        const f = V.byId[e.factorId];
        return `<div class="chain-step" data-block="${e.id}">
            <span class="cs-n">${n}</span>
            <span style="min-width:0"><span style="display:block;white-space:nowrap;overflow:hidden;
              text-overflow:ellipsis">${escapeHtml(f.label)}</span>
              <span class="cs-hash">${V.Chain.shortHash(e.hash)}</span></span>
            <span class="cs-hash">${V.dateLabel(e.date)}</span>
          </div>`;
      }).join("");
    },

    async verify() {
      const bar = $("#verifyBar");
      const fill = bar.querySelector("i");
      bar.hidden = false; bar.classList.remove("broken");
      fill.style.width = "0%";
      $("#verifyOut").innerHTML = "";

      const ordered = V.Chain.order(S().entries);
      const total = ordered.length;

      // Walk visibly — the point of this screen is to be watched.
      const result = S().verifyChain();
      const stopAt = result.ok ? total : result.checked;
      let i = 0;
      await new Promise(resolve => {
        const tick = () => {
          i = Math.min(stopAt, i + Math.max(1, Math.ceil(total / 40)));
          fill.style.width = `${(i / total) * 100}%`;
          if (i < stopAt) requestAnimationFrame(tick); else resolve();
        };
        requestAnimationFrame(tick);
      });

      if (!result.ok) bar.classList.add("broken");
      integrity.paintHead();

      $$("#blocks .chain-step").forEach(node => {
        node.classList.remove("ok", "fail");
        if (result.ok) node.classList.add("ok");
        else if (node.dataset.block === result.brokenAt) node.classList.add("fail");
      });

      $("#verifyOut").innerHTML = result.ok ? `
        <div class="finding"><div class="f-sev good">${icon("check",14)}</div>
          <div><h3>Chain verified — ${result.checked} of ${total} blocks</h3>
            <p>Every block's recomputed hash matches its stored hash, and the final hash matches
               the stored head. No entry has been altered since it was posted.</p>
            <div class="f-meta"><span class="chip chip-good"><i></i>HEAD ${V.Chain.shortHash(result.head)}</span></div>
          </div></div>`
        : `<div class="finding"><div class="f-sev high">${icon("warning",14)}</div>
          <div><h3>Chain broken at block ${result.checked} of ${total}</h3>
            <p>Entry <b>${escapeHtml(result.firstBreak.id)}</b> dated
               ${V.dateLabel(result.firstBreak.date)} no longer hashes to its stored value. Every
               block after it is therefore unverifiable.</p>
            <div class="code-block" style="margin-top:10px;font-size:var(--fs-micro)">stored      ${result.firstBreak.stored}
recomputed  ${result.firstBreak.recomputed}</div>
            <div class="f-meta">
              <span class="chip chip-bad"><i></i>TAMPER DETECTED</span>
              <button class="chip chip-accent" id="fixChain"><i></i>Reset the lock</button>
            </div>
          </div></div>`;

      const fix = $("#fixChain");
      if (fix) fix.onclick = () => $("#resealBtn").click();

      toast(result.ok ? "Chain verified" : "Chain broken",
        result.ok ? `${total} blocks · head matches` : `first failure at ${result.firstBreak.id}`,
        result.ok ? "ok" : "err");
    }
  };

  /* ══════════════════════════════════════════════════════════════════
     6 · INSIGHTS
     ══════════════════════════════════════════════════════════════════ */
  const insights = {
    title: "Insights",
    crumb: "PLAN",
    render() {
      return `
        <div class="module">
          <div class="wall g4" id="insightKpis"></div>
          ${`<div class="wall stack">` +
            chartPanel("Your carbon so far, and where it is heading", "SHADED AREA = LIKELY RANGE",
              "forecastWrap", `<div class="legend">
                <span><i class="line" style="background:var(--text-2)"></i>MEASURED</span>
                <span><i class="line" style="background:var(--accent)"></i>PROJECTED</span>
                <span><i style="background:var(--accent);opacity:.3"></i>95% INTERVAL</span>
              </div><div class="stat-strip" id="forecastStats"></div>`) + `</div>`}

          <div class="wall stack"><div class="panel panel-flush">
            <div class="panel-hd" style="padding:16px 18px 0;margin-bottom:6px">
              <h2>Anomalies</h2>
              <span class="hd-note">MONTHS THAT WERE FAR ABOVE NORMAL</span></div>
            <div id="anomalyList"></div>
          </div></div>

          ${`<div class="wall stack">` +
            chartPanel("Intensity by category and month", "DARKER = HIGHER", "heatWrap") + `</div>`}
        </div>`;
    },

    mount() {
      const history = S().history(12);
      const fc = V.Analytics.forecast(history, 6);
      const anomalies = V.Analytics.detectAnomalies(S().entries, { months: 12 });
      const bad = anomalies.filter(a => !a.isGood);

      $("#insightKpis").innerHTML = [
        { l:"Unusual months", v:anomalies.length, note:`${bad.length} worth checking`,
          chip: bad.length ? "bad" : "good" },
        { l:"Direction", v:`${signed(fc.trendPerMonth/1000,2)}`, unit:" t a month",
          note: fc.trendPerMonth < 0 ? "going down" : "going up", chip: fc.trendPerMonth < 0 ? "good" : "warn" },
        { l:"Yearly pace", v:nf(fc.annualRunRate/1000,1), unit:" t a year",
          note:"based on the last 3 months", chip:"flat" },
        { l:"Expected in 6 months", v:nf(fc.projection[5].net/1000,1), unit:" t a month",
          note:`range ${nf(fc.projection[5].lower/1000,1)}–${nf(fc.projection[5].upper/1000,1)}`,
          chip:"flat" }
      ].map(k => `
        <div class="panel kpi">
          <div><div class="eyebrow">${k.l}</div>
            <div class="fig" style="margin-top:8px">${k.v}${k.unit?`<u>${k.unit}</u>`:""}</div></div>
          <div class="kpi-foot"><span class="chip chip-${k.chip}"><i></i>${k.note}</span></div>
        </div>`).join("");

      V.Charts.forecastLine($("#forecastWrap"), history, fc.projection);
      $("#forecastStats").innerHTML = [
        { l:"Change each month", v:`${signed(fc.trendPerMonth,0)} kg`, s:"on average" },
        { l:"How reliable", v: fc.confidence >= 0.6 ? "Fairly sure" : fc.confidence >= 0.3 ? "Rough guess" : "Very rough",
          s: fc.confidence > 0.5 ? "a usable trend" : "noisy — treat with caution" },
        { l:"Next year", v:`${signed(fc.trendPerYearPct,0)}%`, s:"if nothing changes" }
      ].map(x => `<div><div class="sl">${x.l}</div><div class="sv">${x.v}</div>
        <div class="ss">${x.s}</div></div>`).join("");

      $("#anomalyList").innerHTML = anomalies.length ? anomalies.slice(0, 10).map(a => `
        <div class="finding">
          <div class="f-sev ${a.isGood ? "good" : a.severity}">${icon(a.isGood ? "check" : "warning", 14)}</div>
          <div>
            <h3>${escapeHtml(a.factor.label)} · ${V.monthLabel(a.month)}</h3>
            <p>${V.Analytics.explain(a)}</p>
            <div class="f-meta">
              <span class="chip chip-${a.isGood ? "good" : a.severity === "high" ? "bad" : "warn"}">
                <i></i>${a.severity === "high" ? "Very unusual" : "Unusual"}</span>
              <span class="chip chip-flat"><i></i>${signed(a.deltaPct,0)}% vs expected</span>
              <span class="chip chip-flat"><i></i>${a.isGood ? "saved" : "cost"} ${tonnes(Math.abs(a.co2Impact))} t</span>
              <span class="chip chip-outline">${V.CAT[a.category].name}</span>
            </div>
          </div>
        </div>`).join("")
        : `<div class="empty"><div class="e-title">No anomalies</div>
           <p>Every activity is within 2.5 standard deviations of its own trailing average.</p></div>`;

      const months = V.periodMonths(12);
      const agg = V.aggregate(S().entries, months);
      const cats = V.CATEGORIES.filter(c => c.kind === "charge")
        .map(c => ({ ...c, color: V.catColor(c.id) }));
      const perMonth = {};
      months.forEach(m => {
        const a = V.aggregate(S().entries, [m]);
        perMonth[m] = a.byCat;
      });
      V.Charts.heatmap($("#heatWrap"), months, cats, (catId, m) => perMonth[m][catId] || 0);
    }
  };

  /* ══════════════════════════════════════════════════════════════════
     7 · TARGETS
     ══════════════════════════════════════════════════════════════════ */
  const targets = {
    title: "Goals",
    crumb: "PLAN",
    render() {
      return `
        <div class="module">
          <div class="wall"><div class="panel">
            <div class="panel-hd"><h2>Your carbon budget</h2>
              <span class="hd-note" id="budgetNote"></span></div>
            <div class="budget-gauge" id="budgetGauge"></div>
            <div class="countdown" id="countdown"></div>
            <div class="prose mt-16" style="font-size:var(--fs-small)" id="budgetProse"></div>
          </div></div>

          ${`<div class="wall stack">` +
            chartPanel("The path to your goal", "WHAT YOU CAN EMIT EACH YEAR", "budgetWrap",
              `<div class="legend">
                <span><i style="background:var(--good)"></i>ALLOWED UNDER THE PATHWAY</span>
                <span><i class="line" style="background:var(--bad)"></i>CURRENT RUN RATE</span>
              </div>`) + `</div>`}

          <div class="wall g2 stack">
            <div class="panel">
              <div class="panel-hd"><h2>Target settings</h2></div>
              <div class="form-row c2" style="margin-top:0">
                <div class="field"><label for="tgtYear">Target year</label>
                  <input id="tgtYear" class="ctl ctl-mono" type="number" min="2026" max="2050"></div>
                <div class="field"><label for="tgtPct">Reduction vs baseline</label>
                  <div class="qty-wrap"><input id="tgtPct" class="ctl ctl-mono ctl-right" type="number"
                    min="5" max="100" step="1"><span class="unit">%</span></div></div>
              </div>
              <div class="prose mt-16" style="font-size:var(--fs-small)">
                <p>The default follows the <b>1.5 °C climate goal</b>: a 42% absolute reduction
                   by 2030 against the baseline year. Changing either value recomputes the budget,
                   the glide path and the exhaustion date immediately.</p>
              </div>
            </div>
            <div class="panel panel-flush">
              <div class="panel-hd" style="padding:16px 18px 0;margin-bottom:6px">
                <h2>What this actually means</h2>
                <span class="hd-note">HUMAN-SCALE EQUIVALENTS</span></div>
              <div style="padding:0 18px 18px"><div class="equiv-grid" id="equivGrid"></div></div>
            </div>
          </div>
        </div>`;
    },

    mount() {
      $("#tgtYear").value = S().org.targetYear;
      $("#tgtPct").value = S().org.reductionPct;
      $("#tgtYear").onchange = e => {
        S().setOrg({ targetYear: Math.max(2026, Math.min(2050, +e.target.value || 2030)) });
        targets.paint();
      };
      $("#tgtPct").onchange = e => {
        S().setOrg({ reductionPct: Math.max(5, Math.min(100, +e.target.value || 42)) });
        targets.paint();
      };
      targets.paint();
    },

    paint() {
      const history = S().history(12);
      const budget = V.Analytics.carbonBudget(history, {
        targetYear: S().org.targetYear, reductionPct: S().org.reductionPct
      });

      $("#budgetNote").textContent =
        `${S().org.reductionPct}% BY ${S().org.targetYear} · BASELINE ${nf(budget.baseline/1000,0)} t/yr`;

      const used = V.clamp01(budget.currentAnnual / (budget.allowanceNow || 1));
      const gauge = $("#budgetGauge");
      gauge.innerHTML = `
        <i style="width:${Math.min(100, used*100)}%;background:${budget.onTrack ? "var(--good)" : "var(--bad)"}"></i>
        <u style="left:100%"></u>
        <div class="bg-label">
          <span>${nf(budget.currentAnnual/1000,0)} t/yr emitted</span>
          <span>${nf(budget.allowanceNow/1000,0)} t/yr allowed now</span>
        </div>`;

      $("#countdown").innerHTML = [
        { v: nf(budget.remainingBudget/1000, 0), l: "t CO₂e remaining",
          c: budget.onTrack ? "var(--good)" : "var(--warn)" },
        { v: nf(budget.yearsLeft, 1), l: "years to target", c: "var(--text-1)" },
        { v: budget.exhaustDate ? budget.exhaustDate.toISOString().slice(0, 7) : "—",
          l: "budget runs out",
          c: budget.exhaustsBeforeTarget ? "var(--bad)" : "var(--good)" },
        { v: `${signed(budget.gapPct, 0)}%`, l: "vs where you should be",
          c: budget.onTrack ? "var(--good)" : "var(--bad)" }
      ].map(c => `<div><div class="cd-v" style="color:${c.c}">${c.v}</div>
        <div class="cd-l">${c.l}</div></div>`).join("");

      $("#budgetProse").innerHTML = budget.onTrack
        ? `At <b>${nf(budget.currentAnnual/1000,1)} t/yr</b> the organisation is <b>inside</b> the
           ${nf(budget.allowanceNow/1000,1)} t allowance the pathway permits this year. Holding
           this rate reaches the ${S().org.targetYear} target with room to spare.`
        : `At <b>${nf(budget.currentAnnual/1000,1)} t/yr</b> the organisation is emitting
           <b>${nf(budget.gapPct,0)}%</b> more than the ${nf(budget.allowanceNow/1000,1)} t the
           pathway permits this year. At this rate the remaining budget of
           <b>${nf(budget.remainingBudget/1000,0)} t</b> runs out in
           <b>${budget.exhaustDate ? budget.exhaustDate.toISOString().slice(0,7) : "—"}</b> —
           ${budget.exhaustsBeforeTarget
             ? `<b>${nf(budget.yearsLeft - budget.yearsToExhaust,1)} years before</b> the target date.`
             : "after the target date."}
           The simulator can model what closes the gap.`;

      V.Charts.budgetPath($("#budgetWrap"), budget.path, budget.currentAnnual, new Date().getFullYear());

      const { agg } = S().summary(12);
      $("#equivGrid").innerHTML = V.Analytics.translate(agg.net).map(e => `
        <div class="equiv">
          <div class="eq-v">${nf(e.value, e.value >= 100 ? 0 : 1)}</div>
          <div class="eq-l">${e.label}</div>
          <div class="eq-n">${e.note}</div>
        </div>`).join("");
    }
  };

  /* ══════════════════════════════════════════════════════════════════
     8 · DEPARTMENTS
     ══════════════════════════════════════════════════════════════════ */
  const departments = {
    title: "Teams",
    crumb: "PLAN",
    render() {
      return `
        <div class="module">
          <div class="wall"><div class="panel panel-flush">
            <div class="panel-hd" style="padding:16px 18px 0">
              <h2>Team ranking</h2>
              <span class="hd-note">LOWEST CARBON PER PERSON FIRST</span></div>
            <div id="deptList" style="margin-top:8px"></div>
          </div></div>

          <div class="wall g2 stack">
            ${chartPanel("Carbon by team", "", "deptChart")}
            <div class="panel">
              <div class="panel-hd"><h2>Why per person?</h2></div>
              <div class="prose" style="font-size:var(--fs-small)">
                <p>Ranking teams by absolute tonnage would put Facilities last every month simply
                   because it holds the electricity meter for the whole building. Ranking by
                   <b>intensity per head</b> compares like with like, and is the only version of
                   this leaderboard anyone will accept twice.</p>
                <p>Each department carries its own grade on the same five-part scoring model as
                   the organisation, computed against its own headcount.</p>
              </div>
              <div class="stat-strip" id="deptStats"></div>
            </div>
          </div>
        </div>`;
    },

    mount() {
      const months = S().months();
      const rows = V.DEPARTMENTS.map(d => {
        const { agg, score } = S().summary(S().period, d.id);
        return { d, agg, score, perHead: agg.net / Math.max(1, d.head) / months.length };
      }).sort((a, b) => a.perHead - b.perHead);

      const max = Math.max(1, ...rows.map(r => Math.abs(r.perHead)));
      $("#deptList").innerHTML = rows.map((r, i) => `
        <div class="dept-row">
          <span class="d-rank ${i === 0 ? "top" : ""}">${i + 1}</span>
          <span class="d-name"><b>${r.d.name}</b><span>${r.d.head} people · ${r.agg.count} entries</span></span>
          <span class="d-bar"><i style="width:${V.clamp01(Math.abs(r.perHead)/max)*100}%;
            background:${V.bandVar(r.score.composite)}"></i></span>
          <span class="d-val">${nf(r.perHead, 1)} <span class="faint">kg per person a month</span></span>
          <span class="d-grade" style="color:${V.bandVar(r.score.composite)}">${r.score.grade}</span>
        </div>`).join("");

      V.Charts.categoryBars($("#deptChart"),
        rows.slice().sort((a, b) => b.agg.net - a.agg.net).map(r => ({
          name: r.d.name, color: V.catColor(V.CATEGORIES[V.DEPARTMENTS.indexOf(r.d) % 8].id),
          value: Math.max(0, r.agg.net), count: r.agg.count
        })),
        rows.reduce((s, r) => s + Math.max(0, r.agg.net), 0));

      const best = rows[0], worst = rows[rows.length - 1];
      $("#deptStats").innerHTML = [
        { l:"Best", v:best.d.name, s:`${nf(best.perHead,0)} kg per person a month` },
        { l:"Spread", v:`${nf(worst.perHead / Math.max(0.01, best.perHead), 1)}×`,
          s:"highest vs lowest intensity" },
        { l:"Needs support", v:worst.d.name, s:`${nf(worst.perHead,0)} kg per person a month` }
      ].map(x => `<div><div class="sl">${x.l}</div>
        <div class="sv" style="font-size:15px">${x.v}</div><div class="ss">${x.s}</div></div>`).join("");
    }
  };

  /* ══════════════════════════════════════════════════════════════════
     9 · REPORTS
     ══════════════════════════════════════════════════════════════════ */
  const reports = {
    title: "Reports",
    crumb: "VERIFY",
    render() {
      return `
        <div class="module">
          <div class="wall g2">
            <div class="panel">
              <div class="panel-hd"><h2>Download</h2></div>
              <div class="prose" style="font-size:var(--fs-small)">
                <p>Download your data to share with your team or an auditor.</p>
              </div>
              <div class="col mt-16" style="gap:9px">
                <button class="btn" id="expCsv">${icon("download",14)} Activity log (spreadsheet)</button>
                <button class="btn" id="expJson">${icon("download",14)} Full report (data file)</button>
                <button class="btn" id="copyHead">${icon("copy",14)} Copy the data-check code</button>
              </div>
            </div>
            <div class="panel">
              <div class="panel-hd"><h2>Summary</h2>
                <span class="hd-note" id="repPeriod"></span></div>
              <div class="stat-strip" id="repTotals" style="margin-top:0"></div>
              <div class="subs" id="repScopes" style="border-top:0;padding-top:14px"></div>
            </div>
          </div>

          <div class="wall stack"><div class="panel">
            <div class="panel-hd"><h2>What's inside the report file</h2>
              <span class="hd-note">FOR AUDITORS AND DEVELOPERS</span></div>
            <div class="code-block" id="repJson" style="max-height:420px;overflow:auto"></div>
          </div></div>
        </div>`;
    },

    mount() {
      const months = S().months();
      const { agg } = S().summary();
      $("#repPeriod").textContent =
        `${V.monthLabel(months[0])} — ${V.monthLabel(months[months.length-1])}`.toUpperCase();

      $("#repTotals").innerHTML = [
        { l:"Emitted", v:tonnes(agg.gross), c:"var(--text-1)" },
        { l:"Avoided", v:tonnes(agg.avoided), c:"var(--good)" },
        { l:"Overall", v:tonnes(agg.net), c:"var(--accent)" }
      ].map(x => `<div><div class="sl">${x.l}</div>
        <div class="sv" style="color:${x.c}">${x.v}<u style="font-size:var(--fs-small);color:var(--text-3)"> t</u></div>
        </div>`).join("");

      $("#repScopes").innerHTML = [1,2,3].map(n => {
        const v = Math.max(0, agg.byScope[n]);
        const total = [1,2,3].reduce((s,k)=>s+Math.max(0,agg.byScope[k]),0) || 1;
        return `<div class="meter-row">
            <span class="m-name">Scope ${n}</span>
            <span class="m-val">${tonnes(v)} t · ${nf(100*v/total,0)}%</span>
            <span class="meter"><i style="width:${100*v/total}%;background:var(--series-${n*2})"></i></span>
          </div>`;
      }).join("");

      const doc = S().disclosure(S().period);
      $("#repJson").textContent = JSON.stringify(doc, null, 2);

      $("#expCsv").onclick = () => {
        V.UI.download(`terrawise-activity-${V.todayISO()}.csv`, S().csv());
        toast("Activity log downloaded", `${S().entries.length} rows`);
      };
      $("#expJson").onclick = () => {
        V.UI.download(`terrawise-report-${V.todayISO()}.json`,
          JSON.stringify(doc, null, 2), "application/json");
        toast("Disclosure exported", "JSON · GHG Protocol shaped");
      };
      $("#copyHead").onclick = async () => {
        const ok = await V.UI.copyText(S().head);
        toast(ok ? "Code copied" : "Could not copy",
          ok ? V.Chain.shortHash(S().head) : "Clipboard unavailable", ok ? "ok" : "err");
      };
    }
  };

  /* ══════════════════════════════════════════════════════════════════
     10 · METHODOLOGY (in-app)
     ══════════════════════════════════════════════════════════════════ */
  const methodology = {
    title: "How we calculate",
    crumb: "VERIFY",
    render() {
      return `
        <div class="module">
          <div class="wall"><div class="panel">
            <div class="panel-hd"><h2>Basis of preparation</h2></div>
            <div class="prose">
              <p>Every entry is an activity quantity multiplied by a published emission factor,
                 classified under the <b>GHG Protocol Corporate Standard</b>. Recycling and on-site
                 renewable generation post as <b>credits</b>, so the ledger balances to a net
                 position rather than one total that only ever grows.</p>
              <p>Each entry stores the factor value it was priced with, so revising a factor never
                 silently restates a published report.</p>
            </div>
            <div class="wall g3 stack">
              ${[[1,"Fuel burnt directly by the organisation — diesel gensets, owned vehicles, canteen biogas."],
                 [2,"Purchased electricity, priced at the Indian grid factor of 0.716 kg CO₂e per kWh."],
                 [3,"Everything upstream and downstream — water, waste, commuting, flights, procurement."]]
                .map(([n, d]) => `<div class="panel">
                  <div class="mono" style="color:var(--accent);font-size:var(--fs-small)">SCOPE ${n}</div>
                  <p class="faint" style="font-size:var(--fs-small);margin-top:7px;line-height:1.6">${d}</p>
                </div>`).join("")}
            </div>
          </div></div>

          <div class="wall g3 stack" id="facGrid"></div>

          <div class="wall stack"><div class="panel">
            <div class="panel-hd"><h2>The sustainability score</h2>
              <span class="hd-note">FIVE WEIGHTED SUB-SCORES</span></div>
            <div class="prose" style="margin-bottom:14px">
              <p>A tonnage cannot say whether an organisation is doing well — a 500-person company
                 emitting 200 t is doing better than a 50-person company emitting 150 t. Every
                 sub-score is therefore an intensity or a ratio.</p>
            </div>
            <div class="code-block" id="formula"></div>
            <div class="row wrapflex mt-16" style="gap:7px" id="weights"></div>
          </div></div>
        </div>`;
    },

    mount() {
      $("#facGrid").innerHTML = V.CATEGORIES.map(c => `
        <div class="panel">
          <div class="row center" style="gap:9px;padding-bottom:10px;border-bottom:1px solid var(--line-1);
               margin-bottom:6px">
            <i style="width:8px;height:8px;border-radius:2px;background:${V.catColor(c.id)};display:block"></i>
            <b style="font-size:var(--fs-small)">${c.name}</b>
            <span class="mono faint" style="margin-left:auto;font-size:var(--fs-micro);
              text-transform:uppercase;letter-spacing:.09em">${c.kind}</span>
          </div>
          ${V.FACTORS.filter(f => f.cat === c.id).map(f => `
            <div class="row between" style="padding:7px 0;border-bottom:1px solid var(--line-1);
                 align-items:baseline;gap:10px">
              <span style="font-size:var(--fs-small);color:var(--text-2)">${escapeHtml(f.label)}</span>
              <span class="mono" style="font-size:var(--fs-small);white-space:nowrap;
                color:${f.f<0?"var(--good)":"var(--text-1)"}">${f.f<0?"−":""}${Math.abs(f.f)}
                <span class="faint" style="font-size:var(--fs-micro)">kg/${f.unit}</span>
                <span class="faint" style="font-size:var(--fs-micro);margin-left:6px">S${f.scope}</span></span>
            </div>`).join("")}
        </div>`).join("");

      $("#formula").textContent =
`score(x, target, ceiling) = 100 × clamp01( (x − ceiling) ÷ (target − ceiling) )

carbon     = score( net kgCO₂e ÷ headcount ÷ months,    target 40,  ceiling 300 )
renewable  = score( renewable kWh ÷ total kWh × 100,    target 60,  ceiling 0   )
diversion  = score( diverted kg ÷ total waste kg × 100, target 75,  ceiling 0   )
resource   = mean[ score( kL water/emp/mo, 0.9, 4.0 ),
                   score( kg paper/emp/mo, 0.5, 3.0 ) ]
mobility   = score( low-carbon km ÷ total km × 100,     target 55,  ceiling 0   )

composite  = 0.30·carbon + 0.20·renewable + 0.20·diversion
           + 0.15·resource + 0.15·mobility

grade      A+ ≥ 85 · A ≥ 75 · B+ ≥ 65 · B ≥ 55 · C+ ≥ 45 · C ≥ 35 · else D`;

      $("#weights").innerHTML = Object.keys(V.BANDS).map(k =>
        `<span class="chip chip-outline">${V.BANDS[k].label}
          <b style="color:var(--accent);margin-left:5px">${nf(V.BANDS[k].weight*100,0)}%</b></span>`).join("");
    }
  };

  /* ══════════════════════════════════════════════════════════════════
     11 · SETTINGS — including the theme lab
     ══════════════════════════════════════════════════════════════════ */
  const settings = {
    title: "Settings",
    crumb: "VERIFY",
    render() {
      return `
        <div class="module">
          <div class="wall g2">
            <div class="panel">
              <div class="panel-hd"><h2>Organisation</h2></div>
              <div class="form-row c2" style="margin-top:0">
                <div class="field"><label for="orgNameIn">Name</label>
                  <input id="orgNameIn" class="ctl"></div>
                <div class="field"><label for="headIn">Headcount</label>
                  <input id="headIn" class="ctl ctl-mono ctl-right" type="number" min="1" max="500000"></div>
              </div>
              <div class="form-row c2">
                <div class="field"><label for="sectorIn">Sector</label>
                  <input id="sectorIn" class="ctl"></div>
                <div class="field"><label for="siteIn">Site</label>
                  <input id="siteIn" class="ctl"></div>
              </div>
              <div class="prose mt-16" style="font-size:var(--fs-small)">
                <p>Headcount matters more than it looks: every intensity metric, and therefore the
                   whole score, divides by it.</p>
              </div>
            </div>

            <div class="panel">
              <div class="panel-hd"><h2>This dashboard</h2></div>
              <div class="prose" style="font-size:var(--fs-small)">
                <p>Refill this dashboard with twelve months of sample activity, useful for
                   exploring the features before you add your own.</p>
              </div>
              <div class="col mt-16" style="gap:9px">
                <button class="btn" id="reseedBtn">${icon("reset",14)} Fill with sample data</button>
                <button class="btn" id="signOutBtn">${icon("logout",14)} Sign out</button>
              </div>
              <div class="stat-strip" id="ledgerStats"></div>
            </div>
          </div>

        </div>`;
    },

    mount() {
      /* organisation */
      $("#orgNameIn").value = S().org.name;
      $("#headIn").value = S().org.headcount;
      $("#sectorIn").value = S().org.sector;
      $("#siteIn").value = S().org.site;
      $("#orgNameIn").onchange = e => { S().setOrg({ name: e.target.value }); V.App.refreshShell(); };
      $("#sectorIn").onchange  = e => S().setOrg({ sector: e.target.value });
      $("#siteIn").onchange    = e => S().setOrg({ site: e.target.value });
      $("#headIn").onchange    = e => {
        S().setOrg({ headcount: Math.max(1, +e.target.value || 1) });
        V.App.refreshShell();
        toast("Headcount updated", "Every intensity metric recomputed", "info");
      };

      const { agg } = S().summary(12);
      $("#ledgerStats").innerHTML = [
        { l:"Entries", v:S().entries.length },
        { l:"Voided", v:S().entries.filter(e=>e.status==="voided").length },
        { l:"Net, 12 mo", v:`${tonnes(agg.net)} t` }
      ].map(x => `<div><div class="sl">${x.l}</div><div class="sv">${x.v}</div></div>`).join("");

      $("#reseedBtn").onclick = async () => {
        const ok = await dialog({ title:"Fill with sample data?",
          body:"<p>Every entry in this dashboard is replaced with twelve months of sample activity. Anything you added will be lost.</p>",
          confirmLabel:"Replace with sample data", danger:true });
        if (!ok) return;
        S().resetLedger();
        V.App.refreshShell();
        settings.mount();
        toast("Sample data loaded", `${S().entries.length} entries`, "info");
      };
      $("#signOutBtn").onclick = () => { S().signOut(); location.hash = "#/"; };

    }
  };

  V.AppViews = { overview, simulate, post, ledger, integrity, insights,
                 targets, departments, reports, methodology, settings };
})();
