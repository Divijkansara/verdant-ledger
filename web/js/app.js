/* ══════════════════════════════════════════════════════════════════════
   app.js — the router, the console shell and boot.

   Routing is hash-based on purpose: the whole site is one file with no
   server, and hash routes survive a double-click open from the file
   system where History API routes would not.
   ══════════════════════════════════════════════════════════════════════ */

window.VL = window.VL || {};

(() => {
  "use strict";
  const V = window.VL;
  const { icon, nf, toast } = V.UI;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  /* ═══════════════════ route table ═══════════════════════════════════ */

  const PUBLIC = {
    "/":             () => V.SiteViews.home,
    "/methodology":  () => V.SiteViews.methodology,
    "/docs":         () => V.SiteViews.docs,
    "/signin":       () => V.SiteViews.signin,
    "/signup":       () => V.SiteViews.signup
  };

  const MODULES = [
    { id:"overview",    path:"/app/overview",    icon:"gauge",   key:"1", group:"Track" },
    { id:"post",        path:"/app/post",        icon:"plus",    key:"2", group:"Track" },
    { id:"ledger",      path:"/app/ledger",      icon:"table",   key:"3", group:"Track" },
    { id:"simulate",    path:"/app/simulate",    icon:"sliders", key:"4", group:"Plan" },
    { id:"insights",    path:"/app/insights",    icon:"pulse",   key:"5", group:"Plan" },
    { id:"targets",     path:"/app/targets",     icon:"target",  key:"6", group:"Plan" },
    { id:"departments", path:"/app/departments", icon:"users",   key:"7", group:"Plan" },
    { id:"integrity",   path:"/app/integrity",   icon:"shield",  key:"8", group:"Verify" },
    { id:"reports",     path:"/app/reports",     icon:"report",  key:"9", group:"Verify" },
    { id:"methodology", path:"/app/methodology", icon:"book",    key:"",  group:"Verify" },
    { id:"settings",    path:"/app/settings",    icon:"gear",    key:"",  group:"Verify" }
  ];

  const App = {
    current: null,
    shellMounted: false,

    /* ═══════════════════ routing ═════════════════════════════════════ */

    route() {
      const raw = (location.hash || "#/").slice(1) || "/";
      const path = raw.split("?")[0];

      if (path.startsWith("/app")) return this.renderApp(path);
      this.shellMounted = false;

      const factory = PUBLIC[path];
      const view = factory ? factory() : null;
      const root = $("#root");

      if (!view) {
        root.innerHTML = V.SiteViews.notFound(path);
        window.scrollTo(0, 0);
        this.wireSite();
        return;
      }

      root.innerHTML = view();
      window.scrollTo(0, 0);
      this.wireSite();
      if (view.mount) view.mount();
      if (V.FX.home && path === "/") V.FX.home();
      this.current = path;
    },

    wireSite() {
      const nav = $("#siteNav");
      if (!nav) return;
      const onScroll = () => {
        nav.classList.toggle("scrolled", window.scrollY > 8);
        // "", "#" and "#/" are all the landing page — checking only "#/"
        // left the bar showing whenever the site was opened at its bare URL.
        const home = ["", "#", "#/"].includes(location.hash);
        // the bar stays away until most of the full-screen hero has scrolled off
        nav.classList.toggle("at-top", home && window.scrollY < window.innerHeight * 0.6);
      };
      onScroll();
      window.removeEventListener("scroll", this._scroll);
      this._scroll = onScroll;
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("hashchange", onScroll);

      $$("[data-tour-start]").forEach(a => a.addEventListener("click", () => {
        setTimeout(() => V.Tour.start(), 700);
      }));

      const burger = $("#navBurger");
      if (burger) burger.addEventListener("click", () => nav.classList.toggle("open"));
      $$(".nav-links a").forEach(a => a.addEventListener("click", () => nav.classList.remove("open")));
    },

    /* ═══════════════════ console ═════════════════════════════════════ */

    renderApp(path) {
      const entry = MODULES.find(m => m.path === path) || MODULES[0];
      const view = V.AppViews[entry.id];

      if (!this.shellMounted) {
        $("#root").innerHTML = this.shell();
        this.wireShell();
        this.shellMounted = true;
      }

      $$(".nav-item").forEach(n => n.classList.toggle("on", n.dataset.path === entry.path));
      $("#moduleTitle").textContent = view.title;
      $("#moduleCrumb").textContent = entry.crumb || view.crumb || "";

      const canvas = $("#canvas");
      canvas.innerHTML = view.render();
      canvas.scrollTop = 0;
      view.mount();

      V.FX.stagger();
      this.refreshShell();
      this.current = path;
      if (!this.offered) { this.offered = true; setTimeout(() => V.Tour.offer(), 1600); }
    },

    shell() {
      const groups = [];
      MODULES.forEach(m => {
        let g = groups.find(x => x.name === m.group);
        if (!g) groups.push((g = { name: m.group, items: [] }));
        g.items.push(m);
      });

      return `
        <div class="app">
          <aside class="rail" id="rail">
            <a class="rail-top" href="#/">${V.SiteViews.GLYPH}<b>Terra<span>wise</span></b></a>
            <nav class="rail-nav" aria-label="Modules">
              ${groups.map(g => `
                <div class="rail-group">${g.name}</div>
                ${g.items.map(m => {
                  const view = V.AppViews[m.id];
                  return `<button class="nav-item" data-path="${m.path}">
                      ${icon(m.icon)}<span>${view.title}</span>
                      ${m.key ? `<kbd>${m.key}</kbd>` : ""}
                    </button>`;
                }).join("")}`).join("")}
            </nav>
            <div class="rail-foot">
              <div class="rail-score">
                <span class="rs-grade" id="railGrade">—</span>
                <span class="rs-meta"><i>Your score</i><b id="railScore">—</b></span>
              </div>
              <div class="rail-user">
                <span class="avatar" id="userAvatar">DR</span>
                <span class="ru-meta"><b id="userName">—</b><span id="userRole">—</span></span>
                <button class="icon-btn" id="signOut" title="Sign out" aria-label="Sign out">${icon("logout",13)}</button>
              </div>
            </div>
          </aside>

          <div class="main">
            <header class="topbar">
              <button class="menu-btn" id="menuBtn" aria-label="Toggle navigation">${icon("menu",15)}</button>
              <h1 id="moduleTitle">—</h1>
              <span class="crumb" id="moduleCrumb"></span>
              <div class="seg" id="periodSeg" role="group" aria-label="Reporting period" style="margin-left:14px">
                <button data-months="1">1M</button><button data-months="3">3M</button>
                <button data-months="6">6M</button><button data-months="12">12M</button>
              </div>
              <div class="topbar-right">
                <button class="tour-btn" id="tourBtn" title="Guided tour (T)">${icon("play",12)}<span>Tour</span></button>
                <button class="kbd-hint" id="paletteBtn">${icon("search",12)}<kbd>⌘K</kbd></button>
                <span class="link-state demo" id="linkState"><i class="led"></i><span>DEMO · LOCAL ENGINE</span></span>
              </div>
            </header>
            <main class="canvas" id="canvas"></main>
          </div>
        </div>`;
    },

    wireShell() {
      $$(".nav-item").forEach(btn =>
        btn.addEventListener("click", () => { location.hash = "#" + btn.dataset.path; }));

      $$("#periodSeg button").forEach(btn => btn.addEventListener("click", () => {
        V.Store.period = +btn.dataset.months;
        $$("#periodSeg button").forEach(b =>
          b.setAttribute("aria-pressed", String(b === btn)));
        App.renderApp(App.current);
      }));

      $("#menuBtn").addEventListener("click", () => $("#rail").classList.toggle("open"));
      $("#paletteBtn").addEventListener("click", () => V.UI.Palette.open());
      $("#tourBtn").addEventListener("click", () => V.Tour.start());
      $("#signOut").addEventListener("click", () => { V.Store.signOut(); location.hash = "#/"; });

      $("#canvas").addEventListener("click", e => {
        const a = e.target.closest("a[href^='#']");
        if (a) $("#rail").classList.remove("open");
      });
    },

    /** Re-read state that lives in the shell: score, user, link status. */
    refreshShell() {
      if (!this.shellMounted) return;
      const { score } = V.Store.summary();
      const grade = $("#railGrade");
      if (grade) {
        grade.textContent = score.grade;
        grade.style.color = V.bandVar(score.composite);
        $("#railScore").textContent = `${nf(score.composite, 0)} / 100`;
      }

      const u = V.Store.user;
      const initials = (u.name || "U").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
      if ($("#userAvatar")) {
        $("#userAvatar").textContent = initials;
        $("#userName").textContent = u.name;
        $("#userRole").textContent = (u.role || "viewer").toUpperCase();
      }

      const link = $("#linkState");
      if (link) {
        link.className = "link-state " + V.Store.mode;
        link.querySelector("span").textContent =
          V.Store.mode === "live" ? "LIVE · API 8000" : "DEMO · LOCAL ENGINE";
      }

      $$("#periodSeg button").forEach(b =>
        b.setAttribute("aria-pressed", String(+b.dataset.months === V.Store.period)));
    },

    /** Charts read colours through CSS variables, so a theme change only
        needs a re-render where a chart caches a computed value. */
    repaintCharts() {
      if (this.current && this.current.startsWith("/app") && this.current !== "/app/settings") {
        this.renderApp(this.current);
      }
    },

    /* ═══════════════════ command palette ═════════════════════════════ */

    registerCommands() {
      const cmds = [];

      MODULES.forEach(m => cmds.push({
        group: "Navigate", title: V.AppViews[m.id].title, icon: m.icon, hint: m.key,
        keywords: m.group + " " + m.id,
        run: () => (location.hash = "#" + m.path)
      }));

      [["Product home", "/"], ["Methodology", "/methodology"], ["Developer docs", "/docs"]]
        .forEach(([title, path]) => cmds.push({
          group: "Website", title, icon: "book", keywords: "public site",
          run: () => (location.hash = "#" + path)
        }));

      [1, 3, 6, 12].forEach(m => cmds.push({
        group: "Period", title: m === 1 ? "Current month" : `Last ${m} months`,
        icon: "clock", keywords: "period range",
        run: () => {
          V.Store.period = m;
          App.renderApp(App.current && App.current.startsWith("/app") ? App.current : "/app/overview");
          toast("Reporting period updated", m === 1 ? "Current month to date" : `Last ${m} months`, "info");
        }
      }));

      V.Theme.PRESETS.forEach(p => cmds.push({
        group: "Theme", title: `Theme — ${p.name}`, icon: "palette", keywords: "colour " + p.note,
        run: () => {
          V.Theme.usePreset(p.id);
          App.repaintCharts();
          toast("Theme applied", p.name, "info");
        }
      }));
      cmds.push({
        group: "Theme", title: "Random palette", icon: "bolt", keywords: "colour shuffle",
        run: () => {
          V.Theme.set({
            accentHue: Math.floor(Math.random() * 360),
            baseHue: Math.floor(Math.random() * 360),
            mode: Math.random() > 0.35 ? "dark" : "light"
          });
          App.repaintCharts();
          const r = V.Theme.report;
          toast("Random palette generated",
            `${r.allPass ? "all contrast gates pass" : "check the audit"} · accent ${Math.round(V.Theme.seed.accentHue)}°`,
            r.allPass ? "ok" : "err");
        }
      });

      cmds.push(
        { group: "Actions", title: "Run the data check", icon: "shield", keywords: "hash chain tamper",
          run: () => (location.hash = "#/app/integrity") },
        { group: "Actions", title: "Export activity log (CSV)", icon: "download", keywords: "download report",
          run: () => { V.UI.download(`terrawise-activity-${V.todayISO()}.csv`, V.Store.csv());
            toast("Activity log exported", "Saved as a CSV file"); } },
        { group: "Actions", title: "Export disclosure JSON", icon: "download", keywords: "report auditor",
          run: () => { V.UI.download(`terrawise-report-${V.todayISO()}.json`,
            JSON.stringify(V.Store.disclosure(12), null, 2), "application/json");
            toast("Disclosure exported", "GHG Protocol shaped"); } },
        { group: "Help", title: "Take the guided tour", icon: "play", keywords: "walkthrough onboarding demo help",
          run: () => setTimeout(() => V.Tour.start(), 60) },
        { group: "Help", title: "Keyboard shortcuts", icon: "grid", keywords: "keys help hotkeys",
          run: () => setTimeout(() => V.Tour.shortcuts(), 60) },
        { group: "Actions", title: "Sign out", icon: "logout", keywords: "logout leave",
          run: () => { V.Store.signOut(); location.hash = "#/"; } }
      );

      V.Simulate.PLAYBOOKS.forEach(p => cmds.push({
        group: "Simulator", title: `Playbook — ${p.name}`, icon: "sliders", keywords: p.note,
        run: () => {
          V.AppViews.simulate.positions = { ...p.positions };
          location.hash = "#/app/simulate";
        }
      }));

      V.UI.Palette.register(cmds);
    },

    /* ═══════════════════ keyboard ════════════════════════════════════ */

    wireKeys() {
      document.addEventListener("keydown", e => {
        if (V.UI.Palette.isOpen() || $("#modal").classList.contains("on")) return;
        if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (!location.hash.startsWith("#/app")) return;

        const m = MODULES.find(x => x.key === e.key);
        if (m) { e.preventDefault(); location.hash = "#" + m.path; return; }
        if (e.key === "/") {
          e.preventDefault();
          location.hash = "#/app/ledger";
          setTimeout(() => { const s = $("#fSearch"); if (s) s.focus(); }, 120);
        }
      });
    },

    /* ═══════════════════ boot ════════════════════════════════════════ */

    async start() {
      V.Theme.load();
      await V.Store.boot();

      this.registerCommands();
      V.UI.Palette.wire();
      this.wireKeys();
      V.Tour.wire();
      V.FX.init();

      window.addEventListener("hashchange", () => this.route());
      this.route();

      // Re-render charts once the webfonts land, so SVG text metrics settle.
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
          if (this.current && this.current.startsWith("/app")) this.renderApp(this.current);
        });
      }
    }
  };

  V.App = App;

  document.addEventListener("DOMContentLoaded", () => {
    App.start().catch(err => {
      console.error(err);
      document.getElementById("root").innerHTML = `
        <div class="shell" style="padding-block:110px;text-align:center">
          <h1>Something went wrong starting the application</h1>
          <p class="lede" style="margin:14px auto 0">${V.UI.escapeHtml(err.message)}</p>
          <div style="margin-top:22px"><button class="btn btn-primary"
            onclick="location.reload()">Reload</button></div>
        </div>`;
    });
  });
})();
