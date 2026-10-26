import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from './supabaseClient'
import ToastBar from './components/ToastBar'
import { useToast } from './utils/useToast'
import AccessDenied from './components/AccessDenied'
import { cleanRole } from './utils/role'
import { localToday, paidDateError } from './utils/paidDate'

export default function ReceiptManager({ session, userRole, allowedModules = {} }) {
  const { toast, showToast, hideToast } = useToast()
  const [records, setRecords] = useState([])
  const [payments, setPayments] = useState([])
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0])
  const [amount, setAmount] = useState('')
  const [wageAmount, setWageAmount] = useState('35.00')
  const [editingId, setEditingId] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [generatedText, setGeneratedText] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingPayments, setLoadingPayments] = useState(false)
  const [loadingMarkAsPaid, setLoadingMarkAsPaid] = useState(false)
  const [loadingLinks, setLoadingLinks] = useState(false)
  const [activeTab, setActiveTab] = useState('records')
  const [selectedPayment, setSelectedPayment] = useState(null)
  const [editingLinks, setEditingLinks] = useState(false)
  const [bankReceiptLink, setBankReceiptLink] = useState('')
  const [purchaseReceiptLink, setPurchaseReceiptLink] = useState('')
  const [markPaidTarget, setMarkPaidTarget] = useState(null) // { ids, amount } awaiting confirmation
  const [markPaidDate, setMarkPaidDate] = useState('')
  const [editingPaidDate, setEditingPaidDate] = useState(false)
  const [paidDateDraft, setPaidDateDraft] = useState('')
  const [loadingPaidDate, setLoadingPaidDate] = useState(false)

  const cleanedRole = cleanRole(userRole)
  const isAuthorized = cleanedRole === 'super_admin' || cleanedRole === 'admin' || allowedModules['receiptManager'] === true

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('receipt_records')
      .select('*')
      .order('receipt_date', { ascending: false })
    if (!error && data) setRecords(data)
    setLoading(false)
  }, [])

  const fetchPayments = useCallback(async () => {
    setLoadingPayments(true)
    const { data, error } = await supabase
      .from('receipts_payment')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error && data) setPayments(data)
    setLoadingPayments(false)
  }, [])

  const fetchData = useCallback(() => {
    fetchRecords()
    fetchPayments()
  }, [fetchRecords, fetchPayments])

  useEffect(() => {
    let mounted = true
    if (isAuthorized) {
      Promise.resolve().then(() => { if (mounted) fetchData() })
    }
    return () => { mounted = false }
  }, [isAuthorized, fetchData])

  // --- Only show unpaid receipts (payment_id IS NULL) ---
  const unpaidRecords = useMemo(
    () => records.filter(r => !r.payment_id),
    [records]
  )

  const totalSelectedAmount = useMemo(() => {
    return unpaidRecords.filter(r => selectedIds.includes(r.id)).reduce((sum, r) => sum + (r.amount || 0), 0)
  }, [unpaidRecords, selectedIds])

  if (!isAuthorized) {
    return <AccessDenied message="Access Denied: You do not have permission to view this page." />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!amount) return
    setLoading(true)
    if (editingId) {
      const { error } = await supabase
        .from('receipt_records')
        .update({ receipt_date: receiptDate, amount: parseFloat(amount) })
        .eq('id', editingId)
      if (!error) { setEditingId(null); setAmount('') }
    } else {
      const { error } = await supabase
        .from('receipt_records')
        .insert([{ receipt_date: receiptDate, amount: parseFloat(amount), user_id: session.user.id }])
      if (!error) setAmount('')
    }
    fetchRecords()
  }

  const handleEdit = (rec) => {
    setEditingId(rec.id)
    setReceiptDate(rec.receipt_date)
    setAmount(rec.amount.toString())
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this record?')) return
    const { error } = await supabase.from('receipt_records').delete().eq('id', id)
    if (!error) { setSelectedIds(selectedIds.filter(sid => sid !== id)); fetchRecords() }
  }

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} selected records?`)) return
    const { error } = await supabase.from('receipt_records').delete().in('id', selectedIds)
    if (!error) { setSelectedIds([]); fetchRecords() }
  }

  const handleSelectRow = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id])
  }

  const handleSelectAll = () => {
    if (selectedIds.length === unpaidRecords.length) setSelectedIds([])
    else setSelectedIds(unpaidRecords.map(r => r.id))
  }

  // --- Mark as Paid: open a confirmation with an editable paid date (default today) ---
  const handleMarkAsPaid = () => {
    if (selectedIds.length === 0) return
    setMarkPaidDate(localToday())
    setMarkPaidTarget({ ids: [...selectedIds], amount: totalSelectedAmount, bulk: true })
  }

  const handleMarkSingleAsPaid = (rec) => {
    setMarkPaidDate(localToday())
    setMarkPaidTarget({ ids: [rec.id], amount: parseFloat(rec.amount) || 0, bulk: false })
  }

  const confirmMarkAsPaid = async () => {
    if (!markPaidTarget) return
    const dateError = paidDateError(markPaidDate)
    if (dateError) { showToast(dateError, 'error'); return }
    const { ids, amount, bulk } = markPaidTarget
    setLoadingMarkAsPaid(true)
    const wage = parseFloat(wageAmount) || 0
    const { data: paymentData, error: payError } = await supabase
      .from('receipts_payment')
      .insert([{ total_amount: amount + wage, wage_amount: wage, paid_date: markPaidDate }])
      .select('id').single()
    if (payError) { showToast('Failed to create payment: ' + payError.message, 'error') }
    else {
      const { error: linkError } = await supabase
        .from('receipt_records')
        .update({ payment_id: paymentData.id })
        .in('id', ids)
      if (linkError) { showToast('Failed to link records: ' + linkError.message, 'error') }
      else {
        if (bulk) setSelectedIds([])
        setMarkPaidTarget(null)
        showToast(ids.length > 1 ? `${ids.length} receipt(s) marked as paid!` : 'Receipt marked as paid!')
        fetchPayments(); fetchRecords()
      }
    }
    setLoadingMarkAsPaid(false)
  }

  const generateFormatText = () => {
    const selectedRecords = unpaidRecords.filter(r => selectedIds.includes(r.id))
    if (selectedRecords.length === 0) { setGeneratedText('Please select a receipt first to generate text.'); return }
    const sorted = [...selectedRecords].sort((a, b) => new Date(a.receipt_date) - new Date(b.receipt_date))
    let text = `Beli Barang Untuk Pes Production\n`
    sorted.forEach((rec, index) => {
      const [year, month, day] = rec.receipt_date.split('-')
      const formattedDate = `${parseInt(day)}/${parseInt(month)}/${year}`
      text += `Receipt ${index + 1}: RM${rec.amount.toFixed(2)} - ${formattedDate}\n`
    })
    text += `\nUpah: RM${parseFloat(wageAmount || 0).toFixed(2)}`
    setGeneratedText(text)
  }

  const copyToClipboard = () => {
    if (!generatedText) return
    navigator.clipboard.writeText(generatedText)
    showToast('Text copied successfully!')
  }

  const copyTotalAmount = () => {
    if (selectedIds.length === 0) return
    const total = (totalSelectedAmount + parseFloat(wageAmount || 0)).toFixed(2)
    navigator.clipboard.writeText(total)
    showToast('Text copied successfully!')
  }

  // Get receipt records for a payment
  const getRecordsForPayment = (payment) => {
    return records.filter(r => r.payment_id === payment.id)
  }

  const openPaymentDetail = (pay) => {
    setSelectedPayment(pay)
    setBankReceiptLink(pay.bank_receipt_link || '')
    setPurchaseReceiptLink(pay.purchase_receipt_link || '')
    setEditingLinks(false)
    setEditingPaidDate(false)
    setPaidDateDraft(pay.paid_date || '')
  }
  const closePaymentDetail = () => { setSelectedPayment(null); setEditingPaidDate(false) }

  const startEditingPaidDate = () => {
    setPaidDateDraft(selectedPayment?.paid_date || localToday())
    setEditingPaidDate(true)
  }
  const cancelEditingPaidDate = () => {
    setPaidDateDraft(selectedPayment?.paid_date || '')
    setEditingPaidDate(false)
  }

  // Explicit save only. Guarded: updates only if paid_date is still what we loaded.
  const savePaidDate = async () => {
    if (!selectedPayment) return
    const dateError = paidDateError(paidDateDraft)
    if (dateError) { showToast(dateError, 'error'); return }
    if (paidDateDraft === selectedPayment.paid_date) { setEditingPaidDate(false); return }
    setLoadingPaidDate(true)
    let query = supabase.from('receipts_payment').update({ paid_date: paidDateDraft }).eq('id', selectedPayment.id)
    query = selectedPayment.paid_date ? query.eq('paid_date', selectedPayment.paid_date) : query.is('paid_date', null)
    const { data, error } = await query.select('id, paid_date')
    if (error) {
      showToast('Failed to save paid date: ' + error.message, 'error')
    } else if (!data || data.length === 0) {
      showToast('Paid date was changed elsewhere. Reloaded, please try again.', 'error')
      fetchPayments()
    } else {
      const updated = data[0].paid_date
      setSelectedPayment(prev => ({ ...prev, paid_date: updated }))
      setPayments(prev => prev.map(p => (p.id === selectedPayment.id ? { ...p, paid_date: updated } : p)))
      setEditingPaidDate(false)
      showToast('Paid date saved!')
    }
    setLoadingPaidDate(false)
  }

  const startEditingLinks = () => {
    setBankReceiptLink(selectedPayment?.bank_receipt_link || '')
    setPurchaseReceiptLink(selectedPayment?.purchase_receipt_link || '')
    setEditingLinks(true)
  }

  const saveLinks = async () => {
    if (!selectedPayment) return
    setLoadingLinks(true)
    const { error } = await supabase
      .from('receipts_payment')
      .update({
        bank_receipt_link: bankReceiptLink || null,
        purchase_receipt_link: purchaseReceiptLink || null,
      })
      .eq('id', selectedPayment.id)
    if (error) {
      showToast('Failed to save links: ' + error.message, 'error')
    } else {
      setSelectedPayment(prev => ({
        ...prev,
        bank_receipt_link: bankReceiptLink || null,
        purchase_receipt_link: purchaseReceiptLink || null,
      }))
      showToast('Receipt links saved!')
    }
    setEditingLinks(false)
    setLoadingLinks(false)
  }

  const renderReceiptsTab = () => (
    <>
      <div className="card p-3 mb-3">
        <h6 className="fw-bold mb-3 text-primary"><span className="material-symbols-outlined me-1 icon-md">receipt</span> {editingId ? 'Update Receipt' : 'Register New Receipt'}</h6>
        <form onSubmit={handleSubmit} className="d-flex flex-wrap gap-3 align-items-end">
          <div className="flex-grow-1">
            <label className="form-label">Receipt Date</label>
            <input type="date" className="form-control" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} required />
          </div>
          <div className="flex-grow-1">
            <label className="form-label">Amount Total (RM)</label>
            <input type="number" step="0.01" placeholder="407.90" className="form-control fw-bold" value={amount} onChange={(e) => setAmount(e.target.value)} required inputMode="decimal" />
          </div>
          <div className="d-flex gap-2">
            <button type="submit" disabled={loading} className="btn btn-primary fw-bold">{editingId ? 'Save' : 'Add'}</button>
            {editingId && <button type="button" className="btn btn-link fw-bold" onClick={() => { setEditingId(null); setAmount('') }}>Cancel</button>}
          </div>
        </form>
      </div>

      <div className="row g-4">
        <div className="col-lg-8">
          <div className="card p-3 overflow-x-auto">
            <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
              <h6 className="fw-bold text-white mb-0"><span className="material-symbols-outlined me-1 icon-md">description</span> Unpaid Receipt Records</h6>
              {selectedIds.length > 0 && (
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <span className="fw-bold text-primary">Selected Total: RM {(totalSelectedAmount + parseFloat(wageAmount || 0)).toFixed(2)}</span>
                  <button onClick={handleMarkAsPaid} disabled={loadingMarkAsPaid} className="btn btn-sm btn-outline-warning fw-bold">
                    {loadingMarkAsPaid ? <span className="spinner-border spinner-border-sm"></span> : <><span className="material-symbols-outlined me-1" style={{ fontSize: '14px' }}>paid</span> Mark as Paid</>}
                  </button>
                  <button onClick={copyTotalAmount} className="btn btn-sm btn-outline-secondary fw-bold"><span className="material-symbols-outlined me-1" style={{ fontSize: '14px' }}>content_copy</span> Copy</button>
                  <button onClick={handleDeleteSelected} className="btn btn-sm btn-bold btn-danger">
                    Delete ({selectedIds.length})
                  </button>
                </div>
              )}
            </div>
            <div className="table-responsive"><table className="table">
              <thead>
                <tr>
                  <th><input type="checkbox" className="form-check-input" checked={unpaidRecords.length > 0 && selectedIds.length === unpaidRecords.length} onChange={handleSelectAll} /></th>
                  <th>Receipt Date</th>
                  <th>Amount Total (RM)</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {unpaidRecords.length === 0 ? (
                  <tr><td colSpan="4" className="text-center text-muted">No unpaid receipts.</td></tr>
                ) : (
                  unpaidRecords.map((rec) => (
                    <tr key={rec.id} className={selectedIds.includes(rec.id) ? 'row-selected' : ''}>
                      <td><input type="checkbox" className="form-check-input" checked={selectedIds.includes(rec.id)} onChange={() => handleSelectRow(rec.id)} /></td>
                      <td className="fw-medium text-white">{rec.receipt_date}</td>
                      <td>RM {rec.amount.toFixed(2)}</td>
                      <td className="d-flex gap-2 justify-content-center">
                        <button onClick={() => handleMarkSingleAsPaid(rec)} className="btn btn-sm btn-link fw-bold text-warning" title="Mark as paid"><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>paid</span></button>
                        <button onClick={() => handleEdit(rec)} className="btn btn-sm btn-link fw-bold text-primary">Edit</button>
                        <button onClick={() => handleDelete(rec.id)} className="btn btn-sm btn-link fw-bold">Delete</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table></div>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="card p-3 d-flex flex-column gap-3">
            <h6 className="fw-bold text-white mb-0"><span className="material-symbols-outlined me-1 icon-md">settings</span> Configuration & Output Text</h6>
            <div>
              <label className="form-label">Wage Rate (RM)</label>
              <input type="number" step="0.01" className="form-control fw-bold" value={wageAmount} onChange={(e) => setWageAmount(e.target.value)} inputMode="decimal" />
            </div>
            <button onClick={generateFormatText} className="btn btn-primary w-100 fw-bold" disabled={selectedIds.length === 0}>Generate Selected Text</button>
            {generatedText && (
              <div className="d-flex flex-column gap-2">
                <pre className="p-3 font-mono user-select-all">
                  {generatedText}
                </pre>
                <button onClick={copyToClipboard} className="btn btn-sm btn-outline-secondary fw-bold">Copy Text</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )

  const renderPaymentsTab = () => (
    <div className="card p-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <span className="text-muted text-13">Payment History</span>
      </div>

      {loadingPayments ? <div className="text-center py-5"><span className="spinner-border"></span></div> : payments.length === 0 ? <div className="text-center py-5 text-muted fw-semibold">No payment records yet.</div> : (
        <div className="overflow-x-auto">
          <div className="table-responsive"><table className="table table-hover">
            <thead><tr><th>#</th><th>Paid Date</th><th className="text-end">Total Amount (RM)</th></tr></thead>
            <tbody>{payments.map((pay, index) => (
              <tr key={pay.id} onClick={() => openPaymentDetail(pay)} style={{ cursor: 'pointer' }}>
                <td className="font-mono text-13 text-secondary-custom">{index + 1}</td>
                <td className="text-13 text-nowrap text-white">{pay.paid_date}</td>
                <td className="text-end text-13 text-white fw-bold">RM {parseFloat(pay.total_amount || 0).toFixed(2)}</td>
              </tr>
            ))}</tbody>
          </table></div>
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
                <div className="mb-3 text-muted small d-flex align-items-center gap-2 flex-wrap">
                  <span>Paid Date:</span>
                  {editingPaidDate ? (
                    <>
                      <input type="date" className="form-control form-control-sm w-auto" aria-label="Paid date" value={paidDateDraft} max={localToday()} onChange={(e) => setPaidDateDraft(e.target.value)} />
                      <button type="button" className="btn btn-sm btn-primary fw-bold" onClick={savePaidDate} disabled={loadingPaidDate}>
                        {loadingPaidDate ? <span className="spinner-border spinner-border-sm"></span> : <><span className="material-symbols-outlined" style={{ fontSize: '14px' }}>save</span> Save</>}
                      </button>
                      <button type="button" className="btn btn-sm btn-link fw-bold" onClick={cancelEditingPaidDate} disabled={loadingPaidDate}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <span className="text-white fw-medium">{selectedPayment.paid_date}</span>
                      <button type="button" className="btn btn-sm btn-outline-primary fw-bold py-0" onClick={startEditingPaidDate} title="Edit paid date">
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>edit</span> Edit
                      </button>
                    </>
                  )}
                </div>
                <div className="mb-3">
                  <div className="d-flex justify-content-end mb-2">
                    <span className="fw-bold text-white">Total (termasuk upah): RM {parseFloat(selectedPayment.total_amount || 0).toFixed(2)}</span>
                  </div>
                  <div className="d-flex justify-content-end mb-2">
                  <span className="text-muted text-13">Wage: RM {parseFloat(selectedPayment.wage_amount || 0).toFixed(2)}</span>
                </div>

                {/* Icon-only receipt link buttons at the bottom */}
                  <div className="overflow-x-auto">
                    <div className="table-responsive"><table className="table table-sm table-hover mb-0">
                      <thead><tr><th>Receipt Date</th><th>Amount (RM)</th></tr></thead>
                      <tbody>
                        {getRecordsForPayment(selectedPayment).length === 0 ? (
                          <tr><td colSpan={2} className="text-center text-muted small py-3">Tiada rekod dalam payment ini.</td></tr>
                        ) : getRecordsForPayment(selectedPayment).map((rec) => (
                          <tr key={rec.id}>
                            <td className="text-13 text-nowrap text-white">{rec.receipt_date}</td>
                            <td className="text-end text-13 text-white">{parseFloat(rec.amount).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table></div>
                  </div>
                </div>
                {/* Icon-only receipt link buttons — bottom of modal */}
                <div className="d-flex justify-content-start align-items-center gap-2 mt-3 pt-2 border-top border-default">
                  {/* Bank Receipt */}
                  {editingLinks ? (
                    <input type="url" className="form-control form-control-sm w-100" placeholder="bank receipt link" value={bankReceiptLink} onChange={(e) => setBankReceiptLink(e.target.value)} />
                  ) : selectedPayment.bank_receipt_link ? (
                    <button type="button" className="btn btn-sm btn-outline-secondary" title="Bank Receipt" onClick={() => window.open(selectedPayment.bank_receipt_link, '_blank', 'noopener,noreferrer')}>
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>account_balance</span>
                    </button>
                  ) : (
                    <span className="text-muted text-11 fst-italic">No bank receipt</span>
                  )}
                  {/* Purchase Receipt */}
                  {editingLinks ? (
                    <input type="url" className="form-control form-control-sm w-100" placeholder="purchase receipt link" value={purchaseReceiptLink} onChange={(e) => setPurchaseReceiptLink(e.target.value)} />
                  ) : selectedPayment.purchase_receipt_link ? (
                    <button type="button" className="btn btn-sm btn-outline-secondary" title="Purchase Receipt" onClick={() => window.open(selectedPayment.purchase_receipt_link, '_blank', 'noopener,noreferrer')}>
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>shopping_basket</span>
                    </button>
                  ) : (
                    <span className="text-muted text-11 fst-italic">No purchase receipt</span>
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
                        <button type="button" className="btn btn-sm btn-link fw-bold" onClick={() => { setEditingLinks(false); setBankReceiptLink(selectedPayment?.bank_receipt_link || ''); setPurchaseReceiptLink(selectedPayment?.purchase_receipt_link || '') }}>
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
      <ToastBar toast={toast} onClose={hideToast} />

      <div className="page-header-custom">
        <h1 className="page-title-custom"><span className="material-symbols-outlined me-2 icon-xl">receipt</span> Receipt Manager</h1>
        <p className="page-subtitle-custom">Open receipts, export details, and manage collection status.</p>
      </div>

      {/* Tab Navigation */}
      <div className="mb-3">
        <ul className="nav nav-tabs">
          <li className="nav-item"><button className={`nav-link fw-bold text-nowrap ${activeTab === 'records' ? 'active' : ''}`} onClick={() => setActiveTab('records')}>Receipts</button></li>
          <li className="nav-item"><button className={`nav-link fw-bold text-nowrap ${activeTab === 'payments' ? 'active' : ''}`} onClick={() => setActiveTab('payments')}>Payment History</button></li>
        </ul>
      </div>

      {activeTab === 'records' && renderReceiptsTab()}
      {activeTab === 'payments' && renderPaymentsTab()}

      {/* Mark as Paid confirmation */}
      {markPaidTarget && (
        <>
          <div className="modal-backdrop show" onClick={() => !loadingMarkAsPaid && setMarkPaidTarget(null)}></div>
          <div className="modal d-block" tabIndex="-1" role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content p-3">
                <h5 className="fw-bold text-accent mb-2">Mark as Paid</h5>
                <p className="text-white mb-2">
                  Mark {markPaidTarget.ids.length} receipt(s) as paid? Total RM {(markPaidTarget.amount + (parseFloat(wageAmount) || 0)).toFixed(2)} (termasuk upah).
                </p>
                <label className="form-label text-muted small mb-1" htmlFor="mark-paid-date">Paid date</label>
                <input id="mark-paid-date" type="date" className="form-control form-control-sm w-auto mb-1" value={markPaidDate} max={localToday()} onChange={(e) => setMarkPaidDate(e.target.value)} />
                {markPaidDate && paidDateError(markPaidDate) && <div className="text-danger small">{paidDateError(markPaidDate)}</div>}
                <div className="d-flex justify-content-end gap-2 mt-3">
                  <button type="button" className="btn btn-sm btn-link fw-bold" onClick={() => setMarkPaidTarget(null)} disabled={loadingMarkAsPaid}>Cancel</button>
                  <button type="button" className="btn btn-sm btn-warning fw-bold" onClick={confirmMarkAsPaid} disabled={loadingMarkAsPaid || !!paidDateError(markPaidDate)}>
                    {loadingMarkAsPaid ? <span className="spinner-border spinner-border-sm"></span> : 'Mark as Paid'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
