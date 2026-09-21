/* ══════════════════════════════════════════════════════════════════════
   fx.js — motion and ornament, drawn from the ledger itself.

   The rule this file follows: nothing here is generic garnish. Every
   effect is either the product's own data rendered as ornament, or the
   grammar of a financial statement made temporal — a figure totalling,
   rows striking in reading order, a series drawn in time order.

   What is deliberately absent: particle constellations, cursor-following
   glows, 3-D card tilt, gradient auroras, button ripples, confetti. Those
   belong to no product in particular, which is exactly why they read as
   decoration applied from outside rather than as design from within.

   Everything degrades: prefers-reduced-motion paints the final frame
   immediately, and no layout or figure depends on any of it.
   ══════════════════════════════════════════════════════════════════════ */

window.VL = window.VL || {};

(() => {
  "use strict";
  const V = window.VL;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NS = "http://www.w3.org/2000/svg";

  const node = (parent, tag, attrs = {}, text) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    parent.appendChild(n);
    return n;
  };

  /* ═════════════ 1 · reading position ═════════════
     A hairline in the accent, nothing more. A rainbow here would be a
     decoration competing with the page for attention.                  */

  function progress() {
    const bar = document.createElement("div");
    bar.id = "readProgress";
    bar.setAttribute("aria-hidden", "true");
    document.body.appendChild(bar);
    const upd = () => {
      const h = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${h > 8 ? Math.min(1, Math.max(0, scrollY / h)) : 0})`;
      bar.style.opacity = location.hash.startsWith("#/app") ? "0" : "1";
    };
    addEventListener("scroll", upd, { passive: true });
    addEventListener("hashchange", upd);
    upd();
  }

  /* ═════════════ 2 · reveal on scroll ═════════════
     A short rise, nothing else. No blur, no scale, no rotation.        */

  function reveals(root) {
    const els = $$(".clause, .closing-in", root);
    els.forEach(e => e.classList.add("anim-rise"));
    if (!("IntersectionObserver" in window) || still()) {
      els.forEach(e => e.classList.add("anim-in"));
      return;
    }
    const io = new IntersectionObserver(en => en.forEach(x => {
      if (!x.isIntersecting) return;
      x.target.classList.add("anim-in");
      $$(".note-f span", x.target).forEach(countUp);
      io.unobserve(x.target);
    }), { rootMargin: "0px 0px -12% 0px", threshold: 0.05 });
    els.forEach(e => io.observe(e));
  }

  /** Figures settle into place rather than appearing. */
  function countUp(el) {
    const raw = el.textContent.trim();
    const m = raw.match(/^([−-]?)(\d+(?:\.\d+)?)$/);
    if (!m || still()) return;
    const target = parseFloat(m[2]), dec = (m[2].split(".")[1] || "").length, sign = m[1];
    const t0 = performance.now(), DUR = 1100;
    (function step(now) {
      const p = Math.min(1, (now - t0) / DUR);
      el.textContent = sign + (target * (1 - Math.pow(1 - p, 4))).toFixed(dec);
      if (p < 1) requestAnimationFrame(step); else el.textContent = raw;
    })(t0);
  }

  /* The headline arrives a word at a time — a line of type being set. */
  function headline(h1) {
    if (!h1 || still()) return;
    let n = 0;
    const walk = el => Array.from(el.childNodes).forEach(c => {
      if (c.nodeType === 3) {
        const frag = document.createDocumentFragment();
        c.textContent.split(/(\s+)/).forEach(tok => {
          if (!tok.trim()) { frag.appendChild(document.createTextNode(tok)); return; }
          const s = document.createElement("span");
          s.className = "anim-word";
          s.style.setProperty("--w", n++);
          s.textContent = tok;
          frag.appendChild(s);
        });
        c.replaceWith(frag);
      } else if (c.nodeType === 1 && c.tagName !== "BR") walk(c);
    });
    walk(h1);
  }

  /* ═════════════ 3 · laying the sheets down ═════════════
     The three steps of the posting cycle are the same paper as the deck,
     so they are laid onto the page rather than faded into it: each one
     rotates down flat about its lower edge, in order, inside a shared
     perspective. It is the one other place depth is used, and it is used
     for the same reason.                                               */

  function laySheets(root) {
    const els = $$(".entries .entry", root);
    if (!els.length) return;
    if (!("IntersectionObserver" in window) || still()) {
      els.forEach(e => e.classList.add("laid"));
      return;
    }
    els.forEach((e, i) => e.style.setProperty("--s", i));
    const io = new IntersectionObserver(en => en.forEach(x => {
      if (!x.isIntersecting) return;
      x.target.classList.add("laid");
      io.unobserve(x.target);
    }), { rootMargin: "0px 0px -14% 0px", threshold: 0.12 });
    els.forEach(e => io.observe(e));
  }

  /* ═════════════ 4 · twelve months, at full width ═════════════
     The band that used to be a scrolling marquee. A marquee is motion
     borrowed from advertising; this is the organisation's actual year,
     drawn in the product's own grammar — charges above the line, credits
     below it, the net marked across the top. It states the central idea
     of the product in one glance, and every value in it is real.       */

  function band(host) {
    if (!host) return;
    const rows = V.Store.trend(12);
    if (!rows.length) return;

    host.innerHTML = `
      <div class="shell">
        <div class="band-head">
          <span class="band-t">The year on the ledger<em id="bandOpen"></em></span>
          <span class="band-key">
            <i class="k-g"></i>gross<i class="k-a"></i>avoided<i class="k-n"></i>net position
          </span>
        </div>
        <div class="band-plot"></div>
      </div>`;
    const plot = $(".band-plot", host);

    let w = 0;
    /* Returns false until the element has been laid out and has a width —
       the observer can fire a frame before that. */
    const draw = () => {
      const W = Math.round(plot.clientWidth);
      if (!W) return false;
      if (W === w) return true;
      w = W;
      plot.innerHTML = "";

      const H = 208, T = 10, B = 28;
      const plotH = H - T - B;
      const maxG = Math.max(0.001, ...rows.map(r => r.gross));
      const maxA = Math.max(0.001, ...rows.map(r => r.avoided));
      const up = maxG * 1.12, down = Math.max(maxA * 1.7, up * 0.22);
      const span = up + down;
      const zeroY = T + plotH * (up / span);
      const yOf = v => zeroY - (v / span) * plotH;

      const step = W / rows.length;
      const bw = Math.min(26, Math.max(5, step * 0.34));
      const lastRow = rows[rows.length - 1];

      /* The final month is still being posted to, so it is always short.
         Drawn at full weight it reads as a collapse in emissions, which
         would be a lie told by a chart. It is dimmed, its segment of the
         net line is dashed, and the caption says so. */
      const open = lastRow.month === V.ymOf(V.todayISO());
      const openNote = $("#bandOpen", host);
      if (openNote) openNote.textContent = open
        ? ` — ${V.monthLabel(lastRow.month)} is still open` : "";

      const s = node(plot, "svg", {
        viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img",
        "aria-label": `Twelve months to ${V.monthLabel(lastRow.month)}: gross emissions above the line, avoided emissions below it, net position marked across the top. ${open ? `${V.monthLabel(lastRow.month)} is still open and stands at` : "Latest net position"} ${V.UI.nf(lastRow.net, 1)} tonnes.`
      });

      node(s, "line", { class: "bd-zero", x1: 0, x2: W, y1: zeroY, y2: zeroY });

      const tops = [];
      rows.forEach((r, i) => {
        const cx = i * step + step / 2;
        const x = cx - bw / 2;
        const gy = yOf(r.gross), ay = yOf(-r.avoided);
        tops.push([cx, yOf(r.net)]);

        const part = open && i === rows.length - 1 ? " part" : "";
        const g = node(s, "rect", { class: "bd-g" + part, x: x.toFixed(1), rx: 1.5,
          width: bw.toFixed(1), y: zeroY.toFixed(1), height: 0 });
        const a = node(s, "rect", { class: "bd-a" + part, x: x.toFixed(1), rx: 1.5,
          width: bw.toFixed(1), y: zeroY.toFixed(1), height: 0 });

        const gh = Math.max(1, zeroY - gy), ah = Math.max(1, ay - zeroY);
        if (still()) {
          g.setAttribute("y", gy.toFixed(1)); g.setAttribute("height", gh.toFixed(1));
          a.setAttribute("height", ah.toFixed(1));
        } else {
          const d = 40 * i + 120;
          const t = `y .75s cubic-bezier(.16,1,.3,1) ${d}ms, height .75s cubic-bezier(.16,1,.3,1) ${d}ms`;
          g.style.transition = t; a.style.transition = t;
          requestAnimationFrame(() => requestAnimationFrame(() => {
            g.setAttribute("y", gy.toFixed(1)); g.setAttribute("height", gh.toFixed(1));
            a.setAttribute("height", ah.toFixed(1));
          }));
        }

        node(s, "text", { class: "bd-m" + (i === rows.length - 1 ? (open ? " part" : " on") : ""),
          x: cx.toFixed(1), y: H - 10, "text-anchor": "middle" }, V.Charts.shortMonth(r.month));
      });

      const pts = a => a.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
      const line = node(s, "polyline", { class: "bd-n",
        points: pts(open ? tops.slice(0, -1) : tops) });
      if (open) node(s, "polyline", { class: "bd-n bd-part", points: pts(tops.slice(-2)) });
      if (!still() && line.getTotalLength) {
        const len = line.getTotalLength();
        if (len) {
          line.style.strokeDasharray = len;
          line.style.strokeDashoffset = len;
          requestAnimationFrame(() => {
            line.style.transition = "stroke-dashoffset 1.3s cubic-bezier(.16,1,.3,1) .5s";
            line.style.strokeDashoffset = "0";
          });
        }
      }

      const [lx, ly] = tops[tops.length - 1];
      node(s, "circle", { class: "bd-dot" + (open ? " part" : ""),
        cx: lx.toFixed(1), cy: ly.toFixed(1), r: 3 });
      node(s, "text", { class: "bd-v" + (open ? " part" : ""),
        x: (lx - 9).toFixed(1), y: (ly - 8).toFixed(1), "text-anchor": "end" },
        `${V.UI.nf(lastRow.net, 1)} t${open ? " so far" : ""}`);
      return true;
    };

    let idle;
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(en => {
        if (en[0].isIntersecting && draw()) io.disconnect();
      }, { rootMargin: "0px 0px -5% 0px" });
      io.observe(host);
    } else draw();
    if (!draw()) requestAnimationFrame(draw);

    addEventListener("resize", () => {
      clearTimeout(idle);
      idle = setTimeout(() => { w = 0; draw(); }, 180);
    });
  }

  /* ═════════════ 5 · the position, counted ═════════════
     A tonne of CO₂e is an abstraction nobody can picture. The matrix
     makes the year countable: one dot is two tonnes, twelve columns are
     twelve months, and the silhouette is the shape of the year. It is
     the same series the band above draws, said a second way — as discrete
     units, which is what a ledger actually holds.                      */

  const DOT_T = 2;

  function matrix(host) {
    if (!host) return;
    const rows = V.Store.trend(12);
    if (!rows.length) return;
    const open = rows[rows.length - 1].month === V.ymOf(V.todayISO());
    const tall = Math.max(1, ...rows.map(r => Math.ceil(r.net / DOT_T)));

    let w = 0;
    const draw = () => {
      const W = Math.round(host.clientWidth);
      if (!W) return false;
      if (W === w) return true;
      w = W;
      host.innerHTML = "";

      const cols = rows.length;
      const stepX = W / cols;
      const r = Math.max(2.5, Math.min(5, stepX * 0.16));
      const stepY = r * 3.1;
      const padB = 22;
      const H = Math.ceil(tall * stepY + padB + r * 2);

      const s = node(host, "svg", {
        viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img",
        "aria-label": `Net position month by month as counted units, one dot per ${DOT_T} tonnes CO2e. Tallest month ${tall * DOT_T} tonnes.`
      });

      rows.forEach((row, i) => {
        const filled = Math.ceil(row.net / DOT_T);
        const cx = i * stepX + stepX / 2;
        const part = open && i === rows.length - 1;
        for (let k = 0; k < tall; k++) {
          const cy = H - padB - r - k * stepY;
          const on = k < filled;
          const c = node(s, "circle", {
            class: "mx-d" + (on ? " on" : "") + (on && part ? " part" : ""),
            cx: cx.toFixed(1), cy: cy.toFixed(1), r: r.toFixed(1)
          });
          if (on && !still()) {
            c.style.opacity = "0";
            c.style.transition = `opacity .4s ease ${(i * 55 + k * 14)}ms`;
            requestAnimationFrame(() => requestAnimationFrame(() => { c.style.opacity = ""; }));
          }
        }
        node(s, "text", { class: "mx-m" + (part ? " part" : ""), x: cx.toFixed(1), y: H - 5,
          "text-anchor": "middle" }, V.Charts.shortMonth(row.month));
      });
      return true;
    };

    let idle;
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(en => {
        if (en[0].isIntersecting && draw()) io.disconnect();
      }, { rootMargin: "0px 0px -8% 0px" });
      io.observe(host);
    }
    if (!draw()) requestAnimationFrame(draw);
    addEventListener("resize", () => { clearTimeout(idle); idle = setTimeout(() => { w = 0; draw(); }, 180); });
  }

  /** The cards either side of the matrix, all of them live figures. */
  function bento(root) {
    const S = V.Store;
    const { months, agg, score } = S.summary(12);
    const nf = V.UI.nf;

    const set = (sel, v) => { const el = $(sel, root); if (el) el.textContent = v; };
    set("#bScore", nf(score.composite, 1));
    set("#bGrade", score.grade);
    set("#bFactors", V.FACTORS.length);
    set("#bEntries", S.live().length);
    set("#bAvoided", nf(agg.avoided / 1000, 1));

    try {
      const pb = V.Simulate.PLAYBOOKS.find(p => p.id === "sbti");
      const r = V.Simulate.run(S.entries, pb.positions, months, S.org.headcount);
      set("#bCut", "−" + nf(Math.abs(r.savingPct), 0) + "%");
      set("#bCutTo", `${r.baseScore.grade} → ${r.simScore.grade}`);
    } catch (_) { set("#bCut", "—"); }

    matrix($("#matrix", root));
  }

  /* ═════════════ 6 · the playground ═════════════
     Three of the eight real levers, run through the production scoring
     engine over a copy of the ledger. Nothing here is a mock-up: the
     grade it reports is the grade the console would report.            */

  function playground(host) {
    if (!host) return;
    const S = V.Store;
    const LEV = [
      { id: "ev",     name: "Electrify the fleet", unit: "% of fleet kilometres" },
      { id: "solar",  name: "Add rooftop solar",   unit: "% of grid electricity" },
      { id: "divert", name: "Divert waste",        unit: "% kept from landfill" }
    ];
    const PRE = {
      waste: { divert: 80 },
      fleet: { ev: 80 },
      all:   { ev: 80, solar: 60, divert: 80 },
      reset: {}
    };
    const pos = { ev: 0, solar: 0, divert: 0 };
    let last = null, raf = 0;

    host.innerHTML = `
      <div class="play-hd"><span class="seq">B</span>Try it — on the real engine</div>
      <div class="play-body">
        <div class="play-ctl">
          ${LEV.map(l => `
            <label class="pl"><span class="pl-t"><b>${l.name}</b><output data-out="${l.id}">0%</output></span>
              <input type="range" min="0" max="100" step="5" value="0"
                data-lev="${l.id}" aria-label="${l.name}, ${l.unit}"></label>`).join("")}
          <div class="pl-presets" role="group" aria-label="Preset positions">
            <button class="btn btn-sm" data-pre="waste">Waste first</button>
            <button class="btn btn-sm" data-pre="fleet">Green fleet</button>
            <button class="btn btn-sm" data-pre="all">All three</button>
            <button class="btn btn-sm btn-ghost" data-pre="reset">Reset</button>
          </div>
        </div>
        <div class="play-out">
          <div class="ring">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle class="rg-bg" cx="60" cy="60" r="52"/>
              <circle class="rg-fg" id="plRing" cx="60" cy="60" r="52" pathLength="100"/>
            </svg>
            <div class="rg-c"><b id="plGrade">—</b><span id="plScore">—</span></div>
          </div>
          <div class="pl-stats" aria-live="polite">
            <div class="leader"><span class="l-k">Reduction</span>
              <span class="l-dots"></span><span class="l-v" id="plSave">—</span></div>
            <div class="leader"><span class="l-k">Avoided each year</span>
              <span class="l-dots"></span><span class="l-v" id="plTons">—</span></div>
            <div class="leader total"><span class="l-k">Grade</span>
              <span class="l-dots"></span><span class="l-v" id="plMove">—</span></div>
          </div>
        </div>
      </div>`;

    const run = () => {
      raf = 0;
      const months = S.months();
      const r = V.Simulate.run(S.entries, pos, months, S.org.headcount);
      const c = r.simScore.composite;
      const ring = $("#plRing", host), grade = $("#plGrade", host);
      ring.style.strokeDasharray = `${Math.min(100, Math.max(0, c))} 100`;
      ring.style.stroke = V.bandVar(c);
      grade.textContent = r.simScore.grade;
      grade.style.color = V.bandVar(c);
      $("#plScore", host).textContent = c.toFixed(1) + " / 100";
      $("#plSave", host).textContent = (r.savingKg > 0 ? "−" : "") + Math.abs(r.savingPct).toFixed(0) + "%";
      $("#plTons", host).textContent = (r.annualisedSaving / 1000).toFixed(1) + " t CO₂e";
      $("#plMove", host).textContent = r.baseScore.grade === r.simScore.grade
        ? r.simScore.grade : `${r.baseScore.grade} → ${r.simScore.grade}`;
      if (last && r.simScore.grade !== last && !still()) {
        grade.classList.remove("struck"); void grade.offsetWidth; grade.classList.add("struck");
      }
      last = r.simScore.grade;
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(run); };
    const sync = () => LEV.forEach(l => {
      const i = $(`[data-lev="${l.id}"]`, host);
      i.value = pos[l.id] || 0;
      i.style.setProperty("--fill", (pos[l.id] || 0) + "%");
      $(`[data-out="${l.id}"]`, host).textContent = (pos[l.id] || 0) + "%";
    });

    host.addEventListener("input", e => {
      const i = e.target.closest("[data-lev]");
      if (!i) return;
      pos[i.dataset.lev] = +i.value;
      i.style.setProperty("--fill", i.value + "%");
      $(`[data-out="${i.dataset.lev}"]`, host).textContent = i.value + "%";
      queue();
    });
    host.addEventListener("click", e => {
      const b = e.target.closest("[data-pre]");
      if (!b) return;
      const set = PRE[b.dataset.pre] || {};
      LEV.forEach(l => { pos[l.id] = set[l.id] || 0; });
      sync(); queue();
    });

    sync(); run();
  }

  /* ═════════════ 6b · the planet ═════════════
     The haze is the organisation's real score. The control runs the real
     1.5 °C playbook through the scenario engine and tweens the atmosphere
     to whatever score that engine returns — so the picture and the number
     cannot disagree.                                                    */

  function planet(host) {
    if (!host || !V.Shader) return;
    const sh = V.Shader.mount(host);
    const S = V.Store;
    const base = S.summary(12).score;
    const scoreEl = $("#plScoreV"), gradeEl = $("#plGradeV");
    const btn = $("#planetAct"), note = $("#plNote");

    let cleaned = false, target = null;
    try {
      const pb = V.Simulate.PLAYBOOKS.find(p => p.id === "sbti");
      const r = V.Simulate.run(S.entries, pb.positions, S.months(), S.org.headcount);
      target = { score: r.simScore, cut: Math.abs(r.savingPct), tonnes: r.annualisedSaving / 1000 };
    } catch (_) { /* control simply stays inert */ }

    const paint = (sc, msg) => {
      if (scoreEl) scoreEl.textContent = V.UI.nf(sc.composite, 1);
      if (gradeEl) { gradeEl.textContent = sc.grade; gradeEl.style.color = V.bandVar(sc.composite); }
      if (note) note.innerHTML = msg;
      if (sh) sh.set(V.Shader.fromScore(sc.composite));
    };

    paint(base, "The haze is this organisation's real score.");
    if (sh) sh.jump(V.Shader.fromScore(base.composite));

    if (!btn) return;
    if (!target) { btn.disabled = true; return; }

    btn.addEventListener("click", () => {
      cleaned = !cleaned;
      document.body.classList.toggle("cleaning", cleaned);
      const next = $("#mastNext");
      if (cleaned) {
        paint(target.score,
          `Eight levers, <b>−${V.UI.nf(target.cut, 0)}%</b>, ` +
          `<b>${V.UI.nf(target.tonnes, 1)} t</b> avoided a year.`);
        btn.querySelector("span").textContent = "Put it back";
        // the way on only opens once the point has been made
        if (next) {
          next.classList.add("in");
          clearTimeout(planet._t);
          planet._t = setTimeout(() => {
            if (next.classList.contains("in") && !still()) {
              next.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
          }, 1500);
        }
      } else {
        paint(base, "The haze is this organisation's real score.");
        btn.querySelector("span").textContent = "Clean it up";
        clearTimeout(planet._t);
        if (next) next.classList.remove("in");
      }
    });
  }

  /* ═════════════ 7 · page hooks ═════════════ */

  function home() {
    headline($(".mast-copy h1"));
    planet($("#planet"));
    V.Deck.build($("#deck"));
    band($("#band"));
    bento(document);
    playground($("#play"));
    laySheets($(".site"));
    reveals($(".site"));
  }

  /** Console panels settle in reading order when a module opens. */
  function stagger() {
    $$("#canvas .module .panel, #canvas .module .kpi")
      .forEach((p, i) => p.style.setProperty("--n", Math.min(i, 8)));
  }

  function init() { progress(); }

  V.FX = { init, home, stagger };
})();
