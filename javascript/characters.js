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

// a box caption with each LoRA tag not yet in it put at the end; added = how many were new
function mlAddLoras(caption, loras) {
    let out = caption.trim();
    let added = 0;
    for (const tag of loras) {
        if (out.includes(tag)) continue;
        out = out ? `${out} ${tag}` : tag;
        added++;
    }
    return { caption: added ? out : caption, added };
}

// what "Add to box" writes into a box caption: "(ABBR)" at the start and the character's LoRAs at the end.
// A character with LoRAs also gets its "Name, description" right after "(ABBR)": a box's LoRA only reaches
// the words inside that box, so it needs the description there to have anything to act on.
// Returns { caption, loras: how many LoRAs were new, described: whether the description was added }.
function mlBoxCaption(caption, c) {
    const loras = c.loras || [];
    let out = mlAddAbbr(caption, c.abbr) ?? caption;
    let described = false;
    const line = `${c.name}, ${c.description}`;
    if (loras.length && !out.toLowerCase().includes(c.description.toLowerCase())) {
        const tag = `(${c.abbr.toLowerCase()})`;
        const at = out.toLowerCase().indexOf(tag) + tag.length;
        const rest = out.slice(at).trim();
        out = `${out.slice(0, at)} ${line}${rest ? (/[.,;:!?]$/.test(line) ? " " : ". ") + rest : ""}`;
        described = true;
    }
    const withLoras = mlAddLoras(out, loras);
    return { caption: withLoras.caption, loras: withLoras.added, described };
}
