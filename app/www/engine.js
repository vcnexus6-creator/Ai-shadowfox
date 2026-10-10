/* Plant Ops Optimiser: simulated plant data and the decision engine (shared by the phone app). */
/* =====================================================================
   SIMULATED PLANT DATA (illustrative only, not a real factory)
   Hours are counted from Tue 13 Oct 2026, 07:30 IST.
   ===================================================================== */
const T = { cutoff: 76.5, due: 82.5, t1cut: 98.5, sun: 120.5, co: 6.5, wed: 22.5, kit: 50.5 };
const RATE = 25;                       // knuckles per machine-hour on Op 20
const BASE_DATE = Date.UTC(2026, 9, 13, 2, 0); // 07:30 IST = 02:00 UTC
const COST = {
  contribution: 520, kit: 65000, collateralP: 0.5, collateral: 320000, emergency: 35000,
  plannedLabour: 9600, runIn: 3500, outsideTech: 25000, midBatch: 7750, expressKit: 8000,
  freight: 65000, sundayOT: 38000, sundayPcs: 300, perMove: 4000,
};
const FG_LH = 150, FORGE_WIP_H = 40, HT_STOCK_H = 16, P02_RISK = 0.18, HT_RISK = 0.03;
const FAIL_DOWN = 36, PLAN_DOWN = 8, CO_OVERLAP = 0.75, REACT_EFF = 0.6, SAFETY = 0.5, M07_LOAD = 74, ONSET_DAYS = 12;
const DEFAULTS = { p5: 0.72, crew14: true, kitInStores: true, nightOp: true, penalty: 150000, objective: 'cost' };

const LINES = [
  { key: 'knuckle', name: 'Knuckle cell', machines: [
    { id: 'M-05', type: 'VMC', risk: 3, oee: 71 }, { id: 'M-06', type: 'VMC', risk: 4, oee: 68 },
    { id: 'M-07', type: 'VMC', risk: null, oee: 66, alert: true, note: 'Spindle bearing wear suspected' },
    { id: 'M-08', type: 'VMC', risk: 5, oee: 74 }, { id: 'M-09', type: 'VMC', risk: 2, oee: 58 }, { id: 'M-10', type: 'VMC', risk: 6, oee: 70 } ] },
  { key: 'hub', name: 'Hub line', machines: [
    { id: 'H-01', type: 'HMC', risk: 3, oee: 64 }, { id: 'H-02', type: 'HMC', risk: 4, oee: 61 }, { id: 'H-03', type: 'HMC', risk: 2, oee: 67 },
    { id: 'H-04', type: 'HMC', risk: 5, oee: 59 }, { id: 'H-05', type: 'HMC', risk: 3, oee: 63 }, { id: 'H-06', type: 'HMC', risk: 2, oee: 66 } ] },
  { key: 'turn', name: 'Turning cell', machines: [
    { id: 'T-01', type: 'CNC lathe', risk: 2, oee: 72 }, { id: 'T-02', type: 'CNC lathe', risk: 3, oee: 66 }, { id: 'T-03', type: 'CNC lathe', risk: 6, oee: 55 },
    { id: 'T-04', type: 'CNC lathe', risk: 2, oee: 69 }, { id: 'T-05', type: 'CNC lathe', risk: 4, oee: 63 }, { id: 'T-06', type: 'CNC lathe', risk: 3, oee: 70 },
    { id: 'T-07', type: 'CNC lathe', risk: 4, oee: 61 } ] },
  { key: 'forge', name: 'Forge and HT', machines: [
    { id: 'P-01', type: 'Forging press', risk: 4, oee: 62 }, { id: 'P-02', type: 'Forging press', risk: 18, oee: 57, watch: true, note: 'Hydraulic oil temperature rising' },
    { id: 'HT-01', type: 'HT furnace', risk: 3, oee: 81 } ] },
];
const MACHINES = LINES.flatMap(l => l.machines.map(m => Object.assign({ line: l.name, lineKey: l.key }, m)));

const ORDERS = [
  { so: 'SO-4471', cust: 'OEM-A', part: 'Steering knuckle LH', code: 'LH', qty: 6000, done: 1800, fg: 150, due: 'Fri 16 Oct, 18:00', m07: 1230, machines: 'M-07, M-09, M-10' },
  { so: 'SO-4472', cust: 'OEM-A', part: 'Steering knuckle RH', code: 'RH', qty: 6000, done: 1950, fg: 0, due: 'Fri 16 Oct, 18:00', m07: 580, machines: 'M-05, M-06, M-07' },
  { so: 'SO-4478', cust: 'Tier1-B', part: 'Knuckle T1-310', code: 'T1', qty: 2400, done: 100, fg: 0, due: 'Sat 17 Oct, 14:00', m07: 0, machines: 'M-08' },
];

