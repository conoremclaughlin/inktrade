import type { Client } from '@modelcontextprotocol/client';

/**
 * Call a tool and decode its JSON payload.
 *
 * MCP tools answer with content blocks. Servers that declare an output schema
 * also populate `structuredContent`; older ones — Robinhood among them — put a
 * JSON document in a text block. Prefer the structured field and fall back to
 * parsing the text, so both shapes work without the caller caring which came.
 */
export async function callToolJson<T>(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const result = await client.callTool({ name, arguments: args });

  const text = (Array.isArray(result.content) ? result.content : [])
    .filter((block): block is { type: 'text'; text: string } => block?.type === 'text')
    .map((block) => block.text)
    .join('');

  if (result.isError) {
    throw new Error(`MCP tool ${name} failed: ${text || 'no detail given'}`);
  }

  if (result.structuredContent !== undefined) return result.structuredContent as T;

  if (!text) throw new Error(`MCP tool ${name} returned no content`);

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`MCP tool ${name} returned content that is not JSON`);
  }
}
