// Writes a file so a crash mid-write can never leave a truncated file behind: the data goes to
// a temp file in the same directory first, then is renamed over the target (atomic on POSIX).
import { writeFile, rename, rm } from 'node:fs/promises'

export async function writeFileAtomic(target: string, data: string): Promise<void> {
  const tmp = `${target}.tmp-${process.pid}`
  try {
    await writeFile(tmp, data)
    await rename(tmp, target)
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => {})
    throw err
  }
}
