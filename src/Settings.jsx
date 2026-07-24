import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function Settings({ session, themeMode, setThemeMode }) {
  const [loading, setLoading] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const showToast = (msg) => { setToastMessage(msg); setTimeout(() => setToastMessage(''), 3000) }

  useEffect(() => {
    const fetchProfile = async () => {
      const { data, error } = await supabase.from('profiles').select('theme_mode, preferred_language').eq('id', session.user.id).single()
      if (data) {} else if (error && error.code === 'PGRST116') await supabase.from('profiles').insert([{ id: session.user.id, theme_mode: themeMode, preferred_language: 'en' }])
    }
    if (session?.user?.id) fetchProfile()
  }, [session])

  const handleSaveGeneralSettings = async (e) => {
    e.preventDefault(); setLoading(true)
    try {
      const { error } = await supabase.from('profiles').update({ theme_mode: themeMode, preferred_language: 'en', updated_at: new Date().toISOString() }).eq('id', session.user.id)
      if (error) showToast('Failed to update settings: ' + error.message); else { setThemeMode(themeMode); showToast('General settings saved successfully!') }
    } catch (err) { showToast('An unexpected error occurred: ' + err.message) } finally { setLoading(false) }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) { showToast('Passwords do not match!'); return }
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) showToast('Failed to change password: ' + error.message); else { showToast('Password updated successfully!'); setNewPassword(''); setConfirmPassword('') }
    } catch (err) { showToast('An unexpected error occurred: ' + err.message) } finally { setLoading(false) }
  }

  return (
    <div className="pos-relative max-w-1200 mx-auto">
      {toastMessage && <div className="toast-container-custom"><div className="d-flex align-items-center gap-2 px-3 py-2 rounded-pill shadow-lg bg-blue text-white fw-600 text-14"><span>{toastMessage}</span></div></div>}

      <div className="page-header-custom">
        <h1 className="page-title-custom">Settings</h1>
        <p className="page-subtitle-custom">Configure credentials and preferences.</p>
      </div>

      <div className="row g-4">
        <div className="col-lg-6">
          <div className="card p-4 rounded-16">
            <h5 className="fw-bold mb-3 text-accent">Preferences</h5>
            <form onSubmit={handleSaveGeneralSettings}>
              <div className="mb-3"><label className="form-label">Theme Mode</label><select className="form-select" value={themeMode} onChange={(e) => setThemeMode(e.target.value)}><option value="light">Light Mode ☀️</option><option value="dark">Dark Mode 🌙</option><option value="auto">Auto (Sunset/Sunrise) 🔄</option></select></div>
              <button type="submit" disabled={loading} className="btn btn-primary w-100 fw-bold mt-2">{loading ? <span className="d-inline-flex align-items-center gap-2"><span className="spinner-border spinner-border-sm"></span>Saving...</span> : 'Save Preferences'}</button>
            </form>
          </div>
        </div>
        <div className="col-lg-6">
          <div className="card p-4 rounded-16">
            <h5 className="fw-bold mb-3 text-error">Security & Password</h5>
            <form onSubmit={handleChangePassword}>
              <div className="mb-3"><label className="form-label">New Password</label><input type="password" required placeholder="Minimum 6 characters" className="form-control" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
              <div className="mb-3"><label className="form-label">Confirm New Password</label><input type="password" required placeholder="Re-type new password" className="form-control" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div>
              <button type="submit" disabled={loading} className="btn w-100 fw-bold mt-2 text-error border-error bg-error-10">{loading ? <span className="d-inline-flex align-items-center gap-2"><span className="spinner-border spinner-border-sm"></span>Updating...</span> : 'Update Password'}</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}