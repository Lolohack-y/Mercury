const { chat, chatSlides, status } = require("./ai");

function parseJson(raw) {
  const text = String(raw || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  if (start < 0) throw new Error("Модель не вернула JSON");
  const slice = body.slice(start).replace(/"\s*}\s*]/g, '"]}');
  try {
    return JSON.parse(slice.slice(0, slice.lastIndexOf("}") + 1));
  } catch {
    let cut = slice;
    for (let i = 0; i < 6; i += 1) {
      const last = cut.lastIndexOf("}");
      if (last < 0) break;
      cut = cut.slice(0, last + 1);
      const closed = /\]\s*$/.test(cut) ? `${cut}}` : `${cut}]}`;
      try {
        return JSON.parse(closed);
      } catch {
        /* ответ оборвался на середине слайда */
      }
    }
    throw new Error("Модель не вернула JSON");
  }
}

function contextFrom(hits) {
  return hits
    .slice(0, 8)
    .map((h) => `[${h.chunk.bookTitle}, с. ${h.chunk.page}]\n${h.chunk.text}`)
    .join("\n\n")
    .slice(0, 10000);
}

async function expandQueries(query, grade) {
  if (!status().ready) return [];
  try {
    const raw = await chat([
      {
        role: "system",
        content:
          "Ты ищешь формулировки в школьном учебнике. По теме учителя предложи 2 короткие поисковые фразы на русском: термины и процессы, которые параграф обычно называет рядом. Не уходи в другую тему и не добавляй факты. Ответ — только JSON: {\"queries\":[\"фраза\",\"фраза\"]}",
      },
      { role: "user", content: `Тема: ${query}\nКласс: ${grade || "не указан"}` },
    ]);
    const parsed = parseJson(raw);
    const origin = String(query).toLowerCase().replace(/\s+/g, " ").trim();
    return [...new Set((parsed.queries || []).map((q) => String(q).trim()).filter((q) => q.length > 2 && q.length < 80))]
      .filter((q) => q.toLowerCase() !== origin)
      .slice(0, 2);
  } catch {
    return [];
  }
}

const KINDS = {
  choice: "Один верный ответ",
  multi: "Несколько верных",
  judge: "Верно или неверно",
  order: "Последовательность",
  open: "Развёрнутый ответ",
};
const POINTS = { choice: 1, judge: 1, multi: 2, order: 2, open: 2 };

const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

function tokens(text) {
  return new Set(String(text || "").toLowerCase().match(/[а-яёa-z0-9]{4,}/g) || []);
}

function shared(a, b) {
  let n = 0;
  for (const word of a) if (b.has(word)) n += 1;
  return n;
}

function placePage(raw, hits) {
  const stated = String(raw.page ?? "").replace(/\D/g, "");
  const blob = tokens([raw.q, ...(raw.options || []), raw.sample].filter(Boolean).join(" "));
  let best = null;
  for (const hit of hits) {
    const n = shared(blob, tokens(hit.chunk.text));
    if (!best || n > best.n) best = { n, page: String(hit.chunk.page), book: hit.chunk.bookTitle };
  }
  const listed = hits.find((hit) => String(hit.chunk.page) === stated);
  if (listed) return { page: stated, book: listed.chunk.bookTitle };
  if (best && best.n >= 2) return { page: best.page, book: best.book };
  return null;
}

function asIndex(value, length) {
  const n = Number(value);
  if (!Number.isInteger(n)) return null;
  if (n >= 0 && n < length) return n;
  if (n >= 1 && n <= length) return n - 1;
  return null;
}

