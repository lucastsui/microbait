const STARTERS = [
  { goal: "I want to know recent tech development", handles: "" },
  { goal: "What happened in world news this week", handles: "" },
  { goal: "How are my friends doing", handles: "" },
  { goal: "Health research I should actually know", handles: "" },
];

const form = document.querySelector("#goal-form");
const goalEl = document.querySelector("#goal");
const handlesEl = document.querySelector("#handles");
const briefingEl = document.querySelector("#briefing");
const goalsEl = document.querySelector("#goals");
const startersEl = document.querySelector("#starters");
const modePill = document.querySelector("#mode-pill");
const banner = document.querySelector("#key-banner");

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseHandles(raw) {
  return String(raw || "")
    .split(/[\s,]+/)
    .map((h) => h.replace(/^@/, "").trim())
    .filter(Boolean);
}

function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function renderBriefing(briefing, pending) {
  if (pending) {
    briefingEl.innerHTML = `
      <div class="empty">
        <p class="kicker">Reading in public</p>
        <h2 style="font-family:var(--serif);letter-spacing:-0.03em;font-size:2rem;margin:0 0 0.6rem">Looking through posts and leaving the bait on the floor.</h2>
        <p>This takes a short while. Nothing on this page will flash while it works.</p>
      </div>`;
    return;
  }
  if (!briefing) return;
  const items = briefing.items || [];
  const itemHtml = items
    .map(
      (item) => `
      <section class="item">
        <h3>${escapeHtml(item.headline)}</h3>
        <p>${escapeHtml(item.summary)}</p>
        ${item.relevance ? `<p class="rel">${escapeHtml(item.relevance)}</p>` : ""}
        <div class="sources">
          ${(item.sources || [])
            .map(
              (s) =>
                `<a href="${escapeHtml(s.url)}" rel="noreferrer" target="_blank">${escapeHtml(s.title || s.url)}</a>`,
            )
            .join("")}
        </div>
      </section>`,
    )
    .join("");

  const notes = (briefing.notes || [])
    .map((n) => `<li>${escapeHtml(n)}</li>`)
    .join("");

  briefingEl.innerHTML = `
    <header class="briefing-head">
      <h2>${escapeHtml(briefing.briefing_title || "Briefing")}</h2>
      <div class="when">${escapeHtml(formatWhen(briefing.as_of))} · ${escapeHtml(briefing.mode || "")}</div>
    </header>
    ${
      items.length
        ? itemHtml
        : `<p class="empty">Nothing public matched that goal closely enough to print.</p>`
    }
    ${briefing.omitted ? `<p class="omitted">${escapeHtml(briefing.omitted)}</p>` : ""}
    ${notes ? `<ul class="notes">${notes}</ul>` : ""}
    ${
      (briefing.sources_consulted || []).length
        ? `<p class="status-line">Consulted: ${briefing.sources_consulted
            .map((s) => escapeHtml(s))
            .join(" · ")}</p>`
        : ""
    }
  `;
}

function renderGoals(goals) {
  if (!goals.length) {
    goalsEl.innerHTML = `<li class="hint">None saved yet.</li>`;
    return;
  }
  goalsEl.innerHTML = goals
    .map(
      (g) => `
      <li>
        <button class="use" type="button" data-id="${escapeHtml(g.id)}" data-goal="${escapeHtml(g.text)}" data-handles="${escapeHtml((g.handles || []).join(", "))}">${escapeHtml(g.text)}</button>
        <button class="kill" type="button" data-kill="${escapeHtml(g.id)}" aria-label="Remove saved goal">×</button>
      </li>`,
    )
    .join("");
}

async function loadStatus() {
  const res = await fetch("/api/status");
  const data = await res.json();
  if (data.live) {
    modePill.textContent = `Grok live · ${data.model}`;
    banner.hidden = true;
  } else {
    modePill.textContent = "Public sources";
    banner.hidden = false;
  }
}

async function loadGoals() {
  const res = await fetch("/api/goals");
  const data = await res.json();
  renderGoals(data.goals || []);
}

async function compose(goal, handles, save) {
  document.body.classList.add("busy");
  renderBriefing(null, true);
  try {
    if (save) {
      await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: goal, handles }),
      });
      await loadGoals();
    }
    const res = await fetch("/api/brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal, handles }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Briefing failed");
    renderBriefing(data.briefing);
  } catch (err) {
    briefingEl.innerHTML = `<p class="empty">${escapeHtml(err.message)}</p>`;
  } finally {
    document.body.classList.remove("busy");
  }
}

form.addEventListener("submit", (ev) => {
  ev.preventDefault();
  compose(goalEl.value.trim(), parseHandles(handlesEl.value), true);
});

startersEl.innerHTML = STARTERS.map(
  (s) =>
    `<button class="starter" type="button" data-goal="${escapeHtml(s.goal)}" data-handles="${escapeHtml(s.handles)}">${escapeHtml(s.goal)}</button>`,
).join("");

startersEl.addEventListener("click", (ev) => {
  const btn = ev.target.closest("button[data-goal]");
  if (!btn) return;
  goalEl.value = btn.dataset.goal;
  handlesEl.value = btn.dataset.handles || "";
  goalEl.focus();
});

goalsEl.addEventListener("click", async (ev) => {
  const kill = ev.target.closest("[data-kill]");
  if (kill) {
    await fetch(`/api/goals/${kill.dataset.kill}`, { method: "DELETE" });
    await loadGoals();
    return;
  }
  const use = ev.target.closest("button.use");
  if (!use) return;
  goalEl.value = use.dataset.goal;
  handlesEl.value = use.dataset.handles || "";
  compose(use.dataset.goal, parseHandles(use.dataset.handles), false);
});

loadStatus().catch(() => {
  modePill.textContent = "Desk offline";
});
loadGoals().catch(() => {
  goalsEl.innerHTML = `<li class="hint">Could not load saved goals.</li>`;
});
