/* ══════════════════════════════════════════════════════════════════════
   dashboards.js — "Your dashboards": the page a signed-in user lands on.

   One card per dashboard (an organisation or site with its own activity
   log) showing the grade, the footprint and a year of trend at a glance,
   plus a card to create a new one. The console's sidebar has a switcher
   that leads back here.
   ══════════════════════════════════════════════════════════════════════ */

(() => {
  "use strict";
  const V = window.VL;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const S = () => V.Store;

  /** A tiny inline trend line, from twelve monthly totals. */
  function spark(values) {
    const w = 120, h = 34, max = Math.max(...values, 1), min = Math.min(...values, 0);
    const pts = values.map((v, i) =>
      `${(i / (values.length - 1)) * w},${h - 3 - ((v - min) / (max - min || 1)) * (h - 6)}`).join(" ");
    return `<svg class="dc-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="1.6"
        stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
  }

  function card(d, i) {
    const p = S().peek(d.id);
    const empty = p.count === 0;
    const on = d.id === S().dashId;
    return `
      <article class="dcard${on ? " on" : ""}" style="--i:${i}" data-id="${d.id}" tabindex="0"
        aria-label="Open ${esc(d.name)}">
        <div class="dc-top">
          <div>
            <h3>${esc(d.name || "Untitled")}</h3>
            <span class="dc-sub">${esc(d.sector || "No sector set")}${on ? " · last opened" : ""}</span>
            ${d.sample ? `<span class="dc-tag">Sample data</span>` : ""}
          </div>
          ${empty ? `<span class="dc-grade faint">—</span>`
                  : `<span class="dc-grade" style="color:${V.bandVar(p.score.composite)}">${p.score.grade}</span>`}
        </div>
        ${empty
          ? `<div class="dc-empty">No activity yet. Open it and add your first entry.</div>`
          : `<div class="dc-fig"><b>${(p.net / 1000).toFixed(1)}</b><span>tonnes CO₂ · last 6 months</span></div>
             ${spark(p.trend)}`}
        <div class="dc-foot">
          <span>${p.count} ${p.count === 1 ? "entry" : "entries"}</span>
          <span class="dc-actions">
            ${S().dashboards.length > 1
              ? `<button class="dc-del" data-del="${d.id}" aria-label="Delete ${esc(d.name)}">Delete</button>` : ""}
            <span class="dc-open">Open →</span>
          </span>
        </div>
      </article>`;
  }

  const Dashboards = {
    render() {
      const u = S().user;
      return `
        <div class="dash-page">
          <header class="dash-hd shell">
            <a class="brand" href="#/">${V.SiteViews.GLYPH}<b>Terra<span>wise</span></b></a>
            <div class="dash-user">
              <span>${esc(u.name)}</span>
              <button class="btn btn-ghost btn-sm" id="dashSignOut">Sign out</button>
            </div>
          </header>
          <main class="shell dash-main">
            <div class="eyebrow">[ Your dashboards ]</div>
            <h1>Hello, ${esc((u.name || "there").split(" ")[0])}.</h1>
            <p class="lede">Each dashboard tracks one organisation or site. Pick one to open it,
              or start a new one.</p>
            <div class="dash-grid" id="dashGrid">
              ${S().dashboards.map(card).join("")}
              <button class="dcard dcard-new" id="newDash" style="--i:${S().dashboards.length}">
                <span class="dn-plus">+</span>
                <b>New dashboard</b>
                <span>For another organisation, office or site</span>
              </button>
            </div>
          </main>
        </div>`;
    },

    mount() {
      const open = id => { S().switchDashboard(id); location.hash = "#/app/overview"; };
      $$(".dcard[data-id]").forEach(c => {
        c.addEventListener("click", e => { if (!e.target.closest("[data-del]")) open(c.dataset.id); });
        c.addEventListener("keydown", e => { if (e.key === "Enter") open(c.dataset.id); });
      });
      $$("[data-del]").forEach(b => b.addEventListener("click", async e => {
        e.stopPropagation();
        const d = S().dashboards.find(x => x.id === b.dataset.del);
        const ok = await V.UI.dialog({ title: `Delete “${esc(d.name)}”?`,
          body: "<p>Its activity log is removed from this device. This cannot be undone.</p>",
          confirmLabel: "Delete dashboard", danger: true });
        if (!ok) return;
        S().deleteDashboard(d.id);
        V.UI.toast("Dashboard deleted", d.name, "info");
        V.App.route();
      }));
      $("#newDash").addEventListener("click", () => Dashboards.create());
      $("#dashSignOut").addEventListener("click", () => { S().signOut(); location.hash = "#/"; });
    },

    /** The new-dashboard form, in a dialog. */
    async create() {
      const body = `
        <div class="nd-form">
          <div class="field"><label for="ndName">Name</label>
            <input id="ndName" class="ctl" placeholder="e.g. Pune office" maxlength="60"></div>
          <div class="form-row c2">
            <div class="field"><label for="ndSector">Sector</label>
              <input id="ndSector" class="ctl" placeholder="e.g. Manufacturing" maxlength="60"></div>
            <div class="field"><label for="ndHead">People</label>
              <input id="ndHead" class="ctl ctl-mono" type="number" min="1" value="50"></div>
          </div>
          <div class="field"><span class="nd-label">Start with</span>
            <div class="nd-choice">
              <label><input type="radio" name="ndStart" value="empty" checked>
                <span><b>An empty dashboard</b><em>Add your own activity</em></span></label>
              <label><input type="radio" name="ndStart" value="sample">
                <span><b>Sample data</b><em>A year of example activity to explore</em></span></label>
            </div>
          </div>
          <div class="auth-err" id="ndErr" role="alert"></div>
        </div>`;
      setTimeout(() => $("#ndName") && $("#ndName").focus(), 60);
      const ok = await V.UI.dialog({ title: "New dashboard", body, confirmLabel: "Create dashboard",
        validate: () => {
          const name = $("#ndName").value.trim();
          if (!name) { $("#ndErr").textContent = "Give the dashboard a name"; return false; }
          if (S().dashboards.some(d => d.name.toLowerCase() === name.toLowerCase())) {
            $("#ndErr").textContent = "You already have a dashboard with that name"; return false;
          }
          Dashboards._draft = {
            name, sector: $("#ndSector").value.trim(), headcount: +$("#ndHead").value || 1,
            sample: document.querySelector("input[name=ndStart]:checked").value === "sample"
          };
          return true;
        } });
      if (!ok || !Dashboards._draft) return;
      const d = S().createDashboard(Dashboards._draft);
      Dashboards._draft = null;
      V.UI.toast("Dashboard created", d.name, "ok");
      location.hash = "#/app/overview";
    }
  };

  V.Dashboards = Dashboards;
})();
