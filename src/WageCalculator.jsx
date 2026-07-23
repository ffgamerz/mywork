import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabaseClient'
import ToastBar from './components/ToastBar'
import { useToast } from './utils/useToast'

export default function WageCalculator({ session, userRole, allowedModules = {} }) {
  const { toast, showToast, hideToast } = useToast()
  const [staffList, setStaffList] = useState([])
  const [loadingStaff, setLoadingStaff] = useState(false)
  const [selectedStaff, setSelectedStaff] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('unpaid') 
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [monthFilter, setMonthFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  
  const [records, setRecords] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [generatedText, setGeneratedText] = useState('')
  const [loading, setLoading] = useState(false)
  const [visibleCount, setVisibleCount] = useState(8)
  const pageSize = 8

  // Tab state
  const [activeTab, setActiveTab] = useState('records') // 'records' or 'history'

  // Modals State
  const [isTextModalOpen, setIsTextModalOpen] = useState(false)
  const [isPaidModalOpen, setIsPaidModalOpen] = useState(false)
  const [customPaidDate, setCustomPaidDate] = useState(new Date().toISOString().split('T')[0])

  // History modal state
  const [selectedPayment, setSelectedPayment] = useState(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)

  // ─── ACCESS CONTROL LOGIC ──────────────────────────────────────────
  const cleanedRole = String(userRole || '').trim().toLowerCase()
  const isSuperAdmin = cleanedRole === 'super_admin'
  
  // Super Admin bypass privilege, while Admin/Staff follow allowedModules configuration
  const hasPageAccess = isSuperAdmin || allowedModules['wageCalculator'] === true || cleanedRole === 'admin'
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (hasPageAccess) fetchStaffList()
  }, [hasPageAccess])

  useEffect(() => {
    if (hasPageAccess) fetchRecords()
  }, [selectedStaff, paymentStatus, dateFrom, dateTo, hasPageAccess])

  useEffect(() => {
    setVisibleCount(8)
  }, [selectedStaff, paymentStatus, dateFrom, dateTo, searchTerm, monthFilter, activeTab])

  if (!hasPageAccess) {
    return (
      <div className="alert-unauthorized">
        <div><span>🔒 Access Denied: Unauthorized.</span></div>
      </div>
    )
  }

  const fetchStaffList = async () => {
    setLoadingStaff(true)
    const { data, error } = await supabase.from('profiles').select('full_name').order('full_name', { ascending: true })
    if (!error && data) setStaffList(data)
    setLoadingStaff(false)
  }

  const fetchRecords = async () => {
    setLoading(true)
    let query = supabase
      .from('stock_productions')
      .select(`
        id,
        batch_no,
        production_date,
        production_name,
        quantity,
        paid_date,
        paid_amount,
        wage_payment_id,
        inventory ( product_name, wage_rate )
      `)
      .order('production_date', { ascending: true })

    if (selectedStaff) query = query.eq('production_name', selectedStaff)

    if (paymentStatus === 'unpaid') {
      query = query.is('paid_date', null)
    } else if (paymentStatus === 'paid') {
      query = query.not('paid_date', 'is', null)
    }

    if (dateFrom) query = query.gte('production_date', dateFrom)
    if (dateTo) query = query.lte('production_date', dateTo)

    const { data, error } = await query
    if (!error && data) setRecords(data)
    setSelectedIds([]) 
    setGeneratedText('')
    setLoading(false)
  }

  // ─── COMPUTE PAYMENT HISTORY FROM RECORDS ─────────────────────────────────
  const paymentHistory = useMemo(() => {
    // Only use paid records
    const paidRecords = records.filter(r => r.paid_date && r.wage_payment_id)
    
    // Group by wage_payment_id
    const grouped = paidRecords.reduce((acc, record) => {
      const paymentId = record.wage_payment_id
      if (!paymentId) return acc
      
      if (!acc[paymentId]) {
        acc[paymentId] = {
          id: paymentId,
          date_paid: record.paid_date,
          total_paid: 0,
          records: []
        }
      }
      acc[paymentId].records.push(record)
      acc[paymentId].total_paid += parseFloat(record.paid_amount || record.inventory?.wage_rate || 0)
      return acc
    }, {})
    
    // Convert to array and sort by date descending
    return Object.values(grouped)
      .sort((a, b) => new Date(b.date_paid) - new Date(a.date_paid))
  }, [records])

  // Filter payment history by search and date
  const filteredHistory = useMemo(() => {
    return paymentHistory.filter(payment => {
      const term = searchTerm.trim().toLowerCase()
      if (term) {
        const hasMatch = payment.records.some(rec => 
          [rec.batch_no, rec.inventory?.product_name].filter(Boolean).join(' ').toLowerCase().includes(term)
        )
        if (!hasMatch) return false
      }
      if (dateFrom && payment.date_paid < dateFrom) return false
      if (dateTo && payment.date_paid > dateTo) return false
      return true
    })
  }, [paymentHistory, searchTerm, dateFrom, dateTo])
  // ──────────────────────────────────────────────────────────────────────────

  const formatLocalDate = (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const handleMonthFilterChange = (value) => {
    setMonthFilter(value)

    if (value === 'all') {
      setDateFrom('')
      setDateTo('')
      return
    }

    const today = new Date()
    const toDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())

    let fromDate = new Date(today.getFullYear(), today.getMonth(), 1)

    if (value === 'last-month') {
      fromDate = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const lastDayOfPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0)
      toDate.setTime(lastDayOfPrevMonth.getTime())
    } else if (value === '3-months') {
      fromDate = new Date(today.getFullYear(), today.getMonth() - 2, 1)
    } else if (value === '6-months') {
      fromDate = new Date(today.getFullYear(), today.getMonth() - 5, 1)
    }

    setDateFrom(formatLocalDate(fromDate))
    setDateTo(formatLocalDate(toDate))
  }

  const handleQuickDate = (range) => {
    const today = new Date()
    let fromDate = new Date()
    if (range === 'week') fromDate.setDate(today.getDate() - 7)
    else if (range === 'month') fromDate.setMonth(today.getMonth() - 1)
    else if (range === 'year') fromDate.setFullYear(today.getFullYear() - 1)

    setDateFrom(formatLocalDate(fromDate))
    setDateTo(formatLocalDate(today))
  }

  const handleResetFilters = () => {
    setSelectedStaff('')
    setPaymentStatus('unpaid')
    setMonthFilter('all')
    setDateFrom('')
    setDateTo('')
    setSearchTerm('')
  }

  const handleSelectRow = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sid => sid !== id))
    } else {
      setSelectedIds([...selectedIds, id])
    }
  }

  const handleSelectAll = () => {
    if (displayRecords.length > 0 && displayRecords.every(r => selectedIds.includes(r.id))) {
      setSelectedIds(selectedIds.filter(id => !displayRecords.some(r => r.id === id)))
    } else {
      setSelectedIds([...new Set([...selectedIds, ...displayRecords.map(r => r.id)])])
    }
  }

  const selectedRecords = records.filter(r => selectedIds.includes(r.id))
  const displayRecords = records.filter((rec) => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return true
    const haystack = [
      rec.batch_no,
      rec.production_name,
      rec.inventory?.product_name,
      rec.inventory?.wage_rate
    ].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(term)
  })
  
  const totalWagesDue = selectedRecords.reduce((sum, item) => {
    return sum + parseFloat(item.inventory?.wage_rate || 0)
  }, 0)

  const visibleRecords = displayRecords.slice(0, visibleCount)
  const visibleHistory = filteredHistory.slice(0, visibleCount)

  const handleMarkAsPaidSubmit = async (e) => {
    e.preventDefault()
    if (selectedIds.length === 0) return

    setLoading(true)

    const { data: paymentData, error: paymentError } = await supabase
      .from('wage_payments')
      .insert([{
        staff_name: selectedStaff || selectedRecords[0]?.production_name || 'Staff',
        total_paid: totalWagesDue,
        date_paid: customPaidDate
      }])
      .select()

    if (paymentError) {
      showToast('Failed to create wage payment record: ' + paymentError.message, 'error')
      setLoading(false)
      return
    }

    const newPaymentId = paymentData[0]?.id

    const updatePromises = selectedRecords.map((rec) => {
      const flatWageRate = parseFloat(rec.inventory?.wage_rate || 0)
      return supabase
        .from('stock_productions')
        .update({ 
          paid_date: customPaidDate, 
          paid_amount: flatWageRate,
          wage_payment_id: newPaymentId
        })
        .eq('id', rec.id)
    })

    const results = await Promise.all(updatePromises)
    const hasUpdateError = results.some(r => r.error)

    if (!hasUpdateError) {
      showToast('Payment recorded successfully!')
      setIsPaidModalOpen(false)
      fetchRecords()
    } else {
      showToast('Failed to update batch production status.', 'error')
    }
    setLoading(false)
  }

  const generateFormatText = () => {
    if (selectedIds.length === 0) {
      showToast('No unpaid batch records found for this staff.', 'error')
      return
    }
    
    let text = `Wage\n${selectedStaff || 'Staff'}\n`
    selectedRecords.forEach((rec) => {
      const [year, month, day] = rec.production_date.split('-')
      const formattedDate = `${parseInt(day)}/${parseInt(month)}/${year}`
      const flatWage = parseFloat(rec.inventory?.wage_rate || 0).toFixed(2)
      text += `\n${rec.inventory?.product_name || 'Product'} (${rec.batch_no})\nDate : ${formattedDate}\nRM${flatWage}\n`
    })

    setGeneratedText(text.trim())
    setIsTextModalOpen(true)
  }

  const copyToClipboard = () => {
    if (!generatedText) return
    navigator.clipboard.writeText(generatedText)
    showToast('Text copied successfully!')
  }

  const handleViewPaymentDetail = (payment) => {
    setSelectedPayment(payment)
    setIsDetailModalOpen(true)
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    const [year, month, day] = dateStr.split('-')
    return `${parseInt(day)}/${parseInt(month)}/${year}`
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    setSelectedIds([])
    setGeneratedText('')
    // Auto-switch payment status filter when switching tabs
    if (tab === 'history') {
      setPaymentStatus('paid')
    } else {
      setPaymentStatus('unpaid')
    }
    setVisibleCount(8)
  }

  return (
    <div className="page-shell">
      <ToastBar toast={toast} onClose={hideToast} />

      {/* PAGE HEADER */}
      <div className="page-header">
        <h1 className="page-title">🧮 Staff Wage Calculator</h1>
        <p className="page-subtitle">Calculate staff wages based on unpaid cooking production batches.</p>
      </div>

      {/* TAB NAVIGATION */}
      <div className="tabs tabs-bordered mb-4">
        <button 
          className={`tab ${activeTab === 'records' ? 'tab-active' : ''}`}
          onClick={() => handleTabChange('records')}
        >
          Batch Records
        </button>
        <button 
          className={`tab ${activeTab === 'history' ? 'tab-active' : ''}`}
          onClick={() => handleTabChange('history')}
        >
          Payment History
        </button>
      </div>

      {/* FILTER PANEL - Show on both tabs */}
      <div className="content-card p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 items-end">
          <div className="form-control w-full">
            <label className="label text-xs font-bold">Staff / Employee</label>
            <select className="select select-bordered w-full font-bold" value={selectedStaff} onChange={(e) => setSelectedStaff(e.target.value)}>
              <option value="">-- All Staff --</option>
              {loadingStaff ? (
                <option disabled>Loading...</option>
              ) : staffList.length === 0 ? (
                <option disabled>No staff available</option>
              ) : (
                staffList.map((staff, idx) => (
                  staff.full_name && <option key={staff.full_name + '-' + idx} value={staff.full_name}>{staff.full_name}</option>
                ))
              )}
            </select>
          </div>
          {activeTab === 'records' && (
            <div className="form-control w-full">
              <label className="label text-xs font-bold">Payment Status</label>
              <select className="select select-bordered w-full font-bold" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
              </select>
            </div>
          )}
          <div className="form-control w-full">
            <label className="label text-xs font-bold">Month Filter</label>
            <select className="select select-bordered w-full font-bold" value={monthFilter} onChange={(e) => handleMonthFilterChange(e.target.value)}>
              <option value="all">All</option>
              <option value="this-month">This Month</option>
              <option value="last-month">Last Month</option>
              <option value="3-months">Last 3 Months</option>
              <option value="6-months">Last 6 Months</option>
            </select>
          </div>
          <div className="form-control w-full">
            <label className="label text-xs font-bold">From Date</label>
            <input type="date" className="input input-bordered w-full text-sm" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="form-control w-full">
            <label className="label text-xs font-bold">To Date</label>
            <input type="date" className="input input-bordered w-full text-sm" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="form-control w-full md:col-span-2">
            <label className="label text-xs font-bold">Search records</label>
            <input type="text" className="input input-bordered w-full text-sm" placeholder="Search records" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={handleResetFilters} className="btn btn-ghost btn-sm">
            Clear Filters
          </button>
        </div>
      </div>

      {/* ─── RECORDS TAB ───────────────────────────────────────────────────── */}
      {activeTab === 'records' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* RECORD TABLE */}
          <div className="lg:col-span-2 content-card p-6 overflow-x-auto">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
              <h3 className="text-lg font-black text-secondary">📦 Batch Records ({displayRecords.length})</h3>
              <div className="flex flex-wrap gap-2">
                <div className="badge badge-outline badge-info gap-2">
                  <span className="opacity-70">Filtered Results:</span>
                  <span className="font-semibold">{displayRecords.length}</span>
                </div>
                <div className="badge badge-outline badge-success gap-2">
                  <span className="opacity-70">Selected:</span>
                  <span className="font-semibold">{selectedIds.length}</span>
                </div>
                <div className={`badge gap-2 ${paymentStatus === 'paid' ? 'badge-success' : 'badge-warning'}`}>
                  <span className="opacity-80">Payment Status:</span>
                  <span className="font-semibold">{paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}</span>
                </div>
              </div>
            </div>
            <table className="table w-full">
              <thead>
                <tr>
                  <th className="w-10">
                    <input type="checkbox" className="checkbox checkbox-sm" checked={displayRecords.length > 0 && displayRecords.every(r => selectedIds.includes(r.id))} onChange={handleSelectAll} />
                  </th>
                  <th>Date</th>
                  <th>Batch No.</th>
                  <th>Product Name (Quantity)</th>
                  <th>Payment Status</th>
                  <th className="text-right">Batch Wage</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="5" className="text-center py-8"><span className="loading loading-spinner text-primary"></span></td></tr>
                ) : displayRecords.length === 0 ? (
                  <tr><td colSpan="6" className="text-center opacity-50 py-8">No batch records found matching the current filter.</td></tr>
                ) : (
                  visibleRecords.map((rec) => {
                    const flatWage = parseFloat(rec.inventory?.wage_rate || 0)
                    const isPaid = Boolean(rec.paid_date)
                    return (
                      <tr key={rec.id} className={`hover ${selectedIds.includes(rec.id) ? 'record-row--selected' : ''} ${isPaid ? 'record-row--paid' : 'record-row--unpaid'}`}>
                        <td>
                          <input type="checkbox" className="checkbox checkbox-sm" checked={selectedIds.includes(rec.id)} onChange={() => handleSelectRow(rec.id)} />
                        </td>
                        <td className="text-xs font-medium">{rec.production_date}</td>
                        <td className="font-mono font-bold text-primary text-xs">{rec.batch_no}</td>
                        <td className="font-bold text-sm">
                          {rec.inventory?.product_name || '-'} <span className="opacity-60 font-normal">({rec.quantity} unit)</span>
                        </td>
                        <td>
                          <span className={`badge ${isPaid ? 'badge-success' : 'badge-warning'} badge-outline`}>{isPaid ? 'Paid' : 'Unpaid'}</span>
                        </td>
                        <td className="text-right font-black text-success">RM {flatWage.toFixed(2)}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>

            {displayRecords.length > 0 && visibleCount < displayRecords.length && (
              <div className="flex justify-center mt-4 pt-4">
                <button 
                  type="button" 
                  className="btn btn-outline btn-primary font-bold"
                  onClick={() => setVisibleCount(prev => Math.min(prev + pageSize, displayRecords.length))}
                >
                  Load More
                </button>
              </div>
            )}
          </div>

          {/* SUMMARY CARD */}
          <div className="content-card p-6 flex flex-col justify-between h-fit space-y-4">
            <div className="space-y-4">
              <h3 className="text-lg font-black text-accent">💰 Selected Summary ({selectedIds.length})</h3>
              <div className="divider my-1"></div>
              <div className="summary-box">
                <span className="text-xs uppercase tracking-wider font-black opacity-50 text-success">Selected Wages Total</span>
                <span className="text-3xl font-black text-success">RM {totalWagesDue.toFixed(2)}</span>
              </div>
              <button onClick={generateFormatText} disabled={selectedIds.length === 0} className="btn btn-accent btn-block text-white font-bold mt-2">
                ⚡ Generate Text Format
              </button>
            </div>

            {paymentStatus === 'unpaid' && selectedIds.length > 0 && (
              <button onClick={() => setIsPaidModalOpen(true)} className="btn btn-success btn-block text-white font-bold">
                ✅ Mark as Paid ({selectedIds.length})
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── PAYMENT HISTORY TAB ───────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="content-card p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <h3 className="text-lg font-black text-secondary">
              📊 Payment History ({filteredHistory.length})
            </h3>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <span className="loading loading-spinner text-primary"></span>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="text-center opacity-50 py-8">
              No payment history found matching the current filters.
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {visibleHistory.map((payment) => (
                  <div 
                    key={payment.id} 
                    className="card bg-base-200 cursor-pointer hover:bg-base-300 transition-colors"
                    onClick={() => handleViewPaymentDetail(payment)}
                  >
                    <div className="card-body p-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="text-xs opacity-60">Payment Date</span>
                          <p className="font-bold text-sm">{formatDate(payment.date_paid)}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs opacity-60">Total Payment</span>
                          <p className="font-black text-lg text-success">RM {payment.total_paid.toFixed(2)}</p>
                        </div>
                      </div>
                      <div className="mt-2">
                        <span className="text-xs opacity-60">Staff: </span>
                        <span className="text-xs font-medium">
                          {payment.records[0]?.production_name || '-'}
                        </span>
                      </div>
                      <div className="mt-1">
                        <span className="text-xs opacity-60">Batches: </span>
                        <span className="text-xs font-medium">
                          {payment.records.map(r => r.batch_no).join(', ')}
                        </span>
                      </div>
                      <div className="mt-1">
                        <span className="text-xs opacity-60">Items: </span>
                        <span className="text-xs font-medium">
                          {payment.records.map(r => r.inventory?.product_name || '-').join(', ')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {filteredHistory.length > 0 && visibleCount < filteredHistory.length && (
                <div className="flex justify-center mt-4 pt-4">
                  <button 
                    type="button" 
                    className="btn btn-outline btn-primary font-bold"
                    onClick={() => setVisibleCount(prev => Math.min(prev + pageSize, filteredHistory.length))}
                  >
                    Load More
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* MODAL JANAAN TEKS */}
      {isTextModalOpen && (
        <div className="modal modal-open z-50">
          <div className="modal-backdrop" onClick={() => setIsTextModalOpen(false)}></div>
          <div className="modal-box--md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-xl text-primary mb-3">📋 Wage Text Copy</h3>
            <pre className="p-4 bg-base-300 rounded-xl text-xs font-mono whitespace-pre-wrap max-h-64 overflow-y-auto border border-base-200 select-all">
              {generatedText}
            </pre>
            <div className="modal-action gap-2 border-t border-base-200 pt-3">
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setIsTextModalOpen(false)}>Cancel</button>
              <button type="button" onClick={copyToClipboard} className="btn btn-sm btn-primary font-bold px-4">Copy Text</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MARK AS PAID */}
      {isPaidModalOpen && (
        <div className="modal modal-open z-50">
          <div className="modal-backdrop" onClick={() => setIsPaidModalOpen(false)}></div>
          <div className="modal-box--sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-xl text-success mb-2">💸 Confirm Payment</h3>
            <p className="text-xs opacity-70 mb-4">Please review the payment date before saving it as a master transaction record.</p>
            <form onSubmit={handleMarkAsPaidSubmit} className="space-y-4">
              <div className="form-control">
                <label className="label-text font-bold mb-1 text-xs">Payment Date (Date Paid)</label>
                <input type="date" required className="input input-bordered w-full font-bold text-base" value={customPaidDate} onChange={(e) => setCustomPaidDate(e.target.value)} />
              </div>
              <div className="payment-summary">
                <span className="text-xs block opacity-60 font-semibold">Total Wages to Transfer</span>
                <span className="text-xl font-black text-success">RM {totalWagesDue.toFixed(2)}</span>
              </div>
              <div className="modal-action gap-2 border-t border-base-200 pt-3">
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setIsPaidModalOpen(false)}>Cancel</button>
                <button type="submit" disabled={loading} className="btn btn-sm btn-success text-white font-bold px-4">Confirm & Pay</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PAYMENT DETAIL MODAL */}
      {isDetailModalOpen && selectedPayment && (
        <div className="modal modal-open z-50">
          <div className="modal-backdrop" onClick={() => setIsDetailModalOpen(false)}></div>
          <div className="modal-box--md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-xl text-primary mb-3">
              📋 Payment Details
            </h3>
            
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs opacity-60">Payment Date</span>
                <span className="font-bold">{formatDate(selectedPayment.date_paid)}</span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs opacity-60">Staff</span>
                <span className="font-bold">{selectedPayment.records[0]?.production_name || '-'}</span>
              </div>
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs opacity-60">Total Payment</span>
                <span className="font-black text-lg text-success">RM {selectedPayment.total_paid.toFixed(2)}</span>
              </div>
            </div>

            <div className="divider my-2">Batch Records</div>

            <div className="max-h-64 overflow-y-auto">
              <table className="table table-sm w-full">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Batch No.</th>
                    <th>Product Name</th>
                    <th className="text-right">Batch Wage</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPayment.records.map((rec) => {
                    const wage = parseFloat(rec.paid_amount || rec.inventory?.wage_rate || 0)
                    return (
                      <tr key={rec.id}>
                        <td className="text-xs">{rec.production_date}</td>
                        <td className="font-mono text-xs">{rec.batch_no}</td>
                        <td className="text-xs">{rec.inventory?.product_name || '-'}</td>
                        <td className="text-right font-bold text-success">RM {wage.toFixed(2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="modal-action gap-2 border-t border-base-200 pt-3">
              <button 
                type="button" 
                className="btn btn-sm btn-ghost" 
                onClick={() => setIsDetailModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}