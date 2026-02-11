import { NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';

const DATA_DIR = 'os.homedir()/.openclaw/control-center';
const TASKS_FILE = join(DATA_DIR, 'tasks.json');

interface Activity {
  id: string;
  type: 'comment' | 'status_change' | 'assignment' | 'created';
  agentId: string;
  content: string;
  timestamp: number;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'backlog' | 'in-progress' | 'in-review' | 'done';
  pr?: string | null;
  project?: string | null;
  tags?: string[];
  assignee?: string | null;
  activity?: Activity[];
  dueDate?: number | null;
  createdAt: number;
  updatedAt: number;
}

interface Project {
  id: string;
  name: string;
  color: string;
  emoji?: string;
}

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface Agent {
  id: string;
  name: string;
  emoji: string;
  color: string;
  model: string;
}

interface TasksData {
  tasks: Task[];
  columns: string[];
  projects?: Project[];
  tags?: Tag[];
  agents?: Agent[];
  taskCounter?: number;
}

async function loadTasks(): Promise<TasksData> {
  try {
    const data = await readFile(TASKS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      tasks: [],
      columns: ['backlog', 'in-progress', 'in-review', 'done']
    };
  }
}

async function saveTasks(data: TasksData): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(TASKS_FILE, JSON.stringify(data, null, 2));
}

function generateId(data: TasksData): string {
  const counter = (data.taskCounter || 0) + 1;
  data.taskCounter = counter;
  return `TASK-${String(counter).padStart(3, '0')}`;
}

// GET - List all tasks
export async function GET() {
  try {
    const data = await loadTasks();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load tasks' }, { status: 500 });
  }
}

function addActivity(task: Task, type: Activity['type'], agentId: string, content: string) {
  if (!task.activity) task.activity = [];
  task.activity.push({
    id: `act-${Date.now().toString(36)}`,
    type,
    agentId,
    content,
    timestamp: Date.now(),
  });
}

// POST - Create new task or update existing
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = await loadTasks();
    
    if (body.action === 'create') {
      const newTask: Task = {
        id: generateId(data),
        title: body.title,
        description: body.description || '',
        status: body.status || 'backlog',
        pr: body.pr || null,
        project: body.project || null,
        tags: body.tags || [],
        assignee: body.assignee || null,
        activity: [],
        dueDate: body.dueDate || null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      addActivity(newTask, 'created', 'mikey', `Created task`);
      data.tasks.push(newTask);
      await saveTasks(data);
      return NextResponse.json({ ok: true, task: newTask });
    }
    
    if (body.action === 'assign') {
      const idx = data.tasks.findIndex(t => t.id === body.id);
      if (idx === -1) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
      const oldAssignee = data.tasks[idx].assignee;
      data.tasks[idx].assignee = body.assignee;
      data.tasks[idx].updatedAt = Date.now();
      const agent = data.agents?.find(a => a.id === body.assignee);
      addActivity(data.tasks[idx], 'assignment', 'mikey', 
        body.assignee ? `Assigned to ${agent?.name || body.assignee}` : `Unassigned`);
      
      // Auto-move to in-progress when assigned (if in backlog)
      if (body.assignee && data.tasks[idx].status === 'backlog') {
        data.tasks[idx].status = 'in-progress';
        addActivity(data.tasks[idx], 'status_change', 'mikey', 'Moved to In Progress');
      }
      // Move back to backlog if unassigned from in-progress
      if (!body.assignee && data.tasks[idx].status === 'in-progress') {
        data.tasks[idx].status = 'backlog';
        addActivity(data.tasks[idx], 'status_change', 'mikey', 'Moved to Backlog');
      }
      
      await saveTasks(data);
      return NextResponse.json({ ok: true, task: data.tasks[idx], shouldSpawn: !!body.assignee && body.assignee !== 'mikey' });
    }
    
    if (body.action === 'comment') {
      const idx = data.tasks.findIndex(t => t.id === body.id);
      if (idx === -1) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
      addActivity(data.tasks[idx], 'comment', body.agentId || 'mikey', body.comment);
      data.tasks[idx].updatedAt = Date.now();
      await saveTasks(data);
      return NextResponse.json({ ok: true, task: data.tasks[idx] });
    }
    
    if (body.action === 'update') {
      const idx = data.tasks.findIndex(t => t.id === body.id);
      if (idx === -1) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
      data.tasks[idx] = {
        ...data.tasks[idx],
        ...body.updates,
        updatedAt: Date.now(),
      };
      await saveTasks(data);
      return NextResponse.json({ ok: true, task: data.tasks[idx] });
    }
    
    if (body.action === 'move') {
      const idx = data.tasks.findIndex(t => t.id === body.id);
      if (idx === -1) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
      const oldStatus = data.tasks[idx].status;
      data.tasks[idx].status = body.status;
      data.tasks[idx].updatedAt = Date.now();
      if (body.pr !== undefined) {
        data.tasks[idx].pr = body.pr;
      }
      const statusLabels: Record<string, string> = {
        'backlog': 'Backlog',
        'in-progress': 'In Progress', 
        'in-review': 'In Review',
        'done': 'Done'
      };
      addActivity(data.tasks[idx], 'status_change', body.agentId || 'mikey', 
        `Moved to ${statusLabels[body.status] || body.status}`);
      await saveTasks(data);
      return NextResponse.json({ ok: true, task: data.tasks[idx] });
    }
    
    if (body.action === 'delete') {
      data.tasks = data.tasks.filter(t => t.id !== body.id);
      await saveTasks(data);
      return NextResponse.json({ ok: true });
    }
    
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
