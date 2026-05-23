#!/usr/bin/env node
// Standalone diagnostic for the Cornerstone auto-itemize LLM gateway.
// Uses only Node built-ins (node:dns, native fetch). Safe to run in a no-shell
// hardened container via:
//   docker cp diagnose-llm.mjs <container>:/tmp/diagnose-llm.mjs
//   docker exec <container> node /tmp/diagnose-llm.mjs
//
// Reads the same env vars the server reads. Masks the API key in output.

import { lookup } from 'node:dns/promises';

const BASE_URL = process.env.LLM_BASE_URL;
const API_KEY = process.env.LLM_API_KEY;
const MODEL = process.env.LLM_MODEL;
const TIMEOUT_MS = Number(process.env.LLM_REQUEST_TIMEOUT_MS ?? 30000);

const mask = (s) => (s ? `${s.slice(0, 6)}...${s.slice(-4)} (length ${s.length})` : '(unset)');

function section(label) {
  console.log(`\n=== ${label} ===`);
}

function dumpError(err, indent = '  ') {
  if (!err) {
    console.log(`${indent}(no error object)`);
    return;
  }
  console.log(`${indent}name:    ${err.name ?? '(none)'}`);
  console.log(`${indent}message: ${err.message ?? '(none)'}`);
  if (err.code) console.log(`${indent}code:    ${err.code}`);
  if (err.errno) console.log(`${indent}errno:   ${err.errno}`);
  if (err.syscall) console.log(`${indent}syscall: ${err.syscall}`);
  if (err.hostname) console.log(`${indent}hostname:${err.hostname}`);
  if (err.cause) {
    console.log(`${indent}cause:`);
    dumpError(err.cause, indent + '  ');
  }
}

