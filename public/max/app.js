// MAX Bridge: window.WebApp (https://st.max.ru/js/max-web-app.js). Запасной вариант: Telegram.
const tg = window.WebApp || window.Telegram?.WebApp;
const inMessenger = Boolean(tg?.initData);
const messengerName = window.WebApp ? "в MAX" : "в мессенджере";
// В MAX нет системной главной кнопки, поэтому показываем свою кнопку внизу.
const hasMain = Boolean(tg?.MainButton);
const haptic = (kind) => {
  try {
    tg?.HapticFeedback?.notificationOccurred?.(kind);
  } catch {}
};

const TYPES = [
  ["scheme", "Схема"],
  ["table", "Таблица"],
  ["cards", "Карточки"],
  ["infographic", "Инфографика"],
  ["presentation", "Презентация"],
  ["test", "Тест"],
  ["all", "Всё"],
];

const state = {
  screen: "home",
  books: [],
  brand: {},
  type: "all",
  query: "фотосинтез, световая фаза",
  grade: "9",
  count: 8,
  skipCache: false,
  ai: { ready: false, name: "", provider: "gigachat", folder: "" },
  testMode: "student",
  bookIds: [],
  pack: null,
  pendingDelete: "",
  tab: "scheme",
  slide: 0,
  busy: false,
  status: "",
};

const $ = (s) => document.querySelector(s);

function highlight(text, marks) {
  const set = new Set((marks || []).map((m) => String(m).toLowerCase()));
  return String(text || "")
    .split(/([A-Za-zА-Яа-яЁё0-9-]+)/)
    .map((part) => (set.has(part.toLowerCase()) ? `<mark>${esc(part)}</mark>` : esc(part)))
    .join("");
}

function pg(page) {
  return /^\d+$/.test(String(page))
    ? `<button type="button" class="page" data-page="${esc(page)}">с. ${esc(page)}</button>`
    : `<span class="page">${esc(page)}</span>`;
}

