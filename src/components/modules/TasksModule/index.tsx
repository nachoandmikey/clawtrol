'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card } from '@/components/shared/StatCard';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export default function TasksModule() {
  const [tasks, setTasks] = useState<any>(null);
  const [selectedTask, setSelectedTask] = useState<any>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      setTasks(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Project Filter Bar */}
      {tasks?.projects && tasks.projects.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>Filter:</span>
          <button
            onClick={() => setTasks({ ...tasks, filterProject: null })}
            className="px-2 py-1 rounded text-[10px] border transition-all"
            style={!tasks.filterProject
              ? { background: 'rgba(0,255,200,0.15)', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' }
              : { background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)', color: 'var(--text-dim)' }
            }
          >
            All
          </button>
          {tasks.projects.map((p: any) => (
            <button
              key={p.id}
              onClick={() => setTasks({ ...tasks, filterProject: tasks.filterProject === p.id ? null : p.id })}
              className="px-2 py-1 rounded text-[10px] border transition-all"
              style={tasks.filterProject === p.id
                ? { background: `${p.color}22`, borderColor: p.color, color: p.color }
                : { background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)', color: 'var(--text-dim)' }
              }
            >
              {p.emoji} {p.name}
            </button>
          ))}
        </div>
      )}

      <Card title="KANBAN BOARD" actions={
        <div className="flex gap-3">
          <button
            onClick={async () => {
              const title = prompt('New task title:');
              if (title) {
                const projectList = tasks?.projects?.map((p: any) => `${p.emoji} ${p.name}`).join(', ') || '';
                const projectInput = prompt(`Project? (${projectList}) - or leave empty:`);
                const project = tasks?.projects?.find((p: any) =>
                  projectInput && (p.name.toLowerCase().includes(projectInput.toLowerCase()) || p.emoji === projectInput)
                )?.id || null;
                await fetch('/api/tasks', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'create', title, status: 'backlog', project })
                });
                fetchTasks();
              }
            }}
            className="text-[10px] tracking-wider transition-colors hover:opacity-70"
            style={{ color: 'var(--accent-cyan)' }}
          >
            + ADD
          </button>
          <button onClick={() => fetchTasks()} className="text-[10px] tracking-wider transition-colors" style={{ color: 'var(--text-dim)' }}>↻</button>
        </div>
      }>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 min-h-[50vh]">
          {['backlog', 'in-progress', 'in-review', 'done'].map(status => {
            const allColumnTasks = tasks?.tasks?.filter((t: any) => t.status === status) || [];
            const columnTasks = tasks?.filterProject
              ? allColumnTasks.filter((t: any) => t.project === tasks.filterProject)
              : allColumnTasks;
            const columnLabels: Record<string, { label: string; color: string }> = {
              'backlog': { label: 'BACKLOG', color: 'var(--text-dim)' },
              'in-progress': { label: 'IN PROGRESS', color: 'var(--accent-cyan)' },
              'in-review': { label: 'IN REVIEW', color: 'var(--accent-purple)' },
              'done': { label: 'DONE', color: 'var(--accent-green)' },
            };
            const col = columnLabels[status];

            return (
              <div key={status} className="flex flex-col rounded p-2" style={{ background: 'var(--bg-secondary)', minHeight: '200px' }}>
                <div className="flex items-center justify-between mb-3 pb-2 border-b" style={{ borderColor: 'var(--border-dim)' }}>
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: col.color }}>{col.label}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>
                    {columnTasks.length}
                  </span>
                </div>
                <div className="flex-1 space-y-2 overflow-auto">
                  {columnTasks.map((task: any) => {
                    const taskProject = tasks?.projects?.find((p: any) => p.id === task.project);
                    const taskTags = task.tags?.map((tagId: string) => tasks?.tags?.find((t: any) => t.id === tagId)).filter(Boolean) || [];
                    return (
                      <div
                        key={task.id}
                        onClick={() => setSelectedTask(task)}
                        className="group p-2 rounded border transition-all hover:border-opacity-100 cursor-pointer"
                        style={{
                          background: 'var(--bg-elevated)',
                          borderColor: 'var(--border-dim)',
                          borderLeftColor: taskProject?.color || 'var(--border-dim)',
                          borderLeftWidth: taskProject ? '3px' : '1px'
                        }}
                      >
                        {taskProject && (
                          <div className="text-[8px] mb-1 flex items-center gap-1" style={{ color: taskProject.color }}>
                            {taskProject.emoji} {taskProject.name}
                          </div>
                        )}
                        <div className="text-[11px] mb-1" style={{ color: 'var(--text-primary)' }}>{task.title}</div>
                        {task.description && (
                          <div className="text-[9px] mb-2 line-clamp-2" style={{ color: 'var(--text-dim)' }}>{task.description}</div>
                        )}
                        <div className="flex flex-wrap gap-1 mb-2">
                          {task.pr && (
                            <a
                              href={task.pr}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded"
                              style={{ background: 'rgba(136,71,255,0.1)', color: 'var(--accent-purple)' }}
                              onClick={e => e.stopPropagation()}
                            >
                              🔗 PR
                            </a>
                          )}
                          {taskTags.map((tag: any) => (
                            <span key={tag.id} className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: `${tag.color}22`, color: tag.color }}>
                              {tag.name}
                            </span>
                          ))}
                        </div>
                        {task.dueDate && (() => {
                          const now = Date.now();
                          const daysUntilDue = Math.ceil((task.dueDate - now) / (1000 * 60 * 60 * 24));
                          const isOverdue = daysUntilDue < 0;
                          const isDueSoon = daysUntilDue >= 0 && daysUntilDue <= 3;
                          const dueDateColor = isOverdue ? 'var(--accent-red)' : isDueSoon ? 'var(--accent-yellow)' : 'var(--text-dim)';
                          const formattedDate = new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                          return (
                            <div className="flex items-center gap-1 mb-2 text-[9px]" style={{ color: dueDateColor }}>
                              📅 {formattedDate} {isOverdue ? '(overdue!)' : isDueSoon ? `(${daysUntilDue}d left)` : ''}
                            </div>
                          );
                        })()}
                        {task.assignee && (() => {
                          const assignee = tasks?.agents?.find((a: any) => a.id === task.assignee);
                          return assignee ? (
                            <div className="flex items-center gap-1 mb-2 text-[9px]" style={{ color: assignee.color }}>
                              {assignee.emoji} {assignee.name}
                            </div>
                          ) : null;
                        })()}
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {status !== 'backlog' && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                const statuses = ['backlog', 'in-progress', 'in-review', 'done'];
                                const currentIdx = statuses.indexOf(status);
                                if (currentIdx > 0) {
                                  await fetch('/api/tasks', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ action: 'move', id: task.id, status: statuses[currentIdx - 1] })
                                  });
                                  fetchTasks();
                                }
                              }}
                              className="text-[8px] px-1.5 py-0.5 rounded"
                              style={{ background: 'var(--bg-secondary)', color: 'var(--text-dim)' }}
                            >
                              ←
                            </button>
                          )}
                          {status !== 'done' && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                const statuses = ['backlog', 'in-progress', 'in-review', 'done'];
                                const currentIdx = statuses.indexOf(status);
                                let pr = task.pr;
                                if (statuses[currentIdx + 1] === 'in-review' && !task.pr) {
                                  pr = prompt('PR URL (optional):') || null;
                                }
                                await fetch('/api/tasks', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'move', id: task.id, status: statuses[currentIdx + 1], pr })
                                });
                                fetchTasks();
                              }}
                              className="text-[8px] px-1.5 py-0.5 rounded"
                              style={{ background: 'var(--bg-secondary)', color: 'var(--text-dim)' }}
                            >
                              →
                            </button>
                          )}
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (confirm('Delete this task?')) {
                                await fetch('/api/tasks', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'delete', id: task.id })
                                });
                                fetchTasks();
                              }
                            }}
                            className="text-[8px] px-1.5 py-0.5 rounded ml-auto"
                            style={{ background: 'rgba(255,59,92,0.1)', color: 'var(--accent-red)' }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Task Modal */}
      <Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <DialogContent className="flex flex-col p-0" style={{ maxWidth: '42rem' }} showCloseButton={true}>
          {selectedTask && (
            <>
              <DialogHeader className="p-4 border-b shrink-0 flex flex-row items-center gap-3" style={{ borderColor: 'var(--border-dim)' }}>
                {(() => {
                  const project = tasks?.projects?.find((p: any) => p.id === selectedTask.project);
                  return project ? (
                    <span className="text-[10px] px-2 py-1 rounded" style={{ background: `${project.color}22`, color: project.color }}>
                      {project.emoji} {project.name}
                    </span>
                  ) : null;
                })()}
                <DialogDescription className="sr-only">Task details</DialogDescription>
                <DialogTitle className="sr-only">{selectedTask.title}</DialogTitle>
                <select
                  value={selectedTask.status}
                  onChange={async (e) => {
                    await fetch('/api/tasks', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'move', id: selectedTask.id, status: e.target.value })
                    });
                    fetchTasks();
                    setSelectedTask({ ...selectedTask, status: e.target.value });
                  }}
                  className="text-[10px] px-2 py-1 rounded border cursor-pointer"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)', color: 'var(--text-primary)' }}
                >
                  <option value="backlog">Backlog</option>
                  <option value="in-progress">In Progress</option>
                  <option value="in-review">In Review</option>
                  <option value="done">Done</option>
                </select>
              </DialogHeader>

              <div
                className="p-4 overflow-auto flex-1"
                style={{
                  WebkitOverflowScrolling: 'touch',
                  overscrollBehavior: 'contain',
                  maxHeight: 'calc(100dvh - 14rem)',
                }}
              >
                <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{selectedTask.title}</h2>

                <div className="mb-4">
                  <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-dim)' }}>Description</label>
                  <textarea
                    value={selectedTask.description || ''}
                    onChange={(e) => setSelectedTask({ ...selectedTask, description: e.target.value })}
                    onBlur={async () => {
                      await fetch('/api/tasks', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'update', id: selectedTask.id, updates: { description: selectedTask.description } })
                      });
                      fetchTasks();
                    }}
                    className="w-full p-2 rounded border text-[12px] resize-none"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)', color: 'var(--text-secondary)', minHeight: '80px' }}
                    placeholder="Add a description..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-dim)' }}>Assignee</label>
                    <select
                      value={selectedTask.assignee || ''}
                      onChange={async (e) => {
                        const newAssignee = e.target.value || null;
                        await fetch('/api/tasks', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'assign', id: selectedTask.id, assignee: newAssignee })
                        });
                        fetchTasks();
                        setSelectedTask({ ...selectedTask, assignee: newAssignee });
                      }}
                      className="w-full p-2 rounded border text-[12px] cursor-pointer"
                      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)', color: 'var(--text-primary)' }}
                    >
                      <option value="">Unassigned</option>
                      {tasks?.agents?.map((agent: any) => (
                        <option key={agent.id} value={agent.id}>{agent.emoji} {agent.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-dim)' }}>PR Link</label>
                    <input
                      type="text"
                      value={selectedTask.pr || ''}
                      onChange={(e) => setSelectedTask({ ...selectedTask, pr: e.target.value })}
                      onBlur={async () => {
                        await fetch('/api/tasks', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'update', id: selectedTask.id, updates: { pr: selectedTask.pr || null } })
                        });
                        fetchTasks();
                      }}
                      className="w-full p-2 rounded border text-[12px]"
                      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)', color: 'var(--text-primary)' }}
                      placeholder="https://github.com/..."
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-dim)' }}>Due Date</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={selectedTask.dueDate ? new Date(selectedTask.dueDate).toISOString().split('T')[0] : ''}
                      onChange={async (e) => {
                        const newDueDate = e.target.value ? new Date(e.target.value).getTime() : null;
                        await fetch('/api/tasks', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'update', id: selectedTask.id, updates: { dueDate: newDueDate } })
                        });
                        fetchTasks();
                        setSelectedTask({ ...selectedTask, dueDate: newDueDate });
                      }}
                      className="p-2 rounded border text-[12px]"
                      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)', color: 'var(--text-primary)' }}
                    />
                    {selectedTask.dueDate && (
                      <>
                        <button
                          onClick={async () => {
                            await fetch('/api/tasks', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'update', id: selectedTask.id, updates: { dueDate: null } })
                            });
                            fetchTasks();
                            setSelectedTask({ ...selectedTask, dueDate: null });
                          }}
                          className="text-[10px] px-2 py-1 rounded"
                          style={{ background: 'rgba(255,59,92,0.1)', color: 'var(--accent-red)' }}
                        >
                          Clear
                        </button>
                        {(() => {
                          const now = Date.now();
                          const daysUntilDue = Math.ceil((selectedTask.dueDate - now) / (1000 * 60 * 60 * 24));
                          const isOverdue = daysUntilDue < 0;
                          const isDueSoon = daysUntilDue >= 0 && daysUntilDue <= 3;
                          const statusColor = isOverdue ? 'var(--accent-red)' : isDueSoon ? 'var(--accent-yellow)' : 'var(--accent-green)';
                          const statusText = isOverdue ? `${Math.abs(daysUntilDue)} days overdue` : daysUntilDue === 0 ? 'Due today!' : `${daysUntilDue} days left`;
                          return <span className="text-[10px]" style={{ color: statusColor }}>{statusText}</span>;
                        })()}
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-dim)' }}>Project</label>
                    <select
                      value={selectedTask.project || ''}
                      onChange={async (e) => {
                        const newProject = e.target.value || null;
                        await fetch('/api/tasks', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'update', id: selectedTask.id, updates: { project: newProject } })
                        });
                        fetchTasks();
                        setSelectedTask({ ...selectedTask, project: newProject });
                      }}
                      className="w-full p-2 rounded border text-[12px] cursor-pointer"
                      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)', color: 'var(--text-primary)' }}
                    >
                      <option value="">No Project</option>
                      {tasks?.projects?.map((project: any) => (
                        <option key={project.id} value={project.id}>{project.emoji} {project.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-dim)' }}>Tags</label>
                    <div className="flex flex-wrap gap-1">
                      {tasks?.tags?.map((tag: any) => {
                        const isSelected = selectedTask.tags?.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={async () => {
                              const newTags = isSelected
                                ? (selectedTask.tags || []).filter((t: string) => t !== tag.id)
                                : [...(selectedTask.tags || []), tag.id];
                              await fetch('/api/tasks', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'update', id: selectedTask.id, updates: { tags: newTags } })
                              });
                              fetchTasks();
                              setSelectedTask({ ...selectedTask, tags: newTags });
                            }}
                            className="text-[10px] px-2 py-1 rounded border transition-all"
                            style={isSelected
                              ? { background: `${tag.color}22`, borderColor: tag.color, color: tag.color }
                              : { background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)', color: 'var(--text-dim)' }
                            }
                          >
                            {tag.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-dim)' }}>Activity</label>
                  <div className="space-y-2 mb-3 max-h-40 overflow-auto">
                    {(selectedTask.activity || []).slice().reverse().map((act: any) => {
                      const agent = tasks?.agents?.find((a: any) => a.id === act.agentId);
                      return (
                        <div key={act.id} className="flex gap-2 text-[11px]">
                          <span style={{ color: agent?.color || 'var(--text-dim)' }}>{agent?.emoji || '•'}</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{act.content}</span>
                          <span className="ml-auto text-[9px]" style={{ color: 'var(--text-dim)' }}>
                            {new Date(act.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      );
                    })}
                    {(!selectedTask.activity || selectedTask.activity.length === 0) && (
                      <div className="text-[11px]" style={{ color: 'var(--text-dim)' }}>No activity yet</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add a comment..."
                      className="flex-1 p-2 rounded border text-[12px]"
                      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)', color: 'var(--text-primary)' }}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                          const comment = (e.target as HTMLInputElement).value.trim();
                          await fetch('/api/tasks', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'comment', id: selectedTask.id, comment, agentId: 'user' })
                          });
                          (e.target as HTMLInputElement).value = '';
                          const res = await fetch('/api/tasks');
                          const data = await res.json();
                          setTasks(data);
                          const updated = data.tasks.find((t: any) => t.id === selectedTask.id);
                          if (updated) setSelectedTask(updated);
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 border-t" style={{ borderColor: 'var(--border-dim)' }}>
                <button
                  onClick={async () => {
                    if (confirm('Delete this task?')) {
                      await fetch('/api/tasks', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'delete', id: selectedTask.id })
                      });
                      fetchTasks();
                      setSelectedTask(null);
                    }
                  }}
                  className="text-[10px] px-3 py-1.5 rounded"
                  style={{ background: 'rgba(255,59,92,0.1)', color: 'var(--accent-red)' }}
                >
                  Delete Task
                </button>
                <div className="text-[9px]" style={{ color: 'var(--text-dim)' }}>
                  Created {new Date(selectedTask.createdAt).toLocaleDateString()}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