// OEM-A contribution still to earn this week: the base for "margin kept"
const WEEK_CONTRIB = ORDERS.filter(o => o.cust === 'OEM-A').reduce((t, o) => t + (o.qty - o.done) * COST.contribution, 0);
const CELL = [
  { id: 'M-05', part: 'RH', load: 70, fits: ['RH'] },
  { id: 'M-06', part: 'RH', load: 68, fits: ['RH'] },
  { id: 'M-07', part: 'LH+RH', load: 74, fits: ['LH', 'RH'] },
  { id: 'M-08', part: 'T1', load: 92, cap: 98.5, fits: ['T1'] },
  { id: 'M-09', part: 'LH', load: 52, fits: ['LH'] },
  { id: 'M-10', part: 'LH', load: 66, fits: ['LH'] },
];

/* =====================================================================
   DECISION ENGINE
   Failure time: Weibull (shape 2), scale set so that P(fail within 5 days) = p5.
   Each option: expected cost = planned work + expected repair + expected late-delivery cost + rescheduling.
   ===================================================================== */
function etaDays(p5) { return 5 / Math.sqrt(-Math.log(1 - p5)); }
function Fh(tH, eta, k) { return 1 - Math.exp(-k * Math.pow((tH / 24) / eta, 2)); }
function spareOf(P) { const lh = (P.nightOp ? 24.5 : 9) + 10.5, rh = 6.5 + 8.5; return { lh, rh, total: lh + rh, m09: P.nightOp ? 24.5 : 9 }; }

