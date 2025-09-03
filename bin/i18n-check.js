#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { loadConfig } = require("../lib/config");
const {
  checkUsedKeysInReference,
  compareTranslations,
  computeLocaleDiffs,
  reportUnusedReferenceKeys,
  buildJsonReport,
  reportHardcodedText,
} = require("../lib/check");
const {
  getUsedTranslationKeys,
  getAllTranslationKeys,
  getHardcodedTexts,
} = require("../lib/scan");

const args = process.argv.slice(2);

if (args.includes("--init")) {
  const configPath = path.resolve(process.cwd(), "i18n-check.config.json");

  if (fs.existsSync(configPath)) {
    console.log("ℹ️ i18n-check.config.json already exists. Skipping.");
    process.exit(0);
  }

  const defaultConfig = {
    srcPath: "./src",
    i18nPath: "./public/i18n",
    referenceLang: "en.json",
    deepl: {
      enabled: false,
      apiKey: "",
      useFreeApi: true,
      sourceLang: "EN",
      targetLangMap: {
        "de.json": "DE",
        "fr.json": "FR",
      },
      formality: "default",
      preserveFormatting: true,
      splitSentences: "1",
      timeoutMs: 15000,
    },
    hardcoded: { enabled: true },
  };

  fs.writeFileSync(
    configPath,
    JSON.stringify(defaultConfig, null, 2) + "\n",
    "utf-8"
  );

  console.log("✅ Created i18n-check.config.json");
  process.exit(0);
}

(async () => {
  const config = loadConfig();

  // Flags
  const fix = args.includes("--fix") || args.includes("--fix-extras");
  const addMissing = args.includes("--add-missing");
  const seedMissing = args.includes("--seed-missing");
  const noHardcoded = args.includes("--no-hardcoded");
  const noUnused = args.includes("--no-unused");
  const asJson = args.includes("--json");
  const translateMissing = args.includes("--translate-missing");
  const translateEmpty = args.includes("--translate-empty");
  const pruneUnused =
    args.includes("--prune-unused") || args.includes("--remove-unused");

  if (
    (translateMissing || translateEmpty) &&
    (!config.deepl || !config.deepl.enabled || !config.deepl.apiKey)
  ) {
    console.log(
      "ℹ️ DeepL translation requested but disabled or missing apiKey in config.deepl."
    );
  }

  // JSON-Mode: still, quiet operations first, then emit machine JSON
  if (asJson) {
    // Optional: erst ungenutzte Keys löschen (wenn gewünscht),
    // damit der Report den aktuellen Stand zeigt.
    if (pruneUnused) {
      const { pruneAllUnusedKeys } = require("../lib/check");
      pruneAllUnusedKeys(config.i18nPath, config.srcPath, () => {});
    }

    // Optional: Fixes/Ergänzungen ausführen
    if (fix || addMissing || translateMissing || translateEmpty) {
      await compareTranslations(
        config.i18nPath,
        config.referenceLang,
        () => {},
        {
          fixExtras: fix,
          addMissing,
          seedMissingWithReference: seedMissing,
          translateMissing,
          translateEmpty,
          deepl: config.deepl,
        }
      );
    }

    // Daten einsammeln
    const projectRoot = process.cwd();
    const usedMap = getUsedTranslationKeys(config.srcPath, projectRoot);
    const usedKeys = [...usedMap.keys()];

    const referencePath = path.join(config.i18nPath, config.referenceLang);
    const referenceKeys = getAllTranslationKeys(referencePath);
    const missingUsedKeys = usedKeys.filter((k) => !referenceKeys.includes(k));

    const perLocaleDiffs = computeLocaleDiffs(
      config.i18nPath,
      config.referenceLang
    );

    const hardcodedFindings = noHardcoded
      ? []
      : getHardcodedTexts(
          config.srcPath,
          config.hardcoded || { enabled: true },
          process.cwd()
        );

    let unusedKeys = [];
    if (!noUnused) {
      const usedSet = new Set(usedKeys);
      unusedKeys = referenceKeys.filter((k) => !usedSet.has(k));
    }

    const report = buildJsonReport({
      missingUsedKeys,
      missingUsedKeyLocations: usedMap,
      perLocaleDiffs,
      hardcodedFindings,
      unusedKeys,
    });

    console.log(JSON.stringify(report, null, 2));

    const hasDiffs =
      report.summary.missingUsedKeys > 0 ||
      report.summary.localesWithDiffs > 0 ||
      (!noHardcoded && report.summary.hardcodedFindings > 0) ||
      (!noUnused && report.summary.unusedKeys > 0);

    process.exit(hasDiffs ? 1 : 0);
  }

  // Normaler Modus: hübsche Logs

  // 1) Prüfe: verwendete Keys existieren in Referenz
  const keysOk = checkUsedKeysInReference(
    config.srcPath,
    config.i18nPath,
    config.referenceLang
  );

  // 2) Vergleiche Locales & optionale Fixes
  const compareOk = await compareTranslations(
    config.i18nPath,
    config.referenceLang,
    console.log,
    {
      fixExtras: fix,
      addMissing,
      seedMissingWithReference: seedMissing,
      translateMissing,
      translateEmpty,
      deepl: config.deepl,
    }
  );

  // 3) Hardcoded-Report (optional)
  let hardcodedOk = true;
  if (!noHardcoded) {
    hardcodedOk = reportHardcodedText(
      config.srcPath,
      config.hardcoded || { enabled: true },
      console.log
    );
  } else {
    console.log("ℹ️ Skipping hardcoded-text scan (--no-hardcoded).");
  }

  // 4) Optional: ungenutzte Keys direkt PRUNEN, bevor wir sie reporten
  if (pruneUnused && !noUnused) {
    const { pruneAllUnusedKeys } = require("../lib/check");
    const prunedCount = pruneAllUnusedKeys(
      config.i18nPath,
      config.srcPath,
      console.log
    );
    if (prunedCount > 0) {
      console.log(`🧹 Removed ${prunedCount} unused key(s) from reference.`);
    } else {
      console.log("🧹 No unused keys to remove.");
    }
  }

  // 5) Unused-Report (optional)
  let unusedOk = true;
  if (!noUnused) {
    const res = reportUnusedReferenceKeys(
      config.srcPath,
      config.i18nPath,
      config.referenceLang,
      console.log
    );
    unusedOk = res.ok;
  } else {
    console.log("ℹ️ Skipping unused-keys check (--no-unused).");
  }

  // 6) Exit Code
  if (!keysOk || !compareOk || !hardcodedOk || !unusedOk) {
    process.exit(1);
  } else {
    console.log("\n✅ All checks passed!");
  }
})();
