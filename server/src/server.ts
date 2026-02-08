import { buildApp } from './app.js';

async function main() {
  const app = await buildApp();

  // Graceful shutdown handler (important when running as PID 1 in Docker)
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down gracefully...`);
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error(err, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    await app.listen({ port: app.config.port, host: app.config.host });
    app.log.info(`Cornerstone server listening on ${app.config.host}:${app.config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
