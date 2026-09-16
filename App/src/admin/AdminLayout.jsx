import { ArrowLeft, Building2 } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider.jsx";
import { getAccountDestination } from "../auth/authFlow.js";
import { LeadHuntBrand, LogoutButton } from "../components/auth/AuthComponents.jsx";

function AccountsLink({ compact = false }) {
  return <NavLink to="/admin" aria-label={compact ? "Contas" : undefined} className={({ isActive }) => `flex items-center rounded-2xl text-sm font-black transition ${isActive ? "bg-slate-950 text-white shadow-lg shadow-slate-950/15" : "text-slate-600 hover:bg-white hover:text-slate-950"} ${compact ? "min-h-11 min-w-11 justify-center px-2 py-2" : "gap-3 px-4 py-3"}`}><Building2 size={19} /><span className={compact ? "sr-only" : ""}>Contas</span></NavLink>;
}

export default function AdminLayout() {
  const auth = useAuth();
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#F0F2F5] text-slate-900 lg:flex">
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-white/60 bg-white/60 p-8 backdrop-blur-2xl lg:flex">
        <Link to="/admin"><LeadHuntBrand compact /></Link>
        <p className="mb-8 mt-4 px-1 text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">Admin LeadHunt</p>
        <nav className="flex-1"><AccountsLink /></nav>
        <div className="space-y-3 border-t border-slate-100 pt-6">
          <Link to={getAccountDestination(auth)} className="flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold text-slate-600 hover:bg-white"><ArrowLeft size={17} />Voltar ao LeadHunt</Link>
          <LogoutButton />
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-white/70 bg-white/85 px-4 py-3 backdrop-blur-xl lg:hidden">
          <Link to="/admin"><LeadHuntBrand compact /></Link>
          <div className="flex items-center gap-2"><nav><AccountsLink compact /></nav><Link to={getAccountDestination(auth)} aria-label="Voltar ao LeadHunt" className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600"><ArrowLeft size={17} /></Link><LogoutButton compact /></div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] px-4 pb-20 pt-6 sm:px-6 sm:pt-8 lg:p-10 lg:pb-20"><Outlet /></main>
      </div>
    </div>
  );
}
