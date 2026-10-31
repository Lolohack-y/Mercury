// Наглядность+ — мини-приложение MAX.
// Мост MAX: window.WebApp (https://st.max.ru/js/max-web-app.js). Запасной вариант: Telegram.
const bridge = window.WebApp || window.Telegram?.WebApp || null;
const inMessenger = Boolean(bridge?.initData);
const hasMain = Boolean(bridge?.MainButton);

const THEME_KEY = "nagliadnost-theme";
const RECENT_KEY = "recentTopics";
const LAST_KEY = "nagliadnost-last-pack";
const LAST_LIMIT = 1400000;

const TYPES = [
  ["scheme", "Схема"],
  ["table", "Таблица"],
  ["cards", "Карточки"],
  ["infographic", "Инфографика"],
  ["presentation", "Презентация"],
  ["test", "Тест"],
  ["all", "Всё"],
];

const EXAMPLES = [
  { query: "фотосинтез, световая фаза", grade: "9", subject: "Биология", title: "Световая фаза" },
  { query: "Отечественная война 1812 года", grade: "9", subject: "История", title: "Война 1812 года" },
];

const LETTERS = ["А", "Б", "В", "Г", "Д", "Е", "Ж", "З"];
const GEN_STEPS = ["Ищу страницы в учебниках", "Сверяю факты, даты и цифры", "Собираю схему, карточки и тест"];

const KIND_LABEL = {
  choice: "Выбор ответа",
  judge: "Верно или неверно",
  multi: "Несколько верных",
  order: "Хронология",
  match: "Соответствие",
  open: "Развёрнутый ответ",
};

const ICON = {
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M12.5 5.5 19 12l-6.5 6.5"/></svg>',
  left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H6M11.5 5.5 5 12l6.5 6.5"/></svg>',
  right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M12.5 5.5 19 12l-6.5 6.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5V5.5M8 7h8M8 10h6"/></svg>',
  spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/><circle cx="12" cy="12" r="3"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14"/></svg>',
  upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V5M7.5 9.5 12 5l4.5 4.5M5 19h14"/></svg>',
  print: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V4h10v4M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v6H7z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg>',
  alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 3 20h18z"/><path d="M12 9v5M12 17h.01"/></svg>',
};

const state = {
  screen: "home",
  loading: true,
  bootError: "",
  books: [],
  brand: {},
  cacheSize: 0,
  type: "all",
  query: "фотосинтез, световая фаза",
  grade: "9",
  count: 8,
  skipCache: false,
  ai: { ready: false, name: "", provider: "gigachat", folder: "" },
  testMode: "student",
  bookIds: [],
  pack: null,
  tab: "scheme",
  slide: 0,
  busy: false,
  busyKind: "",
  status: "",
};

let genTimer = null;
let toastTimer = null;
let lastFocus = null;
const dockMedia = window.matchMedia("(max-width: 719px)");

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plural(count, one, few, many) {
  const n = Math.abs(Number(count)) % 100;
  const tail = n % 10;
  if (n > 10 && n < 20) return many;
  if (tail === 1) return one;
  if (tail >= 2 && tail <= 4) return few;
  return many;
}

function pointsText(count) {
  return `${count} ${plural(count, "балл", "балла", "баллов")}`;
}

function qualityLabel(value) {
  const quality = Number(value);
  if (!Number.isFinite(quality) || quality >= 0.75) return ["Высокое", "good"];
  if (quality >= 0.45) return ["Среднее", "mid"];
  return ["Слабое", "low"];
}

function formatWhen(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const time = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date);
  if (date.toDateString() === now.toDateString()) return `сегодня, ${time}`;
  const day = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(date);
  return `${day}, ${time}`;
}

function pageBadge(page) {
  const value = String(page ?? "").trim();
  if (!value) return "";
  if (/^\d+$/.test(value)) {
    return `<button type="button" class="page-badge" data-page="${esc(value)}" aria-label="Показать источник на странице ${esc(value)}">с. ${esc(value)}</button>`;
  }
  return `<span class="page-badge">${esc(value)}</span>`;
}

function noticeHtml(text, kind = "info") {
  const icon = kind === "warn" ? ICON.alert : ICON.info;
  return `<div class="notice">${icon}<span>${esc(text)}</span></div>`;
}

function emptyHtml(title, text, icon = ICON.spark, action = "") {
  return `<div class="empty"><span class="orb">${icon}</span><b>${esc(title)}</b><p>${esc(text)}</p>${action}</div>`;
}

function highlight(text, marks) {
  const set = new Set((marks || []).map((mark) => String(mark).toLowerCase()));
  return String(text || "")
    .split(/([A-Za-zА-Яа-яЁё0-9-]+)/)
    .map((part) => (set.has(part.toLowerCase()) ? `<mark>${esc(part)}</mark>` : esc(part)))
    .join("");
}

function toHex(value, fallback) {
  const text = String(value || "");
  return /^#[0-9a-f]{6}$/i.test(text) ? text : fallback;
}

function recentTopics() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(list) ? list.filter((item) => typeof item === "string" && item.trim()).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function rememberTopic(query) {
  const value = String(query || "").trim();
  if (!value) return;
  const list = [value, ...recentTopics().filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, 5);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* хранилище недоступно */
  }
}

function lastRecord() {
  try {
    const record = JSON.parse(localStorage.getItem(LAST_KEY) || "null");
    if (!record || typeof record !== "object") return null;
    const topic = String(record.topic || record.pack?.topic || "").trim();
    if (!topic) return null;
    return { ...record, topic };
  } catch {
    return null;
  }
}

function saveLastPack(pack) {
  if (!pack?.topic) return;
  const base = {
    topic: String(pack.topic),
    savedAt: Date.now(),
    grade: state.grade,
    type: state.type,
    count: Number(state.count) || 8,
    bookIds: [...state.bookIds],
    tab: state.tab,
  };
  let text = "";
  try {
    text = JSON.stringify({ ...base, pack });
  } catch {
    text = "";
  }
  try {
    localStorage.setItem(LAST_KEY, text && text.length <= LAST_LIMIT ? text : JSON.stringify({ ...base, pack: null }));
  } catch {
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify({ ...base, pack: null }));
    } catch {
      /* хранилище недоступно */
    }
  }
}

function applyLastParams(record) {
  if (!record) return false;
  state.query = record.topic;
  state.grade = record.grade || state.grade;
  state.type = record.type || state.type;
  state.count = Number(record.count) || state.count;
  state.bookIds = Array.isArray(record.bookIds) ? record.bookIds : state.bookIds;
  state.status = "";
  return true;
}

function resumeLast() {
  const record = lastRecord();
  if (!applyLastParams(record)) return;
  if (record.pack?.materials) {
    state.pack = record.pack;
    state.tab = record.pack.materials[record.tab] ? record.tab : Object.keys(record.pack.materials)[0] || "sources";
    state.slide = 0;
    goResult(state.tab);
    return;
  }
  state.screen = "ask";
  history.replaceState(null, "", "#/ask");
  generate(false);
}

function editLast() {
  if (!applyLastParams(lastRecord())) return;
  navigate("ask");
}

function selectedBooks() {
  return state.bookIds.length ? state.bookIds : state.books.map((book) => book.id);
}

function snapshotAsk() {
  const query = $("#query");
  if (query) state.query = query.value;
  const grade = $("#grade");
  if (grade) state.grade = grade.value;
  const boxes = $$('input[name="bid"]');
  if (boxes.length) state.bookIds = $$('input[name="bid"]:checked').map((input) => input.value);
  const skipCache = $("#skipCache");
  if (skipCache) state.skipCache = skipCache.checked;
}

function haptic(kind = "light") {
  try {
    if (kind === "success" || kind === "error") bridge?.HapticFeedback?.notificationOccurred?.(kind);
    else bridge?.HapticFeedback?.impactOccurred?.(kind);
  } catch {
    /* вибро недоступно */
  }
}

/* ───────────── тема ───────────── */

function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function setTheme(theme, { persist = true } = {}) {
  const next = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", next === "dark" ? "#0d0f10" : "#f4f1ea");
  const button = $("#themeBtn");
  if (button) {
    const dark = next === "dark";
    button.setAttribute("aria-pressed", String(dark));
    button.setAttribute("aria-label", dark ? "Включить светлую тему" : "Включить тёмную тему");
  }
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* хранилище недоступно */
    }
  }
}

function toggleTheme() {
  setTheme(currentTheme() === "dark" ? "light" : "dark");
  haptic("light");
}

/* ───────────── тост и модалка ───────────── */

function toast(message, kind = "ok") {
  const element = $("#toast");
  if (!element) return;
  element.textContent = String(message || "");
  element.className = `toast show${kind === "error" ? " error" : ""}`;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    element.classList.remove("show");
  }, 3400);
}

