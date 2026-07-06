import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { translations } from './translations'

export default function Inventory({ session, userRole, lang = 'en' }) {
  const [selectedProduct, setSelectedProduct] = useState(null)

  const [products, setProducts] = useState([])
  const [productName, setProductName] = useState('')
  const [expiryMonth, setExpiryMonth] = useState('12')
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [loadingProductions, setLoadingProductions] = useState(false)
  const [loadingSave, setLoadingSave] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  const [productions, setProductions] = useState([])
  const [staffList, setStaffList] = useState([])
  const [isStockModalOpen, setIsStockModalOpen] = useState(false)
  const [prodDate, setProdDate] = useState(new Date().toISOString().split('T')[0])
  const [prodQty, setProdQty] = useState('')
  const [prodName, setProdName] = useState('')
  const [prodBatch, setProdBatch] = useState('BATCH-001')

  const t = (key) => translations[lang]?.[key] || translations['en'][key]

  const cleanedRole = String(userRole || '').trim().toLowerCase()
  const isAuthorized = cleanedRole === 'super_admin' || cleanedRole === 'admin'

  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 3000)
  }

  const fetchProducts = async () => {
    setLoadingProducts(true)
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
        return { ...prod, fifo_stock: activeStocks[0] || null }
      })
      setProducts(processed)
    }
    setLoadingProducts(false)
  }

  const fetchProductions = async (productId) => {
    setLoadingProductions(true)
    const { data, error } = await supabase
      .from('stock_productions')
      .select('*')
      .eq('inventory_id', productId)
      .order('created_at', { ascending: false })

    if (error) console.error(error.message)
    else setProductions(data || [])
    setLoadingProductions(false)
  }

  const fetchStaffList = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name')
      .order('full_name', { ascending: true })

    if (error) console.error('Error fetching staff names:', error.message)
    else setStaffList((data || []).filter(s => s.full_name))
  }

  useEffect(() => {
    fetchProducts()
    fetchStaffList()
  }, [])

  useEffect(() => {
    if (selectedProduct) fetchProductions(selectedProduct.id)
  }, [selectedProduct])

  useEffect(() => {
    if (!isStockModalOpen) return
    if (productions.length === 0) {
      setProdBatch('BATCH-001')
    } else {
      const latestProd = productions[0]
      const currentBatchNo = latestProd?.batch_no || 'BATCH-000'
      const match = currentBatchNo.match(/\d+$/)
      if (match) {
        const nextNumber = parseInt(match[0], 10) + 1
        const paddedNumber = String(nextNumber).padStart(match[0].length, '0')
        setProdBatch(currentBatchNo.replace(/\d+$/, paddedNumber))
      } else {
        setProdBatch(`BATCH-${productions.length + 1}`)
      }
    }
  }, [isStockModalOpen, productions])

  const handleToggleStockFinished = async (productionId, currentStatus) => {
    setLoadingSave(true)
    const { error } = await supabase
      .from('stock_productions')
      .update({ is_finished: !currentStatus, updated_at: new Date().toISOString() })
      .eq('id', productionId)

    if (error) {
      alert(t('updateFailed') + error.message)
    } else {
      showToast(lang === 'ms' ? 'Status kelompok berjaya dikemas kini!' : lang === 'zh' ? '批次状态更新成功！' : 'Batch status updated successfully!')
      if (selectedProduct) fetchProductions(selectedProduct.id)
    }
    setLoadingSave(false)
  }

  const handleAddProduct = async (e) => {
    e.preventDefault()
    if (!productName.trim() || !isAuthorized) return

    setLoadingSave(true)
    const { error } = await supabase.from('inventory').insert([{
      user_id: session.user.id,
      product_name: productName.trim(),
      expiry_month: parseInt(expiryMonth) || 12,
      current_stock: 0
    }])

    if (error) {
      alert(t('saveFailed') + error.message)
    } else {
      setProductName('')
      setExpiryMonth('12')
      setIsModalOpen(false)
      showToast(lang === 'ms' ? 'Produk berjaya ditambah!' : lang === 'zh' ? '产品添加成功！' : 'Product added successfully!')
      fetchProducts()
    }
    setLoadingSave(false)
  }

  const handleAddStock = async (e) => {
    e.preventDefault()
    if (!isAuthorized || !selectedProduct) return

    setLoadingSave(true)
    const productionDateObj = new Date(prodDate)
    const monthsToAdd = selectedProduct.expiry_month || 12
    productionDateObj.setMonth(productionDateObj.getMonth() + monthsToAdd)
    const calculatedExpiryDate = productionDateObj.toISOString().split('T')[0]

    const { error } = await supabase.from('stock_productions').insert([{
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
    }])

    if (error) {
      alert(t('saveFailed') + error.message)
    } else {
      setProdQty('')
      setProdName('')
      setIsStockModalOpen(false)
      showToast(lang === 'ms' ? 'Rekod produksi berjaya disimpan!' : lang === 'zh' ? '生产记录保存成功！' : 'Production record saved!')
      fetchProducts()
      if (selectedProduct) fetchProductions(selectedProduct.id)
    }
    setLoadingSave(false)
  }

  const activeBatchCount = productions.filter(p => !p.is_finished).length

  // ─── PRODUCT DETAIL VIEW ───────────────────────────────────────────────────
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

        <div className="flex flex-col gap-4 border-b border-base-200 pb-4">
          <div className="flex items-start justify-between gap-3 w-full">
            <div className="flex items-start gap-3 flex-1">
              <button
                onClick={() => { setSelectedProduct(null); fetchProducts() }}
                className="btn btn-md btn-circle btn-active bg-base-200 hover:bg-base-300 border-base-300 text-base-content shadow-md shrink-0 flex items-center justify-center font-black"
              >
                ✕
              </button>

              <div className="flex flex-col gap-1.5 flex-1">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap">
                  <h1 className="text-xl md:text-2xl font-black tracking-tight leading-tight max-w-full break-words">
                    {selectedProduct.product_name}
                  </h1>
                  <span className="badge badge-md badge-outline font-bold font-mono text-secondary px-2.5 py-3 whitespace-nowrap self-start sm:self-auto shadow-sm">
                    Shelf Life: {selectedProduct.expiry_month || 12}M
                  </span>
                </div>
                <div className="w-fit bg-warning/20 border border-warning/40 px-3 py-1 rounded-xl flex items-center gap-1.5 text-xs font-black text-warning-content shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-warning animate-pulse"></span>
                  <span>
                    {lang === 'ms' ? `Baki Stok: ${activeBatchCount} Batch`
                      : lang === 'zh' ? `活跃库存: ${activeBatchCount} 批次`
                      : `Active Stock: ${activeBatchCount} Batches`}
                  </span>
                </div>
              </div>
            </div>

            {isAuthorized && (
              <button onClick={() => setIsStockModalOpen(true)} className="btn btn-sm btn-accent font-bold shadow-md rounded-xl whitespace-nowrap shrink-0 hidden sm:inline-flex">
                + {t('addStock')}
              </button>
            )}
          </div>

          {isAuthorized && (
            <div className="block sm:hidden w-full pt-1">
              <button onClick={() => setIsStockModalOpen(true)} className="btn btn-md btn-block btn-accent font-black shadow-md rounded-xl text-sm">
                + {t('addStock')}
              </button>
            </div>
          )}
        </div>

        {/* Loading state untuk productions */}
        {loadingProductions ? (
          <div className="flex justify-center py-12">
            <span className="loading loading-spinner loading-lg text-primary"></span>
          </div>
        ) : productions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 opacity-50">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
            <p className="font-bold text-sm">
              {lang === 'ms' ? 'Tiada rekod produksi lagi.' : lang === 'zh' ? '暂无生产记录。' : 'No production records yet.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {productions.map((p, pIdx) => (
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
                      <span className="text-[11px] block opacity-50 font-bold tracking-tight">
                        {lang === 'ms' ? 'Staf Bertugas' : lang === 'zh' ? '负责员工' : 'Staff In-Charge'}
                      </span>
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
                <div className="pt-3 border-t border-base-200/40 mt-1">
                  <button
                    onClick={() => handleToggleStockFinished(p.id, p.is_finished)}
                    disabled={loadingSave}
                    className={`btn btn-xs btn-block font-bold rounded-xl shadow-sm transition-all ${p.is_finished ? 'btn-outline btn-success' : 'btn-neutral text-white'}`}
                  >
                    {p.is_finished
                      ? (lang === 'ms' ? '🔄 Buka Semula Batch' : lang === 'zh' ? '🔄 重新开启批次' : '🔄 Re-open Batch')
                      : (lang === 'ms' ? '✅ Tandakan Dah Habis' : lang === 'zh' ? '✅ 标记为已完成' : '✅ Mark as Finished')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal Tambah Stok */}
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
                  <label className="label-text font-semibold mb-1">
                    {lang === 'ms' ? 'Pilih Staf Bertugas' : lang === 'zh' ? '选择负责员工' : 'Select Staff In-Charge'}
                  </label>
                  {staffList.length > 0 ? (
                    <select
                      required
                      className="select select-bordered w-full text-base rounded-xl font-bold"
                      value={prodName}
                      onChange={(e) => setProdName(e.target.value)}
                    >
                      <option value="">
                        {lang === 'ms' ? '-- Pilih Nama Staf --' : lang === 'zh' ? '-- 选择员工姓名 --' : '-- Select Staff Name --'}
                      </option>
                      {staffList.map((staff, sIdx) => (
                        <option key={sIdx} value={staff.full_name}>{staff.full_name}</option>
                      ))}
                    </select>
                  ) : (
                    // Kalau staff list kosong, tunjuk input text supaya user tak stuck
                    <input
                      type="text"
                      className="input input-bordered w-full text-base rounded-xl"
                      placeholder={lang === 'ms' ? 'Tiada staf didaftarkan, taip nama' : lang === 'zh' ? '无员工记录，请手动输入' : 'No staff found, type a name'}
                      value={prodName}
                      onChange={(e) => setProdName(e.target.value)}
                    />
                  )}
                </div>
                <div className="form-control">
                  <label className="label-text font-semibold mb-1">{t('quantity')} *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="0"
                    className="input input-bordered w-full text-base rounded-xl font-bold"
                    value={prodQty}
                    onChange={(e) => setProdQty(e.target.value)}
                  />
                </div>
                <div className="modal-action gap-2 pt-2 border-t border-base-200">
                  <button type="button" className="btn btn-sm btn-ghost rounded-lg" onClick={() => setIsStockModalOpen(false)}>{t('cancel')}</button>
                  <button type="submit" disabled={loadingSave} className="btn btn-sm btn-accent rounded-lg font-bold px-4">
                    {loadingSave ? t('saving') : t('saveRecord')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── PRODUCT LIST VIEW ─────────────────────────────────────────────────────
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
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t('addProduct')}
          </button>
        )}
      </div>

      {/* Loading state */}
      {loadingProducts ? (
        <div className="flex justify-center py-16">
          <span className="loading loading-spinner loading-lg text-primary"></span>
        </div>
      ) : products.length === 0 ? (
        // Empty state
        <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-14 h-14">
            <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
          </svg>
          <div className="text-center">
            <p className="font-black text-base">{t('noProducts')}</p>
            {isAuthorized && (
              <p className="text-sm mt-1">
                {lang === 'ms' ? 'Klik "Tambah Produk Baharu" untuk mula.' : lang === 'zh' ? '点击"添加新产品"开始。' : 'Click "Add New Product" to get started.'}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((prod, index) => {
            const activeCount = (prod.stock_productions || []).filter(p => !p.is_finished).length
            return (
              <div key={prod.id || index} className="card bg-base-100 border border-base-300 shadow-xl rounded-2xl p-5 space-y-4 relative overflow-hidden flex flex-col justify-between">
                <div className="absolute top-0 right-0 left-0 h-1.5 bg-secondary"></div>
                <div className="flex justify-between items-start gap-2 border-b border-base-200 pb-3">
                  <div className="flex flex-col gap-1 flex-1">
                    <button onClick={() => setSelectedProduct(prod)} className="font-black text-lg text-left link link-primary hover:text-primary-focus transition-all leading-tight">
                      {prod.product_name}
                    </button>
                    <div className={`w-fit text-[10px] font-black px-2 py-0.5 rounded-lg ${activeCount > 0 ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
                      {activeCount > 0
                        ? (lang === 'ms' ? `${activeCount} Batch Aktif` : lang === 'zh' ? `${activeCount} 个活跃批次` : `${activeCount} Active Batches`)
                        : (lang === 'ms' ? 'Tiada Stok Aktif' : lang === 'zh' ? '无活跃库存' : 'No Active Stock')}
                    </div>
                  </div>
                  <span className="badge badge-sm badge-outline font-bold font-mono text-secondary p-2 whitespace-nowrap shadow-xs">{prod.expiry_month || 12}M</span>
                </div>
                <div className="bg-base-200/50 rounded-2xl p-3 border border-base-200 space-y-2">
                  <span className="text-[10px] uppercase font-black opacity-50 tracking-wider text-error block">
                    {lang === 'ms' ? 'Stok Lama Kena Keluar (FIFO)' : lang === 'zh' ? '最旧库存优先出库 (FIFO)' : 'Oldest Active Stock (FIFO)'}
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
                      {lang === 'ms' ? 'Tiada Baki Stok Aktif' : lang === 'zh' ? '无活跃库存余量' : 'No Active Stock'}
                    </span>
                  )}
                </div>
                <div className="pt-1">
                  <button onClick={() => setSelectedProduct(prod)} className="btn btn-sm btn-block btn-outline btn-primary rounded-xl font-bold">
                    {lang === 'ms' ? 'Lihat Rekod Stok ↗' : lang === 'zh' ? '查看库存记录 ↗' : 'View Stock Records ↗'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Tambah Produk */}
      {isModalOpen && isAuthorized && (
        <div className="modal modal-open z-50">
          <div className="modal-box max-w-md border border-base-200 shadow-2xl rounded-2xl p-6">
            <h3 className="font-bold text-xl text-primary flex items-center gap-2 mb-4">📦 {t('addProduct')}</h3>
            <form onSubmit={handleAddProduct} className="space-y-4">
              <div className="form-control">
                <label className="label-text font-semibold mb-1">{t('productName')} *</label>
                <input
                  type="text"
                  required
                  placeholder={t('productNamePlaceholder')}
                  className="input input-bordered w-full text-base rounded-xl"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                />
              </div>
              <div className="form-control">
                <label className="label-text font-semibold mb-1">
                  {lang === 'ms' ? 'Tempoh Jangka Hayat (Bulan)' : lang === 'zh' ? '保质期（月）' : 'Shelf Life Duration (Months)'}
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="12"
                  className="input input-bordered w-full text-base rounded-xl"
                  value={expiryMonth}
                  onChange={(e) => setExpiryMonth(e.target.value)}
                />
              </div>
              <div className="modal-action gap-2 pt-2">
                <button type="button" className="btn btn-sm btn-ghost rounded-lg" onClick={() => { setIsModalOpen(false); setProductName(''); setExpiryMonth('12') }}>{t('cancel')}</button>
                <button type="submit" disabled={loadingSave} className="btn btn-sm btn-primary rounded-lg font-bold px-4">
                  {loadingSave ? t('saving') : t('saveProduct')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
