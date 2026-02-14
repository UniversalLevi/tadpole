import { Router, Request, Response } from 'express';
import { register, login, refresh, logout } from './auth.service.js';
import { registerSchema, loginSchema, refreshSchema, logoutSchema } from './auth.validation.js';
import { logWithContext } from '../logs/index.js';

const router = Router();

router.post('/register', async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse({ body: req.body });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    }
    const { email, password } = parsed.data.body;
    const result = await register(email, password);
    logWithContext('info', 'User registered', { requestId: req.requestId, userId: result.userId });
    return res.status(201).json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Registration failed';
    if (msg === 'User already exists') {
      return res.status(409).json({ error: 'User already exists' });
    }
    logWithContext('error', 'Register error', { requestId: req.requestId, error: msg });
    return res.status(400).json({ error: msg });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse({ body: req.body });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    }
    const { email, password } = parsed.data.body;
    const result = await login(email, password);
    logWithContext('info', 'User logged in', { requestId: req.requestId, userId: result.user.id });
    return res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Login failed';
    logWithContext('warn', 'Login failed', { requestId: req.requestId, error: msg });
    return res.status(401).json({ error: 'Invalid credentials' });
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const parsed = refreshSchema.safeParse({ body: req.body });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    }
    const { refreshToken } = parsed.data.body;
    const result = await refresh(refreshToken);
    return res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Refresh failed';
    return res.status(401).json({ error: msg });
  }
});

router.post('/logout', async (req: Request, res: Response) => {
  try {
    const parsed = logoutSchema.safeParse({ body: req.body });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    }
    const { refreshToken } = parsed.data.body;
    await logout(refreshToken);
    return res.status(204).send();
  } catch {
    return res.status(204).send();
  }
});

export default router;
