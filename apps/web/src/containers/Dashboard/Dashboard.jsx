import { useMemo, useState } from 'react'
import Sidebar from '../../components/Sidebar/Sidebar'
import StatCard from '../../components/StatCard/StatCard'
import RoomCard from '../../components/RoomCard/RoomCard'
import Finance from '../Finance/Finance'
import Tenants from '../Tenants/Tenants'
import Repairs from '../Repairs/Repairs'
import Inventory from '../Inventory/Inventory'
import Administration from '../Administration/Administration'
import MasterData from '../MasterData/MasterData'
import RoomOperations from '../RoomOperations/RoomOperations'
import MeterOperations from '../MeterOperations/MeterOperations'
import ContractDesk from '../ContractDesk/ContractDesk'
import Reports from '../Reports/Reports'
import Announcements from '../Announcements/Announcements'
import CheckoutDesk from '../CheckoutDesk/CheckoutDesk'
import {
  Bell, Building2, CalendarDays, ChevronDown, ChevronRight, CircleDollarSign,
  DoorOpen, GraduationCap, Hammer, LogOut, Menu, ReceiptText, Search, Settings,
  ShieldCheck, Users, Wrench, X,
} from 'lucide-react'

const roomsByFloor = {
  1: [
    { no: '101', beds: '2/2', status: 'full', tenant: 'หญิง' },
    { no: '102', beds: '1/2', status: 'partial', tenant: 'หญิง' },
    { no: '103', beds: '0/2', status: 'vacant' },
    { no: '104', beds: '—', status: 'repair', issue: 'แอร์ชำรุด' },
    { no: '105', beds: '2/2', status: 'full', tenant: 'หญิง' },
    { no: '106', beds: '0/2', status: 'unavailable' },
    { no: '107', beds: '1/2', status: 'partial', tenant: 'หญิง' },
    { no: '108', beds: '2/2', status: 'full', tenant: 'หญิง' },
  ],
  2: [
    { no: '201', beds: '2/2', status: 'full', tenant: 'หญิง' },
    { no: '202', beds: '2/2', status: 'full', tenant: 'หญิง' },
    { no: '203', beds: '0/2', status: 'vacant' },
    { no: '204', beds: '1/2', status: 'partial', tenant: 'หญิง' },
    { no: '205', beds: '0/2', status: 'vacant' },
    { no: '206', beds: '2/2', status: 'full', tenant: 'หญิง' },
    { no: '207', beds: '—', status: 'repair', issue: 'ระบบไฟ' },
    { no: '208', beds: '2/2', status: 'full', tenant: 'หญิง' },
  ],
  3: [
    { no: '301', beds: '1/2', status: 'partial', tenant: 'หญิง' },
    { no: '302', beds: '2/2', status: 'full', tenant: 'หญิง' },
    { no: '303', beds: '2/2', status: 'full', tenant: 'หญิง' },
    { no: '304', beds: '0/2', status: 'vacant' },
    { no: '305', beds: '2/2', status: 'full', tenant: 'หญิง' },
    { no: '306', beds: '0/2', status: 'unavailable' },
    { no: '307', beds: '1/2', status: 'partial', tenant: 'หญิง' },
    { no: '308', beds: '2/2', status: 'full', tenant: 'หญิง' },
  ],
  4: [
    { no: '401', beds: '2/2', status: 'full', tenant: 'หญิง' },
    { no: '402', beds: '0/2', status: 'vacant' },
    { no: '403', beds: '0/2', status: 'vacant' },
    { no: '404', beds: '2/2', status: 'full', tenant: 'หญิง' },
    { no: '405', beds: '1/2', status: 'partial', tenant: 'หญิง' },
    { no: '406', beds: '2/2', status: 'full', tenant: 'หญิง' },
    { no: '407', beds: '2/2', status: 'full', tenant: 'หญิง' },
    { no: '408', beds: '0/2', status: 'vacant' },
  ],
}

