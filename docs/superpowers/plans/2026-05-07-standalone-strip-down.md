# setup-unity standalone strip-down — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `getsentry/setup-unity` into a standalone, minimal GitHub Action that installs a known Unity Editor version on Linux/macOS/Windows, with on-disk module verification and a smoke-launch check, replacing the divergent `kuler90/setup-unity` fork.

**Architecture:** Single-file install action (`src/index.js`) with pure helpers extracted to `src/verify.js` for testability. Bundled to `dist/index.js` via `@vercel/ncc`. Three required-ish inputs (`unity-version`, `unity-version-changeset`, `unity-modules`); no auto-discovery. Per-OS smoke workflow proves the install can actually build IL2CPP.

**Tech Stack:** Node 24, `@actions/core` / `@actions/exec` / `@actions/tool-cache`, `@vercel/ncc` for bundling, Node's built-in `node:test` for unit tests.

**Spec:** `docs/superpowers/specs/2026-05-07-standalone-strip-down-design.md`

**File map:**

| Path | Action | Responsibility |
|---|---|---|
| `.gitignore` | create | ignore `node_modules/` |
| `package.json` | rewrite | repo metadata, scripts, deps incl. ncc |
| `package-lock.json` | regenerate | from new package.json |
| `src/setup.js` | delete | replaced by `src/index.js` |
| `src/index.js` | create | main entry: parse inputs, dispatch per-platform install, verify, set outputs |
| `src/verify.js` | create | pure helpers: arch decision, libssl mapping, module path map, success-string check |
| `test/verify.test.js` | create | unit tests for `src/verify.js` |
| `dist/index.js` | create | ncc bundle, committed |
| `action.yml` | rewrite | new contract, `main: dist/index.js` |
| `node_modules/` | untrack | git rm -r --cached |
| `.github/workflows/test-ubuntu.yml` | delete | replaced by `smoke.yml` |
| `.github/workflows/test-macos.yml` | delete | replaced by `smoke.yml` |
| `.github/workflows/test-windows.yml` | delete | replaced by `smoke.yml` |
| `.github/workflows/ci.yml` | create | unit tests + dist-in-sync check |
| `.github/workflows/smoke.yml` | create | per-OS install + IL2CPP module smoke test |
| `README.md` | rewrite | getsentry-branded, three-input contract |
| `LICENSE` | edit | dual copyright (Kulesha + Sentry) |

---

## Task 1: Repo packaging baseline

**Files:**
- Create: `.gitignore`
- Modify: `package.json`
- Untrack: `node_modules/` (everything under it)

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
```

- [ ] **Step 2: Untrack `node_modules/` from git**

Run:
```bash
git rm -r --cached node_modules
```

Expected: many "rm 'node_modules/...'" lines.

- [ ] **Step 3: Rewrite `package.json`**

Replace contents with:

```json
{
  "name": "setup-unity",
  "version": "2.0.0",
  "description": "GitHub Action that installs Unity Editor on Linux, macOS, and Windows.",
  "private": true,
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/getsentry/setup-unity.git"
  },
  "main": "dist/index.js",
  "scripts": {
    "build": "ncc build src/index.js -o dist --license licenses.txt",
    "test": "node --test test/"
  },
  "dependencies": {
    "@actions/core": "^1.11.1",
    "@actions/exec": "^1.1.1",
    "@actions/tool-cache": "^2.0.2"
  },
  "devDependencies": {
    "@vercel/ncc": "^0.38.1"
  }
}
```

- [ ] **Step 4: Install dependencies**

Run:
```bash
npm install
```

Expected: `package-lock.json` regenerates; `node_modules/` populated locally but ignored by git.

- [ ] **Step 5: Verify ncc is available**

Run:
```bash
npx ncc --version
```

Expected: prints a version string, no error.

- [ ] **Step 6: Commit**

```bash
git add .gitignore package.json package-lock.json
git commit -m "chore: add .gitignore, untrack node_modules, add ncc"
```

(`git rm --cached` from Step 2 is staged into the same commit by `git add` because the tree state already reflects the removal.)

---

## Task 2: TDD — `decideMacArchFlag` helper

Pure function: given a Unity version string, return `'arm64'` or `'x86_64'` for the macOS Hub `--architecture` flag. Threshold is `>= 2021.2` (when Apple Silicon support shipped).

**Files:**
- Create: `src/verify.js`
- Create: `test/verify.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/verify.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { decideMacArchFlag } = require('../src/verify');

