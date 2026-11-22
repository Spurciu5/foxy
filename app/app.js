// Foxy for phone: your fox to pet, your friends, pokes, notifications.
// Talks to the same server as Foxy for Windows (the phone has its own token, from a link code).
"use strict";

const RELAY_RAW = "https://foxy-relay.redbullhater1.workers.dev";
const RELAY = (RELAY_RAW.startsWith("__")
  ? new URLSearchParams(location.search).get("relay") || localStorage.getItem("foxy_relay") || ""
  : RELAY_RAW
).replace(/\/+$/, "");

const $ = (id) => document.getElementById(id);
// Inside the Android app (it adds real notifications through Firebase)
const NATIVE = !!window.FoxyNative;
const DPR = () => Math.min(window.devicePixelRatio || 1, 3);
const now = () => performance.now() / 1000;
const buzz = (p) => {
  try { navigator.vibrate && navigator.vibrate(p); } catch {}
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const S = {
  id: localStorage.getItem("foxy_id") || "",
  token: localStorage.getItem("foxy_ptoken") || "",
  me: { name: localStorage.getItem("foxy_name") || "", code: "", skin: +(localStorage.getItem("foxy_skin") || 0), acc: +(localStorage.getItem("foxy_acc") || 0), notify: false, push: false },
  friends: [],
  notes: [],
  unread: 0,
  view: "home", // home | friends | friend
  friend: null, // id while on a friend's page
  panel: null, // notes | settings
  ws: null,
  connected: false,
  outbox: [],
  backoff: 1000,
};

// ---------------- Small helpers ----------------

function friendById(id) {
  return S.friends.find((f) => f.id === id) || null;
}

function pokeable(f) {
  return !!f && (f.online || f.phone);
}

function statusOf(f) {
  if (!f) return ["", ""];
  if (f.online) return ["Online", "var(--green)"];
  if (f.phone) return ["On phone", "var(--blue)"];
  return ["Offline", "rgba(255,255,255,.3)"];
}

function ago(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  return Math.floor(s / 86400) + "d";
}

function noteText(n) {
  switch (n.kind) {
    case "poke": return n.n > 1 ? `poked you <span class="n">${n.n.toLocaleString()}</span> times` : "poked you";
    case "bonk": return "bonked you";
    case "kiss": return "kissed you";
    case "pie": return "threw a pie at you";
    default: return "came to visit";
  }
}

/** A small still fox on its own canvas */
function paintMini(cv, skin, acc, sleeping, css) {
  const d = DPR();
  cv.width = Math.round(css * d);
  cv.height = Math.round(css * d);
  const x = cv.getContext("2d");
  x.setTransform(d, 0, 0, d, 0, 0);
  x.clearRect(0, 0, css, css);
  const extra = acc ? 0.12 : 0;
  drawFox(x, css / 2, css * (0.56 + extra * 0.4), css * (0.78 - extra), 1.0, { skin, acc, sleeping });
}

function flameSvg() {
  return '<svg><use href="#i-flame"/></svg>';
}

// ---------------- Storage ----------------

function saveCreds() {
  localStorage.setItem("foxy_id", S.id);
  localStorage.setItem("foxy_ptoken", S.token);
  if (RELAY && RELAY_RAW.startsWith("__")) localStorage.setItem("foxy_relay", RELAY);
  // The service worker (push notifications) can't read localStorage
  if ("caches" in window) {
    caches.open("foxy-cred").then((c) => c.put("cred", new Response(JSON.stringify({ id: S.id, token: S.token, relay: RELAY })))).catch(() => {});
  }
}

function clearCreds() {
  for (const k of ["foxy_id", "foxy_ptoken", "foxy_name", "foxy_skin", "foxy_acc", "foxy_fcm"]) localStorage.removeItem(k);
  if ("caches" in window) caches.delete("foxy-cred").catch(() => {});
  S.id = S.token = "";
  S.friends = [];
  S.notes = [];
  S.unread = 0;
}

// ---------------- Connection ----------------

let pingTimer = null, reconnectTimer = null, connTimer = null;

function send(obj) {
  if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(obj));
  else S.outbox.push(obj);
}

function connect() {
  if (!S.id || !S.token || !RELAY || document.hidden) return;
  if (S.ws && S.ws.readyState < 2) return;
  clearTimeout(reconnectTimer);
  const url = RELAY.replace(/^http/, "ws") + `/ws?id=${encodeURIComponent(S.id)}&ptoken=${encodeURIComponent(S.token)}`;
  let ws;
  try { ws = new WebSocket(url); } catch { return scheduleReconnect(); }
  S.ws = ws;
  clearTimeout(connTimer);
  connTimer = setTimeout(() => !S.connected && $("conn").classList.remove("hidden"), 1500);
  ws.onopen = () => {
    S.connected = true;
    S.backoff = 1000;
    $("conn").classList.add("hidden");
    clearInterval(pingTimer);
    pingTimer = setInterval(() => ws.readyState === 1 && ws.send("ping"), 25000);
    const out = S.outbox.splice(0);
    for (const m of out) ws.send(JSON.stringify(m));
  };
  ws.onmessage = (e) => {
    if (e.data === "pong") return;
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    onMessage(m);
  };
  ws.onclose = (e) => {
    // Closed on purpose (app went to the background): don't come back by ourselves
    const ours = S.ws === ws;
    if (ours) S.ws = null;
    if (ours) S.connected = false;
    clearInterval(pingTimer);
    if (e.code === 4002) return unlinked();
    if (ours && !document.hidden && S.id) {
      $("conn").classList.remove("hidden");
      scheduleReconnect();
    }
  };
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, S.backoff);
  S.backoff = Math.min(S.backoff * 1.7, 15000);
}

