let lastPack = null;
let lastBooks = [];
let brand = { school: "Школа", primary: "#1e5a46", accent: "#d4a017", font: "Georgia" };

const $ = (s) => document.querySelector(s);

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
  const line = ai.ready ? `${ai.name} подключена` : "Нейросеть не подключена";
  $("#health").textContent = line;
  const note = $("#aiStatus");
  if (note) {
    note.textContent = ai.ready
      ? `${ai.name} ищет формулировки в учебнике и собирает тест.`
      : "Вставьте ключ GigaChat или Алисы. Без ключа тест строится из цитат учебника.";
  }
}

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
    ? books
        .map(
          (b) => `<label><input type="checkbox" name="bid" value="${b.id}" checked /> ${esc(b.title)}</label>`
        )
        .join("")
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
  $("#uploadStatus").textContent = data.error
    ? data.error
    : `Готово: ${data.indexed} фрагментов. ${data.book?.note || ""}`;
  if (!data.error) {
    e.target.reset();
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
  $("#aiStatus").textContent = data.ok
    ? `${data.name} ответила. Теперь тесты собирает модель по страницам учебника.`
    : data.error || "Не удалось подключить";
  $("#health").textContent = data.ready && data.ok ? `${data.name} подключена` : "Нейросеть не подключена";
});

$("#brandForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = {
    school: f.school.value,
    primary: f.primary.value,
    accent: f.accent.value,
    font: f.font.value,
  };
  const b = await (await fetch("/api/brand", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
  applyBrand(b);
});

$("#genForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#genErr").textContent = "";
  const bookIds = [...document.querySelectorAll('input[name="bid"]:checked')].map((i) => i.value);
  const payload = {
    query: $("#query").value,
    type: $("#type").value,
    grade: $("#grade").value,
    bookIds,
    skipCache: $("#skipCache").checked,
  };
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    $("#genErr").textContent = data.error || "Ошибка";
    return;
  }
  lastPack = data;
  renderPack(data);
});

$("#editBtn").addEventListener("click", async () => {
  if (!lastPack) return;
  const instruction = $("#editText").value;
  const data = await (
    await fetch("/api/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pack: lastPack, instruction }),
    })
  ).json();
  lastPack = data;
  renderPack(data);
});

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderPack(p) {
  const w = $("#workspace");
  const cached = p.cached ? "Из кэша · " : "";
  const llm = p.model
    ? `Тест собрала ${esc(p.model)} по найденным страницам · `
    : p.modelNote
      ? `${esc(p.modelNote)} · `
      : "Собрано из цитат учебника · ";
  const canPptx = Boolean(mPreview(p).presentation?.slides?.length);
  let html = `<div class="toolbar">
    <button type="button" onclick="window.print()">Печать / PDF</button>
    ${canPptx ? `<button type="button" id="exportPptx">Скачать презентацию</button>` : ""}
    <span class="hint">${cached}${llm}${esc(p.brand?.school || "")}</span>
  </div>`;

  html += `<h2>Откуда взято</h2><div class="sources">`;
  for (const s of p.sources || []) {
    html += `<div class="src"><b>${esc(s.bookTitle)}</b> (${esc(s.publisher)}) · страница ${s.page} · близость ${s.score}<br />«${esc(s.excerpt)}…»</div>`;
  }
  html += `</div>`;
  if (p.lookups?.length) {
    html += `<p class="hint">Модель дополнительно искала в учебнике: ${p.lookups.map((q) => esc(q)).join("; ")}.</p>`;
  }

  if (p.compare && Object.keys(p.compare).length > 1) {
    html += `<h2>Сравнение УМК</h2><div class="compare">`;
    for (const [pub, items] of Object.entries(p.compare)) {
      html += `<div class="cmp"><b>${esc(pub)}</b>${items
        .map((i) => `<p>с. ${i.page}, ${esc(i.title)}: ${esc(i.excerpt)}…</p>`)
        .join("")}</div>`;
    }
    html += `</div>`;
  }

  if (p.factCheck) {
    html += `<h2>Проверка фактов</h2><p class="hint">Цифры и даты сверены с найденными страницами. Расхождения подсвечены.</p><div class="facts">`;
    for (const it of p.factCheck.items || []) {
      html += `<div class="fact ${it.status}"><b>${esc(it.claim)}</b> — ${esc(it.hint)}<br /><small>${esc(it.context)}</small></div>`;
    }
    if (!(p.factCheck.items || []).length) html += `<div class="fact">В этом пакете нет чисел для сверки.</div>`;
    html += `</div>`;
  }

  const m = p.materials || {};
  if (m.scheme) {
    html += `<article class="material"><header class="mh"><h3>${esc(m.scheme.topic)}</h3><span class="badge">Схема</span></header><div class="scheme">`;
    for (const n of m.scheme.nodes) {
      html += `<div class="node"><b>${esc(n.title)}</b><p>${esc(n.body)}</p><small>с. ${esc(n.page)}</small></div>`;
    }
    html += `</div></article>`;
  }
  if (m.table) {
    html += `<article class="material"><header class="mh"><h3>Таблица</h3><span class="badge">Таблица</span></header><table class="mat"><tr>${m.table.headers
      .map((h) => `<th>${esc(h)}</th>`)
      .join("")}</tr>`;
    for (const row of m.table.rows) html += `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`;
    html += `</table></article>`;
  }
  if (m.cards) {
    html += `<article class="material"><header class="mh"><h3>Карточки</h3><span class="badge">Карточки</span></header><div class="cards">`;
    for (const c of m.cards.items) {
      html += `<div class="flip"><b>${c.n}. ${esc(c.front)}</b><p>${esc(c.back)}</p><small>с. ${c.page}</small></div>`;
    }
    html += `</div></article>`;
  }
  if (m.infographic) {
    html += `<article class="material"><header class="mh"><h3>Инфографика</h3><span class="badge">Инфографика</span></header><div class="steps">`;
    for (const s of m.infographic.steps) {
      html += `<div class="step"><b>${s.n}. ${esc(s.title)}</b><p>${esc(s.text)}</p><small>с. ${s.page}</small></div>`;
    }
    html += `</div></article>`;
  }
  if (m.presentation) {
    html += `<article class="material"><header class="mh"><h3>Презентация</h3><span class="badge">Слайды</span></header>`;
    for (const s of m.presentation.slides) {
      html += `<div class="slide"><h3>${esc(s.title)}</h3><ul>${(s.bullets || []).map((b) => `<li>${esc(b)}</li>`).join("")}</ul></div>`;
    }
    html += `</article>`;
  }
  if (m.test) {
    html += `<article class="material"><header class="mh"><h3>Тест</h3><span class="badge">Проверка</span></header><p class="hint">Выбор ответа, верно или неверно и краткий пересказ. Ключ под заданием — для учителя.</p>`;
    (m.test.items || []).forEach((t, i) => {
      html += renderQuestion(t, i);
    });
    html += `</article>`;
  }
  w.innerHTML = html;
  $("#exportPptx")?.addEventListener("click", exportPptx);
}

