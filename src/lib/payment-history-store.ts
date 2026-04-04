/**
 * Payment History Store
 * Tracks QR scans and payment transactions for display in narration console.
 */

import { create } from "zustand";

export type PaymentEntryType = "QR_SCAN" | "PAYMENT" | "ERROR";
export type PaymentStatus = "pending" | "initiated" | "success" | "failed";

export interface QrScanEntry {
  id: string;
  timestamp: Date;
  type: "QR_SCAN";
  upiId?: string;
  merchantName?: string;
  amount?: number;
  success: boolean;
  rawData?: string;
}

export interface PaymentEntry {
  id: string;
  timestamp: Date;
  type: "PAYMENT";
  upiId: string;
  merchantName?: string;
  amount: number;
  status: PaymentStatus;
  deepLink?: string;
  note?: string;
}

export interface ErrorEntry {
  id: string;
  timestamp: Date;
  type: "ERROR";
  message: string;
  context?: string;
}

export type HistoryEntry = QrScanEntry | PaymentEntry | ErrorEntry;

interface PaymentHistoryState {
  entries: HistoryEntry[];
  
  // Actions
  logQrScan: (data: Omit<QrScanEntry, "id" | "timestamp" | "type">) => void;
  logPayment: (data: Omit<PaymentEntry, "id" | "timestamp" | "type">) => void;
  logError: (message: string, context?: string) => void;
  updatePaymentStatus: (id: string, status: PaymentStatus) => void;
  clearHistory: () => void;
  
  // Selectors
  getRecentEntries: (count?: number) => HistoryEntry[];
  getPaymentById: (id: string) => PaymentEntry | undefined;
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export const usePaymentHistoryStore = create<PaymentHistoryState>((set, get) => ({
  entries: [],

  logQrScan: (data) => {
    const entry: QrScanEntry = {
      id: generateId(),
      timestamp: new Date(),
      type: "QR_SCAN",
      ...data,
    };
    set((state) => ({ entries: [...state.entries, entry] }));
    console.log("[PaymentHistory] QR Scan logged:", entry);
  },

  logPayment: (data) => {
    const entry: PaymentEntry = {
      id: generateId(),
      timestamp: new Date(),
      type: "PAYMENT",
      ...data,
    };
    set((state) => ({ entries: [...state.entries, entry] }));
    console.log("[PaymentHistory] Payment logged:", entry);
  },

  logError: (message, context) => {
    const entry: ErrorEntry = {
      id: generateId(),
      timestamp: new Date(),
      type: "ERROR",
      message,
      context,
    };
    set((state) => ({ entries: [...state.entries, entry] }));
    console.log("[PaymentHistory] Error logged:", entry);
  },

  updatePaymentStatus: (id, status) => {
    set((state) => ({
      entries: state.entries.map((entry) =>
        entry.type === "PAYMENT" && entry.id === id
          ? { ...entry, status }
          : entry
      ),
    }));
  },

  clearHistory: () => set({ entries: [] }),

  getRecentEntries: (count = 10) => {
    return get().entries.slice(-count);
  },

  getPaymentById: (id) => {
    return get().entries.find(
      (entry) => entry.type === "PAYMENT" && entry.id === id
    ) as PaymentEntry | undefined;
  },
}));

// Export singleton for non-React usage
export const paymentHistory = {
  logQrScan: (data: Omit<QrScanEntry, "id" | "timestamp" | "type">) => {
    usePaymentHistoryStore.getState().logQrScan(data);
  },
  logPayment: (data: Omit<PaymentEntry, "id" | "timestamp" | "type">) => {
    usePaymentHistoryStore.getState().logPayment(data);
  },
  logError: (message: string, context?: string) => {
    usePaymentHistoryStore.getState().logError(message, context);
  },
  updatePaymentStatus: (id: string, status: PaymentStatus) => {
    usePaymentHistoryStore.getState().updatePaymentStatus(id, status);
  },
  getEntries: () => usePaymentHistoryStore.getState().entries,
};
