import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, formatDate } from '../utils/api.ts';
import { UsageTransaction, User } from '../types.ts';
import { Search, Filter, Eye, Trash2, Edit, X, AlertTriangle, FileSpreadsheet, RefreshCw } from 'lucide-react';

interface UsageRecordsViewProps {
  currentUser: User;
}

export default function UsageRecordsView({ currentUser }: UsageRecordsViewProps) {
  const [usages, setUsages] = useState<UsageTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Selected details drawer
  const [selectedTx, setSelectedTx] = useState<UsageTransaction | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // Voiding dialogue state
  const [isVoidOpen, setIsVoidOpen] = useState(false);
  const [voidingTxId, setVoidingTxId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');

  // Edit notes state
  const [isEditNotesOpen, setIsEditNotesOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<UsageTransaction | null>(null);
  const [editedNotes, setEditedNotes] = useState('');

  const fetchUsages = async () => {
    setLoading(true);
    setError(null);
    try {
      let queryParams = [];
      if (searchTerm) queryParams.push(`search=${encodeURIComponent(searchTerm)}`);
      if (selectedType) queryParams.push(`type=${encodeURIComponent(selectedType)}`);
      if (startDate) queryParams.push(`startDate=${encodeURIComponent(new Date(startDate).toISOString())}`);
      if (endDate) queryParams.push(`endDate=${encodeURIComponent(new Date(endDate).toISOString())}`);

      const queryStr = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
      const data = await apiGet(`/usages${queryStr}`);
      setUsages(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch usage ledger.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsages();
  }, [searchTerm, selectedType, startDate, endDate]);

  const handleOpenDetails = async (txId: string) => {
    try {
      const fullTx = await apiGet(`/usages/${txId}`);
      setSelectedTx(fullTx);
      setIsDetailsOpen(true);
    } catch (err: any) {
      alert(err.message || 'Failed to load transaction details.');
    }
  };

  const handleOpenVoidModal = (e: React.MouseEvent, txId: string) => {
    e.stopPropagation();
    setVoidingTxId(txId);
    setVoidReason('');
    setIsVoidOpen(true);
  };

  const handleConfirmVoid = async () => {
    if (!voidReason) {
      alert('A voiding reason must be supplied for audit tracking.');
      return;
    }
    try {
      await apiPost(`/usages/${voidingTxId}/void`, { voidReason });
      setIsVoidOpen(false);
      fetchUsages();
      if (isDetailsOpen && selectedTx?.id === voidingTxId) {
        setIsDetailsOpen(false);
      }
    } catch (err: any) {
      alert(err.message || 'Error voiding usage transaction.');
    }
  };

  const handleOpenEditNotesModal = (e: React.MouseEvent, tx: UsageTransaction) => {
    e.stopPropagation();
    setEditingTx(tx);
    setEditedNotes(tx.notes || '');
    setIsEditNotesOpen(true);
  };

  const handleSaveNotes = async () => {
    if (!editingTx) return;
    try {
      await apiPut(`/usages/${editingTx.id}`, { notes: editedNotes });
      setIsEditNotesOpen(false);
      fetchUsages();
      if (isDetailsOpen && selectedTx?.id === editingTx.id) {
        setSelectedTx({ ...selectedTx, notes: editedNotes });
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update transaction notes.');
    }
  };

  // All guest operators have permission to edit usage notes
  const canUserEditNotes = (tx: UsageTransaction) => {
    return true;
  };

  return (
    <div className="space-y-6">
      {/* Header toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 border border-slate-200 rounded-xl shadow-xs">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">Usage Ledger</h1>
          <p className="text-xs text-slate-500 mt-0.5">Historical list of dispatches, employee claims, and stock reversals</p>
        </div>
        <button
          onClick={fetchUsages}
          className="text-xs text-slate-600 bg-slate-50 hover:bg-slate-100 py-2 px-3 border border-slate-200 rounded-xl flex items-center gap-1.5 font-medium transition-all self-start cursor-pointer"
        >
          <RefreshCw size={13} />
          <span>Sync Ledger</span>
        </button>
      </div>

      {/* Advanced Filter panel */}
      <div className="bg-white p-4 border border-slate-200 rounded-xl shadow-xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative md:col-span-2">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
              <Search size={15} />
            </span>
            <input
              id="usage_search_input"
              type="text"
              placeholder="Search by Reference No, event, employee or items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 bg-slate-50/50 focus:bg-white transition-all"
            />
          </div>

          <div>
            <select
              id="usage_type_filter"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full text-xs border border-slate-200 bg-slate-50 rounded-xl p-2 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="">All Movement Types</option>
              <option value="EVENT">Event Use</option>
              <option value="OFFICE">Office Use</option>
              <option value="EMPLOYEE_REPLACEMENT">Employee Replacement</option>
            </select>
          </div>

          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full text-xs p-1.5 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none"
            />
            <span className="text-[10px] text-slate-400 font-bold uppercase">To</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full text-xs p-1.5 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 text-xs rounded-xl border border-red-100">
          {error}
        </div>
      )}

      {/* Usage Logs Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-500">
            <thead className="bg-slate-50 text-slate-400 uppercase text-[9px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Event / Office / Employee</th>
                <th className="py-3 px-4">Items</th>
                <th className="py-3 px-4 text-center">Quantity</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4">Notes</th>
                <th className="py-3 px-4">Encoded By</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && usages.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">Loading ledger logs...</td>
                </tr>
              ) : usages.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">No matching usage logs discovered.</td>
                </tr>
              ) : (
                usages.map((tx) => {
                  const isVoided = tx.status === 'VOIDED';
                  const itemSummary = tx.items?.map(i => `${i.orderItem?.itemName}`).join(', ') || '-';
                  const totalQuantity = tx.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
                  
                  return (
                    <tr
                      key={tx.id}
                      onClick={() => handleOpenDetails(tx.id)}
                      className={`hover:bg-slate-50/50 cursor-pointer transition ${isVoided ? 'line-through text-slate-400 opacity-60' : ''}`}
                    >
                      <td className="py-3 px-4">{formatDate(tx.usageDate)}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border ${
                          tx.usageType === 'EVENT' ? 'bg-indigo-50 border-indigo-100 text-indigo-700' :
                          tx.usageType === 'OFFICE' ? 'bg-blue-50 border-blue-100 text-blue-700' :
                          tx.usageType === 'EMPLOYEE_REPLACEMENT' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                          tx.usageType === 'RETURN' ? 'bg-teal-50 border-teal-100 text-teal-700' :
                          'bg-red-50 border-red-100 text-red-700'
                        }`}>
                          {tx.usageType.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-700 truncate max-w-[200px]" title={tx.reason || ''}>
                        {tx.reason || '-'}
                      </td>
                      <td className="py-3 px-4 truncate max-w-[250px]" title={itemSummary}>{itemSummary}</td>
                      <td className="py-3 px-4 text-center font-bold text-slate-700">{totalQuantity}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[8px] font-bold ${
                          isVoided ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-green-100 text-green-700 border border-green-200'
                        }`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 truncate max-w-[150px] text-slate-400 italic" title={tx.notes || ''}>
                        {tx.notes || '-'}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-600">{tx.encodedBy || 'Guest Operator'}</td>
                      <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center items-center gap-2">
                          <button
                            onClick={() => handleOpenDetails(tx.id)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-600 transition"
                            title="Inspect Record"
                          >
                            <Eye size={14} />
                          </button>

                          {canUserEditNotes(tx) && (
                            <button
                              onClick={(e) => handleOpenEditNotesModal(e, tx)}
                              className="p-1 hover:bg-slate-100 rounded text-indigo-600 transition"
                              title="Update Notes"
                              disabled={isVoided}
                            >
                              <Edit size={14} />
                            </button>
                          )}

                          {!isVoided && (
                            <button
                              onClick={(e) => handleOpenVoidModal(e, tx.id)}
                              className="p-1 hover:bg-red-50 rounded text-red-500 hover:text-red-700 transition"
                              title="Void Transaction"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Inspect Drawer */}
      {isDetailsOpen && selectedTx && (
        <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl border-l border-slate-100 flex flex-col z-50 animate-slide-in">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Usage Details</span>
              <h2 className="text-sm font-bold text-indigo-600 mt-0.5">TX-{selectedTx.id.substring(0, 8).toUpperCase()}</h2>
            </div>
            <button onClick={() => setIsDetailsOpen(false)} className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded">
              <X size={16} />
            </button>
          </div>

          {/* Details Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-600">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">Movement Date</span>
                <span className="font-semibold text-slate-800 mt-1 block">{formatDate(selectedTx.usageDate)}</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">Transaction Status</span>
                <span className={`inline-block px-2 py-0.5 rounded text-[8px] font-bold mt-1 ${
                  selectedTx.status === 'VOIDED' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                }`}>
                  {selectedTx.status}
                </span>
              </div>

              {selectedTx.usageType === 'EVENT' && (
                <>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">Event Name</span>
                    <span className="font-semibold text-slate-800 mt-1 block">{selectedTx.eventName || '-'}</span>
                  </div>
                  {selectedTx.venue && (
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">Venue / Location</span>
                      <span className="font-semibold text-slate-800 mt-1 block">{selectedTx.venue}</span>
                    </div>
                  )}
                </>
              )}

              {selectedTx.usageType === 'EMPLOYEE_REPLACEMENT' && (
                <>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">Employee Name</span>
                    <span className="font-semibold text-slate-800 mt-1 block">{selectedTx.employeeName || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">Employee Department</span>
                    <span className="font-semibold text-slate-800 mt-1 block">{selectedTx.employeeDepartment || '-'}</span>
                  </div>
                </>
              )}

              <div className="col-span-2">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">Recipient Destination / Reason</span>
                <span className="font-semibold text-slate-800 mt-1 block bg-slate-50 p-2 border border-slate-100 rounded">{selectedTx.reason || '-'}</span>
              </div>
            </div>

            {selectedTx.status === 'VOIDED' && (
              <div className="p-3 bg-red-50 border border-red-100 text-red-800 rounded-lg">
                <span className="font-bold">Cancellation Details (Void Audit):</span>
                <p className="mt-1">{selectedTx.notes || 'Transaction marked as VOIDED.'}</p>
              </div>
            )}

            {/* Line Items Grid */}
            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Transacted Items</h3>
              <div className="space-y-2.5">
                {selectedTx.items?.map((item) => (
                  <div key={item.id} className="p-3 bg-slate-50 border border-slate-100 rounded-lg flex justify-between items-center">
                    <div>
                      <h4 className="font-bold text-slate-800">{item.orderItem?.itemName}</h4>
                      <span className="text-[9px] text-slate-400 block mt-0.5">Category: {item.orderItem?.category || 'General'}</span>
                      {item.itemNotes && <p className="text-[10px] italic text-slate-500 mt-1">Item note: {item.itemNotes}</p>}
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-900 block">{item.quantity} pcs</span>
                      <span className="text-[8px] bg-indigo-50 border border-indigo-100 text-indigo-700 px-1 py-0.5 rounded font-semibold inline-block mt-1">
                        {selectedTx.usageType === 'EVENT' ? 'DEPLOYED' : 'CONSUMED'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* General Remarks */}
            <div className="border-t border-slate-100 pt-4">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">General Transaction Remarks</span>
              <p className="mt-1 text-slate-700 italic bg-indigo-50/20 p-2.5 border border-indigo-50 rounded-lg">
                {selectedTx.notes || 'No extra remarks written.'}
              </p>
            </div>

            {/* Internal metadata */}
            <div className="border-t border-slate-100 pt-4 text-[9px] text-slate-400 space-y-1">
              <div>Record Registered: {formatDate(selectedTx.createdAt, true)}</div>
              <div>Authorized Encoded By: {selectedTx.encodedBy || 'Guest Operator'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Void Dialog Box */}
      {isVoidOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-100 rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex gap-3 text-red-600">
              <AlertTriangle size={24} className="flex-shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">Void Usage Transaction</h3>
                <p className="text-xs text-slate-500 mt-1">This operation is a soft-void reversal. It restores all item stock balances instantly but keeps the ledger record for auditing. This cannot be undone.</p>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">Reason for Voiding *</label>
              <textarea
                placeholder="Specify audit reason (e.g., Typo in encoding, returned event items, order adjustment)..."
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={3}
                required
                className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
              ></textarea>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsVoidOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-700 px-4 py-2 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmVoid}
                disabled={!voidReason}
                className="text-xs bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-semibold transition disabled:opacity-50"
              >
                Confirm Void
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Notes Dialogue */}
      {isEditNotesOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-100 rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Update Transaction Notes</h3>
            
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">Remarks / Notes</label>
              <textarea
                value={editedNotes}
                onChange={(e) => setEditedNotes(e.target.value)}
                rows={3}
                className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
              ></textarea>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsEditNotesOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-700 px-4 py-2 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveNotes}
                className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-semibold transition"
              >
                Save Remarks
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
