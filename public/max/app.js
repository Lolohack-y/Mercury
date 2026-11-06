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
  clipboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h6M9 3h6v4H9zM7 5H5v16h14V5h-2"/><path d="M8 11h8M8 15h5"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 10 17 19 7"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
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
  user: null,
  authChecked: false,
  stats: null,
  tests: [],
  myAttempts: [],
  testsLoading: false,
  testDraft: null,
  publicTest: null,
  publicTestError: "",
  publicTestLoading: false,
  attempt: null,
  attemptResult: null,
  testResults: null,
  testResultsLoading: false,
  testResultsError: "",
  editorBusy: false,
};

let genTimer = null;
let toastTimer = null;
let attemptTimer = null;
let lastFocus = null;
const dockMedia = window.matchMedia("(max-width: 719px)");

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function authHeaders(extra = {}) {
  const headers = { ...extra };
  if (bridge?.initData) headers["X-Max-Init-Data"] = bridge.initData;
  return headers;
}

async function api(path, options = {}) {
  const headers = authHeaders(options.headers || {});
  if (typeof options.body === "string" && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(path, {
    credentials: "include",
    ...options,
    headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Ошибка ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function normalizeAi(value) {
  const ai = value && typeof value === "object" ? value : {};
  const quota = ai.quota && typeof ai.quota === "object" ? ai.quota : null;
  return {
    ready: Boolean(ai.ready),
    name: ai.name || "",
    provider: ["yandex", "openai"].includes(ai.provider) ? ai.provider : "gigachat",
    folder: ai.folder || "",
    authenticated: Boolean(ai.authenticated),
    role: ai.role || "guest",
    source: ai.source || "none",
    ownKey: Boolean(ai.ownKey),
    ownProviders: Array.isArray(ai.ownProviders) ? ai.ownProviders : [],
    pool: ai.pool && typeof ai.pool === "object" ? ai.pool : { keys: 0, providers: [] },
    quota,
    reason: ai.reason || "",
  };
}

function isTeacher(user = state.user) {
  return ["teacher", "admin"].includes(String(user?.role || ""));
}

function roleLabel(role) {
  return role === "admin" ? "Администратор" : role === "teacher" ? "Учитель" : role === "student" ? "Ученик" : "Гость";
}

function moscowWhen(iso, withYear = false) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    ...(withYear ? { year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  if (!total) return "0 с";
  if (total < 60) return `${Math.round(total)} с`;
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes} мин`;
  return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
}

function shareUrl(token) {
  return `${location.origin}/max/#/t/${encodeURIComponent(token)}`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Ссылка скопирована");
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    try {
      document.execCommand("copy");
      toast("Ссылка скопирована");
    } catch {
      toast("Скопируйте ссылку вручную", "error");
    }
    area.remove();
  }
  haptic("light");
}

async function refreshAuth() {
  try {
    const data = await api("/api/auth/me");
    state.user = data.authenticated ? data.user : null;
    state.ai = normalizeAi(data.ai);
  } catch {
    state.user = null;
  }
  state.authChecked = true;
  updateChrome();
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch {
    /* сессия уже закрыта */
  }
  state.user = null;
  state.ai = normalizeAi(null);
  state.tests = [];
  state.myAttempts = [];
  state.testDraft = null;
  state.testResults = null;
  state.stats = null;
  toast("Вы вышли из аккаунта");
  render();
}

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
  const label = ready ? `ИИ подключён: ${state.ai.name}` : "ИИ выключен";
  pill.setAttribute("aria-label", label);
  pill.title = label;
  const text = pill.querySelector(".ai-pill-text");
  if (text) text.textContent = "ИИ";
}

async function loadState() {
  let bootError = "";
  const [stateResult, meResult] = await Promise.allSettled([
    api("/api/state", { headers: { Accept: "application/json" } }),
    api("/api/auth/me", { headers: { Accept: "application/json" } }),
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

  if (meResult.status === "fulfilled" && meResult.value) {
    state.user = meResult.value.authenticated ? meResult.value.user : null;
    state.ai = normalizeAi(meResult.value.ai);
  } else {
    try {
      state.ai = normalizeAi(await api("/api/ai"));
    } catch {
      state.ai = normalizeAi(null);
    }
  }

  state.authChecked = true;
  state.bootError = bootError;
  state.loading = false;
  applyBrandFont();
  updateAiPill();
}

/* ───────────── маршруты ───────────── */

function parseRoute() {
  const raw = String(location.hash || "").replace(/^#\/?/, "");
  const parts = raw.split("/").filter(Boolean);
  if (parts[0] === "t") return { screen: "t", token: decodeURIComponent(parts[1] || "") };
  if (parts[0] === "test") return { screen: "test", id: decodeURIComponent(parts[1] || "") };
  const screen = ["home", "books", "ask", "ai", "result", "tests"].includes(parts[0]) ? parts[0] : "home";
  return {
    screen,
    tab: screen === "result" && parts[1] ? decodeURIComponent(parts[1]) : "",
  };
}

function navigate(screen) {
  const next = ["home", "books", "ask", "ai", "tests"].includes(screen) ? screen : "home";
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
  if (route.screen === "t") {
    if (state.publicTest && state.publicTest.shareToken !== route.token) {
      state.publicTest = null;
      state.attempt = null;
      state.attemptResult = null;
      state.publicTestError = "";
    }
    if (!state.publicTestLoading && (!state.publicTest || state.publicTest.shareToken !== route.token)) {
      loadPublicTest(route.token);
    }
  }
  if (route.screen === "test") {
    if (state.testResults?.test?.id !== route.id) state.testResults = null;
    if (!state.testResultsLoading && (!state.testResults || state.testResults.test?.id !== route.id)) {
      loadTestResults(route.id);
    }
  }
  if (route.screen === "tests" && !state.testsLoading && state.user) {
    loadTests();
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
  } else if (state.screen === "tests") {
    view.innerHTML = testsHtml();
  } else if (state.screen === "t") {
    view.innerHTML = testTakeHtml();
  } else if (state.screen === "test") {
    view.innerHTML = testResultsHtml();
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
    if (state.screen === "tests") bindTests();
    if (state.screen === "t") bindTestTake();
    if (state.screen === "test") bindTestResults();
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
    ai: "нейросеть и доступ",
    result: "готовый материал",
    tests: "тесты и результаты",
    t: "прохождение теста",
    test: "результаты теста",
  };
  if (who) who.textContent = state.busy && state.busyKind === "generate" ? "собираю материал" : titles[state.screen] || titles.home;

  const chip = $("#userChip");
  const initial = $("#userInitial");
  const role = $("#userRole");
  if (chip) {
    const user = state.user;
    chip.classList.toggle("authed", Boolean(user));
    chip.classList.toggle("teacher", isTeacher(user));
    chip.setAttribute("aria-label", user ? `${user.name}, ${roleLabel(user.role)}` : "Войти через MAX");
    chip.title = user ? `${user.name} · ${roleLabel(user.role)}` : "Войти через MAX";
  }
  if (initial) initial.textContent = state.user ? String(state.user.name || "Я").trim().charAt(0).toUpperCase() : "Г";
  if (role) role.textContent = state.user ? roleLabel(state.user.role) : "Гость";

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
    ai: "ИИ и доступ — Наглядность+",
    tests: "Тесты — Наглядность+",
    t: "Тест — Наглядность+",
    test: "Результаты теста — Наглядность+",
  };
  document.title =
    state.screen === "result" && state.pack?.topic
      ? `${state.pack.topic} — Наглядность+`
      : state.screen === "t" && state.publicTest?.title
        ? `${state.publicTest.title} — Наглядность+`
        : state.screen === "test" && state.testResults?.test?.title
          ? `${state.testResults.test.title} — результаты`
          : titles[state.screen] || titles.home;
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
  const name = state.user?.name || bridge?.initDataUnsafe?.user?.first_name || bridge?.initDataUnsafe?.user?.name || "";
  const books = state.books.length;
  const pages = state.books.reduce((sum, book) => sum + (Number(book.pages) || 0), 0);
  const recent = recentTopics();
  const greeting = name ? `${esc(name)}, что нужно <em>к уроку?</em>` : `Что нужно <em>к уроку?</em>`;
  const ai = state.ai;
  const quota = ai.quota;
  const teacher = isTeacher();
  const aiTitle = ai.ready ? (ai.ownKey ? "ИИ: свой ключ" : "ИИ подключён") : "ИИ не подключён";
  const aiText = !state.user
    ? "Войдите через MAX, чтобы получить ИИ и роль учителя. Без ИИ материалы собираются из текста учебника."
    : ai.ownKey
      ? `Свой ключ${ai.name ? ` (${ai.name})` : ""}: без дневного лимита.`
      : ai.ready
        ? `Общий ключ: осталось ${quota?.remaining ?? 0} из ${quota?.limit ?? 0} запросов сегодня.`
        : "Общий ключ ещё не настроен. Материалы собираются из текста учебника.";
  const aiStat = ai.ownKey
    ? `<span class="stat"><b>ИИ</b> свой ключ</span>`
    : ai.ready && quota
      ? `<span class="stat"><b>${quota.remaining ?? 0}</b> ${plural(quota.remaining ?? 0, "запрос", "запроса", "запросов")} ИИ</span>`
      : `<span class="stat"><b>ИИ</b> ${ai.ready ? "подключён" : "выключен"}</span>`;
  const account = state.user
    ? `<div class="card account-card">
        <span class="kicker">Аккаунт</span>
        <div class="account-row"><span class="avatar">${esc(String(state.user.name || "Я").trim().charAt(0).toUpperCase())}</span><div><b>${esc(
          state.user.name
        )}</b><small>${roleLabel(state.user.role)} · MAX</small></div></div>
        <a class="btn btn-ghost btn-block" href="#/ai">${ICON.spark} Настройки ИИ</a>
      </div>`
    : `<div class="card account-card">
        <span class="kicker">Аккаунт</span>
        <p class="small muted">Гость. Откройте приложение в MAX — аккаунт подтянется автоматически, без регистрации.</p>
        <a class="btn btn-ghost btn-block" href="#/ai">${ICON.user} Войти через MAX</a>
      </div>`;

  return `<section class="hero">
    <div class="hero-copy">
      <span class="kicker">${teacher ? "Для учителя" : state.user ? "Для ученика" : "Наглядность+"}</span>
      <h1 class="display">${greeting}</h1>
      <p class="lede">Схема, таблица, карточки, презентация и тест — строго по страницам загруженного учебника. Без выдуманных фактов.</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="#/ask">${ICON.spark} Собрать материал</a>
        <a class="btn btn-ghost" href="#/books">${ICON.book} Учебники <span class="count">${books}</span></a>
        <a class="btn btn-ghost" href="#/tests">${ICON.clipboard} Тесты</a>
      </div>
    </div>
    <div class="stat-row">
      <span class="stat"><b>${books}</b> ${plural(books, "учебник", "учебника", "учебников")}</span>
      <span class="stat"><b>${pages}</b> ${plural(pages, "страница", "страницы", "страниц")}</span>
      ${aiStat}
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
      ${account}
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
        <div><b>${state.ai.ready ? "ИИ подключён" : "ИИ не подключён"}</b><p>${
          state.ai.ready
            ? `Провайдер: ${esc(state.ai.name)}. Уточняет запрос и собирает тест по найденным страницам.`
            : "Без ключа тест строится из текста учебника — это тоже работает."
        }</p></div>
      </div>
      <a class="btn btn-ghost btn-block" href="#/ai">Настроить ИИ</a>
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
  const remove = isTeacher()
    ? `<button type="button" class="icon-btn del" data-del="${esc(book.id)}" aria-label="Удалить учебник «${esc(
        book.title || "Без названия"
      )}»">${ICON.trash}</button>`
    : "";
  return `<article class="book">
    <span class="book-cover" aria-hidden="true">${bookCover(book)}</span>
    <div class="book-info"><b>${esc(book.title || "Без названия")}</b><small>${esc(meta || "Учебник")}</small></div>
    ${remove}
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
      ${
        isTeacher()
          ? `<form id="up" class="card stack" enctype="multipart/form-data" novalidate>
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
      </details>`
          : `<div class="card stack">
        <span class="kicker">Библиотека школы</span>
        <p class="small muted">${
          state.user
            ? "Загружать и удалять учебники может учитель. Материалы собираются по этой библиотеке."
            : "Откройте приложение в MAX, чтобы получить аккаунт. Загружать учебники может учитель."
        }</p>
        <a class="btn btn-ghost btn-block" href="#/ai">${state.user ? ICON.user : ICON.lock} ${
              state.user ? "Аккаунт" : "Войти"
            }</a>
      </div>`
      }
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
  const ai = state.ai || normalizeAi(null);
  const user = state.user;
  const teacher = isTeacher();
  return `<header class="page-head">
    <span class="kicker">ИИ и доступ</span>
    <h1 class="display">Умный помощник</h1>
    <p class="lede">ИИ уточняет формулировку и собирает тест по найденным страницам. Вход нужен для ИИ и роли учителя, материалы собираются и без него.</p>
  </header>
  <div class="home-grid">
    <div class="stack">
      ${user ? accountCardHtml() : loginCardHtml()}
      <div class="ai-status ${ai.ready ? "on" : ""}">
        <span class="orb">${ICON.spark}</span>
        <div><b>${ai.ready ? "ИИ подключён" : "ИИ не подключён"}</b><p>${
          !user
            ? "Войдите через MAX, чтобы использовать ИИ. Без входа доступны схемы, карточки и тесты из текста учебника."
            : ai.ready
              ? `Провайдер: ${esc(ai.name || "ИИ")}. ${
                  ai.ownKey ? "Используется ваш ключ." : "Используется общий пул ключей."
                }`
              : "Нет доступного ключа. Материалы собираются из текста учебника."
        }</p></div>
      </div>
      ${user ? quotaBarHtml(ai) : ""}
      ${user ? aiKeyFormHtml(ai) : ""}
      ${teacher ? statsCardHtml() : ""}
    </div>
    <aside class="stack">
      <div class="card inset">
        <span class="kicker">Как работает доступ</span>
        <ol class="how">
          <li><b>MAX</b>Аккаунт подтягивается автоматически. Регистрация не нужна.</li>
          <li><b>Роли</b>Ученик — по умолчанию. Учителя и администратора назначает админ через базу или бота.</li>
          <li><b>Лимит</b>5 запросов ИИ в день. Свой ключ в настройках снимает ограничение.</li>
        </ol>
      </div>
      <div class="card">
        <span class="kicker">Общий пул</span>
        <p class="small muted">Если один ключ исчерпал лимит, сервер переключается на следующий доступный. Запросы и ошибки учитываются в статистике.</p>
      </div>
      <div class="card">
        <span class="kicker">Безопасность</span>
        <p class="small muted">Ключи хранятся на сервере в зашифрованном виде и не возвращаются в браузер.</p>
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
  list.addEventListener(
    "wheel",
    (event) => {
      if (list.scrollWidth <= list.clientWidth) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      list.scrollLeft += event.deltaY;
    },
    { passive: false }
  );
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
  $("#loginForm")?.addEventListener("submit", loginWithCode);
  $$("[data-logout]").forEach((button) => button.addEventListener("click", logout));
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
  $$("[data-ai-remove]").forEach((button) =>
    button.addEventListener("click", () => removeAiKey(button.dataset.aiRemove))
  );
  if (isTeacher()) loadStats();
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

/* ───────────── тесты учителя ───────────── */

const TEST_TYPES = [
  ["choice", "Один ответ"],
  ["multi", "Несколько ответов"],
  ["judge", "Верно / неверно"],
  ["order", "Последовательность"],
  ["open", "Открытый ответ"],
  ["match", "Пары"],
];

function providerName(id) {
  return id === "yandex" ? "Алиса" : id === "openai" ? "OpenAI" : "GigaChat";
}

function blankQuestion(type = "choice") {
  const question = {
    id: "",
    type,
    q: "",
    options: [],
    answer: 0,
    points: 1,
    sample: "",
    keywords: [],
    left: [],
    right: [],
  };
  if (type === "choice" || type === "multi" || type === "order") question.options = ["", ""];
  if (type === "multi") question.answer = [];
  if (type === "order") question.answer = [0, 1];
  if (type === "open") question.answer = null;
  if (type === "match") {
    question.left = ["", ""];
    question.right = ["", ""];
    question.answer = [0, 1];
  }
  return question;
}

function ensureQuestionShape(question) {
  if (!question || typeof question !== "object") return blankQuestion();
  if (!TEST_TYPES.some(([id]) => id === question.type)) question.type = "choice";
  question.points = Math.max(1, Math.min(20, Number(question.points) || 1));
  if (question.type === "choice" || question.type === "multi" || question.type === "order") {
    if (!Array.isArray(question.options)) question.options = [];
    while (question.options.length < 2) question.options.push("");
    if (question.type === "choice") {
      const answer = Number(question.answer);
      question.answer = Number.isInteger(answer) && answer >= 0 && answer < question.options.length ? answer : 0;
    } else if (question.type === "multi") {
      question.answer = Array.isArray(question.answer)
        ? [...new Set(question.answer.map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < question.options.length))]
        : [];
    } else {
      question.answer = question.options.map((_, index) => index);
    }
  }
  if (question.type === "judge") question.answer = Number(question.answer) === 1 ? 1 : 0;
  if (question.type === "open") {
    question.answer = null;
    if (!Array.isArray(question.keywords)) question.keywords = [];
  }
  if (question.type === "match") {
    if (!Array.isArray(question.left)) question.left = [];
    if (!Array.isArray(question.right)) question.right = [];
    while (question.left.length < 2) question.left.push("");
    while (question.right.length < 2) question.right.push("");
    question.answer = question.left.map((_, index) => index);
  }
  return question;
}

function toMoscowInput(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

function fromMoscowInput(value) {
  if (!value) return null;
  const date = new Date(`${value}:00+03:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function newTestDraft() {
  return {
    id: "",
    title: "",
    subject: "",
    grade: "",
    description: "",
    settings: {
      attempts: 1,
      deadline: "",
      shuffleQuestions: true,
      shuffleOptions: true,
      showAnswers: false,
      timeLimitMin: 0,
    },
    questions: [blankQuestion("choice")],
  };
}

function draftFromTest(test) {
  return {
    id: test.id || "",
    title: test.title || "",
    subject: test.subject || "",
    grade: test.grade || "",
    description: test.description || "",
    settings: {
      attempts: Number(test.settings?.attempts) || 1,
      deadline: toMoscowInput(test.settings?.deadline),
      shuffleQuestions: test.settings?.shuffleQuestions !== false,
      shuffleOptions: test.settings?.shuffleOptions !== false,
      showAnswers: Boolean(test.settings?.showAnswers),
      timeLimitMin: Number(test.settings?.timeLimitMin) || 0,
    },
    questions: (test.questions || []).map((question) =>
      ensureQuestionShape({
        id: question.id || "",
        type: question.type || "choice",
        q: question.q || "",
        options: Array.isArray(question.options) ? [...question.options] : [],
        answer: Array.isArray(question.answer) ? [...question.answer] : question.answer ?? 0,
        points: Number(question.points) || 1,
        sample: question.sample || "",
        keywords: Array.isArray(question.keywords) ? [...question.keywords] : [],
        left: Array.isArray(question.left) ? [...question.left] : [],
        right: Array.isArray(question.right) ? [...question.right] : [],
      })
    ),
  };
}

function typeOptionsHtml(current) {
  return TEST_TYPES.map(
    ([id, label]) => `<option value="${id}" ${id === current ? "selected" : ""}>${label}</option>`
  ).join("");
}

function optionRowsHtml(question, qi) {
  const rows = question.options
    .map((option, oi) => {
      let mark = "";
      if (question.type === "choice") {
        mark = `<input type="radio" name="ans-${qi}" data-field="answer" data-qi="${qi}" data-oi="${oi}" ${
          Number(question.answer) === oi ? "checked" : ""
        } aria-label="Верный вариант ${oi + 1}" />`;
      } else if (question.type === "multi") {
        mark = `<input type="checkbox" data-field="answer" data-qi="${qi}" data-oi="${oi}" ${
          Array.isArray(question.answer) && question.answer.includes(oi) ? "checked" : ""
        } aria-label="Верный вариант ${oi + 1}" />`;
      } else {
        mark = `<span class="ord-no" aria-hidden="true">${oi + 1}</span>`;
      }
      return `<div class="opt-row">${mark}<input class="input" data-field="opt" data-qi="${qi}" data-oi="${oi}" value="${esc(
        option
      )}" placeholder="Вариант ${oi + 1}" /><button type="button" class="icon-btn" data-qact="del-opt" data-qi="${qi}" data-oi="${oi}" aria-label="Удалить вариант">${
        ICON.trash
      }</button></div>`;
    })
    .join("");
  return `<div class="opt-list">${rows}</div><button type="button" class="btn btn-ghost btn-sm" data-qact="add-opt" data-qi="${qi}">${
    ICON.plus
  } Вариант</button>`;
}

function matchRowsHtml(question, qi) {
  const rows = question.left
    .map(
      (left, oi) => `<div class="match-row">
        <input class="input" data-field="left" data-qi="${qi}" data-oi="${oi}" value="${esc(left)}" placeholder="Слева ${
        oi + 1
      }" />
        <span class="match-arrow" aria-hidden="true">→</span>
        <input class="input" data-field="right" data-qi="${qi}" data-oi="${oi}" value="${esc(
          question.right?.[oi] || ""
        )}" placeholder="Справа ${oi + 1}" />
        <button type="button" class="icon-btn" data-qact="del-pair" data-qi="${qi}" data-oi="${oi}" aria-label="Удалить пару">${
          ICON.trash
        }</button>
      </div>`
    )
    .join("");
  return `<div class="match-editor">${rows}</div><button type="button" class="btn btn-ghost btn-sm" data-qact="add-pair" data-qi="${qi}">${
    ICON.plus
  } Пара</button>`;
}

function questionEditorHtml(question, qi) {
  const type = question.type || "choice";
  const options = ["choice", "multi", "order"].includes(type)
    ? `${optionRowsHtml(question, qi)}<small class="small muted">${
        type === "choice"
          ? "Отметьте один верный вариант."
          : type === "multi"
            ? "Отметьте все верные варианты."
            : "Перечислите варианты в правильном порядке — ученик увидит их перемешанными."
      }</small>`
    : "";
  const judge =
    type === "judge"
      ? `<label class="field"><span>Верный ответ</span><select class="select" data-field="judge" data-qi="${qi}"><option value="0" ${
          Number(question.answer) === 0 ? "selected" : ""
        }>Верно</option><option value="1" ${Number(question.answer) === 1 ? "selected" : ""}>Неверно</option></select></label>`
      : "";
  const open =
    type === "open"
      ? `<div class="field-grid two">
          <label class="field"><span>Образец ответа</span><textarea class="textarea" rows="2" data-field="sample" data-qi="${qi}" placeholder="Полный ответ">${esc(
            question.sample || ""
          )}</textarea></label>
          <label class="field"><span>Ключевые слова</span><input class="input" data-field="keywords" data-qi="${qi}" value="${esc(
            (question.keywords || []).join(", ")
          )}" placeholder="хлорофилл, хлоропласт" /><small>Через запятую. Достаточно половины совпадений.</small></label>
        </div>`
      : "";
  const match = type === "match" ? matchRowsHtml(question, qi) : "";
  return `<article class="q-editor card" data-qi="${qi}">
    <div class="q-editor-head">
      <span class="q-no">${qi + 1}</span>
      <select class="select" data-field="type" data-qi="${qi}" aria-label="Тип задания">${typeOptionsHtml(type)}</select>
      <label class="q-points-field"><span>Баллы</span><input class="input" type="number" min="1" max="20" data-field="points" data-qi="${qi}" value="${
        Number(question.points) || 1
      }" /></label>
      <span class="q-tools">
        <button type="button" class="icon-btn" data-qact="up" data-qi="${qi}" aria-label="Выше">↑</button>
        <button type="button" class="icon-btn" data-qact="down" data-qi="${qi}" aria-label="Ниже">↓</button>
        <button type="button" class="icon-btn" data-qact="remove" data-qi="${qi}" aria-label="Удалить задание">${
          ICON.trash
        }</button>
      </span>
    </div>
    <label class="field"><span>Задание</span><textarea class="textarea" rows="2" data-field="q" data-qi="${qi}" placeholder="Текст вопроса">${esc(
      question.q || ""
    )}</textarea></label>
    ${options}${judge}${open}${match}
  </article>`;
}

function testEditorHtml() {
  const draft = state.testDraft;
  const editing = Boolean(draft.id);
  return `<header class="page-head">
    <button type="button" class="link-back" data-editor-cancel>${ICON.left} К тестам</button>
    <span class="kicker">${editing ? "Редактирование" : "Новый тест"}</span>
    <h1 class="display">${editing ? "Изменить тест" : "Свой тест"}</h1>
    <p class="lede">Вопросы и варианты перемешиваются при каждой попытке. Дедлайн указывается по Москве.</p>
  </header>
  <form id="testEditor" class="stack" novalidate>
    <div class="card stack">
      <div class="section-head"><h2>Основное</h2><span>${draft.questions.length} ${plural(
        draft.questions.length,
        "задание",
        "задания",
        "заданий"
      )}</span></div>
      <label class="field"><span>Название</span><input class="input" data-field="title" value="${esc(
        draft.title
      )}" placeholder="Контрольная по фотосинтезу" required /></label>
      <div class="field-grid two">
        <label class="field"><span>Предмет</span><input class="input" data-field="subject" value="${esc(
          draft.subject
        )}" placeholder="Биология" /></label>
        <label class="field"><span>Класс</span><input class="input" data-field="grade" value="${esc(
          draft.grade
        )}" placeholder="9" inputmode="numeric" /></label>
      </div>
      <label class="field"><span>Описание</span><textarea class="textarea" rows="2" data-field="description" placeholder="Что проверяет тест">${esc(
        draft.description
      )}</textarea></label>
    </div>
    <div class="card stack">
      <div class="section-head"><h2>Параметры</h2><span>для всех учеников</span></div>
      <div class="field-grid two">
        <label class="field"><span>Попыток на ученика</span><input class="input" type="number" min="1" max="20" data-field="attempts" value="${
          Number(draft.settings.attempts) || 1
        }" /></label>
        <label class="field"><span>Время на попытку, мин</span><input class="input" type="number" min="0" max="300" data-field="timeLimitMin" value="${
          Number(draft.settings.timeLimitMin) || 0
        }" /><small>0 — без ограничения.</small></label>
      </div>
      <label class="field"><span>Дедлайн по МСК</span><input class="input" type="datetime-local" data-field="deadline" value="${esc(
        draft.settings.deadline || ""
      )}" /><small>После дедлайна тест закрывается, учителю уходит отчёт в MAX.</small></label>
      <div class="switch-list">
        <label class="switch"><input type="checkbox" data-field="shuffleQuestions" ${
          draft.settings.shuffleQuestions ? "checked" : ""
        } /><span class="track" aria-hidden="true"></span><span class="switch-text"><b>Перемешивать вопросы</b><small>Порядок меняется в каждой попытке</small></span></label>
        <label class="switch"><input type="checkbox" data-field="shuffleOptions" ${
          draft.settings.shuffleOptions ? "checked" : ""
        } /><span class="track" aria-hidden="true"></span><span class="switch-text"><b>Перемешивать варианты</b><small>Ответы тоже идут вразнобой</small></span></label>
        <label class="switch"><input type="checkbox" data-field="showAnswers" ${
          draft.settings.showAnswers ? "checked" : ""
        } /><span class="track" aria-hidden="true"></span><span class="switch-text"><b>Показывать ответы</b><small>Ученик увидит разбор после сдачи</small></span></label>
      </div>
    </div>
    <div class="section-head"><h2>Задания</h2><span>${draft.questions.length}</span></div>
    <div class="stack">${draft.questions.map(questionEditorHtml).join("")}</div>
    <button type="button" class="btn btn-ghost btn-block" data-qact="add">${ICON.plus} Добавить задание</button>
    <div class="form-actions">
      <button class="btn btn-primary" type="submit">${ICON.check} ${editing ? "Сохранить" : "Создать тест"}</button>
      <button class="btn btn-ghost" type="button" data-editor-cancel>Отмена</button>
    </div>
  </form>`;
}

function readDraftForm() {
  const draft = state.testDraft;
  if (!draft) return;
  const value = (selector) => $(selector)?.value ?? "";
  draft.title = value('[data-field="title"]');
  draft.subject = value('[data-field="subject"]');
  draft.grade = value('[data-field="grade"]');
  draft.description = value('[data-field="description"]');
  draft.settings.attempts = Number(value('[data-field="attempts"]')) || 1;
  draft.settings.timeLimitMin = Number(value('[data-field="timeLimitMin"]')) || 0;
  draft.settings.deadline = value('[data-field="deadline"]');
  draft.settings.shuffleQuestions = Boolean($('[data-field="shuffleQuestions"]')?.checked);
  draft.settings.shuffleOptions = Boolean($('[data-field="shuffleOptions"]')?.checked);
  draft.settings.showAnswers = Boolean($('[data-field="showAnswers"]')?.checked);
  draft.questions.forEach((question, qi) => {
    const typeSelect = $(`[data-field="type"][data-qi="${qi}"]`);
    if (typeSelect) question.type = typeSelect.value;
    question.q = value(`[data-field="q"][data-qi="${qi}"]`);
    question.points = Number(value(`[data-field="points"][data-qi="${qi}"]`)) || 1;
    if (["choice", "multi", "order"].includes(question.type)) {
      question.options = $$(`[data-field="opt"][data-qi="${qi}"]`).map((input) => input.value);
      if (question.type === "choice") {
        const checked = $(`[data-field="answer"][data-qi="${qi}"]:checked`);
        question.answer = checked ? Number(checked.dataset.oi) : 0;
      } else if (question.type === "multi") {
        question.answer = $$(`[data-field="answer"][data-qi="${qi}"]:checked`).map((input) => Number(input.dataset.oi));
      } else {
        question.answer = question.options.map((_, index) => index);
      }
    }
    if (question.type === "judge") {
      question.answer = Number(value(`[data-field="judge"][data-qi="${qi}"]`)) === 1 ? 1 : 0;
    }
    if (question.type === "open") {
      question.sample = value(`[data-field="sample"][data-qi="${qi}"]`);
      question.keywords = value(`[data-field="keywords"][data-qi="${qi}"]`)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (question.type === "match") {
      question.left = $$(`[data-field="left"][data-qi="${qi}"]`).map((input) => input.value);
      question.right = $$(`[data-field="right"][data-qi="${qi}"]`).map((input) => input.value);
      question.answer = question.left.map((_, index) => index);
    }
  });
}

function compactDraft(draft) {
  draft.questions.forEach((question) => {
    question.q = String(question.q || "").trim();
    question.points = Math.max(1, Math.min(20, Number(question.points) || 1));
    if (["choice", "multi", "order"].includes(question.type)) {
      const kept = [];
      const map = new Map();
      question.options.forEach((option, index) => {
        const text = String(option || "").trim();
        if (!text) return;
        map.set(index, kept.length);
        kept.push(text);
      });
      if (question.type === "choice") question.answer = map.get(Number(question.answer)) ?? 0;
      if (question.type === "multi") {
        question.answer = (Array.isArray(question.answer) ? question.answer : [])
          .map((index) => map.get(Number(index)))
          .filter((index) => index != null);
      }
      if (question.type === "order") question.answer = kept.map((_, index) => index);
      question.options = kept;
    }
    if (question.type === "match") {
      const pairs = question.left
        .map((left, index) => ({ left: String(left || "").trim(), right: String(question.right?.[index] || "").trim() }))
        .filter((pair) => pair.left && pair.right);
      question.left = pairs.map((pair) => pair.left);
      question.right = pairs.map((pair) => pair.right);
      question.answer = question.left.map((_, index) => index);
    }
  });
  draft.questions = draft.questions.filter((question) => question.q);
}

function validateDraft(draft) {
  if (!draft.title.trim()) throw new Error("Укажите название теста");
  if (!draft.questions.length) throw new Error("Добавьте хотя бы одно задание");
  draft.questions.forEach((question, index) => {
    if (!question.q) throw new Error(`Задание ${index + 1}: добавьте текст`);
    if (["choice", "multi", "order"].includes(question.type) && question.options.length < 2) {
      throw new Error(`Задание ${index + 1}: нужно минимум два варианта`);
    }
    if (question.type === "choice" && !Number.isInteger(Number(question.answer))) {
      throw new Error(`Задание ${index + 1}: отметьте верный вариант`);
    }
    if (question.type === "multi" && (!question.answer.length || question.answer.length === question.options.length)) {
      throw new Error(`Задание ${index + 1}: отметьте верные варианты, но не все`);
    }
    if (question.type === "match" && question.left.length < 2) {
      throw new Error(`Задание ${index + 1}: нужно минимум две пары`);
    }
  });
}

function draftPayload(draft) {
  return {
    title: draft.title.trim(),
    subject: draft.subject.trim(),
    grade: draft.grade.trim(),
    description: draft.description.trim(),
    settings: {
      attempts: Number(draft.settings.attempts) || 1,
      deadline: draft.settings.deadline ? fromMoscowInput(draft.settings.deadline) : null,
      shuffleQuestions: Boolean(draft.settings.shuffleQuestions),
      shuffleOptions: Boolean(draft.settings.shuffleOptions),
      showAnswers: Boolean(draft.settings.showAnswers),
      timeLimitMin: Number(draft.settings.timeLimitMin) || 0,
    },
    questions: draft.questions.map((question) => {
      const out = { type: question.type, q: question.q, points: question.points };
      if (question.id) out.id = question.id;
      if (["choice", "multi", "order"].includes(question.type)) {
        out.options = question.options;
        if (question.type === "choice") out.answer = Number(question.answer) || 0;
        if (question.type === "multi") out.answer = question.answer;
        if (question.type === "order") out.answer = question.options.map((_, index) => index);
      }
      if (question.type === "judge") out.answer = Number(question.answer) === 1 ? 1 : 0;
      if (question.type === "open") {
        out.sample = question.sample;
        out.keywords = question.keywords;
      }
      if (question.type === "match") {
        out.left = question.left;
        out.right = question.right;
        out.answer = question.left.map((_, index) => index);
      }
      return out;
    }),
  };
}

function loginCardHtml({ text = "" } = {}) {
  return `<div class="card stack login-card">
    <div class="section-head"><h2>Вход</h2><span>код доступа</span></div>
    <p class="small muted">${
      text ||
      "В MAX аккаунт подтягивается автоматически. В браузере введите код учителя или администратора."
    }</p>
    <form id="loginForm" class="stack">
      <label class="field"><span>Код</span><input class="input" name="code" autocomplete="one-time-code" placeholder="ABCD1234" required /></label>
      <button class="btn btn-primary" type="submit">${ICON.lock} Войти</button>
    </form>
    <p class="small muted">Роль ученика появляется сама после входа через MAX. Учителя назначает администратор через базу или бота.</p>
  </div>`;
}

function accountCardHtml() {
  const user = state.user;
  if (!user) return loginCardHtml();
  const initial = String(user.name || "Я").trim().charAt(0).toUpperCase();
  return `<div class="card account-card">
    <div class="account-row">
      <span class="avatar" aria-hidden="true">${esc(initial)}</span>
      <div><b>${esc(user.name)}</b><small>${roleLabel(user.role)} · ${user.source === "max" ? "MAX" : "код"}</small></div>
      <span class="pill">${roleLabel(user.role)}</span>
    </div>
    <div class="account-actions">
      <button type="button" class="btn btn-ghost btn-sm" data-logout>Выйти</button>
    </div>
  </div>`;
}

function quotaBarHtml(ai) {
  if (!state.user) return "";
  if (ai.ownKey) {
    return `<div class="card quota-card"><div class="quota-line"><b>Свой ключ</b><span>без дневного лимита</span></div><div class="quota-bar"><span style="width:100%"></span></div><small>Запросы идут через вашего провайдера.</small></div>`;
  }
  const quota = ai.quota;
  if (!quota) return "";
  const limit = Number(quota.limit) || 0;
  const used = Number(quota.used) || 0;
  const percent = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return `<div class="card quota-card">
    <div class="quota-line"><b>${quota.remaining ?? 0} из ${limit} запросов</b><span>${used} использовано</span></div>
    <div class="quota-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${limit}" aria-valuenow="${used}"><span style="width:${percent}%"></span></div>
    <small>Сброс в 00:00 МСК. Свой ключ в настройках снимает лимит.</small>
  </div>`;
}

function aiKeyFormHtml(ai) {
  const own = Array.isArray(state.user?.ownKeys) ? state.user.ownKeys : [];
  return `<form id="ai" class="card stack">
    <div class="section-head"><h2>Свой ключ</h2><span>снимает лимит</span></div>
    <p class="small muted">Если 5 запросов в день мало, добавьте свой ключ. Он хранится на сервере в зашифрованном виде и не возвращается в браузер.</p>
    ${
      own.length
        ? `<div class="key-list">${own
            .map(
              (provider) => `<div class="key-row"><span class="pill">${esc(
                providerName(provider)
              )}</span><small>ключ сохранён</small><button type="button" class="btn btn-ghost btn-sm" data-ai-remove="${esc(
                provider
              )}">Удалить</button></div>`
            )
            .join("")}</div>`
        : ""
    }
    <label class="field"><span>Провайдер</span><select class="select" name="provider">
      <option value="gigachat" ${ai.provider !== "yandex" && ai.provider !== "openai" ? "selected" : ""}>GigaChat</option>
      <option value="yandex" ${ai.provider === "yandex" ? "selected" : ""}>Алиса (YandexGPT)</option>
      <option value="openai" ${ai.provider === "openai" ? "selected" : ""}>OpenAI</option>
    </select></label>
    <label class="field"><span>Ключ</span><input class="input" name="key" type="password" autocomplete="off" placeholder="Вставьте ключ" /><small>Ключ проверяется сразу после сохранения.</small></label>
    <label class="field"><span>Каталог Yandex Cloud</span><input class="input" name="folder" value="${esc(
      ai.folder || ""
    )}" placeholder="Только для Алисы" autocomplete="off" /></label>
    <button class="btn btn-primary" type="submit">${ICON.spark} Подключить ключ</button>
    <p class="small muted" id="aiStatus" role="status" aria-live="polite">${esc(state.status)}</p>
    <details class="fold"><summary>Где взять ключ</summary><div class="fold-body small muted">
      <p><b>GigaChat:</b> developers.sber.ru → проект → ключ авторизации (Basic).</p>
      <p><b>Алиса:</b> Yandex Cloud → сервисный аккаунт → API-ключ и идентификатор каталога.</p>
      <p><b>OpenAI:</b> platform.openai.com → API keys.</p>
    </div></details>
  </form>`;
}

