// The phone's "Remove animations" setting (Android) shows up as prefers-reduced-motion.
export const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
