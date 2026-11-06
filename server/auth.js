// Пользователи, роли, сессии и проверка MAX initData.
// Авторизация необязательна для чтения, но нужна для ИИ и прав учителя.
const crypto = require("crypto");
const store = require("./store");

const COOKIE = "nag_session";
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const ROLES = new Set(["student", "teacher", "admin"]);

function b64url(buffer) {
  return Buffer.from(buffer).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value) {
  const text = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(text, "base64");
}

function secret() {
  return process.env.SESSION_SECRET || process.env.MAX_BOT_TOKEN || "nagliadnost-local-secret";
}

function sign(value) {
  return crypto.createHmac("sha256", secret()).update(value).digest("hex");
}

function makeSession(userId) {
  const payload = b64url(JSON.stringify({ uid: userId, exp: Date.now() + SESSION_TTL }));
  return `${payload}.${sign(payload)}`;
}

function readSession(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (expected.length !== signature.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
    const data = JSON.parse(fromB64url(payload).toString("utf8"));
    if (!data?.uid || !data?.exp || data.exp < Date.now()) return null;
    return data.uid;
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

function setSessionCookie(res, userId) {
  const secure = String(process.env.WEBAPP_URL || "").startsWith("https://") || process.env.NODE_ENV === "production";
  const cookie = `${COOKIE}=${encodeURIComponent(makeSession(userId))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(
    SESSION_TTL / 1000
  )}${secure ? "; Secure" : ""}`;
  res.append("Set-Cookie", cookie);
}

function clearSessionCookie(res) {
  res.append("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function usersDb() {
  const db = store.loadJson("users.json", { users: {}, codes: {} });
  if (!db || typeof db !== "object") return { users: {}, codes: {} };
  if (!db.users || typeof db.users !== "object") db.users = {};
  if (!db.codes || typeof db.codes !== "object") db.codes = {};
  return db;
}

function saveDb(db) {
  store.saveJson("users.json", db);
}

function envIds(name) {
  return String(process.env[name] || "")
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function roleFromEnv(maxId) {
  const id = String(maxId || "");
  if (!id) return "";
  if (envIds("ADMIN_MAX_IDS").includes(id)) return "admin";
  if (envIds("TEACHER_MAX_IDS").includes(id)) return "teacher";
  return "";
}

function normalizeRole(role) {
  const value = String(role || "").toLowerCase();
  return ROLES.has(value) ? value : "student";
}

function displayName(info) {
  const parts = [info?.first_name, info?.last_name].filter(Boolean).join(" ").trim();
  return String(parts || info?.name || info?.username || "Пользователь").slice(0, 120);
}

function upsertMaxUser(info) {
  const maxId = String(info?.id ?? info?.user_id ?? "").trim();
  if (!maxId) return null;
  const db = usersDb();
  const id = `max_${maxId}`;
  const now = new Date().toISOString();
  const envRole = roleFromEnv(maxId);
  let user = db.users[id];
  if (!user) {
    user = {
      id,
      maxId,
      name: displayName(info),
      username: String(info?.username || ""),
      avatar: String(info?.photo_url || ""),
      role: envRole || "student",
      roleSource: envRole ? "env" : "default",
      source: "max",
      createdAt: now,
      lastSeen: now,
      aiKeys: {},
      quota: { date: "", count: 0 },
    };
    db.users[id] = user;
  } else {
    user.maxId = maxId;
    user.name = displayName(info) || user.name;
    user.username = String(info?.username || user.username || "");
    user.avatar = String(info?.photo_url || user.avatar || "");
    user.lastSeen = now;
    if (envRole && user.role !== envRole) {
      user.role = envRole;
      user.roleSource = "env";
    }
  }
  saveDb(db);
  return user;
}

function verifyInitData(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const token = String(process.env.MAX_BOT_TOKEN || "").trim();
  let params;
  try {
    params = new URLSearchParams(text);
  } catch {
    return null;
  }
  if (!token) {
    if (process.env.DEV_TRUST_INIT_DATA !== "1") return null;
  } else {
    const hash = String(params.get("hash") || "").toLowerCase();
    if (!hash) return null;
    const pairs = [];
    for (const [key, value] of params.entries()) {
      if (key === "hash") continue;
      pairs.push(`${key}=${value}`);
    }
    pairs.sort();
    const dataCheckString = pairs.join("\n");
    // MAX: secret = HMAC_SHA256("WebAppData", botToken), затем HMAC от строки параметров.
    const secretKey = crypto.createHmac("sha256", "WebAppData").update(token).digest();
    const signature = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    if (signature.length !== hash.length) return null;
    try {
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(hash))) return null;
    } catch {
      return null;
    }
    const authDate = Number(params.get("auth_date")) * 1000;
    const maxAge = Number(process.env.AUTH_MAX_AGE_HOURS || 24) * 60 * 60 * 1000;
    if (authDate && Date.now() - authDate > maxAge) return null;
  }
  let user = null;
  try {
    const rawUser = params.get("user");
    if (rawUser) user = JSON.parse(rawUser);
  } catch {
    user = null;
  }
  if (!user) {
    const id = params.get("user_id") || params.get("id");
    if (id) {
      user = {
        id,
        first_name: params.get("first_name") || params.get("name") || "",
        last_name: params.get("last_name") || "",
        username: params.get("username") || "",
        photo_url: params.get("photo_url") || "",
      };
    }
  }
  if (!user?.id && !user?.user_id) return null;
  return { params: Object.fromEntries(params), user };
}

function middleware(req, _res, next) {
  req.auth = { user: null, guest: true };
  const raw = req.get("x-max-init-data") || String(req.query?.initData || "");
  if (raw) {
    const data = verifyInitData(raw);
    if (data?.user) {
      const user = upsertMaxUser(data.user);
      if (user && !user.blocked) {
        req.auth.user = user;
        req.auth.guest = false;
        req.auth.fresh = true;
      }
    }
  }
  if (!req.auth.user) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    const userId = readSession(token);
    if (userId) {
      const user = usersDb().users[userId];
      if (user && !user.blocked) {
        req.auth.user = user;
        req.auth.guest = false;
      }
    }
  }
  next();
}

function afterAuth(req, res, next) {
  if (req.auth?.fresh && req.auth.user) setSessionCookie(res, req.auth.user.id);
  next();
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    maxId: user.maxId || "",
    name: user.name || "Пользователь",
    username: user.username || "",
    avatar: user.avatar || "",
    role: normalizeRole(user.role),
    source: user.source || "max",
    ownKeys: user.aiKeys ? Object.keys(user.aiKeys) : [],
    createdAt: user.createdAt || "",
    lastSeen: user.lastSeen || "",
  };
}

