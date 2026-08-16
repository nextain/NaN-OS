#!/usr/bin/env python3
"""Loopback-only Windows VoxCPM2 + TensorRT LocDiT service.

This is the Shell-facing voice surface for the windows_trt_6g profile. It
loads the pinned VoxCPM2 engine directly and intentionally has no dependency on
the generic cascade loader or the avatar/output-cascade service graph.
"""
from __future__ import annotations

import base64
import json
import os
import pathlib
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

import tts_server as engine

PORT = int(os.environ.get("VOXCPM2_PORT", "8910"))
VOICE_DIR = pathlib.Path(os.environ["VOXCPM2_VOICE_DIR"]).resolve()
RUNTIME_ROOT = pathlib.Path(os.environ["VOXCPM2_RUNTIME_ROOT"]).resolve()
ACTIVE_VOICE = RUNTIME_ROOT / "voices" / "naia-current.wav"
MAX_AUDIO_BYTES = 20 * 1024 * 1024
ADMISSION = threading.Lock()
ALLOWED_ORIGINS = {
    "http://tauri.localhost",
    "https://tauri.localhost",
    "tauri://localhost",
    "http://127.0.0.1:1420",
    "http://localhost:1420",
    "http://127.0.0.1:1422",
    "http://localhost:1422",
}


def voice_files() -> list[pathlib.Path]:
    return sorted(path for path in VOICE_DIR.glob("*.wav") if path.is_file())


def default_voice() -> pathlib.Path:
    files = voice_files()
    if not files:
        raise RuntimeError("No bundled VoxCPM2 reference voice is installed")
    return files[0]


def resolve_voice(value: str) -> pathlib.Path:
    if value == "naia-current" and ACTIVE_VOICE.is_file():
        return ACTIVE_VOICE
    if value in ("", "default", "naia-default"):
        return default_voice()
    safe = pathlib.Path(value).stem
    candidate = (VOICE_DIR / f"{safe}.wav").resolve()
    if candidate.parent != VOICE_DIR or not candidate.is_file():
        raise ValueError("unknown_voice")
    return candidate


def json_bytes(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False).encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_args):
        pass

    def allowed_origin(self) -> str | None:
        origin = self.headers.get("Origin", "")
        return origin if origin in ALLOWED_ORIGINS else None

    def reply(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        origin = self.allowed_origin()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self, limit: int = 128 * 1024) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > limit:
            raise ValueError("invalid_request_size")
        value = json.loads(self.rfile.read(length))
        if not isinstance(value, dict):
            raise ValueError("invalid_json_body")
        return value

    def do_OPTIONS(self):
        origin = self.allowed_origin()
        if not origin:
            self.reply(403, json_bytes({"error": "origin_not_allowed"}), "application/json")
            return
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Vary", "Origin")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/health":
            self.reply(200, json_bytes({
                "ok": True,
                "ready": True,
                "tts": True,
                "avatar": False,
                "tts_enabled": True,
                "avatar_enabled": False,
                "profile": "windows_trt_6g",
                **engine.BACKEND_INFO,
            }), "application/json")
            return
        if path == "/ref/voices":
            files = voice_files()
            voices = [{
                "name": item.stem,
                "url": f"/ref/audio/{item.name}",
                "lang": "ko-KR",
                "idx": index,
                "default": index == 0,
            } for index, item in enumerate(files)]
            self.reply(200, json_bytes({"voices": voices}), "application/json")
            return
        if path.startswith("/ref/audio/"):
            name = pathlib.Path(unquote(path.removeprefix("/ref/audio/"))).name
            candidate = (VOICE_DIR / name).resolve()
            if candidate.parent == VOICE_DIR and candidate.suffix.lower() == ".wav" and candidate.is_file():
                self.reply(200, candidate.read_bytes(), "audio/wav")
            else:
                self.reply(404, json_bytes({"error": "voice_not_found"}), "application/json")
            return
        self.reply(404, json_bytes({"error": "not_found"}), "application/json")

    def do_PUT(self):
        if urlparse(self.path).path != "/voice":
            self.reply(404, json_bytes({"error": "not_found"}), "application/json")
            return
        try:
            raw = base64.b64decode(self.read_json(MAX_AUDIO_BYTES * 2)["audio_base64"], validate=True)
            if len(raw) > MAX_AUDIO_BYTES or not raw.startswith(b"RIFF"):
                raise ValueError("invalid_wav")
            ACTIVE_VOICE.parent.mkdir(parents=True, exist_ok=True)
            temp = ACTIVE_VOICE.with_suffix(".tmp")
            temp.write_bytes(raw)
            temp.replace(ACTIVE_VOICE)
            self.reply(200, json_bytes({"ok": True}), "application/json")
        except Exception as error:
            self.reply(400, json_bytes({"error": str(error)}), "application/json")

    def do_POST(self):
        if urlparse(self.path).path != "/v1/audio/speech":
            self.reply(404, json_bytes({"error": "not_found"}), "application/json")
            return
        if not ADMISSION.acquire(blocking=False):
            self.reply(429, json_bytes({"error": "busy"}), "application/json")
            return
        try:
            body = self.read_json()
            if body.get("model") != "voxcpm2":
                raise ValueError("invalid_model")
            text = str(body.get("input", "")).strip()
            if not text:
                raise ValueError("invalid_input")
            ref = resolve_voice(str(body.get("voice", "naia-default")))
            wav = engine.synth(text, str(ref))
            self.reply(200, wav, "audio/wav")
        except ValueError as error:
            self.reply(400, json_bytes({"error": str(error)}), "application/json")
        except Exception as error:
            self.reply(500, json_bytes({"error": str(error)}), "application/json")
        finally:
            ADMISSION.release()


class Server(ThreadingHTTPServer):
    daemon_threads = True


def main() -> None:
    ready = {"facade_port": PORT, "profile": "windows_trt_6g", "backend": "tensorrt_locdit"}
    print(f"VOXCPM2_READY {json.dumps(ready)}", flush=True)
    Server(("127.0.0.1", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
