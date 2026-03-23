import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'

export default function Register() {
  const navigate = useNavigate()
  const { toast } = useToast()

  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
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
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      })
      if (signUpError) throw signUpError

      const user = data.user
      if (user) {
        // Create profile row linked to auth.users
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            full_name: fullName,
            company_name: companyName,
          })

        if (profileError) {
          // Non-fatal but useful to know
          console.error('Failed to create profile', profileError)
        }
      }

      toast?.('Account created. Check your email to confirm.', 'success')
      navigate('/login')
    } catch (err) {
      console.error(err)
      setError(err.message || 'Something went wrong')
      toast?.(err.message || 'Could not create account', 'danger')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page auth-page animate-fade-in" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 420, maxWidth: '100%', padding: 32 }}>
        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>◇</div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>Create your account</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Set up ReachFlow for your team. You&apos;ll be able to invite members later.
          </p>
        </div>

        {error && (
          <div className="badge badge-danger" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        <form className="stack" style={{ gap: 12 }} onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label">Full name</label>
            <input
              className="input"
              type="text"
              required
              placeholder="Alex Smith"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Company name</label>
            <input
              className="input"
              type="text"
              required
              placeholder="Creative Deer"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Work email</label>
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
              placeholder="Create a secure password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: 8 }} disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <div style={{ marginTop: 16, fontSize: 13, textAlign: 'center', color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" className="link">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