test('decideMacArchFlag: 2020.x is x86_64', () => {
    assert.equal(decideMacArchFlag('2020.3.48f1'), 'x86_64');
});

test('decideMacArchFlag: 2021.1 is x86_64 (before arm64 shipped)', () => {
    assert.equal(decideMacArchFlag('2021.1.28f1'), 'x86_64');
});

test('decideMacArchFlag: 2021.2 is arm64', () => {
    assert.equal(decideMacArchFlag('2021.2.0f1'), 'arm64');
});

test('decideMacArchFlag: 2022.3 is arm64', () => {
    assert.equal(decideMacArchFlag('2022.3.21f1'), 'arm64');
});

test('decideMacArchFlag: 2019.x is x86_64', () => {
    assert.equal(decideMacArchFlag('2019.4.40f1'), 'x86_64');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/verify'`.

- [ ] **Step 3: Implement `decideMacArchFlag` in `src/verify.js`**

Create `src/verify.js`:

```js
function decideMacArchFlag(unityVersion) {
    const [majorStr, minorStr] = unityVersion.split('.');
    const major = parseInt(majorStr, 10);
    const minor = parseInt(minorStr, 10);
    if (Number.isNaN(major) || Number.isNaN(minor)) {
        throw new Error(`Cannot parse Unity version: ${unityVersion}`);
    }
    if (major > 2021) return 'arm64';
    if (major === 2021 && minor >= 2) return 'arm64';
    return 'x86_64';
}

module.exports = { decideMacArchFlag };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 5 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/verify.js test/verify.test.js
git commit -m "feat(verify): add decideMacArchFlag with 2021.2 threshold"
```

---

## Task 3: TDD — `libsslPackageForUbuntu` helper

Given an Ubuntu version string (e.g. `"22.04"`), return the apt package name to install for libssl: `'libssl1.1'` for `<22.04`, `'libssl3'` otherwise.

**Files:**
- Modify: `src/verify.js`
- Modify: `test/verify.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/verify.test.js`:

```js
const { libsslPackageForUbuntu } = require('../src/verify');

test('libsslPackageForUbuntu: 20.04 → libssl1.1', () => {
    assert.equal(libsslPackageForUbuntu('20.04'), 'libssl1.1');
});

test('libsslPackageForUbuntu: 22.04 → libssl3', () => {
    assert.equal(libsslPackageForUbuntu('22.04'), 'libssl3');
});

test('libsslPackageForUbuntu: 24.04 → libssl3', () => {
    assert.equal(libsslPackageForUbuntu('24.04'), 'libssl3');
});

test('libsslPackageForUbuntu: 18.04 → libssl1.1', () => {
    assert.equal(libsslPackageForUbuntu('18.04'), 'libssl1.1');
});

test('libsslPackageForUbuntu: throws on unparseable input', () => {
    assert.throws(() => libsslPackageForUbuntu('garbage'), /Cannot parse Ubuntu version/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: 5 new failures — `libsslPackageForUbuntu is not a function`.

- [ ] **Step 3: Implement `libsslPackageForUbuntu` in `src/verify.js`**

Append to `src/verify.js` (and add to `module.exports`):

```js
function libsslPackageForUbuntu(versionString) {
    const [majorStr] = versionString.split('.');
    const major = parseInt(majorStr, 10);
    if (Number.isNaN(major)) {
        throw new Error(`Cannot parse Ubuntu version: ${versionString}`);
    }
    return major >= 22 ? 'libssl3' : 'libssl1.1';
}

module.exports = { decideMacArchFlag, libsslPackageForUbuntu };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all 10 pass.

- [ ] **Step 5: Commit**

```bash
git add src/verify.js test/verify.test.js
git commit -m "feat(verify): add libsslPackageForUbuntu (libssl3 on >=22.04)"
```

---

## Task 4: TDD — `isModuleInstallSuccessful` helper

Pure function: given Unity Hub `install-modules` stdout, return `true` if it indicates success.

**Files:**
- Modify: `src/verify.js`
- Modify: `test/verify.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/verify.test.js`:

```js
const { isModuleInstallSuccessful } = require('../src/verify');

test('isModuleInstallSuccessful: success message', () => {
    assert.equal(
        isModuleInstallSuccessful('Module windows-il2cpp installed successfully.'),
        true
    );
});

test("isModuleInstallSuccessful: already installed", () => {
    assert.equal(
        isModuleInstallSuccessful("Module windows-il2cpp it's already installed."),
        true
    );
});

test('isModuleInstallSuccessful: empty stdout', () => {
    assert.equal(isModuleInstallSuccessful(''), false);
});

test('isModuleInstallSuccessful: error stdout', () => {
    assert.equal(
        isModuleInstallSuccessful('Module install failed: network error'),
        false
    );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: 4 failures — `isModuleInstallSuccessful is not a function`.

- [ ] **Step 3: Implement `isModuleInstallSuccessful` in `src/verify.js`**

Append to `src/verify.js` (and update `module.exports`):

```js
function isModuleInstallSuccessful(stdout) {
    if (!stdout) return false;
    return stdout.includes('successfully') || stdout.includes("it's already installed");
}

module.exports = {
    decideMacArchFlag,
    libsslPackageForUbuntu,
    isModuleInstallSuccessful,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all 14 pass.

- [ ] **Step 5: Commit**

```bash
git add src/verify.js test/verify.test.js
git commit -m "feat(verify): add isModuleInstallSuccessful stdout heuristic"
```

---

## Task 5: TDD — `moduleVerificationPaths` helper

Given the platform, the playback-engines root directory (caller computes this from the editor binary path), and a module id, return an object describing what to check:

```ts
{ baseDir: string, mustExist: 'directory', variantContains?: string } | null
```

`null` means "no verification mapping for this module" (caller logs a warning and skips).

For modules with `variantContains`, the check is: `baseDir` exists AND it contains at least one entry whose name includes `variantContains`.

For modules without `variantContains`, the check is: `baseDir` exists.

**Files:**
- Modify: `src/verify.js`
- Modify: `test/verify.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/verify.test.js`:

```js
const { moduleVerificationPaths } = require('../src/verify');
const path = require('node:path');

test('moduleVerificationPaths: windows-il2cpp', () => {
    const result = moduleVerificationPaths('/pe', 'windows-il2cpp');
    assert.deepEqual(result, {
        baseDir: path.join('/pe', 'WindowsStandaloneSupport', 'Variations'),
        mustExist: 'directory',
        variantContains: 'il2cpp',
    });
});

test('moduleVerificationPaths: mac-il2cpp', () => {
    const result = moduleVerificationPaths('/pe', 'mac-il2cpp');
    assert.deepEqual(result, {
        baseDir: path.join('/pe', 'MacStandaloneSupport', 'Variations'),
        mustExist: 'directory',
        variantContains: 'il2cpp',
    });
});

test('moduleVerificationPaths: linux-il2cpp', () => {
    const result = moduleVerificationPaths('/pe', 'linux-il2cpp');
    assert.deepEqual(result, {
        baseDir: path.join('/pe', 'LinuxStandaloneSupport', 'Variations'),
        mustExist: 'directory',
        variantContains: 'il2cpp',
    });
});

test('moduleVerificationPaths: android (no variant)', () => {
    const result = moduleVerificationPaths('/pe', 'android');
    assert.deepEqual(result, {
        baseDir: path.join('/pe', 'AndroidPlayer'),
        mustExist: 'directory',
    });
});

test('moduleVerificationPaths: ios', () => {
    const result = moduleVerificationPaths('/pe', 'ios');
    assert.deepEqual(result, {
        baseDir: path.join('/pe', 'iOSSupport'),
        mustExist: 'directory',
    });
});

test('moduleVerificationPaths: webgl', () => {
    const result = moduleVerificationPaths('/pe', 'webgl');
    assert.deepEqual(result, {
        baseDir: path.join('/pe', 'WebGLSupport'),
        mustExist: 'directory',
    });
});

test('moduleVerificationPaths: unknown module returns null', () => {
    assert.equal(moduleVerificationPaths('/pe', 'made-up-module'), null);
});

test('moduleVerificationPaths: case-insensitive', () => {
    const lower = moduleVerificationPaths('/pe', 'android');
    const upper = moduleVerificationPaths('/pe', 'Android');
    assert.deepEqual(upper, lower);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: 8 failures — `moduleVerificationPaths is not a function`.

- [ ] **Step 3: Implement `moduleVerificationPaths` in `src/verify.js`**

Append to `src/verify.js` (and update `module.exports`):

```js
const path = require('node:path');

const MODULE_MARKERS = {
    'windows-il2cpp': { subdir: ['WindowsStandaloneSupport', 'Variations'], variantContains: 'il2cpp' },
    'windows-mono':   { subdir: ['WindowsStandaloneSupport', 'Variations'], variantContains: 'mono' },
    'mac-il2cpp':     { subdir: ['MacStandaloneSupport', 'Variations'],     variantContains: 'il2cpp' },
    'mac-mono':       { subdir: ['MacStandaloneSupport', 'Variations'],     variantContains: 'mono' },
    'linux-il2cpp':   { subdir: ['LinuxStandaloneSupport', 'Variations'],   variantContains: 'il2cpp' },
    'linux-mono':     { subdir: ['LinuxStandaloneSupport', 'Variations'],   variantContains: 'mono' },
    'android':        { subdir: ['AndroidPlayer'] },
    'ios':            { subdir: ['iOSSupport'] },
    'appletv':        { subdir: ['AppleTVSupport'] },
    'webgl':          { subdir: ['WebGLSupport'] },
};

function moduleVerificationPaths(playbackEnginesRoot, moduleId) {
    const marker = MODULE_MARKERS[moduleId.toLowerCase()];
    if (!marker) return null;
    const baseDir = path.join(playbackEnginesRoot, ...marker.subdir);
    return marker.variantContains
        ? { baseDir, mustExist: 'directory', variantContains: marker.variantContains }
        : { baseDir, mustExist: 'directory' };
}

module.exports = {
    decideMacArchFlag,
    libsslPackageForUbuntu,
    isModuleInstallSuccessful,
    moduleVerificationPaths,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all 22 pass.

- [ ] **Step 5: Commit**

```bash
git add src/verify.js test/verify.test.js
git commit -m "feat(verify): add moduleVerificationPaths"
```

---

## Task 6: Implement main entry `src/index.js`

The orchestration layer. No unit tests — mostly subprocess I/O; smoke workflow covers it.

**Files:**
- Create: `src/index.js`
- Delete: `src/setup.js`

- [ ] **Step 1: Write `src/index.js`**

Create `src/index.js`:

```js
const core = require('@actions/core');
const exec = require('@actions/exec');
const tc = require('@actions/tool-cache');
const fs = require('node:fs');
const path = require('node:path');
const {
    decideMacArchFlag,
    libsslPackageForUbuntu,
    isModuleInstallSuccessful,
    moduleVerificationPaths,
} = require('./verify');

async function run() {
    try {
        const unityVersion = core.getInput('unity-version', { required: true });
        const unityVersionChangeset = core.getInput('unity-version-changeset', { required: true });
        const unityModules = core.getInput('unity-modules')
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean);

        const hubPath = await installUnityHub();
        const unityPath = await installUnityEditor(hubPath, unityVersion, unityVersionChangeset);
        if (unityModules.length > 0) {
            await installUnityModules(hubPath, unityVersion, unityModules);
        }
        await postInstall();
        await verifyInstall(unityPath, unityModules);

        core.setOutput('unity-version', unityVersion);
        core.setOutput('unity-path', unityPath);
        core.exportVariable('UNITY_PATH', unityPath);
    } catch (err) {
        core.setFailed(err.message);
    }
}

async function installUnityHub() {
    if (process.platform === 'linux')  return await installHubLinux();
    if (process.platform === 'darwin') return await installHubMac();
    if (process.platform === 'win32')  return await installHubWindows();
    throw new Error(`Unsupported platform: ${process.platform}`);
}

async function installHubLinux() {
    const home = process.env.HOME;
    const hubPath = `${home}/Unity Hub/UnityHub.AppImage`;
    if (fs.existsSync(hubPath)) return hubPath;

    const installer = await tc.downloadTool('https://public-cdn.cloud.unity3d.com/hub/prod/UnityHub.AppImage');
    fs.mkdirSync(`${home}/Unity Hub`, { recursive: true });
    fs.mkdirSync(`${home}/.config/Unity Hub`, { recursive: true });
    // Use `mv` rather than fs.renameSync — installer and $HOME may be on different filesystems (EXDEV).
    await exec.exec('mv', [installer, hubPath]);
    fs.chmodSync(hubPath, 0o755);
    fs.writeFileSync(`${home}/.config/Unity Hub/eulaAccepted`, '');

    const ubuntuVersion = await readUbuntuVersion();
    const libsslPkg = libsslPackageForUbuntu(ubuntuVersion);
    await execSudo('apt-get', ['update']);
    await execSudo('apt-get', [
        'install', '-y',
        'libgconf-2-4', 'libglu1', 'libasound2',
        'libgtk2.0-0', 'libgtk-3-0', 'libnss3',
        'zenity', 'xvfb', 'libfuse2',
        libsslPkg,
    ]);

    return hubPath;
}

async function installHubMac() {
    const hubPath = '/Applications/Unity Hub.app/Contents/MacOS/Unity Hub';
    if (fs.existsSync(hubPath)) return hubPath;

    const installer = await tc.downloadTool('https://public-cdn.cloud.unity3d.com/hub/prod/UnityHubSetup.dmg');
    await execSudo('hdiutil', ['mount', installer]);
    const volumes = await captureStdout('ls', ['/Volumes']);
    const match = volumes.match(/Unity Hub.*/);
    if (!match) throw new Error('Unity Hub volume not found after mount');
    const volume = match[0];
    await exec.exec('ditto', [`/Volumes/${volume}/Unity Hub.app`, '/Applications/Unity Hub.app']);
    await execSudo('hdiutil', ['detach', `/Volumes/${volume}`]);
    fs.unlinkSync(installer);

    return hubPath;
}

async function installHubWindows() {
    const hubPath = 'C:/Program Files/Unity Hub/Unity Hub.exe';
    if (fs.existsSync(hubPath)) return hubPath;

    const installer = await tc.downloadTool('https://public-cdn.cloud.unity3d.com/hub/prod/UnityHubSetup.exe');
    await exec.exec(installer, ['/s']);
    fs.unlinkSync(installer);

    return hubPath;
}

async function installUnityEditor(hubPath, version, changeset) {
    let unityPath = await findUnity(hubPath, version);
    if (unityPath) return unityPath;

    const args = ['install', '--version', version, '--changeset', changeset];
    if (process.platform === 'darwin') {
        args.push('--architecture', decideMacArchFlag(version));
    }

    await runHub(hubPath, args);

    unityPath = await findUnity(hubPath, version);
    if (!unityPath) throw new Error('Unity editor installation failed (not found after install)');
    return unityPath;
}

async function installUnityModules(hubPath, version, modules) {
    const args = ['install-modules', '--version', version];
    for (const m of modules) {
        args.push('--module', m.toLowerCase());
    }
    args.push('--childModules');

    const stdout = await runHub(hubPath, args);
    if (!isModuleInstallSuccessful(stdout)) {
        throw new Error(`Unity modules installation failed.\nHub stdout:\n${stdout}`);
    }
}

async function postInstall() {
    if (process.platform !== 'darwin') return;
    await execSudo('mkdir', ['-p', '/Library/Application Support/Unity']);
    await execSudo('chown', ['-R', process.env.USER, '/Library/Application Support/Unity']);
}

async function findUnity(hubPath, version) {
    const stdout = await runHub(hubPath, ['editors', '--installed']);
    const match = stdout.match(new RegExp(`${escapeRegex(version)}.*? installed at (.+)`));
    if (!match) return '';
    let p = match[1].trim();
    if (process.platform === 'darwin') p += '/Contents/MacOS/Unity';
    return p;
}

async function verifyInstall(unityPath, modules) {
    if (!fs.existsSync(unityPath)) {
        throw new Error(`Verification failed: Unity binary missing at ${unityPath}`);
    }

    const playbackRoot = playbackEnginesRoot(unityPath);
    const unverified = [];
    for (const m of modules) {
        const spec = moduleVerificationPaths(playbackRoot, m);
        if (!spec) {
            core.warning(`No on-disk verification map for module '${m}'; skipping (install reported success).`);
            unverified.push(m);
            continue;
        }
        if (!fs.existsSync(spec.baseDir)) {
            throw new Error(`Module '${m}' verification failed: ${spec.baseDir} does not exist`);
        }
        if (spec.variantContains) {
            const entries = fs.readdirSync(spec.baseDir);
            const ok = entries.some(name => name.includes(spec.variantContains));
            if (!ok) {
                throw new Error(
                    `Module '${m}' verification failed: no entry in ${spec.baseDir} contains '${spec.variantContains}'. ` +
                    `Entries: ${entries.join(', ')}`
                );
            }
        }
    }

    await smokeLaunchEditor(unityPath);
}

function playbackEnginesRoot(unityPath) {
    if (process.platform === 'darwin') {
        // unityPath: <root>/Unity.app/Contents/MacOS/Unity → engines at <root>/Unity.app/Contents/PlaybackEngines
        return path.join(path.dirname(path.dirname(unityPath)), 'PlaybackEngines');
    }
    // Windows + Linux: <root>/Editor/Unity{.exe} → engines at <root>/Editor/Data/PlaybackEngines
    return path.join(path.dirname(unityPath), 'Data', 'PlaybackEngines');
}

async function smokeLaunchEditor(unityPath) {
    const code = await exec.exec(unityPath, [
        '-batchmode', '-nographics', '-quit',
        '-logFile', '-',
    ], { ignoreReturnCode: true, silent: false });
    if (code !== 0) {
        throw new Error(`Unity smoke launch failed (exit ${code}). Editor at ${unityPath} is not runnable.`);
    }
}

async function runHub(hubPath, args) {
    if (process.platform === 'linux') {
        // xvfb-run wrapping; quote hub path; redirect stderr → stdout via process substitution
        const cmd = `xvfb-run --auto-servernum -e >(cat >&1) "${hubPath}" --disable-gpu-sandbox --headless ${args.map(quote).join(' ')}`;
        return await captureStdoutShell(cmd);
    }
    // macOS + Windows: hubPath -- --headless <args>; Hub on Windows always exits 1 on success
    return await captureStdout(hubPath, ['--', '--headless', ...args], { ignoreReturnCode: true });
}

async function readUbuntuVersion() {
    return (await captureStdout('lsb_release', ['-rs'])).trim();
}

async function captureStdout(command, args, options = {}) {
    let stdout = '';
    await exec.exec(command, args, {
        ignoreReturnCode: options.ignoreReturnCode === true,
        listeners: { stdout: b => stdout += b.toString() },
    });
    return stdout;
}

async function captureStdoutShell(commandLine) {
    let stdout = '';
    await exec.exec('bash', ['-c', commandLine], {
        ignoreReturnCode: true,
        listeners: { stdout: b => stdout += b.toString() },
    });
    return stdout;
}

async function execSudo(command, args) {
    await exec.exec('sudo', [command, ...args]);
}

function quote(s) {
    return /[\s"'$`\\]/.test(s) ? `"${s.replace(/(["\\$`])/g, '\\$1')}"` : s;
}

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

