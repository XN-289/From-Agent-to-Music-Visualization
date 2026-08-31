import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RUNTIME_DIR = path.join(REPO_ROOT, '.runtime');
export const STATE_FILE = path.join(RUNTIME_DIR, 'studio-services.json');
export const LOG_ROOT = path.join(RUNTIME_DIR, 'logs');
export const STUDIO_URL = 'http://127.0.0.1:3003/studio';
export const STATE_SCHEMA_VERSION = 1;
export const LOG_RUNS_TO_KEEP = 10;

export const SERVICE_DEFS = Object.freeze([
  Object.freeze({
    id: 'electron-dev-server',
    label: 'Electron 开发服务',
    port: 3000,
    healthUrl: 'http://127.0.0.1:3000/',
    timeoutMs: 90_000,
    intervalMs: 1_000,
    type: 'html',
    requiredMarkers: ['<!doctype html', 'id="root"'],
  }),
  Object.freeze({
    id: 'music-agent',
    label: 'Music Agent',
    port: 3003,
    healthUrl: 'http://127.0.0.1:3003/studio',
    timeoutMs: 120_000,
    intervalMs: 1_000,
    type: 'html',
    requiredMarkers: ['<!doctype html', 'Music Agent', '__next'],
  }),
  Object.freeze({
    id: 'folia-web',
    label: 'Folia web',
    port: 3004,
    healthUrl: 'http://127.0.0.1:3004/',
    timeoutMs: 90_000,
    intervalMs: 1_000,
    type: 'html',
    requiredMarkers: ['<!doctype html', 'id="root"', 'Folia'],
  }),
  Object.freeze({
    id: 'folia-stage',
    label: 'Stage',
    port: 32107,
    healthUrl: 'http://127.0.0.1:32107/stage/health',
    timeoutMs: 120_000,
    intervalMs: 1_000,
    type: 'json',
    requiredFields: {
      enabled: true,
      modeEnabled: true,
      source: 'stage-api',
    },
  }),
]);

export const SERVICES_BY_PORT = Object.freeze(
  new Map(SERVICE_DEFS.map((service) => [service.port, service])),
);
