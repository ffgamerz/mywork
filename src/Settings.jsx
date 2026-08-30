import { useState } from 'react'
import { supabase } from './supabaseClient'
import ToastBar from './components/ToastBar'
import { useToast } from './utils/useToast'

export default function Settings() {
  const [loading, setLoading] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const { toast, showToast, hideToast } = useToast()

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) { showToast('Passwords do not match!', 'error'); return }
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) showToast('Failed to change password: ' + error.message, 'error'); else { showToast('Password updated successfully!'); setNewPassword(''); setConfirmPassword('') }
    } catch (err) { showToast('An unexpected error occurred: ' + err.message, 'error') } finally { setLoading(false) }
  }

  return (
    <div className="pos-relative max-w-1200 mx-auto">
      <ToastBar toast={toast} onClose={hideToast} />

      <div className="page-header-custom">
        <h1 className="page-title-custom"><span className="material-symbols-outlined me-2 icon-xl">settings</span> Settings</h1>
        <p className="page-subtitle-custom">Manage your account credentials.</p>
      </div>

      <div className="row g-4">
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