const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
    decideMacArchFlag,
    libsslPackageForUbuntu,
    isModuleInstallSuccessful,
    moduleVerificationPaths,
} = require('../src/verify');

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
