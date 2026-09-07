"use client";
import { motion, Variants } from "framer-motion";
import { Hand, MessageSquareText, Layout } from "lucide-react";
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

export default function FiturPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-700 flex flex-col">
      <LandingNavbar />

      <main className="pt-32 pb-24 flex-grow">
        <section className="py-12 px-6">
          <motion.div 
            className="max-w-7xl mx-auto"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.div variants={itemVariants} className="text-center mb-20">
              <h2 className="text-4xl font-black uppercase mb-4 text-slate-900">Fitur <span className="text-indigo-600">Studio</span> Kami</h2>
              <div className="w-20 h-1.5 bg-indigo-600 mx-auto rounded-full"></div>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-8">
              <motion.div variants={itemVariants} className="group p-10 bg-white rounded-[40px] border border-slate-200 hover:border-indigo-600 hover:shadow-2xl hover:shadow-indigo-100 transition-all duration-500">
                <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-8 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                  <Hand size={32} />
                </div>
                <h4 className="text-xl font-black mb-4 uppercase text-slate-900">AI Hand Gesture</h4>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Teknologi Computer Vision yang mengenali gerakan tangan SIBI dan BISINDO untuk dikonversi menjadi subtitle instan.
                </p>
              </motion.div>

              <motion.div variants={itemVariants} className="group p-10 bg-white rounded-[40px] border border-slate-200 hover:border-indigo-600 hover:shadow-2xl hover:shadow-indigo-100 transition-all duration-500">
                <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-8 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                  <MessageSquareText size={32} />
                </div>
                <h4 className="text-xl font-black mb-4 uppercase text-slate-900">STT & TTS</h4>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Ubah suara menjadi teks (STT) dan teks menjadi suara (TTS) secara otomatis untuk komunikasi dua arah yang mulus.
                </p>
              </motion.div>

              <motion.div variants={itemVariants} className="group p-10 bg-white rounded-[40px] border border-slate-200 hover:border-indigo-600 hover:shadow-2xl hover:shadow-indigo-100 transition-all duration-500">
                <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-8 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                  <Layout size={32} />
                </div>
                <h4 className="text-xl font-black mb-4 uppercase text-slate-900">Collaborative Studio</h4>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Mode presentasi slide dan whiteboard interaktif yang tersinkronisasi antar semua peserta meeting.
                </p>
              </motion.div>
            </div>
          </motion.div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
