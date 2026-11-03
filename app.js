/* ============================================================
   LIGA DOS ÚLTIMOS — estatísticas de futebol
   Tudo guardado em localStorage (JSON), apenas neste dispositivo.
   ============================================================ */
"use strict";

const STORE_KEY = "liga-dos-ultimos.v1";
const EXPEL_MS = 60000;

/* ---------- métricas ---------- */
// colunas da folha de jogo / resumo
const COLS = [
  ["goals", "Golos"],
  ["assists", "Assistências"],
  ["saves", "Defesas (GR)"],
  ["conceded", "Golos Sofridos (GR)"],
  ["bigSave", "Grande defesa"],
  ["clearance", "Corte decisivo"],
  ["og", "Auto golo"],
  ["redFoul", "Falta para vermelho"],
  ["penSaved", "Penálti defendido (GR)"],
  ["penScored", "Penálti marcado"],
  ["penMissed", "Penálti falhado"],
];
const COL_LABEL = Object.fromEntries(COLS);

// regras de pontos (ordem apresentada nas definições)
const RULE_DEFS = [
  { k: "goals", label: "Golos" },
  { k: "assists", label: "Assistências" },
  { k: "saves", label: "Defesas (GR)", every: true },
  { k: "penSaved", label: "Penálti defendido" },
  { k: "penScored", label: "Penálti marcado" },
  { k: "conceded", label: "Golos sofridos (GR)", every: true },
  { k: "bigSave", label: "Grande defesa" },
  { k: "clearance", label: "Corte decisivo" },
  { k: "og", label: "Autogolo" },
  { k: "penMissed", label: "Penálti falhado" },
  { k: "redFoul", label: "Falta para vermelho" },
  { k: "win", label: "Vitória" },
  { k: "loss", label: "Derrota" },
  { k: "mvp", label: "MVP" },
];

function defaultRules() {
  return {
    goals: 3, assists: 2, penSaved: 3, penScored: 3, bigSave: 1, clearance: 1,
    og: -2, penMissed: -2, redFoul: -2, win: 3, loss: 0, mvp: 2,
    saves: { every: 3, pts: 1 },
    conceded: { every: 2, pts: -1 },
  };
}

/* ---------- estado ---------- */
let db = { players: [], games: [], rules: defaultRules(), active: null };

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      db.players = Array.isArray(d.players) ? d.players : [];
      db.games = Array.isArray(d.games) ? d.games : [];
      db.rules = normRules(d.rules);
      db.active = d.active || null;
    }
  } catch (e) { console.warn("load", e); }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
  catch (e) { toast("Não foi possível guardar (armazenamento cheio?)"); }
}
function normRules(r) {
  const d = defaultRules();
  if (!r || typeof r !== "object") return d;
  for (const k of Object.keys(d)) {
    if (k === "saves" || k === "conceded") {
      if (r[k] && Number.isFinite(+r[k].every) && Number.isFinite(+r[k].pts)) {
        d[k] = { every: Math.max(1, Math.round(+r[k].every)), pts: Math.round(+r[k].pts) };
      }
    } else if (Number.isFinite(+r[k])) d[k] = Math.round(+r[k]);
  }
  return d;
}

/* ---------- utilitários ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt1 = (n) => (Math.round(n * 10) / 10).toString().replace(".", ",");
const signed = (n) => (n > 0 ? "+" + n : String(n));
const fmtDate = (iso) => {
  try { return new Date(iso).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }); }
  catch (e) { return iso; }
};
const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
};
const playerName = (id) => (db.players.find((p) => p.id === id) || {}).name;
const nameIn = (g, id) => (g.names && g.names[id]) || playerName(id) || "?";

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2400);
}

let currentScreen = "screen-menu";
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
  currentScreen = id;
  const el = $(id); if (el) el.scrollTop = 0;
  if (id === "screen-game") startTicker(); else stopTicker();
}

function openOverlay(id) { $(id).hidden = false; }
function closeOverlay(id) { $(id).hidden = true; }

function confirmDlg(title, detail, okLabel) {
  return new Promise((res) => {
    $("confirm-title").textContent = title;
    $("confirm-detail").textContent = detail || "";
    $("btn-confirm-ok").textContent = okLabel || "Confirmar";
    openOverlay("overlay-confirm");
    const done = (v) => { closeOverlay("overlay-confirm"); res(v); };
    $("btn-confirm-ok").onclick = () => done(true);
    $("btn-confirm-cancel").onclick = () => done(false);
  });
}

/* ---------- pontos / resultado ---------- */
function calcPoints(st, rules, result) {
  let p = 0;
  for (const d of RULE_DEFS) {
    const k = d.k;
    if (k === "win" || k === "loss" || k === "mvp") continue;
    if (d.every) p += Math.floor((st[k] || 0) / rules[k].every) * rules[k].pts;
    else p += (st[k] || 0) * rules[k];
  }
  if (result === "w") p += rules.win;
  if (result === "l") p += rules.loss;
  p += (st.mvp || 0) * rules.mvp;
  return p;
}

