import React, { useState } from 'react';
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
  Activity
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
