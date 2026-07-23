import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function Settings({ session, themeMode, setThemeMode }) {
  const [loading, setLoading] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

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
        // do nothing with language since we removed it
      } else if (error && error.code === 'PGRST116') {
        await supabase.from('profiles').insert([
          { id: session.user.id, theme_mode: themeMode, preferred_language: 'en' }
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
          preferred_language: 'en', 
          updated_at: new Date().toISOString() 
        })
        .eq('id', session.user.id)

      if (error) {
        showToast('Failed to update settings: ' + error.message)
      } else {
        setThemeMode(themeMode)
        showToast('General settings saved successfully!')
      }
    } catch (err) {
      showToast('An unexpected error occurred: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match!')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })

      if (error) {
        showToast('Failed to change password: ' + error.message)
      } else {
        showToast('Password updated successfully!')
        setNewPassword('')
        setConfirmPassword('')
      }
    } catch (err) {
      showToast('An unexpected error occurred: ' + err.message)
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
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Configure credentials.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <div className="content-card p-5 h-fit">
          <h3 className="text-base font-bold mb-3 text-primary">Preferences</h3>
          <form onSubmit={handleSaveGeneralSettings} className="space-y-4">
            <div className="form-control">
              <label className="label-text font-semibold mb-1">Theme Mode</label>
              <select className="select select-bordered w-full text-base" value={themeMode} onChange={(e) => setThemeMode(e.target.value)}>
                <option value="light">Light Mode ☀️</option>
                <option value="dark">Dark Mode 🌙</option>
                <option value="auto">Auto (Sunset/Sunrise) 🔄</option>
              </select>
            </div>
            <button type="submit" disabled={loading} className="btn btn-primary font-bold w-full mt-2">
              {loading ? <span className="loading loading-spinner"></span> : 'Save Preferences'}
            </button>
          </form>
        </div>

        <div className="content-card p-5 h-fit">
          <h3 className="text-base font-bold mb-3 text-error">Security & Password</h3>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="form-control">
              <label className="label-text font-semibold mb-1">New Password</label>
              <input type="password" required placeholder="Minimum 6 characters" className="input input-bordered w-full text-base" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="form-control">
              <label className="label-text font-semibold mb-1">Confirm New Password</label>
              <input type="password" required placeholder="Re-type new password" className="input input-bordered w-full text-base" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
            <button type="submit" disabled={loading} className="btn btn-error btn-outline font-bold w-full mt-2">
              {loading ? <span className="loading loading-spinner"></span> : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}