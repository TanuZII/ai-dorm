import { useEffect, useMemo, useState } from 'react'
import { ArrowDownAZ, ArrowUpAZ, CalendarRange, Download, FileBarChart2, LoaderCircle, Search, Sheet } from 'lucide-react'
import { api, downloadApiFile } from '../../services/api'

const today = new Date().toISOString().slice(0, 10)
const yearStart = `${today.slice(0, 4)}-01-01`
const money = value => Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Reports({ notify }) {
  const [catalog, setCatalog] = useState([])
  const [type, setType] = useState('debtors')
  const [from, setFrom] = useState(yearStart)
  const [to, setTo] = useState(today)
  const [period, setPeriod] = useState('monthly')
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState({ key: '', direction: 'asc' })

  const load = async (reportType = type) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ type: reportType, from, to, period })
      setReport(await api(`/reports/general?${params}`))
      setSort({ key: '', direction: 'asc' })
    } catch (error) { notify(error.message) } finally { setLoading(false) }
  }

  useEffect(() => { api('/reports/catalog').then(items => { setCatalog(items); return load('debtors') }).catch(error => notify(error.message)) }, [])
  const activeDefinition = catalog.find(item => item.type === type)
  const groups = useMemo(() => Object.entries(catalog.reduce((result, item) => ({ ...result, [item.group]: [...(result[item.group] || []), item] }), {})), [catalog])
  const rows = useMemo(() => {
    const filtered = (report?.rows || []).filter(row => !query || Object.values(row).some(value => String(value ?? '').toLowerCase().includes(query.toLowerCase())))
    if (!sort.key) return filtered
    return [...filtered].sort((a, b) => {
      const left = a[sort.key], right = b[sort.key]
      const result = typeof left === 'number' && typeof right === 'number' ? left - right : String(left ?? '').localeCompare(String(right ?? ''), 'th')
      return sort.direction === 'asc' ? result : -result
    })
  }, [report, query, sort])

  const choose = item => { setType(item.type); window.setTimeout(() => load(item.type), 0) }
  const changeSort = key => setSort(current => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }))
  const exportXlsx = () => {
    const params = new URLSearchParams({ type, from, to, period })
    downloadApiFile(`/reports/general/export.xlsx?${params}`, `dormitory-${type}.xlsx`).catch(error => notify(error.message))
  }

  return <div className="space-y-5">
    <section className="overflow-hidden rounded-3xl bg-[#16324f] text-white shadow-[0_18px_40px_rgba(22,50,79,.16)]">
      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div><p className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.18em] text-[#9fc5cf]"><FileBarChart2 size={14}/> Report ledger · 4.8–4.10</p><h2 className="max-w-2xl text-2xl font-semibold leading-tight">ศูนย์รายงานและการนำส่งรายได้</h2><p className="mt-2 max-w-xl text-xs leading-6 text-[#bfd0dc]">ตรวจลูกหนี้ การรับชำระ เงินประกัน และสัดส่วนรายได้จากชุดข้อมูลเดียวกัน พร้อมส่งต่อเป็น Excel ที่กรองและจัดเรียงได้</p></div>
        <button onClick={exportXlsx} disabled={!report} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#dff4ec] px-5 text-xs font-semibold text-[#0f5f57] transition hover:bg-white disabled:opacity-50"><Download size={16}/> ส่งออก Excel</button>
      </div>
      <div className="grid border-t border-white/10 bg-white/5 md:grid-cols-4">
        <label className="border-b border-white/10 p-4 md:border-b-0 md:border-r"><span className="mb-2 flex items-center gap-1 text-[9px] text-[#a9bdca]"><CalendarRange size={12}/> วันที่เริ่มต้น</span><input type="date" value={from} onChange={event => setFrom(event.target.value)} className="w-full bg-transparent text-xs text-white outline-none [color-scheme:dark]"/></label>
        <label className="border-b border-white/10 p-4 md:border-b-0 md:border-r"><span className="mb-2 block text-[9px] text-[#a9bdca]">วันที่สิ้นสุด</span><input type="date" value={to} onChange={event => setTo(event.target.value)} className="w-full bg-transparent text-xs text-white outline-none [color-scheme:dark]"/></label>
        <label className="border-b border-white/10 p-4 md:border-b-0 md:border-r"><span className="mb-2 block text-[9px] text-[#a9bdca]">การรวมงวด</span><select value={period} onChange={event => setPeriod(event.target.value)} disabled={!activeDefinition?.supportsPeriod} className="w-full bg-[#16324f] text-xs text-white outline-none disabled:opacity-40"><option value="daily">รายวัน</option><option value="monthly">รายเดือน</option><option value="term">รายภาคการศึกษา</option><option value="yearly">รายปี</option></select></label>
        <button onClick={() => load()} className="flex items-center justify-center gap-2 p-4 text-xs font-semibold text-[#dff4ec] hover:bg-white/5">{loading ? <LoaderCircle size={15} className="animate-spin"/> : <Search size={15}/>} แสดงรายงาน</button>
      </div>
    </section>

    <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="self-start rounded-2xl border border-[#dce6ea] bg-white p-3 shadow-sm xl:sticky xl:top-24">
        <div className="px-3 pb-3 pt-2"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#728796]">เลนส์รายงาน</p><p className="mt-1 text-[10px] text-[#93a1ab]">เลือกมุมมองที่ต้องตรวจสอบ</p></div>
        {groups.map(([group, items]) => <div key={group} className="mb-3"><p className="px-3 py-1 text-[9px] font-medium text-[#9a7a36]">{group}</p>{items.map(item => <button key={item.type} onClick={() => choose(item)} className={`mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[10px] leading-5 transition ${type === item.type ? 'bg-[#e8f5f1] font-semibold text-[#0f665b]' : 'text-[#536b7c] hover:bg-[#f4f7f8]'}`}><Sheet size={14} className="shrink-0"/>{item.title}</button>)}</div>)}
      </aside>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-[#dce6ea] bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-[#e6ecef] p-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[9px] font-semibold uppercase tracking-[.14em] text-[#0f766e]">รายงานปัจจุบัน</p><h3 className="mt-1 text-base font-semibold text-[#18344d]">{report?.title || activeDefinition?.title || 'กำลังโหลด'}</h3><p className="mt-1 text-[10px] text-[#80909b]">{rows.length.toLocaleString('th-TH')} แถว · คลิกหัวคอลัมน์เพื่อเรียงข้อมูล</p></div><label className="flex h-10 items-center gap-2 rounded-xl border border-[#dbe5e9] bg-[#f7f9fa] px-3"><Search size={14} className="text-[#81919d]"/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาในรายงาน" className="w-44 bg-transparent text-[10px] outline-none"/></label></div>
        {loading ? <div className="grid min-h-80 place-items-center"><LoaderCircle className="animate-spin text-[#0f766e]"/></div> : <div className="overflow-auto"><table className="min-w-full whitespace-nowrap text-left"><thead className="sticky top-0 z-10 bg-[#f0f5f6] text-[9px] font-semibold text-[#405c70]"><tr>{report?.columns.map(column => <th key={column.key} className={`px-4 py-3 ${['money','number'].includes(column.type) ? 'text-right' : ''}`}><button onClick={() => changeSort(column.key)} className="inline-flex items-center gap-1 hover:text-[#0f766e]">{column.label}{sort.key === column.key && (sort.direction === 'asc' ? <ArrowDownAZ size={12}/> : <ArrowUpAZ size={12}/>)}</button></th>)}</tr></thead><tbody className="divide-y divide-[#edf1f3] text-[10px] text-[#395368]">{rows.map((row, rowIndex) => <tr key={`${rowIndex}-${Object.values(row)[0]}`} className="hover:bg-[#f8fbfa]">{report.columns.map(column => <td key={column.key} className={`px-4 py-3 ${['money','number'].includes(column.type) ? "text-right font-['IBM_Plex_Sans'] tabular-nums" : ''}`}>{column.type === 'money' ? money(row[column.key]) : row[column.key] ?? '-'}</td>)}</tr>)}{rows.length === 0 && <tr><td colSpan={report?.columns.length || 1} className="h-48 text-center text-xs text-[#8b9aa4]">ไม่พบข้อมูลในช่วงที่เลือก</td></tr>}</tbody></table></div>}
      </section>
    </div>
  </div>
}

export default Reports
