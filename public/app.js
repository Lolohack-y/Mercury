let lastPack = null;
let lastBooks = [];
let activeTab = "";
let brand = { school: "Школа", primary: "#1e5a46", accent: "#d4a017", font: "Georgia" };

const $ = (s) => document.querySelector(s);
const LETTERS = ["А", "Б", "В", "Г", "Д", "Е"];
const DEMO_TOPICS = ["Фотосинтез: световая фаза", "Отечественная война 1812 года", "Хлорофилл"];

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function applyBrand(b) {
  brand = b;
  document.documentElement.style.setProperty("--brand", b.primary || "#5b3cc4");
  document.documentElement.style.setProperty("--brand-accent", b.accent || "#e8d6a3");
  const workspace = $("#workspace");
  if (workspace) workspace.style.fontFamily = `${b.font || "Georgia"}, Georgia, serif`;
  const f = $("#brandForm");
  f.school.value = b.school || "";
  f.primary.value = toHex(b.primary);
  f.accent.value = toHex(b.accent);
  f.font.value = b.font || "Georgia";
}

function toHex(c) {
  if (!c) return "#1e5a46";
  if (c.startsWith("#") && c.length === 7) return c;
  return "#1e5a46";
}

async function loadState() {
  const s = await (await fetch("/api/state")).json();
  applyBrand(s.brand);
  renderBooks(s.books);
  const ai = await (await fetch("/api/ai")).json();
  const form = $("#aiForm");
  if (form) {
    form.provider.value = ai.provider === "yandex" ? "yandex" : "gigachat";
    if (ai.folder) form.folder.value = ai.folder;
  }
  $("#health").textContent = ai.ready ? `${ai.name} подключена` : "Работает без нейросети";
  $("#health").classList.toggle("on", Boolean(ai.ready));
  $("#aiBadge").textContent = ai.ready ? "включена" : "выключена";
  $("#aiBadge").classList.toggle("on", Boolean(ai.ready));
  const note = $("#aiStatus");
  if (note) {
    note.textContent = ai.ready
      ? `${ai.name} переписывает запрос и составляет тест по найденным страницам.`
      : "Модель переписывает запрос и составляет тест по найденным страницам. Без ключа тест строится из текста учебника.";
  }
  renderExamples();
}

function recentTopics() {
  try {
    return JSON.parse(localStorage.getItem("recentTopics") || "[]");
  } catch {
    return [];
  }
}

function rememberTopic(q) {
  const list = [q, ...recentTopics().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 5);
  try {
    localStorage.setItem("recentTopics", JSON.stringify(list));
  } catch {
    /* хранилище недоступно */
  }
}

function renderExamples() {
  const recent = recentTopics();
  const demo = lastBooks.some((b) => /демо/i.test(b.title)) ? DEMO_TOPICS : [];
  const list = [...new Set([...recent, ...demo])].slice(0, 6);
  $("#examples").innerHTML = list.length
    ? `<span class="chips-label">${recent.length ? "Недавние и примеры:" : "Примеры:"}</span>` +
      list.map((t) => `<button type="button" class="chip" data-topic="${esc(t)}">${esc(t)}</button>`).join("")
    : "";
}

$("#examples").addEventListener("click", (e) => {
  const topic = e.target.dataset?.topic;
  if (!topic) return;
  $("#query").value = topic;
  $("#genForm").requestSubmit();
});

function renderBooks(books) {
  lastBooks = books;
  $("#books").innerHTML = books.length
    ? books
        .map(
          (b) => `<li class="book-card">
        <div><b>${esc(b.title)}</b><small>${esc(b.publisher)} · ${esc(b.subject) || "предмет не указан"} · ${b.grade ? esc(b.grade) + " класс · " : ""}${b.pages} стр.</small></div>
        <div class="actions"><button type="button" class="danger" data-ask="${b.id}">Удалить</button></div>
      </li>`
        )
        .join("")
    : `<li class="hint">Список пуст. Добавьте PDF, EPUB или DjVu.</li>`;
  $("#bookPick").innerHTML = books.length
    ? books.map((b) => `<label><input type="checkbox" name="bid" value="${b.id}" checked /> ${esc(b.title)}</label>`).join("")
    : `<p class="hint">Сначала добавьте учебник.</p>`;
  $("#books").onclick = onBookClick;
}