run();
```

- [ ] **Step 2: Delete the old entry file**

Run:
```bash
git rm src/setup.js
```

- [ ] **Step 3: Lint by parsing with Node**

Run:
```bash
node --check src/index.js
node --check src/verify.js
```

Expected: no output (parse OK).

- [ ] **Step 4: Run unit tests**

Run: `npm test`
Expected: all 22 pass (verify.js unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/index.js
git commit -m "feat: rewrite entry as src/index.js with verification step"
```

---

## Task 7: Update `action.yml`

**Files:**
- Modify: `action.yml`

- [ ] **Step 1: Replace contents of `action.yml`**

```yaml
name: Setup Unity
description: Install Unity Editor on Linux, macOS, or Windows.
inputs:
  unity-version:
    description: Unity version to install (e.g. 2022.3.21f1).
    required: true
  unity-version-changeset:
    description: Unity version changeset (e.g. f9bb1bcc7635).
    required: true
  unity-modules:
    description: |
      Newline-separated list of Unity modules to install (e.g. windows-il2cpp).
      Child modules are always included.
    required: false
    default: ''
outputs:
  unity-version:
    description: The installed Unity version.
  unity-path:
    description: Absolute path to the Unity Editor binary. Also exported as $UNITY_PATH.
runs:
  using: node24
  main: dist/index.js
branding:
  icon: download
  color: gray-dark
```

