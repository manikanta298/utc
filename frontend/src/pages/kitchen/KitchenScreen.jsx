import { useEffect, useState, useRef, useCallback } from 'react';
import {
  ChefHat, Clock, CheckCircle, LogOut, RefreshCw, History,
  Volume2, VolumeX, PlusCircle, Package, UtensilsCrossed,
  CreditCard, Smartphone, Banknote, Phone, User,
} from 'lucide-react';
import api from '../../lib/api';
import useAuthStore from '../../store/authStore';
import { joinFranchiseRoom, getSocket } from '../../lib/socket';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { playNewOrderSound, playOrderReadySound } from '../../lib/audioNotify';

/* ─── helpers ─────────────────────────────────────────────────────────────── */
const elapsed = (d) => Math.floor((Date.now() - new Date(d).getTime()) / 60000);

const isUrgent = (order) => {
  const m = elapsed(order.createdAt);
  if (order.kitchen_status === 'Pending')   return m >= 3;
  if (order.kitchen_status === 'Accepted')  return m >= 10;
  if (order.kitchen_status === 'Preparing') return m >= 18;
  return false;
};

const normalise = (o) => ({
  ...o,
  _id:            o._id,
  order_number:   o.order_number   || o.orderNumber  || '',
  token_number:   o.token_number   || o.tokenNumber  || '',
  table_number:   o.table_number   || o.tableNumber  || '',
  order_type:     o.order_type     || o.orderType    || 'dine_in',
  is_addition:    o.is_addition    || o.isAddition   || false,
  kitchen_status: o.kitchen_status || o.status       || 'Pending',
  payment_status: o.payment_status || 'Pending',
  payment_mode:   o.payment_mode   || '',
  waiter_name:    o.waiter_name    || o.created_by?.name || '',
  customer_mobile: o.customer_mobile || o.customer_id?.phone_no || '',
  customer_id:    o.customer_id    || { name: o.customerName || '', phone_no: o.customerMobile || '' },
  items:          (o.items || []).map((i) => ({ ...i, quantity: i.quantity || i.qty || 1 })),
  createdAt:      o.createdAt      || o.orderedAt    || new Date().toISOString(),
});

const PAY_ICON = { Cash: Banknote, UPI: Smartphone, Card: CreditCard, 'Net Banking': CreditCard };
const formatMoney = (n) => `₹${Number(n || 0).toFixed(2)}`;

