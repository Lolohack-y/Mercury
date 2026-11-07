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
const { loginEnabled, login, logout, tokenOf, isTeacher } = require("./auth");
const { peekQuota } = require("./quota");
const { bookById, storedFile, audioFile, keepUpload, removeBookFiles, pagesOf } = require("./media");
const { startBot } = require("./bot");
const { startMaxBot } = require("./maxbot");

store.ensure();
const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" }));
// Старый адрес мини-приложения: теперь оно живёт на /max/.
app.get(/^\/tg(\/.*)?$/, (req, res) => res.redirect(301, "/max/"));
app.get("/", (_req, res) => res.redirect(302, "/max/"));
app.use(express.static(path.join(__dirname, "..", "public")));

const upload = multer({ dest: store.UPLOADS, limits: { fileSize: 200 * 1024 * 1024 } });

function receiveFile(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (!err) return next();
    const message = err.code === "LIMIT_FILE_SIZE" ? "Файл больше 200 МБ." : err.message || "Не удалось принять файл";
    res.status(400).json({ error: message });
  });
}

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

function forbid(res) {
  res.status(401).json({ error: "Это может сделать только учитель. Войдите по паролю." });
  return false;
}

function aiPublic(req) {
  const info = status();
  const teacher = isTeacher(req);
  const quota = teacher ? peekQuota() : null;
  return {
    teacher,
    login: loginEnabled(),
    configured: info.ready,
    ready: Boolean(teacher && info.ready && quota.left > 0),
    name: teacher && info.ready ? info.name : "",
    provider: teacher ? info.provider : "",
    folder: teacher ? info.folder : "",
    quota,
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/ai", (req, res) => {
  res.json(aiPublic(req));
});

app.post("/api/auth/login", (req, res) => {
  try {
    const token = login((req.body || {}).password);
    res.json({ token, ...aiPublic({ headers: { authorization: `Bearer ${token}` } }) });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Не удалось войти" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  logout(tokenOf(req));
  res.json({ ok: true });
});

app.post("/api/ai", async (req, res) => {
  if (!isTeacher(req)) return forbid(res);
  const { provider, key, folder } = req.body || {};
  saveSettings({ provider, key, folder });
  const result = await ping();
  res.status(result.ok ? 200 : 400).json({ ...result, ...aiPublic(req) });
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
  if (!isTeacher(req)) return forbid(res);
  const { brand } = store.getState();
  const next = { ...brand, ...req.body };
  store.saveBrand(next);
  res.json(next);
});

app.post("/api/books", receiveFile, async (req, res) => {
  try {
    if (!isTeacher(req)) return forbid(res);
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

app.get("/api/books/:id/read", (req, res) => {
  const book = bookById(req.params.id);
  if (!book) return res.status(404).json({ error: "Учебник не найден" });
  const file = storedFile(book);
  res.json({
    book: {
      id: book.id,
      title: book.title,
      publisher: book.publisher,
      subject: book.subject,
      grade: book.grade,
      format: book.format || "",
    },
    hasFile: Boolean(file && book.format === "pdf"),
    hasAudio: Boolean(audioFile(book)),
    pages: pagesOf(book.id),
  });
});

app.get("/api/books/:id/file", (req, res) => {
  const book = bookById(req.params.id);
  const full = book && storedFile(book);
  if (!full) return res.status(404).json({ error: "Файла нет: для демо сохранён только текст страниц." });
  const type = book.format === "pdf" ? "application/pdf" : "application/octet-stream";
  res.type(type);
  res.sendFile(full);
});

app.get("/api/books/:id/audio", (req, res) => {
  const book = bookById(req.params.id);
  const full = book && audioFile(book);
  if (!full) return res.status(404).json({ error: "К этому учебнику аудио не прикреплено" });
  res.sendFile(full);
});

app.post("/api/books/:id/audio", receiveFile, (req, res) => {
  try {
    if (!isTeacher(req)) return forbid(res);
    const { books } = store.getState();
    const book = books.find((item) => item.id === req.params.id);
    if (!book) return res.status(404).json({ error: "Учебник не найден" });
    if (!req.file) return res.status(400).json({ error: "Выберите аудиофайл" });
    book.audio = keepUpload(book.id, req.file.path, req.file.originalname, "audio");
    store.saveBooks(books);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message || String(e) });
  }
});

app.delete("/api/books/:id", (req, res) => {
  if (!isTeacher(req)) return forbid(res);
  const { books, chunks } = store.getState();
  const book = books.find((item) => item.id === req.params.id);
  if (book) removeBookFiles(book);
  store.saveBooks(books.filter((b) => b.id !== req.params.id));
  store.saveChunks(chunks.filter((c) => c.bookId !== req.params.id));
  res.json({ ok: true });
});

app.post("/api/generate", async (req, res) => {
  try {
    const pack = await ask(req.body || {}, { teacher: isTeacher(req) });
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
