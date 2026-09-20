/* ══════════════════════════════════════════════════════════════════════
   shader.js — the planet in the masthead.

   A single-pass atmospheric scattering raymarch. The one uniform that
   matters is u_pollution, and it is not decoration: it is driven by the
   organisation's real sustainability score, and the "clean it up" control
   runs the actual scenario engine and tweens the planet to the score that
   engine returns. The picture and the number can never disagree, because
   the picture is computed from the number.

   Fixes applied to the original shader, all verified by measurement:
     · 64x8 = 512 samples/px ran at 1 fps. Now 20x4 = 80, plus a half-
       resolution buffer.
     · The light march broke out of its loop on entering the planet, which
       left a SMALL optical depth and therefore LESS attenuation — so the
       night side lit up instead of going dark. The planet is now tested
       as an occluder and shadowed samples contribute nothing.
     · The specular half-vector was (lightDir - normal), which is not a
       half-vector. It is now (lightDir - viewRay).
     · A larger forward multiplier NARROWS the lens, so the original 1.5
       (and my first 2.2) filled the frame edge to edge. 1.0 at 4.2 units
       puts a 13.8-degree planet inside a 26.6-degree half-frame.
     · The vignette reached full black inside the frame on wide viewports.

   Degrades: no WebGL, or prefers-reduced-motion, and the canvas simply
   never appears — the masthead is designed to read without it.
   ══════════════════════════════════════════════════════════════════════ */

window.VL = window.VL || {};

