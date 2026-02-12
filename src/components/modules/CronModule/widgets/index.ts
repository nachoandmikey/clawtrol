import { widgetRegistry } from '@/lib/widgets';

widgetRegistry.register('cron', 'next-jobs', {
  component: () => import('./NextJobs'),
  sizes: ['sm', 'md'],
  defaultSize: 'sm',
  refreshInterval: 30000,
  description: 'Upcoming cron jobs sorted by next run time',
});