function sanitizeTest(parsed, hits, topic, count = 8) {
  const items = [];
  const seen = new Set();
  for (const raw of parsed.items || []) {
    const placed = placePage(raw, hits);
    if (!placed) continue;
    const q = clean(raw.q, 400);
    if (q.length < 12 || seen.has(q)) continue;
    if (/_{2,}|пропущенн|вставьте|продолжите|закончите|допишите/i.test(q)) continue;
    const type = KINDS[raw.type] ? raw.type : "choice";
    const base = { type, kind: KINDS[type], q, page: placed.page, book: placed.book, points: POINTS[type], hint: clean(raw.hint, 280) };
    if (type === "open") {
      const sample = clean(raw.sample, 600);
      if (!sample) continue;
      const rubric = (Array.isArray(raw.rubric) ? raw.rubric : []).map((r) => clean(r, 160)).filter(Boolean).slice(0, 5);
      items.push({ ...base, options: [], answer: null, sample, rubric: rubric.length ? rubric : [sample], hint: base.hint || "Ориентируйтесь на образец." });
    } else if (type === "judge") {
      const ok = raw.answer === true || raw.answer === 0 || raw.answer === "Верно";
      const bad = raw.answer === false || raw.answer === 1 || raw.answer === "Неверно";
      if (!ok && !bad) continue;
      items.push({ ...base, options: ["Верно", "Неверно"], answer: ok ? 0 : 1 });
    } else {
      const options = [...new Set((Array.isArray(raw.options) ? raw.options : []).map((o) => clean(o, 220)).filter(Boolean))].slice(0, 6);
      if (options.length < 3) continue;
      if (type === "choice") {
        const answer = asIndex(raw.answer, options.length);
        if (answer == null) continue;
        items.push({ ...base, options, answer });
      } else if (type === "multi") {
        const source = Array.isArray(raw.answer) ? raw.answer : [];
        const shifted = source.some((n) => Number(n) === options.length);
        const answer = [...new Set(source.map((n) => (shifted ? Number(n) - 1 : asIndex(n, options.length))))].filter(
          (n) => Number.isInteger(n) && n >= 0 && n < options.length
        );
        if (!answer.length || answer.length === options.length) continue;
        items.push({ ...base, options, answer: answer.sort((a, b) => a - b) });
      } else {
        const source = Array.isArray(raw.answer) ? raw.answer : [];
        const shifted = source.some((n) => Number(n) === options.length);
        const answer = source.map((n) => (shifted ? Number(n) - 1 : asIndex(n, options.length)));
        const valid =
          answer.length === options.length &&
          new Set(answer).size === options.length &&
          answer.every((n) => Number.isInteger(n) && n >= 0 && n < options.length);
        if (!valid) continue;
        items.push({ ...base, options, answer });
      }
    }
    seen.add(q);
  }
  if (items.length < Math.min(4, count)) return null;
  const list = items.slice(0, count);
  return { kind: "test", topic, items: list, model: true, points: list.reduce((s, it) => s + it.points, 0), stats: {} };
}

const SYSTEM_TEST = [
  "Ты опытный учитель и составляешь проверочную работу строго по фрагментам учебника.",
  "Правила: используй только факты из фрагментов, ничего не выдумывай. Не делай задания «вставьте пропущенное слово» и «продолжите предложение».",
  "Каждое задание проверяет понимание: определение, причина и следствие, дата, место, состав, последовательность, различие понятий. Неверные варианты должны быть правдоподобными и взяты из соседних мест текста, но однозначно неверными для данного вопроса.",
  "Виды заданий (поле type):",
  "choice — один верный ответ, 4 варианта, answer — номер верного варианта с нуля.",
  "multi — несколько верных, 5 вариантов, answer — массив номеров верных вариантов.",
  "judge — «верно ли утверждение», в q полное утверждение, answer — 0 если верно и 1 если неверно. Неверное утверждение — искажённая фраза учебника.",
  "order — расположить 3–5 событий или этапов по порядку, options — в перемешанном виде, answer — массив: на k-м месте номер варианта, который должен стоять k-м.",
  "open — развёрнутый ответ, sample — образцовый ответ по учебнику, rubric — 2–4 критерия проверки.",
  "Для каждого задания: page — номер страницы из метки фрагмента, hint — пояснение учителю со ссылкой на текст.",
  "Нужны разные виды заданий: не больше трети judge, хотя бы одно multi или order, одно open в конце.",
  "Ответ — только JSON {\"items\":[...]}, без пояснений вокруг.",
].join("\n");

function testPrompt(topic, hits, count, again) {
  const pages = [...new Set(hits.map((h) => h.chunk.page))].join(", ");
  const retry = again
    ? `Прошлый тест отклонён: мало заданий, которые можно сверить со страницами ${pages}. Составь заново.\n`
    : "";
  return `${retry}Тема: ${topic}\nЧисло заданий: ${count}\npage только из списка: ${pages}\n\nФрагменты:\n${contextFrom(hits)}`;
}

async function once(topic, hits, count, again) {
  const raw = await chat([
    { role: "system", content: SYSTEM_TEST },
    { role: "user", content: testPrompt(topic, hits, count, again) },
  ]);
  return sanitizeTest(parseJson(raw), hits, topic, count);
}

async function writeTest(topic, hits, count = 8) {
  if (!status().ready) return null;
  for (const again of [false, true]) {
    try {
      const test = await once(topic, hits, count, again);
      if (test) return test;
    } catch {
      if (again) return null;
    }
  }
  return null;
}

