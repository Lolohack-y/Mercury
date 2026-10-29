# Наглядник

Приложение для учителей 5–11 классов: загрузите учебник (PDF / EPUB / DjVu), задайте тему — получите схемы, таблицы, карточки, инфографику, презентацию и тест **по страницам учебника** (RAG).

## Запуск в Docker

Нужен [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
cd uchebnik-studio
docker compose up --build -d
```

Откройте в браузере: http://localhost:3840

Остановка: `docker compose down`

Данные учебников хранятся в томе `nagliadnik-data`.

## Запуск без Docker

Нужен [Node.js 18+](https://nodejs.org/).

```bash
cd uchebnik-studio
npm install
npm start
```

Откройте в браузере: http://localhost:3840

Нейросеть необязательна. В блоке «Нейросеть» на сайте можно подключить GigaChat или Алису (YandexGPT): модель ищет соседние формулировки в загруженном учебнике и собирает тест. Ключ берётся в [личном кабинете GigaChat](https://developers.sber.ru/studio) или в Yandex Cloud. Те же поля можно задать в `.env`: `GIGACHAT_AUTH_KEY` или `YANDEX_API_KEY` и `YANDEX_FOLDER_ID`. Без ключа тест собирается из цитат учебника.

Мини-приложение: http://localhost:3840/tg/

Чтобы открыть его из Telegram, создайте бота в [@BotFather](https://t.me/BotFather) и впишите в `.env` токен `BOT_TOKEN` и публичный адрес `WEBAPP_URL` (https, путь `/tg`). После запуска `/start` пришлёт кнопку «Наглядность+». В чат можно отправить PDF учебника или тему урока.

## Что умеет

- Привязка к странице и УМК
- Несколько учебников и сравнение подачи темы
- Шаблон школы (цвета, шрифт, название)
- Правка на лету («добавь блок…»)
- Кэш популярных запросов
- Проверка цифр и дат по тексту учебника
