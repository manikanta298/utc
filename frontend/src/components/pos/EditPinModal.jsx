import { useState, useRef, useEffect } from 'react';
import { Shield, X, Eye, EyeOff, Loader2 } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

/**
 * EditPinModal
 * Props:
 *   franchiseId  — the franchise whose PIN to verify
 *   onSuccess    — called when PIN is verified
 *   onClose      — called when modal is dismissed
 *   isMaster     — if true, bypasses PIN and calls onSuccess immediately
 */
export default function EditPinModal({ franchiseId, onSuccess, onClose, isMaster = false }) {
  const [pin, setPin]           = useState(['', '', '', '']);
  const [show, setShow]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const inputRefs               = useRef([]);

  // Master admin bypasses PIN entirely
  useEffect(() => {
    if (isMaster) { onSuccess(); }
  }, [isMaster]);

  if (isMaster) return null;

  const handleDigit = (index, value) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...pin];
    next[index] = value;
    setPin(next);
    setError('');
    if (value && index < 3) inputRefs.current[index + 1]?.focus();
    // Auto-submit when all 4 digits entered
    if (value && index === 3) {
      const full = [...next].join('');
      if (full.length === 4) verify(full);
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (text.length === 4) {
      setPin(text.split(''));
      verify(text);
    }
  };

  const verify = async (pinStr) => {
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/verify-edit-pin', { pin: pinStr, franchise_id: franchiseId });
      toast.success('PIN verified');
      onSuccess();
    } catch (err) {
      const msg = err.response?.data?.message || 'Incorrect PIN';
      setError(msg);
      setPin(['', '', '', '']);
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
              <Shield size={20} className="text-brand-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-sm">Order Edit Authentication</h2>
              <p className="text-gray-500 text-xs mt-0.5">Enter franchise PIN to continue</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* PIN boxes */}
        <div className="flex gap-3 justify-center mb-4" onPaste={handlePaste}>
          {pin.map((digit, i) => (
            <input
              key={i}
              ref={(el) => (inputRefs.current[i] = el)}
              type={show ? 'text' : 'password'}
              inputMode="numeric"
              maxLength={1}
              value={digit}
              autoFocus={i === 0}
              onChange={(e) => handleDigit(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className={`w-14 h-14 text-center text-xl font-bold bg-dark-700 border rounded-xl text-white focus:outline-none transition-colors ${
                error
                  ? 'border-red-500 focus:border-red-400'
                  : 'border-dark-500 focus:border-brand-500'
              }`}
            />
          ))}
        </div>

        {/* Show/hide toggle */}
        <div className="flex justify-center mb-4">
          <button
            onClick={() => setShow((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            {show ? <EyeOff size={13} /> : <Eye size={13} />}
            {show ? 'Hide' : 'Show'} PIN
          </button>
        </div>

        {/* Error */}
        {error && (
          <p className="text-center text-xs text-red-400 mb-3">{error}</p>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center">
            <Loader2 size={20} className="animate-spin text-brand-400" />
          </div>
        )}

        <p className="text-center text-xs text-gray-600 mt-2">
          Contact your franchise owner if you don't know the PIN
        </p>
      </div>
    </div>
  );
}
