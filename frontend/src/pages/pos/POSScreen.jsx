import { useEffect, useState, useCallback, useRef, useMemo, useTransition, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, MapPin, UtensilsCrossed, CheckSquare, PauseCircle,
  Package, BarChart2, Settings, LogOut, Search, Plus, Minus, X,
  ChevronRight, RefreshCw, Check, Coffee, Receipt, Send, ArrowLeft,
  Trash2, Printer, Phone, Star, User, Bell, Clock, IndianRupee,
  ChevronDown, AlertCircle, MessageSquare, Mail, Wallet,
  CreditCard, Smartphone,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import api from '../../lib/api';
import useAuthStore from '../../store/authStore';
import SplitPaymentModal from '../../components/pos/SplitPaymentModal';
import ThermalReceipt from '../../components/print/ThermalReceipt';
import { getSocket, joinPOSRoom, joinFranchiseRoom } from '../../lib/socket';
import { playNewOrderSound, playOrderAcceptedSound } from '../../lib/audioNotify';
import useNotificationStore, { NOTIF_LABELS } from '../../store/notificationStore';

// ── Inline SVG cart icon (avoids lucide-react ShoppingCart import conflict) ──
function ShoppingCart({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </svg>
  );
}

// ─── status config ───────────────────────────────────────────────
const TS = {
  available:     { border:'border-gray-500',   bg:'bg-[#1e1e1e]',       text:'text-white',       dot:'bg-green-500',  label:'Available' },
  occupied:      { border:'border-red-600',    bg:'bg-red-900/30',      text:'text-white',       dot:'bg-red-500',    label:'Occupied'  },
  reserved:      { border:'border-amber-500',  bg:'bg-amber-900/20',    text:'text-white',       dot:'bg-amber-500',  label:'Reserved'  },
  bill_pending:  { border:'border-yellow-500', bg:'bg-yellow-900/20',   text:'text-yellow-300',  dot:'bg-yellow-400', label:'Bill Due'  },
  needs_cleaning:{ border:'border-gray-600',   bg:'bg-gray-800/30',     text:'text-gray-300',    dot:'bg-gray-500',   label:'Cleaning'  },
};
const tsCfg = (s) => TS[s] || TS.available;
const fmt = (n) => `₹${(+(n||0)).toFixed(2)}`;
const fmtShort = (n) => `₹${(+(n||0)).toLocaleString('en-IN')}`;

// ─── TablePickerModal (for customer ID screen) ────────────────────
function TablePickerModal({ onClose, onSelect, onTakeaway }) {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const load = useCallback(async (silent=false) => {
    try { silent ? setSpinning(true) : setLoading(true);
      const r = await api.get('/tables/map'); setTables(r.data.tables || []);
    } catch {} finally { setLoading(false); setSpinning(false); }
  },[]);
  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{
    const s = getSocket(); if(!s) return;
    const h = ({tableId,status}) => setTables(p=>p.map(t=>t._id?.toString()===tableId?.toString()?{...t,status}:t));
    s.on('table:statusUpdated',h); return ()=>s.off('table:statusUpdated',h);
  },[]);
  const avail = tables.filter(t=>t.status==='available');
  const occ   = tables.filter(t=>t.status!=='available');
  const next  = avail.length>0 ? avail.reduce((a,b)=>a.tableNumber<b.tableNumber?a:b) : null;
  const lbl   = s=>({occupied:'Occupied',reserved:'Reserved',bill_pending:'Bill Due',held:'On Hold',needs_cleaning:'Cleaning'}[s]||s);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-[#1c1c1c] border border-[#2e2e2e] shadow-2xl flex flex-col" style={{maxHeight:'82vh'}}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2e2e2e]">
          <div>
            <h2 className="text-white font-bold text-base">Select Table</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-400"><span className="w-2 h-2 rounded-full bg-green-500"/>Available <strong className="text-green-400">{avail.length}</strong></span>
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-400"><span className="w-2 h-2 rounded-full bg-red-500"/>Occupied <strong className="text-red-400">{occ.length}</strong></span>
              <span className="text-xs text-gray-600">|</span>
              <span className="text-xs text-gray-400">Total <strong className="text-white">{tables.length}</strong></span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={()=>load(true)} className={`w-8 h-8 flex items-center justify-center rounded-full bg-[#2a2a2a] text-gray-400 hover:text-white transition-colors ${spinning?'animate-spin':''}`}><RefreshCw size={14}/></button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#2a2a2a] text-gray-400 hover:text-white hover:bg-[#333]"><X size={15}/></button>
          </div>
        </div>
        {next && !loading && (
          <div onClick={()=>onSelect(next)} className="mx-4 mt-3 flex items-center justify-between px-4 py-2 rounded-xl bg-green-500/10 border border-green-500/30 cursor-pointer hover:bg-green-500/20 transition-colors">
            <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/><span className="text-xs text-green-300 font-semibold">Suggested: Table {next.tableNumber}</span><span className="text-xs text-gray-500">({next.capacity} seats)</span></div>
            <span className="text-[10px] text-green-500 font-bold uppercase tracking-wide">Tap →</span>
          </div>
        )}
        <div className="overflow-y-auto flex-1 p-4 pt-3">
          {loading ? <div className="grid grid-cols-4 gap-3">{[...Array(8)].map((_,i)=><div key={i} className="h-24 rounded-xl bg-[#252525] animate-pulse"/>)}</div>
          : tables.length===0 ? <div className="text-center py-10 text-gray-500 text-sm">No tables configured.</div>
          : (
            <div className="grid grid-cols-4 gap-3">
              {tables.map(t=>{const a=t.status==='available'; return (
                <button key={t._id} onClick={()=>a&&onSelect(t)} disabled={!a} title={a?`Table ${t.tableNumber}`:`${t.tableNumber} — ${lbl(t.status)}`}
                  className={`relative flex flex-col items-center justify-center gap-1 rounded-xl border-2 py-3 px-2 transition-all duration-200 ${a?'border-green-500/60 bg-green-500/10 hover:bg-green-500/20 hover:border-green-400 hover:scale-105 cursor-pointer':'border-red-500/50 bg-red-900/20 cursor-not-allowed'}`}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" className={a?'text-green-400':'text-red-400'}><path d="M5 9h14M5 9a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2M5 9v10m14-10v10M5 19H3m2 0h14m0 0h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                  <span className={`font-black text-sm leading-none ${a?'text-white':'text-gray-300'}`}>T{t.tableNumber}</span>
                  <span className={`text-[10px] font-semibold ${a?'text-green-400':'text-red-400'}`}>{a?`${t.capacity} Seats`:lbl(t.status)}</span>
                  {!a && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 animate-pulse"/>}
                  {a  && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-green-400"/>}
                </button>
              );})}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-[#2e2e2e]">
          <button onClick={onTakeaway} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#333] text-gray-400 text-sm hover:text-white hover:bg-[#252525] transition-colors"><Plus size={14}/> New Table / Takeaway</button>
          <button onClick={onClose} className="px-5 py-2 rounded-xl bg-[#2a2a2a] text-gray-300 text-sm font-semibold hover:bg-[#353535] transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
export default function POSScreen() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  // ── nav ────────────────────────────────────────────────────────
  const [screen, setScreen] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // ── tables ─────────────────────────────────────────────────────
  const [tables, setTables]         = useState([]);
  const [tableSearch, setTableSearch] = useState('');

  // ── current flow ───────────────────────────────────────────────
  const [selectedTable, setSelectedTable]     = useState(null);
  const [isParcel, setIsParcel]               = useState(false);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [activeSession, setActiveSession]     = useState(null);

  // ── customer ───────────────────────────────────────────────────
  const [phone, setPhone]               = useState('');
  const [customer, setCustomer]         = useState(null);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [newCustName, setNewCustName]   = useState('');
  const [customerType, setCustomerType] = useState('Single');
  const [custLoading, setCustLoading]   = useState(false);

  // ── menu ───────────────────────────────────────────────────────
  const [menuItems, setMenuItems]   = useState([]);
  const [category, setCategory]     = useState('All');
  const [menuSearch, setMenuSearch] = useState('');
  const [cart, setCart]             = useState([]);
  const [specialNote, setSpecialNote] = useState('');

  // ── running order (add to existing) ───────────────────────────
  const [runningTab, setRunningTab] = useState('add'); // 'add' | 'view'

  // ── hold orders ────────────────────────────────────────────────
  const [heldOrders, setHeldOrders]     = useState([]);
  const [heldFilter, setHeldFilter]     = useState('all');
  const [heldSearch, setHeldSearch]     = useState('');

  const [expandedOrder, setExpandedOrder] = useState(null);
  const [orderHistory, setOrderHistory]   = useState([]);
  const [orderHistorySearch, setOrderHistorySearch] = useState('');
  const [orderHistoryFilter, setOrderHistoryFilter] = useState('all');
  const [orderHistoryLoading, setOrderHistoryLoading] = useState(false);
  const [showOrderTypeModal, setShowOrderTypeModal] = useState(false);
  const [showThermalReceipt, setShowThermalReceipt] = useState(false);
  const [franchiseInfo, setFranchiseInfo] = useState(null); // parcel/sitting picker

  // ── pending approvals ──────────────────────────────────────────
  const [pendingOrders, setPendingOrders] = useState([]);
  const [pendingFilter, setPendingFilter] = useState('all');

  // ── parcels ────────────────────────────────────────────────────
  const [parcelOrders, setParcelOrders] = useState([]);
  const [parcelTab, setParcelTab]       = useState('preparing');

  // ── billing ────────────────────────────────────────────────────
  const [paymentMode, setPaymentMode]   = useState('Cash');
  const [receivedAmt, setReceivedAmt]   = useState('');
  const [discount, setDiscount]         = useState(0);
  const [invoice, setInvoice]           = useState(null);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [runningInvoice, setRunningInvoice] = useState(null);
  // ── coupon ─────────────────────────────────────────────────────
  const [couponInput, setCouponInput]   = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null); // { code, discountAmount }
  const [couponLoading, setCouponLoading] = useState(false);

  // ── dashboard stats ────────────────────────────────────────────
  const [stats, setStats]           = useState({ totalOrders:0, pendingApprovals:0, heldOrders:0, parcels:0, completedOrders:0, todaySales:0, yesterdaySales:0 });
  const [recentActivity, setRecentActivity] = useState([]);
  const [notifBadge, setNotifBadge] = useState(0);
  // notifications come from global store (written by AppLayout on order:ready)
  const { notifications: notifs, unreadCount, markRead, removeNotification, clearAll } = useNotificationStore();
  // low-priority transitions — stats/activity updates won't block user interactions
  const [, startStatsTransition] = useTransition();

  // always extract the plain ID string — franchise_id may be a populated object
  const franchiseId = (user?.franchise_id?._id || user?.franchise_id)?.toString();

  // ── derived cart values ────────────────────────────────────────
  const subtotal  = cart.reduce((s,c) => s + c.price * c.qty, 0);
  const gst       = cart.reduce((s,c) => s + c.price * c.qty * (c.gst_rate||5) / 100, 0);
  const total     = subtotal + gst;
  const cartCount = cart.reduce((s,c) => s + c.qty, 0);

  // ── load tables ────────────────────────────────────────────────
  const loadTables = useCallback(async () => {
    try { const r = await api.get('/tables/map'); setTables(r.data.tables||[]); } catch {}
  },[]);

  // ── load menu ──────────────────────────────────────────────────
  const loadMenu = useCallback(async () => {
    if(!franchiseId) return;
    try { const r = await api.get(`/menu?franchiseId=${franchiseId}&limit=300`); setMenuItems(r.data.items||r.data.menuItems||[]); } catch {}
  },[franchiseId]);

  // ── load stats ─────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    try {
      const [held, pend, sessions] = await Promise.allSettled([
        api.get('/sessions/held'),
        api.get('/waiter/pending-sessions'),
        api.get('/sessions?status=open,bill_pending,paid&limit=50'),
      ]);
      const heldArr  = held.status==='fulfilled'  ? (held.value.data.sessions||[])   : [];
      const pendArr  = pend.status==='fulfilled'  ? (pend.value.data.sessions||[])   : [];
      const sessArr  = sessions.status==='fulfilled' ? (sessions.value.data.sessions||[]) : [];

      const today = new Date(); today.setHours(0,0,0,0);
      const todaySess  = sessArr.filter(s=>new Date(s.openedAt||s.createdAt)>=today);
      const todaySales = todaySess.filter(s=>s.status==='paid').reduce((sum,s)=>sum+(s.totalAmount||0),0);
      const parcelSess = heldArr.filter(s=>s.orderType==='parcel'||s.isParcel);

      // store all today's sessions for Orders History screen
      setOrderHistory(sessArr.slice().sort((a,b)=>new Date(b.openedAt||b.createdAt)-new Date(a.openedAt||a.createdAt)));

      // urgent — badge + pending list affect critical UX
      setNotifBadge(pendArr.length);
      setPendingOrders(pendArr);
      setHeldOrders(heldArr);
      setParcelOrders(parcelSess);

      // non-urgent — stats panel + activity can update at low priority
      // so they never block table clicks or menu interactions
      startStatsTransition(() => {
        setStats({
          totalOrders:      todaySess.length,
          pendingApprovals: pendArr.length,
          heldOrders:       heldArr.length,
          parcels:          parcelSess.length,
          completedOrders:  todaySess.filter(s=>s.status==='paid').length,
          todaySales,
          yesterdaySales:   todaySales * 0.87,
        });
        setRecentActivity(todaySess.slice(0,5).map(s=>({
          id:s._id, type:'order',
          text:`Order #${s.tokenNumber||s._id?.slice(-4)} — ${s.tableNumber||'Parcel'}`,
          time: format(new Date(s.openedAt||s.createdAt),'hh:mm a'),
          color: s.status==='paid'?'text-green-400':s.status==='open'?'text-orange-400':'text-yellow-400',
        })));
      });
    } catch {}
  },[]);

  useEffect(() => { loadTables(); loadMenu(); loadStats(); },[loadTables, loadMenu, loadStats]);

  // ── socket ─────────────────────────────────────────────────────
  useEffect(() => {
    if(!franchiseId) return;
    joinPOSRoom(franchiseId); joinFranchiseRoom(franchiseId);
    const socket = getSocket(); if(!socket) return;
    socket.on('table:statusUpdated', ({tableId,status}) =>
      setTables(p=>p.map(t=>t._id?.toString()===tableId?.toString()?{...t,status}:t)));
    socket.on('waiter:order_placed', () => { setNotifBadge(b=>b+1); loadStats(); playNewOrderSound(); });
    socket.on('session:paid', () => { loadStats(); loadTables(); });
    socket.on('order:new',    () => { loadStats(); }); // audio handled by AppLayout
    socket.on('order:accepted', () => { playOrderAcceptedSound(); });
    // order:ready — AppLayout global listener handles audio + toast + notificationStore
    // DO NOT add a local listener here — it would create duplicates in local state
    socket.on('order:statusUpdate', () => { loadStats(); });
    return () => {
      socket.off('table:statusUpdated'); socket.off('waiter:order_placed');
      socket.off('session:paid'); socket.off('order:new');
      socket.off('order:accepted'); socket.off('order:statusUpdate');
    };
  },[franchiseId, loadStats, loadTables]);

  // ── customer lookup ────────────────────────────────────────────
  const loadOrderHistory = useCallback(async () => {
    if (!franchiseId) return;
    setOrderHistoryLoading(true);
    try {
      const r = await api.get('/sessions?status=open,bill_pending,paid,on_hold&limit=100');
      const sessions = (r.data.sessions || []).sort(
        (a, b) => new Date(b.openedAt || b.createdAt) - new Date(a.openedAt || a.createdAt)
      );
      setOrderHistory(sessions);
    } catch { /* silent */ }
    setOrderHistoryLoading(false);
  }, [franchiseId]);

  // load order history when Orders screen is opened — MUST be after loadOrderHistory declaration
  useEffect(() => { if (screen === 'orders') loadOrderHistory(); }, [screen, loadOrderHistory]);

  const lookupCustomer = useCallback(async (val) => {
    if(val.length<10) { setCustomer(null); setIsNewCustomer(false); return; }
    setCustLoading(true);
    try {
      const r = await api.get(`/customers/lookup?phone=${val}`);
      if(r.data.customer) { setCustomer(r.data.customer); setIsNewCustomer(false); }
      else { setCustomer(null); setIsNewCustomer(true); }
    } catch { setIsNewCustomer(true); }
    finally { setCustLoading(false); }
  },[]);
  useEffect(() => { lookupCustomer(phone); },[phone, lookupCustomer]);

  // ── cart helpers ───────────────────────────────────────────────
  const addItem = (item) => setCart(p=>{
    const ex=p.find(c=>c._id===item._id);
    return ex ? p.map(c=>c._id===item._id?{...c,qty:c.qty+1}:c) : [...p,{...item,qty:1}];
  });
  const setQty = (id,delta) => setCart(p=>p.map(c=>c._id===id?{...c,qty:Math.max(0,c.qty+delta)}:c).filter(c=>c.qty>0));

  // ── table select → reserve ─────────────────────────────────────
  const handleTableSelect = async (table) => {
    try { await api.patch(`/tables/${table._id}/status`,{status:'reserved'}); } catch {}
    setSelectedTable({...table,status:'reserved'});
    setShowTablePicker(false);
    toast.success(`Table ${table.tableNumber} reserved`);
  };

  // ── start session (continue to menu) ──────────────────────────
  const startSession = async () => {
    if(!isParcel && !selectedTable) { toast.error('Select a table first'); return; }
    try {
      let custId = customer?._id;
      if(!custId && isNewCustomer && phone) {
        const r = await api.post('/customers',{ name:newCustName||'Walk-in', phone_no:phone });
        custId = r.data.customer?._id;
      }
      const r = await api.post('/sessions/start',{
        tableId: isParcel?null:selectedTable?._id,
        tableNumber: isParcel?'Parcel':selectedTable?.tableNumber,
        mobile: phone||'0000000000',
        customerId: custId||undefined,
        customerName: customer?.name||newCustName||'Walk-in',
        isParcel,
        franchiseId,
      });
      setActiveSession(r.data.session);
      setScreen('menu');
      if(selectedTable && !isParcel) await api.patch(`/tables/${selectedTable._id}/status`,{status:'occupied'});
    } catch(e) { toast.error(e.response?.data?.message||'Failed to start session'); }
  };

  // ── add order to session ───────────────────────────────────────
  const addOrderToSession = async () => {
    if(!cart.length||!activeSession) { toast.error('Add items first'); return; }
    try {
      await api.post(`/sessions/${activeSession._id}/orders`,{
        items: cart.map(c=>({menuItemId:c._id,qty:c.qty,name:c.name,price:c.price,gst_rate:c.gst_rate||5})),
        notes: specialNote,
        sendToKitchen: true,
      });
      toast.success('Order sent to kitchen!');
      setCart([]); setSpecialNote('');
      const r = await api.get(`/sessions/${activeSession._id}`);
      setActiveSession(r.data.session||r.data);
      setScreen('orderSummary');
    } catch(e) { toast.error(e.response?.data?.message||'Order failed'); }
  };

  // ── apply coupon ───────────────────────────────────────────────
  const applyCoupon = async () => {
    if (!couponInput.trim()) return;
    setCouponLoading(true);
    try {
      const r = await api.post('/coupons/validate', {
        code: couponInput.trim(),
        orderAmount: billSubtotal + billGST,
      });
      setAppliedCoupon({ code: r.data.coupon.code, discountAmount: r.data.discountAmount });
      setDiscount(r.data.discountAmount);
      toast.success(`Coupon applied! ₹${r.data.discountAmount} off`);
    } catch(e) {
      toast.error(e.response?.data?.message || 'Invalid coupon');
      setAppliedCoupon(null);
      setDiscount(0);
    } finally { setCouponLoading(false); }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
    setDiscount(0);
  };

  // ── generate bill ──────────────────────────────────────────────
  const generateBill = async () => {
    if (!activeSession) return;

    // Split payment — generate bill first, then open modal
    if (paymentMode === 'Split') {
      try {
        const billRes = await api.post(`/sessions/${activeSession._id}/bill`, {
          couponCode: appliedCoupon?.code || undefined,
        });
        // Update session so SplitPaymentModal gets correct totalAmount
        const updatedSession = billRes.data.session || activeSession;
        setActiveSession(updatedSession);
        setShowSplitModal(true);
      } catch (e) { toast.error(e.response?.data?.message || 'Bill generation failed'); }
      return;
    }

    try {
      // Step 1: generate bill
      const r = await api.post(`/sessions/${activeSession._id}/bill`, {
        couponCode: appliedCoupon?.code || undefined,
      });
      setRunningInvoice(r.data.invoice || r.data);
      const billTotal = r.data.session?.totalAmount || r.data.invoice?.final_amount;

      // UPI — show QR receipt before recording payment
      if (paymentMode === 'UPI') {
        const updated = await api.get(`/sessions/${activeSession._id}`);
        setActiveSession(updated.data.session || updated.data);
        if (!franchiseInfo && franchiseId) {
          api.get(`/franchises/${franchiseId}`)
            .then(fr => setFranchiseInfo(fr.data.franchise || fr.data))
            .catch(() => {});
        }
        setShowThermalReceipt(true);
        return;
      }

      // Cash / Card — record payment immediately
      const received = parseFloat(receivedAmt) || billTotal || 0;
      if (!received || received <= 0) {
        toast.error('Enter received amount');
        return;
      }
      const payRes = await api.post(`/sessions/${activeSession._id}/payment`, {
        method: paymentMode,
        amount: received,
        reference: '',
      });
      setInvoice(payRes.data.invoice || r.data.invoice || null);
      setActiveSession(payRes.data.session || activeSession);
      loadStats(); loadTables();
      setScreen('invoice'); // go to invoice screen
    } catch (e) { toast.error(e.response?.data?.message || 'Billing failed'); }
  };

  // ── hold session ───────────────────────────────────────────────
  const holdSession = async () => {
    if(!activeSession) return;
    try {
      await api.post(`/sessions/${activeSession._id}/hold`,{note:'Held by POS operator'});
      toast.success('Order put on hold');
      resetFlow(); setScreen('dashboard'); loadStats();
    } catch(e) { toast.error(e.response?.data?.message||'Hold failed'); }
  };

  // ── resume held session ────────────────────────────────────────
  const resumeSession = async (sessionId) => {
    try {
      const r = await api.post(`/sessions/${sessionId}/resume`);
      setActiveSession(r.data.session||r.data);
      const sess = r.data.session||r.data;
      if(sess.tableId||sess.tableNumber) {
        const t = tables.find(t=>t.tableNumber===sess.tableNumber||t._id?.toString()===sess.tableId?.toString());
        if(t) setSelectedTable(t);
      }
      // ── BUG FIX: refresh held-orders list so a resumed session is removed
      // immediately — without this the stale entry stays, and a second click
      // hits the backend with status !== 'on_hold' → 400
      loadStats();
      setScreen('runningOrder');
    } catch(e) { toast.error(e.response?.data?.message||'Resume failed'); }
  };

  // ── approve waiter order ───────────────────────────────────────
  const approveWaiterOrder = async (sessionId) => {
    try {
      await api.post(`/waiter/sessions/${sessionId}/approve`);
      toast.success('Order approved & sent to kitchen');
      loadStats();
    } catch(e) { toast.error(e.response?.data?.message||'Approve failed'); }
  };

  const rejectWaiterOrder = async (sessionId) => {
    try {
      await api.post(`/waiter/sessions/${sessionId}/reject`,{reason:'Rejected by POS operator'});
      toast.success('Order rejected');
      loadStats();
    } catch(e) { toast.error(e.response?.data?.message||'Reject failed'); }
  };

  // ── reset flow ─────────────────────────────────────────────────
  const resetFlow = () => {
    if(selectedTable?.status==='reserved') {
      api.patch(`/tables/${selectedTable._id}/status`,{status:'available'}).catch(()=>{});
    }
    setSelectedTable(null); setActiveSession(null); setPhone(''); setCustomer(null);
    setIsNewCustomer(false); setNewCustName(''); setCustomerType('Single');
    setCart([]); setSpecialNote(''); setIsParcel(false); setPaymentMode('Cash');
    setReceivedAmt(''); setDiscount(0); setInvoice(null); setRunningInvoice(null);
    setCouponInput(''); setAppliedCoupon(null);
    setShowTablePicker(false); setRunningTab('add');
  };

  // ── filtered menu ──────────────────────────────────────────────
  const [debouncedMenuSearch, setDebouncedMenuSearch] = useState('');
  const menuSearchTimer = useRef(null);
  const handleMenuSearchChange = (e) => {
    setMenuSearch(e.target.value);
    clearTimeout(menuSearchTimer.current);
    menuSearchTimer.current = setTimeout(() => setDebouncedMenuSearch(e.target.value), 250);
  };
  const menuCats = useMemo(() => ['All',...new Set(menuItems.map(i=>i.category).filter(Boolean))], [menuItems]);
  const filteredMenu = useMemo(() => menuItems.filter(i=>{
    const c = category==='All'||i.category===category;
    const s = !debouncedMenuSearch||i.name?.toLowerCase().includes(debouncedMenuSearch.toLowerCase());
    return c&&s&&i.availability!==false;
  }), [menuItems, category, debouncedMenuSearch]);

  // ── filtered tables ────────────────────────────────────────────
  const filteredTables = useMemo(() => tables.filter(t=>!tableSearch||String(t.tableNumber).includes(tableSearch)), [tables, tableSearch]);
  const tCount = {
    available:tables.filter(t=>t.status==='available').length,
    occupied: tables.filter(t=>t.status==='occupied').length,
    reserved: tables.filter(t=>t.status==='reserved').length,
    cleaning: tables.filter(t=>t.status==='needs_cleaning').length,
  };

  // ── open occupied table → running order ───────────────────────
  const openOccupiedTable = async (t) => {
    setSelectedTable(t);
    try {
      const r = await api.get('/sessions?status=open,bill_pending');
      const sess = (r.data.sessions||[]).find(s=>s.tableNumber===t.tableNumber||s.tableId?.toString()===t._id?.toString());
      if(sess) {
        setActiveSession(sess);
        // ── BUG FIX: restore customer state from session so the customer
        // details panel shows name/phone/points for the POS operator
        const cust = sess.customerId && typeof sess.customerId === 'object' ? sess.customerId : null;
        if(cust) {
          setCustomer(cust);
          setPhone(sess.customerMobile || cust.phone_no || '');
        } else if(sess.customerMobile) {
          setPhone(sess.customerMobile);
        }
        setScreen('runningOrder');
      }
      else { setScreen('customerID'); }
    } catch { setScreen('customerID'); }
  };

  // ═══════════════════════════════════════════════════════════════
  // SCREENS
  // ═══════════════════════════════════════════════════════════════

  // ── 1. DASHBOARD ──────────────────────────────────────────────
  const ScreenDashboard = (
    <div className="flex gap-5 h-full overflow-hidden p-5">
      {/* Left: Table Map */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-bold text-lg">Table Map — Ground Floor</h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-[#1e1e1e] border border-[#2a2a2a] rounded-lg px-3 py-1.5 text-xs text-gray-300">
              Ground Floor <ChevronDown size={11} className="ml-1"/>
            </div>
            <button onClick={()=>{loadTables();loadStats();}} className="flex items-center gap-1.5 bg-[#1e1e1e] border border-[#2a2a2a] rounded-lg px-3 py-1.5 text-xs text-gray-300 hover:text-white transition-colors">
              <RefreshCw size={11}/> Refresh
            </button>
          </div>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 mb-3 text-xs text-gray-400">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-500/30 border border-green-500"/>Available</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500/30 border border-red-500"/>Occupied</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-500/30 border border-amber-500"/>Reserved</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-500/30 border border-gray-500"/>Cleaning</span>
        </div>
        {/* Table grid */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-4 gap-3">
            {filteredTables.map(t=>{
              const cfg = tsCfg(t.status);
              const isOcc = t.status!=='available';
              return (
                <button key={t._id}
                  onClick={()=>isOcc ? openOccupiedTable(t) : (setSelectedTable(t), setScreen('customerID'))}
                  className={`relative flex flex-col items-start rounded-xl border-2 p-3 transition-transform hover:shadow-lg ${cfg.border} ${cfg.bg}`}
                  style={{willChange:'transform',transform:'translateZ(0)'}}>
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-white font-black text-xl">{t.tableNumber}</span>
                    <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot} ${isOcc?'animate-pulse':''}`}/>
                  </div>
                  <span className="text-gray-400 text-xs">{t.capacity} Seats</span>
                  {t.status==='bill_pending' && <span className="text-yellow-400 text-[10px] font-bold">Bill Due</span>}
                  {t.status==='reserved' && t.hold_note && <span className="text-amber-400 text-[10px] font-mono">{t.hold_note?.slice(0,6)}</span>}
                  {t.heldAmount && <span className="text-orange-400 text-[10px] font-bold mt-0.5">{fmt(t.heldAmount)}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right: Stats + Activity */}
      <div className="w-72 flex flex-col gap-4 overflow-y-auto flex-shrink-0">
        <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-2xl p-4">
          <div className="text-white font-bold text-sm mb-3">Today's Overview</div>
          <div className="space-y-2.5">
            {[
              ['Total Orders',      stats.totalOrders,      'text-white',    ()=>setScreen('dashboard')],
              ['Pending Approvals', stats.pendingApprovals, 'text-orange-400', ()=>setScreen('approvals')],
              ['Held Orders',       stats.heldOrders,       'text-yellow-400', ()=>setScreen('holdOrders')],
              ['Parcels',           stats.parcels,          'text-blue-400',  ()=>setScreen('parcels')],
              ['Completed Orders',  stats.completedOrders,  'text-green-400', ()=>{}],
            ].map(([lbl,val,cls,action])=>(
              <div key={lbl} onClick={action} className="flex items-center justify-between cursor-pointer hover:opacity-80">
                <span className="text-gray-400 text-xs">{lbl}</span>
                <span className={`font-bold text-base ${cls}`}>{val}</span>
              </div>
            ))}
            <div className="border-t border-[#2a2a2a] pt-2 mt-1">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-xs">Today's Sales</span>
                <span className="text-orange-400 font-black text-base">{fmtShort(stats.todaySales)}</span>
              </div>
              <div className="text-xs text-green-400 text-right mt-0.5">vs Yesterday +13.5%</div>
            </div>
          </div>
        </div>

        <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-2xl p-4 flex-1">
          <div className="text-white font-bold text-sm mb-3">Recent Activity</div>
          {recentActivity.length===0 ? (
            <div className="text-gray-500 text-xs text-center py-4">No activity today</div>
          ) : (
            <div className="space-y-3">
              {recentActivity.map(a=>(
                <div key={a.id} className="flex items-start gap-2">
                  <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${a.color.replace('text-','bg-')}`}/>
                  <div>
                    <div className={`text-xs font-semibold ${a.color}`}>{a.text}</div>
                    <div className="text-gray-500 text-[10px]">{a.time}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ── 2. CUSTOMER IDENTIFICATION ────────────────────────────────
  const ScreenCustomerID = (
    <div className="h-full overflow-y-auto p-5 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={()=>{resetFlow();setScreen('dashboard');}} className="text-gray-400 hover:text-white"><ArrowLeft size={20}/></button>
        <div>
          <h1 className="text-xl font-bold text-white">Customer Details</h1>
          <div className="flex items-center gap-2 mt-0.5">
            {selectedTable && !isParcel && <span className="text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded font-bold">Table {selectedTable.tableNumber} — OCCUPIED</span>}
            {isParcel && <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded font-bold">PARCEL</span>}
          </div>
        </div>
      </div>

      {/* Existing / New toggle */}
      <div className="flex rounded-xl overflow-hidden border border-[#2a2a2a] mb-5">
        {[['existing','Existing Customer'],['new','New Customer']].map(([v,l])=>(
          <button key={v} onClick={()=>{setIsNewCustomer(v==='new'); if(v==='new'){setPhone('');setCustomer(null);}}}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${(!isNewCustomer&&v==='existing')||(isNewCustomer&&v==='new')?'bg-orange-500 text-white':'bg-[#1a1a1a] text-gray-400 hover:text-white'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Mobile search */}
      <div className="mb-4">
        <label className="block text-xs text-gray-400 mb-1.5 font-semibold">Mobile Number *</label>
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2.5">
            <Phone size={14} className="text-gray-400"/>
            <input className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none"
              placeholder="Enter mobile number" value={phone}
              onChange={e=>setPhone(e.target.value.replace(/\D/g,'').slice(0,10))} maxLength={10}/>
            {custLoading && <RefreshCw size={13} className="text-orange-400 animate-spin"/>}
          </div>
          <button onClick={()=>lookupCustomer(phone)} className="px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm transition-colors">
            Search
          </button>
        </div>
      </div>

      {/* Found customer */}
      {customer && (
        <div className="rounded-xl bg-[#1a1a1a] border border-green-500/30 p-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-black text-base">{customer.name?.[0]||'?'}</div>
            <div>
              <div className="text-white font-bold">{customer.name}</div>
              <div className="text-gray-400 text-xs">{customer.phone_no}</div>
            </div>
            <div className="ml-auto text-right">
              <div className="flex items-center gap-1 text-amber-400 text-xs justify-end"><Star size={10} className="fill-amber-400"/>{customer.loyalty_points||0} pts</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[#2a2a2a] text-xs text-center">
            <div><div className="text-gray-500">Loyalty Points</div><div className="text-amber-400 font-bold flex items-center justify-center gap-1"><Star size={10} className="fill-amber-400"/>{customer.loyalty_points||0}</div></div>
            <div><div className="text-gray-500">Total Visits</div><div className="text-white font-bold">{customer.total_visits||0}</div></div>
            <div><div className="text-gray-500">Last Visit</div><div className="text-white font-bold text-[10px]">{customer.last_visit?format(new Date(customer.last_visit),'d MMM yyyy'):'—'}</div></div>
          </div>
        </div>
      )}

      {/* New customer name */}
      {isNewCustomer && (
        <div className="mb-4">
          <label className="block text-xs text-gray-400 mb-1.5 font-semibold">Customer Name (Optional)</label>
          <input className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 outline-none"
            placeholder="Enter name" value={newCustName} onChange={e=>setNewCustName(e.target.value)}/>
        </div>
      )}

      {/* Customer type */}
      <div className="mb-5">
        <label className="block text-xs text-gray-400 mb-1.5 font-semibold">Customer Type (For Analytics Only)</label>
        <div className="flex gap-2">
          {['Single','Couple','Family','Group'].map(t=>(
            <button key={t} onClick={()=>setCustomerType(t)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${customerType===t?'bg-orange-500 border-orange-500 text-white':'bg-[#1a1a1a] border-[#2a2a2a] text-gray-400 hover:text-white'}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="text-[10px] text-gray-600 mt-1">(This information will not be printed on the bill)</div>
      </div>

      <button onClick={startSession}
        className="w-full py-3.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-base transition-colors">
        CONTINUE TO MENU
      </button>
    </div>
  );

  // ── 3. MENU & ORDER ───────────────────────────────────────────
  const ScreenMenu = (
    <div className="flex h-full overflow-hidden">
      {/* Left: Menu */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-[#2a2a2a]">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2a2a2a]">
          <button onClick={()=>setScreen('customerID')} className="text-gray-400 hover:text-white"><ArrowLeft size={18}/></button>
          <div className="flex items-center gap-2">
            <span className="text-white font-bold">{customer?.name||newCustName||'Walk-in'}</span>
            {selectedTable && !isParcel && <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded font-bold uppercase">OCCUPIED</span>}
            {selectedTable && !isParcel && <span className="text-xs text-gray-400">{selectedTable.capacity} Seats</span>}
            {isParcel && <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded font-bold uppercase">PARCEL</span>}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <User size={14} className="text-gray-400"/>
            <Receipt size={14} className="text-gray-400 cursor-pointer hover:text-orange-400" onClick={()=>setScreen('orderSummary')}/>
            <ChevronDown size={14} className="text-gray-400"/>
          </div>
        </div>
        {/* Search */}
        <div className="px-4 py-2 border-b border-[#2a2a2a]">
          <div className="flex items-center gap-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2">
            <Search size={13} className="text-gray-400"/>
            <input className="flex-1 bg-transparent text-xs text-white placeholder-gray-500 outline-none"
              placeholder="Search menu items..." value={menuSearch} onChange={handleMenuSearchChange}/>
          </div>
        </div>
        {/* Category tabs */}
        <div className="px-4 py-2 border-b border-[#2a2a2a] flex gap-2 overflow-x-auto">
          {menuCats.map(cat=>(
            <button key={cat} onClick={()=>setCategory(cat)}
              className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${category===cat?'bg-orange-500 text-white':'bg-[#1a1a1a] text-gray-400 hover:text-white'}`}>
              {cat}
            </button>
          ))}
        </div>
        {/* Menu grid */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredMenu.map(item=>{
              const inCart=cart.find(c=>c._id===item._id);
              return (
                <div key={item._id} onClick={()=>addItem(item)} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden hover:border-orange-500/50 hover:bg-[#222] active:scale-95 transition-all cursor-pointer select-none">
                  <div className="h-16 bg-[#222] flex items-center justify-center relative overflow-hidden">
                    {item.image?.url
                      ? <img src={item.image.url} alt={item.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                      : <span className="text-3xl font-black text-[#333]">{item.category?.[0]?.toUpperCase()||'C'}</span>
                    }
                    <span className={`absolute top-1 left-1 w-3 h-3 rounded-full border border-white/10 ${item.isVeg===false?'bg-red-500':'bg-green-500'}`}/>
                    {inCart && <span className="absolute top-1 right-1 bg-orange-500 text-white text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center">{inCart.qty}</span>}
                  </div>
                  <div className="p-2">
                    <div className="text-white text-xs font-semibold truncate">{item.name}</div>
                    <div className="text-orange-400 text-xs font-bold">{fmt(item.price)}</div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-gray-500 text-[10px]">{item.gst_rate||5}% GST</span>
                      {inCart ? (
                        <div className="flex items-center gap-1" onClick={e=>e.stopPropagation()}>
                          <button onClick={()=>setQty(item._id,-1)} className="w-5 h-5 rounded bg-orange-500/20 text-orange-400 flex items-center justify-center text-xs"><Minus size={9}/></button>
                          <span className="text-white text-xs font-bold w-4 text-center">{inCart.qty}</span>
                          <button onClick={()=>setQty(item._id,1)} className="w-5 h-5 rounded bg-orange-500 text-white flex items-center justify-center text-xs"><Plus size={9}/></button>
                        </div>
                      ):(
                        <Plus size={14} className="text-orange-400"/>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {/* Bottom bar */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-[#2a2a2a]">
          <button onClick={holdSession} className="px-4 py-2 border border-[#333] text-gray-300 font-bold rounded-xl text-sm hover:bg-[#252525] transition-colors">HOLD ORDER</button>
          <button
            onClick={() => cartCount > 0 && setShowOrderTypeModal(true)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-colors ${cartCount>0?'bg-orange-500 hover:bg-orange-400 text-white':'bg-[#252525] text-gray-500 cursor-not-allowed'}`}>
            <ShoppingCart size={14}/> {cartCount} Items | {fmt(total)}
          </button>
          <button onClick={() => cartCount > 0 && setShowOrderTypeModal(true)} className="px-4 py-2 border border-orange-500/40 text-orange-400 font-bold rounded-xl text-sm hover:bg-orange-500/10 transition-colors">VIEW ORDER</button>
        </div>
      </div>

      {/* Right: Current Order panel */}
      <div className="w-72 flex flex-col bg-[#111] flex-shrink-0">
        <div className="px-4 py-3 border-b border-[#2a2a2a]">
          <div className="text-white font-bold text-sm">Current Order ({cartCount} Items)</div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length===0 ? (
            <div className="text-center py-8 text-gray-600 text-xs">No items added</div>
          ) : cart.map(item=>(
            <div key={item._id} className="flex items-center gap-2 text-xs">
              <div className="flex-1">
                <div className="text-white font-medium">{item.name}</div>
                <div className="text-orange-400">{fmt(item.price)}</div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={()=>setQty(item._id,-1)} className="w-5 h-5 rounded bg-[#2a2a2a] text-white flex items-center justify-center"><Minus size={8}/></button>
                <span className="text-white font-bold w-4 text-center">{item.qty}</span>
                <button onClick={()=>setQty(item._id,1)} className="w-5 h-5 rounded bg-orange-500 text-white flex items-center justify-center"><Plus size={8}/></button>
              </div>
              <div className="text-white font-bold w-14 text-right">{fmt(item.price*item.qty)}</div>
              <button onClick={()=>setCart(p=>p.filter(c=>c._id!==item._id))} className="text-gray-600 hover:text-red-400"><X size={12}/></button>
            </div>
          ))}
        </div>
        {cart.length>0 && (
          <>
            <div className="px-3 py-2 border-t border-[#2a2a2a]">
              <textarea className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-2 text-xs text-white placeholder-gray-600 outline-none resize-none"
                rows={2} placeholder="Special Instructions..." value={specialNote} onChange={e=>setSpecialNote(e.target.value)}/>
            </div>
            <div className="px-4 py-3 space-y-1.5 text-xs border-t border-[#2a2a2a]">
              <div className="flex justify-between text-gray-400"><span>Subtotal</span><span className="text-white">{fmt(subtotal)}</span></div>
              <div className="flex justify-between text-gray-400"><span>GST (5%)</span><span className="text-white">{fmt(gst)}</span></div>
              <div className="flex justify-between font-bold text-sm border-t border-[#2a2a2a] pt-1.5">
                <span className="text-white">Total</span><span className="text-orange-400">{fmt(total)}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );

  // ── 4. ORDER SUMMARY ──────────────────────────────────────────
  const prevItems = activeSession?.subOrders?.flatMap(s=>s.items||[])||[];
  const prevTotal = prevItems.reduce((s,i)=>s+(i.totalPrice||i.price*i.qty||0),0);
  const ScreenOrderSummary = (
    <div className="h-full overflow-y-auto p-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={()=>setScreen('menu')} className="text-gray-400 hover:text-white"><ArrowLeft size={20}/></button>
          <div>
            <span className="text-white font-bold text-lg">
              {selectedTable&&!isParcel?`Table ${selectedTable.tableNumber}`:'Parcel'}
            </span>
            {cartCount>0 && <span className="ml-2 text-xs text-gray-400">{cartCount} items</span>}
          </div>
        </div>
      </div>

      {/* ── Parcel / Sitting toggle ── */}
      <div className="flex rounded-xl overflow-hidden border border-[#2a2a2a] mb-4">
        <button
          onClick={() => setIsParcel(false)}
          className={`flex-1 py-3 flex items-center justify-center gap-2 text-sm font-bold transition-colors ${
            !isParcel ? 'bg-orange-500 text-white' : 'bg-[#1a1a1a] text-gray-400 hover:text-white'
          }`}
        >
          🪑 Sitting {!isParcel && selectedTable && <span className="text-xs opacity-75">· Table {selectedTable.tableNumber}</span>}
        </button>
        <button
          onClick={() => setIsParcel(true)}
          className={`flex-1 py-3 flex items-center justify-center gap-2 text-sm font-bold transition-colors ${
            isParcel ? 'bg-blue-500 text-white' : 'bg-[#1a1a1a] text-gray-400 hover:text-white'
          }`}
        >
          📦 Parcel
        </button>
      </div>

      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#2a2a2a] bg-[#161616]">
          <div className="text-white font-bold">Order Summary</div>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[#2a2a2a]">
            {['Item','Qty','Rate','Amount','Action'].map(h=>(
              <th key={h} className="px-4 py-2.5 text-left text-xs text-gray-500 font-semibold">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {cart.map((item,i)=>(
              <tr key={item._id} className="border-b border-[#2a2a2a] hover:bg-[#1e1e1e]">
                <td className="px-4 py-2.5 text-white text-xs">{item.name}</td>
                <td className="px-4 py-2.5 text-gray-300 text-xs">{item.qty}</td>
                <td className="px-4 py-2.5 text-gray-300 text-xs">{fmt(item.price)}</td>
                <td className="px-4 py-2.5 text-orange-400 font-bold text-xs">{fmt(item.price*item.qty)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <button onClick={()=>setQty(item._id,-1)} className="w-5 h-5 rounded bg-[#2a2a2a] text-white flex items-center justify-center"><Minus size={8}/></button>
                    <button onClick={()=>setQty(item._id,1)} className="w-5 h-5 rounded bg-[#2a2a2a] text-white flex items-center justify-center"><Plus size={8}/></button>
                    <button onClick={()=>setCart(p=>p.filter(c=>c._id!==item._id))} className="w-5 h-5 rounded bg-red-500/20 text-red-400 flex items-center justify-center"><Trash2 size={8}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {specialNote && (
          <div className="px-4 py-3 border-t border-[#2a2a2a]">
            <div className="text-xs text-gray-500 mb-1">Special Instructions</div>
            <div className="text-xs text-white">{specialNote}</div>
          </div>
        )}

        <div className="px-5 py-4 border-t border-[#2a2a2a] space-y-2 text-sm">
          <div className="flex justify-between text-gray-400"><span>Subtotal</span><span className="text-white">{fmt(subtotal)}</span></div>
          <div className="flex justify-between text-gray-400"><span>GST (5%)</span><span className="text-white">{fmt(gst)}</span></div>
          <div className="flex justify-between font-black text-base border-t border-[#2a2a2a] pt-2">
            <span className="text-white">Grand Total</span><span className="text-orange-400">{fmt(total)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <button onClick={addOrderToSession}
          className="py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2 col-span-2">
          <Send size={16}/> APPROVE & SEND TO KITCHEN
        </button>
        <button onClick={addOrderToSession}
          className="py-3 border border-orange-500/40 text-orange-400 font-bold rounded-xl text-sm hover:bg-orange-500/10 transition-colors">
          SAVE ORDER
        </button>
        <button onClick={()=>{ addOrderToSession(); }}
          className="py-3 border border-[#333] text-gray-300 font-bold rounded-xl text-sm hover:bg-[#252525] transition-colors">
          SAVE WITHOUT APPROVAL
        </button>
        <button onClick={holdSession}
          className="py-3 border border-yellow-500/40 text-yellow-400 font-bold rounded-xl text-sm hover:bg-yellow-500/10 transition-colors">
          HOLD ORDER
        </button>
        <button onClick={()=>{setCart([]); setScreen('menu');}}
          className="py-3 border border-red-500/40 text-red-400 font-bold rounded-xl text-sm hover:bg-red-500/10 transition-colors">
          CLEAR ORDER
        </button>
      </div>
    </div>
  );

  // ── 5. RUNNING ORDER (Add Items to Existing) ──────────────────
  const ScreenRunningOrder = (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2a2a2a]">
          <button onClick={()=>setScreen('dashboard')} className="text-gray-400 hover:text-white"><ArrowLeft size={18}/></button>
          <span className="text-white font-bold">Table {selectedTable?.tableNumber||'—'}</span>
          <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded font-bold">OCCUPIED</span>
          <span className="text-xs text-gray-400">{selectedTable?.capacity} Seats</span>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#2a2a2a]">
          {[['add','Add New Items'],['view','Edit / View Items']].map(([v,l])=>(
            <button key={v} onClick={()=>setRunningTab(v)}
              className={`px-5 py-2.5 text-sm font-semibold transition-colors border-b-2 ${runningTab===v?'border-orange-500 text-white':'border-transparent text-gray-500 hover:text-white'}`}>
              {l}
            </button>
          ))}
        </div>

        {runningTab==='add' ? (
          <>
            {/* Category + menu grid */}
            <div className="px-4 py-2 border-b border-[#2a2a2a] flex gap-2 overflow-x-auto">
              {menuCats.map(cat=>(
                <button key={cat} onClick={()=>setCategory(cat)}
                  className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${category===cat?'bg-orange-500 text-white':'bg-[#1a1a1a] text-gray-400 hover:text-white'}`}>
                  {cat}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-3 grid grid-cols-3 xl:grid-cols-4 gap-3 content-start">
              {filteredMenu.map(item=>{
                const inCart=cart.find(c=>c._id===item._id);
                return (
                  <div key={item._id} onClick={()=>addItem(item)} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden hover:border-orange-500/50 hover:bg-[#222] active:scale-95 transition-all cursor-pointer select-none">
                    <div className="h-14 bg-[#222] flex items-center justify-center relative overflow-hidden">
                      {item.image?.url
                        ? <img src={item.image.url} alt={item.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                        : <span className="text-2xl font-black text-[#333]">{item.category?.[0]||'C'}</span>
                      }
                      {inCart && <span className="absolute top-1 right-1 bg-orange-500 text-white text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center">{inCart.qty}</span>}
                    </div>
                    <div className="p-2">
                      <div className="text-white text-xs font-semibold truncate">{item.name}</div>
                      <div className="text-orange-400 text-xs font-bold">{fmt(item.price)}</div>
                      <div className="flex items-center justify-between mt-1" onClick={e=>e.stopPropagation()}>
                        {inCart?(<div className="flex items-center gap-1">
                          <button onClick={()=>setQty(item._id,-1)} className="w-5 h-5 rounded bg-orange-500/20 text-orange-400 flex items-center justify-center"><Minus size={8}/></button>
                          <span className="text-white text-xs font-bold w-3 text-center">{inCart.qty}</span>
                          <button onClick={()=>setQty(item._id,1)} className="w-5 h-5 rounded bg-orange-500 text-white flex items-center justify-center"><Plus size={8}/></button>
                        </div>):(
                          <Plus size={13} className="text-orange-400 ml-auto"/>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-3 px-4 py-3 border-t border-[#2a2a2a]">
              <button onClick={addOrderToSession} className="flex-1 py-2.5 bg-[#1a1a1a] border border-[#333] text-white font-bold rounded-xl text-sm hover:bg-[#252525] transition-colors">
                ADD ITEMS & SAVE
              </button>
              <button onClick={addOrderToSession} className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm transition-colors">
                APPROVE & SEND TO KITCHEN
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden">
              <div className="px-4 py-2 border-b border-[#2a2a2a] grid grid-cols-5 text-xs text-gray-500 font-semibold">
                <span className="col-span-2">Item</span><span>Qty</span><span>Rate</span><span>Amount</span>
              </div>
              {prevItems.map((it,i)=>(
                <div key={i} className="px-4 py-2.5 border-b border-[#2a2a2a] grid grid-cols-5 text-xs items-center">
                  <span className="col-span-2 text-white">{it.name}</span>
                  <span className="text-gray-300">{it.qty}</span>
                  <span className="text-gray-300">{fmt(it.unitPrice||it.price)}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-orange-400 font-bold">{fmt(it.totalPrice||it.price*it.qty)}</span>
                    <button className="text-gray-600 hover:text-red-400"><Trash2 size={10}/></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right Summary */}
      <div className="w-64 border-l border-[#2a2a2a] p-4 flex flex-col gap-4 flex-shrink-0 bg-[#111]">
        <div className="text-white font-bold text-sm">Summary</div>
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3 space-y-1.5 text-xs">
          <div className="flex justify-between text-gray-400"><span>Previous Order</span><span className="text-white">{fmt(prevTotal)}</span></div>
          <div className="flex justify-between text-gray-400"><span>New Items Amount</span><span className="text-white">{fmt(subtotal)}</span></div>
          <div className="border-t border-[#2a2a2a] pt-1.5 space-y-1">
            <div className="flex justify-between text-gray-400"><span>Subtotal</span><span className="text-white">{fmt(prevTotal+subtotal)}</span></div>
            <div className="flex justify-between text-gray-400"><span>GST (5%)</span><span className="text-white">{fmt(gst)}</span></div>
            <div className="flex justify-between font-black text-sm pt-1 border-t border-[#2a2a2a]">
              <span className="text-white">Grand Total</span>
              <span className="text-orange-400">{fmt(prevTotal+subtotal+gst)}</span>
            </div>
          </div>
        </div>
        <div className="space-y-2 mt-auto">
          <button onClick={()=>setScreen('billing')} className="w-full py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm transition-colors">GENERATE BILL</button>
          <button onClick={holdSession} className="w-full py-2 border border-yellow-500/40 text-yellow-400 font-semibold rounded-xl text-xs hover:bg-yellow-500/10 transition-colors">HOLD ORDER</button>
        </div>
      </div>
    </div>
  );

  // ── 6. HOLD ORDERS ────────────────────────────────────────────
  const filteredHeld = heldOrders.filter(s=>{
    const typeMatch = heldFilter==='all'||(heldFilter==='dine_in'&&!s.isParcel)||(heldFilter==='parcel'&&s.isParcel);
    const searchMatch = !heldSearch||s.tableNumber?.toString().includes(heldSearch)||s.customerName?.toLowerCase().includes(heldSearch.toLowerCase());
    return typeMatch&&searchMatch;
  });
  const ScreenHoldOrders = (
    <div className="flex flex-col h-full p-5">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-white">Hold Orders</h1>
        <button onClick={loadStats} className="text-gray-400 hover:text-orange-400"><RefreshCw size={16}/></button>
      </div>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 flex items-center gap-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2">
          <Search size={13} className="text-gray-400"/>
          <input className="flex-1 bg-transparent text-xs text-white placeholder-gray-500 outline-none"
            placeholder="Search by table, name or mobile..." value={heldSearch} onChange={e=>setHeldSearch(e.target.value)}/>
        </div>
        <div className="flex rounded-xl overflow-hidden border border-[#2a2a2a]">
          {[['all',`All (${heldOrders.length})`],['dine_in',`Dine In (${heldOrders.filter(s=>!s.isParcel).length})`],['parcel',`Parcel (${heldOrders.filter(s=>s.isParcel).length})`]].map(([v,l])=>(
            <button key={v} onClick={()=>setHeldFilter(v)}
              className={`px-3 py-2 text-xs font-semibold transition-colors ${heldFilter===v?'bg-orange-500 text-white':'bg-[#1a1a1a] text-gray-400 hover:text-white'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[#2a2a2a] bg-[#161616]">
            {['Order No.','Table / Type','Customer','Items','Amount','Hold On','Action'].map(h=>(
              <th key={h} className="px-4 py-3 text-left text-xs text-gray-500 font-semibold">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filteredHeld.length===0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-500 text-sm">No held orders</td></tr>
            ) : filteredHeld.map(s=>(
              <tr key={s._id} className="border-b border-[#2a2a2a] hover:bg-[#1e1e1e]">
                <td className="px-4 py-3 text-orange-400 font-bold text-xs">#{s.tokenNumber||s._id?.slice(-4)}</td>
                <td className="px-4 py-3 text-white text-xs">{s.isParcel?'Parcel':s.tableNumber||'Counter'}</td>
                <td className="px-4 py-3 text-gray-300 text-xs">{s.customerName||'Walk-in'}</td>
                <td className="px-4 py-3 text-gray-300 text-xs">{s.subOrders?.reduce((sum,o)=>sum+(o.items?.length||0),0)||0}</td>
                <td className="px-4 py-3 text-orange-400 font-bold text-xs">{fmt(s.totalAmount)}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{s.heldAt?format(new Date(s.heldAt),'d MMM hh:mm a'):'—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={()=>resumeSession(s._id)} className="px-3 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-xs font-bold hover:bg-green-500/30">RESUME</button>
                    <button className="px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-bold hover:bg-red-500/30">DEL</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={()=>setScreen('dashboard')} className="mt-3 w-full py-2 border border-[#2a2a2a] text-gray-400 rounded-xl text-xs hover:bg-[#1a1a1a] transition-colors">VIEW ALL HOLD ORDERS</button>
    </div>
  );

  // ── 7. PENDING APPROVALS ──────────────────────────────────────
  const SOURCE_BADGE = {
    waiter:       { label: 'Waiter',   cls: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
    pos_operator: { label: 'POS',      cls: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
    qr_customer:  { label: 'QR',       cls: 'bg-cyan-500/20   text-cyan-400   border-cyan-500/30'   },
  };
  const STATUS_COLOR = {
    Pending:    'bg-yellow-500/20 text-yellow-400',
    Accepted:   'bg-blue-500/20   text-blue-400',
    Preparing:  'bg-orange-500/20 text-orange-400',
    Ready:      'bg-green-500/20  text-green-400',
    Delivered:  'bg-teal-500/20   text-teal-400',
    Completed:  'bg-gray-500/20   text-gray-400',
  };

  const filteredPending = pendingOrders.filter(s=>
    pendingFilter==='all'||(pendingFilter==='dine_in'&&!s.isParcel)||(pendingFilter==='parcel'&&s.isParcel)
  );
  const ScreenApprovals = (
    <div className="flex flex-col h-full p-5">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-white">Orders
          <span className="ml-2 text-sm text-orange-400 font-normal">({pendingOrders.length} pending)</span>
        </h1>
        <button onClick={loadStats} className="text-gray-400 hover:text-orange-400"><RefreshCw size={16}/></button>
      </div>
      <div className="flex rounded-xl overflow-hidden border border-[#2a2a2a] mb-4 self-start">
        {[['all',`All (${pendingOrders.length})`],['dine_in',`Dine In (${pendingOrders.filter(s=>!s.isParcel).length})`],['parcel',`Parcel (${pendingOrders.filter(s=>s.isParcel).length})`]].map(([v,l])=>(
          <button key={v} onClick={()=>setPendingFilter(v)}
            className={`px-4 py-2 text-xs font-semibold transition-colors ${pendingFilter===v?'bg-orange-500 text-white':'bg-[#1a1a1a] text-gray-400 hover:text-white'}`}>
            {l}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto space-y-3">
        {filteredPending.length===0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <CheckSquare size={32} className="mb-3 opacity-40"/>
            <p className="text-sm">No pending orders</p>
          </div>
        ) : filteredPending.map(s=>{
          const allItems = s.subOrders?.flatMap(o=>o.items||[])||[];
          const expanded = expandedOrder===s._id;
          const src = s.orderSource || 'pos_operator';
          const badge = SOURCE_BADGE[src] || SOURCE_BADGE.pos_operator;
          return (
            <div key={s._id} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden">
              {/* Header row — click to expand */}
              <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#1e1e1e]"
                onClick={()=>setExpandedOrder(expanded?null:s._id)}>
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <div className="text-[10px] text-gray-500 mb-0.5">TOKEN</div>
                    <div className="text-orange-400 font-black text-base">#{s.tokenNumber||'—'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500 mb-0.5">TABLE</div>
                    <div className="text-white font-semibold text-sm">{s.tableNumber||'Parcel'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500 mb-0.5">ITEMS / AMOUNT</div>
                    <div className="text-white text-sm">{allItems.length} items · <span className="text-orange-400 font-bold">{fmt(s.totalAmount)}</span></div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${s.isParcel?'bg-blue-500/20 text-blue-400':'bg-green-500/20 text-green-400'}`}>{s.isParcel?'Parcel':'Dine In'}</span>
                  </div>
                </div>
                <div className={`text-gray-400 transition-transform ${expanded?'rotate-180':''}`}>▼</div>
              </div>

              {/* Expandable items */}
              {expanded && (
                <div className="border-t border-[#2a2a2a] px-4 pb-3">
                  <div className="text-[10px] text-gray-500 mt-2 mb-2 uppercase tracking-wider">Ordered Items</div>
                  <div className="space-y-1.5 mb-3">
                    {allItems.map((item,i)=>(
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-white">{item.name}</span>
                        <span className="text-gray-400">×{item.quantity} <span className="text-orange-300 ml-1">₹{item.item_total||item.price*item.quantity}</span></span>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-gray-500 mb-3">
                    Customer: <span className="text-white">{s.customerName||'Walk-in'}</span>
                    {s.orderSource && <> · Source: <span className={`font-semibold ${badge.cls.split(' ')[1]}`}>{badge.label}</span></>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={()=>approveWaiterOrder(s._id)} className="flex-1 py-1.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded-xl text-xs font-bold hover:bg-green-500/30">✓ APPROVE & SEND TO KITCHEN</button>
                    <button onClick={()=>rejectWaiterOrder(s._id)} className="px-4 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-bold hover:bg-red-500/30">✕ REJECT</button>
                  </div>
                </div>
              )}
              {/* Quick action when collapsed */}
              {!expanded && (
                <div className="px-4 pb-3 flex gap-2">
                  <button onClick={()=>approveWaiterOrder(s._id)} className="flex-1 py-1.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded-xl text-xs font-bold hover:bg-green-500/30">✓ APPROVE</button>
                  <button onClick={()=>rejectWaiterOrder(s._id)} className="px-4 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-bold hover:bg-red-500/30">✕ REJECT</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── 8. PARCEL CONTROL ─────────────────────────────────────────
  const ScreenParcels = (
    <div className="flex flex-col h-full p-5">
      <h1 className="text-xl font-bold text-white mb-4">Parcel Control Center</h1>
      <div className="flex rounded-xl overflow-hidden border border-[#2a2a2a] mb-4 self-start">
        {[['preparing',`Preparing (${parcelOrders.filter(p=>p.status==='open').length})`],['ready',`Ready (${parcelOrders.filter(p=>p.status==='bill_pending').length})`],['completed',`Completed (${parcelOrders.filter(p=>p.status==='paid').length})`]].map(([v,l])=>(
          <button key={v} onClick={()=>setParcelTab(v)}
            className={`px-4 py-2 text-xs font-semibold transition-colors ${parcelTab===v?'bg-orange-500 text-white':'bg-[#1a1a1a] text-gray-400 hover:text-white'}`}>
            {l}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[#2a2a2a] bg-[#161616]">
            {['Parcel No.','Customer','Items','Amount','Ready Time','Action'].map(h=>(
              <th key={h} className="px-4 py-3 text-left text-xs text-gray-500 font-semibold">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {parcelOrders.length===0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-gray-500 text-sm">No parcel orders</td></tr>
            ) : parcelOrders.map(s=>(
              <tr key={s._id} className="border-b border-[#2a2a2a] hover:bg-[#1e1e1e]">
                <td className="px-4 py-3 text-orange-400 font-bold text-xs">#{s.tokenNumber||s._id?.slice(-4)}</td>
                <td className="px-4 py-3 text-white text-xs">{s.customerName||'Walk-in Customer'}</td>
                <td className="px-4 py-3 text-gray-300 text-xs">{s.subOrders?.reduce((sum,o)=>sum+(o.items?.length||0),0)||0}</td>
                <td className="px-4 py-3 text-orange-400 font-bold text-xs">{fmt(s.totalAmount)}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{s.updatedAt?format(new Date(s.updatedAt),'hh:mm a'):'—'}</td>
                <td className="px-4 py-3">
                  <button onClick={()=>{setActiveSession(s);setScreen('billing');}}
                    className="px-3 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-xs font-bold hover:bg-green-500/30">READY</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button className="text-orange-400 text-xs hover:text-orange-300">VIEW ALL PARCEL REPORTS</button>
        <div className="text-xs text-gray-500">When marked as READY, notification will be sent to Operator & Waiter.</div>
      </div>
    </div>
  );

  // ── 9. BILLING & PAYMENT ──────────────────────────────────────
  const billPrevTotal = (activeSession?.subOrders?.reduce((s,sub)=>s+(sub.items?.reduce((ss,it)=>ss+(it.totalPrice||0),0)||0),0))||0;
  const billNewTotal  = cart.reduce((s,c)=>s+c.price*c.qty,0);
  const billSubtotal  = billPrevTotal+billNewTotal;
  const billGST       = billSubtotal*0.05;
  const billGrandTotal= billSubtotal+billGST-discount;
  const balance       = parseFloat(receivedAmt||0)-billGrandTotal;
  const ScreenBilling = (
    <div className="h-full overflow-y-auto p-5">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button onClick={()=>setScreen(activeSession?'runningOrder':'orderSummary')} className="text-gray-400 hover:text-white"><ArrowLeft size={20}/></button>
          <h1 className="text-xl font-bold text-white">Table {selectedTable?.tableNumber||'Parcel'}</h1>
        </div>
        <span className="text-orange-400 text-sm font-mono">Invoice #{runningInvoice?.invoiceNumber||'—'}</span>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Left: Bill Summary */}
        <div className="space-y-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4">
            <div className="text-white font-bold mb-3">Bill Summary</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-400"><span>Previous Items ({(activeSession?.subOrders?.length||0)})</span><span className="text-white">{fmt(billPrevTotal)}</span></div>
              {billNewTotal>0 && <div className="flex justify-between text-gray-400"><span>New Items ({cartCount})</span><span className="text-white">{fmt(billNewTotal)}</span></div>}
              <div className="flex justify-between text-gray-400"><span>Subtotal</span><span className="text-white">{fmt(billSubtotal)}</span></div>
              <div className="flex justify-between text-gray-400">
                <span>Discount</span>
                <div className="flex items-center gap-1">
                  <span className="text-red-400">-</span>
                  <input className="w-16 bg-[#252525] border border-[#333] rounded px-2 py-0.5 text-xs text-white text-right outline-none"
                    value={discount} onChange={e=>{ setDiscount(parseFloat(e.target.value)||0); setAppliedCoupon(null); setCouponInput(''); }}/>
                </div>
              </div>
              {/* Coupon Apply */}
              <div className="pt-1">
                {appliedCoupon ? (
                  <div className="flex items-center justify-between bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-1.5">
                    <span className="text-green-400 text-xs font-bold">🎟 {appliedCoupon.code} applied</span>
                    <button onClick={removeCoupon} className="text-red-400 text-xs hover:text-red-300 ml-2">✕ Remove</button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <input
                      className="flex-1 bg-[#252525] border border-[#333] rounded-l px-2 py-1 text-xs text-white outline-none placeholder-gray-600 uppercase"
                      placeholder="COUPON CODE"
                      value={couponInput}
                      onChange={e=>setCouponInput(e.target.value.toUpperCase())}
                      onKeyDown={e=>e.key==='Enter'&&applyCoupon()}
                    />
                    <button
                      onClick={applyCoupon}
                      disabled={couponLoading || !couponInput.trim()}
                      className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-xs px-3 py-1 rounded-r font-bold transition-colors"
                    >{couponLoading ? '...' : 'APPLY'}</button>
                  </div>
                )}
              </div>
              <div className="flex justify-between text-gray-400"><span>GST (5%)</span><span className="text-white">{fmt(billGST)}</span></div>
              <div className="flex justify-between font-black text-base border-t border-[#2a2a2a] pt-2">
                <span className="text-white">Grand Total</span><span className="text-orange-400">{fmt(billGrandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Payment Method */}
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4">
            <div className="text-white font-bold mb-3">Payment Method</div>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[['Cash','Cash',IndianRupee],['UPI','UPI',Smartphone],['Card','Card',CreditCard],['Split','Split Payment',Wallet]].map(([v,l,Icon])=>(
                <button key={v} onClick={()=>setPaymentMode(v)}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all ${paymentMode===v?'border-orange-500 bg-orange-500/20 text-orange-400':'border-[#2a2a2a] bg-[#1a1a1a] text-gray-400 hover:border-[#3a3a3a]'}`}>
                  <Icon size={18}/>
                  <span className="text-[10px] font-semibold">{l}</span>
                </button>
              ))}
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Received Amount *</label>
              <div className="flex items-center gap-2 bg-[#252525] border border-[#333] rounded-xl px-3 py-2.5">
                <span className="text-orange-400 font-bold">₹</span>
                <input className="flex-1 bg-transparent text-white font-bold outline-none text-sm"
                  value={receivedAmt} onChange={e=>setReceivedAmt(e.target.value)} placeholder={billGrandTotal.toFixed(2)}/>
              </div>
            </div>
            <div className="flex justify-between mt-2 text-sm">
              <span className="text-gray-400">Balance</span>
              <span className={`font-bold ${balance>=0?'text-green-400':'text-red-400'}`}>{balance>=0?fmt(balance):`-${fmt(Math.abs(balance))}`}</span>
            </div>
          </div>
        </div>

        {/* Right: Quick Cash + Generate */}
        <div className="space-y-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4">
            <div className="text-white font-bold mb-3">Quick Cash</div>
            <div className="grid grid-cols-2 gap-2">
              {[600,650,700,'Custom'].map(amt=>(
                <button key={amt} onClick={()=>typeof amt==='number'&&setReceivedAmt(String(amt))}
                  className="py-3 bg-[#252525] hover:bg-[#2e2e2e] border border-[#333] text-white font-bold rounded-xl text-sm transition-colors">
                  {typeof amt==='number'?`₹${amt}`:'Custom'}
                </button>
              ))}
            </div>
          </div>

          <button onClick={generateBill}
            className="w-full py-4 bg-orange-500 hover:bg-orange-400 text-white font-black text-base rounded-2xl transition-all shadow-lg shadow-orange-500/20">
            GENERATE BILL
          </button>
        </div>
      </div>
    </div>
  );

  // ── 10. INVOICE / RECEIPT ─────────────────────────────────────
  const ScreenInvoice = (
    <div className="h-full overflow-y-auto p-5">
      <div className="max-w-4xl mx-auto grid grid-cols-3 gap-5">
        {/* Invoice paper */}
        <div className="col-span-2 bg-white rounded-2xl p-6 text-gray-800 text-sm">
          {/* Header */}
          <div className="mb-4">
            <div className="text-2xl font-black text-gray-900">Utc Cafe</div>
            <div className="text-xs text-gray-500 mt-1">1-2-3, Main Road, Vijayawada, Andhra Pradesh - 520001</div>
            <div className="text-xs text-gray-500">GSTIN: 37ABCDE1234F1Z5</div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4 text-xs border-t border-b border-gray-200 py-3">
            <div className="space-y-0.5">
              <div><span className="text-gray-500">Invoice No</span> <span className="font-bold">{invoice?.invoiceNumber||'INV0001'}</span></div>
              <div><span className="text-gray-500">Date</span> <span className="font-bold">{format(new Date(),'d MMM yyyy hh:mm a')}</span></div>
              <div><span className="text-gray-500">Table</span> <span className="font-bold">{selectedTable?.tableNumber||'—'}</span></div>
            </div>
            <div className="space-y-0.5">
              <div><span className="text-gray-500">Token No.</span> <span className="font-bold">#{invoice?.tokenNumber||activeSession?.tokenNumber||'—'}</span></div>
              <div><span className="text-gray-500">Customer</span> <span className="font-bold">{customer?.name||newCustName||'Walk-in'} ({phone||customer?.phone_no||'—'})</span></div>
              <div><span className="text-gray-500">Customer Type:</span> <span className="font-bold">{customerType} (For Analytics Only)</span></div>
            </div>
          </div>
          <table className="w-full text-xs mb-4">
            <thead><tr className="border-b border-gray-200">
              {['Item','Qty','Rate','Amount'].map(h=><th key={h} className="py-2 text-left text-gray-500 font-semibold">{h}</th>)}
            </tr></thead>
            <tbody>
              {prevItems.map((it,i)=>(
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1.5">{it.name}</td><td>{it.qty}</td>
                  <td>{fmt(it.unitPrice||it.price)}</td><td className="font-bold">{fmt(it.totalPrice||it.price*it.qty)}</td>
                </tr>
              ))}
              {cart.map(it=>(
                <tr key={it._id} className="border-b border-gray-100">
                  <td className="py-1.5">{it.name}</td><td>{it.qty}</td>
                  <td>{fmt(it.price)}</td><td className="font-bold">{fmt(it.price*it.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-center text-gray-400 text-xs py-2 border-t border-dashed border-gray-300">Thank you! Visit Again!</div>
        </div>

        {/* Right: Totals + Actions */}
        <div className="space-y-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4 text-sm space-y-2">
            <div className="flex justify-between text-gray-400"><span>Subtotal</span><span className="text-white">{fmt(billSubtotal)}</span></div>
            <div className="flex justify-between text-gray-400"><span>Discount</span><span className="text-red-400">-{fmt(discount)}</span></div>
            <div className="flex justify-between text-gray-400"><span>GST (5%)</span><span className="text-white">{fmt(billGST)}</span></div>
            <div className="flex justify-between font-black text-base border-t border-[#2a2a2a] pt-2"><span className="text-white">Grand Total</span><span className="text-orange-400">{fmt(billGrandTotal)}</span></div>
            <div className="border-t border-[#2a2a2a] pt-2 space-y-1">
              <div className="flex justify-between text-gray-400"><span>Paid Amount</span><span className="text-white">{fmt(parseFloat(receivedAmt)||billGrandTotal)}</span></div>
              <div className="flex justify-between font-bold"><span className="text-gray-400">Balance</span><span className="text-green-400">{fmt(Math.max(0,balance))}</span></div>
            </div>
          </div>
          <button className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"><Printer size={16}/> PRINT BILL</button>
          <button className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"><MessageSquare size={16}/> WHATSAPP BILL</button>
          <button className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"><Mail size={16}/> EMAIL BILL</button>
          <button onClick={()=>{resetFlow();setScreen('dashboard');}} className="w-full py-3 border border-[#333] text-gray-300 font-bold rounded-xl text-sm hover:bg-[#1a1a1a] transition-colors">BACK TO DASHBOARD</button>
        </div>
      </div>
    </div>
  );

  // ── Orders History Screen ─────────────────────────────────────
  const filteredHistory = orderHistory.filter(s => {
    const q = orderHistorySearch.toLowerCase();
    const matchQ = !q || s.customerName?.toLowerCase().includes(q)
      || String(s.tableNumber).includes(q)
      || String(s.tokenNumber||'').includes(q);
    const matchF = orderHistoryFilter === 'all'
      || (orderHistoryFilter === 'paid'   && s.status === 'paid')
      || (orderHistoryFilter === 'open'   && s.status === 'open')
      || (orderHistoryFilter === 'held'   && s.status === 'on_hold')
      || (orderHistoryFilter === 'parcel' && s.isParcel);
    return matchQ && matchF;
  });

  const STATUS_STYLE = {
    paid:          'bg-green-500/20 text-green-400',
    open:          'bg-orange-500/20 text-orange-400',
    on_hold:       'bg-yellow-500/20 text-yellow-400',
    bill_pending:  'bg-blue-500/20 text-blue-400',
  };

  const ScreenOrders = (
    <div className="flex flex-col h-full p-4 gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Order History</h1>
          <p className="text-xs text-gray-500 mt-0.5">{orderHistory.length} orders today</p>
        </div>
        <button onClick={loadOrderHistory} className="text-gray-400 hover:text-orange-400"><RefreshCw size={16}/></button>
      </div>

      {/* Search */}
      <input
        className="input text-sm"
        placeholder="Search by customer, table, token..."
        value={orderHistorySearch}
        onChange={e => setOrderHistorySearch(e.target.value)}
      />

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          ['all',    `All (${orderHistory.length})`],
          ['paid',   `Paid (${orderHistory.filter(s=>s.status==='paid').length})`],
          ['open',   `Open (${orderHistory.filter(s=>s.status==='open').length})`],
          ['held',   `On Hold (${orderHistory.filter(s=>s.status==='on_hold').length})`],
          ['parcel', `Parcel (${orderHistory.filter(s=>s.isParcel).length})`],
        ].map(([v,l]) => (
          <button key={v} onClick={() => setOrderHistoryFilter(v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              orderHistoryFilter === v ? 'bg-orange-500 text-white' : 'bg-[#1a1a1a] border border-[#2a2a2a] text-gray-400 hover:text-white'
            }`}>
            {l}
          </button>
        ))}
      </div>

      {/* Orders list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {orderHistoryLoading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"/></div>
        ) : filteredHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <UtensilsCrossed size={32} className="mb-3 opacity-30"/>
            <p className="text-sm">No orders found</p>
          </div>
        ) : filteredHistory.map(s => {
          const allItems = s.subOrders?.flatMap(o => o.items || []) || [];
          const exp = expandedOrder === s._id;
          return (
            <div key={s._id} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden">
              {/* Summary row */}
              <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#1e1e1e]"
                onClick={() => setExpandedOrder(exp ? null : s._id)}>
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-0">
                  <div>
                    <div className="text-[10px] text-gray-500">TOKEN</div>
                    <div className="text-orange-400 font-black text-base">#{s.tokenNumber || '—'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500">TABLE</div>
                    <div className="text-white font-semibold text-sm">{s.tableNumber || (s.isParcel ? 'Parcel' : '—')}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500">AMOUNT</div>
                    <div className="text-orange-400 font-bold text-sm">{fmt(s.totalAmount || 0)}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${STATUS_STYLE[s.status] || 'bg-gray-500/20 text-gray-400'}`}>
                      {s.status === 'on_hold' ? 'On Hold' : s.status === 'bill_pending' ? 'Bill Pending' : s.status === 'paid' ? 'Paid ✓' : 'Open'}
                    </span>
                    <span className="text-[10px] text-gray-600">{allItems.length} items</span>
                  </div>
                </div>
                <span className={`text-gray-500 text-xs transition-transform ${exp ? 'rotate-180' : ''}`}>▼</span>
              </div>

              {/* Expanded items */}
              {exp && (
                <div className="border-t border-[#2a2a2a] px-4 py-3 space-y-1.5">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
                    {s.customerName || 'Walk-in'} · {s.openedAt ? format(new Date(s.openedAt), 'd MMM hh:mm a') : ''}
                  </div>
                  {allItems.length === 0
                    ? <p className="text-xs text-gray-600">No items recorded</p>
                    : allItems.map((item, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-white">{item.name}</span>
                        {/* session items use qty + totalPrice (not quantity/item_total) */}
                        <span className="text-gray-400">×{item.qty || item.quantity || 1}
                          <span className="text-orange-300 ml-2">₹{item.totalPrice || item.item_total || 0}</span>
                        </span>
                      </div>
                    ))
                  }
                  {s.status === 'paid' && (
                    <div className="mt-2 pt-2 border-t border-[#2a2a2a] flex justify-between text-xs font-bold">
                      <span className="text-gray-400">Total Paid</span>
                      <span className="text-green-400">{fmt(s.totalAmount || 0)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Screen router ─────────────────────────────────────────────

  const handlePOSAcceptDelivery = async (notif) => {
    try {
      await api.patch(`/kitchen/orders/${notif.orderId}/accept-delivery`);
      removeNotification(notif.id);
      toast.success(`✓ Order collected! Token #${notif.tokenNumber}`);
    } catch (e) { toast.error(e.response?.data?.message || 'Could not accept'); }
  };

  const ScreenNotifications = (
    <div className="flex flex-col h-full p-4 gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Notifications</h1>
          <p className="text-xs text-gray-500 mt-0.5">{notifs.length} total · auto-clear after 12h</p>
        </div>
        {notifs.length > 0 && (
          <button onClick={() => { clearAll(); }}
            className="text-xs text-gray-400 hover:text-white">Clear All</button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto space-y-3">
        {notifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-600">
            <Bell size={36} className="mb-3 opacity-30" />
            <p className="text-sm">No notifications</p>
          </div>
        ) : notifs.map(n => {
          const label = NOTIF_LABELS[n.type] || NOTIF_LABELS.ready;
          const colorMap = { green: 'bg-green-500/10 border-green-500/30', orange: 'bg-orange-500/10 border-orange-500/30', blue: 'bg-blue-500/10 border-blue-500/30' };
          const textMap  = { green: 'text-green-400', orange: 'text-orange-400', blue: 'text-blue-400' };
          return (
          <div key={n.id} className={`rounded-2xl border p-4 transition-all ${
            n.accepted ? 'bg-gray-500/10 border-gray-500/20 opacity-60' : (colorMap[label.color] || colorMap.green)
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-bold ${n.accepted ? 'text-gray-400' : (textMap[label.color] || textMap.green)}`}>
                {label.emoji} {label.text}
              </span>
              <span className="text-[10px] text-gray-600">
                {new Date(n.id).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="flex gap-3 mb-2">
              <div className="bg-[#1a1a1a] rounded-lg px-3 py-1.5 border border-[#2a2a2a] text-center">
                <div className="text-[10px] text-gray-500">TOKEN</div>
                <div className="text-orange-400 font-black text-base">#{n.tokenNumber || '—'}</div>
              </div>
              <div className="bg-[#1a1a1a] rounded-lg px-3 py-1.5 border border-[#2a2a2a] text-center">
                <div className="text-[10px] text-gray-500">TABLE</div>
                <div className="text-white font-bold text-sm">{n.tableNumber || 'Counter'}</div>
              </div>
              {n.customerName && <div className="self-center text-xs text-gray-400">{n.customerName}</div>}
            </div>
            {!n.accepted && n.orderId && n.type === 'ready' && (
              <button onClick={() => handlePOSAcceptDelivery(n)}
                className="w-full py-2 bg-green-500/20 border border-green-500/40 text-green-400 font-bold text-xs rounded-xl hover:bg-green-500/30 active:scale-95 transition-all">
                ✓ ACCEPT & COLLECT ORDER
              </button>
            )}
            {n.accepted && (
              <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-1">
                <CheckSquare size={11} className="text-green-500" />
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
  const SCREENS = {
    dashboard:    ScreenDashboard,
    customerID:   ScreenCustomerID,
    menu:         ScreenMenu,
    orderSummary: ScreenOrderSummary,
    runningOrder: ScreenRunningOrder,
    holdOrders:   ScreenHoldOrders,
    approvals:    ScreenApprovals,
    parcels:      ScreenParcels,
    billing:      ScreenBilling,
    invoice:      ScreenInvoice,
    orders:       ScreenOrders,
    notifications: ScreenNotifications,
  };

  // ── NAV ────────────────────────────────────────────────────────
  const NAV = [
    { id:'dashboard',  icon:LayoutDashboard, label:'Dashboard'          },
    { id:'tableMap',   icon:MapPin,          label:'Table Map', action:()=>{resetFlow();setScreen('dashboard');} },
    { id:'orders',     icon:UtensilsCrossed, label:'Orders'             },
    { id:'approvals',     icon:CheckSquare,     label:'Approvals',     badge:notifBadge },
    { id:'notifications', icon:Bell,            label:'Notifications', badge:unreadCount },
    { id:'holdOrders', icon:PauseCircle,     label:'Hold Orders', badge:stats.heldOrders },
    { id:'parcels',    icon:Package,         label:'Parcels', badge:stats.parcels },
    { id:'reports',    icon:BarChart2,       label:'Reports',   action: () => navigate('reports')    },
    { id:'settings',   icon:Settings,        label:'Settings',  action: () => navigate('settings')   },
  ];

  // ═══════════════════════════════════════════════════════════════
  // MAIN LAYOUT
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="flex h-screen bg-[#0f0f0f] overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className={`flex flex-col bg-[#141414] border-r border-[#222] transition-all duration-200 flex-shrink-0 ${sidebarCollapsed?'w-16':'w-52'}`}>
        {/* Logo */}
        <div className={`flex items-center border-b border-[#222] py-4 ${sidebarCollapsed?'justify-center px-2':'gap-2.5 px-4'}`}>
          <div className="w-9 h-9 rounded-xl bg-orange-500/20 flex items-center justify-center flex-shrink-0">
            <Coffee size={18} className="text-orange-400"/>
          </div>
          {!sidebarCollapsed && (
            <div>
              <div className="text-white font-black text-sm leading-none">UTC Café</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{user?.name||'Bill Operator'}</div>
              <div className="text-[9px] text-orange-400 font-bold uppercase">{user?.employee_id||'BOP001'}</div>
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto px-2">
          {NAV.map(({id,icon:Icon,label,badge,action})=>(
            <button key={id}
              onClick={()=>{ if(action) action(); else { setScreen(id); if(id==='notifications') markRead(); } }}
              title={sidebarCollapsed?label:''}
              className={`w-full flex items-center rounded-xl transition-colors relative ${sidebarCollapsed?'justify-center px-0 py-2.5':'gap-3 px-3 py-2.5'} ${screen===id?'bg-orange-500/20 text-orange-400':'text-gray-500 hover:text-white hover:bg-[#1e1e1e]'}`}>
              <Icon size={17} className="flex-shrink-0"/>
              {!sidebarCollapsed && <span className="text-xs font-medium">{label}</span>}
              {badge>0 && (
                <span className={`min-w-[18px] h-[18px] bg-orange-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 ${sidebarCollapsed?'absolute -top-1 -right-1':'ml-auto'}`}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Collapse + Logout */}
        <div className="px-2 py-3 border-t border-[#222] space-y-1">
          <button onClick={()=>setSidebarCollapsed(v=>!v)}
            className="w-full flex items-center justify-center rounded-xl py-2 text-gray-600 hover:text-gray-300 hover:bg-[#1e1e1e] transition-colors">
            <ChevronDown size={14} className={`transition-transform ${sidebarCollapsed?'-rotate-90':'rotate-90'}`}/>
          </button>
          <button onClick={logout}
            className={`w-full flex items-center rounded-xl py-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors ${sidebarCollapsed?'justify-center':'gap-3 px-3'}`}>
            <LogOut size={15}/>
            {!sidebarCollapsed && <span className="text-xs font-medium">Logout</span>}
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 bg-[#141414] border-b border-[#222]">
          <div className="text-white font-bold text-sm">
            {screen==='dashboard'?'Table Map — Ground Floor': NAV.find(n=>n.id===screen)?.label||'POS Staff'}
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold text-sm">
              {user?.name?.[0]||'U'}
            </div>
          </div>
        </div>
        {/* Screen */}
        <div className="flex-1 overflow-hidden">
          {SCREENS[screen]||ScreenDashboard}
        </div>
      </main>

      {/* Table picker modal */}
      {showTablePicker && (
        <TablePickerModal
          onClose={()=>setShowTablePicker(false)}
          onSelect={handleTableSelect}
          onTakeaway={()=>{setIsParcel(true);setSelectedTable(null);setShowTablePicker(false);setScreen('customerID');}}
        />
      )}

      {/* Split payment modal */}
      {showSplitModal && activeSession && (
        <SplitPaymentModal
          sessionId={activeSession._id}
          totalAmount={activeSession.totalAmount || 0}
          onClose={()=>setShowSplitModal(false)}
          onSuccess={()=>{setShowSplitModal(false);resetFlow();setScreen('dashboard');loadStats();loadTables();}}
        />
      )}

      {/* Thermal Receipt / UPI QR modal */}
      {showThermalReceipt && activeSession && (
        <ThermalReceipt
          session={activeSession}
          franchise={franchiseInfo}
          onClose={() => { setShowThermalReceipt(false); resetFlow(); setScreen('dashboard'); loadStats(); loadTables(); }}
        />
      )}

      {/* ── Parcel / Sitting mandatory picker ── */}
      {showOrderTypeModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowOrderTypeModal(false)}>
          <div className="w-full sm:w-96 bg-[#161616] border border-[#2a2a2a] rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}>

            <div className="w-10 h-1 bg-[#333] rounded-full mx-auto mb-5 sm:hidden" />
            <h2 className="text-white font-bold text-lg text-center mb-1">Order Type</h2>
            <p className="text-gray-500 text-xs text-center mb-6">Select before proceeding to order summary</p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              {/* Sitting */}
              <button
                onClick={() => { setIsParcel(false); setShowOrderTypeModal(false); setScreen('orderSummary'); }}
                className={`flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all active:scale-95 ${
                  !isParcel
                    ? 'border-orange-500 bg-orange-500/15'
                    : 'border-[#2a2a2a] bg-[#1a1a1a] hover:border-orange-500/40'
                }`}
              >
                <span className="text-4xl">🪑</span>
                <div className="text-center">
                  <div className="text-white font-bold text-sm">Sitting</div>
                  {selectedTable && (
                    <div className="text-orange-400 text-xs mt-0.5">Table {selectedTable.tableNumber}</div>
                  )}
                </div>
                {!isParcel && (
                  <span className="text-[10px] bg-orange-500 text-white px-2 py-0.5 rounded-full font-bold">SELECTED</span>
                )}
              </button>

              {/* Parcel */}
              <button
                onClick={() => { setIsParcel(true); setShowOrderTypeModal(false); setScreen('orderSummary'); }}
                className={`flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all active:scale-95 ${
                  isParcel
                    ? 'border-blue-500 bg-blue-500/15'
                    : 'border-[#2a2a2a] bg-[#1a1a1a] hover:border-blue-500/40'
                }`}
              >
                <span className="text-4xl">📦</span>
                <div className="text-center">
                  <div className="text-white font-bold text-sm">Parcel</div>
                  <div className="text-blue-400 text-xs mt-0.5">Takeaway</div>
                </div>
                {isParcel && (
                  <span className="text-[10px] bg-blue-500 text-white px-2 py-0.5 rounded-full font-bold">SELECTED</span>
                )}
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
