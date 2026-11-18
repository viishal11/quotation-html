/* =====================================================================
   Folio — Quotation & Invoice generator
   Pure browser app: no server, data in localStorage.
   ===================================================================== */
'use strict';

/* ---------------------------------------------------------------------
   1. Constants & defaults
   --------------------------------------------------------------------- */
const LS = {
  business: 'folio.business',
  settings: 'folio.settings',
  docs: 'folio.docs',
  working: 'folio.working',
  counters: 'folio.counters',
};

const CURRENCIES = {
  INR: { symbol: '₹', locale: 'en-IN', label: 'INR ₹ — Indian Rupee', major: 'Rupees', minor: 'Paise' },
  USD: { symbol: '$', locale: 'en-US', label: 'USD $ — US Dollar', major: 'Dollars', minor: 'Cents' },
  EUR: { symbol: '€', locale: 'en-IE', label: 'EUR € — Euro', major: 'Euros', minor: 'Cents' },
  GBP: { symbol: '£', locale: 'en-GB', label: 'GBP £ — British Pound', major: 'Pounds', minor: 'Pence' },
  AED: { symbol: 'د.إ', locale: 'en-AE', label: 'AED د.إ — UAE Dirham', major: 'Dirhams', minor: 'Fils' },
};

const QUOTE_SECTIONS = {
  preparedFor: 'Prepared For',
  description: 'Project Description',
  scope: 'Scope of Work',
  deliverables: 'Deliverables',
  features: 'Feature Completeness Summary',
  tech: 'Technology Stack',
  timeline: 'Project Timeline',
  pricing: 'Project Quotation',
  payment: 'Payment Terms',
  assumptions: 'Assumptions',
  maintenance: 'Maintenance & Support',
  terms: 'Terms & Conditions',
  acceptance: 'Acceptance',
};

const INVOICE_SECTIONS = {
  parties: 'Billed To',
  items: 'Invoice Items',
  payment: 'Payment Information',
  notes: 'Notes',
  terms: 'Terms & Conditions',
  signature: 'Signature',
};

const STATUSES = ['Draft', 'Sent', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'];
const FEATURE_STATUS = ['Included', 'Optional', 'Phase 2', 'Not included'];
const PAY_METHODS = ['Bank Transfer', 'UPI', 'Cash', 'Razorpay', 'PayPal', 'Other'];
const TEMPLATES = { modern: 'Modern', corporate: 'Corporate', minimal: 'Minimal' };

const DEFAULT_SETTINGS = {
  template: 'modern',
  primary: '#16505B',
  secondary: '#D08A1E',
  qtPrefix: 'QT',
  invPrefix: 'INV',
};

const PAYMENT_PRESETS = {
  '100': [{ name: '100% upfront', pct: '100', due: 'Before project kick-off' }],
  '50-50': [
    { name: 'Advance', pct: '50', due: 'On acceptance of quotation' },
    { name: 'On completion', pct: '50', due: 'Before final delivery' },
  ],
  '40-30-30': [
    { name: 'Advance', pct: '40', due: 'On acceptance of quotation' },
    { name: 'Development', pct: '30', due: 'After design approval' },
    { name: 'Final delivery', pct: '30', due: 'Before go-live' },
  ],
};

const DEFAULT_ASSUMPTIONS = [
  'Client will provide all required content (text, product data, policies).',
  'Client will provide logo, brand guidelines and images.',
  'Domain and hosting charges are not included.',
  'Third-party API and subscription charges are not included.',
  'Additional features outside the agreed scope will be charged separately.',
];

const DEFAULT_QUOTE_TERMS =
  '<ul>' +
  '<li>Scope is limited to the items mentioned in this quotation.</li>' +
  '<li>Additional requirements will be estimated and charged separately.</li>' +
  '<li>Client must provide required content, assets and credentials on time.</li>' +
  '<li>Project timeline depends on timely client feedback and approvals.</li>' +
  '<li>Third-party service charges are not included unless specifically mentioned.</li>' +
  '<li>Payments must be made according to the payment terms in this quotation.</li>' +
  '<li>Final project delivery and handover of source code are subject to full payment.</li>' +
  '</ul>';

const DEFAULT_INVOICE_TERMS =
  '<ul>' +
  '<li>Payment is due by the due date shown on this invoice.</li>' +
  '<li>Please quote the invoice number as your payment reference.</li>' +
  '<li>Late payments may attract interest of 1.5% per month on the outstanding amount.</li>' +
  '<li>Source code and final files are handed over once the invoice is paid in full.</li>' +
  '</ul>';

const DEFAULT_ACCEPTANCE =
  'By accepting this quotation, the client confirms that they have reviewed and agreed to the scope of work, pricing, payment terms and conditions mentioned in this quotation.';

const DEFAULT_BUSINESS = {
  name: '', logo: '', signature: '',
  address: '', city: '', state: '', country: 'India', pin: '',
  email: '', phone: '', whatsapp: '', website: '', gst: '', pan: '',
  bankName: '', accountName: '', accountNumber: '', ifsc: '', upi: '', paymentLink: '',
};

const SAMPLE_BUSINESS = {
  ...DEFAULT_BUSINESS,
  name: 'Aarav Mehta Studio',
  address: '402, Sunrise Business Park, Baner Road',
  city: 'Pune', state: 'Maharashtra', country: 'India', pin: '411045',
  email: 'hello@aaravmehta.dev', phone: '+91 98765 43210', whatsapp: '+91 98765 43210',
  website: 'aaravmehta.dev', gst: '27ABCDE1234F1Z5', pan: 'ABCDE1234F',
  bankName: 'HDFC Bank', accountName: 'Aarav Mehta', accountNumber: '50100123456789',
  ifsc: 'HDFC0001234', upi: 'aarav@okhdfcbank', paymentLink: '',
};

/* ---------------------------------------------------------------------
   2. Application state
   --------------------------------------------------------------------- */
const state = {
  view: 'dashboard',
  mode: 'quotation',             // which document the editor shows
  business: { ...DEFAULT_BUSINESS },
  settings: { ...DEFAULT_SETTINGS },
  docs: { quotation: null, invoice: null },
  dirty: { quotation: false, invoice: false },
  cards: {},                     // remembered open/closed state of editor cards
  pane: 'edit',                  // mobile: edit | preview
  focusPreview: false,
  savedFilter: 'all',
  savedSearch: '',
  uploadTarget: null,
};

const currentDoc = () => state.docs[state.mode];

/* ---------------------------------------------------------------------
   3. Small utilities
   --------------------------------------------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clone = (o) => JSON.parse(JSON.stringify(o));

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const nl2br = (s) => esc(s).replace(/\n/g, '<br>');

/** Parse user-entered numbers safely ("1,200" -> 1200, "" -> 0). */
function num(v) {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const clampPct = (n) => Math.min(100, Math.max(0, n));

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}
function parseISO(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d) ? null : d;
}
function fmtDate(iso) {
  const d = parseISO(iso);
  return d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
}
function fmtQty(v) {
  const n = num(v);
  return Number.isInteger(n) ? String(n) : String(round2(n));
}
function fmtPct(v) {
  const n = num(v);
  return (Number.isInteger(n) ? n : round2(n)) + '%';
}

/* ---------------------------------------------------------------------
   4. Storage helpers
   --------------------------------------------------------------------- */
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function store(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error(e);
    toast('Browser storage is full. Delete old documents or upload a smaller logo.', 'err');
    return false;
  }
}
const loadDocs = () => load(LS.docs, {});

const debounce = (fn, ms) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

const persistWorking = debounce(() => {
  store(LS.working, { docs: state.docs, dirty: state.dirty });
}, 400);
const persistBusiness = debounce(() => store(LS.business, state.business), 300);
const persistSettings = debounce(() => store(LS.settings, state.settings), 300);

/* ---------------------------------------------------------------------
   5. Money, numbers in words, calculations
   --------------------------------------------------------------------- */
const fmtCache = {};
/** Format a value as currency, e.g. ₹1,12,100.00 */
function money(v, cur = 'INR') {
  const c = CURRENCIES[cur] || CURRENCIES.INR;
  const n = Number.isFinite(v) ? round2(v) : 0;
  fmtCache[c.locale] ||= new Intl.NumberFormat(c.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const s = fmtCache[c.locale].format(Math.abs(n));
  return (n < 0 ? '−' : '') + c.symbol + (cur === 'AED' ? ' ' : '') + s;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : ''));
