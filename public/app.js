import { briefHtml, splitBrief } from "/lib/brief-format.js";
import { previewUrl } from "/lib/preview-url.js";

const setup = document.querySelector("#setup");
const desk = document.querySelector("#desk");
const who = document.querySelector("#who");
const liWho = document.querySelector("#li-who");
const setupAgain = document.querySelector("#setup-again");
const disconnectHeader = document.querySelector("#disconnect-header");
const disconnectXBtn = document.querySelector("#disconnect-x");
const disconnectLiBtn = document.querySelector("#disconnect-linkedin");
const xStatus = document.querySelector("#x-status");
const liStatus = document.querySelector("#linkedin-status");
const keyStatus = document.querySelector("#key-status");
const aiGrokBtn = document.querySelector("#ai-grok");
const aiOpenCodeBtn = document.querySelector("#ai-opencode");
const openCodeFields = document.querySelector("#opencode-fields");
const openCodeKeyEl = document.querySelector("#opencode-key");
const saveOpenCodeBtn = document.querySelector("#save-opencode");
const aiPick = document.querySelector("#ai-pick");
const veil = document.querySelector("#veil");
const veilMsg = document.querySelector("#veil-msg");
const welcome = document.querySelector("#welcome");
const thread = document.querySelector("#thread");
const chat = document.querySelector("#chat");
const goalEl = document.querySelector("#goal");
let stayOnSetup = false;

function showVeil(text) {
  veilMsg.textContent = text;
  veil.hidden = false;
}
function hideVeil() {
  veil.hidden = true;
}

function xIsConnected(username) {
  return Boolean(username && String(username).toLowerCase() !== "x");
}

function paintXState(username) {
  who.textContent = xIsConnected(username) ? "X connected" : "X not connected";
}

function paintLinkedInState(connected) {
  liWho.textContent = connected ? "LinkedIn connected" : "LinkedIn not connected";
}

function paintConnectionState(status) {
  paintXState(status.x);
  paintLinkedInState(status.linkedin);
}

function showDesk(status) {
  hidePreview();
  setup.hidden = true;
  desk.hidden = false;
  setupAgain.hidden = false;
  disconnectHeader.hidden = !status.x;
  disconnectXBtn.hidden = true;
  paintConnectionState(status);
  aiPick.hidden = false;
  goalEl.focus();
}

function showSetup(status) {
  hidePreview();
  setup.hidden = false;
  desk.hidden = true;
  setupAgain.hidden = true;
  disconnectHeader.hidden = !status.x;
  disconnectXBtn.hidden = !status.x;
  disconnectLiBtn.hidden = !status.linkedin;
  paintConnectionState(status);
  aiPick.hidden = true;
  xStatus.textContent = xIsConnected(status.x) ? "X connected" : "";
  liStatus.textContent = status.linkedin ? "LinkedIn connected" : "";
  paintAi(status);
}

function paintAi(status) {
  const provider = status.provider === "opencode" ? "opencode" : "grok";
  aiPick.value = provider;
  aiGrokBtn.classList.toggle("ghost", provider !== "grok");
  aiOpenCodeBtn.classList.toggle("ghost", provider !== "opencode");
  openCodeFields.hidden = provider !== "opencode";
  if (provider === "opencode") {
    const oc = status.opencode || {};
    if (oc.key) openCodeKeyEl.value = oc.key;
    keyStatus.textContent = oc.ok
      ? `OpenCode API ready (${oc.model}).`
      : oc.error || "Add an OpenCode API key.";
  } else {
    keyStatus.textContent = status.grok?.ok
      ? `Grok CLI ready (${status.grok.model}).`
      : status.grok?.error || "Grok CLI was not found.";
  }
}

async function disconnectX() {
  showVeil("Disconnecting…");
  try {
    const res = await fetch("/api/disconnect-x", { method: "POST" });
    const data = await res.json();
    hideVeil();
    if (!data.ok) {
      xStatus.textContent = data.error || "Could not disconnect.";
      return;
    }
    stayOnSetup = true;
    await refresh();
  } catch (err) {
    hideVeil();
    xStatus.textContent = err.message;
  }
}

disconnectHeader.addEventListener("click", disconnectX);
disconnectXBtn.addEventListener("click", disconnectX);

async function refresh() {
  const res = await fetch("/api/status");
  const data = await res.json();
  if (data.ready && !stayOnSetup) {
    showDesk(data);
    paintAi(data);
  } else showSetup(data);
}

async function saveAi(body) {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  await refresh();
  return data;
}

