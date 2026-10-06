const runtimeOrigin = typeof window !== 'undefined' ? window.location.origin : '';

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || runtimeOrigin
).trim().replace(/\/$/, '');
