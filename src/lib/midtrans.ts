// src/lib/midtrans.ts
import midtransClient from 'midtrans-client';
import { getRequiredEnv } from '@/lib/env';

const serverKey = getRequiredEnv("MIDTRANS_SERVER_KEY");
const clientKey = getRequiredEnv("NEXT_PUBLIC_MIDTRANS_CLIENT_KEY");

// Midtrans Snap Client
export const snap = new midtransClient.Snap({
    isProduction: process.env.NODE_ENV === 'production',
    serverKey,
    clientKey
});

// Midtrans Core API Client (Untuk Refund / Update status manual)
export const coreApi = new midtransClient.CoreApi({
    isProduction: process.env.NODE_ENV === 'production',
    serverKey,
    clientKey
});

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
