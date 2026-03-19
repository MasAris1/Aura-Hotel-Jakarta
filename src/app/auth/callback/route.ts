import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get('code')
    const next = requestUrl.searchParams.get('next') ?? '/vip'
    const errorDescription =
        requestUrl.searchParams.get('error_description') ??
        requestUrl.searchParams.get('error') ??
        'Could not authenticate user'
    const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/vip'
    const loginUrl = new URL('/login', requestUrl.origin)

    if (code) {
        const supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
            const forwardedHost = request.headers.get('x-forwarded-host')
            const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https'
            const isLocalEnv = process.env.NODE_ENV === 'development'
            if (isLocalEnv) {
                return NextResponse.redirect(`${requestUrl.origin}${safeNext}`)
            } else if (forwardedHost) {
                return NextResponse.redirect(`${forwardedProto}://${forwardedHost}${safeNext}`)
            } else {
                return NextResponse.redirect(`${requestUrl.origin}${safeNext}`)
            }
        }

        loginUrl.searchParams.set('error', error.message)
        return NextResponse.redirect(loginUrl)
    }

    loginUrl.searchParams.set('error', errorDescription)
    return NextResponse.redirect(loginUrl)
}
