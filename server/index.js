const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const multer = require("multer");

function loadEnv() {
  const file = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    const key = trimmed.slice(0, i).trim();
    let value = trimmed.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

const store = require("./store");
const { demoBook } = require("./ingest");
const { factCheck } = require("./factcheck");
const { indexUpload } = require("./library");
const { ask, editPack } = require("./ask");
const { buildPptx } = require("./pptx");
const { status, saveSettings, ping } = require("./ai");
const { startBot } = require("./bot");
const { startMaxBot } = require("./maxbot");

store.ensure();
const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" }));
// Старый адрес мини-приложения: теперь оно живёт на /max/.
app.get(/^\/tg(\/.*)?$/, (req, res) => res.redirect(301, "/max/"));
app.use(express.static(path.join(__dirname, "..", "public")));

const upload = multer({ dest: store.UPLOADS, limits: { fileSize: 80 * 1024 * 1024 } });

function seedDemo() {
  const { books, chunks } = store.getState();
  if (books.some((b) => b.demo)) return;
  const id = store.uuid();
  const book = {
    id,
    title: "Биология. 9 класс (демо)",
    publisher: "Просвещение",
    subject: "Биология",
    grade: "9",
    filename: "demo.txt",
    createdAt: new Date().toISOString(),
    pages: 5,
    demo: true,
  };
  const hist = {
    id: store.uuid(),
    title: "История России. 9 класс (демо)",
    publisher: "Дрофа",
    subject: "История",
    grade: "9",
    filename: "demo-history.txt",
    createdAt: new Date().toISOString(),
    pages: 2,
    demo: true,
  };
  const more = demoBook().map((p) => ({
    id: store.uuid(),
    bookId: p.page >= 112 ? hist.id : id,
    bookTitle: p.page >= 112 ? hist.title : book.title,
    publisher: p.page >= 112 ? hist.publisher : book.publisher,
    page: p.page,
    text: p.text,
  }));
  store.saveBooks([...books, book, hist]);
  store.saveChunks([...chunks, ...more]);
}

seedDemo();

app.get("/api/health", (_req, res) => {
  const ai = status();
  res.json({ ok: true, llm: ai.ready, provider: ai.ready ? ai.name : "" });
});

app.get("/api/ai", (_req, res) => {
  res.json(status());
});

app.post("/api/ai", async (req, res) => {
  const { provider, key, folder } = req.body || {};
  saveSettings({ provider, key, folder });
  const result = await ping();
  res.status(result.ok ? 200 : 400).json(result);
});

app.get("/api/state", (_req, res) => {
  const { books, brand, cache } = store.getState();
  res.json({
    books,
    brand,
    cacheSize: Object.keys(cache).length,
  });
});

app.post("/api/brand", (req, res) => {
  const { brand } = store.getState();
  const next = { ...brand, ...req.body };
  store.saveBrand(next);
  res.json(next);
});

app.post("/api/books", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Выберите файл учебника" });
    const { title, publisher, subject, grade } = req.body;
    const result = await indexUpload({
      filePath: req.file.path,
      originalname: req.file.originalname,
      title,
      publisher,
      subject,
      grade,
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message || String(e) });
  }
});

app.delete("/api/books/:id", (req, res) => {
  const { books, chunks } = store.getState();
  store.saveBooks(books.filter((b) => b.id !== req.params.id));
  store.saveChunks(chunks.filter((c) => c.bookId !== req.params.id));
  res.json({ ok: true });
});

app.post("/api/generate", async (req, res) => {
  try {
    const pack = await ask(req.body || {});
    res.json(pack);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Ошибка" });
  }
});

app.post("/api/edit", (req, res) => {
  try {
    const { pack, instruction } = req.body || {};
    res.json(editPack(pack, instruction));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Ошибка" });
  }
});

app.post("/api/export/pptx", async (req, res) => {
  try {
    const pack = req.body || {};
    const slides = pack.materials?.presentation?.slides || pack.slides || [];
    const buf = await buildPptx({
      topic: pack.topic || pack.materials?.presentation?.topic || "Презентация",
      slides,
      school: pack.brand?.school || "",
      primary: pack.brand?.primary,
    });
    const filename = "prezentaciya.pptx";
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Не удалось собрать презентацию" });
  }
});

app.post("/api/factcheck", (req, res) => {
  const { text, bookIds } = req.body || {};
  const { chunks } = store.getState();
  const src = chunks.filter((c) => !bookIds?.length || bookIds.includes(c.bookId));
  res.json(factCheck(text || "", src.slice(0, 80)));
});

const PORT = Number(process.env.PORT) || 3840;
const HOST = process.env.HOST || "0.0.0.0";
app.listen(PORT, HOST, () => {
  console.log(`Наглядник: http://${HOST}:${PORT}`);
  console.log(`Мини-приложение: http://${HOST}:${PORT}/max/`);
  startMaxBot();
  startBot();
});
