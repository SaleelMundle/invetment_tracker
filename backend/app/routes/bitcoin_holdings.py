from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from flask import Blueprint, g, request

from app.constants import BITCOIN_TOTAL_SUPPLY, DEFAULT_WORLD_POPULATION
from app.db import get_db
from app.services.auth import login_required
from app.utils.serializers import serialize_document
from app.utils.validators import parse_bitcoin_payload

bitcoin_holdings_bp = Blueprint("bitcoin_holdings", __name__)
IST_TIMEZONE = timezone(timedelta(hours=5, minutes=30))


def _as_float(value: Any) -> float:
    try:
        if value is None:
            return 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _to_ist_iso(timestamp: datetime) -> str:
    normalized = timestamp if timestamp.tzinfo else timestamp.replace(tzinfo=timezone.utc)
    return normalized.astimezone(IST_TIMEZONE).isoformat()


def _safe_percentile(world_population: float, bitcoin: float) -> float | None:
    if world_population <= 0 or bitcoin <= 0:
        return None
    percentile = (BITCOIN_TOTAL_SUPPLY / (world_population * bitcoin)) * 100
    return min(percentile, 100.0)


@bitcoin_holdings_bp.post("")
@login_required
def create_bitcoin_holding():
    payload = request.get_json(silent=True) or {}
    print(f"[BITCOIN] Create payload received for user={g.current_user.get('username')}")

    values, errors = parse_bitcoin_payload(payload)
    if errors:
        print(f"[BITCOIN] Validation errors: {errors}")
        return {"message": "Validation failed", "errors": errors}, 400

    recorded_at = values.get("recorded_at", datetime.now(timezone.utc))

    db = get_db()
    document = {
        "user_id": g.current_user["_id"],
        "sources": values["sources"],
        "bitcoin": values["bitcoin"],
        "bitcoin_satoshis": values["bitcoin_satoshis"],
        "recorded_at": recorded_at,
        "recorded_at_ist": _to_ist_iso(recorded_at),
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }

    result = db.bitcoin_holdings.insert_one(document)
    created = db.bitcoin_holdings.find_one({"_id": result.inserted_id})

    print(f"[BITCOIN] Holding created with id={result.inserted_id}")
    return {
        "message": "Bitcoin holding saved successfully",
        "holding": serialize_document(created),
    }, 201


@bitcoin_holdings_bp.get("")
@login_required
def list_bitcoin_holdings():
    print(f"[BITCOIN] Listing holdings for user={g.current_user.get('username')}")
    db = get_db()

    holdings = list(
        db.bitcoin_holdings.find({"user_id": g.current_user["_id"]}).sort("recorded_at", -1)
    )
    return {
        "message": "Bitcoin holdings fetched successfully",
        "holdings": serialize_document(holdings),
    }, 200


@bitcoin_holdings_bp.get("/history")
@login_required
def bitcoin_history():
    print(f"[BITCOIN] Building BTC history for user={g.current_user.get('username')}")
    db = get_db()

    cursor = db.bitcoin_holdings.find(
        {"user_id": g.current_user["_id"]},
        {"recorded_at": 1, "bitcoin": 1, "bitcoin_satoshis": 1},
    ).sort("recorded_at", 1)

    history = [
        {
            "recorded_at": item["recorded_at"].isoformat(),
            "bitcoin": item["bitcoin"],
            "bitcoin_satoshis": item.get("bitcoin_satoshis"),
        }
        for item in cursor
    ]
    return {"message": "Bitcoin history fetched", "history": history}, 200


@bitcoin_holdings_bp.get("/top-percent-history")
@login_required
def bitcoin_top_percent_history():
    print(f"[BITCOIN] Building top-percent history for user={g.current_user.get('username')}")
    db = get_db()

    raw_world_population = request.args.get("world_population", str(DEFAULT_WORLD_POPULATION))
    try:
        world_population = float(raw_world_population)
    except (TypeError, ValueError):
        return {"message": "world_population must be numeric"}, 400

    if world_population <= 0:
        return {"message": "world_population must be greater than 0"}, 400

    cursor = db.bitcoin_holdings.find(
        {"user_id": g.current_user["_id"]},
        {"recorded_at": 1, "bitcoin": 1},
    ).sort("recorded_at", 1)

    history = []
    latest = None
    for item in cursor:
        bitcoin = float(item.get("bitcoin", 0))
        percentile = _safe_percentile(world_population, bitcoin)
        entry = {
            "recorded_at": item["recorded_at"].isoformat(),
            "bitcoin": bitcoin,
            "top_percent": percentile,
            "world_population": world_population,
        }
        history.append(entry)
        latest = entry

    return {
        "message": "Bitcoin top-percent history fetched",
        "history": history,
        "latest": latest,
    }, 200


