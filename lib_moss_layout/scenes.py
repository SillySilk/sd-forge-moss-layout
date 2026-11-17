# saved layouts ("scenes") for the MOSS Layout: plain .json files in JSONscenes/, subfolders allowed.
# Paths are always relative to that folder and use "/" between parts.
import json
import os
import re
import tempfile

EXT = ".json"
MAX_DEPTH = 4  # folder levels below JSONscenes/
# Windows-safe part: no reserved characters, no control characters, no trailing dot or space
PART_RE = re.compile(r'^[^<>:"/\\|?*\x00-\x1f]{1,120}$')
RESERVED = {"con", "prn", "aux", "nul", *(f"com{i}" for i in range(1, 10)), *(f"lpt{i}" for i in range(1, 10))}


class SceneError(Exception):
    """A problem the user can fix; the message is shown to them."""


class SceneNotFound(SceneError):
    pass


class SceneExists(SceneError):
    pass


def normalize_path(path: str) -> str:
    """'Folder/Name' or 'Folder\\Name.json' -> 'Folder/Name.json', or raise SceneError."""
    path = (path or "").strip().replace("\\", "/").strip("/")
    if path.lower().endswith(EXT):
        path = path[: -len(EXT)]
    parts = [p.strip() for p in path.split("/")]
    if not parts or not parts[-1]:
        raise SceneError("The name is empty.")
    if len(parts) > MAX_DEPTH + 1:
        raise SceneError(f"At most {MAX_DEPTH} folder levels.")
    for p in parts:
        if p in ("", ".", "..") or not PART_RE.match(p) or p.endswith((".", " ")) or p.split(".")[0].lower() in RESERVED:
            raise SceneError(f"'{p}' can't be used as a name. Avoid < > : \" \\ | ? * and a trailing dot.")
    return "/".join(parts) + EXT


class SceneStore:
    def __init__(self, folder: str):
        self.folder = os.path.abspath(folder)
        os.makedirs(self.folder, exist_ok=True)

    def _path(self, rel: str) -> str:
        full = os.path.abspath(os.path.join(self.folder, *rel.split("/")))
        if os.path.commonpath([full, self.folder]) != self.folder:
            raise SceneError("That path is outside the scenes folder.")
        return full

    def list(self) -> list[str]:
        out = []
        for dirpath, dirnames, filenames in os.walk(self.folder):
            dirnames.sort(key=str.lower)
            rel_dir = os.path.relpath(dirpath, self.folder).replace("\\", "/")
            for n in filenames:
                if n.lower().endswith(EXT):
                    out.append(n if rel_dir == "." else f"{rel_dir}/{n}")
        return sorted(out, key=lambda p: (p.count("/"), p.lower()))

    def read(self, path: str) -> dict:
        rel = normalize_path(path)
        full = self._path(rel)
        if not os.path.isfile(full):
            raise SceneNotFound(f"{rel} does not exist.")
        try:
            with open(full, encoding="utf-8") as f:
                content = f.read()
        except OSError as e:
            raise SceneError(f"{rel} could not be read: {e}") from e
        return {"path": rel, "content": content}

    def save(self, path: str, content: str, overwrite: bool = False) -> dict:
        rel = normalize_path(path)
        full = self._path(rel)
        try:
            json.loads(content)
        except (TypeError, ValueError) as e:
            raise SceneError(f"Not valid JSON: {e}") from e
        if os.path.exists(full) and not overwrite:
            raise SceneExists(f"{rel} already exists.")
        os.makedirs(os.path.dirname(full), exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(full), suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
                f.write(content)
                if not content.endswith("\n"):
                    f.write("\n")
            os.replace(tmp, full)
        except BaseException:
            if os.path.exists(tmp):
                os.remove(tmp)
            raise
        return {"path": rel, "files": self.list()}
