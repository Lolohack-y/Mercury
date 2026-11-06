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
const auth = require("./auth");
const ai = require("./ai");
const stats = require("./stats");
const tests = require("./tests");
const { demoBook } = require("./ingest");
const { factCheck } = require("./factcheck");
const { indexUpload } = require("./library");
const { ask, editPack } = require("./ask");
const { buildPptx } = require("./pptx");
const { startBot } = require("./bot");
const { startMaxBot, sendReport } = require("./maxbot");

store.ensure();
const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "4mb" }));
// Старый адрес мини-приложения: теперь оно живёт на /max/.
app.get(/^\/tg(\/.*)?$/, (req, res) => res.redirect(301, "/max/"));
app.get("/", (_req, res) => res.redirect(302, "/max/"));
app.use(express.static(path.join(__dirname, "..", "public")));
app.use(auth.middleware);
app.use(auth.afterAuth);

const upload = multer({ dest: store.UPLOADS, limits: { fileSize: 80 * 1024 * 1024 } });

function fail(res, error) {
  res.status(error?.status || 500).json({ error: error?.message || "Ошибка", code: error?.code });
}

function isTeacher(user) {
  return ["teacher", "admin"].includes(auth.normalizeRole(user?.role));
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

/* ───────────── здоровье и авторизация ───────────── */

app.get("/api/health", (_req, res) => {
  const info = ai.status();
  res.json({ ok: true, llm: info.ready, provider: info.ready ? info.name : "", pool: info.pool });
});

app.get("/api/auth/me", (req, res) => {
  const user = req.auth.user;
  res.json({
    authenticated: Boolean(user),
    user: auth.publicUser(user),
    ai: ai.statusFor(user),
  });
});

app.post("/api/auth/code", (req, res) => {
  const user = auth.redeemCode(req.body?.code);
  if (!user) return res.status(400).json({ error: "Код не подошёл или уже истёк", code: "bad_code" });
  auth.setSessionCookie(res, user.id);
  res.json({ ok: true, user: auth.publicUser(user), ai: ai.statusFor(user) });
});

app.post("/api/auth/logout", (_req, res) => {
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

/* ───────────── ИИ ───────────── */

app.get("/api/ai", (req, res) => {
  res.json(ai.statusFor(req.auth.user));
});

app.post("/api/ai", auth.requireUser, async (req, res) => {
  try {
    const result = await ai.saveUserKey(req.auth.user, req.body || {});
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || "Не удалось подключить ключ" });
  }
});

app.delete("/api/ai", auth.requireUser, (req, res) => {
  const provider = req.body?.provider || req.query?.provider;
  res.json(ai.clearUserKey(req.auth.user, provider));
});

app.get("/api/ai/pool", auth.requireRole("admin"), (_req, res) => {
  res.json(ai.poolInfo());
});

app.post("/api/ai/pool", auth.requireRole("admin"), async (req, res) => {
  try {
    ai.saveSettings(req.body || {});
    res.json(ai.poolInfo());
  } catch (error) {
    fail(res, error);
  }
});

app.get("/api/stats", auth.requireRole("teacher", "admin"), (req, res) => {
  const data = stats.summary();
  const own = tests.listForOwner(req.auth.user.id);
  res.json({
    ...data,
    tests: {
      count: own.length,
      attempts: own.reduce((sum, test) => sum + (Number(test.attemptsCount) || 0), 0),
      students: own.reduce((sum, test) => sum + (Number(test.studentsCount) || 0), 0),
    },
  });
});

/* ───────────── состояние и библиотека ───────────── */

app.get("/api/state", (_req, res) => {
  const { books, brand, cache } = store.getState();
  res.json({
    books,
    brand,
    cacheSize: Object.keys(cache).length,
  });
});

app.post("/api/brand", auth.requireRole("teacher", "admin"), (req, res) => {
  const { brand } = store.getState();
  const next = { ...brand, ...req.body };
  store.saveBrand(next);
  res.json(next);
});

app.post("/api/books", auth.requireRole("teacher", "admin"), upload.single("file"), async (req, res) => {
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

app.delete("/api/books/:id", auth.requireRole("teacher", "admin"), (req, res) => {
  const { books, chunks } = store.getState();
  store.saveBooks(books.filter((b) => b.id !== req.params.id));
  store.saveChunks(chunks.filter((c) => c.bookId !== req.params.id));
  res.json({ ok: true });
});

/* ───────────── материалы ───────────── */

app.post("/api/generate", async (req, res) => {
  try {
    const pack = await ask({ ...(req.body || {}), user: req.auth.user });
    res.json(pack);
  } catch (e) {
    fail(res, e);
  }
});

app.post("/api/edit", (req, res) => {
  try {
    const { pack, instruction } = req.body || {};
    res.json(editPack(pack, instruction));
  } catch (e) {
    fail(res, e);
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
    fail(res, e);
  }
});

app.post("/api/factcheck", (req, res) => {
  const { text, bookIds } = req.body || {};
  const { chunks } = store.getState();
  const src = chunks.filter((c) => !bookIds?.length || bookIds.includes(c.bookId));
  res.json(factCheck(text || "", src.slice(0, 80)));
});

/* ───────────── тесты учителя ───────────── */

app.get("/api/tests", auth.requireUser, (req, res) => {
  const user = req.auth.user;
  if (isTeacher(user)) return res.json({ tests: tests.listForOwner(user.id) });
  res.json({ tests: [], attempts: tests.myAttempts(user.id) });
});

app.post("/api/tests", auth.requireRole("teacher", "admin"), (req, res) => {
  try {
    res.json(tests.create(req.auth.user, req.body || {}));
  } catch (error) {
    res.status(400).json({ error: error.message || "Не удалось создать тест" });
  }
});

app.get("/api/tests/:id", auth.requireUser, (req, res) => {
  const test = tests.getTest(req.params.id);
  if (!test) return res.status(404).json({ error: "Тест не найден" });
  if (!tests.canManage(test, req.auth.user)) return res.status(403).json({ error: "Нет доступа к тесту" });
  res.json(tests.ownerSummary(test));
});

app.patch("/api/tests/:id", auth.requireRole("teacher", "admin"), (req, res) => {
  const test = tests.getTest(req.params.id);
  if (!test) return res.status(404).json({ error: "Тест не найден" });
  if (!tests.canManage(test, req.auth.user)) return res.status(403).json({ error: "Нет доступа к тесту" });
  try {
    res.json(tests.update(test, req.body || {}));
  } catch (error) {
    res.status(400).json({ error: error.message || "Не удалось сохранить тест" });
  }
});

app.delete("/api/tests/:id", auth.requireRole("teacher", "admin"), (req, res) => {
  const test = tests.getTest(req.params.id);
  if (!test) return res.status(404).json({ error: "Тест не найден" });
  if (!tests.canManage(test, req.auth.user)) return res.status(403).json({ error: "Нет доступа к тесту" });
  tests.remove(test);
  res.json({ ok: true });
});

app.post("/api/tests/:id/close", auth.requireRole("teacher", "admin"), (req, res) => {
  const test = tests.getTest(req.params.id);
  if (!test) return res.status(404).json({ error: "Тест не найден" });
  if (!tests.canManage(test, req.auth.user)) return res.status(403).json({ error: "Нет доступа к тесту" });
  res.json(tests.close(test));
});

app.get("/api/tests/:id/results", auth.requireRole("teacher", "admin"), (req, res) => {
  const test = tests.getTest(req.params.id);
  if (!test) return res.status(404).json({ error: "Тест не найден" });
  if (!tests.canManage(test, req.auth.user)) return res.status(403).json({ error: "Нет доступа к тесту" });
  res.json(tests.results(test));
});

app.post("/api/tests/:id/report", auth.requireRole("teacher", "admin"), async (req, res) => {
  const test = tests.getTest(req.params.id);
  if (!test) return res.status(404).json({ error: "Тест не найден" });
  if (!tests.canManage(test, req.auth.user)) return res.status(403).json({ error: "Нет доступа к тесту" });
  const data = tests.results(test);
  const sent = await sendReport(req.auth.user, data);
  if (sent.ok) tests.markReported(test.id);
  res.json({ ok: true, sent, report: sent.text || "" });
});

/* ───────────── прохождение тестов учеником ───────────── */

app.get("/api/t/:token", (req, res) => {
  const test = tests.findByToken(req.params.token);
  if (!test) return res.status(404).json({ error: "Ссылка на тест не найдена" });
  res.json(tests.publicTest(test));
});

app.post("/api/t/:token/start", auth.requireUser, (req, res) => {
  const test = tests.findByToken(req.params.token);
  if (!test) return res.status(404).json({ error: "Ссылка на тест не найдена" });
  try {
    res.json(tests.start(test, req.auth.user));
  } catch (error) {
    res.status(error.status || 400).json({
      error: error.message,
      code: error.code,
      attemptsUsed: error.attemptsUsed,
      attemptsLimit: error.attemptsLimit,
    });
  }
});

app.get("/api/attempts/:id", auth.requireUser, (req, res) => {
  const attempt = tests.findAttempt(req.params.id);
  if (!attempt) return res.status(404).json({ error: "Попытка не найдена" });
  const test = tests.getTest(attempt.testId);
  const owner = Boolean(test && tests.canManage(test, req.auth.user));
  if (attempt.studentId !== req.auth.user.id && !owner) return res.status(403).json({ error: "Нет доступа" });
  res.json(tests.attemptView(attempt, { owner }));
});

app.post("/api/attempts/:id/submit", auth.requireUser, (req, res) => {
  const attempt = tests.findAttempt(req.params.id);
  if (!attempt) return res.status(404).json({ error: "Попытка не найдена" });
  if (attempt.studentId !== req.auth.user.id) return res.status(403).json({ error: "Нет доступа" });
  try {
    res.json(tests.submit(attempt, req.auth.user, req.body?.answers || {}));
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message, code: error.code });
  }
});

app.get("/api/my/attempts", auth.requireUser, (req, res) => {
  res.json({ attempts: tests.myAttempts(req.auth.user.id) });
});

/* ───────────── администрирование ───────────── */

app.get("/api/admin/users", auth.requireRole("admin"), (_req, res) => {
  res.json({ users: auth.listUsers() });
});

app.post("/api/admin/role", auth.requireRole("admin"), (req, res) => {
  const { target, role } = req.body || {};
  if (!["student", "teacher", "admin"].includes(role)) return res.status(400).json({ error: "Неизвестная роль" });
  const user = auth.setRole(target, role);
  if (!user) return res.status(404).json({ error: "Пользователь не найден" });
  res.json({ ok: true, user: auth.publicUser(user) });
});

app.post("/api/admin/code", auth.requireRole("admin"), (req, res) => {
  const role = req.body?.role === "admin" ? "admin" : "teacher";
  const code = auth.createCode(role, req.auth.user.id, req.body?.ttlMinutes);
  res.json({ ok: true, code, role, expiresInMinutes: Number(req.body?.ttlMinutes) || 24 * 60 });
});

const PORT = Number(process.env.PORT) || 3840;
const HOST = process.env.HOST || "0.0.0.0";
app.listen(PORT, HOST, () => {
  console.log(`Наглядник: http://${HOST}:${PORT}`);
  console.log(`Мини-приложение: http://${HOST}:${PORT}/max/`);
  startMaxBot();
  startBot();
});