function disconnect() {
  clearTimeout(reconnectTimer);
  clearInterval(pingTimer);
  if (S.ws) {
    const ws = S.ws;
    S.ws = null;
    try { ws.close(1000, "bye"); } catch {}
  }
  S.connected = false;
}

// Closed / in the background: the server pushes notifications instead
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    flushPokes(true);
    disconnect();
  } else if (S.id) {
    connect();
  }
});

function onMessage(m) {
  switch (m.t) {
    case "m_me":
      S.me = { ...S.me, name: m.name, code: m.code, skin: m.skin | 0, acc: m.acc | 0, notify: !!m.notify, push: !!m.push, fcmok: !!m.fcmok };
      // Android app: the Firebase token can change; keep the server's copy fresh
      if (NATIVE && m.notify && m.push) sendNativeToken(FoxyNative.pushToken());
      localStorage.setItem("foxy_name", m.name);
      localStorage.setItem("foxy_skin", S.me.skin);
      localStorage.setItem("foxy_acc", S.me.acc);
      $("meNameRow").textContent = m.name;
      $("meCodeRow").textContent = m.code;
      updateNotifyToggle();
      renderHeader();
      break;
    case "m_friends":
      S.friends = m.list || [];
      renderFriends();
      renderHeader();
      break;
    case "m_notes":
      S.notes = m.list || [];
      S.unread = S.panel === "notes" ? 0 : m.unread | 0;
      renderBadge();
      if (S.panel === "notes") renderNotes();
      break;
    case "poke": {
      const n = Math.max(1, m.vid | 0);
      const f = friendById(m.from);
      if (f) {
        f.skin = m.skin | 0;
        f.acc = m.acc | 0;
      }
      addLocalNote(m.from, m.name, m.skin | 0, m.acc | 0, "poke", n);
      showToast(m.from, m.name, m.skin | 0, m.acc | 0, n);
      // The fox on screen reacts
      if (S.view === "home" || (S.view === "friend" && S.friend === m.from)) {
        pet.hop = now();
        pet.lastTouch = now();
        burstHearts(stage.cx, stage.cy - stage.size * 0.35, 2);
      }
      break;
    }
    case "st": {
      const f = friendById(m.from);
      if (f) {
        const up = (m.vid | 0) > (f.streak | 0);
        f.streak = m.vid | 0;
        renderFriends();
        if (S.view === "friend" && S.friend === f.id) {
          renderHeader();
          if (up) {
            const chip = $("topStreak");
            chip.classList.remove("pop");
            void chip.offsetWidth;
            chip.classList.add("pop");
            buzz([12, 40, 12]);
          }
        }
      }
      break;
    }
    case "online":
    case "offline": {
      const f = friendById(m.from);
      if (f) {
        f.online = m.t === "online";
        renderFriends();
        renderHeader();
      }
      break;
    }
    case "m_phone": {
      const f = friendById(m.from);
      if (f) {
        f.phone = m.vid === 1;
        renderFriends();
        renderHeader();
      }
      break;
    }
    case "poke_err": {
      const f = friendById(m.to);
      if (f) {
        f.online = false;
        f.phone = false;
        renderFriends();
        renderHeader();
      }
      break;
    }
  }
}

// Pokes that came in while the app is open: added to the list right away
function addLocalNote(from, name, skin, acc, kind, n) {
  const day = new Date().toDateString();
  const hit = S.notes.find((x) => x.from === from && x.kind === kind && new Date(x.at).toDateString() === day);
  if (hit) {
    hit.n += n;
    hit.at = Date.now();
    S.notes.splice(S.notes.indexOf(hit), 1);
    S.notes.unshift(hit);
  } else {
    S.notes.unshift({ from, name, skin, acc, kind, n, at: Date.now() });
  }
  if (S.panel === "notes") renderNotes();
  else {
    S.unread++;
    renderBadge();
  }
}

// ---------------- Linking ----------------

function showLink() {
  $("main").classList.add("hidden");
  $("link").classList.remove("hidden");
  linkFox.start();
}

function showMain() {
  $("link").classList.add("hidden");
  $("main").classList.remove("hidden");
  linkFox.stop();
  renderHeader();
  renderFriends();
  renderBadge();
}

