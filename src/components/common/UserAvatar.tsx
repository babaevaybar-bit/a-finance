import React from 'react';

export const ROLE_LABELS: Record<string, string> = {
  director: 'Главный админ', director_view: 'Директор', rop: 'РОП', technolog: 'Технолог', manager: 'Менеджер', lidorub: 'Лидоруб',
};

export function UserAvatar({ name, url, size = 28 }: { name: string; url?: string | null; size?: number }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  return url ? (
    <img src={url} alt="" className="rounded-full object-cover shrink-0 ring-2 ring-background" style={{ width: size, height: size }} />
  ) : (
    <span className="rounded-full shrink-0 flex items-center justify-center font-semibold text-white ring-2 ring-background"
      style={{ width: size, height: size, fontSize: size * 0.38, background: 'linear-gradient(135deg,#2f6b57,#8a6a45)' }}>
      {initials}
    </span>
  );
}

