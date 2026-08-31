import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import type { RefObject } from 'react';
import type { MotionValue } from 'framer-motion';
import type { SongResult } from '../types';
import type { RemoteControlCommand } from '../types/remoteControl';
import type {
    BatchVideoExportJob,
    BatchVideoExportOutput,
    VideoExportPreset,
    VideoExportState,
} from '../types/videoExport';
import { idleVideoExportState } from '../types/videoExport';
import {
    buildDefaultVideoExportFileName,
    getAudioElementCaptureStream,
    getMainWindowVideoCaptureStream,
    getVideoExportRecorderOptions,
    getSupportedVideoExportFormat,
    installVideoExportCursorGuard,
    stopMediaStream,
    wait,
} from '../services/electronVideoExport';

// src/hooks/useElectronVideoExportController.ts
// Records the real player window so audio.currentTime remains the single animation clock.
type UseElectronVideoExportControllerOptions = {
    t: (key: string) => string;
    isElectronWindow: boolean;
    audioRef: RefObject<HTMLAudioElement | null>;
    currentTime: MotionValue<number>;
    duration: number;
    currentSong: SongResult | null;
    setIsPlayerChromeHidden: React.Dispatch<React.SetStateAction<boolean>>;
    setIsPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
    navigateToPlayer: () => void;
    pausePlayback: () => void;
    resumePlayback: () => Promise<void>;
};

const COUNTDOWN_SECONDS = 3;

const toArrayBuffer = (blob: Blob) => blob.arrayBuffer();

