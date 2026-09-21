import React from 'react';

export function Avatar({ name, src, size = 'md', color }: { name: string; src?: string; size?: 'sm' | 'md' | 'lg' | 'xl'; color?: string }) {
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const sizes = { sm: 'w-7 h-7 text-[11px]', md: 'w-9 h-9 text-[13px]', lg: 'w-11 h-11 text-[15px]', xl: 'w-14 h-14 text-[18px]' };
  const colors = ['#2563EB', '#7C3AED', '#059669', '#D97706', '#DC2626', '#0891B2'];
  const bg = color || colors[name.charCodeAt(0) % colors.length];
  if (src) return <img src={src} alt={name} className={`${sizes[size]} rounded-full object-cover`} />;
  return <div className={`${sizes[size]} rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0`} style={{ background: bg }}>{initials}</div>;
}
