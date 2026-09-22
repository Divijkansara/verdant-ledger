/* ══════════════════════════════════════════════════════════════════════
   ui.js — interface primitives shared by every screen: the icon set,
   toasts, the modal, number roll-ups, the command palette and file
   downloads. Screens deal with data and layout; none of them deal with
   the mechanics of an overlay.
   ══════════════════════════════════════════════════════════════════════ */

window.VL = window.VL || {};

(() => {
  "use strict";
  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  /* ══════════════════════ icons ══════════════════════════════════════
     A 16px stroke set drawn inline — nothing is fetched, and every icon
     inherits currentColor so it follows the theme automatically.      */
  const ICONS = {
    gauge:     '<path d="M2.6 12.4a6.6 6.6 0 1 1 10.8 0"/><path d="m8 9.6 3.2-3.4"/><circle cx="8" cy="10.6" r="1.1"/>',
    sliders:   '<path d="M3 4.2h10M3 8h10M3 11.8h10"/><circle cx="6" cy="4.2" r="1.5"/><circle cx="10.4" cy="8" r="1.5"/><circle cx="5" cy="11.8" r="1.5"/>',
    plus:      '<path d="M8 3.4v9.2M3.4 8h9.2"/>',
    table:     '<rect x="2.6" y="3" width="10.8" height="10" rx="1.2"/><path d="M2.6 6.2h10.8M6.2 6.2v6.8"/>',
    pulse:     '<path d="M1.8 8h3L6.6 4l2.6 8 1.6-4h3.4"/>',
    target:    '<circle cx="8" cy="8" r="5.6"/><circle cx="8" cy="8" r="2.4"/><path d="M8 .9v2.2M8 12.9v2.2M.9 8h2.2M12.9 8h2.2"/>',
    users:     '<circle cx="6" cy="6" r="2.4"/><path d="M1.8 13.4a4.4 4.4 0 0 1 8.4 0"/><path d="M10.6 4.2a2.4 2.4 0 0 1 0 4.5M11.6 13.4a4.4 4.4 0 0 0-1.2-3"/>',
    report:    '<path d="M3.4 2.6h6l3.2 3.2v7.6H3.4z"/><path d="M9.2 2.6v3.4h3.4"/><path d="M5.8 9h4.4M5.8 11.2h3"/>',
    book:      '<path d="M2.8 3.2h5a1.8 1.8 0 0 1 1.8 1.8v8.2H4.6a1.8 1.8 0 0 0-1.8 1.8z"/><path d="M13.2 3.2h-3.6v10"/>',
    gear:      '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.6v1.8M8 12.6v1.8M14.4 8h-1.8M3.4 8H1.6M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3M12.5 12.5l-1.3-1.3M4.8 4.8 3.5 3.5"/>',
    shield:    '<path d="M8 1.8 13 3.8v4.1c0 3.2-2.1 5.6-5 6.3-2.9-.7-5-3.1-5-6.3V3.8z"/><path d="m5.8 8 1.6 1.6 3-3.2"/>',
    search:    '<circle cx="7.2" cy="7.2" r="4.2"/><path d="m10.4 10.4 3 3"/>',
    close:     '<path d="m4 4 8 8M12 4l-8 8"/>',
    menu:      '<path d="M2.6 4.6h10.8M2.6 8h10.8M2.6 11.4h10.8"/>',
    check:     '<path d="m3 8.4 3.4 3.4L13 5.2"/>',
    arrow:     '<path d="M3 8h10M9 4l4 4-4 4"/>',
    download:  '<path d="M8 2.4v7.6M5.2 7.4 8 10.2l2.8-2.8M2.8 12v1.6h10.4V12"/>',
    copy:      '<rect x="5.4" y="5.4" width="8" height="8" rx="1.2"/><path d="M10.6 5.4V3.8a1.2 1.2 0 0 0-1.2-1.2H3.8a1.2 1.2 0 0 0-1.2 1.2v5.6a1.2 1.2 0 0 0 1.2 1.2h1.6"/>',
    palette:   '<path d="M8 1.8a6.2 6.2 0 1 0 0 12.4c.9 0 1.4-.7 1.4-1.4 0-.9-.7-1.4-.7-2.1 0-.7.6-1.2 1.3-1.2h1.1A3.1 3.1 0 0 0 14.2 6C14.2 3.6 11.4 1.8 8 1.8z"/><circle cx="5.2" cy="6.4" r=".9"/><circle cx="8" cy="4.8" r=".9"/><circle cx="10.8" cy="6.2" r=".9"/>',
    reset:     '<path d="M13.2 8a5.2 5.2 0 1 1-1.6-3.8M13.2 2.6v3.4H9.8"/>',
    play:      '<path d="M5.2 3.4 12 8l-6.8 4.6z"/>',
    bolt:      '<path d="M8.8 1.8 4 9h3.4l-.6 5.2L12 7H8.4z"/>',
    sun:       '<circle cx="8" cy="8" r="3"/><path d="M8 1.4v1.8M8 12.8v1.8M14.6 8h-1.8M3.2 8H1.4M12.7 3.3l-1.3 1.3M4.6 11.4l-1.3 1.3M12.7 12.7l-1.3-1.3M4.6 4.6 3.3 3.3"/>',
    recycle:   '<path d="M5.6 2.8 8 6.4h-4.8l1.2-2.4a1.4 1.4 0 0 1 1.2-1.2z"/><path d="M13.2 9.6 11 13.2H8l2.4-3.6z"/><path d="M2.8 9.6 5 13.2h3l-2.4-3.6z"/>',
    drop:      '<path d="M8 1.8s4.2 4.6 4.2 7.4a4.2 4.2 0 1 1-8.4 0C3.8 6.4 8 1.8 8 1.8z"/>',
    page:      '<path d="M4 2.4h5l3 3v8.2H4z"/><path d="M9 2.4v3h3"/>',
    box:       '<path d="M2.8 5.2 8 2.6l5.2 2.6v5.6L8 13.4l-5.2-2.6z"/><path d="M2.8 5.2 8 7.8l5.2-2.6M8 7.8v5.6"/>',
    trash:     '<path d="M3.4 4.4h9.2M6.4 4.4V3a.8.8 0 0 1 .8-.8h1.6a.8.8 0 0 1 .8.8v1.4"/><path d="M4.6 4.4v8a1 1 0 0 0 1 1h4.8a1 1 0 0 0 1-1v-8"/>',
    route:     '<circle cx="4" cy="12" r="1.8"/><circle cx="12" cy="4" r="1.8"/><path d="M5.8 12h3.4a2.8 2.8 0 0 0 0-5.6H6.8a2.8 2.8 0 0 1 0-5.6"/>',
    leaf:      '<path d="M13 3C7.5 3 3 5.8 3 10.4c0 1 .3 1.9.8 2.6C5.5 9.6 8 7.4 11.6 6.4 8.8 8 6.4 10.4 5.4 13.6c.9.4 1.9.4 2.8.2C12 12.8 13.8 8 13 3z"/>',
    clock:     '<circle cx="8" cy="8" r="6"/><path d="M8 4.6V8l2.4 1.6"/>',
    warning:   '<path d="M8 2.2 14.4 13H1.6z"/><path d="M8 6.6v3M8 11.2v.6"/>',
    grid:      '<rect x="2.6" y="2.6" width="4.6" height="4.6" rx="1"/><rect x="8.8" y="2.6" width="4.6" height="4.6" rx="1"/><rect x="2.6" y="8.8" width="4.6" height="4.6" rx="1"/><rect x="8.8" y="8.8" width="4.6" height="4.6" rx="1"/>',
    logout:    '<path d="M6.4 13.4H3.6a1.2 1.2 0 0 1-1.2-1.2V3.8a1.2 1.2 0 0 1 1.2-1.2h2.8"/><path d="M10.4 11 13.6 8l-3.2-3M13.6 8H6"/>'
  };

  const icon = (name, size = 15) =>
    `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="none" stroke="currentColor"
      stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.grid}</svg>`;

  /* ══════════════════════ formatting ═════════════════════════════════ */
  const nf = (v, d = 0) =>
    Number(v).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });

  /** Kilograms → tonnes, with a sensible number of decimals for the size. */
  const tonnes = kg => {
    const t = kg / 1000;
    return nf(t, Math.abs(t) >= 100 ? 0 : Math.abs(t) >= 10 ? 1 : 2);
  };
  const signed = (v, d = 1) => `${v < 0 ? "−" : v > 0 ? "+" : ""}${nf(Math.abs(v), d)}`;
  const pct = (v, d = 1) => `${nf(v, d)}%`;

  const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g,
    m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));

  /** Count a figure up from zero — telemetry coming online. */
  function rollTo(node, target, decimals = 1, suffix = "") {
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.textContent = nf(target, decimals) + suffix; return;
    }
    const t0 = performance.now(), DUR = 700;
    (function step(now) {
      const p = Math.min(1, (now - t0) / DUR);
      node.textContent = nf(target * (1 - Math.pow(1 - p, 4)), decimals) + suffix;
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  /* ══════════════════════ toasts ═════════════════════════════════════ */
  function toast(title, sub, kind = "ok") {
    const host = $("#toasts");
    if (!host) return;
    const node = document.createElement("div");
    node.className = `toast toast-${kind}`;
    node.innerHTML = `<span class="t-ico">${icon(kind === "err" ? "warning" : kind === "info" ? "bolt" : "check", 14)}</span>
      <div><b>${escapeHtml(title)}</b>${sub ? `<div class="t-sub">${escapeHtml(sub)}</div>` : ""}</div>`;
    host.appendChild(node);
    setTimeout(() => {
      node.classList.add("out");
      node.addEventListener("animationend", () => node.remove(), { once: true });
    }, 3600);
  }

  /* ══════════════════════ modal ══════════════════════════════════════ */

  /**
   * A promise-based dialog. Focus is trapped while it is open and
   * returned to the trigger when it closes, Escape cancels, and the
   * confirm button stays disabled until any required input is valid.
   */
  function dialog({ title, body, confirmLabel = "Confirm", danger = false, input = null, validate = null }) {
    return new Promise(resolve => {
      const host = $("#modal");
      const opener = document.activeElement;

      host.innerHTML = `
        <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="mTitle">
          <h3 id="mTitle">${escapeHtml(title)}</h3>
          <div class="modal-body">${body || ""}</div>
          ${input ? `<div class="field mt-16">
              <label for="mInput">${escapeHtml(input.label)}</label>
              <input id="mInput" class="ctl" placeholder="${escapeHtml(input.placeholder || "")}" autocomplete="off">
            </div>` : ""}
          <div class="modal-actions">
            <button class="btn" data-act="cancel">Cancel</button>
            <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="ok"
              ${input ? "disabled" : ""}>${escapeHtml(confirmLabel)}</button>
          </div>
        </div>`;
      host.classList.add("on");

      const box = host.querySelector(".modal-box");
      const field = host.querySelector("#mInput");
      const ok = host.querySelector('[data-act="ok"]');
      const cancel = host.querySelector('[data-act="cancel"]');
      const focusables = () => Array.from(box.querySelectorAll("button,input,select,textarea,a[href]"))
        .filter(n => !n.disabled);

      setTimeout(() => (field || ok).focus(), 40);

      const close = value => {
        host.classList.remove("on");
        host.innerHTML = "";
        document.removeEventListener("keydown", onKey, true);
        if (opener && opener.focus) opener.focus();
        resolve(value);
      };

      // With an input, validate(value) gates the button as the user types; a
      // form in the body passes validate() alone, checked on submit.
      const valid = () => input
        ? (validate ? validate(field.value) : field.value.trim().length >= 3)
        : (validate ? validate() : true);

      function onKey(e) {
        if (e.key === "Escape") { e.preventDefault(); close(null); }
        if (e.key === "Enter" && valid() && document.activeElement !== cancel) {
          e.preventDefault(); close(input ? field.value.trim() : true);
        }
        if (e.key === "Tab") {                      // focus trap
          const list = focusables();
          const i = list.indexOf(document.activeElement);
          if (e.shiftKey && i <= 0) { e.preventDefault(); list[list.length - 1].focus(); }
          else if (!e.shiftKey && i === list.length - 1) { e.preventDefault(); list[0].focus(); }
        }
      }

      if (field) field.addEventListener("input", () => { ok.disabled = !valid(); });
      ok.addEventListener("click", () => { if (valid()) close(input ? field.value.trim() : true); });
      cancel.addEventListener("click", () => close(null));
      host.addEventListener("click", e => { if (e.target === host) close(null); });
      document.addEventListener("keydown", onKey, true);
    });
  }

  /* ══════════════════════ command palette ════════════════════════════ */
  const Palette = {
    commands: [], filtered: [], index: 0,

    register(list) { this.commands = list; },
    isOpen() { return $("#palette").classList.contains("on"); },

    open() {
      const host = $("#palette");
      host.classList.add("on");
      const input = host.querySelector("input");
      input.value = "";
      this.filter("");
      setTimeout(() => input.focus(), 30);
    },
    close() { $("#palette").classList.remove("on"); },

    filter(q) {
      const needle = q.trim().toLowerCase();
      this.filtered = !needle ? this.commands.slice()
        : this.commands.filter(c => `${c.title} ${c.group || ""} ${c.keywords || ""}`.toLowerCase().includes(needle));
      this.index = 0;
      this.render();
    },

    render() {
      const list = $("#palette .pal-list");
      if (!this.filtered.length) {
        list.innerHTML = `<div class="pal-empty">No matching command</div>`;
        return;
      }
      let lastGroup = null;
      list.innerHTML = this.filtered.map((c, i) => {
        const header = c.group && c.group !== lastGroup
          ? `<div class="pal-group">${escapeHtml(c.group)}</div>` : "";
        lastGroup = c.group;
        return header + `<button class="pal-item" role="option" data-i="${i}" aria-selected="${i === this.index}">
            ${icon(c.icon || "bolt", 14)}<span>${escapeHtml(c.title)}</span>
            ${c.hint ? `<span class="pi-hint">${escapeHtml(c.hint)}</span>` : ""}</button>`;
      }).join("");

      list.querySelectorAll(".pal-item").forEach(btn => {
        btn.addEventListener("mouseenter", () => { this.index = +btn.dataset.i; this.paint(); });
        btn.addEventListener("click", () => this.run());
      });
      this.scrollTo();
    },

    paint() {
      $$("#palette .pal-item").forEach((b, i) => b.setAttribute("aria-selected", String(i === this.index)));
    },
    scrollTo() {
      const active = $('#palette .pal-item[aria-selected="true"]');
      if (active) active.scrollIntoView({ block: "nearest" });
    },
    move(d) {
      if (!this.filtered.length) return;
      this.index = (this.index + d + this.filtered.length) % this.filtered.length;
      this.paint(); this.scrollTo();
    },
    run() {
      const cmd = this.filtered[this.index];
      if (!cmd) return;
      this.close();
      setTimeout(() => cmd.run(), 50);
    },

    wire() {
      const host = $("#palette");
      const input = host.querySelector("input");
      input.addEventListener("input", () => this.filter(input.value));
      host.addEventListener("click", e => { if (e.target === host) this.close(); });

      document.addEventListener("keydown", e => {
        const mod = e.metaKey || e.ctrlKey;
        if (mod && e.key.toLowerCase() === "k") {
          e.preventDefault(); this.isOpen() ? this.close() : this.open(); return;
        }
        if (!this.isOpen()) return;
        if (e.key === "Escape")    { e.preventDefault(); this.close(); }
        if (e.key === "ArrowDown") { e.preventDefault(); this.move(1); }
        if (e.key === "ArrowUp")   { e.preventDefault(); this.move(-1); }
        if (e.key === "Enter")     { e.preventDefault(); this.run(); }
      });
    }
  };

  /* ══════════════════════ misc ═══════════════════════════════════════ */

  function download(filename, text, mime = "text/csv;charset=utf-8") {
    const blob = new Blob(["﻿" + text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
    } catch (_) { /* fall through to the legacy path */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (_) { return false; }
  }

  /** Keep a range input's filled track in sync with its value. */
  function paintRange(input) {
    const min = +input.min || 0, max = +input.max || 100;
    const pctVal = ((+input.value - min) / (max - min)) * 100;
    input.style.setProperty("--fill", pctVal + "%");
  }

  window.VL.UI = {
    $, $$, icon, ICONS, nf, tonnes, signed, pct, escapeHtml,
    rollTo, toast, dialog, Palette, download, copyText, paintRange
  };
})();
