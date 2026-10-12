const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const os = require("node:os");

async function main() {
  const browser = await chromium.launch({ headless: true, ...(process.env.TRIAL_BROWSER_PATH ? { executablePath: process.env.TRIAL_BROWSER_PATH } : {}) });
  const url = process.env.TRIAL_TEST_URL || pathToFileURL(path.resolve(__dirname, "../index.html")).href;
  try {
    for (const width of [320, 433, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 950 } });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      // Only the test browser uses a fixed seed and shortened game delays.
      await page.addInitScript(() => {
        const originalTimeout = window.setTimeout.bind(window);
        window.setTimeout = (callback, delay, ...args) => originalTimeout(callback, delay >= 900 && delay <= 1300 ? 120 : delay, ...args);
        let api;
        Object.defineProperty(window, "SenpukushaTrial", {
          configurable: true,
          get: () => api,
          set: (value) => {
            api = value;
            const Original = api.Game;
            api.Game = class extends Original {
              constructor(options) {
                super({ ...options, random: () => 0 });
                window.testTrial = this;
              }
            };
          }
        });
      });
      await page.goto(url, { waitUntil: "domcontentloaded" });
      const root = page.locator("[data-cpu-trial]");
      await root.scrollIntoViewIfNeeded();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => [...document.querySelectorAll("[data-cpu-trial] img[src]")].filter((img) => img.getBoundingClientRect().height > 0).every((img) => img.complete && img.naturalWidth > 0));
      assert.equal(await root.isVisible(), true);
      assert.equal(await page.locator("[data-trial-slot]").count(), 18);
      assert.equal(await page.locator('[data-trial-action="advance"]').isDisabled(), true);
      const layout = await root.evaluate((node) => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        minCardWidth: Math.min(...[...node.querySelectorAll("[data-trial-slot]")].map((card) => card.getBoundingClientRect().width)),
        minCardHeight: Math.min(...[...node.querySelectorAll("[data-trial-slot]")].map((card) => card.getBoundingClientRect().height)),
        external: document.querySelector(".trial-external").href
      }));
      assert.equal(layout.overflow, false);
      assert.ok(layout.minCardWidth >= 44);
      assert.ok(layout.minCardHeight >= 44);
      assert.equal(layout.external, "https://shiyutaku.com/home");
      if (width !== 320) {
        const screenshot = path.join(os.tmpdir(), `senpukusha-cpu-${width}.png`);
        const captureStyle = await page.addStyleTag({ content: ".site-header, .skip-link { visibility: hidden !important; } .trial-toolbar { position: static !important; }" });
        await root.screenshot({ path: screenshot });
        await captureStyle.evaluate((node) => node.remove());
        console.log("Screenshot:", screenshot);
      }
      const slot = (index) => page.locator(`[data-trial-slot="${index}"]`);
      await slot(0).click();
      await slot(3).click();
      await page.locator('[data-trial-action="advance"]').click();
      assert.equal(await page.evaluate(() => window.testTrial.phase), "turn");

      // Mismatch hands the turn to CPU, whose two flips are then visible.
      const mismatch = await page.evaluate(() => {
        const game = window.testTrial;
        const a = game.board.findIndex((card) => !card.type.startsWith("alien"));
        const b = game.board.findIndex((card, index) => index !== a && card.type !== game.board[a].type);
        return [a, b];
      });
      await slot(mismatch[0]).click();
      await slot(mismatch[1]).click();
      await page.locator('[data-trial-action="pause"]').click();
      const pausedPhase = await page.evaluate(() => window.testTrial.phase);
      await new Promise((resolve) => setTimeout(resolve, 250));
      assert.equal(await page.evaluate(() => window.testTrial.phase), pausedPhase);
      assert.equal(await slot(0).isDisabled(), true);
      await page.locator('[data-trial-action="pause"]').click();
      await page.waitForFunction(() => ["roundEnd", "matchEnd"].includes(window.testTrial.phase) || (window.testTrial.turnNumber >= 3 && window.testTrial.turn === 0 && window.testTrial.phase === "turn"));
      assert.ok(await page.evaluate(() => window.testTrial.memory[1].size > 2));

      // Pause and reset cancel pending CPU/resolve timers.
      await page.locator('[data-trial-action="reset"]').click();
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal(await page.evaluate(() => window.testTrial.phase), "setup");
      assert.equal(await page.evaluate(() => window.testTrial.selected.length), 0);

      // Play all three rounds through the actual buttons to reach the result.
      for (let round = 1; round <= 3; round++) {
        await slot(0).click();
        await slot(3).click();
        await page.locator('[data-trial-action="advance"]').click();
        const opponentPair = await page.evaluate(() => {
          const game = window.testTrial;
          return game.board.map((card, index) => index).filter((index) => game.board[index].type === game.alienType(1));
        });
        await slot(opponentPair[0]).click();
        await slot(opponentPair[1]).click();
        await page.waitForFunction(() => ["roundEnd", "matchEnd"].includes(window.testTrial.phase));
        assert.equal(await page.locator('[data-trial-score="0"]').textContent(), String(round));
        if (round < 3) await page.locator('[data-trial-action="advance"]').click();
      }
      assert.equal(await page.evaluate(() => window.testTrial.phase), "matchEnd");
      assert.equal(await page.locator('[data-trial-action="advance"]').textContent(), "もう一度遊ぶ");
      await page.locator('[data-trial-inspect]').first().click();
      assert.equal(await page.locator("[data-trial-dialog]").isVisible(), true);
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("[data-trial-dialog]").isVisible(), false);
      await page.locator('[data-trial-action="advance"]').click();
      assert.equal(await page.locator('[data-trial-score="0"]').textContent(), "0");
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ width, layout, cpuTurn: true, matchComplete: true, errors }));
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
