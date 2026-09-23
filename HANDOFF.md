# Terrawise (formerly Verdant Ledger) — handoff brief for the next AI

Paste this whole file to the next assistant. It explains the project, how the owner wants it, what's done, and what to watch out for.

---

## 1. What this is

**Verdant Ledger** is a college FSD (full-stack development) mini project: a sustainability / carbon-emissions ledger. It has a marketing landing site and a working "console" app with a scenario engine, a hash-chained ledger of sealed entries, and charts. The owner wants it to look and feel like a **national-level hackathon winner**, not a template, and with **no "AI slop"**: no generic gradients, filler sections, fake stats or emoji décor.

Project root: `D:\FSD MINI` (Windows 11, PowerShell and Git Bash both available)

| Folder | What it is | Status |
|---|---|---|
| `web/` | **The real site.** Vanilla HTML/CSS/JS, no build step. | ← all active work happens here |
| `backend/` | FastAPI + SQLite API (`app/`, `tests/`, `.venv`) | works, optional; the site runs without it |
| `web-react/` | Vite + React + shadcn experiment | side experiment, NOT the live site |
| `web-backup-20260921-0214.zip` | zip backup of `web/` before the big hero changes | safety net |
| `wireframes.html` | early wireframes | reference only |

## 2. How to run it

```bash
python web/serve.py
```
Then open http://localhost:5500. You can also just double-click `web/index.html`, because it works over `file://` too. Keep that working.

The backend is optional:
```bash
backend/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir backend --port 8000
```

`.claude/launch.json` has these configs: `web` (5500), `api` (8000), `web-react` (5173).

## 3. Hard rules from the owner (do not break)

1. **Dark theme only.** The palette is "Midnight Teal": accent `#1abba9` on background `#0a131f` (the owner reverted from lime). It is the `midnight` preset, set as `DEFAULT_SEED` in `web/js/theme.js`; there is no colour picker, which uses OKLCH tokens with contrast solving. Don't hard-code colours; use the CSS variables (`--accent`, `--surface-2`, `--text-1..4`, `--line-2/3`, etc.).
2. **No top nav bar on the landing page when scrolled to the top.** The nav is a fixed overlay on home and appears only after scrolling past 60% of the viewport height (`web/js/app.js` `onScroll`, class `at-top`; CSS in `web/css/site.css` `.nav.nav-overlay` / `.nav.at-top`). The owner complained hard when this was violated.
3. **"Open the console" must NOT be up front in the hero.** The flow is: the user clicks **"Clean it up"** → the real scenario engine runs → the planet de-pollutes → only then does the `#mastNext` row ("That was the engine, not an animation." + "Open the console") fade in.
4. **High graphics quality.** The owner has a 32 GB RAM Intel Ultra 7 machine: *"i dont want cheap stuff"*. The shader runs at full `devicePixelRatio` with no cap and no adaptive downscaling. Don't add either back.
5. **The Earth must look like Earth**, both polluted (sepia smog, grey seas) and clean. **No glow/halo once it is clean.** The smog halo exists only while it is polluted.
6. **The globe must not scale or move when cleaned.** Its layout uses the stable viewport (`vpW`/`vpH`), never the hero's height.
7. **Numbers count smoothly** between the polluted and clean states: a 1.5 s ease-out cubic in `fx.js` `paint()`.
8. **Don't break things; keep them revertible.** Use git: small commits, one per change, with clear messages. The owner explicitly said: *"just dont mess up, incase i need to revert back to this website."*
9. Apply real UI/UX principles: hierarchy, spacing, contrast, accessible focus states, `prefers-reduced-motion` support, and a responsive layout down to phone width with a 16px gutter and no horizontal scroll.

## 4. Architecture of `web/`

- `index.html` loads every script with `defer`, in order. `earth-land.js` must load **before** `shader.js`. Routing is hash-based: `#/` is home, `#/app/...` is the console.
- **CSS:**
  - `base.css`: tokens and reset
  - `site.css`: marketing pages and the hero
  - `app.css`: the console
  - `pages.css`
  - `fx.css`: landing effects: planet UI, bento, band chart, playground, deck section
  - `deck.css`: the 3D document stack and its floating chips