function unlinked() {
  disconnect();
  clearCreds();
  closePanel(true);
  setView("home", null, true);
  showLink();
}

$("codeInput").addEventListener("input", (e) => {
  const raw = e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 8);
  e.target.value = raw.length > 4 ? raw.slice(0, 4) + " " + raw.slice(4) : raw;
  $("linkMsg").textContent = "";
  linkFox.typing = now();
});
$("codeInput").addEventListener("focus", () => (linkFox.typing = now()));

$("linkForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = $("codeInput").value.replace(/\s/g, "");
  if (code.length < 8) {
    $("linkMsg").textContent = "The code has 8 letters";
    return;
  }
  if (!RELAY) {
    $("linkMsg").textContent = "No server address";
    return;
  }
  $("linkBtn").disabled = true;
  try {
    const r = await fetch(RELAY + "/m/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
    const j = await r.json().catch(() => ({}));
    if (j.ok) {
      S.id = j.id;
      S.token = j.token;
      S.me.name = j.name;
      localStorage.setItem("foxy_name", j.name);
      saveCreds();
      $("codeInput").value = "";
      showMain();
      connect();
    } else {
      $("linkMsg").textContent = j.error === "busy" ? "Too many tries, wait a bit" : "That code didn't work";
      buzz([20, 50, 20]);
    }
  } catch {
    $("linkMsg").textContent = "Couldn't reach Foxy, check your connection";
  }
  $("linkBtn").disabled = false;
});

