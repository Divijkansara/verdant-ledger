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
  const icon = (n, s) => V.UI.icon(n, s);

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
            ${d.role && d.role !== "owner"
              ? `<span class="dc-tag dc-shared">${icon("users", 11)} Shared by ${esc(d.owner || "a colleague")} · ${esc(d.role)}</span>`
              : d.sharedWith ? `<span class="dc-tag">${icon("users", 11)} Shared with ${d.sharedWith}</span>` : ""}
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
            ${(!d.role || d.role === "owner") && S().isLive()
              ? `<button class="dc-act" data-share="${d.id}">Share</button>` : ""}
            ${S().dashboards.length > 1
              ? `<button class="dc-del" data-del="${d.id}" aria-label="${d.role && d.role !== "owner" ? "Leave" : "Delete"} ${esc(d.name)}">${d.role && d.role !== "owner" ? "Leave" : "Delete"}</button>` : ""}
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
            <p class="dash-sync" id="dashSync"></p>
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
      $$("[data-share]").forEach(b => b.addEventListener("click", e => {
        e.stopPropagation();
        Dashboards.share(b.dataset.share);
      }));

      const sync = $("#dashSync");
      if (sync) {
        sync.textContent = S().isLive()
          ? "Saved to your account — the same dashboards open on any device you sign in on."
          : "Saved on this device. Sign in while the service is running to use them elsewhere.";
      }

      $("#newDash").addEventListener("click", () => Dashboards.create());
      $("#dashSignOut").addEventListener("click", () => { S().signOut(); location.hash = "#/"; });
    },

    /** Share with a colleague, and see who already has it. */
    async share(id) {
      const dash = S().dashboards.find(x => x.id === id);
      let members = { members: [] };
      try { members = await S().dashboardMembers(id); } catch (_) {}

      const rows = members.members.length
        ? members.members.map(m => `
            <div class="sh-row" data-uid="${m.user_id}">
              <div><b>${esc(m.name)}</b><span>${esc(m.email)}</span></div>
              <span class="sh-role">${esc(m.role)}</span>
              <button class="dc-act sh-remove" data-remove="${m.user_id}">Remove</button>
            </div>`).join("")
        : `<p class="sh-empty">Not shared with anyone yet.</p>`;

      const body = `
        <div class="nd-form">
          <p class="sh-note">Colleagues need a Terrawise account with the email you enter.
             A <b>viewer</b> can read the numbers and the reports; an <b>editor</b> can also
             add activity and change settings. Only you can delete it.</p>
          <div class="form-row c2">
            <div class="field"><label for="shEmail">Their email</label>
              <input id="shEmail" class="ctl" type="email" placeholder="colleague@company.com"></div>
            <div class="field"><label for="shRole">They can</label>
              <select id="shRole" class="ctl">
                <option value="viewer">View</option>
                <option value="editor">View and edit</option>
              </select></div>
          </div>
          <div class="auth-err" id="shErr" role="alert"></div>
          <div class="sh-list">${rows}</div>
        </div>`;

      setTimeout(() => {
        const first = $("#shEmail");
        if (first) first.focus();
        $$(".sh-remove").forEach(b => b.addEventListener("click", async e => {
          e.preventDefault();
          await S().unshareDashboard(id, +b.dataset.remove).catch(() => {});
          const row = b.closest(".sh-row");
          if (row) row.remove();
        }));
      }, 60);

      const ok = await V.UI.dialog({
        title: `Share “${esc(dash ? dash.name : "dashboard")}”`,
        body, confirmLabel: "Share",
        validate: () => {
          const email = $("#shEmail").value.trim();
          if (!email) { $("#shErr").textContent = "Enter the email they signed up with"; return false; }
          Dashboards._share = { email, role: $("#shRole").value };
          return true;
        }
      });
      if (!ok || !Dashboards._share) return;

      const { email, role } = Dashboards._share;
      Dashboards._share = null;
      try {
        const r = await S().shareDashboard(id, email, role);
        V.UI.toast("Dashboard shared", `${r.name || email} can now ${role === "editor" ? "edit" : "view"} it`, "ok");
        await S().syncDashboards();
        V.App.route();
      } catch (err) {
        V.UI.toast("Could not share", String(err.message || err).slice(0, 90), "err");
      }
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
