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

- **Username:** `saleel` (or `ADMIN_USERNAME` env var)
- **Password:** `saleel_password` (or `ADMIN_PASSWORD` env var)

> ⚠️ For cloud deployment, always set a strong `ADMIN_PASSWORD` in backend environment variables.

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

---

## Deploy to Cloud (Recommended: Vercel + Render + MongoDB Atlas)

This setup makes your app accessible from anywhere with stable public HTTPS URLs.

### Architecture

- **Frontend:** Vercel (`frontend/`)
- **Backend API:** Render Web Service (`backend/`)
- **Database:** MongoDB Atlas

---

### 1) Create MongoDB Atlas database

1. Go to MongoDB Atlas and create a free cluster.
2. Create a database user (username/password).
3. In **Network Access**, allow Render egress (for quick start you can allow `0.0.0.0/0`, then tighten later).
4. Copy connection string and set db name to `investment_tracker` (or your preferred db name).

You will use it as:

```text
MONGO_URI=mongodb+srv://<user>:<password>@<cluster-url>/?retryWrites=true&w=majority
MONGO_DB_NAME=investment_tracker
```

---

### 2) Deploy backend on Render

This repo includes a root `render.yaml` blueprint.

1. Push code to GitHub.
2. In Render: **New +** → **Blueprint** → connect this repo.
3. Render will create service `investment-tracker-api` using:
   - `rootDir: backend`
   - `startCommand: gunicorn run:app`
4. In Render service environment variables, set:
   - `MONGO_URI` = your Atlas URI
   - `MONGO_DB_NAME` = `investment_tracker`
   - `ADMIN_USERNAME` = your admin username
   - `ADMIN_PASSWORD` = strong password
   - `SESSION_DURATION_HOURS` = `24` (or your choice)
   - `CORS_ORIGINS` = `https://<your-vercel-domain>`
   - `FLASK_DEBUG` = `False`
5. Deploy and verify:

```text
https://<your-render-service>.onrender.com/api/health
```

Expected response:

```json
{"status":"ok","message":"Investment tracker backend is running"}
```

---

### 3) Deploy frontend on Vercel

1. In Vercel: **Add New Project** → import this repo.
2. Set **Root Directory** to `frontend`.
3. Framework preset: **Vite**.
4. Add environment variable:

```text
VITE_API_BASE_URL=https://<your-render-service>.onrender.com/api
```

5. Deploy.

After deploy, open your Vercel URL and test login + API actions.

---

### 4) Final production checks

- Frontend loads over HTTPS from Vercel URL.
- Login works with your configured admin credentials.
- `GET /api/health` works on Render.
- Create/update/delete investment entries works.
- Confirm `CORS_ORIGINS` is set to your Vercel domain (not `*`) in production.

---

### Deployment files added/updated in this repo

- `render.yaml` (Render blueprint config)
- `backend/requirements.txt` (`gunicorn` added)
- `backend/.env.example` (cloud-ready env vars)
- `backend/app/__init__.py` (CORS now configurable via `CORS_ORIGINS`)
- `backend/app/constants.py` (admin/session values now env-driven)
- `frontend/.env.example` (production API base template)