aiGrokBtn.addEventListener("click", () => saveAi({ provider: "grok" }));
aiOpenCodeBtn.addEventListener("click", () => saveAi({ provider: "opencode" }));
saveOpenCodeBtn.addEventListener("click", async () => {
  const key = openCodeKeyEl.value;
  stayOnSetup = true;
  const data = await saveAi({ provider: "opencode", opencode_key: key.trim() });
  openCodeKeyEl.value = key;
  keyStatus.textContent = data.ok ? "API key saved" : data.error || "Could not save the API key.";
});
aiPick.addEventListener("change", () => saveAi({ provider: aiPick.value }));

setupAgain.addEventListener("click", () => {
  stayOnSetup = true;
  refresh();
});

function afterSlideAsync() {
  return new Promise((resolve) => afterSlide(resolve));
}

async function openDrawerChrome(title) {
  drawerTitle.textContent = title || "";
  document.body.classList.add("drawer-open");
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  if (!previewOpen) await afterSlideAsync();
  previewOpen = true;
  if (native?.setDrawerBounds) await native.setDrawerBounds(drawerBox());
}

document.querySelector("#connect-linkedin").addEventListener("click", async () => {
  stayOnSetup = true;
  liStatus.textContent = "Sign in in the panel on the right.";
  await openDrawerChrome("Sign in to LinkedIn");
  const keepBounds = setInterval(() => {
    if (native?.setDrawerBounds) native.setDrawerBounds(drawerBox());
  }, 300);
  try {
    const res = await fetch("/api/connect-linkedin", { method: "POST" });
    const data = await res.json();
    clearInterval(keepBounds);
    await hidePreview();
    if (!data.ok) {
      liStatus.textContent = data.error || "Could not connect.";
      return;
    }
    liStatus.textContent = "LinkedIn connected";
    await refresh();
  } catch (err) {
    clearInterval(keepBounds);
    await hidePreview();
    liStatus.textContent = err.message;
  }
});

disconnectLiBtn.addEventListener("click", async () => {
  stayOnSetup = true;
  showVeil("Disconnecting LinkedIn…");
  try {
    const res = await fetch("/api/disconnect-linkedin", { method: "POST" });
    const data = await res.json();
    hideVeil();
    if (!data.ok) {
      liStatus.textContent = data.error || "Could not disconnect.";
      return;
    }
    await refresh();
  } catch (err) {
    hideVeil();
    liStatus.textContent = err.message;
  }
});

document.querySelector("#connect-x").addEventListener("click", async () => {
  showVeil("Opening X login in Google Chrome. Sign in there.");
  try {
    const res = await fetch("/api/connect-x", { method: "POST" });
    const data = await res.json();
    hideVeil();
    if (!data.ok) {
      xStatus.textContent = data.error || "Could not connect.";
      return;
    }
    xStatus.textContent = "X connected";
    stayOnSetup = false;
    await refresh();
  } catch (err) {
    hideVeil();
    xStatus.textContent = err.message;
  }
});

chat.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const goal = goalEl.value.trim();
  if (!goal) return;
  await hidePreview();
  goalEl.value = "";
  welcome.hidden = true;
  thread.hidden = false;
  desk.classList.add("has-thread");
  thread.insertAdjacentHTML("beforeend", `<div class="bubble you"><p>${escapeHtml(goal)}</p></div>`);
  const pending = document.createElement("div");
  setThink(pending, "Opening your X home timeline.");
  thread.appendChild(pending);
  thread.scrollTop = thread.scrollHeight;
  try {
    const res = await fetch("/api/brief", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ goal }),
    });
    const ctype = res.headers.get("content-type") || "";
    if (!ctype.includes("text/event-stream")) {
      const data = await res.json();
      if (!data.ok) paintBrief(pending, data.error || "Failed.");
      else paintFinal(pending, data);
    } else {
      await readBriefStream(res, pending);
    }
  } catch (err) {
    paintBrief(pending, err.message);
  }
  thread.scrollTop = thread.scrollHeight;
});

async function readBriefStream(res, pending) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let event = "message";
  const state = { cards: [], posts: [] };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
        continue;
      }
      if (!line.startsWith("data:")) continue;
      let data = {};
      try {
        data = JSON.parse(line.slice(5).trim() || "{}");
      } catch {
        continue;
      }
      if (event === "posts" && Array.isArray(data.posts)) {
        state.posts = data.posts;
      } else if (event === "think" && data.text && !state.cards.length) {
        setThink(pending, data.text);
      } else if (event === "card" && Number.isInteger(data.index) && data.index >= 0) {
        while (state.cards.length <= data.index) {
          state.cards.push({ index: state.cards.length, text: "", jobs: null, status: "" });
        }
        state.cards[data.index] = {
          index: data.index,
          text: String(data.text || ""),
          jobs: data.jobs === undefined ? state.cards[data.index].jobs : data.jobs,
          status: data.status || "",
        };
        renderCards(pending, state);
      } else if (event === "done") {
        if (Array.isArray(data.posts)) state.posts = data.posts;
        if (!data.ok) {
          paintBrief(pending, data.error || "Failed.");
        } else {
          paintFinal(pending, { ...data, posts: data.posts || state.posts });
        }
      }
      event = "message";
      thread.scrollTop = thread.scrollHeight;
    }
  }
}