const three = (n) => {
  const h = Math.floor(n / 100), r = n % 100;
  return [h ? ONES[h] + ' Hundred' : '', r ? two(r) : ''].filter(Boolean).join(' ');
};
/** Indian numbering: lakh / crore */
function wordsIndian(n) {
  if (n === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(wordsIndian(crore) + ' Crore');
  if (lakh) parts.push(two(lakh) + ' Lakh');
  if (thousand) parts.push(two(thousand) + ' Thousand');
  if (rest) parts.push(three(rest));
  return parts.join(' ');
}
/** International numbering: thousand / million / billion */
function wordsIntl(n) {
  if (n === 0) return 'Zero';
  const scales = ['', ' Thousand', ' Million', ' Billion', ' Trillion'];
  const parts = [];
  let i = 0;
  while (n > 0 && i < scales.length) {
    const chunk = n % 1000;
    if (chunk) parts.unshift(three(chunk) + scales[i]);
    n = Math.floor(n / 1000);
    i++;
  }
  return parts.join(' ');
}
function amountInWords(v, cur) {
  const c = CURRENCIES[cur] || CURRENCIES.INR;
  const cents = Math.round(Math.abs(v) * 100);
  const major = Math.floor(cents / 100), minor = cents % 100;
  const w = cur === 'INR' ? wordsIndian : wordsIntl;
  let s = `${c.major} ${w(major)}`;
  if (minor) s += ` and ${w(minor)} ${c.minor}`;
  return s + ' Only';
}

/**
 * Totals for a list of line items.
 * Line: gross = qty × price; line discount (%) comes off gross.
 * Document discount (fixed or %) is shared across lines in proportion to
 * their value, so per-line tax rates stay correct.
 */
function calcTotals(items, discount) {
  const lines = (items || []).map((it) => {
    const gross = num(it.qty) * num(it.price);
    const lineDisc = gross * clampPct(num(it.discount)) / 100;
    return { gross, lineDisc, net: gross - lineDisc, rate: clampPct(num(it.tax)) };
  });
  const subtotal = lines.reduce((a, l) => a + l.gross, 0);
  const lineDiscount = lines.reduce((a, l) => a + l.lineDisc, 0);
  const netTotal = subtotal - lineDiscount;

  const dv = Math.max(0, num(discount?.value));
  let overall = discount?.type === 'fixed' ? Math.min(dv, netTotal) : netTotal * clampPct(dv) / 100;
  overall = Math.max(0, overall);

  let tax = 0;
  lines.forEach((l) => {
    const share = netTotal > 0 ? overall * (l.net / netTotal) : 0;
    l.taxable = l.net - share;
    l.taxAmt = l.taxable * l.rate / 100;
    tax += l.taxAmt;
  });
  const discountTotal = lineDiscount + overall;
  const taxable = subtotal - discountTotal;
  const rates = [...new Set(lines.filter((l) => l.net > 0).map((l) => l.rate))];
  return {
    lines, subtotal, lineDiscount, overall, discountTotal, taxable,
    tax: round2(tax), grand: round2(taxable + tax),
    uniformRate: rates.length === 1 ? rates[0] : null,
  };
}
function calcDoc(d) {
  const T = calcTotals(d.items, d.discount);
  if (d.type === 'invoice') {
    T.paid = Math.max(0, num(d.amountPaid));
    T.balance = round2(T.grand - T.paid);
  }
  return T;
}

/** Total days from durations such as "5 Days", "2 weeks", "1 month". */
function timelineDays(rows) {
  let total = 0, found = 0;
  (rows || []).forEach((r) => {
    const m = String(r.duration || '').match(/(\d+(?:\.\d+)?)\s*(days?|d|weeks?|wks?|w|months?|mo)\b/i);
    if (!m) return;
    found++;
    const n = parseFloat(m[1]), u = m[2].toLowerCase();
    total += u.startsWith('mo') ? n * 30 : u.startsWith('w') ? n * 7 : n;
  });
  return found ? Math.round(total) : 0;
}

/* ---------------------------------------------------------------------
   6. Document numbering & factories
   --------------------------------------------------------------------- */
/** Next number like QT-2026-004. Uses a stored counter and saved docs. */
function nextNumber(type) {
  const prefix = (type === 'quotation' ? state.settings.qtPrefix : state.settings.invPrefix) || (type === 'quotation' ? 'QT' : 'INV');
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;
  const counters = load(LS.counters, {});
  let max = counters[key] || 0;
  const re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-' + year + '-(\\d+)$');
  Object.values(loadDocs()).forEach((d) => {
    const m = String(d.number || '').match(re);
    if (m) max = Math.max(max, +m[1]);
  });
  [state.docs.quotation, state.docs.invoice].forEach((d) => {
    const m = d && String(d.number || '').match(re);
    if (m) max = Math.max(max, +m[1]);
  });
  counters[key] = max + 1;
  store(LS.counters, counters);
  return `${key}-${String(max + 1).padStart(3, '0')}`;
}
function peekNextNumber(type) {
  const prefix = type === 'quotation' ? state.settings.qtPrefix : state.settings.invPrefix;
  const key = `${prefix}-${new Date().getFullYear()}`;
  const n = (load(LS.counters, {})[key] || 0) + 1;
  return `${key}-${String(n).padStart(3, '0')}`;
}

const blankClient = () => ({
  name: '', company: '', email: '', phone: '', whatsapp: '',
  address: '', city: '', state: '', country: 'India', pin: '', gst: '',
});
const blankItem = (withUnit = true) => ({ name: '', detail: '', qty: '1', unit: withUnit ? 'Project' : '', price: '', discount: '0', tax: '18' });

function blankQuotation(number = '') {
  return {
    id: uid(), type: 'quotation', number,
    date: todayISO(), validUntil: todayISO(15),
    projectName: '', preparedBy: state.business.name || '', currency: 'INR',
    client: blankClient(),
    description: '',
    scope: [{ title: '', desc: '', qty: '1', time: '' }],
    deliverables: [],
    features: [],
    tech: [],
    timeline: [],
    items: [blankItem()],
    discount: { type: 'percent', value: '0' },
    taxLabel: 'GST', splitGst: false,
    paymentPreset: '50-50',
    milestones: clone(PAYMENT_PRESETS['50-50']),
    paymentNote: '',
    assumptions: DEFAULT_ASSUMPTIONS.map((text) => ({ text })),
    maintenance: {
      period: '30 days free bug support after go-live',
      services: 'Bug fixes, minor content updates, uptime checks',
      rate: 'Additional development at ₹1,000 / hour',
      response: 'Within 24 business hours',
    },
    terms: DEFAULT_QUOTE_TERMS,
    acceptance: { text: DEFAULT_ACCEPTANCE, authorized: '', clientSignature: '' },
    sections: Object.keys(QUOTE_SECTIONS).map((key) => ({ key, on: true })),
    created: Date.now(), updated: Date.now(),
  };
}

function blankInvoice(number = '') {
  return {
    id: uid(), type: 'invoice', number,
    date: todayISO(), dueDate: todayISO(7),
    relatedQuote: '', projectName: '', currency: 'INR', status: 'Draft',
    client: blankClient(),
    items: [blankItem(false)],
    discount: { type: 'percent', value: '0' },
    taxLabel: 'GST', splitGst: false,
    amountPaid: '0',
    paymentMethod: 'Bank Transfer', showPayment: true,
    notes: 'Thank you for your business. It was a pleasure working with you.',
    terms: DEFAULT_INVOICE_TERMS,
    signedBy: '',
    sections: Object.keys(INVOICE_SECTIONS).map((key) => ({ key, on: true })),
    created: Date.now(), updated: Date.now(),
  };
}

/** Rich sample quotation shown on first launch. */
function sampleQuotation() {
  const q = blankQuotation(nextNumber('quotation'));
  Object.assign(q, {
    projectName: 'E-commerce Website with Admin Dashboard',
    preparedBy: state.business.name,
    client: {
      name: 'Priya Sharma', company: 'BrightLeaf Organics Pvt. Ltd.', email: 'priya@brightleaf.in',
      phone: '+91 99887 76655', whatsapp: '+91 99887 76655',
      address: '18, 2nd Cross, Indiranagar', city: 'Bengaluru', state: 'Karnataka',
      country: 'India', pin: '560038', gst: '29AAACB1234C1Z2',
    },
    description:
      '<p>BrightLeaf Organics wants a fast, mobile-first online store to sell its organic product range directly to customers, with a simple dashboard for the team to manage products, orders and stock.</p>' +
      '<h3>Objectives</h3><ul><li>Launch a responsive storefront with secure online payments</li>' +
      '<li>Give the team one dashboard for catalogue, orders and customers</li>' +
      '<li>Build a solid SEO foundation for organic search traffic</li></ul>',
    scope: [
      { title: 'UI/UX Design', desc: 'Wireframes and high-fidelity designs for all key pages', qty: '1', time: '5 days' },
      { title: 'Website Development', desc: 'Storefront, product catalogue, cart and checkout', qty: '1', time: '10 days' },
      { title: 'Admin Dashboard', desc: 'Products, orders, customers and stock management', qty: '1', time: '6 days' },
      { title: 'Payment Gateway Integration', desc: 'Razorpay checkout, webhooks and refunds', qty: '1', time: '2 days' },
      { title: 'Testing', desc: 'Cross-browser, device and payment-flow QA', qty: '1', time: '3 days' },
      { title: 'Deployment', desc: 'Server setup, SSL, backups and go-live', qty: '1', time: '2 days' },
    ],
    deliverables: [
      { text: 'Responsive website for desktop, tablet and mobile' },
      { text: 'Admin dashboard with role-based access' },
      { text: 'Complete source code and database export' },
      { text: 'Deployment on the client’s hosting account' },
      { text: 'Handover document and a 30-minute walkthrough call' },
    ],
    features: [
      { name: 'User Login', included: 'Yes', status: 'Included', notes: 'Secure authentication with OTP' },
      { name: 'Admin Dashboard', included: 'Yes', status: 'Included', notes: 'Complete dashboard' },
      { name: 'Responsive Design', included: 'Yes', status: 'Included', notes: 'Mobile + desktop' },
      { name: 'Payment Gateway', included: 'Yes', status: 'Included', notes: 'Razorpay' },
      { name: 'SEO', included: 'Yes', status: 'Included', notes: 'Basic on-page SEO' },
      { name: 'Blog', included: 'No', status: 'Phase 2', notes: 'Can be added later' },
    ],
    tech: [
      { name: 'HTML / CSS', purpose: 'Frontend' },
      { name: 'JavaScript', purpose: 'Application logic' },
      { name: 'PHP', purpose: 'Backend' },
      { name: 'MySQL', purpose: 'Database' },
      { name: 'Razorpay', purpose: 'Payment gateway' },
    ],
    timeline: [
      { phase: 'Planning', desc: 'Requirement analysis', duration: '2 days' },
      { phase: 'Design', desc: 'UI/UX design', duration: '5 days' },
      { phase: 'Development', desc: 'Website and dashboard development', duration: '10 days' },
      { phase: 'Testing', desc: 'QA and bug fixing', duration: '3 days' },
      { phase: 'Deployment', desc: 'Live deployment', duration: '2 days' },
    ],
    items: [
      { name: 'Website Design', detail: 'UI/UX for storefront and dashboard', qty: '1', unit: 'Project', price: '25000', discount: '0', tax: '18' },
      { name: 'Website Development', detail: 'Storefront, cart, checkout, Razorpay', qty: '1', unit: 'Project', price: '50000', discount: '0', tax: '18' },
      { name: 'Admin Dashboard', detail: 'Catalogue, orders, customers, stock', qty: '1', unit: 'Project', price: '20000', discount: '0', tax: '18' },
    ],
    paymentPreset: '40-30-30',
    milestones: clone(PAYMENT_PRESETS['40-30-30']),
    paymentNote: 'Payments can be made by bank transfer or UPI. Work on each phase begins once the related payment is received.',
  });
  return q;
}

/** Deep-merge loaded data over defaults so old/imported files still work. */
function mergeDefaults(base, data) {
  if (Array.isArray(base)) return Array.isArray(data) ? data : base;
  if (base && typeof base === 'object') {
    const out = { ...base };
    if (data && typeof data === 'object') {
      Object.keys(data).forEach((k) => { out[k] = k in base ? mergeDefaults(base[k], data[k]) : data[k]; });
    }
    return out;
  }
  return data === undefined || data === null ? base : data;
}
function normalizeDoc(d) {
  const base = d.type === 'invoice' ? blankInvoice() : blankQuotation();
  const out = mergeDefaults(base, d);
  const keys = Object.keys(d.type === 'invoice' ? INVOICE_SECTIONS : QUOTE_SECTIONS);
  out.sections = out.sections.filter((s) => keys.includes(s.key));
  keys.forEach((k) => { if (!out.sections.some((s) => s.key === k)) out.sections.push({ key: k, on: true }); });
  return out;
}

/* ---------------------------------------------------------------------
   7. Path binding (data-path="doc.client.name")
   --------------------------------------------------------------------- */
const bindRoot = () => ({ doc: currentDoc(), business: state.business, settings: state.settings });
function getVal(path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), bindRoot());
}
function setVal(path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const obj = keys.reduce((o, k) => (o == null ? undefined : o[k]), bindRoot());
  if (obj != null) obj[last] = value;
}

/* ---------------------------------------------------------------------
   8. Icons
   --------------------------------------------------------------------- */
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  quote: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  invoice: '<path d="M5 2h14v20l-3.5-2-3.5 2-3.5-2L5 22z"/><path d="M9 7h6M9 11h6M9 15h3"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  save: '<path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3M7 21v-7h10v7"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
  printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  convert: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  erase: '<path d="M4 20h16"/><path d="M7 16l-3-3 9-9 7 7-5 5z"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>',
  ul: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  ol: '<path d="M10 6h10M10 12h10M10 18h10M4 4.5h1.5V9M4 9h3M4 14.5h3l-3 4h3"/>',
};
function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}
function hydrateIcons(root = document) {
  $$('i[data-icon]', root).forEach((el) => { el.outerHTML = icon(el.dataset.icon); });
}

/* ---------------------------------------------------------------------
   9. Toasts & dialogs
   --------------------------------------------------------------------- */
function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `${icon(type === 'err' ? 'alert' : 'check')}<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 300); }, type === 'err' ? 5000 : 2800);
}

/** Generic modal. Resolves with the value of the clicked button. */
function modal({ title, body, buttons = [{ label: 'OK', value: true, primary: true }], wide = false }) {
  return new Promise((resolve) => {
    const root = $('#modal-root');
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">${esc(title)}</h2>
        <div class="modal-body">${body}</div>
        <div class="modal-actions">${buttons.map((b, i) =>
          `<button class="btn ${b.primary ? (b.danger ? 'btn-danger' : 'btn-primary') : ''}" data-mi="${i}">${esc(b.label)}</button>`).join('')}</div>
      </div>`;
    const prevFocus = document.activeElement;
    const close = (val) => {
      wrap.classList.remove('in');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => wrap.remove(), 180);
      prevFocus && prevFocus.focus && prevFocus.focus();
      resolve(val);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) return close(null);
      const b = e.target.closest('[data-mi]');
      if (b) close(buttons[+b.dataset.mi].value);
      const g = e.target.closest('[data-goto]');
      if (g) { close(null); gotoField(g.dataset.goto); }
    });
    document.addEventListener('keydown', onKey);
    root.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('in'));
    const primary = wrap.querySelector('.btn-primary, .btn-danger') || wrap.querySelector('.btn');
    primary && primary.focus();
  });
}
function confirmDialog(title, text, okLabel = 'Continue', danger = false) {
  return modal({
    title, body: `<p>${esc(text)}</p>`,
    buttons: [{ label: 'Cancel', value: false }, { label: okLabel, value: true, primary: true, danger }],
  }).then(Boolean);
}

let busyEl = null;
function busy(text) {
  if (!text) { busyEl && busyEl.remove(); busyEl = null; return; }
  if (!busyEl) {
    busyEl = document.createElement('div');
    busyEl.className = 'busy';
    busyEl.innerHTML = '<div class="busy-card"><span class="spinner"></span><span class="busy-text"></span></div>';
    document.body.appendChild(busyEl);
  }
  busyEl.querySelector('.busy-text').textContent = text;
}

/* ---------------------------------------------------------------------
   10. Form building blocks
   --------------------------------------------------------------------- */
/**
 * A single labelled form field bound to a data path.
 * o: { type, options, span (of 12), req, ph, help, rows, hideLabel }
 */
