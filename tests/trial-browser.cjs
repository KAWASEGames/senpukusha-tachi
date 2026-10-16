const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const os = require("node:os");

async function main() {
  const browser = await chromium.launch({ headless: true, ...(process.env.TRIAL_BROWSER_PATH ? { executablePath: process.env.TRIAL_BROWSER_PATH } : {}) });
  const url = process.env.TRIAL_TEST_URL || pathToFileURL(path.resolve(__dirname, "../play.html")).href;
  const landingUrl = new URL("./index.html", url).href;
  try {
    for (const width of [320, 433, 680, 1099, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 950 }, hasTouch: width < 680 });
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
      await page.goto(landingUrl, { waitUntil: "domcontentloaded" });
      assert.equal(await page.locator("[data-cpu-trial]").count(), 0);
      assert.equal(await page.locator('script[src*="trial-"]').count(), 0);
      assert.equal(await page.locator(".external-play-link").getAttribute("href"), "https://shiyutaku.com/home");
      await page.locator('.play-links a[href="./play.html"]').click();
      await page.waitForURL("**/play.html");
      const root = page.locator("[data-cpu-trial]");
      await root.scrollIntoViewIfNeeded();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => [...document.querySelectorAll("[data-cpu-trial] img[src]")].filter((img) => img.getBoundingClientRect().height > 0).every((img) => img.complete && img.naturalWidth > 0));
      assert.equal(await root.isVisible(), true);
      assert.equal(await page.locator("[data-trial-slot]").count(), 18);
      assert.equal(await page.locator('[data-trial-action="advance"]').isVisible(), false);
      assert.equal(await page.locator("[data-trial-alien]").count(), 0);
      assert.equal(await page.locator("[data-trial-hand]").count(), 3);
      assert.equal(await page.locator('[data-trial-avatar="0"]').getAttribute("src"), "./素材/man.png");
      assert.equal(await page.locator('[data-trial-avatar="1"]').getAttribute("src"), "./素材/woman.png");
      assert.equal(await page.locator("[data-trial-hand]:enabled").count(), 2);
      assert.equal(await page.locator('[data-trial-hand="2"]').isDisabled(), true);
      assert.ok(await page.locator('[data-trial-hand="2"]').evaluate((node) => Number(getComputedStyle(node).opacity) < .5));
      assert.equal(await page.locator("[data-trial-phase]").textContent(), "準備：あと2枚配置");
      assert.ok(await page.locator("[data-trial-phase]").evaluate((node) => parseFloat(getComputedStyle(node).fontSize) >= 24));
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
      const checkTable = async () => {
        const geometry = await page.locator("[data-trial-board]").evaluate((board) => {
          const area = board.getBoundingClientRect();
          const cards = [...board.children].filter((card) => !card.classList.contains("is-reserved-slot")).map((card) => card.getBoundingClientRect());
          const seats = [...document.querySelectorAll(".trial-seat")].map((seat) => seat.getBoundingClientRect());
          return {
            contained: cards.every((card) => card.left >= area.left && card.right <= area.right && card.top >= area.top && card.bottom <= area.bottom),
            overlaps: cards.some((a, index) => cards.slice(index + 1).some((b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)),
            seatsBeside: seats[0].right <= area.left && seats[1].left >= area.right
          };
        });
        assert.equal(geometry.contained, true);
        assert.equal(geometry.overlaps, false);
        if (width >= 1100) assert.equal(geometry.seatsBeside, true);
      };
      await checkTable();
      if (width !== 320) {
        const screenshot = path.join(os.tmpdir(), `senpukusha-cpu-${width}.png`);
        const captureStyle = await page.addStyleTag({ content: ".site-header, .skip-link { visibility: hidden !important; } .trial-toolbar { position: static !important; }" });
        await root.screenshot({ path: screenshot });
        await captureStyle.evaluate((node) => node.remove());
        console.log("Screenshot:", screenshot);
      }
      const slot = (index) => page.locator(`[data-trial-slot="${index}"]`);
      const hand = (index) => page.locator(`[data-trial-hand="${index}"]`);
      const cdp = width < 680 ? await context.newCDPSession(page) : null;
      const drag = async (handIndex, slotIndex) => {
        await hand(handIndex).scrollIntoViewIfNeeded();
        const source = await hand(handIndex).boundingBox();
        const target = await slot(slotIndex).boundingBox();
        const from = { x: source.x + source.width / 2, y: source.y + source.height / 3 };
        const to = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
        if (cdp) {
          const touch = (point) => ({ ...point, radiusX: 4, radiusY: 4, force: 1, id: 1 });
          await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touch(from)] });
          for (let step = 1; step <= 8; step++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [touch({ x: from.x + (to.x - from.x) * step / 8, y: from.y + (to.y - from.y) * step / 8 })] });
          await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        } else {
          await page.mouse.move(from.x, from.y);
          await page.mouse.down();
          await page.mouse.move(to.x, to.y, { steps: 8 });
          await page.mouse.up();
        }
        assert.equal(await page.evaluate(({ h, s }) => window.testTrial.placement.includes(s), { h: handIndex, s: slotIndex }), true);
        assert.equal(await page.locator(".trial-drag-ghost").count(), 0);
      };
      const tap = async (locator) => width < 680 ? locator.tap() : locator.click();
      const moveCard = async (index, { cancel = false, edge = false } = {}) => {
        await slot(index).evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
        const before = await slot(index).boundingBox();
        const area = await page.locator("[data-trial-board]").boundingBox();
        const from = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
        const to = edge ? { x: area.x + 1, y: area.y + 1 } : { x: from.x + area.width * .05, y: from.y + area.height * .04 };
        if (cdp) {
          const touch = (point) => ({ ...point, radiusX: 4, radiusY: 4, force: 1, id: 1 });
          await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touch(from)] });
          for (let step = 1; step <= 8; step++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [touch({ x: from.x + (to.x - from.x) * step / 8, y: from.y + (to.y - from.y) * step / 8 })] });
          await cdp.send("Input.dispatchTouchEvent", { type: cancel ? "touchCancel" : "touchEnd", touchPoints: [] });
        } else {
          await page.mouse.move(from.x, from.y);
          await page.mouse.down();
          await page.mouse.move(to.x, to.y, { steps: 8 });
          if (cancel) await slot(index).dispatchEvent("pointercancel", { pointerId: 1 });
          await page.mouse.up();
        }
        assert.equal(await page.locator(".is-moving, .trial-drag-ghost").count(), 0);
        assert.deepEqual(await page.evaluate(() => window.testTrial.selected), []);
        if (!cancel) {
          assert.ok(await slot(index).evaluate((node) => !!node.style.left && !!node.style.top));
          const after = await slot(index).boundingBox();
          assert.ok(Math.abs(after.x - before.x) + Math.abs(after.y - before.y) > 8);
          assert.ok(after.x >= area.x && after.x + after.width <= area.x + area.width + 1);
          assert.ok(after.y >= area.y && after.y + after.height <= area.y + area.height + 1);
        }
      };
      // Moving a table card does not hide an alien or flip it, and survives rendering.
      await moveCard(5);
      const movedPosition = await slot(5).evaluate((node) => [node.style.left, node.style.top]);
      await tap(hand(0));
      assert.deepEqual(await slot(5).evaluate((node) => [node.style.left, node.style.top]), movedPosition);
      await tap(hand(0));
      await moveCard(5, { cancel: true });
      assert.deepEqual(await slot(5).evaluate((node) => [node.style.left, node.style.top]), movedPosition);
      await moveCard(5, { edge: true });
      assert.deepEqual(await page.evaluate(() => window.testTrial.placement), []);
      await page.locator('[data-trial-action="reset"]').click();
      assert.equal(await slot(5).evaluate((node) => node.style.left), "");
      await tap(hand(0));
      assert.equal(await hand(0).getAttribute("aria-pressed"), "true");
      await tap(hand(0));
      assert.equal(await hand(0).getAttribute("aria-pressed"), "false");
      const deploy = async () => {
        await drag(0, 0);
        assert.equal(await page.locator("[data-trial-phase]").textContent(), "準備：あと1枚配置");
        await tap(hand(1));
        assert.equal(await hand(1).getAttribute("aria-pressed"), "true");
        await tap(slot(3));
        await page.waitForFunction(() => window.testTrial.phase === "turn");
        assert.equal(await page.evaluate(() => window.testTrial.turn), 0);
        assert.equal(await page.locator("[data-trial-hand-count]").textContent(), "1枚");
      };
      await deploy();
      assert.equal(await page.evaluate(() => window.testTrial.phase), "turn");
      const identities = await page.evaluate(() => window.testTrial.board.map((card) => card?.type));
      await moveCard(0);
      assert.deepEqual(await page.evaluate(() => window.testTrial.board.map((card) => card?.type)), identities);
      const playingPosition = await slot(0).evaluate((node) => [node.style.left, node.style.top]);
      await page.locator('[data-trial-action="pause"]').click();
      await page.locator('[data-trial-action="pause"]').click();
      assert.deepEqual(await slot(0).evaluate((node) => [node.style.left, node.style.top]), playingPosition);
      await page.locator('[data-trial-action="reset"]').click();
      await deploy();
      const shuffle = page.locator('[data-trial-action="shuffle"]');
      assert.equal(await shuffle.isDisabled(), false);
      await shuffle.click();
      assert.equal(await page.evaluate(() => window.testTrial.board.length), 17);
      assert.equal(await page.locator("[data-trial-hand-count]").textContent(), "0枚");
      assert.equal(await shuffle.isDisabled(), true);
      assert.equal(await page.locator("[data-trial-shuffle-label]").textContent(), "残り0回");
      await checkTable();

      // Mismatch hands the turn to CPU, whose two flips are then visible.
      const mismatch = await page.evaluate(() => {
        const game = window.testTrial;
        const a = game.board.findIndex((card) => !card.type.startsWith("alien"));
        const b = game.board.findIndex((card, index) => index !== a && card.type !== game.board[a].type);
        return [a, b];
      });
      await slot(mismatch[0]).click();
      assert.equal(await shuffle.isDisabled(), true);
      await slot(mismatch[1]).click();
      await page.locator('[data-trial-action="pause"]').click();
      const pausedPhase = await page.evaluate(() => window.testTrial.phase);
      await new Promise((resolve) => setTimeout(resolve, 250));
      assert.equal(await page.evaluate(() => window.testTrial.phase), pausedPhase);
      assert.equal(await slot(0).isDisabled(), true);
      await page.locator('[data-trial-action="pause"]').click();
      await page.waitForFunction(() => ["roundEnd", "matchEnd"].includes(window.testTrial.phase) || (window.testTrial.turnNumber >= 3 && window.testTrial.turn === 0 && window.testTrial.phase === "turn"));
      assert.ok(await page.evaluate(() => window.testTrial.history.some((entry) => entry.includes("CPU"))));
      assert.equal(await page.evaluate(() => window.testTrial.lastPair.length), 2);

      // Pause and reset cancel pending CPU/resolve timers.
      await page.locator('[data-trial-action="reset"]').click();
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal(await page.evaluate(() => window.testTrial.phase), "setup");
      assert.equal(await page.evaluate(() => window.testTrial.selected.length), 0);

      // Play all three rounds through the actual buttons to reach the result.
      for (let round = 1; round <= 3; round++) {
        await deploy();
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
      await page.locator(".trial-back-link").click();
      await page.waitForURL("**/index.html#shiyutaku");
      assert.equal(await page.locator("[data-cpu-trial]").count(), 0);
      assert.equal(await page.locator(".play-links").isVisible(), true);
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ width, layout, dragAndDrop: true, touchFallback: width < 680, shuffle: true, cpuTurn: true, matchComplete: true, errors }));
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
