function StatCard({ icon: Icon, title, value, meta, tone, accent }) {
  return <div className="relative overflow-hidden rounded-2xl border border-[#dfe7eb] bg-white p-5 shadow-[0_2px_12px_rgba(22,45,68,.04)]">
    <div className="flex items-start justify-between"><div><p className="text-xs text-[#687b8c]">{title}</p><p className="mt-2 font-['IBM_Plex_Sans'] text-[27px] font-semibold tracking-tight text-[#172b45]">{value}</p></div><div className={`grid size-10 place-items-center rounded-xl ${tone}`}><Icon size={20}/></div></div>
    <div className="mt-3 flex items-center gap-2 text-[11px]"><span className={`font-semibold ${accent}`}>{meta[0]}</span><span className="text-[#8795a3]">{meta[1]}</span></div>
  </div>
}

export default StatCard
