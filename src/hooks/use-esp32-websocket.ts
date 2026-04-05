/**
 * ESP32 WebSocket Hook
 * Connects to ESP32 WebSocket server for button control integration.
 * 
 * Commands received from ESP32:
 * - TOGGLE_MUTE, MUTE_ON, MUTE_OFF
 * - CONNECT, DISCONNECT, TOGGLE_CONNECT
 * - MODE_ACTIVE, MODE_PASSIVE, TOGGLE_MODE
 * - WEBCAM_ON, WEBCAM_OFF
 * - PTT_START, PTT_STOP
 */

import { useEffect, useRef, useCallback } from 'react';
import { useEsp32Context } from '../contexts/Esp32Context';

export type ESP32Command = 
  | 'TOGGLE_MUTE' | 'MUTE_ON' | 'MUTE_OFF'
  | 'CONNECT' | 'DISCONNECT' | 'TOGGLE_CONNECT'
  | 'MODE_ACTIVE' | 'MODE_PASSIVE' | 'TOGGLE_MODE'
  | 'WEBCAM_ON' | 'WEBCAM_OFF'
  | 'PTT_START' | 'PTT_STOP'
  | 'AUTH_SUCCESS'
  | 'AUTH_FAILED';

interface UseESP32WebSocketOptions {
  onCommand: (command: ESP32Command) => void;
  enabled?: boolean;
}

interface UseESP32WebSocketReturn {
  isConnected: boolean;
  sendToESP32: (message: string) => void;
}

// Debounce delay for mode commands (prevents race conditions with async toggleMode)
const MODE_DEBOUNCE_MS = 300;

// Commands that need debouncing
const DEBOUNCED_COMMANDS = new Set(['MODE_ACTIVE', 'MODE_PASSIVE', 'TOGGLE_MODE']);

export function useESP32WebSocket({ 
  onCommand, 
  enabled = true 
}: UseESP32WebSocketOptions): UseESP32WebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const lastCommandTimeRef = useRef<Record<string, number>>({});
  
  const { setConnected, addLog, setAuthStatus } = useEsp32Context();
  
  // Store onCommand in ref to avoid reconnection on callback change
  const onCommandRef = useRef(onCommand);
  onCommandRef.current = onCommand;

  // Get ESP32 URL from environment or use default
  const esp32Url = process.env.REACT_APP_ESP32_IP 
    ? `ws://${process.env.REACT_APP_ESP32_IP}`
    : null; // Disabled by default if no env var

  const connect = useCallback(() => {
    // Don't connect if disabled or no URL configured
    if (!enabled || !esp32Url) return;
    
    // Don't reconnect if already open
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      console.log('[ESP32] Connecting to', esp32Url);
      addLog('out', `Connecting to ${esp32Url}...`);
      const ws = new WebSocket(esp32Url);

      ws.onopen = () => {
        console.log('[ESP32] Connected');
        setConnected(true);
        addLog('in', '● CONNECTED');
      };

      ws.onmessage = (event) => {
        const command = event.data.trim() as ESP32Command;
        console.log('[ESP32] Command received:', command);
        addLog('in', `← ${command}`);
        
        // Handle authentication responses
        if (command === 'AUTH_SUCCESS') {
          setAuthStatus('success');
        } else if (command === 'AUTH_FAILED') {
          setAuthStatus('failed');
        }
        
        // Check if command needs debouncing
        if (DEBOUNCED_COMMANDS.has(command)) {
          const now = Date.now();
          const lastTime = lastCommandTimeRef.current[command] || 0;
          
          if (now - lastTime < MODE_DEBOUNCE_MS) {
            console.log('[ESP32] Command debounced:', command);
            return;
          }
          
          lastCommandTimeRef.current[command] = now;
        }
        
        // Execute command via ref (avoids stale closure)
        onCommandRef.current(command);
      };

      ws.onclose = () => {
        console.log('[ESP32] Disconnected');
        setConnected(false);
        addLog('in', '● DISCONNECTED');
        wsRef.current = null;
        
        // Auto-reconnect after 3 seconds
        if (enabled && esp32Url) {
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = (error) => {
        console.warn('[ESP32] WebSocket error:', error);
        addLog('in', '✖ CONNECTION ERROR');
        ws.close();
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[ESP32] Connection error:', err);
      addLog('in', `✖ ERROR: ${err}`);
    }
  }, [enabled, esp32Url, setConnected, addLog, setAuthStatus]);

  // Send message to ESP32 (for state sync/LED feedback)
  const sendToESP32 = useCallback((message: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(message);
      console.log('[ESP32] Sent:', message);
      addLog('out', `→ ${message}`);
    }
  }, [addLog]);

  // Connect on mount, cleanup on unmount
  useEffect(() => {
    if (enabled && esp32Url) {
      connect();
    }

    return () => {
      clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, esp32Url, connect]);

  return { 
    isConnected: useEsp32Context().isConnected, 
    sendToESP32 
  };
}