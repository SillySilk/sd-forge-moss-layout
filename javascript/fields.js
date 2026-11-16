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
