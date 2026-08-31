import type { StageAppearanceSnapshot, StageMediaSession } from '../types';

export interface StageAppearanceSessionState {
    appliedSessionKey: string | null;
    localAppearance: StageAppearanceSnapshot | null;
}

export type StageAppearanceDecision =
    | { type: 'idle'; state: StageAppearanceSessionState }
    | { type: 'apply'; state: StageAppearanceSessionState }
    | { type: 'restore'; state: StageAppearanceSessionState; appearance: StageAppearanceSnapshot };

export interface StageAppearanceSessionInput {
    currentAppearance: StageAppearanceSnapshot;
    isDaylight: boolean;
    session: StageMediaSession | null;
    state: StageAppearanceSessionState;
}

export const initialStageAppearanceSessionState: StageAppearanceSessionState = {
    appliedSessionKey: null,
    localAppearance: null,
};

export const selectStageAppearanceTheme = (
    appearance: StageAppearanceSnapshot,
    isDaylight: boolean,
) => (isDaylight ? appearance.themes.light : appearance.themes.dark);

const buildStageAppearanceSessionKey = (
    session: StageMediaSession | null,
    isDaylight: boolean,
) => {
    if (!session) {
        return 'stage::closed';
    }

    return [
        'stage::media',
        session.id,
        session.updatedAt,
        isDaylight ? 'light' : 'dark',
    ].join('::');
};

export const resolveStageAppearanceDecision = ({
    currentAppearance,
    isDaylight,
    session,
    state,
}: StageAppearanceSessionInput): StageAppearanceDecision => {
    const sessionKey = buildStageAppearanceSessionKey(session, isDaylight);
    if (state.appliedSessionKey === sessionKey) {
        return { type: 'idle', state };
    }

    if (!session?.visualConfig) {
        if (!state.localAppearance) {
            return {
                type: 'idle',
                state: { ...state, appliedSessionKey: sessionKey },
            };
        }

        return {
            type: 'restore',
            state: {
                appliedSessionKey: sessionKey,
                localAppearance: null,
            },
            appearance: state.localAppearance,
        };
    }

    return {
        type: 'apply',
        state: {
            appliedSessionKey: sessionKey,
            localAppearance: state.localAppearance ?? { ...currentAppearance },
        },
    };
};