// (re)calcula resultado e pontos de um jogo terminado
function recompute(g) {
  const sc = [0, 0];
  g.teams.forEach((t, i) => {
    t.players.forEach((pid) => {
      const st = g.stats[pid] || {};
      sc[i] += (st.goals || 0) + (st.penScored || 0); // golos próprios
      sc[1 - i] += st.og || 0;                         // autogolos contam para o adversário
    });
  });
  g.score = sc;
  g.winner = sc[0] === sc[1] ? -1 : sc[0] > sc[1] ? 0 : 1;
  g.points = {};
  g.teams.forEach((t, i) => {
    const res = g.winner === -1 ? "d" : g.winner === i ? "w" : "l";
    t.players.forEach((pid) => { g.points[pid] = calcPoints(g.stats[pid] || {}, g.rules, res); });
  });
}
const TEAM_NAMES = ["Equipa A", "Equipa B"];
function resultText(g) {
  if (g.winner === -1) return `Empate ${g.score[0]}–${g.score[1]}`;
  return `${TEAM_NAMES[g.winner]} venceu ${g.score[g.winner]}–${g.score[1 - g.winner]}`;
}
function teamOf(g, pid) { return g.teams.findIndex((t) => t.players.includes(pid)); }

/* ---------- totais de jogador ---------- */
function playerTotals(pid) {
  const T = { games: 0, points: 0, wins: 0, losses: 0, draws: 0, yellow: 0, expelled: 0, mvp: 0 };
  COLS.forEach(([k]) => (T[k] = 0));
  const list = [];
  for (const g of db.games) {
    const st = g.stats[pid];
    if (!st) continue;
    T.games++;
    T.points += g.points[pid] || 0;
    const ti = teamOf(g, pid);
    if (g.winner === -1) T.draws++; else if (g.winner === ti) T.wins++; else T.losses++;
    COLS.forEach(([k]) => (T[k] += st[k] || 0));
    T.yellow += st.yellow || 0;
    T.expelled += st.expelled || 0;
    T.mvp += st.mvp || 0;
    list.push(g);
  }
  T.avg = T.games ? T.points / T.games : 0;
  T.winRate = T.games ? (T.wins / T.games) * 100 : 0;
  T.list = list;
  return T;
}

/* ============================================================
   MENU
   ============================================================ */
function renderMenu() {
  const a = db.active;
  $("menu-resume").hidden = !a;
  if (a) $("menu-resume-text").textContent = `Jogo em curso (${a.size} vs ${a.size})`;
}

$("btn-settings").onclick = () => { renderSettings(); showScreen("screen-settings"); };
$("btn-players").onclick = () => { renderPlayers(); showScreen("screen-players"); };
$("btn-history").onclick = () => { renderHistory(); showScreen("screen-history"); };
$("btn-new-game").onclick = async () => {
  if (db.active) {
    const ok = await confirmDlg("Há um jogo em curso", "Começar um novo jogo descarta o jogo em curso. Continuar?", "Descartar e começar");
    if (!ok) return;
    db.active = null; save(); renderMenu();
  }
  if (db.players.length < 2) { toast("Cria primeiro os jogadores"); }
  setup = { size: 5, teams: [[], []], picking: 0 };
  renderSetup();
  showScreen("screen-setup");
};
$("btn-resume").onclick = () => { renderGame(); showScreen("screen-game"); };
$("btn-discard").onclick = async () => {
  if (await confirmDlg("Descartar jogo em curso?", "As estatísticas deste jogo vão perder-se.", "Descartar")) {
    db.active = null; save(); renderMenu();
  }
};
document.querySelectorAll("[data-back]").forEach((b) => {
  b.onclick = () => {
    const to = b.dataset.back;
    if (to === "screen-menu") renderMenu();
    if (to === "screen-players") renderPlayers();
    if (to === "screen-history") renderHistory();
    showScreen(to);
  };
});