function qualityLabel(q) {
  if (q >= 0.75) return ["Высокое", "good"];
  if (q >= 0.45) return ["Среднее", "mid"];
  return ["Слабое", "low"];
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function applyTheme() {
  const p = tg?.themeParams;
  if (!p) return;
  const root = document.documentElement;
  if (p.bg_color) root.style.setProperty("--bg", p.bg_color);
  if (p.secondary_bg_color) root.style.setProperty("--paper", p.secondary_bg_color);
  if (p.text_color) root.style.setProperty("--ink", p.text_color);
  if (p.hint_color) root.style.setProperty("--muted", p.hint_color);
  if (p.button_color) root.style.setProperty("--accent", p.button_color);
  if (p.button_text_color) root.style.setProperty("--accent-ink", p.button_text_color);
}

function go(screen) {
  state.screen = screen;
  state.status = "";
  state.pendingDelete = "";
  render();
}

function selectedBooks() {
  return state.bookIds.length ? state.bookIds : state.books.map((b) => b.id);
}

async function loadState() {
  const data = await (await fetch("/api/state")).json();
  state.books = data.books || [];
  state.brand = data.brand || {};
  if (state.brand.font) document.documentElement.style.setProperty("--mat-font", state.brand.font);
  if (!state.bookIds.length) state.bookIds = state.books.map((b) => b.id);
  try {
    const ai = await (await fetch("/api/ai")).json();
    state.ai = {
      ready: Boolean(ai.ready),
      name: ai.name || "",
      provider: ai.provider === "yandex" ? "yandex" : "gigachat",
      folder: ai.folder || "",
    };
  } catch {
    /* сервер без блока нейросети */
  }
}

function recentTopics() {
  try {
    return JSON.parse(localStorage.getItem("recentTopics") || "[]");
  } catch {
    return [];
  }
}

function rememberTopic(q) {
  const list = [q, ...recentTopics().filter((x) => x.toLowerCase() !== String(q).toLowerCase())].slice(0, 5);
  try {
    localStorage.setItem("recentTopics", JSON.stringify(list));
  } catch {
    /* хранилище недоступно */
  }
}

async function generate(skipCache) {
  state.busy = true;
  state.status = "Ищу страницы учебника…";
  render();
  tg?.MainButton?.showProgress?.();
  try {
    const res = await fetch("/api/generate", {
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
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Ошибка");
    state.pack = data;
    state.tab = Object.keys(data.materials || {})[0] || "scheme";
    state.slide = 0;
    state.status = "";
    state.busy = false;
    rememberTopic(state.query);
    haptic("success");
    go("result");
  } catch (e) {
    state.status = e.message;
    state.busy = false;
    haptic("error");
    render();
  } finally {
    tg?.MainButton?.hideProgress?.();
    syncMainButton();
  }
}

async function editPack(instruction) {
  if (!state.pack || !instruction) return;
  state.busy = true;
  render();
  const res = await fetch("/api/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pack: state.pack, instruction }),
  });
  const data = await res.json();
  state.busy = false;
  if (!res.ok) {
    state.status = data.error || "Не удалось поправить";
  } else {
    state.pack = data;
    state.status = "Правка добавлена в схему и презентацию.";
  }
  render();
}

function materialsHtml(pack) {
  const m = pack.materials || {};
  const keys = Object.keys(m);
  let html = "";
  if (keys.length > 1) {
    html += `<div class="tabs">${keys
      .map((k) => `<button type="button" class="chip ${state.tab === k ? "on" : ""}" data-tab="${k}">${label(k)}</button>`)
      .join("")}</div>`;
  }
  const key = m[state.tab] ? state.tab : keys[0];
  html += renderMaterial(key, m[key]);
  return html;
}

function snapshotAsk() {
  if ($("#query")) state.query = $("#query").value;
  if ($("#grade")) state.grade = $("#grade").value;
  const boxes = document.querySelectorAll('input[name="bid"]');
  if (boxes.length) state.bookIds = [...document.querySelectorAll('input[name="bid"]:checked')].map((i) => i.value);
  if ($("#skipCache")) state.skipCache = $("#skipCache").checked;
}

function label(k) {
  return TYPES.find((t) => t[0] === k)?.[1] || k;
}

function renderMaterial(kind, block) {
  if (!block) return `<p class="empty">Нет такого материала.</p>`;
  if (kind === "scheme") {
    return `<article class="card"><div class="mh"><h2>${esc(block.topic)}</h2><span class="badge">Схема</span></div><div class="scheme">${block.nodes
      .map((n) => `<div class="node"><b>${esc(n.title)}</b><p>${esc(n.body)}</p>${pg(n.page)}</div>`)
      .join("")}</div></article>`;
  }
  if (kind === "table") {
    return `<article class="card"><div class="mh"><h2>Таблица</h2><span class="badge">Таблица</span></div><div class="table-wrap"><table><tr>${block.headers
      .map((h) => `<th>${esc(h)}</th>`)
      .join("")}</tr>${block.rowsmap((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table></div></article>`;
  }
  if (kind === "cards") {
    return `<article class="card"><div class="mh"><h2>Карточки</h2><span class="badge">Карточки</span></div><div class="cards">${block.items
      .map((c) => `<div class="flip"><b>${c.n}. ${esc(c.front)}</b><p>${esc(c.back)}</p>${pg(c.page)}</div>`)
      .join("")}</div></article>`;
  }
  if (kind === "infographic") {
    return `<article class="card"><div class="mh"><h2>Инфографика</h2><span class="badge">Шаги</span></div><div class="steps">${block.steps
      .map((s) => `<div class="step"><b>${s.n}. ${esc(s.title)}</b><p>${esc(s.text)}</p>${pg(s.page)}</div>`)
      .join("")}</div></article>`;
  }
  if (kind === "presentation") {
    const slides = block.slides || [];
    const s = slides[state.slide] || slides[0];
    if (!s) return "";
    return `<article class="card"><div class="mh"><h2>Презентация</h2><span class="badge">${state.slide + 1} / ${slides.length}</span></div>
      <div class="slide"><h2>${esc(s.title)}</h2><ul>${(s.bullets || []).map((b) => `<li>${esc(b)}</li>`).join("")}</ul></div>
      <div class="nav"><button type="button" class="btn ghost" id="prevSlide">Назад</button><button type="button" class="btn ghost" id="nextSlide">Дальше</button></div></article>`;
  }
  if (kind === "test") {
    const items = block.items || [];
    const total = items.reduce((s, t) => s + (t.points || 1), 0);
    return `<article class="card" id="tgTest" data-mode="${state.testMode || "student"}"><div class="mh"><h2>Тест</h2><span class="badge" id="tgScore">0 из ${total}</span></div>
      <div class="seg">
        <button type="button" class="${state.testMode === "key" ? "" : "on"}" data-mode="student">Ученик</button>
        <button type="button" class="${state.testMode === "key" ? "on" : ""}" data-mode="key">Ключ учителя</button>
      </div>
      <div class="seg">
        <button type="button" class="btn ghost" data-print="student">Печать без ответов</button>
        <button type="button" class="btn ghost" data-print="key">Печать с ключом</button>
      </div>
      ${block.note ? `<p class="hint">${esc(block.note)}</p>` : ""}
      ${items.map((t, i) => tgQuestion(t, i)).join("")}</article>`;
  }
  return "";
}

const TG_LETTERS = ["А", "Б", "В", "Г", "Д", "Е"];

function tgAnswerText(t) {
  if (t.type === "choice") return `${TG_LETTERS[t.answer]}. ${t.options[t.answer]}`;
  if (t.type === "judge") return t.options[t.answer];
  if (t.type === "multi") return t.answer.map((i) => `${TG_LETTERS[i]}. ${t.options[i]}`).join("; ");
  if (t.type === "order") return t.answer.map((i) => t.options[i]).join(" → ");
  if (t.type === "match") return t.left.map((l, i) => `${l} → ${TG_LETTERS[t.answer[i]]}`).join("; ");
  return t.sample || "";
}

function tgQuestion(t, i) {
  const head = `<p class="qline"><b>${i + 1}.</b> <span class="qtype">${esc(t.kind || "Задание")}</span> ${esc(t.q)}</p>`;
  let body = "";
  if (t.type === "choice" || t.type === "judge") {
    body = `<div class="stack">${t.options
      .map((o, j) => `<button type="button" class="btn ghost opt" data-pick="${i}:${j}">${t.type === "judge" ? "" : `${TG_LETTERS[j]}. `}${esc(o)}</button>`)
      .join("")}</div>`;
  } else if (t.type === "multi") {
    body = `<div class="stack">${t.options
      .map((o, j) => `<button type="button" class="btn ghost opt" data-toggle="${i}:${j}">${TG_LETTERS[j]}. ${esc(o)}</button>`)
      .join("")}</div><button type="button" class="btn wide" data-check="${i}">Проверить</button>`;
  } else if (t.type === "order") {
    body = `<p class="hint">Нажимайте события по порядку: от раннего к позднему.</p><div class="stack">${t.options
      .map((o, j) => `<button type="button" class="btn ghost opt" data-seq="${i}:${j}">${esc(o)}</button>`)
      .join("")}</div><p class="hint" id="seq-${i}"></p><button type="button" class="btn ghost wide" data-seqreset="${i}">Сбросить порядок</button>`;
  } else if (t.type === "match") {
    body = `<div class="stack">${t.left
      .map(
        (l, j) => `<label>${j + 1}. ${esc(l)}<select data-match="${i}:${j}"><option value="">—</option>${t.right
          .map((_, k) => `<option value="${k}">${TG_LETTERS[k]}</option>`)
          .join("")}</select></label>`
      )
      .join("")}</div><ol class="match-list" type="А">${t.right.map((r) => `<li>${esc(r)}</li>`).join("")}</ol><button type="button" class="btn wide" data-check="${i}">Проверить</button>`;
  } else {
    body = `<details><summary>Показать образец, с. ${esc(t.page)}</summary><p>${esc(t.sample || "")}</p>${
      t.rubric?.length ? `<p class="hint">Критерии: ${t.rubric.map((r) => esc(r)).join("; ")}</p>` : ""
    }</details>`;
  }
  const key = `<p class="key"><b>Ответ:</b> ${esc(tgAnswerText(t))}${t.hint ? ` · ${esc(t.hint)}` : ""} ${pg(t.page)}</p>`;
  return `<section class="tq" data-q="${i}" data-type="${t.type}">${head}${body}${key}<p class="fb hint" id="fb-${i}"></p></section>`;
}

function bindTgTest() {
  const root = $("#tgTest");
  if (!root) return;
  const items = state.pack?.materials?.test?.items || [];
  const done = new Map();
  const total = items.reduce((s, t) => s + (t.points || 1), 0);
  const seq = new Map();
  const picked = new Map();

  const finish = (i, ok) => {
    const t = items[i];
    done.set(i, ok);
    const fb = $("#fb-" + i);
    fb.className = `fb ${ok ? "good" : "bad"}`;
    fb.innerHTML = ok
      ? `<b>Верно.</b> ${esc(t.hint || "")}`
      : `<b>Неверно.</b> Правильно: ${esc(tgAnswerText(t))}. ${esc(t.hint || "")}`;
    root.querySelectorAll(`[data-q="${i}"] button, [data-q="${i}"] select`).forEach((b) => (b.disabled = true));
    let got = 0;
    for (const [k, v] of done) if (v) got += items[k].points || 1;
    $("#tgScore").textContent = `${got} из ${total}`;
    haptic(ok ? "success" : "error");
  };

  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.mode) {
      state.testMode = b.dataset.mode;
      root.dataset.mode = b.dataset.mode;
      root.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("on", x === b));
      return;
    }
    if (b.dataset.print) {
      state.testMode = b.dataset.print;
      root.dataset.mode = b.dataset.print;
      document.body.dataset.print = b.dataset.print;
      window.print();
      return;
    }
    if (b.dataset.pick) {
      const [i, j] = b.dataset.pick.split(":").map(Number);
      b.classList.add(j === items[i].answer ? "right" : "wrong");
      finish(i, j === items[i].answer);
    } else if (b.dataset.toggle) {
      const [i, j] = b.dataset.toggle.split(":").map(Number);
      const set = picked.get(i) || new Set();
      if (set.has(j)) set.delete(j);
      else set.add(j);
      picked.set(i, set);
      b.classList.toggle("on", set.has(j));
    } else if (b.dataset.seq) {
      const [i, j] = b.dataset.seq.split(":").map(Number);
      const list = seq.get(i) || [];
      if (list.includes(j)) return;
      list.push(j);
      seq.set(i, list);
      b.classList.add("on");
      b.textContent = `${list.length}. ${items[i].options[j]}`;
      $("#seq-" + i).textContent = "";
      if (list.length === items[i].options.length) finish(i, list.every((v, k) => v === items[i].answer[k]));
    } else if (b.dataset.seqreset) {
      const i = Number(b.dataset.seqreset);
      seq.set(i, []);
      root.querySelectorAll(`[data-seq^="${i}:"]`).forEach((x) => {
        x.classList.remove("on");
        x.textContent = items[i].options[Number(x.dataset.seq.split(":")[1])];
      });
    } else if (b.dataset.check) {
      const i = Number(b.dataset.check);
      const t = items[i];
      if (t.type === "multi") {
        const set = [...(picked.get(i) || [])].sort((a, c) => a - c);
        if (!set.length) {
          $("#fb-" + i).textContent = "Сначала выберите ответы.";
          return;
        }
        finish(i, set.length === t.answer.length && set.every((v, k) => v === t.answer[k]));
      } else if (t.type === "match") {
        const vals = [...root.querySelectorAll(`select[data-match^="${i}:"]`)].map((s) => s.value);
        if (vals.some((v) => v === "")) {
          $("#fb-" + i).textContent = "Выберите букву для каждой строки.";
          return;
        }
        finish(i, vals.every((v, k) => Number(v) === t.answer[k]));
      }
    }
  });
}

