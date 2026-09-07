"use client";
import { Search, Loader2, BookOpen, CheckSquare, Compass, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { globalSearch } from "@/app/actions/search";
import Link from "next/link";

export default function GlobalSearch() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<{ classes: any[], tasks: any[], courses: any[] }>({ classes: [], tasks: [], courses: [] });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Handle outside click to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced Search Effect
  useEffect(() => {
    if (searchTerm.trim().length < 2) {
      setResults({ classes: [], tasks: [], courses: [] });
      setIsOpen(false);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true);
      setIsOpen(true);
      const data = await globalSearch(searchTerm);
      setResults(data);
      setIsSearching(false);
    }, 400); // 400ms debounce

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  const handleClear = () => {
    setSearchTerm("");
    setIsOpen(false);
  };

  const hasResults = results.classes.length > 0 || results.tasks.length > 0 || results.courses.length > 0;

  return (
    <div ref={wrapperRef} className="relative w-full max-w-md">
      <form onSubmit={(e) => e.preventDefault()} className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-xl border border-slate-50 focus-within:ring-2 focus-within:ring-indigo-100 transition-all z-50 relative">
        <Search size={16} className="text-slate-400" />
        <input 
          type="text" 
          placeholder="Cari kelas, tugas, atau materi..." 
          className="bg-transparent text-sm outline-none w-full font-bold text-slate-900 placeholder:text-slate-400" 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => { if(searchTerm.length >= 2) setIsOpen(true); }}
        />
        {searchTerm && (
          <button type="button" onClick={handleClear} className="text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        )}
      </form>

      {/* Dropdown Results */}
      {isOpen && (
        <div className="absolute top-full mt-2 left-0 right-0 bg-white border border-slate-100 rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] overflow-hidden z-50 max-h-[70vh] flex flex-col">
          {isSearching ? (
            <div className="flex items-center justify-center p-8 text-slate-400">
              <Loader2 className="animate-spin" size={24} />
            </div>
          ) : !hasResults ? (
            <div className="p-8 text-center text-slate-500 text-sm font-medium">
              Tidak ada hasil yang ditemukan untuk &ldquo;{searchTerm}&rdquo;
            </div>
          ) : (
            <div className="overflow-y-auto p-2">
              
              {/* Kelas Section */}
              {results.classes.length > 0 && (
                <div className="mb-2">
                  <div className="px-3 py-2 text-[10px] font-black tracking-widest text-slate-400 uppercase">Kelasku</div>
                  <div className="flex flex-col gap-1">
                    {results.classes.map((cls) => (
                      <Link key={cls.id} href={`/dashboard/akademik/kelasku/${cls.id}`} onClick={() => setIsOpen(false)} className="flex flex-col px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors group">
                        <div className="flex items-center gap-2">
                          <BookOpen size={14} className="text-indigo-500" />
                          <span className="font-bold text-sm text-slate-700 group-hover:text-indigo-600 transition-colors">{cls.className}</span>
                        </div>
                        <span className="text-xs text-slate-500 ml-6">{cls.classCode} • {cls.lecturerName}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Tasks Section */}
              {results.tasks.length > 0 && (
                <div className="mb-2">
                  <div className="px-3 py-2 text-[10px] font-black tracking-widest text-slate-400 uppercase">Tugas</div>
                  <div className="flex flex-col gap-1">
                    {results.tasks.map((task) => (
                      <Link key={task.id} href={`/dashboard/akademik/tugas`} onClick={() => setIsOpen(false)} className="flex flex-col px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors group">
                        <div className="flex items-center gap-2">
                          <CheckSquare size={14} className="text-emerald-500" />
                          <span className="font-bold text-sm text-slate-700 group-hover:text-emerald-600 transition-colors">{task.title}</span>
                        </div>
                        <span className="text-xs text-slate-500 ml-6">{task.subject}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Courses Section */}
              {results.courses.length > 0 && (
                <div className="mb-2">
                  <div className="px-3 py-2 text-[10px] font-black tracking-widest text-slate-400 uppercase">Jelajahi Materi</div>
                  <div className="flex flex-col gap-1">
                    {results.courses.map((course) => (
                      <Link key={course.id} href={`/dashboard/akademik/jelajahi`} onClick={() => setIsOpen(false)} className="flex flex-col px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors group">
                        <div className="flex items-center gap-2">
                          <Compass size={14} className="text-amber-500" />
                          <span className="font-bold text-sm text-slate-700 group-hover:text-amber-600 transition-colors">{course.title}</span>
                        </div>
                        <span className="text-xs text-slate-500 ml-6">{course.lecturer} • {course.category}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      )}
    </div>
  );
}