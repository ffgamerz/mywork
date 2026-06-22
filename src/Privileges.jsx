import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function Privileges({ session }) {
  const [users, setUsers] = useState([])
  const [modules, setModules] = useState([])
  const [permissions, setPermissions] = useState({})
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  
  // State Pengurusan Modal Cipta User
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [showConfirmStep, setShowConfirmStep] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [generatedPassword, setGeneratedPassword] = useState('')
  const [createLoading, setCreateLoading] = useState(false)

  const [selectedUser, setSelectedUser] = useState(null)
  const [adminNewPassword, setAdminNewPassword] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // State Delete User
  const [userToDelete, setUserToDelete] = useState(null)

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 5000)
  }

  const loadData = async () => {
    setLoading(true)
    try {
      // 1. Ambil data modul sistem
      const { data: mods, error: modsError } = await supabase.from('system_modules').select('*').order('name')
      if (modsError) throw modsError
      if (mods) setModules(mods)

      // 2. Ambil data profil pengguna
      const { data: profs, error: profsError } = await supabase.from('profiles').select('*').order('email')
      if (profsError) throw profsError
      if (profs) setUsers(profs)

      // 3. Ambil data matriks kebenaran
      const { data: perms, error: permsError } = await supabase.from('user_permissions').select('*')
      if (permsError) throw permsError
      if (perms) {
        const permMap = {}
        perms.forEach(p => { permMap[`${p.user_id}-${p.module_id}`] = p.is_allowed })
        setPermissions(permMap)
      }
    } catch (err) {
      console.error("Ralat memuatkan data Supabase:", err.message)
      alert("Error loading data: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const generateRandomPassword = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#"
    let pass = ""
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setGeneratedPassword(pass)
  }

  const handlePreSubmitCheck = (e) => {
    e.preventDefault()
    if (!generatedPassword) {
      alert('Please generate a temporary password first!')
      return
    }
    setShowConfirmStep(true)
  }

  const handleExecuteCreateUser = async () => {
    setCreateLoading(true)
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: { email: newEmail, password: generatedPassword }
    })

    if (error) {
      alert('Creation failed: ' + error.message)
    } else {
      showToast(`ACCOUNT CREATED SUCCESSFULLY! 🎉\nEmail: ${newEmail}\nTemporary Pass: ${generatedPassword}`)
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
      alert(error.message)
    } else { 
      showToast('User deleted permanently!')
      setUserToDelete(null)
      loadData() 
    }
    setActionLoading(false)
  }

  // DIFAHAMI & DIPERBETULKAN: Memanggil Edge Function untuk kemas kini role dengan kuasa penuh (bypass RLS)
  const handleRoleChange = async (userId, newRole) => {
    setActionLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('admin-change-role', {
        body: { userId, newRole }
      })

      if (error) throw error

      showToast(`Privilege level updated successfully to ${newRole}!`)
      loadData() // Muat semula jadual di skrin
    } catch (err) {
      console.error("Gagal menukar peranan:", err.message)
      alert("Gagal menukar peranan: " + err.message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleTogglePermission = async (userId, moduleId, currentStatus) => {
    const newStatus = !currentStatus
    const { error } = await supabase.from('user_permissions').upsert({
      user_id: userId, module_id: moduleId, is_allowed: newStatus, updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,module_id' })

    if (error) {
      alert(error.message)
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
        body: { userId: selectedUser.id, newPassword: adminNewPassword },
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
      alert("Reset Password Failed: " + err.message)
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      {toast && (
        <div className="toast toast-top toast-end z-[150] p-4">
          <div className="alert alert-success shadow-lg text-white font-medium rounded-xl whitespace-pre-line max-w-md border border-success">
            <span>{toast}</span>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-base-100 pb-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">Privilege & User Manager</h1>
          <p className="text-sm opacity-60">Create organization accounts and delegate dynamic structural rights.</p>
        </div>
        
        <button 
          onClick={() => setIsCreateModalOpen(true)}
          className="btn btn-primary font-bold shadow-lg gap-2 self-start sm:self-auto rounded-xl"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Add New Staff Account
        </button>
      </div>

      <div className="card bg-base-100 shadow-xl p-6 border border-base-200">
        <h3 className="text-lg font-bold mb-4 text-secondary">Interactive Access Control Matrix</h3>
        {loading ? (
          <div className="text-center py-4"><span className="loading loading-spinner"></span></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr>
                  <th>User Email</th>
                  <th>Privilege Level</th>
                  {modules.map(m => (<th key={m.id} className="text-center">{m.name}</th>))}
                  <th className="text-right">Account Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="hover">
                    <td>
                      <div className="flex flex-col">
                        <span className="font-bold text-sm">{u.email || 'No Email'}</span>
                        <span className="text-[10px] font-mono opacity-40">{u.id}</span>
                        {u.requires_password_change && <span className="badge badge-warning badge-xs font-sans mt-1 text-black font-semibold">Force Pass Reset Active</span>}
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-sm font-bold capitalize ${u.role === 'super_admin' ? 'badge-error text-white' : u.role === 'admin' ? 'badge-primary text-white' : 'badge-ghost'}`}>
                        {u.role || 'default'}
                      </span>
                    </td>
                    {modules.map(m => {
                      const isChecked = !!permissions[`${u.id}-${m.id}`];
                      return (
                        <td key={m.id} className="text-center">
                          <input 
                            type="checkbox" 
                            className="checkbox checkbox-primary checkbox-sm" 
                            checked={isChecked} 
                            disabled={false} 
                            onChange={() => handleTogglePermission(u.id, m.id, permissions[`${u.id}-${m.id}`])} 
                          />
                        </td>
                      )
                    })}
                    <td className="text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setSelectedUser(u)} className="btn btn-xs btn-outline btn-error">Reset Pass</button>
                        <button onClick={() => setUserToDelete(u)} className="btn btn-xs btn-outline btn-ghost text-error">Delete</button>
                        <div className="divider divider-horizontal mx-0.5"></div>
                        
                        {/* Atribut disabled dikawal mengikut nilai role semasa di database */}
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

      {/* MODAL ADD NEW STAFF */}
      {isCreateModalOpen && (
        <div className="modal modal-open z-[100]">
          <div className="modal-box max-w-md border border-base-200 shadow-2xl rounded-2xl p-6">
            <h3 className="font-bold text-xl text-primary flex items-center gap-2 mb-2">Provision Staff Account</h3>
            <p className="text-xs opacity-60 mb-4">Register new access coordinates within the cloud framework.</p>
            <form onSubmit={handlePreSubmitCheck} className="space-y-4">
              <div className="form-control">
                <label className="label-text font-semibold mb-1">Staff Email Address</label>
                <input type="email" required placeholder="staffname@gmail.com" className="input input-bordered w-full text-base rounded-xl" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              </div>
              <div className="form-control">
                <label className="label-text font-semibold mb-1">Temporary Security Password</label>
                <div className="flex gap-2">
                  <input type="text" readOnly placeholder="Click Generate to build" className="input input-bordered flex-1 text-base font-mono bg-base-200 rounded-xl px-3" value={generatedPassword} required />
                  <button type="button" onClick={generateRandomPassword} className="btn btn-secondary font-bold rounded-xl px-4">Generate</button>
                </div>
              </div>
              <div className="modal-action gap-2 pt-2">
                <button type="button" className="btn btn-sm btn-ghost rounded-lg" onClick={() => { setIsCreateModalOpen(false); setNewEmail(''); setGeneratedPassword(''); }}>Cancel</button>
                <button type="submit" className="btn btn-sm btn-primary rounded-lg font-bold px-4">Create User</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMATION */}
      {showConfirmStep && (
        <div className="modal modal-open z-[200]">
          <div className="modal-box max-w-sm border-2 border-warning shadow-2xl bg-base-100 rounded-2xl p-6 text-center">
            <h3 className="font-black text-xl text-warning">Confirm Action</h3>
            <p className="py-2 text-sm font-semibold opacity-90">This action cannot be undone, please be careful.</p>
            <div className="flex justify-center gap-3 mt-4">
              <button className="btn btn-sm btn-ghost rounded-lg flex-1" onClick={() => setShowConfirmStep(false)}>Go Back</button>
              <button disabled={createLoading} onClick={handleExecuteCreateUser} className="btn btn-sm btn-warning text-black font-bold flex-1 rounded-lg">
                {createLoading ? 'Provisioning...' : 'Yes, Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FORCE RESET PASSWORD */}
      {selectedUser && (
        <div className="modal modal-open z-[100]">
          <div className="modal-box max-w-sm border border-base-200 rounded-2xl p-6">
            <h3 className="font-bold text-lg text-error">Force Password Reset</h3>
            <p className="py-2 text-xs opacity-70">Target: <strong>{selectedUser.email}</strong></p>
            <form onSubmit={handleForceChangePassword} className="space-y-4 mt-2">
              <input type="text" required placeholder="Enter new password" className="input input-bordered w-full text-base font-mono rounded-xl" value={adminNewPassword} onChange={(e) => setAdminNewPassword(e.target.value)} />
              <div className="modal-action">
                <button type="button" className="btn btn-sm btn-ghost rounded-lg" onClick={() => { setSelectedUser(null); setAdminNewPassword(''); }}>Cancel</button>
                <button type="submit" disabled={actionLoading} className="btn btn-sm btn-error text-white rounded-lg px-4">Confirm</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DELETE USER */}
      {userToDelete && (
        <div className="modal modal-open z-[100]">
          <div className="modal-box max-w-sm border border-base-200 rounded-2xl p-6">
            <h3 className="font-bold text-lg text-error">Delete User Permanently?</h3>
            <p className="py-2 text-xs opacity-70">Sistem akan memadam akaun <strong>{userToDelete.email}</strong>.</p>
            <div className="modal-action">
              <button className="btn btn-sm btn-ghost" onClick={() => setUserToDelete(null)}>Cancel</button>
              <button className="btn btn-sm btn-error text-white font-bold rounded-lg px-4" disabled={actionLoading} onClick={handleDeleteUser}>
                {actionLoading ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}