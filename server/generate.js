const store = require("./store");
const { lowerFirst, upperFirst, clip, splitSentences } = require("./text");
const { buildQuiz, pageKey } = require("./quiz");

function cite(hit) {
  return {
    bookId: hit.chunk.bookId,
    bookTitle: hit.chunk.bookTitle,
    publisher: hit.chunk.publisher,
    page: hit.chunk.page,
    section: hit.section || "",
    score: hit.relevance ?? Math.round(hit.score * 100) / 100,
    excerpt: hit.excerpt || hit.chunk.text.slice(0, 280),
    marks: hit.marks || [],
    passages: (hit.best || [])
      .filter((b) => !b.ctx)
      .slice(0, 3)
      .map((b) => b.text),
  };
}

// Предложения, которые лучше всего отвечают на запрос, в порядке учебника.
function strongHits(hits, minRel = 0.3) {
  const strong = hits.filter((h) => (h.relevance ?? 1) >= minRel);
  return strong.length ? strong : hits.slice(0, 1);
}

function factsFromHits(hits, { limit = 16, minRel = 0.3 } = {}) {
  const bookRank = new Map();
  hits.forEach((h, i) => {
    if (!bookRank.has(h.chunk.bookId)) bookRank.set(h.chunk.bookId, i);
  });
  const used = strongHits(hits, minRel);
  const out = [];
  for (const h of used) {
    const max = Math.max(...(h.best || []).map((b) => b.score), 0.0001);
    for (const b of h.best || []) {
      const body = b.lead ? `${b.lead}: ${lowerFirst(b.text)}` : b.text;
      out.push({
        text: body,
        raw: b.text,
        lead: b.lead || "",
        item: b.item || 0,
        idx: b.idx,
        page: h.chunk.page,
        book: h.chunk.bookTitle,
        bookId: h.chunk.bookId,
        w: Math.min(1, b.score / max) * (b.ctx ? 0.6 : 1) * (h.relevance ?? 1),
      });
    }
  }
  const top = out
    .slice()
    .sort((a, b) => b.w - a.w)
    .slice(0, limit);
  return top.sort(
    (a, b) =>
      (bookRank.get(a.bookId) ?? 0) - (bookRank.get(b.bookId) ?? 0) || Number(a.page) - Number(b.page) || a.idx - b.idx
  );
}

// Короткое название для узла схемы, карточки или слайда.
const SUBJECT_END =
  /^(.{6,50}?)\s+(?:не\s+)?(?:[а-яё]+(?:ется|ются|ится|ятся)|идёт|идет|протекает|происходит|обеспечивает|лежит|содержит|является|состоит|нужен|нужна|нужны|показал|разделил|перешла)(?=[\s,.;])/;
const DATE_HEAD = "(?:[Вв]\\s+)?(\\d{1,2}\\s+[а-яё]+(?:\\s+\\d{3,4}\\s*(?:года|г\\.))?|\\d{3,4}\\s*(?:года|году|год|г\\.))";

function titleOf(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  const dated = new RegExp(`^${DATE_HEAD}\\s*[—–-]\\s*(.+)$`).exec(t);
  if (dated) return upperFirst(clip(dated[2].replace(/[.;]+$/, ""), 56)).replace(/…$/, "");
  const datedLead = new RegExp(`^${DATE_HEAD}\\s+`).exec(t);
  if (datedLead) return datedLead[1];
  const dash = /^([^—–:]{3,46}?)\s*(?:[—–]|:)\s/.exec(t);
  if (dash && !/\d{3,4}/.test(dash[1])) return upperFirst(dash[1].trim());
  const subject = SUBJECT_END.exec(t);
  if (subject && !/^(процесс|он|она|оно|они|это|явление)$/i.test(subject[1].trim())) return upperFirst(subject[1].trim());
  const clause = t.split(/[,;.]/)[0];
  return upperFirst(clip(clause, 56)).replace(/…$/, "");
}

// Для пункта списка название — сам пункт, а не общий заголовок списка.
function titleOfFact(f) {
  if (f.item) return upperFirst(clip(String(f.raw || f.text).replace(/[.;]+$/, ""), 56)).replace(/…$/, "");
  if (f.kind) return statementTitle(f.text);
  return titleOf(f.text);
}

const DANGLING = /^(хотя|бы|при|или|то|не|его|её|ее|один|если|что|как|это|для|по|об|от|до|из|на|со|во)$/i;
const SPLIT_OK = new Set("и в во не на с со как а то он она так но да ты к у же вы за бы по от из о до ни же ли бы то же".split(" "));

function brokenSplit(text) {
  const parts = String(text || "")
    .toLowerCase()
    .split(/[^а-яё]+/)
    .filter(Boolean);
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (parts[i].length >= 2 && parts[i].length <= 3 && parts[i + 1].length >= 2 && parts[i + 1].length <= 3 && !SPLIT_OK.has(parts[i]) && !SPLIT_OK.has(parts[i + 1])) return true;
  }
  return false;
}

