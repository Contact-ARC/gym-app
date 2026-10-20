// ─────────────────────────────────────────────────────────────
// EDIT THIS before your first build.
// Base URL of the PUBLIC gym-routines repo (must end with "/").
// GitHub account that hosts the public gym-routines repo.
// For local dev you can override it with VITE_ROUTINES_URL in a .env file.
// ─────────────────────────────────────────────────────────────
export const DEFAULT_ROUTINES_URL =
  import.meta.env.VITE_ROUTINES_URL ||
  'https://raw.githubusercontent.com/Contact-ARC/gym-routines/main/'

export const APP_VERSION = __APP_VERSION__

// Data file format version. Bump + add a migration in storage.js when the shape changes.
export const DATA_SCHEMA_VERSION = 1

// Routine/exercise file format versions this app understands.
export const SUPPORTED_ROUTINE_SCHEMA = 1