const SYSTEM_SLIDES = [
  "Ты отдельно от остальных заданий собираешь учебную презентацию. Только факты из фрагментов, ничего не выдумывай.",
  "5 слайдов, у каждого разные роли. Поля только layout, title, page, bullets. page — одно число, не массив.",
  "1) layout cover — титул темы, bullets из одного короткого предложения-подзаголовка.",
  "2 и 3) layout text — ровно два предложения, почти дословно из фрагмента, каждое короче 180 символов.",
  "4) layout quote — одна дословная фраза учебника в bullets, title короткий.",
  "5) layout text — вывод по теме, два предложения из фрагмента.",
  "Не вставляй layout внутрь bullets и не используй поле content.",
  "Пример: {\"slides\":[{\"layout\":\"cover\",\"title\":\"Световая фаза\",\"page\":49,\"bullets\":[\"Короткий подзаголовок из учебника.\"]}]}",
  "Ответ — только этот JSON, без пояснений вокруг.",
].join("\n");

function sanitizeSlides(parsed, hits, topic) {
  const slides = [];
  for (const raw of parsed.slides || []) {
    const layout = raw.layout === "table" || raw.layout === "bars" || raw.layout === "cover" || raw.layout === "quote" ? raw.layout : "text";
    const title = clean(raw.title, 80);
    if (title.length < 3) continue;
    if (layout === "table") {
      const rows = [];
      for (const row of Array.isArray(raw.rows) ? raw.rows : []) {
        const thesis = clean(row?.[0], 48);
        const text = clean(row?.[1], 140);
        const placed = placePage({ q: `${thesis} ${text}`, page: row?.[2] }, hits);
        if (!thesis || !text || !placed) continue;
        rows.push([thesis, text, placed.page]);
      }
      if (rows.length >= 2) slides.push({ layout: "table", title, headers: ["О чём речь", "Формулировка", "Стр."], rows: rows.slice(0, 6) });
    } else if (layout === "bars") {
      const series = [];
      for (const item of Array.isArray(raw.series) ? raw.series : []) {
        const year = Number(String(item?.value ?? item?.label ?? "").match(/1[0-9]{3}|20[0-9]{2}/)?.[0]);
        const label = clean(item?.label, 60);
        const placed = placePage({ q: label, page: item?.page }, hits);
        const pageText = hits.find((hit) => String(hit.chunk.page) === placed?.page)?.chunk.text || "";
        if (!year || !label || !placed || !pageText.includes(String(year))) continue;
        series.push({ label, value: year });
      }
      if (series.length >= 3) slides.push({ layout: "bars", title, series: series.slice(0, 6) });
    } else {
      const page = Array.isArray(raw.page) ? raw.page[0] : raw.page;
      const lines = raw.bullets ?? raw.content ?? raw.text ?? [];
      const bullets = (Array.isArray(lines) ? lines : String(lines).split(/\n+/))
        .map((line) => clean(line, 320))
        .filter((line) => line.length > 12 && !/^layout\b/i.test(line));
      const placed = placePage({ q: [title, ...bullets].join(" "), page }, hits);
      if (!placed || !bullets.length) continue;
      const source = `${placed.book ? placed.book + ", " : ""}с. ${placed.page}`;
      const kind = layout === "cover" || layout === "quote" ? layout : "text";
      slides.push({ layout: kind, title, bullets: [...bullets.slice(0, kind === "text" ? 3 : 1), source] });
    }
  }
  const prose = slides.filter((slide) => slide.layout === "text" || slide.layout === "cover" || slide.layout === "quote");
  if (prose.length < 2 || !prose.some((slide) => slide.layout === "text")) return null;
  return { kind: "presentation", topic, slides: slides.slice(0, 9) };
}

function slidePrompt(topic, hits, again) {
  const pages = [...new Set(hits.map((h) => h.chunk.page))].join(", ");
  const retry = again ? `Прошлый набор слайдов отклонён: факты не совпали со страницами ${pages}. Составь заново.\n` : "";
  return `${retry}Тема: ${topic}\nДопустимые страницы: ${pages}\n\nФрагменты:\n${contextFrom(hits)}`;
}

async function writeSlides(topic, hits) {
  if (!status().ready) return null;
  for (const again of [false, true]) {
    try {
      const reply = await chatSlides([
        { role: "system", content: SYSTEM_SLIDES },
        { role: "user", content: slidePrompt(topic, hits, again) },
      ]);
      const deck = sanitizeSlides(parseJson(reply.text), hits, topic);
      if (deck) return { ...deck, engine: reply.model || "" };
    } catch {
      if (again) return null;
    }
  }
  return null;
}

module.exports = { expandQueries, writeTest, sanitizeTest, writeSlides, sanitizeSlides };
