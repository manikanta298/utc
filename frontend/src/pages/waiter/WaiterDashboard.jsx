import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  MapPin, UtensilsCrossed, Bell, FileText, History, User,
  Settings, LogOut, Search, Plus, Minus, X, ChevronRight,
  RefreshCw, CheckCircle, Clock, Package, Phone, Star,
  Home, ShoppingCart, Send, ArrowLeft, Trash2, Check,
  Coffee, LayoutDashboard, Receipt, Filter, IndianRupee,
  ChevronDown, AlertCircle, Printer, Eye,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import useAuthStore from '../../store/authStore';
import { getSocket, joinFranchiseRoom } from '../../lib/socket';
// audio for order:ready/order:new is handled globally by NotificationProvider
import useNotificationStore, { NOTIF_LABELS } from '../../store/notificationStore';

// ── Table status config ───────────────────────────────────────────
const TS = {
  available:      { border: 'border-green-500',  bg: 'bg-green-500/15',  text: 'text-green-400',  dot: 'bg-green-500',  label: 'Available' },
  occupied:       { border: 'border-red-500',    bg: 'bg-red-500/20',    text: 'text-red-400',    dot: 'bg-red-500',    label: 'Occupied'  },
  reserved:       { border: 'border-amber-500',  bg: 'bg-amber-500/15',  text: 'text-amber-400',  dot: 'bg-amber-500',  label: 'Reserved'  },
  bill_pending:   { border: 'border-yellow-400', bg: 'bg-yellow-400/10', text: 'text-yellow-400', dot: 'bg-yellow-400', label: 'Bill Due'  },
  needs_cleaning: { border: 'border-gray-500',   bg: 'bg-gray-500/10',   text: 'text-gray-400',   dot: 'bg-gray-500',   label: 'Cleaning'  },
  held:           { border: 'border-purple-500', bg: 'bg-purple-500/10', text: 'text-purple-400', dot: 'bg-purple-500', label: 'On Hold'   },
};
const tsCfg = (status) => TS[status] || TS.available;

// ── Order timeline ───────────────────────────────────────────────
const STEPS = ['Order Saved','Approval Pending','Approved','Sent to Kitchen','Preparing','Ready to Serve','Completed'];
const sessionToStep = (session) => {
  if (!session) return 0;
  const s = session.status;
  if (s === 'pending_pos')  return 1;
  if (s === 'open') {
    const sub = session.subOrders?.[0];
    const ks  = sub?.kitchen_status || sub?.order_id?.kitchen_status;
    if (ks === 'Pending')    return 3;
    if (ks === 'InProgress') return 4;
    if (ks === 'Ready')      return 5;
    if (ks === 'Delivered')  return 6;
    return 2;
  }
  if (s === 'paid' || s === 'closed') return 6;
  return 0;
};

// ── Helper ────────────────────────────────────────────────────────
const fmt = (n) => `₹${(n || 0).toFixed(2)}`;

