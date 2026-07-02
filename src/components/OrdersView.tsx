import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, formatDate, dateToInputString } from '../utils/api.ts';
import { Order, Supplier, User } from '../types.ts';
import { Search, Filter, Plus, Edit, X, RefreshCw, Layers } from 'lucide-react';

interface OrdersViewProps {
  currentUser: User;
  onSelectOrder: (orderId: string) => void;
}

export default function OrdersView({ currentUser, onSelectOrder }: OrdersViewProps) {
  const [orders, setOrders] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'CREATE' | 'UPDATE'>('CREATE');
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  // Form Fields
  const [orderNumber, setOrderNumber] = useState('');
  const [orderTitle, setOrderTitle] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [poOrInvoiceNumber, setPoOrInvoiceNumber] = useState('');
  const [dateOrdered, setDateOrdered] = useState('');
  const [dateReceived, setDateReceived] = useState('');
  const [overallCondition, setOverallCondition] = useState('New');
  const [status, setStatus] = useState<'Available' | 'Partially Used' | 'Fully Used' | 'Closed'>('Available');
  const [notes, setNotes] = useState('');

  // Item Lines inside Order
  const [itemLines, setItemLines] = useState<any[]>([
    {
      id: null,
      itemName: '',
      category: 'Event Materials',
      unit: 'Piece',
      itemType: 'CONSUMABLE',
      quantityReceived: 10,
      minimumStock: 2,
      condition: 'New',
      storageLocation: 'Stock Room',
      unitCost: '',
      notes: ''
    }
  ]);

  // Quick Supplier Creator state
  const [showQuickSupplier, setShowQuickSupplier] = useState(false);
  const [quickSupplierName, setQuickSupplierName] = useState('');
  const [quickContactPerson, setQuickContactPerson] = useState('');
  const [quickContactNumber, setQuickContactNumber] = useState('');

  const fetchOrdersAndSuppliers = async () => {
    setLoading(true);
    setError(null);
    try {
      const suppliersData = await apiGet('/suppliers');
      setSuppliers(suppliersData);

      let queryParams = [];
      if (searchTerm) queryParams.push(`search=${encodeURIComponent(searchTerm)}`);
      if (selectedSupplier) queryParams.push(`supplierId=${encodeURIComponent(selectedSupplier)}`);
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
    fetchOrdersAndSuppliers();
  }, [searchTerm, selectedSupplier, selectedStatus]);

  const handleOpenCreateModal = () => {
    // Generate unique code prefix ORD-YYYYMMDD-XXXX
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    setOrderNumber(`ORD-${dateStr}-${rand}`);
    
    setOrderTitle('');
    setSupplierId('');
    setPoOrInvoiceNumber('');
    setDateOrdered(dateToInputString(new Date()));
    setDateReceived(dateToInputString(new Date()));
    setOverallCondition('New');
    setStatus('Available');
    setNotes('');
    setItemLines([
      {
        id: null,
        itemName: '',
        category: 'Event Materials',
        unit: 'Piece',
        itemType: 'CONSUMABLE',
        quantityReceived: 10,
        minimumStock: 2,
        condition: 'New',
        storageLocation: 'Stock Room',
        unitCost: '',
        notes: ''
      }
    ]);
    setModalMode('CREATE');
    setEditingOrderId(null);
    setIsModalOpen(true);
  };

  const handleOpenUpdateModal = async (e: React.MouseEvent, order: any) => {
    e.stopPropagation(); // Prevent redirecting to order details!
    setLoading(true);
    setError(null);
    try {
      const fullOrder = await apiGet(`/orders/${order.id}`);
      setOrderNumber(fullOrder.orderNumber);
      setOrderTitle(fullOrder.orderTitle);
      setSupplierId(fullOrder.supplierId);
      setPoOrInvoiceNumber(fullOrder.poOrInvoiceNumber);
      setDateOrdered(dateToInputString(fullOrder.dateOrdered));
      setDateReceived(dateToInputString(fullOrder.dateReceived));
      setOverallCondition(fullOrder.overallCondition);
      setStatus(fullOrder.status);
      setNotes(fullOrder.notes || '');
      setItemLines(fullOrder.items.map((i: any) => ({
        id: i.id,
        itemName: i.itemName,
        category: i.category,
        unit: i.unit,
        itemType: i.itemType,
        quantityReceived: i.quantityReceived,
        minimumStock: i.minimumStock,
        condition: i.condition,
        storageLocation: i.storageLocation,
        unitCost: i.unitCost || '',
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
      unit: 'Piece',
      itemType: 'CONSUMABLE',
      quantityReceived: 10,
      minimumStock: 2,
      condition: 'New',
      storageLocation: 'Stock Room',
      unitCost: '',
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

  const handleQuickSupplierCreate = async () => {
    if (!quickSupplierName) return;
    try {
      const sup = await apiPost('/suppliers', {
        supplierName: quickSupplierName,
        contactPerson: quickContactPerson,
        contactNumber: quickContactNumber,
      });
      setSuppliers([...suppliers, sup]);
      setSupplierId(sup.id);
      setShowQuickSupplier(false);
      setQuickSupplierName('');
      setQuickContactPerson('');
      setQuickContactNumber('');
    } catch (err: any) {
      alert(err.message || 'Failed to create supplier quick entry.');
    }
  };

  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber || !orderTitle || !supplierId || !poOrInvoiceNumber) {
      alert('Please fill in all general order properties.');
      return;
    }

    // Validate item lines
    const invalidLine = itemLines.some(line => !line.itemName || line.quantityReceived <= 0 || !line.storageLocation);
    if (invalidLine) {
      alert('All items must have a name, storage location, and positive quantity received.');
      return;
    }

    try {
      const payload = {
        orderNumber,
        orderTitle,
        supplierId,
        poOrInvoiceNumber,
        dateOrdered: new Date(dateOrdered).toISOString(),
        dateReceived: new Date(dateReceived).toISOString(),
        overallCondition,
        status,
        notes,
        items: itemLines
      };

      if (modalMode === 'CREATE') {
        await apiPost('/orders', payload);
      } else {
        await apiPut(`/orders/${editingOrderId}`, payload);
      }

      setIsModalOpen(false);
      fetchOrdersAndSuppliers();
    } catch (err: any) {
      alert(err.message || 'Error saving order.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 border border-slate-200 rounded-xl shadow-xs">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">Orders & Batches</h1>
          <p className="text-xs text-slate-500 mt-0.5">Manage stock receipt batches and procurement shipments</p>
        </div>

        {currentUser.role === 'ADMIN' && (
          <button
            id="create_order_btn"
            onClick={handleOpenCreateModal}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-3.5 rounded-xl transition-all duration-150 flex items-center gap-1.5 self-start shadow-xs cursor-pointer"
          >
            <Plus size={14} />
            <span>New Order Batch</span>
          </button>
        )}
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
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Supplier</span>
            <select
              id="order_supplier_filter"
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="text-xs border border-slate-200 bg-slate-50 rounded-xl p-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="">All Suppliers</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.supplierName}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</span>
            <select
              id="order_status_filter"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="text-xs border border-slate-200 bg-slate-50 rounded-xl p-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="Available">Available</option>
              <option value="Partially Used">Partially Used</option>
              <option value="Fully Used">Fully Used</option>
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
                <th className="py-3 px-4">Supplier</th>
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
                  <td colSpan={9} className="py-8 text-center text-slate-400">Loading order receipts...</td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">No matching order batches found.</td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => onSelectOrder(order.id)}
                    className="hover:bg-slate-50/50 cursor-pointer transition"
                  >
                    <td className="py-3 px-4 font-bold text-indigo-600 hover:underline">{order.orderNumber}</td>
                    <td className="py-3 px-4 font-medium text-slate-800">{order.orderTitle}</td>
                    <td className="py-3 px-4 text-slate-600">{order.supplierName}</td>
                    <td className="py-3 px-4 text-slate-500">{formatDate(order.dateReceived)}</td>
                    <td className="py-3 px-4 text-center font-semibold text-slate-700">{order.qtyReceived}</td>
                    <td className="py-3 px-4 text-center font-semibold text-emerald-600">{order.qtyAvailable}</td>
                    <td className="py-3 px-4">
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[9px] border border-slate-200">
                        {order.condition}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border ${
                        order.status === 'Available' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                        order.status === 'Partially Used' ? 'bg-amber-50 border-amber-100 text-amber-700' :
                        order.status === 'Fully Used' ? 'bg-slate-50 border-slate-200 text-slate-500' :
                        'bg-red-50 border-red-100 text-red-700'
                      }`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {currentUser.role === 'ADMIN' ? (
                        <button
                          onClick={(e) => handleOpenUpdateModal(e, order)}
                          className="text-xs text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 py-1 px-2.5 rounded font-medium inline-flex items-center gap-1 border border-indigo-100 transition"
                        >
                          <Edit size={12} />
                          <span>Update</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400">View Only</span>
                      )}
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
                {modalMode === 'CREATE' ? 'Add New Order Batch' : `Update Order: ${orderNumber}`}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveOrder} className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Order Number *</label>
                  <input
                    type="text"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    required
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Batch / Order Title *</label>
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
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">Supplier *</label>
                    <button
                      type="button"
                      onClick={() => setShowQuickSupplier(!showQuickSupplier)}
                      className="text-[9px] text-indigo-600 hover:underline font-bold"
                    >
                      + Add Supplier
                    </button>
                  </div>

                  {showQuickSupplier ? (
                    <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg space-y-2 mb-2">
                      <input
                        type="text"
                        placeholder="Supplier Name *"
                        value={quickSupplierName}
                        onChange={(e) => setQuickSupplierName(e.target.value)}
                        className="w-full text-[11px] p-1.5 border border-slate-200 bg-white rounded"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Contact Name"
                          value={quickContactPerson}
                          onChange={(e) => setQuickContactPerson(e.target.value)}
                          className="text-[10px] p-1.5 border border-slate-200 bg-white rounded"
                        />
                        <input
                          type="text"
                          placeholder="Contact Phone"
                          value={quickContactNumber}
                          onChange={(e) => setQuickContactNumber(e.target.value)}
                          className="text-[10px] p-1.5 border border-slate-200 bg-white rounded"
                        />
                      </div>
                      <div className="flex justify-end gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => setShowQuickSupplier(false)}
                          className="text-[9px] text-slate-500 px-2 py-1 rounded hover:bg-slate-100"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleQuickSupplierCreate}
                          disabled={!quickSupplierName}
                          className="text-[9px] bg-indigo-600 text-white px-2.5 py-1 rounded hover:bg-indigo-700 disabled:opacity-50"
                        >
                          Save Supplier
                        </button>
                      </div>
                    </div>
                  ) : (
                    <select
                      value={supplierId}
                      onChange={(e) => setSupplierId(e.target.value)}
                      required
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 bg-white"
                    >
                      <option value="">Select Supplier</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.supplierName}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Invoice / PO Number *</label>
                  <input
                    type="text"
                    placeholder="PO-991203"
                    value={poOrInvoiceNumber}
                    onChange={(e) => setPoOrInvoiceNumber(e.target.value)}
                    required
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Date Ordered *</label>
                  <input
                    type="date"
                    value={dateOrdered}
                    onChange={(e) => setDateOrdered(e.target.value)}
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
                      <option value="Available">Available</option>
                      <option value="Partially Used">Partially Used</option>
                      <option value="Fully Used">Fully Used</option>
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
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                  ></textarea>
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
                    + Add Item Line
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-500 min-w-[900px]">
                    <thead className="bg-slate-50 text-slate-400 uppercase text-[9px] tracking-wider border-b border-slate-100">
                      <tr>
                        <th className="py-2 px-3 w-1/4">Item Name *</th>
                        <th className="py-2 px-3">Category *</th>
                        <th className="py-2 px-3">Unit *</th>
                        <th className="py-2 px-3">Type *</th>
                        <th className="py-2 px-3 w-20">Qty Received *</th>
                        <th className="py-2 px-3 w-16">Min Stock</th>
                        <th className="py-2 px-3 w-28">Storage Location *</th>
                        <th className="py-2 px-3 w-16">Cost</th>
                        <th className="py-2 px-3">Condition</th>
                        <th className="py-2 px-3 text-center">Delete</th>
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
                          <td className="py-2 px-1">
                            <select
                              value={line.unit}
                              onChange={(e) => handleLineChange(idx, 'unit', e.target.value)}
                              className="w-full text-[10px] p-1.5 border border-slate-200 rounded bg-white"
                            >
                              <option value="Piece">Piece</option>
                              <option value="Box">Box</option>
                              <option value="Roll">Roll</option>
                              <option value="Set">Set</option>
                              <option value="Pack">Pack</option>
                              <option value="Bottle">Bottle</option>
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
                              value={line.quantityReceived}
                              onChange={(e) => handleLineChange(idx, 'quantityReceived', parseInt(e.target.value, 10))}
                              required
                              className="w-full text-[11px] p-1.5 border border-slate-200 rounded text-center"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <input
                              type="number"
                              min="0"
                              value={line.minimumStock}
                              onChange={(e) => handleLineChange(idx, 'minimumStock', parseInt(e.target.value, 10))}
                              className="w-full text-[11px] p-1.5 border border-slate-200 rounded text-center"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              placeholder="Storage Location"
                              value={line.storageLocation}
                              onChange={(e) => handleLineChange(idx, 'storageLocation', e.target.value)}
                              required
                              className="w-full text-[11px] p-1.5 border border-slate-200 rounded"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <input
                              type="number"
                              placeholder="₱"
                              value={line.unitCost}
                              onChange={(e) => handleLineChange(idx, 'unitCost', e.target.value)}
                              className="w-full text-[11px] p-1.5 border border-slate-200 rounded text-center"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <select
                              value={line.condition}
                              onChange={(e) => handleLineChange(idx, 'condition', e.target.value)}
                              className="w-full text-[10px] p-1.5 border border-slate-200 rounded bg-white"
                            >
                              <option value="New">New</option>
                              <option value="Good">Good</option>
                              <option value="Damaged">Damaged</option>
                            </select>
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
                Save Order Batch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
