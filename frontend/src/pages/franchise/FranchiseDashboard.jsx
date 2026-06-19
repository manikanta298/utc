import { useEffect, useState, useRef, useCallback } from 'react';
import { ShoppingBag, IndianRupee, Clock, TrendingUp, Users, Star, QrCode, Download, X, Shield, KeyRound } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import api from '../../lib/api';
import useAuthStore from '../../store/authStore';
import { format } from 'date-fns';
import { getSocket, joinFranchiseRoom } from '../../lib/socket';
import toast from 'react-hot-toast';

const COLORS = ['#f97316', '#ea580c', '#fb923c', '#fdba74', '#fed7aa'];

const StatCard = ({ icon: Icon, label, value, sub, color = 'text-brand-400', bg = 'bg-brand-500/10' }) => (
  <div className="stat-card animate-slide-up">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg} ${color}`}>
      <Icon size={20} />
    </div>
    <div className="mt-3">
      <div className="text-2xl font-bold text-white font-mono">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
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
          {p.name}: {p.name === 'orders' ? p.value : `₹${Number(p.value).toLocaleString('en-IN')}`}
        </div>
      ))}
    </div>
  );
};

export default function FranchiseDashboard() {
  const { user } = useAuthStore();
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('today');
  const [loading, setLoading] = useState(true);
  const [liveOrders, setLiveOrders] = useState(0);
  const liveRef = useRef(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/dashboard/franchise?period=${period}`);
      setData(res.data.data);
      liveRef.current = 0;
      setLiveOrders(0);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Real-time: join franchise room, update live counter on new orders
  useEffect(() => {
    const franchiseId = (user?.franchise_id?._id || user?.franchise_id)?.toString();
    if (!franchiseId) return;
    joinFranchiseRoom(franchiseId);

    const socket = getSocket();
    const onNewOrder = () => {
      liveRef.current += 1;
      setLiveOrders(liveRef.current);
    };
    const onSessionClosed = () => fetchData(); // refresh totals after payment
    socket.on('order:new',      onNewOrder);
    socket.on('order:placed',   onNewOrder);
    socket.on('session:closed', onSessionClosed);
    return () => {
      socket.off('order:new',      onNewOrder);
      socket.off('order:placed',   onNewOrder);
      socket.off('session:closed', onSessionClosed);
    };
  }, [user, fetchData]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const { totalOrders, totalRevenue, pendingOrders, todayOrders, topItems, recentOrders, revenueChart, gstSummary, staffCount } = data || {};

  const pieData = (topItems || []).map((i) => ({ name: i._id, value: i.count }));

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="section-title">
            {user?.franchise_id?.name || 'Franchise Dashboard'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {user?.franchise_id?.franchiseCode} · Real-time outlet overview
            {liveOrders > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 border border-green-500/40 text-green-400 text-xs font-bold animate-pulse">
                +{liveOrders} new
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {['today', 'week', 'month'].map((p) => (
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
        <StatCard icon={ShoppingBag} label="Orders" value={totalOrders || 0} sub={`Period: ${period}`} />
        <StatCard icon={IndianRupee} label="Revenue" value={`₹${((totalRevenue || 0) / 1000).toFixed(1)}K`} color="text-green-400" bg="bg-green-500/10" />
        <StatCard icon={Clock} label="Pending" value={pendingOrders || 0} sub="Active kitchen orders" color="text-orange-400" bg="bg-orange-500/10" />
        <StatCard icon={Users} label="Staff" value={staffCount || 0} color="text-blue-400" bg="bg-blue-500/10" />
      </div>

      {/* Today callout */}
      {period !== 'today' && (
        <div className="card p-4 flex items-center gap-3 border-brand-500/20">
          <div className="w-2 h-2 bg-brand-500 rounded-full animate-pulse" />
          <span className="text-sm text-gray-400">Today so far: <span className="text-white font-semibold">{todayOrders} orders</span></span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue chart */}
        <div className="card p-6 col-span-2">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-brand-400" /> Revenue (Last 7 Days)
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={revenueChart || []}>
              <defs>
                <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" />
              <XAxis dataKey="_id" tick={{ fill: '#555', fontSize: 10 }} tickLine={false} axisLine={false}
                tickFormatter={(v) => v ? format(new Date(v), 'dd MMM') : ''} />
              <YAxis tick={{ fill: '#555', fontSize: 10 }} tickLine={false} axisLine={false}
                tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#f97316" strokeWidth={2} fill="url(#fg)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Top items pie */}
        <div className="card p-6">
          <h3 className="font-semibold text-white mb-4">Top Items</h3>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} dataKey="value" paddingAngle={3}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {pieData.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-gray-400 truncate max-w-[120px]">{item.name}</span>
                    </div>
                    <span className="text-gray-600 font-mono">{item.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <div className="text-center text-gray-600 py-8 text-sm">No data</div>}
        </div>
      </div>

      {/* GST Summary */}
      {gstSummary?.taxableAmount > 0 && (
        <div className="card p-6">
          <h3 className="font-semibold text-white mb-4">GST Summary — {period}</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: 'Taxable Amount', value: gstSummary.taxableAmount, color: 'text-white' },
              { label: 'CGST', value: gstSummary.totalCgst, color: 'text-blue-400' },
              { label: 'SGST', value: gstSummary.totalSgst, color: 'text-teal-400' },
              { label: 'IGST', value: gstSummary.totalIgst, color: 'text-purple-400' },
              { label: 'Total Tax Liability', value: gstSummary.totalTax, color: 'text-orange-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-dark-700 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-600 mb-1">{label}</div>
                <div className={`font-mono font-bold ${color}`}>₹{Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent orders */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-dark-600 flex items-center justify-between">
          <h3 className="font-semibold text-white">Recent Orders</h3>
          <a href="/franchise/orders" className="text-xs text-brand-400 hover:text-brand-300">View all →</a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-700/50">
              <tr>{['Order #', 'Token', 'Customer', 'Items', 'Amount', 'Payment', 'Status'].map(h => <th key={h} className="table-head">{h}</th>)}</tr>
            </thead>
            <tbody>
              {(recentOrders || []).map((order) => (
                <tr key={order._id} className="table-row">
                  <td className="table-cell font-mono text-brand-400 text-xs">{order.order_number}</td>
                  <td className="table-cell text-center">
                    <span className="w-7 h-7 bg-dark-600 rounded-full inline-flex items-center justify-center text-xs font-bold text-white">
                      {order.token_number}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="text-sm text-white">{order.customer_id?.name}</div>
                    <div className="text-xs text-gray-600">{order.customer_id?.phone_no}</div>
                  </td>
                  <td className="table-cell text-xs text-gray-500">{order.items?.length} items</td>
                  <td className="table-cell font-mono text-green-400">₹{order.final_amount?.toLocaleString('en-IN')}</td>
                  <td className="table-cell">
                    <span className={`badge ${order.payment_mode === 'Cash' ? 'bg-green-500/10 text-green-400' : order.payment_mode === 'UPI' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'}`}>
                      {order.payment_mode}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span className={`badge status-${order.kitchen_status?.toLowerCase()}`}>
                      {order.kitchen_status}
                    </span>
                  </td>
                </tr>
              ))}
              {!recentOrders?.length && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-600 text-sm">No orders yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer QR Code — scan opens customer menu directly */}
      <CustomerQR franchiseId={user?.franchise_id?._id || user?.franchise_id} />

      {/* Order Edit PIN Setup */}
      <EditPinSetup franchiseId={user?.franchise_id?._id || user?.franchise_id} />
    </div>
  );
}

function CustomerQR({ franchiseId }) {
  const [qrUrl, setQrUrl] = useState('');
  const [show, setShow] = useState(false);
  const menuUrl = franchiseId ? `${window.location.origin}/menu/${franchiseId}` : '';

  const generate = async () => {
    if (!menuUrl) return;
    try {
      const res = await api.post('/tables/generate-menu-qr', { menuUrl });
      setQrUrl(res.data?.qrCode || '');
    } catch {
      // fallback: use a free QR API
      setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(menuUrl)}`);
    }
    setShow(true);
  };

  const download = () => {
    const a = document.createElement('a'); a.href = qrUrl; a.download = 'customer-menu-qr.png'; a.click();
  };

  return (
    <>
      <div className="bg-dark-800 border border-dark-600 rounded-2xl p-5 flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-white flex items-center gap-2"><QrCode size={16} className="text-brand-400" /> Customer Menu QR</div>
          <div className="text-xs text-gray-500 mt-1">Customers scan this to order directly — no login needed</div>
        </div>
        <button onClick={generate}
          className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl">
          Show QR
        </button>
      </div>

      {show && qrUrl && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShow(false)}>
          <div className="bg-white rounded-2xl p-6 flex flex-col items-center gap-4 max-w-xs w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between w-full">
              <span className="font-bold text-gray-800 text-lg">Customer Menu</span>
              <button onClick={() => setShow(false)} className="text-gray-400 hover:text-gray-800"><X size={20} /></button>
            </div>
            <img src={qrUrl} alt="Customer Menu QR" className="w-64 h-64 rounded-xl border border-gray-200" />
            <p className="text-xs text-gray-500 text-center break-all">{menuUrl}</p>
            <button onClick={download}
              className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-semibold w-full justify-center">
              <Download size={14} /> Download QR
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function EditPinSetup({ franchiseId }) {
  const [pin, setPin]         = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving]   = useState(false);
  const [show, setShow]       = useState(false);

  const handleSet = async () => {
    if (!/^\d{4,6}$/.test(pin)) {
      toast.error('PIN must be 4–6 digits'); return;
    }
    if (pin !== confirm) {
      toast.error('PINs do not match'); return;
    }
    setSaving(true);
    try {
      await api.put(`/franchises/${franchiseId}/edit-pin`, { pin });
      toast.success('Order edit PIN updated successfully');
      setPin(''); setConfirm(''); setShow(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to set PIN');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-yellow-500/10 flex items-center justify-center">
            <Shield size={18} className="text-yellow-400" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">Order Edit PIN</div>
            <div className="text-xs text-gray-500 mt-0.5">Protect order edits with a 4–6 digit PIN</div>
          </div>
        </div>
        <button
          onClick={() => setShow((v) => !v)}
          className="px-4 py-2 text-sm bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 rounded-xl font-medium transition-colors flex items-center gap-1.5"
        >
          <KeyRound size={14} /> {show ? 'Cancel' : 'Set PIN'}
        </button>
      </div>

      {show && (
        <div className="mt-4 pt-4 border-t border-dark-600 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">New PIN (4–6 digits)</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="w-full bg-dark-700 border border-dark-500 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-yellow-500 tracking-widest"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Confirm PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="w-full bg-dark-700 border border-dark-500 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-yellow-500 tracking-widest"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              onClick={handleSet}
              disabled={saving || !pin || !confirm}
              className="w-full py-2.5 text-sm bg-yellow-500 text-dark-900 font-semibold rounded-xl hover:bg-yellow-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving
                ? <div className="w-4 h-4 border-2 border-dark-900/40 border-t-dark-900 rounded-full animate-spin" />
                : <Shield size={14} />}
              Save PIN
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
