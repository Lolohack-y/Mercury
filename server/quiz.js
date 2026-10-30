// Генератор проверочных заданий по тексту учебника без нейросети.
// Задания строятся на найденных в тексте определениях, датах, местах, перечнях и утверждениях.
// Неверные варианты берутся из других мест тех же учебников, а не придумываются.

const { stems, lowerFirst, upperFirst, clip } = require("./text");

const MON = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const MON_RE = MON.join("|");
const YEAR = "\\d{3,4}";
const DATE_SRC = `(?:\\d{1,2}\\s+(?:${MON_RE})(?:\\s+${YEAR}\\s*(?:года|г\\.))?|(?:${MON_RE})\\s+${YEAR}\\s*года|${YEAR}\\s*(?:года|году|год|г\\.))`;
const DATE_DASH = new RegExp(`^(?:[Вв]\\s+)?(${DATE_SRC})\\s*[—–-]\\s*(.{8,})$`);
const DATE_LEAD = new RegExp(`^(?:[Вв]\\s+)?(${DATE_SRC})\\s*,?\\s+(.{12,})$`);
const DATE_ANY = new RegExp(`(?:[Вв]\\s+)?(${YEAR}\\s*(?:года|году|год|г\\.))`);

const GENERIC_SUBJECT = new Set(["процесс", "он", "она", "оно", "они", "это", "явление", "реакция", "результат", "вещество"]);
const PLACE_VERBS =
  "протекает|идёт|идет|происходит|находится|располагается|расположен[аоы]?|образуется|синтезируется|накапливается|хранится|проходит|обитает|встречается|вырабатывается|развивается";
const PLACE_RE = new RegExp(`^(.{6,80}?)\\s+(${PLACE_VERBS})\\s+((?:в|во|на|над|под|у|около|между)\\s+[^,.;:—]{3,70})`);
const DEF_RE = /^([А-ЯЁA-Z][^—–.:,]{1,58}?)\s+[—–]\s+(?:это\s+)?(.{30,})$/;
const PERSON_RE = /^(?:(?:[А-ЯЁ]\.\s?){1,2}[А-ЯЁ][а-яё-]+|[А-ЯЁ][а-яё]+(?:\s[А-ЯЁ][а-яё]+){1,2})$/;
const LABEL_LIST_RE = /^([А-ЯЁ][А-Яа-яЁё\s-]{2,40}):\s+(.+)$/;
const DANGLING = /^(Он|Она|Оно|Они|Это|Эти|Этот|Эта|Такой|Такая|Там|Тогда|Затем|Поэтому|Также|Однако|Но|Для этого)\b/;

const VERB_NEG = new RegExp(
  `(^|\\s)((?:[а-яё]{3,}(?:ется|ются|ится|ятся|утся|атся|ётся))|идёт|идет|протекает|происходит|обеспечивает|содержит|входит|участвует|выполняет|использует|нужен|нужна|нужны|нужно|требуется|зависит|состоит|превращается|фиксируется|образуется|выделяется|поглощается)(?=[\\s,.;])`
);
const SKIP_NEG = /^(является|являются|называется|называются|считается|считаются|может)$/;

function hashSeed(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function makeRand(seed) {
  let x = (seed >>> 0) || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

function shuffle(list, rand) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const keyOf = (s) => `${s.bookId}|${s.page}|${s.idx}`;
const pageKey = (s) => `${s.bookId}|${s.page}`;
const stripEnd = (t) => String(t || "").replace(/[.;:\s]+$/, "").trim();
const stemSet = (t) => new Set(stems(t));

function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / Math.min(a.size, b.size);
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / (a.size + b.size - n);
}

// ───────────── разбор текста ─────────────

function parseDate(str) {
  const s = str.toLowerCase();
  const year = Number((/\d{3,4}/.exec(s) || [])[0]) || 0;
  const dm = new RegExp(`(\\d{1,2})\\s+(${MON_RE})`).exec(s);
  const my = new RegExp(`(${MON_RE})\\s+\\d{3,4}`).exec(s);
  const month = dm ? MON.indexOf(dm[2]) + 1 : my ? MON.indexOf(my[1]) + 1 : 0;
  const day = dm ? Number(dm[1]) : 0;
  const label = day || month ? `${day ? `${day} ` : ""}${MON[month - 1]}${year ? ` ${year} года` : ""}` : `${year} год`;
  return { year, month, day, full: Boolean(day), label };
}

function tidy(text) {
  return text
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/^[\s,;:—–-]+/, "")
    .trim();
}

