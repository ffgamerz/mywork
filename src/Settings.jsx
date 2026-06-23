import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { translations } from './translations' // IMPORT PUSAT

export default function Settings({ session, themeMode, setThemeMode, currentLang, setCurrentLang }) {
  const [loading, setLoading] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const lang = currentLang || 'en'
  const t = (key) => translations[lang]?.[key] || translations['en'][key]

  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 3000)
  }

  useEffect(() => {
    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('theme_mode, preferred_language')
        .eq('id', session.user.id)
        .single()

      if (data) {
        if (data.preferred_language) setCurrentLang(data.preferred_language)
      } else if (error && error.code === 'PGRST116') {
        await supabase.from('profiles').insert([
          { id: session.user.id, theme_mode: themeMode, preferred_language: lang }
        ])
      }
    }
    if (session?.user?.id) fetchProfile()
  }, [session])

  const handleSaveGeneralSettings = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          theme_mode: themeMode,
          preferred_language: lang, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', session.user.id)

      if (error) {
        alert(t('errUpdatePref') + error.message)
      } else {
        setThemeMode(themeMode)
        showToast(t('toastPrefSuccess'))
      }
    } catch (err) {
      alert(t('errUnexpected') + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      alert(t('alertPassMatch'))
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })

      if (error) {
        alert(t('errUpdatePass') + error.message)
      } else {
        showToast(t('toastPassSuccess'))
        setNewPassword('')
        setConfirmPassword('')
      }
    } catch (err) {
      alert(t('errUnexpected') + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8 relative">
      {toastMessage && (
        <div className="toast toast-top toast-end z-50 p-4">
          <div className="alert alert-success shadow-lg text-white font-medium flex items-center gap-2 rounded-xl">
            <svg xmlns="http://www.w3.org/2000/xl" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1 border-b border-base-100 pb-4">
        <h1 className="text-2xl md:text-3xl font-black tracking-tight">{t('title')}</h1>
        <p className="text-sm opacity-60">{t('subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="card bg-base-100 shadow-xl p-6 border border-base-200 h-fit">
          <h3 className="text-lg font-bold mb-4 text-primary">{t('secPreferences')}</h3>
          <form onSubmit={handleSaveGeneralSettings} className="space-y-4">
            <div className="form-control">
              <label className="label-text font-semibold mb-1">{t('lblTheme')}</label>
              <select className="select select-bordered w-full text-base" value={themeMode} onChange={(e) => setThemeMode(e.target.value)}>
                <option value="light">{t('optLight')}</option>
                <option value="dark">{t('optDark')}</option>
                <option value="auto">{t('optAuto')}</option>
              </select>
            </div>
            {/* Pilihan Language di dalam fail src/Settings.jsx */}
            <div className="form-control">
              <label className="label-text font-semibold mb-1">{t('lblLang')}</label>
              <select 
                className="select select-bordered w-full text-base"
                value={lang}
                onChange={(e) => setCurrentLang(e.target.value)}
              >
                <option value="en">English 🇬🇧</option>
                <option value="ms">Bahasa Melayu 🇲🇾</option>
                <option value="zh">简体中文 (马来西亚) 🇲🇾/🇨🇳</option> {/* TAMBAH BARIS INI */}
              </select>
            </div>
            <button type="submit" disabled={loading} className="btn btn-primary w-full mt-2">
              {loading ? <span className="loading loading-spinner"></span> : t('btnSavePref')}
            </button>
          </form>
        </div>

        <div className="card bg-base-100 shadow-xl p-6 border border-base-200 h-fit">
          <h3 className="text-lg font-bold mb-4 text-error">{t('secSecurity')}</h3>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="form-control">
              <label className="label-text font-semibold mb-1">{t('lblNewPass')}</label>
              <input type="password" required placeholder={t('placeholderMinChar')} className="input input-bordered w-full text-base" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="form-control">
              <label className="label-text font-semibold mb-1">{t('lblConfirmPass')}</label>
              <input type="password" required placeholder={t('placeholderReType')} className="input input-bordered w-full text-base" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
            <button type="submit" disabled={loading} className="btn btn-error btn-outline w-full mt-2">
              {loading ? <span className="loading loading-spinner"></span> : t('btnUpdatePass')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}