onUiLoaded(() => {
    const tab = document.getElementById("tab_moss-layout");

    const t2i_prompt = document.getElementById("txt2img_prompt").querySelector("textarea");
    const t2i_width = document.getElementById("txt2img_width").querySelector("input");
    const t2i_height = document.getElementById("txt2img_height").querySelector("input");

    const i2i_prompt = document.getElementById("img2img_prompt").querySelector("textarea");
    const i2i_width = document.getElementById("img2img_width").querySelector("input");
    const i2i_height = document.getElementById("img2img_height").querySelector("input");

    const LABELS = ["object", "character", "text"];
    const CANVAS_TYPES = ["single", "multi_panel", "collage"];
    const ASPECT_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
    const MP_PIXELS = 1024 * 1024;

    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const round16 = (v) => Math.max(16, Math.round(v / 16) * 16);

    let idCounter = 0;

    const state = {
        width: 1024,
        height: 1024,
        summary: { caption: "", meta: "", extra: "", canvas: "single", palette: [] }, // + palette
        items: [],
    };

    const listRefs = new Map();
    const openFields = new Set(); // "<item id>:tags|palette" editors the user opened
    const canvasRefs = new Map();
    // on-screen stacking of canvas boxes, back to front. Only the display
    // changes; state.items keeps its order, since item numbers matter in the prompt.
    let stackOrder = [];
    // undo/redo over the boxes (javascript/editing.js) and the selected box
    const undoHistory = new MlHistory(100);
    let restoring = false;
    let selectedId = null;

    // the resolution is part of each step: undoing a box change made by a resize must also undo the resize
    function itemsSnapshot() {
        return JSON.stringify({ width: state.width, height: state.height, items: state.items });
    }

    function recordHistory(key = null) {
        saveLayout();
        if (restoring) return;
        undoHistory.commit(itemsSnapshot(), key);
        updateUndoButtons();
    }

    // the layout is kept in the browser, so a page refresh doesn't lose it
    const LAYOUT_KEY = "ml-layout";
    let saveTimer = null;
    function saveLayout() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            if (mlBlankLayout(state)) return; // the builder opens blank; that must not wipe the last session
            const items = state.items.map(({ label, caption, text, tags, palette, bbox }) => ({ label, caption, text, tags, palette, bbox }));
            storeSet(LAYOUT_KEY, JSON.stringify({ width: state.width, height: state.height, summary: state.summary, items }));
        }, 300);
    }

    const MIN_ZOOM = 0.25;
    const MAX_ZOOM = 8;
    const view = { scale: 1, panX: 0, panY: 0 };

    function h(tag, attrs = {}, children = []) {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs)) {
            if (k === "class") el.className = v;
            else if (k === "style") Object.assign(el.style, v);
            else if (k === "dataset") Object.assign(el.dataset, v);
            else if (k === "value" || k === "checked") el[k] = v;
            else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
            else el.setAttribute(k, v);
        }
        for (const c of [].concat(children)) {
            if (c === null || c === undefined) continue;
            el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
        }
        return el;
    }

    // ----- tag and palette editors (lists cleaned by fields.js) -----

    // chips with a remove button, and a field where Enter or "," adds what was typed
    function chipEditor(initial, onChange) {
        let cur = initial.slice();
        const input = h("input", { type: "text", class: "ml-chip-input", placeholder: "add tag…", "aria-label": "Add a tag" });
        const el = h("div", { class: "ml-chips" });
        function render() {
            el.textContent = "";
            for (const tag of cur) {
                const x = h("button", { type: "button", class: "ml-chip-x", "aria-label": `Remove ${tag}` }, ["✕"]);
                x.addEventListener("click", () => {
                    cur = cur.filter((t) => t !== tag);
                    render();
                    onChange(cur.slice());
                });
                el.appendChild(h("span", { class: "ml-chip" }, [tag, x]));
            }
            el.appendChild(input);
        }
        // keepFocus: only when typing (Enter / ","); a blur commit must let the focus go where the user clicked
        function commit(keepFocus) {
            const next = mlMergeList(cur, mlParseTags(input.value), ML_MAX_TAGS);
            input.value = "";
            if (next.length === cur.length) return;
            cur = next;
            render();
            if (keepFocus) input.focus();
            onChange(cur.slice());
        }
        input.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === ",") {
                ev.preventDefault();
                commit(true);
            }
        });
        input.addEventListener("blur", () => input.value.trim() && commit(false));
        render();
        // set() also drops half-typed text, so it can't be saved onto the next character
        return { el, get: () => cur.slice(), set: (list) => ((cur = list.slice()), (input.value = ""), render()) };
    }

    // colour swatches (click one to remove it) and a + that opens the colour picker
    function paletteEditor(initial, onChange) {
        let cur = initial.slice();
        const picker = h("input", { type: "color", class: "ml-palette-picker", tabindex: "-1", "aria-hidden": "true" });
        const add = h("button", { type: "button", class: "ml-swatch-add", title: "Add a colour", "aria-label": "Add a colour" }, ["+"]);
        const el = h("div", { class: "ml-palette" });
        function render() {
            el.textContent = "";
            for (const hex of cur) {
                const sw = h("button", { type: "button", class: "ml-swatch", title: `${hex}, click to remove`, "aria-label": `Remove colour ${hex}`, style: { background: hex } });
                sw.addEventListener("click", () => {
                    cur = cur.filter((c) => c !== hex);
                    render();
                    onChange(cur.slice());
                });
                el.appendChild(sw);
            }
            add.disabled = cur.length >= ML_MAX_COLOURS;
            el.append(add, picker);
        }
        add.addEventListener("click", () => picker.click());
        picker.addEventListener("change", () => {
            const next = mlMergeList(cur, mlCleanPalette([picker.value]), ML_MAX_COLOURS);
            if (next.length === cur.length) return;
            cur = next;
            render();
            onChange(cur.slice());
        });
        render();
        return { el, get: () => cur.slice(), set: (list) => ((cur = list.slice()), render()) };
    }

    const growables = new Set();

    function autoGrow(el) {
        if (el?.tagName !== "TEXTAREA") return;
        el.style.height = "auto";
        const cs = getComputedStyle(el);
        const borders = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
        el.style.height = `${el.scrollHeight + borders}px`;
    }

    const growObserver = new ResizeObserver(() => growables.forEach(autoGrow));

    function addGrowable(el) {
        if (growables.has(el)) return;
        growables.add(el);
        growObserver.observe(el);
        requestAnimationFrame(() => autoGrow(el));
    }

    function pruneGrowables() {
        for (const el of growables) {
            if (el.isConnected) continue;
            growObserver.unobserve(el);
            growables.delete(el);
        }
    }

    function defaultBbox() {
        const m = Math.round(Math.min(state.width, state.height) * 0.1);
        const s = Math.round(Math.min(state.width, state.height) * 0.3);
        return [m, m, m + s, m + s];
    }

    function newItem() {
        return { id: ++idCounter, label: "character", caption: "", text: "", tags: [], palette: [], bbox: defaultBbox() }; // was "object"; + tags/palette
    }

    state.items.push(newItem());

    // ----- canvas -----

    const canvasSection = h("div", { class: "ml-canvas" });
    const stage = h("div", { class: "ml-stage" });
    canvasSection.appendChild(stage);

    // ----- side panel -----

    const widthInput = h("input", { type: "number", class: "ml-width", min: "16", step: "16", value: state.width });
    const heightInput = h("input", { type: "number", class: "ml-height", min: "16", step: "16", value: state.height });
    const mpInput = h("input", { type: "number", class: "ml-mp", min: "0.1", step: "0.1", value: "1" });
    const arSelect = h(
        "select",
        { class: "ml-ar" },
        ASPECT_RATIOS.map((r) => h("option", { value: r }, [r])),
    );
    const setResBtn = h("button", { type: "button", class: "ml-set-res" }, ["Set Resolution"]);
    const swapResBtn = h("button", { type: "button", class: "ml-swap-res", title: "Swap width and height" }, ["\u21C4"]);

    // the size follows txt2img until it is set here; the marker says which, the button resumes following
    const followMark = h("span", { class: "ml-follow", role: "status" });
    const followBtn = h("button", { type: "button", class: "ml-follow-btn", title: "Take txt2img's size again and keep following it" }, ["Follow txt2img"]);
    const resolutionRows = [
        h("div", { class: "ml-row ml-res-row" }, [h("label", {}, ["W"]), widthInput, swapResBtn, h("label", {}, ["H"]), heightInput, followMark, followBtn]),
        h("div", { class: "ml-row ml-res-row" }, [h("label", {}, ["MP"]), mpInput, h("label", {}, ["AR"]), arSelect, setResBtn]),
    ];

    const sumCaption = h("textarea", { class: "ml-sum-caption", placeholder: "global caption", rows: "1" });
    const sumMeta = h("input", { type: "text", class: "ml-sum-meta", placeholder: "meta tags (comma separated)" });
    const sumPalette = paletteEditor(state.summary.palette, (list) => {
        state.summary.palette = list;
        saveLayout();
    });
    const sumExtra = h("textarea", { class: "ml-sum-extra", placeholder: "e.g. LoRA", rows: "3" }); // 3-line box, was a one-line input
    const loraBtn = h("button", { type: "button", class: "ml-lora-btn", title: "Pick a LoRA" }, ["+ LoRA"]);
    const canvasRadioInputs = [];
    const canvasRadios = CANVAS_TYPES.map((t) => {
        const id = `ml-canvas-${t}`;
        const radio = h("input", { type: "radio", name: "ml-canvas", value: t, id, checked: state.summary.canvas === t });
        radio.addEventListener("change", () => {
            if (radio.checked) state.summary.canvas = t;
            saveLayout();
        });
        canvasRadioInputs.push(radio);
        return h("label", { class: "ml-radio", for: id }, [radio, t]);
    });

    const summarySection = h("div", { class: "ml-section ml-sec-summary" }, [ // ml-sec-* = section tint
        h("div", { class: "ml-section-title ml-ornate" }, ["Summary"]), // ml-ornate = fleuron title
        h("div", { class: "ml-row" }, canvasRadios),
        h("label", { class: "ml-fld-label", for: "ml-sum-caption" }, ["Caption"]),
        sumCaption,
        // Meta and Extra on their own rows (Extra is ~3x wider), plus a LoRA picker
        // Meta (the medium) and the image's colour palette side by side
        h("div", { class: "ml-meta-row" }, [
            h("div", { class: "ml-meta-col" }, [h("label", { class: "ml-fld-label", for: "ml-sum-meta" }, ["Meta · medium"]), sumMeta]),
            h("div", { class: "ml-meta-col" }, [h("span", { class: "ml-fld-label" }, ["Palette"]), sumPalette.el]),
        ]),
        h("label", { class: "ml-fld-label", for: "ml-sum-extra" }, ["Extra"]),
        h("div", { class: "ml-row ml-extra-row" }, [sumExtra, loraBtn]),
    ]);
    sumCaption.id = "ml-sum-caption";
    sumMeta.id = "ml-sum-meta";
    sumExtra.id = "ml-sum-extra";

    const addBtn = h("button", { type: "button", class: "ml-add" }, ["Add Item"]);
    const clearBtn = h("button", { type: "button", class: "ml-clear" }, ["Clear All"]);
    const listEl = h("div", { class: "ml-list" });
    // undo / redo for the boxes
    const undoBtn = h("button", { type: "button", class: "ml-undo", title: "Undo (Ctrl+Z)", disabled: "" }, ["\u21B6 Undo"]);
    const redoBtn = h("button", { type: "button", class: "ml-redo", title: "Redo (Ctrl+Y)", disabled: "" }, ["\u21B7 Redo"]);
    // the builder opens blank; this brings back the layout saved before the page loaded
    const restoreBtn = h("button", { type: "button", class: "ml-restore", title: "Bring back the layout from your last session", disabled: "" }, ["Restore last session"]);
    const listToolbar = h("div", { class: "ml-list-toolbar" }, [addBtn, clearBtn, undoBtn, redoBtn, restoreBtn]); // top of the side panel
    const listSection = h("div", { class: "ml-section ml-list-section" }, [listEl]);

    // the go buttons, large, with a small line under the label
    const sendT2I = h("button", { type: "button", class: "ml-send-t2i" }, [h("span", { class: "ml-send-label" }, ["Send to txt2img"]), h("span", { class: "ml-send-sub" }, ["pull the lever"])]);
    const sendI2I = h("button", { type: "button", class: "ml-send-i2i" }, [h("span", { class: "ml-send-label" }, ["Send to img2img"]), h("span", { class: "ml-send-sub" }, ["rework the plate"])]);
    const submitSection = h("div", { class: "ml-section ml-submit" }, [sendT2I, sendI2I]);

    // ----- save / load -----

    const loadPromptBtn = h("button", { type: "button", class: "ml-load-prompt" }, ["Load Prompt"]);
    // edit the prompt that is in txt2img now (e.g. one sent from here earlier)
    const fromT2IPromptBtn = h("button", { type: "button", class: "ml-from-t2i-prompt", title: "Load txt2img's current prompt and size back into the builder" }, ["From txt2img"]);
    const promptMsg = h("div", { class: "ml-char-msg ml-prompt-msg" }); // why a load failed
    const saveJsonBtn = h("button", { type: "button", class: "ml-save-json" }, ["Save JSON"]);
    const loadJsonBtn = h("button", { type: "button", class: "ml-load-json" }, ["Load JSON"]);
    const loadImageBtn = h("button", { type: "button", class: "ml-load-image", title: "Trace boxes over an image; takes its resolution" }, ["Load Image"]);
    const clearImageBtn = h("button", { type: "button", class: "ml-clear-image", disabled: "" }, ["Clear Image"]);
    const fromT2IBtn = h("button", { type: "button", class: "ml-from-t2i", title: "Use txt2img's finished image (the selected one, else the latest) as the reference image" }, ["From txt2img"]);
    const fromI2IBtn = h("button", { type: "button", class: "ml-from-i2i", title: "Use img2img's input image (the left one) as the reference image; if it is empty, img2img's result" }, ["From img2img"]);
    const imageOpacity = h("input", { type: "range", class: "ml-image-opacity", min: "0", max: "100", step: "1", value: "100", disabled: "", title: "Image opacity (preview only)" });
    // Save/Load split into Prompt (beside Resolution) and Reference image (full width below)
    const promptSection = h("div", { class: "ml-section ml-save ml-prompt-size" }, [
        h("div", { class: "ml-section-title" }, ["Prompt & size"]), // resolution folded in here
        h("div", { class: "ml-row ml-prompt-btns" }, [loadPromptBtn, fromT2IPromptBtn, saveJsonBtn, loadJsonBtn]), // + From txt2img
        promptMsg,
        ...resolutionRows,
    ]);
    const imageSection = h("div", { class: "ml-section ml-save ml-image" }, [
        h("div", { class: "ml-section-title" }, ["Reference image"]),
        h("div", { class: "ml-row" }, [loadImageBtn, clearImageBtn, fromT2IBtn, fromI2IBtn]),
        h("div", { class: "ml-row" }, [h("label", {}, ["Opacity"]), imageOpacity]),
        h("div", { class: "ml-hint" }, ["Or drop / paste (Ctrl+V) an image onto the canvas."]),
    ]);

    const dialogInput = h("textarea", { class: "ml-dialog-input", placeholder: "Compiled Prompt or Layout Draft", spellcheck: "false" });
    const dialogWidth = h("input", { type: "number", min: "16", step: "16", class: "ml-dialog-width" });
    const dialogHeight = h("input", { type: "number", min: "16", step: "16", class: "ml-dialog-height" });
    const dialogClose = h("button", { type: "button", class: "ml-dialog-close", title: "Close" }, ["\u00D7"]);
    const dialogLoad = h("button", { type: "button", class: "ml-dialog-load" }, ["Load"]);
    const modal = h("div", { class: "ml-modal ml-hidden" }, [
        h("div", { class: "ml-dialog" }, [
            dialogClose,
            h("div", { class: "ml-dialog-body" }, [dialogInput, h("div", { class: "ml-dialog-dims" }, [h("label", {}, ["Width"]), dialogWidth, h("label", {}, ["Height"]), dialogHeight])]),
            dialogLoad,
        ]),
    ]);

    const imageInput = h("input", { type: "file", accept: "image/*", class: "ml-file" });
    imageInput.style.display = "none";

    // ----- characters -----
    // saved characters live in .jbcast files on the server (scripts/builder.py); Add puts
    // "(ABBR) Full name, description" into the Summary caption (javascript/characters.js)

    const CHAR_API = "/moss_layout/characters";
    const charFileSelect = h("select", { class: "ml-char-file", title: "Character file" });
    const charNewFileBtn = h("button", { type: "button", class: "ml-char-new" }, ["New file"]);
    const charImportBtn = h("button", { type: "button", class: "ml-char-import", title: "Copy a .jbcast file into the character folder" }, ["Import…"]);
    const charImportInput = h("input", { type: "file", accept: ".jbcast", class: "ml-file" });
    charImportInput.style.display = "none";
    // delete the selected character file (moved to characters/deleted/); examples can't be deleted
    const charFileTrash = h("button", { type: "button", class: "ml-char-file-trash", title: "Delete this character file" });
    charFileTrash.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
    const charSelect = h("select", { class: "ml-char-select", title: "Saved characters" });
    const charAddBtn = h("button", { type: "button", class: "ml-char-add" }, ["Add to caption"]);
    const charBoxBtn = h("button", { type: "button", class: "ml-char-box", title: "Put (ABBR) in the selected box's caption, and the character's line in the Summary caption" }, ["Add to box"]);
    const charAbbr = h("input", { type: "text", class: "ml-char-abbr", maxlength: "5", placeholder: "LS" });
    const charName = h("input", { type: "text", class: "ml-char-name", placeholder: "Full name" });
    const charDesc = h("textarea", { class: "ml-char-desc", rows: "2", placeholder: "Description" });
    const charSaveBtn = h("button", { type: "button", class: "ml-char-save" }, ["Save"]);
    // blanks the fields for a new character, so adding one doesn't mean overwriting the shown one first
    const charNewCharBtn = h("button", { type: "button", class: "ml-char-new-char", title: "Clear the fields to enter a new character, then Save" }, ["+ Add character"]);
    const charDeleteBtn = h("button", { type: "button", class: "ml-char-delete" }, ["Delete"]);
    const charMsg = h("div", { class: "ml-char-msg" });
    const charFoldBtn = h("button", { type: "button", class: "ml-char-fold", title: "Show or hide the character editor" });
    // two inner panels: using a character in the prompt vs editing the saved roster
    // Advanced = the character's MOSS tags and palette; "Add to box" copies them into the box
    const charTags = chipEditor([], () => {});
    const charPalette = paletteEditor([], () => {});
    const charAdvBtn = h("button", { type: "button", class: "ml-char-adv-btn", "aria-expanded": "false" });
    const charAdvBody = h("div", { class: "ml-char-adv-body" }, [
        h("div", { class: "ml-char-adv-field" }, [h("span", { class: "ml-fld-label" }, ["Tags"]), charTags.el]),
        h("div", { class: "ml-char-adv-field" }, [h("span", { class: "ml-fld-label" }, ["Palette"]), charPalette.el]),
    ]);
    const charAdv = h("div", { class: "ml-char-adv" }, [charAdvBtn, charAdvBody]);
    // the character's LoRAs: saved with it, and put into the box's caption by "Add to box" (not by "Add to caption")
    let charLoras = [];
    const charLoraChips = h("div", { class: "ml-chips ml-char-loras" });
    const charLoraBtn = h("button", { type: "button", class: "ml-char-lora-btn", title: "Pick a LoRA to save with this character" }, ["+ LoRA"]);
    function setCharLoras(list) {
        charLoras = list.slice();
        charLoraChips.textContent = "";
        for (const tag of charLoras) {
            const x = h("button", { type: "button", class: "ml-chip-x", "aria-label": `Remove ${tag}` }, ["✕"]);
            x.addEventListener("click", () => setCharLoras(charLoras.filter((t) => t !== tag)));
            charLoraChips.appendChild(h("span", { class: "ml-chip" }, [tag, x]));
        }
        if (!charLoras.length) charLoraChips.appendChild(h("span", { class: "ml-char-loras-none" }, ["no LoRA"]));
    }
    setCharLoras([]);
    function setAdvOpen(open) {
        charAdvBody.classList.toggle("ml-hidden", !open);
        charAdvBtn.setAttribute("aria-expanded", String(open));
        charAdvBtn.textContent = `${open ? "▾" : "▸"} Advanced`;
        storeSet("ml-char-adv-open", open ? "1" : "0");
    }
    charAdvBtn.addEventListener("click", () => setAdvOpen(charAdvBody.classList.contains("ml-hidden")));
    const charEditor = h("div", { class: "ml-subpanel ml-char-editor" }, [
        h("div", { class: "ml-subpanel-title" }, ["Edit roster"]),
        h("div", { class: "ml-row" }, [h("label", {}, ["Abbrev"]), charAbbr, h("label", {}, ["Name"]), charName]),
        charDesc,
        h("div", { class: "ml-row ml-char-lora-row" }, [h("span", { class: "ml-fld-label" }, ["LoRA"]), charLoraChips, charLoraBtn]),
        charAdv,
        h("div", { class: "ml-row ml-char-actions" }, [charSaveBtn, charDeleteBtn]),
    ]);
    const charactersSection = h("div", { class: "ml-section ml-chars" }, [
        // New file / Import sit in the section's title row, beside the Edit fold
        h("div", { class: "ml-section-title" }, ["Character roster", h("span", { class: "ml-char-title-btns" }, [charNewFileBtn, charImportBtn, charFoldBtn])]),
        h("div", { class: "ml-subpanel ml-char-use" }, [
            h("div", { class: "ml-subpanel-title" }, ["Add to prompt"]),
            h("div", { class: "ml-row" }, [charFileSelect, charFileTrash]),
            h("div", { class: "ml-row" }, [charSelect]), // the name gets the full width
            h("div", { class: "ml-row" }, [charAddBtn, charBoxBtn]),
            h("div", { class: "ml-row" }, [charNewCharBtn]), // under the character dropdown, visible while the editor is folded
        ]),
        charEditor,
        charMsg,
    ]);

    const charState = { file: null, example: false, characters: [] };

    function storeGet(key) {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    }

    function storeSet(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch {
            /* storage unavailable: the choice just isn't remembered */
        }
    }

    function charMessage(text, isError = false) {
        charMsg.textContent = text;
        charMsg.classList.toggle("ml-char-error", isError);
    }

    function promptMessage(text, isError = false) {
        promptMsg.textContent = text;
        promptMsg.classList.toggle("ml-char-error", isError);
    }

    function flash(button) {
        button.classList.add("ml-invalid");
        setTimeout(() => button.classList.remove("ml-invalid"), 1200);
    }

    async function charRequest(path, body) {
        const res = await fetch(`${CHAR_API}${path}`, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || `Request failed (${res.status})`);
        return data;
    }

    function setFolded(folded) {
        charEditor.classList.toggle("ml-hidden", folded);
        charFoldBtn.textContent = folded ? "Edit ▸" : "Edit ▾";
        storeSet("ml-char-folded", folded ? "1" : "0");
    }

    function renderCharacters(selectAbbr) {
        const sorted = [...charState.characters].sort((a, b) => a.abbr.localeCompare(b.abbr, undefined, { sensitivity: "base" }));
        charSelect.textContent = "";
        if (!sorted.length) charSelect.appendChild(h("option", { value: "" }, [charState.file ? "(no characters yet)" : "(choose a character list first)"]));
        for (const c of sorted) charSelect.appendChild(h("option", { value: c.abbr }, [`${c.abbr} — ${c.name}`]));
        if (selectAbbr && sorted.some((c) => c.abbr === selectAbbr)) charSelect.value = selectAbbr;
        charAddBtn.disabled = !sorted.length;
        charSaveBtn.disabled = charState.example || !charState.file;
        charLoraBtn.disabled = charState.example || !charState.file;
        charNewCharBtn.disabled = charState.example || !charState.file;
        charDeleteBtn.disabled = charState.example || !charState.file || !sorted.length;
        charFileTrash.disabled = charState.example || !charState.file;
        charFileTrash.title = charState.example ? "Examples can't be deleted" : "Delete this character file";
        if (charState.example) charMessage("Examples are read-only. Use New file to make your own.");
        fillEditor();
    }

    function selectedCharacter() {
        return charState.characters.find((c) => c.abbr === charSelect.value) || null;
    }

    function fillEditor() {
        const c = selectedCharacter();
        charAbbr.value = c ? c.abbr : "";
        charName.value = c ? c.name : "";
        charDesc.value = c ? c.description : "";
        charTags.set(c?.tags || []);
        charPalette.set(c?.palette || []);
        setCharLoras(c?.loras || []);
        autoGrow(charDesc);
    }



    function applyFile(data, selectAbbr) {
        charState.file = data.name;
        charState.example = data.example;
        charState.characters = data.characters;
        charFileSelect.value = data.name;
        renderCharacters(selectAbbr);
    }

    async function openCharFile(name) {
        charMessage("");
        try {
            applyFile(await charRequest(`/file?name=${encodeURIComponent(name)}`));
        } catch (e) {
            charState.file = name;
            charState.example = false;
            charState.characters = [];
            renderCharacters();
            charSaveBtn.disabled = charDeleteBtn.disabled = true;
            charFileTrash.disabled = false; // a damaged file can still be deleted
            charMessage(e.message, true);
        }
    }

    // no list is open until one is picked (the builder used to reopen the last one)
    function closeCharFile() {
        charMessage("");
        charState.file = null;
        charState.example = false;
        charState.characters = [];
        charFileSelect.value = "";
        renderCharacters();
    }

    async function loadCharFiles(selectName) {
        try {
            const { files } = await charRequest("/files");
            charFileSelect.textContent = "";
            charFileSelect.appendChild(h("option", { value: "" }, ["Choose character list"]));
            for (const f of files) charFileSelect.appendChild(h("option", { value: f }, [f]));
            if (!files.length) {
                charState.file = null;
                charState.characters = [];
                renderCharacters();
                charFileTrash.disabled = true;
                charMessage("No character files. Use New file.", true);
                return;
            }
            if (selectName && files.includes(selectName)) await openCharFile(selectName); // just made, imported or saved
            else closeCharFile();
        } catch (e) {
            charMessage(e.message, true);
        }
    }

    charFileSelect.addEventListener("change", () => (charFileSelect.value ? openCharFile(charFileSelect.value) : closeCharFile()));
    charSelect.addEventListener("change", fillEditor);
    charNewCharBtn.addEventListener("click", () => {
        setFolded(false); // the fields live in the editor
        charAbbr.value = "";
        charName.value = "";
        charDesc.value = "";
        charTags.set([]);
        charPalette.set([]);
        setCharLoras([]);
        autoGrow(charDesc);
        charMessage("Type the new character, then Save.");
        charAbbr.focus();
    });
    charFoldBtn.addEventListener("click", () => setFolded(!charEditor.classList.contains("ml-hidden")));

    charAddBtn.addEventListener("click", () => {
        const c = selectedCharacter();
        const next = c && mlAppendCharacter(sumCaption.value, c);
        if (!next) {
            flash(charAddBtn);
            if (c) charMessage(`(${c.abbr}) is already in the caption.`);
            return;
        }
        sumCaption.value = next;
        state.summary.caption = next;
        autoGrow(sumCaption);
        saveLayout();
        charMessage(`Added (${c.abbr}) to the caption.`);
    });

    // the box names the character by "(ABBR)" and gets its saved LoRAs (regional, that box only) plus,
    // when it has LoRAs, its description; the Summary caption says who that is
    charBoxBtn.addEventListener("click", () => {
        const c = selectedCharacter();
        const item = state.items.find((it) => it.id === selectedId);
        if (!c || !item) {
            flash(charBoxBtn);
            if (c) charMessage("Click a box on the canvas first.", true);
            return;
        }
        const n = state.items.indexOf(item) + 1;
        const built = mlBoxCaption(item.caption, c);
        const loras = built.loras;
        const boxNext = built.caption !== item.caption ? built.caption : null;
        if (boxNext !== null) {
            item.caption = boxNext;
            const row = listRefs.get(item.id);
            if (row) {
                row.captionInput.value = boxNext;
                autoGrow(row.captionInput);
            }
            const box = canvasRefs.get(item.id);
            if (box) box.caption.value = boxNext;
            recordHistory();
        }
        // the character's tags and palette join the box's (no repeats)
        const tagsNext = mlMergeList(item.tags, c.tags || [], ML_MAX_TAGS);
        const palNext = mlMergeList(item.palette, c.palette || [], ML_MAX_COLOURS);
        const listsChanged = tagsNext.length !== item.tags.length || palNext.length !== item.palette.length;
        if (listsChanged) {
            item.tags = tagsNext;
            item.palette = palNext;
            renderList();
            recordHistory(); // its own undo step after the caption one
        }
        const sumNext = mlAppendCharacter(sumCaption.value, c);
        if (sumNext) {
            sumCaption.value = sumNext;
            state.summary.caption = sumNext;
            autoGrow(sumCaption);
            saveLayout();
        }
        const loraNote = loras ? ` with ${loras} LoRA${loras > 1 ? "s" : ""}${built.described ? " and its description" : ""}` : "";
        if (boxNext === null && !sumNext && !listsChanged) charMessage(`(${c.abbr}) is already in box #${n} and the caption.`);
        else charMessage(`Added (${c.abbr}) to box #${n}${loraNote}${sumNext ? " and its line to the caption" : ""}.`);
    });

    charSaveBtn.addEventListener("click", async () => {
        try {
            const data = await charRequest("/save", { name: charState.file, abbr: charAbbr.value, full_name: charName.value, description: charDesc.value, tags: charTags.get(), palette: charPalette.get(), loras: charLoras }); // + tags/palette/loras
            applyFile(data, charAbbr.value.trim());
            charMessage(`Saved ${charAbbr.value.trim()} to ${data.name}.`);
        } catch (e) {
            flash(charSaveBtn);
            charMessage(e.message, true);
        }
    });

    charDeleteBtn.addEventListener("click", async () => {
        const abbr = charAbbr.value.trim();
        if (!abbr || !window.confirm(`Delete ${abbr} from ${charState.file}?`)) return;
        try {
            applyFile(await charRequest("/delete", { name: charState.file, abbr }));
            charMessage(`Deleted ${abbr}.`);
        } catch (e) {
            flash(charDeleteBtn);
            charMessage(e.message, true);
        }
    });

    charFileTrash.addEventListener("click", async () => {
        const name = charState.file;
        if (!name || charState.example) return;
        if (!window.confirm(`Delete ${name}?

It is moved to the characters/deleted folder, so it can be put back by hand.`)) return;
        try {
            await charRequest("/delete_file", { name });
            await loadCharFiles();
            charMessage(`Deleted ${name} (kept in characters/deleted).`);
        } catch (e) {
            flash(charFileTrash);
            charMessage(e.message, true);
        }
    });

    charNewFileBtn.addEventListener("click", async () => {
        const name = window.prompt("Name for the new character file:");
        if (!name || !name.trim()) return;
        try {
            const data = await charRequest("/file", { name });
            await loadCharFiles(data.name);
            charMessage(`Created ${data.name}.`);
        } catch (e) {
            flash(charNewFileBtn);
            charMessage(e.message, true);
        }
    });

    charImportBtn.addEventListener("click", () => charImportInput.click());
    charImportInput.addEventListener("change", async () => {
        const file = charImportInput.files[0];
        charImportInput.value = "";
        if (!file) return;
        try {
            const data = await charRequest("/import", { name: file.name, content: await file.text() });
            await loadCharFiles(data.name);
            charMessage(`Imported ${data.name}.`);
        } catch (e) {
            flash(charImportBtn);
            charMessage(e.message, true);
        }
    });

    // workflow order: go buttons, Summary, the boxes and who is in them, then the rarely used parts
    const objectsSection = h("div", { class: "ml-section ml-objects" }, [
        h("div", { class: "ml-section-title ml-ornate" }, ["Objects & Characters"]),
        listSection,
        charactersSection,
    ]);
    const side = h("div", { class: "ml-side" }, [listToolbar, submitSection, summarySection, objectsSection, imageSection, promptSection]);
    // LoRA picker, mirroring the txt2img LoRA tab's cards
    const loraSearch = h("input", { type: "text", class: "ml-lora-search", placeholder: "Search..." });
    const loraFolder = h("select", { class: "ml-lora-folder", title: "Active Lora folder" });
    const loraClose = h("button", { type: "button", class: "ml-dialog-close", title: "Close" }, ["×"]);
    const loraGrid = h("div", { class: "extra-network-cards ml-lora-grid" });
    const loraDirs = h("div", { class: "ml-lora-dirs" }); // the LoRA tab's subfolder buttons
    let loraSub = ""; // chosen subfolder, as the LoRA tab writes it (`Body\`); "" = all
    const loraModal = h("div", { class: "ml-modal ml-hidden" }, [
        h("div", { class: "ml-dialog ml-lora-dialog" }, [
            loraClose,
            h("div", { class: "ml-row ml-lora-controls" }, [loraSearch, loraFolder]),
            loraDirs,
            h("div", { class: "extra-network-pane ml-lora-pane" }, [loraGrid]), // borrows the LoRA tab's card styling
        ]),
    ]);

    // saved layouts in the extension's JSONscenes/ folder (scripts/moss_layout.py)
    const SCENE_API = "/moss_layout/scenes";
    let currentScene = ""; // path of the last scene loaded or saved, offered as the Save name

    const root = h("div", { class: "ml-root" }, [canvasSection, side, modal, loraModal, imageInput, charImportInput]); // + charImportInput

    tab.textContent = "";
    tab.appendChild(root);
    addGrowable(sumCaption);
    addGrowable(sumExtra);

    function loadDraft(draft) {
        setPinned(true);
        state.width = draft.width;
        state.height = draft.height;
        state.summary.caption = draft.summary.caption;
        state.summary.meta = draft.summary.meta.join(", ");
        state.summary.canvas = draft.summary.canvas;
        state.summary.extra = draft.extra || ""; // was always ""
        state.summary.palette = mlCleanPalette(draft.summary.palette);
        state.items = draft.items.map((item) => ({
            id: ++idCounter,
            label: item.label,
            caption: item.caption,
            text: item.text || "",
            tags: mlCleanTags(item.tags),
            palette: mlCleanPalette(item.palette),
            bbox: item.bbox.slice(),
        }));

        widthInput.value = state.width;
        heightInput.value = state.height;
        sumCaption.value = state.summary.caption;
        sumMeta.value = state.summary.meta;
        sumPalette.set(state.summary.palette);
        sumExtra.value = state.summary.extra;
        autoGrow(sumCaption);
        autoGrow(sumExtra);
        canvasRadioInputs.forEach((radio) => {
            radio.checked = radio.value === state.summary.canvas;
        });

        fitStage();
        renderAll();
    }

    function openDialog() {
        loadPromptBtn.classList.remove("ml-invalid");
        dialogInput.value = "";
        dialogWidth.value = state.width;
        dialogHeight.value = state.height;
        modal.classList.remove("ml-hidden");
        dialogInput.focus();
    }

    function closeDialog() {
        modal.classList.add("ml-hidden");
    }

    function handleDialogLoad() {
        const text = dialogInput.value.trim();
        if (text === "") {
            closeDialog();
            return;
        }
        try {
            const draft = mlDecompilePrompt(text, parseFloat(dialogWidth.value), parseFloat(dialogHeight.value));
            loadDraft(draft);
            promptMessage("");
        } catch (e) {
            loadPromptBtn.classList.add("ml-invalid");
            promptMessage(`Couldn't load that prompt: ${e.message}`, true);
        }
        closeDialog();
    }

    // ----- LoRA picker -----

    const loraCardsHtml = () => document.getElementById("txt2img_lora_cards_html");
    const loraFolderSource = () => document.querySelector("#txt2img_lora_folder_select");

    // the same subfolder buttons the LoRA tab shows above its cards ("all", "Body\\", ...)
    function renderLoraDirs() {
        loraDirs.textContent = "";
        const subs = [...(document.getElementById("txt2img_lora_dirs")?.querySelectorAll("button") ?? [])]
            .map((b) => (b.classList.contains("search-all") ? "" : b.textContent.trim()));
        if (!subs.includes(loraSub)) loraSub = "";
        loraDirs.classList.toggle("ml-hidden", subs.length === 0);
        for (const sub of subs) {
            loraDirs.appendChild(h("button", {
                type: "button",
                class: `ml-lora-dir${sub === loraSub ? " ml-lora-dir-on" : ""}`,
                onclick: () => {
                    loraSub = sub;
                    renderLoraDirs();
                    renderLoraCards();
                },
            }, [sub || "all"]));
        }
    }

    // the card's path below the LoRA root ("LORAS\Moss\Body\name.safetensors"), as the tab's search uses it
    const loraCardPath = (card) => (card.querySelector(".search_terms")?.textContent ?? "").toLowerCase().replace(/\//g, "\\");

    function renderLoraCards() {
        loraGrid.textContent = "";
        const query = loraSearch.value.trim().toLowerCase();
        const sub = loraSub && "\\" + loraSub.toLowerCase().replace(/\//g, "\\").replace(/^\\+/, "");
        const cards = loraCardsHtml()?.querySelectorAll(".card") ?? [];
        for (const card of cards) {
            if (query && !card.textContent.toLowerCase().includes(query)) continue;
            if (sub && !loraCardPath(card).includes(sub)) continue;
            const clone = card.cloneNode(true);
            clone.removeAttribute("onclick");
            clone.removeAttribute("style");
            clone.classList.remove("hidden"); // the whole active folder, whatever subfolder or search txt2img's tab is left on
            clone.querySelector(".button-row")?.remove();
            clone.addEventListener("click", () => pickLora(card));
            loraGrid.appendChild(clone);
        }
        if (!loraGrid.childElementCount) loraGrid.appendChild(h("div", { class: "ml-lora-empty" }, ["No LoRA found"]));
    }

    function syncLoraFolders() {
        const source = loraFolderSource();
        loraFolder.textContent = "";
        loraFolder.classList.toggle("ml-hidden", !source);
        if (!source) return;
        for (const opt of source.options) loraFolder.appendChild(h("option", { value: opt.value }, [opt.textContent]));
        loraFolder.value = source.value;
    }

    // the LoRA tab's own click handler builds the tag (weight, trigger words, ...); capture it instead of inserting into txt2img
    function pickLora(card) {
        const original = window.cardClicked;
        let tag = null;
        window.cardClicked = (_tabname, textToAdd) => {
            tag = textToAdd;
        };
        try {
            card.click();
        } finally {
            window.cardClicked = original;
        }
        if (!tag) return;
        const onPick = loraTarget;
        closeLoraPicker();
        onPick?.(tag);
    }

    function appendTag(field, tag) {
        const current = field.value.trim();
        if (current.includes(tag)) return; // picked again: already there
        field.value = current ? `${current} ${tag}` : tag;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        autoGrow(field);
    }

    const loraObserver = new MutationObserver(() => {
        if (loraModal.classList.contains("ml-hidden")) return;
        renderLoraDirs();
        renderLoraCards();
    });

    let loraTarget = null; // where the picked tag goes: the summary's Extra or an item's caption

    function openLoraPicker(onPick) {
        loraTarget = onPick;
        syncLoraFolders();
        renderLoraDirs();
        renderLoraCards();
        const cardsHtml = loraCardsHtml();
        if (cardsHtml) loraObserver.observe(cardsHtml, { childList: true, subtree: true });
        loraModal.classList.remove("ml-hidden");
        loraSearch.focus();
    }

    function closeLoraPicker() {
        loraObserver.disconnect();
        loraTarget = null;
        loraModal.classList.add("ml-hidden");
    }

    // only the <lora:...> tag is inserted; the LoRA's trigger words are dropped (they often add unhelpful tags)
    // summary pick: tag in Extra
    loraBtn.addEventListener("click", () =>
        openLoraPicker((pick) => {
            appendTag(sumExtra, mlSplitLoraPick(pick).tag);
        }),
    );
    // shared by the list row and the canvas box; the row's input event keeps item.caption and the box in step
    // item pick: the tag goes at the end of the item's caption
    function pickLoraForItem(item) {
        openLoraPicker((pick) => {
            const input = listRefs.get(item.id)?.captionInput;
            if (!input) return;
            appendTag(input, mlSplitLoraPick(pick).tag);
        });
    }

    // character editor pick: the tag is kept with the character (saved on Save)
    charLoraBtn.addEventListener("click", () =>
        openLoraPicker((pick) => {
            const tag = mlSplitLoraPick(pick).tag;
            if (!charLoras.includes(tag)) setCharLoras([...charLoras, tag]);
            charMessage("LoRA added. Save to keep it with the character.");
        }),
    );

    loraClose.addEventListener("click", closeLoraPicker);
    // no close on a click beside the window: it is full screen, and a stray click lost the pick (× or Esc closes)
    loraSearch.addEventListener("input", renderLoraCards);
    loraFolder.addEventListener("change", () => {
        const source = loraFolderSource();
        if (!source) return;
        source.value = loraFolder.value;
        source.dispatchEvent(new Event("change", { bubbles: true }));
    });

    loadPromptBtn.addEventListener("click", openDialog);

    fromT2IPromptBtn.addEventListener("click", () => {
        const text = t2i_prompt.value.trim();
        try {
            if (!text.includes("{")) throw new Error(text ? "it isn't a layout prompt" : "it is empty");
            loadDraft(mlDecompilePrompt(text, mlSnap16(parseInt(t2i_width.value, 10)), mlSnap16(parseInt(t2i_height.value, 10))));
            promptMessage("Loaded txt2img's prompt.");
        } catch (e) {
            flash(fromT2IPromptBtn);
            promptMessage(`Couldn't load txt2img's prompt: ${e.message}`, true);
        }
    });
    dialogClose.addEventListener("click", closeDialog);
    dialogLoad.addEventListener("click", handleDialogLoad);

    async function sceneRequest(path, body) {
        const res = await fetch(`${SCENE_API}${path}`, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(data.detail || `Request failed (${res.status})`);
            err.status = res.status;
            throw err;
        }
        return data;
    }

    saveJsonBtn.addEventListener("click", async () => {
        const name = prompt("Save to JSONscenes as (use / for a folder, e.g. My story/01 Opening)", currentScene.replace(/\.json$/i, "") || "layout");
        if (name === null || name.trim() === "") return;
        const content = JSON.stringify(buildJson(), null, 2);
        try {
            let data;
            try {
                data = await sceneRequest("/save", { path: name, content });
            } catch (e) {
                if (e.status !== 409 || !confirm(`${e.message} Replace it?`)) throw e;
                data = await sceneRequest("/save", { path: name, content, overwrite: true });
            }
            currentScene = data.path;
            promptMessage(`Saved ${data.path}`);
        } catch (e) {
            flash(saveJsonBtn);
            promptMessage(`Couldn't save: ${e.message}`, true);
        }
    });

    // Load JSON: the Windows Open dialog, starting in JSONscenes (or the last scene's subfolder)
    let picking = false;
    loadJsonBtn.addEventListener("click", async () => {
        if (picking) return; // the dialog is already open, perhaps behind the browser
        picking = true;
        loadJsonBtn.classList.remove("ml-invalid");
        loadJsonBtn.disabled = true;
        try {
            const data = await sceneRequest(`/pick?start=${encodeURIComponent(currentScene)}`);
            if (data.cancelled) return;
            try {
                loadDraft(mlDecompilePrompt(data.content, NaN, NaN));
            } catch (e) {
                loadJsonBtn.classList.add("ml-invalid");
                promptMessage(`Couldn't load ${data.name}: ${e.message}`, true);
                return;
            }
            currentScene = data.path; // "" for a file outside JSONscenes
            promptMessage(`Loaded ${data.path || data.name}`);
        } catch (e) {
            flash(loadJsonBtn);
            promptMessage(`Couldn't open the file dialog: ${e.message}`, true);
        } finally {
            picking = false;
            loadJsonBtn.disabled = false;
        }
    });

    // ----- background image -----

    // an <img> with a blob: URL, not a CSS data: URL, which Chrome silently drops past ~2 MB
    const bgEl = h("img", { class: "ml-bg", alt: "", draggable: "false" });
    let bgFile = null; // the loaded reference image, sent to img2img

    function setBackground(file, url) {
        if (bgEl.src.startsWith("blob:")) URL.revokeObjectURL(bgEl.src);
        bgFile = file;
        if (url) bgEl.src = url;
        else bgEl.removeAttribute("src");
        stage.classList.toggle("ml-has-image", !!file);
        clearImageBtn.disabled = !file;
        imageOpacity.disabled = !file;
    }

    // preview only; the image sent to img2img stays untouched
    imageOpacity.addEventListener("input", () => {
        bgEl.style.opacity = String(imageOpacity.value / 100);
    });

    loadImageBtn.addEventListener("click", () => {
        loadImageBtn.classList.remove("ml-invalid");
        imageInput.value = "";
        imageInput.click();
    });

    // takes the image's resolution and scales the boxes with it; `button` turns red if it cannot be read
    function loadBackground(file, button) {
        [loadImageBtn, fromT2IBtn, fromI2IBtn].forEach((b) => b.classList.remove("ml-invalid"));
        setBackground(null); // a new pick always replaces the last one, even if it fails to load
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            // the prompt format needs multiples of 16; the image stretches by at most 8 px a side
            const width = round16(img.naturalWidth);
            const height = round16(img.naturalHeight);
            // boxes keep their place relative to the frame
            const sx = width / state.width;
            const sy = height / state.height;
            for (const item of state.items) {
                const [x1, y1, x2, y2] = item.bbox;
                item.bbox = [Math.round(x1 * sx), Math.round(y1 * sy), Math.round(x2 * sx), Math.round(y2 * sy)];
            }
            setPinned(true);
            widthInput.value = width;
            heightInput.value = height;
            setBackground(file, url);
            applyResolution(width, height);
            clampItemsToCanvas();
            renderList();
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            button.classList.add("ml-invalid");
        };
        img.src = url;
    }

    imageInput.addEventListener("change", () => {
        const file = imageInput.files?.[0];
        if (file) loadBackground(file, loadImageBtn);
    });

    async function loadBackgroundFromUrl(src, button) {
        button.classList.remove("ml-invalid");
        if (!src) {
            button.classList.add("ml-invalid");
            return;
        }
        try {
            const res = await fetch(src);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            loadBackground(await res.blob(), button);
        } catch (e) {
            console.error("[MOSS Layout] could not grab the image:", e);
            button.classList.add("ml-invalid");
        }
    }

    // img2img's input canvases, one per sub-tab (img2img, Sketch, Inpaint, Inpaint sketch)
    const I2I_INPUT_IDS = ["img2img_image", "img2img_sketch", "img2maskimg", "inpaint_sketch"];

    function canvasIn(elemId) {
        const target = document.getElementById(elemId);
        if (!target) return null;
        return Object.values(window.forgeCanvasInstances ?? {}).find((c) => target.contains(document.getElementById(`drawingCanvas_${c.uuid}`))) ?? null;
    }

    function img2imgCanvas() {
        return canvasIn("img2img_image");
    }

    // the sub-tab img2img is left on; hidden Gradio tabs carry display:none themselves, even while img2img is hidden
    function activeI2IInputId() {
        return I2I_INPUT_IDS.find((id) => {
            const tabItem = document.getElementById(id)?.closest(".tabitem");
            return tabItem && tabItem.style.display !== "none";
        });
    }

    // the image on img2img's left: the open sub-tab's input, else any input that has one
    function img2imgInputSrc() {
        const active = activeI2IInputId();
        const order = active ? [active, ...I2I_INPUT_IDS.filter((id) => id !== active)] : I2I_INPUT_IDS;
        for (const id of order) {
            const img = canvasIn(id)?.img;
            if (img) return img;
        }
        return null;
    }

    // a tab's finished image (the gallery on the right): the selected thumbnail, else the open preview, else the first result
    function gallerySrc(tabname) {
        const gallery = document.getElementById(`${tabname}_gallery`);
        if (!gallery) return null;
        const img =
            gallery.querySelector(".thumbnail-item.selected img") ??
            gallery.querySelector(".preview img:not(.thumbnail-item img)") ??
            gallery.querySelector(".thumbnail-item img, .grid-wrap img");
        return img?.src || null;
    }

    // stock Forge Neo keeps no list of its canvases, so there only the result can be read
    fromI2IBtn.addEventListener("click", () => loadBackgroundFromUrl(img2imgInputSrc() || gallerySrc("img2img"), fromI2IBtn));
    fromT2IBtn.addEventListener("click", () => loadBackgroundFromUrl(gallerySrc("txt2img"), fromT2IBtn));

    // ----- drop / paste an image onto the canvas -----

    const isImageFile = (f) => f && f.type.startsWith("image/");

    // an image dragged from another page or a Forge gallery comes as a link, not a file
    function droppedImageUrl(dt) {
        const uri = (dt.getData("text/uri-list") || "").split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith("#"));
        if (uri) return uri;
        const html = dt.getData("text/html");
        const m = html && html.match(/<img[^>]+src="([^"]+)"/i);
        return m ? m[1].replace(/&amp;/g, "&") : null;
    }

    let dragDepth = 0;
    canvasSection.addEventListener("dragenter", (ev) => {
        ev.preventDefault();
        dragDepth++;
        canvasSection.classList.add("ml-drop-target");
    });
    canvasSection.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "copy";
    });
    canvasSection.addEventListener("dragleave", () => {
        dragDepth = Math.max(0, dragDepth - 1);
        if (!dragDepth) canvasSection.classList.remove("ml-drop-target");
    });
    canvasSection.addEventListener("drop", (ev) => {
        ev.preventDefault();
        dragDepth = 0;
        canvasSection.classList.remove("ml-drop-target");
        const file = [...(ev.dataTransfer.files ?? [])].find(isImageFile);
        if (file) return loadBackground(file, loadImageBtn);
        const url = droppedImageUrl(ev.dataTransfer);
        if (url) loadBackgroundFromUrl(url, loadImageBtn);
        else loadImageBtn.classList.add("ml-invalid");
    });

    clearImageBtn.addEventListener("click", () => setBackground(null));

    // puts the reference image into img2img's input canvas
    function sendImageToImg2img() {
        if (!bgFile) return;
        const canvas = img2imgCanvas();
        if (!canvas) return;
        const reader = new FileReader();
        reader.addEventListener("load", () => canvas.loadImage(reader.result));
        reader.readAsDataURL(bgFile);
    }

    // ----- canvas sizing -----

    function fitStage() {
        const inset = 32;
        const cw = Math.max(1, canvasSection.clientWidth - inset);
        const ch = Math.max(1, canvasSection.clientHeight - inset);
        const ratio = state.width / state.height;
        let w = cw;
        let hgt = cw / ratio;
        if (hgt > ch) {
            hgt = ch;
            w = ch * ratio;
        }
        stage.style.width = w + "px";
        stage.style.height = hgt + "px";
        clampPan();
        resetView();
    }

    function applyView() {
        stage.style.transform = `translate(${view.panX}px, ${view.panY}px) scale(${view.scale})`;
        stage.style.setProperty("--ml-text-scale", String(1 / Math.max(1, view.scale)));
    }

    function clampAxis(pan, canvasSize, stageSize) {
        const diff = (stageSize - canvasSize) / 2;
        return diff >= 0 ? clamp(pan, -diff, diff) : clamp(pan, diff, -diff);
    }

    function clampPan() {
        const c = canvasSection.getBoundingClientRect();
        const r = stage.getBoundingClientRect();
        view.panX = clampAxis(view.panX, c.width, r.width);
        view.panY = clampAxis(view.panY, c.height, r.height);
    }

    function zoomAt(clientX, clientY, factor) {
        const next = clamp(view.scale * factor, MIN_ZOOM, MAX_ZOOM);
        const ratio = next / view.scale;
        if (ratio === 1) return;
        const r = stage.getBoundingClientRect();
        view.panX += (clientX - (r.left + r.width / 2)) * (1 - ratio);
        view.panY += (clientY - (r.top + r.height / 2)) * (1 - ratio);
        view.scale = next;
        applyView();
        clampPan();
        applyView();
    }

    function resetView() {
        view.scale = 1;
        view.panX = 0;
        view.panY = 0;
        applyView();
    }

    function startPan(e) {
        const sx = e.clientX;
        const sy = e.clientY;
        const px = view.panX;
        const py = view.panY;
        stage.classList.add("ml-panning");
        function move(ev) {
            view.panX = px + (ev.clientX - sx);
            view.panY = py + (ev.clientY - sy);
            clampPan();
            applyView();
        }
        function up() {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            stage.classList.remove("ml-panning");
        }
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    }

    stage.addEventListener(
        "wheel",
        (e) => {
            // the selected box's text scrolls when it overflows, instead of zooming
            const field = e.target.closest?.(".ml-box.ml-selected .ml-field, .ml-box.ml-active .ml-field");
            if (field && field.scrollHeight > field.clientHeight + 1) return;
            e.preventDefault();
            zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.2 : 1 / 1.2);
        },
        { passive: false },
    );

    stage.addEventListener("pointerdown", (e) => {
        if (e.button !== 1) return;
        e.preventDefault();
        startPan(e);
    });

    stage.addEventListener("dblclick", (e) => {
        if (e.target.closest(".ml-box")) return;
        resetView();
    });

    function updateBoxPosition(item) {
        const ref = canvasRefs.get(item.id);
        if (!ref) return;
        const [x1, y1, x2, y2] = item.bbox;
        ref.el.style.left = (x1 / state.width) * 100 + "%";
        ref.el.style.top = (y1 / state.height) * 100 + "%";
        ref.el.style.width = ((x2 - x1) / state.width) * 100 + "%";
        ref.el.style.height = ((y2 - y1) / state.height) * 100 + "%";
    }

    function syncListNums(item) {
        const ref = listRefs.get(item.id);
        if (!ref) return;
        ref.numInputs.forEach((inp, i) => {
            if (document.activeElement !== inp) inp.value = item.bbox[i];
        });
    }

    function makeEditable(item, field) {
        const ta = h("textarea", { class: "ml-field", placeholder: field, readonly: "", spellcheck: "false" });
        ta.value = item[field] || "";
        ta.addEventListener("dblclick", () => {
            ta.readOnly = false;
            ta.focus();
        });
        ta.addEventListener("blur", () => {
            ta.readOnly = true;
        });
        ta.addEventListener("input", () => {
            item[field] = ta.value;
            recordHistory(`${field}:${item.id}`);
            const ref = listRefs.get(item.id);
            if (!ref) return;
            const inp = field === "caption" ? ref.captionInput : ref.textInput;
            if (inp && document.activeElement !== inp) {
                inp.value = ta.value;
                autoGrow(inp);
            }
        });
        return ta;
    }

    // snap guides
    const guideV = h("div", { class: "ml-guide ml-guide-v ml-hidden" });
    const guideH = h("div", { class: "ml-guide ml-guide-h ml-hidden" });
    const SNAP_PX = 6; // on screen

    function showGuides(x, y) {
        guideV.classList.toggle("ml-hidden", x === null);
        guideH.classList.toggle("ml-hidden", y === null);
        if (x !== null) guideV.style.left = (x / state.width) * 100 + "%";
        if (y !== null) guideH.style.top = (y / state.height) * 100 + "%";
    }

    function snapTargetsFor(item) {
        return mlSnapTargets(state.items.filter((it) => it !== item).map((it) => it.bbox), state.width, state.height);
    }

    function startDrag(item, e) {
        const ref = canvasRefs.get(item.id);
        const rect = stage.getBoundingClientRect();
        const scaleX = state.width / rect.width;
        const scaleY = state.height / rect.height;
        const sx = e.clientX;
        const sy = e.clientY;
        const [x1, y1, x2, y2] = item.bbox;
        const w = x2 - x1;
        const hgt = y2 - y1;
        let moved = false;
        const targets = snapTargetsFor(item);

        function move(ev) {
            const dx = (ev.clientX - sx) * scaleX;
            const dy = (ev.clientY - sy) * scaleY;
            if (!moved && Math.hypot(dx, dy) < 3) return;
            moved = true;
            ref.el.classList.add("ml-active");
            let nx1 = clamp(Math.round(x1 + dx), 0, state.width - w);
            let ny1 = clamp(Math.round(y1 + dy), 0, state.height - hgt);
            // edges and centre snap to the canvas and the other boxes; Alt places freely
            let gx = null;
            let gy = null;
            if (!ev.altKey) {
                const snapX = mlSnapOffset([nx1, nx1 + w / 2, nx1 + w], targets.x, SNAP_PX * scaleX);
                const snapY = mlSnapOffset([ny1, ny1 + hgt / 2, ny1 + hgt], targets.y, SNAP_PX * scaleY);
                if (snapX) [nx1, gx] = [clamp(Math.round(nx1 + snapX.delta), 0, state.width - w), snapX.at];
                if (snapY) [ny1, gy] = [clamp(Math.round(ny1 + snapY.delta), 0, state.height - hgt), snapY.at];
            }
            showGuides(gx, gy);
            item.bbox = [nx1, ny1, nx1 + w, ny1 + hgt];
            updateBoxPosition(item);
            syncListNums(item);
        }

        function up() {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            ref.el.classList.remove("ml-active");
            showGuides(null, null);
            if (moved) recordHistory();
        }

        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    }

    // resize from any side or corner (`dir`); Shift keeps the shape
    function startResize(item, e, dir = "se") {
        e.stopPropagation();
        const ref = canvasRefs.get(item.id);
        const rect = stage.getBoundingClientRect();
        const scaleX = state.width / rect.width;
        const scaleY = state.height / rect.height;
        const sx = e.clientX;
        const sy = e.clientY;
        const [x1, y1, x2, y2] = item.bbox;
        ref.el.classList.add("ml-active");
        const targets = snapTargetsFor(item);

        function move(ev) {
            item.bbox = mlResizeBox([x1, y1, x2, y2], dir, (ev.clientX - sx) * scaleX, (ev.clientY - sy) * scaleY, {
                maxW: state.width,
                maxH: state.height,
                min: 16,
                keepAspect: ev.shiftKey,
            });
            // the edge being dragged snaps too (not while Shift keeps the shape, or with Alt)
            let gx = null;
            let gy = null;
            if (!ev.shiftKey && !ev.altKey) {
                const b = item.bbox;
                const xi = dir.includes("e") ? 2 : dir.includes("w") ? 0 : -1;
                const yi = dir.includes("s") ? 3 : dir.includes("n") ? 1 : -1;
                const snapEdge = (i, list, thr, other, lo, hi) => {
                    const r = mlSnapOffset([b[i]], list, thr);
                    const v = r && b[i] + r.delta;
                    if (r && (i === other + 2 ? v - b[other] >= 16 : b[other] - v >= 16) && v >= lo && v <= hi) {
                        b[i] = Math.round(v);
                        return r.at;
                    }
                    return null;
                };
                if (xi >= 0) gx = snapEdge(xi, targets.x, SNAP_PX * scaleX, xi === 2 ? 0 : 2, 0, state.width);
                if (yi >= 0) gy = snapEdge(yi, targets.y, SNAP_PX * scaleY, yi === 3 ? 1 : 3, 0, state.height);
            }
            showGuides(gx, gy);
            updateBoxPosition(item);
            syncListNums(item);
        }

        function up() {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            ref.el.classList.remove("ml-active");
            showGuides(null, null);
            recordHistory();
        }

        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    }

    function createBox(item) {
        const el = h("div", { class: "ml-box", dataset: { id: String(item.id) } });
        // the tag is a dropdown to change the item's type
        const tag = h(
            "select",
            { class: "ml-box-tag", title: "Item type" },
            LABELS.map((label) => h("option", { value: label }, [label])),
        );
        tag.value = item.label;
        tag.addEventListener("change", () => {
            item.label = tag.value;
            renderAll();
        });
        // the item's number, as the prompt counts them (regional LoRA "item N")
        const num = h("span", { class: "ml-box-tag ml-box-num", title: "Item number in the prompt" }, [`#${state.items.indexOf(item) + 1}`]);
        el.appendChild(h("div", { class: "ml-box-head" }, [num, tag]));

        const caption = makeEditable(item, "caption");
        el.appendChild(caption);

        let text = null;
        if (item.label === "text") {
            text = makeEditable(item, "text");
            text.classList.add("ml-box-text");
            el.appendChild(text);
        }

        // delete button in the top-right corner
        const trash = h("button", { type: "button", class: "ml-box-trash", title: "Delete this box" });
        trash.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
        trash.addEventListener("pointerdown", (ev) => ev.stopPropagation());
        trash.addEventListener("click", (ev) => {
            ev.stopPropagation();
            removeItem(item.id);
        });
        el.appendChild(trash);

        // duplicate button, left of the trash button
        const copy = h("button", { type: "button", class: "ml-box-copy", title: "Duplicate this box" });
        copy.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>';
        copy.addEventListener("pointerdown", (ev) => ev.stopPropagation());
        copy.addEventListener("click", (ev) => {
            ev.stopPropagation();
            duplicateItem(item.id);
        });
        el.appendChild(copy);

        // LoRA picker along the box's bottom edge, same as the row's button
        const boxLora = h("button", { type: "button", class: "ml-box-lora", title: "Add a LoRA to this item's caption" }, ["+ LoRA"]);
        boxLora.addEventListener("pointerdown", (ev) => ev.stopPropagation());
        boxLora.addEventListener("click", (ev) => {
            ev.stopPropagation();
            pickLoraForItem(item);
        });
        el.appendChild(boxLora);

        // a handle on every side and corner
        for (const dir of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
            const handle = h("div", { class: `ml-box-handle ml-h-${dir}` });
            handle.addEventListener("pointerdown", (ev) => {
                if (ev.button !== 0) return;
                bringToFront(item.id);
                selectBox(item.id);
                startResize(item, ev, dir);
            });
            el.appendChild(handle);
        }

        el.addEventListener("pointerdown", (ev) => {
            if (ev.button !== 0) return;
            bringToFront(item.id);
            selectBox(item.id);
            if (ev.target.classList.contains("ml-box-handle")) return;
            if (ev.target === tag) return;
            if (ev.target.tagName === "TEXTAREA" && !ev.target.readOnly) return;
            ev.preventDefault();
            startDrag(item, ev);
        });

        if (item.id === selectedId) el.classList.add("ml-selected");
        canvasRefs.set(item.id, { el, caption, text });
        updateBoxPosition(item);
        return el;
    }

    // the clicked box goes on top of the others, so its text can be
    // reached when boxes overlap. z-index stays 1..n (below the builder's modals).
    function applyStacking() {
        const ids = new Set(state.items.map((it) => it.id));
        stackOrder = stackOrder.filter((id) => ids.has(id));
        for (const it of state.items) if (!stackOrder.includes(it.id)) stackOrder.push(it.id);
        stackOrder.forEach((id, i) => {
            const ref = canvasRefs.get(id);
            if (ref) ref.el.style.zIndex = String(i + 1);
        });
    }

    // the box the keyboard shortcuts act on
    function selectBox(id) {
        selectedId = id;
        for (const [rid, ref] of canvasRefs) ref.el.classList.toggle("ml-selected", rid === id);
    }

    function bringToFront(id) {
        stackOrder = stackOrder.filter((x) => x !== id);
        stackOrder.push(id);
        applyStacking();
    }

    function renderCanvas() {
        stage.textContent = "";
        stage.appendChild(bgEl);
        canvasRefs.clear();
        for (const item of state.items) stage.appendChild(createBox(item));
        stage.append(guideV, guideH);
        applyStacking();
    }

    // ----- list -----

    function createRow(item) {
        const row = h("div", { class: "ml-item", dataset: { id: String(item.id) } });

        const top = h("div", { class: "ml-item-top" });
        const radios = LABELS.map((label) => {
            const id = `ml-${item.id}-${label}`;
            const radio = h("input", {
                type: "radio",
                name: `ml-label-${item.id}`,
                value: label,
                id,
                checked: item.label === label,
            });
            radio.addEventListener("change", () => {
                if (radio.checked) {
                    item.label = label;
                    renderAll();
                }
            });
            return h("label", { class: "ml-radio", for: id }, [radio, label]);
        });
        top.append(h("span", { class: "ml-item-num", title: "Item number in the prompt" }, [`#${state.items.indexOf(item) + 1}`]));
        top.append(...radios);

        const remove = h("button", { type: "button", class: "ml-remove", title: "Remove" }, ["\u00D7"]);
        remove.addEventListener("click", () => removeItem(item.id));
        // LoRA picker for this item's caption
        const itemLoraBtn = h("button", { type: "button", class: "ml-item-lora", title: "Add a LoRA to this item's caption" }, ["+ LoRA"]);
        // MOSS tags and palette for this box, each behind a toggle (lit when the list has entries)
        const fieldBtns = [];
        const fieldPanels = [];
        for (const [key, label, make] of [["tags", "Tags", chipEditor], ["palette", "Palette", paletteEditor]]) {
            const btn = h("button", { type: "button", class: `ml-item-field ml-item-${key}`, "aria-pressed": "false" }, [label]);
            const editor = make(item[key], (list) => {
                item[key] = list;
                btn.classList.toggle("ml-has", list.length > 0);
                recordHistory(); // each tag / colour change is its own undo step
            });
            const panel = h("div", { class: `ml-item-fieldpanel ml-item-${key}-panel` }, [h("span", { class: "ml-fld-label" }, [label]), editor.el]);
            const openKey = `${item.id}:${key}`;
            const show = (open) => {
                panel.classList.toggle("ml-hidden", !open);
                btn.setAttribute("aria-pressed", String(open));
                if (open) openFields.add(openKey);
                else openFields.delete(openKey);
            };
            show(openFields.has(openKey) || item[key].length > 0);
            btn.classList.toggle("ml-has", item[key].length > 0);
            btn.addEventListener("click", () => show(panel.classList.contains("ml-hidden")));
            fieldBtns.push(btn);
            fieldPanels.push(panel);
        }
        top.append(...fieldBtns, itemLoraBtn, remove);
        row.appendChild(top);

        const caption = h("textarea", { class: "ml-item-caption", placeholder: "caption", rows: "1", value: item.caption });
        caption.addEventListener("input", () => {
            item.caption = caption.value;
            recordHistory(`caption:${item.id}`);
            autoGrow(caption);
            const ref = canvasRefs.get(item.id);
            if (ref && document.activeElement !== ref.caption) ref.caption.value = caption.value;
        });
        row.appendChild(caption);
        row.append(...fieldPanels);
        addGrowable(caption);
        itemLoraBtn.addEventListener("click", () => pickLoraForItem(item));

        let textInput = null;
        if (item.label === "text") {
            // the words drawn in the image: edited most, so a tall box that scrolls and can be dragged taller
            textInput = h("textarea", { class: "ml-item-text", placeholder: "text", rows: "6", value: item.text });
            textInput.addEventListener("input", () => {
                item.text = textInput.value;
                recordHistory(`text:${item.id}`);
                const ref = canvasRefs.get(item.id);
                if (ref?.text && document.activeElement !== ref.text) ref.text.value = textInput.value;
            });
            row.appendChild(textInput);
        }

        const placeholders = ["x1", "y1", "x2", "y2"];
        const nums = h("div", { class: "ml-item-nums" });
        const numInputs = item.bbox.map((value, i) => {
            const inp = h("input", { type: "number", class: "ml-num", placeholder: placeholders[i], value });
            inp.addEventListener("input", () => {
                const v = parseFloat(inp.value);
                if (!Number.isNaN(v)) {
                    item.bbox[i] = v;
                    updateBoxPosition(item);
                    recordHistory(`bbox:${item.id}`);
                }
            });
            // on leaving the field, put corners in order and the box inside the canvas
            inp.addEventListener("change", () => {
                item.bbox = mlFixBox(item.bbox, state.width, state.height, 16);
                numInputs.forEach((n, j) => (n.value = item.bbox[j]));
                updateBoxPosition(item);
                recordHistory(`bbox:${item.id}`);
            });
            nums.appendChild(inp);
            return inp;
        });
        row.appendChild(nums);

        listRefs.set(item.id, { row, captionInput: caption, textInput, numInputs });
        return row;
    }

    function renderList() {
        listEl.textContent = "";
        listRefs.clear();
        pruneGrowables();
        for (const item of state.items) listEl.appendChild(createRow(item));
    }

    function renderAll() {
        renderList();
        renderCanvas();
        recordHistory();
    }

    // undo / redo
    function updateUndoButtons() {
        undoBtn.disabled = !undoHistory.canUndo();
        redoBtn.disabled = !undoHistory.canRedo();
    }

    function restoreItems(snap) {
        if (snap === null) return;
        restoring = true;
        const saved = JSON.parse(snap);
        state.items = saved.items;
        if (saved.width !== state.width || saved.height !== state.height) {
            setPinned(true);
            widthInput.value = saved.width;
            heightInput.value = saved.height;
            state.width = saved.width;
            state.height = saved.height;
            fitStage();
        }
        idCounter = Math.max(idCounter, ...state.items.map((it) => it.id));
        if (!state.items.some((it) => it.id === selectedId)) selectedId = null;
        renderAll();
        restoring = false;
        updateUndoButtons();
    }

    undoBtn.addEventListener("click", () => restoreItems(undoHistory.undo()));
    redoBtn.addEventListener("click", () => restoreItems(undoHistory.redo()));

    function addItem() {
        state.items.push(newItem());
        renderAll();
    }

    function removeItem(id) {
        const index = state.items.findIndex((it) => it.id === id);
        if (index >= 0) state.items.splice(index, 1);
        if (state.items.length === 0) state.items.push(newItem());
        renderAll();
    }

    // copy a box (type, caption, text, size), offset so it doesn't sit on top
    function duplicateItem(id) {
        const index = state.items.findIndex((it) => it.id === id);
        if (index < 0) return;
        const src = state.items[index];
        const [x1, y1, x2, y2] = src.bbox;
        const w = x2 - x1;
        const ht = y2 - y1;
        const off = Math.max(16, Math.round(Math.min(state.width, state.height) * 0.04));
        const nx1 = clamp(x1 + off, 0, Math.max(0, state.width - w));
        const ny1 = clamp(y1 + off, 0, Math.max(0, state.height - ht));
        const copy = { ...src, tags: [...src.tags], palette: [...src.palette], id: ++idCounter, // own lists
            bbox: [nx1, ny1, nx1 + w, ny1 + ht] };
        state.items.splice(index + 1, 0, copy);
        selectedId = copy.id; // the copy is the one the keys move next
        bringToFront(copy.id);
        renderAll();
    }

    function clearItems() {
        state.items = [newItem()];
        renderAll();
    }

    // ----- inputs -----

    // default to the txt2img resolution until the user sets one here
    let resPinned = false;

    // every change of the follow state goes through here, so the marker is always right
    function setPinned(pinned) {
        resPinned = pinned;
        followMark.textContent = pinned ? "pinned" : "following txt2img";
        followMark.classList.toggle("ml-pinned", pinned);
        followBtn.classList.toggle("ml-hidden", !pinned);
    }
    setPinned(false);
    followBtn.addEventListener("click", () => {
        setPinned(false);
        syncFromTxt2img();
    });

    function syncFromTxt2img() {
        if (resPinned) return;
        const w = mlSnap16(parseInt(t2i_width.value, 10)); // txt2img allows multiples of 8; the prompt needs 16
        const hgt = mlSnap16(parseInt(t2i_height.value, 10));
        if (w === null || hgt === null || (w === state.width && hgt === state.height)) return;
        widthInput.value = w;
        heightInput.value = hgt;
        applyResolution(w, hgt);
        clampItemsToCanvas();
    }

    function applyResolution(w, h) {
        state.width = w;
        state.height = h;
        fitStage();
        renderCanvas();
    }

    function clampItemsToCanvas() {
        for (const item of state.items) {
            const bw = Math.min(item.bbox[2] - item.bbox[0], state.width);
            const bh = Math.min(item.bbox[3] - item.bbox[1], state.height);
            const x1 = clamp(item.bbox[0], 0, state.width - bw);
            const y1 = clamp(item.bbox[1], 0, state.height - bh);
            item.bbox = [x1, y1, x1 + bw, y1 + bh];
            syncListNums(item);
        }
        renderCanvas();
        recordHistory();
    }

    widthInput.addEventListener("input", () => {
        setPinned(true);
        const v = parseInt(widthInput.value, 10);
        if (v > 0) applyResolution(v, state.height);
    });
    widthInput.addEventListener("change", () => snapResolution(widthInput));

    heightInput.addEventListener("input", () => {
        setPinned(true);
        const v = parseInt(heightInput.value, 10);
        if (v > 0) applyResolution(state.width, v);
    });
    heightInput.addEventListener("change", () => snapResolution(heightInput));

    // the prompt needs multiples of 16, so a typed 1000 becomes 1008 (it would fail at Send)
    function snapResolution(input) {
        const v = mlSnap16(parseInt(input.value, 10));
        input.value = v === null ? (input === widthInput ? state.width : state.height) : v;
        applyResolution(parseInt(widthInput.value, 10), parseInt(heightInput.value, 10));
        clampItemsToCanvas();
    }

    // swap width and height
    swapResBtn.addEventListener("click", () => {
        setPinned(true);
        const w = state.width;
        const hgt = state.height;
        widthInput.value = hgt;
        heightInput.value = w;
        applyResolution(hgt, w);
        clampItemsToCanvas();
    });

    setResBtn.addEventListener("click", () => {
        const mp = parseFloat(mpInput.value);
        if (!(mp > 0)) return;
        setPinned(true);
        const [aw, ah] = arSelect.value.split(":").map(Number);
        const area = mp * MP_PIXELS;
        const w = Math.sqrt((area * aw) / ah);
        const hgt = area / w;
        const width = round16(w);
        const height = round16(hgt);
        widthInput.value = width;
        heightInput.value = height;
        applyResolution(width, height);
        clampItemsToCanvas();
    });

    sumCaption.addEventListener("input", () => {
        state.summary.caption = sumCaption.value;
        autoGrow(sumCaption);
        saveLayout();
    });
    sumMeta.addEventListener("input", () => {
        state.summary.meta = sumMeta.value;
        saveLayout();
    });
    sumExtra.addEventListener("input", () => {
        state.summary.extra = sumExtra.value;
        autoGrow(sumExtra);
        saveLayout();
    });

    addBtn.addEventListener("click", addItem);
    clearBtn.addEventListener("click", clearItems);

    // ----- submit -----

    function buildJson() {
        const meta = state.summary.meta
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        const summary = {};
        if (meta.length) summary.meta = meta;
        summary.canvas = state.summary.canvas;
        summary.caption = state.summary.caption;
        if (state.summary.palette.length) summary.palette = state.summary.palette;
        return {
            width: state.width,
            height: state.height,
            bbox_coord_space: "abs",
            bbox_format: "xyxy",
            summary,
            items: state.items.map((item) => {
                const out = { label: item.label, caption: item.caption, bbox: item.bbox.map((n) => Math.round(n)) };
                if (item.label === "text") out.text = item.text;
                if (item.tags.length) out.tags = item.tags; // MOSS reads these per box
                if (item.palette.length) out.palette = item.palette;
                return out;
            }),
        };
    }

    function validate() {
        root.querySelectorAll(".ml-invalid").forEach((el) => {
            el.classList.remove("ml-invalid");
        });
        const invalid = [];

        if (state.summary.caption.trim() === "") invalid.push(sumCaption);

        for (const item of state.items) {
            const list = listRefs.get(item.id);
            const canvas = canvasRefs.get(item.id);

            if (item.caption.trim() === "") {
                if (list) invalid.push(list.captionInput);
                if (canvas) invalid.push(canvas.caption);
            }
            if (item.label === "text" && item.text.trim() === "") {
                if (list?.textInput) invalid.push(list.textInput);
                if (canvas?.text) invalid.push(canvas.text);
            }
        }

        invalid.forEach((el) => {
            el.classList.add("ml-invalid");
        });
        return invalid.length === 0;
    }

    function submit(which) {
        if (!validate()) return;
        let prompt = null;

        try {
            prompt = mlCompilePrompt(JSON.stringify(buildJson()));
        } catch (e) {
            alert(e);
            return;
        }

        if (state.summary.extra.trim() !== "") {
            prompt += "\n" + state.summary.extra;
        }

        const promptEl = which === "t2i" ? t2i_prompt : i2i_prompt;
        const widthEl = which === "t2i" ? t2i_width : i2i_width;
        const heightEl = which === "t2i" ? t2i_height : i2i_height;

        promptEl.value = prompt.replaceAll("\n", " ");
        widthEl.value = state.width;
        heightEl.value = state.height;
        updateInput(promptEl);
        updateInput(widthEl);
        updateInput(heightEl);
        if (which === "t2i") setPinned(false); // sizes match again, resume following txt2img

        if (which === "t2i") switch_to_txt2img();
        else {
            switch_to_img2img();
            sendImageToImg2img();
        }
    }

    sendT2I.addEventListener("click", () => submit("t2i"));
    sendI2I.addEventListener("click", () => submit("i2i"));

    // ----- init -----

    // open blank; Restore last session brings back the layout saved before this page
    // loaded (read once here, so autosaves made since don't change what it restores)
    const lastSession = mlSavedLayout(storeGet(LAYOUT_KEY));
    restoreBtn.disabled = !lastSession;
    restoreBtn.addEventListener("click", () => {
        if (!lastSession) return;
        const meta = lastSession.summary.meta.trim();
        selectedId = null;
        loadDraft({ ...lastSession, summary: { ...lastSession.summary, meta: meta ? [meta] : [] }, extra: lastSession.summary.extra }); // renders, and is one undo step
    });
    renderAll();
    undoHistory.reset(itemsSnapshot()); // the starting boxes are not an undo step
    updateUndoButtons();
    syncFromTxt2img();

    // keyboard shortcuts while the MOSS Layout is showing and no field is being typed in
    stage.addEventListener("pointerdown", (ev) => {
        if (ev.button === 0 && !ev.target.closest(".ml-box")) selectBox(null);
    });

    function isTyping(t) {
        if (t.isContentEditable || t.tagName === "SELECT") return true;
        if (t.tagName === "TEXTAREA") return !t.readOnly;
        if (t.tagName === "INPUT") return !["radio", "checkbox", "range", "button", "file"].includes(t.type);
        return false;
    }

    let lastPointerInPanel = false; // where the last click was, side panel or elsewhere
    document.addEventListener("pointerdown", (ev) => (lastPointerInPanel = side.contains(ev.target)), true);

    // Ctrl+V with an image on the clipboard: the tab is open, no window is up, and the focus is not in a text field
    document.addEventListener("paste", (ev) => {
        if (!root.isConnected || root.offsetParent === null) return;
        if (!modal.classList.contains("ml-hidden") || !loraModal.classList.contains("ml-hidden")) return;
        const t = ev.target;
        if (!(t === document.body || root.contains(t)) || isTyping(t)) return;
        const file = [...(ev.clipboardData?.items ?? [])].filter((it) => it.kind === "file").map((it) => it.getAsFile()).find(isImageFile);
        if (!file) return;
        ev.preventDefault();
        loadBackground(file, loadImageBtn);
    });

    document.addEventListener("keydown", (ev) => {
        if (!root.isConnected || root.offsetParent === null) return;
        // Esc closes an open window, even while typing in it
        if (ev.key === "Escape" && !loraModal.classList.contains("ml-hidden")) {
            closeLoraPicker();
            ev.preventDefault();
            return;
        }
        if (ev.key === "Escape" && !modal.classList.contains("ml-hidden")) {
            closeDialog();
            ev.preventDefault();
            return;
        }
        if (!modal.classList.contains("ml-hidden") || !loraModal.classList.contains("ml-hidden")) return;
        const t = ev.target;
        if (!(t === document.body || root.contains(t)) || isTyping(t)) return;
        const ctrl = ev.ctrlKey || ev.metaKey;
        const key = ev.key.toLowerCase();
        // after a click in the side panel (a button, a tag ✕ or a colour swatch, which may
        // vanish and leave the focus on the page), Delete / arrows / Ctrl+D must not act on the canvas box
        const fromPanel = side.contains(t) || (t === document.body && lastPointerInPanel);
        const item = fromPanel ? null : state.items.find((it) => it.id === selectedId);

        if (ctrl && key === "z") {
            restoreItems(ev.shiftKey ? undoHistory.redo() : undoHistory.undo());
        } else if (ctrl && key === "y") {
            restoreItems(undoHistory.redo());
        } else if (ctrl && key === "d" && item) {
            duplicateItem(item.id);
        } else if (ev.key === "Delete" && item && !ctrl) {
            selectedId = null;
            removeItem(item.id);
        } else if (ev.key === "Escape" && selectedId !== null) {
            selectBox(null);
        } else if (ev.key.startsWith("Arrow") && item && !ctrl) {
            const step = ev.shiftKey ? 64 : 8;
            const dx = ev.key === "ArrowLeft" ? -step : ev.key === "ArrowRight" ? step : 0;
            const dy = ev.key === "ArrowUp" ? -step : ev.key === "ArrowDown" ? step : 0;
            item.bbox = mlMoveBox(item.bbox, dx, dy, state.width, state.height);
            updateBoxPosition(item);
            syncListNums(item);
            recordHistory(`move:${item.id}`);
        } else {
            return;
        }
        ev.preventDefault();
    });
    addGrowable(charDesc); // characters
    setFolded(storeGet("ml-char-folded") === "1");
    setAdvOpen(storeGet("ml-char-adv-open") === "1");
    loadCharFiles();
    fitStage();
    requestAnimationFrame(fitStage);
    // re-read txt2img's resolution each time this tab is shown
    if (window.IntersectionObserver)
        new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) syncFromTxt2img();
        }).observe(tab);
    if (window.ResizeObserver) new ResizeObserver(fitStage).observe(canvasSection);
});