function openConfirm({ title, message, confirmLabel = "Удалить", onConfirm }) {
  const root = $("#modalRoot");
  if (!root) return;
  lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  root.innerHTML = `<div class="modal-backdrop" data-backdrop><div class="modal" role="dialog" aria-modal="true" aria-labelledby="confirmTitle" aria-describedby="confirmText">
    <h2 id="confirmTitle">${esc(title)}</h2>
    <p id="confirmText">${esc(message)}</p>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" data-cancel>Отмена</button>
      <button type="button" class="btn btn-danger" data-confirm>${esc(confirmLabel)}</button>
    </div>
  </div></div>`;

  const backdrop = root.querySelector("[data-backdrop]");
  const dialog = root.querySelector(".modal");
  const cancel = root.querySelector("[data-cancel]");
  const confirm = root.querySelector("[data-confirm]");

  document.body.style.overflow = "hidden";

  const close = () => {
    document.removeEventListener("keydown", onKey, true);
    root.innerHTML = "";
    document.body.style.overflow = "";
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    lastFocus = null;
  };

  const onKey = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab" || !dialog) return;
    const focusable = [...dialog.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter(
      (element) => !element.disabled
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  document.addEventListener("keydown", onKey, true);
  backdrop?.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  cancel?.addEventListener("click", close);
  confirm?.addEventListener("click", async () => {
    if (confirm.disabled) return;
    confirm.disabled = true;
    confirm.innerHTML = `<span class="spinner"></span> ${esc(confirmLabel)}…`;
    try {
      await onConfirm();
      close();
    } catch (error) {
      toast(error?.message || "Не получилось. Попробуйте ещё раз.", "error");
      confirm.disabled = false;
      confirm.textContent = confirmLabel;
    }
  });
  cancel?.focus();
}

/* ───────────── загрузка и шапка ───────────── */

function applyBrandFont() {
  const font = state.brand?.font || "Georgia";
  document.documentElement.style.setProperty("--mat-font", font);
}

function updateAiPill() {
  const pill = $("#aiPill");
  if (!pill) return;
  const ready = Boolean(state.ai?.ready);
  pill.classList.toggle("on", ready);
  const label = ready ? `Нейросеть: ${state.ai.name} подключена` : "Нейросеть выключена";
  pill.setAttribute("aria-label", label);
  pill.title = label;
  const text = pill.querySelector(".ai-pill-text");
  if (text) text.textContent = ready ? state.ai.name : "ИИ";
}

async function loadState() {
  let bootError = "";
  const [stateResult, aiResult] = await Promise.allSettled([
    fetch("/api/state", { headers: { Accept: "application/json" } }).then((response) => {
      if (!response.ok) throw new Error(`Сервер вернул ${response.status}`);
      return response.json();
    }),
    fetch("/api/ai", { headers: { Accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null),
  ]);

  if (stateResult.status === "fulfilled") {
    const data = stateResult.value || {};
    state.books = Array.isArray(data.books) ? data.books : [];
    state.brand = data.brand && typeof data.brand === "object" ? data.brand : {};
    state.cacheSize = Number(data.cacheSize) || 0;
    const known = new Set(state.books.map((book) => book.id));
    state.bookIds = state.bookIds.filter((id) => known.has(id));
    if (!state.bookIds.length) state.bookIds = state.books.map((book) => book.id);
  } else {
    bootError = stateResult.reason?.message || "Сервер не отвечает";
  }

  if (aiResult.status === "fulfilled" && aiResult.value) {
    const ai = aiResult.value;
    state.ai = {
      ready: Boolean(ai.ready),
      name: ai.name || "",
      provider: ai.provider === "yandex" ? "yandex" : "gigachat",
      folder: ai.folder || "",
    };
  }

  state.bootError = bootError;
  state.loading = false;
  applyBrandFont();
  updateAiPill();
}

/* ───────────── маршруты ───────────── */

function parseRoute() {
  const raw = String(location.hash || "").replace(/^#\/?/, "");
  const parts = raw.split("/").filter(Boolean);
  const screen = ["home", "books", "ask", "ai", "result"].includes(parts[0]) ? parts[0] : "home";
  return {
    screen,
    tab: screen === "result" && parts[1] ? decodeURIComponent(parts[1]) : "",
  };
}

function navigate(screen) {
  const next = ["home", "books", "ask", "ai"].includes(screen) ? screen : "home";
  state.screen = next;
  state.status = "";
  const hash = `#/${next}`;
  if (location.hash === hash) {
    render();
    return;
  }
  location.hash = hash;
}

function goResult(tab) {
  state.screen = "result";
  state.tab = tab || state.tab || "scheme";
  state.status = "";
  const hash = `#/result/${encodeURIComponent(state.tab)}`;
  if (location.hash === hash) render();
  else location.hash = hash;
}

function goBack() {
  if (state.busy) return;
  if (state.screen === "result") navigate("ask");
  else navigate("home");
}

function focusView() {
  const view = $("#view");
  if (view) view.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "auto" });
}

function applyRoute({ focus = false } = {}) {
  const route = parseRoute();
  const previous = state.screen;
  state.screen = route.screen;
  if (route.screen === "result" && route.tab) state.tab = route.tab;
  if (route.screen !== "result") {
    state.status = "";
    state.slide = 0;
  }
  render();
  if (focus && previous !== route.screen) focusView();
}

/* ───────────── рендер ───────────── */

function render() {
  stopGenTicker();
  const view = $("#view");
  if (!view) return;
  view.setAttribute("aria-busy", state.busy ? "true" : "false");

  if (state.loading) {
    view.innerHTML = loadingHtml();
    updateChrome();
    return;
  }

  const generating = state.busy && state.busyKind === "generate";
  if (generating) {
    view.innerHTML = generatingHtml();
  } else if (state.screen === "home") {
    view.innerHTML = homeHtml();
  } else if (state.screen === "books") {
    view.innerHTML = booksHtml();
  } else if (state.screen === "ask") {
    view.innerHTML = askHtml();
  } else if (state.screen === "ai") {
    view.innerHTML = aiHtml();
  } else {
    view.innerHTML = resultHtml();
  }

  updateChrome();
  bindCommon();

  if (!generating) {
    if (state.screen === "books") bindBooks();
    if (state.screen === "ask") bindAsk();
    if (state.screen === "ai") bindAi();
    if (state.screen === "result") bindResult();
  }

  if (generating) startGenTicker();
  updateDocumentTitle();
}

function updateChrome() {
  const back = $("#back");
  if (back) back.hidden = state.screen === "home" || state.busy || Boolean(inMessenger && bridge?.BackButton);

  const who = $("#who");
  const titles = {
    home: "строго по учебнику",
    ask: "тема и класс",
    books: "библиотека",
    ai: "нейросеть",
    result: "готовый материал",
  };
  if (who) who.textContent = state.busy && state.busyKind === "generate" ? "собираю материал" : titles[state.screen] || titles.home;

  const dock = $("#dock");
  const showDock = state.screen === "ask" && !state.busy && !(inMessenger && hasMain) && dockMedia.matches;
  if (dock) {
    dock.hidden = !showDock;
    dock.innerHTML = showDock
      ? `<button type="button" class="btn btn-primary" id="dockGo">${ICON.spark} Собрать материал</button>`
      : "";
  }

  document.body.dataset.screen = state.screen;
  document.body.dataset.dock = showDock ? "on" : "off";
  updateAiPill();
  syncMainButton();
}

function updateDocumentTitle() {
  const titles = {
    home: "Наглядность+ — материалы по учебнику",
    books: "Учебники — Наглядность+",
    ask: "Новая тема — Наглядность+",
    ai: "Нейросеть — Наглядность+",
  };
  document.title =
    state.screen === "result" && state.pack?.topic ? `${state.pack.topic} — Наглядность+` : titles[state.screen] || titles.home;
}

function stopGenTicker() {
  if (genTimer) {
    window.clearInterval(genTimer);
    genTimer = null;
  }
}

function startGenTicker() {
  const list = $$(".gen-steps li");
  const hint = $("#genHint");
  if (!list.length) return;
  let step = 0;
  const paint = () => {
    list.forEach((item, index) => item.classList.toggle("active", index === step));
    if (hint) hint.textContent = `${GEN_STEPS[step]}…`;
  };
  paint();
  genTimer = window.setInterval(() => {
    step = (step + 1) % list.length;
    paint();
  }, 1700);
}

function loadingHtml() {
  return `<section class="generating" role="status" aria-live="polite">
    <div class="halo" aria-hidden="true"><span></span></div>
    <h1 class="display">Загружаю библиотеку</h1>
    <p>Подключаюсь к учебникам и нейросети…</p>
  </section>`;
}

function generatingHtml() {
  return `<section class="generating" role="status" aria-live="polite">
    <div class="halo" aria-hidden="true"><span></span></div>
    <div>
      <span class="kicker">Строго по учебнику</span>
      <h1 class="display">Собираю материал</h1>
      <p>«${esc(state.query)}» — ищу только по выбранным учебникам.</p>
      <p class="small muted" id="genHint">Ищу страницы в учебниках…</p>
    </div>
    <ol class="gen-steps">${GEN_STEPS.map(
      (step, index) => `<li${index === 0 ? ' class="active"' : ""}>${esc(step)}</li>`
    ).join("")}</ol>
  </section>`;
}

/* ───────────── главная ───────────── */

function flowHtml(step) {
  return `<div class="flow" role="group" aria-label="Этапы работы: параметры, затем материал">
    <span class="flow-step ${step > 1 ? "is-done" : "is-current"}"${step === 1 ? ' aria-current="step"' : ""}><b>${
      step > 1 ? "✓" : "1"
    }</b> Параметры</span>
    <span class="flow-bar" aria-hidden="true"></span>
    <span class="flow-step ${step === 2 ? "is-current" : ""}"${step === 2 ? ' aria-current="step"' : ""}><b>2</b> Материал</span>
  </div>`;
}

function askSummaryInner() {
  const typeLabel = (TYPES.find(([id]) => id === state.type) || [null, "Всё"])[1];
  const books = selectedBooks().length;
  const grade = String(state.grade || "").trim();
  const count = Number(state.count) || 8;
  const parts = [`<span class="sum-item"><b>${esc(typeLabel)}</b></span>`];
  if (grade) parts.push(`<span class="sum-item">${esc(grade)} класс</span>`);
  if (books) parts.push(`<span class="sum-item">${books} ${plural(books, "учебник", "учебника", "учебников")}</span>`);
  if (state.type === "test" || state.type === "all") {
    parts.push(`<span class="sum-item">${count} ${plural(count, "задание", "задания", "заданий")}</span>`);
  }
  return `<span class="sum-label">Соберём</span>${parts.join("")}`;
}

function resumeHtml() {
  const record = lastRecord();
  if (!record) return "";
  const pack = record.pack;
  const sources = (pack?.sources || []).length;
  const formats = pack?.materials ? Object.keys(pack.materials).length : 0;
  const typeLabel = (TYPES.find(([id]) => id === record.type) || [null, "Материал"])[1];
  const meta = [
    record.grade ? `${record.grade} класс` : "",
    sources ? `${sources} ${plural(sources, "источник", "источника", "источников")}` : "",
    formats ? `${formats} ${plural(formats, "раздел", "раздела", "разделов")}` : typeLabel,
    record.savedAt ? formatWhen(record.savedAt) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `<section class="resume" aria-labelledby="resumeTitle">
    <div class="resume-main">
      <span class="kicker">Продолжить</span>
      <h2 id="resumeTitle">${esc(record.topic)}</h2>
      <p class="resume-meta">${esc(meta)}</p>
    </div>
    <div class="resume-actions">
      <button type="button" class="btn btn-primary btn-sm" data-resume>${ICON.arrow} Открыть</button>
      <button type="button" class="btn btn-ghost btn-sm" data-resume-edit>Изменить</button>
    </div>
  </section>`;
}

function homeHtml() {
  const name = bridge?.initDataUnsafe?.user?.first_name || bridge?.initDataUnsafe?.user?.name || "";
  const books = state.books.length;
  const pages = state.books.reduce((sum, book) => sum + (Number(book.pages) || 0), 0);
  const recent = recentTopics();
  const aiLabel = state.ai.ready ? state.ai.name : "выключена";
  const greeting = name ? `${esc(name)}, что нужно <em>к уроку?</em>` : `Что нужно <em>к уроку?</em>`;

  return `<section class="hero">
    <div class="hero-copy">
      <span class="kicker">Для учителя</span>
      <h1 class="display">${greeting}</h1>
      <p class="lede">Схема, таблица, карточки, презентация и тест — строго по страницам загруженного учебника. Без выдуманных фактов.</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="#/ask">${ICON.spark} Собрать материал</a>
        <a class="btn btn-ghost" href="#/books">${ICON.book} Учебники <span class="count">${books}</span></a>
      </div>
    </div>
    <div class="stat-row">
      <span class="stat"><b>${books}</b> ${plural(books, "учебник", "учебника", "учебников")}</span>
      <span class="stat"><b>${pages}</b> ${plural(pages, "страница", "страницы", "страниц")}</span>
      <span class="stat"><b>${esc(aiLabel)}</b> нейросеть</span>
      ${state.cacheSize ? `<span class="stat"><b>${state.cacheSize}</b> в кэше</span>` : ""}
    </div>
  </section>
  ${state.bootError ? noticeHtml(`Сервер не отвечает: ${state.bootError}. Запустите npm start и обновите страницу.`, "warn") : ""}
  ${resumeHtml()}
  <div class="home-grid">
    <div class="stack">
      <div class="section-head"><h2>Готовые темы</h2><span>демо-учебники</span></div>
      <div class="topic-grid">${EXAMPLES.map(
        (example) => `<button type="button" class="topic" data-ex="${esc(example.query)}" data-grade="${esc(example.grade)}">
          <span><small>${esc(example.subject)} · ${esc(example.grade)} класс</small><b>${esc(example.title)}</b></span>
          <span class="arrow" aria-hidden="true">${ICON.arrow}</span>
        </button>`
      ).join("")}</div>
      ${
        recent.length
          ? `<section class="recent">
              <div class="section-head"><h2>Недавние</h2><span>${recent.length}</span></div>
              <div class="chips">${recent
                .map(
                  (topic) =>
                    `<button type="button" class="chip" data-ex="${esc(topic)}" data-grade="${esc(state.grade)}">${esc(topic)}</button>`
                )
                .join("")}</div>
            </section>`
          : ""
      }
      <p class="small muted">Демо-учебники уже в индексе. Повтор того же запроса открывается сразу.</p>
    </div>
    <aside class="stack">
      <div class="card">
        <span class="kicker">Как это работает</span>
        <ol class="how">
          <li><b>Загрузите учебник</b>PDF, EPUB, DjVu или TXT — страницы останутся на сервере.</li>
          <li><b>Назовите тему</b>Выберите класс и нужные учебники.</li>
          <li><b>Получите материал</b>Схему, карточки, презентацию и тест с ответами.</li>
        </ol>
      </div>
      <div class="ai-status ${state.ai.ready ? "on" : ""}">
        <span class="orb">${ICON.spark}</span>
        <div><b>${state.ai.ready ? esc(state.ai.name) : "Нейросеть не подключена"}</b><p>${
          state.ai.ready
            ? "Уточняет запрос и собирает тест по найденным страницам."
            : "Без ключа тест строится из текста учебника — это тоже работает."
        }</p></div>
      </div>
      <a class="btn btn-ghost btn-block" href="#/ai">Настроить нейросеть</a>
    </aside>
  </div>`;
}

/* ───────────── библиотека ───────────── */

function bookCover(book) {
  const source = String(book?.subject || book?.title || "У").trim();
  return esc(source.charAt(0).toUpperCase());
}

function bookCard(book) {
  const meta = [
    book.publisher,
    book.subject,
    book.grade ? `${book.grade} класс` : "",
    book.pages ? `${book.pages} ${plural(book.pages, "страница", "страницы", "страниц")}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `<article class="book">
    <span class="book-cover" aria-hidden="true">${bookCover(book)}</span>
    <div class="book-info"><b>${esc(book.title || "Без названия")}</b><small>${esc(meta || "Учебник")}</small></div>
    <button type="button" class="icon-btn del" data-del="${esc(book.id)}" aria-label="Удалить учебник «${esc(
      book.title || "Без названия"
    )}»">${ICON.trash}</button>
  </article>`;
}

function booksHtml() {
  const fonts = ["Georgia", "Times New Roman", "PT Serif", "Arial"];
  const currentFont = state.brand?.font || "Georgia";
  if (!fonts.includes(currentFont)) fonts.push(currentFont);
  const primary = toHex(state.brand?.primary, "#1e5a46");
  const accent = toHex(state.brand?.accent, "#d4a017");
  const list = state.books.length
    ? `<div class="books-grid">${state.books.map(bookCard).join("")}</div>`
    : emptyHtml(
        "Библиотека пуста",
        "Загрузите первый учебник — и можно собирать материалы по его страницам.",
        ICON.book,
        `<button type="button" class="btn btn-ghost" id="pickFile">${ICON.upload} Выбрать файл</button>`
      );

  return `<header class="page-head">
    <span class="kicker">Библиотека</span>
    <h1 class="display">Учебники</h1>
    <p class="lede">Файл индексируется на сервере. В материал попадают только найденные страницы.</p>
  </header>
  ${state.bootError ? noticeHtml(`Сервер не отвечает: ${state.bootError}. Запустите npm start и обновите страницу.`, "warn") : ""}
  <div class="home-grid">
    <section>
      <div class="section-head"><h2>В библиотеке</h2><span>${state.books.length} ${plural(
        state.books.length,
        "учебник",
        "учебника",
        "учебников"
      )}</span></div>
      ${list}
    </section>
    <aside class="stack">
      <form id="up" class="card stack" enctype="multipart/form-data" novalidate>
        <div class="section-head"><h2>Добавить учебник</h2><span>до 80 МБ</span></div>
        <label class="file-field">
          <b>Файл учебника</b>
          <small>PDF, EPUB, DjVu или TXT. Индексация может занять минуту.</small>
          <input type="file" name="file" accept=".pdf,.epub,.djvu,.djv,.txt" required />
        </label>
        <div class="field-grid two">
          <label class="field"><span>Название</span><input class="input" name="title" placeholder="Биология. 9 класс" autocomplete="off" /></label>
          <label class="field"><span>Класс</span><input class="input" name="grade" placeholder="9" inputmode="numeric" autocomplete="off" /></label>
          <label class="field"><span>Издательство</span><input class="input" name="publisher" placeholder="Просвещение" autocomplete="off" /></label>
          <label class="field"><span>Предмет</span><input class="input" name="subject" placeholder="Биология" autocomplete="off" /></label>
        </div>
        <button class="btn btn-primary btn-block" type="submit">${ICON.upload} Проиндексировать</button>
        <p class="small muted" id="upStatus" role="status" aria-live="polite">${esc(state.status)}</p>
      </form>
      <details class="fold edit-fold">
        <summary>Оформление школы</summary>
        <div class="fold-body">
          <form id="brand" class="stack">
            <label class="field"><span>Название школы</span><input class="input" name="school" value="${esc(
              state.brand?.school || ""
            )}" placeholder="Школа" autocomplete="off" /></label>
            <div class="field-grid two">
              <label class="field"><span>Основной цвет</span><input class="color-input" type="color" name="primary" value="${primary}" /></label>
              <label class="field"><span>Акцент</span><input class="color-input" type="color" name="accent" value="${accent}" /></label>
            </div>
            <label class="field"><span>Шрифт материалов</span><select class="select" name="font">${fonts
              .map((font) => `<option value="${esc(font)}" ${font === currentFont ? "selected" : ""}>${esc(font)}</option>`)
              .join("")}</select></label>
            <button class="btn btn-ghost" type="submit">Сохранить для всех материалов</button>
          </form>
        </div>
      </details>
    </aside>
  </div>`;
}

/* ───────────── новая тема ───────────── */

function askHtml() {
  const grades = ["7", "8", "9", "10", "11"];
  const selected = new Set(selectedBooks());
  const books = state.books.length
    ? `<div class="pick-list">${state.books
        .map(
          (book) => `<label class="pick">
            <input type="checkbox" name="bid" value="${esc(book.id)}" ${selected.has(book.id) ? "checked" : ""} />
            <span><b>${esc(book.title || "Без названия")}</b><small>${esc(
              [book.publisher, book.subject, book.grade ? `${book.grade} класс` : ""].filter(Boolean).join(" · ") || "Учебник"
            )}</small></span>
          </label>`
        )
        .join("")}</div>`
    : `<div class="notice">${ICON.alert}<span>В библиотеке пока нет учебников. <a href="#/books">Загрузите первый</a> — и вернитесь к теме.</span></div>`;

  return `<header class="page-head">
    ${flowHtml(1)}
    <span class="kicker">Новая тема</span>
    <h1 class="display">Что собрать?</h1>
    <p class="lede">Выберите формат, класс и учебники. Материал соберётся только по найденным страницам.</p>
  </header>
  <form id="ask" class="card ask-card" novalidate>
    <div class="type-row">
      <div class="section-head"><h2>Формат</h2><span>можно всё сразу</span></div>
      <div class="chips" id="types" role="group" aria-label="Формат материала">${TYPES.map(
        ([id, name]) =>
          `<button type="button" class="chip" data-type="${id}" aria-pressed="${state.type === id}">${name}</button>`
      ).join("")}</div>
    </div>
    <div class="form-grid">
      <label class="field field-topic">
        <span>Тема</span>
        <textarea class="textarea" id="query" rows="2" placeholder="Световая фаза фотосинтеза" required>${esc(state.query)}</textarea>
        <small>Напишите так, как сказали бы ученику.</small>
      </label>
      <div class="field field-grade">
        <span>Класс</span>
        <div class="grade-row">
          <div class="chips" id="grades" role="group" aria-label="Класс">${grades
            .map(
              (grade) =>
                `<button type="button" class="chip" data-grade="${grade}" aria-pressed="${state.grade === grade}">${grade}</button>`
            )
            .join("")}</div>
          <label class="grade-custom"><span>Свой</span><input class="input" id="grade" value="${esc(
            state.grade
          )}" inputmode="numeric" placeholder="9" /></label>
        </div>
      </div>
      <div class="field field-count">
        <span>Заданий в тесте</span>
        <div class="chips" id="counts" role="group" aria-label="Количество заданий">${[5, 8, 10, 12]
          .map(
            (count) =>
              `<button type="button" class="chip" data-count="${count}" aria-pressed="${Number(state.count) === count}">${count}</button>`
          )
          .join("")}</div>
      </div>
      <div class="field field-books">
        <span>Из каких учебников</span>
        ${books}
        <small>Если ничего не выбрано, ищем во всех учебниках.</small>
      </div>
      <label class="switch switch-cache">
        <input type="checkbox" id="skipCache" ${state.skipCache ? "checked" : ""} />
        <span class="track" aria-hidden="true"></span>
        <span class="switch-text"><b>Собрать заново</b><small>Не открывать прошлый результат из кэша</small></span>
      </label>
    </div>
    <div class="ask-summary" id="askSummary">${askSummaryInner()}</div>
    <div class="form-actions">
      <button class="btn btn-primary" type="submit">${ICON.spark} Собрать материал</button>
      <span class="small muted">Обычно 10–20 секунд</span>
    </div>
    ${state.status ? noticeHtml(state.status, "warn") : ""}
  </form>`;
}

/* ───────────── нейросеть ───────────── */

function aiHtml() {
  const ai = state.ai || {};
  return `<header class="page-head">
    <span class="kicker">Нейросеть</span>
    <h1 class="display">Умный помощник</h1>
    <p class="lede">Модель уточняет формулировку темы и собирает тест по найденным страницам. Ключ хранится на сервере.</p>
  </header>
  <div class="home-grid">
    <div class="stack">
      <div class="ai-status ${ai.ready ? "on" : ""}">
        <span class="orb">${ICON.spark}</span>
        <div><b>${ai.ready ? esc(ai.name) : "Нейросеть не подключена"}</b><p>${
          ai.ready
            ? "Подключена: уточняет запрос и собирает тест по найденным страницам."
            : "Без ключа тест строится из текста учебника. Это тоже работает — просто без дополнительных формулировок."
        }</p></div>
      </div>
      <form id="ai" class="card stack">
        <div class="section-head"><h2>Подключение</h2><span>ключ не попадает в чат</span></div>
        <label class="field"><span>Модель</span><select class="select" name="provider">
          <option value="gigachat" ${ai.provider !== "yandex" ? "selected" : ""}>GigaChat</option>
          <option value="yandex" ${ai.provider === "yandex" ? "selected" : ""}>Алиса (YandexGPT)</option>
        </select></label>
        <label class="field"><span>Ключ авторизации</span><input class="input" name="key" type="password" autocomplete="off" placeholder="Кабинет GigaChat или Yandex Cloud" /><small>Для GigaChat — Basic-ключ, для Алисы — Api-Key.</small></label>
        <label class="field"><span>Каталог Yandex Cloud</span><input class="input" name="folder" value="${esc(
          ai.folder || ""
        )}" placeholder="Только для Алисы" autocomplete="off" /><small>Идентификатор каталога в Yandex Cloud.</small></label>
        <button class="btn btn-primary" type="submit">${ICON.spark} Подключить</button>
        <p class="small muted" id="aiStatus" role="status" aria-live="polite">${esc(state.status)}</p>
      </form>
    </div>
    <aside class="stack">
      <div class="card inset">
        <span class="kicker">Что меняется</span>
        <ol class="how">
          <li><b>Запрос</b>Модель уточняет тему и ищет близкие формулировки.</li>
          <li><b>Тест</b>Задания собираются по найденным страницам, а не из головы.</li>
          <li><b>Без ключа</b>Схема, карточки и тест всё равно собираются из текста.</li>
        </ol>
      </div>
      <div class="card">
        <span class="kicker">Безопасность</span>
        <p class="small muted">Ключ отправляется на ваш сервер и сохраняется в файле настроек. В браузер и в чат он не возвращается.</p>
      </div>
    </aside>
  </div>`;
}

/* ───────────── результат ───────────── */

function tabsFor(pack) {
  const materials = pack.materials || {};
  const names = {
    scheme: "Схема",
    table: "Таблица",
    cards: "Карточки",
    infographic: "Инфографика",
    presentation: "Презентация",
    test: "Тест",
  };
  const tabs = [{ id: "sources", label: "Источники", count: (pack.sources || []).length }];
  for (const id of Object.keys(names)) {
    if (!materials[id]) continue;
    const block = materials[id];
    let count;
    if (id === "test") count = (block.items || []).length;
    else if (id === "presentation") count = (block.slides || []).length;
    tabs.push({ id, label: names[id], count });
  }
  if (pack.factCheck) {
    tabs.push({ id: "facts", label: "Проверка", warn: Number(pack.factCheck.mismatches) || 0 });
  }
  if (pack.compare && Object.keys(pack.compare).length > 1) {
    tabs.push({ id: "compare", label: "Сравнение УМК", count: Object.keys(pack.compare).length });
  }
  return tabs;
}

function resultNotes(pack) {
  const notes = [];
  const search = pack.search || {};
  for (const fix of search.fixes || []) {
    notes.push({ kind: "info", text: `«${fix.raw}» искали как «${fix.suggestion}»` });
  }
  if ((search.unknown || []).length) {
    notes.push({ kind: "warn", text: `Нет в учебниках: ${search.unknown.join(", ")}` });
  }
  if ((search.quality ?? 1) < 0.45) {
    notes.push({ kind: "warn", text: "Тема найдена слабо — проверьте источники, прежде чем раздавать материал." });
  }
  if (pack.modelNote) notes.push({ kind: "warn", text: pack.modelNote });
  if ((pack.lookups || []).length) {
    notes.push({ kind: "info", text: `Модель дополнительно искала: ${pack.lookups.join("; ")}` });
  }
  return notes;
}

function emptyResultHtml() {
  return emptyHtml(
    "Материала пока нет",
    "Соберите схему, карточки и тест по страницам учебника — результат появится здесь.",
    ICON.spark,
    `<a class="btn btn-primary" href="#/ask">${ICON.spark} Собрать материал</a>`
  );
}

function resultHtml() {
  const pack = state.pack;
  if (!pack) return emptyResultHtml();
  const tabs = tabsFor(pack);
  if (!tabs.some((tab) => tab.id === state.tab)) {
    state.tab = tabs.find((tab) => tab.id !== "sources")?.id || "sources";
  }
  const [qualityText, qualityClass] = qualityLabel(pack.search?.quality ?? 1);
  const sourcesCount = (pack.sources || []).length;
  const notes = resultNotes(pack);
  const slides = pack.materials?.presentation?.slides || [];
  const when = formatWhen(pack.generatedAt);

  return `<header class="result-head">
    <div class="rh-main">
      ${flowHtml(2)}
      <span class="kicker">Готовый материал</span>
      <h1 class="display">${esc(pack.topic || state.query || "Материал")}</h1>
      <div class="meta-chips">
        <span class="pill">${sourcesCount} ${plural(sourcesCount, "источник", "источника", "источников")}</span>
        <span class="pill ${qualityClass}">Совпадение: ${esc(qualityText.toLowerCase())}</span>
        <span class="pill">${pack.model ? esc(pack.model) : "Без нейросети"}</span>
        ${pack.cached ? `<span class="pill">Из кэша</span>` : ""}
        ${when ? `<span class="pill">${esc(when)}</span>` : ""}
      </div>
    </div>
    <div class="result-actions">
      <a class="btn btn-ghost btn-sm" href="#/ask">${ICON.plus} Изменить тему</a>
      ${slides.length ? `<button type="button" class="btn btn-primary btn-sm" data-export>${ICON.download} PPTX</button>` : ""}
    </div>
  </header>
  ${notes.length ? `<div class="notice-list">${notes.map((note) => noticeHtml(note.text, note.kind)).join("")}</div>` : ""}
  <div class="tabs-wrap">
    <div class="tabs" role="tablist" aria-label="Разделы материала">${tabs
      .map((tab) => {
        const active = tab.id === state.tab;
        return `<button type="button" class="tab" role="tab" id="tab-${esc(tab.id)}" data-tab="${esc(
          tab.id
        )}" aria-selected="${active}" aria-controls="panel-${esc(tab.id)}" tabindex="${active ? "0" : "-1"}">${esc(
          tab.label
        )}${tab.count != null ? `<span class="cnt">${esc(tab.count)}</span>` : ""}${
          tab.warn ? `<span class="cnt warn">${esc(tab.warn)}</span>` : ""
        }</button>`;
      })
      .join("")}</div>
  </div>
  <div id="panels">${tabs
    .map(
      (tab) =>
        `<section class="tab-panel" id="panel-${esc(tab.id)}" role="tabpanel" aria-labelledby="tab-${esc(
          tab.id
        )}" tabindex="0" ${tab.id === state.tab ? "" : "hidden"}>${panelHtml(tab.id, pack)}</section>`
    )
    .join("")}</div>
  <details class="fold edit-fold" ${state.status ? "open" : ""}>
    <summary>Поправить готовое</summary>
    <div class="fold-body">
      <p class="small muted">Учебник заново не читается: блок добавится в схему и презентацию.</p>
      <form id="edit" class="stack">
        <label class="field"><span>Что добавить или уточнить</span><input class="input" id="editText" name="instruction" placeholder="Добавь блок про темновую фазу" autocomplete="off" required /></label>
        <div class="row"><button class="btn btn-ghost" type="submit">Поправить</button><span class="small muted" role="status" aria-live="polite">${esc(
          state.status
        )}</span></div>
      </form>
    </div>
  </details>`;
}

function panelHtml(id, pack) {
  if (id === "sources") return sourcesHtml(pack);
  if (id === "facts") return factsHtml(pack);
  if (id === "compare") return compareHtml(pack);
  const block = pack.materials?.[id];
  if (!block) return emptyHtml("Раздел не собран", "В этом материале нет такого блока.", ICON.spark);
  return materialHtml(id, block, pack);
}

/* ───────────── источники ───────────── */

function sourcesHtml(pack) {
  const sources = Array.isArray(pack.sources) ? pack.sources : [];
  if (!sources.length) {
    return emptyHtml("Страницы не найдены", "Попробуйте другую формулировку темы или загрузите нужный учебник.", ICON.book);
  }
  return `<div class="sources">
    <p class="small muted">Факты взяты только отсюда. Совпавшие слова подсвечены.</p>
    ${sources
      .map((source) => {
        const percent = Math.round(Math.min(1, Math.max(0.04, Number(source.score) || 0)) * 100);
        const passages = Array.isArray(source.passages) ? source.passages : [];
        const extra = passages.filter((passage) => !String(source.excerpt || "").includes(String(passage).slice(0, 40)));
        const subtitle = [source.section ? source.bookTitle : "", source.publisher].filter(Boolean).join(" · ");
        return `<article class="src" data-src-page="${esc(source.page)}">
          <div class="src-top">
            <div><b>${esc(source.section || source.bookTitle || "Страница учебника")}</b><small>${esc(
              subtitle || "Учебник"
            )}</small></div>
            ${pageBadge(source.page)}
          </div>
          <div class="bar" aria-hidden="true"><i style="width:${percent}%"></i></div>
          <div class="bar-label"><span>совпадение с запросом</span><span>${percent}%</span></div>
          <p class="excerpt">«${highlight(source.excerpt, source.marks)}»</p>
          ${
            extra.length
              ? `<details><summary>Ещё со страницы</summary>${extra
                  .map((passage) => `<p class="excerpt">«${highlight(passage, source.marks)}»</p>`)
                  .join("")}</details>`
              : ""
          }
        </article>`;
      })
      .join("")}
  </div>`;
}

/* ───────────── проверка и сравнение ───────────── */

function factsHtml(pack) {
  const facts = Array.isArray(pack.factCheck?.items) ? pack.factCheck.items : [];
  const bad = facts.filter((fact) => fact.status === "mismatch");
  if (!facts.length) {
    return emptyHtml("Нечего сверять", "В этом материале нет чисел и дат для автоматической проверки.", ICON.info);
  }
  return `<div class="card stack">
    <div class="section-head"><h2>Проверка цифр</h2><span>${facts.length} ${plural(
      facts.length,
      "проверка",
      "проверки",
      "проверок"
    )}</span></div>
    ${noticeHtml(
      bad.length
        ? `Расхождений: ${bad.length}. Проверьте эти места вручную.`
        : "Все цифры и даты найдены в тексте учебника.",
      bad.length ? "warn" : "info"
    )}
    <div class="facts">${facts
      .map(
        (fact) => `<div class="fact ${fact.status === "mismatch" ? "mismatch" : "ok"}">
          <span class="badge" aria-hidden="true">${fact.status === "mismatch" ? "✕" : "✓"}</span>
          <div><b>${esc(fact.claim)}</b> — ${esc(fact.hint)}${
            fact.context ? `<small>${esc(fact.context)}</small>` : ""
          }</div>
        </div>`
      )
      .join("")}</div>
  </div>`;
}

function compareHtml(pack) {
  const entries = Object.entries(pack.compare || {});
  if (!entries.length) {
    return emptyHtml("Нечего сравнивать", "В выдаче оказался только один УМК.", ICON.book);
  }
  return `<div class="compare">${entries
    .map(
      ([publisher, items]) => `<article class="cmp"><b>${esc(publisher)}</b>${(items || [])
        .map(
          (item) =>
            `<p>${pageBadge(item.page)} <span>${esc(item.excerpt || item.title || "Фрагмент страницы")}</span></p>`
        )
        .join("")}</article>`
    )
    .join("")}</div>`;
}

/* ───────────── материалы ───────────── */

function letterAt(index) {
  return LETTERS[index] || String.fromCharCode(1040 + Number(index));
}

function materialHtml(id, block, pack) {
  if (id === "scheme") return schemeHtml(block);
  if (id === "table") return tableHtml(block, pack);
  if (id === "cards") return cardsHtml(block);
  if (id === "infographic") return infographicHtml(block);
  if (id === "presentation") return presentationHtml(block);
  if (id === "test") return testHtml(block, pack);
  return emptyHtml("Раздел не собран", "В этом материале нет такого блока.", ICON.spark);
}

function schemeHtml(block) {
  const nodes = Array.isArray(block?.nodes) ? block.nodes : [];
  if (!nodes.length) return emptyHtml("Схема не собралась", "На найденных страницах не хватило фактов.", ICON.spark);
  return `<article class="card">
    <div class="section-head"><h2>Схема</h2><span>${nodes.length} ${plural(nodes.length, "узел", "узла", "узлов")}</span></div>
    <div class="scheme">${nodes
      .map(
        (node, index) => `<div class="node"><span class="num" aria-hidden="true">${index + 1}</span><div class="node-body"><b>${esc(
          node.title || "Без названия"
        )}</b><p>${esc(node.body || "")}</p>${pageBadge(node.page)}</div></div>`
      )
      .join("")}</div>
  </article>`;
}

function tableHtml(block, pack) {
  const headers = Array.isArray(block?.headers) ? block.headers : [];
  const rows = Array.isArray(block?.rows) ? block.rows : [];
  if (!rows.length) return emptyHtml("Таблица не собралась", "На найденных страницах не хватило фактов.", ICON.spark);
  return `<article class="card">
    <div class="section-head"><h2>Таблица</h2><span>${rows.length} ${plural(rows.length, "строка", "строки", "строк")}</span></div>
    <div class="table-wrap"><table class="mat"><caption>${esc(block?.topic || pack?.topic || "Сравнение")}</caption>
      <thead><tr>${headers.map((header) => `<th scope="col">${esc(header)}</th>`).join("")}</tr></thead>
      <tbody>${rows
        .map((row) => `<tr>${(Array.isArray(row) ? row : [row]).map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`)
        .join("")}</tbody>
    </table></div>
  </article>`;
}

function cardsHtml(block) {
  const items = Array.isArray(block?.items) ? block.items : [];
  if (!items.length) return emptyHtml("Карточки не собрались", "На найденных страницах не хватило фактов.", ICON.spark);
  return `<article class="card">
    <div class="section-head"><h2>Карточки</h2><span>${items.length} ${plural(items.length, "карточка", "карточки", "карточек")}</span></div>
    <div class="cards-grid">${items
      .map(
        (item) => `<article class="flashcard"><span class="num" aria-hidden="true">${esc(
          item.n ?? ""
        )}</span><b>${esc(item.front || "")}</b><p>${esc(item.back || "")}</p>${pageBadge(item.page)}</article>`
      )
      .join("")}</div>
  </article>`;
}

function infographicHtml(block) {
  const steps = Array.isArray(block?.steps) ? block.steps : [];
  if (!steps.length) return emptyHtml("Инфографика не собралась", "На найденных страницах не хватило фактов.", ICON.spark);
  return `<article class="card">
    <div class="section-head"><h2>Инфографика</h2><span>${steps.length} ${plural(steps.length, "шаг", "шага", "шагов")}</span></div>
    <div class="steps">${steps
      .map(
        (step, index) => `<div class="step"><span class="num" aria-hidden="true">${esc(
          step.n ?? index + 1
        )}</span><div><b>${esc(step.title || "Шаг")}</b><p>${esc(step.text || "")}</p>${pageBadge(step.page)}</div></div>`
      )
      .join("")}</div>
  </article>`;
}

function slideHtml(slide, index, total) {
  const bullets = Array.isArray(slide?.bullets) ? slide.bullets : [];
  return `<span class="slide-kicker">Слайд ${index + 1} из ${total}</span><h3>${esc(
    slide?.title || `Слайд ${index + 1}`
  )}</h3>${bullets.length ? `<ul>${bullets.map((bullet) => `<li>${esc(bullet)}</li>`).join("")}</ul>` : ""}`;
}

function presentationHtml(block) {
  const slides = Array.isArray(block?.slides) ? block.slides : [];
  if (!slides.length) return emptyHtml("Презентация не собралась", "На найденных страницах не хватило фактов.", ICON.spark);
  const index = Math.min(Math.max(Number(state.slide) || 0, 0), slides.length - 1);
  state.slide = index;
  return `<article class="card">
    <div class="section-head"><h2>Презентация</h2><span id="slideCount">${index + 1} / ${slides.length}</span></div>
    <div class="slide-stage" id="slideStage" tabindex="0" aria-label="Слайд ${index + 1} из ${slides.length}. Стрелки влево и вправо переключают слайды.">${slideHtml(
      slides[index],
      index,
      slides.length
    )}</div>
    <div class="slide-nav">
      <button type="button" class="btn btn-ghost btn-sm" id="prevSlide" aria-label="Предыдущий слайд">${ICON.left} Назад</button>
      <div class="slide-dots" id="slideDots" aria-label="Слайды">${slides
        .map(
          (_, slideIndex) =>
            `<button type="button" class="slide-dot" data-slide="${slideIndex}" aria-label="Слайд ${
              slideIndex + 1
            }" aria-current="${slideIndex === index}"></button>`
        )
        .join("")}</div>
      <button type="button" class="btn btn-ghost btn-sm" id="nextSlide" aria-label="Следующий слайд">Дальше ${ICON.right}</button>
    </div>
  </article>`;
}

/* ───────────── тест ───────────── */

function testHtml(block, pack) {
  const items = Array.isArray(block?.items) ? block.items : [];
  if (!items.length) {
    return emptyHtml(
      "Тест не собрался",
      "В найденных страницах мало определений и дат. Попробуйте другую тему или больше страниц.",
      ICON.spark
    );
  }
  const total = items.reduce((sum, item) => sum + (Number(item.points) || 1), 0);
  const mode = state.testMode === "key" ? "key" : "student";
  const title = block?.topic || pack?.topic || "Тест";
  return `<article class="test" id="tgTest" data-mode="${mode}">
    <div class="card test-head">
      <div class="score-ring" id="scoreRing" style="--p:0" role="img" aria-label="Результат: 0 из ${total}">
        <div class="inner"><span id="tgScore">0</span><small>из ${total}</small></div>
      </div>
      <div class="test-meta">
        <span class="kicker">Проверка</span>
        <h2>${esc(title)}</h2>
        <p>${items.length} ${plural(items.length, "задание", "задания", "заданий")} · ${pointsText(total)}</p>
        <div class="progress" id="testProgressWrap" role="progressbar" aria-label="Пройдено заданий" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="testProgress" style="width:0%"></i></div>
      </div>
      <div class="seg" role="group" aria-label="Режим теста">
        <button type="button" data-mode="student" class="${mode === "key" ? "" : "on"}">Ученик</button>
        <button type="button" data-mode="key" class="${mode === "key" ? "on" : ""}">Ключ</button>
      </div>
    </div>
    <div class="test-actions">
      <button type="button" class="btn btn-ghost btn-sm" data-print="student">${ICON.print} Без ответов</button>
      <button type="button" class="btn btn-ghost btn-sm" data-print="key">${ICON.print} С ключом</button>
      <button type="button" class="btn btn-ghost btn-sm" data-reset-test>${ICON.refresh} Сбросить</button>
    </div>
    ${block?.note ? noticeHtml(block.note, "warn") : ""}
    <div class="q-list">${items.map((item, index) => questionHtml(item, index)).join("")}</div>
  </article>`;
}

function questionHtml(item, index) {
  const type = item?.type || "choice";
  const points = Number(item?.points) || 1;
  const qid = `qtext-${index}`;
  const options = Array.isArray(item?.options) ? item.options : [];
  const kind = item?.kind || KIND_LABEL[type] || "Задание";
  let body = "";

  if (type === "choice" || type === "judge") {
    body = `<div class="q-opts ${type === "choice" ? "choice" : ""}" role="group" aria-labelledby="${qid}">${options
      .map((option, optionIndex) => {
        const mark = type === "judge" ? (optionIndex === 0 ? "✓" : "✕") : letterAt(optionIndex);
        return `<button type="button" class="opt" data-pick="${index}:${optionIndex}" aria-pressed="false"><span class="mark" aria-hidden="true">${mark}</span><span class="otext">${esc(
          option
        )}</span></button>`;
      })
      .join("")}</div>`;
  } else if (type === "multi") {
    body = `<div class="q-opts" role="group" aria-labelledby="${qid}">${options
      .map(
        (option, optionIndex) =>
          `<button type="button" class="opt" data-toggle="${index}:${optionIndex}" aria-pressed="false"><span class="mark sq" aria-hidden="true">${letterAt(
            optionIndex
          )}</span><span class="otext">${esc(option)}</span></button>`
      )
      .join("")}</div><div class="q-check"><button type="button" class="btn btn-ghost btn-sm" data-check="${index}">Проверить</button></div>`;
  } else if (type === "order") {
    body = `<p class="small muted">Нажимайте события по порядку — от раннего к позднему.</p>
      <div class="q-opts" role="group" aria-labelledby="${qid}">${options
        .map(
          (option, optionIndex) =>
            `<button type="button" class="opt" data-seq="${index}:${optionIndex}"><span class="mark" aria-hidden="true">•</span><span class="otext">${esc(
              option
            )}</span></button>`
        )
        .join("")}</div>
      <div class="q-check"><button type="button" class="btn btn-ghost btn-sm" data-seqreset="${index}">Сбросить порядок</button></div>
      <p class="small muted" id="seq-${index}" role="status" aria-live="polite"></p>`;
  } else if (type === "match") {
    const left = Array.isArray(item?.left) ? item.left : [];
    const right = Array.isArray(item?.right) ? item.right : [];
    body = `<div class="match">${left
      .map(
        (label, leftIndex) => `<div class="match-row" data-match-row="${index}:${leftIndex}">
          <label class="m-label" for="match-${index}-${leftIndex}">${leftIndex + 1}. ${esc(label)}</label>
          <select class="select" id="match-${index}-${leftIndex}" data-match="${index}:${leftIndex}">
            <option value="">—</option>${right.map((_, rightIndex) => `<option value="${rightIndex}">${letterAt(rightIndex)}</option>`).join("")}
          </select>
        </div>`
      )
      .join("")}</div>
      <ol class="match-list">${right
        .map((label, rightIndex) => `<li><b>${letterAt(rightIndex)}.</b> ${esc(label)}</li>`)
        .join("")}</ol>
      <div class="q-check"><button type="button" class="btn btn-ghost btn-sm" data-check="${index}">Проверить</button></div>`;
  } else {
    const rubric = Array.isArray(item?.rubric) ? item.rubric : [];
    body = `<div class="open-answer"><label class="field"><span>Ваш ответ</span><textarea class="textarea" id="open-${index}" data-open="${index}" placeholder="Запишите ответ своими словами…"></textarea></label></div>
      <details class="fold"><summary>Показать образец</summary><div class="fold-body"><p class="small">${esc(
        item?.sample || "Образец не задан."
      )}</p>${rubric.length ? `<ul class="rubric">${rubric.map((entry) => `<li>${esc(entry)}</li>`).join("")}</ul>` : ""}</div></details>`;
  }

  return `<section class="q card" data-q="${index}" data-type="${type}">
    <div class="q-head"><span class="q-num" aria-hidden="true">${index + 1}</span><span class="q-kind">${esc(
    kind
  )}</span><span class="q-points">${pointsText(points)}</span></div>
    <p class="q-text" id="${qid}">${esc(item?.q || "Задание")}</p>
    ${body}
    <div class="q-feedback" id="fb-${index}" role="status" aria-live="polite"></div>
    <div class="q-key"><b>Ответ:</b> ${esc(answerText(item))}${item?.hint ? ` · ${esc(item.hint)}` : ""} ${pageBadge(
    item?.page
  )}</div>
  </section>`;
}

function answerText(item) {
  const type = item?.type;
  const options = Array.isArray(item?.options) ? item.options : [];
  if (type === "choice") {
    const index = Number(item.answer);
    return options[index] != null ? `${letterAt(index)}. ${options[index]}` : "";
  }
  if (type === "judge") return options[Number(item.answer)] ?? "";
  if (type === "multi") {
    return (Array.isArray(item.answer) ? item.answer : [])
      .map((index) => `${letterAt(index)}. ${options[index]}`)
      .join("; ");
  }
  if (type === "order") {
    return (Array.isArray(item.answer) ? item.answer : [])
      .map((index) => options[index])
      .filter(Boolean)
      .join(" → ");
  }
  if (type === "match") {
    const left = Array.isArray(item.left) ? item.left : [];
    return left
      .map((label, index) => {
        const rightIndex = item.answer?.[index];
        return `${label} → ${rightIndex != null ? letterAt(rightIndex) : "—"}`;
      })
      .join("; ");
  }
  return item?.sample || "";
}

/* ───────────── тест: взаимодействия ───────────── */

function bindTest(root, pack) {
  if (!root) return;
  const items = Array.isArray(pack?.materials?.test?.items) ? pack.materials.test.items : [];
  const total = items.reduce((sum, item) => sum + (Number(item.points) || 1), 0);
  const done = new Map();
  const seq = new Map();
  const picked = new Map();
  const score = root.querySelector("#tgScore");
  const ring = root.querySelector("#scoreRing");
  const progress = root.querySelector("#testProgress");
  const progressWrap = root.querySelector("#testProgressWrap");
  const qOf = (index) => root.querySelector(`[data-q="${index}"]`);

  const updateScore = () => {
    let got = 0;
    done.forEach((ok, index) => {
      if (ok) got += Number(items[index]?.points) || 1;
    });
    const scorePercent = total ? Math.round((got / total) * 100) : 0;
    const answeredPercent = items.length ? Math.round((done.size / items.length) * 100) : 0;
    if (score) score.textContent = String(got);
    if (ring) {
      ring.style.setProperty("--p", String(scorePercent));
      ring.setAttribute("aria-label", `Результат: ${got} из ${total} ${plural(total, "балл", "балла", "баллов")}`);
    }
    if (progress) progress.style.width = `${answeredPercent}%`;
    if (progressWrap) progressWrap.setAttribute("aria-valuenow", String(answeredPercent));
  };

  const finish = (index, ok) => {
    if (done.has(index)) return;
    const item = items[index];
    done.set(index, Boolean(ok));
    const question = qOf(index);
    if (question) {
      question.querySelectorAll("button, select, textarea").forEach((element) => {
        element.disabled = true;
      });
      const feedback = question.querySelector(`#fb-${index}`);
      if (feedback) {
        feedback.className = `q-feedback ${ok ? "good" : "bad"}`;
        feedback.innerHTML = ok
          ? `<b>Верно.</b> ${esc(item?.hint || "")}`
          : `<b>Неверно.</b> Правильно: ${esc(answerText(item))}. ${esc(item?.hint || "")}`;
      }
    }
    updateScore();
    haptic(ok ? "success" : "error");
  };

  const reset = () => {
    const panel = root.closest(".tab-panel");
    if (!panel) return;
    panel.innerHTML = testHtml(pack.materials.test, pack);
    const fresh = panel.querySelector("#tgTest");
    if (fresh) bindTest(fresh, pack);
    toast("Тест сброшен");
    haptic("light");
  };

  root.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || !root.contains(button)) return;

    if (button.dataset.mode) {
      const mode = button.dataset.mode === "key" ? "key" : "student";
      state.testMode = mode;
      root.dataset.mode = mode;
      root.querySelectorAll("[data-mode]").forEach((element) => element.classList.toggle("on", element === button));
      haptic("light");
      return;
    }

    if (button.dataset.print) {
      const mode = button.dataset.print === "key" ? "key" : "student";
      const previous = state.testMode;
      root.dataset.mode = mode;
      document.body.dataset.print = mode;
      const restore = () => {
        root.dataset.mode = previous;
        delete document.body.dataset.print;
        window.removeEventListener("afterprint", restore);
      };
      window.addEventListener("afterprint", restore);
      try {
        window.print();
      } catch {
        /* печать недоступна */
      }
      window.setTimeout(restore, 900);
      return;
    }

    if (button.hasAttribute("data-reset-test")) {
      reset();
      return;
    }

    if (root.dataset.mode === "key") return;

    if (button.dataset.pick) {
      const [index, optionIndex] = button.dataset.pick.split(":").map(Number);
      const item = items[index];
      if (!item || done.has(index)) return;
      const correct = optionIndex === Number(item.answer);
      button.classList.add(correct ? "right" : "wrong");
      button.setAttribute("aria-pressed", "true");
      if (!correct) {
        const right = qOf(index)?.querySelector(`[data-pick="${index}:${item.answer}"]`);
        right?.classList.add("right");
      }
      finish(index, correct);
      return;
    }

    if (button.dataset.toggle) {
      const [index, optionIndex] = button.dataset.toggle.split(":").map(Number);
      if (done.has(index)) return;
      const set = picked.get(index) || new Set();
      if (set.has(optionIndex)) set.delete(optionIndex);
      else set.add(optionIndex);
      picked.set(index, set);
      button.classList.toggle("on", set.has(optionIndex));
      button.setAttribute("aria-pressed", String(set.has(optionIndex)));
      haptic("light");
      return;
    }

    if (button.dataset.seq) {
      const [index, optionIndex] = button.dataset.seq.split(":").map(Number);
      const item = items[index];
      if (!item || done.has(index)) return;
      const list = seq.get(index) || [];
      if (list.includes(optionIndex)) return;
      list.push(optionIndex);
      seq.set(index, list);
      button.classList.add("on");
      const mark = button.querySelector(".mark");
      if (mark) mark.textContent = String(list.length);
      const status = root.querySelector(`#seq-${index}`);
      if (status) status.textContent = `Выбрано ${list.length} из ${(item.options || []).length}`;
      haptic("light");
      if (list.length === (item.options || []).length) {
        const answers = Array.isArray(item.answer) ? item.answer.map(Number) : [];
        const ok = list.every((value, position) => value === answers[position]);
        qOf(index)?.querySelectorAll("[data-seq]").forEach((element) => {
          const value = Number(element.dataset.seq.split(":")[1]);
          const position = list.indexOf(value);
          element.classList.add(answers[position] === value ? "right" : "wrong");
          element.disabled = true;
        });
        finish(index, ok);
      }
      return;
    }

    if (button.dataset.seqreset) {
      const index = Number(button.dataset.seqreset);
      if (done.has(index)) return;
      seq.set(index, []);
      qOf(index)?.querySelectorAll("[data-seq]").forEach((element) => {
        element.classList.remove("on");
        element.disabled = false;
        const mark = element.querySelector(".mark");
        if (mark) mark.textContent = "•";
      });
      const status = root.querySelector(`#seq-${index}`);
      if (status) status.textContent = "";
      haptic("light");
      return;
    }

    if (button.dataset.check) {
      const index = Number(button.dataset.check);
      const item = items[index];
      const question = qOf(index);
      const feedback = question?.querySelector(`#fb-${index}`);
      if (!item || done.has(index)) return;

      if (item.type === "multi") {
        const set = [...(picked.get(index) || [])].sort((a, b) => a - b);
        if (!set.length) {
          if (feedback) {
            feedback.className = "q-feedback";
            feedback.textContent = "Сначала выберите хотя бы один вариант.";
          }
          return;
        }
        const right = new Set((Array.isArray(item.answer) ? item.answer : []).map(Number));
        const ok = set.length === right.size && set.every((value) => right.has(value));
        question?.querySelectorAll("[data-toggle]").forEach((element) => {
          const optionIndex = Number(element.dataset.toggle.split(":")[1]);
          element.classList.remove("on");
          element.classList.add(right.has(optionIndex) ? "right" : "wrong");
          element.disabled = true;
        });
        finish(index, ok);
        return;
      }

      if (item.type === "match") {
        const selects = [...(question?.querySelectorAll(`select[data-match^="${index}:"]`) || [])];
        const values = selects.map((select) => select.value);
        if (values.some((value) => value === "")) {
          if (feedback) {
            feedback.className = "q-feedback";
            feedback.textContent = "Выберите букву для каждой строки.";
          }
          return;
        }
        const answers = Array.isArray(item.answer) ? item.answer.map(Number) : [];
        const ok = values.length === answers.length && values.every((value, position) => Number(value) === answers[position]);
        selects.forEach((select, position) => {
          select.closest(".match-row")?.classList.add(Number(values[position]) === answers[position] ? "right" : "wrong");
          select.disabled = true;
        });
        finish(index, ok);
      }
    }
  });
}

