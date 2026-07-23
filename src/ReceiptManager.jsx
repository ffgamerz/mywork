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

  // Security checking
  const cleanedRole = String(userRole || '').trim().toLowerCase()
  const isAuthorized = cleanedRole === 'super_admin' || cleanedRole === 'admin' || allowedModules['receiptManager'] === true

  useEffect(() => {
    if (isAuthorized) {
      fetchRecords()
    }
  }, [isAuthorized])

  if (!isAuthorized) {
    return (
      <div className="alert-unauthorized">
        <div>
          <span>🔒 Access Denied: You do not have permission to view this page.</span>
        </div>
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
      if (!error) {
        setEditingId(null)
        setAmount('')
      }
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
    if (!error) {
      setSelectedIds(selectedIds.filter(sid => sid !== id))
      fetchRecords()
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return
    const confirmMsg = `Are you sure you want to delete ${selectedIds.length} selected records?`
    if (!confirm(confirmMsg)) return
    
    const { error } = await supabase.from('receipt_records').delete().in('id', selectedIds)
    if (!error) {
      setSelectedIds([])
      fetchRecords()
    }
  }

  const handleSelectRow = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sid => sid !== id))
    } else {
      setSelectedIds([...selectedIds, id])
    }
  }

  const handleSelectAll = () => {
    if (selectedIds.length === records.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(records.map(r => r.id))
    }
  }

  const generateFormatText = () => {
    const selectedRecords = records.filter(r => selectedIds.includes(r.id))
    if (selectedRecords.length === 0) {
      setGeneratedText('Please select a receipt first to generate text.')
      return
    }

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
    const total = (totalSelectedAmount + parseFloat(wageAmount || 0)).toFixed(2).replace(/,/g, '')
    navigator.clipboard.writeText(total)
    showToast('Text copied successfully!')
  }

  const totalSelectedAmount = useMemo(() => {
    return records
      .filter(r => selectedIds.includes(r.id))
      .reduce((sum, r) => sum + (r.amount || 0), 0)
  }, [records, selectedIds])

  return (
    <div className="page-shell">
      <ToastBar toast={toast} onClose={hideToast} />
      <div className="content-card p-5">
        <h2 className="text-lg font-bold mb-3">📝 {editingId ? 'Update Receipt' : 'Register New Receipt'}</h2>
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
          <div className="form-control w-full sm:w-auto">
            <label className="label text-xs font-bold">Receipt Date</label>
            <input type="date" className="input input-bordered w-full" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} required />
          </div>
          <div className="form-control w-full sm:w-auto flex-1">
            <label className="label text-xs font-bold">Amount Total (RM)</label>
            <input type="number" step="0.01" placeholder="407.90" className="input input-bordered w-full" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="w-full sm:w-auto flex gap-2">
            <button type="submit" disabled={loading} className="btn btn-primary text-white font-bold">
              {editingId ? 'Save' : 'Add'}
            </button>
            {editingId && (
              <button type="button" className="btn btn-ghost" onClick={() => { setEditingId(null); setAmount(''); }}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 content-card p-6 overflow-x-auto">
          <div className="flex justify-between items-center mb-4 gap-2 flex-wrap">
            <h2 className="text-lg font-black">📋 Receipt Records List</h2>
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="font-bold text-primary">
                  Total Selected: RM {(totalSelectedAmount + parseFloat(wageAmount || 0)).toFixed(2)}
                </span>
                <button onClick={copyTotalAmount} className="btn btn-sm btn-outline font-bold">
                  📋 Copy Text
                </button>
                <button onClick={handleDeleteSelected} className="btn btn-error btn-sm text-white font-bold">
                  Delete Selected ({selectedIds.length})
                </button>
              </div>
            )}
          </div>

          <table className="table w-full">
            <thead>
              <tr>
                <th className="w-10">
                  <input type="checkbox" className="checkbox checkbox-sm" checked={records.length > 0 && selectedIds.length === records.length} onChange={handleSelectAll} />
                </th>
                <th>Receipt Date</th>
                <th>Amount Total (RM)</th>
                <th className="w-24 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan="4" className="text-center opacity-50 py-8">No receipt records found.</td>
                </tr>
              ) : (
                records.map((rec) => (
                  <tr key={rec.id} className={selectedIds.includes(rec.id) ? 'bg-base-200/50' : ''}>
                    <td>
                      <input type="checkbox" className="checkbox checkbox-sm" checked={selectedIds.includes(rec.id)} onChange={() => handleSelectRow(rec.id)} />
                    </td>
                    <td className="font-medium">{rec.receipt_date}</td>
                    <td className="font-bold text-success">RM {rec.amount.toFixed(2)}</td>
                    <td className="flex gap-2 justify-center">
                      <button onClick={() => handleEdit(rec)} className="btn btn-xs btn-ghost text-info">Edit</button>
                      <button onClick={() => handleDelete(rec.id)} className="btn btn-xs btn-ghost text-error">Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="content-card p-6 space-y-4">
          <h2 className="text-lg font-black">⚙️ Configuration & Output Text</h2>
          
          <div className="form-control">
            <label className="label text-xs font-bold">Wage Rate (RM)</label>
            <input type="number" step="0.01" className="input input-bordered w-full font-bold" value={wageAmount} onChange={(e) => setWageAmount(e.target.value)} />
          </div>

          <button onClick={generateFormatText} className="btn btn-accent w-full text-white font-bold">
            Generate Selected Text
          </button>

          {generatedText && (
            <div className="space-y-2">
              <pre className="p-3 bg-base-300 rounded-xl text-xs font-mono whitespace-pre-wrap select-all max-h-48 overflow-y-auto">
                {generatedText}
              </pre>
              <button onClick={copyToClipboard} className="btn btn-sm btn-outline btn-block font-bold">
                Copy Text
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}