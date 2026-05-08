const test = require('node:test');
const assert = require('node:assert/strict');
const { decideMacArchFlag, libsslPackageForUbuntu } = require('../src/verify');

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
