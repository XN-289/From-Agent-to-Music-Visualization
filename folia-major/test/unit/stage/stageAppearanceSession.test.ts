// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
    initialStageAppearanceSessionState,
    resolveStageAppearanceDecision,
    selectStageAppearanceTheme,
} from '@/services/stageAppearanceSession';
import { useThemeController } from '@/hooks/useThemeController';
import { useSettingsUiStore } from '@/stores/useSettingsUiStore';
import type { StageAppearanceSnapshot, StageMediaSession, StageVisualConfig, Theme } from '@/types';

const localTheme: Theme = {
    name: 'Local theme',
    backgroundColor: '#101010',
    primaryColor: '#101010',
    accentColor: '#101010',
    secondaryColor: '#101010',
    fontStyle: 'sans',
    animationIntensity: 'normal',
};

const recipeTheme: Theme = {
    name: 'Recipe theme',
    backgroundColor: '#202020',
    primaryColor: '#202020',
    accentColor: '#202020',
    secondaryColor: '#202020',
    fontStyle: 'sans',
    animationIntensity: 'chaotic',
};

const daylightTheme: Theme = {
    ...localTheme,
    name: 'Local daylight theme',
    backgroundColor: '#303030',
    primaryColor: '#303030',
    accentColor: '#303030',
    secondaryColor: '#303030',
};

const localAppearance: StageAppearanceSnapshot = {
    themes: {
        light: daylightTheme,
        dark: localTheme,
    },
    visualizerMode: 'classic',
    visualizerBackgroundMode: null,
    backgroundOpacity: 0.3,
    visualizerOpacity: 0.5,
    useCoverColorBg: true,
    disableVisualizerGeometricBackground: true,
    disableVisualizerVignette: false,
};

const visualConfig: StageVisualConfig = {
    theme: {
        light: recipeTheme,
        dark: recipeTheme,
    },
    visualizerMode: 'monet',
    visualizerBackgroundMode: 'monet',
    backgroundOpacity: 0.8,
    visualizerOpacity: 1,
    useCoverColorBg: false,
    disableVisualizerGeometricBackground: true,
    disableVisualizerVignette: true,
};

const createSession = (
    id: string,
    updatedAt: number,
    config: StageVisualConfig | null = visualConfig,
): StageMediaSession => ({
    id,
    title: id,
    artist: 'Music Agent',
    audioSrc: `audio-${id}`,
    visualConfig: config,
    updatedAt,
});

const createStorage = () => {
    const values = new Map<string, string>();
    return {
        get length() {
            return values.size;
        },
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        key: (index: number) => Array.from(values.keys())[index] ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => {
            values.set(key, value);
        },
    } as Storage;
};

