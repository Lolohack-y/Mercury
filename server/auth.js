const crypto = require("crypto");

const sessions = new Map();
const WEEK = 7 * 24 * 60 * 60 * 1000;

function teacherPassword() {
  return String(process.env.TEACHER_PASSWORD || "");
}

function loginEnabled() {
  return teacherPassword().length > 0;
}

function login(password) {
  const expected = teacherPassword();
  if (!expected) {
    const error = new Error("Вход учителя не настроен. Задайте TEACHER_PASSWORD в файле .env и перезапустите сервер.");
    error.status = 503;
    throw error;
  }
  const given = Buffer.from(String(password || ""));
  const need = Buffer.from(expected);
  const same = given.length === need.length && crypto.timingSafeEqual(given, need);
  if (!same) {
    const error = new Error("Неверный пароль учителя");
    error.status = 401;
    throw error;
  }
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, Date.now() + WEEK);
  return token;
}

function logout(token) {
  if (token) sessions.delete(token);
}

function tokenOf(req) {
  const header = String(req.headers.authorization || "");
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function isTeacher(req) {
  const token = tokenOf(req);
  const until = sessions.get(token);
  if (!until) return false;
  if (until < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

module.exports = { loginEnabled, login, logout, tokenOf, isTeacher };
