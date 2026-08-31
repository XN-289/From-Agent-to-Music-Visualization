import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedSongBundle } from './media-output';
import type { VisualRecipe } from './visual-recipe';

const mocks = vi.hoisted(() => ({
  loadPersistedSong: vi.fn(),
  checkFoliaStage: vi.fn(),
  pushSongToFolia: vi.fn(),
  dbSelect: vi.fn(),
  dbUpdate: vi.fn(),
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/db', async () => {
  return {
    db: {
      select: mocks.dbSelect,
      update: mocks.dbUpdate,
    },
    schema: {
      songs: {
        id: 'songs.id',
        status: 'songs.status',
        variants: 'songs.variants',
        visualRecipe: 'songs.visual_recipe',
        updatedAt: 'songs.updated_at',
      },
      generationJobs: {
        songId: 'generation_jobs.song_id',
        providerId: 'generation_jobs.provider_id',
      },
    },
  };
});

vi.mock('@/lib/media-output', () => ({
  loadPersistedSong: mocks.loadPersistedSong,
  persistGeneratedSong: vi.fn(),
}));

vi.mock('@/lib/folia-stage', () => ({
  checkFoliaStage: mocks.checkFoliaStage,
  pushSongToFolia: mocks.pushSongToFolia,
  foliaWebUrl: () => 'http://folia.test',
}));

import { deliverSong, queueAutoDelivery } from './song-delivery';

const bundle = {
  audioPaths: [{ variantId: 'v1', path: 'audio.wav', url: 'mock://audio' }],
} as LoadedSongBundle;

const recipe: VisualRecipe = {
  id: 'rain-window',
  intensity: 40,
  temperature: -8,
  chorusImpact: 44,
};

const updatedAt = new Date('2026-08-31T08:00:00Z');

function updateSetToHaveStatus(status: string) {
  return expect.arrayContaining([
    expect.objectContaining({ stageDeliveryStatus: status }),
  ]);
}

function mockSongRows(rows: Array<{ visualRecipe: VisualRecipe | null; updatedAt: Date }>) {
  let calls = 0;
  mocks.dbSelect.mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation(async () => {
        const row = rows[Math.min(calls, rows.length - 1)];
        calls += 1;
        return [row];
      }),
    }),
  }));
}

beforeEach(() => {
  mocks.updates.length = 0;
  mocks.loadPersistedSong.mockResolvedValue(bundle);
  mocks.checkFoliaStage.mockResolvedValue({ available: true });
  mocks.pushSongToFolia.mockResolvedValue({
    ok: true,
    stage: {},
    foliaWebUrl: 'http://folia.test',
  });
  mockSongRows([{ visualRecipe: recipe, updatedAt }]);
  mocks.dbUpdate.mockImplementation(() => {
    const chain = {
      set(values: Record<string, unknown>) {
        mocks.updates.push(values);
        return chain;
      },
      where: vi.fn().mockImplementation(() => chain),
      returning: vi.fn().mockImplementation(() => chain),
      all: vi.fn().mockResolvedValue([{ id: 'song' }]),
    };
    return chain;
  });
});

describe('deliverSong stage delivery state', () => {
  it('does not change delivery state when only persisting locally', async () => {
    await deliverSong('song-local', { pushToFolia: false });

    expect(mocks.checkFoliaStage).not.toHaveBeenCalled();
    expect(mocks.updates).toEqual([]);
  });

  it('records needs_retry when Stage is unavailable', async () => {
    mocks.checkFoliaStage.mockResolvedValue({
      available: false,
      error: 'fetch failed',
    });

    const result = await deliverSong('song-down');

    expect(result.stageSkippedReason).toBe('fetch failed');
    expect(mocks.pushSongToFolia).not.toHaveBeenCalled();
    expect(mocks.updates).toEqual(
      updateSetToHaveStatus('needs_retry'),
    );
  });

  it('records pushed and sends the persisted visual recipe', async () => {
    const result = await deliverSong('song-ok');

    expect(result.stage?.ok).toBe(true);
    expect(mocks.pushSongToFolia).toHaveBeenCalledWith(bundle, recipe);
    expect(mocks.updates).toEqual(updateSetToHaveStatus('pushed'));
  });

  it('does not report pushed when the recipe changes during an upload', async () => {
    const nextRecipe = { ...recipe, intensity: recipe.intensity + 10 };
    mockSongRows([
      { visualRecipe: recipe, updatedAt },
      { visualRecipe: nextRecipe, updatedAt: new Date(updatedAt.getTime() + 1000) },
    ]);
    let resolvePush!: (value: { ok: boolean }) => void;
    mocks.pushSongToFolia.mockReturnValue(
      new Promise((resolve) => {
        resolvePush = resolve;
      }),
    );

    const pending = deliverSong('song-stale-recipe');
    await vi.waitFor(() => expect(mocks.pushSongToFolia).toHaveBeenCalled());
    resolvePush({ ok: true });
    const result = await pending;

    expect(result.stageDeliveryStatus).toBe('needs_retry');
    expect(result.stageDeliveryError).toBe('视觉配方在推送期间更新，请重推当前配方');
    expect(mocks.updates.at(-1)).toEqual(
      expect.objectContaining({ stageDeliveryStatus: 'needs_retry' }),
    );
  });

  it('records needs_retry when Stage rejects the session', async () => {
    mocks.pushSongToFolia.mockResolvedValue({
      ok: false,
      error: 'invalid token',
      foliaWebUrl: 'http://folia.test',
    });

    const result = await deliverSong('song-rejected');

    expect(result.stage?.ok).toBe(false);
    expect(mocks.updates).toEqual(updateSetToHaveStatus('needs_retry'));
  });
});

describe('queueAutoDelivery', () => {
  it('keeps generation delivery non-blocking and records retry state', async () => {
    mocks.checkFoliaStage.mockResolvedValue({
      available: false,
      error: 'Stage down',
    });

    queueAutoDelivery('song-queued');

    await vi.waitFor(() => {
      expect(mocks.updates).toEqual(updateSetToHaveStatus('needs_retry'));
    });
  });
});
