// tests for javascript/fields.js (tags and palette). Run: node tests/test_fields_js.js
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "javascript", "fields.js"), "utf8"), ctx);
const { mlParseTags, mlCleanTags, mlCleanPalette, mlMergeList, mlSplitLoraPick } = ctx;
const eq = (a, b, msg) => assert.deepStrictEqual(Array.from(a), b, msg);

eq(mlParseTags(" old man, , Old Man,hat\nscarf "), ["old man", "hat", "scarf"], "split, trim, drop empties, dedupe ignoring case");
eq(mlParseTags(""), [], "empty text");

eq(mlCleanTags(["a", " a ", 3, "", "B"]), ["a", "B"], "non-strings and blanks dropped");
assert.strictEqual(mlCleanTags(Array.from({ length: 20 }, (_, i) => "t" + i)).length, 16, "at most 16 tags");
eq(mlCleanTags(null), [], "not a list");

eq(mlCleanPalette(["#1b9aaa", "red", "#abc", "#12345G", "#1B9AAA", "#ffffff"]), ["#1B9AAA", "#FFFFFF"], "only #rrggbb, uppercased, deduped");
assert.strictEqual(mlCleanPalette(Array.from({ length: 10 }, (_, i) => "#00000" + i)).length, 8, "at most 8 colours");
eq(mlCleanPalette(null), [], "not a list");

eq(mlMergeList(["a", "B"], ["b", "c"], 16), ["a", "B", "c"], "keeps order, skips case-insensitive duplicates");
eq(mlMergeList(["a", "b"], ["c"], 2), ["a", "b"], "respects the cap");

// ----- LoRA pick: tag vs trigger words -----
{
    const p = mlSplitLoraPick("<lora:ink style:0.8> ink sketch, crosshatch");
    assert.strictEqual(p.tag, "<lora:ink style:0.8>");
    assert.strictEqual(p.trigger, "ink sketch, crosshatch");
    const bare = mlSplitLoraPick("<lora:plain:1>");
    assert.strictEqual(bare.tag, "<lora:plain:1>");
    assert.strictEqual(bare.trigger, "", "no trigger words");
    const lead = mlSplitLoraPick(" <lora:x:1>  ,  word ");
    assert.strictEqual(lead.trigger, "word", "stray comma and spaces trimmed");
}

console.log("fields.js: all assertions passed");
