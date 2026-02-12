import type { ComponentType } from 'react';
import type { WidgetManifest } from './widgets';
import { widgetRegistry } from './widgets';

export interface PluginManifest {
  moduleId: string;
  moduleName: string;
  icon: string;
  component: ComponentType;
  widgets?: Record<string, WidgetManifest>;
  apiRoutes?: Record<string, (req: Request) => Promise<Response>>;
}

export interface LoadedPlugin {
  name: string;
  manifest: PluginManifest;
}

const loadedPlugins = new Map<string, LoadedPlugin>();

export async function loadPlugin(name: string): Promise<LoadedPlugin | null> {
  if (loadedPlugins.has(name)) return loadedPlugins.get(name)!;

  const packageName = name.startsWith('clawtrol-plugin-') ? name : `clawtrol-plugin-${name}`;

  try {
    // Dynamic import of the plugin package
    const mod = await import(/* webpackIgnore: true */ packageName);
    const manifest: PluginManifest = mod.default || mod;

    // Register plugin widgets
    if (manifest.widgets) {
      for (const [widgetId, widgetManifest] of Object.entries(manifest.widgets)) {
        widgetRegistry.register(manifest.moduleId, widgetId, widgetManifest);
      }
    }

    const loaded: LoadedPlugin = { name, manifest };
    loadedPlugins.set(name, loaded);
    return loaded;
  } catch {
    console.warn(`[clawtrol] Failed to load plugin: ${packageName}`);
    return null;
  }
}

export async function loadPlugins(names: string[]): Promise<LoadedPlugin[]> {
  const results = await Promise.all(names.map(loadPlugin));
  return results.filter((p): p is LoadedPlugin => p !== null);
}

export function getLoadedPlugins(): LoadedPlugin[] {
  return Array.from(loadedPlugins.values());
}

export function getPluginApiHandler(
  pluginName: string,
  path: string
): ((req: Request) => Promise<Response>) | null {
  const plugin = loadedPlugins.get(pluginName);
  if (!plugin?.manifest.apiRoutes) return null;

  // Try exact match first, then prefix match
  const handler = plugin.manifest.apiRoutes[path] || plugin.manifest.apiRoutes['*'];
  return handler || null;
}
