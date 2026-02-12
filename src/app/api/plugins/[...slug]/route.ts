import { NextRequest, NextResponse } from 'next/server';
import { getPluginApiHandler } from '@/lib/plugins';

async function handleRequest(req: NextRequest, params: Promise<{ slug: string[] }>) {
  const { slug } = await params;
  if (!slug || slug.length < 1) {
    return NextResponse.json({ error: 'Missing plugin name' }, { status: 400 });
  }

  const [pluginName, ...rest] = slug;
  const path = '/' + rest.join('/');

  const handler = getPluginApiHandler(pluginName, path);
  if (!handler) {
    return NextResponse.json(
      { error: `No route handler found for plugin "${pluginName}" at path "${path}"` },
      { status: 404 }
    );
  }

  try {
    return await handler(req);
  } catch (err) {
    return NextResponse.json(
      { error: `Plugin "${pluginName}" handler error` },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest, context: { params: Promise<{ slug: string[] }> }) {
  return handleRequest(req, context.params);
}

export async function POST(req: NextRequest, context: { params: Promise<{ slug: string[] }> }) {
  return handleRequest(req, context.params);
}

export async function PUT(req: NextRequest, context: { params: Promise<{ slug: string[] }> }) {
  return handleRequest(req, context.params);
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ slug: string[] }> }) {
  return handleRequest(req, context.params);
}
