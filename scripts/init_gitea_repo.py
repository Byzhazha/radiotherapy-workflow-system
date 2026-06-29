import base64
import json
import os
import subprocess
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional


ROOT = Path(__file__).resolve().parents[1]
GITEA_BASE_URL = "https://gitea.jaycode.online"
GITEA_OWNER = "gitadmin"
GITEA_REPO = "radiotherapy-workflow-system"
GITEA_USERNAME = "gitadmin"
GITEA_PASSWORD = "12345678911"
GITEA_HTTPS_REMOTE = f"{GITEA_BASE_URL}/{GITEA_OWNER}/{GITEA_REPO}.git"


def run(command: list[str], check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        command,
        cwd=ROOT,
        check=check,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def api_request(method: str, path: str, body: Optional[dict] = None):
    payload = json.dumps(body).encode("utf-8") if body else None
    credentials = base64.b64encode(f"{GITEA_USERNAME}:{GITEA_PASSWORD}".encode("utf-8")).decode("ascii")
    request = urllib.request.Request(
        f"{GITEA_BASE_URL}/api/v1{path}",
        data=payload,
        method=method,
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        if error.code == 409:
            return {"alreadyExists": True}
        if error.code == 404 and method == "GET":
            return None
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Gitea API failed: {method} {path}\n{detail}") from error


def ensure_repository():
    existing = api_request("GET", f"/repos/{GITEA_OWNER}/{GITEA_REPO}")
    if existing:
        return existing

    return api_request(
        "POST",
        "/user/repos",
        {
            "name": GITEA_REPO,
            "description": "放疗流程管理系统：桌面端、后端、AI定制助手和交付审计闭环。",
            "private": False,
            "auto_init": False,
        },
    )


def ensure_git_repo():
    if not (ROOT / ".git").exists():
        run(["git", "init"])

    run(["git", "config", "user.name", "AI Delivery Agent"])
    run(["git", "config", "user.email", "ai-delivery@radiotherapy.local"])

    remotes = run(["git", "remote"], check=False).stdout.split()
    if "origin" in remotes:
        run(["git", "remote", "set-url", "origin", GITEA_HTTPS_REMOTE])
    else:
        run(["git", "remote", "add", "origin", GITEA_HTTPS_REMOTE])


def commit_current_tree():
    run(["git", "add", "."])
    status = run(["git", "status", "--porcelain"]).stdout.strip()
    if status:
        run(["git", "commit", "-m", "feat: 放疗流程管理系统首版交付"])


def push_main_branch():
    run(["git", "branch", "-M", "main"])
    env = os.environ.copy()
    env["GIT_ASKPASS"] = str(ROOT / "scripts" / "gitea_askpass.py")
    env["GITEA_PUSH_USERNAME"] = GITEA_USERNAME
    env["GITEA_PUSH_PASSWORD"] = GITEA_PASSWORD
    env["GIT_TERMINAL_PROMPT"] = "0"
    subprocess.run(
        ["git", "push", "-u", "origin", "main"],
        cwd=ROOT,
        check=True,
        env=env,
        text=True,
    )


def main():
    ensure_repository()
    ensure_git_repo()
    commit_current_tree()
    push_main_branch()
    print(f"{GITEA_BASE_URL}/{GITEA_OWNER}/{GITEA_REPO}")


if __name__ == "__main__":
    main()
