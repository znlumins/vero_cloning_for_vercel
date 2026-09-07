"use client";
import Link from "next/link";
import { motion, Variants } from "framer-motion";
import { ChevronRight, Zap } from "lucide-react";
import LandingNavbar from "@/components/LandingNavbar";
import LandingFooter from "@/components/LandingFooter";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.2, delayChildren: 0.1 },
  },
};

const itemVariants: Variants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: "spring", stiffness: 100, damping: 15 }
  },
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-700 flex flex-col">
      <LandingNavbar />

      {/* --- HERO SECTION --- */}
      <section className="relative pt-32 sm:pt-40 md:pt-52 pb-16 sm:pb-24 px-5 sm:px-6 overflow-hidden bg-slate-50 flex flex-col justify-center flex-grow">
        <div className="absolute top-0 right-0 w-[300px] h-[300px] md:w-[600px] md:h-[600px] bg-indigo-100/50 rounded-full filter blur-[100px] md:blur-[120px] -z-10"></div>
        <div className="absolute bottom-0 left-0 w-[250px] h-[250px] md:w-[400px] md:h-[400px] bg-blue-50 rounded-full filter blur-[80px] md:blur-[100px] -z-10"></div>

        <motion.div
          className="max-w-5xl mx-auto text-center"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.h1 variants={itemVariants} className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-black mb-6 sm:mb-8 tracking-tighter leading-[1.05] sm:leading-[0.9] uppercase text-slate-900">
            Mendobrak <span className="text-indigo-600">Batasan</span> Komunikasi.
          </motion.h1>

          <motion.p variants={itemVariants} className="text-base sm:text-lg md:text-xl text-slate-500 max-w-2xl mx-auto mb-8 sm:mb-12 font-medium leading-relaxed px-2">
            Platform akademik terintegrasi yang mengubah <span className="text-slate-900 font-bold underline decoration-indigo-500 underline-offset-4">gesture tangan</span> dan suara menjadi jembatan komunikasi inklusif.
          </motion.p>

          <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login" className="group px-8 sm:px-10 py-4 sm:py-5 bg-slate-900 text-white font-black rounded-2xl shadow-2xl hover:bg-indigo-600 transition-all uppercase tracking-widest flex items-center justify-center gap-3 text-sm sm:text-base">
              Mulai Sekarang <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </motion.div>
        </motion.div>
      </section>

      <LandingFooter />
    </div>
  );
}
