const store = require("./store");
const { searchDetailed, sentenceBank } = require("./search");
const { buildAll, applyEdit } = require("./generate");
const { factCheck } = require("./factcheck");
const { status } = require("./ai");
const { expandQueries, writeTest } = require("./llm");

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function comparePublishers(hits) {
  const byPub = {};
  for (const h of hits) {
    const p = h.chunk.publisher || "УМК";
    byPub[p] = byPub[p] || [];
    byPub[p].push({
      page: h.chunk.page,
      title: h.chunk.bookTitle,
      excerpt: (h.excerpt || h.chunk.text).slice(0, 200),
    });
  }
  return byPub;
}

const SKIP_KEYS = new Set(["id", "n", "page", "kind", "type", "answer", "points", "score", "topic", "marks", "passages", "section"]);

// Только текст материалов: номера страниц и служебные поля в проверку цифр не входят.
function collectText(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectText(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) if (!SKIP_KEYS.has(k)) collectText(v, out);
  }
  return out;
}

function cleanRefs(text) {
  return text.replace(/(?:Источник:\s*)?[^\n,]*,\s*с\.\s*\d+/g, " ").replace(/(?<![А-Яа-яЁё])с\.\s*\d+(?:[–-]\d+)?/g, " ");
}

// В проверку попадает только то, что учебник действительно утверждает:
// заведомо неверные варианты теста в неё не входят.
function testTruth(test) {
  if (!test?.items) return [];
  const parts = [];
  for (const it of test.items) {
    if (it.type === "judge") {
      if (it.answer === 0) parts.push(it.q);
      continue;
    }
    parts.push(it.q);
    if (it.type === "choice") parts.push(it.options[it.answer]);
    else if (it.type === "multi") parts.push(...it.answer.map((i) => it.options[i]));
    else if (it.type === "match") parts.push(...(it.left || []), ...(it.right || []));
    else if (it.type === "order") parts.push(...(it.options || []));
    else if (it.type === "open") parts.push(it.sample || "");
  }
  return parts;
}

async function ask({ query, type = "all", bookIds, grade, subject, skipCache, count } = {}) {
  if (!query || String(query).trim().length < 2) {
    throw fail(400, "Укажите тему, например: «фотосинтез, световая фаза»");
  }
  const size = Math.max(4, Math.min(15, Number(count) || 8));
  const state = store.getState();
  const model = status();
  const key = store.cacheKey({ query, type, bookIds, grade, subject, count: size, ai: model.ready ? model.provider : "off" });
  if (!skipCache && state.cache[key]) {
    return { ...state.cache[key], cached: true };
  }
  const prefer = new Set(
    (state.books || [])
      .filter((b) => (grade && String(b.grade) === String(grade)) || (subject && String(b.subject || "").toLowerCase() === String(subject).toLowerCase()))
      .map((b) => b.id)
  );
  const searchOpts = { bookIds: bookIds?.length ? bookIds : undefined, topK: 8, preferBooks: prefer.size ? prefer : undefined };
  const first = searchDetailed(state.chunks, query, searchOpts);
  const hits = first.hits.slice();
  const lookups = await expandQueries(query, grade);
  const seen = new Set(hits.map((h) => h.chunk.id));
  for (const phrase of lookups) {
    for (const hit of searchDetailed(state.chunks, phrase, searchOpts).hits) {
      if (seen.has(hit.chunk.id)) continue;
      seen.add(hit.chunk.id);
      hits.push({ ...hit, relevance: Math.round(hit.relevance * 0.8 * 100) / 100 });
    }
  }
  hits.sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
  if (!hits.length) {
    const unknown = first.meta.unknown;
    throw fail(
      404,
      unknown.length
        ? `В выбранных учебниках нет слов: ${unknown.map((w) => `«${w}»`).join(", ")}. Проверьте написание, попробуйте другой термин или загрузите нужный учебник.`
        : "В загруженных учебниках не нашлось близких страниц. Уточните тему или загрузите нужный УМК."
    );
  }
  const bank = sentenceBank(state.chunks, searchOpts.bookIds);
  const pack = buildAll(query, hits.slice(0, 10), state.brand, { bank, count: size, variant: skipCache ? Date.now() : 0 });
  pack.lookups = lookups;
  pack.search = {
    quality: hits[0].relevance ?? 1,
    unknown: first.meta.unknown,
    fixes: first.meta.terms.filter((t) => t.via === "typo" && t.suggestion).map((t) => ({ raw: t.raw, suggestion: t.suggestion })),
    forms: first.meta.terms.filter((t) => t.via === "form").map((t) => t.raw),
  };
  if (model.ready && (!type || type === "all" || type === "test")) {
    try {
      const test = await writeTest(query, hits.slice(0, 10), size);
      if (test) {
        pack.materials.test = test;
        pack.model = model.name;
        pack.llm = true;
      } else {
        pack.modelNote = `${model.name} не смогла собрать тест по этим страницам. Показан вариант, собранный из текста учебника.`;
      }
    } catch (e) {
      pack.modelNote = `${model.name} не ответила: ${e.message || "ошибка связи"}. Тест собран из текста учебника.`;
    }
  }
  const { test, ...rest } = pack.materials;
  pack.factCheck = factCheck(
    cleanRefs([...collectText(rest), ...testTruth(test)].join("\n")),
    hits.map((h) => h.chunk)
  );
  pack.brand = state.brand;
  pack.generatedAt = new Date().toISOString();
  pack.compare = comparePublishers(hits);
  if (type !== "all" && pack.materials[type]) {
    pack.materials = { [type]: pack.materials[type] };
  }
  const cache = store.getState().cache;
  cache[key] = pack;
  store.saveCache(cache);
  return { ...pack, cached: false };
}

function editPack(pack, instruction) {
  if (!pack || !instruction) throw fail(400, "Нужны материалы и текст правки");
  return applyEdit(JSON.parse(JSON.stringify(pack)), instruction);
}

module.exports = { ask, editPack };