// The sleepy fox on the link screen wakes up when you type
const linkFox = (() => {
  const cv = $("linkFox");
  let raf = 0;
  const o = {
    typing: -99,
    start() {
      if (raf) return;
      const loop = () => {
        const d = DPR(), css = 190;
        if (cv.width !== css * d) {
          cv.width = css * d;
          cv.height = css * d;
        }
        const x = cv.getContext("2d");
        x.setTransform(d, 0, 0, d, 0, 0);
        x.clearRect(0, 0, css, css);
        const awake = now() - o.typing < 6;
        drawFox(x, css / 2, css * 0.56, css * 0.66, now(), { sleeping: !awake, happy: awake && now() - o.typing < 0.6 });
        if (!awake) drawZ(x, css / 2 + css * 0.3, css * 0.3, css * 0.66, now());
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    },
  };
  return o;
})();

function drawZ(x, cx, cy, size, t) {
  for (let i = 0; i < 2; i++) {
    const p = (t * 0.45 + i * 0.5) % 1;
    x.save();
    x.globalAlpha = Math.sin(p * Math.PI) * 0.8;
    x.fillStyle = "#c9c3ff";
    x.font = `800 ${size * (0.1 + p * 0.08)}px ui-rounded, system-ui, sans-serif`;
    x.fillText("z", cx + p * size * 0.12, cy - p * size * 0.3);
    x.restore();
  }
}

// ---------------- Views ----------------

function setView(v, friendId = null, silent = false) {
  if (S.view === "friend" && v !== "friend") flushPokes(true);
  const was = S.view;
  S.view = v;
  if (v === "friend") S.friend = friendId;
  if (v !== "friend") S.friend = v === "friends" ? S.friend : null;
  $("friends").classList.toggle("open", v === "friends");
  $("pokeArea").classList.toggle("hidden", v !== "friend");
  $("btnSettings").classList.toggle("hidden", v === "friend");
  $("btnBack").classList.toggle("hidden", v !== "friend");
  $("btnBell").classList.toggle("hidden", v === "friend");
  $("topStreak").classList.toggle("hidden", v !== "friend");
  const tab = $("tabBtn");
  tab.innerHTML = v === "friends"
    ? '<svg><use href="#i-home"/></svg><span>My fox</span>'
    : '<svg><use href="#i-friends"/></svg><span>Friends</span>';
  if (v !== was) resetPet();
  combo.reset();
  renderHeader();
  if (!silent && (v === "friends" || v === "friend")) history.pushState({ v }, "");
}

function renderHeader() {
  const title = $("topTitle"), sub = $("topSub");
  if (S.view === "friend") {
    const f = friendById(S.friend);
    title.textContent = f ? f.name : "";
    const [label, col] = statusOf(f);
    sub.innerHTML = f ? `<i class="dot" style="background:${col}"></i>${label}` : "";
    const chip = $("topStreak");
    chip.querySelector("b").textContent = f ? f.streak | 0 : 0;
    chip.classList.toggle("zero", !f || !(f.streak > 0));
    const btn = $("pokeBtn");
    btn.classList.toggle("off", !pokeable(f));
    btn.querySelector("span").textContent = pokeable(f) ? "Poke" : "Offline";
  } else {
    title.textContent = S.me.name || "Foxy";
    sub.textContent = "";
  }
}

function renderBadge() {
  const b = $("badge");
  b.textContent = S.unread > 99 ? "99+" : S.unread;
  b.classList.toggle("hidden", !S.unread);
}

function renderFriends() {
  const list = $("friendList");
  const fr = [...S.friends].sort((a, b) => (pokeable(b) - pokeable(a)) || (b.online - a.online) || a.name.localeCompare(b.name));
  $("friendCount").textContent = S.friends.length ? S.friends.length : "";
  $("noFriends").classList.toggle("hidden", S.friends.length > 0);
  list.innerHTML = "";
  for (const f of fr) {
    const [label, col] = statusOf(f);
    const row = document.createElement("button");
    row.className = "frow";
    row.innerHTML = `<canvas></canvas><span class="nm"><b>${esc(f.name)}</b><small><i class="dot" style="background:${col}"></i>${label}</small></span><span class="st${f.streak > 0 ? "" : " zero"}">${flameSvg()}${f.streak | 0}</span>`;
    paintMini(row.querySelector("canvas"), f.skin | 0, f.acc | 0, !f.online, 54);
    row.addEventListener("click", () => openFriend(f.id));
    list.appendChild(row);
  }
}

function openFriend(id) {
  if (S.view === "friends") {
    // Replace the list's history entry with the friend's page (back returns to the list)
    S.view = "friends";
  }
  setView("friend", id);
}

function renderNotes() {
  const list = $("noteList");
  list.innerHTML = "";
  $("noNotes").classList.toggle("hidden", S.notes.length > 0);
  for (const n of S.notes) {
    const row = document.createElement("div");
    row.className = "nrow" + (n.at > notesSeenBefore ? " new" : "");
    row.innerHTML = `<canvas></canvas><span class="tx"><b>${esc(n.name)}</b> ${noteText(n)}</span><span class="tm">${ago(n.at)}</span>`;
    paintMini(row.querySelector("canvas"), n.skin | 0, n.acc | 0, false, 46);
    list.appendChild(row);
  }
}

// ---------------- Panels ----------------

let notesSeenBefore = 0;

function openPanel(name) {
  if (S.panel) closePanel(true);
  S.panel = name;
  $(name).classList.add("open");
  $("scrim").classList.add("on");
  if (name === "notes") {
    notesSeenBefore = Date.now() - 1;
    // Everything up to now counts as seen once the list was opened; highlight what was new
    const newest = S.notes.length ? S.notes[0].at : 0;
    notesSeenBefore = S.unread ? Math.min(...S.notes.slice(0, S.unread).map((n) => n.at)) - 1 : newest + 1;
    S.unread = 0;
    renderBadge();
    renderNotes();
    send({ t: "m_seen" });
    send({ t: "m_notes" });
  }
  history.pushState({ p: name }, "");
}

function closePanel(silent) {
  if (!S.panel) return;
  $(S.panel).classList.remove("open");
  $("scrim").classList.remove("on");
  S.panel = null;
  if (!silent) history.back();
}

// One step back (Android back button, the back arrow, the tab button)
window.addEventListener("popstate", () => {
  if (S.panel) return closePanel(true);
  if (S.view === "friend") return setView("friends", null, true);
  if (S.view === "friends") return setView("home", null, true);
});

$("btnSettings").addEventListener("click", () => openPanel("settings"));
$("btnBell").addEventListener("click", () => openPanel("notes"));
$("scrim").addEventListener("click", () => history.back());
for (const b of document.querySelectorAll("[data-close]")) b.addEventListener("click", () => history.back());
$("btnBack").addEventListener("click", () => history.back());
$("tabBtn").addEventListener("click", () => {
  if (S.view === "home") setView("friends");
  else history.back();
});

// ---------------- Notifications setting ----------------

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function standalone() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function updateNotifyToggle() {
  const granted = NATIVE ? FoxyNative.notifyPermission() === "granted" : "Notification" in window && Notification.permission === "granted";
  $("notifyToggle").checked = S.me.notify && S.me.push && granted;
}

function notifyNote(text) {
  const n = $("notifyNote");
  n.textContent = text || "";
  n.classList.toggle("hidden", !text);
}

function b64uBytes(s) {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

$("notifyToggle").addEventListener("change", async (e) => {
  const on = e.target.checked;
  notifyNote("");
  if (!on) {
    S.me.notify = false;
    send({ t: "m_push", notify: false });
    return;
  }
  e.target.checked = false;
  if (NATIVE) {
    if (!S.me.fcmok) return notifyNote("Notifications aren't ready on the server yet");
    nativeWant = true;
    FoxyNative.requestNotify();
    return;
  }
  if (isIOS() && !standalone()) return notifyNote("Add Foxy to your Home Screen first (Share › Add to Home Screen)");
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return notifyNote("This browser can't show notifications");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return notifyNote("Notifications are blocked in the browser settings");
  try {
    const key = await (await fetch(RELAY + "/m/vapid")).json();
    if (!key.ok) return notifyNote("Notifications aren't ready on the server yet");
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(key.key) });
    saveCreds();
    send({ t: "m_push", sub: sub.toJSON(), notify: true });
    S.me.notify = S.me.push = true;
    e.target.checked = true;
  } catch {
    notifyNote("Couldn't turn on notifications");
  }
});

