// src/lib/midtrans.ts
import midtransClient from 'midtrans-client';
import { getRequiredEnv } from '@/lib/env';
import { getMidtransIsProduction } from '@/lib/midtransConfig';

const serverKey = getRequiredEnv("MIDTRANS_SERVER_KEY");
const clientKey = getRequiredEnv("NEXT_PUBLIC_MIDTRANS_CLIENT_KEY");
const isProduction = getMidtransIsProduction({ serverKey, clientKey });

// Midtrans Snap Client
export const snap = new midtransClient.Snap({
    isProduction,
    serverKey,
    clientKey
});

// Midtrans Core API Client (Untuk Refund / Update status manual)
export const coreApi = new midtransClient.CoreApi({
    isProduction,
    serverKey,
    clientKey
});

type MidtransCustomer = {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
};

type BuildRoomPaymentParameterInput = {
    bookingId: string;
    roomId: string | null;
    roomName: string;
    nights: number;
    totalPrice: number;
    customer: MidtransCustomer;
};

function normalizePositiveIntegerAmount(value: number) {
    const amount = Math.round(Number(value));

    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Invalid Midtrans gross amount.");
    }

    return amount;
}

function compactItemName(roomName: string, nights: number) {
    const stayLabel = `${Math.max(1, nights)} night${nights === 1 ? "" : "s"}`;
    const name = `${roomName} - ${stayLabel}`;

    return name.length > 50 ? `${name.slice(0, 47)}...` : name;
}

export function buildRoomPaymentParameter({
    bookingId,
    roomId,
    roomName,
    nights,
    totalPrice,
    customer,
}: BuildRoomPaymentParameterInput) {
    const grossAmount = normalizePositiveIntegerAmount(totalPrice);

    return {
        transaction_details: {
            order_id: bookingId,
            gross_amount: grossAmount
        },
        customer_details: {
            first_name: customer.firstName ?? "",
            last_name: customer.lastName ?? "",
            email: customer.email ?? ""
        },
        item_details: [{
            id: roomId ?? bookingId,
            price: grossAmount,
            quantity: 1,
            name: compactItemName(roomName, nights)
        }]
    };
}

type MidtransTransactionApi = {
    cancel: (transactionId: string) => Promise<unknown>;
    refund: (
        transactionId: string,
        parameter?: {
            refund_key?: string;
            amount?: number;
            reason?: string;
        },
    ) => Promise<unknown>;
};

export const midtransTransaction = (
    coreApi as unknown as { transaction: MidtransTransactionApi }
).transaction;
