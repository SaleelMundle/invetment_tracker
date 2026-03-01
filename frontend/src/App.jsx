import { useEffect, useMemo, useState } from "react";

import { api } from "./services/api";
import { asCurrency, defaultInvestmentForm, lakhToRupees, rupeesToLakh } from "./utils";

const INVESTMENT_SOURCE_FIELDS = [
  ["stocks", "Stocks"],
  ["gold", "Gold"],
  ["bitcoin", "Bitcoin"],
  ["cash", "Cash"],
  ["credit_card_dues", "Credit Card Dues"],
  ["total_loan_taken", "Total Loan Taken"],
  ["loan_repaid", "Loan Repaid"],
];

const IST_TIME_ZONE = "Asia/Kolkata";

const formatISTDateTime = (value) =>
  new Date(value).toLocaleString("en-IN", {
    timeZone: IST_TIME_ZONE,
  });

const toISTDateTimeLocalValue = (value) => {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const getPart = (type) => parts.find((part) => part.type === type)?.value || "";

  return `${getPart("year")}-${getPart("month")}-${getPart("day")}T${getPart("hour")}:${getPart("minute")}`;
};

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [activePage, setActivePage] = useState("add-investment");

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
  const [assetTimelineIndex, setAssetTimelineIndex] = useState(0);

  const isAdmin = user?.role === "admin";

  const navItems = [
    { key: "add-investment", label: "Add Investment" },
    { key: "net-worth-trend", label: "Net Worth Trend" },
    { key: "asset-allocation", label: "Asset Allocation" },
    { key: "investment-history", label: "Investment History (₹ Lakh)" },
    ...(isAdmin ? [{ key: "manage-users", label: "Admin - Manage Users" }] : []),
  ];

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

  useEffect(() => {
    if (!isAdmin && activePage === "manage-users") {
      setActivePage("add-investment");
    }
  }, [activePage, isAdmin]);

  const latestNetWorth = useMemo(() => {
    if (!history.length) return 0;
    return history[history.length - 1].net_worth;
  }, [history]);

  const investmentsByRecordedDate = useMemo(() => {
    const getTimeValue = (value) => {
      const time = new Date(value?.recorded_at).getTime();
      return Number.isNaN(time) ? 0 : time;
    };

    return [...investments].sort((a, b) => getTimeValue(a) - getTimeValue(b));
  }, [investments]);

  useEffect(() => {
    if (!investmentsByRecordedDate.length) {
      setAssetTimelineIndex(0);
      return;
    }

    setAssetTimelineIndex(investmentsByRecordedDate.length - 1);
  }, [investmentsByRecordedDate.length]);

  const selectedInvestmentEntry = useMemo(() => {
    if (!investmentsByRecordedDate.length) return null;

    const clampedIndex = Math.min(
      Math.max(assetTimelineIndex, 0),
      investmentsByRecordedDate.length - 1
    );

    return investmentsByRecordedDate[clampedIndex] || null;
  }, [assetTimelineIndex, investmentsByRecordedDate]);

  const assetPieData = useMemo(() => {
    if (!selectedInvestmentEntry) {
      return { total: 0, slices: [] };
    }

    const slices = [
      { key: "stocks", label: "Stocks", color: "#0ea5e9", value: Number(selectedInvestmentEntry.stocks || 0) },
      { key: "gold", label: "Gold", color: "#f59e0b", value: Number(selectedInvestmentEntry.gold || 0) },
      { key: "bitcoin", label: "Bitcoin", color: "#f97316", value: Number(selectedInvestmentEntry.bitcoin || 0) },
    ];

    const total = slices.reduce((sum, slice) => sum + slice.value, 0);

    return {
      total,
      slices: slices.map((slice) => ({
        ...slice,
        percentage: total > 0 ? (slice.value / total) * 100 : 0,
      })),
    };
  }, [selectedInvestmentEntry]);

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

  const handleLogout = () => {
    const currentToken = token;

    handleForceLogout();
    setMessage("Logged out successfully");

    if (currentToken) {
      api.logout(currentToken).catch((err) => {
        console.warn("[APP] Background logout API failed", err);
      });
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

  const sumSourceValues = (entries = []) =>
    entries.reduce((total, value) => total + lakhToRupees(value), 0);

  const normalizeInvestmentPayload = () => ({
    stocks: sumSourceValues(investmentForm.stocks),
    gold: sumSourceValues(investmentForm.gold),
    bitcoin: sumSourceValues(investmentForm.bitcoin),
    cash: sumSourceValues(investmentForm.cash),
    credit_card_dues: sumSourceValues(investmentForm.credit_card_dues),
    total_loan_taken: sumSourceValues(investmentForm.total_loan_taken),
    loan_repaid: sumSourceValues(investmentForm.loan_repaid),
    recorded_at: investmentForm.recorded_at || undefined,
  });

  const updateSourceValue = (field, index, value) => {
    setInvestmentForm((prev) => ({
      ...prev,
      [field]: prev[field].map((entry, entryIndex) => (entryIndex === index ? value : entry)),
    }));
  };

  const addSourceInput = (field) => {
    setInvestmentForm((prev) => ({
      ...prev,
      [field]: [...prev[field], ""],
    }));
  };

  const removeSourceInput = (field, index) => {
    setInvestmentForm((prev) => {
      const filtered = prev[field].filter((_, entryIndex) => entryIndex !== index);
      return {
        ...prev,
        [field]: filtered.length ? filtered : [""],
      };
    });
  };

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
    const totalLoanTaken = investment.total_loan_taken ?? investment.loan_dues ?? 0;
    const loanRepaid = investment.loan_repaid ?? 0;

    setEditingInvestmentId(investment._id);
    setActivePage("add-investment");
    setInvestmentForm({
      stocks: [String(rupeesToLakh(investment.stocks))],
      gold: [String(rupeesToLakh(investment.gold))],
      bitcoin: [String(rupeesToLakh(investment.bitcoin))],
      cash: [String(rupeesToLakh(investment.cash))],
      credit_card_dues: [String(rupeesToLakh(investment.credit_card_dues))],
      total_loan_taken: [String(rupeesToLakh(totalLoanTaken))],
      loan_repaid: [String(rupeesToLakh(loanRepaid))],
      recorded_at: toISTDateTimeLocalValue(investment.recorded_at),
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

      <nav className="top-nav">
        {navItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`nav-button ${activePage === item.key ? "active" : ""}`}
            onClick={() => setActivePage(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {message && <p className="message">{message}</p>}
      {error && <p className="error">{error}</p>}

      <main className="page-content">
        {activePage === "add-investment" && (
          <section className="card page-card">
          <h2>{editingInvestmentId ? "Edit Investment" : "Add Investment"}</h2>
          <p className="hint">Enter all amounts in ₹ Lakh.</p>
          <form onSubmit={handleInvestmentSubmit} className="form-grid">
            {INVESTMENT_SOURCE_FIELDS.map(([key, label]) => (
              <div key={key} className="source-group">
                <div className="row source-group-header">
                  <label>{label}</label>
                  <button type="button" className="secondary" onClick={() => addSourceInput(key)}>
                    + Add Source
                  </button>
                </div>
                <div className="source-list">
                  {investmentForm[key].map((entry, index) => (
                    <div key={`${key}-${index}`} className="row source-row">
                      <input
                        type="number"
                        step="0.01"
                        value={entry}
                        onChange={(event) => updateSourceValue(key, index, event.target.value)}
                        required
                      />
                      {investmentForm[key].length > 1 && (
                        <button
                          type="button"
                          className="danger"
                          onClick={() => removeSourceInput(key, index)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
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
          </section>
        )}

        {activePage === "net-worth-trend" && (
          <section className="card page-card">
            <h2>Net Worth Trend</h2>
            <SimpleNetWorthChart data={history} />
          </section>
        )}

        {activePage === "asset-allocation" && (
          <section className="card page-card">
            <h2>Latest Asset Allocation (Stocks + Gold + Bitcoin)</h2>
            {investmentsByRecordedDate.length > 0 && (
              <div className="asset-timeline-control">
                <label htmlFor="assetTimelineSlider">
                  Record: <strong>{assetTimelineIndex + 1}</strong> / {investmentsByRecordedDate.length}
                </label>
                <input
                  id="assetTimelineSlider"
                  type="range"
                  min="0"
                  max={Math.max(investmentsByRecordedDate.length - 1, 0)}
                  step="1"
                  value={Math.min(assetTimelineIndex, Math.max(investmentsByRecordedDate.length - 1, 0))}
                  onChange={(event) => setAssetTimelineIndex(Number(event.target.value))}
                />
                <p className="hint">
                  Showing record date: {selectedInvestmentEntry?.recorded_at
                    ? formatISTDateTime(selectedInvestmentEntry.recorded_at)
                    : "N/A"}
                </p>
              </div>
            )}
            <SimpleAssetPieChart
              total={assetPieData.total}
              slices={assetPieData.slices}
              recordedAt={selectedInvestmentEntry?.recorded_at}
            />
          </section>
        )}

        {activePage === "investment-history" && (
          <section className="card page-card">
            <h2>Investment History (₹ Lakh)</h2>
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
                    <th>Total Loan Taken</th>
                    <th>Loan Repaid</th>
                    <th>Loan Due</th>
                    <th>Net Worth</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {investments.map((investment) => (
                    <tr key={investment._id}>
                      {(() => {
                        const totalLoanTaken = investment.total_loan_taken ?? investment.loan_dues ?? 0;
                        const loanRepaid = investment.loan_repaid ?? 0;
                        const loanDue = totalLoanTaken - loanRepaid;

                        return (
                          <>
                            <td>{formatISTDateTime(investment.recorded_at)}</td>
                            <td>{asCurrency(investment.stocks)}</td>
                            <td>{asCurrency(investment.gold)}</td>
                            <td>{asCurrency(investment.bitcoin)}</td>
                            <td>{asCurrency(investment.cash)}</td>
                            <td>{asCurrency(investment.credit_card_dues)}</td>
                            <td>{asCurrency(totalLoanTaken)}</td>
                            <td>{asCurrency(loanRepaid)}</td>
                            <td>{asCurrency(loanDue)}</td>
                          </>
                        );
                      })()}
                      <td>
                        <strong>{asCurrency(investment.net_worth)}</strong>
                      </td>
                      <td>
                        <div className="row">
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => startEditInvestment(investment)}
                          >
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
        )}

        {isAdmin && activePage === "manage-users" && (
          <section className="card page-card">
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
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => handleResetPassword(entry._id)}
                          >
                            Change Password
                          </button>
                          {entry.role !== "admin" && (
                            <button
                              type="button"
                              className="danger"
                              onClick={() => handleDeleteUser(entry._id)}
                            >
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
      </main>
    </div>
  );
}

function SimpleNetWorthChart({ data }) {
  if (!data.length) {
    return <p className="hint">No net worth history yet. Add your first investment entry.</p>;
  }

  const width = 560;
  const height = 260;
  const padding = { top: 20, right: 34, bottom: 48, left: 78 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const values = data.map((item) => Number(item.net_worth));
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;

  const points = data
    .map((item, index) => {
      const x = padding.left + (index * plotWidth) / Math.max(data.length - 1, 1);
      const y = padding.top + (1 - (item.net_worth - minValue) / range) * plotHeight;
      return `${x},${y}`;
    })
    .join(" ");

  const formatAxisValue = (value) =>
    `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(rupeesToLakh(value))} L`;

  const yTicks = Array.from({ length: 3 }, (_, index) => {
    const ratio = index / 2;
    const value = maxValue - ratio * range;
    const y = padding.top + ratio * plotHeight;
    return { y, value };
  });

  const maxXLabels = Math.max(2, Math.floor(plotWidth / 90));
  const xLabelCount = Math.min(data.length, maxXLabels);
  const xLabelIndices = Array.from({ length: xLabelCount }, (_, idx) =>
    Math.round((idx * (data.length - 1)) / Math.max(xLabelCount - 1, 1))
  ).filter((value, index, arr) => arr.indexOf(value) === index);

  const compactDateFormat = data.length > 20;
  const xLabels = xLabelIndices.map((index) => ({
    x: padding.left + (index * plotWidth) / Math.max(data.length - 1, 1),
    label: new Date(data[index].recorded_at).toLocaleDateString("en-IN", {
      timeZone: IST_TIME_ZONE,
      day: compactDateFormat ? undefined : "2-digit",
      month: "short",
      year: compactDateFormat ? "2-digit" : "numeric",
    }),
    index,
  }));

  const pointRenderStep = Math.max(1, Math.ceil(data.length / 80));
  const visiblePointIndices = new Set(
    data
      .map((_, idx) => idx)
      .filter((idx) => idx % pointRenderStep === 0 || idx === data.length - 1)
  );

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="chart">
        {yTicks.map((tick, index) => (
          <g key={`y-tick-${index}`}>
            <line
              x1={padding.left}
              y1={tick.y}
              x2={width - padding.right}
              y2={tick.y}
              stroke="#e2e8f0"
              strokeDasharray="4 4"
            />
            <text x={padding.left - 10} y={tick.y + 4} textAnchor="end" fontSize="10" fill="#475569">
              {formatAxisValue(tick.value)}
            </text>
          </g>
        ))}

        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={height - padding.bottom}
          stroke="#94a3b8"
        />
        <line
          x1={padding.left}
          y1={height - padding.bottom}
          x2={width - padding.right}
          y2={height - padding.bottom}
          stroke="#94a3b8"
        />

        <polyline points={points} fill="none" stroke="#0ea5e9" strokeWidth="3" />

        {data.map((item, index) => {
          if (!visiblePointIndices.has(index)) return null;

          const x = padding.left + (index * plotWidth) / Math.max(data.length - 1, 1);
          const y = padding.top + (1 - (item.net_worth - minValue) / range) * plotHeight;

          return (
            <g key={`point-${item.recorded_at}-${index}`}>
              <circle cx={x} cy={y} r="3.5" fill="#0ea5e9" />
              <title>
                {formatISTDateTime(item.recorded_at)} — {asCurrency(item.net_worth)}
              </title>
            </g>
          );
        })}

        {xLabels.map((tick, index) => (
          <text
            key={`x-label-${index}`}
            x={tick.x}
            y={height - padding.bottom + 16}
            textAnchor={index === 0 ? "start" : index === xLabels.length - 1 ? "end" : "middle"}
            fontSize="10"
            fill="#475569"
          >
            {tick.label}
          </text>
        ))}

        <text
          x={-height / 2}
          y={12}
          transform="rotate(-90)"
          textAnchor="middle"
          fontSize="11"
          fill="#334155"
          fontWeight="600"
        >
          Net Worth (₹ Lakh)
        </text>
        <text
          x={width / 2}
          y={height - 4}
          textAnchor="middle"
          fontSize="11"
          fill="#334155"
          fontWeight="600"
        >
          Recorded Date
        </text>
      </svg>
      <p className="hint">
        Min: {asCurrency(minValue)} | Max: {asCurrency(maxValue)}
      </p>
    </div>
  );
}

function SimpleAssetPieChart({ total, slices, recordedAt }) {
  const [hoveredKey, setHoveredKey] = useState("");
  const [selectedKey, setSelectedKey] = useState("");

  if (!slices.length) {
    return <p className="hint">No investment entries yet for asset allocation.</p>;
  }

  if (!total) {
    return <p className="hint">Asset allocation pie chart will appear once Stocks/Gold/Bitcoin values are above zero.</p>;
  }

  const radius = 90;
  const center = 110;
  const size = 220;
  let runningPercent = 0;

  const toPoint = (angleInDegrees) => {
    const radians = (angleInDegrees * Math.PI) / 180;
    return {
      x: center + radius * Math.cos(radians),
      y: center + radius * Math.sin(radians),
    };
  };

  const getSlicePath = (startAngle, endAngle) => {
    const start = toPoint(startAngle);
    const end = toPoint(endAngle);
    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

    return [
      `M ${center} ${center}`,
      `L ${start.x} ${start.y}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
      "Z",
    ].join(" ");
  };

  const getMidPoint = (startAngle, endAngle, offset = 14) => {
    const angle = ((startAngle + endAngle) / 2) * (Math.PI / 180);
    return {
      x: Math.cos(angle) * offset,
      y: Math.sin(angle) * offset,
    };
  };

  return (
    <section className="asset-pie-section">
      <h3>Latest Asset Allocation (Stocks + Gold + Bitcoin)</h3>
      <p className="hint">
        Based on latest record: {recordedAt ? formatISTDateTime(recordedAt) : "N/A"}
      </p>
      <div className="asset-pie-layout">
        <svg viewBox={`0 0 ${size} ${size}`} className="asset-pie-chart" role="img" aria-label="Asset allocation pie chart">
          {slices.map((slice) => {
            const startAngle = (runningPercent / 100) * 360 - 90;
            runningPercent += slice.percentage;
            const endAngle = (runningPercent / 100) * 360 - 90;
            const isActive = hoveredKey === slice.key || selectedKey === slice.key;
            const translation = isActive ? getMidPoint(startAngle, endAngle) : { x: 0, y: 0 };

            return (
              <path
                key={slice.key}
                d={getSlicePath(startAngle, endAngle)}
                fill={slice.color}
                stroke="#ffffff"
                strokeWidth={isActive ? "3" : "2"}
                opacity={hoveredKey && hoveredKey !== slice.key ? 0.45 : 1}
                transform={`translate(${translation.x} ${translation.y})`}
                className="asset-pie-slice"
                onMouseEnter={() => setHoveredKey(slice.key)}
                onMouseLeave={() => setHoveredKey("")}
                onClick={() => setSelectedKey((prev) => (prev === slice.key ? "" : slice.key))}
              >
                <title>
                  {slice.label}: {slice.percentage.toFixed(1)}% ({asCurrency(slice.value)})
                </title>
              </path>
            );
          })}
        </svg>

        <div className="asset-pie-legend">
          {slices.map((slice) => (
            <button
              key={slice.key}
              type="button"
              className={`asset-pie-legend-item ${selectedKey === slice.key ? "active" : ""}`}
              onMouseEnter={() => setHoveredKey(slice.key)}
              onMouseLeave={() => setHoveredKey("")}
              onClick={() => setSelectedKey((prev) => (prev === slice.key ? "" : slice.key))}
            >
              <span className="asset-color-dot" style={{ backgroundColor: slice.color }} />
              <div>
                <strong>{slice.label}</strong>
                <div className="hint">
                  {slice.percentage.toFixed(1)}% • {asCurrency(slice.value)}
                </div>
              </div>
            </button>
          ))}
          <p className="hint asset-pie-total">Total: {asCurrency(total)}</p>
          {selectedKey && (
            <p className="hint">
              Selected: <strong>{slices.find((slice) => slice.key === selectedKey)?.label}</strong>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export default App;
