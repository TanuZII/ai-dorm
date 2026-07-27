import { useEffect, useMemo, useState } from 'react'
import { Building2, ChevronRight, GraduationCap, Layers3, LoaderCircle, MapPinned, Plus, Search, Settings2, X } from 'lucide-react'
import { api } from '../../services/api'

const fieldClass = 'h-10 w-full rounded-xl border border-[#d7e1e7] bg-white px-3 text-xs outline-none transition focus:border-[#4c8fc8] focus:ring-2 focus:ring-[#4c8fc8]/15'
const categoryConfig = {
  title: { label: 'คำนำหน้าชื่อ', hint: 'นาย, นาง, นางสาว' },
  country: { label: 'ประเทศ', hint: 'ประเทศตามข้อมูลที่อยู่มาตรฐาน' },
  province: { label: 'จังหวัด', hint: 'จังหวัดของประเทศไทย' },
  district: { label: 'อำเภอ / เขต', hint: 'ผูกกับจังหวัด', parent: 'province' },
  subdistrict: { label: 'ตำบล / แขวง', hint: 'ผูกกับอำเภอ พร้อมรหัสไปรษณีย์', parent: 'district', postalCode: true },
  tenant_type: { label: 'ประเภทผู้เช่า', hint: 'นักศึกษา บุคลากร บุคคลภายนอก และอื่น ๆ' },
  rental_type: { label: 'ประเภทการเช่า', hint: 'รายวัน รายเดือน รายภาคเรียน และรายปี' },
  contract_type: { label: 'ประเภทสัญญา', hint: 'ประเภทสัญญาตามกลุ่มผู้เช่า' },
  fee_type: { label: 'รายการค่าธรรมเนียม', hint: 'ค่าห้อง น้ำ ไฟ ค่าปรับ และค่าอื่น ๆ' },
  room_type: { label: 'ประเภทห้อง', hint: 'ห้องพัก ห้องชุด สำนักงาน และพื้นที่ส่วนกลาง' },
  building: { label: 'อาคาร', hint: 'อาคารภายในโครงการหอพัก' },
  floor: { label: 'ชั้น', hint: 'ชั้นภายในอาคาร', parent: 'building' },
  room: { label: 'ห้อง', hint: 'อาคาร ชั้น ชื่อห้อง เลขที่ห้อง และจำนวนเตียง', parent: 'floor', codeLabel: 'เลขที่ห้อง', nameLabel: 'ชื่อห้อง', bedCount: true },
  bed: { label: 'เตียง', hint: 'เลขที่ห้องและลำดับของเตียง', parent: 'room', codeLabel: 'ลำดับเตียง', nameLabel: 'ชื่อเตียง' },
  academic_year: { label: 'ปีการศึกษา', hint: 'ปีและภาคเรียนที่เปิดใช้งาน', academicTerm: true },
  faculty: { label: 'คณะ / โรงเรียน', hint: 'หน่วยงานต้นสังกัดของนักศึกษา' },
  major: { label: 'สาขาวิชา', hint: 'สาขาวิชาที่ผูกกับคณะ', parent: 'faculty' },
}
const groups = {
  general: { label: 'ข้อมูลทั่วไป', icon: Layers3, categories: ['title', 'country', 'tenant_type', 'rental_type', 'contract_type', 'fee_type'] },
  location: { label: 'ที่อยู่ประเทศไทย', icon: MapPinned, categories: ['province', 'district', 'subdistrict'] },
  space: { label: 'อาคาร ห้อง และเตียง', icon: Building2, categories: ['room_type', 'building', 'floor', 'room', 'bed', 'academic_year'] },
  education: { label: 'คณะและสาขาวิชา', icon: GraduationCap, categories: ['faculty', 'major'] },
}
const tabs = [['catalog', 'ข้อมูลอ้างอิง'], ['space', 'อาคาร ห้อง และเตียง'], ['policy', 'นโยบายค่าเช่า'], ['education', 'คณะและสาขา']]

