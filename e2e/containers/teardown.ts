import { readFile } from 'fs/promises';
import { execSync } from 'child_process';
import type { ContainerState } from './setup.js';

const STATE_FILE_PATH = 'e2e/test-results/.state/containers.json';

/**
 * Playwright global teardown function.
 * Stops all containers and removes the Docker network.
 */
export default async function globalTeardown(): Promise<void> {
  console.log('🧹 Cleaning up E2E test containers...');

  try {
    // Read container state
    const stateJson = await readFile(STATE_FILE_PATH, 'utf-8');
    const state: ContainerState = JSON.parse(stateJson);

    // Stop and remove containers using Docker CLI
    const containerIds = [
      { id: state.cornerstoneContainerId, name: 'Cornerstone app' },
      { id: state.oidcContainerId, name: 'OIDC server' },
      { id: state.proxyContainerId, name: 'reverse proxy' },
    ];

    for (const { id, name } of containerIds) {
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
