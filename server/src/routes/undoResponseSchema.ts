/**
 * Response schema of a DELETE that answers `200 { undo }` (restore-kind Undo, contract 11).
 * Without it Fastify's serializer would drop the `undo` field from routes that declare a
 * response schema, so every such route spreads this into its `schema`.
 */
export const undoableDeleteResponse = {
  200: {
    type: 'object',
    required: ['undo'],
    properties: {
      undo: {
        type: 'object',
        required: ['token', 'expiresAt'],
        properties: {
          token: { type: 'string' },
          expiresAt: { type: 'string' },
        },
      },
    },
  },
} as const;
