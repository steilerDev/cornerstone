/** CJS-compatible nanoid mock for Jest environments that don't support ESM nanoid. */
let counter = 0;
function nanoid() {
  return `mock-nanoid-${++counter}`;
}
module.exports = { nanoid };
