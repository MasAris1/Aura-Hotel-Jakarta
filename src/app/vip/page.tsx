"use client";

import { useState, useEffect } from "react";
import { Thermometer, Wind, Coffee, Bed, ShieldCheck, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

const STORAGE_KEY = "aura_vip_preferences";

type Preferences = {
    climate: number;
    aroma: string;
    pillow: string;
    drink: string;
};

type UserProfile = {
    first_name?: string | null;
    last_name?: string | null;
};

const defaultPrefs: Preferences = {
    climate: 22,
    aroma: "Sandalwood & Vanilla",
    pillow: "Goose Down (Soft)",
    drink: "Dom Pérignon Vintage",
};

export default function VIPPortal() {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);
    const [prefs, setPrefs] = useState<Preferences>(() => {
        if (typeof window === "undefined") {
            return defaultPrefs;
        }

        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (!stored) {
            return defaultPrefs;
        }

        try {
            return JSON.parse(stored) as Preferences;
        } catch {
            return defaultPrefs;
        }
    });

    useEffect(() => {
        // Fetch user data
        const fetchUser = async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('first_name, last_name')
                    .eq('id', user.id)
                    .single();
                setUser(profile || { first_name: user.email?.split('@')[0], last_name: '' });
            }
            setLoading(false);
        };

        void fetchUser();
    }, []);

    const handleSave = () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const adjustClimate = (delta: number) => {
        setPrefs(p => ({ ...p, climate: Math.min(30, Math.max(16, p.climate + delta)) }));
    };

    if (loading) {
        return (
            <main className="min-h-screen pt-32 pb-20 bg-background flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </main>
        );
    }

    const displayName = user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : 'Guest';
    const initials = displayName.charAt(0).toUpperCase();

    return (
        <main className="min-h-screen pt-32 pb-20 bg-background text-foreground px-6">
            <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-12">
                {/* Sidebar */}
                <div className="lg:col-span-1 space-y-8">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center font-serif text-2xl border border-primary/20 text-primary">
                            {initials}
                        </div>
                        <div>
                            <h2 className="font-serif text-xl text-foreground">{displayName}</h2>
                            <span className="text-xs font-sans tracking-widest uppercase text-primary flex items-center gap-1 mt-1">
                                <ShieldCheck className="w-3 h-3" /> VIP Member
                            </span>
                        </div>
                    </div>

                    <nav className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-4 lg:pb-0">
                        {["Preferences"].map((item) => (
                            <button
                                key={item}
                                className="text-left px-4 py-3 font-sans text-sm tracking-widest uppercase whitespace-nowrap transition-colors bg-primary text-primary-foreground"
                            >
                                {item}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Content Area */}
                <div className="lg:col-span-3">
                    <div>
                        <h1 className="font-serif text-4xl mb-2 text-foreground">Suite Preferences</h1>
                        <p className="font-sans text-foreground/50 text-sm mb-12">
                            Customize your environment before arrival. The Royal Butler will ensure
                            everything is arranged exactly to your liking.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Climate Control */}
                            <div className="border border-border p-8 bg-muted/20 hover:bg-muted/30 transition-colors">
                                <div className="flex items-center gap-3 mb-6">
                                    <Thermometer className="w-5 h-5 text-foreground/70" />
                                    <h3 className="font-sans tracking-widest uppercase text-sm text-foreground">Climate</h3>
                                </div>
                                <div className="flex items-center justify-between bg-background border border-border p-4 rounded-full">
                                    <button
                                        onClick={() => adjustClimate(-1)}
                                        className="w-10 h-10 rounded-full border border-border flex items-center justify-center hover:bg-muted text-foreground transition-colors"
                                    >-</button>
                                    <span className="font-serif text-3xl text-foreground">{prefs.climate}°C</span>
                                    <button
                                        onClick={() => adjustClimate(1)}
                                        className="w-10 h-10 rounded-full border border-border flex items-center justify-center hover:bg-muted text-foreground transition-colors"
                                    >+</button>
                                </div>
                            </div>

                            {/* Aromatherapy */}
                            <div className="border border-border p-8 bg-muted/20 hover:bg-muted/30 transition-colors">
                                <div className="flex items-center gap-3 mb-6">
                                    <Wind className="w-5 h-5 text-foreground/70" />
                                    <h3 className="font-sans tracking-widest uppercase text-sm text-foreground">Aromatherapy</h3>
                                </div>
                                <select
                                    value={prefs.aroma}
                                    onChange={e => setPrefs(p => ({ ...p, aroma: e.target.value }))}
                                    className="w-full bg-background border border-border p-4 font-sans text-sm focus:outline-none focus:border-primary appearance-none h-[74px] text-foreground"
                                >
                                    <option>Sandalwood &amp; Vanilla</option>
                                    <option>Lavender &amp; Bergamot</option>
                                    <option>Ocean Breeze</option>
                                    <option>None (Fragrance-free)</option>
                                </select>
                            </div>

                            {/* Pillow Menu */}
                            <div className="border border-border p-8 bg-muted/20 hover:bg-muted/30 transition-colors">
                                <div className="flex items-center gap-3 mb-6">
                                    <Bed className="w-5 h-5 text-foreground/70" />
                                    <h3 className="font-sans tracking-widest uppercase text-sm text-foreground">Pillow Menu</h3>
                                </div>
                                <select
                                    value={prefs.pillow}
                                    onChange={e => setPrefs(p => ({ ...p, pillow: e.target.value }))}
                                    className="w-full bg-background border border-border p-4 font-sans text-sm focus:outline-none focus:border-primary appearance-none h-[74px] text-foreground"
                                >
                                    <option>Goose Down (Soft)</option>
                                    <option>Memory Foam (Firm)</option>
                                    <option>Buckwheat (Supportive)</option>
                                    <option>Hypoallergenic</option>
                                </select>
                            </div>

                            {/* Arrival Beverage */}
                            <div className="border border-border p-8 bg-muted/20 hover:bg-muted/30 transition-colors">
                                <div className="flex items-center gap-3 mb-6">
                                    <Coffee className="w-5 h-5 text-foreground/70" />
                                    <h3 className="font-sans tracking-widest uppercase text-sm text-foreground">Arrival Drink</h3>
                                </div>
                                <select
                                    value={prefs.drink}
                                    onChange={e => setPrefs(p => ({ ...p, drink: e.target.value }))}
                                    className="w-full bg-background border border-border p-4 font-sans text-sm focus:outline-none focus:border-primary appearance-none h-[74px] text-foreground"
                                >
                                    <option>Dom Pérignon Vintage</option>
                                    <option>Artisan Matcha Tea</option>
                                    <option>Sparkling Water</option>
                                    <option>Fresh Pressed Juice</option>
                                </select>
                            </div>
                        </div>

                        <div className="mt-12 flex justify-end items-center gap-4">
                            {saved && (
                                <span className="text-green-500 text-xs font-sans tracking-widest uppercase">
                                    ✓ Preferences Saved
                                </span>
                            )}
                            <button
                                onClick={handleSave}
                                className="px-8 py-4 bg-primary text-primary-foreground font-sans tracking-widest text-sm uppercase hover:shadow-lg hover:shadow-primary/30 transition-all font-medium"
                            >
                                Save Preferences
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
