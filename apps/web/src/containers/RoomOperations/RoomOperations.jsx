import { useEffect, useMemo, useState } from 'react'
import { api } from '../../services/api'
import {
  ArrowRightLeft, BedDouble, Building2, CalendarCheck, ClipboardCheck,
  DoorOpen, Gauge, LoaderCircle, LogOut, Search, ShieldCheck, UserPlus,
} from 'lucide-react'

const actions = [
  { id: 'reserve', label: 'จองห้องหรือเตียง', icon: UserPlus, hint: 'ตามประเภทผู้เช่า' },
  { id: 'transfer', label: 'ย้ายห้อง', icon: ArrowRightLeft, hint: 'บันทึกห้องเดิมและใหม่' },
  { id: 'checkout', label: 'ย้ายออก', icon: LogOut, hint: 'หนี้ ความเสียหาย เงินประกัน' },
  { id: 'readiness', label: 'ตรวจความพร้อม', icon: ClipboardCheck, hint: 'ยืนยันก่อนเปิดจอง' },
  { id: 'meter', label: 'บันทึกมิเตอร์', icon: Gauge, hint: 'หารตามจำนวนเตียง' },
]

const roomTone = {
  vacant: 'border-[#b9d9ec] bg-[#f0f8fd] text-[#276d9d]', occupied: 'border-[#bfe0d5] bg-[#eff8f5] text-[#26715e]',
  unavailable: 'border-[#d9dfe3] bg-[#f4f6f7] text-[#6f7d89]', damaged: 'border-[#efc6c1] bg-[#fff2f0] text-[#b74e44]',
}

const fieldClass = 'h-10 w-full rounded-xl border border-[#d7e1e7] bg-white px-3 text-xs outline-none transition focus:border-[#4c8fc8] focus:ring-2 focus:ring-[#4c8fc8]/15'
const initialForm = { tenantId: '', roomId: '', bedId: '', scope: 'bed', startsAt: '', endsAt: '', toBedId: '', transferDate: '', reason: '', checkoutDate: '', damageDetail: '', damageAmount: '0', ready: true, utilityType: 'electricity', billingMonth: '', previousReading: '', currentReading: '', unitRate: '7', dueDate: '' }

