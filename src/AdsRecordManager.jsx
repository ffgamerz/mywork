import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

const ADS_PLATFORMS = [
  { value: 'tiktok', label: 'TikTok' },
  { value: 'shopee', label: 'Shopee' }
]

export default function AdsRecordManager({ session }) {
  const [records, setRecords] = useState([])
  const [amount, setAmount] = useState('')
  const [adsPlatform, setAdsPlatform] = useState('tiktok')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [loadingFetch, setLoadingFetch] = useState(false)
  const [loadingSave, setLoadingSave] = useState(false)
  const [loadingDelete, setLoadingDelete] = useState(false)
  const [checkedIds, setCheckedIds] = useState([])
  const [generatedText, setGeneratedText] = useState('')
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' })
  const [editingRecord, setEditingRecord] = useState(null)
  const [editAmount, setEditAmount] = useState('')
  const [editAdsPlatform, setEditAdsPlatform] = useState('tiktok')
  const [editDate, setEditDate] = useState('')

  const showToast = (message, severity = 'success') => { setToast({ open: true, message, severity }); setTimeout(() => setToast({ ...toast, open: false }), 3000) }

  const fetchRecords = async () => {
    setLoadingFetch(true)
    const { data, error } = await supabase.from('records').select('*').eq('user_id', session.user.id).order('date', { ascending: true })
    if (error) console.error('Error fetching data:', error.message); else setRecords(data || [])
    setLoadingFetch(false)
  }

  useEffect(() => { if (session?.user?.id) fetchRecords() }, [session?.user?.id])

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

  const handleCheckRow = (id) => { setCheckedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]) }
  const handleCheckAll = (e) => { setCheckedIds(e.target.checked ? records.map(rec => rec.id) : []) }

  const handleDeleteChecked = async () => {
    if (checkedIds.length === 0) return
    if (!window.confirm(`Are you sure you want to delete ${checkedIds.length} selected record(s)?`)) return
    setLoadingDelete(true)
    const { error } = await supabase.from('records').delete().in('id', checkedIds)
    if (error) showToast('Failed to delete records: ' + error.message, 'error'); else { setCheckedIds([]); setGeneratedText(''); showToast('Records deleted successfully!'); fetchRecords() }
    setLoadingDelete(false)
  }

  const handleGenerate = () => {
    if (checkedIds.length === 0) return
    const selectedRecords = records.filter(rec => checkedIds.includes(rec.id))
    const lines = selectedRecords.map(rec => `Date : ${rec.date} - RM ${parseFloat(rec.amount).toFixed(2)} (${rec.ads_platform === 'tiktok' ? 'TikTok' : 'Shopee'})`)
    setGeneratedText(['For Credit Card Payment', 'Advertising', ...lines].join('\n'))
  }

  const handleCopyToClipboard = () => { navigator.clipboard.writeText(generatedText); showToast('Transaction notes copied successfully!') }

  const totalSelectedAmount = records.filter(rec => checkedIds.includes(rec.id)).reduce((sum, rec) => sum + (parseFloat(rec.amount) || 0), 0)

  const handleCopyTotalNumberOnly = () => { navigator.clipboard.writeText(totalSelectedAmount.toFixed(2)); showToast(`Amount ${totalSelectedAmount.toFixed(2)} copied successfully!`) }

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
        <h1 className="page-title-custom">Ads Record Manager</h1>
        <p className="page-subtitle-custom">Track payments, amounts, and manage financial outputs.</p>
      </div>

      <div className="row g-3">
        <div className="col-lg-4">
          <div className="card p-3 h-100">
            <h6 className="fw-bold mb-3 text-accent">Add New Record</h6>
            <form onSubmit={handleSubmit}>
              <div className="mb-3"><label className="form-label">Date</label><input type="date" className="form-control" required value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="mb-3"><label className="form-label">Amount (RM)</label><input type="number" step="0.01" className="form-control" required placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div className="mb-3"><label className="form-label">Ads Platform</label><select className="form-select" value={adsPlatform} onChange={(e) => setAdsPlatform(e.target.value)} required>{ADS_PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
              <button type="submit" className="btn btn-primary w-100 fw-bold" disabled={loadingSave}>{loadingSave ? <span className="spinner-border spinner-border-sm"></span> : 'Save Record'}</button>
            </form>
          </div>
        </div>

        <div className="col-lg-8">
          <div className="card p-3">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
              <span className="text-muted text-13">Saved Records List</span>
              <div className="d-flex gap-2 align-items-center flex-wrap">
                {checkedIds.length > 0 && (
                  <div className="selected-total-box d-flex align-items-center gap-1">
                    <span className="text-muted text-12">Selected Total:</span>
                    <span className="fw-bold text-white text-13">RM {totalSelectedAmount.toFixed(2)}</span>
                    <button className="btn btn-sm btn-link p-0 d-flex align-items-center justify-content-center w-20 h-20 text-secondary-custom" onClick={handleCopyTotalNumberOnly}>
                      <svg className="icon-svg-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                    </button>
                  </div>
                )}
                <button className="btn btn-sm btn-outline-light fw-semibold" onClick={handleGenerate} disabled={checkedIds.length === 0 || loadingSave}>Generate ({checkedIds.length})</button>
                <button className="btn btn-sm fw-semibold btn-outline-danger" onClick={handleDeleteChecked} disabled={checkedIds.length === 0 || loadingDelete}>
                  {loadingDelete ? <span className="spinner-border spinner-border-sm"></span> : 'Delete'}
                </button>
              </div>
            </div>

            {loadingFetch ? <div className="text-center py-5"><span className="spinner-border"></span></div> : records.length === 0 ? <div className="text-center py-5 text-muted fw-semibold">No records saved yet.</div> : (
              <div className="overflow-x-auto">
                <table className="table table-hover">
                  <thead><tr><th className="w-40"><input type="checkbox" className="form-check-input" checked={records.length > 0 && checkedIds.length === records.length} onChange={handleCheckAll} /></th><th>No.</th><th>Date</th><th>Ads Platform</th><th className="text-end">Amount (RM)</th></tr></thead>
                  <tbody>{records.map((rec, index) => (
                    <tr key={rec.id} className={checkedIds.includes(rec.id) ? 'row-selected' : ''}>
                      <td><input type="checkbox" className="form-check-input" checked={checkedIds.includes(rec.id)} onChange={() => handleCheckRow(rec.id)} /></td>
                      <td className="font-mono text-13 text-secondary-custom">{index + 1}</td>
                      <td className="text-13 text-nowrap text-white">{rec.date}</td>
                      <td><span className="chip-custom">{rec.ads_platform === 'tiktok' ? 'TikTok' : 'Shopee'}</span></td>
                      <td className="text-end fw-semibold text-13 text-white">{parseFloat(rec.amount).toFixed(2)}
                        <button className="btn btn-sm btn-link p-0 d-inline-flex align-items-center justify-content-center w-20 h-20 text-tertiary ms-1" onClick={() => handleStartEdit(rec)}>
                          <svg className="icon-svg-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {generatedText && (
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
                <h5 className="fw-bold text-accent mb-3">✏️ Edit Record</h5>
                <form onSubmit={handleUpdateRecord}>
                  <div className="mb-3"><label className="form-label">Date</label><input type="date" className="form-control" required value={editDate} onChange={(e) => setEditDate(e.target.value)} /></div>
                  <div className="mb-3"><label className="form-label">Amount (RM)</label><input type="number" step="0.01" className="form-control" required value={editAmount} onChange={(e) => setEditAmount(e.target.value)} /></div>
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