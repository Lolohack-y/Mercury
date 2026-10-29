const store = require("./store");
const { search } = require("./search");
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
      excerpt: h.chunk.text.slice(0, 200),
    });
  }
  return byPub;
}

async function ask({ query, type = "all", bookIds, grade, subject, skipCache } = {}) {
  if (!query || String(query).trim().length < 2) {
    throw fail(400, "Укажите тему, например: «фотосинтез, световая фаза»");
  }
  const state = store.getState();
  const model = status();
  const key = store.cacheKey({ query, type, bookIds, grade, subject, ai: model.ready ? model.provider : "off" });
  if (!skipCache && state.cache[key]) {
    return { ...state.cache[key], cached: true };
  }
  const searchOpts = { bookIds: bookIds?.length ? bookIds : undefined, topK: 8 };
  const hits = search(state.chunks, `${query} ${subject || ""} ${grade || ""}`, searchOpts);
  const lookups = await expandQueries(query, grade);
  const seen = new Set(hits.map((h) => h.chunk.id));
  for (const phrase of lookups) {
    for (const hit of search(state.chunks, phrase, searchOpts)) {
      if (seen.has(hit.chunk.id)) continue;
      seen.add(hit.chunk.id);
      hits.push(hit);
    }
  }
  hits.sort((a, b) => b.score - a.score);
  if (!hits.length) {
    throw fail(
      404,
      "В загруженных учебниках не нашлось близких страниц. Уточните тему или загрузите нужный УМК."
    );
  }
  let pack = buildAll(query, hits.slice(0, 12), state.brand);
  pack.lookups = lookups;
  if (model.ready && (!type || type === "all" || type === "test")) {
    try {
      const test = await writeTest(query, hits.slice(0, 12));
      if (test) {
        pack.materials.test = test;
        pack.model = model.name;
        pack.llm = true;
      } else {
        pack.modelNote = `${model.name} не смогла собрать тест по этим страницам. Показан вариант из цитат учебника.`;
      }
    } catch (e) {
      pack.modelNote = `${model.name} не ответила: ${e.message || "ошибка связи"}. Тест собран из цитат учебника.`;
    }
  }
  const blob = JSON.stringify(pack.materials);
  pack.factCheck = factCheck(
    blob,
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
