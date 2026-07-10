import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { getTranslation } from './utils/translation'

export default function Settings({ session, themeMode, setThemeMode, lang = 'en', setLang }) {
  const [loading, setLoading] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const activeLang = lang || 'en'
  const t = (key) => getTranslation(activeLang, key)

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
        if (data.preferred_language) setLang(data.preferred_language)
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
          preferred_language: activeLang, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', session.user.id)

      if (error) {
        showToast(t('errUpdatePref') + error.message)
      } else {
        setThemeMode(themeMode)
        showToast(t('toastPrefSuccess'))
      }
    } catch (err) {
      showToast(t('errUnexpected') + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      showToast(t('alertPassMatch'))
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })

      if (error) {
        showToast(t('errUpdatePass') + error.message)
      } else {
        showToast(t('toastPassSuccess'))
        setNewPassword('')
        setConfirmPassword('')
      }
    } catch (err) {
      showToast(t('errUnexpected') + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-shell relative">
      {toastMessage && (
        <div className="toast-success">
          <div className="alert-toast">
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      <div className="page-header">
        <h1 className="page-title">{t('settings')}</h1>
        <p className="page-subtitle">{t('settingsDesc')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <div className="content-card p-5 h-fit">
          <h3 className="text-base font-bold mb-3 text-primary">{t('secPreferences')}</h3>
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
                value={activeLang}
                onChange={(e) => setLang(e.target.value)}
              >
                <option value="en">English 🇬🇧</option>
                <option value="ms">Bahasa Melayu 🇲🇾</option>
                <option value="zh">简体中文 (马来西亚) 🇲🇾/🇨🇳</option> {/* TAMBAH BARIS INI */}
              </select>
            </div>
            <button type="submit" disabled={loading} className="btn btn-primary font-bold w-full mt-2">
              {loading ? <span className="loading loading-spinner"></span> : t('btnSavePref')}
            </button>
          </form>
        </div>

        <div className="content-card p-5 h-fit">
          <h3 className="text-base font-bold mb-3 text-error">{t('secSecurity')}</h3>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="form-control">
              <label className="label-text font-semibold mb-1">{t('lblNewPass')}</label>
              <input type="password" required placeholder={t('placeholderMinChar')} className="input input-bordered w-full text-base" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="form-control">
              <label className="label-text font-semibold mb-1">{t('lblConfirmPass')}</label>
              <input type="password" required placeholder={t('placeholderReType')} className="input input-bordered w-full text-base" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
            <button type="submit" disabled={loading} className="btn btn-error btn-outline font-bold w-full mt-2">
              {loading ? <span className="loading loading-spinner"></span> : t('btnUpdatePass')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}