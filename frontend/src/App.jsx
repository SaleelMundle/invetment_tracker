import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "./services/api";
import {
  asBitcoin,
  asCurrency,
  asPercent,
  defaultBitcoinForm,
  defaultInvestmentForm,
  lakhToRupees,
  rupeesToLakh,
} from "./utils";

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
const DEFAULT_WORLD_POPULATION = 8200000000;
const TOAST_DURATION_MS = 3000;
const TOAST_EXIT_DURATION_MS = 350;
const MIN_PROFILE_CROP_SIZE_PERCENT = 15;
const DEFAULT_PROFILE_PICTURE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' rx='60' fill='%23e2e8f0'/%3E%3Ccircle cx='60' cy='44' r='22' fill='%2394a3b8'/%3E%3Cpath d='M24 100c6-19 22-30 36-30s30 11 36 30' fill='%2394a3b8'/%3E%3C/svg%3E";
const INVESTMENT_FORM_DRAFT_STORAGE_KEY = (userId) => `investment_tracker_investment_form_draft_${userId}`;
const BITCOIN_FORM_DRAFT_STORAGE_KEY = (userId) => `investment_tracker_bitcoin_form_draft_${userId}`;
const INVESTMENT_FORM_PINNED_BLANK_STORAGE_KEY = (userId) => `investment_tracker_investment_form_pinned_blank_${userId}`;
const BITCOIN_FORM_PINNED_BLANK_STORAGE_KEY = (userId) => `investment_tracker_bitcoin_form_pinned_blank_${userId}`;

const readDraftFromStorage = (key, fallback) => {
  try {
    const rawValue = localStorage.getItem(key);
    if (!rawValue) return fallback;
    const parsed = JSON.parse(rawValue);
    return parsed ?? fallback;
  } catch (error) {
    console.warn(`[APP] Failed to read draft for key='${key}'`, error);
    return fallback;
  }
};

const writeDraftToStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[APP] Failed to write draft for key='${key}'`, error);
  }
};

const hasMeaningfulSourceEntries = (entries) =>
  Array.isArray(entries) && entries.some((value) => String(value ?? "").trim() !== "");

const hasMeaningfulInvestmentDraft = (form) =>
  !!form && INVESTMENT_SOURCE_FIELDS.some(([field]) => hasMeaningfulSourceEntries(form[field]));

const hasMeaningfulBitcoinDraft = (form) =>
  !!form && hasMeaningfulSourceEntries(form.sources);

const normalizeDateInput = (value) => {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
    return new Date(hasTimezone ? value : `${value}Z`);
  }
  return new Date(value);
};

const formatISTDateTime = (value) => {
  const date = normalizeDateInput(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
};

const formatISTDate = (value, options = {}) => {
  const date = normalizeDateInput(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "2-digit",
    ...options,
  }).format(date);
};

const getTimestamp = (value) => {
  const time = normalizeDateInput(value).getTime();
  return Number.isNaN(time) ? null : time;
};

const buildTimeTicks = (minTimestamp, maxTimestamp, plotWidth, paddingLeft) => {
  const suggestedCount = Math.max(3, Math.min(7, Math.floor(plotWidth / 95)));

  if (!Number.isFinite(minTimestamp) || !Number.isFinite(maxTimestamp)) {
    return [];
  }

  if (maxTimestamp <= minTimestamp) {
    return [
      {
        timestamp: minTimestamp,
        x: paddingLeft + plotWidth / 2,
      },
    ];
  }

  return Array.from({ length: suggestedCount }, (_, index) => {
    const ratio = index / Math.max(suggestedCount - 1, 1);
    const timestamp = minTimestamp + ratio * (maxTimestamp - minTimestamp);
    const x = paddingLeft + ratio * plotWidth;
    return { timestamp, x };
  });
};

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

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function App() {
  const getCurrentISTDateTimeLocalValue = () => toISTDateTimeLocalValue(new Date());

  const createDefaultInvestmentForm = () => ({
    ...defaultInvestmentForm,
    stocks: [""],
    gold: [""],
    bitcoin: [""],
    cash: [""],
    credit_card_dues: [""],
    total_loan_taken: [""],
    loan_repaid: [""],
    recorded_at: getCurrentISTDateTimeLocalValue(),
  });

  const createDefaultBitcoinForm = () => ({
    ...defaultBitcoinForm,
    sources: [""],
    recorded_at: getCurrentISTDateTimeLocalValue(),
  });

  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(null);
  const profilePictureInputRef = useRef(null);
  const profilePictureMenuRef = useRef(null);
  const userMenuRef = useRef(null);
  const navMenuRef = useRef(null);
  const toastTimeoutsRef = useRef(new Map());
  const [notifications, setNotifications] = useState([]);
  const [isUploadingProfilePicture, setIsUploadingProfilePicture] = useState(false);
  const [isProfilePictureMenuOpen, setIsProfilePictureMenuOpen] = useState(false);
  const [isProfilePicturePreviewOpen, setIsProfilePicturePreviewOpen] = useState(false);
  const [isProfilePictureCropOpen, setIsProfilePictureCropOpen] = useState(false);
  const [profilePictureCropSrc, setProfilePictureCropSrc] = useState("");
  const [selectedProfilePictureFile, setSelectedProfilePictureFile] = useState(null);
  const [profileCropRect, setProfileCropRect] = useState({
    x: 15,
    y: 15,
    width: 70,
    height: 70,
  });
  const [profileCropDragState, setProfileCropDragState] = useState(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);
  const [activePage, setActivePage] = useState("add-investment");
  const [localTimeNow, setLocalTimeNow] = useState(() => new Date());
  const cropImageRef = useRef(null);

  const [loginForm, setLoginForm] = useState({
    username: "",
    password: "",
  });
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [users, setUsers] = useState([]);
  const [newUserForm, setNewUserForm] = useState({ username: "", password: "", role: "user" });
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);

  const [investments, setInvestments] = useState([]);
  const [formsHydratedUserId, setFormsHydratedUserId] = useState("");
  const [investmentForm, setInvestmentForm] = useState(() => {
    const defaultValue = createDefaultInvestmentForm();
    const draft = user ? readDraftFromStorage(INVESTMENT_FORM_DRAFT_STORAGE_KEY(user._id), null) : null;

    if (!draft || typeof draft !== "object") {
      return defaultValue;
    }

    const normalized = { ...defaultValue, ...draft };
    INVESTMENT_SOURCE_FIELDS.forEach(([field]) => {
      normalized[field] = hasMeaningfulSourceEntries(draft[field])
        ? draft[field].map((value) => String(value ?? ""))
        : [""];
    });

    normalized.recorded_at = typeof draft.recorded_at === "string"
      ? draft.recorded_at
      : defaultValue.recorded_at;

    return normalized;
  });
  const [editingInvestmentId, setEditingInvestmentId] = useState("");
  const [isInvestmentFormPinnedBlank, setIsInvestmentFormPinnedBlank] = useState(() =>
    user ? Boolean(readDraftFromStorage(INVESTMENT_FORM_PINNED_BLANK_STORAGE_KEY(user._id), false)) : false
  );
  const [history, setHistory] = useState([]);
  const [assetTimelineIndex, setAssetTimelineIndex] = useState(0);
  const [bitcoinForm, setBitcoinForm] = useState(() => {
    const defaultValue = createDefaultBitcoinForm();
    const draft = user ? readDraftFromStorage(BITCOIN_FORM_DRAFT_STORAGE_KEY(user._id), null) : null;

    if (!draft || typeof draft !== "object") {
      return defaultValue;
    }

    return {
      ...defaultValue,
      ...draft,
      sources: hasMeaningfulSourceEntries(draft.sources)
        ? draft.sources.map((value) => String(value ?? ""))
        : [""],
      recorded_at: typeof draft.recorded_at === "string"
        ? draft.recorded_at
        : defaultValue.recorded_at,
    };
  });
  const [isBitcoinFormPinnedBlank, setIsBitcoinFormPinnedBlank] = useState(() =>
    user ? Boolean(readDraftFromStorage(BITCOIN_FORM_PINNED_BLANK_STORAGE_KEY(user._id), false)) : false
  );
  const [bitcoinHoldings, setBitcoinHoldings] = useState([]);
  const [bitcoinHistory, setBitcoinHistory] = useState([]);
  const [bitcoinTopPercentHistory, setBitcoinTopPercentHistory] = useState([]);
  const [worldPopulation, setWorldPopulation] = useState(String(DEFAULT_WORLD_POPULATION));
  const [combinedSummary, setCombinedSummary] = useState(null);
  const [combinedNetWorthHistory, setCombinedNetWorthHistory] = useState([]);
  const [combinedAssetTimeline, setCombinedAssetTimeline] = useState([]);
  const [combinedAssetTimelineIndex, setCombinedAssetTimelineIndex] = useState(0);
  const [combinedBitcoinHistory, setCombinedBitcoinHistory] = useState([]);
  const [combinedBitcoinTopPercentHistory, setCombinedBitcoinTopPercentHistory] = useState([]);

  const isAdmin = user?.role === "admin";

  const navItems = [
    { key: "add-investment", label: "Add Investment" },
    { key: "bitcoin-holdings", label: "Bitcoin Holdings" },
    { key: "net-worth-trend", label: "Net Worth Trend" },
    { key: "asset-allocation", label: "Asset Allocation" },
    { key: "investment-history", label: "Investment History (₹ Lakh)" },
    { key: "combined-stats", label: "Combined Statistics" },
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
    loadBitcoinHoldings();
    loadBitcoinHistory();
    loadBitcoinTopPercentHistory(worldPopulation);
    loadCombinedData(worldPopulation);
    if (isAdmin) {
      loadUsers();
    }
  }, [token, user]);

  useEffect(() => {
    if (!token || !user) return;
    loadBitcoinTopPercentHistory(worldPopulation);
    loadCombinedBitcoinTopPercentHistory(worldPopulation);
  }, [worldPopulation]);

  useEffect(() => {
    if (!user?._id) {
      setFormsHydratedUserId("");
      return;
    }

    const investmentDefault = createDefaultInvestmentForm();
    const investmentDraft = readDraftFromStorage(
      INVESTMENT_FORM_DRAFT_STORAGE_KEY(user._id),
      null
    );

    let normalizedInvestmentForm = investmentDefault;
    if (investmentDraft && typeof investmentDraft === "object") {
      normalizedInvestmentForm = { ...investmentDefault, ...investmentDraft };
      INVESTMENT_SOURCE_FIELDS.forEach(([field]) => {
        normalizedInvestmentForm[field] = hasMeaningfulSourceEntries(investmentDraft[field])
          ? investmentDraft[field].map((value) => String(value ?? ""))
          : [""];
      });

      normalizedInvestmentForm.recorded_at =
        typeof investmentDraft.recorded_at === "string"
          ? investmentDraft.recorded_at
          : investmentDefault.recorded_at;
    }

    const bitcoinDefault = createDefaultBitcoinForm();
    const bitcoinDraft = readDraftFromStorage(BITCOIN_FORM_DRAFT_STORAGE_KEY(user._id), null);
    const normalizedBitcoinForm =
      bitcoinDraft && typeof bitcoinDraft === "object"
        ? {
            ...bitcoinDefault,
            ...bitcoinDraft,
            sources: hasMeaningfulSourceEntries(bitcoinDraft.sources)
              ? bitcoinDraft.sources.map((value) => String(value ?? ""))
              : [""],
            recorded_at:
              typeof bitcoinDraft.recorded_at === "string"
                ? bitcoinDraft.recorded_at
                : bitcoinDefault.recorded_at,
          }
        : bitcoinDefault;

    setEditingInvestmentId("");
    setInvestmentForm(normalizedInvestmentForm);
    setBitcoinForm(normalizedBitcoinForm);
    setIsInvestmentFormPinnedBlank(false);
    setIsBitcoinFormPinnedBlank(false);
    setFormsHydratedUserId(user._id);
  }, [user?._id]);

  useEffect(() => {
    if (user && formsHydratedUserId === user._id) {
      writeDraftToStorage(INVESTMENT_FORM_DRAFT_STORAGE_KEY(user._id), investmentForm);
    }
  }, [investmentForm, user, formsHydratedUserId]);

  useEffect(() => {
    if (user && formsHydratedUserId === user._id) {
      writeDraftToStorage(BITCOIN_FORM_DRAFT_STORAGE_KEY(user._id), bitcoinForm);
    }
  }, [bitcoinForm, user, formsHydratedUserId]);

  useEffect(() => {
    if (!isAdmin && activePage === "manage-users") {
      setActivePage("add-investment");
    }
  }, [activePage, isAdmin]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setLocalTimeNow(new Date());
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!isProfilePictureMenuOpen) return;

    const handleDocumentClick = (event) => {
      if (!profilePictureMenuRef.current?.contains(event.target)) {
        setIsProfilePictureMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [isProfilePictureMenuOpen]);

  useEffect(() => {
    if (!isUserMenuOpen) return;

    const handleDocumentClick = (event) => {
      if (!userMenuRef.current?.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [isUserMenuOpen]);

  useEffect(() => {
    if (!isNavMenuOpen) return;

    const handleDocumentClick = (event) => {
      if (!navMenuRef.current?.contains(event.target)) {
        setIsNavMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [isNavMenuOpen]);

  const latestNetWorth = useMemo(() => {
    if (!history.length) return 0;
    return history[history.length - 1].net_worth;
  }, [history]);

  const latestBitcoin = useMemo(() => {
    if (!bitcoinHistory.length) return 0;
    return bitcoinHistory[bitcoinHistory.length - 1].bitcoin;
  }, [bitcoinHistory]);

  const latestTopPercent = useMemo(() => {
    if (!bitcoinTopPercentHistory.length) return null;
    return bitcoinTopPercentHistory[bitcoinTopPercentHistory.length - 1].top_percent;
  }, [bitcoinTopPercentHistory]);

  const greetingText = useMemo(() => {
    const hour = localTimeNow.getHours();
    let greeting = "Good evening";

    if (hour < 12) greeting = "Good morning";
    else if (hour < 17) greeting = "Good afternoon";

    return `${greeting}, ${user?.username || "User"}`;
  }, [localTimeNow, user?.username]);

  const worldPopulationValue = useMemo(() => Number(worldPopulation || 0), [worldPopulation]);

  const combinedLatestNetWorth = useMemo(() => {
    if (!combinedNetWorthHistory.length) return 0;
    return combinedNetWorthHistory[combinedNetWorthHistory.length - 1].net_worth;
  }, [combinedNetWorthHistory]);

  const combinedLatestBitcoin = useMemo(() => {
    if (!combinedBitcoinHistory.length) return 0;
    return combinedBitcoinHistory[combinedBitcoinHistory.length - 1].bitcoin;
  }, [combinedBitcoinHistory]);

  const combinedLatestTopPercent = useMemo(() => {
    if (!combinedBitcoinTopPercentHistory.length) return null;
    return combinedBitcoinTopPercentHistory[combinedBitcoinTopPercentHistory.length - 1].top_percent;
  }, [combinedBitcoinTopPercentHistory]);

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

  const latestInvestmentEntry = useMemo(() => {
    if (!investmentsByRecordedDate.length) return null;
    return investmentsByRecordedDate[investmentsByRecordedDate.length - 1] || null;
  }, [investmentsByRecordedDate]);

  const combinedTimelineByRecordedDate = useMemo(() => {
    const getTimeValue = (value) => {
      const time = new Date(value?.recorded_at).getTime();
      return Number.isNaN(time) ? 0 : time;
    };

    return [...combinedAssetTimeline].sort((a, b) => getTimeValue(a) - getTimeValue(b));
  }, [combinedAssetTimeline]);

  useEffect(() => {
    if (!combinedTimelineByRecordedDate.length) {
      setCombinedAssetTimelineIndex(0);
      return;
    }

    setCombinedAssetTimelineIndex(combinedTimelineByRecordedDate.length - 1);
  }, [combinedTimelineByRecordedDate.length]);

  const selectedCombinedEntry = useMemo(() => {
    if (!combinedTimelineByRecordedDate.length) return null;

    const clampedIndex = Math.min(
      Math.max(combinedAssetTimelineIndex, 0),
      combinedTimelineByRecordedDate.length - 1
    );

    return combinedTimelineByRecordedDate[clampedIndex] || null;
  }, [combinedAssetTimelineIndex, combinedTimelineByRecordedDate]);

  const latestBitcoinHoldingEntry = useMemo(() => {
    if (!bitcoinHoldings.length) return null;

    const getTimeValue = (value) => {
      const time = new Date(value?.recorded_at).getTime();
      return Number.isNaN(time) ? 0 : time;
    };

    return [...bitcoinHoldings].sort((a, b) => getTimeValue(a) - getTimeValue(b))[bitcoinHoldings.length - 1] || null;
  }, [bitcoinHoldings]);

  const createInvestmentFormFromEntry = (investment, options = {}) => {
    const { preserveRecordedAt = false } = options;

    if (!investment) {
      return createDefaultInvestmentForm();
    }

    const totalLoanTaken = investment.total_loan_taken ?? investment.loan_dues ?? 0;
    const loanRepaid = investment.loan_repaid ?? 0;

    return {
      stocks: [String(rupeesToLakh(investment.stocks))],
      gold: [String(rupeesToLakh(investment.gold))],
      bitcoin: [String(rupeesToLakh(investment.bitcoin))],
      cash: [String(rupeesToLakh(investment.cash))],
      credit_card_dues: [String(rupeesToLakh(investment.credit_card_dues))],
      total_loan_taken: [String(rupeesToLakh(totalLoanTaken))],
      loan_repaid: [String(rupeesToLakh(loanRepaid))],
      recorded_at: preserveRecordedAt
        ? toISTDateTimeLocalValue(investment.recorded_at)
        : getCurrentISTDateTimeLocalValue(),
    };
  };

  const createBitcoinFormFromEntry = (holding, options = {}) => {
    const { preserveRecordedAt = false } = options;

    if (!holding) {
      return createDefaultBitcoinForm();
    }

    const sources =
      Array.isArray(holding.sources) && holding.sources.length
        ? holding.sources.map((source) => String(source))
        : [String(holding.bitcoin || "")];

    return {
      sources,
      recorded_at: preserveRecordedAt
        ? toISTDateTimeLocalValue(holding.recorded_at)
        : getCurrentISTDateTimeLocalValue(),
    };
  };

  useEffect(() => {
    if (editingInvestmentId) return;
    if (isInvestmentFormPinnedBlank) return;
    setInvestmentForm(createInvestmentFormFromEntry(latestInvestmentEntry));
  }, [latestInvestmentEntry, editingInvestmentId, isInvestmentFormPinnedBlank]);

  useEffect(() => {
    if (isBitcoinFormPinnedBlank) return;
    setBitcoinForm(createBitcoinFormFromEntry(latestBitcoinHoldingEntry));
  }, [latestBitcoinHoldingEntry, isBitcoinFormPinnedBlank]);

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

  const combinedAssetPieData = useMemo(() => {
    if (!selectedCombinedEntry) {
      return { total: 0, slices: [] };
    }

    const slices = [
      { key: "stocks", label: "Stocks", color: "#0ea5e9", value: Number(selectedCombinedEntry.stocks || 0) },
      { key: "gold", label: "Gold", color: "#f59e0b", value: Number(selectedCombinedEntry.gold || 0) },
      { key: "bitcoin", label: "Bitcoin", color: "#f97316", value: Number(selectedCombinedEntry.bitcoin || 0) },
    ];

    const total = slices.reduce((sum, slice) => sum + slice.value, 0);

    return {
      total,
      slices: slices.map((slice) => ({
        ...slice,
        percentage: total > 0 ? (slice.value / total) * 100 : 0,
      })),
    };
  }, [selectedCombinedEntry]);

  useEffect(() => {
    return () => {
      toastTimeoutsRef.current.forEach(({ exitTimeoutId, removeTimeoutId }) => {
        window.clearTimeout(exitTimeoutId);
        window.clearTimeout(removeTimeoutId);
      });
      toastTimeoutsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (profilePictureCropSrc) {
        URL.revokeObjectURL(profilePictureCropSrc);
      }
    };
  }, [profilePictureCropSrc]);

  useEffect(() => {
    if (!profileCropDragState) return;

    const handlePointerMove = (event) => {
      const { bounds, corner, initialRect } = profileCropDragState;
      const pointerX = ((event.clientX - bounds.left) / bounds.width) * 100;
      const pointerY = ((event.clientY - bounds.top) / bounds.height) * 100;

      const clampedX = clamp(pointerX, 0, 100);
      const clampedY = clamp(pointerY, 0, 100);

      let nextRect = initialRect;

      if (corner === "nw") {
        const right = initialRect.x + initialRect.width;
        const bottom = initialRect.y + initialRect.height;
        const nextX = clamp(clampedX, 0, right - MIN_PROFILE_CROP_SIZE_PERCENT);
        const nextY = clamp(clampedY, 0, bottom - MIN_PROFILE_CROP_SIZE_PERCENT);
        nextRect = {
          x: nextX,
          y: nextY,
          width: right - nextX,
          height: bottom - nextY,
        };
      }

      if (corner === "ne") {
        const left = initialRect.x;
        const bottom = initialRect.y + initialRect.height;
        const nextX = clamp(clampedX, left + MIN_PROFILE_CROP_SIZE_PERCENT, 100);
        const nextY = clamp(clampedY, 0, bottom - MIN_PROFILE_CROP_SIZE_PERCENT);
        nextRect = {
          x: left,
          y: nextY,
          width: nextX - left,
          height: bottom - nextY,
        };
      }

      if (corner === "sw") {
        const top = initialRect.y;
        const right = initialRect.x + initialRect.width;
        const nextX = clamp(clampedX, 0, right - MIN_PROFILE_CROP_SIZE_PERCENT);
        const nextY = clamp(clampedY, top + MIN_PROFILE_CROP_SIZE_PERCENT, 100);
        nextRect = {
          x: nextX,
          y: top,
          width: right - nextX,
          height: nextY - top,
        };
      }

      if (corner === "se") {
        const left = initialRect.x;
        const top = initialRect.y;
        const nextX = clamp(clampedX, left + MIN_PROFILE_CROP_SIZE_PERCENT, 100);
        const nextY = clamp(clampedY, top + MIN_PROFILE_CROP_SIZE_PERCENT, 100);
        nextRect = {
          x: left,
          y: top,
          width: nextX - left,
          height: nextY - top,
        };
      }

      setProfileCropRect(nextRect);
    };

    const handlePointerUp = () => {
      setProfileCropDragState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [profileCropDragState]);

  const addNotification = (text, type = "info") => {
    if (!text) return;

    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    setNotifications((prev) => [...prev, { id, text, type, isLeaving: false }]);

    const exitTimeoutId = window.setTimeout(() => {
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === id ? { ...notification, isLeaving: true } : notification
        )
      );

      const removeTimeoutId = window.setTimeout(() => {
        setNotifications((prev) => prev.filter((notification) => notification.id !== id));
        toastTimeoutsRef.current.delete(id);
      }, TOAST_EXIT_DURATION_MS);

      const existing = toastTimeoutsRef.current.get(id) || {};
      toastTimeoutsRef.current.set(id, { ...existing, removeTimeoutId });
    }, TOAST_DURATION_MS);

    toastTimeoutsRef.current.set(id, { exitTimeoutId });
  };

  const setMessage = (text) => addNotification(text, "success");
  const setError = (text) => addNotification(text, "error");

  const resetAlerts = () => {
    // Toast notifications auto-dismiss; no manual reset required.
  };

  const toastNotificationRegion = (
    <div className="toast-container" aria-live="polite" aria-atomic="true">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`toast-notification ${notification.type === "error" ? "toast-error" : "toast-success"} ${notification.isLeaving ? "leaving" : ""}`}
        >
          <span className="toast-icon" aria-hidden="true">
            {notification.type === "error" ? "❌" : "✅"}
          </span>
          <span className="toast-text">{notification.text}</span>
        </div>
      ))}
    </div>
  );

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

  const loadBitcoinHoldings = async () => {
    try {
      const response = await api.listBitcoinHoldings(token);
      setBitcoinHoldings(response.holdings || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const loadBitcoinHistory = async () => {
    try {
      const response = await api.getBitcoinHistory(token);
      setBitcoinHistory(response.history || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const loadBitcoinTopPercentHistory = async (populationValue) => {
    try {
      const numericPopulation = Number(populationValue || 0);
      if (!numericPopulation) {
        setBitcoinTopPercentHistory([]);
        return;
      }

      const response = await api.getBitcoinTopPercentHistory(token, numericPopulation);
      setBitcoinTopPercentHistory(response.history || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const loadCombinedBitcoinTopPercentHistory = async (populationValue) => {
    try {
      const numericPopulation = Number(populationValue || 0);
      if (!numericPopulation) {
        setCombinedBitcoinTopPercentHistory([]);
        return;
      }

      const response = await api.getCombinedBitcoinTopPercentHistory(token, numericPopulation);
      setCombinedBitcoinTopPercentHistory(response.history || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const loadCombinedData = async (populationValue) => {
    try {
      const numericPopulation = Number(populationValue || 0);

      const [
        investmentSummaryResponse,
        netWorthHistoryResponse,
        assetTimelineResponse,
        bitcoinSummaryResponse,
        bitcoinHistoryResponse,
        bitcoinTopPercentResponse,
      ] = await Promise.all([
        api.getCombinedInvestmentSummary(token),
        api.getCombinedNetWorthHistory(token),
        api.getCombinedAssetTimeline(token),
        api.getCombinedBitcoinSummary(token),
        api.getCombinedBitcoinHistory(token),
        numericPopulation
          ? api.getCombinedBitcoinTopPercentHistory(token, numericPopulation)
          : Promise.resolve({ history: [] }),
      ]);

      setCombinedSummary({
        investment: investmentSummaryResponse.summary || null,
        bitcoin: bitcoinSummaryResponse.summary || null,
      });
      setCombinedNetWorthHistory(netWorthHistoryResponse.history || []);
      setCombinedAssetTimeline(assetTimelineResponse.timeline || []);
      setCombinedBitcoinHistory(bitcoinHistoryResponse.history || []);
      setCombinedBitcoinTopPercentHistory(bitcoinTopPercentResponse.history || []);
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
      const successMessage = `Welcome ${response.user.username}!`;
      setMessage(successMessage);
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
    setInvestmentForm(createDefaultInvestmentForm());
    setEditingInvestmentId("");
    setHistory([]);
    setIsInvestmentFormPinnedBlank(false);
    setBitcoinForm(createDefaultBitcoinForm());
    setIsBitcoinFormPinnedBlank(false);
    setBitcoinHoldings([]);
    setBitcoinHistory([]);
    setBitcoinTopPercentHistory([]);
    setCombinedSummary(null);
    setCombinedNetWorthHistory([]);
    setCombinedAssetTimeline([]);
    setCombinedAssetTimelineIndex(0);
    setCombinedBitcoinHistory([]);
    setCombinedBitcoinTopPercentHistory([]);
    setIsProfilePictureMenuOpen(false);
    setIsProfilePicturePreviewOpen(false);
    closeProfileCropModal();
    setIsUserMenuOpen(false);
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

  const toggleUserMenu = () => {
    setIsUserMenuOpen((prev) => !prev);
  };

  const toggleProfilePictureMenu = () => {
    if (isUploadingProfilePicture) return;
    setIsProfilePictureMenuOpen((prev) => !prev);
  };

  const toggleNavMenu = () => {
    setIsNavMenuOpen((prev) => !prev);
  };

  const handleViewProfilePicture = () => {
    setIsProfilePictureMenuOpen(false);
    closeProfileCropModal();
    setIsProfilePicturePreviewOpen(true);
  };

  const closeProfileCropModal = () => {
    setIsProfilePictureCropOpen(false);
    setProfileCropDragState(null);
    setSelectedProfilePictureFile(null);
    setProfileCropRect({ x: 15, y: 15, width: 70, height: 70 });
    setProfilePictureCropSrc((currentSrc) => {
      if (currentSrc) {
        URL.revokeObjectURL(currentSrc);
      }
      return "";
    });
  };

  const startProfileCropHandleDrag = (corner) => (event) => {
    if (!cropImageRef.current) return;
    event.preventDefault();

    const bounds = cropImageRef.current.getBoundingClientRect();
    setProfileCropDragState({
      corner,
      bounds,
      initialRect: profileCropRect,
    });
  };

  const handleEditProfilePicture = () => {
    setIsProfilePictureMenuOpen(false);
    profilePictureInputRef.current?.click();
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    try {
      resetAlerts();
      await api.createUser(token, newUserForm);
      const successMessage = "User created successfully";
      setMessage(successMessage);
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
    setIsInvestmentFormPinnedBlank(true);
    setInvestmentForm((prev) => ({
      ...prev,
      [field]: prev[field].map((entry, entryIndex) => (entryIndex === index ? value : entry)),
    }));
  };

  const addSourceInput = (field) => {
    setIsInvestmentFormPinnedBlank(true);
    setInvestmentForm((prev) => ({
      ...prev,
      [field]: [...prev[field], ""],
    }));
  };

  const removeSourceInput = (field, index) => {
    setIsInvestmentFormPinnedBlank(true);
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
        const successMessage = "Investment updated successfully";
        setMessage(successMessage);
      } else {
        await api.createInvestment(token, payload);
        const successMessage = "Investment saved successfully";
        setMessage(successMessage);
      }

      setIsInvestmentFormPinnedBlank(false);
      setInvestmentForm(createDefaultInvestmentForm());
      setEditingInvestmentId("");
      loadInvestments();
      loadNetWorthHistory();
      loadCombinedData(worldPopulation);
    } catch (err) {
      setError(err.message);
    }
  };

  const startEditInvestment = (investment) => {
    setEditingInvestmentId(investment._id);
    setActivePage("add-investment");
    setIsInvestmentFormPinnedBlank(false);
    setInvestmentForm(createInvestmentFormFromEntry(investment, { preserveRecordedAt: true }));
  };

  const handleDeleteInvestment = async (investmentId) => {
    try {
      resetAlerts();
      await api.deleteInvestment(token, investmentId);
      setMessage("Investment deleted successfully");
      loadInvestments();
      loadNetWorthHistory();
      loadCombinedData(worldPopulation);
    } catch (err) {
      setError(err.message);
    }
  };

  const normalizeBitcoinPayload = () => ({
    sources: bitcoinForm.sources,
    recorded_at: bitcoinForm.recorded_at || undefined,
  });

  const updateBitcoinSourceValue = (index, value) => {
    setIsBitcoinFormPinnedBlank(true);
    setBitcoinForm((prev) => ({
      ...prev,
      sources: prev.sources.map((entry, entryIndex) => (entryIndex === index ? value : entry)),
    }));
  };

  const addBitcoinSourceInput = () => {
    setIsBitcoinFormPinnedBlank(true);
    setBitcoinForm((prev) => ({
      ...prev,
      sources: [...prev.sources, ""],
    }));
  };

  const removeBitcoinSourceInput = (index) => {
    setIsBitcoinFormPinnedBlank(true);
    setBitcoinForm((prev) => {
      const filtered = prev.sources.filter((_, entryIndex) => entryIndex !== index);
      return {
        ...prev,
        sources: filtered.length ? filtered : [""],
      };
    });
  };

  const handleBitcoinSubmit = async (event) => {
    event.preventDefault();
    try {
      resetAlerts();
      const payload = normalizeBitcoinPayload();
      await api.createBitcoinHolding(token, payload);
      const successMessage = "Bitcoin holding saved successfully";
      setMessage(successMessage);
      setIsBitcoinFormPinnedBlank(false);
      setBitcoinForm(createDefaultBitcoinForm());
      loadBitcoinHoldings();
      loadBitcoinHistory();
      loadBitcoinTopPercentHistory(worldPopulation);
      loadCombinedData(worldPopulation);
    } catch (err) {
      setError(err.message);
    }
  };

  const setInvestmentFormBlank = () => {
    setEditingInvestmentId("");
    setIsInvestmentFormPinnedBlank(true);
    setInvestmentForm(createDefaultInvestmentForm());
  };

  const setBitcoinFormBlank = () => {
    setIsBitcoinFormPinnedBlank(true);
    setBitcoinForm(createDefaultBitcoinForm());
  };

  const getProfilePictureSrc = (profilePictureUrl) => {
    if (!profilePictureUrl) {
      return DEFAULT_PROFILE_PICTURE;
    }

    return profilePictureUrl;
  };

  const handleProfilePictureSelect = async (event) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = "";

    if (!selectedFile) return;
    if (!selectedFile.type?.startsWith("image/")) {
      setError("Please select a valid image file.");
      return;
    }

    try {
      resetAlerts();
      setIsProfilePictureMenuOpen(false);
      setIsProfilePicturePreviewOpen(false);
      setSelectedProfilePictureFile(selectedFile);
      setProfileCropRect({ x: 15, y: 15, width: 70, height: 70 });
      setProfilePictureCropSrc((currentSrc) => {
        if (currentSrc) {
          URL.revokeObjectURL(currentSrc);
        }
        return URL.createObjectURL(selectedFile);
      });
      setIsProfilePictureCropOpen(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCropImageLoad = () => {
    setProfileCropRect({ x: 15, y: 15, width: 70, height: 70 });
  };

  const handleProfilePictureCropSave = async () => {
    if (!selectedProfilePictureFile || !cropImageRef.current) {
      setError("Please select an image again.");
      return;
    }

    try {
      resetAlerts();
      setIsUploadingProfilePicture(true);

      const cropImage = cropImageRef.current;
      const naturalWidth = cropImage.naturalWidth;
      const naturalHeight = cropImage.naturalHeight;

      if (!naturalWidth || !naturalHeight) {
        throw new Error("Unable to read image for cropping.");
      }

      const cropX = Math.round((profileCropRect.x / 100) * naturalWidth);
      const cropY = Math.round((profileCropRect.y / 100) * naturalHeight);
      const cropWidth = Math.max(
        1,
        Math.round((profileCropRect.width / 100) * naturalWidth)
      );
      const cropHeight = Math.max(
        1,
        Math.round((profileCropRect.height / 100) * naturalHeight)
      );

      const canvas = document.createElement("canvas");
      canvas.width = cropWidth;
      canvas.height = cropHeight;

      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Unable to prepare cropped image.");
      }

      context.drawImage(
        cropImage,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        cropWidth,
        cropHeight
      );

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (nextBlob) => {
            if (!nextBlob) {
              reject(new Error("Unable to crop image. Please try another image."));
              return;
            }
            resolve(nextBlob);
          },
          selectedProfilePictureFile.type || "image/jpeg",
          0.92
        );
      });

      const croppedFile = new File(
        [blob],
        `cropped_${selectedProfilePictureFile.name || "profile-picture"}`,
        {
          type: blob.type || selectedProfilePictureFile.type || "image/jpeg",
        }
      );

      const response = await api.uploadProfilePicture(token, croppedFile);
      setUser(response.user);
      setMessage("Profile picture updated successfully");
      closeProfileCropModal();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUploadingProfilePicture(false);
    }
  };

  if (!token || !user) {
    return (
      <div className="page centered">
        {toastNotificationRegion}
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
              <div className="password-input-wrap">
                <input
                  type={showLoginPassword ? "text" : "password"}
                  value={loginForm.password}
                  onChange={(event) =>
                    setLoginForm((prev) => ({ ...prev, password: event.target.value }))
                  }
                />
                <button
                  type="button"
                  className="secondary password-toggle-btn"
                  aria-label={showLoginPassword ? "Hide password" : "Show password"}
                  title={showLoginPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowLoginPassword((prev) => !prev)}
                >
                  {showLoginPassword ? "🙈" : "👁"}
                </button>
              </div>
            </label>
            <button type="submit">Login</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {toastNotificationRegion}
      <header className="top-shell">
        <div className="header">
          <div className="brand-block">
            <div className="brand-title-row">
              <span className="app-logo" aria-hidden="true">
                <svg viewBox="0 0 64 64" role="img">
                  <path
                    d="M8 20 L20 30 L31 22 L41 27 L53 14"
                    fill="none"
                    stroke="#0ea5e9"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M47 14 H53 V20"
                    fill="none"
                    stroke="#0ea5e9"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="8" cy="20" r="2.2" fill="#0ea5e9" />
                  <circle cx="20" cy="30" r="2.2" fill="#0ea5e9" />
                  <circle cx="31" cy="22" r="2.2" fill="#0ea5e9" />
                  <circle cx="41" cy="27" r="2.2" fill="#0ea5e9" />
                  <circle cx="53" cy="14" r="2.2" fill="#0ea5e9" />
                </svg>
              </span>
              <h1>Investment Tracker Dashboard</h1>
            </div>
          </div>

          <div className="nav-shell" ref={navMenuRef}>
            <button
              type="button"
              className="hamburger-button"
              onClick={toggleNavMenu}
              aria-label="Toggle navigation menu"
              aria-expanded={isNavMenuOpen}
            >
              ☰
            </button>
            <nav className={`top-nav inline-nav ${isNavMenuOpen ? "open" : ""}`}>
              {navItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`nav-button ${activePage === item.key ? "active" : ""}`}
                  onClick={() => {
                    setActivePage(item.key);
                    setIsNavMenuOpen(false);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="header-actions">
            <div className="greeting-menu" ref={userMenuRef}>
              <button
                type="button"
                className="greeting-button"
                onClick={toggleUserMenu}
                aria-haspopup="menu"
                aria-expanded={isUserMenuOpen}
              >
                <span>{greetingText}</span>
                <span className="menu-caret">▾</span>
              </button>
              {isUserMenuOpen && (
                <div className="greeting-dropdown" role="menu" aria-label="User options">
                  <p className="greeting-dropdown-role">Signed in as {user.role}</p>
                  <button
                    type="button"
                    className="greeting-dropdown-item"
                    role="menuitem"
                    onClick={handleLogout}
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
            <div className="profile-picture-menu" ref={profilePictureMenuRef}>
              <button
                type="button"
                className="profile-picture-button"
                title={isUploadingProfilePicture ? "Uploading..." : "Profile picture options"}
                onClick={toggleProfilePictureMenu}
                disabled={isUploadingProfilePicture}
                aria-haspopup="menu"
                aria-expanded={isProfilePictureMenuOpen}
              >
                <img
                  src={getProfilePictureSrc(user.profile_picture_url)}
                  alt={`${user.username} profile picture`}
                  className="profile-picture-image"
                />
              </button>

              {isProfilePictureMenuOpen && (
                <div className="profile-picture-dropdown" role="menu" aria-label="Profile picture options">
                  <button
                    type="button"
                    className="profile-picture-dropdown-item"
                    role="menuitem"
                    onClick={handleViewProfilePicture}
                  >
                    View picture
                  </button>
                  <button
                    type="button"
                    className="profile-picture-dropdown-item"
                    role="menuitem"
                    onClick={handleEditProfilePicture}
                    disabled={isUploadingProfilePicture}
                  >
                    Edit picture
                  </button>
                </div>
              )}
            </div>
            <input
              ref={profilePictureInputRef}
              type="file"
              accept="image/*"
              className="visually-hidden"
              onChange={handleProfilePictureSelect}
            />
          </div>
        </div>
      </header>

      <section className="modern-stats-grid" aria-label="Latest summary stats">
        <article className="modern-stat-card net-worth-stat">
          <p className="modern-stat-label">Latest Net Worth</p>
          <p className="modern-stat-value">{asCurrency(latestNetWorth)}</p>
        </article>
        <article className="modern-stat-card bitcoin-stat">
          <p className="modern-stat-label">Latest Bitcoin</p>
          <p className="modern-stat-value">{asBitcoin(latestBitcoin)} BTC</p>
        </article>
        <article className="modern-stat-card top-percent-stat">
          <p className="modern-stat-label">Top Percent</p>
          <p className="modern-stat-value">{asPercent(latestTopPercent)}</p>
        </article>
      </section>

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
                  <button type="button" className="secondary add-source-btn" onClick={() => addSourceInput(key)}>
                    +
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
                  (setIsInvestmentFormPinnedBlank(true),
                  setInvestmentForm((prev) => ({ ...prev, recorded_at: event.target.value })))
                }
              />
            </label>

            <div className="row">
              <button type="submit">{editingInvestmentId ? "Update" : "Save"} Investment</button>
              <button
                type="button"
                className="secondary"
                onClick={setInvestmentFormBlank}
              >
                Set Blank
              </button>
              {editingInvestmentId && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setEditingInvestmentId("");
                    setIsInvestmentFormPinnedBlank(false);
                    setInvestmentForm(createInvestmentFormFromEntry(latestInvestmentEntry));
                  }}
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </form>
          </section>
        )}

        {activePage === "bitcoin-holdings" && (
          <section className="card page-card">
            <h2>Bitcoin Holdings</h2>
            <p className="hint">Add all bitcoin sources. Up to 8 decimals are supported.</p>

            <form onSubmit={handleBitcoinSubmit} className="form-grid">
              <div className="source-group">
                <div className="row source-group-header">
                  <label>Bitcoin Sources (BTC)</label>
                  <button type="button" className="secondary add-source-btn" onClick={addBitcoinSourceInput}>
                    +
                  </button>
                </div>
                <div className="source-list">
                  {bitcoinForm.sources.map((entry, index) => (
                    <div key={`bitcoin-source-${index}`} className="row source-row">
                      <input
                        type="number"
                        step="0.00000001"
                        min="0"
                        value={entry}
                        onChange={(event) => updateBitcoinSourceValue(index, event.target.value)}
                        required
                      />
                      {bitcoinForm.sources.length > 1 && (
                        <button
                          type="button"
                          className="danger"
                          onClick={() => removeBitcoinSourceInput(index)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <label>
                Recorded At (optional)
                <input
                  type="datetime-local"
                  value={bitcoinForm.recorded_at}
                  onChange={(event) =>
                    (setIsBitcoinFormPinnedBlank(true),
                    setBitcoinForm((prev) => ({ ...prev, recorded_at: event.target.value })))
                  }
                />
              </label>

              <div className="row">
                <button type="submit">Save Bitcoin Holding</button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setIsBitcoinFormPinnedBlank(false);
                    setBitcoinForm(createBitcoinFormFromEntry(latestBitcoinHoldingEntry));
                  }}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={setBitcoinFormBlank}
                >
                  Set Blank
                </button>
              </div>
            </form>

            <section className="bitcoin-graphs">
              <h3>Bitcoin Over Time</h3>
              <SimpleBitcoinHistoryChart data={bitcoinHistory} />

              <div className="bitcoin-percent-header row">
                <h3>Top Percent by Bitcoin Holdings</h3>
                <label className="world-population-input">
                  World Population
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={worldPopulation}
                    onChange={(event) => setWorldPopulation(event.target.value)}
                  />
                </label>
              </div>
              <p className="hint">
                Formula used: top_percent = (21,000,000 / (W × B)) × 100, where W = world population and B = bitcoin held.
              </p>
              <SimpleTopPercentChart
                data={bitcoinTopPercentHistory}
                worldPopulation={worldPopulationValue}
              />

              {bitcoinHoldings.length > 0 && (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Recorded At (IST)</th>
                        <th>Bitcoin (BTC)</th>
                        <th>Sources</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bitcoinHoldings.map((holding) => (
                        <tr key={holding._id}>
                          <td>{formatISTDateTime(holding.recorded_at_ist || holding.recorded_at)}</td>
                          <td>{asBitcoin(holding.bitcoin)}</td>
                          <td>{(holding.sources || []).join(" + ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
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

        {activePage === "combined-stats" && (
          <section className="card page-card">
            <h2>Combined Statistics (All Users)</h2>
            <p className="hint">
              This view shows latest combined values by taking the latest record of each user and summing across all users.
            </p>

            <section className="combined-summary-grid">
              <article className="combined-summary-card">
                <h3>Combined Net Worth</h3>
                <p className="combined-summary-value">{asCurrency(combinedLatestNetWorth)}</p>
              </article>
              <article className="combined-summary-card">
                <h3>Combined Bitcoin</h3>
                <p className="combined-summary-value">{asBitcoin(combinedLatestBitcoin)} BTC</p>
              </article>
              <article className="combined-summary-card">
                <h3>Combined Top Percent</h3>
                <p className="combined-summary-value">{asPercent(combinedLatestTopPercent)}</p>
              </article>
              <article className="combined-summary-card">
                <h3>Users Included</h3>
                <p className="combined-summary-value">{combinedSummary?.investment?.users_count || 0}</p>
              </article>
            </section>

            <section className="bitcoin-graphs">
              <h3>Combined Net Worth Trend</h3>
              <SimpleNetWorthChart data={combinedNetWorthHistory} />

              <h3>Combined Bitcoin Over Time</h3>
              <SimpleBitcoinHistoryChart data={combinedBitcoinHistory} />

              <div className="bitcoin-percent-header row">
                <h3>Combined Top Percent by Bitcoin Holdings</h3>
                <label className="world-population-input">
                  World Population
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={worldPopulation}
                    onChange={(event) => setWorldPopulation(event.target.value)}
                  />
                </label>
              </div>
              <SimpleTopPercentChart
                data={combinedBitcoinTopPercentHistory}
                worldPopulation={worldPopulationValue}
              />

              <section className="asset-pie-section">
                <h3>Combined Asset Allocation Timeline (Stocks + Gold + Bitcoin)</h3>
                {combinedTimelineByRecordedDate.length > 0 && (
                  <div className="asset-timeline-control">
                    <label htmlFor="combinedAssetTimelineSlider">
                      Record: <strong>{combinedAssetTimelineIndex + 1}</strong> / {combinedTimelineByRecordedDate.length}
                    </label>
                    <input
                      id="combinedAssetTimelineSlider"
                      type="range"
                      min="0"
                      max={Math.max(combinedTimelineByRecordedDate.length - 1, 0)}
                      step="1"
                      value={Math.min(
                        combinedAssetTimelineIndex,
                        Math.max(combinedTimelineByRecordedDate.length - 1, 0)
                      )}
                      onChange={(event) => setCombinedAssetTimelineIndex(Number(event.target.value))}
                    />
                    <p className="hint">
                      Showing combined record date: {selectedCombinedEntry?.recorded_at
                        ? formatISTDateTime(selectedCombinedEntry.recorded_at)
                        : "N/A"}
                    </p>
                  </div>
                )}
                <SimpleAssetPieChart
                  total={combinedAssetPieData.total}
                  slices={combinedAssetPieData.slices}
                  recordedAt={selectedCombinedEntry?.recorded_at}
                />
              </section>
            </section>
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
                <div className="password-input-wrap">
                  <input
                    type={showNewUserPassword ? "text" : "password"}
                    value={newUserForm.password}
                    onChange={(event) =>
                      setNewUserForm((prev) => ({ ...prev, password: event.target.value }))
                    }
                    required
                  />
                  <button
                    type="button"
                    className="secondary password-toggle-btn"
                    aria-label={showNewUserPassword ? "Hide password" : "Show password"}
                    title={showNewUserPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowNewUserPassword((prev) => !prev)}
                  >
                    {showNewUserPassword ? "🙈" : "👁"}
                  </button>
                </div>
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

      {isProfilePicturePreviewOpen && (
        <div
          className="profile-picture-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Profile picture preview"
          onClick={() => setIsProfilePicturePreviewOpen(false)}
        >
          <div className="profile-picture-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="profile-picture-modal-header">
              <h3>Profile Picture</h3>
              <button
                type="button"
                className="profile-picture-modal-close"
                onClick={() => setIsProfilePicturePreviewOpen(false)}
                aria-label="Close profile picture preview"
              >
                ✕
              </button>
            </div>
            <img
              src={getProfilePictureSrc(user.profile_picture_url)}
              alt={`${user.username} profile preview`}
              className="profile-picture-preview-image"
            />
          </div>
        </div>
      )}

      {isProfilePictureCropOpen && (
        <div
          className="profile-picture-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Crop profile picture"
          onClick={isUploadingProfilePicture ? undefined : closeProfileCropModal}
        >
          <div className="profile-picture-crop-card" onClick={(event) => event.stopPropagation()}>
            <div className="profile-picture-modal-header">
              <h3>Crop Profile Picture</h3>
              <button
                type="button"
                className="profile-picture-modal-close"
                onClick={closeProfileCropModal}
                disabled={isUploadingProfilePicture}
                aria-label="Close crop modal"
              >
                ✕
              </button>
            </div>

            <p className="hint crop-hint-text">
              Drag the corners to adjust the crop area. The selected area is what gets uploaded.
            </p>

            <div className="profile-picture-crop-stage">
              {profilePictureCropSrc && (
                <img
                  ref={cropImageRef}
                  src={profilePictureCropSrc}
                  alt="Profile crop"
                  className="profile-picture-crop-source-image"
                  onLoad={handleCropImageLoad}
                  draggable={false}
                />
              )}
              <div
                className="profile-picture-crop-selection"
                style={{
                  left: `${profileCropRect.x}%`,
                  top: `${profileCropRect.y}%`,
                  width: `${profileCropRect.width}%`,
                  height: `${profileCropRect.height}%`,
                }}
              >
                <div className="profile-picture-crop-grid" />
                <button
                  type="button"
                  className="profile-corner-handle handle-nw"
                  onPointerDown={startProfileCropHandleDrag("nw")}
                  aria-label="Resize crop from top-left"
                />
                <button
                  type="button"
                  className="profile-corner-handle handle-ne"
                  onPointerDown={startProfileCropHandleDrag("ne")}
                  aria-label="Resize crop from top-right"
                />
                <button
                  type="button"
                  className="profile-corner-handle handle-sw"
                  onPointerDown={startProfileCropHandleDrag("sw")}
                  aria-label="Resize crop from bottom-left"
                />
                <button
                  type="button"
                  className="profile-corner-handle handle-se"
                  onPointerDown={startProfileCropHandleDrag("se")}
                  aria-label="Resize crop from bottom-right"
                />
              </div>
            </div>

            <div className="profile-picture-crop-controls">
              <div className="row">
                <button
                  type="button"
                  className="secondary"
                  onClick={closeProfileCropModal}
                  disabled={isUploadingProfilePicture}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleProfilePictureCropSave}
                  disabled={isUploadingProfilePicture}
                >
                  {isUploadingProfilePicture ? "Uploading..." : "Crop & Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SimpleNetWorthChart({ data }) {
  if (!data.length) {
    return <p className="hint">No net worth history yet. Add your first investment entry.</p>;
  }

  const pointsData = data
    .map((item) => ({
      ...item,
      timestamp: getTimestamp(item.recorded_at),
    }))
    .filter((item) => item.timestamp !== null);

  if (!pointsData.length) {
    return <p className="hint">No valid timestamps available for net worth chart.</p>;
  }

  const width = 560;
  const height = 260;
  const padding = { top: 20, right: 34, bottom: 48, left: 78 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const values = pointsData.map((item) => Number(item.net_worth));
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;
  const minTimestamp = Math.min(...pointsData.map((item) => item.timestamp));
  const maxTimestamp = Math.max(...pointsData.map((item) => item.timestamp));
  const timeRange = maxTimestamp - minTimestamp;

  const getX = (timestamp) => {
    if (!timeRange) return padding.left + plotWidth / 2;
    return padding.left + ((timestamp - minTimestamp) / timeRange) * plotWidth;
  };

  const points = pointsData
    .map((item) => {
      const x = getX(item.timestamp);
      const y = padding.top + (1 - (item.net_worth - minValue) / range) * plotHeight;
      return `${x},${y}`;
    })
    .join(" ");

  const formatAxisValue = (value) => asCurrency(value);

  const yTicks = Array.from({ length: 3 }, (_, index) => {
    const ratio = index / 2;
    const value = maxValue - ratio * range;
    const y = padding.top + ratio * plotHeight;
    return { y, value };
  });

  const timeTicks = buildTimeTicks(minTimestamp, maxTimestamp, plotWidth, padding.left);
  const compactDateFormat = pointsData.length > 20;
  const xLabels = timeTicks.map((tick, index) => ({
    x: tick.x,
    label: formatISTDate(new Date(tick.timestamp), {
      day: compactDateFormat ? undefined : "2-digit",
      month: "short",
      year: compactDateFormat ? "2-digit" : "numeric",
    }),
    index,
  }));

  const pointRenderStep = Math.max(1, Math.ceil(pointsData.length / 80));
  const visiblePointIndices = new Set(
    pointsData
      .map((_, idx) => idx)
      .filter((idx) => idx % pointRenderStep === 0 || idx === pointsData.length - 1)
  );

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="chart">
        {timeTicks.map((tick, index) => (
          <line
            key={`x-grid-${index}`}
            x1={tick.x}
            y1={padding.top}
            x2={tick.x}
            y2={height - padding.bottom}
            stroke="#e2e8f0"
            strokeDasharray="4 4"
          />
        ))}

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

        <polyline
          points={points}
          fill="none"
          stroke="#0ea5e9"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {pointsData.map((item, index) => {
          if (!visiblePointIndices.has(index)) return null;

          const x = getX(item.timestamp);
          const y = padding.top + (1 - (item.net_worth - minValue) / range) * plotHeight;

          return (
            <g key={`point-${item.recorded_at}-${index}`}>
              <circle cx={x} cy={y} r="3.25" fill="#0ea5e9" stroke="#ffffff" strokeWidth="1.5" />
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
          Net Worth (₹)
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

function SimpleBitcoinHistoryChart({ data }) {
  if (!data.length) {
    return <p className="hint">No bitcoin history yet. Add your first bitcoin entry.</p>;
  }

  const pointsData = data
    .map((item) => ({
      ...item,
      timestamp: getTimestamp(item.recorded_at),
    }))
    .filter((item) => item.timestamp !== null);

  if (!pointsData.length) {
    return <p className="hint">No valid timestamps available for bitcoin chart.</p>;
  }

  const width = 560;
  const height = 260;
  const padding = { top: 20, right: 34, bottom: 50, left: 96 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const values = pointsData.map((item) => Number(item.bitcoin || 0));
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const axisMin = minValue;
  const axisMax = maxValue;
  const range = axisMax - axisMin || 1;
  const minTimestamp = Math.min(...pointsData.map((item) => item.timestamp));
  const maxTimestamp = Math.max(...pointsData.map((item) => item.timestamp));
  const timeRange = maxTimestamp - minTimestamp;

  const getX = (timestamp) => {
    if (!timeRange) return padding.left + plotWidth / 2;
    return padding.left + ((timestamp - minTimestamp) / timeRange) * plotWidth;
  };

  const points = pointsData
    .map((item) => {
      const x = getX(item.timestamp);
      const y = padding.top + (1 - (Number(item.bitcoin || 0) - axisMin) / range) * plotHeight;
      return `${x},${y}`;
    })
    .join(" ");

  const yTicks = Array.from({ length: 3 }, (_, index) => {
    const ratio = index / 2;
    const value = axisMax - ratio * range;
    const y = padding.top + ratio * plotHeight;
    return { y, value };
  });

  const timeTicks = buildTimeTicks(minTimestamp, maxTimestamp, plotWidth, padding.left);
  const xLabels = timeTicks.map((tick) => ({
    x: tick.x,
    label: formatISTDate(new Date(tick.timestamp)),
  }));

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="chart">
        {timeTicks.map((tick, index) => (
          <line
            key={`btc-x-grid-${index}`}
            x1={tick.x}
            y1={padding.top}
            x2={tick.x}
            y2={height - padding.bottom}
            stroke="#e2e8f0"
            strokeDasharray="4 4"
          />
        ))}

        {yTicks.map((tick, index) => (
          <g key={`btc-y-tick-${index}`}>
            <line
              x1={padding.left}
              y1={tick.y}
              x2={width - padding.right}
              y2={tick.y}
              stroke="#e2e8f0"
              strokeDasharray="4 4"
            />
            <text x={padding.left - 10} y={tick.y + 4} textAnchor="end" fontSize="10" fill="#475569">
              {asBitcoin(tick.value)}
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

        <polyline
          points={points}
          fill="none"
          stroke="#f97316"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {pointsData.map((item, index) => {
          const x = getX(item.timestamp);
          const y = padding.top + (1 - (Number(item.bitcoin || 0) - axisMin) / range) * plotHeight;

          return (
            <g key={`btc-point-${item.recorded_at}-${index}`}>
              <circle cx={x} cy={y} r="3.25" fill="#f97316" stroke="#ffffff" strokeWidth="1.5" />
              <title>
                {formatISTDateTime(item.recorded_at)} — {asBitcoin(item.bitcoin)} BTC
              </title>
            </g>
          );
        })}

        {xLabels.map((tick, index) => (
          <text
            key={`btc-x-label-${index}`}
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
          y={8}
          transform="rotate(-90)"
          textAnchor="middle"
          fontSize="11"
          fill="#334155"
          fontWeight="600"
        >
          Bitcoin (BTC)
        </text>
        <text
          x={width / 2}
          y={height - 4}
          textAnchor="middle"
          fontSize="11"
          fill="#334155"
          fontWeight="600"
        >
          Recorded date
        </text>
      </svg>
      <p className="hint">
        Min: {asBitcoin(minValue)} BTC | Max: {asBitcoin(maxValue)} BTC
      </p>
    </div>
  );
}

function SimpleTopPercentChart({ data, worldPopulation }) {
  if (!worldPopulation || worldPopulation <= 0) {
    return <p className="hint">Enter a valid world population to view top-percent chart.</p>;
  }

  if (!data.length) {
    return <p className="hint">No top-percent history yet. Add bitcoin entries to build the chart.</p>;
  }

  const filtered = data.filter((item) => item.top_percent !== null && item.top_percent !== undefined);
  if (!filtered.length) {
    return <p className="hint">Top-percent cannot be calculated for zero bitcoin values.</p>;
  }

  const pointsData = filtered
    .map((item) => ({
      ...item,
      timestamp: getTimestamp(item.recorded_at),
    }))
    .filter((item) => item.timestamp !== null);

  if (!pointsData.length) {
    return <p className="hint">No valid timestamps available for top-percent chart.</p>;
  }

  const width = 560;
  const height = 260;
  const padding = { top: 20, right: 34, bottom: 50, left: 96 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const values = pointsData.map((item) => Number(item.top_percent || 0));
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const axisMin = minValue;
  const axisMax = maxValue;
  const range = axisMax - axisMin || 1;
  const minTimestamp = Math.min(...pointsData.map((item) => item.timestamp));
  const maxTimestamp = Math.max(...pointsData.map((item) => item.timestamp));
  const timeRange = maxTimestamp - minTimestamp;

  const getX = (timestamp) => {
    if (!timeRange) return padding.left + plotWidth / 2;
    return padding.left + ((timestamp - minTimestamp) / timeRange) * plotWidth;
  };

  const points = pointsData
    .map((item) => {
      const x = getX(item.timestamp);
      const y = padding.top + (1 - (Number(item.top_percent || 0) - axisMin) / range) * plotHeight;
      return `${x},${y}`;
    })
    .join(" ");

  const yTicks = Array.from({ length: 3 }, (_, index) => {
    const ratio = index / 2;
    const value = axisMax - ratio * range;
    const y = padding.top + ratio * plotHeight;
    return { y, value };
  });

  const timeTicks = buildTimeTicks(minTimestamp, maxTimestamp, plotWidth, padding.left);
  const xLabels = timeTicks.map((tick) => ({
    x: tick.x,
    label: formatISTDate(new Date(tick.timestamp)),
  }));

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="chart">
        {timeTicks.map((tick, index) => (
          <line
            key={`pct-x-grid-${index}`}
            x1={tick.x}
            y1={padding.top}
            x2={tick.x}
            y2={height - padding.bottom}
            stroke="#e2e8f0"
            strokeDasharray="4 4"
          />
        ))}

        {yTicks.map((tick, index) => (
          <g key={`pct-y-tick-${index}`}>
            <line
              x1={padding.left}
              y1={tick.y}
              x2={width - padding.right}
              y2={tick.y}
              stroke="#e2e8f0"
              strokeDasharray="4 4"
            />
            <text x={padding.left - 10} y={tick.y + 4} textAnchor="end" fontSize="10" fill="#475569">
              {asPercent(tick.value)}
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

        <polyline
          points={points}
          fill="none"
          stroke="#22c55e"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {pointsData.map((item, index) => {
          const x = getX(item.timestamp);
          const y = padding.top + (1 - (Number(item.top_percent || 0) - axisMin) / range) * plotHeight;

          return (
            <g key={`pct-point-${item.recorded_at}-${index}`}>
              <circle cx={x} cy={y} r="3.25" fill="#22c55e" stroke="#ffffff" strokeWidth="1.5" />
              <title>
                {formatISTDateTime(item.recorded_at)} — {asPercent(item.top_percent)}
              </title>
            </g>
          );
        })}

        {xLabels.map((tick, index) => (
          <text
            key={`pct-x-label-${index}`}
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
          y={8}
          transform="rotate(-90)"
          textAnchor="middle"
          fontSize="11"
          fill="#334155"
          fontWeight="600"
        >
          Top Percent
        </text>
        <text
          x={width / 2}
          y={height - 4}
          textAnchor="middle"
          fontSize="11"
          fill="#334155"
          fontWeight="600"
        >
          Recorded date
        </text>
      </svg>
      <p className="hint">
        Current estimate: <strong>{asPercent(filtered[filtered.length - 1].top_percent)}</strong> at world population {new Intl.NumberFormat("en-IN").format(worldPopulation)}
      </p>
    </div>
  );
}

export default App;