function tabsFor(pack) {
  const m = pack.materials || {};
  const names = { scheme: "Схема", table: "Таблица", cards: "Карточки", infographic: "Инфографика", presentation: "Презентация", test: "Тест" };
  const tabs = [{ id: "sources", label: "Источники", count: (pack.sources || []).length }];
  for (const id of Object.keys(names)) {
    if (m[id]) tabs.push({ id, label: names[id], count: id === "test" ? (m[id].items || []).length : undefined });
  }
  if (pack.factCheck) tabs.push({ id: "facts", label: "Проверка", warn: pack.factCheck.mismatches });
  if (pack.compare && Object.keys(pack.compare).length > 1) tabs.push({ id: "compare", label: "Два УМК" });
  return tabs;
}

function sourcesHtml(pack) {
  const sources = pack.sources || [];
  if (!sources.length) return `<p class="empty">Страницы не найдены.</p>`;
  return `<p class="hint">Факты взяты только отсюда. Совпавшие слова подсвечены.</p>${sources
    .map((s) => {
      const pct = Math.round(Math.min(1, Math.max(0.04, Number(s.score) || 0)) * 100);
      const extra = (s.passages || []).filter((x) => !String(s.excerpt || "").includes(String(x).slice(0, 40)));
      return `<article class="src" data-src-page="${esc(s.page)}"><div class="mh"><b>${esc(s.section || s.bookTitle)}</b>${pg(s.page)}</div>
        <small>${s.section ? `${esc(s.bookTitle)} · ` : ""}${esc(s.publisher || "")}</small>
        <div class="bar"><i style="width:${pct}%"></i></div><span class="hint">${pct}%</span>
        <p>«${highlight(s.excerpt, s.marks)}»</p>
        ${extra.length ? `<details><summary>Ещё со страницы</summary>${extra.map((x) => `<p>«${highlight(x, s.marks)}»</p>`).join("")}</details>` : ""}
      </article>`;
    })
    .join("")}`;
}

