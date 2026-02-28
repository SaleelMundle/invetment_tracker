export const defaultInvestmentForm = {
  stocks: "",
  gold: "",
  bitcoin: "",
  cash: "",
  credit_card_dues: "",
  loan_dues: "",
  recorded_at: "",
};

export const asCurrency = (value) => {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(numeric);
};
