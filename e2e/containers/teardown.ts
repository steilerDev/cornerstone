import { readFile } from 'fs/promises';
import { DockerClient } from 'testcontainers';
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

    const dockerClient = new DockerClient();

    // Stop Cornerstone app container
    console.log('⏹️  Stopping Cornerstone app...');
    try {
      await dockerClient.container.stop(state.cornerstoneContainerId);
      await dockerClient.container.remove(state.cornerstoneContainerId);
      console.log('✅ Cornerstone app stopped');
    } catch (error) {
      console.warn('⚠️  Failed to stop Cornerstone app:', error);
    }

    // Stop OIDC server container
    console.log('⏹️  Stopping OIDC server...');
    try {
      await dockerClient.container.stop(state.oidcContainerId);
      await dockerClient.container.remove(state.oidcContainerId);
      console.log('✅ OIDC server stopped');
    } catch (error) {
      console.warn('⚠️  Failed to stop OIDC server:', error);
    }

    // Stop proxy container
    console.log('⏹️  Stopping reverse proxy...');
    try {
      await dockerClient.container.stop(state.proxyContainerId);
      await dockerClient.container.remove(state.proxyContainerId);
      console.log('✅ Reverse proxy stopped');
    } catch (error) {
      console.warn('⚠️  Failed to stop reverse proxy:', error);
    }

    // Remove Docker network
    console.log('🗑️  Removing Docker network...');
    try {
      await dockerClient.network.remove(state.networkId);
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