function fld(label, path, o = {}) {
  const v = getVal(path);
  const id = 'f_' + path.replace(/\W/g, '_');
  const span = o.span || 6;
  const style = `style="--s:${span}"`;
  const cls = `field ${span <= 3 ? 'sm' : ''} ${o.cls || ''}`;
  if (o.type === 'checkbox') {
    return `<label class="check ${o.cls || ''}" ${style}><input type="checkbox" data-path="${path}" ${v ? 'checked' : ''}><span>${esc(label)}</span></label>`;
  }
  let input;
  if (o.type === 'select') {
    input = `<select id="${id}" data-path="${path}">${o.options.map((op) => {
      const [val, lab] = Array.isArray(op) ? op : [op, op];
      return `<option value="${esc(val)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(lab)}</option>`;
    }).join('')}</select>`;
  } else if (o.type === 'textarea') {
    input = `<textarea id="${id}" data-path="${path}" rows="${o.rows || 3}" placeholder="${esc(o.ph || '')}">${esc(v ?? '')}</textarea>`;
  } else if (o.type === 'color') {
    input = `<div class="color-in"><input type="color" id="${id}" data-path="${path}" value="${esc(v)}"><code>${esc(v)}</code></div>`;
  } else {
    const numAttrs = o.type === 'number' ? 'step="any" min="0" inputmode="decimal"' : '';
    input = `<input id="${id}" type="${o.type || 'text'}" data-path="${path}" value="${esc(v ?? '')}" placeholder="${esc(o.ph || '')}" ${numAttrs} ${o.type === 'email' ? 'autocomplete="off"' : ''}>`;
  }
  return `<div class="${cls}" ${style}>
    <label for="${id}" class="${o.hideLabel ? 'sr-only' : ''}">${esc(label)}${o.req ? '<span class="req" aria-hidden="true">*</span>' : ''}</label>
    ${input}${o.help ? `<small class="help">${o.help}</small>` : ''}</div>`;
}

/** Collapsible editor card that remembers whether it's open. */
function card(id, title, body, { open = true, hint = '' } = {}) {
  const isOpen = state.cards[id] ?? open;
  return `<details class="card" data-card="${id}" ${isOpen ? 'open' : ''}>
    <summary><span class="card-title">${esc(title)}</span>${hint ? `<span class="card-hint">${hint}</span>` : ''}${icon('chevron', 'card-chev')}</summary>
    <div class="card-body">${body}</div></details>`;
}

function imgSlot(label, path, span = 6) {
  const v = getVal(path);
  return `<div class="field img-slot" style="--s:${span}">
    <label>${esc(label)}</label>
    <div class="img-box">
      <div class="img-thumb">${v ? `<img src="${v}" alt="${esc(label)}">` : icon('image')}</div>
      <div class="img-btns">
        <button type="button" class="btn btn-sm" data-action="upload" data-target="${path}">${icon('upload')}${v ? 'Replace' : 'Upload'}</button>
        ${v ? `<button type="button" class="btn btn-sm btn-quiet" data-action="remove-img" data-target="${path}">Remove</button>` : ''}
      </div>
    </div></div>`;
}

/** Minimal rich-text editor (contenteditable + execCommand). */
function richText(path, ph = '') {
  const tools = [
    ['bold', '<b>B</b>', 'Bold'], ['italic', '<i>I</i>', 'Italic'], ['underline', '<u>U</u>', 'Underline'],
    ['h3', 'H', 'Heading'], ['p', '¶', 'Paragraph'], ['ul', icon('ul'), 'Bullet list'], ['ol', icon('ol'), 'Numbered list'],
    ['clear', icon('erase'), 'Clear formatting'],
  ];
  return `<div class="rte">
    <div class="rte-bar" role="toolbar">${tools.map(([c, l, t]) => `<button type="button" data-cmd="${c}" title="${t}" aria-label="${t}">${l}</button>`).join('')}</div>
    <div class="rte-body" contenteditable="true" data-rte="${path}" data-ph="${esc(ph)}">${richBlocks(getVal(path)).map((b) => b.outerHTML).join('')}</div>
  </div>`;
}

/* ---------------------------------------------------------------------
   11. Repeaters (dynamic rows)
   --------------------------------------------------------------------- */
/** Column config for every dynamic list. */
function repConfig(list) {
  const q = state.mode === 'quotation';
  const cfg = {
    scope: {
      add: 'Add scope item', empty: 'No scope items yet.',
      blank: () => ({ title: '', desc: '', qty: '1', time: '' }),
      cols: [{ k: 'title', l: 'Scope / deliverable', s: 5 }, { k: 'desc', l: 'Description', s: 7 },
        { k: 'qty', l: 'Qty', s: 3, t: 'number' }, { k: 'time', l: 'Estimated time', s: 4, ph: '5 days' }],
    },
    deliverables: {
      add: 'Add deliverable', empty: 'No deliverables yet.', blank: () => ({ text: '' }),
      cols: [{ k: 'text', l: 'Deliverable', s: 12, hide: true, ph: 'e.g. Complete source code' }],
    },
    features: {
      add: 'Add feature', empty: 'No features yet.',
      blank: () => ({ name: '', included: 'Yes', status: 'Included', notes: '' }),
      cols: [{ k: 'name', l: 'Feature', s: 6 }, { k: 'included', l: 'Included', s: 3, t: 'select', o: ['Yes', 'No'] },
        { k: 'status', l: 'Status', s: 3, t: 'select', o: FEATURE_STATUS }, { k: 'notes', l: 'Notes', s: 12 }],
    },
    tech: {
      add: 'Add technology', empty: 'No technologies yet.', blank: () => ({ name: '', purpose: '' }),
      cols: [{ k: 'name', l: 'Technology', s: 5 }, { k: 'purpose', l: 'Purpose', s: 7 }],
    },
    timeline: {
      add: 'Add phase', empty: 'No phases yet.', blank: () => ({ phase: '', desc: '', duration: '' }),
      cols: [{ k: 'phase', l: 'Phase', s: 4 }, { k: 'desc', l: 'Description', s: 5 }, { k: 'duration', l: 'Duration', s: 3, ph: '5 days' }],
    },
    items: {
      add: 'Add item', empty: 'No items yet.', blank: () => blankItem(q),
      cols: [
        { k: 'name', l: 'Item', s: 6 }, { k: 'detail', l: 'Description', s: 6 },
        { k: 'qty', l: 'Qty', s: 2, t: 'number' },
        ...(q ? [{ k: 'unit', l: 'Unit', s: 2 }] : []),
        { k: 'price', l: 'Unit price', s: q ? 2 : 3, t: 'number' },
        { k: 'discount', l: 'Disc. %', s: 2, t: 'number' },
        { k: 'tax', l: 'Tax %', s: 2, t: 'number' },
        { calc: 'line', l: 'Amount', s: q ? 2 : 3 },
      ],
    },
    milestones: {
      add: 'Add milestone', empty: 'No milestones yet.', blank: () => ({ name: '', pct: '', due: '' }),
      cols: [{ k: 'name', l: 'Milestone', s: 4 }, { k: 'pct', l: 'Percent', s: 2, t: 'number' },
        { calc: 'ms', l: 'Amount', s: 3 }, { k: 'due', l: 'Due', s: 3 }],
    },
    assumptions: {
      add: 'Add assumption', empty: 'No assumptions yet.', blank: () => ({ text: '' }),
      cols: [{ k: 'text', l: 'Assumption', s: 12, hide: true }],
    },
  };
  return cfg[list];
}

function repeaterHTML(list) {
  const cfg = repConfig(list);
  const rows = currentDoc()[list] || [];
  const btn = (act, ic, label, i, disabled) =>
    `<button type="button" class="icon-btn" data-action="${act}" data-list="${list}" data-i="${i}" aria-label="${label}" title="${label}" ${disabled ? 'disabled' : ''}>${icon(ic)}</button>`;
  const body = rows.map((r, i) => `
    <div class="rep-row">
      <span class="rep-idx">${i + 1}</span>
      <div class="rep-fields">${cfg.cols.map((c) => c.calc
        ? `<div class="field calc ${c.s <= 3 ? 'sm' : ''}" style="--s:${c.s}"><label>${c.l}</label><output data-calc="${c.calc}-${i}">—</output></div>`
        : fld(c.l, `doc.${list}.${i}.${c.k}`, { type: c.t, options: c.o, ph: c.ph, span: c.s, hideLabel: c.hide })).join('')}
      </div>
      <div class="rep-actions">
        ${btn('row-up', 'up', 'Move up', i, i === 0)}
        ${btn('row-down', 'down', 'Move down', i, i === rows.length - 1)}
        ${btn('row-del', 'trash', 'Delete row', i)}
      </div>
    </div>`).join('');
  return `<div class="rep" data-rep="${list}">
    ${rows.length ? body : `<p class="rep-empty">${cfg.empty}</p>`}
    <button type="button" class="btn btn-add" data-action="add-row" data-list="${list}">${icon('plus')}${cfg.add}</button>
  </div>`;
}
function rerenderRepeater(list) {
  const el = $(`[data-rep="${list}"]`);
  if (el) el.outerHTML = repeaterHTML(list);
  updateComputed();
}

/* ---------------------------------------------------------------------
   12. Editor screens
   --------------------------------------------------------------------- */
const currencyOptions = () => Object.entries(CURRENCIES).map(([k, c]) => [k, c.label]);
const sectionOff = (key) => { const s = currentDoc().sections.find((x) => x.key === key); return s && !s.on; };
const hiddenHint = (key) => (sectionOff(key) ? '<span class="pill pill-muted">Hidden in document</span>' : '');

function businessFields() {
  return `<div class="grid">
    ${fld('Business / freelancer name', 'business.name', { span: 12, req: true })}
    ${imgSlot('Logo', 'business.logo')}
    ${imgSlot('Signature', 'business.signature')}
    ${fld('Address', 'business.address', { span: 12 })}
    ${fld('City', 'business.city', { span: 4 })}
    ${fld('State', 'business.state', { span: 4 })}
    ${fld('PIN / ZIP', 'business.pin', { span: 4 })}
    ${fld('Country', 'business.country', { span: 6 })}
    ${fld('Email', 'business.email', { type: 'email', span: 6 })}
    ${fld('Phone', 'business.phone', { type: 'tel', span: 6 })}
    ${fld('WhatsApp', 'business.whatsapp', { type: 'tel', span: 6 })}
    ${fld('Website', 'business.website', { span: 12 })}
    ${fld('GST number', 'business.gst', { span: 6 })}
    ${fld('PAN number', 'business.pan', { span: 6 })}
  </div><p class="note">Saved in this browser and reused on every document.</p>`;
}

function clientFields() {
  return `<div class="grid">
    ${fld('Client name', 'doc.client.name', { req: true, span: 6 })}
    ${fld('Company name', 'doc.client.company', { span: 6 })}
    ${fld('Email', 'doc.client.email', { type: 'email', span: 6 })}
    ${fld('Phone', 'doc.client.phone', { type: 'tel', span: 6 })}
    ${fld('WhatsApp', 'doc.client.whatsapp', { type: 'tel', span: 6 })}
    ${fld('GST number', 'doc.client.gst', { span: 6 })}
    ${fld('Address', 'doc.client.address', { span: 12 })}
    ${fld('City', 'doc.client.city', { span: 4 })}
    ${fld('State', 'doc.client.state', { span: 4 })}
    ${fld('PIN / ZIP', 'doc.client.pin', { span: 4 })}
    ${fld('Country', 'doc.client.country', { span: 6 })}
  </div>`;
}

function designBody(withSections = true) {
  const tpl = state.settings.template;
  const picker = `<div class="tpl-picker" role="radiogroup" aria-label="Template">${Object.entries(TEMPLATES).map(([k, n]) => `
    <button type="button" class="tpl-opt ${tpl === k ? 'active' : ''}" data-action="template" data-tpl="${k}" role="radio" aria-checked="${tpl === k}">
      <span class="tpl-thumb tpl-thumb-${k}"><i></i><b></b><b></b><b></b></span><span>${n}</span></button>`).join('')}</div>`;
  const colors = `<div class="grid">
    ${fld('Primary colour', 'settings.primary', { type: 'color', span: 6 })}
    ${fld('Secondary colour', 'settings.secondary', { type: 'color', span: 6 })}
  </div>
  <div class="row-between"><p class="note">Minimal is black and white; colours apply to Modern and Corporate.</p>
  <button type="button" class="btn btn-sm btn-quiet" data-action="reset-colors">Reset colours</button></div>`;
  if (!withSections) return picker + colors;
  const d = currentDoc();
  const labels = d.type === 'invoice' ? INVOICE_SECTIONS : QUOTE_SECTIONS;
  const list = `<h4 class="sub">Sections</h4>
    <p class="note">Untick to leave a section out of the document. Use the arrows to reorder.</p>
    <ul class="sec-list">${d.sections.map((s, i) => `
      <li><label class="check"><input type="checkbox" data-path="doc.sections.${i}.on" ${s.on ? 'checked' : ''}><span>${esc(labels[s.key])}</span></label>
      <span class="sec-move">
        <button type="button" class="icon-btn" data-action="sec-up" data-i="${i}" aria-label="Move ${esc(labels[s.key])} up" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
        <button type="button" class="icon-btn" data-action="sec-down" data-i="${i}" aria-label="Move ${esc(labels[s.key])} down" ${i === d.sections.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
      </span></li>`).join('')}</ul>`;
  return picker + colors + list;
}

function pricingBody() {
  const inv = state.mode === 'invoice';
  return `${repeaterHTML('items')}
    <div class="grid pricing-opts">
      ${fld('Discount type', 'doc.discount.type', { type: 'select', options: [['percent', 'Percentage (%)'], ['fixed', 'Fixed amount']], span: 4 })}
      ${fld('Discount', 'doc.discount.value', { type: 'number', span: 4 })}
      ${fld('Tax label', 'doc.taxLabel', { type: 'select', options: ['GST', 'IGST', 'VAT', 'Tax'], span: 4 })}
      ${fld('Split GST into CGST + SGST (intra-state supply)', 'doc.splitGst', { type: 'checkbox', span: 12 })}
      ${inv ? fld('Amount paid', 'doc.amountPaid', { type: 'number', span: 6 }) : ''}
    </div>
    <div class="totals-box" data-calc="totals"></div>`;
}

function paymentBody() {
  const d = currentDoc();
  const presets = [['100', '100% upfront'], ['50-50', '50 / 50'], ['40-30-30', '40 / 30 / 30'], ['custom', 'Custom']];
  return `<div class="seg" role="group" aria-label="Payment plan">${presets.map(([k, l]) =>
      `<button type="button" class="${d.paymentPreset === k ? 'active' : ''}" data-action="preset" data-preset="${k}">${l}</button>`).join('')}</div>
    ${repeaterHTML('milestones')}
    <div data-calc="ms-sum" class="ms-sum"></div>
    <div class="grid">${fld('Payment note', 'doc.paymentNote', { type: 'textarea', span: 12, rows: 2, ph: 'e.g. Payments accepted by bank transfer or UPI.' })}</div>`;
}

function quoteEditor() {
  const d = currentDoc();
  return [
    card('design', 'Design & sections', designBody(), { open: false }),
    card('doc', 'Quotation details', `<div class="grid">
      ${fld('Quotation number', 'doc.number', { req: true, span: 6 })}
      ${fld('Currency', 'doc.currency', { type: 'select', options: currencyOptions(), span: 6 })}
      ${fld('Quotation date', 'doc.date', { type: 'date', span: 6, req: true })}
      ${fld('Valid until', 'doc.validUntil', { type: 'date', span: 6 })}
      ${fld('Project name', 'doc.projectName', { span: 12, ph: 'e.g. Company website redesign' })}
      ${fld('Prepared by', 'doc.preparedBy', { span: 12 })}</div>`),
    card('business', 'Your business', businessFields(), { open: false, hint: esc(state.business.name) }),
    card('client', 'Client', clientFields(), { hint: hiddenHint('preparedFor') }),
    card('description', 'Project description', richText('doc.description', 'Describe the project, goals and context…'), { hint: hiddenHint('description') }),
    card('scope', 'Scope of work', repeaterHTML('scope'), { hint: hiddenHint('scope') }),
    card('deliverables', 'Deliverables', repeaterHTML('deliverables'), { hint: hiddenHint('deliverables') }),
    card('features', 'Feature completeness', repeaterHTML('features'), { hint: hiddenHint('features') }),
    card('tech', 'Technology stack', repeaterHTML('tech'), { hint: hiddenHint('tech') }),
    card('timeline', 'Project timeline', repeaterHTML('timeline'), { hint: hiddenHint('timeline') }),
    card('pricing', 'Pricing', pricingBody(), { hint: hiddenHint('pricing') }),
    card('payment', 'Payment terms', paymentBody(), { hint: hiddenHint('payment') }),
    card('assumptions', 'Assumptions', repeaterHTML('assumptions'), { hint: hiddenHint('assumptions') }),
    card('maintenance', 'Maintenance & support', `<div class="grid">
      ${fld('Support period', 'doc.maintenance.period', { span: 12 })}
      ${fld('Included services', 'doc.maintenance.services', { type: 'textarea', rows: 2, span: 12 })}
      ${fld('Additional work rate', 'doc.maintenance.rate', { span: 6 })}
      ${fld('Response time', 'doc.maintenance.response', { span: 6 })}</div>`, { hint: hiddenHint('maintenance') }),
    card('terms', 'Terms & conditions', richText('doc.terms'), { hint: hiddenHint('terms') }),
    card('acceptance', 'Acceptance', `<div class="grid">
      ${fld('Acceptance statement', 'doc.acceptance.text', { type: 'textarea', rows: 3, span: 12 })}
      ${fld('Authorized person (client side)', 'doc.acceptance.authorized', { span: 12, ph: 'Name and designation' })}
      ${imgSlot('Client signature (optional)', 'doc.acceptance.clientSignature')}
      ${imgSlot('Your signature', 'business.signature')}</div>`, { hint: hiddenHint('acceptance') }),
  ].join('') + `<p class="editor-end">${esc(d.number)} is saved to this browser automatically while you work. Choose <b>Save draft</b> to add it to Saved documents.</p>`;
}

function invoiceEditor() {
  const d = currentDoc();
  return [
    card('design', 'Design & sections', designBody(), { open: false }),
    card('doc', 'Invoice details', `<div class="grid">
      ${fld('Invoice number', 'doc.number', { req: true, span: 6 })}
      ${fld('Status', 'doc.status', { type: 'select', options: STATUSES, span: 6 })}
      ${fld('Invoice date', 'doc.date', { type: 'date', span: 6, req: true })}
      ${fld('Due date', 'doc.dueDate', { type: 'date', span: 6 })}
      ${fld('Currency', 'doc.currency', { type: 'select', options: currencyOptions(), span: 6 })}
      ${fld('Related quotation no.', 'doc.relatedQuote', { span: 6, ph: 'QT-2026-001' })}
      ${fld('Project', 'doc.projectName', { span: 12 })}</div>`),
    card('business', 'Your business', businessFields(), { open: false, hint: esc(state.business.name) }),
    card('client', 'Client', clientFields()),
    card('pricing', 'Invoice items', pricingBody(), { hint: hiddenHint('items') }),
    card('paymentinfo', 'Payment information', `<div class="grid">
      ${fld('Payment method', 'doc.paymentMethod', { type: 'select', options: PAY_METHODS, span: 6 })}
      ${fld('Show payment details on invoice', 'doc.showPayment', { type: 'checkbox', span: 6, cls: 'check-inline' })}
      ${fld('Bank name', 'business.bankName', { span: 6 })}
      ${fld('Account name', 'business.accountName', { span: 6 })}
      ${fld('Account number', 'business.accountNumber', { span: 6 })}
      ${fld('IFSC', 'business.ifsc', { span: 6 })}
      ${fld('UPI ID', 'business.upi', { span: 6 })}
      ${fld('Payment link', 'business.paymentLink', { span: 6, ph: 'https://rzp.io/l/…' })}
    </div><p class="note">Bank and UPI details are saved with your business profile.</p>`, { hint: hiddenHint('payment') }),
    card('notes', 'Notes', `<div class="grid">${fld('Notes', 'doc.notes', { type: 'textarea', rows: 3, span: 12, hideLabel: true })}</div>`, { hint: hiddenHint('notes') }),
    card('terms', 'Terms & conditions', richText('doc.terms'), { hint: hiddenHint('terms') }),
    card('signature', 'Signature', `<div class="grid">
      ${imgSlot('Your signature', 'business.signature')}
      ${fld('Signed by', 'doc.signedBy', { span: 6, ph: state.business.name || 'Your name' })}</div>`, { hint: hiddenHint('signature') }),
  ].join('') + `<p class="editor-end">${esc(d.number)} is saved to this browser automatically while you work. Choose <b>Save draft</b> to add it to Saved documents.</p>`;
}

function renderEditor() {
  const ed = $('#editor');
  const top = ed.scrollTop;
  ed.innerHTML = state.mode === 'quotation' ? quoteEditor() : invoiceEditor();
  ed.scrollTop = top;
  updateToolbar();
  updateComputed();
}

/** Refresh calculated outputs in the editor without re-rendering inputs. */
function updateComputed() {
  const d = currentDoc();
  if (!d) return;
  const T = calcDoc(d);
  const cur = d.currency;
  T.lines.forEach((l, i) => { const o = $(`[data-calc="line-${i}"]`); if (o) o.textContent = money(l.net, cur); });
  (d.milestones || []).forEach((m, i) => {
    const o = $(`[data-calc="ms-${i}"]`); if (o) o.textContent = money(T.grand * num(m.pct) / 100, cur);
  });
  const box = $('[data-calc="totals"]');
  if (box) {
    const rows = [['Subtotal', money(T.subtotal, cur)]];
    if (T.discountTotal > 0) rows.push(['Discount', '−' + money(T.discountTotal, cur)]);
    rows.push(['Taxable amount', money(T.taxable, cur)], [taxLabel(d, T), money(T.tax, cur)], ['Grand total', money(T.grand, cur)]);
    if (d.type === 'invoice') rows.push(['Amount paid', money(T.paid, cur)], ['Balance due', money(T.balance, cur)]);
    box.innerHTML = rows.map(([k, v]) => `<div class="${/Grand|Balance/.test(k) ? 'strong' : ''}"><span>${k}</span><span>${v}</span></div>`).join('');
  }
  const ms = $('[data-calc="ms-sum"]');
  if (ms) {
    const sum = round2((d.milestones || []).reduce((a, m) => a + num(m.pct), 0));
    ms.className = 'ms-sum ' + (sum === 100 ? 'ok' : 'warn');
    ms.innerHTML = sum === 100
      ? `${icon('check')}Milestones add up to 100%`
      : `${icon('alert')}Milestones add up to ${sum}%. They should total 100%.`;
  }
  const tot = $('#tb-total');
  if (tot) tot.textContent = money(d.type === 'invoice' ? T.balance : T.grand, cur) + (d.type === 'invoice' ? ' due' : '');
}

function updateToolbar() {
  const d = currentDoc();
  $('#tb-kind').textContent = d.type === 'quotation' ? 'Quotation' : 'Invoice';
  $('#tb-number').textContent = d.number || 'No number';
  $('#tb-dirty').hidden = !state.dirty[d.type];
  $('#btn-convert').hidden = d.type !== 'quotation';
  $('#preview-template').value = state.settings.template;
}

/* ---------------------------------------------------------------------
   13. Rich text sanitising
   --------------------------------------------------------------------- */
const RT_ALLOWED = new Set(['p', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'em', 'u', 'br', 'blockquote']);
const RT_BLOCK = new Set(['p', 'h3', 'h4', 'ul', 'ol', 'blockquote']);
const RT_MAP = { b: 'strong', i: 'em', h1: 'h3', h2: 'h3', h5: 'h4', h6: 'h4', div: 'p', section: 'p', article: 'p' };

function cleanNodes(src) {
  const frag = document.createDocumentFragment();
  src.childNodes.forEach((n) => {
    if (n.nodeType === 3) { frag.appendChild(document.createTextNode(n.textContent)); return; }
    if (n.nodeType !== 1) return;
    let tag = n.tagName.toLowerCase();
    if (['script', 'style', 'iframe', 'object', 'img', 'svg'].includes(tag)) return;
    // Containers wrapping other blocks are unwrapped rather than nested
    if ((tag === 'div' || tag === 'p') && n.querySelector('p,div,ul,ol,h1,h2,h3,h4,blockquote')) {
      frag.appendChild(cleanNodes(n)); return;
    }
    tag = RT_MAP[tag] || tag;
    if (!RT_ALLOWED.has(tag)) { frag.appendChild(cleanNodes(n)); return; }
    const el = document.createElement(tag);
    el.appendChild(cleanNodes(n));
    frag.appendChild(el);
  });
  return frag;
}
/** Returns an array of clean top-level block elements. */
function richBlocks(html) {
  const t = document.createElement('template');
  t.innerHTML = html || '';
  const frag = cleanNodes(t.content);
  const out = [];
  let p = null;
  [...frag.childNodes].forEach((n) => {
    const isBlock = n.nodeType === 1 && RT_BLOCK.has(n.tagName.toLowerCase());
    if (isBlock) { p = null; out.push(n); return; }
    if (n.nodeType === 1 && n.tagName === 'LI') { const ul = document.createElement('ul'); ul.appendChild(n); out.push(ul); p = null; return; }
    if (!p) { p = document.createElement('p'); out.push(p); }
    p.appendChild(n);
  });
  return out.filter((el) => el.textContent.trim() !== '');
}

/* ---------------------------------------------------------------------
   14. Document rendering → content "units"
   Each unit is either a block of HTML or a table whose rows can be split
   across pages. The paginator lays units onto A4 pages.
   --------------------------------------------------------------------- */
const H = (html, kwn = false) => ({ type: 'html', html, kwn });            // kwn = keep with next
const TABLE = (o) => ({ type: 'table', ...o });

function taxLabel(d, T) {
  const r = T.uniformRate;
  const base = d.taxLabel || 'Tax';
  return r !== null && r !== undefined ? `${base} (${fmtPct(r)})` : base;
}

function richUnits(html) {
  const units = [];
  richBlocks(html).forEach((b) => {
    const tag = b.tagName.toLowerCase();
    if (tag === 'ul' || tag === 'ol') {
      const lis = [...b.children].filter((c) => c.tagName === 'LI');
      lis.forEach((li, i) => {
        const end = i === lis.length - 1 ? ' rt-end' : '';
        units.push(H(`<div class="rt rt-li${end}"><${tag} class="split"${tag === 'ol' ? ` start="${i + 1}"` : ''}>${li.outerHTML}</${tag}></div>`));
      });
    } else {
      units.push(H(`<div class="rt">${b.outerHTML}</div>`, tag === 'h3' || tag === 'h4'));
    }
  });
  return units;
}

const addrLines = (o, withCountry = true) => {
  const cityLine = [o.city, o.state].filter(Boolean).join(', ') + (o.pin ? ' ' + o.pin : '');
  return [o.address, cityLine.trim(), withCountry ? o.country : ''].filter((x) => x && x.trim());
};

function partyBlock(label, name, sub, lines) {
  return `<div class="party">
    <div class="party-lab">${esc(label)}</div>
    <div class="party-name">${esc(name || '—')}</div>
    ${sub ? `<div class="party-sub">${esc(sub)}</div>` : ''}
    <div class="party-lines">${lines.filter(Boolean).map((l) => `<div>${l}</div>`).join('')}</div>
  </div>`;
}
const clientLines = (c) => [
  ...addrLines(c).map(esc),
  c.gst ? `GSTIN: ${esc(c.gst)}` : '',
  c.email ? esc(c.email) : '',
  c.phone ? esc(c.phone) : '',
];

function totalsBlock(d, T) {
  const cur = d.currency;
  const rows = [['Subtotal', money(T.subtotal, cur)]];
  if (T.discountTotal > 0) {
    const onlyOverallPct = T.lineDiscount === 0 && d.discount.type === 'percent';
    rows.push([onlyOverallPct ? `Discount (${fmtPct(d.discount.value)})` : 'Discount', '−' + money(T.discountTotal, cur)]);
  }
  rows.push(['Taxable amount', money(T.taxable, cur)]);
  if (T.tax > 0 || T.lines.some((l) => l.rate > 0)) {
    if (d.splitGst) {
      const half = T.uniformRate !== null ? fmtPct(T.uniformRate / 2) : '';
      rows.push([`CGST${half ? ` (${half})` : ''}`, money(T.tax / 2, cur)], [`SGST${half ? ` (${half})` : ''}`, money(T.tax / 2, cur)]);
    } else {
      rows.push([taxLabel(d, T), money(T.tax, cur)]);
    }
  }
  let html = rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('');
  html += `<tr class="grand"><td>Grand total</td><td>${money(T.grand, cur)}</td></tr>`;
  if (d.type === 'invoice') {
    html += `<tr class="paid"><td>Amount paid</td><td>${money(T.paid, cur)}</td></tr>`;
    html += `<tr class="balance"><td>Balance due</td><td>${money(T.balance, cur)}</td></tr>`;
  }
  const words = d.type === 'invoice' && T.paid > 0 ? T.balance : T.grand;
  const stamp = d.type === 'invoice' && ['Paid', 'Cancelled', 'Overdue'].includes(d.status)
    ? `<div class="stamp stamp-${d.status.toLowerCase()}">${esc(d.status)}</div>` : '';
  return H(`<div class="totals-wrap">
    <div class="words">${stamp}<div class="words-lab">${d.type === 'invoice' && T.paid > 0 ? 'Balance due in words' : 'Amount in words'}</div>
      <div class="words-val">${esc(amountInWords(words, cur))}</div></div>
    <table class="totals">${html}</table></div>`);
}

function itemsTable(d, T, title) {
  const q = d.type === 'quotation';
  const cur = d.currency;
  const rows = d.items.map((it, i) => ({ it, l: T.lines[i], i }))
    .filter(({ it }) => (it.name || it.detail || num(it.price)))
    .map(({ it, l }, n) => `<tr>
      <td class="c-num">${n + 1}</td>
      <td><div class="it-name">${esc(it.name || '—')}</div>${it.detail ? `<div class="it-desc">${nl2br(it.detail)}</div>` : ''}</td>
      <td class="r">${fmtQty(it.qty)}</td>
      ${q ? `<td>${esc(it.unit || '')}</td>` : ''}
      <td class="r">${money(num(it.price), cur)}</td>
      <td class="r">${num(it.discount) ? fmtPct(it.discount) : '—'}</td>
      <td class="r">${fmtPct(it.tax)}</td>
      <td class="r strong">${money(l.net, cur)}</td></tr>`);
  if (!rows.length) return [];
  const colgroup = q
    ? '<colgroup><col style="width:5%"><col><col style="width:7%"><col style="width:10%"><col style="width:14%"><col style="width:8%"><col style="width:7%"><col style="width:15%"></colgroup>'
    : '<colgroup><col style="width:5%"><col><col style="width:7%"><col style="width:15%"><col style="width:8%"><col style="width:7%"><col style="width:16%"></colgroup>';
  const head = `<tr><th class="c-num">#</th><th>${q ? 'Item / description' : 'Description'}</th><th class="r">Qty</th>${q ? '<th>Unit</th>' : ''}<th class="r">Unit price</th><th class="r">Disc.</th><th class="r">Tax</th><th class="r">Amount</th></tr>`;
  return [TABLE({ cls: 'items', colgroup, head, rows, title }), totalsBlock(d, T)];
}

