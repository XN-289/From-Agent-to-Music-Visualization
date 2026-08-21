import { Buffer } from 'buffer';
import { installGlobalVisualizerFrameRateLimiter } from './utils/frameRateLimiter';
import { showBootError, showBootPlaceholder } from './bootPlaceholder';

// @ts-ignore
globalThis.Buffer = Buffer;
installGlobalVisualizerFrameRateLimiter();
showBootPlaceholder();

import('./bootstrap').catch(showBootError);