function spinnerHtml() {
  return `<span class="ai-spin" aria-hidden="true"><span class="ai-spin-ring"></span><span class="ai-spin-ring"></span><span class="ai-spin-core"></span></span>`;
}

function setThink(el, text) {
  el.className = "bubble think";
  el.innerHTML = `${spinnerHtml()}<span class="think-msg">${escapeHtml(text)}</span>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paintBrief(el, text) {
  el.className = "bubble brief";
  el.textContent = text;
}

function paintFinal(el, data) {
  const { items } = splitBrief(data.text || "");
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  renderCards(el, {
    posts: data.posts || [],
    cards: items.map((item, i) => ({
      index: i,
      text: item.text,
      jobs: jobs[i] ? [jobs[i]] : [],
      status: "",
    })),
  });
}

function renderCards(el, state) {
  el.className = "bubble brief";
  const parts = [];
  for (const card of state.cards) {
    const body = briefHtml(card.text, state.posts, card.jobs);
    const wait = card.status ? `<p class="job-wait">${spinnerHtml()}${escapeHtml(card.status)}</p>` : "";
    parts.push(`<div class="brief-card">${body}${wait}</div>`);
  }
  el.innerHTML = parts.join("");
}

const drawer = document.querySelector("#drawer");
const drawerTitle = document.querySelector("#drawer-title");
const drawerFrame = document.querySelector("#drawer-frame");
const drawerScrim = document.querySelector("#drawer-scrim");
const drawerClose = document.querySelector("#drawer-close");
const native = window.microbait;
let previewSeq = 0;
let previewOpen = false;

function drawerBox() {
  const r = drawerFrame.getBoundingClientRect();
  return {
    x: Math.round(r.x),
    y: Math.round(r.y),
    width: Math.round(r.width),
    height: Math.round(r.height),
  };
}

function afterSlide(fn) {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    drawer.removeEventListener("transitionend", onEnd);
    fn();
  };
  const onEnd = (ev) => {
    if (ev.target === drawer && ev.propertyName === "transform") finish();
  };
  drawer.addEventListener("transitionend", onEnd);
  setTimeout(finish, 360);
}

async function showPreview(url, label) {
  const href = previewUrl(url);
  if (!href) return;
  const seq = ++previewSeq;
  drawerTitle.textContent = label || href;
  document.body.classList.add("drawer-open");
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  const attach = async () => {
    if (seq !== previewSeq) return;
    if (native?.openDrawer) {
      const res = await native.openDrawer(href);
      if (seq !== previewSeq) return;
      if (!res?.ok) {
        drawerTitle.textContent = res?.error || "Could not open the link.";
        return;
      }
      await native.setDrawerBounds(drawerBox());
    } else {
      drawerFrame.innerHTML = `<iframe class="drawer-iframe" src="${escapeHtml(href)}" title="Preview"></iframe>`;
    }
    previewOpen = true;
    drawerClose.focus();
  };
  if (previewOpen && native?.openDrawer) {
    await attach();
    return;
  }
  afterSlide(attach);
}

async function hidePreview() {
  previewSeq += 1;
  previewOpen = false;
  if (native?.closeDrawer) await native.closeDrawer();
  drawer.classList.remove("is-open");
  document.body.classList.remove("drawer-open");
  drawer.setAttribute("aria-hidden", "true");
  afterSlide(() => {
    if (previewOpen) return;
    drawerFrame.innerHTML = "";
    drawerTitle.textContent = "";
  });
}

document.addEventListener("click", (ev) => {
  const a = ev.target.closest("a.author-link, a.job-link");
  if (!a) return;
  ev.preventDefault();
  showPreview(a.href, a.textContent.trim());
});

drawerClose.addEventListener("click", hidePreview);
drawerScrim.addEventListener("click", hidePreview);
window.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && document.body.classList.contains("drawer-open")) hidePreview();
});
window.addEventListener("resize", () => {
  if (previewOpen && native?.setDrawerBounds) native.setDrawerBounds(drawerBox());
});

refresh().catch(() => {});
