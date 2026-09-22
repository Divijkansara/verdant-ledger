/* ══════════════════════════════════════════════════════════════════════
   views-site.js — the public website: landing page, methodology,
   documentation and the two authentication screens.

   Each view is a pure function returning an HTML string, plus an
   optional `mount` that wires behaviour once the markup is in the DOM.
   ══════════════════════════════════════════════════════════════════════ */

window.VL = window.VL || {};

(() => {
  "use strict";
  const V = window.VL;
  const { icon, escapeHtml, nf, tonnes, toast } = V.UI;
  const $ = s => document.querySelector(s);

  // The mark: a globe (terra) whose inner meridian grows into a leaf (wise:
  // the good decision). The ring and the leaf draw themselves on load.
  const GLYPH = `<svg class="glyph" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle class="g-ring" cx="16" cy="16" r="12" stroke="var(--accent)" stroke-width="2.4"
        stroke-dasharray="62 13.4" stroke-linecap="round" transform="rotate(-16 16 16)"/>
      <path class="g-leaf" d="M9 23 C9 13.5 15.5 7 25.5 6.5 C25 16.5 18.5 23 9 23 Z" fill="var(--good)"/>
      <path class="g-vein" d="M9 23 L19 13" stroke="var(--bg, #0a131f)" stroke-width="1.6" stroke-linecap="round"/>
    </svg>`;

  /* ═══════════════════════ chrome ════════════════════════════════════ */

  /* The menu is a row of icons; the one you are on — or the one under the
     pointer — expands to say its name. Same idea as the expandable-tabs
     component, written against our own icons and tokens so it inherits the
     palette and needs no framework. The label stays in the DOM while it is
     collapsed, so a screen reader still announces it. */
  function nav(active) {
    const tab = (href, label, ico) => `
      <a href="#${href}" class="etab${active === href ? " on" : ""}"
         ${active === href ? 'aria-current="page"' : ""}>
        ${icon(ico, 16)}<span class="etab-l">${label}</span>
      </a>`;

    return `
      <header class="nav${active === "/" ? " nav-overlay at-top" : ""}" id="siteNav">
        <div class="shell nav-in">
          <a class="brand" href="#/">${GLYPH}<b>Terra<span>wise</span></b></a>
          <nav class="etabs" aria-label="Sections">
            ${tab("/", "Product", "grid")}
            ${tab("/methodology", "Methodology", "book")}
            ${tab("/docs", "Developers", "page")}
            <span class="etab-sep" aria-hidden="true"></span>
            <span class="etab-auth">${tab("/signin", "Sign in", "users")}</span>
          </nav>
          <div class="nav-right">
            <a class="btn btn-primary" href="#/app/overview"><span class="lbl-long">Open the console</span><span class="lbl-short">Console</span> ${icon("arrow", 14)}</a>
          </div>
        </div>
      </header>`;
  }

  function footer() {
    const col = (title, links) => `
      <div class="foot-col"><h4>${title}</h4>${links.map(([l, h]) =>
        h ? `<a href="#${h}">${l}</a>` : `<span>${l}</span>`).join("")}</div>`;
    return `
      <footer class="foot">
        <div class="shell">
          <div class="foot-grid">
            <div class="foot-col">
              <a class="brand" href="#/" style="margin-bottom:14px">${GLYPH}<b>Terra<span>wise</span></b></a>
              <p style="color:var(--text-3);font-size:var(--fs-small);max-width:34ch;line-height:1.65">
                Carbon tracking for organisations: see where your emissions come from,
                trust the numbers, and plan how to cut them.</p>
            </div>
            ${col("Product", [["Overview", "/app/overview"], ["What-if planner", "/app/simulate"],
              ["Activity log", "/app/ledger"], ["Insights", "/app/insights"], ["Goals", "/app/targets"]])}
            ${col("Reference", [["Methodology", "/methodology"], ["Emission factors", "/app/methodology"],
              ["API documentation", "/docs"]])}
          </div>
          <div class="foot-bottom">
            <span>© ${new Date().getFullYear()} TERRAWISE</span>
            <span>GHG PROTOCOL · DEFRA 2024 · CEA V20 · SBTI</span>
          </div>
        </div>
      </footer>`;
  }

  const page = (active, body) => `<div class="site">${nav(active)}<main>${body}</main>${footer()}</div>`;

  /* ═══════════════════════ landing ═══════════════════════════════════ */

  function home() {
    /* ── the landing page is set as a document ──────────────────────
       No card grids and no floating product shot. The page is a ruled
       statement: a masthead docket, then numbered clauses, then
       schedules of notes — because the product manages a ledger, and an
       interface that adopts the grammar of the artifact it manages is
       arguing for itself before a word is read. */

    const note = (fig, unit, body) => `
      <div class="note">
        <div class="note-f"><span>${fig}</span><u>${unit}</u></div>
        <div class="note-b">${body}</div>
      </div>`;

    const clause = (n, title, body, id = "") => `
      <section class="clause"${id ? ` id="${id}"` : ""}>
        <div class="clause-n"><span class="seq">${n}</span>
          <span class="clause-t">${title}</span></div>
        <div class="clause-b">${body}</div>
      </section>`;

    const step = (n, title, body) => `
      <div class="entry">
        <div class="entry-n">${n}</div>
        <div class="entry-h"><h3>${title}</h3></div>
        <div class="entry-b">${body}</div>
      </div>`;

    const module = (name, body, cls, href) => `
      <tr>
        <td class="m-name"><a href="${href}">${name}</a></td>
        <td class="m-body">${body}</td>
        <td class="m-cls r">${cls}</td>
      </tr>`;

    const spec = (k, v) => `
      <div class="leader"><span class="l-k">${k}</span>
        <span class="l-dots"></span><span class="l-v">${v}</span></div>`;

    const faqItem = (q, a) => `
      <details><summary>${q}</summary><div class="faq-body">${a}</div></details>`;

    return page("/", `
      <!-- ═════════ masthead ═════════ -->
      <header class="mast" id="mast">
        <div class="planet" id="planet" aria-hidden="true"></div>
        <div class="shell mast-stage">
          <div class="mast-copy">
            <div class="docket mast-docket">
              <span><b>Terrawise</b></span><i>/</i>
              <span>Sample organisation</span><i>/</i>
              <span id="mastPeriod">12 months</span>
            </div>
            <div class="mast-rule"></div>

            <h1>Know your carbon.<br>Then <em>cut</em> it.</h1>
            <p class="lede">
              Terrawise turns your organisation's electricity, travel, waste, water and
              purchases into one carbon footprint, using official emission factors. Then it
              shows which changes would cut the most, before you spend a rupee.
            </p>
            <div class="mast-cta">
              <button class="btn btn-primary btn-lg planet-act" id="planetAct">
                ${icon("leaf", 15)}<span>Clean it up</span>
              </button>
              <a class="btn btn-lg" href="#/app/overview" data-tour-start>${icon("play", 14)} Take the 90-second tour</a>
            </div>

            <div class="planet-ui">
              <div class="pl-state">
                <span class="pl-k">Sample score</span>
                <b id="plScoreV">—</b>
                <span class="pl-g" id="plGradeV">—</span>
              </div>
              <p class="pl-note" id="plNote">The smog shows how this sample organisation is doing.</p>
            </div>

            <div class="mast-next" id="mastNext">
              <p><b>That was a real calculation on a year of data, not an animation.</b></p>
              <a class="btn btn-primary btn-lg" href="#/app/overview">
                Open the console ${icon("arrow", 15)}</a>
            </div>
          </div>
        </div>
      </header>

      <section class="band" id="band" aria-label="Carbon by month"></section>

      <section class="deck-section" aria-label="Automatic reports">
        <div class="shell">
          <div class="ds-hd">
            <span class="eyebrow">[ Reports ]</span>
            <h2>Five reports, written for you.</h2>
          </div>
          <div class="deck-stage" id="deck"></div>
        </div>
      </section>

      <section class="bento" aria-labelledby="bentoH">
        <div class="shell">
          <header class="bento-hd">
            <span class="eyebrow">[ The sample year ]</span>
            <h2 id="bentoH">A year of data, at a glance.</h2>
            <p class="lede">Every number below is calculated live from the sample organisation's
               records as the page loads. None of it is typed in by hand.</p>
          </header>

          <div class="bento-grid">
            <article class="bcard b-matrix">
              <div class="bc-hd"><span class="seq">01</span>Carbon, month by month</div>
              <div class="mx" id="matrix"></div>
              <p class="bc-ft">Each dot is two tonnes of CO₂. Taller columns are heavier months.</p>
            </article>

            <article class="bcard b-accent">
              <span class="bc-k">Carbon score</span>
              <b id="bScore">—</b>
              <span class="bc-grade" id="bGrade">—</span>
              <p>Measured per person and by share, not by total tonnes, so a small office
                 and a large campus are judged fairly.</p>
            </article>

            <article class="bcard b-stat">
              <b id="bFactors">—</b><span>Official emission factors</span>
              <p>From the UK government (DEFRA 2024) and India's Central Electricity Authority</p>
            </article>
            <article class="bcard b-stat">
              <b id="bEntries">—</b><span>Records locked</span>
              <p>Past records cannot be quietly edited or deleted</p>
            </article>
            <article class="bcard b-stat">
              <b id="bAvoided">—</b><span>Tonnes saved</span>
              <p>From recycling and rooftop solar</p>
            </article>
            <article class="bcard b-stat">
              <b id="bCut">—</b><span>Possible reduction</span>
              <p>With the full plan · grade <span id="bCutTo">—</span></p>
            </article>
          </div>
        </div>
      </section>

      <div class="shell">
      ${clause("01", "The problem", `
        <h2>Most organisations can't say where their carbon comes from.</h2>
        <p class="lede">The numbers sit in spreadsheets, electricity bills and fuel receipts
           spread across different people. They get added up once a year, too late to change
           anything, and nobody can say which change would help most.</p>
        <div class="notes">
          ${note("0.716", "kg", "of CO₂ for every unit (kWh) of electricity from India's grid. In most offices, electricity is the biggest source.")}
          ${note("8", "", "kinds of activity add up to most of an office's footprint: electricity, fuel, travel, waste, water, paper, purchases and commuting.")}
          ${note("1×", "a year", "is how often many organisations add up their carbon. Terrawise updates the moment you add a record.")}
          ${note("−42", "%", "by 2030 is the cut the 1.5 °C climate goal asks of companies. Hitting it needs a plan, not a yearly report.")}
        </div>`, "problem")}

      ${clause("02", "How it works", `
        <h2>Add it. Trust it. Cut it.</h2>
        <p class="lede">Everything you use adds carbon; recycling and solar power take some
           away. Terrawise counts both, so your footprint can go down as well as up.</p>
        <div class="entries">
          ${step("01", "Add your activity", `An electricity bill, a fuel receipt, a waste
            pickup or a supplier invoice. Choose what it was from 39 official emission factors
            and the carbon is worked out instantly, before you save.`)}
          ${step("02", "Records lock themselves", `Each record is locked to the one before it.
            If anyone changes past data later, the data check catches it and shows exactly
            which record was changed.`)}
          ${step("03", "Plan the cuts", `Try changes like rooftop solar or electric cars in
            the what-if planner and see your score move before spending anything. Unusual
            months, like a sudden jump in electricity, are flagged automatically.`)}
        </div>`, "how")}

      ${clause("03", "What-if planner", `
        <h2>Try a change. See what it saves.</h2>
        <div class="two">
          <div>
            <p class="lede">Eight changes an organisation can actually make, from rooftop solar
              to electric company cars. Each one recalculates the whole year of data, so the
              savings you see come from real numbers, not guesses.</p>
            <ul class="marks">
              <li>How much each change saves on its own, and how much two changes overlap.</li>
              <li>A rough cost and payback time for every change.</li>
              <li>Three ready-made plans, including one that meets the 1.5 °C climate goal.</li>
            </ul>
            <a class="mast-link" href="#/app/simulate">Open the planner ${icon("arrow", 14)}</a>
          </div>
          <div class="play" id="play"></div>
        </div>`, "simulate")}

      ${clause("04", "Questions", `
        <h2>Common questions</h2>
        <div class="faq">
          ${faqItem("Why can't I delete a record?",
            "So the history stays trustworthy. If records could be deleted, anyone could make the numbers look better. A mistake is fixed by cancelling the record with a reason: it stops counting towards your totals, but it stays on file so an auditor can see what happened.")}
          ${faqItem("Where do the emission factors come from?",
            "Official, published sources. Electricity uses India's Central Electricity Authority figure of 0.716 kg of CO₂ per kWh. Water, waste, travel and paper use the UK government's DEFRA 2024 factors. Purchases use spending-based estimates, which are marked as rough in the app. Every factor shows its source.")}
          ${faqItem("If an emission factor is updated, does last year's report change?",
            "No. Each record keeps the factor it was calculated with. An update only affects records added afterwards, so a report you published last year still adds up to the same number today.")}
          ${faqItem("How do I know the data hasn't been tampered with?",
            "Every record carries a digital fingerprint (SHA-256) that also covers the record before it, so changing any old record breaks every fingerprint after it. The Data check screen has a button that secretly edits an old record, so you can watch the check find it.")}
          ${faqItem("How is the score worked out?",
            "From five measures: carbon per person, share of clean electricity, share of waste recycled, use of water and paper, and share of low-carbon travel. They are compared per person or as a share, never as total tonnes, because a 500-person company emitting 200 tonnes is doing better than a 50-person company emitting 150. The full formula is on the How we calculate page.")}
        </div>`, "questions")}
      </div>

      <!-- ═════════ closing band ═════════ -->
      <section class="closing">
        <div class="shell">
          <div class="rule-accent"></div>
          <div class="closing-in">
            <div>
              <div class="docket"><span>Get started</span></div>
              <h2>Find out where your<br>carbon comes from.</h2>
              <p>Sign in with the demo account to explore a year of sample data, or create an
                 account and set up your own dashboard. Nothing to install.</p>
            </div>
            <a class="btn btn-primary btn-lg" href="#/app/overview">
              Open the console ${icon("arrow", 15)}</a>
          </div>
        </div>
      </section>`);
  }

  /** Fill the statement of position from the real ledger. */
  home.mount = () => {
    const Store = V.Store;
    const series = Store.trend(12);
    const { months, agg, score } = Store.summary(12);

    const net = $("#mastNet");
    if (net) V.UI.rollTo(net, agg.net / 1000, 1);

    const spark = $("#mastSpark");
    if (spark) V.Charts.sparkline(spark, series.map(s => s.net), "var(--accent)");

    /* The rows below the figure are a statement, not a feed: gross,
       credits, the rule, the net — read top to bottom the way a set of
       accounts is read. */
    const rows = $("#mastRows");
    if (rows) {
      const t = n => `${nf(Math.abs(n) / 1000, 1)}`;
      rows.innerHTML = `
        <div class="leader"><span class="l-k">Gross emissions issued</span>
          <span class="l-dots"></span><span class="l-v">${t(agg.gross)}</span></div>
        <div class="leader"><span class="l-k">Avoided — recycling, renewables</span>
          <span class="l-dots"></span><span class="l-v" style="color:var(--good)">−${t(agg.avoided)}</span></div>
        <div class="leader total"><span class="l-k">Net position</span>
          <span class="l-dots"></span><span class="l-v">${t(agg.net)}</span></div>
        <div class="leader"><span class="l-k">Sustainability score</span>
          <span class="l-dots"></span><span class="l-v">${nf(score.composite, 1)} · ${score.grade}</span></div>
        <div class="leader"><span class="l-k">Entries sealed</span>
          <span class="l-dots"></span><span class="l-v">${Store.live().length}</span></div>`;
    }

    const period = $("#mastPeriod");
    if (period) period.textContent =
      `${V.monthLabel(months[0])} — ${V.monthLabel(months[months.length - 1])}`;

    const seal = $("#mastSeal");
    if (seal) seal.textContent = `${Store.live().length} blocks sealed · sha-256`;
  };

  /* ═══════════════════════ methodology (public) ══════════════════════ */

  /* Fade sections in as they are scrolled to. Elements simply show when
     IntersectionObserver is missing or motion is reduced. */
  function revealOnScroll() {
    const els = Array.from(document.querySelectorAll(".rv"));
    if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion:reduce)").matches) {
      els.forEach(e => e.classList.add("in")); return;
    }
    const io = new IntersectionObserver(entries => entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    }), { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    els.forEach(e => io.observe(e));
  }

  function methodology() {
    const SUBS = ["carbon", "renewable", "diversion", "resource", "mobility"];
    const GRADES = [["A+", 85], ["A", 75], ["B+", 65], ["B", 55], ["C+", 45], ["C", 35], ["D", 0]];

    const stat = (n, l) => `<div class="ref-stat"><b>${n}</b><span>${l}</span></div>`;

    const scope = (n, title, body, chips) => `
      <div class="scope rv" style="--sc:var(--series-${n});--i:${n}">
        <div class="sc-n">${n}</div>
        <h3>${title}</h3><p>${body}</p>
        <div class="chips">${chips.map(c => `<span class="chip">${c}</span>`).join("")}</div>
      </div>`;

    return page("/methodology", `
      <header class="ref-hero">
        <div class="shell">
          <div class="eyebrow">Methodology</div>
          <h1>Every number, <em>explained.</em></h1>
          <p class="lede">How each figure in the ledger is produced, where its factor comes from,
             and what it may and may not be used for.</p>
          <div class="ref-stats">
            ${stat(V.FACTORS.length, "cited factors")}
            ${stat("3", "GHG scopes")}
            ${stat("5", "weighted sub-scores")}
            ${stat("SHA-256", "chained entries")}
          </div>
        </div>
      </header>

      <div class="shell doc has-hero">
        <aside class="doc-toc"><h4>On this page</h4></aside>

        <div class="doc-body">
          <h2>Basis of preparation</h2>
          <p>Every entry is an activity quantity multiplied by a published emission factor,
             classified under the <b>GHG Protocol Corporate Standard</b>. Recycling and on-site
             renewable generation are posted as credits, so the ledger balances to a net position.</p>
          <div class="equation rv">
            <div class="eq-card charge"><small>Charges</small><h3>What you consume</h3>
              <p>Electricity, transport, procurement, waste, water and paper.</p></div>
            <div class="eq-op" aria-hidden="true">−</div>
            <div class="eq-card credit"><small>Credits</small><h3>What you avoid</h3>
              <p>Recycling and on-site renewable generation.</p></div>
            <div class="eq-op" aria-hidden="true">=</div>
            <div class="eq-card net"><small>Result</small><h3>Net position</h3>
              <p>The single figure the score and every report is built on.</p></div>
          </div>
          <p>Each entry stores the factor value, unit and scope it was priced with at the moment
             of posting. Revising a factor affects future postings only, so a published report
             stays reproducible for as long as the ledger exists.</p>

          <h2>Scopes</h2>
          <div class="scopes">
            ${scope(1, "Direct", "Fuel burnt directly by the organisation.", ["Diesel gensets", "Owned vehicles", "Canteen biogas"])}
            ${scope(2, "Purchased energy", "Electricity, priced at the Indian grid factor of 0.716 kg CO₂e per kWh.", ["Grid electricity", "Avoided by solar"])}
            ${scope(3, "Value chain", "Everything upstream and downstream of the organisation.", ["Water", "Waste", "Commuting", "Business travel", "Procurement"])}
          </div>

          <h2>The sustainability score</h2>
          <p>A tonnage cannot say whether an organisation is doing well, so every sub-score is an
             intensity or a ratio, normalised between a good-practice <b>target</b> (100 points) and
             a poor-practice <b>ceiling</b> (0 points). Select a segment to see how it is worked out.</p>
          <div class="weightbar" id="wbar" role="group" aria-label="Score weights">
            ${SUBS.map((k, i) => `<div class="w" data-key="${k}" style="--c:var(--series-${i + 1});--w:${V.BANDS[k].weight * 100}%;--i:${i}">${Math.round(V.BANDS[k].weight * 100)}%</div>`).join("")}
          </div>
          <div class="subs" id="subs">
            ${SUBS.map((k, i) => `<button class="sub${i === 0 ? " on" : ""}" data-key="${k}" style="--c:var(--series-${i + 1})" aria-pressed="${i === 0}">
              <i></i><b>${V.BANDS[k].label}</b><em>${Math.round(V.BANDS[k].weight * 100)}% of the score</em></button>`).join("")}
          </div>
          <div class="subdetail" id="subDetail" aria-live="polite"></div>
          <div class="grades rv">
            ${GRADES.map(([g, min]) => `<div class="grade"><b style="color:${V.bandVar(min || 1)}">${g}</b><span>${min ? "≥ " + min : "below 35"}</span></div>`).join("")}
          </div>
          <p>The weights live in exactly one place per codebase, and a unit test asserts they sum
             to 1.0, so the composite can never quietly stop being out of 100.</p>

          <h2>Factor catalogue</h2>
          <p>${V.FACTORS.length} factors. Every one carries its citation in the data, not in a comment.
             Bars show each factor's size relative to the others in view.</p>
          <div class="fx-bar">
            <input class="ctl fx-search" id="fxSearch" type="search" placeholder="Search factors — diesel, metro, paper…" aria-label="Search factors">
            <span class="fx-count" id="fxCount"></span>
          </div>
          <div class="fx-bar" style="margin-top:10px">
            <div class="fx-tabs" id="fxTabs" role="group" aria-label="Filter by category">
              <button class="fx-tab" data-cat="" aria-pressed="true"><i></i>All</button>
              ${V.CATEGORIES.map(c => `<button class="fx-tab" data-cat="${c.id}" aria-pressed="false" style="--c:${V.catColor(c.id)}"><i></i>${c.name}</button>`).join("")}
            </div>
          </div>
          <div class="fx-list" id="fxList"></div>

          <h2>Ledger integrity</h2>
          <p>Entries are chained: <code>H(n) = SHA-256( H(n−1) ‖ canonical(entry n) )</code>.
             Change any past value and every hash after it changes. Try it below; this runs the
             real hashing code on five real entries.</p>
          <div class="chain" id="chain"></div>
          <div class="chain-ctl">
            <button class="btn btn-primary btn-sm" id="chainAlter">Alter block 3</button>
            <button class="btn btn-sm" id="chainReset" disabled>Restore</button>
            <span class="chain-msg ok" id="chainMsg" role="status">Chain intact — all blocks verify.</span>
          </div>

          <h2>Limitations</h2>
          <div class="lims">
            ${[["Procurement is screening-grade", "Spend-based factors are the right order of magnitude, not supplier-specific accuracy, and are labelled as such."],
               ["Commuting is estimated", "It comes from survey data, as it does in most real Scope 3 reporting."],
               ["Anomalies assume a steady baseline", "A genuine step change in the business is flagged once, then absorbed."],
               ["The forecast is a straight line", "Its prediction interval widens with distance and is drawn on the chart."]]
              .map(([t, b], i) => `<div class="lim rv" style="--i:${i}"><div class="l-i">${icon("warning", 15)}</div><div><b>${t}</b><span>${b}</span></div></div>`).join("")}
          </div>
        </div>
      </div>`);
  }

  function methodologyMount() {
    const BANDS = V.BANDS;
    const sum = V.Store.summary(12).score;
    const META = {
      carbon:    ["Net kg CO₂e ÷ headcount ÷ months", "How much net carbon each person is responsible for, per month."],
      renewable: ["Renewable kWh ÷ total kWh × 100", "The share of electricity that comes from renewable sources."],
      diversion: ["Diverted kg ÷ total waste kg × 100", "The share of waste kept out of landfill."],
      resource:  ["Mean of the water score and the paper score", "Water and paper used per person, each scored, then averaged."],
      mobility:  ["Low-carbon km ÷ total km × 100", "The share of distance travelled by metro, bus, EV or two-wheeler."]
    };

    /* score anatomy: the weight bar and the buttons drive one detail card */
    const paint = key => {
      const i = Object.keys(BANDS).indexOf(key);
      const b = BANDS[key], live = sum.subscores.find(s => s.key === key);
      const pos = Math.max(3, Math.min(97, live.value));
      $("#subDetail").innerHTML = `
        <div>
          <h3 style="color:var(--series-${i + 1})">${b.label}</h3>
          <p>${META[key][1]}</p>
          <div class="formula">${META[key][0]}</div>
          <p style="margin-top:10px !important">Target <b>${b.target}</b> scores 100 · ceiling <b>${b.ceiling}</b> scores 0 · weight <b>${Math.round(b.weight * 100)}%</b>.</p>
        </div>
        <div>
          <div class="scale" aria-hidden="true">
            <span class="lb" style="left:0"><b>0</b>ceiling</span>
            <span class="lb" style="left:100%"><b>100</b>target</span>
            <span class="mk" style="left:${pos}%"></span>
          </div>
          <p style="text-align:center">The demo ledger scores <b style="color:${V.bandVar(live.value)}">${Math.round(live.value)}</b> here.</p>
        </div>`;
      document.querySelectorAll("#subs .sub").forEach(x => {
        x.classList.toggle("on", x.dataset.key === key);
        x.setAttribute("aria-pressed", String(x.dataset.key === key));
      });
      document.querySelectorAll("#wbar .w").forEach(x => x.classList.toggle("on", x.dataset.key === key));
    };
    paint("carbon");
    document.querySelectorAll("#subs .sub, #wbar .w").forEach(el =>
      el.addEventListener("click", () => paint(el.dataset.key)));

    /* factor explorer */
    let cat = "", q = "";
    const list = $("#fxList");
    const drawFx = () => {
      const rows = V.FACTORS.filter(f =>
        (!cat || f.cat === cat) &&
        (!q || (f.label + " " + f.cat + " " + V.srcTag(f.src)).toLowerCase().includes(q)));
      const max = Math.max(...rows.map(f => Math.abs(f.f)), 0.0001);
      $("#fxCount").textContent = `${rows.length} of ${V.FACTORS.length}`;
      list.innerHTML = rows.length ? rows.map(f => `
        <div class="fx-row">
          <div class="fx-name"><b>${escapeHtml(f.label)}</b><span>Scope ${f.scope} · ${V.CAT[f.cat].name}</span></div>
          <div class="fx-meter" style="--c:${f.f < 0 ? "var(--good)" : V.catColor(f.cat)}"><i data-w="${Math.max(2, Math.abs(f.f) / max * 100)}"></i></div>
          <div class="fx-val" style="${f.f < 0 ? "color:var(--good)" : ""}">${f.f < 0 ? "−" : ""}${Math.abs(f.f)}<small>kg / ${escapeHtml(f.unit)}</small></div>
          <span class="fx-src">${V.srcTag(f.src)}</span>
        </div>`).join("") : `<div class="fx-empty">No factor matches “${escapeHtml(q)}”.</div>`;
      requestAnimationFrame(() => list.querySelectorAll(".fx-meter i").forEach(i => { i.style.width = i.dataset.w + "%"; }));
    };
    document.querySelectorAll("#fxTabs .fx-tab").forEach(b => b.addEventListener("click", () => {
      cat = b.dataset.cat;
      document.querySelectorAll("#fxTabs .fx-tab").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      drawFx();
    }));
    $("#fxSearch").addEventListener("input", e => { q = e.target.value.trim().toLowerCase(); drawFx(); });
    drawFx();

    /* live hash chain: five real entries, real SHA-256 */
    const base = V.Chain.order(V.Store.live()).slice(-5).map(e => ({ ...e }));
    const seal = arr => { arr.forEach(e => { delete e.hash; }); V.Chain.seal(arr); return arr.map(e => e.hash); };
    const original = { qty: base[2].qty, co2: base[2].co2 };
    const draw = (hashes, altered) => {
      $("#chain").innerHTML = base.map((e, i) => `
        <div class="blk${altered != null ? (i === altered ? " bad" : i > altered ? " ripple" : "") : ""}">
          <small>BLOCK ${i + 1}</small>
          <div class="b-v">${nf(e.qty, 0)} · ${nf(e.co2, 1)} kg</div>
          <div class="b-h">${hashes[i].slice(0, 22)}…</div>
        </div>`).join("");
    };
    draw(seal(base), null);
    const msg = $("#chainMsg"), alter = $("#chainAlter"), reset = $("#chainReset");
    alter.addEventListener("click", () => {
      base[2].qty = Math.round(original.qty * 0.6);
      base[2].co2 = Math.round(original.co2 * 0.6 * 1000) / 1000;
      draw(seal(base.map(e => ({ ...e }))), 2);
      msg.className = "chain-msg bad";
      msg.textContent = "Block 3 was altered — its hash and every hash after it no longer match.";
      alter.disabled = true; reset.disabled = false;
    });
    reset.addEventListener("click", () => {
      base[2].qty = original.qty; base[2].co2 = original.co2;
      draw(seal(base), null);
      msg.className = "chain-msg ok";
      msg.textContent = "Chain intact — all blocks verify.";
      alter.disabled = false; reset.disabled = true;
    });

    const wbar = $("#wbar");
    if (wbar) setTimeout(() => wbar.classList.add("in"), 250);
  }
  methodology.mount = () => { methodologyMount(); revealOnScroll(); mountDoc(); };

  /* ═══════════════════════ developer docs ════════════════════════════ */

  function docs() {
    const ep = (verb, path, desc) => `
      <div class="endpoint">
        <span class="verb verb-${verb.toLowerCase() === "delete" ? "del" : verb.toLowerCase()}">${verb}</span>
        <span class="path">${escapeHtml(path)}</span>
        <span class="desc">${desc}</span>
      </div>`;

    return page("/docs", `
      <header class="ref-hero">
        <div class="shell">
          <div class="eyebrow">Developers</div>
          <h1>Build on <em>Terrawise.</em></h1>
          <p class="lede">Run it in two minutes, read the API, extend the engine.</p>
          <div class="ref-stats">
            <div class="ref-stat"><b>REST</b><span>FastAPI · OpenAPI</span></div>
            <div class="ref-stat"><b>JWT</b><span>bcrypt · roles</span></div>
            <div class="ref-stat"><b>47</b><span>passing tests</span></div>
            <div class="ref-stat"><b>0</b><span>front-end deps</span></div>
          </div>
        </div>
      </header>

      <div class="shell doc has-hero">
        <aside class="doc-toc"><h4>Contents</h4></aside>

        <div class="doc-body">
          <h2>Running it</h2>
          <div class="steps">
            <div class="stp rv" style="--i:0"><b>Seed the data</b><span>Creates 39 cited factors and twelve months of entries.</span></div>
            <div class="stp rv" style="--i:1"><b>Start the API</b><span>Interactive docs are served at <code>/docs</code>.</span></div>
            <div class="stp rv" style="--i:2"><b>Open the site</b><span>Serve <code>web/</code>, or just open <code>index.html</code>.</span></div>
          </div>
          <p>The frontend needs nothing installed. Open <code>web/index.html</code> and it runs
             against its built-in engine. For the full stack:</p>
          <div class="code-block"># backend
cd backend
python -m venv .venv &amp;&amp; source .venv/bin/activate
pip install -r requirements.txt
python -m app.seed            # 39 factors + 12 months of entries
uvicorn app.main:app --reload # API + Swagger UI at /docs

# frontend
cd web &amp;&amp; python serve.py     # http://localhost:5500</div>
          <p>Signing in with <code>admin@suryanagar.example</code> / <code>password123</code> uses
             the live API when it is reachable and falls back to the local engine when it is not.
             The status strip in the console always says which.</p>

          <h2>Architecture</h2>
          <div class="code-block">web/
├── index.html           single shell, hash-routed
├── css/
│   ├── base.css         reset, type, primitives — zero hex values
│   ├── site.css         public website
│   └── app.css          console
└── js/
    ├── theme.js         OKLCH colour engine + WCAG solver
    ├── data.js          factors, demo ledger, aggregation, scoring
    ├── chain.js         SHA-256 + tamper-evident chain
    ├── analytics.js     anomaly detection, forecast, carbon budget
    ├── simulate.js      scenario engine (rewrites the ledger)
    ├── charts.js        nine SVG chart types
    ├── store.js         state, persistence, API bridge
    ├── ui.js            icons, toasts, dialog, command palette
    ├── views-site.js    public pages
    ├── views-app.js     console modules
    └── app.js           router and shell</div>

          <h2>API</h2>
          <p>Base URL <code>http://127.0.0.1:8000</code>. All authenticated requests carry
             <code>Authorization: Bearer &lt;token&gt;</code>.</p>
          ${ep("POST", "/api/auth/register", "Create an organisation and its first admin user")}
          ${ep("POST", "/api/auth/login", "Exchange credentials for a JWT")}
          ${ep("GET", "/api/auth/me", "The current user")}
          ${ep("GET", "/api/factors", "Factor catalogue — filter by category or validity date")}
          ${ep("POST", "/api/factors", "Add a factor (admin only)")}
          ${ep("PATCH", "/api/factors/{id}", "Revise a factor — does not restate past entries")}
          ${ep("DELETE", "/api/factors/{id}", "Retire a factor; the row is never removed")}
          ${ep("POST", "/api/entries/preview", "Price an activity without saving it")}
          ${ep("POST", "/api/entries", "Post an entry")}
          ${ep("GET", "/api/entries", "Filter, search, sort, paginate")}
          ${ep("POST", "/api/entries/{id}/void", "Reverse an entry, with a required reason")}
          ${ep("DELETE", "/api/entries/{id}", "Returns 405 Method Not Allowed — by design")}
          ${ep("GET", "/api/dashboard/summary", "One call that fills the whole overview")}
          ${ep("GET", "/api/dashboard/trend", "Zero-filled monthly series")}
          ${ep("GET", "/api/dashboard/insights", "Quantified recommendations")}
          ${ep("GET", "/api/reports/entries.csv", "Streamed CSV export")}

          <h2>Data model</h2>
          <p>Six tables in third normal form, with one deliberate temporal denormalisation.</p>
          <div class="code-block">organizations ──┬── users
                ├── ledger_entries ──── emission_factors
                ├── targets
                ├── score_snapshots
                └── audit_logs</div>
          <p><b>The deliberate denormalisation:</b> <code>ledger_entries</code> duplicates
             <code>factor_value</code>, <code>unit</code> and <code>scope</code> from
             <code>emission_factors</code> as snapshot columns. A factor is a value that changes
             over time; an entry must keep the value in force when it was posted, or every
             historical report silently changes the next time a factor is revised.</p>

          <h2>Theme engine API</h2>
          <p>Six seed values generate the whole palette. The engine is available on the console
             at <code>window.VL.Theme</code>.</p>
          <div class="code-block">VL.Theme.set({ accentHue: 320 })      // repaints the entire product
VL.Theme.usePreset("paper")           // switch to a light preset
VL.Theme.report                       // the live WCAG contrast audit
VL.Theme.toCSS()                      // export the palette as CSS
VL.Theme.onChange(fn)                 // subscribe to palette changes</div>
          <p>Charts paint with <code>fill:var(--series-3)</code> rather than hex values, so a
             theme change repaints every chart with no re-render at all.</p>
        </div>
      </div>`);
  }

  /* ═══════════════════════ auth ══════════════════════════════════════ */

  function authShell(mode) {
    const signup = mode === "signup";
    const point = (ico, title, body) => `
      <div class="auth-point"><div class="ap-ico">${icon(ico, 14)}</div>
        <div><b>${title}</b><span>${body}</span></div></div>`;

    return page(signup ? "/signup" : "/signin", `
      <div class="auth">
        <aside class="auth-aside">
          <div class="hero-grid"></div>
          <div class="auth-aside-in">
            <h2>${signup ? "Start tracking your carbon." : "Welcome back."}</h2>
            <p>${signup
              ? "Creating an account sets up your first dashboard. You can add more later, one for each office or site."
              : "Your dashboards open with everything where you left it."}</p>
            <div class="auth-points">
              ${point("shield", "Your records stay trustworthy", "Past entries cannot be quietly edited or deleted.")}
              ${point("sliders", "See what a change would save", "Try solar or electric cars before you spend anything.")}
              ${point("pulse", "It spots what you missed", "Unusual months are flagged, with the carbon they cost.")}
            </div>
          </div>
        </aside>

        <div class="auth-form">
          <div class="auth-form-in">
            <h1>${signup ? "Create an account" : "Sign in"}</h1>
            <p>${signup ? "Your account and dashboards are saved on this device." : "Sign in to open your dashboards."}</p>

            <form id="authForm" class="auth-fields" autocomplete="on">
              ${signup ? `
                <div class="field"><label for="orgName">Organisation</label>
                  <input id="orgName" class="ctl" placeholder="Your organisation" required></div>
                <div class="field"><label for="fullName">Your name</label>
                  <input id="fullName" class="ctl" placeholder="Full name" required></div>` : ""}
              <div class="field"><label for="email">Email</label>
                <input id="email" class="ctl" type="email" placeholder="you@company.com"
                  autocomplete="username" required></div>
              <div class="field"><label for="password">Password</label>
                <input id="password" class="ctl" type="password" placeholder="${signup ? "At least 8 characters" : "Password"}" minlength="${signup ? 8 : 1}"
                  autocomplete="${signup ? "new-password" : "current-password"}" required></div>
              <div class="auth-err" id="authErr" role="alert" aria-live="polite"></div>
              <button class="btn btn-primary" id="authBtn" type="submit" style="width:100%">
                ${signup ? "Create account" : "Sign in"}</button>
            </form>

            ${signup ? "" : `<button class="btn btn-ghost" id="demoFill" type="button" style="width:100%;margin-top:10px">
              ${icon("play", 13)} Use the demo account</button>`}

            <div class="auth-alt">
              ${signup ? `Already have an account? <a href="#/signin">Sign in</a>`
                       : `No account yet? <a href="#/signup">Create one</a>`}
            </div>
          </div>
        </div>
      </div>`);
  }

  /* Reference pages: build the contents list from the headings themselves
     (so it can never drift from the page), scroll smoothly rather than
     touching the hash — the hash is the router's — and highlight the
     section being read. */
  /* A copy button on every code block. */
  function mountCopy() {
    document.querySelectorAll(".doc-body .code-block").forEach(block => {
      const wrap = document.createElement("div");
      wrap.className = "code-wrap";
      block.parentNode.insertBefore(wrap, block);
      wrap.appendChild(block);
      const btn = document.createElement("button");
      btn.className = "copy"; btn.type = "button"; btn.textContent = "Copy";
      btn.setAttribute("aria-label", "Copy code to clipboard");
      btn.addEventListener("click", async () => {
        await V.UI.copyText(block.textContent);
        btn.textContent = "Copied"; btn.classList.add("done");
        setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("done"); }, 1600);
      });
      wrap.appendChild(btn);
    });
  }

  function mountDoc() {
    const toc = $(".doc-toc");
    const heads = Array.from(document.querySelectorAll(".doc-body h2"));
    if (!toc || !heads.length) return;
    heads.forEach((h, i) => { h.id = "sec-" + i; });
    const title = toc.querySelector("h4");
    toc.innerHTML = "";
    if (title) toc.appendChild(title);
    const links = heads.map(h => {
      const a = document.createElement("a");
      a.href = "#/" + location.hash.split("/")[1];
      a.textContent = h.textContent;
      a.addEventListener("click", e => {
        e.preventDefault();
        h.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion:reduce)").matches ? "auto" : "smooth" });
      });
      toc.appendChild(a);
      return a;
    });
    const setOn = i => links.forEach((a, k) => a.classList.toggle("on", k === i));
    setOn(0);
    const onScroll = () => {
      let cur = 0;
      heads.forEach((h, i) => { if (h.getBoundingClientRect().top < 140) cur = i; });
      setOn(cur);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("hashchange", () => window.removeEventListener("scroll", onScroll), { once: true });
  }
  docs.mount = () => { revealOnScroll(); mountDoc(); mountCopy(); };

  const signin = () => authShell("signin");
  const signup = () => authShell("signup");

  function mountAuth() {
    const form = $("#authForm");
    if (!form) return;
    const demo = $("#demoFill");
    if (demo) demo.addEventListener("click", () => {
      $("#email").value = V.Store.DEMO.email;
      $("#password").value = V.Store.DEMO.password;
      form.requestSubmit();
    });
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const btn = $("#authBtn"), err = $("#authErr");
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = "Authenticating…";
      err.textContent = "";

      const orgName = $("#orgName"), fullName = $("#fullName");
      const email = $("#email").value.trim(), password = $("#password").value;
      const result = fullName
        ? await V.Store.signUp({ name: fullName.value.trim(), email, password,
                                 org: orgName ? orgName.value.trim() : "" })
        : await V.Store.signIn(email, password);
      if (result.error) {
        err.textContent = result.error;
        btn.disabled = false;
        btn.textContent = original;
        return;
      }
      // Go where the visitor was heading, or to their dashboards.
      const next = new URLSearchParams((location.hash.split("?")[1] || "")).get("next");
      await V.FX.authFlash(V.Store.user.name);
      location.hash = next && next.startsWith("/app") ? "#" + next : "#/app/dashboards";
      toast(fullName ? "Account created" : `Welcome back, ${V.Store.user.name.split(" ")[0]}`,
            result.mode === "live" ? "Connected to the Terrawise service" : "Signed in on this device", "ok");
    });
  }
  signin.mount = mountAuth;
  signup.mount = mountAuth;

  /* ═══════════════════════ 404 ═══════════════════════════════════════ */

  function notFound(path) {
    return page("", `
      <div class="shell" style="padding-block:110px;text-align:center">
        <div class="eyebrow">404</div>
        <h1 style="font-size:40px;margin-top:14px">That page does not exist</h1>
        <p class="lede" style="margin:16px auto 0">
          Nothing is routed at <code>${escapeHtml(path || "")}</code>.</p>
        <div class="hero-cta" style="justify-content:center;margin-top:28px">
          <a class="btn btn-primary" href="#/">Back to the product</a>
          <a class="btn" href="#/app/overview">Open the console</a>
        </div>
      </div>`);
  }

  V.SiteViews = { home, methodology, docs, signin, signup, notFound, nav, footer, GLYPH };
})();
