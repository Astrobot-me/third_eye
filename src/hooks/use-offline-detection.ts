/**
 * Offline Detection Hook
 * Communicates with local YOLO worker for object detection when in offline mode.
 * Uses Web Speech API for TTS alerts instead of Gemini.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface Detection {
  label: string;
  raw_label?: string;
  position: 'left' | 'center' | 'right';
  proximity: 'very close' | 'nearby' | '';
  priority: 'danger' | 'warning' | 'normal';
  navigate: string;
  distance_m: number;
  distance_label: string;
  movement: 'approaching fast' | 'approaching' | 'moving away' | '';
  count: number;
  // Legacy fields for backward compatibility
  confidence?: number;
  bbox?: [number, number, number, number];
  danger_level?: 'safe' | 'caution' | 'danger';
}

export interface DetectionResult {
  detections: Detection[];
  alert_message: string | null;
  scene_summary?: string;
  object_count?: number;
}

interface UseOfflineDetectionOptions {
  enabled: boolean;
  workerUrl?: string;
  speakAlerts?: boolean;
}

interface UseOfflineDetectionReturn {
  isConnected: boolean;
  lastResult: DetectionResult | null;
  sendFrame: (imageData: string) => Promise<void>;
  error: string | null;
}

const DEFAULT_WORKER_URL = 'http://localhost:8000';

export function useOfflineDetection({
  enabled,
  workerUrl = DEFAULT_WORKER_URL,
  speakAlerts = true
}: UseOfflineDetectionOptions): UseOfflineDetectionReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [lastResult, setLastResult] = useState<DetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastAlertRef = useRef<string>('');
  const lastAlertTimeRef = useRef<number>(0);

  // Check worker health on mount/enable
  useEffect(() => {
    if (!enabled) {
      setIsConnected(false);
      return;
    }

    const checkHealth = async () => {
      try {
        const res = await fetch(`${workerUrl}/health`, { method: 'GET' });
        setIsConnected(res.ok);
        if (res.ok) {
          setError(null);
        }
      } catch {
        setIsConnected(false);
        setError('YOLO worker not running');
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, [enabled, workerUrl]);

  // Web Speech API for alerts
  const speak = useCallback((text: string) => {
    if (!speakAlerts || !text) return;
    
    // Check if speechSynthesis is available
    if (typeof speechSynthesis === 'undefined') {
      console.warn('Web Speech API not available');
      return;
    }
    
    // Cooldown: don't repeat same alert within 3 seconds
    const now = Date.now();
    if (text === lastAlertRef.current && now - lastAlertTimeRef.current < 3000) {
      return;
    }
    
    lastAlertRef.current = text;
    lastAlertTimeRef.current = now;
    
    // Cancel any ongoing speech
    speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.2;  // Slightly faster for alerts
    utterance.pitch = 1.0;
    speechSynthesis.speak(utterance);
  }, [speakAlerts]);

  const sendFrame = useCallback(async (imageData: string) => {
    if (!enabled || !isConnected) return;

    try {
      const res = await fetch(`${workerUrl}/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frame: imageData })  // Worker expects 'frame' field
      });

      if (!res.ok) throw new Error('Detection failed');

      const result: DetectionResult = await res.json();
      setLastResult(result);
      setError(null);

      // Speak alert if present
      if (result.alert_message) {
        speak(result.alert_message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Detection error');
    }
  }, [enabled, isConnected, workerUrl, speak]);

  return { isConnected, lastResult, sendFrame, error };
}
