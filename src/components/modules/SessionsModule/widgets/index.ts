import { widgetRegistry } from '@/lib/widgets';

widgetRegistry.register('sessions', 'active-sessions', {
  component: () => import('./ActiveSessions'),
  sizes: ['sm', 'md', 'lg'],
  defaultSize: 'md',
  refreshInterval: 10000,
  description: 'Active sessions with model and last message preview',
});
