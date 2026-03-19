export {};

type MidtransTransactionResult = {
  order_id?: string;
  status_code?: string;
  transaction_id?: string;
  transaction_status?: string;
};

type MidtransSnapCallbacks = {
  onSuccess?: (result: MidtransTransactionResult) => void;
  onPending?: (result: MidtransTransactionResult) => void;
  onError?: (result: MidtransTransactionResult) => void;
  onClose?: () => void;
};

type MidtransSnap = {
  pay: (token: string, callbacks?: MidtransSnapCallbacks) => void;
};

declare global {
  interface Window {
    snap?: MidtransSnap;
  }
}
