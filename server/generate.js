const { lowerFirst, upperFirst, clip } = require("./text");
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
  return f.item ? upperFirst(clip(String(f.raw || f.text).replace(/[.;]+$/, ""), 56)).replace(/…$/, "") : titleOf(f.text);
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

function slides(topic, facts, brand) {
  const body = [
    { title: topic, bullets: [`По учебнику • ${brand.school}`, "Материал с указанием страниц"] },
    ...facts.slice(0, 6).map((f) => ({
      title: titleOfFact(f),
      bullets: [f.text, `Источник: ${f.book}, с. ${f.page}`],
    })),
    { title: "Проверьте по учебнику", bullets: facts.slice(0, 4).map((f) => `с. ${f.page}`) },
  ];
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
  const sources = hits.map(cite);
  return {
    topic,
    sources,
    materials: {
      scheme: scheme(topic, facts),
      table: table(topic, facts),
      cards: cards(topic, facts),
      infographic: infographic(topic, facts),
      presentation: slides(topic, facts, brand),
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
