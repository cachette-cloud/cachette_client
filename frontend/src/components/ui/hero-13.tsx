'use client'

import React, { useState } from 'react';
import { ChevronDown, Menu, X } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useMotionTemplate } from 'motion/react';
import LogoIcon from '@/assets/logo-icon';
import Link from 'next/link';

interface NavLink {
    label: string;
    href: string;
    hasDropdown?: boolean;
}

interface HeroProps {
    brandName?: string;
    navLinks?: NavLink[];
    loginLabel?: string;
    loginHref?: string;
    badgeText?: string;
    headingLine1?: string;
    headingLine2?: string;
    description?: string;
    primaryCtaLabel?: string;
    primaryCtaHref?: string;
    secondaryCtaLabel?: string;
    secondaryCtaHref?: string;
    achievementText?: string;
}

export default function Hero({
    brandName = 'Cachette',
    navLinks = [
        { label: 'Features', href: '#features' },
        { label: 'Pricing', href: '#pricing' },
        { label: 'About', href: '#about' },
    ],
    loginLabel = 'Log in',
    loginHref = '/auth',
    badgeText = '✦  Encrypted cloud storage for everyone',
    headingLine1 = 'Your Files,',
    headingLine2 = 'Your Fortress.',
    description = 'Cachette is secure cloud storage built for speed. Upload, organize, and share your files with confidence.',
    primaryCtaLabel = 'Get Started Free',
    primaryCtaHref = '/auth',
    secondaryCtaLabel = 'Learn More',
    secondaryCtaHref = '#features',
    achievementText = 'Up to 5 GB free — no credit card required',
}: HeroProps) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const line1Words = headingLine1.split(' ');
    const line2Words = headingLine2.split(' ');

    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
        const { left, top } = currentTarget.getBoundingClientRect();
        mouseX.set(clientX - left);
        mouseY.set(clientY - top);
    }

    return (
        <section 
            className="relative w-full min-h-[100dvh] flex flex-col justify-between overflow-hidden bg-[#0a0a0a] group"
            onMouseMove={handleMouseMove}
        >
            {/* ─── Background visual layer ─── */}

            {/* Dot grid pattern */}
            <div
                className="absolute inset-0 pointer-events-none opacity-[0.07]"
                style={{
                    backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.4) 1px, transparent 1px)`,
                    backgroundSize: '32px 32px',
                }}
            />

            {/* Colored ambient glow orbs — solid fills + heavy blur for atmosphere */}
            <motion.div
                className="absolute top-[-20%] right-[-5%] w-[350px] sm:w-[500px] md:w-[700px] h-[350px] sm:h-[500px] md:h-[700px] rounded-full bg-indigo-500/[0.08] blur-[100px] sm:blur-[150px] pointer-events-none"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 3, ease: 'easeOut' }}
            />
            <motion.div
                className="absolute top-[10%] right-[15%] w-[250px] sm:w-[400px] h-[250px] sm:h-[400px] rounded-full bg-violet-600/[0.06] blur-[90px] sm:blur-[120px] pointer-events-none"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 2.5, delay: 0.2, ease: 'easeOut' }}
            />
            <motion.div
                className="absolute bottom-[-15%] left-[-8%] w-[320px] sm:w-[600px] h-[320px] sm:h-[600px] rounded-full bg-cyan-500/[0.06] blur-[100px] sm:blur-[130px] pointer-events-none"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 3, delay: 0.4, ease: 'easeOut' }}
            />
            <motion.div
                className="absolute bottom-[10%] right-[25%] w-[200px] sm:w-[350px] h-[200px] sm:h-[350px] rounded-full bg-blue-600/[0.05] blur-[80px] sm:blur-[100px] pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 2.5, delay: 0.7 }}
            />

            {/* Geometric wireframe shapes with colored borders */}
            <motion.div
                className="absolute top-[15%] right-[12%] w-48 h-48 border border-indigo-400/[0.08] rounded-2xl rotate-12 pointer-events-none hidden md:block"
                initial={{ opacity: 0, rotate: 0, scale: 0.7 }}
                animate={{ opacity: 1, rotate: 12, scale: 1 }}
                transition={{ duration: 1.8, delay: 1.2, ease: 'easeOut' }}
            />
            <motion.div
                className="absolute top-[28%] right-[20%] w-32 h-32 border border-cyan-400/[0.06] rounded-xl rotate-[-8deg] pointer-events-none hidden md:block"
                initial={{ opacity: 0, rotate: 0, scale: 0.7 }}
                animate={{ opacity: 1, rotate: -8, scale: 1 }}
                transition={{ duration: 1.8, delay: 1.5, ease: 'easeOut' }}
            />
            <motion.div
                className="absolute bottom-[18%] right-[8%] w-64 h-64 border border-violet-400/[0.05] rounded-3xl rotate-[20deg] pointer-events-none hidden lg:block"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 2, delay: 1.8, ease: 'easeOut' }}
            />

            {/* Noise texture */}
            <div
                className="absolute inset-0 opacity-[0.03] mix-blend-overlay pointer-events-none"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'repeat',
                    backgroundSize: '128px 128px',
                }}
            />

            {/* Mouse-tracking spotlight */}
            <motion.div
                className="pointer-events-none absolute inset-0 z-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 hidden sm:block"
                style={{
                    background: useMotionTemplate`
                        radial-gradient(
                            600px circle at ${mouseX}px ${mouseY}px,
                            rgba(255, 255, 255, 0.06),
                            transparent 80%
                        )
                    `,
                }}
            />

            {/* Content Layer */}
            <div className="relative z-10 flex flex-col justify-between min-h-[100dvh] w-full">

                {/* ─── Navbar ─── */}
                <motion.nav
                    className="w-full px-4 sm:px-6 md:px-10 lg:px-16 py-4 sm:py-5 md:py-7 flex items-center justify-between"
                    initial={{ opacity: 0, y: -24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.9, delay: 0.15, ease: 'easeOut' }}
                >
                    <Link href="/" className="flex items-center gap-2.5 shrink-0">
                       <LogoIcon className='size-6 sm:size-7 text-white' />
                        <span className="text-white text-base sm:text-lg font-semibold tracking-tight">
                            {brandName}
                        </span>
                    </Link>

                    <div className="hidden lg:flex items-center gap-7 xl:gap-9">
                        {navLinks.map((link, idx) => (
                            <motion.a
                                key={idx}
                                href={link.href}
                                className="flex items-center gap-1 text-white/60 hover:text-white text-[14px] font-medium transition-colors duration-200 relative group/nav"
                                initial={{ opacity: 0, y: -12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.25 + idx * 0.07 }}
                            >
                                {link.label}
                                {link.hasDropdown && (
                                    <ChevronDown size={14} strokeWidth={2} className="text-white/40 group-hover/nav:text-white/70 transition-colors" />
                                )}
                                <span className="absolute -bottom-1 left-0 w-0 h-px bg-white/50 group-hover/nav:w-full transition-all duration-300" />
                            </motion.a>
                        ))}
                    </div>

                    <div className="flex items-center gap-3 sm:gap-5">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.6, delay: 0.6 }}
                            className="hidden sm:flex items-center"
                        >
                            <Link
                                href={loginHref}
                                className="flex items-center gap-2 text-white/80 hover:text-white transition-colors text-[13px] sm:text-[14px] font-medium px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03]"
                            >
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                                </span>
                                {loginLabel}
                            </Link>
                        </motion.div>

                        {/* Mobile menu hamburger toggle */}
                        <button 
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            aria-label="Toggle navigation menu"
                            className="lg:hidden text-white/80 hover:text-white p-2 rounded-lg bg-white/[0.04] border border-white/[0.08] transition-colors"
                        >
                            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                        </button>
                    </div>
                </motion.nav>

                {/* ─── Mobile Navigation Drawer / Menu ─── */}
                <AnimatePresence>
                    {mobileMenuOpen && (
                        <motion.div
                            className="fixed inset-0 z-50 bg-[#0a0a0a]/95 backdrop-blur-xl flex flex-col px-6 py-6 lg:hidden"
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.25, ease: 'easeOut' }}
                        >
                            <div className="flex items-center justify-between pb-6 border-b border-white/[0.08]">
                                <Link 
                                    href="/" 
                                    className="flex items-center gap-2.5"
                                    onClick={() => setMobileMenuOpen(false)}
                                >
                                    <LogoIcon className="size-6 text-white" />
                                    <span className="text-white text-lg font-semibold tracking-tight">{brandName}</span>
                                </Link>
                                <button
                                    onClick={() => setMobileMenuOpen(false)}
                                    aria-label="Close menu"
                                    className="p-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white/80 hover:text-white"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <nav className="flex flex-col gap-2 py-8 flex-1">
                                {navLinks.map((link, idx) => (
                                    <a
                                        key={idx}
                                        href={link.href}
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="text-white/80 hover:text-white text-lg font-medium py-3 px-4 rounded-xl hover:bg-white/[0.05] transition-colors"
                                    >
                                        {link.label}
                                    </a>
                                ))}
                            </nav>

                            <div className="pt-6 border-t border-white/[0.08] space-y-3">
                                <Link
                                    href={loginHref}
                                    onClick={() => setMobileMenuOpen(false)}
                                    className="w-full flex items-center justify-center gap-2.5 text-white/90 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] rounded-full py-3 text-[14px] font-medium transition-colors"
                                >
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                                    </span>
                                    {loginLabel}
                                </Link>
                                <Link
                                    href={primaryCtaHref}
                                    onClick={() => setMobileMenuOpen(false)}
                                    className="w-full block text-center bg-white text-[#0a0a0a] rounded-full py-3 text-[14px] font-semibold hover:bg-white/90 transition-colors"
                                >
                                    {primaryCtaLabel}
                                </Link>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ─── Hero Content ─── */}
                <div className="flex-1 flex flex-col justify-center lg:justify-end px-4 sm:px-6 md:px-10 lg:px-16 py-10 sm:py-16 md:pb-24 lg:pb-28">
                    <div className="max-w-2xl">

                        {/* Badge pill */}
                        <motion.div
                            className="inline-flex items-center mb-6 sm:mb-8 md:mb-10 max-w-full"
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7, delay: 0.5 }}
                        >
                            <span className="relative inline-flex items-center px-3.5 sm:px-4 py-1.5 rounded-full text-[11px] sm:text-[13px] font-medium text-white/80 border border-white/10 bg-white/[0.03] backdrop-blur-sm overflow-hidden truncate">
                                <span className="absolute inset-0 -translate-x-full animate-[shimmer_3.5s_infinite] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.05),transparent)]" />
                                <span className="relative truncate">{badgeText}</span>
                            </span>
                        </motion.div>

                        {/* Heading — word-by-word stagger */}
                        <h1 className="text-white text-[32px] xs:text-[38px] sm:text-[48px] md:text-[60px] lg:text-[72px] font-light leading-[1.08] tracking-tight mb-5 sm:mb-6 md:mb-8">
                            <span className="block overflow-hidden">
                                {line1Words.map((word, i) => (
                                    <motion.span
                                        key={i}
                                        className="inline-block mr-[0.25em]"
                                        initial={{ y: '120%', opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        transition={{
                                            duration: 0.85,
                                            delay: 0.65 + i * 0.1,
                                            ease: [0.33, 1, 0.68, 1],
                                        }}
                                    >
                                        {word}
                                    </motion.span>
                                ))}
                            </span>
                            <span className="block overflow-hidden">
                                {line2Words.map((word, i) => (
                                    <motion.span
                                        key={i}
                                        className="inline-block mr-[0.25em]"
                                        initial={{ y: '120%', opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        transition={{
                                            duration: 0.85,
                                            delay: 0.95 + i * 0.1,
                                            ease: [0.33, 1, 0.68, 1],
                                        }}
                                    >
                                        {word}
                                    </motion.span>
                                ))}
                            </span>
                        </h1>

                        {/* Animated horizontal rule */}
                        <motion.div
                            className="h-px bg-white/20 mb-5 sm:mb-6 md:mb-7 max-w-[200px] sm:max-w-sm"
                            initial={{ scaleX: 0, originX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{ duration: 1.2, delay: 1.25, ease: [0.33, 1, 0.68, 1] }}
                        />

                        {/* Description */}
                        <motion.p
                            className="text-white/50 text-sm sm:text-[15px] leading-relaxed max-w-md mb-8 sm:mb-10 md:mb-12"
                            initial={{ opacity: 0, y: 25 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.9, delay: 1.35, ease: 'easeOut' }}
                        >
                            {description}
                        </motion.p>

                        {/* CTA Buttons */}
                        <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-2.5 sm:gap-3.5 w-full sm:w-auto">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.7, delay: 1.55 }}
                                className="w-full xs:w-auto"
                            >
                                <Link
                                    href={primaryCtaHref}
                                    className="relative block w-full xs:w-auto text-center bg-white text-[#0a0a0a] rounded-full px-4 sm:px-5 py-2 sm:py-2.5 text-[12px] sm:text-[13px] font-semibold overflow-hidden group/btn"
                                >
                                    <span className="absolute inset-0 bg-[#0a0a0a] translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300 ease-out rounded-full" />
                                    <span className="relative z-10 group-hover/btn:text-white transition-colors duration-300">
                                        {primaryCtaLabel}
                                    </span>
                                </Link>
                            </motion.div>

                            <motion.a
                                href={secondaryCtaHref}
                                className="flex items-center justify-center gap-2 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-white rounded-full px-4 sm:px-5 py-2 sm:py-2.5 text-[12px] sm:text-[13px] font-medium transition-all duration-300 w-full xs:w-auto"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.7, delay: 1.7 }}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                {secondaryCtaLabel}
                            </motion.a>
                        </div>
                    </div>
                </div>

                {/* ─── Bottom Bar ─── */}
                <div className="w-full px-4 sm:px-6 md:px-10 lg:px-16 pb-6 sm:pb-8 md:pb-10 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-2">
                    <div />
                    <motion.div
                        className="flex items-center gap-3"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 1, delay: 2 }}
                    >
                        <p className="text-white/35 text-[12px] sm:text-[13px] font-medium tracking-wide">
                            {achievementText}
                        </p>
                    </motion.div>
                </div>

            </div>

            {/* ─── Decorative Corner Frame Lines ─── */}
            <motion.div
                className="absolute top-6 right-6 md:top-8 md:right-10 lg:right-16 w-12 h-12 pointer-events-none hidden md:block"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1, delay: 2.4 }}
            >
                <span className="absolute top-0 right-0 w-full h-px bg-white/15" />
                <span className="absolute top-0 right-0 w-px h-full bg-white/15" />
            </motion.div>

            <motion.div
                className="absolute bottom-6 left-6 md:bottom-8 md:left-10 lg:left-16 w-12 h-12 pointer-events-none hidden md:block"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1, delay: 2.4 }}
            >
                <span className="absolute bottom-0 left-0 w-full h-px bg-white/15" />
                <span className="absolute bottom-0 left-0 w-px h-full bg-white/15" />
            </motion.div>

            <style>{`
                @keyframes shimmer {
                    to { transform: translateX(200%); }
                }
            `}</style>
        </section>
    );
}
