// every panel template in JSONscenes/Templates loads in the builder. Run: node tests/test_templates_js.js
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ctx = vm.createContext({});
for (const f of ["fields.js", "compile.js", "decompile.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "javascript", f), "utf8"), ctx);
const { mlDecompilePrompt } = ctx;

const dir = path.join(__dirname, "..", "JSONscenes", "Templates");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
assert.ok(files.length >= 4, "the templates are there");
for (const f of files) {
    const n = Number(f[0]);
    const draft = mlDecompilePrompt(fs.readFileSync(path.join(dir, f), "utf8"), NaN, NaN);
    assert.strictEqual(draft.summary.canvas, "multi_panel", f);
    assert.strictEqual(draft.items.length, n, `${f}: one box per panel`);
    draft.items.forEach((item, i) => {
        assert.ok(item.caption.startsWith(`Panel ${i + 1},`), `${f}: box ${i + 1} is named Panel ${i + 1}`);
        assert.ok(draft.summary.caption.includes(`Panel ${i + 1} is `), `${f}: the page caption places Panel ${i + 1}`);
        const [x1, y1, x2, y2] = item.bbox;
        assert.ok(x1 >= 0 && y1 >= 0 && x2 <= draft.width && y2 <= draft.height, `${f}: box ${i + 1} is on the page`);
        draft.items.slice(i + 1).forEach((other, j) => {
            const [a1, b1, a2, b2] = other.bbox;
            assert.ok(x2 <= a1 || a2 <= x1 || y2 <= b1 || b2 <= y1, `${f}: panels ${i + 1} and ${i + j + 2} do not overlap`);
        });
    });
}
console.log(`${files.length} templates load`);
