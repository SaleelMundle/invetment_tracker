from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from flask import Blueprint, g, request

from app.db import get_db
from app.services.auth import login_required
from app.utils.serializers import serialize_document
from app.utils.validators import compute_net_worth, parse_investment_payload

investment_bp = Blueprint("investments", __name__)


def _as_float(value: Any) -> float:
    try:
        if value is None:
            return 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0


@investment_bp.post("")
@login_required
def create_investment():
    payload = request.get_json(silent=True) or {}
    print(f"[INVESTMENT] Create payload received for user={g.current_user.get('username')}")

    values, errors = parse_investment_payload(payload)
    if errors:
        print(f"[INVESTMENT] Validation errors: {errors}")
        return {"message": "Validation failed", "errors": errors}, 400

    recorded_at = values.get("recorded_at", datetime.now(timezone.utc))
    net_worth = compute_net_worth(values)

    db = get_db()
    investment_doc = {
        "user_id": g.current_user["_id"],
        "recorded_at": recorded_at,
        "stocks": values["stocks"],
        "gold": values["gold"],
        "bitcoin": values["bitcoin"],
        "cash": values["cash"],
        "credit_card_dues": values["credit_card_dues"],
        "total_loan_taken": values["total_loan_taken"],
        "loan_repaid": values["loan_repaid"],
        "net_worth": net_worth,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }

    result = db.investments.insert_one(investment_doc)
    created = db.investments.find_one({"_id": result.inserted_id})

    print(f"[INVESTMENT] Investment created with id={result.inserted_id}")
    return {
        "message": "Investment saved successfully",
        "investment": serialize_document(created),
    }, 201


@investment_bp.get("")
@login_required
def list_investments():
    print(f"[INVESTMENT] Listing investments for user={g.current_user.get('username')}")
    db = get_db()
    investments = list(
        db.investments.find({"user_id": g.current_user["_id"]}).sort("recorded_at", -1)
    )
    return {
        "message": "Investments fetched successfully",
        "investments": serialize_document(investments),
    }, 200


@investment_bp.get("/net-worth-history")
@login_required
def net_worth_history():
    print(f"[INVESTMENT] Building net worth history for user={g.current_user.get('username')}")
    db = get_db()
    cursor = db.investments.find(
        {"user_id": g.current_user["_id"]},
        {"recorded_at": 1, "net_worth": 1},
    ).sort("recorded_at", 1)

    history = [
        {
            "recorded_at": item["recorded_at"].isoformat(),
            "net_worth": item["net_worth"],
        }
        for item in cursor
    ]
    return {"message": "Net worth history fetched", "history": history}, 200


@investment_bp.get("/combined-summary")
@login_required
def combined_summary():
    print("[INVESTMENT] Building combined summary for all users")
    db = get_db()

    aggregated = list(
        db.investments.aggregate(
            [
                {"$sort": {"user_id": 1, "recorded_at": -1, "_id": -1}},
                {
                    "$group": {
                        "_id": "$user_id",
                        "stocks": {"$first": "$stocks"},
                        "gold": {"$first": "$gold"},
                        "bitcoin": {"$first": "$bitcoin"},
                        "cash": {"$first": "$cash"},
                        "credit_card_dues": {"$first": "$credit_card_dues"},
                        "total_loan_taken": {"$first": "$total_loan_taken"},
                        "loan_repaid": {"$first": "$loan_repaid"},
                        "net_worth": {"$first": "$net_worth"},
                        "recorded_at": {"$first": "$recorded_at"},
                    }
                },
                {
                    "$group": {
                        "_id": None,
                        "stocks": {"$sum": "$stocks"},
                        "gold": {"$sum": "$gold"},
                        "bitcoin": {"$sum": "$bitcoin"},
                        "cash": {"$sum": "$cash"},
                        "credit_card_dues": {"$sum": "$credit_card_dues"},
                        "total_loan_taken": {"$sum": "$total_loan_taken"},
                        "loan_repaid": {"$sum": "$loan_repaid"},
                        "net_worth": {"$sum": "$net_worth"},
                        "users_count": {"$sum": 1},
                        "latest_recorded_at": {"$max": "$recorded_at"},
                    }
                },
            ]
        )
    )

    summary = aggregated[0] if aggregated else {}
    return {
        "message": "Combined investment summary fetched",
        "summary": {
            "stocks": summary.get("stocks", 0),
            "gold": summary.get("gold", 0),
            "bitcoin": summary.get("bitcoin", 0),
            "cash": summary.get("cash", 0),
            "credit_card_dues": summary.get("credit_card_dues", 0),
            "total_loan_taken": summary.get("total_loan_taken", 0),
            "loan_repaid": summary.get("loan_repaid", 0),
            "net_worth": summary.get("net_worth", 0),
            "users_count": summary.get("users_count", 0),
            "latest_recorded_at": (
                summary.get("latest_recorded_at").isoformat()
                if summary.get("latest_recorded_at")
                else None
            ),
        },
    }, 200


