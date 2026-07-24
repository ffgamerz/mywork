import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function Privileges({ session }) {
  const [users, setUsers] = useState([])
  const [modules, setModules] = useState([])
  const [permissions, setPermissions] = useState({})
  const [loadingData, setLoadingData] = useState(false)
  const [toast, setToast] = useState('')

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [showConfirmStep, setShowConfirmStep] = useState(false)
  const [newFullName, setNewFullName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [generatedPassword, setGeneratedPassword] = useState('')
  const [createLoading, setCreateLoading] = useState(false)

  const [selectedUser, setSelectedUser] = useState(null)
  const [adminNewPassword, setAdminNewPassword] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const [userToDelete, setUserToDelete] = useState(null)

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 5000)
  }

  const loadData = async () => {
    setLoadingData(true)
    try {
      const { data: mods, error: modsError } = await supabase.from('system_modules').select('*').order('name')
      if (modsError) throw modsError
      if (mods) setModules(mods)

      const { data: profs, error: profsError } = await supabase.from('profiles').select('*').order('email')
      if (profsError) throw profsError
      if (profs) setUsers(profs)

      const { data: perms, error: permsError } = await supabase.from('user_permissions').select('*')
      if (permsError) throw permsError
      if (perms) {
        const permMap = {}
        perms.forEach(p => { permMap[`${p.user_id}-${p.module_id}`] = p.is_allowed })
        setPermissions(permMap)
      }
    } catch (err) {
      console.error('Error loading data:', err.message)
      showToast('Error loading data: ' + err.message)
    } finally {
      setLoadingData(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const generateRandomPassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#'
    let pass = ''
    for (let i = 0; i < 10; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length))
    setGeneratedPassword(pass)
  }

  const handlePreSubmitCheck = (e) => {
    e.preventDefault()
    if (!generatedPassword) { showToast('Please generate a temporary password first!'); return }
    setShowConfirmStep(true)
  }

  const handleExecuteCreateUser = async () => {
    setCreateLoading(true)
    const { error } = await supabase.functions.invoke('admin-create-user', { body: { email: newEmail, password: generatedPassword } })
    if (error) { showToast('Creation failed: ' + error.message) } else {
      if (newFullName.trim()) await supabase.from('profiles').update({ full_name: newFullName.trim() }).eq('email', newEmail.trim())
      showToast(`ACCOUNT CREATED SUCCESSFULLY! 🎉\nName: ${newFullName.trim() || newEmail}\nEmail: ${newEmail}\nTemporary Pass: ${generatedPassword}`)
      setNewFullName(''); setNewEmail(''); setGeneratedPassword(''); setShowConfirmStep(false); setIsCreateModalOpen(false); loadData()
    }
    setCreateLoading(false)
  }

  const handleDeleteUser = async () => {
    setActionLoading(true)
    const { error } = await supabase.functions.invoke('admin-delete-user', { body: { userId: userToDelete.id } })
    if (error) showToast(error.message)
    else { showToast('User deleted permanently!'); setUserToDelete(null); loadData() }
    setActionLoading(false)
  }

  const handleRoleChange = async (userId, newRole) => {
    setActionLoading(true)
    try {
      const { error } = await supabase.functions.invoke('admin-change-role', { body: { userId, newRole } })
      if (error) throw error
      showToast(`Privilege level updated successfully to ${newRole}!`); loadData()
    } catch (err) { showToast(err.message) } finally { setActionLoading(false) }
  }

  const handleTogglePermission = async (userId, moduleId, currentStatus) => {
    const newStatus = !currentStatus
    const { error } = await supabase.from('user_permissions').upsert({ user_id: userId, module_id: moduleId, is_allowed: newStatus, updated_at: new Date().toISOString() }, { onConflict: 'user_id,module_id' })
    if (error) showToast(error.message)
    else { setPermissions(prev => ({ ...prev, [`${userId}-${moduleId}`]: newStatus })); showToast('Preference updated!') }
  }

  const handleForceChangePassword = async (e) => {
    e.preventDefault()
    setActionLoading(true)
    try {
      const { error: funcError } = await supabase.functions.invoke('admin-change-password', { body: { userId: selectedUser.id, newPassword: adminNewPassword } })
      if (funcError) throw funcError
      await supabase.from('profiles').update({ requires_password_change: true, updated_at: new Date().toISOString() }).eq('id', selectedUser.id)
      showToast(`Password updated and forced reset active for ${selectedUser.email}`)
      setAdminNewPassword(''); setSelectedUser(null); loadData()
    } catch (err) { showToast('Reset Password Failed: ' + err.message) } finally { setActionLoading(false) }
  }

  const closeCreateModal = () => { setIsCreateModalOpen(false); setNewFullName(''); setNewEmail(''); setGeneratedPassword(''); setShowConfirmStep(false) }

  return (
    <div>
      {toast && (
        <div className="toast-container-custom">
          <div className="d-flex align-items-center gap-2 px-3 py-2 rounded-pill shadow-lg">{toast}</div>
        </div>
      )}

      <div className="page-header-custom d-flex flex-wrap justify-content-between align-items-start gap-3">
        <div>
          <h1 className="page-title-custom">Privilege & User Manager</h1>
          <p className="page-subtitle-custom">Create organization accounts and delegate dynamic structural rights.</p>
        </div>
        <button onClick={() => setIsCreateModalOpen(true)} className="btn btn-primary fw-bold gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Add New Staff Account
        </button>
      </div>

      <div className="card p-3">
        <h6 className="fw-bold mb-3">Interactive Access Control Matrix</h6>
        {loadingData ? (
          <div className="text-center py-5"><span className="spinner-border"></span></div>
        ) : users.length === 0 ? (
          <div className="empty-state py-5">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94-3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>
            <p className="fw-bold text-muted mt-2">No users registered yet.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>User Details</th>
                  <th>Privilege Level</th>
                  {modules.map(m => <th key={m.id} className="text-center">{m.name}</th>)}
                  <th className="text-end">Account Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="fw-bold text-white">{u.full_name || '-'}</div>
                      <div className="text-muted">{u.email || 'No Email'}</div>
                      <div className="font-mono">{u.id}</div>
                      {u.requires_password_change && <span className="badge badge-warning mt-1">Force Pass Reset Active</span>}
                    </td>
                    <td>
                      <span className={`badge fw-bold ${u.role === 'super_admin' ? 'badge-error' : u.role === 'admin' ? 'badge-warning' : ''}`}>
                        {u.role || 'default'}
                      </span>
                    </td>
                    {modules.map(m => {
                      const isChecked = !!permissions[`${u.id}-${m.id}`]
                      return (
                        <td key={m.id} className="text-center">
                          <input type="checkbox" className="form-check-input" checked={isChecked} onChange={() => handleTogglePermission(u.id, m.id, permissions[`${u.id}-${m.id}`])} />
                        </td>
                      )
                    })}
                    <td className="text-end">
                      <div className="d-flex gap-1 justify-content-end flex-wrap">
                        <button onClick={() => setSelectedUser(u)} className="btn btn-sm btn-outline-light">Reset Pass</button>
                        <button onClick={() => setUserToDelete(u)} className="btn btn-sm btn-link">Delete</button>
                        <div className="vr mx-1"></div>
                        <button onClick={() => handleRoleChange(u.id, 'default')} disabled={actionLoading || u.role === 'super_admin' || u.role === 'default' || !u.role} className={`btn btn-sm ${u.role === 'default' || !u.role ? 'btn-outline-light opacity-50' : 'btn-outline-light'}`}>Default</button>
                        <button onClick={() => handleRoleChange(u.id, 'admin')} disabled={actionLoading || u.role === 'super_admin' || u.role === 'admin'} className={`btn btn-sm ${u.role === 'admin' ? 'btn-outline-light opacity-50' : 'btn-outline-primary'}`}>Admin</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isCreateModalOpen && (
        <>
          <div className="modal-backdrop show" onClick={closeCreateModal}></div>
          <div className="modal d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content p-3">
                <h5 className="fw-bold text-primary mb-2">Provision Staff Account</h5>
                <p className="text-muted mb-3">Register new access coordinates within the cloud framework.</p>
                <form onSubmit={handlePreSubmitCheck}>
                  <div className="mb-3"><label className="form-label">Staff Full Name *</label><input type="text" required placeholder="Ahmad Bin Ali" className="form-control" value={newFullName} onChange={(e) => setNewFullName(e.target.value)} /></div>
                  <div className="mb-3"><label className="form-label">Staff Email Address *</label><input type="email" required placeholder="staffname@gmail.com" className="form-control" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></div>
                  <div className="mb-3"><label className="form-label">Temporary Security Password *</label><div className="input-group"><input type="text" readOnly placeholder="Click Generate to build" className="form-control font-mono" value={generatedPassword} required /><button type="button" onClick={generateRandomPassword} className="btn btn-outline-light fw-bold">Generate</button></div></div>
                  <div className="d-flex gap-2 justify-content-end pt-2">
                    <button type="button" className="btn btn-sm btn-link" onClick={closeCreateModal}>Cancel</button>
                    <button type="submit" className="btn btn-sm btn-primary fw-bold px-3">Create User</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </>
      )}

      {showConfirmStep && (
        <>
          <div className="modal-backdrop show" onClick={() => setShowConfirmStep(false)}></div>
          <div className="modal d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content p-3">
                <h5 className="fw-bold mb-2">Confirm Action</h5>
                <p className="fw-semibold py-2">This action cannot be undone, please be careful.</p>
                <div className="d-flex gap-3 justify-content-center mt-2">
                  <button className="btn btn-sm btn-link flex-grow-1" onClick={() => setShowConfirmStep(false)}>Go Back</button>
                  <button disabled={createLoading} onClick={handleExecuteCreateUser} className="btn btn-sm flex-grow-1 fw-bold">{createLoading ? 'Provisioning...' : 'Yes, Confirm'}</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {selectedUser && (
        <>
          <div className="modal-backdrop show" onClick={() => { setSelectedUser(null); setAdminNewPassword('') }}></div>
          <div className="modal d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content p-3">
                <h5 className="fw-bold mb-2">Force Password Reset</h5>
                <p className="text-muted py-2">Target: <strong>{selectedUser.email}</strong></p>
                <form onSubmit={handleForceChangePassword}>
                  <div className="mb-3"><input type="text" required placeholder="Enter new password" className="form-control font-mono" value={adminNewPassword} onChange={(e) => setAdminNewPassword(e.target.value)} /></div>
                  <div className="d-flex gap-2 justify-content-end">
                    <button type="button" className="btn btn-sm btn-link" onClick={() => { setSelectedUser(null); setAdminNewPassword('') }}>Cancel</button>
                    <button type="submit" disabled={actionLoading} className="btn btn-sm fw-bold px-3">{actionLoading ? <span className="spinner-border spinner-border-sm"></span> : 'Confirm'}</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </>
      )}

      {userToDelete && (
        <>
          <div className="modal-backdrop show" onClick={() => setUserToDelete(null)}></div>
          <div className="modal d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content p-3">
                <h5 className="fw-bold mb-2">Delete User Permanently?</h5>
                <p className="text-muted py-2">System will erase the account for {userToDelete.email}.</p>
                <div className="d-flex gap-2 justify-content-end">
                  <button className="btn btn-sm btn-link" onClick={() => setUserToDelete(null)}>Cancel</button>
                  <button className="btn btn-sm fw-bold px-3" disabled={actionLoading} onClick={handleDeleteUser}>{actionLoading ? <span className="spinner-border spinner-border-sm"></span> : 'Confirm Delete'}</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}