/* ============================================================
   JOGADORES
   ============================================================ */
let profileId = null;

function renderPlayers() {
  const box = $("players-list");
  if (!db.players.length) { box.innerHTML = `<p class="empty">Ainda não há jogadores.<br>Toca em “＋ Novo” para criar o primeiro.</p>`; return; }
  const rows = db.players.map((p) => ({ p, t: playerTotals(p.id) }))
    .sort((a, b) => a.p.name.localeCompare(b.p.name, "pt"));
  box.innerHTML = rows.map(({ p, t }) =>
    `<button class="list-item" data-pid="${p.id}"><span><strong>${esc(p.name)}</strong><small>${t.games} jogo${t.games === 1 ? "" : "s"} · média ${fmt1(t.avg)} pts</small></span><span class="li-right">${t.points} pts</span></button>`
  ).join("");
  box.querySelectorAll(".list-item").forEach((b) => (b.onclick = () => { profileId = b.dataset.pid; renderProfile(); showScreen("screen-player-profile"); }));
}

$("btn-add-player").onclick = () => { $("input-player-name").value = ""; openOverlay("overlay-new-player"); setTimeout(() => $("input-player-name").focus(), 50); };
$("btn-cancel-new-player").onclick = () => closeOverlay("overlay-new-player");
function saveNewPlayer() {
  const name = $("input-player-name").value.trim();
  if (!name) return;
  if (db.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) { toast("Já existe um jogador com esse nome"); return; }
  db.players.push({ id: uid(), name });
  save(); closeOverlay("overlay-new-player"); renderPlayers();
}
$("btn-save-new-player").onclick = saveNewPlayer;
$("input-player-name").addEventListener("keydown", (e) => { if (e.key === "Enter") saveNewPlayer(); });

function renderProfile() {
  const p = db.players.find((x) => x.id === profileId);
  if (!p) { showScreen("screen-players"); return; }
  $("profile-name").textContent = p.name;
  const T = playerTotals(p.id);
  const cell = (v, l, cls) => `<div class="pstat ${cls || ""}"><b>${v}</b><span>${l}</span></div>`;
  let h = `<div class="profile-grid">
    ${cell(T.games, "Jogos")}${cell(T.points, "Pontos")}${cell(fmt1(T.avg), "Média pts/jogo")}
    ${cell(fmt1(T.winRate) + "%", "Win rate")}${cell(T.wins, "Vitórias")}${cell(T.mvp, "MVP")}
    ${cell(T.yellow, "Amarelos (carreira)", "pstat--y")}${cell(T.expelled, "Expulsões (1 min)")}${cell(T.redFoul, "Falta p/ vermelho")}
    ${cell(T.goals, "Golos")}${cell(T.assists, "Assistências")}${cell(T.penScored, "Penáltis marcados")}
    ${cell(T.saves, "Defesas (GR)")}${cell(T.penSaved, "Penáltis defendidos")}${cell(T.conceded, "Golos sofridos (GR)")}
    ${cell(T.bigSave, "Grande defesa")}${cell(T.clearance, "Corte decisivo")}${cell(T.og, "Autogolos")}
    ${cell(T.penMissed, "Penáltis falhados")}
  </div>`;
  h += `<p class="section-label">Jogos</p>`;
  if (!T.list.length) h += `<p class="empty">Ainda sem jogos.</p>`;
  else {
    h += [...T.list].reverse().map((g) => {
      const ti = teamOf(g, p.id);
      const r = g.winner === -1 ? "Empate" : g.winner === ti ? "Vitória" : "Derrota";
      const y = g.stats[p.id].yellow || 0;
      return `<button class="list-item" data-gid="${g.id}"><span><strong>${r} ${g.score[ti]}–${g.score[1 - ti]}</strong><small>${fmtDate(g.date)}${y ? ` · ${y} amarelo${y > 1 ? "s" : ""}` : ""}</small></span><span class="li-right">${g.points[p.id]} pts</span></button>`;
    }).join("");
  }
  $("profile-content").innerHTML = h;
  $("profile-content").querySelectorAll("[data-gid]").forEach((b) => (b.onclick = () => openDetail(b.dataset.gid, "screen-player-profile")));
}
$("btn-delete-player").onclick = async () => {
  const p = db.players.find((x) => x.id === profileId);
  if (!p) return;
  if (await confirmDlg(`Eliminar ${p.name}?`, "O jogador deixa de aparecer na lista. Os jogos já guardados mantêm as estatísticas.", "Eliminar")) {
    db.players = db.players.filter((x) => x.id !== p.id);
    // guarda o nome nos jogos para o histórico continuar legível
    db.games.forEach((g) => { if (g.stats[p.id]) { g.names = g.names || {}; g.names[p.id] = p.name; } });
    save(); renderPlayers(); showScreen("screen-players");
  }
};

