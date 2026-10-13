import RegistrationForm from './components/RegistrationForm';
import { Calendar, MapPin } from 'lucide-react';
import { useEventStatus } from './hooks/useEventStatus';
import { formatEventDate } from './lib/event';

export default function App() {
  const { status, error, refresh } = useEventStatus();
  const eventDate = status ? formatEventDate(status.event_date) : '—';
  const venue = status?.venue || '—';

  return (
    <div className="min-h-screen flex flex-col bg-black text-white mesh-bg font-sans relative selection:bg-white selection:text-black overflow-x-hidden">
      <div className="ambient-glow" aria-hidden="true" />

      <header className="sticky top-0 z-50 backdrop-blur-xl bg-black/80 shadow-[0_4px_20px_rgba(0,0,0,0.8)]">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3.5">
            <img
              src="/zbc.jpg"
              alt="Zero Bugs Club logo"
              width="40"
              height="40"
              className="w-10 h-10 rounded-full object-cover border border-white/20"
            />
            <div className="h-7 w-px bg-white/15" aria-hidden="true" />
            <div>
              <span className="font-black tracking-tight text-white text-lg block leading-none">Zero Bugs Club</span>
              <span className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mt-0.5 block">
                VIT Chennai
              </span>
            </div>
          </div>
        </div>
        <div className="w-full h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" aria-hidden="true" />
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-10 sm:py-16 relative z-10">
        <div className="space-y-10 sm:space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3 relative z-10">
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-gradient">Zero Bugs Club</h1>
            <p className="shining-text text-lg sm:text-xl font-bold tracking-widest uppercase">
              Explore. Engineer. Evolve.
            </p>
            <p className="text-gray-400 text-sm sm:text-base leading-relaxed pt-2 px-2">
              Zero Bugs Club is a project-driven, innovation-focused community dedicated to transforming ideas into
              real-world solutions. Join us for our {status?.event_title || 'upcoming event'} to build, experiment, and grow.
            </p>

            <div className="pt-4 flex flex-wrap justify-center items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 bg-[#171717] px-4 sm:px-5 py-3 border border-white/20 shadow-lg rounded-xl">
                <Calendar className="w-5 h-5 text-emerald-400 shrink-0" aria-hidden="true" />
                <div className="text-left">
                  <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold block">Event Date</span>
                  <span className="text-sm font-black text-white tracking-wide">{eventDate}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-[#171717] px-4 sm:px-5 py-3 border border-white/20 shadow-lg rounded-xl">
                <MapPin className="w-5 h-5 text-emerald-400 shrink-0" aria-hidden="true" />
                <div className="text-left">
                  <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold block">Venue</span>
                  <span className="text-sm font-black text-white tracking-wide">{venue}</span>
                </div>
              </div>
            </div>
          </div>

          <RegistrationForm status={status} statusError={error} onRegistered={refresh} />
        </div>
      </main>

      <footer className="border-t border-white/10 py-6 px-6 bg-black text-center text-xs text-gray-400 relative z-10">
        <p>© {new Date().getFullYear()} Zero Bugs Club — VIT Chennai</p>
      </footer>
    </div>
  );
}
