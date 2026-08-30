import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'
import ToastBar from './components/ToastBar'
import { useToast } from './utils/useToast'
import { getErrorMessage } from './utils/error'

export default function Privileges() {
  const [users, setUsers] = useState([])
  const [modules, setModules] = useState([])
  const [permissions, setPermissions] = useState({})
  const [loadingData, setLoadingData] = useState(false)

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

  const { toast, showToast, hideToast } = useToast()

  const [searchTerm, setSearchTerm] = useState('')
  const [activeUserId, setActiveUserId] = useState(null)

  const getInitials = (u) => (u.full_name || u.email || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const getRoleBadge = (role) => role === 'super_admin' ? 'badge-error' : role === 'admin' ? 'badge-warning' : 'badge-success'

  const loadData = useCallback(async () => {
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
      showToast('Error loading data: ' + err.message, 'error')
    } finally {
      setLoadingData(false)
    }
  }, [showToast])

  useEffect(() => {
    let mounted = true
    Promise.resolve().then(() => { if (mounted) loadData() })
    return () => { mounted = false }
  }, [loadData])

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
    if (error) { showToast('Creation failed: ' + error.message, 'error') } else {
      if (newFullName.trim()) await supabase.from('profiles').update({ full_name: newFullName.trim() }).eq('email', newEmail.trim())
      showToast(`ACCOUNT CREATED SUCCESSFULLY! 🎉\nName: ${newFullName.trim() || newEmail}\nEmail: ${newEmail}\nTemporary Pass: ${generatedPassword}`)
      setNewFullName(''); setNewEmail(''); setGeneratedPassword(''); setShowConfirmStep(false); setIsCreateModalOpen(false); loadData()
    }
    setCreateLoading(false)
  }

  const handleDeleteUser = async () => {
    setActionLoading(true)
    const { error } = await supabase.functions.invoke('admin-delete-user', { body: { userId: userToDelete.id } })
    if (error) showToast(await getErrorMessage(error), 'error')
    else { showToast('User deleted permanently!'); setUserToDelete(null); loadData() }
    setActionLoading(false)
  }

  const handleRoleChange = async (userId, newRole) => {
    setActionLoading(true)
    try {
      const { error } = await supabase.functions.invoke('admin-change-role', { body: { userId, newRole } })
      if (error) throw error
      showToast(`Privilege level updated successfully to ${newRole}!`); loadData()
    } catch (err) { showToast(await getErrorMessage(err), 'error') } finally { setActionLoading(false) }
  }

  const handleTogglePermission = async (userId, moduleId, currentStatus) => {
    const newStatus = !currentStatus
    const { error } = await supabase.from('user_permissions').upsert({ user_id: userId, module_id: moduleId, is_allowed: newStatus, updated_at: new Date().toISOString() }, { onConflict: 'user_id,module_id' })
    if (error) showToast(error.message, 'error')
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
    } catch (err) { showToast('Reset Password Failed: ' + await getErrorMessage(err), 'error') } finally { setActionLoading(false) }
  }

  const closeCreateModal = () => { setIsCreateModalOpen(false); setNewFullName(''); setNewEmail(''); setGeneratedPassword(''); setShowConfirmStep(false) }

  return (
    <div className="max-w-1200 mx-auto">
      <ToastBar toast={toast} onClose={hideToast} />

      <div className="page-header-custom d-flex flex-wrap justify-content-between align-items-start gap-3">
        <div>
          <h1 className="page-title-custom"><span className="material-symbols-outlined me-2 icon-xl">admin_panel_settings</span> Privilege & User Manager</h1>
          <p className="page-subtitle-custom">Create organization accounts and delegate dynamic structural rights.</p>
        </div>
        <button onClick={() => setIsCreateModalOpen(true)} className="btn btn-primary fw-bold">
          <span className="material-symbols-outlined me-1 icon-sm">person_add</span> Add Staff
        </button>
      </div>

      {loadingData ? (
        <div className="text-center py-5"><span className="spinner-border"></span></div>
      ) : users.length === 0 ? (
        <div className="card p-5 empty-state">
          <span className="material-symbols-outlined mb-2" style={{ fontSize: '40px' }}>group_off</span>
          <p className="fw-bold text-muted">No users registered yet.</p>
        </div>
      ) : (
        <div className="row g-3">
          {/* ===== LEFT: user list ===== */}
          <div className="col-lg-4 d-flex flex-column gap-2">
            <div className="input-group">
              <span className="input-group-text"><span className="material-symbols-outlined icon-sm">search</span></span>
              <input type="text" className="form-control" placeholder="Search name or email..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <div className="d-flex flex-column gap-2 overflow-auto pe-1" style={{ maxHeight: '640px' }}>
              {users
                .filter(u => {
                  const term = searchTerm.trim().toLowerCase()
                  if (!term) return true
                  return (u.full_name || '').toLowerCase().includes(term) || (u.email || '').toLowerCase().includes(term)
                })
                .map((u) => (
                  <div key={u.id} onClick={() => setActiveUserId(u.id)} className={`card p-3 cursor-pointer transition-all ${u.id === (users.find(x => x.id === activeUserId) || users[0])?.id ? 'bg-accent-15' : ''}`}>
                    <div className="d-flex align-items-center gap-2">
                      <div className="avatar-custom bg-gradient-avatar text-white flex-shrink-0">{getInitials(u)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="fw-bold text-white text-truncate">{u.full_name || '-'}</div>
                        <div className="text-muted text-12 text-truncate">{u.email || 'No Email'}</div>
                      </div>
                      <span className={`badge flex-shrink-0 ${getRoleBadge(u.role)}`}>{u.role || 'default'}</span>
                    </div>
                  </div>
                ))}
              {users.filter(u => {
                const term = searchTerm.trim().toLowerCase()
                if (!term) return true
                return (u.full_name || '').toLowerCase().includes(term) || (u.email || '').toLowerCase().includes(term)
              }).length === 0 && <div className="text-center text-muted py-4">No users match your search.</div>}
            </div>
          </div>

          {/* ===== RIGHT: detail panel ===== */}
          <div className="col-lg-8">
            {(() => {
              const activeUser = users.find(u => u.id === activeUserId) || users[0]
              if (!activeUser) return <div className="card p-5 text-center text-muted">Select a user from the list to manage access.</div>
              const isSuper = activeUser.role === 'super_admin'
              return (
                <div className="card p-4 d-flex flex-column gap-3">
                  {/* Identity */}
                  <div className="d-flex align-items-center gap-3">
                    <div className="avatar-custom bg-gradient-avatar text-white flex-shrink-0" style={{ width: '48px', height: '48px', fontSize: '18px' }}>{getInitials(activeUser)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="fw-bold text-white">{activeUser.full_name || '-'}</div>
                      <div className="text-muted text-14">{activeUser.email || 'No Email'}</div>
                      <div className="font-mono text-11 text-tertiary text-truncate">{activeUser.id}</div>
                    </div>
                    <div className="d-flex flex-column gap-1 align-items-end flex-shrink-0">
                      <span className={`badge ${getRoleBadge(activeUser.role)}`}>{activeUser.role || 'default'}</span>
                      {activeUser.requires_password_change && <span className="badge badge-warning">Force Pass Reset</span>}
                    </div>
                  </div>

                  <div className="divider-gradient"></div>

                  {/* Privilege level */}
                  <div>
                    <div className="section-label text-muted mb-2">Privilege Level</div>
                    {isSuper ? (
                      <div className="text-muted text-14">Super Admin role is managed directly in the database.</div>
                    ) : (
                      <div className="d-flex gap-2">
                        <button
                          className={`btn btn-sm fw-bold ${(!activeUser.role || activeUser.role === 'default') ? 'btn-primary' : 'btn-outline-secondary'}`}
                          disabled={actionLoading || (!activeUser.role || activeUser.role === 'default')}
                          onClick={() => handleRoleChange(activeUser.id, 'default')}
                        >Default</button>
                        <button
                          className={`btn btn-sm fw-bold ${activeUser.role === 'admin' ? 'btn-primary' : 'btn-outline-secondary'}`}
                          disabled={actionLoading || activeUser.role === 'admin'}
                          onClick={() => handleRoleChange(activeUser.id, 'admin')}
                        >Admin</button>
                      </div>
                    )}
                  </div>

                  {/* Module access */}
                  <div>
                    <div className="section-label text-muted mb-2">Module Access</div>
                    <div className="row g-2">
                      {modules.map(m => {
                        const isChecked = !!permissions[`${activeUser.id}-${m.id}`]
                        return (
                          <div className="col-md-6" key={m.id}>
                            <div className="d-flex align-items-center justify-content-between gap-2 p-2 rounded-12 bg-base-200">
                              <span className="small text-truncate">{m.name}</span>
                              <div className="form-check form-switch mb-0 flex-shrink-0">
                                <input className="form-check-input" type="checkbox" role="switch" checked={isChecked} onChange={() => handleTogglePermission(activeUser.id, m.id, isChecked)} />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="divider-gradient"></div>

                  {/* Danger zone */}
                  <div>
                    <div className="section-label text-error mb-2">Danger Zone</div>
                    <div className="d-flex flex-wrap gap-2">
                      <button className="btn btn-sm btn-outline-warning fw-bold" onClick={() => { setSelectedUser(activeUser); setAdminNewPassword('') }}>
                        <span className="material-symbols-outlined me-1 icon-sm">key</span> Force Password Reset
                      </button>
                      <button className="btn btn-sm btn-outline-danger fw-bold" onClick={() => setUserToDelete(activeUser)}>
                        <span className="material-symbols-outlined me-1 icon-sm">delete</span> Delete User
                      </button>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

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
                  <div className="mb-3"><label className="form-label">Temporary Security Password *</label><div className="input-group"><input type="text" readOnly placeholder="Click Generate to build" className="form-control font-mono" value={generatedPassword} required /><button type="button" onClick={generateRandomPassword} className="btn btn-outline-secondary fw-bold">Generate</button></div></div>
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