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

const RUPEES_PER_LAKH = 100000;

export const lakhToRupees = (value) => Number(value || 0) * RUPEES_PER_LAKH;

export const rupeesToLakh = (value) => Number(value || 0) / RUPEES_PER_LAKH;

export const asCurrency = (value) => {
  const numeric = rupeesToLakh(value);
  return `₹${new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(numeric)} L`;
};