function statsCardHtml() {
  const stats = state.stats;
  if (!stats) {
    return `<div class="card"><span class="kicker">Статистика</span><p class="small muted">Загружаю…</p></div>`;
  }
  const providers = Object.keys(stats.byProvider || {})
    .map(providerName)
    .join(", ");
  return `<div class="card stack">
    <div class="section-head"><h2>Статистика</h2><span>за сегодня</span></div>
    <div class="summary-grid compact">
      <div class="summary-stat"><b>${stats.today?.total || 0}</b><small>запросов ИИ</small></div>
      <div class="summary-stat"><b>${stats.today?.ok || 0}</b><small>успешно</small></div>
      <div class="summary-stat"><b>${stats.totals?.total || 0}</b><small>всего</small></div>
      <div class="summary-stat"><b>${stats.tests?.count || 0}</b><small>тестов</small></div>
    </div>
    <p class="small muted">Провайдеры: ${esc(providers || "—")}. Отчёты по тестам и статистика также доступны в MAX-боте.</p>
  </div>`;
}

function testCard(test) {
  const share = shareUrl(test.shareToken);
  const meta = [test.subject, test.grade ? `${test.grade} класс` : ""].filter(Boolean).join(" · ");
  return `<article class="test-card card">
    <div class="test-card-head">
      <div><span class="kicker">${esc(meta || "Тест")}</span><h3>${esc(test.title)}</h3></div>
      <span class="pill ${test.status === "open" ? "good" : "low"}">${test.status === "open" ? "Открыт" : "Закрыт"}</span>
    </div>
    <p class="small muted">${test.questionCount} ${plural(
      test.questionCount,
      "задание",
      "задания",
      "заданий"
    )} · ${pointsText(test.totalPoints)} · попыток: ${test.attemptsCount || 0} · учеников: ${test.studentsCount || 0}</p>
    <p class="small muted">Попыток на ученика: ${test.settings?.attempts || 1}${
      test.settings?.deadline ? ` · до ${moscowWhen(test.settings.deadline, true)} МСК` : ""
    }</p>
    <div class="share-box">
      <input class="input" readonly value="${esc(share)}" aria-label="Ссылка на тест" />
      <button type="button" class="btn btn-ghost btn-sm" data-test-act="copy" data-token="${esc(
        test.shareToken
      )}">${ICON.copy} Копировать</button>
    </div>
    <div class="test-card-actions">
      <a class="btn btn-soft btn-sm" href="#/test/${esc(test.id)}">${ICON.chart} Результаты</a>
      <button type="button" class="btn btn-ghost btn-sm" data-test-act="edit" data-id="${esc(test.id)}">Изменить</button>
      <button type="button" class="btn btn-ghost btn-sm" data-test-act="report" data-id="${esc(
        test.id
      )}">Отчёт в MAX</button>
      ${
        test.status === "open"
          ? `<button type="button" class="btn btn-ghost btn-sm" data-test-act="close" data-id="${esc(
              test.id
            )}">Закрыть</button>`
          : ""
      }
      <button type="button" class="btn btn-danger btn-sm" data-test-act="delete" data-id="${esc(
        test.id
      )}">Удалить</button>
    </div>
  </article>`;
}

function myAttemptsHtml() {
  if (!state.myAttempts.length) {
    return emptyHtml(
      "Попыток пока нет",
      "Откройте ссылку учителя — тест появится здесь после сдачи.",
      ICON.clipboard
    );
  }
  return `<div class="attempt-list">${state.myAttempts
    .map(
      (attempt) => `<article class="attempt-row card">
        <div class="attempt-main"><b>${esc(attempt.testTitle)}</b><small>${esc(attempt.ownerName)} · ${moscowWhen(
        attempt.submittedAt,
        true
      )} МСК</small></div>
        <div class="attempt-score"><b>${attempt.score}/${attempt.maxScore}</b><small>${attempt.percent}% · ${formatDuration(
        attempt.durationSec
      )}</small></div>
        ${
          attempt.shareToken
            ? `<a class="btn btn-ghost btn-sm" href="#/t/${esc(attempt.shareToken)}">Открыть</a>`
            : ""
        }
      </article>`
    )
    .join("")}</div>`;
}

function testInfoCardHtml() {
  return `<div class="card inset">
    <span class="kicker">Как это работает</span>
    <ol class="how">
      <li><b>Ссылка</b>Учитель отправляет ссылку на тест — регистрация не нужна.</li>
      <li><b>Попытки</b>Вопросы идут вразнобой, попыток столько, сколько задал учитель.</li>
      <li><b>Результат</b>Баллы сохраняются сразу и попадают учителю в MAX.</li>
    </ol>
  </div>`;
}

function testRulesCard(settings = {}) {
  return `<div class="card inset">
    <span class="kicker">Правила</span>
    <ol class="how">
      <li><b>Порядок</b>${settings.shuffleQuestions === false ? "Вопросы идут по порядку." : "Вопросы перемешиваются в каждой попытке."}</li>
      <li><b>Варианты</b>${settings.shuffleOptions === false ? "Варианты идут по порядку." : "Варианты ответов тоже перемешиваются."}</li>
      <li><b>Попытки</b>${settings.attempts || 1} на ученика${settings.deadline ? `, дедлайн ${moscowWhen(settings.deadline, true)} МСК` : ""}.</li>
    </ol>
  </div>`;
}

function testsHtml() {
  if (state.testDraft) return testEditorHtml();
  const teacher = isTeacher();
  const head = `<header class="page-head">
    <span class="kicker">Тесты</span>
    <h1 class="display">${teacher ? "Мои тесты" : "Тесты и попытки"}</h1>
    <p class="lede">${
      teacher
        ? "Создайте тест из своих вопросов, отправьте ссылку ученикам и смотрите результаты здесь и в MAX."
        : "Пройдите тест по ссылке учителя. Результат сохранится автоматически."
    }</p>
  </header>`;
  if (!state.authChecked) return head + `<div class="card"><p class="small muted">Проверяю доступ…</p></div>`;
  if (!state.user) {
    return (
      head +
      `<div class="home-grid"><div class="stack">${loginCardHtml({
        text: "Откройте приложение в MAX — аккаунт подтянется сам. В браузере введите код учителя.",
      })}</div><aside class="stack">${testInfoCardHtml()}</aside></div>`
    );
  }
  if (state.testsLoading) return head + `<div class="card"><p class="small muted">Загружаю тесты…</p></div>`;
  if (teacher) {
    return (
      head +
      `<div class="stack">
        <div class="tests-toolbar">
          <button type="button" class="btn btn-primary" data-test-new>${ICON.plus} Новый тест</button>
          <a class="btn btn-ghost" href="#/ai">${ICON.user} Аккаунт</a>
        </div>
        ${
          state.tests.length
            ? `<div class="test-list">${state.tests.map(testCard).join("")}</div>`
            : emptyHtml(
                "Пока нет тестов",
                "Создайте первый тест из своих вопросов — ссылку можно отправить ученикам.",
                ICON.clipboard,
                `<button type="button" class="btn btn-primary" data-test-new>${ICON.plus} Создать тест</button>`
              )
        }
      </div>`
    );
  }
  return (
    head +
    `<div class="stack">
      ${accountCardHtml()}
      <div class="section-head"><h2>Мои попытки</h2><span>${state.myAttempts.length}</span></div>
      ${myAttemptsHtml()}
    </div>`
  );
}

function testIntroHtml(test) {
  const closed = test.status === "closed";
  const settings = test.settings || {};
  const meta = [test.subject, test.grade ? `${test.grade} класс` : ""].filter(Boolean).join(" · ");
  return `<header class="page-head">
    <span class="kicker">${esc(meta || "Тест учителя")}</span>
    <h1 class="display">${esc(test.title)}</h1>
    <p class="lede">${esc(test.description || "Тест по материалам учителя.")}</p>
  </header>
  <div class="home-grid">
    <div class="stack">
      <div class="card stack">
        <div class="meta-chips">
          <span class="pill">${test.questionCount} ${plural(
            test.questionCount,
            "задание",
            "задания",
            "заданий"
          )}</span>
          <span class="pill">${pointsText(test.totalPoints)}</span>
          <span class="pill">Попыток: ${settings.attempts || 1}</span>
          ${settings.deadline ? `<span class="pill">До ${moscowWhen(settings.deadline, true)} МСК</span>` : ""}
          ${settings.timeLimitMin ? `<span class="pill">${settings.timeLimitMin} мин</span>` : ""}
          <span class="pill ${closed ? "low" : "good"}">${closed ? "Закрыт" : "Открыт"}</span>
        </div>
        <p class="small muted">Автор: ${esc(test.ownerName || "Учитель")}</p>
        ${
          !state.user
            ? noticeHtml("Войдите через MAX, чтобы пройти тест. Аккаунт подтягивается автоматически, регистрация не нужна.", "warn")
            : ""
        }
        ${closed ? noticeHtml("Срок прохождения истёк или учитель закрыл тест.", "warn") : ""}
        ${
          state.user && !closed
            ? `<button type="button" class="btn btn-primary" data-attempt-start>${ICON.clipboard} Начать тест</button>`
            : ""
        }
      </div>
      ${
        !state.user
          ? loginCardHtml({ text: "В MAX вход произойдёт сам. В браузере введите код учителя или ученика." })
          : ""
      }
    </div>
    <aside class="stack">${testRulesCard(settings)}</aside>
  </div>`;
}

function attemptQuestionHtml(question, index) {
  const points = `${Number(question.points) || 1} ${plural(Number(question.points) || 1, "балл", "балла", "баллов")}`;
  let body = "";
  if (question.type === "choice" || question.type === "judge") {
    const options = question.type === "judge" ? ["Верно", "Неверно"] : question.options || [];
    body = `<div class="answers">${options
      .map(
        (option, oi) => `<label class="answer"><input type="radio" name="a-${esc(question.id)}" value="${oi}" /><span><b>${letterAt(
          oi
        )}</b> ${esc(option)}</span></label>`
      )
      .join("")}</div>`;
  } else if (question.type === "multi") {
    body = `<div class="answers">${(question.options || [])
      .map(
        (option, oi) => `<label class="answer"><input type="checkbox" name="a-${esc(question.id)}" value="${oi}" /><span><b>${letterAt(
          oi
        )}</b> ${esc(option)}</span></label>`
      )
      .join("")}</div>`;
  } else if (question.type === "open") {
    body = `<label class="field"><span>Ответ</span><textarea class="textarea" rows="4" data-open="${esc(
      question.id
    )}" placeholder="Напишите ответ"></textarea></label>`;
  } else if (question.type === "order") {
    body = `<ol class="order-list" data-order="${esc(question.id)}">${(question.options || [])
      .map(
        (option, oi) => `<li data-oi="${oi}"><span>${esc(option)}</span><span class="order-btns"><button type="button" class="icon-btn" data-order-move="up" aria-label="Выше">↑</button><button type="button" class="icon-btn" data-order-move="down" aria-label="Ниже">↓</button></span></li>`
      )
      .join("")}</ol><small class="small muted">Расставьте пункты в правильном порядке.</small>`;
  } else if (question.type === "match") {
    body = `<div class="match-list">${(question.left || [])
      .map(
        (left, li) => `<label class="match-item"><span>${esc(left)}</span><select class="select" data-match="${esc(
          question.id
        )}"><option value="">— выберите —</option>${(question.right || [])
          .map((right, ri) => `<option value="${ri}">${esc(right)}</option>`)
          .join("")}</select></label>`
      )
      .join("")}</div>`;
  }
  return `<article class="card attempt-q">
    <div class="q-head"><span class="q-no">${index + 1}</span><span class="pill">${points}</span></div>
    <p class="q-text">${esc(question.q)}</p>
    ${body}
  </article>`;
}

