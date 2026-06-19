/**
 * SessionInvoicePanel — Running invoice view for a session.
 * Shows: Total Bill | Paid Amount | Pending Balance | Unpaid Items | Discounts | Payment Status
 */
import { useState, useEffect } from 'react';
import {
  Receipt, CreditCard, Banknote, Smartphone, RefreshCw,
  CheckCircle, AlertCircle, PlusCircle, Printer, QrCode,
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;

const METHOD_ICON = { Cash: Banknote, UPI: Smartphone, Card: CreditCard, 'Net Banking': CreditCard };

export default function SessionInvoicePanel({
  sessionId,
  onClose,
  onPrint,
  onQRPay,
  onPaymentRecorded,
}) {
  const [session,      setSession]      = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [recording,    setRecording]    = useState(false);
  const [payAmount,    setPayAmount]    = useState('');
  const [payMethod,    setPayMethod]    = useState('Cash');
  const [payRef,       setPayRef]       = useState('');
  const [billOrderType, setBillOrderType] = useState('dine_in');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/sessions/${sessionId}`);
      setSession(res.data.session);
      setBillOrderType(res.data.session?.orderType === 'parcel' ? 'parcel' : 'dine_in');
    } catch (err) {
      toast.error('Could not load session');
    }
    setLoading(false);
  };

  useEffect(() => { if (sessionId) load(); }, [sessionId]);

  const handleGenerateBill = async () => {
    try {
      await api.post(`/sessions/${sessionId}/bill`, { orderType: billOrderType });
      await load();
      toast.success('Bill generated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  const handleRecordPayment = async () => {
    const amount = Number(payAmount);
    if (!amount || amount <= 0) { toast.error('Enter valid amount'); return; }
    setRecording(true);
    try {
      await api.post(`/sessions/${sessionId}/payment`, {
        amount, method: payMethod, reference: payRef,
      });
      setPayAmount(''); setPayRef('');
      await load();
      onPaymentRecorded?.();
      toast.success('Payment recorded');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
    setRecording(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!session) return null;

  const total      = session.totalAmount || 0;
  const paid       = session.paidAmount  || 0;
  const pending    = Math.max(0, total - paid);
  const payStatus  = session.paymentStatus;
  const isClosed   = session.status === 'paid' || session.status === 'closed';

  const statusBadge = {
    unpaid:          { label: 'Unpaid',        color: 'text-red-400 bg-red-400/10 border-red-400/30' },
    partially_paid:  { label: 'Partially Paid', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' },
    advance_paid:    { label: 'Advance',        color: 'text-blue-400 bg-blue-400/10 border-blue-400/30' },
    fully_paid:      { label: 'Fully Paid',     color: 'text-green-400 bg-green-400/10 border-green-400/30' },
  };
  const badge = statusBadge[payStatus] || statusBadge.unpaid;

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt size={18} className="text-brand-400" />
          <span className="font-bold text-white">Running Invoice</span>
          <span className="text-xs font-mono text-gray-500">#{session.tokenNumber}</span>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${badge.color}`}>
          {badge.label}
        </span>
      </div>

      {/* Summary boxes */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-dark-700 rounded-xl p-3 text-center">
          <div className="text-[10px] text-gray-500 mb-1">Total Bill</div>
          <div className="text-lg font-black text-white">{fmt(total)}</div>
        </div>
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 text-center">
          <div className="text-[10px] text-gray-500 mb-1">Paid</div>
          <div className="text-lg font-black text-green-400">{fmt(paid)}</div>
        </div>
        <div className={`rounded-xl p-3 text-center ${pending > 0 ? 'bg-red-500/10 border border-red-500/30' : 'bg-dark-700'}`}>
          <div className="text-[10px] text-gray-500 mb-1">Balance</div>
          <div className={`text-lg font-black ${pending > 0 ? 'text-red-400' : 'text-gray-500'}`}>{fmt(pending)}</div>
        </div>
      </div>

      {/* Merged items */}
      {(session.mergedItems || []).length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Items</div>
          <div className="bg-dark-700 rounded-xl divide-y divide-dark-600">
            {session.mergedItems.map((item, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-white">{item.name}</span>
                <div className="flex items-center gap-3 text-gray-400">
                  <span>×{item.qty}</span>
                  <span className="text-white font-semibold">{fmt(item.totalPrice)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sub-orders / additions */}
      {(session.subOrders || []).length > 1 && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Order Rounds ({session.subOrders.length})
          </div>
          <div className="space-y-1">
            {session.subOrders.map((sub, i) => (
              <div key={i} className="bg-dark-700 rounded-lg px-3 py-2 flex items-center justify-between text-xs text-gray-400">
                <span className="flex items-center gap-1.5">
                  {i > 0 && <PlusCircle size={11} className="text-amber-400" />}
                  Round {i + 1} — {sub.items?.length || 0} items
                </span>
                <span>{new Date(sub.orderedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tax breakdown */}
      {total > 0 && (
        <div className="bg-dark-700 rounded-xl p-3 space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-400">
            <span>Subtotal</span><span>{fmt(session.subtotal)}</span>
          </div>
          {(session.cgst_amount || 0) > 0 && (
            <div className="flex justify-between text-gray-400">
              <span>CGST</span><span>{fmt(session.cgst_amount)}</span>
            </div>
          )}
          {(session.sgst_amount || 0) > 0 && (
            <div className="flex justify-between text-gray-400">
              <span>SGST</span><span>{fmt(session.sgst_amount)}</span>
            </div>
          )}
          {(session.discountAmount || 0) > 0 && (
            <div className="flex justify-between text-green-400">
              <span>Discount {session.couponCode ? `(${session.couponCode})` : ''}</span>
              <span>-{fmt(session.discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-white border-t border-dark-500 pt-1.5">
            <span>Total</span><span>{fmt(total)}</span>
          </div>
        </div>
      )}

      {/* Payment history */}
      {(session.payments || []).length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Payments Received</div>
          <div className="space-y-1">
            {session.payments.map((p, i) => {
              const Icon = METHOD_ICON[p.method] || Banknote;
              return (
                <div key={i} className="flex items-center justify-between bg-dark-700 rounded-lg px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-400">
                    <Icon size={13} />
                    <span>{p.method}</span>
                    {p.reference && <span className="text-xs text-gray-600">#{p.reference}</span>}
                  </div>
                  <span className="text-green-400 font-semibold">{fmt(p.amount)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Generate bill if not yet */}
      {session.status === 'open' && total === 0 && (
        <div className="space-y-3">
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Order Type</div>
            <div className="grid grid-cols-2 gap-2">
              {[{ key: 'dine_in', label: '🪑 Sitting', desc: 'Dine-In' }, { key: 'parcel', label: '📦 Parcel', desc: 'Take Away' }].map(({ key, label, desc }) => (
                <button key={key} onClick={() => setBillOrderType(key)}
                  className={['rounded-xl py-2 px-3 text-sm font-semibold border transition-all',
                    billOrderType === key
                      ? 'bg-brand-500/20 border-brand-500 text-brand-400'
                      : 'bg-dark-700 border-dark-600 text-gray-400 hover:text-white'].join(' ')}>
                  <div>{label}</div>
                  <div className="text-[10px] opacity-70 font-normal">{desc}</div>
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleGenerateBill}
            className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-semibold text-sm">
            Generate Bill
          </button>
        </div>
      )}

      {/* Record payment */}
      {!isClosed && pending > 0 && (
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-3 space-y-3">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Record Payment</div>
          <div className="grid grid-cols-3 gap-2">
            {['Cash', 'UPI', 'Card', 'Net Banking'].map((m) => (
              <button key={m} onClick={() => setPayMethod(m)}
                className={['py-1.5 rounded-lg text-xs font-semibold transition-all',
                  payMethod === m ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-400 hover:text-white'].join(' ')}>
                {m}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder={`Amount (due: ${fmt(pending)})`}
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="flex-1 bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-brand-500"
            />
            <button
              onClick={() => setPayAmount(String(pending.toFixed(2)))}
              className="px-3 py-2 bg-dark-700 text-gray-400 rounded-lg text-xs hover:text-white"
            >
              Full
            </button>
          </div>
          {['UPI', 'Card'].includes(payMethod) && (
            <input
              type="text"
              placeholder="Reference / TXN ID"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-brand-500"
            />
          )}
          <div className="flex gap-2">
            <button
              onClick={handleRecordPayment}
              disabled={recording}
              className="flex-1 py-2.5 bg-green-500 hover:bg-green-400 text-white rounded-xl font-semibold text-sm disabled:opacity-50"
            >
              {recording ? 'Saving…' : 'Record Payment'}
            </button>
            {onQRPay && pending > 0 && (
              <button
                onClick={onQRPay}
                className="py-2.5 px-3 bg-brand-500/20 border border-brand-500/40 text-brand-400 rounded-xl text-sm hover:bg-brand-500/30"
              >
                <QrCode size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {isClosed && (
        <div className="flex items-center justify-center gap-2 py-3 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400 font-semibold text-sm">
          <CheckCircle size={16} /> Session Fully Paid & Closed
        </div>
      )}

      {/* Action row */}
      <div className="flex gap-2 pb-4">
        <button onClick={load} className="p-2.5 bg-dark-700 text-gray-400 rounded-xl hover:text-white">
          <RefreshCw size={16} />
        </button>
        {onPrint && (
          <button onClick={() => onPrint(session)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-dark-700 hover:bg-dark-600 text-white rounded-xl font-semibold text-sm">
            <Printer size={16} /> Print Bill
          </button>
        )}
      </div>
    </div>
  );
}
