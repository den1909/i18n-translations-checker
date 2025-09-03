const path = require("path");
const fs = require("fs");
const {
  getUsedTranslationKeys,
  getAllTranslationKeys,
  flatten,
  unflatten,
  getHardcodedTexts, // NEU
} = require("./scan");
const { translateTexts, inferLangFromFilename } = require("./deepl");

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

async function compareTranslations(
  i18nDir,
  referenceFile,
  logger = console.log,
  options = {}
) {
  const {
    fixExtras = false,
    addMissing = false,
    seedMissingWithReference = false,
    translateMissing = false,
    translateEmpty = false,
    deepl: deeplCfg,
  } =
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
      let changed = false;
      // Translate missing keys if requested and possible
      if ((addMissing || translateMissing) && missingKeys.length) {
        let valuesToSet = new Array(missingKeys.length).fill("");
        if (translateMissing && deeplCfg && deeplCfg.enabled && deeplCfg.apiKey) {
          const sourceLang = deeplCfg.sourceLang || inferLangFromFilename(referenceFile);
          const targetLang = (deeplCfg.targetLangMap && deeplCfg.targetLangMap[file]) || inferLangFromFilename(file);
          try {
            logger(`🌐 Translating ${missingKeys.length} missing key(s) to ${targetLang} via DeepL...`);
            const texts = missingKeys.map((k) => String(referenceFlat[k] ?? ""));
            const translated = await translateTexts({
              apiKey: deeplCfg.apiKey,
              useFreeApi: !!deeplCfg.useFreeApi,
              sourceLang,
              targetLang,
              texts,
              formality: deeplCfg.formality || 'default',
              preserveFormatting: deeplCfg.preserveFormatting !== false,
              splitSentences: deeplCfg.splitSentences || '1',
              timeoutMs: deeplCfg.timeoutMs || 15000,
            });
            valuesToSet = translated;
          } catch (e) {
            logger(`❗ DeepL translation failed: ${e.message}`);
            // fall back to seed or empty
            valuesToSet = missingKeys.map((k) => (seedMissingWithReference ? String(referenceFlat[k] ?? "") : ""));
          }
        } else {
          // No translation; seed or empty
          valuesToSet = missingKeys.map((k) => (seedMissingWithReference ? String(referenceFlat[k] ?? "") : ""));
        }
        missingKeys.forEach((key, idx) => {
          targetFlat[key] = valuesToSet[idx] ?? "";
        });
        changed = true;
        logger(`✅ Added missing keys (${missingKeys.length}) to "${file}".`);
      }

      if (translateEmpty) {
        const emptyKeys = Object.keys(referenceFlat).filter((k) => k in targetFlat && (targetFlat[k] === '' || targetFlat[k] === null));
        if (emptyKeys.length && deeplCfg && deeplCfg.enabled && deeplCfg.apiKey) {
          const sourceLang = deeplCfg.sourceLang || inferLangFromFilename(referenceFile);
          const targetLang = (deeplCfg.targetLangMap && deeplCfg.targetLangMap[file]) || inferLangFromFilename(file);
          try {
            logger(`🌐 Translating ${emptyKeys.length} empty value(s) to ${targetLang} via DeepL...`);
            const texts = emptyKeys.map((k) => String(referenceFlat[k] ?? ""));
            const translated = await translateTexts({
              apiKey: deeplCfg.apiKey,
              useFreeApi: !!deeplCfg.useFreeApi,
              sourceLang,
              targetLang,
              texts,
              formality: deeplCfg.formality || 'default',
              preserveFormatting: deeplCfg.preserveFormatting !== false,
              splitSentences: deeplCfg.splitSentences || '1',
              timeoutMs: deeplCfg.timeoutMs || 15000,
            });
            emptyKeys.forEach((k, idx) => {
              targetFlat[k] = translated[idx] ?? targetFlat[k];
            });
            changed = true;
          } catch (e) {
            logger(`❗ DeepL translation for empty values failed: ${e.message}`);
          }
        }
      }

      if (changed) {
        const updatedObj = unflatten(targetFlat);
        fs.writeFileSync(filePath, JSON.stringify(updatedObj, null, 2));
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