function attemptFormHtml(test) {
  const attempt = state.attempt;
  return `<header class="page-head">
    <span class="kicker">Попытка ${attempt.attemptNo} из ${attempt.attemptsLimit}</span>
    <h1 class="display">${esc(test.title)}</h1>
    <p class="lede">Ответьте на вопросы и отправьте работу. Проверка автоматическая.</p>
  </header>
  <form id="attemptForm" class="stack">
    <div class="test-timer" id="testTimer" data-deadline="${esc(attempt.deadline || "")}">${
      attempt.deadline ? "До конца: …" : "Без дедлайна"
    }</div>
    ${attempt.questions.map(attemptQuestionHtml).join("")}
    <div class="form-actions">
      <button class="btn btn-primary" type="submit">${ICON.check} Завершить тест</button>
      <span class="small muted">После отправки изменить ответы нельзя</span>
    </div>
  </form>`;
}

function detailHtml(detail) {
  return `<article class="card attempt-q ${detail.correct ? "is-correct" : "is-wrong"}">
    <div class="q-head"><span class="q-no">${detail.correct ? "✓" : "×"}</span><span class="pill ${
      detail.correct ? "good" : "low"
    }">${detail.got}/${detail.points}</span></div>
    <p class="q-text">${esc(detail.q)}</p>
    <p class="small"><b>Ваш ответ:</b> ${esc(detail.userAnswer || "—")}</p>
    ${!detail.correct ? `<p class="small muted"><b>Верно:</b> ${esc(detail.correctAnswer || "—")}</p>` : ""}
  </article>`;
}

