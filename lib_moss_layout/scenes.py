# saved layouts ("scenes") for the MOSS Layout: plain .json files in JSONscenes/, subfolders allowed.
# Paths are always relative to that folder and use "/" between parts.
import json
import os
import re
import subprocess
import sys
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


# Runs in its own process: Tk must own its thread, and Forge's server threads are not that.
_PICKER = r"""
import json, sys, tkinter as tk
from tkinter import filedialog
root = tk.Tk()
root.withdraw()
root.attributes("-topmost", True)  # in front of the browser
root.lift()
root.focus_force()
path = filedialog.askopenfilename(parent=root, title="Load JSON", initialdir=sys.argv[1],
                                  filetypes=[("Layouts", "*.json"), ("All files", "*.*")])
root.destroy()
print(json.dumps(path or ""))
"""


def ask_open_file(initial_dir: str) -> str:
    """Show the Windows Open dialog at initial_dir; the chosen file's full path, or "" if cancelled."""
    flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    done = subprocess.run([sys.executable, "-c", _PICKER, initial_dir], capture_output=True, text=True, creationflags=flags)
    lines = done.stdout.strip().splitlines()
    if done.returncode != 0 or not lines:
        why = (done.stderr.strip().splitlines() or [f"exit code {done.returncode}"])[-1]
        raise SceneError(f"The file dialog could not open: {why}")
    path = json.loads(lines[-1])
    return os.path.normpath(path) if path else ""


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

    def start_dir(self, path: str = "") -> str:
        """The folder the Open dialog starts in: that of the last scene if it still exists, else JSONscenes."""
        try:
            folder = os.path.dirname(self._path(normalize_path(path))) if path else self.folder
        except SceneError:
            folder = self.folder
        return folder if os.path.isdir(folder) else self.folder

    def read_file(self, full: str) -> dict:
        """Read a file picked anywhere on the PC. path is its JSONscenes path, or "" when it lies outside."""
        full = os.path.abspath(full)
        try:
            with open(full, encoding="utf-8") as f:
                content = f.read()
        except OSError as e:
            raise SceneError(f"{os.path.basename(full)} could not be read: {e}") from e
        try:
            inside = os.path.commonpath([full, self.folder]) == self.folder
        except ValueError:  # another drive
            inside = False
        rel = os.path.relpath(full, self.folder).replace("\\", "/") if inside else ""
        return {"path": rel, "name": os.path.basename(full), "content": content}

    def pick(self, start: str = "", ask=ask_open_file) -> dict:
        """Let the user choose a file in the Windows Open dialog, starting in JSONscenes."""
        full = ask(self.start_dir(start))
        if not full:
            return {"cancelled": True}
        return self.read_file(full)
