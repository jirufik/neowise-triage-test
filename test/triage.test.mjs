import { test } from "node:test";
import assert from "node:assert/strict";
import { callModel, parseInput, parseModelOutput, triage, ModelTimeoutError, MANUAL_REVIEW } from "../triage.mjs";

test("parseInput: принимает только объект с непустой строкой text", () => {
  assert.deepEqual(parseInput('{"text":"Где заказ?"}'), { ok: true, text: "Где заказ?" });
  for (const raw of ["", "{", "null", "[]", "42", '"text"', "{}", '{"text":""}', '{"text":"  \\n\\t "}',
    '{"text":5}', '{"text":null}', '{"text":["a"]}']) {
    assert.equal(parseInput(raw).ok, false, `должно отклоняться: ${raw}`);
  }
});

test("parseModelOutput: пропускает только допустимую тему и непустой черновик", () => {
  assert.deepEqual(parseModelOutput('{"topic":"pricing","draft":"  Ответ  ","extra":1}'),
    { ok: true, topic: "pricing", draft: "Ответ" });
  const bad = {
    "не JSON": ["model output is not JSON", "bad_json"],
    "JSON-строка": ['"{}"', "not_object"],
    "null": ["null", "not_object"],
    "массив": ["[]", "not_object"],
    "чужая тема": ['{"topic":"refund","draft":"x"}', "bad_topic"],
    "тема в другом регистре": ['{"topic":"Delivery","draft":"x"}', "bad_topic"],
    "нет темы": ['{"draft":"x"}', "bad_topic"],
    "пробельный черновик": ['{"topic":"other","draft":"  "}', "empty_draft"],
    "черновик не строка": ['{"topic":"other","draft":42}', "empty_draft"],
  };
  for (const [name, [output, reason]] of Object.entries(bad)) {
    assert.deepEqual(parseModelOutput(output), { ok: false, reason }, name);
  }
  assert.deepEqual(parseModelOutput(undefined), { ok: false, reason: "not_string" });
});

test("callModel: модель, игнорирующая сигнал, не задерживает ответ дольше лимита", async () => {
  const neverEnds = () => new Promise(() => {});
  const started = Date.now();
  await assert.rejects(callModel(neverEnds, "x", 50), ModelTimeoutError);
  assert.ok(Date.now() - started < 300);
});

test("callModel: модель получает сигнал отмены, поздний отказ не становится unhandled rejection", async () => {
  let seen;
  const slow = (_text, { signal }) => new Promise((_, reject) => {
    seen = signal;
    signal.addEventListener("abort", () => reject(new Error("aborted")));
  });
  await assert.rejects(callModel(slow, "x", 20), ModelTimeoutError);
  assert.equal(seen.aborted, true);
});

test("triage: исключение модели → manual_review с причиной", async () => {
  const result = await triage(() => { throw new Error("down"); }, "x", 50);
  assert.deepEqual(result, { body: MANUAL_REVIEW, reason: "model_error" });
});

test("успешный ответ собирается только из трёх полей: status модели не перетирает ready", async () => {
  const model = async () => '{"topic":"delivery","draft":"x","status":"manual_review","extra":1}';
  assert.deepEqual(await triage(model, "x", 50),
    { body: { status: "ready", topic: "delivery", draft: "x" }, reason: null });
});

test("модель бросает синхронно или возвращает не строку → manual_review, без unhandled rejection", async () => {
  const unhandled = [];
  const trap = (reason) => unhandled.push(reason);
  process.on("unhandledRejection", trap);
  try {
    assert.equal((await triage(() => { throw new Error("sync"); }, "x", 50)).reason, "model_error");
    assert.equal((await triage(async () => ({ topic: "other" }), "x", 50)).reason, "not_string");
    assert.equal((await triage(async () => "", "x", 50)).reason, "bad_json");
    // отказ модели уже после таймаута
    await triage(() => new Promise((_, reject) => setTimeout(() => reject(new Error("late")), 80)), "x", 20);
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", trap);
  }
});

test("быстрый ответ модели не обрывается таймаутом", async () => {
  const model = (_t, { signal }) => new Promise((resolve) => setTimeout(() => resolve(signal.aborted ? "aborted" : '{"topic":"other","draft":"ok"}'), 10));
  assert.equal((await triage(model, "x", 100)).body.status, "ready");
});
