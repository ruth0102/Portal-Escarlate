import { spawn } from 'node:child_process'

const processes = [
  {
    name: 'auth-service',
    command: process.execPath,
    args: ['--env-file=../.env', 'src/services/auth/server.js'],
  },
  {
    name: 'news-service',
    command: process.execPath,
    args: ['--env-file=../.env', 'src/services/news/server.js'],
  },
  {
    name: 'registration-service',
    command: process.execPath,
    args: ['--env-file=../.env', 'src/services/registration/server.js'],
  },
  {
    name: 'email-service',
    command: process.execPath,
    args: ['--env-file=../.env', 'src/services/email/server.js'],
  },
  {
    name: 'ai-service',
    command: process.execPath,
    args: ['--env-file=../.env', 'src/services/ai/server.js'],
  },
  {
    name: 'news-summary-service',
    command: process.execPath,
    args: ['--env-file=../.env', 'src/services/news-summary/server.js'],
  },
  {
    name: 'article-summary-service',
    command: process.execPath,
    args: ['--env-file=../.env', 'src/services/article-summary/server.js'],
  },
  {
    name: 'event-service',
    command: process.execPath,
    args: ['--env-file=../.env', 'src/services/events/server.js'],
  },
  {
    name: 'gateway',
    command: process.execPath,
    args: ['--env-file=../.env', 'src/server.js'],
  },
]

let shuttingDown = false

const children = processes.map((entry) => {
  const child = spawn(entry.command, entry.args, {
    cwd: new URL('..', import.meta.url),
    stdio: ['inherit', 'pipe', 'pipe'],
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
