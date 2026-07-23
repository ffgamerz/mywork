import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from './supabaseClient'

// ─── HELPERS ────────────────────────────────────────────────────
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

function formatDisplayQty(qty, unit, material) {
  const val = parseFloat(qty) || 0

  if (material && material.calculation_mode === 'fraction') {
    const perUnit = parseFloat(material.fraction_grams) || 1
    const unitsNeeded = Math.ceil(val / perUnit)
    // Only round up if qty >= perUnit (need at least 1 full unit)
    if (val >= perUnit) {
      return { qty: unitsNeeded, unit: material.unit, isRoundedUp: true, rawQty: val, perUnit, rawUnit: material.fraction_unit }
    }
    // Otherwise show raw value in g/ml
    if (material.fraction_unit === 'g' && val >= 1000) {
      return { qty: (val / 1000).toFixed(3), unit: 'kg', isRoundedUp: false }
    }
    if (material.fraction_unit === 'ml' && val >= 1000) {
      return { qty: (val / 1000).toFixed(3), unit: 'L', isRoundedUp: false }
    }
    return { qty: val.toFixed(2), unit: material.fraction_unit, isRoundedUp: false }
  }

  if (unit === 'g' && val >= 1000) {
    return { qty: (val / 1000).toFixed(3), unit: 'kg', isRoundedUp: false }
  }
  if (unit === 'ml' && val >= 1000) {
    return { qty: (val / 1000).toFixed(3), unit: 'L', isRoundedUp: false }
  }
  return { qty: val.toFixed(2), unit, isRoundedUp: false }
}

function formatPurchaseQty(item) {
  const val = parseFloat(item.qty) || 0
  if (item.rawQty != null && item.rawUnit) {
    return {
      qty: val.toFixed(2),
      unit: item.unit,
      isRoundedUp: true,
      note: `Rounded up from ${parseFloat(item.rawQty).toFixed(2)} ${item.rawUnit}`,
    }
  }

  if (item.unit === 'g' && val >= 1000) {
    return { qty: (val / 1000).toFixed(3), unit: 'kg', isRoundedUp: false }
  }
  if (item.unit === 'ml' && val >= 1000) {
    return { qty: (val / 1000).toFixed(3), unit: 'L', isRoundedUp: false }
  }
  return { qty: val.toFixed(2), unit: item.unit, isRoundedUp: false }
}

