import { widgetRegistry } from '@/lib/widgets';

widgetRegistry.register('screen', 'live-preview', {
  component: () => import('./LivePreview'),
  sizes: ['sm', 'md'],
  defaultSize: 'sm',
  refreshInterval: 30000,
  description: 'Small screen thumbnail that auto-refreshes',
});
