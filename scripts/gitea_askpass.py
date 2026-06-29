import os
import sys


prompt = " ".join(sys.argv[1:]).lower()
if "username" in prompt:
    print(os.environ.get("GITEA_PUSH_USERNAME", ""))
else:
    print(os.environ.get("GITEA_PUSH_PASSWORD", ""))
