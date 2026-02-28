// Home page — Dashboard with greeting, stats, quick actions, and activity feed
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  FileText, CheckSquare, Cpu, Mic, Plus,
  TrendingUp, Leaf, Users, Zap
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import useStore from '../store/useStore';
import PeerList from '../components/workspace/PeerList';

export default function Home() {
  const navigate = useNavigate();
  const { user, workspace, peers, aiStatus } = useStore();
  const [stats, setStats] = useState({ documents: 0, tasks: 0, nodes: 0, users: 0 });
  const [activity, setActivity] = useState([]);
  const [sustainHours, setSustainHours] = useState('');
  const [sustainTip, setSustainTip] = useState(null);
  const [sustainAvg, setSustainAvg] = useState(0);

  // Fetch workspace stats and activity on mount
  useEffect(() => {
    if (!workspace) return;
    const fetchData = async () => {
      try {
        const [statsRes, activityRes] = await Promise.all([
          axios.get(`/api/workspace/${workspace.id}/stats`),
          axios.get(`/api/workspace/${workspace.id}/activity`)
        ]);
        setStats(statsRes.data);
        setActivity(activityRes.data.activity || []);
      } catch {}
    };
    fetchData();
  }, [workspace]);

  // Fetch sustainability data
  useEffect(() => {
    if (!user) return;
    const fetchSustain = async () => {
      try {
        const res = await axios.get(`/api/workspace/sustainability/${user.id}`);
        setSustainAvg(res.data.weeklyAverage || 0);
        if (res.data.logs?.[0]?.ai_tip) {
          setSustainTip(res.data.logs[0].ai_tip);
        }
      } catch {}
    };
    fetchSustain();
  }, [user]);

  // Log sustainability hours
  const logHours = async () => {
    if (!sustainHours || !user) return;
    try {
      const res = await axios.post('/api/workspace/sustainability', {
        user_id: user.id,
        hours_used: parseFloat(sustainHours)
      });
      if (res.data.ai_tip) setSustainTip(res.data.ai_tip);
      setSustainHours('');
      toast.success('Hours logged!');
    } catch {
      toast.error('Failed to log hours');
    }
  };

  const quickActions = [
    { label: 'New Document', icon: FileText, color: '#E8000D', path: '/editor' },
    { label: 'New Task', icon: CheckSquare, color: '#FF6B00', path: '/tasks' },
    { label: 'Ask AI', icon: Cpu, color: '#9B59B6', path: '/ai' },
    { label: 'Record Voice', icon: Mic, color: '#00C853', path: '/ai' },
  ];

  const typeIcons = { document: FileText, task: CheckSquare, voice: Mic };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Greeting */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-heading text-2xl font-bold text-amd-white">
          Welcome back, {user?.name || 'Student'}.
        </h1>
        <p className="text-amd-white/50 mt-1">
          {workspace?.name} has {stats.documents} doc{stats.documents !== 1 ? 's' : ''}, {stats.tasks} task{stats.tasks !== 1 ? 's' : ''}.
        </p>
      </motion.div>

      {/* Ollama warning banner */}
      {!aiStatus.ollamaRunning && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass-card p-4 border border-amd-orange/20 flex items-center gap-3"
        >
          <Zap size={20} className="text-amd-orange" />
          <div>
            <p className="text-sm text-amd-orange font-medium">Start Ollama to enable AI features</p>
            <p className="text-xs text-amd-white/40 mt-0.5">
              Run <code className="bg-black/30 px-1 py-0.5 rounded text-amd-orange/80">ollama serve</code> in your terminal, then refresh.
            </p>
          </div>
        </motion.div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-4">
        {quickActions.map((action, i) => (
          <motion.button
            key={action.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => navigate(action.path)}
            className="glass-card glass-card-hover p-5 text-center group"
          >
            <div
              className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center transition-transform group-hover:scale-110"
              style={{ backgroundColor: action.color + '15' }}
            >
              <action.icon size={24} style={{ color: action.color }} />
            </div>
            <p className="text-sm text-amd-white font-medium">{action.label}</p>
          </motion.button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Activity feed */}
        <div className="col-span-2 space-y-4">
          <h2 className="font-heading font-semibold text-amd-white">Recent Activity</h2>
          {activity.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <TrendingUp size={32} className="text-amd-white/10 mx-auto mb-3" />
              <p className="text-sm text-amd-white/30">No activity yet. Create a document or task to get started!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activity.map((item, i) => {
                const Icon = typeIcons[item.type] || FileText;
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="glass-card p-3 flex items-center gap-3 glass-card-hover cursor-pointer"
                    onClick={() => {
                      if (item.type === 'document') navigate(`/editor/${item.id}`);
                      else if (item.type === 'task') navigate('/tasks');
                    }}
                  >
                    <div className="w-8 h-8 rounded-lg bg-amd-red/10 flex items-center justify-center flex-shrink-0">
                      <Icon size={16} className="text-amd-red" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-amd-white truncate">{item.title || 'Untitled'}</p>
                      <p className="text-[10px] text-amd-white/30 capitalize">{item.type}</p>
                    </div>
                    <span className="text-[10px] text-amd-white/20 flex-shrink-0">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Peer status */}
          <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users size={14} className="text-amd-green" />
              <span className="text-sm font-medium text-amd-white">
                {peers.length} teammate{peers.length !== 1 ? 's' : ''} online
              </span>
            </div>
            <PeerList />
          </div>

          {/* Sustainability tracker */}
          <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Leaf size={14} className="text-amd-green" />
              <span className="text-sm font-medium text-amd-white">Usage Tracker</span>
            </div>
            <p className="text-xs text-amd-white/40 mb-2">Weekly average: {sustainAvg}h/day</p>
            <div className="flex gap-2 mb-2">
              <input
                type="number"
                value={sustainHours}
                onChange={(e) => setSustainHours(e.target.value)}
                placeholder="Hours today"
                className="flex-1 bg-black/20 rounded px-2 py-1.5 text-xs text-amd-white outline-none"
                min="0"
                max="24"
                step="0.5"
              />
              <button onClick={logHours} className="px-3 py-1.5 rounded bg-amd-green/10 text-amd-green text-xs">Log</button>
            </div>
            {sustainTip && (
              <p className="text-xs text-amd-green/70 bg-amd-green/5 rounded p-2 mt-2">
                💡 {sustainTip}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
