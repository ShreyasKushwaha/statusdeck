import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

export interface LatencyDataPoint {
  timestamp: string;
  latencyMs: number;
  statusCode: number;
}

interface LatencyChartProps {
  data: LatencyDataPoint[];
}

export const LatencyChart: React.FC<LatencyChartProps> = ({ data }) => {
  const formattedData = data.map((d) => ({
    ...d,
    timeLabel: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }));

  if (data.length === 0) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-ink-muted)' }}>
        No latency data recorded yet for the selected period.
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={formattedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#D9D4C7" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="timeLabel"
            tick={{ fill: '#827E74', fontSize: 11, fontFamily: 'JetBrains Mono' }}
            tickLine={{ stroke: '#D9D4C7' }}
            axisLine={{ stroke: '#D9D4C7' }}
          />
          <YAxis
            tick={{ fill: '#827E74', fontSize: 11, fontFamily: 'JetBrains Mono' }}
            tickLine={{ stroke: '#D9D4C7' }}
            axisLine={{ stroke: '#D9D4C7' }}
            unit="ms"
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload as LatencyDataPoint & { timeLabel: string };
                return (
                  <div
                    style={{
                      backgroundColor: '#FBF9F4',
                      border: '1px solid #D9D4C7',
                      borderRadius: 2,
                      padding: '8px 12px',
                      fontSize: 12,
                      fontFamily: 'JetBrains Mono',
                      boxShadow: 'none',
                    }}
                  >
                    <div style={{ color: '#59564E', marginBottom: 4 }}>{item.timestamp}</div>
                    <div style={{ fontWeight: 600, color: '#16150F' }}>
                      Latency: {item.latencyMs} ms
                    </div>
                    <div style={{ color: item.statusCode === 200 ? '#2F7D4F' : '#B42318' }}>
                      HTTP {item.statusCode}
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Line
            type="monotone"
            dataKey="latencyMs"
            stroke="#D9480F"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 4, fill: '#D9480F', stroke: '#FBF9F4', strokeWidth: 1 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
