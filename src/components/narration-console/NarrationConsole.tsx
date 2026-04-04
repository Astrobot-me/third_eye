import { useEffect, useRef, useState, useMemo } from "react";
import cn from "classnames";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { useLoggerStore } from "../../lib/store-logger";
import { StreamingLog } from "../../types";
import "./narration-console.scss";

export type NarrationMessageType = "SYSTEM" | "AI_NARRATOR" | "URGENT" | "ANALYZING";

export interface NarrationMessage {
  id: string;
  timestamp: Date;
  type: NarrationMessageType;
  role: string;
  text: string;
}

function formatElapsedTime(startTime: Date, messageTime: Date): string {
  const elapsedMs = messageTime.getTime() - startTime.getTime();
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `T+${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function classifyMessage(log: StreamingLog): NarrationMessageType {
  const message = log.message;

  if (typeof message === "string") {
    const lowerMsg = message.toLowerCase();
    if (lowerMsg.includes("urgent") || lowerMsg.includes("warning") || lowerMsg.includes("danger")) {
      return "URGENT";
    }
    if (lowerMsg.includes("analyzing") || lowerMsg.includes("processing")) {
      return "ANALYZING";
    }
    return "SYSTEM";
  }

  if (typeof message === "object") {
    if ("serverContent" in message) {
      const serverContent = message.serverContent;
      if (serverContent && "modelTurn" in serverContent) {
        return "AI_NARRATOR";
      }
    }
    if ("turns" in message) {
      return "SYSTEM";
    }
  }

  return "SYSTEM";
}

function extractMessageText(log: StreamingLog): string {
  const message = log.message;

  if (typeof message === "string") {
    return message;
  }

  if (typeof message === "object") {
    if ("serverContent" in message) {
      const serverContent = message.serverContent;
      if (serverContent && "modelTurn" in serverContent) {
        const modelTurn = serverContent.modelTurn;
        if (modelTurn && "parts" in modelTurn) {
          const parts = modelTurn.parts || [];
          return parts
            .filter((part: { text?: string }) => part.text && part.text !== "\n")
            .map((part: { text?: string }) => part.text)
            .join(" ");
        }
      }
    }
    if ("turns" in message) {
      const turns = (message as { turns: { text?: string }[] }).turns || [];
      return turns
        .filter((part) => part.text && part.text !== "\n")
        .map((part) => part.text)
        .join(" ");
    }
  }

  return JSON.stringify(message);
}

function getRoleLabel(type: NarrationMessageType, log: StreamingLog): string {
  switch (type) {
    case "URGENT":
      return "⚠ ALERT";
    case "AI_NARRATOR":
      return "AI NARRATOR";
    case "ANALYZING":
      return "◉ ANALYZING";
    case "SYSTEM":
    default:
      if (typeof log.message === "object" && "turns" in log.message) {
        return "USER";
      }
      return "SYSTEM";
  }
}

function transformLogsToMessages(logs: StreamingLog[], sessionStart: Date): NarrationMessage[] {
  return logs
    .filter((log) => {
      if (typeof log.message === "string") {
        return log.message.length > 0;
      }
      if (typeof log.message === "object") {
        if ("serverContent" in log.message) {
          const serverContent = log.message.serverContent;
          if (serverContent?.interrupted || serverContent?.turnComplete) {
            return false;
          }
          return true;
        }
        if ("turns" in log.message) {
          return true;
        }
      }
      return false;
    })
    .map((log, index) => {
      const type = classifyMessage(log);
      return {
        id: `msg-${index}-${log.date.getTime()}`,
        timestamp: log.date,
        type,
        role: getRoleLabel(type, log),
        text: extractMessageText(log),
      };
    })
    .filter((msg) => msg.text.length > 0);
}

export default function NarrationConsole() {
  const { connected, client } = useLiveAPIContext();
  const { log, logs } = useLoggerStore();
  const [inputText, setInputText] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);
  const lastScrollHeightRef = useRef<number>(-1);
  const sessionStartRef = useRef<Date>(new Date());

  const messages = useMemo(
    () => transformLogsToMessages(logs, sessionStartRef.current),
    [logs]
  );

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesRef.current) {
      const el = messagesRef.current;
      const scrollHeight = el.scrollHeight;
      if (scrollHeight !== lastScrollHeightRef.current) {
        el.scrollTop = scrollHeight;
        lastScrollHeightRef.current = scrollHeight;
      }
    }
  }, [messages]);

  // Listen for log events
  useEffect(() => {
    client.on("log", log);
    return () => {
      client.off("log", log);
    };
  }, [client, log]);

  // Reset session start when connecting
  useEffect(() => {
    if (connected) {
      sessionStartRef.current = new Date();
    }
  }, [connected]);

  const handleSubmit = () => {
    if (!inputText.trim() || !connected) return;
    client.send([{ text: inputText }]);
    setInputText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="narration-console">
      <header className="narration-console__header">
        <h2 className="narration-console__title">NARRATION CONSOLE</h2>
        <div className={cn("narration-console__status", { connected })}>
          <span className="narration-console__status-dot" />
          <span className="narration-console__status-text">
            {connected ? "LIVE" : "OFFLINE"}
          </span>
        </div>
      </header>

      <div className="narration-console__messages" ref={messagesRef}>
        {messages.length === 0 ? (
          <div className="narration-console__empty">
            <span className="narration-console__empty-icon">◎</span>
            <p>Awaiting narration stream...</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn("narration-console__message", {
                "narration-console__message--system": msg.type === "SYSTEM",
                "narration-console__message--narrator": msg.type === "AI_NARRATOR",
                "narration-console__message--urgent": msg.type === "URGENT",
                "narration-console__message--analyzing": msg.type === "ANALYZING",
              })}
            >
              <div className="narration-console__message-header">
                <span className="narration-console__timestamp">
                  {formatElapsedTime(sessionStartRef.current, msg.timestamp)}
                </span>
                <span className="narration-console__role">{msg.role}</span>
              </div>
              <p className="narration-console__text">{msg.text}</p>
              {msg.type === "ANALYZING" && (
                <div className="narration-console__pulse-indicator">
                  <span className="narration-console__pulse-dot" />
                  <span className="narration-console__pulse-dot" />
                  <span className="narration-console__pulse-dot" />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className={cn("narration-console__input-container", { disabled: !connected })}>
        <div className="narration-console__input-wrapper">
          <input
            type="text"
            className="narration-console__input"
            placeholder="Manual voice override..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!connected}
          />
          <button
            className="narration-console__send-button"
            onClick={handleSubmit}
            disabled={!connected || !inputText.trim()}
            aria-label="Send message"
          >
            <span className="material-symbols-outlined filled">send</span>
          </button>
        </div>
      </div>
    </div>
  );
}
