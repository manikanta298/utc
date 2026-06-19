import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  ShoppingCart, X, Plus, Minus, Leaf, Drumstick,
  CheckCircle, Package, UtensilsCrossed, Phone, User,
  ArrowRight, Loader,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

const API = import.meta.env.VITE_API_URL || 'https://utc-cafe.onrender.com/api';
const apiFetch = (path, opts = {}) => fetch(`${API}${path}`, opts).then((r) => r.json());
const apiPost = (path, body) => apiFetch(path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const apiGet = (path) => apiFetch(path);
const fmt = (n) => `₹${Number(n || 0).toFixed(0)}`;

function VegBadge({ isVeg }) {
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border ${
      isVeg ? 'border-green-500 text-green-400' : 'border-red-500 text-red-400'}`}>
      {isVeg ? <Leaf size={9} /> : <Drumstick size={9} />}
      {isVeg ? 'VEG' : 'NON'}
    </span>
  );
}

const STAGE = { MOBILE: 'mobile', PROFILE: 'profile', MENU: 'menu', PAYMENT: 'payment', SUCCESS: 'success' };

export default function CustomerMenuPage() {
  const { franchiseId }     = useParams();
  const [searchParams]      = useSearchParams();
  const tableParam          = searchParams.get('table') || '';
  const typeParam           = searchParams.get('type') || 'dine_in';

  const [stage,         setStage]         = useState(STAGE.MOBILE);
  const [franchise,     setFranchise]     = useState(null);
  const [items,         setItems]         = useState([]);
  const [categories,    setCategories]    = useState([]);
  const [activeCategory,setActiveCategory]= useState('');
  const [cart,          setCart]          = useState({});
  const [cartOpen,      setCartOpen]      = useState(false);
  const [ordering,      setOrdering]      = useState(false);
  const [token,         setToken]         = useState('');
  const [sessionId,     setSessionId]     = useState('');
  const [upiQr,         setUpiQr]         = useState(null);
  const [upiAmount,     setUpiAmount]     = useState('');
  const [upiRef,        setUpiRef]        = useState('');
  const [upiLoading,    setUpiLoading]    = useState(false);
  const [couponCode,    setCouponCode]    = useState('');
  const [couponApplied, setCouponApplied] = useState(null); // { code, discountAmount }
  const [couponLoading, setCouponLoading] = useState(false);
  const [orderType,     setOrderType]     = useState(typeParam);

  const [mobile,        setMobile]        = useState('');
  const [mobileError,   setMobileError]   = useState('');
  const [customer,      setCustomer]      = useState(null);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [customerName,  setCustomerName]  = useState('');
  const [gender,        setGender]        = useState('');
  const [city,          setCity]          = useState('');
  const [pincode,       setPincode]       = useState('');
  const [lookingUp,     setLookingUp]     = useState(false);

  const loadMenu = useCallback(async () => {
    try {
      // Guard: franchiseId must be a valid 24-char MongoDB ObjectId
      if (!franchiseId || franchiseId === '[object Object]' || !/^[a-f\d]{24}$/i.test(franchiseId)) {
        toast.error('Invalid menu link. Please scan the QR code again.');
        return;
      }
      const res = await apiGet(`/public/menu/${franchiseId}`);
      if (!res.success) { toast.error(res.message || 'Menu not available'); return; }
      const all = res.items || [];
      setFranchise(res.franchise);
      setItems(all);
      const cats = [...new Set(all.map((i) => i.category))];
      setCategories(cats);
      setActiveCategory((prev) => prev || cats[0] || '');
    } catch { toast.error('Could not load menu'); }
  }, [franchiseId]);

  useEffect(() => { loadMenu(); }, [loadMenu]);

  const handleMobileLookup = async () => {
    const phone = mobile.replace(/\D/g, '').slice(-10);
    if (phone.length < 10) { setMobileError('Enter a valid 10-digit number'); return; }
    setMobileError(''); setLookingUp(true);
    try {
      const res = await apiGet(`/public/customer/${phone}`);
      if (res.exists && res.customer) {
        setCustomer(res.customer);
        setCustomerName(res.customer.name);
        setIsNewCustomer(false);
      } else {
        setCustomer(null);
        setIsNewCustomer(true);
        setCustomerName('');
      }
      setStage(STAGE.PROFILE);
    } catch { toast.error('Lookup failed, please retry'); }
    setLookingUp(false);
  };

  const handleProfileContinue = () => {
    if (!customerName.trim()) { toast.error('Please enter your name'); return; }
    if (isNewCustomer) {
      if (!gender) { toast.error('Please select your gender'); return; }
      if (!city.trim()) { toast.error('Please enter your city'); return; }
      if (!/^\d{6}$/.test(pincode)) { toast.error('Enter a valid 6-digit pincode'); return; }
    }
    setStage(STAGE.MENU);
  };

  const cartItems  = Object.entries(cart)
    .map(([id, qty]) => ({ ...items.find((i) => i._id === id), qty }))
    .filter((i) => i.qty > 0);
  const cartCount = cartItems.reduce((s, i) => s + i.qty, 0);

  const setQty = (id, delta) => setCart((prev) => {
    const next = { ...prev, [id]: Math.max(0, (prev[id] || 0) + delta) };
    if (next[id] === 0) delete next[id];
    return next;
  });

  const cartTotal     = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const couponDiscount = couponApplied?.discountAmount || 0;
  const finalTotal    = Math.max(0, cartTotal - couponDiscount);

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    try {
      const res = await apiPost('/public/coupon/validate', {
        code: couponCode.trim(), orderAmount: cartTotal, franchiseId,
      });
      if (!res.success) {
        toast.error(res.message || 'Invalid coupon code');
      } else {
        setCouponApplied({ code: res.coupon.code, discountAmount: res.discountAmount });
        toast.success(`Coupon applied! ₹${res.discountAmount} off`);
      }
    } catch {
      toast.error('Could not apply coupon. Try again.');
    } finally {
      setCouponLoading(false);
    }
  };

  const placeOrder = async () => {
    if (cartItems.length === 0) { toast.error('Cart is empty'); return; }
    setOrdering(true);
    try {
      const res = await apiPost('/public/order', {
        franchiseId,
        tableNumber:    tableParam || null,
        order_type:     orderType,
        customer_phone: mobile.replace(/\D/g, '').slice(-10),
        customer_name:  customerName,
        customer_gender: gender || undefined,
        customer_city:   city || undefined,
        customer_pincode: pincode || undefined,
        coupon_code:     couponApplied?.code || undefined,
        discount_amount: couponDiscount || undefined,
        items: cartItems.map((i) => ({
          item_id: i._id, name: i.name, price: i.price,
          gst_rate: i.gst_rate || 5, quantity: i.qty,
        })),
      });
      if (!res.success) throw new Error(res.message || 'Order failed');
      setToken(res.token_number || '');
      setSessionId(res.session_id || '');
      setCart({});

      // Try to load UPI QR — silently skip to success if not configured
      setUpiLoading(true);
      try {
        const amount = finalTotal.toFixed(2);
        setUpiAmount(amount);
        const qrRes = await apiGet(`/public/upi-qr/${franchiseId}?amount=${amount}&sessionId=${res.session_id}`);
        if (qrRes?.success && qrRes?.qr) {
          setUpiQr(qrRes);
          setStage(STAGE.PAYMENT);
        } else {
          setStage(STAGE.SUCCESS);
        }
      } catch {
        setStage(STAGE.SUCCESS);
      } finally {
        setUpiLoading(false);
      }
    } catch (err) {
      toast.error(err.message || 'Order failed. Please try again.');
    }
    setOrdering(false);
  };

  if (stage === STAGE.MOBILE) return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center p-6 gap-6">
      <Toaster position="top-center" />
      {franchise && (
        <div className="text-center">
          {franchise.logo?.url && (
            <img src={franchise.logo.url} alt={franchise.name}
              className="w-20 h-20 rounded-2xl object-cover mx-auto mb-3" />
          )}
          <h1 className="text-2xl font-black text-white">{franchise.name}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {tableParam ? `Table ${tableParam}` : 'Counter / Parcel'}
          </p>
        </div>
      )}
      <div className="w-full max-w-sm bg-dark-800 border border-dark-600 rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-white text-center">Enter Your Mobile</h2>
        <p className="text-sm text-gray-500 text-center">We'll detect your profile & loyalty points</p>

        {!tableParam && (
          <div className="flex gap-2">
            {[{ key: 'dine_in', label: '🪑 Dine-In' }, { key: 'parcel', label: '📦 Parcel' }].map(({ key, label }) => (
              <button key={key} onClick={() => setOrderType(key)}
                className={['flex-1 py-2.5 rounded-xl text-sm font-semibold',
                  orderType === key ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-400'].join(' ')}>
                {label}
              </button>
            ))}
          </div>
        )}

        <div>
          <div className="flex gap-2">
            <div className="flex items-center px-3 bg-dark-700 border border-dark-500 rounded-xl text-gray-400 text-sm font-bold">+91</div>
            <input type="tel" inputMode="numeric" maxLength={10} placeholder="10-digit mobile"
              value={mobile}
              onChange={(e) => { setMobile(e.target.value.replace(/\D/g, '')); setMobileError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleMobileLookup()}
              className="flex-1 bg-dark-700 border border-dark-500 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-500 text-lg font-mono"
            />
          </div>
          {mobileError && <p className="text-red-400 text-xs mt-1.5">{mobileError}</p>}
        </div>

        <button onClick={handleMobileLookup} disabled={lookingUp || mobile.length < 10}
          className="w-full py-3.5 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 text-sm">
          {lookingUp ? <><Loader size={16} className="animate-spin" /> Looking up…</> : <><ArrowRight size={16} /> Continue</>}
        </button>
      </div>
    </div>
  );

  if (stage === STAGE.PROFILE) return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center p-6">
      <Toaster position="top-center" />
      <div className="w-full max-w-sm bg-dark-800 border border-dark-600 rounded-2xl p-6 space-y-4">
        {isNewCustomer ? (
          <>
            <div className="text-center">
              <div className="w-14 h-14 bg-brand-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <User size={28} className="text-brand-400" />
              </div>
              <h2 className="text-lg font-bold text-white">New Customer</h2>
              <p className="text-sm text-gray-500 mt-1">+91 {mobile} · First visit!</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">Your Name *</label>
              <input type="text" placeholder="Full name" value={customerName}
                onChange={(e) => setCustomerName(e.target.value)} autoFocus
                className="w-full bg-dark-700 border border-dark-500 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">Gender *</label>
              <div className="flex gap-2">
                {['Male', 'Female', 'Other'].map((g) => (
                  <button key={g} type="button" onClick={() => setGender(g)}
                    className={['flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all',
                      gender === g
                        ? 'bg-brand-500/20 border-brand-500 text-brand-400'
                        : 'bg-dark-700 border-dark-600 text-gray-400 hover:text-white'].join(' ')}>
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">City *</label>
              <input type="text" placeholder="Your city" value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-dark-700 border border-dark-500 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">Pincode *</label>
              <input type="tel" inputMode="numeric" maxLength={6} placeholder="6-digit pincode" value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-dark-700 border border-dark-500 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-500 font-mono"
              />
            </div>
          </>
        ) : (
          <>
            <div className="text-center">
              <div className="w-14 h-14 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle size={28} className="text-green-400" />
              </div>
              <h2 className="text-lg font-bold text-white">Welcome back!</h2>
              <p className="text-brand-400 font-semibold mt-1">{customer?.name}</p>
              <p className="text-sm text-gray-500 mt-0.5">+91 {mobile}</p>
            </div>
            <div className="bg-dark-700 rounded-xl p-3 grid grid-cols-3 gap-3 text-center text-xs">
              <div><div className="text-white font-bold text-lg">{customer?.total_orders || 0}</div><div className="text-gray-500">Orders</div></div>
              <div><div className="text-white font-bold text-lg">{customer?.total_points || 0}</div><div className="text-gray-500">Points</div></div>
              <div><div className="text-brand-400 font-bold text-sm">₹{Number(customer?.total_spent || 0).toFixed(0)}</div><div className="text-gray-500">Spent</div></div>
            </div>
          </>
        )}
        <div className="flex gap-2">
          <button onClick={() => setStage(STAGE.MOBILE)}
            className="px-4 py-3 bg-dark-700 text-gray-400 rounded-xl hover:text-white text-sm">← Back</button>
          <button onClick={handleProfileContinue}
            className="flex-1 py-3 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-sm">
            <ArrowRight size={16} /> View Menu
          </button>
        </div>
      </div>
    </div>
  );

  if (stage === STAGE.PAYMENT) return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center p-6 gap-5">
      <Toaster position="top-center" />
      {franchise?.logo && <img src={franchise.logo} alt="logo" className="h-12 w-12 rounded-full object-cover" />}
      <div className="text-center">
        <h2 className="text-xl font-bold text-white">Pay via UPI</h2>
        <p className="text-sm text-gray-400 mt-1">Scan the QR with any UPI app</p>
      </div>

      {/* Amount */}
      <div className="bg-brand-500/10 border border-brand-500/30 rounded-2xl px-8 py-4 text-center">
        <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Amount</div>
        <div className="text-4xl font-black text-brand-400">₹{upiAmount}</div>
      </div>

      {/* QR Code */}
      {upiQr?.qr?.startsWith('data:image') ? (
        <img src={upiQr.qr} alt="UPI QR" className="w-56 h-56 rounded-2xl border border-dark-600 bg-white p-2" />
      ) : (
        <div className="w-56 h-56 rounded-2xl border border-dark-600 bg-dark-700 flex items-center justify-center text-xs text-gray-500 text-center p-4">
          Open UPI app and pay to<br />
          <span className="text-brand-400 font-mono mt-1">{upiQr?.upiId}</span>
        </div>
      )}

      <div className="text-xs text-gray-500 font-mono">{upiQr?.upiId}</div>

      {/* UPI Reference input */}
      <div className="w-full max-w-xs space-y-2">
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block">
          UPI Transaction ID <span className="text-gray-600">(optional)</span>
        </label>
        <input
          type="text"
          placeholder="e.g. 4059123456789"
          value={upiRef}
          onChange={(e) => setUpiRef(e.target.value)}
          className="w-full bg-dark-700 border border-dark-500 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-500 font-mono text-sm"
        />
      </div>

      <div className="w-full max-w-xs flex flex-col gap-2">
        <button
          onClick={() => setStage(STAGE.SUCCESS)}
          className="w-full btn-primary py-3.5 rounded-2xl font-bold text-base"
        >
          ✅ Payment Done — Confirm Order
        </button>
        <button
          onClick={() => setStage(STAGE.SUCCESS)}
          className="w-full btn-ghost py-2.5 rounded-2xl text-sm text-gray-500"
        >
          Pay at counter instead
        </button>
      </div>
    </div>
  );

  if (stage === STAGE.SUCCESS) return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center p-6 gap-6">
      <Toaster position="top-center" />
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle size={52} className="text-green-400" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-white">Order Placed!</h2>
          <p className="text-gray-400 mt-2">Your kitchen is preparing your order</p>
        </div>
        {token && (
          <div className="bg-dark-800 border border-brand-500/40 rounded-2xl p-6">
            <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">Your Token</div>
            <div className="text-5xl font-black text-brand-400">{token}</div>
            {tableParam && <div className="text-sm text-gray-500 mt-2">Table {tableParam}</div>}
          </div>
        )}
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 text-sm text-gray-400">
          {orderType === 'parcel'
            ? '📦 Your parcel will be ready at the counter. Listen for your token.'
            : '🪑 Our staff will serve you shortly. Thank you!'}
        </div>
        <button onClick={() => { setStage(STAGE.MENU); setCart({}); }}
          className="w-full py-3 bg-dark-800 border border-dark-600 text-gray-400 rounded-xl hover:text-white text-sm">
          Order More Items
        </button>
      </div>
    </div>
  );

  // MENU stage
  const visibleItems = items.filter((i) => i.category === activeCategory);
  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      <Toaster position="top-center" />
      <header className="bg-dark-800 border-b border-dark-600 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div>
          <div className="text-sm font-bold text-white">{franchise?.name || 'Menu'}</div>
          <div className="text-[10px] text-gray-500">
            {tableParam ? `Table ${tableParam} · ` : ''}{customerName}
            {orderType === 'parcel' ? ' · 📦 Parcel' : ' · 🪑 Dine-In'}
          </div>
        </div>
        <button onClick={() => setCartOpen(true)}
          className="relative flex items-center gap-2 bg-brand-500 text-white px-3 py-2 rounded-xl text-sm font-semibold">
          <ShoppingCart size={16} />
          {cartCount > 0 ? <span className="text-xs">{cartCount} · {fmt(finalTotal)}</span> : <span className="text-xs">Cart</span>}
        </button>
      </header>

      <div className="bg-dark-800 border-b border-dark-600 flex overflow-x-auto gap-1 px-3 py-2 sticky top-[57px] z-10">
        {categories.map((cat) => (
          <button key={cat} onClick={() => setActiveCategory(cat)}
            className={['flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              activeCategory === cat ? 'bg-brand-500 text-white' : 'text-gray-500 hover:text-white bg-dark-700'].join(' ')}>
            {cat}
          </button>
        ))}
      </div>

      <div className="flex-1 p-4 space-y-3 pb-28">
        {visibleItems.length === 0 && <div className="text-center text-gray-600 py-12">No items in this category</div>}
        {visibleItems.map((item) => {
          const qty = cart[item._id] || 0;
          return (
            <div key={item._id}
              className="relative bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden flex gap-0 shadow-lg shadow-black/30 hover:border-brand-500/40 transition-all duration-200"
              style={{ boxShadow: qty > 0 ? '0 0 0 2px #f97316, 0 8px 24px rgba(0,0,0,0.4)' : undefined }}>
              {item.image?.url ? (
                <div className="w-28 flex-shrink-0 relative">
                  <img src={item.image.url} alt={item.name} className="w-full h-full object-cover min-h-[96px]" />
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent to-dark-800/20" />
                </div>
              ) : (
                <div className="w-2 flex-shrink-0" style={{ background: item.isVeg ? '#22c55e' : '#ef4444' }} />
              )}
              <div className="flex-1 min-w-0 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-bold text-sm leading-tight">{item.name}</div>
                    <div className="mt-1"><VegBadge isVeg={item.isVeg} /></div>
                    {item.description && <p className="text-gray-500 text-[11px] mt-1.5 line-clamp-2 leading-relaxed">{item.description}</p>}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2.5">
                  <div className="text-brand-400 font-black text-base">{fmt(item.price)}</div>
                  {qty === 0 ? (
                    <button onClick={() => setQty(item._id, 1)}
                      className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 active:scale-95 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-md shadow-brand-500/30">
                      <Plus size={12} /> ADD
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 bg-dark-700 rounded-xl px-2 py-1">
                      <button onClick={() => setQty(item._id, -1)} className="w-6 h-6 rounded-lg bg-dark-600 flex items-center justify-center text-white active:scale-90"><Minus size={11} /></button>
                      <span className="text-brand-400 font-black text-sm w-5 text-center">{qty}</span>
                      <button onClick={() => setQty(item._id, 1)} className="w-6 h-6 rounded-lg bg-brand-500 flex items-center justify-center text-white active:scale-90"><Plus size={11} /></button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {cartCount > 0 && !cartOpen && (
        <div className="fixed bottom-4 left-4 right-4 z-30">
          <button onClick={() => setCartOpen(true)}
            className="w-full bg-brand-500 text-white py-4 rounded-2xl flex items-center justify-between px-5 shadow-2xl shadow-brand-500/30 font-bold text-sm">
            <span className="bg-white/20 rounded-lg px-2 py-0.5 text-xs">{cartCount} items</span>
            <span>View Cart & Order</span>
            <span>{fmt(finalTotal)}</span>
          </button>
        </div>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setCartOpen(false)} />
          <div className="relative bg-dark-800 border-t border-dark-600 rounded-t-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-dark-600">
              <h3 className="font-bold text-white flex items-center gap-2"><ShoppingCart size={18} className="text-brand-400" /> Your Cart</h3>
              <button onClick={() => setCartOpen(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {cartItems.map((item) => (
                <div key={item._id} className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-medium truncate">{item.name}</div>
                    <div className="text-gray-500 text-xs">{fmt(item.price)} each</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => setQty(item._id, -1)} className="w-7 h-7 rounded-lg bg-dark-700 flex items-center justify-center text-white"><Minus size={12} /></button>
                    <span className="text-white font-bold w-5 text-center">{item.qty}</span>
                    <button onClick={() => setQty(item._id, 1)} className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center text-white"><Plus size={12} /></button>
                    <span className="text-white font-semibold w-16 text-right text-sm">{fmt(item.price * item.qty)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-dark-600 space-y-3">
              {/* Sitting / Parcel selector */}
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Order Type</div>
                <div className="grid grid-cols-2 gap-2">
                  {[{ key: 'dine_in', label: '🪑 Sitting', desc: 'Served at table' }, { key: 'parcel', label: '📦 Parcel', desc: 'Take away' }].map(({ key, label, desc }) => (
                    <button key={key} onClick={() => setOrderType(key)}
                      className={['rounded-xl p-2.5 text-sm font-semibold border transition-all text-center',
                        orderType === key
                          ? 'bg-brand-500/20 border-brand-500 text-brand-400'
                          : 'bg-dark-700 border-dark-600 text-gray-400'].join(' ')}>
                      <div>{label}</div>
                      <div className="text-[10px] font-normal mt-0.5 opacity-70">{desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              {/* Coupon */}
              {couponApplied ? (
                <div className="flex items-center justify-between rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2">
                  <span className="text-xs text-green-400 font-semibold">🎟 {couponApplied.code} — ₹{couponApplied.discountAmount} off</span>
                  <button onClick={() => { setCouponApplied(null); setCouponCode(''); }} className="text-xs text-red-400 ml-2">Remove</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Have a coupon code?"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && applyCoupon()}
                    className="flex-1 bg-dark-700 border border-dark-500 rounded-xl px-3 py-2 text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-500 text-xs font-mono uppercase"
                  />
                  <button onClick={applyCoupon} disabled={couponLoading || !couponCode.trim()}
                    className="px-3 py-2 rounded-xl bg-brand-500/20 border border-brand-500/40 text-brand-400 text-xs font-bold hover:bg-brand-500/30 disabled:opacity-40">
                    {couponLoading ? '…' : 'Apply'}
                  </button>
                </div>
              )}

              <div className="space-y-1">
                <div className="flex justify-between text-gray-400 text-sm">
                  <span>Subtotal</span><span>{fmt(finalTotal)}</span>
                </div>
                {couponDiscount > 0 && (
                  <div className="flex justify-between text-green-400 text-sm">
                    <span>Coupon discount</span><span>-{fmt(couponDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-white font-bold text-lg">
                  <span>Total</span><span>{fmt(finalTotal)}</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 text-center">
                +GST may apply · {orderType === 'parcel' ? '📦 Parcel' : `🪑 Table ${tableParam || 'Counter'}`}
              </p>
              <button onClick={placeOrder} disabled={ordering || cartItems.length === 0}
                className="w-full py-4 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                {ordering ? <><Loader size={16} className="animate-spin" /> Placing Order…</> : 'Place Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
