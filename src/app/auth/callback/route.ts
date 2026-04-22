import { createClient } from '@/utils/supabase/server'
import { ensureProfileForUser, getPostAuthRedirect, getPublicAuthErrorMessage } from '@/lib/auth'
import { getPublicSiteUrl, resolveTrustedRequestOrigin } from '@/lib/env'
import {
    createTwoFactorChallenge,
    getExpiredTwoFactorCookieOptions,
    getTwoFactorCookieOptions,
    getTwoFactorRedirectPath,
    TWO_FACTOR_CHALLENGE_COOKIE,
    TWO_FACTOR_CODE_TTL_SECONDS,
    TWO_FACTOR_VERIFIED_COOKIE,
} from '@/lib/twoFactor'
import { sendTwoFactorEmail } from '@/lib/twoFactorEmail'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get('code')
    const next = requestUrl.searchParams.get('next')
    const safeOrigin = resolveTrustedRequestOrigin({
        origin: requestUrl.origin,
        forwardedHost: request.headers.get('x-forwarded-host'),
        forwardedProto: request.headers.get('x-forwarded-proto'),
        fallback: getPublicSiteUrl(),
    })
    const errorDescription =
        requestUrl.searchParams.get('error_description') ??
        requestUrl.searchParams.get('error') ??
        'Could not authenticate user'
    const loginUrl = new URL('/login', safeOrigin)

    if (code) {
        try {
            const supabase = await createClient()
            const { data, error } = await supabase.auth.exchangeCodeForSession(code)
            if (!error) {
                const profile = data.user ? await ensureProfileForUser(supabase, data.user) : null
                const destination = getPostAuthRedirect(profile?.role, next)

                if (destination.startsWith('/reset-password')) {
                    return NextResponse.redirect(new URL(destination, safeOrigin))
                }

                if (!data.user) {
                    loginUrl.searchParams.set('error', 'We could not start two-factor verification. Please try again.')
                    return NextResponse.redirect(loginUrl)
                }

                const challenge = await createTwoFactorChallenge({
                    user: data.user,
                    redirectTo: destination,
                })
                await sendTwoFactorEmail(data.user.email ?? '', challenge.code)
                const response = NextResponse.redirect(
                    new URL(getTwoFactorRedirectPath(destination), safeOrigin),
                )

                response.cookies.set(
                    TWO_FACTOR_CHALLENGE_COOKIE,
                    challenge.cookie,
                    getTwoFactorCookieOptions(TWO_FACTOR_CODE_TTL_SECONDS),
                )
                response.cookies.set(
                    TWO_FACTOR_VERIFIED_COOKIE,
                    '',
                    getExpiredTwoFactorCookieOptions(),
                )

                return response
            }

            loginUrl.searchParams.set('error', getPublicAuthErrorMessage(error, 'We could not complete sign-in. Please try again.'))
            return NextResponse.redirect(loginUrl)
        } catch (error) {
            loginUrl.searchParams.set('error', getPublicAuthErrorMessage(error, 'We could not complete sign-in. Please try again.'))
            return NextResponse.redirect(loginUrl)
        }
    }

    loginUrl.searchParams.set('error', getPublicAuthErrorMessage(errorDescription, 'We could not complete sign-in. Please try again.'))
    return NextResponse.redirect(loginUrl)
}
