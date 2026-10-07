export async function register() {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    await import('./env');
    const { getDb } = await import('./lib/db');
    getDb();
  }
}
