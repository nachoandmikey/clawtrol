import { widgetRegistry } from '@/lib/widgets';

widgetRegistry.register('tasks', 'kanban-summary', {
  component: () => import('./KanbanSummary'),
  sizes: ['sm', 'md'],
  defaultSize: 'md',
  refreshInterval: 15000,
  description: 'Task count per kanban column with progress bars',
});