@bitcoin_holdings_bp.get("/combined-summary")
@login_required
def combined_bitcoin_summary():
    print("[BITCOIN] Building combined bitcoin summary for all users")
    db = get_db()

    aggregated = list(
        db.bitcoin_holdings.aggregate(
            [
                {"$sort": {"user_id": 1, "recorded_at": -1, "_id": -1}},
                {
                    "$group": {
                        "_id": "$user_id",
                        "bitcoin": {"$first": "$bitcoin"},
                        "recorded_at": {"$first": "$recorded_at"},
                    }
                },
                {
                    "$group": {
                        "_id": None,
                        "bitcoin": {"$sum": "$bitcoin"},
                        "users_count": {"$sum": 1},
                        "latest_recorded_at": {"$max": "$recorded_at"},
                    }
                },
            ]
        )
    )

    summary = aggregated[0] if aggregated else {}
    return {
        "message": "Combined bitcoin summary fetched",
        "summary": {
            "bitcoin": summary.get("bitcoin", 0),
            "users_count": summary.get("users_count", 0),
            "latest_recorded_at": (
                summary.get("latest_recorded_at").isoformat()
                if summary.get("latest_recorded_at")
                else None
            ),
        },
    }, 200


@bitcoin_holdings_bp.get("/combined-history")
@login_required
def combined_bitcoin_history():
    print("[BITCOIN] Building combined BTC history for all users")
    db = get_db()

    earliest_by_user_cursor = db.bitcoin_holdings.aggregate(
        [
            {"$sort": {"user_id": 1, "recorded_at": 1, "_id": 1}},
            {
                "$group": {
                    "_id": "$user_id",
                    "bitcoin": {"$first": "$bitcoin"},
                }
            },
        ]
    )

    user_latest = {
        str(item["_id"]): _as_float(item.get("bitcoin", 0))
        for item in earliest_by_user_cursor
        if item.get("_id")
    }

    if not user_latest:
        return {"message": "Combined bitcoin history fetched", "history": []}, 200

    cursor = db.bitcoin_holdings.find(
        {},
        {"user_id": 1, "recorded_at": 1, "bitcoin": 1},
    ).sort([("recorded_at", 1), ("_id", 1)])

    running_total = sum(user_latest.values())
    history: list[dict[str, Any]] = []

    for item in cursor:
        recorded_at = item.get("recorded_at")
        user_id = str(item.get("user_id"))
        if not recorded_at or not user_id:
            continue

        previous_value = user_latest.get(user_id, 0.0)
        current_value = _as_float(item.get("bitcoin", 0))
        running_total += current_value - previous_value
        user_latest[user_id] = current_value

        entry = {
            "recorded_at": recorded_at.isoformat(),
            "bitcoin": running_total,
            "users_count": len(user_latest),
        }

        if history and history[-1]["recorded_at"] == entry["recorded_at"]:
            history[-1] = entry
        else:
            history.append(entry)

    return {"message": "Combined bitcoin history fetched", "history": history}, 200


@bitcoin_holdings_bp.get("/combined-top-percent-history")
@login_required
def combined_bitcoin_top_percent_history():
    print("[BITCOIN] Building combined top-percent history for all users")
    db = get_db()

    raw_world_population = request.args.get("world_population", str(DEFAULT_WORLD_POPULATION))
    try:
        world_population = float(raw_world_population)
    except (TypeError, ValueError):
        return {"message": "world_population must be numeric"}, 400

    if world_population <= 0:
        return {"message": "world_population must be greater than 0"}, 400

    earliest_by_user_cursor = db.bitcoin_holdings.aggregate(
        [
            {"$sort": {"user_id": 1, "recorded_at": 1, "_id": 1}},
            {
                "$group": {
                    "_id": "$user_id",
                    "bitcoin": {"$first": "$bitcoin"},
                }
            },
        ]
    )

    user_latest = {
        str(item["_id"]): _as_float(item.get("bitcoin", 0))
        for item in earliest_by_user_cursor
        if item.get("_id")
    }

    if not user_latest:
        return {
            "message": "Combined bitcoin top-percent history fetched",
            "history": [],
            "latest": None,
        }, 200

    cursor = db.bitcoin_holdings.find(
        {},
        {"user_id": 1, "recorded_at": 1, "bitcoin": 1},
    ).sort([("recorded_at", 1), ("_id", 1)])

    running_total = sum(user_latest.values())
    history = []
    latest = None

    for item in cursor:
        recorded_at = item.get("recorded_at")
        user_id = str(item.get("user_id"))
        if not recorded_at or not user_id:
            continue

        previous_value = user_latest.get(user_id, 0.0)
        current_value = _as_float(item.get("bitcoin", 0))
        running_total += current_value - previous_value
        user_latest[user_id] = current_value

        percentile = _safe_percentile(world_population, running_total)
        entry = {
            "recorded_at": recorded_at.isoformat(),
            "bitcoin": running_total,
            "top_percent": percentile,
            "world_population": world_population,
            "users_count": len(user_latest),
        }

        if history and history[-1]["recorded_at"] == entry["recorded_at"]:
            history[-1] = entry
            latest = history[-1]
        else:
            history.append(entry)
            latest = entry

    return {
        "message": "Combined bitcoin top-percent history fetched",
        "history": history,
        "latest": latest,
    }, 200