function factsHtml(pack) {
  const facts = pack.factCheck?.items || [];
  const bad = facts.filter((f) => f.status === "mismatch");
  if (!facts.length) return `<p class="hint">В этом материале нет чисел для сверки.</p>`;
  const head = bad.length
    ? `<p class="fact mismatch">Расхождений: ${bad.length}. Проверьте вручную.</p>`
    : `<div class="fact ok">Цифры и даты есть в тексте учебника.</div>`;
  return head + facts
    .map((f) => `<div class="fact ${f.status === "mismatch" ? "mismatch" : "ok"}"><b>${esc(f.claim)}</b> — ${esc(f.hint)}</div>`)
    .join("");
}

function compareHtml(pack) {
  return Object.entries(pack.compare || {})
    .map(
      ([pub, items]) =>
        `<div class="src"><b>${esc(pub)}</b>${items
          .map((i) => `<p>${pg(i.page)} ${esc(i.excerpt || i.title || "")}</p>`)
          .join("")}</div>`
    )
    .join("");
}

const EXAMPLES = [
  ["фотосинтез, световая фаза", "9", "Биология", "Световая фаза"],
  ["Отечественная война 1812 года", "9", "История", "Война 1812 года"],
];

function homeHtml() {
  const name = tg?.initDataUnsafe?.user?.first_name || tg?.initDataUnsafe?.user?.name;
  return `
    <section class="hero">
      <div class="kicker">Для учителя</div>
      <h1>${name ? esc(name) + ", что нужно к уроку?" : "Что нужно к уроку?"}</h1>
      <p>Схема, таблица, карточки и тест только по страницам загруженного учебника.</p>
    </section>
    <p class="section">Готовые темы</p>
    <div class="examples">${EXAMPLES.map(
      ([query, grade, subject, title]) =>
        `<button type="button" class="ex" data-ex="${esc(query)}" data-grade="${grade}"><small>${esc(subject)} · ${grade} класс</small><b>${esc(title)}</b><span>Собрать всё</span></button>`
    ).join("")}</div>
    <div class="stack">
      <button type="button" class="btn wide" id="toAsk">Своя тема</button>
      <button type="button" class="btn ghost wide" id="toBooks">Учебники · ${state.books.length}</button>
      <button type="button" class="btn ghost wide" id="toAi">Нейросеть · ${state.ai?.ready ? esc(state.ai.name) : "выключена"}</button>
    </div>
    ${
      recentTopics().length
        ? `<p class="section">Недавние</p><div class="chips">${recentTopics()
            .map((t) => `<button type="button" class="chip" data-ex="${esc(t)}" data-grade="${esc(state.grade)}">${esc(t)}</button>`)
            .join("")}</div>`
        : ""
    }
    <p class="err">${state.busy ? "" : esc(state.status)}</p>
    <p class="hint">Демо-учебники уже в индексе. Повтор того же запроса открывается сразу.</p>`;
}

