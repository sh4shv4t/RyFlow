// ImageGen — AI image generation via Pollinations.ai (free, no API key)
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image, Download, Loader2, Wand2, Grid } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

const SUGGESTED_PROMPTS = [
  'Techfest 2025 poster, futuristic, dark red and black',
  'Campus hackathon banner, neon lights, coders',
  'Club logo, minimal, professional',
];

const STYLES = [
  { label: 'Photorealistic', suffix: ', photorealistic, high quality, detailed' },
  { label: 'Illustration', suffix: ', digital illustration, artistic, colorful' },
  { label: 'Minimalist', suffix: ', minimalist, clean, modern design' },
  { label: 'Poster', suffix: ', poster design, bold typography, eye-catching' },
];

export default function ImageGen() {
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState(STYLES[0]);
  const [imageUrl, setImageUrl] = useState(null);
  const [variations, setVariations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingVariations, setLoadingVariations] = useState(false);

  // Generates a single image from the prompt
  const generateImage = useCallback(async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setImageUrl(null);
    setVariations([]);

    try {
      const fullPrompt = prompt + style.suffix;
      const res = await axios.get('/api/ai/image', {
        params: { prompt: fullPrompt, width: 1024, height: 768 }
      });
      setImageUrl(res.data.url);
      toast.success('Image generated!');
    } catch (err) {
      toast.error('Image generation failed');
    } finally {
      setLoading(false);
    }
  }, [prompt, style]);

  // Generates 4 variations of the current prompt
  const generateVariations = useCallback(async () => {
    if (!prompt.trim()) return;
    setLoadingVariations(true);
    setVariations([]);

    try {
      const res = await axios.post('/api/ai/image/variations', {
        prompt: prompt + style.suffix
      });
      setVariations(res.data.urls || []);
      toast.success('4 variations generated!');
    } catch (err) {
      toast.error('Failed to generate variations');
    } finally {
      setLoadingVariations(false);
    }
  }, [prompt, style]);

  // Downloads the generated image
  const downloadImage = (url) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `ryflow-image-${Date.now()}.jpg`;
    a.target = '_blank';
    a.click();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-white/5">
        <h3 className="font-heading font-semibold text-amd-white flex items-center gap-2">
          <Image size={18} className="text-amd-red" /> AI Image Generator
        </h3>
        <p className="text-xs text-amd-white/40 mt-1">Powered by Pollinations.ai — free, no API key</p>
      </div>

      {/* Prompt input */}
      <div className="p-4 space-y-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the image you want to create..."
          className="w-full bg-amd-gray/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-amd-white placeholder:text-amd-white/30 outline-none focus:border-amd-red/50 transition-colors resize-none h-24"
        />

        {/* Suggested prompts */}
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_PROMPTS.map((p, i) => (
            <button
              key={i}
              onClick={() => setPrompt(p)}
              className="text-xs px-3 py-1.5 glass-card text-amd-white/60 hover:text-amd-white hover:border-amd-red/30 transition-colors"
            >
              {p}
            </button>
          ))}
        </div>

        {/* Style selector */}
        <div className="flex gap-2">
          {STYLES.map((s) => (
            <button
              key={s.label}
              onClick={() => setStyle(s)}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                style.label === s.label
                  ? 'bg-amd-red/20 text-amd-red border border-amd-red/30'
                  : 'bg-white/5 text-amd-white/60 hover:bg-white/10'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={generateImage}
            disabled={loading || !prompt.trim()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amd-red text-white font-medium text-sm disabled:opacity-50 hover:bg-amd-red/80 transition-colors"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
            Generate
          </button>
          <button
            onClick={generateVariations}
            disabled={loadingVariations || !prompt.trim()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 text-amd-white/80 text-sm disabled:opacity-50 hover:bg-white/10 transition-colors"
          >
            {loadingVariations ? <Loader2 size={16} className="animate-spin" /> : <Grid size={16} />}
            4 Variations
          </button>
        </div>
      </div>

      {/* Generated image display */}
      <div className="flex-1 overflow-auto p-4">
        {imageUrl && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative">
            <img
              src={imageUrl}
              alt="Generated"
              className="w-full rounded-xl border border-white/10"
              onError={() => toast.error('Image failed to load')}
            />
            <button
              onClick={() => downloadImage(imageUrl)}
              className="absolute top-3 right-3 p-2 glass-card hover:bg-white/10 transition-colors"
            >
              <Download size={16} />
            </button>
          </motion.div>
        )}

        {/* Variations grid */}
        {variations.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mt-4">
            {variations.map((url, i) => (
              <motion.div key={i} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 }} className="relative">
                <img src={url} alt={`Variation ${i + 1}`} className="w-full rounded-lg border border-white/10" />
                <button
                  onClick={() => downloadImage(url)}
                  className="absolute top-2 right-2 p-1.5 glass-card hover:bg-white/10 transition-colors"
                >
                  <Download size={12} />
                </button>
              </motion.div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!imageUrl && variations.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Image size={48} className="text-amd-white/10 mb-4" />
            <p className="text-sm text-amd-white/30">Enter a prompt and generate your image</p>
          </div>
        )}

        {/* Loading state */}
        {(loading || loadingVariations) && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="skeleton-loader-red h-48 w-full rounded-xl mb-4" />
            <p className="text-sm text-amd-red/60 animate-pulse">Generating image...</p>
          </div>
        )}
      </div>
    </div>
  );
}
