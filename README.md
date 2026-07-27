# UTEXO MCP

A hosted **Model Context Protocol** server that gives Claude and other AI clients a set of
**secret-free Bitcoin & RGB tools** — no API keys, nothing to install, nothing that can move funds.

**Live:** https://mcp.gogettest.online · **Endpoint:** `https://mcp.gogettest.online/mcp` · **Docs:** https://mcp.gogettest.online/docs

## Add it to your AI

| Client | How |
| --- | --- |
| **Claude** (Pro/Team/Enterprise) | Settings → Connectors → *Add custom connector* → paste `https://mcp.gogettest.online/mcp` |
| **Cursor** | One-click deep link on the site, or add `{ "url": "https://mcp.gogettest.online/mcp" }` to `~/.cursor/mcp.json` |
| **VS Code** (Copilot agent) | One-click deep link, or add an `http` server pointing at the URL |
| **Claude Desktop / stdio** | `npx -y mcp-remote https://mcp.gogettest.online/mcp` |

Claude Desktop config:

```json
{
  "mcpServers": {
    "utexo": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.gogettest.online/mcp"]
    }
  }
}
```

## Tools

| Tool | Description |
| --- | --- |
| `utexo_project_info` | Curated overview of the UTEXO Protocol and its building blocks. |
| `bitcoin_network_status` | Chain tip height, recommended fees and mempool summary. |
| `bitcoin_fee_estimates` | Recommended sat/vByte fee rates by confirmation target. |
| `bitcoin_address` | Balance (sats/BTC) and tx counts for a Bitcoin address. |
| `bitcoin_transaction` | Status, confirmations, fee and size for a txid. |
| `bitcoin_block` | Header details by block height or hash. |
| `verify_merkle_proof` | Offline Bitcoin SPV Merkle inclusion-proof verification (with position-binding hardening). |

All tools are read-only or fully offline. The server holds no secrets and cannot sign anything.

## Run locally

```bash
npm install
PORT=8791 npm start
# MCP endpoint: http://127.0.0.1:8791/mcp
```

Environment: `PORT` (default 8791), `HOST` (default 127.0.0.1),
`BITCOIN_API_BASE` (default `https://mempool.space/api`).

## Architecture

- Node.js (ESM), Express, [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk).
- Transport: **Streamable HTTP**, stateless (a fresh MCP server + transport per request).
- The same Node process serves the static landing page and docs, plus the `/mcp` endpoint.
- Deployed behind nginx with Let's Encrypt TLS and kept alive by PM2.

```
src/
  server.mjs    HTTP server + MCP wiring (Streamable HTTP, stateless)
  tools.mjs     tool definitions
  bitcoin.mjs   read-only mempool.space-compatible client
  merkle.mjs    pure Bitcoin Merkle-proof verification
public/
  index.html    landing page ("Add to Claude")
  docs.html     documentation
  styles.css
```

## License

MIT — see [LICENSE](./LICENSE).