/* ============================================================
   NOVO JOGO
   ============================================================ */
let setup = { size: 5, teams: [[], []], picking: 0 };

function renderSetup() {
  document.querySelectorAll(".size-btn").forEach((b) => b.classList.toggle("active", +b.dataset.size === setup.size));
  [0, 1].forEach((i) => {
    const t = setup.teams[i];
    $("team-t" + (i + 1)).innerHTML = `<h3>${TEAM_NAMES[i]}</h3><span class="count">${t.length}/${setup.size}</span>
      ${t.map((id) => `<div class="tp">${esc(playerName(id) || "?")}</div>`).join("")}
      <button class="pick-btn" data-team="${i}">${t.length ? "Alterar jogadores" : "Escolher jogadores"}</button>`;
  });
  document.querySelectorAll(".pick-btn").forEach((b) => (b.onclick = () => openPick(+b.dataset.team)));
  const need = [0, 1].map((i) => setup.size - setup.teams[i].length);
  const ready = need[0] === 0 && need[1] === 0;
  $("btn-start-game").disabled = !ready;
  $("setup-hint").textContent = ready ? "Tudo pronto." :
    `Faltam ${Math.max(0, need[0])} na ${TEAM_NAMES[0]} e ${Math.max(0, need[1])} na ${TEAM_NAMES[1]}.`;
}
document.querySelectorAll(".size-btn").forEach((b) => {
  b.onclick = () => {
    setup.size = +b.dataset.size;
    let cut = false;
    setup.teams = setup.teams.map((t) => { if (t.length > setup.size) { cut = true; return t.slice(0, setup.size); } return t; });
    if (cut) toast("Jogadores a mais foram removidos das equipas");
    renderSetup();
  };
});

function openPick(i) {
  setup.picking = i;
  renderPick();
  showScreen("screen-pick");
}
function renderPick() {
  const i = setup.picking, other = setup.teams[1 - i], mine = setup.teams[i];
  $("pick-title").textContent = `${TEAM_NAMES[i]} · ${mine.length}/${setup.size}`;
  const list = $("pick-list");
  if (!db.players.length) { list.innerHTML = `<p class="empty">Não há jogadores. Cria-os primeiro em “Jogadores”.</p>`; return; }
  const sorted = [...db.players].sort((a, b) => a.name.localeCompare(b.name, "pt"));
  list.innerHTML = sorted.map((p) => {
    const on = mine.includes(p.id);
    const taken = other.includes(p.id);
    const full = !on && mine.length >= setup.size;
    return `<button class="check-item ${on ? "on" : ""} ${taken || full ? "off" : ""}" data-pid="${p.id}"><span class="box">${on ? "✓" : ""}</span><span>${esc(p.name)}${taken ? ` <small style="color:var(--text-dim)">(${TEAM_NAMES[1 - i]})</small>` : ""}</span></button>`;
  }).join("");
  list.querySelectorAll(".check-item").forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.pid;
      if (mine.includes(id)) mine.splice(mine.indexOf(id), 1);
      else if (other.includes(id)) return;
      else if (mine.length >= setup.size) { toast(`Máximo de ${setup.size} por equipa`); return; }
      else mine.push(id);
      renderPick();
    };
  });
}
$("btn-pick-done").onclick = () => { renderSetup(); showScreen("screen-setup"); };
$("btn-cancel-pick").onclick = () => { renderSetup(); showScreen("screen-setup"); };

