import {
  BarChart3,
  LayoutDashboard,
  Menu,
  Settings,
  UserRound,
  Users,
  X,
  Zap,
} from "lucide-react";
import { createElement, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider.jsx";
import {
  getFocusableElements,
  getTrappedFocusTarget,
  isolateApplicationRoot,
} from "../admin/adminFocusTrap.js";
import { getUserInitials } from "../account/accountModel.js";
import { LeadHuntBrand, LogoutButton } from "./auth/AuthComponents.jsx";

const MENU_ITEMS = Object.freeze([
  { id: "home", label: "Início", icon: LayoutDashboard },
  { id: "leads", label: "Meus Leads", icon: Users },
  { id: "automation", label: "Automação", icon: Zap },
  { id: "analysis", label: "Análise", icon: BarChart3 },
]);

function NavigationItems({ activeTab, onSelect }) {
  return (
    <nav className="flex-1 space-y-3" aria-label="Navegação operacional">
      {MENU_ITEMS.map(({ id, label, icon }) => (
        <button
          type="button"
          key={id}
          onClick={() => onSelect(id)}
          className={`flex min-h-12 w-full items-center gap-4 rounded-2xl px-5 py-3 text-left transition-all duration-300 ${
            activeTab === id
              ? "bg-black text-white shadow-xl shadow-black/20"
              : "text-slate-600 hover:bg-white/60 hover:text-black"
          }`}
        >
          {createElement(icon, { size: 22 })}
          <span className="text-[15px] font-bold">{label}</span>
        </button>
      ))}
    </nav>
  );
}

function UserArea({ onNavigate }) {
  const auth = useAuth();
  return (
    <div className="space-y-3 border-t border-black/5 pt-5">
      <div className="flex min-w-0 items-center gap-3 px-1">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-950 text-sm font-black text-white">
          {getUserInitials(auth.user?.name)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-800" title={auth.user?.name}>{auth.user?.name}</p>
          <p className="truncate text-xs font-semibold text-slate-400" title={auth.user?.email}>{auth.user?.email}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Link to="/account" onClick={onNavigate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 text-sm font-black text-slate-700 hover:bg-slate-200"><UserRound size={17} />Minha conta</Link>
        <LogoutButton />
      </div>
    </div>
  );
}

function MobileDrawer({ open, onClose, activeTab, onSelect, triggerRef }) {
  const drawerRef = useRef(null);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const drawer = drawerRef.current;
    const root = document.getElementById("root");
    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    const restoreRoot = isolateApplicationRoot(root);
    document.body.style.overflow = "hidden";
    (closeRef.current || getFocusableElements(drawer)[0] || drawer)?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = getFocusableElements(drawer);
      const target = getTrappedFocusTarget(
        elements,
        document.activeElement,
        event.shiftKey,
      );
      if (target || elements.length === 0) {
        event.preventDefault();
        (target || drawer)?.focus();
      }
    };
    const handleFocusIn = (event) => {
      if (!drawer?.contains(event.target)) {
        (getFocusableElements(drawer)[0] || drawer)?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
      document.body.style.overflow = previousOverflow;
      restoreRoot();
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open, triggerRef]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside id="operational-mobile-menu" ref={drawerRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Menu operacional" className="flex h-full w-[min(88vw,320px)] flex-col bg-white p-6 shadow-2xl outline-none">
        <div className="mb-8 flex items-center justify-between gap-4">
          <LeadHuntBrand compact />
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Fechar menu" className="grid min-h-11 min-w-11 place-items-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"><X size={20} /></button>
        </div>
        <NavigationItems activeTab={activeTab} onSelect={onSelect} />
        <button type="button" onClick={() => onSelect("settings")} className={`mb-5 flex min-h-12 w-full items-center gap-4 rounded-2xl px-5 py-3 text-left transition-all ${activeTab === "settings" ? "bg-black text-white" : "text-slate-600 hover:bg-slate-100"}`}><Settings size={22} /><span className="text-[15px] font-bold">Configurações</span></button>
        <UserArea onNavigate={onClose} />
      </aside>
    </div>,
    document.body,
  );
}

const Sidebar = ({ activeTab, setActiveTab }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const triggerRef = useRef(null);
  const selectMobile = (tab) => {
    setActiveTab(tab);
    setMobileOpen(false);
  };

  return (
    <>
      <header className="flex shrink-0 items-center justify-between border-b border-white/70 bg-white/85 px-4 py-3 backdrop-blur-xl lg:hidden">
        <LeadHuntBrand compact />
        <button ref={triggerRef} type="button" onClick={() => setMobileOpen(true)} aria-expanded={mobileOpen} aria-controls="operational-mobile-menu" aria-label="Abrir menu" className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700"><Menu size={21} /></button>
      </header>
      <aside className="z-20 hidden h-full w-72 shrink-0 flex-col border-r border-white/40 bg-white/40 p-8 backdrop-blur-2xl lg:flex">
        <div className="mb-14 px-2"><LeadHuntBrand /></div>
        <NavigationItems activeTab={activeTab} onSelect={setActiveTab} />
        <button type="button" onClick={() => setActiveTab("settings")} className={`mb-5 flex min-h-12 w-full items-center gap-4 rounded-2xl px-5 py-3 text-left transition-all ${activeTab === "settings" ? "bg-black text-white shadow-xl shadow-black/20" : "text-slate-600 hover:bg-white/60 hover:text-black"}`}><Settings size={22} /><span className="text-[15px] font-bold">Configurações</span></button>
        <UserArea />
      </aside>
      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} activeTab={activeTab} onSelect={selectMobile} triggerRef={triggerRef} />
    </>
  );
};

export default Sidebar;
