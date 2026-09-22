/* ══════════════════════════════════════════════════════════════════════
   store.js — application state, persistence and the API bridge.

   One interface, two backends:
     LIVE — the FastAPI service over REST with a JWT
     DEMO — the identical engine running in the browser

   Every screen reads Store.* and never calls fetch() itself, so no view
   has to know which mode it is in. The demo ledger is sealed with the
   hash chain on load, so the integrity feature is real in both modes.
   ══════════════════════════════════════════════════════════════════════ */

window.VL = window.VL || {};

(() => {
  "use strict";
  const V = window.VL;

  // Set window.VERDANT_API before this script to point at a deployed API.
  const API_BASE = window.VERDANT_API || "http://127.0.0.1:8000";
  const LS = { ledger: "vl.ledger.v3", session: "vl.session.v1", token: "vl.token.v1",
               accounts: "vl.accounts.v1", dashes: "vl.dashes.v1:" };
  const DEMO = { email: "admin@suryanagar.example", password: "password123", name: "Divij Rao" };
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? d; } catch (_) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
  const blankOrg = () => ({ name: "", legal: "", sector: "", country: "India", headcount: 50,
                            site: "", baselineYear: 2025, targetYear: 2030, reductionPct: 42 });

  const Store = {
    mode: "demo",
    token: null,
    signedIn: false,

    org: {
      name: "Suryanagar Technologies",
      legal: "Suryanagar Technologies Pvt Ltd",
      sector: "Information technology services",
      country: "India",
      headcount: 120,
      site: "Chennai · Taramani campus",
      baselineYear: 2025,
      targetYear: 2030,
      reductionPct: 42
    },
    user: { name: "Divij Rao", email: "admin@suryanagar.example", role: "admin" },

    entries: [],
    head: null,             // chain head hash — fingerprints the whole ledger
    period: 6,

    /* ══════════════════ lifecycle ═════════════════════════════════════ */

    dashboards: [],         // this user's dashboards: [{id, name, sector, created, sample}]
    dashId: null,           // the one open in the console

    async boot() {
      this.restoreSession();
      if (this.signedIn) this.loadDashboards();
      else this.entries = [];
      this.reseal();
      // Probe the API without blocking first paint — the app is already
      // usable by the time this resolves.
      this.probe().then(reachable => {
        if (reachable && this.token) this.mode = "live";
      });
      return this;
    },

    async probe() {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 1200);
        const res = await fetch(`${API_BASE}/api/health`, { signal: ctrl.signal });
        clearTimeout(timer);
        return res.ok;
      } catch (_) { return false; }
    },

    /* ══════════════════ dashboards ════════════════════════════════════
       Each dashboard is a separate organisation (or site) with its own
       ledger, stored under its own key. The list belongs to the signed-in
       user. */

    ledgerKey(id) { return `${LS.ledger}:${id}`; },
    dashKey() { return LS.dashes + (this.user.email || "").toLowerCase(); },

    loadDashboards() {
      const saved = read(this.dashKey(), null);
      if (saved && Array.isArray(saved.list) && saved.list.length) {
        this.dashboards = saved.list;
        this.dashId = saved.list.some(d => d.id === saved.active) ? saved.active : saved.list[0].id;
      } else {
        // First visit: one dashboard with sample data. The demo account gets
        // the ledger an earlier version of the app saved, if there is one.
        const legacy = read(LS.ledger, null);
        this.dashboards = [];
        const d = this.createDashboard({ name: this.org.name || "My organisation", sector: this.org.sector,
                                         headcount: this.org.headcount, sample: true }, true);
        if (legacy && Array.isArray(legacy.entries) && legacy.entries.length &&
            this.user.email === DEMO.email) {
          write(this.ledgerKey(d.id), legacy);
        }
      }
      this.loadLedger();
    },

    saveDashboards() {
      write(this.dashKey(), { active: this.dashId, list: this.dashboards });
    },

    get dashboard() { return this.dashboards.find(d => d.id === this.dashId) || null; },

    createDashboard({ name, sector = "", headcount = 50, sample = false }, silent = false) {
      const id = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const org = { ...blankOrg(), name, legal: name, sector, headcount: Math.max(1, +headcount || 1) };
      const seed = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 20260920);
      const entries = sample ? V.generateLedger(new Date(), seed) : [];
      write(this.ledgerKey(id), { org, entries });
      this.dashboards.push({ id, name, sector, created: V.todayISO(), sample });
      this.dashId = id;
      this.saveDashboards();
      if (!silent) this.loadLedger();
      return this.dashboard;
    },

    switchDashboard(id) {
      if (!this.dashboards.some(d => d.id === id)) return;
      this.dashId = id;
      this.saveDashboards();
      this.loadLedger();
      this.reseal();
    },

    deleteDashboard(id) {
      if (this.dashboards.length <= 1) return false;     // always keep one
      this.dashboards = this.dashboards.filter(d => d.id !== id);
      try { localStorage.removeItem(this.ledgerKey(id)); } catch (_) {}
      if (this.dashId === id) this.dashId = this.dashboards[0].id;
      this.saveDashboards();
      this.loadLedger();
      this.reseal();
      return true;
    },

    /** Headline numbers for a dashboard without opening it (for the picker). */
    peek(id) {
      const saved = read(this.ledgerKey(id), { org: blankOrg(), entries: [] });
      const months = V.periodMonths(6);
      const org = { ...blankOrg(), ...saved.org };
      const agg = V.aggregate(saved.entries || [], months);
      const score = V.computeScore(agg, Math.max(1, org.headcount), months.length);
      const trend = V.periodMonths(12).map(m => V.aggregate(saved.entries || [], [m]).net);
      return { org, count: (saved.entries || []).length, net: agg.net, score, trend };
    },

    loadLedger() {
      const saved = read(this.ledgerKey(this.dashId), null);
      this.org = { ...blankOrg(), ...(saved && saved.org) };
      this.entries = saved && Array.isArray(saved.entries) ? saved.entries : [];
      this.reseal();
    },

    persist() {
      if (!this.dashId) return;
      write(this.ledgerKey(this.dashId), { org: this.org, entries: this.entries });
      const d = this.dashboard;
      if (d && (d.name !== this.org.name || d.sector !== this.org.sector)) {
        d.name = this.org.name; d.sector = this.org.sector; this.saveDashboards();
      }
    },

    /** Recompute the hash chain and store the new head. */
    reseal() {
      this.head = V.Chain.seal(this.entries);
      return this.head;
    },

    verifyChain() {
      return V.Chain.verify(this.entries, this.head);
    },

    /* ══════════════════ session ═══════════════════════════════════════ */

    restoreSession() {
      try {
        const s = JSON.parse(localStorage.getItem(LS.session) || "null");
        if (s && s.signedIn) { this.signedIn = true; if (s.user) this.user = s.user; }
        this.token = localStorage.getItem(LS.token) || null;
      } catch (_) {}
    },

    /* Local accounts, used when the API is not reachable. Passwords are
       stored only as a salted SHA-256 digest, never as typed. */
    hashPassword(email, password) {
      return V.Chain.sha256(`terrawise\u0000${email.toLowerCase()}\u0000${password}`);
    },

    accounts() {
      const list = read(LS.accounts, {});
      if (!list[DEMO.email]) {
        list[DEMO.email] = { name: DEMO.name, hash: this.hashPassword(DEMO.email, DEMO.password) };
        write(LS.accounts, list);
      }
      return list;
    },

    async signUp({ name, email, password, org }) {
      email = (email || "").trim().toLowerCase();
      if (!name || !email || !password) return { error: "Fill in every field" };
      if (password.length < 8) return { error: "Use a password of at least 8 characters" };

      if (await this.probe()) {
        try {
          const res = await fetch(`${API_BASE}/api/auth/register`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ org_name: org || name, headcount: 50, sector: "", name, email, password })
          });
          const body = await res.json().catch(() => ({}));
          if (res.ok) {
            this.token = body.access_token; this.mode = "live";
            try { localStorage.setItem(LS.token, this.token); } catch (_) {}
            this.user = { name, email, role: "admin" };
            this.org = { ...blankOrg(), name: org || name };
            this.finishSignIn();
            return { mode: "live" };
          }
          const msg = Array.isArray(body.detail) ? body.detail[0]?.msg : body.detail;
          return { error: msg || "Could not create the account" };
        } catch (_) { /* fall through to a local account */ }
      }

      const list = this.accounts();
      if (list[email]) return { error: "An account with this email already exists. Sign in instead." };
      list[email] = { name, hash: this.hashPassword(email, password) };
      write(LS.accounts, list);
      this.mode = "demo";
      this.user = { name, email, role: "admin" };
      this.org = { ...blankOrg(), name: org || name };
      this.finishSignIn();
      return { mode: "demo" };
    },

    async signIn(email, password) {
      email = (email || "").trim().toLowerCase();
      if (!email || !password) return { error: "Enter an email and a password" };

      // Try the real service first; fall back to the local engine so the
      // application is demonstrable with nothing else running.
      if (await this.probe()) {
        try {
          const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
          });
          if (res.ok) {
            const body = await res.json();
            this.token = body.access_token;
            this.mode = "live";
            this.user = { name: body.user.name, email: body.user.email, role: body.user.role };
            try { localStorage.setItem(LS.token, this.token); } catch (_) {}
            this.finishSignIn();
            return { mode: "live" };
          }
          if (res.status === 401) return { error: "Incorrect email or password" };
        } catch (_) { /* network dropped mid-request — continue in demo */ }
      }

      const account = this.accounts()[email];
      if (!account || account.hash !== this.hashPassword(email, password)) {
        return { error: "Incorrect email or password" };
      }
      this.mode = "demo";
      this.user = { name: account.name, email, role: "admin" };
      this.finishSignIn();
      return { mode: "demo" };
    },

    finishSignIn() {
      this.signedIn = true;
      try {
        localStorage.setItem(LS.session, JSON.stringify({ signedIn: true, user: this.user }));
      } catch (_) {}
      this.loadDashboards();
    },

    signOut() {
      this.signedIn = false;
      this.token = null;
      this.mode = "demo";
      this.dashboards = []; this.dashId = null; this.entries = [];
      try { localStorage.removeItem(LS.session); localStorage.removeItem(LS.token); } catch (_) {}
    },

    /* ══════════════════ reads ═════════════════════════════════════════ */

    months(n) { return V.periodMonths(n || this.period); },

    summary(n, dept) {
      const months = this.months(n);
      const agg = V.aggregate(this.entries, months, dept);
      const headcount = dept ? (V.DEPT[dept]?.head || 1) : this.org.headcount;
      const score = V.computeScore(agg, headcount, months.length);
      return { months, agg, score, headcount };
    },

    /** Monthly series in tonnes, for the charts. */
    trend(n = 12) {
      const months = V.periodMonths(n);
      const agg = V.aggregate(this.entries, months);
      return months.map(m => ({
        month: m,
        gross: agg.byMonth[m].gross / 1000,
        avoided: agg.byMonth[m].avoided / 1000,
        net: agg.byMonth[m].net / 1000
      }));
    },

    /** Monthly series in kilograms, for the statistics engines. */
    history(n = 12) {
      const months = V.periodMonths(n);
      const agg = V.aggregate(this.entries, months);
      return months.map(m => ({ month: m, net: agg.byMonth[m].net, gross: agg.byMonth[m].gross }));
    },

    live() { return this.entries.filter(e => e.status !== "voided"); },

    byId(id) { return this.entries.find(e => e.id === id); },

    /* ══════════════════ writes ════════════════════════════════════════ */

    preview(factorId, qty) {
      const f = V.byId[factorId];
      if (!f || !(qty > 0)) return null;
      return { factor: f, qty, co2: Math.round(qty * f.f * 1000) / 1000, isCredit: f.f < 0 };
    },

    async addEntry({ factorId, date, qty, ref, dept }) {
      const f = V.byId[factorId];
      if (!f) throw new Error("Unknown activity");
      if (!(qty > 0)) throw new Error("Quantity must be greater than zero");
      if (date > V.todayISO()) throw new Error("You cannot log activity that has not happened yet");

      const entry = {
        id: V.nextId() + "-" + Date.now().toString(36).slice(-3),
        date, factorId, qty,
        co2: Math.round(qty * f.f * 1000) / 1000,
        ref: ref || "", dept: dept || "facilities",
        status: "posted", by: this.user.email
      };

      if (this.mode === "live") {
        const saved = await this.apiPost("/api/entries", {
          factor_id: factorId, activity_date: date, quantity: qty, reference: ref || null
        });
        entry.id = String(saved.id);
        entry.co2 = saved.co2e_kg;
      }

      this.entries.push(entry);
      this.reseal();
      this.persist();
      return entry;
    },

    async voidEntry(id, reason) {
      const entry = this.byId(id);
      if (!entry || entry.status === "voided") return null;
      if (this.mode === "live") await this.apiPost(`/api/entries/${id}/void`, { reason });
      entry.status = "voided";
      entry.voidReason = reason;
      entry.voidedBy = this.user.email;
      this.reseal();
      this.persist();
      return entry;
    },

    setOrg(patch) {
      Object.assign(this.org, patch);
      this.persist();
    },

    resetLedger() {
      const seed = [...(this.org.name || "x")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 20260920);
      this.entries = V.generateLedger(new Date(), seed);
      this.reseal();
      this.persist();
    },

    /** Deliberately corrupt one entry — the demo for the integrity check. */
    tamper() {
      const candidates = V.Chain.order(this.live());
      const victim = candidates[Math.floor(candidates.length * 0.4)];
      if (!victim) return null;
      const before = victim.qty;
      victim.qty = Math.round(victim.qty * 0.82 * 100) / 100;
      victim.co2 = Math.round(victim.qty * V.byId[victim.factorId].f * 1000) / 1000;
      victim.tamperedFrom = before;
      this.persist();                       // note: NOT resealed — that is the point
      return { entry: victim, before };
    },

    /* ══════════════════ HTTP ══════════════════════════════════════════ */

    async apiGet(path) {
      const res = await fetch(API_BASE + path, { headers: { Authorization: `Bearer ${this.token}` } });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return res.json();
    },

    async apiPost(path, body) {
      const res = await fetch(API_BASE + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}` },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail || `Request failed (${res.status})`);
      }
      return res.json();
    },

    /* ══════════════════ exports ═══════════════════════════════════════ */

    csv() {
      const head = ["entry_id","activity_date","category","activity","quantity","unit",
                    "factor_kg_per_unit","co2e_kg","scope","department","status","reference",
                    "prev_hash","hash"];
      const cell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const rows = V.Chain.order(this.entries).reverse().map(e => {
        const f = V.byId[e.factorId];
        return [e.id, e.date, V.CAT[f.cat].name, f.label, e.qty, f.unit, f.f, e.co2,
                `Scope ${f.scope}`, V.DEPT[e.dept]?.name || e.dept, e.status, e.ref,
                e.prevHash, e.hash].map(cell).join(",");
      });
      return [head.join(","), ...rows].join("\n");
    },

    /** A disclosure-shaped report — the payload you hand to an auditor. */
    disclosure(n = 12) {
      const { months, agg, score } = this.summary(n);
      return {
        organisation: { ...this.org },
        period: { start: months[0], end: months[months.length - 1], months: months.length },
        basis: "GHG Protocol Corporate Standard. Factors as cited per activity.",
        integrity: { head: this.head, algorithm: "SHA-256 chained, canonical field order" },
        totals_kg: { gross: agg.gross, avoided: agg.avoided, net: agg.net },
        by_scope_kg: { scope_1: agg.byScope[1], scope_2: agg.byScope[2], scope_3: agg.byScope[3] },
        by_category_kg: Object.fromEntries(V.CATEGORIES.map(c => [c.id, agg.byCat[c.id]])),
        by_department_kg: Object.fromEntries(V.DEPARTMENTS.map(d => [d.id, agg.byDept[d.id].net])),
        resources: {
          energy_kwh: agg.energy, renewable_kwh: agg.renewable,
          water_kl: agg.water, waste_kg: agg.waste, diverted_kg: agg.diverted,
          paper_kg: agg.paper, distance_km: agg.distance, low_carbon_km: agg.lowCarbon
        },
        score: { composite: score.composite, grade: score.grade,
                 subscores: Object.fromEntries(score.subscores.map(s => [s.key, s.value])) }
      };
    }
  };

  Store.DEMO = { email: DEMO.email, password: DEMO.password };
  V.Store = Store;
  V.API_BASE = API_BASE;
})();
