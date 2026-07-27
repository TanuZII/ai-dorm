import {
  Boxes, Building2, ClipboardList, CreditCard, Database, FileBarChart, LayoutDashboard,
  LogOut, MessageSquareText, ScrollText, ShieldCheck, Users, Wrench, X, Zap,
} from 'lucide-react'

const navigationItems = [
  { label: 'ภาพรวม', icon: LayoutDashboard },
  { label: 'ข้อมูลพื้นฐาน', icon: Database },
  { label: 'อาคารและห้องพัก', icon: Building2 },
  { label: 'ผู้เช่า', icon: Users },
  { label: 'การจองและสัญญา', icon: ClipboardList },
  { label: 'Check-out และเงินประกัน', icon: LogOut },
  { label: 'การเงิน', icon: CreditCard, badge: 12 },
  { label: 'มิเตอร์น้ำ–ไฟ', icon: Zap },
  { label: 'งานซ่อม', icon: Wrench, badge: 4 },
  { label: 'สต็อก', icon: Boxes },
  { label: 'ประกาศ', icon: MessageSquareText },
  { label: 'รายงาน', icon: FileBarChart },
  { label: 'ผู้ใช้และสิทธิ์', icon: ShieldCheck },
  { label: 'History Log', icon: ScrollText },
]

function Sidebar({ open, onClose, active, onNavigate, user, onLogout }) {
  return <>
    {open && <button aria-label="ปิดเมนู" onClick={onClose} className="fixed inset-0 z-30 bg-[#142a46]/40 lg:hidden" />}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col bg-[#142a46] text-white transition-transform duration-300 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-[76px] items-center gap-3 border-b border-white/10 px-6">
        <div className="grid size-10 place-items-center rounded-xl bg-[#f5bf3c] text-[#142a46]"><Building2 size={22} strokeWidth={2.2}/></div>
        <div><div className="font-['IBM_Plex_Sans'] text-[17px] font-semibold tracking-tight">CAMPUS NEST</div><div className="text-[11px] text-[#aebccd]">Dormitory Management</div></div>
        <button onClick={onClose} className="ml-auto text-white/70 lg:hidden"><X size={20}/></button>
      </div>
      <div className="px-4 pt-5"><p className="mb-2 px-3 text-[10px] font-semibold tracking-[.14em] text-[#7f93aa]">เมนูหลัก</p>
        <nav className="space-y-1">
          {navigationItems.map(item => <button key={item.label} onClick={() => { onNavigate(item.label); onClose() }} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition ${active === item.label ? 'bg-white text-[#142a46] shadow-sm' : 'text-[#c7d2de] hover:bg-white/7 hover:text-white'}`}>
            <item.icon size={18} strokeWidth={active === item.label ? 2.3 : 1.8}/><span>{item.label}</span>
            {item.badge && <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${active === item.label ? 'bg-[#fff0c8] text-[#8c6200]' : 'bg-[#e4a94b] text-[#142a46]'}`}>{item.badge}</span>}
          </button>)}
        </nav>
      </div>
      <div className="mt-auto border-t border-white/10 p-4">
        <button className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left hover:bg-white/7">
          <div className="grid size-9 place-items-center rounded-full bg-[#d9e6ef] text-xs font-bold text-[#25425f]">{(user?.display_name || 'สุภาวดี').slice(0,2)}</div>
          <div className="min-w-0"><p className="truncate text-xs font-medium">{user?.display_name || 'สุภาวดี พรหมมา'}</p><p className="text-[10px] text-[#8fa1b4]">{user?.roles?.[0]?.name || 'เจ้าหน้าที่หอพัก'}</p></div>
          <span onClick={event=>{event.stopPropagation();onLogout?.()}} title="ออกจากระบบ" className="ml-auto grid size-7 place-items-center rounded-lg text-[#8fa1b4] hover:bg-white/10 hover:text-white"><LogOut size={15}/></span>
        </button>
      </div>
    </aside>
  </>
}

export default Sidebar
