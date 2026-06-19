import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return toast.error('Enter your email');
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      }).then(r => r.json());
      if (res.success) { setSent(true); }
      else toast.error(res.message || 'Something went wrong');
    } catch { toast.error('Network error. Try again.'); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center p-4">
      <Toaster position="top-center" />
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="UTC Café" style={{ height: '80px', margin: '0 auto', display: 'block' }} />
        </div>

        <div className="card p-8 space-y-5">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="text-4xl">📧</div>
              <h2 className="text-lg font-bold text-white">Check Your Email</h2>
              <p className="text-sm text-gray-400">
                A password reset link has been sent to <span className="text-brand-400">{email}</span>.
                The link is valid for <strong className="text-white">30 minutes</strong>.
              </p>
              <button onClick={() => navigate('/login')} className="btn-ghost w-full py-2.5 rounded-xl text-sm mt-2">
                Back to Login
              </button>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-lg font-bold text-white">Forgot Password</h2>
                <p className="text-xs text-gray-500 mt-1">Master Admin only. Enter your registered email.</p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">Email Address</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="admin@yourdomain.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                  />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full py-3 rounded-xl">
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
                <button type="button" onClick={() => navigate('/login')}
                  className="btn-ghost w-full py-2.5 rounded-xl text-sm text-gray-500">
                  Back to Login
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