function requireUser(req, res, next) {
  if (!req.auth?.user) {
    return res.status(401).json({ error: "Нужен вход через MAX", code: "auth_required" });
  }
  next();
}

function requireRole(...roles) {
  const allowed = new Set(roles.flat().map(normalizeRole));
  return (req, res, next) => {
    if (!req.auth?.user) {
      return res.status(401).json({ error: "Нужен вход через MAX", code: "auth_required" });
    }
    if (!allowed.has(normalizeRole(req.auth.user.role))) {
      return res.status(403).json({ error: "Недостаточно прав", code: "forbidden", role: req.auth.user.role });
    }
    next();
  };
}

function updateUser(userId, mutate) {
  const db = usersDb();
  const user = db.users[userId];
  if (!user) return null;
  mutate(user);
  saveDb(db);
  return user;
}

function todayMoscow() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function hasOwnKeys(user) {
  return Boolean(user?.aiKeys && Object.keys(user.aiKeys).length);
}

function quotaFor(user) {
  if (!user) {
    return { date: todayMoscow(), limit: 0, used: 0, remaining: 0, unlimited: false, authenticated: false };
  }
  const today = todayMoscow();
  const unlimited = hasOwnKeys(user);
  const limit = unlimited
    ? null
    : normalizeRole(user.role) === "student"
      ? Number(process.env.DAILY_AI || 5)
      : Number(process.env.TEACHER_DAILY_AI || 50);
  const used = user.quota?.date === today ? Number(user.quota.count) || 0 : 0;
  return {
    date: today,
    limit: unlimited ? null : Math.max(0, limit || 0),
    used,
    remaining: unlimited ? null : Math.max(0, (limit || 0) - used),
    unlimited,
    authenticated: true,
  };
}

