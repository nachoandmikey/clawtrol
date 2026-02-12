'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card } from '@/components/shared/StatCard';
import { InteractiveScreen } from '@/components/shared/InteractiveScreen';
import type { ScreenInfo } from '@/lib/types';

export default function ScreenModule() {
  const [screen, setScreen] = useState('');
  const [screenDims, setScreenDims] = useState<ScreenInfo | null>(null);

  const fetchScreen = useCallback(async () => {
    try {
      const res = await fetch('/api/screen');
      const data = await res.json();
      if (data.image) setScreen(data.image);
      if (data.screenDims) setScreenDims(data.screenDims);
    } catch {}
  }, []);

  useEffect(() => {
    fetchScreen();
    const interval = setInterval(fetchScreen, 30000);
    return () => clearInterval(interval);
  }, [fetchScreen]);

  return (
    <Card title="REMOTE SCREEN" tag="INTERACTIVE">
      <InteractiveScreen screen={screen} onRefresh={fetchScreen} externalScreenInfo={screenDims} />
    </Card>
  );
}
