// ИИ: общий пул ключей с ротацией, личные ключи пользователей, лимиты и статистика.
const crypto = require("crypto");
const https = require("https");
const store = require("./store");
const auth = require("./auth");
const stats = require("./stats");

const NAMES = {
  gigachat: "GigaChat",
  yandex: "Алиса",
  openai: "OpenAI",
};

function sberRequest(url, { method, headers, body, timeout = 45000 }) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers, rejectUnauthorized: false, timeout }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let data = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          data = { message: text.slice(0, 180) };
        }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("GigaChat не ответил вовремя")));
    if (body) req.write(body);
    req.end();
  });
}

function envList(...names) {
  const out = [];
  for (const name of names) {
    const raw = String(process.env[name] || "");
    if (!raw) continue;
    for (const part of raw.split(/[,\n;]+/)) {
      const value = part.trim();
      if (value) out.push(value);
    }
  }
  return out;
}

function cleanKey(value) {
  return String(value || "")
    .trim()
    .replace(/^Basic\s+/i, "")
    .replace(/^Api-Key\s+/i, "")
    .replace(/\s+/g, "");
}

function keyId(provider, key, folder = "") {
  const hash = crypto.createHash("sha256").update(`${provider}|${key}|${folder}`).digest("hex").slice(0, 12);
  return `${provider}:${hash}`;
}

function legacyFile() {
  return store.loadJson("ai.json", {});
}

function sharedEntries() {
  const file = legacyFile();
  const folder = String(process.env.YANDEX_FOLDER_ID || file.yandexFolder || "").trim();
  const entries = [];
  const seen = new Set();
  const add = (provider, rawKey, itemFolder = "", label = "") => {
    const key = cleanKey(rawKey);
    if (!key) return;
    if (provider === "yandex" && !String(itemFolder || "").trim()) return;
    const id = keyId(provider, key, itemFolder);
    if (seen.has(id)) return;
    seen.add(id);
    entries.push({ id, provider, key, folder: itemFolder || "", label: label || "pool" });
  };
  for (const key of envList("GIGACHAT_AUTH_KEYS", "GIGACHAT_AUTH_KEY", "GIGACHAT_CREDENTIALS")) {
    add("gigachat", key, "", "env");
  }
  if (file.gigachatKey) add("gigachat", file.gigachatKey, "", "ai.json");
  for (const key of envList("YANDEX_API_KEYS", "YANDEX_API_KEY")) add("yandex", key, folder, "env");
  if (file.yandexKey) add("yandex", file.yandexKey, file.yandexFolder || folder, "ai.json");
  for (const key of envList("OPENAI_API_KEYS", "OPENAI_API_KEY")) add("openai", key, "", "env");
  if (file.openaiKey) add("openai", file.openaiKey, "", "ai.json");
  return entries;
}

function poolState() {
  const value = store.loadJson("ai-pool.json", {});
  return value && typeof value === "object" ? value : {};
}

function savePoolState(value) {
  store.saveJson("ai-pool.json", value);
}

function preferredProvider() {
  const file = legacyFile();
  const requested = String(file.provider || process.env.AI_PROVIDER || "").trim();
  return ["gigachat", "yandex", "openai"].includes(requested) ? requested : "gigachat";
}

function ownEntries(user) {
  const keys = auth.getUserKeys(user);
  const entries = [];
  if (keys.gigachat) entries.push({ id: "own:gigachat", provider: "gigachat", key: keys.gigachat, own: true });
  if (keys.yandex?.key) {
    entries.push({ id: "own:yandex", provider: "yandex", key: keys.yandex.key, folder: keys.yandex.folder, own: true });
  }
  if (keys.openai) entries.push({ id: "own:openai", provider: "openai", key: keys.openai, own: true });
  return entries;
}

