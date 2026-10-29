const store = require("./store");
const { ingestFile } = require("./ingest");

async function indexUpload({ filePath, originalname, title, publisher, subject, grade }) {
  const ingested = await ingestFile(filePath, originalname);
  const id = store.uuid();
  const book = {
    id,
    title: title || originalname,
    publisher: publisher || "УМК",
    subject: subject || "",
    grade: grade || "",
    filename: originalname,
    createdAt: new Date().toISOString(),
    pages: ingested.pages.length,
    note: ingested.meta?.note,
  };
  const { books, chunks } = store.getState();
  const newChunks = ingested.pages
    .filter((p) => (p.text || "").trim().length > 40)
    .map((p) => ({
      id: store.uuid(),
      bookId: id,
      bookTitle: book.title,
      publisher: book.publisher,
      page: p.page,
      text: p.text.trim(),
    }));
  store.saveBooks([...books, book]);
  store.saveChunks([...chunks, ...newChunks]);
  return { book, indexed: newChunks.length };
}

module.exports = { indexUpload };
