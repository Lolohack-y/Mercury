// Разбор русского текста: очистка, предложения, основы слов (по схеме Snowball), ключевые термины.

const VOWELS = "аеиоуыэюя";

const STOP = new Set(
  "и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этом один почти мой тем чтобы нее кажется сейчас можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между которой который которая которые котором также либо чтобы этого этому этих этими такие такая такое такого является являются называют называется быть были было будут очень весьма".split(
    " "
  )
);

// Слова из просьбы учителя, которые не относятся к теме.
const ASK_WORDS = new Set(
  "год года году годы годов класс класса классе классу классов урок урока уроку урокам тема темы теме тему параграф параграфа страница страницы страниц учебник учебника учебнике материал материалы материала схема схему схемы таблица таблицу таблицы карточки карточек тест тесты тесту презентация презентацию презентации инфографика инфографику сделай сделайте составь составьте нужно нужна нужен хочу покажи расскажи подготовь подготовьте найди найдите пожалуйста про мне нам для по".split(
    " "
  )
);

function isVowel(c) {
  return VOWELS.includes(c);
}

function regionAfter(word, from) {
  let i = from;
  while (i < word.length && !isVowel(word[i])) i++;
  while (i < word.length && isVowel(word[i])) i++;
  return i < word.length ? i + 1 : word.length;
}

const PG1 = ["в", "вши", "вшись"];
const PG2 = ["ив", "ивши", "ившись", "ыв", "ывши", "ывшись"];
const REFL = ["ся", "сь"];
const ADJ = [
  "ее", "ие", "ые", "ое", "ими", "ыми", "ей", "ий", "ый", "ой", "ем", "им", "ым", "ом",
  "его", "ого", "ему", "ому", "их", "ых", "ую", "юю", "ая", "яя", "ою", "ею",
];
const PART1 = ["ем", "нн", "вш", "ющ", "щ"];
const PART2 = ["ивш", "ывш", "ующ"];
const VERB1 = ["ла", "на", "ете", "йте", "ли", "й", "л", "ем", "н", "ло", "но", "ет", "ют", "ны", "ть", "ешь", "нно"];
const VERB2 = [
  "ила", "ыла", "ена", "ейте", "уйте", "ите", "или", "ыли", "ей", "уй", "ил", "ыл", "им", "ым", "ен",
  "ило", "ыло", "ено", "ят", "ует", "уют", "ит", "ыт", "ены", "ить", "ыть", "ишь", "ую", "ю",
];
const NOUN = [
  "а", "ев", "ов", "ие", "ье", "е", "иями", "ями", "ами", "еи", "ии", "и", "ией", "ей", "ой", "ий", "й",
  "иям", "ям", "ием", "ем", "ам", "ом", "о", "у", "ах", "иях", "ях", "ы", "ь", "ию", "ью", "ю", "ия", "ья", "я",
];

function findEnding(word, endings, rv, afterAYa) {
  let best = "";
  for (const e of endings) {
    if (e.length <= best.length || !word.endsWith(e)) continue;
    const start = word.length - e.length;
    if (start < rv) continue;
    if (afterAYa) {
      const prev = word[start - 1];
      if (start - 1 < rv || (prev !== "а" && prev !== "я")) continue;
    }
    best = e;
  }
  return best;
}

function cut(word, ending) {
  return ending ? word.slice(0, word.length - ending.length) : word;
}

const stemCache = new Map();

function stem(raw) {
  const cached = stemCache.get(raw);
  if (cached) return cached;
  const result = stemWord(raw);
  if (stemCache.size > 80000) stemCache.clear();
  stemCache.set(raw, result);
  return result;
}

function stemWord(raw) {
  let w = String(raw).toLowerCase().replace(/ё/g, "е");
  if (w.length < 4 || !/^[а-я]+$/.test(w)) return w;
  let rv = 0;
  while (rv < w.length && !isVowel(w[rv])) rv++;
  rv = Math.min(rv + 1, w.length);
  const r2 = regionAfter(w, regionAfter(w, 0));

  let e = findEnding(w, PG1, rv, true);
  if (!e) e = findEnding(w, PG2, rv, false);
  if (e) {
    w = cut(w, e);
  } else {
    w = cut(w, findEnding(w, REFL, rv, false));
    const adj = findEnding(w, ADJ, rv, false);
    if (adj) {
      w = cut(w, adj);
      const part = findEnding(w, PART1, rv, true) || findEnding(w, PART2, rv, false);
      w = cut(w, part);
    } else {
      const verb = findEnding(w, VERB1, rv, true) || findEnding(w, VERB2, rv, false);
      if (verb) w = cut(w, verb);
      else w = cut(w, findEnding(w, NOUN, rv, false));
    }
  }
  if (w.endsWith("и") && w.length - 1 >= rv) w = w.slice(0, -1);
  if (w.endsWith("ость") && w.length - 4 >= r2) w = w.slice(0, -4);
  else if (w.endsWith("ост") && w.length - 3 >= r2) w = w.slice(0, -3);
  if (w.endsWith("нн")) w = w.slice(0, -1);
  else {
    const sup = findEnding(w, ["ейше", "ейш"], rv, false);
    if (sup) {
      w = cut(w, sup);
      if (w.endsWith("нн")) w = w.slice(0, -1);
    } else if (w.endsWith("ь") && w.length - 1 >= rv) w = w.slice(0, -1);
  }
  return w;
}

