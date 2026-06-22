import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function Settings({ session, themeMode, setThemeMode }) {
  const [loading, setLoading] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  
  // State untuk tukar password
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  // State untuk prefered language (Akan di-extend kemudian)
  const [lang, setLang] = useState('en')

  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 3000)
  }

  // Ambil tetapan asal pengguna dari database semasa page dibuka
  useEffect(() => {
    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('theme_mode, preferred_language')
        .eq('id', session.user.id)
        .single()

      if (data) {
        setLang(data.preferred_language || 'en')
      } else if (error && error.code === 'PGRST116') {
        // Jika profile belum wujud, jana satu rekod baru
        await supabase.from('profiles').insert([
          { id: session.user.id, theme_mode: themeMode, preferred_language: 'en' }
        ])
      }
    }
    fetchProfile()
  }, [session])

  // 1. Simpan Tetapan Am (Theme & Language) ke Supabase Profiles Table
  const handleSaveGeneralSettings = async (e) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: session.user.id,
        theme_mode: themeMode,
        preferred_language: lang,
        updated_at: new Date().toISOString(),
      })

    if (error) {
      alert('Failed to update settings: ' + error.message)
    } else {
      showToast('General settings saved successfully!')
    }
    setLoading(false)
  }

  // 2. Tukar Password Terus ke Auth Sistem Supabase
  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      alert("Passwords do not match!")
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      alert('Failed to change password: ' + error.message)
    } else {
      showToast('Password updated successfully!')
      setNewPassword('')
      setConfirmPassword('')
    }
    setLoading(false)
  }

  return (
    <div className="space-y-8 relative">
      
      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="toast toast-top toast-end z-50 p-4">
          <div className="alert alert-success shadow-lg text-white font-medium flex items-center gap-2 rounded-xl">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* TAJUK BESAR SETTINGS */}
      <div className="flex flex-col gap-1 border-b border-base-100 pb-4">
        <h1 className="text-2xl md:text-3xl font-black tracking-tight">Account Settings</h1>
        <p className="text-sm opacity-60">Manage your profile configurations, security preferences, and display themes.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* SEKSYEN KANAN: DISPLAY & PREFERENCES */}
        <div className="card bg-base-100 shadow-xl p-6 border border-base-200 h-fit">
          <h3 className="text-lg font-bold mb-4 text-primary">Preferences</h3>
          <form onSubmit={handleSaveGeneralSettings} className="space-y-4">
            
            {/* Pilihan Theme Mode */}
            <div className="form-control">
              <label className="label-text font-semibold mb-1">Theme Mode</label>
              <select 
                className="select select-bordered w-full text-base"
                value={themeMode}
                onChange={(e) => setThemeMode(e.target.value)}
              >
                <option value="light">Light Mode ☀️</option>
                <option value="dark">Dark Mode 🌙</option>
                <option value="auto">Auto (Sunset/Sunrise) 🔄</option>
              </select>
            </div>

            {/* Pilihan Language (Placeholder - dibincangkan kemudian) */}
            <div className="form-control">
              <label className="label-text font-semibold mb-1">Preferred Language</label>
              <select 
                className="select select-bordered w-full text-base opacity-70"
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                disabled
              >
                <option value="en">English (Default)</option>
                <option value="ms">Bahasa Melayu (Coming Soon)</option>
              </select>
              <span className="text-[11px] opacity-50 mt-1">Language management will be configured in the next phase.</span>
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary w-full mt-2">
              {loading ? <span className="loading loading-spinner"></span> : 'Save Preferences'}
            </button>
          </form>
        </div>

        {/* SEKSYEN KIRI: CHANGE PASSWORD */}
        <div className="card bg-base-100 shadow-xl p-6 border border-base-200 h-fit">
          <h3 className="text-lg font-bold mb-4 text-error">Security & Password</h3>
          <form onSubmit={handleChangePassword} className="space-y-4">
            
            <div className="form-control">
              <label className="label-text font-semibold mb-1">New Password</label>
              <input 
                type="password" required placeholder="Minimum 6 characters" className="input input-bordered w-full text-base"
                value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <div className="form-control">
              <label className="label-text font-semibold mb-1">Confirm New Password</label>
              <input 
                type="password" required placeholder="Re-type new password" className="input input-bordered w-full text-base"
                value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <button type="submit" disabled={loading} className="btn btn-error btn-outline w-full mt-2">
              {loading ? <span className="loading loading-spinner"></span> : 'Update Password'}
            </button>
          </form>
        </div>

      </div>
    </div>
  )
}