/* ───────────── слайды и вкладки ───────────── */

function bindSlides() {
  const stage = $("#slideStage");
  const slides = Array.isArray(state.pack?.materials?.presentation?.slides)
    ? state.pack.materials.presentation.slides
    : [];
  if (!stage || !slides.length) return;

  const show = (index) => {
    const next = (index + slides.length) % slides.length;
    state.slide = next;
    stage.innerHTML = slideHtml(slides[next], next, slides.length);
    stage.setAttribute("aria-label", `Слайд ${next + 1} из ${slides.length}. Стрелки влево и вправо переключают слайды.`);
    const count = $("#slideCount");
    if (count) count.textContent = `${next + 1} / ${slides.length}`;
    $$("[data-slide]").forEach((dot) => dot.setAttribute("aria-current", String(Number(dot.dataset.slide) === next)));
    haptic("light");
  };

  $("#prevSlide")?.addEventListener("click", () => show(state.slide - 1));
  $("#nextSlide")?.addEventListener("click", () => show(state.slide + 1));
  $$("[data-slide]").forEach((dot) => dot.addEventListener("click", () => show(Number(dot.dataset.slide))));
  stage.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      show(state.slide - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      show(state.slide + 1);
    }
  });
}

function activateTab(tab, { focus = false } = {}) {
  const pack = state.pack;
  if (!pack) return;
  const tabs = tabsFor(pack);
  if (!tabs.some((item) => item.id === tab)) return;
  state.tab = tab;
  $$(".tabs [data-tab]").forEach((button) => {
    const active = button.dataset.tab === tab;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
    if (active && focus) button.focus();
  });
  $$(".tab-panel").forEach((panel) => {
    panel.hidden = panel.id !== `panel-${tab}`;
  });
  const hash = `#/result/${encodeURIComponent(tab)}`;
  if (location.hash !== hash) history.replaceState(null, "", hash);
}

