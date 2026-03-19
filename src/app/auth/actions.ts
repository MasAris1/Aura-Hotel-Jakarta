'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getPublicSiteUrl } from '@/lib/env'

async function getAuthCallbackUrl() {
    const requestHeaders = await headers()
    const origin = requestHeaders.get('origin')

    if (origin) {
        return `${origin}/auth/callback`
    }

    const forwardedHost = requestHeaders.get('x-forwarded-host')
    if (forwardedHost) {
        const forwardedProto = requestHeaders.get('x-forwarded-proto') ?? 'https'
        return `${forwardedProto}://${forwardedHost}/auth/callback`
    }

    return `${getPublicSiteUrl()}/auth/callback`
}

export async function loginWithPassword(formData: FormData, redirectTo?: string) {
    const supabase = await createClient()

    const email = formData.get('email') as string
    const password = formData.get('password') as string

    // basic validation
    if (!email || !password) {
        return { error: 'Email and password are required' }
    }

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })

    if (error) {
        return { error: error.message }
    }

    revalidatePath('/', 'layout')
    redirect(redirectTo || '/vip')
}

export async function loginWithMagicLink(formData: FormData) {
    const supabase = await createClient()

    const email = formData.get('email') as string

    if (!email) {
        return { error: 'Email is required' }
    }

    const redirectTo = await getAuthCallbackUrl()

    const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
            emailRedirectTo: redirectTo,
        },
    })

    if (error) {
        return { error: error.message }
    }

    return { success: 'Magic link sent! Please check your email.' }
}

export async function signup(formData: FormData, redirectTo?: string) {
    const supabase = await createClient()

    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const confirmPassword = formData.get('confirmPassword') as string

    if (!email || !password) {
        return { error: 'Email and password are required' }
    }

    if (password !== confirmPassword) {
        return { error: 'Passwords do not match' }
    }

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    })

    if (error) {
        return { error: error.message }
    }

    if (data.session === null) {
        return { success: 'Please check your email to confirm your registration.' }
    }

    revalidatePath('/', 'layout')
    redirect(redirectTo || '/vip')
}
