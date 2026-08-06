"""E2E 用假 OpenAI 兼容视频服务（F7 冒烟专用，不入库）。

普通路径（非 apimart/volcengine/yuli）契约：
- POST {base}/v1/videos/generations → 响应含 videos 字段即视为完成（跳过轮询）
- 视频 URL 由本服务提供可下载小 mp4（启动时用 ffmpeg 生成一次）
"""
import json
import subprocess
import sys
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8190
VIDEO_DIR = Path(__file__).resolve().parent / "media"
VIDEO_DIR.mkdir(exist_ok=True)
MP4 = VIDEO_DIR / "mock_out.mp4"

if not MP4.exists() or MP4.stat().st_size == 0:
    subprocess.run(
        [
            "ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=black:s=320x180:d=1",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", str(MP4),
        ],
        check=True,
        capture_output=True,
    )


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/videos/mock_out.mp4":
            data = MP4.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        self._json({"error": "not found"}, 404)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length:
            self.rfile.read(length)
        if self.path.endswith("/videos/generations"):
            return self._json(
                {
                    "task_id": f"mock-video-{uuid.uuid4().hex[:8]}",
                    "videos": [f"http://127.0.0.1:{PORT}/videos/mock_out.mp4"],
                }
            )
        self._json({"error": "not found"}, 404)


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