/** Quotation section renderers — each returns an array of units. */
const QUOTE_RENDER = {
  preparedFor(d) {
    const b = state.business;
    const by = [b.email && esc(b.email), b.phone && esc(b.phone), b.website && esc(b.website)];
    return [H(`<div class="parties">
      ${partyBlock('Prepared for', d.client.name, d.client.company, clientLines(d.client))}
      ${partyBlock('Prepared by', d.preparedBy || b.name, d.preparedBy && d.preparedBy !== b.name ? b.name : '', by)}
    </div>`)];
  },
  description: (d) => richUnits(d.description),
  scope(d) {
    const rows = d.scope.filter((r) => r.title || r.desc).map((r, i) =>
      `<tr><td class="c-num">${i + 1}</td><td class="strong">${esc(r.title)}</td><td>${nl2br(r.desc)}</td><td class="r">${esc(fmtQty(r.qty || 1))}</td><td class="r nowrap">${esc(r.time)}</td></tr>`);
    if (!rows.length) return [];
    return [TABLE({
      title: 'Scope of work',
      colgroup: '<colgroup><col style="width:5%"><col style="width:28%"><col><col style="width:7%"><col style="width:14%"></colgroup>',
      head: '<tr><th class="c-num">#</th><th>Scope / deliverable</th><th>Description</th><th class="r">Qty</th><th class="r">Est. time</th></tr>',
      rows,
    })];
  },
  deliverables(d) {
    const items = d.deliverables.filter((x) => x.text && x.text.trim());
    return items.map((x, i) => H(`<div class="tick-row${i === items.length - 1 ? ' last' : ''}"><span class="tick">${icon('check')}</span><span>${esc(x.text)}</span></div>`));
  },
  features(d) {
    const rows = d.features.filter((f) => f.name);
    if (!rows.length) return [];
    const inc = rows.filter((f) => f.included === 'Yes').length;
    const pct = Math.round((inc / rows.length) * 100);
    const statusCls = (s) => 'st-' + String(s || '').toLowerCase().replace(/\s+/g, '-');
    return [
      H(`<div class="feat-sum"><div class="feat-bar"><i style="width:${pct}%"></i></div>
        <p><strong>${inc} of ${rows.length}</strong> listed features are included in this quotation (${pct}%).</p></div>`),
      TABLE({
        title: 'Feature completeness',
        colgroup: '<colgroup><col style="width:30%"><col style="width:12%"><col style="width:16%"><col></colgroup>',
        head: '<tr><th>Feature</th><th>Included</th><th>Status</th><th>Notes</th></tr>',
        rows: rows.map((f) => `<tr><td class="strong">${esc(f.name)}</td>
          <td><span class="yn ${f.included === 'Yes' ? 'yes' : 'no'}">${f.included === 'Yes' ? 'Yes' : 'No'}</span></td>
          <td><span class="chip ${statusCls(f.status)}">${esc(f.status)}</span></td><td>${esc(f.notes)}</td></tr>`),
      }),
    ];
  },
  tech(d) {
    const rows = d.tech.filter((t) => t.name);
    if (!rows.length) return [];
    return [TABLE({
      title: 'Technology stack', cls: 'tech',
      colgroup: '<colgroup><col style="width:36%"><col></colgroup>',
      head: '<tr><th>Technology</th><th>Purpose</th></tr>',
      rows: rows.map((t) => `<tr><td class="strong">${esc(t.name)}</td><td>${esc(t.purpose)}</td></tr>`),
    })];
  },
  timeline(d) {
    const rows = d.timeline.filter((t) => t.phase || t.desc);
    if (!rows.length) return [];
    const days = timelineDays(rows);
    const body = rows.map((t, i) => `<tr><td class="c-num"><span class="phase-dot">${i + 1}</span></td><td class="strong">${esc(t.phase)}</td><td>${esc(t.desc)}</td><td class="r nowrap">${esc(t.duration)}</td></tr>`);
    if (days) body.push(`<tr class="sum-row"><td></td><td colspan="2">Total estimated duration</td><td class="r nowrap">${days} days</td></tr>`);
    return [TABLE({
      title: 'Project timeline', cls: 'timeline',
      colgroup: '<colgroup><col style="width:7%"><col style="width:24%"><col><col style="width:16%"></colgroup>',
      head: '<tr><th class="c-num">Step</th><th>Phase</th><th>Description</th><th class="r">Duration</th></tr>',
      rows: body,
    })];
  },
  pricing: (d, T) => itemsTable(d, T, 'Project quotation'),
  payment(d, T) {
    const ms = d.milestones.filter((m) => m.name || num(m.pct));
    if (!ms.length) return [];
    const total = ms.reduce((a, m) => a + num(m.pct), 0);
    const rows = ms.map((m, i) => `<tr><td class="c-num">${i + 1}</td><td class="strong">${esc(m.name)}</td><td class="r">${fmtPct(m.pct)}</td><td class="r">${money(T.grand * num(m.pct) / 100, d.currency)}</td><td>${esc(m.due)}</td></tr>`);
    rows.push(`<tr class="sum-row"><td></td><td>Total</td><td class="r">${fmtPct(total)}</td><td class="r">${money(T.grand * total / 100, d.currency)}</td><td></td></tr>`);
    const units = [TABLE({
      title: 'Payment terms',
      colgroup: '<colgroup><col style="width:6%"><col style="width:30%"><col style="width:12%"><col style="width:20%"><col></colgroup>',
      head: '<tr><th class="c-num">#</th><th>Milestone</th><th class="r">Share</th><th class="r">Amount</th><th>Due</th></tr>',
      rows,
    })];
    if (d.paymentNote) units.push(H(`<p class="after-note">${nl2br(d.paymentNote)}</p>`));
    return units;
  },
  assumptions(d) {
    const items = d.assumptions.filter((a) => a.text && a.text.trim());
    return items.map((a, i) => H(`<div class="rt rt-li${i === items.length - 1 ? ' rt-end' : ''}"><ul class="split"><li>${esc(a.text)}</li></ul></div>`));
  },
  maintenance(d) {
    const m = d.maintenance;
    const rows = [['Support period', m.period], ['Included services', m.services], ['Additional work', m.rate], ['Response time', m.response]].filter(([, v]) => v);
    if (!rows.length) return [];
    return [H(`<dl class="kv">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${nl2br(v)}</dd></div>`).join('')}</dl>`)];
  },
  terms: (d) => richUnits(d.terms),
  acceptance(d) {
    const b = state.business;
    return [H(`<div class="accept">
      <p class="accept-text">${nl2br(d.acceptance.text)}</p>
      <div class="sign-grid">
        <div class="sign-box">
          <div class="sign-lab">Accepted by client</div>
          <div class="sign-area">${d.acceptance.clientSignature ? `<img src="${d.acceptance.clientSignature}" alt="">` : ''}</div>
          <dl class="sign-meta">
            <div><dt>Client name</dt><dd>${esc(d.client.name) || '&nbsp;'}</dd></div>
            <div><dt>Authorized person</dt><dd>${esc(d.acceptance.authorized) || '&nbsp;'}</dd></div>
            <div><dt>Signature</dt><dd>&nbsp;</dd></div>
            <div><dt>Date</dt><dd>&nbsp;</dd></div>
          </dl>
        </div>
        <div class="sign-box">
          <div class="sign-lab">For ${esc(b.name || 'the business')}</div>
          <div class="sign-area">${b.signature ? `<img src="${b.signature}" alt="">` : ''}</div>
          <dl class="sign-meta">
            <div><dt>Name</dt><dd>${esc(d.preparedBy || b.name) || '&nbsp;'}</dd></div>
            <div><dt>Role</dt><dd>Authorized signatory</dd></div>
            <div><dt>Signature</dt><dd>&nbsp;</dd></div>
            <div><dt>Date</dt><dd>${fmtDate(d.date) || '&nbsp;'}</dd></div>
          </dl>
        </div>
      </div></div>`)];
  },
};

/** Invoice section renderers. */
const INVOICE_RENDER = {
  parties(d, T) {
    const cur = d.currency;
    const meta = [
      d.projectName && ['Project', esc(d.projectName)],
      d.relatedQuote && ['Quotation ref.', esc(d.relatedQuote)],
      ['Payment method', esc(d.paymentMethod)],
    ].filter(Boolean);
    return [H(`<div class="parties">
      ${partyBlock('Billed to', d.client.name, d.client.company, clientLines(d.client))}
      <div class="party due-box">
        <div class="party-lab">${T.balance <= 0 && T.grand > 0 ? 'Paid in full' : 'Balance due'}</div>
        <div class="due-amt">${money(Math.max(0, T.balance), cur)}</div>
        ${d.dueDate && T.balance > 0 ? `<div class="due-by">Due by ${fmtDate(d.dueDate)}</div>` : ''}
        <dl class="mini-kv">${meta.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      </div></div>`)];
  },
  items: (d, T) => itemsTable(d, T, 'Invoice items'),
  payment(d) {
    if (!d.showPayment) return [];
    const b = state.business;
    const rows = [['Bank', b.bankName], ['Account name', b.accountName], ['Account number', b.accountNumber], ['IFSC', b.ifsc], ['UPI ID', b.upi]].filter(([, v]) => v);
    if (!rows.length && !b.paymentLink) return [];
    return [H(`<div class="pay-grid">
      <dl class="kv kv-compact">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      ${b.paymentLink ? `<div class="pay-link"><div class="party-lab">Pay online</div><div class="pay-url">${esc(b.paymentLink)}</div></div>` : ''}
    </div>`)];
  },
  notes: (d) => (d.notes && d.notes.trim() ? [H(`<p class="notes">${nl2br(d.notes)}</p>`)] : []),
  terms: (d) => richUnits(d.terms),
  signature(d) {
    const b = state.business;
    return [H(`<div class="sign-single">
      <div class="sign-area">${b.signature ? `<img src="${b.signature}" alt="">` : ''}</div>
      <div class="sign-name">${esc(d.signedBy || b.name)}</div>
      <div class="sign-role">Authorized signatory${b.name ? `, ${esc(b.name)}` : ''}</div></div>`)];
  },
};

function buildUnits(d) {
  const T = calcDoc(d);
  const units = [];
  const isQ = d.type === 'quotation';
  const titles = isQ ? QUOTE_SECTIONS : INVOICE_SECTIONS;
  const R = isQ ? QUOTE_RENDER : INVOICE_RENDER;

  if (isQ) {
    const days = timelineDays(d.timeline);
    const stats = [
      ['Total investment', money(T.grand, d.currency)],
      days && sectionEnabled(d, 'timeline') ? ['Estimated timeline', `${days} days`] : null,
      d.validUntil ? ['Valid until', fmtDate(d.validUntil)] : null,
    ].filter(Boolean);
    units.push(H(`<div class="hero">
      <div class="hero-kicker">Proposal for ${esc(d.client.company || d.client.name || 'client')}</div>
      <h1 class="hero-title">${esc(d.projectName || 'Untitled project')}</h1>
      <div class="hero-stats">${stats.map(([k, v]) => `<div><span>${k}</span><strong>${v}</strong></div>`).join('')}</div>
    </div>`));
  }

  let n = 0;
  d.sections.filter((s) => s.on).forEach((s) => {
    const fn = R[s.key];
    if (!fn) return;
    const content = fn(d, T);
    if (!content.length) return;
    n++;
    const showHead = !(d.type === 'invoice' && (s.key === 'parties' || s.key === 'signature'));
    if (showHead) {
      units.push(H(`<h2 class="sec-h">${isQ ? `<span class="sec-n">${n}</span>` : ''}<span class="sec-t">${esc(titles[s.key])}</span></h2>`, true));
    }
    units.push(...content);
  });
  return units;
}
const sectionEnabled = (d, key) => (d.sections.find((s) => s.key === key) || {}).on;

/* ---------------------------------------------------------------------
   15. Page chrome (header / footer) and pagination
   --------------------------------------------------------------------- */
function firstHeader(d) {
  const b = state.business;
  const isQ = d.type === 'quotation';
  const initials = (b.name || 'F').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const contact = [b.email, b.phone, b.website].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('');
  const ids = [b.gst && `GSTIN ${esc(b.gst)}`, b.pan && `PAN ${esc(b.pan)}`].filter(Boolean).map((x) => `<span>${x}</span>`).join('');
  const meta = isQ
    ? [['Quotation no.', d.number], ['Date', fmtDate(d.date)], ['Valid until', fmtDate(d.validUntil)]]
    : [['Invoice no.', d.number], ['Invoice date', fmtDate(d.date)], ['Due date', fmtDate(d.dueDate)], d.relatedQuote ? ['Quotation ref.', d.relatedQuote] : null];
  const title = isQ ? 'Quotation' : (b.gst && d.currency === 'INR' ? 'Tax Invoice' : 'Invoice');
  const status = !isQ ? `<span class="status st-${d.status.toLowerCase().replace(/\s+/g, '-')}">${esc(d.status)}</span>` : '';
  return `<header class="pg-head first">
    <div class="brand-block">
      <div class="logo-wrap">${b.logo ? `<img class="logo" src="${b.logo}" alt="">` : `<span class="monogram">${esc(initials)}</span>`}</div>
      <div class="biz">
        <div class="biz-name">${esc(b.name || 'Your business name')}</div>
        <div class="biz-lines">${addrLines(b).map((l) => `<div>${esc(l)}</div>`).join('')}</div>
        ${contact ? `<div class="biz-contact">${contact}</div>` : ''}
        ${ids ? `<div class="biz-ids">${ids}</div>` : ''}
      </div>
    </div>
    <div class="doc-id">
      <div class="doc-title">${title}</div>${status}
      <table class="doc-meta">${meta.filter(Boolean).map(([k, v]) => `<tr><th>${k}</th><td>${esc(v || '—')}</td></tr>`).join('')}</table>
    </div>
  </header>`;
}
function runningHeader(d) {
  const b = state.business;
  const kind = d.type === 'quotation' ? 'Quotation' : 'Invoice';
  return `<header class="pg-head run"><span class="run-biz">${esc(b.name)}</span><span class="run-doc">${kind} ${esc(d.number)}${d.client.name ? ` for ${esc(d.client.company || d.client.name)}` : ''}</span></header>`;
}
function footerHTML() {
  const b = state.business;
  const parts = [b.name, b.email, b.phone, b.website].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('');
  return `<div class="foot-info">${parts}</div>`;
}

/** Create one empty A4 page and return handles to its parts. */
function makePage(d, index, host) {
  const el = document.createElement('div');
  el.className = 'page';
  el.innerHTML = `${index === 0 ? firstHeader(d) : runningHeader(d)}<div class="pg-body"></div><footer class="pg-foot">${footerHTML()}<span class="pg-num"></span></footer>`;
  host.appendChild(el);
  return { el, body: el.querySelector('.pg-body'), num: el.querySelector('.pg-num') };
}

function htmlToEl(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
function makeTable(u) {
  const el = htmlToEl(`<table class="dt ${u.cls || ''}">${u.colgroup || ''}<thead>${u.head}</thead><tbody></tbody></table>`);
  return el;
}

/**
 * Lay units onto A4 pages. Blocks that don't fit move to a new page;
 * tables split between rows and repeat their header row; headings that
 * would be stranded at the bottom of a page travel with their content.
 */
function paginate(units, d, host) {
  host.innerHTML = '';
  const pages = [];
  let cur;
  const open = () => { cur = makePage(d, pages.length, host); pages.push(cur); };
  const fits = () => cur.body.scrollHeight <= cur.body.clientHeight + 1;
  const takeCarry = () => {
    const carry = [];
    let last = cur.body.lastElementChild;
    while (last && last.dataset.kwn === '1') { carry.unshift(last); last.remove(); last = cur.body.lastElementChild; }
    return carry;
  };
  /** Move el (plus any keep-with-next elements before it) onto a new page. */
  const moveToNewPage = (el) => {
    el.remove();
    const carry = takeCarry();
    if (cur.body.children.length === 0) {           // nothing else on page — can't do better
      carry.forEach((c) => cur.body.appendChild(c));
      cur.body.appendChild(el);
      return;
    }
    open();
    carry.forEach((c) => cur.body.appendChild(c));
    cur.body.appendChild(el);
  };

  open();
  for (const u of units) {
    if (u.type === 'html') {
      const el = htmlToEl(u.html);
      if (u.kwn) el.dataset.kwn = '1';
      cur.body.appendChild(el);
      if (!fits()) moveToNewPage(el);
    } else if (u.type === 'table') {
      let tbl = makeTable(u);
      cur.body.appendChild(tbl);
      let rowsHere = 0;
      for (const rowHTML of u.rows) {
        const tb = tbl.tBodies[0];
        tb.insertAdjacentHTML('beforeend', rowHTML);
        if (fits()) { rowsHere++; continue; }
        const row = tb.lastElementChild;
        if (rowsHere === 0) {                        // header + first row don't fit: move whole table
          moveToNewPage(tbl);
          rowsHere = 1;
          continue;
        }
        row.remove();                                // continue table on next page
        open();
        if (u.title) {
          const c = htmlToEl(`<div class="cont-label">${esc(u.title)}, continued</div>`);
          cur.body.appendChild(c);
        }
        tbl = makeTable(u);
        cur.body.appendChild(tbl);
        tbl.tBodies[0].appendChild(row);
        rowsHere = 1;
      }
    }
  }
  pages.forEach((p, i) => { p.num.textContent = `Page ${i + 1} of ${pages.length}`; });
  return pages.length;
}

/* ---------------------------------------------------------------------
   16. Preview rendering & scaling
   --------------------------------------------------------------------- */
/** Mix a hex colour with white; t = share of white (0..1). */
function tint(hex, t) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  if (!m) return hex;
  const c = [1, 2, 3].map((i) => Math.round(parseInt(m[i], 16) * (1 - t) + 255 * t));
  return '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');
}
function applyTheme(el) {
  const { primary, secondary, template } = state.settings;
  el.className = `pages tpl-${template}`;
  el.style.setProperty('--p', primary);
  el.style.setProperty('--s', secondary);
  el.style.setProperty('--p-tint', tint(primary, 0.93));
  el.style.setProperty('--p-soft', tint(primary, 0.82));
  el.style.setProperty('--s-tint', tint(secondary, 0.88));
}

function renderPreview() {
  const d = currentDoc();
  if (!d) return;
  const host = $('#pages');
  applyTheme(host);
  const count = paginate(buildUnits(d), d, host);
  $('#page-count').textContent = `A4, ${count} page${count > 1 ? 's' : ''}`;
  updateScale();
}
const schedulePreview = debounce(renderPreview, 220);

function updateScale() {
  const host = $('#pages');
  const scroll = $('#preview-scroll');
  const scaler = $('#scaler');
  const pw = host.offsetWidth || 794;
  const avail = scroll.clientWidth - (window.innerWidth < 640 ? 20 : 48);
  const s = avail > 100 ? Math.min(1.1, avail / pw) : 1;
  host.style.transform = `scale(${s})`;
  scaler.style.width = pw * s + 'px';
  scaler.style.height = host.offsetHeight * s + 'px';
}

/* ---------------------------------------------------------------------
   17. Validation
   --------------------------------------------------------------------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const isNumeric = (v) => String(v ?? '').trim() === '' || /^-?\d+(\.\d+)?$/.test(String(v).replace(/,/g, '').trim());

function validate(d) {
  const errs = [];
  const add = (path, msg) => errs.push({ path, msg });
  const isQ = d.type === 'quotation';
  const label = isQ ? 'Quotation' : 'Invoice';

  if (!String(d.number || '').trim()) add('doc.number', `${label} number is required.`);
  if (!String(d.client.name || '').trim()) add('doc.client.name', 'Client name is required.');
  if (d.client.email && !EMAIL_RE.test(d.client.email)) add('doc.client.email', 'Client email doesn’t look like a valid address.');
  if (state.business.email && !EMAIL_RE.test(state.business.email)) add('business.email', 'Your business email doesn’t look like a valid address.');
  if (!parseISO(d.date)) add('doc.date', `${label} date is missing or invalid.`);
  if (isQ && d.validUntil) {
    if (!parseISO(d.validUntil)) add('doc.validUntil', '“Valid until” is not a valid date.');
    else if (parseISO(d.date) && parseISO(d.validUntil) < parseISO(d.date)) add('doc.validUntil', '“Valid until” is earlier than the quotation date.');
  }
  if (!isQ && d.dueDate) {
    if (!parseISO(d.dueDate)) add('doc.dueDate', 'Due date is not a valid date.');
    else if (parseISO(d.date) && parseISO(d.dueDate) < parseISO(d.date)) add('doc.dueDate', 'Due date is earlier than the invoice date.');
  }

  d.items.forEach((it, i) => {
    const n = i + 1;
    const p = (k) => `doc.items.${i}.${k}`;
    ['qty', 'price', 'discount', 'tax'].forEach((k) => {
      if (!isNumeric(it[k])) add(p(k), `Item ${n}: ${k === 'qty' ? 'quantity' : k === 'price' ? 'unit price' : k} must be a number.`);
      else if (num(it[k]) < 0) add(p(k), `Item ${n}: ${k === 'qty' ? 'quantity' : k === 'price' ? 'unit price' : k} can’t be negative.`);
    });
    if (num(it.discount) > 100) add(p('discount'), `Item ${n}: discount can’t be more than 100%.`);
    if (num(it.tax) > 100) add(p('tax'), `Item ${n}: tax can’t be more than 100%.`);
    if (!it.name && num(it.price) > 0) add(p('name'), `Item ${n} has a price but no name.`);
  });

  const T = calcDoc(d);
  if (!isNumeric(d.discount.value) || num(d.discount.value) < 0) add('doc.discount.value', 'Discount must be a positive number.');
  else if (d.discount.type === 'percent' && num(d.discount.value) > 100) add('doc.discount.value', 'Discount can’t be more than 100%.');
  else if (d.discount.type === 'fixed' && num(d.discount.value) > T.subtotal - T.lineDiscount) add('doc.discount.value', 'Discount is larger than the item total.');

  if (isQ && sectionEnabled(d, 'payment') && d.milestones.length) {
    d.milestones.forEach((m, i) => { if (!isNumeric(m.pct) || num(m.pct) < 0) add(`doc.milestones.${i}.pct`, `Milestone ${i + 1}: percentage must be a positive number.`); });
    const sum = round2(d.milestones.reduce((a, m) => a + num(m.pct), 0));
    if (sum !== 100) add(`doc.milestones.0.pct`, `Payment milestones add up to ${sum}%, not 100%.`);
  }
  if (!isQ) {
    if (!isNumeric(d.amountPaid) || num(d.amountPaid) < 0) add('doc.amountPaid', 'Amount paid must be a positive number.');
    else if (num(d.amountPaid) > T.grand + 0.001) add('doc.amountPaid', 'Amount paid is more than the grand total.');
  }
  return errs;
}

function markInvalid(errs) {
  $$('.invalid').forEach((el) => el.classList.remove('invalid'));
  errs.forEach((e) => { const el = $(`[data-path="${e.path}"]`); if (el) el.classList.add('invalid'); });
}

/** Validate before PDF / print; shows a dialog listing problems. */
async function ensureValid() {
  const errs = validate(currentDoc());
  markInvalid(errs);
  if (!errs.length) return true;
  const list = errs.map((e) => `<li><button type="button" class="link" data-goto="${e.path}">${esc(e.msg)}</button></li>`).join('');
  const res = await modal({
    title: `${errs.length} ${errs.length === 1 ? 'issue needs' : 'issues need'} attention`,
    body: `<p>Fix these so the document goes out correct. Select an issue to jump to its field.</p><ul class="err-list">${list}</ul>`,
    buttons: [{ label: 'Continue anyway', value: 'go' }, { label: 'Fix issues', value: false, primary: true }],
  });
  return res === 'go';
}

function gotoField(path) {
  if (!$('#view-editor').classList.contains('active')) showView(state.mode);
  setPane('edit');
  const el = $(`[data-path="${path}"]`);
  if (!el) return;
  const det = el.closest('details');
  if (det) det.open = true;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => el.focus({ preventScroll: true }), 300);
}

/* ---------------------------------------------------------------------
   18. PDF & print
   --------------------------------------------------------------------- */
function fileBase(d) {
  const who = (d.client.company || d.client.name || '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');
  return [d.number || d.type, who].filter(Boolean).join('_');
}

/** Render each A4 page with html2canvas and assemble them with jsPDF. */
async function generatePDF() {
  if (!(await ensureValid())) return;
  if (!window.html2canvas || !window.jspdf) {
    toast('The PDF library didn’t load (no internet?). Use Print and choose “Save as PDF” instead.', 'err');
    return;
  }
  const d = currentDoc();
  busy('Preparing pages…');
  try {
    renderPreview();
    if (document.fonts && document.fonts.ready) await document.fonts.ready;

    const stage = $('#pdf-stage');
    stage.innerHTML = '';
    const copy = $('#pages').cloneNode(true);
    copy.removeAttribute('id');
    copy.style.transform = 'none';
    stage.appendChild(copy);

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const pages = $$('.page', copy);
    for (let i = 0; i < pages.length; i++) {
      busy(`Rendering page ${i + 1} of ${pages.length}…`);
      const canvas = await window.html2canvas(pages[i], {
        scale: 2.5, useCORS: true, backgroundColor: '#ffffff', logging: false,
        windowWidth: pages[i].scrollWidth, windowHeight: pages[i].scrollHeight,
      });
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    }
    pdf.setProperties({
      title: `${d.type === 'quotation' ? 'Quotation' : 'Invoice'} ${d.number}`,
      subject: d.projectName || '', author: state.business.name || '', creator: 'Folio',
    });
    pdf.save(fileBase(d) + '.pdf');
    stage.innerHTML = '';
    toast('PDF downloaded');
  } catch (err) {
    console.error(err);
    toast('Couldn’t build the PDF. Try Print and choose “Save as PDF”.', 'err');
  } finally {
    busy(null);
  }
}

/** Copy the paginated pages into a print-only container. */
function preparePrint() {
  renderPreview();
  const root = $('#print-root');
  root.innerHTML = '';
  const copy = $('#pages').cloneNode(true);
  copy.removeAttribute('id');
  copy.style.transform = 'none';
  root.appendChild(copy);
}
async function printDoc() {
  if (!(await ensureValid())) return;
  preparePrint();
  const old = document.title;
  document.title = fileBase(currentDoc());
  window.print();
  document.title = old;
}

/* ---------------------------------------------------------------------
   19. Saving, loading, JSON
   --------------------------------------------------------------------- */
function markDirty() {
  state.dirty[state.mode] = true;
  const el = $('#tb-dirty');
  if (el) el.hidden = false;
  persistWorking();
}

async function saveDraft() {
  const d = currentDoc();
  if (!String(d.number || '').trim()) { toast('Add a document number before saving.', 'err'); gotoField('doc.number'); return; }
  const docs = loadDocs();
  const clash = Object.values(docs).find((x) => x.id !== d.id && x.type === d.type && x.number === d.number);
  if (clash && !(await confirmDialog('Number already used', `Another saved ${d.type} already uses ${d.number}. Save this one too?`, 'Save anyway'))) return;
  d.updated = Date.now();
  docs[d.id] = clone(d);
  if (store(LS.docs, docs)) {
    state.dirty[d.type] = false;
    persistWorking();
    updateToolbar();
    toast(`${d.number} saved`);
  }
}

async function confirmDiscard(type) {
  if (!state.dirty[type]) return true;
  const d = state.docs[type];
  return confirmDialog('Discard unsaved changes?', `${d.number || 'The current ' + type} has changes that aren’t in Saved documents yet. They will be lost.`, 'Discard changes', true);
}

async function newDocument(type) {
  if (!(await confirmDiscard(type))) return;
  const cur = state.docs[type];
  const reusable = cur && !state.dirty[type] && !loadDocs()[cur.id] && cur.number;
  const number = reusable ? cur.number : nextNumber(type);
  state.docs[type] = type === 'quotation' ? blankQuotation(number) : blankInvoice(number);
  state.dirty[type] = false;
  persistWorking();
  showView(type);
  toast(`New ${type} ${state.docs[type].number}`);
}

async function openDoc(id) {
  const saved = loadDocs()[id];
  if (!saved) return toast('That document no longer exists.', 'err');
  const cur = state.docs[saved.type];
  if (!(cur && cur.id === id) && !(await confirmDiscard(saved.type))) return;
  state.docs[saved.type] = normalizeDoc(clone(saved));
  state.dirty[saved.type] = false;
  persistWorking();
  showView(saved.type);
}

function duplicateDoc(id) {
  const docs = loadDocs();
  const src = docs[id];
  if (!src) return;
  const copy = normalizeDoc(clone(src));
  copy.id = uid();
  copy.number = nextNumber(copy.type);
  copy.date = todayISO();
  copy.created = copy.updated = Date.now();
  if (copy.type === 'quotation') copy.validUntil = todayISO(15);
  else { copy.status = 'Draft'; copy.amountPaid = '0'; copy.dueDate = todayISO(7); }
  docs[copy.id] = copy;
  store(LS.docs, docs);
  toast(`Duplicated as ${copy.number}`);
  refreshLists();
}

async function deleteDoc(id) {
  const docs = loadDocs();
  const d = docs[id];
  if (!d) return;
  if (!(await confirmDialog(`Delete ${d.number}?`, 'This removes it from Saved documents in this browser. It can’t be undone.', 'Delete', true))) return;
  delete docs[id];
  store(LS.docs, docs);
  toast(`${d.number} deleted`);
  refreshLists();
}

/** Quotation → Invoice. The quotation itself is left untouched. */
async function convertToInvoice() {
  const q = currentDoc();
  if (q.type !== 'quotation') return;
  if (!(await confirmDiscard('invoice'))) return;
  // Reuse the number of an untouched, never-saved invoice instead of skipping one
  const cur = state.docs.invoice;
  const reusable = cur && !state.dirty.invoice && !loadDocs()[cur.id] && cur.number;
  const inv = blankInvoice(reusable ? cur.number : nextNumber('invoice'));
  inv.client = clone(q.client);
  inv.projectName = q.projectName;
  inv.relatedQuote = q.number;
  inv.currency = q.currency;
  inv.items = clone(q.items).filter((it) => it.name || it.detail || num(it.price));
  if (!inv.items.length) inv.items = [blankItem(false)];
  inv.discount = clone(q.discount);
  inv.taxLabel = q.taxLabel;
  inv.splitGst = q.splitGst;
  state.docs.invoice = inv;
  state.dirty.invoice = true;
  persistWorking();
  showView('invoice');
  toast(`Invoice ${inv.number} created from ${q.number}`);
}

async function clearForm() {
  const d = currentDoc();
  if (!(await confirmDialog('Clear this form?', 'Client, project details and all rows will be cleared. The number, dates and default terms stay.', 'Clear form', true))) return;
  const fresh = d.type === 'quotation' ? blankQuotation(d.number) : blankInvoice(d.number);
  fresh.id = d.id;
  if (d.type === 'quotation') {
    fresh.scope = [];
    fresh.deliverables = [];
  }
  state.docs[d.type] = fresh;
  markDirty();
  renderEditor();
  renderPreview();
  toast('Form cleared');
}

function download(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function exportJSON() {
  const d = currentDoc();
  const payload = { app: 'folio', version: 1, exportedAt: new Date().toISOString(), type: d.type, document: d, business: state.business };
  download(JSON.stringify(payload, null, 2), fileBase(d) + '.json', 'application/json');
  toast('JSON file downloaded');
}

async function importJSON(file) {
  let payload;
  try { payload = JSON.parse(await file.text()); } catch (e) {
    return toast('That file isn’t valid JSON.', 'err');
  }
  const raw = payload && (payload.document || payload);
  if (!raw || !['quotation', 'invoice'].includes(raw.type)) {
    return toast('That file isn’t a Folio quotation or invoice.', 'err');
  }
  if (!(await confirmDiscard(raw.type))) return;
  const doc = normalizeDoc(raw);
  doc.id = doc.id || uid();
  if (payload.business && payload.business.name && payload.business.name !== state.business.name) {
    const use = await confirmDialog('Use business details from this file?',
      `The file was made by “${payload.business.name}”. Replace your saved business profile with it?`, 'Replace profile');
    if (use) { state.business = { ...DEFAULT_BUSINESS, ...payload.business }; store(LS.business, state.business); }
  }
  state.docs[doc.type] = doc;
  state.dirty[doc.type] = true;
  persistWorking();
  showView(doc.type);
  toast(`Loaded ${doc.number || doc.type}`);
}

/* ---------------------------------------------------------------------
   20. Images (logo, signatures)
   --------------------------------------------------------------------- */
function resizeImage(file, maxW = 800, maxH = 400) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const r = Math.min(1, maxW / img.width, maxH / img.height);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * r));
        c.height = Math.max(1, Math.round(img.height * r));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handleImage(file) {
  const path = state.uploadTarget;
  if (!file || !path) return;
  if (file.size > 8 * 1024 * 1024) return toast('Choose an image under 8 MB.', 'err');
  try {
    const data = await resizeImage(file, path.includes('logo') ? 800 : 600, path.includes('logo') ? 400 : 240);
    setVal(path, data);
    afterChange(path);
    rerenderCurrentView();
    toast(path.includes('logo') ? 'Logo updated' : 'Signature updated');
  } catch (e) {
    toast('That image couldn’t be read. Try a PNG or JPG.', 'err');
  }
}

/* ---------------------------------------------------------------------
   21. Dashboard, saved list, settings
   --------------------------------------------------------------------- */
function docSummary(d) {
  const T = calcDoc(normalizeDoc(d));
  return { T, client: d.client?.company || d.client?.name || '—' };
}

function statusCell(d, T) {
  if (d.type === 'invoice') return `<span class="status st-${d.status.toLowerCase().replace(/\s+/g, '-')}">${esc(d.status)}</span>`;
  const v = parseISO(d.validUntil);
  if (!v) return '<span class="muted">—</span>';
  return v < parseISO(todayISO()) ? '<span class="status st-overdue">Expired</span>' : `<span class="muted">Valid to ${fmtDate(d.validUntil)}</span>`;
}

function docTable(list, emptyText) {
  if (!list.length) {
    return `<div class="empty"><p>${emptyText}</p>
      <div class="empty-actions"><button class="btn btn-primary" data-action="new-quote">${icon('plus')}New quotation</button>
      <button class="btn" data-action="new-invoice">${icon('plus')}New invoice</button></div></div>`;
  }
  return `<div class="table-scroll"><table class="list">
    <thead><tr><th>Number</th><th>Client</th><th>Project</th><th class="r">Amount</th><th>Status</th><th>Updated</th><th class="r"><span class="sr-only">Actions</span></th></tr></thead>
    <tbody>${list.map((d) => {
      const { T, client } = docSummary(d);
      return `<tr>
        <td><button class="link strong" data-action="open-doc" data-id="${d.id}">${esc(d.number)}</button><div class="kind kind-${d.type}">${d.type === 'quotation' ? 'Quotation' : 'Invoice'}</div></td>
        <td>${esc(client)}</td>
        <td class="muted">${esc(d.projectName || '—')}</td>
        <td class="r num">${money(T.grand, d.currency)}${d.type === 'invoice' && T.balance > 0 && d.status !== 'Cancelled' ? `<div class="muted small">${money(T.balance, d.currency)} due</div>` : ''}</td>
        <td>${statusCell(d, T)}</td>
        <td class="muted nowrap">${new Date(d.updated || d.created).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</td>
        <td class="r nowrap">
          <button class="icon-btn" data-action="open-doc" data-id="${d.id}" title="Open and edit" aria-label="Open ${esc(d.number)}">${icon('edit')}</button>
          <button class="icon-btn" data-action="dup-doc" data-id="${d.id}" title="Duplicate" aria-label="Duplicate ${esc(d.number)}">${icon('copy')}</button>
          <button class="icon-btn danger" data-action="del-doc" data-id="${d.id}" title="Delete" aria-label="Delete ${esc(d.number)}">${icon('trash')}</button>
        </td></tr>`;
    }).join('')}</tbody></table></div>`;
}

const sortedDocs = () => Object.values(loadDocs()).sort((a, b) => (b.updated || 0) - (a.updated || 0));

function sumByCurrency(list, pick) {
  const totals = {};
  list.forEach((d) => { const v = pick(d); if (v > 0) totals[d.currency] = (totals[d.currency] || 0) + v; });
  const parts = Object.entries(totals).map(([c, v]) => money(v, c));
  return parts.length ? parts.join(' + ') : money(0, 'INR');
}

function renderDashboard() {
  const docs = sortedDocs();
  const quotes = docs.filter((d) => d.type === 'quotation');
  const invoices = docs.filter((d) => d.type === 'invoice');
  const live = invoices.filter((d) => d.status !== 'Cancelled');
  const outstanding = sumByCurrency(live, (d) => calcDoc(normalizeDoc(d)).balance);
  const collected = sumByCurrency(live, (d) => num(d.amountPaid));
  const b = state.business;
  const wq = state.docs.quotation, wi = state.docs.invoice;
  $('#view-dashboard').innerHTML = `<div class="page-wrap">
    <header class="view-head">
      <div><h1>${b.name ? esc(b.name) : 'Welcome to Folio'}</h1>
      <p>${b.name ? 'Create a quotation, turn it into an invoice, and send both as PDFs.' : 'Start by adding your business details in Settings so every document carries your brand.'}</p></div>
    </header>
    <div class="create-row">
      <button class="create create-q" data-action="new-quote">
        <span class="create-ic">${icon('quote')}</span>
        <span><strong>New quotation</strong><span>Scope, features, timeline, pricing and terms in one proposal.</span></span>
      </button>
      <button class="create create-i" data-action="new-invoice">
        <span class="create-ic">${icon('invoice')}</span>
        <span><strong>New invoice</strong><span>Bill a client and track what’s paid and still due.</span></span>
      </button>
    </div>
    <div class="continue">
      <span class="muted">Continue where you left off</span>
      <button class="chip-btn" data-view="quotation">${icon('quote')}${esc(wq.number)}${wq.client.name ? ` for ${esc(wq.client.company || wq.client.name)}` : ''}</button>
      <button class="chip-btn" data-view="invoice">${icon('invoice')}${esc(wi.number)}${wi.client.name ? ` for ${esc(wi.client.company || wi.client.name)}` : ''}</button>
    </div>
    <dl class="stats">
      <div><dt>Saved quotations</dt><dd>${quotes.length}</dd></div>
      <div><dt>Saved invoices</dt><dd>${invoices.length}</dd></div>
      <div><dt>Outstanding</dt><dd>${outstanding}</dd></div>
      <div><dt>Collected</dt><dd>${collected}</dd></div>
    </dl>
    <section class="panel">
      <div class="panel-head"><h2>Recent documents</h2>${docs.length ? '<button class="btn btn-sm" data-view="saved">View all</button>' : ''}</div>
      ${docTable(docs.slice(0, 6), 'Nothing saved yet. Documents appear here after you choose Save draft.')}
    </section>
  </div>`;
}

function renderSaved() {
  const q = state.savedSearch.trim().toLowerCase();
  const list = sortedDocs().filter((d) =>
    (state.savedFilter === 'all' || d.type === state.savedFilter) &&
    (!q || [d.number, d.client?.name, d.client?.company, d.projectName].join(' ').toLowerCase().includes(q)));
  const f = state.savedFilter;
  const view = $('#view-saved');
  const hadFocus = document.activeElement && document.activeElement.id === 'saved-search';
  view.innerHTML = `<div class="page-wrap">
    <header class="view-head"><div><h1>Saved documents</h1><p>Stored in this browser. Export JSON from the editor to keep a copy elsewhere.</p></div></header>
    <div class="list-tools">
      <div class="seg" role="group" aria-label="Filter">
        <button class="${f === 'all' ? 'active' : ''}" data-action="filter" data-filter="all">All</button>
        <button class="${f === 'quotation' ? 'active' : ''}" data-action="filter" data-filter="quotation">Quotations</button>
        <button class="${f === 'invoice' ? 'active' : ''}" data-action="filter" data-filter="invoice">Invoices</button>
      </div>
      <input type="search" id="saved-search" placeholder="Search number, client or project" value="${esc(state.savedSearch)}" aria-label="Search saved documents">
    </div>
    <section class="panel">${docTable(list, q ? 'No documents match your search.' : 'No saved documents yet. Open a quotation or invoice and choose Save draft.')}</section>
  </div>`;
  if (hadFocus) { const s = $('#saved-search'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
}

function renderSettings() {
  $('#view-settings').innerHTML = `<div class="page-wrap narrow">
    <header class="view-head"><div><h1>Settings</h1><p>Your business profile, payment details and document defaults. Changes save automatically.</p></div></header>
    <div class="settings-cards">
      ${card('s-business', 'Business profile', businessFields())}
      ${card('s-bank', 'Payment details', `<div class="grid">
        ${fld('Bank name', 'business.bankName')}${fld('Account name', 'business.accountName')}
        ${fld('Account number', 'business.accountNumber')}${fld('IFSC', 'business.ifsc')}
        ${fld('UPI ID', 'business.upi')}${fld('Payment link', 'business.paymentLink', { ph: 'https://' })}</div>`)}
      ${card('s-look', 'Default look', designBody(false))}
      ${card('s-numbers', 'Document numbering', `<div class="grid">
        ${fld('Quotation prefix', 'settings.qtPrefix', { help: `Next number: ${esc(peekNextNumber('quotation'))}` })}
        ${fld('Invoice prefix', 'settings.invPrefix', { help: `Next number: ${esc(peekNextNumber('invoice'))}` })}</div>`)}
      ${card('s-data', 'Data in this browser', `<p class="note">Folio has no server. Documents, your profile and images live in this browser’s local storage, so clearing browser data removes them.</p>
        <div class="row-gap"><button class="btn" data-action="load-sample">Load sample quotation</button>
        <button class="btn btn-danger-outline" data-action="wipe">Delete all local data</button></div>`)}
    </div></div>`;
}

function refreshLists() {
  if (state.view === 'dashboard') renderDashboard();
  if (state.view === 'saved') renderSaved();
}
function rerenderCurrentView() {
  if (state.view === 'editor') { renderEditor(); renderPreview(); }
  else if (state.view === 'settings') renderSettings();
}

/* ---------------------------------------------------------------------
   22. Navigation
   --------------------------------------------------------------------- */
function showView(name) {
  const editorModes = ['quotation', 'invoice'];
  const isEditor = editorModes.includes(name);
  state.view = isEditor ? 'editor' : name;
  if (isEditor) state.mode = name;
  $$('.view').forEach((v) => v.classList.remove('active'));
  $(`#view-${state.view}`).classList.add('active');
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === (isEditor ? name : state.view)));
  if (isEditor) { renderEditor(); renderPreview(); }
  if (name === 'dashboard') renderDashboard();
  if (name === 'saved') renderSaved();
  if (name === 'settings') renderSettings();
  document.querySelector('.main').scrollTop = 0;
}