function candidates(user, { onlyOwn = false, system = false } = {}) {
  const own = user ? ownEntries(user) : [];
  const pref = preferredProvider();
  const order = (list) =>
    list.slice().sort((a, b) => {
      const pa = a.provider === pref ? 0 : 1;
      const pb = b.provider === pref ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return String(a.provider).localeCompare(String(b.provider));
    });
  if (own.length) return order(own);
  if (onlyOwn) return [];
  if (!system && user && !own.length) {
    // личных ключей нет — используем общий пул
  }
  const state = poolState();
  const now = Date.now();
  const shared = sharedEntries().map((entry) => {
    const saved = state[entry.id] || {};
    return {
      ...entry,
      own: false,
      cooldownUntil: Number(saved.cooldownUntil) || 0,
      lastUsed: Number(saved.lastUsed) || 0,
      fails: Number(saved.fails) || 0,
    };
  });
  const available = shared.filter((entry) => entry.cooldownUntil <= now);
  return available.sort((a, b) => {
    const pa = a.provider === pref ? 0 : 1;
    const pb = b.provider === pref ? 0 : 1;
    if (pa !== pb) return pa - pb;
    if (a.lastUsed !== b.lastUsed) return a.lastUsed - b.lastUsed;
    return a.fails - b.fails;
  });
}

function statusFor(user) {
  const own = user ? ownEntries(user) : [];
  const shared = sharedEntries();
  const providers = [...new Set([...own.map((entry) => entry.provider), ...shared.map((entry) => entry.provider)])];
  const pref = preferredProvider();
  const provider = providers.includes(pref) ? pref : providers[0] || pref;
  const authenticated = Boolean(user);
  const ready = authenticated && providers.length > 0;
  const quota = auth.quotaFor(user);
  return {
    ready,
    provider,
    name: NAMES[provider] || provider,
    authenticated,
    role: user?.role || "guest",
    source: own.length ? "own" : shared.length ? "shared" : "none",
    ownKey: own.length > 0,
    ownProviders: own.map((entry) => entry.provider),
    providers: providers.map((id) => ({ id, name: NAMES[id] || id })),
    pool: {
      keys: shared.length,
      providers: [...new Set(shared.map((entry) => entry.provider))],
    },
    quota,
    reason: !authenticated ? "auth" : !providers.length ? "no_keys" : "",
  };
}

function status() {
  const info = statusFor(null);
  return { ...info, ready: sharedEntries().length > 0 };
}

let tokenCache = new Map();

async function gigachatToken(entry) {
  const cached = tokenCache.get(entry.id);
  if (cached && Date.now() < cached.until - 60_000) return cached.token;
  const scope = process.env.GIGACHAT_SCOPE || "GIGACHAT_API_PERS";
  const res = await sberRequest("https://ngw.devices.sberbank.ru:9443/api/v2/oauth", {
    method: "POST",
    headers: {
      Authorization: `Basic ${entry.key}`,
      RqUID: crypto.randomUUID(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: `scope=${encodeURIComponent(scope)}`,
    timeout: 20000,
  });
  const data = res.data || {};
  if (!res.ok || !data.access_token) {
    const error = new Error(data.message || data.error_description || "GigaChat не принял ключ авторизации");
    error.statusCode = res.status || 401;
    throw error;
  }
  let until = Number(data.expires_at) || 0;
  if (until && until < 1e12) until *= 1000;
  tokenCache.set(entry.id, { token: data.access_token, until: until || Date.now() + 25 * 60 * 1000 });
  return data.access_token;
}

async function gigachatChat(entry, messages) {
  const access = await gigachatToken(entry);
  const model = process.env.GIGACHAT_MODEL || "GigaChat";
  const payload = JSON.stringify({ model, temperature: 0.2, messages });
  const res = await sberRequest("https://api.giga.chat/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    },
    body: payload,
  });
  const data = res.data || {};
  if (!res.ok) {
    const error = new Error(data.message || "GigaChat не ответил");
    error.statusCode = res.status;
    throw error;
  }
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("GigaChat вернул пустой ответ");
  return text;
}

async function yandexChat(entry, messages) {
  const model = process.env.YANDEX_MODEL || "yandexgpt-lite";
  const res = await fetch("https://llm.api.cloud.yandex.net/foundationModels/v1/completion", {
    method: "POST",
    headers: {
      Authorization: `Api-Key ${entry.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      modelUri: `gpt://${entry.folder}/${model}/latest`,
      completionOptions: { stream: false, temperature: 0.2, maxTokens: "2500" },
      messages: messages.map((m) => ({ role: m.role, text: m.content })),
    }),
    signal: AbortSignal.timeout(45000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error?.message || data.message || "Алиса не ответила");
    error.statusCode = res.status;
    throw error;
  }
  const text = data.result?.alternatives?.[0]?.message?.text;
  if (!text) throw new Error("Алиса вернула пустой ответ");
  return text;
}

async function openaiChat(entry, messages) {
  const base = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${entry.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, temperature: 0.2, messages }),
    signal: AbortSignal.timeout(45000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error?.message || "Модель не ответила");
    error.statusCode = res.status;
    throw error;
  }
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Модель вернула пустой ответ");
  return text;
}