/* ─── StatPill ────────────────────────────────────────────────────────────── */
function StatPill({ label, value, color, pulse }) {
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${color}`}>
      {pulse && <span className="w-2 h-2 rounded-full bg-current animate-pulse" />}
      <span>{value}</span>
      <span className="opacity-60">{label}</span>
    </div>
  );
}

/* ─── OrderCard ───────────────────────────────────────────────────────────── */
function OrderCard({ order, onAccept, onComplete, onCancel, updating }) {
  const [showPhone, setShowPhone] = useState(false);
  const isParcel    = order.order_type === 'parcel';
  const isAddition  = order.is_addition;
  const isPaid      = order.payment_status === 'Paid';
  const status      = order.kitchen_status;
  const urgent      = isUrgent(order);
  const elapsedMin  = elapsed(order.createdAt);
  const PayIcon     = PAY_ICON[order.payment_mode] || Banknote;

  const canAccept   = status === 'Pending';
  const canComplete = ['Accepted', 'Preparing'].includes(status);

  const statusColors = {
    Pending:   'border-yellow-500/40 bg-yellow-500/05 text-yellow-400',
    Accepted:  'border-blue-500/40   bg-blue-500/05   text-blue-400',
    Preparing: 'border-orange-500/40 bg-orange-500/05 text-orange-400',
    Ready:     'border-green-500/40  bg-green-500/05  text-green-400',
  };
  const dotColors = {
    Pending: 'bg-yellow-500 animate-pulse', Accepted: 'bg-blue-500',
    Preparing: 'bg-orange-500', Ready: 'bg-green-500',
  };

  return (
    <div className={[
      'rounded-2xl border-2 flex flex-col gap-2.5 p-3.5 transition-all duration-200',
      statusColors[status] || 'border-dark-500 bg-dark-700',
      urgent ? 'shadow-[0_0_18px_rgba(239,68,68,0.3)] border-red-500/60' : '',
    ].join(' ')}>

      {/* ── ADDITION banner ── */}
      {isAddition && (
        <div className="flex items-center gap-2 bg-amber-400/15 border border-amber-400/40 rounded-xl px-3 py-1.5">
          <PlusCircle size={13} className="text-amber-400 animate-pulse flex-shrink-0" />
          <span className="text-amber-400 text-[11px] font-bold uppercase tracking-wide">
            Addition — TOKEN {order.token_number}
          </span>
        </div>
      )}

      {/* ── PARCEL banner ── */}
      {isParcel && (
        <div className="flex items-center gap-2 bg-purple-500/15 border border-purple-500/40 rounded-xl px-3 py-1.5">
          <Package size={13} className="text-purple-400 flex-shrink-0" />
          <span className="text-purple-400 text-[11px] font-bold uppercase tracking-wide">
            Parcel / Takeaway
          </span>
        </div>
      )}

      {/* ── Header row ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Token circle */}
          <div className={[
            'flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-sm',
            isParcel ? 'bg-purple-500' : 'bg-brand-500',
          ].join(' ')}>
            {order.token_number || '?'}
          </div>
          <div className="min-w-0">
            {/* Table / Parcel label */}
            <div className="text-sm font-bold text-white truncate flex items-center gap-1.5">
              {isParcel ? (
                <><Package size={12} className="text-purple-400" /> Parcel</>
              ) : order.table_number ? (
                <><UtensilsCrossed size={12} className="text-brand-400" /> Table {order.table_number}</>
              ) : (
                'Counter'
              )}
            </div>
            {/* Order ID */}
            <div className="text-[10px] font-mono text-gray-600 truncate">
              #{order.order_number}
            </div>
          </div>
        </div>

        {/* Timer + urgent */}
        <div className={[
          'flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold',
          urgent ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-dark-800 text-gray-500',
        ].join(' ')}>
          <Clock size={10} />
          {elapsedMin}m
          {urgent && ' !'}
        </div>
      </div>

      {/* ── Items ── */}
      <div className="bg-dark-900/60 rounded-xl p-3 space-y-1.5">
        {order.items.map((item, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-white font-medium truncate">{item.name}</span>
            {item.notes && (
              <span className="text-[10px] text-gray-500 italic truncate max-w-[70px]">{item.notes}</span>
            )}
            <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-dark-700 flex items-center justify-center text-xs font-bold text-brand-400">
              ×{item.quantity}
            </span>
          </div>
        ))}
      </div>

      {/* ── Info row: payment + type badges ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Payment status */}
        <span className={[
          'flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border',
          isPaid
            ? 'text-green-400 bg-green-400/10 border-green-400/30'
            : 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
        ].join(' ')}>
          <PayIcon size={9} />
          {isPaid ? 'Paid' : `Pending · ${order.payment_mode || '—'}`}
        </span>

        {/* Dine-In/Parcel badge */}
        <span className={[
          'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
          isParcel
            ? 'text-purple-400 bg-purple-400/10 border-purple-400/30'
            : 'text-brand-400 bg-brand-400/10 border-brand-400/30',
        ].join(' ')}>
          {isParcel ? '📦 Parcel' : '🪑 Dine-In'}
        </span>

        {/* Status dot */}
        <span className="flex items-center gap-1 text-[10px] text-gray-500 ml-auto">
          <span className={`w-1.5 h-1.5 rounded-full ${dotColors[status]}`} />
          {status}
        </span>
      </div>

      {/* ── Customer phone toggle ── */}
      {order.customer_id?.phone_no && (
        <button
          onClick={() => setShowPhone((p) => !p)}
          className="flex items-center gap-1.5 text-[10px] text-gray-600 hover:text-gray-400 transition-colors self-start"
        >
          <Phone size={10} />
          {showPhone ? order.customer_id.phone_no : 'Show customer mobile'}
        </button>
      )}

      {/* ── Staff + Source ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {order.waiter_name && (
          <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
            <User size={10} />
            <span>{order.waiter_name}</span>
          </div>
        )}
        {order.order_source && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${
            order.order_source === 'waiter'       ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' :
            order.order_source === 'qr_customer'  ? 'bg-cyan-500/20   text-cyan-400   border-cyan-500/30'   :
                                                    'bg-orange-500/20 text-orange-400 border-orange-500/30'
          }`}>
            {order.order_source === 'waiter' ? 'Waiter' : order.order_source === 'qr_customer' ? 'QR' : 'POS'}
          </span>
        )}
      </div>

      {/* ── Action Buttons ── */}
      <div className="grid grid-cols-2 gap-2 mt-0.5">
        <button
          onClick={() => onAccept(order._id)}
          disabled={!canAccept || updating === order._id}
          className={[
            'flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed',
            canAccept ? 'bg-blue-500 hover:bg-blue-400 shadow-lg shadow-blue-500/20' : 'bg-dark-700 text-gray-600',
          ].join(' ')}
        >
          {updating === order._id
            ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : '✓ Accept'}
        </button>
        <button
          onClick={() => onComplete(order._id)}
          disabled={!canComplete || updating === order._id}
          className={[
            'flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed',
            canComplete ? 'bg-green-500 hover:bg-green-400 shadow-lg shadow-green-500/20' : 'bg-dark-700 text-gray-600',
          ].join(' ')}
        >
          {updating === order._id
            ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : status === 'Ready' ? '✅ Ready!' : '🟢 Mark Ready'}
        </button>
      </div>
      {/* Cancel order */}
      {onCancel && !['Delivered','Cancelled'].includes(status) && (
        <button
          onClick={() => onCancel(order._id)}
          className="mt-2 w-full py-1.5 text-xs font-semibold text-red-400 border border-red-500/20 bg-red-500/5 rounded-xl hover:bg-red-500/15 transition-colors"
        >
          ✕ Cancel Order
        </button>
      )}
    </div>
  );
}

