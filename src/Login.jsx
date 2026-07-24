import React, { useState } from 'react'
import { supabase } from './supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [isSignUp, setIsSignUp] = useState(false)

  const handleAuth = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setMessage({ type: 'error', text: error.message })
      else { setMessage({ type: 'success', text: 'Registration successful! You can log in now.' }); setIsSignUp(false) }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMessage({ type: 'error', text: error.message })
    }
    setLoading(false)
  }

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center px-2 py-4 bg-body">
      <div className="max-w-480 w-100 mx-auto">
        <div>
          <div className="card p-4 h-100 d-flex flex-column justify-content-center bg-card-bg">
            <form onSubmit={handleAuth}>
              <div className="d-flex flex-column gap-3">
                <div>
                  <h5 className="fw-bold text-white">{isSignUp ? 'Create account' : 'Welcome back'}</h5>
                  <p className="text-muted mt-1 text-13">Login to your mywork dashboard and start managing production.</p>
                </div>
                {message && (
                  <div className={`alert ${message.type === 'error' ? 'alert-danger' : 'alert-success'} py-2 px-3 rounded-12`}>{message.text}</div>
                )}
                <div className="mb-3">
                  <label className="form-label">Email</label>
                  <input type="email" className="form-control" autoComplete="username" placeholder="name@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="mb-3">
                  <label className="form-label">Password</label>
                  <input type="password" className="form-control" autoComplete={isSignUp ? 'new-password' : 'current-password'} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <button type="submit" className="btn btn-primary w-100 fw-bold py-2" disabled={loading}>
                  {loading ? (isSignUp ? 'Creating...' : 'Logging in...') : (isSignUp ? 'Create Account' : 'Log In')}
                </button>
                <p className="text-center text-muted mt-2 text-13">
                  {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                  <button type="button" onClick={() => { setIsSignUp(!isSignUp); setMessage(null) }}
                    className="btn btn-link p-0 fw-semibold text-primary align-baseline border-0 bg-transparent text-13"> 
                    {isSignUp ? 'Log In' : 'Register Here'}
                  </button>
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}