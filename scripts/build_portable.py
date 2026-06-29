import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RELEASE = ROOT / "release"
APP_DIR = RELEASE / "放疗流程管理系统-win-x64"

RUNTIME_MODULES = [
    "@types",
    "accepts",
    "body-parser",
    "bytes",
    "call-bind-apply-helpers",
    "call-bound",
    "content-disposition",
    "content-type",
    "cookie",
    "cookie-signature",
    "cors",
    "debug",
    "depd",
    "dotenv",
    "dunder-proto",
    "ee-first",
    "encodeurl",
    "es-define-property",
    "es-errors",
    "es-object-atoms",
    "escape-html",
    "etag",
    "express",
    "finalhandler",
    "forwarded",
    "fresh",
    "function-bind",
    "get-intrinsic",
    "get-proto",
    "gopd",
    "has-symbols",
    "hasown",
    "http-errors",
    "iconv-lite",
    "inherits",
    "ipaddr.js",
    "is-promise",
    "math-intrinsics",
    "media-typer",
    "merge-descriptors",
    "mime-db",
    "mime-types",
    "ms",
    "negotiator",
    "object-assign",
    "object-inspect",
    "on-finished",
    "once",
    "parseurl",
    "path-to-regexp",
    "proxy-addr",
    "qs",
    "range-parser",
    "raw-body",
    "router",
    "safe-buffer",
    "safer-buffer",
    "send",
    "serve-static",
    "setprototypeof",
    "side-channel",
    "side-channel-list",
    "side-channel-map",
    "side-channel-weakmap",
    "statuses",
    "toidentifier",
    "type-is",
    "unpipe",
    "vary",
    "wrappy",
    "zod",
    "electron",
]


def copytree(src: Path, dst: Path):
    if not src.exists():
        raise FileNotFoundError(src)
    shutil.copytree(src, dst, dirs_exist_ok=True)


def copy_runtime_modules():
    target = APP_DIR / "resources" / "app" / "node_modules"
    target.mkdir(parents=True, exist_ok=True)

    for module in RUNTIME_MODULES:
        src = ROOT / "node_modules" / module
        if src.exists():
            copytree(src, target / module)


def main():
    if RELEASE.exists():
        shutil.rmtree(RELEASE)
    APP_DIR.mkdir(parents=True, exist_ok=True)

    copytree(ROOT / "node_modules" / "electron" / "dist", APP_DIR)
    original_exe = APP_DIR / "electron.exe"
    product_exe = APP_DIR / "放疗流程管理系统.exe"
    if original_exe.exists():
        original_exe.rename(product_exe)

    app_root = APP_DIR / "resources" / "app"
    app_root.mkdir(parents=True, exist_ok=True)
    copytree(ROOT / "dist", app_root / "dist")
    copytree(ROOT / "electron", app_root / "electron")
    copytree(ROOT / "server", app_root / "server")
    copytree(ROOT / "config", app_root / "config")
    copy_runtime_modules()

    package_json = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    portable_package = {
        "name": package_json["name"],
        "version": package_json["version"],
        "private": True,
        "type": "module",
        "main": "electron/main.cjs"
    }
    (app_root / "package.json").write_text(json.dumps(portable_package, ensure_ascii=False, indent=2), encoding="utf-8")

    print(APP_DIR)


if __name__ == "__main__":
    main()