function MasterData({ notify, user }) {
  const canManage = user?.permissions?.includes('master.manage')
  const [tab, setTab] = useState('catalog')
  const [group, setGroup] = useState('general')
  const [category, setCategory] = useState('title')
  const [rows, setRows] = useState([])
  const [parents, setParents] = useState([])
  const [policies, setPolicies] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState(null)
  const [policyEditor, setPolicyEditor] = useState(null)

  const load = async () => {
    setLoading(true)
    if (tab !== 'policy') { setRows([]); setParents([]) }
    try {
      if (tab === 'policy') {
        setPolicies(await api('/rate-policies'))
      } else {
        const config = categoryConfig[category]
        const [items, parentItems] = await Promise.all([api(`/master-data/${category}`), config.parent ? api(`/master-data/${config.parent}`) : Promise.resolve([])])
        setRows(items)
        setParents(parentItems.filter(item => item.active))
      }
    } catch (error) { notify(error.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [tab, category])

  const selectTab = id => {
    setTab(id)
    setQuery('')
    if (id === 'catalog') { setGroup('general'); setCategory('title') }
    if (id === 'space') { setGroup('space'); setCategory('room_type') }
    if (id === 'education') { setGroup('education'); setCategory('faculty') }
  }
  const selectGroup = id => { setGroup(id); setCategory(groups[id].categories[0]); setQuery('') }
  const filtered = useMemo(() => rows.filter(row => `${row.code} ${row.name} ${row.parent_name || ''}`.toLowerCase().includes(query.toLowerCase())), [rows, query])
  const save = async payload => {
    try {
      if (editor.mode === 'cancel') {
        await api(`/master-data/${category}/${editor.item.id}`, { method: 'DELETE', body: { reason: payload.reason } })
        setEditor(null); notify(`ยกเลิก${categoryConfig[category].label}แล้ว`); await load(); return
      }
      const details = {}
      if (payload.postalCode) details.postalCode = payload.postalCode
      if (payload.note) details.note = payload.note
      if (payload.bedCount) details.bedCount = Number(payload.bedCount)
      if (payload.term) details.term = payload.term
      const editing = editor.mode === 'edit'
      await api(editing ? `/master-data/${category}/${editor.item.id}` : `/master-data/${category}`, { method: editing ? 'PATCH' : 'POST', body: editing ? { name: payload.name.trim(), parentId: payload.parentId ? Number(payload.parentId) : null, details: Object.keys(details).length ? details : null } : { code: payload.code.trim().toUpperCase(), name: payload.name.trim(), parentId: payload.parentId ? Number(payload.parentId) : null, details: Object.keys(details).length ? details : null } })
      setEditor(null)
      notify(`${editing ? 'แก้ไข' : 'เพิ่ม'}${categoryConfig[category].label}แล้ว`)
      await load()
    } catch (error) { notify(error.message) }
  }
  const savePolicy = async payload => {
    const number = key => Number(payload[key])
    try {
      await api('/rate-policies', { method: 'POST', body: {
        code: payload.code.trim().toUpperCase(), name: payload.name.trim(), tenantCohort: payload.tenantCohort,
        rentalPeriod: payload.rentalPeriod, rateScope: payload.rateScope, amount: number('amount'),
        occupancyLimit: number('occupancyLimit'), utilitySplitDivisor: number('utilitySplitDivisor'),
        waterRate: number('waterRate'), electricityRate: number('electricityRate'), depositAmount: number('depositAmount'),
        dueDay: number('dueDay'), lateFee: number('lateFee'), delinquencyMonths: number('delinquencyMonths'),
        terminationAction: payload.terminationAction.trim() || undefined, startsAt: payload.startsAt, endsAt: payload.endsAt || null,
      } })
      setPolicyEditor(null); notify('เพิ่มเวอร์ชันนโยบายค่าเช่าแล้ว'); await load()
    } catch (error) { notify(error.message) }
  }

  return <div className="enter-up space-y-5">
    <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><div className="flex items-center gap-2 text-[10px] font-medium text-[#41749e]"><Settings2 size={13} /> ศูนย์ข้อมูลพื้นฐาน</div><h2 className="mt-1 text-[25px] font-semibold text-[#152c46]">กำหนดครั้งเดียว ใช้ร่วมกันทั้งระบบ</h2><p className="mt-1 text-xs text-[#748594]">เพิ่มข้อมูลอ้างอิงและโครงสร้างแบบลำดับชั้นจากฐานข้อมูลจริง</p></div>{canManage && (tab === 'policy' ? <button onClick={() => setPolicyEditor({})} className="action-primary"><Plus size={16} /> เพิ่มนโยบายค่าเช่า</button> : <button onClick={() => setEditor({ mode: 'create' })} className="action-primary"><Plus size={16} /> เพิ่ม{categoryConfig[category].label}</button>)}</section>

    <section className="overflow-hidden rounded-2xl border border-[#dfe7eb] bg-white"><div className="flex overflow-x-auto border-b border-[#e4eaee] px-5">{tabs.map(([id, label]) => <button key={id} onClick={() => selectTab(id)} className={`relative min-w-max px-4 py-3 text-xs ${tab === id ? 'font-medium text-[#173653]' : 'text-[#748594]'}`}>{label}{tab === id && <span className="absolute inset-x-3 bottom-0 h-0.5 bg-[#f0b72d]" />}</button>)}</div>
      {tab === 'policy' ? <PolicyList rows={policies} loading={loading} canManage={canManage} version={item => setPolicyEditor(item)} /> : <div className="grid min-h-[520px] md:grid-cols-[240px_1fr]"><aside className="border-r border-[#e7edf0] bg-[#f8fafb] p-3">
        {tab === 'catalog' && ['general', 'location'].map(id => <GroupButton key={id} id={id} active={group === id} select={selectGroup} />)}
        {groups[group].categories.map(id => { const config = categoryConfig[id]; return <button key={id} onClick={() => { setCategory(id); setQuery('') }} className={`mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[11px] ${category === id ? 'bg-white font-medium text-[#294259] shadow-sm' : 'text-[#697d8d]'}`}><span className={`size-1.5 rounded-full ${category === id ? 'bg-[#f0b72d]' : 'bg-[#bdc8cf]'}`} />{config.label}<ChevronRight size={13} className="ml-auto" /></button> })}
      </aside><div className="p-5"><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end"><div><h3 className="text-sm font-semibold">{categoryConfig[category].label}</h3><p className="mt-1 text-[10px] text-[#81909c]">{categoryConfig[category].hint} · พบ {rows.length} รายการ</p></div><label className="search sm:ml-auto"><Search size={14} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหารหัสหรือชื่อ" /></label></div>
        {loading ? <Loading /> : <MasterTable rows={filtered} canManage={canManage} edit={item => setEditor({ mode: 'edit', item })} cancel={item => setEditor({ mode: 'cancel', item })} />}
      </div></div>}
    </section>
    {editor && <MasterDialog config={categoryConfig[category]} parents={parents} editor={editor} close={() => setEditor(null)} save={save} />}
    {policyEditor && <PolicyDialog item={policyEditor} close={() => setPolicyEditor(null)} save={savePolicy} />}
  </div>
}

function GroupButton({ id, active, select }) { const config = groups[id], Icon = config.icon; return <button onClick={() => select(id)} className={`mb-2 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs ${active ? 'bg-white font-medium text-[#294259] shadow-sm' : 'text-[#697d8d]'}`}><Icon size={15} />{config.label}<ChevronRight size={13} className="ml-auto" /></button> }
function MasterTable({ rows, canManage, edit, cancel }) { return <div className="overflow-x-auto rounded-xl border border-[#e0e8ec]"><table className="w-full min-w-[700px] text-left text-[11px]"><thead className="bg-[#f5f8f9] text-[#718392]"><tr><th className="px-4 py-3 font-medium">รหัส</th><th className="px-4 py-3 font-medium">ชื่อรายการ</th><th className="px-4 py-3 font-medium">ข้อมูลแม่</th><th className="px-4 py-3 font-medium">รายละเอียด</th><th className="px-4 py-3 font-medium">สถานะ</th>{canManage && <th className="px-4 py-3 font-medium">ดำเนินการ</th>}</tr></thead><tbody className="divide-y divide-[#edf1f3]">{rows.map(row => <tr key={row.id}><td className="px-4 py-3 font-['IBM_Plex_Sans'] font-semibold text-[#36536a]">{row.code}</td><td className="px-4 py-3 font-medium text-[#294259]">{row.name}</td><td className="px-4 py-3 text-[#6e8291]">{row.parent_name || '—'}</td><td className="px-4 py-3 text-[#6e8291]">{detailText(row.details)}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[9px] ${row.active ? 'bg-[#edf7f4] text-[#2f7d68]' : 'bg-[#f1f3f5] text-[#778692]'}`}>{row.active ? 'ใช้งาน' : 'ยกเลิก'}</span></td>{canManage && <td className="px-4 py-3"><div className="flex gap-2"><button onClick={() => edit(row)} className="text-[10px] text-[#397caf]">แก้ไข</button>{row.active && <button onClick={() => cancel(row)} className="text-[10px] text-[#b74e44]">ยกเลิก</button>}</div></td>}</tr>)}</tbody></table>{rows.length === 0 && <p className="py-12 text-center text-xs text-[#82919c]">ยังไม่มีข้อมูลในหมวดนี้</p>}</div> }

function PolicyList({ rows, loading, canManage, version }) { if (loading) return <Loading />; return <div className="p-5"><div className="mb-4"><h3 className="text-sm font-semibold">นโยบายจัดเก็บค่าเช่าและค่าธรรมเนียม</h3><p className="mt-1 text-[10px] text-[#81909c]">สร้างเวอร์ชันใหม่พร้อมช่วงวันที่บังคับใช้ เพื่อรักษาประวัติอัตราเดิม</p></div><div className="grid gap-3 lg:grid-cols-2">{rows.map(row => <article key={row.id} className={`rounded-2xl border p-4 ${row.active ? 'border-[#dce6eb]' : 'border-[#e4e8ea] bg-[#f7f8f9] opacity-70'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-['IBM_Plex_Sans'] text-[9px] font-semibold text-[#6f8291]">{row.code}</p><h4 className="mt-1 text-xs font-semibold">{row.name}</h4><p className="mt-1 text-[9px] text-[#82919d]">{row.tenant_cohort} · {row.rental_period} · {row.rate_scope === 'room' ? 'ต่อห้อง' : 'ต่อคน'}</p></div><span className={`rounded-full px-2 py-1 text-[9px] ${row.active ? 'bg-[#edf7f4] text-[#2f7d68]' : 'bg-[#eceff1] text-[#788792]'}`}>{row.active ? 'ใช้งาน' : 'ยกเลิก'}</span></div><div className="mt-4 grid grid-cols-3 gap-2"><PolicyValue label="ค่าเช่า" value={money(row.amount)} /><PolicyValue label="ค่าน้ำ / หน่วย" value={money(row.water_rate)} /><PolicyValue label="ค่าไฟ / หน่วย" value={money(row.electricity_rate)} /></div><div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-[#718493]"><span>ประกัน ฿{money(row.deposit_amount)}</span><span>ครบกำหนดวันที่ {row.due_day}</span><span>ปรับ ฿{money(row.late_fee)}</span><span>หาร {row.utility_split_divisor}</span><span>{row.starts_at} – {row.ends_at || 'ไม่กำหนด'}</span>{canManage && row.active && <button onClick={() => version(row)} className="ml-auto font-medium text-[#397caf]">สร้างเวอร์ชันใหม่</button>}</div></article>)}</div></div> }
function PolicyValue({ label, value }) { return <div className="rounded-xl bg-[#f7f9fa] p-2 text-center"><p className="text-[8px] text-[#81909c]">{label}</p><p className="mt-1 text-[10px] font-semibold">฿{value}</p></div> }

function PolicyDialog({ item, close, save }) {
  const [saving, setSaving] = useState(false)
  const submit = async event => { event.preventDefault(); setSaving(true); try { await save(Object.fromEntries(new FormData(event.currentTarget))) } finally { setSaving(false) } }
  const versioning = Boolean(item.id)
  return <div className="fixed inset-0 z-50 grid place-items-end bg-[#142a46]/55 sm:place-items-center sm:p-4" onMouseDown={event => event.target === event.currentTarget && close()}><form onSubmit={submit} className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"><div className="sticky top-0 z-10 flex items-center border-b border-[#e5ebef] bg-white p-5"><div><p className="text-[10px] font-semibold text-[#397caf]">นโยบาย 4.2</p><h3 className="mt-1 text-base font-semibold">{versioning ? 'สร้างเวอร์ชันอัตราใหม่' : 'เพิ่มนโยบายค่าเช่า'}</h3></div><button type="button" onClick={close} className="ml-auto grid size-9 place-items-center rounded-full bg-[#f2f5f7]"><X size={17} /></button></div><div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3"><Field label="รหัสเวอร์ชัน"><input required name="code" maxLength="50" defaultValue={versioning ? `${item.code}_NEW` : ''} className={fieldClass} /></Field><Field label="ชื่อนโยบาย"><input required name="name" defaultValue={item.name || ''} className={fieldClass} /></Field><Field label="กลุ่มผู้เช่า"><select name="tenantCohort" defaultValue={item.tenant_cohort || 'STUDENT_68_PLUS'} className={fieldClass}><option value="STUDENT_68_PLUS">นักศึกษา รหัส 68+</option><option value="STUDENT_64_67">นักศึกษา รหัส 64–67</option><option value="STAFF">บุคลากร</option><option value="EXTERNAL">บุคคลภายนอก</option><option value="OTHER">อื่น ๆ</option></select></Field><Field label="รอบการเช่า"><select name="rentalPeriod" defaultValue={item.rental_period || 'monthly'} className={fieldClass}><option value="daily">รายวัน</option><option value="monthly">รายเดือน</option><option value="term">รายภาคเรียน</option><option value="yearly">รายปี</option></select></Field><Field label="คิดค่าเช่า"><select name="rateScope" defaultValue={item.rate_scope || 'person'} className={fieldClass}><option value="person">ต่อคน</option><option value="room">ต่อห้อง</option></select></Field><Field label="ค่าเช่า (บาท)"><input required type="number" min="0" step="0.01" name="amount" defaultValue={item.amount ?? 0} className={fieldClass} /></Field><Field label="จำนวนผู้พักสูงสุด"><input required type="number" min="1" name="occupancyLimit" defaultValue={item.occupancy_limit ?? 2} className={fieldClass} /></Field><Field label="ตัวหารค่าสาธารณูปโภค"><input required type="number" min="1" name="utilitySplitDivisor" defaultValue={item.utility_split_divisor ?? 2} className={fieldClass} /></Field><Field label="ค่าน้ำ / หน่วย"><input required type="number" min="0" step="0.01" name="waterRate" defaultValue={item.water_rate ?? 23} className={fieldClass} /></Field><Field label="ค่าไฟ / หน่วย"><input required type="number" min="0" step="0.01" name="electricityRate" defaultValue={item.electricity_rate ?? 7} className={fieldClass} /></Field><Field label="เงินประกันแรกเข้า"><input required type="number" min="0" step="0.01" name="depositAmount" defaultValue={item.deposit_amount ?? 2000} className={fieldClass} /></Field><Field label="ครบกำหนดวันที่"><input required type="number" min="1" max="31" name="dueDay" defaultValue={item.due_day ?? 5} className={fieldClass} /></Field><Field label="ค่าปรับล่าช้า"><input required type="number" min="0" step="0.01" name="lateFee" defaultValue={item.late_fee ?? 100} className={fieldClass} /></Field><Field label="ค้างสูงสุด (เดือน)"><input required type="number" min="1" name="delinquencyMonths" defaultValue={item.delinquency_months ?? 1} className={fieldClass} /></Field><Field label="วันเริ่มใช้"><input required type="date" name="startsAt" defaultValue={versioning ? '' : item.starts_at} className={fieldClass} /></Field><Field label="วันสิ้นสุด"><input type="date" name="endsAt" defaultValue="" className={fieldClass} /></Field><label className="sm:col-span-2 lg:col-span-3"><span className="mb-1.5 block text-[10px] font-medium text-[#617688]">เงื่อนไขเมื่อค้างชำระ</span><textarea name="terminationAction" rows="3" defaultValue={item.termination_action || ''} className={`${fieldClass} h-auto py-3`} /></label></div><div className="sticky bottom-0 flex gap-2 border-t border-[#e5ebef] bg-white p-4"><button type="button" onClick={close} className="flex-1 rounded-xl border border-[#d8e2e7] py-2.5 text-xs">ปิด</button><button disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#f5bf3c] py-2.5 text-xs font-semibold text-[#173653] disabled:opacity-50">{saving && <LoaderCircle size={14} className="animate-spin" />} บันทึกเวอร์ชัน</button></div></form></div>
}

function MasterDialog({ config, parents, editor, close, save }) {
  const [saving, setSaving] = useState(false)
  const submit = async event => { event.preventDefault(); setSaving(true); try { await save(Object.fromEntries(new FormData(event.currentTarget))) } finally { setSaving(false) } }
  const item = editor.item || {}, cancelling = editor.mode === 'cancel'
  return <div className="fixed inset-0 z-50 grid place-items-end bg-[#142a46]/45 sm:place-items-center sm:p-4" onMouseDown={event => event.target === event.currentTarget && close()}><form onSubmit={submit} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"><div className="flex items-center border-b border-[#e5ebef] p-5"><div><p className="text-[10px] font-semibold text-[#397caf]">ข้อมูลพื้นฐาน</p><h3 className="mt-1 text-base font-semibold">{cancelling ? 'ยกเลิก' : editor.mode === 'edit' ? 'แก้ไข' : 'เพิ่ม'}{config.label}</h3></div><button type="button" onClick={close} className="ml-auto grid size-9 place-items-center rounded-full bg-[#f2f5f7]"><X size={17} /></button></div><div className="grid gap-4 p-5">{cancelling ? <><p className="rounded-xl bg-[#f5f8fa] p-3 text-xs">{item.code} · {item.name}</p><Field label="เหตุผลการยกเลิก (บังคับ)"><textarea required minLength="5" name="reason" rows="4" className={`${fieldClass} h-auto py-3`} /></Field></> : <><Field label={config.codeLabel || 'รหัส'}><input required disabled={editor.mode === 'edit'} name="code" maxLength="50" defaultValue={item.code} className={fieldClass} placeholder="เช่น B04" /></Field><Field label={config.nameLabel || `ชื่อ${config.label}`}><input required name="name" maxLength="300" defaultValue={item.name} className={fieldClass} /></Field>{config.parent && <Field label={`ข้อมูลแม่: ${categoryConfig[config.parent].label}`}><select required name="parentId" defaultValue={item.parent_id || ''} className={fieldClass}><option value="">เลือก{categoryConfig[config.parent].label}</option>{parents.map(parent => <option key={parent.id} value={parent.id}>{parent.code} · {parent.name}</option>)}</select>{parents.length === 0 && <p className="mt-1 text-[9px] text-[#b74e44]">ต้องเพิ่ม{categoryConfig[config.parent].label}ก่อน</p>}</Field>}{config.postalCode && <Field label="รหัสไปรษณีย์"><input name="postalCode" inputMode="numeric" maxLength="10" defaultValue={item.details?.postalCode} className={fieldClass} /></Field>}{config.bedCount && <Field label="จำนวนเตียง"><input required min="0" type="number" name="bedCount" defaultValue={item.details?.bedCount || 0} className={fieldClass} /></Field>}{config.academicTerm && <Field label="ภาคการศึกษา"><input name="term" defaultValue={item.details?.term} className={fieldClass} placeholder="เช่น 1/2569" /></Field>}<Field label="รายละเอียดเพิ่มเติม (ถ้ามี)"><textarea name="note" rows="3" defaultValue={item.details?.note} className={`${fieldClass} h-auto py-3`} /></Field></>}</div><div className="flex gap-2 border-t border-[#e5ebef] p-4"><button type="button" onClick={close} className="flex-1 rounded-xl border border-[#d8e2e7] py-2.5 text-xs">ปิด</button><button disabled={saving || (!cancelling && config.parent && parents.length === 0)} className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold disabled:opacity-50 ${cancelling ? 'bg-[#b74e44] text-white' : 'bg-[#f5bf3c] text-[#173653]'}`}>{saving && <LoaderCircle size={14} className="animate-spin" />} ยืนยันรายการ</button></div></form></div>
}

function Field({ label, children }) { return <label><span className="mb-1.5 block text-[10px] font-medium text-[#617688]">{label}</span>{children}</label> }
function Loading() { return <div className="grid min-h-48 place-items-center"><LoaderCircle className="animate-spin text-[#397caf]" /></div> }
function money(value) { return Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function detailText(details) { if (!details) return '—'; return [details.postalCode && `รหัสไปรษณีย์ ${details.postalCode}`, Number.isFinite(details.bedCount) && `${details.bedCount} เตียง`, details.term && `ภาค ${details.term}`, details.note].filter(Boolean).join(' · ') || '—' }

export default MasterData
