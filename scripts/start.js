import { spawn } from 'node:child_process'

const root = new URL('..', import.meta.url)

const processes = [
  {
    name: 'backend',
    command: 'npm',
    args: ['run', 'start', '--prefix', 'backend'],
  },
  {
    name: 'frontend',
    command: process.execPath,
    args: ['scripts/serve-frontend.js'],
  },
]

let shuttingDown = false

const children = processes.map((entry) => {
  const child = spawn(entry.command, entry.args, {
    cwd: root,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[${entry.name}] ${chunk}`)
  })

  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[${entry.name}] ${chunk}`)
  })

  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return
    }

    console.error(`[${entry.name}] exited with ${signal ?? code}`)
    shutdown(1)
  })

  return child
})

function shutdown(code = 0) {
  shuttingDown = true

  for (const child of children) {
    child.kill('SIGINT')
  }

  setTimeout(() => process.exit(code), 250)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