- [ ] **Step 2: Commit**

```bash
git add action.yml
git commit -m "feat: narrow action contract to version+changeset+modules"
```

---

## Task 8: Build and commit `dist/index.js`

**Files:**
- Create: `dist/index.js`
- Create: `dist/licenses.txt` (generated by ncc)

- [ ] **Step 1: Run the bundler**

Run:
```bash
npm run build
```

Expected: writes `dist/index.js` and `dist/licenses.txt`. No errors.

- [ ] **Step 2: Verify the bundle parses**

Run:
```bash
node --check dist/index.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add dist/
git commit -m "build: add ncc dist bundle"
```

---

## Task 9: Remove old test workflows

**Files:**
- Delete: `.github/workflows/test-ubuntu.yml`
- Delete: `.github/workflows/test-macos.yml`
- Delete: `.github/workflows/test-windows.yml`

- [ ] **Step 1: Delete the three workflows**

Run:
```bash
git rm .github/workflows/test-ubuntu.yml .github/workflows/test-macos.yml .github/workflows/test-windows.yml
```

- [ ] **Step 2: Commit**

```bash
git commit -m "chore: remove upstream test matrix workflows"
```

---

## Task 10: Add `ci.yml`

Unit tests + dist-in-sync check on every push and PR.

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: ci
on:
  push:
    branches: [master]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: npm
      - run: npm ci
      - run: node --check src/index.js src/verify.js
      - run: npm test
      - run: npm run build
      - name: Verify dist/ is in sync
        run: |
          if ! git diff --quiet dist/; then
            echo "dist/ is out of date. Run 'npm run build' and commit the result."
            git diff dist/
            exit 1
          fi
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add unit test and dist-in-sync check"
```

---

## Task 11: Add `smoke.yml`

Per-OS install + IL2CPP module check. Runs on push to master and via manual dispatch.

Choose a Unity version to pin (one recent LTS that has both Windows and macOS arm64 builds). Use `2022.3.21f1` with changeset `f9bb1bcc7635` as the default; if the agent doesn't have that combination handy, look up a current LTS `(version, changeset)` pair from `ProjectVersion.txt` of any modern Unity project.

**Files:**
- Create: `.github/workflows/smoke.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/smoke.yml`:

```yaml
name: smoke
on:
  workflow_dispatch:
  push:
    branches: [master]
