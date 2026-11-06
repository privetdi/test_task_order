# orders-aggregator

Требуются Docker Compose и Node.js 20.19+, 22.12+ или 24+ (LTS).

## Запуск

Из корня проекта загрузите образ внешнего API, приложенный к заданию:

```bash
docker load -i ../orders-mock-arm64.tar.gz
```

Для x86_64 используйте `../orders-mock-amd64.tar.gz`.

```bash
cp .env.example .env
npm ci
docker compose up -d
npm start
```

Сервис доступен на `http://localhost:3000`. Настройки берутся из `.env`.
Миграции применяются при старте; отдельно их можно выполнить через `npm run migrate`.
Для разработки: `npm run dev`.

Установочные скрипты npm отключены в проекте. Если esbuild сообщает об отсутствии бинарника:

```bash
npm rebuild esbuild --ignore-scripts=false
```

## Получение result.json

Для первого прогона нужна пустая БД `orders`. Оставьте сервис работающим и выполните в другом терминале:

```bash
curl --fail --silent --show-error -X POST http://localhost:3000/sync
docker compose run --rm orders-api webhooks --target http://host.docker.internal:3000/webhooks/order
curl --fail --silent --show-error \
  'http://localhost:3000/customers/c_7/daily-totals?from=2026-03-27&to=2026-03-31' \
  -o result.json
```

Дождитесь завершения каждой команды. Если порт занят, измените `PORT` в `.env` и адреса в командах.

## Проверка

При работающем PostgreSQL:

```bash
npm run typecheck
npm test
```

Тесты используют отдельную БД `orders_test` и очищают её таблицы перед каждым тестом.
