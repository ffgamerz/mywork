import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { getTranslation } from './utils/translation'
import ToastBar from './components/ToastBar'
import { useToast } from './utils/useToast'

export default function MyWage({ session, lang = 'en' }) {
  const { toast, showToast, hideToast } = useToast()
  const [staffName, setStaffName] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('unpaid') // 'unpaid' or 'history'
  
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

  const activeLang = lang || 'en'
  const t = (key) => getTranslation(activeLang, key)

  // Get staff name from session
  useEffect(() => {
    const getStaffName = async () => {
      if (!session?.user?.id) return
      
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', session.user.id)
        .single()
      
      if (!error && data) {
        setStaffName(data.full_name)
      }
    }
    
    getStaffName()
  }, [session])

  // Fetch records when staffName is available
  useEffect(() => {
    if (staffName) {
      fetchRecords()
    }
  }, [staffName])

  useEffect(() => {
    setVisibleCount(8)
  }, [searchTerm, dateFrom, dateTo, activeTab])

  const fetchRecords = async () => {
    setLoading(true)
    
    // Fetch unpaid records
    const { data: unpaidData, error: unpaidError } = await supabase
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
      .eq('production_name', staffName)
      .is('paid_date', null)
      .order('production_date', { ascending: false })

    if (!unpaidError && unpaidData) {
      setUnpaidRecords(unpaidData)
    }

    // Fetch paid records
    const { data: paidData, error: paidError } = await supabase
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
      .eq('production_name', staffName)
      .not('paid_date', 'is', null)
      .order('paid_date', { ascending: false })

    if (!paidError && paidData) {
      setPaidRecords(paidData)
      
      // Group paid records by wage_payment_id for history
      const grouped = paidData.reduce((acc, record) => {
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
        acc[paymentId].total_paid += parseFloat(record.paid_amount || 0)
        return acc
      }, {})
      
      // Convert to array and sort by date
      const historyArray = Object.values(grouped)
        .sort((a, b) => new Date(b.date_paid) - new Date(a.date_paid))
      
      setPaymentHistory(historyArray)
    }
    
    setLoading(false)
  }

  // Filter records based on search and date
  const filteredUnpaid = unpaidRecords.filter(rec => {
    const term = searchTerm.trim().toLowerCase()
    if (term) {
      const haystack = [
        rec.batch_no,
        rec.inventory?.product_name,
        rec.inventory?.wage_rate
      ].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(term)) return false
    }
    if (dateFrom && rec.production_date < dateFrom) return false
    if (dateTo && rec.production_date > dateTo) return false
    return true
  })

  const filteredHistory = paymentHistory.filter(payment => {
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

  const visibleUnpaid = filteredUnpaid.slice(0, visibleCount)
  const visibleHistory = filteredHistory.slice(0, visibleCount)

  const totalUnpaidWages = filteredUnpaid.reduce((sum, rec) => {
    return sum + parseFloat(rec.inventory?.wage_rate || 0)
  }, 0)

  const handleViewPaymentDetail = (payment) => {
    setSelectedPayment(payment)
    setIsDetailModalOpen(true)
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    const [year, month, day] = dateStr.split('-')
    return `${parseInt(day)}/${parseInt(month)}/${year}`
  }

  return (
    <div className="page-shell">
      <ToastBar toast={toast} onClose={hideToast} />

      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title">💰 {t('myWageTitle') || 'My Wage'}</h1>
        <p className="page-subtitle">{t('myWageDesc') || 'View your wage records and payment history.'}</p>
      </div>

      {/* Tab Navigation */}
      <div className="tabs tabs-bordered mb-4">
        <button 
          className={`tab ${activeTab === 'unpaid' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('unpaid')}
        >
          {t('unpaidWageTab') || 'Unpaid Wage'}
        </button>
        <button 
          className={`tab ${activeTab === 'history' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          {t('wageHistoryTab') || 'Wage History'}
        </button>
      </div>

      {/* Filter Section - only for unpaid tab */}
      {activeTab === 'unpaid' && (
        <div className="content-card p-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="form-control">
              <label className="label-text text-xs font-bold">{t('dateFrom')}</label>
              <input 
                type="date" 
                className="input input-bordered w-full text-sm" 
                value={dateFrom} 
                onChange={(e) => setDateFrom(e.target.value)} 
              />
            </div>
            <div className="form-control">
              <label className="label-text text-xs font-bold">{t('dateTo')}</label>
              <input 
                type="date" 
                className="input input-bordered w-full text-sm" 
                value={dateTo} 
                onChange={(e) => setDateTo(e.target.value)} 
              />
            </div>
            <div className="form-control">
              <label className="label-text text-xs font-bold">{t('searchRecords')}</label>
              <input 
                type="text" 
                className="input input-bordered w-full text-sm" 
                placeholder={t('searchRecords')} 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
              />
            </div>
          </div>
        </div>
      )}

      {/* Unpaid Wage Tab Content */}
      {activeTab === 'unpaid' && (
        <div className="content-card p-6 overflow-x-auto">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <h3 className="text-lg font-black text-secondary">
              📦 {t('unpaidBatches') || 'Unpaid Batches'} ({filteredUnpaid.length})
            </h3>
            <div className="badge badge-warning gap-2">
              <span className="opacity-70">{t('totalWages') || 'Total Wages'}:</span>
              <span className="font-semibold">RM {totalUnpaidWages.toFixed(2)}</span>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <span className="loading loading-spinner text-primary"></span>
            </div>
          ) : filteredUnpaid.length === 0 ? (
            <div className="text-center opacity-50 py-8">
              {t('noUnpaidRecords') || 'No unpaid batch records found.'}
            </div>
          ) : (
            <>
              <table className="table w-full">
                <thead>
                  <tr>
                    <th>{t('date')}</th>
                    <th>{t('batchNo')}</th>
                    <th>{t('productName')} ({t('quantity')})</th>
                    <th className="text-right">{t('wageBatchHeader')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUnpaid.map((rec) => {
                    const wage = parseFloat(rec.inventory?.wage_rate || 0)
                    return (
                      <tr key={rec.id} className="hover record-row--unpaid">
                        <td className="text-xs font-medium">{rec.production_date}</td>
                        <td className="font-mono font-bold text-primary text-xs">{rec.batch_no}</td>
                        <td className="font-bold text-sm">
                          {rec.inventory?.product_name || '-'} <span className="opacity-60 font-normal">({rec.quantity} unit)</span>
                        </td>
                        <td className="text-right font-black text-warning">RM {wage.toFixed(2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {filteredUnpaid.length > 0 && visibleCount < filteredUnpaid.length && (
                <div className="flex justify-center mt-4 pt-4">
                  <button 
                    type="button" 
                    className="btn btn-outline btn-primary font-bold"
                    onClick={() => setVisibleCount(prev => Math.min(prev + pageSize, filteredUnpaid.length))}
                  >
                    {t('loadMore') || 'Load More'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Payment History Tab Content */}
      {activeTab === 'history' && (
        <div className="content-card p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <h3 className="text-lg font-black text-secondary">
              📊 {t('wageHistoryTitle') || 'Payment History'} ({filteredHistory.length})
            </h3>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <span className="loading loading-spinner text-primary"></span>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="text-center opacity-50 py-8">
              {t('noPaymentHistory') || 'No payment history found.'}
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
                          <span className="text-xs opacity-60">{t('date') || 'Date'}</span>
                          <p className="font-bold text-sm">{formatDate(payment.date_paid)}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs opacity-60">{t('totalPayment') || 'Total Payment'}</span>
                          <p className="font-black text-lg text-success">RM {payment.total_paid.toFixed(2)}</p>
                        </div>
                      </div>
                      <div className="mt-2">
                        <span className="text-xs opacity-60">{t('batches') || 'Batches'}: </span>
                        <span className="text-xs font-medium">
                          {payment.records.map(r => r.batch_no).join(', ')}
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
                    {t('loadMore') || 'Load More'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Payment Detail Modal */}
      {isDetailModalOpen && selectedPayment && (
        <div className="modal modal-open z-50">
          <div className="modal-backdrop" onClick={() => setIsDetailModalOpen(false)}></div>
          <div className="modal-box--md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-xl text-primary mb-3">
              📋 {t('paymentDetailTitle') || 'Payment Details'}
            </h3>
            
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs opacity-60">{t('date') || 'Date'}</span>
                <span className="font-bold">{formatDate(selectedPayment.date_paid)}</span>
              </div>
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs opacity-60">{t('totalPayment') || 'Total Payment'}</span>
                <span className="font-black text-lg text-success">RM {selectedPayment.total_paid.toFixed(2)}</span>
              </div>
            </div>

            <div className="divider my-2">{t('batchRecordsTitle') || 'Batch Records'}</div>

            <div className="max-h-64 overflow-y-auto">
              <table className="table table-sm w-full">
                <thead>
                  <tr>
                    <th>{t('date')}</th>
                    <th>{t('batchNo')}</th>
                    <th>{t('productName')}</th>
                    <th className="text-right">{t('wageBatchHeader')}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPayment.records.map((rec) => {
                    const wage = parseFloat(rec.paid_amount || 0)
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
                {t('close') || 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}