import { Router } from 'express'
import { verifyPassword } from '../auth.js'

export const login = Router()

login.post('/login', async (req, res) => {
  const user = await verifyPassword(req.body.email, req.body.password)
  if (!user) return res.status(401).json({ error: 'invalid credentials' })
  res.json({ token: user.token })
})
