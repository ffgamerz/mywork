import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from './supabaseClient'

function calcIngredientCost(material, qtyUsed, priceOverride = null) {
  if (!material) return 0
  const price = priceOverride != null ? (parseFloat(priceOverride) || 0) : (parseFloat(material.price) || 0)
  const used = parseFloat(qtyUsed) || 0
  if (material.calculation_mode === 'fraction') {
    const totalGrams = parseFloat(material.fraction_grams) || 1
    return (used / totalGrams) * price
  }
  return used * price
}

function stripTrailing(n) {
  return parseFloat(parseFloat(n).toFixed(4)).toString()
}

function formatPurchaseQty(item) {
  const val = parseFloat(item.qty) || 0
  if (item.rawQty != null && item.rawUnit) return { qty: stripTrailing(val), unit: item.unit, isRoundedUp: true, note: `Rounded up from ${stripTrailing(item.rawQty)} ${item.rawUnit}` }
  if (item.unit === 'g' && val >= 1000) return { qty: stripTrailing(val / 1000), unit: 'kg', isRoundedUp: false }
  if (item.unit === 'ml' && val >= 1000) return { qty: stripTrailing(val / 1000), unit: 'L', isRoundedUp: false }
  return { qty: stripTrailing(val), unit: item.unit, isRoundedUp: false }
}

