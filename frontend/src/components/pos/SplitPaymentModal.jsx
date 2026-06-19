import { useState } from 'react';
import {
  X, Banknote, CreditCard, Smartphone, Wallet,
  Plus, CheckCircle2, Loader2, IndianRupee, AlertCircle,
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const METHODS = [
  { id: 'Cash',        label: 'Cash',        Icon: Banknote,    color: 'text-green-400',  bg: 'bg-green-400/10',  border: 'border-green-500/30' },
  { id: 'UPI',         label: 'UPI',         Icon: Smartphone,  color: 'text-blue-400',   bg: 'bg-blue-400/10',   border: 'border-blue-500/30' },
  { id: 'Card',        label: 'Card',        Icon: CreditCard,  color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-500/30' },
  { id: 'Net Banking', label: 'Net Banking', Icon: CreditCard,  color: 'text-cyan-400',   bg: 'bg-cyan-400/10',   border: 'border-cyan-500/30' },
  { id: 'Wallet',      label: 'Wallet',      Icon: Wallet,      color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-500/30' },
];

const fmt = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * SplitPaymentModal
 * Props:
 *   sessionId   — active session _id
 *   totalAmount — bill total
 *   onSuccess   — called with { invoice } when fully paid
 *   onClose     — dismiss modal
 */
export default function SplitPaymentModal({ sessionId, totalAmount, onSuccess, onClose }) {
  const [entries, setEntries]     = useState([]);   // locally recorded
  const [paidTotal, setPaidTotal] = useState(0);
  const [method, setMethod]       = useState('Cash');
  const [amount, setAmount]       = useState('');
  const [reference, setReference] = useState('');
  const [adding, setAdding]       = useState(false);
  const [done, setDone]           = useState(false);

  const remaining = Math.max(0, totalAmount - paidTotal);
  const overpaid  = paidTotal > totalAmount;

  const fillRemaining = () => setAmount(remaining.toFixed(2));

  const addPayment = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    if (amt > remaining + 0.01) { toast.error(`Amount exceeds remaining balance of ${fmt(remaining)}`); return; }

    setAdding(true);
    try {
      const res = await api.post(`/sessions/${sessionId}/payment`, {
        amount: amt,
        method,
        reference: reference.trim() || '',
      });

      const newPaid = res.data.session?.paidAmount ?? (paidTotal + amt);
      setPaidTotal(newPaid);
      setEntries((prev) => [...prev, { method, amount: amt, reference: reference.trim() }]);
      setAmount('');
      setReference('');

      if (res.data.session?.paymentStatus === 'fully_paid') {
        setDone(true);
        toast.success('Payment complete!');
        setTimeout(() => onSuccess({ invoice: res.data.invoice, session: res.data.session }), 800);
      } else {
        const bal = res.data.balance ?? (totalAmount - newPaid);
        toast.success(`${fmt(amt)} recorded · Remaining: ${fmt(bal)}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Payment failed');
    } finally {
      setAdding(false);
    }
  };

  const selectedMethod = METHODS.find((m) => m.id === method);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-md shadow-2xl animate-slide-up flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-dark-600 shrink-0">
          <div>
            <h2 className="text-white font-bold flex items-center gap-2">
              <IndianRupee size={18} className="text-brand-400" /> Split Payment
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Accept multiple payment methods</p>
          </div>
          {!done && (
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
              <X size={18} />
            </button>
          )}
        </div>

        {/* Bill summary bar */}
        <div className="px-5 py-4 border-b border-dark-600 grid grid-cols-3 gap-3 text-center shrink-0">
          <div>
            <div className="text-xs text-gray-500 mb-1">Bill Total</div>
            <div className="text-white font-mono font-semibold text-sm">{fmt(totalAmount)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Paid</div>
            <div className="text-green-400 font-mono font-semibold text-sm">{fmt(paidTotal)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Remaining</div>
            <div className={`font-mono font-semibold text-sm ${remaining === 0 ? 'text-green-400' : 'text-yellow-400'}`}>
              {fmt(remaining)}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-5 pt-3 pb-0 shrink-0">
          <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-500 to-green-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, (paidTotal / totalAmount) * 100)}%` }}
            />
          </div>
          <div className="text-right text-xs text-gray-600 mt-1">
            {Math.min(100, Math.round((paidTotal / totalAmount) * 100))}% paid
          </div>
        </div>

        {/* Entries so far */}
        {entries.length > 0 && (
          <div className="px-5 pt-3 space-y-2 overflow-y-auto max-h-36 shrink-0">
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">Transactions</div>
            {entries.map((e, i) => {
              const m = METHODS.find((x) => x.id === e.method);
              return (
                <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-xl border ${m?.border} ${m?.bg}`}>
                  <div className="flex items-center gap-2">
                    {m && <m.Icon size={14} className={m.color} />}
                    <span className={`text-sm font-medium ${m?.color}`}>{e.method}</span>
                    {e.reference && <span className="text-xs text-gray-500 font-mono">{e.reference}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-mono text-sm">{fmt(e.amount)}</span>
                    <CheckCircle2 size={14} className="text-green-400" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add payment entry */}
        {!done && remaining > 0 && (
          <div className="px-5 pt-4 pb-5 space-y-3 border-t border-dark-600 mt-3">
            {/* Method selector */}
            <div className="grid grid-cols-5 gap-1.5">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={`flex flex-col items-center gap-1 py-2 rounded-xl border text-xs font-medium transition-all ${
                    method === m.id ? `${m.bg} ${m.border} ${m.color}` : 'border-dark-500 bg-dark-700 text-gray-500 hover:text-white'
                  }`}
                >
                  <m.Icon size={14} />
                  <span className="text-[10px] leading-tight text-center">{m.label}</span>
                </button>
              ))}
            </div>

            {/* Amount */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Amount</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-dark-700 border border-dark-500 text-white text-sm rounded-xl pl-7 pr-3 py-2.5 focus:outline-none focus:border-brand-500"
                    onKeyDown={(e) => e.key === 'Enter' && addPayment()}
                  />
                </div>
                <button
                  onClick={fillRemaining}
                  className="px-3 py-2 text-xs bg-dark-700 border border-dark-500 text-gray-400 hover:text-brand-400 hover:border-brand-500 rounded-xl transition-colors whitespace-nowrap"
                >
                  Full {fmt(remaining)}
                </button>
              </div>
            </div>

            {/* Reference (UPI/Card) */}
            {(method === 'UPI' || method === 'Card' || method === 'Net Banking') && (
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">
                  {method === 'UPI' ? 'UPI Transaction ID' : method === 'Card' ? 'Last 4 digits' : 'Reference No.'}
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder={method === 'Card' ? 'e.g. 4242' : 'Optional'}
                  className="w-full bg-dark-700 border border-dark-500 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-brand-500"
                />
              </div>
            )}

            {/* Add button */}
            <button
              onClick={addPayment}
              disabled={adding || !amount}
              className={`w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 ${
                selectedMethod
                  ? `${selectedMethod.bg} ${selectedMethod.border} border ${selectedMethod.color} hover:opacity-80`
                  : 'bg-brand-500 text-white hover:bg-brand-600'
              }`}
            >
              {adding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Record {method} Payment
            </button>
          </div>
        )}

        {/* Done state */}
        {done && (
          <div className="flex flex-col items-center gap-3 py-8 px-5">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle2 size={32} className="text-green-400" />
            </div>
            <div className="text-white font-bold text-lg">Payment Complete!</div>
            <div className="text-sm text-gray-500 text-center">
              {entries.length} transaction{entries.length !== 1 ? 's' : ''} recorded · Total {fmt(totalAmount)}
            </div>
          </div>
        )}

        {/* Overpaid warning */}
        {overpaid && !done && (
          <div className="mx-5 mb-4 flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-xl px-3 py-2 text-xs text-orange-400">
            <AlertCircle size={14} /> Change to return: {fmt(paidTotal - totalAmount)}
          </div>
        )}
      </div>
    </div>
  );
}
