// Generates images via Pollinations.ai (free, no API key required)
const fetch = require('node-fetch');

const POLLINATIONS_BASE = 'https://image.pollinations.ai/prompt';

// Constructs the Pollinations.ai image URL for a given prompt
function getImageUrl(prompt, width = 1024, height = 768) {
  const encoded = encodeURIComponent(prompt);
  return `${POLLINATIONS_BASE}/${encoded}?width=${width}&height=${height}&nologo=true&model=flux`;
}

// Fetches an image from Pollinations.ai and returns the buffer
async function generateImage(prompt, width = 1024, height = 768) {
  const url = getImageUrl(prompt, width, height);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Pollinations returned ${response.status}`);
    }
    const buffer = await response.buffer();
    return { url, buffer, contentType: response.headers.get('content-type') || 'image/jpeg' };
  } catch (err) {
    console.error('[ImageGen] Error:', err.message);
    throw err;
  }
}

// Generates prompt variations for the "Generate 4 Variations" feature
function createVariations(basePrompt) {
  const suffixes = [
    ', vibrant colors, detailed',
    ', minimalist style, clean',
    ', dramatic lighting, cinematic',
    ', abstract art style, creative'
  ];
  return suffixes.map(s => basePrompt + s);
}

module.exports = { getImageUrl, generateImage, createVariations };
