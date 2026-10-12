# Trial Checks

Engine checks use only Node.js:

```sh
node tests/trial-engine.test.cjs
```

Browser checks additionally use Playwright and an installed Chromium browser:

```sh
node tests/trial-browser.cjs
```

Optional environment variables:

- `TRIAL_BROWSER_PATH`: path to Chrome or Edge if Playwright's Chromium is not installed.
- `TRIAL_TEST_URL`: deployed site URL; defaults to the local `index.html`.

The browser checks use a fixed seed and shortened timers inside the test browser only.
Screenshots are written to the system temporary directory.
