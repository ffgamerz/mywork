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
      const { error } = await supabase.auth.signUp({
        email,
        password,
      })
      if (error) {
        setMessage({ type: 'error', text: error.message })
      } else {
        setMessage({ type: 'success', text: 'Registration successful! You can log in now.' })
        setIsSignUp(false)
      }
    } else {
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
            {isSignUp ? 'Register mywork' : 'mywork hub'}
          </h2>
          
          {message && (
            <div className={`alert ${message.type === 'error' ? 'alert-error' : 'alert-success'} p-2 text-sm text-white`}>
              <span>{message.text}</span>
            </div>
          )}

          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">Email</span>
            </label>
            {/* Ditambah atribut name dan autoComplete untuk trigger Safari Save Password */}
            <input 
              type="email" 
              name="email"
              autoComplete="username"
              placeholder="name@email.com" 
              className="input input-bordered w-full text-base" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
            />
          </div>

          <div className="form-control mt-2">
            <label className="label">
              <span className="label-text font-medium">Password</span>
            </label>
            {/* Ditambah atribut name dan autoComplete untuk trigger Safari Save Password */}
            <input 
              type="password" 
              name="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              placeholder="••••••••" 
              className="input input-bordered w-full text-base" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
            />
          </div>

          <div className="form-control mt-6">
            <button type="submit" disabled={loading} className="btn btn-primary font-bold w-full mt-2">
              {loading ? <span className="loading loading-spinner"></span> : (isSignUp ? 'Register Account' : 'Log In')}
            </button>
          </div>

          <div className="text-center mt-4 text-sm">
            <span className="opacity-70">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"} 
            </span>{' '}
            <button 
              type="button"
              className="link link-primary font-semibold"
              onClick={() => {
                setIsSignUp(!isSignUp)
                setMessage(null)
              }}
            >
              {isSignUp ? 'Log In' : 'Register Here'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}