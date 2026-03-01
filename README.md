# Investment Tracker (React + Flask + MongoDB)

This project is a full-stack web application to track user investments over time.

- **Frontend:** React (Vite)
- **Backend:** Flask (Python)
- **Database:** MongoDB using PyMongo
- **Current auth mode:** Session token auth with a seeded admin user

The application supports:

1. Login/logout
2. Admin user management (create/update/delete users)
3. Investment entry per user with timestamp
4. Net worth calculation per entry:

```text
loan_due = total_loan_taken - loan_repaid
net_worth = stocks + gold + bitcoin + cash - credit_card_dues - loan_due
```

5. Net worth history API + chart on frontend
6. Multiple source inputs per investment type (e.g. cash from multiple banks), summed before saving

---

## Default Admin Login

On backend startup, a default admin is auto-created (if not already present):

- **Username:** `saleel`
- **Password:** `saleel_password`

---

## Project Structure

```text
invetment_tracker/
├── backend/
│   ├── app/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── __init__.py
│   │   ├── constants.py
│   │   └── db.py
│   ├── .env.example
│   ├── requirements.txt
│   └── run.py
├── frontend/
│   ├── src/
│   │   ├── services/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── package.json
│   ├── vite.config.js
│   └── index.html
└── README.md
```

---

## Prerequisites

Make sure the following are installed:

- Python 3.10+
- Node.js 18+
- MongoDB running at `mongodb://localhost:27017`

---

## Backend Setup (Flask)

From project root:

```bash
cd backend
python -m venv venv
```

### Activate virtual environment

**Windows (PowerShell):**

```bash
venv\Scripts\Activate.ps1
```

**Windows (CMD):**

```bash
venv\Scripts\activate.bat
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Create `.env` file:

```bash
copy .env.example .env
```

Run backend:

```bash
python run.py
```

Backend will start on: `http://localhost:5000`

Health check:

```text
GET http://localhost:5000/api/health
```

---

## Frontend Setup (React + Vite)

From project root:

```bash
cd frontend
npm install
npm run dev
```

Frontend will run on: `http://localhost:5173`

---

## API Summary

### Auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Admin (admin role required)

- `GET /api/admin/users`
- `POST /api/admin/users`
- `PUT /api/admin/users/<user_id>`
- `DELETE /api/admin/users/<user_id>`

### Investments (logged-in user)

- `POST /api/investments`
- `GET /api/investments`
- `PUT /api/investments/<investment_id>`
- `DELETE /api/investments/<investment_id>`
- `GET /api/investments/net-worth-history`

---

## Notes

- Backend contains detailed `print(...)` logs for clarity of runtime flow.
- User sessions are stored in MongoDB with expiry.
- Admin user cannot be deleted by API guard.
- Frontend communicates **only via Flask APIs**.

---

## Next Planned Enhancements

- Stronger authentication/authorization strategy (JWT/refresh or secure session strategy)
- Better admin UX for editing user metadata
- Rich investment performance analytics and advanced charting
- Validation hardening and automated tests
