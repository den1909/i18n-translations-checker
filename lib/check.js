const path = require("path");
const fs = require("fs");
const {
  getUsedTranslationKeys,
  getAllTranslationKeys,
  flatten,
  unflatten,
  getHardcodedTexts, // NEU
} = require("./scan");

function checkUsedKeysInReference(
  srcPath,
  i18nPath,
  referenceFile,
  logger = console.log
) {
  const projectRoot = process.cwd();
  const keysToFiles = getUsedTranslationKeys(srcPath, projectRoot);
  const usedKeys = [...keysToFiles.keys()];
  const referencePath = path.join(i18nPath, referenceFile);
  const referenceKeys = getAllTranslationKeys(referencePath);

  const missingKeys = usedKeys.filter((k) => !referenceKeys.includes(k));

  if (missingKeys.length) {
    logger(`❌ Missing translation keys in "${referenceFile}":`);
    for (const key of missingKeys) {
      logger(`  - ${key}`);
      for (const file of keysToFiles.get(key)) {
        logger(`    ↳ ${file}`);
      }
    }
    return false;
  } else {
    logger(`✅ All used keys exist in "${referenceFile}"`);
    return true;
  }
}

// NEU: Hardcoded-Check (reiner Report, schlägt CI fehl falls welche gefunden)
function reportHardcodedText(srcPath, hardcodedCfg, logger = console.log) {
  if (!hardcodedCfg || hardcodedCfg.enabled === false) {
    logger("ℹ️ Hardcoded-text scan disabled.");
    return true;
  }
  const findings = getHardcodedTexts(srcPath, hardcodedCfg, process.cwd());
  if (!findings.length) {
    logger("✅ No hardcoded texts found.");
    return true;
  }
  logger(`❌ Found ${findings.length} hardcoded text occurrence(s):`);
  findings.forEach((f) => {
    logger(`  [${f.type}] ${f.text}`);
    logger(`    ↳ ${f.where}`);
  });
  return false;
}

function compareTranslations(
  i18nDir,
  referenceFile,
  logger = console.log,
  options = {}
) {
  const { fixExtras = false, addMissing = false, seedMissingWithReference = false } =
    typeof options === "boolean" ? { fixExtras: options } : options;
  const files = fs.readdirSync(i18nDir).filter((f) => f.endsWith(".json"));
  if (!files.includes(referenceFile)) {
    logger(`❌ Reference file "${referenceFile}" not found.`);
    process.exit(1);
  }

  const referenceObj = JSON.parse(
    fs.readFileSync(path.join(i18nDir, referenceFile), "utf8")
  );
  const referenceFlat = flatten(referenceObj);

  let allGood = true;

  for (const file of files) {
    if (file === referenceFile) continue;

    const filePath = path.join(i18nDir, file);
    const targetObj = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const targetFlat = flatten(targetObj);

    const missingKeys = Object.keys(referenceFlat).filter(
      (key) => !(key in targetFlat)
    );
    const extraKeys = Object.keys(targetFlat).filter(
      (key) => !(key in referenceFlat)
    );

    logger(`\n🔍 Comparing "${file}" with "${referenceFile}"`);

    if (!missingKeys.length && !extraKeys.length) {
      logger("✅ No differences found.");
    } else {
      allGood = false;
      if (missingKeys.length) {
        logger(`❌ Missing keys (${missingKeys.length}):`);
        missingKeys.forEach((k) => logger("  - " + k));
      }
      if (extraKeys.length) {
        logger(`⚠️ Extra keys (${extraKeys.length}):`);
        extraKeys.forEach((k) => logger("  + " + k));
        if (fixExtras) {
          extraKeys.forEach((key) => delete targetFlat[key]);
          const fixedObj = unflatten(targetFlat);
          fs.writeFileSync(filePath, JSON.stringify(fixedObj, null, 2));
          logger(`✅ Fixed extra keys in "${file}".`);
        }
      }

      if (addMissing && missingKeys.length) {
        missingKeys.forEach((key) => {
          targetFlat[key] = seedMissingWithReference ? referenceFlat[key] : "";
        });
        const updatedObj = unflatten(targetFlat);
        fs.writeFileSync(filePath, JSON.stringify(updatedObj, null, 2));
        logger(`✅ Added missing keys (${missingKeys.length}) to "${file}".`);
      }
    }
  }

  return allGood;
}

function computeLocaleDiffs(i18nDir, referenceFile) {
  const files = fs.readdirSync(i18nDir).filter((f) => f.endsWith(".json"));
  if (!files.includes(referenceFile)) {
    throw new Error(`Reference file "${referenceFile}" not found.`);
  }

  const referenceObj = JSON.parse(
    fs.readFileSync(path.join(i18nDir, referenceFile), "utf8")
  );
  const referenceFlat = flatten(referenceObj);

  const diffs = [];
  for (const file of files) {
    if (file === referenceFile) continue;
    const filePath = path.join(i18nDir, file);
    const targetFlat = flatten(JSON.parse(fs.readFileSync(filePath, "utf8")));
    const missing = Object.keys(referenceFlat).filter((k) => !(k in targetFlat));
    const extra = Object.keys(targetFlat).filter((k) => !(k in referenceFlat));
    diffs.push({ file, missing, extra });
  }
  return diffs;
}

function reportUnusedReferenceKeys(srcPath, i18nPath, referenceFile, logger = console.log) {
  const projectRoot = process.cwd();
  const keysToFiles = getUsedTranslationKeys(srcPath, projectRoot);
  const usedKeys = new Set(keysToFiles.keys());
  const referencePath = path.join(i18nPath, referenceFile);
  const referenceKeys = getAllTranslationKeys(referencePath);

  const unused = referenceKeys.filter((k) => !usedKeys.has(k));
  if (unused.length) {
    logger(`⚠️ Unused keys in "${referenceFile}" (${unused.length}):`);
    unused.forEach((k) => logger("  - " + k));
    return { ok: false, unused };
  }
  logger(`✅ No unused keys in "${referenceFile}"`);
  return { ok: true, unused: [] };
}

function buildJsonReport({
  missingUsedKeys,
  missingUsedKeyLocations,
  perLocaleDiffs,
  hardcodedFindings,
  unusedKeys,
}) {
  return {
    summary: {
      missingUsedKeys: missingUsedKeys.length,
      localesWithDiffs: perLocaleDiffs.filter((d) => d.missing.length || d.extra.length).length,
      hardcodedFindings: hardcodedFindings.length,
      unusedKeys: unusedKeys.length,
    },
    missingUsedKeys: missingUsedKeys.map((key) => ({ key, locations: Array.from(missingUsedKeyLocations.get(key) || []) })),
    perLocaleDiffs,
    hardcodedFindings,
    unusedKeys,
  };
}

module.exports = {
  checkUsedKeysInReference,
  compareTranslations,
  computeLocaleDiffs,
  reportUnusedReferenceKeys,
  buildJsonReport,
  reportHardcodedText, // NEU
};
