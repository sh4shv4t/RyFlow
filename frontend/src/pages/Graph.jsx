// Graph page — Knowledge-graph visualisation wrapper
import React from 'react';
import { motion } from 'framer-motion';
import KnowledgeGraph from '../components/graph/KnowledgeGraph';

export default function Graph() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        height: '100%',
        position: 'relative',
        backgroundColor: '#111111',
        overflow: 'hidden'
      }}
    >
      <KnowledgeGraph />
    </motion.div>
  );
}
