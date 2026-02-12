'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { MODULE_COMPONENTS } from '@/components/modules';
import { MODULE_META } from '@/lib/config';
import type { ModuleId } from '@/lib/config';
import config from '../../clawtrol.config';

const enabledModules = config.modules ?? Object.keys(MODULE_META) as ModuleId[];

export default function Shell() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const tabFromUrl = searchParams.get('tab') as ModuleId | null;
  const initialTab: ModuleId = tabFromUrl && enabledModules.includes(tabFromUrl) ? tabFromUrl : enabledModules[0];

  const [activeTab, setActiveTabState] = useState<ModuleId>(initialTab);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const setActiveTab = useCallback((tab: ModuleId) => {
    setActiveTabState(tab);
    router.push(`?tab=${tab}`, { scroll: false });
  }, [router]);

  // Listen for widget "Open →" navigation events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.tab && enabledModules.includes(detail.tab)) {
        setActiveTab(detail.tab);
      }
    };
    window.addEventListener('clawtrol:navigate', handler);
    return () => window.removeEventListener('clawtrol:navigate', handler);
  }, [setActiveTab]);

  const tabs = enabledModules.map(id => ({
    id,
    label: MODULE_META[id].label.toUpperCase(),
    icon: MODULE_META[id].icon,
  }));

  const ActiveModule = MODULE_COMPONENTS[activeTab];

  return (
    <div className="min-h-screen relative" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-dim)' }}>
        <div className="max-w-[1400px] mx-auto px-4 py-2 flex justify-between items-center gap-2">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              onClick={() => setDrawerOpen(true)}
              className="md:hidden w-8 h-8 rounded border transition-colors flex items-center justify-center shrink-0"
              style={{ borderColor: 'var(--border-accent)', color: 'var(--accent-cyan)', background: 'rgba(0,255,200,0.05)' }}
            >
              <span className="text-sm">☰</span>
            </button>

            <div className="w-8 h-8 rounded flex items-center justify-center text-lg" style={{ background: 'rgba(0,255,200,0.1)', border: '1px solid rgba(0,255,200,0.2)' }}>
              👾
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-[0.2em] uppercase" style={{ fontFamily: 'var(--font-orbitron)', color: 'var(--accent-cyan)' }}>
                {config.title ?? 'Clawtrol'}
              </h1>
              <p className="text-[10px] tracking-wider" style={{ color: 'var(--text-dim)' }}>
                CONTROL CENTER
              </p>
            </div>
          </div>

          {/* Mobile: show current tab name */}
          <div className="md:hidden flex items-center gap-2">
            <span className="text-[10px]">{tabs.find(t => t.id === activeTab)?.icon}</span>
            <span className="text-[10px] tracking-[0.15em] font-medium" style={{ color: 'var(--accent-cyan)' }}>
              {tabs.find(t => t.id === activeTab)?.label}
            </span>
          </div>
        </div>

        {/* Desktop tabs */}
        <div className="hidden md:flex max-w-[1400px] mx-auto px-4 gap-0 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-[10px] tracking-[0.15em] font-medium transition-all whitespace-nowrap border-b-2 ${
                activeTab === tab.id ? 'tab-active' : ''
              }`}
              style={activeTab === tab.id ? {} : { color: 'var(--text-dim)', borderColor: 'transparent' }}
            >
              <span className="mr-1.5">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Mobile drawer overlay */}
      <div
        className={`md:hidden fixed inset-0 z-[60] transition-opacity duration-300 ${
          drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={() => setDrawerOpen(false)}
      />

      {/* Mobile slide-out drawer */}
      <nav
        className={`md:hidden fixed top-0 left-0 bottom-0 z-[70] w-64 border-r flex flex-col transition-transform duration-300 ease-in-out ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-dim)' }}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-dim)' }}>
          <div className="flex items-center gap-2">
            <span className="text-lg">👾</span>
            <span className="text-xs font-bold tracking-[0.2em] uppercase" style={{ fontFamily: 'var(--font-orbitron)', color: 'var(--accent-cyan)' }}>
              {config.title ?? 'Clawtrol'}
            </span>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="w-7 h-7 rounded flex items-center justify-center transition-colors"
            style={{ color: 'var(--text-dim)', background: 'rgba(255,255,255,0.05)' }}
          >
            <span className="text-sm">✕</span>
          </button>
        </div>

        {/* Drawer module list */}
        <div className="flex-1 overflow-auto py-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setDrawerOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
              style={activeTab === tab.id
                ? { background: 'rgba(0,255,200,0.1)', color: 'var(--accent-cyan)' }
                : { color: 'var(--text-dim)' }
              }
            >
              <span className="text-sm w-6 text-center">{tab.icon}</span>
              <span className="text-[11px] tracking-[0.1em] font-medium">{tab.label}</span>
              {activeTab === tab.id && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-cyan)' }} />
              )}
            </button>
          ))}
        </div>

        {/* Drawer footer */}
        <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--border-dim)' }}>
          <div className="text-[8px] tracking-[0.3em] uppercase" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-orbitron)' }}>
            {config.title ?? 'Clawtrol'} · v0.1.0
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-[1400px] mx-auto p-4 pt-20 md:pt-24 space-y-3 relative z-10 overflow-x-hidden">
        <ActiveModule />
      </main>

      {/* Footer */}
      <footer className="text-center py-3" style={{ color: 'var(--text-dim)' }}>
        <div className="text-[9px] tracking-[0.3em] uppercase" style={{ fontFamily: 'var(--font-orbitron)' }}>
          {config.title ?? 'Clawtrol'} · CONTROL CENTER
        </div>
      </footer>
    </div>
  );
}
