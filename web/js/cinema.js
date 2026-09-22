/* ══════════════════════════════════════════════════════════════════════
   cinema.js — the landing page as one continuous camera move.

   The globe stops being a picture inside the hero and becomes the thing
   the camera is looking at. Scrolling flies the camera: it closes on the
   planet through the masthead, then pulls away and swings the terminator
   round as the year and the reports pass over it, and finally lets go.

   On top of that, three pieces of depth that answer the pointer rather
   than the scroll: a light that follows the cursor, cards that lean
   toward it, and the primary buttons pulling slightly under it.

   It runs only where it belongs — a real pointer, a wide window, motion
   allowed, and a working WebGL globe. Everywhere else the page keeps the
   quieter behaviour in scroll.js, which is a complete page on its own.
   ══════════════════════════════════════════════════════════════════════ */

(() => {
  "use strict";
  const V = window.VL;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  /** Smooth 0→1 across [a,b]; the easing that makes a scrub feel filmed. */
  const span = (v, a, b) => {
    const t = clamp((v - a) / (b - a || 1));
    return t * t * (3 - 2 * t);
  };

  let bound = [], raf = 0, spot = null, on = false;

  function enabled() {
    return !still()
      && innerWidth >= 1080
      && matchMedia("(pointer: fine)").matches
      && !!(V.Shader && V.Shader.instance && V.Shader.instance.camera);
  }

  /* ── the camera move ─────────────────────────────────────────────── */
  function flight() {
    const mast = $(".mast"), planet = $("#planet"), deck = $(".deck-section");
    const shader = V.Shader.instance;
    if (!mast || !planet || !shader) return null;

    planet.classList.add("cine");
    document.body.classList.add("cinema-on");

    // The arrival. At the top of the page the planet starts small and far
    // and glides in while the headline assembles; the slow ease is handed
    // back to the scroll rate once it has landed.
    if (scrollY < 40) {
      shader.camera({ ease: 0.035, zoom: 0.55, dx: 0.1, dy: 0.04, spin: -0.5 });
      setTimeout(() => shader.camera({ zoom: 1, dx: 0, dy: 0, spin: 0 }), 90);
      setTimeout(() => shader.camera({ ease: 0.14 }), 2400);
    }

    return () => {
      const heroH = mast.offsetHeight || innerHeight;
      const bandEnd = (deck ? deck.offsetTop : heroH * 2);
      const y = scrollY;

      // Act one: the approach. The planet grows and turns a little.
      const approach = span(y, 0, heroH);
      // Act two: the retreat, across the year and into the reports.
      const retreat = span(y, heroH * 0.75, bandEnd);

      shader.camera({
        zoom: 1 + approach * 0.42 - retreat * 0.95,
        dx: approach * 0.05 - retreat * 0.34,
        dy: -approach * 0.02 - retreat * 0.16,
        spin: approach * 0.22 + retreat * 0.55
      });

      // The planet is gone by the time the first text section arrives.
      // A lit globe behind a chart looks wonderful in a still and is
      // unreadable in use, and the page has to be usable first.
      const fade = 1 - span(y, heroH * 0.5, heroH * 1.0);
      planet.style.opacity = String(fade);
      // Once it is gone it must stop drawing, or a fixed canvas would
      // render behind the whole page for nothing.
      planet.style.visibility = fade < 0.02 ? "hidden" : "visible";
    };
  }

  /* ── a light that follows the pointer ────────────────────────────── */
  function spotlight() {
    spot = document.createElement("div");
    spot.className = "cine-spot";
    spot.setAttribute("aria-hidden", "true");
    document.body.appendChild(spot);
    let x = innerWidth / 2, y = innerHeight * 0.4, tx = x, ty = y, run = 0;
    const step = () => {
      run = 0;
      x += (tx - x) * 0.12; y += (ty - y) * 0.12;
      spot.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
      if (Math.abs(tx - x) + Math.abs(ty - y) > 0.6) run = requestAnimationFrame(step);
    };
    const move = e => {
      tx = e.clientX; ty = e.clientY;
      if (!run) run = requestAnimationFrame(step);
    };
    addEventListener("pointermove", move, { passive: true });
    bound.push([window, "pointermove", move]);
    return null;
  }

  /* ── cards lean toward the pointer ───────────────────────────────── */
  function tilt() {
    const cards = $$(".bcard, .note, .entry, .closing-in");
    cards.forEach(c => c.classList.add("cine-tilt"));

    const enter = e => {
      const c = e.currentTarget, r = c.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      c.style.setProperty("--rx", (-py * 5).toFixed(2) + "deg");
      c.style.setProperty("--ry", (px * 7).toFixed(2) + "deg");
      c.style.setProperty("--lx", ((px + 0.5) * 100).toFixed(1) + "%");
      c.style.setProperty("--ly", ((py + 0.5) * 100).toFixed(1) + "%");
    };
    const leave = e => {
      const c = e.currentTarget;
      c.style.setProperty("--rx", "0deg");
      c.style.setProperty("--ry", "0deg");
    };
    cards.forEach(c => {
      c.addEventListener("pointermove", enter);
      c.addEventListener("pointerleave", leave);
      bound.push([c, "pointermove", enter], [c, "pointerleave", leave]);
    });
    return null;
  }

  /* ── the call to action pulls toward the pointer ─────────────────── */
  function magnetic() {
    $$(".mast-cta .btn, .closing .btn, .mast-next .btn").forEach(b => {
      const move = e => {
        const r = b.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        b.style.transform = `translate(${(dx * 10).toFixed(1)}px, ${(dy * 6).toFixed(1)}px)`;
      };
      const out = () => { b.style.transform = ""; };
      b.addEventListener("pointermove", move);
      b.addEventListener("pointerleave", out);
      bound.push([b, "pointermove", move], [b, "pointerleave", out]);
    });
    return null;
  }

  /* ── wiring ──────────────────────────────────────────────────────── */
  function teardown() {
    bound.forEach(([t, ev, fn]) => t.removeEventListener(ev, fn));
    bound = [];
    if (spot) { spot.remove(); spot = null; }
    document.body.classList.remove("cinema-on");
    const planet = $("#planet");
    if (planet) {
      planet.classList.remove("cine");
      planet.style.opacity = "";
      planet.style.visibility = "";
    }
    $$(".cine-tilt").forEach(c => {
      c.classList.remove("cine-tilt");
      c.style.removeProperty("--rx"); c.style.removeProperty("--ry");
    });
    if (V.Shader && V.Shader.instance && V.Shader.instance.camera) {
      V.Shader.instance.camera({ zoom: 1, dx: 0, dy: 0, spin: 0 });
    }
    on = false;
  }

  function home() {
    teardown();
    if (!enabled()) return;
    on = true;

    const steps = [flight(), spotlight(), tilt(), magnetic()].filter(Boolean);
    const handler = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { raf = 0; steps.forEach(fn => fn()); });
    };
    addEventListener("scroll", handler, { passive: true });
    addEventListener("resize", handler, { passive: true });
    bound.push([window, "scroll", handler], [window, "resize", handler]);
    steps.forEach(fn => fn());
  }

  V.Cinema = { home, teardown, enabled, get on() { return on; } };
})();
