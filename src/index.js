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
    // `mv` handles cross-filesystem moves; fs.renameSync would fail with EXDEV.
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
    const volume = (await captureStdout('ls', ['/Volumes'])).match(/Unity Hub.*/)[0];
    await exec.exec('ditto', [`/Volumes/${volume}/Unity Hub.app`, '/Applications/Unity Hub.app']);
    await execSudo('hdiutil', ['detach', `/Volumes/${volume}`]);
    fs.unlinkSync(installer);

    return hubPath;
}

async function installHubWindows() {
    const hubPath = 'C:/Program Files/Unity Hub/Unity Hub.exe';
    if (fs.existsSync(hubPath)) return hubPath;

    const installer = await tc.downloadTool('https://public-cdn.cloud.unity3d.com/hub/prod/UnityHubSetup.exe');
    await exec.exec(`"${installer}"`, ['/s']);
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
    for (const m of modules) {
        const spec = moduleVerificationPaths(playbackRoot, m);
        if (!spec) {
            core.warning(`No on-disk verification map for module '${m}'; skipping (install reported success).`);
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
}

function playbackEnginesRoot(unityPath) {
    if (process.platform === 'darwin') {
        return path.join(path.dirname(path.dirname(unityPath)), 'PlaybackEngines');
    }
    return path.join(path.dirname(unityPath), 'Data', 'PlaybackEngines');
}

async function runHub(hubPath, args) {
    if (process.platform === 'linux') {
        const cmd = `xvfb-run --auto-servernum -e >(cat >&1) "${hubPath}" --disable-gpu-sandbox --headless ${args.map(quote).join(' ')}`;
        return await captureStdoutShell(cmd);
    }
    // Hub on Windows exits 1 on success. Quote hubPath so exec.exec doesn't split on spaces.
    return await captureStdout(`"${hubPath}"`, ['--', '--headless', ...args], { ignoreReturnCode: true });
}

async function readUbuntuVersion() {
    return (await captureStdout('lsb_release', ['-rs'])).trim();
}

async function captureStdout(command, args, options = {}) {
    let stdout = '';
    await exec.exec(command, args, {
        ignoreReturnCode: options.ignoreReturnCode,
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
