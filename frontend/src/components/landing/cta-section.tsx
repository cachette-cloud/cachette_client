'use client';

import { motion, useInView } from 'motion/react';
import { useRef } from 'react';
import Link from 'next/link';
import { RiArrowRightLine } from 'react-icons/ri';

export default function CtaSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section id="about" className="relative bg-[#0a0a0a] py-16 sm:py-24 md:py-36 px-4 sm:px-6 md:px-10 lg:px-16 overflow-hidden">
      {/* Top separator */}
      <div className="absolute top-0 left-4 right-4 sm:left-6 sm:right-6 md:left-10 md:right-10 lg:left-16 lg:right-16 h-px bg-white/[0.06]" />

      {/* Centered ambient glow */}
      <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[320px] sm:w-[700px] h-[250px] sm:h-[400px] rounded-full bg-indigo-500/[0.06] blur-[100px] sm:blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[30%] w-[250px] sm:w-[400px] h-[250px] sm:h-[400px] rounded-full bg-cyan-500/[0.04] blur-[90px] sm:blur-[120px] pointer-events-none" />

      <div className="relative max-w-3xl mx-auto text-center" ref={ref}>
        <motion.h2
          className="text-white text-2xl sm:text-3xl md:text-4xl lg:text-[48px] font-light tracking-tight leading-tight mb-4 sm:mb-6"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          Start storing securely.
        </motion.h2>

        <motion.p
          className="text-white/40 text-[14px] sm:text-[15px] leading-relaxed max-w-md mx-auto mb-8 sm:mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.15, ease: 'easeOut' }}
        >
          Create a free account and start uploading in seconds. No credit card, no commitments.
        </motion.p>

        <motion.div
          className="flex items-center justify-center gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.3, ease: 'easeOut' }}
        >
          <Link
            href="/dashboard"
            className="relative w-full sm:w-auto bg-indigo-500 text-white rounded-full px-7 sm:px-8 py-3 sm:py-3.5 text-[13px] sm:text-[14px] font-semibold overflow-hidden group/btn inline-flex items-center justify-center gap-2 hover:bg-indigo-400 transition-colors duration-300"
          >
            Open Node Dashboard
            <RiArrowRightLine className="w-4 h-4" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
