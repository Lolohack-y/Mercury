const fs = require("fs");
const path = require("path");
const store = require("./store");

const TEXT_EXT = new Set([".pdf", ".epub", ".djvu", ".djv", ".txt"]);
const AUDIO_EXT = new Set([".mp3", ".m4a", ".ogg", ".wav", ".aac"]);

function bookById(id) {
  return store.getState().books.find((book) => book.id === id) || null;
}

function storedFile(book) {
  if (!book?.file) return null;
  const full = path.join(store.UPLOADS, path.basename(book.file));
  return fs.existsSync(full) ? full : null;
}

function audioFile(book) {
  if (!book?.audio) return null;
  const full = path.join(store.UPLOADS, path.basename(book.audio));
  return fs.existsSync(full) ? full : null;
}

function keepUpload(bookId, tempPath, originalname, kind) {
  const ext = path.extname(originalname || "").toLowerCase();
  const allowed = kind === "audio" ? AUDIO_EXT : TEXT_EXT;
  if (!allowed.has(ext)) {
    throw new Error(kind === "audio" ? "Аудио: MP3, M4A, OGG, WAV или AAC" : "Поддерживаются PDF, EPUB, DjVu и TXT");
  }
  store.ensure();
  const name = kind === "audio" ? `${bookId}.audio${ext}` : `${bookId}${ext}`;
  const dest = path.join(store.UPLOADS, name);
  fs.copyFileSync(tempPath, dest);
  if (path.resolve(tempPath) !== path.resolve(dest)) fs.unlink(tempPath, () => {});
  return name;
}

function removeBookFiles(book) {
  for (const full of [storedFile(book), audioFile(book)]) {
    if (full) fs.unlink(full, () => {});
  }
}

function topicLine(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const para = clean.match(/§\s*\d+\.?\s*[^.!?]{0,70}/);
  if (para) return para[0].trim();
  const sentence = clean.split(/(?<=[.!?])\s/)[0] || clean;
  return sentence.slice(0, 72);
}

function pagesOf(bookId) {
  return store
    .getState()
    .chunks.filter((chunk) => chunk.bookId === bookId)
    .sort((a, b) => Number(a.page) - Number(b.page))
    .map((chunk) => ({ page: chunk.page, title: topicLine(chunk.text), text: chunk.text }));
}

module.exports = { TEXT_EXT, AUDIO_EXT, bookById, storedFile, audioFile, keepUpload, removeBookFiles, pagesOf };