// ---- Android app ----
let nativeWant = false;

function sendNativeToken(tok) {
  if (!tok || tok === localStorage.getItem("foxy_fcm")) return;
  send({ t: "m_push", fcm: tok, notify: true });
  localStorage.setItem("foxy_fcm", tok);
}

// Android answered the notification permission
window.foxyNativeNotify = (state) => {
  if (!nativeWant) return updateNotifyToggle();
  if (state !== "granted") {
    nativeWant = false;
    notifyNote("Notifications are off for Foxy in Android settings");
    FoxyNative.openNotifySettings();
    return;
  }
  const tok = FoxyNative.pushToken();
  if (tok) finishNative(tok);
};

// Firebase gave a token (at start, or after the permission)
window.foxyNativeToken = (tok) => {
  if (nativeWant) return finishNative(tok);
  if (S.me.notify && S.me.push) sendNativeToken(tok);
};

function finishNative(tok) {
  nativeWant = false;
  localStorage.removeItem("foxy_fcm");
  sendNativeToken(tok);
  S.me.notify = S.me.push = true;
  $("notifyToggle").checked = true;
}

// A newer Android app (android.bat publishes phone.json next to this page)
let updInfo = null;

async function checkAppUpdate() {
  if (!NATIVE || !FoxyNative.versionCode) return;
  try {
    const j = await (await fetch("phone.json?" + Date.now(), { cache: "no-store" })).json();
    if (j && j.vc > FoxyNative.versionCode() && /^https:\/\//.test(j.url)) {
      updInfo = j;
      $("updText").textContent = `Foxy ${j.vn} is out`;
      $("updBtn").disabled = false;
      $("updBtn").textContent = "Update";
      $("upd").classList.remove("hidden");
    }
  } catch {}
}

$("updBtn").addEventListener("click", () => {
  if (!updInfo) return;
  $("updBtn").disabled = true;
  $("updBtn").textContent = "0%";
  FoxyNative.installUpdate(updInfo.url);
});

// Download progress from the app: a number, "done", "allow" (Android asks first) or "error"
window.foxyNativeUpdate = (st) => {
  const b = $("updBtn");
  if (st === "done") {
    b.textContent = "Install";
    b.disabled = false;
  } else if (st === "allow") {
    $("updText").textContent = "Allow Foxy to install updates, then tap again";
    b.textContent = "Update";
    b.disabled = false;
  } else if (st === "error") {
    $("updText").textContent = "Couldn't download the update";
    b.textContent = "Retry";
    b.disabled = false;
  } else {
    b.textContent = st + "%";
  }
};

// The app went to the background / came back
window.foxyNativeVisible = (visible) => {
  if (!visible) {
    flushPokes(true);
    disconnect();
  } else if (S.id) {
    connect();
    updateNotifyToggle();
    checkAppUpdate();
  }
};

$("unlinkBtn").addEventListener("click", () => {
  if (!confirm("Unlink this phone from your Foxy?")) return;
  send({ t: "m_unlink" });
  setTimeout(unlinked, 300);
});

// ---------------- In-app banner ----------------

const toast = { from: null, n: 0, timer: 0 };

function showToast(from, name, skin, acc, n) {
  const el = $("toast");
  if (toast.from === from && el.classList.contains("on")) toast.n += n;
  else {
    toast.from = from;
    toast.n = n;
    el.innerHTML = `<canvas></canvas><span><b>${esc(name)}</b> poked you <span class="n"></span></span>`;
    paintMini(el.querySelector("canvas"), skin, acc, false, 38);
  }
  el.querySelector(".n").textContent = toast.n > 1 ? "×" + toast.n.toLocaleString() : "";
  el.classList.add("on");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("on"), 2600);
  buzz(10);
}

// ---------------- Poking ----------------

const combo = {
  n: 0,
  at: 0,
  best: 0,
  timer: 0,
  tap() {
    const t = now();
    this.n = t - this.at < 1.5 ? this.n + 1 : 1;
    this.at = t;
    this.best = Math.max(this.best, this.n);
    const el = $("combo");
    el.textContent = this.n >= 2 ? "×" + this.n.toLocaleString() : "";
    el.classList.toggle("on", this.n >= 2);
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => el.classList.remove("on"), 1500);
  },
  reset() {
    this.n = 0;
    this.at = 0;
    $("combo").classList.remove("on");
  },
};

const pokes = { pending: 0, to: null, lastSent: 0, best: 0 };

function pokeOnce() {
  const f = friendById(S.friend);
  if (!pokeable(f)) {
    buzz([15, 40, 15]);
    return;
  }
  if (pokes.to && pokes.to !== f.id) flushPokes(true);
  pokes.to = f.id;
  pokes.pending++;
  combo.tap();
  pokes.best = Math.max(pokes.best, combo.n);
  pet.hop = now();
  pet.lastTouch = now();
  addParticle({ kind: "plus", x: stage.cx + (Math.random() - 0.5) * stage.size * 0.7, y: stage.cy - stage.size * 0.45, vy: -70, life: 0.9 });
  buzz(8);
  flushPokes(false);
}

