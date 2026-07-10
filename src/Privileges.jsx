import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { getTranslation } from './utils/translation'

export default function Privileges({ session, lang = 'en' }) {
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

  const t = (key) => getTranslation(lang, key)

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
      console.error('Ralat memuatkan data:', err.message)
      showToast(t('errLoad') + err.message)
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
      showToast(t('alertGeneratePass'))
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
      showToast(t('errCreate') + error.message)
    } else {
      if (newFullName.trim()) {
        await supabase
          .from('profiles')
          .update({ full_name: newFullName.trim() })
          .eq('email', newEmail.trim())
      }

      const successMsg = t('toastCreatedSuccess')
        .replace('{name}', newFullName.trim() || newEmail)
        .replace('{email}', newEmail)
        .replace('{password}', generatedPassword)

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
      showToast(t('toastDeletedSuccess'))
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
      showToast(t('toastRoleSuccess').replace('{role}', newRole))
      loadData()
    } catch (err) {
      console.error('Gagal menukar peranan:', err.message)
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
      showToast(t('toastPermSuccess'))
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

      showToast(t('toastResetSuccess').replace('{email}', selectedUser.email))
      setAdminNewPassword('')
      setSelectedUser(null)
      loadData()
    } catch (err) {
      showToast(t('errReset') + err.message)
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
        <div className="toast toast-top toast-end z-[150] p-4">
          <div className="alert alert-success shadow-lg text-white font-medium rounded-xl whitespace-pre-line max-w-md border border-success">
            <span>{toast}</span>
          </div>
        </div>
      )}

      <div className="page-header sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="page-title">{t('privTitle')}</h1>
          <p className="page-subtitle">{t('privSubtitle')}</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="primary-action gap-2 self-start sm:self-auto"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {t('addStaffBtn')}
        </button>
      </div>

      <div className="content-card p-6">
        <h3 className="section-title mb-4 text-secondary">{t('matrixTitle')}</h3>

        {loadingData ? (
          <div className="flex justify-center py-12">
            <span className="loading loading-spinner loading-lg text-primary"></span>
          </div>
        ) : users.length === 0 ? (
          <div className="empty-state py-12 gap-3 opacity-70">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94-3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
            </svg>
            <p className="font-bold text-sm">
              {lang === 'ms' ? 'Tiada pengguna didaftarkan lagi.' : lang === 'zh' ? '暂无注册用户。' : 'No users registered yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr>
                  <th>{t('thEmail')}</th>
                  <th>{t('thLevel')}</th>
                  {modules.map(m => (
                    <th key={m.id} className="text-center">{m.name}</th>
                  ))}
                  <th className="text-right">{t('thActions')}</th>
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
                            {t('badgeForceReset')}
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
                          {t('btnResetPass')}
                        </button>
                        <button
                          onClick={() => setUserToDelete(u)}
                          className="btn btn-xs btn-outline btn-ghost text-error"
                        >
                          {lang === 'ms' ? 'Padam' : lang === 'zh' ? '删除' : 'Delete'}
                        </button>
                        <div className="divider divider-horizontal mx-0.5"></div>
                        <button
                          onClick={() => handleRoleChange(u.id, 'default')}
                          disabled={actionLoading || u.role === 'super_admin' || u.role === 'default' || !u.role}
                          className={`btn btn-xs ${u.role === 'default' || !u.role ? 'btn-active opacity-40' : 'btn-outline'}`}
                        >
                          {t('lblDefault')}
                        </button>
                        <button
                          onClick={() => handleRoleChange(u.id, 'admin')}
                          disabled={actionLoading || u.role === 'super_admin' || u.role === 'admin'}
                          className={`btn btn-xs btn-primary ${u.role === 'admin' ? 'btn-active opacity-40' : 'btn-outline'}`}
                        >
                          {t('lblAdmin')}
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
          <div className="modal-box max-w-md border border-base-200 shadow-2xl rounded-2xl p-6">
            <h3 className="font-bold text-xl text-primary flex items-center gap-2 mb-2">{t('modalCreateTitle')}</h3>
            <p className="text-xs opacity-60 mb-4">{t('modalCreateSubtitle')}</p>
            <form onSubmit={handlePreSubmitCheck} className="space-y-4">
              <div className="form-control">
                <label className="label-text font-semibold mb-1">{t('lblFullName')} *</label>
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
                <label className="label-text font-semibold mb-1">{t('lblEmail')} *</label>
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
                <label className="label-text font-semibold mb-1">{t('lblTempPass')} *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    placeholder={t('placeholderGenerate')}
                    className="input input-bordered flex-1 text-base font-mono bg-base-200 rounded-xl px-3"
                    value={generatedPassword}
                    required
                  />
                  <button type="button" onClick={generateRandomPassword} className="btn btn-secondary text-white font-bold px-4">
                    {t('btnGenerate')}
                  </button>
                </div>
              </div>
              <div className="modal-action gap-2 pt-2">
                <button type="button" className="btn btn-sm btn-ghost" onClick={closeCreateModal}>
                  {t('cancel')}
                </button>
                <button type="submit" className="btn btn-sm btn-primary text-white font-bold px-4">
                  {t('btnCreateUser')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirm */}
      {showConfirmStep && (
        <div className="modal modal-open z-[200]">
          <div className="modal-box max-w-sm border-2 border-warning shadow-2xl bg-base-100 rounded-2xl p-6 text-center">
            <h3 className="font-black text-xl text-warning">{t('modalConfirmTitle')}</h3>
            <p className="py-2 text-sm font-semibold opacity-90">{t('modalConfirmSubtitle')}</p>
            <div className="flex justify-center gap-3 mt-4">
              <button className="btn btn-sm btn-ghost flex-1" onClick={() => setShowConfirmStep(false)}>
                {t('btnGoBack')}
              </button>
              <button
                disabled={createLoading}
                onClick={handleExecuteCreateUser}
                className="btn btn-sm btn-warning text-black font-bold flex-1"
              >
                {createLoading ? t('btnProvisioning') : t('btnConfirmYes')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Reset Password */}
      {selectedUser && (
        <div className="modal modal-open z-[100]">
          <div className="modal-box max-w-sm border border-base-200 rounded-2xl p-6">
            <h3 className="font-bold text-lg text-error">{t('modalResetTitle')}</h3>
            <p className="py-2 text-xs opacity-70">
              {t('modalResetTarget')}<strong>{selectedUser.email}</strong>
            </p>
            <form onSubmit={handleForceChangePassword} className="space-y-4 mt-2">
              <input
                type="text"
                required
                placeholder={t('placeholderNewPass')}
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
                  {t('cancel')}
                </button>
                <button type="submit" disabled={actionLoading} className="btn btn-sm btn-error text-white font-bold px-4">
                  {actionLoading ? <span className="loading loading-spinner loading-xs"></span> : t('btnConfirm')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Delete User */}
      {userToDelete && (
        <div className="modal modal-open z-[100]">
          <div className="modal-box max-w-sm border border-base-200 rounded-2xl p-6">
            <h3 className="font-bold text-lg text-error">{t('modalDeleteTitle')}</h3>
            <p className="py-2 text-xs opacity-70">
              {t('modalDeleteDesc').replace('{email}', userToDelete.email)}
            </p>
            <div className="modal-action">
              <button className="btn btn-sm btn-ghost" onClick={() => setUserToDelete(null)}>
                {t('cancel')}
              </button>
              <button
                className="btn btn-sm btn-error text-white font-bold px-4"
                disabled={actionLoading}
                onClick={handleDeleteUser}
              >
                {actionLoading
                  ? <span className="loading loading-spinner loading-xs"></span>
                  : t('btnConfirmDelete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
