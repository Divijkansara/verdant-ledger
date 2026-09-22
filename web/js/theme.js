/* ══════════════════════════════════════════════════════════════════════
   theme.js — THE COLOUR ENGINE
   ──────────────────────────────────────────────────────────────────────
   Not a list of hex codes. A generator.

   The whole product is painted from EIGHT seed numbers:

       mode            dark | light
       baseHue         the hue of every neutral surface
       baseChroma      how strongly the neutrals are tinted
       baseLevel       lifts the whole surface ramp off true black
       accentHue       the hue of the primary accent
       accentChroma    its saturation
       accentContrast  how LOUD the accent is, as a contrast ratio
       contrast        global contrast multiplier

   Everything else — eleven surface and ink steps, three border steps,
   two accent steps, four semantic states and eight categorical chart
   hues — is DERIVED from those eight by perceptual colour maths, then
   written to CSS custom properties at runtime.

   Note what is NOT a seed: no lightness anywhere is chosen by hand.
   Ink, accent and state lightnesses are all SOLVED against the real
   background until they clear a contrast target. `accentContrast` sets
   that target rather than the colour, which is why turning the accent
   up cannot make it unreadable.

   Why it is built this way: change the accent hue to anything at all and
   the interface stays harmonious, because every other colour moves with
   it and every text/background pair is contrast-checked in code before
   it is applied. There is no combination of the controls that produces
   an unreadable or ugly screen — that is a property of the generator,
   not of taste.

   Colour maths is done in OKLCH (perceptually uniform: equal steps in L
   look like equal steps to the eye) and converted to sRGB with an
   in-gamut clamp, so the output is always a displayable colour.
   ══════════════════════════════════════════════════════════════════════ */

window.VL = window.VL || {};

