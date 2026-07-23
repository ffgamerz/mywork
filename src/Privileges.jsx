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
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setGeneratedPassword(pass)
  }

  const handlePreSubmitCheck = (e) => {
    e.preventDefault()
    if (!generatedPassword) {
      showToast('Please generate a temporary password first!')
      return
    }
    setShowConfirmStep(true)
  }

  const handleExecuteCreateUser = async () => {
    setCreateLoading(true)
    const { error } = await supabase.functions.invoke('admin-create-user', {
      body: { email: newEmail, password: generatedPassword }
    })

    if (error) {
      showToast('Creation failed: ' + error.message)
    } else {
      if (newFullName.trim()) {
        await supabase
          .from('profiles')
          .update({ full_name: newFullName.trim() })
          .eq('email', newEmail.trim())
      }

      const successMsg = `ACCOUNT CREATED SUCCESSFULLY! 🎉\nName: ${newFullName.trim() || newEmail}\nEmail: ${newEmail}\nTemporary Pass: ${generatedPassword}`

      showToast(successMsg)
      setNewFullName('')
      setNewEmail('')
      setGeneratedPassword('')
      setShowConfirmStep(false)
      setIsCreateModalOpen(false)
      loadData()
    }
    setCreateLoading(false)
  }

  const handleDeleteUser = async () => {
    setActionLoading(true)
    const { error } = await supabase.functions.invoke('admin-delete-user', {
      body: { userId: userToDelete.id }
    })
    if (error) {
      showToast(error.message)
    } else {
      showToast('User deleted permanently!')
      setUserToDelete(null)
      loadData()
    }
    setActionLoading(false)
  }

  const handleRoleChange = async (userId, newRole) => {
    setActionLoading(true)
    try {
      const { error } = await supabase.functions.invoke('admin-change-role', {
        body: { userId, newRole }
      })
      if (error) throw error
      showToast(`Privilege level updated successfully to ${newRole}!`)
      loadData()
    } catch (err) {
      console.error('Error changing role:', err.message)
      showToast(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleTogglePermission = async (userId, moduleId, currentStatus) => {
    const newStatus = !currentStatus
    const { error } = await supabase.from('user_permissions').upsert({
      user_id: userId,
      module_id: moduleId,
      is_allowed: newStatus,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,module_id' })

    if (error) {
      showToast(error.message)
    } else {
      setPermissions(prev => ({ ...prev, [`${userId}-${moduleId}`]: newStatus }))
      showToast('Preference updated!')
    }
  }

  const handleForceChangePassword = async (e) => {
    e.preventDefault()
    setActionLoading(true)
    try {
      const { error: funcError } = await supabase.functions.invoke('admin-change-password', {
        body: { userId: selectedUser.id, newPassword: adminNewPassword }
      })
      if (funcError) throw funcError

      const { error: dbError } = await supabase
        .from('profiles')
        .update({ requires_password_change: true, updated_at: new Date().toISOString() })
        .eq('id', selectedUser.id)
      if (dbError) throw dbError

      showToast(`Password updated and forced reset active for ${selectedUser.email}`)
      setAdminNewPassword('')
      setSelectedUser(null)
      loadData()
    } catch (err) {
      showToast('Reset Password Failed: ' + err.message)
    } finally {
      setActionLoading(false)
    }
  }

  const closeCreateModal = () => {
    setIsCreateModalOpen(false)
    setNewFullName('')
    setNewEmail('')
    setGeneratedPassword('')
    setShowConfirmStep(false)
  }

  return (
    <div className="page-shell">
      {toast && (
        <div className="toast-success">
          <div className="alert-toast">
            <span>{toast}</span>
          </div>
        </div>
      )}

      <div className="page-header sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="page-title">Privilege & User Manager</h1>
          <p className="page-subtitle">Create organization accounts and delegate dynamic structural rights.</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="primary-action gap-2 self-start sm:self-auto"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add New Staff Account
        </button>
      </div>

      <div className="content-card p-4">
        <h3 className="text-base font-bold mb-3 text-secondary">Interactive Access Control Matrix</h3>

        {loadingData ? (
          <div className="flex justify-center py-12">
            <span className="loading loading-spinner loading-lg text-primary"></span>
          </div>
        ) : users.length === 0 ? (
          <div className="empty-state py-12 gap-3 opacity-70">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94-3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
            </svg>
            <p className="font-bold text-sm">No users registered yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr>
                  <th>User Details</th>
                  <th>Privilege Level</th>
                  {modules.map(m => (
                    <th key={m.id} className="text-center">{m.name}</th>
                  ))}
                  <th className="text-right">Account Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="hover">
                    <td>
                      <div className="flex flex-col">
                        <span className="font-black text-base text-base-content tracking-wide">{u.full_name || '-'}</span>
                        <span className="font-medium text-xs opacity-60">{u.email || 'No Email'}</span>
                        <span className="text-[10px] font-mono opacity-30">{u.id}</span>
                        {u.requires_password_change && (
                          <span className="badge badge-warning badge-xs font-sans mt-1 text-black font-semibold">
                            Force Pass Reset Active
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-sm font-bold capitalize ${u.role === 'super_admin' ? 'badge-error text-white' : u.role === 'admin' ? 'badge-primary text-white' : 'badge-ghost'}`}>
                        {u.role || 'default'}
                      </span>
                    </td>
                    {modules.map(m => {
                      const isChecked = !!permissions[`${u.id}-${m.id}`]
                      return (
                        <td key={m.id} className="text-center">
                          <input
                            type="checkbox"
                            className="checkbox checkbox-primary checkbox-sm"
                            checked={isChecked}
                            onChange={() => handleTogglePermission(u.id, m.id, permissions[`${u.id}-${m.id}`])}
                          />
                        </td>
                      )
                    })}
                    <td className="text-right">
                      <div className="flex justify-end gap-1 flex-wrap">
                        <button
                          onClick={() => setSelectedUser(u)}
                          className="btn btn-xs btn-outline btn-error"
                        >
                          Reset Pass
                        </button>
                        <button
                          onClick={() => setUserToDelete(u)}
                          className="btn btn-xs btn-outline btn-ghost text-error"
                        >
                          Delete
                        </button>
                        <div className="divider divider-horizontal mx-0.5"></div>
                        <button
                          onClick={() => handleRoleChange(u.id, 'default')}
                          disabled={actionLoading || u.role === 'super_admin' || u.role === 'default' || !u.role}
                          className={`btn btn-xs ${u.role === 'default' || !u.role ? 'btn-active opacity-40' : 'btn-outline'}`}
                        >
                          Default
                        </button>
                        <button
                          onClick={() => handleRoleChange(u.id, 'admin')}
                          disabled={actionLoading || u.role === 'super_admin' || u.role === 'admin'}
                          className={`btn btn-xs btn-primary ${u.role === 'admin' ? 'btn-active opacity-40' : 'btn-outline'}`}
                        >
                          Admin
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Tambah Staf */}
      {isCreateModalOpen && (
        <div className="modal modal-open z-[100]">
          <div className="modal-backdrop" onClick={closeCreateModal}></div>
          <div className="modal-box--md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-xl text-primary flex items-center gap-2 mb-2">Provision Staff Account</h3>
            <p className="text-xs opacity-60 mb-4">Register new access coordinates within the cloud framework.</p>
            <form onSubmit={handlePreSubmitCheck} className="space-y-4">
              <div className="form-control">
                <label className="label-text font-semibold mb-1">Staff Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="Ahmad Bin Ali"
                  className="input input-bordered w-full text-base rounded-xl"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                />
              </div>
              <div className="form-control">
                <label className="label-text font-semibold mb-1">Staff Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="staffname@gmail.com"
                  className="input input-bordered w-full text-base rounded-xl"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
              <div className="form-control">
                <label className="label-text font-semibold mb-1">Temporary Security Password *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    placeholder="Click Generate to build"
                    className="input input-bordered flex-1 text-base font-mono bg-base-200 rounded-xl px-3"
                    value={generatedPassword}
                    required
                  />
                  <button type="button" onClick={generateRandomPassword} className="btn btn-secondary text-white font-bold px-4">
                    Generate
                  </button>
                </div>
              </div>
              <div className="modal-action gap-2 pt-2">
                <button type="button" className="btn btn-sm btn-ghost" onClick={closeCreateModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-sm btn-primary text-white font-bold px-4">
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirm */}
      {showConfirmStep && (
        <div className="modal modal-open z-[200]">
          <div className="modal-backdrop" onClick={() => setShowConfirmStep(false)}></div>
          <div className="modal-box--sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-xl text-warning mb-2">Confirm Action</h3>
            <p className="py-2 text-sm font-semibold opacity-90">This action cannot be undone, please be careful.</p>
            <div className="flex justify-center gap-3 mt-4">
              <button className="btn btn-sm btn-ghost flex-1" onClick={() => setShowConfirmStep(false)}>
                Go Back
              </button>
              <button
                disabled={createLoading}
                onClick={handleExecuteCreateUser}
                className="btn btn-sm btn-warning text-black font-bold flex-1"
              >
                {createLoading ? 'Provisioning...' : 'Yes, Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Reset Password */}
      {selectedUser && (
        <div className="modal modal-open z-[100]">
          <div className="modal-backdrop" onClick={() => { setSelectedUser(null); setAdminNewPassword('') }}></div>
          <div className="modal-box--sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-error">Force Password Reset</h3>
            <p className="py-2 text-xs opacity-70">
              Target: <strong>{selectedUser.email}</strong>
            </p>
            <form onSubmit={handleForceChangePassword} className="space-y-4 mt-2">
              <input
                type="text"
                required
                placeholder="Enter new password"
                className="input input-bordered w-full text-base font-mono rounded-xl"
                value={adminNewPassword}
                onChange={(e) => setAdminNewPassword(e.target.value)}
              />
              <div className="modal-action">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => { setSelectedUser(null); setAdminNewPassword('') }}
                >
                  Cancel
                </button>
                <button type="submit" disabled={actionLoading} className="btn btn-sm btn-error text-white font-bold px-4">
                  {actionLoading ? <span className="loading loading-spinner loading-xs"></span> : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Delete User */}
      {userToDelete && (
        <div className="modal modal-open z-[100]">
          <div className="modal-backdrop" onClick={() => setUserToDelete(null)}></div>
          <div className="modal-box--sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-error">Delete User Permanently?</h3>
            <p className="py-2 text-xs opacity-70">
              System will erase the account for {userToDelete.email}.
            </p>
            <div className="modal-action">
              <button className="btn btn-sm btn-ghost" onClick={() => setUserToDelete(null)}>
                Cancel
              </button>
              <button
                className="btn btn-sm btn-error text-white font-bold px-4"
                disabled={actionLoading}
                onClick={handleDeleteUser}
              >
                {actionLoading
                  ? <span className="loading loading-spinner loading-xs"></span>
                  : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}