const statusStyle = {
  full: { label: 'มีผู้พัก', dot: 'bg-[#2f7d68]', bg: 'bg-[#eef8f5]', border: 'border-[#cde7df]', icon: 'text-[#2f7d68]' },
  partial: { label: 'ว่างบางเตียง', dot: 'bg-[#e5a11a]', bg: 'bg-[#fff8e8]', border: 'border-[#f3d999]', icon: 'text-[#ad7210]' },
  vacant: { label: 'ว่าง', dot: 'bg-[#4c8fc8]', bg: 'bg-[#f0f7fc]', border: 'border-[#c8dfef]', icon: 'text-[#397caf]' },
  repair: { label: 'ชำรุด', dot: 'bg-[#d65d51]', bg: 'bg-[#fff2f0]', border: 'border-[#f0c7c2]', icon: 'text-[#bd493f]' },
  unavailable: { label: 'ไม่พร้อม', dot: 'bg-[#8d98a5]', bg: 'bg-[#f4f5f6]', border: 'border-[#d9dde1]', icon: 'text-[#788491]' },
}

function Dashboard({ user, onLogout }) {
  const [sidebar, setSidebar] = useState(false)
  const [active, setActive] = useState('ภาพรวม')
  const [floor, setFloor] = useState(2)
  const [building, setBuilding] = useState('อาคาร 1 · หอพักหญิง')
  const [search, setSearch] = useState('')
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [toast, setToast] = useState('')
  const rooms = useMemo(() => roomsByFloor[floor].filter(r => r.no.includes(search.trim())), [floor, search])

  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(''), 2400) }

  return <div className="min-h-screen bg-[#f2f6f8]">
    <Sidebar open={sidebar} onClose={() => setSidebar(false)} active={active} onNavigate={setActive} user={user} onLogout={onLogout}/>
    <div className="lg:pl-[260px]">
      <header className="sticky top-0 z-20 flex h-[76px] items-center gap-3 border-b border-[#dfe7eb] bg-white/95 px-4 backdrop-blur md:px-7">
        <button onClick={() => setSidebar(true)} className="grid size-10 place-items-center rounded-xl border border-[#dce5ea] lg:hidden"><Menu size={20}/></button>
        <div><p className="text-[11px] text-[#7b8c9b]">ปีการศึกษา 2569 / ภาคเรียนที่ 1</p><h1 className="text-lg font-semibold text-[#172b45]">{active}</h1></div>
        <div className="ml-auto hidden w-[240px] items-center gap-2 rounded-xl border border-[#dbe4e9] bg-[#f8fafb] px-3 py-2 md:flex"><Search size={16} className="text-[#8292a0]"/><input value={search} onChange={e=>setSearch(e.target.value)} className="w-full bg-transparent text-xs outline-none placeholder:text-[#9eabb5]" placeholder="ค้นหาห้อง เช่น 204"/></div>
        <button className="relative grid size-10 place-items-center rounded-xl border border-[#dce5ea] bg-white text-[#54697c]"><Bell size={18}/><span className="absolute right-2 top-2 size-2 rounded-full border-2 border-white bg-[#d65d51]"/></button>
        <button onClick={()=>notify('เปิดเมนูตั้งค่าระบบ')} className="hidden size-10 place-items-center rounded-xl border border-[#dce5ea] bg-white text-[#54697c] sm:grid"><Settings size={18}/></button>
      </header>

      <main className="mx-auto max-w-[1500px] p-4 md:p-7">
        {active === 'การเงิน' ? <Finance notify={notify} user={user} />
          : active === 'ข้อมูลพื้นฐาน' ? <MasterData notify={notify} user={user} />
          : active === 'ห้องพัก' ? <RoomOperations notify={notify} />
          : active === 'มิเตอร์น้ำ–ไฟ' ? <MeterOperations notify={notify} />
          : active === 'การจองและสัญญา' ? <ContractDesk user={user} notify={notify} />
          : active === 'Check-out และเงินประกัน' ? <CheckoutDesk notify={notify} />
          : active === 'ผู้เช่า' ? <Tenants notify={notify} />
          : active === 'งานซ่อม' ? <Repairs notify={notify} />
          : active === 'สต็อก' ? <Inventory notify={notify} user={user} />
          : active === 'ประกาศ' ? <Announcements notify={notify} />
          : active === 'รายงาน' ? <Reports notify={notify} />
          : active === 'ผู้ใช้และสิทธิ์' ? <Administration key="admin" notify={notify} user={user} />
          : active === 'History Log' ? <Administration key="logs" notify={notify} user={user} initialTab="logs" />
          : <>
        <section className="enter-up mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div><div className="mb-1 flex items-center gap-2 text-[11px] font-medium text-[#41749e]"><CalendarDays size={14}/> วันจันทร์ที่ 27 กรกฎาคม 2569</div><h2 className="text-[25px] font-semibold tracking-[-.02em] text-[#152c46] md:text-[30px]">สวัสดีตอนบ่าย, คุณสุภาวดี</h2><p className="mt-1 text-sm text-[#718291]">ภาพรวมการเข้าพักและรายการที่ต้องดูแลวันนี้</p></div>
          <button onClick={()=>notify('กำลังเปิดขั้นตอนรับผู้เช่าใหม่')} className="flex items-center justify-center gap-2 rounded-xl bg-[#f5bf3c] px-4 py-2.5 text-xs font-semibold text-[#172b45] shadow-[0_3px_0_#c28d15] transition active:translate-y-0.5 active:shadow-none"><Users size={17}/> รับผู้เช่าใหม่</button>
        </section>

        <section className="enter-up enter-up-delay grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Users} title="ผู้พักอาศัยปัจจุบัน" value="846 คน" meta={['+18 คน', 'จากเดือนก่อน']} tone="bg-[#edf7f4] text-[#2f7d68]" accent="text-[#2f7d68]"/>
          <StatCard icon={DoorOpen} title="เตียงว่างพร้อมจอง" value="74 เตียง" meta={['8.0%', 'จากทั้งหมด 920 เตียง']} tone="bg-[#edf5fb] text-[#397caf]" accent="text-[#397caf]"/>
          <StatCard icon={CircleDollarSign} title="ยอดค้างชำระ" value="฿128,450" meta={['42 รายการ', 'เกินกำหนด 12 รายการ']} tone="bg-[#fff7e4] text-[#ad7210]" accent="text-[#ad7210]"/>
          <StatCard icon={Hammer} title="งานซ่อมที่เปิดอยู่" value="14 งาน" meta={['4 งาน', 'ต้องดำเนินการวันนี้']} tone="bg-[#fff0ee] text-[#bd493f]" accent="text-[#bd493f]"/>
        </section>

        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,.75fr)]">
          <section className="overflow-hidden rounded-2xl border border-[#dfe7eb] bg-white shadow-[0_2px_12px_rgba(22,45,68,.04)]">
            <div className="border-b border-[#e4eaee] p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><h3 className="font-semibold text-[#172b45]">ผังห้องพัก</h3><p className="mt-1 text-[11px] text-[#7a8b99]">ดูสถานะห้องและจำนวนเตียงแบบเรียลไทม์</p></div>
                <div className="flex flex-col gap-2 sm:flex-row"><label className="relative"><Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6c8091]" size={15}/><select value={building} onChange={e=>setBuilding(e.target.value)} className="h-10 appearance-none rounded-xl border border-[#d9e3e8] bg-[#f9fbfc] pl-9 pr-9 text-[11px] font-medium text-[#30485e] outline-none focus:ring-2 focus:ring-[#4c8fc8]/30"><option>อาคาร 1 · หอพักหญิง</option><option>อาคาร 2 · หอพักชาย</option><option>อาคาร 3 · หอพักบุคลากร</option></select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#718493]" size={14}/></label>
                  <div className="flex rounded-xl border border-[#d9e3e8] bg-[#f4f7f8] p-1">{[1,2,3,4].map(n=><button key={n} onClick={()=>setFloor(n)} className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition ${floor===n?'bg-white text-[#1a344f] shadow-sm':'text-[#7a8a98] hover:text-[#344f67]'}`}>ชั้น {n}</button>)}</div>
                </div></div>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">{Object.entries(statusStyle).map(([key,s])=><div key={key} className="flex items-center gap-1.5 text-[10px] text-[#687b8b]"><span className={`size-2 rounded-full ${s.dot}`}/>{s.label}</div>)}</div>
            </div>
            <div className="p-5"><div className="mb-3 flex items-center justify-between"><p className="text-xs font-semibold text-[#415a70]">{building} · ชั้น {floor}</p><p className="text-[10px] text-[#8695a2]">8 ห้อง · 16 เตียง</p></div>
              {rooms.length ? <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">{rooms.map(room=><RoomCard key={room.no} room={room} statusStyle={statusStyle} onSelect={setSelectedRoom}/>)}</div> : <div className="grid min-h-[205px] place-items-center text-center"><div><Search className="mx-auto mb-2 text-[#9aacb9]"/><p className="text-sm font-medium">ไม่พบห้องที่ค้นหา</p><button onClick={()=>setSearch('')} className="mt-2 text-xs text-[#397caf]">ล้างคำค้นหา</button></div></div>}
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-[#dfe7eb] bg-white p-5 shadow-[0_2px_12px_rgba(22,45,68,.04)]"><div className="mb-4 flex items-center justify-between"><div><h3 className="text-sm font-semibold">งานที่ต้องดูแล</h3><p className="mt-1 text-[10px] text-[#7e8e9c]">รายการเร่งด่วนสำหรับวันนี้</p></div><button className="text-[10px] font-medium text-[#397caf]">ดูทั้งหมด</button></div>
              <div className="space-y-1">
                {[{icon:ReceiptText,n:'12',t:'ใบแจ้งหนี้เกินกำหนด',c:'text-[#bd493f] bg-[#fff0ee]'},{icon:ShieldCheck,n:'7',t:'หลักฐานรอตรวจสอบ',c:'text-[#ad7210] bg-[#fff7e4]'},{icon:LogOut,n:'5',t:'นัดหมาย Check-out',c:'text-[#397caf] bg-[#edf5fb]'},{icon:Wrench,n:'4',t:'งานซ่อมเร่งด่วน',c:'text-[#7c619e] bg-[#f4eff9]'}].map((x,i)=><button key={x.t} onClick={()=>notify(`เปิดรายการ ${x.t}`)} className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-[#f5f8fa]"><div className={`grid size-9 place-items-center rounded-xl ${x.c}`}><x.icon size={16}/></div><span className="flex-1 text-xs text-[#455d71]">{x.t}</span><span className="font-['IBM_Plex_Sans'] text-sm font-semibold text-[#243d55]">{x.n}</span><ChevronRight size={15} className="text-[#9ba8b2]"/></button>)}
              </div>
            </section>
            <section className="rounded-2xl bg-[#213f5c] p-5 text-white shadow-[0_6px_20px_rgba(20,42,70,.15)]"><div className="flex items-start justify-between"><div><p className="text-[10px] text-[#adc0d0]">อัตราการเข้าพักทั้งหมด</p><p className="mt-1 font-['IBM_Plex_Sans'] text-3xl font-semibold">92.0%</p></div><GraduationCap className="text-[#f5bf3c]" size={26}/></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-white/12"><div className="h-full w-[92%] rounded-full bg-[#f5bf3c]"/></div><div className="mt-3 flex justify-between text-[10px] text-[#b8c8d5]"><span>846 เตียงมีผู้พัก</span><span>74 เตียงว่าง</span></div></section>
          </aside>
        </div>

        <section className="mt-5 overflow-hidden rounded-2xl border border-[#dfe7eb] bg-white shadow-[0_2px_12px_rgba(22,45,68,.04)]"><div className="flex items-center justify-between border-b border-[#e4eaee] px-5 py-4"><div><h3 className="text-sm font-semibold">กิจกรรมล่าสุด</h3><p className="mt-1 text-[10px] text-[#7e8e9c]">รายการเคลื่อนไหวในระบบวันนี้</p></div><button className="flex items-center gap-1 text-[10px] font-medium text-[#397caf]">ดูประวัติทั้งหมด <ChevronRight size={13}/></button></div>
          <div className="divide-y divide-[#edf1f3]">{[
            {initial:'นศ',color:'bg-[#e8f3fb] text-[#397caf]',name:'ณัฐชา แสงทอง',action:'ชำระค่าเช่าประจำเดือน',detail:'ใบเสร็จ #RC-690728-0142',amount:'+ ฿3,850',time:'14:32'},
            {initial:'กว',color:'bg-[#edf7f4] text-[#2f7d68]',name:'กวินท์ ศรีสุข',action:'ทำสัญญาเช่าใหม่',detail:'อาคาร 2 · ห้อง 305 · เตียง B',amount:'สำเร็จ',time:'13:48'},
            {initial:'สป',color:'bg-[#fff2e5] text-[#ad7210]',name:'สุภาวดี พรหมมา',action:'อนุมัติหลักฐานการชำระ',detail:'ใบแจ้งหนี้ #INV-6907-0834',amount:'฿4,120',time:'11:06'},
          ].map(a=><div key={a.time} className="flex items-center gap-3 px-5 py-3.5"><div className={`grid size-9 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${a.color}`}>{a.initial}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-[#2f475d]">{a.name} <span className="font-normal text-[#798a98]">· {a.action}</span></p><p className="mt-0.5 truncate text-[10px] text-[#96a2ac]">{a.detail}</p></div><div className="text-right"><p className="text-xs font-semibold text-[#36536a]">{a.amount}</p><p className="mt-0.5 text-[10px] text-[#9aa6af]">{a.time} น.</p></div></div>)}</div>
        </section>
        </>}
      </main>
    </div>

    {selectedRoom && <div className="fixed inset-0 z-50 grid place-items-end bg-[#142a46]/35 p-0 sm:place-items-center sm:p-4" onMouseDown={e=>e.target===e.currentTarget&&setSelectedRoom(null)}><div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"><div className="flex items-start justify-between"><div><p className="text-[10px] font-medium text-[#718493]">{building} · ชั้น {floor}</p><h3 className="mt-1 text-xl font-semibold">ห้อง {selectedRoom.no}</h3></div><button onClick={()=>setSelectedRoom(null)} className="grid size-9 place-items-center rounded-full bg-[#f2f5f7]"><X size={18}/></button></div><div className={`mt-5 rounded-2xl border p-4 ${statusStyle[selectedRoom.status].bg} ${statusStyle[selectedRoom.status].border}`}><div className="flex items-center gap-2"><span className={`size-2.5 rounded-full ${statusStyle[selectedRoom.status].dot}`}/><span className="text-sm font-semibold">{statusStyle[selectedRoom.status].label}</span></div><p className="mt-2 text-xs text-[#637789]">เตียงที่มีผู้พัก {selectedRoom.beds}{selectedRoom.issue ? ` · ${selectedRoom.issue}` : ''}</p></div><div className="mt-5 grid grid-cols-2 gap-3"><button onClick={()=>notify('เปิดรายละเอียดห้องพัก')} className="rounded-xl border border-[#dce5ea] py-2.5 text-xs font-medium">ดูรายละเอียด</button><button onClick={()=>notify(selectedRoom.status==='vacant'?'เริ่มการจองห้องนี้':'เปิดทะเบียนผู้พัก')} className="rounded-xl bg-[#173653] py-2.5 text-xs font-medium text-white">{selectedRoom.status==='vacant'?'จองห้องนี้':'ดูผู้พัก'}</button></div></div></div>}
    {toast && <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-[#172f49] px-4 py-3 text-xs font-medium text-white shadow-xl">{toast}</div>}
  </div>
}

export default Dashboard
