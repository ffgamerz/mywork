import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function Inventory({ session, userRole, allowedModules = {} }) {
  const [selectedProduct, setSelectedProduct] = useState(null)

  const [products, setProducts] = useState([])
  const [productName, setProductName] = useState('')
  const [expiryMonth, setExpiryMonth] = useState('12')
  const [wageRate, setWageRate] = useState('0.00') 
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [loadingProductions, setLoadingProductions] = useState(false)
  const [loadingSave, setLoadingSave] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  const [productions, setProductions] = useState([])
  const [staffList, setStaffList] = useState([])
  
  // State for Add/Edit Stock
  const [isStockModalOpen, setIsStockModalOpen] = useState(false)
  const [isEditStockModalOpen, setIsEditStockModalOpen] = useState(false)
  const [editingStock, setEditingStock] = useState(null)
  
  // State for Edit Product
  const [isEditProductModalOpen, setIsEditProductModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [editWageRate, setEditWageRate] = useState('0.00')
  const [editExpiryMonth, setEditExpiryMonth] = useState('12')

  const [prodDate, setProdDate] = useState(new Date().toISOString().split('T')[0])
  const [prodQty, setProdQty] = useState('')
  const [prodName, setProdName] = useState('')
  const [prodBatch, setProdBatch] = useState('BATCH-001')
  const [visibleCount, setVisibleCount] = useState(6)
  const prodPageSize = 6

  // ─── KAWALAN HAK AKSES OPERASI BAHARU ─────────────────────────────────────
  const cleanedRole = String(userRole || '').trim().toLowerCase()
  
  // 1. Super Admin mempunyai kuasa mutlak
  const isSuperAdmin = cleanedRole === 'super_admin'
  const isAdmin = cleanedRole === 'admin'
  
  // 2. Akses Masuk Halaman: Super Admin atau sesiapa yang ada privilege modul
  const hasPageAccess = isSuperAdmin || allowedModules['inventory'] === true || isAdmin

  // 3. Permission to Add/Edit Stock Info: ONLY Super Admin
  const canEditStockInfo = isSuperAdmin

  // 4. Permission to Set Stock Finished / Revert: Super Admin & Admin can do
  const canToggleStockStatus = isSuperAdmin || isAdmin
  // ───────────────────────────────────────────────────────────────────────────

  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 3000)
  }

  const fetchProducts = async () => {
    if (!hasPageAccess) return
    setLoadingProducts(true)
    const { data, error } = await supabase
      .from('inventory')
      .select(`
        *,
        stock_productions(id, batch_no, production_date, expiry_date, is_finished, paid_amount, created_at)
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
      .order('production_date', { ascending: false })

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
    if (hasPageAccess) {
      fetchProducts()
      fetchStaffList()
    }
  }, [hasPageAccess])

  useEffect(() => {
    if (selectedProduct && hasPageAccess) {
      fetchProductions(selectedProduct.id)
      setVisibleCount(6)
    }
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

  if (!hasPageAccess) {
    return (
      <div className="alert-unauthorized">
        <div><span>🔒 Access Denied: Unauthorized.</span></div>
      </div>
    )
  }

  const handleToggleStockFinished = async (productionId, currentStatus) => {
    if (!canToggleStockStatus) {
      showToast('Access denied. You do not have permission to change batch status.')
      return
    }

    setLoadingSave(true)
    const { error } = await supabase
      .from('stock_productions')
      .update({ is_finished: !currentStatus, updated_at: new Date().toISOString() })
      .eq('id', productionId)

    if (error) {
      showToast('Failed to update data: ' + error.message)
    } else {
      showToast('Batch status updated!')
      if (selectedProduct) fetchProductions(selectedProduct.id)
    }
    setLoadingSave(false)
  }

  const handleAddProduct = async (e) => {
    e.preventDefault()
    if (!productName.trim() || !canEditStockInfo) return

    setLoadingSave(true)
    const { error } = await supabase.from('inventory').insert([{
      user_id: session.user.id,
      product_name: productName.trim(),
      expiry_month: parseInt(expiryMonth) || 12,
      wage_rate: parseFloat(wageRate) || 0.00, 
      current_stock: 0
    }])

    if (error) {
      showToast('Failed to save data: ' + error.message)
    } else {
      setProductName('')
      setExpiryMonth('12')
      setWageRate('0.00')
      setIsModalOpen(false)
      showToast('Product added successfully!')
      fetchProducts()
    }
    setLoadingSave(false)
  }

  const handleAddStock = async (e) => {
    e.preventDefault()
    if (!canEditStockInfo || !selectedProduct) return

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
      paid_amount: null,
      receipt_link: null
    }])

    if (error) {
      showToast('Failed to save data: ' + error.message)
    } else {
      setProdQty('')
      setProdName('')
      setIsStockModalOpen(false)
      showToast('Production record saved!')
      fetchProducts()
      if (selectedProduct) fetchProductions(selectedProduct.id)
    }
    setLoadingSave(false)
  }

  const handleOpenEditStockModal = (stock) => {
    if (!canEditStockInfo) {
      showToast('Access denied. Only Super Admin can edit stock info.')
      return
    }
    setEditingStock(stock)
    setProdDate(stock.production_date)
    setProdBatch(stock.batch_no)
    setProdQty(stock.quantity.toString())
    setProdName(stock.production_name || '')
    setIsEditStockModalOpen(true)
  }

  const handleUpdateStock = async (e) => {
    e.preventDefault()
    if (!canEditStockInfo || !editingStock || !selectedProduct) {
      showToast('Access denied.')
      return
    }

    setLoadingSave(true)
    
    const productionDateObj = new Date(prodDate)
    const monthsToAdd = selectedProduct.expiry_month || 12
    productionDateObj.setMonth(productionDateObj.getMonth() + monthsToAdd)
    const calculatedExpiryDate = productionDateObj.toISOString().split('T')[0]

    const { error } = await supabase
      .from('stock_productions')
      .update({
        production_date: prodDate,
        batch_no: prodBatch.trim(),
        quantity: parseInt(prodQty) || 0,
        production_name: prodName || null,
        expiry_date: calculatedExpiryDate,
        updated_at: new Date().toISOString()
      })
      .eq('id', editingStock.id)

    if (error) {
      showToast('Failed to update data: ' + error.message)
    } else {
      setIsEditStockModalOpen(false)
      setEditingStock(null)
      showToast('Stock record updated!')
      fetchProducts()
      if (selectedProduct) fetchProductions(selectedProduct.id)
    }
    setLoadingSave(false)
  }

  const handleOpenEditProductModal = (product) => {
    if (!canEditStockInfo) {
      showToast('Access denied. Only Super Admin can edit products.')
      return
    }
    setEditingProduct(product)
    setEditWageRate(product.wage_rate ? String(product.wage_rate) : '0.00')
    setEditExpiryMonth(product.expiry_month ? String(product.expiry_month) : '12')
    setIsEditProductModalOpen(true)
  }

  const handleUpdateProduct = async (e) => {
    e.preventDefault()
    if (!canEditStockInfo || !editingProduct) {
      showToast('Access denied.')
      return
    }

    setLoadingSave(true)
    
    const { error } = await supabase
      .from('inventory')
      .update({
        expiry_month: parseInt(editExpiryMonth) || 12,
        wage_rate: parseFloat(editWageRate) || 0.00,
        updated_at: new Date().toISOString()
      })
      .eq('id', editingProduct.id)

    if (error) {
      showToast('Failed to update data: ' + error.message)
    } else {
      setIsEditProductModalOpen(false)
      setEditingProduct(null)
      showToast('Product updated successfully!')
      fetchProducts()
    }
    setLoadingSave(false)
  }

  const activeBatchCount = productions.filter(p => !p.is_finished).length
  const visibleProductions = productions.slice(0, visibleCount)

  // ─── PRODUCT DETAIL VIEW ───────────────────────────────────────────────────
  if (selectedProduct) {
    return (
      <div className="page-shell relative">
        {toastMessage && (
          <div className="toast-success">
            <div className="alert-toast">
              <span>{toastMessage}</span>
            </div>
          </div>
        )}

        <div className="page-header gap-4">
          <div className="flex items-start justify-between gap-3 w-full">
            <div className="flex items-start gap-3 flex-1">
              <button
                onClick={() => { setSelectedProduct(null); fetchProducts() }}
                className="btn btn-sm btn-circle btn-active bg-base-200 hover:bg-base-300 border-base-300 text-base-content shrink-0 flex items-center justify-center font-black"
              >
                ✕
              </button>

              <div className="flex flex-col gap-1.5 flex-1">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap">
                  <h1 className="text-xl md:text-2xl font-black tracking-tight leading-tight max-w-full break-words">
                    {selectedProduct.product_name}
                  </h1>
              <span className="badge badge-md badge-outline font-bold font-mono text-secondary px-2.5 py-3 whitespace-nowrap self-start sm:self-auto shadow-sm">
                Shelf Life (Months): {selectedProduct.expiry_month || 12}M
              </span>
              <span className="badge badge-md badge-primary font-bold text-white px-2.5 py-3 shadow-sm">
                Wage: RM {parseFloat(selectedProduct.wage_rate || 0).toFixed(2)}
              </span>
                </div>
              <div className="w-fit bg-warning/20 border border-warning/40 px-3 py-1 rounded-xl flex items-center gap-1.5 text-xs font-black text-warning-content shadow-sm">
                <span className="w-2 h-2 rounded-full bg-warning animate-pulse"></span>
                <span>
                  Active Stock: {activeBatchCount} Active Stock Batch
                </span>
              </div>
              </div>
            </div>

            {/* Add Stock button at top - visible to Super Admin only */}
            {canEditStockInfo && (
              <button onClick={() => {
                setProdDate(new Date().toISOString().split('T')[0]);
                setProdQty('');
                setProdName('');
                setIsStockModalOpen(true);
              }} className="btn btn-sm btn-accent text-white font-bold whitespace-nowrap shrink-0 hidden sm:inline-flex">
                + Record Production Stock
              </button>
            )}
          </div>

          {/* Add Stock button at bottom (mobile) - visible to Super Admin only */}
          {canEditStockInfo && (
            <div className="block sm:hidden w-full pt-1">
              <button onClick={() => {
                setProdDate(new Date().toISOString().split('T')[0]);
                setProdQty('');
                setProdName('');
                setIsStockModalOpen(true);
              }} className="btn btn-sm btn-block btn-accent text-white font-bold text-sm">
                + Record Production Stock
              </button>
            </div>
          )}
        </div>

        {loadingProductions ? (
          <div className="flex justify-center py-12">
            <span className="loading loading-spinner loading-lg text-primary"></span>
          </div>
        ) : productions.length === 0 ? (
          <div className="empty-state py-12 gap-3 opacity-70">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
            <p className="font-bold text-sm">No production records yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleProductions.map((p, pIdx) => {
              const flatWage = parseFloat(p.paid_amount || selectedProduct.wage_rate || 0)
              return (
                <div key={p.id || pIdx} className="content-card p-4 space-y-3">
                  <div className={`absolute top-0 right-0 left-0 h-1.5 ${p.is_finished ? 'bg-error' : 'bg-success'}`}></div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center border-b border-base-200/60 pb-2.5 gap-2">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase font-bold opacity-50 tracking-wider">Batch No.</span>
                        <span className={`font-mono font-bold text-xl tracking-wide ${p.is_finished ? 'text-error' : 'text-success'}`}>{p.batch_no}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold opacity-50 tracking-wider block">Date</span>
                        <span className="font-bold text-base-content/80 tracking-wide">{p.production_date}</span>
                      </div>
                    </div>
                      <div className="grid grid-cols-2 gap-2 text-sm py-0.5">
                      <div>
                        <span className="text-[11px] block opacity-50 font-bold tracking-tight">Staff In-Charge</span>
                        <span className="font-bold text-base-content/90 text-sm break-all">{p.production_name || '-'}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] block opacity-50 font-bold tracking-tight">Quantity</span>
                        <span className={`font-bold text-xl ${p.is_finished ? 'text-error' : 'text-success'}`}>{p.quantity}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm border-t border-base-200/60 pt-2.5 items-center">
                      <div>
                        <span className="text-[11px] block opacity-50 font-bold tracking-tight">Expiry Date</span>
                        <span className="font-bold text-sm text-base-content/70">{p.expiry_date || '-'}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] block opacity-50 font-bold tracking-tight">Batch Wage</span>
                        <span className="font-mono text-sm font-bold text-base-content/80">
                          RM {p.paid_amount !== null && p.paid_amount !== undefined 
                            ? parseFloat(p.paid_amount).toFixed(2) 
                            : parseFloat(selectedProduct.wage_rate || 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-base-200/40 mt-1 space-y-2">
                    <div className="flex justify-between items-center text-xs font-bold px-1">
                      <span className="opacity-60">Payment Status:</span>
                      <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${p.paid_date ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
                        {p.paid_date ? `Paid (${p.paid_date})` : 'Unpaid'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {/* Finished / Reopen button: only for Admin & Super Admin */}
                      {canToggleStockStatus && (
                        <button
                          type="button"
                          onClick={() => handleToggleStockFinished(p.id, p.is_finished)}
                          disabled={loadingSave}
                          className={`btn btn-sm flex-1 font-bold ${
                            p.is_finished ? 'btn-outline btn-success' : 'btn-outline btn-error'
                          }`}
                        >
                          {p.is_finished ? '🔄 Reopen' : '✅ Finished'}
                        </button>
                      )}
                      
                      {/* Edit Info button (Date/Batch/Quantity): only for Super Admin */}
                      {canEditStockInfo && (
                        <button
                          type="button"
                          onClick={() => handleOpenEditStockModal(p)}
                          className="btn btn-sm btn-ghost font-bold"
                        >
                          📝 Edit Info
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {productions.length > 0 && visibleCount < productions.length && (
          <div className="flex justify-center mt-4 pt-4">
            <button 
              type="button" 
              className="btn btn-outline btn-primary font-bold"
              onClick={() => setVisibleCount(prev => Math.min(prev + prodPageSize, productions.length))}
            >
              Load More
            </button>
          </div>
        )}

        {/* Add Stock Modal - Super Admin restriction */}
        {isStockModalOpen && canEditStockInfo && (
          <div className="modal modal-open">
            <div className="modal-backdrop" onClick={() => setIsStockModalOpen(false)}></div>
            <div className="modal-box--md" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-bold text-xl text-accent mb-4">🏭 Record Production Stock</h3>
              <form onSubmit={handleAddStock} className="space-y-4">
                <div className="form-control">
                  <label className="label-text font-semibold mb-1">Production Date *</label>
                  <input type="date" required className="input input-bordered w-full text-base rounded-xl" value={prodDate} onChange={(e) => setProdDate(e.target.value)} />
                </div>
                <div className="form-control">
                  <label className="label-text font-semibold mb-1">Batch No. (Auto)</label>
                  <input type="text" readOnly className="input input-bordered w-full text-base rounded-xl font-mono bg-base-200 cursor-not-allowed font-black text-primary text-lg" value={prodBatch} />
                </div>
              <div className="form-control">
                <label className="label-text font-semibold mb-1">Select Staff In-Charge *</label>
                {staffList.length > 0 ? (
                  <select required className="select select-bordered w-full text-base rounded-xl font-bold" value={prodName} onChange={(e) => setProdName(e.target.value)}>
                    <option value="">-- Select Staff Name --</option>
                    {staffList.map((staff, sIdx) => (
                      <option key={sIdx} value={staff.full_name}>{staff.full_name}</option>
                    ))}
                  </select>
                ) : (
                  <input type="text" className="input input-bordered w-full text-base rounded-xl" placeholder="Type staff name" value={prodName} onChange={(e) => setProdName(e.target.value)} />
                )}
              </div>
                <div className="form-control">
                  <label className="label-text font-semibold mb-1">Quantity *</label>
                  <input type="number" required min="1" placeholder="0" className="input input-bordered w-full text-base rounded-xl font-bold" value={prodQty} onChange={(e) => setProdQty(e.target.value)} />
                </div>
                <div className="modal-action gap-2 pt-2 border-t border-base-200">
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setIsStockModalOpen(false)}>Cancel</button>
                  <button type="submit" disabled={loadingSave} className="btn btn-sm btn-accent text-white font-bold px-4">{loadingSave ? 'Saving...' : 'Save Record'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Stock Modal - Super Admin restriction */}
        {isEditStockModalOpen && canEditStockInfo && editingStock && (
          <div className="modal modal-open">
            <div className="modal-backdrop" onClick={() => { setIsEditStockModalOpen(false); setEditingStock(null); }}></div>
            <div className="modal-box--md" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-bold text-xl text-secondary mb-4">📝 Edit Stock Information</h3>
              <form onSubmit={handleUpdateStock} className="space-y-4">
                <div className="form-control">
                  <label className="label-text font-semibold mb-1">Production Date *</label>
                  <input type="date" required className="input input-bordered w-full text-base rounded-xl" value={prodDate} onChange={(e) => setProdDate(e.target.value)} />
                </div>
                <div className="form-control">
                  <label className="label-text font-semibold mb-1">Batch No *</label>
                  <input type="text" required className="input input-bordered w-full text-base rounded-xl font-mono font-bold" value={prodBatch} onChange={(e) => setProdBatch(e.target.value)} />
                </div>
                <div className="form-control">
                  <label className="label-text font-semibold mb-1">Staff In-Charge *</label>
                  {staffList.length > 0 ? (
                    <select required className="select select-bordered w-full text-base rounded-xl font-bold" value={prodName} onChange={(e) => setProdName(e.target.value)}>
                      <option value="">-- Select Staff Name --</option>
                      {staffList.map((staff, sIdx) => (
                        <option key={sIdx} value={staff.full_name}>{staff.full_name}</option>
                      ))}
                    </select>
                  ) : (
                    <input type="text" className="input input-bordered w-full text-base rounded-xl" value={prodName} onChange={(e) => setProdName(e.target.value)} />
                  )}
                </div>
                <div className="form-control">
                  <label className="label-text font-semibold mb-1">Quantity *</label>
                  <input type="number" required min="1" className="input input-bordered w-full text-base rounded-xl font-bold" value={prodQty} onChange={(e) => setProdQty(e.target.value)} />
                </div>
                <div className="modal-action gap-2 pt-2 border-t border-base-200">
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setIsEditStockModalOpen(false); setEditingStock(null); }}>Cancel</button>
                  <button type="submit" disabled={loadingSave} className="btn btn-sm btn-secondary text-white font-bold px-4">
                    {loadingSave ? 'Updating...' : 'Save Changes'}
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
    <div className="page-shell relative">
      {toastMessage && (
        <div className="toast-success">
          <div className="alert-toast">
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      <div className="page-header sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="page-title">Inventory Manager</h1>
          <p className="page-subtitle">Monitor product batches and current physical stock levels.</p>
        </div>

        {/* Add Main Product button - only shown to Super Admin */}
        {canEditStockInfo && (
          <button onClick={() => { setIsModalOpen(true); setProductName(''); setExpiryMonth('12'); setWageRate('0.00'); }} className="btn btn-primary font-bold gap-2 self-start sm:self-auto">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add New Product
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((prod, index) => {
          const activeCount = (prod.stock_productions || []).filter(p => !p.is_finished).length
          return (
            <div key={prod.id || index} className="content-card p-5 flex flex-col justify-between h-full">
              <div className="flex flex-col gap-3">
                <button onClick={() => setSelectedProduct(prod)} className="font-bold text-base text-left link link-hover transition-all leading-tight break-words">
                  {prod.product_name}
                </button>
                <div className="flex gap-1.5 items-center flex-wrap">
                  <div className={activeCount > 0 ? 'status-badge-active' : 'status-badge-inactive'}>
                    {activeCount > 0 ? `${activeCount} Active Stock Batch` : 'No Active Stock'}
                  </div>
                  <div className="w-fit text-[10px] font-bold px-2 py-0.5 rounded-lg bg-base-200/50 text-base-content/70">
                    Wage: RM {parseFloat(prod.wage_rate || 0).toFixed(2)}
                  </div>
                </div>
              </div>
              <div className="fifo-info-box mt-3">
                <span className="text-[10px] uppercase font-bold opacity-50 tracking-wider block">Oldest Active Stock (FIFO)</span>
                {prod.fifo_stock ? (
                  <div className="flex justify-between items-center gap-2">
                    <div className="flex flex-col">
                      <span className="text-[9px] uppercase font-bold opacity-40">Batch No.</span>
                      <span className="font-mono font-bold text-sm tracking-wide">{prod.fifo_stock.batch_no}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] uppercase font-bold opacity-40 block">Expiry Date</span>
                      <span className="font-bold text-xs tracking-wide">{prod.fifo_stock.expiry_date}</span>
                    </div>
                  </div>
                ) : (
                  <span className="text-xs opacity-40 font-sans block py-1">No Active Stock Available</span>
                )}
              </div>
              <div className="pt-3 flex gap-2">
                <button onClick={() => setSelectedProduct(prod)} className="btn btn-sm flex-1 btn-outline font-bold">
                  Stock & Cooking Record ↗
                </button>
                {/* Edit Product button - only for Super Admin */}
                {canEditStockInfo && (
                  <button 
                    type="button"
                    onClick={() => handleOpenEditProductModal(prod)}
                    className="btn btn-sm btn-ghost font-bold"
                  >
                    📝 Edit Info
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Add Main Product Modal - Super Admin restriction */}
      {isModalOpen && canEditStockInfo && (
        <div className="modal modal-open">
          <div className="modal-backdrop" onClick={() => { setIsModalOpen(false); setProductName(''); setExpiryMonth('12'); setWageRate('0.00'); }}></div>
          <div className="modal-box--md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-xl text-primary flex items-center gap-2 mb-4">📦 Add New Product</h3>
            <form onSubmit={handleAddProduct} className="space-y-4">
              <div className="form-control">
                <label className="label-text font-semibold mb-1">Product Name *</label>
                <input type="text" required placeholder="e.g., Pes Kari Sambal" className="input input-bordered w-full text-base rounded-xl" value={productName} onChange={(e) => setProductName(e.target.value)} />
              </div>
              <div className="form-control">
                <label className="label-text font-semibold mb-1">Shelf Life (Months)</label>
                <input type="number" required min="1" placeholder="12" className="input input-bordered w-full text-base rounded-xl" value={expiryMonth} onChange={(e) => setExpiryMonth(e.target.value)} />
              </div>
              <div className="form-control">
                <label className="label-text font-semibold mb-1">Cooking Wage Rate per Unit (RM) *</label>
                <input type="number" step="0.01" required min="0" placeholder="0.50" className="input input-bordered w-full text-base rounded-xl font-bold" value={wageRate} onChange={(e) => setWageRate(e.target.value)} />
              </div>
              <div className="modal-action gap-2 pt-2">
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setIsModalOpen(false); setProductName(''); setExpiryMonth('12'); setWageRate('0.00'); }}>Cancel</button>
                <button type="submit" disabled={loadingSave} className="btn btn-sm btn-primary text-white font-bold px-4">{loadingSave ? 'Saving...' : 'Save Product'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Product Modal - Super Admin restriction */}
      {isEditProductModalOpen && canEditStockInfo && editingProduct && (
        <div className="modal modal-open">
          <div className="modal-backdrop" onClick={() => { setIsEditProductModalOpen(false); setEditingProduct(null); }}></div>
          <div className="modal-box--md" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-bold text-xl text-warning mb-4">📝 Edit Product</h3>
              <form onSubmit={handleUpdateProduct} className="space-y-4">
                <div className="form-control">
                  <label className="label-text font-semibold mb-1">Product Information</label>
                  <input type="text" readOnly className="input input-bordered w-full text-base rounded-xl font-bold bg-base-200 cursor-not-allowed" value={editingProduct.product_name} />
                </div>
                <div className="form-control">
                  <label className="label-text font-semibold mb-1">Shelf Life (Months) *</label>
                  <input type="number" required min="1" className="input input-bordered w-full text-base rounded-xl font-bold" value={editExpiryMonth} onChange={(e) => setEditExpiryMonth(e.target.value)} />
                </div>
                <div className="form-control">
                  <label className="label-text font-semibold mb-1">Cooking Wage Rate per Unit (RM) *</label>
                  <input type="number" step="0.01" required min="0" className="input input-bordered w-full text-base rounded-xl font-bold" value={editWageRate} onChange={(e) => setEditWageRate(e.target.value)} />
                </div>
                <div className="modal-action gap-2 pt-2 border-t border-base-200">
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setIsEditProductModalOpen(false); setEditingProduct(null); }}>Cancel</button>
                  <button type="submit" disabled={loadingSave} className="btn btn-sm btn-warning text-white font-bold px-4">
                    {loadingSave ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}