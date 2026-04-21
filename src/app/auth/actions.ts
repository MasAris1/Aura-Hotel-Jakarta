'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { ensureProfileForUser, getPostAuthRedirect, getPublicAuthErrorMessage, sanitizeInternalRedirect } from '@/lib/auth'
import { getPublicSiteUrl, resolveTrustedRequestOrigin } from '@/lib/env'
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

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        if (error) {
            return { error: getPublicAuthErrorMessage(error, 'Unable to sign in right now.') }
        }

        profile = data.user ? await ensureProfileForUser(supabase, data.user) : null
    } catch (error) {
        return { error: getPublicAuthErrorMessage(error, 'Unable to sign in right now.') }
    }

    revalidatePath('/', 'layout')
    redirect(getPostAuthRedirect(profile?.role, redirectTo))
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

        profile = data.user ? await ensureProfileForUser(supabase, data.user) : null
    } catch (error) {
        return { error: getPublicAuthErrorMessage(error, 'Unable to create your account right now.') }
    }

    revalidatePath('/', 'layout')
    redirect(getPostAuthRedirect(profile?.role, redirectTo))
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
