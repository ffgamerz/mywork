import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { translations } from './translations'

export default function ReceiptManager({ session, userRole, allowedModules = {} }) {
  const [records, setRecords] = useState([])
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0])
  const [amount, setAmount] = useState('')
  const [upahAmount, setUpahAmount] = useState('35.00')
  const [editingId, setEditingId] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [generatedText, setGeneratedText] = useState('')
  const [loading, setLoading] = useState(false)

  // System Translation
  const lang = localStorage.getItem('bol_lang') || 'en'
  const t = (key) => translations[lang]?.[key] || translations['en'][key]

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
      <div className="alert alert-error shadow-lg rounded-xl max-w-md mx-auto mt-12 border border-error/20 text-white font-bold">
        <div>
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          <span>{t('rmAccessDenied')}</span>
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
    if (!confirm(t('rmConfirmDelete'))) return
    const { error } = await supabase.from('receipt_records').delete().eq('id', id)
    if (!error) {
      setSelectedIds(selectedIds.filter(sid => sid !== id))
      fetchRecords()
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return
    const confirmMsg = t('rmConfirmDeleteSel').replace('{count}', selectedIds.length)
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
      setGeneratedText(t('rmSelectFirst'))
      return
    }

    const sorted = [...selectedRecords].sort((a, b) => new Date(a.receipt_date) - new Date(b.receipt_date))

    let text = `Beli Barang Untuk Pes Production\n`
    sorted.forEach((rec, index) => {
      const [year, month, day] = rec.receipt_date.split('-')
      const formattedDate = `${parseInt(day)}/${parseInt(month)}/${year}`
      text += `Resit ${index + 1} : RM${rec.amount.toFixed(2)} - ${formattedDate}\n`
    })

    text += `\nUpah : RM${parseFloat(upahAmount || 0).toFixed(2)}`
    setGeneratedText(text)
  }

  const copyToClipboard = () => {
    if (!generatedText) return
    navigator.clipboard.writeText(generatedText)
    alert(t('rmCopiedAlert'))
  }

  return (
    <div className="space-y-6">
      <div className="card bg-base-100 border border-base-200 shadow-xl p-6">
        <h2 className="text-xl font-black mb-4">📝 {editingId ? t('rmUpdateReceipt') : t('rmNewReceipt')}</h2>
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-4 items-end">
          <div className="form-control w-full sm:w-auto">
            <label className="label text-xs font-bold">{t('rmReceiptDate')}</label>
            <input type="date" className="input input-bordered w-full" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} required />
          </div>
          <div className="form-control w-full sm:w-auto flex-1">
            <label className="label text-xs font-bold">{t('rmAmount')}</label>
            <input type="number" step="0.01" placeholder="407.90" className="input input-bordered w-full" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="w-full sm:w-auto flex gap-2">
            <button type="submit" disabled={loading} className="btn btn-primary font-bold">
              {editingId ? t('rmSave') : t('rmAdd')}
            </button>
            {editingId && (
              <button type="button" className="btn btn-ghost" onClick={() => { setEditingId(null); setAmount(''); }}>
                {t('rmCancel')}
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card bg-base-100 border border-base-200 shadow-xl p-6 overflow-x-auto">
          <div className="flex justify-between items-center mb-4 gap-2">
            <h2 className="text-lg font-black">📋 {t('rmListTitle')}</h2>
            {selectedIds.length > 0 && (
              <button onClick={handleDeleteSelected} className="btn btn-error btn-sm text-white font-bold">
                {t('rmDeleteSelected')} ({selectedIds.length})
              </button>
            )}
          </div>

          <table className="table w-full">
            <thead>
              <tr>
                <th className="w-10">
                  <input type="checkbox" className="checkbox checkbox-sm" checked={records.length > 0 && selectedIds.length === records.length} onChange={handleSelectAll} />
                </th>
                <th>{t('rmReceiptDate')}</th>
                <th>{t('rmAmount')}</th>
                <th className="w-24 text-center">{t('rmAction')}</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan="4" className="text-center opacity-50 py-8">{t('rmNoRecords')}</td>
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
                      <button onClick={() => handleEdit(rec)} className="btn btn-xs btn-ghost text-info">{t('rmEdit')}</button>
                      <button onClick={() => handleDelete(rec.id)} className="btn btn-xs btn-ghost text-error">{t('rmDelete')}</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="card bg-base-100 border border-base-200 shadow-xl p-6 space-y-4">
          <h2 className="text-lg font-black">⚙️ {t('rmConfigTitle')}</h2>
          
          <div className="form-control">
            <label className="label text-xs font-bold">{t('rmWageRate')}</label>
            <input type="number" step="0.01" className="input input-bordered w-full font-bold" value={upahAmount} onChange={(e) => setUpahAmount(e.target.value)} />
          </div>

          <button onClick={generateFormatText} className="btn btn-accent w-full font-bold text-white">
            {t('rmGenerateBtn')}
          </button>

          {generatedText && (
            <div className="space-y-2">
              <pre className="p-3 bg-base-300 rounded-xl text-xs font-mono whitespace-pre-wrap select-all max-h-48 overflow-y-auto">
                {generatedText}
              </pre>
              <button onClick={copyToClipboard} className="btn btn-sm btn-outline btn-block rounded-xl font-bold">
                {t('rmCopyBtn')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}