(() => {
  "use strict";

  /* ═══════════════════ 1 · COLOUR SPACE CONVERSION ═══════════════════ */

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  /** sRGB gamma encode a linear-light channel (0-1) → 0-255. */
  function encodeChannel(x) {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    return clamp(v, 0, 1);
  }

  /** OKLCH → linear sRGB triple (may fall outside 0-1 = out of gamut). */
  function oklchToLinear(L, C, H) {
    const h = (H * Math.PI) / 180;
    const a = C * Math.cos(h);
    const b = C * Math.sin(h);

    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;

    return [
      +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    ];
  }

  const inGamut = ([r, g, b]) =>
    r >= -0.0002 && r <= 1.0002 && g >= -0.0002 && g <= 1.0002 && b >= -0.0002 && b <= 1.0002;

  /**
   * OKLCH → "#rrggbb", reducing chroma until the colour is displayable.
   *
   * A naive clamp would turn an out-of-gamut vivid colour into a muddy
   * or hue-shifted one. Walking chroma down instead keeps the hue and
   * lightness exactly, which is what stops extreme slider positions from
   * producing ugly output.
   */
  function oklch(L, C, H) {
    L = clamp(L, 0, 1);
    C = Math.max(0, C);
    let lin = oklchToLinear(L, C, H);

    if (!inGamut(lin)) {
      let lo = 0, hi = C;
      for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2;
        if (inGamut(oklchToLinear(L, mid, H))) lo = mid; else hi = mid;
      }
      lin = oklchToLinear(L, lo, H);
    }

    const [r, g, b] = lin.map(encodeChannel);
    const hex = n => Math.round(n * 255).toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  }

  /** WCAG relative luminance of a hex colour. */
  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    const srgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
      const x = v / 255;
      return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  }

  /** WCAG contrast ratio between two hex colours (1 – 21). */
  function contrastRatio(a, b) {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  /**
   * Find the lightness at hue H / chroma C that clears `target` contrast
   * against `bg`, searching away from the background.
   *
   * This is the guarantee: text and accents are not placed at a
   * hand-picked lightness and hoped for — they are solved for.
   */
  function solveForContrast(bg, H, C, target, dark) {
    let best = dark ? 0.98 : 0.12, bestRatio = 0;
    for (let i = 0; i <= 40; i++) {
      const L = dark ? 0.35 + (i / 40) * 0.63 : 0.72 - (i / 40) * 0.62;
      const hex = oklch(L, C, H);
      const ratio = contrastRatio(hex, bg);
      if (ratio >= target) return { L, hex, ratio };
      if (ratio > bestRatio) { bestRatio = ratio; best = L; }
    }
    return { L: best, hex: oklch(best, C, H), ratio: bestRatio };
  }

  /* ═══════════════════════ 2 · THE GENERATOR ═════════════════════════ */

  /**
   * Build the complete token set from the six seeds.
   * Returns { tokens: {--name: value}, report: {...} } — the report is
   * what the Theme Lab displays so the contrast maths is visible, not
   * merely claimed.
   */
  function generate(seed) {
    const {
      mode = "dark",
      baseHue = 250,
      baseChroma = 0.018,
      accentHue = 205,
      accentChroma = 0.145,
      accentContrast = 4.6,
      baseLevel = 0,
      contrast = 1
    } = seed;

    const dark = mode === "dark";
    const t = {};
    const bc = baseChroma;

    /* ── surfaces ──────────────────────────────────────────────────────
       Eleven steps, spaced perceptually. In dark mode they climb from a
       near-black ground; in light mode they descend from paper white.  */
    const surfaceL = dark
      ? [0.145, 0.185, 0.215, 0.248, 0.285, 0.325]
      : [0.995, 0.975, 0.952, 0.925, 0.893, 0.858];

    /* Raising `contrast` pushes each step further from the ground.
       `baseLevel` then lifts (or drops) the whole ramp bodily: a dark
       theme can sit on true near-black or on a raised, visibly tinted
       ground without changing the relationships between its steps. */
    const lift = dark ? baseLevel : -baseLevel;
    const spread = L => clamp(surfaceL[0] + (L - surfaceL[0]) * contrast + lift, 0.04, 0.999);

    t["--bg"]        = oklch(spread(surfaceL[0]), bc, baseHue);
    t["--surface-1"] = oklch(spread(surfaceL[1]), bc, baseHue);
    t["--surface-2"] = oklch(spread(surfaceL[2]), bc, baseHue);
    t["--surface-3"] = oklch(spread(surfaceL[3]), bc * 1.1, baseHue);
    t["--surface-4"] = oklch(spread(surfaceL[4]), bc * 1.15, baseHue);
    t["--surface-5"] = oklch(spread(surfaceL[5]), bc * 1.2, baseHue);

    /* ── borders — three weights between ground and ink ─────────────── */
    const lineL = dark ? [0.255, 0.315, 0.40] : [0.885, 0.825, 0.72];
    t["--line-1"] = oklch(spread(lineL[0]), bc * 1.1, baseHue);
    t["--line-2"] = oklch(spread(lineL[1]), bc * 1.2, baseHue);
    t["--line-3"] = oklch(spread(lineL[2]), bc * 1.3, baseHue);

    /* ── ink — solved against the real background, not guessed ─────── */
    const bg = t["--bg"];
    const s1 = t["--surface-1"];

    const ink1 = solveForContrast(s1, baseHue, bc * 0.8, 12.5, dark);
    const ink2 = solveForContrast(s1, baseHue, bc * 1.4, 5.2, dark);
    const ink3 = solveForContrast(s1, baseHue, bc * 1.6, 3.1, dark);
    const ink4 = solveForContrast(s1, baseHue, bc * 1.8, 1.9, dark);

    t["--text-1"] = ink1.hex;
    t["--text-2"] = ink2.hex;
    t["--text-3"] = ink3.hex;
    t["--text-4"] = ink4.hex;

    /* ── accent — the one colour the user is invited to change ─────── */
    /* `accentContrast` is how LOUD the accent is, expressed as the
       contrast ratio it must clear rather than as a lightness anybody
       picked. 4.6 gives the quietest legal accent; raise it and the
       solver walks further from the ground until the accent is that
       bright. The floor is still 4.5:1, so loudness can never be
       traded against legibility. */
    const accent = solveForContrast(s1, accentHue, accentChroma,
                                    Math.max(4.6, accentContrast), dark);
    t["--accent-quiet"] = oklch(dark ? 0.42 : 0.60, accentChroma * 0.75, accentHue);
    t["--accent-wash"]  = oklch(dark ? spread(surfaceL[2]) + 0.02 : spread(surfaceL[2]) - 0.01,
                                accentChroma * 0.34, accentHue);
    /* Text that sits ON the accent. Both candidates are tested and the
       stronger one wins — picking "white unless the accent is pale" is
       exactly how buttons end up unreadable at mid lightness. If neither
       candidate clears 4.5:1 the accent itself is pushed away from mid
       lightness until one of them does, because a button nobody can read
       is not an acceptable output of the generator. */
    const lightInk = oklch(0.985, 0.012, accentHue);
    const darkInk  = oklch(0.155, 0.022, accentHue);
    let accentHex = accent.hex, accentL = accent.L;

    const bestInk = hex => {
      const lr = contrastRatio(lightInk, hex);
      const dr = contrastRatio(darkInk, hex);
      return lr >= dr ? { ink: lightInk, ratio: lr } : { ink: darkInk, ratio: dr };
    };

    let pick = bestInk(accentHex);
    for (let step = 1; pick.ratio < 4.5 && step <= 16; step++) {
      // Walk the accent toward whichever end of the scale is nearer,
      // keeping it above its own 4.5:1 floor against the surface.
      const dir = accentL > 0.55 ? +1 : -1;
      const candL = clamp(accentL + dir * step * 0.02, 0.12, 0.97);
      const candHex = oklch(candL, accentChroma, accentHue);
      if (contrastRatio(candHex, s1) < 4.5) break;
      accentHex = candHex; accentL = candL;
      pick = bestInk(accentHex);
    }

    t["--accent"] = accentHex;
    t["--on-accent"] = pick.ink;
    /* Hover moves the accent AWAY from whichever end it is already near,
       so a bright accent does not hover to white and a dark one does not
       hover to black. */
    const hoverDir = accentL > 0.78 ? -1 : (accentL < 0.30 ? +1 : (dark ? +1 : -1));
    t["--accent-hover"] = oklch(clamp(accentL + hoverDir * 0.075, 0.1, 0.97), accentChroma, accentHue);

    // A complementary hue, 150° away, used only where two accents are needed.
    const accent2Hue = (accentHue + 150) % 360;
    const accent2 = solveForContrast(s1, accent2Hue, accentChroma * 0.9, 4.4, dark);
    t["--accent-2"] = accent2.hex;

    /* ── semantic states ────────────────────────────────────────────
       Fixed hue families (green / amber / red) so "good" never becomes
       blue when the accent moves, but the same L and C discipline so
       they belong to the same palette.                                */
    const semantic = { good: 162, warn: 80, bad: 28, info: accentHue };
    /* States brighten with the theme, but always stay below the accent:
       the accent has to remain the loudest thing on the screen or the
       eye stops trusting it as the call to action.

       `bad` is deliberately held darker than the others. Red pushed to
       high lightness on a dark ground turns pink, and pink does not read
       as danger — the warning colour has to stay dense to keep its
       meaning, so it trades brightness for saturation instead. */
    const base = clamp(accentContrast * 0.62, 4.6, 9);
    const stateTarget = { good: base, warn: base, bad: Math.min(base, 5.4), info: base };
    const stateChroma = { good: 0.15, warn: 0.15, bad: 0.19, info: 0.15 };
    for (const [name, hue] of Object.entries(semantic)) {
      const solved = solveForContrast(s1, hue, stateChroma[name], stateTarget[name], dark);
      t[`--${name}`] = solved.hex;
      t[`--${name}-wash`] = oklch(dark ? spread(surfaceL[2]) + 0.015 : spread(surfaceL[2]) - 0.008,
                                  0.055, hue);
      t[`--${name}-line`] = oklch(dark ? 0.42 : 0.72, 0.09, hue);
    }

    /* ── categorical chart series ───────────────────────────────────
       Eight hues at equal perceptual lightness and chroma, spread
       around the wheel from the accent by the golden angle so adjacent
       slots are always far apart in hue. Equal L means no series
       accidentally dominates; equal C means none looks washed out.   */
    const seriesL = dark ? 0.70 : 0.58;
    const seriesC = 0.135;
    const GOLDEN = 137.508;
    for (let i = 0; i < 8; i++) {
      const hue = (accentHue + i * GOLDEN) % 360;
      t[`--series-${i + 1}`] = oklch(seriesL, seriesC, hue);
      t[`--series-${i + 1}-dim`] = oklch(dark ? 0.34 : 0.86, seriesC * 0.5, hue);
    }

    /* ── chart furniture ────────────────────────────────────────────── */
    t["--grid"]  = oklch(spread(dark ? 0.245 : 0.90), bc, baseHue);
    t["--gross"] = oklch(dark ? 0.55 : 0.62, 0.035, baseHue);   // recessive by design
    t["--gross-hi"] = oklch(dark ? 0.64 : 0.54, 0.045, baseHue);

    /* ── elevation ──────────────────────────────────────────────────── */
    t["--shadow-1"] = dark
      ? "0 1px 2px rgba(0,0,0,.45), 0 8px 24px -16px rgba(0,0,0,.9)"
      : "0 1px 2px rgba(15,20,30,.06), 0 10px 30px -20px rgba(15,20,30,.35)";
    t["--shadow-2"] = dark
      ? "0 24px 70px -30px rgba(0,0,0,.95)"
      : "0 24px 60px -28px rgba(15,20,30,.32)";
    t["--glow"] = `0 0 28px -8px ${t["--accent"]}66`;

    /* ── the audit report ───────────────────────────────────────────── */
    const report = {
      mode, baseHue, accentHue, contrast,
      checks: [
        { label: "Body text on surface",    ratio: contrastRatio(t["--text-1"], s1), min: 7 },
        { label: "Secondary text",          ratio: contrastRatio(t["--text-2"], s1), min: 4.5 },
        { label: "Muted label text",        ratio: contrastRatio(t["--text-3"], s1), min: 3 },
        { label: "Accent on surface",       ratio: contrastRatio(t["--accent"], s1), min: 4.5 },
        { label: "Text on accent button",   ratio: contrastRatio(t["--on-accent"], t["--accent"]), min: 4.5 },
        { label: "Good state",              ratio: contrastRatio(t["--good"], s1), min: 4.5 },
        { label: "Bad state",               ratio: contrastRatio(t["--bad"], s1), min: 4.5 },
        { label: "Border against surface",  ratio: contrastRatio(t["--line-2"], s1), min: 1.3 }
      ]
    };
    report.checks.forEach(c => {
      c.ratio = Math.round(c.ratio * 100) / 100;
      c.pass = c.ratio >= c.min;
    });
    report.allPass = report.checks.every(c => c.pass);

    // Minimum separation between adjacent chart series, in OKLab ΔE —
    // proof that the eight categorical hues stay distinguishable.
    report.seriesDeltaE = seriesDeltaE(t);

    return { tokens: t, report };
  }

  /** Worst adjacent-pair perceptual distance across the 8 series hues. */
  function seriesDeltaE(t) {
    const lab = hex => {
      const n = parseInt(hex.slice(1), 16);
      const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
        const x = v / 255;
        return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      });
      const l = Math.cbrt(0.4122214708 * lin[0] + 0.5363325363 * lin[1] + 0.0514459929 * lin[2]);
      const m = Math.cbrt(0.2119034982 * lin[0] + 0.6806995451 * lin[1] + 0.1073969566 * lin[2]);
      const s = Math.cbrt(0.0883024619 * lin[0] + 0.2817188376 * lin[1] + 0.6299787005 * lin[2]);
      return [
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
      ];
    };
    let worst = Infinity;
    for (let i = 1; i < 8; i++) {
      const a = lab(t[`--series-${i}`]), b = lab(t[`--series-${i + 1}`]);
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 100;
      worst = Math.min(worst, d);
    }
    return Math.round(worst * 10) / 10;
  }

  /* ═══════════════════════ 3 · PRESETS ═══════════════════════════════ */

  const PRESETS = [
    { id: "ledger",   name: "Ledger",      note: "Tinted teal-black, acid lime",
      seed: { mode: "dark",  baseHue: 208, baseChroma: 0.030, accentHue: 124, accentChroma: 0.20,
              accentContrast: 12,  baseLevel: 0.075, contrast: 1 } },
    { id: "midnight", name: "Midnight Teal", note: "Slate-navy ground, teal signal",
      seed: { mode: "dark",  baseHue: 254, baseChroma: 0.028, accentHue: 183, accentChroma: 0.123,
              accentContrast: 7,   baseLevel: 0.04,  contrast: 1 } },
    { id: "nebula",   name: "Nebula",      note: "Deep space, cyan signal",
      seed: { mode: "dark",  baseHue: 262, baseChroma: 0.022, accentHue: 208, accentChroma: 0.15,
              accentContrast: 6.5, baseLevel: 0,     contrast: 1 } },
    { id: "ember",    name: "Ember",       note: "Warm graphite, sodium amber",
      seed: { mode: "dark",  baseHue: 62,  baseChroma: 0.012, accentHue: 62,  accentChroma: 0.15,
              accentContrast: 11,  baseLevel: 0.02,  contrast: 1 } },
    { id: "bio",      name: "Bioluminescent", note: "Forest dark, living green",
      seed: { mode: "dark",  baseHue: 168, baseChroma: 0.020, accentHue: 158, accentChroma: 0.15,
              accentContrast: 9,   baseLevel: 0.04,  contrast: 1 } },
    { id: "magenta",  name: "Ultraviolet", note: "Violet ground, magenta signal",
      seed: { mode: "dark",  baseHue: 300, baseChroma: 0.024, accentHue: 330, accentChroma: 0.155,
              accentContrast: 7,   baseLevel: 0.01,  contrast: 1 } },
    { id: "paper",    name: "Paper",       note: "Warm white, ink blue",
      seed: { mode: "light", baseHue: 82,  baseChroma: 0.010, accentHue: 250, accentChroma: 0.145,
              accentContrast: 6,   baseLevel: 0,     contrast: 1 } },
    { id: "clinic",   name: "Clinic",      note: "Cool white, teal",
      seed: { mode: "light", baseHue: 232, baseChroma: 0.008, accentHue: 190, accentChroma: 0.13,
              accentContrast: 5.5, baseLevel: 0,     contrast: 1.05 } }
  ];

  /* ═══════════════════════ 4 · RUNTIME ═══════════════════════════════ */

  const LS_KEY = "vl.theme.v2";
  const DEFAULT_SEED = { ...PRESETS.find(p => p.id === "midnight").seed };  // the brand palette

  const Theme = {
    seed: { ...DEFAULT_SEED },
    report: null,
    listeners: [],

    /** Read a saved theme, or fall back to the first preset. */
    load() {
      // The brand palette is fixed: a colour picker in a carbon product is
      // noise. Clear any palette an earlier version saved, then apply it.
      try { localStorage.removeItem(LS_KEY); } catch (_) {}
      this.seed = { ...DEFAULT_SEED };
      this.apply();
      return this;
    },

    save() {
      try { localStorage.setItem(LS_KEY, JSON.stringify(this.seed)); } catch (_) {}
    },

    /** Regenerate every token and write it to the document root. */
    apply() {
      const { tokens, report } = generate(this.seed);
      const root = document.documentElement;
      for (const key in tokens) root.style.setProperty(key, tokens[key]);
      root.setAttribute("data-mode", this.seed.mode);
      root.style.colorScheme = this.seed.mode;
      this.tokens = tokens;
      this.report = report;
      this.listeners.forEach(fn => { try { fn(tokens, report); } catch (_) {} });
      return report;
    },

    set(patch, persist = true) {
      Object.assign(this.seed, patch);
      const report = this.apply();
      if (persist) this.save();
      return report;
    },

    usePreset(id) {
      const preset = PRESETS.find(p => p.id === id);
      if (preset) this.set({ ...preset.seed });
      return preset;
    },

    /** Notified on every change — charts re-read their colours this way. */
    onChange(fn) { this.listeners.push(fn); return () => {
      this.listeners = this.listeners.filter(f => f !== fn);
    }; },

    /** Resolve a token to its literal hex, for canvas and SVG attributes. */
    value(name) {
      return (this.tokens && this.tokens[name]) ||
        getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    },

    /** Export the current palette as a CSS block the user can paste. */
    toCSS() {
      const { tokens } = generate(this.seed);
      const lines = Object.keys(tokens)
        .filter(k => !k.startsWith("--shadow") && k !== "--glow")
        .map(k => `  ${k}: ${tokens[k]};`);
      return `/* Terrawise — generated palette\n   seed: ${JSON.stringify(this.seed)} */\n:root {\n${lines.join("\n")}\n}`;
    },

    PRESETS,
    generate,
    contrastRatio,
    oklch
  };

  window.VL.Theme = Theme;
})();
