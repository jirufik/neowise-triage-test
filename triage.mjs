// Проверка ввода и ответа модели. Чистые функции: тестируются без сети.

export const TOPICS = Object.freeze(["delivery", "pricing", "other"]);
export const MODEL_TIMEOUT_MS = 300;

export const MANUAL_REVIEW = Object.freeze({ status: "manual_review", topic: null, draft: null });
export const INVALID_INPUT = Object.freeze({ status: "invalid_input" });

/** Тело запроса → { ok: true, text } | { ok: false }. Принимается только JSON-объект с непустой строкой `text`. */
export function parseInput(raw) {
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) return { ok: false };
  const { text } = body;
  if (typeof text !== "string" || text.trim() === "") return { ok: false };
  return { ok: true, text };
}

/** Строка от модели → { ok: true, topic, draft } | { ok: false, reason }. Лишние поля модели отбрасываются. */
export function parseModelOutput(output) {
  if (typeof output !== "string") return { ok: false, reason: "not_string" };
  let data;
  try {
    data = JSON.parse(output);
  } catch {
    return { ok: false, reason: "bad_json" };
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) return { ok: false, reason: "not_object" };
  if (!TOPICS.includes(data.topic)) return { ok: false, reason: "bad_topic" };
  if (typeof data.draft !== "string" || data.draft.trim() === "") return { ok: false, reason: "empty_draft" };
  return { ok: true, topic: data.topic, draft: data.draft.trim() };
}

export class ModelTimeoutError extends Error {
  constructor(ms) {
    super(`model did not answer in ${ms} ms`);
    this.name = "ModelTimeoutError";
  }
}

/**
 * Вызывает модель не дольше `ms`. Модель получает AbortSignal; если она его игнорирует,
 * ответ всё равно не ждём — гонка с таймером. Таймер всегда очищается.
 */
export async function callModel(classify, text, ms = MODEL_TIMEOUT_MS) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ModelTimeoutError(ms));
    }, ms);
  });
  const call = Promise.resolve().then(() => classify(text, { signal: controller.signal }));
  call.catch(() => {}); // поздний отказ модели после таймаута не должен стать unhandled rejection
  try {
    return await Promise.race([call, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Полный разбор: текст → тело ответа API и причина ручного разбора (для журнала). */
export async function triage(classify, text, ms = MODEL_TIMEOUT_MS) {
  let output;
  try {
    output = await callModel(classify, text, ms);
  } catch (error) {
    const reason = error instanceof ModelTimeoutError ? "timeout" : "model_error";
    return { body: MANUAL_REVIEW, reason };
  }
  const parsed = parseModelOutput(output);
  if (!parsed.ok) return { body: MANUAL_REVIEW, reason: parsed.reason };
  return { body: { status: "ready", topic: parsed.topic, draft: parsed.draft }, reason: null };
}