/** At most one message a second (the count is added up), like on the PC */
function flushPokes(force) {
  if (!pokes.pending || !pokes.to) return;
  const t = now();
  if (!force && t - pokes.lastSent < 1) return;
  if (!S.connected) {
    if (!force) return;
  }
  send({ t: "poke", to: pokes.to, vid: pokes.pending, combo: pokes.best });
  pokes.pending = 0;
  pokes.best = combo.n;
  pokes.lastSent = t;
}
setInterval(() => flushPokes(false), 200);

$("pokeBtn").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  pokeOnce();
});

// ---------------- The big fox: petting ----------------

const stage = { cv: $("foxCanvas"), w: 0, h: 0, cx: 0, cy: 0, size: 0 };
const particles = [];

function addParticle(p) {
  particles.push({ age: 0, vx: 0, vy: -40, life: 1.2, size: 1, ...p });
  if (particles.length > 80) particles.shift();
}

function burstHearts(x, y, n) {
  for (let i = 0; i < n; i++) {
    addParticle({ kind: "heart", x: x + (Math.random() - 0.5) * 40, y: y + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 60, vy: -60 - Math.random() * 50, life: 1.3 + Math.random() * 0.4, size: 0.8 + Math.random() * 0.5 });
  }
}

/** Everything the fox feels right now (springs ease toward their targets) */
const pet = {};
function resetPet() {
  Object.assign(pet, {
    earL: 0, earLv: 0, earR: 0, earRv: 0,
    lean: 0, leanT: 0, chin: 0, chinT: 0, press: 0, pressT: 0, squish: 0, squishT: 0,
    blush: 0, bliss: 0, surprise: 0, angry: 0, heartsUntil: 0, hop: -99,
    lookX: 0, lookY: 0, lookTX: 0, lookTY: 0, lookUntil: 0,
    down: null, taps: [], lastTouch: now(), lastPurr: 0, lastHeart: 0, woke: -99,
  });
}
resetPet();

function zoneAt(px, py) {
  const [x, y] = foxLocal(px, py, stage.cx, stage.cy, stage.size);
  for (const s of [-1, 1]) if (Math.hypot(x - s * 0.62, y + 0.74) < 0.34) return { z: s < 0 ? "earL" : "earR", x, y, side: s };
  if (Math.hypot(x, y - 0.33) < 0.17) return { z: "nose", x, y, side: 0 };
  if (y > 0.5 && y < 1.0 && Math.abs(x) < 0.55) return { z: "chin", x, y, side: 0 };
  if (Math.abs(x) > 0.42 && Math.abs(x) < 1.12 && y > -0.05 && y < 0.62) return { z: "cheek", x, y, side: Math.sign(x) };
  if ((x / 0.98) ** 2 + ((y + 0.05) / 0.86) ** 2 < 1) return { z: y < 0 ? "head" : "face", x, y, side: 0 };
  return { z: null, x, y, side: Math.sign(x) };
}

function asleep() {
  const t = now();
  if (t - pet.lastTouch < 6) return false;
  if (S.view === "friend") {
    const f = friendById(S.friend);
    return !f || !f.online;
  }
  return t - pet.lastTouch > 45;
}

function twitch(side, power) {
  if (side <= 0) pet.earLv += power;
  if (side >= 0) pet.earRv += power;
}

const cv = stage.cv;

cv.addEventListener("pointerdown", (e) => {
  cv.setPointerCapture(e.pointerId);
  const t = now();
  const wasAsleep = asleep();
  const z = zoneAt(e.offsetX, e.offsetY);
  pet.down = { x: e.offsetX, y: e.offsetY, t, moved: 0, zone: z.z, side: z.side, lx: e.offsetX, ly: e.offsetY };
  pet.lastTouch = t;
  if (wasAsleep && z.z) {
    // Woken up: a little startle
    pet.surprise = 1;
    pet.woke = t;
    twitch(0, 9);
    buzz(12);
  }
  if (z.z === "earL" || z.z === "earR") twitch(z.side, 14);
  // Eyes follow the finger
  pet.lookTX = Math.max(-1, Math.min(1, z.x * 1.4));
  pet.lookTY = Math.max(-1, Math.min(1, z.y * 1.2));
  pet.lookUntil = t + 2;
});

