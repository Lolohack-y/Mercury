const { chat, status } = require("./ai");

function parseJson(raw) {
  const text = String(raw || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Модель не вернула JSON");
  return JSON.parse(body.slice(start, end + 1));
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

function sanitizeTest(parsed, hits, topic, count = 8) {
  const pages = new Map(hits.map((h) => [String(h.chunk.page), h.chunk.bookTitle]));
  const items = [];
  const seen = new Set();
  for (const raw of parsed.items || []) {
    const page = String(raw.page ?? "").replace(/\D/g, "");
    if (!pages.has(page)) continue;
    const q = clean(raw.q, 400);
    if (q.length < 12 || seen.has(q)) continue;
    if (/_{2,}|пропущенн|вставьте|продолжите|закончите|допишите/i.test(q)) continue;
    const type = KINDS[raw.type] ? raw.type : "choice";
    const base = { type, kind: KINDS[type], q, page, book: pages.get(page), points: POINTS[type], hint: clean(raw.hint, 280) };
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
        const answer = Number(raw.answer);
        if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) continue;
        items.push({ ...base, options, answer });
      } else if (type === "multi") {
        const answer = [...new Set((Array.isArray(raw.answer) ? raw.answer : []).map(Number))].filter((n) => Number.isInteger(n) && n >= 0 && n < options.length);
        if (!answer.length || answer.length === options.length) continue;
        items.push({ ...base, options, answer: answer.sort((a, b) => a - b) });
      } else {
        const answer = (Array.isArray(raw.answer) ? raw.answer : []).map(Number);
        const valid = answer.length === options.length && new Set(answer).size === options.length && answer.every((n) => Number.isInteger(n) && n >= 0 && n < options.length);
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

async function writeTest(topic, hits, count = 8) {
  const info = status();
  if (!info.ready) return null;
  const raw = await chat([
    { role: "system", content: SYSTEM_TEST },
    { role: "user", content: `Тема: ${topic}\nЧисло заданий: ${count}\n\nФрагменты:\n${contextFrom(hits)}` },
  ]);
  return sanitizeTest(parseJson(raw), hits, topic, count);
}

module.exports = { expandQueries, writeTest, sanitizeTest };
