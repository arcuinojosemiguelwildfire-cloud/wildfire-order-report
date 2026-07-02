import React, { useState, useEffect } from 'react';
import { apiGet, formatDate } from '../utils/api.ts';
import { FileSpreadsheet, Search, Filter, Calendar, RefreshCw } from 'lucide-react';

type ReportType =
  | 'USAGE_BY_EVENT'
  | 'USAGE_BY_ITEM'
  | 'USAGE_BY_DEPT'
  | 'EMPLOYEE_REPLACEMENT'
  | 'DAMAGED_LOST'
  | 'REUSABLES_PENDING_RETURN'
  | 'ORDER_BALANCES'
  | 'LOW_STOCK';

export default function ReportsView() {
  const [activeReport, setActiveReport] = useState<ReportType>('USAGE_BY_EVENT');
  const [reportData, setReportData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      let endpoint = '';
      if (activeReport === 'USAGE_BY_EVENT') endpoint = '/reports/usages-by-event';
      else if (activeReport === 'USAGE_BY_ITEM') endpoint = '/reports/usages-by-item';
      else if (activeReport === 'USAGE_BY_DEPT') endpoint = '/reports/usages-by-dept';
      else if (activeReport === 'EMPLOYEE_REPLACEMENT') endpoint = '/reports/employee-replacements';
      else if (activeReport === 'DAMAGED_LOST') endpoint = '/reports/damaged-lost-items';
      else if (activeReport === 'REUSABLES_PENDING_RETURN') endpoint = '/reports/reusable-pending-return';
      else if (activeReport === 'ORDER_BALANCES') endpoint = '/reports/items-balances';
      else if (activeReport === 'LOW_STOCK') endpoint = '/reports/items-balances'; // will filter below

      let queryParams = [];
      if (startDate) queryParams.push(`startDate=${encodeURIComponent(new Date(startDate).toISOString())}`);
      if (endDate) queryParams.push(`endDate=${encodeURIComponent(new Date(endDate).toISOString())}`);

      const queryStr = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
      let data = await apiGet(`${endpoint}${queryStr}`);

      // Post-filter for Low Stock if needed
      if (activeReport === 'LOW_STOCK') {
        data = data.filter((item: any) => item.qtyAvailable <= item.minimumStock || item.qtyAvailable === 0);
      }

      setReportData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to generate report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [activeReport, startDate, endDate]);

  // Clientside Excel/CSV exporter
  const handleExportCSV = () => {
    if (reportData.length === 0) {
      alert('No data available to export.');
      return;
    }

    let headers: string[] = [];
    let rows: any[] = [];

    if (activeReport === 'USAGE_BY_EVENT') {
      headers = ['Usage Ref', 'Date', 'Event Name', 'Client', 'Item Name', 'Item Type', 'Quantity', 'Unit', 'Condition', 'Recorded By'];
      rows = reportData.map(r => [
        r.usageReference,
        formatDate(r.usageDate),
        r.eventName,
        r.clientName,
        r.itemName,
        r.itemType,
        r.quantity,
        r.unit,
        r.itemCondition,
        r.createdBy
      ]);
    } else if (activeReport === 'USAGE_BY_ITEM') {
      headers = ['Item Name', 'Type', 'Movement Type', 'Quantity Transacted', 'Occurrences'];
      rows = reportData.map(r => [
        r.itemName,
        r.itemType,
        r.movementType,
        r.quantityTransacted,
        r.occurrences
      ]);
    } else if (activeReport === 'USAGE_BY_DEPT') {
      headers = ['Department', 'Item Name', 'Type', 'Quantity Consumed', 'Transaction Count'];
      rows = reportData.map(r => [
        r.department,
        r.itemName,
        r.itemType,
        r.quantityConsumed,
        r.txCount
      ]);
    } else if (activeReport === 'EMPLOYEE_REPLACEMENT') {
      headers = ['Usage Ref', 'Date', 'Employee Name', 'Department', 'Item Name', 'Quantity', 'Unit', 'Replacement Reason', 'Recorded By'];
      rows = reportData.map(r => [
        r.usageReference,
        formatDate(r.usageDate),
        r.employeeName,
        r.department,
        r.itemName,
        r.quantity,
        r.unit,
        r.reason,
        r.createdBy
      ]);
    } else if (activeReport === 'DAMAGED_LOST') {
      headers = ['Usage Ref', 'Date', 'Item Name', 'Quantity', 'Unit', 'Condition', 'Incident notes', 'Encoded By'];
      rows = reportData.map(r => [
        r.usageReference,
        formatDate(r.usageDate),
        r.itemName,
        r.quantity,
        r.unit,
        r.itemCondition,
        r.notes,
        r.createdBy
      ]);
    } else if (activeReport === 'REUSABLES_PENDING_RETURN') {
      headers = ['Item Name', 'Order No', 'Target Event', 'Expected Return Date', 'Quantity Deployed', 'Quantity Returned', 'Outstanding Balance'];
      rows = reportData.map(r => [
        r.itemName,
        r.orderNumber,
        r.eventName,
        formatDate(r.expectedReturnDate),
        r.qtyDeployed,
        r.qtyReturned,
        r.qtyPending
      ]);
    } else if (activeReport === 'ORDER_BALANCES' || activeReport === 'LOW_STOCK') {
      headers = ['Item Name', 'Order Number', 'Category', 'Type', 'Qty Received', 'Qty Used', 'Qty Deployed', 'Qty Returned', 'Qty Available', 'Min Stock', 'Shelf Location', 'Item Status'];
      rows = reportData.map(r => [
        r.itemName,
        r.orderNumber,
        r.category,
        r.itemType,
        r.quantityReceived,
        r.qtyUsed,
        r.qtyDeployed,
        r.qtyReturned,
        r.qtyAvailable,
        r.minimumStock,
        r.storageLocation,
        r.liveStatus
      ]);
    }

    // Convert rows to CSV format
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map((val: any) => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${activeReport.toLowerCase()}_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Perform client side text searching on results
  const getFilteredData = () => {
    if (!searchTerm) return reportData;
    const term = searchTerm.toLowerCase();

    if (activeReport === 'USAGE_BY_EVENT') {
      return reportData.filter(r =>
        r.usageReference.toLowerCase().includes(term) ||
        r.eventName.toLowerCase().includes(term) ||
        r.clientName.toLowerCase().includes(term) ||
        r.itemName.toLowerCase().includes(term)
      );
    } else if (activeReport === 'USAGE_BY_ITEM') {
      return reportData.filter(r => r.itemName.toLowerCase().includes(term));
    } else if (activeReport === 'USAGE_BY_DEPT') {
      return reportData.filter(r => r.department.toLowerCase().includes(term) || r.itemName.toLowerCase().includes(term));
    } else if (activeReport === 'EMPLOYEE_REPLACEMENT') {
      return reportData.filter(r => r.employeeName.toLowerCase().includes(term) || r.itemName.toLowerCase().includes(term));
    } else if (activeReport === 'DAMAGED_LOST') {
      return reportData.filter(r => r.itemName.toLowerCase().includes(term) || r.usageReference.toLowerCase().includes(term));
    } else if (activeReport === 'REUSABLES_PENDING_RETURN') {
      return reportData.filter(r => r.itemName.toLowerCase().includes(term) || r.eventName.toLowerCase().includes(term));
    } else {
      return reportData.filter(r => r.itemName.toLowerCase().includes(term) || r.orderNumber.toLowerCase().includes(term));
    }
  };

  const visibleData = getFilteredData();

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 border border-slate-200 rounded-xl shadow-xs">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">Custom Reports</h1>
          <p className="text-xs text-slate-500 mt-0.5">Filter, audit, and extract supply datasets directly to spreadsheets</p>
        </div>

        <button
          onClick={handleExportCSV}
          className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-3.5 rounded-xl transition-all duration-150 flex items-center gap-1.5 self-start shadow-xs cursor-pointer"
        >
          <FileSpreadsheet size={14} />
          <span>Export Filtered CSV</span>
        </button>
      </div>

      {/* Grid containing Report list and Filters */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Left Side: Report Types Selector */}
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs space-y-1.5 self-start">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-3 pl-1">Available Audits</span>
          {[
            { id: 'USAGE_BY_EVENT', label: '1. Usage by Event' },
            { id: 'USAGE_BY_ITEM', label: '2. Usage by Item' },
            { id: 'USAGE_BY_DEPT', label: '3. Usage by Office Department' },
            { id: 'EMPLOYEE_REPLACEMENT', label: '4. Employee Replacements' },
            { id: 'DAMAGED_LOST', label: '5. Damaged or Lost Items' },
            { id: 'REUSABLES_PENDING_RETURN', label: '6. Reusable Pending Returns' },
            { id: 'ORDER_BALANCES', label: '7. Complete Order Balances' },
            { id: 'LOW_STOCK', label: '8. Low Stock Warnings' }
          ].map((r) => (
            <button
              key={r.id}
              onClick={() => { setActiveReport(r.id as ReportType); setSearchTerm(''); }}
              className={`w-full text-left text-xs p-2.5 rounded-xl font-medium transition-all ${
                activeReport === r.id
                  ? 'bg-indigo-50/80 text-indigo-700 border-l-4 border-indigo-600 pl-2.5 font-semibold shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Right Side: Filters & Generated Table */}
        <div className="xl:col-span-3 space-y-4">
          <div className="bg-white p-4 border border-slate-200 rounded-xl shadow-xs grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                <Search size={15} />
              </span>
              <input
                id="reports_search_input"
                type="text"
                placeholder="Search generated report columns..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-none focus:border-indigo-500 transition-all"
              />
            </div>

            <div className="flex gap-2 items-center md:col-span-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full text-xs p-1.5 border border-slate-200 bg-slate-50 rounded-xl focus:outline-none"
              />
              <span className="text-[10px] text-slate-400 font-bold uppercase">To</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full text-xs p-1.5 border border-slate-200 bg-slate-50 rounded-xl focus:outline-none"
              />
              <button
                onClick={fetchReport}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-indigo-600 transition cursor-pointer"
                title="Regenerate Report"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 text-red-700 text-xs rounded-xl border border-red-100">
              {error}
            </div>
          )}

          {/* Generated Data Sheet */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              {loading ? (
                <div className="p-12 text-center text-slate-400 text-xs">Generating secure audit dataset...</div>
              ) : visibleData.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">No records correspond to the chosen filters.</div>
              ) : (
                <table className="w-full text-left text-xs text-slate-500">
                  <thead className="bg-slate-50 text-slate-400 uppercase text-[9px] tracking-wider border-b border-slate-200">
                    {/* USAGE BY EVENT HEADER */}
                    {activeReport === 'USAGE_BY_EVENT' && (
                      <tr>
                        <th className="py-2.5 px-3">Usage Ref</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Event Name</th>
                        <th className="py-2.5 px-3">Client</th>
                        <th className="py-2.5 px-3">Item Name</th>
                        <th className="py-2.5 px-3 text-center">Type</th>
                        <th className="py-2.5 px-3 text-center">Qty Issued</th>
                        <th className="py-2.5 px-3">Condition</th>
                        <th className="py-2.5 px-3">Recorded By</th>
                      </tr>
                    )}

                    {/* USAGE BY ITEM HEADER */}
                    {activeReport === 'USAGE_BY_ITEM' && (
                      <tr>
                        <th className="py-2.5 px-3">Item Name</th>
                        <th className="py-2.5 px-3">Item Type</th>
                        <th className="py-2.5 px-3">Movement Type</th>
                        <th className="py-2.5 px-3 text-center">Total Quantity Transacted</th>
                        <th className="py-2.5 px-3 text-center">Transaction Occurrences</th>
                      </tr>
                    )}

                    {/* USAGE BY DEPT HEADER */}
                    {activeReport === 'USAGE_BY_DEPT' && (
                      <tr>
                        <th className="py-2.5 px-3">Department</th>
                        <th className="py-2.5 px-3">Item Name</th>
                        <th className="py-2.5 px-3 text-center">Type</th>
                        <th className="py-2.5 px-3 text-center">Total Quantity Consumed</th>
                        <th className="py-2.5 px-3 text-center">Total Logs</th>
                      </tr>
                    )}

                    {/* EMPLOYEE REPLACEMENT HEADER */}
                    {activeReport === 'EMPLOYEE_REPLACEMENT' && (
                      <tr>
                        <th className="py-2.5 px-3">Usage Ref</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Employee Name</th>
                        <th className="py-2.5 px-3">Department</th>
                        <th className="py-2.5 px-3">Item Name</th>
                        <th className="py-2.5 px-3 text-center">Quantity</th>
                        <th className="py-2.5 px-3">Replacement Reason</th>
                        <th className="py-2.5 px-3">Encoded By</th>
                      </tr>
                    )}

                    {/* DAMAGED LOST HEADER */}
                    {activeReport === 'DAMAGED_LOST' && (
                      <tr>
                        <th className="py-2.5 px-3">Usage Ref</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Item Name</th>
                        <th className="py-2.5 px-3 text-center">Quantity</th>
                        <th className="py-2.5 px-3">Movement Condition</th>
                        <th className="py-2.5 px-3">Audit Details / Notes</th>
                        <th className="py-2.5 px-3">Encoded By</th>
                      </tr>
                    )}

                    {/* REUSABLES PENDING RETURN HEADER */}
                    {activeReport === 'REUSABLES_PENDING_RETURN' && (
                      <tr>
                        <th className="py-2.5 px-3">Reusable Item Name</th>
                        <th className="py-2.5 px-3">Order Code</th>
                        <th className="py-2.5 px-3">Target Event</th>
                        <th className="py-2.5 px-3">Expected Return Date</th>
                        <th className="py-2.5 px-3 text-center">Qty Deployed</th>
                        <th className="py-2.5 px-3 text-center">Qty Returned</th>
                        <th className="py-2.5 px-3 text-center">Qty Outstanding</th>
                      </tr>
                    )}

                    {/* COMPLETE STOCK BALANCES / LOW STOCK HEADER */}
                    {(activeReport === 'ORDER_BALANCES' || activeReport === 'LOW_STOCK') && (
                      <tr>
                        <th className="py-2.5 px-3">Item Name</th>
                        <th className="py-2.5 px-3">Order Code</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3 text-center">Type</th>
                        <th className="py-2.5 px-3 text-center">Received</th>
                        <th className="py-2.5 px-3 text-center">Used</th>
                        <th className="py-2.5 px-3 text-center">Deployed</th>
                        <th className="py-2.5 px-3 text-center">Available</th>
                        <th className="py-2.5 px-3">Cabinet Shelf</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    )}
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* USAGE BY EVENT DATA */}
                    {activeReport === 'USAGE_BY_EVENT' && visibleData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/30">
                        <td className="py-2.5 px-3 font-semibold text-slate-800">{row.usageReference}</td>
                        <td className="py-2.5 px-3">{formatDate(row.usageDate)}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-700">{row.eventName}</td>
                        <td className="py-2.5 px-3 text-slate-500">{row.clientName}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-800">{row.itemName}</td>
                        <td className="py-2.5 px-3 text-center text-[10px] text-indigo-600 font-semibold">{row.itemType}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-800">{row.quantity} {row.unit}</td>
                        <td className="py-2.5 px-3">{row.itemCondition}</td>
                        <td className="py-2.5 px-3">{row.createdBy}</td>
                      </tr>
                    ))}

                    {/* USAGE BY ITEM DATA */}
                    {activeReport === 'USAGE_BY_ITEM' && visibleData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/30">
                        <td className="py-2.5 px-3 font-bold text-slate-800">{row.itemName}</td>
                        <td className="py-2.5 px-3 text-[10px] text-indigo-600 font-semibold">{row.itemType}</td>
                        <td className="py-2.5 px-3 font-medium">{row.movementType}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-800">{row.quantityTransacted}</td>
                        <td className="py-2.5 px-3 text-center font-medium">{row.occurrences}</td>
                      </tr>
                    ))}

                    {/* USAGE BY DEPT DATA */}
                    {activeReport === 'USAGE_BY_DEPT' && visibleData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/30">
                        <td className="py-2.5 px-3 font-bold text-slate-800">{row.department}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-600">{row.itemName}</td>
                        <td className="py-2.5 px-3 text-center text-[10px] text-indigo-600 font-semibold">{row.itemType}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-800">{row.quantityConsumed}</td>
                        <td className="py-2.5 px-3 text-center">{row.txCount}</td>
                      </tr>
                    ))}

                    {/* EMPLOYEE REPLACEMENT DATA */}
                    {activeReport === 'EMPLOYEE_REPLACEMENT' && visibleData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/30">
                        <td className="py-2.5 px-3 font-semibold text-slate-800">{row.usageReference}</td>
                        <td className="py-2.5 px-3">{formatDate(row.usageDate)}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-800">{row.employeeName}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-600">{row.department}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-700">{row.itemName}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-800">{row.quantity} {row.unit}</td>
                        <td className="py-2.5 px-3 italic">{row.reason}</td>
                        <td className="py-2.5 px-3">{row.createdBy}</td>
                      </tr>
                    ))}

                    {/* DAMAGED LOST DATA */}
                    {activeReport === 'DAMAGED_LOST' && visibleData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/30">
                        <td className="py-2.5 px-3 font-semibold text-slate-800">{row.usageReference}</td>
                        <td className="py-2.5 px-3">{formatDate(row.usageDate)}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-800">{row.itemName}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-red-600">{row.quantity} {row.unit}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="bg-red-50 text-red-700 border border-red-100 px-1.5 py-0.5 rounded text-[9px] font-semibold">
                            {row.itemCondition}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 italic max-w-[200px] truncate">{row.notes}</td>
                        <td className="py-2.5 px-3">{row.createdBy}</td>
                      </tr>
                    ))}

                    {/* REUSABLES PENDING RETURN DATA */}
                    {activeReport === 'REUSABLES_PENDING_RETURN' && visibleData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/30">
                        <td className="py-2.5 px-3 font-bold text-slate-800">{row.itemName}</td>
                        <td className="py-2.5 px-3 text-indigo-600 font-semibold">{row.orderNumber}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-700">{row.eventName}</td>
                        <td className="py-2.5 px-3 font-medium text-amber-600">{formatDate(row.expectedReturnDate)}</td>
                        <td className="py-2.5 px-3 text-center font-semibold">{row.qtyDeployed}</td>
                        <td className="py-2.5 px-3 text-center font-semibold text-teal-600">{row.qtyReturned}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-red-600 bg-red-50/20">{row.qtyPending}</td>
                      </tr>
                    ))}

                    {/* COMPLETE STOCK BALANCES / LOW STOCK DATA */}
                    {(activeReport === 'ORDER_BALANCES' || activeReport === 'LOW_STOCK') && visibleData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/30">
                        <td className="py-2.5 px-3 font-bold text-slate-800">{row.itemName}</td>
                        <td className="py-2.5 px-3 text-indigo-600 font-medium">{row.orderNumber}</td>
                        <td className="py-2.5 px-3 text-slate-500">{row.category}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-1 rounded text-[8px] font-bold ${
                            row.itemType === 'REUSABLE' ? 'bg-sky-50 text-sky-700 border' : 'bg-orange-50 text-orange-700 border'
                          }`}>
                            {row.itemType}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-semibold">{row.quantityReceived}</td>
                        <td className="py-2.5 px-3 text-center font-semibold text-amber-600">{row.qtyUsed}</td>
                        <td className="py-2.5 px-3 text-center font-semibold text-blue-600">{row.qtyDeployed}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-emerald-600 bg-emerald-50/20">{row.qtyAvailable}</td>
                        <td className="py-2.5 px-3">{row.storageLocation}</td>
                        <td className="py-2.5 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold border ${
                            row.liveStatus === 'In Stock' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                            row.liveStatus === 'Low Stock' ? 'bg-amber-50 border-amber-100 text-amber-700' :
                            row.liveStatus === 'Out of Stock' || row.liveStatus === 'Fully Used' ? 'bg-red-50 border-red-100 text-red-700' :
                            'bg-blue-50 border-blue-100 text-blue-700'
                          }`}>
                            {row.liveStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
