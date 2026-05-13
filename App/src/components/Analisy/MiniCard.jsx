export default function MiniCard({ label, value, color = "slate" }) {
  return (
    <div className="bg-white rounded-[28px] border border-slate-100 p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">
        {label}
      </p>

      <p
        className={`text-2xl font-black ${
          color === "green"
            ? "text-emerald-500"
            : color === "red"
              ? "text-red-500"
              : color === "yellow"
                ? "text-amber-500"
                : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}