import fp from 'fastify-plugin';
import helmet from '@fastify/helmet';

export default fp(
  async function helmetPlugin(fastify) {
    await fastify.register(helmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: null, // Remove — app never terminates TLS
        },
      },
      hsts: false, // App runs behind TLS-terminating proxy; HSTS belongs there
      frameguard: { action: 'sameorigin' },
      noSniff: true,
      xssFilter: true,
    });
  },
  {
    name: 'helmet',
    dependencies: ['config'],
  },
);
