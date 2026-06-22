import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function RecordManager({ session }) {
  const [records, setRecords] = useState([])
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)

  const [checkedIds, setCheckedIds] = useState([])
  const [generatedText, setGeneratedText] = useState('')
  const [toastMessage, setToastMessage] = useState('')

  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage('')
    }, 3000)
  }

  const fetchRecords = async () => {
    const { data, error } = await supabase
      .from('records')
      .select('*')
      .order('date', { ascending: true })

    if (error) console.error('Error fetching data:', error.message)
    else setRecords(data)
  }

  useEffect(() => {
    fetchRecords()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.from('records').insert([
      {
        user_id: session.user.id,
        title: `RM ${parseFloat(amount).toFixed(2)}`,
        amount: parseFloat(amount) || 0,
        date,
      },
    ])

    if (error) {
      alert('Failed to save data: ' + error.message)
    } else {
      setAmount('')
      fetchRecords()
    }
    setLoading(false)
  }

  const handleCheckRow = (id) => {
    if (checkedIds.includes(id)) {
      setCheckedIds(checkedIds.filter(item => item !== id))
    } else {
      setCheckedIds([...checkedIds, id])
    }
  }

  const handleCheckAll = (e) => {
    if (e.target.checked) {
      const allIds = records.map(rec => rec.id)
      setCheckedIds(allIds)
    } else {
      setCheckedIds([])
    }
  }

  const handleDeleteChecked = async () => {
    if (checkedIds.length === 0) return

    const confirmDelete = window.confirm(`Are you sure you want to delete ${checkedIds.length} selected record(s)?`)
    if (!confirmDelete) return

    setLoading(true)
    const { error } = await supabase
      .from('records')
      .delete()
      .in('id', checkedIds)

    if (error) {
      alert('Failed to delete records: ' + error.message)
    } else {
      setCheckedIds([])
      setGeneratedText('')
      fetchRecords()
    }
    setLoading(false)
  }

  const handleGenerate = () => {
    if (checkedIds.length === 0) return

    const selectedRecords = records.filter(rec => checkedIds.includes(rec.id))

    const lines = selectedRecords.map(rec => {
      const formattedAmount = parseFloat(rec.amount).toFixed(2)
      return `Date : ${rec.date} - RM ${formattedAmount}`
    })

    const output = [
      "Transfer To Owners Fund",
      "For Credit Card Payment",
      "TikTok Advertising",
      ...lines
    ].join('\n')

    setGeneratedText(output)
  }

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(generatedText)
    showToast('Transaction notes copied successfully!')
  }

  const totalSelectedAmount = records
    .filter(rec => checkedIds.includes(rec.id))
    .reduce((sum, rec) => sum + (parseFloat(rec.amount) || 0), 0)

  const handleCopyTotalNumberOnly = () => {
    const numberOnly = totalSelectedAmount.toFixed(2)
    navigator.clipboard.writeText(numberOnly)
    showToast(`Amount ${numberOnly} copied successfully!`)
  }

  return (
    <div className="space-y-8 relative">
      
      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="toast toast-top toast-end z-50 p-4">
          <div className="alert alert-success shadow-lg border border-success/20 text-white font-medium flex items-center gap-2 rounded-xl">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* TAJUK BESAR REKOD MANAGER */}
      <div className="flex flex-col gap-1 border-b border-base-100 pb-4">
        <h1 className="text-2xl md:text-3xl font-black tracking-tight">Record Manager</h1>
        <p className="text-sm opacity-60">Add new transaction entries and generate formatted financial outputs.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* SECTION 1: INPUT FORM (Ditukar ke text-base / 16px untuk mengelakkan auto-zoom mudah alih) */}
        <div className="card bg-base-100 shadow-xl p-6 border border-base-200 h-fit">
          <h3 className="text-xl font-bold mb-4 text-primary">Add New Record</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            
            <div className="form-control">
              <label className="label-text font-semibold mb-1">Date</label>
              <input 
                type="date" required className="input input-bordered w-full text-base"
                value={date} onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="form-control">
              <label className="label-text font-semibold mb-1">Amount (RM)</label>
              <input 
                type="number" step="0.01" required placeholder="0.00" className="input input-bordered w-full text-base"
                value={amount} onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary w-full mt-2">
              {loading ? <span className="loading loading-spinner"></span> : 'Save Record'}
            </button>
          </form>
        </div>

        {/* SECTION 2: DATA TABLE VIEW */}
        <div className="lg:col-span-2 card bg-base-100 shadow-xl p-6 border border-base-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h3 className="text-xl font-bold text-secondary">Saved Records List</h3>
            
            <div className="flex flex-wrap items-center gap-4">
              {checkedIds.length > 0 && (
                <div className="bg-base-200 px-3 py-1.5 rounded-xl border border-base-300 text-sm flex items-center gap-1.5">
                  <span>Selected Total:</span>
                  <span className="font-bold text-success text-base">RM {totalSelectedAmount.toFixed(2)}</span>
                  
                  <button 
                    type="button"
                    onClick={handleCopyTotalNumberOnly}
                    title="Copy Amount Only" 
                    className="btn btn-ghost btn-xs btn-circle text-base-content/70 hover:text-success hover:bg-base-300"
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
                  disabled={checkedIds.length === 0 || loading}
                  className="btn btn-sm btn-accent text-white"
                >
                  Generate ({checkedIds.length})
                </button>
                <button 
                  onClick={handleDeleteChecked}
                  disabled={checkedIds.length === 0 || loading}
                  className="btn btn-sm btn-error text-white"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>

          {records.length === 0 ? (
            <p className="text-center py-8 opacity-60">No records saved yet.</p>
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
                    <th className="w-16 text-center">No.</th>
                    <th>Date</th>
                    <th className="text-right">Amount (RM)</th>
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
                        {parseFloat(rec.amount).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 3: GENERATED OUTPUT AREA */}
      {generatedText && (
        <div className="card bg-base-100 shadow-xl p-6 border border-base-200 w-full animate-fade-in">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-accent">Generated Note Result</h3>
            <button onClick={handleCopyToClipboard} className="btn btn-sm btn-outline btn-accent">
              Copy Text
            </button>
          </div>
          <div className="bg-base-300 p-4 rounded-xl font-mono text-sm leading-relaxed whitespace-pre-wrap border border-base-200 select-all">
            {generatedText}
          </div>
        </div>
      )}
    </div>
  )
}