function bindTabs(pack) {
  const tabs = tabsFor(pack);
  const list = $(".tabs");
  if (!list) return;
  list.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });
  const active = list.querySelector('[aria-selected="true"]');
  if (active && list.scrollWidth > list.clientWidth) {
    active.scrollIntoView({ inline: "center", block: "nearest" });
  }
  list.addEventListener("keydown", (event) => {
    const current = event.target.closest("[data-tab]");
    if (!current) return;
    const index = tabs.findIndex((tab) => tab.id === current.dataset.tab);
    if (index < 0) return;
    let next = null;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next == null) return;
    event.preventDefault();
    activateTab(tabs[next].id, { focus: true });
  });
}

function focusSource(page) {
  const value = String(page ?? "");
  if (!value) return;
  activateTab("sources");
  const target = $$("[data-src-page]").find((element) => element.dataset.srcPage === value);
  if (!target) return;
  window.setTimeout(() => {
    target.scrollIntoView({ block: "start", behavior: "smooth" });
    target.classList.add("flash");
    window.setTimeout(() => target.classList.remove("flash"), 1800);
  }, 80);
}

/* ───────────── привязки ───────────── */

function bindCommon() {
  $("#themeBtn")?.addEventListener("click", toggleTheme);
  $("#back")?.addEventListener("click", goBack);
  $$("[data-act='go']").forEach((element) => {
    element.addEventListener("click", () => navigate(element.dataset.screen || "home"));
  });
  $$("[data-ex]").forEach((element) => element.addEventListener("click", () => startExample(element)));
  $$("[data-page]").forEach((element) => element.addEventListener("click", () => focusSource(element.dataset.page)));
  $$("[data-export]").forEach((element) => element.addEventListener("click", exportPptx));
  $$("[data-resume]").forEach((element) => element.addEventListener("click", resumeLast));
  $$("[data-resume-edit]").forEach((element) => element.addEventListener("click", editLast));
  $("#pickFile")?.addEventListener("click", () => {
    const input = $("#up input[type='file']");
    if (input) {
      input.click();
      input.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  });
  $("#dockGo")?.addEventListener("click", () => {
    if (!state.busy) readAskAndGenerate();
  });
}

function startExample(button) {
  if (state.busy) return;
  state.query = button.dataset.ex || state.query;
  state.grade = button.dataset.grade || state.grade || "9";
  state.type = "all";
  state.status = "";
  state.screen = "ask";
  history.replaceState(null, "", "#/ask");
  generate(false);
}

function readAskAndGenerate() {
  snapshotAsk();
  const query = String(state.query || "").trim();
  if (query.length < 2) {
    state.status = "Укажите тему — хотя бы два символа.";
    toast(state.status, "error");
    render();
    return;
  }
  state.query = query;
  generate(false);
}

function bindAsk() {
  const refreshSummary = () => {
    snapshotAsk();
    const box = $("#askSummary");
    if (box) box.innerHTML = askSummaryInner();
  };
  $("#ask")?.addEventListener("input", (event) => {
    if (event.target.matches("#query, #grade")) refreshSummary();
  });
  $("#ask")?.addEventListener("change", (event) => {
    if (event.target.matches('input[name="bid"], #skipCache')) refreshSummary();
  });
  $("#types")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-type]");
    if (!button) return;
    snapshotAsk();
    state.type = button.dataset.type || "all";
    state.status = "";
    render();
    haptic("light");
  });
  $("#grades")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-grade]");
    if (!button) return;
    snapshotAsk();
    state.grade = button.dataset.grade || state.grade;
    state.status = "";
    render();
    haptic("light");
  });
  $("#counts")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-count]");
    if (!button) return;
    snapshotAsk();
    state.count = Number(button.dataset.count) || 8;
    state.status = "";
    render();
    haptic("light");
  });
  $("#ask")?.addEventListener("submit", (event) => {
    event.preventDefault();
    readAskAndGenerate();
  });
}

