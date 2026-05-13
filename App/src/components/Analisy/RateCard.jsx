export default function RateCard({ title, value, desc }) {
  return (
    <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
        {title}
      </p>
      <p className="text-4xl font-black text-slate-900 my-2">{value}</p>
      <p className="text-xs text-slate-400 font-medium">{desc}</p>
    </div>
  );
}