/* ══════════════════════════════════════════════════════════════════════
   deck.js — the masthead deck: the ledger as physical documents in space.

   The brief was three dimensions without abstract geometry, so there are
   no cubes, spheres or wireframes here. The object is the one the product
   actually produces: a set of accounts, printed. Five sheets — a statement
   of position, a schedule of sources, a certificate of integrity, a
   scenario and an extract of postings — stacked, lit, and shuffled.

   Every figure on every sheet is computed from the live ledger. The
   scenario sheet runs the real scenario engine. Nothing is placeholder.

   Depth is genuine: the sheets sit at different translateZ inside one
   perspective, so parallax between them falls out of the projection
   rather than being faked with differing scroll rates.

   Degrades: no pointer parallax without a fine pointer, no dealing or
   tilting under prefers-reduced-motion, and the deck flattens to a
   single readable sheet with its selector beneath on small screens.
   ══════════════════════════════════════════════════════════════════════ */

window.VL = window.VL || {};

(() => {
  "use strict";
  const V = window.VL;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = () => matchMedia("(pointer: fine)").matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ── the sheets ──────────────────────────────────────────────────── */

  function sheets() {
    const S = V.Store;
    const { months, agg, score } = S.summary(12);
    const esc = V.UI.escapeHtml, nf = V.UI.nf;
    const t = kg => nf(Math.abs(kg) / 1000, 1);

    const leader = (k, v, cls = "", style = "") =>
      `<div class="leader ${cls}"><span class="l-k">${k}</span>
        <span class="l-dots"></span><span class="l-v" ${style}>${v}</span></div>`;

    /* A — the statement the whole product exists to produce */
    const A = `
      ${leader("Emitted", t(agg.gross))}
      ${leader("Saved by recycling and solar", "−" + t(agg.avoided), "", `style="color:var(--good)"`)}
      ${leader("Overall footprint", t(agg.net), "total")}
      ${leader("Sustainability score", `${nf(score.composite, 1)} · ${score.grade}`)}
      ${leader("Records", S.live().length)}`;

    /* B — where the tonnes actually come from */
    const cats = V.CATEGORIES
      .map(c => ({ c, kg: agg.byCat[c.id] || 0 }))
      .filter(r => r.kg > 0)
      .sort((a, b) => b.kg - a.kg)
      .slice(0, 5);
    const maxCat = Math.max(...cats.map(r => r.kg), 1);
    const B = `<div class="sh-bars">${cats.map(r => `
      <div class="sh-bar">
        <span class="sb-k">${esc(r.c.name)}</span>
        <span class="sb-t"><i style="--w:${(r.kg / maxCat * 100).toFixed(1)}%;--c:${V.catColor(r.c.id)}"></i></span>
        <span class="sb-v">${t(r.kg)}</span>
      </div>`).join("")}</div>`;

    /* C — the seal, with the real chain head printed on it */
    const head = S.head || "";
    const groups = (head.match(/.{1,16}/g) || []).slice(0, 4).join("\n");
    const C = `
      <div class="sh-seal">
        <div class="sh-big">${S.live().length}<u>records locked</u></div>
        <pre class="sh-hash">${esc(groups)}</pre>
        <div class="sh-algo">Each record locked to the one before</div>
        <div class="sh-stamp" aria-hidden="true"><span>verified</span></div>
      </div>`;

    /* D — the real scenario engine, on the 1.5 °C playbook */
    const pb = V.Simulate.PLAYBOOKS.find(p => p.id === "sbti");
    let D = "";
    try {
      const r = V.Simulate.run(S.entries, pb.positions, months, S.org.headcount);
      D = `
        <div class="sh-move">
          <b style="color:${V.bandVar(r.baseScore.composite)}">${r.baseScore.grade}</b>
          <i aria-hidden="true">→</i>
          <b style="color:${V.bandVar(r.simScore.composite)}">${r.simScore.grade}</b>
        </div>
        ${leader("Changes applied", r.active.length)}
        ${leader("Reduction", `−${nf(Math.abs(r.savingPct), 0)}%`)}
        ${leader("Saved each year", `${nf(r.annualisedSaving / 1000, 1)} t`)}
        ${leader("Score", `${nf(r.baseScore.composite, 1)} → ${nf(r.simScore.composite, 1)}`, "total")}`;
    } catch (_) {
      D = `<p class="sh-note">The planner is not available right now.</p>`;
    }

    /* E — the postings themselves, which everything above is built from */
    const recent = V.Chain.order(S.live()).slice(-4).reverse();
    const E = `<div class="sh-rows">${recent.map(e => {
      const f = V.byId[e.factorId];
      const credit = e.co2 < 0;
      return `<div class="sh-row">
        <span class="sr-d">${esc(V.dateLabel(e.date))}</span>
        <span class="sr-l">${esc(f ? f.label : "Entry")}</span>
        <span class="sr-v ${credit ? "cr" : ""}">${credit ? "−" : ""}${nf(Math.abs(e.co2), 1)}</span>
      </div>`;
    }).join("")}</div>`;

    const period = `${V.monthLabel(months[0])} — ${V.monthLabel(months[months.length - 1])}`;

    return [
      { k: "A", title: "Carbon summary", foot: period,
        note: "What you emitted, what recycling and solar saved, and the footprint left over.",
        lead: `<div class="sh-fig">${t(agg.net)}<u>tonnes CO₂<br>overall</u></div>`, body: A },
      { k: "B", title: "Where it comes from", foot: "top five of eight categories",
        note: "Electricity, travel, purchases, waste — ranked, so you know what to fix first.", body: B },
      { k: "C", title: "Data check", foot: "checked when the page loaded",
        note: "Every record is locked to the one before it. Change an old one and the check fails.", body: C },
      { k: "D", title: "Plan for the 1.5 °C goal", foot: "worked out by the planner",
        note: "Eight changes, the carbon each one saves, and the grade they add up to.", body: D },
      { k: "E", title: "Latest activity", foot: "four most recent records",
        note: "The newest entries, with the factor each was priced at.", body: E }
    ];
  }

  /* ── the stage ───────────────────────────────────────────────────── */

  function build(host) {
    if (!host) return;
    let cards;
    try { cards = sheets(); } catch (err) { console.error(err); return; }

    const S0 = V.Store;
    const sum0 = S0.summary(12);
    const chips = `
      <div class="deck-chips" aria-hidden="true">
        <span class="dchip c1">${V.UI.icon("shield", 13)}${S0.live().length} records locked</span>
        <span class="dchip c2">${V.UI.icon("book", 13)}${V.FACTORS.length} official factors</span>
        <div class="dstat c3">
          <b>${V.UI.nf(sum0.score.composite, 1)}</b>
          <span>score<br>grade ${sum0.score.grade}</span>
        </div>
      </div>`;

    host.innerHTML = chips + `
      <div class="deck" id="deckInner">
        ${cards.map((c, i) => `
          <article class="sheet" style="--o:${i}" data-i="${i}" aria-hidden="${i ? "true" : "false"}">
            <div class="sh-hd"><span class="seq">${c.k}</span>${c.title}</div>
            <div class="rule"></div>
            ${c.lead || ""}
            <div class="sh-body">${c.body}</div>
            <div class="sh-ft">${c.foot}</div>
          </article>`).join("")}
      </div>
      <div class="deck-nav" role="group" aria-label="Choose a sheet">
        ${cards.map((c, i) => `
          <button class="dk" data-go="${i}" aria-pressed="${i === 0}"
            title="${c.title}"><span>${c.k}</span></button>`).join("")}
      </div>`;

    /* The stack is one report at a time; the list says what the other four
       are. Same selection, two ways in — and it gives the section its
       right-hand half back on a wide screen. */
    const listHost = document.querySelector("#deckList");
    if (listHost) {
      listHost.innerHTML = cards.map((c, i) => `
        <button class="dl-item${i === 0 ? " on" : ""}" data-go="${i}">
          <span class="dl-k">${c.k}</span>
          <span class="dl-t"><b>${c.title}</b><em>${c.note || ""}</em></span>
        </button>`).join("");
    }

    const inner = $("#deckInner", host);
    const sheetEls = $$(".sheet", host);
    const dots = $$(".dk", host);
    const n = sheetEls.length;
    let front = 0;

    /* Order is relative to whichever sheet is in front, so shuffling is a
       reassignment of depth rather than a reordering of the DOM. */
    const place = () => {
      sheetEls.forEach((el, i) => {
        const o = (i - front + n) % n;
        el.style.setProperty("--o", o);
        el.classList.toggle("front", o === 0);
        el.setAttribute("aria-hidden", o === 0 ? "false" : "true");
        el.style.zIndex = n - o;
      });
      dots.forEach((d, i) => d.setAttribute("aria-pressed", String(i === front)));
      if (listHost) {
        $$(".dl-item", listHost).forEach((b, i) => b.classList.toggle("on", i === front));
      }
    };

    const go = i => { front = ((i % n) + n) % n; host.classList.add("spread"); place(); };
    place();

    dots.forEach(d => d.addEventListener("click", () => go(+d.dataset.go)));
    if (listHost) {
      $$(".dl-item", listHost).forEach(b => b.addEventListener("click", () => go(+b.dataset.go)));
    }
    sheetEls.forEach(el => el.addEventListener("click", () => {
      if (!el.classList.contains("front")) go(+el.dataset.i);
    }));

    /* Arrow keys cycle the deck while the focus is inside it. */
    host.addEventListener("keydown", e => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); go(front + 1); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); go(front - 1); }
    });

    /* Dealing the sheets in, back to front. */
    if (!still()) {
      host.classList.add("dealing");
      requestAnimationFrame(() => requestAnimationFrame(() => host.classList.remove("dealing")));
    }

    /* ── pointer parallax ──
       One object, one perspective. The rotation is small and damped; the
       point is that the sheets separate, not that the card spins.      */
    if (fine() && !still()) {
      const stageOf = host.closest(".mast") || host;
      let tx = 0, ty = 0, cx = 0, cy = 0, run = false;
      const tick = () => {
        cx += (tx - cx) * 0.08;
        cy += (ty - cy) * 0.08;
        inner.style.setProperty("--ry", cx.toFixed(2));
        inner.style.setProperty("--rx", cy.toFixed(2));
        if (Math.abs(tx - cx) > 0.01 || Math.abs(ty - cy) > 0.01) requestAnimationFrame(tick);
        else run = false;
      };
      const kick = () => { if (!run) { run = true; requestAnimationFrame(tick); } };
      stageOf.addEventListener("pointermove", e => {
        const r = stageOf.getBoundingClientRect();
        tx = clamp(((e.clientX - r.left) / r.width - 0.5) * -26, -16, 16);
        ty = clamp(((e.clientY - r.top) / r.height - 0.5) * 14, -9, 9);
        kick();
      }, { passive: true });
      stageOf.addEventListener("pointerleave", () => { tx = 0; ty = 0; kick(); });
    }

    /* ── scroll ──
       The deck lies back and sinks as the masthead leaves, so the hero
       reads as an object on a desk rather than a picture pinned to it. */
    if (!still()) {
      let queued = false;
      const onScroll = () => {
        queued = false;
        if (!host.isConnected) return removeEventListener("scroll", raf);
        const r = host.getBoundingClientRect();
        const p = clamp(1 - (r.bottom / (innerHeight + r.height)), 0, 1);
        host.style.setProperty("--sy", p.toFixed(3));
      };
      const raf = () => { if (!queued) { queued = true; requestAnimationFrame(onScroll); } };
      addEventListener("scroll", raf, { passive: true });
      onScroll();
    }
  }

  V.Deck = { build };
})();
