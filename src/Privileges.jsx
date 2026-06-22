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

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 5000) // Panjangkan sikit masa untuk mudahkan salin password
  }

  const loadData = async () => {
    setLoading(true)
    const { data: mods } = await supabase.from('system_modules').select('*').order('name')
    if (mods) setModules(mods)

    const { data: profs } = await supabase.from('profiles').select('*').order('email')
    if (profs) setUsers(profs)

    const { data: perms } = await supabase.from('user_permissions').select('*')
    if (perms) {
      const permMap = {}
      perms.forEach(p => { permMap[`${p.user_id}-${p.module_id}`] = p.is_allowed })
      setPermissions(permMap)
    }
    setLoading(false)
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

  // Fungsi pra-submit untuk semak data sebelum tunjuk amaran mutakhir
  const handlePreSubmitCheck = (e) => {
    e.preventDefault()
    if (!generatedPassword) {
      alert('Please generate a temporary password first!')
      return
    }
    setShowConfirmStep(true) // Buka pop-up amaran
  }

  // Fungsi sebenar pendaftaran akaun ke server Supabase
  const handleExecuteCreateUser = async () => {
    setCreateLoading(true)
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: { email: newEmail, password: generatedPassword }
    })

    if (error) {
      alert('Creation failed: ' + error.message)
    } else {
      showToast(`ACCOUNT CREATED SUCCESSFULLY! 🎉\nEmail: ${newEmail}\nTemporary Pass: ${generatedPassword}\n(Please copy and share with the user)`)
      setNewEmail('')
      setGeneratedPassword('')
      setShowConfirmStep(false)
      setIsCreateModalOpen(false) // Tutup modal utama
      loadData()
    }
    setCreateLoading(false)
  }

  const handleRoleChange = async (userId, newRole) => {
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId)
    if (error) alert(error.message)
    else { showToast('Privilege role updated!'); loadData() }
  }

  const handleTogglePermission = async (userId, moduleId, currentStatus) => {
    const newStatus = !currentStatus
    const { error } = await supabase.from('user_permissions').upsert({
      user_id: userId, module_id: moduleId, is_allowed: newStatus, updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,module_id' })

    if (error) alert(error.message)
    else {
      setPermissions(prev => ({ ...prev, [`${userId}-${moduleId}`]: newStatus }))
      showToast('Preference updated!')
    }
  }

  const handleForceChangePassword = async (e) => {
    e.preventDefault()
    setActionLoading(true)
    const { error } = await supabase.functions.invoke('admin-change-password', {
      body: { userId: selectedUser.id, newPassword: adminNewPassword },
    })
    if (error) alert(error.message)
    else {
      await supabase.from('profiles').update({ requires_password_change: true }).eq('id', selectedUser.id)
      showToast(`Password updated and forced reset active for ${selectedUser.email}`)
      setAdminNewPassword('')
      setSelectedUser(null)
    }
    setActionLoading(false)
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

      {/* TAJUK HALAMAN & BUTANG ACTION POPUP */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-base-100 pb-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">Privilege & User Manager</h1>
          <p className="text-sm opacity-60">Create organization accounts and delegate dynamic structural rights.</p>
        </div>
        
        {/* BUTANG UTAMA UNTUK BUKA MODAL */}
        <button 
          onClick={() => setIsCreateModalOpen(true)}
          className="btn btn-primary font-bold shadow-lg gap-2 self-start sm:self-auto rounded-xl"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Add New Staff Account
        </button>
      </div>

      {/* JADUAL MATRIKS KEBENARAN */}
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
                      const isSuperOrAdmin = u.role === 'super_admin' || u.role === 'admin';
                      const isChecked = isSuperOrAdmin || !!permissions[`${u.id}-${m.id}`];
                      return (
                        <td key={m.id} className="text-center">
                          <input type="checkbox" className="checkbox checkbox-primary checkbox-sm" checked={isChecked} disabled={isSuperOrAdmin} onChange={() => handleTogglePermission(u.id, m.id, permissions[`${u.id}-${m.id}`])} />
                          {isSuperOrAdmin && <div className="text-[9px] text-primary font-medium mt-0.5">By Right</div>}
                        </td>
                      )
                    })}
                    <td className="text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setSelectedUser(u)} className="btn btn-xs btn-outline btn-error">Reset Pass</button>
                        <div className="divider divider-horizontal mx-0.5"></div>
                        <button onClick={() => handleRoleChange(u.id, 'default')} disabled={u.role === 'super_admin'} className={`btn btn-xs ${u.role === 'default' ? 'btn-active opacity-40' : 'btn-outline'}`}>Default</button>
                        <button onClick={() => handleRoleChange(u.id, 'admin')} disabled={u.role === 'super_admin'} className={`btn btn-xs btn-primary ${u.role === 'admin' ? 'btn-active opacity-40' : 'btn-outline'}`}>Admin</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL UTAMA: BORANG ADD NEW STAFF */}
      {isCreateModalOpen && (
        <div className="modal modal-open z-[100]">
          <div className="modal-box max-w-md border border-base-200 shadow-2xl rounded-2xl p-6">
            <h3 className="font-bold text-xl text-primary flex items-center gap-2 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" /></svg>
              Provision Staff Account
            </h3>
            <p className="text-xs opacity-60 mb-4">Register new access coordinates within the cloud framework.</p>
            
            <form onSubmit={handlePreSubmitCheck} className="space-y-4">
              <div className="form-control">
                <label className="label-text font-semibold mb-1">Staff Email Address</label>
                <input 
                  type="email" required placeholder="staffname@gmail.com" className="input input-bordered w-full text-base rounded-xl"
                  value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>

              <div className="form-control">
                <label className="label-text font-semibold mb-1">Temporary Security Password</label>
                <div className="flex gap-2">
                  <input 
                    type="text" readOnly placeholder="Click Generate to build" className="input input-bordered flex-1 text-base font-mono bg-base-200 rounded-xl px-3"
                    value={generatedPassword} required
                  />
                  <button type="button" onClick={generateRandomPassword} className="btn btn-secondary font-bold rounded-xl px-4">
                    Generate
                  </button>
                </div>
              </div>

              <div className="modal-action gap-2 pt-2">
                <button 
                  type="button" 
                  className="btn btn-sm btn-ghost rounded-lg" 
                  onClick={() => { setIsCreateModalOpen(false); setNewEmail(''); setGeneratedPassword(''); }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-sm btn-primary rounded-lg font-bold px-4">
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL LAPISAN KEDUA: REMINDER / IMPLICIT ACTION CONFIRMATION */}
      {showConfirmStep && (
        <div className="modal modal-open z-[200]">
          <div className="modal-box max-w-sm border-2 border-warning shadow-2xl bg-base-100 rounded-2xl p-6 text-center">
            <div className="w-16 h-16 bg-warning/10 text-warning mx-auto flex items-center justify-center rounded-full mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
            </div>
            <h3 className="font-black text-xl text-warning">Confirm Action</h3>
            <p className="py-2 text-sm font-semibold opacity-90 text-base-content">
              This action cannot be undone, please be careful.
            </p>
            <p className="text-xs opacity-60 px-2 pb-2">
              An official permanent registration record will be committed for <span className="font-bold text-base-content underline">{newEmail}</span>.
            </p>

            <div className="flex justify-center gap-3 mt-4">
              <button 
                type="button" 
                className="btn btn-sm btn-ghost rounded-lg flex-1" 
                onClick={() => setShowConfirmStep(false)}
              >
                Go Back
              </button>
              <button 
                type="button" 
                disabled={createLoading}
                onClick={handleExecuteCreateUser} 
                className="btn btn-sm btn-warning text-black font-bold flex-1 rounded-lg"
              >
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
    </div>
  )
}