$("btn-start-game").onclick = () => {
  if (setup.teams[0].length !== setup.size || setup.teams[1].length !== setup.size) return;
  const stats = {};
  setup.teams.flat().forEach((id) => { stats[id] = { yellow: 0, expelled: 0, mvp: 0 }; COLS.forEach(([k]) => (stats[id][k] = 0)); });
  db.active = {
    id: uid(), started: new Date().toISOString(), size: setup.size,
    teams: setup.teams.map((t) => ({ players: [...t] })),
    names: Object.fromEntries(setup.teams.flat().map((id) => [id, playerName(id)])),
    stats, cycle: {}, expels: [],
  };
  save(); renderGame(); showScreen("screen-game");
};

/* ============================================================
   JOGO
   ============================================================ */
let ticker = null;
function startTicker() { stopTicker(); tick(); ticker = setInterval(tick, 500); }
function stopTicker() { if (ticker) clearInterval(ticker); ticker = null; }

function tick() {
  const a = db.active;
  if (!a) return;
  $("game-timer").textContent = mmss(Date.now() - new Date(a.started).getTime()).replace(/^(\d+):/, "$1:");
  const now = Date.now();
  const before = a.expels.length;
  a.expels = a.expels.filter((e) => e.end > now);
  if (a.expels.length !== before) { save(); try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {} }
  const strip = $("expel-strip");
  if (a.expels.length) {
    strip.hidden = false;
    strip.textContent = a.expels.map((e) => `${nameIn(a, e.pid)} regressa em ${mmss(e.end - now)}`).join("  ·  ");
  } else strip.hidden = true;
}

function sortedActivePlayers() {
  const a = db.active;
  return a.teams.flatMap((t) => t.players).sort((x, y) => nameIn(a, x).localeCompare(nameIn(a, y), "pt"));
}

function renderGame() {
  const a = db.active;
  if (!a) { renderMenu(); showScreen("screen-menu"); return; }
  const wrap = $("game-table-wrap");
  const sl = wrap.scrollLeft, st = wrap.scrollTop;
  let h = `<table class="stbl"><thead><tr><th class="pn">Jogador</th>${COLS.map(([, l]) => `<th>${l}</th>`).join("")}</tr></thead><tbody>`;
  for (const pid of sortedActivePlayers()) {
    const s = a.stats[pid];
    h += `<tr><td class="pn">${esc(nameIn(a, pid))}${s.yellow ? `<span class="yc" title="${s.yellow} amarelo(s)"></span>` : ""}</td>`;
    for (const [k] of COLS) {
      const v = s[k] || 0;
      h += `<td><span class="cellc"><button class="pm pm--sm" data-act="dec" data-pid="${pid}" data-k="${k}">−</button><span class="n ${v ? "" : "zero"}">${v}</span><button class="pm pm--sm pm--plus" data-act="inc" data-pid="${pid}" data-k="${k}">+</button></span></td>`;
    }
    h += `</tr>`;
  }
  h += `</tbody></table>`;
  wrap.innerHTML = h;
  wrap.scrollLeft = sl; wrap.scrollTop = st;
  tick();
}

$("game-table-wrap").addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b || !db.active) return;
  const s = db.active.stats[b.dataset.pid];
  const k = b.dataset.k;
  if (b.dataset.act === "inc") s[k] = (s[k] || 0) + 1;
  else s[k] = Math.max(0, (s[k] || 0) - 1);
  save(); renderGame();
});

$("btn-game-back").onclick = () => { renderMenu(); showScreen("screen-menu"); };

/* --- cartões amarelos --- */
$("btn-yellow").onclick = () => { renderYellowList(); openOverlay("overlay-yellow"); };
$("btn-yellow-close").onclick = () => closeOverlay("overlay-yellow");

function renderYellowList() {
  const a = db.active;
  $("yellow-list").innerHTML = sortedActivePlayers().map((pid) => {
    const c = (a.cycle[pid] || 0);
    const dots = `<span class="ys"><i class="${c >= 1 ? "" : "empty"}"></i><i class="${c >= 2 ? "" : "empty"}"></i></span>`;
    const tot = a.stats[pid].yellow;
    return `<div style="display:flex;gap:6px"><button class="yellow-item" data-give="${pid}" style="flex:1"><span>${esc(nameIn(a, pid))}${tot ? ` <small style="color:var(--text-dim)">(${tot} no jogo)</small>` : ""}</span>${dots}</button><button class="pm" data-undo="${pid}" title="Anular último amarelo" ${tot ? "" : "disabled style='opacity:.3'"}>−</button></div>`;
  }).join("");
  $("yellow-list").querySelectorAll("[data-give]").forEach((b) => (b.onclick = () => giveYellow(b.dataset.give)));
  $("yellow-list").querySelectorAll("[data-undo]").forEach((b) => (b.onclick = () => undoYellow(b.dataset.undo)));
}

