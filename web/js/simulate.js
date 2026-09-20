/* ══════════════════════════════════════════════════════════════════════
   simulate.js — the scenario engine.

   This is what turns a reporting tool into a decision tool. Each lever
   is a described intervention with a real mechanism: it REWRITES the
   ledger (a copy of it) by moving quantity from one emission factor to
   another, or by scaling one factor's quantity — and then the ordinary
   aggregation and scoring engine runs over the rewritten ledger.

   Nothing here estimates a saving with a fudge factor. "Move 40% of
   fleet kilometres to EV" literally moves 40% of the petrol-car
   kilometres onto the electric-vehicle factor and recomputes. That is
   why the simulated score is directly comparable with the real one: it
   is produced by the same code path.
   ══════════════════════════════════════════════════════════════════════ */

window.VL = window.VL || {};

(() => {
  "use strict";
  const V = window.VL;

  /* ─────────────────────────── levers ────────────────────────────────
     shift  : move a share of quantity from one factor to another
     scale  : multiply one factor's quantity (efficiency / reduction)
     offset : add new quantity on a credit factor, sized against a source
  ─────────────────────────────────────────────────────────────────── */

  const LEVERS = [
    {
      id: "ev",
      name: "Electrify the vehicle fleet",
      unitLabel: "% of fleet km",
      max: 100, step: 5, def: 0,
      capex: "≈ ₹18 lakh per vehicle, offset by ≈₹1.2 lakh/yr running cost",
      detail: "Moves petrol and diesel company-car kilometres onto the EV factor (0.112 kg/km on the Indian grid, versus 0.170).",
      apply: (entries, pct) => shift(entries, ["transport:car_petrol", "transport:car_diesel"], "transport:ev", pct / 100)
    },
    {
      id: "solar",
      name: "Expand rooftop solar",
      unitLabel: "% of electricity",
      max: 80, step: 5, def: 0,
      capex: "≈ ₹45,000 per kWp installed · 4–5 year payback at commercial tariffs",
      detail: "Generates self-consumed solar equal to the chosen share of grid draw, posted as a credit at the grid factor.",
      apply: (entries, pct) => offsetEnergy(entries, "electricity:grid", "renewable:solar_pv", pct / 100)
    },
    {
      id: "divert",
      name: "Divert waste from landfill",
      unitLabel: "% of landfill mass",
      max: 90, step: 5, def: 0,
      capex: "Segregation bins and a contracted recycler · low capital, high behavioural",
      detail: "Moves mixed landfill waste into composting and materials recycling in the proportion the site actually generates.",
      apply: (entries, pct) => {
        let next = shift(entries, ["waste:landfill"], "waste:composted", (pct / 100) * 0.45);
        next = shift(next, ["waste:landfill"], "recycling:paper", (pct / 100) * 0.33);
        next = shift(next, ["waste:landfill"], "recycling:plastic", (pct / 100) * 0.22);
        return next;
      }
    },
    {
      id: "commute",
      name: "Shift commuting to transit",
      unitLabel: "% of car & taxi km",
      max: 80, step: 5, def: 0,
      capex: "Shuttle contract and a transit allowance · ≈₹1,100 per employee per month",
      detail: "Moves reimbursed taxi and two-wheeler kilometres onto metro and the company shuttle.",
      apply: (entries, pct) => {
        let next = shift(entries, ["transport:taxi"], "transport:metro", (pct / 100) * 0.6);
        next = shift(next, ["transport:taxi"], "transport:bus", (pct / 100) * 0.4);
        return next;
      }
    },
    {
      id: "paperless",
      name: "Cut paper consumption",
      unitLabel: "% reduction",
      max: 90, step: 5, def: 0,
      capex: "Digital approvals and duplex defaults · negligible capital",
      detail: "Scales down virgin A4 consumption and moves the remainder to recycled-content stock.",
      apply: (entries, pct) => {
        let next = scale(entries, ["paper:a4_ream", "paper:a4_sheet"], 1 - pct / 100);
        next = shift(next, ["paper:a4_ream"], "paper:recycled", 0.5 * (pct / 100));
        return next;
      }
    },
    {
      id: "hvac",
      name: "HVAC & lighting retrofit",
      unitLabel: "% of grid draw saved",
      max: 35, step: 1, def: 0,
      capex: "≈ ₹1,400 per m² · LED, BMS scheduling, chiller sequencing",
      detail: "Reduces grid electricity directly. Typical retrofits deliver 12–22% on an office of this age.",
      apply: (entries, pct) => scale(entries, ["electricity:grid"], 1 - pct / 100)
    },
    {
      id: "flights",
      name: "Travel policy — video first",
      unitLabel: "% of flights avoided",
      max: 80, step: 5, def: 0,
      capex: "Policy change · saves ≈₹22,000 per avoided domestic return",
      detail: "Removes a share of domestic and international flight distance outright.",
      apply: (entries, pct) => scale(entries, ["transport:flight_dom", "transport:flight_intl"], 1 - pct / 100)
    },
    {
      id: "ppa",
      name: "Sign a green power PPA",
      unitLabel: "% of electricity",
      max: 100, step: 5, def: 0,
      capex: "Group-captive wind, ≈₹4.6/kWh versus ₹8.1 commercial tariff",
      detail: "Contracts renewable generation equal to the chosen share of remaining grid draw.",
      apply: (entries, pct) => offsetEnergy(entries, "electricity:grid", "renewable:ppa", pct / 100)
    }
  ];

  /* ─────────────────────── transform primitives ─────────────────────── */

  const keyOf = f => `${f.cat}:${f.code}`;
  const clone = e => ({ ...e });

  /** Move `share` of the quantity on `fromKeys` onto `toKey`. */
  function shift(entries, fromKeys, toKey, share) {
    if (share <= 0) return entries;
    const target = V.byCode[toKey];
    if (!target) return entries;
    const from = new Set(fromKeys);
    const out = [];

    for (const e of entries) {
      const f = V.byId[e.factorId];
      if (!f || e.status === "voided" || !from.has(keyOf(f))) { out.push(e); continue; }

      const moved = e.qty * share;
      const kept = e.qty - moved;

      if (kept > 0.001) {
        const a = clone(e);
        a.qty = kept; a.co2 = kept * f.f;
        out.push(a);
      }
      const b = clone(e);
      b.id = e.id + "~" + target.code;
      b.factorId = target.id;
      // Convert the unit basis where the two factors measure differently
      // (a kilogram of landfill waste is a kilogram of recycled waste).
      b.qty = moved;
      b.co2 = moved * target.f;
      b.simulated = true;
      out.push(b);
    }
    return out;
  }

  /** Multiply the quantity on `keys` by `factor`. */
  function scale(entries, keys, factor) {
    if (factor === 1) return entries;
    const set = new Set(keys);
    return entries.map(e => {
      const f = V.byId[e.factorId];
      if (!f || e.status === "voided" || !set.has(keyOf(f))) return e;
      const next = clone(e);
      next.qty = e.qty * factor;
      next.co2 = next.qty * f.f;
      next.simulated = true;
      return next;
    }).filter(e => e.qty > 0.001 || e.status === "voided");
  }

  /**
   * Add credit entries sized as `share` of the energy drawn on
   * `sourceKey`. Used for solar and PPAs: you generate against what you
   * actually consume, so the credit can never exceed the draw.
   */
  function offsetEnergy(entries, sourceKey, creditKey, share) {
    if (share <= 0) return entries;
    const credit = V.byCode[creditKey];
    if (!credit) return entries;
    const out = entries.slice();

    for (const e of entries) {
      const f = V.byId[e.factorId];
      if (!f || e.status === "voided" || keyOf(f) !== sourceKey) continue;
      const generated = e.qty * share;
      if (generated <= 0.001) continue;
      out.push({
        ...e,
        id: e.id + "~" + credit.code,
        factorId: credit.id,
        qty: generated,
        co2: generated * credit.f,
        ref: `Simulated · ${credit.label}`,
        simulated: true
      });
    }
    return out;
  }

  /* ─────────────────────────── the run ──────────────────────────────── */

  /**
   * Apply a set of lever positions and return baseline vs simulated,
   * both computed by the production aggregation and scoring code.
   */
  function run(entries, positions, months, headcount) {
    let next = entries;
    const active = [];

    for (const lever of LEVERS) {
      const pct = positions[lever.id] || 0;
      if (pct <= 0) continue;
      next = lever.apply(next, pct);
      active.push({ lever, pct });
    }

    const baseAgg = V.aggregate(entries, months);
    const simAgg  = V.aggregate(next, months);
    const baseScore = V.computeScore(baseAgg, headcount, months.length);
    const simScore  = V.computeScore(simAgg, headcount, months.length);

    // Attribute the saving to each lever by running it alone — the sum of
    // solo savings will not equal the combined saving when levers overlap,
    // and the UI says so rather than pretending otherwise.
    const attribution = active.map(({ lever, pct }) => {
      const solo = V.aggregate(lever.apply(entries, pct), months);
      return { lever, pct, saving: baseAgg.net - solo.net };
    }).sort((a, b) => b.saving - a.saving);

    const soloSum = attribution.reduce((s, a) => s + a.saving, 0);
    const combined = baseAgg.net - simAgg.net;

    return {
      baseAgg, simAgg, baseScore, simScore, attribution, active,
      entries: next,
      savingKg: combined,
      savingPct: baseAgg.net ? (100 * combined) / baseAgg.net : 0,
      scoreDelta: simScore.composite - baseScore.composite,
      overlap: soloSum - combined,
      annualisedSaving: months.length ? (combined / months.length) * 12 : 0
    };
  }

  /** A named set of lever positions the user can load in one click. */
  const PLAYBOOKS = [
    { id:"quick",  name:"Quick wins",      note:"No capital. Policy and behaviour only.",
      positions:{ divert:60, paperless:55, flights:40, commute:30 } },
    { id:"capital",name:"Capital programme",note:"Solar, EV fleet and an HVAC retrofit.",
      positions:{ solar:45, ev:60, hvac:18 } },
    { id:"sbti",   name:"1.5 °C aligned",  note:"Everything needed to hit −42% by 2030.",
      positions:{ solar:55, ppa:25, ev:80, hvac:22, divert:80, commute:50, paperless:70, flights:50 } }
  ];

  window.VL.Simulate = { LEVERS, PLAYBOOKS, run, shift, scale, offsetEnergy };
})();
