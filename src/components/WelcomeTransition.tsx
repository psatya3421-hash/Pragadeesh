import React, { useEffect } from 'react';
import { motion } from 'motion/react';

interface WelcomeTransitionProps {
  name: string;
  onComplete: () => void;
}

export const WelcomeTransition: React.FC<WelcomeTransitionProps> = ({
  name,
  onComplete,
}) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, 1800);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-[#071528] via-[#0B1F3A] to-[#16325C] p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.86 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center text-center space-y-6 max-w-md"
      >
        <div className="relative w-28 h-28 flex items-center justify-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2.4, ease: 'linear' }}
            className="absolute inset-0 rounded-full border-2 border-[#D4AF37]/25 border-t-[#F5C542]"
          />
          <img
            src="/src/assets/images/primex_gold_emblem_1794619333706.jpg"
            alt="PRIME X INNOVATION Emblem"
            referrerPolicy="no-referrer"
            className="w-20 h-20 rounded-full object-cover border border-[#D4AF37]/70 shadow-xl"
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="space-y-2"
        >
          <div className="text-xs font-semibold tracking-widest uppercase text-[#F5C542]">
            PRIME X INNOVATION
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-white">
            Welcome, {name}
          </h1>
          <p className="text-sm text-slate-300">
            Preparing your workspace...
          </p>
        </motion.div>

        <button
          type="button"
          onClick={onComplete}
          className="text-xs font-medium text-[#F5C542]/80 hover:text-[#F5C542] underline underline-offset-4 transition-colors"
        >
          Enter Now
        </button>
      </motion.div>
    </div>
  );
};
