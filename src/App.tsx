import React, { useState, useEffect } from 'react';
import { User } from './types.ts';

// View Components
import DashboardView from './components/DashboardView.tsx';
import OrdersView from './components/OrdersView.tsx';
import OrderDetailsView from './components/OrderDetailsView.tsx';
import UsageRecordsView from './components/UsageRecordsView.tsx';

// Icons
import {
  LayoutDashboard,
  Boxes,
  Activity,
  Database
} from 'lucide-react';

type Tab = 'dashboard' | 'orders' | 'usages';

export default function App() {
  // Frictionless access: hardcoded admin user for backward-compatibility with view prop signatures
  const [currentUser] = useState<User>({
    id: 'guest',
    fullName: 'Guest Operator',
    email: 'guest@tracker.com',
    role: 'ADMIN',
    isActive: true,
  });
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    // Perform a quick connection check to check if database configuration is missing
    fetch('/api/auth/me')
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.isDbConfigMissing || (data.error && data.error.includes('Database configuration'))) {
            setDbError(data.error);
          }
        }
      })
      .catch((err) => {
        console.error('Error verifying database status:', err);
      });
  }, []);

  return (
    <div className="flex h-screen bg-slate-50/50 text-slate-800 overflow-hidden font-sans">
      {/* 1. COMPACT LEFT SIDEBAR NAVIGATION */}
      <aside id="sidebar" className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between flex-shrink-0 shadow-[1px_0_10px_rgba(0,0,0,0.01)]">
        <div className="flex flex-col flex-1">
          {/* Logo Brand Header */}
          <div className="h-16 border-b border-slate-200 flex items-center px-6 gap-2 bg-slate-50/30">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-semibold shadow-xs">
              <Boxes size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-tight">Order Tracker</h2>
              <span className="text-[9px] text-slate-400 font-bold tracking-wider uppercase">Supply Ops</span>
            </div>
          </div>

          {/* Tab Button Menu */}
          <nav className="p-4 space-y-1.5 flex-1">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
              { id: 'orders', label: 'Orders', icon: Boxes },
              { id: 'usages', label: 'Usage Records', icon: Activity }
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`tab_nav_${tab.id}`}
                  onClick={() => {
                    setActiveTab(tab.id as Tab);
                    // Reset single order detail view when switching away or navigating directly
                    setViewOrderId(null);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs rounded-xl font-medium transition-all ${
                    isActive
                      ? 'bg-indigo-50/80 text-indigo-700 border-l-4 border-indigo-600 pl-2.5 font-semibold'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Icon size={16} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* 2. FRICTIONLESS ACCESS SYSTEM STATUS */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-50 rounded-full flex items-center justify-center border border-emerald-100 shadow-xs">
              <Activity size={18} className="text-emerald-600 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold text-slate-950 truncate">
                Access: Fully Open
              </h4>
              <span className="text-[10px] text-slate-400 font-bold tracking-tight block">
                No passwords or login required
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* 3. SCROLLABLE MAIN CONTENT CANVAS */}
      <main className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-7xl mx-auto space-y-6">
          {dbError && (
            <div className="bg-amber-50 border-l-4 border-amber-600 p-6 rounded-xl shadow-xs space-y-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-100 rounded-lg text-amber-800">
                  <Database size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Database Connection Required</h3>
                  <p className="text-xs text-slate-600 mt-1">
                    This application operates on a PostgreSQL database using Prisma, but the <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px] text-pink-600">DATABASE_URL</code> environment variable is missing.
                  </p>
                </div>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-lg p-4 space-y-3 text-xs text-slate-700 shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)]">
                <span className="font-bold text-slate-900 block">How to configure the database connection:</span>
                <ol className="list-decimal list-inside space-y-1.5 pl-1">
                  <li>Click the <strong className="text-slate-900">Settings</strong> icon in the top-right corner of Google AI Studio.</li>
                  <li>In the panel, scroll down to the <strong className="text-slate-900">Secrets</strong> section.</li>
                  <li>Add a new secret:
                    <div className="mt-1.5 ml-4 space-y-1 bg-slate-50 border border-slate-200 p-2 rounded-md font-mono text-[11px] text-slate-600 max-w-lg select-all">
                      <div>Name: <span className="font-bold text-slate-800">DATABASE_URL</span></div>
                      <div>Value: <span className="text-indigo-600">postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require</span></div>
                    </div>
                  </li>
                  <li className="mt-1.5">Click <strong className="text-slate-900">Save Secrets</strong>.</li>
                  <li>Click <strong className="text-slate-900">Restart Dev Server</strong> in Google AI Studio to apply your credentials.</li>
                </ol>
              </div>
            </div>
          )}

          {activeTab === 'dashboard' && <DashboardView />}

          {activeTab === 'orders' && (
            viewOrderId ? (
              <OrderDetailsView
                currentUser={currentUser}
                orderId={viewOrderId}
                onBack={() => setViewOrderId(null)}
              />
            ) : (
              <OrdersView
                currentUser={currentUser}
                onSelectOrder={(id) => setViewOrderId(id)}
              />
            )
          )}

          {activeTab === 'usages' && <UsageRecordsView currentUser={currentUser} />}
        </div>
      </main>
    </div>
  );
}
