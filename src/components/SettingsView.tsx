import React, { useState, useEffect } from 'react';
import { apiGet, formatDate } from '../utils/api.ts';
import { AuditLog, User } from '../types.ts';
import { History, Shield, Clock, HelpCircle, Eye, X, BookOpen } from 'lucide-react';

interface SettingsViewProps {
  currentUser: User;
}

export default function SettingsView({ currentUser }: SettingsViewProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected Log detail modal
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const fetchLogs = async () => {
    if (currentUser.role !== 'ADMIN') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet('/audit-logs');
      setLogs(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch security audit logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [currentUser]);

  const handleOpenDetail = (log: AuditLog) => {
    setSelectedLog(log);
    setIsOpen(true);
  };

  const tryParseJSON = (jsonString: string) => {
    if (!jsonString) return {};
    try {
      return JSON.parse(jsonString);
    } catch (err) {
      return { raw: jsonString };
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-xs">
        <h1 className="text-lg font-bold text-slate-900 tracking-tight">System Information & Security</h1>
        <p className="text-xs text-slate-500 mt-0.5">Understand system rules, configurations, and user operations history</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: System documentation cards */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Clock size={14} className="text-slate-400" />
              <span>Timezone Policy</span>
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-4 border border-slate-200 rounded-xl">
              The order usage tracker is hardcoded to use the <strong>Asia/Manila (PST)</strong> timezone for all operations, received date inputs, and exported spreadsheets.
            </p>
          </div>

          <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <BookOpen size={14} className="text-slate-400" />
              <span>Inventory Calculations</span>
            </h3>
            <div className="text-xs text-slate-600 space-y-3">
              <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100">
                <strong className="text-indigo-900 block font-bold mb-1">Consumables:</strong>
                <span className="leading-relaxed">Available = Received - Used - Replacements - Damaged/Lost. Consumable items are once-off use.</span>
              </div>
              <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
                <strong className="text-emerald-900 block font-bold mb-1">Reusables:</strong>
                <span className="leading-relaxed">Available = Received - Deployed - Consumed/Lost.<br/>Deployed = Deployed - Returned. Reusable items are checked-out and returned.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Security Audit Logs (Admin only) */}
        <div className="lg:col-span-2 bg-white p-5 border border-slate-200 rounded-xl shadow-xs flex flex-col min-h-[400px]">
          <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-200">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <History size={14} className="text-slate-400" />
              <span>System Audit History</span>
            </h3>
            <span className="text-[10px] font-bold text-slate-400">Restricted to Admin Users</span>
          </div>

          {currentUser.role !== 'ADMIN' ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-slate-50 rounded-xl border border-slate-200">
              <Shield size={36} className="text-slate-300 mb-2" />
              <h4 className="text-xs font-bold text-slate-700">Access Denied</h4>
              <p className="text-[11px] text-slate-400 mt-1 max-w-sm leading-relaxed">Only administrators are authorized to inspect the system transaction history and database modifications ledger.</p>
            </div>
          ) : loading ? (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-400">Loading system audits...</div>
          ) : logs.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-400">No audits registered yet.</div>
          ) : (
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-xs text-slate-500">
                <thead className="bg-slate-50 text-slate-400 uppercase text-[9px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">Timestamp</th>
                    <th className="py-2 px-3">Operator</th>
                    <th className="py-2 px-3">Action</th>
                    <th className="py-2 px-3">Target</th>
                    <th className="py-2 px-3">Remarks</th>
                    <th className="py-2 px-3 text-center">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/30 transition text-[11px]">
                      <td className="py-2.5 px-3 whitespace-nowrap">{formatDate(log.createdAt, true)}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-700">{log.user?.fullName}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          log.actionType === 'CREATE' ? 'bg-green-50 text-green-700 border border-green-100' :
                          log.actionType === 'UPDATE' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                          'bg-amber-50 text-amber-700 border border-amber-100'
                        }`}>
                          {log.actionType}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{log.entityType}</td>
                      <td className="py-2.5 px-3 text-slate-400 truncate max-w-[150px]">{log.remarks || '-'}</td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => handleOpenDetail(log)}
                          className="p-1 text-indigo-600 hover:bg-indigo-50 rounded"
                        >
                          <Eye size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* JSON Audit Inspector Modal */}
      {isOpen && selectedLog && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-100 rounded-lg shadow-xl w-full max-w-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Inspect Operations State</span>
                <h3 className="text-xs font-bold text-slate-700 mt-0.5">{selectedLog.entityType} ({selectedLog.actionType})</h3>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-50">
                <X size={16} />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-3">
              <div>
                <strong>Operator:</strong> {selectedLog.user?.fullName} ({selectedLog.user?.role})
              </div>
              <div>
                <strong>Timestamp:</strong> {formatDate(selectedLog.createdAt, true)}
              </div>
              {selectedLog.remarks && (
                <div>
                  <strong>Remarks:</strong> {selectedLog.remarks}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-3">
                <div>
                  <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1">Old State (Previous Values)</span>
                  <pre className="bg-slate-50 p-2 border border-slate-100 rounded text-[10px] text-slate-700 max-h-56 overflow-y-auto">
                    {JSON.stringify(tryParseJSON(selectedLog.oldValues), null, 2)}
                  </pre>
                </div>
                <div>
                  <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1">New State (Applied Values)</span>
                  <pre className="bg-slate-50 p-2 border border-slate-100 rounded text-[10px] text-slate-700 max-h-56 overflow-y-auto">
                    {JSON.stringify(tryParseJSON(selectedLog.newValues), null, 2)}
                  </pre>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-xs bg-indigo-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