function attemptResultHtml(test) {
  const result = state.attemptResult;
  const details = Array.isArray(result.details) ? result.details : [];
  const tone = result.percent >= 80 ? "good" : result.percent >= 50 ? "mid" : "low";
  return `<header class="page-head">
    <span class="kicker">Результат</span>
    <h1 class="display">${esc(test.title)}</h1>
  </header>
  <div class="home-grid">
    <div class="stack">
      <div class="card result-card">
        <div class="result-score"><b>${result.score}</b><span>из ${result.maxScore}</span></div>
        <div class="result-meta">
          <span class="pill ${tone}">${result.percent}%</span>
          <span class="pill">${formatDuration(result.durationSec)}</span>
          <span class="pill">Попытка ${result.attemptNo} из ${result.attemptsLimit}</span>
        </div>
        <p class="small muted">${
          result.attemptsLeft > 0 ? `Осталось попыток: ${result.attemptsLeft}.` : "Это была последняя попытка."
        }</p>
        <div class="form-actions">
          ${
            result.attemptsLeft > 0 && test.status !== "closed"
              ? `<button type="button" class="btn btn-primary" data-attempt-again>${ICON.spark} Пройти ещё раз</button>`
              : ""
          }
          <a class="btn btn-ghost" href="#/tests">К тестам</a>
        </div>
      </div>
      ${
        details.length
          ? `<div class="section-head"><h2>Разбор</h2><span>${details.filter((item) => item.correct).length} из ${
              details.length
            }</span></div><div class="stack">${details.map(detailHtml).join("")}</div>`
          : ""
      }
    </div>
    <aside class="stack">${testRulesCard(test.settings || {})}</aside>
  </div>`;
}

