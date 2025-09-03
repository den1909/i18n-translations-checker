# i18n-translations-checker

Fast checks for i18n translation keys in Angular apps. Validates used keys against a reference file, compares locales, detects hardcoded text, and can auto-fix or auto-translate gaps.

## Highlights

- Validate used keys exist in the reference JSON
- Compare all locales against the reference to find missing/extra keys
- Auto-fix extras and add missing keys (optionally seed from reference)
- Optional DeepL integration to translate missing/empty values
- Detect hardcoded text in HTML templates
- JSON output for CI pipelines

## Quickstart

- Install: `npm i -D i18n-translations-checker`
- Init config: `i18n-check --init`
- Run checks: `i18n-check`

Examples:

- Fix extras only: `i18n-check --fix-extras`
- Add missing keys with empty values: `i18n-check --add-missing`
- Seed missing from reference: `i18n-check --add-missing --seed-missing`
- Translate missing values via DeepL: `i18n-check --translate-missing`
- Translate existing empty values: `i18n-check --translate-empty`
- CI-friendly JSON: `i18n-check --json`
 - Prune unused keys across all locales: `i18n-check --prune-unused`

## CLI Options

- Core checks: runs by default; exits non‑zero on issues
- Fixes: `--fix-extras` (or legacy `--fix`), `--add-missing`, `--seed-missing`
- Translation: `--translate-missing`, `--translate-empty`
- Output/control: `--json`, `--no-hardcoded`, `--no-unused`, `--init`
 - Maintenance: `--prune-unused`

## DeepL Setup

- Enable in config: set `deepl.enabled: true` and `deepl.apiKey`
- Free vs Pro: set `deepl.useFreeApi` accordingly
- Language mapping: set `deepl.targetLangMap` (e.g. `{ "de.json": "DE" }`). If absent, the tool infers from the filename (e.g. `fr.json` → `FR`).
- Source language: `deepl.sourceLang` (falls back to reference filename)
- Optional tuning: `formality`, `preserveFormatting`, `splitSentences`, `timeoutMs`
- You can also supply `DEEPL_API_KEY` via environment; config takes precedence

## Configuration

Create `i18n-check.config.json` (or run `i18n-check --init`).

```
{
  "srcPath": "./src",
  "i18nPath": "./public/i18n",
  "referenceLang": "en.json",
  "deepl": {
    "enabled": false,
    "apiKey": "<your key>",
    "useFreeApi": true,
    "sourceLang": "EN",
    "targetLangMap": { "de.json": "DE", "fr.json": "FR" },
    "formality": "default",
    "preserveFormatting": true,
    "splitSentences": "1",
    "timeoutMs": 15000
  },
  "hardcoded": {
    "enabled": true,
    "minChars": 4,
    "minWords": 2,
    "htmlAttributes": ["placeholder", "title", "alt", "aria-label"],
    "ignorePatterns": ["^(https?:)?//", "^[\\w.-]+@[\\w.-]+\\.[A-Za-z]{2,}$"],
    "whitelistLiterals": ["OK", "Yes", "No"]
  }
}
```

## JSON Output

Emit a machine‑readable report:

```
i18n-check --json > report.json
```

The report includes summary counts, per‑locale diffs, missing used keys with locations, hardcoded findings, and unused keys.

## CI Usage

- Add a script: `"i18n:check": "i18n-check --json"`
- Fail build on issues: run the script in your pipeline and inspect the exit code
- Optional pre‑fix: run with `--fix-extras`, `--add-missing`, or translation flags before `--json`

## Contributing

Contributions welcome! Open issues and PRs at:

https://github.com/den1909/i18n-translations-checker

## License

MIT
