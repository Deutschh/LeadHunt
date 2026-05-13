export default function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-400 font-semibold">{label}</span>
      <span className="text-slate-800 font-bold text-right">{value}</span>
    </div>
  );
}