function testTakeHtml() {
  const head = `<header class="page-head"><span class="kicker">Тест</span><h1 class="display">${
    state.publicTest ? esc(state.publicTest.title) : "Проверка"
  }</h1></header>`;
  if (state.publicTestLoading && !state.publicTest) {
    return head + `<div class="card"><p class="small muted">Открываю тест…</p></div>`;
  }
  if (state.publicTestError) {
    return (
      head +
      emptyHtml("Тест не открылся", state.publicTestError, ICON.alert) +
      `<a class="btn btn-ghost" href="#/tests">К тестам</a>`
    );
  }
  const test = state.publicTest;
  if (!test) return head;
  if (state.attemptResult) return attemptResultHtml(test);
  if (state.attempt) return attemptFormHtml(test);
  return testIntroHtml(test);
}

function resultsTableHtml(data) {
  const test = data.test || {};
  const students = Array.isArray(data.students) ? data.students : [];
  if (!students.length) {
    return emptyHtml(
      "Пока никто не проходил",
      "Отправьте ученикам ссылку на тест — результаты появятся здесь.",
      ICON.clipboard
    );
  }
  return `<div class="table-wrap"><table class="mat">
    <caption>${students.length} ${plural(students.length, "ученик", "ученика", "учеников")} · ${
      data.summary?.submitted || 0
    } сдали</caption>
    <thead><tr><th>Ученик</th><th>Попытки</th><th>Лучший</th><th>Последний</th><th>Время</th><th>Сдал</th></tr></thead>
    <tbody>${students
      .map(
        (student) => `<tr>
        <td><b>${esc(student.name)}</b>${student.maxId ? `<small>MAX ${esc(student.maxId)}</small>` : ""}
          <details class="mini-attempts"><summary>по попыткам</summary><ol>${(student.attemptsList || [])
            .map(
              (attempt) =>
                `<li>№${attempt.attemptNo} — ${
                  attempt.status === "submitted"
                    ? `${attempt.score}/${attempt.maxScore} (${attempt.percent}%)`
                    : "не завершена"
                } · ${formatDuration(attempt.durationSec)}</li>`
            )
            .join("")}</ol></details>
        </td>
        <td>${student.attemptsCount || 0}</td>
        <td>${student.bestPercent || 0}%</td>
        <td>${student.lastScore == null ? "—" : `${student.lastScore}/${test.totalPoints || 0} (${student.lastPercent || 0}%)`}</td>
        <td>${formatDuration(student.totalDurationSec)}</td>
        <td>${student.lastSubmittedAt ? moscowWhen(student.lastSubmittedAt, true) : "—"}</td>
      </tr>`
      )
      .join("")}</tbody>
  </table></div>`;
}

