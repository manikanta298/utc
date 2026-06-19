import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';

const ROLE_HOME = {
  master_admin: '/master/dashboard',
  franchise_owner: '/franchise/dashboard',
  manager: '/franchise/dashboard',
  pos_staff: '/pos',
  shift_operator: '/pos',
  kitchen_staff: '/kitchen',
  waiter: '/waiter',
};

const DUMMY_ACCOUNTS = [
  {
    label: 'Franchise Owner',
    sub: 'Full dashboard access',
    email: 'utc@gmail.com',
    icon: '👑',
    color: 'bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border-purple-500/30',
  },
  {
    label: 'POS Operator',
    sub: 'Billing & orders',
    email: 'utc1@gmail.com',
    icon: '🖥️',
    color: 'bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border-blue-500/30',
  },
  {
    label: 'Waiter',
    sub: 'Table & order service',
    email: 'utc2@gmail.com',
    icon: '🍽️',
    color: 'bg-green-500/15 hover:bg-green-500/25 text-green-300 border-green-500/30',
  },
  {
    label: 'Kitchen Staff',
    sub: 'Kitchen display',
    email: 'utc3@gmail.com',
    icon: '👨‍🍳',
    color: 'bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 border-orange-500/30',
  },
];
const DUMMY_PASSWORD = '9553963678';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleDummyLogin = async (acc) => {
    if (loading) return;
    setErrorMsg('');
    setLoading(true);
    try {
      const result = await login(acc.email, DUMMY_PASSWORD);
      if (result.success) {
        toast.success(`Welcome back, ${result.user.name}!`);
        navigate(ROLE_HOME[result.user.role] || '/login');
      } else {
        setErrorMsg(result.message || 'Demo login failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setErrorMsg('');
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.success) {
        toast.success(`Welcome back, ${result.user.name}!`);
        navigate(ROLE_HOME[result.user.role] || '/login');
      } else {
        setErrorMsg(result.message || 'Invalid email or password.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-bg min-h-screen flex items-center justify-center p-4">
      {/* Decorative background rings */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-64 h-64 bg-brand-600/5 rounded-full blur-2xl" />
      </div>

      <div className="w-full max-w-md animate-fade-in relative z-10">
        {/* Logo */}
        <div className="text-center mb-10">
          <img
            src="/logo.png"
            alt="UTC Café"
            style={{
              height: '130px',
              width: 'auto',
              display: 'block',
              margin: '0 auto',
              objectFit: 'contain',
            }}
          />
        </div>

        {/* Card */}
        <div className="card p-8 shadow-2xl">
          <h2 className="font-display text-xl font-semibold text-white mb-6">Sign in to your account</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">Email address</label>
              <input
                type="email"
                className="input"
                placeholder="you@utccafe.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  className="input pr-11"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3">
                <span>⚠️</span>
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base mt-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <><LogIn size={18} /> Sign In</>
              )}
            </button>

            <div className="text-center mt-4">
              <button
                type="button"
                onClick={() => navigate('/forgot-password')}
                className="text-xs text-gray-500 hover:text-brand-400 transition-colors"
              >
                Forgot password? (Master Admin only)
              </button>
            </div>
          </form>
        </div>

        {/* Demo Quick Login */}
        <div className="card p-5 mt-4 shadow-xl">
          <p className="text-xs text-gray-500 text-center mb-4 uppercase tracking-widest font-semibold">
            🚀 Quick Demo Login
          </p>
          <div className="grid grid-cols-2 gap-3">
            {DUMMY_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                type="button"
                onClick={() => handleDummyLogin(acc)}
                disabled={loading}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all text-left active:scale-95 disabled:opacity-50 ${acc.color}`}
              >
                <span className="text-xl flex-shrink-0">{acc.icon}</span>
                <div className="min-w-0">
                  <div className="text-xs font-bold leading-tight truncate">{acc.label}</div>
                  <div className="text-[10px] opacity-60 leading-tight truncate">{acc.sub}</div>
                </div>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-600 text-center mt-3">
            Password: <span className="font-mono text-gray-400">9553963678</span>
          </p>
        </div>

        <p className="text-center text-gray-700 text-xs mt-6">
          © 2025 UTC — Unified Café Technology. All rights reserved.
        </p>
      </div>
    </div>
  );
}
