import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { translations } from './translations'

export default function WageCalculator({ session, userRole, allowedModules = {} }) {
  const [staffList, setStaffList] = useState([])
  const [selectedStaff, setSelectedStaff] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('unpaid') 
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  
  const [records, setRecords] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [generatedText, setGeneratedText] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')

  // Modals State
  const [isTextModalOpen, setIsTextModalOpen] = useState(false)
  const [isPaidModalOpen, setIsPaidModalOpen] = useState(false)
  const [customPaidDate, setCustomPaidDate] = useState(new Date().toISOString().split('T')[0])

  const lang = localStorage.getItem('bol_lang') || 'en'
  const t = (key) => translations[lang]?.[key] || translations['en'][key]

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

  if (!hasPageAccess) {
    return (
      <div className="alert alert-error shadow-lg rounded-xl max-w-md mx-auto mt-12 border border-error/20 text-white font-bold">
        <div><span>🔒 {lang === 'ms' ? 'Akses Disekat: Anda tiada kebenaran.' : 'Access Denied: Unauthorized.'}</span></div>
      </div>
    )
  }

  const fetchStaffList = async () => {
    const { data, error } = await supabase.from('profiles').select('full_name').order('full_name', { ascending: true })
    if (!error && data) setStaffList(data)
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

  const handleQuickDate = (range) => {
    const today = new Date()
    let fromDate = new Date()
    if (range === 'week') fromDate.setDate(today.getDate() - 7)
    else if (range === 'month') fromDate.setMonth(today.getMonth() - 1)
    else if (range === 'year') fromDate.setFullYear(today.getFullYear() - 1)

    setDateFrom(fromDate.toISOString().split('T')[0])
    setDateTo(today.toISOString().split('T')[0])
  }

  const handleSelectRow = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sid => sid !== id))
    } else {
      setSelectedIds([...selectedIds, id])
    }
  }

  const handleSelectAll = () => {
    if (selectedIds.length === records.length) setSelectedIds([])
    else setSelectedIds(records.map(r => r.id))
  }

  const selectedRecords = records.filter(r => selectedIds.includes(r.id))
  
  const totalWagesDue = selectedRecords.reduce((sum, item) => {
    return sum + parseFloat(item.inventory?.wage_rate || 0)
  }, 0)

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
      alert('Ralat semasa mencipta rekod wage_payments: ' + paymentError.message)
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
      setToast('Bayaran berjaya direkodkan!')
      setIsPaidModalOpen(false)
      fetchRecords()
      setTimeout(() => setToast(''), 4000)
    } else {
      alert('Ralat sistem semasa mengemas kini status kelompok produksi.')
    }
    setLoading(false)
  }

  const generateFormatText = () => {
    if (selectedIds.length === 0) return alert(lang === 'ms' ? 'Sila pilih rekod kelompok!' : 'Please select batch records!')
    
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
    alert(lang === 'ms' ? 'Teks berjaya disalin!' : 'Text copied successfully!')
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="toast toast-top toast-end z-50 p-4">
          <div className="alert alert-success shadow-lg text-white font-bold rounded-xl"><span>{toast}</span></div>
        </div>
      )}

      {/* FILTER PANEL */}
      <div className="card bg-base-100 border border-base-200 shadow-xl p-6 space-y-4">
        <h2 className="text-xl font-black">🧮 {t('wageCalculator')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
          <div className="form-control w-full">
            <label className="label text-xs font-bold">Staf / Pekerja</label>
            <select className="select select-bordered w-full font-bold" value={selectedStaff} onChange={(e) => setSelectedStaff(e.target.value)}>
              <option value="">{t('selectStaff')}</option>
              {staffList.map((staff, idx) => (
                staff.full_name && <option key={idx} value={staff.full_name}>{staff.full_name}</option>
              ))}
            </select>
          </div>
          <div className="form-control w-full">
            <label className="label text-xs font-bold">Status Bayaran</label>
            <select className="select select-bordered w-full font-bold" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
              <option value="unpaid">{lang === 'ms' ? 'Belum Bayar (Unpaid)' : 'Unpaid'}</option>
              <option value="paid">{lang === 'ms' ? 'Sudah Bayar (Paid)' : 'Paid'}</option>
            </select>
          </div>
          <div className="form-control w-full">
            <label className="label text-xs font-bold">Dari Tarikh</label>
            <input type="date" className="input input-bordered w-full text-sm" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="form-control w-full">
            <label className="label text-xs font-bold">Hingga Tarikh</label>
            <input type="date" className="input input-bordered w-full text-sm" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* REKOD TABLE */}
        <div className="lg:col-span-2 card bg-base-100 border border-base-200 shadow-xl p-6 overflow-x-auto">
          <h3 className="text-lg font-black mb-4 text-secondary">📦 Rekod Kelompok Batch ({records.length})</h3>
          <table className="table w-full">
            <thead>
              <tr>
                <th className="w-10">
                  <input type="checkbox" className="checkbox checkbox-sm" checked={records.length > 0 && selectedIds.length === records.length} onChange={handleSelectAll} />
                </th>
                <th>Tarikh</th>
                <th>No Batch</th>
                <th>Produk (Kuantiti)</th>
                <th className="text-right">Upah Batch</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="text-center py-8"><span className="loading loading-spinner text-primary"></span></td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan="5" className="text-center opacity-50 py-8">Tiada rekod kelompok ditemui mengikut tapisan.</td></tr>
              ) : (
                records.map((rec) => {
                  const flatWage = parseFloat(rec.inventory?.wage_rate || 0)
                  return (
                    <tr key={rec.id} className={`hover ${selectedIds.includes(rec.id) ? 'bg-base-200/50' : ''}`}>
                      <td>
                        <input type="checkbox" className="checkbox checkbox-sm" checked={selectedIds.includes(rec.id)} onChange={() => handleSelectRow(rec.id)} />
                      </td>
                      <td className="text-xs font-medium">{rec.production_date}</td>
                      <td className="font-mono font-bold text-primary text-xs">{rec.batch_no}</td>
                      <td className="font-bold text-sm">
                        {rec.inventory?.product_name || '-'} <span className="opacity-60 font-normal">({rec.quantity} unit)</span>
                      </td>
                      <td className="text-right font-black text-success">RM {flatWage.toFixed(2)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* SUMMARY CARD */}
        <div className="card bg-base-100 border border-base-200 shadow-xl p-6 flex flex-col justify-between h-fit space-y-4">
          <div className="space-y-4">
            <h3 className="text-lg font-black text-accent">💰 Rumusan Pilihan ({selectedIds.length})</h3>
            <div className="divider my-1"></div>
            <div className="p-4 bg-base-200 rounded-2xl border border-base-300 flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wider font-black opacity-50 text-success">Jumlah Upah Terpilih</span>
              <span className="text-3xl font-black text-success">RM {totalWagesDue.toFixed(2)}</span>
            </div>
            <button onClick={generateFormatText} disabled={selectedIds.length === 0} className="btn btn-accent btn-md btn-block text-white font-bold rounded-xl shadow-sm mt-2">
              ⚡ Generate Format Teks
            </button>
          </div>

          {paymentStatus === 'unpaid' && selectedIds.length > 0 && (
            <button onClick={() => setIsPaidModalOpen(true)} className="btn btn-success btn-block text-white font-black rounded-xl shadow-md">
              ✅ Mark As Paid ({selectedIds.length})
            </button>
          )}
        </div>
      </div>

      {/* MODAL JANAAN TEKS */}
      {isTextModalOpen && (
        <div className="modal modal-open z-50">
          <div className="modal-box border border-base-200 shadow-2xl rounded-2xl p-6 max-w-md">
            <h3 className="font-bold text-xl text-primary mb-3">📋 Salinan Teks Upah</h3>
            <pre className="p-4 bg-base-300 rounded-xl text-xs font-mono whitespace-pre-wrap max-h-64 overflow-y-auto border border-base-200 select-all">
              {generatedText}
            </pre>
            <div className="modal-action gap-2 border-t border-base-200 pt-3">
              <button type="button" className="btn btn-sm btn-ghost rounded-lg" onClick={() => setIsTextModalOpen(false)}>Tutup</button>
              <button type="button" onClick={copyToClipboard} className="btn btn-sm btn-primary rounded-lg font-bold px-4">Copy Teks</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MARK AS PAID */}
      {isPaidModalOpen && (
        <div className="modal modal-open z-50">
          <div className="modal-box border border-base-200 shadow-2xl rounded-2xl p-6 max-w-sm">
            <h3 className="font-bold text-xl text-success mb-2">💸 Sahkan Pembayaran</h3>
            <p className="text-xs opacity-70 mb-4">Sila semak tarikh bayaran upah untuk disimpan sebagai rekod master transaksi.</p>
            <form onSubmit={handleMarkAsPaidSubmit} className="space-y-4">
              <div className="form-control">
                <label className="label-text font-bold mb-1 text-xs">Tarikh Pembayaran (Date Paid)</label>
                <input type="date" required className="input input-bordered w-full font-bold text-base" value={customPaidDate} onChange={(e) => setCustomPaidDate(e.target.value)} />
              </div>
              <div className="p-3 bg-base-200 rounded-xl text-center border border-base-300">
                <span className="text-xs block opacity-60 font-semibold">Total Upah Ditransfer</span>
                <span className="text-xl font-black text-success">RM {totalWagesDue.toFixed(2)}</span>
              </div>
              <div className="modal-action gap-2 border-t border-base-200 pt-3">
                <button type="button" className="btn btn-sm btn-ghost rounded-lg" onClick={() => setIsPaidModalOpen(false)}>Batal</button>
                <button type="submit" disabled={loading} className="btn btn-sm btn-success rounded-lg font-bold text-white px-4">Sahkan & Bayar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}