function failCost(tau, P, movedH) {
  const repair = COST.kit + COST.collateralP * COST.collateral + COST.emergency;
  let late = 0, latePcs = 0, isLate = false;
  if (tau < T.cutoff) {
    const s = spareOf(P);
    const lostH = Math.max(0, Math.min(FAIL_DOWN, T.cutoff - tau) - (T.cutoff - M07_LOAD));
    const recover = REACT_EFF * Math.max(0, s.total - movedH) * (T.cutoff - tau) / T.cutoff;
    latePcs = Math.max(0, Math.round(Math.max(0, lostH - recover) * RATE) - FG_LH); // LH finished stock ships first
    if (latePcs > 0) { isLate = true; late = P.penalty + COST.freight + COST.sundayOT + Math.max(0, latePcs - COST.sundayPcs) * COST.contribution; }
  }
  return { repair, late, isLate, latePcs };
}
function exposure(P, until, k, movedH) {
  const eta = etaDays(P.p5), dt = 0.25;
  let eRepair = 0, eLate = 0, pLate = 0, ePcs = 0;
  for (let t = 0; t < until; t += dt) {
    const dp = Fh(t + dt, eta, k) - Fh(t, eta, k);
    const c = failCost(t + dt / 2, P, movedH);
    eRepair += dp * c.repair; eLate += dp * c.late; ePcs += dp * c.latePcs;
    if (c.isLate) pLate += dp;
  }
  return { pFail: Fh(until, eta, k), eRepair, eLate, pLate, ePcs };
}
function makeOpt(o, ex, planned, resched) {
  const exp = planned + ex.eRepair + ex.eLate + resched;
  return Object.assign(o, {
    pFail: ex.pFail, pLate: ex.pLate, onTime: 1 - ex.pLate, eDown: ex.pFail * FAIL_DOWN,
    parts: { planned, repair: ex.eRepair, late: ex.eLate, resched }, exp, ePcs: ex.ePcs, marginKept: 1 - exp / WEEK_CONTRIB, movedPcs: Math.round((o.moved || 0) * RATE),
  });
}
function evaluate(Pin) {
  const P = Object.assign({}, DEFAULTS, Pin), s = spareOf(P), opts = [];
  const plannedLater = COST.kit + COST.plannedLabour + COST.runIn;
  { // A — continue
    const ex = exposure(P, T.sun, 1, 0);
    opts.push(makeOpt({ id: 'A', short: 'Continue current plan', tag: 'Continue current plan', name: 'Continue the current plan and replace the bearing at Sunday maintenance',
      when: 'Sun 08:00 maintenance day', tr: T.sun, moved: 0, kind: 'continue', status: 'ok',
      flag: ex.pFail > SAFETY ? 'risk' : null }, ex, (1 - ex.pFail) * plannedLater, 0));
  }
  { // B — reduce load 12%, shift to M-09, Sunday
    const moved = +(0.12 * M07_LOAD).toFixed(1);
    const ex = exposure(P, T.sun, 0.7, moved);
    const o = makeOpt({ id: 'B', short: 'Cut M-07 load 12%, shift work to M-09', tag: 'Cut load 12%, shift to M-09', name: 'Cut M-07’s load by 12%, shift that work to M-09, replace the bearing on Sunday',
      when: 'Sun 08:00 maintenance day', tr: T.sun, moved, kind: 'derate', status: 'ok' }, ex, (1 - ex.pFail) * plannedLater, COST.perMove);
    if (moved > s.m09) { o.status = 'infeasible'; o.why = 'capacity'; }
    else if (o.pFail > SAFETY) { o.status = 'blocked'; o.why = 'risk'; }
    opts.push(o);
  }
  { // C — next crew window
    let tr = T.co, overlap = CO_OVERLAP, when = 'Today 14:00 changeover', extra = 0, timing = 'tue14';
    if (!P.kitInStores) { tr = T.kit; overlap = 0; when = 'Thu 10:00, when the kit arrives'; extra = COST.expressKit; timing = 'thu10'; }
    else if (!P.crew14) { tr = T.wed; overlap = 0; when = 'Wed 06:00 shift change'; timing = 'wed06'; }
    const lost = PLAN_DOWN - overlap, moved = +Math.max(0, lost - (T.cutoff - M07_LOAD)).toFixed(2);
    const ex = exposure(P, tr, 1, 0);
    const o = makeOpt({ id: 'C', short: 'Replace in next crew window, move work to M-09', tag: 'Repair in next crew window', name: 'Replace the bearing in the next crew window and move the displaced work to M-09',
      when, tr, overlap, moved, kind: 'planned', timing, status: 'ok' }, ex, (1 - ex.pFail) * (plannedLater + extra), moved > 0 ? COST.perMove : 0);
    if (moved > s.m09) { o.status = 'infeasible'; o.why = 'capacity'; }
    opts.push(o);
  }
  { // D — stop now with outside technician
    const tr = 0.25, moved = +Math.max(0, PLAN_DOWN - (T.cutoff - M07_LOAD)).toFixed(2);
    const ex = exposure(P, tr, 1, 0);
    const o = makeOpt({ id: 'D', short: 'Stop M-07 now, outside technician', tag: 'Stop now, outside technician', name: 'Stop M-07 now, bring in an outside technician and move the displaced work to M-09',
      when: 'Now, 07:45', tr, overlap: 0, moved, kind: 'now', status: 'ok' }, ex, (1 - ex.pFail) * (COST.kit + COST.outsideTech + COST.midBatch + COST.runIn), moved > 0 ? COST.perMove : 0);
    if (!P.kitInStores) { o.status = 'infeasible'; o.why = 'kit'; }
    else if (moved > s.m09) { o.status = 'infeasible'; o.why = 'capacity'; }
    opts.push(o);
  }
  opts.push({ id: 'E', short: 'Send LH knuckles to a job shop', tag: 'Job shop', name: 'Send LH knuckles to an outside job shop', when: '—', status: 'infeasible', why: 'quality', exp: null });

  const base = opts.find(o => o.id === 'A');
  opts.forEach(o => { if (o.exp != null) o.vsBase = base.exp - o.exp; });
  const live = opts.filter(o => o.status === 'ok');
  live.sort((a, b) => P.objective === 'delivery'
    ? ((b.onTime - a.onTime) || (a.exp - b.exp))
    : ((a.exp - b.exp) || (b.onTime - a.onTime)));
  live.forEach((o, i) => { o.rank = i + 1; });
  const best = live.find(o => o.id !== 'A') || base;
  const second = live.filter(o => o.id !== best.id && o.id !== 'A')[0] || null;
  return { P, opts, best, second, base, spare: s, eta: etaDays(P.p5) };
}

/* =====================================================================
   HELPERS
   ===================================================================== */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