function bindBooks() {
  $("#up")?.addEventListener("submit", uploadBook);
  $("#brand")?.addEventListener("submit", saveBrand);
  $$("[data-del]").forEach((button) => {
    button.addEventListener("click", () => requestDelete(button.dataset.del));
  });
}

function bindAi() {
  $("#ai")?.addEventListener("submit", saveAi);
}

function bindResult() {
  const pack = state.pack;
  if (!pack) return;
  bindTabs(pack);
  const test = $("#tgTest");
  if (test) bindTest(test, pack);
  bindSlides();
  $("#edit")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $("#editText");
    editPack(input?.value.trim() || "");
  });
}

/* ───────────── действия ───────────── */

async function generate(skipCache) {
  if (state.busy) return;
  snapshotAsk();
  const query = String(state.query || "").trim();
  if (query.length < 2) {
    state.status = "Укажите тему — хотя бы два символа.";
    toast(state.status, "error");
    render();
    return;
  }
  state.query = query;
  state.busy = true;
  state.busyKind = "generate";
  state.status = "Ищу страницы учебника…";
  state.screen = "ask";
  history.replaceState(null, "", "#/ask");
  render();
  bridge?.MainButton?.showProgress?.();

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: state.query,
        type: state.type,
        grade: state.grade,
        count: Number(state.count) || 8,
        bookIds: selectedBooks(),
        skipCache: Boolean(skipCache ?? state.skipCache),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Ошибка ${response.status}`);
    state.pack = data;
    state.tab = data.materials?.[state.type] ? state.type : Object.keys(data.materials || {})[0] || "sources";
    state.slide = 0;
    state.status = "";
    rememberTopic(state.query);
    saveLastPack(data);
    state.busy = false;
    state.busyKind = "";
    haptic("success");
    goResult(state.tab);
  } catch (error) {
    state.status = error?.message || "Не удалось собрать материал";
    state.busy = false;
    state.busyKind = "";
    toast(state.status, "error");
    haptic("error");
    render();
  } finally {
    bridge?.MainButton?.hideProgress?.();
    syncMainButton();
  }
}

async function editPack(instruction) {
  if (!state.pack || !instruction || state.busy) return;
  const form = $("#edit");
  const button = form?.querySelector('button[type="submit"]');
  state.busy = true;
  state.busyKind = "edit";
  if (button) {
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span> Правлю…`;
  }
  try {
    const response = await fetch("/api/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pack: state.pack, instruction }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Не удалось поправить");
    state.pack = data;
    state.status = "Правка добавлена в схему и презентацию.";
    saveLastPack(data);
    state.busy = false;
    state.busyKind = "";
    toast(state.status);
    haptic("success");
    render();
  } catch (error) {
    state.status = error?.message || "Не удалось поправить";
    state.busy = false;
    state.busyKind = "";
    toast(state.status, "error");
    haptic("error");
    render();
  }
}

