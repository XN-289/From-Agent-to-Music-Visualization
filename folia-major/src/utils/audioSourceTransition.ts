interface AudioElementLike {
    currentTime: number;
    pause(): void;
    load(): void;
    removeAttribute(name: 'src'): void;
}

export const applyAudioSourceTransition = (
    audioElement: AudioElementLike | null,
    previousSrc: string | null,
    nextSrc: string | null,
) => {
    if (!audioElement) {
        return;
    }

    if (!nextSrc) {
        if (previousSrc) {
            audioElement.pause();
            audioElement.currentTime = 0;
            audioElement.removeAttribute('src');
            audioElement.load();
        }
        return;
    }

    if (previousSrc && previousSrc !== nextSrc) {
        audioElement.pause();
        audioElement.load();
    }
};
