import { describe, expect, it, vi } from 'vitest';
import { applyAudioSourceTransition } from '../../../src/utils/audioSourceTransition';

function createAudioElement(currentTime = 12) {
    return {
        currentTime,
        pause: vi.fn(),
        load: vi.fn(),
        removeAttribute: vi.fn(),
    };
}

describe('applyAudioSourceTransition', () => {
    it('stops and resets the selected media resource when the source is cleared', () => {
        const audioElement = createAudioElement();

        applyAudioSourceTransition(audioElement, 'http://127.0.0.1:32108/stage/media/current/audio', null);

        expect(audioElement.pause).toHaveBeenCalledTimes(1);
        expect(audioElement.currentTime).toBe(0);
        expect(audioElement.removeAttribute).toHaveBeenCalledWith('src');
        expect(audioElement.load).toHaveBeenCalledTimes(1);
    });

    it('keeps the existing source-change behavior', () => {
        const audioElement = createAudioElement();

        applyAudioSourceTransition(audioElement, 'old:///song.wav', 'http://127.0.0.1:32108/stage/media/current/audio');

        expect(audioElement.pause).toHaveBeenCalledTimes(1);
        expect(audioElement.load).toHaveBeenCalledTimes(1);
        expect(audioElement.currentTime).toBe(12);
    });

    it('does not reset an untouched element', () => {
        const audioElement = createAudioElement();

        applyAudioSourceTransition(audioElement, 'http://example.test/song.wav', 'http://example.test/song.wav');

        expect(audioElement.pause).not.toHaveBeenCalled();
        expect(audioElement.load).not.toHaveBeenCalled();
        expect(audioElement.currentTime).toBe(12);
    });
});
