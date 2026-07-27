import { useEffect, useState } from 'react'
import { Droplets, Gauge, LoaderCircle, Zap } from 'lucide-react'
import { api } from '../../services/api'

const fieldClass = 'h-10 w-full rounded-xl border border-[#d7e1e7] bg-white px-3 text-xs outline-none transition focus:border-[#4c8fc8] focus:ring-2 focus:ring-[#4c8fc8]/15'
const initialForm = { roomId: '', utilityType: 'electricity', billingMonth: '', previousReading: '', currentReading: '', unitRate: '7', dueDate: '' }

function MeterOperations({ notify }) {
  const [rooms, setRooms] = useState([])
  const [meters, setMeters] = useState([])
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try { const [roomRows, meterRows] = await Promise.all([api('/rooms'), api('/meter-readings')]); setRooms(roomRows); setMeters(meterRows) }
    catch (error) { notify(error.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const submit = async event => {
    event.preventDefault(); setSaving(true)
    try {
      await api('/meter-readings', { method: 'POST', body: { roomId: Number(form.roomId), utilityType: form.utilityType, billingMonth: form.billingMonth, previousReading: Number(form.previousReading), currentReading: Number(form.currentReading), unitRate: Number(form.unitRate), dueDate: form.dueDate, issueInvoices: true } })
      notify('บันทึกมิเตอร์และออกใบแจ้งหนี้แล้ว'); setForm(initialForm); await load()
    } catch (error) { notify(error.message) }
    finally { setSaving(false) }
  }

  const waterCount = meters.filter(item => item.utility_type === 'water').length
  const electricityCount = meters.filter(item => item.utility_type === 'electricity').length
  return <div className="enter-up space-y-5">
    <section><div className="flex items-center gap-2 text-[10px] font-semibold text-[#397caf]"><Gauge size={13}/> ศูนย์มิเตอร์และสาธารณูปโภค 4.4.7–4.4.8</div><h2 className="mt-1 text-[25px] font-semibold tracking-[-.02em] text-[#152c46]">มิเตอร์น้ำ–ไฟรายเดือน</h2><p className="mt-1 text-xs text-[#718493]">บันทึกหน่วยใช้งาน หารตามจำนวนเตียง และออกใบแจ้งหนี้รายคนโดยอัตโนมัติ</p></section>
    <section className="grid gap-3 sm:grid-cols-3"><Metric icon={Gauge} label="รายการมิเตอร์" value={meters.length}/><Metric icon={Droplets} label="รายการค่าน้ำ" value={waterCount}/><Metric icon={Zap} label="รายการค่าไฟ" value={electricityCount}/></section>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_380px]">
      <section className="overflow-hidden rounded-2xl border border-[#dfe7eb] bg-white"><div className="border-b border-[#e5ebef] p-4"><h3 className="text-sm font-semibold">รายการมิเตอร์ล่าสุด</h3><p className="mt-1 text-[10px] text-[#7d8c98]">ยอดรวม ÷ จำนวนเตียง และออกใบแจ้งหนี้ให้ผู้พักแต่ละคน</p></div>{loading ? <Loading/> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-[11px]"><thead className="bg-[#f5f8f9] text-[#748694]"><tr>{['เดือน','อาคาร / ห้อง','ประเภท','หน่วยใช้','อัตรา','ต่อเตียง','สถานะใบแจ้งหนี้'].map(x=><th key={x} className="px-4 py-3 font-medium">{x}</th>)}</tr></thead><tbody className="divide-y divide-[#edf1f3]">{meters.map(x=><tr key={x.id}><td className="px-4 py-3">{x.billing_month}</td><td className="px-4 py-3 font-medium">{x.building_name} · {x.room_no}</td><td className="px-4 py-3">{x.utility_type==='water'?'น้ำประปา':'ไฟฟ้า'}</td><td className="px-4 py-3">{x.consumption}</td><td className="px-4 py-3">฿{x.unit_rate}</td><td className="px-4 py-3 font-semibold">฿{x.amount_per_bed}</td><td className="px-4 py-3 text-[#26715e]">{x.invoice_issued_at?'ออกแล้ว':'ยังไม่ออก'}</td></tr>)}</tbody></table>{meters.length===0&&<p className="py-12 text-center text-xs text-[#82919c]">ยังไม่มีข้อมูลมิเตอร์</p>}</div>}</section>
      <form onSubmit={submit} className="rounded-2xl border border-[#dfe7eb] bg-white p-5"><div className="mb-5"><p className="text-[10px] font-semibold text-[#397caf]">บันทึกรอบใหม่</p><h3 className="mt-1 text-lg font-semibold">จดมิเตอร์และตั้งหนี้</h3></div><div className="grid gap-4"><Field label="ห้องพัก"><select required value={form.roomId} onChange={e=>update('roomId',e.target.value)} className={fieldClass}><option value="">เลือกอาคารและห้อง</option>{rooms.map(x=><option key={x.id} value={x.id}>{x.building_name} · ชั้น {x.floor_no} · ห้อง {x.room_no}</option>)}</select></Field><Field label="ประเภทมิเตอร์"><select value={form.utilityType} onChange={e=>{update('utilityType',e.target.value);update('unitRate',e.target.value==='water'?'23':'7')}} className={fieldClass}><option value="electricity">ไฟฟ้า · ค่าเริ่มต้น 7 บาท</option><option value="water">น้ำประปา · ค่าเริ่มต้น 23 บาท</option></select></Field><Field label="รอบเดือน"><input required type="month" value={form.billingMonth} onChange={e=>update('billingMonth',e.target.value)} className={fieldClass}/></Field><div className="grid grid-cols-2 gap-3"><Field label="เลขครั้งก่อน"><input required type="number" min="0" step="0.01" value={form.previousReading} onChange={e=>update('previousReading',e.target.value)} className={fieldClass}/></Field><Field label="เลขปัจจุบัน"><input required type="number" min="0" step="0.01" value={form.currentReading} onChange={e=>update('currentReading',e.target.value)} className={fieldClass}/></Field></div><div className="grid grid-cols-2 gap-3"><Field label="อัตราต่อหน่วย"><input required type="number" min="0" step="0.01" value={form.unitRate} onChange={e=>update('unitRate',e.target.value)} className={fieldClass}/></Field><Field label="วันครบกำหนด"><input required type="date" value={form.dueDate} onChange={e=>update('dueDate',e.target.value)} className={fieldClass}/></Field></div></div><button disabled={saving} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#f5bf3c] py-3 text-xs font-semibold text-[#173653] shadow-[0_3px_0_#c28d15] disabled:opacity-60">{saving&&<LoaderCircle size={15} className="animate-spin"/>} บันทึกมิเตอร์และออกหนี้</button></form>
    </div>
  </div>
}

function Field({ label, children }) { return <label><span className="mb-1.5 block text-[10px] font-medium text-[#63798a]">{label}</span>{children}</label> }
function Loading(){return <div className="grid min-h-48 place-items-center"><LoaderCircle className="animate-spin text-[#397caf]"/></div>}
function Metric({icon:Icon,label,value}){return <div className="flex items-center gap-3 rounded-2xl border border-[#dfe7eb] bg-white p-4"><div className="grid size-10 place-items-center rounded-xl bg-[#edf5fb] text-[#397caf]"><Icon size={18}/></div><div><p className="text-[10px] text-[#748694]">{label}</p><p className="mt-1 text-lg font-semibold">{value} <span className="text-[10px] font-normal text-[#83929e]">รายการ</span></p></div></div>}

export default MeterOperations
