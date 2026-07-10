import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { getTranslation } from './utils/translation'

export default function RecordManager({ session, lang = 'en' }) {
  const [records, setRecords] = useState([])
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [loadingFetch, setLoadingFetch] = useState(false)
  const [loadingSave, setLoadingSave] = useState(false)
  const [loadingDelete, setLoadingDelete] = useState(false)

  const [checkedIds, setCheckedIds] = useState([])
  const [generatedText, setGeneratedText] = useState('')
  const [toastMessage, setToastMessage] = useState('')

  const [editingRecord, setEditingRecord] = useState(null)
  const [editAmount, setEditAmount] = useState('')
  const [editDate, setEditDate] = useState('')

  const activeLang = lang || 'en'
  const t = (key) => getTranslation(activeLang, key)

  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 3000)
  }

  const fetchRecords = async () => {
    setLoadingFetch(true)
    const { data, error } = await supabase
      .from('records')
      .select('*')
      .eq('user_id', session.user.id)
      .order('date', { ascending: true })

    if (error) console.error('Error fetching data:', error.message)
    else setRecords(data || [])
    setLoadingFetch(false)
  }

  useEffect(() => {
    if (session?.user?.id) fetchRecords()
  }, [session?.user?.id])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoadingSave(true)

    const { error } = await supabase.from('records').insert([{
      user_id: session.user.id,
      title: `RM ${parseFloat(amount).toFixed(2)}`,
      amount: parseFloat(amount) || 0,
      date,
    }])

    if (error) {
      showToast(t('saveFailed') + error.message)
    } else {
      setAmount('')
      showToast(t('saveRecord') + '!')
      fetchRecords()
    }
    setLoadingSave(false)
  }

  const handleStartEdit = (rec) => {
    setEditingRecord(rec)
    setEditAmount(rec.amount)
    setEditDate(rec.date)
  }

  const handleUpdateRecord = async (e) => {
    e.preventDefault()
    setLoadingSave(true)

    const { error } = await supabase
      .from('records')
      .update({
        title: `RM ${parseFloat(editAmount).toFixed(2)}`,
        amount: parseFloat(editAmount) || 0,
        date: editDate,
      })
      .eq('id', editingRecord.id)

    if (error) {
      showToast(t('updateFailed') + error.message)
    } else {
      setEditingRecord(null)
      showToast(t('updateSuccess'))
      fetchRecords()
    }
    setLoadingSave(false)
  }

  const handleCheckRow = (id) => {
    setCheckedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    )
  }

  const handleCheckAll = (e) => {
    setCheckedIds(e.target.checked ? records.map(rec => rec.id) : [])
  }

  const handleDeleteChecked = async () => {
    if (checkedIds.length === 0) return

    const confirmMsg = t('confirmDeleteRecords').replace('{count}', checkedIds.length)
    if (!window.confirm(confirmMsg)) return

    setLoadingDelete(true)
    const { error } = await supabase
      .from('records')
      .delete()
      .in('id', checkedIds)

    if (error) {
      showToast(t('deleteFailed') + error.message)
    } else {
      setCheckedIds([])
      setGeneratedText('')
      fetchRecords()
    }
    setLoadingDelete(false)
  }

  const handleGenerate = () => {
    if (checkedIds.length === 0) return

    const selectedRecords = records.filter(rec => checkedIds.includes(rec.id))
    const lines = selectedRecords.map(rec =>
      `${t('datePrefix')} : ${rec.date} - RM ${parseFloat(rec.amount).toFixed(2)}`
    )

    setGeneratedText([
      t('transferTo'),
      t('forCreditCard'),
      t('tiktokAds'),
      ...lines
    ].join('\n'))
  }

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(generatedText)
    showToast(t('copyNotesSuccess'))
  }

  const totalSelectedAmount = records
    .filter(rec => checkedIds.includes(rec.id))
    .reduce((sum, rec) => sum + (parseFloat(rec.amount) || 0), 0)

  const handleCopyTotalNumberOnly = () => {
    const numberOnly = totalSelectedAmount.toFixed(2)
    navigator.clipboard.writeText(numberOnly)
    showToast(t('copyAmountSuccess').replace('{amount}', numberOnly))
  }

  return (
    <div className="page-shell relative">
      {toastMessage && (
        <div className="toast-success">
          <div className="alert-toast">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      <div className="page-header">
        <h1 className="page-title">{t('recordManager')}</h1>
        <p className="page-subtitle">{t('recordManagerDesc')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form Tambah Rekod */}
        <div className="content-card p-6 h-fit">
          <h3 className="text-xl font-bold mb-4 text-primary">{t('addRecord')}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="form-control">
              <label className="label-text font-semibold mb-1">{t('date')}</label>
              <input
                type="date"
                required
                className="input input-bordered w-full text-base"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="form-control">
              <label className="label-text font-semibold mb-1">{t('amount')}</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                className="input input-bordered w-full text-base"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <button type="submit" disabled={loadingSave} className="btn btn-primary font-bold w-full mt-2">
              {loadingSave ? <span className="loading loading-spinner"></span> : t('saveRecord')}
            </button>
          </form>
        </div>

        {/* Senarai Rekod */}
        <div className="lg:col-span-2 content-card p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h3 className="text-xl font-bold text-secondary">{t('savedRecordsList')}</h3>
            <div className="flex flex-wrap items-center gap-4">
              {checkedIds.length > 0 && (
                <div className="selected-total-box">
                  <span>{t('selectedTotal')}</span>
                  <span className="font-bold text-success text-base">RM {totalSelectedAmount.toFixed(2)}</span>
                  <button
                    type="button"
                    onClick={handleCopyTotalNumberOnly}
                    className="btn btn-ghost btn-xs btn-circle"
                    title="Copy amount"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376A8.965 8.965 0 0 0 12 12.75c-.497 0-.982.04-1.455.12l-.179.03m1.608-3.033a13.96 13.96 0 0 1 2.5.553m-.553-1.376a13.518 13.518 0 0 1 4.722 3.208 13.518 13.518 0 0 1 3.208 4.722m-3.208-4.722a13.48 13.48 0 0 0-4.722-3.208M4.5 10.5h11.25c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125H4.5A1.125 1.125 0 0 1 3.375 21.375v-9.75c0-.621.504-1.125 1.125-1.125Z" />
                    </svg>
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={checkedIds.length === 0 || loadingSave}
                  className="btn btn-sm btn-accent text-white font-bold"
                >
                  {t('generate')} ({checkedIds.length})
                </button>
                <button
                  onClick={handleDeleteChecked}
                  disabled={checkedIds.length === 0 || loadingDelete}
                  className="btn btn-sm btn-error text-white font-bold"
                >
                  {loadingDelete ? <span className="loading loading-spinner loading-xs"></span> : t('delete')}
                </button>
              </div>
            </div>
          </div>

          {loadingFetch ? (
            <div className="flex justify-center py-12">
              <span className="loading loading-spinner loading-lg text-primary"></span>
            </div>
          ) : records.length === 0 ? (
            <div className="empty-state py-12 gap-3 opacity-70">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              <p className="font-bold text-sm">{t('noRecords')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-zebra w-full">
                <thead>
                  <tr>
                    <th className="w-12">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-primary checkbox-sm"
                        onChange={handleCheckAll}
                        checked={records.length > 0 && checkedIds.length === records.length}
                      />
                    </th>
                    <th className="w-16 text-center">{t('no')}</th>
                    <th>{t('date')}</th>
                    <th className="text-right">{t('amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((rec, index) => (
                    <tr key={rec.id} className={checkedIds.includes(rec.id) ? 'bg-base-200/50' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          className="checkbox checkbox-primary checkbox-sm"
                          checked={checkedIds.includes(rec.id)}
                          onChange={() => handleCheckRow(rec.id)}
                        />
                      </td>
                      <td className="text-center opacity-70 font-mono">{index + 1}</td>
                      <td className="whitespace-nowrap">{rec.date}</td>
                      <td className="text-right font-bold text-success">
                        <div className="flex items-center justify-end gap-2">
                          <span>{parseFloat(rec.amount).toFixed(2)}</span>
                          <button
                            type="button"
                            onClick={() => handleStartEdit(rec)}
                            className="btn btn-ghost btn-xs btn-circle text-info hover:bg-info/20"
                            title="Edit"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Generated Output */}
      {generatedText && (
        <div className="content-card p-6 w-full">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-accent">{t('generatedResult')}</h3>
            <button onClick={handleCopyToClipboard} className="btn btn-sm btn-outline btn-accent font-bold">
              {t('copyText')}
            </button>
          </div>
          <div className="bg-base-300 p-4 rounded-xl font-mono text-sm leading-relaxed whitespace-pre-wrap border border-base-200 select-all">
            {generatedText}
          </div>
        </div>
      )}

      {/* Modal Edit Rekod */}
      {editingRecord && (
        <div className="modal modal-open z-50">
          <div className="modal-box--sm">
            <h3 className="font-bold text-lg text-info flex items-center gap-2 mb-4">✏️ {t('editRecord')}</h3>
            <form onSubmit={handleUpdateRecord} className="space-y-4">
              <div className="form-control">
                <label className="label-text font-semibold mb-1">{t('date')}</label>
                <input
                  type="date"
                  required
                  className="input input-bordered w-full text-base"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>
              <div className="form-control">
                <label className="label-text font-semibold mb-1">{t('amount')}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  className="input input-bordered w-full text-base"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                />
              </div>
              <div className="modal-action gap-2 pt-2">
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditingRecord(null)}>
                  {t('cancel')}
                </button>
                <button type="submit" disabled={loadingSave} className="btn btn-sm btn-primary text-white font-bold px-4">
                  {loadingSave ? <span className="loading loading-spinner loading-xs"></span> : t('saveChanges')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
