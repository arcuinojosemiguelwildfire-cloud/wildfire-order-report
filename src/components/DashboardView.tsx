import React, { useState, useEffect } from 'react';
import { apiGet, formatDate } from '../utils/api.ts';
import { UsageTransaction, OrderItem } from '../types.ts';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import {
  Boxes,
  Activity,
  CheckCircle,
  Clock,
  AlertTriangle,
  FileText,
  Calendar,
  XCircle
} from 'lucide-react';

export default function DashboardView() {
  const [stats, setStats] = useState({
    totalReceived: 0,
    totalUsedThisMonth: 0,
    totalAvailable: 0,
    currentlyDeployed: 0,
    pendingReturn: 0,
    lowStockItems: 0,
    outOfStockItems: 0,
  });

  const [charts, setCharts] = useState({
    trend: [] as any[],
    purpose: [] as any[],
    topItems: [] as any[],
    topEvents: [] as any[],
  });

  const [recentUsages, setRecentUsages] = useState<UsageTransaction[]>([]);
  const [lowStockList, setLowStockList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Date Filters
  const [dateRange, setDateRange] = useState('all'); // all, this-month, last-30
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Calculate start and end dates if using preset ranges
      let sDate = startDate;
      let eDate = endDate;

      if (dateRange === 'this-month') {
        const firstDay = new Date();
        firstDay.setDate(1);
        firstDay.setHours(0,0,0,0);
        sDate = firstDay.toISOString();
        eDate = new Date().toISOString();
      } else if (dateRange === 'last-30') {
        const past = new Date();
        past.setDate(past.getDate() - 30);
        sDate = past.toISOString();
        eDate = new Date().toISOString();
      }

      // 1. Get stats
      let statsQuery = '';
      if (sDate && eDate) {
        statsQuery = `?startDate=${encodeURIComponent(sDate)}&endDate=${encodeURIComponent(eDate)}`;
      }
      const statsData = await apiGet(`/dashboard/stats${statsQuery}`);
      setStats({
        totalReceived: 0,
        totalUsedThisMonth: 0,
        totalAvailable: 0,
        currentlyDeployed: 0,
        pendingReturn: 0,
        lowStockItems: 0,
        outOfStockItems: 0,
        ...statsData
      });

      // 2. Get charts
      const chartsData = await apiGet('/dashboard/charts');
      setCharts({
        trend: [],
        purpose: [],
        topItems: [],
        topEvents: [],
        ...chartsData
      });

      // 3. Get recent usages
      const recentUsagesData = await apiGet('/usages');
      const recentUsagesList = Array.isArray(recentUsagesData) ? recentUsagesData : (recentUsagesData?.usageRecords || []);
      setRecentUsages(recentUsagesList.slice(0, 5));

      // 4. Get items balance (for low stock list)
      const balances = await apiGet('/dashboard/low-stock');
      const lowStock = (Array.isArray(balances) ? balances : []).filter(
        (item: any) => item.qtyAvailable <= item.minimumStock || item.qtyAvailable === 0
      );
      setLowStockList(lowStock.slice(0, 5));

    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch dashboard data. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [dateRange, startDate, endDate]);

  if (loading && recentUsages.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-slate-500 text-sm">Loading dashboard data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 border border-slate-200 rounded-xl shadow-xs">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5">Real-time status of supplies and item movements</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200">
            <button
              onClick={() => { setDateRange('all'); setStartDate(''); setEndDate(''); }}
              className={`text-xs px-3 py-1 rounded-lg font-medium transition ${dateRange === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'}`}
            >
              All Time
            </button>
            <button
              onClick={() => { setDateRange('this-month'); }}
              className={`text-xs px-3 py-1 rounded-lg font-medium transition ${dateRange === 'this-month' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'}`}
            >
              This Month
            </button>
            <button
              onClick={() => { setDateRange('last-30'); }}
              className={`text-xs px-3 py-1 rounded-lg font-medium transition ${dateRange === 'last-30' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'}`}
            >
              Last 30 Days
            </button>
          </div>

          <button
            onClick={fetchDashboardData}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium bg-indigo-50 hover:bg-indigo-100/70 px-3 py-1.5 rounded-lg border border-indigo-100 transition"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 text-xs rounded-lg border border-red-100">
          {error}
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {/* Total Items Received */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.015)] p-5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.025)] transition-all duration-300">
          <div className="flex justify-between items-start text-slate-400 mb-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Received</span>
            <Boxes size={18} className="text-indigo-600" />
          </div>
          <div className="text-xl font-bold text-slate-900">{stats.totalReceived}</div>
          <p className="text-[10px] text-slate-400 mt-1">Total across all batches</p>
        </div>

        {/* Available In Stock */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.015)] p-5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.025)] transition-all duration-300">
          <div className="flex justify-between items-start text-emerald-500 mb-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Available In Stock</span>
            <CheckCircle size={18} className="text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-slate-900">{stats.totalAvailable}</div>
          <p className="text-[10px] text-slate-400 mt-1">Currently in shelves</p>
        </div>

        {/* Currently Deployed */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.015)] p-5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.025)] transition-all duration-300">
          <div className="flex justify-between items-start text-blue-500 mb-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Currently Deployed</span>
            <Clock size={18} className="text-blue-500" />
          </div>
          <div className="text-xl font-bold text-slate-900">{stats.currentlyDeployed}</div>
          <p className="text-[10px] text-slate-400 mt-1">Active deployments</p>
        </div>

        {/* Pending Return */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.015)] p-5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.025)] transition-all duration-300">
          <div className="flex justify-between items-start text-indigo-500 mb-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pending Return</span>
            <Calendar size={18} className="text-indigo-500" />
          </div>
          <div className="text-xl font-bold text-slate-900">{stats.pendingReturn}</div>
          <p className="text-[10px] text-slate-400 mt-1">Reusable item lines</p>
        </div>

        {/* Low Stock Items */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.015)] p-5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.025)] transition-all duration-300">
          <div className="flex justify-between items-start text-amber-500 mb-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Low Stock Items</span>
            <AlertTriangle size={18} className="text-amber-500" />
          </div>
          <div className="text-xl font-bold text-slate-900">{stats.lowStockItems}</div>
          <p className="text-[10px] text-slate-400 mt-1">At or below min stock</p>
        </div>

        {/* Out of Stock Items */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.015)] p-5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.025)] transition-all duration-300">
          <div className="flex justify-between items-start text-red-500 mb-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Out of Stock / Fully Used</span>
            <XCircle size={18} className="text-red-500" />
          </div>
          <div className="text-xl font-bold text-slate-900">{stats.outOfStockItems}</div>
          <p className="text-[10px] text-slate-400 mt-1">No remaining quantity</p>
        </div>
      </div>

      {/* Analytics Charts section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Monthly Usage Trend */}
        <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.015)]">
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Monthly Usage Trend</h2>
          <div className="h-64">
            {charts.trend.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-slate-400">No usage trend recorded yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={charts.trend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorQty" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" tickLine={false} style={{ fontSize: 10 }} />
                  <YAxis tickLine={false} style={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Area type="monotone" dataKey="quantity" name="Items Used" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorQty)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Usage by Purpose */}
        <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.015)]">
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Usage by Purpose</h2>
          <div className="h-64 flex flex-col sm:flex-row items-center justify-center gap-6">
            <div className="w-full sm:w-1/2 h-48 sm:h-full">
              {charts.purpose.every(c => c.value === 0) ? (
                <div className="flex items-center justify-center h-full text-xs text-slate-400">No transactions categorized yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={charts.purpose.filter(p => p.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {charts.purpose.filter(p => p.value > 0).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="w-full sm:w-1/2 space-y-2">
              {charts.purpose.map((entry, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                    <span>{entry.name}</span>
                  </div>
                  <span className="font-semibold text-slate-900">{entry.value} pcs</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chart 3: Top Used Items */}
        <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.015)]">
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Top Used Items (Most Consumed/Deployed)</h2>
          <div className="h-64">
            {charts.topItems.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-slate-400">No item usages recorded.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.topItems} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" tickLine={false} style={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tickLine={false} style={{ fontSize: 10 }} width={90} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="quantity" name="Quantity Used" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 4: Top Events by Deployment */}
        <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.015)]">
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Top Events by Item Deployment</h2>
          <div className="h-64">
            {charts.topEvents.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-slate-400">No event deployments registered.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.topEvents} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tickLine={false} style={{ fontSize: 9 }} />
                  <YAxis tickLine={false} style={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="quantity" name="Allocated Supplies" fill="#10b981" radius={[4, 4, 0, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Tables Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Recent Usage Records */}
        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-xl shadow-xs p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Recent Usage Records</h3>
            <span className="text-[10px] text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200 font-semibold">Live Ledger</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-500">
              <thead className="bg-slate-50 text-slate-400 uppercase text-[9px] tracking-widest border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Destination/Recipient</th>
                  <th className="py-2.5 px-3">Items Summary</th>
                  <th className="py-2.5 px-3">Encoded By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentUsages.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400">No usage records yet.</td>
                  </tr>
                ) : (
                  recentUsages.map((tx) => {
                    let recipient = '-';
                    if (tx.usageType === 'EVENT') recipient = tx.eventName || 'Event';
                    else if (tx.usageType === 'OFFICE') recipient = tx.reason || 'Office';
                    else if (tx.usageType === 'EMPLOYEE_REPLACEMENT') recipient = tx.employeeName || 'Employee';
                    else recipient = tx.reason || 'Damage/Loss';

                    const itemsSummary = tx.items?.map(i => `${i.orderItem?.itemName} (x${i.quantity})`).join(', ') || '-';

                    return (
                      <tr key={tx.id} className="hover:bg-slate-50/50 transition">
                        <td className="py-2.5 px-3">{formatDate(tx.usageDate)}</td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-medium border ${
                            tx.usageType === 'EVENT' ? 'bg-indigo-50 border-indigo-100 text-indigo-700' :
                            tx.usageType === 'OFFICE' ? 'bg-blue-50 border-blue-100 text-blue-700' :
                            tx.usageType === 'EMPLOYEE_REPLACEMENT' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                            tx.usageType === 'RETURN' ? 'bg-teal-50 border-teal-100 text-teal-700' :
                            'bg-red-50 border-red-100 text-red-700'
                          }`}>
                            {tx.usageType.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 font-medium truncate max-w-[150px]">{recipient}</td>
                        <td className="py-2.5 px-3 truncate max-w-[200px]" title={itemsSummary}>{itemsSummary}</td>
                        <td className="py-2.5 px-3">{tx.encodedBy || 'Guest Operator'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low Stock / Attention Needed */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Stock Attention Needed</h3>
            <span className="text-[10px] text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 font-semibold">Alerts</span>
          </div>

          <div className="space-y-3">
            {lowStockList.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs">All item stocks are in stable levels.</div>
            ) : (
              lowStockList.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200 hover:border-slate-350 transition-all">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">{item.itemName}</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">Order No: {item.orderNumber} • Type: {item.itemType}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-slate-800">Available: {item.qtyAvailable}</div>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[8px] font-bold mt-1 ${
                      item.qtyAvailable === 0 
                        ? 'bg-rose-50 text-rose-700 border border-rose-150 shadow-xs' 
                        : 'bg-amber-50 text-amber-700 border border-amber-150 shadow-xs'
                    }`}>
                      {item.qtyAvailable === 0 ? 'Out of Stock' : `Low Stock (Min: ${item.minimumStock})`}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
