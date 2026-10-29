const tg = window.Telegram?.WebApp;
const inTelegram = Boolean(tg?.initData);

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
  type: "scheme",
  query: "фотосинтез, световая фаза",
  grade: "9",
  bookIds: [],
  pack: null,
  pendingDelete: "",
  tab: "scheme",
  slide: 0,
  busy: false,
  status: "",
};

const $ = (s) => document.querySelector(s);

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
  if (!state.bookIds.length) state.bookIds = state.books.map((b) => b.id);
}

async function generate(skipCache) {
  state.busy = true;
  state.status = "Ищу страницы учебника…";
  render();
  tg?.MainButton.showProgress();
  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: state.query,
        type: state.type,
        grade: state.grade,
        bookIds: selectedBooks(),
        skipCache: Boolean(skipCache),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Ошибка");
    state.pack = data;
    state.tab = Object.keys(data.materials || {})[0] || "scheme";
    state.slide = 0;
    state.status = "";
    tg?.HapticFeedback?.notificationOccurred("success");
    go("result");
  } catch (e) {
    state.status = e.message;
    tg?.HapticFeedback?.notificationOccurred("error");
    render();
  } finally {
    state.busy = false;
    tg?.MainButton.hideProgress();
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

function label(k) {
  return TYPES.find((t) => t[0] === k)?.[1] || k;
}

function renderMaterial(kind, block) {
  if (!block) return `<p class="empty">Нет такого материала.</p>`;
  if (kind === "scheme") {
    return `<article class="card"><div class="mh"><h2>${esc(block.topic)}</h2><span class="badge">Схема</span></div><div class="scheme">${block.nodes
      .map((n) => `<div class="node"><b>${esc(n.title)}</b><p>${esc(n.body)}</p><span class="page">с. ${esc(n.page)}</span></div>`)
      .join("")}</div></article>`;
  }
  if (kind === "table") {
    return `<article class="card"><div class="mh"><h2>Таблица</h2><span class="badge">Таблица</span></div><table><tr>${block.headers
      .map((h) => `<th>${esc(h)}</th>`)
      .join("")}</tr>${block.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table></article>`;
  }
  if (kind === "cards") {
    return `<article class="card"><div class="mh"><h2>Карточки</h2><span class="badge">Карточки</span></div><div class="cards">${block.items
      .map((c) => `<div class="flip"><b>${c.n}. ${esc(c.front)}</b><p>${esc(c.back)}</p><span class="page">с. ${esc(c.page)}</span></div>`)
      .join("")}</div></article>`;
  }
  if (kind === "infographic") {
    return `<article class="card"><div class="mh"><h2>Инфографика</h2><span class="badge">Шаги</span></div><div class="steps">${block.steps
      .map((s) => `<div class="step"><b>${s.n}. ${esc(s.title)}</b><p>${esc(s.text)}</p><span class="page">с. ${esc(s.page)}</span></div>`)
      .join("")}</div></article>`;
  }
  if (kind === "presentation") {
    const slides = block.slides || [];
    const s = slides[state.slide] || slides[0];
    if (!s) return "";
    return `<article class="card"><div class="mh"><h2>Презентация</h2><span class="badge">${state.slide + 1} / ${slides.length}</span></div>
      <div class="slide"><h2>${esc(s.title)}</h2><ul>${(s.bullets || []).map((b) => `<li>${esc(b)}</li>`).join("")}</ul></div>
      <div class="nav"><button type="button" class="btn ghost" id="prevSlide">Назад</button><button type="button" class="btn ghost" id="nextSlide">Дальше</button></div>
      <button type="button" class="btn wide" id="exportPptx">Скачать презентацию (PPTX)</button></article>`;
  }
  if (kind === "test") {
    const letters = ["А", "Б", "В", "Г", "Д"];
    return `<article class="card"><div class="mh"><h2>Тест</h2><span class="badge">По учебнику</span></div>${(block.items || [])
      .map((t, i) => {
        if (t.type === "open" || !t.options?.length) {
          return `<p><b>${i + 1}.</b> <span class="qtype">Краткий ответ</span> ${esc(t.q)}</p><details><summary>Образец, с. ${esc(t.page)}</summary><p>${esc(t.sample || "")}</p></details>`;
        }
        const kindLabel = t.type === "judge" ? "Верно / неверно" : "Выбор ответа";
        return `<p><b>${i + 1}.</b> <span class="qtype">${kindLabel}</span> ${esc(t.q)}</p><div class="stack">${t.options
          .map((o, j) => `<button type="button" class="btn ghost" data-answer="${i}:${j}:${t.answer}:${t.page}">${letters[j]}. ${esc(o)}</button>`)
          .join("")}</div><p class="hint" id="ans-${i}"></p>`;
      })
      .join("")}</article>`;
  }
  return "";
}

function sourcesHtml(pack) {
  const sources = pack.sources || [];
  let html = `<h2>Откуда взято</h2>`;
  for (const s of sources.slice(0, 6)) {
    html += `<div class="src"><b>${esc(s.bookTitle)}</b> · ${esc(s.publisher)} · с. ${esc(s.page)}<br />«${esc(s.excerpt)}»</div>`;
  }
  const pubs = Object.entries(pack.compare || {});
  if (pubs.length > 1) {
    html += `<h2>Два УМК</h2>`;
    for (const [pub, items] of pubs) {
      html += `<div class="src"><b>${esc(pub)}</b>${items
        .slice(0, 2)
        .map((i) => `<p>с. ${esc(i.page)}: ${esc(i.excerpt)}</p>`)
        .join("")}</div>`;
    }
  }
  const facts = pack.factCheck?.items || [];
  const bad = facts.filter((f) => f.status === "mismatch");
  html += `<h2>Проверка цифр</h2>`;
  if (!facts.length) html += `<p class="hint">В этом материале нет чисел для сверки.</p>`;
  else if (!bad.length) html += `<div class="fact ok">Цифры и даты есть в тексте учебника.</div>`;
  else {
    for (const f of bad.slice(0, 4)) {
      html += `<div class="fact mismatch"><b>${esc(f.claim)}</b> — ${esc(f.hint)}</div>`;
    }
  }
  return html;
}

function homeHtml() {
  const name = tg?.initDataUnsafe?.user?.first_name;
  return `
    <section class="hero">
      <div class="kicker">Мини-приложение для учителя</div>
      <h1>Наглядность+</h1>
      <p>${name ? esc(name) + ", м" : "М"}атериалы строго по страницам учебника. Сервис не выдумывает факты.</p>
    </section>
    <div class="steps">
      <div class="step-card"><b>1</b>Загрузка PDF, DjVu, EPUB</div>
      <div class="step-card"><b>2</b>Тема и класс</div>
      <div class="step-card"><b>3</b>Схема со ссылкой на страницу</div>
    </div>
    <div class="stack">
      <button type="button" class="btn wide" id="demo">Собрать схему: фотосинтез, 9 класс</button>
      <button type="button" class="btn ghost wide" id="toAsk">Своя тема</button>
      <button type="button" class="btn ghost wide" id="toBooks">Учебники · ${state.books.length}</button>
    </div>
    <p class="err">${esc(state.status)}</p>
    <p class="hint">Демо-учебники «Просвещение» и «Дрофа» уже в индексе. Повторный запрос открывается из кэша.</p>`;
}

function booksHtml() {
  return `
    <h2>Учебники</h2>
    <form id="up" class="stack card">
      <label>PDF, EPUB, DjVu или TXT<input type="file" name="file" accept=".pdf,.epub,.djvu,.djv,.txt" required /></label>
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
    <h2>Шаблон школы</h2>
    <form id="brand" class="stack card">
      <label>Название<input name="school" value="${esc(state.brand.school || "")}" /></label>
      <div class="row2">
        <label>Цвет<input type="color" name="primary" value="${esc(toHex(state.brand.primary))}" /></label>
        <label>Акцент<input type="color" name="accent" value="${esc(toHex(state.brand.accent))}" /></label>
      </div>
      <button class="btn ghost" type="submit">Сохранить для всех материалов</button>
    </form>`;
}

function toHex(c) {
  return c && String(c).startsWith("#") && c.length === 7 ? c : "#6d2dd6";
}

function askHtml() {
  return `
    <h2>Запрос</h2>
    <p class="hint">Например: «сделай схему по световой фазе фотосинтеза для 9 класса».</p>
    <div class="chips" id="types">${TYPES.map(
      ([id, name]) => `<button type="button" class="chip ${state.type === id ? "on" : ""}" data-type="${id}">${name}</button>`
    ).join("")}</div>
    <form id="ask" class="stack" style="margin-top:12px">
      <label>Тема<input id="query" value="${esc(state.query)}" required /></label>
      <label>Класс<input id="grade" value="${esc(state.grade)}" /></label>
      <div class="stack">${state.books
        .map(
          (b) => `<label class="pick"><input type="checkbox" name="bid" value="${b.id}" ${selectedBooks().includes(b.id) ? "checked" : ""} /> ${esc(b.title)} (${esc(b.publisher)})</label>`
        )
        .join("")}</div>
      <p class="err">${esc(state.status)}</p>
    </form>`;
}

function resultHtml() {
  const pack = state.pack;
  if (!pack) return `<p class="empty">Материала пока нет.</p>`;
  const cached = pack.cached ? "Из кэша · " : "";
  return `
    <p class="hint">${cached}${pack.model ? `Тест собрала ${esc(pack.model)} · ` : "Собрано из цитат учебника · "}${esc(pack.brand?.school || "")}</p>
    ${materialsHtml(pack)}
    ${sourcesHtml(pack)}
    <h2>Правка на лету</h2>
    <form id="edit" class="stack">
      <input id="editText" placeholder="Добавь блок про темновую фазу" />
      <button class="btn ghost" type="submit">Поправить без новой генерации</button>
      <p class="hint">${esc(state.status)}</p>
    </form>`;
}

function render() {
  const view = $("#view");
  const back = $("#back");
  back.hidden = state.screen === "home";
  if (state.screen === "home") view.innerHTML = homeHtml();
  if (state.screen === "books") view.innerHTML = booksHtml();
  if (state.screen === "ask") view.innerHTML = askHtml();
  if (state.screen === "result") view.innerHTML = resultHtml();
  const dock = $("#dock");
  const showDock = !inTelegram && (state.screen === "ask" || state.screen === "home");
  dock.hidden = !showDock;
  dock.innerHTML = showDock
    ? `<button type="button" id="dockGo">${state.screen === "home" ? "Собрать схему по демо" : "Собрать материал"}</button>`
    : "";
  bind();
  syncMainButton();
  const who = $("#who");
  if (who) who.textContent = inTelegram ? "в Telegram" : "строго по учебнику";
}

function bind() {
  $("#back").onclick = () => {
    if (state.screen === "result") go("ask");
    else go("home");
  };
  $("#demo")?.addEventListener("click", () => {
    state.query = "фотосинтез, световая фаза";
    state.grade = "9";
    state.type = "scheme";
    generate(false);
  });
  $("#toAsk")?.addEventListener("click", () => go("ask"));
  $("#toBooks")?.addEventListener("click", () => go("books"));
  $("#dockGo")?.addEventListener("click", () => {
    if (state.screen === "home") {
      state.query = "фотосинтез, световая фаза";
      state.type = "scheme";
      generate(false);
    } else readAskAndGenerate();
  });
  $("#types")?.addEventListener("click", (e) => {
    const id = e.target.dataset.type;
    if (!id) return;
    state.type = id;
    render();
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
  document.querySelectorAll("[data-answer]").forEach((b) => {
    b.onclick = () => {
      const [i, j, answer, page] = b.dataset.answer.split(":");
      const box = document.getElementById("ans-" + i);
      const ok = String(j) === String(answer);
      if (box) box.textContent = ok ? `Верно. Сверьте формулировку на с. ${page}` : `Неверно. Откройте учебник, с. ${page}`;
      tg?.HapticFeedback?.selectionChanged();
    };
  });
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
  generate(false);
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
  const body = { school: f.school.value, primary: f.primary.value, accent: f.accent.value };
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

function syncMainButton() {
  if (!tg) return;
  const btn = tg.MainButton;
  btn.setParams({ color: "#6d2dd6", text_color: "#ffffff" });
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
  if (state.screen === "home") tg.BackButton.hide();
  else tg.BackButton.show();
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
  applyTheme();
  tg.ready();
  tg.expand();
  tg.BackButton.onClick(() => {
    if (state.screen === "result") go("ask");
    else go("home");
  });
  tg.MainButton.onClick(onMain);
  const start = tg.initDataUnsafe?.start_param;
  if (start) state.query = decodeURIComponent(start).replace(/_/g, " ");
}

loadState()
  .then(render)
  .catch((e) => {
    $("#view").innerHTML = `<p class="err">Сервер не отвечает. Запустите npm start. ${esc(e.message)}</p>`;
  });
