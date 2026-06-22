import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Login from './Login'

function App() {
  const [session, setSession] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  if (!session) {
    return <Login />
  }

  return (
    <div data-theme="dim" className="min-h-screen bg-base-300 text-base-content font-sans">
      
      {/* NAVBAR */}
      <div className="navbar bg-base-100 shadow-md px-4 md:px-8">
        <div className="flex-1">
          <a className="text-xl font-black tracking-wider text-primary">mywork</a>
        </div>
        <div className="flex-none gap-4">
          <span className="text-sm opacity-70 hidden sm:inline">Pengguna: {session.user.email}</span>
          <button onClick={handleLogout} className="btn btn-error btn-sm btn-outline">
            Log Keluar
          </button>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="p-4 md:p-8 max-w-6xl mx-auto">
        <div className="hero bg-base-100 rounded-2xl p-6 md:p-12 shadow-xl border border-base-200">
          <div className="hero-content text-center">
            <div className="max-w-md">
              <h1 className="text-3xl md:text-4xl font-bold">Selamat Kembali! 🚀</h1>
              <p className="py-4 opacity-80">
                Tapak UI berciri <span className="text-secondary font-semibold">Tailwind + DaisyUI</span> dah aktif sepenuhnya. Sedia untuk dimasukkan dengan fungsi-fungsi kerja kau.
              </p>
              <div className="badge badge-success gap-2 p-3 font-semibold text-white">
                Status: Sesi Selamat
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}

export default App