function normalize(text) {
  return String(text || "").toLowerCase().replace(/ё/g, "е");
}

// Слова запроса или текста: [{ raw, stem }]
function words(text, { dropAsk = false } = {}) {
  const out = [];
  const re = /[A-Za-zА-Яа-яЁё]+(?:-[A-Za-zА-Яа-яЁё]+)*|\d{3,4}/g;
  for (const m of String(text || "").matchAll(re)) {
    const raw = m[0];
    const low = normalize(raw);
    if (/^\d+$/.test(low)) {
      out.push({ raw, stem: low });
      continue;
    }
    if (low.length < 3 || STOP.has(low)) continue;
    if (dropAsk && ASK_WORDS.has(low)) continue;
    out.push({ raw, stem: stem(low) });
  }
  return out;
}

function stems(text, opts) {
  return words(text, opts).map((w) => w.stem);
}

const ABBR =
  /(^|[\s(«"])(т\.\s?е|т\.\s?д|т\.\s?п|т\.\s?к|т\.\s?н|и\s?др|и\s?пр|см|рис|табл|стр|гг?|вв?|им|ок|др|проф|акад|ул|руб|тыс|млн|млрд|напр|с|н\.\s?э|до\s?н\.\s?э)\./gi;
const DOT = "\u2024";

// Склеивает переносы и строки из PDF.
function cleanText(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/\u00ad/g, "")
    .replace(/(\p{L})-\n(\p{L})/gu, "$1$2")
    .replace(/\n{2,}/g, " ¶ ")
    .replace(/\s*\n\s*/g, " ")
    .replace(/ ¶ /g, "\n")
    .replace(/[ \t\u00a0]+/g, " ")
    .trim();
}

function protect(text) {
  return text
    .replace(ABBR, (m, pre, abbr) => `${pre}${abbr.replace(/\./g, DOT)}${DOT}`)
    .replace(/(^|[\s(«"])([А-ЯЁA-Z])\.(?=\s?[А-ЯЁA-Z])/g, `$1$2${DOT}`)
    .replace(/§\s*(\d+)\./g, `§ $1${DOT}`)
    .replace(/(\d)\.(\d)/g, `$1${DOT}$2`);
}

function restore(text) {
  return text.replace(new RegExp(DOT, "g"), ".");
}

// Предложения с позициями. Короткие заголовки сохраняются отдельным полем.
function splitSentences(text, { minLength = 25 } = {}) {
  const prepared = protect(cleanText(text));
  const parts = prepared
    .split(/\n|(?<=[.!?…])\s+(?=[А-ЯЁA-Z«"“(\d§])/)
    .map((s) => restore(s).trim())
    .filter(Boolean);
  const out = [];
  let lead = "";
  for (const raw of parts) {
    const marker = /^(\d{1,2})\)\s*/.exec(raw);
    let clean = raw.replace(/^(\d{1,2})\)\s*/, "").trim();
    if (marker) {
      // пункт списка: короткие пункты тоже считаются, заголовок списка сохраняется
      if (clean.length >= 4) out.push({ text: clean, lead, item: Number(marker[1]) });
      continue;
    }
    if (/^§/.test(clean)) {
      clean = clean.replace(/^§\s*\d+\.?\s*/, "").trim();
      if (clean.length < 70) continue; // заголовок параграфа, а не предложение
    }
    if (clean.length < minLength) {
      if (clean.length >= 4) lead = clean.replace(/[.:]$/, "");
      continue;
    }
    out.push({ text: clean, lead: "", item: 0 });
    lead = "";
  }
  return out;
}

function section(text) {
  const m = /^§\s*(\d+)\.?\s*([^.]{3,90})\./.exec(cleanText(text));
  return m ? `§ ${m[1]}. ${m[2].trim()}` : "";
}

function lowerFirst(s) {
  const t = String(s || "");
  if (/^[А-ЯЁ]{2,}/.test(t)) return t;
  return t.charAt(0).toLowerCase() + t.slice(1);
}

function upperFirst(s) {
  const t = String(s || "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function clip(text, n) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cutAt = t.slice(0, n - 1);
  const space = cutAt.lastIndexOf(" ");
  return `${(space > n * 0.6 ? cutAt.slice(0, space) : cutAt).replace(/[,;:\s]+$/, "")}…`;
}

function levenshtein(a, b, limit = 2) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = i - 1;
    prev[0] = i;
    let rowMin = prev[0];
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
      if (prev[j] < rowMin) rowMin = prev[j];
    }
    if (rowMin > limit) return limit + 1;
  }
  return prev[b.length];
}

module.exports = {
  STOP,
  stem,
  words,
  stems,
  normalize,
  cleanText,
  splitSentences,
  section,
  lowerFirst,
  upperFirst,
  clip,
  levenshtein,
};
