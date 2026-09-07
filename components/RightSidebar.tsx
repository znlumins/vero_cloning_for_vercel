"use client";
import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, 
  startOfWeek, endOfWeek, isSameMonth, isSameDay, eachDayOfInterval,
  isWithinInterval, parseISO 
} from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Clock, Calendar as CalendarIcon, Video, ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";

export default function RightSidebar({ userId }: { userId: string }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [schedules, setSchedules] = useState<any[]>([]);
  const [now, setNow] = useState(new Date());
  const router = useRouter();
  const today = new Date();

  // --- LOGIKA FETCH JADWAL HARI INI ---
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000); // Update status LIVE tiap menit
    
    const fetchSchedules = async () => {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);

      const { data } = await db
        .from('schedules')
        .select('*')
        .gte('start_time', startOfToday.toISOString())
        .lte('start_time', endOfToday.toISOString())
        .order('start_time', { ascending: true });
      
      setSchedules(data || []);
    };

    if (userId) fetchSchedules();
    return () => clearInterval(timer);
  }, [userId]);

  // --- LOGIKA KALENDER ---
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth)),
    end: endOfWeek(endOfMonth(currentMonth)),
  });

  return (
    <aside className="w-80 min-h-screen bg-slate-50/50 border-l border-slate-100 p-6 flex flex-col gap-8 hidden xl:flex overflow-y-auto shrink-0 z-20">
      
      {/* 1. SEKSI KALENDER */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 ">
            <CalendarIcon size={14} className="text-indigo-600" /> 
            {format(currentMonth, "MMMM yyyy", { locale: idLocale })}
          </h3>
          <div className="flex gap-1">
            <button 
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-1 hover:bg-white rounded border border-transparent hover:border-slate-200 transition-all"
              aria-label="Bulan sebelumnya"
            >
              <ChevronLeft size={16} />
            </button>
            <button 
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-1 hover:bg-white rounded border border-transparent hover:border-slate-200 transition-all"
              aria-label="Bulan berikutnya"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="grid grid-cols-7 text-center text-[9px] font-black text-slate-400 mb-3 uppercase tracking-tighter">
            <span>M</span><span>S</span><span>S</span><span>R</span><span>K</span><span>J</span><span>S</span>
          </div>
          
          <div className="grid grid-cols-7 text-center gap-y-1">
            {days.map((day, i) => (
              <div key={i} className="flex justify-center items-center h-8">
                <span className={`
                  text-[11px] w-7 h-7 flex items-center justify-center rounded-lg transition-all
                  ${!isSameMonth(day, currentMonth) ? "text-slate-200" : 
                    isSameDay(day, today) 
                      ? "bg-slate-900 text-white font-bold shadow-lg shadow-slate-200 scale-110" 
                      : "text-slate-700 font-bold hover:bg-slate-50 cursor-pointer"}
                `}>
                  {format(day, "d")}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 2. SEKSI TIMELINE HARI INI */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 ">
            <Clock size={16} className="text-indigo-600" /> Timeline Hari Ini
          </h3>
          <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full uppercase">
            {schedules.length} Agenda
          </span>
        </div>

        <div className="space-y-4">
          {schedules.length > 0 ? (
            schedules.map((item) => {
              // Guard: skip items with invalid or missing time values
              if (!item.start_time || !item.end_time) return null;
              const start = parseISO(item.start_time);
              const end = parseISO(item.end_time);
              if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
              const isLive = isWithinInterval(now, { start, end });

              return (
                <div key={item.id} className={`group p-5 rounded-2xl border-2 transition-all shadow-sm ${isLive ? 'border-indigo-600 bg-indigo-50/50 ring-4 ring-indigo-50' : 'border-slate-100 bg-white'}`}>
                  <div className="flex justify-between items-start mb-3">
                    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-md ${isLive ? 'bg-indigo-600 text-white animate-pulse' : 'bg-slate-100 text-slate-500'}`}>
                      {format(start, "HH:mm")} - {format(end, "HH:mm")} {isLive && '• LIVE'}
                    </span>
                  </div>
                  
                  <h4 className="text-sm font-black text-slate-900 leading-tight mb-1 uppercase tracking-tight">
                    {item.subject_name}
                  </h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase mb-4 tracking-tight">
                    {item.location}
                  </p>

                  {isLive && item.is_online && (
                    <button 
                      onClick={() => router.push(`/dashboard/diskusi/meeting?roomID=${item.room_id}`)}
                      className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-600 transition-all shadow-lg"
                    >
                      <Video size={14} /> Join Meeting
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-2xl">
              <p className="text-[10px] font-black text-slate-400 uppercase ">Tidak ada jadwal hari ini</p>
            </div>
          )}
        </div>
      </section>
    </aside>
  );
}