function SearchableSelect({ items, value, onChange, placeholder, disabled }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)
  const inputRef = useRef(null)
  const selected = items.find(i => i.id === value)
  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => { if (open && inputRef.current) inputRef.current.focus() }, [open])

  return (
    <div className="position-relative" ref={ref}>
      <div className={`form-select d-flex align-items-center justify-content-between cursor-pointer ${disabled ? 'bg-secondary opacity-50' : ''}`}
        onClick={() => { if (!disabled) setOpen(!open) }}
      >
        <span className={`fw-bold small ${selected ? '' : 'text-muted'}`}>{selected ? selected.name : placeholder || 'Select item...'}</span>
        <svg className={`transition-all ${open ? 'rotate-180' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
      </div>
      {open && (
        <div className="position-absolute w-100 mt-1 rounded-3 shadow-lg">
          <div className="p-2 border-bottom">
            <input ref={inputRef} type="text" className="form-control form-control-sm" placeholder="Type to search..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="overflow-auto">
            {filtered.length === 0 ? (<div className="p-3 small text-center text-muted">No results</div>) : (
              filtered.map(item => (
                <div key={item.id} className={`px-3 py-2 small cursor-pointer transition-all ${item.id === value ? 'bg-primary bg-opacity-25 text-primary' : ''}`}
                  onClick={() => { onChange(item.id); setOpen(false); setSearch('') }}>{item.name}</div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ProductionPlanning({ session, userRole, allowedModules = {} }) {
  const [toastMsg, setToastMsg] = useState('')
  const showMsg = (msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3000) }
  const [activeTab, setActiveTab] = useState('purchase')
  const [loading, setLoading] = useState(false)

  const cleanedRole = String(userRole || '').trim().toLowerCase()
  const isSuperAdmin = cleanedRole === 'super_admin'
  const isAdmin = cleanedRole === 'admin'
  const hasAccess = isSuperAdmin || isAdmin || allowedModules['productionPlanning'] === true

  const [materials, setMaterials] = useState([])
  const [materialSearch, setMaterialSearch] = useState('')
  const [matModal, setMatModal] = useState(false)
  const [editingMat, setEditingMat] = useState(null)
  const [matName, setMatName] = useState('')
  const [matUnit, setMatUnit] = useState('packet')
  const [matPrice, setMatPrice] = useState('')
  const [matMode, setMatMode] = useState('unit')
  const [matFractionG, setMatFractionG] = useState('')
  const [matFractionUnit, setMatFractionUnit] = useState('g')

  const filteredMaterials = useMemo(() => {
    if (!materialSearch.trim()) return materials
    const term = materialSearch.trim().toLowerCase()
    return materials.filter(m =>
      m.name?.toLowerCase().includes(term) ||
      m.unit?.toLowerCase().includes(term)
    )
  }, [materials, materialSearch])

  const [products, setProducts] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [recipeIngredients, setRecipeIngredients] = useState([])
  const [currentRecipeId, setCurrentRecipeId] = useState(null)
  const [ingMatId, setIngMatId] = useState('')
  const [ingQty, setIngQty] = useState('')
  const [ingUnit, setIngUnit] = useState('')

  const [purchaseProducts, setPurchaseProducts] = useState([])
  const [purchaseSummary, setPurchaseSummary] = useState(null)
  const [purchaseRecords, setPurchaseRecords] = useState([])
  const [selectedPurchase, setSelectedPurchase] = useState(null)
  const [purchaseNotes, setPurchaseNotes] = useState('')
  const [manualQty, setManualQty] = useState({})
  const [editRecordQtys, setEditRecordQtys] = useState({})
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [editingRecordId, setEditingRecordId] = useState(null)

  const updateManualQty = (materialId, value) => setManualQty(prev => ({ ...prev, [materialId]: value }))

  const getDisplayQty = (item) => {
    if (manualQty[item.material_id] !== undefined && manualQty[item.material_id] !== '') {
      const val = parseFloat(manualQty[item.material_id])
      return isNaN(val) ? item.qty : val
    }
    return item.qty
  }

  const getItemCost = (item) => {
    const currentQty = getDisplayQty(item)
    if (!item.rawMaterial) return parseFloat(item.cost || 0)
    if (item.rawMaterial.calculation_mode === 'fraction') {
      const perUnit = parseFloat(item.rawMaterial.fraction_grams) || 1
      return calcIngredientCost(item.rawMaterial, currentQty * perUnit)
    }
    return calcIngredientCost(item.rawMaterial, currentQty)
  }

  const fetchMaterials = async () => {
    const { data, error } = await supabase.from('raw_materials').select('*').order('name')
    if (!error && data) setMaterials(data)
  }

  const fetchProductsList = async () => {
    const { data, error } = await supabase.from('inventory').select('id, product_name').order('product_name')
    if (!error && data) setProducts(data)
  }

  const fetchRecipeIngredients = async (recipeId) => {
    if (!recipeId) { setRecipeIngredients([]); return }
    const { data, error } = await supabase.from('recipe_ingredients').select('*, raw_material:raw_material_id(*)').eq('recipe_id', recipeId)
    if (!error && data) setRecipeIngredients(data)
  }

  const fetchPurchaseRecords = async () => {
    const { data, error } = await supabase.from('purchase_plans').select('*, purchase_plan_items(*, raw_material:raw_material_id(name, price, calculation_mode, fraction_unit)), purchase_plan_batches(*, inventory:inventory_id(product_name))').order('created_at', { ascending: false })
    if (!error && data) setPurchaseRecords(data)
  }

  useEffect(() => {
    if (!hasAccess) return
    const loadData = async () => { await Promise.all([fetchMaterials(), fetchProductsList(), fetchPurchaseRecords()]) }
    loadData()
  }, [hasAccess])

  const openMatModal = (mat = null) => {
    if (mat) { setEditingMat(mat); setMatName(mat.name); setMatUnit(mat.unit); setMatPrice(String(mat.price)); setMatMode(mat.calculation_mode); setMatFractionG(mat.fraction_grams ? String(mat.fraction_grams) : ''); setMatFractionUnit(mat.fraction_unit || 'g') }
    else { setEditingMat(null); setMatName(''); setMatUnit('packet'); setMatPrice(''); setMatMode('unit'); setMatFractionG(''); setMatFractionUnit('g') }
    setMatModal(true)
  }

  const handleSaveMat = async (e) => {
    e.preventDefault()
    if (!matName.trim() || !matPrice) return
    setLoading(true)
    const payload = { user_id: session.user.id, name: matName.trim(), unit: matUnit, price: parseFloat(matPrice) || 0, calculation_mode: matMode, fraction_grams: matMode === 'fraction' ? (parseFloat(matFractionG) || null) : null, fraction_unit: matMode === 'fraction' ? matFractionUnit : null }
    const response = editingMat ? await supabase.from('raw_materials').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingMat.id) : await supabase.from('raw_materials').insert([payload])
    if (response.error) showMsg('Error: ' + response.error.message)
    else { showMsg(editingMat ? 'Material updated!' : 'Material added!'); setMatModal(false); fetchMaterials() }
    setLoading(false)
  }

  const handleDeleteMat = async (id) => {
    if (!confirm('Delete this material? This will affect recipes using it.')) return
    const { error } = await supabase.from('raw_materials').delete().eq('id', id)
    if (error) showMsg('Error: ' + error.message)
    else { showMsg('Material deleted!'); fetchMaterials() }
  }

  const handleProductSelect = async (prodId) => {
    if (!prodId) { setSelectedProduct(null); setCurrentRecipeId(null); setRecipeIngredients([]); return }
    const prod = products.find(p => p.id === prodId)
    setSelectedProduct(prod)
    const { data: existing } = await supabase.from('product_recipes').select('*').eq('inventory_id', prodId).maybeSingle()
    if (existing) { setCurrentRecipeId(existing.id); fetchRecipeIngredients(existing.id) }
    else {
      const { data: newRecipe } = await supabase.from('product_recipes').insert([{ inventory_id: prodId, recipe_name: prod.product_name + ' Recipe' }]).select().single()
      if (newRecipe) { setCurrentRecipeId(newRecipe.id); setRecipeIngredients([]) }
    }
  }

  const handleAddIngredient = async (e) => {
    e.preventDefault()
    if (!ingMatId || !ingQty || !currentRecipeId) return
    const { error } = await supabase.from('recipe_ingredients').insert([{ recipe_id: currentRecipeId, raw_material_id: ingMatId, quantity_used: parseFloat(ingQty), unit_used: ingUnit }])
    if (error) showMsg('Error: ' + error.message)
    else { showMsg('Ingredient added!'); setIngMatId(''); setIngQty(''); setIngUnit(''); fetchRecipeIngredients(currentRecipeId) }
  }

  const handleRemoveIngredient = async (id) => {
    const { error } = await supabase.from('recipe_ingredients').delete().eq('id', id)
    if (!error) fetchRecipeIngredients(currentRecipeId)
  }

  const totalCostPerBatch = useMemo(() => recipeIngredients.reduce((sum, ing) => sum + calcIngredientCost(ing.raw_material, ing.quantity_used), 0), [recipeIngredients])

  const handleTogglePurchaseProduct = (prodId) => {
    setPurchaseProducts(prev => {
      const exists = prev.find(p => p.inventory_id === prodId)
      if (exists) return prev.filter(p => p.inventory_id !== prodId)
      return [...prev, { inventory_id: prodId, batch_count: 1 }]
    })
  }

  const handleBatchChange = (prodId, val) => setPurchaseProducts(prev => prev.map(p => p.inventory_id === prodId ? { ...p, batch_count: Math.max(1, parseInt(val) || 1) } : p))

  const handleGenerateSummary = async () => {
    if (purchaseProducts.length === 0) return showMsg('Select at least one product')
    setLoading(true)
    const prodIds = purchaseProducts.map(p => p.inventory_id)
    const { data: recipeData } = await supabase.from('product_recipes').select('*, recipe_ingredients(*, raw_material:raw_material_id(*))').in('inventory_id', prodIds)
    if (!recipeData || recipeData.length === 0) { showMsg('No recipes found for selected products.'); setLoading(false); return }
    const agg = {}; const batchDetails = []
    purchaseProducts.forEach(pp => {
      const recipe = recipeData.find(r => r.inventory_id === pp.inventory_id)
      if (!recipe) return
      batchDetails.push({ inventory_id: pp.inventory_id, batch_count: pp.batch_count })
      recipe.recipe_ingredients.forEach(ing => {
        const mat = ing.raw_material; if (!mat) return
        const totalQty = parseFloat(ing.quantity_used) * pp.batch_count
        if (agg[mat.id]) { agg[mat.id].qty += totalQty; agg[mat.id].recipeQty += parseFloat(ing.quantity_used) }
        else agg[mat.id] = { mat, qty: totalQty, recipeQty: parseFloat(ing.quantity_used), unit: ing.unit_used }
      })
    })
    const items = Object.values(agg).map(a => {
      const mat = a.mat
      if (mat.calculation_mode === 'fraction') {
        const perUnit = parseFloat(mat.fraction_grams) || 1
        const unitsNeeded = Math.ceil(a.qty / perUnit)
        return { material_id: mat.id, material_name: mat.name, qty: unitsNeeded, unit: mat.unit, cost: calcIngredientCost(mat, unitsNeeded * perUnit), rawMaterial: mat, recipeQty: a.recipeQty, rawQty: a.qty, rawUnit: mat.fraction_unit }
      }
      return { material_id: mat.id, material_name: mat.name, qty: a.qty, unit: a.unit, cost: calcIngredientCost(mat, a.qty), rawMaterial: mat, recipeQty: a.recipeQty, rawQty: a.qty, rawUnit: a.unit }
    })
    const totalCost = items.reduce((s, i) => s + i.cost, 0)
    setPurchaseSummary({ items, totalCost, batchDetails }); setManualQty({}); setLoading(false)
  }

  const handleSavePurchase = async () => {
    if (!purchaseSummary) return showMsg('Generate summary first')
    setLoading(true)
    const itemsToSave = purchaseSummary.items.map(i => {
      const qty = getDisplayQty(i)
      const mat = i.rawMaterial
      // Lock the unit price at current raw_material price
      const unitPrice = mat && mat.price != null ? parseFloat(mat.price) : null
      let cost
      if (mat && unitPrice != null) {
        // qty * unitPrice (e.g., packets × price per packet, kg × price per kg)
        cost = qty * unitPrice
      } else {
        cost = getItemCost(i)
      }
      return {
        purchase_plan_id: null,
        raw_material_id: i.material_id,
        total_quantity_needed: qty,
        raw_quantity_needed: i.rawQty ?? null,
        unit: i.unit,
        raw_unit: i.rawUnit ?? null,
        unit_price: unitPrice,
        estimated_cost: cost
      }
    })
    const totalCost = itemsToSave.reduce((s, i) => s + i.estimated_cost, 0)
    const { data: plan, error: planErr } = await supabase.from('purchase_plans').insert([{ user_id: session.user.id, notes: purchaseNotes || null, total_estimated_cost: totalCost }]).select().single()
    if (planErr) { showMsg('Error: ' + planErr.message); setLoading(false); return }
    await supabase.from('purchase_plan_items').insert(itemsToSave.map(i => ({ ...i, purchase_plan_id: plan.id })))
    await supabase.from('purchase_plan_batches').insert(purchaseSummary.batchDetails.map(b => ({ purchase_plan_id: plan.id, inventory_id: b.inventory_id, batch_count: b.batch_count })))
    showMsg('Purchase plan saved!'); setPurchaseSummary(null); setPurchaseProducts([]); setPurchaseNotes(''); setManualQty({}); await fetchPurchaseRecords(); const { data: freshRecord } = await supabase.from('purchase_plans').select('*, purchase_plan_items(*, raw_material:raw_material_id(name, price, calculation_mode, fraction_unit)), purchase_plan_batches(*, inventory:inventory_id(product_name))').eq('id', plan.id).single(); if (freshRecord) setSelectedPurchase(freshRecord); setActiveTab('records'); setLoading(false)
  }

  const handleDeletePurchase = async (purchaseId) => {
    if (!confirm('Delete this purchase record? This cannot be undone.')) return
    setLoading(true)
    const { error } = await supabase.from('purchase_plans').delete().eq('id', purchaseId)
    if (error) showMsg('Error: ' + error.message); else { showMsg('Purchase record deleted!'); if (selectedPurchase?.id === purchaseId) setSelectedPurchase(null); fetchPurchaseRecords() }
    setLoading(false)
  }

  // Calculate cost using locked unit_price ONLY, never current price
  const calcRecordItemCost = (item, qty) => {
    const lockedPrice = item.unit_price != null ? parseFloat(item.unit_price) : null
    if (lockedPrice != null) {
      // Use locked unit_price - multiply by qty (unit_price is per purchase unit)
      return qty * lockedPrice
    }
    // Fallback: prorate from original estimated_cost (for old records without unit_price)
    return parseFloat(item.estimated_cost || 0) * (qty / (item.total_quantity_needed || 1))
  }

  const handleEditRecordQty = async () => {
    if (!selectedPurchase) return
    setIsSavingEdit(true)
    const items = selectedPurchase.purchase_plan_items || []
    let hasChanges = false
    // Update each item that has been changed
    for (const item of items) {
      const newQty = editRecordQtys[item.id]
      if (newQty !== undefined && newQty !== '' && String(newQty) !== String(item.total_quantity_needed)) {
        hasChanges = true
        const cost = calcRecordItemCost(item, parseFloat(newQty))
        const { error } = await supabase.from('purchase_plan_items').update({ total_quantity_needed: parseFloat(newQty), estimated_cost: cost }).eq('id', item.id)
        if (error) showMsg('Error updating item: ' + error.message)
      }
    }
    if (!hasChanges) {
      setEditingRecordId(null)
      setEditRecordQtys({})
      setIsSavingEdit(false)
      showMsg('No changes detected.')
      return
    }
    // Recalculate total cost
    let totalCost = 0
    for (const item of items) {
      const newQty = editRecordQtys[item.id]
      const qty = (newQty !== undefined && newQty !== '') ? parseFloat(newQty) : item.total_quantity_needed
      totalCost += calcRecordItemCost(item, qty)
    }
    const { error: planErr } = await supabase.from('purchase_plans').update({ total_estimated_cost: totalCost }).eq('id', selectedPurchase.id)
    if (planErr) showMsg('Error updating total: ' + planErr.message)
    setEditingRecordId(null)
    setEditRecordQtys({})
    setIsSavingEdit(false)
    showMsg('Quantities updated successfully!')
    // Refresh records and update selectedPurchase
    await fetchPurchaseRecords()
    // Update selectedPurchase with fresh data
    const { data: freshData } = await supabase.from('purchase_plans').select('*, purchase_plan_items(*, raw_material:raw_material_id(name, price, calculation_mode, fraction_unit)), purchase_plan_batches(*, inventory:inventory_id(product_name))').eq('id', selectedPurchase.id).single()
    if (freshData) setSelectedPurchase(freshData)
  }

  const enableEditRecord = () => {
    const items = selectedPurchase.purchase_plan_items || []
    const qtys = {}
    items.forEach(item => { qtys[item.id] = String(item.total_quantity_needed) })
    setEditRecordQtys(qtys)
    setEditingRecordId(selectedPurchase.id)
  }

  const handleEditQtyChange = (itemId, value) => {
    setEditRecordQtys(prev => ({ ...prev, [itemId]: value }))
  }

  const buildPdfRows = (items, manualQtys = {}) => {
    return items.map((item) => {
      const qty = manualQtys[item.material_id] !== undefined && manualQtys[item.material_id] !== '' ? parseFloat(manualQtys[item.material_id]) : (item.qty ?? item.total_quantity_needed)
      const normalizedItem = { qty, unit: item.unit, rawMaterial: item.rawMaterial ?? item.raw_material, cost: parseFloat(item.cost ?? item.estimated_cost) || 0, material_name: item.material_name ?? item.raw_material?.name ?? 'Unknown', recipeQty: item.recipeQty ?? 0, rawQty: item.rawQty ?? item.raw_quantity_needed ?? null, rawUnit: item.rawUnit ?? item.raw_unit ?? item.raw_material?.fraction_unit ?? item.unit, unit_price: item.unit_price }
      const display = formatPurchaseQty(normalizedItem)
      // For saved records with locked unit_price, use that. Otherwise prorate from saved cost.
      let itemCost
      if (normalizedItem.unit_price != null) {
        itemCost = qty * parseFloat(normalizedItem.unit_price)
      } else {
        // Prorate from original estimated_cost (old records without unit_price)
        itemCost = normalizedItem.cost * (qty / (item.total_quantity_needed || 1))
      }
      return { material: normalizedItem.material_name, quantity: `${display.qty} ${display.unit}`, unit: display.unit, cost: `RM ${itemCost.toFixed(2)}`, note: display.isRoundedUp ? display.note : '' }
    })
  }

  const handleDownloadPDF = (record = null) => {
    const summary = record ? { batchDetails: record.purchase_plan_batches || [], items: record.purchase_plan_items || [], totalCost: parseFloat(record.total_estimated_cost || 0), notes: record.notes || '', planDate: record.plan_date || new Date().toISOString().slice(0, 10) } : purchaseSummary
    if (!summary || !summary.items || summary.items.length === 0) return showMsg('No purchase summary available to export.')
    const rows = record ? buildPdfRows(summary.items) : buildPdfRows(summary.items, manualQty)
    const itemsHtml = rows.map((row) => { const noteHtml = row.note ? `<div class="item-note">${row.note}</div>` : ''; return `<tr><td>${row.material}${noteHtml}</td><td>${row.quantity}</td><td>${row.cost}</td></tr>` }).join('')
    const batchesHtml = summary.batchDetails.map((b) => { const prod = products.find((p) => p.id === b.inventory_id); return `<div class="batch-line">• ${prod?.product_name || b.inventory?.product_name || 'Unknown'} — ${b.batch_count} batch(es)</div>` }).join('')
    const notesHtml = summary.notes ? `<div class="section-row"><span class="section-label">Notes:</span><span>${summary.notes}</span></div>` : ''

    // Format today's date as dd-mm-yyyy for the title (so browser Save to PDF uses this as suggested filename)
    const today = new Date()
    const dd = String(today.getDate()).padStart(2, '0')
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const yyyy = today.getFullYear()
    const pageTitle = `Purchase List ${dd}-${mm}-${yyyy}`

    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>${pageTitle}</title>
<style>body{margin:0;background:#f6f6f6;color:#111;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}.page{width:210mm;min-height:297mm;padding:20mm;margin:10mm auto;background:#fff;box-shadow:0 0 12px rgba(0,0,0,0.08)}h1{margin:0 0 8px;font-size:22px;letter-spacing:-0.5px}.meta{margin:0 0 18px;font-size:13px;color:#444}.section-label{font-weight:700;margin-right:6px}.section-row{margin-bottom:10px}.batch-line{margin-left:14px;margin-bottom:4px;font-size:13px}table.preview-table{width:100%;border-collapse:collapse;margin-top:18px}table.preview-table th,table.preview-table td{border:1px solid #ccc;padding:10px 12px;text-align:left;font-size:13px}table.preview-table th{background:#f3f4f6}.item-note{margin-top:4px;font-size:11px;color:#555}.summary{margin-top:16px;display:flex;justify-content:flex-end;gap:10px;font-size:14px;font-weight:700}.summary-label{color:#555;font-weight:500}@page{size:A4 portrait;margin:20mm}@media print{body{background:#fff}.page{box-shadow:none;margin:0;width:auto;min-height:auto;padding:0}}</style></head>
<body><div class="page"><h1>${pageTitle}</h1><div class="meta">Date: ${summary.planDate}</div>${notesHtml}<div class="section-row"><span class="section-label">Products / Batches:</span>${batchesHtml || 'None'}</div><table class="preview-table"><thead><tr><th>Material</th><th>Qty Needed</th><th>Estimated Cost</th></tr></thead><tbody>${itemsHtml}</tbody></table><div class="summary"><span class="summary-label">TOTAL:</span><span>RM ${summary.totalCost.toFixed(2)}</span></div></div></body></html>`
    const previewWindow = window.open('', '_blank')
    if (!previewWindow) return showMsg('Unable to open print preview. Please allow pop-ups for this site.')
    previewWindow.document.write(html); previewWindow.document.close(); previewWindow.focus()
  }

  const viewPurchaseDetail = (record) => setSelectedPurchase(record)
  if (!hasAccess) return <div className="alert-unauthorized"><span className="material-symbols-outlined me-1" style={{ fontSize: '14px', verticalAlign: 'middle' }}>lock</span> Access Denied: Unauthorized.</div>

  const tabs = [{ id: 'purchase', label: 'Purchase' }, { id: 'records', label: 'Records' }]
  const showSideSection = (section) => setActiveTab(section)
  const isSideSection = activeTab === 'materials' || activeTab === 'recipes'
  const showMainTabs = activeTab === 'purchase' || activeTab === 'records'

  return (
    <div className="position-relative">
      {toastMsg && <div className="toast-container-custom"><div className="alert-toast d-flex align-items-center gap-2 px-3 py-2 rounded-pill shadow-lg"><span>{toastMsg}</span></div></div>}
      <div className="page-header-custom d-flex flex-wrap justify-content-between align-items-center gap-3">
        <div>
          <h1 className="page-title-custom"><span className="material-symbols-outlined me-2" style={{ fontSize: '24px', verticalAlign: 'middle' }}>calendar_month</span> Production Planning</h1>
          <p className="page-subtitle-custom">Manage materials, recipes, and purchase planning.</p>
        </div>
        {showMainTabs && (
          <div className="d-flex gap-2 flex-wrap">
            <button onClick={() => showSideSection('materials')} className="btn btn-sm fw-bold d-flex align-items-center gap-1">
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>kitchen</span> Materials
            </button>
            <button onClick={() => showSideSection('recipes')} className="btn btn-sm fw-bold d-flex align-items-center gap-1">
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>menu_book</span> Recipes
            </button>
          </div>
        )}
        {isSideSection && (
          <button onClick={() => setActiveTab('purchase')} className="btn btn-sm fw-bold d-flex align-items-center gap-1">
            ← Back
          </button>
        )}
      </div>
      {showMainTabs && (
        <ul className="nav nav-tabs mb-4 gap-1 overflow-auto flex-nowrap">
          {tabs.map(t => <li className="nav-item" key={t.id}><button className={`nav-link fw-bold text-nowrap ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>{t.label}</button></li>)}
        </ul>
      )}

      {/* SIDE SECTION: MATERIALS */}
      {isSideSection && activeTab === 'materials' && (
        <div>
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
            <div className="position-relative flex-grow-1" style={{ maxWidth: '360px' }}>
              <span className="material-symbols-outlined position-absolute top-50 start-0 translate-middle-y ms-2 text-muted" style={{ fontSize: '18px', pointerEvents: 'none' }}>search</span>
              <input
                type="text"
                className="form-control form-control-sm ps-4 pe-4"
                placeholder="Search material by name or unit..."
                value={materialSearch}
                onChange={(e) => setMaterialSearch(e.target.value)}
              />
              {materialSearch && (
                <button
                  onClick={() => setMaterialSearch('')}
                  className="btn btn-sm btn-link p-0 position-absolute top-50 end-0 translate-middle-y me-2 text-muted text-decoration-none"
                  style={{ fontSize: '14px', lineHeight: 1 }}
                  type="button"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                </button>
              )}
            </div>
            <button onClick={() => openMatModal(null)} className="btn btn-primary btn-sm fw-bold d-flex align-items-center gap-2">
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span> Add Material
            </button>
          </div>
          <div className="row g-3">
            {filteredMaterials.map((m, idx) => (
              <div className="col-sm-6 col-lg-4" key={m.id || idx}>
                <div className="card p-3 d-flex flex-column gap-2">
                  <div className="d-flex justify-content-between align-items-start gap-2">
                    <h6 className="fw-bold mb-0 flex-grow-1 text-break">{m.name}</h6>
                    <div className="d-flex gap-1 flex-shrink-0">
                      <button onClick={() => openMatModal(m)} className="btn btn-sm btn-link p-1"><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span></button>
                      <button onClick={() => handleDeleteMat(m.id)} className="btn btn-sm btn-link p-1"><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span></button>
                    </div>
                  </div>
                  <div className="d-flex flex-column gap-1 small">
                    <div className="d-flex justify-content-between"><span className="text-muted">Unit:</span><span className="fw-bold">{m.unit}</span></div>
                    <div className="d-flex justify-content-between"><span className="text-muted">Price:</span><span className="fw-bold text-accent">RM {parseFloat(m.price).toFixed(2)}</span></div>
                    {m.calculation_mode === 'fraction' ? (
                      <>
                        <div className="d-flex justify-content-between"><span className="text-muted">1 {m.unit} =</span><span className="fw-bold">{m.fraction_grams}{m.fraction_unit}</span></div>
                        <div className="d-flex justify-content-between pt-1 mt-1"><span className="text-muted">Price/{m.fraction_unit}:</span><span className="font-mono fw-bold small text-warning">RM {(parseFloat(m.price) / parseFloat(m.fraction_grams || 1)).toFixed(4)}</span></div>
                      </>
                    ) : <div className="d-flex justify-content-between pt-1 mt-1"><span className="text-muted">Mode:</span><span className="chip-custom">Unit</span></div>}
                  </div>
                </div>
              </div>
            ))}
            {materials.length === 0 && <div className="col-12 text-center py-5 text-muted fw-bold">No materials yet. Add one!</div>}
            {materials.length > 0 && filteredMaterials.length === 0 && (
              <div className="col-12 text-center py-5 text-muted fw-bold">No materials found matching "{materialSearch}".</div>
            )}
          </div>

          {matModal && (
            <>
              <div className="modal-backdrop show" onClick={() => setMatModal(false)}></div>
              <div className="modal d-block" tabIndex="-1">
                <div className="modal-dialog modal-dialog-centered">
                  <div className="modal-content p-3">
                    <h5 className="fw-bold text-primary mb-3"><span className="material-symbols-outlined me-1" style={{ fontSize: '18px', verticalAlign: 'middle' }}>{editingMat ? 'edit' : 'add'}</span> {editingMat ? 'Edit Material' : 'Add New Material'}</h5>
                    <form onSubmit={handleSaveMat}>
                      <div className="mb-3"><label className="form-label">Material Name *</label><input type="text" required placeholder="e.g., Cooking Oil" className="form-control" value={matName} onChange={(e) => setMatName(e.target.value)} /></div>
                      <div className="mb-3"><label className="form-label">Unit *</label><select className="form-select fw-bold" value={matUnit} onChange={(e) => setMatUnit(e.target.value)}><option value="packet">packet</option><option value="kg">kg</option><option value="g">g</option><option value="liter">liter</option><option value="ml">ml</option><option value="bottle">bottle</option><option value="sack">sack</option><option value="tray">tray</option><option value="piece">piece</option><option value="box">box</option><option value="can">can</option><option value="other">other</option></select></div>
                      <div className="mb-3"><label className="form-label">Price (RM) *</label><input type="number" step="0.01" required min="0" placeholder="0.00" className="form-control fw-bold" value={matPrice} onChange={(e) => setMatPrice(e.target.value)} inputMode="decimal" /></div>
                      <div className="mb-3"><label className="form-label">Calculation Mode</label>
                        <div className="d-flex gap-3"><label className="d-flex align-items-center gap-2 cursor-pointer"><input type="radio" name="matMode" className="form-check-input" checked={matMode === 'unit'} onChange={() => setMatMode('unit')} /><span className="fw-bold small">Unit (by packet/piece/etc)</span></label>
                          <label className="d-flex align-items-center gap-2 cursor-pointer"><input type="radio" name="matMode" className="form-check-input" checked={matMode === 'fraction'} onChange={() => setMatMode('fraction')} /><span className="fw-bold small">Fraction (by g/ml)</span></label></div>
                      </div>
                      {matMode === 'fraction' && (
                        <div className="p-3 mb-3 rounded-3 border">
                          <div className="row g-3">
                            <div className="col-6"><label className="form-label">1 unit = ? grams/ml</label><input type="number" step="any" required min="0" placeholder="e.g., 8000" className="form-control fw-bold" value={matFractionG} onChange={(e) => setMatFractionG(e.target.value)} inputMode="decimal" /></div>
                            <div className="col-6"><label className="form-label">Unit</label><select className="form-select fw-bold" value={matFractionUnit} onChange={(e) => setMatFractionUnit(e.target.value)}><option value="g">gram (g)</option><option value="ml">milliliter (ml)</option></select></div>
                          </div>
                        </div>
                      )}
                      <div className="d-flex gap-2 justify-content-end pt-2">
                        <button type="button" className="btn btn-sm btn-link" onClick={() => setMatModal(false)}>Cancel</button>
                        <button type="submit" disabled={loading} className="btn btn-sm btn-primary fw-bold px-3">{loading ? 'Saving...' : editingMat ? 'Save Changes' : 'Add Material'}</button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* SIDE SECTION: RECIPES */}
      {isSideSection && activeTab === 'recipes' && (
        <div className="row g-4">
          <div className="col-lg-4">
            <div className="card p-3 d-flex flex-column gap-3">
              <h6 className="fw-bold">1. Select Product</h6>
              <select className="form-select fw-bold" value={selectedProduct?.id || ''} onChange={(e) => handleProductSelect(e.target.value)}>
                <option value="">-- Select Product --</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.product_name}</option>)}
              </select>
              {selectedProduct && <div className="chip-custom w-100 justify-content-center p-2"><span className="material-symbols-outlined me-1" style={{ fontSize: '14px', verticalAlign: 'middle' }}>{currentRecipeId ? 'check_circle' : 'sync'}</span> {currentRecipeId ? 'Recipe ready' : 'Select a product to start'}</div>}
            </div>
          </div>
          <div className="col-lg-8">
            {selectedProduct ? (
              <div className="d-flex flex-column gap-3">
                <div className="card p-3">
                  <h6 className="fw-bold mb-3">2. Add Ingredient</h6>
                  <form onSubmit={handleAddIngredient} className="d-flex flex-column gap-3">
                    <div><label className="form-label">Material</label><SearchableSelect items={materials} value={ingMatId} onChange={(id) => { setIngMatId(id); const mat = materials.find(m => m.id === id); if (mat) setIngUnit(mat.calculation_mode === 'fraction' ? (mat.fraction_unit || 'g') : mat.unit) }} placeholder="Search material..." disabled={!currentRecipeId} /></div>
                    <div className="row g-3">
                      <div className="col-6"><label className="form-label">Qty Used</label><input type="number" step="any" required min="0" placeholder="e.g. 300" className="form-control fw-bold" value={ingQty} onChange={(e) => setIngQty(e.target.value)} disabled={!currentRecipeId} inputMode="decimal" /></div>
                      <div className="col-6"><label className="form-label">Unit</label><input type="text" readOnly className="form-control fw-bold" value={ingUnit} placeholder="-" disabled={!currentRecipeId} /></div>
                    </div>
                    <button type="submit" disabled={!currentRecipeId || !ingMatId || !ingQty} className="btn fw-bold btn-sm text-white">+ Add to Recipe</button>
                  </form>
                </div>
                <div className="card p-3">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h6 className="fw-bold mb-0">Ingredients</h6>
                    <span className="chip-custom fw-bold p-2">RM {totalCostPerBatch.toFixed(2)} / batch</span>
                  </div>
                  {recipeIngredients.length === 0 ? <div className="text-center py-4 text-muted fw-bold">No ingredients added yet.</div> : (
                    <div className="d-flex flex-column">
                      {recipeIngredients.map((ing, idx) => (
                        <div key={ing.id || idx} className={`d-flex align-items-center gap-2 p-3 ${idx < recipeIngredients.length - 1 ? 'border-bottom' : ''}`}>
                          <div className="flex-shrink-0 d-flex align-items-center justify-content-center rounded-circle" style={{ width: '32px', height: '32px', background: 'var(--bg-input)', fontSize: '13px' }}>{idx + 1}</div>
                          <div className="flex-grow-1 min-w-0">
                            <div className="fw-bold small text-break">{ing.raw_material?.name || 'Unknown'}</div>
                            <div className="small text-muted">{parseFloat(ing.quantity_used).toFixed(2)} {ing.unit_used}</div>
                          </div>
                          <div className="d-flex align-items-center gap-2 flex-shrink-0">
                            <span className="font-mono small fw-bold text-nowrap">RM {calcIngredientCost(ing.raw_material, ing.quantity_used).toFixed(2)}</span>
                            <button onClick={() => handleRemoveIngredient(ing.id)} className="btn btn-sm btn-link text-danger p-1" style={{ fontSize: '14px', lineHeight: 1 }} title="Remove"><span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : <div className="card p-5 text-center text-muted fw-bold">Select a product on the left to manage its recipe.</div>}
          </div>
        </div>
      )}

      {/* MAIN TAB: PURCHASE */}
      {showMainTabs && activeTab === 'purchase' && (
        <div className="row g-4">
          <div className="col-lg-6">
            <div className="card p-3 d-flex flex-column gap-0">
              <div className="text-muted mb-3" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <span className="material-symbols-outlined me-1" style={{ fontSize: '14px', verticalAlign: 'middle' }}>inventory_2</span>
                Select Products & Set Batches
              </div>
              <div className="d-flex flex-column">
                {products.map((p, idx) => {
                  const checked = purchaseProducts.find(x => x.inventory_id === p.id)
                  return (
                    <div key={p.id} className={`cursor-pointer ${idx < products.length - 1 ? 'border-bottom' : ''}`} onClick={() => handleTogglePurchaseProduct(p.id)}>
                      <div className="d-flex align-items-center gap-2 p-3">
                        <div className="flex-shrink-0 d-flex align-items-center justify-content-center rounded-circle" style={{ width: '32px', height: '32px', background: 'var(--bg-input)', fontSize: '13px' }}>{idx + 1}</div>
                        <input type="checkbox" className="form-check-input flex-shrink-0" checked={!!checked} readOnly />
                        <span className="fw-bold small text-break flex-fill">{p.product_name}</span>
                      </div>
                      {checked && <div className="d-flex align-items-center gap-2 px-3 pb-3 ps-4" style={{ paddingLeft: '72px' }} onClick={(e) => e.stopPropagation()}>
                        <span className="text-muted small">Batch:</span>
                        <input type="number" min="1" className="form-control form-control-sm" style={{ maxWidth: '100px' }} value={checked.batch_count} onChange={(e) => handleBatchChange(p.id, e.target.value)} inputMode="numeric" onFocus={(e) => e.target.select()} />
                      </div>}
                    </div>
                  )
                })}
                {products.length === 0 && <div className="text-center py-4 text-muted fw-bold">No products available. Create in Inventory first.</div>}
              </div>
              <div className="pt-3">
                <button onClick={handleGenerateSummary} disabled={purchaseProducts.length === 0 || loading} className="btn btn-primary w-100 fw-bold">{loading ? 'Calculating...' : <><span className="material-symbols-outlined me-1" style={{ fontSize: '16px', verticalAlign: 'middle' }}>sync</span> Generate Shopping List</>}</button>
                {purchaseProducts.length > 0 && <button onClick={() => setPurchaseProducts([])} className="btn btn-sm btn-outline-secondary w-100 mt-2">Clear Selection</button>}
              </div>
            </div>
          </div>
          <div className="col-lg-6">
            <div className="card p-3 d-flex flex-column gap-0">
              <div className="text-muted mb-3" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <span className="material-symbols-outlined me-1" style={{ fontSize: '14px', verticalAlign: 'middle' }}>shopping_cart</span>
                Shopping Summary
              </div>
              {purchaseSummary ? (
                <div className="d-flex flex-column gap-0">
                  {/* Batch chips */}
                  {purchaseSummary.batchDetails.length > 0 && (
                    <div className="pb-3">
                      <div className="d-flex flex-wrap gap-2">
                        {purchaseSummary.batchDetails.map((b, i) => {
                          const prod = products.find(p => p.id === b.inventory_id); return (
                            <span key={i} className="chip-custom d-inline-flex align-items-center gap-1" style={{ fontSize: '12px', padding: '4px 10px' }}>
                              <span className="fw-bold">{prod?.product_name || 'Unknown'}</span>
                              <span className="text-muted">— {b.batch_count} batch</span>
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {/* Materials section */}
                  <div className="text-muted mb-2" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Materials</div>
                  <div className="d-flex flex-column">
                    {purchaseSummary.items.map((item, i) => {
                      const display = formatPurchaseQty(item)
                      const isManualQty = manualQty[item.material_id] !== undefined && manualQty[item.material_id] !== ''
                      return (
                        <div key={i} className={`d-flex align-items-center gap-2 p-3 ${i < purchaseSummary.items.length - 1 ? 'border-bottom' : ''}`}>
                          <div className="flex-shrink-0 d-flex align-items-center justify-content-center rounded-circle" style={{ width: '32px', height: '32px', background: 'var(--bg-input)', fontSize: '13px' }}>{i + 1}</div>
                          <div className="flex-grow-1 min-w-0">
                            <div className="fw-bold small text-break mb-1">{item.material_name}</div>
                            <div className="d-flex align-items-center gap-2 flex-wrap">
                              <input type="number" min="0" step="0.01" className={`form-control form-control-sm ${isManualQty ? 'border-warning' : ''}`} style={{ maxWidth: '100px' }} value={isManualQty ? manualQty[item.material_id] : ''} onChange={(e) => updateManualQty(item.material_id, e.target.value)} placeholder={display.qty} inputMode="decimal" onFocus={(e) => e.target.select()} />
                              <span className="small text-muted">{display.unit}</span>
                              {item.rawQty != null && item.rawUnit && (
                                <span className="small text-muted">(from {stripTrailing(item.rawQty)} {item.rawUnit})</span>
                              )}
                            </div>
                          </div>
                          <div className="flex-shrink-0 d-flex flex-column align-items-end gap-1">
                            <span className="font-mono small fw-bold text-nowrap">RM {getItemCost(item).toFixed(2)}</span>
                            {display.isRoundedUp && <span className="small text-warning" style={{ fontSize: '10px' }}>{display.note}</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {/* Total */}
                  <div className="d-flex justify-content-between align-items-center py-3 border-top border-default">
                    <div className="text-muted" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, lineHeight: 1.2 }}>RM {purchaseSummary.items.reduce((sum, item) => sum + getItemCost(item), 0).toFixed(2)}</div>
                  </div>
                  {/* Notes */}
                  <div className="pt-3 border-top border-default">
                    <div className="text-muted mb-2" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes</div>
                    <input type="text" className="form-control" placeholder="e.g., Purchase for weekend event" value={purchaseNotes} onChange={(e) => setPurchaseNotes(e.target.value)} />
                  </div>
                  <div className="pt-3">
                    <button onClick={handleSavePurchase} disabled={loading} className="btn btn-primary w-100 fw-bold"><span className="material-symbols-outlined me-1" style={{ fontSize: '16px', verticalAlign: 'middle' }}>save</span> Save Record</button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-muted fw-bold">Select products and batches on the left, then click Generate.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MAIN TAB: RECORDS */}
      {showMainTabs && activeTab === 'records' && (
        <div>
          {selectedPurchase ? (
            <div>
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
                <button onClick={() => setSelectedPurchase(null)} className="btn btn-sm btn-link">← Back to Records</button>
                <div className="d-flex gap-2">
                  {editingRecordId === selectedPurchase.id ? (
                    <>
                      <button onClick={handleEditRecordQty} disabled={isSavingEdit} className="btn btn-sm btn-success fw-bold text-white"><span className="material-symbols-outlined me-1" style={{ fontSize: '14px', verticalAlign: 'middle' }}>save</span> {isSavingEdit ? 'Saving...' : 'Save'}</button>
                      <button onClick={() => { setEditingRecordId(null); setEditRecordQtys({}) }} className="btn btn-sm btn-link">Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={enableEditRecord} className="btn btn-sm btn-warning fw-bold"><span className="material-symbols-outlined me-1" style={{ fontSize: '14px', verticalAlign: 'middle' }}>edit</span> Edit</button>
                      <button onClick={() => handleDeletePurchase(selectedPurchase.id)} className="btn btn-sm"><span className="material-symbols-outlined me-1" style={{ fontSize: '14px', verticalAlign: 'middle' }}>delete</span> Delete</button>
                      <button onClick={() => handleDownloadPDF(selectedPurchase)} className="btn btn-sm btn-primary text-white"><span className="material-symbols-outlined me-1" style={{ fontSize: '14px', verticalAlign: 'middle' }}>download</span> Download PDF</button>
                    </>
                  )}
                </div>
              </div>
              <div className="card p-3 d-flex flex-column gap-0">
                {/* Header with date block + total + notes */}
                <div className="d-flex align-items-center gap-3 pb-3 border-bottom border-default">
                  {/* Date block - matching records list style */}
                  <div className="flex-shrink-0 text-center rounded-3 px-2 py-1" style={{ minWidth: '54px', background: 'var(--bg-input, #f3f4f6)' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, lineHeight: 1.1 }}>
                      {selectedPurchase.plan_date ? selectedPurchase.plan_date.slice(8, 10) : '--'}
                    </div>
                    <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>
                      {selectedPurchase.plan_date ? new Date(selectedPurchase.plan_date).toLocaleString('en', { month: 'short' }) : ''}
                    </div>
                    <div style={{ fontSize: '10px', opacity: 0.5 }}>
                      {selectedPurchase.plan_date ? selectedPurchase.plan_date.slice(0, 4) : ''}
                    </div>
                  </div>
                  {/* Info area */}
                  <div className="flex-grow-1 min-w-0">
                    <div className="fw-bold mb-1">Purchase Details</div>
                    {selectedPurchase.notes ? (
                      <div className="small text-muted text-break">{selectedPurchase.notes}</div>
                    ) : (
                      <div className="small text-muted">—</div>
                    )}
                    {/* Mini chips for batch/product counts */}
                    <div className="d-flex flex-wrap gap-1 mt-2">
                      <span className="chip-custom" style={{ fontSize: '11px', padding: '1px 8px' }}>
                        <span className="material-symbols-outlined me-1" style={{ fontSize: '12px', verticalAlign: 'middle' }}>inventory_2</span>
                        {(selectedPurchase.purchase_plan_batches || []).length} product(s)
                      </span>
                      <span className="chip-custom" style={{ fontSize: '11px', padding: '1px 8px' }}>
                        <span className="material-symbols-outlined me-1" style={{ fontSize: '12px', verticalAlign: 'middle' }}>kitchen</span>
                        {(selectedPurchase.purchase_plan_items || []).length} item(s)
                      </span>
                    </div>
                  </div>
                  {/* Total cost */}
                  <div className="flex-shrink-0 text-end">
                    <div className="text-muted" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, lineHeight: 1.2 }}>RM {parseFloat(selectedPurchase.total_estimated_cost || 0).toFixed(2)}</div>
                  </div>
                </div>
                {/* Batches section */}
                {(selectedPurchase.purchase_plan_batches || []).length > 0 && (
                  <div className="py-3 border-bottom border-default">
                    <div className="text-muted mb-2" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Products / Batches</div>
                    <div className="d-flex flex-wrap gap-2">
                      {(selectedPurchase.purchase_plan_batches || []).map((b, i) => {
                        const prod = products.find(p => p.id === b.inventory_id)
                        return (
                          <span key={i} className="chip-custom d-inline-flex align-items-center gap-1" style={{ fontSize: '12px', padding: '4px 10px' }}>
                            <span className="fw-bold">{prod?.product_name || b.inventory?.product_name || 'Unknown'}</span>
                            <span className="text-muted">— {b.batch_count} batch</span>
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}
                {/* Materials section */}
                <div className="pt-3">
                  <div className="text-muted mb-3" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Materials</div>
                  {(selectedPurchase.purchase_plan_items || []).length === 0 ? (
                    <div className="text-center py-4 text-muted fw-bold">No materials in this record.</div>
                  ) : (
                    <div className="d-flex flex-column">
                      {(selectedPurchase.purchase_plan_items || []).map((item, i) => {
                        const isEditing = editingRecordId === selectedPurchase.id
                        const display = formatPurchaseQty({ qty: isEditing && editRecordQtys[item.id] ? parseFloat(editRecordQtys[item.id]) : item.total_quantity_needed, unit: item.unit, rawQty: item.raw_quantity_needed || null, rawUnit: item.raw_unit || item.raw_material?.fraction_unit || null })
                        const displayCost = isEditing && editRecordQtys[item.id] !== undefined && editRecordQtys[item.id] !== ''
                          ? calcRecordItemCost(item, parseFloat(editRecordQtys[item.id]))
                          : parseFloat(item.estimated_cost || 0)
                        return (
                          <div key={i} className={`d-flex align-items-center gap-2 p-3 ${i < (selectedPurchase.purchase_plan_items || []).length - 1 ? 'border-bottom' : ''}`}>
                            {/* Number circle */}
                            <div className="flex-shrink-0 d-flex align-items-center justify-content-center rounded-circle" style={{ width: '32px', height: '32px', background: 'var(--bg-input)', fontSize: '13px' }}>{i + 1}</div>
                            {/* Material info */}
                            <div className="flex-grow-1 min-w-0">
                              <div className="fw-bold small text-break mb-1">{item.raw_material?.name || 'Unknown'}</div>
                              {isEditing ? (
                                <div className="d-flex align-items-center gap-2">
                                  <input type="number" min="0" step="0.01" className="form-control form-control-sm" style={{ maxWidth: '100px' }} value={editRecordQtys[item.id] || ''} onChange={(e) => handleEditQtyChange(item.id, e.target.value)} inputMode="decimal" onFocus={(e) => e.target.select()} />
                                  <span className="small text-muted">{display.unit}</span>
                                </div>
                              ) : (
                                <div className="small text-muted">{display.qty} {display.unit}</div>
                              )}
                            </div>
                            {/* Cost */}
                            <div className="flex-shrink-0 d-flex flex-column align-items-end gap-1">
                              <span className="font-mono small fw-bold text-nowrap">RM {displayCost.toFixed(2)}</span>
                              {display.note && <span className="small text-warning" style={{ fontSize: '10px' }}>{display.note}</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="d-flex flex-column gap-2">
              {purchaseRecords.length === 0 ? (
                <div className="text-center py-5 text-muted">No purchase records yet.</div>
              ) : purchaseRecords.map((rec, i) => (
                <div key={rec.id || i} className="card px-3 py-3 cursor-pointer transition-all" onClick={() => viewPurchaseDetail(rec)}>
                  <div className="d-flex align-items-center gap-3">
                    {/* Date block */}
                    <div className="flex-shrink-0 text-center rounded-3 px-2 py-1" style={{ minWidth: '54px', background: 'var(--bg-input, #f3f4f6)' }}>
                      <div style={{ fontSize: '18px', fontWeight: 700, lineHeight: 1.1 }}>
                        {rec.plan_date ? rec.plan_date.slice(8, 10) : '--'}
                      </div>
                      <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>
                        {rec.plan_date ? new Date(rec.plan_date).toLocaleString('en', { month: 'short' }) : ''}
                      </div>
                      <div style={{ fontSize: '10px', opacity: 0.5 }}>
                        {rec.plan_date ? rec.plan_date.slice(0, 4) : ''}
                      </div>
                    </div>
                    {/* Info */}
                    <div className="flex-grow-1 min-w-0">
                      {rec.notes
                        ? <div className="fw-bold small text-break mb-1">{rec.notes}</div>
                        : <div className="fw-bold small text-muted mb-1">—</div>
                      }
                      <div className="d-flex flex-wrap gap-1">
                        <span className="chip-custom" style={{ fontSize: '11px', padding: '1px 8px' }}>
                          <span className="material-symbols-outlined me-1" style={{ fontSize: '12px', verticalAlign: 'middle' }}>inventory_2</span>
                          {(rec.purchase_plan_batches || []).length} product(s)
                        </span>
                        <span className="chip-custom" style={{ fontSize: '11px', padding: '1px 8px' }}>
                          <span className="material-symbols-outlined me-1" style={{ fontSize: '12px', verticalAlign: 'middle' }}>kitchen</span>
                          {(rec.purchase_plan_items || []).length} item(s)
                        </span>
                      </div>
                    </div>
                    {/* Cost + Delete */}
                    <div className="flex-shrink-0 d-flex flex-column align-items-end gap-1">
                      <span className="fw-bold" style={{ fontSize: '14px' }}>RM {parseFloat(rec.total_estimated_cost || 0).toFixed(2)}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeletePurchase(rec.id) }}
                        className="btn btn-sm p-1"
                        title="Delete"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}