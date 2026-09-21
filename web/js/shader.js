/* ══════════════════════════════════════════════════════════════════════
   shader.js — the Earth in the masthead.

   The planet's haze is the organisation's real sustainability score, and
   the "clean it up" control runs the actual scenario engine and eases the
   planet to the score that engine returns. The picture and the number
   cannot disagree, because the picture is computed from the number.

   Why this is not the volumetric raymarch it started as
   · Nobody could tell it was Earth. Its continents were random noise, and
     at high pollution the smog hid them entirely. The surface now comes
     from real coastlines (earth-land.js) with deserts, polar ice, drifting
     clouds, an ocean sun-glint and city lights on the night side — the
     cues that make a planet read as ours.
   · Pollution is now a tint, not a wall: vegetation browns, seas murk,
     clouds dirty and a smog layer thickens toward the limb, all capped so
     the continents stay legible through the worst of it.
   · Clean means clean. The bright halo that ringed the revived planet is
     gone; outside the disc there is only a smog halo, and only while the
     planet is polluted.
   · It renders at the display's full native resolution, every frame.
   · The canvas fills the whole masthead and the shader places the globe
     within it, so the planet can be large and sit behind the copy.

   Degrades: no WebGL, or prefers-reduced-motion (a still frame), and the
   masthead reads without it.
   ══════════════════════════════════════════════════════════════════════ */

window.VL = window.VL || {};