export const useElectronVideoExportController = ({
    t,
    isElectronWindow,
    audioRef,
    currentTime,
    duration,
    currentSong,
    setIsPlayerChromeHidden,
    setIsPanelOpen,
    navigateToPlayer,
    pausePlayback,
    resumePlayback,
}: UseElectronVideoExportControllerOptions) => {
    const [exportState, setExportState] = useState<VideoExportState>(idleVideoExportState);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const cancelRequestedRef = useRef(false);
    const runningRef = useRef(false);

    const stopActiveExport = useCallback((discard: boolean) => {
        cancelRequestedRef.current = discard;
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== 'inactive') {
            recorder.stop();
        }
    }, []);

    const startExport = useCallback(async (preset: VideoExportPreset, startMode: 'from-start' | 'current') => {
        if (!isElectronWindow || runningRef.current) {
            return;
        }

        const audioElement = audioRef.current;
        if (!audioElement || !currentSong) {
            setExportState({
                ...idleVideoExportState(),
                status: 'error',
                presetId: preset.id,
                error: t('export.noRecordableContent'),
            });
            return;
        }

        const electron = window.electron;
        if (!electron?.chooseVideoExportPath || !electron.getMainWindowCaptureSource || !electron.prepareVideoExportWindow || !electron.restoreVideoExportWindow || !electron.writeVideoExportFile) {
            setExportState({
                ...idleVideoExportState(),
                status: 'error',
                presetId: preset.id,
                error: t('export.windowRecordingUnsupported'),
            });
            return;
        }

        runningRef.current = true;
        cancelRequestedRef.current = false;
        let videoStream: MediaStream | null = null;
        let audioStream: MediaStream | null = null;
        let combinedStream: MediaStream | null = null;
        let progressIntervalId: number | null = null;
        let endedListener: (() => void) | null = null;
        let removeCursorGuard: (() => void) | null = null;
        const wasPaused = audioElement.paused;
        const previousLoop = audioElement.loop;
        const previousTime = audioElement.currentTime;

        try {
            const exportFormat = getSupportedVideoExportFormat();
            if (!exportFormat) {
                throw new Error(t('export.noExportCodec'));
            }

            const saveResult = await electron.chooseVideoExportPath(
                buildDefaultVideoExportFileName(currentSong, preset, exportFormat.extension),
                exportFormat.extension,
                exportFormat.displayName,
            );
            if (saveResult.canceled || !saveResult.filePath) {
                setExportState(idleVideoExportState());
                return;
            }

            const exportStartTime = startMode === 'from-start' ? 0 : Math.max(0, audioElement.currentTime);
            const safeDuration = Number.isFinite(duration) && duration > 0
                ? duration
                : audioElement.duration;
            const exportDuration = Number.isFinite(safeDuration) && safeDuration > exportStartTime
                ? safeDuration - exportStartTime
                : 0;

            setExportState({
                status: 'preparing',
                presetId: preset.id,
                progress: 0,
                elapsed: 0,
                duration: exportDuration,
                countdown: null,
                filePath: saveResult.filePath,
                error: null,
            });

            navigateToPlayer();
            setIsPanelOpen(false);
            setIsPlayerChromeHidden(true);
            removeCursorGuard = installVideoExportCursorGuard();
            pausePlayback();
            audioElement.pause();
            audioElement.loop = false;

            if (startMode === 'from-start') {
                audioElement.currentTime = 0;
                currentTime.set(0);
            }

            const prepared = await electron.prepareVideoExportWindow({ width: preset.width, height: preset.height });
            if (!prepared) {
                throw new Error(t('export.windowResizeFailed'));
            }
            await wait(300);
            videoStream = await getMainWindowVideoCaptureStream(preset);
            audioStream = getAudioElementCaptureStream(audioElement);
            combinedStream = new MediaStream([
                ...videoStream.getVideoTracks(),
                ...audioStream.getAudioTracks(),
            ]);

            for (let remaining = COUNTDOWN_SECONDS; remaining > 0; remaining -= 1) {
                setExportState(prev => ({
                    ...prev,
                    status: 'countdown',
                    countdown: remaining,
                }));
                await wait(1000);
                if (cancelRequestedRef.current) {
                    throw new Error(t('export.recordingCancelled'));
                }
            }

            const chunks: Blob[] = [];
            const recorder = new MediaRecorder(combinedStream, getVideoExportRecorderOptions(preset, exportFormat));
            recorderRef.current = recorder;
            const stopped = new Promise<void>((resolve, reject) => {
                recorder.ondataavailable = event => {
                    if (event.data.size > 0) {
                        chunks.push(event.data);
                    }
                };
                recorder.onerror = () => reject(new Error(t('export.recorderUnknownError')));
                recorder.onstop = () => resolve();
            });
            const requestStop = () => {
                if (recorder.state !== 'inactive') {
                    recorder.stop();
                }
            };
            endedListener = requestStop;
            audioElement.addEventListener('ended', requestStop, { once: true });

            recorder.start(1000);
            setExportState(prev => ({
                ...prev,
                status: 'recording',
                countdown: null,
            }));
            await resumePlayback();

            progressIntervalId = window.setInterval(() => {
                const elapsed = Math.max(0, audioElement.currentTime - exportStartTime);
                const progress = exportDuration > 0 ? Math.min(1, elapsed / exportDuration) : 0;
                setExportState(prev => ({
                    ...prev,
                    status: 'recording',
                    elapsed,
                    progress,
                }));

                if (exportDuration > 0 && elapsed >= exportDuration - 0.12) {
                    requestStop();
                }
            }, 250);

            await stopped;

            if (progressIntervalId !== null) {
                window.clearInterval(progressIntervalId);
                progressIntervalId = null;
            }

            if (cancelRequestedRef.current) {
                setExportState(idleVideoExportState());
                return;
            }

            setExportState(prev => ({
                ...prev,
                status: 'finalizing',
                progress: 1,
                elapsed: exportDuration,
            }));
            const blob = new Blob(chunks, { type: exportFormat.mimeType });
            await electron.writeVideoExportFile(saveResult.filePath, await toArrayBuffer(blob));
            setExportState(prev => ({
                ...prev,
                status: 'done',
                progress: 1,
                elapsed: exportDuration,
                filePath: saveResult.filePath,
            }));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setExportState({
                ...idleVideoExportState(),
                status: cancelRequestedRef.current ? 'idle' : 'error',
                presetId: preset.id,
                error: cancelRequestedRef.current ? null : message,
            });
        } finally {
            if (progressIntervalId !== null) {
                window.clearInterval(progressIntervalId);
            }
            if (endedListener) {
                audioElement.removeEventListener('ended', endedListener);
            }
            recorderRef.current = null;
            stopMediaStream(videoStream);
            stopMediaStream(audioStream);
            stopMediaStream(combinedStream);
            audioElement.loop = previousLoop;
            if (wasPaused) {
                audioElement.pause();
                audioElement.currentTime = previousTime;
                currentTime.set(previousTime);
            }
            setIsPlayerChromeHidden(false);
            removeCursorGuard?.();
            void electron.restoreVideoExportWindow();
            runningRef.current = false;
            cancelRequestedRef.current = false;
        }
    }, [audioRef, currentSong, currentTime, duration, isElectronWindow, navigateToPlayer, pausePlayback, resumePlayback, setIsPanelOpen, setIsPlayerChromeHidden]);

    const startBatchExport = useCallback(async (job: BatchVideoExportJob) => {
        const electron = window.electron;
        const localError = (message: string) => {
            setExportState({
                ...idleVideoExportState(),
                status: 'error',
                error: message,
            });
        };
        const failPrecondition = async (reason: string, message: string) => {
            localError(message);
            console.warn('[Stage Export] Precondition failed.', {
                jobId: job.id,
                reason,
            });
            try {
                await electron?.updateStageExportJob?.({
                    jobId: job.id,
                    status: 'failed',
                    outputs: [],
                    error: `Export precondition failed: ${reason}`,
                });
            } catch (error) {
                console.warn('[Stage Export] Failed to report precondition failure.', error);
            }
        };

        if (!isElectronWindow || runningRef.current) {
            await failPrecondition(
                !isElectronWindow ? 'not-electron-window' : 'another-export-is-running',
                t('export.windowRecordingUnsupported'),
            );
            return;
        }

        const audioElement = audioRef.current;
        if (!audioElement || !currentSong) {
            localError(t('export.noRecordableContent'));
            return;
        }

        if (
            !electron?.getMainWindowCaptureSource ||
            !electron.prepareVideoExportWindow ||
            !electron.restoreVideoExportWindow ||
            !electron.writeVideoExportFile ||
            !electron.updateStageExportJob
        ) {
            await failPrecondition('electron-export-api-unavailable', t('export.windowRecordingUnsupported'));
            return;
        }

        const stageSong = currentSong as SongResult & {
            isStage?: boolean;
            stageData?: { id?: string; durationMs?: number | null } | null;
        };
        if (!stageSong.isStage || stageSong.stageData?.id !== job.sessionId) {
            await failPrecondition(
                !stageSong.isStage
                    ? 'current-song-is-not-stage-media'
                    : `stage-session-mismatch:${stageSong.stageData?.id ?? 'none'}:${job.sessionId}`,
                t('export.noRecordableContent'),
            );
            return;
        }

        const currentDurationMs = stageSong.stageData?.durationMs ?? currentSong.durationMs;
        if (
            !Number.isFinite(currentDurationMs) ||
            currentDurationMs <= 0 ||
            Math.abs(currentDurationMs / 1000 - job.duration) > 0.25
        ) {
            await failPrecondition(
                `duration-mismatch:${currentDurationMs ?? 'none'}:${Math.round(job.duration * 1000)}`,
                t('export.noRecordableContent'),
            );
            return;
        }

        const exportFormat = getSupportedVideoExportFormat();
        if (!exportFormat) {
            await failPrecondition('mp4-h264-aac-codec-unavailable', t('export.noExportCodec'));
            return;
        }

        runningRef.current = true;
        cancelRequestedRef.current = false;
        const outputs: BatchVideoExportOutput[] = [];
        const wasPaused = audioElement.paused;
        const previousLoop = audioElement.loop;
        const previousTime = audioElement.currentTime;
        let videoStream: MediaStream | null = null;
        let audioStream: MediaStream | null = null;
        let combinedStream: MediaStream | null = null;
        let progressIntervalId: number | null = null;
        let endedListener: (() => void) | null = null;
        let removeCursorGuard: (() => void) | null = null;

        const updateJob = electron.updateStageExportJob.bind(electron);
        const updateRunning = async (
            phase: BatchVideoExportJob['phase'],
            orientation: BatchVideoExportJob['orientation'],
            progress: number,
            elapsed: number,
        ) => {
            await updateJob({
                jobId: job.id,
                status: 'running',
                phase,
                orientation,
                progress,
                elapsed,
                outputs,
            });
        };

        try {
            setExportState({
                ...idleVideoExportState(),
                status: 'preparing',
                duration: job.duration * 2,
                filePath: job.outputDirectory,
            });

            navigateToPlayer();
            setIsPanelOpen(false);
            setIsPlayerChromeHidden(true);
            removeCursorGuard = installVideoExportCursorGuard();
            audioElement.loop = false;

            for (let segmentIndex = 0; segmentIndex < job.outputs.length; segmentIndex += 1) {
                const target = job.outputs[segmentIndex];
                const preset: VideoExportPreset = {
                    id: `batch-${target.orientation}`,
                    label: target.orientation === 'landscape' ? 'Landscape MP4' : 'Portrait MP4',
                    width: target.width,
                    height: target.height,
                    orientation: target.orientation,
                };
                const segmentProgress = (phase: 'preparing' | 'recording' | 'finalizing', value: number) => {
                    const progress = (segmentIndex + value) / job.outputs.length;
                    const elapsed = segmentIndex * job.duration + value * job.duration;
                    setExportState(prev => ({
                        ...prev,
                        status: phase,
                        presetId: preset.id,
                        countdown: null,
                        progress,
                        elapsed,
                    }));
                    return { progress, elapsed };
                };

                await updateRunning('preparing', target.orientation, segmentIndex / job.outputs.length, segmentIndex * job.duration);
                segmentProgress('preparing', 0);
                pausePlayback();
                audioElement.pause();
                audioElement.currentTime = 0;
                currentTime.set(0);

                const prepared = await electron.prepareVideoExportWindow({
                    width: target.width,
                    height: target.height,
                });
                if (!prepared) throw new Error(t('export.windowResizeFailed'));
                if (cancelRequestedRef.current) throw new Error(t('export.recordingCancelled'));

                videoStream = await getMainWindowVideoCaptureStream(preset);
                audioStream = getAudioElementCaptureStream(audioElement);
                combinedStream = new MediaStream([
                    ...videoStream.getVideoTracks(),
                    ...audioStream.getAudioTracks(),
                ]);

                for (let remaining = COUNTDOWN_SECONDS; remaining > 0; remaining -= 1) {
                    await updateRunning('countdown', target.orientation, segmentIndex / job.outputs.length, segmentIndex * job.duration);
                    setExportState(prev => ({
                        ...prev,
                        status: 'countdown',
                        presetId: preset.id,
                        countdown: remaining,
                    }));
                    await wait(1000);
                    if (cancelRequestedRef.current) throw new Error(t('export.recordingCancelled'));
                }

                const chunks: Blob[] = [];
                const recorder = new MediaRecorder(combinedStream, getVideoExportRecorderOptions(preset, exportFormat));
                recorderRef.current = recorder;
                const stopped = new Promise<void>((resolve, reject) => {
                    recorder.ondataavailable = event => {
                        if (event.data.size > 0) chunks.push(event.data);
                    };
                    recorder.onerror = () => reject(new Error(t('export.recorderUnknownError')));
                    recorder.onstop = () => resolve();
                });
                const requestStop = () => {
                    if (recorder.state !== 'inactive') recorder.stop();
                };
                endedListener = requestStop;
                audioElement.addEventListener('ended', requestStop, { once: true });

                recorder.start(1000);
                const recordingStart = {
                    progress: segmentIndex / job.outputs.length,
                    elapsed: segmentIndex * job.duration,
                };
                await updateRunning('recording', target.orientation, recordingStart.progress, recordingStart.elapsed);
                segmentProgress('recording', 0);
                await resumePlayback();

                progressIntervalId = window.setInterval(() => {
                    const elapsed = Math.max(0, audioElement.currentTime);
                    const value = Math.min(1, elapsed / job.duration);
                    const next = segmentProgress('recording', value);
                    void updateRunning('recording', target.orientation, next.progress, next.elapsed);
                    if (elapsed >= job.duration - 0.12) requestStop();
                }, 250);

                await stopped;
                if (progressIntervalId !== null) {
                    window.clearInterval(progressIntervalId);
                    progressIntervalId = null;
                }
                if (cancelRequestedRef.current) throw new Error(t('export.recordingCancelled'));

                const finalizing = segmentProgress('finalizing', 1);
                await updateRunning('finalizing', target.orientation, finalizing.progress, finalizing.elapsed);
                const blob = new Blob(chunks, { type: exportFormat.mimeType });
                if (blob.size === 0) throw new Error(t('export.recorderUnknownError'));
                await electron.writeVideoExportFile(target.filePath, await toArrayBuffer(blob));
                outputs.push({
                    orientation: target.orientation,
                    width: target.width,
                    height: target.height,
                    fileName: target.fileName,
                    filePath: target.filePath,
                    sizeBytes: blob.size,
                });
                await updateRunning('finalizing', target.orientation, finalizing.progress, finalizing.elapsed);

                stopMediaStream(videoStream);
                stopMediaStream(audioStream);
                stopMediaStream(combinedStream);
                videoStream = null;
                audioStream = null;
                combinedStream = null;
                if (endedListener) {
                    audioElement.removeEventListener('ended', endedListener);
                    endedListener = null;
                }
                recorderRef.current = null;
                audioElement.pause();
            }

            await updateJob({
                jobId: job.id,
                status: 'succeeded',
                outputs,
            });
            setExportState(prev => ({
                ...prev,
                status: 'done',
                progress: 1,
                elapsed: job.duration * 2,
                filePath: job.outputDirectory,
                error: null,
            }));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await updateJob({
                jobId: job.id,
                status: cancelRequestedRef.current ? 'cancelled' : 'failed',
                outputs,
                error: cancelRequestedRef.current ? null : message,
            }).catch(() => undefined);
            setExportState(cancelRequestedRef.current
                ? idleVideoExportState()
                : {
                    ...idleVideoExportState(),
                    status: 'error',
                    error: message,
                });
        } finally {
            if (progressIntervalId !== null) window.clearInterval(progressIntervalId);
            if (endedListener) audioElement.removeEventListener('ended', endedListener);
            recorderRef.current = null;
            stopMediaStream(videoStream);
            stopMediaStream(audioStream);
            stopMediaStream(combinedStream);
            audioElement.loop = previousLoop;
            if (wasPaused) {
                audioElement.pause();
                audioElement.currentTime = previousTime;
                currentTime.set(previousTime);
            }
            setIsPlayerChromeHidden(false);
            removeCursorGuard?.();
            void electron.restoreVideoExportWindow();
            runningRef.current = false;
            cancelRequestedRef.current = false;
        }
    }, [audioRef, currentSong, currentTime, isElectronWindow, navigateToPlayer, pausePlayback, resumePlayback, setIsPanelOpen, setIsPlayerChromeHidden, t]);

    const handleExportCommand = useCallback((command: RemoteControlCommand) => {
        if (command.type === 'start-export') {
            void startExport(command.preset, command.startMode);
            return true;
        }

        if (command.type === 'start-batch-export') {
            void startBatchExport(command.job);
            return true;
        }

        if (command.type === 'cancel-batch-export') {
            stopActiveExport(true);
            return true;
        }

        if (command.type === 'stop-export') {
            stopActiveExport(false);
            return true;
        }

        if (command.type === 'cancel-export') {
            stopActiveExport(true);
            return true;
        }

        return false;
    }, [startBatchExport, startExport, stopActiveExport]);

    // Automatically reset export status back to 'idle' after completion (3s) or error (4s)
    useEffect(() => {
        if (exportState.status === 'done') {
            const timer = window.setTimeout(() => {
                setExportState(prev => prev.status === 'done' ? idleVideoExportState() : prev);
            }, 3000);
            return () => window.clearTimeout(timer);
        }
        if (exportState.status === 'error') {
            const timer = window.setTimeout(() => {
                setExportState(prev => prev.status === 'error' ? idleVideoExportState() : prev);
            }, 4000);
            return () => window.clearTimeout(timer);
        }
    }, [exportState.status]);

    useEffect(() => () => {
        stopActiveExport(true);
    }, [stopActiveExport]);

    return {
        exportState,
        handleExportCommand,
    };
};
