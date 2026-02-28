import { useEffect, useMemo, useState } from "react";

import { api } from "./services/api";
import { asCurrency, defaultInvestmentForm } from "./utils";

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [loginForm, setLoginForm] = useState({
    username: "saleel",
    password: "saleel_password",
  });

  const [users, setUsers] = useState([]);
  const [newUserForm, setNewUserForm] = useState({ username: "", password: "", role: "user" });

  const [investments, setInvestments] = useState([]);
  const [investmentForm, setInvestmentForm] = useState(defaultInvestmentForm);
  const [editingInvestmentId, setEditingInvestmentId] = useState("");
  const [history, setHistory] = useState([]);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!token) return;
    console.log("[APP] Existing token found, loading profile");
    loadCurrentUser(token);
  }, [token]);

  useEffect(() => {
    if (!token || !user) return;
    loadInvestments();
    loadNetWorthHistory();
    if (isAdmin) {
      loadUsers();
    }
  }, [token, user]);

  const latestNetWorth = useMemo(() => {
    if (!history.length) return 0;
    return history[history.length - 1].net_worth;
  }, [history]);

  const resetAlerts = () => {
    setMessage("");
    setError("");
  };

  const loadCurrentUser = async (authToken) => {
    try {
      resetAlerts();
      const response = await api.getMe(authToken);
      console.log("[APP] User profile loaded", response.user);
      setUser(response.user);
    } catch (err) {
      console.error("[APP] Failed to load current user", err);
      setError(err.message);
      handleForceLogout();
    }
  };

  const loadUsers = async () => {
    try {
      const response = await api.listUsers(token);
      setUsers(response.users || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const loadInvestments = async () => {
    try {
      const response = await api.listInvestments(token);
      setInvestments(response.investments || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const loadNetWorthHistory = async () => {
    try {
      const response = await api.getNetWorthHistory(token);
      setHistory(response.history || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    try {
      resetAlerts();
      const response = await api.login(loginForm.username, loginForm.password);
      setToken(response.token);
      localStorage.setItem("token", response.token);
      setUser(response.user);
      setMessage(`Welcome ${response.user.username}!`);
      console.log("[APP] Login successful");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleForceLogout = () => {
    setToken("");
    setUser(null);
    setUsers([]);
    setInvestments([]);
    setHistory([]);
    localStorage.removeItem("token");
  };

  const handleLogout = async () => {
    try {
      if (token) {
        await api.logout(token);
      }
    } catch (err) {
      console.warn("[APP] Logout API failed, clearing session locally", err);
    } finally {
      handleForceLogout();
      setMessage("Logged out successfully");
    }
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    try {
      resetAlerts();
      await api.createUser(token, newUserForm);
      setMessage("User created successfully");
      setNewUserForm({ username: "", password: "", role: "user" });
      loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteUser = async (userId) => {
    try {
      resetAlerts();
      await api.deleteUser(token, userId);
      setMessage("User deleted successfully");
      loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleResetPassword = async (userId) => {
    const newPassword = window.prompt("Enter new password for user:");
    if (!newPassword) return;
    try {
      resetAlerts();
      await api.updateUser(token, userId, { password: newPassword });
      setMessage("Password updated successfully");
    } catch (err) {
      setError(err.message);
    }
  };

  const normalizeInvestmentPayload = () => ({
    ...investmentForm,
    stocks: Number(investmentForm.stocks || 0),
    gold: Number(investmentForm.gold || 0),
    bitcoin: Number(investmentForm.bitcoin || 0),
    cash: Number(investmentForm.cash || 0),
    credit_card_dues: Number(investmentForm.credit_card_dues || 0),
    loan_dues: Number(investmentForm.loan_dues || 0),
    recorded_at: investmentForm.recorded_at || undefined,
  });

  const handleInvestmentSubmit = async (event) => {
    event.preventDefault();
    try {
      resetAlerts();
      const payload = normalizeInvestmentPayload();

      if (editingInvestmentId) {
        await api.updateInvestment(token, editingInvestmentId, payload);
        setMessage("Investment updated successfully");
      } else {
        await api.createInvestment(token, payload);
        setMessage("Investment saved successfully");
      }

      setInvestmentForm(defaultInvestmentForm);
      setEditingInvestmentId("");
      loadInvestments();
      loadNetWorthHistory();
    } catch (err) {
      setError(err.message);
    }
  };

  const startEditInvestment = (investment) => {
    setEditingInvestmentId(investment._id);
    setInvestmentForm({
      stocks: investment.stocks,
      gold: investment.gold,
      bitcoin: investment.bitcoin,
      cash: investment.cash,
      credit_card_dues: investment.credit_card_dues,
      loan_dues: investment.loan_dues,
      recorded_at: investment.recorded_at?.slice(0, 16) || "",
    });
  };

  const handleDeleteInvestment = async (investmentId) => {
    try {
      resetAlerts();
      await api.deleteInvestment(token, investmentId);
      setMessage("Investment deleted successfully");
      loadInvestments();
      loadNetWorthHistory();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!token || !user) {
    return (
      <div className="page centered">
        <div className="card">
          <h1>Investment Tracker</h1>
          <p>Please login to continue.</p>
          <form onSubmit={handleLogin} className="form-grid">
            <label>
              Username
              <input
                value={loginForm.username}
                onChange={(event) =>
                  setLoginForm((prev) => ({ ...prev, username: event.target.value }))
                }
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) =>
                  setLoginForm((prev) => ({ ...prev, password: event.target.value }))
                }
              />
            </label>
            <button type="submit">Login</button>
          </form>
          {error && <p className="error">{error}</p>}
          <p className="hint">Default admin: saleel / saleel_password</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>Investment Tracker Dashboard</h1>
          <p>
            Logged in as <strong>{user.username}</strong> ({user.role})
          </p>
          <p>
            Latest Net Worth: <strong>{asCurrency(latestNetWorth)}</strong>
          </p>
        </div>
        <button onClick={handleLogout}>Logout</button>
      </header>

      {message && <p className="message">{message}</p>}
      {error && <p className="error">{error}</p>}

      <section className="grid two-columns">
        <div className="card">
          <h2>{editingInvestmentId ? "Edit Investment" : "Add Investment"}</h2>
          <form onSubmit={handleInvestmentSubmit} className="form-grid">
            {[
              ["stocks", "Stocks"],
              ["gold", "Gold"],
              ["bitcoin", "Bitcoin"],
              ["cash", "Cash"],
              ["credit_card_dues", "Credit Card Dues"],
              ["loan_dues", "Loan Dues"],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  step="0.01"
                  value={investmentForm[key]}
                  onChange={(event) =>
                    setInvestmentForm((prev) => ({ ...prev, [key]: event.target.value }))
                  }
                  required
                />
              </label>
            ))}

            <label>
              Recorded At (optional)
              <input
                type="datetime-local"
                value={investmentForm.recorded_at}
                onChange={(event) =>
                  setInvestmentForm((prev) => ({ ...prev, recorded_at: event.target.value }))
                }
              />
            </label>

            <div className="row">
              <button type="submit">{editingInvestmentId ? "Update" : "Save"} Investment</button>
              {editingInvestmentId && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setEditingInvestmentId("");
                    setInvestmentForm(defaultInvestmentForm);
                  }}
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="card">
          <h2>Net Worth Trend</h2>
          <SimpleNetWorthChart data={history} />
        </div>
      </section>

      <section className="card">
        <h2>Investment History</h2>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Recorded At</th>
                <th>Stocks</th>
                <th>Gold</th>
                <th>Bitcoin</th>
                <th>Cash</th>
                <th>Credit Dues</th>
                <th>Loan Dues</th>
                <th>Net Worth</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {investments.map((investment) => (
                <tr key={investment._id}>
                  <td>{new Date(investment.recorded_at).toLocaleString()}</td>
                  <td>{asCurrency(investment.stocks)}</td>
                  <td>{asCurrency(investment.gold)}</td>
                  <td>{asCurrency(investment.bitcoin)}</td>
                  <td>{asCurrency(investment.cash)}</td>
                  <td>{asCurrency(investment.credit_card_dues)}</td>
                  <td>{asCurrency(investment.loan_dues)}</td>
                  <td>
                    <strong>{asCurrency(investment.net_worth)}</strong>
                  </td>
                  <td>
                    <div className="row">
                      <button type="button" className="secondary" onClick={() => startEditInvestment(investment)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => handleDeleteInvestment(investment._id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {isAdmin && (
        <section className="card">
          <h2>Admin - Manage Users</h2>
          <form onSubmit={handleCreateUser} className="form-grid three-columns">
            <label>
              Username
              <input
                value={newUserForm.username}
                onChange={(event) =>
                  setNewUserForm((prev) => ({ ...prev, username: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={newUserForm.password}
                onChange={(event) =>
                  setNewUserForm((prev) => ({ ...prev, password: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Role
              <select
                value={newUserForm.role}
                onChange={(event) => setNewUserForm((prev) => ({ ...prev, role: event.target.value }))}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <button type="submit">Create User</button>
          </form>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((entry) => (
                  <tr key={entry._id}>
                    <td>{entry.username}</td>
                    <td>{entry.role}</td>
                    <td>{new Date(entry.created_at).toLocaleString()}</td>
                    <td>
                      <div className="row">
                        <button type="button" className="secondary" onClick={() => handleResetPassword(entry._id)}>
                          Change Password
                        </button>
                        {entry.role !== "admin" && (
                          <button type="button" className="danger" onClick={() => handleDeleteUser(entry._id)}>
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function SimpleNetWorthChart({ data }) {
  if (!data.length) {
    return <p className="hint">No net worth history yet. Add your first investment entry.</p>;
  }

  const width = 560;
  const height = 260;
  const padding = 30;

  const values = data.map((item) => Number(item.net_worth));
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;

  const points = data
    .map((item, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(data.length - 1, 1);
      const y = height - padding - ((item.net_worth - minValue) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="chart">
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#94a3b8" />
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="#94a3b8"
        />
        <polyline points={points} fill="none" stroke="#0ea5e9" strokeWidth="3" />
      </svg>
      <p className="hint">
        Min: {asCurrency(minValue)} | Max: {asCurrency(maxValue)}
      </p>
    </div>
  );
}

export default App;
