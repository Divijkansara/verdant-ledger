/* ══════════════════════════════════════════════════════════════════════
   tour.js — the guided walkthrough and the keyboard-shortcut sheet.

   A judge, a new sustainability officer and a returning user all need
   different things from the first minute. The tour gives the first two a
   90-second path through the ideas that make this product different, and
   it costs the third nothing: it is offered once, never forced, and can be
   reopened from the command palette or the topbar at any time.

   Design rules it follows
   · Spotlight, not modal — the real interface stays visible and lit.
   · Fully keyboard-driven: → / Enter next, ← back, Esc leave.
   · Focus moves into the card and returns on close; the card is announced.
   · Falls back to a centred card when a target is hidden (mobile rail).
   · Respects prefers-reduced-motion through the shared CSS token.
   ══════════════════════════════════════════════════════════════════════ */

window.VL = window.VL || {};

(() => {
  "use strict";
  const V = window.VL;
  const $ = s => document.querySelector(s);
  const LS_SEEN = "vl.tour.seen";

  /* Each step may navigate first, then highlight a selector.
     `place` is a preference; the card flips if there is no room.       */
  const STEPS = [
    { title: "A ledger, not a form",
      body: "Every figure here is built from dated, sourced entries. Consumption posts as a <b>charge</b>; recycling and on-site solar post as <b>credits</b>. Your position is the net of both. This 90-second tour shows the five ideas worth seeing.",
      hash: "#/app/overview" },

    { title: "One number you can act on",
      body: "The score is a weighted blend of five intensities and ratios, not a tonnage, so a 500-person company and a 50-person one are judged fairly. It stays visible in the sidebar on every screen.",
      target: ".rail-score", place: "right", hash: "#/app/overview" },

    { title: "Read the position at a glance",
      body: "Each tile pairs a value with a verdict and a trend. Colour is never the only signal: every state also carries a word — <i>on track</i>, <i>needs work</i>, <i>off track</i>.",
      target: "#canvas .g4", place: "bottom", hash: "#/app/overview" },

    { title: "Change the window, everything follows",
      body: "One period control drives every chart, score and table in the console. Try 1M, then 12M.",
      target: "#periodSeg", place: "bottom", hash: "#/app/overview" },

    { title: "Post an entry, see the price live",
      body: "Choose a category and a quantity; the readout prices it against the published factor <em>before</em> you commit, and shows the source. Nothing is a black box.",
      target: "#canvas .module", place: "top", hash: "#/app/post" },

    { title: "Decide before you spend",
      body: "Eight intervention levers rewrite a copy of the ledger and re-run the real scoring engine. Load the 1.5 °C playbook from the command palette and watch the grade move.",
      target: "#canvas .module", place: "top", hash: "#/app/simulate" },

    { title: "Prove nothing was altered",
      body: "Each entry is hashed with the one before it. Press the tamper button, then verify — the chain names the exact row that changed. Entries are never deleted; mistakes are voided with a reason.",
      target: "#canvas .module", place: "top", hash: "#/app/integrity" },

    { title: "Everything is one keystroke away",
      body: "Press <kbd>⌘K</kbd> or <kbd>Ctrl K</kbd> for the command palette — jump anywhere, switch theme, export the disclosure. Press <kbd>?</kbd> at any time for every shortcut.",
      target: "#paletteBtn", place: "bottom", hash: "#/app/overview" }
  ];

  let state = null;   // { i, opener, onKey, onResize }

  /* ── geometry ───────────────────────────────────────────────────── */

  function visibleRect(sel) {
    if (!sel) return null;
    const el = $(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const onScreen = r.width > 8 && r.height > 8 &&
      r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
    return onScreen ? { el, r } : null;
  }

  function place(card, hit, prefer) {
    const gap = 16, pad = 12;
    const cw = card.offsetWidth, ch = card.offsetHeight;
    if (!hit) {
      card.style.left = Math.max(pad, (innerWidth - cw) / 2) + "px";
      card.style.top = Math.max(pad, (innerHeight - ch) / 2.2) + "px";
      return;
    }
    const { r } = hit;
    const room = {
      right:  innerWidth - r.right - gap,
      left:   r.left - gap,
      bottom: innerHeight - r.bottom - gap,
      top:    r.top - gap
    };
    const fits = {
      right:  room.right  >= cw + pad,
      left:   room.left   >= cw + pad,
      bottom: room.bottom >= ch + pad,
      top:    room.top    >= ch + pad
    };
    const order = [prefer, "bottom", "right", "top", "left"];
    const side = order.find(s => s && fits[s]) || null;

    let x, y;
    if (side === "right")       { x = r.right + gap; y = r.top; }
    else if (side === "left")   { x = r.left - gap - cw; y = r.top; }
    else if (side === "bottom") { x = r.left; y = r.bottom + gap; }
    else if (side === "top")    { x = r.left; y = r.top - gap - ch; }
    else {
      // Target is too large for any side (e.g. a tall module): dock the
      // card to the bottom edge instead of covering the highlight.
      x = (innerWidth - cw) / 2; y = innerHeight - ch - pad;
    }
    x = Math.min(Math.max(pad, x), innerWidth - cw - pad);
    y = Math.min(Math.max(pad, y), innerHeight - ch - pad);
    card.style.left = x + "px";
    card.style.top = y + "px";
  }

  /* ── rendering one step ─────────────────────────────────────────── */

  async function show(i) {
    if (!state) return;
    state.i = i;
    const step = STEPS[i];
    const V_ = window.VL;

    if (step.hash && location.hash !== step.hash) {
      location.hash = step.hash;
      await new Promise(r => setTimeout(r, 260));   // let the route paint
      if (!state) return;
    }

    const root = $("#tour");
    const ring = root.querySelector(".tour-ring");
    const card = root.querySelector(".tour-card");

    card.querySelector(".tour-step").textContent = `Step ${i + 1} of ${STEPS.length}`;
    card.querySelector("h2").innerHTML = step.title;
    card.querySelector(".tour-body").innerHTML = step.body;
    card.querySelector(".tour-dots").innerHTML = STEPS.map((_, k) =>
      `<i class="${k === i ? "on" : k < i ? "done" : ""}"></i>`).join("");
    card.querySelector("[data-tour=back]").hidden = i === 0;
    card.querySelector("[data-tour=next]").innerHTML =
      i === STEPS.length - 1 ? "Finish" : `Next ${V_.UI.icon("arrow", 14)}`;
    card.querySelector(".tour-prog i").style.width = ((i + 1) / STEPS.length * 100) + "%";

    let hit = visibleRect(step.target);
    if (hit) {
      // Large targets (a whole module) are highlighted by their top band
      // only, so the card never has to sit on top of what it describes.
      hit.el.scrollIntoView({ block: "nearest", behavior: "auto" });
      hit = visibleRect(step.target);
    }

    if (hit) {
      const r = hit.r;
      const h = Math.min(r.height, innerHeight * 0.42);
      ring.hidden = false;
      ring.style.cssText =
        `left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${h + 12}px`;
      hit = { el: hit.el, r: { left: r.left, right: r.right, top: r.top, bottom: r.top + h,
                               width: r.width, height: h } };
    } else {
      ring.hidden = true;
    }

    root.classList.toggle("centered", !hit);
    place(card, hit, step.place);
    card.querySelector("[data-tour=next]").focus({ preventScroll: true });
  }

  /* ── lifecycle ──────────────────────────────────────────────────── */

  function start() {
    if (state) return;
    try { localStorage.setItem(LS_SEEN, "1"); } catch (e) { /* private mode */ }
    const V_ = window.VL;

    const root = document.createElement("div");
    root.id = "tour";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "tourTitle");
    root.innerHTML = `
      <div class="tour-ring" hidden></div>
      <div class="tour-card" aria-live="polite">
        <div class="tour-prog" aria-hidden="true"><i></i></div>
        <div class="tour-step"></div>
        <h2 id="tourTitle"></h2>
        <p class="tour-body"></p>
        <div class="tour-foot">
          <div class="tour-dots" aria-hidden="true"></div>
          <div class="tour-btns">
            <button class="btn btn-ghost" data-tour="skip">Skip</button>
            <button class="btn" data-tour="back">Back</button>
            <button class="btn btn-primary" data-tour="next"></button>
          </div>
        </div>
        <div class="tour-keys"><kbd>←</kbd><kbd>→</kbd> navigate · <kbd>Esc</kbd> leave</div>
      </div>`;
    document.body.appendChild(root);

    state = {
      i: 0,
      opener: document.activeElement,
      onKey: e => {
        if (e.key === "Escape") { e.preventDefault(); stop(); }
        else if (e.key === "ArrowRight" || (e.key === "Enter" && !e.target.closest("[data-tour=back],[data-tour=skip]"))) {
          e.preventDefault(); next();
        } else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
        else if (e.key === "Tab") {
          // keep focus inside the card
          const f = [...root.querySelectorAll("button:not([hidden])")];
          const first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      },
      onResize: () => show(state.i),
      // leaving the console by any other route ends the tour
      onHash: () => { if (!location.hash.startsWith("#/app")) stop(); }
    };
    window.addEventListener("hashchange", state.onHash);
    document.addEventListener("keydown", state.onKey, true);
    window.addEventListener("resize", state.onResize);
    root.addEventListener("click", e => {
      const b = e.target.closest("[data-tour]");
      if (!b) return;
      if (b.dataset.tour === "next") next();
      else if (b.dataset.tour === "back") back();
      else stop();
    });

    show(0);
  }

  function next() {
    if (!state) return;
    if (state.i >= STEPS.length - 1) { stop(true); return; }
    show(state.i + 1);
  }
  function back() { if (state && state.i > 0) show(state.i - 1); }

  function stop(finished) {
    if (!state) return;
    document.removeEventListener("keydown", state.onKey, true);
    window.removeEventListener("resize", state.onResize);
    window.removeEventListener("hashchange", state.onHash);
    const { opener } = state;
    state = null;
    const root = $("#tour");
    if (root) root.remove();
    if (opener && opener.focus) opener.focus({ preventScroll: true });
    if (finished) window.VL.UI.toast("Tour complete", "Press ? for every keyboard shortcut", "ok");
  }

  /* Offer the tour once, quietly, on the first console visit. */
  function offer() {
    let seen = false;
    try { seen = !!localStorage.getItem(LS_SEEN); } catch (e) { seen = true; }
    if (seen || state) return;
    try { localStorage.setItem(LS_SEEN, "offered"); } catch (e) { /* ignore */ }
    const host = $("#toasts");
    if (!host) return;
    const node = document.createElement("div");
    node.className = "toast toast-info toast-action";
    node.innerHTML = `
      <span class="t-ico">${window.VL.UI.icon("bolt", 14)}</span>
      <div><b>New here?</b><div class="t-sub">A 90-second guided tour of the five key ideas.</div>
        <div class="t-actions"><button class="btn btn-primary btn-sm" data-go>Take the tour</button>
        <button class="btn btn-ghost btn-sm" data-no>Not now</button></div></div>`;
    host.appendChild(node);
    const close = () => {
      node.classList.add("out");
      node.addEventListener("animationend", () => node.remove(), { once: true });
    };
    node.querySelector("[data-go]").addEventListener("click", () => { close(); start(); });
    node.querySelector("[data-no]").addEventListener("click", close);
    setTimeout(close, 14000);
  }

  /* ── keyboard shortcut sheet ────────────────────────────────────── */

  const KEYS = [
    ["Navigate", [["1 – 9", "Jump to a console module"], ["⌘K / Ctrl K", "Command palette"],
                  ["/", "Search the ledger"]]],
    ["Help",     [["?", "This sheet"], ["T", "Start the guided tour"], ["Esc", "Close any overlay"]]]
  ];

  function shortcuts() {
    const body = KEYS.map(([g, rows]) => `
      <div class="kb-group"><div class="kb-h">${g}</div>
        ${rows.map(([k, d]) => `<div class="kb-row"><span>${d}</span><kbd>${k}</kbd></div>`).join("")}
      </div>`).join("");
    window.VL.UI.dialog({ title: "Keyboard shortcuts", body, confirmLabel: "Done" }).catch(() => {});
  }

  function wire() {
    document.addEventListener("keydown", e => {
      if (state || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
      if (V.UI.Palette.isOpen() || $("#modal").classList.contains("on")) return;
      if (e.key === "?") { e.preventDefault(); shortcuts(); }
      else if ((e.key === "t" || e.key === "T") && location.hash.startsWith("#/app")) {
        e.preventDefault(); start();
      }
    });
  }

  V.Tour = { start, stop, offer, shortcuts, wire, steps: STEPS };
})();