function giveYellow(pid) {
  const a = db.active, s = a.stats[pid];
  s.yellow++;
  a.cycle[pid] = (a.cycle[pid] || 0) + 1;
  let expel = false;
  if (a.cycle[pid] >= 2) { a.cycle[pid] = 0; s.expelled = (s.expelled || 0) + 1; expel = true; }
  save(); renderGame();
  closeOverlay("overlay-yellow");
  if (expel) {
    $("expel-text").textContent = `${nameIn(a, pid)} tem 2 amarelos e tem de ser expulso`;
    $("btn-expel-ok").onclick = () => {
      closeOverlay("overlay-expel");
      a.expels.push({ pid, end: Date.now() + EXPEL_MS });
      save(); tick();
    };
    openOverlay("overlay-expel");
  } else toast(`Amarelo para ${nameIn(a, pid)}`);
}
function undoYellow(pid) {
  const a = db.active, s = a.stats[pid];
  if (!s.yellow) return;
  s.yellow--;
  if ((a.cycle[pid] || 0) > 0) a.cycle[pid]--;
  else { a.cycle[pid] = 1; s.expelled = Math.max(0, (s.expelled || 0) - 1); a.expels = a.expels.filter((e) => e.pid !== pid); }
  save(); renderGame(); renderYellowList();
}

/* --- terminar jogo (dupla confirmação) --- */
$("btn-end-game").onclick = async () => {
  if (!(await confirmDlg("Terminar o jogo?", "Vais fechar a folha de estatísticas.", "Sim, terminar"))) return;
  if (!(await confirmDlg("Tens mesmo a certeza?", "Depois de terminar já não dá para voltar a editar golos e restantes estatísticas.", "Terminar mesmo"))) return;
  finishGame();
};

function finishGame() {
  const a = db.active;
  const g = {
    id: a.id, date: a.started, ended: new Date().toISOString(), size: a.size,
    teams: a.teams, names: a.names, stats: a.stats, rules: JSON.parse(JSON.stringify(db.rules)),
  };
  recompute(g);
  db.games.push(g);
  db.active = null;
  save();
  summaryId = g.id;
  renderSummary();
  showScreen("screen-summary");
}

/* ============================================================
   TABELA (resumo / detalhe)
   ============================================================ */
function gameTable(g, opt) {
  const ids = g.teams.flatMap((t) => t.players)
    .sort((x, y) => (g.points[y] - g.points[x]) || nameIn(g, x).localeCompare(nameIn(g, y), "pt"));
  let h = `<table class="stbl"><thead><tr><th class="pn">Jogador</th>${COLS.map(([, l]) => `<th>${l}</th>`).join("")}${opt.yellow ? "<th>Amarelos</th>" : ""}<th>Pontos</th><th>MVP</th></tr></thead><tbody>`;
  for (const pid of ids) {
    const s = g.stats[pid] || {};
    const win = g.winner !== -1 && teamOf(g, pid) === g.winner;
    h += `<tr class="${win ? "win" : ""}"><td class="pn">${esc(nameIn(g, pid))}</td>`;
    for (const [k] of COLS) h += `<td><span class="n">${s[k] || 0}</span></td>`;
    if (opt.yellow) h += `<td><span class="n">${s.yellow || 0}${s.expelled ? ` <small>(${s.expelled} exp.)</small>` : ""}</span></td>`;
    h += `<td class="pts">${g.points[pid]}</td>`;
    if (opt.editMvp) h += `<td class="mvp-cell"><span class="cellc"><button class="pm pm--sm" data-act="dec" data-pid="${pid}">−</button><span class="n ${s.mvp ? "" : "zero"}">${s.mvp || 0}</span><button class="pm pm--sm pm--plus" data-act="inc" data-pid="${pid}">+</button></span></td>`;
    else h += `<td><span class="n">${s.mvp || 0}</span></td>`;
    h += `</tr>`;
  }
  return h + `</tbody></table>`;
}
function winnerHead(g) {
  const names = (i) => g.teams[i].players.map((p) => esc(nameIn(g, p))).join(", ");
  if (g.winner === -1) return `Empate <b>${g.score[0]}–${g.score[1]}</b><div class="names">${TEAM_NAMES[0]}: ${names(0)}<br>${TEAM_NAMES[1]}: ${names(1)}</div>`;
  const w = g.winner;
  return `Venceu a ${TEAM_NAMES[w]} <b>${g.score[w]}–${g.score[1 - w]}</b><div class="names">${names(w)}</div>`;
}