cv.addEventListener("pointermove", (e) => {
  const d = pet.down;
  if (!d) return;
  const t = now();
  const dx = e.offsetX - d.lx, dy = e.offsetY - d.ly;
  const dist = Math.hypot(dx, dy);
  d.moved += dist;
  d.lx = e.offsetX;
  d.ly = e.offsetY;
  pet.lastTouch = t;
  const z = zoneAt(e.offsetX, e.offsetY);
  d.zone = z.z || d.zone;
  pet.lookTX = Math.max(-1, Math.min(1, z.x * 1.4));
  pet.lookTY = Math.max(-1, Math.min(1, z.y * 1.2));
  pet.lookUntil = t + 2;
  if (!z.z || d.moved < 10) return;
  // Stroking: the fox melts into it
  const k = Math.min(dist, 40) / stage.size;
  pet.bliss = Math.min(1, pet.bliss + k * 0.55);
  if (z.z === "head" || z.z === "face") {
    pet.pressT = 1;
    pet.leanT = Math.max(-1, Math.min(1, pet.leanT * 0.8 + (dx / stage.size) * 6));
  } else if (z.z === "chin") {
    pet.chinT = 1;
  } else if (z.z === "cheek") {
    pet.squishT = z.side;
    pet.leanT = z.side * 0.7;
    pet.blush = Math.min(1, pet.blush + k * 0.6);
  } else if (z.z === "earL" || z.z === "earR") {
    // Stroking an ear folds it back a little
    if (z.side < 0) pet.earL = Math.max(pet.earL, 0.35);
    else pet.earR = Math.max(pet.earR, 0.35);
  }
  // Purring (a soft buzz) and a heart now and then
  if (pet.bliss > 0.3 && t - pet.lastPurr > 0.35) {
    pet.lastPurr = t;
    buzz(5);
  }
  if (t - pet.lastHeart > 0.55 - pet.bliss * 0.3) {
    pet.lastHeart = t;
    burstHearts(e.offsetX, e.offsetY - 20, 1);
  }
  if (pet.bliss >= 1) {
    // Too happy: heart eyes and a shower of hearts
    pet.bliss = 0.55;
    pet.heartsUntil = t + 2.2;
    burstHearts(stage.cx, stage.cy - stage.size * 0.3, 7);
    buzz([10, 30, 10, 30, 10]);
  }
});

function pointerEnd() {
  const d = pet.down;
  pet.down = null;
  pet.pressT = 0;
  pet.chinT = 0;
  pet.squishT = 0;
  pet.leanT = 0;
  if (!d) return;
  const t = now();
  if (d.moved > 14 || t - d.t > 0.35) return;
  // A tap
  pet.taps = pet.taps.filter((x) => t - x < 2.5);
  pet.taps.push(t);
  if (pet.taps.length >= 8) {
    // Too many taps: grumpy for a moment
    pet.taps = [];
    pet.angry = 1;
    buzz([30, 40, 30]);
    return;
  }
  switch (d.zone) {
    case "head":
    case "face":
      pet.hop = t;
      pet.blush = Math.min(1, pet.blush + 0.15);
      pet.bliss = Math.min(0.95, pet.bliss + 0.12);
      burstHearts(d.x, d.y - 10, 1);
      buzz(10);
      break;
    case "nose":
      // Boop!
      pet.surprise = 1;
      twitch(0, 10);
      addParticle({ kind: "spark", x: d.x, y: d.y - 10, vy: -30, life: 0.6 });
      buzz(14);
      break;
    case "earL":
    case "earR":
      twitch(d.side, 18);
      pet.giggle = t;
      buzz(8);
      break;
    case "cheek":
      pet.squish = d.side;
      pet.blush = Math.min(1, pet.blush + 0.25);
      pet.lean = d.side * 0.5;
      buzz(8);
      break;
    case "chin":
      pet.chin = 1;
      pet.giggle = t;
      buzz(8);
      break;
    default:
      // Missed: ears perk up, eyes look over
      twitch(0, 6);
  }
}
cv.addEventListener("pointerup", pointerEnd);
cv.addEventListener("pointercancel", pointerEnd);

function step(dt) {
  const t = now();
  const ease = (cur, target, speed) => cur + (target - cur) * Math.min(1, speed * dt);
  // Ear springs (wobble back to rest)
  for (const k of ["earL", "earR"]) {
    const v = k + "v";
    pet[v] += (-pet[k] * 160 - pet[v] * 11) * dt;
    pet[k] += pet[v] * dt;
    pet[k] = Math.max(-0.5, Math.min(0.7, pet[k]));
  }
  pet.press = ease(pet.press, pet.pressT, 8);
  pet.chin = ease(pet.chin, pet.chinT, 6);
  pet.squish = ease(pet.squish, pet.squishT, 9);
  pet.lean = ease(pet.lean, pet.leanT, 5);
  pet.surprise = Math.max(0, pet.surprise - dt * 1.6);
  pet.angry = Math.max(0, pet.angry - dt * 0.7);
  if (!pet.down) pet.bliss = Math.max(0, pet.bliss - dt * 0.12);
  pet.blush = Math.max(pet.bliss * 0.6, pet.blush - dt * 0.15);
  if (t > pet.lookUntil) {
    pet.lookTX = 0;
    pet.lookTY = 0;
  }
  pet.lookX = ease(pet.lookX, pet.lookTX, 7);
  pet.lookY = ease(pet.lookY, pet.lookTY, 7);
  // Ears twitch by themselves now and then
  if (Math.random() < dt * 0.12 && !asleep()) twitch(Math.random() < 0.5 ? -1 : 1, 7);
}

