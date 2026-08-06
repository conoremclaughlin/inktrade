/**
 * A fake Robinhood MCP server for integration tests.
 *
 * Unit tests stub `client.callTool` and so never exercise the protocol. This
 * runs a real {@link Client} against a real transport, so requests are framed,
 * serialized and correlated exactly as they are in production — the fake stops
 * at the network boundary, not above it.
 *
 * That matters most for the write path. A test that stubs the client can't
 * catch a malformed tool argument, because nothing ever validates it. Here the
 * server records precisely what arrived.
 */

import { Client, InMemoryTransport } from '@modelcontextprotocol/client';

export interface RecordedCall {
  tool: string;
  args: Record<string, unknown>;
}

export interface FakeServerOptions {
  /**
   * Tool name to response payload, or to a function of the arguments.
   * A payload that is an Error is raised as a tool error.
   */
  tools: Record<
    string,
    unknown | ((args: Record<string, unknown>) => unknown)
  >;
  /** Tools the server refuses to expose, to simulate a narrower deployment. */
  missing?: string[];
}

export interface FakeServer {
  client: Client;
  /** Every tools/call the server received, in order. */
  calls: RecordedCall[];
  callsTo(tool: string): RecordedCall[];
  close(): Promise<void>;
}

/**
 * Stand up a fake server and a client connected to it.
 *
 * The server speaks JSON-RPC directly rather than using the server SDK, which
 * keeps the test dependency-free while still putting a real protocol exchange
 * between the broker and its fixtures.
 */
export async function startFakeRobinhood(options: FakeServerOptions): Promise<FakeServer> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const calls: RecordedCall[] = [];
  const missing = new Set(options.missing ?? []);

  serverTransport.onmessage = (message: unknown) => {
    const request = message as {
      id?: number | string;
      method?: string;
      params?: Record<string, unknown>;
    };

    // Notifications carry no id and expect no reply.
    if (request.id === undefined) return;

    const reply = (result: unknown) =>
      void serverTransport.send({ jsonrpc: '2.0', id: request.id!, result } as never);
    const fail = (code: number, msg: string) =>
      void serverTransport.send({
        jsonrpc: '2.0',
        id: request.id!,
        error: { code, message: msg },
      } as never);

    switch (request.method) {
      case 'initialize':
        return reply({
          protocolVersion: (request.params?.protocolVersion as string) ?? '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'fake-robinhood', version: '0.0.0' },
        });

      case 'tools/list':
        return reply({
          tools: Object.keys(options.tools)
            .filter((name) => !missing.has(name))
            .map((name) => ({
              name,
              description: name,
              inputSchema: { type: 'object' },
            })),
        });

      case 'tools/call': {
        const tool = String(request.params?.name ?? '');
        const args = (request.params?.arguments ?? {}) as Record<string, unknown>;
        calls.push({ tool, args });

        if (missing.has(tool) || !(tool in options.tools)) {
          return fail(-32602, `Unknown tool: ${tool}`);
        }

        const entry = options.tools[tool];
        let payload: unknown;
        try {
          payload = typeof entry === 'function'
            ? (entry as (a: Record<string, unknown>) => unknown)(args)
            : entry;
        } catch (err) {
          payload = err;
        }

        if (payload instanceof Error) {
          return reply({
            content: [{ type: 'text', text: payload.message }],
            isError: true,
          });
        }

        return reply({ content: [{ type: 'text', text: JSON.stringify(payload) }] });
      }

      case 'ping':
        return reply({});

      default:
        return fail(-32601, `Method not found: ${request.method}`);
    }
  };

  await serverTransport.start();

  const client = new Client({ name: 'inktrade-test', version: '0.0.0' });
  await client.connect(clientTransport);

  return {
    client,
    calls,
    callsTo: (tool) => calls.filter((c) => c.tool === tool),
    close: async () => {
      await client.close();
      await serverTransport.close();
    },
  };
}
