// src/lib/midtrans.ts
import midtransClient from 'midtrans-client';

// Midtrans Snap Client
export const snap = new midtransClient.Snap({
    isProduction: process.env.NODE_ENV === 'production',
    serverKey: process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-DUMMY',
    clientKey: process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || 'SB-Mid-client-DUMMY'
});

// Midtrans Core API Client (Untuk Refund / Update status manual)
export const coreApi = new midtransClient.CoreApi({
    isProduction: process.env.NODE_ENV === 'production',
    serverKey: process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-DUMMY',
    clientKey: process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || 'SB-Mid-client-DUMMY'
});
