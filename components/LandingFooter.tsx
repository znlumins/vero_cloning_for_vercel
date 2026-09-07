import Link from "next/link";
import Image from "next/image";
import { Instagram, Mail } from "lucide-react";

const XIcon = ({ size = 16, className = "" }) => (
  <svg fill="currentColor" viewBox="0 0 24 24" width={size} height={size} className={className}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const TiktokIcon = ({ size = 16, className = "" }) => (
  <svg fill="currentColor" viewBox="0 0 24 24" width={size} height={size} className={className}>
    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 2.25-.89 4.51-2.45 6.09-1.57 1.6-3.83 2.51-6.13 2.47-2.34-.04-4.57-1.04-6.11-2.73-1.55-1.7-2.39-4.04-2.26-6.39.11-2.22 1.13-4.38 2.82-5.91 1.69-1.52 3.95-2.34 6.22-2.22v4.22c-1.17-.06-2.36.21-3.26.96-.91.75-1.43 1.9-1.4 3.1.04 1.16.59 2.29 1.48 3.03.9.74 2.12 1.05 3.28.9 1.15-.14 2.21-.75 2.91-1.68.7-.93 1.06-2.13 1.05-3.32V.02h-3.91z"/>
  </svg>
);

export default function LandingFooter() {
  return (
    <footer className="bg-[#111111] text-white py-6 px-8">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center text-[10px] font-bold uppercase tracking-widest text-slate-400 gap-4">
        
        {/* Kiri: Social Media */}
        <div className="flex items-center gap-3">
          <Link href="https://www.instagram.com/verolearn.kc/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center hover:bg-indigo-600 text-slate-400 hover:text-white transition-all hover:scale-110">
            <Instagram size={14} />
          </Link>
          <Link href="https://x.com/verolearn_kc" target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)" className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center hover:bg-indigo-600 text-slate-400 hover:text-white transition-all hover:scale-110">
            <XIcon size={12} />
          </Link>
          <Link href="https://www.tiktok.com/@verolearn.kc" target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center hover:bg-indigo-600 text-slate-400 hover:text-white transition-all hover:scale-110">
            <TiktokIcon size={14} />
          </Link>
          <Link href="mailto:verovoicerecognitionandopennes@gmail.com" aria-label="Email" className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center hover:bg-indigo-600 text-slate-400 hover:text-white transition-all hover:scale-110">
            <Mail size={14} />
          </Link>
        </div>

      </div>
    </footer>
  );
}
