import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { translations } from './translations'

export default function Inventory({ session, userRole }) {
  const [selectedProduct, setSelectedProduct] = useState(null)
  
  const [products, setProducts] = useState([])
  const [productName, setProductName] = useState('')
  const [expiryMonth, setExpiryMonth] = useState('12') 
  const [loading, setLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  const [productions, setProductions] = useState([])
  const [staffList, setStaffList] = useState([]) 
  const [isStockModalOpen, setIsStockModalOpen] = useState(false)
  const [prodDate, setProdDate] = useState(new Date().toISOString().split('T')[0])
  const [prodQty, setProdQty] = useState('')
  const [prodName, setProdName] = useState('') 
  const [prodBatch, setProdBatch] = useState('BATCH-001')

  const lang = localStorage.getItem('bol_lang') || 'en'
  const t = (key) => translations[lang]?.[key] || translations['en'][key]

  const cleanedRole = String(userRole || '').trim().toLowerCase()
  const isAuthorized = cleanedRole === 'super_admin' || cleanedRole === 'admin'

  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 3000)
  }

  const fetchProducts = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) console.error(error.message)
    else setProducts(data || [])
    setLoading(false)
  }

  const fetchProductions = async (productId) => {
    setLoading(true)
    const { data, error } = await supabase
      .from('stock_productions')
      .select('*')
      .eq('inventory_id', productId)
      .order('production_date', { ascending: false })

    if (error) console.error(error.message)
    else setProductions(data || [])
    setLoading(false)
  }

  const fetchStaffList = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name')
      .order('full_name', { ascending: true })

    if (error) console.error('Error fetching staff names:', error.message)
    else setStaffList(data || [])
  }

  useEffect(() => {
    fetchProducts()
    fetchStaffList()
  }, [])

  useEffect(() => {
    if (selectedProduct) {
      fetchProductions(selectedProduct.id)
    }
  }, [selectedProduct])

  useEffect(() => {
    if (isStockModalOpen && productions) {
      if (productions.length === 0) {
        setProdBatch('BATCH-001')
      } else {
        const latestProd = productions[0] 
        const currentBatchNo = latestProd?.batch_no || 'BATCH-000'
        
        const match = currentBatchNo.match(/\d+$/)
        if (match) {
          const nextNumber = parseInt(match[0], 10) + 1
          const paddedNumber = String(nextNumber).padStart(match[0].length, '0')
          const nextBatchNo = currentBatchNo.replace(/\d+$/, paddedNumber)
          setProdBatch(nextBatchNo)
        } else {
          setProdBatch(`BATCH-${productions.length + 1}`)
        }
      }
    }
  }, [isStockModalOpen, productions])

  const handleAddProduct = async (e) => {
    e.preventDefault()
    if (!productName.trim() || !isAuthorized) return

    setLoading(true)
    const { error } = await supabase.from('inventory').insert([
      { 
        user_id: session.user.id, 
        product_name: productName.trim(), 
        expiry_month: parseInt(expiryMonth) || 12,
        current_stock: 0 
      },
    ])

    if (error) {
      alert(t('saveFailed') + error.message)
    } else {
      setProductName('')
      setExpiryMonth('12')
      setIsModalOpen(false)
      showToast(lang === 'ms' ? 'Produk berjaya ditambah!' : 'Product added successfully!')
      fetchProducts()
    }
    setLoading(false)
  }

  const handleAddStock = async (e) => {
    e.preventDefault()
    if (!isAuthorized || !selectedProduct) return

    setLoading(true)

    const productionDateObj = new Date(prodDate)
    const monthsToAdd = selectedProduct.expiry_month || 12
    productionDateObj.setMonth(productionDateObj.getMonth() + monthsToAdd)
    const calculatedExpiryDate = productionDateObj.toISOString().split('T')[0]

    const { error } = await supabase.from('stock_productions').insert([
      {
        inventory_id: selectedProduct.id,
        user_id: session.user.id,
        production_date: prodDate,
        quantity: parseInt(prodQty) || 0,
        production_name: prodName || null,
        batch_no: prodBatch, 
        expiry_date: calculatedExpiryDate,
        // DIKEMAS KINI: Memasukkan nilai lalai (default) kerana disorokkan semasa pendaftaran awal
        is_finished: false,
        paid_date: null,
        paid_amount: 0.00,
        receipt_link: null
      }
    ])

    if (error) {
      alert(t('saveFailed') + error.message)
    } else {
      setProdQty('')
      setProdName('') 
      setIsStockModalOpen(false)
      showToast(lang === 'ms' ? 'Rekod produksi berjaya disimpan!' : 'Production record saved!')
      fetchProductions(selectedProduct.id)
    }
    setLoading(false)
  }

  if (selectedProduct) {
    return (
      <div className="space-y-6 relative">
        {toastMessage && (
          <div className="toast toast-top toast-end z-50 p-4">
            <div className="alert alert-success shadow-lg text-white font-medium flex items-center gap-2 rounded-xl border border-success/20">
              <span>{toastMessage}</span>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-base-100 pb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedProduct(null)} className="btn btn-sm btn-circle btn-ghost border border-base-300">✕</button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight">{selectedProduct.product_name}</h1>
                <span className="badge badge-sm badge-outline opacity-70 font-mono">Shelf Life: {selectedProduct.expiry_month || 12}M</span>
              </div>
              <p className="text-xs opacity-60 font-medium">{t('stockListing')}</p>
            </div>
          </div>

          {isAuthorized && (
            <button onClick={() => setIsStockModalOpen(true)} className="btn btn-sm btn-accent font-bold shadow-md rounded-xl">
              + {t('addStock')}
            </button>
          )}
        </div>

        <div className="card bg-base-100 shadow-xl p-6 border border-base-200">
          {loading && productions.length === 0 ? (
            <div className="text-center py-4"><span className="loading loading-spinner"></span></div>
          ) : productions.length === 0 ? (
            <p className="text-center py-6 opacity-50">{lang === 'ms' ? 'Tiada rekod pengeluaran batch bagi produk ini.' : 'No production batch records for this product.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-zebra table-sm w-full font-sans">
                <thead>
                  <tr className="opacity-70 text-xs uppercase">
                    <th>{t('date')}</th>
                    <th>{t('batchNo')}</th>
                    <th>{lang === 'ms' ? 'Nama Staf (In-Charge)' : 'Staff In-Charge'}</th>
                    <th className="text-center">{t('quantity')}</th>
                    <th>{t('expiryDate')}</th>
                    <th className="text-center">{lang === 'ms' ? 'Status' : 'Finish'}</th>
                    <th>{t('paidAmount')}</th>
                    <th>{lang === 'ms' ? 'Pautan' : 'Receipt'}</th>
                  </tr>
                </thead>
                <tbody>
                  {productions.map((p) => (
                    <tr key={p.id} className="hover text-sm">
                      <td className="whitespace-nowrap font-medium">{p.production_date}</td>
                      <td className="font-mono font-bold text-secondary">{p.batch_no}</td>
                      <td className="font-bold text-base-content/90">{p.production_name || '-'}</td>
                      <td className="text-center font-bold text-info">{p.quantity}</td>
                      <td className="whitespace-nowrap opacity-80 font-bold text-error">{p.expiry_date || '-'}</td>
                      <td className="text-center">
                        <span className={`badge badge-xs font-bold ${p.is_finished ? 'badge-success text-white' : 'badge-warning text-black'}`}>
                          {p.is_finished ? t('statusDone') : t('statusActive')}
                        </span>
                      </td>
                      <td className="font-mono font-semibold text-success">
                        {p.paid_amount > 0 ? `RM ${parseFloat(p.paid_amount).toFixed(2)}` : '-'}
                        {p.paid_date && <div className="text-[10px] opacity-40 font-sans">{p.paid_date}</div>}
                      </td>
                      <td>
                        {p.receipt_link ? (
                          <a href={p.receipt_link} target="_blank" rel="noreferrer" className="link link-primary font-medium text-xs break-all">{lang === 'ms' ? 'Buka Resit 2' : 'View Link 2'}</a>
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* MODAL INPUT: REKOD PRODUKSI STOK BARU (DIKEMAS KINI: Input yang tidak perlu di-hide sepenuhnya) */}
        {isStockModalOpen && isAuthorized && (
          <div className="modal modal-open z-50">
            <div className="modal-box max-w-md border border-base-200 shadow-2xl rounded-2xl p-6">
              <h3 className="font-bold text-xl text-accent mb-4">🏭 {t('addStock')}</h3>
              <form onSubmit={handleAddStock} className="space-y-4">
                
                <div className="form-control">
                  <label className="label-text font-semibold mb-1">{t('prodDate')} *</label>
                  <input type="date" required className="input input-bordered w-full text-base rounded-xl" value={prodDate} onChange={(e) => setProdDate(e.target.value)} />
                </div>
                
                <div className="form-control">
                  <label className="label-text font-semibold mb-1">{t('batchNo')} (Auto)</label>
                  <input type="text" readOnly className="input input-bordered w-full text-base rounded-xl font-mono bg-base-200 cursor-not-allowed font-bold text-secondary" value={prodBatch} />
                </div>
                
                <div className="form-control">
                  <label className="label-text font-semibold mb-1">{lang === 'ms' ? 'Pilih Staf Bertugas' : 'Select Staff In-Charge'}</label>
                  <select required className="select select-bordered w-full text-base rounded-xl font-bold" value={prodName} onChange={(e) => setProdName(e.target.value)}>
                    <option value="">{lang === 'ms' ? '-- Pilih Nama Staf --' : '-- Select Staff Name --'}</option>
                    {staffList.map((staff, sIdx) => (
                      staff.full_name && <option key={sIdx} value={staff.full_name}>{staff.full_name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-control">
                  <label className="label-text font-semibold mb-1">{t('quantity')} *</label>
                  <input type="number" required placeholder="0" className="input input-bordered w-full text-base rounded-xl font-bold" value={prodQty} onChange={(e) => setProdQty(e.target.value)} />
                </div>

                <div className="modal-action gap-2 pt-2 border-t border-base-200">
                  <button type="button" className="btn btn-sm btn-ghost rounded-lg" onClick={() => { setIsStockModalOpen(false); }}>{t('cancel')}</button>
                  <button type="submit" disabled={loading} className="btn btn-sm btn-accent rounded-lg font-bold px-4">{loading ? t('saving') : t('saveRecord')}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-8 relative">
      {toastMessage && (
        <div className="toast toast-top toast-end z-50 p-4">
          <div className="alert alert-success shadow-lg text-white font-medium flex items-center gap-2 rounded-xl border border-success/20">
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-base-100 pb-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">{t('inventory')}</h1>
          <p className="text-sm opacity-60">{t('inventoryDesc')}</p>
        </div>
        
        {isAuthorized && (
          <button onClick={() => setIsModalOpen(true)} className="btn btn-primary font-bold shadow-lg gap-2 rounded-xl self-start sm:self-auto">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            {t('addProduct')}
          </button>
        )}
      </div>

      <div className="card bg-base-100 shadow-xl p-6 border border-base-200">
        {loading && products.length === 0 ? (
          <div className="text-center py-8"><span className="loading loading-spinner loading-lg"></span></div>
        ) : products.length === 0 ? (
          <p className="text-center py-8 opacity-60">{t('noProducts')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr>
                  <th className="w-16 text-center">{t('no')}</th>
                  <th>{t('productName')}</th>
                  <th className="w-32 text-center">{lang === 'ms' ? 'Hayat (Bulan)' : 'Shelf Life'}</th>
                </tr>
              </thead>
              <tbody>
                {products.map((prod, index) => (
                  <tr key={prod.id} className="hover">
                    <td className="text-center opacity-70 font-mono">{index + 1}</td>
                    <td>
                      <button onClick={() => setSelectedProduct(prod)} className="font-bold text-base tracking-wide text-left link link-primary hover:text-primary-focus transition-all">
                        {prod.product_name}
                      </button>
                    </td>
                    <td className="text-center font-mono opacity-80 font-bold">{prod.expiry_month || 12}M</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && isAuthorized && (
        <div className="modal modal-open z-50">
          <div className="modal-box max-w-md border border-base-200 shadow-2xl rounded-2xl p-6">
            <h3 className="font-bold text-xl text-primary flex items-center gap-2 mb-4">📦 {t('addProduct')}</h3>
            <form onSubmit={handleAddProduct} className="space-y-4">
              <div className="form-control">
                <label className="label-text font-semibold mb-1">{t('productName')} *</label>
                <input type="text" required placeholder={t('productNamePlaceholder')} className="input input-bordered w-full text-base rounded-xl" value={productName} onChange={(e) => setProductName(e.target.value)} />
              </div>
              <div className="form-control">
                <label className="label-text font-semibold mb-1">{lang === 'ms' ? 'Tempoh Jangka Hayat (Bulan)' : 'Shelf Life Duration (Months)'}</label>
                <input type="number" required min="1" placeholder="12" className="input input-bordered w-full text-base rounded-xl" value={expiryMonth} onChange={(e) => setExpiryMonth(e.target.value)} />
              </div>
              <div className="modal-action gap-2 pt-2">
                <button type="button" className="btn btn-sm btn-ghost rounded-lg" onClick={() => { setIsModalOpen(false); setProductName(''); setExpiryMonth('12'); }}>{t('cancel')}</button>
                <button type="submit" disabled={loading} className="btn btn-sm btn-primary rounded-lg font-bold px-4">{loading ? t('saving') : t('saveProduct')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}