/* ---------- resumo ---------- */
let summaryId = null;
function renderSummary() {
  const g = db.games.find((x) => x.id === summaryId);
  if (!g) return;
  $("summary-head").innerHTML = winnerHead(g);
  const wrap = $("summary-table-wrap");
  const sl = wrap.scrollLeft, st = wrap.scrollTop;
  wrap.innerHTML = gameTable(g, { editMvp: true });
  wrap.scrollLeft = sl; wrap.scrollTop = st;
}
$("summary-table-wrap").addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  const g = db.games.find((x) => x.id === summaryId);
  if (!b || !g) return;
  const s = g.stats[b.dataset.pid];
  s.mvp = Math.max(0, (s.mvp || 0) + (b.dataset.act === "inc" ? 1 : -1));
  recompute(g); save(); renderSummary();
});
$("btn-summary-next").onclick = () => { renderMenu(); showScreen("screen-menu"); };

/* ============================================================
   HISTÓRICO / DETALHE
   ============================================================ */
function renderHistory() {
  const box = $("history-list");
  if (!db.games.length) { box.innerHTML = `<p class="empty">Ainda não há jogos guardados.</p>`; return; }
  box.innerHTML = [...db.games].sort((a, b) => b.date.localeCompare(a.date)).map((g) => {
    const ys = g.teams.flatMap((t) => t.players).filter((p) => (g.stats[p].yellow || 0) > 0)
      .map((p) => `${nameIn(g, p)} ${g.stats[p].yellow}`).join(", ");
    return `<button class="list-item" data-gid="${g.id}"><span><strong>${resultText(g)}</strong><small>${fmtDate(g.date)} · ${g.size} vs ${g.size}${ys ? ` · 🟨 ${esc(ys)}` : ""}</small></span><span class="li-right">▸</span></button>`;
  }).join("");
  box.querySelectorAll("[data-gid]").forEach((b) => (b.onclick = () => openDetail(b.dataset.gid, "screen-history")));
}

let detailId = null;
function openDetail(id, back) {
  detailId = id;
  document.querySelector("#screen-game-detail .bar-back").dataset.back = back;
  const g = db.games.find((x) => x.id === id);
  if (!g) return;
  $("game-detail-content").innerHTML = `<div class="detail-head">${fmtDate(g.date)} · ${g.size} vs ${g.size}<br><b>${winnerHead(g)}</b></div><div class="detail-tbl">${gameTable(g, { yellow: true })}</div>`;
  showScreen("screen-game-detail");
}
$("btn-delete-game").onclick = async () => {
  if (await confirmDlg("Eliminar este jogo?", "As estatísticas dos jogadores deixam de contar este jogo.", "Eliminar")) {
    db.games = db.games.filter((g) => g.id !== detailId);
    save(); renderHistory(); showScreen("screen-history");
  }
};

/* ============================================================
   DEFINIÇÕES
   ============================================================ */
