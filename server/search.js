const { stems, words, splitSentences, cleanText, section, levenshtein, clip } = require("./text");

const K1 = 1.3;
const B = 0.7;

let cached = { sig: "", index: null };

function signature(chunks) {
  let h = chunks.length;
  for (const c of chunks) {
    const id = String(c.id || "");
    for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
    h = (Math.imul(h, 31) + String(c.text || "").length) | 0;
  }
  return `${chunks.length}:${h}`;
}

function buildIndex(chunks) {
  const pages = [];
  const df = new Map();
  const surface = new Map();
  let totalLen = 0;
  let sentLen = 0;
  let sentCount = 0;
  for (const chunk of chunks) {
    const clean = cleanText(chunk.text);
    const ws = words(clean);
    const pos = new Map();
    ws.forEach((w, i) => {
      let list = pos.get(w.stem);
      if (!list) pos.set(w.stem, (list = []));
      list.push(i);
      const low = w.raw.toLowerCase();
      const known = surface.get(w.stem);
      if (/^[а-яё-]+$/.test(low) && (!known || low.length < known.length)) surface.set(w.stem, low);
    });
    for (const t of pos.keys()) df.set(t, (df.get(t) || 0) + 1);
    const sentences = splitSentences(chunk.text).map((s, idx) => {
      const st = stems(s.lead ? `${s.lead}. ${s.text}` : s.text);
      const tf = new Map();
      for (const t of st) tf.set(t, (tf.get(t) || 0) + 1);
      sentLen += st.length;
      sentCount += 1;
      return { ...s, idx, len: st.length, tf };
    });
    const sec = section(chunk.text);
    pages.push({ chunk, len: ws.length, pos, sentences, section: sec, titleStems: new Set(stems(sec)) });
    totalLen += ws.length;
  }
  return {
    pages,
    df,
    surface,
    N: pages.length,
    avgLen: totalLen / Math.max(pages.length, 1) || 1,
    avgSent: sentLen / Math.max(sentCount, 1) || 1,
    vocab: [...df.keys()],
  };
}

function getIndex(chunks) {
  const sig = signature(chunks);
  if (cached.sig === sig && cached.index) return cached.index;
  const index = buildIndex(chunks);
  cached = { sig, index };
  return index;
}

function idf(index, stem) {
  const n = index.df.get(stem) || 0;
  return Math.log(1 + (index.N - n + 0.5) / (n + 0.5));
}

// Формы слова, однокоренные слова и опечатки.
function expand(index, term) {
  const out = new Map();
  const q = term.stem;
  if (index.df.has(q)) out.set(q, 1);
  if (/^\d+$/.test(q)) return out;
  if (q.length >= 5) {
    for (const s of index.vocab) {
      if (s === q || s.length < 5) continue;
      if ((s.startsWith(q) || q.startsWith(s)) && Math.abs(s.length - q.length) <= 4) {
        out.set(s, Math.max(out.get(s) || 0, 0.7));
      }
    }
  }
  if (!out.size && q.length >= 5) {
    const limit = q.length >= 9 ? 2 : 1;
    let best = null;
    for (const s of index.vocab) {
      if (Math.abs(s.length - q.length) > limit || s[0] !== q[0]) continue;
      const d = levenshtein(s, q, limit);
      if (d <= limit && (!best || d < best.d)) best = { s, d };
    }
    if (best) out.set(best.s, 0.5);
  }
  return out;
}

function analyzeQuery(index, query) {
  const seen = new Set();
  const terms = [];
  for (const w of words(query, { dropAsk: true })) {
    if (seen.has(w.stem)) continue;
    seen.add(w.stem);
    const ex = expand(index, w);
    let weight = 0;
    for (const s of ex.keys()) weight = Math.max(weight, idf(index, s));
    terms.push({ raw: w.raw, stem: w.stem, ex, idf: weight });
  }
  return terms;
}

function bm25(getTf, len, avg, terms) {
  let score = 0;
  const matched = new Set();
  terms.forEach((t, i) => {
    let tf = 0;
    for (const [s, w] of t.ex) tf += w * getTf(s);
    if (tf <= 0) return;
    matched.add(i);
    score += t.idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * len) / avg)));
  });
  return { score, matched };
}

function phraseBonus(page, known) {
  let bonus = 0;
  for (let i = 0; i + 1 < known.length; i++) {
    const a = known[i];
    const b = known[i + 1];
    let near = false;
    for (const sa of a.ex.keys()) {
      const pa = page.pos.get(sa);
      if (!pa) continue;
      for (const sb of b.ex.keys()) {
        const pb = page.pos.get(sb);
        if (!pb) continue;
        for (const x of pa) {
          if (pb.some((y) => y - x > 0 && y - x <= 3)) {
            near = true;
            break;
          }
        }
        if (near) break;
      }
      if (near) break;
    }
    if (near) bonus += 0.4 * (a.idf + b.idf);
  }
  return bonus;
}

