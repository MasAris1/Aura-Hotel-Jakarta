import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

type AdminSupabaseClient = SupabaseClient<Database>;

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];

export const TRANSACTION_STATUSES = {
  initiated: "INITIATED",
  pending: "PENDING",
  paid: "PAID",
  failed: "FAILED",
  cancelled: "CANCELLED",
  expired: "EXPIRED",
  refunded: "REFUNDED",
} as const;

type TransactionStatus =
  (typeof TRANSACTION_STATUSES)[keyof typeof TRANSACTION_STATUSES];

export function mapBookingStatusToTransactionStatus(
  status: BookingRow["status"] | string | null | undefined,
) {
  switch (status) {
    case "PAID":
    case "CHECKED_IN":
    case "CHECKED_OUT":
      return TRANSACTION_STATUSES.paid;
    case "REFUNDED":
      return TRANSACTION_STATUSES.refunded;
    case "EXPIRED":
      return TRANSACTION_STATUSES.expired;
    case "UNPAID":
    default:
      return TRANSACTION_STATUSES.pending;
  }
}

export function resolveMidtransStatuses(
  transactionStatus: string,
  fraudStatus?: string,
  currentBookingStatus?: string | null,
) {
  if (transactionStatus === "capture") {
    if (fraudStatus === "accept") {
      return {
        bookingStatus: "PAID",
        transactionStatus: TRANSACTION_STATUSES.paid,
        isSuccess: true,
      };
    }

    return {
      bookingStatus: currentBookingStatus ?? "UNPAID",
      transactionStatus: TRANSACTION_STATUSES.pending,
      isSuccess: false,
    };
  }

  if (transactionStatus === "settlement") {
    return {
      bookingStatus: "PAID",
      transactionStatus: TRANSACTION_STATUSES.paid,
      isSuccess: true,
    };
  }

  if (transactionStatus === "pending") {
    return {
      bookingStatus: "UNPAID",
      transactionStatus: TRANSACTION_STATUSES.pending,
      isSuccess: false,
    };
  }

  if (transactionStatus === "deny" || transactionStatus === "failure") {
    return {
      bookingStatus: "UNPAID",
      transactionStatus: TRANSACTION_STATUSES.failed,
      isSuccess: false,
    };
  }

  if (transactionStatus === "cancel") {
    return {
      bookingStatus: "EXPIRED",
      transactionStatus: TRANSACTION_STATUSES.cancelled,
      isSuccess: false,
    };
  }

  if (transactionStatus === "expire") {
    return {
      bookingStatus: "EXPIRED",
      transactionStatus: TRANSACTION_STATUSES.expired,
      isSuccess: false,
    };
  }

  if (transactionStatus === "refund" || transactionStatus === "partial_refund") {
    return {
      bookingStatus: "REFUNDED",
      transactionStatus: TRANSACTION_STATUSES.refunded,
      isSuccess: false,
    };
  }

  return {
    bookingStatus: currentBookingStatus ?? "UNPAID",
    transactionStatus: mapBookingStatusToTransactionStatus(currentBookingStatus),
    isSuccess: false,
  };
}

type UpsertBookingTransactionInput = {
  bookingId: string;
  amount?: number | null;
  paymentType?: string | null;
  status: TransactionStatus | string;
};

export async function upsertBookingTransaction(
  supabase: AdminSupabaseClient,
  { bookingId, amount, paymentType = null, status }: UpsertBookingTransactionInput,
) {
  const { error } = await supabase.from("transactions").upsert(
    {
      booking_id: bookingId,
      midtrans_order_id: bookingId,
      amount: amount ?? null,
      payment_type: paymentType,
      status,
    },
    {
      onConflict: "midtrans_order_id",
    },
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function ensureTransactionForBooking(
  supabase: AdminSupabaseClient,
  booking: Pick<BookingRow, "id" | "total_price" | "status">,
) {
  await upsertBookingTransaction(supabase, {
    bookingId: booking.id,
    amount: Number(booking.total_price ?? 0),
    status: mapBookingStatusToTransactionStatus(booking.status),
  });
}
