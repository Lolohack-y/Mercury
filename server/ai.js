const https = require("https");
const store = require("./store");

function sberRequest(url, { method, headers, body, timeout = 45000 }) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method, headers, rejectUnauthorized: false, timeout },
      (res) => {
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
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, data });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("GigaChat не ответил вовремя")));
    if (body) req.write(body);
    req.end();
  });
}

const NAMES = {
  gigachat: "GigaChat",
  yandex: "Алиса",
  openai: "OpenAI",
};

function saved() {
  return store.loadJson("ai.json", {});
}

function envKey(...names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

function settings() {
  const file = saved();
  const gigachatKey = String(file.gigachatKey || envKey("GIGACHAT_AUTH_KEY", "GIGACHAT_CREDENTIALS")).trim();
  const yandexKey = String(file.yandexKey || envKey("YANDEX_API_KEY")).trim();
  const yandexFolder = String(file.yandexFolder || envKey("YANDEX_FOLDER_ID")).trim();
  const openaiKey = envKey("OPENAI_API_KEY");
  const requested = String(file.provider || process.env.AI_PROVIDER || "").trim();
  const available = [
    gigachatKey ? "gigachat" : "",
    yandexKey && yandexFolder ? "yandex" : "",
    openaiKey ? "openai" : "",
  ].filter(Boolean);
  const provider = available.includes(requested) ? requested : available[0] || requested || "gigachat";
  return { provider, gigachatKey, yandexKey, yandexFolder, openaiKey, available };
}

function status() {
  const cfg = settings();
  const ready = cfg.available.includes(cfg.provider);
  return {
    provider: cfg.provider,
    name: NAMES[cfg.provider] || cfg.provider,
    ready,
    gigachat: Boolean(cfg.gigachatKey),
    yandex: Boolean(cfg.yandexKey && cfg.yandexFolder),
    folder: cfg.yandexFolder || "",
  };
}

function saveSettings({ provider, key, folder }) {
  const current = saved();
  const next = { ...current };
  if (provider === "gigachat" || provider === "yandex" || provider === "openai") next.provider = provider;
  const secret = String(key || "").trim();
  if (secret && next.provider === "yandex") next.yandexKey = secret.replace(/^Api-Key\s+/i, "");
  else if (secret && next.provider !== "openai") {
    next.gigachatKey = secret.replace(/^Basic\s+/i, "").replace(/\s+/g, "");
    next.provider = next.provider || "gigachat";
  }
  if (folder && String(folder).trim()) next.yandexFolder = String(folder).trim();
  store.saveJson("ai.json", next);
  token = null;
  return status();
}

let token = null;
let tokenUntil = 0;

async function gigachatToken(key) {
  if (token && Date.now() < tokenUntil - 60_000) return token;
  const scope = process.env.GIGACHAT_SCOPE || "GIGACHAT_API_PERS";
  const res = await sberRequest("https://ngw.devices.sberbank.ru:9443/api/v2/oauth", {
    method: "POST",
    headers: {
      Authorization: `Basic ${key}`,
      RqUID: require("crypto").randomUUID(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: `scope=${encodeURIComponent(scope)}`,
    timeout: 20000,
  });
  const data = res.data || {};
  if (!res.ok || !data.access_token) {
    throw new Error(data.message || data.error_description || "GigaChat не принял ключ авторизации");
  }
  token = data.access_token;
  let until = Number(data.expires_at) || 0;
  if (until && until < 1e12) until *= 1000;
  tokenUntil = until || Date.now() + 25 * 60 * 1000;
  return token;
}

async function gigachatChat(messages) {
  const cfg = settings();
  const access = await gigachatToken(cfg.gigachatKey);
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
  if (!res.ok) throw new Error(data.message || "GigaChat не ответил");
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("GigaChat вернул пустой ответ");
  return text;
}

async function yandexChat(messages) {
  const cfg = settings();
  const model = process.env.YANDEX_MODEL || "yandexgpt-lite";
  const res = await fetch("https://llm.api.cloud.yandex.net/foundationModels/v1/completion", {
    method: "POST",
    headers: {
      Authorization: `Api-Key ${cfg.yandexKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      modelUri: `gpt://${cfg.yandexFolder}/${model}/latest`,
      completionOptions: { stream: false, temperature: 0.2, maxTokens: "2500" },
      messages: messages.map((m) => ({ role: m.role, text: m.content })),
    }),
    signal: AbortSignal.timeout(45000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || data.message || "Алиса не ответила");
  const text = data.result?.alternatives?.[0]?.message?.text;
  if (!text) throw new Error("Алиса вернула пустой ответ");
  return text;
}

async function openaiChat(messages) {
  const cfg = settings();
  const base = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, temperature: 0.2, messages }),
    signal: AbortSignal.timeout(45000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || "Модель не ответила");
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Модель вернула пустой ответ");
  return text;
}

async function chat(messages) {
  const cfg = settings();
  if (!cfg.available.includes(cfg.provider)) {
    const error = new Error("Нейросеть не подключена");
    error.status = 400;
    throw error;
  }
  if (cfg.provider === "yandex") return yandexChat(messages);
  if (cfg.provider === "openai") return openaiChat(messages);
  return gigachatChat(messages);
}

async function ping() {
  const info = status();
  if (!info.ready) return { ...info, ok: false, error: "Вставьте ключ и нажмите «Подключить»" };
  try {
    const text = await chat([
      { role: "system", content: "Ответь одним словом: готово" },
      { role: "user", content: "Проверка связи" },
    ]);
    return { ...info, ok: true, sample: String(text).slice(0, 80) };
  } catch (e) {
    return { ...info, ok: false, error: e.message || "Не удалось связаться с моделью" };
  }
}

module.exports = { status, saveSettings, chat, ping };
