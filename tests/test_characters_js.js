// tests for javascript/characters.js. Run: node tests/test_characters_js.js
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "javascript", "characters.js"), "utf8"), ctx);
const { mlCaptionLine, mlCaptionHas, mlAppendCharacter, mlAddAbbr } = ctx;

const c = { abbr: "MR", name: "Mira Reed", description: "green scarf" };

assert.strictEqual(mlCaptionLine(c), "(MR) Mira Reed, green scarf");
assert.strictEqual(mlAppendCharacter("", c), "(MR) Mira Reed, green scarf");
assert.strictEqual(mlAppendCharacter("   ", c), "(MR) Mira Reed, green scarf");
assert.strictEqual(mlAppendCharacter("a park", c), "a park\n(MR) Mira Reed, green scarf");
assert.strictEqual(mlAppendCharacter("a park\n", c), "a park\n(MR) Mira Reed, green scarf");
assert.strictEqual(mlAppendCharacter("a park\n\n  ", c), "a park\n(MR) Mira Reed, green scarf");
assert.strictEqual(mlAppendCharacter("(mr) x", c), null);
assert.strictEqual(mlCaptionHas("(MR) x", "MR"), true);
assert.strictEqual(mlCaptionHas("(MR) x", "M"), false);
assert.strictEqual(mlCaptionHas("MR waves", "MR"), false);
assert.strictEqual(mlAppendCharacter("(MR) Mira", { abbr: "L", name: "Lou", description: "d" }), "(MR) Mira\n(L) Lou, d");

// a box caption names the character by its abbreviation, at the start
assert.strictEqual(mlAddAbbr("", "MR"), "(MR)");
assert.strictEqual(mlAddAbbr("waving", "MR"), "(MR) waving");
assert.strictEqual(mlAddAbbr("  waving", "MR"), "(MR) waving");
assert.strictEqual(mlAddAbbr("(OB) and (mr) waving", "MR"), null, "already there");
assert.strictEqual(mlAddAbbr("(OB) waving", "MR"), "(MR) (OB) waving");

console.log("characters.js: all assertions passed");
