import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import path from 'node:path'

const root = new URL('..', import.meta.url)

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options,
    })

    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${command} ${args.join(' ')} failed with code ${code}`))
    })
  })
}

async function listJsFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await listJsFiles(fullPath)))
      continue
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath)
    }
  }

  return files
}

async function main() {
  await run('npm', ['run', 'build', '--prefix', 'frontend'])

  const backendFiles = await listJsFiles(path.join(root.pathname, 'backend/src'))

  for (const file of backendFiles) {
    await run(process.execPath, ['--check', file])
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
