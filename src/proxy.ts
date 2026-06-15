import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

const rateLimitMap = new Map<string, { count: number; lastReset: number }>()
const RATE_LIMIT_KEEPALIVE = 10 * 1000 // 10 seconds
const AUTH_MAX_REQUESTS = 20 // Auth-oriented requests per 10 seconds
let lastCleanup = Date.now()
const CLEANUP_INTERVAL = 60 * 1000 // Cleanup every 60 seconds
const AUTH_RATE_LIMIT_PATHS = new Set([
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/auth/callback',
    '/verify-2fa',
])

function getClientIp(request: NextRequest) {
    const forwardedFor = request.headers.get('x-forwarded-for')
    if (forwardedFor) {
        const firstIp = forwardedFor.split(',')[0]?.trim()
        if (firstIp) {
            return firstIp
        }
    }

    const realIp = request.headers.get('x-real-ip')?.trim()
    return realIp || null
}

export async function proxy(request: NextRequest) {
    const ip = getClientIp(request)
    const now = Date.now()
    const pathname = request.nextUrl.pathname
    const shouldRateLimitAuth = AUTH_RATE_LIMIT_PATHS.has(pathname)

    // Periodic cleanup of stale entries to prevent memory leak
    if (now - lastCleanup > CLEANUP_INTERVAL) {
        lastCleanup = now
        for (const [key, value] of rateLimitMap) {
            if (now - value.lastReset > RATE_LIMIT_KEEPALIVE) {
                rateLimitMap.delete(key)
            }
        }
    }

    if (ip && shouldRateLimitAuth) {
        const key = `auth:${ip}`
        const record = rateLimitMap.get(key)

        if (!record || now - record.lastReset > RATE_LIMIT_KEEPALIVE) {
            rateLimitMap.set(key, { count: 1, lastReset: now })
        } else {
            record.count += 1
            if (record.count > AUTH_MAX_REQUESTS) {
                return new NextResponse('Too Many Requests', { status: 429 })
            }
        }
    }

    return await updateSession(request)
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * Feel free to modify this pattern to include more paths.
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