async function onBookClick(e) {
  const ask = e.target.dataset.ask;
  const id = e.target.dataset.del;
  if (e.target.dataset.cancel) {
    renderBooks(lastBooks);
    return;
  }
  if (ask) {
    const book = lastBooks.find((b) => b.id === ask);
    const actions = e.target.closest(".actions");
    actions.innerHTML = `<span class="confirm-note">Удалить «${esc(book?.title || "учебник")}»?</span>
      <button type="button" class="danger solid" data-del="${ask}">Да</button>
      <button type="button" class="ghost" data-cancel="1">Нет</button>`;
    return;
  }
  if (!id) return;
  const res = await fetch("/api/books/" + id, { method: "DELETE" });
  if (!res.ok) {
    $("#uploadStatus").textContent = "Не удалось удалить учебник.";
    return;
  }
  $("#uploadStatus").textContent = "Учебник удалён и больше не участвует в поиске.";
  loadState();
}

$("#uploadForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  $("#uploadStatus").textContent = "Индексация… это может занять минуту для большого PDF.";
  const res = await fetch("/api/books", { method: "POST", body: fd });
  const data = await res.json();
  $("#uploadStatus").textContent = data.error ? data.error : `Готово: ${data.indexed} фрагментов. ${data.book?.note || ""}`;
  if (!data.error) {
    e.target.reset();
    $("#uploadFold").open = false;
    loadState();
  }
});

$("#aiForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  $("#aiStatus").textContent = "Проверяю ключ…";
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: f.provider.value, key: f.key.value, folder: f.folder.value }),
  });
  const data = await res.json();
  f.key.value = "";
  $("#aiStatus").textContent = data.ok ? `${data.name} ответила. Теперь тесты собирает модель по страницам учебника.` : data.error || "Не удалось подключить";
  $("#health").textContent = data.ready && data.ok ? `${data.name} подключена` : "Работает без нейросети";
  $("#health").classList.toggle("on", Boolean(data.ready && data.ok));
  $("#aiBadge").textContent = data.ready && data.ok ? "включена" : "выключена";
  $("#aiBadge").classList.toggle("on", Boolean(data.ready && data.ok));
});

