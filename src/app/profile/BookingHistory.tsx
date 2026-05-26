"use client";

import { useState, useEffect } from "react";
import { BedDouble, Calendar, Download, Eye, X, Loader2 } from "lucide-react";
import QRCode from "qrcode";

type Booking = {
  id: string;
  check_in: string;
  check_out: string;
  total_price: number;
  status: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  rooms: {
    name: string;
    type?: string | null;
  } | null;
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${dateString}T00:00:00`));
}

function getStatusColor(status: string | null) {
  switch (status?.toLowerCase()) {
    case "confirmed":
    case "paid":
    case "success":
      return "border-green-500/25 bg-green-500/10 text-green-300";
    case "pending":
    case "unpaid":
      return "border-yellow-500/25 bg-yellow-500/10 text-yellow-300";
    case "cancelled":
    case "failed":
      return "border-red-500/25 bg-red-500/10 text-red-300";
    default:
      return "border-border bg-muted/60 text-foreground/50";
  }
}

export function BookingHistory({ bookings }: { bookings: Booking[] }) {
  const [activeTicket, setActiveTicket] = useState<Booking | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");

  useEffect(() => {
    if (activeTicket) {
      QRCode.toDataURL(`aura-voucher-${activeTicket.id}`, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 150,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      })
      .then((url) => setQrCodeUrl(url))
      .catch((err) => console.error("Error generating QR code:", err));
    } else {
      setQrCodeUrl("");
    }
  }, [activeTicket]);

  if (!bookings || bookings.length === 0) {
    return (
      <div className="border border-border bg-card p-5 sm:p-7 text-center">
        <p className="font-inter text-sm text-foreground/55">
          Belum ada riwayat reservasi.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {bookings.map((booking) => (
        <div
          key={booking.id}
          className="border border-border bg-card p-5 sm:p-6 transition-colors hover:border-primary/30"
        >
          <div className="mb-4 flex flex-col justify-between gap-4 border-b border-border pb-4 sm:flex-row sm:items-center">
            <div>
              <p className="mb-1 font-inter text-[11px] uppercase tracking-[0.24em] text-foreground/45">
                ID Booking: {booking.id.split("-")[0].toUpperCase()}
              </p>
              <h3 className="flex items-center gap-2 font-playfair text-lg sm:text-xl text-foreground">
                <BedDouble className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                {booking.rooms?.name || "Kamar tidak diketahui"}
              </h3>
            </div>
            <div
              className={`inline-flex items-center justify-center border px-3 py-1 font-inter text-[11px] uppercase tracking-[0.22em] ${getStatusColor(
                booking.status,
              )}`}
            >
              {booking.status || "Unknown"}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            <div>
              <p className="mb-1 font-inter text-[11px] uppercase tracking-[0.2em] text-foreground/40">
                Check-in
              </p>
              <p className="flex items-center gap-2 font-inter text-sm text-foreground/80">
                <Calendar className="h-4 w-4 text-primary/70" />
                {formatDate(booking.check_in)}
              </p>
            </div>
            <div>
              <p className="mb-1 font-inter text-[11px] uppercase tracking-[0.2em] text-foreground/40">
                Check-out
              </p>
              <p className="flex items-center gap-2 font-inter text-sm text-foreground/80">
                <Calendar className="h-4 w-4 text-primary/70" />
                {formatDate(booking.check_out)}
              </p>
            </div>
            <div>
              <p className="mb-1 font-inter text-[11px] uppercase tracking-[0.2em] text-foreground/40">
                Total Harga
              </p>
              <p className="font-playfair text-lg text-foreground font-semibold">
                {formatCurrency(booking.total_price)}
              </p>
            </div>
          </div>

          {/* Action buttons for eligible bookings */}
          {(booking.status?.toUpperCase() === "PAID" ||
            booking.status?.toUpperCase() === "SUCCESS" ||
            booking.status?.toUpperCase() === "CONFIRMED" ||
            booking.status?.toUpperCase() === "CHECKED_IN" ||
            booking.status?.toUpperCase() === "CHECKED_OUT") && (
            <div className="mt-6 flex flex-wrap gap-3 border-t border-border pt-4 justify-end">
              <button
                onClick={() => setActiveTicket(booking)}
                className="inline-flex items-center gap-2 border border-primary/30 hover:border-primary px-4 py-2.5 font-inter text-[11px] uppercase tracking-wider text-primary bg-primary/5 transition-all cursor-pointer font-medium"
              >
                <Eye className="h-3.5 w-3.5" />
                Lihat Tiket
              </button>
              <a
                href={`/api/vouchers/${booking.id}`}
                className="inline-flex items-center gap-2 border border-border hover:border-primary px-4 py-2.5 font-inter text-[11px] uppercase tracking-wider text-foreground transition-all cursor-pointer font-medium bg-transparent"
              >
                <Download className="h-3.5 w-3.5" />
                Unduh Tiket
              </a>
            </div>
          )}
        </div>
      ))}

      {/* Ticket Modal Overlay */}
      {activeTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 transition-all duration-300">
          <div className="relative w-full max-w-[480px] bg-zinc-950 border border-primary/20 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(212,175,71,0.15)]">
            {/* Modal Close Button */}
            <button
              onClick={() => setActiveTicket(null)}
              className="absolute top-4 right-4 z-10 text-foreground/50 hover:text-foreground transition-colors p-1 rounded-full bg-black/40 border border-primary/10 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Ticket Header */}
            <div className="p-6 border-b border-primary/10 flex justify-between items-start pr-12">
              <div>
                <p className="text-[10px] font-sans tracking-[0.2em] text-foreground/45 uppercase mb-1">Nama Tamu</p>
                <p className="font-serif text-lg text-primary">{activeTicket.first_name || ""} {activeTicket.last_name || ""}</p>
              </div>
              <div className={`px-3 py-1 border font-sans text-[10px] tracking-wider uppercase ${
                activeTicket.status === "PAID" || activeTicket.status === "SUCCESS"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-medium"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-400 font-medium"
              }`}>
                {activeTicket.status === "PAID" || activeTicket.status === "SUCCESS" ? "TERBAYAR" : activeTicket.status}
              </div>
            </div>

            {/* Ticket Body */}
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-[10px] font-sans tracking-[0.2em] text-foreground/45 uppercase mb-1">ID Booking</p>
                  <p className="font-sans text-sm text-foreground font-semibold uppercase tracking-wider">
                    #{activeTicket.id.split("-")[0].toUpperCase()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-sans tracking-[0.2em] text-foreground/45 uppercase mb-1">Tipe Kamar</p>
                  <p className="font-sans text-sm text-foreground font-medium">{activeTicket.rooms?.type || "Luxury Suite"}</p>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-sans tracking-[0.2em] text-foreground/45 uppercase mb-1">Akomodasi</p>
                <p className="font-serif text-xl text-foreground font-light">{activeTicket.rooms?.name || "Kamar tidak diketahui"}</p>
              </div>
              <div className="grid grid-cols-2 gap-6 border-t border-primary/10 pt-6">
                <div>
                  <p className="text-[10px] font-sans tracking-[0.2em] text-foreground/45 uppercase mb-1">Check-In</p>
                  <p className="font-sans text-sm text-foreground">{formatDate(activeTicket.check_in)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-sans tracking-[0.2em] text-foreground/45 uppercase mb-1">Check-Out</p>
                  <p className="font-sans text-sm text-foreground">{formatDate(activeTicket.check_out)}</p>
                </div>
              </div>
            </div>

            {/* Perforation Line */}
            <div className="relative h-6 flex items-center bg-transparent select-none">
              {/* Left notch */}
              <div className="absolute -left-3 w-6 h-6 bg-background rounded-full border-r border-primary/20"></div>
              {/* Dashed line */}
              <div className="w-full border-t border-dashed border-primary/30 mx-4"></div>
              {/* Right notch */}
              <div className="absolute -right-3 w-6 h-6 bg-background rounded-full border-l border-primary/20"></div>
            </div>

            {/* Ticket Footer */}
            <div className="p-6 flex flex-col items-center bg-black/40 border-t border-primary/5">
              <div className="mb-6 text-center">
                <p className="text-[10px] font-sans tracking-[0.2em] text-foreground/45 uppercase mb-1">Total Pembayaran</p>
                <p className="font-serif text-2xl text-primary tracking-tighter font-semibold">{formatCurrency(activeTicket.total_price)}</p>
              </div>

              {/* QR Code Section */}
              <div className="p-2 bg-white rounded-xl mb-4 flex items-center justify-center shadow-md">
                {qrCodeUrl ? (
                  <img
                    alt="QR Code"
                    className="w-28 h-28 grayscale contrast-125 select-none"
                    src={qrCodeUrl}
                  />
                ) : (
                  <div className="w-28 h-28 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                )}
              </div>
              <p className="text-[9px] font-sans tracking-[0.2em] text-foreground/35 uppercase text-center font-light mb-6">Tunjukkan voucher saat Check-in</p>

              {/* Actions inside modal */}
              <div className="w-full flex gap-3">
                <a
                  href={`/api/vouchers/${activeTicket.id}`}
                  className="flex-1 bg-primary border border-primary text-primary-foreground font-sans text-[10px] tracking-[0.2em] uppercase py-3.5 text-center transition-all flex items-center justify-center gap-2 font-medium"
                >
                  <Download className="w-3.5 h-3.5" />
                  Unduh Tiket
                </a>
                <button
                  onClick={() => setActiveTicket(null)}
                  className="flex-1 border border-border hover:border-primary/50 text-foreground font-sans text-[10px] tracking-[0.2em] uppercase py-3.5 text-center transition-all font-medium bg-transparent cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
