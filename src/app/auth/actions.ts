'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { z } from 'zod'
import { ensureProfileForUser, getPostAuthRedirect, getPublicAuthErrorMessage, sanitizeInternalRedirect } from '@/lib/auth'
import { getPublicSiteUrl, resolveTrustedRequestOrigin } from '@/lib/env'
import {
    createTwoFactorChallenge,
    getExpiredTwoFactorCookieOptions,
    getTwoFactorCookieOptions,
    getTwoFactorRedirectPath,
    TWO_FACTOR_CHALLENGE_COOKIE,
    TWO_FACTOR_CODE_TTL_SECONDS,
    TWO_FACTOR_VERIFIED_COOKIE,
    TWO_FACTOR_VERIFIED_TTL_SECONDS,
    verifyTwoFactorChallenge,
} from '@/lib/twoFactor'
import { sendTwoFactorEmail } from '@/lib/twoFactorEmail'
import { createClient } from '@/utils/supabase/server'

const emailSchema = z
    .string()
    .trim()
    .toLowerCase()
    .email('Please enter a valid email address.')
    .max(320, 'Email is too long.')

const loginPasswordSchema = z
    .string()
    .min(1, 'Password is required.')
    .max(256, 'Password is too long.')

const managedPasswordSchema = z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(72, 'Password is too long.')

function readFormValue(formData: FormData, key: string) {
    return String(formData.get(key) ?? '')
}

async function prepareTwoFactorChallenge(options: {
    user: User
    destination: string
}) {
    const cookieStore = await cookies()
    const challenge = await createTwoFactorChallenge({
        user: options.user,
        redirectTo: options.destination,
    })
    await sendTwoFactorEmail(options.user.email ?? '', challenge.code)

    cookieStore.set(
        TWO_FACTOR_CHALLENGE_COOKIE,
        challenge.cookie,
        getTwoFactorCookieOptions(TWO_FACTOR_CODE_TTL_SECONDS),
    )
    cookieStore.set(
        TWO_FACTOR_VERIFIED_COOKIE,
        '',
        getExpiredTwoFactorCookieOptions(),
    )

    return getTwoFactorRedirectPath(options.destination)
}

async function getAuthCallbackUrl(nextPath?: string | null) {
    const requestHeaders = await headers()
    const safeNextPath = sanitizeInternalRedirect(nextPath)
    const baseOrigin = resolveTrustedRequestOrigin({
        origin: requestHeaders.get('origin'),
        forwardedHost: requestHeaders.get('x-forwarded-host'),
        forwardedProto: requestHeaders.get('x-forwarded-proto'),
        fallback: getPublicSiteUrl(),
    })

    const buildCallbackUrl = (base: string) => {
        const callbackUrl = new URL('/auth/callback', base)

        if (safeNextPath) {
            callbackUrl.searchParams.set('next', safeNextPath)
        }

        return callbackUrl.toString()
    }

    return buildCallbackUrl(baseOrigin)
}

export async function loginWithPassword(formData: FormData, redirectTo?: string) {
    const supabase = await createClient()
    const parsedInput = z.object({
        email: emailSchema,
        password: loginPasswordSchema,
    }).safeParse({
        email: readFormValue(formData, 'email'),
        password: readFormValue(formData, 'password'),
    })

    if (!parsedInput.success) {
        return { error: parsedInput.error.issues[0]?.message ?? 'Invalid login form.' }
    }

    const { email, password } = parsedInput.data
    let profile = null
    let signedInUser: User | null = null

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        if (error) {
            return { error: getPublicAuthErrorMessage(error, 'Unable to sign in right now.') }
        }

        signedInUser = data.user
        profile = data.user ? await ensureProfileForUser(supabase, data.user) : null
    } catch (error) {
        return { error: getPublicAuthErrorMessage(error, 'Unable to sign in right now.') }
    }

    if (!signedInUser) {
        return { error: 'Unable to start two-factor verification.' }
    }

    let twoFactorRedirect = '/verify-2fa'

    try {
        twoFactorRedirect = await prepareTwoFactorChallenge({
            user: signedInUser,
            destination: getPostAuthRedirect(profile?.role, redirectTo),
        })
    } catch (error) {
        return { error: getPublicAuthErrorMessage(error, 'Unable to send a verification code right now.') }
    }

    revalidatePath('/', 'layout')
    redirect(twoFactorRedirect)
}

