import { useState, useEffect, useCallback } from 'react';
import {
  Download, TrendingUp, IndianRupee, ShoppingBag,
  Calendar, Filter, FileText, Package,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import useAuthStore from '../../store/authStore';

// ── constants ────────────────────────────────────────────────────────────────

const PERIODS = [
  { label: 'Today',        days: 0    },
  { label: 'Last 7 Days',  days: 7    },
  { label: 'Last 30 Days', days: 30   },
  { label: 'Custom',       days: null },
];

const PAYMENT_TYPES = ['all', 'Cash', 'UPI', 'Card', 'Net Banking', 'Other'];

const ITEM_PERIODS = [
  { value: 'today', label: 'Today'      },
  { value: 'week',  label: 'This Week'  },
  { value: 'month', label: 'This Month' },
];

const METHOD_COLORS = {
  Cash:          'text-green-400',
  UPI:           'text-blue-400',
  Card:          'text-purple-400',
  'Net Banking': 'text-yellow-400',
  Other:         'text-gray-300',
  Pending:       'text-red-400',
};

const fmoney = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const TABS = ['Sales Overview', 'Payment Reports', 'Order Reports'];

// ── component ─────────────────────────────────────────────────────────────────

export default function UnifiedReportPage() {
  const { user } = useAuthStore();
  const isMaster = user?.role === 'master_admin';

  // tab
  const [activeTab, setActiveTab] = useState(0);

  // date range
  const [period,    setPeriod]    = useState(PERIODS[1]);
  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate]   = useState('');

  // payment filter (for Payment Reports & Order Reports tabs)
  const [paymentMethod, setPaymentMethod] = useState('all');

  // most-ordered items (Order Reports tab)
  const [itemPeriod,       setItemPeriod]       = useState('week');
  const [itemFranchiseId,  setItemFranchiseId]  = useState('');
  const [itemLimit,        setItemLimit]         = useState(10);
  const [topItems,         setTopItems]          = useState([]);
  const [itemsLoading,     setItemsLoading]      = useState(false);
  const [franchises,       setFranchises]        = useState([]);
  const [itemsDownloading, setItemsDownloading]  = useState(false);

  // data
  const [salesData,   setSalesData]   = useState([]);
  const [salesSummary, setSalesSummary] = useState({ totalRevenue: 0, totalOrders: 0 });
  const [payRows,     setPayRows]     = useState([]);
  const [paySummary,  setPaySummary]  = useState({});

  const [loading,     setLoading]     = useState(false);
  const [downloading, setDownloading] = useState('');

  // ── helpers ─────────────────────────────────────────────────────────────────

  const getDateRange = useCallback(() => {
    if (period.days === null) return { startDate, endDate };
    const end   = format(new Date(), 'yyyy-MM-dd');
    const start = period.days === 0
      ? end
      : format(subDays(new Date(), period.days), 'yyyy-MM-dd');
    return { startDate: start, endDate: end };
  }, [period, startDate, endDate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const range = getDateRange();
      const [salesRes, payRes] = await Promise.all([
        api.get('/reports/sales', { params: { period: 'daily', ...range } }),
        api.get('/reports/payments', { params: { ...range, paymentMethod } }),
      ]);
      setSalesData(salesRes.data.data || []);
      setSalesSummary({
        totalRevenue:   salesRes.data.totalRevenue  || 0,
        totalOrders:    salesRes.data.totalOrders   || 0,
        couponDiscount: salesRes.data.couponDiscount || 0,
        couponCount:    salesRes.data.couponCount    || 0,
      });
      setPayRows(payRes.data.rows || []);
      setPaySummary(payRes.data.summary || {});
    } catch {
      toast.error('Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [getDateRange, paymentMethod]);

  useEffect(() => { load(); }, [period]);

  // Load franchise list for master_admin item filter
  useEffect(() => {
    if (!isMaster) return;
    api.get('/franchises').then((r) => setFranchises(r.data.franchises || [])).catch(() => {});
  }, [isMaster]);

  // Load most-ordered items
  const loadItems = useCallback(async () => {
    setItemsLoading(true);
    try {
      const params = new URLSearchParams({ period: itemPeriod, limit: itemLimit });
      if (isMaster && itemFranchiseId) params.append('franchiseId', itemFranchiseId);
      const res = await api.get(`/dashboard/fast-moving?${params}`);
      setTopItems(res.data.data?.topItems || []);
    } catch {
      toast.error('Failed to load item data');
    } finally {
      setItemsLoading(false);
    }
  }, [itemPeriod, itemFranchiseId, itemLimit, isMaster]);

  useEffect(() => { loadItems(); }, [itemPeriod, itemFranchiseId, itemLimit]);

  // ── download ─────────────────────────────────────────────────────────────────

  const download = async (fmt) => {
    setDownloading(fmt);
    try {
      const range = getDateRange();
      const res = await api.get('/reports/payments', {
        params: { ...range, paymentMethod, format: fmt },
        responseType: 'blob',
      });
      const ext  = fmt === 'excel' ? 'xlsx' : fmt;
      const name = `unified-report-${range.startDate}-to-${range.endDate}.${ext}`;
      const url  = URL.createObjectURL(res.data);
      const a    = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
      toast.success('Report downloaded');
    } catch {
      toast.error('Download failed');
    } finally {
      setDownloading('');
    }
  };

  // ── download items CSV ────────────────────────────────────────────────────────

  const downloadItemsCSV = () => {
    if (!topItems.length) { toast.error('No data to download'); return; }
    setItemsDownloading(true);
    try {
      const header = ['Rank', 'Item Name', 'Qty Sold', 'Revenue (Rs.)', 'Order Count'];
      const rows = topItems.map((item, i) => [
        i + 1,
        `"${item.name}"`,
        item.totalQty,
        Number(item.totalRevenue || 0).toFixed(2),
        item.orderCount,
      ]);
      const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const franchise = franchises.find((f) => f._id === itemFranchiseId);
      const label = franchise ? `-${franchise.franchiseCode}` : '-all';
      a.href     = url;
      a.download = `top-items${label}-${itemPeriod}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Download started');
    } catch {
      toast.error('Download failed');
    } finally {
      setItemsDownloading(false);
    }
  };

  // ── filtered pay rows ────────────────────────────────────────────────────────

  const filteredPayRows = paymentMethod === 'all'
    ? payRows
    : payRows.filter((r) => r.paymentType === paymentMethod);

  // ── summary cards data ───────────────────────────────────────────────────────

  const summaryCards = [
    { label: 'Total Revenue',    value: fmoney(salesSummary.totalRevenue),    icon: IndianRupee, color: 'text-green-400'  },
    { label: 'Total Orders',     value: salesSummary.totalOrders,             icon: ShoppingBag, color: 'text-brand-400'  },
    { label: 'Coupon Discount',  value: fmoney(salesSummary.couponDiscount),  icon: IndianRupee, color: 'text-red-400'    },
    { label: 'Coupons Used',     value: salesSummary.couponCount || 0,        icon: ShoppingBag, color: 'text-yellow-400' },
    { label: 'Cash Collections', value: fmoney(paySummary.Cash),              icon: IndianRupee, color: 'text-green-400'  },
    { label: 'UPI Collections',  value: fmoney(paySummary.UPI),               icon: IndianRupee, color: 'text-blue-400'   },
    { label: 'Pending',          value: fmoney(paySummary.Pending),           icon: IndianRupee, color: 'text-red-400'    },
  ];

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Page Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <FileText size={20} className="text-brand-400" />
            Reports
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Unified view — Sales, Payments &amp; Orders
          </p>
        </div>

        {/* Download buttons */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => download('csv')}
            disabled={!!downloading}
            className="btn-ghost flex items-center gap-2 text-sm px-3 py-2 rounded-xl border border-dark-600"
          >
            {downloading === 'csv'
              ? <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              : <Download size={14} />}
            CSV
          </button>
          <button
            onClick={() => download('excel')}
            disabled={!!downloading}
            className="btn-primary flex items-center gap-2 text-sm px-4 py-2 rounded-xl"
          >
            {downloading === 'excel'
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Download size={14} />}
            Excel
          </button>
          <button
            onClick={() => download('pdf')}
            disabled={!!downloading}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
          >
            {downloading === 'pdf'
              ? <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
              : <Download size={14} />}
            PDF
          </button>
        </div>
      </div>

      {/* ── Period Selector ── */}
      <div className="flex flex-wrap gap-2 items-center">
        {PERIODS.map((p) => (
          <button
            key={p.label}
            onClick={() => setPeriod(p)}
            className={[
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border',
              period.label === p.label
                ? 'border-brand-500/40 bg-brand-500/15 text-brand-400'
                : 'border-dark-600 bg-dark-700 text-gray-500 hover:text-gray-300',
            ].join(' ')}
          >
            {p.label}
          </button>
        ))}
        {period.days === null && (
          <div className="flex gap-2 ml-2 flex-wrap">
            <input
              className="input text-xs py-1.5 w-36"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <span className="text-gray-600 self-center">to</span>
            <input
              className="input text-xs py-1.5 w-36"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            <button
              onClick={load}
              className="btn-primary text-xs px-3 py-1.5 rounded-lg flex items-center gap-1"
            >
              <Filter size={12} /> Apply
            </button>
          </div>
        )}
        <button
          onClick={load}
          className="ml-auto text-xs text-gray-600 hover:text-gray-400 flex items-center gap-1"
        >
          <Calendar size={12} /> Refresh
        </button>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {summaryCards.map((c) => (
          <div key={c.label} className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <c.icon size={14} className={c.color} />
              <span className="text-xs text-gray-500">{c.label}</span>
            </div>
            <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-dark-600">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={[
              'px-4 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px',
              activeTab === i
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-gray-500 hover:text-gray-300',
            ].join(' ')}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════
          TAB 0 — Sales Overview
      ══════════════════════════════════════════════════════ */}
      {activeTab === 0 && (
        <div className="space-y-5">
          {/* Payment method breakdown */}
          <div className="card p-5">
            <h3 className="text-sm font-bold text-white mb-4">Payment Method Breakdown</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Cash',        key: 'Cash',          emoji: '💵' },
                { label: 'UPI',         key: 'UPI',           emoji: '📱' },
                { label: 'Card/Swipe',  key: 'Card',          emoji: '💳' },
                { label: 'Net Banking', key: 'Net Banking',   emoji: '🏦' },
              ].map(({ label, key, emoji }) => {
                const rows  = payRows.filter((r) => r.paymentType === key);
                const total = rows.reduce((s, r) => s + (r.finalAmount || 0), 0);
                const count = rows.length;
                const pct   = salesSummary.totalRevenue > 0
                  ? Math.round((total / salesSummary.totalRevenue) * 100)
                  : 0;
                return (
                  <div key={key} className="rounded-xl border border-dark-600 bg-dark-800 p-3 space-y-2">
                    <div className="text-base">{emoji}</div>
                    <div className="text-xs text-gray-500">{label}</div>
                    <div className="text-lg font-bold text-white">{fmoney(total)}</div>
                    <div className="text-xs text-gray-600">{count} transactions</div>
                    <div className="h-1.5 rounded-full bg-dark-600 overflow-hidden">
                      <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-[10px] text-gray-600">{pct}% of total</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Daily sales table */}
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-dark-600">
              <h3 className="text-sm font-bold text-white">Daily Sales Breakdown</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-600">
                    {['Date', 'Orders', 'Cash', 'UPI', 'Card', 'Total'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700">
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i}>
                        <td colSpan={6} className="px-4 py-3">
                          <div className="h-4 bg-dark-600 rounded animate-pulse" />
                        </td>
                      </tr>
                    ))
                  ) : salesData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-600">
                        No data for selected period
                      </td>
                    </tr>
                  ) : (
                    [...salesData].reverse().map((row) => (
                      <tr key={row.date} className="hover:bg-dark-700/30 transition-colors">
                        <td className="px-4 py-3 text-gray-300 text-xs whitespace-nowrap">
                          {format(new Date(row.date), 'EEE, dd MMM')}
                        </td>
                        <td className="px-4 py-3 text-brand-400 font-semibold">{row.orders}</td>
                        <td className="px-4 py-3 text-green-400 text-xs">{fmoney(row.cash)}</td>
                        <td className="px-4 py-3 text-blue-400 text-xs">{fmoney(row.upi)}</td>
                        <td className="px-4 py-3 text-purple-400 text-xs">{fmoney(row.card)}</td>
                        <td className="px-4 py-3 text-white font-bold text-xs">{fmoney(row.total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {!loading && salesData.length > 0 && (
              <div className="px-4 py-3 border-t border-dark-600 flex justify-between text-sm font-bold">
                <span className="text-gray-400">Grand Total</span>
                <span className="text-white">{fmoney(salesSummary.totalRevenue)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB 1 — Payment Reports  (per-session payment rows)
      ══════════════════════════════════════════════════════ */}
      {activeTab === 1 && (
        <div className="space-y-4">
          {/* Payment type filter */}
          <div className="card p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="label">Payment Method</label>
              <select
                className="input"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                {PAYMENT_TYPES.map((m) => (
                  <option key={m} value={m}>
                    {m === 'all' ? 'All Methods' : m}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={load}
              className="btn-primary px-4 py-2 rounded-xl text-sm flex items-center gap-2"
            >
              <Filter size={14} /> Apply
            </button>
          </div>

          {/* Payment summary bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            {[
              { label: 'Total',       amount: paySummary.total,          color: 'text-white'        },
              { label: 'Cash',        amount: paySummary.Cash,           color: 'text-green-400'    },
              { label: 'UPI',         amount: paySummary.UPI,            color: 'text-blue-400'     },
              { label: 'Card',        amount: paySummary.Card,           color: 'text-purple-400'   },
              { label: 'Net Banking', amount: paySummary['Net Banking'], color: 'text-yellow-400'   },
              { label: 'Other',       amount: paySummary.Other,          color: 'text-gray-300'     },
              { label: 'Pending',     amount: paySummary.Pending,        color: 'text-red-400'      },
            ].map((card) => (
              <div key={card.label} className="card p-4">
                <div className="text-xs text-gray-500 mb-1">{card.label}</div>
                <div className={`text-xl font-bold ${card.color}`}>
                  ₹ {(card.amount || 0).toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          {/* Payment transactions table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-600">
                    {['Token/Ref', 'Franchise', 'Customer', 'Mobile', 'Method',
                      'Original', 'Discount', 'Paid', 'Status', 'Date'].map((h) => (
                      <th
                        key={h}
                        className="text-left px-3 py-3 text-xs text-gray-500 uppercase tracking-wider whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700">
                  {filteredPayRows.map((row, i) => (
                    <tr key={i} className="hover:bg-dark-700/30 transition-colors">
                      <td className="px-3 py-2 text-brand-400 font-mono text-xs whitespace-nowrap">
                        {row.tokenNumber || row.sessionRef}
                      </td>
                      <td className="px-3 py-2 text-gray-300 text-xs whitespace-nowrap">{row.franchise}</td>
                      <td className="px-3 py-2 text-gray-300 text-xs">{row.customerName || '—'}</td>
                      <td className="px-3 py-2 text-gray-400 text-xs">{row.mobile}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className={METHOD_COLORS[row.paymentType] || 'text-gray-400'}>
                          {row.paymentType}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-300 text-xs whitespace-nowrap">
                        ₹ {Number(row.originalAmount || 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-red-400 text-xs">
                        {row.discount > 0 ? `-₹ ${Number(row.discount).toFixed(2)}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-green-400 font-semibold text-xs whitespace-nowrap">
                        ₹ {Number(row.finalAmount || 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span className={
                          row.paymentStatus === 'fully_paid'
                            ? 'text-green-400'
                            : row.paymentStatus === 'unpaid'
                            ? 'text-red-400'
                            : 'text-yellow-400'
                        }>
                          {row.paymentStatus?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">
                        {row.date ? format(new Date(row.date), 'dd MMM HH:mm') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && filteredPayRows.length === 0 && (
                <div className="text-center py-12 text-gray-500">No payment records found</div>
              )}
              {loading && (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB 2 — Order Reports  (order-level view + top items)
      ══════════════════════════════════════════════════════ */}
      {activeTab === 2 && (
        <div className="space-y-4">
          {/* Order summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: 'Total Orders',   value: salesSummary.totalOrders,            color: 'text-brand-400'  },
              { label: 'Total Revenue',  value: fmoney(salesSummary.totalRevenue),   color: 'text-green-400'  },
              { label: 'Avg Order Value',
                value: salesSummary.totalOrders
                  ? fmoney(salesSummary.totalRevenue / salesSummary.totalOrders)
                  : fmoney(0),
                color: 'text-yellow-400' },
            ].map((c) => (
              <div key={c.label} className="card p-4">
                <div className="text-xs text-gray-500 mb-1">{c.label}</div>
                <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Per-day order breakdown */}
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-dark-600">
              <h3 className="text-sm font-bold text-white">Order Breakdown by Day</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-600">
                    {['Date', 'Orders', 'Cash', 'UPI', 'Card', 'Day Total'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700">
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i}>
                        <td colSpan={6} className="px-4 py-3">
                          <div className="h-4 bg-dark-600 rounded animate-pulse" />
                        </td>
                      </tr>
                    ))
                  ) : salesData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-600">
                        No orders found for selected period
                      </td>
                    </tr>
                  ) : (
                    [...salesData].reverse().map((row) => (
                      <tr key={row.date} className="hover:bg-dark-700/30 transition-colors">
                        <td className="px-4 py-3 text-gray-300 text-xs whitespace-nowrap">
                          {format(new Date(row.date), 'EEE, dd MMM yyyy')}
                        </td>
                        <td className="px-4 py-3 text-brand-400 font-bold">{row.orders}</td>
                        <td className="px-4 py-3 text-green-400 text-xs">{fmoney(row.cash)}</td>
                        <td className="px-4 py-3 text-blue-400 text-xs">{fmoney(row.upi)}</td>
                        <td className="px-4 py-3 text-purple-400 text-xs">{fmoney(row.card)}</td>
                        <td className="px-4 py-3 text-white font-bold text-xs">{fmoney(row.total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {!loading && salesData.length > 0 && (
              <div className="px-4 py-3 border-t border-dark-600 flex justify-between text-sm font-bold">
                <span className="text-gray-400">Grand Total</span>
                <span className="text-white">{fmoney(salesSummary.totalRevenue)}</span>
              </div>
            )}
          </div>

          {/* ── Most Ordered & Repeated Items ── */}
          <div className="card overflow-hidden">
            {/* Section header + download */}
            <div className="p-4 border-b border-dark-600 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Package size={16} className="text-brand-400" />
                <h3 className="text-sm font-bold text-white">Most Ordered &amp; Repeated Items</h3>
              </div>
              <button
                onClick={downloadItemsCSV}
                disabled={itemsDownloading || itemsLoading || !topItems.length}
                className="btn-primary flex items-center gap-2 text-xs px-3 py-1.5 rounded-xl"
              >
                {itemsDownloading
                  ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Download size={13} />}
                Download CSV
              </button>
            </div>

            {/* Item filters */}
            <div className="px-4 py-3 border-b border-dark-600 flex flex-wrap gap-3 items-end">
              {/* Period buttons */}
              <div>
                <label className="label">Period</label>
                <div className="flex gap-1">
                  {ITEM_PERIODS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setItemPeriod(p.value)}
                      className={[
                        'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                        itemPeriod === p.value
                          ? 'border-brand-500/40 bg-brand-500/15 text-brand-400'
                          : 'border-dark-600 bg-dark-700 text-gray-500 hover:text-gray-300',
                      ].join(' ')}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Franchise filter — master_admin only */}
              {isMaster && (
                <div>
                  <label className="label">Franchise</label>
                  <select
                    className="input text-xs"
                    value={itemFranchiseId}
                    onChange={(e) => setItemFranchiseId(e.target.value)}
                  >
                    <option value="">All Franchises</option>
                    {franchises.map((f) => (
                      <option key={f._id} value={f._id}>
                        {f.name} ({f.franchiseCode})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Top N limit */}
              <div>
                <label className="label">Show Top</label>
                <select
                  className="input text-xs"
                  value={itemLimit}
                  onChange={(e) => setItemLimit(Number(e.target.value))}
                >
                  {[5, 10, 20, 50].map((n) => (
                    <option key={n} value={n}>Top {n}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={loadItems}
                className="btn-primary text-xs px-3 py-2 rounded-xl flex items-center gap-1"
              >
                <Filter size={12} /> Apply
              </button>
            </div>

            {/* Items table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-600">
                    {['#', 'Item Name', 'Qty Sold', 'Revenue', 'Order Count', 'Avg per Order'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700">
                  {itemsLoading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i}>
                        <td colSpan={6} className="px-4 py-3">
                          <div className="h-4 bg-dark-600 rounded animate-pulse" />
                        </td>
                      </tr>
                    ))
                  ) : topItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-600">
                        No item data for selected filters
                      </td>
                    </tr>
                  ) : (
                    topItems.map((item, i) => {
                      const avgPerOrder = item.orderCount > 0
                        ? (item.totalQty / item.orderCount).toFixed(1)
                        : '—';
                      return (
                        <tr key={item._id || i} className="hover:bg-dark-700/30 transition-colors">
                          <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                            {i + 1}
                          </td>
                          <td className="px-4 py-3 text-white font-medium text-xs">
                            {item.name}
                          </td>
                          <td className="px-4 py-3 text-brand-400 font-bold text-xs">
                            {item.totalQty}
                          </td>
                          <td className="px-4 py-3 text-green-400 text-xs">
                            {fmoney(item.totalRevenue)}
                          </td>
                          <td className="px-4 py-3 text-yellow-400 text-xs">
                            {item.orderCount}
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs">
                            {avgPerOrder}x
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
