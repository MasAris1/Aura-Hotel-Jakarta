import { BedDouble, Calendar } from "lucide-react";

type Booking = {
  id: string;
  check_in: string;
  check_out: string;
  total_price: number;
  status: string | null;
  rooms: {
    name: string;
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
  }).format(new Date(dateString));
}

function getStatusColor(status: string | null) {
  switch (status?.toLowerCase()) {
    case "confirmed":
    case "paid":
    case "success":
      return "border-green-500/25 bg-green-500/10 text-green-300";
    case "pending":
      return "border-yellow-500/25 bg-yellow-500/10 text-yellow-300";
    case "cancelled":
    case "failed":
      return "border-red-500/25 bg-red-500/10 text-red-300";
    default:
      return "border-border bg-muted/60 text-foreground/50";
  }
}

export function BookingHistory({ bookings }: { bookings: Booking[] }) {
  if (!bookings || bookings.length === 0) {
    return (
      <div className="border border-border bg-card p-7 text-center">
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
          className="border border-border bg-card p-6 transition-colors hover:border-primary/30"
        >
          <div className="mb-4 flex flex-col justify-between gap-4 border-b border-border pb-4 sm:flex-row sm:items-center">
            <div>
              <p className="mb-1 font-inter text-[11px] uppercase tracking-[0.24em] text-foreground/45">
                ID Booking: {booking.id.split("-")[0]}
              </p>
              <h3 className="flex items-center gap-2 font-playfair text-xl text-foreground">
                <BedDouble className="h-5 w-5 text-primary" />
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
              <p className="font-playfair text-lg text-foreground">
                {formatCurrency(booking.total_price)}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