/* ─── Main Screen ─────────────────────────────────────────────────────────── */
export default function KitchenScreen() {
  const { user, token, initializing, logout } = useAuthStore();
  const navigate = useNavigate();
  const _fid = user?.franchise_id;
  const franchiseId = (_fid && typeof _fid === 'object' ? _fid._id : _fid)?.toString() || null;

  const [orders,         setOrders]         = useState([]);
  const [stats,          setStats]          = useState({ active:0, delivered:0, pending:0, paid:0, parcel:0, dineIn:0 });
  const [loading,        setLoading]        = useState(true);
  const [updating,       setUpdating]       = useState(null);
  const [soundEnabled,   setSoundEnabled]   = useState(true);
  const [filterType,     setFilterType]     = useState('all'); // all | dine_in | parcel
  const [filterPay,      setFilterPay]      = useState('all'); // all | paid | pending
  const [activeTab,      setActiveTab]      = useState('active'); // active | history | tokens
  const [history,        setHistory]        = useState([]);
  const [cancellingId,   setCancellingId]   = useState(null);
  const prevCountRef = useRef(0);

  /* ── data load ── */
  const loadOrders = useCallback(async () => {
    if (initializing || !token || !franchiseId) {
      setLoading(false);
      return;
    }

    // Orders — critical load, isolated try/catch
    const params = {};
    if (filterType !== 'all') params.type    = filterType;
    if (filterPay  !== 'all') params.payment = filterPay;
    try {
      const ordRes = await api.get('/kitchen/orders', { params });
      const fresh  = (ordRes.data.orders || []).map(normalise);
      if (fresh.length > prevCountRef.current && prevCountRef.current > 0 && soundEnabled) {
        playBell();
      }
      prevCountRef.current = fresh.length;
      setOrders(fresh);
      if (ordRes.data.deliveredToday !== undefined) {
        setStats((s) => ({ ...s, delivered: ordRes.data.deliveredToday }));
      }
    } catch (e) { console.error('[kitchen] orders:', e.message); }

    // Stats — optional endpoint, ignore if 404
    try {
      const statRes = await api.get('/kitchen/stats', { skipAuthRefresh: true });
      if (statRes.data?.stats) setStats(statRes.data.stats);
    } catch { /* endpoint optional */ }

    setLoading(false);
  }, [initializing, token, franchiseId, soundEnabled, filterType, filterPay]);

  const loadHistory = useCallback(async () => {
    if (initializing || !token || !franchiseId) return;

    try {
      const params = {};
      if (filterType !== 'all') params.type = filterType;
      const res = await api.get('/kitchen/orders/history', { params });
      setHistory((res.data.orders || []).map(normalise));
    } catch (e) { console.error('[kitchen] history:', e.message); }
  }, [initializing, token, franchiseId, filterType]);

  // use shared audio utility instead of inline Web Audio code
  const playBell = () => playNewOrderSound();

  useEffect(() => {
    if (initializing || !token || !franchiseId) {
      setLoading(false);
      return undefined;
    }

    loadOrders();
    const iv = setInterval(loadOrders, 5000);
    return () => clearInterval(iv);
  }, [initializing, token, franchiseId, loadOrders]);

  useEffect(() => {
    if (activeTab === 'history') loadHistory();
  }, [activeTab, loadHistory]);

  /* ── FIX: handleNewOrder — real-time kitchen order push ── */
  const handleNewOrder = useCallback((data) => {
    const order = normalise(data);
    setOrders((prev) => {
      // avoid duplicates
      if (prev.find((o) => o._id?.toString() === order._id?.toString())) return prev;
      if (soundEnabled) playBell();
      return [order, ...prev];
    });
    setStats((s) => ({ ...s, active: s.active + 1, pending: s.pending + 1 }));
  }, [soundEnabled]);

  /* ── socket ── */
  useEffect(() => {
    if (initializing || !token || !franchiseId) return;
    joinFranchiseRoom(franchiseId);
    const socket = getSocket();
    const onReconnect = () => { joinFranchiseRoom(franchiseId); loadOrders(); };
    socket.on('reconnect', onReconnect);
    socket.on('connect',   onReconnect);

    // FIX: register order:new listeners so kitchen updates in real-time
    socket.on('order:new',     handleNewOrder);
    socket.on('order:placed',  handleNewOrder);
    socket.on('order:created', handleNewOrder);
    socket.on('new_order',     handleNewOrder);

    socket.on('order:statusUpdate', (data) => {
      if (data.status === 'Delivered') {
        setOrders((prev) => prev.filter((o) => o._id?.toString() !== data.orderId?.toString()));
        setStats((s) => ({ ...s, delivered: s.delivered + 1, active: Math.max(0, s.active - 1) }));
      } else {
        setOrders((prev) =>
          prev.map((o) =>
            o._id?.toString() === data.orderId?.toString()
              ? { ...o, kitchen_status: data.status }
              : o
          )
        );
      }
    });

    return () => {
      socket.off('reconnect', onReconnect);
      socket.off('connect',   onReconnect);
      socket.off('order:new',          handleNewOrder);
      socket.off('order:placed',       handleNewOrder);
      socket.off('order:created',      handleNewOrder);
      socket.off('new_order',          handleNewOrder);
      socket.off('order:statusUpdate');
    };
  }, [initializing, token, franchiseId, soundEnabled, handleNewOrder, loadOrders]);

  /* ── status updates ── */
  const handleAccept = async (orderId) => {
    setUpdating(orderId);
    try {
      await api.put(`/kitchen/orders/${orderId}/status`, { status: 'Accepted' });
      setOrders((prev) => prev.map((o) => o._id === orderId ? { ...o, kitchen_status: 'Accepted' } : o));
      setStats((s) => ({ ...s, pending: Math.max(0, s.pending - 1), active: s.active + 1 }));
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    setUpdating(null);
  };

  const handleComplete = async (orderId) => {
    setUpdating(orderId);
    try {
      // Send 'Ready' — backend emits order:ready which notifies POS + Waiter
      // 'Delivered' is set by Waiter/POS when they collect the order
      await api.put(`/kitchen/orders/${orderId}/status`, { status: 'Ready' });
      setOrders((prev) => prev.map((o) =>
        o._id === orderId ? { ...o, kitchen_status: 'Ready' } : o
      ));
      setStats((s) => ({ ...s, active: s.active })); // stays in active (Ready is still active)
      toast.success('Order marked as Ready — notifying Waiter & POS');
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    setUpdating(null);
  };

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm('Cancel this order from kitchen?')) return;
    setCancellingId(orderId);
    try {
      await api.put(`/kitchen/orders/${orderId}/status`, { status: 'Cancelled' });
      setOrders((prev) => prev.filter((o) => o._id !== orderId));
      setStats((s) => ({ ...s, active: Math.max(0, s.active - 1) }));
      toast.success('Order cancelled');
    } catch (err) { toast.error(err.response?.data?.message || 'Cancel failed'); }
    finally { setCancellingId(null); }
  };

  /* ── filtering ── */
  const readyOrders  = orders.filter((o) => o.kitchen_status === 'Ready');
  const activeOrders = orders.filter((o) => o.kitchen_status !== 'Ready');
  const historyOrActive = activeTab === 'history' ? history : activeOrders;
  const visible = historyOrActive.filter((o) => {
    if (filterType === 'dine_in') return o.order_type !== 'parcel';
    if (filterType === 'parcel')  return o.order_type === 'parcel';
    return true;
  });
  const readyVisible = activeTab === 'active' ? readyOrders.filter((o) => {
    if (filterType === 'dine_in') return o.order_type !== 'parcel';
    if (filterType === 'parcel')  return o.order_type === 'parcel';
    return true;
  }) : [];

  const additions = orders.filter((o) => o.is_addition).length;

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">

      {/* ── Top bar ── */}
      <header className="h-14 bg-dark-800 border-b border-dark-600 flex items-center px-4 gap-3 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <ChefHat size={16} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-white leading-tight">Kitchen Display</div>
            <div className="text-[10px] text-gray-600">{user?.franchise_id?.name}</div>
          </div>
        </div>

        {/* Stats pills */}
        <div className="flex items-center gap-2 overflow-x-auto flex-1 px-2">
          <StatPill label="Active"     value={stats.active}    color="border-brand-500/30 bg-brand-500/10 text-brand-400"    pulse={stats.active > 0} />
          <StatPill label="Pending"    value={stats.pending}   color="border-yellow-500/30 bg-yellow-500/10 text-yellow-400" pulse={stats.pending > 0} />
          <StatPill label="Done Today" value={stats.delivered} color="border-green-500/30 bg-green-500/10 text-green-400" />
          <StatPill label="Paid"       value={stats.paid}      color="border-blue-500/30 bg-blue-500/10 text-blue-400" />
          <StatPill label="Parcel"     value={stats.parcel}    color="border-purple-500/30 bg-purple-500/10 text-purple-400" />
          <StatPill label="Dine-In"    value={stats.dineIn}    color="border-gray-500/30 bg-gray-500/10 text-gray-400" />
          {additions > 0 && (
            <StatPill label="Additions" value={additions} color="border-amber-400/40 bg-amber-400/10 text-amber-400" pulse />
          )}
        </div>

        <button onClick={() => setSoundEnabled((s) => !s)} className={`p-2 rounded-lg flex-shrink-0 ${soundEnabled ? 'text-brand-400' : 'text-gray-600'}`}>
          {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
        <button onClick={loadOrders} className="text-gray-500 hover:text-white p-2 rounded-lg flex-shrink-0">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
        <button onClick={() => { logout(); navigate('/login'); }} className="text-gray-500 hover:text-red-400 p-2 rounded-lg flex-shrink-0">
          <LogOut size={16} />
        </button>
      </header>

      {/* ── Filter bar ── */}
      <div className="bg-dark-800 border-b border-dark-600 px-4 py-2 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-dark-900 rounded-lg p-1">
          {[{ key: 'active', label: '🔥 Active' }, { key: 'history', label: '✅ History' }, { key: 'tokens', label: '🎫 Tokens' }].map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={['px-3 py-1.5 rounded-md text-xs font-semibold transition-all',
                activeTab === key ? 'bg-brand-500 text-white' : 'text-gray-500 hover:text-white'].join(' ')}>
              {label}
            </button>
          ))}
        </div>
        <div className="w-px h-5 bg-dark-600" />
        {[
          { key: 'all',     label: '📋 All Orders' },
          { key: 'dine_in', label: '🪑 Dine-In' },
          { key: 'parcel',  label: '📦 Parcel' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilterType(key)}
            className={[
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              filterType === key
                ? 'bg-brand-500/20 border border-brand-500/40 text-brand-400'
                : 'text-gray-500 hover:text-white hover:bg-dark-700',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
        {activeTab === 'active' && (
          <>
            <div className="w-px h-5 bg-dark-600" />
            {[{ key: 'all', label: '💳 All' }, { key: 'paid', label: '✅ Paid' }, { key: 'pending', label: '⏳ Pending' }].map(({ key, label }) => (
              <button key={key} onClick={() => setFilterPay(key)}
                className={['px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  filterPay === key ? 'bg-brand-500/20 border border-brand-500/40 text-brand-400' : 'text-gray-500 hover:text-white hover:bg-dark-700'].join(' ')}>
                {label}
              </button>
            ))}
          </>
        )}
        <span className="ml-auto text-[10px] text-gray-700">{visible.length} orders</span>
      </div>

      {/* ── Order grid ── */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-gray-700">
            <ChefHat size={48} />
            <div className="text-lg font-semibold">{activeTab === 'history' ? 'No completed orders yet' : 'Kitchen is clear!'}</div>
            <div className="text-sm text-gray-600">{stats.delivered} orders completed today</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {/* ── Ready for pickup section ── */}
            {readyVisible.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span className="text-green-400 font-bold text-sm">✅ Ready for Pickup</span>
                  <span className="bg-green-500/20 text-green-400 text-xs font-bold px-2 py-0.5 rounded-full border border-green-500/30">
                    {readyVisible.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-4">
                  {readyVisible.map((order) => (
                    <div key={order._id} className="opacity-80 ring-2 ring-green-500/40 rounded-2xl">
                      <OrderCard
                        order={order}
                        onAccept={handleAccept}
                        onComplete={handleComplete}
                        onCancel={null}
                        updating={null}
                      />
                    </div>
                  ))}
                </div>
                <div className="border-t border-[#2a2a2a] mb-4" />
              </div>
            )}

            {visible
              .sort((a, b) => {
                if (activeTab === 'history') return new Date(b.createdAt) - new Date(a.createdAt);
                if (a.kitchen_status === 'Pending' && b.kitchen_status !== 'Pending') return -1;
                if (isUrgent(a) && !isUrgent(b)) return -1;
                return new Date(a.createdAt) - new Date(b.createdAt);
              })
              .map((order) => (
                <OrderCard
                  key={order._id}
                  order={order}
                  onAccept={handleAccept}
                  onComplete={handleComplete}
                  onCancel={activeTab === 'active' ? handleCancelOrder : null}
                  updating={updating === order._id || cancellingId === order._id ? order._id : null}
                />
              ))}
          </div>
        )}

        {/* ── Token Tracking Panel ── */}
        {activeTab === 'tokens' && (
          <div className="p-4">
            <div className="mb-3 text-sm font-semibold text-gray-400">All orders linked with token numbers</div>
            {[...orders, ...history].length === 0 ? (
              <div className="text-center text-gray-600 py-12 text-sm">No orders today</div>
            ) : (
              <div className="space-y-2">
                {[...orders, ...history]
                  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                  .map((o) => {
                    const statusColor = {
                      Pending:   'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
                      Accepted:  'text-blue-400 bg-blue-500/10 border-blue-500/30',
                      Preparing: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
                      Ready:     'text-green-400 bg-green-500/10 border-green-500/30',
                      Delivered: 'text-gray-400 bg-dark-700 border-dark-600',
                      Cancelled: 'text-red-400 bg-red-500/10 border-red-500/30',
                    }[o.kitchen_status] || 'text-gray-400 bg-dark-700 border-dark-600';
                    return (
                      <div key={o._id} className="bg-dark-800 border border-dark-700 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-brand-400 font-mono font-bold text-sm">#{o.token_number}</span>
                          <span className="text-white text-sm">{o.table_number ? `Table ${o.table_number}` : 'Counter'}</span>
                          <span className="text-gray-500 text-xs">{o.order_type === 'parcel' ? '📦 Parcel' : '🍽️ Dine-in'}</span>
                          <span className="text-gray-600 text-xs">{o.items?.length || 0} items</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-600">{new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusColor}`}>{o.kitchen_status}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