function booksHtml() {
  return `
    <h2>Учебники</h2>
    <p class="hint">Файл индексируется на сервере. В материал попадают только найденные страницы.</p>
    <form id="up" class="stack card">
      <label class="file">PDF, EPUB, DjVu или TXT<input type="file" name="file" accept=".pdf,.epub,.djvu,.djv,.txt" required /></label>
      <div class="row2">
        <label>Название<input name="title" placeholder="Биология. 9 класс" /></label>
        <label>Класс<input name="grade" placeholder="9" /></label>
      </div>
      <div class="row2">
        <label>Издательство<input name="publisher" placeholder="Просвещение" /></label>
        <label>Предмет<input name="subject" placeholder="Биология" /></label>
      </div>
      <button class="btn" type="submit">Проиндексировать</button>
      <p class="hint" id="upStatus">${esc(state.status)}</p>
    </form>
    <div class="books">${
      state.books.length
        ? state.books
            .map(
              (b) => `<div class="book"><div><b>${esc(b.title)}</b><br /><small>${esc(b.publisher)} · ${esc(b.subject)} · ${b.pages} стр.</small></div>
          <button type="button" class="btn ghost del" data-del="${b.id}" data-title="${esc(b.title)}">${state.pendingDelete === b.id ? "Да, удалить" : "Удалить"}</button></div>`
            )
            .join("")
        : `<p class="hint">Пока нет учебников.</p>`
    }</div>
    <details class="fold">
    <summary>Оформление школы</summary>
    <form id="brand" class="stack card">
      <label>Название<input name="school" value="${esc(state.brand.school || "")}" /></label>
      <div class="row2">
        <label>Цвет<input type="color" name="primary" value="${esc(toHex(state.brand.primary))}" /></label>
        <label>Акцент<input type="color" name="accent" value="${esc(toHex(state.brand.accent))}" /></label>
      </div>
      <label>Шрифт материалов
        <select name="font">
          ${["Georgia", "Times New Roman", "PT Serif", "Arial"].map((f) => `<option ${state.brand.font === f ? "selected" : ""}>${f}</option>`).join("")}
        </select>
      </label>
      <button class="btn ghost" type="submit">Сохранить для всех материалов</button>
    </form>
    </details>`;
}

function toHex(c) {
  return c && String(c).startsWith("#") && c.length === 7 ? c : "#6d2dd6";
}