(() => {
  "use strict";
  const V = window.VL;
  const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  const VERT = "attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}";

  const FRAG = `precision highp float;

uniform vec2 u_center;         // globe centre, device pixels, origin bottom-left
uniform float u_radius;        // globe radius, device pixels
uniform float u_dpr;           // device pixels per CSS pixel, so stars stay crisp
uniform float u_time;
uniform float u_pollution;
uniform sampler2D u_land;      // r = land, g = desert, b = permanent ice

const float PI = 3.14159265;
const float PITCH = -0.26;     // lean the north toward us: most land is there
const float ROLL = 0.41;       // 23.4 degree axial tilt

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                 mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                 mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) {
  float f = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { f += a * noise(p); p *= 2.03; a *= 0.5; }
  return f / 0.875;
}
float fbm5(vec3 p) {
  float f = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { f += a * noise(p); p *= 2.07; a *= 0.5; }
  return f / 0.96875;
}

float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 starLayer(vec2 q, float size, float keep, float t, float seed) {
  vec2 cell = floor(q / size), f = fract(q / size);
  float h = h21(cell + seed);
  if (h < keep) return vec3(0.0);
  vec2 pos = vec2(h21(cell + seed + 3.1), h21(cell + seed + 7.7)) * 0.8 + 0.1;
  float dist = length((f - pos) * size);
  float b = (h - keep) / (1.0 - keep);
  float tw = 0.72 + 0.28 * sin(t * (0.5 + 2.0 * h21(cell + seed + 11.0)) + h * 40.0);
  vec3 tint = mix(vec3(0.74, 0.83, 1.0), vec3(1.0, 0.92, 0.80), h21(cell + seed + 5.0));
  return tint * smoothstep(1.35, 0.0, dist) * (0.35 + 0.65 * b) * tw;
}
vec3 stars(vec2 q, float t) {
  return starLayer(q, 34.0, 0.90, t, 0.0) * 0.9 + starLayer(q, 17.0, 0.965, t, 19.0) * 0.55;
}

vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, c*v.y - s*v.z, s*v.y + c*v.z); }
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c*v.x + s*v.z, v.y, -s*v.x + c*v.z); }
vec3 rotZ(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c*v.x - s*v.y, s*v.x + c*v.y, v.z); }

void main() {
  vec2 uv = (gl_FragCoord.xy - u_center) / u_radius;
  float P = clamp(u_pollution, 0.0, 1.0);
  float d = length(uv);
  float px = 1.0 / u_radius;
  vec3 sun = normalize(vec3(-0.62, 0.34, 0.71));

  // ── outside the disc: stars, and a smog halo only while polluted ──
  if (d > 1.0) {
    float sunSide = 0.5 + 0.5 * dot(normalize(uv), normalize(sun.xy));
    float h = clamp(exp(-(d - 1.0) * 15.0) * P * (0.35 + 0.65 * sunSide) * 0.8, 0.0, 1.0);
    vec3 st = stars(gl_FragCoord.xy / u_dpr, u_time) * (1.0 - h);
    float sa = clamp(max(st.r, max(st.g, st.b)), 0.0, 1.0);
    float a = 1.0 - (1.0 - sa) * (1.0 - h);
    gl_FragColor = vec4((st + vec3(0.46, 0.33, 0.17) * h * (1.0 - sa)) / max(a, 1e-4), a);
    return;
  }

  vec3 n = vec3(uv, sqrt(max(0.0, 1.0 - d * d)));
  float t = u_time;
  // longitude at the centre starts over Europe/Africa and drifts eastward
  vec3 w = rotY(rotZ(rotX(n, PITCH), ROLL), 0.26 - t * 0.07);

  float lat = asin(clamp(w.y, -1.0, 1.0));
  float lon = atan(w.x, w.z);
  float latD = abs(lat) * 180.0 / PI;
  vec4 tex = texture2D(u_land, vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI));

  // ── surface ────────────────────────────────────────────────────────
  float land = smoothstep(0.46, 0.54, tex.r + (fbm3(w * 7.0) - 0.5) * 0.28);
  float vary = fbm3(w * 9.0 + 4.7);
  float desert = smoothstep(0.12, 0.88, tex.g + (fbm3(w * 5.0 + 1.3) - 0.5) * 0.95) * land;
  float snow = max(smoothstep(0.3, 0.7, tex.b), smoothstep(70.0, 78.0, latD)) * land;

  vec3 forest = vec3(0.045, 0.14, 0.05);
  vec3 grass  = vec3(0.17, 0.25, 0.09);
  vec3 green  = mix(forest, grass, smoothstep(0.35, 0.7, vary) * smoothstep(8.0, 30.0, latD));
  vec3 landCol = mix(green, vec3(0.30, 0.29, 0.24), smoothstep(58.0, 70.0, latD));
  vec3 sand = mix(vec3(0.42, 0.26, 0.11), vec3(0.62, 0.42, 0.21), fbm3(w * 14.0));
  landCol = mix(landCol, sand, desert);
  landCol = mix(landCol, vec3(0.34, 0.25, 0.14), P * 0.7 * (1.0 - desert));    // vegetation dies back
  vec3 ice = mix(vec3(0.90, 0.93, 0.97), vec3(0.60, 0.57, 0.51), P * 0.6);
  landCol *= 0.78 + 0.44 * fbm3(w * 18.0);
  landCol = mix(landCol, ice, snow);

  float shallow = smoothstep(0.16, 0.46, tex.r) * (1.0 - land);
  vec3 ocean = mix(vec3(0.012, 0.05, 0.14), vec3(0.03, 0.17, 0.27), shallow);
  ocean = mix(ocean, vec3(0.010, 0.012, 0.008), P * 0.85);                      // seas murk
  float seaIce = smoothstep(76.0, 84.0, lat * 180.0 / PI);                      // arctic pack
  ocean = mix(ocean, ice * 0.92, seaIce);

  vec3 albedo = mix(ocean, landCol, land);

  // ── light: a soft terminator, dimmed by smog ───────────────────────
  float ndl = dot(n, sun);
  float light = smoothstep(-0.12, 0.35, ndl) * (1.0 - 0.22 * P);
  vec3 col = albedo * (0.02 + 1.25 * light);

  vec3 hv = normalize(sun + vec3(0.0, 0.0, 1.0));
  col += vec3(1.0, 0.92, 0.78) * pow(max(dot(n, hv), 0.0), 90.0) * 0.22
       * (1.0 - land) * (1.0 - seaIce) * (1.0 - P * 0.85) * light;

  // ── clouds drift slowly over the ground ────────────────────────────
  vec3 wc = rotY(w, t * 0.012);
  vec3 warp = vec3(fbm3(wc * 1.7 + 8.1), fbm3(wc * 1.7 + 2.9), fbm3(wc * 1.7 + 5.3)) - 0.5;
  float cn = fbm5(wc * vec3(2.2, 3.8, 2.2) + warp * 1.6 + vec3(0.0, 0.0, t * 0.004));
  // wet at the equator and in the mid-latitude storm tracks, clear over the subtropics
  float band = 0.62 + 0.30 * exp(-pow((latD - 4.0) / 9.0, 2.0))
                    + 0.25 * exp(-pow((latD - 55.0) / 14.0, 2.0))
                    - 0.28 * exp(-pow((latD - 24.0) / 9.0, 2.0));
  float cover = smoothstep(0.50 - 0.06 * P, 0.78, cn * band + 0.18 * (band - 0.62));
  cover *= (1.0 - 0.7 * desert) * 0.9;
  vec3 cloud = mix(vec3(0.96, 0.97, 0.98), vec3(0.52, 0.45, 0.34), P * 0.8);
  col = mix(col, cloud * (0.03 + 1.15 * light), cover);

  // ── cities on the night side, brighter as industry grows ───────────
  float night = 1.0 - smoothstep(-0.18, 0.04, ndl);
  float cities = smoothstep(0.66, 0.84, noise(w * 150.0)) * smoothstep(0.48, 0.72, noise(w * 22.0));
  float people = land * (1.0 - desert * 0.85) * (1.0 - snow) * (1.0 - smoothstep(55.0, 64.0, latD));
  col += vec3(1.0, 0.68, 0.32) * cities * people * night * (1.0 - cover * 0.8) * mix(0.12, 1.0, P);

  // ── the air: a faint blue limb when clean, brown smog when not ─────
  float fres = pow(1.0 - n.z, 2.5);
  col += vec3(0.20, 0.42, 0.85) * fres * 0.18 * light * (1.0 - P);
  col = mix(col, vec3(0.34, 0.22, 0.09) * (0.08 + 0.80 * light), P * (0.10 + 0.55 * fres));
  col *= mix(vec3(1.0), vec3(1.0, 0.80, 0.52), P);

  col = pow(1.0 - exp(-col * 1.4), vec3(0.4545));
  float edge = 1.0 - smoothstep(1.0 - 1.5 * px, 1.0, d);
  gl_FragColor = vec4(col, edge);
}`;

  /* ── runtime ─────────────────────────────────────────────────────── */

  let api = null;

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn("[shader]", gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }

  function mount(host) {
    if (!host) return api;
    // The router rebuilds the page on every visit, so a cached instance can
    // be bound to a canvas that is no longer in the document. Reuse it only
    // if it is still live; otherwise release its GPU context and start over
    // (browsers cap live WebGL contexts, so leaking them eventually fails).
    if (api) {
      if (api._cv.isConnected && host.contains(api._cv)) return api;
      const lose = api._gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
      api = null;
    }
    if (!V.EarthLand) { host.classList.add("no-gl"); return null; }

    const cv = document.createElement("canvas");
    cv.className = "planet-cv";
    cv.setAttribute("aria-hidden", "true");
    host.appendChild(cv);

    // premultipliedAlpha:false — the shader writes plain colour plus coverage
    const gl = cv.getContext("webgl", {
      antialias: false, alpha: true, premultipliedAlpha: false,
      powerPreference: "high-performance", depth: false, stencil: false
    });
    if (!gl) { host.classList.add("no-gl"); return null; }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { host.classList.add("no-gl"); return null; }
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("[shader] link:", gl.getProgramInfoLog(prog));
      host.classList.add("no-gl");
      return null;
    }
    gl.useProgram(prog);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aLoc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(aLoc);
    gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);

    // The coastline texture. 1024x512 is a power of two, so longitude can
    // wrap with REPEAT across the date line.
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, V.EarthLand.canvas(1024, 512));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const uCenter = gl.getUniformLocation(prog, "u_center");
    const uRadius = gl.getUniformLocation(prog, "u_radius");
    const uDpr = gl.getUniformLocation(prog, "u_dpr");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uPol = gl.getUniformLocation(prog, "u_pollution");
    gl.uniform1i(gl.getUniformLocation(prog, "u_land"), 0);

    let target = 0.5, current = 0.5, visible = true, running = false;
    let t0 = performance.now(), lastW = 0, lastH = 0;

    /* Full native resolution, every frame — no cap and no downscaling. */
    let scale = window.devicePixelRatio || 1;

    /* Where the globe sits in the stage. Wide screens: large, right of
       centre, with the copy over its left limb. Narrow screens: top and
       centre, with the copy beneath it. CSS pixels, origin top-left. */
    /* The globe is sized and placed from the SCREEN, never from the hero's
       height: the hero can grow (reveals, long copy) and the globe must not
       move or rescale when it does. On touch devices the height is only
       re-read when the width changes, so the address bar sliding away on
       scroll does not resize it either. */
    let vpW = window.innerWidth, vpH = window.innerHeight;
    const coarse = matchMedia("(pointer: coarse)").matches;
    addEventListener("resize", () => {
      if (!coarse || window.innerWidth !== vpW) { vpW = window.innerWidth; vpH = window.innerHeight; }
    });

    const layout = (W, H) => {
      const vw = vpW, vh = vpH;
      if (vw >= 820 && vw / vh > 1.05) {
        const r = Math.min(vh * 0.44, vw * 0.31);
        return { x: W * 0.64, y: vh * 0.5, r };
      }
      // must match the padding-top in site.css for the same media query
      const r = Math.min(vw * 0.44, vh * 0.26);
      return { x: W * 0.5, y: 64 + r, r };
    };

    const size = () => {
      scale = window.devicePixelRatio || 1;
      const r = host.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width * scale));
      const h = Math.max(1, Math.round(r.height * scale));
      if (w === lastW && h === lastH) return;
      lastW = w; lastH = h;
      cv.width = w; cv.height = h;
      gl.viewport(0, 0, w, h);
    };

    const place = () => {
      const g = layout(cv.width / scale, cv.height / scale);
      gl.uniform2f(uCenter, g.x * scale, (cv.height / scale - g.y) * scale);
      gl.uniform1f(uRadius, g.r * scale);
      gl.uniform1f(uDpr, scale);
    };

    const draw = now => {
      size();
      if (!still()) current += (target - current) * 0.04;
      else current = target;
      gl.clear(gl.COLOR_BUFFER_BIT);
      place();
      gl.uniform1f(uTime, still() ? 6.0 : (now - t0) / 1000);
      gl.uniform1f(uPol, current);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const loop = now => {
      if (!cv.isConnected) { running = false; return; }
      draw(now);
      // pausing off-screen or in a background tab is not a quality cut —
      // nothing is visible then, so there is nothing to draw
      if (visible && !document.hidden && !still()) requestAnimationFrame(loop);
      else running = false;
    };
    const kick = () => {
      if (running || !cv.isConnected) return;
      if (still()) { draw(performance.now()); return; }
      running = true; requestAnimationFrame(loop);
    };

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(en => { visible = en[0].isIntersecting; kick(); },
        { rootMargin: "80px" }).observe(host);
    }
    document.addEventListener("visibilitychange", kick);
    addEventListener("resize", kick);

    draw(performance.now());
    kick();

    api = {
      /** 0 = pristine, 1 = choked. Eases rather than jumping. */
      set(v) { target = Math.min(1, Math.max(0, v)); kick(); return api; },
      jump(v) { target = current = Math.min(1, Math.max(0, v)); kick(); return api; },
      get() { return current; },
      /** Draw one frame at pollution `v` and return it as a data URL —
          used to check the render when the tab cannot animate. */
      snapshot(v, size = 360, time = 6) {
        const keep = [current, lastW, lastH, cv.width, cv.height];
        current = v; cv.width = cv.height = size; gl.viewport(0, 0, size, size);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(uCenter, size / 2, size / 2);
        gl.uniform1f(uRadius, size * 0.47);
        gl.uniform1f(uDpr, 1);
        gl.uniform1f(uTime, time);
        gl.uniform1f(uPol, v);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const url = cv.toDataURL("image/png");
        [current, lastW, lastH] = keep; cv.width = keep[3]; cv.height = keep[4];
        gl.viewport(0, 0, cv.width, cv.height);
        return url;
      },
      ok: true,
      _cv: cv,
      _gl: gl
    };
    return api;
  }

  /* The score drives the haze. A C+ organisation (about 49) sits under
     heavy smog; from about 82 upward the planet is fully clean. */
  const fromScore = s => Math.min(1, Math.max(0, (82 - s) / 38));

  V.Shader = { mount, fromScore, get instance() { return api; } };
})();
