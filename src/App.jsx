import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Login from './Login'
import RecordManager from './RecordManager'
import Settings from './Settings'
import Privileges from './Privileges'
import Inventory from './Inventory' 
import ReceiptManager from './ReceiptManager' 
import WageCalculator from './WageCalculator' 
import { translations } from './translations'

function App() {
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
  const [lang, setLang] = useState(() => localStorage.getItem('bol_lang') || 'en')

  const t = (key) => translations[lang]?.[key] || translations['en'][key]

  useEffect(() => {
    localStorage.setItem('bol_active_page', activePage)
  }, [activePage])

  useEffect(() => {
    localStorage.setItem('bol_lang', lang)
  }, [lang])

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
        localStorage.removeItem('bol_lang')
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
      if (prof.preferred_language) setLang(prof.preferred_language)
      
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
  
  // KEPERLUAN BAHARU: Super Admin automatik lepas semua, yang lain (termasuk admin) wajib ada privilege
  const canAccessRecords = isSuperAdmin || allowedModules['records'] === true
  const canAccessPrivileges = isSuperAdmin || allowedModules['privileges'] === true
  const canAccessInventory = isSuperAdmin || allowedModules['inventory'] === true
  const canAccessReceiptManager = isSuperAdmin || allowedModules['receiptManager'] === true 
  const canAccessWageCalculator = isSuperAdmin || allowedModules['wageCalculator'] === true 

  useEffect(() => {
    if (!session) return
    if (activePage === 'records' && !canAccessRecords) setActivePage('home')
    if (activePage === 'privileges' && !canAccessPrivileges) setActivePage('home')
    if (activePage === 'inventory' && !canAccessInventory) setActivePage('home')
    if (activePage === 'receiptManager' && !canAccessReceiptManager) setActivePage('home')
    if (activePage === 'wageCalculator' && !canAccessWageCalculator) setActivePage('home')
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
    if (forceNewPassword !== forceConfirmPassword) return alert("Passwords do not match!")
    if (forceNewPassword.length < 6) return alert("Password min 6 characters!")
    setForceLoading(true)
    const { error } = await supabase.auth.updateUser({ password: forceNewPassword })
    if (error) { alert(error.message) } else {
      await supabase.from('profiles').update({ requires_password_change: false }).eq('id', session.user.id)
      setMustChangePassword(false)
      setActivePage('home')
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
            <input type="password" required placeholder="Confirm Password" className="input input-bordered w-full" value={forceConfirmPassword} onChange={(e) => setForceConfirmPassword(e.target.value)} />
            <button type="submit" disabled={forceLoading} className="btn btn-error text-white w-full mt-4">Save Password</button>
          </form>
        </div>
      </div>
    )
  }

  const getActivePageName = () => {
    if (activePage === 'home') return t('home')
    if (activePage === 'records') return t('recordManager')
    if (activePage === 'inventory') return t('inventory')
    if (activePage === 'receiptManager') return t('receiptManager')
    if (activePage === 'wageCalculator') return t('wageCalculator') 
    if (activePage === 'settings') return t('settings')
    if (activePage === 'privileges') return t('privileges')
    return t('home')
  }

  return (
    <div data-theme={currentTheme} className="min-h-screen bg-base-300 text-base-content font-sans transition-colors duration-300">
      
      {/* TOPBAR NAVIGATION */}
      <div className="bg-base-100 shadow-md px-4 py-3 md:h-16 flex items-center justify-between gap-3 relative z-30">
        <button onClick={() => setActivePage('home')} className="text-lg md:text-xl font-black tracking-wider text-primary btn btn-ghost px-1 md:px-4">
          B.O.L. FOOD SERVICES
        </button>
        
        <div className="flex items-center gap-2">
          {/* MOBILE VERSION */}
          <div className="dropdown dropdown-end md:hidden">
            <div tabIndex={0} role="button" className="btn btn-sm btn-primary font-bold gap-1 rounded-xl">
              <span>{getActivePageName()}</span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 opacity-70"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
            </div>
            <ul tabIndex={0} className="dropdown-content menu p-2 shadow-2xl bg-base-200 rounded-2xl w-52 mt-2 border border-base-300 font-semibold gap-1">
              <li><button onClick={() => { setActivePage('home'); document.activeElement.blur(); }} className={activePage === 'home' ? 'active' : ''}>{t('home')}</button></li>
              {canAccessRecords && <li><button onClick={() => { setActivePage('records'); document.activeElement.blur(); }} className={activePage === 'records' ? 'active' : ''}>{t('recordManager')}</button></li>}
              {canAccessInventory && <li><button onClick={() => { setActivePage('inventory'); document.activeElement.blur(); }} className={activePage === 'inventory' ? 'active' : ''}>{t('inventory')}</button></li>}
              {canAccessReceiptManager && <li><button onClick={() => { setActivePage('receiptManager'); document.activeElement.blur(); }} className={activePage === 'receiptManager' ? 'active' : ''}>{t('receiptManager')}</button></li>}
              {canAccessWageCalculator && <li><button onClick={() => { setActivePage('wageCalculator'); document.activeElement.blur(); }} className={activePage === 'wageCalculator' ? 'active' : ''}>{t('wageCalculator')}</button></li>}
              <li><button onClick={() => { setActivePage('settings'); document.activeElement.blur(); }} className={activePage === 'settings' ? 'active' : ''}>{t('settings')}</button></li>
              {canAccessPrivileges && <li><button onClick={() => { setActivePage('privileges'); document.activeElement.blur(); }} className={activePage === 'privileges' ? 'active' : ''}>{t('privileges')}</button></li>}
              <div className="divider my-1"></div>
              <li><button onClick={handleLogout} className="text-error hover:bg-error/20">{t('logOut')}</button></li>
            </ul>
          </div>

          {/* DESKTOP VERSION */}
          <div className="hidden md:flex gap-2">
            <button onClick={() => setActivePage('home')} className={`btn btn-sm ${activePage === 'home' ? 'btn-primary' : 'btn-ghost'}`}>{t('home')}</button>
            {canAccessRecords && <button onClick={() => setActivePage('records')} className={`btn btn-sm ${activePage === 'records' ? 'btn-primary' : 'btn-ghost'}`}>{t('recordManager')}</button>}
            {canAccessInventory && <button onClick={() => setActivePage('inventory')} className={`btn btn-sm ${activePage === 'inventory' ? 'btn-primary' : 'btn-ghost'}`}>{t('inventory')}</button>}
            {canAccessReceiptManager && <button onClick={() => setActivePage('receiptManager')} className={`btn btn-sm ${activePage === 'receiptManager' ? 'btn-primary' : 'btn-ghost'}`}>{t('receiptManager')}</button>}
            {canAccessWageCalculator && <button onClick={() => setActivePage('wageCalculator')} className={`btn btn-sm ${activePage === 'wageCalculator' ? 'btn-primary' : 'btn-ghost'}`}>{t('wageCalculator')}</button>}
            <button onClick={() => setActivePage('settings')} className={`btn btn-sm ${activePage === 'settings' ? 'btn-primary' : 'btn-ghost'}`}>{t('settings')}</button>
            {canAccessPrivileges && <button onClick={() => setActivePage('privileges')} className={`btn btn-sm ${activePage === 'privileges' ? 'btn-primary' : 'btn-ghost'}`}>{t('privileges')}</button>}
            <button onClick={handleLogout} className="btn btn-error btn-sm btn-outline ml-2">{t('logOut')}</button>
          </div>
        </div>
      </div>
      
      {/* MAIN CONTENT */}
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        {activePage === 'home' && (
           <div className="space-y-6">
             <div className="flex flex-col gap-1">
               <h1 className="text-2xl md:text-3xl font-black tracking-tight">{t('dashboardTitle')}</h1>
               <p className="text-sm opacity-60">{t('dashboardDesc')}</p>
             </div>
             
             {/* KAD GRID UTAMA */}
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {canAccessRecords && (
                  <button onClick={() => setActivePage('records')} className="card bg-base-100 border border-base-200 hover:border-primary shadow-xl hover:shadow-2xl transition-all duration-300 text-left group">
                    <div className="card-body p-6 flex flex-col justify-between h-48">
                      <div className="p-3 bg-primary/10 text-primary w-fit rounded-xl group-hover:bg-primary group-hover:text-white transition-all"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg></div>
                      <div>
                        <h2 className="card-title text-lg font-bold group-hover:text-primary">{t('recordManager')}</h2>
                        <p className="text-xs opacity-60 mt-1">{t('recordManagerDesc')}</p>
                      </div>
                    </div>
                  </button>
                )}
                
                {canAccessInventory && (
                  <button onClick={() => setActivePage('inventory')} className="card bg-base-100 border border-base-200 hover:border-success shadow-xl hover:shadow-2xl transition-all duration-300 text-left group">
                    <div className="card-body p-6 flex flex-col justify-between h-48">
                      <div className="p-3 bg-success/10 text-success w-fit rounded-xl group-hover:bg-success group-hover:text-white transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>
                      </div>
                      <div>
                        <h2 className="card-title text-lg font-bold group-hover:text-success">{t('inventory')}</h2>
                        <p className="text-xs opacity-60 mt-1">{t('inventoryDesc')}</p>
                      </div>
                    </div>
                  </button>
                )}

                {canAccessReceiptManager && (
                  <button onClick={() => setActivePage('receiptManager')} className="card bg-base-100 border border-base-200 hover:border-accent shadow-xl hover:shadow-2xl transition-all duration-300 text-left group">
                    <div className="card-body p-6 flex flex-col justify-between h-48">
                      <div className="p-3 bg-accent/10 text-accent w-fit rounded-xl group-hover:bg-accent group-hover:text-white transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" /></svg></div>
                      <div>
                        <h2 className="card-title text-lg font-bold group-hover:text-accent">{t('receiptManager')}</h2>
                        <p className="text-xs opacity-60 mt-1">{t('receiptManagerDesc')}</p>
                      </div>
                    </div>
                  </button>
                )}

                {canAccessWageCalculator && (
                  <button onClick={() => setActivePage('wageCalculator')} className="card bg-base-100 border border-base-200 hover:border-warning shadow-xl hover:shadow-2xl transition-all duration-300 text-left group">
                    <div className="card-body p-6 flex flex-col justify-between h-48">
                      <div className="p-3 bg-warning/10 text-warning w-fit rounded-xl group-hover:bg-warning group-hover:text-white transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-3-3V18m-3-3V18M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM10.5 8.25h3l-3 4.5h3" /></svg></div>
                      <div>
                        <h2 className="card-title text-lg font-bold group-hover:text-warning">{t('wageCalculator')}</h2>
                        <p className="text-xs opacity-60 mt-1">{t('wageCalcDesc') || 'Kira upah bulanan staf.'}</p>
                      </div>
                    </div>
                  </button>
                )}
             </div>
           </div>
        )}
        
        {activePage === 'records' && canAccessRecords && <RecordManager session={session} />}
        {activePage === 'settings' && <Settings session={session} themeMode={themeMode} setThemeMode={handleThemeChange} currentLang={lang} setCurrentLang={setLang} />}
        {activePage === 'privileges' && canAccessPrivileges && <Privileges session={session} />}
        {activePage === 'inventory' && canAccessInventory && <Inventory session={session} userRole={userRole} allowedModules={allowedModules} lang={lang} />}
        {activePage === 'receiptManager' && canAccessReceiptManager && <ReceiptManager session={session} userRole={userRole} allowedModules={allowedModules} />}
        {activePage === 'wageCalculator' && canAccessWageCalculator && <WageCalculator session={session} userRole={userRole} allowedModules={allowedModules} />}
      </div>
    </div>
  )
}

export default App