function setPane(p) {
  state.pane = p;
  $('#workspace').classList.toggle('show-preview', p === 'preview');
  $$('.pane-switch button').forEach((b) => b.classList.toggle('active', b.dataset.pane === p));
  if (p === 'preview') requestAnimationFrame(updateScale);
}

function togglePreviewFocus() {
  if (window.matchMedia('(max-width: 900px)').matches) return setPane(state.pane === 'preview' ? 'edit' : 'preview');
  state.focusPreview = !state.focusPreview;
  $('#view-editor').classList.toggle('focus-preview', state.focusPreview);
  $('#btn-preview .lbl').textContent = state.focusPreview ? 'Back to editor' : 'Preview';
  requestAnimationFrame(updateScale);
}

/* ---------------------------------------------------------------------
   23. Events
   --------------------------------------------------------------------- */
/** Called after any bound value changes. */
function afterChange(path) {
  if (path.startsWith('business.')) persistBusiness();
  if (path.startsWith('settings.')) persistSettings();
  if (path.startsWith('doc.')) markDirty();
  if (path.startsWith('business.') || path.startsWith('settings.')) persistWorking();
  if (state.view === 'editor') { updateComputed(); schedulePreview(); }
}

function onFieldInput(e) {
  const t = e.target;
  if (t.matches('[data-rte]')) {
    setVal(t.dataset.rte, t.innerHTML);
    afterChange(t.dataset.rte);
    return;
  }
  if (t.id === 'saved-search') { state.savedSearch = t.value; renderSaved(); return; }
  const path = t.dataset && t.dataset.path;
  if (!path) return;
  const value = t.type === 'checkbox' ? t.checked : t.value;
  const isSectionToggle = path.startsWith('doc.sections.') && t.type === 'checkbox';
  if (getVal(path) === value) {
    // 'change' after 'input' on a checkbox: value already stored, but section hints still need a refresh
    if (isSectionToggle && e.type === 'change') renderEditor();
    return;
  }
  setVal(path, value);
  t.classList.remove('invalid');

  if (t.type === 'number') t.classList.toggle('invalid', !isNumeric(value) || num(value) < 0);
  if (t.type === 'color') { const code = t.parentElement.querySelector('code'); if (code) code.textContent = value; }

  if (path.startsWith('doc.milestones.')) {
    currentDoc().paymentPreset = 'custom';
    $$('[data-action="preset"]').forEach((b) => b.classList.toggle('active', b.dataset.preset === 'custom'));
  }
  if (path.startsWith('doc.sections.')) {
    // Refresh the "hidden in document" hints on cards
    if (e.type === 'change' || t.type === 'checkbox') { renderEditor(); }
  }
  if (path === 'settings.template') {
    $$('.tpl-opt').forEach((b) => { const on = b.dataset.tpl === value; b.classList.toggle('active', on); b.setAttribute('aria-checked', on); });
    $('#preview-template').value = value;
  }
  if (path === 'doc.number') $('#tb-number').textContent = value || 'No number';
  if (path === 'doc.currency') updateComputed();
  if (path === 'business.name') {
    const hint = $('[data-card="business"] .card-hint');
    if (hint) hint.textContent = value;
  }
  afterChange(path);
}

