import { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from 'recharts';
import { TrendingUp, Package, IndianRupee, ShoppingCart, Download } from 'lucide-react';
import api from '../../lib/api';
import useAuthStore from '../../store/authStore';

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week',  label: 'This Week' },
  { value: 'month', label: 'This Month' },
];

const ITEM_COLORS = ['#f97316', '#ea580c', '#fb923c', '#fdba74', '#c2410c'];

const StatCard = ({ icon: Icon, label, value, color = 'text-brand-400' }) => (
  <div className="stat-card animate-slide-up">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-dark-600 ${color}`}>
      <Icon size={20} />
    </div>
    <div className="mt-3">
      <div className="text-2xl font-bold text-white font-mono">{value}</div>
      <div className="text-sm text-gray-500 mt-0.5">{label}</div>
    </div>
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dark-700 border border-dark-500 rounded-xl p-3 text-xs shadow-lg">
      <div className="text-gray-400 mb-1 font-medium">{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}</span>
          <span className="font-semibold">{p.dataKey === 'totalRevenue' ? `₹${Number(p.value).toLocaleString('en-IN')}` : p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function FastMovingItemsPage() {
  const { user } = useAuthStore();
  const isMaster = user?.role === 'master_admin';

  const [data, setData]             = useState(null);
  const [period, setPeriod]         = useState('week');
  const [loading, setLoading]       = useState(true);
  const [franchises, setFranchises] = useState([]);
  const [selectedFranchise, setSelectedFranchise] = useState('');
  const [activeTab, setActiveTab]   = useState('bar'); // 'bar' | 'trend' | 'table'

  // Fetch franchise list for master_admin filter
  useEffect(() => {
    if (!isMaster) return;
    api.get('/franchises').then((r) => setFranchises(r.data.data || [])).catch(() => {});
  }, [isMaster]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period, limit: 10 });
      if (isMaster && selectedFranchise) params.append('franchiseId', selectedFranchise);
      const res = await api.get(`/dashboard/fast-moving?${params}`);
      setData(res.data.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [period, selectedFranchise, isMaster]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build trend chart data: pivot trendData into date-keyed rows
  const trendChartData = (() => {
    if (!data?.trendData?.length) return [];
    const dateMap = {};
    data.trendData.forEach(({ _id: { date, item }, qty }) => {
      if (!dateMap[date]) dateMap[date] = { date };
      dateMap[date][item] = (dateMap[date][item] || 0) + qty;
    });
    return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
  })();

  const top5Names = data?.topItems?.slice(0, 5).map((i) => i.name) || [];

  const totalQty     = data?.topItems?.reduce((s, i) => s + i.totalQty, 0) || 0;
  const totalRevenue = data?.topItems?.reduce((s, i) => s + i.totalRevenue, 0) || 0;

  // Export CSV
  const exportCSV = () => {
    if (!data?.topItems?.length) return;
    const rows = [
      ['Rank', 'Item Name', 'Qty Sold', 'Revenue (₹)', 'Order Count'],
      ...data.topItems.map((item, i) => [
        i + 1, item.name, item.totalQty,
        item.totalRevenue.toFixed(2), item.orderCount,
      ]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fast-moving-items-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <TrendingUp size={22} className="text-brand-400" />
            Fast Moving Items
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Top selling items with analytics</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Franchise filter — master only */}
          {isMaster && (
            <select
              value={selectedFranchise}
              onChange={(e) => setSelectedFranchise(e.target.value)}
              className="bg-dark-700 border border-dark-500 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500"
            >
              <option value="">All Franchises</option>
              {franchises.map((f) => (
                <option key={f._id} value={f._id}>{f.name}</option>
              ))}
            </select>
          )}

          {/* Period tabs */}
          <div className="flex bg-dark-700 rounded-lg p-1 gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  period === p.value
                    ? 'bg-brand-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-2 text-xs bg-dark-700 border border-dark-500 text-gray-300 rounded-lg hover:text-white hover:border-brand-500 transition-colors"
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Package}     label="Unique Items Sold"   value={data?.topItems?.length || 0} />
            <StatCard icon={ShoppingCart} label="Total Units Sold"   value={totalQty.toLocaleString('en-IN')} />
            <StatCard icon={IndianRupee}  label="Total Revenue"      value={`₹${totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} color="text-green-400" />
            <StatCard icon={TrendingUp}   label="Top Item"           value={data?.topItems?.[0]?.name?.split(' ').slice(0, 2).join(' ') || '—'} color="text-yellow-400" />
          </div>

          {/* Chart tabs */}
          <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4 lg:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white">Analytics</h2>
              <div className="flex bg-dark-700 rounded-lg p-1 gap-1">
                {[
                  { id: 'bar',   label: 'Top Items' },
                  { id: 'trend', label: 'Trend' },
                  { id: 'table', label: 'Table' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      activeTab === t.id ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Bar chart — items by qty */}
            {activeTab === 'bar' && (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={data?.topItems?.map((item) => ({ name: item.name, Qty: item.totalQty, Revenue: item.totalRevenue }))}
                  margin={{ top: 5, right: 20, left: 0, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" />
                  <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12, paddingTop: 16 }} />
                  <Bar dataKey="Qty" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}

            {/* Line chart — daily trend */}
            {activeTab === 'trend' && (
              trendChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={trendChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" />
                    <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                    {top5Names.map((name, i) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stroke={ITEM_COLORS[i]}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
                  Not enough data to show trend
                </div>
              )
            )}

            {/* Table view */}
            {activeTab === 'table' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-600">
                      <th className="text-left py-3 px-2 text-gray-400 font-medium">#</th>
                      <th className="text-left py-3 px-2 text-gray-400 font-medium">Item</th>
                      <th className="text-right py-3 px-2 text-gray-400 font-medium">Qty Sold</th>
                      <th className="text-right py-3 px-2 text-gray-400 font-medium">Revenue</th>
                      <th className="text-right py-3 px-2 text-gray-400 font-medium">Orders</th>
                      <th className="text-right py-3 px-2 text-gray-400 font-medium">Avg/Order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.topItems?.map((item, i) => (
                      <tr key={item._id} className="border-b border-dark-700 hover:bg-dark-700/50 transition-colors">
                        <td className="py-3 px-2">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            i === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                            i === 1 ? 'bg-gray-500/20 text-gray-300' :
                            i === 2 ? 'bg-orange-700/20 text-orange-400' :
                            'bg-dark-600 text-gray-500'
                          }`}>
                            {i + 1}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-white font-medium">{item.name}</td>
                        <td className="py-3 px-2 text-right font-mono text-brand-400">{item.totalQty}</td>
                        <td className="py-3 px-2 text-right font-mono text-green-400">
                          ₹{item.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </td>
                        <td className="py-3 px-2 text-right text-gray-400">{item.orderCount}</td>
                        <td className="py-3 px-2 text-right text-gray-400">
                          {item.orderCount > 0 ? (item.totalQty / item.orderCount).toFixed(1) : '—'}
                        </td>
                      </tr>
                    ))}
                    {!data?.topItems?.length && (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-gray-500">No data for this period</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Master Admin — per-franchise breakdown */}
          {isMaster && !selectedFranchise && data?.franchiseBreakdown?.length > 0 && (
            <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4 lg:p-6">
              <h2 className="text-sm font-semibold text-white mb-4">Franchise Breakdown</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-600">
                      <th className="text-left py-2 px-2 text-gray-400 font-medium">Franchise</th>
                      <th className="text-left py-2 px-2 text-gray-400 font-medium">Code</th>
                      <th className="text-right py-2 px-2 text-gray-400 font-medium">Orders</th>
                      <th className="text-right py-2 px-2 text-gray-400 font-medium">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.franchiseBreakdown.map((f) => (
                      <tr key={f._id} className="border-b border-dark-700 hover:bg-dark-700/50 transition-colors">
                        <td className="py-2 px-2 text-white">{f.franchiseName}</td>
                        <td className="py-2 px-2 text-gray-400 font-mono text-xs">{f.franchiseCode}</td>
                        <td className="py-2 px-2 text-right text-brand-400 font-mono">{f.totalOrders}</td>
                        <td className="py-2 px-2 text-right text-green-400 font-mono">
                          ₹{f.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