jobs:
  install:
    runs-on: ${{ matrix.os }}
    timeout-minutes: 60
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: ubuntu-22.04
            unity-modules: linux-il2cpp
          - os: macos-latest
            unity-modules: mac-il2cpp
          - os: windows-latest
            unity-modules: windows-il2cpp
    steps:
      - uses: actions/checkout@v4
      - id: setup-unity
        uses: ./
        with:
          unity-version: 2022.3.21f1
          unity-version-changeset: f9bb1bcc7635
          unity-modules: ${{ matrix.unity-modules }}
      - name: Assert outputs
        shell: bash
        run: |
          set -euo pipefail
          test -n "${{ steps.setup-unity.outputs.unity-path }}"
          test -e "${{ steps.setup-unity.outputs.unity-path }}"
          test "${{ steps.setup-unity.outputs.unity-version }}" = "2022.3.21f1"
          test -n "$UNITY_PATH"
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/smoke.yml
git commit -m "ci: add per-OS smoke test with IL2CPP module"
```

---

## Task 12: Rewrite `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace contents of `README.md`**

```markdown
# setup-unity

GitHub Action that installs a specific Unity Editor version (and optional modules) on Linux, macOS, and Windows runners.

This action is maintained for the [Sentry Unity SDK](https://github.com/getsentry/sentry-unity)'s CI. It deliberately exposes a small, fixed contract — no auto-discovery, no web scraping. The caller passes the exact Unity version and changeset.

## Usage

```yaml
- uses: actions/checkout@v4
- uses: getsentry/setup-unity@v2
  with:
    unity-version: 2022.3.21f1
    unity-version-changeset: f9bb1bcc7635
    unity-modules: |
      windows-il2cpp