function extractDated(s) {
  const text = s.text;
  let m = DATE_DASH.exec(text) || DATE_LEAD.exec(text);
  if (m) {
    const event = stripEnd(m[2]);
    if (event.split(/\s+/).length < 2) return null;
    return { ...parseDate(m[1]), raw: m[1], event: upperFirst(event), lead: true, S: s };
  }
  m = DATE_ANY.exec(text);
  if (!m) return null;
  const rest = tidy(text.replace(m[0], " "));
  if (rest.length < 20 || /^[a-z0-9]/i.test(rest)) return null;
  return { ...parseDate(m[1]), raw: m[0], event: upperFirst(stripEnd(rest)), lead: false, S: s };
}

function extractDef(s) {
  const m = DEF_RE.exec(s.text);
  if (!m) return null;
  const term = m[1].trim();
  if (/\d/.test(term) || term.replace(/\(.*?\)/g, "").trim().split(/\s+/).length > 3) return null;
  return { term, def: stripEnd(m[2]), S: s };
}

function extractPerson(s) {
  const m = /^([А-ЯЁ][^—–.:,]{3,60}?)\s+[—–]\s+(.{4,40})$/.exec(s.text);
  if (!m) return null;
  const name = stripEnd(m[2]);
  if (!PERSON_RE.test(name)) return null;
  return { role: m[1].trim(), name, S: s };
}

function extractPlace(s) {
  const m = PLACE_RE.exec(s.text);
  if (!m) return null;
  const subject = m[1].trim();
  const first = subject.split(/\s+/)[0].toLowerCase();
  if (GENERIC_SUBJECT.has(first) && subject.split(/\s+/).length < 3) return null;
  if (subject.length < 8 || /^(В|На|Во|При)\s/.test(subject)) return null;
  return { subject, verb: m[2], phrase: stripEnd(m[3]), S: s };
}

function extractLabelList(s) {
  const m = LABEL_LIST_RE.exec(s.text);
  if (!m) return null;
  const items = m[2]
    .split(/\s*[,;]\s*/)
    .map(stripEnd)
    .filter(Boolean);
  if (items.length < 3 || items.some((i) => i.length > 48 || i.split(/\s+/).length > 6 || /[—–]/.test(i))) return null;
  return { label: m[1].trim(), items, keys: [keyOf(s)], S: s };
}

function extractKeyValue(s) {
  const m = /^([А-ЯЁ][А-Яа-яЁё\s-]{3,40}):\s+(.{4,160})$/.exec(s.text);
  if (!m || extractLabelList(s)) return null;
  return { label: m[1].trim(), value: stripEnd(m[2]), S: s };
}

function mine(bank) {
  const ents = { dated: [], defs: [], places: [], lists: [], persons: [], kvs: [] };
  const pages = new Map();
  for (const s of bank) {
    const k = pageKey(s);
    if (!pages.has(k)) pages.set(k, []);
    pages.get(k).push(s);
  }
  for (const sents of pages.values()) {
    sents.sort((a, b) => a.idx - b.idx);
    let yearCtx = 0;
    let group = null;
    for (const s of sents) {
      if (s.item) {
        if (!group || s.item === 1 || group.label !== s.lead) {
          group = { label: s.lead || "Перечень", items: [], keys: [], S: s, numbered: true };
          ents.lists.push(group);
        }
        group.items.push(stripEnd(s.text));
        group.keys.push(keyOf(s));
        continue;
      }
      group = null;
      const dated = extractDated(s);
      if (dated) {
        if (!dated.year && yearCtx) {
          dated.year = yearCtx;
          dated.label = `${dated.label} ${yearCtx} года`;
        } else if (dated.year) yearCtx = dated.year;
        ents.dated.push(dated);
        continue;
      }
      const person = extractPerson(s);
      if (person) {
        ents.persons.push(person);
        continue;
      }
      const def = extractDef(s);
      if (def) ents.defs.push(def);
      const place = extractPlace(s);
      if (place) ents.places.push(place);
      const list = extractLabelList(s);
      if (list) ents.lists.push(list);
      const kv = extractKeyValue(s);
      if (kv) ents.kvs.push(kv);
    }
  }
  return ents;
}

