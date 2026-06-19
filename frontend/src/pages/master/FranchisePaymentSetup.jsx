import { useEffect, useState } from 'react';
import { CreditCard, Save, QrCode } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

const METHODS = ['Cash', 'UPI', 'Card', 'Net Banking'];

export default function FranchisePaymentSetup({ franchiseId, franchiseName }) {
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({
    bankAccountName: '', bankAccountNumber: '', ifscCode: '',
    upiId: '', upiQrImageUrl: '', acceptedMethods: ['Cash', 'UPI'],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [qrPreview, setQrPreview] = useState(null);

  useEffect(() => {
    if (!franchiseId) return;
    (async () => {
      try {
        const res = await api.get(`/payment-config/${franchiseId}`);
        if (res.data.config) {
          setConfig(res.data.config);
          setForm({ ...form, ...res.data.config });
        }
      } catch { /* No config yet */ }
      finally { setLoading(false); }
    })();
  }, [franchiseId]);

  const save = async () => {
    setSaving(true);
    try {
      await api.post(`/payment-config/${franchiseId}`, form);
      toast.success('Payment configuration saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const generateQR = async () => {
    try {
      const res = await api.get(`/payment-config/${franchiseId}/qr?amount=0`);
      setQrPreview(res.data.qr);
    } catch { toast.error('Failed to generate QR'); }
  };

  const toggleMethod = (m) => {
    setForm((prev) => ({
      ...prev,
      acceptedMethods: prev.acceptedMethods.includes(m)
        ? prev.acceptedMethods.filter((x) => x !== m)
        : [...prev.acceptedMethods, m],
    }));
  };

  if (loading) return <div className="card p-8 animate-pulse h-48 bg-dark-700" />;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-2">
        <CreditCard size={18} className="text-brand-400" />
        <h3 className="text-base font-bold text-white">Payment Setup — {franchiseName}</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bank Details */}
        <div className="card p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-300">Bank Account</h4>
          <div>
            <label className="label">Account Holder Name</label>
            <input className="input" value={form.bankAccountName}
              onChange={(e) => setForm({ ...form, bankAccountName: e.target.value })} />
          </div>
          <div>
            <label className="label">Account Number</label>
            <input className="input" value={form.bankAccountNumber}
              onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })} />
          </div>
          <div>
            <label className="label">IFSC Code</label>
            <input className="input uppercase" value={form.ifscCode}
              onChange={(e) => setForm({ ...form, ifscCode: e.target.value.toUpperCase() })} />
          </div>
        </div>

        {/* UPI Setup */}
        <div className="card p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-300">UPI / QR Payment</h4>
          <div>
            <label className="label">UPI ID</label>
            <input className="input" placeholder="mobile@upi or business@bank" value={form.upiId}
              onChange={(e) => setForm({ ...form, upiId: e.target.value })} />
          </div>
          <button onClick={generateQR} className="btn-ghost flex items-center gap-2 text-sm px-3 py-2 rounded-xl w-full justify-center">
            <QrCode size={15} /> Preview UPI QR Code
          </button>
          {qrPreview && (
            <div className="flex flex-col items-center gap-2 mt-2">
              <img src={qrPreview} alt="UPI QR" className="w-36 h-36 rounded-xl border border-dark-600" />
              <div className="text-xs text-gray-500">{form.upiId}</div>
            </div>
          )}
        </div>
      </div>

      {/* Accepted Payment Methods */}
      <div className="card p-4">
        <h4 className="text-sm font-semibold text-gray-300 mb-3">Accepted Payment Methods</h4>
        <div className="flex flex-wrap gap-3">
          {METHODS.map((m) => (
            <label key={m} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.acceptedMethods.includes(m)}
                onChange={() => toggleMethod(m)} className="accent-brand-500" />
              <span className="text-sm text-gray-300">{m}</span>
            </label>
          ))}
        </div>
      </div>

      <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2 text-sm px-5 py-2.5 rounded-xl">
        <Save size={16} /> {saving ? 'Saving...' : 'Save Payment Config'}
      </button>
    </div>
  );
}
