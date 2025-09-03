const fs = require("fs");
const path = require("path");

// Vorhanden:
const HTML_REGEX = /['"`]([a-zA-Z0-9_.]+)['"`]\s*\|\s*translate/g;
const TS_REGEX = /['"`]([a-zA-Z0-9_.]+)['"`]/g;

// NEU: Hilfs-Regex/Heuristiken
const INTERPOLATION_ONLY = /^\s*(\{\{[^}]+\}\}|\*ngIf=|@if\()|^\s*$/;
const LOOKS_LIKE_KEY = /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+$/;
const DEFAULT_ATTRS = [
  "placeholder",
  "title",
  "alt",
  "aria-label",
  "aria-placeholder",
  "label",
  "matTooltip",
  "mat-placeholder",
  "mat-label",
];

function lineHasIgnore(lines, lineNumber) {
  return (
    lineNumber > 0 &&
    (lines[lineNumber - 1].includes("// ignore translations") ||
      lines[lineNumber - 1].includes("//§ignore translations"))
  );
}

function passesHardcodedHeuristics(text, cfg) {
  if (!text) return false;
  const t = text.trim();
  if (!t) return false;
  if (LOOKS_LIKE_KEY.test(t)) return false; // i18n-Key-Form
  if (t.length < (cfg.minChars || 4)) return false;
  if (t.split(/\s+/).filter(Boolean).length < (cfg.minWords || 2)) return false;
  if (cfg.whitelistLiterals && cfg.whitelistLiterals.includes(t)) return false;

  const ignoreREs = (cfg.ignorePatterns || []).map((p) => new RegExp(p));
  if (ignoreREs.some((re) => re.test(t))) return false;

  return true;
}

/**
 * Findet hardcodierten Text in HTML-Textknoten & -Attributen
 */
function getHardcodedInHtml(fullPath, content, cfg, projectRoot, results) {
  const lines = content.split("\n");
  const attrs =
    cfg.htmlAttributes && cfg.htmlAttributes.length
      ? cfg.htmlAttributes
      : DEFAULT_ATTRS;

  lines.forEach((line, lineNumber) => {
    if (lineHasIgnore(lines, lineNumber)) return;

    // 1) Textknoten zwischen >...< (sehr einfache Heuristik)
    //    - Ignoriert leere/Whitespace und reine Interpolationen
    const textNodeRegex = />\s*([^<]+?)\s*</g;
    let m;
    while ((m = textNodeRegex.exec(line)) !== null) {
      const raw = m[1].trim();
      if (!raw || INTERPOLATION_ONLY.test(raw)) continue;
      // Falls Pipe|translate auf derselben Zeile vorkommt, nicht melden
      if (/\|\s*translate\b/.test(line)) continue;

      if (passesHardcodedHeuristics(raw, cfg)) {
        const rel = path.relative(projectRoot, fullPath);
        const where = `${rel}:${lineNumber + 1}`;
        results.push({ type: "html-text", text: raw, where });
      }
    }

    // 2) Attributwerte: attr="..."; attr='...'
    const attrRegex = new RegExp(
      `\\b(?:${attrs
        .map((a) => a.replace(/[-[\]/{}()*+?.\\^$|]/g, "\\$&"))
        .join("|")})\\s*=\\s*("([^"]+)"|'([^']+)')`,
      "g"
    );
    let a;
    while ((a = attrRegex.exec(line)) !== null) {
      const raw = (a[2] ?? a[3] ?? "").trim();
      if (!raw || /\|\s*translate\b/.test(line)) continue;
      if (passesHardcodedHeuristics(raw, cfg)) {
        const rel = path.relative(projectRoot, fullPath);
        const where = `${rel}:${lineNumber + 1}`;
        results.push({ type: "html-attr", text: raw, where });
      }
    }
  });
}

/**
 * Findet hardcodierte Strings in .ts-Dateien, die nicht wie i18n-Keys aussehen
 * und nicht direkt via translate.instant/get(...) gezogen werden.
 */

function getUsedTranslationKeys(
  dir,
  projectRoot = process.cwd(),
  keysToFiles = new Map()
) {
  const files = fs.readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(dir, file.name);

    if (file.isDirectory()) {
      getUsedTranslationKeys(fullPath, projectRoot, keysToFiles);
    } else if (file.name.endsWith(".html") || file.name.endsWith(".ts")) {
      const content = fs.readFileSync(fullPath, "utf-8");
      const regex = file.name.endsWith(".html") ? HTML_REGEX : TS_REGEX;
      const lines = content.split("\n");

      lines.forEach((line, lineNumber) => {
        let match;
        regex.lastIndex = 0;
        while ((match = regex.exec(line)) !== null) {
          const key = match[1];
          if (key.includes(".")) {
            const prevLineHasIgnore =
              lineNumber > 0 &&
              (lines[lineNumber - 1].includes("// ignore translations") ||
                lines[lineNumber - 1].includes("//§ignore translations"));
            if (!prevLineHasIgnore) {
              if (!keysToFiles.has(key)) keysToFiles.set(key, new Set());
              const relativePath = path.relative(projectRoot, fullPath);
              const lineInfo = `${relativePath}:${lineNumber + 1}`;
              keysToFiles.get(key).add(lineInfo);
            }
          }
        }
      });
    }
  }

  return keysToFiles;
}

/**
 * NEU: Sammle hartcodierten Text in src
 * Rückgabe: Array von Findings { type, text, where }
 */
function getHardcodedTexts(
  dir,
  configHardcoded = {},
  projectRoot = process.cwd(),
  findings = []
) {
  const files = fs.readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      getHardcodedTexts(fullPath, configHardcoded, projectRoot, findings);
    } else if (file.name.endsWith(".html") || file.name.endsWith(".ts")) {
      const content = fs.readFileSync(fullPath, "utf-8");
      if (file.name.endsWith(".html")) {
        getHardcodedInHtml(
          fullPath,
          content,
          configHardcoded,
          projectRoot,
          findings
        );
      }
    }
  }
  return findings;
}

function flatten(obj, prefix = "") {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null) {
      Object.assign(acc, flatten(value, fullKey));
    } else {
      acc[fullKey] = value;
    }
    return acc;
  }, {});
}

function unflatten(flatObj) {
  const result = {};
  for (const [key, value] of Object.entries(flatObj)) {
    const parts = key.split(".");
    let curr = result;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        curr[part] = value;
      } else {
        if (!Object.prototype.hasOwnProperty.call(curr, part) || typeof curr[part] !== "object" || curr[part] === null) {
          curr[part] = {};
        }
        curr = curr[part];
      }
    }
  }
  return result;
}

function getAllTranslationKeys(filePath) {
  const json = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return Object.keys(flatten(json));
}

module.exports = {
  getUsedTranslationKeys,
  getAllTranslationKeys,
  flatten,
  unflatten,
  getHardcodedTexts, // NEU
};
