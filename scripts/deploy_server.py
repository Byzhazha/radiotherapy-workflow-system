import os
import posixpath
import stat
import tarfile
import tempfile
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parents[1]
HOST = "38.76.162.229"
USER = "root"
PASSWORD = "OEVLQtb22Pz5$#t@"
REMOTE_DIR = "/opt/rt-ai-workbench"
SERVICE_NAME = "rt-ai-workbench"
REMOTE_ENV = """AI_BASE_URL=https://zz1cc.cc.cd/v1
AI_API_KEY=sk-nSeb0stRJtTbeDqJLLqb3lX5nOa6FtfGilV8Zcy6ihROzZlB
AI_MODEL=gpt-5.5
RT_API_PORT=8750
RT_API_HOST=0.0.0.0
GITEA_BASE_URL=https://gitea.jaycode.online
GITEA_OWNER=gitadmin
GITEA_REPO=radiotherapy-workflow-system
GITEA_USERNAME=gitadmin
GITEA_PASSWORD=12345678911
GITEA_BRANCH=main
"""


def include_file(path: Path) -> bool:
    rel = path.relative_to(ROOT).as_posix()
    ignored_prefixes = (
        "node_modules/",
        "release/",
        "dist/",
        "data/",
        ".git/",
    )
    ignored_names = {".env"}
    ignored_files = {"scripts/deploy_server.py", "scripts/reset_server_data.py"}
    return rel not in ignored_files and not rel.startswith(ignored_prefixes) and path.name not in ignored_names


def make_archive() -> Path:
    fd, archive_name = tempfile.mkstemp(prefix="rt-ai-workbench-", suffix=".tar.gz")
    os.close(fd)
    archive_path = Path(archive_name)

    with tarfile.open(archive_path, "w:gz") as tar:
        for path in ROOT.rglob("*"):
            if path.is_file() and include_file(path):
                tar.add(path, arcname=path.relative_to(ROOT).as_posix())

    return archive_path


def run(ssh: paramiko.SSHClient, command: str) -> str:
    stdin, stdout, stderr = ssh.exec_command(command)
    code = stdout.channel.recv_exit_status()
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    if code != 0:
        raise RuntimeError(f"Command failed ({code}): {command}\nSTDOUT:\n{out}\nSTDERR:\n{err}")
    return out.strip()


def ensure_remote_dir(sftp: paramiko.SFTPClient, remote_path: str):
    parts = remote_path.strip("/").split("/")
    current = ""
    for part in parts:
        current = f"{current}/{part}"
        try:
            sftp.stat(current)
        except FileNotFoundError:
            sftp.mkdir(current)


def upload_file(sftp: paramiko.SFTPClient, local: Path, remote: str):
    ensure_remote_dir(sftp, posixpath.dirname(remote))
    sftp.put(str(local), remote)


def main():
    archive = make_archive()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASSWORD, timeout=20)
    sftp = ssh.open_sftp()

    try:
      remote_archive = f"/tmp/{archive.name}"
      upload_file(sftp, archive, remote_archive)
      run(ssh, f"mkdir -p {REMOTE_DIR}")
      run(ssh, f"tar -xzf {remote_archive} -C {REMOTE_DIR}")
      run(ssh, f"cat > {REMOTE_DIR}/.env <<'EOF'\n{REMOTE_ENV}EOF")
      run(ssh, f"cd {REMOTE_DIR} && npm install --omit=dev")
      run(ssh, f"cat > /etc/systemd/system/{SERVICE_NAME}.service <<'EOF'\n[Unit]\nDescription=Radiotherapy Workflow API\nAfter=network.target\n\n[Service]\nType=simple\nWorkingDirectory={REMOTE_DIR}\nEnvironmentFile={REMOTE_DIR}/.env\nExecStart=/usr/bin/node server/index.js\nRestart=always\nRestartSec=5\n\n[Install]\nWantedBy=multi-user.target\nEOF")
      run(ssh, "systemctl daemon-reload")
      run(ssh, f"systemctl enable {SERVICE_NAME}")
      run(ssh, f"systemctl restart {SERVICE_NAME}")
      status = run(ssh, f"systemctl is-active {SERVICE_NAME}")
      print(status)
    finally:
      sftp.close()
      ssh.close()
      archive.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
