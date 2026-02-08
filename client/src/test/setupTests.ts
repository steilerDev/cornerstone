// Jest setup for client tests
// Runtime: extends expect with jest-dom matchers
// Types: the triple-slash directive augments global jest.Matchers
/// <reference types="@testing-library/jest-dom" />
import '@testing-library/jest-dom/jest-globals';

// Polyfill TextEncoder/TextDecoder for jsdom (required by react-router)
import { TextEncoder, TextDecoder } from 'node:util';

Object.defineProperties(globalThis, {
  TextEncoder: { value: TextEncoder },
  TextDecoder: { value: TextDecoder },
});
