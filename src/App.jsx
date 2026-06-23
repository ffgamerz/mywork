import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Login from './Login'
import RecordManager from './RecordManager'
import Settings from './Settings'
import Privileges from './Privileges'
import Inventory from './Inventory' 
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

    // MEMASTIKAN DATA profiles DIBACA DENGAN TEPAT
    const { data: prof, error: profErr } = await supabase.from('profiles').select('theme_mode, role, requires_password_change, preferred_language').eq('id', userId).single()
    if (prof) {
      if (prof.theme_mode) setThemeMode(prof.theme_mode)
      if (prof.preferred_language) setLang(prof.preferred_language)
      
      // Bersihkan sebarang string kosong atau isu huruf besar dari DB
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
  const isAdmin = userRole === 'admin'
  
  const canAccessRecords = isSuperAdmin || isAdmin || allowedModules['records'] === true
  const canAccessPrivileges = isSuperAdmin || isAdmin || allowedModules['privileges'] === true
  const canAccessInventory = isSuperAdmin || isAdmin || allowedModules['inventory'] === true

  useEffect(() => {
    if (!session) return
    if (activePage === 'records' && !canAccessRecords) setActivePage('home')
    if (activePage === 'privileges' && !canAccessPrivileges) setActivePage('home')
    if (activePage === 'inventory' && !canAccessInventory) setActivePage('home')
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

  return (
    <div data-theme={currentTheme} className="min-h-screen bg-base-300 text-base-content font-sans transition-colors duration-300">
      <div className="bg-base-100 shadow-md px-4 py-3 md:h-16 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <button onClick={() => setActivePage('home')} className="text-xl font-black tracking-wider text-primary btn btn-ghost">B.O.L. FOOD SERVICES</button>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setActivePage('home')} className={`btn btn-xs sm:btn-sm ${activePage === 'home' ? 'btn-primary' : 'btn-ghost'}`}>{t('home')}</button>
          {canAccessRecords && <button onClick={() => setActivePage('records')} className={`btn btn-xs sm:btn-sm ${activePage === 'records' ? 'btn-primary' : 'btn-ghost'}`}>{t('recordManager')}</button>}
          {canAccessInventory && <button onClick={() => setActivePage('inventory')} className={`btn btn-xs sm:btn-sm ${activePage === 'inventory' ? 'btn-primary' : 'btn-ghost'}`}>{t('inventory')}</button>}
          <button onClick={() => setActivePage('settings')} className={`btn btn-xs sm:btn-sm ${activePage === 'settings' ? 'btn-primary' : 'btn-ghost'}`}>{t('settings')}</button>
          {canAccessPrivileges && <button onClick={() => setActivePage('privileges')} className={`btn btn-xs sm:btn-sm ${activePage === 'privileges' ? 'btn-primary' : 'btn-ghost'}`}>{t('privileges')}</button>}
          <button onClick={handleLogout} className="btn btn-error btn-xs sm:btn-sm btn-outline">{t('logOut')}</button>
        </div>
      </div>
      
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        {activePage === 'home' && (
           <div className="space-y-6">
             <div className="flex flex-col gap-1">
               <h1 className="text-2xl md:text-3xl font-black tracking-tight">{t('dashboardTitle')}</h1>
               <p className="text-sm opacity-60">{t('dashboardDesc')}</p>
             </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {canAccessRecords ? (
                  <button onClick={() => setActivePage('records')} className="card bg-base-100 border border-base-200 hover:border-primary shadow-xl hover:shadow-2xl transition-all duration-300 text-left group">
                    <div className="card-body p-6 flex flex-col justify-between h-48">
                      <div className="p-3 bg-primary/10 text-primary w-fit rounded-xl group-hover:bg-primary group-hover:text-white transition-all"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg></div>
                      <div>
                        <h2 className="card-title text-lg font-bold group-hover:text-primary">{t('recordManager')}</h2>
                        <p className="text-xs opacity-60 mt-1">{t('recordManagerDesc')}</p>
                      </div>
                    </div>
                  </button>
                ) : (
                  <div className="card bg-base-100/40 border border-base-200/50 shadow-md opacity-40 cursor-not-allowed">
                    <div className="card-body p-6 flex flex-col justify-between h-48">
                      <div className="p-3 bg-base-content/10 rounded-xl w-fit"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg></div>
                      <div>
                        <h2 className="card-title text-base font-bold opacity-70">{t('recordManager')}</h2>
                        <p className="text-xs opacity-50 mt-1">{t('lockedModule')}</p>
                      </div>
                    </div>
                  </div>
                )}
                
                {canAccessInventory ? (
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
                ) : (
                  <div className="card bg-base-100/40 border border-base-200/50 shadow-md opacity-40 cursor-not-allowed">
                    <div className="card-body p-6 flex flex-col justify-between h-48">
                      <div className="p-3 bg-base-content/10 rounded-xl w-fit"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg></div>
                      <div>
                        <h2 className="card-title text-base font-bold opacity-70">{t('inventory')}</h2>
                        <p className="text-xs opacity-50 mt-1">{t('lockedModule')}</p>
                      </div>
                    </div>
                  </div>
                )}
                
                <button onClick={() => setActivePage('settings')} className="card bg-base-100 border border-base-200 hover:border-accent shadow-xl hover:shadow-2xl transition-all duration-300 text-left group">
                  <div className="card-body p-6 flex flex-col justify-between h-48">
                    <div className="p-3 bg-accent/10 text-accent w-fit rounded-xl group-hover:bg-accent group-hover:text-white transition-all"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.43l-1.003.767c-.307.235-.45.643-.366 1.023.004.022.006.045.008.068a1.124 1.124 0 0 1-.504 1.014l-1.12.756a1.126 1.126 0 0 1-1.34-.1l-.816-.677a1.123 1.123 0 0 0-1.284-.112l-1.12.639a1.125 1.125 0 0 1-1.3-.067l-.872-.705a1.123 1.123 0 0 0-1.246-.145l-1.112.556a1.125 1.125 0 0 1-1.31-.21l-1.196-1.196a1.125 1.125 0 0 1-.21-1.31l.556-1.112a1.122 1.122 0 0 0-.145-1.246l-.705-.872a1.125 1.125 0 0 1-.067-1.3l.639-1.12a1.123 1.123 0 0 0-.112-1.284l-.677-.816a1.125 1.125 0 0 1-.1-1.34l.756-1.12a1.124 1.124 0 0 1 1.014-.504c.023.002.046.004.068.008.38.084.788-.06 1.023-.366l.767-1.003a1.125 1.125 0 0 1 1.43-.26l2.247 1.296a1.125 1.125 0 0 1 .49 1.37l-.456 1.217a1.122 1.122 0 0 0 .124 1.075c.044.073.087.146.127.22.184.332.496.582.87.645l1.281.213Z" /></svg></div>
                    <div>
                      <h2 className="card-title text-lg font-bold group-hover:text-accent">{t('settings')}</h2>
                      <p className="text-xs opacity-60 mt-1">{t('settingsDesc')}</p>
                    </div>
                  </div>
                </button>
                
                {canAccessPrivileges ? (
                  <button onClick={() => setActivePage('privileges')} className="card bg-base-100 border border-base-200 hover:border-warning shadow-xl hover:shadow-2xl transition-all duration-300 text-left group">
                    <div className="card-body p-6 flex flex-col justify-between h-48">
                      <div className="p-3 bg-warning/10 text-warning w-fit rounded-xl group-hover:bg-warning group-hover:text-white transition-all"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94-3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" /></svg></div>
                      <div>
                        <h2 className="card-title text-lg font-bold group-hover:text-warning">{t('privileges')}</h2>
                        <p className="text-xs opacity-60 mt-1">{t('privilegesDesc')}</p>
                      </div>
                    </div>
                  </button>
                ) : (
                  <div className="card bg-base-100/40 border border-base-200/50 shadow-md opacity-40 cursor-not-allowed">
                    <div className="card-body p-6 flex flex-col justify-between h-48">
                      <div className="p-3 bg-base-content/10 rounded-xl w-fit"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg></div>
                      <div>
                        <h2 className="card-title text-base font-bold opacity-70">{t('privileges')}</h2>
                        <p className="text-xs opacity-50 mt-1">{t('lockedModule')}</p>
                      </div>
                    </div>
                  </div>
                )}
             </div>
           </div>
        )}
        {activePage === 'records' && canAccessRecords && <RecordManager session={session} />}
        {activePage === 'settings' && <Settings session={session} themeMode={themeMode} setThemeMode={handleThemeChange} currentLang={lang} setCurrentLang={setLang} />}
        {activePage === 'privileges' && canAccessPrivileges && <Privileges session={session} />}
        
        {/* PEMBETULAN MUTLAK: HANTAR userRole={userRole} SECARA TEPAT KE INVENTORY KOMPONEN */}
        {activePage === 'inventory' && canAccessInventory && (
          <Inventory session={session} userRole={userRole} />
        )}
      </div>
    </div>
  )
}

export default App