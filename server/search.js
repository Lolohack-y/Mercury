const STOP = new Set(
  "и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто человек чего раз тоже себе под жизнь будет ж тогда кто этот говорил того потому этом один почти мой тем чтобы нее кажется все сейчас можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошую свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между которой который которая которые котором которой которые".split(
    " "
  )
);

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^a-zа-я0-9]+/i)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function tfidfVectors(docs) {
  const df = new Map();
  const tfs = docs.map((tokens) => {
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    return tf;
  });
  const n = docs.length || 1;
  return tfs.map((tf) => {
    const vec = new Map();
    let norm = 0;
    for (const [t, c] of tf) {
      const idf = Math.log((n + 1) / ((df.get(t) || 1) + 1)) + 1;
      const v = (c / (tf.size || 1)) * idf;
      vec.set(t, v);
      norm += v * v;
    }
    return { vec, norm: Math.sqrt(norm) || 1 };
  });
}

function cosine(a, b) {
  let dot = 0;
  const [small, large] = a.vec.size < b.vec.size ? [a, b] : [b, a];
  for (const [t, v] of small.vec) {
    const w = large.vec.get(t);
    if (w) dot += v * w;
  }
  return dot / (a.norm * b.norm);
}

function queryVector(query, corpusVecs, docsTokens) {
  const qTokens = tokenize(query);
  const df = new Map();
  for (const tokens of docsTokens) {
    for (const t of new Set(tokens)) df.set(t, (df.get(t) || 0) + 1);
  }
  const n = docsTokens.length || 1;
  const tf = new Map();
  for (const t of qTokens) tf.set(t, (tf.get(t) || 0) + 1);
  const vec = new Map();
  let norm = 0;
  for (const [t, c] of tf) {
    const idf = Math.log((n + 1) / ((df.get(t) || 1) + 1)) + 1;
    const v = (c / (tf.size || 1)) * idf;
    vec.set(t, v);
    norm += v * v;
  }
  return { vec, norm: Math.sqrt(norm) || 1 };
}

function search(chunks, query, { bookIds, topK = 8 } = {}) {
  let pool = chunks;
  if (bookIds?.length) pool = chunks.filter((c) => bookIds.includes(c.bookId));
  if (!pool.length) return [];
  const docsTokens = pool.map((c) => tokenize(c.text));
  const vecs = tfidfVectors(docsTokens);
  const qv = queryVector(query, vecs, docsTokens);
  return pool
    .map((chunk, i) => ({ chunk, score: cosine(qv, vecs[i]) }))
    .filter((x) => x.score > 0.02)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

module.exports = { tokenize, search };
