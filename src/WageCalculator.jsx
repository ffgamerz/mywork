import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { getTranslation } from './utils/translation'
import ToastBar from './components/ToastBar'
import { useToast } from './utils/useToast'

export default function WageCalculator({ session, userRole, allowedModules = {}, lang = 'en' }) {
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
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 8

  // Modals State
  const [isTextModalOpen, setIsTextModalOpen] = useState(false)
  const [isPaidModalOpen, setIsPaidModalOpen] = useState(false)
  const [customPaidDate, setCustomPaidDate] = useState(new Date().toISOString().split('T')[0])

  const activeLang = lang || 'en'
  const t = (key) => getTranslation(activeLang, key)

  // ─── LOGIK KEBENARAN AKSES BAHARU ──────────────────────────────────────────
  const cleanedRole = String(userRole || '').trim().toLowerCase()
  const isSuperAdmin = cleanedRole === 'super_admin'
  
  // Super Admin bypass privilege, manakala Admin/Staff mengikut configuration allowedModules
  const hasPageAccess = isSuperAdmin || allowedModules['wageCalculator'] === true || cleanedRole === 'admin'
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (hasPageAccess) fetchStaffList()
  }, [hasPageAccess])

  useEffect(() => {
    if (hasPageAccess) fetchRecords()
  }, [selectedStaff, paymentStatus, dateFrom, dateTo, hasPageAccess])

  useEffect(() => {
    setCurrentPage(1)
  }, [selectedStaff, paymentStatus, dateFrom, dateTo, searchTerm, monthFilter])

  if (!hasPageAccess) {
    return (
      <div className="alert-unauthorized">
        <div><span>🔒 {activeLang === 'ms' ? 'Akses Disekat: Anda tiada kebenaran.' : 'Access Denied: Unauthorized.'}</span></div>
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

  const totalPages = Math.max(1, Math.ceil(displayRecords.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedRecords = displayRecords.slice((safePage - 1) * pageSize, safePage * pageSize)

  const handleMarkAsPaidSubmit = async (e) => {
    e.preventDefault()
    if (selectedIds.length === 0) return

    setLoading(true)

    const { data: paymentData, error: paymentError } = await supabase
      .from('wage_payments')
      .insert([{
        staff_name: selectedStaff || selectedRecords[0]?.production_name || 'Kakitangan',
        total_paid: totalWagesDue,
        date_paid: customPaidDate
      }])
      .select()

    if (paymentError) {
      showToast(t('paymentCreateFailed') + paymentError.message, 'error')
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
      showToast(t('paymentSuccess'))
      setIsPaidModalOpen(false)
      fetchRecords()
    } else {
      showToast(t('paymentUpdateFailed'), 'error')
    }
    setLoading(false)
  }

  const generateFormatText = () => {
    if (selectedIds.length === 0) {
      showToast(t('noUnpaidRecords'), 'error')
      return
    }
    
    let text = `Upah\n${selectedStaff || 'Kakitangan'}\n`
    selectedRecords.forEach((rec) => {
      const [year, month, day] = rec.production_date.split('-')
      const formattedDate = `${parseInt(day)}/${parseInt(month)}/${year}`
      const flatWage = parseFloat(rec.inventory?.wage_rate || 0).toFixed(2)
      text += `\n${rec.inventory?.product_name || 'Produk'} (${rec.batch_no})\nDate : ${formattedDate}\nRM${flatWage}\n`
    })

    setGeneratedText(text.trim())
    setIsTextModalOpen(true)
  }

  const copyToClipboard = () => {
    if (!generatedText) return
    navigator.clipboard.writeText(generatedText)
    showToast(t('rmCopiedAlert'))
  }

  return (
    <div className="page-shell">
      <ToastBar toast={toast} onClose={hideToast} />

      {/* FILTER PANEL */}
      <div className="content-card p-6 space-y-4">
        <h2 className="text-xl font-black">🧮 {t('wageCalculator')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-4 items-end">
          <div className="form-control w-full">
            <label className="label text-xs font-bold">{t('staffName')}</label>
            <select className="select select-bordered w-full font-bold" value={selectedStaff} onChange={(e) => setSelectedStaff(e.target.value)}>
              <option value="">{t('selectStaff')}</option>
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
          <div className="form-control w-full">
            <label className="label text-xs font-bold">{t('paymentStatus')}</label>
            <select className="select select-bordered w-full font-bold" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
              <option value="unpaid">{activeLang === 'ms' ? 'Belum Bayar (Unpaid)' : 'Unpaid'}</option>
              <option value="paid">{activeLang === 'ms' ? 'Sudah Bayar (Paid)' : 'Paid'}</option>
            </select>
          </div>
          <div className="form-control w-full">
            <label className="label text-xs font-bold">{t('monthFilter')}</label>
            <select className="select select-bordered w-full font-bold" value={monthFilter} onChange={(e) => handleMonthFilterChange(e.target.value)}>
              <option value="all">{t('all')}</option>
              <option value="this-month">{t('thisMonth')}</option>
              <option value="last-month">{t('lastMonth')}</option>
              <option value="3-months">{t('last3Months')}</option>
              <option value="6-months">{t('last6Months')}</option>
            </select>
          </div>
          <div className="form-control w-full">
            <label className="label text-xs font-bold">{t('dateFrom')}</label>
            <input type="date" className="input input-bordered w-full text-sm" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="form-control w-full">
            <label className="label text-xs font-bold">{t('dateTo')}</label>
            <input type="date" className="input input-bordered w-full text-sm" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="form-control w-full md:col-span-2">
            <label className="label text-xs font-bold">{t('searchRecords')}</label>
            <input type="text" className="input input-bordered w-full text-sm" placeholder={t('searchRecords')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={handleResetFilters} className="btn btn-ghost btn-sm rounded-xl">
            {t('clearFilters')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* REKOD TABLE */}
        <div className="lg:col-span-2 content-card p-6 overflow-x-auto">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <h3 className="text-lg font-black text-secondary">📦 {t('batchRecordsTitle')} ({displayRecords.length})</h3>
            <div className="flex flex-wrap gap-2">
              <div className="badge badge-outline badge-info gap-2">
                <span className="opacity-70">{t('filteredResults')}:</span>
                <span className="font-semibold">{displayRecords.length}</span>
              </div>
              <div className="badge badge-outline badge-success gap-2">
                <span className="opacity-70">{t('selectedCount')}:</span>
                <span className="font-semibold">{selectedIds.length}</span>
              </div>
              <div className={`badge gap-2 ${paymentStatus === 'paid' ? 'badge-success' : 'badge-warning'}`}>
                <span className="opacity-80">{t('paymentStatusBadge')}:</span>
                <span className="font-semibold">{paymentStatus === 'paid' ? t('paidBadge') : t('unpaidBadge')}</span>
              </div>
            </div>
          </div>
          <table className="table w-full">
            <thead>
              <tr>
                <th className="w-10">
                  <input type="checkbox" className="checkbox checkbox-sm" checked={displayRecords.length > 0 && displayRecords.every(r => selectedIds.includes(r.id))} onChange={handleSelectAll} />
                </th>
                <th>{t('date')}</th>
                <th>{t('batchNo')}</th>
                <th>{t('productName')} ({t('quantity')})</th>
                <th>{t('paymentStatusBadge')}</th>
                <th className="text-right">{t('wageBatchHeader')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="text-center py-8"><span className="loading loading-spinner text-primary"></span></td></tr>
              ) : displayRecords.length === 0 ? (
                <tr><td colSpan="6" className="text-center opacity-50 py-8">{t('noRecordsForFilter')}</td></tr>
              ) : (
                paginatedRecords.map((rec) => {
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
                        <span className={`badge ${isPaid ? 'badge-success' : 'badge-warning'} badge-outline`}>{isPaid ? t('paidBadge') : t('unpaidBadge')}</span>
                      </td>
                      <td className="text-right font-black text-success">RM {flatWage.toFixed(2)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>

          {displayRecords.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 border-t border-base-200 pt-4">
              <span className="text-sm opacity-70">{t('pageOf').replace('{current}', safePage).replace('{total}', totalPages)}</span>
              <div className="join">
                <button type="button" className="join-item btn btn-sm" disabled={safePage === 1} onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}>
                  {t('previousPage')}
                </button>
                <button type="button" className="join-item btn btn-sm" disabled={safePage === totalPages} onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}>
                  {t('nextPage')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* SUMMARY CARD */}
        <div className="content-card p-6 flex flex-col justify-between h-fit space-y-4">
          <div className="space-y-4">
            <h3 className="text-lg font-black text-accent">💰 {t('selectedSummary')} ({selectedIds.length})</h3>
            <div className="divider my-1"></div>
            <div className="summary-box">
              <span className="text-xs uppercase tracking-wider font-black opacity-50 text-success">{t('selectedWagesTotal')}</span>
              <span className="text-3xl font-black text-success">RM {totalWagesDue.toFixed(2)}</span>
            </div>
            <button onClick={generateFormatText} disabled={selectedIds.length === 0} className="btn btn-accent btn-block text-white font-bold mt-2">
              ⚡ {t('generateTextFormat')}
            </button>
          </div>

          {paymentStatus === 'unpaid' && selectedIds.length > 0 && (
            <button onClick={() => setIsPaidModalOpen(true)} className="btn btn-success btn-block text-white font-bold">
              ✅ {t('markAsPaid')} ({selectedIds.length})
            </button>
          )}
        </div>
      </div>

      {/* MODAL JANAAN TEKS */}
      {isTextModalOpen && (
        <div className="modal modal-open z-50">
          <div className="modal-box--md">
            <h3 className="font-bold text-xl text-primary mb-3">📋 {t('textCopyTitle')}</h3>
            <pre className="p-4 bg-base-300 rounded-xl text-xs font-mono whitespace-pre-wrap max-h-64 overflow-y-auto border border-base-200 select-all">
              {generatedText}
            </pre>
            <div className="modal-action gap-2 border-t border-base-200 pt-3">
              <button type="button" className="btn btn-sm btn-ghost rounded-lg" onClick={() => setIsTextModalOpen(false)}>{t('cancel')}</button>
              <button type="button" onClick={copyToClipboard} className="btn btn-sm btn-primary font-bold px-4">{t('copyText')}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MARK AS PAID */}
      {isPaidModalOpen && (
        <div className="modal modal-open z-50">
          <div className="modal-box--sm">
            <h3 className="font-bold text-xl text-success mb-2">💸 {t('paymentConfirmation')}</h3>
            <p className="text-xs opacity-70 mb-4">{t('paymentConfirmationDesc')}</p>
            <form onSubmit={handleMarkAsPaidSubmit} className="space-y-4">
              <div className="form-control">
                <label className="label-text font-bold mb-1 text-xs">{t('paymentDateLabel')}</label>
                <input type="date" required className="input input-bordered w-full font-bold text-base" value={customPaidDate} onChange={(e) => setCustomPaidDate(e.target.value)} />
              </div>
              <div className="payment-summary">
                <span className="text-xs block opacity-60 font-semibold">{t('transferSummaryLabel')}</span>
                <span className="text-xl font-black text-success">RM {totalWagesDue.toFixed(2)}</span>
              </div>
              <div className="modal-action gap-2 border-t border-base-200 pt-3">
                <button type="button" className="btn btn-sm btn-ghost rounded-lg" onClick={() => setIsPaidModalOpen(false)}>{t('cancel')}</button>
                <button type="submit" disabled={loading} className="btn btn-sm btn-success text-white font-bold px-4">{t('confirmAndPay')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}