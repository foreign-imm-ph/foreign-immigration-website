// Loads a form's three config files (coordinate-map.json, questionnaire.json,
// sample-data.json) from bi-forms-library/configs/<formId>/. Deliberately
// does not look anywhere else and does not fall back to any default --
// a form with missing or malformed config files fails to load rather than
// generating against guessed values.
const fs = require("fs");
const path = require("path");

const CONFIGS_ROOT = path.join(__dirname, "..", "..", "configs");

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found at ${filePath}`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    throw new Error(`${label} at ${filePath} is not valid JSON: ${e.message}`);
  }
}

function loadFormConfig(formId) {
  const configDir = path.join(CONFIGS_ROOT, formId);
  if (!fs.existsSync(configDir)) {
    throw new Error(`No config directory for form "${formId}" at ${configDir}`);
  }
  const coordinateMap = readJson(path.join(configDir, "coordinate-map.json"), `coordinate-map.json for "${formId}"`);
  const questionnaire = readJson(path.join(configDir, "questionnaire.json"), `questionnaire.json for "${formId}"`);
  const sampleDataPath = path.join(configDir, "sample-data.json");
  const sampleData = fs.existsSync(sampleDataPath) ? readJson(sampleDataPath, `sample-data.json for "${formId}"`) : null;
  return { configDir, coordinateMap, questionnaire, sampleData };
}

function listFormIds() {
  if (!fs.existsSync(CONFIGS_ROOT)) return [];
  return fs.readdirSync(CONFIGS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

module.exports = { loadFormConfig, listFormIds, CONFIGS_ROOT };
