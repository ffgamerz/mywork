import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Login from './Login'
import AdsRecordManager from './AdsRecordManager'
import Settings from './Settings'
import Privileges from './Privileges'
import Inventory from './Inventory'
import ReceiptManager from './ReceiptManager' 
import WageCalculator from './WageCalculator'
import ProductionPlanning from './ProductionPlanning'
import MyWage from './MyWage'
import { useToast } from './utils/useToast'

const SIDEBAR_WIDTH = 240

const navItems = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'records', label: 'Ads Records', icon: 'bar_chart' },
  { id: 'inventory', label: 'Inventory', icon: 'inventory_2' },
  { id: 'inventoryNew', label: 'Inventory (New)', icon: 'inventory_2' },
  { id: 'receiptManager', label: 'Receipts', icon: 'receipt' },
  { id: 'wageCalculator', label: 'Wages', icon: 'payments' },
  { id: 'myWage', label: 'My Wage', icon: 'attach_money' },
  { id: 'productionPlanning', label: 'Planning', icon: 'calendar_month' },
  { id: 'privileges', label: 'Privileges', icon: 'lock' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

const cardColors = {
  records: { bg: 'bg-accent-records', color: 'text-accent-records', icon: 'campaign' },
  inventory: { bg: 'bg-accent-inventory', color: 'text-accent-inventory', icon: 'warehouse' },
  receiptManager: { bg: 'bg-accent-receipt', color: 'text-accent-receipt', icon: 'receipt_long' },
  wageCalculator: { bg: 'bg-accent-wage', color: 'text-accent-wage', icon: 'paid' },
  myWage: { bg: 'bg-accent-mywage', color: 'text-accent-mywage', icon: 'account_balance_wallet' },
  productionPlanning: { bg: 'bg-accent-planning', color: 'text-accent-planning', icon: 'edit_note' },
}

function App() {
  const { toast, showToast, hideToast } = useToast()
  const [session, setSession] = useState(null)
  const [activePage, setActivePage] = useState(() => localStorage.getItem('bol_active_page') || 'home')
  const [userRole, setUserRole] = useState('default')
  const [allowedModules, setAllowedModules] = useState({})
  
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const [forceNewPassword, setForceNewPassword] = useState('')
  const [forceConfirmPassword, setForceConfirmPassword] = useState('')
  const [forceLoading, setForceLoading] = useState(false)

  const [themeMode, setThemeMode] = useState(() => localStorage.getItem('bol_theme_mode') || 'dark')

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

  useEffect(() => { localStorage.setItem('bol_active_page', activePage) }, [activePage])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (!session) { setUserRole('default'); setAllowedModules({}); setMustChangePassword(false); localStorage.removeItem('bol_active_page') }
    })
    return () => subscription.unsubscribe()
  }, [])

  const loadUserPermissions = async (userId) => {
    if (!userId) return
    setAllowedModules({})
    const { data: prof } = await supabase.from('profiles').select('theme_mode, role, requires_password_change, preferred_language').eq('id', userId).single()
    if (prof) {
      if (prof.theme_mode) setThemeMode(prof.theme_mode)
      const dbRole = String(prof.role || 'default').trim().toLowerCase()
      setUserRole(dbRole)
      setMustChangePassword(!!prof.requires_password_change)
    }
    const { data: perms = [] } = await supabase.from('user_permissions').select('module_id, is_allowed').eq('user_id', userId)
    if (perms) { const allowedMap = {}; perms.forEach(p => { allowedMap[p.module_id] = p.is_allowed }); setAllowedModules(allowedMap) }
  }

  useEffect(() => { if (session?.user?.id) loadUserPermissions(session.user.id) }, [session?.user?.id])

  const isSuperAdmin = userRole === 'super_admin'
  const canAccessRecords = isSuperAdmin || allowedModules['records'] === true
  const canAccessPrivileges = isSuperAdmin || allowedModules['privileges'] === true
  const canAccessInventory = isSuperAdmin || allowedModules['inventory'] === true
  const canAccessReceiptManager = isSuperAdmin || allowedModules['receiptManager'] === true 
  const canAccessWageCalculator = isSuperAdmin || allowedModules['wageCalculator'] === true 
  const canAccessMyWage = isSuperAdmin || allowedModules['myWage'] === true 
  const canAccessProductionPlanning = isSuperAdmin || allowedModules['productionPlanning'] === true 

  useEffect(() => {
    if (!session) return
    if (activePage === 'records' && !canAccessRecords) setActivePage('home')
    if (activePage === 'privileges' && !canAccessPrivileges) setActivePage('home')
    if (activePage === 'inventory' && !canAccessInventory) setActivePage('home')
    if (activePage === 'receiptManager' && !canAccessReceiptManager) setActivePage('home')
    if (activePage === 'wageCalculator' && !canAccessWageCalculator) setActivePage('home')
    if (activePage === 'myWage' && !canAccessMyWage) setActivePage('home')
    if (activePage === 'productionPlanning' && !canAccessProductionPlanning) setActivePage('home')
  }, [activePage, userRole, allowedModules, session])

  useEffect(() => { setMobileDrawerOpen(false) }, [activePage])

  const handleThemeChange = async (newMode) => {
    setThemeMode(newMode)
    if (session) await supabase.from('profiles').upsert({ id: session.user.id, theme_mode: newMode, updated_at: new Date().toISOString() })
  }

  const handleLogout = async () => { await supabase.auth.signOut() }

  const handleForcePasswordSubmit = async (e) => {
    e.preventDefault()
    if (forceNewPassword !== forceConfirmPassword) return showToast('Passwords do not match!', 'error')
    if (forceNewPassword.length < 6) return showToast('Password must be at least 6 characters.', 'error')
    setForceLoading(true)
    const { error } = await supabase.auth.updateUser({ password: forceNewPassword })
    if (error) { showToast(error.message, 'error') } else {
      await supabase.from('profiles').update({ requires_password_change: false }).eq('id', session.user.id)
      setMustChangePassword(false); setActivePage('home'); showToast('Password updated successfully!')
    }
    setForceLoading(false)
  }

  if (!session) return <Login onLoginSuccess={() => setActivePage('home')} />

  if (mustChangePassword) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center bg-dark-alt p-3">
        <div className="card p-4 max-w-448 w-100">
          <form onSubmit={handleForcePasswordSubmit}>
            <div className="d-flex flex-column gap-3">
              <h6 className="text-center text-error fw-bold"><span className="material-symbols-outlined me-1" style={{fontSize:'16px'}}>lock</span> Update Password Required</h6>
              <div className="mb-3">
                <label className="form-label">New Password</label>
                <input type="password" className="form-control" required value={forceNewPassword} onChange={(e) => setForceNewPassword(e.target.value)} />
              </div>
              <div className="mb-3">
                <label className="form-label">Confirm New Password</label>
                <input type="password" className="form-control" required value={forceConfirmPassword} onChange={(e) => setForceConfirmPassword(e.target.value)} />
              </div>
              <button type="submit" className="btn btn-primary w-100 fw-bold py-2" disabled={forceLoading}>
                {forceLoading ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  const visibleNavItems = navItems.filter(item => {
    if (item.id === 'home' || item.id === 'settings') return true
    if (item.id === 'records') return canAccessRecords
    if (item.id === 'inventory') return canAccessInventory
    if (item.id === 'receiptManager') return canAccessReceiptManager
    if (item.id === 'wageCalculator') return canAccessWageCalculator
    if (item.id === 'myWage') return canAccessMyWage
    if (item.id === 'productionPlanning') return canAccessProductionPlanning
    if (item.id === 'privileges') return canAccessPrivileges
    return false
  })

  const visibleCards = [
    { id: 'records', label: 'Ads Records', desc: 'Track transaction details and payment status for your records.', visible: canAccessRecords },
    { id: 'inventory', label: 'Inventory', desc: 'View inventory levels with fast access to materials and supplies.', visible: canAccessInventory },
    { id: 'receiptManager', label: 'Receipts', desc: 'Open receipts, export details, and manage collection status.', visible: canAccessReceiptManager },
    { id: 'wageCalculator', label: 'Wages', desc: 'Calculate staff pay and review unpaid production totals.', visible: canAccessWageCalculator },
    { id: 'myWage', label: 'My Wage', desc: 'Check your personal wage records and payment history.', visible: canAccessMyWage },
    { id: 'productionPlanning', label: 'Planning', desc: 'Manage materials, recipes, and purchase planning.', visible: canAccessProductionPlanning },
  ].filter(c => c.visible)

  const handleNavigate = (id) => { setActivePage(id); setAvatarMenuOpen(false); setMobileDrawerOpen(false) }

  const sidebarContent = (
    <div className="d-flex flex-column h-100 bg-sidebar-bg">
      <div className="sidebar-logo">
        <button onClick={() => handleNavigate('home')} className="btn btn-link text-decoration-none p-0 fs-6 fw-semibold text-white">B.O.L. FOOD SERVICES</button>
      </div>
      <div className="sidebar-nav">
        {visibleNavItems.map((item) => (
          <button key={item.id} onClick={() => handleNavigate(item.id)}
            className={`nav-link w-100 text-start border-0 bg-transparent ${activePage === item.id ? 'active' : ''}`}>
            <span className="nav-icon material-symbols-outlined">{item.icon}</span><span>{item.label}</span>
          </button>
        ))}
      </div>
      <div className="mt-auto p-3 border-top border-default">
        <button onClick={handleLogout} className="nav-link w-100 text-start border-0 bg-transparent">
          <span className="nav-icon material-symbols-outlined">logout</span><span>Logout</span>
        </button>
      </div>
    </div>
  )

  return (
    <div className="d-flex min-vh-100 bg-body">
      <div className={`sidebar d-none d-md-flex flex-column ${!sidebarOpen ? 'sidebar-hidden' : ''}`}>
        {sidebarContent}
      </div>

      {mobileDrawerOpen && (
        <>
          <div className="modal-backdrop show pos-fixed z-1040" onClick={() => setMobileDrawerOpen(false)}></div>
          <div className="sidebar d-md-none z-1050 d-flex" onClick={(e) => e.stopPropagation()}>
            {sidebarContent}
            <button className="btn btn-sm btn-link pos-absolute text-white top-8 right-neg-40" onClick={() => setMobileDrawerOpen(false)}><span className="material-symbols-outlined">close</span></button>
          </div>
        </>
      )}

      <div className={`main-content ${!sidebarOpen ? 'sidebar-collapsed' : ''}`}>
        <div className="topbar">
          <div className="topbar-content">
            <div className="d-flex align-items-center gap-2">
              <button className="btn btn-sm btn-link d-flex align-items-center justify-content-center w-32 h-32 p-0"
                onClick={() => { if (window.innerWidth < 768) setMobileDrawerOpen(prev => !prev); else setSidebarOpen(prev => !prev) }}>
                <span className="material-symbols-outlined">menu</span>
              </button>
              <div className="fw-medium text-white d-md-none d-inline text-14">
                {navItems.find(n => n.id === activePage)?.label || 'Home'}
              </div>
              <div className="fw-medium text-white d-none d-md-inline text-16">
                {navItems.find(n => n.id === activePage)?.label || 'Home'}
              </div>
            </div>
            <div className="d-flex align-items-center gap-2">
              <div className="d-none d-md-block text-muted text-13">{userRole}</div>
              <div className="dropdown">
                <button className="btn btn-sm p-0 border-0 bg-transparent"
                  onClick={() => setAvatarMenuOpen(!avatarMenuOpen)} data-bs-toggle="dropdown" aria-expanded={avatarMenuOpen}>
                  <div className="avatar-custom bg-blue-badge">{session?.user?.email?.charAt(0)?.toUpperCase() || 'F'}</div>
                </button>
                {avatarMenuOpen && (
                  <div className="dropdown-menu dropdown-menu-end show min-w-200">
                    <div className="px-3 py-2 border-bottom border-default">
                      <div className="fw-semibold text-white text-13">{session?.user?.email}</div>
                      <div className="text-muted text-11">{userRole}</div>
                    </div>
                    {visibleNavItems.map((item) => (
                      <button key={item.id} className={`dropdown-item d-flex align-items-center gap-2 ${activePage === item.id ? 'active' : ''}`} onClick={() => handleNavigate(item.id)}>
                        <span className="w-20 text-center material-symbols-outlined">{item.icon}</span>{item.label}
                      </button>
                    ))}
                    <div className="dropdown-divider"></div>
                    <button className="dropdown-item d-flex align-items-center gap-2" onClick={() => { handleNavigate('settings'); setAvatarMenuOpen(false) }}>
                      <span className="w-20 text-center material-symbols-outlined">settings</span>Settings
                    </button>
                    <button className="dropdown-item d-flex align-items-center gap-2 text-error" onClick={handleLogout}>
                      <span className="w-20 text-center material-symbols-outlined">logout</span>Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-3 p-md-4 flex-grow-1 bg-body">
          {activePage === 'home' && (
            <div className="max-w-1024 mx-auto">
              <div className="mb-4">
                <h1 className="fw-400 tracking-tight text-white mb-1 text-24 d-none d-md-block text-32">
                  <span className="material-symbols-outlined me-1" style={{fontSize:'24px',verticalAlign:'middle',color:'#3b82f6'}}>dashboard</span> Hello, {session?.user?.email?.split('@')[0] || 'ffgamerz'}
                </h1>
                <h1 className="fw-400 tracking-tight text-white mb-1 d-md-none text-24">
                  <span className="material-symbols-outlined me-1" style={{fontSize:'24px',verticalAlign:'middle',color:'#3b82f6'}}>dashboard</span> Hello, {session?.user?.email?.split('@')[0] || 'ffgamerz'}
                </h1>
                <p className="text-muted text-14">What would you like to build or explore today?</p>
              </div>

              <div className="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3 mb-5">
                {visibleCards.map((card) => {
                  const colors = cardColors[card.id]
                  return (
                      <div className="col" key={card.id}>
                      <div className="card card-hover p-3 cursor-pointer h-100" onClick={() => setActivePage(card.id)}>
                        <div className="d-flex align-items-center justify-content-center mb-3 w-36 h-36 rounded-10 bg-white-08">
                          <span className="material-symbols-outlined card-icon text-white-70">{colors.icon}</span>
                        </div>
                        <div className="fw-medium text-white text-14 mb-1">{card.label}</div>
                        <div className="text-muted text-12 lh-15">{card.desc}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          
          {activePage === 'records' && canAccessRecords && <AdsRecordManager session={session} />}
          {activePage === 'settings' && <Settings session={session} themeMode={themeMode} setThemeMode={handleThemeChange} />}
          {activePage === 'privileges' && canAccessPrivileges && <Privileges session={session} />}
          {activePage === 'inventory' && canAccessInventory && <Inventory session={session} userRole={userRole} allowedModules={allowedModules} />}
          {activePage === 'receiptManager' && canAccessReceiptManager && <ReceiptManager session={session} userRole={userRole} allowedModules={allowedModules} />}
          {activePage === 'wageCalculator' && canAccessWageCalculator && <WageCalculator session={session} userRole={userRole} allowedModules={allowedModules} />}
          {activePage === 'myWage' && canAccessMyWage && <MyWage session={session} />}
          {activePage === 'productionPlanning' && canAccessProductionPlanning && <ProductionPlanning session={session} userRole={userRole} allowedModules={allowedModules} />}
        </div>
      </div>

      {toast.visible && (
        <div className="toast-container-custom">
          <div className={`d-flex align-items-center gap-2 px-3 py-2 rounded-pill shadow-lg ${toast.type === 'success' ? 'bg-success text-white' : toast.type === 'error' ? 'bg-error text-white' : 'bg-blue text-white'}`}>
              <span>{toast.message}</span>
              <button onClick={hideToast} className="btn btn-sm p-0 border-0 d-flex align-items-center justify-content-center bg-transparent text-white w-24 h-24 rounded-circle"><span className="material-symbols-outlined" style={{fontSize:'16px'}}>close</span></button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App