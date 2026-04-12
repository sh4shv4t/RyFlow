#!/usr/bin/env node
'use strict';

const { execSync, spawn } = require('child_process');
const http  = require('http');
const https = require('https');

const OLLAMA_HOST =
  process.env.OLLAMA_HOST || 'http://localhost:11434';
const REQUIRED_MODELS =
  ['phi3:mini', 'nomic-embed-text'];

const dim   = s => `\x1b[2m${s}\x1b[0m`;
const green = s => `\x1b[32m${s}\x1b[0m`;
const yell  = s => `\x1b[33m${s}\x1b[0m`;
const red   = s => `\x1b[31m${s}\x1b[0m`;
const bold  = s => `\x1b[1m${s}\x1b[0m`;
const cyan  = s => `\x1b[36m${s}\x1b[0m`;

const prefix = cyan('[Ollama]');
const log = msg =>
  process.stdout.write(`${prefix} ${msg}\n`);

function ping() {
  return new Promise(resolve => {
    const url = new URL(`${OLLAMA_HOST}/api/tags`);
    const mod =
      url.protocol === 'https:' ? https : http;
    const req = mod.get(
      {
        hostname: url.hostname,
        port:     url.port || 11434,
        path:     url.pathname,
        timeout:  2000
      },
      res => resolve(res.statusCode === 200)
    );
    req.on('error',   () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function isInstalled() {
  try {
    execSync('ollama --version',
      { stdio: 'ignore', timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

function startServer() {
  return new Promise((resolve, reject) => {
    log('Starting Ollama server...');

    const proc = spawn('ollama', ['serve'], {
      detached:    true,
      stdio:       'ignore',
      windowsHide: true
    });
    proc.unref();

    let attempts = 0;
    let settled = false;
    const iv = setInterval(async () => {
      if (settled) return;
      attempts++;
      if (await ping()) {
        settled = true;
        clearInterval(iv);
        log(green('Ollama server is ready'));
        resolve();
      } else if (attempts >= 30) {
        settled = true;
        clearInterval(iv);
        reject(new Error(
          'Ollama did not become ready in 15s'
        ));
      }
    }, 500);
  });
}

function getInstalledModels() {
  return new Promise(resolve => {
    const url = new URL(`${OLLAMA_HOST}/api/tags`);
    const mod =
      url.protocol === 'https:' ? https : http;
    let raw = '';
    const req = mod.get(
      {
        hostname: url.hostname,
        port:     url.port || 11434,
        path:     url.pathname
      },
      res => {
        res.on('data', c => raw += c);
        res.on('end', () => {
          try {
            const p = JSON.parse(raw);
            resolve((p.models || []).map(m => m.name));
          } catch {
            resolve([]);
          }
        });
      }
    );
    req.on('error', () => resolve([]));
  });
}

function pullModel(name) {
  return new Promise((resolve, reject) => {
    log(
      `Pulling ${bold(name)} — ` +
      dim('first-run only, may take a few minutes')
    );
    const proc = spawn('ollama', ['pull', name], {
      stdio:       'inherit',
      windowsHide: false
    });
    proc.on('close', code => {
      if (code === 0) {
        log(green(`${name} ready`));
        resolve();
      } else {
        reject(new Error(
          `ollama pull ${name} exited with ${code}`
        ));
      }
    });
    proc.on('error', err =>
      reject(new Error(
        `Could not run ollama pull: ${err.message}`
      ))
    );
  });
}

async function ensureModels() {
  const installed = await getInstalledModels();
  for (const model of REQUIRED_MODELS) {
    const base = model.split(':')[0];
    const found = installed.some(m =>
      m === model ||
      m.startsWith(base + ':') ||
      m.startsWith(base + '-')
    );
    if (!found) {
      log(yell(`${bold(model)} not found — pulling…`));
      await pullModel(model);
    } else {
      log(`${bold(model)} ${green('✓')}`);
    }
  }
}

async function main() {
  console.log('');
  log(bold('RyFlow — AI Setup'));
  log(dim('─'.repeat(38)));

  if (!isInstalled()) {
    console.log('');
    console.log(red('  ✗ Ollama is not installed.'));
    console.log(
      '  Install from: ' +
      cyan('https://ollama.ai')
    );
    console.log(
      dim(
        '\n  RyFlow will start but AI features\n' +
        '  will be unavailable until Ollama is\n' +
        '  installed and running.\n'
      )
    );
    process.exit(0); // let npm run dev continue
  }

  if (await ping()) {
    log(green('Ollama already running'));
  } else {
    try {
      await startServer();
    } catch (err) {
      console.log('');
      console.log(yell(
        `  ⚠  Could not auto-start Ollama:\n` +
        `     ${err.message}`
      ));
      console.log(dim(
        '  Start it manually with: ollama serve\n'
      ));
      process.exit(0); // let npm run dev continue
    }
  }

  try {
    await ensureModels();
  } catch (err) {
    console.log(yell(
      `  ⚠  Model setup issue: ${err.message}`
    ));
    console.log(dim(
      '  Pull manually:\n' +
      '    ollama pull phi3:mini\n' +
      '    ollama pull nomic-embed-text\n'
    ));
  }

  console.log('');
  log(green(bold('AI stack ready ✓')));
  console.log('');
  process.exit(0);
}

main().catch(err => {
  // Never block dev startup
  console.error(red('[Ollama]'), err.message);
  process.exit(0);
});
