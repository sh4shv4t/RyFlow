// WorkspaceSetup — Onboarding screen shown on first launch
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Zap, Monitor, CheckCircle, Loader2, ArrowRight } from 'lucide-react';
import axios from 'axios';
import useStore from '../../store/useStore';
import { detectAMD } from '../../utils/amdDetect';
import toast from 'react-hot-toast';

const AVATAR_COLORS = ['#E8000D', '#FF6B00', '#00C853', '#9B59B6', '#2196F3', '#FFD700'];

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ta', label: 'Tamil' },
  { code: 'bn', label: 'Bengali' },
  { code: 'mr', label: 'Marathi' },
];

export default function WorkspaceSetup() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [language, setLanguage] = useState('en');
  const [amdStatus, setAmdStatus] = useState(null);
  const [checking, setChecking] = useState(false);
  const { setUser, setWorkspace, setAiStatus, setLanguage: setGlobalLang } = useStore();

  // Run AMD detection in background
  useEffect(() => {
    const check = async () => {
      setChecking(true);
      const status = await detectAMD();
      setAmdStatus(status);
      setChecking(false);
    };
    check();
  }, []);

  // Handles final setup completion
  const handleComplete = async () => {
    if (!name.trim() || !workspaceName.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    try {
      // Create workspace
      const wsRes = await axios.post('/api/workspace', { name: workspaceName });
      const workspace = wsRes.data;

      // Create user
      const userRes = await axios.post('/api/workspace/user', {
        name,
        workspace_id: workspace.id,
        avatar_color: avatarColor,
        language
      });
      const user = userRes.data;

      // Save to global state
      setUser(user);
      setWorkspace(workspace);
      setGlobalLang(language);
      if (amdStatus) setAiStatus(amdStatus);

      toast.success('Welcome to RyFlow!');
    } catch (err) {
      toast.error('Setup failed: ' + err.message);
    }
  };

  // Check Ollama status
  const checkOllama = async () => {
    setChecking(true);
    const status = await detectAMD();
    setAmdStatus(status);
    setChecking(false);
    if (status?.ollamaRunning) {
      toast.success('Ollama is running!');
    } else {
      toast.error('Ollama not detected. Start it with: ollama serve');
    }
  };

  return (
    <div className="h-screen w-screen bg-amd-charcoal flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-amd-red flex items-center justify-center mx-auto mb-4 glow-red">
            <Zap size={32} className="text-white" />
          </div>
          <h1 className="font-heading text-3xl font-bold text-amd-white">RyFlow</h1>
          <p className="text-amd-white/50 mt-1">Your Campus. Your GPU. Your AI.</p>
        </div>

        <div className="glass-card p-8">
          {/* Step 1: Name */}
          {step === 1 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <h2 className="font-heading font-semibold text-xl text-amd-white mb-2">What's your name?</h2>
              <p className="text-sm text-amd-white/40 mb-6">This will be shown to your teammates</p>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && name.trim() && setStep(2)}
                placeholder="Enter your name"
                className="w-full bg-amd-gray/50 border border-white/10 rounded-xl px-4 py-3 text-amd-white placeholder:text-amd-white/30 outline-none focus:border-amd-red/50 mb-4"
                autoFocus
              />
              <button
                onClick={() => setStep(2)}
                disabled={!name.trim()}
                className="w-full py-3 rounded-xl bg-amd-red text-white font-medium disabled:opacity-50 hover:bg-amd-red/80 transition-colors flex items-center justify-center gap-2"
              >
                Continue <ArrowRight size={16} />
              </button>
            </motion.div>
          )}

          {/* Step 2: Workspace */}
          {step === 2 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <h2 className="font-heading font-semibold text-xl text-amd-white mb-2">Name your workspace</h2>
              <p className="text-sm text-amd-white/40 mb-6">e.g. "Techfest 2025 Core Team"</p>
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && workspaceName.trim() && setStep(3)}
                placeholder="Workspace name"
                className="w-full bg-amd-gray/50 border border-white/10 rounded-xl px-4 py-3 text-amd-white placeholder:text-amd-white/30 outline-none focus:border-amd-red/50 mb-4"
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="px-6 py-3 rounded-xl bg-white/5 text-amd-white/60">Back</button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!workspaceName.trim()}
                  className="flex-1 py-3 rounded-xl bg-amd-red text-white font-medium disabled:opacity-50 hover:bg-amd-red/80 transition-colors flex items-center justify-center gap-2"
                >
                  Continue <ArrowRight size={16} />
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 3: Preferences */}
          {step === 3 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <h2 className="font-heading font-semibold text-xl text-amd-white mb-6">Personalize</h2>

              {/* Avatar color */}
              <div className="mb-6">
                <label className="text-sm text-amd-white/60 block mb-2">Avatar color</label>
                <div className="flex gap-3">
                  {AVATAR_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setAvatarColor(c)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold transition-all ${
                        avatarColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-amd-charcoal scale-110' : 'opacity-60 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {name.charAt(0).toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Language */}
              <div className="mb-6">
                <label className="text-sm text-amd-white/60 block mb-2">Language preference</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full bg-amd-gray/50 border border-white/10 rounded-xl px-4 py-3 text-amd-white outline-none"
                >
                  {LANGUAGES.map(l => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </div>

              {/* AMD Detection Status */}
              <div className="glass-card p-4 mb-6">
                {checking ? (
                  <div className="flex items-center gap-2 text-amd-white/60">
                    <Loader2 size={16} className="animate-spin" />
                    <span>Detecting AMD GPU...</span>
                  </div>
                ) : amdStatus?.rocmAvailable ? (
                  <div className="flex items-center gap-2 text-amd-green">
                    <CheckCircle size={16} />
                    <span>✅ AMD ROCm Detected — Running at Maximum Speed</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-amd-orange">
                    <Monitor size={16} />
                    <span>🖥 CPU Mode — Still fully offline and private</span>
                  </div>
                )}

                {amdStatus?.gpuName && (
                  <p className="text-xs text-amd-white/40 mt-1 ml-6">GPU: {amdStatus.gpuName}</p>
                )}

                {amdStatus && !amdStatus.ollamaRunning && (
                  <p className="text-xs text-amd-orange/60 mt-2 ml-6">
                    ⚠ Ollama not detected. Start it with: <code className="bg-black/30 px-1 rounded">ollama serve</code>
                  </p>
                )}

                <button
                  onClick={checkOllama}
                  className="mt-2 ml-6 text-xs text-amd-red hover:text-amd-red/80 underline"
                >
                  Check Ollama
                </button>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setStep(2)} className="px-6 py-3 rounded-xl bg-white/5 text-amd-white/60">Back</button>
                <button
                  onClick={handleComplete}
                  className="flex-1 py-3 rounded-xl bg-amd-red text-white font-medium hover:bg-amd-red/80 transition-colors flex items-center justify-center gap-2"
                >
                  <Zap size={16} /> Launch RyFlow
                </button>
              </div>
            </motion.div>
          )}

          {/* Progress dots */}
          <div className="flex justify-center gap-2 mt-6">
            {[1, 2, 3].map(s => (
              <div
                key={s}
                className={`w-2 h-2 rounded-full transition-colors ${
                  s === step ? 'bg-amd-red' : s < step ? 'bg-amd-green' : 'bg-white/20'
                }`}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
