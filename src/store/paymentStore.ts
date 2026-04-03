import { create } from 'zustand';
import type { UpiPayload } from '../types';

type PaymentStatus = 'idle' | 'confirming' | 'processing' | 'success' | 'failed';

interface PaymentStore {
  upiMode: boolean;
  scannedPayload: UpiPayload | null;
  paymentStatus: PaymentStatus;
  setUpiMode: (val: boolean) => void;
  setScannedPayload: (payload: UpiPayload | null) => void;
  setPaymentStatus: (status: PaymentStatus) => void;
  reset: () => void;
}

export const usePaymentStore = create<PaymentStore>((set) => ({
  upiMode: false,
  scannedPayload: null,
  paymentStatus: 'idle',
  setUpiMode: (val) => set({ upiMode: val }),
  setScannedPayload: (payload) => set({ scannedPayload: payload, paymentStatus: payload ? 'confirming' : 'idle' }),
  setPaymentStatus: (status) => set({ paymentStatus: status }),
  reset: () => set({ scannedPayload: null, paymentStatus: 'idle' }),
}));
