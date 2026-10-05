import json
import os
from pathlib import Path

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

ROOT = Path(__file__).resolve().parents[2]
PROMPT_PATH = ROOT / "prompts" / "TRUE_TONE_AGENT_SYSTEM.md"


def load_prompt() -> str:
    try:
        return PROMPT_PATH.read_text(encoding="utf-8")
    except Exception:
        return (
            "You are TrueTone, a beauty-content trust and purchase-decision assistant. "
            "Never equate positive reviews with truth. Distinguish normal variation from suspicious distortion. "
            "Use only the supplied evidence. Return JSON only."
        )


def model_call(payload: dict) -> dict:
    api_key = os.getenv("DASHSCOPE_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("DASHSCOPE_API_KEY is not configured")

    base_url = os.getenv(
        "MODEL_STUDIO_BASE_URL",
        "https://dashscope.aliyuncs.com/compatible-mode/v1",
    ).rstrip("/")
    model = os.getenv("QWEN_MODEL", "qwen-plus")

    system_prompt = load_prompt()
    user_prompt = (
        "Use the following structured TrueTone evidence. "
        "Do not recalculate the deterministic trust or match scores. "
        "Explain what the evidence means for this consumer and return JSON only.\n\n"
        + json.dumps(payload, ensure_ascii=False)
    )

    response = requests.post(
        f"{base_url}/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        },
        timeout=45,
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]
    return json.loads(content)


@app.get("/health")
def health():
    return jsonify(
        {
            "ok": True,
            "service": "truetone-agent-api",
            "model_configured": bool(os.getenv("DASHSCOPE_API_KEY")),
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
        # Fail transparently. The frontend still has its deterministic local analysis.
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