async function onAction(e) {
  const nav = e.target.closest('[data-view]');
  if (nav && !e.target.closest('select')) {
    closeMenus();
    showView(nav.dataset.view);
    return;
  }
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.disabled) {
    if (!e.target.closest('.menu-wrap')) closeMenus();
    return;
  }
  const a = btn.dataset.action;
  if (a !== 'menu') closeMenus();
  const d = currentDoc();
  const list = btn.dataset.list;
  const i = +btn.dataset.i;

  switch (a) {
    case 'menu': {
      const m = btn.nextElementSibling;
      const open = !m.classList.contains('open');
      closeMenus();
      m.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open);
      break;
    }
    case 'new-quote': return newDocument('quotation');
    case 'new-invoice': return newDocument('invoice');
    case 'save': return saveDraft();
    case 'pdf': return generatePDF();
    case 'print': return printDoc();
    case 'preview': return togglePreviewFocus();
    case 'pane': return setPane(btn.dataset.pane);
    case 'convert': return convertToInvoice();
    case 'export-json': return exportJSON();
    case 'import-json': $('#json-input').value = ''; $('#json-input').click(); break;
    case 'clear': return clearForm();

    case 'add-row':
      d[list].push(repConfig(list).blank());
      if (list === 'milestones') { d.paymentPreset = 'custom'; $$('[data-action="preset"]').forEach((b) => b.classList.toggle('active', b.dataset.preset === 'custom')); }
      rerenderRepeater(list); markDirty(); schedulePreview();
      requestAnimationFrame(() => {
        const rows = $$(`[data-rep="${list}"] .rep-row`);
        const last = rows[rows.length - 1];
        last && last.querySelector('input, select') && last.querySelector('input, select').focus();
      });
      break;
    case 'row-del':
      d[list].splice(i, 1);
      rerenderRepeater(list); markDirty(); schedulePreview();
      break;
    case 'row-up':
    case 'row-down': {
      const j = a === 'row-up' ? i - 1 : i + 1;
      if (j < 0 || j >= d[list].length) break;
      [d[list][i], d[list][j]] = [d[list][j], d[list][i]];
      rerenderRepeater(list); markDirty(); schedulePreview();
      const target = $$(`[data-rep="${list}"] .rep-row`)[j];
      target && target.querySelector(`[data-action="${a}"]`) && target.querySelector(`[data-action="${a}"]`).focus();
      break;
    }
    case 'preset': {
      const p = btn.dataset.preset;
      d.paymentPreset = p;
      if (PAYMENT_PRESETS[p]) d.milestones = clone(PAYMENT_PRESETS[p]);
      $$('[data-action="preset"]').forEach((b) => b.classList.toggle('active', b.dataset.preset === p));
      rerenderRepeater('milestones'); markDirty(); schedulePreview();
      break;
    }
    case 'sec-up':
    case 'sec-down': {
      const j = a === 'sec-up' ? i - 1 : i + 1;
      if (j < 0 || j >= d.sections.length) break;
      [d.sections[i], d.sections[j]] = [d.sections[j], d.sections[i]];
      markDirty(); renderEditor(); renderPreview();
      const b = $$(`.sec-list li`)[j];
      b && b.querySelector(`[data-action="${a}"]:not([disabled])`) && b.querySelector(`[data-action="${a}"]`).focus();
      break;
    }
    case 'template':
      state.settings.template = btn.dataset.tpl;
      persistSettings();
      $$('.tpl-opt').forEach((x) => { const on = x.dataset.tpl === btn.dataset.tpl; x.classList.toggle('active', on); x.setAttribute('aria-checked', on); });
      $('#preview-template').value = btn.dataset.tpl;
      if (state.view === 'editor') renderPreview();
      break;
    case 'reset-colors':
      state.settings.primary = DEFAULT_SETTINGS.primary;
      state.settings.secondary = DEFAULT_SETTINGS.secondary;
      persistSettings();
      rerenderCurrentView();
      break;
    case 'upload':
      state.uploadTarget = btn.dataset.target;
      $('#img-input').value = '';
      $('#img-input').click();
      break;
    case 'remove-img':
      setVal(btn.dataset.target, '');
      afterChange(btn.dataset.target);
      rerenderCurrentView();
      break;
    case 'open-doc': return openDoc(btn.dataset.id);
    case 'dup-doc': return duplicateDoc(btn.dataset.id);
    case 'del-doc': return deleteDoc(btn.dataset.id);
    case 'filter': state.savedFilter = btn.dataset.filter; renderSaved(); break;
    case 'load-sample': {
      if (!(await confirmDiscard('quotation'))) return;
      state.docs.quotation = sampleQuotation();
      state.dirty.quotation = false;
      persistWorking();
      showView('quotation');
      toast('Sample quotation loaded');
      break;
    }
    case 'wipe': {
      const ok = await confirmDialog('Delete all local data?', 'This removes every saved document, your business profile, images and settings from this browser.', 'Delete everything', true);
      if (!ok) return;
      Object.values(LS).forEach((k) => localStorage.removeItem(k));
      location.reload();
      break;
    }
  }
}

