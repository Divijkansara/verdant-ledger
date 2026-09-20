/* ══════════════════════════════════════════════════════════════════════
   analytics.js — the part of the system that tells you something you
   did not ask it.

   Three engines, all pure functions over the ledger:

     1. ANOMALY DETECTION  rolling mean and standard deviation per
        activity; a month is flagged when it sits more than z standard
        deviations from its own history. Catches the chiller left
        running, the misread meter, the duplicated invoice.

     2. FORECAST  ordinary least-squares regression on the monthly net
        position, with a prediction interval from the residual spread.
        Projects where the organisation lands if nothing changes.

     3. CARBON BUDGET  an SBTi-style linear glide path from a baseline
        year to a target year, the cumulative budget under that path,
        how much has been spent, and the date the budget runs out at
        the current rate.

   No machine-learning library — the statistics are written out, which
   means every number on the Insights screen can be explained.
   ══════════════════════════════════════════════════════════════════════ */

window.VL = window.VL || {};

(() => {
  "use strict";
  const V = window.VL;

  /* ═════════════════════ basic statistics ════════════════════════════ */

  const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  /** Sample standard deviation (n−1): we are estimating from a sample. */
  function stdev(xs) {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
  }

  /** Ordinary least squares: y = slope·x + intercept, plus fit quality. */
  function linreg(points) {
    const n = points.length;
    if (n < 2) return { slope: 0, intercept: n ? points[0].y : 0, r2: 0, residualSd: 0 };

    const mx = mean(points.map(p => p.x));
    const my = mean(points.map(p => p.y));
    let num = 0, den = 0;
    for (const p of points) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; }

    const slope = den === 0 ? 0 : num / den;
    const intercept = my - slope * mx;

    let ssRes = 0, ssTot = 0;
    for (const p of points) {
      const fit = slope * p.x + intercept;
      ssRes += (p.y - fit) ** 2;
      ssTot += (p.y - my) ** 2;
    }
    return {
      slope, intercept,
      r2: ssTot === 0 ? 1 : 1 - ssRes / ssTot,
      residualSd: n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0
    };
  }

  /* ═════════════════════ 1 · ANOMALY DETECTION ═══════════════════════ */

  /**
   * Flag activity months that break their own pattern.
   *
   * For every distinct activity, the monthly quantity series is walked
   * forward; at each month the mean and standard deviation of all
   * PRIOR months form the expectation, and the month is scored
   *
   *     z = (observed − expected) / σ
   *
   * Only months with at least `minHistory` prior observations are
   * judged — a series with no history cannot be anomalous.
   */
  function detectAnomalies(entries, opts = {}) {
    // eslint-disable-next-line no-shadow-restricted-names
    const { minHistory = 5, threshold = 2.5, months = 12, includeCurrent = false } = opts;

    /* The current month is incomplete: only part of its activity has been
       posted, so every series would read as anomalously LOW and drown the
       real findings. It is excluded until the month closes. */
    const all = V.periodMonths(months);
    const currentMonth = all[all.length - 1];
    const window = new Set(includeCurrent ? all : all.slice(0, -1));
    const series = {};

    for (const e of entries) {
      if (e.status === "voided") continue;
      const m = V.ymOf(e.date);
      if (!window.has(m)) continue;
      const key = e.factorId;
      (series[key] ||= {});
      series[key][m] = (series[key][m] || 0) + e.qty;
    }

    const out = [];
    for (const factorId in series) {
      const factor = V.byId[factorId];
      if (!factor) continue;
      const monthKeys = Object.keys(series[factorId]).sort();

      for (let i = minHistory; i < monthKeys.length; i++) {
        const history = monthKeys.slice(0, i).map(k => series[factorId][k]);
        const observed = series[factorId][monthKeys[i]];
        const expected = mean(history);
        const sd = stdev(history);
        if (sd <= 0 || expected <= 0) continue;

        const z = (observed - expected) / sd;
        if (Math.abs(z) < threshold) continue;

        const deltaQty = observed - expected;
        out.push({
          factorId: +factorId,
          factor,
          category: factor.cat,
          month: monthKeys[i],
          observed, expected, sd, z,
          deltaPct: (100 * deltaQty) / expected,
          co2Impact: deltaQty * factor.f,
          direction: z > 0 ? "above" : "below",
          severity: Math.abs(z) >= 3 ? "high" : Math.abs(z) >= 2.5 ? "medium" : "low",
          // A spike in consumption is a problem; a spike in recycling is a win.
          isGood: (factor.f < 0 && z > 0) || (factor.f > 0 && z < 0)
        });
      }
    }

    /* Ranked by the size of the carbon consequence, not by the size of
       the statistical surprise: a 4σ blip on a factor worth 20 kg matters
       less than a 2.6σ drift on one worth four tonnes. */
    return out.sort((a, b) => Math.abs(b.co2Impact) - Math.abs(a.co2Impact));
  }

  /** A readable sentence for one anomaly — used on the Insights screen. */
  function explain(a) {
    const dir = a.direction === "above" ? "above" : "below";
    const pct = Math.abs(a.deltaPct).toFixed(0);
    const causes = {
      "electricity:grid":  "an HVAC or chiller fault, equipment left running outside hours, or a misread meter",
      "electricity:dg_set":"extended grid outages, or a generator running when the grid was available",
      "water:supply":      "a leak in the distribution loop, or a cooling-tower bleed set too high",
      "waste:landfill":    "a one-off clear-out, or segregation breaking down at the bins",
      "transport:flight_dom":   "an unusual travel month — check whether the trips could be consolidated",
      "transport:car_petrol":   "fleet routing, or EV vehicles being left idle",
      "procurement:it_equipment":"a hardware refresh cycle landing in one month"
    };
    const key = `${a.factor.cat}:${a.factor.code}`;
    const cause = causes[key] || "a data-entry error or a genuine one-off event";
    return `${a.factor.label} ran ${pct}% ${dir} its own trailing average `
         + `(${a.observed.toFixed(0)} vs ${a.expected.toFixed(0)} ${a.factor.unit}, ${Math.abs(a.z).toFixed(1)}σ). `
         + `Typical causes: ${cause}.`;
  }

  /* ═════════════════════ 2 · FORECAST ════════════════════════════════ */

  /**
   * Project the monthly net position forward.
   * `history` is [{month, net}] oldest first; returns the fitted line,
   * the projection and a ±1.96σ prediction band.
   */
  function forecast(history, aheadMonths = 6) {
    const points = history.map((h, i) => ({ x: i, y: h.net }));
    const fit = linreg(points);
    const band = 1.96 * fit.residualSd;

    const projection = [];
    for (let i = 0; i < aheadMonths; i++) {
      const x = history.length + i;
      const value = fit.slope * x + fit.intercept;
      // Uncertainty widens the further out the projection runs.
      const widen = band * Math.sqrt(1 + (i + 1) / Math.max(1, history.length));
      projection.push({
        month: shiftMonth(history[history.length - 1].month, i + 1),
        net: value,
        lower: value - widen,
        upper: value + widen
      });
    }

    const annualNow = mean(history.slice(-3).map(h => h.net)) * 12;
    const annualThen = (fit.slope * (history.length + 11) + fit.intercept) * 12;

    return {
      fit, projection,
      trendPerMonth: fit.slope,
      trendPerYearPct: annualNow ? (100 * (annualThen - annualNow)) / Math.abs(annualNow) : 0,
      confidence: fit.r2,
      annualRunRate: annualNow
    };
  }

  function shiftMonth(key, delta) {
    const [y, m] = key.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${V.pad(d.getMonth() + 1)}`;
  }

  /* ═════════════════════ 3 · CARBON BUDGET ═══════════════════════════ */

  /**
   * SBTi-shaped budget.
   *
   * A baseline annual figure and a target (a percentage reduction by a
   * target year) define a straight glide path. The area under that path
   * between now and the target year is the carbon the organisation may
   * still emit and remain on track. Spending faster than the path eats
   * the budget early — the exhaustion date is where cumulative actual
   * emissions cross the cumulative allowance.
   */
  function carbonBudget(history, opts = {}) {
    const {
      baselineAnnualKg = null,
      reductionPct = 42,        // SBTi 1.5 °C aligned: −42% by 2030
      targetYear = 2030,
      today = new Date()
    } = opts;

    const baseline = baselineAnnualKg != null
      ? baselineAnnualKg
      : mean(history.slice(0, Math.min(12, history.length)).map(h => h.net)) * 12;

    const targetAnnual = baseline * (1 - reductionPct / 100);
    const startYear = today.getFullYear();
    const yearsLeft = Math.max(0.01, targetYear - (startYear + today.getMonth() / 12));

    const currentAnnual = mean(history.slice(-3).map(h => h.net)) * 12;

    // Trapezoid under the glide path from today's allowance to the target.
    const totalYears = targetYear - (startYear - Math.floor(history.length / 12));
    const progressed = Math.max(0, totalYears - yearsLeft);
    const allowanceNow = totalYears > 0
      ? baseline + ((targetAnnual - baseline) * progressed) / totalYears
      : targetAnnual;
    const remainingBudget = ((allowanceNow + targetAnnual) / 2) * yearsLeft;

    const spentPerYear = currentAnnual;
    const yearsToExhaust = spentPerYear > 0 ? remainingBudget / spentPerYear : Infinity;

    const exhaustDate = new Date(today);
    if (Number.isFinite(yearsToExhaust)) {
      exhaustDate.setMonth(exhaustDate.getMonth() + Math.round(yearsToExhaust * 12));
    }

    const onTrack = currentAnnual <= allowanceNow;
    const gap = currentAnnual - allowanceNow;

    return {
      baseline, targetAnnual, targetYear, reductionPct,
      currentAnnual, allowanceNow, remainingBudget,
      yearsLeft, yearsToExhaust,
      exhaustDate: Number.isFinite(yearsToExhaust) ? exhaustDate : null,
      exhaustsBeforeTarget: Number.isFinite(yearsToExhaust) && yearsToExhaust < yearsLeft,
      onTrack, gap,
      gapPct: allowanceNow ? (100 * gap) / allowanceNow : 0,
      // Fraction of the budget already consumed this calendar year.
      burnRatio: remainingBudget > 0 ? currentAnnual / (remainingBudget / yearsLeft) : Infinity,
      // The glide path itself, for plotting.
      path: buildPath(baseline, targetAnnual, startYear - Math.floor(history.length / 12), targetYear)
    };
  }

  function buildPath(baseline, target, fromYear, toYear) {
    const out = [];
    const span = Math.max(1, toYear - fromYear);
    for (let y = fromYear; y <= toYear; y++) {
      out.push({ year: y, allowance: baseline + ((target - baseline) * (y - fromYear)) / span });
    }
    return out;
  }

  /* ═════════════════════ human-scale translator ══════════════════════
     Every figure gets a second reading. These are the equivalences that
     make a tonnage mean something in a room full of people.            */

  const EQUIVALENTS = [
    { id:"trees",   label:"tree-years of sequestration", per:21,      verb:"absorbed by",
      note:"a mature tree sequesters ≈21 kg CO₂e a year" },
    { id:"flights", label:"Delhi–London flights (economy)", per:986,  verb:"equal to",
      note:"≈6,700 km at 0.147 kg CO₂e per passenger-km" },
    { id:"homes",   label:"Indian households for a year", per:1800,   verb:"the footprint of",
      note:"average urban Indian household electricity footprint" },
    { id:"cars",    label:"petrol cars driven for a year", per:2040,  verb:"equal to",
      note:"12,000 km a year at 0.17 kg CO₂e per km" },
    { id:"phones",  label:"smartphones charged", per:0.0082,          verb:"equal to",
      note:"≈8.2 g CO₂e per full charge on the Indian grid" }
  ];

  const translate = kg => EQUIVALENTS.map(e => ({
    ...e, value: kg / e.per
  }));

  window.VL.Analytics = {
    mean, stdev, linreg,
    detectAnomalies, explain,
    forecast, shiftMonth,
    carbonBudget, EQUIVALENTS, translate
  };
})();
