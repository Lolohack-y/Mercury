// Статистика запросов к ИИ и активности приложения.
const store = require("./store");

function empty() {
  return {
    ai: { total: 0, ok: 0, fail: 0, byDay: {}, byProvider: {}, byUser: {} },
    recent: [],
  };
}

function load() {
  const data = store.loadJson("stats.json", empty());
  if (!data || typeof data !== "object") return empty();
  if (!data.ai) data.ai = empty().ai;
  if (!Array.isArray(data.recent)) data.recent = [];
  return data;
}

function save(data) {
  store.saveJson("stats.json", data);
}

function dayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function bump(map, key) {
  const name = String(key || "unknown");
  map[name] = map[name] || { total: 0, ok: 0, fail: 0 };
  return map[name];
}

function recordAi(entry) {
  const data = load();
  const ai = data.ai;
  const day = dayKey();
  const ok = Boolean(entry.ok);
  ai.total += 1;
  if (ok) ai.ok += 1;
  else ai.fail += 1;
  ai.byDay[day] = ai.byDay[day] || { total: 0, ok: 0, fail: 0, providers: {} };
  const daily = ai.byDay[day];
  daily.total += 1;
  if (ok) daily.ok += 1;
  else daily.fail += 1;
  const provider = bump(daily.providers, entry.provider);
  provider.total += 1;
  if (ok) provider.ok += 1;
  else provider.fail += 1;
  const byProvider = bump(ai.byProvider, entry.provider);
  byProvider.total += 1;
  if (ok) byProvider.ok += 1;
  else byProvider.fail += 1;
  const userId = String(entry.userId || "system");
  ai.byUser[userId] = ai.byUser[userId] || {
    name: entry.userName || "Система",
    total: 0,
    ok: 0,
    fail: 0,
    lastAt: "",
  };
  const byUser = ai.byUser[userId];
  byUser.name = entry.userName || byUser.name;
  byUser.total += 1;
  if (ok) byUser.ok += 1;
  else byUser.fail += 1;
  byUser.lastAt = new Date().toISOString();
  data.recent.unshift({
    at: new Date().toISOString(),
    userId,
    userName: entry.userName || "Система",
    provider: entry.provider || "",
    source: entry.source || "",
    ok,
    ms: Number(entry.ms) || 0,
    error: String(entry.error || "").slice(0, 240),
  });
  data.recent = data.recent.slice(0, 300);
  save(data);
}

function summary() {
  const data = load();
  const today = dayKey();
  return {
    today: data.ai.byDay[today] || { total: 0, ok: 0, fail: 0, providers: {} },
    totals: { total: data.ai.total, ok: data.ai.ok, fail: data.ai.fail },
    byProvider: data.ai.byProvider,
    byUser: Object.entries(data.ai.byUser)
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 50),
    recent: data.recent.slice(0, 30),
  };
}

module.exports = { recordAi, summary, load, dayKey };