function askHtml() {
  const grades = ["7", "8", "9", "10", "11"];
  return `
    <h2>Своя тема</h2>
    <p class="hint">Выберите, что собрать, и напишите тему так, как сказали бы ученику.</p>
    <div class="chips scroll" id="types">${TYPES.map(
      ([id, name]) => `<button type="button" class="chip ${state.type === id ? "on" : ""}" data-type="${id}">${name}</button>`
    ).join("")}</div>
    <form id="ask" class="stack">
      <label>Тема<textarea id="query" rows="2" required placeholder="Световая фаза фотосинтеза">${esc(state.query)}</textarea></label>
      <div>
        <span class="section">Класс</span>
        <div class="grade-row">
          <div class="chips" id="grades">${grades
            .map((g) => `<button type="button" class="chip ${state.grade === g ? "on" : ""}" data-grade="${g}">${g}</button>`)
            .join("")}</div>
          <label>Свой<input id="grade" value="${esc(state.grade)}" inputmode="numeric" /></label>
        </div>
      </div>
      <div>
        <span class="section">Из каких учебников</span>
        <div class="stack">${
          state.books.length
            ? state.books
                .map(
                  (b) => `<label class="pick"><input type="checkbox" name="bid" value="${b.id}" ${selectedBooks().includes(b.id) ? "checked" : ""} /><span><b>${esc(b.title)}</b><small>${esc(b.publisher)} · ${esc(b.subject || "")}</small></span></label>`
                )
                .join("")
            : `<p class="hint">Сначала загрузите учебник.</p>`
        }</div>
      </div>
      <div>
        <span class="section">Заданий в тесте</span>
        <div class="chips" id="counts">${[5, 8, 10, 12]
          .map((n) => `<button type="button" class="chip ${Number(state.count) === n ? "on" : ""}" data-count="${n}">${n}</button>`)
          .join("")}</div>
      </div>
      <label class="pick"><input type="checkbox" id="skipCache" ${state.skipCache ? "checked" : ""} /><span><b>Собрать заново</b><small>Не открывать прошлый результат из кэша</small></span></label>
      <p class="err">${state.busy ? "" : esc(state.status)}</p>
    </form>`;
}

function aiHtml() {
  const ai = state.ai || {};
  return `
    <h2>Нейросеть</h2>
    <p class="hint">${
      ai.ready
        ? `${esc(ai.name)} подключена: уточняет запрос и собирает тест по найденным страницам.`
        : "Ключ хранится на сервере и не попадает в чат. Без него тест строится из текста учебника."
    }</p>
    <form id="ai" class="stack card">
      <label>Модель
        <select name="provider">
          <option value="gigachat" ${ai.provider !== "yandex" ? "selected" : ""}>GigaChat</option>
          <option value="yandex" ${ai.provider === "yandex" ? "selected" : ""}>Алиса (YandexGPT)</option>
        </select>
      </label>
      <label>Ключ авторизации<input name="key" type="password" autocomplete="off" placeholder="Кабинет GigaChat или Yandex Cloud" /></label>
      <label>Каталог Yandex Cloud<input name="folder" value="${esc(ai.folder || "")}" placeholder="Только для Алисы" /></label>
      <button class="btn" type="submit">Подключить</button>
      <p class="hint">${esc(state.status)}</p>
    </form>`;
}

function resultPanel(pack) {
  if (state.tab === "sources") return sourcesHtml(pack);
  if (state.tab === "facts") return factsHtml(pack);
  if (state.tab === "compare") return compareHtml(pack);
  const block = pack.materials?.[state.tab];
  return renderMaterial(state.tab, block);
}

function resultHtml() {
  const pack = state.pack;
  if (!pack) return `<p class="empty">Материала пока нет.</p>`;
  const tabs = tabsFor(pack);
  if (!tabs.some((t) => t.id === state.tab)) state.tab = tabs.find((t) => t.id !== "sources")?.id || "sources";
  const [qText, qClass] = qualityLabel(pack.search?.quality ?? 1);
  const notes = [];
  for (const fx of pack.search?.fixes || []) notes.push(`«${esc(fx.raw)}» искали как «${esc(fx.suggestion)}»`);
  if ((pack.search?.unknown || []).length) notes.push(`Нет в учебниках: ${pack.search.unknown.map((x) => esc(x)).join(", ")}`);
  if ((pack.search?.quality ?? 1) < 0.45) notes.push("Тема найдена слабо, откройте источники");
  if (pack.modelNote) notes.push(esc(pack.modelNote));
  if (pack.lookups?.length) notes.push(`Модель дополнительно искала: ${pack.lookups.map((q) => esc(q)).join("; ")}`);
  const pptx = pack.materials?.presentation?.slides?.length
    ? `<button type="button" class="btn wide" id="exportPptx">Скачать презентацию (PPTX)</button>`
    : "";
  return `
    <div class="result-head mat">
      <h2>${esc(pack.topic || state.query)}</h2>
      <div class="chips">
        <span class="chip-info">Страниц: ${(pack.sources || []).length}</span>
        <span class="chip-info ${qClass}">Совпадение: ${qText}</span>
        <span class="chip-info">${pack.model ? esc(pack.model) : "Без нейросети"}</span>
        ${pack.cached ? `<span class="chip-info">Из кэша</span>` : ""}
      </div>
    </div>
    ${notes.length ? `<p class="fact mismatch">${notes.join(". ")}</p>` : ""}
    <div class="tabs">${tabs
      .map(
        (t) =>
          `<button type="button" class="chip ${state.tab === t.id ? "on" : ""}" data-tab="${t.id}">${t.label}${
            t.count != null ? ` ${t.count}` : ""
          }${t.warn ? ` · ${t.warn}` : ""}</button>`
      )
      .join("")}</div>
    <div class="mat">${resultPanel(pack)}</div>
    ${pptx}
    <details class="fold">
      <summary>Поправить готовое</summary>
      <p class="hint">Учебник заново не читается: блок добавится в схему и презентацию.</p>
      <form id="edit" class="stack">
        <input id="editText" placeholder="Добавь блок про темновую фазу" />
        <button class="btn ghost" type="submit">Поправить</button>
        <p class="hint">${esc(state.status)}</p>
      </form>
    </details>`;
}

