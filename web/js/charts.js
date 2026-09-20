/* ══════════════════════════════════════════════════════════════════════
   charts.js — every chart in the product, drawn by hand in SVG.

   No charting library. Two reasons that matter here: a library would be
   the largest dependency in the project for eight chart types, and every
   colour would have to be pushed into it on each theme change. Because
   these charts paint with `fill:var(--series-3)` rather than a hex
   value, changing the theme repaints every chart instantly with no
   re-render at all.

   Rules kept throughout:
     · one vertical scale per chart — never a second y-axis
     · colour follows the entity, never its rank
     · every axis label names a value the chart actually reaches
     · hit targets are transparent rects, always larger than the mark
     · nothing is drawn outside the viewBox
   ══════════════════════════════════════════════════════════════════════ */

window.VL = window.VL || {};

(() => {
  "use strict";
  const V = window.VL;
  const NS = "http://www.w3.org/2000/svg";

  const nf = (v, d = 0) =>
    Number(v).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const shortMonth = key => MON[+key.split("-")[1] - 1];

  /* ───────────────────────── primitives ─────────────────────────────── */

  function svg(host, viewBox) {
    host.innerHTML = "";
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", viewBox);
    s.setAttribute("preserveAspectRatio", "xMidYMid meet");
    s.setAttribute("role", "img");
    host.appendChild(s);
    return s;
  }

  function el(parent, tag, attrs = {}, text) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    parent.appendChild(n);
    return n;
  }

  const label = (parent, x, y, text, opts = {}) => el(parent, "text", {
    x, y,
    "text-anchor": opts.anchor || "middle",
    "font-size": opts.size || 10,
    "font-family": opts.mono === false ? "Inter Tight, sans-serif" : "JetBrains Mono, monospace",
    "font-weight": opts.weight || 400,
    style: `fill:var(${opts.color || "--text-3"})`
  }, text);

  function niceStep(max) {
    const raw = max / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const n = raw / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  }

  /** One tooltip per chart container, positioned from the pointer. */
  function tooltip(wrap) {
    let tip = wrap.querySelector(":scope > .tip");
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "tip";
      wrap.appendChild(tip);
    }
    return {
      show(html, ev, align) {
        tip.innerHTML = html;
        tip.style.opacity = "1";
        const r = wrap.getBoundingClientRect();
        const x = ev.clientX - r.left, y = ev.clientY - r.top;
        const w = tip.offsetWidth, h = tip.offsetHeight;
        const left = align === "right" ? x + 16 : x - w / 2;
        tip.style.left = Math.max(2, Math.min(r.width - w - 2, left)) + "px";
        tip.style.top = Math.max(2, y - h - 14) + "px";
      },
      hide() { tip.style.opacity = "0"; }
    };
  }

  const animate = (node, attr, to, delay = 0, dur = 550) => {
    if (reduced()) { node.setAttribute(attr, to); return; }
    setTimeout(() => {
      node.style.transition = `${attr} ${dur}ms cubic-bezier(.16,1,.3,1)`;
      node.setAttribute(attr, to);
    }, delay);
  };

  /* ══════════════════ 1 · SCORE DIAL ═════════════════════════════════
     A 230° instrument arc with a tick every five points, a value arc in
     the band colour and a needle. The numeral is always rendered beside
     it, so the colour band reinforces rather than carries the meaning. */

  function scoreDial(host, score, opts = {}) {
    const W = 260, H = 190, cx = 130, cy = 128, r = 92;
    const START = 205, SWEEP = 230;
    const s = svg(host, `0 0 ${W} ${H}`);
    s.setAttribute("aria-label", `Sustainability score ${score.toFixed(1)} out of 100`);

    const pt = (deg, rad) => {
      const a = (deg * Math.PI) / 180;
      return [cx + rad * Math.cos(a), cy - rad * Math.sin(a)];
    };
    const arcPath = (from, to, rad) => {
      const [x1, y1] = pt(from, rad), [x2, y2] = pt(to, rad);
      return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${rad} ${rad} 0 ${Math.abs(to - from) > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
    };
    const angle = frac => START - SWEEP * V.clamp01(frac);

    for (let i = 0; i <= 20; i++) {
      const major = i % 5 === 0;
      const deg = angle(i / 20);
      const [x1, y1] = pt(deg, r + 5);
      const [x2, y2] = pt(deg, r + (major ? 13 : 9));
      el(s, "line", { x1, y1, x2, y2, "stroke-width": major ? 1.5 : 1, "stroke-linecap": "round",
        style: `stroke:var(${major ? "--line-3" : "--line-2"})` });
      if (major) {
        const [lx, ly] = pt(deg, r + 24);
        label(s, lx, ly + 3.5, String(i * 5), { size: 9, color: "--text-4" });
      }
    }

    el(s, "path", { d: arcPath(START, START - SWEEP, r), fill: "none", "stroke-width": 9,
      "stroke-linecap": "round", style: "stroke:var(--surface-3)" });

    const band = V.bandVar(score);
    const value = el(s, "path", { d: arcPath(START, angle(0.001), r), fill: "none",
      "stroke-width": 9, "stroke-linecap": "round", style: `stroke:${band}` });

    const needle = el(s, "line", { x1: cx, y1: cy, x2: pt(START, r - 17)[0], y2: pt(START, r - 17)[1],
      "stroke-width": 2, "stroke-linecap": "round", style: "stroke:var(--text-1)" });
    el(s, "circle", { cx, cy, r: 5, style: "fill:var(--surface-4);stroke:var(--line-3)", "stroke-width": 1 });
    el(s, "circle", { cx, cy, r: 1.6, style: "fill:var(--text-1)" });

    const draw = f => {
      value.setAttribute("d", arcPath(START, angle(Math.max(0.001, f)), r));
      const [nx, ny] = pt(angle(f), r - 17);
      needle.setAttribute("x2", nx.toFixed(2));
      needle.setAttribute("y2", ny.toFixed(2));
    };

    const target = V.clamp01(score / 100);
    if (reduced() || opts.instant) { draw(target); return; }
    const t0 = performance.now();
    (function step(now) {
      const p = Math.min(1, (now - t0) / 900);
      draw(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  /* ══════════════════ 2 · TREND ══════════════════════════════════════
     Gross emissions rise above the zero line, avoided emissions hang
     below it, a tick marks the net. One scale in tonnes for all three,
     so the three series are directly comparable.                      */

  function trend(wrap, rows) {
    const host = wrap.querySelector(".chart-host") || wrap;
    const W = 900, H = 250, L = 46, R = 16, T = 20, B = 30;
    const plotW = W - L - R, plotH = H - T - B;
    const s = svg(host, `0 0 ${W} ${H}`);
    s.setAttribute("aria-label", "Monthly gross emissions above the axis, avoided emissions below, net position marked");
    const tip = tooltip(wrap);

    const maxG = Math.max(0.001, ...rows.map(r => r.gross));
    const maxA = Math.max(0.001, ...rows.map(r => r.avoided));
    const topPad = maxG * 1.16, botPad = maxA * 1.5;
    const span = topPad + botPad;
    const zeroY = T + plotH * (topPad / span);
    const yOf = v => zeroY - (v / span) * plotH;

    const step = plotW / rows.length;
    const bw = Math.min(34, step * 0.5);

    const tick = niceStep(topPad);
    for (let v = tick; v <= topPad; v += tick) {
      el(s, "line", { x1: L, x2: W - R, y1: yOf(v), y2: yOf(v), "stroke-width": 1, style: "stroke:var(--grid)" });
      label(s, L - 9, yOf(v) + 3.5, nf(v, tick < 1 ? 1 : 0), { anchor: "end", size: 9.5, color: "--text-4" });
    }
    label(s, L - 9, T - 6, "t CO₂e", { anchor: "end", size: 9, color: "--text-4" });
    el(s, "line", { x1: L, x2: W - R, y1: zeroY, y2: zeroY, "stroke-width": 1.5, style: "stroke:var(--line-3)" });
    label(s, L - 9, zeroY + 3.5, "0", { anchor: "end", size: 9.5 });

    rows.forEach((r, i) => {
      const x = L + i * step + (step - bw) / 2;
      const gTop = yOf(r.gross), aBot = yOf(-r.avoided);
      const gh = Math.max(1.5, zeroY - gTop - 1);
      const ah = Math.max(1.5, aBot - zeroY - 1);
      const last = i === rows.length - 1;

      const g = el(s, "rect", { x: x.toFixed(1), y: (zeroY - 1).toFixed(1), width: bw.toFixed(1),
        height: 0, rx: 2, style: "fill:var(--gross)" });
      const a = el(s, "rect", { x: x.toFixed(1), y: (zeroY + 1).toFixed(1), width: bw.toFixed(1),
        height: 0, rx: 2, style: "fill:var(--good)", opacity: .85 });

      animate(g, "y", gTop.toFixed(1), 35 * i); animate(g, "height", gh.toFixed(1), 35 * i);
      animate(a, "height", ah.toFixed(1), 35 * i);

      const ny = yOf(r.net);
      el(s, "line", { x1: x - 3, x2: x + bw + 3, y1: ny, y2: ny, "stroke-width": 5,
        "stroke-linecap": "round", style: "stroke:var(--surface-1)" });
      el(s, "line", { x1: x - 3, x2: x + bw + 3, y1: ny, y2: ny, "stroke-width": 2.5,
        "stroke-linecap": "round", style: "stroke:var(--accent)" });

      label(s, x + bw / 2, H - 11, shortMonth(r.month), { size: 9.5, color: last ? "--text-2" : "--text-4" });
      if (last) label(s, x + bw / 2, Math.min(ny, gTop) - 9, nf(r.net, 1),
        { size: 10.5, weight: 600, color: "--accent" });

      const hit = el(s, "rect", { class: "hit", x: L + i * step, y: T, width: step, height: plotH });
      hit.addEventListener("mousemove", ev => {
        g.style.fill = "var(--gross-hi)";
        tip.show(`<div class="t-hd">${shortMonth(r.month)} ${r.month.slice(2,4)}</div>
          <div class="t-row"><span>Issued</span><b>${nf(r.gross,2)} t</b></div>
          <div class="t-row"><span>Avoided</span><b style="color:var(--good)">${nf(r.avoided,2)} t</b></div>
          <div class="t-row"><span>Net</span><b style="color:var(--accent)">${nf(r.net,2)} t</b></div>`, ev);
      });
      hit.addEventListener("mouseleave", () => { g.style.fill = "var(--gross)"; tip.hide(); });
    });
  }

  /* ══════════════════ 3 · CATEGORY BARS ══════════════════════════════ */

  function categoryBars(wrap, rows, total) {
    const host = wrap.querySelector(".chart-host") || wrap;
    const W = 560, rowH = 30, L = 112, R = 76, T = 4;
    const H = T + rows.length * rowH + 4;
    const plotW = W - L - R;
    const s = svg(host, `0 0 ${W} ${H}`);
    s.setAttribute("aria-label", "Gross emissions by category");
    const tip = tooltip(wrap);
    const max = Math.max(0.001, ...rows.map(r => r.value));

    rows.forEach((r, i) => {
      const y = T + i * rowH;
      const bw = Math.max(2, (r.value / max) * plotW);
      label(s, L - 11, y + 17, r.name, { anchor: "end", size: 11.5, mono: false, color: "--text-2" });
      el(s, "rect", { x: L, y: y + 6, width: plotW, height: 14, rx: 2, style: "fill:var(--surface-3)" });
      const bar = el(s, "rect", { x: L, y: y + 6, width: 0, height: 14, rx: 2, style: `fill:${r.color}` });
      animate(bar, "width", bw.toFixed(1), 28 * i);
      label(s, L + bw + 9, y + 17, `${nf(r.value / 1000, r.value >= 10000 ? 1 : 2)} t`,
        { anchor: "start", size: 10.5, color: "--text-1" });
      label(s, W - 2, y + 17, `${nf((100 * r.value) / (total || 1), 0)}%`,
        { anchor: "end", size: 10, color: "--text-4" });

      const hit = el(s, "rect", { class: "hit", x: 0, y, width: W, height: rowH });
      hit.addEventListener("mousemove", ev => {
        bar.style.filter = "brightness(1.2)";
        tip.show(`<div class="t-hd">${r.name}</div>
          <div class="t-row"><span>Issued</span><b>${nf(r.value/1000,2)} t</b></div>
          <div class="t-row"><span>Share</span><b>${nf(100*r.value/(total||1),1)}%</b></div>
          ${r.count != null ? `<div class="t-row"><span>Entries</span><b>${r.count}</b></div>` : ""}`, ev, "right");
      });
      hit.addEventListener("mouseleave", () => { bar.style.filter = ""; tip.hide(); });
    });
  }

  /* ══════════════════ 4 · SPARKLINE ══════════════════════════════════ */

  function sparkline(host, values, color = "var(--text-3)") {
    const W = 78, H = 26, P = 2;
    const s = svg(host, `0 0 ${W} ${H}`);
    if (values.length < 2) return;
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const x = i => P + (i / (values.length - 1)) * (W - P * 2);
    const y = v => H - P - ((v - min) / span) * (H - P * 2);
    const d = values.map((v, i) => `${i ? "L" : "M"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
    el(s, "path", { d: `${d} L ${x(values.length-1).toFixed(1)} ${H} L ${x(0).toFixed(1)} ${H} Z`,
      style: `fill:${color}`, opacity: .13 });
    el(s, "path", { d, fill: "none", style: `stroke:${color}`, "stroke-width": 1.5,
      "stroke-linejoin": "round", "stroke-linecap": "round" });
    el(s, "circle", { cx: x(values.length - 1), cy: y(values[values.length - 1]), r: 2.2,
      style: `fill:${color}` });
  }

  /* ══════════════════ 5 · FORECAST ═══════════════════════════════════
     History as a solid line, projection dashed, prediction interval as
     a shaded band. The band is the honest part: it says how much the
     projection should be trusted.                                     */

  function forecastLine(wrap, history, projection) {
    const host = wrap.querySelector(".chart-host") || wrap;
    const W = 900, H = 260, L = 48, R = 18, T = 22, B = 34;
    const plotW = W - L - R, plotH = H - T - B;
    const s = svg(host, `0 0 ${W} ${H}`);
    s.setAttribute("aria-label", "Net emissions history and projection with a 95% prediction interval");
    const tip = tooltip(wrap);

    const all = [...history.map(h => h.net), ...projection.map(p => p.upper), ...projection.map(p => p.lower)];
    const max = Math.max(...all) * 1.1;
    const min = Math.min(0, ...all);
    const span = max - min || 1;
    const n = history.length + projection.length;
    const x = i => L + (i / (n - 1)) * plotW;
    const y = v => T + plotH - ((v - min) / span) * plotH;

    const tick = niceStep(max);
    for (let v = Math.ceil(min / tick) * tick; v <= max; v += tick) {
      el(s, "line", { x1: L, x2: W - R, y1: y(v), y2: y(v), "stroke-width": 1, style: "stroke:var(--grid)" });
      label(s, L - 9, y(v) + 3.5, nf(v / 1000, 1), { anchor: "end", size: 9.5, color: "--text-4" });
    }
    label(s, L - 9, T - 7, "t CO₂e", { anchor: "end", size: 9, color: "--text-4" });

    // prediction band
    const bandTop = projection.map((p, i) => `${i ? "L" : "M"} ${x(history.length + i).toFixed(1)} ${y(p.upper).toFixed(1)}`).join(" ");
    const bandBot = projection.slice().reverse()
      .map((p, i) => `L ${x(n - 1 - i).toFixed(1)} ${y(p.lower).toFixed(1)}`).join(" ");
    const anchor = `M ${x(history.length - 1).toFixed(1)} ${y(history[history.length-1].net).toFixed(1)} `;
    el(s, "path", { d: anchor + bandTop.slice(1) + " " + bandBot + " Z",
      style: "fill:var(--accent)", opacity: .12 });

    // history
    const hist = history.map((h, i) => `${i ? "L" : "M"} ${x(i).toFixed(1)} ${y(h.net).toFixed(1)}`).join(" ");
    el(s, "path", { d: hist, fill: "none", style: "stroke:var(--text-2)", "stroke-width": 2,
      "stroke-linejoin": "round", "stroke-linecap": "round" });

    // projection
    const proj = `M ${x(history.length-1).toFixed(1)} ${y(history[history.length-1].net).toFixed(1)} ` +
      projection.map((p, i) => `L ${x(history.length + i).toFixed(1)} ${y(p.net).toFixed(1)}`).join(" ");
    el(s, "path", { d: proj, fill: "none", style: "stroke:var(--accent)", "stroke-width": 2,
      "stroke-dasharray": "5 4", "stroke-linecap": "round" });

    // divider between measured and modelled
    const divX = x(history.length - 1);
    el(s, "line", { x1: divX, x2: divX, y1: T, y2: T + plotH, "stroke-width": 1,
      "stroke-dasharray": "3 3", style: "stroke:var(--line-3)" });
    label(s, divX + 6, T + 10, "PROJECTED", { anchor: "start", size: 8.5, color: "--text-4" });

    const series = [...history.map(h => ({ ...h, kind: "actual" })),
                    ...projection.map(p => ({ ...p, kind: "projected" }))];
    series.forEach((p, i) => {
      if (p.kind === "actual") el(s, "circle", { cx: x(i), cy: y(p.net), r: 2.6, style: "fill:var(--text-2)" });
      if (i % 2 === 0 || i === n - 1) label(s, x(i), H - 12, shortMonth(p.month), { size: 9, color: "--text-4" });
      const hit = el(s, "rect", { class: "hit", x: x(i) - plotW / (n * 2), y: T, width: plotW / n, height: plotH });
      hit.addEventListener("mousemove", ev => tip.show(
        `<div class="t-hd">${shortMonth(p.month)} ${p.month.slice(2,4)} · ${p.kind}</div>
         <div class="t-row"><span>Net</span><b>${nf(p.net/1000,2)} t</b></div>
         ${p.kind === "projected" ? `<div class="t-row"><span>Range</span><b>${nf(p.lower/1000,1)}–${nf(p.upper/1000,1)} t</b></div>` : ""}`, ev));
      hit.addEventListener("mouseleave", tip.hide);
    });
  }

  /* ══════════════════ 6 · BUDGET GLIDE PATH ══════════════════════════ */

  function budgetPath(wrap, path, actualAnnual, currentYear) {
    const host = wrap.querySelector(".chart-host") || wrap;
    const W = 900, H = 230, L = 48, R = 18, T = 20, B = 30;
    const plotW = W - L - R, plotH = H - T - B;
    const s = svg(host, `0 0 ${W} ${H}`);
    s.setAttribute("aria-label", "Allowed emissions glide path against the current run rate");
    const tip = tooltip(wrap);

    const max = Math.max(actualAnnual, ...path.map(p => p.allowance)) * 1.15;
    const x = i => L + (i / (path.length - 1)) * plotW;
    const y = v => T + plotH - (v / max) * plotH;

    const tick = niceStep(max);
    for (let v = tick; v <= max; v += tick) {
      el(s, "line", { x1: L, x2: W - R, y1: y(v), y2: y(v), "stroke-width": 1, style: "stroke:var(--grid)" });
      label(s, L - 9, y(v) + 3.5, nf(v / 1000, 0), { anchor: "end", size: 9.5, color: "--text-4" });
    }
    label(s, L - 9, T - 6, "t CO₂e / yr", { anchor: "end", size: 9, color: "--text-4" });

    // allowed area under the path
    const line = path.map((p, i) => `${i ? "L" : "M"} ${x(i).toFixed(1)} ${y(p.allowance).toFixed(1)}`).join(" ");
    el(s, "path", { d: `${line} L ${x(path.length-1).toFixed(1)} ${T+plotH} L ${L} ${T+plotH} Z`,
      style: "fill:var(--good)", opacity: .10 });
    el(s, "path", { d: line, fill: "none", style: "stroke:var(--good)", "stroke-width": 2,
      "stroke-linecap": "round" });

    // current run rate as a flat line — the gap to the path is the story
    el(s, "line", { x1: L, x2: W - R, y1: y(actualAnnual), y2: y(actualAnnual),
      "stroke-width": 2, "stroke-dasharray": "6 4", style: "stroke:var(--bad)" });
    label(s, W - R - 4, y(actualAnnual) - 8, `CURRENT RUN RATE ${nf(actualAnnual/1000,0)} t`,
      { anchor: "end", size: 9.5, color: "--bad", weight: 600 });

    path.forEach((p, i) => {
      const isNow = p.year === currentYear;
      if (isNow) {
        el(s, "line", { x1: x(i), x2: x(i), y1: T, y2: T + plotH, "stroke-width": 1,
          "stroke-dasharray": "3 3", style: "stroke:var(--accent)" });
        el(s, "circle", { cx: x(i), cy: y(p.allowance), r: 4, style: "fill:var(--accent)" });
      }
      label(s, x(i), H - 11, String(p.year), { size: 9.5, color: isNow ? "--accent" : "--text-4" });
      const hit = el(s, "rect", { class: "hit", x: x(i) - plotW / (path.length * 2), y: T,
        width: plotW / path.length, height: plotH });
      hit.addEventListener("mousemove", ev => tip.show(
        `<div class="t-hd">${p.year}</div>
         <div class="t-row"><span>Allowed</span><b style="color:var(--good)">${nf(p.allowance/1000,1)} t</b></div>
         <div class="t-row"><span>At current rate</span><b style="color:var(--bad)">${nf(actualAnnual/1000,1)} t</b></div>`, ev));
      hit.addEventListener("mouseleave", tip.hide);
    });
  }

  /* ══════════════════ 7 · WATERFALL ══════════════════════════════════
     Where a simulated saving comes from, lever by lever, ending at the
     simulated net. Overlap between levers is shown as its own bar
     rather than hidden.                                               */

  function waterfall(wrap, steps) {
    const host = wrap.querySelector(".chart-host") || wrap;
    const W = 900, H = 250, L = 48, R = 18, T = 22, B = 56;
    const plotW = W - L - R, plotH = H - T - B;
    const s = svg(host, `0 0 ${W} ${H}`);
    s.setAttribute("aria-label", "Contribution of each intervention to the simulated saving");
    const tip = tooltip(wrap);

    let running = steps[0].value;
    const levels = [0];
    for (let i = 1; i < steps.length - 1; i++) { levels.push(running); running += steps[i].value; }
    levels.push(0);

    const peak = Math.max(steps[0].value, running, ...levels.map((l, i) => l + (steps[i]?.value || 0)));
    const max = peak * 1.15;
    const step = plotW / steps.length;
    const bw = Math.min(58, step * 0.6);
    const y = v => T + plotH - (v / max) * plotH;

    const tick = niceStep(max);
    for (let v = tick; v <= max; v += tick) {
      el(s, "line", { x1: L, x2: W - R, y1: y(v), y2: y(v), "stroke-width": 1, style: "stroke:var(--grid)" });
      label(s, L - 9, y(v) + 3.5, nf(v / 1000, 0), { anchor: "end", size: 9.5, color: "--text-4" });
    }
    el(s, "line", { x1: L, x2: W - R, y1: y(0), y2: y(0), "stroke-width": 1.5, style: "stroke:var(--line-3)" });

    steps.forEach((st, i) => {
      const x = L + i * step + (step - bw) / 2;
      const isTotal = st.type === "total";
      const base = isTotal ? 0 : levels[i];
      const top = isTotal ? st.value : base + st.value;
      const yTop = y(Math.max(base, top)), h = Math.max(2, Math.abs(y(base) - y(top)));

      const colour = isTotal ? (i === 0 ? "var(--gross)" : "var(--accent)")
        : st.value < 0 ? "var(--good)" : "var(--bad)";

      const rect = el(s, "rect", { x: x.toFixed(1), y: y(base).toFixed(1), width: bw.toFixed(1),
        height: 0, rx: 3, style: `fill:${colour}` });
      animate(rect, "y", yTop.toFixed(1), 45 * i);
      animate(rect, "height", h.toFixed(1), 45 * i);

      if (!isTotal && i < steps.length - 1) {
        el(s, "line", { x1: x + bw, x2: L + (i + 1) * step + (step - bw) / 2,
          y1: y(top), y2: y(top), "stroke-width": 1, "stroke-dasharray": "2 3",
          style: "stroke:var(--line-3)" });
      }

      label(s, x + bw / 2, yTop - 7, `${st.value < 0 ? "−" : ""}${nf(Math.abs(st.value)/1000, 1)}`,
        { size: 10, weight: 600, color: isTotal ? "--text-1" : (st.value < 0 ? "--good" : "--bad") });

      // wrapped two-line caption
      const words = st.label.split(" ");
      const mid = Math.ceil(words.length / 2);
      label(s, x + bw / 2, H - 30, words.slice(0, mid).join(" "), { size: 9, mono: false, color: "--text-3" });
      if (words.length > 1) label(s, x + bw / 2, H - 19, words.slice(mid).join(" "), { size: 9, mono: false, color: "--text-3" });

      const hit = el(s, "rect", { class: "hit", x: L + i * step, y: T, width: step, height: plotH });
      hit.addEventListener("mousemove", ev => tip.show(
        `<div class="t-hd">${st.label}</div>
         <div class="t-row"><span>${isTotal ? "Net" : "Change"}</span><b>${nf(st.value/1000,2)} t</b></div>
         ${st.note ? `<div class="t-row" style="color:var(--text-3)">${st.note}</div>` : ""}`, ev));
      hit.addEventListener("mouseleave", tip.hide);
    });
  }

  /* ══════════════════ 8 · HEATMAP ════════════════════════════════════
     Month × category intensity. One hue, light→dark: a sequential scale
     for a magnitude, never a rainbow.                                  */

  function heatmap(wrap, months, categories, valueAt) {
    const host = wrap.querySelector(".chart-host") || wrap;
    const cellW = 54, cellH = 30, L = 116, T = 26;
    const W = L + months.length * cellW + 12;
    const H = T + categories.length * cellH + 12;
    const s = svg(host, `0 0 ${W} ${H}`);
    s.setAttribute("aria-label", "Emissions intensity by category and month");
    const tip = tooltip(wrap);

    let max = 0;
    categories.forEach(c => months.forEach(m => { max = Math.max(max, Math.abs(valueAt(c.id, m))); }));

    months.forEach((m, j) => label(s, L + j * cellW + cellW / 2, T - 9, shortMonth(m),
      { size: 9, color: "--text-4" }));

    categories.forEach((c, i) => {
      label(s, L - 10, T + i * cellH + cellH / 2 + 4, c.name,
        { anchor: "end", size: 11, mono: false, color: "--text-2" });
      months.forEach((m, j) => {
        const v = Math.abs(valueAt(c.id, m));
        const t = max ? v / max : 0;
        const cell = el(s, "rect", {
          x: L + j * cellW + 1, y: T + i * cellH + 1,
          width: cellW - 3, height: cellH - 3, rx: 2,
          style: `fill:${c.color}`, opacity: 0
        });
        animate(cell, "opacity", (0.08 + t * 0.92).toFixed(3), 12 * (i * months.length + j), 420);
        if (t > 0.55) label(s, L + j * cellW + cellW / 2, T + i * cellH + cellH / 2 + 3.5,
          nf(v / 1000, 1), { size: 9, color: "--bg", weight: 600 });

        const hit = el(s, "rect", { class: "hit", x: L + j * cellW, y: T + i * cellH,
          width: cellW, height: cellH });
        hit.addEventListener("mousemove", ev => tip.show(
          `<div class="t-hd">${c.name} · ${shortMonth(m)} ${m.slice(2,4)}</div>
           <div class="t-row"><span>Emissions</span><b>${nf(v/1000,2)} t</b></div>
           <div class="t-row"><span>Of period max</span><b>${nf(t*100,0)}%</b></div>`, ev, "right"));
        hit.addEventListener("mouseleave", tip.hide);
      });
    });
  }

  /* ══════════════════ 9 · DONUT ══════════════════════════════════════ */

  function donut(host, slices, centreLabel, centreValue) {
    const W = 200, H = 200, cx = 100, cy = 100, r = 74, thick = 20;
    const s = svg(host, `0 0 ${W} ${H}`);
    const total = slices.reduce((t, x) => t + Math.max(0, x.value), 0) || 1;
    let angle = -90;

    slices.forEach((sl, i) => {
      const frac = Math.max(0, sl.value) / total;
      const sweep = frac * 360;
      if (sweep <= 0.2) { angle += sweep; return; }
      const a0 = (angle * Math.PI) / 180, a1 = ((angle + sweep) * Math.PI) / 180;
      const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      el(s, "path", {
        d: `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`,
        fill: "none", style: `stroke:${sl.color}`, "stroke-width": thick,
        "stroke-linecap": "butt", opacity: reduced() ? 1 : 0
      });
      if (!reduced()) {
        const path = s.lastChild;
        setTimeout(() => { path.style.transition = "opacity 380ms"; path.setAttribute("opacity", 1); }, 80 * i);
      }
      angle += sweep;
    });

    label(s, cx, cy - 2, centreValue, { size: 22, weight: 600, color: "--text-1" });
    label(s, cx, cy + 16, centreLabel, { size: 9, color: "--text-3" });
  }

  window.VL.Charts = {
    scoreDial, trend, categoryBars, sparkline,
    forecastLine, budgetPath, waterfall, heatmap, donut,
    nf, shortMonth, tooltip, svg, el, label, niceStep
  };
})();
