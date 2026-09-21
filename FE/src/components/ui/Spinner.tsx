import React from 'react';

export function Spinner({ size = 'md', color = '#2563EB' }: { size?: 'sm' | 'md' | 'lg'; color?: string }) {
  const s = size === 'sm' ? 'w-4 h-4 border-2' : size === 'lg' ? 'w-10 h-10 border-4' : 'w-6 h-6 border-[3px]';
  return <div className={`${s} rounded-full border-t-transparent spinner flex-shrink-0`} style={{ borderColor: `${color}30`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />;
}
