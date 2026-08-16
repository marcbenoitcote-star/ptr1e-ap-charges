import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

for (const language of ["en", "fr"]) {
  const file = path.join(root, "lang", `${language}.json`);
  const translations = JSON.parse(fs.readFileSync(file, "utf8"));
  const trie = {};

  for (const [key, value] of Object.entries(translations)) {
    insertTranslation(trie, key.split("."), value, key);
  }

  assert.equal(resolveTranslation(trie, "PTR_AP.Confirm.Label"), language === "fr" ? "Confirmer" : "Confirm");
  assert.equal(resolveTranslation(trie, "PTR_AP.NewDay.Label"), language === "fr" ? "Nouvelle journee" : "New Day");
  assert.equal(resolveTranslation(trie, "RULES.Types.PTUCharge"), "Charge Number");
}

console.log("localization-smoke: OK");

function insertTranslation(node, segments, value, sourceKey) {
  const [segment, ...remaining] = segments;
  assert.ok(segment, `Invalid translation key: ${sourceKey}`);
  const child = node[segment] ??= { children: {}, value: undefined };

  if (remaining.length === 0) {
    if (isPlainObject(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        insertTranslation(child.children, nestedKey.split("."), nestedValue, `${sourceKey}.${nestedKey}`);
      }
      return;
    }

    assert.equal(child.value, undefined, `Duplicate translation path: ${sourceKey}`);
    assert.equal(Object.keys(child.children).length, 0, `Scalar translation shadows nested keys: ${sourceKey}`);
    child.value = value;
    return;
  }

  assert.equal(child.value, undefined, `Nested translation extends scalar key: ${sourceKey}`);
  insertTranslation(child.children, remaining, value, sourceKey);
}

function resolveTranslation(trie, key) {
  let children = trie;
  let node = null;
  for (const segment of key.split(".")) {
    node = children[segment];
    if (!node) return undefined;
    children = node.children;
  }
  return node?.value;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
