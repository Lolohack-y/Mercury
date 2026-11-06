// Тесты учителя: создание, ссылки, попытки учеников, проверка и отчёты.
const crypto = require("crypto");
const store = require("./store");

const TYPES = new Set(["choice", "multi", "judge", "order", "open", "match"]);

function loadTests() {
  const value = store.loadJson("tests.json", { tests: [] });
  if (Array.isArray(value)) return { tests: value };
  if (!value || typeof value !== "object") return { tests: [] };
  if (!Array.isArray(value.tests)) value.tests = [];
  return value;
}

function saveTests(db) {
  store.saveJson("tests.json", db);
}

function loadAttempts() {
  const value = store.loadJson("attempts.json", { attempts: [] });
  if (Array.isArray(value)) return { attempts: value };
  if (!value || typeof value !== "object") return { attempts: [] };
  if (!Array.isArray(value.attempts)) value.attempts = [];
  return value;
}

function saveAttempts(db) {
  store.saveJson("attempts.json", db);
}

function clean(value, limit) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function shuffle(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function isPermutation(list, size) {
  if (!Array.isArray(list) || list.length !== size) return false;
  const seen = new Set();
  for (const value of list) {
    const index = Number(value);
    if (!Number.isInteger(index) || index < 0 || index >= size || seen.has(index)) return false;
    seen.add(index);
  }
  return true;
}

function normalizeQuestion(raw, index) {
  const type = TYPES.has(raw?.type) ? raw.type : "choice";
  const q = clean(raw?.q, 600);
  if (!q) throw new Error(`Вопрос ${index + 1}: добавьте текст задания`);
  let options = Array.isArray(raw?.options) ? raw.options.map((item) => clean(item, 300)).filter(Boolean) : [];
  let answer = null;
  let left = [];
  let right = [];

  if (type === "judge") {
    options = ["Верно", "Неверно"];
    answer = Number(raw?.answer) === 1 ? 1 : 0;
  } else if (type === "open") {
    options = [];
    answer = null;
  } else if (type === "match") {
    left = Array.isArray(raw?.left) ? raw.left.map((item) => clean(item, 300)).filter(Boolean) : [];
    right = Array.isArray(raw?.right) ? raw.right.map((item) => clean(item, 300)).filter(Boolean) : [];
    if (left.length < 2 || right.length < 2) throw new Error(`Вопрос ${index + 1}: нужно минимум две пары`);
    answer = (Array.isArray(raw?.answer) ? raw.answer : []).map(Number);
    if (!isPermutation(answer, left.length) || right.length !== left.length) {
      throw new Error(`Вопрос ${index + 1}: проверьте пары и ответы`);
    }
  } else {
    if (options.length < 2) throw new Error(`Вопрос ${index + 1}: добавьте минимум два варианта`);
    if (type === "choice") {
      answer = Number(raw?.answer);
      if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) {
        throw new Error(`Вопрос ${index + 1}: отметьте верный вариант`);
      }
    } else if (type === "multi") {
      answer = [...new Set((Array.isArray(raw?.answer) ? raw.answer : []).map(Number))].filter(
        (value) => Number.isInteger(value) && value >= 0 && value < options.length
      );
      if (!answer.length || answer.length === options.length) {
        throw new Error(`Вопрос ${index + 1}: отметьте верные варианты (не все)`);
      }
      answer.sort((a, b) => a - b);
    } else if (type === "order") {
      if (Array.isArray(raw?.answer) && raw.answer.length === options.length) {
        answer = raw.answer.map(Number);
        if (!isPermutation(answer, options.length)) throw new Error(`Вопрос ${index + 1}: неверная последовательность`);
      } else {
        answer = options.map((_, itemIndex) => itemIndex);
      }
    }
  }

  const sample = clean(raw?.sample, 1200);
  const keywords = Array.isArray(raw?.keywords)
    ? raw.keywords.map((item) => clean(item, 80)).filter(Boolean)
    : String(raw?.keywords || "")
        .split(",")
        .map((item) => clean(item, 80))
        .filter(Boolean);

  return {
    id: clean(raw?.id, 80) || `q_${crypto.randomBytes(6).toString("hex")}`,
    type,
    q,
    options,
    answer,
    points: Math.max(1, Math.min(20, Number(raw?.points) || 1)),
    sample,
    keywords,
    left,
    right,
  };
}

