// Calls whisper.cpp subprocess for speech-to-text transcription
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const WHISPER_PATH = process.env.WHISPER_PATH || path.join(__dirname, '..', '..', 'whisper.cpp', 'main');
const WHISPER_MODEL = process.env.WHISPER_MODEL || path.join(__dirname, '..', '..', 'whisper.cpp', 'models', 'ggml-base.bin');

// Checks if whisper.cpp binary and model are available
function isWhisperAvailable() {
  return fs.existsSync(WHISPER_PATH) && fs.existsSync(WHISPER_MODEL);
}

// Transcribes an audio file using whisper.cpp and returns the text
async function transcribe(audioFilePath) {
  if (!isWhisperAvailable()) {
    return { error: 'Whisper not installed', fallback: true, transcript: null };
  }

  try {
    const outputBase = audioFilePath.replace(/\.[^.]+$/, '');
    const cmd = `"${WHISPER_PATH}" -m "${WHISPER_MODEL}" -f "${audioFilePath}" --output-txt -of "${outputBase}"`;
    
    execSync(cmd, { timeout: 60000, stdio: 'pipe' });

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
