import unittest

import server


class UpdateManifestTests(unittest.TestCase):
    def test_accepts_https_release_manifest(self) -> None:
        manifest = server.parse_update_manifest(
            {
                "version": "0.5.1",
                "installer_url": "https://github.com/example/finto/releases/download/v0.5.1/Finto-Setup-0.5.1.exe",
                "portable_url": "https://github.com/example/finto/releases/download/v0.5.1/Finto.exe",
                "notes_url": "https://github.com/example/finto/releases/tag/v0.5.1",
                "sha256": "a" * 64,
            }
        )
        self.assertEqual(manifest["version"], "0.5.1")

    def test_rejects_non_https_release_link(self) -> None:
        with self.assertRaises(ValueError):
            server.parse_update_manifest({"version": "0.5.1", "installer_url": "http://example.test/setup.exe"})

    def test_version_comparison(self) -> None:
        self.assertGreater(server.version_tuple("0.5.1"), server.version_tuple("0.5.0"))


if __name__ == "__main__":
    unittest.main()
