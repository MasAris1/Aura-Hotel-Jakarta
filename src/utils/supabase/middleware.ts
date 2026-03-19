import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
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

    // IMPORTANT: Avoid writing any logic between createServerClient and
    // supabase.auth.getUser(). A simple mistake could make it very hard to debug
    // issues with users being randomly logged out.

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (
        !user &&
        (request.nextUrl.pathname.startsWith('/dashboard') || request.nextUrl.pathname.startsWith('/vip') || request.nextUrl.pathname.startsWith('/booking') || request.nextUrl.pathname.startsWith('/checkout'))
    ) {
        // no user, potentially respond by redirecting the user to the login page
        const url = request.nextUrl.clone()
        const redirectUrl = request.nextUrl.pathname + request.nextUrl.search
        url.pathname = '/login'
        url.search = `?redirect=${encodeURIComponent(redirectUrl)}`
        return NextResponse.redirect(url)
    }

    if (
        user &&
        (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/register')
    ) {
        const url = request.nextUrl.clone()
        const role = user.user_metadata?.role || 'user'

        if (role === 'admin' || role === 'receptionist') {
            url.pathname = '/dashboard'
        } else {
            const redirectParam = request.nextUrl.searchParams.get('redirect')
            if (redirectParam) {
                try {
                    // Use URL constructor relative to request.url to parse correctly
                    const redirectUrl = new URL(redirectParam, request.url)
                    url.pathname = redirectUrl.pathname
                    url.search = redirectUrl.search
                } catch {
                    url.pathname = '/vip'
                    url.search = ''
                }
            } else {
                url.pathname = '/vip'
            }
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