function closeMenus() {
  $$('.menu.open').forEach((m) => { m.classList.remove('open'); m.previousElementSibling.setAttribute('aria-expanded', 'false'); });
}

/** Rich text toolbar — mousedown keeps the text selection alive. */
function onRteMouseDown(e) {
  const b = e.target.closest('[data-cmd]');
  if (!b) return;
  e.preventDefault();
  const body = b.closest('.rte').querySelector('.rte-body');
  body.focus();
  const cmd = b.dataset.cmd;
  const map = {
    h3: ['formatBlock', 'H3'], p: ['formatBlock', 'P'],
    ul: ['insertUnorderedList'], ol: ['insertOrderedList'],
  };
  if (cmd === 'clear') { document.execCommand('removeFormat'); document.execCommand('formatBlock', false, 'P'); }
  else if (map[cmd]) document.execCommand(map[cmd][0], false, map[cmd][1]);
  else document.execCommand(cmd);
  setVal(body.dataset.rte, body.innerHTML);
  afterChange(body.dataset.rte);
}

function bindEvents() {
  document.addEventListener('input', onFieldInput);
  document.addEventListener('change', onFieldInput);
  document.addEventListener('click', onAction);
  document.addEventListener('mousedown', onRteMouseDown);
  document.addEventListener('toggle', (e) => {
    const c = e.target.closest && e.target.closest('details[data-card]');
    if (c) state.cards[c.dataset.card] = c.open;
  }, true);
  // Paste into rich-text as plain text to keep formatting clean
  document.addEventListener('paste', (e) => {
    if (!e.target.closest || !e.target.closest('[data-rte]')) return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });
  $('#img-input').addEventListener('change', (e) => handleImage(e.target.files[0]));
  $('#json-input').addEventListener('change', (e) => e.target.files[0] && importJSON(e.target.files[0]));
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); if (state.view === 'editor') saveDraft(); }
    if (mod && e.key.toLowerCase() === 'p' && state.view === 'editor') { e.preventDefault(); printDoc(); }
    if (e.key === 'Escape') closeMenus();
  });
  window.addEventListener('beforeprint', () => { if (!$('#print-root').children.length) preparePrint(); });
  window.addEventListener('afterprint', () => { $('#print-root').innerHTML = ''; });
  window.addEventListener('beforeunload', persistWorkingNow);
  if ('ResizeObserver' in window) new ResizeObserver(() => updateScale()).observe($('#preview-scroll'));
  else window.addEventListener('resize', updateScale);
}
function persistWorkingNow() { try { localStorage.setItem(LS.working, JSON.stringify({ docs: state.docs, dirty: state.dirty })); } catch (e) { /* ignore */ } }