function requestDelete(id) {
  const book = state.books.find((item) => item.id === id);
  if (!book) return;
  openConfirm({
    title: "Удалить учебник?",
    message: `«${book.title || "Без названия"}» исчезнет из библиотеки и поиска. Это действие нельзя отменить.`,
    confirmLabel: "Удалить",
    onConfirm: async () => {
      const response = await fetch(`/api/books/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Не удалось удалить учебник");
      state.bookIds = state.bookIds.filter((bookId) => bookId !== id);
      await loadState();
      state.status = "";
      toast("Учебник удалён");
      haptic("success");
      render();
    },
  });
}

async function uploadBook(event) {
  event.preventDefault();
  if (state.busy) return;
  const form = event.target;
  const file = form.querySelector('input[type="file"]')?.files?.[0];
  const status = $("#upStatus");
  if (!file) {
    toast("Выберите файл учебника", "error");
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  state.busy = true;
  state.busyKind = "upload";
  if (button) {
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span> Индексирую…`;
  }
  if (status) status.textContent = "Индексация… Это может занять минуту.";

  try {
    const response = await fetch("/api/books", { method: "POST", body: new FormData(form) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || "Не удалось загрузить учебник");
    await loadState();
    state.status = `Готово: ${data.indexed ?? 0} ${plural(data.indexed, "фрагмент", "фрагмента", "фрагментов")}.`;
    state.busy = false;
    state.busyKind = "";
    toast(state.status);
    haptic("success");
    render();
  } catch (error) {
    state.status = error?.message || "Не удалось загрузить учебник";
    state.busy = false;
    state.busyKind = "";
    toast(state.status, "error");
    haptic("error");
    render();
  }
}

async function saveBrand(event) {
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector('button[type="submit"]');
  const body = {
    school: form.school.value.trim(),
    primary: form.primary.value,
    accent: form.accent.value,
    font: form.font.value,
  };
  if (button) button.disabled = true;
  try {
    const response = await fetch("/api/brand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Не удалось сохранить оформление");
    state.brand = { ...state.brand, ...data };
    applyBrandFont();
    toast("Оформление сохранено");
    haptic("success");
    render();
  } catch (error) {
    toast(error?.message || "Не удалось сохранить оформление", "error");
    if (button) button.disabled = false;
  }
}

async function saveAi(event) {
  event.preventDefault();
  if (state.busy) return;
  const form = event.target;
  const provider = form.provider.value === "yandex" ? "yandex" : "gigachat";
  const key = form.key.value.trim();
  const folder = form.folder.value.trim();
  const button = form.querySelector('button[type="submit"]');
  const status = $("#aiStatus");
  if (!key) {
    toast("Вставьте ключ авторизации", "error");
    form.key.focus();
    return;
  }
  state.busy = true;
  state.busyKind = "ai";
  if (button) {
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span> Проверяю ключ…`;
  }
  if (status) status.textContent = "Проверяю ключ…";

  try {
    const response = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, key, folder }),
    });
    const data = await response.json().catch(() => ({}));
    const name = data.name || (provider === "yandex" ? "Алиса" : "GigaChat");
    state.ai = {
      ready: Boolean(data.ok && data.ready),
      name,
      provider,
      folder: folder || data.folder || "",
    };
    state.status = data.ok
      ? `${name} подключена. Тесты собирает модель по страницам учебника.`
      : data.error || "Не удалось подключить";
    state.busy = false;
    state.busyKind = "";
    updateAiPill();
    toast(state.status, data.ok ? "ok" : "error");
    haptic(data.ok ? "success" : "error");
    render();
  } catch (error) {
    state.status = error?.message || "Не удалось подключить";
    state.busy = false;
    state.busyKind = "";
    toast(state.status, "error");
    haptic("error");
    render();
  }
}

function safeFileName(value) {
  return (
    String(value || "prezentaciya")
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60) || "prezentaciya"
  );
}

async function exportPptx() {
  const slides = state.pack?.materials?.presentation?.slides || [];
  if (!slides.length) return;
  const buttons = $$("[data-export]");
  buttons.forEach((button) => {
    button.disabled = true;
    button.dataset.label = button.innerHTML;
    button.innerHTML = `<span class="spinner"></span> Собираю…`;
  });
  try {
    const response = await fetch("/api/export/pptx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.pack),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Не удалось собрать файл");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFileName(state.pack?.topic || "prezentaciya")}.pptx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast("Презентация скачана");
    haptic("success");
  } catch (error) {
    toast(error?.message || "Не удалось скачать презентацию", "error");
    haptic("error");
  } finally {
    buttons.forEach((button) => {
      button.disabled = false;
      if (button.dataset.label) button.innerHTML = button.dataset.label;
    });
  }
}

/* ───────────── системная кнопка и запуск ───────────── */

function syncMainButton() {
  if (!bridge) return;
  try {
    if (hasMain) {
      const button = bridge.MainButton;
      button.setParams?.({ color: "#0f6b57", text_color: "#ffffff" });
      if (state.busy) {
        button.setText("Собираю…");
        button.show();
      } else if (state.screen === "home") {
        button.setText("Собрать по демо");
        button.show();
      } else if (state.screen === "ask") {
        button.setText("Собрать материал");
        button.show();
      } else if (state.screen === "books" || state.screen === "ai") {
        button.setText("К запросу");
        button.show();
      } else {
        button.hide();
      }
    }
    if (bridge.BackButton) {
      if (state.screen === "home" || state.busy) bridge.BackButton.hide();
      else bridge.BackButton.show();
    }
  } catch {
    /* мост недоступен */
  }
}

function onMain() {
  if (state.busy) return;
  if (state.screen === "home") {
    state.query = "фотосинтез, световая фаза";
    state.grade = "9";
    state.type = "scheme";
    state.screen = "ask";
    history.replaceState(null, "", "#/ask");
    generate(false);
  } else if (state.screen === "ask") {
    readAskAndGenerate();
  } else {
    navigate("ask");
  }
}

function boot() {
  setTheme(currentTheme(), { persist: false });
  let savedTheme = null;
  try {
    savedTheme = localStorage.getItem(THEME_KEY);
  } catch {
    /* хранилище недоступно */
  }
  if (!savedTheme && (bridge?.colorScheme === "dark" || bridge?.colorScheme === "light")) {
    setTheme(bridge.colorScheme, { persist: false });
  }

  if (bridge) {
    try {
      bridge.ready?.();
      bridge.expand?.();
      bridge.BackButton?.onClick?.(goBack);
      if (hasMain) bridge.MainButton.onClick(onMain);
      const start = bridge.initDataUnsafe?.start_param;
      if (start) {
        try {
          state.query = decodeURIComponent(start).replace(/_/g, " ");
        } catch {
          state.query = String(start).replace(/_/g, " ");
        }
      }
    } catch (error) {
      console.warn("Мост мессенджера:", error);
    }
  }

  updateAiPill();
  render();

  loadState()
    .then(() => {
      if (!location.hash) history.replaceState(null, "", "#/home");
      const route = parseRoute();
      state.screen = route.screen;
      if (route.tab) state.tab = route.tab;
      render();
      syncMainButton();
    })
    .catch((error) => {
      state.loading = false;
      state.bootError = error?.message || "Сервер не отвечает";
      state.screen = "home";
      render();
    });

  window.addEventListener("hashchange", () => applyRoute({ focus: true }));
  dockMedia.addEventListener?.("change", () => updateChrome());
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener?.("change", (event) => {
    let savedNow = null;
    try {
      savedNow = localStorage.getItem(THEME_KEY);
    } catch {
      /* хранилище недоступно */
    }
    if (!savedNow) setTheme(event.matches ? "dark" : "light", { persist: false });
  });
}

boot();





