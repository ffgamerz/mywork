import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from './supabaseClient'

const ADS_PLATFORMS = [
  { value: 'tiktok', label: 'TikTok' },
  { value: 'shopee', label: 'Shopee' }
]

export default function AdsRecordManager({ session }) {
  const [records, setRecords] = useState([])
  const [payments, setPayments] = useState([])
  const [amount, setAmount] = useState('')
  const [adsPlatform, setAdsPlatform] = useState('tiktok')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [loadingFetch, setLoadingFetch] = useState(false)
  const [loadingSave, setLoadingSave] = useState(false)
  const [loadingDelete, setLoadingDelete] = useState(false)
  const [loadingPayments, setLoadingPayments] = useState(false)
  const [loadingMarkAsPaid, setLoadingMarkAsPaid] = useState(false)
  const [checkedIds, setCheckedIds] = useState([])
  const [generatedText, setGeneratedText] = useState('')
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' })
  const [editingRecord, setEditingRecord] = useState(null)
  const [editAmount, setEditAmount] = useState('')
  const [editAdsPlatform, setEditAdsPlatform] = useState('tiktok')
  const [editDate, setEditDate] = useState('')
  const [activeTab, setActiveTab] = useState('records')
  const [selectedPayment, setSelectedPayment] = useState(null)
  const [editingLinks, setEditingLinks] = useState(false)
  const [transferOwnAccLink, setTransferOwnAccLink] = useState('')
  const [transferCcLink, setTransferCcLink] = useState('')
  const [loadingLinks, setLoadingLinks] = useState(false)

  const showToast = (message, severity = 'success') => { setToast({ open: true, message, severity }); setTimeout(() => setToast({ open: false, message: '', severity: 'success' }), 3000) }

  const userId = session?.user?.id

  // --- Fetch records (includes payment_id) ---
  const fetchRecords = useCallback(async () => {
    if (!userId) return
    setLoadingFetch(true)
    const { data, error } = await supabase.from('records').select('*').eq('user_id', userId).order('date', { ascending: false })
    if (error) console.error('Error fetching data:', error.message); else setRecords(data || [])
    setLoadingFetch(false)
  }, [userId])

  // --- Fetch payments ---
  const fetchPayments = useCallback(async () => {
    if (!userId) return
    setLoadingPayments(true)
    const { data, error } = await supabase
      .from('ads_payment')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) console.error('Error fetching payments:', error.message); else setPayments(data || [])
    setLoadingPayments(false)
  }, [userId])

  const fetchData = useCallback(() => {
    fetchRecords()
    fetchPayments()
  }, [fetchRecords, fetchPayments])

  useEffect(() => {
    let mounted = true
    if (userId) {
      Promise.resolve().then(() => { if (mounted) fetchData() })
    }
    return () => { mounted = false }
  }, [userId, fetchData])

  // --- Only show unpaid records (payment_id IS NULL) ---
  const unpaidRecords = useMemo(
    () => records.filter(r => !r.payment_id).sort((a, b) => new Date(a.date) - new Date(b.date)),
    [records]
  )

  // --- Compute selected records & total ---
  const totalSelectedAmount = useMemo(() => {
    return unpaidRecords.filter(rec => checkedIds.includes(rec.id)).reduce((sum, rec) => sum + (parseFloat(rec.amount) || 0), 0)
  }, [unpaidRecords, checkedIds])

  // --- Submit new record ---
  const handleSubmit = async (e) => {
    e.preventDefault(); setLoadingSave(true)
    const { error } = await supabase.from('records').insert([{ user_id: session.user.id, title: `RM ${parseFloat(amount).toFixed(2)}`, amount: parseFloat(amount) || 0, ads_platform: adsPlatform, date }])
    if (error) showToast('Failed to save data: ' + error.message, 'error'); else { setAmount(''); setAdsPlatform('tiktok'); showToast('Record saved successfully!'); fetchRecords() }
    setLoadingSave(false)
  }

  const handleStartEdit = (rec) => { setEditingRecord(rec); setEditAmount(rec.amount); setEditAdsPlatform(rec.ads_platform || 'tiktok'); setEditDate(rec.date || new Date().toISOString().split('T')[0]) }

  const handleUpdateRecord = async (e) => {
    e.preventDefault(); setLoadingSave(true)
    const { error } = await supabase.from('records').update({ title: `RM ${parseFloat(editAmount).toFixed(2)}`, amount: parseFloat(editAmount) || 0, ads_platform: editAdsPlatform, date: editDate }).eq('id', editingRecord.id)
    if (error) showToast('Failed to update data: ' + error.message, 'error'); else { setEditingRecord(null); showToast('Record updated successfully!'); fetchRecords() }
    setLoadingSave(false)
  }

  // --- Checkbox handlers (operate on unpaidRecords) ---
  const handleCheckRow = (id) => { setCheckedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]) }
  const handleCheckAll = (e) => { setCheckedIds(e.target.checked ? unpaidRecords.map(rec => rec.id) : []) }

  const handleDeleteChecked = async () => {
    if (checkedIds.length === 0) return
    if (!window.confirm(`Are you sure you want to delete ${checkedIds.length} selected record(s)?`)) return
    setLoadingDelete(true)
    const { error } = await supabase.from('records').delete().in('id', checkedIds)
    if (error) showToast('Failed to delete records: ' + error.message, 'error'); else { setCheckedIds([]); setGeneratedText(''); showToast('Records deleted successfully!'); fetchRecords() }
    setLoadingDelete(false)
  }

  // --- Mark as Paid (bulk: create 1 payment, link all checked records) ---
  const handleMarkAsPaid = async () => {
    if (checkedIds.length === 0) return
    if (!window.confirm(`Mark ${checkedIds.length} record(s) as paid?`)) return
    setLoadingMarkAsPaid(true)
    const totalAmount = totalSelectedAmount
    // 1. Create payment
    const { data: paymentData, error: payError } = await supabase.from('ads_payment').insert([{
      total_amount: totalAmount,
      paid_date: new Date().toISOString().split('T')[0]
    }]).select('id').single()
    if (payError) { showToast('Failed to create payment: ' + payError.message, 'error'); setLoadingMarkAsPaid(false); return }
    // 2. Link records to payment
    const { error: linkError } = await supabase.from('records').update({ payment_id: paymentData.id }).in('id', checkedIds)
    if (linkError) { showToast('Failed to link records: ' + linkError.message, 'error') }
    else { setCheckedIds([]); showToast(`${checkedIds.length} record(s) marked as paid!`); fetchRecords(); fetchPayments() }
    setLoadingMarkAsPaid(false)
  }

  // --- Mark single record as paid ---
  const handleMarkSingleAsPaid = async (rec) => {
    setLoadingMarkAsPaid(true)
    // 1. Create payment
    const { data: paymentData, error: payError } = await supabase.from('ads_payment').insert([{
      total_amount: parseFloat(rec.amount) || 0,
      paid_date: new Date().toISOString().split('T')[0]
    }]).select('id').single()
    if (payError) { showToast('Failed to create payment: ' + payError.message, 'error'); setLoadingMarkAsPaid(false); return }
    // 2. Link record to payment
    const { error: linkError } = await supabase.from('records').update({ payment_id: paymentData.id }).eq('id', rec.id)
    if (linkError) { showToast('Failed to link record: ' + linkError.message, 'error') }
    else { showToast('Record marked as paid!'); fetchRecords(); fetchPayments() }
    setLoadingMarkAsPaid(false)
  }

  const handleGenerate = () => {
    if (checkedIds.length === 0) return
    const selectedRecords = unpaidRecords.filter(rec => checkedIds.includes(rec.id))
    const lines = selectedRecords.map(rec => `Date : ${rec.date} - RM ${parseFloat(rec.amount).toFixed(2)} (${rec.ads_platform === 'tiktok' ? 'TikTok' : 'Shopee'})`)
    setGeneratedText(['For Credit Card Payment', 'Advertising', ...lines].join('\n'))
  }

  const handleCopyToClipboard = () => { navigator.clipboard.writeText(generatedText); showToast('Transaction notes copied successfully!') }

  const handleCopyTotalNumberOnly = () => { navigator.clipboard.writeText(totalSelectedAmount.toFixed(2)); showToast(`Amount ${totalSelectedAmount.toFixed(2)} copied successfully!`) }

  // --- Toggle payment detail popup ---
  const openPaymentDetail = (pay) => {
    setSelectedPayment(pay)
    setTransferOwnAccLink(pay.transfer_own_acc_link || '')
    setTransferCcLink(pay.transfer_cc_link || '')
    setEditingLinks(false)
  }
  const closePaymentDetail = () => setSelectedPayment(null)

  const startEditingLinks = () => {
    setTransferOwnAccLink(selectedPayment?.transfer_own_acc_link || '')
    setTransferCcLink(selectedPayment?.transfer_cc_link || '')
    setEditingLinks(true)
  }

  const saveLinks = async () => {
    if (!selectedPayment) return
    setLoadingLinks(true)
    const { error } = await supabase
      .from('ads_payment')
      .update({
        transfer_own_acc_link: transferOwnAccLink || null,
        transfer_cc_link: transferCcLink || null,
      })
      .eq('id', selectedPayment.id)
    if (error) {
      showToast('Failed to save links: ' + error.message, 'error')
    } else {
      setSelectedPayment(prev => ({
        ...prev,
        transfer_own_acc_link: transferOwnAccLink || null,
        transfer_cc_link: transferCcLink || null,
      }))
      showToast('Transfer links saved!')
    }
    setEditingLinks(false)
    setLoadingLinks(false)
  }

  // Get record details for a payment — records WHERE payment_id = pay.id
  const getRecordsForPayment = (payment) => {
    return records.filter(r => r.payment_id === payment.id)
  }

  // --- Render Records tab ---
  const renderRecordsTab = () => (
    <div className="card p-3">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <span className="text-muted text-13">Unpaid Records List</span>
        <div className="d-flex gap-2 align-items-center flex-wrap">
          {checkedIds.length > 0 && (
            <div className="selected-total-box d-flex align-items-center gap-1">
              <span className="text-muted text-12">Selected Total:</span>
              <span className="fw-bold text-white text-13">RM {totalSelectedAmount.toFixed(2)}</span>
              <button className="btn btn-sm btn-link p-0 d-flex align-items-center justify-content-center w-20 h-20 text-secondary-custom" onClick={handleCopyTotalNumberOnly}>
                <svg className="icon-svg-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
              </button>
            </div>
          )}
          <button className="btn btn-sm btn-outline-warning fw-semibold" onClick={handleMarkAsPaid} disabled={checkedIds.length === 0 || loadingMarkAsPaid || loadingSave}>
            {loadingMarkAsPaid ? <span className="spinner-border spinner-border-sm"></span> : 'Mark as Paid'}
          </button>
          <button className="btn btn-sm btn-outline-success d-none d-sm-inline-block fw-semibold" onClick={handleGenerate} disabled={checkedIds.length === 0 || loadingSave}>Generate ({checkedIds.length})</button>
          <button className="btn btn-sm fw-semibold btn-outline-danger" onClick={handleDeleteChecked} disabled={checkedIds.length === 0 || loadingDelete}>
            {loadingDelete ? <span className="spinner-border spinner-border-sm"></span> : 'Delete'}
          </button>
        </div>
      </div>

      {loadingFetch ? <div className="text-center py-5"><span className="spinner-border"></span></div> : unpaidRecords.length === 0 ? <div className="text-center py-5 text-muted fw-semibold">No unpaid records.</div> : (
        <div className="overflow-x-auto">
          <table className="table table-hover">
            <thead><tr><th className="w-40"><input type="checkbox" className="form-check-input" checked={unpaidRecords.length > 0 && checkedIds.length === unpaidRecords.length} onChange={handleCheckAll} /></th><th>No.</th><th>Date</th><th>Ads Platform</th><th className="text-end">Amount (RM)</th><th className="text-end">Tindakan</th></tr></thead>
            <tbody>{unpaidRecords.map((rec, index) => (
              <tr key={rec.id} className={checkedIds.includes(rec.id) ? 'row-selected' : ''}>
                <td><input type="checkbox" className="form-check-input" checked={checkedIds.includes(rec.id)} onChange={() => handleCheckRow(rec.id)} /></td>
                <td className="font-mono text-13 text-secondary-custom">{index + 1}</td>
                <td className="text-13 text-nowrap text-white">{rec.date}</td>
                <td><span className="chip-custom">{rec.ads_platform === 'tiktok' ? 'TikTok' : 'Shopee'}</span></td>
                <td className="text-end text-13 text-white">{parseFloat(rec.amount).toFixed(2)}
                  <button className="btn btn-sm btn-link p-0 d-inline-flex align-items-center justify-content-center w-20 h-20 text-tertiary ms-1" onClick={() => handleStartEdit(rec)}>
                    <svg className="icon-svg-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  </button>
                </td>
                <td className="text-end">
                  <button className="btn btn-sm btn-outline-warning fw-semibold" onClick={() => handleMarkSingleAsPaid(rec)} disabled={loadingMarkAsPaid} title="Mark as paid">
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>paid</span>
                  </button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )

  // --- Render Payment History tab ---
  const renderPaymentsTab = () => (
    <div className="card p-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <span className="text-muted text-13">Payment History</span>
      </div>

      {loadingPayments ? <div className="text-center py-5"><span className="spinner-border"></span></div> : payments.length === 0 ? <div className="text-center py-5 text-muted fw-semibold">No payment records yet.</div> : (
        <div className="overflow-x-auto">
          <table className="table table-hover">
            <thead><tr><th>#</th><th>Paid Date</th><th className="text-end">Total Amount (RM)</th></tr></thead>
            <tbody>{payments.map((pay, index) => (
              <tr key={pay.id} onClick={() => openPaymentDetail(pay)} style={{ cursor: 'pointer' }}>
                <td className="font-mono text-13 text-secondary-custom">{index + 1}</td>
                <td className="text-13 text-nowrap text-white">{pay.paid_date}</td>
                <td className="text-end text-13 text-white fw-bold">RM {parseFloat(pay.total_amount || 0).toFixed(2)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {payments.length > 0 && (
        <div className="mt-3 d-flex justify-content-end align-items-center gap-2">
          <span className="text-muted text-13 fw-semibold">Total Paid:</span>
          <span className="fw-bold text-white fs-6">RM {payments.reduce((sum, p) => sum + (parseFloat(p.total_amount) || 0), 0).toFixed(2)}</span>
        </div>
      )}

      {/* Payment Detail Popup */}
      {selectedPayment && (
        <>
          <div className="modal-backdrop show" onClick={closePaymentDetail}></div>
          <div className="modal d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content p-3">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <h5 className="fw-bold text-accent mb-0">Payment Details</h5>
                  <button type="button" className="btn-close btn-close-danger" onClick={closePaymentDetail}></button>
                </div>
                <div className="mb-3 text-muted small">
                  Paid Date: <span className="text-white fw-medium">{selectedPayment.paid_date}</span>
                </div>
                <div className="mb-3">
                  <div className="d-flex justify-content-end mb-2">
                    <span className="fw-bold text-white">Total: RM {parseFloat(selectedPayment.total_amount || 0).toFixed(2)}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="table table-sm table-hover mb-0">
                      <thead><tr><th>Date</th><th>Ads Platform</th><th className="text-end">Amount (RM)</th></tr></thead>
                      <tbody>
                        {getRecordsForPayment(selectedPayment).length === 0 ? (
                          <tr><td colSpan={3} className="text-center text-muted small py-3">Tiada rekod dalam payment ini.</td></tr>
                        ) : getRecordsForPayment(selectedPayment).map((rec) => (
                          <tr key={rec.id}>
                            <td className="text-13 text-nowrap text-white">{rec.date}</td>
                            <td><span className="chip-custom">{rec.ads_platform === 'tiktok' ? 'TikTok' : 'Shopee'}</span></td>
                            <td className="text-end text-13 text-white">{parseFloat(rec.amount).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                {/* Transfer receipt links — icon-only, bottom of modal */}
                <div className="d-flex justify-content-start align-items-center gap-2 mt-3 pt-2 border-top border-default">
                  {editingLinks ? (
                    <input type="url" className="form-control form-control-sm w-100" placeholder="own account transfer link" value={transferOwnAccLink} onChange={(e) => setTransferOwnAccLink(e.target.value)} />
                  ) : selectedPayment.transfer_own_acc_link ? (
                    <button type="button" className="btn btn-sm btn-outline-secondary" title="Own Acc Transfer" onClick={() => window.open(selectedPayment.transfer_own_acc_link, '_blank', 'noopener,noreferrer')}>
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>account_balance</span>
                    </button>
                  ) : (
                    <span className="text-muted text-11 fst-italic">No own acc transfer</span>
                  )}
                  {editingLinks ? (
                    <input type="url" className="form-control form-control-sm w-100" placeholder="credit card transfer link" value={transferCcLink} onChange={(e) => setTransferCcLink(e.target.value)} />
                  ) : selectedPayment.transfer_cc_link ? (
                    <button type="button" className="btn btn-sm btn-outline-secondary" title="CC Transfer" onClick={() => window.open(selectedPayment.transfer_cc_link, '_blank', 'noopener,noreferrer')}>
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>credit_card</span>
                    </button>
                  ) : (
                    <span className="text-muted text-11 fst-italic">No CC transfer</span>
                  )}
                </div>
                <div className="d-flex justify-content-between align-items-center mt-3">
                  <div>
                    {!editingLinks ? (
                      <button type="button" className="btn btn-sm btn-outline-primary fw-bold" onClick={startEditingLinks}>
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>edit</span> Edit Links
                      </button>
                    ) : (
                      <>
                        <button type="button" className="btn btn-sm btn-primary fw-bold me-2" onClick={saveLinks} disabled={loadingLinks}>
                          {loadingLinks ? <span className="spinner-border spinner-border-sm"></span> : <><span className="material-symbols-outlined" style={{ fontSize: '14px' }}>save</span> Save</>}
                        </button>
                        <button type="button" className="btn btn-sm btn-link fw-bold" onClick={() => { setEditingLinks(false); setTransferOwnAccLink(selectedPayment?.transfer_own_acc_link || ''); setTransferCcLink(selectedPayment?.transfer_cc_link || '') }}>
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                  <button type="button" className="btn btn-sm btn-link" onClick={closePaymentDetail}>Tutup</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )

  return (
    <div className="max-w-1200 mx-auto">
      {toast.open && (
        <div className="toast-container-custom">
          <div className={`d-flex align-items-center gap-2 px-3 py-2 rounded-pill shadow-lg fw-600 text-14 text-white ${toast.severity === 'error' ? 'bg-error' : 'bg-success'}`}>
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      <div className="page-header-custom">
        <h1 className="page-title-custom"><span className="material-symbols-outlined me-2" style={{ fontSize: '24px', verticalAlign: 'middle' }}>bar_chart</span> Ads Record Manager</h1>
        <p className="page-subtitle-custom">Track payments, amounts, and manage financial outputs.</p>
      </div>

      {/* Tab Navigation */}
      <div className="mb-3">
        <div className="d-flex gap-2 flex-wrap">
          <button
            className={`btn btn-sm fw-semibold ${activeTab === 'records' ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setActiveTab('records')}
          >
            <i className="bi bi-table me-1"></i> Records
          </button>
          <button
            className={`btn btn-sm fw-semibold ${activeTab === 'payments' ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setActiveTab('payments')}
          >
            <i className="bi bi-wallet2 me-1"></i> Payment History
          </button>
        </div>
      </div>

      {activeTab === 'records' && (
        <div className="row g-3">
          <div className="col-lg-4">
            <div className="card p-3 h-100">
              <h6 className="fw-bold mb-3 text-accent">Add New Record</h6>
              <form onSubmit={handleSubmit}>
                <div className="mb-3"><label className="form-label">Date</label><input type="date" className="form-control" required value={date} onChange={(e) => setDate(e.target.value)} /></div>
                <div className="mb-3"><label className="form-label">Amount (RM)</label><input type="number" step="0.01" className="form-control" required placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></div>
                <div className="mb-3"><label className="form-label">Ads Platform</label><select className="form-select" value={adsPlatform} onChange={(e) => setAdsPlatform(e.target.value)} required>{ADS_PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
                <button type="submit" className="btn btn-primary w-100 fw-bold" disabled={loadingSave}>{loadingSave ? <span className="spinner-border spinner-border-sm"></span> : 'Save Record'}</button>
              </form>
            </div>
          </div>

          <div className="col-lg-8">
            {renderRecordsTab()}
          </div>
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="row g-3">
          <div className="col-12">
            {renderPaymentsTab()}
          </div>
        </div>
      )}

      {generatedText && activeTab === 'records' && (
        <div className="card p-3 mt-3">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h6 className="fw-bold text-accent mb-0">Generated Note Result</h6>
            <button className="btn btn-sm btn-outline-light fw-semibold" onClick={handleCopyToClipboard}>Copy Text</button>
          </div>
          <pre className="p-3 rounded-12 font-mono user-select-all text-13 text-pre-wrap bg-dark-card text-secondary-custom border-default">{generatedText}</pre>
        </div>
      )}

      {editingRecord && (
        <>
          <div className="modal-backdrop show" onClick={() => setEditingRecord(null)}></div>
          <div className="modal d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content p-3">
                <h5 className="fw-bold text-accent mb-3"><span className="material-symbols-outlined me-1" style={{ fontSize: '18px', verticalAlign: 'middle' }}>edit</span> Edit Record</h5>
                <form onSubmit={handleUpdateRecord}>
                  <div className="mb-3"><label className="form-label">Date</label><input type="date" className="form-control" required value={editDate} onChange={(e) => setEditDate(e.target.value)} /></div>
                  <div className="mb-3"><label className="form-label">Amount (RM)</label><input type="number" step="0.01" className="form-control" required value={editAmount} onChange={(e) => setEditAmount(e.target.value)} inputMode="decimal" /></div>
                  <div className="mb-3"><label className="form-label">Ads Platform</label><select className="form-select" value={editAdsPlatform} onChange={(e) => setEditAdsPlatform(e.target.value)} required>{ADS_PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
                  <div className="d-flex gap-2 justify-content-end">
                    <button type="button" className="btn btn-sm btn-link" onClick={() => setEditingRecord(null)}>Cancel</button>
                    <button type="submit" className="btn btn-sm btn-primary fw-bold" disabled={loadingSave}>{loadingSave ? <span className="spinner-border spinner-border-sm"></span> : 'Save Changes'}</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
