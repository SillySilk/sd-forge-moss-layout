// caption text for the MOSS Layout's Characters section (used by main.js)

function mlCaptionLine(c) {
    return `(${c.abbr}) ${c.name}, ${c.description}`;
}

function mlCaptionHas(caption, abbr) {
    return caption.toLowerCase().includes(`(${abbr.toLowerCase()})`);
}

// the caption with the character's line added on a new line, or null if it is already there
function mlAppendCharacter(caption, c) {
    if (mlCaptionHas(caption, c.abbr)) return null;
    const head = caption.trimEnd();
    return head ? `${head}\n${mlCaptionLine(c)}` : mlCaptionLine(c);
}

// a box caption with "(ABBR)" put at the start, or null if it already names the character
function mlAddAbbr(caption, abbr) {
    if (mlCaptionHas(caption, abbr)) return null;
    const rest = caption.trim();
    return rest ? `(${abbr}) ${rest}` : `(${abbr})`;
}