- run: echo "Unity is at $UNITY_PATH"
```

## Inputs

| Input | Required | Description |
|---|---|---|
| `unity-version` | yes | Unity version, e.g. `2022.3.21f1`. |
| `unity-version-changeset` | yes | Unity changeset, e.g. `f9bb1bcc7635`. Find it in `ProjectSettings/ProjectVersion.txt` (`m_EditorVersionWithRevision`). |
| `unity-modules` | no | Newline-separated module ids (e.g. `windows-il2cpp`). Child modules are always included. |

## Outputs

| Output | Description |
|---|---|
| `unity-version` | Echoed input. |
| `unity-path` | Absolute path to the Unity Editor binary. Also exported as `$UNITY_PATH`. |

## Verification

After install, the action checks:

1. The Unity Hub `install-modules` stdout reports success.
2. Each requested module's expected directory exists on disk (with the right variant for IL2CPP/Mono).
3. The Unity Editor binary launches in batchmode and exits cleanly.

If any step fails, the action fails with an actionable message.

## Supported runners

`ubuntu-22.04`, `ubuntu-24.04`, `macos-latest`, `windows-latest`. Self-hosted runners are not supported.

## Development

```bash
npm install
npm test          # unit tests for src/verify.js
npm run build     # rebuild dist/index.js — required before committing
```

CI verifies `dist/` is in sync.

## License

MIT. Originally derived from [kuler90/setup-unity](https://github.com/kuler90/setup-unity); see `LICENSE` for full attribution.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for the new contract"
```