function consumeQuota(user) {
  if (!user) return { ok: false, reason: "auth", quota: quotaFor(null) };
  if (hasOwnKeys(user)) return { ok: true, unlimited: true, quota: quotaFor(user) };
  const today = todayMoscow();
  let result = null;
  updateUser(user.id, (row) => {
    const used = row.quota?.date === today ? Number(row.quota.count) || 0 : 0;
    const limit =
      normalizeRole(row.role) === "student" ? Number(process.env.DAILY_AI || 5) : Number(process.env.TEACHER_DAILY_AI || 50);
    if (used >= limit) {
      result = { ok: false, reason: "limit", quota: { ...quotaFor(row), used, remaining: 0 } };
      return;
    }
    row.quota = { date: today, count: used + 1 };
    result = { ok: true, unlimited: false, quota: { ...quotaFor(row), used: used + 1, remaining: Math.max(0, limit - used - 1) } };
  });
  return result || { ok: false, reason: "limit", quota: quotaFor(user) };
}

function encryptSecret(value) {
  const key = crypto.createHash("sha256").update(secret()).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return ["v1", b64url(iv), b64url(cipher.getAuthTag()), b64url(encrypted)].join(".");
}

function decryptSecret(value) {
  try {
    const [version, iv, tag, payload] = String(value || "").split(".");
    if (version !== "v1" || !iv || !tag || !payload) return "";
    const key = crypto.createHash("sha256").update(secret()).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, fromB64url(iv));
    decipher.setAuthTag(fromB64url(tag));
    return Buffer.concat([decipher.update(fromB64url(payload)), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

function setUserKey(userId, provider, key, folder) {
  const name = String(provider || "").toLowerCase();
  if (!["gigachat", "yandex", "openai"].includes(name)) throw new Error("Неизвестный провайдер ИИ");
  const secretValue = String(key || "").trim();
  if (!secretValue) throw new Error("Вставьте ключ");
  if (name === "yandex" && !String(folder || "").trim()) throw new Error("Для Алисы нужен каталог Yandex Cloud");
  return updateUser(userId, (user) => {
    if (!user.aiKeys) user.aiKeys = {};
    user.aiKeys[name] = {
      enc: encryptSecret(secretValue),
      folder: name === "yandex" ? String(folder).trim() : "",
      tail: secretValue.slice(-4),
      addedAt: new Date().toISOString(),
    };
  });
}

function clearUserKey(userId, provider) {
  return updateUser(userId, (user) => {
    if (!user.aiKeys) return;
    if (provider) delete user.aiKeys[String(provider).toLowerCase()];
    else user.aiKeys = {};
  });
}

function getUserKeys(user) {
  const out = {};
  if (!user?.aiKeys) return out;
  for (const [provider, item] of Object.entries(user.aiKeys)) {
    const key = decryptSecret(item?.enc);
    if (!key) continue;
    out[provider] = provider === "yandex" ? { key, folder: item.folder || "" } : key;
  }
  return out;
}

function keyTail(user, provider) {
  return user?.aiKeys?.[provider]?.tail || "";
}

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i += 1) code += alphabet[crypto.randomInt(alphabet.length)];
  return code;
}

function createCode(role, createdBy, ttlMinutes = 24 * 60) {
  const db = usersDb();
  const code = randomCode();
  const now = Date.now();
  for (const [key, item] of Object.entries(db.codes)) {
    if (Number(item.expiresAt) < now) delete db.codes[key];
  }
  db.codes[code] = {
    role: normalizeRole(role),
    createdBy: createdBy || "",
    createdAt: new Date().toISOString(),
    expiresAt: now + Math.max(5, Number(ttlMinutes) || 60) * 60 * 1000,
    usedBy: "",
  };
  saveDb(db);
  return code;
}

function createCodeUser(role, label) {
  const db = usersDb();
  const id = `code_${crypto.randomBytes(6).toString("hex")}`;
  const now = new Date().toISOString();
  const user = {
    id,
    maxId: "",
    name: String(label || "Гость").slice(0, 120),
    username: "",
    avatar: "",
    role: normalizeRole(role),
    roleSource: "code",
    source: "code",
    createdAt: now,
    lastSeen: now,
    aiKeys: {},
    quota: { date: "", count: 0 },
  };
  db.users[id] = user;
  saveDb(db);
  return user;
}

function redeemCode(rawCode) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return null;
  const envAdmin = String(process.env.ADMIN_CODE || "").trim().toUpperCase();
  const envTeacher = String(process.env.TEACHER_CODE || "").trim().toUpperCase();
  if ((envAdmin && code === envAdmin) || (envTeacher && code === envTeacher)) {
    const role = envAdmin && code === envAdmin ? "admin" : "teacher";
    const id = `code_${crypto.createHash("sha256").update(code).digest("hex").slice(0, 12)}`;
    const db = usersDb();
    const now = new Date().toISOString();
    if (!db.users[id]) {
      db.users[id] = {
        id,
        maxId: "",
        name: role === "admin" ? "Администратор" : "Учитель",
        username: "",
        avatar: "",
        role,
        roleSource: "env-code",
        source: "code",
        createdAt: now,
        lastSeen: now,
        aiKeys: {},
        quota: { date: "", count: 0 },
      };
      saveDb(db);
    }
    const user = db.users[id];
    updateUser(id, (row) => {
      row.lastSeen = now;
    });
    return user;
  }
  const db = usersDb();
  const item = db.codes[code];
  if (!item) return null;
  if (Number(item.expiresAt) < Date.now() || item.usedBy) return null;
  const user = createCodeUser(item.role, item.role === "teacher" ? "Учитель" : "Ученик");
  const fresh = usersDb();
  if (fresh.codes[code]) {
    fresh.codes[code].usedBy = user.id;
    fresh.codes[code].usedAt = new Date().toISOString();
    saveDb(fresh);
  }
  return user;
}

function findByMaxId(maxId) {
  const id = String(maxId || "");
  if (!id) return null;
  return usersDb().users[`max_${id}`] || null;
}

function findUser(idOrMaxId) {
  const key = String(idOrMaxId || "");
  const db = usersDb();
  return db.users[key] || db.users[`max_${key}`] || null;
}

function setRole(target, role) {
  const user = findUser(target);
  if (!user) return null;
  return updateUser(user.id, (row) => {
    row.role = normalizeRole(role);
    row.roleSource = "admin";
  });
}

function listUsers() {
  return Object.values(usersDb().users)
    .map(publicUser)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "ru"));
}

module.exports = {
  COOKIE,
  ROLES,
  middleware,
  afterAuth,
  verifyInitData,
  upsertMaxUser,
  publicUser,
  requireUser,
  requireRole,
  quotaFor,
  consumeQuota,
  hasOwnKeys,
  setUserKey,
  clearUserKey,
  getUserKeys,
  keyTail,
  createCode,
  redeemCode,
  findByMaxId,
  findUser,
  setRole,
  listUsers,
  setSessionCookie,
  clearSessionCookie,
  todayMoscow,
  normalizeRole,
};
