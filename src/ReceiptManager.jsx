import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabaseClient'
import ToastBar from './components/ToastBar'
import { useToast } from './utils/useToast'

export default function ReceiptManager({ session, userRole, allowedModules = {} }) {
  const { toast, showToast, hideToast } = useToast()
  const [records, setRecords] = useState([])
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0])
  const [amount, setAmount] = useState('')
  const [wageAmount, setWageAmount] = useState('35.00')
  const [editingId, setEditingId] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [generatedText, setGeneratedText] = useState('')
  const [loading, setLoading] = useState(false)

  const cleanedRole = String(userRole || '').trim().toLowerCase()
  const isAuthorized = cleanedRole === 'super_admin' || cleanedRole === 'admin' || allowedModules['receiptManager'] === true

  useEffect(() => {
    if (isAuthorized) fetchRecords()
  }, [isAuthorized])

  if (!isAuthorized) {
    return (
      <div className="alert-unauthorized">
        <span>🔒 Access Denied: You do not have permission to view this page.</span>
      </div>
    )
  }

  const fetchRecords = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('receipt_records')
      .select('*')
      .order('receipt_date', { ascending: false })
    if (!error && data) setRecords(data)
    setLoading(false)
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
    if (!confirm('Are you sure you want to delete this record?')) return
    const { error } = await supabase.from('receipt_records').delete().eq('id', id)
    if (!error) { setSelectedIds(selectedIds.filter(sid => sid !== id)); fetchRecords() }
  }

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} selected records?`)) return
    const { error } = await supabase.from('receipt_records').delete().in('id', selectedIds)
    if (!error) { setSelectedIds([]); fetchRecords() }
  }

  const handleSelectRow = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id])
  }

  const handleSelectAll = () => {
    if (selectedIds.length === records.length) setSelectedIds([])
    else setSelectedIds(records.map(r => r.id))
  }

  const generateFormatText = () => {
    const selectedRecords = records.filter(r => selectedIds.includes(r.id))
    if (selectedRecords.length === 0) { setGeneratedText('Please select a receipt first to generate text.'); return }
    const sorted = [...selectedRecords].sort((a, b) => new Date(a.receipt_date) - new Date(b.receipt_date))
    let text = `Purchase Items for Pes Production\n`
    sorted.forEach((rec, index) => {
      const [year, month, day] = rec.receipt_date.split('-')
      const formattedDate = `${parseInt(day)}/${parseInt(month)}/${year}`
      text += `Receipt ${index + 1}: RM${rec.amount.toFixed(2)} - ${formattedDate}\n`
    })
    text += `\nWage: RM${parseFloat(wageAmount || 0).toFixed(2)}`
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

  const totalSelectedAmount = useMemo(() => {
    return records.filter(r => selectedIds.includes(r.id)).reduce((sum, r) => sum + (r.amount || 0), 0)
  }, [records, selectedIds])

  return (
    <div>
      <ToastBar toast={toast} onClose={hideToast} />

      <div className="card p-3 mb-3">
        <h6 className="fw-bold mb-3 text-primary">{editingId ? 'Update Receipt' : 'Register New Receipt'}</h6>
        <form onSubmit={handleSubmit} className="d-flex flex-wrap gap-3 align-items-end">
          <div className="flex-grow-1">
            <label className="form-label">Receipt Date</label>
            <input type="date" className="form-control" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} required />
          </div>
          <div className="flex-grow-1">
            <label className="form-label">Amount Total (RM)</label>
            <input type="number" step="0.01" placeholder="407.90" className="form-control fw-bold" value={amount} onChange={(e) => setAmount(e.target.value)} required />
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
              <h6 className="fw-bold text-white mb-0">📋 Receipt Records List</h6>
              {selectedIds.length > 0 && (
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <span className="fw-bold text-primary">Total Selected: RM {(totalSelectedAmount + parseFloat(wageAmount || 0)).toFixed(2)}</span>
                  <button onClick={copyTotalAmount} className="btn btn-sm btn-outline-light fw-bold">📋 Copy Text</button>
                  <button onClick={handleDeleteSelected} className="btn btn-sm fw-bold">
                    Delete Selected ({selectedIds.length})
                  </button>
                </div>
              )}
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th><input type="checkbox" className="form-check-input" checked={records.length > 0 && selectedIds.length === records.length} onChange={handleSelectAll} /></th>
                  <th>Receipt Date</th>
                  <th>Amount Total (RM)</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr><td colSpan="4" className="text-center text-muted">No receipt records found.</td></tr>
                ) : (
                  records.map((rec) => (
                    <tr key={rec.id} className={selectedIds.includes(rec.id) ? 'row-selected' : ''}>
                      <td><input type="checkbox" className="form-check-input" checked={selectedIds.includes(rec.id)} onChange={() => handleSelectRow(rec.id)} /></td>
                      <td className="fw-medium text-white">{rec.receipt_date}</td>
                      <td className="fw-bold">RM {rec.amount.toFixed(2)}</td>
                      <td className="d-flex gap-2 justify-content-center">
                        <button onClick={() => handleEdit(rec)} className="btn btn-sm btn-link fw-bold text-primary">Edit</button>
                        <button onClick={() => handleDelete(rec.id)} className="btn btn-sm btn-link fw-bold">Delete</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="card p-3 d-flex flex-column gap-3">
            <h6 className="fw-bold text-white mb-0">⚙️ Configuration & Output Text</h6>
            <div>
              <label className="form-label">Wage Rate (RM)</label>
              <input type="number" step="0.01" className="form-control fw-bold" value={wageAmount} onChange={(e) => setWageAmount(e.target.value)} />
            </div>
            <button onClick={generateFormatText} className="btn btn-primary w-100 fw-bold">Generate Selected Text</button>
            {generatedText && (
              <div className="d-flex flex-column gap-2">
                <pre className="p-3 font-mono user-select-all">
                  {generatedText}
                </pre>
                <button onClick={copyToClipboard} className="btn btn-sm btn-outline-light fw-bold">Copy Text</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}