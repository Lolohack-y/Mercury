// Бот для мессенджера MAX (platform-api.max.ru). Включается, если задан MAX_BOT_TOKEN.
// Открывает мини-приложение, принимает учебник файлом и тему текстом.
const fs = require("fs");
const path = require("path");
const store = require("./store");
const { ask } = require("./ask");
const { indexUpload } = require("./library");
const { formatPack, esc } = require("./bot");

const TOKEN = process.env.MAX_BOT_TOKEN || "";
const WEBAPP = (process.env.WEBAPP_URL || "").replace(/\/$/, "");
const API = "https://platform-api.max.ru";

let me = null;

async function api(method, route, { query, body } = {}) {
  const qs = query ? "?" + new URLSearchParams(query).toString() : "";
  const res = await fetch(`${API}${route}${qs}`, {
    method,
    headers: { Authorization: TOKEN, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {}
  if (!res.ok) throw new Error(data.message || data.code || `${route}: ${res.status}`);
  return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function openButton(text) {
  if (me?.username) return { type: "open_app", text, web_app: me.username };
  if (WEBAPP.startsWith("https://")) return { type: "link", text, url: `${WEBAPP}/max/` };
  return null;
}

function keyboard(text) {
  const b = openButton(text);
  return b ? [{ type: "inline_keyboard", payload: { buttons: [[b]] } }] : undefined;
}

function send(target, text, attachments) {
  const query = target.chatId ? { chat_id: target.chatId } : { user_id: target.userId };
  return api("POST", "/messages", {
    query,
    body: { text: String(text).slice(0, 3900), format: "html", attachments },
  });
}

async function onStart(target, name) {
  const hello = name ? `, ${esc(name)}` : "";
  await send(
    target,
    `<b>Наглядность+</b>${hello}\nМатериалы учителя строго по учебнику.\n\n1) Пришлите PDF, EPUB или DjVu\n2) Напишите тему и класс\n3) Получите материал со ссылкой на страницу\n\nПолный набор (схема, таблица, карточки, тест, презентация) открывается кнопкой ниже.`,
    keyboard("Открыть Наглядность+")
  );
}

async function onFile(target, att) {
  const name = att.filename || "uchebnik.pdf";
  const ext = path.extname(name).toLowerCase();
  if (![".pdf", ".epub", ".djvu", ".djv", ".txt"].includes(ext)) {
    await send(target, "Нужен учебник в PDF, EPUB, DjVu или TXT.");
    return;
  }
  const url = att.payload?.url;
  if (!url) {
    await send(target, "Не удалось получить файл. Загрузите учебник через мини-приложение.");
    return;
  }
  await send(target, "Индексирую учебник…");
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  const dest = path.join(store.UPLOADS, `${store.uuid()}${ext}`);
  fs.writeFileSync(dest, buf);
  const { book, indexed } = await indexUpload({
    filePath: dest,
    originalname: name,
    title: name.replace(ext, ""),
    publisher: "УМК",
  });
  await send(
    target,
    `Готово: <b>${esc(book.title)}</b>, фрагментов ${indexed}.\nНапишите тему, например: <i>фотосинтез, световая фаза, 9 класс</i>.`
  );
}

async function onTopic(target, query) {
  await send(target, "Ищу страницы учебника…");
  try {
    const pack = await ask({ query, type: "scheme" });
    await send(target, formatPack(pack), keyboard("Открыть целиком"));
  } catch (e) {
    await send(target, esc(e.message || "Не удалось собрать материал"));
  }
}

async function handle(update) {
  if (update.update_type === "bot_started") {
    const userId = update.user?.user_id;
    if (userId) await onStart({ userId }, update.user?.name);
    return;
  }
  if (update.update_type !== "message_created") return;
  const msg = update.message;
  if (!msg) return;
  const sender = msg.sender || {};
  if (sender.is_bot) return;
  const target = msg.recipient?.chat_id ? { chatId: msg.recipient.chat_id } : { userId: sender.user_id };
  const text = (msg.body?.text || "").trim();
  const file = (msg.body?.attachments || []).find((a) => a.type === "file");
  if (file) return onFile(target, file);
  if (text === "/start" || text === "/help") return onStart(target, sender.name);
  if (text.startsWith("/")) return;
  if (text.length >= 2) return onTopic(target, text);
}

async function loop() {
  let marker;
  for (;;) {
    try {
      const query = { timeout: "25", types: "message_created,bot_started" };
      if (marker != null) query.marker = String(marker);
      const data = await api("GET", "/updates", { query });
      if (data.marker != null) marker = data.marker;
      for (const u of data.updates || []) {
        try {
          await handle(u);
        } catch (e) {
          console.error("Сообщение MAX-бота:", e.message);
        }
      }
    } catch (e) {
      console.error("Опрос MAX:", e.message);
      await sleep(4000);
    }
  }
}

function startMaxBot() {
  if (!TOKEN) {
    console.log("MAX-бот выключен: нет MAX_BOT_TOKEN. Мини-приложение доступно в браузере по /max/");
    return;
  }
  api("GET", "/me")
    .then((info) => {
      me = info;
      console.log(`MAX-бот ${info.username ? "@" + info.username : info.name || ""}`);
      loop();
    })
    .catch((e) => console.error("MAX-бот не запустился:", e.message));
}

module.exports = { startMaxBot };
