"use client";
import { motion, Variants } from "framer-motion";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
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

export default function TentangPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-700 flex flex-col">
      <LandingNavbar />

      <main className="pt-32 pb-24 flex-grow">
        <section className="py-12 px-6 bg-white">
          <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-20 items-center">
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="relative aspect-video md:aspect-square rounded-[40px] overflow-hidden border-8 border-slate-50 shadow-2xl"
            >
              <Image
                src="https://images.unsplash.com/photo-1573164713714-d95e436ab8d6?q=80&w=2069&auto=format&fit=crop"
                alt="Accessibility Tech"
                fill
                className="object-cover grayscale hover:grayscale-0 transition-all duration-1000"
              />
            </motion.div>

            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              <motion.h2 variants={itemVariants} className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.4em] mb-4">Vero Definition</motion.h2>
              <motion.h3 variants={itemVariants} className="text-4xl font-black mb-6 uppercase tracking-tight text-slate-900">Apa itu <span className="text-indigo-600">Vero?</span></motion.h3>
              <motion.p variants={itemVariants} className="text-slate-500 leading-relaxed mb-8 text-lg">
                <span className="font-bold text-slate-900">Vero</span> (Visual, Recognition, and Openness) adalah ekosistem digital akademik yang dirancang untuk mendukung inklusivitas total. Kami menggunakan AI untuk memastikan teman tuli dan tunawicara dapat berkolaborasi setara dalam ruang kelas digital.
              </motion.p>

              <motion.div variants={itemVariants} className="space-y-4">
                {[
                  "Terjemahan Bahasa Isyarat Real-time",
                  "Kolaborasi Whiteboard Multi-user",
                  "Transkripsi Suara Otomatis (STT)",
                  "Integrasi Akademik Terpadu"
                ].map((text, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm font-bold text-slate-700">
                    <CheckCircle2 className="text-indigo-500" size={18} /> {text}
                  </div>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
