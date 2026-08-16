import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const moduleRoot = path.resolve(testDirectory, "..");
const source = fs.readFileSync(path.join(moduleRoot, "scripts", "main.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(moduleRoot, "module.json"), "utf8"));
const context = {
  console,
  Hooks: { once() {}, on() {} },
  foundry: { appv1: { api: { Dialog: class Dialog {} } } }
};

context.globalThis = context;
vm.runInNewContext(`${source}\n;globalThis.__apAnchorTest = { getApSheetAnchors };`, context);

const modernBody = { id: "modern-body" };
const modernBox = {
  querySelector(selector) {
    return selector === ".swsh-body" ? modernBody : null;
  }
};
const modernInput = {
  parentElement: { id: "modern-parent" },
  closest(selector) {
    if (selector === ".swsh-box") return modernBox;
    return null;
  }
};
const modernRoot = {
  querySelector(selector) {
    if (selector === ".ap-range") return null;
    if (selector.includes('input[name="system.ap.value"]')) return modernInput;
    return null;
  }
};

const modern = context.__apAnchorTest.getApSheetAnchors(modernRoot);
assert.equal(modern.nativeRange, null);
assert.equal(modern.valueInput, modernInput);
assert.equal(modern.apBody, modernBody);

const legacyBody = { id: "legacy-body" };
const legacyBox = {
  querySelector(selector) {
    return selector === ".swsh-body" ? legacyBody : null;
  }
};
const legacyRange = {
  parentElement: { id: "legacy-parent" },
  closest(selector) {
    if (selector === ".swsh-box") return legacyBox;
    return null;
  }
};
const legacyRoot = {
  querySelector(selector) {
    return selector === ".ap-range" ? legacyRange : null;
  }
};

const legacy = context.__apAnchorTest.getApSheetAnchors(legacyRoot);
assert.equal(legacy.nativeRange, legacyRange);
assert.equal(legacy.valueInput, null);
assert.equal(legacy.apBody, legacyBody);

assert.match(source, /enhancementHost\?\.append\(renderApMeter\(ap, tooltip\)\)/);
assert.match(source, /injectManualApControls\(actor, root, enhancementHost\)/);
assert.match(source, /injectResetControls\(actor, root, enhancementHost\)/);
assert.equal(manifest.version, "0.4.6");
assert.match(manifest.download, /\/v0\.4\.6\/module\.zip$/);

console.log("actor-sheet-anchor-smoke: OK");
