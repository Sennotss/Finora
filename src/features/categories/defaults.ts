type DefaultCategory = { name: string; color: string; icon: string; children?: string[] };

export const DEFAULT_INCOME_CATEGORIES: DefaultCategory[] = [
  { name: "Salary", color: "#10b981", icon: "briefcase" },
  { name: "Bonus", color: "#14b8a6", icon: "gift" },
  { name: "Freelance", color: "#06b6d4", icon: "laptop" },
  { name: "Business", color: "#0ea5e9", icon: "store" },
  { name: "Investment Income", color: "#6366f1", icon: "trending-up" },
  { name: "Interest", color: "#8b5cf6", icon: "percent" },
  { name: "Gifts Received", color: "#ec4899", icon: "heart" },
  { name: "Refunds", color: "#84cc16", icon: "rotate-ccw" },
  { name: "Other Income", color: "#64748b", icon: "plus-circle" },
];

export const DEFAULT_EXPENSE_CATEGORIES: DefaultCategory[] = [
  { name: "Food & Dining", color: "#f97316", icon: "utensils", children: ["Groceries", "Restaurants", "Coffee & Snacks"] },
  { name: "Transportation", color: "#3b82f6", icon: "car", children: ["Fuel", "Ride Hailing", "Public Transport", "Parking & Tolls", "Vehicle Maintenance"] },
  { name: "Housing", color: "#8b5cf6", icon: "home", children: ["Rent", "Home Maintenance"] },
  { name: "Bills & Utilities", color: "#eab308", icon: "zap", children: ["Electricity", "Water", "Internet", "Phone"] },
  { name: "Subscriptions", color: "#a855f7", icon: "repeat" },
  { name: "Shopping", color: "#ec4899", icon: "shopping-bag", children: ["Clothing", "Electronics", "Household"] },
  { name: "Health", color: "#ef4444", icon: "heart-pulse", children: ["Medical", "Pharmacy", "Fitness"] },
  { name: "Insurance", color: "#0ea5e9", icon: "shield" },
  { name: "Education", color: "#14b8a6", icon: "graduation-cap" },
  { name: "Entertainment", color: "#f43f5e", icon: "film" },
  { name: "Travel", color: "#06b6d4", icon: "plane" },
  { name: "Personal Care", color: "#d946ef", icon: "sparkles" },
  { name: "Family", color: "#f59e0b", icon: "users" },
  { name: "Gifts & Donations", color: "#10b981", icon: "gift" },
  { name: "Debt Payments", color: "#64748b", icon: "landmark", children: ["Loan Payment"] },
  { name: "Fees & Charges", color: "#78716c", icon: "receipt" },
  { name: "Taxes", color: "#57534e", icon: "file-text" },
  { name: "Other Expense", color: "#94a3b8", icon: "circle-ellipsis" },
];
