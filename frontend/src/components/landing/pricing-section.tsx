'use client';

import { motion, useInView } from 'motion/react';
import { useRef } from 'react';
import { RiCheckLine } from 'react-icons/ri';
import Link from 'next/link';

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'For personal use and small projects.',
    features: [
      '5 GB storage',
      'Single file up to 50 GB',
      'Multipart uploads',
      'Folder organization',
      'Basic sharing',
    ],
    cta: 'Get Started',
    href: '/dashboard',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$9',
    period: '/month',
    description: 'For professionals and teams who need more.',
    features: [
      '100 GB storage',
      'Single file up to 50 GB',
      'Priority uploads',
      'Advanced sharing & permissions',
      'Link expiration controls',
      'Priority support',
    ],
    cta: 'Connect Node',
    href: '/dashboard',
    highlighted: true,
  },
];

export default function PricingSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section id="pricing" className="relative bg-[#0a0a0a] py-16 sm:py-24 md:py-36 px-4 sm:px-6 md:px-10 lg:px-16 overflow-hidden">
      {/* Top separator */}
      <div className="absolute top-0 left-4 right-4 sm:left-6 sm:right-6 md:left-10 md:right-10 lg:left-16 lg:right-16 h-px bg-white/[0.06]" />

      {/* Ambient colored glow */}
      <div className="absolute top-[10%] right-[-10%] w-[350px] sm:w-[600px] h-[350px] sm:h-[600px] rounded-full bg-violet-500/[0.05] blur-[100px] sm:blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-15%] left-[-5%] w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] rounded-full bg-cyan-500/[0.04] blur-[90px] sm:blur-[120px] pointer-events-none" />

      <div className="relative max-w-4xl mx-auto" ref={ref}>
        {/* Section header */}
        <motion.div
          className="mb-10 sm:mb-16 md:mb-20 text-center"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          <p className="text-violet-300/50 text-[12px] sm:text-[13px] font-medium uppercase tracking-widest mb-3 sm:mb-4">
            Pricing
          </p>
          <h2 className="text-white text-2xl sm:text-3xl md:text-4xl lg:text-[42px] font-light tracking-tight leading-tight">
            Simple, transparent pricing.
          </h2>
        </motion.div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 md:gap-8">
          {plans.map((plan, idx) => (
            <motion.div
              key={idx}
              className={`relative p-6 sm:p-8 md:p-10 rounded-2xl border transition-colors duration-500 ${
                plan.highlighted
                  ? 'border-indigo-400/20 bg-indigo-500/[0.03]'
                  : 'border-white/[0.06] bg-transparent hover:border-white/10'
              }`}
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.15 * idx, ease: 'easeOut' }}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-6 sm:left-8">
                  <span className="px-3 py-1 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider bg-indigo-500 text-white rounded-full">
                    Popular
                  </span>
                </div>
              )}

              <div className="mb-6 sm:mb-8">
                <h3 className="text-white text-base sm:text-lg font-medium mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-2.5 sm:mb-3">
                  <span className="text-white text-3xl sm:text-4xl md:text-5xl font-light tracking-tight">{plan.price}</span>
                  <span className="text-white/30 text-xs sm:text-sm">{plan.period}</span>
                </div>
                <p className="text-white/35 text-[13px] sm:text-[14px]">{plan.description}</p>
              </div>

              <div className="h-px bg-white/[0.06] mb-6 sm:mb-8" />

              <ul className="space-y-3 sm:space-y-3.5 mb-8 sm:mb-10">
                {plan.features.map((feature, fIdx) => (
                  <li key={fIdx} className="flex items-center gap-3 text-white/55 text-[13px] sm:text-[14px]">
                    <RiCheckLine className={`w-4 h-4 shrink-0 ${plan.highlighted ? 'text-indigo-400/60' : 'text-white/30'}`} />
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                href={plan.href}
                className={`block w-full text-center py-3 rounded-full text-[13px] sm:text-[14px] font-semibold transition-all duration-300 ${
                  plan.highlighted
                    ? 'bg-indigo-500 text-white hover:bg-indigo-400'
                    : 'border border-white/10 text-white/70 hover:text-white hover:border-white/20'
                }`}
              >
                {plan.cta}
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