function mPreview(p) {
  return p.materials || {};
}

const LETTERS = ["А", "Б", "В", "Г", "Д"];

function questionKind(t) {
  if (t.type === "open") return "Краткий ответ";
  if (t.type === "judge") return "Верно / неверно";
  if (String(t.q || "").startsWith("Как учебник")) return "Продолжение мысли";
  return "Выбор ответа";
}

function renderQuestion(t, i) {
  if (t.type === "open" || !t.options?.length) {
    return `<div class="question"><p><b>${i + 1}.</b> <span class="qtype">${questionKind(t)}</span> ${esc(t.q)}</p>
      <details><summary>Образец из учебника, с. ${esc(t.page)}</summary><p>${esc(t.sample || "")}</p><small>${esc(t.hint || "")}</small></details></div>`;
  }
  const key = LETTERS[t.answer] || "—";
  return `<div class="question"><p><b>${i + 1}.</b> <span class="qtype">${questionKind(t)}</span> ${esc(t.q)}</p>
    <ol class="opts">${t.options.map((o, j) => `<li><b>${LETTERS[j]}.</b> ${esc(o)}</li>`).join("")}</ol>
    <small class="keyline">Ответ: ${key} · с. ${esc(t.page)}${t.hint ? ` · ${esc(t.hint)}` : ""}</small></div>`;
}

async function exportPptx() {
  const button = $("#exportPptx");
  if (!lastPack?.materials?.presentation?.slides?.length) return;
  if (button) button.disabled = true;
  try {
    const res = await fetch("/api/export/pptx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lastPack),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Не удалось скачать презентацию");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const topic = String(lastPack.topic || "prezentaciya").slice(0, 40);
    a.href = url;
    a.download = `${topic}.pptx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    const err = $("#genErr");
    if (err) err.textContent = e.message || String(e);
  } finally {
    if (button) button.disabled = false;
  }
}

loadState().catch((e) => {
  $("#health").textContent = "Сервер не отвечает. Запустите npm start";
  console.error(e);
});
