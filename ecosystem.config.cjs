// PM2 process definition for UTEXO MCP.
// Start with:  pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'utexo-mcp',
      script: 'src/server.mjs',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '8791',
        BITCOIN_API_BASE: 'https://mempool.space/api',
      },
      max_restarts: 10,
      restart_delay: 2000,
    },
  ],
};