function RoomOperations({ notify }) {
  const [tab, setTab] = useState('availability')
  const [mode, setMode] = useState('rooms')
  const [action, setAction] = useState('reserve')
  const [rooms, setRooms] = useState([])
  const [beds, setBeds] = useState([])
  const [tenants, setTenants] = useState([])
  const [reservations, setReservations] = useState([])
  const [meters, setMeters] = useState([])
  const [filters, setFilters] = useState({ buildingId: 'all', floor: 'all', bedCount: 'all', search: '', availableOnly: true })
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [roomRows, bedRows, tenantRows, reservationRows, meterRows] = await Promise.all([
        api('/rooms'), api('/beds'), api('/tenants'), api('/reservations'), api('/meter-readings'),
      ])
      setRooms(roomRows); setBeds(bedRows); setTenants(tenantRows); setReservations(reservationRows); setMeters(meterRows)
    } catch (error) { notify(error.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const buildings = useMemo(() => [...new Map(rooms.map(x => [x.building_id, { id: x.building_id, name: x.building_name }])).values()], [rooms])
  const visibleRooms = useMemo(() => rooms.filter(room =>
    (filters.buildingId === 'all' || room.building_id === Number(filters.buildingId)) &&
    (filters.floor === 'all' || room.floor_no === Number(filters.floor)) &&
    (filters.bedCount === 'all' || room.bed_count === Number(filters.bedCount)) &&
    (!filters.availableOnly || (room.readiness_status === 'ready' && room.vacant_beds > 0 && !['unavailable', 'damaged'].includes(room.status))) &&
    room.room_no.includes(filters.search.trim())), [rooms, filters])
  const visibleBeds = useMemo(() => beds.filter(bed =>
    (filters.buildingId === 'all' || bed.building_id === Number(filters.buildingId)) &&
    (filters.floor === 'all' || bed.floor_no === Number(filters.floor)) &&
    (filters.bedCount === 'all' || bed.room_bed_count === Number(filters.bedCount)) &&
    (!filters.availableOnly || (bed.status === 'vacant' && bed.readiness_status === 'ready')) &&
    `${bed.room_no}${bed.bed_no}`.includes(filters.search.trim())), [beds, filters])
  const availableBeds = beds.filter(x => x.status === 'vacant' && x.readiness_status === 'ready')
  const selectedRoomBeds = beds.filter(x => x.room_id === Number(form.roomId) && x.status === 'vacant')

  const update = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const submit = async event => {
    event.preventDefault(); setSaving(true)
    try {
      if (action === 'reserve') await api('/reservations', { method: 'POST', body: { tenantId: Number(form.tenantId), scope: form.scope, roomId: Number(form.roomId), bedId: form.scope === 'bed' ? Number(form.bedId) : null, startsAt: form.startsAt, endsAt: form.endsAt || null } })
      if (action === 'transfer') await api('/room-transfers', { method: 'POST', body: { tenantId: Number(form.tenantId), toBedId: Number(form.toBedId), transferDate: form.transferDate, reason: form.reason } })
      if (action === 'checkout') await api('/checkouts', { method: 'POST', body: { tenantId: Number(form.tenantId), checkoutDate: form.checkoutDate, damageDetail: form.damageDetail || null, damageAmount: Number(form.damageAmount) } })
      if (action === 'readiness') await api(`/rooms/${form.roomId}/readiness`, { method: 'POST', body: { ready: form.ready, checklist: { cleanliness: true, electricity: true, water: true, furniture: true }, note: form.reason || null } })
      if (action === 'meter') await api('/meter-readings', { method: 'POST', body: { roomId: Number(form.roomId), utilityType: form.utilityType, billingMonth: form.billingMonth, previousReading: Number(form.previousReading), currentReading: Number(form.currentReading), unitRate: Number(form.unitRate), dueDate: form.dueDate, issueInvoices: true } })
      notify({ reserve: 'จองห้องพักเรียบร้อย', transfer: 'บันทึกการย้ายห้องแล้ว', checkout: 'ดำเนินการย้ายออกเรียบร้อย', readiness: 'ยืนยันความพร้อมห้องแล้ว', meter: 'บันทึกมิเตอร์และออกใบแจ้งหนี้แล้ว' }[action])
      setForm(initialForm); await load()
    } catch (error) { notify(error.message) } finally { setSaving(false) }
  }

  return <div className="enter-up space-y-5">
    <section className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
      <div><div className="flex items-center gap-2 text-[10px] font-semibold text-[#397caf]"><Building2 size={13}/> ศูนย์ปฏิบัติการห้องพัก 4.4</div><h2 className="mt-1 text-[25px] font-semibold tracking-[-.02em] text-[#152c46]">หนึ่งห้อง ทุกขั้นตอนการเข้าพัก</h2><p className="mt-1 text-xs text-[#718493]">ตรวจที่ว่าง จอง ย้าย ตรวจห้อง และตั้งหนี้ค่าสาธารณูปโภคจากข้อมูลชุดเดียวกัน</p></div>
      <div className="flex rounded-xl border border-[#d9e3e8] bg-white p-1">{[['availability','ห้องและเตียงว่าง'],['operations','งานเข้าพัก'],['utilities','มิเตอร์รายเดือน']].map(([id,label])=><button key={id} onClick={()=>setTab(id)} className={`rounded-lg px-3 py-2 text-[11px] font-medium ${tab===id?'bg-[#173653] text-white':'text-[#6e8191]'}`}>{label}</button>)}</div>
    </section>

    {tab === 'availability' && <>
      <section className="grid gap-3 rounded-2xl border border-[#dfe7eb] bg-white p-4 md:grid-cols-2 xl:grid-cols-[1fr_140px_150px_1fr_auto]">
        <select value={filters.buildingId} onChange={e=>setFilters(x=>({...x,buildingId:e.target.value}))} className={fieldClass}><option value="all">ทุกอาคาร</option>{buildings.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select value={filters.floor} onChange={e=>setFilters(x=>({...x,floor:e.target.value}))} className={fieldClass}><option value="all">ทุกชั้น</option>{[1,2,3,4].map(x=><option key={x} value={x}>ชั้น {x}</option>)}</select>
        <select value={filters.bedCount} onChange={e=>setFilters(x=>({...x,bedCount:e.target.value}))} className={fieldClass}><option value="all">ทุกขนาดห้อง</option><option value="1">1 เตียง</option><option value="2">2 เตียง</option><option value="3">3 เตียง</option><option value="4">4 เตียง</option></select>
        <label className="flex h-10 items-center gap-2 rounded-xl border border-[#d7e1e7] px-3"><Search size={14} className="text-[#80909c]"/><input value={filters.search} onChange={e=>setFilters(x=>({...x,search:e.target.value}))} placeholder="ค้นหาเลขห้องหรือเตียง" className="w-full text-xs outline-none"/></label>
        <label className="flex items-center gap-2 whitespace-nowrap text-[11px] text-[#526b7e]"><input type="checkbox" checked={filters.availableOnly} onChange={e=>setFilters(x=>({...x,availableOnly:e.target.checked}))} className="size-4 accent-[#397caf]"/> เฉพาะที่พร้อมจอง</label>
      </section>
      <section className="overflow-hidden rounded-2xl border border-[#dfe7eb] bg-white">
        <div className="flex items-center justify-between border-b border-[#e5ebef] p-4"><div><h3 className="text-sm font-semibold">ผลการตรวจสอบ</h3><p className="mt-1 text-[10px] text-[#7a8c99]">สถานะพร้อมจองต้องผ่านการยืนยันความพร้อมห้องแล้ว</p></div><div className="flex rounded-lg bg-[#f1f5f7] p-1"><button onClick={()=>setMode('rooms')} className={`rounded-md px-3 py-1.5 text-[10px] ${mode==='rooms'?'bg-white font-semibold shadow-sm':'text-[#7b8b98]'}`}>ห้องพัก</button><button onClick={()=>setMode('beds')} className={`rounded-md px-3 py-1.5 text-[10px] ${mode==='beds'?'bg-white font-semibold shadow-sm':'text-[#7b8b98]'}`}>เตียง</button></div></div>
        {loading ? <Loading/> : <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">{mode==='rooms' ? visibleRooms.map(room=><article key={room.id} className={`rounded-2xl border p-4 ${roomTone[room.status]}`}><div className="flex items-start justify-between"><div><p className="text-[10px] opacity-70">{room.building_name} · ชั้น {room.floor_no}</p><h3 className="mt-1 font-['IBM_Plex_Sans'] text-xl font-semibold">{room.room_no}</h3></div><DoorOpen size={20}/></div><div className="mt-5 flex items-end justify-between text-[11px]"><span>{room.vacant_beds}/{room.bed_count} เตียงว่าง</span><span className={`rounded-full px-2 py-1 ${room.readiness_status==='ready'?'bg-white/70':'bg-[#fff0dd] text-[#94610b]'}`}>{room.readiness_status==='ready'?'พร้อมจอง':'รอตรวจห้อง'}</span></div></article>) : visibleBeds.map(bed=><article key={bed.id} className="rounded-2xl border border-[#c8dfef] bg-[#f3f9fd] p-4 text-[#315c7a]"><div className="flex justify-between"><div><p className="text-[10px]">{bed.building_name} · ชั้น {bed.floor_no}</p><h3 className="mt-1 text-lg font-semibold">ห้อง {bed.room_no}</h3></div><BedDouble size={20}/></div><p className="mt-4 text-xs font-medium">เตียง {bed.bed_no} · ห้อง {bed.room_bed_count} เตียง</p></article>)}</div>}
      </section>
    </>}

    {tab === 'operations' && <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="space-y-2 rounded-2xl border border-[#dfe7eb] bg-white p-3">{actions.slice(0,4).map(item=><button key={item.id} onClick={()=>setAction(item.id)} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left ${action===item.id?'bg-[#173653] text-white':'hover:bg-[#f3f7f9]'}`}><span className={`grid size-9 place-items-center rounded-xl ${action===item.id?'bg-white/12':'bg-[#eaf3f9] text-[#397caf]'}`}><item.icon size={16}/></span><span><b className="block text-xs font-medium">{item.label}</b><small className={`text-[9px] ${action===item.id?'text-[#b8cad8]':'text-[#83929e]'}`}>{item.hint}</small></span></button>)}</aside>
      <OperationForm action={action} form={form} update={update} rooms={rooms} beds={availableBeds} selectedRoomBeds={selectedRoomBeds} tenants={tenants} saving={saving} onSubmit={submit}/>
    </div>}

    {tab === 'utilities' && <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_380px]">
      <section className="overflow-hidden rounded-2xl border border-[#dfe7eb] bg-white"><div className="border-b border-[#e5ebef] p-4"><h3 className="text-sm font-semibold">รายการมิเตอร์ล่าสุด</h3><p className="mt-1 text-[10px] text-[#7d8c98]">ยอดรวม ÷ จำนวนเตียง และออกใบแจ้งหนี้ให้ผู้พักแต่ละคน</p></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-[11px]"><thead className="bg-[#f5f8f9] text-[#748694]"><tr>{['เดือน','ห้อง','ประเภท','หน่วยใช้','อัตรา','ต่อเตียง','สถานะใบแจ้งหนี้'].map(x=><th key={x} className="px-4 py-3 font-medium">{x}</th>)}</tr></thead><tbody className="divide-y divide-[#edf1f3]">{meters.map(x=><tr key={x.id}><td className="px-4 py-3">{x.billing_month}</td><td className="px-4 py-3 font-medium">{x.room_no}</td><td className="px-4 py-3">{x.utility_type==='water'?'น้ำประปา':'ไฟฟ้า'}</td><td className="px-4 py-3">{x.consumption}</td><td className="px-4 py-3">฿{x.unit_rate}</td><td className="px-4 py-3 font-semibold">฿{x.amount_per_bed}</td><td className="px-4 py-3 text-[#26715e]">{x.invoice_issued_at?'ออกแล้ว':'ยังไม่ออก'}</td></tr>)}</tbody></table></div></section>
      <OperationForm action="meter" form={form} update={update} rooms={rooms} beds={availableBeds} selectedRoomBeds={selectedRoomBeds} tenants={tenants} saving={saving} onSubmit={submit}/>
    </div>}

    <section className="grid gap-3 sm:grid-cols-3"><Metric icon={ShieldCheck} label="ห้องพร้อมจอง" value={rooms.filter(x=>x.readiness_status==='ready'&&x.vacant_beds>0).length} unit="ห้อง"/><Metric icon={CalendarCheck} label="รายการจองที่เปิดอยู่" value={reservations.filter(x=>x.status==='reserved').length} unit="รายการ"/><Metric icon={BedDouble} label="เตียงว่าง" value={beds.filter(x=>x.status==='vacant'&&x.readiness_status==='ready').length} unit="เตียง"/></section>
  </div>
}

function OperationForm({ action, form, update, rooms, beds: availableBeds, selectedRoomBeds, tenants, saving, onSubmit }) {
  const title={reserve:'จองห้องหรือเตียง',transfer:'บันทึกการย้ายห้อง',checkout:'บันทึกการย้ายออก',readiness:'ยืนยันความพร้อมห้อง',meter:'บันทึกมิเตอร์และตั้งหนี้'}[action]
  return <form onSubmit={onSubmit} className="rounded-2xl border border-[#dfe7eb] bg-white p-5"><div className="mb-5"><p className="text-[10px] font-semibold text-[#397caf]">ขั้นตอนปฏิบัติงาน</p><h3 className="mt-1 text-lg font-semibold">{title}</h3></div><div className="grid gap-4 md:grid-cols-2">
    {['reserve','transfer','checkout'].includes(action)&&<Field label="ผู้เช่า"><select required value={form.tenantId} onChange={e=>update('tenantId',e.target.value)} className={fieldClass}><option value="">เลือกนักศึกษา บุคลากร หรือบุคคลภายนอก</option>{tenants.map(x=><option key={x.id} value={x.id}>{x.tenant_code} · {x.first_name} {x.last_name}</option>)}</select></Field>}
    {['reserve','readiness','meter'].includes(action)&&<Field label="ห้องพัก"><select required value={form.roomId} onChange={e=>{update('roomId',e.target.value);update('bedId','')}} className={fieldClass}><option value="">เลือกห้อง</option>{rooms.map(x=><option key={x.id} value={x.id}>{x.building_name} · ชั้น {x.floor_no} · ห้อง {x.room_no}</option>)}</select></Field>}
    {action==='reserve'&&<><Field label="รูปแบบการจอง"><select value={form.scope} onChange={e=>update('scope',e.target.value)} className={fieldClass}><option value="bed">จองเป็นเตียง</option><option value="room">จองทั้งห้อง</option></select></Field>{form.scope==='bed'&&<Field label="เตียง"><select required value={form.bedId} onChange={e=>update('bedId',e.target.value)} className={fieldClass}><option value="">เลือกเตียงว่าง</option>{selectedRoomBeds.map(x=><option key={x.id} value={x.id}>เตียง {x.bed_no}</option>)}</select></Field>}<Field label="วันที่เริ่มจอง"><input required type="date" value={form.startsAt} onChange={e=>update('startsAt',e.target.value)} className={fieldClass}/></Field><Field label="วันที่สิ้นสุด"><input type="date" value={form.endsAt} onChange={e=>update('endsAt',e.target.value)} className={fieldClass}/></Field></>}
    {action==='transfer'&&<><Field label="เตียงปลายทาง"><select required value={form.toBedId} onChange={e=>update('toBedId',e.target.value)} className={fieldClass}><option value="">เลือกห้องและเตียงที่พร้อม</option>{availableBeds.map(x=><option key={x.id} value={x.id}>{x.building_name} · ห้อง {x.room_no} · เตียง {x.bed_no}</option>)}</select></Field><Field label="วันที่ย้าย"><input required type="date" value={form.transferDate} onChange={e=>update('transferDate',e.target.value)} className={fieldClass}/></Field><Field label="เหตุผลการย้าย" wide><textarea required minLength={5} value={form.reason} onChange={e=>update('reason',e.target.value)} className={`${fieldClass} h-20 py-3`}/></Field></>}
    {action==='checkout'&&<><Field label="วันที่ย้ายออก"><input required type="date" value={form.checkoutDate} onChange={e=>update('checkoutDate',e.target.value)} className={fieldClass}/></Field><Field label="มูลค่าความเสียหาย"><input required type="number" min="0" step="0.01" value={form.damageAmount} onChange={e=>update('damageAmount',e.target.value)} className={fieldClass}/></Field><Field label="รายละเอียดความเสียหาย" wide><textarea value={form.damageDetail} onChange={e=>update('damageDetail',e.target.value)} className={`${fieldClass} h-20 py-3`} placeholder="เว้นว่างได้หากไม่มีความเสียหาย"/></Field></>}
    {action==='readiness'&&<><Field label="ผลการตรวจ"><select value={String(form.ready)} onChange={e=>update('ready',e.target.value==='true')} className={fieldClass}><option value="true">พร้อมเปิดให้จอง</option><option value="false">ยังไม่พร้อม</option></select></Field><Field label="หมายเหตุ"><input value={form.reason} onChange={e=>update('reason',e.target.value)} className={fieldClass}/></Field><div className="md:col-span-2 grid grid-cols-2 gap-2 rounded-xl bg-[#f3f8fb] p-3 text-[10px] text-[#496579]"><span>✓ ความสะอาด</span><span>✓ ระบบไฟฟ้า</span><span>✓ ระบบน้ำ</span><span>✓ เฟอร์นิเจอร์</span></div></>}
    {action==='meter'&&<><Field label="ประเภทมิเตอร์"><select value={form.utilityType} onChange={e=>{update('utilityType',e.target.value);update('unitRate',e.target.value==='water'?'23':'7')}} className={fieldClass}><option value="electricity">ไฟฟ้า · ค่าเริ่มต้น 7 บาท</option><option value="water">น้ำประปา · ค่าเริ่มต้น 23 บาท</option></select></Field><Field label="รอบเดือน"><input required type="month" value={form.billingMonth} onChange={e=>update('billingMonth',e.target.value)} className={fieldClass}/></Field><Field label="เลขครั้งก่อน"><input required type="number" min="0" step="0.01" value={form.previousReading} onChange={e=>update('previousReading',e.target.value)} className={fieldClass}/></Field><Field label="เลขปัจจุบัน"><input required type="number" min="0" step="0.01" value={form.currentReading} onChange={e=>update('currentReading',e.target.value)} className={fieldClass}/></Field><Field label="อัตราต่อหน่วย"><input required type="number" min="0" step="0.01" value={form.unitRate} onChange={e=>update('unitRate',e.target.value)} className={fieldClass}/></Field><Field label="วันครบกำหนด"><input required type="date" value={form.dueDate} onChange={e=>update('dueDate',e.target.value)} className={fieldClass}/></Field></>}
  </div><button disabled={saving} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#f5bf3c] py-3 text-xs font-semibold text-[#173653] shadow-[0_3px_0_#c28d15] disabled:opacity-60">{saving&&<LoaderCircle size={15} className="animate-spin"/>} บันทึก{title}</button></form>
}

function Field({ label, wide, children }) { return <label className={wide?'md:col-span-2':''}><span className="mb-1.5 block text-[10px] font-medium text-[#63798a]">{label}</span>{children}</label> }
function Loading(){return <div className="grid min-h-48 place-items-center"><LoaderCircle className="animate-spin text-[#397caf]"/></div>}
function Metric({icon:Icon,label,value,unit}){return <div className="flex items-center gap-3 rounded-2xl border border-[#dfe7eb] bg-white p-4"><div className="grid size-10 place-items-center rounded-xl bg-[#edf5fb] text-[#397caf]"><Icon size={18}/></div><div><p className="text-[10px] text-[#748694]">{label}</p><p className="mt-1 text-lg font-semibold">{value} <span className="text-[10px] font-normal text-[#83929e]">{unit}</span></p></div></div>}

export default RoomOperations
