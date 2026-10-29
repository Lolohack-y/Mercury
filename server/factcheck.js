function extractClaims(text) {
  const nums = [];
  const re = /(\d{1,4}(?:[.,]\d+)?(?:\s*(?:года|г\.|км|%|°C|человек|тыс\.?))?)/gi;
  const sentences = String(text || "").split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    const found = s.match(re);
    if (found) {
      for (const n of found) {
        if (n.length < 2) continue;
        nums.push({ claim: n.trim(), sentence: s.trim() });
      }
    }
  }
  return nums.slice(0, 40);
}

function factCheck(generatedText, sourceChunks) {
  const corpus = sourceChunks.map((c) => c.text).join("\n");
  const claims = extractClaims(generatedText);
  const items = claims.map((c) => {
    const needle = c.claim.replace(/\s+/g, " ");
    const ok = corpus.includes(needle.replace(",", ".")) || corpus.includes(needle) || corpus.includes(needle.replace(".", ","));
    const yearish = needle.match(/\d{3,4}/);
    const yearOk = yearish ? corpus.includes(yearish[0]) : ok;
    return {
      claim: c.claim,
      context: c.sentence.slice(0, 180),
      status: ok || yearOk ? "ok" : "mismatch",
      hint: ok || yearOk ? "Есть в цитатах учебника" : "Цифра/дата не найдена в выбранных страницах — проверьте вручную",
    };
  });
  const mismatches = items.filter((i) => i.status === "mismatch");
  return {
    total: items.length,
    mismatches: mismatches.length,
    items,
  };
}

module.exports = { factCheck };
