import json
import os
import urllib.error
import urllib.request
from pathlib import Path

from flask import Flask, jsonify, make_response, request

app = Flask(__name__)
PROMPT_PATH = Path(__file__).with_name("TRUE_TONE_AGENT_SYSTEM.md")


def load_prompt() -> str:
    try:
        return PROMPT_PATH.read_text(encoding="utf-8")
    except Exception:
        return (
            "You are TrueTone, a beauty-content trust and purchase-decision assistant. "
            "Use only the supplied evidence. Never equate positive reviews with truth. "
            "Distinguish normal variation from suspicious distortion. Return JSON only."
        )


def cors(response):
    response.headers["Access-Control-Allow-Origin"] = os.getenv("CORS_ORIGIN", "*")
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


@app.after_request
def add_cors_headers(response):
    return cors(response)


@app.route("/api/analyze", methods=["OPTIONS"])
def analyze_options():
    return make_response("", 204)


def model_call(payload: dict) -> dict:
    api_key = os.getenv("DASHSCOPE_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("DASHSCOPE_API_KEY is not configured")

    base_url = os.getenv("MODEL_STUDIO_BASE_URL", "").strip().rstrip("/")
    if not base_url:
        raise RuntimeError("MODEL_STUDIO_BASE_URL is not configured")

    model = os.getenv("QWEN_MODEL", "qwen-plus").strip() or "qwen-plus"

    system_prompt = load_prompt()
    user_prompt = (
        "Use the following structured TrueTone evidence. "
        "Do not invent source material. "
        "Do not recalculate deterministic trust or match scores; explain what those scores mean. "
        "Return one JSON object only.\n\n"
        + json.dumps(payload, ensure_ascii=False)
    )

    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }

    req = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Model Studio HTTP {exc.code}: {detail[:1200]}") from exc

    data = json.loads(raw)
    content = data["choices"][0]["message"]["content"]
    if isinstance(content, dict):
        return content
    return json.loads(content)


@app.get("/")
def root():
    return jsonify(
        {
            "service": "TrueTone Agent API",
            "ok": True,
            "routes": ["/health", "/api/analyze"],
        }
    )


@app.get("/health")
def health():
    return jsonify(
        {
            "ok": True,
            "service": "truetone-agent-api",
            "model_configured": bool(
                os.getenv("DASHSCOPE_API_KEY") and os.getenv("MODEL_STUDIO_BASE_URL")
            ),
            "model": os.getenv("QWEN_MODEL", "qwen-plus"),
        }
    )


@app.post("/api/analyze")
def analyze():
    payload = request.get_json(silent=True) or {}
    if not payload.get("product_key"):
        return jsonify({"error": "product_key is required"}), 400

    try:
        result = model_call(payload)
        result["runtime"] = "aliyun-model-studio"
        return jsonify(result)
    except Exception as exc:
        return (
            jsonify(
                {
                    "error": "cloud_agent_unavailable",
                    "detail": str(exc),
                    "runtime": "deterministic-frontend-fallback",
                }
            ),
            503,
        )


if __name__ == "__main__":
    port = int(os.getenv("PORT", "9000"))
    app.run(host="0.0.0.0", port=port)
