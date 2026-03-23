import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'

export default function Login() {
  const navigate = useNavigate()
  const { toast } = useToast()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!supabase) {
      setError('Supabase is not configured.')
      return
    }

    setLoading(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (signInError) throw signInError

      toast?.('Signed in successfully', 'success')
      navigate('/')
    } catch (err) {
      console.error(err)
      setError(err.message || 'Invalid email or password')
      toast?.(err.message || 'Could not sign in', 'danger')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page auth-page animate-fade-in" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 380, maxWidth: '100%', padding: 32 }}>
        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>◇</div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>Welcome back</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Sign in to access your ReachFlow workspace.
          </p>
        </div>

        {error && (
          <div className="badge badge-danger" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        <form className="stack" style={{ gap: 12 }} onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label">Email</label>
            <input
              className="input"
              type="email"
              required
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Password</label>
            <input
              className="input"
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: 8 }} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div style={{ marginTop: 16, fontSize: 13, textAlign: 'center', color: 'var(--text-muted)' }}>
          Don&apos;t have an account?{' '}
          <Link to="/register" className="link">
            Create one
          </Link>
        </div>
      </div>
    </div>
  )
}
