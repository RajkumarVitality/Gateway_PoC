# Appium Mobile Tests with TypeScript

WebdriverIO, Mocha and TypeScript tests for the Flutter demo app on LambdaTest.
The current registered scenario is `login-logout`.

## Setup

Use Node.js 20 or later. Run commands from this directory:

```bash
npm install
```

Set `LT_USERNAME`, `LT_ACCESS_KEY` and `APP_PASSWORD` as environment variables
or in the ignored `lambdatest.properties` file. Legacy cloud credential aliases
`UserName` and `AccessKey` are also accepted. Never commit real credentials.

The mobile test uses the provisioned `testAccounts.member` username from
[`TestUser.ts`](./tests/helpers/user_helpers/TestUser.ts), not a hardcoded test
user. Its password comes from `APP_PASSWORD`.

### Encrypt stored credentials

Encrypt `LT_ACCESS_KEY` (including the legacy `AccessKey` alias) and
`APP_PASSWORD` in the local properties file:

```bash
npm run secrets:encrypt
source ~/.config/appium-gateway/secrets.env
```

The command replaces these values in place with authenticated AES-256-GCM
`ENC[v1:...]` ciphertext, using a random nonce per value. It preserves other
properties and does not print credentials. Repeating it validates existing
encrypted values without encrypting them again. An optional file path can be
passed after `--`.

The separate random 256-bit key is kept outside the repository in
`~/.config/appium-gateway/secrets.env` with owner-only permissions. Keep a
secure backup of this key: losing it requires replacing the credentials.
Never commit, share, or upload the key file alongside the ciphertext.
Alternatively, provide `APPIUM_SECRETS_KEY` through your shell or CI secret
store before encryption; it must be Base64 for exactly 32 random bytes.
Base64 is only the key/ciphertext representation, not the encryption itself.

Runtime configuration automatically decrypts `ENC[v1:...]` values from
properties or environment variables; environment variables still take
precedence. Missing keys, incorrect keys, and modified ciphertext fail
explicitly. Plaintext values remain supported for existing shell/CI secrets.
Decrypted credentials still exist in process memory and are sent to the
configured test services; encryption only protects stored values.

Local properties files are excluded from this repository. This repository
starts from a clean source snapshot without the original Git history.
Rotate any credentials previously committed or exposed in the source
repository or logs, and do not commit plaintext replacements.

### Run a mobile test

```bash
npm test
```

The launcher prompts for Android/iOS and the `mdev`, `catest`/`ca-test`, or
`cadev`/`ca-dev` environment on every interactive run. Press Enter to accept
the displayed default. It passes the same selected environment to test-account
provisioning and Allure run metadata.

The environment default is the current `VG_ENVIRONMENT` value from the shell
or `user-creation.properties`, otherwise `mdev`. The platform default is the
current `PLATFORM`/`platform` value, otherwise iOS. Existing variables can
therefore preselect defaults; use `npm run test:android` or `npm run test:ios`
to launch with the same prompt and defaults.

For CI or other non-interactive runs, no prompt is shown: `PLATFORM` and
`VG_ENVIRONMENT` are used when set, with iOS and mdev as defaults. `CI` also
disables prompting. Forward WebdriverIO options after `--`, for example
`npm test -- --suite smoke`.

`LT_SCENARIO` defaults to `login-logout`; `flutter-login-screen` and
`loginAndLogout` remain accepted aliases. The scenario defaults to iOS 17.
Runtime `appId` takes precedence over platform app settings and `LT_APP_ID`.
If no standard App ID is configured, iOS login/logout can use the
`demo_Flutter` key from properties. Existing `iosAppId`/`androidAppId` settings
remain supported and take precedence over that demo fallback.

`PLATFORM`, `device`/`LT_DEVICE`, and `version`/`LT_VERSION` override defaults.
Android selectors in the current YAML are reused placeholders: confirm real
Android locators before running Android text validation.

The `test:login`, `test:ios`, `test:android`, `test:smoke` and `test:regression`
scripts all select the current login/logout scenario. Smoke and regression
each run that one spec. Obsolete MHA, screening and lockout flows are removed.

## Member provisioning

Provisioning runs in the worker's `beforeSession` hook, before opening a cloud
device session. Mocha's `before` hook only verifies that setup succeeded.
Failed configuration or API requests stop the worker; no fixed-user fallback
is used. A live run creates a real backend account and opens a cloud session.

Configure the selected user-creation profile with `API_BEARER_TOKEN`,
`API_BASIC_AUTH`, `LOGIN_PREFIX`, `ZUUL_URL`, `TENANT_NUMBER`,
`INTEGRATION_PLATFORM_BASE_URL`, `EMAIL_DOMAIN`, and shared `configUserAgent`.
`VG_ENVIRONMENT` accepts `mdev`, `ca-test`, or `ca-dev`.
Provisioning creates/enrols/registers a member, calculates status, captures
login events, processes rewards/events and deletes onboarding instructions.
API requests use the unprefixed email; the mobile login uses `LOGIN_PREFIX`
plus that generated email.

`getUserInstruction` has a 30-second timeout per attempt and up to three
attempts, retrying only transient network errors, timeouts or HTTP 502/503/504
with 500 ms and 1,000 ms backoff. Authentication/TLS/invalid responses fail
immediately. `captureLoginEvents` has a 30-second timeout and is not retried,
because it writes data. Check backend logs before replaying failed writes.
Warnings retain network error codes without exposing tokens or request bodies.

## YAML-driven mobile elements

[`src/elements/login.yml`](./src/elements/login.yml) stores two YAML documents:

