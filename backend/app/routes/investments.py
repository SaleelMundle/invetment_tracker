from datetime import datetime, timezone

from bson import ObjectId
from flask import Blueprint, g, request

from app.db import get_db
from app.services.auth import login_required
from app.utils.serializers import serialize_document
from app.utils.validators import compute_net_worth, parse_investment_payload

investment_bp = Blueprint("investments", __name__)


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
        "loan_dues": values["loan_dues"],
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
        "loan_dues": values["loan_dues"],
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
