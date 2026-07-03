import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, formatDate, dateToInputString } from '../utils/api.ts';
import { Order, OrderItem, User } from '../types.ts';
import { ArrowLeft, Plus, Check, AlertTriangle, X, ClipboardList, Info, Edit, Layers } from 'lucide-react';

interface OrderDetailsViewProps {
  currentUser: User;
  orderId: string;
  onBack: () => void;
}

export default function OrderDetailsView({ currentUser, orderId, onBack }: OrderDetailsViewProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active usage transactions list to choose from for event references
  const [activeUsages, setActiveUsages] = useState<any[]>([]);

  // Usage History List for this specific batch
  const [orderUsages, setOrderUsages] = useState<any[]>([]);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Usage Modal Wizard
  const [isUsageOpen, setIsUsageOpen] = useState(false);
  const [usageDate, setUsageDate] = useState(dateToInputString(new Date()));
  const [usageType, setUsageType] = useState<'EVENT' | 'OFFICE' | 'EMPLOYEE_REPLACEMENT'>('EVENT');
  const [notes, setNotes] = useState('');
  const [encodedBy, setEncodedBy] = useState('');

  // Direct Text Input Fields instead of master IDs
  const [eventName, setEventName] = useState('');
  const [venue, setVenue] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [employeeDepartment, setEmployeeDepartment] = useState('');
  const [reason, setReason] = useState(''); // Also serves as Office Use Details and Reason for Replacement

  // Items added to the usage record
  const [usageLines, setUsageLines] = useState<any[]>([
    {
      orderItemId: '',
      quantity: 1,
      movementType: 'CONSUMED',
      itemCondition: 'Good',
      notes: '',
      availableLimit: 0,
    }
  ]);

  // Edit Order Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDateReceived, setEditDateReceived] = useState('');
  const [editOverallCondition, setEditOverallCondition] = useState('New');
  const [editStatus, setEditStatus] = useState<string>('In Stock');
  const [editNotes, setEditNotes] = useState('');
  const [editEncodedBy, setEditEncodedBy] = useState('');
  const [editItemLines, setEditItemLines] = useState<any[]>([]);

  const fetchOrderDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet(`/orders/${orderId}`);
      setOrder(data);
      const mappedItems = (data.items || []).map((item: any) => ({
        ...item,
        qtyAvailable: item.availableQuantity ?? 0,
        qtyUsed: item.quantityUsed ?? 0,
        qtyDeployed: item.quantityDeployed ?? 0,
        liveStatus: item.currentStatus ?? 'IN_STOCK',
      }));
      setItems(mappedItems);

      // Get usages to extract active references for returning items
      const usagesData = await apiGet('/usages');
      const usagesList = Array.isArray(usagesData) ? usagesData : (usagesData?.usageRecords || []);
      const activeList = usagesList.filter(
        (u: any) => u.status === 'ACTIVE'
      );
      setActiveUsages(activeList);

      // Fetch usage history specific to this order
      const orderUsagesData = await apiGet(`/usages?orderId=${orderId}`);
      const orderUsagesList = Array.isArray(orderUsagesData) ? orderUsagesData : (orderUsagesData?.usageRecords || []);
      setOrderUsages(orderUsagesList);

    } catch (err: any) {
      setError(err.message || 'Error loading order details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderDetails();
  }, [orderId]);

  // Handle toast notifications autodispose
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Handle stock-updated external event
  useEffect(() => {
    const handleStockUpdate = () => {
      fetchOrderDetails();
    };
    window.addEventListener('stock-updated', handleStockUpdate);
    return () => window.removeEventListener('stock-updated', handleStockUpdate);
  }, [orderId]);

  const handleOpenUsageWizard = () => {
    setUsageDate(dateToInputString(new Date()));
    setUsageType('EVENT');
    setNotes('');
    setEncodedBy(currentUser.fullName || '');

    setEventName('');
    setVenue('');
    setEmployeeName('');
    setEmployeeDepartment('');
    setReason('');
    setValidationErrors({});
    setIsSaving(false);

    if (items.length > 0) {
      setUsageLines([
        {
          orderItemId: items[0].id,
          quantity: 1,
          movementType: items[0].itemType === 'REUSABLE' ? 'TEMPORARY_ISSUE' : 'CONSUMED',
          itemCondition: 'Good',
          notes: '',
          availableLimit: items[0].qtyAvailable || 0,
        }
      ]);
    } else {
      setUsageLines([]);
    }
    
    setIsUsageOpen(true);
  };

  const handleUsageTypeChange = (type: 'EVENT' | 'OFFICE' | 'EMPLOYEE_REPLACEMENT') => {
    setUsageType(type);
    
    // Automatically pre-fill default movement type for items
    const updated = usageLines.map((line) => {
      const item = items.find(i => i.id === line.orderItemId);
      let mv = 'CONSUMED';
      if (type === 'EVENT' || type === 'OFFICE') {
        mv = item?.itemType === 'REUSABLE' ? 'TEMPORARY_ISSUE' : 'CONSUMED';
      } else if (type === 'EMPLOYEE_REPLACEMENT') {
        mv = 'REPLACED';
      }
      return { ...line, movementType: mv };
    });
    setUsageLines(updated);
  };

  const handleAddUsageLine = () => {
    if (items.length === 0) return;
    const defaultItem = items[0];
    
    let mv = 'CONSUMED';
    if (usageType === 'EVENT' || usageType === 'OFFICE') {
      mv = defaultItem.itemType === 'REUSABLE' ? 'TEMPORARY_ISSUE' : 'CONSUMED';
    } else if (usageType === 'EMPLOYEE_REPLACEMENT') {
      mv = 'REPLACED';
    }

    setUsageLines([...usageLines, {
      orderItemId: defaultItem.id,
      quantity: 1,
      movementType: mv,
      itemCondition: 'Good',
      notes: '',
      availableLimit: defaultItem.qtyAvailable || 0,
    }]);
  };

  const handleRemoveUsageLine = (idx: number) => {
    if (usageLines.length === 1) return;
    setUsageLines(usageLines.filter((_, i) => i !== idx));
  };

  const handleUsageLineChange = (idx: number, field: string, value: any) => {
    const updated = [...usageLines];
    if (field === 'orderItemId') {
      const item = items.find(i => i.id === value);
      updated[idx] = { 
        ...updated[idx], 
        orderItemId: value, 
        availableLimit: item?.qtyAvailable || 0,
        movementType: (usageType === 'EVENT' || usageType === 'OFFICE')
          ? (item?.itemType === 'REUSABLE' ? 'TEMPORARY_ISSUE' : 'CONSUMED')
          : updated[idx].movementType
      };
    } else {
      updated[idx] = { ...updated[idx], [field]: value };
    }
    setUsageLines(updated);
  };

  const handleSaveUsage = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationErrors({});

    const errors: Record<string, string> = {};

    // 1. Validate usageType
    if (!usageType) {
      errors.usageType = 'Usage purpose/type is required.';
    }

    // 2. Validate usage lines
    if (usageLines.length === 0) {
      errors.items = 'At least one item line must be entered.';
    } else {
      usageLines.forEach((line, idx) => {
        if (!line.orderItemId) {
          errors[`line_${idx}_orderItemId`] = 'Please select an item.';
        }
        const qty = parseInt(line.quantity, 10);
        if (isNaN(qty) || qty <= 0) {
          errors[`line_${idx}_quantity`] = 'Quantity must be greater than 0.';
        } else if (qty > line.availableLimit) {
          errors[`line_${idx}_quantity`] = `Quantity exceeds available stock (${line.availableLimit}).`;
        }
      });

      // Check if total quantity requested for each unique orderItemId exceeds its available limit across multiple rows
      const itemTotals: Record<string, number> = {};
      const itemNames: Record<string, string> = {};
      const itemLimits: Record<string, number> = {};

      usageLines.forEach((line) => {
        if (line.orderItemId) {
          const qty = parseInt(line.quantity, 10) || 0;
          itemTotals[line.orderItemId] = (itemTotals[line.orderItemId] || 0) + qty;
          
          const matchedItem = items.find(i => i.id === line.orderItemId);
          if (matchedItem) {
            itemNames[line.orderItemId] = matchedItem.itemName;
            itemLimits[line.orderItemId] = matchedItem.qtyAvailable || 0;
          }
        }
      });

      Object.keys(itemTotals).forEach((itemId) => {
        const totalRequested = itemTotals[itemId];
        const avail = itemLimits[itemId] || 0;
        if (totalRequested > avail) {
          usageLines.forEach((line, idx) => {
            if (line.orderItemId === itemId) {
              errors[`line_${idx}_quantity`] = `Total selected quantity (${totalRequested}) exceeds available stock (${avail}) for ${itemNames[itemId]}.`;
            }
          });
        }
      });
    }

    // 3. Validate required fields by usage type
    if (usageType === 'EVENT') {
      if (!eventName.trim()) {
        errors.eventName = 'Event Name is required for Event Use.';
      }
    } else if (usageType === 'EMPLOYEE_REPLACEMENT') {
      if (!employeeName.trim()) {
        errors.employeeName = 'Employee Name is required for Employee Replacement.';
      }
      if (!employeeDepartment.trim()) {
        errors.employeeDepartment = 'Employee Department is required.';
      }
      if (!reason.trim()) {
        errors.reason = 'Reason for Replacement is required for Employee Replacement.';
      }
    }

    // If validation fails, keep modal open, show clear message, don't save
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      console.warn('[VALIDATION ERROR] Saving usage record failed on frontend validations:', errors);
      return;
    }

    setIsSaving(true);

    // Prepare payload
    const payload = {
      orderId,
      usageType,
      usageDate: new Date(usageDate).toISOString(),
      eventName: usageType === 'EVENT' ? eventName : null,
      venue: usageType === 'EVENT' ? venue : null,
      officeUseDetails: usageType === 'OFFICE' ? reason : null,
      employeeName: usageType === 'EMPLOYEE_REPLACEMENT' ? employeeName : null,
      employeeDepartment: usageType === 'EMPLOYEE_REPLACEMENT' ? employeeDepartment : null,
      reason: reason || null,
      notes,
      encodedBy: encodedBy || 'Guest Operator',
      items: usageLines.map(line => ({
        orderItemId: line.orderItemId,
        quantity: parseInt(line.quantity, 10),
        itemNotes: line.notes || null,
      }))
    };

    console.log('[DEBUG] Outgoing usage payload:', JSON.stringify(payload));

    try {
      const response = await apiPost('/usage', payload);
      console.log('[DEBUG] API response:', response);

      if (response && !response.error) {
        setToast({ type: 'success', message: 'Usage record saved successfully.' });
        setIsUsageOpen(false);
        fetchOrderDetails();
        window.dispatchEvent(new CustomEvent('stock-updated'));
      } else {
        const errMsg = response?.message || response?.error || 'Failed to record usage transaction.';
        setToast({ type: 'error', message: errMsg });
      }
    } catch (err: any) {
      console.error('[DEBUG] Failed API response:', err);
      setToast({ type: 'error', message: err.message || 'Failed to record usage transaction.' });
    } finally {
      setIsSaving(false);
    }
  };

  // Edit Order Modal opening & operations
  const handleOpenEditModal = () => {
    if (!order) return;
    setEditTitle(order.orderTitle);
    setEditDateReceived(dateToInputString(order.dateReceived));
    setEditOverallCondition(order.overallCondition);
    setEditStatus(order.status);
    setEditNotes(order.notes || '');
    setEditEncodedBy(order.encodedBy || '');
    setEditItemLines(items.map((i: any) => ({
      id: i.id,
      itemName: i.itemName,
      category: i.category,
      itemType: i.itemType,
      quantityReceived: i.quantityReceived,
      notes: i.notes || ''
    })));
    setIsEditOpen(true);
  };

  const handleEditAddLine = () => {
    setEditItemLines([...editItemLines, {
      id: null,
      itemName: '',
      category: 'Event Materials',
      itemType: 'CONSUMABLE',
      quantityReceived: 10,
      notes: ''
    }]);
  };

  const handleEditRemoveLine = (idx: number) => {
    if (editItemLines.length === 1) return;
    setEditItemLines(editItemLines.filter((_, i) => i !== idx));
  };

  const handleEditLineChange = (idx: number, field: string, value: any) => {
    const updated = [...editItemLines];
    updated[idx] = { ...updated[idx], [field]: value };
    setEditItemLines(updated);
  };

  const handleSaveEditedOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle) {
      alert('Please fill in all general order properties.');
      return;
    }

    if (editItemLines.length === 0) {
      alert('At least one item is required before saving.');
      return;
    }

    const invalidLine = editItemLines.some(line => !line.itemName || isNaN(Number(line.quantityReceived)) || Number(line.quantityReceived) <= 0);
    if (invalidLine) {
      alert('All items must have a name and positive quantity received.');
      return;
    }

    try {
      const payload = {
        orderTitle: editTitle,
        dateReceived: new Date(editDateReceived).toISOString(),
        overallCondition: editOverallCondition,
        status: editStatus,
        notes: editNotes,
        encodedBy: editEncodedBy,
        items: editItemLines
      };

      await apiPut(`/orders/${orderId}`, payload);
      setIsEditOpen(false);
      fetchOrderDetails();
    } catch (err: any) {
      alert(err.message || 'Error saving order.');
    }
  };

  if (loading && !order) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-slate-500 text-sm">Loading order details...</div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-4 bg-red-50 text-red-700 text-xs rounded-lg">
        Order not found or was deleted.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[9999] flex items-center gap-2 p-4 rounded-lg shadow-lg border transition-all duration-300 ${
          toast.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-emerald-100' 
            : 'bg-red-50 text-red-800 border-red-200 shadow-red-100'
        }`}>
          <span className="text-xs font-semibold">{toast.message}</span>
        </div>
      )}
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 border border-slate-200 rounded-xl shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-slate-50 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-700 transition cursor-pointer"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg">
                {order.orderNumber}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                order.status === 'In Stock' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                order.status === 'Partially Deployed' ? 'bg-amber-50 border-amber-100 text-amber-700' :
                order.status === 'Fully Deployed' ? 'bg-blue-50 border-blue-100 text-blue-700' :
                order.status === 'Pending Return' ? 'bg-purple-50 border-purple-100 text-purple-700' :
                'bg-red-50 border-red-150 text-red-700'
              }`}>
                {order.status}
              </span>
            </div>
            <h1 className="text-base font-bold text-slate-800 mt-1 tracking-tight">{order.orderTitle}</h1>
            <p className="text-xs text-slate-500 mt-0.5">Received {formatDate(order.dateReceived)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch md:self-auto">
          <button
            onClick={handleOpenEditModal}
            className="flex-1 md:flex-none text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 px-3.5 rounded-xl transition flex items-center justify-center gap-1.5 border border-slate-200 cursor-pointer"
          >
            <Edit size={14} />
            <span>Update Order</span>
          </button>

          <button
            id="record_usage_btn"
            onClick={handleOpenUsageWizard}
            className="flex-1 md:flex-none text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-3.5 rounded-xl transition-all duration-150 flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus size={14} />
            <span>+ Record Stock Usage / Movement</span>
          </button>
        </div>
      </div>

      {/* Stats Summary Panel */}
      <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Encoded By</span>
          <span className="text-xs font-semibold text-slate-800 mt-1 block">{order.encodedBy || 'Guest Operator'}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Condition / Quality</span>
          <span className="text-xs font-semibold text-slate-800 mt-1 block">{order.overallCondition}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Internal Remarks</span>
          <span className="text-xs text-slate-500 mt-1 block" title={order.notes || ''}>
            {order.notes || 'No general notes attached.'}
          </span>
        </div>
      </div>

      {/* Items List/Cards Grid */}
      <div className="space-y-4">
        <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Order Items List</h3>
          <span className="text-[10px] text-slate-400 font-medium">Real-time status updates</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <div key={item.id} className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs hover:shadow-sm transition relative flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start gap-2">
                  <h4 className="text-sm font-bold text-slate-800 tracking-tight">{item.itemName}</h4>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold border shrink-0 ${
                    item.liveStatus === 'In Stock' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                    item.liveStatus === 'Low Stock' ? 'bg-amber-50 border-amber-100 text-amber-700' :
                    item.liveStatus === 'Fully Used' || item.liveStatus === 'Out of Stock' ? 'bg-red-50 border-red-100 text-red-700' :
                    item.liveStatus === 'Pending Return' ? 'bg-blue-50 border-blue-100 text-blue-700' :
                    item.liveStatus === 'Partially Deployed' ? 'bg-sky-50 border-sky-100 text-sky-700' :
                    'bg-slate-50 border-slate-200 text-slate-600'
                  }`}>
                    {item.liveStatus}
                  </span>
                </div>
                
                <div className="mt-4 space-y-2 text-xs text-slate-600">
                  <p><span className="text-slate-400 font-medium">Category:</span> <span className="font-semibold text-slate-700">{item.category}</span></p>
                  <p><span className="text-slate-400 font-medium">Type:</span> <span className="font-semibold text-slate-700 capitalize">{item.itemType.toLowerCase()}</span></p>
                  <p><span className="text-slate-400 font-medium">Received:</span> <span className="font-semibold text-slate-700">{item.quantityReceived}</span></p>
                  <p><span className="text-slate-400 font-medium">Used:</span> <span className="font-semibold text-slate-700 text-amber-600">{item.qtyUsed}</span></p>
                  <p><span className="text-slate-400 font-medium">Deployed:</span> <span className="font-semibold text-slate-700 text-blue-600">{item.itemType === 'REUSABLE' ? item.qtyDeployed : 'N/A'}</span></p>
                  <p><span className="text-slate-400 font-medium">Available:</span> <span className="font-bold text-emerald-600">{item.qtyAvailable}</span></p>
                </div>
              </div>

              {item.notes && (
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Item Notes</span>
                  <p className="text-xs text-slate-500 italic mt-0.5">{item.notes}</p>
                </div>
              )}
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-slate-400 text-xs py-4 col-span-3 text-center">No items registered in this order.</p>
          )}
        </div>
      </div>

      {/* Usage History Section */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs mt-6">
        <div className="flex justify-between items-center bg-slate-50 p-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <ClipboardList size={16} className="text-slate-600" />
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Usage History</h3>
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Recorded stock movements</span>
        </div>

        <div className="overflow-x-auto">
          {orderUsages.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-slate-400 text-xs">No usage records have been recorded for this order yet.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="p-3">Date</th>
                  <th className="p-3">Usage Type</th>
                  <th className="p-3">Event / Office / Employee</th>
                  <th className="p-3">Items Used</th>
                  <th className="p-3">Quantity</th>
                  <th className="p-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {orderUsages.map((usage: any) => {
                  const itemsUsedText = Array.isArray(usage.items)
                    ? usage.items.map((it: any) => `${it.orderItem?.itemName || 'Unknown'} (x${it.quantity})`).join(', ')
                    : 'N/A';

                  const totalQty = Array.isArray(usage.items)
                    ? usage.items.reduce((sum: number, it: any) => sum + (it.quantity || 0), 0)
                    : 0;

                  // Format details depending on type
                  let details = '';
                  if (usage.usageType === 'EVENT') {
                    details = `Event: ${usage.eventName || ''} ${usage.venue ? `(${usage.venue})` : ''}`;
                  } else if (usage.usageType === 'EMPLOYEE_REPLACEMENT') {
                    details = `Employee: ${usage.employeeName || ''} (${usage.employeeDepartment || ''}) - ${usage.reason || ''}`;
                  } else {
                    details = usage.reason || 'Office Use';
                  }

                  return (
                    <tr key={usage.id} className="hover:bg-slate-50 transition">
                      <td className="p-3 whitespace-nowrap text-slate-500">
                        {formatDate(usage.usageDate)}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          usage.usageType === 'EVENT' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' :
                          usage.usageType === 'EMPLOYEE_REPLACEMENT' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                          'bg-slate-50 text-slate-700 border border-slate-200'
                        }`}>
                          {usage.usageType === 'EVENT' ? 'Event Use' :
                           usage.usageType === 'EMPLOYEE_REPLACEMENT' ? 'Employee Replacement' :
                           'Office Use'}
                        </span>
                      </td>
                      <td className="p-3 max-w-xs truncate font-medium" title={details}>
                        {details}
                      </td>
                      <td className="p-3 max-w-xs truncate" title={itemsUsedText}>
                        {itemsUsedText}
                      </td>
                      <td className="p-3 whitespace-nowrap font-bold text-slate-800">
                        {totalQty}
                      </td>
                      <td className="p-3 text-slate-500 max-w-xs truncate" title={usage.notes || ''}>
                        {usage.notes || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Record Stock Usage / Movement Modal */}
      {isUsageOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white border border-slate-100 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-indigo-50/20">
              <div className="flex items-center gap-2">
                <ClipboardList size={18} className="text-indigo-600" />
                <h2 className="text-sm font-bold text-slate-800">Record Stock Usage / Movement</h2>
              </div>
              <button onClick={() => setIsUsageOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {/* Content Form */}
            <form id="usage-wizard-form" onSubmit={handleSaveUsage} className="flex-1 overflow-y-auto p-6 space-y-6">
              {Object.keys(validationErrors).length > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-xs font-semibold">
                  Please correct the validation errors below before saving.
                </div>
              )}

              {/* Type selector buttons */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Usage Purpose / Type</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {[
                    { value: 'EVENT', label: 'Event Use' },
                    { value: 'OFFICE', label: 'Office Use' },
                    { value: 'EMPLOYEE_REPLACEMENT', label: 'Employee Replacement' }
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleUsageTypeChange(option.value as any)}
                      className={`text-xs p-2.5 rounded-lg font-semibold border transition text-center ${
                        usageType === option.value
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Common Fields Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Date of Movement *</label>
                  <input
                    type="date"
                    value={usageDate}
                    onChange={(e) => setUsageDate(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Encoded By / Person Responsible</label>
                  <input
                    type="text"
                    placeholder="e.g. Juan dela Cruz"
                    value={encodedBy}
                    onChange={(e) => setEncodedBy(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 bg-white"
                  />
                </div>
              </div>

              {/* Direct Text Field Sections for event/employee/office replacement */}
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 space-y-4">
                {/* 1. EVENT USE */}
                {usageType === 'EVENT' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Event Name *</label>
                        <input
                          type="text"
                          placeholder="e.g. Grand Product Launch"
                          value={eventName}
                          onChange={(e) => setEventName(e.target.value)}
                          className={`w-full text-xs p-2 border rounded-lg focus:outline-none focus:border-indigo-500 bg-white ${
                            validationErrors.eventName ? 'border-red-500 bg-red-50' : 'border-slate-200'
                          }`}
                        />
                        {validationErrors.eventName && (
                          <p className="text-red-500 text-[10px] mt-1">{validationErrors.eventName}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Venue / Location</label>
                        <input
                          type="text"
                          placeholder="e.g. SMX Convention Center"
                          value={venue}
                          onChange={(e) => setVenue(e.target.value)}
                          className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 bg-white"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. OFFICE USE */}
                {usageType === 'OFFICE' && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Office Use Details</label>
                    <input
                      type="text"
                      placeholder="e.g. For General Marketing Room upgrade (Optional)"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 bg-white"
                    />
                  </div>
                )}

                {/* 3. EMPLOYEE REPLACEMENT */}
                {usageType === 'EMPLOYEE_REPLACEMENT' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Employee Name *</label>
                        <input
                          type="text"
                          placeholder="e.g. Jane Smith"
                          value={employeeName}
                          onChange={(e) => setEmployeeName(e.target.value)}
                          className={`w-full text-xs p-2 border rounded-lg focus:outline-none focus:border-indigo-500 bg-white ${
                            validationErrors.employeeName ? 'border-red-500 bg-red-50' : 'border-slate-200'
                          }`}
                        />
                        {validationErrors.employeeName && (
                          <p className="text-red-500 text-[10px] mt-1">{validationErrors.employeeName}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Employee Department *</label>
                        <input
                          type="text"
                          placeholder="e.g. Sales Division"
                          value={employeeDepartment}
                          onChange={(e) => setEmployeeDepartment(e.target.value)}
                          className={`w-full text-xs p-2 border rounded-lg focus:outline-none focus:border-indigo-500 bg-white ${
                            validationErrors.employeeDepartment ? 'border-red-500 bg-red-50' : 'border-slate-200'
                          }`}
                        />
                        {validationErrors.employeeDepartment && (
                          <p className="text-red-500 text-[10px] mt-1">{validationErrors.employeeDepartment}</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Reason for Replacement *</label>
                      <input
                        type="text"
                        placeholder="e.g. Damaged keyboard swap"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className={`w-full text-xs p-2 border rounded-lg focus:outline-none focus:border-indigo-500 bg-white ${
                          validationErrors.reason ? 'border-red-500 bg-red-50' : 'border-slate-200'
                        }`}
                      />
                      {validationErrors.reason && (
                        <p className="text-red-500 text-[10px] mt-1">{validationErrors.reason}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Items Selection Grid */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-xs font-bold text-slate-700">Movement Items Selection</h3>
                  <button
                    type="button"
                    onClick={handleAddUsageLine}
                    className="text-[9px] bg-slate-100 text-slate-700 px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-200 font-bold"
                  >
                    + Add Item Row
                  </button>
                </div>

                {validationErrors.items && (
                  <p className="text-red-500 text-xs font-semibold mb-2">{validationErrors.items}</p>
                )}

                <div className="space-y-3">
                  {usageLines.map((line, idx) => {
                    const isExceeded = line.quantity > line.availableLimit;
                    const lineItemIdErr = validationErrors[`line_${idx}_orderItemId`];
                    const lineQtyErr = validationErrors[`line_${idx}_quantity`];

                    return (
                      <div key={idx} className="flex flex-col md:flex-row gap-3 bg-slate-50/50 p-3 rounded-lg border border-slate-200 items-start md:items-center">
                        <div className="flex-1 w-full">
                          <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Select Item Line *</label>
                          <select
                            value={line.orderItemId}
                            onChange={(e) => handleUsageLineChange(idx, 'orderItemId', e.target.value)}
                            className={`w-full text-xs p-2 border rounded bg-white ${
                              lineItemIdErr ? 'border-red-500 bg-red-50' : 'border-slate-200'
                            }`}
                          >
                            <option value="">Choose item from batch...</option>
                            {items.map(i => (
                              <option key={i.id} value={i.id}>{i.itemName} ({i.itemType} • Avail: {i.qtyAvailable})</option>
                            ))}
                          </select>
                          {lineItemIdErr && (
                            <p className="text-red-500 text-[10px] mt-0.5">{lineItemIdErr}</p>
                          )}
                        </div>

                        <div className="w-full md:w-32">
                          <div className="flex justify-between">
                            <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Qty to Use *</label>
                            <span className="text-[9px] text-slate-400 font-bold">Avail: {line.availableLimit}</span>
                          </div>
                          <input
                            type="number"
                            min="1"
                            value={isNaN(Number(line.quantity)) || line.quantity === '' ? '' : line.quantity}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              handleUsageLineChange(idx, 'quantity', isNaN(val) ? '' : val);
                            }}
                            className={`w-full text-xs p-2 border rounded-lg text-center ${
                              isExceeded || lineQtyErr ? 'border-red-500 bg-red-50 text-red-900 font-bold' : 'border-slate-200'
                            }`}
                          />
                          {lineQtyErr && (
                            <p className="text-red-500 text-[10px] mt-0.5">{lineQtyErr}</p>
                          )}
                        </div>

                        <div className="flex-1 w-full">
                          <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Item Notes</label>
                          <input
                            type="text"
                            placeholder="Optional line notes"
                            value={line.notes || ''}
                            onChange={(e) => handleUsageLineChange(idx, 'notes', e.target.value)}
                            className="w-full text-xs p-2 border border-slate-200 rounded"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveUsageLine(idx)}
                          disabled={usageLines.length === 1}
                          className="text-red-500 hover:text-red-700 disabled:opacity-30 mt-5 transition"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* General Remarks */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">General Notes / Remarks</label>
                <textarea
                  placeholder="Record why this item is being deployed/consumed..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 mb-4"
                ></textarea>
              </div>
            </form>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-100 bg-slate-50">
              <button
                type="button"
                onClick={() => setIsUsageOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-700 px-4 py-2 font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="usage-wizard-form"
                disabled={isSaving}
                className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg font-semibold transition disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Usage Record'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit/Update Order Modal */}
      {isEditOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white border border-slate-100 rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                <Edit size={16} className="text-indigo-600" />
                <h2 className="text-sm font-bold text-slate-800">Update Order: {order.orderNumber}</h2>
              </div>
              <button onClick={() => setIsEditOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveEditedOrder} className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-6">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Order / Supply Batch Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Logitech Office Keyboards & Headsets"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    required
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Date Received *</label>
                  <input
                    type="date"
                    value={editDateReceived}
                    onChange={(e) => setEditDateReceived(e.target.value)}
                    required
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Overall Condition / Quality</label>
                  <select
                    value={editOverallCondition}
                    onChange={(e) => setEditOverallCondition(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 bg-white"
                  >
                    <option value="New">New</option>
                    <option value="Good">Good</option>
                    <option value="Mixed">Mixed</option>
                    <option value="Damaged">Damaged</option>
                  </select>
                </div>

                <div className="md:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Supply Batch Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 bg-white"
                  >
                    <option value="In Stock">In Stock</option>
                    <option value="Partially Deployed">Partially Deployed</option>
                    <option value="Fully Deployed">Fully Deployed</option>
                    <option value="Pending Return">Pending Return</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>

                <div className="md:col-span-6">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Notes & Details</label>
                  <textarea
                    placeholder="Provide any additional order header notes..."
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    rows={2}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                  ></textarea>
                </div>

                <div className="md:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Encoded By / Person Responsible</label>
                  <input
                    type="text"
                    placeholder="e.g. Juan dela Cruz (Supply Lead)"
                    value={editEncodedBy}
                    onChange={(e) => setEditEncodedBy(e.target.value)}
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
                    onClick={handleEditAddLine}
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
                      {editItemLines.map((line, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/20">
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              placeholder="e.g. Extension Cord"
                              value={line.itemName}
                              onChange={(e) => handleEditLineChange(idx, 'itemName', e.target.value)}
                              required
                              className="w-full text-[11px] p-1.5 border border-slate-200 rounded"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <select
                              value={line.category}
                              onChange={(e) => handleEditLineChange(idx, 'category', e.target.value)}
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
                              onChange={(e) => handleEditLineChange(idx, 'itemType', e.target.value)}
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
                                handleEditLineChange(idx, 'quantityReceived', isNaN(val) ? '' : val);
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
                              onChange={(e) => handleEditLineChange(idx, 'notes', e.target.value)}
                              className="w-full text-[11px] p-1.5 border border-slate-200 rounded"
                            />
                          </td>
                          <td className="py-2 px-1 text-center">
                            <button
                              type="button"
                              onClick={() => handleEditRemoveLine(idx)}
                              disabled={editItemLines.length === 1}
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

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-100 bg-slate-50">
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-700 px-4 py-2 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEditedOrder}
                className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg font-semibold transition"
              >
                Save Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