// ─── SEARCHABLE SELECT ──────────────────────────────────────────
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
    <div className="relative" ref={ref}>
      <div className={`input input-bordered w-full flex items-center justify-between cursor-pointer rounded-xl ${disabled ? 'bg-base-200 cursor-not-allowed' : ''}`} onClick={() => { if (!disabled) setOpen(!open) }}>
        <span className={`font-bold text-sm ${selected ? '' : 'opacity-40'}`}>{selected ? selected.name : placeholder || 'Select item...'}</span>
        <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-base-100 border border-base-300 rounded-xl shadow-xl max-h-60 overflow-hidden">
          <div className="p-2 border-b border-base-200">
            <input ref={inputRef} type="text" className="input input-sm input-bordered w-full rounded-lg text-sm" placeholder="Type to search..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="overflow-y-auto max-h-44">
            {filtered.length === 0 ? (<div className="p-3 text-sm opacity-40 text-center">No results</div>) : (
              filtered.map(item => (
                <div key={item.id} className={`px-3 py-2.5 text-sm cursor-pointer hover:bg-base-200 font-bold ${item.id === value ? 'bg-primary/20 text-primary' : ''}`} onClick={() => { onChange(item.id); setOpen(false); setSearch('') }}>{item.name}</div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────
export default function ProductionPlanning({ session, userRole, allowedModules = {} }) {
  const [toastMsg, setToastMsg] = useState('')
  const showMsg = (msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3000) }
  const [activeTab, setActiveTab] = useState('materials')
  const [loading, setLoading] = useState(false)

  const cleanedRole = String(userRole || '').trim().toLowerCase()
  const isSuperAdmin = cleanedRole === 'super_admin'
  const isAdmin = cleanedRole === 'admin'
  const hasAccess = isSuperAdmin || isAdmin || allowedModules['productionPlanning'] === true

  // Materials
  const [materials, setMaterials] = useState([])
  const [matModal, setMatModal] = useState(false)
  const [editingMat, setEditingMat] = useState(null)
  const [matName, setMatName] = useState('')
  const [matUnit, setMatUnit] = useState('packet')
  const [matPrice, setMatPrice] = useState('')
  const [matMode, setMatMode] = useState('unit')
  const [matFractionG, setMatFractionG] = useState('')
  const [matFractionUnit, setMatFractionUnit] = useState('g')

  // Recipes
  const [products, setProducts] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [recipeIngredients, setRecipeIngredients] = useState([])
  const [currentRecipeId, setCurrentRecipeId] = useState(null)
  const [ingMatId, setIngMatId] = useState('')
  const [ingQty, setIngQty] = useState('')
  const [ingUnit, setIngUnit] = useState('')

  // Purchase
  const [purchaseProducts, setPurchaseProducts] = useState([])
  const [purchaseSummary, setPurchaseSummary] = useState(null)
  const [purchaseRecords, setPurchaseRecords] = useState([])
  const [selectedPurchase, setSelectedPurchase] = useState(null)
  const [purchaseNotes, setPurchaseNotes] = useState('')
  const [manualQty, setManualQty] = useState({})

  const updateManualQty = (materialId, value) => {
    setManualQty(prev => ({ ...prev, [materialId]: value }))
  }

  const getDisplayQty = (item) => {
    if (manualQty[item.material_id] !== undefined && manualQty[item.material_id] !== '') {
      const val = parseFloat(manualQty[item.material_id])
      return isNaN(val) ? item.qty : val
    }
    return item.qty
  }

  const getItemCost = (item) => {
    const currentQty = getDisplayQty(item)

    if (!item.rawMaterial) {
      return parseFloat(item.cost || 0)
    }

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
    const loadData = async () => {
      await Promise.all([fetchMaterials(), fetchProductsList(), fetchPurchaseRecords()])
    }
    loadData()
  }, [hasAccess])

  const openMatModal = (mat = null) => {
    if (mat) {
      setEditingMat(mat); setMatName(mat.name); setMatUnit(mat.unit); setMatPrice(String(mat.price))
      setMatMode(mat.calculation_mode); setMatFractionG(mat.fraction_grams ? String(mat.fraction_grams) : ''); setMatFractionUnit(mat.fraction_unit || 'g')
    } else {
      setEditingMat(null); setMatName(''); setMatUnit('packet'); setMatPrice(''); setMatMode('unit'); setMatFractionG(''); setMatFractionUnit('g')
    }
    setMatModal(true)
  }

  const handleSaveMat = async (e) => {
    e.preventDefault()
    if (!matName.trim() || !matPrice) return
    setLoading(true)
    const payload = {
      user_id: session.user.id,
      name: matName.trim(),
      unit: matUnit,
      price: parseFloat(matPrice) || 0,
      calculation_mode: matMode,
      fraction_grams: matMode === 'fraction' ? (parseFloat(matFractionG) || null) : null,
      fraction_unit: matMode === 'fraction' ? matFractionUnit : null,
    }

    const response = editingMat
      ? await supabase.from('raw_materials').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingMat.id)
      : await supabase.from('raw_materials').insert([payload])

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
      const { data: newRecipe, error } = await supabase.from('product_recipes').insert([{ inventory_id: prodId, recipe_name: prod.product_name + ' Recipe' }]).select().single()
      if (!error && newRecipe) { setCurrentRecipeId(newRecipe.id); setRecipeIngredients([]) }
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

  const handleBatchChange = (prodId, val) => {
    setPurchaseProducts(prev => prev.map(p => p.inventory_id === prodId ? { ...p, batch_count: Math.max(1, parseInt(val) || 1) } : p))
  }

  const handleGenerateSummary = async () => {
    if (purchaseProducts.length === 0) return showMsg('Select at least one product')
    setLoading(true)
    const prodIds = purchaseProducts.map(p => p.inventory_id)
    const { data: recipeData } = await supabase.from('product_recipes').select('*, recipe_ingredients(*, raw_material:raw_material_id(*))').in('inventory_id', prodIds)
    if (!recipeData || recipeData.length === 0) { showMsg('No recipes found for selected products.'); setLoading(false); return }

    const agg = {}
    const batchDetails = []
    purchaseProducts.forEach(pp => {
      const recipe = recipeData.find(r => r.inventory_id === pp.inventory_id)
      if (!recipe) return
      batchDetails.push({ inventory_id: pp.inventory_id, batch_count: pp.batch_count })
      recipe.recipe_ingredients.forEach(ing => {
        const mat = ing.raw_material
        if (!mat) return
        const recipeQty = parseFloat(ing.quantity_used)
        const totalQty = recipeQty * pp.batch_count
        if (agg[mat.id]) { agg[mat.id].qty += totalQty; agg[mat.id].recipeQty += recipeQty }
        else { agg[mat.id] = { mat, qty: totalQty, recipeQty, unit: ing.unit_used } }
      })
    })

    const items = Object.values(agg).map(a => {
      const mat = a.mat
      if (mat.calculation_mode === 'fraction') {
        const perUnit = parseFloat(mat.fraction_grams) || 1
        const unitsNeeded = Math.ceil(a.qty / perUnit)
        const finalCost = calcIngredientCost(mat, unitsNeeded * perUnit)
        return {
          material_id: mat.id,
          material_name: mat.name,
          qty: unitsNeeded,
          unit: mat.unit,
          cost: finalCost,
          rawMaterial: mat,
          recipeQty: a.recipeQty,
          rawQty: a.qty,
          rawUnit: mat.fraction_unit,
        }
      }

      return {
        material_id: mat.id,
        material_name: mat.name,
        qty: a.qty,
        unit: a.unit,
        cost: calcIngredientCost(mat, a.qty),
        rawMaterial: mat,
        recipeQty: a.recipeQty,
      }
    })

    const totalCost = items.reduce((s, i) => s + i.cost, 0)
    setPurchaseSummary({ items, totalCost, batchDetails })
    setManualQty({})
    setLoading(false)
  }

  const handleSavePurchase = async () => {
    if (!purchaseSummary) return showMsg('Generate summary first')
    setLoading(true)
    const itemsToSave = purchaseSummary.items.map(i => {
      const qty = getDisplayQty(i)
      return { purchase_plan_id: null, raw_material_id: i.material_id, total_quantity_needed: qty, raw_quantity_needed: i.rawQty ?? null, unit: i.unit, raw_unit: i.rawUnit ?? null, estimated_cost: getItemCost(i) }
    })
    const totalCost = itemsToSave.reduce((s, i) => s + i.estimated_cost, 0)
    const { data: plan, error: planErr } = await supabase.from('purchase_plans').insert([{ user_id: session.user.id, notes: purchaseNotes || null, total_estimated_cost: totalCost }]).select().single()
    if (planErr) { showMsg('Error: ' + planErr.message); setLoading(false); return }
    await supabase.from('purchase_plan_items').insert(itemsToSave.map(i => ({ ...i, purchase_plan_id: plan.id })))
    await supabase.from('purchase_plan_batches').insert(purchaseSummary.batchDetails.map(b => ({ purchase_plan_id: plan.id, inventory_id: b.inventory_id, batch_count: b.batch_count })))
    showMsg('Purchase plan saved!')
    setPurchaseSummary(null); setPurchaseProducts([]); setPurchaseNotes(''); setManualQty({}); fetchPurchaseRecords()
    setLoading(false)
  }

  const handleDeletePurchase = async (purchaseId) => {
    if (!confirm('Delete this purchase record? This cannot be undone.')) return
    setLoading(true)
    const { error } = await supabase.from('purchase_plans').delete().eq('id', purchaseId)
    if (error) {
      showMsg('Error: ' + error.message)
      setLoading(false)
      return
    }
    showMsg('Purchase record deleted!')
    if (selectedPurchase?.id === purchaseId) setSelectedPurchase(null)
    fetchPurchaseRecords()
    setLoading(false)
  }

  const buildPdfRows = (items, manualQtys = {}) => {
    return items.map((item) => {
      const qty = manualQtys[item.material_id] !== undefined && manualQtys[item.material_id] !== ''
        ? parseFloat(manualQtys[item.material_id])
        : (item.qty ?? item.total_quantity_needed)
      const normalizedItem = {
        qty,
        unit: item.unit,
        rawMaterial: item.rawMaterial ?? item.raw_material,
        cost: parseFloat(item.cost ?? item.estimated_cost) || 0,
        material_name: item.material_name ?? item.raw_material?.name ?? 'Unknown',
        recipeQty: item.recipeQty ?? 0,
        rawQty: item.rawQty ?? item.raw_quantity_needed ?? null,
        rawUnit: item.rawUnit ?? item.raw_unit ?? item.raw_material?.fraction_unit ?? item.unit,
      }

      const display = formatPurchaseQty(normalizedItem)
      const itemCost = normalizedItem.rawMaterial && normalizedItem.rawMaterial.price != null
        ? getItemCost(normalizedItem)
        : normalizedItem.cost
      const qtyText = `${display.qty} ${display.unit}`
      const noteText = display.isRoundedUp ? display.note : ''
      return {
        material: normalizedItem.material_name,
        quantity: qtyText,
        unit: display.unit,
        cost: `RM ${itemCost.toFixed(2)}`,
        note: noteText,
      }
    })
  }

  const handleDownloadPDF = (record = null) => {
    const summary = record ? {
      batchDetails: record.purchase_plan_batches || [],
      items: record.purchase_plan_items || [],
      totalCost: parseFloat(record.total_estimated_cost || 0),
      notes: record.notes || '',
      planDate: record.plan_date || new Date().toISOString().slice(0, 10),
    } : purchaseSummary

    if (!summary || !summary.items || summary.items.length === 0) return showMsg('No purchase summary available to export.')

    const windowTitle = record ? `Purchase Record ${record.id || ''}` : 'Shopping List Preview'
    const rows = record ? buildPdfRows(summary.items) : buildPdfRows(summary.items, manualQty)
    const itemsHtml = rows.map((row) => {
      const noteHtml = row.note ? `<div class="item-note">${row.note}</div>` : ''
      return `<tr><td>${row.material}${noteHtml}</td><td>${row.quantity}</td><td>${row.cost}</td></tr>`
    }).join('')

    const batchesHtml = summary.batchDetails.map((b) => {
      const prod = products.find((p) => p.id === b.inventory_id)
      const productLabel = prod?.product_name || b.inventory?.product_name || 'Unknown'
      return `<div class="batch-line">• ${productLabel} — ${b.batch_count} batch(es)</div>`
    }).join('')

    const notesHtml = summary.notes ? `<div class="section-row"><span class="section-label">Notes:</span><span>${summary.notes}</span></div>` : ''
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${windowTitle}</title>
  <style>
    body { margin: 0; background: #f6f6f6; color: #111; font-family: Arial, sans-serif; }
    .page { width: 210mm; min-height: 297mm; padding: 20mm; margin: 10mm auto; background: #fff; box-shadow: 0 0 12px rgba(0,0,0,0.08); }
    h1 { margin: 0 0 8px; font-size: 22px; letter-spacing: -0.5px; }
    .meta { margin: 0 0 18px; font-size: 13px; color: #444; }
    .section-label { font-weight: 700; margin-right: 6px; }
    .section-row { margin-bottom: 10px; }
    .batch-line { margin-left: 14px; margin-bottom: 4px; font-size: 13px; }
    .preview-table { width: 100%; border-collapse: collapse; margin-top: 18px; }
    .preview-table th, .preview-table td { border: 1px solid #ccc; padding: 10px 12px; text-align: left; font-size: 13px; }
    .preview-table th { background: #f3f4f6; }
    .item-note { margin-top: 4px; font-size: 11px; color: #555; }
    .summary { margin-top: 16px; display: flex; justify-content: flex-end; gap: 10px; font-size: 14px; font-weight: 700; }
    .summary-label { color: #555; font-weight: 500; }
    @page { size: A4 portrait; margin: 20mm; }
    @media print {
      body { background: #fff; }
      .page { box-shadow: none; margin: 0; width: auto; min-height: auto; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="page">
    <h1>${windowTitle}</h1>
    <div class="meta">Date: ${summary.planDate}</div>
    ${notesHtml}
    <div class="section-row"><span class="section-label">Products / Batches:</span>${batchesHtml || 'None'}</div>
    <table class="preview-table">
      <thead><tr><th>Material</th><th>Qty Needed</th><th>Estimated Cost</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div class="summary"><span class="summary-label">TOTAL:</span><span>RM ${summary.totalCost.toFixed(2)}</span></div>
  </div>
</body>
</html>`

    const previewWindow = window.open('', '_blank')
    if (!previewWindow) return showMsg('Unable to open print preview. Please allow pop-ups for this site.')
    previewWindow.document.write(html)
    previewWindow.document.close()
    previewWindow.focus()
  }

  const viewPurchaseDetail = (record) => setSelectedPurchase(record)

  if (!hasAccess) return <div className="alert-unauthorized"><div><span>🔒 Access Denied: Unauthorized.</span></div></div>

  const tabs = [{ id: 'materials', label: '🧂 Materials' }, { id: 'recipes', label: '📖 Recipes' }, { id: 'purchase', label: '🛒 Purchase' }, { id: 'records', label: '📋 Records' }]

  return (
    <div className="page-shell relative">
      {toastMsg && <div className="toast-success"><div className="alert-toast"><span>{toastMsg}</span></div></div>}
      <div className="page-header sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="page-title">Production Planning</h1>
          <p className="page-subtitle">Manage materials, recipes, and purchase planning.</p>
        </div>
      </div>
      <div className="tabs tabs-bordered mb-6 gap-1 overflow-x-auto">
        {tabs.map(t => <button key={t.id} onClick={() => setActiveTab(t.id)} className={`tab tab-lg font-bold whitespace-nowrap ${activeTab === t.id ? 'tab-active' : ''}`}>{t.label}</button>)}
      </div>

      {/* TAB 1: MATERIALS */}
      {activeTab === 'materials' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => openMatModal(null)} className="btn btn-primary btn-sm font-bold gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Add Material
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {materials.map((m, idx) => (
              <div key={m.id || idx} className="content-card p-4 space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <h3 className="font-bold text-base break-words flex-1">{m.name}</h3>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openMatModal(m)} className="btn btn-xs btn-ghost">✏️</button>
                    <button onClick={() => handleDeleteMat(m.id)} className="btn btn-xs btn-ghost text-error">🗑️</button>
                  </div>
                </div>
                <div className="text-sm space-y-1.5">
                  <div className="flex justify-between items-center"><span className="opacity-60">Unit:</span><span className="font-bold">{m.unit}</span></div>
                  <div className="flex justify-between items-center"><span className="opacity-60">Price:</span><span className="font-bold text-accent text-base">RM {parseFloat(m.price).toFixed(2)}</span></div>
                  {m.calculation_mode === 'fraction' ? (
                    <>
                      <div className="flex justify-between items-center"><span className="opacity-60">1 {m.unit} =</span><span className="font-bold">{m.fraction_grams}{m.fraction_unit}</span></div>
                      <div className="flex justify-between items-center border-t border-base-200/40 pt-1.5 mt-1"><span className="opacity-60">Price/{m.fraction_unit}:</span><span className="font-mono font-bold text-xs text-warning">RM {(parseFloat(m.price) / parseFloat(m.fraction_grams || 1)).toFixed(4)}</span></div>
                    </>
                  ) : (
                    <div className="flex justify-between items-center border-t border-base-200/40 pt-1.5 mt-1"><span className="opacity-60">Mode:</span><span className="badge badge-sm badge-info font-bold">Unit</span></div>
                  )}
                </div>
              </div>
            ))}
            {materials.length === 0 && <div className="col-span-full text-center py-12 opacity-50 font-bold">No materials yet. Add one!</div>}
          </div>

          {matModal && (
            <div className="modal modal-open">
              <div className="modal-backdrop" onClick={() => setMatModal(false)}></div>
              <div className="modal-box--md" onClick={(e) => e.stopPropagation()}>
                <h3 className="font-bold text-xl text-primary mb-4">{editingMat ? '✏️ Edit Material' : '🧂 Add New Material'}</h3>
                <form onSubmit={handleSaveMat} className="space-y-4">
                  <div className="form-control"><label className="label-text font-semibold mb-1">Material Name *</label><input type="text" required placeholder="e.g., Minyak Masak" className="input input-bordered w-full rounded-xl" value={matName} onChange={(e) => setMatName(e.target.value)} /></div>
                  <div className="form-control"><label className="label-text font-semibold mb-1">Unit *</label>
                    <select className="select select-bordered w-full rounded-xl font-bold" value={matUnit} onChange={(e) => setMatUnit(e.target.value)}>
                      <option value="packet">packet</option><option value="kg">kg</option><option value="g">g</option><option value="liter">liter</option><option value="ml">ml</option><option value="botol">botol</option><option value="guni">guni</option><option value="tray">tray</option><option value="biji">biji</option><option value="kotak">kotak</option><option value="tin">tin</option><option value="peket">peket</option><option value="other">other</option>
                    </select>
                  </div>
                  <div className="form-control"><label className="label-text font-semibold mb-1">Price (RM) *</label><input type="number" step="0.01" required min="0" placeholder="0.00" className="input input-bordered w-full rounded-xl font-bold" value={matPrice} onChange={(e) => setMatPrice(e.target.value)} /></div>
                  <div className="form-control"><label className="label-text font-semibold mb-1">Calculation Mode</label>
                    <div className="flex gap-3">
                      <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="matMode" className="radio radio-primary" checked={matMode === 'unit'} onChange={() => setMatMode('unit')} /><span className="font-bold text-sm">Unit (by packet/biji/etc)</span></label>
                      <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="matMode" className="radio radio-warning" checked={matMode === 'fraction'} onChange={() => setMatMode('fraction')} /><span className="font-bold text-sm">Fraction (by g/ml)</span></label>
                    </div>
                  </div>
                  {matMode === 'fraction' && (
                    <div className="grid grid-cols-2 gap-3 p-3 bg-warning/10 rounded-xl border border-warning/20">
                      <div className="form-control"><label className="label-text font-semibold mb-1">1 unit = ? grams/ml</label><input type="number" step="any" required min="0" placeholder="e.g., 8000" className="input input-bordered w-full rounded-xl font-bold" value={matFractionG} onChange={(e) => setMatFractionG(e.target.value)} /></div>
                      <div className="form-control"><label className="label-text font-semibold mb-1">Unit</label>
                        <select className="select select-bordered w-full rounded-xl font-bold" value={matFractionUnit} onChange={(e) => setMatFractionUnit(e.target.value)}><option value="g">gram (g)</option><option value="ml">mililiter (ml)</option></select>
                      </div>
                    </div>
                  )}
                  <div className="modal-action gap-2 pt-2 border-t border-base-200">
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMatModal(false)}>Cancel</button>
                    <button type="submit" disabled={loading} className="btn btn-sm btn-primary text-white font-bold px-4">{loading ? 'Saving...' : editingMat ? 'Save Changes' : 'Add Material'}</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: RECIPES */}
      {activeTab === 'recipes' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="content-card p-4 space-y-3">
              <h2 className="font-bold text-base">1. Select Product</h2>
              <select className="select select-bordered w-full rounded-xl font-bold" value={selectedProduct?.id || ''} onChange={(e) => handleProductSelect(e.target.value)}>
                <option value="">-- Select Product --</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.product_name}</option>)}
              </select>
              {selectedProduct && (<div className="badge badge-ghost gap-1 p-3 font-bold w-full justify-center">{currentRecipeId ? '✅ Recipe ready — add ingredients on the side' : '🔄 Select a product to start'}</div>)}
            </div>
          </div>
          <div className="lg:col-span-2">
            {selectedProduct ? (
              <div className="space-y-4">
                <div className="content-card p-4">
                  <h2 className="font-bold text-base mb-3">2. Add Ingredient</h2>
                  <form onSubmit={handleAddIngredient} className="space-y-3">
                    <div><label className="label-text font-semibold mb-1 block">Material</label>
                      <SearchableSelect items={materials} value={ingMatId} onChange={(id) => { setIngMatId(id); const mat = materials.find(m => m.id === id); if (mat) setIngUnit(mat.calculation_mode === 'fraction' ? (mat.fraction_unit || 'g') : mat.unit) }} placeholder="Search material..." disabled={!currentRecipeId} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="form-control"><label className="label-text font-semibold mb-1">Qty Used</label><input type="number" step="any" required min="0" placeholder="e.g. 300" className="input input-bordered w-full rounded-xl font-bold" value={ingQty} onChange={(e) => setIngQty(e.target.value)} disabled={!currentRecipeId} /></div>
                      <div className="form-control"><label className="label-text font-semibold mb-1">Unit</label><input type="text" readOnly className="input input-bordered w-full rounded-xl font-bold bg-base-200 cursor-default" value={ingUnit} placeholder="-" disabled={!currentRecipeId} /></div>
                    </div>
                    <button type="submit" disabled={!currentRecipeId || !ingMatId || !ingQty} className="btn btn-accent btn-sm font-bold text-white">+ Add to Recipe</button>
                  </form>
                </div>
                <div className="content-card p-4">
                  <div className="flex justify-between items-center mb-3"><h2 className="font-bold text-base">Ingredients</h2><span className="badge badge-primary badge-lg font-bold p-3">RM {totalCostPerBatch.toFixed(2)} / batch</span></div>
                  {recipeIngredients.length === 0 ? (<div className="text-center py-6 opacity-50 font-bold">No ingredients added yet.</div>) : (
                    <div className="space-y-2">
                      {recipeIngredients.map((ing, idx) => (
                        <div key={ing.id || idx} className="flex items-center justify-between bg-base-200/50 p-3 rounded-xl">
                          <div className="flex-1"><span className="font-bold">{ing.raw_material?.name || 'Unknown'}</span><span className="ml-2 text-sm opacity-60">{ing.quantity_used} {ing.unit_used}</span></div>
                          <div className="flex items-center gap-3"><span className="font-mono text-sm font-bold text-accent">RM {calcIngredientCost(ing.raw_material, ing.quantity_used).toFixed(2)}</span><button onClick={() => handleRemoveIngredient(ing.id)} className="btn btn-xs btn-ghost text-error">✕</button></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (<div className="content-card p-8 text-center opacity-50 font-bold">Select a product on the left to manage its recipe.</div>)}
          </div>
        </div>
      )}

      {/* TAB 3: PURCHASE */}
      {activeTab === 'purchase' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="content-card p-4 space-y-3">
            <h2 className="font-bold text-base">Select Products & Set Batches</h2>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {products.map(p => {
                const checked = purchaseProducts.find(x => x.inventory_id === p.id)
                return (
                  <div key={p.id} className="flex items-center gap-3 bg-base-200/40 p-2.5 rounded-xl">
                    <input type="checkbox" className="checkbox checkbox-primary" checked={!!checked} onChange={() => handleTogglePurchaseProduct(p.id)} />
                    <span className="font-bold flex-1 text-sm">{p.product_name}</span>
                    {checked && (<div className="flex items-center gap-2"><span className="text-xs opacity-60">Batch:</span><input type="number" min="1" className="input input-xs input-bordered w-16 text-center font-bold" value={checked.batch_count} onChange={(e) => handleBatchChange(p.id, e.target.value)} /></div>)}
                  </div>
                )
              })}
              {products.length === 0 && <div className="text-center py-6 opacity-50">No products. Create in Inventory first.</div>}
            </div>
            <button onClick={handleGenerateSummary} disabled={purchaseProducts.length === 0 || loading} className="btn btn-primary w-full font-bold">{loading ? 'Calculating...' : '🔄 Generate Shopping List'}</button>
            {purchaseProducts.length > 0 && (<button onClick={() => setPurchaseProducts([])} className="btn btn-ghost btn-sm w-full">Clear Selection</button>)}
          </div>
          <div className="content-card p-4 space-y-3">
            <h2 className="font-bold text-base">Shopping Summary</h2>
            {purchaseSummary ? (
              <div className="space-y-3">
                <div className="bg-base-200/50 p-3 rounded-xl text-sm">
                  {purchaseSummary.batchDetails.map((b, i) => { const prod = products.find(p => p.id === b.inventory_id); return <div key={i} className="font-bold">• {prod?.product_name} — {b.batch_count} batch(es)</div> })}
                </div>
                <div className="overflow-x-auto">
                  <table className="table w-full table-sm">
                    <thead className="bg-base-200">
                      <tr>
                        <th>Material</th>
                        <th className="text-center">Original</th>
                        <th className="text-center">Buy</th>
                        <th className="text-center">Unit</th>
                        <th className="text-right">Cost (RM)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseSummary.items.map((item, i) => {
                        const display = formatPurchaseQty(item)
                        const currentQty = getDisplayQty(item)
                        const isManualQty = manualQty[item.material_id] !== undefined && manualQty[item.material_id] !== ''
                        const originalQtyText = item.rawQty != null && item.rawUnit ? `${parseFloat(item.rawQty).toFixed(2)} ${item.rawUnit}` : `${item.qty.toFixed(2)} ${item.unit}`
                        const currentCost = getItemCost(item)
                        return (
                          <tr key={i} className="hover:bg-base-200/30">
                            <td className="font-bold">{item.material_name}</td>
                            <td className="text-center text-sm opacity-70">{originalQtyText}</td>
                            <td className="text-center">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className={`input input-xs input-bordered w-20 text-center ${isManualQty ? 'border-warning' : ''}`}
                                value={isManualQty ? manualQty[item.material_id] : ''}
                                onChange={(e) => updateManualQty(item.material_id, e.target.value)}
                                placeholder={item.qty.toFixed(2)}
                              />
                            </td>
                            <td className="text-center opacity-60">{display.unit}</td>
                            <td className="text-right font-mono font-bold text-accent">RM {currentCost.toFixed(2)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-base-300 pt-3 flex justify-between items-center">
                  <span className="font-black text-lg">TOTAL</span>
                  <span className="font-mono font-black text-xl text-primary">RM {purchaseSummary.items.reduce((sum, item) => sum + getItemCost(item), 0).toFixed(2)}</span>
                </div>
                <div className="form-control">
                  <label className="label-text font-semibold mb-1">Notes (optional)</label>
                  <input type="text" className="input input-bordered w-full rounded-xl text-sm" placeholder="e.g., Purchase for weekend event" value={purchaseNotes} onChange={(e) => setPurchaseNotes(e.target.value)} />
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={handleSavePurchase} disabled={loading} className="btn btn-accent text-white font-bold w-full">💾 Save Record</button>
                </div>
              </div>
            ) : (<div className="text-center py-12 opacity-50 font-bold">Select products and batches on the left, then click Generate.</div>)}
          </div>
        </div>
      )}

      {/* TAB 4: RECORDS */}
      {activeTab === 'records' && (
        <div>
          {selectedPurchase ? (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <button onClick={() => setSelectedPurchase(null)} className="btn btn-sm btn-ghost">← Back to Records</button>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => handleDeletePurchase(selectedPurchase.id)} className="btn btn-sm btn-error text-white">🗑️ Delete</button>
                  <button onClick={() => handleDownloadPDF(selectedPurchase)} className="btn btn-sm btn-primary text-white">📥 Download PDF</button>
                </div>
              </div>
              <div className="content-card p-4 space-y-3">
                <div className="flex justify-between items-start"><div><h2 className="font-bold text-lg">Purchase Record</h2><p className="text-sm opacity-60">{selectedPurchase.plan_date} {selectedPurchase.notes && `— ${selectedPurchase.notes}`}</p></div><span className="font-mono font-black text-xl text-primary">RM {parseFloat(selectedPurchase.total_estimated_cost || 0).toFixed(2)}</span></div>
                <div className="border-t border-base-200 pt-3"><h3 className="font-bold text-sm mb-2">Batches:</h3>{(selectedPurchase.purchase_plan_batches || []).map((b, i) => { const prod = products.find(p => p.id === b.inventory_id); return <div key={i} className="text-sm font-bold">• {prod?.product_name || b.inventory?.product_name || 'Unknown'} — {b.batch_count} batch(es)</div> })}</div>
                <div className="border-t border-base-200 pt-3">
                  <h3 className="font-bold text-sm mb-3">Materials:</h3>
                  <div className="overflow-x-auto">
                    <table className="table w-full table-compact table-zebra text-sm">
                      <thead>
                        <tr>
                          <th>Material</th>
                          <th className="text-center">Qty</th>
                          <th className="text-center">Unit</th>
                          <th className="text-right">Cost (RM)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedPurchase.purchase_plan_items || []).map((item, i) => {
                          const display = formatPurchaseQty({
                            qty: item.total_quantity_needed,
                            unit: item.unit,
                            rawQty: item.raw_quantity_needed || null,
                            rawUnit: item.raw_unit || item.raw_material?.fraction_unit || null,
                          })
                          return (
                            <tr key={i}>
                              <td className="font-bold">{item.raw_material?.name || 'Unknown'}</td>
                              <td className="text-center text-sm opacity-80">{display.qty}</td>
                              <td className="text-center text-sm opacity-80">{display.unit}</td>
                              <td className="text-right font-mono font-bold text-accent">RM {parseFloat(item.estimated_cost).toFixed(2)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {purchaseRecords.length === 0 ? (<div className="text-center py-12 opacity-50 font-bold">No purchase records yet.</div>) : (
                purchaseRecords.map((rec, i) => (
                  <div key={rec.id || i} className="content-card p-4 cursor-pointer hover:bg-base-200/50 transition-colors" onClick={() => viewPurchaseDetail(rec)}>
                    <div className="flex justify-between items-center">
                      <div><span className="font-bold text-sm">{rec.plan_date}</span>{rec.notes && <span className="ml-2 text-sm opacity-60">— {rec.notes}</span>}</div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-primary">RM {parseFloat(rec.total_estimated_cost || 0).toFixed(2)}</span>
                        <button onClick={(e) => { e.stopPropagation(); handleDeletePurchase(rec.id) }} className="btn btn-xs btn-error text-white">✕</button>
                      </div>
                    </div>
                    <div className="text-xs opacity-50 mt-1">{(rec.purchase_plan_batches || []).length} product(s) · {(rec.purchase_plan_items || []).length} material(s)</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
