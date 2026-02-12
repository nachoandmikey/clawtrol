'use client';

import { useState, useEffect, useCallback } from 'react';

export default function LivePreviewWidget() {
  const [screen, setScreen] = useState('');

  const fetchScreen = useCallback(async () => {
    try {
      const res = await fetch('/api/screen');
      const data = await res.json();
      if (data.image) setScreen(data.image);
    } catch {}
  }, []);

  useEffect(() => {
    fetchScreen();
    const interval = setInterval(fetchScreen, 30000);
    return () => clearInterval(interval);
  }, [fetchScreen]);

  if (!screen) {
    return (
      <div className="aspect-video rounded overflow-hidden animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <div className="flex items-center justify-center h-full text-[10px]" style={{ color: 'var(--text-dim)' }}>Loading screen...</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="aspect-video rounded overflow-hidden border" style={{ borderColor: 'var(--border-dim)' }}>
        <img
          src={`data:image/png;base64,${screen}`}
          alt="Screen preview"
          className="w-full h-full object-contain"
          style={{ background: '#000' }}
        />
      </div>
      <div className="text-[9px] text-center" style={{ color: 'var(--text-dim)' }}>
        Auto-refreshes every 30s
      </div>
    </div>
  );
}
