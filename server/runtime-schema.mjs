import { GX } from '../shared/data.js';
export const freshClock = (continued = false) => ({ elapsed: 0, continued, secondsPerYear: GX.SECONDS_PER_YEAR });
