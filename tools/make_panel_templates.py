# Writes the multi-panel starter layouts into JSONscenes/Templates/.
# Run with any Python 3: python tools/make_panel_templates.py
# Each template only lays out the page: the panel boxes, a page caption that names every panel and
# where it sits, and "[FILL IN ...]" spots for the story, style and each panel's content.
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "JSONscenes", "Templates")

MARGIN = 24  # page border, px
GUTTER = 16  # gap between panels, px

# every template is one 1280 x 1280 page (the owner's working size); the arrangement alone sets the panel shapes
PAGE = (1280, 1280)

# name, page size, arrangement in words, panels as (x0, y0, x1, y1) fractions of the page inside the border + where it sits
TEMPLATES = [
    ("2 panels - side by side", PAGE, "two equal panels side by side", [
        ((0, 0, 1 / 2, 1), "the left half of the page"),
        ((1 / 2, 0, 1, 1), "the right half of the page"),
    ]),
    ("2 panels - stacked", PAGE, "two equal panels, one above the other", [
        ((0, 0, 1, 1 / 2), "the top half of the page"),
        ((0, 1 / 2, 1, 1), "the bottom half of the page"),
    ]),
    ("2 panels - big left, narrow right", PAGE, "a large panel on the left and a narrow panel on the right", [
        ((0, 0, 2 / 3, 1), "the large panel filling the left two thirds of the page"),
        ((2 / 3, 0, 1, 1), "the narrow panel filling the right third of the page"),
    ]),
    ("3 panels - three across", PAGE, "three equal tall panels side by side", [
        ((0, 0, 1 / 3, 1), "the left third of the page"),
        ((1 / 3, 0, 2 / 3, 1), "the middle third of the page"),
        ((2 / 3, 0, 1, 1), "the right third of the page"),
    ]),
    ("3 panels - three rows", PAGE, "three equal wide panels stacked from top to bottom", [
        ((0, 0, 1, 1 / 3), "the top row of the page"),
        ((0, 1 / 3, 1, 2 / 3), "the middle row of the page"),
        ((0, 2 / 3, 1, 1), "the bottom row of the page"),
    ]),
    ("3 panels - big left, two right", PAGE, "one large panel on the left and two smaller panels stacked on the right", [
        ((0, 0, 1 / 2, 1), "the large panel filling the left half of the page"),
        ((1 / 2, 0, 1, 1 / 2), "the top right of the page"),
        ((1 / 2, 1 / 2, 1, 1), "the bottom right of the page"),
    ]),
    ("3 panels - wide top, two below", PAGE, "one wide panel across the top and two panels side by side below it", [
        ((0, 0, 1, 1 / 2), "the wide panel across the top half of the page"),
        ((0, 1 / 2, 1 / 2, 1), "the bottom left of the page"),
        ((1 / 2, 1 / 2, 1, 1), "the bottom right of the page"),
    ]),
    ("3 panels - two on top, wide below", PAGE, "two panels side by side on top and one wide panel across the bottom", [
        ((0, 0, 1 / 2, 1 / 2), "the top left of the page"),
        ((1 / 2, 0, 1, 1 / 2), "the top right of the page"),
        ((0, 1 / 2, 1, 1), "the wide panel across the bottom half of the page"),
    ]),
    ("4 panels - 2x2 grid", PAGE, "four equal panels in a two by two grid", [
        ((0, 0, 1 / 2, 1 / 2), "the top left of the page"),
        ((1 / 2, 0, 1, 1 / 2), "the top right of the page"),
        ((0, 1 / 2, 1 / 2, 1), "the bottom left of the page"),
        ((1 / 2, 1 / 2, 1, 1), "the bottom right of the page"),
    ]),
    ("4 panels - four rows", PAGE, "four equal wide panels stacked from top to bottom", [
        ((0, 0, 1, 1 / 4), "the first row, at the top of the page"),
        ((0, 1 / 4, 1, 1 / 2), "the second row from the top"),
        ((0, 1 / 2, 1, 3 / 4), "the third row from the top"),
        ((0, 3 / 4, 1, 1), "the last row, at the bottom of the page"),
    ]),
    ("4 panels - wide top, three below", PAGE, "one wide panel across the top and three panels side by side below it", [
        ((0, 0, 1, 1 / 2), "the wide panel across the top half of the page"),
        ((0, 1 / 2, 1 / 3, 1), "the bottom left of the page"),
        ((1 / 3, 1 / 2, 2 / 3, 1), "the bottom middle of the page"),
        ((2 / 3, 1 / 2, 1, 1), "the bottom right of the page"),
    ]),
    ("4 panels - big left, three right", PAGE, "one large panel on the left and three smaller panels stacked on the right", [
        ((0, 0, 3 / 5, 1), "the large panel filling the left of the page"),
        ((3 / 5, 0, 1, 1 / 3), "the top right of the page"),
        ((3 / 5, 1 / 3, 1, 2 / 3), "the middle right of the page"),
        ((3 / 5, 2 / 3, 1, 1), "the bottom right of the page"),
    ]),
    ("5 panels - two over three", PAGE, "two panels side by side on top and three panels side by side below them", [
        ((0, 0, 1 / 2, 1 / 2), "the top left of the page"),
        ((1 / 2, 0, 1, 1 / 2), "the top right of the page"),
        ((0, 1 / 2, 1 / 3, 1), "the bottom left of the page"),
        ((1 / 3, 1 / 2, 2 / 3, 1), "the bottom middle of the page"),
        ((2 / 3, 1 / 2, 1, 1), "the bottom right of the page"),
    ]),
    ("5 panels - three over two", PAGE, "three panels side by side on top and two panels side by side below them", [
        ((0, 0, 1 / 3, 1 / 2), "the top left of the page"),
        ((1 / 3, 0, 2 / 3, 1 / 2), "the top middle of the page"),
        ((2 / 3, 0, 1, 1 / 2), "the top right of the page"),
        ((0, 1 / 2, 1 / 2, 1), "the bottom left of the page"),
        ((1 / 2, 1 / 2, 1, 1), "the bottom right of the page"),
    ]),
    ("5 panels - wide top, 2x2 below", PAGE, "one wide panel across the top and four panels in a two by two grid below it", [
        ((0, 0, 1, 1 / 3), "the wide panel across the top of the page"),
        ((0, 1 / 3, 1 / 2, 2 / 3), "the middle left of the page"),
        ((1 / 2, 1 / 3, 1, 2 / 3), "the middle right of the page"),
        ((0, 2 / 3, 1 / 2, 1), "the bottom left of the page"),
        ((1 / 2, 2 / 3, 1, 1), "the bottom right of the page"),
    ]),
]

