// Calls whisper.cpp subprocess for speech-to-text transcription
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const WHISPER_PATH = process.env.WHISPER_PATH || path.join(__dirname, '..', '..', 'whisper.cpp', process.platform === 'win32' ? 'main.exe' : 'main');
const WHISPER_MODEL = process.env.WHISPER_MODEL || path.join(__dirname, '..', '..', 'whisper.cpp', 'models', 'ggml-base.bin');

// Checks if whisper.cpp binary and model are available
function isWhisperAvailable() {
  // Support both explicit executable path and extension-less override paths.
  const fallbackWinPath = process.platform === 'win32' ? `${WHISPER_PATH}.exe` : WHISPER_PATH;
  return (fs.existsSync(WHISPER_PATH) || fs.existsSync(fallbackWinPath)) && fs.existsSync(WHISPER_MODEL);
}

// Transcribes an audio file using whisper.cpp and returns the text
async function transcribe(audioFilePath) {
  if (!isWhisperAvailable()) {
    return { error: 'Whisper not installed', fallback: true, transcript: null };
  }

  try {
    const outputBase = audioFilePath.replace(/\.[^.]+$/, '');
    // Use direct argv invocation to avoid shell escaping issues on Windows paths.
    const binaryPath = fs.existsSync(WHISPER_PATH) ? WHISPER_PATH : (process.platform === 'win32' ? `${WHISPER_PATH}.exe` : WHISPER_PATH);
    const result = spawnSync(binaryPath, ['-m', WHISPER_MODEL, '-f', audioFilePath, '--output-txt', '-of', outputBase], {
      timeout: 60000,
      stdio: 'pipe'
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error((result.stderr || '').toString() || `Whisper exited with code ${result.status}`);
    }

    const txtPath = outputBase + '.txt';
    if (fs.existsSync(txtPath)) {
      const transcript = fs.readFileSync(txtPath, 'utf-8').trim();
      // Clean up temp output file
      fs.unlinkSync(txtPath);
      return { error: null, fallback: false, transcript };
    }

    return { error: 'Transcription output not found', fallback: true, transcript: null };
  } catch (err) {
    console.error('[Whisper] Transcription error:', err.message);
    return { error: err.message, fallback: true, transcript: null };
  }
}

module.exports = { isWhisperAvailable, transcribe };