function testResultsHtml() {
  const head = `<header class="page-head">
    <button type="button" class="link-back" data-result-act="back">${ICON.left} К тестам</button>
    <span class="kicker">Результаты</span>
    <h1 class="display">${state.testResults?.test?.title ? esc(state.testResults.test.title) : "Результаты теста"}</h1>
  </header>`;
  if (!state.user) {
    return (
      head +
      loginCardHtml({
        text: "Результаты доступны учителю. Войдите через MAX или введите код учителя.",
      })
    );
  }
  if (state.testResultsLoading && !state.testResults) {
    return head + `<div class="card"><p class="small muted">Загружаю результаты…</p></div>`;
  }
  if (state.testResultsError) {
    return head + emptyHtml("Не удалось открыть результаты", state.testResultsError, ICON.alert);
  }
  const data = state.testResults;
  if (!data) return head;
  const test = data.test || {};
  const summary = data.summary || {};
  const share = test.shareToken ? shareUrl(test.shareToken) : "";
  return `${head}
  <div class="summary-grid">
    <div class="summary-stat"><b>${summary.students || 0}</b><small>учеников</small></div>
    <div class="summary-stat"><b>${summary.submitted || 0}</b><small>сдали</small></div>
    <div class="summary-stat"><b>${summary.averagePercent || 0}%</b><small>средний лучший</small></div>
    <div class="summary-stat"><b>${summary.bestPercent || 0}%</b><small>лучший результат</small></div>
  </div>
  <div class="result-actions">
    ${share ? `<button type="button" class="btn btn-ghost btn-sm" data-result-act="copy" data-token="${esc(test.shareToken)}">${ICON.copy} Ссылка</button>` : ""}
    <button type="button" class="btn btn-ghost btn-sm" data-result-act="report" data-id="${esc(test.id)}">${ICON.chart} Отчёт в MAX</button>
    ${
      test.status === "open"
        ? `<button type="button" class="btn btn-ghost btn-sm" data-result-act="close" data-id="${esc(test.id)}">${ICON.lock} Закрыть</button>`
        : ""
    }
    <button type="button" class="btn btn-ghost btn-sm" data-result-act="edit" data-id="${esc(test.id)}">Изменить</button>
    <button type="button" class="btn btn-danger btn-sm" data-result-act="delete" data-id="${esc(test.id)}">Удалить</button>
  </div>
  ${share ? `<div class="share-box"><input class="input" readonly value="${esc(share)}" aria-label="Ссылка на тест" /><button type="button" class="btn btn-ghost btn-sm" data-result-act="copy" data-token="${esc(test.shareToken)}">${ICON.copy}</button></div>` : ""}
  <p class="small muted">${
    test.settings?.deadline
      ? `Дедлайн ${moscowWhen(test.settings.deadline, true)} МСК. После него отчёт автоматически уходит в MAX.`
      : "Отчёт можно отправить в MAX вручную."
  }</p>
  ${resultsTableHtml(data)}`;
}

