const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

function splitPages(text, pageHint) {
  const cleaned = String(text || "")
    .replace(/\r/g, "")
    .replace(/\u00ad/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  if (!cleaned) return [];
  const byMarker = cleaned.split(/\n\s*(?:стр\.?|страница|page)\s*(\d+)\s*\n/i);
  if (byMarker.length > 3) {
    const pages = [];
    let p = 1;
    for (let i = 0; i < byMarker.length; i++) {
      if (/^\d+$/.test(byMarker[i])) {
        p = Number(byMarker[i]);
        continue;
      }
      const t = byMarker[i].trim();
      if (t.length > 40) pages.push({ page: p, text: t });
    }
    if (pages.length) return pages;
  }
  const chunks = [];
  const size = 1400;
  let page = pageHint || 1;
  for (let i = 0; i < cleaned.length; i += size) {
    chunks.push({ page, text: cleaned.slice(i, i + size) });
    page += 1;
  }
  return chunks;
}

async function ingestPdf(buffer) {
  const pdfParse = require("pdf-parse");
  const data = await pdfParse(buffer);
  const raw = data.text || "";
  const pages = splitPages(raw, 1);
  return { pages: pages.length ? pages : [{ page: 1, text: raw }], meta: { pages: data.numpages } };
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function ingestEpub(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files)
    .filter((n) => /\.(xhtml|html|htm|xml)$/i.test(n) && !zip.files[n].dir)
    .sort();
  const pages = [];
  let i = 1;
  for (const name of names) {
    const html = await zip.files[name].async("string");
    const text = stripHtml(html);
    if (text.length > 80) {
      pages.push({ page: i, text });
      i += 1;
    }
  }
  return { pages, meta: { chapters: pages.length } };
}

async function ingestDjvu(buffer, originalName) {
  const text = buffer.toString("utf8");
  if (text.includes("FORM") && text.includes("DJVU")) {
    const ascii = text.replace(/[^\x09\x0a\x0d\x20-\x7eА-яёЁ]/g, " ").replace(/\s+/g, " ");
    if (ascii.length > 400) {
      return {
        pages: splitPages(ascii, 1),
        meta: { note: "Из DjVu извлечён только встроенный текст. Для полной индексации сохраните учебник в PDF." },
      };
    }
  }
  throw new Error(
    `DjVu «${originalName}» без текстового слоя. Откройте файл в любом конвертере и загрузите PDF — тогда страницы проиндексируются полностью.`
  );
}

async function ingestTxt(buffer) {
  return { pages: splitPages(buffer.toString("utf8"), 1), meta: {} };
}

async function ingestFile(filePath, originalName) {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(originalName || filePath).toLowerCase();
  if (ext === ".pdf") return ingestPdf(buffer);
  if (ext === ".epub") return ingestEpub(buffer);
  if (ext === ".djvu" || ext === ".djv") return ingestDjvu(buffer, originalName);
  if (ext === ".txt") return ingestTxt(buffer);
  throw new Error("Поддерживаются PDF, EPUB, DjVu и TXT");
}

function demoBook() {
  const pages = [
    {
      page: 48,
      text: `§ 12. Фотосинтез. Автотрофное питание. Фотосинтез — процесс образования органических веществ из углекислого газа и воды на свету при участии хлорофилла. Суммарное уравнение: 6CO2 + 6H2O → C6H12O6 + 6O2. Процесс идёт в хлоропластах клеток зелёных растений. Фотосинтез обеспечивает атмосферу кислородом и лежит в основе питания почти всех живых организмов.`,
    },
    {
      page: 49,
      text: `Световая фаза фотосинтеза протекает на мембранах тилакоидов. Энергия света поглощается хлорофиллом, происходит фотолиз воды, выделяется кислород, синтезируются АТФ и НАДФ·Н. Темновая фаза (цикл Кальвина) идёт в строме хлоропласта. Углекислый газ фиксируется, из него образуется глюкоза. Для темновой фазы свет не нужен напрямую, но нужны продукты световой фазы.`,
    },
    {
      page: 50,
      text: `Значение фотосинтеза. 1) Образование органических веществ. 2) Выделение кислорода. 3) Поглощение углекислого газа. 4) Преобразование энергии света в химическую энергию. Условия: свет, вода, углекислый газ, хлорофилл, подходящая температура. В 1771 году Джозеф Пристли показал, что растения «исправляют» воздух. В 1905 году Блекман разделил процесс на световую и темновую стадии.`,
    },
    {
      page: 112,
      text: `§ 24. Отечественная война 1812 года. 12 июня 1812 года армия Наполеона перешла Неман. План Барклая де Толли — отступление с сохранением армии. 26 августа 1812 года — Бородинское сражение. Главнокомандующий русской армией — М. И. Кутузов. 1 сентября — совет в Филях, решение оставить Москву. Партизанское движение. 25 декабря 1812 года — манифест об изгнании неприятеля из России.`,
    },
    {
      page: 113,
      text: `Итоги войны 1812 года. Наполеон не добился генерального сражения в начале кампании. Пожар Москвы. Отступление Великой армии по Старой Смоленской дороге. Сражение при Малоярославце. Переправа через Березину. Потери захватчиков. Отечественная война стала примером народного сопротивления. Источники: приказы, воспоминания участников, документы штаба Кутузова.`,
    },
  ];
  return pages;
}

module.exports = { ingestFile, demoBook };
