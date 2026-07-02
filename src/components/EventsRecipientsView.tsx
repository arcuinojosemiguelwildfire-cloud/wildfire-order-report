import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, formatDate, dateToInputString } from '../utils/api.ts';
import { Event, Employee, OfficeLocation, Supplier, User } from '../types.ts';
import { Search, Plus, X, Calendar, MapPin, Users, Truck, Check, Edit, AlertCircle } from 'lucide-react';

interface EventsRecipientsViewProps {
  currentUser: User;
}

type SubTab = 'EVENTS' | 'EMPLOYEES' | 'OFFICES' | 'SUPPLIERS';

export default function EventsRecipientsView({ currentUser }: EventsRecipientsViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('EVENTS');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data lists
  const [events, setEvents] = useState<Event[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [offices, setOffices] = useState<OfficeLocation[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Modal open status
  const [isOpen, setIsOpen] = useState(false);

  // Form Fields - Events
  const [eventName, setEventName] = useState('');
  const [clientName, setClientName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventVenue, setEventVenue] = useState('');
  const [eventNotes, setEventNotes] = useState('');

  // Form Fields - Employees
  const [employeeName, setEmployeeName] = useState('');
  const [employeeDept, setEmployeeDept] = useState('');
  const [employeePhone, setEmployeePhone] = useState('');
  const [employeeNotes, setEmployeeNotes] = useState('');

  // Form Fields - Office Locations
  const [locationName, setLocationName] = useState('');
  const [locationDept, setLocationDept] = useState('');
  const [locationDesc, setLocationDesc] = useState('');

  // Form Fields - Suppliers
  const [supplierName, setSupplierName] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierNotes, setSupplierNotes] = useState('');

  const fetchActiveTab = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeSubTab === 'EVENTS') {
        const data = await apiGet('/events');
        setEvents(data);
      } else if (activeSubTab === 'EMPLOYEES') {
        const data = await apiGet('/employees');
        setEmployees(data);
      } else if (activeSubTab === 'OFFICES') {
        const data = await apiGet('/office-locations');
        setOffices(data);
      } else if (activeSubTab === 'SUPPLIERS') {
        const data = await apiGet('/suppliers');
        setSuppliers(data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch reference ledger.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveTab();
  }, [activeSubTab]);

  const handleOpenModal = () => {
    // Reset forms
    setEventName('');
    setClientName('');
    setEventDate(dateToInputString(new Date()));
    setEventVenue('');
    setEventNotes('');

    setEmployeeName('');
    setEmployeeDept('');
    setEmployeePhone('');
    setEmployeeNotes('');

    setLocationName('');
    setLocationDept('');
    setLocationDesc('');

    setSupplierName('');
    setSupplierContact('');
    setSupplierPhone('');
    setSupplierNotes('');

    setIsOpen(true);
  };

  const handleSaveEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (activeSubTab === 'EVENTS') {
        if (!eventName || !clientName || !eventDate || !eventVenue) return;
        await apiPost('/events', {
          eventName,
          clientName,
          eventDate: new Date(eventDate).toISOString(),
          venue: eventVenue,
          status: 'Active',
          notes: eventNotes
        });
      } else if (activeSubTab === 'EMPLOYEES') {
        if (!employeeName || !employeeDept) return;
        await apiPost('/employees', {
          fullName: employeeName,
          department: employeeDept,
          contactNumber: employeePhone,
          isActive: true,
          notes: employeeNotes
        });
      } else if (activeSubTab === 'OFFICES') {
        if (!locationName || !locationDept) return;
        await apiPost('/office-locations', {
          locationName,
          department: locationDept,
          description: locationDesc
        });
      } else if (activeSubTab === 'SUPPLIERS') {
        if (!supplierName || !supplierContact) return;
        await apiPost('/suppliers', {
          supplierName,
          contactPerson: supplierContact,
          contactNumber: supplierPhone,
          notes: supplierNotes
        });
      }

      setIsOpen(false);
      fetchActiveTab();
    } catch (err: any) {
      alert(err.message || 'Failed to record entry.');
    }
  };

  // Local filter for search inputs
  const filteredEvents = events.filter(e => 
    e.eventName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.venue.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredEmployees = employees.filter(e => 
    e.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredOffices = offices.filter(o => 
    o.locationName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredSuppliers = suppliers.filter(s => 
    s.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.contactPerson.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Sub-Tabs Selector and Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-4 border border-slate-200 rounded-xl shadow-xs">
        <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200">
          {[
            { id: 'EVENTS', label: 'Events & Deployments', icon: Calendar },
            { id: 'EMPLOYEES', label: 'Employees / Recipients', icon: Users },
            { id: 'OFFICES', label: 'Office Shelves', icon: MapPin },
            { id: 'SUPPLIERS', label: 'Suppliers Catalog', icon: Truck }
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveSubTab(tab.id as SubTab); setSearchTerm(''); }}
                className={`text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition ${activeSubTab === tab.id ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-900'}`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {currentUser.role === 'ADMIN' && (
          <button
            onClick={handleOpenModal}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-3.5 rounded-xl transition-all duration-150 flex items-center gap-1 shadow-xs cursor-pointer"
          >
            <Plus size={14} />
            <span>Add Registered Entry</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 border border-slate-200 rounded-xl shadow-xs">
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
            <Search size={16} />
          </span>
          <input
            id="recipients_search_input"
            type="text"
            placeholder={`Search ${activeSubTab.toLowerCase()} by key attributes...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 bg-slate-50/50 focus:bg-white transition-all"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 text-xs rounded-xl border border-red-100">
          {error}
        </div>
      )}

      {/* Main Entities Table layout */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          {/* TAB 1. EVENTS */}
          {activeSubTab === 'EVENTS' && (
            <table className="w-full text-left text-xs text-slate-500">
              <thead className="bg-slate-50 text-slate-400 uppercase text-[9px] tracking-wider border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Event Name</th>
                  <th className="py-3 px-4">Client Name</th>
                  <th className="py-3 px-4">Event Date</th>
                  <th className="py-3 px-4">Venue</th>
                  <th className="py-3 px-4">Notes / Remarks</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && events.length === 0 ? (
                  <tr><td colSpan={6} className="py-6 text-center text-slate-400">Loading events...</td></tr>
                ) : filteredEvents.length === 0 ? (
                  <tr><td colSpan={6} className="py-6 text-center text-slate-400">No events registered yet.</td></tr>
                ) : (
                  filteredEvents.map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-50/30 transition">
                      <td className="py-3 px-4 font-bold text-slate-800">{ev.eventName}</td>
                      <td className="py-3 px-4 font-semibold text-slate-600">{ev.clientName}</td>
                      <td className="py-3 px-4 text-slate-500">{formatDate(ev.eventDate)}</td>
                      <td className="py-3 px-4 text-slate-500">{ev.venue}</td>
                      <td className="py-3 px-4 text-slate-400 italic max-w-[200px] truncate">{ev.notes || 'No description.'}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[9px] font-semibold border border-emerald-200">
                          {ev.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* TAB 2. EMPLOYEES */}
          {activeSubTab === 'EMPLOYEES' && (
            <table className="w-full text-left text-xs text-slate-500">
              <thead className="bg-slate-50 text-slate-400 uppercase text-[9px] tracking-wider border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Full Name</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Contact Number</th>
                  <th className="py-3 px-4">Remarks</th>
                  <th className="py-3 px-4 text-center">Active Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && employees.length === 0 ? (
                  <tr><td colSpan={5} className="py-6 text-center text-slate-400">Loading employees...</td></tr>
                ) : filteredEmployees.length === 0 ? (
                  <tr><td colSpan={5} className="py-6 text-center text-slate-400">No employee recipients registered.</td></tr>
                ) : (
                  filteredEmployees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50/30 transition">
                      <td className="py-3 px-4 font-bold text-slate-800">{emp.fullName}</td>
                      <td className="py-3 px-4 text-slate-600 font-semibold">{emp.department}</td>
                      <td className="py-3 px-4 text-slate-500">{emp.contactNumber || 'N/A'}</td>
                      <td className="py-3 px-4 text-slate-400 max-w-[200px] truncate">{emp.notes || '-'}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-semibold border ${
                          emp.isActive ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'
                        }`}>
                          {emp.isActive ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* TAB 3. OFFICES */}
          {activeSubTab === 'OFFICES' && (
            <table className="w-full text-left text-xs text-slate-500">
              <thead className="bg-slate-50 text-slate-400 uppercase text-[9px] tracking-wider border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Location Name / Cabinet Code</th>
                  <th className="py-3 px-4">Owning Office Department</th>
                  <th className="py-3 px-4">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && offices.length === 0 ? (
                  <tr><td colSpan={3} className="py-6 text-center text-slate-400">Loading office shelvings...</td></tr>
                ) : filteredOffices.length === 0 ? (
                  <tr><td colSpan={3} className="py-6 text-center text-slate-400">No custom office locations configured.</td></tr>
                ) : (
                  filteredOffices.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50/30 transition">
                      <td className="py-3 px-4 font-bold text-slate-800">{o.locationName}</td>
                      <td className="py-3 px-4 text-slate-600 font-semibold">{o.department}</td>
                      <td className="py-3 px-4 text-slate-400 italic">{o.description || 'No shelf descriptions.'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* TAB 4. SUPPLIERS */}
          {activeSubTab === 'SUPPLIERS' && (
            <table className="w-full text-left text-xs text-slate-500">
              <thead className="bg-slate-50 text-slate-400 uppercase text-[9px] tracking-wider border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Supplier Corporate Name</th>
                  <th className="py-3 px-4">Contact Person</th>
                  <th className="py-3 px-4">Contact Details</th>
                  <th className="py-3 px-4">Corporate Notes / Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && suppliers.length === 0 ? (
                  <tr><td colSpan={4} className="py-6 text-center text-slate-400">Loading suppliers...</td></tr>
                ) : filteredSuppliers.length === 0 ? (
                  <tr><td colSpan={4} className="py-6 text-center text-slate-400">No corporate suppliers created in system.</td></tr>
                ) : (
                  filteredSuppliers.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/30 transition">
                      <td className="py-3 px-4 font-bold text-slate-800">{s.supplierName}</td>
                      <td className="py-3 px-4 font-medium text-slate-700">{s.contactPerson}</td>
                      <td className="py-3 px-4 text-slate-500">{s.contactNumber}</td>
                      <td className="py-3 px-4 text-slate-400 italic max-w-[200px] truncate">{s.notes || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Creation Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-100 rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Register New: {activeSubTab.slice(0, -1)}
              </h3>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveEntity} className="space-y-4 text-xs text-slate-600">
              {/* 1. EVENTS FORM */}
              {activeSubTab === 'EVENTS' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Event Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Del Monte Global Convention"
                      value={eventName}
                      onChange={(e) => setEventName(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-200 bg-slate-50/50 rounded-lg focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Client Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Del Monte Corp"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-200 bg-slate-50/50 rounded-lg focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Event Date *</label>
                    <input
                      type="date"
                      required
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-200 bg-slate-50/50 rounded-lg focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Venue Location *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. MOA Arena, Pasay"
                      value={eventVenue}
                      onChange={(e) => setEventVenue(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-200 bg-slate-50/50 rounded-lg focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Notes / Description</label>
                    <textarea
                      placeholder="Additional specs..."
                      value={eventNotes}
                      onChange={(e) => setEventNotes(e.target.value)}
                      rows={2}
                      className="w-full text-xs p-2 border border-slate-200 bg-slate-50/50 rounded-lg focus:outline-none focus:border-indigo-500"
                    ></textarea>
                  </div>
                </div>
              )}

              {/* 2. EMPLOYEES FORM */}
              {activeSubTab === 'EMPLOYEES' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Employee Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Juan Dela Cruz"
                      value={employeeName}
                      onChange={(e) => setEmployeeName(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-200 bg-slate-50/50 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Department *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Production Logistics"
                      value={employeeDept}
                      onChange={(e) => setEmployeeDept(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-200 bg-slate-50/50 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Contact Phone</label>
                    <input
                      type="text"
                      placeholder="e.g. +63917822991"
                      value={employeePhone}
                      onChange={(e) => setEmployeePhone(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-200 bg-slate-50/50 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Internal Note</label>
                    <textarea
                      placeholder="e.g. Assigned laptop kit, active crew"
                      value={employeeNotes}
                      onChange={(e) => setEmployeeNotes(e.target.value)}
                      rows={2}
                      className="w-full text-xs p-2 border border-slate-200 bg-slate-50/50 rounded-lg"
                    ></textarea>
                  </div>
                </div>
              )}

              {/* 3. OFFICES FORM */}
              {activeSubTab === 'OFFICES' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Cabinet Code / Location shelf *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Shelf A, Row 2"
                      value={locationName}
                      onChange={(e) => setLocationName(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-200 bg-slate-50/50 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Owning Department *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Logistics Team"
                      value={locationDept}
                      onChange={(e) => setLocationDept(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-200 bg-slate-50/50 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Description</label>
                    <textarea
                      placeholder="e.g. Stores spare items, office cables, gaffers tape shelf"
                      value={locationDesc}
                      onChange={(e) => setLocationDesc(e.target.value)}
                      rows={2}
                      className="w-full text-xs p-2 border border-slate-200 bg-slate-50/50 rounded-lg"
                    ></textarea>
                  </div>
                </div>
              )}

              {/* 4. SUPPLIERS FORM */}
              {activeSubTab === 'SUPPLIERS' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Supplier Corporate Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Manila Sound & Staging Corp"
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-200 bg-slate-50/50 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Contact Person *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Maria Clara"
                      value={supplierContact}
                      onChange={(e) => setSupplierContact(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-200 bg-slate-50/50 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Phone Number *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 02-8812-9900"
                      value={supplierPhone}
                      onChange={(e) => setSupplierPhone(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-200 bg-slate-50/50 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Notes</label>
                    <textarea
                      placeholder="Preferred pricing structures..."
                      value={supplierNotes}
                      onChange={(e) => setSupplierNotes(e.target.value)}
                      rows={2}
                      className="w-full text-xs p-2 border border-slate-200 bg-slate-50/50 rounded-lg"
                    ></textarea>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="text-xs text-slate-500 hover:text-slate-700 px-4 py-2 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg font-semibold transition"
                >
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
