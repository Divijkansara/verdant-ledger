/* ══════════════════════════════════════════════════════════════════════
   chain.js — tamper-evident ledger integrity.

   Claiming a ledger is "append-only" is a promise. Chaining it is a
   proof. Every entry is hashed together with the hash of the entry
   before it:

       H(n) = SHA-256( H(n-1) ‖ canonical(entry n) )

   Change one historical quantity — even by a gram — and that entry's
   hash changes, so every hash after it changes, and the chain no longer
   reconciles with the stored head. The verifier walks the whole ledger
   and reports the first block where the recomputed hash stops matching,
   which is exactly the row that was altered.

   SHA-256 is implemented here rather than taken from crypto.subtle
   because SubtleCrypto is unavailable on file:// pages, and this
   application has to run from a double-click with no server.
   ══════════════════════════════════════════════════════════════════════ */

window.VL = window.VL || {};

(() => {
  "use strict";

  /* ═══════════════════ SHA-256 (FIPS 180-4) ══════════════════════════ */

  const K = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ]);

  const rotr = (x, n) => (x >>> n) | (x << (32 - n));

  /** UTF-8 encode a string to bytes, without TextEncoder (file:// safe). */
  function utf8Bytes(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c >= 0xd800 && c <= 0xdbff) {                    // surrogate pair
        const c2 = str.charCodeAt(++i);
        c = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
        out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  /** SHA-256 of a string → 64-character lowercase hex digest. */
  function sha256(message) {
    const bytes = utf8Bytes(message);
    const bitLen = bytes.length * 8;

    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    // 64-bit big-endian length; messages here are far below 2^32 bits
    bytes.push(0, 0, 0, 0,
      (bitLen >>> 24) & 255, (bitLen >>> 16) & 255, (bitLen >>> 8) & 255, bitLen & 255);

    const H = new Uint32Array([
      0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19
    ]);
    const w = new Uint32Array(64);

    for (let pos = 0; pos < bytes.length; pos += 64) {
      for (let i = 0; i < 16; i++) {
        w[i] = (bytes[pos + i * 4] << 24) | (bytes[pos + i * 4 + 1] << 16) |
               (bytes[pos + i * 4 + 2] << 8) | bytes[pos + i * 4 + 3];
      }
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i-15], 7) ^ rotr(w[i-15], 18) ^ (w[i-15] >>> 3);
        const s1 = rotr(w[i-2], 17) ^ rotr(w[i-2], 19) ^ (w[i-2] >>> 10);
        w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0;
      }

      let [a,b,c,d,e,f,g,h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
        const S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0]+a)|0; H[1] = (H[1]+b)|0; H[2] = (H[2]+c)|0; H[3] = (H[3]+d)|0;
      H[4] = (H[4]+e)|0; H[5] = (H[5]+f)|0; H[6] = (H[6]+g)|0; H[7] = (H[7]+h)|0;
    }

    let hex = "";
    for (let i = 0; i < 8; i++) hex += (H[i] >>> 0).toString(16).padStart(8, "0");
    return hex;
  }

  /* ═══════════════════ the chain ═════════════════════════════════════ */

  /**
   * Canonical serialisation of an entry.
   *
   * The hash must depend only on the facts of the posting, in a fixed
   * field order, with fixed numeric precision. If the format varied, two
   * machines would compute different hashes for the same ledger and the
   * proof would be worthless.
   */
  function canonical(e) {
    return [
      e.id,
      e.date,
      e.factorId,
      Number(e.qty).toFixed(3),
      Number(e.co2).toFixed(3),
      e.dept || "",
      e.status || "posted",
      (e.ref || "").replace(/\|/g, "/")
    ].join("|");
  }

  const GENESIS = "0".repeat(64);

  /**
   * Walk the ledger in posting order and stamp each entry with its hash.
   * Returns the head hash — the single value that fingerprints the whole
   * ledger.
   */
  function seal(entries) {
    const ordered = order(entries);
    let prev = GENESIS;
    for (const e of ordered) {
      e.prevHash = prev;
      e.hash = sha256(prev + "\u0000" + canonical(e));
      prev = e.hash;
    }
    return prev;
  }

  /** Posting order: by activity date, then by id, so it is deterministic. */
  function order(entries) {
    return entries.slice().sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  /**
   * Recompute the chain and compare it against the stored hashes.
   *
   * Returns a report naming the first broken block, if any, plus enough
   * detail for the UI to show what was expected and what was found.
   */
  function verify(entries, expectedHead) {
    const ordered = order(entries);
    const result = {
      total: ordered.length,
      checked: 0,
      ok: true,
      brokenAt: null,
      head: GENESIS,
      expectedHead: expectedHead || null,
      headMatches: true,
      firstBreak: null
    };

    let prev = GENESIS;
    for (const e of ordered) {
      const expected = sha256(prev + "\u0000" + canonical(e));
      result.checked++;
      if (e.hash && e.hash !== expected) {
        result.ok = false;
        result.brokenAt = e.id;
        result.firstBreak = {
          id: e.id, date: e.date, ref: e.ref || "",
          stored: e.hash, recomputed: expected,
          prevHash: prev
        };
        break;
      }
      prev = e.hash || expected;
    }

    result.head = prev;
    if (expectedHead) result.headMatches = prev === expectedHead && result.ok;
    return result;
  }

  /** Short display form of a digest: first 8 and last 6 characters. */
  const shortHash = h => (h ? `${h.slice(0, 8)}…${h.slice(-6)}` : "—");

  window.VL.Chain = { sha256, canonical, seal, verify, order, shortHash, GENESIS };
})();