NUMBER_WORDS = {2: "two", 3: "three", 4: "four", 5: "five"}


def edge(frac: float, size: int, low: bool) -> int:
    """A panel edge in px: the page border on the outside, half a gutter on each side of an inner seam."""
    inner = size - 2 * MARGIN
    pos = MARGIN + frac * inner
    if 0 < frac < 1:
        pos += GUTTER / 2 if low else -GUTTER / 2
    return round(pos)


def build(name, size, arrangement, panels):
    width, height = size
    n = len(panels)
    where = " ".join(f"Panel {i} is {pos}." for i, (_, pos) in enumerate(panels, 1))
    caption = (
        f"A comic page with {NUMBER_WORDS[n]} panels: {arrangement}. "
        "Each panel has a thin black border, and the panels are separated by narrow white gutters. "
        f"{where} "
        f"The panels are read in order from panel 1 to panel {n}. "
        "[FILL IN: the story across the panels, the characters, the setting and the art style.]"
    )
    items = []
    for i, ((x0, y0, x1, y1), pos) in enumerate(panels, 1):
        bbox = [edge(x0, width, True), edge(y0, height, True), edge(x1, width, False), edge(y1, height, False)]
        items.append({
            "label": "object",
            "caption": f"Panel {i}, {pos}: [FILL IN: what this panel shows]",
            "bbox": bbox,
        })
    return {
        "width": width,
        "height": height,
        "bbox_coord_space": "abs",
        "bbox_format": "xyxy",
        "summary": {"canvas": "multi_panel", "caption": caption},
        "items": items,
    }


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, size, arrangement, panels in TEMPLATES:
        with open(os.path.join(OUT, name + ".json"), "w", encoding="utf-8", newline="\n") as f:
            json.dump(build(name, size, arrangement, panels), f, indent=2)
            f.write("\n")
    print(f"wrote {len(TEMPLATES)} templates to {OUT}")


if __name__ == "__main__":
    main()
