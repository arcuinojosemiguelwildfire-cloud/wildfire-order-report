import React, { useState } from 'react';
import { apiPost, setAuthToken } from '../utils/api.ts';
import { User, Shield, Key, AlertTriangle } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (user: any) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await apiPost('/auth/login', { email, password });
      setAuthToken(data.token);
      onLoginSuccess(data.user);
    } catch (err: any) {
      setError(err.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (role: 'ADMIN' | 'ENCODER') => {
    setLoading(true);
    setError(null);
    const credentials = {
      ADMIN: { email: 'admin@tracker.com', password: 'admin123' },
      ENCODER: { email: 'encoder@tracker.com', password: 'encoder123' },
    };

    const creds = credentials[role];
    setEmail(creds.email);
    setPassword(creds.password);

    try {
      const data = await apiPost('/auth/login', creds);
      setAuthToken(data.token);
      onLoginSuccess(data.user);
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate using preset credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="login_container" className="min-h-screen flex items-center justify-center bg-slate-50/50 p-4">
      <div id="login_card" className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.03)] p-8">
        <div className="text-center mb-8">
          <div className="mx-auto w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-4 border border-indigo-100 shadow-sm">
            <Shield size={24} />
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Event Order Usage Tracker</h1>
          <p className="text-xs text-slate-500 mt-1.5">Sign in to manage event supply lifecycles</p>
        </div>

        {error && (
          <div id="login_error" className="mb-6 p-4 bg-red-50 text-red-700 text-xs rounded-xl flex items-start gap-2 border border-red-100 shadow-xs">
            <AlertTriangle className="flex-shrink-0 mt-0.5" size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Email Address</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                <User size={16} />
              </span>
              <input
                id="login_email_input"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 bg-slate-50/50 focus:bg-white transition-all"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Password</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                <Key size={16} />
              </span>
              <input
                id="login_password_input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 bg-slate-50/50 focus:bg-white transition-all"
                disabled={loading}
              />
            </div>
          </div>

          <button
            id="login_submit_btn"
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs py-2 px-4 rounded-xl transition-all duration-150 flex items-center justify-center h-11 mt-6 disabled:opacity-50 shadow-xs cursor-pointer"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="relative flex items-center justify-center my-6">
          <div className="border-t border-slate-200 w-full"></div>
          <span className="absolute bg-white px-3 text-[10px] text-slate-400 uppercase tracking-widest font-bold">Quick Dev Access</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            id="quick_login_admin_btn"
            type="button"
            onClick={() => handleQuickLogin('ADMIN')}
            className="text-xs bg-slate-50 border border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 text-slate-700 py-2 px-3 rounded-xl font-medium transition-all cursor-pointer"
            disabled={loading}
          >
            Login as Admin
          </button>
          <button
            id="quick_login_encoder_btn"
            type="button"
            onClick={() => handleQuickLogin('ENCODER')}
            className="text-xs bg-slate-50 border border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 text-slate-700 py-2 px-3 rounded-xl font-medium transition-all cursor-pointer"
            disabled={loading}
          >
            Login as Encoder
          </button>
        </div>
      </div>
    </div>
  );
}
