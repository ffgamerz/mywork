import React, { useState } from 'react'
import { supabase } from './supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [isSignUp, setIsSignUp] = useState(false) // Suis untuk tukar Mod

  const handleAuth = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    if (isSignUp) {
      // 1. LOGIK DAFTAR AKAUN BARU
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      })
      if (error) {
        setMessage({ type: 'error', text: error.message })
      } else {
        setMessage({ type: 'success', text: 'Pendaftaran berjaya! Cuba log masuk sekarang.' })
        setIsSignUp(false) // Tukar balik ke mod login lepas sukses
      }
    } else {
      // 2. LOGIK LOG MASUK
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) setMessage({ type: 'error', text: error.message })
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200 p-4">
      <div className="card w-full max-w-sm shadow-2xl bg-base-100">
        <form onSubmit={handleAuth} className="card-body">
          <h2 className="card-title text-2xl font-bold justify-center mb-2 text-primary">
            {isSignUp ? 'Daftar mywork' : 'mywork hub'}
          </h2>
          
          {message && (
            <div className={`alert ${message.type === 'error' ? 'alert-error' : 'alert-success'} p-2 text-sm text-white`}>
              <span>{message.text}</span>
            </div>
          )}

          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">Emel</span>
            </label>
            <input 
              type="email" 
              placeholder="nama@emel.com" 
              className="input input-bordered w-full" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
            />
          </div>

          <div className="form-control mt-2">
            <label className="label">
              <span className="label-text font-medium">Kata Laluan</span>
            </label>
            <input 
              type="password" 
              placeholder="••••••••" 
              className="input input-bordered w-full" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
            />
          </div>

          <div className="form-control mt-6">
            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading ? <span className="loading loading-spinner"></span> : (isSignUp ? 'Daftar Akaun' : 'Log Masuk')}
            </button>
          </div>

          {/* BUTANG TUKAR MOD */}
          <div className="text-center mt-4 text-sm">
            <span className="opacity-70">
              {isSignUp ? 'Dah ada akaun?' : 'Belum ada akaun?'} 
            </span>{' '}
            <button 
              type="button"
              className="link link-primary font-semibold"
              onClick={() => {
                setIsSignUp(!isSignUp)
                setMessage(null)
              }}
            >
              {isSignUp ? 'Log Masuk' : 'Daftar Sini'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}