import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getPostAuthRedirect, getProfileForUser, getRoleHomePath, hasAdminAccess } from '@/lib/auth'
import { getRequiredEnv } from '@/lib/env'
import {
    hasEnabledTwoFactor,
    isTwoFactorVerifiedForUser,
    TWO_FACTOR_CHALLENGE_COOKIE,
    TWO_FACTOR_VERIFIED_COOKIE,
} from '@/lib/twoFactor'
import type { Database } from '@/types/supabase'

export async function updateSession(request: NextRequest) {
    const pathname = request.nextUrl.pathname
    const isRouteGuardedStaffApi =
        pathname.startsWith('/api/admin') ||
        pathname.startsWith('/api/receptionist')
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient<Database>(
        getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
        getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    if (isRouteGuardedStaffApi) {
        return supabaseResponse
    }

    // IMPORTANT: Avoid writing any logic between createServerClient and
    // supabase.auth.getUser(). A simple mistake could make it very hard to debug
    // issues with users being randomly logged out.

    const {
        data: { user },
    } = await supabase.auth.getUser()
    const needsProtectedPageAuthentication =
        pathname.startsWith('/profile') ||
        pathname.startsWith('/booking') ||
        pathname.startsWith('/checkout') ||
        pathname.startsWith('/admin')
    const needsProtectedApiAuthentication =
        pathname.startsWith('/api/dashboard') ||
        pathname.startsWith('/api/checkout') ||
        pathname.startsWith('/api/vouchers') ||
        pathname.startsWith('/api/admin')
    const needsAuthentication =
        needsProtectedPageAuthentication ||
        needsProtectedApiAuthentication
    const isAuthPage =
        pathname === '/login' || pathname === '/register'
    const isTwoFactorPage = pathname === '/verify-2fa'

    if (
        !user &&
        (needsAuthentication || isTwoFactorPage)
    ) {
        if (needsProtectedApiAuthentication) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
        }

        // no user, potentially respond by redirecting the user to the login page
        const url = request.nextUrl.clone()
        const redirectUrl = pathname + request.nextUrl.search
        url.pathname = '/login'
        url.search = `?redirect=${encodeURIComponent(redirectUrl)}`
        return NextResponse.redirect(url)
    }

    const hasCompletedTwoFactor = user
        ? await isTwoFactorVerifiedForUser(
            user,
            request.cookies.get(TWO_FACTOR_VERIFIED_COOKIE)?.value,
        )
        : false
    const needsTwoFactor = user
        ? hasEnabledTwoFactor(user)
        : false
    const hasTwoFactorChallenge = Boolean(
        request.cookies.get(TWO_FACTOR_CHALLENGE_COOKIE)?.value,
    )

    if (
        user &&
        isTwoFactorPage &&
        ((needsTwoFactor && hasCompletedTwoFactor) ||
            (!needsTwoFactor && !hasTwoFactorChallenge))
    ) {
        const profile = await getProfileForUser(supabase, user.id)
        const url = request.nextUrl.clone()
        const redirectTarget = getPostAuthRedirect(
            profile?.role,
            request.nextUrl.searchParams.get('redirect'),
        )

        try {
            const redirectUrl = new URL(redirectTarget, request.url)
            url.pathname = redirectUrl.pathname
            url.search = redirectUrl.search
            url.hash = redirectUrl.hash
        } catch {
            url.pathname = needsTwoFactor ? getRoleHomePath(profile?.role) : '/'
            url.search = ''
            url.hash = ''
        }

        return NextResponse.redirect(url)
    }

    if (user && needsTwoFactor && !hasCompletedTwoFactor && (needsAuthentication || isAuthPage)) {
        if (needsProtectedApiAuthentication) {
            return NextResponse.json(
                { error: 'Two-factor verification required' },
                { status: 403 },
            )
        }

        const url = request.nextUrl.clone()
        const redirectUrl = isAuthPage
            ? request.nextUrl.searchParams.get('redirect')
            : pathname + request.nextUrl.search

        url.pathname = '/verify-2fa'
        url.search = `?redirect=${encodeURIComponent(redirectUrl || '/')}`
        return NextResponse.redirect(url)
    }

    const profile =
        user && (!needsTwoFactor || hasCompletedTwoFactor) && (isAuthPage || pathname.startsWith('/admin'))
            ? await getProfileForUser(supabase, user.id)
            : null

    if (user && pathname.startsWith('/admin') && !hasAdminAccess(profile?.role, user.email)) {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        url.search = ''
        return NextResponse.redirect(url)
    }

    if (
        user &&
        isAuthPage
    ) {
        const url = request.nextUrl.clone()
        const redirectTarget = getRoleHomePath(profile?.role)

        try {
            const redirectUrl = new URL(redirectTarget, request.url)
            url.pathname = redirectUrl.pathname
            url.search = redirectUrl.search
            url.hash = redirectUrl.hash
        } catch {
            url.pathname = getRoleHomePath(profile?.role)
            url.search = ''
            url.hash = ''
        }

        return NextResponse.redirect(url)
    }

    // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
    // creating a new response object with NextResponse.next() make sure to:
    // 1. Pass the request in it, like so:
    //    const myNewResponse = NextResponse.next({ request })
    // 2. Copy over the cookies, like so:
    //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
    // 3. Change the myNewResponse object to fit your needs, but avoid changing
    //    the cookies!
    // 4. Finally:
    //    return myNewResponse
    // If this is not done, you may be causing the browser and server to go out
    // of sync and terminate the user's session prematurely!

    return supabaseResponse
}
