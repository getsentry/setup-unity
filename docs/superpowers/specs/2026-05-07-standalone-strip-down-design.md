# setup-unity standalone strip-down — design

**Status:** approved
**Date:** 2026-05-07
**Owner:** Sentry Unity SDK team

## Goal

Convert `getsentry/setup-unity` from a divergent fork of `kuler90/setup-unity` into a standalone, narrowly-scoped GitHub Action that installs a known Unity Editor version on Ubuntu, macOS, and Windows. The action exists to support the Unity SDK's CI; the only consumer today is `getsentry/sentry-unity`.

Optimize for: maintainability, predictability, and "if Unity Hub says success, you can actually build."

## Non-goals

- Auto-discovery of Unity version from a project file.
- Auto-discovery of the changeset from unity.com (HTML scraping).
- Self-hosted runner support.
- Custom install paths.
- Backwards compatibility with the original kuler90 input contract.

## Action contract

### Inputs

| Input | Required | Notes |
|---|---|---|
| `unity-version` | yes | e.g. `2022.3.21f1` |
| `unity-version-changeset` | yes | e.g. `f9bb1bcc7635`. No fallback — fail fast if missing. |
| `unity-modules` | no | Newline-separated module ids. Empty allowed (Editor only). Always installed with `--childModules`. |

Removed inputs (relative to current code): `project-path`, `install-path`, `self-hosted`, `unity-modules-child`.

### Outputs

| Output | Notes |
|---|---|
| `unity-version` | echoed input |
| `unity-path` | absolute path to the Unity Editor binary |

The action also exports `UNITY_PATH` to the workflow environment (parity with current behavior).

### Caller migration

`getsentry/sentry-unity`'s `test-build-windows.yml` currently passes only `unity-version`. It must additionally pass `unity-version-changeset`. The changeset is already parsed alongside the version in the existing env step that reads `ProjectVersion.txt`.

## Install flow

Per platform, after parsing inputs:

### Linux (Ubuntu 20.04+ runners, GitHub-hosted)

1. Download `UnityHub.AppImage` to `~/Unity Hub/UnityHub.AppImage`, `chmod +x`.
2. Touch `~/.config/Unity Hub/eulaAccepted`.
3. `apt-get update && apt-get install -y` the system libs Unity Hub needs:
   `libgconf-2-4 libglu1 libasound2 libgtk2.0-0 libgtk-3-0 libnss3 zenity xvfb libfuse2`
   plus the libssl variant matching the runner's Ubuntu version:
   - `lsb_release -rs` ≥ `22.04` → install `libssl3`.
   - else → install `libssl1.1`.
   Errors here are no longer swallowed; if apt fails, the action fails with the apt output.
4. Always run `apt-get` with `sudo` (GitHub-hosted runner; no self-hosted mode).
5. Hub invocation wrapper: `xvfb-run --auto-servernum -e >(cat >&1) "<hub>" --disable-gpu-sandbox --headless <args>`.

### macOS (macos-latest, arm64)

1. Download `UnityHubSetup.dmg`, `hdiutil mount`, `ditto` the app to `/Applications/Unity Hub.app`, `hdiutil detach`, remove the dmg.
2. Hub invocation wrapper: `"<hub>" -- --headless <args>`.
3. Architecture flag during editor install:
   - Unity ≥ 2021.2 → `--architecture arm64`.
   - else → `--architecture x86_64` (Apple Silicon Unity shipped in 2021.2; older versions have no arm64 build).
   - Version comparison parses major + minor: split on `.`, compare as integers.
4. Post-install: ensure `/Library/Application Support/Unity` exists and is owned by the runner user (current behavior; required because Unity creates files there at first launch).

### Windows (windows-latest)

1. Download `UnityHubSetup.exe`, run with `/s` (silent install). Delete the installer.
2. Hub invocation wrapper: `"<hub>" -- --headless <args>` (Unity Hub on Windows always returns exit code 1 even on success — `ignoreReturnCode: true`).

### Module install (all platforms)

After the editor is installed, if `unity-modules` is non-empty:

```
unityhub install-modules --version <ver> --module <m1> --module <m2> ... --childModules
```

`--childModules` is always passed (the only consumer wants children, and the option produced more support burden than value).

## Verification

The action does not trust Unity Hub stdout alone. After install, three checks gate success:

1. **Stdout heuristic (kept):** module-install stdout must contain either `successfully` or `it's already installed`. Failure here errors immediately with the captured output.
2. **Module-on-disk check:** for each requested module, verify expected paths exist under the Unity install root. Maintain a small map keyed by module id. Examples:
   - `windows-il2cpp` → `<unityRoot>/Editor/Data/PlaybackEngines/WindowsStandaloneSupport/Variations/win64_player_il2cpp` (existence of any `*_il2cpp*` variant directory).
   - `mac-il2cpp` → `<unityRoot>/PlaybackEngines/MacStandaloneSupport/Variations/macos_player_development_il2cpp` (or any il2cpp variant).
   - `linux-il2cpp` → `<unityRoot>/Editor/Data/PlaybackEngines/LinuxStandaloneSupport/Variations/linux64_*_il2cpp`.
   - `android` → `<unityRoot>/Editor/Data/PlaybackEngines/AndroidPlayer`.
   - `ios` → `<unityRoot>/PlaybackEngines/iOSSupport` (macOS) or equivalent.
   - Modules without a known mapping log a warning but do not fail (preserves forward compatibility for new module ids).
