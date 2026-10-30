const fs = require("fs");
const path = require("path");
const { v4: uuid } = require("uuid");

const DATA = path.join(__dirname, "..", "data");
const UPLOADS = path.join(DATA, "uploads");

function ensure() {
  fs.mkdirSync(UPLOADS, { recursive: true });
}

function loadJson(file, fallback) {
  ensure();
  const p = path.join(DATA, file);
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function saveJson(file, value) {
  ensure();
  fs.writeFileSync(path.join(DATA, file), JSON.stringify(value, null, 2), "utf8");
}

function getState() {
  return {
    books: loadJson("books.json", []),
    chunks: loadJson("chunks.json", []),
    cache: loadJson("cache.json", {}),
    brand: loadJson("brand.json", {
      school: "Школа",
      primary: "#1e5a46",
      accent: "#d4a017",
      font: "Georgia",
    }),
  };
}

function saveBooks(books) {
  saveJson("books.json", books);
}
function saveChunks(chunks) {
  saveJson("chunks.json", chunks);
}
function saveCache(cache) {
  saveJson("cache.json", cache);
}
function saveBrand(brand) {
  saveJson("brand.json", brand);
}

function cacheKey(payload) {
  return JSON.stringify({
    v: 5,
    count: payload.count || 8,
    ai: payload.ai || "",
    q: String(payload.query || "").toLowerCase().trim(),
    type: payload.type,
    books: (payload.bookIds || []).slice().sort(),
    grade: payload.grade || "",
    subject: payload.subject || "",
  });
}

module.exports = {
  DATA,
  UPLOADS,
  ensure,
  getState,
  saveBooks,
  saveChunks,
  saveCache,
  saveBrand,
  loadJson,
  saveJson,
  cacheKey,
  uuid,
};
