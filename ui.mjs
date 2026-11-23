// Что показать менеджеру. Чистые функции: работают и в браузере, и в node --test.

export const TOPIC_LABELS = Object.freeze({ delivery: "Доставка", pricing: "Цены", other: "Другое" });

export const MESSAGES = Object.freeze({
  manual: "Автоматический разбор не удался — разберите заявку вручную.",
  invalid: "Введите текст заявки.",
  pending: "Разбираем заявку…",
});

/** Ответ API (HTTP-статус и тело; body = null, если ответа нет или он не JSON) → состояние экрана. */
export function viewFor(httpStatus, body) {
  if (httpStatus === 200 && body?.status === "ready"
      && typeof body.draft === "string" && body.draft.trim() !== "" && body.topic in TOPIC_LABELS) {
    return { kind: "ready", message: "", topic: TOPIC_LABELS[body.topic], draft: body.draft };
  }
  if (httpStatus === 400 && body?.status === "invalid_input") {
    return { kind: "invalid", message: MESSAGES.invalid, topic: "", draft: "" };
  }
  // manual_review, 500, сеть, неожиданный ответ — всё это ручной разбор; прежний черновик не показываем.
  return { kind: "manual", message: MESSAGES.manual, topic: "", draft: "" };
}

/** Состояние на время запроса: прежний результат стирается сразу. */
export function pendingView() {
  return { kind: "pending", message: MESSAGES.pending, topic: "", draft: "" };
}

/** На экран попадает только ответ на последний запрос: next() выдаёт билет, isCurrent(билет) — актуален ли он. */
export function latestOnly() {
  let last = 0;
  return { next: () => ++last, isCurrent: (ticket) => ticket === last };
}