---

## Task 13: Update `LICENSE`

Preserve the original copyright (Roman Kulesha, MIT) and add Sentry's.

**Files:**
- Modify: `LICENSE`

- [ ] **Step 1: Replace contents of `LICENSE`**

```
MIT License

Copyright (c) 2020 Roman Kulesha
Copyright (c) 2026 Functional Software, Inc. dba Sentry

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Commit**

```bash
git add LICENSE
git commit -m "docs: add Sentry copyright alongside original"
```

---

## Task 14: Final local verification

A consolidated check before pushing.

- [ ] **Step 1: Confirm clean tree**

Run:
```bash
git status
```

Expected: nothing to commit, working tree clean.

- [ ] **Step 2: Confirm tests pass**

Run:
```bash
npm test
```

Expected: 22 pass, 0 fail.

- [ ] **Step 3: Confirm dist is in sync**

Run:
```bash
npm run build && git diff --exit-code dist/
```

Expected: exit 0, no diff.

- [ ] **Step 4: Confirm `node_modules` is not tracked**

Run:
```bash
git ls-files node_modules | head
```

Expected: empty output.

- [ ] **Step 5: Confirm upstream remote is gone (local-only cleanup)**

Run:
```bash
git remote remove upstream || true
git remote -v
```

Expected: only `origin` remains.

- [ ] **Step 6: Drop the local `master` branch's link to upstream merges (no command, just confirm)**

Inspect:
```bash
git log --oneline -5
```

Expected: latest commits are the strip-down work; master no longer needs to be rebased on upstream.

---

## Out of scope (do not do as part of this plan)

- Tagging a `v2` release.
- Updating `getsentry/sentry-unity`'s `test-build-windows.yml` to pass `unity-version-changeset` — that's a follow-up PR in the consumer repo, after this plan is merged and tagged.
- Adding caching for Unity installs across runs.
