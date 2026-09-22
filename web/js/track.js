/* ══════════════════════════════════════════════════════════════════════
   track.js — records what happens on the site into the API's database.

   Page views, clicks on buttons and links, and anything a view reports
   through V.track(kind, detail) are queued and posted to /api/events in
   batches. If the API is unreachable the queue waits in localStorage
   (capped) and is sent the next time it is up, so nothing is lost.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  const V = (window.V = window.V || {});
  const KEY = "vl.events", CAP = 500;
  const base = () => V.API_BASE || window.VERDANT_API || "http://127.0.0.1:8000";

  let sid;
  try { sid = sessionStorage.getItem("vl.sid"); } catch (_) {}
  if (!sid) {
    sid = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    try { sessionStorage.setItem("vl.sid", sid); } catch (_) {}
  }

  let queue = [];
  try { queue = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (_) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(queue.slice(-CAP))); } catch (_) {} };

  V.track = (kind, detail) => {
    queue.push({ kind, path: location.hash || "#/", detail: detail || null });
    if (queue.length > CAP) queue = queue.slice(-CAP);
    save();
  };

  // When the API is down, wait longer between attempts (5 s doubling to
  // 5 min) instead of retrying every few seconds for the whole visit.
  let sending = false, wait = 5000, nextTry = 0;
  async function flush() {
    if (sending || !queue.length || Date.now() < nextTry) return;
    sending = true;
    const batch = queue.slice(0, 50);
    try {
      const res = await fetch(base() + "/api/events", {
        method: "POST", keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sid, events: batch }),
      });
      if (!res.ok) throw new Error(res.status);
      queue = queue.slice(batch.length); save(); wait = 5000;
    } catch (_) {           // offline: keep the queue, back off
      nextTry = Date.now() + wait; wait = Math.min(wait * 2, 300000);
    }
    sending = false;
  }

  V.track("view");
  addEventListener("hashchange", () => V.track("view"));
  document.addEventListener("click", e => {
    const el = e.target.closest("a,button,[role=button]");
    if (!el) return;
    V.track("click", {
      id: el.id || undefined,
      text: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 60),
      href: el.getAttribute("href") || undefined,
    });
  }, true);
  setInterval(flush, 5000);
  addEventListener("pagehide", flush);
})();
