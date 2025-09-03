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
  reportHardcodedText, // NEU
} = require("../lib/check");
const { getUsedTranslationKeys, getAllTranslationKeys, getHardcodedTexts } = require("../lib/scan");

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
  const fix = args.includes("--fix") || args.includes("--fix-extras");
  const addMissing = args.includes("--add-missing");
  const seedMissing = args.includes("--seed-missing");
  const noHardcoded = args.includes("--no-hardcoded");
  const noUnused = args.includes("--no-unused");
  const asJson = args.includes("--json");

  // If JSON output, compute details without noisy logs
  if (asJson) {
    const projectRoot = process.cwd();
    const usedMap = getUsedTranslationKeys(config.srcPath, projectRoot);
    const usedKeys = [...usedMap.keys()];
    const referencePath = path.join(config.i18nPath, config.referenceLang);
    const referenceKeys = getAllTranslationKeys(referencePath);
    const missingUsedKeys = usedKeys.filter((k) => !referenceKeys.includes(k));

    const perLocaleDiffs = computeLocaleDiffs(config.i18nPath, config.referenceLang);

    const hardcodedFindings = noHardcoded
      ? []
      : getHardcodedTexts(config.srcPath, config.hardcoded || { enabled: true }, process.cwd());

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
    // Apply optional fixes if requested
    if (fix || addMissing) {
      compareTranslations(
        config.i18nPath,
        config.referenceLang,
        () => {},
        { fixExtras: fix, addMissing, seedMissingWithReference: seedMissing }
      );
    }
    console.log(JSON.stringify(report, null, 2));
    const hasDiffs =
      report.summary.missingUsedKeys > 0 ||
      report.summary.localesWithDiffs > 0 ||
      (!noHardcoded && report.summary.hardcodedFindings > 0);
    process.exit(hasDiffs ? 1 : 0);
  }

  const keysOk = checkUsedKeysInReference(
    config.srcPath,
    config.i18nPath,
    config.referenceLang
  );
  const compareOk = compareTranslations(
    config.i18nPath,
    config.referenceLang,
    console.log,
    { fixExtras: fix, addMissing, seedMissingWithReference: seedMissing }
  );

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

  if (!keysOk || !compareOk || !hardcodedOk || !unusedOk) {
    process.exit(1);
  } else {
    console.log("\n✅ All checks passed!");
  }
})();
