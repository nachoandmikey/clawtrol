import { NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

const TASKS_FILE = 'os.homedir()/.openclaw/control-center/tasks.json';

export async function GET() {
  try {
    const data = JSON.parse(await readFile(TASKS_FILE, 'utf-8'));
    
    // Find all tasks with PR links that aren't done
    const prTasks = data.tasks.filter((t: any) => 
      t.pr && 
      t.status !== 'done' && 
      t.pr.includes('github.com/nachoandmikey/')
    );
    
    const results: any[] = [];
    
    for (const task of prTasks) {
      try {
        // Extract repo and PR number from URL
        const match = task.pr.match(/github\.com\/nachoandmikey\/([^/]+)\/pull\/(\d+)/);
        if (!match) continue;
        
        const [, repo, prNum] = match;
        
        // Check PR status via gh cli
        const prData = execSync(
          `gh pr view ${prNum} -R nachoandmikey/${repo} --json state,mergedAt`,
          { encoding: 'utf-8', timeout: 10000 }
        );
        
        const pr = JSON.parse(prData);
        
        if (pr.mergedAt || pr.state === 'MERGED') {
          // Move task to done
          task.status = 'done';
          task.updatedAt = Date.now();
          if (!task.activity) task.activity = [];
          task.activity.push({
            id: `act-${Date.now()}`,
            type: 'status_change',
            agentId: 'mikey',
            content: `PR merged! Moved to Done`,
            timestamp: Date.now(),
          });
          
          results.push({ task: task.title, action: 'moved to done', mergedAt: pr.mergedAt });
        } else if (pr.state === 'CLOSED') {
          // PR was closed without merge - could archive or leave
          results.push({ task: task.title, action: 'PR closed (not merged)', state: pr.state });
        } else {
          results.push({ task: task.title, action: 'still open', state: pr.state });
        }
      } catch (e) {
        results.push({ task: task.title, action: 'error checking', error: String(e) });
      }
    }
    
    // Save updated tasks
    await writeFile(TASKS_FILE, JSON.stringify(data, null, 2));
    
    return NextResponse.json({
      checked: prTasks.length,
      results,
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