3. **Editor smoke launch:** invoke `<unity> -batchmode -nographics -quit -logFile -` with a short timeout (~30s). Exit 0 confirms the editor binary is wired up and launchable. No Unity license is required for `-quit`-only invocations.

If any of (1)–(3) fails, the action fails with a clear, actionable message naming the failing check.

## Repo structure

After the strip-down:

```
.
├── action.yml                   # node24, main: dist/index.js
├── src/
│   └── index.js                 # single file, ~150–200 lines
├── dist/
│   └── index.js                 # ncc bundle, committed
├── .github/
│   └── workflows/
│       ├── ci.yml               # lint + dist-in-sync
│       └── smoke.yml            # 3-OS smoke matrix
├── package.json
├── package-lock.json
├── .gitignore                   # node_modules/
├── README.md
└── LICENSE
```

Removed: committed `node_modules/`, `src/setup.js` (renamed to `src/index.js` for ncc convention), the three upstream `test-{ubuntu,macos,windows}.yml` workflows.

## Packaging

- `package.json`:
  - `name`: `setup-unity` (unchanged).
  - `repository.url`: `git+https://github.com/getsentry/setup-unity.git`.
  - `private`: `true` (this is an action, not an npm package).
  - `scripts.build`: `ncc build src/index.js -o dist --license licenses.txt`.
  - `devDependencies`: `@vercel/ncc`.
  - Runtime deps unchanged: `@actions/core`, `@actions/exec`, `@actions/tool-cache`.
- `action.yml`:
  - `runs.using`: `node24`.
  - `runs.main`: `dist/index.js`.
- `.gitignore`: add `node_modules/`.

## CI

Two workflows.

### `ci.yml` — every push/PR

Goal: keep the bundle honest and the source clean.

```
- npm ci
- npm run build
- git diff --exit-code dist/   # fails if bundle is out of date
```

(Optional add later: `node --check src/index.js` or a real lint. Not in initial scope.)

### `smoke.yml` — push to master + manual dispatch

Goal: prove the action installs a usable Unity on each supported OS.

Matrix:

| os | unity-version | unity-version-changeset | unity-modules |
|---|---|---|---|
| `ubuntu-22.04` | a single recent LTS, e.g. `2022.3.21f1` | matching changeset | `linux-il2cpp` |
| `macos-latest` | same | same | `mac-il2cpp` |
| `windows-latest` | same | same | `windows-il2cpp` |

Each job: checkout → `uses: ./` with the matrix inputs → assert `${{ steps.setup-unity.outputs.unity-path }}` is non-empty and the file exists on disk.

The action's internal verification (module-on-disk + editor smoke launch) runs inside `uses: ./`, so the workflow itself doesn't need to duplicate it. If the action fails verification, the smoke job fails.

## Repo hygiene

- Drop the `upstream` git remote (`git remote remove upstream`). Local config; document only.
- Rewrite `README.md`: short, getsentry-branded, no kuler90 references or badges, documents the three inputs and two outputs only. Example usage block uses `getsentry/setup-unity@<version>`.
- `LICENSE`: MIT, Sentry's standard format. Two copyright lines:
  - `Copyright (c) 2020 Anton Kuznetsov`
  - `Copyright (c) 2026 Functional Software, Inc. dba Sentry`
- Optional: `.github/CODEOWNERS` pointing at the Unity SDK team. Defer until requested.

## Out of scope

- Versioned releases / tag automation (`v1`, `v2` tags, release-please, etc.).
- Caching the Unity install across runs.
- Activating Unity / managing licenses (separate action in sentry-unity's CI).
- Building a sentry-unity test project (sentry-unity's CI does that).

## Risks

- **Module-on-disk path map drift.** Unity occasionally renames PlaybackEngine directories between major versions. The map covers the modules sentry-unity actually uses today; new modules log a warning instead of failing. Acceptable.
- **Unity Hub headless behavior changes.** Already happens in the wild (the recent page-URL + success-string churn). The verification layer is meant to make those failures fail fast and obviously instead of silently producing a broken install.
- **macOS architecture threshold.** The `>= 2021.2` rule is correct for current Unity versions but Unity could ship arm64 for older releases retroactively (unlikely). Keeping the threshold simple over speculative future-proofing.
- **Linux libssl detection.** Relies on `lsb_release -rs`. Present on all GitHub-hosted Ubuntu images. If GitHub changes images, this needs adjustment — but the failure would be obvious.
