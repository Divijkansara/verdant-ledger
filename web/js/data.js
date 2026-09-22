/* ══════════════════════════════════════════════════════════════════════
   data.js — the domain: categories, emission factors, the demo ledger
   and the calculation + scoring engine.

   Mirrors backend/app/services/{calculator,scoring}.py exactly, so the
   application produces identical numbers whether it is talking to the
   FastAPI service or running standalone in the browser.
   ══════════════════════════════════════════════════════════════════════ */

window.VL = window.VL || {};

(() => {
  "use strict";

  /* ═══════════════════════ categories ════════════════════════════════ */
  const CATEGORIES = [
    { id: "electricity", name: "Electricity",  s: 1, kind: "charge", icon: "bolt"      },
    { id: "transport",   name: "Transport",    s: 2, kind: "charge", icon: "route"     },
    { id: "procurement", name: "Purchases",    s: 3, kind: "charge", icon: "box"       },
    { id: "waste",       name: "Waste",        s: 4, kind: "charge", icon: "trash"     },
    { id: "water",       name: "Water",        s: 5, kind: "charge", icon: "drop"      },
    { id: "paper",       name: "Paper",        s: 6, kind: "charge", icon: "page"      },
    { id: "renewable",   name: "Renewables",   s: 7, kind: "credit", icon: "sun"       },
    { id: "recycling",   name: "Recycling",    s: 8, kind: "credit", icon: "recycle"   }
  ];
  const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
  /** Every category owns a fixed series slot — colour follows the entity,
      never its rank, so filtering a chart never repaints the survivors. */
  const catColor = id => `var(--series-${CAT[id].s})`;

  /* ═══════════════════════ departments ═══════════════════════════════ */
  const DEPARTMENTS = [
    { id: "facilities", name: "Facilities",   head: 18 },
    { id: "operations", name: "Operations",   head: 42 },
    { id: "it",         name: "IT & Engineering", head: 31 },
    { id: "logistics",  name: "Logistics",    head: 14 },
    { id: "canteen",    name: "Canteen",      head: 9  },
    { id: "admin",      name: "Admin & Finance", head: 6 }
  ];
  const DEPT = Object.fromEntries(DEPARTMENTS.map(d => [d.id, d]));

  /* ═══════════════════════ emission factors ══════════════════════════ */
  const DEFRA = "DEFRA/BEIS UK GHG Conversion Factors 2024";
  const CEA   = "CEA CO₂ Baseline Database for the Indian Power Sector v20";
  const EEIO  = "Spend-based EEIO screening factor";
  const srcTag = s => (s === DEFRA ? "DEFRA 2024" : s === CEA ? "CEA v20" : "EEIO");

  // f = kg CO₂e per unit (negative = credit) · rk = resource kind
  // rp = resource per unit · ren/div/low = sub-score flags
  const FACTORS = [
    { id: 1,  cat:"electricity", code:"grid",         label:"Grid electricity",              unit:"kWh",    f:0.716,  scope:2, src:CEA,   rk:"energy" },
    { id: 2,  cat:"electricity", code:"dg_set",       label:"Diesel generator set",          unit:"kWh",    f:0.850,  scope:1, src:DEFRA, rk:"energy" },
    { id: 3,  cat:"electricity", code:"green_tariff", label:"Green tariff / REC-backed",     unit:"kWh",    f:0.000,  scope:2, src:CEA,   rk:"energy", ren:1 },

    { id: 4,  cat:"water",       code:"supply",       label:"Municipal water supply",        unit:"kL",     f:0.344,  scope:3, src:DEFRA, rk:"water" },
    { id: 5,  cat:"water",       code:"treated",      label:"Wastewater treated",            unit:"kL",     f:0.708,  scope:3, src:DEFRA },
    { id: 6,  cat:"water",       code:"tanker",       label:"Tanker water (incl. haulage)",  unit:"kL",     f:0.610,  scope:3, src:DEFRA, rk:"water" },

    { id: 7,  cat:"waste",       code:"landfill",     label:"Mixed waste to landfill",       unit:"kg",     f:0.586,  scope:3, src:DEFRA, rk:"waste" },
    { id: 8,  cat:"waste",       code:"incinerated",  label:"Incineration (energy recovery)",unit:"kg",     f:0.021,  scope:3, src:DEFRA, rk:"waste" },
    { id: 9,  cat:"waste",       code:"composted",    label:"Organic waste composted",       unit:"kg",     f:0.010,  scope:3, src:DEFRA, rk:"waste", div:1 },
    { id:10,  cat:"waste",       code:"ewaste",       label:"E-waste to landfill",           unit:"kg",     f:1.200,  scope:3, src:DEFRA, rk:"waste" },

    { id:11,  cat:"transport",   code:"car_petrol",   label:"Company car — petrol",          unit:"km",     f:0.170,  scope:1, src:DEFRA, rk:"distance" },
    { id:12,  cat:"transport",   code:"car_diesel",   label:"Company car — diesel",          unit:"km",     f:0.171,  scope:1, src:DEFRA, rk:"distance" },
    { id:13,  cat:"transport",   code:"ev",           label:"Electric vehicle",              unit:"km",     f:0.112,  scope:2, src:CEA,   rk:"distance", low:1 },
    { id:14,  cat:"transport",   code:"two_wheeler",  label:"Two-wheeler — petrol",          unit:"km",     f:0.049,  scope:1, src:DEFRA, rk:"distance", low:1 },
    { id:15,  cat:"transport",   code:"taxi",         label:"Taxi / auto-rickshaw",          unit:"km",     f:0.148,  scope:3, src:DEFRA, rk:"distance" },
    { id:16,  cat:"transport",   code:"bus",          label:"Bus (public transit)",          unit:"km",     f:0.103,  scope:3, src:DEFRA, rk:"distance", low:1 },
    { id:17,  cat:"transport",   code:"metro",        label:"Metro / suburban rail",         unit:"km",     f:0.028,  scope:3, src:DEFRA, rk:"distance", low:1 },
    { id:18,  cat:"transport",   code:"flight_dom",   label:"Domestic flight",               unit:"km",     f:0.246,  scope:3, src:DEFRA, rk:"distance" },
    { id:19,  cat:"transport",   code:"flight_intl",  label:"International flight (economy)",unit:"km",     f:0.150,  scope:3, src:DEFRA, rk:"distance" },

    { id:20,  cat:"paper",       code:"a4_sheet",     label:"A4 sheet, virgin (80 gsm)",     unit:"sheets", f:0.0046, scope:3, src:DEFRA, rk:"paper", rp:0.005 },
    { id:21,  cat:"paper",       code:"a4_ream",      label:"A4 ream (500 sheets)",          unit:"reams",  f:2.298,  scope:3, src:DEFRA, rk:"paper", rp:2.5 },
    { id:22,  cat:"paper",       code:"recycled",     label:"Recycled-content paper",        unit:"kg",     f:0.628,  scope:3, src:DEFRA, rk:"paper" },
    { id:23,  cat:"paper",       code:"cardboard",    label:"Cardboard packaging",           unit:"kg",     f:0.821,  scope:3, src:DEFRA, rk:"paper" },

    { id:24,  cat:"procurement", code:"it_equipment", label:"IT & electronics",              unit:"₹'000",  f:5.4,    scope:3, src:EEIO,  rk:"spend" },
    { id:25,  cat:"procurement", code:"furniture",    label:"Furniture & fixtures",          unit:"₹'000",  f:4.8,    scope:3, src:EEIO,  rk:"spend" },
    { id:26,  cat:"procurement", code:"consumables",  label:"Office consumables",            unit:"₹'000",  f:3.6,    scope:3, src:EEIO,  rk:"spend" },
    { id:27,  cat:"procurement", code:"catering",     label:"Food & catering",               unit:"₹'000",  f:6.2,    scope:3, src:EEIO,  rk:"spend" },
    { id:28,  cat:"procurement", code:"services",     label:"Professional services",         unit:"₹'000",  f:1.1,    scope:3, src:EEIO,  rk:"spend" },
    { id:29,  cat:"procurement", code:"construction", label:"Construction & maintenance",    unit:"₹'000",  f:7.5,    scope:3, src:EEIO,  rk:"spend" },

    { id:30,  cat:"recycling",   code:"paper",        label:"Paper & cardboard recycled",    unit:"kg",     f:-0.90,  scope:3, src:DEFRA, rk:"waste", div:1 },
    { id:31,  cat:"recycling",   code:"plastic",      label:"Plastics recycled",             unit:"kg",     f:-1.45,  scope:3, src:DEFRA, rk:"waste", div:1 },
    { id:32,  cat:"recycling",   code:"aluminium",    label:"Aluminium recycled",            unit:"kg",     f:-8.90,  scope:3, src:DEFRA, rk:"waste", div:1 },
    { id:33,  cat:"recycling",   code:"steel",        label:"Steel & other metals",          unit:"kg",     f:-1.75,  scope:3, src:DEFRA, rk:"waste", div:1 },
    { id:34,  cat:"recycling",   code:"glass",        label:"Glass recycled",                unit:"kg",     f:-0.32,  scope:3, src:DEFRA, rk:"waste", div:1 },
    { id:35,  cat:"recycling",   code:"ewaste",       label:"E-waste (authorised recycler)", unit:"kg",     f:-1.10,  scope:3, src:DEFRA, rk:"waste", div:1 },

    { id:36,  cat:"renewable",   code:"solar_pv",     label:"Rooftop solar — self-consumed", unit:"kWh",    f:-0.716, scope:2, src:CEA,   rk:"energy", ren:1 },
    { id:37,  cat:"renewable",   code:"ppa",          label:"Wind / solar PPA",              unit:"kWh",    f:-0.716, scope:2, src:CEA,   rk:"energy", ren:1 },
    { id:38,  cat:"renewable",   code:"solar_thermal",label:"Solar water heating",           unit:"kWh",    f:-0.450, scope:1, src:DEFRA, ren:1 },
    { id:39,  cat:"renewable",   code:"biogas",       label:"Canteen biogas",                unit:"kWh",    f:-0.550, scope:1, src:DEFRA, ren:1 }
  ];

  const byId   = Object.fromEntries(FACTORS.map(f => [f.id, f]));
  const byCode = Object.fromEntries(FACTORS.map(f => [`${f.cat}:${f.code}`, f]));

  /* ═══════════════════════ scoring methodology ═══════════════════════ */
  const BANDS = {
    carbon:    { label:"Carbon intensity",      unit:"kg CO₂e/emp/mo", target:40,  ceiling:300, weight:.30 },
    renewable: { label:"Renewable electricity", unit:"% of kWh",       target:60,  ceiling:0,   weight:.20 },
    diversion: { label:"Waste diversion",       unit:"% diverted",     target:75,  ceiling:0,   weight:.20 },
    resource:  { label:"Resource efficiency",   unit:"water + paper",  target:100, ceiling:0,   weight:.15 },
    mobility:  { label:"Low-carbon mobility",   unit:"% of km",        target:55,  ceiling:0,   weight:.15 }
  };
  const WATER_BAND = { target: 0.9, ceiling: 4.0 };
  const PAPER_BAND = { target: 0.5, ceiling: 3.0 };

  const clamp01   = x => Math.max(0, Math.min(1, x));
  const normalise = (v, target, ceiling) =>
    target === ceiling ? 0 : 100 * clamp01((v - ceiling) / (target - ceiling));

  const gradeFor = s =>
    s >= 85 ? "A+" : s >= 75 ? "A" : s >= 65 ? "B+" : s >= 55 ? "B" : s >= 45 ? "C+" : s >= 35 ? "C" : "D";
  const bandFor  = s => (s >= 67 ? "good" : s >= 40 ? "warn" : "bad");
  const bandVar  = s => `var(--${bandFor(s)})`;

  /* ═══════════════════════ period helpers ════════════════════════════ */
  const pad  = n => String(n).padStart(2, "0");
  const ymOf = iso => iso.slice(0, 7);

  function addMonths(d, delta) {
    const idx = d.getMonth() + delta;
    return new Date(d.getFullYear() + Math.floor(idx / 12), ((idx % 12) + 12) % 12, 1);
  }
  function periodMonths(n, today = new Date()) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = addMonths(new Date(today.getFullYear(), today.getMonth(), 1), -i);
      out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
    }
    return out;
  }
  const monthLabel = key => {
    const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${M[+key.split("-")[1] - 1]} ${key.slice(2, 4)}`;
  };
  const dateLabel = iso => {
    const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const [y, m, d] = iso.split("-");
    return `${d} ${M[+m - 1]} ${y.slice(2)}`;
  };
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  /* ═══════════════════════ calculation engine ════════════════════════ */

  /** The single pricing rule: co2e = quantity × factor. */
  function price(factor, quantity) {
    if (!(quantity > 0)) throw new Error("Quantity must be greater than zero");
    return Math.round(quantity * factor.f * 1000) / 1000;
  }

  /**
   * Aggregate a set of entries over a set of months.
   * Voided entries are excluded from every figure but stay in the table.
   */
  function aggregate(entries, months, filterDept) {
    const set = new Set(months);
    const a = {
      gross:0, avoided:0, net:0, count:0,
      byCat:{}, byScope:{1:0,2:0,3:0}, byDept:{}, byMonth:{},
      energy:0, renewable:0, waste:0, diverted:0,
      water:0, paper:0, distance:0, lowCarbon:0, spend:0
    };
    CATEGORIES.forEach(c => (a.byCat[c.id] = 0));
    DEPARTMENTS.forEach(d => (a.byDept[d.id] = { gross:0, avoided:0, net:0, count:0 }));
    months.forEach(m => (a.byMonth[m] = { gross:0, avoided:0, net:0 }));

    for (const e of entries) {
      if (e.status === "voided") continue;
      const m = ymOf(e.date);
      if (!set.has(m)) continue;
      if (filterDept && e.dept !== filterDept) continue;
      const f = byId[e.factorId];
      if (!f) continue;

      a.count++;
      a.byCat[f.cat] += e.co2;
      a.byScope[f.scope] += e.co2;

      const bucket = a.byMonth[m];
      const dept = a.byDept[e.dept];
      if (e.co2 >= 0) { a.gross += e.co2; bucket.gross += e.co2; if (dept) dept.gross += e.co2; }
      else            { a.avoided -= e.co2; bucket.avoided -= e.co2; if (dept) dept.avoided -= e.co2; }
      if (dept) { dept.net += e.co2; dept.count++; }

      const amount = e.qty * (f.rp || 1);
      if (f.rk === "energy")   { a.energy += amount;   if (f.ren) a.renewable += amount; }
      if (f.rk === "waste")    { a.waste += amount;    if (f.div) a.diverted  += amount; }
      if (f.rk === "water")    a.water += amount;
      if (f.rk === "paper")    a.paper += amount;
      if (f.rk === "distance") { a.distance += amount; if (f.low) a.lowCarbon += amount; }
      if (f.rk === "spend")    a.spend += amount;
    }

    a.net = a.gross - a.avoided;
    months.forEach(m => (a.byMonth[m].net = a.byMonth[m].gross - a.byMonth[m].avoided));
    return a;
  }

  /** Pure function: same aggregate in, same score out. */
  function computeScore(a, headcount, months) {
    const emp = Math.max(1, headcount), mo = Math.max(1, months);
    const pct = (n, d) => (d ? (100 * n) / d : 0);

    const waterPEM = a.water / emp / mo;
    const paperPEM = a.paper / emp / mo;
    const waterScore = normalise(waterPEM, WATER_BAND.target, WATER_BAND.ceiling);
    const paperScore = normalise(paperPEM, PAPER_BAND.target, PAPER_BAND.ceiling);

    const observed = {
      carbon:    a.net / emp / mo,
      renewable: pct(a.renewable, a.energy),
      diversion: pct(a.diverted, a.waste),
      resource:  (waterScore + paperScore) / 2,
      mobility:  pct(a.lowCarbon, a.distance)
    };

    let composite = 0;
    const subscores = Object.keys(BANDS).map(key => {
      const b = BANDS[key];
      const value = Math.round(normalise(observed[key], b.target, b.ceiling) * 100) / 100;
      composite += value * b.weight;
      return { key, label:b.label, unit:b.unit, weight:b.weight, value,
               observed:observed[key], band:bandFor(value), target:b.target, ceiling:b.ceiling };
    });
    composite = Math.round(composite * 100) / 100;

    return { composite, grade: gradeFor(composite), subscores,
             waterPEM, paperPEM, waterScore, paperScore, observed };
  }

  /* ═══════════════════════ demo ledger ═══════════════════════════════ */

  function mulberry(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // [factorKey, day, base, trendAcrossYear, jitter, reference, department]
  const PATTERN = [
    ["electricity:grid",         4, 17800, -1900, .06, "TNEB meter reading",   "facilities"],
    ["electricity:dg_set",       4,   520,  -180, .35, "Backup DG runtime",    "facilities"],
    ["renewable:solar_pv",       6,   900,  2600, .12, "Rooftop array 96 kWp", "facilities"],
    ["renewable:biogas",         7,   220,   180, .20, "Canteen digester",     "canteen"],
    ["water:supply",             5,   492,   -55, .07, "Corporation supply",   "facilities"],
    ["water:treated",            5,   384,   -40, .07, "STP outflow",          "facilities"],
    ["waste:landfill",          28,  1420,  -520, .10, "Municipal pickup",     "facilities"],
    ["waste:composted",         28,   360,   340, .12, "Canteen organics",     "canteen"],
    ["recycling:paper",         27,   520,   240, .12, "Baled, monthly uplift","facilities"],
    ["recycling:plastic",       27,   140,    90, .16, "PET and HDPE",         "facilities"],
    ["recycling:aluminium",     27,    28,    22, .30, "Cans and scrap",       "canteen"],
    ["recycling:steel",         27,    70,    40, .30, "Workshop offcuts",     "operations"],
    ["transport:car_petrol",    30,  6100, -2400, .12, "Fleet odometer",       "logistics"],
    ["transport:ev",            30,   400,  4200, .15, "e-fleet telematics",   "logistics"],
    ["transport:taxi",          30,  2350,     0, .18, "Reimbursed cabs",      "operations"],
    ["transport:metro",         30,  7600,  3200, .10, "Commute survey",       "operations"],
    ["transport:bus",           30,  2900,   900, .12, "Shuttle service",      "operations"],
    ["transport:two_wheeler",   30,  3100,     0, .15, "Commute survey",       "it"],
    ["paper:a4_ream",            9,    96,   -46, .12, "Stationery issue",     "admin"],
    ["paper:cardboard",          9,   210,   -60, .20, "Inbound packaging",    "logistics"],
    ["procurement:it_equipment",12,   430,     0, .30, "Hardware refresh",     "it"],
    ["procurement:catering",    12,   318,     0, .12, "Canteen contract",     "canteen"],
    ["procurement:consumables", 12,    88,     0, .25, "Office supplies",      "admin"],
    ["procurement:services",    12,   690,     0, .18, "Audit and consulting", "admin"]
  ];
  const OCCASIONAL = [
    ["transport:flight_dom",  15,  9800, .42, "Client travel",         "operations"],
    ["transport:flight_intl", 15, 14200, .80, "Conference travel",     "it"],
    ["waste:ewaste",          22,    46, .70, "Decommissioned units",  "it"],
    ["water:tanker",          19,    58, .62, "Summer top-up",         "facilities"],
    ["procurement:furniture", 20,   160, .75, "Workstation batch",     "admin"]
  ];

  let seq = 0;
  const nextId = () => "e" + (++seq).toString(36).padStart(5, "0");

  /**
   * Twelve months of plausible activity, seeded so the demo tells the
   * same story on every machine: solar rising, landfill falling, the EV
   * fleet displacing petrol. One deliberate September anomaly is planted
   * so the anomaly detector has something true to find.
   */
  function generateLedger(today = new Date()) {
    const rnd = mulberry(20260920);
    seq = 0;
    const out = [];

    for (let back = 11; back >= 0; back--) {
      const first = addMonths(new Date(today.getFullYear(), today.getMonth(), 1), -back);
      const y = first.getFullYear(), m = first.getMonth();
      const days = new Date(y, m + 1, 0).getDate();
      const partial = back === 0 ? Math.min(1, today.getDate() / days) : 1;
      const progress = (11 - back) / 11;

      const post = (key, day, qty, ref, dept) => {
        const f = byCode[key];
        if (!f || !(qty > 0)) return;
        const q = Math.round(qty * 100) / 100;
        out.push({
          id: nextId(),
          date: `${y}-${pad(m + 1)}-${pad(Math.min(day, days))}`,
          factorId: f.id, qty: q, co2: Math.round(q * f.f * 1000) / 1000,
          ref, dept, status: "posted", by: "system.seed"
        });
      };

      for (const [key, day, base, trend, jitter, ref, dept] of PATTERN) {
        let qty = (base + trend * progress) * (1 + (rnd() - 0.5) * 2 * jitter) * partial;
        // planted anomaly: a chiller left running through August
        if (back === 1 && key === "electricity:grid") qty *= 1.42;
        post(key, day, qty, ref, dept);
      }
      for (const [key, day, base, threshold, ref, dept] of OCCASIONAL) {
        if (rnd() > threshold) post(key, day, base * (1 + (rnd() - 0.5) * 0.6) * partial, ref, dept);
      }
    }
    return out;
  }

  /* ═══════════════════════ exports ═══════════════════════════════════ */
  Object.assign(window.VL, {
    CATEGORIES, CAT, catColor, DEPARTMENTS, DEPT,
    FACTORS, byId, byCode, srcTag, DEFRA, CEA, EEIO,
    BANDS, WATER_BAND, PAPER_BAND,
    clamp01, normalise, gradeFor, bandFor, bandVar,
    pad, ymOf, addMonths, periodMonths, monthLabel, dateLabel, todayISO,
    price, aggregate, computeScore, generateLedger, nextId, mulberry
  });
})();