/* ───────────── загрузка тестов и доступ ───────────── */

async function loadTests() {
  if (!state.user) return;
  state.testsLoading = true;
  render();
  try {
    const data = await api("/api/tests");
    state.tests = Array.isArray(data.tests) ? data.tests : [];
    state.myAttempts = Array.isArray(data.attempts) ? data.attempts : [];
  } catch (error) {
    toast(error?.message || "Не удалось загрузить тесты", "error");
  } finally {
    state.testsLoading = false;
    render();
  }
}

async function loadPublicTest(token) {
  if (!token) return;
  state.publicTestLoading = true;
  state.publicTestError = "";
  render();
  try {
    const data = await api(`/api/t/${encodeURIComponent(token)}`);
    state.publicTest = { ...data, shareToken: token };
    state.attempt = null;
    state.attemptResult = null;
  } catch (error) {
    state.publicTest = null;
    state.publicTestError = error?.message || "Ссылка не найдена";
  } finally {
    state.publicTestLoading = false;
    render();
  }
}

async function loadTestResults(id) {
  if (!id || !state.user) return;
  state.testResultsLoading = true;
  state.testResultsError = "";
  render();
  try {
    state.testResults = await api(`/api/tests/${encodeURIComponent(id)}/results`);
  } catch (error) {
    state.testResults = null;
    state.testResultsError = error?.message || "Не удалось открыть результаты";
  } finally {
    state.testResultsLoading = false;
    render();
  }
}

async function loadStats() {
  if (!isTeacher() || state.stats) return;
  try {
    state.stats = await api("/api/stats");
    render();
  } catch {
    /* статистика не критична */
  }
}

async function startAttempt() {
  const test = state.publicTest;
  if (!test || state.busy) return;
  if (!state.user) {
    toast("Войдите через MAX, чтобы пройти тест", "error");
    return;
  }
  const button = $("[data-attempt-start]");
  if (button) {
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span> Открываю…`;
  }
  try {
    state.attempt = await api(`/api/t/${encodeURIComponent(test.shareToken)}/start`, { method: "POST" });
    state.attemptResult = null;
    haptic("light");
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    toast(error?.message || "Не удалось начать тест", "error");
    if (button) {
      button.disabled = false;
      button.innerHTML = `${ICON.clipboard} Начать тест`;
    }
  }
}

function collectAttemptAnswers() {
  const attempt = state.attempt;
  const answers = {};
  if (!attempt) return answers;
  const form = $("#attemptForm");
  for (const question of attempt.questions || []) {
    if (question.type === "choice" || question.type === "judge") {
      const checked = form?.querySelector(`input[name="a-${question.id}"]:checked`);
      answers[question.id] = checked ? Number(checked.value) : null;
    } else if (question.type === "multi") {
      answers[question.id] = $$(`input[name="a-${question.id}"]:checked`, form).map((input) => Number(input.value));
    } else if (question.type === "open") {
      answers[question.id] = form?.querySelector(`[data-open="${question.id}"]`)?.value || "";
    } else if (question.type === "order") {
      const list = form?.querySelector(`[data-order="${question.id}"]`);
      answers[question.id] = list ? $$("li", list).map((item) => Number(item.dataset.oi)) : [];
    } else if (question.type === "match") {
      answers[question.id] = $$(`[data-match="${question.id}"]`, form).map((select) =>
        select.value === "" ? null : Number(select.value)
      );
    }
  }
  return answers;
}

async function submitAttempt() {
  const attempt = state.attempt;
  if (!attempt || state.busy) return;
  const button = $("#attemptForm button[type='submit']");
  state.busy = true;
  if (button) {
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span> Проверяю…`;
  }
  try {
    state.attemptResult = await api(`/api/attempts/${encodeURIComponent(attempt.id)}/submit`, {
      method: "POST",
      body: JSON.stringify({ answers: collectAttemptAnswers() }),
    });
    state.attempt = null;
    state.busy = false;
    haptic("success");
    toast("Тест сдан");
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    state.busy = false;
    toast(error?.message || "Не удалось отправить тест", "error");
    haptic("error");
    if (button) {
      button.disabled = false;
      button.innerHTML = `${ICON.check} Завершить тест`;
    }
  }
}

function startAttemptTimer() {
  clearInterval(attemptTimer);
  const element = $("#testTimer");
  if (!element) return;
  const deadline = element.dataset.deadline;
  const tick = () => {
    if (!deadline) {
      element.textContent = "Без дедлайна";
      return;
    }
    const left = Date.parse(deadline) - Date.now();
    if (left <= 0) {
      element.textContent = "Время истекло";
      element.classList.add("low");
      return;
    }
    const minutes = Math.floor(left / 60000);
    const seconds = Math.floor((left % 60000) / 1000);
    element.textContent = `До конца: ${minutes}:${String(seconds).padStart(2, "0")}`;
  };
  tick();
  attemptTimer = setInterval(tick, 1000);
}

async function saveDraft() {
  if (!state.testDraft || state.editorBusy) return;
  readDraftForm();
  const draft = state.testDraft;
  try {
    compactDraft(draft);
    validateDraft(draft);
    const payload = draftPayload(draft);
    state.editorBusy = true;
    const editing = Boolean(draft.id);
    const data = await api(editing ? `/api/tests/${encodeURIComponent(draft.id)}` : "/api/tests", {
      method: editing ? "PATCH" : "POST",
      body: JSON.stringify(payload),
    });
    state.testDraft = null;
    state.editorBusy = false;
    toast(editing ? "Тест сохранён" : "Тест создан");
    haptic("success");
    if (editing) {
      state.tests = state.tests.map((test) => (test.id === data.id ? data : test));
    } else {
      state.tests = [data, ...state.tests];
    }
    render();
  } catch (error) {
    state.editorBusy = false;
    toast(error?.message || "Не удалось сохранить тест", "error");
    haptic("error");
  }
}

