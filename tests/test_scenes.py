# saved-layout (JSONscenes) store tests. Run with the venv python, no pytest needed.
import os
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from lib_moss_layout.scenes import SceneError, SceneExists, SceneNotFound, SceneStore, normalize_path  # noqa: E402

LAYOUT = '{"width": 1024, "height": 1024, "summary": {"caption": "a red ball on a table"}, "items": []}'


class SceneTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.folder = os.path.join(self.tmp.name, "JSONscenes")
        self.store = SceneStore(self.folder)

    def tearDown(self):
        self.tmp.cleanup()

    def test_folder_is_created(self):
        self.assertTrue(os.path.isdir(self.folder))

    def test_normalize(self):
        self.assertEqual(normalize_path("Story A/01 Opening"), "Story A/01 Opening.json")
        self.assertEqual(normalize_path(" Story A\\01 Opening.json "), "Story A/01 Opening.json")
        self.assertEqual(normalize_path("Bob's day"), "Bob's day.json")
        for bad in ["", "/", "../x", "a/../b", "a:b", "x?", "con", "trailing.", "a//b"]:
            with self.assertRaises(SceneError, msg=bad):
                normalize_path(bad)

    def test_save_list_read(self):
        self.store.save("one", LAYOUT)
        self.store.save("Story A/02 Second", LAYOUT)
        self.store.save("Story A/01 First", LAYOUT)
        self.assertEqual(self.store.list(), ["one.json", "Story A/01 First.json", "Story A/02 Second.json"])
        self.assertEqual(self.store.read("Story A/01 First.json")["content"].strip(), LAYOUT)

    def test_overwrite_needs_flag(self):
        self.store.save("one", LAYOUT)
        with self.assertRaises(SceneExists):
            self.store.save("one", LAYOUT)
        self.store.save("one", LAYOUT.replace("1024", "512"), overwrite=True)
        self.assertIn("512", self.store.read("one")["content"])

    def test_rejects_bad_json_and_missing(self):
        with self.assertRaises(SceneError):
            self.store.save("bad", "{not json")
        with self.assertRaises(SceneNotFound):
            self.store.read("nope")
        self.assertFalse(os.path.exists(os.path.join(self.tmp.name, "x.json")))


    # Load JSON's Windows Open dialog (the dialog itself is replaced by a stand-in)
    def test_pick_starts_in_scenes_folder(self):
        seen = []
        self.store.pick("", ask=lambda d: seen.append(d) or "")
        self.assertEqual(seen, [self.store.folder])

    def test_pick_starts_in_last_scene_subfolder(self):
        self.store.save("Story A/01 Opening", LAYOUT)
        seen = []
        self.store.pick("Story A/01 Opening.json", ask=lambda d: seen.append(d) or "")
        self.assertEqual(seen, [os.path.join(self.store.folder, "Story A")])

    def test_pick_falls_back_when_subfolder_is_gone(self):
        seen = []
        self.store.pick("Gone/01.json", ask=lambda d: seen.append(d) or "")
        self.assertEqual(seen, [self.store.folder])

    def test_pick_cancelled(self):
        self.assertEqual(self.store.pick("", ask=lambda d: ""), {"cancelled": True})

    def test_pick_inside_folder_gives_scene_path(self):
        self.store.save("Story A/01 Opening", LAYOUT)
        full = os.path.join(self.store.folder, "Story A", "01 Opening.json")
        data = self.store.pick("", ask=lambda d: full)
        self.assertEqual(data["path"], "Story A/01 Opening.json")
        self.assertEqual(data["name"], "01 Opening.json")
        self.assertIn("red ball", data["content"])

    def test_pick_outside_folder_has_no_scene_path(self):
        outside = os.path.join(self.tmp.name, "elsewhere.json")
        with open(outside, "w", encoding="utf-8") as f:
            f.write(LAYOUT)
        data = self.store.pick("", ask=lambda d: outside)
        self.assertEqual(data["path"], "")
        self.assertEqual(data["name"], "elsewhere.json")

    def test_pick_unreadable_file(self):
        with self.assertRaises(SceneError):
            self.store.pick("", ask=lambda d: os.path.join(self.tmp.name, "missing.json"))

if __name__ == "__main__":
    unittest.main()
