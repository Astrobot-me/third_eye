import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';

export interface Esp32LogEntry {
  id: string;
  timestamp: Date;
  direction: 'in' | 'out';
  message: string;
}

export type AuthStatus = 'idle' | 'pending' | 'success' | 'failed';

interface Esp32ContextValue {
  isConnected: boolean;
  logs: Esp32LogEntry[];
  authStatus: AuthStatus;
  sendToESP32: (message: string) => void;
  setConnected: (connected: boolean) => void;
  addLog: (direction: 'in' | 'out', message: string) => void;
  clearLogs: () => void;
  setAuthStatus: (status: AuthStatus) => void;
  clearAuthStatus: () => void;
}

const Esp32Context = createContext<Esp32ContextValue | undefined>(undefined);

const MAX_LOGS = 50;

export function Esp32Provider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<Esp32LogEntry[]>([]);
  const [authStatus, setAuthStatusState] = useState<AuthStatus>('idle');
  
  const sendFnRef = useRef<((message: string) => void) | null>(null);

  const addLog = useCallback((direction: 'in' | 'out', message: string) => {
    setLogs(prev => {
      const newLog: Esp32LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        direction,
        message,
      };
      const updated = [...prev, newLog];
      return updated.slice(-MAX_LOGS);
    });
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const setAuthStatus = useCallback((status: AuthStatus) => {
    setAuthStatusState(status);
    if (status !== 'idle') {
      addLog('in', status === 'pending' ? '⏳ AUTH PENDING' : 
                     status === 'success' ? '✓ AUTH SUCCESS' : 
                     '✕ AUTH FAILED');
    }
  }, [addLog]);

  const clearAuthStatus = useCallback(() => {
    setAuthStatusState('idle');
  }, []);

  const setSendFn = useCallback((fn: ((message: string) => void) | null) => {
    sendFnRef.current = fn;
  }, []);

  const sendToESP32 = useCallback((message: string) => {
    if (sendFnRef.current) {
      sendFnRef.current(message);
    }
  }, []);

  const value: Esp32ContextValue = {
    isConnected,
    logs,
    authStatus,
    sendToESP32,
    setConnected: setIsConnected,
    addLog,
    clearLogs,
    setAuthStatus,
    clearAuthStatus,
  };

  return (
    <Esp32Context.Provider value={value}>
      {children}
    </Esp32Context.Provider>
  );
}

export function useEsp32Context() {
  const context = useContext(Esp32Context);
  if (!context) {
    throw new Error('useEsp32Context must be used within Esp32Provider');
  }
  return context;
}