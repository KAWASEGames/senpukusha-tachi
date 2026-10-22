# Trial Checks

The public trial is temporarily paused. Run the maintenance-page browser checks:

```sh
node tests/trial-maintenance.cjs
```

The game markup and script tags are preserved inside the inert `#paused-trial`
template in `play.html`. They are not mounted or loaded on the public page.
The full game browser checks below apply after reopening the trial.

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
- `TRIAL_TEST_URL`: deployed CPU game URL; defaults to the local `play.html`.

The browser checks use a fixed seed and shortened timers inside the test browser only.
Screenshots are written to the system temporary directory.
