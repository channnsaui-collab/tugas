/* ============================================================
   Student Finance Tracker – script.js
   All application logic: transactions, charts, savings, theme
   ============================================================ */

// ──────────────────────────────────────────────────────────
// 1. Constants & DOM References
// ──────────────────────────────────────────────────────────

/** LocalStorage keys */
const STORAGE_KEYS = {
  TRANSACTIONS: 'sft_transactions',
  THEME: 'sft_theme',
  GOAL: 'sft_goal',
};

/** Category options per type */
const CATEGORIES = {
  income: ['Gaji', 'Freelance', 'Beasiswa', 'Hadiah', 'Investasi', 'Bonus', 'Bisnis', 'Part-time', 'Komisi', 'Transfer Masuk', 'Lainnya'],
  expense: ['Makanan', 'Minuman', 'Transportasi', 'Pendidikan', 'Hiburan', 'Kos/Sewa', 'Listrik & Air', 'Internet & Pulsa', 'Kesehatan', 'Belanja', 'Langganan', 'Laundry', 'Parkir', 'Bensin', 'Pakaian', 'Perawatan Diri', 'Donasi', 'Cicilan', 'Tabungan', 'Lainnya'],
};

/** Chart colour palette (for pie chart slices) */
const PIE_COLORS = [
  '#6366f1', '#818cf8', '#a78bfa', '#c084fc',
  '#f472b6', '#fb7185', '#f87171', '#fbbf24',
  '#34d399', '#2dd4bf',
];

/** DOM shortcuts */
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const dom = {
  // Summary
  totalBalance: $('#totalBalance'),
  totalIncome: $('#totalIncome'),
  totalExpense: $('#totalExpense'),
  balanceBar: $('#balanceBar'),
  balanceCard: $('#balanceCard'),

  // Alert
  alertBanner: $('#alertBanner'),
  alertClose: $('#alertClose'),

  // Form
  form: $('#transactionForm'),
  type: $('#txnType'),
  amount: $('#txnAmount'),
  category: $('#txnCategory'),
  date: $('#txnDate'),
  desc: $('#txnDesc'),

  // Table
  txnBody: $('#txnBody'),
  tableEmpty: $('#tableEmpty'),
  filterType: $('#filterType'),

  // Charts
  pieCanvas: $('#pieChart'),
  barCanvas: $('#barChart'),
  pieEmpty: $('#pieEmpty'),

  // Savings goal
  goalName: $('#goalName'),
  goalAmount: $('#goalAmount'),
  setGoalBtn: $('#setGoalBtn'),
  savingsDisplay: $('#savingsDisplay'),
  goalLabel: $('#goalLabel'),
  goalProgress: $('#goalProgress'),
  goalBar: $('#goalBar'),
  goalNote: $('#goalNote'),
  clearGoalBtn: $('#clearGoalBtn'),

  // Theme
  themeToggle: $('#themeToggle'),
};

// ──────────────────────────────────────────────────────────
// 2. State
// ──────────────────────────────────────────────────────────

/** @type {Array<{id:string, type:string, amount:number, category:string, date:string, desc:string}>} */
let transactions = [];

/** @type {{name:string, target:number}|null} */
let savingsGoal = null;

/** Chart.js instances */
let pieChart = null;
let barChart = null;

// ──────────────────────────────────────────────────────────
// 3. Helpers
// ──────────────────────────────────────────────────────────

/** Generate a short unique ID */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Format a number as IDR (Rupiah) currency */
function currency(n) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

/** Return today's date as YYYY-MM-DD */
function todayISO() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

/** Load JSON from localStorage */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

/** Save JSON to localStorage */
function saveJSON(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

// ──────────────────────────────────────────────────────────
// 4. Theme Toggle
// ──────────────────────────────────────────────────────────

function applyTheme(mode) {
  document.body.classList.toggle('light-mode', mode === 'light');
  localStorage.setItem(STORAGE_KEYS.THEME, mode);
}

function toggleTheme() {
  const next = document.body.classList.contains('light-mode') ? 'dark' : 'light';
  applyTheme(next);
  // Redraw charts so colours match (Chart.js caches text/grid colour)
  renderCharts();
}

// ──────────────────────────────────────────────────────────
// 5. Category Dropdown (dynamic based on type)
// ──────────────────────────────────────────────────────────

function populateCategories() {
  const type = dom.type.value;
  dom.category.innerHTML = '<option value="" disabled selected>Select category</option>';
  if (type && CATEGORIES[type]) {
    CATEGORIES[type].forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      dom.category.appendChild(opt);
    });
  }
}

