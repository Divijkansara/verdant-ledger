/* ══════════════════════════════════════════════════════════════════════
   scroll.js — what the landing page does while you scroll.

   Four behaviours, all driven by one rAF-batched scroll read so the page
   never lays out twice in a frame:

     1 · the hero departs     the globe drifts and fades slower than the
                              copy above it, which gives the space behind
                              the page real depth instead of a flat slide
     2 · a chapter rail       where you are in the document, and a click
                              to jump — the page is long and numbered, so
                              it should say which clause you are reading
     3 · headings arrive      section titles resolve word by word as they
                              enter, the same treatment the masthead gets
     4 · a scroll cue         one hint at the fold, gone the moment you
                              move, never shown again

   Everything here is ornament: with prefers-reduced-motion, or without
   IntersectionObserver, the page is simply a page.
   ══════════════════════════════════════════════════════════════════════ */

(() => {
  "use strict";
  const V = window.VL;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  /* The chapters, in document order. The label is what the rail shows. */
  const CHAPTERS = [
    [".mast", "Top"],
    [".band", "The year"],
    [".deck-section", "Reports"],
    [".bento", "In numbers"],
    ["#problem", "The problem"],
    ["#how", "How it works"],
    ["#simulate", "Planner"],
    ["#questions", "Questions"],
    [".closing", "Start"]
  ];

  let bound = [], raf = 0, rail = null, cue = null;

  /* ── 1 · the hero departs ────────────────────────────────────────── */
  function heroDeparture() {
    const mast = $(".mast"), planet = $("#planet"), copy = $(".mast-copy");
    if (!mast || !planet) return null;
    // A phone shows the globe above the copy, so a big parallax would pull
    // it into the text; it gets a gentler one.
    const narrow = innerWidth < 820;
    return () => {
      const h = mast.offsetHeight || 1;
      const p = clamp(scrollY / h);
      planet.style.transform = `translate3d(0, ${p * (narrow ? 40 : 110)}px, 0)`;
      planet.style.opacity = String(1 - clamp(p * 1.25) * 0.85);
      if (copy) copy.style.transform = `translate3d(0, ${p * (narrow ? -12 : -40)}px, 0)`;
    };
  }

  /* ── 2 · the chapter rail ────────────────────────────────────────── */
  function buildRail() {
    const marks = CHAPTERS
      .map(([sel, label]) => ({ el: $(sel), label }))
      .filter(m => m.el);
    if (marks.length < 3 || innerWidth < 1080) return null;

    rail = document.createElement("nav");
    rail.className = "chapters";
    rail.setAttribute("aria-label", "Sections");
    rail.innerHTML = marks.map((m, i) =>
      `<button class="ch" data-i="${i}"><i></i><span>${m.label}</span></button>`).join("");
    document.body.appendChild(rail);

    rail.addEventListener("click", e => {
      const b = e.target.closest(".ch");
      if (!b) return;
      marks[+b.dataset.i].el.scrollIntoView({
        behavior: still() ? "auto" : "smooth", block: "start"
      });
    });

    const dots = $$(".ch", rail);
    return () => {
      // The chapter you are reading is the last one whose top has passed
      // the upper third of the screen.
      const line = scrollY + innerHeight * 0.34;
      let active = 0;
      marks.forEach((m, i) => { if (m.el.offsetTop <= line) active = i; });
      dots.forEach((d, i) => d.classList.toggle("on", i === active));
      rail.classList.toggle("hide", scrollY < innerHeight * 0.55);
    };
  }

  /* ── 3 · headings arrive ─────────────────────────────────────────── */
  function headings(root) {
    const hs = $$(".ds-hd h2, .bento-hd h2, .clause h2, .closing h2", root);
    if (still() || !("IntersectionObserver" in window)) return null;

    hs.forEach(h => {
      if (h.dataset.split) return;
      h.dataset.split = "1";
      let n = 0;
      const walk = el => [...el.childNodes].forEach(node => {
        if (node.nodeType === 3) {
          const frag = document.createDocumentFragment();
          node.textContent.split(/(\s+)/).forEach(tok => {
            if (!tok.trim()) return frag.appendChild(document.createTextNode(tok));
            const s = document.createElement("span");
            s.className = "h-word";
            s.style.setProperty("--w", n++);
            s.textContent = tok;
            frag.appendChild(s);
          });
          node.replaceWith(frag);
        } else if (node.nodeType === 1 && node.tagName !== "BR") walk(node);
      });
      walk(h);
    });

    const io = new IntersectionObserver(en => en.forEach(x => {
      if (!x.isIntersecting) return;
      x.target.classList.add("h-in");
      io.unobserve(x.target);
    }), { rootMargin: "0px 0px -15% 0px", threshold: 0.2 });
    hs.forEach(h => io.observe(h));

    // A hidden heading is worse than an unanimated one. The observer gives
    // the nice timing; this guarantees the text, on load and on every
    // scroll frame, whatever the observer does.
    const ensure = () => hs.forEach(h => {
      if (h.getBoundingClientRect().top < innerHeight) h.classList.add("h-in");
    });
    setTimeout(ensure, 1600);
    return ensure;
  }

  /* ── 4 · the scroll cue ──────────────────────────────────────────── */
  function scrollCue() {
    const stage = $(".mast-stage");
    if (!stage || still()) return;
    cue = document.createElement("div");
    cue.className = "scroll-cue";
    cue.setAttribute("aria-hidden", "true");
    cue.innerHTML = `<span>Scroll</span><i></i>`;
    $(".mast").appendChild(cue);
    const hide = () => { if (scrollY > 40) cue.classList.add("gone"); };
    hide();
    return hide;
  }

  /* ── wiring ──────────────────────────────────────────────────────── */
  /* One read per frame. A frame requested while the tab is hidden never
     runs, so each scroll replaces the pending one rather than trusting a
     flag that would stay set for ever. */
  function onScroll(steps) {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { raf = 0; steps.forEach(fn => fn()); });
  }

  function teardown() {
    bound.forEach(([t, ev, fn]) => t.removeEventListener(ev, fn));
    bound = [];
    if (rail) { rail.remove(); rail = null; }
    if (cue) { cue.remove(); cue = null; }
    const planet = $("#planet"), copy = $(".mast-copy");
    if (planet) { planet.style.transform = ""; planet.style.opacity = ""; }
    if (copy) copy.style.transform = "";
  }

  /** Called by FX.home() once the landing page is in the document. */
  function home() {
    teardown();

    const steps = [heroDeparture(), buildRail(), scrollCue(), headings(document)]
      .filter(Boolean);
    if (!steps.length) return;

    const handler = () => onScroll(steps);
    addEventListener("scroll", handler, { passive: true });
    addEventListener("resize", handler, { passive: true });
    // Coming back to the tab: catch up with wherever the page now sits.
    const wake = () => { if (!document.hidden) steps.forEach(fn => fn()); };
    document.addEventListener("visibilitychange", wake);
    bound.push([window, "scroll", handler], [window, "resize", handler],
               [document, "visibilitychange", wake]);
    steps.forEach(fn => fn());
  }

  V.ScrollFX = { home, teardown };
})();
