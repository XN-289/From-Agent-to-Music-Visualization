import { describe, expect, it } from 'vitest';
import {
    clearStageStatusEntries,
    STAGE_STATUS_DISCONNECT_FAILURE_THRESHOLD,
} from '@/utils/appStageHelpers';
import type { StageStatus } from '@/types';

const createStatus = (hasSession: boolean): StageStatus => ({
    enabled: true,
    modeEnabled: true,
    source: 'stage-api',
    port: 32108,
    token: 'token',
    activeEntryKind: hasSession ? 'media' : null,
    lyricsSession: null,
    mediaSession: hasSession ? {
        id: 'session',
        title: 'Session',
        artist: 'Artist',
        audioSrc: 'audio',
        visualConfig: null,
        updatedAt: 1,
    } : null,
});

describe('app stage helpers', () => {
    it('clears stale sessions after repeated Stage disconnects', () => {
        const status = createStatus(true);
        const cleared = clearStageStatusEntries(status);

        expect(cleared).not.toBe(status);
        expect(cleared).toMatchObject({
            enabled: true,
            modeEnabled: true,
            source: 'stage-api',
            port: 32108,
            token: 'token',
            activeEntryKind: null,
            lyricsSession: null,
            mediaSession: null,
        });
    });

    it('keeps an already-empty status stable and uses a short retry window', () => {
        const status = createStatus(false);

        expect(clearStageStatusEntries(status)).toBe(status);
        expect(STAGE_STATUS_DISCONNECT_FAILURE_THRESHOLD).toBe(3);
    });
});
