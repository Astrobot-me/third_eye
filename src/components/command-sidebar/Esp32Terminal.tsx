import { useRef, useEffect } from 'react';
import { useEsp32Context } from '../../contexts/Esp32Context';
import './Esp32Terminal.scss';

export default function Esp32Terminal() {
  const { isConnected, logs } = useEsp32Context();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="esp32-terminal">
      <div className="esp32-terminal__header">
        <span className={`esp32-terminal__status-dot ${isConnected ? 'esp32-terminal__status-dot--connected' : ''}`} />
        <span className="esp32-terminal__title">ESP32</span>
        <span className="esp32-terminal__status">
          {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
        </span>
      </div>
      
      <div className="esp32-terminal__logs" ref={scrollRef}>
        {logs.length === 0 ? (
          <div className="esp32-terminal__empty">Waiting for data...</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className={`esp32-terminal__log esp32-terminal__log--${log.direction}`}>
              <span className="esp32-terminal__arrow">
                {log.direction === 'in' ? '←' : '→'}
              </span>
              <span className="esp32-terminal__message">{log.message}</span>
              <span className="esp32-terminal__time">{formatTime(log.timestamp)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}