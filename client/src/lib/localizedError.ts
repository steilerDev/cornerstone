/** An Error whose message is already translated for display. Only throw it with t() output. */
export class LocalizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalizedError';
  }
}