// ════════════════════════════════════════════════════════════════
export default function WaiterDashboard() {
  const { user, logout } = useAuthStore();

  // Navigation
  const [screen, setScreen]         = useState('tableMap');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Table Map
  const [tables, setTables]         = useState([]);
  const [tableSearch, setTableSearch] = useState('');
  const [selectedTable, setSelectedTable] = useState(null);
  const [showTablePopup, setShowTablePopup] = useState(false);
  const [tableSession, setTableSession] = useState(null); // session for the selected occupied table
  const [orderType, setOrderType]   = useState('dine_in');
  const [showOrderTypeModal, setShowOrderTypeModal] = useState(false);

  // Customer Select
  const [custSearch, setCustSearch] = useState('');
  const [recentCusts, setRecentCusts] = useState([]);
  const [foundCust, setFoundCust]   = useState(null);
  const [custLoading, setCustLoading] = useState(false);
  const [isNewCust, setIsNewCust]   = useState(false);
  const [newCustName, setNewCustName] = useState('');

  // Menu
  const [menuItems, setMenuItems]   = useState([]);
  const [menuCat, setMenuCat]       = useState('All');
  const [menuSearch, setMenuSearch] = useState('');

  // Cart
  const [cart, setCart]             = useState([]);
  const [specialNote, setSpecialNote] = useState('');

  // Order result
  const [placedOrder, setPlacedOrder] = useState(null);
  const [trackOrder, setTrackOrder]   = useState(null);

  // History
  const [history, setHistory]       = useState([]);
  const [histTab, setHistTab]       = useState('today');
  const [histLoading, setHistLoading] = useState(false);

  // Notifications
  const [notifBadge, setNotifBadge] = useState(0);
  const { notifications: notifs, unreadCount, markRead: markNotifsRead,
          removeNotification, clearAll: clearNotifs,
          addNotification } = useNotificationStore();

  // Bill request
  const [billTable, setBillTable]   = useState(null);

  // ── Data load ─────────────────────────────────────────────────
  const loadTables = useCallback(async () => {
    try { const r = await api.get('/tables/map'); setTables(r.data.tables || []); } catch {}
  }, []);

  const loadMenu = useCallback(async () => {
    try { const r = await api.get('/menu?limit=300'); setMenuItems(r.data.items || r.data.menuItems || []); } catch {}
  }, []);

  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    try { const r = await api.get('/waiter/my-orders'); setHistory(r.data.sessions || []); } catch {}
    finally { setHistLoading(false); }
  }, []);

  const loadRecent = useCallback(async () => {
    try { const r = await api.get('/customers?limit=5&sort=latest'); setRecentCusts(r.data.customers || []); } catch {}
  }, []);

  useEffect(() => { loadTables(); loadMenu(); loadRecent(); }, [loadTables, loadMenu, loadRecent]);
  useEffect(() => { if (screen === 'history') loadHistory(); }, [screen, loadHistory]);

  // ── Socket ────────────────────────────────────────────────────
  useEffect(() => {
    const fid = user?.franchise_id?._id || user?.franchise_id;
    if (!fid) return;
    joinFranchiseRoom(fid);
    const socket = getSocket();
    if (!socket) return;
    const onTableUpdate = ({ tableId, status }) =>
      setTables(p => p.map(t => t._id?.toString() === tableId?.toString() ? { ...t, status } : t));
    // NOTE: order:ready is handled globally by <NotificationProvider /> (mounted in
    // BareLayout). Do NOT add a local listener here — it would create duplicate
    // notifications and previously crashed due to undefined setNotifs.
    const onApproved = (data) => {
      addNotification({
        type:         'new_order',
        orderId:      data.orderId,
        tokenNumber:  data.tokenNumber,
        tableNumber:  data.tableNumber,
        customerName: data.customerName,
      });
      toast.success(`Order approved! Table ${data.tableNumber}`);
    };
    socket.on('table:statusUpdated', onTableUpdate);
    socket.on('waiter:order_approved', onApproved);
    return () => {
      socket.off('table:statusUpdated', onTableUpdate);
      socket.off('waiter:order_approved', onApproved);
    };
  }, [user, addNotification]);

  // ── Customer lookup ───────────────────────────────────────────
  const lookupCust = useCallback(async (phone) => {
    if (phone.length < 10) { setFoundCust(null); setIsNewCust(false); return; }
    setCustLoading(true);
    try {
      const r = await api.get(`/customers/lookup?phone=${phone}`);
      if (r.data.customer) { setFoundCust(r.data.customer); setIsNewCust(false); }
      else { setFoundCust(null); setIsNewCust(true); }
    } catch { setIsNewCust(true); }
    finally { setCustLoading(false); }
  }, []);

  useEffect(() => { lookupCust(custSearch); }, [custSearch, lookupCust]);

  // ── Cart helpers ──────────────────────────────────────────────
  const addItem = (item) =>
    setCart(p => {
      const ex = p.find(c => c._id === item._id);
      return ex ? p.map(c => c._id === item._id ? { ...c, qty: c.qty + 1 } : c) : [...p, { ...item, qty: 1 }];
    });
  const setQty = (id, delta) =>
    setCart(p => p.map(c => c._id === id ? { ...c, qty: Math.max(0, c.qty + delta) } : c).filter(c => c.qty > 0));
  const removeItem = (id) => setCart(p => p.filter(c => c._id !== id));

  const subtotal   = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const gst        = cart.reduce((s, c) => s + c.price * c.qty * (c.gst_rate || 5) / 100, 0);
  const total      = subtotal + gst;
  const cartCount  = cart.reduce((s, c) => s + c.qty, 0);

  // ── Place order ───────────────────────────────────────────────
  const placeOrder = async (sendNow = false) => {
    if (!cart.length) { toast.error('Add items first'); return; }
    try {
      const res = await api.post('/waiter/place-order', {
        tableId:        orderType === 'dine_in' ? selectedTable?._id   : null,
        tableNumber:    orderType === 'dine_in' ? selectedTable?.tableNumber : null,
        orderType,
        customerMobile: foundCust?.phone_no || custSearch || '0000000000',
        customerName:   foundCust?.name || newCustName || 'Walk-in',
        items:          cart.map(c => ({ menuItemId: c._id, qty: c.qty })),
        notes:          specialNote,
      });
      setPlacedOrder(res.data.session);
      setCart([]);
      setSpecialNote('');
      setScreen('token');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Order failed');
    }
  };

  // ── Bill request ──────────────────────────────────────────────
  const requestBill = async () => {
    if (!billTable) return;
    try {
      await api.post(`/tables/${billTable._id}/bill-request`);
      toast.success('Bill requested! POS operator notified.');
      resetFlow(); setScreen('tableMap');
    } catch { toast.error('Failed to request bill'); }
  };

  // ── Reset ─────────────────────────────────────────────────────
  const resetFlow = () => {
    setSelectedTable(null); setFoundCust(null); setCustSearch('');
    setCart([]); setSpecialNote(''); setIsNewCust(false); setNewCustName('');
    setOrderType('dine_in'); setShowTablePopup(false); setPlacedOrder(null);
    setBillTable(null);
  };

  const goHome = () => { resetFlow(); setScreen('tableMap'); };

  // ── Nav config ────────────────────────────────────────────────
  const NAV = [
    { id: 'tableMap',   icon: MapPin,           label: 'Table Map'      },
    { id: 'orders',     icon: UtensilsCrossed,  label: 'Orders'         },
    { id: 'notifications', icon: Bell,          label: 'Notifications', badge: unreadCount },
    { id: 'billRequest',icon: Receipt,          label: 'Bill Request'   },
    { id: 'history',    icon: History,          label: 'History'        },
    { id: 'profile',    icon: User,             label: 'Profile'        },
    { id: 'settings',   icon: Settings,         label: 'Settings'       },
  ];

  const navigate = (id) => {
    if (id === 'notifications') markNotifsRead();
    setScreen(id);
    setSidebarOpen(false);
  };

  // ── Filtered data ─────────────────────────────────────────────
  const [debouncedMenuSearch, setDebouncedMenuSearch] = useState('');
  const menuSearchTimer = useRef(null);
  const handleMenuSearchChange = (e) => {
    setMenuSearch(e.target.value);
    clearTimeout(menuSearchTimer.current);
    menuSearchTimer.current = setTimeout(() => setDebouncedMenuSearch(e.target.value), 250);
  };
  const menuCats = useMemo(() => ['All', ...new Set(menuItems.map(i => i.category).filter(Boolean))], [menuItems]);
  const filteredMenu = useMemo(() => menuItems.filter(i => {
    const c = menuCat === 'All' || i.category === menuCat;
    const s = !debouncedMenuSearch || i.name?.toLowerCase().includes(debouncedMenuSearch.toLowerCase());
    return c && s && i.availability !== false;
  }), [menuItems, menuCat, debouncedMenuSearch]);
  const filteredTables = tables.filter(t =>
    !tableSearch || String(t.tableNumber).includes(tableSearch)
  );
  const tCount = {
    available: tables.filter(t => t.status === 'available').length,
    occupied:  tables.filter(t => t.status === 'occupied').length,
    reserved:  tables.filter(t => t.status === 'reserved').length,
  };

  // ════════════════════════════════════════════════════════════════
  // SCREENS
  // ════════════════════════════════════════════════════════════════

  // ── 1. Table Map ──────────────────────────────────────────────
  const ScreenTableMap = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#2a2a2a]">
        <h1 className="text-xl font-bold text-white mb-3">Table Map</h1>
        {/* Floor + Search row */}
        <div className="flex gap-2 mb-3">
          <div className="flex items-center gap-1.5 bg-[#252525] border border-[#333] rounded-xl px-3 py-2">
            <span className="text-xs text-white font-medium">Ground Floor</span>
            <ChevronDown size={12} className="text-gray-400" />
          </div>
          <div className="flex-1 flex items-center gap-2 bg-[#252525] border border-[#333] rounded-xl px-3 py-2">
            <Search size={14} className="text-gray-400" />
            <input className="flex-1 bg-transparent text-xs text-white placeholder-gray-500 outline-none"
              placeholder="Search Table" value={tableSearch} onChange={e => setTableSearch(e.target.value)} />
          </div>
          <button onClick={loadTables} className="w-10 h-10 flex items-center justify-center bg-[#252525] border border-[#333] rounded-xl text-gray-400 hover:text-orange-400 transition-colors">
            <RefreshCw size={15} />
          </button>
        </div>
        {/* Legend + Counts */}
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-xs text-gray-300">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Available <strong className="text-green-400">{tCount.available}</strong>
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-300">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Occupied <strong className="text-red-400">{tCount.occupied}</strong>
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-300">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Reserved <strong className="text-amber-400">{tCount.reserved}</strong>
          </span>
        </div>
      </div>

      {/* Table grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredTables.length === 0 ? (
          <div className="text-center py-12 text-gray-500">No tables found</div>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {filteredTables.map(t => {
              const cfg = tsCfg(t.status);
              return (
                <button key={t._id}
                  onClick={() => {
                    setSelectedTable(t);
                    setShowTablePopup(true);
                    // fetch session for occupied table to show customer details
                    if (t.status === 'occupied') {
                      api.get('/sessions?status=open,bill_pending').then(r => {
                        const sess = (r.data.sessions || []).find(s =>
                          s.tableNumber === t.tableNumber || s.tableId?.toString() === t._id?.toString()
                        );
                        setTableSession(sess || null);
                      }).catch(() => setTableSession(null));
                    } else {
                      setTableSession(null);
                    }
                  }}
                  className={`relative flex flex-col items-center justify-center rounded-xl border-2 py-3 px-2 gap-1 transition-all hover:scale-105 ${cfg.border} ${cfg.bg}`}>
                  {/* Chair SVG */}
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className={cfg.text}>
                    <path d="M5 9h14M5 9a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2M5 9v10m14-10v10M5 19H3m2 0h14m0 0h2"
                      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                  <span className="text-white font-bold text-xs">T{t.tableNumber}</span>
                  <span className={`text-[10px] ${cfg.text}`}>{t.capacity} Seats</span>
                  {t.status !== 'available' && (
                    <span className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${cfg.dot} ${t.status === 'occupied' ? 'animate-pulse' : ''}`} />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Table Popup */}
      {showTablePopup && selectedTable && (() => {
        const cfg = tsCfg(selectedTable.status);
        const isOccupied = selectedTable.status !== 'available';
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-[#1c1c1c] border border-[#2e2e2e] shadow-2xl overflow-hidden">
              {/* Popup Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#2e2e2e]">
                <h2 className="text-white font-bold">Select Table</h2>
                <button onClick={() => setShowTablePopup(false)} className="w-7 h-7 flex items-center justify-center rounded-full bg-[#2a2a2a] text-gray-400 hover:text-white">
                  <X size={14} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Table visual */}
                <div className="flex items-center gap-4 bg-[#252525] rounded-xl p-4">
                  <div className="flex flex-col items-center justify-center w-16 h-16 rounded-xl border-2 border-[#333] bg-[#1a1a1a]">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className={cfg.text}>
                      <path d="M5 9h14M5 9a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2M5 9v10m14-10v10M5 19H3m2 0h14m0 0h2"
                        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                    </svg>
                    <span className="text-white font-black text-xs mt-0.5">T{selectedTable.tableNumber}</span>
                  </div>
                  <div className="flex-1">
                    <div className="text-white font-bold text-base">Table {selectedTable.tableNumber}</div>
                    <div className="text-gray-400 text-xs">{selectedTable.capacity} Seats</div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className={`w-2 h-2 rounded-full ${cfg.dot} ${isOccupied && selectedTable.status === 'occupied' ? 'animate-pulse' : ''}`} />
                      <span className={`text-xs font-semibold uppercase tracking-wide ${cfg.text}`}>{cfg.label}</span>
                    </div>
                  </div>
                </div>

                {/* Table details */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    ['Status',           cfg.label],
                    ['Location',         'Ground Floor'],
                    ['Minimum Capacity', `${selectedTable.capacity} Seats`],
                    ['Maximum Capacity', `${selectedTable.capacity} Seats`],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-[#252525] rounded-xl p-3">
                      <div className="text-gray-500 mb-0.5">{k}</div>
                      <div className="text-white font-semibold">{v}</div>
                    </div>
                  ))}
                </div>

                {/* Occupied: show existing customer + actions */}
                {isOccupied ? (
                  <div className="space-y-2">
                    {/* Customer details for this table */}
                    {tableSession && (tableSession.customerName || tableSession.customerMobile) && (
                      <div className="bg-[#252525] rounded-xl p-3 flex items-center gap-3 mb-1">
                        <div className="w-9 h-9 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-black text-sm flex-shrink-0">
                          {(tableSession.customerId?.name || tableSession.customerName || '?')[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-white font-semibold text-sm truncate">
                            {tableSession.customerId?.name || tableSession.customerName || 'Walk-in'}
                          </div>
                          <div className="text-gray-400 text-xs">
                            {tableSession.customerId?.phone_no || tableSession.customerMobile || '—'}
                          </div>
                        </div>
                        {(tableSession.customerId?.loyalty_points || tableSession.customerId?.total_points) > 0 && (
                          <div className="text-amber-400 text-xs font-semibold">
                            ⭐ {tableSession.customerId?.loyalty_points || tableSession.customerId?.total_points} pts
                          </div>
                        )}
                      </div>
                    )}
                    <button onClick={() => { setShowTablePopup(false); setScreen('menu'); }} 
                      className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm transition-colors">
                      + ADD NEW ITEMS
                    </button>
                    <button onClick={() => {
                      setBillTable(selectedTable);
                      setShowTablePopup(false);
                      setScreen('billRequest');
                    }}
                      className="w-full py-3 border border-[#333] text-gray-300 font-semibold rounded-xl text-sm hover:bg-[#252525] transition-colors">
                      REQUEST BILL
                    </button>
                    <button onClick={() => {
                      setTrackOrder({ tableNumber: selectedTable.tableNumber });
                      setShowTablePopup(false);
                      setScreen('tracking');
                    }}
                      className="w-full py-2 text-gray-400 text-xs hover:text-white transition-colors">
                      VIEW ORDER HISTORY
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Order type tabs */}
                    <div className="flex rounded-xl overflow-hidden border border-[#333]">
                      {[['dine_in','DINE IN'],['takeaway','TAKEAWAY'],['parcel','PARCEL']].map(([val, lbl]) => (
                        <button key={val} onClick={() => setOrderType(val)}
                          className={`flex-1 py-2.5 text-xs font-bold transition-colors ${orderType === val ? 'bg-orange-500 text-white' : 'bg-[#252525] text-gray-400 hover:text-white'}`}>
                          {lbl}
                        </button>
                      ))}
                    </div>

                    <button onClick={() => {
                      setShowTablePopup(false);
                      setScreen('customerSelect');
                    }}
                      className="w-full py-3.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm transition-all">
                      SELECT TABLE
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );

  // ── 2. Customer Select ────────────────────────────────────────
  const ScreenCustomerSelect = (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-[#2a2a2a] flex items-center gap-3">
        <button onClick={() => setScreen('tableMap')} className="text-gray-400 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-white">Customer</h1>
        <div className="ml-auto flex items-center gap-2 text-xs bg-[#252525] border border-[#333] rounded-lg px-2.5 py-1.5 text-gray-300">
          {orderType === 'dine_in' && selectedTable && <><MapPin size={11} className="text-orange-400" /> T{selectedTable.tableNumber}</>}
          {orderType === 'takeaway' && <><Package size={11} className="text-orange-400" /> Takeaway</>}
          {orderType === 'parcel'   && <><Package size={11} className="text-orange-400" /> Parcel</>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Search */}
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-[#1e1e1e] border border-[#2e2e2e] rounded-xl px-3 py-2.5">
            <Phone size={14} className="text-gray-400" />
            <input
              className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
              placeholder="Search by mobile number"
              value={custSearch}
              onChange={e => setCustSearch(e.target.value.replace(/\D/g,'').slice(0,10))}
              maxLength={10}
            />
            {custLoading && <RefreshCw size={13} className="text-orange-400 animate-spin" />}
            {foundCust && <Check size={14} className="text-green-400" />}
          </div>
          <button
            onClick={() => { setFoundCust(null); setIsNewCust(true); setCustSearch(''); setScreen('menu'); }}
            className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold px-3 py-2.5 rounded-xl transition-colors whitespace-nowrap">
            <Plus size={14} /> New Customer
          </button>
        </div>

        {/* Found customer card */}
        {foundCust && (
          <div className="rounded-xl bg-[#1e1e1e] border border-green-500/40 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold">
                  {foundCust.name?.[0] || '?'}
                </div>
                <div>
                  <div className="text-white font-semibold text-sm">{foundCust.name}</div>
                  <div className="text-gray-400 text-xs">{foundCust.phone_no}</div>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-amber-400">
                <Star size={11} className="fill-amber-400" />
                <span className="font-bold">{foundCust.loyalty_points || 0} pts</span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-[#2e2e2e] flex gap-3 text-xs text-gray-400">
              <div>Visits <span className="text-white font-bold">{foundCust.total_visits || 0}</span></div>
              <div>Spend <span className="text-white font-bold">{fmt(foundCust.lifetime_spend)}</span></div>
            </div>
            <button onClick={() => setScreen('menu')}
              className="mt-3 w-full py-2.5 bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold rounded-xl transition-colors">
              Continue →
            </button>
          </div>
        )}

        {/* New customer form */}
        {isNewCust && (
          <div className="rounded-xl bg-[#1e1e1e] border border-[#2e2e2e] p-4 space-y-3">
            <p className="text-xs text-gray-400">New customer — enter a name (optional)</p>
            <input className="w-full bg-[#252525] border border-[#333] rounded-xl px-3 py-2.5 text-sm text-white outline-none placeholder-gray-500"
              placeholder="Customer name (optional)" value={newCustName} onChange={e => setNewCustName(e.target.value)} />
            <button onClick={() => setScreen('menu')}
              className="w-full py-2.5 bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold rounded-xl transition-colors">
              Continue as Walk-in →
            </button>
          </div>
        )}

        {/* Recent Customers */}
        {!foundCust && !isNewCust && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Recent Customers</span>
              <button className="text-xs text-orange-400 hover:text-orange-300">View All</button>
            </div>
            {recentCusts.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">No recent customers</div>
            ) : (
              <div className="space-y-2">
                {recentCusts.map(c => (
                  <button key={c._id} onClick={() => { setFoundCust(c); setCustSearch(c.phone_no || ''); }}
                    className="w-full flex items-center gap-3 bg-[#1e1e1e] border border-[#2e2e2e] rounded-xl p-3 hover:border-orange-500/40 transition-colors">
                    <div className="w-9 h-9 rounded-full bg-[#2a2a2a] flex items-center justify-center text-orange-400 font-bold text-sm">
                      {c.name?.[0] || '?'}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-white text-sm font-medium">{c.name}</div>
                      <div className="text-gray-500 text-xs">{c.phone_no}</div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-amber-400">
                      <Star size={10} className="fill-amber-400" />
                      <span>{c.loyalty_points || 0} pts</span>
                    </div>
                    <ChevronRight size={14} className="text-gray-600" />
                  </button>
                ))}
              </div>
            )}

            {/* Skip — go without customer */}
            <button onClick={() => setScreen('menu')}
              className="w-full py-2.5 border border-[#333] text-gray-400 text-sm rounded-xl hover:text-white hover:border-[#444] transition-colors">
              Skip — Continue without customer
            </button>
          </>
        )}
      </div>
    </div>
  );

  // ── 3. Menu ───────────────────────────────────────────────────
  const ScreenMenu = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#2a2a2a] flex items-center gap-3">
        <button onClick={() => setScreen('customerSelect')} className="text-gray-400 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-white">
            Menu {selectedTable && orderType === 'dine_in' ? `— Table ${selectedTable.tableNumber}` : orderType === 'parcel' ? '— Parcel' : '— Takeaway'}
          </h1>
          {(foundCust || newCustName) && (
            <div className="text-xs text-gray-400">{foundCust?.name || newCustName}</div>
          )}
        </div>
        {cartCount > 0 && (
          <button onClick={() => setScreen('cart')}
            className="relative flex items-center gap-1.5 bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors">
            <ShoppingCart size={14} />
            <span>{cartCount} items</span>
            <span className="text-orange-200">{fmt(total)}</span>
          </button>
        )}
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-[#2a2a2a]">
        <div className="flex items-center gap-2 bg-[#1e1e1e] border border-[#2e2e2e] rounded-xl px-3 py-2">
          <Search size={14} className="text-gray-400" />
          <input className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
            placeholder="Search menu items" value={menuSearch} onChange={handleMenuSearchChange} />
        </div>
      </div>

      {/* Category pills */}
      <div className="px-4 py-2 border-b border-[#2a2a2a] flex gap-2 overflow-x-auto">
        {menuCats.map(cat => (
          <button key={cat} onClick={() => setMenuCat(cat)}
            className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${menuCat === cat ? 'bg-orange-500 text-white' : 'bg-[#252525] text-gray-400 hover:text-white'}`}>
            {cat}
          </button>
        ))}
      </div>

      {/* Menu grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {filteredMenu.length === 0 ? (
          <div className="text-center py-10 text-gray-500">No items found</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredMenu.map(item => {
              const inCart = cart.find(c => c._id === item._id);
              return (
                <div key={item._id} onClick={() => addItem(item)} className="bg-[#1e1e1e] border border-[#2e2e2e] rounded-xl overflow-hidden cursor-pointer active:scale-95 hover:border-orange-500/40 transition-all select-none">
                  {/* Item image placeholder */}
                  <div className="h-20 bg-[#252525] flex items-center justify-center relative overflow-hidden">
                    {item.image?.url
                      ? <img src={item.image.url} alt={item.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                      : <span className="text-4xl font-black text-[#333]">{item.category?.[0]?.toUpperCase() || 'C'}</span>
                    }
                    {item.availability === false && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <span className="text-xs text-red-400 font-bold">OUT OF STOCK</span>
                      </div>
                    )}
                    <span className={`absolute top-1.5 left-1.5 w-3 h-3 rounded-full border border-white/20 ${item.isVeg===false?'bg-red-500':'bg-green-500'}`} />
                  </div>
                  <div className="p-2">
                    <div className="text-white text-xs font-semibold leading-tight mb-0.5">{item.name}</div>
                    <div className="text-orange-400 text-xs font-bold">{fmt(item.price)}</div>
                    <div className="text-gray-500 text-[10px]">{item.gst_rate || 5}% GST</div>
                    {/* Add/Qty controls */}
                    <div className="mt-2 flex items-center justify-end">
                      {inCart ? (
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setQty(item._id, -1)} className="w-6 h-6 rounded-lg bg-orange-500/20 text-orange-400 flex items-center justify-center text-xs font-bold">
                            <Minus size={10} />
                          </button>
                          <span className="text-white text-xs font-bold w-4 text-center">{inCart.qty}</span>
                          <button onClick={() => setQty(item._id, 1)} className="w-6 h-6 rounded-lg bg-orange-500 text-white flex items-center justify-center text-xs font-bold">
                            <Plus size={10} />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => addItem(item)}
                          className="w-7 h-7 rounded-lg bg-orange-500 hover:bg-orange-400 text-white flex items-center justify-center transition-colors">
                          <Plus size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Proceed to cart */}
      {cartCount > 0 && (
        <div className="px-4 py-3 border-t border-[#2a2a2a]">
          <button onClick={() => setShowOrderTypeModal(true)}
            className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm transition-colors flex items-center justify-between px-4">
            <span>{cartCount} items added</span>
            <span>View Cart {fmt(total)} →</span>
          </button>
        </div>
      )}
    </div>
  );

  // ── 4. Cart ───────────────────────────────────────────────────
  const ScreenCart = (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-[#2a2a2a] flex items-center gap-3">
        <button onClick={() => setScreen('menu')} className="text-gray-400 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-base">
              {orderType === 'dine_in' && selectedTable ? `Table ${selectedTable.tableNumber}` : orderType === 'parcel' ? 'Parcel' : 'Takeaway'}
            </span>
            {selectedTable && orderType === 'dine_in' && (
              <span className="text-[10px] bg-red-500/20 border border-red-500/40 text-red-400 px-1.5 py-0.5 rounded font-bold uppercase">OCCUPIED</span>
            )}
          </div>
          <div className="text-gray-400 text-xs">{selectedTable?.capacity} Seats</div>
        </div>
        <button onClick={() => setCart([])} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
          <Trash2 size={12} /> Clear
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Items table header */}
        <div className="grid grid-cols-12 text-xs text-gray-500 pb-1 border-b border-[#2a2a2a]">
          <span className="col-span-5">Item</span>
          <span className="col-span-2 text-right">Price</span>
          <span className="col-span-3 text-center">Qty</span>
          <span className="col-span-2 text-right">Total</span>
        </div>

        {cart.map(item => (
          <div key={item._id} className="grid grid-cols-12 items-center text-sm">
            <div className="col-span-5">
              <div className="text-white font-medium text-xs">{item.name}</div>
              <div className="text-gray-500 text-[10px]">{fmt(item.price)} x {item.qty}</div>
            </div>
            <div className="col-span-2 text-right text-orange-400 text-xs font-bold">{fmt(item.price)}</div>
            <div className="col-span-3 flex items-center justify-center gap-1.5">
              <button onClick={() => setQty(item._id, -1)} className="w-6 h-6 rounded-lg bg-[#2a2a2a] text-white flex items-center justify-center hover:bg-[#333]">
                <Minus size={10} />
              </button>
              <span className="text-white text-xs font-bold w-4 text-center">{item.qty}</span>
              <button onClick={() => setQty(item._id, 1)} className="w-6 h-6 rounded-lg bg-orange-500 text-white flex items-center justify-center hover:bg-orange-400">
                <Plus size={10} />
              </button>
            </div>
            <div className="col-span-2 text-right text-white text-xs font-bold">{fmt(item.price * item.qty)}</div>
          </div>
        ))}

        {/* Special instructions */}
        <div className="pt-2">
          <textarea
            className="w-full bg-[#1e1e1e] border border-[#2e2e2e] rounded-xl p-3 text-xs text-white placeholder-gray-600 outline-none resize-none"
            rows={2}
            placeholder="Add Special Instructions... Eg: Less sugar, No ice, Extra spicy etc"
            value={specialNote}
            onChange={e => setSpecialNote(e.target.value)}
          />
        </div>

        {/* Bill summary */}
        <div className="bg-[#1e1e1e] border border-[#2e2e2e] rounded-xl p-4 space-y-2 text-sm">
          <div className="flex justify-between text-gray-400"><span>Subtotal</span><span className="text-white">{fmt(subtotal)}</span></div>
          <div className="flex justify-between text-gray-400"><span>GST (avg)</span><span className="text-white">{fmt(gst)}</span></div>
          <div className="flex justify-between font-bold text-base border-t border-[#2e2e2e] pt-2">
            <span className="text-white">Total</span>
            <span className="text-orange-400">{fmt(total)}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-4 border-t border-[#2a2a2a] flex gap-3">
        <button onClick={() => { setCart([]); goHome(); }}
          className="flex-1 py-3 border border-[#333] text-gray-300 font-bold rounded-xl text-sm hover:bg-[#252525] transition-colors">
          CLEAR CART
        </button>
        <button onClick={() => setScreen('review')}
          className="flex-1 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm transition-colors">
          PROCEED TO REVIEW
        </button>
      </div>
    </div>
  );

  // ── 5. Order Review ───────────────────────────────────────────
  const ScreenReview = (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-[#2a2a2a] flex items-center gap-3">
        <button onClick={() => setScreen('cart')} className="text-gray-400 hover:text-white"><ArrowLeft size={20} /></button>
        <h1 className="text-xl font-bold text-white">Review Order</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Table + Customer row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#1e1e1e] border border-[#2e2e2e] rounded-xl p-3">
            <div className="text-gray-500 text-xs mb-1">Table</div>
            <div className="text-white font-bold">
              {orderType === 'dine_in' && selectedTable ? `Table ${selectedTable.tableNumber}` : orderType === 'parcel' ? 'Parcel' : 'Takeaway'}
            </div>
            {selectedTable && orderType === 'dine_in' && (
              <>
                <div className="text-xs text-red-400 font-bold uppercase">OCCUPIED</div>
                <div className="text-gray-500 text-xs">{selectedTable.capacity} Seats</div>
              </>
            )}
          </div>
          <div className="bg-[#1e1e1e] border border-[#2e2e2e] rounded-xl p-3">
            <div className="text-gray-500 text-xs mb-1">Customer</div>
            <div className="text-white font-bold text-sm">{foundCust?.name || newCustName || 'Walk-in'}</div>
            {foundCust && (
              <div className="flex items-center gap-1 text-xs text-amber-400 mt-0.5">
                <Star size={10} className="fill-amber-400" />{foundCust.loyalty_points || 0} pts
              </div>
            )}
          </div>
        </div>

        {/* Order Summary */}
        <div>
          <div className="text-sm font-semibold text-white mb-2">Order Summary</div>
          <div className="bg-[#1e1e1e] border border-[#2e2e2e] rounded-xl divide-y divide-[#2e2e2e]">
            {cart.map(item => (
              <div key={item._id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <span className="text-white">{item.name}</span>
                  <span className="text-gray-500 ml-2 text-xs">x {item.qty}</span>
                </div>
                <span className="text-orange-400 font-bold">{fmt(item.price * item.qty)}</span>
              </div>
            ))}
            <div className="px-4 py-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-400"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
              <div className="flex justify-between text-gray-400"><span>GST (5%)</span><span>{fmt(gst)}</span></div>
              <div className="flex justify-between font-bold text-orange-400 pt-1 border-t border-[#2e2e2e]"><span>Total</span><span>{fmt(total)}</span></div>
            </div>
          </div>
        </div>

        {/* Note to kitchen */}
        <div>
          <div className="text-xs text-gray-400 mb-1.5">Note to Kitchen (Optional)</div>
          <textarea className="w-full bg-[#1e1e1e] border border-[#2e2e2e] rounded-xl p-3 text-xs text-white placeholder-gray-600 outline-none resize-none"
            rows={2} placeholder="Eg: Less sugar, No onion etc" value={specialNote} onChange={e => setSpecialNote(e.target.value)} />
        </div>
      </div>

      <div className="px-4 py-4 border-t border-[#2a2a2a] flex gap-3">
        <button onClick={() => placeOrder(false)}
          className="flex-1 py-3 border border-[#333] text-gray-300 font-bold rounded-xl text-sm hover:bg-[#252525] transition-colors">
          SAVE ORDER
        </button>
        <button onClick={() => placeOrder(true)}
          className="flex-1 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
          <Send size={15} /> SEND FOR APPROVAL
        </button>
      </div>
    </div>
  );

  // ── 6. Token Generated ────────────────────────────────────────
  const ScreenToken = (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-6">
      {/* Success icon */}
      <div className="w-24 h-24 rounded-full bg-green-500/20 border-4 border-green-500 flex items-center justify-center">
        <Check size={44} className="text-green-400 stroke-[3]" />
      </div>
      <div>
        <div className="text-green-400 text-lg font-bold">Order Saved Successfully!</div>
        <div className="text-gray-400 text-sm mt-1">Your order is pending for Bill Operator approval.</div>
      </div>

      {/* Token card */}
      <div className="w-full max-w-xs bg-[#1e1e1e] border border-[#2e2e2e] rounded-2xl p-6 space-y-3">
        <div className="text-gray-400 text-sm">TOKEN NO.</div>
        <div className="text-orange-400 text-5xl font-black">
          #{placedOrder?.tokenNumber || placedOrder?.sessionRef?.split('-').pop() || '----'}
        </div>
        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[#2e2e2e] text-xs text-center">
          <div>
            <div className="text-gray-500">Table</div>
            <div className="text-white font-bold">{placedOrder?.tableNumber || orderType === 'parcel' ? 'Parcel' : '-'}</div>
          </div>
          <div>
            <div className="text-gray-500">Seats</div>
            <div className="text-white font-bold">{selectedTable?.capacity || '-'}</div>
          </div>
          <div>
            <div className="text-gray-500">Time</div>
            <div className="text-white font-bold">{new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</div>
          </div>
        </div>
      </div>

      <div className="flex gap-3 w-full max-w-xs">
        <button onClick={() => { if (placedOrder) setTrackOrder(placedOrder); setScreen('tracking'); }}
          className="flex-1 py-3 border border-orange-500 text-orange-400 font-bold rounded-xl text-sm hover:bg-orange-500/10 transition-colors">
          VIEW STATUS
        </button>
        <button onClick={() => { resetFlow(); setScreen('tableMap'); }}
          className="flex-1 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm transition-colors">
          GO TO HOME
        </button>
      </div>
    </div>
  );

  // ── 7. Order Tracking ─────────────────────────────────────────
  const currentStep = sessionToStep(trackOrder);
  const ScreenTracking = (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-[#2a2a2a] flex items-center gap-3">
        <button onClick={() => setScreen('tableMap')} className="text-gray-400 hover:text-white"><ArrowLeft size={20} /></button>
        <h1 className="text-xl font-bold text-white">Order Status</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Info bar */}
        <div className="flex gap-3">
          <div className="bg-[#1e1e1e] border border-[#2e2e2e] rounded-xl px-4 py-3 text-xs flex-1">
            <div className="text-gray-500">Table</div>
            <div className="text-white font-bold">{trackOrder?.tableNumber || '-'}</div>
          </div>
          <div className="bg-[#1e1e1e] border border-[#2e2e2e] rounded-xl px-4 py-3 text-xs flex-1">
            <div className="text-gray-500">Token</div>
            <div className="text-orange-400 font-bold">#{trackOrder?.tokenNumber || trackOrder?.sessionRef?.split('-').pop() || '----'}</div>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-[#1e1e1e] border border-[#2e2e2e] rounded-2xl p-5">
          <div className="space-y-1">
            {STEPS.map((step, idx) => {
              const done    = idx < currentStep;
              const active  = idx === currentStep;
              const pending = idx > currentStep;
              return (
                <div key={step} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 flex-shrink-0 ${done ? 'bg-green-500 border-green-500 text-white' : active ? 'bg-orange-500 border-orange-500 text-white' : 'bg-transparent border-[#333] text-gray-600'}`}>
                      {done ? <Check size={13} /> : <span>{idx + 1}</span>}
                    </div>
                    {idx < STEPS.length - 1 && (
                      <div className={`w-0.5 h-6 mt-1 ${done ? 'bg-green-500' : 'bg-[#2e2e2e]'}`} />
                    )}
                  </div>
                  <div className={`pt-1 pb-2 ${pending ? 'opacity-40' : ''}`}>
                    <div className={`text-sm font-semibold ${active ? 'text-orange-400' : done ? 'text-white' : 'text-gray-500'}`}>{step}</div>
                    {active && <div className="text-xs text-gray-500 mt-0.5">{new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <button onClick={() => {
          if (trackOrder?._id) api.get(`/waiter/my-orders`).then(r => {
            const found = r.data.sessions?.find(s => s._id === trackOrder._id);
            if (found) setTrackOrder(found);
          });
        }}
          className="w-full py-3 border border-[#333] text-gray-300 rounded-xl text-sm font-semibold hover:bg-[#252525] transition-colors flex items-center justify-center gap-2">
          <RefreshCw size={14} /> REFRESH STATUS
        </button>
      </div>
    </div>
  );

  // ── 8. Order History ──────────────────────────────────────────
  const histFiltered = history.filter(s => {
    if (histTab === 'today') {
      const today = new Date(); today.setHours(0,0,0,0);
      return new Date(s.createdAt || s.openedAt) >= today;
    }
    if (histTab === 'completed') return s.status === 'paid' || s.status === 'closed';
    if (histTab === 'cancelled') return s.status === 'closed' && s.hold_note?.includes('Cancelled');
    return true;
  });

  const ScreenHistory = (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-[#2a2a2a] flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Order History</h1>
        <button onClick={loadHistory} className="text-gray-400 hover:text-orange-400"><RefreshCw size={16} /></button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#2a2a2a]">
        {[['today','Today\'s Orders'],['completed','Completed'],['cancelled','Cancelled']].map(([v,l]) => (
          <button key={v} onClick={() => setHistTab(v)}
            className={`flex-1 py-3 text-xs font-semibold transition-colors border-b-2 ${histTab === v ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-500 hover:text-white'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {histLoading ? (
          <div className="text-center py-8 text-gray-400 text-sm">Loading...</div>
        ) : histFiltered.length === 0 ? (
          <div className="text-center py-10 text-gray-500 text-sm">No orders found</div>
        ) : (
          <>
            {/* Column headers */}
            <div className="grid grid-cols-12 text-xs text-gray-500 pb-1 px-1">
              <span className="col-span-2">Token</span>
              <span className="col-span-3">Table</span>
              <span className="col-span-2 text-center">Items</span>
              <span className="col-span-2 text-right">Amount</span>
              <span className="col-span-3 text-right">Status</span>
            </div>
            {histFiltered.map(s => {
              const items = s.subOrders?.reduce((sum, sub) => sum + (sub.items?.length || 0), 0) || 0;
              const token = s.tokenNumber || s.sessionRef?.split('-').pop();
              const step  = sessionToStep(s);
              const statusLabel = STEPS[step] || s.status;
              const statusColor = step >= 5 ? 'text-green-400 bg-green-500/10 border-green-500/30'
                : step >= 3 ? 'text-orange-400 bg-orange-500/10 border-orange-500/30'
                : step === 0 ? 'text-red-400 bg-red-500/10 border-red-500/30'
                : 'text-gray-400 bg-[#252525] border-[#333]';
              return (
                <button key={s._id} onClick={() => { setTrackOrder(s); setScreen('tracking'); }}
                  className="w-full grid grid-cols-12 items-center bg-[#1e1e1e] border border-[#2e2e2e] rounded-xl px-3 py-3 hover:border-orange-500/30 transition-colors text-xs">
                  <span className="col-span-2 text-orange-400 font-bold">#{token || '--'}</span>
                  <span className="col-span-3 text-white">{s.tableNumber || 'Counter'}</span>
                  <span className="col-span-2 text-center text-gray-300">{items} items</span>
                  <span className="col-span-2 text-right text-white font-semibold">{fmt(s.totalAmount)}</span>
                  <span className={`col-span-3 text-right`}>
                    <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-semibold ${statusColor}`}>
                      {statusLabel}
                    </span>
                  </span>
                </button>
              );
            })}
            <button onClick={loadHistory}
              className="w-full py-3 border border-[#333] text-gray-400 rounded-xl text-sm mt-2 hover:bg-[#252525] transition-colors">
              LOAD MORE
            </button>
          </>
        )}
      </div>
    </div>
  );

  // ── 9. Bill Request ───────────────────────────────────────────
  const ScreenBillRequest = (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-[#2a2a2a] flex items-center gap-3">
        <button onClick={() => setScreen('tableMap')} className="text-gray-400 hover:text-white"><ArrowLeft size={20} /></button>
        <h1 className="text-xl font-bold text-white">Request Bill</h1>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-5">
        {/* Table info */}
        {billTable && (
          <div className="flex items-center gap-2 bg-[#1e1e1e] border border-[#2e2e2e] rounded-xl px-4 py-2.5">
            <MapPin size={14} className="text-orange-400" />
            <span className="text-white font-bold text-sm">Table {billTable.tableNumber}</span>
            <span className="text-gray-400 text-xs">| {billTable.capacity} Seats</span>
          </div>
        )}

        {/* Bill icon */}
        <div className="w-24 h-24 rounded-full bg-orange-500/10 border-2 border-orange-500/30 flex items-center justify-center">
          <Receipt size={40} className="text-orange-400" />
        </div>

        <div>
          <div className="text-white text-lg font-bold">Request Bill for this table?</div>
          <div className="text-gray-400 text-sm mt-2">Bill Operator will be notified to generate the bill.</div>
        </div>

        <div className="w-full max-w-xs space-y-3">
          <button onClick={requestBill}
            className="w-full py-3.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm transition-colors">
            REQUEST BILL
          </button>
          <button onClick={() => setScreen('tableMap')}
            className="w-full py-3 border border-[#333] text-gray-300 font-semibold rounded-xl text-sm hover:bg-[#252525] transition-colors">
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );

  // ── 10. Notifications ─────────────────────────────────────────
  // auto-clear handled by notificationStore (12h setTimeout)

  const handleAcceptDelivery = async (notif) => {
    try {
      await api.patch(`/kitchen/orders/${notif.orderId}/accept-delivery`);
      removeNotification(notif.id);
      toast.success(`Order collected! Token #${notif.tokenNumber}`);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not mark as collected');
    }
  };

  const ScreenNotifications = (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-[#2a2a2a] flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Notifications</h1>
          <p className="text-xs text-gray-500 mt-0.5">{notifs.length} total · auto-clear after 12h</p>
        </div>
        {notifs.length > 0 && (
          <button onClick={() => clearNotifs()} className="text-xs text-gray-400 hover:text-white">Clear All</button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {notifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <Bell size={48} className="text-[#333]" />
            <div className="text-gray-500 text-sm">No notifications yet</div>
          </div>
        ) : notifs.map(n => {
          const label = NOTIF_LABELS[n.type] || NOTIF_LABELS.ready;
          const colorMap = { green: 'bg-green-500/10 border-green-500/30', orange: 'bg-orange-500/10 border-orange-500/30', blue: 'bg-blue-500/10 border-blue-500/30' };
          const textMap  = { green: 'text-green-400', orange: 'text-orange-400', blue: 'text-blue-400' };
          return (
          <div key={n.id} className={`rounded-xl border p-4 transition-all ${
            n.accepted ? 'bg-gray-500/10 border-gray-500/20 opacity-70' : (colorMap[label.color] || colorMap.green)
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${n.accepted ? 'text-gray-400' : (textMap[label.color] || textMap.green)}`}>
                  {label.emoji} {label.text}
                </span>
              </div>
              <span className="text-[10px] text-gray-600">
                {new Date(n.id).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-[#1a1a1a] rounded-lg px-3 py-1.5 text-center border border-[#2a2a2a]">
                <div className="text-[10px] text-gray-500">TOKEN</div>
                <div className="text-orange-400 font-black text-base leading-tight">#{n.tokenNumber || '—'}</div>
              </div>
              <div className="bg-[#1a1a1a] rounded-lg px-3 py-1.5 text-center border border-[#2a2a2a]">
                <div className="text-[10px] text-gray-500">TABLE</div>
                <div className="text-white font-bold text-sm leading-tight">{n.tableNumber || 'Counter'}</div>
              </div>
              {n.customerName && <div className="text-xs text-gray-400">{n.customerName}</div>}
            </div>
            {n.type === 'ready' && !n.accepted && n.orderId && (
              <button onClick={() => handleAcceptDelivery(n)}
                className="w-full mt-1 py-2 bg-green-500/20 border border-green-500/40 text-green-400 font-bold text-xs rounded-lg hover:bg-green-500/30 active:scale-95 transition-all">
                ✓ ACCEPT & COLLECT ORDER
              </button>
            )}
            {n.accepted && (
              <div className="mt-1 text-xs text-gray-500 flex items-center gap-1.5">
                <CheckCircle size={11} className="text-green-500" />
                Collected by <span className="text-green-400 font-semibold">{n.acceptedBy}</span>
                {n.acceptedAt && <span>· {new Date(n.acceptedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );

  // ── 11. Profile ───────────────────────────────────────────────
  const ScreenProfile = (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-[#2a2a2a]">
        <h1 className="text-xl font-bold text-white">Profile</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Avatar + info */}
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="w-20 h-20 rounded-full bg-[#252525] border-2 border-[#333] flex items-center justify-center text-3xl font-black text-orange-400">
            {user?.name?.[0] || 'W'}
          </div>
          <div className="text-center">
            <div className="text-white text-lg font-bold">{user?.name || 'Waiter'}</div>
            <div className="text-gray-400 text-sm mt-0.5">Waiter ID: {user?.employee_id || user?._id?.slice(-6)?.toUpperCase() || 'WT0001'}</div>
            <div className="text-gray-400 text-sm">Mobile: {user?.email || user?.phone || '—'}</div>
          </div>
        </div>

        {/* Menu items */}
        <div className="bg-[#1e1e1e] border border-[#2e2e2e] rounded-2xl divide-y divide-[#2e2e2e]">
          {[
            { icon: Clock,    label: 'Shift Details',    action: null },
            { icon: Settings, label: 'Change Password',  action: null },
            { icon: Settings, label: 'App Settings',     action: null },
            { icon: AlertCircle, label: 'About App',     action: null },
          ].map(({ icon: Icon, label, action }) => (
            <button key={label} onClick={action}
              className="w-full flex items-center gap-3 px-4 py-4 hover:bg-[#252525] transition-colors">
              <Icon size={18} className="text-gray-400" />
              <span className="text-white text-sm font-medium flex-1 text-left">{label}</span>
              <ChevronRight size={16} className="text-gray-600" />
            </button>
          ))}
        </div>

        <button onClick={() => { logout(); }}
          className="w-full flex items-center gap-3 px-4 py-4 bg-[#1e1e1e] border border-red-500/30 rounded-2xl hover:bg-red-500/10 transition-colors">
          <LogOut size={18} className="text-red-400" />
          <span className="text-red-400 text-sm font-bold">Logout</span>
        </button>
      </div>
    </div>
  );

  // ── Screen router ─────────────────────────────────────────────
  const SCREENS = {
    tableMap:       ScreenTableMap,
    customerSelect: ScreenCustomerSelect,
    menu:           ScreenMenu,
    cart:           ScreenCart,
    review:         ScreenReview,
    token:          ScreenToken,
    tracking:       ScreenTracking,
    history:        ScreenHistory,
    billRequest:    ScreenBillRequest,
    notifications:  ScreenNotifications,
    orders:         ScreenHistory,
    profile:        ScreenProfile,
    settings:       ScreenProfile,
  };

  // ════════════════════════════════════════════════════════════════
  // MAIN LAYOUT
  // ════════════════════════════════════════════════════════════════
  return (
    <div className="flex h-screen bg-[#111] overflow-hidden">
      {/* ── Sidebar overlay (mobile) ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside className={`fixed lg:relative z-50 top-0 left-0 h-full w-56 bg-[#151515] border-r border-[#2a2a2a] flex flex-col transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {/* Logo */}
        <div className="px-4 py-5 border-b border-[#2a2a2a]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/20 flex items-center justify-center">
              <Coffee size={18} className="text-orange-400" />
            </div>
            <div>
              <div className="text-white font-black text-sm">UTC Café</div>
              <div className="text-orange-400 text-[10px] font-semibold uppercase tracking-wide">Waiter App</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ id, icon: Icon, label, badge }) => (
            <button key={id} onClick={() => navigate(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors relative ${screen === id ? 'bg-orange-500/20 text-orange-400 font-semibold' : 'text-gray-400 hover:text-white hover:bg-[#1e1e1e]'}`}>
              <Icon size={17} />
              <span>{label}</span>
              {badge > 0 && (
                <span className="absolute right-2 top-1.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* User info + logout */}
        <div className="px-3 py-3 border-t border-[#2a2a2a]">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold text-sm">
              {user?.name?.[0] || 'W'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-xs font-semibold truncate">{user?.name || 'Waiter'}</div>
              <div className="text-[10px] bg-orange-500/20 text-orange-400 rounded px-1 py-0.5 inline-block font-bold uppercase">Waiter</div>
            </div>
          </div>
          <button onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors text-xs mt-1">
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar (mobile only) */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-[#151515] border-b border-[#2a2a2a]">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white">
            <LayoutDashboard size={20} />
          </button>
          <div className="text-white font-bold text-sm">
            {NAV.find(n => n.id === screen)?.label || 'Waiter'}
          </div>
          <div className="relative">
            <button onClick={() => navigate('notifications')} className="text-gray-400 hover:text-orange-400">
              <Bell size={20} />
            </button>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                {unreadCount}
              </span>
            )}
          </div>
        </div>

        {/* Screen content */}
        <div className="flex-1 overflow-hidden">
          {SCREENS[screen] || ScreenTableMap}
        </div>
      </main>

      {/* ── Parcel / Sitting mandatory picker ── */}
      {showOrderTypeModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowOrderTypeModal(false)}>
          <div className="w-full sm:w-96 bg-[#161616] border border-[#2a2a2a] rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}>

            <div className="w-10 h-1 bg-[#333] rounded-full mx-auto mb-5 sm:hidden" />
            <h2 className="text-white font-bold text-lg text-center mb-1">Order Type</h2>
            <p className="text-gray-500 text-xs text-center mb-6">Select before proceeding to cart</p>

            <div className="grid grid-cols-3 gap-3 mb-4">
              {/* Sitting / Dine-in */}
              <button
                onClick={() => { setOrderType('dine_in'); setShowOrderTypeModal(false); setScreen('cart'); }}
                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all active:scale-95 ${
                  orderType === 'dine_in'
                    ? 'border-orange-500 bg-orange-500/15'
                    : 'border-[#2a2a2a] bg-[#1a1a1a] hover:border-orange-500/40'
                }`}
              >
                <span className="text-3xl">🪑</span>
                <div className="text-center">
                  <div className="text-white font-bold text-xs">Sitting</div>
                  {selectedTable && <div className="text-orange-400 text-[10px]">T{selectedTable.tableNumber}</div>}
                </div>
                {orderType === 'dine_in' && <span className="text-[9px] bg-orange-500 text-white px-1.5 py-0.5 rounded-full font-bold">✓</span>}
              </button>

              {/* Parcel */}
              <button
                onClick={() => { setOrderType('parcel'); setShowOrderTypeModal(false); setScreen('cart'); }}
                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all active:scale-95 ${
                  orderType === 'parcel'
                    ? 'border-blue-500 bg-blue-500/15'
                    : 'border-[#2a2a2a] bg-[#1a1a1a] hover:border-blue-500/40'
                }`}
              >
                <span className="text-3xl">📦</span>
                <div className="text-center">
                  <div className="text-white font-bold text-xs">Parcel</div>
                  <div className="text-blue-400 text-[10px]">Takeaway</div>
                </div>
                {orderType === 'parcel' && <span className="text-[9px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full font-bold">✓</span>}
              </button>

              {/* Counter */}
              <button
                onClick={() => { setOrderType('takeaway'); setShowOrderTypeModal(false); setScreen('cart'); }}
                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all active:scale-95 ${
                  orderType === 'takeaway'
                    ? 'border-green-500 bg-green-500/15'
                    : 'border-[#2a2a2a] bg-[#1a1a1a] hover:border-green-500/40'
                }`}
              >
                <span className="text-3xl">🏪</span>
                <div className="text-center">
                  <div className="text-white font-bold text-xs">Counter</div>
                  <div className="text-green-400 text-[10px]">Walk-in</div>
                </div>
                {orderType === 'takeaway' && <span className="text-[9px] bg-green-500 text-white px-1.5 py-0.5 rounded-full font-bold">✓</span>}
              </button>
            </div>

            <button
              onClick={() => setShowOrderTypeModal(false)}
              className="w-full py-2.5 border border-[#2a2a2a] text-gray-500 rounded-xl text-sm hover:bg-[#1a1a1a] transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
