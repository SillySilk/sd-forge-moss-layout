// tests for javascript/characters.js. Run: node tests/test_characters_js.js
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "javascript", "characters.js"), "utf8"), ctx);
const { mlCaptionLine, mlCaptionHas, mlAppendCharacter, mlAddAbbr } = ctx;

const c = { abbr: "LS", name: "Lisa Simpson", description: "star hair" };

assert.strictEqual(mlCaptionLine(c), "(LS) Lisa Simpson, star hair");
assert.strictEqual(mlAppendCharacter("", c), "(LS) Lisa Simpson, star hair");
assert.strictEqual(mlAppendCharacter("   ", c), "(LS) Lisa Simpson, star hair");
assert.strictEqual(mlAppendCharacter("a park", c), "a park\n(LS) Lisa Simpson, star hair");
assert.strictEqual(mlAppendCharacter("a park\n", c), "a park\n(LS) Lisa Simpson, star hair");
assert.strictEqual(mlAppendCharacter("a park\n\n  ", c), "a park\n(LS) Lisa Simpson, star hair");
assert.strictEqual(mlAppendCharacter("(ls) x", c), null);
assert.strictEqual(mlCaptionHas("(LS) x", "LS"), true);
assert.strictEqual(mlCaptionHas("(LS) x", "L"), false);
assert.strictEqual(mlCaptionHas("LS waves", "LS"), false);
assert.strictEqual(mlAppendCharacter("(LS) Lisa", { abbr: "L", name: "Lou", description: "d" }), "(LS) Lisa\n(L) Lou, d");

// a box caption names the character by its abbreviation, at the start
assert.strictEqual(mlAddAbbr("", "LS"), "(LS)");
assert.strictEqual(mlAddAbbr("waving", "LS"), "(LS) waving");
assert.strictEqual(mlAddAbbr("  waving", "LS"), "(LS) waving");
assert.strictEqual(mlAddAbbr("(BS) and (ls) waving", "LS"), null, "already there");
assert.strictEqual(mlAddAbbr("(BS) waving", "LS"), "(LS) (BS) waving");

console.log("characters.js: all assertions passed");