- `LoginScreen and WelcomeScreen`: six elements, three text assertions.
- `Home Screen`: eight elements, seven text assertions.

Each document has `version: 1`, a unique `screen`, and a nonempty `elements`
mapping. Elements require Android and iOS selectors. Optional `validation`
supports `match: equals` or `match: includes` and nonempty `text`.

```yaml
version: 1
screen: Example Screen
elements:
  heading:
    android: "//*[@resource-id='heading']"
    ios: "//*[@name='heading']"
    validation:
      match: equals
      text: Welcome
```

Separate screen documents using `---`. Quote text containing `: `.
The loader rejects unknown fields, duplicate YAML keys, duplicate screen names,
invalid match modes and malformed documents. A multi-screen file requires
explicit screen selection and every document is validated before use.

[`MobileElementScreen.ts`](./src/pages/MobileElementScreen.ts) supplies shared
visibility and text validation. Text uses trimmed `getText()` first, falling
back to iOS `value` or Android `content-desc` only when text is empty.
`validateScreen()` checks every configured element sequentially and fails at
the first incorrect visibility/text assertion.

The login/logout test validates login, enters the provisioned credentials,
submits, validates all home elements and declared text, then clicks Logout.
It does not currently assert the post-logout destination or confirmation.

### Allure history: environment and date filters

Each new mobile execution saves isolated results and metadata under
`target/allure-runs/<run-id>/`. Runs are retained instead of mixing results
from different environments. `VG_ENVIRONMENT` accepts `mdev`, `catest` or
`cadev`; `ca-test` and `ca-dev` remain supported and are the canonical names
shown inside Allure. Provisioning and report metadata use the same environment.

```bash
VG_ENVIRONMENT=mdev npm test
VG_ENVIRONMENT=catest npm test
VG_ENVIRONMENT=cadev npm test
npm run report:generate
npm run report:open
```

The landing page filters completed runs by environment and an inclusive
From/To date range based on execution start date in **UTC**. Clear filters
restores all runs. Each row links to that run's Allure report, whose Environment
section contains the environment, platform, scenario, start/end times and status.
Tests also receive environment and execution-date labels.

Generate reports after tests finish, including failed runs. Generation skips
active runs and retains previously generated reports. Allure generation requires
Java, as before. Old `target/allure-results` files are not imported because their
environment and execution metadata cannot be reliably inferred. Keep
`target/allure-runs` and `target/allure-report` to retain report history; no
credentials are written into run metadata.

### Offline validation commands

These commands do not provision users or start a mobile session:

```bash
npm run validate:elements
npm run validate:elements -- src/elements/login.yml
npm run test:unit
npm run typecheck
```

The validator accepts YAML files or directories recursively and prints one
`PASS` per screen. Invalid stores or missing input paths exit nonzero.
Unit tests use mocked accounts, credentials, Appium commands and HTTP requests.

## Search timeouts and cleanup

`LT_WAIT_SECONDS` defaults to **3 seconds**. Element polling starts before
the initial lookup, pauses at most 250 ms, and stops at the deadline.
An in-flight Appium/network command can still exceed the polling window.
Stale-element click/type retries remain bounded to three attempts.
`LT_TEST_TIMEOUT_SECONDS` defaults to 900 seconds for the entire test and must
exceed the element timeout.

At session startup the console prints `[MobileTestRunner] Bundle ID: ...`
(Android: `App package`). Identification uses explicit `IOS_BUNDLE_ID` /
`LT_IOS_BUNDLE_ID` or `ANDROID_APP_PACKAGE` / `LT_ANDROID_APP_PACKAGE`, then
session capabilities, then iOS `mobile: activeAppInfo` or Android's current
package. Automatic discovery rejects missing IDs and system apps.

The app is uninstalled in the `after` hook before WebdriverIO deletes the
remote session. Uninstall failures are logged and mark execution unsuccessful.
WebdriverIO owns session deletion; hooks do not double-delete it.
The dashboard browser tab is closed best-effort in `afterSession`, so local
browser cleanup cannot delay remote session deletion.

`LT_OPEN_LIVE_SESSION=false` disables dashboard auto-opening; CI also disables
it. Session IDs and URLs are logged regardless. Browser-tab closure may depend
on macOS browser automation permissions.

## Reports

Artifacts are written to `target/test-artifacts` (`LT_ARTIFACTS_DIR` overrides
the path), and isolated Allure results to `target/allure-runs/<run-id>/results`.

```bash
npm run report:generate
npm run report:open
```

The filterable landing page is `target/allure-report/index.html`. Generated
reports/results and test artifacts are not source files, but deleting them
removes the saved history. Previously deleted report data is not restored
with source-code recovery.

## LambdaTest script generator agent

The workspace custom agent is
[`lambdatest-script-generator.agent.md`](./.github/agents/lambdatest-script-generator.agent.md).
Select **LambdaTest Script Generator** in VS Code Copilot Chat. If missing,
use **Chat: Configure Custom Agents** and check workspace agent support.

Provide the journey, expected results, platform and confirmed selectors or
sanitized page source. The generator reuses project helpers and requires
approval before live cloud sessions or backend provisioning.

It uses the official
[`appium-skill`](./.github/skills/appium-skill/SKILL.md) from
[LambdaTest/agent-skills](https://github.com/LambdaTest/agent-skills), installed
under `.github/skills/`. The
[upstream revision](./.github/skills/appium-skill/UPSTREAM.md) and
[MIT license](./.github/skills/appium-skill/LICENSE) are retained.
These are reusable AI instructions, not a LambdaTest API/MCP connection,
and do not themselves upload apps or launch sessions.
