import React from 'react';

export type StatusLevel = 'up' | 'degraded' | 'down' | 'operational' | 'outage';

interface StatusPipProps {
  status: StatusLevel | string;
  isLive?: boolean;
  className?: string;
}

export const StatusPip: React.FC<StatusPipProps> = ({ status, isLive = false, className = '' }) => {
  const norm = status.toLowerCase();

  let pipClass = 'pip-up';
  let label = 'Operational';

  if (norm === 'up' || norm === 'operational') {
    pipClass = 'pip-up';
    label = 'Up';
  } else if (norm === 'degraded') {
    pipClass = 'pip-degraded';
    label = 'Degraded';
  } else if (norm === 'down' || norm === 'outage') {
    pipClass = 'pip-down';
    label = 'Down';
  }

  return (
    <span className={`status-indicator ${className}`}>
      <span className={`pip ${pipClass} ${isLive ? 'pip-live' : ''}`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
};
