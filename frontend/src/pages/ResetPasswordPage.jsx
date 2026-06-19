import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

const API = import.meta.env.VITE_API_URL || 'https://utc-cafe.onrender.com/api';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token    = params.get('token');

  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [done,      setDone]      = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password || password.length < 6) return toast.error('Password must be at least 6 characters');
    if (password !== confirm) return toast.error('Passwords do not match');
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      }).then(r => r.json());
      if (res.success) { setDone(true); }
      else toast.error(res.message || 'Reset failed');
    } catch { toast.error('Network error. Try again.'); }
    setLoading(false);
  };

  if (!token) return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center">
      <div className="card p-8 text-center space-y-4 max-w-sm w-full">
        <div className="text-4xl">❌</div>
        <p className="text-white">Invalid reset link.</p>
        <button onClick={() => navigate('/login')} className="btn-primary w-full py-3 rounded-xl">Back to Login</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center p-4">
      <Toaster position="top-center" />
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="UTC Café" style={{ height: '80px', margin: '0 auto', display: 'block' }} />
        </div>

        <div className="card p-8 space-y-5">
          {done ? (
            <div className="text-center space-y-4">
              <div className="text-4xl">✅</div>
              <h2 className="text-lg font-bold text-white">Password Reset!</h2>
              <p className="text-sm text-gray-400">Your master admin password has been updated.</p>
              <button onClick={() => navigate('/login')} className="btn-primary w-full py-3 rounded-xl mt-2">
                Go to Login
              </button>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-lg font-bold text-white">Set New Password</h2>
                <p className="text-xs text-gray-500 mt-1">Enter your new master admin password.</p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">New Password</label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      className="input pr-10"
                      placeholder="Min 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoFocus
                    />
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label">Confirm Password</label>
                  <input
                    type="password"
                    className="input"
                    placeholder="Repeat password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full py-3 rounded-xl">
                  {loading ? 'Resetting...' : 'Reset Password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
