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

  const [activeTab, setActiveTab] = useState('records')
  const [isTextModalOpen, setIsTextModalOpen] = useState(false)
  const [isPaidModalOpen, setIsPaidModalOpen] = useState(false)
  const [customPaidDate, setCustomPaidDate] = useState(new Date().toISOString().split('T')[0])
  const [selectedPayment, setSelectedPayment] = useState(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)

  const cleanedRole = String(userRole || '').trim().toLowerCase()
  const isSuperAdmin = cleanedRole === 'super_admin'
  const hasPageAccess = isSuperAdmin || allowedModules['wageCalculator'] === true || cleanedRole === 'admin'

  useEffect(() => { if (hasPageAccess) fetchStaffList() }, [hasPageAccess])
  useEffect(() => { if (hasPageAccess) fetchRecords() }, [selectedStaff, paymentStatus, dateFrom, dateTo, hasPageAccess])
  useEffect(() => { setVisibleCount(8) }, [selectedStaff, paymentStatus, dateFrom, dateTo, searchTerm, monthFilter, activeTab])

  if (!hasPageAccess) {
    return <div className="alert-unauthorized"><span>🔒 Access Denied: Unauthorized.</span></div>
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
      .select(`id, batch_no, production_date, production_name, quantity, paid_date, paid_amount, wage_payment_id, inventory ( product_name, wage_rate )`)
      .order('production_date', { ascending: true })
    if (selectedStaff) query = query.eq('production_name', selectedStaff)
    if (paymentStatus === 'unpaid') query = query.is('paid_date', null)
    else if (paymentStatus === 'paid') query = query.not('paid_date', 'is', null)
    if (dateFrom) query = query.gte('production_date', dateFrom)
    if (dateTo) query = query.lte('production_date', dateTo)
    const { data, error } = await query
    if (!error && data) setRecords(data)
    setSelectedIds([]); setGeneratedText(''); setLoading(false)
  }

  const paymentHistory = useMemo(() => {
    const paidRecords = records.filter(r => r.paid_date && r.wage_payment_id)
    const grouped = paidRecords.reduce((acc, record) => {
      const paymentId = record.wage_payment_id
      if (!paymentId) return acc
      if (!acc[paymentId]) acc[paymentId] = { id: paymentId, date_paid: record.paid_date, total_paid: 0, records: [] }
      acc[paymentId].records.push(record)
      acc[paymentId].total_paid += parseFloat(record.paid_amount || record.inventory?.wage_rate || 0)
      return acc
    }, {})
    return Object.values(grouped).sort((a, b) => new Date(b.date_paid) - new Date(a.date_paid))
  }, [records])

  const filteredHistory = useMemo(() => {
    return paymentHistory.filter(payment => {
      const term = searchTerm.trim().toLowerCase()
      if (term) {
        const hasMatch = payment.records.some(rec => [rec.batch_no, rec.inventory?.product_name].filter(Boolean).join(' ').toLowerCase().includes(term))
        if (!hasMatch) return false
      }
      if (dateFrom && payment.date_paid < dateFrom) return false
      if (dateTo && payment.date_paid > dateTo) return false
      return true
    })
  }, [paymentHistory, searchTerm, dateFrom, dateTo])

  const formatLocalDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

  const handleMonthFilterChange = (value) => {
    setMonthFilter(value)
    if (value === 'all') { setDateFrom(''); setDateTo(''); return }
    const today = new Date()
    const toDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    let fromDate = new Date(today.getFullYear(), today.getMonth(), 1)
    if (value === 'last-month') { fromDate = new Date(today.getFullYear(), today.getMonth() - 1, 1); toDate.setTime(new Date(today.getFullYear(), today.getMonth(), 0).getTime()) }
    else if (value === '3-months') fromDate = new Date(today.getFullYear(), today.getMonth() - 2, 1)
    else if (value === '6-months') fromDate = new Date(today.getFullYear(), today.getMonth() - 5, 1)
    setDateFrom(formatLocalDate(fromDate)); setDateTo(formatLocalDate(toDate))
  }

  const handleQuickDate = (range) => {
    const today = new Date(); let fromDate = new Date()
    if (range === 'week') fromDate.setDate(today.getDate() - 7)
    else if (range === 'month') fromDate.setMonth(today.getMonth() - 1)
    else if (range === 'year') fromDate.setFullYear(today.getFullYear() - 1)
    setDateFrom(formatLocalDate(fromDate)); setDateTo(formatLocalDate(today))
  }

  const handleResetFilters = () => { setSelectedStaff(''); setPaymentStatus('unpaid'); setMonthFilter('all'); setDateFrom(''); setDateTo(''); setSearchTerm('') }

  const handleSelectRow = (id) => { setSelectedIds(prev => prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]) }

  const handleSelectAll = () => {
    if (displayRecords.length > 0 && displayRecords.every(r => selectedIds.includes(r.id))) setSelectedIds(selectedIds.filter(id => !displayRecords.some(r => r.id === id)))
    else setSelectedIds([...new Set([...selectedIds, ...displayRecords.map(r => r.id)])])
  }

  const selectedRecords = records.filter(r => selectedIds.includes(r.id))
  const displayRecords = records.filter((rec) => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return true
    return [rec.batch_no, rec.production_name, rec.inventory?.product_name, rec.inventory?.wage_rate].filter(Boolean).join(' ').toLowerCase().includes(term)
  })
  
  const totalWagesDue = selectedRecords.reduce((sum, item) => sum + parseFloat(item.inventory?.wage_rate || 0), 0)
  const visibleRecords = displayRecords.slice(0, visibleCount)
  const visibleHistory = filteredHistory.slice(0, visibleCount)

  const handleMarkAsPaidSubmit = async (e) => {
    e.preventDefault()
    if (selectedIds.length === 0) return
    setLoading(true)
    const { data: paymentData, error: paymentError } = await supabase.from('wage_payments').insert([{ staff_name: selectedStaff || selectedRecords[0]?.production_name || 'Staff', total_paid: totalWagesDue, date_paid: customPaidDate }]).select()
    if (paymentError) { showToast('Failed: ' + paymentError.message, 'error'); setLoading(false); return }
    const newPaymentId = paymentData[0]?.id
    const results = await Promise.all(selectedRecords.map(rec => supabase.from('stock_productions').update({ paid_date: customPaidDate, paid_amount: parseFloat(rec.inventory?.wage_rate || 0), wage_payment_id: newPaymentId }).eq('id', rec.id)))
    if (!results.some(r => r.error)) { showToast('Payment recorded!'); setIsPaidModalOpen(false); fetchRecords() }
    else showToast('Failed to update batch.', 'error')
    setLoading(false)
  }

  const generateFormatText = () => {
    if (selectedIds.length === 0) { showToast('No unpaid batch records found.', 'error'); return }
    let text = `Wage\n${selectedStaff || 'Staff'}\n`
    selectedRecords.forEach(rec => {
      const [y, m, d] = rec.production_date.split('-')
      const flatWage = parseFloat(rec.inventory?.wage_rate || 0).toFixed(2)
      text += `\n${rec.inventory?.product_name || 'Product'} (${rec.batch_no})\nDate : ${parseInt(d)}/${parseInt(m)}/${y}\nRM${flatWage}\n`
    })
    setGeneratedText(text.trim()); setIsTextModalOpen(true)
  }

  const copyToClipboard = () => { if (!generatedText) return; navigator.clipboard.writeText(generatedText); showToast('Text copied!') }

  const handleViewPaymentDetail = (payment) => { setSelectedPayment(payment); setIsDetailModalOpen(true) }

  const formatDate = (dateStr) => { if (!dateStr) return '-'; const [y, m, d] = dateStr.split('-'); return `${parseInt(d)}/${parseInt(m)}/${y}` }

  const handleTabChange = (tab) => { setActiveTab(tab); setSelectedIds([]); setGeneratedText(''); setPaymentStatus(tab === 'history' ? 'paid' : 'unpaid'); setVisibleCount(8) }

  return (
    <div>
      <ToastBar toast={toast} onClose={hideToast} />
      <div className="page-header-custom">
        <h1 className="page-title-custom">🧮 Staff Wage Calculator</h1>
        <p className="page-subtitle-custom">Calculate staff wages based on unpaid cooking production batches.</p>
      </div>

      <ul className="nav nav-tabs mb-3">
        <li className="nav-item"><button className={`nav-link ${activeTab === 'records' ? 'active' : ''}`} onClick={() => handleTabChange('records')}>Batch Records</button></li>
        <li className="nav-item"><button className={`nav-link ${activeTab === 'history' ? 'active' : ''}`} onClick={() => handleTabChange('history')}>Payment History</button></li>
      </ul>

      <div className="card p-3 mb-3">
        <div className="row g-3">
          <div className="col-md">
            <label className="form-label">Staff / Employee</label>
            <select className="form-select fw-bold" value={selectedStaff} onChange={(e) => setSelectedStaff(e.target.value)}>
              <option value="">-- All Staff --</option>
              {loadingStaff ? <option disabled>Loading...</option> : staffList.length === 0 ? <option disabled>No staff available</option> : staffList.map((staff, idx) => staff.full_name && <option key={idx} value={staff.full_name}>{staff.full_name}</option>)}
            </select>
          </div>
          {activeTab === 'records' && <div className="col-md"><label className="form-label">Payment Status</label><select className="form-select fw-bold" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}><option value="unpaid">Unpaid</option><option value="paid">Paid</option></select></div>}
          <div className="col-md"><label className="form-label">Month Filter</label><select className="form-select fw-bold" value={monthFilter} onChange={(e) => handleMonthFilterChange(e.target.value)}><option value="all">All</option><option value="this-month">This Month</option><option value="last-month">Last Month</option><option value="3-months">Last 3 Months</option><option value="6-months">Last 6 Months</option></select></div>
          <div className="col-md"><label className="form-label">From Date</label><input type="date" className="form-control" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
          <div className="col-md"><label className="form-label">To Date</label><input type="date" className="form-control" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
        </div>
        <div className="d-flex justify-content-end mt-2">
          <button type="button" className="btn btn-sm btn-link" onClick={handleResetFilters}>Clear Filters</button>
        </div>
      </div>

      {activeTab === 'records' && (
        <div className="row g-4">
          <div className="col-lg-8">
            <div className="card p-3 overflow-x-auto">
              <div className="d-flex flex-wrap align-items-center justify-content-between mb-3 gap-2">
                <h6 className="fw-bold mb-0">📦 Batch Records ({displayRecords.length})</h6>
                <div className="d-flex flex-wrap gap-2">
                  <span className="chip-custom">Filtered: {displayRecords.length}</span>
                  <span className="chip-custom">Selected: {selectedIds.length}</span>
                  <span className={`chip-custom ${paymentStatus === 'paid' ? 'badge-success' : 'badge-warning'}`}>Status: {paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}</span>
                </div>
              </div>
              <table className="table">
                <thead><tr><th><input type="checkbox" className="form-check-input" checked={displayRecords.length > 0 && displayRecords.every(r => selectedIds.includes(r.id))} onChange={handleSelectAll} /></th><th>Date</th><th>Batch No.</th><th>Product Name (Quantity)</th><th>Status</th><th className="text-end">Wage</th></tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan="6" className="text-center py-4"><span className="spinner-border"></span></td></tr> : displayRecords.length === 0 ? <tr><td colSpan="6" className="text-center text-muted py-4">No records found.</td></tr> : visibleRecords.map((rec) => {
                    const flatWage = parseFloat(rec.inventory?.wage_rate || 0)
                    const isPaid = Boolean(rec.paid_date)
                    return (
                      <tr key={rec.id} className={`${selectedIds.includes(rec.id) ? 'row-selected' : ''} ${isPaid ? 'row-paid' : 'row-unpaid'}`}>
                        <td><input type="checkbox" className="form-check-input" checked={selectedIds.includes(rec.id)} onChange={() => handleSelectRow(rec.id)} /></td>
                        <td>{rec.production_date}</td>
                        <td className="font-mono fw-bold text-primary">{rec.batch_no}</td>
                        <td className="fw-bold">{rec.inventory?.product_name || '-'} <span className="text-muted fw-normal">({rec.quantity} unit)</span></td>
                        <td><span className={`badge ${isPaid ? 'badge-success' : 'badge-warning'}`}>{isPaid ? 'Paid' : 'Unpaid'}</span></td>
                        <td className="text-end fw-bold">RM {flatWage.toFixed(2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {displayRecords.length > 0 && visibleCount < displayRecords.length && (
                <div className="text-center mt-3">
                  <button className="btn btn-sm btn-outline-light fw-bold" onClick={() => setVisibleCount(prev => Math.min(prev + pageSize, displayRecords.length))}>Load More</button>
                </div>
              )}
            </div>
          </div>
          <div className="col-lg-4">
            <div className="card p-3 d-flex flex-column gap-3">
              <h6 className="fw-bold mb-0">💰 Selected Summary ({selectedIds.length})</h6>
              <div className="summary-box text-center">
                <div className="text-uppercase small fw-bold text-muted">Selected Wages Total</div>
                <h3 className="fw-bold">RM {totalWagesDue.toFixed(2)}</h3>
              </div>
              <button onClick={generateFormatText} disabled={selectedIds.length === 0} className="btn fw-bold w-100">⚡ Generate Text Format</button>
              {paymentStatus === 'unpaid' && selectedIds.length > 0 && (
                <button onClick={() => setIsPaidModalOpen(true)} className="btn fw-bold w-100">✅ Mark as Paid ({selectedIds.length})</button>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="card p-3">
          <h6 className="fw-bold mb-3">📊 Payment History ({filteredHistory.length})</h6>
          {loading ? <div className="text-center py-4"><span className="spinner-border"></span></div> : filteredHistory.length === 0 ? <div className="text-center text-muted py-4">No payment history found.</div> : (
            <>
              <div className="d-flex flex-column gap-2">
                {visibleHistory.map((payment) => (
                  <div key={payment.id} className="card p-3 cursor-pointer transition-all" onClick={() => handleViewPaymentDetail(payment)}>
                    <div className="d-flex justify-content-between align-items-center">
                      <div><span className="text-muted">Payment Date</span><div className="fw-bold">{formatDate(payment.date_paid)}</div></div>
                      <div className="text-end"><span className="text-muted">Total Payment</span><h5 className="fw-bold mb-0">RM {payment.total_paid.toFixed(2)}</h5></div>
                    </div>
                    <div className="mt-2"><span className="text-muted">Staff: </span><span>{payment.records[0]?.production_name || '-'}</span></div>
                    <div className="mt-1"><span className="text-muted">Batches: </span><span>{payment.records.map(r => r.batch_no).join(', ')}</span></div>
                  </div>
                ))}
              </div>
              {filteredHistory.length > 0 && visibleCount < filteredHistory.length && (
                <div className="text-center mt-3">
                  <button className="btn btn-sm btn-outline-light fw-bold" onClick={() => setVisibleCount(prev => Math.min(prev + pageSize, filteredHistory.length))}>Load More</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {isTextModalOpen && (
        <>
          <div className="modal-backdrop show" onClick={() => setIsTextModalOpen(false)}></div>
          <div className="modal d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content p-3">
                <h5 className="fw-bold text-primary mb-3">📋 Wage Text Copy</h5>
                <pre className="p-3 font-mono user-select-all">{generatedText}</pre>
                <div className="d-flex gap-2 justify-content-end mt-3 pt-3">
                  <button className="btn btn-sm btn-link" onClick={() => setIsTextModalOpen(false)}>Cancel</button>
                  <button onClick={copyToClipboard} className="btn btn-sm btn-primary fw-bold px-3">Copy Text</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {isPaidModalOpen && (
        <>
          <div className="modal-backdrop show" onClick={() => setIsPaidModalOpen(false)}></div>
          <div className="modal d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content p-3">
                <h5 className="fw-bold mb-2">💸 Confirm Payment</h5>
                <p className="text-muted mb-3">Please review the payment date before saving.</p>
                <form onSubmit={handleMarkAsPaidSubmit}>
                  <div className="mb-3">
                    <label className="form-label fw-bold">Payment Date</label>
                    <input type="date" className="form-control fw-bold" value={customPaidDate} onChange={(e) => setCustomPaidDate(e.target.value)} required />
                  </div>
                  <div className="payment-summary mb-3">
                    <span className="d-block text-muted">Total Wages to Transfer</span>
                    <h4 className="fw-bold mb-0">RM {totalWagesDue.toFixed(2)}</h4>
                  </div>
                  <div className="d-flex gap-2 justify-content-end pt-3">
                    <button type="button" className="btn btn-sm btn-link" onClick={() => setIsPaidModalOpen(false)}>Cancel</button>
                    <button type="submit" disabled={loading} className="btn btn-sm fw-bold px-3">Confirm & Pay</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </>
      )}

      {isDetailModalOpen && selectedPayment && (
        <>
          <div className="modal-backdrop show" onClick={() => setIsDetailModalOpen(false)}></div>
          <div className="modal d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content p-3">
                <h5 className="fw-bold text-primary mb-3">📋 Payment Details</h5>
                <div className="d-flex justify-content-between mb-2"><span className="text-muted">Payment Date</span><span className="fw-bold">{formatDate(selectedPayment.date_paid)}</span></div>
                <div className="d-flex justify-content-between mb-2"><span className="text-muted">Staff</span><span className="fw-bold">{selectedPayment.records[0]?.production_name || '-'}</span></div>
                <div className="d-flex justify-content-between mb-3"><span className="text-muted">Total Payment</span><h5 className="fw-bold mb-0">RM {selectedPayment.total_paid.toFixed(2)}</h5></div>
                <div className="divider-gradient my-2"></div>
                <div className="table-responsive">
                  <table className="table table-sm">
                    <thead><tr><th>Date</th><th>Batch</th><th>Product</th><th className="text-end">Wage</th></tr></thead>
                    <tbody>
                      {selectedPayment.records.map((rec) => {
                        const wage = parseFloat(rec.paid_amount || rec.inventory?.wage_rate || 0)
                        return <tr key={rec.id}><td>{rec.production_date}</td><td className="font-mono">{rec.batch_no}</td><td>{rec.inventory?.product_name || '-'}</td><td className="text-end fw-bold">RM {wage.toFixed(2)}</td></tr>
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="d-flex gap-2 justify-content-end mt-3 pt-3">
                  <button className="btn btn-sm btn-link" onClick={() => setIsDetailModalOpen(false)}>Close</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}