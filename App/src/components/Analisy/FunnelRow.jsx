export default function FunnelRow({ label, value, total }) {
  const percentage = total > 0 ? (Number(value || 0) / Number(total || 1)) * 100 : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-slate-700">{label}</span>
        <span className="text-sm font-black text-slate-900">{value}</span>
      </div>

      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-slate-900 rounded-full transition-all duration-500"
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}