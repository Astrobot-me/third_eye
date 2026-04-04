/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GenAILiveClient } from "../lib/genai-live-client";
import { LiveClientOptions } from "../types";
import { AudioStreamer } from "../lib/audio-streamer";
import { audioContext } from "../lib/utils";
import VolMeterWorket from "../lib/worklets/vol-meter";
import { LiveConnectConfig, Modality } from "@google/genai";
import { ACTIVE_MODE_SYSTEM_PROMPT, PASSIVE_MODE_SYSTEM_PROMPT } from "../lib/active-mode-prompt";

export type AppMode = 'passive' | 'active';

export type UseLiveAPIResults = {
  client: GenAILiveClient;
  setConfig: (config: LiveConnectConfig) => void;
  config: LiveConnectConfig;
  model: string;
  setModel: (model: string) => void;
  connected: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  volume: number;
  // New mode properties
  mode: AppMode;
  toggleMode: () => Promise<void>;
};

export function useLiveAPI(options: LiveClientOptions): UseLiveAPIResults {
  const client = useMemo(() => new GenAILiveClient(options), [options]);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);

  const [model, setModel] = useState<string>("models/gemini-2.5-flash-native-audio-preview-12-2025");
  const [config, setConfig] = useState<LiveConnectConfig>({});
  const [connected, setConnected] = useState(false);
  const [volume, setVolume] = useState(0);
  const [mode, setMode] = useState<AppMode>('passive');

  // Build config based on mode - preserves tools from baseConfig, overwrites systemInstruction
  const buildConfigForMode = useCallback((baseConfig: LiveConnectConfig, targetMode: AppMode): LiveConnectConfig => {
    const systemPrompt = targetMode === 'active' 
      ? ACTIVE_MODE_SYSTEM_PROMPT 
      : PASSIVE_MODE_SYSTEM_PROMPT;
    
    // Preserve existing tools from baseConfig (e.g., Altair's render_altair)
    // Ensure googleSearch is always included
    const existingTools = baseConfig.tools || [];
    const hasGoogleSearch = existingTools.some(
      (tool: any) => tool.googleSearch !== undefined
    );
    const tools = hasGoogleSearch 
      ? existingTools 
      : [...existingTools, { googleSearch: {} }];
    
    // Build the config with mode-specific settings
    const finalConfig: LiveConnectConfig = {
      ...baseConfig,
      responseModalities: [Modality.AUDIO],
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      tools,
    };

    // Enable proactive audio for active mode (requires v1alpha API version)
    // Note: proactiveAudio allows model to decide NOT to respond when content isn't relevant.
    // The actual active narration is triggered by periodic [DESCRIBE] prompts from ControlTray.
    if (targetMode === 'active') {
      (finalConfig as any).proactivity = { proactiveAudio: true };
    }

    return finalConfig;
  }, []);

  // register audio for streaming server -> speakers
  useEffect(() => {
    if (!audioStreamerRef.current) {
      audioContext({ id: "audio-out" }).then((audioCtx: AudioContext) => {
        audioStreamerRef.current = new AudioStreamer(audioCtx);
        audioStreamerRef.current
          .addWorklet<any>("vumeter-out", VolMeterWorket, (ev: any) => {
            setVolume(ev.data.volume);
          })
          .then(() => {
            // Successfully added worklet
          });
      });
    }
  }, [audioStreamerRef]);

  useEffect(() => {
    const onOpen = () => {
      setConnected(true);
    };

    const onClose = () => {
      setConnected(false);
    };

    const onError = (error: ErrorEvent) => {
      console.error("error", error);
    };

    const stopAudioStreamer = () => audioStreamerRef.current?.stop();

    const onAudio = (data: ArrayBuffer) =>
      audioStreamerRef.current?.addPCM16(new Uint8Array(data));

    client
      .on("error", onError)
      .on("open", onOpen)
      .on("close", onClose)
      .on("interrupted", stopAudioStreamer)
      .on("audio", onAudio);

    return () => {
      client
        .off("error", onError)
        .off("open", onOpen)
        .off("close", onClose)
        .off("interrupted", stopAudioStreamer)
        .off("audio", onAudio)
        .disconnect();
    };
  }, [client]);

  const connect = useCallback(async () => {
    if (!config) {
      throw new Error("config has not been set");
    }
    const finalConfig = buildConfigForMode(config, mode);
    client.disconnect();
    await client.connect(model, finalConfig);
  }, [client, config, model, mode, buildConfigForMode]);

  const disconnect = useCallback(async () => {
    client.disconnect();
    setConnected(false);
  }, [setConnected, client]);

  // Toggle mode with automatic reconnect
  const toggleMode = useCallback(async () => {
    const newMode = mode === 'passive' ? 'active' : 'passive';
    const wasConnected = connected;  // Capture before state change
    
    setMode(newMode);
    
    // If was connected, reconnect with new mode config
    if (wasConnected) {
      const finalConfig = buildConfigForMode(config, newMode);
      client.disconnect();
      try {
        await client.connect(model, finalConfig);
      } catch (e) {
        console.error("Failed to reconnect after mode switch:", e);
        setMode(mode);  // Revert mode on failure
      }
    }
  }, [mode, connected, config, model, client, buildConfigForMode]);

  return {
    client,
    config,
    setConfig,
    model,
    setModel,
    connected,
    connect,
    disconnect,
    volume,
    mode,
    toggleMode,
  };
}