const sortKey = (d) => d.year * 10000 + d.month * 100 + d.day;

// ───────────── вспомогательные для вариантов ─────────────

function sameBookFirst(list, S, getS = (x) => x.S) {
  return [...list.filter((x) => getS(x).bookId === S.bookId), ...list.filter((x) => getS(x).bookId !== S.bookId)];
}

function uniqueTexts(list) {
  const seen = new Set();
  return list.filter((t) => {
    const k = t.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function choice({ kind, q, correct, wrong, rand, S, hint, sorter, min = 3, max = 4 }) {
  const wrongs = uniqueTexts(wrong).filter((t) => t.toLowerCase() !== correct.toLowerCase()).slice(0, max - 1);
  if (wrongs.length + 1 < min) return null;
  const all = sorter ? [correct, ...wrongs].sort(sorter) : shuffle([correct, ...wrongs], rand);
  return {
    type: "choice",
    kind,
    q,
    options: all,
    answer: all.indexOf(correct),
    points: 1,
    page: S.page,
    book: S.book,
    hint,
  };
}

function farYear(year, taken, rand) {
  for (let i = 0; i < 20; i++) {
    const shift = (Math.floor(rand() * 9) + 1) * (rand() < 0.5 ? -1 : 1);
    const y = year + shift;
    if (y > 0 && !taken.has(y)) return y;
  }
  return year + 11;
}

// ───────────── генераторы ─────────────

function genDef(ctx) {
  const { ents, rand } = ctx;
  return ents.defs.map((d) => ({
    kind: "def",
    keys: [keyOf(d.S)],
    S: d.S,
    build() {
      const others = sameBookFirst(
        ents.defs.filter((o) => o !== d && jaccard(stemSet(o.term), stemSet(d.term)) < 0.6),
        d.S
      );
      if (others.length < 2) return null;
      if (rand() < 0.5) {
        const ans = stemSet(d.def);
        const wrong = others
          .filter((o) => jaccard(stemSet(o.def), ans) < 0.6)
          .map((o) => upperFirst(clip(o.def, 150)));
        return choice({
          kind: "Определение",
          q: `Что такое ${lowerFirst(d.term)}?`,
          correct: upperFirst(clip(d.def, 150)),
          wrong,
          rand,
          S: d.S,
          hint: `Определение дано на с. ${d.S.page}: «${clip(d.S.text, 200)}»`,
        });
      }
      return choice({
        kind: "Термин",
        q: `Какой термин определён в учебнике так: «${clip(d.def, 170)}»?`,
        correct: upperFirst(d.term),
        wrong: others.map((o) => upperFirst(o.term)),
        rand,
        S: d.S,
        hint: `Это определение термина «${d.term}» (с. ${d.S.page}).`,
      });
    },
  }));
}

function genDate(ctx) {
  const { ents, rand } = ctx;
  const years = new Set(ents.dated.map((d) => d.year).filter(Boolean));
  return ents.dated.map((d) => ({
    kind: "date",
    keys: [keyOf(d.S)],
    S: d.S,
    build() {
      const others = sameBookFirst(
        ents.dated.filter((o) => o !== d && o.label !== d.label),
        d.S
      );
      if (d.full || d.month) {
        const known = others.filter((o) => o.year && (o.full || o.month));
        if (d.year && known.length >= 2 && rand() < 0.5) {
          const objs = [d, ...known.slice(0, 3)].sort((a, b) => sortKey(a) - sortKey(b));
          return {
            type: "choice",
            kind: "Дата",
            q: `Когда это произошло: «${clip(d.event, 150)}»?`,
            options: objs.map((o) => o.label),
            answer: objs.indexOf(d),
            points: 1,
            page: d.S.page,
            book: d.S.book,
            hint: `По учебнику (с. ${d.S.page}): ${d.label} — ${clip(d.event, 120)}.`,
          };
        }
        return choice({
          kind: "Событие",
          q: `Что произошло ${d.label}?`,
          correct: clip(d.event, 120),
          wrong: others.map((o) => clip(o.event, 120)),
          rand,
          S: d.S,
          hint: `${d.label} — ${clip(d.event, 120)} (с. ${d.S.page}).`,
        });
      }
      if (!d.year) return null;
      const wrongYears = [...years].filter((y) => y !== d.year);
      const wrong = shuffle(wrongYears, rand).slice(0, 3);
      const taken = new Set([d.year, ...wrong]);
      while (wrong.length < 3) {
        const y = farYear(d.year, taken, rand);
        taken.add(y);
        wrong.push(y);
      }
      const options = [d.year, ...wrong].sort((a, b) => a - b);
      return {
        type: "choice",
        kind: "Дата",
        q: `В каком году, по учебнику: «${clip(d.event, 160)}»?`,
        options: options.map(String),
        answer: options.indexOf(d.year),
        points: 1,
        page: d.S.page,
        book: d.S.book,
        hint: `${d.year} год — ${clip(d.event, 120)} (с. ${d.S.page}).`,
      };
    },
  }));
}

function genPlace(ctx) {
  const { ents, rand } = ctx;
  return ents.places.map((p) => ({
    kind: "place",
    keys: [keyOf(p.S)],
    S: p.S,
    build() {
      const ans = stemSet(p.phrase);
      const subj = stemSet(p.subject);
      const wrong = sameBookFirst(
        ents.places.filter((o) => o !== p && jaccard(stemSet(o.subject), subj) < 0.5 && overlap(stemSet(o.phrase), ans) === 0),
        p.S,
        (o) => o.S
      ).map((o) => lowerFirst(o.phrase));
      return choice({
        kind: "Место",
        q: `Где ${p.verb} ${lowerFirst(p.subject)}?`,
        correct: lowerFirst(p.phrase),
        wrong,
        rand,
        S: p.S,
        hint: `Так сказано на с. ${p.S.page}: «${clip(p.S.text, 200)}»`,
      });
    },
  }));
}

function genPerson(ctx) {
  const { ents, rand } = ctx;
  return ents.persons.map((p) => ({
    kind: "person",
    keys: [keyOf(p.S)],
    S: p.S,
    build() {
      const wrong = sameBookFirst(ents.persons.filter((o) => o.name !== p.name), p.S).map((o) => o.name);
      return choice({
        kind: "Личность",
        q: `Кто — ${lowerFirst(p.role)}?`,
        correct: p.name,
        wrong,
        rand,
        S: p.S,
        hint: `${p.name} — ${lowerFirst(p.role)} (с. ${p.S.page}).`,
      });
    },
  }));
}

function foreignItems(ents, list) {
  const own = new Set();
  for (const it of list.items) for (const s of stems(it)) own.add(s);
  for (const s of stems(list.label)) own.add(s);
  const pool = [];
  for (const other of ents.lists) {
    if (other === list || other.label === list.label || other.S.bookId !== list.S.bookId) continue;
    for (const it of other.items) {
      if (overlap(stemSet(it), own) > 0) continue;
      pool.push({ text: upperFirst(it), S: other.S });
    }
  }
  return sameBookFirst(pool, list.S);
}

function genListNot(ctx) {
  const { ents, rand } = ctx;
  return ents.lists
    .filter((l) => l.items.length >= 3)
    .map((l) => ({
      kind: "listNot",
      keys: l.keys,
      S: l.S,
      build() {
        const foreign = foreignItems(ents, l);
        if (!foreign.length) return null;
        const intruder = foreign[0];
        const own = shuffle(l.items, rand).slice(0, 3).map(upperFirst);
        const item = choice({
          kind: "Перечень",
          q: `В учебнике (с. ${l.S.page}) есть перечень «${l.label}». Что в него НЕ входит?`,
          correct: intruder.text,
          wrong: own,
          rand,
          S: l.S,
          min: 4,
          hint: `В перечень входят: ${l.items.join("; ")}. «${intruder.text}» относится к другому перечню (с. ${intruder.S.page}).`,
        });
        return item;
      },
    }));
}

function genListMulti(ctx) {
  const { ents, rand } = ctx;
  return ents.lists
    .filter((l) => l.items.length >= 3)
    .map((l) => ({
      kind: "listMulti",
      keys: l.keys,
      S: l.S,
      build() {
        const foreign = foreignItems(ents, l);
        if (foreign.length < 2) return null;
        const right = shuffle(l.items, rand).slice(0, Math.min(3, l.items.length)).map(upperFirst);
        const wrong = uniqueTexts(foreign.map((f) => f.text)).slice(0, 2);
        if (wrong.length < 2) return null;
        const all = shuffle([...right.map((t) => ({ t, ok: true })), ...wrong.map((t) => ({ t, ok: false }))], rand);
        return {
          type: "multi",
          kind: "Несколько верных",
          q: `Отметьте все пункты, которые учебник относит к перечню «${l.label}» (с. ${l.S.page}).`,
          options: all.map((o) => o.t),
          answer: all.map((o, i) => (o.ok ? i : -1)).filter((i) => i >= 0),
          points: 2,
          page: l.S.page,
          book: l.S.book,
          hint: `Верные пункты: ${right.join("; ")}. Остальные относятся к другим перечням учебника.`,
        };
      },
    }));
}

function genOrder(ctx) {
  const { ents, rand } = ctx;
  const groups = new Map();
  for (const d of ents.dated) {
    if (!d.year) continue;
    const k = `${d.S.bookId}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  }
  const out = [];
  for (const list of groups.values()) {
    const seen = new Set();
    const distinct = list.filter((d) => {
      const k = sortKey(d);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (distinct.length < 3) continue;
    out.push({
      kind: "order",
      keys: [],
      S: distinct[0].S,
      get pageKeys() {
        return distinct.map((d) => pageKey(d.S));
      },
      build() {
        const pick = distinct.slice().sort((a, b) => sortKey(a) - sortKey(b));
        const start = Math.max(0, Math.min(pick.length - 4, Math.floor(rand() * (pick.length - 3))));
        const chosen = pick.slice(start, start + 4);
        const events = shuffle(chosen, rand);
        const answer = chosen.map((c) => events.indexOf(c));
        return {
          type: "order",
          kind: "Хронология",
          q: "Расположите события в хронологическом порядке: от самого раннего к самому позднему.",
          options: events.map((e) => clip(e.event, 110)),
          answer,
          points: 2,
          page: chosen[0].S.page,
          book: chosen[0].S.book,
          hint: chosen.map((c) => `${c.label}: ${clip(c.event, 80)}`).join(" → "),
        };
      },
    });
  }
  return out;
}

function genMatch(ctx) {
  const { ents, rand } = ctx;
  const out = [];
  const dated = ents.dated.filter((d) => d.year);
  if (dated.length >= 6) {
    out.push({
      kind: "match",
      keys: [],
      S: dated[0].S,
      build() {
        const chosen = shuffle(dated, rand).slice(0, 4).sort((a, b) => sortKey(a) - sortKey(b));
        const right = shuffle(chosen, rand);
        return {
          type: "match",
          kind: "Соответствие",
          q: "Установите соответствие между датами и событиями.",
          left: chosen.map((c) => c.label),
          right: right.map((r) => clip(r.event, 110)),
          answer: chosen.map((c) => right.indexOf(c)),
          points: 2,
          page: chosen[0].S.page,
          book: chosen[0].S.book,
          hint: chosen.map((c) => `${c.label} — ${clip(c.event, 70)}`).join("; "),
        };
      },
    });
  }
  if (ents.defs.length >= 3) {
    out.push({
      kind: "match",
      keys: [],
      S: ents.defs[0].S,
      build() {
        const chosen = shuffle(ents.defs, rand).slice(0, 4);
        const right = shuffle(chosen, rand);
        return {
          type: "match",
          kind: "Соответствие",
          q: "Установите соответствие между терминами и их определениями.",
          left: chosen.map((c) => upperFirst(c.term)),
          right: right.map((r) => upperFirst(clip(r.def, 110))),
          answer: chosen.map((c) => right.indexOf(c)),
          points: 2,
          page: chosen[0].S.page,
          book: chosen[0].S.book,
          hint: chosen.map((c) => `${c.term} — ${lowerFirst(clip(c.def, 70))}`).join("; "),
        };
      },
    });
  }
  return out;
}

// Утверждение: верное (цитата) или с подменой одной детали.
function falsify(s, ctx, rand) {
  const { ents } = ctx;
  const text = s.text;
  const ops = [];

  const dated = ents.dated.find((d) => d.S === s || keyOf(d.S) === keyOf(s));
  if (dated && dated.year) {
    ops.push(() => {
      const taken = new Set(ents.dated.map((d) => d.year));
      taken.add(dated.year);
      const alt = farYear(dated.year, taken, rand);
      const yearStr = String(dated.year);
      if (!text.includes(yearStr)) return null;
      return { text: text.replace(yearStr, String(alt)), why: `Верно: ${dated.label}, а не ${alt}.` };
    });
    if (dated.lead) {
      ops.push(() => {
        const other = shuffle(ents.dated.filter((o) => o.label !== dated.label && o.event !== dated.event && o.S.bookId === dated.S.bookId), rand)[0];
        if (!other) return null;
        const m = DATE_DASH.exec(text);
        const head = m ? `${text.slice(0, text.indexOf(m[2]))}` : null;
        if (!head) return null;
        return { text: `${head}${clip(other.event, 140)}.`, why: `В учебнике: ${dated.label} — ${clip(dated.event, 120)}.` };
      });
    }
  }

  const place = ents.places.find((p) => keyOf(p.S) === keyOf(s));
  if (place) {
    ops.push(() => {
      const ans = stemSet(place.phrase);
      const other = ents.places.find((o) => o !== place && overlap(stemSet(o.phrase), ans) === 0 && jaccard(stemSet(o.subject), stemSet(place.subject)) < 0.5);
      if (!other) return null;
      return { text: text.replace(place.phrase, lowerFirst(other.phrase)), why: `В учебнике: ${place.phrase}.` };
    });
  }

  ops.push(() => {
    const parts = text.split(/\s+/);
    // уже есть отрицание: снимаем его
    const idx = parts.findIndex((p) => p.toLowerCase() === "не");
    if (idx >= 0 && idx < parts.length - 1 && !/^(только|может|менее|более)/i.test(parts[idx + 1])) {
      const next = parts[idx + 1].replace(/[,.;]/g, "").toLowerCase();
      if (/(ен|на|но|ны|ет|ёт|ит|ют|ут|ется|ются)$/.test(next) && !SKIP_NEG.test(next)) {
        const copy = parts.slice();
        copy.splice(idx, 1);
        return { text: copy.join(" "), why: "В учебнике в этой фразе есть отрицание." };
      }
    }
    const m = VERB_NEG.exec(` ${text}`);
    if (!m) return null;
    const verb = m[2];
    if (SKIP_NEG.test(verb)) return null;
    const pos = m.index + m[1].length - 1;
    if (pos < 0 || /не\s$/.test(text.slice(Math.max(0, pos - 3), pos))) return null;
    return { text: `${text.slice(0, pos)}не ${text.slice(pos)}`, why: "В учебнике сказано обратное: без частицы «не»." };
  });

  for (const op of shuffle(ops, rand)) {
    const res = op();
    if (res && res.text !== text) return res;
  }
  return null;
}

function goodForJudge(s) {
  const t = s.text;
  if (t.length < 40 || t.length > 230 || s.item || DANGLING.test(t)) return false;
  const wordsCount = t.split(/\s+/).filter((w) => /[а-яё]{3,}/i.test(w)).length;
  return wordsCount >= 5;
}

function genJudge(ctx) {
  const { facts, rand } = ctx;
  return facts.filter(goodForJudge).map((s) => ({
    kind: "judge",
    keys: [keyOf(s)],
    S: s,
    build(wantFalse) {
      const make = (statement, ok, hint) => ({
        type: "judge",
        kind: "Верно или неверно",
        q: `Верно ли утверждение? «${stripEnd(statement)}»`,
        options: ["Верно", "Неверно"],
        answer: ok ? 0 : 1,
        points: 1,
        page: s.page,
        book: s.book,
        hint,
      });
      if (wantFalse) {
        const f = falsify(s, ctx, rand);
        if (!f) return null;
        return make(f.text, false, `${f.why} Исходная фраза (с. ${s.page}): «${clip(s.text, 220)}»`);
      }
      return make(s.text, true, `Так сказано в учебнике на с. ${s.page}.`);
    },
  }));
}

function keywords(text, limit = 5) {
  const seen = new Set();
  const out = [];
  for (const w of String(text).match(/[А-Яа-яЁё-]{6,}/g) || []) {
    const st = stems(w)[0];
    if (!st || seen.has(st)) continue;
    seen.add(st);
    out.push(w.toLowerCase());
    if (out.length >= limit) break;
  }
  return out;
}

function genOpen(ctx) {
  const { ents, facts, topic } = ctx;
  const out = [];
  for (const kv of ents.kvs) {
    out.push({
      kind: "open",
      keys: [keyOf(kv.S)],
      S: kv.S,
      build() {
        return {
          type: "open",
          kind: "Развёрнутый ответ",
          q: `Запишите по учебнику: ${lowerFirst(kv.label)} (тема «${topic}»).`,
          options: [],
          answer: null,
          sample: kv.value,
          rubric: [`Совпадает с учебником: ${kv.value}`],
          points: 2,
          page: kv.S.page,
          book: kv.S.book,
          hint: `Ответ дан на с. ${kv.S.page}.`,
        };
      },
    });
  }
  for (const d of ents.defs.slice(0, 2)) {
    out.push({
      kind: "open",
      keys: [keyOf(d.S)],
      S: d.S,
      build() {
        const marks = keywords(d.def, 5);
        return {
          type: "open",
          kind: "Определение",
          q: `Дайте определение: ${lowerFirst(d.term)}.`,
          options: [],
          answer: null,
          sample: `${d.term} — ${d.def}.`,
          rubric: [`Назван признак: «${marks.slice(0, 3).join("», «")}»`, `Определение по смыслу совпадает с учебником (с. ${d.S.page})`],
          keywords: marks,
          points: 2,
          page: d.S.page,
          book: d.S.book,
          hint: `Определение — на с. ${d.S.page}. Засчитывайте и пересказ своими словами, если смысл сохранён.`,
        };
      },
    });
  }
  const top = facts.filter((f) => !f.item).slice(0, 3);
  if (top.length >= 2) {
    out.push({
      kind: "open",
      keys: [],
      S: top[0],
      build() {
        const sample = top.map((t) => stripEnd(t.text)).join(". ") + ".";
        return {
          type: "open",
          kind: "Развёрнутый ответ",
          q: `Расскажите по тексту учебника: что вы узнали по теме «${topic}»? Назовите не менее ${top.length} положений.`,
          options: [],
          answer: null,
          sample,
          rubric: top.map((t) => clip(t.text, 140)),
          keywords: keywords(sample, 6),
          points: 2,
          page: top[0].page,
          book: top[0].book,
          hint: `Опора: с. ${[...new Set(top.map((t) => t.page))].join(", ")}. За каждое названное положение — 1 балл, максимум 2.`,
        };
      },
    });
  }
  return out;
}

// ───────────── сборка ─────────────

const PLAN = ["def", "date", "place", "listNot", "person", "order", "judge", "listMulti", "date", "judge", "def", "match", "place", "judge"];
const RANK = { judge: 0, choice: 1, multi: 2, order: 3, match: 3, open: 4 };

function buildQuiz({ topic, facts = [], bank = [], pageRel, count = 8, variant = 0 } = {}) {
  const rand = makeRand(hashSeed(`${topic}|${count}|${variant}`));
  const pages = pageRel instanceof Map ? pageRel : new Map(facts.map((f) => [pageKey(f), 1]));
  const ents = mine(bank.length ? bank : facts);
  const onPage = (list) => list.filter((x) => pages.has(pageKey(x.S)));
  const scoped = {
    dated: onPage(ents.dated),
    defs: onPage(ents.defs),
    places: onPage(ents.places),
    lists: onPage(ents.lists),
    persons: onPage(ents.persons),
    kvs: onPage(ents.kvs),
  };
  const ctx = { ents, facts, topic, rand };
  const wOf = new Map(facts.map((f) => [keyOf(f), f.w ?? 0.5]));
  const weigh = (c) => {
    const base = Math.max(0, ...c.keys.map((k) => wOf.get(k) ?? 0));
    return (base || 0.25) * (pages.get(pageKey(c.S)) ?? 0.5);
  };
  const listKeys = new Set(scoped.lists.flatMap((l) => l.keys));
  const first = (set) => (c) => set.some((d) => keyOf(d.S) === c.keys[0]);

  const sub = (extra) => ({ ...ctx, ents: { ...ents, ...extra } });
  const pools = {
    def: genDef(ctx).filter(first(scoped.defs)),
    date: genDate(ctx).filter(first(scoped.dated)),
    place: genPlace(ctx).filter(first(scoped.places)),
    person: genPerson(ctx).filter(first(scoped.persons)),
    listNot: genListNot(ctx).filter((c) => c.keys.some((k) => listKeys.has(k))),
    listMulti: genListMulti(ctx).filter((c) => c.keys.some((k) => listKeys.has(k))),
    order: genOrder(sub({ dated: scoped.dated.length >= 3 ? scoped.dated : [] })),
    match: genMatch(sub({ dated: scoped.dated.length >= 3 ? scoped.dated : [], defs: scoped.defs.length >= 3 ? scoped.defs : [] })),
    judge: genJudge(ctx),
    open: genOpen(sub({ kvs: scoped.kvs, defs: scoped.defs })),
  };
  for (const [name, list] of Object.entries(pools)) {
    for (const c of list) c.w = c.keys.length ? weigh(c) : 0.3;
    list.sort((a, b) => b.w - a.w);
    pools[name] = list;
  }

  const items = [];
  const used = new Set();
  const seenQ = new Set();
  const counts = {};
  const caps = { judge: Math.max(2, Math.ceil(count * 0.3)), open: 2, order: 1, match: 1, listNot: 1, listMulti: 1 };
  let judgeFlip = 0;

  const accept = (name, c, item) => {
    if (!item || seenQ.has(item.q)) return false;
    c.keys.forEach((k) => used.add(k));
    seenQ.add(item.q);
    counts[name] = (counts[name] || 0) + 1;
    items.push(item);
    return true;
  };

  const tryPool = (name) => {
    const list = pools[name];
    if ((counts[name] || 0) >= (caps[name] ?? 3)) return false;
    const deferred = [];
    let done = false;
    while (list.length && !done) {
      const c = list.shift();
      if (c.keys.some((k) => used.has(k))) continue;
      if (name === "judge") {
        const wantFalse = judgeFlip % 2 === 0;
        const item = c.build(wantFalse);
        if (!item) {
          if (wantFalse) deferred.push(c);
          continue;
        }
        if (accept(name, c, item)) {
          judgeFlip += 1;
          done = true;
        }
        continue;
      }
      done = accept(name, c, c.build());
    }
    if (name === "judge" && !done && deferred.length) {
      const c = deferred.shift();
      done = accept(name, c, c.build(false));
      if (done) judgeFlip += 1;
    }
    list.unshift(...deferred);
    return done;
  };

  const fill = (target) => {
    for (let round = 0; round < 3 && items.length < target; round++) {
      for (const name of PLAN) {
        if (items.length >= target) break;
        tryPool(name);
      }
      if (round === 1) {
        caps.judge += 2;
        caps.order = 2;
        caps.listNot = 2;
        caps.listMulti = 2;
      }
    }
  };

  const wantOpen = pools.open.length > 0 && count >= 5;
  const openSlots = wantOpen ? (count >= 8 ? 2 : 1) : 0;
  fill(count - openSlots);
  for (let i = 0; i < openSlots; i++) tryPool("open");
  fill(count);
  if (items.length < count) {
    caps.open = 3;
    while (items.length < count && tryPool("open"));
  }

  const ranked = items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (RANK[a.it.type] ?? 1) - (RANK[b.it.type] ?? 1) || a.i - b.i)
    .map((x) => x.it);

  const stats = {};
  for (const it of ranked) stats[it.type] = (stats[it.type] || 0) + 1;
  const note =
    ranked.length < count
      ? `По найденным страницам удалось составить ${ranked.length} из ${count} заданий: в тексте мало определений, дат и перечней. Выберите больше страниц или другой параграф.`
      : "";
  return { kind: "test", topic, items: ranked, stats, note, points: ranked.reduce((s, it) => s + (it.points || 1), 0) };
}

module.exports = { buildQuiz, mine, keyOf, pageKey };
