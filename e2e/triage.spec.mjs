import { test, expect } from "@playwright/test";

const MANUAL = "Автоматический разбор не удался — разберите заявку вручную.";
const DRAFT = "Спасибо за обращение. Уточним детали заявки.";

async function submit(page, text) {
  await page.getByLabel("Текст заявки").fill(text);
  await page.getByRole("button", { name: "Разобрать заявку" }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("успех: менеджер видит тему словами и черновик", async ({ page }) => {
  await submit(page, "Когда будет доставка?");
  await expect(page.locator("#topic")).toHaveText("Доставка");
  await expect(page.locator("#draft")).toHaveText(DRAFT);
  await expect(page.locator("#message-box")).toBeEmpty(); // пустое сообщение скрыто — по роли не ищется
});

for (const mark of ["[timeout]", "[error]", "[bad-json]", "[bad-topic]", "[empty-draft]"]) {
  test(`сбой ${mark}: ручной разбор, прежний черновик стёрт`, async ({ page }) => {
    await submit(page, "Какая цена?");
    await expect(page.locator("#draft")).toHaveText(DRAFT);

    await submit(page, `Какая цена? ${mark}`);
    await expect(page.getByRole("status")).toHaveText(MANUAL);
    await expect(page.locator("#draft")).toHaveText("");
    await expect(page.locator("#ready")).toBeHidden();
  });
}

test("пустой ввод: просьба ввести текст, черновика нет", async ({ page }) => {
  await submit(page, "Когда будет доставка?");
  await expect(page.locator("#draft")).toHaveText(DRAFT);
  await submit(page, "   ");
  await expect(page.getByRole("status")).toHaveText("Введите текст заявки.");
  await expect(page.locator("#ready")).toBeHidden();
});

test("запоздавший ответ первого запроса не перетирает второй", async ({ page }) => {
  // Первый ответ задерживаем, второй отпускаем сразу.
  let first = true;
  await page.route("**/api/triage", async (route) => {
    if (first) {
      first = false;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    await route.continue().catch(() => {}); // отменённый браузером запрос
  });
  await submit(page, "Какая цена?");
  await submit(page, "Когда будет доставка?");
  await expect(page.locator("#topic")).toHaveText("Доставка");
  await page.waitForTimeout(1_000);
  await expect(page.locator("#topic")).toHaveText("Доставка");
});

test("новый запрос стирает прежний черновик сразу, до ответа сервера", async ({ page }) => {
  await submit(page, "Когда будет доставка?");
  await expect(page.locator("#draft")).toHaveText(DRAFT);
  await submit(page, "Когда будет доставка? [timeout]"); // сервер ответит только через 300 мс
  await expect(page.getByRole("status")).toHaveText("Разбираем заявку…", { timeout: 250 });
  await expect(page.locator("#draft")).toHaveText("", { timeout: 250 });
  await expect(page.getByRole("status")).toHaveText(MANUAL);
});
