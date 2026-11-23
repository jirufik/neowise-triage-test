import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { classify } from "../mock-ai.mjs";
import { createHandler } from "../app.mjs";

// Сервер с настоящим имитатором из задания; журнал собираем, чтобы проверить причины.
const logs = [];
let server;
let base;

before(async () => {
  server = createServer(createHandler({ classify, log: (line) => logs.push(line) }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

const post = (body) => fetch(`${base}/api/triage`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body,
});

test("ввод: пустой, отсутствующий, нестроковый, битый JSON → 400 invalid_input", async () => {
  for (const body of ["", "{", "null", "[]", "{}", '{"text":""}', '{"text":"   "}', '{"text":7}']) {
    const reply = await post(body);
    assert.equal(reply.status, 400, body);
    assert.deepEqual(await reply.json(), { status: "invalid_input" }, body);
  }
});

test("успех: тема и черновик", async () => {
  const cases = { "Когда доставка?": "delivery", "Какая цена?": "pricing", "Здравствуйте": "other" };
  for (const [text, topic] of Object.entries(cases)) {
    const reply = await post(JSON.stringify({ text }));
    assert.equal(reply.status, 200);
    assert.deepEqual(await reply.json(),
      { status: "ready", topic, draft: "Спасибо за обращение. Уточним детали заявки." });
  }
});

test("сбой модели: каждая метка имитатора → 200 manual_review, причина в журнале", async () => {
  const expected = { "[error]": "model_error", "[bad-json]": "bad_json", "[bad-topic]": "bad_topic",
    "[empty-draft]": "empty_draft", "[timeout]": "timeout" };
  for (const [mark, reason] of Object.entries(expected)) {
    logs.length = 0;
    const reply = await post(JSON.stringify({ text: `Заявка ${mark}` }));
    assert.equal(reply.status, 200, mark);
    assert.deepEqual(await reply.json(), { status: "manual_review", topic: null, draft: null }, mark);
    assert.deepEqual(logs, [`triage manual_review: ${reason}`], mark);
  }
});

test("таймаут: ответ не позже ~300 мс, хотя имитатор ждёт 1,2 с", async () => {
  const started = Date.now();
  const reply = await post(JSON.stringify({ text: "[timeout]" }));
  const elapsed = Date.now() - started;
  assert.deepEqual(await reply.json(), { status: "manual_review", topic: null, draft: null });
  assert.ok(elapsed >= 290 && elapsed < 700, `elapsed ${elapsed} ms`);
});

test("прочее: неизвестный путь → 404, страница и ui.mjs отдаются", async () => {
  assert.equal((await fetch(`${base}/nope`)).status, 404);
  assert.equal((await fetch(`${base}/api/triage`)).status, 404);
  assert.equal((await fetch(`${base}/`)).status, 200);
  const ui = await fetch(`${base}/ui.mjs`);
  assert.equal(ui.status, 200);
  assert.match(ui.headers.get("content-type"), /javascript/);
});
