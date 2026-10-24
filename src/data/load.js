import { SAMPLE_THOUGHTS, SAMPLE_BRAIN_DATA, SAMPLE_LESSONS } from './sample-data.js';

// Missing private-data scripts are expected on public deployments.
export function loadData(globals = window) {
  if (Array.isArray(globals.CYBER_THOUGHTS?.themes) && globals.CYBER_THOUGHTS.themes.length > 0) {
    return { mode: 'private', thoughts: globals.CYBER_THOUGHTS,
      brain: globals.BRAIN_DATA ?? { records: [] },
      lessons: globals.LESSONS ?? { lessons: [], patterns: [] } };
  }
  return { mode: 'sample', thoughts: SAMPLE_THOUGHTS, brain: SAMPLE_BRAIN_DATA, lessons: SAMPLE_LESSONS };
}
