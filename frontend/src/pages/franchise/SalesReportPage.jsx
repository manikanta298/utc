import { useState, useEffect, useCallback } from 'react';
import { Download, TrendingUp, IndianRupee, ShoppingBag, Calendar, Filter } from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import useAuthStore from '../../store/authStore';

const PERIODS = [
  { label: 'Today',      days: 0 },
  { label: 'Last 7 Days',  days: 7 },
  { label: 'Last 30 Days', days: 30 },
  { label: 'Custom',     days: null },
];

const PAY_COLORS = {
  cash:       'text-green-400',
  upi:        'text-blue-400',
  card:       'text-purple-400',
  netbanking: 'text-yellow-400',
};

const fmoney = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

export default function SalesReportPage() {
  const { user } = useAuthStore();
  const isMaster = user?.role === 'master_admin';

  const [period,     setPeriod]     = useState(PERIODS[1]);
  const [startDate,  setStartDate]  = useState('');
  const [endDate,    setEndDate]    = useState('');
  const [data,       setData]       = useState([]);
  const [summary,    setSummary]    = useState({ totalRevenue: 0, totalOrders: 0 });
  const [payReport,  setPayReport]  = useState({ rows: [], summary: {} });
  const [loading,    setLoading]    = useState(false);
  const [downloading, setDownloading] = useState('');

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
        api.get('/reports/payments', { params: { ...range } }),
      ]);
      setData(salesRes.data.data || []);
      setSummary({ totalRevenue: salesRes.data.totalRevenue, totalOrders: salesRes.data.totalOrders });
      setPayReport({ rows: payRes.data.rows || [], summary: payRes.data.summary || {} });
    } catch { toast.error('Failed to load report'); }
    finally { setLoading(false); }
  }, [getDateRange]);

  useEffect(() => { load(); }, [period]);

  const download = async (fmt) => {
    setDownloading(fmt);
    try {
      const range = getDateRange();
      const res = await api.get('/reports/payments', {
        params: { ...range, format: fmt },
        responseType: 'blob',
      });
      const ext  = fmt === 'excel' ? 'xlsx' : fmt;
      const name = `sales-report-${range.startDate}-to-${range.endDate}.${ext}`;
      const url  = URL.createObjectURL(res.data);
      const a    = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Download failed'); }
    finally { setDownloading(''); }
  };

  const paySummary = payReport.summary;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <TrendingUp size={20} className="text-brand-400" /> Sales Report
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Daily collection overview & payment breakdown</p>
        </div>

        {/* Download buttons */}
        <div className="flex gap-2">
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
          <div className="relative">
            <button
              onClick={() => download('excel')}
              disabled={!!downloading}
              className="btn-primary flex items-center gap-2 text-sm px-4 py-2 rounded-xl"
            >
              {downloading === 'excel'
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <Download size={14} />}
              Excel Report
            </button>
          </div>
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

      {/* ── Period selector ── */}
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
          <div className="flex gap-2 ml-2">
            <input className="input text-xs py-1.5 w-36" type="date" value={startDate}
              onChange={(e) => setStartDate(e.target.value)} />
            <span className="text-gray-600 self-center">to</span>
            <input className="input text-xs py-1.5 w-36" type="date" value={endDate}
              onChange={(e) => setEndDate(e.target.value)} />
            <button onClick={load} className="btn-primary text-xs px-3 py-1.5 rounded-lg flex items-center gap-1">
              <Filter size={12} /> Apply
            </button>
          </div>
        )}
        <button onClick={load} className="ml-auto text-xs text-gray-600 hover:text-gray-400 flex items-center gap-1">
          <Calendar size={12} /> Refresh
        </button>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Revenue',    value: fmoney(summary.totalRevenue),    icon: IndianRupee, color: 'text-green-400' },
          { label: 'Total Orders',     value: summary.totalOrders,             icon: ShoppingBag, color: 'text-brand-400' },
          { label: 'Coupon Discount',  value: fmoney(summary.couponDiscount || 0), icon: IndianRupee, color: 'text-red-400' },
          { label: 'Coupons Used',     value: summary.couponCount || 0,        icon: ShoppingBag, color: 'text-yellow-400' },
          { label: 'Cash Collections', value: fmoney(paySummary.Cash),       icon: IndianRupee, color: 'text-green-400' },
          { label: 'UPI Collections',  value: fmoney(paySummary.UPI),        icon: IndianRupee, color: 'text-blue-400' },
        ].map((c) => (
          <div key={c.label} className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <c.icon size={14} className={c.color} />
              <span className="text-xs text-gray-500">{c.label}</span>
            </div>
            <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* ── Payment method breakdown ── */}
      <div className="card p-5">
        <h3 className="text-sm font-bold text-white mb-4">Payment Method Breakdown</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Cash',        key: 'Cash',        emoji: '💵' },
            { label: 'UPI',         key: 'UPI',         emoji: '📱' },
            { label: 'Card/Swipe',  key: 'Card',        emoji: '💳' },
            { label: 'Net Banking', key: 'Net Banking', emoji: '🏦' },
          ].map(({ label, key, emoji }) => {
            const rows  = payReport.rows.filter((r) => r.paymentType === key);
            const total = rows.reduce((s, r) => s + (r.finalAmount || 0), 0);
            const count = rows.length;
            const pct   = summary.totalRevenue > 0 ? Math.round((total / summary.totalRevenue) * 100) : 0;
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

      {/* ── Daily breakdown table ── */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-dark-600">
          <h3 className="text-sm font-bold text-white">Daily Sales Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-600">
                {['Date', 'Orders', 'Cash', 'UPI', 'Card', 'Total'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-4 bg-dark-600 rounded animate-pulse" /></td></tr>
                ))
              ) : data.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-600">No data for selected period</td></tr>
              ) : (
                [...data].reverse().map((row) => (
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
        {!loading && data.length > 0 && (
          <div className="px-4 py-3 border-t border-dark-600 flex justify-between text-sm font-bold">
            <span className="text-gray-400">Grand Total</span>
            <span className="text-white">{fmoney(summary.totalRevenue)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
