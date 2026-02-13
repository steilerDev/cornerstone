import { readFile, writeFile, mkdir } from 'fs/promises';
import { execSync } from 'child_process';
import type { ContainerState } from './setup.js';

const STATE_FILE_PATH = 'e2e/test-results/.state/containers.json';
const LOGS_DIR = 'e2e/playwright-output/container-logs';

/**
 * Playwright global teardown function.
 * Captures container logs for debugging, then stops all containers and removes the Docker network.
 */
export default async function globalTeardown(): Promise<void> {
  console.log('🧹 Cleaning up E2E test containers...');

  try {
    // Read container state
    const stateJson = await readFile(STATE_FILE_PATH, 'utf-8');
    const state: ContainerState = JSON.parse(stateJson);

    const containers = [
      { id: state.cornerstoneContainerId, name: 'cornerstone' },
      { id: state.oidcContainerId, name: 'oidc' },
      { id: state.proxyContainerId, name: 'proxy' },
    ];

    // Capture container logs before stopping (for CI debugging)
    console.log('📋 Capturing container logs...');
    try {
      await mkdir(LOGS_DIR, { recursive: true });
      for (const { id, name } of containers) {
        try {
          const logs = execSync(`docker logs ${id} 2>&1`, {
            encoding: 'utf-8',
            maxBuffer: 1024 * 1024,
          });
          await writeFile(`${LOGS_DIR}/${name}.log`, logs);
          console.log(`📋 ${name} logs saved (${logs.length} bytes)`);
        } catch {
          console.warn(`⚠️  Failed to capture ${name} logs`);
        }
      }
    } catch {
      console.warn('⚠️  Failed to create logs directory');
    }

    // Stop and remove containers using Docker CLI
    for (const { id, name } of containers) {
      console.log(`⏹️  Stopping ${name}...`);
      try {
        execSync(`docker rm -f ${id}`, { stdio: 'pipe' });
        console.log(`✅ ${name} stopped`);
      } catch (error) {
        console.warn(`⚠️  Failed to stop ${name}:`, error);
      }
    }

    // Remove Docker network
    console.log('🗑️  Removing Docker network...');
    try {
      execSync(`docker network rm ${state.networkId}`, { stdio: 'pipe' });
      console.log('✅ Docker network removed');
    } catch (error) {
      console.warn('⚠️  Failed to remove Docker network:', error);
    }

    console.log('✅ E2E cleanup complete');
  } catch (error) {
    console.error('❌ Failed to clean up E2E containers:', error);
    // Don't throw - allow tests to finish even if cleanup fails
  }
}