function renderSettings() {
  $("data-summary").innerHTML = `${db.players.length} jogador(es) · ${db.games.length} jogo(s) guardado(s)`;
  const r = db.rules;
  $("rules-list").innerHTML = RULE_DEFS.map((d) => {
    if (d.every) {
      const v = r[d.k];
      return `<div class="rule-row"><div class="rule-name">${d.label}<small>a cada N, X pontos</small></div>
        <div class="rule-ctl"><span class="lbl">a cada</span><button class="pm pm--sm" data-r="${d.k}" data-f="every" data-d="-1">−</button><span class="val">${v.every}</span><button class="pm pm--sm pm--plus" data-r="${d.k}" data-f="every" data-d="1">+</button></div>
        <div class="rule-ctl"><button class="pm pm--sm" data-r="${d.k}" data-f="pts" data-d="-1">−</button><span class="val ${v.pts < 0 ? "neg" : v.pts > 0 ? "pos" : ""}">${signed(v.pts)}</span><button class="pm pm--sm pm--plus" data-r="${d.k}" data-f="pts" data-d="1">+</button></div></div>`;
    }
    const v = r[d.k];
    return `<div class="rule-row"><div class="rule-name">${d.label}</div><div class="rule-ctl"><button class="pm pm--sm" data-r="${d.k}" data-d="-1">−</button><span class="val ${v < 0 ? "neg" : v > 0 ? "pos" : ""}">${signed(v)}</span><button class="pm pm--sm pm--plus" data-r="${d.k}" data-d="1">+</button></div></div>`;
  }).join("");
}
$("rules-list").addEventListener("click", (e) => {
  const b = e.target.closest("[data-r]");
  if (!b) return;
  const k = b.dataset.r, d = +b.dataset.d, f = b.dataset.f;
  if (f) {
    const o = db.rules[k];
    o[f] = f === "every" ? Math.max(1, o.every + d) : o.pts + d;
  } else db.rules[k] += d;
  save(); renderSettings();
});
$("btn-reset-rules").onclick = async () => {
  if (await confirmDlg("Repor regra de pontos?", "Volta aos valores predefinidos.", "Repor")) { db.rules = defaultRules(); save(); renderSettings(); }
};

/* ---------- exportar ---------- */
$("btn-export").onclick = () => {
  const payload = { app: "liga-dos-ultimos", version: 1, exportedAt: new Date().toISOString(), players: db.players, games: db.games, rules: db.rules };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `liga-dos-ultimos-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("Cópia de segurança exportada");
};

/* ---------- importar ---------- */
let pendingImport = null;
$("btn-import").onclick = () => $("input-import-file").click();
$("input-import-file").onchange = (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const d = JSON.parse(rd.result);
      if (!d || d.app !== "liga-dos-ultimos" || !Array.isArray(d.players) || !Array.isArray(d.games)) throw new Error("formato");
      pendingImport = d;
      $("import-detail").textContent = `A cópia tem ${d.players.length} jogador(es) e ${d.games.length} jogo(s).`;
      openOverlay("overlay-import");
    } catch (err) { toast("Ficheiro inválido"); }
  };
  rd.readAsText(f);
};
$("btn-cancel-import").onclick = () => { pendingImport = null; closeOverlay("overlay-import"); };
$("btn-replace-import").onclick = () => {
  if (!pendingImport) return;
  db.players = pendingImport.players; db.games = pendingImport.games;
  db.rules = normRules(pendingImport.rules); db.active = null;
  finishImport("Dados substituídos");
};
$("btn-merge-import").onclick = () => {
  const d = pendingImport; if (!d) return;
  const map = {};
  d.players.forEach((p) => {
    const ex = db.players.find((x) => x.name.toLowerCase() === String(p.name).toLowerCase());
    if (ex) map[p.id] = ex.id;
    else { db.players.push({ id: p.id, name: p.name }); map[p.id] = p.id; }
  });
  let added = 0;
  d.games.forEach((g) => {
    if (db.games.some((x) => x.id === g.id)) return;
    const remap = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [map[k] || k, v]));
    g.teams = g.teams.map((t) => ({ players: t.players.map((p) => map[p] || p) }));
    g.stats = remap(g.stats); g.points = remap(g.points);
    g.names = remap(g.names);
    db.games.push(g); added++;
  });
  finishImport(`Adicionados ${added} jogo(s)`);
};
function finishImport(msg) {
  pendingImport = null; save(); closeOverlay("overlay-import");
  renderSettings(); renderMenu(); toast(msg);
}

/* ---------- apagar tudo ---------- */
$("btn-wipe").onclick = async () => {
  if (!(await confirmDlg("Apagar todos os dados?", "Jogadores, jogos e regras serão removidos deste dispositivo.", "Continuar"))) return;
  if (!(await confirmDlg("Última confirmação", "Isto não pode ser desfeito. Exporta uma cópia antes se quiseres guardar algo.", "Apagar tudo"))) return;
  db = { players: [], games: [], rules: defaultRules(), active: null };
  save(); renderSettings(); renderMenu(); toast("Dados apagados");
};

/* ============================================================
   ARRANQUE
   ============================================================ */
load();
renderMenu();
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
