import { useEffect, useState } from 'react'
import { CalendarRange, Droplets, LoaderCircle, Pencil, Plus, ReceiptText, X, Zap } from 'lucide-react'
import { api } from '../../services/api'

const fieldClass = 'h-10 w-full rounded-xl border border-[#d7e1e7] bg-white px-3 text-xs outline-none transition focus:border-[#4c8fc8] focus:ring-2 focus:ring-[#4c8fc8]/15'
const rentalPeriods = { daily: 'รายวัน', monthly: 'รายเดือน', term: 'รายภาคเรียน', yearly: 'รายปี' }
const tenantTypes = { student: 'นักศึกษา', staff: 'บุคลากร', external: 'บุคคลภายนอก' }

function FinanceSettings({ notify, canManage }) {
  const [data, setData] = useState({ rates: [], utilities: [], fees: [] })
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [editingFee, setEditingFee] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const [rates, utilities, fees] = await Promise.all([api('/rate-plans'), api('/utility-rates'), api('/fee-types')])
      setData({ rates, utilities, fees })
    } catch (error) { notify(error.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const save = async payload => {
    try {
      if (modal === 'rate') await api('/rate-plans', { method: 'POST', body: { name: payload.name, rentalPeriod: payload.rentalPeriod, tenantType: payload.tenantType || null, amount: Number(payload.amount), startsAt: payload.startsAt, endsAt: payload.endsAt || null } })
      if (modal === 'utility') await api('/utility-rates', { method: 'POST', body: { utilityType: payload.utilityType, unitRate: Number(payload.unitRate), minimumCharge: Number(payload.minimumCharge || 0), startsAt: payload.startsAt, endsAt: payload.endsAt || null } })
      if (modal === 'fee') await api('/fee-types', { method: 'POST', body: { code: payload.code.trim().toUpperCase(), name: payload.name, defaultAmount: Number(payload.defaultAmount || 0) } })
      if (modal === 'fee-edit') await api(`/fee-types/${editingFee.id}`, { method: 'PATCH', body: { name: payload.name, defaultAmount: Number(payload.defaultAmount || 0), active: payload.active === 'on' } })
      setModal(null)
      setEditingFee(null)
      notify('บันทึกอัตราใหม่และช่วงวันที่มีผลแล้ว')
      await load()
    } catch (error) { notify(error.message) }
  }

  if (loading) return <div className="grid min-h-48 place-items-center"><LoaderCircle className="animate-spin text-[#397caf]" /></div>
  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end"><div><h3 className="text-sm font-semibold">กำหนดอัตราและค่าธรรมเนียม</h3><p className="mt-1 text-[10px] text-[#7d8e9b]">เก็บประวัติอัตราตามวันเริ่ม–สิ้นสุด รองรับการเปลี่ยนอัตราในอนาคต</p></div></div>

    <RateSection title="อัตราค่าห้องพัก" detail="รายวัน · รายเดือน · รายภาคเรียน · รายปี" icon={CalendarRange} onAdd={canManage ? () => setModal('rate') : null}>
      <Table headers={['ชื่ออัตรา', 'ประเภทผู้เช่า', 'รอบเช่า', 'จำนวนเงิน', 'ช่วงวันที่มีผล']}>
        {data.rates.map(row => <tr key={row.id}><Cell><b>{row.name}</b></Cell><Cell>{tenantTypes[row.tenant_type] || 'ทุกประเภท'}</Cell><Cell>{rentalPeriods[row.rental_period]}</Cell><Cell><b>{money(row.amount)} บาท</b></Cell><Cell>{period(row.starts_at, row.ends_at)}</Cell></tr>)}
      </Table><Empty rows={data.rates} />
    </RateSection>

    <div className="grid gap-5 xl:grid-cols-2">
      <RateSection title="อัตราค่าสาธารณูปโภค" detail="อัตราต่อหน่วยและค่าบริการขั้นต่ำ" icon={Droplets} onAdd={canManage ? () => setModal('utility') : null}>
        <Table headers={['รายการ', 'ต่อหน่วย', 'ขั้นต่ำ', 'ช่วงวันที่มีผล']}>
          {data.utilities.map(row => <tr key={row.id}><Cell><span className="inline-flex items-center gap-2">{row.utility_type === 'water' ? <Droplets size={13} /> : <Zap size={13} />}{row.utility_type === 'water' ? 'ค่าน้ำประปา' : 'ค่าไฟฟ้า'}</span></Cell><Cell><b>{money(row.unit_rate)}</b></Cell><Cell>{money(row.minimum_charge)}</Cell><Cell>{period(row.starts_at, row.ends_at)}</Cell></tr>)}
        </Table><Empty rows={data.utilities} />
      </RateSection>
      <RateSection title="ค่าธรรมเนียมอื่น ๆ" detail="ค่าเริ่มต้นสำหรับการตั้งหนี้รายบุคคล" icon={ReceiptText} onAdd={canManage ? () => setModal('fee') : null}>
        <Table headers={['รหัส', 'ชื่อรายการ', 'ค่าเริ่มต้น', 'จัดการ']}>
          {data.fees.map(row => <tr key={row.id}><Cell><b>{row.code}</b></Cell><Cell>{row.name}</Cell><Cell><b>{money(row.default_amount)} บาท</b></Cell><Cell>{canManage && <button type="button" onClick={()=>{setEditingFee(row);setModal('fee-edit')}} className="inline-flex items-center gap-1 rounded-lg border border-[#d7e1e7] px-2 py-1 text-[9px]"><Pencil size={11}/> แก้ไข</button>}</Cell></tr>)}
        </Table><Empty rows={data.fees} />
      </RateSection>
    </div>
    {modal && <SettingsDialog type={modal} initial={editingFee} close={() => { setModal(null); setEditingFee(null) }} save={save} />}
  </div>
}

function RateSection({ title, detail, icon: Icon, onAdd, children }) { return <section className="rounded-2xl border border-[#dfe7eb] bg-[#fbfcfd] p-4"><div className="mb-4 flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#edf5fb] text-[#397caf]"><Icon size={17} /></span><div><h4 className="text-xs font-semibold text-[#2b455c]">{title}</h4><p className="text-[9px] text-[#82929d]">{detail}</p></div>{onAdd && <button onClick={onAdd} className="action-primary ml-auto"><Plus size={14} /> เพิ่มอัตรา</button>}</div>{children}</section> }
function Table({ headers, children }) { return <div className="overflow-x-auto rounded-xl border border-[#e0e8ec] bg-white"><table className="w-full min-w-[620px] text-left text-[10px]"><thead className="bg-[#f5f8f9] text-[#718392]"><tr>{headers.map(header => <th key={header} className="px-3 py-2.5 font-medium">{header}</th>)}</tr></thead><tbody className="divide-y divide-[#edf1f3]">{children}</tbody></table></div> }
function Cell({ children }) { return <td className="px-3 py-3 align-top text-[#40596e]">{children}</td> }
function Empty({ rows }) { return rows.length ? null : <p className="py-8 text-center text-[10px] text-[#82919c]">ยังไม่มีข้อมูลอัตรา</p> }

function SettingsDialog({ type, initial, close, save }) {
  const [saving, setSaving] = useState(false)
  const title = { rate: 'เพิ่มอัตราค่าห้องพัก', utility: 'เพิ่มอัตราค่าสาธารณูปโภค', fee: 'เพิ่มค่าธรรมเนียม', 'fee-edit': 'แก้ไขค่าธรรมเนียม' }[type]
  const submit = async event => { event.preventDefault(); setSaving(true); try { await save(Object.fromEntries(new FormData(event.currentTarget))) } finally { setSaving(false) } }
  return <div className="fixed inset-0 z-50 grid place-items-end bg-[#142a46]/45 sm:place-items-center sm:p-4" onMouseDown={event => event.target === event.currentTarget && close()}><form onSubmit={submit} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"><div className="flex items-center border-b border-[#e5ebef] p-5"><div><h3 className="text-base font-semibold">{title}</h3><p className="mt-1 text-[10px] text-[#7d8e9b]">การเพิ่มอัตราใหม่จะไม่แก้ไขประวัติอัตราเดิม</p></div><button type="button" onClick={close} className="ml-auto grid size-9 place-items-center rounded-full bg-[#f2f5f7]"><X size={17} /></button></div><div className="grid gap-4 p-5">
    {type === 'rate' && <><Field label="ชื่ออัตรา"><input required name="name" className={fieldClass} placeholder="เช่น นักศึกษา รายภาคเรียน 1/2569" /></Field><div className="grid grid-cols-2 gap-3"><Field label="รอบการเช่า"><select name="rentalPeriod" className={fieldClass}>{Object.entries(rentalPeriods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="ประเภทผู้เช่า"><select name="tenantType" className={fieldClass}><option value="">ทุกประเภท</option>{Object.entries(tenantTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div><Field label="จำนวนเงิน (บาท)"><input required min="0" step="0.01" type="number" name="amount" className={fieldClass} /></Field></>}
    {type === 'utility' && <><Field label="รายการสาธารณูปโภค"><select name="utilityType" className={fieldClass}><option value="water">ค่าน้ำประปา</option><option value="electricity">ค่าไฟฟ้า</option></select></Field><div className="grid grid-cols-2 gap-3"><Field label="อัตราต่อหน่วย"><input required min="0" step="0.01" type="number" name="unitRate" className={fieldClass} /></Field><Field label="ค่าบริการขั้นต่ำ"><input min="0" step="0.01" type="number" name="minimumCharge" defaultValue="0" className={fieldClass} /></Field></div></>}
    {['fee','fee-edit'].includes(type) && <><Field label="รหัสค่าธรรมเนียม"><input required name="code" defaultValue={initial?.code || ''} disabled={type==='fee-edit'} className={fieldClass} placeholder="เช่น DAMAGE" /></Field><Field label="ชื่อรายการ"><input required name="name" defaultValue={initial?.name || ''} className={fieldClass} placeholder="เช่น ค่าปรับทรัพย์สินเสียหาย" /></Field><Field label="จำนวนเงินเริ่มต้น"><input required min="0" step="0.01" type="number" name="defaultAmount" defaultValue={initial?.default_amount ?? 0} className={fieldClass} /></Field>{type==='fee-edit'&&<label className="flex items-center gap-2 text-xs"><input type="checkbox" name="active" defaultChecked={initial?.active!==0} className="size-4 accent-[#397caf]"/> เปิดใช้งาน</label>}</>}
    {!['fee','fee-edit'].includes(type) && <div className="grid grid-cols-2 gap-3"><Field label="วันที่เริ่มใช้"><input required type="date" name="startsAt" className={fieldClass} /></Field><Field label="วันที่สิ้นสุด (ถ้ามี)"><input type="date" name="endsAt" className={fieldClass} /></Field></div>}
  </div><div className="flex gap-2 border-t border-[#e5ebef] p-4"><button type="button" onClick={close} className="flex-1 rounded-xl border border-[#d8e2e7] py-2.5 text-xs">ปิด</button><button disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#f5bf3c] py-2.5 text-xs font-semibold text-[#173653]">{saving && <LoaderCircle size={14} className="animate-spin" />} บันทึกอัตรา</button></div></form></div>
}

function Field({ label, children }) { return <label><span className="mb-1.5 block text-[10px] font-medium text-[#617688]">{label}</span>{children}</label> }
function money(value) { return Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function period(from, to) { return `${new Date(from).toLocaleDateString('th-TH')} – ${to ? new Date(to).toLocaleDateString('th-TH') : 'ไม่มีกำหนด'}` }

export default FinanceSettings
