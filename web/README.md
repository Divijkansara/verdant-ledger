# Verdant Ledger — Web application

Fifteen routes. Eleven console modules. No framework, no bundler, no
dependencies. Opens from a double-click.

```
open index.html          # runs immediately on the local engine
python serve.py          # http://localhost:5500 — needed only for the live API
```

---

## The colour question, answered in architecture

> *"Change a colour to something else and it should still look good."*

There are **no hard-coded colours in this product.** Every colour is generated
at runtime from **eight seed values** by perceptual colour maths:

| Seed | What it controls |
|---|---|
| `mode` | dark or light |
| `baseHue` | the hue of every neutral surface |
| `baseChroma` | how strongly the neutrals are tinted |
| `baseLevel` | lifts the whole surface ramp off true black |
| `accentHue` | the primary accent |
| `accentChroma` | its saturation |
| `accentContrast` | how **loud** the accent is, as a contrast ratio |
| `contrast` | a global contrast multiplier |

From those eight, `js/theme.js` derives **six surface steps, four ink steps,
three border weights, four accent tokens, four semantic states with washes
and lines, eight categorical chart hues and the chart furniture** — then
writes them to CSS custom properties.

Note what is *not* a seed: **no lightness anywhere is chosen by hand.**
`accentContrast` sets the ratio the accent must clear, not the colour it
becomes — which is why turning the accent up cannot make it unreadable.

**Why nothing breaks.** Text lightness is not hand-picked. It is *solved*:

```js
solveForContrast(background, hue, chroma, targetRatio, isDark)
```

walks lightness away from the real background until the WCAG ratio clears the
target. Out-of-gamut colours reduce chroma by bisection rather than clipping,
so hue and lightness survive intact. The text that sits on the accent button
tests both a light and a dark ink and takes the stronger one — and if neither
clears 4.5:1, the accent itself is nudged until one does.

The eight chart hues are spread from the accent by the **golden angle**
(137.5°) at equal lightness and chroma, so adjacent series are always far
apart in hue and none dominates.

**The proof, not the claim.** 648 combinations — every hue at 10° steps, both
modes, three chroma levels, three accent loudness levels — were run against
every contrast gate, and the Theme Lab's *Random* button was then driven 40
times in a real browser:

```
combinations tested: 648   failures: 0   min series ΔE: 20.8  (target ≥ 8)
random themes generated: 40   failing a gate: 0
```

The **Theme Lab** (Settings) shows the live audit for whatever palette is on
screen, with real ratios. Move the accent hue to 300°, switch to light mode,
press *Random* — the audit recomputes and the whole site repaints. Charts paint
with `fill:var(--series-3)` rather than hex values, so they repaint with **zero
re-render**.

```js
VL.Theme.set({ accentHue: 320 })   // repaints the entire product
VL.Theme.report                    // the live WCAG audit
VL.Theme.toCSS()                   // export the generated palette
```

---

## Type: three faces, three jobs, no overlap

| Face | Used for | Never used for |
|---|---|---|
| **Fraunces** (serif) | `h1`, `h2`, `.display` only | anything under 20px |
| **Inter Tight** (sans) | every running word, every control, `h3`/`h4` | figures |
| **JetBrains Mono** | labels, quantities, hashes, table numerals | prose |

The serif is the argument, not the decoration. A sustainability ledger is an
accounting instrument, and a serif display face reads as *statutory accounts*
rather than as a SaaS landing page — which is the difference between the
product this claims to be and the one it would otherwise look like. Nine real
carbon-accounting products were surveyed for this decision (Watershed, Sweep,
Climatiq, Terrascope, Greenly, Carbon Direct, Altruistiq, Persefoni,
Normative); not one of them uses a serif, which is precisely the point.

`h3` and `h4` stay in the sans: a serif at 20px sitting next to 14.5px sans
body text reads as a mistake rather than as a level of hierarchy.

The mono face carries tabular numerals throughout, so columns of quantities
line up on the decimal — the reason a ledger is legible at all.

---

## Where the palette comes from

The default **Ledger** theme is not invented. Brand palettes were pulled from
nine competing products and clustered: four sit on electric blue/indigo, three
on a vivid green over a deep teal-black, two on a warm contrarian hue. Every
one of them uses **exactly one saturated accent**, and none of them uses a
pure black — the ground is always tinted.

Acid lime over tinted teal-black was chosen because it sits in the strongest
cluster while being the one position in it that no surveyed product occupies
as its primary. The seed values that generate it:

```js
{ mode: "dark", baseHue: 208, baseChroma: 0.030, baseLevel: 0.075,
  accentHue: 124, accentChroma: 0.20, accentContrast: 12, contrast: 1 }
```

which the engine resolves to `--accent #c8f94b` on `--bg #071e22`.

---

## What is in it

**Public site** — landing page, methodology reference with the full 39-factor
catalogue, developer documentation, sign in, sign up, 404.

**Console — eleven modules**

| Module | What it does |
|---|---|
| **Overview** | Score dial, five weighted sub-scores, zero-baseline trend with avoided emissions below the axis, period balance, category breakdown, scope donut, resource intensity, generated recommendations |
| **Post entry** | Eight category tiles → activity → quantity, with the impact computed **live** before anything saves, the factor citation shown, and a recent-postings feed |
| **Ledger** | Filter by category, month, department, scope, free text · sortable · paginated · void-with-reason · CSV export **including the hash columns** |
| **Scenario simulator** | Eight intervention levers that rewrite a copy of the ledger and re-run the production engine · waterfall attribution · three playbooks |
| **Insights** | Anomaly detection (rolling mean ± 2.5σ), OLS forecast with a 95% prediction band, category × month heatmap |
| **Targets & budget** | SBTi-shaped glide path, cumulative budget, exhaustion date, human-scale equivalents |
| **Departments** | Per-team intensity, grade and ranking — by intensity per head, not absolute tonnage |
| **Ledger integrity** | SHA-256 chain, live verifier, block explorer, and a **tamper demonstration** |
| **Reports** | CSV, disclosure JSON, palette CSS, chain head |
| **Methodology** | Every factor with unit, scope and source; the score formula in full |
| **Settings** | Organisation, ledger controls, and the Theme Lab |

**Keyboard:** `⌘K`/`Ctrl-K` command palette (40+ commands), `1`–`9` jump to a
module, `/` focuses ledger search, `Esc` closes overlays.

---

## Structure

```
web/
├── index.html           one shell, hash-routed
├── serve.py             static server on :5500
├── css/
│   ├── base.css         reset, type, primitives — zero hex below the fallbacks
│   ├── site.css         public website
│   └── app.css          console
└── js/
    ├── theme.js         OKLCH colour engine + WCAG solver     (~420 lines)
    ├── data.js          factors, demo ledger, aggregation, scoring
    ├── chain.js         SHA-256 (FIPS 180-4) + tamper-evident chain
    ├── analytics.js     anomaly detection, forecast, carbon budget
    ├── simulate.js      scenario engine — rewrites the ledger
    ├── charts.js        nine SVG chart types, no library
    ├── store.js         state, persistence, API bridge
    ├── ui.js            icons, toasts, dialog, command palette
    ├── views-site.js    public pages
    ├── views-app.js     console modules
    └── app.js           router and shell
```

Classic scripts in dependency order, not ES modules — modules are blocked over
`file://`, and this has to run from a double-click.

---

## Two things worth defending in the viva

**SHA-256 is written out, not imported.** `crypto.subtle` is unavailable on
`file://` pages, so `chain.js` implements FIPS 180-4 in about sixty lines. It
was verified byte-for-byte against Node's `crypto` module on six vectors
including empty input, a 1000-character string, and Unicode with emoji. Sealing
303 entries takes 27 ms; verification takes 5 ms.

**The simulator has no fudge factors.** "Electrify 60% of the fleet" moves 60%
of the petrol-car kilometres onto the EV factor in a *copy* of the ledger and
re-runs the same aggregation and scoring code the dashboard uses. That is why
the simulated score is directly comparable with the real one. Each lever is
also run alone for attribution, and because levers overlap — solar and a PPA
displace the same grid draw — the difference between the solo sum and the
combined saving is shown as its own bar rather than hidden.

---

## Verified

| Check | Result |
|---|---|
| Routes walked at 400 / 760 / 1100 / 1500 px | 17 routes × 4 widths, **no horizontal overflow** |
| Console errors across every route | **zero** |
| Theme combinations against contrast gates | **648 / 648 pass** |
| SHA-256 vs Node `crypto` | **identical on all vectors** |
| Tamper detection | breaks at the exact altered block, recovers on re-seal |
| Backend test suite | **47 passing** |

Accessibility: visible focus rings, `aria-current` on navigation,
`aria-pressed` on toggles, `aria-live` on toasts and errors, a focus-trapped
modal, colour never the sole signal, and all motion disabled under
`prefers-reduced-motion`.
