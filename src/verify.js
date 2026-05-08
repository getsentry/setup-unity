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