describe('stage appearance session', () => {
    let root: Root | null = null;

    beforeEach(() => {
        vi.stubGlobal('localStorage', createStorage());
        useSettingsUiStore.setState({
            visualizerMode: localAppearance.visualizerMode,
            visualizerBackgroundMode: localAppearance.visualizerBackgroundMode,
            backgroundOpacity: localAppearance.backgroundOpacity,
            visualizerOpacity: localAppearance.visualizerOpacity,
            useCoverColorBg: localAppearance.useCoverColorBg,
            disableVisualizerGeometricBackground: localAppearance.disableVisualizerGeometricBackground,
            disableVisualizerVignette: localAppearance.disableVisualizerVignette,
        });
        localStorage.clear();
    });

    afterEach(() => {
        if (root) {
            act(() => {
                root?.unmount();
            });
            root = null;
        }
        vi.unstubAllGlobals();
    });

    it('restores local appearance when a recipe song is followed by a recipe-less song', () => {
        let state = initialStageAppearanceSessionState;

        const songA = resolveStageAppearanceDecision({
            currentAppearance: localAppearance,
            isDaylight: false,
            session: createSession('song-a', 1),
            state,
        });
        expect(songA.type).toBe('apply');
        expect(songA.state.localAppearance).toEqual(localAppearance);
        state = songA.state;

        const songB = resolveStageAppearanceDecision({
            currentAppearance: { ...localAppearance, visualizerMode: 'monet' },
            isDaylight: false,
            session: createSession('song-b', 2, null),
            state,
        });
        expect(songB).toMatchObject({
            type: 'restore',
            appearance: localAppearance,
        });
        expect(songB.state.localAppearance).toBeNull();
        state = songB.state;

        const songAReloaded = resolveStageAppearanceDecision({
            currentAppearance: localAppearance,
            isDaylight: false,
            session: createSession('song-a', 3),
            state,
        });
        expect(songAReloaded.type).toBe('apply');
        expect(songAReloaded.state.localAppearance).toEqual(localAppearance);
    });

    it('restores local appearance when Stage is closed and ignores duplicate session updates', () => {
        let state = initialStageAppearanceSessionState;
        const session = createSession('song-a', 1);

        const applied = resolveStageAppearanceDecision({
            currentAppearance: localAppearance,
            isDaylight: false,
            session,
            state,
        });
        expect(applied.type).toBe('apply');
        state = applied.state;

        const duplicate = resolveStageAppearanceDecision({
            currentAppearance: localAppearance,
            isDaylight: false,
            session,
            state,
        });
        expect(duplicate.type).toBe('idle');
        expect(duplicate.state).toBe(state);

        const closed = resolveStageAppearanceDecision({
            currentAppearance: localAppearance,
            isDaylight: false,
            session: null,
            state,
        });
        expect(closed).toMatchObject({
            type: 'restore',
            appearance: localAppearance,
        });
        expect(closed.state.localAppearance).toBeNull();
    });

    it('restores the mode-matched local theme after daylight changes under an override', () => {
        let state = initialStageAppearanceSessionState;
        const applied = resolveStageAppearanceDecision({
            currentAppearance: localAppearance,
            isDaylight: false,
            session: createSession('song-a', 1),
            state,
        });
        expect(applied.type).toBe('apply');
        state = applied.state;

        const daylightOverride = resolveStageAppearanceDecision({
            currentAppearance: { ...localAppearance, visualizerMode: 'monet' },
            isDaylight: true,
            session: createSession('song-a', 1),
            state,
        });
        expect(daylightOverride.type).toBe('apply');
        expect(daylightOverride.state.localAppearance).toEqual(localAppearance);
        state = daylightOverride.state;

        const restored = resolveStageAppearanceDecision({
            currentAppearance: { ...localAppearance, visualizerMode: 'monet' },
            isDaylight: true,
            session: createSession('song-b', 2, null),
            state,
        });
        expect(restored.type).toBe('restore');
        if (restored.type !== 'restore') {
            throw new Error('Expected Stage appearance restore decision');
        }
        expect(selectStageAppearanceTheme(restored.appearance, true)).toBe(daylightTheme);
        expect(selectStageAppearanceTheme(restored.appearance, false)).toBe(localTheme);
    });

    it('applies and restores Stage appearance without writing preference storage', () => {
        useSettingsUiStore.getState().applyStageAppearanceOverride(visualConfig);

        expect(useSettingsUiStore.getState()).toMatchObject({
            visualizerMode: 'monet',
            visualizerBackgroundMode: 'monet',
            backgroundOpacity: 0.8,
            visualizerOpacity: 1,
            useCoverColorBg: false,
            disableVisualizerGeometricBackground: true,
            disableVisualizerVignette: true,
        });

        useSettingsUiStore.getState().restoreStageAppearanceSnapshot(localAppearance);

        expect(useSettingsUiStore.getState()).toMatchObject({
            visualizerMode: 'classic',
            visualizerBackgroundMode: null,
            backgroundOpacity: 0.3,
            visualizerOpacity: 0.5,
            useCoverColorBg: true,
            disableVisualizerGeometricBackground: true,
            disableVisualizerVignette: false,
        });
        expect(localStorage.length).toBe(0);
    });

    it('applies the Stage theme animation without persisting the animation preference', () => {
        const controllerBox: { current: ReturnType<typeof useThemeController> | null } = {
            current: null,
        };

        function StageThemeProbe() {
            const controller = useThemeController({
                defaultTheme: localTheme,
                daylightTheme: localTheme,
                isDaylight: false,
                setDaylightPreference: () => undefined,
                setStatusMsg: () => undefined,
                coverUrl: null,
                t: (key: string) => key,
            });
            controllerBox.current = controller;
            return controller.theme.animationIntensity;
        }

        const container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);

        act(() => {
            root?.render(createElement(StageThemeProbe));
        });

        const mountedController = controllerBox.current;
        if (!mountedController) {
            throw new Error('Expected mounted Stage theme controller');
        }

        expect(mountedController.theme.animationIntensity).toBe('normal');

        act(() => {
            mountedController.setStageTheme(recipeTheme);
        });

        const updatedController = controllerBox.current;
        if (!updatedController) {
            throw new Error('Expected updated Stage theme controller');
        }

        expect(updatedController.theme.animationIntensity).toBe('chaotic');
        expect(localStorage.getItem('theme_animation_intensity')).toBeNull();
    });
});
