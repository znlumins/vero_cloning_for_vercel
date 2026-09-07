"use client";
import { motion, Variants } from "framer-motion";
import { User } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import LandingNavbar from "@/components/LandingNavbar";
import LandingFooter from "@/components/LandingFooter";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
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

const teamMembers = [
  { name: "Dr. Arif Widyatama, SE., MSA.", major: "DOSEN PEMBIMBING", slug: "arif-widyatama" },
  { name: "Daffa Ahmad Al Attas", major: "TEKNOLOGI INFORMASI", slug: "daffa-ahmad" },
  { name: "Rafif Nabiha", major: "TEKNOLOGI INFORMASI", slug: "rafif-nabiha" },
  { name: "Maqrodza Najwa Putri Fadilah", major: "KEUANGAN DAN PERBANKAN", slug: "maqrodza-najwa" },
  { name: "Naurah Wasyilah", major: "KEUANGAN DAN PERBANKAN", slug: "naurah-wasyilah" },
  { name: "Amanda Aulia Gusetya", major: "PENDIDIKAN KEDOKTERAN GIGI", slug: "amanda-aulia" },
];

export default function TimPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-700 flex flex-col">
      <LandingNavbar />

      <main className="pt-40 pb-24 px-6 flex-grow flex flex-col justify-center">
        <motion.div
          className="max-w-6xl mx-auto w-full"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants} className="text-center mb-16">
            <h2 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.4em] mb-4">Tim Pengembang</h2>
            <h1 className="text-4xl font-black uppercase mb-4 text-slate-900">Creative <span className="text-indigo-600">Team</span></h1>
            <div className="w-20 h-1.5 bg-indigo-600 mx-auto rounded-full"></div>
          </motion.div>

          <motion.div variants={containerVariants} className="grid sm:grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-12 justify-center">
            {teamMembers.map((member, index) => (
              <Link href={`/tim/${member.slug}`} key={index}>
                <motion.div
                  variants={itemVariants}
                  className="group flex flex-col items-start text-left cursor-pointer"
                >
                  {/* Photo Placeholder / Image */}
                  <div className="w-full aspect-[4/5] bg-slate-200 mb-4 flex items-center justify-center border-2 border-transparent group-hover:border-indigo-600 transition-all duration-300 overflow-hidden relative">
                    <Image
                      src={`/tim/${member.slug}.png`}
                      alt={member.name}
                      fill
                      className="object-cover object-top opacity-90 group-hover:scale-105 group-hover:opacity-100 transition-all duration-500"
                    />
                  </div>

                  <h3 className="text-lg font-black text-slate-900 group-hover:text-indigo-600 transition-colors leading-tight pr-4">
                    {member.name}
                  </h3>
                  <p className="text-xs font-bold text-slate-500 mt-1">
                    {member.major}
                  </p>
                </motion.div>
              </Link>
            ))}
          </motion.div>
        </motion.div>
      </main>

      <LandingFooter />
    </div>
  );
}
