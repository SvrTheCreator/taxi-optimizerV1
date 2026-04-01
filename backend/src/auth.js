import { SignJWT, jwtVerify } from 'jose'

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-me')

// Создаёт JWT токен для пользователя (живёт 30 дней)
export async function createToken(user) {
  return new SignJWT({ userId: user.id, phone: user.phone, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(secret)
}

// Проверяет JWT токен, возвращает payload или null
export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, secret)
    return payload
  } catch {
    return null
  }
}

// Middleware: проверяет авторизацию, кладёт user в req.user
export function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' })
  }

  verifyToken(header.slice(7)).then(payload => {
    if (!payload) return res.status(401).json({ error: 'Невалидный токен' })
    req.user = payload
    next()
  })
}

// Middleware: только для админа
export function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Только для администратора' })
  }
  next()
}