function classifyStatement(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length < 40 || brokenSplit(t)) return "junk";
  if (/\?$/.test(t) || /[.]{4,}/.test(t)) return "junk";
  if (/^вы(?=\s)/i.test(t)) return "junk";
  if (/^(найдите|решите|докажите|упростите|постройте|выпишите|приведите|напишите|является ли|верно ли)(?=\s)/i.test(t)) return "junk";
  if (/называ(?:ют|ется)/i.test(t) || /^если(?=\s)[\s\S]{12,}\sто(?=\s)/i.test(t)) return "def";
  if (/^(в этой главе|в этом параграфе|отсюда|такие|например|заметим|рассмотрим|вообще|следовательно|значит|затем|ответ)(?=\s|,)/i.test(t)) return "junk";
  if (/^[=\d(]/.test(t) && !/[а-яё]{6,}/i.test(t.slice(0, 40))) return "junk";
  return "ok";
}

function statementTitle(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  const called = /называ(?:ют|ется)(?:\s+ещё)?\s+([^.,;]{3,70})/i.exec(t);
  if (called) return upperFirst(called[1].trim());
  const via = titleOf(t);
  if (via && via.length >= 3 && !DANGLING.test(via.split(" ").pop())) return via;
  const words = t.replace(/[.;:]+$/, "").split(" ");
  let n = Math.min(5, words.length);
  while (n > 2 && DANGLING.test(words[n - 1])) n -= 1;
  return upperFirst(words.slice(0, n).join(" "));
}

function teachFacts(hits, limit = 8) {
  const pool = [];
  const pages = [];
  const seenPages = new Set();
  const all = store.getState().chunks;
  for (const hit of hits.slice(0, 1)) {
    for (const delta of [0, 1, -1]) {
      const page = Number(hit.chunk.page) + delta;
      const key = `${hit.chunk.bookId}:${page}`;
      if (seenPages.has(key)) continue;
      seenPages.add(key);
      const chunk = delta === 0 ? hit.chunk : all.find((item) => item.bookId === hit.chunk.bookId && Number(item.page) === page);
      if (chunk) pages.push({ chunk, neighbor: delta !== 0 });
    }
  }
  for (const hit of hits) {
    const key = `${hit.chunk.bookId}:${hit.chunk.page}`;
    if (seenPages.has(key)) continue;
    seenPages.add(key);
    pages.push({ chunk: hit.chunk, neighbor: false });
  }
  for (const { chunk, neighbor } of pages) {
    for (const sentence of splitSentences(chunk.text)) {
      const text = String(sentence.text || "").replace(/\s+/g, " ").trim();
      const kind = classifyStatement(text);
      if (kind === "junk" || (neighbor && !/называется/i.test(text))) continue;
      pool.push({
        text,
        raw: text,
        lead: "",
        item: 0,
        idx: sentence.idx,
        page: chunk.page,
        book: chunk.bookTitle,
        bookId: chunk.bookId,
        kind,
      });
    }
  }
  const rank = (fact) => {
    if (/называется/i.test(fact.text)) return 0;
    if (fact.kind === "def" && !/^такие(?=\s)/i.test(fact.text)) return 1;
    if (fact.kind === "def") return 2;
    return 3;
  };
  pool.sort((a, b) => rank(a) - rank(b) || Number(a.page) - Number(b.page) || a.idx - b.idx);
  const chosen = [];
  const seen = new Set();
  for (const fact of pool) {
    const key = fact.text.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, " ").split(" ").slice(0, 7).join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    chosen.push(fact);
    if (chosen.length >= limit) break;
  }
  return chosen;
}

function scheme(topic, facts) {
  const nodes = facts.slice(0, 6).map((f, i) => ({
    id: `n${i + 1}`,
    title: titleOfFact(f),
    body: clip(f.text, 160),
    page: f.page,
  }));
  if (!nodes.length) nodes.push({ id: "n1", title: topic, body: "Недостаточно фрагментов учебника", page: "—" });
  return { kind: "scheme", topic, nodes };
}

function table(topic, facts) {
  return {
    kind: "table",
    topic,
    headers: ["Положение учебника", "УМК / страница"],
    rows: facts.slice(0, 10).map((f) => [f.text, `${f.book}, с. ${f.page}`]),
  };
}

function cards(topic, facts) {
  return {
    kind: "cards",
    topic,
    items: facts.slice(0, 8).map((f, i) => {
      const text = f.raw || f.text;
      const def = /^([^—–:\d]{3,46}?)\s+[—–]\s+(?:это\s+)?(.{30,})$/.exec(text);
      const date = new RegExp(`^${DATE_HEAD}\\s*[—–,-]?\\s*(.{8,})$`).exec(text);
      let front = titleOfFact(f);
      let back = f.text;
      if (def && def[1].trim().split(/\s+/).length <= 3) {
        front = `Что такое ${lowerFirst(def[1].trim())}?`;
        back = upperFirst(def[2].trim());
      } else if (date) {
        front = `Что произошло: ${date[1]}?`;
        back = upperFirst(date[2].trim());
      }
      return { n: i + 1, front, back, page: f.page };
    }),
  };
}

