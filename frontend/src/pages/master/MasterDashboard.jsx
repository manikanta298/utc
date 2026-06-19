import React, { useEffect, useState, useRef } from 'react';
import { Store, Users, ShoppingBag, TrendingUp, IndianRupee, Receipt } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import api from '../../lib/api';
import { format } from 'date-fns';
import { getSocket, joinAdminRoom } from '../../lib/socket';

const StatCard = ({ icon: Icon, label, value, sub, color = 'text-brand-400' }) => (
  <div className="stat-card animate-slide-up">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-dark-600 ${color}`}>
      <Icon size={20} />
    </div>
    <div className="mt-3">
      <div className="text-2xl font-bold text-white font-mono">{value}</div>
      <div className="text-sm text-gray-500 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-600 mt-1">{sub}</div>}
    </div>
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dark-700 border border-dark-500 rounded-xl p-3 text-xs">
      <div className="text-gray-400 mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name}: ₹{Number(p.value).toLocaleString('en-IN')}
        </div>
      ))}
    </div>
  );
};

export default function MasterDashboard() {
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(true);
  const [liveOrderCount, setLiveOrderCount] = useState(0);
  const liveRef = useRef(0);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/dashboard/master?period=${period}`);
        setData(res.data.data);
        liveRef.current = 0;
        setLiveOrderCount(0);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    fetch();
  }, [period]);

  // Real-time: join admin room + increment counter when any franchise gets a new order
  useEffect(() => {
    joinAdminRoom();   // FIX: was never joining — events were never received
    const socket = getSocket();
    if (!socket) return;
    const onNewOrder = () => {
      liveRef.current += 1;
      setLiveOrderCount(liveRef.current);
    };
    socket.on('order:placed', onNewOrder);
    socket.on('order:new',    onNewOrder);
    return () => {
      socket.off('order:placed', onNewOrder);
      socket.off('order:new',    onNewOrder);
    };
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const { totalFranchises, totalCustomers, totalOrders, totalRevenue, franchisePerformance, revenueTrend, gstConsolidated, recentOrders } = data || {};

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="section-title">Master Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Consolidated view across all franchises</p>
        </div>
        <div className="flex gap-2">
          {['today', 'week', 'month', 'year'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${period === p ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-500 hover:text-white'}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Store} label="Active Franchises" value={totalFranchises || 0} />
        <StatCard icon={Users} label="Total Customers" value={(totalCustomers || 0).toLocaleString()} color="text-blue-400" />
        <StatCard icon={ShoppingBag} label="Orders" value={((totalOrders || 0) + liveOrderCount).toLocaleString()} sub={liveOrderCount > 0 ? `+${liveOrderCount} live` : `Period: ${period}`} color="text-green-400" />
        <StatCard icon={IndianRupee} label="Revenue" value={`₹${((totalRevenue || 0) / 1000).toFixed(1)}K`} color="text-purple-400" />
      </div>

      {/* Revenue trend chart */}
      <div className="card p-6">
        <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
          <TrendingUp size={18} className="text-brand-400" /> Revenue Trend (Last 30 Days)
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={revenueTrend || []}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" />
            <XAxis dataKey="_id" tick={{ fill: '#555', fontSize: 11 }} tickLine={false} axisLine={false}
              tickFormatter={(v) => v ? format(new Date(v), 'dd MMM') : ''} />
            <YAxis tick={{ fill: '#555', fontSize: 11 }} tickLine={false} axisLine={false}
              tickFormatter={(v) => `₹${(v/1000).toFixed(0)}K`} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#f97316" strokeWidth={2} fill="url(#revGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Franchise performance */}
        <div className="card p-6">
          <h3 className="font-semibold text-white mb-4">Franchise Performance</h3>
          <div className="space-y-3">
            {(franchisePerformance || []).map((f, i) => {
              const maxRev = Math.max(...(franchisePerformance || []).map((x) => x.revenue), 1);
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-7 h-7 bg-dark-600 rounded-lg flex items-center justify-center text-xs font-bold text-brand-400 flex-shrink-0">
                    {f.franchiseCode}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-300 truncate">{f.franchiseName}</span>
                      <span className="text-brand-400 font-mono">₹{Number(f.revenue).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="h-1.5 bg-dark-600 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-full transition-all duration-700"
                        style={{ width: `${(f.revenue / maxRev) * 100}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">{f.orders} orders</div>
                  </div>
                </div>
              );
            })}
            {!franchisePerformance?.length && (
              <div className="text-center text-gray-600 py-8 text-sm">No data for this period</div>
            )}
          </div>
        </div>

        {/* GST Summary */}
        <div className="card p-6">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Receipt size={16} className="text-brand-400" /> GST Liability Summary
          </h3>
          <div className="space-y-2">
            {(gstConsolidated || []).map((g, i) => (
              <div key={i} className="bg-dark-700 rounded-xl p-3 text-sm">
                <div className="font-medium text-white mb-2">{g.franchiseName}</div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><div className="text-gray-600">Taxable</div><div className="font-mono text-white">₹{Number(g.taxable).toLocaleString('en-IN')}</div></div>
                  <div><div className="text-gray-600">CGST+SGST</div><div className="font-mono text-green-400">₹{Number(g.cgst + g.sgst).toLocaleString('en-IN')}</div></div>
                  <div><div className="text-gray-600">IGST</div><div className="font-mono text-blue-400">₹{Number(g.igst).toLocaleString('en-IN')}</div></div>
                </div>
              </div>
            ))}
            {!gstConsolidated?.length && (
              <div className="text-center text-gray-600 py-8 text-sm">No GST data for this period</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
