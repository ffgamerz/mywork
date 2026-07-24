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
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' })

  const [productions, setProductions] = useState([])
  const [staffList, setStaffList] = useState([])
  const [isStockModalOpen, setIsStockModalOpen] = useState(false)
  const [isEditStockModalOpen, setIsEditStockModalOpen] = useState(false)
  const [editingStock, setEditingStock] = useState(null)
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

  const cleanedRole = String(userRole || '').trim().toLowerCase()
  const isSuperAdmin = cleanedRole === 'super_admin'
  const isAdmin = cleanedRole === 'admin'
  const hasPageAccess = isSuperAdmin || allowedModules['inventory'] === true || isAdmin
  const canEditStockInfo = isSuperAdmin
  const canToggleStockStatus = isSuperAdmin || isAdmin

  const showToast = (message, severity = 'success') => { setToast({ open: true, message, severity }); setTimeout(() => setToast({ ...toast, open: false }), 3000) }

  const fetchProducts = async () => {
    if (!hasPageAccess) return
    setLoadingProducts(true)
    const { data, error } = await supabase.from('inventory').select(`*, stock_productions(id, batch_no, production_date, expiry_date, is_finished, paid_amount, paid_date, created_at)`).order('created_at', { ascending: true })
    if (error) console.error(error.message)
    else setProducts((data || []).map(prod => {
      const activeStocks = (prod.stock_productions || []).filter(stock => stock.is_finished === false).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      return { ...prod, fifo_stock: activeStocks[0] || null }
    }))
    setLoadingProducts(false)
  }

  const fetchProductions = async (productId) => {
    setLoadingProductions(true)
    const { data, error } = await supabase.from('stock_productions').select('*').eq('inventory_id', productId).order('production_date', { ascending: false })
    if (error) console.error(error.message); else setProductions(data || [])
    setLoadingProductions(false)
  }

  const fetchStaffList = async () => {
    const { data, error } = await supabase.from('profiles').select('full_name').order('full_name', { ascending: true })
    if (error) console.error('Error fetching staff names:', error.message); else setStaffList((data || []).filter(s => s.full_name))
  }

  useEffect(() => { if (hasPageAccess) { fetchProducts(); fetchStaffList() } }, [hasPageAccess])
  useEffect(() => { if (selectedProduct && hasPageAccess) { fetchProductions(selectedProduct.id); setVisibleCount(6) } }, [selectedProduct])
  useEffect(() => {
    if (!isStockModalOpen) return
    if (productions.length === 0) setProdBatch('BATCH-001')
    else {
      const latestProd = productions[0]; const match = (latestProd?.batch_no || 'BATCH-000').match(/\d+$/)
      if (match) setProdBatch(`BATCH-${String(parseInt(match[0], 10) + 1).padStart(match[0].length, '0')}`)
      else setProdBatch(`BATCH-${productions.length + 1}`)
    }
  }, [isStockModalOpen, productions])

  if (!hasPageAccess) return <div className="alert-unauthorized">🔒 Access Denied: Unauthorized.</div>

  const handleToggleStockFinished = async (productionId, currentStatus) => {
    if (!canToggleStockStatus) { showToast('Access denied.', 'error'); return }
    setLoadingSave(true)
    const { error } = await supabase.from('stock_productions').update({ is_finished: !currentStatus, updated_at: new Date().toISOString() }).eq('id', productionId)
    if (error) showToast('Failed: ' + error.message, 'error'); else { showToast('Batch status updated!'); if (selectedProduct) fetchProductions(selectedProduct.id) }
    setLoadingSave(false)
  }

  const handleAddProduct = async (e) => {
    e.preventDefault()
    if (!productName.trim() || !canEditStockInfo) return
    setLoadingSave(true)
    const { error } = await supabase.from('inventory').insert([{ user_id: session.user.id, product_name: productName.trim(), expiry_month: parseInt(expiryMonth) || 12, wage_rate: parseFloat(wageRate) || 0.00, current_stock: 0 }])
    if (error) showToast('Failed: ' + error.message, 'error'); else { setProductName(''); setExpiryMonth('12'); setWageRate('0.00'); setIsModalOpen(false); showToast('Product added!'); fetchProducts() }
    setLoadingSave(false)
  }

  const handleAddStock = async (e) => {
    e.preventDefault()
    if (!canEditStockInfo || !selectedProduct) return
    setLoadingSave(true)
    const productionDateObj = new Date(prodDate); productionDateObj.setMonth(productionDateObj.getMonth() + (selectedProduct.expiry_month || 12))
    const { error } = await supabase.from('stock_productions').insert([{ inventory_id: selectedProduct.id, user_id: session.user.id, production_date: prodDate, quantity: parseInt(prodQty) || 0, production_name: prodName || null, batch_no: prodBatch, expiry_date: productionDateObj.toISOString().split('T')[0], is_finished: false }])
    if (error) showToast('Failed: ' + error.message, 'error'); else { setProdQty(''); setProdName(''); setIsStockModalOpen(false); showToast('Production saved!'); fetchProducts(); if (selectedProduct) fetchProductions(selectedProduct.id) }
    setLoadingSave(false)
  }

  const handleOpenEditStockModal = (stock) => {
    if (!canEditStockInfo) { showToast('Access denied.', 'error'); return }
    setEditingStock(stock); setProdDate(stock.production_date); setProdBatch(stock.batch_no); setProdQty(stock.quantity.toString()); setProdName(stock.production_name || ''); setIsEditStockModalOpen(true)
  }

  const handleUpdateStock = async (e) => {
    e.preventDefault()
    if (!canEditStockInfo || !editingStock || !selectedProduct) return
    setLoadingSave(true)
    const d = new Date(prodDate); d.setMonth(d.getMonth() + (selectedProduct.expiry_month || 12))
    const { error } = await supabase.from('stock_productions').update({ production_date: prodDate, batch_no: prodBatch.trim(), quantity: parseInt(prodQty) || 0, production_name: prodName || null, expiry_date: d.toISOString().split('T')[0], updated_at: new Date().toISOString() }).eq('id', editingStock.id)
    if (error) showToast('Failed: ' + error.message, 'error'); else { setIsEditStockModalOpen(false); setEditingStock(null); showToast('Stock updated!'); fetchProducts(); if (selectedProduct) fetchProductions(selectedProduct.id) }
    setLoadingSave(false)
  }

  const handleOpenEditProductModal = (product) => {
    if (!canEditStockInfo) { showToast('Access denied.', 'error'); return }
    setEditingProduct(product); setEditWageRate(product.wage_rate ? String(product.wage_rate) : '0.00'); setEditExpiryMonth(product.expiry_month ? String(product.expiry_month) : '12'); setIsEditProductModalOpen(true)
  }

  const handleUpdateProduct = async (e) => {
    e.preventDefault()
    if (!canEditStockInfo || !editingProduct) return
    setLoadingSave(true)
    const { error } = await supabase.from('inventory').update({ expiry_month: parseInt(editExpiryMonth) || 12, wage_rate: parseFloat(editWageRate) || 0.00, updated_at: new Date().toISOString() }).eq('id', editingProduct.id)
    if (error) showToast('Failed: ' + error.message, 'error'); else { setIsEditProductModalOpen(false); setEditingProduct(null); showToast('Product updated!'); fetchProducts() }
    setLoadingSave(false)
  }

  const activeBatchCount = productions.filter(p => !p.is_finished).length
  const visibleProductions = productions.slice(0, visibleCount)

  // ─── PRODUCT DETAIL VIEW ───
  if (selectedProduct) {
    return (
      <div className="max-w-1200 mx-auto">
        {toast.open && <div className="toast-container-custom"><div className={`d-flex align-items-center gap-2 px-3 py-2 rounded-pill shadow-lg fw-600 text-14 text-white ${toast.severity === 'error' ? 'bg-error' : 'bg-success'}`}><span>{toast.message}</span></div></div>}

        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 pb-2 mb-3 border-bottom border-default">
          <div className="d-flex align-items-center gap-3">
            <button onClick={() => { setSelectedProduct(null); fetchProducts() }} className="btn btn-sm btn-link d-flex align-items-center justify-content-center w-32 h-32 text-secondary-custom">
              <svg className="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
            <div>
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <h5 className="fw-bold text-white mb-0">{selectedProduct.product_name}</h5>
                <span className="chip-custom">{selectedProduct.expiry_month || 12}M</span>
                <span className="chip-custom bg-accent-15 text-accent">RM {parseFloat(selectedProduct.wage_rate || 0).toFixed(2)}</span>
              </div>
              <div className="mt-1 chip-custom bg-warning-15 text-warning">Active: {activeBatchCount} Batch{activeBatchCount !== 1 ? 'es' : ''}</div>
            </div>
          </div>
          {canEditStockInfo && (
            <button className="btn btn-sm btn-success fw-semibold" onClick={() => { setProdDate(new Date().toISOString().split('T')[0]); setProdQty(''); setProdName(''); setIsStockModalOpen(true) }}>
              + Record Production
            </button>
          )}
        </div>

        {loadingProductions ? (
          <div className="text-center py-5"><span className="spinner-border"></span></div>
        ) : productions.length === 0 ? (
          <div className="text-center py-5 text-muted fw-semibold">No production records yet.</div>
        ) : (
          <div className="row g-3">
            {visibleProductions.map((p, pIdx) => {
              const flatWage = parseFloat(p.paid_amount || selectedProduct.wage_rate || 0)
              return (
                <div className="col-12 col-sm-4" key={p.id || pIdx}>
                  <div className="card overflow-hidden h-100 d-flex flex-column">
                    <div className={`w-100 ${p.is_finished ? 'bg-bar-finished' : 'bg-bar-active'}`}></div>
                    <div className="p-3 d-flex flex-column flex-grow-1">
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <div>
                          <div className="text-muted text-uppercase fw-bold text-10 tracking-wider">Batch</div>
                          <h6 className="font-mono fw-bold mb-0">{p.batch_no}</h6>
                        </div>
                        <span className={`badge ${p.paid_date ? 'bg-success' : 'bg-danger'}`}>{p.paid_date ? 'Paid' : 'Unpaid'}</span>
                      </div>
                      <div className="d-flex justify-content-between mb-2">
                        <div><div className="text-muted fw-bold text-10">Date</div><div className="fw-semibold text-white text-14">{p.production_date}</div></div>
                        <div className="text-end"><div className="text-muted fw-bold text-10">Qty</div><h5 className="fw-bold mb-0">{p.quantity}</h5></div>
                      </div>
                      <div className="d-flex justify-content-between mb-2">
                        <div><div className="text-muted fw-bold text-10">Staff</div><div className="fw-semibold text-white text-14">{p.production_name || '-'}</div></div>
                        <div className="text-end"><div className="text-muted fw-bold text-10">Expiry</div><div className="text-muted text-14">{p.expiry_date || '-'}</div></div>
                      </div>
                      <div className="d-flex justify-content-between pt-2 mt-auto border-top border-default">
                        <div><div className="text-muted fw-bold text-10">Wage</div><div className="font-mono fw-bold text-white">RM {flatWage.toFixed(2)}</div></div>
                        {p.paid_date && <div className="text-end"><div className="text-muted fw-bold text-10">Paid Date</div><div className="font-mono fw-bold text-white text-14">{p.paid_date}</div></div>}
                      </div>
                      <div className="d-flex gap-2 mt-2 pt-2 border-top border-default">
                        {canToggleStockStatus && (
                          <button className={`btn btn-sm flex-grow-1 fw-semibold ${p.is_finished ? 'btn-danger' : 'btn-success'}`} onClick={() => handleToggleStockFinished(p.id, p.is_finished)} disabled={loadingSave}>
                            {p.is_finished ? '🔄 Reopen' : '✅ Finish'}
                          </button>
                        )}
                        {canEditStockInfo && (
                          <button className="btn btn-sm btn-link text-secondary-custom" onClick={() => handleOpenEditStockModal(p)}>📝 Edit</button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {productions.length > 0 && visibleCount < productions.length && (
          <div className="text-center mt-3"><button className="btn btn-sm btn-outline-light fw-semibold" onClick={() => setVisibleCount(prev => Math.min(prev + prodPageSize, productions.length))}>Load More</button></div>
        )}

        {isStockModalOpen && canEditStockInfo && (
          <>
            <div className="modal-backdrop show" onClick={() => setIsStockModalOpen(false)}></div>
            <div className="modal d-block" tabIndex="-1">
              <div className="modal-dialog modal-dialog-centered max-w-448">
                <div className="modal-content p-3">
                  <h5 className="fw-bold mb-3 text-success">🏭 Record Production Stock</h5>
                  <form onSubmit={handleAddStock}>
                    <div className="mb-3"><label className="form-label">Production Date</label><input type="date" className="form-control" required value={prodDate} onChange={(e) => setProdDate(e.target.value)} /></div>
                    <div className="mb-3"><label className="form-label">Batch No.</label><input type="text" className="form-control font-mono fw-bold text-accent text-18" value={prodBatch} readOnly /></div>
                    <div className="mb-3"><label className="form-label">Staff In-Charge</label>
                      {staffList.length > 0 ? (
                        <select className="form-select" value={prodName} onChange={(e) => setProdName(e.target.value)} required><option value="">-- Select Staff Name --</option>{staffList.map((staff, sIdx) => <option key={sIdx} value={staff.full_name}>{staff.full_name}</option>)}</select>
                      ) : (
                        <input type="text" className="form-control" value={prodName} onChange={(e) => setProdName(e.target.value)} placeholder="Type staff name" />
                      )}
                    </div>
                    <div className="mb-3"><label className="form-label">Quantity</label><input type="number" className="form-control" required value={prodQty} onChange={(e) => setProdQty(e.target.value)} /></div>
                    <div className="d-flex gap-2 justify-content-end pt-2 border-top border-default">
                      <button type="button" className="btn btn-sm btn-success" onClick={() => setIsStockModalOpen(false)}>Cancel</button>
                      <button type="submit" className="btn btn-sm fw-semibold text-white bg-success" disabled={loadingSave}>{loadingSave ? <span className="spinner-border spinner-border-sm"></span> : 'Save Record'}</button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </>
        )}

        {isEditStockModalOpen && canEditStockInfo && editingStock && (
          <>
            <div className="modal-backdrop show" onClick={() => { setIsEditStockModalOpen(false); setEditingStock(null) }}></div>
            <div className="modal d-block" tabIndex="-1">
              <div className="modal-dialog modal-dialog-centered max-w-448">
                <div className="modal-content p-3">
                  <h5 className="fw-bold mb-3 text-secondary-custom">📝 Edit Stock Information</h5>
                  <form onSubmit={handleUpdateStock}>
                    <div className="mb-3"><label className="form-label">Production Date</label><input type="date" className="form-control" required value={prodDate} onChange={(e) => setProdDate(e.target.value)} /></div>
                    <div className="mb-3"><label className="form-label">Batch No.</label><input type="text" className="form-control font-mono fw-bold" required value={prodBatch} onChange={(e) => setProdBatch(e.target.value)} /></div>
                    <div className="mb-3"><label className="form-label">Staff In-Charge</label>
                      {staffList.length > 0 ? (
                        <select className="form-select" value={prodName} onChange={(e) => setProdName(e.target.value)} required><option value="">-- Select Staff Name --</option>{staffList.map((staff, sIdx) => <option key={sIdx} value={staff.full_name}>{staff.full_name}</option>)}</select>
                      ) : (
                        <input type="text" className="form-control" value={prodName} onChange={(e) => setProdName(e.target.value)} />
                      )}
                    </div>
                    <div className="mb-3"><label className="form-label">Quantity</label><input type="number" className="form-control" required value={prodQty} onChange={(e) => setProdQty(e.target.value)} /></div>
                    <div className="d-flex gap-2 justify-content-end pt-2 border-top border-default">
                      <button type="button" className="btn btn-sm" onClick={() => { setIsEditStockModalOpen(false); setEditingStock(null) }}>Cancel</button>
                      <button type="submit" className="btn btn-sm btn-outline-light fw-semibold" disabled={loadingSave}>{loadingSave ? <span className="spinner-border spinner-border-sm"></span> : 'Save Changes'}</button>
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

  // ─── PRODUCT LIST VIEW ───
  return (
    <div className="max-w-1200 mx-auto">
      {toast.open && <div className="toast-container-custom"><div className={`d-flex align-items-center gap-2 px-3 py-2 rounded-pill shadow-lg fw-600 text-14 text-white ${toast.severity === 'error' ? 'bg-error' : 'bg-success'}`}><span>{toast.message}</span></div></div>}

      <div className="page-header-custom d-flex flex-wrap justify-content-between align-items-start gap-2">
        <div>
          <h1 className="page-title-custom">Inventory Manager</h1>
          <p className="page-subtitle-custom">Monitor product batches and current physical stock levels.</p>
        </div>
        {canEditStockInfo && (
          <button className="btn btn-sm btn-success fw-semibold" onClick={() => { setIsModalOpen(true); setProductName(''); setExpiryMonth('12'); setWageRate('0.00') }}>
            + Add New Product
          </button>
        )}
      </div>

      {loadingProducts ? (
        <div className="text-center py-5"><span className="spinner-border"></span></div>
      ) : (
        <div className="row g-3">
          {products.map((prod, index) => {
            const activeCount = (prod.stock_productions || []).filter(p => !p.is_finished).length
            return (
              <div className="col-md-4" key={prod.id || index}>
                <div className="card p-3 h-100 d-flex flex-column">
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <span className={`status-dot ${activeCount > 0 ? 'status-dot-success' : 'status-dot-error'}`}></span>
                    <h6 className="fw-bold text-white mb-0 cursor-pointer text-15 text-16 lh-12" onClick={() => setSelectedProduct(prod)}>
                      {prod.product_name}
                    </h6>
                  </div>
                  <div className="d-flex flex-column gap-1 mb-2 flex-grow-1">
                    <div className="d-flex justify-content-between"><span className="text-muted text-11">Active Stock</span><span className="fw-bold text-11">{activeCount > 0 ? `${activeCount} Batch` : 'None'}</span></div>
                    <div className="d-flex justify-content-between"><span className="text-muted text-11">Wage Rate</span><span className="fw-bold font-mono text-white text-11">RM {parseFloat(prod.wage_rate || 0).toFixed(2)}</span></div>
                    <div className="d-flex justify-content-between"><span className="text-muted text-11">Shelf Life</span><span className="fw-bold text-white text-11">{prod.expiry_month || 12} months</span></div>
                  </div>
                  <div className="fifo-box mb-2">
                    <div className="text-muted fw-bold text-uppercase text-9 tracking-wider">Oldest Stock</div>
                    {prod.fifo_stock ? (
                      <div className="d-flex justify-content-between align-items-center">
                        <span className="font-mono fw-bold text-white text-11">{prod.fifo_stock.batch_no}</span>
                        <span className="fw-semibold text-muted text-10">{prod.fifo_stock.expiry_date}</span>
                      </div>
                    ) : <span className="text-muted text-10">—</span>}
                  </div>
                  <div className="d-flex gap-2">
                    <button className="btn btn-sm flex-grow-1 fw-semibold btn-primary" onClick={() => setSelectedProduct(prod)}>View Stock</button>
                    {canEditStockInfo && (
                      <button className="btn btn-sm btn-link d-flex align-items-center justify-content-center text-secondary-custom border-default w-32 h-32" onClick={() => handleOpenEditProductModal(prod)}>
                        <svg className="icon-svg-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {isModalOpen && canEditStockInfo && (
        <>
          <div className="modal-backdrop show" onClick={() => { setIsModalOpen(false); setProductName(''); setExpiryMonth('12'); setWageRate('0.00') }}></div>
          <div className="modal d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered max-w-448">
              <div className="modal-content p-3">
                <h5 className="fw-bold text-accent mb-3">📦 Add New Product</h5>
                <form onSubmit={handleAddProduct}>
                  <div className="mb-3"><label className="form-label">Product Name</label><input type="text" className="form-control" required placeholder="e.g., Pes Kari Sambal" value={productName} onChange={(e) => setProductName(e.target.value)} /></div>
                  <div className="mb-3"><label className="form-label">Shelf Life (Months)</label><input type="number" className="form-control" required value={expiryMonth} onChange={(e) => setExpiryMonth(e.target.value)} /></div>
                  <div className="mb-3"><label className="form-label">Cooking Wage Rate per Unit (RM)</label><input type="number" step="0.01" className="form-control" required value={wageRate} onChange={(e) => setWageRate(e.target.value)} /></div>
                  <div className="d-flex gap-2 justify-content-end pt-2 border-top border-default">
                    <button type="button" className="btn btn-sm btn-link" onClick={() => { setIsModalOpen(false); setProductName(''); setExpiryMonth('12'); setWageRate('0.00') }}>Cancel</button>
                    <button type="submit" className="btn btn-sm btn-primary fw-semibold" disabled={loadingSave}>{loadingSave ? <span className="spinner-border spinner-border-sm"></span> : 'Save Product'}</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </>
      )}

      {isEditProductModalOpen && canEditStockInfo && editingProduct && (
        <>
          <div className="modal-backdrop show" onClick={() => { setIsEditProductModalOpen(false); setEditingProduct(null) }}></div>
          <div className="modal d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered max-w-448">
              <div className="modal-content p-3">
                <h5 className="fw-bold mb-3">Edit Product</h5>
                <form onSubmit={handleUpdateProduct}>
                  <div className="mb-3"><label className="form-label">Product Name</label><input type="text" className="form-control bg-dark-card" value={editingProduct?.product_name || ''} readOnly /></div>
                  <div className="mb-3"><label className="form-label">Shelf Life (Months)</label><input type="number" className="form-control" required value={editExpiryMonth} onChange={(e) => setEditExpiryMonth(e.target.value)} /></div>
                  <div className="mb-3"><label className="form-label">Cooking Wage Rate per Unit (RM)</label><input type="number" step="0.01" className="form-control" required value={editWageRate} onChange={(e) => setEditWageRate(e.target.value)} /></div>
                  <div className="d-flex gap-2 justify-content-end pt-2 border-top border-default">
                    <button type="button" className="btn btn-sm btn-warning" onClick={() => { setIsEditProductModalOpen(false); setEditingProduct(null) }}>Cancel</button>
                    <button type="submit" className="btn btn-sm btn-success fw-semibold" disabled={loadingSave}>{loadingSave ? <span className="spinner-border spinner-border-sm"></span> : 'Save Changes'}</button>
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