$("#brandForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = { school: f.school.value, primary: f.primary.value, accent: f.accent.value, font: f.font.value };
  const b = await (await fetch("/api/brand", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
  applyBrand(b);
});

function updateParamsNote() {
  const types = { all: "всё сразу", scheme: "схема", table: "таблица", cards: "карточки", infographic: "инфографика", presentation: "презентация", test: "тест" };
  const grade = $("#grade").value.trim();
  $("#paramsNote").textContent = `${types[$("#type").value]} · тест из ${$("#count").value} заданий${grade ? ` · ${grade} класс` : ""}`;
}
["#type", "#count", "#grade"].forEach((s) => $(s).addEventListener("input", updateParamsNote));

function showLoading(query) {
  $("#workspace").innerHTML = `<div class="loading" aria-live="polite">
    <div class="spinner"></div>
    <div><b>Собираю материал по теме «${esc(query)}»</b>
    <ol class="steps-list"><li>Ищу страницы учебника</li><li>Отбираю формулировки по теме</li><li>Составляю задания и проверяю цифры</li></ol></div>
  </div>`;
}

$("#genForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#genErr").textContent = "";
  const query = $("#query").value.trim();
  const bookIds = [...document.querySelectorAll('input[name="bid"]:checked')].map((i) => i.value);
  const payload = {
    query,
    type: $("#type").value,
    grade: $("#grade").value,
    count: Number($("#count").value),
    bookIds,
    skipCache: $("#skipCache").checked,
  };
  const btn = $("#genBtn");
  btn.disabled = true;
  btn.textContent = "Собираю…";
  showLoading(query);
  try {
    const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) {
      $("#genErr").textContent = data.error || "Ошибка";
      $("#workspace").innerHTML = `<div class="empty warn"><b>Ничего не найдено</b><p>${esc(data.error || "Ошибка")}</p></div>`;
      return;
    }
    rememberTopic(query);
    renderExamples();
    lastPack = data;
    activeTab = "";
    renderPack(data);
    $("#workspace").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    $("#genErr").textContent = "Не удалось связаться с сервером.";
    $("#workspace").innerHTML = `<div class="empty warn"><b>Нет связи с сервером</b><p>Проверьте, что запущен npm start.</p></div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Собрать";
  }
});

// ───────────── результат ─────────────

function highlight(text, marks) {
  const set = new Set((marks || []).map((m) => m.toLowerCase()));
  return String(text || "")
    .split(/([A-Za-zА-Яа-яЁё0-9-]+)/)
    .map((part) => (set.has(part.toLowerCase()) ? `<mark>${esc(part)}</mark>` : esc(part)))
    .join("");
}

function pg(page) {
  return /^\d+$/.test(String(page)) ? `<button type="button" class="pg" data-page="${esc(page)}" title="Открыть страницу в источниках">с. ${esc(page)}</button>` : `<span class="pg plain">${esc(page)}</span>`;
}

function qualityLabel(q) {
  if (q >= 0.75) return ["Высокое", "good"];
  if (q >= 0.45) return ["Среднее", "mid"];
  return ["Слабое", "low"];
}

function tabsFor(p) {
  const m = p.materials || {};
  const tabs = [{ id: "sources", label: "Источники", count: (p.sources || []).length }];
  const names = { scheme: "Схема", table: "Таблица", cards: "Карточки", infographic: "Инфографика", presentation: "Презентация", test: "Тест" };
  for (const id of Object.keys(names)) {
    if (m[id]) tabs.push({ id, label: names[id], count: id === "test" ? (m.test.items || []).length : undefined });
  }
  if (p.factCheck) tabs.push({ id: "facts", label: "Проверка фактов", warn: p.factCheck.mismatches });
  if (p.compare && Object.keys(p.compare).length > 1) tabs.push({ id: "compare", label: "Сравнение УМК" });
  return tabs;
}

function renderPack(p) {
  const w = $("#workspace");
  const tabs = tabsFor(p);
  const m = p.materials || {};
  if (!activeTab || !tabs.some((t) => t.id === activeTab)) activeTab = tabs.find((t) => t.id !== "sources")?.id || "sources";
  const [qText, qClass] = qualityLabel(p.search?.quality ?? 1);
  const canPptx = Boolean(m.presentation?.slides?.length);
  const how = p.model ? `Тест: ${esc(p.model)}` : "Тест из текста учебника";

  let html = `<div class="result-head">
    <div class="rh-main">
      <h2>${esc(p.topic)}</h2>
      <div class="meta-chips">
        <span class="chip-info">Страниц: ${(p.sources || []).length}</span>
        <span class="chip-info ${qClass}">Совпадение: ${qText}</span>
        <span class="chip-info">${how}</span>
        ${p.cached ? `<span class="chip-info">Из кэша</span>` : ""}
        <span class="chip-info">${esc(p.brand?.school || "")}</span>
      </div>
    </div>
    <div class="rh-actions">
      <button type="button" class="ghost" onclick="window.print()">Печать / PDF</button>
      ${canPptx ? `<button type="button" id="exportPptx">Скачать презентацию</button>` : ""}
    </div>
  </div>`;

  const notes = [];
  for (const fx of p.search?.fixes || []) notes.push(`Вы написали «${esc(fx.raw)}» — искали «${esc(fx.suggestion)}».`);
  if ((p.search?.unknown || []).length) notes.push(`Этих слов нет в учебниках: ${p.search.unknown.map((x) => `«${esc(x)}»`).join(", ")}. Поиск шёл по остальным.`);
  if ((p.search?.quality ?? 1) < 0.45) notes.push("Запрос найден слабо. Проверьте источники или уточните тему.");
  if (p.modelNote) notes.push(esc(p.modelNote));
  if (p.lookups?.length) notes.push(`Модель дополнительно искала: ${p.lookups.map((q) => esc(q)).join("; ")}.`);
  if (notes.length) html += `<div class="notes">${notes.map((n) => `<p>${n}</p>`).join("")}</div>`;

  html += `<div class="tabs" role="tablist">${tabs
    .map(
      (t) =>
        `<button type="button" role="tab" class="tab ${t.id === activeTab ? "active" : ""}" data-tab="${t.id}">${t.label}${
          t.count !== undefined ? ` <span class="cnt">${t.count}</span>` : ""
        }${t.warn ? ` <span class="cnt warn">${t.warn}</span>` : ""}</button>`
    )
    .join("")}</div>`;

  const panels = {
    sources: renderSources(p),
    scheme: m.scheme ? renderScheme(m.scheme) : "",
    table: m.table ? renderTable(m.table) : "",
    cards: m.cards ? renderCards(m.cards) : "",
    infographic: m.infographic ? renderInfographic(m.infographic) : "",
    presentation: m.presentation ? renderPresentation(m.presentation) : "",
    test: m.test ? renderTest(m.test) : "",
    facts: p.factCheck ? renderFacts(p.factCheck) : "",
    compare: p.compare ? renderCompare(p.compare) : "",
  };
  for (const t of tabs) {
    html += `<section class="tab-panel ${t.id === activeTab ? "active" : ""}" id="panel-${t.id}" role="tabpanel">${panels[t.id]}</section>`;
  }

  html += `<details class="fold edit-fold"><summary>Поправить готовое</summary>
    <p class="lead">Учебник заново не читается: блок добавится в уже собранную схему и презентацию.</p>
    <div class="edit-row"><input id="editText" placeholder="Добавь блок про темновую фазу" /><button type="button" id="editBtn" class="ghost">Поправить</button></div>
  </details>`;

  w.innerHTML = html;
  bindResult(p);
}

function bindResult(p) {
  $("#exportPptx")?.addEventListener("click", exportPptx);
  $("#editBtn")?.addEventListener("click", editCurrent);
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
  document.querySelectorAll(".pg[data-page]").forEach((b) => b.addEventListener("click", () => openSource(b.dataset.page)));
  if (p.materials?.test) bindTest(p.materials.test);
}

function switchTab(id) {
  activeTab = id;
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === id));
  document.querySelectorAll(".tab-panel").forEach((s) => s.classList.toggle("active", s.id === `panel-${id}`));
}

function openSource(page) {
  switchTab("sources");
  const card = document.querySelector(`[data-src-page="${page}"]`);
  if (!card) return;
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.classList.add("flash");
  setTimeout(() => card.classList.remove("flash"), 1600);
}

async function editCurrent() {
  if (!lastPack) return;
  const instruction = $("#editText").value;
  const res = await fetch("/api/edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pack: lastPack, instruction }) });
  const data = await res.json();
  if (!res.ok) {
    $("#genErr").textContent = data.error || "Не удалось поправить";
    return;
  }
  lastPack = data;
  renderPack(data);
}

function renderSources(p) {
  const list = p.sources || [];
  if (!list.length) return `<p class="hint">Источники не найдены.</p>`;
  return `<p class="lead">Страницы, из которых взяты все факты. Найденные слова подсвечены.</p><div class="sources">${list
    .map((s) => {
      const pct = Math.round(Math.min(1, Math.max(0.04, Number(s.score) || 0)) * 100);
      const extra = (s.passages || []).filter((x) => !s.excerpt.includes(x.slice(0, 40)));
      return `<article class="src" data-src-page="${esc(s.page)}">
        <div class="src-top">
          <div><b>${esc(s.section || s.bookTitle)}</b><small>${s.section ? `${esc(s.bookTitle)} · ` : ""}${esc(s.publisher || "")}</small></div>
          <span class="page-badge">с. ${esc(s.page)}</span>
        </div>
        <div class="bar" title="Насколько страница подходит запросу"><i style="width:${pct}%"></i><span>${pct}%</span></div>
        <p class="excerpt">«${highlight(s.excerpt, s.marks)}»</p>
        ${extra.length ? `<details><summary>Ещё фрагменты со страницы</summary>${extra.map((x) => `<p class="excerpt">«${highlight(x, s.marks)}»</p>`).join("")}</details>` : ""}
      </article>`;
    })
    .join("")}</div>`;
}

function renderScheme(s) {
  return `<div class="scheme">${s.nodes
    .map((n, i) => `<div class="node"><span class="num">${i + 1}</span><b>${esc(n.title)}</b><p>${esc(n.body)}</p>${pg(n.page)}</div>`)
    .join("")}</div>`;
}

function renderTable(t) {
  return `<div class="table-wrap"><table class="mat"><tr>${t.headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>${t.rows
    .map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
    .join("")}</table></div>`;
}

function renderCards(c) {
  return `<div class="cards">${c.items
    .map((i) => `<div class="flip"><span class="num">${i.n}</span><b>${esc(i.front)}</b><p>${esc(i.back)}</p>${pg(i.page)}</div>`)
    .join("")}</div>`;
}

function renderInfographic(g) {
  return `<div class="steps">${g.steps
    .map((s) => `<div class="step"><span class="num">${s.n}</span><b>${esc(s.title)}</b><p>${esc(s.text)}</p>${pg(s.page)}</div>`)
    .join("")}</div>`;
}

function renderPresentation(pr) {
  return `<div class="slides">${pr.slides
    .map((s, i) => `<div class="slide"><span class="slide-n">${i + 1}</span><h3>${esc(s.title)}</h3><ul>${(s.bullets || []).map((b) => `<li>${esc(b)}</li>`).join("")}</ul></div>`)
    .join("")}</div>`;
}

function renderFacts(f) {
  const items = f.items || [];
  const head = items.length
    ? `<p class="lead">Цифры и даты из материалов сверены с найденными страницами.${f.mismatches ? ` Расхождений: ${f.mismatches} — проверьте вручную.` : " Расхождений нет."}</p>`
    : `<p class="lead">В этом пакете нет чисел для сверки.</p>`;
  return `${head}<div class="facts">${items
    .map((it) => `<div class="fact ${it.status}"><b>${esc(it.claim)}</b> — ${esc(it.hint)}<br /><small>${esc(it.context)}</small></div>`)
    .join("")}</div>`;
}

function renderCompare(cmp) {
  return `<div class="compare">${Object.entries(cmp)
    .map(([pub, items]) => `<div class="cmp"><b>${esc(pub)}</b>${items.map((i) => `<p>с. ${i.page}, ${esc(i.title)}: ${esc(i.excerpt)}…</p>`).join("")}</div>`)
    .join("")}</div>`;
}

// ───────────── тест ─────────────

function pointsWord(n) {
  const t = n % 100;
  const o = n % 10;
  if (t >= 11 && t <= 14) return "баллов";
  if (o === 1) return "балл";
  if (o >= 2 && o <= 4) return "балла";
  return "баллов";
}

function answerText(it) {
  if (it.type === "choice") return `${LETTERS[it.answer]}. ${it.options[it.answer]}`;
  if (it.type === "judge") return it.options[it.answer];
  if (it.type === "multi") return it.answer.map((i) => `${LETTERS[i]}. ${it.options[i]}`).join("; ");
  if (it.type === "order") return it.answer.map((i) => it.options[i]).join(" → ");
  if (it.type === "match") return it.left.map((l, i) => `${l} → ${LETTERS[it.answer[i]]}`).join("; ");
  return it.sample || "";
}

function renderQuestionBody(it, i) {
  if (it.type === "choice" || it.type === "judge") {
    return `<div class="opts ${it.type === "judge" ? "judge" : ""}">${it.options
      .map(
        (o, j) => `<label class="opt" data-opt="${j}" ${j === it.answer ? 'data-correct="1"' : ""}>
          <input type="radio" name="q${i}" value="${j}" /><span class="mark">${it.type === "judge" ? (j === 0 ? "✓" : "✕") : LETTERS[j]}</span><span class="otext">${esc(o)}</span></label>`
      )
      .join("")}</div>`;
  }
  if (it.type === "multi") {
    return `<div class="opts">${it.options
      .map(
        (o, j) => `<label class="opt" data-opt="${j}" ${it.answer.includes(j) ? 'data-correct="1"' : ""}>
          <input type="checkbox" name="q${i}" value="${j}" /><span class="mark sq">${LETTERS[j]}</span><span class="otext">${esc(o)}</span></label>`
      )
      .join("")}</div><button type="button" class="check-btn" data-check>Проверить</button>`;
  }
  if (it.type === "order") {
    const start = it.options.map((_, j) => j);
    return `<ol class="order">${start
      .map(
        (j) => `<li data-opt="${j}"><span class="grip">⋮⋮</span><span class="otext">${esc(it.options[j])}</span>
          <span class="mv"><button type="button" data-up aria-label="Выше">↑</button><button type="button" data-down aria-label="Ниже">↓</button></span></li>`
      )
      .join("")}</ol><button type="button" class="check-btn" data-check>Проверить порядок</button>`;
  }
  if (it.type === "match") {
    return `<div class="match"><div class="match-left">${it.left
      .map(
        (l, j) => `<div class="m-row"><span class="m-l">${j + 1}. ${esc(l)}</span>
          <select data-match="${j}"><option value="">—</option>${it.right.map((_, k) => `<option value="${k}">${LETTERS[k]}</option>`).join("")}</select></div>`
      )
      .join("")}</div><ol class="match-right" type="А">${it.right.map((r, k) => `<li><b>${LETTERS[k]}.</b> ${esc(r)}</li>`).join("")}</ol></div>
      <button type="button" class="check-btn" data-check>Проверить</button>`;
  }
  return `<textarea rows="3" placeholder="Ваш ответ…" aria-label="Ответ"></textarea><div class="lines"></div>
    <button type="button" class="check-btn" data-reveal>Показать образец</button>`;
}

function renderQuestion(it, i) {
  const rubric = it.rubric?.length ? `<ul class="rubric">${it.rubric.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : "";
  const key =
    it.type === "open"
      ? `<b>Образец:</b> ${esc(it.sample)}${rubric ? `<b class="rb">Критерии:</b>${rubric}` : ""}`
      : `<b>Ответ:</b> ${esc(answerText(it))}`;
  return `<section class="q" data-i="${i}" data-type="${it.type}">
    <header class="qh"><span class="qn">${i + 1}</span><span class="qtype">${esc(it.kind || "Задание")}</span><span class="qpts">${it.points || 1} ${pointsWord(it.points || 1)}</span></header>
    <p class="qtext">${esc(it.q)}</p>
    ${renderQuestionBody(it, i)}
    <div class="qfeedback" hidden></div>
    <div class="qkey">${key}${it.hint ? `<small>${esc(it.hint)}</small>` : ""}<small>Источник: ${pg(it.page)}</small></div>
  </section>`;
}

function renderTest(t) {
  const items = t.items || [];
  const total = items.reduce((s, it) => s + (it.points || 1), 0);
  return `<div class="test" id="test" data-mode="student">
    <div class="test-bar">
      <div class="seg" role="group" aria-label="Режим теста">
        <button type="button" class="on" data-mode="student">Ученик</button>
        <button type="button" data-mode="key">Ключ учителя</button>
      </div>
      <div class="score" id="score" aria-live="polite">Баллы: 0 из ${total}</div>
      <div class="test-actions">
        <button type="button" class="ghost" data-print="student">Печать без ответов</button>
        <button type="button" class="ghost" data-print="key">Печать с ключом</button>
        <button type="button" class="ghost" data-reset>Пройти заново</button>
      </div>
    </div>
    ${t.note ? `<p class="note">${esc(t.note)}</p>` : ""}
    <p class="lead print-title">Тест по теме «${esc(t.topic)}» · ${items.length} заданий · ${total} ${pointsWord(total)}</p>
    ${items.map(renderQuestion).join("")}
  </div>`;
}

function evaluate(it, q) {
  if (it.type === "choice" || it.type === "judge") {
    const sel = q.querySelector("input:checked");
    return sel ? Number(sel.value) === it.answer : null;
  }
  if (it.type === "multi") {
    const picked = [...q.querySelectorAll("input:checked")].map((x) => Number(x.value)).sort((a, b) => a - b);
    if (!picked.length) return null;
    return picked.length === it.answer.length && picked.every((v, k) => v === it.answer[k]);
  }
  if (it.type === "order") {
    const order = [...q.querySelectorAll(".order li")].map((li) => Number(li.dataset.opt));
    return order.every((v, k) => v === it.answer[k]);
  }
  if (it.type === "match") {
    const vals = [...q.querySelectorAll("select[data-match]")].map((s) => s.value);
    if (vals.some((v) => v === "")) return null;
    return vals.every((v, k) => Number(v) === it.answer[k]);
  }
  return null;
}

function bindTest(test) {
  const root = $("#test");
  if (!root) return;
  const items = test.items || [];
  const done = new Map();
  const total = items.reduce((s, it) => s + (it.points || 1), 0);

  const refresh = () => {
    let got = 0;
    let right = 0;
    for (const [i, ok] of done) {
      if (ok) {
        got += items[i].points || 1;
        right += 1;
      }
    }
    $("#score").textContent = `Баллы: ${got} из ${total}${done.size ? ` · верно ${right} из ${done.size} проверенных` : ""}`;
  };

  const finish = (i, ok) => {
    const q = root.querySelector(`.q[data-i="${i}"]`);
    const it = items[i];
    done.set(i, ok);
    q.classList.remove("ok", "bad");
    q.classList.add(ok ? "ok" : "bad", "checked");
    q.querySelectorAll(".opt").forEach((l) => {
      const input = l.querySelector("input");
      const picked = input.checked;
      l.classList.toggle("right", l.dataset.correct === "1");
      l.classList.toggle("wrong", picked && l.dataset.correct !== "1");
      input.disabled = true;
    });
    q.querySelectorAll("select[data-match]").forEach((s) => {
      const good = Number(s.value) === it.answer[Number(s.dataset.match)];
      s.classList.toggle("sel-ok", good);
      s.classList.toggle("sel-bad", !good);
      s.disabled = true;
    });
    q.querySelectorAll(".order button").forEach((b) => (b.disabled = true));
    q.querySelector("[data-check]")?.setAttribute("hidden", "");
    const fb = q.querySelector(".qfeedback");
    fb.hidden = false;
    fb.innerHTML = ok
      ? `<b>Верно.</b> ${esc(it.hint || "")}`
      : `<b>Неверно.</b> Правильный ответ: ${esc(answerText(it))}.${it.hint ? ` <small>${esc(it.hint)}</small>` : ""}`;
    refresh();
  };

  root.addEventListener("change", (e) => {
    const q = e.target.closest(".q");
    if (!q || !e.target.matches('input[type="radio"]')) return;
    const i = Number(q.dataset.i);
    const ok = evaluate(items[i], q);
    if (ok !== null) finish(i, ok);
  });

  root.addEventListener("click", (e) => {
    const t = e.target;
    if (t.dataset.mode) {
      root.dataset.mode = t.dataset.mode;
      root.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("on", b === t));
      return;
    }
    if (t.dataset.print) {
      document.body.dataset.print = t.dataset.print;
      window.print();
      return;
    }
    if ("reset" in t.dataset) {
      renderPack(lastPack);
      return;
    }
    const q = t.closest(".q");
    if (!q) return;
    const i = Number(q.dataset.i);
    if (t.matches("[data-up],[data-down]")) {
      const li = t.closest("li");
      if (t.matches("[data-up]") && li.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling);
      if (t.matches("[data-down]") && li.nextElementSibling) li.parentNode.insertBefore(li.nextElementSibling, li);
      return;
    }
    if ("check" in t.dataset) {
      const ok = evaluate(items[i], q);
      if (ok === null) {
        const fb = q.querySelector(".qfeedback");
        fb.hidden = false;
        fb.textContent = items[i].type === "match" ? "Выберите букву для каждой строки." : "Сначала выберите ответ.";
        return;
      }
      finish(i, ok);
      return;
    }
    if ("reveal" in t.dataset) {
      q.classList.add("revealed");
      t.setAttribute("hidden", "");
    }
  });
}

window.addEventListener("afterprint", () => {
  delete document.body.dataset.print;
});

async function exportPptx() {
  const button = $("#exportPptx");
  if (!lastPack?.materials?.presentation?.slides?.length) return;
  if (button) button.disabled = true;
  try {
    const res = await fetch("/api/export/pptx", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lastPack) });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Не удалось скачать презентацию");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${String(lastPack.topic || "prezentaciya").slice(0, 40)}.pptx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    $("#genErr").textContent = e.message || String(e);
  } finally {
    if (button) button.disabled = false;
  }
}

loadState().catch((e) => {
  $("#health").textContent = "Сервер не отвечает. Запустите npm start";
  console.error(e);
});
