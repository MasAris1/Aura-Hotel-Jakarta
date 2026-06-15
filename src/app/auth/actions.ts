'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { z } from 'zod'
import {
    ensureProfileForUser,
    getRoleHomePath,
    getPublicAuthErrorMessage,
    sanitizeInternalRedirect,
} from '@/lib/auth'
import { getPublicSiteUrl, resolveTrustedRequestOrigin } from '@/lib/env'
import {
    createTwoFactorChallenge,
    getStoredTwoFactorSecret,
    getTwoFactorMetadataPatch,
    getExpiredTwoFactorCookieOptions,
    getTwoFactorCookieOptions,
    hasEnabledTwoFactor,
    hasConfiguredTwoFactor,
    isTwoFactorVerifiedForUser,
    TWO_FACTOR_CHALLENGE_COOKIE,
    TWO_FACTOR_CHALLENGE_TTL_SECONDS,
    TWO_FACTOR_VERIFIED_COOKIE,
    TWO_FACTOR_VERIFIED_TTL_SECONDS,
    TWO_FACTOR_ENABLED_AT_METADATA_KEY,
    TWO_FACTOR_MANUAL_ENABLED_METADATA_KEY,
    TWO_FACTOR_SECRET_METADATA_KEY,
    verifyTwoFactorChallenge,
} from '@/lib/twoFactor'
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
    hasStoredSecret: boolean
    destination: string
}) {
    const cookieStore = await cookies()
    const challenge = await createTwoFactorChallenge({
        user: options.user,
        hasStoredSecret: options.hasStoredSecret,
        redirectTo: options.destination,
    })

    cookieStore.set(
        TWO_FACTOR_CHALLENGE_COOKIE,
        challenge.cookie,
        getTwoFactorCookieOptions(TWO_FACTOR_CHALLENGE_TTL_SECONDS),
    )
    cookieStore.set(
        TWO_FACTOR_VERIFIED_COOKIE,
        '',
        getExpiredTwoFactorCookieOptions(),
    )

    return challenge.redirectPath
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

export async function loginWithPassword(formData: FormData, _redirectTo?: string) {
    void _redirectTo

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
        if (data.user) {
            profile = await ensureProfileForUser(supabase, data.user)
        }
    } catch (error) {
        return { error: getPublicAuthErrorMessage(error, 'Unable to sign in right now.') }
    }

    if (signedInUser && hasEnabledTwoFactor(signedInUser)) {
        let twoFactorRedirect = '/verify-2fa'

        try {
            twoFactorRedirect = await prepareTwoFactorChallenge({
                user: signedInUser,
                hasStoredSecret: true,
                destination: getRoleHomePath(profile?.role),
            })
        } catch (error) {
            return { error: getPublicAuthErrorMessage(error, 'Unable to start authenticator verification right now.') }
        }

        revalidatePath('/', 'layout')
        redirect(twoFactorRedirect)
    }

    revalidatePath('/', 'layout')
    redirect(getRoleHomePath(profile?.role))
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

export async function signup(formData: FormData, _redirectTo?: string) {
    void _redirectTo

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
        if (data.user) {
            profile = await ensureProfileForUser(supabase, data.user)
        }
    } catch (error) {
        return { error: getPublicAuthErrorMessage(error, 'Unable to create your account right now.') }
    }

    if (signedUpUser && hasEnabledTwoFactor(signedUpUser)) {
        let twoFactorRedirect = '/verify-2fa'

        try {
            twoFactorRedirect = await prepareTwoFactorChallenge({
                user: signedUpUser,
                hasStoredSecret: true,
                destination: getRoleHomePath(profile?.role),
            })
        } catch (error) {
            return { error: getPublicAuthErrorMessage(error, 'Unable to start authenticator verification right now.') }
        }

        revalidatePath('/', 'layout')
        redirect(twoFactorRedirect)
    }

    revalidatePath('/', 'layout')
    redirect(getRoleHomePath(profile?.role))
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
        storedSecret: getStoredTwoFactorSecret(user),
    })

    if (!result.ok) {
        if (result.updatedChallengeCookie) {
            cookieStore.set(
                TWO_FACTOR_CHALLENGE_COOKIE,
                result.updatedChallengeCookie,
                getTwoFactorCookieOptions(TWO_FACTOR_CHALLENGE_TTL_SECONDS),
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

    if (result.secretToStore) {
        const { error: updateError } = await supabase.auth.updateUser({
            data: {
                ...user.user_metadata,
                ...getTwoFactorMetadataPatch(result.secretToStore),
            },
        })

        if (updateError) {
            cookieStore.set(
                TWO_FACTOR_VERIFIED_COOKIE,
                '',
                getExpiredTwoFactorCookieOptions(),
            )
            cookieStore.set(
                TWO_FACTOR_CHALLENGE_COOKIE,
                '',
                getExpiredTwoFactorCookieOptions(),
            )

            return {
                error: getPublicAuthErrorMessage(
                    updateError,
                    'Unable to finish authenticator setup right now.',
                ),
            }
        }
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
    redirect(sanitizeInternalRedirect(redirectTo) ?? '/')
}

export async function refreshTwoFactorSetup(redirectTo?: string) {
    const supabase = await createClient()
    const cookieStore = await cookies()
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser()

    if (error || !user) {
        return { error: 'Your sign-in session has expired. Please sign in again.' }
    }

    if (hasEnabledTwoFactor(user)) {
        return { error: 'Authenticator is already configured. Enter your current app code to continue.' }
    }

    try {
        const challenge = await createTwoFactorChallenge({
            user,
            hasStoredSecret: false,
            redirectTo: sanitizeInternalRedirect(redirectTo) ?? '/profile',
        })

        cookieStore.set(
            TWO_FACTOR_CHALLENGE_COOKIE,
            challenge.cookie,
            getTwoFactorCookieOptions(TWO_FACTOR_CHALLENGE_TTL_SECONDS),
        )
        cookieStore.set(
            TWO_FACTOR_VERIFIED_COOKIE,
            '',
            getExpiredTwoFactorCookieOptions(),
        )

        return { success: 'A new authenticator setup key is ready. Scan the refreshed QR code and enter the latest code from your app.' }
    } catch (error) {
        return { error: getPublicAuthErrorMessage(error, 'Unable to refresh authenticator setup right now.') }
    }
}

export async function startTwoFactorSetup() {
    const supabase = await createClient()
    const cookieStore = await cookies()
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser()

    if (error || !user) {
        redirect('/login?redirect=/profile')
    }

    if (hasEnabledTwoFactor(user)) {
        redirect('/profile')
    }

    let challenge

    try {
        challenge = await createTwoFactorChallenge({
            user,
            hasStoredSecret: false,
            redirectTo: '/profile',
        })
    } catch {
        redirect('/profile?twoFactor=setup-error')
    }

    cookieStore.set(
        TWO_FACTOR_CHALLENGE_COOKIE,
        challenge.cookie,
        getTwoFactorCookieOptions(TWO_FACTOR_CHALLENGE_TTL_SECONDS),
    )
    cookieStore.set(
        TWO_FACTOR_VERIFIED_COOKIE,
        '',
        getExpiredTwoFactorCookieOptions(),
    )

    redirect(challenge.redirectPath)
}

export async function disableTwoFactor(formData: FormData) {
    const supabase = await createClient()
    const cookieStore = await cookies()
    const code = readFormValue(formData, 'code')
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser()

    if (error || !user) {
        redirect('/login?redirect=/profile')
    }

    const storedSecret = getStoredTwoFactorSecret(user)

    if (!hasConfiguredTwoFactor(storedSecret)) {
        redirect('/profile')
    }

    const verification = await verifyTwoFactorChallenge({
        user,
        code,
        challengeCookie: null,
        storedSecret,
    })

    if (!verification.ok) {
        redirect('/profile?twoFactor=invalid-code')
    }

    const { error: updateError } = await supabase.auth.updateUser({
        data: {
            ...user.user_metadata,
            [TWO_FACTOR_SECRET_METADATA_KEY]: null,
            [TWO_FACTOR_ENABLED_AT_METADATA_KEY]: null,
            [TWO_FACTOR_MANUAL_ENABLED_METADATA_KEY]: null,
        },
    })

    if (updateError) {
        redirect('/profile?twoFactor=disable-error')
    }

    cookieStore.set(
        TWO_FACTOR_VERIFIED_COOKIE,
        '',
        getExpiredTwoFactorCookieOptions(),
    )
    cookieStore.set(
        TWO_FACTOR_CHALLENGE_COOKIE,
        '',
        getExpiredTwoFactorCookieOptions(),
    )

    revalidatePath('/profile')
    redirect('/profile?twoFactor=disabled')
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

export async function checkTwoFactorVerification() {
    const supabase = await createClient()
    const cookieStore = await cookies()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return false
    }

    if (!hasEnabledTwoFactor(user)) {
        return true
    }

    return await isTwoFactorVerifiedForUser(
        user,
        cookieStore.get(TWO_FACTOR_VERIFIED_COOKIE)?.value,
    )
}