export async function loginWithMagicLink(formData: FormData, redirectTo?: string) {
    const supabase = await createClient()
    const parsedEmail = emailSchema.safeParse(readFormValue(formData, 'email'))

    if (!parsedEmail.success) {
        return { error: parsedEmail.error.issues[0]?.message ?? 'Please enter a valid email address.' }
    }

    const emailRedirectTo = await getAuthCallbackUrl(redirectTo)

    const email = parsedEmail.data
    const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
            emailRedirectTo,
        },
    })

    if (error) {
        return { error: getPublicAuthErrorMessage(error, 'Unable to send the magic link right now.') }
    }

    return { success: 'Magic link sent! Please check your email.' }
}

export async function signup(formData: FormData, redirectTo?: string) {
    const supabase = await createClient()
    const parsedInput = z.object({
        email: emailSchema,
        password: managedPasswordSchema,
        confirmPassword: managedPasswordSchema,
    }).safeParse({
        email: readFormValue(formData, 'email'),
        password: readFormValue(formData, 'password'),
        confirmPassword: readFormValue(formData, 'confirmPassword'),
    })

    if (!parsedInput.success) {
        return { error: parsedInput.error.issues[0]?.message ?? 'Invalid registration form.' }
    }

    const { email, password, confirmPassword } = parsedInput.data
    let profile = null
    let signedUpUser: User | null = null

    if (password !== confirmPassword) {
        return { error: 'Passwords do not match' }
    }

    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        })

        if (error) {
            return { error: getPublicAuthErrorMessage(error, 'Unable to create your account right now.') }
        }

        if (data.session === null) {
            return { success: 'Please check your email to confirm your registration.' }
        }

        signedUpUser = data.user
        profile = data.user ? await ensureProfileForUser(supabase, data.user) : null
    } catch (error) {
        return { error: getPublicAuthErrorMessage(error, 'Unable to create your account right now.') }
    }

    if (!signedUpUser) {
        return { error: 'Unable to start two-factor verification.' }
    }

    let twoFactorRedirect = '/verify-2fa'

    try {
        twoFactorRedirect = await prepareTwoFactorChallenge({
            user: signedUpUser,
            destination: getPostAuthRedirect(profile?.role, redirectTo),
        })
    } catch (error) {
        return { error: getPublicAuthErrorMessage(error, 'Unable to send a verification code right now.') }
    }

    revalidatePath('/', 'layout')
    redirect(twoFactorRedirect)
}

export async function verifyTwoFactorLogin(formData: FormData, redirectTo?: string) {
    const supabase = await createClient()
    const cookieStore = await cookies()
    const code = readFormValue(formData, 'code')
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser()

    if (error || !user) {
        return { error: 'Your sign-in session has expired. Please sign in again.' }
    }

    const result = await verifyTwoFactorChallenge({
        user,
        code,
        challengeCookie: cookieStore.get(TWO_FACTOR_CHALLENGE_COOKIE)?.value,
    })

    if (!result.ok) {
        if (result.updatedChallengeCookie) {
            cookieStore.set(
                TWO_FACTOR_CHALLENGE_COOKIE,
                result.updatedChallengeCookie,
                getTwoFactorCookieOptions(TWO_FACTOR_CODE_TTL_SECONDS),
            )
        }

        if (result.clearChallenge) {
            cookieStore.set(
                TWO_FACTOR_CHALLENGE_COOKIE,
                '',
                getExpiredTwoFactorCookieOptions(),
            )
        }

        return { error: result.error }
    }

    cookieStore.set(
        TWO_FACTOR_VERIFIED_COOKIE,
        result.verifiedCookie,
        getTwoFactorCookieOptions(TWO_FACTOR_VERIFIED_TTL_SECONDS),
    )
    cookieStore.set(
        TWO_FACTOR_CHALLENGE_COOKIE,
        '',
        getExpiredTwoFactorCookieOptions(),
    )

    revalidatePath('/', 'layout')
    redirect(sanitizeInternalRedirect(redirectTo) ?? '/vip')
}