function render() {
  const view = $("#view");
  const back = $("#back");
  // В MAX есть системная кнопка «Назад», своя нужна только в обычном браузере.
  back.hidden = state.screen === "home" || Boolean(inMessenger && tg?.BackButton);
  if (state.screen === "home") view.innerHTML = homeHtml();
  if (state.screen === "books") view.innerHTML = booksHtml();
  if (state.screen === "ask") view.innerHTML = askHtml();
  if (state.screen === "ai") view.innerHTML = aiHtml();
  if (state.screen === "result") view.innerHTML = resultHtml();
  if (state.focusPage) {
    const card = view.querySelector(`[data-src-page="${CSS.escape(String(state.focusPage))}"]`);
    state.focusPage = "";
    card?.scrollIntoView({ block: "start" });
  }
  if (state.busy) {
    view.insertAdjacentHTML(
      "afterbegin",
      `<div class="busy" role="status"><i></i><span>${esc(state.status || "Собираю материал…")}</span></div>`
    );
  }
  const dock = $("#dock");
  const showDock = !(inMessenger && hasMain) && state.screen === "ask";
  dock.hidden = !showDock;
  dock.innerHTML = showDock
    ? `<button type="button" id="dockGo" ${state.busy ? "disabled" : ""}>${state.busy ? "Ищу страницы…" : "Собрать материал"}</button>`
    : "";
  bind();
  syncMainButton();
  const who = $("#who");
  const titles = {
    home: state.ai?.ready ? state.ai.name : inMessenger ? messengerName : "строго по учебнику",
    ask: "тема и класс",
    books: "библиотека",
    ai: state.ai?.ready ? state.ai.name : "без нейросети",
    result: "готовый материал",
  };
  if (who) who.textContent = titles[state.screen] || titles.home;
  document.body.dataset.screen = state.screen;
}

function bind() {
  $("#back").onclick = () => {
    if (state.screen === "result") go("ask");
    else go("home");
  };
  document.querySelectorAll("[data-ex]").forEach((b) => {
    b.onclick = () => {
      state.query = b.dataset.ex;
      state.grade = b.dataset.grade || state.grade || "9";
      state.type = "all";
      generate(false);
    };
  });
  $("#toAsk")?.addEventListener("click", () => go("ask"));
  $("#toBooks")?.addEventListener("click", () => go("books"));
  $("#toAi")?.addEventListener("click", () => go("ai"));
  $("#dockGo")?.addEventListener("click", () => {
    if (!state.busy) readAskAndGenerate();
  });
  $("#types")?.addEventListener("click", (e) => {
    const id = e.target.closest("[data-type]")?.dataset.type;
    if (!id) return;
    snapshotAsk();
    state.type = id;
    render();
  });
  $("#grades")?.addEventListener("click", (e) => {
    const grade = e.target.closest("[data-grade]")?.dataset.grade;
    if (!grade) return;
    snapshotAsk();
    state.grade = grade;
    render();
  });
  $("#counts")?.addEventListener("click", (e) => {
    const count = e.target.closest("[data-count]")?.dataset.count;
    if (!count) return;
    snapshotAsk();
    state.count = Number(count);
    render();
  });
  $("#ai")?.addEventListener("submit", saveAi);
  document.querySelectorAll("[data-page]").forEach((b) => {
    b.onclick = () => {
      state.focusPage = b.dataset.page;
      state.tab = "sources";
      render();
    };
  });
  document.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = () => removeBook(b.dataset.del, b.dataset.title);
  });
  $("#up")?.addEventListener("submit", uploadBook);
  $("#brand")?.addEventListener("submit", saveBrand);
  $("#ask")?.addEventListener("submit", (e) => {
    e.preventDefault();
    readAskAndGenerate();
  });
  $("#edit")?.addEventListener("submit", (e) => {
    e.preventDefault();
    editPack($("#editText").value.trim());
  });
  $("#prevSlide")?.addEventListener("click", () => {
    const n = state.pack?.materials?.presentation?.slides?.length || 1;
    state.slide = (state.slide - 1 + n) % n;
    render();
  });
  $("#nextSlide")?.addEventListener("click", () => {
    const n = state.pack?.materials?.presentation?.slides?.length || 1;
    state.slide = (state.slide + 1) % n;
    render();
  });
  $("#exportPptx")?.addEventListener("click", exportPptx);
  document.querySelectorAll("[data-tab]").forEach((b) => {
    b.onclick = () => {
      state.tab = b.dataset.tab;
      state.slide = 0;
      render();
    };
  });
  bindTgTest();
}

