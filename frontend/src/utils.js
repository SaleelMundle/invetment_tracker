export const defaultInvestmentForm = {
  stocks: [""],
  gold: [""],
  bitcoin: [""],
  cash: [""],
  credit_card_dues: [""],
  total_loan_taken: [""],
  loan_repaid: [""],
  recorded_at: "",
};

export const defaultBitcoinForm = {
  sources: [""],
  recorded_at: "",
};

const RUPEES_PER_LAKH = 100000;
const LAKH_PER_CRORE = 100;

export const lakhToRupees = (value) => Number(value || 0) * RUPEES_PER_LAKH;

export const rupeesToLakh = (value) => Number(value || 0) / RUPEES_PER_LAKH;

export const asCurrency = (value) => {
  const numeric = rupeesToLakh(value);
  const absNumeric = Math.abs(numeric);
  const useCrore = absNumeric >= LAKH_PER_CRORE;
  const displayValue = useCrore ? numeric / LAKH_PER_CRORE : numeric;
  const unit = useCrore ? "Cr" : "L";

  return `₹${new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(displayValue)} ${unit}`;
};

export const asBitcoin = (value) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  }).format(Number(value || 0));

export const asPercent = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "N/A";
  }

  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  }).format(Number(value))}%`;
};
