import { NextResponse } from 'next/server';
import { readFile, writeFile, readdir, unlink } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';

const COMMS_DIR = 'os.homedir()/memory/comms';
const REGISTRY_FILE = 'os.homedir()/agents/registry.json';

// GET - List all pending communication requests
export async function GET() {
  try {
    const files = await readdir(COMMS_DIR);
    const requests: any[] = [];
    
    for (const file of files) {
      if (file.startsWith('request-') && file.endsWith('.md')) {
        try {
          const content = await readFile(join(COMMS_DIR, file), 'utf-8');
          if (content.trim()) {
            const toAgent = file.replace('request-', '').replace('.md', '');
            
            // Parse the request
            const fromMatch = content.match(/From:\s*(\w+)/i);
            const taskMatch = content.match(/Task:\s*(.+)/i);
            
            requests.push({
              file,
              to: toAgent,
              from: fromMatch?.[1] || 'unknown',
              task: taskMatch?.[1] || 'unspecified',
              content: content.slice(0, 500),
              timestamp: new Date().toISOString()
            });
          }
        } catch {}
      }
    }
    
    return NextResponse.json({
      pendingRequests: requests.length,
      requests
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to list comms' }, { status: 500 });
  }
}

// POST - Send a communication request between agents
export async function POST(request: Request) {
  try {
    const { action, from, to, task, context, requestFile } = await request.json();
    
    if (action === 'send') {
      if (!from || !to || !task) {
        return NextResponse.json({ error: 'from, to, and task required' }, { status: 400 });
      }
      
      // Validate agents exist
      const registryData = await readFile(REGISTRY_FILE, 'utf-8');
      const registry = JSON.parse(registryData);
      
      if (!registry.agents[to]) {
        return NextResponse.json({ error: `Agent ${to} not found` }, { status: 404 });
      }
      
      // Write request file
      const requestContent = `# Help Request

**From:** ${from}
**To:** ${to}
**Task:** ${task}
**Timestamp:** ${new Date().toISOString()}

## Context
${context || 'No additional context provided.'}

---
*This request was created by ${from}. Mikey will route it.*
`;
      
      const requestPath = join(COMMS_DIR, `request-${to}.md`);
      await writeFile(requestPath, requestContent);
      
      return NextResponse.json({
        ok: true,
        message: `Request sent from ${from} to ${to}`,
        requestFile: `request-${to}.md`
      });
    }
    
    if (action === 'clear') {
      if (!requestFile) {
        return NextResponse.json({ error: 'requestFile required' }, { status: 400 });
      }
      
      try {
        await unlink(join(COMMS_DIR, requestFile));
        return NextResponse.json({ ok: true, message: 'Request cleared' });
      } catch {
        return NextResponse.json({ error: 'Request file not found' }, { status: 404 });
      }
    }
    
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
