import os

INVESTMENT_FIELDS = [
    "stocks",
    "gold",
    "bitcoin",
    "cash",
    "credit_card_dues",
    "total_loan_taken",
    "loan_repaid",
]

BITCOIN_MAX_DECIMALS = 8
BITCOIN_TOTAL_SUPPLY = 21_000_000
DEFAULT_WORLD_POPULATION = 8_200_000_000

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "saleel")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "saleel_password")
SESSION_DURATION_HOURS = int(os.getenv("SESSION_DURATION_HOURS", "24"))
