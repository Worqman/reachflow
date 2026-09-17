import { Router } from 'express'
import { getBalance, listTransactions, grantCredits } from '../services/credits.js'

const router = Router()

function wsId(req) { return req.workspaceId || 'ws_default' }

// GET /api/credits — current balance + recent ledger for the active workspace
router.get('/', async (req, res) => {
  const ws = wsId(req)
  try {
    const [balance, transactions] = await Promise.all([
      getBalance(ws),
      listTransactions(ws, 50),
    ])
    res.json({ balance, transactions })
  } catch (err) {
    console.error('[credits]', err)
    res.status(500).json({ message: err.message })
  }
})

// POST /api/credits/grant — manual top-up (no payment integration yet; used
// for comps/trial top-ups). Body: { amount, reason? }
router.post('/grant', async (req, res) => {
  const ws = wsId(req)
  const amount = Number(req.body?.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: 'amount must be a positive number' })
  }
  try {
    const balance = await grantCredits(ws, Math.round(amount), req.body?.reason || 'manual_grant')
    if (balance == null) return res.status(503).json({ message: 'Credits not configured (Supabase / migration missing)' })
    res.json({ balance })
  } catch (err) {
    console.error('[credits]', err)
    res.status(500).json({ message: err.message })
  }
})

export default router