export async function resendTwoFactorLoginCode(redirectTo?: string) {
    const supabase = await createClient()
    const cookieStore = await cookies()
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser()

    if (error || !user) {
        return { error: 'Your sign-in session has expired. Please sign in again.' }
    }

    try {
        const challenge = await createTwoFactorChallenge({
            user,
            redirectTo: sanitizeInternalRedirect(redirectTo) ?? '/vip',
        })
        await sendTwoFactorEmail(user.email ?? '', challenge.code)

        cookieStore.set(
            TWO_FACTOR_CHALLENGE_COOKIE,
            challenge.cookie,
            getTwoFactorCookieOptions(TWO_FACTOR_CODE_TTL_SECONDS),
        )
        cookieStore.set(
            TWO_FACTOR_VERIFIED_COOKIE,
            '',
            getExpiredTwoFactorCookieOptions(),
        )

        return { success: 'A new verification code has been sent to your email.' }
    } catch (error) {
        return { error: getPublicAuthErrorMessage(error, 'Unable to send a verification code right now.') }
    }
}

export async function cancelTwoFactorLogin() {
    const supabase = await createClient()
    const cookieStore = await cookies()

    await supabase.auth.signOut()
    cookieStore.set(
        TWO_FACTOR_CHALLENGE_COOKIE,
        '',
        getExpiredTwoFactorCookieOptions(),
    )
    cookieStore.set(
        TWO_FACTOR_VERIFIED_COOKIE,
        '',
        getExpiredTwoFactorCookieOptions(),
    )

    revalidatePath('/', 'layout')
    redirect('/login')
}

export async function requestPasswordReset(formData: FormData, redirectTo?: string) {
    const supabase = await createClient()
    const parsedEmail = emailSchema.safeParse(readFormValue(formData, 'email'))

    if (!parsedEmail.success) {
        return { error: parsedEmail.error.issues[0]?.message ?? 'Please enter a valid email address.' }
    }

    const safeRedirect = sanitizeInternalRedirect(redirectTo) ?? '/login'
    const resetPath = `/reset-password?redirect=${encodeURIComponent(safeRedirect)}`
    const resetCallbackUrl = await getAuthCallbackUrl(resetPath)

    const { error } = await supabase.auth.resetPasswordForEmail(parsedEmail.data, {
        redirectTo: resetCallbackUrl,
    })

    if (error) {
        return { error: getPublicAuthErrorMessage(error, 'Unable to send a password reset link right now.') }
    }

    return { success: 'Password reset link sent. Please check your email.' }
}

export async function updatePassword(formData: FormData, redirectTo?: string) {
    const supabase = await createClient()
    const parsedInput = z.object({
        password: managedPasswordSchema,
        confirmPassword: managedPasswordSchema,
    }).safeParse({
        password: readFormValue(formData, 'password'),
        confirmPassword: readFormValue(formData, 'confirmPassword'),
    })

    if (!parsedInput.success) {
        return { error: parsedInput.error.issues[0]?.message ?? 'Invalid password reset form.' }
    }

    const { password, confirmPassword } = parsedInput.data

    if (password !== confirmPassword) {
        return { error: 'Passwords do not match' }
    }

    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
        return { error: 'Your reset session is invalid or has expired. Please request a new reset link.' }
    }

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
        return { error: getPublicAuthErrorMessage(error, 'Unable to update your password right now.') }
    }

    await supabase.auth.signOut()

    revalidatePath('/', 'layout')
    const nextLogin = sanitizeInternalRedirect(redirectTo) ?? '/login'
    redirect(`${nextLogin}${nextLogin.includes('?') ? '&' : '?'}reset=success`)
}
