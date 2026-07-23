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
import ToastBar from './components/ToastBar'
import { useToast } from './utils/useToast'

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
  const [currentTheme, setCurrentTheme] = useState('dim')

  useEffect(() => {
    localStorage.setItem('bol_active_page', activePage)
  }, [activePage])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { 
      setSession(session) 
    })
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (!session) {
        setUserRole('default')
        setAllowedModules({})
        setMustChangePassword(false)
        localStorage.removeItem('bol_active_page')
      }
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
    if (perms) {
      const allowedMap = {}
      perms.forEach(p => { allowedMap[p.module_id] = p.is_allowed })
      setAllowedModules(allowedMap)
    }
  }

  useEffect(() => {
    if (session?.user?.id) loadUserPermissions(session.user.id)
  }, [session?.user?.id])

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

  const handleThemeChange = async (newMode) => {
    setThemeMode(newMode)
    if (session) {
      await supabase.from('profiles').upsert({ id: session.user.id, theme_mode: newMode, updated_at: new Date().toISOString() })
    }
  }

  const handleLogout = async () => { 
    await supabase.auth.signOut() 
  }

  const handleForcePasswordSubmit = async (e) => {
    e.preventDefault()
    if (forceNewPassword !== forceConfirmPassword) return showToast('Passwords do not match!', 'error')
    if (forceNewPassword.length < 6) return showToast('Password must be at least 6 characters.', 'error')
    setForceLoading(true)
    const { error } = await supabase.auth.updateUser({ password: forceNewPassword })
    if (error) { showToast(error.message, 'error') } else {
      await supabase.from('profiles').update({ requires_password_change: false }).eq('id', session.user.id)
      setMustChangePassword(false)
      setActivePage('home')
      showToast('Password updated successfully!')
    }
    setForceLoading(false)
  }

  useEffect(() => {
    localStorage.setItem('bol_theme_mode', themeMode)
    const hour = new Date().getHours()
    setCurrentTheme(themeMode === 'auto' ? (hour >= 19 || hour < 7 ? 'dim' : 'light') : (themeMode === 'dark' ? 'dim' : 'light'))
  }, [themeMode])

  if (!session) return <Login onLoginSuccess={() => setActivePage('home')} />

  if (mustChangePassword) {
    return (
      <div data-theme={currentTheme} className="min-h-screen flex items-center justify-center bg-base-300 p-4 font-sans">
        <div className="card w-full max-w-md shadow-2xl bg-base-100 border border-base-200">
          <form onSubmit={handleForcePasswordSubmit} className="card-body p-6">
            <h2 className="card-title text-xl font-black text-error justify-center">🔒 Update Password</h2>
            <input type="password" required placeholder="New Password" className="input input-bordered w-full" value={forceNewPassword} onChange={(e) => setForceNewPassword(e.target.value)} />
            <input type="password" required placeholder="Confirm New Password" className="input input-bordered w-full" value={forceConfirmPassword} onChange={(e) => setForceConfirmPassword(e.target.value)} />
            <button type="submit" disabled={forceLoading} className="btn btn-error text-white font-bold w-full mt-4">Update Password</button>
          </form>
        </div>
      </div>
    )
  }

  const getActivePageName = () => {
    if (activePage === 'home') return 'Home'
    if (activePage === 'records') return 'Ads Record Manager'
    if (activePage === 'inventory') return 'Inventory Manager'
    if (activePage === 'receiptManager') return 'Receipt Manager'
    if (activePage === 'wageCalculator') return 'Staff Wage Calculator'
    if (activePage === 'myWage') return 'My Wage'
    if (activePage === 'productionPlanning') return 'Production Planning'
    if (activePage === 'settings') return 'Settings'
    if (activePage === 'privileges') return 'Privileges'
    return 'Home'
  }

  return (
    <>
      <ToastBar toast={toast} onClose={hideToast} />
      <div data-theme={currentTheme} className="min-h-screen bg-base-300 text-base-content font-sans transition-colors duration-300">
        
        {/* TOPBAR NAVIGATION - Minimalist */}
        <div className="bg-base-100 border-b border-base-200 h-14 flex items-center justify-between px-4 relative z-30">
          <button onClick={() => setActivePage('home')} className="text-lg font-bold text-primary btn btn-ghost px-2">
            B.O.L.
          </button>
          
          <div className="flex items-center gap-1">
            {/* DESKTOP VERSION - Minimalist */}
            <div className="hidden md:flex gap-1">
              <button onClick={() => setActivePage('home')} className={`btn btn-sm ${activePage === 'home' ? 'btn-primary' : 'btn-ghost'}`}>Home</button>
              {canAccessRecords && <button onClick={() => setActivePage('records')} className={`btn btn-sm ${activePage === 'records' ? 'btn-primary' : 'btn-ghost'}`}>Ads Record Manager</button>}
              {canAccessInventory && <button onClick={() => setActivePage('inventory')} className={`btn btn-sm ${activePage === 'inventory' ? 'btn-primary' : 'btn-ghost'}`}>Inventory Manager</button>}
              {canAccessReceiptManager && <button onClick={() => setActivePage('receiptManager')} className={`btn btn-sm ${activePage === 'receiptManager' ? 'btn-primary' : 'btn-ghost'}`}>Receipt Manager</button>}
              {canAccessWageCalculator && <button onClick={() => setActivePage('wageCalculator')} className={`btn btn-sm ${activePage === 'wageCalculator' ? 'btn-primary' : 'btn-ghost'}`}>Staff Wage Calculator</button>}
              {canAccessMyWage && <button onClick={() => setActivePage('myWage')} className={`btn btn-sm ${activePage === 'myWage' ? 'btn-primary' : 'btn-ghost'}`}>My Wage</button>}
              {canAccessProductionPlanning && <button onClick={() => setActivePage('productionPlanning')} className={`btn btn-sm ${activePage === 'productionPlanning' ? 'btn-primary' : 'btn-ghost'}`}>Production Planning</button>}
              <button onClick={() => setActivePage('settings')} className={`btn btn-sm ${activePage === 'settings' ? 'btn-primary' : 'btn-ghost'}`}>Settings</button>
              {canAccessPrivileges && <button onClick={() => setActivePage('privileges')} className={`btn btn-sm ${activePage === 'privileges' ? 'btn-primary' : 'btn-ghost'}`}>Privileges</button>}
              <button onClick={handleLogout} className="btn btn-ghost btn-sm">Log Out</button>
            </div>
            
            {/* MOBILE VERSION - Bottom Navigation */}
            <div className="md:hidden mobile-nav">
              <button onClick={() => setActivePage('home')} className={`mobile-nav-btn ${activePage === 'home' ? 'text-primary' : ''}`} title="Home">🏠</button>
              {canAccessRecords && <button onClick={() => setActivePage('records')} className={`mobile-nav-btn ${activePage === 'records' ? 'text-primary' : ''}`} title="Ads Record Manager">📊</button>}
              {canAccessInventory && <button onClick={() => setActivePage('inventory')} className={`mobile-nav-btn ${activePage === 'inventory' ? 'text-primary' : ''}`} title="Inventory Manager">📦</button>}
              {canAccessReceiptManager && <button onClick={() => setActivePage('receiptManager')} className={`mobile-nav-btn ${activePage === 'receiptManager' ? 'text-primary' : ''}`} title="Receipt Manager">🧾</button>}
              {canAccessWageCalculator && <button onClick={() => setActivePage('wageCalculator')} className={`mobile-nav-btn ${activePage === 'wageCalculator' ? 'text-primary' : ''}`} title="Staff Wage Calculator">💰</button>}
              {canAccessProductionPlanning && <button onClick={() => setActivePage('productionPlanning')} className={`mobile-nav-btn ${activePage === 'productionPlanning' ? 'text-primary' : ''}`} title="Production Planning">📋</button>}
              <button onClick={() => setActivePage('settings')} className={`mobile-nav-btn ${activePage === 'settings' ? 'text-primary' : ''}`} title="Settings">⚙️</button>
            </div>
          </div>
        </div>
        
        {/* MAIN CONTENT */}
        <div className="p-4 md:p-6 max-w-7xl mx-auto pb-20 md:pb-8">
          {activePage === 'home' && (
             <div className="page-shell">
               <div className="page-header">
                 <h1 className="page-title">Dashboard Overview</h1>
                 <p className="page-subtitle">Your dynamic permission-based control workspace.</p>
               </div>
               
               {/* KAD GRID UTAMA - Minimalist */}
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                   {canAccessRecords && (
                    <button onClick={() => setActivePage('records')} className="minimal-card flex flex-col items-center text-center gap-4 p-6">
                      <div className="minimal-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                      </div>
                      <div>
                        <h2 className="font-bold text-base md:text-lg">Ads Record Manager</h2>
                        <p className="text-xs opacity-60 mt-1 hidden sm:block">Track payments, amounts, and manage financial outputs.</p>
                      </div>
                    </button>
                  )}
                  
                  {canAccessInventory && (
                    <button onClick={() => setActivePage('inventory')} className="minimal-card flex flex-col items-center text-center gap-4 p-6">
                      <div className="minimal-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>
                      </div>
                      <div>
                        <h2 className="font-bold text-base md:text-lg">Inventory Manager</h2>
                        <p className="text-xs opacity-60 mt-1 hidden sm:block">Monitor product batches and current physical stock levels.</p>
                      </div>
                    </button>
                  )}

                  {canAccessReceiptManager && (
                    <button onClick={() => setActivePage('receiptManager')} className="minimal-card flex flex-col items-center text-center gap-4 p-6">
                      <div className="minimal-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" /></svg>
                      </div>
                      <div>
                        <h2 className="font-bold text-base md:text-lg">Receipt Manager</h2>
                        <p className="text-xs opacity-60 mt-1 hidden sm:block">Manage production receipt records and generate summary text formats.</p>
                      </div>
                    </button>
                  )}

                   {canAccessWageCalculator && (
                    <button onClick={() => setActivePage('wageCalculator')} className="minimal-card flex flex-col items-center text-center gap-4 p-6">
                      <div className="minimal-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-3-3V18m-3-3V18M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM10.5 8.25h3l-3 4.5h3" /></svg>
                      </div>
                      <div>
                        <h2 className="font-bold text-base md:text-lg">Staff Wage Calculator</h2>
                        <p className="text-xs opacity-60 mt-1 hidden sm:block">Calculate staff wages based on unpaid cooking production batches.</p>
                      </div>
                    </button>
                  )}

                   {canAccessMyWage && (
                    <button onClick={() => setActivePage('myWage')} className="minimal-card flex flex-col items-center text-center gap-4 p-6">
                      <div className="minimal-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-3-3V18m-3-3V18M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM10.5 8.25h3l-3 4.5h3" /></svg>
                      </div>
                      <div>
                        <h2 className="font-bold text-base md:text-lg">My Wage</h2>
                        <p className="text-xs opacity-60 mt-1 hidden sm:block">View your wage records and payment history.</p>
                      </div>
                    </button>
                  )}

                  {canAccessProductionPlanning && (
                    <button onClick={() => setActivePage('productionPlanning')} className="minimal-card flex flex-col items-center text-center gap-4 p-6">
                      <div className="minimal-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
                      </div>
                      <div>
                        <h2 className="font-bold text-base md:text-lg">Production Planning</h2>
                        <p className="text-xs opacity-60 mt-1 hidden sm:block">Manage materials, recipes, and purchase planning.</p>
                      </div>
                    </button>
                  )}
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
    </>
  )
}

export default App