import React, { useState } from 'react';

export interface DayBar {
  date: string;
  status: 'up' | 'degraded' | 'down' | 'empty';
  uptimePct: number;
}

interface UptimeBarProps {
  bars?: DayBar[];
  uptimePct?: number;
  className?: string;
}

export const UptimeBar90Days: React.FC<UptimeBarProps> = ({ bars, uptimePct = 99.9, className = '' }) => {
  const [hoveredDay, setHoveredDay] = useState<DayBar | null>(null);

  // Generate 90 fallback bars if not provided
  const displayBars: DayBar[] =
    bars && bars.length === 90
      ? bars
      : Array.from({ length: 90 }, (_, idx) => {
          const i = 89 - idx;
          const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
          const isDown = uptimePct < 99.5 && (i === 12 || i === 44);
          const isDegraded = uptimePct < 99.8 && (i === 8 || i === 29 || i === 67);
          return {
            date: d.toISOString().split('T')[0],
            status: isDown ? 'down' : isDegraded ? 'degraded' : 'up',
            uptimePct: isDown ? 89.2 : isDegraded ? 97.4 : 100,
          };
        });

  return (
    <div className={`uptime-bar-container ${className}`}>
      <div className="uptime-ticks" role="img" aria-label="90-day daily uptime status history">
        {displayBars.map((bar, idx) => {
          let tickClass = 'uptime-tick';
          if (bar.status === 'degraded') tickClass += ' tick-degraded';
          else if (bar.status === 'down') tickClass += ' tick-down';
          else if (bar.status === 'empty') tickClass += ' tick-empty';

          return (
            <div
              key={idx}
              className={tickClass}
              onMouseEnter={() => setHoveredDay(bar)}
              onMouseLeave={() => setHoveredDay(null)}
              title={`${bar.date}: ${bar.status.toUpperCase()} (${bar.uptimePct.toFixed(1)}% uptime)`}
            />
          );
        })}
      </div>
      <div className="uptime-legend">
        <span>90 days ago</span>
        <span className="font-mono">
          {hoveredDay ? (
            <span style={{ color: 'var(--color-ink)' }}>
              {hoveredDay.date} — {hoveredDay.status.toUpperCase()} ({hoveredDay.uptimePct.toFixed(1)}%)
            </span>
          ) : (
            `${uptimePct.toFixed(2)}% uptime`
          )}
        </span>
        <span>Today</span>
      </div>
    </div>
  );
};