/* ---------------------------------------------------------------------
   24. Start-up
   --------------------------------------------------------------------- */
function init() {
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* older browsers */ }
  state.settings = { ...DEFAULT_SETTINGS, ...load(LS.settings, {}) };
  const firstRun = localStorage.getItem(LS.business) === null && localStorage.getItem(LS.working) === null;
  state.business = { ...DEFAULT_BUSINESS, ...(load(LS.business, null) || (firstRun ? SAMPLE_BUSINESS : {})) };
  if (firstRun) store(LS.business, state.business);

  const w = load(LS.working, null);
  if (w && w.docs) {
    state.docs.quotation = w.docs.quotation ? normalizeDoc(w.docs.quotation) : blankQuotation(nextNumber('quotation'));
    state.docs.invoice = w.docs.invoice ? normalizeDoc(w.docs.invoice) : blankInvoice(nextNumber('invoice'));
    state.dirty = { quotation: false, invoice: false, ...(w.dirty || {}) };
  } else {
    state.docs.quotation = sampleQuotation();
    state.docs.invoice = blankInvoice(nextNumber('invoice'));
  }
  persistWorking();

  hydrateIcons();
  bindEvents();
  showView(firstRun ? 'quotation' : 'dashboard');
  if (firstRun) setTimeout(() => toast('A sample quotation is loaded. Replace it with your own details.', 'info'), 400);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (state.view === 'editor') renderPreview(); });
}

document.addEventListener('DOMContentLoaded', init);