function callProvider(entry, messages) {
  if (entry.provider === "yandex") return yandexChat(entry, messages);
  if (entry.provider === "openai") return openaiChat(entry, messages);
  return gigachatChat(entry, messages);
}

function cooldownFor(error) {
  const statusCode = Number(error?.statusCode || error?.status) || 0;
  const message = String(error?.message || "").toLowerCase();
  if (statusCode === 401 || statusCode === 403) return 24 * 60 * 60 * 1000;
  if (statusCode === 429 || /limit|quota|превыш|rate|слишком много/i.test(message)) {
    return Math.max(1, Number(process.env.AI_KEY_COOLDOWN_MIN || 30)) * 60 * 1000;
  }
  if (/timeout|timed out|не ответил|fetch failed|enotfound|econn/i.test(message)) return 2 * 60 * 1000;
  return 10 * 60 * 1000;
}

function touchPool(entry, ok, error) {
  if (entry.own) return;
  const state = poolState();
  const row = state[entry.id] || { fails: 0, cooldownUntil: 0, lastUsed: 0 };
  row.lastUsed = Date.now();
  if (ok) {
    row.fails = 0;
    row.cooldownUntil = 0;
    row.lastError = "";
    row.lastOkAt = new Date().toISOString();
  } else {
    row.fails = (Number(row.fails) || 0) + 1;
    row.cooldownUntil = Date.now() + cooldownFor(error);
    row.lastError = String(error?.message || "ошибка").slice(0, 240);
  }
  state[entry.id] = row;
  savePoolState(state);
}

async function chat(messages, ctx = {}) {
  const user = ctx.user || null;
  const system = Boolean(ctx.system);
  if (!user && !system) {
    const error = new Error("ИИ доступен после входа через MAX");
    error.status = 401;
    throw error;
  }
  const list = candidates(user, { onlyOwn: Boolean(ctx.onlyOwn), system });
  if (!list.length) {
    const error = new Error(
      user
        ? "ИИ не подключён: нет общего ключа. Добавьте свой ключ в настройках."
        : "ИИ не подключён: администратор не настроил общий пул ключей."
    );
    error.status = 400;
    throw error;
  }
  let lastError = null;
  for (const entry of list) {
    const started = Date.now();
    try {
      const text = await callProvider(entry, messages);
      touchPool(entry, true);
      if (!ctx.silent) {
        stats.recordAi({
          userId: user?.id || "system",
          userName: user?.name || "Система",
          provider: entry.provider,
          source: entry.own ? "own" : "shared",
          ok: true,
          ms: Date.now() - started,
        });
      }
      return text;
    } catch (error) {
      lastError = error;
      touchPool(entry, false, error);
      if (!ctx.silent) {
        stats.recordAi({
          userId: user?.id || "system",
          userName: user?.name || "Система",
          provider: entry.provider,
          source: entry.own ? "own" : "shared",
          ok: false,
          ms: Date.now() - started,
          error: error.message,
        });
      }
    }
  }
  const error = new Error(
    list.length > 1
      ? `Не удалось получить ответ ИИ: ${lastError?.message || "все ключи временно недоступны"}`
      : lastError?.message || "ИИ не ответил"
  );
  error.status = lastError?.statusCode === 401 ? 401 : 502;
  throw error;
}