function resize() {
  const r = cv.getBoundingClientRect();
  const d = DPR();
  stage.w = r.width;
  stage.h = r.height;
  cv.width = Math.round(r.width * d);
  cv.height = Math.round(r.height * d);
  layout();
}

function layout() {
  const w = stage.w, h = stage.h;
  if (S.view === "friend") {
    stage.size = Math.min(w * 0.6, (h - 140) * 0.62);
    stage.cx = w / 2;
    stage.cy = (h - 120) * 0.5 + 10;
  } else {
    stage.size = Math.min(w * 0.66, h * 0.56);
    stage.cx = w / 2;
    stage.cy = h * 0.47;
  }
}

new ResizeObserver(resize).observe(cv);

let last = now();
function frame() {
  const t = now();
  const dt = Math.min(0.05, t - last);
  last = t;
  if (!$("main").classList.contains("hidden") && S.view !== "friends") {
    layout();
    step(dt);
    const x = cv.getContext("2d");
    const d = DPR();
    x.setTransform(d, 0, 0, d, 0, 0);
    x.clearRect(0, 0, stage.w, stage.h);
    const f = S.view === "friend" ? friendById(S.friend) : null;
    const look = f ? { skin: f.skin | 0, acc: f.acc | 0 } : { skin: S.me.skin, acc: S.me.acc };
    const sleeping = asleep();
    // Soft shadow under the fox
    const g = x.createRadialGradient(stage.cx, stage.cy + stage.size * 0.52, 0, stage.cx, stage.cy + stage.size * 0.52, stage.size * 0.5);
    g.addColorStop(0, "rgba(0,0,0,0.28)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.beginPath();
    x.ellipse(stage.cx, stage.cy + stage.size * 0.52, stage.size * 0.5, stage.size * 0.1, 0, 0, Math.PI * 2);
    x.fill();
    const hopP = (t - pet.hop) / 0.9;
    const giggle = t - (pet.giggle || -9) < 0.8;
    const touching = !!pet.down && !!pet.down.zone;
    drawFox(x, stage.cx, stage.cy, stage.size, t, {
      ...look,
      sleeping: sleeping && !touching,
      happy: !sleeping && (touching || pet.bliss > 0.15 || giggle || (hopP >= 0 && hopP < 1)),
      pet: hopP >= 0 && hopP < 1 ? hopP : 0,
      hearts: t < pet.heartsUntil,
      blush: pet.blush,
      lean: pet.lean,
      earL: pet.earL,
      earR: pet.earR,
      chin: pet.chin,
      press: pet.press,
      squish: pet.squish,
      surprise: pet.surprise,
      angry: pet.angry,
      purr: touching ? pet.bliss : 0,
      lookX: pet.lookX,
      lookY: pet.lookY,
    });
    if (sleeping && !touching) drawZ(x, stage.cx + stage.size * 0.32, stage.cy - stage.size * 0.3, stage.size, t);
    drawParticles(x, dt);
  }
  requestAnimationFrame(frame);
}

function drawParticles(x, dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += dt;
    if (p.age >= p.life) {
      particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - dt * 1.5;
    const k = p.age / p.life;
    const a = Math.min(1, (1 - k) * 1.6) * Math.min(1, p.age * 8);
    if (p.kind === "heart") {
      foxHeart(x, p.x, p.y, 22 * p.size * (0.8 + 0.2 * Math.sin(p.age * 8)), `rgba(255,90,130,${a})`);
    } else if (p.kind === "plus") {
      x.save();
      x.globalAlpha = a;
      x.fillStyle = "#ffb27a";
      x.font = `900 ${26 + 8 * (1 - k)}px ui-rounded, system-ui, sans-serif`;
      x.textAlign = "center";
      x.fillText("+1", p.x, p.y);
      x.restore();
    } else if (p.kind === "spark") {
      x.save();
      x.globalAlpha = a;
      x.strokeStyle = "#fff3c4";
      x.lineWidth = 3;
      x.lineCap = "round";
      for (let j = 0; j < 6; j++) {
        const an = (j / 6) * Math.PI * 2;
        const r0 = 8 + k * 14, r1 = 14 + k * 22;
        x.beginPath();
        x.moveTo(p.x + Math.cos(an) * r0, p.y + Math.sin(an) * r0);
        x.lineTo(p.x + Math.cos(an) * r1, p.y + Math.sin(an) * r1);
        x.stroke();
      }
      x.restore();
    }
  }
}

// ---------------- Start ----------------

if (!NATIVE && "serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

if (S.id && S.token) {
  showMain();
  saveCreds();
  connect();
} else {
  showLink();
}
checkAppUpdate();
requestAnimationFrame(frame);