function normalizeSettings(raw) {
  const attempts = Math.max(1, Math.min(20, Number(raw?.attempts) || 1));
  let deadline = null;
  if (raw?.deadline) {
    const date = new Date(raw.deadline);
    if (!Number.isNaN(date.getTime())) deadline = date.toISOString();
  }
  return {
    attempts,
    deadline,
    shuffleQuestions: raw?.shuffleQuestions !== false,
    shuffleOptions: raw?.shuffleOptions !== false,
    showAnswers: Boolean(raw?.showAnswers),
    timeLimitMin: Math.max(0, Math.min(300, Number(raw?.timeLimitMin) || 0)),
  };
}

function normalizeInput(body) {
  const title = clean(body?.title, 200);
  if (!title) throw new Error("Укажите название теста");
  const questions = (Array.isArray(body?.questions) ? body.questions : []).map(normalizeQuestion);
  if (!questions.length) throw new Error("Добавьте хотя бы одно задание");
  return {
    title,
    subject: clean(body?.subject, 120),
    grade: clean(body?.grade, 20),
    description: clean(body?.description, 1200),
    questions,
    settings: normalizeSettings(body?.settings),
  };
}

function shareToken() {
  return crypto.randomBytes(9).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function isClosed(test) {
  if (!test) return true;
  if (test.status === "closed") return true;
  const deadline = test.settings?.deadline;
  return Boolean(deadline && Date.parse(deadline) <= Date.now());
}

function totalPoints(questions) {
  return (questions || []).reduce((sum, question) => sum + (Number(question.points) || 1), 0);
}

function publicTest(test, { owner = false } = {}) {
  if (!test) return null;
  const base = {
    id: test.id,
    title: test.title,
    subject: test.subject || "",
    grade: test.grade || "",
    description: test.description || "",
    ownerName: test.ownerName || "Учитель",
    questionCount: (test.questions || []).length,
    totalPoints: totalPoints(test.questions),
    settings: {
      attempts: test.settings?.attempts || 1,
      deadline: test.settings?.deadline || null,
      showAnswers: Boolean(test.settings?.showAnswers),
      timeLimitMin: test.settings?.timeLimitMin || 0,
    },
    status: isClosed(test) ? "closed" : "open",
    createdAt: test.createdAt,
    updatedAt: test.updatedAt,
  };
  if (owner) {
    base.shareToken = test.shareToken;
    base.questions = test.questions;
    base.settings = { ...test.settings };
    base.ownerId = test.ownerId;
  }
  return base;
}

function ownerSummary(test) {
  const attempts = loadAttempts().attempts.filter((attempt) => attempt.testId === test.id);
  const students = new Set(attempts.map((attempt) => attempt.studentId));
  return {
    ...publicTest(test, { owner: true }),
    attemptsCount: attempts.length,
    studentsCount: students.size,
    submittedCount: attempts.filter((attempt) => attempt.status === "submitted").length,
  };
}

function listForOwner(ownerId) {
  return loadTests()
    .tests.filter((test) => test.ownerId === ownerId)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .map(ownerSummary);
}

function getTest(id) {
  return loadTests().tests.find((test) => test.id === id) || null;
}

function findByToken(token) {
  const value = String(token || "");
  if (!value) return null;
  return loadTests().tests.find((test) => test.shareToken === value) || null;
}

function canManage(test, user) {
  if (!test || !user) return false;
  return test.ownerId === user.id || user.role === "admin";
}

function create(owner, body) {
  const input = normalizeInput(body);
  const now = new Date().toISOString();
  const test = {
    id: `t_${crypto.randomBytes(8).toString("hex")}`,
    ownerId: owner.id,
    ownerName: owner.name || "Учитель",
    ...input,
    shareToken: shareToken(),
    status: "open",
    createdAt: now,
    updatedAt: now,
    reportSentAt: "",
  };
  const db = loadTests();
  db.tests.push(test);
  saveTests(db);
  return ownerSummary(test);
}

function update(test, body) {
  const input = normalizeInput(body);
  const now = new Date().toISOString();
  test.title = input.title;
  test.subject = input.subject;
  test.grade = input.grade;
  test.description = input.description;
  test.questions = input.questions;
  test.settings = input.settings;
  test.updatedAt = now;
  const db = loadTests();
  const index = db.tests.findIndex((item) => item.id === test.id);
  if (index >= 0) db.tests[index] = test;
  saveTests(db);
  return ownerSummary(test);
}

function remove(test) {
  const db = loadTests();
  db.tests = db.tests.filter((item) => item.id !== test.id);
  saveTests(db);
  const attempts = loadAttempts();
  attempts.attempts = attempts.attempts.filter((attempt) => attempt.testId !== test.id);
  saveAttempts(attempts);
}

function close(test) {
  test.status = "closed";
  test.closedAt = new Date().toISOString();
  test.updatedAt = test.closedAt;
  const db = loadTests();
  const index = db.tests.findIndex((item) => item.id === test.id);
  if (index >= 0) db.tests[index] = test;
  saveTests(db);
  return ownerSummary(test);
}

function attemptsFor(testId, studentId) {
  return loadAttempts().attempts.filter(
    (attempt) => attempt.testId === testId && (!studentId || attempt.studentId === studentId)
  );
}

function activeAttempt(testId, studentId) {
  return loadAttempts().attempts.find(
    (attempt) => attempt.testId === testId && attempt.studentId === studentId && attempt.status === "active"
  );
}

function start(test, user) {
  if (!test) {
    const error = new Error("Тест не найден");
    error.status = 404;
    throw error;
  }
  if (isClosed(test)) {
    const error = new Error("Тест закрыт или срок прохождения истёк");
    error.status = 403;
    throw error;
  }
  const existing = activeAttempt(test.id, user.id);
  if (existing) return attemptView(existing, { owner: false });
  const all = attemptsFor(test.id, user.id);
  const limit = Number(test.settings?.attempts) || 1;
  if (all.length >= limit) {
    const error = new Error(`Попытки закончились: ${all.length} из ${limit}`);
    error.status = 403;
    error.code = "attempts_exhausted";
    error.attemptsUsed = all.length;
    error.attemptsLimit = limit;
    throw error;
  }
  const questions = clone(test.questions || []);
  const order = questions.map((question) => question.id);
  const shuffled = test.settings?.shuffleQuestions !== false ? shuffle(order) : order;
  const optionOrder = {};
  for (const question of questions) {
    const source = question.type === "match" ? question.right || [] : question.options || [];
    const indexes = source.map((_, index) => index);
    const canShuffle = ["choice", "multi", "order", "match"].includes(question.type);
    optionOrder[question.id] =
      canShuffle && test.settings?.shuffleOptions !== false ? shuffle(indexes) : indexes;
  }
  const attempt = {
    id: `a_${crypto.randomBytes(8).toString("hex")}`,
    testId: test.id,
    testTitle: test.title,
    ownerId: test.ownerId,
    ownerName: test.ownerName || "Учитель",
    studentId: user.id,
    studentName: user.name || "Ученик",
    studentMaxId: user.maxId || "",
    startedAt: new Date().toISOString(),
    status: "active",
    attemptNo: all.length + 1,
    attemptsLimit: limit,
    order: shuffled,
    optionOrder,
    questions,
    settings: { ...test.settings },
    maxScore: totalPoints(questions),
    score: null,
    percent: null,
    durationSec: null,
    submittedAt: "",
    details: [],
  };
  const db = loadAttempts();
  db.attempts.push(attempt);
  saveAttempts(db);
  return attemptView(attempt, { owner: false });
}

function displayOptions(attempt, question) {
  const map = attempt.optionOrder?.[question.id] || (question.options || []).map((_, index) => index);
  return { map, options: map.map((index) => question.options[index]) };
}

function attemptView(attempt, { owner = false } = {}) {
  if (!attempt) return null;
  const attemptsUsed = attemptsFor(attempt.testId, attempt.studentId).length;
  const base = {
    id: attempt.id,
    testId: attempt.testId,
    testTitle: attempt.testTitle,
    ownerName: attempt.ownerName,
    studentName: attempt.studentName,
    startedAt: attempt.startedAt,
    deadline: attempt.settings?.deadline || null,
    status: attempt.status,
    attemptNo: attempt.attemptNo,
    attemptsLimit: attempt.attemptsLimit,
    attemptsUsed,
    attemptsLeft: Math.max(0, (Number(attempt.attemptsLimit) || 1) - attemptsUsed),
    maxScore: attempt.maxScore,
  };
  if (attempt.status === "active") {
    const questions = (attempt.order || [])
      .map((id, index) => {
        const question = (attempt.questions || []).find((item) => item.id === id);
        if (!question) return null;
        const { map, options } = displayOptions(attempt, question);
        return {
          id: question.id,
          type: question.type,
          q: question.q,
          options: question.type === "judge" ? ["Верно", "Неверно"] : options,
          left: question.type === "match" ? question.left : [],
          right: question.type === "match" ? map.map((index) => question.right[index]) : [],
          points: question.points,
          index,
        };
      })
      .filter(Boolean);
    return { ...base, questions };
  }
  const canShow = owner || attempt.settings?.showAnswers;
  return {
    ...base,
    score: attempt.score,
    percent: attempt.percent,
    durationSec: attempt.durationSec,
    submittedAt: attempt.submittedAt,
    details: canShow ? attempt.details || [] : [],
  };
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantWords(text) {
  const stop = new Set([
    "это",
    "как",
    "что",
    "для",
    "или",
    "при",
    "его",
    "она",
    "они",
    "быть",
    "было",
    "есть",
    "также",
    "который",
    "которая",
    "которые",
    "через",
    "между",
    "после",
    "перед",
    "только",
    "более",
    "менее",
    "очень",
  ]);
  return [...new Set(normalizeText(text).split(" ").filter((word) => word.length > 4 && !stop.has(word)))];
}

function answerText(question) {
  if (!question) return "";
  const options = question.options || [];
  if (question.type === "choice" || question.type === "judge") return options[question.answer] || "";
  if (question.type === "multi") {
    return (question.answer || []).map((index) => options[index]).filter(Boolean).join("; ");
  }
  if (question.type === "order") {
    return (question.answer || []).map((index) => options[index]).filter(Boolean).join(" → ");
  }
  if (question.type === "match") {
    return (question.answer || [])
      .map((index, position) => `${question.left?.[position] || "?"} → ${question.right?.[index] || "?"}`)
      .join("; ");
  }
  return question.sample || (question.keywords || []).join(", ");
}

function displayAnswerText(question, map, value) {
  const options = question.options || [];
  const toText = (displayIndex) => options[map[Number(displayIndex)]] ?? "";
  if (question.type === "choice" || question.type === "judge") {
    if (value === null || value === undefined || value === "") return "";
    return toText(value);
  }
  if (question.type === "multi" || question.type === "order") {
    return (Array.isArray(value) ? value : []).map(toText).filter(Boolean).join(question.type === "order" ? " → " : "; ");
  }
  return "";
}

function numericList(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => (item === null || item === undefined || item === "" ? null : Number(item)))
    .filter((index) => Number.isInteger(index));
}

function gradeQuestion(attempt, question, value) {
  const map = attempt.optionOrder?.[question.id] || (question.options || []).map((_, index) => index);
  const points = Number(question.points) || 1;
  let correct = false;
  let userAnswer = "";
  let ratio = 0;

  if (question.type === "open") {
    const text = String(value || "").slice(0, 4000);
    userAnswer = text;
    const keywords = (question.keywords || []).length ? question.keywords : significantWords(question.sample);
    const normalized = normalizeText(text);
    const matched = keywords.filter((keyword) => normalized.includes(normalizeText(keyword))).length;
    ratio = keywords.length ? matched / keywords.length : 0;
    correct = ratio >= Number(process.env.OPEN_ANSWER_THRESHOLD || 0.5);
  } else if (question.type === "choice" || question.type === "judge") {
    const answered = value !== null && value !== undefined && value !== "";
    const displayIndex = answered ? Number(value) : NaN;
    const original = Number.isInteger(displayIndex) ? map[displayIndex] : undefined;
    correct = original !== undefined && original === Number(question.answer);
    userAnswer = displayAnswerText(question, map, value);
  } else if (question.type === "multi") {
    const list = numericList(value);
    const original = [...new Set(list.map((index) => map[index]).filter((index) => index != null))].sort((a, b) => a - b);
    const expected = [...(question.answer || [])].sort((a, b) => a - b);
    correct = original.length === expected.length && original.every((index, position) => index === expected[position]);
    userAnswer = displayAnswerText(question, map, list);
  } else if (question.type === "order") {
    const list = numericList(value);
    const original = list.map((index) => map[index]).filter((index) => index != null);
    correct =
      original.length === (question.answer || []).length &&
      original.every((index, position) => index === question.answer[position]);
    userAnswer = displayAnswerText(question, map, list);
  } else if (question.type === "match") {
    const list = numericList(value);
    const original = list.map((index) => map[index]).filter((index) => index != null);
    correct =
      original.length === (question.answer || []).length &&
      original.every((index, position) => index === question.answer[position]);
    userAnswer = list
      .map((index, position) => `${question.left?.[position] || "?"} → ${question.right?.[map[index]] || "?"}`)
      .join("; ");
  }

  return {
    qid: question.id,
    type: question.type,
    q: question.q,
    points,
    got: correct ? points : 0,
    correct,
    ratio: Math.round(ratio * 100) / 100,
    userAnswer,
    correctAnswer: answerText(question),
  };
}

function submit(attempt, user, answers) {
  if (!attempt || attempt.studentId !== user.id) {
    const error = new Error("Попытка не найдена");
    error.status = 404;
    throw error;
  }
  if (attempt.status !== "active") {
    const error = new Error("Попытка уже завершена");
    error.status = 409;
    throw error;
  }
  const deadline = attempt.settings?.deadline;
  if (deadline && Date.now() > Date.parse(deadline) + 60_000) {
    const error = new Error("Время на прохождение теста истекло");
    error.status = 403;
    throw error;
  }
  const source = answers && typeof answers === "object" ? answers : {};
  const details = [];
  let score = 0;
  for (const id of attempt.order || []) {
    const question = (attempt.questions || []).find((item) => item.id === id);
    if (!question) continue;
    const result = gradeQuestion(attempt, question, source[id]);
    details.push(result);
    score += result.got;
  }
  const now = new Date();
  const started = Date.parse(attempt.startedAt) || now.getTime();
  attempt.status = "submitted";
  attempt.submittedAt = now.toISOString();
  attempt.score = Math.round(score * 10) / 10;
  attempt.maxScore = totalPoints(attempt.questions);
  attempt.percent = attempt.maxScore ? Math.round((attempt.score / attempt.maxScore) * 100) : 0;
  attempt.durationSec = Math.max(0, Math.round((now.getTime() - started) / 1000));
  attempt.details = details;
  attempt.answers = source;

  const db = loadAttempts();
  const index = db.attempts.findIndex((item) => item.id === attempt.id);
  if (index >= 0) db.attempts[index] = attempt;
  saveAttempts(db);
  return attemptView(attempt, { owner: false });
}

function findAttempt(id) {
  return loadAttempts().attempts.find((attempt) => attempt.id === id) || null;
}

function results(test) {
  const attempts = attemptsFor(test.id);
  const byStudent = new Map();
  for (const attempt of attempts) {
    if (!byStudent.has(attempt.studentId)) {
      byStudent.set(attempt.studentId, {
        id: attempt.studentId,
        name: attempt.studentName || "Ученик",
        maxId: attempt.studentMaxId || "",
        attempts: [],
      });
    }
    byStudent.get(attempt.studentId).attempts.push({
      id: attempt.id,
      attemptNo: attempt.attemptNo,
      status: attempt.status,
      score: attempt.score,
      maxScore: attempt.maxScore,
      percent: attempt.percent,
      durationSec: attempt.durationSec,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      details: attempt.status === "submitted" ? attempt.details || [] : [],
    });
  }
  const students = [...byStudent.values()]
    .map((student) => {
      const submitted = student.attempts.filter((attempt) => attempt.status === "submitted");
      const best = submitted.reduce((top, attempt) => Math.max(top, Number(attempt.percent) || 0), 0);
      const last = submitted.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)))[0] || null;
      return {
        ...student,
        attemptsCount: student.attempts.length,
        submittedCount: submitted.length,
        activeCount: student.attempts.filter((attempt) => attempt.status === "active").length,
        bestPercent: best,
        lastScore: last?.score ?? null,
        lastPercent: last?.percent ?? null,
        lastSubmittedAt: last?.submittedAt || "",
        totalDurationSec: submitted.reduce((sum, attempt) => sum + (Number(attempt.durationSec) || 0), 0),
        attemptsList: student.attempts.sort((a, b) => (a.attemptNo || 0) - (b.attemptNo || 0)),
      };
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "ru"));
  const withSubmissions = students.filter((student) => student.submittedCount > 0);
  return {
    test: {
      ...publicTest(test, { owner: true }),
      shareToken: test.shareToken,
    },
    summary: {
      students: students.length,
      submitted: withSubmissions.length,
      averagePercent: withSubmissions.length
        ? Math.round(withSubmissions.reduce((sum, student) => sum + student.bestPercent, 0) / withSubmissions.length)
        : 0,
      bestPercent: students.reduce((top, student) => Math.max(top, student.bestPercent), 0),
    },
    students,
  };
}

