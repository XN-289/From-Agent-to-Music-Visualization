import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('MockSunoProvider', () => {
  let originalCwd: string;
  let dir: string;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    originalCwd = process.cwd();
    dir = await mkdtemp(path.join(os.tmpdir(), 'mock-provider-'));
    process.chdir(dir);
    process.env.SUNO_PROVIDER = 'mock';
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (...args) => {
      throw new Error(`Blocked external request: ${String(args[0])}`);
    });
  });

  afterEach(async () => {
    fetchSpy.mockRestore();
    delete process.env.SUNO_PROVIDER;
    process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
  });

  it('generates local WAV output without any network request', async () => {
    const { MockSunoProvider } = await import('./mock');
    const provider = new MockSunoProvider();
    const { jobId } = await provider.generateMusic({
      title: '本地 Mock',
      lyrics: '[Verse]\n本地合成\n\n[Chorus]\n不访问网络',
      styleTags: ['pop', 'calm'],
    });

    let job = await provider.getJob(jobId);
    for (let attempt = 0; attempt < 100 && job.status !== 'success' && job.status !== 'failed'; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      job = await provider.getJob(jobId);
    }

    expect(job.status).toBe('success');
    expect(job.result?.[0].audioUrl).toMatch(/^\/generated\//);
    expect(fetchSpy).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 600));
  }, 15_000);
});
