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
      .select(`
        *,
        stock_productions(id, batch_no, production_date, expiry_date, is_finished, created_at)
      `)
      .order('created_at', { ascending: true })

    if (error) {
      console.error(error.message)
    } else {
      const processed = (data || []).map(prod => {
        const activeStocks = (prod.stock_productions || [])
          .filter(stock => stock.is_finished === false)
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        
        return {
          ...prod,
          fifo_stock: activeStocks[0] || null
        }
      })
      setProducts(processed)
    }
    setLoading(false)
  }

  const fetchProductions = async (productId) => {
    setLoading(true)
    const { data, error } = await supabase
      .from('stock_productions')
      .select('*')
      .eq('inventory_id', productId)
      .order('created_at', { ascending: false }) 

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

  // FUNGSI BARU: Mengemas kini status batch pengeluaran kepada selesai / dah habis
  const handleToggleStockFinished = async (productionId, currentStatus) => {
    setLoading(true)
    const { error } = await supabase
      .from('stock_productions')
      .update({ is_finished: !currentStatus, updated_at: new Date().toISOString() })
      .eq('id', productionId)

    if (error) {
      alert(t('updateFailed') + error.message)
    } else {
      showToast(lang === 'ms' ? 'Status kelompok berjaya dikemas kini!' : 'Batch status updated successfully!')
      if (selectedProduct) fetchProductions(selectedProduct.id)
    }
    setLoading(false)
  }

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
      fetchProducts()
      if (selectedProduct) fetchProductions(selectedProduct.id)
    }
    setLoading(false)
  }

  // --- SUB-PAGE: STOCK PRODUCTION LISTING ---
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

        <div className="flex flex-col gap-4 border-b border-base-100 pb-4">
          <div className="flex items-start justify-between gap-3 w-full">
            <div className="flex items-start gap-3 flex-1">
              <button 
                onClick={() => { setSelectedProduct(null); fetchProducts(); }} 
                className="btn btn-md btn-circle btn-active bg-base-200 hover:bg-base-300 border-base-300 text-base-content shadow-md shrink-0 flex items-center justify-center font-black"
                title="Kembali ke Senarai"
              >
                ✕
              </button>
              
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap">
                <h1 className="text-xl md:text-2xl font-black tracking-tight leading-tight max-w-full break-words">
                  {selectedProduct.product_name}
                </h1>
                <span className="badge badge-md badge-outline font-bold font-mono text-secondary px-2.5 py-3 whitespace-nowrap self-start sm:self-auto shadow-sm">
                  Shelf Life: {selectedProduct.expiry_month || 12}M
                </span>
              </div>
            </div>

            {isAuthorized && (
              <button onClick={() => setIsStockModalOpen(true)} className="btn btn-sm btn-accent font-bold shadow-md rounded-xl whitespace-nowrap shrink-0 hidden sm:inline-flex">
                + {t('addStock')}
              </button>
            )}
          </div>
          
          <div className="flex items-center justify-between w-full">
            <p className="text-xs opacity-60 font-semibold uppercase tracking-wider">{t('stockListing')}</p>
            {isAuthorized && (
              <button onClick={() => setIsStockModalOpen(true)} className="btn btn-sm btn-accent font-bold shadow-md rounded-xl w-full sm:w-auto sm:hidden mt-1">
                + {t('addStock')}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading && productions.length === 0 ? (
            <div className="text-center py-6 col-span-full"><span className="loading loading-spinner"></span></div>
          ) : productions.length === 0 ? (
            <div className="text-center py-8 card bg-base-100 border border-base-200 col-span-full"><p className="opacity-50 text-sm">{lang === 'ms' ? 'Tiada rekod pengeluaran batch bagi produk ini.' : 'No production batch records for this product.'}</p></div>
          ) : (
            productions.map((p, pIdx) => (
              <div key={p.id || pIdx} className="card bg-base-100 border border-base-300 shadow-md p-4 space-y-3 rounded-2xl relative overflow-hidden flex flex-col justify-between">
                <div className={`absolute top-0 right-0 left-0 h-1.5 ${p.is_finished ? 'bg-success' : 'bg-primary'}`}></div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center border-b border-base-200/60 pb-2.5 gap-2">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase font-black opacity-50 tracking-wider text-primary">{t('batchNo')}</span>
                      <span className="font-mono font-black text-primary text-xl tracking-wide">{p.batch_no}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-black opacity-50 tracking-wider block text-success">{t('date')}</span>
                      <span className="font-black text-base text-success tracking-wide">{p.production_date}</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm py-0.5">
                    <div>
                      <span className="text-[11px] block opacity-50 font-bold tracking-tight">{lang === 'ms' ? 'Staf Bertugas' : 'Staff In-Charge'}</span>
                      <span className="font-black text-base-content/90 text-sm break-all">{p.production_name || '-'}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] block opacity-50 font-bold tracking-tight">{t('quantity')}</span>
                      <span className="font-black text-xl text-info">{p.quantity}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm border-t border-base-200/60 pt-2.5 items-center">
                    <div>
                      <span className="text-[11px] block opacity-50 font-bold tracking-tight">{t('expiryDate')}</span>
                      <span className="font-black text-sm text-error">{p.expiry_date || '-'}</span>
                    </div>
                    <div className="text-right">
                      <span className={`badge badge-md font-black shadow-sm ${p.is_finished ? 'badge-success text-white' : 'badge-warning text-black'}`}>
                        {p.is_finished ? t('statusDone') : t('statusActive')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* DIKEMAS KINI: Menambahkan Butang Tukar Status "Dah Habis" di Bahagian Bawah Setiap Kad */}
                <div className="pt-3 border-t border-base-200/40 mt-1">
                  <button
                    disabled={loading}
                    onClick={() => handleToggleStockFinished(p.id, p.is_finished)}
                    className={`btn btn-xs btn-block font-bold rounded-xl shadow-sm transition-all ${
                      p.is_finished 
                        ? 'btn-outline btn-success' 
                        : 'btn-neutral text-white'
                    }`}
                  >
                    {p.is_finished 
                      ? (lang === 'ms' ? '🔄 Buka Semula Batch' : '🔄 Re-open Batch') 
                      : (lang === 'ms' ? '✅ Tandakan Dah Habis' : '✅ Mark as Finished')
                    }
                  </button>
                </div>

              </div>
            ))
          )}
        </div>

        {/* MODAL INPUT: REKOD PRODUKSI STOK BARU */}
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
                  <input type="text" readOnly className="input input-bordered w-full text-base rounded-xl font-mono bg-base-200 cursor-not-allowed font-black text-primary text-lg" value={prodBatch} />
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
                  <button type="button" className="btn btn-sm btn-ghost rounded-lg" onClick={() => setIsStockModalOpen(false)}>{t('cancel')}</button>
                  <button type="submit" disabled={loading} className="btn btn-sm btn-accent rounded-lg font-bold px-4">{loading ? t('saving') : t('saveRecord')}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    )
  }

  // --- MAIN PAGE: INVENTORY MANAGER (PRODUCT LISTING) ---
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
            <svg xmlns="http://www.w3.org/2000/xl" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            {t('addProduct')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading && products.length === 0 ? (
          <div className="text-center py-8 col-span-full"><span className="loading loading-spinner loading-lg"></span></div>
        ) : products.length === 0 ? (
          <p className="text-center py-8 opacity-60 col-span-full">{t('noProducts')}</p>
        ) : (
          products.map((prod, index) => (
            <div key={prod.id || index} className="card bg-base-100 border border-base-300 shadow-xl rounded-2xl p-5 space-y-4 relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 right-0 left-0 h-1.5 bg-secondary"></div>
              
              <div className="flex justify-between items-start gap-2 border-b border-base-200 pb-3">
                <button 
                  onClick={() => setSelectedProduct(prod)} 
                  className="font-black text-lg text-left link link-primary hover:text-primary-focus transition-all leading-tight flex-1"
                >
                  {prod.product_name}
                </button>
                <span className="badge badge-sm badge-outline font-bold font-mono text-secondary p-2 whitespace-nowrap shadow-xs">
                  {prod.expiry_month || 12}M
                </span>
              </div>

              <div className="bg-base-200/50 rounded-2xl p-3 border border-base-200 space-y-2">
                <span className="text-[10px] uppercase font-black opacity-50 tracking-wider text-error block">
                  {lang === 'ms' ? 'Stok Lama Kena Keluar (FIFO)' : 'Oldest Active Stock'}
                </span>
                
                {prod.fifo_stock ? (
                  <div className="flex justify-between items-center gap-2">
                    <div className="flex flex-col">
                      <span className="text-[9px] uppercase font-bold opacity-40">{t('batchNo')}</span>
                      <span className="font-mono font-black text-error text-lg tracking-wide">{prod.fifo_stock.batch_no}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] uppercase font-bold opacity-40 block text-error">{t('expiryDate')}</span>
                      <span className="font-black text-sm text-error tracking-wide">{prod.fifo_stock.expiry_date}</span>
                    </div>
                  </div>
                ) : (
                  <span className="text-xs opacity-40 font-bold font-sans block py-1">
                    {lang === 'ms' ? 'Tiada Baki Stok Aktif' : 'No Active Stock'}
                  </span>
                )}
              </div>

              <div className="pt-1">
                <button 
                  onClick={() => setSelectedProduct(prod)} 
                  className="btn btn-sm btn-block btn-outline btn-primary rounded-xl font-bold"
                >
                  {lang === 'ms' ? 'Lihat Rekod Stok ↗' : 'View Stock Records ↗'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* MODAL INPUT: TAMBAH PRODUK BARU */}
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