async function exportPptx() {
  const button = $("#exportPptx");
  const slides = state.pack?.materials?.presentation?.slides || [];
  if (!slides.length) return;
  if (button) button.disabled = true;
  try {
    const res = await fetch("/api/export/pptx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.pack),
    });
    if (!res.ok) throw new Error("Не удалось собрать файл");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "prezentaciya.pptx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    state.status = e.message || "Не удалось скачать презентацию";
    render();
  } finally {
    if (button) button.disabled = false;
  }
}

function readAskAndGenerate() {
  state.query = $("#query")?.value || state.query;
  state.grade = $("#grade")?.value || "";
  state.bookIds = [...document.querySelectorAll('input[name="bid"]:checked')].map((i) => i.value);
  state.skipCache = Boolean($("#skipCache")?.checked);
  generate();
}

async function removeBook(id, title) {
  if (!id) return;
  if (state.pendingDelete === id) {
    const res = await fetch("/api/books/" + id, { method: "DELETE" });
    state.pendingDelete = "";
    if (!res.ok) {
      state.status = "Не удалось удалить учебник.";
      render();
      return;
    }
    state.bookIds = state.bookIds.filter((x) => x !== id);
    await loadState();
    state.status = "Учебник удалён.";
    render();
    return;
  }
  state.pendingDelete = id;
  state.status = `Удалить «${title || "учебник"}»? Нажмите «Удалить» ещё раз.`;
  render();
}

async function uploadBook(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  state.status = "Индексация…";
  render();
  const res = await fetch("/api/books", { method: "POST", body: fd });
  const data = await res.json();
  state.status = data.error ? data.error : `Готово: ${data.indexed} фрагментов.`;
  if (!data.error) await loadState();
  render();
}

async function saveBrand(e) {
  e.preventDefault();
  const f = e.target;
  const body = { school: f.school.value, primary: f.primary.value, accent: f.accent.value, font: f.font.value };
  document.documentElement.style.setProperty("--mat-font", body.font || "Georgia");
  state.brand = await (
    await fetch("/api/brand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  ).json();
  state.status = "Шаблон сохранён.";
  render();
}

async function saveAi(e) {
  e.preventDefault();
  const f = e.target;
  const provider = f.provider.value;
  const key = f.key.value;
  const folder = f.folder.value;
  state.status = "Проверяю ключ…";
  render();
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, key, folder }),
  });
  const data = await res.json().catch(() => ({}));
  state.ai = {
    ready: Boolean(data.ok && data.ready),
    name: data.name || state.ai.name,
    provider,
    folder: folder || data.folder || "",
  };
  state.status = data.ok
    ? `${data.name} подключена. Тесты собирает модель по страницам учебника.`
    : data.error || "Не удалось подключить";
  render();
}

function syncMainButton() {
  if (!tg) return;
  try {
    if (hasMain) {
      const btn = tg.MainButton;
      btn.setParams?.({ color: "#6d2dd6", text_color: "#ffffff" });
      if (state.screen === "home") {
        btn.setText("Собрать схему по демо");
        btn.show();
      } else if (state.screen === "ask") {
        btn.setText(state.busy ? "Собираю…" : "Собрать материал");
        btn.show();
      } else if (state.screen === "result") {
        btn.hide();
      } else {
        btn.setText("К запросу");
        btn.show();
      }
    }
    if (tg.BackButton) {
      if (state.screen === "home") tg.BackButton.hide();
      else tg.BackButton.show();
    }
  } catch {}
}

function onMain() {
  if (state.busy) return;
  if (state.screen === "home") {
    state.query = "фотосинтез, световая фаза";
    state.grade = "9";
    state.type = "scheme";
    generate(false);
  } else if (state.screen === "ask") readAskAndGenerate();
  else if (state.screen === "books") go("ask");
  else go("ask");
}

if (tg) {
  try {
    applyTheme();
    tg.ready?.();
    tg.expand?.();
    tg.BackButton?.onClick?.(() => {
      if (state.screen === "result") go("ask");
      else go("home");
    });
    if (hasMain) tg.MainButton.onClick(onMain);
    const start = tg.initDataUnsafe?.start_param;
    if (start) state.query = decodeURIComponent(start).replace(/_/g, " ");
  } catch (e) {
    console.warn("Мост мессенджера:", e);
  }
}

loadState()
  .then(render)
  .catch((e) => {
    $("#view").innerHTML = `<p class="err">Сервер не отвечает. Запустите npm start. ${esc(e.message)}</p>`;
  });
