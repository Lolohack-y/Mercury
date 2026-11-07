const store = require("./store");

function limit() {
  const n = Number(process.env.AI_DAILY_LIMIT || 8);
  return Number.isFinite(n) && n > 0 ? Math.min(100, Math.floor(n)) : 8;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function read() {
  const saved = store.loadJson("quota.json", { day: today(), used: 0 });
  if (saved.day !== today()) return { day: today(), used: 0 };
  return { day: saved.day, used: Number(saved.used) || 0 };
}

function peekQuota() {
  const state = read();
  const max = limit();
  return { used: state.used, limit: max, left: Math.max(0, max - state.used) };
}

function takeQuota() {
  const state = read();
  const max = limit();
  if (state.used >= max) return { ok: false, used: state.used, limit: max, left: 0 };
  state.used += 1;
  store.saveJson("quota.json", state);
  return { ok: true, used: state.used, limit: max, left: max - state.used };
}

module.exports = { peekQuota, takeQuota };