@investment_bp.get("/combined-net-worth-history")
@login_required
def combined_net_worth_history():
    print("[INVESTMENT] Building combined net worth history for all users")
    db = get_db()

    earliest_by_user_cursor = db.investments.aggregate(
        [
            {"$sort": {"user_id": 1, "recorded_at": 1, "_id": 1}},
            {
                "$group": {
                    "_id": "$user_id",
                    "net_worth": {"$first": "$net_worth"},
                }
            },
        ]
    )

    user_latest = {
        str(item["_id"]): _as_float(item.get("net_worth", 0))
        for item in earliest_by_user_cursor
        if item.get("_id")
    }

    if not user_latest:
        return {"message": "Combined net worth history fetched", "history": []}, 200

    cursor = db.investments.find(
        {},
        {"user_id": 1, "recorded_at": 1, "net_worth": 1},
    ).sort([("recorded_at", 1), ("_id", 1)])

    running_total = sum(user_latest.values())
    history: list[dict[str, Any]] = []

    for item in cursor:
        recorded_at = item.get("recorded_at")
        user_id = str(item.get("user_id"))
        if not recorded_at or not user_id:
            continue

        previous_value = user_latest.get(user_id, 0.0)
        current_value = _as_float(item.get("net_worth", 0))
        running_total += current_value - previous_value
        user_latest[user_id] = current_value

        entry = {
            "recorded_at": recorded_at.isoformat(),
            "net_worth": running_total,
            "users_count": len(user_latest),
        }

        if history and history[-1]["recorded_at"] == entry["recorded_at"]:
            history[-1] = entry
        else:
            history.append(entry)

    return {"message": "Combined net worth history fetched", "history": history}, 200


@investment_bp.get("/combined-asset-timeline")
@login_required
def combined_asset_timeline():
    print("[INVESTMENT] Building combined asset timeline for all users")
    db = get_db()

    fields = [
        "stocks",
        "gold",
        "bitcoin",
        "cash",
        "credit_card_dues",
        "total_loan_taken",
        "loan_repaid",
        "net_worth",
    ]

    earliest_pipeline = [
        {"$sort": {"user_id": 1, "recorded_at": 1, "_id": 1}},
        {
            "$group": {
                "_id": "$user_id",
                **{field: {"$first": f"${field}"} for field in fields},
            }
        },
    ]

    user_latest = {
        str(item["_id"]): {field: _as_float(item.get(field, 0)) for field in fields}
        for item in db.investments.aggregate(earliest_pipeline)
        if item.get("_id")
    }

    if not user_latest:
        return {"message": "Combined asset timeline fetched", "timeline": []}, 200

    totals = {
        field: sum(user_values[field] for user_values in user_latest.values())
        for field in fields
    }

    projection = {"user_id": 1, "recorded_at": 1, **{field: 1 for field in fields}}
    cursor = db.investments.find({}, projection).sort([("recorded_at", 1), ("_id", 1)])

    timeline: list[dict[str, Any]] = []

    for item in cursor:
        recorded_at = item.get("recorded_at")
        user_id = str(item.get("user_id"))
        if not recorded_at or not user_id:
            continue

        previous_values = user_latest.get(user_id, {field: 0.0 for field in fields})
        current_values = {field: _as_float(item.get(field, 0)) for field in fields}

        for field in fields:
            totals[field] += current_values[field] - previous_values.get(field, 0.0)

        user_latest[user_id] = current_values

        entry = {
            "recorded_at": recorded_at.isoformat(),
            **totals,
            "users_count": len(user_latest),
        }

        if timeline and timeline[-1]["recorded_at"] == entry["recorded_at"]:
            timeline[-1] = entry
        else:
            timeline.append(entry)

    return {"message": "Combined asset timeline fetched", "timeline": timeline}, 200


@investment_bp.put("/<investment_id>")
@login_required
def update_investment(investment_id: str):
    payload = request.get_json(silent=True) or {}
    print(f"[INVESTMENT] Update request for investment_id={investment_id}")

    values, errors = parse_investment_payload(payload)
    if errors:
        print(f"[INVESTMENT] Validation errors: {errors}")
        return {"message": "Validation failed", "errors": errors}, 400

    recorded_at = values.get("recorded_at", datetime.now(timezone.utc))
    net_worth = compute_net_worth(values)

    update_doc = {
        "recorded_at": recorded_at,
        "stocks": values["stocks"],
        "gold": values["gold"],
        "bitcoin": values["bitcoin"],
        "cash": values["cash"],
        "credit_card_dues": values["credit_card_dues"],
        "total_loan_taken": values["total_loan_taken"],
        "loan_repaid": values["loan_repaid"],
        "net_worth": net_worth,
        "updated_at": datetime.now(timezone.utc),
    }

    db = get_db()
    try:
        result = db.investments.update_one(
            {"_id": ObjectId(investment_id), "user_id": g.current_user["_id"]},
            {"$set": update_doc},
        )
    except Exception:
        return {"message": "Invalid investment id"}, 400

    if result.matched_count == 0:
        return {"message": "Investment not found"}, 404

    updated = db.investments.find_one({"_id": ObjectId(investment_id)})
    print(f"[INVESTMENT] Investment {investment_id} updated")
    return {
        "message": "Investment updated successfully",
        "investment": serialize_document(updated),
    }, 200


@investment_bp.delete("/<investment_id>")
@login_required
def delete_investment(investment_id: str):
    print(f"[INVESTMENT] Delete request for investment_id={investment_id}")
    db = get_db()

    try:
        result = db.investments.delete_one(
            {"_id": ObjectId(investment_id), "user_id": g.current_user["_id"]}
        )
    except Exception:
        return {"message": "Invalid investment id"}, 400

    if result.deleted_count == 0:
        return {"message": "Investment not found"}, 404

    print(f"[INVESTMENT] Investment {investment_id} deleted")
    return {"message": "Investment deleted successfully"}, 200