function beginRequest(user) {
  if (!user) {
    const error = new Error("ИИ доступен после входа через MAX");
    error.status = 401;
    error.code = "auth_required";
    throw error;
  }
  const info = statusFor(user);
  if (!info.ready) {
    const error = new Error("ИИ не подключён: нет общего ключа. Добавьте свой ключ в настройках.");
    error.status = 400;
    error.code = "no_keys";
    throw error;
  }
  const quota = auth.consumeQuota(user);
  if (!quota.ok) {
    const error = new Error(
      quota.reason === "limit"
        ? `Лимит ИИ: ${quota.quota.limit} запросов в день. Свой ключ в настройках снимает ограничение.`
        : "ИИ доступен после входа через MAX"
    );
    error.status = quota.reason === "limit" ? 429 : 401;
    error.code = quota.reason;
    error.quota = quota.quota;
    throw error;
  }
  return { user, unlimited: Boolean(quota.unlimited), quota: quota.quota };
}

function finishRequest(_ctx, _info) {
  // Запрос уже учтён при старте; статистика пишется на каждый вызов модели.
}

async function ping(user, { onlyOwn = false } = {}) {
  const fresh = user?.id ? auth.findUser(user.id) || user : user;
  const info = statusFor(fresh);
  if (!info.ready) {
    return {
      ...info,
      ok: false,
      error: info.authenticated ? "ИИ не подключён: добавьте ключ" : "Войдите через MAX",
    };
  }
  try {
    const text = await chat(
      [
        { role: "system", content: "Ответь одним словом: готово" },
        { role: "user", content: "Проверка связи" },
      ],
      { user: fresh, onlyOwn, silent: true }
    );
    return { ...info, ok: true, sample: String(text).slice(0, 80) };
  } catch (error) {
    return { ...info, ok: false, error: error.message || "Не удалось связаться с моделью" };
  }
}

async function saveUserKey(user, { provider, key, folder }) {
  const name = String(provider || "").toLowerCase();
  if (!["gigachat", "yandex", "openai"].includes(name)) throw new Error("Выберите провайдера ИИ");
  auth.setUserKey(user.id, name, key, folder);
  const fresh = auth.findUser(user.id);
  const result = await ping(fresh, { onlyOwn: true });
  if (!result.ok) {
    auth.clearUserKey(user.id, name);
    throw new Error(result.error || "Ключ не прошёл проверку");
  }
  return result;
}

function clearUserKey(user, provider) {
  auth.clearUserKey(user.id, provider);
  return statusFor(auth.findUser(user.id) || user);
}

function saveSettings({ provider, key, folder }) {
  const current = legacyFile();
  const next = { ...current };
  if (["gigachat", "yandex", "openai"].includes(provider)) next.provider = provider;
  const secret = cleanKey(key);
  if (secret && next.provider === "yandex") next.yandexKey = secret;
  else if (secret && next.provider === "openai") next.openaiKey = secret;
  else if (secret) next.gigachatKey = secret;
  if (folder && String(folder).trim()) next.yandexFolder = String(folder).trim();
  store.saveJson("ai.json", next);
  tokenCache = new Map();
  return status();
}

function poolInfo() {
  const state = poolState();
  const now = Date.now();
  const keys = sharedEntries().map((entry) => {
    const saved = state[entry.id] || {};
    return {
      id: entry.id,
      provider: entry.provider,
      name: NAMES[entry.provider] || entry.provider,
      label: entry.label,
      tail: entry.key.slice(-4),
      cooldownUntil: Number(saved.cooldownUntil) || 0,
      available: (Number(saved.cooldownUntil) || 0) <= now,
      fails: Number(saved.fails) || 0,
      lastUsed: Number(saved.lastUsed) || 0,
      lastError: saved.lastError || "",
    };
  });
  return {
    total: keys.length,
    available: keys.filter((item) => item.available).length,
    providers: [...new Set(keys.map((item) => item.provider))],
    keys,
  };
}

module.exports = {
  NAMES,
  status,
  statusFor,
  chat,
  ping,
  beginRequest,
  finishRequest,
  saveUserKey,
  clearUserKey,
  saveSettings,
  poolInfo,
};
