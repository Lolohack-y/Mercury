const fs = require("fs");
const path = require("path");
const store = require("./store");
const { ask } = require("./ask");
const { indexUpload } = require("./library");

const TOKEN = process.env.BOT_TOKEN || "";
const WEBAPP = (process.env.WEBAPP_URL || "").replace(/\/$/, "");

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function api(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || method);
  return data.result;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function webAppButton(text) {
  if (!WEBAPP.startsWith("https://")) return null;
  return { text, web_app: { url: `${WEBAPP}/` } };
}

function welcomeKeyboard() {
  const open = webAppButton("Открыть Наглядность+");
  const rows = [];
  if (open) rows.push([open]);
  rows.push([{ text: "Фотосинтез, 9 класс" }, { text: "Война 1812 года" }]);
  return { keyboard: rows, resize_keyboard: true };
}

function formatPack(pack) {
  const m = pack.materials || {};
  const lines = [`<b>${esc(pack.topic)}</b>`, "Только по найденным страницам учебника.", ""];
  if (m.scheme) {
    lines.push("<b>Схема</b>");
    for (const n of m.scheme.nodes.slice(0, 5)) {
      lines.push(`• ${esc(n.title)} — с. ${esc(n.page)}`);
    }
    lines.push("");
  }
  if (m.table) {
    lines.push("<b>Таблица</b>");
    for (const row of m.table.rows.slice(0, 4)) {
      lines.push(`• ${esc(String(row[0]).slice(0, 140))}`);
    }
    lines.push("");
  }
  if (m.test) {
    lines.push("<b>Проверка</b>");
    const t = m.test.items[0];
    if (t) lines.push(esc(t.q.slice(0, 220)));
    lines.push("");
  }
  const pages = [...new Set((pack.sources || []).map((s) => `${s.bookTitle}, с. ${s.page}`))].slice(0, 4);
  if (pages.length) lines.push(pages.map((p) => `Источник: ${esc(p)}`).join("\n"));
  const bad = (pack.factCheck?.items || []).filter((i) => i.status === "mismatch").length;
  if (bad) lines.push(`\nПроверка: ${bad} цифр нет на этих страницах — сверьте вручную.`);
  let text = lines.join("\n").trim();
  if (text.length > 3800) text = text.slice(0, 3800) + "…";
  return text;
}

async function send(chatId, text, extra = {}) {
  return api("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...extra,
  });
}

async function onStart(msg) {
  const name = msg.from?.first_name ? `, ${msg.from.first_name}` : "";
  const how = WEBAPP.startsWith("https://")
    ? "Кнопка ниже открывает мини-приложение: загрузите учебник и соберите схему, таблицу, карточки или тест."
    : "Мини-приложение готово на сервере. Чтобы открыть его внутри Telegram, укажите HTTPS-адрес в WEBAPP_URL. Пока можно прислать PDF или тему сообщением.";
  await send(
    msg.chat.id,
    `<b>Наглядность+</b>${esc(name)}\nМатериалы учителя строго по учебнику.\n\n${how}\n\n1) Пришлите PDF, EPUB или DjVu\n2) Напишите тему и класс\n3) Получите материал со ссылкой на страницу`,
    { reply_markup: welcomeKeyboard() }
  );
}

async function onDocument(msg) {
  const doc = msg.document;
  const name = doc.file_name || "uchebnik.pdf";
  const ext = path.extname(name).toLowerCase();
  if (![".pdf", ".epub", ".djvu", ".djv", ".txt"].includes(ext)) {
    await send(msg.chat.id, "Нужен учебник в PDF, EPUB, DjVu или TXT.");
    return;
  }
  if (doc.file_size > 20 * 1024 * 1024) {
    await send(msg.chat.id, "Файл больше 20 МБ. Telegram отдаёт боту только файлы до этого размера.");
    return;
  }
  await send(msg.chat.id, "Индексирую учебник…");
  const file = await api("getFile", { file_id: doc.file_id });
  const url = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;
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
    msg.chat.id,
    `Готово: <b>${esc(book.title)}</b>, фрагментов ${indexed}.\nНапишите тему, например: <i>фотосинтез, световая фаза, 9 класс</i>.`
  );
}

async function onTopic(msg, query) {
  await send(msg.chat.id, "Ищу страницы учебника…");
  try {
    const pack = await ask({ query, type: "scheme" });
    const open = webAppButton("Открыть целиком");
    await send(msg.chat.id, formatPack(pack), open ? { reply_markup: { inline_keyboard: [[open]] } } : {});
  } catch (e) {
    await send(msg.chat.id, esc(e.message || "Не удалось собрать материал"));
  }
}

async function handle(update) {
  const msg = update.message;
  if (!msg) return;
  const text = (msg.text || "").trim();
  if (text === "/start" || text === "/help") return onStart(msg);
  if (msg.document) return onDocument(msg);
  if (text.startsWith("/")) return;
  if (text.length >= 2) return onTopic(msg, text.replace(/^\/\S+\s*/, ""));
}

async function loop() {
  let offset = 0;
  for (;;) {
    try {
      const updates = await api("getUpdates", { offset, timeout: 25, allowed_updates: ["message"] });
      for (const u of updates) {
        offset = u.update_id + 1;
        try {
          await handle(u);
        } catch (e) {
          console.error("Сообщение бота:", e.message);
        }
      }
    } catch (e) {
      console.error("Опрос Telegram:", e.message);
      await sleep(4000);
    }
  }
}

function startBot() {
  if (!TOKEN) {
    console.log("Telegram-бот выключен: нет BOT_TOKEN. Мини-приложение доступно в браузере по /tg/");
    return;
  }
  api("getMe")
    .then(async (me) => {
      console.log(`Telegram-бот @${me.username}`);
      if (WEBAPP.startsWith("https://")) {
        await api("setChatMenuButton", {
          menu_button: { type: "web_app", text: "Наглядность+", web_app: { url: `${WEBAPP}/` } },
        });
      } else {
        console.log("WEBAPP_URL не https — кнопка мини-приложения в меню чата не установлена");
      }
      loop();
    })
    .catch((e) => console.error("Бот не запустился:", e.message));
}

module.exports = { startBot };
