"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

type GoogleAuthButtonProps = {
    next?: string;
    label?: string;
    disabled?: boolean;
    className?: string;
    onError?: (message: string) => void;
};

export default function GoogleAuthButton({
    next = "/vip",
    label = "Continue with Google",
    disabled = false,
    className = "",
    onError,
}: GoogleAuthButtonProps) {
    const [isLoading, setIsLoading] = useState(false);

    const handleGoogleSignIn = async () => {
        onError?.("");
        setIsLoading(true);

        try {
            const supabase = createClient();
            const redirectTo = new URL("/auth/callback", window.location.origin);
            redirectTo.searchParams.set("next", next);

            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                    redirectTo: redirectTo.toString(),
                },
            });

            if (error) {
                onError?.(error.message);
                setIsLoading(false);
                return;
            }

            if (data.url) {
                window.location.assign(data.url);
                return;
            }

            onError?.("Unable to start Google sign-in.");
        } catch (error) {
            onError?.(error instanceof Error ? error.message : "Unable to start Google sign-in.");
        }

        setIsLoading(false);
    };

    return (
        <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={disabled || isLoading}
            className={className}
        >
            {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
                <GoogleIcon />
            )}
            {label}
        </button>
    );
}

function GoogleIcon() {
    return (
        <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 18 18">
            <path
                d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.56 2.68-3.86 2.68-6.62Z"
                fill="#4285F4"
            />
            <path
                d="M9 18c2.43 0 4.46-.8 5.95-2.18l-2.92-2.26c-.8.54-1.83.86-3.03.86-2.34 0-4.31-1.58-5.01-3.69H.96V13.1A9 9 0 0 0 9 18Z"
                fill="#34A853"
            />
            <path
                d="M3.99 10.73A5.4 5.4 0 0 1 3.71 9c0-.6.1-1.18.28-1.73V4.9H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.1l3.03-2.37Z"
                fill="#FBBC05"
            />
            <path
                d="M9 3.58c1.32 0 2.5.46 3.43 1.35l2.57-2.57C13.46.93 11.43 0 9 0A9 9 0 0 0 .96 4.9l3.03 2.37C4.69 5.16 6.66 3.58 9 3.58Z"
                fill="#EA4335"
            />
        </svg>
    );
}
