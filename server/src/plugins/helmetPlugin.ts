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
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: false,
      },
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
