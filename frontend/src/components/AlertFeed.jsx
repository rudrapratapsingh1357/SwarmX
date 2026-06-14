import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function AlertFeed({ alerts }) {
  const containerRef = useRef(null);

  // Auto scroll to top on new alerts
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [alerts]);

  const getSeverityStyle = (severity) => {
    switch (severity) {
      case 'danger':
        return { cls: 'text-[#ff3b3b] font-bold', label: 'DANGER' };
      case 'warning':
        return { cls: 'text-[#ffaa00]', label: 'WARNING' };
      case 'success':
        return { cls: 'text-[#00ff88] font-semibold', label: 'SUCCESS' };
      case 'battery_swap':
        return { cls: 'text-[#a78bfa] font-semibold', label: '⚡ SWAP' };
      case 'info':
      default:
        return { cls: 'text-[#00d4ff]', label: 'INFO' };
    }
  };

  return (
    <div className="h-[140px] bg-[#050a12] border-t border-slate-900 select-none overflow-hidden flex flex-col shrink-0">
      <div className="bg-[#0a1220] px-6 py-1.5 border-b border-slate-900 flex justify-between items-center text-slate-500 font-grotesk text-[10px] uppercase tracking-wider font-semibold">
        <span>Live Swarm Event Feed</span>
        <span className="flex items-center space-x-1.5 font-mono">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
          </span>
          <span className="text-[#00ff88]">SYS ONLINE</span>
        </span>
      </div>
      
      <div 
        ref={containerRef} 
        className="flex-1 overflow-y-auto px-6 py-2 space-y-1 font-mono text-[11px] leading-relaxed scroll-smooth"
      >
        {alerts.length === 0 ? (
          <div className="text-slate-700 py-4 text-center">System initialization. Listening for swarm events...</div>
        ) : (
          <AnimatePresence initial={false}>
            {alerts.map((alert, idx) => {
              const { cls, label } = getSeverityStyle(alert.severity);
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="flex items-start space-x-2 border-b border-slate-950/40 pb-1"
                >
                  <span className="text-slate-600">[{alert.receivedAt || alert.timestamp}]</span>
                  <span className={`uppercase text-[10px] px-1 bg-slate-900/60 rounded border border-slate-800/50 whitespace-nowrap ${cls}`}>
                    {label}
                  </span>
                  <span className="text-slate-300 flex-1">{alert.message}</span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
