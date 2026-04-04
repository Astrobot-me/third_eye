import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface Esp32LogEntry {
  id: string;
  timestamp: Date;
  direction: 'in' | 'out';
  message: string;
}

interface Esp32ContextValue {
  isConnected: boolean;
  logs: Esp32LogEntry[];
  setConnected: (connected: boolean) => void;
  addLog: (direction: 'in' | 'out', message: string) => void;
  clearLogs: () => void;
}

const Esp32Context = createContext<Esp32ContextValue | undefined>(undefined);

const MAX_LOGS = 50;

export function Esp32Provider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<Esp32LogEntry[]>([]);

  const addLog = useCallback((direction: 'in' | 'out', message: string) => {
    setLogs(prev => {
      const newLog: Esp32LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        direction,
        message,
      };
      const updated = [...prev, newLog];
      // Keep only last MAX_LOGS entries
      return updated.slice(-MAX_LOGS);
    });
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return (
    <Esp32Context.Provider value={{ isConnected, logs, setConnected: setIsConnected, addLog, clearLogs }}>
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