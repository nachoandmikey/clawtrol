'use client';

import { useState, useEffect, useCallback, Suspense, lazy, ComponentType } from 'react';
import { MODULE_META } from '@/lib/config';
import type { WidgetConfig } from '@/lib/config';
import { widgetRegistry } from '@/lib/widgets';
import type { WidgetManifest } from '@/lib/widgets';
import config from '../../../../clawtrol.config';

// Size to column-span mapping
const SIZE_CLASSES: Record<string, string> = {
  sm: 'col-span-1',
  md: 'col-span-1 md:col-span-2',
  lg: 'col-span-1 md:col-span-2 lg:col-span-4',
};

// Widget titles from module + widget ID
function widgetTitle(module: string, widgetId: string): string {
  const meta = MODULE_META[module as keyof typeof MODULE_META];
  const entry = widgetRegistry.get(module, widgetId);
  if (entry) {
    // Capitalize widget description as fallback title
    const words = widgetId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1));
    return words.join(' ');
  }
  return meta?.label || module;
}

function WidgetSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-4 w-24 rounded" style={{ background: 'rgba(255,255,255,0.08)' }} />
      <div className="h-20 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
      <div className="h-4 w-32 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
    </div>
  );
}

function WidgetCard({
  cfg,
  manifest,
  onNavigate,
}: {
  cfg: WidgetConfig;
  manifest: WidgetManifest;
  onNavigate: (module: string) => void;
}) {
  const [Component, setComponent] = useState<ComponentType | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    manifest.component()
      .then(mod => { if (!cancelled) setComponent(() => mod.default); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [manifest]);

  const title = widgetTitle(cfg.module, cfg.widget);
  const meta = MODULE_META[cfg.module as keyof typeof MODULE_META];

  return (
    <div
      className={`${SIZE_CLASSES[cfg.size] || SIZE_CLASSES.sm} rounded-xl border p-4 flex flex-col transition-all`}
      style={{ background: 'var(--bg-card, rgba(12,12,20,0.8))', borderColor: 'var(--border-dim)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {meta && <span className="text-xs">{meta.icon}</span>}
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: 'var(--text-secondary)' }}>
            {title}
          </span>
        </div>
        <button
          onClick={() => onNavigate(cfg.module)}
          className="text-[9px] tracking-wider transition-colors hover:opacity-80"
          style={{ color: 'var(--accent-cyan)' }}
        >
          Open →
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {error ? (
          <div className="text-[10px] py-4 text-center" style={{ color: 'var(--accent-red)' }}>
            Failed to load widget
          </div>
        ) : Component ? (
          <Component />
        ) : (
          <WidgetSkeleton />
        )}
      </div>
    </div>
  );
}

export default function OverviewModule() {
  const widgetConfigs = config.widgets || [];
  const resolved = widgetRegistry.resolve(widgetConfigs);

  const navigateToTab = useCallback((module: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', module);
    window.history.pushState({}, '', url.toString());
    window.dispatchEvent(new PopStateEvent('popstate'));
    // Force re-render of Shell by dispatching a custom event
    window.dispatchEvent(new CustomEvent('clawtrol:navigate', { detail: { tab: module } }));
  }, []);

  if (resolved.length === 0) {
    return (
      <div className="text-center py-16" style={{ color: 'var(--text-dim)' }}>
        <div className="text-2xl mb-3">◈</div>
        <div className="text-sm mb-1">No widgets configured</div>
        <div className="text-[10px]">Add widgets to your clawtrol.config.ts</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 animate-fade-in">
      {resolved.map((w, i) => (
        <WidgetCard
          key={`${w.module}-${w.widget}-${i}`}
          cfg={w}
          manifest={w.manifest}
          onNavigate={navigateToTab}
        />
      ))}
    </div>
  );
}
