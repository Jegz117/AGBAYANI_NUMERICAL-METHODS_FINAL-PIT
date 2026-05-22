"""Flask app for a Lagrange Interpolation numerical methods calculator."""

from __future__ import annotations

from flask import Flask, jsonify, render_template, request

from utils.lagrange import build_lagrange, validate_points

app = Flask(__name__)


@app.route("/")
def index():
    """Render the main calculator page."""
    return render_template("index.html")


@app.route("/api/lagrange", methods=["POST"])
def api_lagrange():
    """Receive user data, validate it safely, and return Lagrange results."""
    try:
        payload = request.get_json(silent=True) or {}
        points, target_x = validate_points(payload.get("points"), payload.get("targetX"))
        result = build_lagrange(points, target_x)
        return jsonify({"ok": True, "data": result})
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400


if __name__ == "__main__":
    app.run(debug=True)
