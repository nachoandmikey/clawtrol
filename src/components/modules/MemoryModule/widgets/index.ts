import { widgetRegistry } from '@/lib/widgets';

widgetRegistry.register('memory', 'recent-notes', {
  component: () => import('./RecentNotes'),
  sizes: ['sm', 'md'],
  defaultSize: 'md',
  refreshInterval: 10000,
  description: 'Memory usage overview with top processes',
});
