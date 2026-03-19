"use client";

import { use, useState } from "react";
import { notFound } from "next/navigation";
import roomsData from "@/data/rooms.json";
import { Check, Star, Wind, Coffee, LayoutDashboard, Users, CreditCard } from "lucide-react";
import Link from "next/link";

export default function RoomDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const room = roomsData.find((r) => r.id === id);
    const [guests, setGuests] = useState(1);

    if (!room) {
        notFound();
    }

    return (
        <main className="min-h-screen bg-background pt-24 pb-24 selection:bg-primary/20">
            {/* Image Gallery Header */}
            <section className="relative h-[60vh] md:h-[70vh] w-full overflow-hidden">
                <img
                    src={room.images[0]}
                    alt={room.name}
                    className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />

                <div className="absolute bottom-0 left-0 w-full p-6 md:p-12 mb-8">
                    <div className="container mx-auto max-w-7xl">
                        <div>
                            <span className="bg-primary/90 backdrop-blur px-4 py-1.5 font-sans text-xs tracking-widest text-primary-foreground uppercase mb-6 inline-block">
                                {room.type}
                            </span>
                            <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif text-foreground mb-4">
                                {room.name}
                            </h1>
                            <div className="flex flex-wrap items-center gap-6 text-foreground/70 font-sans text-sm tracking-widest uppercase">
                                <span className="flex items-center gap-2"><LayoutDashboard className="w-4 h-4 text-primary" /> {room.size}</span>
                                <span className="flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Up to {room.capacity} Guests</span>
                                <span className="flex items-center gap-2"><Star className="w-4 h-4 text-primary" /> {room.bedType}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Main Content & Sticky Sidebar */}
            <section className="container mx-auto max-w-7xl px-6 mt-16">
                <div className="flex flex-col lg:flex-row gap-16">

                    {/* Left Column (Details) */}
                    <div className="lg:w-2/3 space-y-16">
                        <div>
                            <h2 className="font-serif text-3xl text-foreground mb-6">The Experience</h2>
                            <p className="font-sans text-foreground/70 leading-relaxed font-light text-lg">
                                {room.description}
                            </p>
                        </div>

                        <div>
                            <h2 className="font-serif text-3xl text-foreground mb-8">Amenities & Features</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {room.amenities.map((amenity, idx) => (
                                    <div key={idx} className="flex items-start gap-4 p-4 border border-border/50 bg-muted/20 hover:border-primary/50 transition-colors">
                                        <Check className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                                        <span className="font-sans text-foreground/80 font-light">{amenity}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div>
                            <h2 className="font-serif text-3xl text-foreground mb-8">Gallery</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {room.images.slice(1).map((img, idx) => (
                                    <div key={idx} className="relative h-64 md:h-80 overflow-hidden group">
                                        <div className="absolute inset-0 bg-background/20 group-hover:bg-transparent transition-colors duration-500 z-10" />
                                        <img
                                            src={img}
                                            alt={`${room.name} interior`}
                                            className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700 ease-out"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Column (Sticky Booking Card) */}
                    <div className="lg:w-1/3">
                        <div className="sticky top-32 bg-card border border-border shadow-2xl p-8">
                            <div className="border-b border-border pb-6 mb-6">
                                <span className="text-foreground/50 text-xs font-sans tracking-widest uppercase block mb-2">Starting Rate</span>
                                <span className="font-serif text-4xl text-foreground leading-none">
                                    IDR {room.price.toLocaleString('id-ID')}
                                </span>
                                <span className="text-foreground/50 text-xs font-sans mt-2 block">per night, excluding taxes & fees</span>
                            </div>

                            <div className="space-y-6 mb-8">
                                <div>
                                    <label className="text-xs font-sans tracking-widest uppercase text-foreground/70 block mb-2">Select Dates</label>
                                    <div className="border border-border bg-muted/50 p-4 text-center text-sm font-sans text-foreground/50">
                                        <span className="italic">Calendar Component Selected via Booking Flow</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-sans tracking-widest uppercase text-foreground/70 block mb-2">Guests</label>
                                    <select
                                        value={guests}
                                        onChange={e => setGuests(Number(e.target.value))}
                                        className="w-full bg-background border border-border p-3 text-sm font-sans text-foreground focus:outline-none focus:border-primary transition-colors appearance-none"
                                    >
                                        {Array.from({ length: room.capacity }).map((_, i) => (
                                            <option key={i} value={i + 1}>{i + 1} Guest{i > 0 && 's'}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <Link
                                    href={`/booking?room=${room.id}&guests=${guests}`}
                                    className="w-full block text-center py-4 bg-primary text-primary-foreground font-sans tracking-widest text-sm uppercase hover:shadow-lg hover:shadow-primary/30 transition-all duration-300"
                                >
                                    Reserve Now
                                </Link>
                                <div className="flex items-center justify-center gap-2 text-foreground/40 font-sans text-[10px] tracking-widest uppercase mt-4">
                                    <CreditCard className="w-3 h-3" /> Secure Transaction
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </section>
        </main>
    );
}
