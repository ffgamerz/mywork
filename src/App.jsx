// src/App.jsx
import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Login from './Login'

function App() {
  const [session, setSession] = useState(null)

  useEffect(() => {
    // 1. Ambil sesi login sedia ada masa mula-mula buka app
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    // 2. Dengar sebarang perubahan status (cth: login / logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  // Jika belum login, paksa user tengok borang Login
  if (!session) {
    return <Login />
  }

  // Jika dah login, tunjuk ruang kerja peribadi (Dashboard)
  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
        <h1>Ruang Kerja mywork</h1>
        <div>
          <span style={{ marginRight: '15px' }}>Pengguna: {session.user.email}</span>
          <button onClick={handleLogout} style={{ padding: '8px 15px', backgroundColor: '#ff4d4f', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Log Keluar
          </button>
        </div>
      </header>

      <main style={{ marginTop: '20px' }}>
        <h3>Selamat kembali!</h3>
        <p>Ini adalah ruangan dashboard personal kau. Di sinilah kita akan bina features kerja nanti.</p>
      </main>
    </div>
  )
}

export default App