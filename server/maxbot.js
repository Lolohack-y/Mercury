// Бот для мессенджера MAX (platform-api.max.ru). Включается, если задан MAX_BOT_TOKEN.
// Открывает мини-приложение, принимает учебник файлом и тему текстом,
// выдаёт роли, коды входа и отчёты по тестам.
const fs = require("fs");
const path = require("path");
const store = require("./store");
const auth = require("./auth");
const tests = require("./tests");
const stats = require("./stats");
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

function shareUrl(test) {
  const base = WEBAPP ? `${WEBAPP}/max/` : "";
  return `${base}#/t/${test.shareToken}`;
}

function moscowDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return (
    new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date) + " МСК"
  );
}

function duration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  if (total < 60) return `${total} с`;
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  return `${hours} ч ${minutes % 60} мин`;
}

function reportText(data) {
  const test = data.test || {};
  const lines = [`<b>📊 ${esc(test.title || "Тест")}</b>`];
  if (test.subject || test.grade) {
    lines.push(esc([test.subject, test.grade ? `${test.grade} класс` : ""].filter(Boolean).join(" · ")));
  }
  if (test.settings?.deadline) lines.push(`Дедлайн: ${esc(moscowDate(test.settings.deadline))}`);
  lines.push(
    `Участников: <b>${data.summary?.students || 0}</b> · сдали: <b>${data.summary?.submitted || 0}</b> · средний лучший результат: <b>${
      data.summary?.averagePercent || 0
    }%</b>`
  );
  lines.push("");
  if (!data.students?.length) {
    lines.push("Пока никто не начал тест.");
  } else {
    data.students.forEach((student, index) => {
      const last = student.lastScore == null ? "не сдал" : `${student.lastScore}/${test.totalPoints || 0} (${student.lastPercent || 0}%)`;
      lines.push(
        `${index + 1}. <b>${esc(student.name)}</b> — ${last}, попыток: ${student.attemptsCount || 0}, время: ${duration(
          student.totalDurationSec
        )}`
      );
    });
  }
  return lines.join("\n");
}

async function sendReport(owner, data) {
  const text = reportText(data);
  if (!TOKEN) return { ok: false, error: "MAX-бот не настроен: нет MAX_BOT_TOKEN", text };
  const fresh = owner?.maxId ? owner : auth.findUser(owner?.id);
  const maxId = fresh?.maxId || "";
  if (!maxId) return { ok: false, error: "У учителя нет MAX-аккаунта", text };
  try {
    await send({ userId: maxId }, text, keyboard("Открыть тесты"));
    return { ok: true, text };
  } catch (error) {
    return { ok: false, error: error.message || "Не удалось отправить отчёт", text };
  }
}

function ensureBotUser(sender) {
  const maxId = String(sender?.user_id || "");
  if (!maxId) return null;
  return (
    auth.findByMaxId(maxId) ||
    auth.upsertMaxUser({
      id: maxId,
      first_name: sender?.name || "",
      name: sender?.name || "",
      username: sender?.username || "",
    })
  );
}

function roleLabel(role) {
  return role === "admin" ? "администратор" : role === "teacher" ? "учитель" : "ученик";
}

async function onStart(target, user) {
  const hello = user?.name ? `, ${esc(user.name)}` : "";
  const role = auth.normalizeRole(user?.role);
  await send(
    target,
    `<b>Наглядность+</b>${hello}\nМатериалы учителя строго по учебнику.\n\n1) Пришлите PDF, EPUB или DjVu (учитель)\n2) Напишите тему и класс\n3) Получите материал со ссылкой на страницу\n\nВаша роль: <b>${roleLabel(
      role
    )}</b>. Полный набор открывается кнопкой ниже.`,
    keyboard("Открыть Наглядность+")
  );
}

