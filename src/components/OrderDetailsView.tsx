import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, formatDate, dateToInputString } from '../utils/api.ts';
import { Order, OrderItem, Event, Employee, OfficeLocation, User } from '../types.ts';
import { ArrowLeft, Plus, Play, Calendar, HelpCircle, Check, AlertTriangle, X, RefreshCw, ClipboardList, Info } from 'lucide-react';

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

  // Reference Data
  const [events, setEvents] = useState<Event[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [offices, setOffices] = useState<OfficeLocation[]>([]);
  const [activeEventUsages, setActiveEventUsages] = useState<any[]>([]);

  // Usage Modal Wizard
  const [isUsageOpen, setIsUsageOpen] = useState(false);
  const [usageDate, setUsageDate] = useState(dateToInputString(new Date()));
  const [usageType, setUsageType] = useState<'EVENT' | 'OFFICE' | 'EMPLOYEE_REPLACEMENT' | 'DAMAGE_LOSS' | 'RETURN' | 'ADJUSTMENT'>('EVENT');
  const [notes, setNotes] = useState('');

  // Dynamic fields
  const [eventId, setEventId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [officeLocationId, setOfficeLocationId] = useState('');
  const [reason, setReason] = useState(''); // Also serves as original event usage reference
  
  // Custom quick fields inside wizard
  const [officeDept, setOfficeDept] = useState('');
  const [officeArea, setOfficeArea] = useState('');
  const [officePurpose, setOfficePurpose] = useState('');
  const [employeeReason, setEmployeeReason] = useState('');
  const [employeeApprovedBy, setEmployeeApprovedBy] = useState('');
  const [damageReason, setDamageReason] = useState('');
  const [damageCondition, setDamageCondition] = useState('Damaged');
  const [damageReportedBy, setDamageReportedBy] = useState('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [returnBy, setReturnBy] = useState('');

  // Items added to the usage record
  const [usageLines, setUsageLines] = useState<any[]>([
    {
      orderItemId: '',
      quantity: 1,
      movementType: 'CONSUMED',
      itemCondition: 'Good',
      notes: '',
      availableLimit: 0, // dynamic read-only
    }
  ]);

  // Inline Quick addition toggles
  const [showEventAdd, setShowEventAdd] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [newEventVenue, setNewEventVenue] = useState('');

  const [showEmployeeAdd, setShowEmployeeAdd] = useState(false);
  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [newEmployeeDept, setNewEmployeeDept] = useState('');

  const fetchOrderDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet(`/orders/${orderId}`);
      setOrder(data);
      setItems(data.items || []);

      // Get lists for select fields
      const eventsData = await apiGet('/events');
      setEvents(eventsData);

      const employeesData = await apiGet('/employees');
      setEmployees(employeesData);

      const officesData = await apiGet('/office-locations');
      setOffices(officesData);

      const usages = await apiGet('/usages');
      const activeEventsUsg = usages.filter((u: any) => u.usageType === 'EVENT' && u.status === 'ACTIVE');
      setActiveEventUsages(activeEventsUsg);

    } catch (err: any) {
      setError(err.message || 'Error loading order details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderDetails();
  }, [orderId]);

  const handleOpenUsageWizard = () => {
    setUsageDate(dateToInputString(new Date()));
    setUsageType('EVENT');
    setNotes('');
    setEventId('');
    setEmployeeId('');
    setOfficeLocationId('');
    setReason('');
    
    setOfficeDept('');
    setOfficeArea('');
    setOfficePurpose('');
    setEmployeeReason('');
    setEmployeeApprovedBy('');
    setDamageReason('');
    setDamageCondition('Damaged');
    setDamageReportedBy('');
    setReturnBy('');
    
    // Set a default return date (e.g. 3 days from now)
    const threeDays = new Date();
    threeDays.setDate(threeDays.getDate() + 3);
    setExpectedReturnDate(dateToInputString(threeDays));

    // Seed first line
    if (items.length > 0) {
      setUsageLines([
        {
          orderItemId: items[0].id,
          quantity: 1,
          movementType: 'CONSUMED',
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

  const handleUsageTypeChange = (type: any) => {
    setUsageType(type);
    
    // Update movement type of lines automatically based on type selection
    const updated = usageLines.map((line) => {
      const item = items.find(i => i.id === line.orderItemId);
      let mv = 'CONSUMED';
      if (type === 'EVENT') {
        mv = item?.itemType === 'REUSABLE' ? 'TEMPORARY_ISSUE' : 'CONSUMED';
      } else if (type === 'OFFICE') {
        mv = item?.itemType === 'REUSABLE' ? 'TEMPORARY_ISSUE' : 'CONSUMED';
      } else if (type === 'EMPLOYEE_REPLACEMENT') {
        mv = 'REPLACED';
      } else if (type === 'DAMAGE_LOSS') {
        mv = 'DAMAGED';
      } else if (type === 'RETURN') {
        mv = 'RETURNED';
      } else if (type === 'ADJUSTMENT') {
        mv = 'ADJUSTMENT_IN';
      }
      return { ...line, movementType: mv };
    });
    setUsageLines(updated);
  };

  const handleAddUsageLine = () => {
    if (items.length === 0) return;
    const defaultItem = items[0];
    
    let mv = 'CONSUMED';
    if (usageType === 'EVENT') {
      mv = defaultItem.itemType === 'REUSABLE' ? 'TEMPORARY_ISSUE' : 'CONSUMED';
    } else if (usageType === 'EMPLOYEE_REPLACEMENT') {
      mv = 'REPLACED';
    } else if (usageType === 'DAMAGE_LOSS') {
      mv = 'DAMAGED';
    } else if (usageType === 'RETURN') {
      mv = 'RETURNED';
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
        // Update movement type automatically if reusable vs consumable
        movementType: usageType === 'EVENT' || usageType === 'OFFICE'
          ? (item?.itemType === 'REUSABLE' ? 'TEMPORARY_ISSUE' : 'CONSUMED')
          : updated[idx].movementType
      };
    } else {
      updated[idx] = { ...updated[idx], [field]: value };
    }
    setUsageLines(updated);
  };

  // Quick creations inside wizard
  const handleQuickEventCreate = async () => {
    if (!newEventName || !newClientName || !newEventDate || !newEventVenue) return;
    try {
      const ev = await apiPost('/events', {
        eventName: newEventName,
        clientName: newClientName,
        eventDate: new Date(newEventDate).toISOString(),
        venue: newEventVenue,
        status: 'Active',
      });
      setEvents([...events, ev]);
      setEventId(ev.id);
      setShowEventAdd(false);
      setNewEventName('');
      setNewClientName('');
      setNewEventDate('');
      setNewEventVenue('');
    } catch (err: any) {
      alert(err.message || 'Failed to create event entry.');
    }
  };

  const handleQuickEmployeeCreate = async () => {
    if (!newEmployeeName || !newEmployeeDept) return;
    try {
      const emp = await apiPost('/employees', {
        fullName: newEmployeeName,
        department: newEmployeeDept,
      });
      setEmployees([...employees, emp]);
      setEmployeeId(emp.id);
      setShowEmployeeAdd(false);
      setNewEmployeeName('');
      setNewEmployeeDept('');
    } catch (err: any) {
      alert(err.message || 'Failed to register employee.');
    }
  };

  const handleSaveUsage = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validations
    if (usageLines.length === 0) {
      alert('At least one item line must be entered.');
      return;
    }

    // Prepare payload depending on type
    let finalReason = reason;
    let finalNotes = notes;

    if (usageType === 'EVENT') {
      if (!eventId) {
        alert('Please select an Event.');
        return;
      }
      const selectedEv = events.find(ev => ev.id === eventId);
      finalReason = `Issued to Event: ${selectedEv?.eventName}`;
      finalNotes = `Expected return: ${expectedReturnDate}. ${notes}`;
    } else if (usageType === 'OFFICE') {
      if (!officeLocationId || !officeDept || !officePurpose) {
        alert('Please specify office department, location, and purpose of use.');
        return;
      }
      const selectedLoc = offices.find(o => o.id === officeLocationId);
      finalReason = `Office Use: Dept ${officeDept} at ${selectedLoc?.locationName}`;
      finalNotes = `Purpose: ${officePurpose}. ${notes}`;
    } else if (usageType === 'EMPLOYEE_REPLACEMENT') {
      if (!employeeId || !employeeReason || !employeeApprovedBy) {
        alert('Please specify recipient employee, reason, and approval authority.');
        return;
      }
      const selectedEmp = employees.find(emp => emp.id === employeeId);
      finalReason = `Replacement for ${selectedEmp?.fullName} (Dept ${selectedEmp?.department})`;
      finalNotes = `Reason: ${employeeReason}. Approved By: ${employeeApprovedBy}. ${notes}`;
    } else if (usageType === 'DAMAGE_LOSS') {
      if (!damageReason || !damageReportedBy) {
        alert('Please specify the damage reason and reporter name.');
        return;
      }
      finalReason = `Damage/Loss: ${damageReason}`;
      finalNotes = `Reported By: ${damageReportedBy}. Condition: ${damageCondition}. ${notes}`;
    } else if (usageType === 'RETURN') {
      if (!reason) {
        alert('Please select the original Event Usage Reference.');
        return;
      }
      // Reason is the original usage reference (e.g. USG-2026xxxx-0001)
      finalReason = reason;
      finalNotes = `Returned by: ${returnBy}. ${notes}`;
    }

    try {
      await apiPost('/usages', {
        usageDate: new Date(usageDate).toISOString(),
        usageType,
        eventId: eventId || null,
        employeeId: employeeId || null,
        officeLocationId: officeLocationId || null,
        reason: finalReason,
        notes: finalNotes,
        items: usageLines.map(line => ({
          orderItemId: line.orderItemId,
          quantity: parseInt(line.quantity, 10),
          movementType: line.movementType,
          itemCondition: line.itemCondition,
          notes: line.notes
        }))
      });

      setIsUsageOpen(false);
      fetchOrderDetails();
    } catch (err: any) {
      alert(err.message || 'Failed to record usage transaction.');
    }
  };

  if (loading && !order) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-slate-500 text-sm">Loading order batch metrics...</div>
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
      {/* Back to list and header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 border border-slate-200 rounded-xl shadow-xs">
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
                order.status === 'Available' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                order.status === 'Partially Used' ? 'bg-amber-50 border-amber-100 text-amber-700' :
                order.status === 'Fully Used' ? 'bg-slate-50 border-slate-200 text-slate-500' :
                'bg-red-50 border-red-100 text-red-700'
              }`}>
                {order.status}
              </span>
            </div>
            <h1 className="text-base font-bold text-slate-800 mt-1 tracking-tight">{order.orderTitle}</h1>
            <p className="text-xs text-slate-500 mt-0.5">Supplier: {order.supplier?.supplierName} • Received {formatDate(order.dateReceived)}</p>
          </div>
        </div>

        <button
          id="record_usage_btn"
          onClick={handleOpenUsageWizard}
          className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-3.5 rounded-xl transition-all duration-150 flex items-center gap-1.5 self-start shadow-xs cursor-pointer"
        >
          <Plus size={14} />
          <span>Record Usage</span>
        </button>
      </div>

      {/* Stats Summary Panel */}
      <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-xs grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">PO or Invoice No</span>
          <span className="text-xs font-semibold text-slate-800 mt-1 block">{order.poOrInvoiceNumber}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Date Ordered</span>
          <span className="text-xs font-semibold text-slate-800 mt-1 block">{formatDate(order.dateOrdered)}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Encoded By / Person Responsible</span>
          <span className="text-xs font-semibold text-slate-800 mt-1 block">{order.creator?.fullName || 'System Admin'}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Internal Remarks</span>
          <span className="text-xs text-slate-500 mt-1 block truncate max-w-[200px]" title={order.notes || ''}>
            {order.notes || 'No general notes attached.'}
          </span>
        </div>
      </div>

      {/* Items Balance List */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Order Item Balances</h3>
          <span className="text-[10px] text-slate-400 font-medium">Live quantities deducted instantly</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-500">
            <thead className="bg-slate-50 text-slate-400 uppercase text-[9px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Item Name</th>
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4 text-center">Type</th>
                <th className="py-2.5 px-4 text-center">Qty Received</th>
                <th className="py-2.5 px-4 text-center">Qty Used</th>
                <th className="py-2.5 px-4 text-center">Qty Deployed</th>
                <th className="py-2.5 px-4 text-center">Qty Returned</th>
                <th className="py-2.5 px-4 text-center">Qty Available</th>
                <th className="py-2.5 px-4">Storage Location</th>
                <th className="py-2.5 px-4">Item Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/20 transition">
                  <td className="py-3 px-4 font-bold text-slate-800">{item.itemName}</td>
                  <td className="py-3 px-4 text-slate-500">{item.category}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-2 py-0.5 rounded text-[8px] font-bold ${
                      item.itemType === 'REUSABLE' ? 'bg-sky-50 text-sky-700 border border-sky-100' : 'bg-orange-50 text-orange-700 border border-orange-100'
                    }`}>
                      {item.itemType}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center font-semibold text-slate-700">{item.quantityReceived} {item.unit}</td>
                  <td className="py-3 px-4 text-center text-amber-600 font-semibold">{item.qtyUsed}</td>
                  <td className="py-3 px-4 text-center text-blue-600 font-semibold">{item.itemType === 'REUSABLE' ? item.qtyDeployed : 'N/A'}</td>
                  <td className="py-3 px-4 text-center text-teal-600 font-semibold">{item.itemType === 'REUSABLE' ? item.qtyReturned : 'N/A'}</td>
                  <td className="py-3 px-4 text-center font-bold text-emerald-600 bg-emerald-50/20">{item.qtyAvailable}</td>
                  <td className="py-3 px-4 text-slate-500 font-medium">{item.storageLocation}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${
                      item.liveStatus === 'In Stock' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                      item.liveStatus === 'Low Stock' ? 'bg-amber-50 border-amber-100 text-amber-700' :
                      item.liveStatus === 'Fully Used' || item.liveStatus === 'Out of Stock' ? 'bg-red-50 border-red-100 text-red-700' :
                      item.liveStatus === 'Pending Return' ? 'bg-blue-50 border-blue-100 text-blue-700' :
                      item.liveStatus === 'Partially Deployed' ? 'bg-sky-50 border-sky-100 text-sky-700' :
                      'bg-slate-50 border-slate-200 text-slate-600'
                    }`}>
                      {item.liveStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Usage Drawer/Modal */}
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
            <form onSubmit={handleSaveUsage} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Type selector buttons */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Usage Purpose / Type</label>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                  {[
                    { value: 'EVENT', label: 'Event Use' },
                    { value: 'OFFICE', label: 'Office Use' },
                    { value: 'EMPLOYEE_REPLACEMENT', label: 'Employee Replacement' },
                    { value: 'DAMAGE_LOSS', label: 'Damage / Loss' },
                    { value: 'RETURN', label: 'Return From Event' },
                    { value: 'ADJUSTMENT', label: 'Stock Adjustment', adminOnly: true }
                  ]
                    .filter(option => !option.adminOnly || currentUser.role === 'ADMIN')
                    .map((option) => (
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
                    required
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Encoded By</label>
                  <input
                    type="text"
                    value={currentUser.fullName}
                    disabled
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-500"
                  />
                </div>
              </div>

              {/* Dynamic Sections */}
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 space-y-4">
                {/* 1. EVENT USE */}
                {usageType === 'EVENT' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Target Event *</label>
                        <button
                          type="button"
                          onClick={() => setShowEventAdd(!showEventAdd)}
                          className="text-[9px] text-indigo-600 font-bold hover:underline"
                        >
                          + Quick Register Event
                        </button>
                      </div>

                      {showEventAdd ? (
                        <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg space-y-2">
                          <input
                            type="text"
                            placeholder="Event Name *"
                            value={newEventName}
                            onChange={(e) => setNewEventName(e.target.value)}
                            className="w-full text-[11px] p-1.5 border border-slate-200 bg-white rounded"
                          />
                          <input
                            type="text"
                            placeholder="Client Name *"
                            value={newClientName}
                            onChange={(e) => setNewClientName(e.target.value)}
                            className="w-full text-[11px] p-1.5 border border-slate-200 bg-white rounded"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="date"
                              value={newEventDate}
                              onChange={(e) => setNewEventDate(e.target.value)}
                              className="text-[10px] p-1.5 border border-slate-200 bg-white rounded"
                            />
                            <input
                              type="text"
                              placeholder="Venue *"
                              value={newEventVenue}
                              onChange={(e) => setNewEventVenue(e.target.value)}
                              className="text-[10px] p-1.5 border border-slate-200 bg-white rounded"
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setShowEventAdd(false)} className="text-[9px] text-slate-500">Cancel</button>
                            <button type="button" onClick={handleQuickEventCreate} className="text-[9px] bg-indigo-600 text-white px-2 py-1 rounded">Register</button>
                          </div>
                        </div>
                      ) : (
                        <select
                          value={eventId}
                          onChange={(e) => setEventId(e.target.value)}
                          required
                          className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white"
                        >
                          <option value="">Select event target...</option>
                          {events.map(ev => (
                            <option key={ev.id} value={ev.id}>{ev.eventName} ({ev.clientName})</option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Expected Return Date (Reusable Hardware)</label>
                      <input
                        type="date"
                        value={expectedReturnDate}
                        onChange={(e) => setExpectedReturnDate(e.target.value)}
                        className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}

                {/* 2. OFFICE USE */}
                {usageType === 'OFFICE' && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Office Location / Shelf *</label>
                      <select
                        value={officeLocationId}
                        onChange={(e) => setOfficeLocationId(e.target.value)}
                        required
                        className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white"
                      >
                        <option value="">Select location shelf...</option>
                        {offices.map(o => (
                          <option key={o.id} value={o.id}>{o.locationName} ({o.department})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Office Department *</label>
                      <input
                        type="text"
                        placeholder="e.g. Executive Support"
                        value={officeDept}
                        onChange={(e) => setOfficeDept(e.target.value)}
                        required
                        className="w-full text-xs p-2 border border-slate-200 rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Purpose of Use *</label>
                      <input
                        type="text"
                        placeholder="e.g. Printing, conference backup"
                        value={officePurpose}
                        onChange={(e) => setOfficePurpose(e.target.value)}
                        required
                        className="w-full text-xs p-2 border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>
                )}

                {/* 3. EMPLOYEE REPLACEMENT */}
                {usageType === 'EMPLOYEE_REPLACEMENT' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Employee Recipient *</label>
                        <button
                          type="button"
                          onClick={() => setShowEmployeeAdd(!showEmployeeAdd)}
                          className="text-[9px] text-indigo-600 font-bold hover:underline"
                        >
                          + Register Employee
                        </button>
                      </div>

                      {showEmployeeAdd ? (
                        <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg space-y-2">
                          <input
                            type="text"
                            placeholder="Employee Full Name *"
                            value={newEmployeeName}
                            onChange={(e) => setNewEmployeeName(e.target.value)}
                            className="w-full text-[11px] p-1.5 border border-slate-200 bg-white rounded"
                          />
                          <input
                            type="text"
                            placeholder="Department *"
                            value={newEmployeeDept}
                            onChange={(e) => setNewEmployeeDept(e.target.value)}
                            className="w-full text-[11px] p-1.5 border border-slate-200 bg-white rounded"
                          />
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setShowEmployeeAdd(false)} className="text-[9px] text-slate-500">Cancel</button>
                            <button type="button" onClick={handleQuickEmployeeCreate} className="text-[9px] bg-indigo-600 text-white px-2 py-1 rounded">Register</button>
                          </div>
                        </div>
                      ) : (
                        <select
                          value={employeeId}
                          onChange={(e) => setEmployeeId(e.target.value)}
                          required
                          className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white"
                        >
                          <option value="">Select employee...</option>
                          {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.department})</option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Replacement Reason *</label>
                      <input
                        type="text"
                        placeholder="e.g. Broken or worn out tape"
                        value={employeeReason}
                        onChange={(e) => setEmployeeReason(e.target.value)}
                        required
                        className="w-full text-xs p-2 border border-slate-200 rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Approved By *</label>
                      <input
                        type="text"
                        placeholder="Manager or lead name"
                        value={employeeApprovedBy}
                        onChange={(e) => setEmployeeApprovedBy(e.target.value)}
                        required
                        className="w-full text-xs p-2 border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>
                )}

                {/* 4. DAMAGE / LOSS */}
                {usageType === 'DAMAGE_LOSS' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Damage / Loss Specific Reason *</label>
                      <input
                        type="text"
                        placeholder="e.g. Heavy rain during MOA event tore tape"
                        value={damageReason}
                        onChange={(e) => setDamageReason(e.target.value)}
                        required
                        className="w-full text-xs p-2 border border-slate-200 rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Reported / Discovered By *</label>
                      <input
                        type="text"
                        placeholder="Reporting officer name"
                        value={damageReportedBy}
                        onChange={(e) => setDamageReportedBy(e.target.value)}
                        required
                        className="w-full text-xs p-2 border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>
                )}

                {/* 5. RETURN FROM EVENT */}
                {usageType === 'RETURN' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Original Event Usage Reference *</label>
                      <select
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        required
                        className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white"
                      >
                        <option value="">Select target deployment...</option>
                        {activeEventUsages.map(u => (
                          <option key={u.id} value={u.usageReference}>{u.usageReference} - {u.event?.eventName} ({formatDate(u.usageDate)})</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-400 mt-1">Select the reference of the event dispatch</p>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Returned By / Delivered By *</label>
                      <input
                        type="text"
                        placeholder="Name of event personnel returning the items"
                        value={returnBy}
                        onChange={(e) => setReturnBy(e.target.value)}
                        required
                        className="w-full text-xs p-2 border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>
                )}

                {/* 6. STOCK ADJUSTMENT */}
                {usageType === 'ADJUSTMENT' && (
                  <div className="p-3 bg-red-50 text-red-800 text-xs rounded border border-red-100 flex gap-2">
                    <Info size={16} className="flex-shrink-0 mt-0.5" />
                    <span><strong>Admin Notice:</strong> Stock adjustments manually set input offsets for quantities. Consumables use standard adjustments. Reusables can adjust deployed balances. Use sparingly.</span>
                  </div>
                )}
              </div>

              {/* Items grid selection */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-xs font-bold text-slate-700">Movement Items Selection</h3>
                  {usageType !== 'RETURN' && (
                    <button
                      type="button"
                      onClick={handleAddUsageLine}
                      className="text-[9px] bg-slate-100 text-slate-700 px-2 py-1 rounded border border-slate-200 hover:bg-slate-200 font-bold"
                    >
                      + Add Item line
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {usageLines.map((line, idx) => {
                    const item = items.find(i => i.id === line.orderItemId);
                    const isExceeded = usageType !== 'RETURN' && line.quantity > line.availableLimit;

                    return (
                      <div key={idx} className="flex flex-col md:flex-row gap-3 bg-slate-50/50 p-3 rounded-lg border border-slate-200 items-start md:items-center">
                        <div className="flex-1 w-full">
                          <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Select Item Line</label>
                          <select
                            value={line.orderItemId}
                            onChange={(e) => handleUsageLineChange(idx, 'orderItemId', e.target.value)}
                            required
                            className="w-full text-xs p-2 border border-slate-200 rounded bg-white"
                          >
                            <option value="">Choose item from batch...</option>
                            {items.map(i => (
                              <option key={i.id} value={i.id}>{i.itemName} ({i.itemType} • Avail: {i.qtyAvailable} {i.unit})</option>
                            ))}
                          </select>
                        </div>

                        <div className="w-full md:w-32">
                          <div className="flex justify-between">
                            <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Qty</label>
                            <span className="text-[9px] text-slate-400">Avail: {line.availableLimit}</span>
                          </div>
                          <input
                            type="number"
                            min="1"
                            value={line.quantity}
                            onChange={(e) => handleUsageLineChange(idx, 'quantity', parseInt(e.target.value, 10))}
                            required
                            className={`w-full text-xs p-2 border rounded-lg text-center ${
                              isExceeded ? 'border-red-500 bg-red-50 text-red-900 font-bold' : 'border-slate-200'
                            }`}
                          />
                        </div>

                        <div className="w-full md:w-44">
                          <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Movement Type</label>
                          <select
                            value={line.movementType}
                            onChange={(e) => handleUsageLineChange(idx, 'movementType', e.target.value)}
                            required
                            className="w-full text-xs p-2 border border-slate-200 rounded bg-white"
                          >
                            {usageType === 'RETURN' ? (
                              <option value="RETURNED">RETURNED</option>
                            ) : usageType === 'ADJUSTMENT' ? (
                              <>
                                <option value="ADJUSTMENT_IN">ADJUSTMENT IN (Add)</option>
                                <option value="ADJUSTMENT_OUT">ADJUSTMENT OUT (Deduct)</option>
                              </>
                            ) : (
                              <>
                                <option value="CONSUMED">CONSUMED</option>
                                <option value="TEMPORARY_ISSUE">TEMPORARY ISSUE</option>
                                <option value="REPLACED">REPLACED</option>
                                <option value="DAMAGED">DAMAGED</option>
                                <option value="LOST">LOST</option>
                              </>
                            )}
                          </select>
                        </div>

                        <div className="w-full md:w-32">
                          <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Condition</label>
                          <select
                            value={line.itemCondition}
                            onChange={(e) => handleUsageLineChange(idx, 'itemCondition', e.target.value)}
                            className="w-full text-xs p-2 border border-slate-200 rounded bg-white"
                          >
                            <option value="Good">Good</option>
                            <option value="Needs Repair">Needs Repair</option>
                            <option value="Damaged">Damaged</option>
                          </select>
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
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
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
                type="button"
                onClick={handleSaveUsage}
                className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg font-semibold transition"
              >
                Post Usage Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
