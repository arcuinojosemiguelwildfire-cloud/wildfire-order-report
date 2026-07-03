import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, formatDate, dateToInputString } from '../utils/api.ts';
import { User } from '../types.ts';
import { Search, Plus, Edit, X, Layers } from 'lucide-react';

interface OrdersViewProps {
  currentUser: User;
  onSelectOrder: (orderId: string) => void;
}

export default function OrdersView({ currentUser, onSelectOrder }: OrdersViewProps) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'CREATE' | 'UPDATE'>('CREATE');
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  // Form Fields
  const [orderNumber, setOrderNumber] = useState<number | string>('');
  const [orderTitle, setOrderTitle] = useState('');
  const [dateReceived, setDateReceived] = useState('');
  const [overallCondition, setOverallCondition] = useState('New');
  const [status, setStatus] = useState<'In Stock' | 'Partially Deployed' | 'Fully Deployed' | 'Pending Return' | 'Closed'>('In Stock');
  const [notes, setNotes] = useState('');
  const [encodedBy, setEncodedBy] = useState('');

  // Item Lines inside Order
  const [itemLines, setItemLines] = useState<any[]>([
    {
      id: null,
      itemName: '',
      category: 'Event Materials',
      unit: 'Piece',
      itemType: 'CONSUMABLE',
      quantityReceived: 10,
      condition: 'New',
      storageLocation: 'Stock Room',
      unitCost: '',
      notes: ''
    }
  ]);

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      let queryParams = [];
      if (searchTerm) queryParams.push(`search=${encodeURIComponent(searchTerm)}`);
      if (selectedStatus) queryParams.push(`status=${encodeURIComponent(selectedStatus)}`);

      const queryStr = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
      const ordersData = await apiGet(`/orders${queryStr}`);
      setOrders(ordersData);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch orders ledger.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [searchTerm, selectedStatus]);

  const handleOpenCreateModal = () => {
    setOrderNumber('');
    setOrderTitle('');
    setDateReceived(dateToInputString(new Date()));
    setOverallCondition('New');
    setStatus('In Stock');
    setNotes('');
    setEncodedBy(currentUser.fullName || '');
    setItemLines([
      {
        id: null,
        itemName: '',
        category: 'Event Materials',
        itemType: 'CONSUMABLE',
        quantityReceived: 10,
        notes: ''
      }
    ]);
    setModalMode('CREATE');
    setEditingOrderId(null);
    setIsModalOpen(true);
  };

  const handleOpenUpdateModal = async (e: React.MouseEvent, order: any) => {
    e.stopPropagation();
    setLoading(true);
    setError(null);
    try {
      const fullOrder = await apiGet(`/orders/${order.id}`);
      setOrderNumber(fullOrder.orderNumber);
      setOrderTitle(fullOrder.orderTitle);
      setDateReceived(dateToInputString(fullOrder.dateReceived));
      setOverallCondition(fullOrder.overallCondition);
      setStatus(fullOrder.status);
      setNotes(fullOrder.notes || '');
      setEncodedBy(fullOrder.encodedBy || '');
      setItemLines(fullOrder.items.map((i: any) => ({
        id: i.id,
        itemName: i.itemName,
        category: i.category,
        itemType: i.itemType,
        quantityReceived: i.quantityReceived,
        notes: i.notes || ''
      })));
      setModalMode('UPDATE');
      setEditingOrderId(order.id);
      setIsModalOpen(true);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve order details for updating.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddLine = () => {
    setItemLines([...itemLines, {
      id: null,
      itemName: '',
      category: 'Event Materials',
      itemType: 'CONSUMABLE',
      quantityReceived: 10,
      notes: ''
    }]);
  };

  const handleRemoveLine = (idx: number) => {
    if (itemLines.length === 1) return;
    setItemLines(itemLines.filter((_, i) => i !== idx));
  };

  const handleLineChange = (idx: number, field: string, value: any) => {
    const updated = [...itemLines];
    updated[idx] = { ...updated[idx], [field]: value };
    setItemLines(updated);
  };

  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderTitle) {
      alert('Please fill in all general order properties.');
      return;
    }

    if (itemLines.length === 0) {
      alert('At least one item is required before saving.');
      return;
    }

    const invalidLine = itemLines.some(line => !line.itemName || isNaN(Number(line.quantityReceived)) || Number(line.quantityReceived) <= 0);
    if (invalidLine) {
      alert('All items must have a name and positive quantity received.');
      return;
    }

    try {
      const payload = {
        orderTitle,
        dateReceived: new Date(dateReceived).toISOString(),
        overallCondition,
        status,
        notes,
        encodedBy,
        items: itemLines
      };

      let savedOrder;
      if (modalMode === 'CREATE') {
        savedOrder = await apiPost('/orders', payload);
      } else {
        savedOrder = await apiPut(`/orders/${editingOrderId}`, payload);
      }

      setIsModalOpen(false);
      fetchOrders();

      if (modalMode === 'CREATE' && savedOrder?.id) {
        onSelectOrder(savedOrder.id);
      }
    } catch (err: any) {
      alert(err.message || 'Error saving order.');
    }
  };

  // Dynamically obtain list of unique supplier names for filtering from orders state
  const uniqueSuppliers = Array.from(new Set(orders.map(o => o.supplierName).filter(Boolean))) as string[];

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 border border-slate-200 rounded-xl shadow-xs">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">Orders</h1>
          <p className="text-xs text-slate-500 mt-0.5">Manage stock receipt batches and procurement shipments</p>
        </div>

        <button
          id="create_order_btn"
          onClick={handleOpenCreateModal}
          className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-3.5 rounded-xl transition-all duration-150 flex items-center gap-1.5 self-start shadow-xs cursor-pointer"
        >
          <Plus size={14} />
          <span>New Order</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col lg:flex-row gap-4 bg-white p-4 border border-slate-200 rounded-xl shadow-xs">
        <div className="flex-1 relative">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
            <Search size={16} />
          </span>
          <input
            id="order_search_input"
            type="text"
            placeholder="Search by Order No or supply batch name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 bg-slate-50/50 focus:bg-white transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</span>
            <select
              id="order_status_filter"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="text-xs border border-slate-200 bg-slate-50 rounded-xl p-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="In Stock">In Stock</option>
              <option value="Partially Deployed">Partially Deployed</option>
              <option value="Fully Deployed">Fully Deployed</option>
              <option value="Pending Return">Pending Return</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Orders Ledger Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-500">
            <thead className="bg-slate-50 text-slate-400 uppercase text-[9px] tracking-wider border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">Order No.</th>
                <th className="py-3 px-4">Order / Supply Batch Name</th>
                <th className="py-3 px-4">Date Received</th>
                <th className="py-3 px-4 text-center">Qty Received</th>
                <th className="py-3 px-4 text-center">Qty Available</th>
                <th className="py-3 px-4">Condition</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">Loading order receipts...</td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">No matching order batches found.</td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => onSelectOrder(order.id)}
                    className="hover:bg-slate-50/50 cursor-pointer transition"
                  >
                    <td className="py-3 px-4 font-bold text-indigo-600 hover:underline">Order #{order.orderNumber}</td>
                    <td className="py-3 px-4 font-medium text-slate-800">{order.orderTitle}</td>
                    <td className="py-3 px-4 text-slate-500">{formatDate(order.dateReceived)}</td>
                    <td className="py-3 px-4 text-center font-semibold text-slate-700">{order.qtyReceived}</td>
                    <td className="py-3 px-4 text-center font-semibold text-emerald-600">{order.qtyAvailable}</td>
                    <td className="py-3 px-4">
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[9px] border border-slate-200">
                        {order.overallCondition}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border ${
                        order.status === 'In Stock' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                        order.status === 'Partially Deployed' ? 'bg-amber-50 border-amber-100 text-amber-700' :
                        order.status === 'Fully Deployed' ? 'bg-blue-50 border-blue-100 text-blue-700' :
                        order.status === 'Pending Return' ? 'bg-purple-50 border-purple-100 text-purple-700' :
                        'bg-red-50 border-red-150 text-red-700'
                      }`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={(e) => handleOpenUpdateModal(e, order)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 py-1 px-2.5 rounded font-medium inline-flex items-center gap-1 border border-indigo-100 transition"
                      >
                        <Edit size={12} />
                        <span>Update</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New/Update Order Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white border border-slate-100 rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800">
                {modalMode === 'CREATE' ? 'New Order' : 'Update Order'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveOrder} className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Order Number</label>
                  <input
                    type="text"
                    value={modalMode === 'CREATE' ? 'Auto-generated (Sequential)' : `Order #${orderNumber}`}
                    disabled
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-slate-100 text-slate-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Order / Supply Batch Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Del Monte Convention Supplies"
                    value={orderTitle}
                    onChange={(e) => setOrderTitle(e.target.value)}
                    required
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Date Received *</label>
                  <input
                    type="date"
                    value={dateReceived}
                    onChange={(e) => setDateReceived(e.target.value)}
                    required
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Condition *</label>
                  <select
                    value={overallCondition}
                    onChange={(e) => setOverallCondition(e.target.value)}
                    required
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="New">New</option>
                    <option value="Good">Good</option>
                    <option value="Damaged">Damaged</option>
                    <option value="Mixed">Mixed</option>
                  </select>
                </div>

                {modalMode === 'UPDATE' && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Status</label>
                    <select
                      value={status}
                      onChange={(e: any) => setStatus(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="In Stock">In Stock</option>
                      <option value="Partially Deployed">Partially Deployed</option>
                      <option value="Fully Deployed">Fully Deployed</option>
                      <option value="Pending Return">Pending Return</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>
                )}

                <div className="md:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">General Notes / Remarks</label>
                  <textarea
                    placeholder="Add extra batch specifications..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 mb-4"
                  ></textarea>
                </div>

                <div className="md:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Encoded By / Person Responsible</label>
                  <input
                    type="text"
                    placeholder="e.g. Juan dela Cruz (Supply Lead)"
                    value={encodedBy}
                    onChange={(e) => setEncodedBy(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Items Section */}
              <div className="border-t border-slate-100 pt-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <Layers size={14} className="text-slate-400" />
                    <span>Batch Item Details</span>
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1 rounded-md border border-slate-200 transition"
                  >
                    + Add Item
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-500 min-w-[700px]">
                    <thead className="bg-slate-50 text-slate-400 uppercase text-[9px] tracking-wider border-b border-slate-100">
                      <tr>
                        <th className="py-2 px-3 w-1/3">Item Name *</th>
                        <th className="py-2 px-3">Category *</th>
                        <th className="py-2 px-3">Type *</th>
                        <th className="py-2 px-3 w-28">Qty Received *</th>
                        <th className="py-2 px-3">Notes</th>
                        <th className="py-2 px-3 text-center w-16">Delete</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {itemLines.map((line, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/20">
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              placeholder="e.g. Extension Cord"
                              value={line.itemName}
                              onChange={(e) => handleLineChange(idx, 'itemName', e.target.value)}
                              required
                              className="w-full text-[11px] p-1.5 border border-slate-200 rounded"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <select
                              value={line.category}
                              onChange={(e) => handleLineChange(idx, 'category', e.target.value)}
                              className="w-full text-[10px] p-1.5 border border-slate-200 rounded bg-white"
                            >
                              <option value="Event Materials">Event Materials</option>
                              <option value="Office Supplies">Office Supplies</option>
                              <option value="Equipment">Equipment</option>
                              <option value="Replacement">Replacement</option>
                              <option value="Other">Other</option>
                            </select>
                          </td>
                          <td className="py-2 px-1 font-medium">
                            <select
                              value={line.itemType}
                              onChange={(e) => handleLineChange(idx, 'itemType', e.target.value)}
                              className="w-full text-[10px] p-1.5 border border-slate-200 rounded bg-white"
                            >
                              <option value="CONSUMABLE">Consumable</option>
                              <option value="REUSABLE">Reusable</option>
                            </select>
                          </td>
                          <td className="py-2 px-1">
                            <input
                              type="number"
                              min="1"
                              value={isNaN(Number(line.quantityReceived)) || line.quantityReceived === '' ? '' : line.quantityReceived}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                handleLineChange(idx, 'quantityReceived', isNaN(val) ? '' : val);
                              }}
                              required
                              className="w-full text-[11px] p-1.5 border border-slate-200 rounded text-center"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              placeholder="Optional item notes"
                              value={line.notes || ''}
                              onChange={(e) => handleLineChange(idx, 'notes', e.target.value)}
                              className="w-full text-[11px] p-1.5 border border-slate-200 rounded"
                            />
                          </td>
                          <td className="py-2 px-1 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(idx)}
                              disabled={itemLines.length === 1}
                              className="text-red-500 hover:text-red-700 disabled:opacity-30 transition"
                            >
                              <X size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </form>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-100 bg-slate-50">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-700 px-4 py-2 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveOrder}
                className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg font-semibold transition"
              >
                {modalMode === 'CREATE' ? 'Save Order' : 'Update Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
