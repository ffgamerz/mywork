import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import ToastBar from './components/ToastBar'
import { useToast } from './utils/useToast'

export default function MyWage({ session }) {
  const { toast, showToast, hideToast } = useToast()
  const [staffName, setStaffName] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('unpaid')
  
  const [unpaidRecords, setUnpaidRecords] = useState([])
  const [paidRecords, setPaidRecords] = useState([])
  const [paymentHistory, setPaymentHistory] = useState([])
  
  const [selectedPayment, setSelectedPayment] = useState(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [visibleCount, setVisibleCount] = useState(8)
  const pageSize = 8

  useEffect(() => {
    const getStaffName = async () => {
      if (!session?.user?.id) return
      const { data, error } = await supabase.from('profiles').select('full_name').eq('id', session.user.id).single()
      if (!error && data) setStaffName(data.full_name)
    }
    getStaffName()
  }, [session])

  useEffect(() => { if (staffName) fetchRecords() }, [staffName])
  useEffect(() => { setVisibleCount(8) }, [searchTerm, dateFrom, dateTo, activeTab])

  const fetchRecords = async () => {
    setLoading(true)
    const { data: unpaidData } = await supabase.from('stock_productions').select(`id, batch_no, production_date, production_name, quantity, paid_date, paid_amount, wage_payment_id, inventory ( product_name, wage_rate )`).eq('production_name', staffName).is('paid_date', null).order('production_date', { ascending: false })
    if (unpaidData) setUnpaidRecords(unpaidData)

    const { data: paidData } = await supabase.from('stock_productions').select(`id, batch_no, production_date, production_name, quantity, paid_date, paid_amount, wage_payment_id, inventory ( product_name, wage_rate )`).eq('production_name', staffName).not('paid_date', 'is', null).order('paid_date', { ascending: false })
    if (paidData) {
      setPaidRecords(paidData)
      const grouped = paidData.reduce((acc, record) => {
        const paymentId = record.wage_payment_id
        if (!paymentId) return acc
        if (!acc[paymentId]) acc[paymentId] = { id: paymentId, date_paid: record.paid_date, total_paid: 0, records: [] }
        acc[paymentId].records.push(record)
        acc[paymentId].total_paid += parseFloat(record.paid_amount || 0)
        return acc
      }, {})
      setPaymentHistory(Object.values(grouped).sort((a, b) => new Date(b.date_paid) - new Date(a.date_paid)))
    }
    setLoading(false)
  }

  const filteredUnpaid = unpaidRecords.filter(rec => {
    const term = searchTerm.trim().toLowerCase()
    if (term && ![rec.batch_no, rec.inventory?.product_name, rec.inventory?.wage_rate].filter(Boolean).join(' ').toLowerCase().includes(term)) return false
    if (dateFrom && rec.production_date < dateFrom) return false
    if (dateTo && rec.production_date > dateTo) return false
    return true
  })

  const filteredHistory = paymentHistory.filter(payment => {
    const term = searchTerm.trim().toLowerCase()
    if (term) { const hasMatch = payment.records.some(rec => [rec.batch_no, rec.inventory?.product_name].filter(Boolean).join(' ').toLowerCase().includes(term)); if (!hasMatch) return false }
    if (dateFrom && payment.date_paid < dateFrom) return false
    if (dateTo && payment.date_paid > dateTo) return false
    return true
  })

  const visibleUnpaid = filteredUnpaid.slice(0, visibleCount)
  const visibleHistory = filteredHistory.slice(0, visibleCount)
  const totalUnpaidWages = filteredUnpaid.reduce((sum, rec) => sum + parseFloat(rec.inventory?.wage_rate || 0), 0)

  const handleViewPaymentDetail = (payment) => { setSelectedPayment(payment); setIsDetailModalOpen(true) }

  const formatDate = (dateStr) => { if (!dateStr) return '-'; const [y, m, d] = dateStr.split('-'); return `${parseInt(d)}/${parseInt(m)}/${y}` }

  return (
    <div>
      <ToastBar toast={toast} onClose={hideToast} />
      <div className="page-header-custom">
        <h1 className="page-title-custom">💰 My Wage</h1>
        <p className="page-subtitle-custom">View your wage records and payment history.</p>
      </div>

      <ul className="nav nav-tabs mb-3">
        <li className="nav-item"><button className={`nav-link ${activeTab === 'unpaid' ? 'active' : ''}`} onClick={() => setActiveTab('unpaid')}>Unpaid Wage</button></li>
        <li className="nav-item"><button className={`nav-link ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>Wage History</button></li>
      </ul>

      {activeTab === 'unpaid' && (
        <div className="card p-3 mb-3">
          <div className="row g-3">
            <div className="col-md-4"><label className="form-label">From Date</label><input type="date" className="form-control" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
            <div className="col-md-4"><label className="form-label">To Date</label><input type="date" className="form-control" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
            <div className="col-md-4"><label className="form-label">Search records</label><input type="text" className="form-control" placeholder="Search records" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
          </div>
        </div>
      )}

      {activeTab === 'unpaid' && (
        <div className="card p-3 overflow-x-auto">
          <div className="d-flex flex-wrap align-items-center justify-content-between mb-3 gap-2">
            <h6 className="fw-bold mb-0">📦 Unpaid Batches ({filteredUnpaid.length})</h6>
            <span className="chip-custom badge-warning">Total Wages Due: RM {totalUnpaidWages.toFixed(2)}</span>
          </div>
          {loading ? <div className="text-center py-4"><span className="spinner-border"></span></div> : filteredUnpaid.length === 0 ? <div className="text-center text-muted py-4">No unpaid batch records found.</div> : (
            <>
              <table className="table">
                <thead><tr><th>Date</th><th>Batch No.</th><th>Product Name (Quantity)</th><th className="text-end">Batch Wage</th></tr></thead>
                <tbody>{visibleUnpaid.map((rec) => {
                  const wage = parseFloat(rec.inventory?.wage_rate || 0)
                  return <tr key={rec.id} className="row-unpaid"><td>{rec.production_date}</td><td className="font-mono fw-bold text-primary">{rec.batch_no}</td><td className="fw-bold">{rec.inventory?.product_name || '-'} <span className="text-muted fw-normal">({rec.quantity} unit)</span></td><td className="text-end fw-bold">RM {wage.toFixed(2)}</td></tr>
                })}</tbody>
              </table>
              {filteredUnpaid.length > 0 && visibleCount < filteredUnpaid.length && (
                <div className="text-center mt-3"><button className="btn btn-sm btn-outline-light fw-bold" onClick={() => setVisibleCount(prev => Math.min(prev + pageSize, filteredUnpaid.length))}>Load More</button></div>
              )}
            </>
          )}
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
                      <div><span className="text-muted">Date</span><div className="fw-bold">{formatDate(payment.date_paid)}</div></div>
                      <div className="text-end"><span className="text-muted">Total Payment</span><h5 className="fw-bold mb-0">RM {payment.total_paid.toFixed(2)}</h5></div>
                    </div>
                    <div className="mt-2"><span className="text-muted">Batches: </span><span>{payment.records.map(r => r.batch_no).join(', ')}</span></div>
                  </div>
                ))}
              </div>
              {filteredHistory.length > 0 && visibleCount < filteredHistory.length && (
                <div className="text-center mt-3"><button className="btn btn-sm btn-outline-light fw-bold" onClick={() => setVisibleCount(prev => Math.min(prev + pageSize, filteredHistory.length))}>Load More</button></div>
              )}
            </>
          )}
        </div>
      )}

      {isDetailModalOpen && selectedPayment && (
        <>
          <div className="modal-backdrop show" onClick={() => setIsDetailModalOpen(false)}></div>
          <div className="modal d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content p-3">
                <h5 className="fw-bold text-primary mb-3">📋 Payment Details</h5>
                <div className="d-flex justify-content-between mb-2"><span className="text-muted">Date</span><span className="fw-bold">{formatDate(selectedPayment.date_paid)}</span></div>
                <div className="d-flex justify-content-between mb-3"><span className="text-muted">Total Payment</span><h5 className="fw-bold mb-0">RM {selectedPayment.total_paid.toFixed(2)}</h5></div>
                <div className="divider-gradient my-2"></div>
                <div className="table-responsive">
                  <table className="table table-sm">
                    <thead><tr><th>Date</th><th>Batch No.</th><th>Product Name</th><th className="text-end">Batch Wage</th></tr></thead>
                    <tbody>{selectedPayment.records.map((rec) => {
                      const wage = parseFloat(rec.paid_amount || 0)
                      return <tr key={rec.id}><td>{rec.production_date}</td><td className="font-mono">{rec.batch_no}</td><td>{rec.inventory?.product_name || '-'}</td><td className="text-end fw-bold">RM {wage.toFixed(2)}</td></tr>
                    })}</tbody>
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