import fs from 'node:fs';

export function teardown() {
  const dir = process.env.TEST_DATA_DIR;
  if (dir && fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
