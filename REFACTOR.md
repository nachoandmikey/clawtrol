# Clawtrol Refactoring Guide

## Goal
Split the 5600-line `src/app/page.tsx` monolith into modular, independently-loadable tab components.

## Source
Original monolith: `os.homedir()/clawtrol/src/app/page.tsx`

## Target Architecture

```
src/
├── app/
│   ├── page.tsx              # THIN shell — just imports Shell + modules
│   ├── layout.tsx            # Keep as-is
│   └── api/                  # Keep all API routes as-is
├── components/
│   ├── Shell.tsx             # Dashboard shell: sidebar nav + tab content area
│   ├── modules/
│   │   ├── OverviewModule.tsx
│   │   ├── ScreenModule.tsx
│   │   ├── TerminalModule.tsx
│   │   ├── FilesModule.tsx
│   │   ├── SessionsModule.tsx
│   │   ├── TasksModule.tsx
│   │   ├── MemoryModule.tsx
│   │   ├── CronModule.tsx
│   │   ├── LogsModule.tsx
│   │   ├── NetworkModule.tsx
│   │   ├── SubagentsModule.tsx
│   │   └── index.ts          # Registry: maps ModuleId → lazy component
│   ├── shared/
│   │   ├── Sparkline.tsx     # Extracted from lines ~196-236
│   │   ├── StatCard.tsx      # Extracted from lines ~238-305
│   │   ├── ActivityFeed.tsx  # Extracted from lines ~306-367
│   │   ├── MarkdownRenderer.tsx  # Extracted from lines ~109-195
│   │   └── WebTerminal.tsx   # Extracted from lines ~368-576
│   └── ui/                   # Keep existing (button.tsx, dialog.tsx)
├── lib/
│   ├── config.ts             # Already created — module registry
│   ├── utils.ts              # Keep + add any extracted helpers
│   └── types.ts              # All TypeScript interfaces from the monolith
```

## Step-by-step Instructions

### 1. Extract Types (lines 13-61 of page.tsx)
Move ALL interfaces to `src/lib/types.ts`:
- SystemInfo, GatewayStatus, TailscaleStatus, PM2Process, Weather, ScreenInfo, ProcessInfo, TerminalEntry
- Plus any other interfaces used by specific modules

### 2. Extract Shared Components
From the monolith, extract these clearly-delimited sections:
- **MarkdownRenderer** (lines ~109-195) → `components/shared/MarkdownRenderer.tsx`
- **Sparkline** (lines ~196-236) → `components/shared/Sparkline.tsx`  
- **StatCard + related** (lines ~238-305) → `components/shared/StatCard.tsx`
- **ActivityFeed** (lines ~306-367) → `components/shared/ActivityFeed.tsx`
- **WebTerminal** (lines ~368-576) → `components/shared/WebTerminal.tsx`
- **InteractiveScreen** (lines ~577-866) → `components/shared/InteractiveScreen.tsx`

### 3. Extract Each Module
The main dashboard function (line ~867 onwards) contains the tab rendering logic. Each tab's JSX block + its associated state/effects should become its own module component.

Each module should:
- Be a `'use client'` component
- Accept minimal props (just what it needs)
- Manage its own state and data fetching
- Import from `@/lib/types` and `@/components/shared/*`

### 4. Create Module Registry
`src/components/modules/index.ts`:
```typescript
import dynamic from 'next/dynamic';
import type { ModuleId } from '@/lib/config';

export const moduleComponents: Record<ModuleId, React.ComponentType> = {
  overview: dynamic(() => import('./OverviewModule')),
  screen: dynamic(() => import('./ScreenModule')),
  // ... etc
};
```

### 5. Create Shell Component
`src/components/Shell.tsx` — the dashboard frame:
- Reads config to know which modules are enabled
- Renders sidebar/tab navigation
- Lazy-loads the active module component
- Handles URL-based tab routing (searchParams)

### 6. Slim Down page.tsx
New `page.tsx` should be ~20 lines:
```typescript
import { Shell } from '@/components/Shell';

export default function Home() {
  return <Shell />;
}
```

## IMPORTANT: What to Strip

### Remove entirely:
- `expenses` tab (all JSX, state, API calls related to expenses)
- `health` tab (all JSX, state, API calls related to health/bloodwork)
- `/api/expenses/` routes — DELETE these files
- `/api/health-data/` routes — DELETE these files
- Any hardcoded personal data (addresses, tokens, medical info)

### Make configurable:
- Dashboard title → read from config
- Weather location → read from config or auto-detect
- File paths → use `~/.openclaw/` as default, configurable
- Task storage path → configurable

### Keep but generalize:
- All other API routes — they're already pretty generic
- The `subclawds` module → rename to `subagents` in the UI

## Testing
After refactoring, `pnpm dev` should work and all enabled modules should render correctly.
The app should gracefully handle disabled modules (just don't show their tab).

## Config Integration
Import config from `@/clawtrol.config.ts` (or `clawtrol.config.js`).
If no config file exists, use defaults from `src/lib/config.ts`.
