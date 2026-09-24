const fs = require('fs');

// Create mock browser environment for app.js test
const localStorageMock = {};
global.localStorage = {
  getItem: (k) => localStorageMock[k] || null,
  setItem: (k, v) => { localStorageMock[k] = String(v); },
  removeItem: (k) => { delete localStorageMock[k]; }
};

const elements = {};
function createMockElement(id) {
  return {
    id,
    value: '',
    textContent: '',
    innerHTML: '',
    style: {},
    dataset: {},
    classList: {
      toggle: () => {},
      add: () => {},
      remove: () => {}
    },
    addEventListener: () => {},
    querySelectorAll: () => [],
    querySelector: () => null,
    reset: function() { this.value = ''; }
  };
}

global.document = {
  getElementById: (id) => elements[id] || (elements[id] = createMockElement(id)),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {}
};
global.window = {
  addEventListener: () => {},
  matchMedia: () => ({ matches: false, addEventListener: () => {} })
};
global.navigator = { serviceWorker: { register: () => Promise.resolve() } };

// Set up documentElement and body mock
function createFullMockElement(id) {
  return {
    id,
    value: '',
    textContent: '',
    innerHTML: '',
    style: {},
    dataset: {},
    classList: {
      toggle: () => {},
      add: () => {},
      remove: () => {}
    },
    addEventListener: () => {},
    querySelectorAll: () => [],
    querySelector: () => null,
    setAttribute: () => {},
    getAttribute: () => null,
    removeAttribute: () => {},
    reset: function() { this.value = ''; }
  };
}

global.document = {
  getElementById: (id) => elements[id] || (elements[id] = createFullMockElement(id)),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  documentElement: { setAttribute: () => {}, getAttribute: () => null },
  body: createFullMockElement("body")
};
global.window = {
  addEventListener: () => {},
  matchMedia: () => ({ matches: false, addEventListener: () => {} })
};
global.navigator = { serviceWorker: { register: () => Promise.resolve() } };

// Set up mock test data in localStorage before eval
localStorageMock["budget-control-account-balances"] = JSON.stringify({
  cib: { name: "CIB", balance: 10000, maturityDay: 15 },
  hsbc: { name: "HSBC", balance: 5000, maturityDay: 30 }
});

localStorageMock["budget-control-cash-entries"] = JSON.stringify([
  {
    id: "card-exp-1",
    date: "2026-03-05",
    category: "Groceries",
    amount: 1500,
    type: "expense",
    creditType: "cib_card",
    account: "CIB Credit",
    creditSettlementDate: "2026-04-15"
  },
  {
    id: "card-exp-2",
    date: "2026-03-10",
    category: "Dining",
    amount: 2500,
    type: "expense",
    creditType: "cib_card",
    account: "CIB Credit",
    creditSettlementDate: "2026-04-15"
  }
]);

localStorageMock["budget-control-credit-dues"] = JSON.stringify({ cib: { "2026-04": 1000 } });
localStorageMock["budget-control-credit-settlement-overrides"] = JSON.stringify({});

// Read app.js and append test assertions
const appCode = fs.readFileSync('c:/Users/xear0/Desktop/my repos/Budgetapp/app.js', 'utf8');

const testCode = `
console.log("\\n--- TEST 1: Generate Credit Due Entries ---");
const dues = creditDueEntries();
console.log("Generated dues count:", dues.length);
const cibApr = dues.find(d => d.id === "credit-settlement-cib-2026-04");
console.log("CIB Apr Due:", cibApr);
if (cibApr && cibApr.category === "CIB Credit Due" && cibApr.amount === 5000 && cibApr.creditType === "cib") {
  console.log("✓ TEST 1 PASSED: Category is 'CIB Credit Due', amount is 5000 (1000 base + 4000 card), creditType is 'cib'");
} else {
  console.error("✗ TEST 1 FAILED");
  process.exit(1);
}

console.log("\\n--- TEST 2: User Override for Date and Amount ---");
creditSettlementOverrides["credit-settlement-cib-2026-04"] = {
  date: "2026-04-20",
  amount: 6500
};
const overriddenDues = creditDueEntries();
const overriddenCibApr = overriddenDues.find(d => d.id === "credit-settlement-cib-2026-04");
console.log("Overridden CIB Apr Due:", overriddenCibApr);
if (overriddenCibApr && overriddenCibApr.date === "2026-04-20" && overriddenCibApr.amount === 6500 && overriddenCibApr.isCustomized === true) {
  console.log("✓ TEST 2 PASSED: Custom date 2026-04-20 and custom amount 6500 respected with isCustomized=true");
} else {
  console.error("✗ TEST 2 FAILED");
  process.exit(1);
}

console.log("\\n--- TEST 3: Recalculate From History ---");
editingEntry = overriddenCibApr;
const mockForm = {
  elements: {
    amount: { value: 6500 },
    date: { value: "2026-04-20" },
    actualAmount: { value: 0 },
    creditType: { value: "cib" }
  },
  dataset: {}
};
elements["entryForm"] = mockForm;
elements["recalcCreditDueStatus"] = createFullMockElement("recalcCreditDueStatus");

handleRecalculateCreditDueFromHistory();

console.log("Recalculated Form Amount:", mockForm.elements.amount.value);
console.log("Recalculated Form Date:", mockForm.elements.date.value);
console.log("Recalculated Form Actual:", mockForm.elements.actualAmount.value);
console.log("Form Dataset clearedOverride:", mockForm.dataset.clearedOverride);
console.log("Recalc Status HTML:", elements["recalcCreditDueStatus"].innerHTML);

if (
  mockForm.elements.amount.value === 5000 &&
  mockForm.elements.date.value === "2026-04-15" &&
  mockForm.elements.actualAmount.value === 4000 &&
  mockForm.dataset.clearedOverride === "true"
) {
  console.log("✓ TEST 3 PASSED: Recalculate from history successfully populated 5000 planned, 4000 card spend actual, 2026-04-15 maturity date, and flagged clearedOverride");
} else {
  console.error("✗ TEST 3 FAILED");
  process.exit(1);
}

console.log("\\nAll diagnostic tests passed successfully!");
`;

eval(appCode + "\n;" + testCode);