- **JS:**
  - `theme.js`: palette engine
  - `data.js`: sample organisation data, emission factors
  - `store.js`: state
  - `chain.js`: the hash-chained ledger ("blocks sealed")
  - `simulate.js`: `V.Simulate.run()` is the scenario engine the hero's clean button uses
  - `charts.js`, `analytics.js`, `ui.js`, `tour.js`
  - `views-site.js`: marketing page markup, including the hero (`header.mast#mast`) and `nav(active)`
  - `views-app.js`: console views
  - `app.js`: router and nav scroll behaviour
  - `earth-land.js`: `V.EarthLand.canvas(1024,512)` rasterises real coastline lon/lat polygons into a texture. Channels: R = land, G = desert, B = ice.
  - `shader.js`: WebGL1 analytic sphere Earth with clouds, city lights, sepia smog and a starfield.
    - Uniforms: `u_center`, `u_radius`, `u_dpr`, `u_time`, `u_pollution`, `u_land`.
    - API: `mount`, `set`, `jump`, `get`, `snapshot(v,size,time)`.
    - Pollution comes from the real score: `fromScore = s => clamp((82 - s)/38)`.
    - A stale instance is remounted (the old GL context is lost via `WEBGL_lose_context`).
  - `deck.js`: the 5-sheet document deck (A–E selector) plus the chips "N blocks sealed", "39 cited factors" and the score pill.
  - `fx.js`: landing interactions. `home()` calls `headline`, `planet`, `V.Deck.build`, `band`, `bento`, `playground`, `laySheets`, `reveals`. `planet(host)` holds the hero readout and the count animation.

**Landing page order:** full-screen space hero (Earth on the right on desktop, stacked above the copy on narrow screens) → "[ The record ] Five documents, one ledger." (the deck) → "[ The position ] A year, counted." (band/bento) → the rest.

## 4b. RESTORE POINTS — read this before undoing anything

`classic-v1` (tag) and `classic` (branch), both on GitHub, mark commit
`c6d13f4`: the site as it was **before the 3D "cinema" work** of 2026-09-23
(scroll-driven camera on the globe, aurora, cursor light, card tilt,
magnetic buttons).

That version already includes the Terrawise name and logo, the Midnight Teal
palette, the plain-English copy, the phone fixes, the motion layer, the
sign-in curtain and the expandable-tabs menu.

Undo everything after it:

```bash
cd "D:/FSD MINI" && git reset --hard classic-v1 && git push --force origin master
```

Vercel redeploys `master` by itself, so the live site follows within a minute.
To undo only part, revert single commits instead: `931f0b1` (camera and the
cinema layer), `7cf482b` (arrival and section depth), `c7aa522` (removal of
the month-by-month bar strip).

Take a new tag like this before any other large visual change.

## 5. Recent history (newest first)

```
0d60dc0 Keep the deck's chips off the section heading
e7d5f3b Count the hero readout between states instead of jumping
5031257 Globe no longer rescales when the planet is cleaned
d939d90 Hero in the reference layout; nav truly hidden; full-resolution render
02eef23 Make the hero planet read as Earth; no glow once it is clean
a13100d Landing flow: hidden nav at top, clean-up leads to the console
c5c59eb Add the interactive planet as the masthead hero
0d60e0a Console consistency pass; fix .subs selector collision
d800376 Make the lime Ledger palette the default theme
ba486ab Initial commit: Verdant Ledger
```
The branch is `master`. There is **no git remote** yet. The owner earlier tried GitHub Pages, which needs the repo pushed with `web/` as the published folder or root.

To revert to any point: `git log --oneline`, then `git checkout <hash> -- web/`, or `git revert <hash>`.

## 6. Known open items / good next steps

- **Deck section feels empty on the right** (desktop). The document stack sits on the left and the right half of that section is blank. Consider adding a short explanatory column (what each document A–E is, clickable to switch sheets) or centring the stack. Keep the text factual and short.
- Check every console page (`#/app/...`) at phone width (≤420px) for overflow.
- Deploying: push to GitHub and enable Pages on the folder that contains `index.html`. Relative paths are already in place. `robots.txt` and `sitemap.xml` exist; update the domain in them once it's known.
- The owner mentioned possibly moving to React (`web-react/`), but the live site is vanilla `web/`. Don't migrate unless asked.

## 7. Gotchas (things that already bit us)

- **CSS class collisions:** `.fx-row` was renamed to `anim-*`, `.grade` is scoped to `.grades .grade`, and `.subs` is scoped to `.doc-body`. Search before adding generic class names.
- Deck chips/pill/selector are absolutely positioned **outside** `.deck-stage` (top −54px, bottom −74px/−78px). The margins on `.deck-section .deck-stage` in `fx.css` reserve that space. Keep them if you move the deck.
- `#mastNext` uses visibility/opacity (not `hidden`) so that its space is reserved; otherwise the hero grows when it appears.
- `serve.py` output must stay ASCII (Windows console `UnicodeEncodeError` on → and —).
- Headless-Chrome screenshots below ~500px width are unreliable; measure with `getBoundingClientRect` instead. Hidden browser tabs pause `requestAnimationFrame` and CSS animations, so elements with entrance animations can read `opacity:0` in tests. That's not a bug.
- Always check both the polluted state and the clean state of the hero after touching `shader.js`, `fx.js` or `site.css`.

## 8. How the owner likes to work

- They send screenshots with short questions ("it is getting blocked?"). Answer directly, then fix it.
- They are blunt and have high standards. Don't claim something is done without verifying it in a browser.
- Explain in plain language, and keep responses concise.
- Commit after each verified fix, so every step can be reverted.