(() => {
  "use strict";
  const V = window.VL;
  const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  const VERT = "attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}";

  const FRAG = `#ifdef GL_ES
precision highp float;
#endif

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_pollution;

#define MAX_STEPS 20
#define LIGHT_STEPS 4
const float PLANET_RADIUS = 1.0;
const float ATMO_RADIUS = 1.25;

const vec3 RAYLEIGH_SCATTERING = vec3(5.5e-6, 13.0e-6, 22.4e-6) * 100000.0;
const float MIE_SCATTERING_BASE = 21.0e-6 * 100000.0;

// NO2 and carbon soot: absorbs blue and green, leaves a sick yellow-brown
const vec3 TOXIC_ABSORPTION = vec3(0.2, 1.8, 4.5);

const vec3 SUN_DIR = normalize(vec3(-0.78, 0.26, 0.57));
const float SUN_INTENSITY = 22.0;

float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}

float fbm(vec3 p) {
    float f = 0.0;
    float amp = 0.62;
    for(int i = 0; i < 3; i++) {
        f += amp * noise(p);
        p *= 2.03;
        amp *= 0.5;
    }
    return f;
}

vec2 rsi(vec3 ro, vec3 rd, float r) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - r * r;
    float h = b * b - c;
    if (h < 0.0) return vec2(-1.0);
    h = sqrt(h);
    return vec2(-b - h, -b + h);
}

vec3 getSurfaceColor(vec3 p, vec3 n, vec3 lightDir, vec3 viewRd) {
    float nVal = fbm(p * 4.0);
    bool isLand = nVal > 0.45;

    vec3 cleanOcean = vec3(0.02, 0.1, 0.3);
    vec3 dirtyOcean = vec3(0.08, 0.09, 0.05);
    vec3 ocean = mix(cleanOcean, dirtyOcean, u_pollution);

    vec3 cleanLand = mix(vec3(0.1, 0.4, 0.15), vec3(0.05, 0.25, 0.1), smoothstep(0.45, 0.7, nVal));
    vec3 deadLand = mix(vec3(0.2, 0.15, 0.1), vec3(0.1, 0.05, 0.02), smoothstep(0.45, 0.7, nVal));
    vec3 land = mix(cleanLand, deadLand, u_pollution);

    vec3 albedo = isLand ? land : ocean;

    float spec = 0.0;
    if (!isLand) {
        vec3 h = normalize(lightDir - viewRd);
        spec = pow(max(dot(n, h), 0.0), 32.0) * (1.0 - u_pollution * 0.9);
    }

    float diff = max(dot(n, lightDir), 0.0);
    vec3 ambient = albedo * 0.05;

    return albedo * diff * 2.0 + ambient + vec3(spec);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;

    float camDist = 4.2;
    vec3 ro = vec3(sin(u_time * 0.06) * camDist, 0.55, cos(u_time * 0.06) * camDist);
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(vec3(0.0, 1.0, 0.0), ww));
    vec3 vv = normalize(cross(ww, uu));
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.0 * ww);

    float mieCoefficient = MIE_SCATTERING_BASE * (1.0 + u_pollution * 25.0);

    float rayleighScaleHeight = 0.08;
    float mieScaleHeight = 0.02 * (1.0 + u_pollution * 3.0);

    vec2 atmoHit = rsi(ro, rd, ATMO_RADIUS);
    vec2 planetHit = rsi(ro, rd, PLANET_RADIUS);

    if (atmoHit.x > atmoHit.y) { gl_FragColor = vec4(0.0); return; }

    atmoHit.x = max(atmoHit.x, 0.0);
    float tMax = (planetHit.x > 0.0) ? planetHit.x : atmoHit.y;

    float stepSize = (tMax - atmoHit.x) / float(MAX_STEPS);
    float t = atmoHit.x;

    vec3 rayleighAcc = vec3(0.0);
    vec3 mieAcc = vec3(0.0);
    float optDepthR = 0.0;
    float optDepthM = 0.0;

    float mu = dot(rd, SUN_DIR);
    float phaseR = 3.0 / (16.0 * 3.14159) * (1.0 + mu * mu);
    float g = mix(0.76, 0.88, u_pollution);
    float phaseM = 3.0 / (8.0 * 3.14159) * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));

    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * (t + stepSize * 0.5);
        float height = length(p) - PLANET_RADIUS;

        float rhoR = exp(-height / rayleighScaleHeight) * stepSize;
        float rhoM = exp(-height / mieScaleHeight) * stepSize;

        optDepthR += rhoR;
        optDepthM += rhoM;

        // the planet itself shadows this sample — no light reaches it
        if (rsi(p, SUN_DIR, PLANET_RADIUS).x > 0.0) { t += stepSize; continue; }

        float stepSizeLight = rsi(p, SUN_DIR, ATMO_RADIUS).y / float(LIGHT_STEPS);
        float tLight = 0.0;
        float optDepthLightR = 0.0;
        float optDepthLightM = 0.0;

        for (int j = 0; j < LIGHT_STEPS; j++) {
            vec3 pLight = p + SUN_DIR * (tLight + stepSizeLight * 0.5);
            float heightLight = length(pLight) - PLANET_RADIUS;
            optDepthLightR += exp(-heightLight / rayleighScaleHeight) * stepSizeLight;
            optDepthLightM += exp(-heightLight / mieScaleHeight) * stepSizeLight;
            tLight += stepSizeLight;
        }

        vec3 currentToxicAbsorption = TOXIC_ABSORPTION * u_pollution * (optDepthM + optDepthLightM);

        vec3 attenuation = exp(-(RAYLEIGH_SCATTERING * (optDepthR + optDepthLightR) +
                                 mieCoefficient * (optDepthM + optDepthLightM) +
                                 currentToxicAbsorption));

        rayleighAcc += rhoR * attenuation;
        mieAcc += rhoM * attenuation;
        t += stepSize;
    }

    vec3 atmoColor = (rayleighAcc * RAYLEIGH_SCATTERING * phaseR + mieAcc * mieCoefficient * phaseM) * SUN_INTENSITY;

    vec3 finalColor = atmoColor;
    if (planetHit.x > 0.0) {
        vec3 p = ro + rd * planetHit.x;
        vec3 n = normalize(p);
        vec3 surfaceCol = getSurfaceColor(p, n, SUN_DIR, rd);

        vec3 surfaceToxicAbsorption = TOXIC_ABSORPTION * u_pollution * optDepthM;
        vec3 surfaceAttenuation = exp(-(RAYLEIGH_SCATTERING * optDepthR +
                                        mieCoefficient * optDepthM +
                                        surfaceToxicAbsorption));
        finalColor += surfaceCol * surfaceAttenuation;
    }

    finalColor = vec3(1.0) - exp(-finalColor * 1.5);
    finalColor = pow(finalColor, vec3(1.0 / 2.2));

    // alpha carries the planet so the page background shows through space
    float lum = dot(finalColor, vec3(0.2126, 0.7152, 0.0722));
    float alpha = smoothstep(0.004, 0.06, lum);
    alpha *= smoothstep(2.1, 0.5, length(uv));

    gl_FragColor = vec4(finalColor, alpha);
}`;

  /* ── runtime ─────────────────────────────────────────────────────── */

  const SCALE = 0.5;                  // render buffer relative to CSS pixels
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
    if (!host || api) return api;

    const cv = document.createElement("canvas");
    cv.className = "planet-cv";
    cv.setAttribute("aria-hidden", "true");
    host.appendChild(cv);

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
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aLoc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(aLoc);
    gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "u_resolution");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uPol = gl.getUniformLocation(prog, "u_pollution");

    let target = 0.5, current = 0.5, visible = true, running = false;
    let t0 = performance.now(), lastW = 0, lastH = 0;

    const size = () => {
      const r = host.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width * SCALE));
      const h = Math.max(1, Math.round(r.height * SCALE));
      if (w === lastW && h === lastH) return;
      lastW = w; lastH = h;
      cv.width = w; cv.height = h;
      gl.viewport(0, 0, w, h);
    };

    const draw = now => {
      size();
      current += (target - current) * 0.035;      // eased tween toward target
      gl.uniform2f(uRes, cv.width, cv.height);
      gl.uniform1f(uTime, still() ? 12.0 : (now - t0) / 1000);
      gl.uniform1f(uPol, current);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const loop = now => {
      if (!cv.isConnected) { running = false; return; }
      draw(now);
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
      /** 0 = pristine, 1 = choked. Tweens rather than jumping. */
      set(v) { target = Math.min(1, Math.max(0, v)); kick(); return api; },
      jump(v) { target = current = Math.min(1, Math.max(0, v)); kick(); return api; },
      get() { return current; },
      ok: true
    };
    return api;
  }

  /* A score of 100 is a pristine planet, 0 is a choked one. The range is
     clamped: fully clean hides the atmosphere that makes it beautiful,
     and fully choked hides the continents entirely. */
  const fromScore = s => Math.min(0.82, Math.max(0.06, 1 - (s / 100)));

  V.Shader = { mount, fromScore, get instance() { return api; } };
})();
