// MOSS-Image "tags" and "palette" lists for the MOSS Layout (used by main.js and decompile.js)

const ML_MAX_TAGS = 16;
const ML_MAX_COLOURS = 8;

// a list with blanks and case-insensitive repeats removed, cut at max
function mlMergeList(a, b, max) {
    const out = [];
    const seen = new Set();
    for (const v of [...a, ...b]) {
        const key = v.toLowerCase();
        if (seen.has(key) || out.length >= max) continue;
        seen.add(key);
        out.push(v);
    }
    return out;
}

function mlCleanTags(list) {
    if (!Array.isArray(list)) return [];
    const tags = list.filter((t) => typeof t === "string").map((t) => t.trim()).filter(Boolean);
    return mlMergeList(tags, [], ML_MAX_TAGS);
}

// typed text: tags are separated by commas or new lines
function mlParseTags(text) {
    return mlCleanTags(String(text || "").split(/[,\n]/));
}

// only #rrggbb, written in capitals
function mlCleanPalette(list) {
    if (!Array.isArray(list)) return [];
    const colours = list.filter((c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c.trim())).map((c) => c.trim().toUpperCase());
    return mlMergeList(colours, [], ML_MAX_COLOURS);
}

// a pick from the LoRA tab is "<lora:name:weight>" plus the LoRA's trigger words, if it has any
function mlSplitLoraPick(text) {
    const s = String(text || "").trim();
    const m = s.match(/^(<lora:[^>]*>)(.*)$/s);
    if (!m) return { tag: s, trigger: "" };
    return { tag: m[1], trigger: m[2].trim().replace(/^[,\s]+|[,\s]+$/g, "") };
}

// put comma-separated words at the front of a field, skipping words it already holds
function mlPrependWords(current, words) {
    const field = String(current || "").trim();
    const have = new Set(field.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean));
    const add = String(words || "")
        .split(",")
        .map((w) => w.trim())
        .filter((w) => w && !have.has(w.toLowerCase()));
    if (!add.length) return field;
    return field ? `${add.join(", ")}, ${field}` : add.join(", ");
}
