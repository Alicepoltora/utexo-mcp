import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerTools, TOOL_SUMMARIES } from './tools.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const PORT = Number(process.env.PORT || 8791);
const HOST = process.env.HOST || '127.0.0.1';
const SERVER_NAME = 'utexo-mcp';
const SERVER_VERSION = '1.0.0';

// --- Privacy-light click analytics (aggregate counts only) -----------------
// No cookies, no IPs, no user agents — just per-event tallies persisted to a
// small JSON file so we can see which client people connect with.
const DATA_DIR = process.env.STATS_DIR || path.join(__dirname, '..', 'data');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const TRACK_EVENTS = new Set([
  'open_claude', 'open_cursor', 'open_vscode', 'open_desktop', 'open_other',
  'deeplink_cursor', 'deeplink_vscode', 'copy_url', 'copy_config', 'copy_curl', 'run_tool',
]);

let stats = { since: new Date().toISOString(), total: 0, events: {} };
try {
  stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
} catch {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}
let statsDirty = false;
setInterval(() => {
  if (!statsDirty) return;
  statsDirty = false;
  fs.writeFile(STATS_FILE, JSON.stringify(stats), () => {});
}, 2000).unref();

function track(event) {
  if (!TRACK_EVENTS.has(event)) return false;
  stats.events[event] = (stats.events[event] || 0) + 1;
  stats.total += 1;
  statsDirty = true;
  return true;
}

function buildMcpServer() {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        'UTEXO MCP exposes read-only Bitcoin data and offline Bitcoin/RGB utilities. ' +
        'No API keys or secrets are required. Use utexo_project_info to learn about the protocol.',
    }
  );
  registerTools(server);
  return server;
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));

// Permissive CORS so browser-based MCP clients / inspectors can connect.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Accept, Authorization, mcp-session-id, mcp-protocol-version'
  );
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', server: SERVER_NAME, version: SERVER_VERSION, transport: 'streamable-http' });
});

// Lightweight machine-readable descriptor for the landing page / clients.
app.get('/info', (_req, res) => {
  res.json({
    name: SERVER_NAME,
    version: SERVER_VERSION,
    endpoint: '/mcp',
    transport: 'streamable-http',
    tools: TOOL_SUMMARIES.map(([name, description]) => ({ name, description })),
  });
});

// Record a client-connect / conversion click. Accepts a small JSON body
// {event} or a query param; only allow-listed event names are counted.
app.post('/track', (req, res) => {
  const event = (req.body && req.body.event) || req.query.event;
  track(String(event || ''));
  res.status(204).end();
});
// sendBeacon can only issue POST, but keep a GET fallback for simple clients.
app.get('/track', (req, res) => {
  track(String(req.query.event || ''));
  res.status(204).end();
});

// Aggregate, anonymous usage counters.
app.get('/stats', (_req, res) => {
  res.json(stats);
});

// --- MCP endpoint: stateless Streamable HTTP -------------------------------
// A fresh server + transport per request keeps the deployment simple and
// horizontally scalable; no session state is retained between calls.
app.post('/mcp', async (req, res) => {
  const server = buildMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('MCP request error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

// Stateless mode does not support server-initiated streams via GET/DELETE.
const methodNotAllowed = (_req, res) =>
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed. Use POST for the stateless /mcp endpoint.' },
    id: null,
  });
app.get('/mcp', methodNotAllowed);
app.delete('/mcp', methodNotAllowed);

// --- Static site (landing + docs) ------------------------------------------
app.use(
  express.static(PUBLIC_DIR, {
    extensions: ['html'],
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
  })
);
app.get('*', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.listen(PORT, HOST, () => {
  console.log(`${SERVER_NAME} v${SERVER_VERSION} listening on http://${HOST}:${PORT}`);
  console.log(`  MCP endpoint : POST /mcp (streamable-http, stateless)`);
  console.log(`  Static site  : ${PUBLIC_DIR}`);
});
