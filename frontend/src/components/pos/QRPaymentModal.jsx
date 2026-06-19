/**
 * QRPaymentModal — Show dynamic UPI QR with 5-min countdown.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { X, QrCode, CheckCircle, Clock, RefreshCw } from 'lucide-react';
import api from '../../lib/api';
import { getSocket } from '../../lib/socket';
import toast from 'react-hot-toast';

export default function QRPaymentModal({ session, franchise, onClose, onPaymentComplete }) {
  const [qrPayment,   setQrPayment]   = useState(null);
  const [generating,  setGenerating]  = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(300);
  const [status,      setStatus]      = useState('idle');
  const timerRef = useRef(null);
  const pollRef  = useRef(null);

  const amount = (session?.totalAmount || 0) - (session?.paidAmount || 0);

  const generate = useCallback(async () => {
    if (amount <= 0) { toast.error('No outstanding balance'); return; }
    setGenerating(true);
    try {
      const res = await api.post('/qrpayment/generate', {
        sessionId:    session._id,
        amount,
        method:       'UPI',
        merchantName: franchise?.name || 'UTC Café',
      });
      setQrPayment(res.data);
      setSecondsLeft(res.data.expiresInSeconds || 300);
      setStatus('pending');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not generate QR');
    }
    setGenerating(false);
  }, [session, amount, franchise]);

  useEffect(() => {
    if (status !== 'pending') return;
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { clearInterval(timerRef.current); setStatus('expired'); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [status]);

  useEffect(() => {
    if (status !== 'pending' || !qrPayment?.qrPaymentId) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/qrpayment/${qrPayment.qrPaymentId}/status`);
        if (res.data.status === 'completed') {
          clearInterval(pollRef.current);
          setStatus('completed');
          onPaymentComplete?.();
          toast.success('Payment confirmed!');
          setTimeout(() => onClose?.(), 1500);
        } else if (res.data.status === 'expired') {
          clearInterval(pollRef.current);
          setStatus('expired');
        }
      } catch {}
    }, 5000);
    return () => clearInterval(pollRef.current);
  }, [status, qrPayment, onPaymentComplete, onClose]);

  useEffect(() => {
    const socket = getSocket();
    const onCompleted = (data) => {
      if (data.sessionId?.toString() === session?._id?.toString()) {
        setStatus('completed');
        onPaymentComplete?.();
        toast.success('Payment received!');
        setTimeout(() => onClose?.(), 1500);
      }
    };
    const onExpired = (data) => {
      if (data.sessionId?.toString() === session?._id?.toString()) setStatus('expired');
    };
    socket.on('qrpayment:completed', onCompleted);
    socket.on('qrpayment:expired',   onExpired);
    return () => {
      socket.off('qrpayment:completed', onCompleted);
      socket.off('qrpayment:expired',   onExpired);
    };
  }, [session, onPaymentComplete, onClose]);

  useEffect(() => { generate(); }, []);

  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const secs = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl shadow-2xl max-w-xs w-full">
        <div className="flex items-center justify-between p-4 border-b border-dark-600">
          <div className="flex items-center gap-2">
            <QrCode size={20} className="text-brand-400" />
            <span className="font-bold text-white">UPI / QR Payment</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        <div className="p-4 flex flex-col items-center gap-4">
          <div className="text-center">
            <div className="text-3xl font-black text-white">₹{Number(amount).toFixed(2)}</div>
            <div className="text-xs text-gray-500 mt-1">Balance due</div>
          </div>

          {status === 'pending' && qrPayment?.qrData && (
            <div className="border-4 border-white rounded-xl p-1 bg-white">
              <img src={qrPayment.qrData} alt="UPI QR" style={{ width: 220, height: 220 }} />
            </div>
          )}
          {status === 'completed' && (
            <div className="flex flex-col items-center gap-2">
              <CheckCircle size={64} className="text-green-400" />
              <div className="text-green-400 font-bold text-lg">Payment Received!</div>
            </div>
          )}
          {status === 'expired' && (
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
                <Clock size={32} className="text-red-400" />
              </div>
              <div className="text-red-400 font-semibold">QR Expired</div>
            </div>
          )}
          {(status === 'idle') && generating && (
            <div className="w-16 h-16 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
          )}

          {status === 'pending' && (
            <div className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold ${
              secondsLeft <= 60 ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-dark-700 text-gray-400'
            }`}>
              <Clock size={14} /> Expires {mins}:{secs}
            </div>
          )}

          <div className="flex gap-2 w-full">
            {(status === 'expired' || status === 'idle') && (
              <button onClick={generate} disabled={generating}
                className="flex-1 flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white py-3 rounded-xl font-semibold text-sm">
                <RefreshCw size={14} className={generating ? 'animate-spin' : ''} />
                {generating ? 'Generating…' : 'New QR'}
              </button>
            )}
            {status === 'pending' && (
              <button
                onClick={async () => {
                  try { await api.post('/qrpayment/confirm', { qrPaymentId: qrPayment.qrPaymentId, reference: 'MANUAL' }); }
                  catch (err) { toast.error('Failed'); }
                }}
                className="flex-1 py-3 bg-green-500/20 border border-green-500/40 text-green-400 rounded-xl font-semibold text-sm hover:bg-green-500/30">
                Mark as Paid
              </button>
            )}
          </div>
          <p className="text-xs text-gray-600 text-center">Scan with PhonePe, GPay, Paytm or any UPI app</p>
        </div>
      </div>
    </div>
  );
}
