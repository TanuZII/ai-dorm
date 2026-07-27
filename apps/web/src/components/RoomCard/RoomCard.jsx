import { DoorOpen } from 'lucide-react'

function RoomCard({ room, statusStyle, onSelect }) {
  const style = statusStyle[room.status]
  return <button onClick={() => onSelect(room)} className={`group relative min-h-[98px] rounded-xl border p-3 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${style.bg} ${style.border}`}>
    <div className="flex items-start justify-between"><span className="font-['IBM_Plex_Sans'] text-base font-semibold text-[#1b324b]">{room.no}</span><DoorOpen size={17} className={style.icon}/></div>
    <div className="mt-4 flex items-end justify-between gap-2"><div><p className="text-[10px] text-[#718292]">เตียงที่มีผู้พัก</p><p className="font-['IBM_Plex_Sans'] text-xs font-semibold text-[#334a60]">{room.beds}</p></div><span className={`size-2 rounded-full ${style.dot}`} /></div>
  </button>
}

export default RoomCard
