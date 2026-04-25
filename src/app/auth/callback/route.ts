import { createClient } from '@/utils/supabase/server'
import {
    ensureProfileForUser,
    getPostAuthRedirect,
    getPublicAuthErrorMessage,
} from '@/lib/auth'
import { getPublicSiteUrl, resolveTrustedRequestOrigin } from '@/lib/env'
import {
    createTwoFactorChallenge,
    getStoredTwoFactorSecret,
    getExpiredTwoFactorCookieOptions,
    getTwoFactorCookieOptions,
    hasConfiguredTwoFactor,
    TWO_FACTOR_CHALLENGE_COOKIE,
    TWO_FACTOR_CHALLENGE_TTL_SECONDS,
    TWO_FACTOR_VERIFIED_COOKIE,
} from '@/lib/twoFactor'
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
                    loginUrl.searchParams.set('error', 'We could not start authenticator verification. Please try again.')
                    return NextResponse.redirect(loginUrl)
                }

                const challenge = await createTwoFactorChallenge({
                    user: data.user,
                    hasStoredSecret: hasConfiguredTwoFactor(getStoredTwoFactorSecret(data.user)),
                    redirectTo: destination,
                })
                const response = NextResponse.redirect(
                    new URL(challenge.redirectPath, safeOrigin),
                )

                response.cookies.set(
                    TWO_FACTOR_CHALLENGE_COOKIE,
                    challenge.cookie,
                    getTwoFactorCookieOptions(TWO_FACTOR_CHALLENGE_TTL_SECONDS),
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