// ──────────────────────────────────────────────────────────
// 6. Transaction CRUD
// ──────────────────────────────────────────────────────────

/** Add a new transaction from form data */
function addTransaction(e) {
  e.preventDefault();
  const txn = {
    id: uid(),
    type: dom.type.value,
    amount: parseFloat(dom.amount.value),
    category: dom.category.value,
    date: dom.date.value,
    desc: dom.desc.value.trim(),
  };
  transactions.push(txn);
  persist();
  dom.form.reset();
  dom.category.innerHTML = '<option value="" disabled selected>Select category</option>';
  dom.date.value = todayISO(); // re-apply default date
  refresh();
}

/** Delete a transaction by id */
function deleteTransaction(id) {
  transactions = transactions.filter((t) => t.id !== id);
  persist();
  refresh();
}

/** Save transactions to localStorage */
function persist() {
  saveJSON(STORAGE_KEYS.TRANSACTIONS, transactions);
}

// ──────────────────────────────────────────────────────────
// 7. Calculations
// ──────────────────────────────────────────────────────────

function calcTotals() {
  const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  return { income, expense, balance: income - expense };
}

// ──────────────────────────────────────────────────────────
// 8. Render Summary Cards
// ──────────────────────────────────────────────────────────

function renderSummary() {
  const { income, expense, balance } = calcTotals();
  dom.totalBalance.textContent = currency(balance);
  dom.totalIncome.textContent = currency(income);
  dom.totalExpense.textContent = currency(expense);

  // Colour balance card value
  dom.totalBalance.style.color = balance >= 0 ? '' : 'var(--expense-color)';

  // Progress bar: % of income remaining
  const pct = income > 0 ? Math.max(0, Math.min(100, (balance / income) * 100)) : 0;
  dom.balanceBar.style.width = pct + '%';

  // Warning alert
  if (expense > income && income > 0) {
    dom.alertBanner.classList.add('visible');
  } else {
    dom.alertBanner.classList.remove('visible');
  }
}

// ──────────────────────────────────────────────────────────
// 9. Render Transaction Table
// ──────────────────────────────────────────────────────────

function renderTable() {
  const filter = dom.filterType.value;
  let list = [...transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  if (filter !== 'all') list = list.filter(t => t.type === filter);

  dom.txnBody.innerHTML = '';

  if (list.length === 0) {
    dom.tableEmpty.classList.add('visible');
    return;
  }
  dom.tableEmpty.classList.remove('visible');

  list.forEach((t) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.date}</td>
      <td><span class="badge badge-${t.type}">${t.type}</span></td>
      <td>${t.category}</td>
      <td>${t.desc || '—'}</td>
      <td class="text-right amount-${t.type}">${t.type === 'income' ? '+' : '-'}${currency(t.amount)}</td>
      <td class="text-center"><button class="btn btn-danger btn-delete" data-id="${t.id}" title="Delete">✕</button></td>
    `;
    dom.txnBody.appendChild(tr);
  });

  // Attach delete handlers
  dom.txnBody.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteTransaction(btn.dataset.id));
  });
}

// ──────────────────────────────────────────────────────────
// 10. Render Charts (Chart.js)
// ──────────────────────────────────────────────────────────

function chartTextColor() {
  return document.body.classList.contains('light-mode') ? '#334155' : '#8892a6';
}
function chartGridColor() {
  return document.body.classList.contains('light-mode') ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.06)';
}

function renderCharts() {
  renderPieChart();
  renderBarChart();
}

/** Pie chart – expense categories */
function renderPieChart() {
  const expenses = transactions.filter(t => t.type === 'expense');
  const grouped = {};
  expenses.forEach(t => { grouped[t.category] = (grouped[t.category] || 0) + t.amount; });
  const labels = Object.keys(grouped);
  const data = Object.values(grouped);

  if (labels.length === 0) {
    dom.pieEmpty.classList.add('visible');
    if (pieChart) { pieChart.destroy(); pieChart = null; }
    return;
  }
  dom.pieEmpty.classList.remove('visible');

  if (pieChart) pieChart.destroy();
  pieChart = new Chart(dom.pieCanvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: PIE_COLORS.slice(0, labels.length),
        borderWidth: 0,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: chartTextColor(), padding: 14, font: { family: "'Inter', sans-serif", size: 12 } },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${currency(ctx.parsed)}`,
          },
        },
      },
    },
  });
}

