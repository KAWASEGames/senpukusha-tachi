const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const os = require("node:os");

async function main() {
  const browser = await chromium.launch({ headless: true, ...(process.env.TRIAL_BROWSER_PATH ? { executablePath: process.env.TRIAL_BROWSER_PATH } : {}) });
  const playUrl = process.env.TRIAL_TEST_URL || pathToFileURL(path.resolve(__dirname, "../play.html")).href;
  const landingUrl = new URL("./index.html", playUrl).href;
  try {
    for (const width of [320, 433, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 950 } });
      const page = await context.newPage();
      const errors = [];
      const gameRequests = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => {
        if (/trial-(engine|game)\.js/.test(request.url())) gameRequests.push(request.url());
      });
      await page.goto(landingUrl, { waitUntil: "domcontentloaded" });
      const entries = page.locator('button[data-config="ctaLabel"]');
      assert.equal(await entries.count(), 2);
      for (const button of await entries.all()) {
        assert.equal(await button.isDisabled(), true);
        assert.match(await button.textContent(), /準備中/);
      }
      assert.equal(await page.locator('a[href*="play.html"], a[href^="https://shiyutaku.com"]').count(), 0);
      await page.locator("#shiyutaku").scrollIntoViewIfNeeded();
      assert.equal(await page.locator("#shiyutaku .play-status-label").textContent(), "準備中");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (width === 433) await page.locator("#shiyutaku").screenshot({ path: path.join(os.tmpdir(), "senpukusha-maintenance-section.png"), animations: "disabled" });

      // Existing bookmarks, including old cache-busting query strings, must be closed too.
      await page.goto(`${playUrl}?v=b3a249a`, { waitUntil: "domcontentloaded" });
      assert.equal(await page.locator("#trial-maintenance-title").textContent(), "準備中");
      assert.equal(await page.locator("[data-cpu-trial]").count(), 0);
      assert.equal(await page.locator('script[src*="trial-"]').count(), 0);
      assert.equal(await page.evaluate(() => typeof window.SenpukushaTrial), "undefined");
      assert.equal(await page.evaluate(() => document.querySelector("#paused-trial").content.querySelectorAll("[data-cpu-trial]").length), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(gameRequests, []);
      assert.deepEqual(errors, []);
      if (width !== 320) await page.screenshot({ path: path.join(os.tmpdir(), `senpukusha-maintenance-${width}.png`), animations: "disabled" });
      console.log(JSON.stringify({ width, disabledEntries: 2, directAccessClosed: true, gameRequests, errors }));
      await context.close();
    }
    const noScript = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 950 } });
    const page = await noScript.newPage();
    await page.goto(playUrl, { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("#trial-maintenance-title").isVisible(), true);
    assert.equal(await page.locator("[data-cpu-trial]").count(), 0);
    await noScript.close();
    console.log("Maintenance remains visible without JavaScript.");
  } finally {
    await browser.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
