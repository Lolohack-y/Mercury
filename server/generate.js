function sentences(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25);
}

function cite(hit) {
  return {
    bookId: hit.chunk.bookId,
    bookTitle: hit.chunk.bookTitle,
    publisher: hit.chunk.publisher,
    page: hit.chunk.page,
    score: Math.round(hit.score * 100) / 100,
    excerpt: hit.chunk.text.slice(0, 280),
  };
}

function factsFromHits(hits) {
  const out = [];
  for (const h of hits) {
    for (const s of sentences(h.chunk.text).slice(0, 6)) {
      out.push({ text: s, page: h.chunk.page, book: h.chunk.bookTitle });
    }
  }
  return out.slice(0, 18);
}

function scheme(topic, facts) {
  const nodes = facts.slice(0, 6).map((f, i) => ({
    id: `n${i + 1}`,
    title: f.text.split(/[.,;:]/)[0].slice(0, 48),
    body: f.text.slice(0, 140),
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
    items: facts.slice(0, 8).map((f, i) => ({
      n: i + 1,
      front: f.text.split(/[.,;:]/)[0].slice(0, 70),
      back: f.text,
      page: f.page,
    })),
  };
}

function infographic(topic, facts) {
  return {
    kind: "infographic",
    topic,
    steps: facts.slice(0, 5).map((f, i) => ({
      n: i + 1,
      title: `Шаг ${i + 1}`,
      text: f.text.slice(0, 180),
      page: f.page,
    })),
  };
}

function slides(topic, facts, brand) {
  const body = [
    { title: topic, bullets: [`По учебнику • ${brand.school}`, "Материал с указанием страниц"] },
    ...facts.slice(0, 6).map((f) => ({
      title: f.text.split(/[.,;:]/)[0].slice(0, 60),
      bullets: [f.text, `Источник: ${f.book}, с. ${f.page}`],
    })),
    { title: "Проверьте по учебнику", bullets: facts.slice(0, 4).map((f) => `с. ${f.page}`) },
  ];
  return { kind: "presentation", topic, slides: body };
}

function clip(text, n) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trim()}…` : t;
}

function hashSeed(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function shuffle(list, seed) {
  const arr = list.slice();
  let x = seed || 1;
  for (let i = arr.length - 1; i > 0; i--) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    const j = x % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function otherFacts(facts, fact) {
  return facts.filter((x) => x !== fact && x.text !== fact.text);
}

function continuation(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const parts = clean.split(/[,:;]\s+/);
  if (parts.length >= 2 && parts[0].length >= 24 && parts.slice(1).join(", ").length >= 24) {
    return { stem: parts[0], ending: parts.slice(1).join(", ") };
  }
  const words = clean.split(" ");
  if (words.length < 10) return null;
  const mid = Math.max(4, Math.ceil(words.length * 0.4));
  return { stem: words.slice(0, mid).join(" "), ending: words.slice(mid).join(" ") };
}

function choiceItem(q, options, answer, fact, hint) {
  return {
    type: "choice",
    q,
    options,
    answer,
    page: fact.page,
    book: fact.book,
    hint,
  };
}

function tests(topic, facts) {
  const pool = facts.filter((f) => f.text && f.text.length > 40);
  const items = [];

  pool.forEach((fact, index) => {
    if (items.length >= 2) return;
    const others = otherFacts(pool, fact);
    const samePage = others.filter((x) => String(x.page) !== String(fact.page));
    const distractorSource = samePage.length >= 2 ? samePage : others;
    if (distractorSource.length < 2) return;
    const options = shuffle(
      [
        { text: clip(fact.text, 220), ok: true },
        ...distractorSource.slice(0, 3).map((x) => ({ text: clip(x.text, 220), ok: false })),
      ],
      hashSeed(`${fact.text}|page|${index}`)
    ).slice(0, 4);
    if (!options.some((o) => o.ok)) return;
    items.push(
      choiceItem(
        `Какое утверждение учебник приводит на с. ${fact.page}?`,
        options.map((o) => o.text),
        options.findIndex((o) => o.ok),
        fact,
        "Остальные варианты взяты с других мест учебника."
      )
    );
  });

  pool.forEach((fact, index) => {
    if (items.filter((it) => it.type === "choice" && it.q.startsWith("Как учебник")).length >= 2) return;
    const split = continuation(fact.text);
    const others = otherFacts(pool, fact)
      .map((x) => continuation(x.text)?.ending)
      .filter((ending) => ending && ending !== split?.ending);
    if (!split || others.length < 2) return;
    const options = shuffle(
      [{ text: clip(split.ending, 180), ok: true }, ...others.slice(0, 3).map((text) => ({ text: clip(text, 180), ok: false }))],
      hashSeed(`${fact.text}|end|${index}`)
    ).slice(0, 4);
    items.push(
      choiceItem(
        `Как учебник продолжает эту мысль: «${clip(split.stem, 120)}…»?`,
        options.map((o) => o.text),
        options.findIndex((o) => o.ok),
        fact,
        "Нужно выбрать окончание именно этой фразы, а не соседний факт."
      )
    );
  });

  pool.forEach((fact, index) => {
    if (items.filter((it) => it.type === "judge").length >= 2) return;
    const others = otherFacts(pool, fact).filter((x) => String(x.page) !== String(fact.page));
    if (!others.length) return;
    const truthful = index % 2 === 0;
    const quoted = truthful ? fact : others[index % others.length];
    const options = ["Да, так написано на этой странице", "Нет, это положение с другого места учебника"];
    items.push({
      type: "judge",
      q: `Верно ли, что на с. ${fact.page} учебник говорит: «${clip(quoted.text, 200)}»?`,
      options,
      answer: truthful ? 0 : 1,
      page: fact.page,
      book: fact.book,
      hint: truthful
        ? `Формулировка есть на с. ${fact.page}.`
        : `Эта формулировка относится к с. ${quoted.page}, а не к с. ${fact.page}.`,
    });
  });

  pool.slice(0, 2).forEach((fact) => {
    items.push({
      type: "open",
      q: `Кратко перескажите положение учебника со с. ${fact.page}. Опирайтесь только на текст параграфа, без сведений из других источников.`,
      options: [],
      answer: null,
      sample: fact.text,
      page: fact.page,
      book: fact.book,
      hint: "Образец — фраза учебника. Ученик может сказать то же другими словами.",
    });
  });

  if (!items.length && pool[0]) {
    items.push({
      type: "open",
      q: `Что учебник сообщает по теме «${topic}» на с. ${pool[0].page}?`,
      options: [],
      answer: null,
      sample: pool[0].text,
      page: pool[0].page,
      book: pool[0].book,
      hint: "В найденном фрагменте мало соседних формулировок для вариантов ответа.",
    });
  }

  return { kind: "test", topic, items: items.slice(0, 8) };
}

function buildAll(topic, hits, brand) {
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
      test: tests(topic, facts),
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
