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

function sanitizeTest(parsed, hits, topic) {
  const pages = new Set(hits.map((h) => String(h.chunk.page)));
  const items = [];
  for (const raw of parsed.items || []) {
    const page = String(raw.page ?? "").trim();
    if (!pages.has(page)) continue;
    const q = String(raw.q || "").replace(/\s+/g, " ").trim();
    if (q.length < 12 || /_{3,}|пропущенн/.test(q.toLowerCase())) continue;
    const type = raw.type === "judge" || raw.type === "open" ? raw.type : "choice";
    if (type === "open") {
      const sample = String(raw.sample || "").trim();
      if (!sample) continue;
      items.push({
        type,
        q: q.slice(0, 400),
        options: [],
        answer: null,
        sample: sample.slice(0, 500),
        page,
        hint: String(raw.hint || "Образец — фраза учебника.").slice(0, 240),
      });
      continue;
    }
    const options = (raw.options || []).map((o) => String(o).trim()).filter(Boolean).slice(0, 4);
    const answer = Number(raw.answer);
    if (options.length < 2 || !Number.isInteger(answer) || answer < 0 || answer >= options.length) continue;
    items.push({
      type,
      q: q.slice(0, 400),
      options,
      answer,
      page,
      hint: String(raw.hint || "").slice(0, 240),
    });
  }
  if (items.length < 4) return null;
  return { kind: "test", topic, items: items.slice(0, 8), model: true };
}

async function writeTest(topic, hits) {
  const info = status();
  if (!info.ready) return null;
  const raw = await chat([
    {
      role: "system",
      content:
        "Ты составляешь проверочную работу для 5–11 класса только по фрагментам учебника. Нельзя добавлять факты, которых нет во фрагментах. Нельзя делать задания «вставьте пропущенное слово». Нужны 6–8 заданий трёх видов: choice (4 полных утверждения, одно с указанной страницы), judge (верно ли, что цитата есть на этой странице: варианты «Да, так написано на этой странице» и «Нет, это положение с другого места учебника»), open (краткий пересказ, в sample — дословная фраза учебника). Поле page копируй из метки фрагмента. answer — номер верного варианта с нуля. Ответ — только JSON {\"items\":[...]} без пояснений вокруг.",
    },
    {
      role: "user",
      content: `Тема: ${topic}\n\nФрагменты:\n${contextFrom(hits)}`,
    },
  ]);
  return sanitizeTest(parseJson(raw), hits, topic);
}

module.exports = { expandQueries, writeTest };