const lakh = n => '₹' + (n / 1e5).toFixed(2) + ' L';
const pct = (x, d = 0) => (x * 100).toFixed(d) + '%';
const ot = x => x >= 0.9995 ? '100%' : pct(x, x > 0.99 ? 1 : 0);   // on-time chance, a decimal only near 100%
const hrs = h => (Math.round(h * 10) / 10).toString().replace(/\.0$/, '') + ' h';
const fmtN = n => n.toLocaleString('en-IN');
const fillPct = (v, a, b) => ((v - a) / (b - a) * 100).toFixed(1);
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function istDate(h) { return new Date(BASE_DATE + h * 3600e3 + 5.5 * 3600e3); } // read with UTC getters
function hm(d) { return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); }
function at(h) { const d = istDate(h); return DAYS[d.getUTCDay()] + ' ' + hm(d); }
function dt(h) { const d = istDate(h); return DAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + hm(d); }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* simulated 14-day sensor history for M-07 (hourly) */
const SENSOR = (() => {
  const r = mulberry32(7), n = () => (r() + r() + r() - 1.5) / 1.5;
  const vib = [], temp = [], amp = [];
  for (let h = -336; h <= 0; h++) {
    const w = h < -288 ? 0 : Math.pow((h + 288) / 288, 1.6);
    vib.push({ h, v: 2.10 + 0.80 * w + 0.055 * n() });
    temp.push({ h, v: 42 + 7 * Math.pow(Math.max(0, (h + 288) / 288), 1.3) + 0.45 * n() });
    const spike = h > -120 && r() < 0.035 ? 2.6 + r() : 0;
    amp.push({ h, v: 17.9 + 0.35 * n() + spike });
  }
  // EWMA detection on vibration against the first 48 h baseline
  const b = vib.slice(0, 48).map(p => p.v), mu = b.reduce((s, x) => s + x, 0) / b.length;
  const sd = Math.sqrt(b.reduce((s, x) => s + (x - mu) ** 2, 0) / (b.length - 1)), lam = 0.1;
  const lim = mu + 3 * sd * Math.sqrt(lam / (2 - lam));
  let z = mu, detect = null;
  for (const p of vib) { z = lam * p.v + (1 - lam) * z; if (detect === null && p.h > -320 && z > lim) detect = p.h; }
  // start of the current run where the 6-hour average sits above the 2.8 mm/s alarm limit
  let alarmAt = null;
  for (let i = 5; i < vib.length; i++) {
    let s = 0; for (let j = 0; j < 6; j++) s += vib[i - j].v;
    if (s / 6 > 2.8) { if (alarmAt === null) alarmAt = vib[i].h; } else alarmAt = null;
  }
  const last = vib[vib.length - 1].v;
  return { vib, temp, amp, mu, detect, alarmAt, last, rise: last / mu - 1, tNow: temp[temp.length - 1].v, t0: 42, spikes: amp.filter(p => p.v > 20).length };
})();
const leadDays = () => Math.round(-SENSOR.detect / 24);

/* =====================================================================
   STATE
   ===================================================================== */
const state = {
  step: 1, params: Object.assign({}, DEFAULTS), view: null, viewPinned: false, decision: null, lang: 'en', mode: null,
  focus: null, hlOrder: null, flt: { line: '', status: '' }, sortA: { k: 'risk', d: -1 }, sortO: { k: 'rank', d: 1 }, log: [],
};
let R = evaluate(state.params);
function recompute() { R = evaluate(state.params); if (!state.viewPinned) state.view = R.best.id; }
recompute();
function initLog() {
  const r0 = evaluate(DEFAULTS);
  state.log = [
    { t: dt(SENSOR.detect), who: 'Engine', ev: 'Drift flagged on M-07 spindle vibration (EWMA above its control limit)' },
    { t: dt(SENSOR.alarmAt != null ? SENSOR.alarmAt : -6), who: 'Engine', ev: 'M-07 vibration entered the alarm band, above 2.8 mm/s' },
    { t: dt(0), who: 'Engine', ev: `Failure risk for M-07 set at ${pct(DEFAULTS.p5)} within 5 days` },
    { t: dt(0), who: 'Engine', ev: `5 responses scored against 9 constraints; ${r0.best.id} recommended at ${lakh(r0.best.exp)} against ${lakh(r0.base.exp)} for carrying on` },
    { t: dt(0), who: 'Engine', ev: 'Plan of the Day sent to the plant head on WhatsApp' },
  ];
}
initLog();

