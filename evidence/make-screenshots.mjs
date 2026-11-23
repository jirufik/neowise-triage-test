// Снимки «как было / как стало». Нужны два сервера: выданный код (git worktree a9a2f68) на 3001, решение на 3000.
// Запуск: node evidence/make-screenshots.mjs evidence/screenshots
import { chromium } from "playwright";
const out = process.argv[2];
const SITES = { before: "http://127.0.0.1:3001/", after: "http://127.0.0.1:3000/" };
const SCENARIOS = [
  ["ok", null, "Когда будет доставка?"],
  ["empty", null, "   "],
  ["timeout", "Какая цена?", "Какая цена? [timeout]"],
  ["error", "Какая цена?", "Какая цена? [error]"],
  ["badjson", "Какая цена?", "Какая цена? [bad-json]"],
  ["badtopic", "Какая цена?", "Какая цена? [bad-topic]"],
  ["emptydraft", "Какая цена?", "Какая цена? [empty-draft]"],
];
const browser = await chromium.launch({ channel: "chrome" });
for (const [site, url] of Object.entries(SITES)) {
  for (const [name, first, text] of SCENARIOS) {
    const page = await browser.newPage({ viewport: { width: 760, height: 520 } });
    await page.goto(url);
    const send = async (t) => {
      await page.fill("#message", t);
      await page.click("button[type=submit]");
      await page.waitForTimeout(1600); // у исходного кода [timeout] отвечает через 1,2 с
    };
    if (first) await send(first);
    await send(text);
    await page.screenshot({ path: `${out}/${site}-${name}.png` });
    await page.close();
  }
}
await browser.close();
console.log("ok");
