import type { ComponentType } from 'react';
import type { WidgetConfig } from './config';

export type WidgetSize = 'sm' | 'md' | 'lg';

export interface WidgetManifest {
  component: () => Promise<{ default: ComponentType }>;
  sizes: WidgetSize[];
  defaultSize: WidgetSize;
  refreshInterval?: number;
  description: string;
}

export interface WidgetRegistryEntry {
  module: string;
  widgetId: string;
  manifest: WidgetManifest;
}

class WidgetRegistryImpl {
  private widgets = new Map<string, WidgetRegistryEntry>();

  register(module: string, widgetId: string, manifest: WidgetManifest) {
    const key = `${module}:${widgetId}`;
    this.widgets.set(key, { module, widgetId, manifest });
  }

  get(module: string, widgetId: string): WidgetRegistryEntry | undefined {
    return this.widgets.get(`${module}:${widgetId}`);
  }

  getAll(): WidgetRegistryEntry[] {
    return Array.from(this.widgets.values());
  }

  getForModule(module: string): WidgetRegistryEntry[] {
    return this.getAll().filter(e => e.module === module);
  }

  resolve(configs: WidgetConfig[]): Array<WidgetConfig & { manifest: WidgetManifest }> {
    return configs
      .map(cfg => {
        const entry = this.get(cfg.module, cfg.widget);
        if (!entry) return null;
        return { ...cfg, manifest: entry.manifest };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
  }
}

export const widgetRegistry = new WidgetRegistryImpl();