function infographic(topic, facts) {
  return {
    kind: "infographic",
    topic,
    steps: facts.slice(0, 5).map((f, i) => ({
      n: i + 1,
      title: titleOfFact(f) || `Шаг ${i + 1}`,
      text: clip(f.text, 180),
      page: f.page,
    })),
  };
}

function yearOf(text) {
  const m = String(text || "").match(/(?:^|[^\d])((?:1[0-9]{3}|20[0-9]{2}))(?:\s*(?:года|году|год|г\.))?(?!\d)/);
  return m ? Number(m[1]) : 0;
}

function slides(topic, facts, brand) {
  const list = facts.slice(0, 8);
  const body = [
    {
      layout: "text",
      title: topic,
      bullets: [
        list[0] ? clip(list[0].text, 280) : "Фрагменты по теме не найдены.",
        list[1] ? clip(list[1].text, 220) : "",
        `${brand.school || "Наглядность+"}. ${list.length} положений из учебника, у каждого есть страница.`,
      ].filter(Boolean),
    },
  ];
  for (const f of list.slice(0, 5)) {
    body.push({
      layout: "text",
      title: titleOfFact(f),
      bullets: [clip(f.text, 320), f.lead ? `Контекст: ${clip(f.lead, 120)}` : "", `${f.book}, с. ${f.page}`].filter(Boolean),
    });
  }
  if (list.length >= 3) {
    body.push({
      layout: "table",
      title: "Сводка по учебнику",
      headers: ["О чём речь", "Формулировка", "Стр."],
      rows: list.slice(0, 6).map((f) => [clip(titleOfFact(f), 40), clip(f.text, 90), String(f.page)]),
    });
  }
  const timeline = [];
  const seen = new Set();
  for (const f of facts) {
    const year = yearOf(f.raw || f.text);
    if (!year) continue;
    const label = `${year}. ${clip(titleOfFact(f), 42)}`;
    if (seen.has(label)) continue;
    seen.add(label);
    timeline.push({ label, value: year });
  }
  timeline.sort((a, b) => a.value - b.value);
  if (timeline.length >= 3) {
    body.push({ layout: "bars", title: "Хронология по учебнику", series: timeline.slice(0, 6) });
  }
  body.push({
    layout: "text",
    title: "Что сверить в учебнике",
    bullets: list.slice(0, 5).map((f) => `с. ${f.page}. ${clip(f.text, 140)}`),
  });
  return { kind: "presentation", topic, slides: body };
}

function pageRelOf(used) {
  return new Map(used.map((h) => [pageKey({ bookId: h.chunk.bookId, page: h.chunk.page }), Math.max(h.relevance ?? 1, 0.3)]));
}

function tests(topic, hits, facts, { bank = [], count = 8, variant = 0 } = {}) {
  const sec = (strongHits(hits).find((h) => h.section) || {}).section || "";
  const title = sec.replace(/^§\s*\d+\.?\s*/, "") || upperFirst(topic);
  let quiz = buildQuiz({ topic: title, facts, bank, pageRel: pageRelOf(strongHits(hits)), count, variant });
  const variety = (q) => q.items.filter((it) => it.type !== "judge" && it.type !== "open").length * 2 + Object.keys(q.stats).length;
  if ((quiz.items.length < count || variety(quiz) < count) && strongHits(hits).length < hits.length) {
    // тема шире найденного: добираем задания с менее близких страниц
    const wide = factsFromHits(hits, { limit: 30, minRel: 0.1 });
    const more = buildQuiz({ topic: title, facts: wide, bank, pageRel: pageRelOf(hits), count, variant });
    if (more.items.length >= quiz.items.length && variety(more) > variety(quiz)) quiz = more;
  }
  return quiz;
}

function buildAll(topic, hits, brand, opts = {}) {
  const facts = factsFromHits(hits);
  const taught = teachFacts(hits);
  const sources = hits.map(cite);
  return {
    topic,
    sources,
    materials: {
      scheme: scheme(topic, taught.length ? taught : facts),
      table: table(topic, taught.length ? taught : facts),
      cards: cards(topic, taught.length ? taught : facts),
      infographic: infographic(topic, taught.length ? taught : facts),
      test: tests(topic, hits, facts, opts),
    },
  };
}

function applyEdit(pack, instruction) {
  const text = String(instruction || "").toLowerCase();
  const extra = instruction.replace(/^.*?:\s*/i, "").trim() || instruction;
  if (pack.materials?.scheme?.nodes) {
    pack.materials.scheme.nodes.push({
      id: `n${pack.materials.scheme.nodes.length + 1}`,
      title: extra.slice(0, 48) || "Дополнение учителя",
      body: extra,
      page: "правка",
    });
  }
  if (pack.materials?.presentation?.slides) {
    pack.materials.presentation.slides.splice(-1, 0, {
      title: extra.slice(0, 60) || "Дополнение",
      bullets: [extra, text.includes("свет") ? "Связано со световой фазой / уточнением темы" : "Правка без переиндексации"],
    });
  }
  pack.editLog = pack.editLog || [];
  pack.editLog.push({ at: new Date().toISOString(), instruction });
  return pack;
}

module.exports = { buildAll, applyEdit, factsFromHits };
