// Graph page — Knowledge-graph visualisation wrapper
import React from 'react';
import { motion } from 'framer-motion';
import KnowledgeGraph from '../components/graph/KnowledgeGraph';

export default function Graph() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full flex flex-col"
    >
      <div className="mb-3">
        <h1 className="font-heading text-2xl font-bold text-amd-white">Knowledge Graph</h1>
        <p className="text-sm text-amd-white/40 mt-0.5">
          Explore connections between your documents, tasks, and AI conversations
        </p>
      </div>
      <div className="flex-1 glass-card overflow-hidden rounded-xl">
        <KnowledgeGraph />
      </div>
    </motion.div>
  );
}