async function main() {
  section('Config');
  console.log(`LLM_BASE_URL:           ${BASE_URL ?? '(unset)'}`);
  console.log(`LLM_API_KEY:            ${mask(API_KEY)}`);
  console.log(`LLM_MODEL:              ${MODEL ?? '(unset)'}`);
  console.log(`LLM_REQUEST_TIMEOUT_MS: ${TIMEOUT_MS}`);
  console.log(`Node version:           ${process.version}`);
  console.log(`Platform:               ${process.platform} ${process.arch}`);
  console.log(`HTTP_PROXY:             ${process.env.HTTP_PROXY ?? '(unset)'}`);
  console.log(`HTTPS_PROXY:            ${process.env.HTTPS_PROXY ?? '(unset)'}`);
  console.log(`NO_PROXY:               ${process.env.NO_PROXY ?? '(unset)'}`);

  if (!BASE_URL || !API_KEY || !MODEL) {
    console.error('\nFATAL: one or more required env vars are unset.');
    process.exit(1);
  }

  let parsed;
  try {
    parsed = new URL(BASE_URL);
  } catch (err) {
    console.error('\nFATAL: LLM_BASE_URL is not a valid URL.');
    dumpError(err);
    process.exit(1);
  }
  const hostname = parsed.hostname;

  // -------------------------------------------------------------------------
  section(`Step 1: DNS lookup for ${hostname}`);
  try {
    const t0 = Date.now();
    const v4 = await lookup(hostname, { family: 4 }).catch((err) => ({ error: err }));
    const v6 = await lookup(hostname, { family: 6 }).catch((err) => ({ error: err }));
    const ms = Date.now() - t0;
    if (v4.error && v6.error) {
      console.log(`FAIL in ${ms}ms — no A or AAAA records resolvable.`);
      console.log('  IPv4 error:');
      dumpError(v4.error, '    ');
      console.log('  IPv6 error:');
      dumpError(v6.error, '    ');
      console.log('\nMost likely: container has no DNS resolver, or your network blocks DNS for this host.');
      process.exit(2);
    }
    console.log(`OK in ${ms}ms`);
    if (!v4.error) console.log(`  IPv4: ${v4.address}`);
    if (!v6.error) console.log(`  IPv6: ${v6.address}`);
  } catch (err) {
    console.log('FAIL:');
    dumpError(err);
    process.exit(2);
  }

  // -------------------------------------------------------------------------
  section(`Step 2: HTTPS reachability — GET ${parsed.origin}/`);
  // Anonymous GET to the root. Most APIs return 401/403/404 — we don't care,
  // we only want to confirm TCP + TLS work.
  try {
    const t0 = Date.now();
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(`${parsed.origin}/`, { method: 'GET', signal: ctrl.signal });
    clearTimeout(to);
    const ms = Date.now() - t0;
    console.log(`OK in ${ms}ms — HTTP ${res.status} ${res.statusText}`);
    console.log('  (Any HTTP response confirms TCP + TLS work. Status code does not matter here.)');
  } catch (err) {
    console.log('FAIL:');
    dumpError(err);
    console.log('\nMost likely: egress firewall blocks outbound HTTPS to this host, or TLS handshake failed.');
    console.log('Tip: HTTPS_PROXY env var? Corporate MITM proxy with its own CA?');
    process.exit(3);
  }

  // -------------------------------------------------------------------------
  const fullUrl = `${BASE_URL.replace(/\/$/, '')}/chat/completions`;
  section(`Step 3: POST ${fullUrl} (minimal echo prompt)`);
  try {
    const t0 = Date.now();
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: 'Reply with the single word: pong' }],
        max_tokens: 16,
        temperature: 0,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    const ms = Date.now() - t0;
    const text = await res.text();
    console.log(`HTTP ${res.status} ${res.statusText} in ${ms}ms`);
    console.log(`Response body (first 1500 chars):`);
    console.log(text.slice(0, 1500));
    if (!res.ok) {
      console.log('\nInterpretation:');
      if (res.status === 401 || res.status === 403) {
        console.log('  Auth failed. Check LLM_API_KEY value, header name (we use Authorization: Bearer), and that the key is allowed for this model.');
      } else if (res.status === 404) {
        console.log('  Endpoint not found. Either LLM_BASE_URL is wrong, or this provider does not expose /chat/completions at that path.');
      } else if (res.status === 400) {
        console.log('  Provider rejected the request. Check LLM_MODEL value matches an available model.');
      } else if (res.status >= 500) {
        console.log('  Upstream server-side error. Try again in a minute; if persistent, check the provider status page.');
      }
      process.exit(4);
    }
    console.log('\nOK — provider answered. Auto-itemize should work.');
  } catch (err) {
    console.log('FAIL during POST:');
    dumpError(err);
    if (err?.name === 'AbortError') {
      console.log(`\nTimed out after ${TIMEOUT_MS}ms. Try setting LLM_REQUEST_TIMEOUT_MS=60000 in env and restarting the server.`);
    }
    process.exit(4);
  }

  // -------------------------------------------------------------------------
  section(`Step 4: POST ${fullUrl} (production-shaped payload)`);
  // Mirrors what server/src/services/budgetExtraction/openAICompatibleProvider.ts
  // actually sends. The previous step proved connectivity; this step proves
  // whether the provider accepts our exact production body. Common failure mode:
  // - Anthropic requires `max_tokens`; OpenAI/Gemini make it optional.
  // - Anthropic OpenAI-compat layer historically did not support
  //   `response_format: { type: 'json_object' }`.
  // The full response body is printed verbatim so you can see the provider's
  // exact complaint.
  const SYSTEM_PROMPT_SHORT = 'You are an expert at extracting structured line items from German construction-trade invoices. Return a JSON object: { "lines": [{ "description": string, "totalAmount": number, "confidence": number }] }. Output ONLY valid JSON.';
  const USER_PROMPT_SHORT = 'Extract line items from:\n\nRechnung Nr. 123\nMaterial Kies, 2 m³, 50 EUR/m³, gesamt 100 EUR\n\nReturn { "lines": ExtractedLine[] }.';
  const productionBody = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT_SHORT },
      { role: 'user', content: USER_PROMPT_SHORT },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  };
  console.log('Request body (matches production, minus the full system prompt):');
  console.log(JSON.stringify(productionBody, null, 2));
  try {
    const t0 = Date.now();
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(productionBody),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    const ms = Date.now() - t0;
    const text = await res.text();
    console.log(`\nHTTP ${res.status} ${res.statusText} in ${ms}ms`);
    console.log(`Response body (FULL — copy this back to debug):`);
    console.log(text);
    if (!res.ok) {
      console.log('\nInterpretation:');
      console.log('  The provider responded but rejected the production-shaped body.');
      console.log('  Look at the error message above for the exact missing/invalid field.');
      console.log('  Common causes for 400 on Anthropic OpenAI-compat:');
      console.log('    - missing "max_tokens"');
      console.log('    - "response_format" not supported');
      console.log('    - model name typo (must include vendor prefix? exact version?)');
      process.exit(5);
    }
    console.log('\nOK — production-shaped payload also works. The bug is elsewhere.');
  } catch (err) {
    console.log('FAIL during production-shaped POST:');
    dumpError(err);
    process.exit(5);
  }
}

main().catch((err) => {
  console.error('\nUnexpected error in diagnostic script:');
  dumpError(err);
  process.exit(99);
});
