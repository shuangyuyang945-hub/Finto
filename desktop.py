from __future__ import annotations

import json
import os
import shutil
import subprocess
import urllib.error
import urllib.request
import webbrowser
from http.server import ThreadingHTTPServer
from pathlib import Path

import server as finto


HOST = "127.0.0.1"
FIRST_PORT = 8765
LAST_PORT = 8780


def default_data_root() -> Path:
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        return Path(local_app_data) / "Finto"
    return Path.home() / ".finto"


def legacy_data_root() -> Path:
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        return Path(local_app_data) / "Brainstorm"
    return Path.home() / ".brainstorm"


def migrate_legacy_product_storage(target_root: Path) -> bool:
    """Copy an existing Brainstorm profile to Finto without deleting the original."""
    target_root = target_root.expanduser().resolve()
    source_root = legacy_data_root().expanduser().resolve()
    if target_root.exists() or not source_root.is_dir():
        return False
    shutil.copytree(source_root, target_root)
    backup_root = target_root / "backups"
    if backup_root.is_dir():
        for legacy_backup in backup_root.glob("brainstorm-backup-*.zip"):
            migrated_backup = legacy_backup.with_name(legacy_backup.name.replace("brainstorm-backup-", "finto-backup-", 1))
            if not migrated_backup.exists():
                legacy_backup.rename(migrated_backup)
    return True


def compatible_health(health: object) -> bool:
    return (
        isinstance(health, dict)
        and health.get("product") == "Finto"
        and health.get("version") == finto.APP_VERSION
        and int(health.get("schema_version", 0)) >= finto.SCHEMA_VERSION
    )


def read_health(url: str) -> dict[str, object] | None:
    try:
        with urllib.request.urlopen(f"{url}/api/health", timeout=1) as response:
            health = json.loads(response.read().decode("utf-8"))
            return health if response.status == 200 and isinstance(health, dict) else None
    except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError):
        return None


def running_finto(url: str) -> bool:
    return compatible_health(read_health(url))


def open_app_window(url: str) -> None:
    candidates = [
        Path(os.environ.get("PROGRAMFILES(X86)", "")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("PROGRAMFILES", "")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft/Edge/Application/msedge.exe",
    ]
    edge = next((path for path in candidates if path.is_file()), None)
    if edge:
        subprocess.Popen([str(edge), f"--app={url}", "--start-maximized"], close_fds=True)
        return
    webbrowser.open(url)


def main() -> None:
    data_root = default_data_root()
    migrate_legacy_product_storage(data_root)
    finto.migrate_legacy_storage(data_root)
    finto.configure_storage(data_root)
    finto.init_storage()
    httpd = None
    url = ""
    for port in range(FIRST_PORT, LAST_PORT + 1):
        candidate_url = f"http://{HOST}:{port}"
        health = read_health(candidate_url)
        if health is not None:
            if compatible_health(health):
                if os.environ.get("FINTO_NO_OPEN") != "1":
                    open_app_window(candidate_url)
                return
            continue
        try:
            httpd = ThreadingHTTPServer((HOST, port), finto.Handler)
            url = candidate_url
            break
        except OSError:
            continue
    if httpd is None:
        raise SystemExit(f"Finto 无法启动：端口 {FIRST_PORT}–{LAST_PORT} 均被占用。")
    if os.environ.get("FINTO_NO_OPEN") != "1":
        open_app_window(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
