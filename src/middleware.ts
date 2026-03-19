import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

const rateLimitMap = new Map<string, { count: number; lastReset: number }>()
const RATE_LIMIT_KEEPALIVE = 10 * 1000 // 10 seconds
const MAX_REQUESTS = 50 // Requests per 10 seconds
let lastCleanup = Date.now()
const CLEANUP_INTERVAL = 60 * 1000 // Cleanup every 60 seconds

export async function middleware(request: NextRequest) {
    // Basic IP-based Rate Limiter (In-Memory)
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
    const now = Date.now()

    // Periodic cleanup of stale entries to prevent memory leak
    if (now - lastCleanup > CLEANUP_INTERVAL) {
        lastCleanup = now
        for (const [key, value] of rateLimitMap) {
            if (now - value.lastReset > RATE_LIMIT_KEEPALIVE) {
                rateLimitMap.delete(key)
            }
        }
    }

    if (ip !== 'unknown') {
        const record = rateLimitMap.get(ip)

        if (!record || now - record.lastReset > RATE_LIMIT_KEEPALIVE) {
            rateLimitMap.set(ip, { count: 1, lastReset: now })
        } else {
            record.count += 1
            if (record.count > MAX_REQUESTS) {
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
