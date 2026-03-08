from __future__ import annotations

from decimal import Decimal, InvalidOperation
from datetime import datetime, timedelta, timezone

from app.constants import BITCOIN_MAX_DECIMALS, INVESTMENT_FIELDS

IST_TIMEZONE = timezone(timedelta(hours=5, minutes=30))


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
            parsed_datetime = datetime.fromisoformat(recorded_at.replace("Z", "+00:00"))

            if parsed_datetime.tzinfo is None:
                parsed_datetime = parsed_datetime.replace(tzinfo=IST_TIMEZONE)

            values["recorded_at"] = parsed_datetime.astimezone(timezone.utc)
        except ValueError:
            errors.append("Invalid datetime format for recorded_at. Use ISO format.")

    return values, errors


def parse_bitcoin_payload(payload: dict) -> tuple[dict, list[str]]:
    errors: list[str] = []
    values: dict = {}

    sources = payload.get("sources")
    raw_bitcoin = payload.get("bitcoin")

    decimal_values: list[Decimal] = []

    if sources is not None:
        if not isinstance(sources, list) or not sources:
            errors.append("sources must be a non-empty list")
        else:
            for index, entry in enumerate(sources):
                try:
                    numeric = Decimal(str(entry).strip())
                except (InvalidOperation, AttributeError):
                    errors.append(f"Invalid bitcoin source value at index {index}")
                    continue

                if numeric < 0:
                    errors.append(f"Bitcoin source value cannot be negative at index {index}")
                    continue

                precision = max(0, -numeric.as_tuple().exponent)
                if precision > BITCOIN_MAX_DECIMALS:
                    errors.append(
                        f"Bitcoin source value at index {index} supports up to {BITCOIN_MAX_DECIMALS} decimals"
                    )
                    continue

                decimal_values.append(numeric)
    elif raw_bitcoin is not None:
        try:
            numeric = Decimal(str(raw_bitcoin).strip())
            if numeric < 0:
                errors.append("bitcoin cannot be negative")
            else:
                precision = max(0, -numeric.as_tuple().exponent)
                if precision > BITCOIN_MAX_DECIMALS:
                    errors.append(
                        f"bitcoin supports up to {BITCOIN_MAX_DECIMALS} decimals"
                    )
                else:
                    decimal_values = [numeric]
        except (InvalidOperation, AttributeError):
            errors.append("Invalid numeric value for bitcoin")
    else:
        errors.append("Provide either bitcoin or sources")

    if decimal_values:
        total_bitcoin = sum(decimal_values, Decimal("0"))
        satoshis = int(total_bitcoin * Decimal("100000000"))
        values["bitcoin_satoshis"] = satoshis
        values["bitcoin"] = satoshis / 100000000
        values["sources"] = [f"{value:.8f}" for value in decimal_values]

    recorded_at = payload.get("recorded_at")
    if recorded_at:
        try:
            parsed_datetime = datetime.fromisoformat(recorded_at.replace("Z", "+00:00"))

            if parsed_datetime.tzinfo is None:
                parsed_datetime = parsed_datetime.replace(tzinfo=IST_TIMEZONE)

            values["recorded_at"] = parsed_datetime.astimezone(timezone.utc)
        except ValueError:
            errors.append("Invalid datetime format for recorded_at. Use ISO format.")

    return values, errors


def compute_net_worth(values: dict) -> float:
    loan_due = values["total_loan_taken"] - values["loan_repaid"]

    return (
        values["stocks"]
        + values["gold"]
        + values["bitcoin"]
        + values["cash"]
        - values["credit_card_dues"]
        - loan_due
    )
