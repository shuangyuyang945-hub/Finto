import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import desktop


class DesktopVersionTests(unittest.TestCase):
    def test_accepts_only_current_backend(self):
        current = {
            "product": "Finto",
            "version": desktop.finto.APP_VERSION,
            "schema_version": desktop.finto.SCHEMA_VERSION,
        }

        self.assertTrue(desktop.compatible_health(current))
        self.assertFalse(desktop.compatible_health({**current, "version": "0.4.0"}))
        self.assertFalse(desktop.compatible_health({**current, "schema_version": 3}))
        self.assertFalse(desktop.compatible_health({**current, "product": "Other"}))

    def test_default_data_root_uses_finto_name(self):
        with mock.patch.dict(os.environ, {"LOCALAPPDATA": r"C:\Users\example\AppData\Local"}):
            self.assertEqual(desktop.default_data_root(), Path(r"C:\Users\example\AppData\Local") / "Finto")

    def test_migrates_legacy_profile_without_deleting_it(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            local_app_data = Path(temporary_directory)
            legacy_root = local_app_data / "Brainstorm"
            target_root = local_app_data / "Finto"
            (legacy_root / "data").mkdir(parents=True)
            (legacy_root / "backups").mkdir()
            (legacy_root / "data" / "knowledge.db").write_bytes(b"legacy-data")
            (legacy_root / "backups" / "brainstorm-backup-20260920.zip").write_bytes(b"legacy-backup")

            with mock.patch.dict(os.environ, {"LOCALAPPDATA": str(local_app_data)}):
                self.assertTrue(desktop.migrate_legacy_product_storage(target_root))

            self.assertEqual((target_root / "data" / "knowledge.db").read_bytes(), b"legacy-data")
            self.assertEqual((target_root / "backups" / "finto-backup-20260920.zip").read_bytes(), b"legacy-backup")
            self.assertFalse((target_root / "backups" / "brainstorm-backup-20260920.zip").exists())
            self.assertEqual((legacy_root / "data" / "knowledge.db").read_bytes(), b"legacy-data")
            self.assertTrue((legacy_root / "backups" / "brainstorm-backup-20260920.zip").exists())
            self.assertFalse(desktop.migrate_legacy_product_storage(target_root))


if __name__ == "__main__":
    unittest.main()
