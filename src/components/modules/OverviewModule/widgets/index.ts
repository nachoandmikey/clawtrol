import { widgetRegistry } from '@/lib/widgets';

widgetRegistry.register('overview', 'system-stats', {
  component: () => import('./SystemStats'),
  sizes: ['sm', 'md', 'lg'],
  defaultSize: 'md',
  refreshInterval: 5000,
  description: 'CPU, RAM, disk, and uptime mini cards',
});
