import paramiko


HOST = "38.76.162.229"
USER = "root"
PASSWORD = "OEVLQtb22Pz5$#t@"


def run(ssh, command):
    stdin, stdout, stderr = ssh.exec_command(command)
    code = stdout.channel.recv_exit_status()
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    if code != 0:
        raise RuntimeError(f"{command}\n{out}\n{err}")
    return out.strip()


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASSWORD, timeout=20)
    try:
        run(ssh, "systemctl stop rt-ai-workbench")
        run(ssh, "rm -rf /opt/rt-ai-workbench/data")
        run(ssh, "systemctl start rt-ai-workbench")
        print(run(ssh, "systemctl is-active rt-ai-workbench"))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
