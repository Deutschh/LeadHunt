export default function MiniCard({
  title,
  label,
  value,
  desc,
  color = "slate",
}) {
  const cardTitle = title || label || "Métrica";

  const valueClass =
    color === "green"
      ? "text-emerald-500"
      : color === "red"
        ? "text-red-500"
        : color === "yellow"
          ? "text-amber-500"
          : "text-slate-900";

  return (
    <div className="bg-white rounded-[28px] border border-slate-100 p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">
        {cardTitle}
      </p>

      <p className={`text-2xl font-black ${valueClass}`}>{value}</p>

      {desc && (
        <p className="text-xs text-slate-400 font-medium mt-2">{desc}</p>
      )}
    </div>
  );
}
