const DEFAULT_API_BASE_URL = 'https://s3qmbjubgp.us-west-2.awsapprunner.com';

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).trim().replace(/\/$/, '');