/** Bar chart – income vs expense */
function renderBarChart() {
  const { income, expense } = calcTotals();

  if (barChart) barChart.destroy();
  barChart = new Chart(dom.barCanvas, {
    type: 'bar',
    data: {
      labels: ['Income', 'Expense'],
      datasets: [{
        data: [income, expense],
        backgroundColor: ['rgba(52,211,153,.75)', 'rgba(248,113,113,.75)'],
        borderRadius: 8,
        barThickness: 52,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => ` ${currency(ctx.parsed.y)}` },
        },
      },
      scales: {
        x: {
          ticks: { color: chartTextColor(), font: { family: "'Inter', sans-serif" } },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: chartTextColor(),
            font: { family: "'Inter', sans-serif" },
            callback: (v) => 'Rp' + v.toLocaleString('id-ID'),
          },
          grid: { color: chartGridColor() },
        },
      },
    },
  });
}

// ──────────────────────────────────────────────────────────
// 11. Savings Goal
// ──────────────────────────────────────────────────────────

function loadGoal() {
  savingsGoal = loadJSON(STORAGE_KEYS.GOAL, null);
  renderGoal();
}

function setGoal() {
  const name = dom.goalName.value.trim();
  const target = parseFloat(dom.goalAmount.value);
  if (!name || !target || target <= 0) return;
  savingsGoal = { name, target };
  saveJSON(STORAGE_KEYS.GOAL, savingsGoal);
  dom.goalName.value = '';
  dom.goalAmount.value = '';
  renderGoal();
}

function clearGoal() {
  savingsGoal = null;
  localStorage.removeItem(STORAGE_KEYS.GOAL);
  renderGoal();
}

function renderGoal() {
  if (!savingsGoal) {
    dom.savingsDisplay.classList.add('hidden');
    return;
  }
  dom.savingsDisplay.classList.remove('hidden');
  const { balance } = calcTotals();
  const saved = Math.max(0, balance);
  const pct = Math.min(100, (saved / savingsGoal.target) * 100);

  dom.goalLabel.textContent = savingsGoal.name;
  dom.goalProgress.textContent = `${currency(saved)} / ${currency(savingsGoal.target)}`;
  dom.goalBar.style.width = pct + '%';

  if (pct >= 100) {
    dom.goalNote.textContent = "🎉 Congratulations! You've reached your savings goal!";
    dom.goalBar.style.background = 'linear-gradient(90deg, var(--income-color), #2dd4bf)';
  } else {
    const remaining = savingsGoal.target - saved;
    dom.goalNote.textContent = `${currency(remaining)} remaining to reach your goal (${pct.toFixed(1)}% saved).`;
    dom.goalBar.style.background = '';
  }
}

// ──────────────────────────────────────────────────────────
// 12. Master Refresh
// ──────────────────────────────────────────────────────────

function refresh() {
  renderSummary();
  renderTable();
  renderCharts();
  renderGoal();
}

// ──────────────────────────────────────────────────────────
// 13. Event Bindings & Initialisation
// ──────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Load persisted data
  transactions = loadJSON(STORAGE_KEYS.TRANSACTIONS, []);
  const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
  applyTheme(savedTheme);

  // Set default date to today
  dom.date.value = todayISO();

  // Populate categories when type changes
  dom.type.addEventListener('change', populateCategories);

  // Form submission
  dom.form.addEventListener('submit', addTransaction);

  // Filter change
  dom.filterType.addEventListener('change', renderTable);

  // Theme toggle
  dom.themeToggle.addEventListener('click', toggleTheme);

  // Alert close
  dom.alertClose.addEventListener('click', () => dom.alertBanner.classList.remove('visible'));

  // Savings goal buttons
  dom.setGoalBtn.addEventListener('click', setGoal);
  dom.clearGoalBtn.addEventListener('click', clearGoal);

  // Load goal & render everything
  loadGoal();
  refresh();
});