function myAttempts(userId) {
  const tests = loadTests().tests;
  const byId = new Map(tests.map((test) => [test.id, test]));
  return loadAttempts()
    .attempts.filter((attempt) => attempt.studentId === userId && attempt.status === "submitted")
    .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)))
    .map((attempt) => {
      const test = byId.get(attempt.testId);
      return {
        id: attempt.id,
        testId: attempt.testId,
        testTitle: attempt.testTitle || test?.title || "Тест",
        ownerName: attempt.ownerName || test?.ownerName || "Учитель",
        score: attempt.score,
        maxScore: attempt.maxScore,
        percent: attempt.percent,
        durationSec: attempt.durationSec,
        submittedAt: attempt.submittedAt,
        attemptNo: attempt.attemptNo,
        shareToken: test?.shareToken || "",
        status: test ? (isClosed(test) ? "closed" : "open") : "deleted",
      };
    });
}

function dueReports(now = new Date()) {
  const db = loadTests();
  const due = [];
  let changed = false;
  for (const test of db.tests) {
    const deadline = test.settings?.deadline;
    if (!deadline) continue;
    if (test.reportSentAt) continue;
    if (Date.parse(deadline) > now.getTime()) continue;
    if (test.status !== "closed") {
      test.status = "closed";
      test.closedAt = now.toISOString();
      changed = true;
    }
    due.push(test);
  }
  if (changed) saveTests(db);
  return due;
}

function markReported(testId) {
  const db = loadTests();
  const test = db.tests.find((item) => item.id === testId);
  if (!test) return false;
  test.reportSentAt = new Date().toISOString();
  saveTests(db);
  return true;
}

module.exports = {
  TYPES,
  listForOwner,
  getTest,
  findByToken,
  canManage,
  create,
  update,
  remove,
  close,
  start,
  submit,
  findAttempt,
  attemptView,
  results,
  myAttempts,
  dueReports,
  markReported,
  publicTest,
  ownerSummary,
  totalPoints,
  answerText,
};