function titleBonus(page, known) {
  let bonus = 0;
  for (const t of known) {
    for (const s of t.ex.keys()) {
      if (page.titleStems.has(s)) {
        bonus += 0.7 * t.idf;
        break;
      }
    }
  }
  return bonus;
}

function markWords(text, known) {
  const stemsWanted = new Set();
  for (const t of known) for (const s of t.ex.keys()) stemsWanted.add(s);
  const marks = new Set();
  for (const w of words(text)) {
    if (stemsWanted.has(w.stem)) marks.add(w.raw.toLowerCase());
  }
  return [...marks];
}

function pickSentences(page, known, avgSent) {
  const scored = page.sentences.map((s) => {
    const r = bm25((st) => s.tf.get(st) || 0, s.len, avgSent, known);
    return { s, i: s.idx, score: r.score, matched: r.matched.size };
  });
  const maxScore = Math.max(0, ...scored.map((x) => x.score));
  const picked = new Map();
  for (const x of scored) {
    if (x.matched > 0 && x.score >= maxScore * 0.28) picked.set(x.i, { ...x.s, score: x.score, ctx: false });
  }
  for (const x of scored) {
    if (x.matched > 0 && x.score >= maxScore * 0.6) {
      for (const j of [x.i - 1, x.i + 1]) {
        const near = scored[j];
        if (near && !picked.has(j)) picked.set(j, { ...near.s, score: near.score + maxScore * 0.12, ctx: true });
      }
    }
  }
  if (!picked.size && scored.length) {
    const first = scored[0];
    picked.set(first.i, { ...first.s, score: 0.01, ctx: true });
  }
  return [...picked.values()]
    .map(({ tf, len, ...rest }) => rest)
    .sort((a, b) => b.score - a.score);
}

function searchDetailed(chunks, query, { bookIds, topK = 8, preferBooks } = {}) {
  const index = getIndex(chunks);
  const allowed = bookIds?.length ? new Set(bookIds) : null;
  const pool = index.pages.filter((p) => !allowed || allowed.has(p.chunk.bookId));
  const terms = analyzeQuery(index, query);
  const known = terms.filter((t) => t.ex.size);
  const meta = {
    terms: terms.map((t) => {
      const best = [...t.ex.entries()].sort((a, b) => b[1] - a[1])[0];
      const via = !best ? "none" : best[1] >= 1 ? "exact" : best[1] >= 0.7 ? "form" : "typo";
      return {
        raw: t.raw,
        matched: Boolean(best),
        via,
        suggestion: via === "typo" ? index.surface.get(best[0]) || "" : "",
      };
    }),
    unknown: terms.filter((t) => !t.ex.size).map((t) => t.raw),
  };
  if (!pool.length || !known.length) return { hits: [], meta };

  const ranked = [];
  for (const page of pool) {
    const r = bm25((s) => page.pos.get(s)?.length || 0, page.len, index.avgLen, known);
    if (!r.matched.size) continue;
    const coverage = r.matched.size / known.length;
    if (known.length >= 3 && coverage < 0.3) continue;
    let score = (r.score + phraseBonus(page, known) + titleBonus(page, known)) * (0.5 + 0.5 * coverage);
    if (preferBooks?.has(page.chunk.bookId)) score *= 1.12;
    ranked.push({ page, score, coverage });
  }
  ranked.sort((a, b) => b.score - a.score);
  const top = ranked[0]?.score || 0;
  const hits = ranked
    .filter((r) => r.score >= top * 0.12)
    .slice(0, topK)
    .map((r, rank) => {
      const best = pickSentences(r.page, known, index.avgSent);
      const ordered = best.filter((b) => !b.ctx || b.score > 0.02).slice(0, 3).sort((a, b) => a.idx - b.idx);
      const excerpt = clip(ordered.map((o) => o.text).join(" "), 320);
      return {
        chunk: r.page.chunk,
        score: r.score,
        relevance: Math.round(Math.min(1, (r.score / top) * (0.4 + 0.6 * r.coverage)) * 100) / 100,
        rank,
        section: r.page.section,
        best,
        excerpt,
        marks: markWords(excerpt, known),
      };
    });
  return { hits, meta };
}

function search(chunks, query, opts) {
  return searchDetailed(chunks, query, opts).hits;
}

// Все предложения выбранных учебников: материал для неверных вариантов ответа.
function sentenceBank(chunks, bookIds, limit = 4000) {
  const index = getIndex(chunks);
  const allowed = bookIds?.length ? new Set(bookIds) : null;
  const out = [];
  for (const page of index.pages) {
    if (allowed && !allowed.has(page.chunk.bookId)) continue;
    for (const s of page.sentences) {
      out.push({ text: s.text, page: page.chunk.page, book: page.chunk.bookTitle, bookId: page.chunk.bookId, idx: s.idx, lead: s.lead, item: s.item });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

module.exports = { search, searchDetailed, sentenceBank };
