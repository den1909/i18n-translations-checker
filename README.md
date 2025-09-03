# i18n-translations-checker

Checks used translation keys in Angular projects against reference language JSONs. Also detects hardcoded text in templates, compares locales, and can auto-fix some issues.

## Features

- Verify used keys exist in reference JSON
- Compare all locales with reference and report missing/extra keys
- Auto-fix: remove extra keys (`--fix-extras` or legacy `--fix`)
- Auto-fix: add missing keys with empty strings (`--add-missing`)
- Optional: seed missing keys with reference values (`--seed-missing`)
- Report hardcoded text in HTML templates
- Report unused keys in the reference file
- JSON output for CI pipelines (`--json`)

## Install

```
npm i -D i18n-translations-checker
```

## Usage

```
i18n-check [options]
```

Common options:

- `--init`: create `i18n-check.config.json` in the project root
- `--fix-extras` or `--fix`: remove extra keys in non-reference locales
- `--add-missing`: add missing keys to non-reference locales as empty strings
- `--seed-missing`: when used with `--add-missing`, seed values from reference
- `--no-hardcoded`: skip hardcoded text scan
- `--no-unused`: skip unused-keys report
- `--json`: emit a machine-readable JSON report and exit with non-zero on issues

## Configuration

Create `i18n-check.config.json` or run `i18n-check --init`.

```
{
  "srcPath": "./src",
  "i18nPath": "./public/i18n",
  "referenceLang": "en.json",
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

## Notes

- JSON fixes preserve the original nested structure.
- Only `.html` and `.ts` under `srcPath` are scanned.
- For HTML, hardcoded checks use simple heuristics; tune via `hardcoded` config.

