'use client';

import { motion, useInView } from 'motion/react';
import { useRef } from 'react';
import { RiShieldKeyholeLine, RiRocketLine, RiTeamLine } from 'react-icons/ri';

const features = [
  {
    icon: RiShieldKeyholeLine,
    title: 'End-to-End Encryption',
    description: 'Your files are encrypted at rest and in transit. Only you hold the keys.',
    color: 'indigo',
  },
  {
    icon: RiRocketLine,
    title: 'Lightning Fast Uploads',
    description: 'Multipart uploads with presigned URLs. Large files upload in seconds, not minutes.',
    color: 'violet',
  },
  {
    icon: RiTeamLine,
    title: 'Simple Sharing',
    description: 'Share files and folders with anyone. Control permissions with granular access.',
    color: 'cyan',
  },
];

const iconColorMap: Record<string, string> = {
  indigo: 'text-indigo-400/80 border-indigo-400/15 group-hover:border-indigo-400/25',
  violet: 'text-violet-400/80 border-violet-400/15 group-hover:border-violet-400/25',
  cyan: 'text-cyan-400/80 border-cyan-400/15 group-hover:border-cyan-400/25',
};

export default function FeaturesSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section id="features" className="relative bg-[#0a0a0a] py-16 sm:py-24 md:py-36 px-4 sm:px-6 md:px-10 lg:px-16 overflow-hidden">
      {/* Ambient colored glow */}
      <div className="absolute top-[-20%] left-[10%] w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] rounded-full bg-indigo-500/[0.04] blur-[100px] sm:blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[5%] w-[250px] sm:w-[400px] h-[250px] sm:h-[400px] rounded-full bg-violet-500/[0.04] blur-[90px] sm:blur-[120px] pointer-events-none" />

      <div className="relative max-w-5xl mx-auto" ref={ref}>
        {/* Section header */}
        <motion.div
          className="mb-10 sm:mb-16 md:mb-20"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          <p className="text-indigo-300/50 text-[12px] sm:text-[13px] font-medium uppercase tracking-widest mb-3 sm:mb-4">
            Why Cachette
          </p>
          <h2 className="text-white text-2xl sm:text-3xl md:text-4xl lg:text-[42px] font-light tracking-tight leading-tight">
            Built for security.<br />
            Designed for speed.
          </h2>
        </motion.div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/[0.06] rounded-2xl overflow-hidden border border-white/[0.06]">
          {features.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={idx}
                className="bg-[#0a0a0a] p-6 sm:p-8 md:p-10 group hover:bg-white/[0.02] transition-colors duration-500"
                initial={{ opacity: 0, y: 40 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.7, delay: 0.15 * idx, ease: 'easeOut' }}
              >
                <div className={`w-10 h-10 flex items-center justify-center border rounded-lg mb-5 sm:mb-6 transition-colors duration-500 ${iconColorMap[feature.color]}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-white text-base sm:text-lg font-medium mb-2.5 sm:mb-3 tracking-tight">
                  {feature.title}
                </h3>
                <p className="text-white/40 text-[13px] sm:text-[14px] leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
