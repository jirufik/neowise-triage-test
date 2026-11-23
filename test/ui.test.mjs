import { test } from "node:test";
import assert from "node:assert/strict";
import { viewFor, pendingView, latestOnly, MESSAGES } from "../ui.mjs";

test("ready → тема словами и черновик", () => {
  assert.deepEqual(viewFor(200, { status: "ready", topic: "delivery", draft: "Текст" }),
    { kind: "ready", message: "", topic: "Доставка", draft: "Текст" });
});

test("manual_review, 500, сеть, мусор → сообщение о ручном разборе и пустой черновик", () => {
  const cases = [
    [200, { status: "manual_review", topic: null, draft: null }],
    [500, { status: "server_error" }],
    [0, null],
    [200, { status: "ready", topic: "refund", draft: "x" }],
    [200, { status: "ready", topic: "other", draft: "  " }],
    [200, { status: "ready", topic: "toString", draft: "x" }],
    [200, { status: "ready", topic: "__proto__", draft: "x" }],
  ];
  for (const [code, body] of cases) {
    assert.deepEqual(viewFor(code, body), { kind: "manual", message: MESSAGES.manual, topic: "", draft: "" });
  }
});

test("400 invalid_input → просьба ввести текст", () => {
  assert.equal(viewFor(400, { status: "invalid_input" }).message, MESSAGES.invalid);
});

test("на время запроса прежний черновик стирается", () => {
  assert.equal(pendingView().draft, "");
});

test("ответы пришли в обратном порядке → на экран попадает только последний запрос", () => {
  const requests = latestOnly();
  const first = requests.next();
  const second = requests.next();
  assert.equal(requests.isCurrent(second), true);
  assert.equal(requests.isCurrent(first), false);
});