async function onFile(target, att, user) {
  if (!["teacher", "admin"].includes(auth.normalizeRole(user?.role))) {
    await send(target, "Загружать и удалять учебники может учитель. Попросите администратора выдать роль учителя.");
    return;
  }
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

async function onTopic(target, query, user) {
  await send(target, "Ищу страницы учебника…");
  try {
    const pack = await ask({ query, type: "scheme", user });
    await send(target, formatPack(pack), keyboard("Открыть целиком"));
  } catch (e) {
    await send(target, esc(e.message || "Не удалось собрать материал"));
  }
}

async function onCommand(target, sender, text, user) {
  const role = auth.normalizeRole(user?.role);
  const [command, ...args] = text.split(/\s+/);
  const cmd = command.toLowerCase();

  if (cmd === "/start" || cmd === "/help") return onStart(target, user);
  if (cmd === "/whoami") {
    return send(
      target,
      `Ваша роль: <b>${roleLabel(role)}</b>\nMAX ID: <code>${esc(user?.maxId || sender?.user_id || "")}</code>`
    );
  }
  if (cmd === "/role") {
    if (role !== "admin") return send(target, "Выдавать роли может только администратор.");
    const [targetId, nextRole] = args;
    if (!targetId || !["student", "teacher", "admin"].includes(nextRole)) {
      return send(target, "Формат: <code>/role 123456789 teacher</code> (student, teacher или admin)");
    }
    const updated = auth.setRole(targetId, nextRole);
    if (!updated) return send(target, "Пользователь не найден. Он должен хотя бы раз открыть мини-приложение или написать боту.");
    return send(target, `Готово: <b>${esc(updated.name)}</b> — ${roleLabel(nextRole)}.`);
  }
  if (cmd === "/code") {
    if (role !== "admin") return send(target, "Коды входа создаёт администратор.");
    const nextRole = args[0] === "admin" ? "admin" : "teacher";
    const code = auth.createCode(nextRole, user?.id, 24 * 60);
    return send(
      target,
      `Код для роли <b>${roleLabel(nextRole)}</b>: <code>${code}</code>\nДействует 24 часа. Введите его на странице «ИИ» в мини-приложении.`
    );
  }
  if (cmd === "/tests") {
    if (!["teacher", "admin"].includes(role)) return send(target, "Список тестов доступен учителю.");
    const list = tests.listForOwner(user.id);
    if (!list.length) return send(target, "У вас пока нет тестов. Создайте их в мини-приложении на странице «Тесты».");
    const lines = [`<b>Ваши тесты</b>`];
    list.slice(0, 10).forEach((test) => {
      lines.push(
        `\n<b>${esc(test.title)}</b> · ${test.questionCount} зад. · ${test.attemptsCount} попыток\n<code>${test.id}</code>\n${shareUrl(
          test
        )}`
      );
    });
    lines.push("\nОтчёт: <code>/results ID</code>");
    return send(target, lines.join("\n"));
  }
  if (cmd === "/results") {
    if (!["teacher", "admin"].includes(role)) return send(target, "Отчёты доступны учителю.");
    const test = tests.getTest(args[0] || "");
    if (!test) return send(target, "Укажите ID теста: <code>/results t_...</code>");
    if (!tests.canManage(test, user)) return send(target, "Это не ваш тест.");
    const data = tests.results(test);
    return send(target, reportText(data), keyboard("Открыть результаты"));
  }
  if (cmd === "/close") {
    if (!["teacher", "admin"].includes(role)) return send(target, "Закрывать тесты может учитель.");
    const test = tests.getTest(args[0] || "");
    if (!test) return send(target, "Укажите ID теста: <code>/close t_...</code>");
    if (!tests.canManage(test, user)) return send(target, "Это не ваш тест.");
    tests.close(test);
    return send(target, `Тест <b>${esc(test.title)}</b> закрыт.`);
  }
  if (cmd === "/stats") {
    if (!["teacher", "admin"].includes(role)) return send(target, "Статистика доступна учителю.");
    const data = stats.summary();
    return send(
      target,
      `<b>ИИ сегодня</b>\nЗапросов: ${data.today.total} · успешно: ${data.today.ok} · ошибок: ${data.today.fail}\nВсего: ${
        data.totals.total
      } (${data.totals.ok} успешно)`
    );
  }
  return send(target, "Неизвестная команда. /help — список возможностей.");
}

async function handle(update) {
  if (update.update_type === "bot_started") {
    const user = ensureBotUser(update.user || {});
    const userId = update.user?.user_id;
    if (userId) await onStart({ userId }, user);
    return;
  }
  if (update.update_type !== "message_created") return;
  const msg = update.message;
  if (!msg) return;
  const sender = msg.sender || {};
  if (sender.is_bot) return;
  const user = ensureBotUser(sender);
  const target = msg.recipient?.chat_id ? { chatId: msg.recipient.chat_id } : { userId: sender.user_id };
  const text = (msg.body?.text || "").trim();
  const file = (msg.body?.attachments || []).find((a) => a.type === "file");
  if (file) return onFile(target, file, user);
  if (text.startsWith("/")) return onCommand(target, sender, text, user);
  if (text.length >= 2) return onTopic(target, text, user);
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

function startReportLoop() {
  const timer = setInterval(async () => {
    if (!TOKEN) return;
    try {
      const due = tests.dueReports(new Date());
      for (const test of due) {
        const owner = auth.findUser(test.ownerId);
        const data = tests.results(test);
        const sent = await sendReport(owner, data);
        if (sent.ok || !owner?.maxId) tests.markReported(test.id);
        if (!sent.ok) console.error("Отчёт по тесту:", sent.error);
      }
    } catch (error) {
      console.error("Планировщик отчётов:", error.message);
    }
  }, 60_000);
  timer.unref?.();
}

function startMaxBot() {
  if (!TOKEN) {
    console.log("MAX-бот выключен: нет MAX_BOT_TOKEN. Мини-приложение доступно в браузере по /max/");
    return;
  }
  startReportLoop();
  api("GET", "/me")
    .then((info) => {
      me = info;
      console.log(`MAX-бот ${info.username ? "@" + info.username : info.name || ""}`);
      loop();
    })
    .catch((e) => console.error("MAX-бот не запустился:", e.message));
}

module.exports = { startMaxBot, sendReport, reportText };
