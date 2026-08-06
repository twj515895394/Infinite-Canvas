"""E2E 临时启动器：复用 main.app 但监听 3889（不触碰用户 3888 实例）。用后即删，不入库。"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import uvicorn

import main  # noqa: F401  注册全部路由

if __name__ == "__main__":
    uvicorn.run(main.app, host="127.0.0.1", port=3889, ws_ping_interval=None, ws_ping_timeout=None)
