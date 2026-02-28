from __future__ import annotations

from datetime import datetime

from app.constants import INVESTMENT_FIELDS


def validate_username_password(username: str, password: str) -> tuple[bool, str]:
    if not username or not username.strip():
        return False, "Username is required"
    if not password or len(password) < 4:
        return False, "Password must be at least 4 characters"
    return True, ""


def parse_investment_payload(payload: dict) -> tuple[dict, list[str]]:
    errors: list[str] = []
    values: dict = {}

    for field in INVESTMENT_FIELDS:
        raw_value = payload.get(field)
        if raw_value is None:
            errors.append(f"Missing field: {field}")
            continue

        try:
            values[field] = float(raw_value)
        except (TypeError, ValueError):
            errors.append(f"Invalid numeric value for: {field}")

    recorded_at = payload.get("recorded_at")
    if recorded_at:
        try:
            values["recorded_at"] = datetime.fromisoformat(recorded_at.replace("Z", "+00:00"))
        except ValueError:
            errors.append("Invalid datetime format for recorded_at. Use ISO format.")

    return values, errors


def compute_net_worth(values: dict) -> float:
    return (
        values["stocks"]
        + values["gold"]
        + values["bitcoin"]
        + values["cash"]
        - values["credit_card_dues"]
        - values["loan_dues"]
    )