function bindTests() {
  $$("[data-test-new]").forEach((button) =>
    button.addEventListener("click", () => {
      state.testDraft = newTestDraft();
      state.status = "";
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    })
  );
  $$("[data-test-act]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.testAct;
      const id = button.dataset.id;
      const token = button.dataset.token;
      if (action === "copy" && token) return copyText(shareUrl(token));
      if (action === "edit" && id) {
        const test = state.tests.find((item) => item.id === id);
        if (!test) return;
        state.testDraft = draftFromTest(test);
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (action === "delete" && id) return removeTest(id);
      if (action === "close" && id) return closeTest(id);
      if (action === "report" && id) return reportTest(id);
    });
  });
  $$("[data-editor-cancel]").forEach((button) =>
    button.addEventListener("click", () => {
      state.testDraft = null;
      render();
    })
  );
  $("#testEditor")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveDraft();
  });
  $("#testEditor")?.addEventListener("change", (event) => {
    const type = event.target.closest('[data-field="type"]');
    if (!type) return;
    readDraftForm();
    const question = state.testDraft?.questions?.[Number(type.dataset.qi)];
    if (!question) return;
    ensureQuestionShape(question);
    render();
  });
  $$("[data-qact]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.qact;
      const qi = Number(button.dataset.qi);
      const oi = Number(button.dataset.oi);
      if (!state.testDraft) return;
      readDraftForm();
      const questions = state.testDraft.questions;
      const question = Number.isInteger(qi) ? questions[qi] : null;
      if (action === "add") {
        questions.push(blankQuestion("choice"));
        render();
        return;
      }
      if (!question) return;
      if (action === "remove") {
        if (questions.length <= 1) {
          toast("Нужно хотя бы одно задание", "error");
          return;
        }
        questions.splice(qi, 1);
      } else if (action === "up" && qi > 0) {
        [questions[qi - 1], questions[qi]] = [questions[qi], questions[qi - 1]];
      } else if (action === "down" && qi < questions.length - 1) {
        [questions[qi + 1], questions[qi]] = [questions[qi], questions[qi + 1]];
      } else if (action === "add-opt") {
        question.options.push("");
      } else if (action === "del-opt") {
        if (question.options.length <= 2) {
          toast("Нужно минимум два варианта", "error");
          return;
        }
        question.options.splice(oi, 1);
        if (Number(question.answer) === oi) question.answer = 0;
        else if (Number(question.answer) > oi) question.answer = Number(question.answer) - 1;
        if (Array.isArray(question.answer)) {
          question.answer = question.answer
            .filter((index) => index !== oi)
            .map((index) => (index > oi ? index - 1 : index));
        }
      } else if (action === "add-pair") {
        question.left.push("");
        question.right.push("");
      } else if (action === "del-pair") {
        if (question.left.length <= 2) {
          toast("Нужно минимум две пары", "error");
          return;
        }
        question.left.splice(oi, 1);
        question.right.splice(oi, 1);
      } else {
        return;
      }
      ensureQuestionShape(question);
      render();
    });
  });
}

function bindTestTake() {
  $("[data-attempt-start]")?.addEventListener("click", startAttempt);
  $("[data-attempt-again]")?.addEventListener("click", () => {
    state.attemptResult = null;
    startAttempt();
  });
  $("#attemptForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const answers = collectAttemptAnswers();
    const attempt = state.attempt;
    if (!attempt) return;
    const answered = Object.values(answers).filter((value) =>
      Array.isArray(value) ? value.length : value !== null && value !== ""
    ).length;
    const left = attempt.questions.length - answered;
    openConfirm({
      title: "Завершить тест?",
      message:
        left > 0
          ? `Без ответа: ${left} ${plural(left, "задание", "задания", "заданий")}. После отправки изменить ответы нельзя.`
          : "Все задания отвечены. После отправки изменить ответы нельзя.",
      confirmLabel: "Завершить",
      onConfirm: submitAttempt,
    });
  });
  $$("[data-order-move]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = button.closest("li");
      const list = item?.parentElement;
      if (!item || !list) return;
      if (button.dataset.orderMove === "up" && item.previousElementSibling) {
        list.insertBefore(item, item.previousElementSibling);
      } else if (button.dataset.orderMove === "down" && item.nextElementSibling) {
        list.insertBefore(item.nextElementSibling, item);
      }
      haptic("light");
    });
  });
  if (state.attempt) startAttemptTimer();
}

function bindTestResults() {
  $$("[data-result-act]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.resultAct;
      const id = button.dataset.id || state.testResults?.test?.id;
      const token = button.dataset.token || state.testResults?.test?.shareToken;
      if (action === "back") return navigate("tests");
      if (action === "copy" && token) return copyText(shareUrl(token));
      if (action === "report" && id) return reportTest(id);
      if (action === "close" && id) return closeTest(id, true);
      if (action === "edit" && id) {
        const test = state.testResults?.test;
        if (!test) return;
        state.testDraft = draftFromTest(test);
        navigate("tests");
        render();
        return;
      }
      if (action === "delete" && id) return removeTest(id, true);
    });
  });
}

async function removeTest(id, fromResults = false) {
  const test = state.tests.find((item) => item.id === id) || state.testResults?.test;
  openConfirm({
    title: "Удалить тест?",
    message: `«${test?.title || "Тест"}» и все попытки учеников исчезнут. Это действие нельзя отменить.`,
    confirmLabel: "Удалить",
    onConfirm: async () => {
      await api(`/api/tests/${encodeURIComponent(id)}`, { method: "DELETE" });
      state.tests = state.tests.filter((item) => item.id !== id);
      if (state.testResults?.test?.id === id) state.testResults = null;
      toast("Тест удалён");
      haptic("success");
      if (fromResults) navigate("tests");
      else render();
    },
  });
}

async function closeTest(id, fromResults = false) {
  try {
    const data = await api(`/api/tests/${encodeURIComponent(id)}/close`, { method: "POST" });
    state.tests = state.tests.map((test) => (test.id === id ? { ...test, ...data } : test));
    if (state.testResults?.test?.id === id) {
      state.testResults = { ...state.testResults, test: { ...state.testResults.test, ...data } };
    }
    toast("Тест закрыт");
    haptic("success");
    if (fromResults) render();
    else render();
  } catch (error) {
    toast(error?.message || "Не удалось закрыть тест", "error");
  }
}

async function reportTest(id) {
  try {
    const data = await api(`/api/tests/${encodeURIComponent(id)}/report`, { method: "POST" });
    if (data.sent?.ok) {
      toast("Отчёт отправлен в MAX");
      haptic("success");
    } else {
      toast(data.sent?.error || "Отчёт готов, но MAX-бот не настроен", "error");
    }
  } catch (error) {
    toast(error?.message || "Не удалось отправить отчёт", "error");
  }
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
    const data = await api("/api/generate", {
      method: "POST",
      body: JSON.stringify({
        query: state.query,
        type: state.type,
        grade: state.grade,
        count: Number(state.count) || 8,
        bookIds: selectedBooks(),
        skipCache: Boolean(skipCache ?? state.skipCache),
      }),
    });
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
    const data = await api("/api/edit", {
      method: "POST",
      body: JSON.stringify({ pack: state.pack, instruction }),
    });
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
  if (!isTeacher()) {
    toast("Удалять учебники может учитель", "error");
    return;
  }
  const book = state.books.find((item) => item.id === id);
  if (!book) return;
  openConfirm({
    title: "Удалить учебник?",
    message: `«${book.title || "Без названия"}» исчезнет из библиотеки и поиска. Это действие нельзя отменить.`,
    confirmLabel: "Удалить",
    onConfirm: async () => {
      await api(`/api/books/${encodeURIComponent(id)}`, { method: "DELETE" });
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
    const data = await api("/api/books", { method: "POST", body: new FormData(form) });
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
    const data = await api("/api/brand", {
      method: "POST",
      body: JSON.stringify(body),
    });
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
  const provider = ["yandex", "openai"].includes(form.provider.value) ? form.provider.value : "gigachat";
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
    await api("/api/ai", {
      method: "POST",
      body: JSON.stringify({ provider, key, folder }),
    });
    await refreshAuth();
    state.status = `Ключ подключён: ${providerName(provider)}. Дневной лимит снят.`;
    state.busy = false;
    state.busyKind = "";
    updateAiPill();
    toast(state.status);
    haptic("success");
    render();
  } catch (error) {
    state.status = error?.message || "Не удалось подключить ключ";
    state.busy = false;
    state.busyKind = "";
    toast(state.status, "error");
    haptic("error");
    render();
  }
}

async function removeAiKey(provider) {
  if (!provider) return;
  try {
    await api(`/api/ai?provider=${encodeURIComponent(provider)}`, { method: "DELETE" });
    await refreshAuth();
    state.status = "Ключ удалён, снова действует общий пул.";
    toast("Ключ удалён");
    haptic("success");
    render();
  } catch (error) {
    toast(error?.message || "Не удалось удалить ключ", "error");
  }
}

async function loginWithCode(event) {
  event.preventDefault();
  const form = event.target;
  const code = String(form.code.value || "").trim();
  if (!code) return;
  const button = form.querySelector('button[type="submit"]');
  if (button) {
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span> Проверяю…`;
  }
  try {
    const data = await api("/api/auth/code", { method: "POST", body: JSON.stringify({ code }) });
    state.user = data.user;
    state.ai = normalizeAi(data.ai);
    state.tests = [];
    state.myAttempts = [];
    state.testDraft = null;
    state.stats = null;
    await loadState();
    toast(`Вы вошли: ${roleLabel(state.user.role)}`);
    haptic("success");
    render();
    if (state.screen === "tests") loadTests();
  } catch (error) {
    toast(error?.message || "Код не подошёл", "error");
    if (button) {
      button.disabled = false;
      button.innerHTML = `${ICON.lock} Войти`;
    }
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
      applyRoute();
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





