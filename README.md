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
