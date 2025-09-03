const path = require("path");
const fs = require("fs");

function loadConfig() {
  const defaultConfig = {
    srcPath: path.resolve(process.cwd(), "src"),
    i18nPath: path.resolve(process.cwd(), "public/i18n"),
    referenceLang: "en.json",
    hardcoded: {
      enabled: true,
      minChars: 4,
      minWords: 2,
      htmlAttributes: [
        "placeholder",
        "title",
        "alt",
        "aria-label",
        "aria-placeholder",
        "label",
        "matTooltip",
        "mat-placeholder",
        "mat-label",
      ],
      ignorePatterns: [
        "^(https?:)?//",
        "^[\\w.-]+@[\\w.-]+\\.[A-Za-z]{2,}$",
        "^\\d+[.,\\d]*$",
      ],
      whitelistLiterals: ["OK", "Yes", "No"],
    },
  };

  const configPath = path.resolve(process.cwd(), "i18n-check.config.json");
  if (fs.existsSync(configPath)) {
    try {
      const userConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      return { ...defaultConfig, ...userConfig };
    } catch (error) {
      console.error("❌ Error reading configuration file:", error.message);
      process.exit(1);
    }
  }

  return defaultConfig;
}

module.exports = { loadConfig };
