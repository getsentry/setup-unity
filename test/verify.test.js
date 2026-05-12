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

test('libsslPackageForUbuntu: 20.04 → libssl1.1', () => {
    assert.equal(libsslPackageForUbuntu('20.04'), 'libssl1.1');
});

test('libsslPackageForUbuntu: 22.04 → libssl3', () => {
    assert.equal(libsslPackageForUbuntu('22.04'), 'libssl3');
});

test('libsslPackageForUbuntu: 24.04 → libssl3', () => {
    assert.equal(libsslPackageForUbuntu('24.04'), 'libssl3');
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

test('moduleVerificationPaths: with variant', () => {
    assert.deepEqual(moduleVerificationPaths('/pe', 'windows-il2cpp'), {
        baseDir: path.join('/pe', 'WindowsStandaloneSupport', 'Variations'),
        variantContains: 'il2cpp',
    });
});

test('moduleVerificationPaths: no variant', () => {
    assert.deepEqual(moduleVerificationPaths('/pe', 'android'), {
        baseDir: path.join('/pe', 'AndroidPlayer'),
    });
});

test('moduleVerificationPaths: unknown module returns null', () => {
    assert.equal(moduleVerificationPaths('/pe', 'made-up-module'), null);
});

test('moduleVerificationPaths: case-insensitive', () => {
    assert.deepEqual(
        moduleVerificationPaths('/pe', 'Android'),
        moduleVerificationPaths('/pe', 'android'),
    );
});
