# Clawtrol Plugin System

Plugins extend Clawtrol with new modules, widgets, and API routes.

## Installing Plugins

```bash
# Install a plugin
clawtrol add <plugin-name>

# Remove a plugin
clawtrol remove <plugin-name>

# List installed plugins
clawtrol plugins
```

Plugins are npm packages following the naming convention `clawtrol-plugin-<name>`.

## Creating a Plugin

### Package Structure

```
clawtrol-plugin-example/
├── package.json
├── index.ts          # Main entry point
├── ExampleModule.tsx  # Full module component
└── widgets/
    └── ExampleWidget.tsx
```

### package.json

```json
{
  "name": "clawtrol-plugin-example",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "keywords": ["clawtrol", "clawtrol-plugin"],
  "peerDependencies": {
    "react": ">=18",
    "next": ">=14"
  }
}
```

### Plugin Entry Point (index.ts)

Your plugin's default export must conform to the `PluginManifest` interface:

```typescript
import type { ComponentType } from 'react';

export interface PluginManifest {
  /** Unique module ID (used in URLs and config) */
  moduleId: string;

  /** Display name shown in the tab bar */
  moduleName: string;

  /** Emoji icon for the tab */
  icon: string;

  /** The full-page module component */
  component: ComponentType;

  /** Optional widget manifests */
  widgets?: Record<string, WidgetManifest>;

  /** Optional API route handlers */
  apiRoutes?: Record<string, (req: Request) => Promise<Response>>;
}
```

### Example Plugin

```typescript
// index.ts
import ExampleModule from './ExampleModule';

const plugin = {
  moduleId: 'example',
  moduleName: 'Example',
  icon: '🔌',
  component: ExampleModule,

  widgets: {
    'status': {
      component: () => import('./widgets/StatusWidget'),
      sizes: ['sm', 'md'],
      defaultSize: 'sm',
      refreshInterval: 10000,
      description: 'Example status widget',
    },
  },

  apiRoutes: {
    '/data': async (req) => {
      return new Response(JSON.stringify({ hello: 'world' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    },
  },
};

export default plugin;
```

### Module Component

```tsx
// ExampleModule.tsx
'use client';

import { useState, useEffect } from 'react';

export default function ExampleModule() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch('/api/plugins/example/data')
      .then(r => r.json())
      .then(setData);
  }, []);

  return (
    <div className="space-y-3">
      <h2>Example Plugin</h2>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
```

### Widget Component

```tsx
// widgets/StatusWidget.tsx
'use client';

export default function StatusWidget() {
  return (
    <div className="text-center py-4">
      <div className="text-2xl mb-2">🔌</div>
      <div className="text-sm">Plugin Active</div>
    </div>
  );
}
```

## API Routes

Plugins get API routes mounted at `/api/plugins/<moduleId>/...`.

Define route handlers in the `apiRoutes` object:

```typescript
apiRoutes: {
  '/data': async (req) => {
    // Handles GET/POST/PUT/DELETE to /api/plugins/<moduleId>/data
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
  '*': async (req) => {
    // Catch-all handler for any unmatched path
    return new Response('Not found', { status: 404 });
  },
}
```

## Widget Manifests

Widgets are small, self-contained components displayed on the dashboard grid.

```typescript
interface WidgetManifest {
  /** Lazy-loaded component */
  component: () => Promise<{ default: ComponentType }>;

  /** Supported sizes: 'sm' (1 col), 'md' (2 col), 'lg' (4 col / full width) */
  sizes: ('sm' | 'md' | 'lg')[];

  /** Default size when added to dashboard */
  defaultSize: 'sm' | 'md' | 'lg';

  /** Auto-refresh interval in milliseconds (optional) */
  refreshInterval?: number;

  /** Short description */
  description: string;
}
```

## Publishing

1. Name your package `clawtrol-plugin-<name>`
2. Add the `clawtrol-plugin` keyword to package.json
3. Export the plugin manifest as the default export
4. Publish to npm: `npm publish`

Users can then install it with:

```bash
clawtrol add <name>
```

## Available Hooks & APIs

### Navigation

Dispatch a navigation event from within your plugin:

```typescript
window.dispatchEvent(new CustomEvent('clawtrol:navigate', {
  detail: { tab: 'your-module-id' }
}));
```

### API Routes

Your plugin's API routes receive the standard `Request` object and should return a `Response`. They're mounted under `/api/plugins/<moduleId>/`.

### Shared Components

Plugins can import shared UI components from Clawtrol:

```typescript
import { Card, MetricBlock, ProgressBar } from 'clawtrol/components/shared/StatCard';
import { formatBytes, timeAgo } from 'clawtrol/lib/types';
```
