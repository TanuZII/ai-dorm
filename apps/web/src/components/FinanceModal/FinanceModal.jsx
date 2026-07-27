import { AlertTriangle, Banknote, FilePlus2, X } from 'lucide-react'

const config = {
  invoice: { title: 'ตั้งหนี้รายบุคคล', subtitle: 'สร้างใบแจ้งหนี้พร้อมรายการค่าใช้จ่าย', icon: FilePlus2, button: 'ออกใบแจ้งหนี้' },
  payment: { title: 'รับชำระเงิน', subtitle: 'ตรวจสอบยอดก่อนออกใบเสร็จ', icon: Banknote, button: 'ยืนยันรับชำระ' },
  cancel: { title: 'ยกเลิกใบแจ้งหนี้', subtitle: 'รายการนี้จะถูกบันทึกใน History Log', icon: AlertTriangle, button: 'ยืนยันยกเลิก' },
}

const Field = ({ label, children }) => <label className="block"><span className="mb-1.5 block text-[10px] font-medium text-[#5f7385]">{label}</span>{children}</label>
const inputClass = 'h-10 w-full rounded-xl border border-[#d8e2e7] bg-white px-3 text-xs text-[#294259] outline-none focus:border-[#4c8fc8] focus:ring-2 focus:ring-[#4c8fc8]/15'

function FinanceModal({ mode, invoice, onClose, onConfirm }) {
  if (!mode) return null
  const item = config[mode]
  const Icon = item.icon
  const submit = event => { event.preventDefault(); onConfirm(Object.fromEntries(new FormData(event.currentTarget))) }
  return <div className="fixed inset-0 z-50 grid place-items-end bg-[#142a46]/40 sm:place-items-center sm:p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <form onSubmit={submit} className="w-full max-w-lg rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
      <div className="flex items-start gap-3 border-b border-[#e5ebef] p-5"><div className={`grid size-10 place-items-center rounded-xl ${mode === 'cancel' ? 'bg-[#fff0ee] text-[#bd493f]' : 'bg-[#edf5fb] text-[#397caf]'}`}><Icon size={19}/></div><div><h3 className="text-base font-semibold text-[#1d354d]">{item.title}</h3><p className="mt-0.5 text-[10px] text-[#81909c]">{item.subtitle}</p></div><button type="button" onClick={onClose} className="ml-auto grid size-9 place-items-center rounded-full bg-[#f2f5f7] text-[#6e7f8c]"><X size={17}/></button></div>
      <div className="space-y-4 p-5">
        {mode === 'invoice' && <><Field label="ผู้เช่า"><select name="tenant" required className={inputClass}><option value="">เลือกนักศึกษา บุคลากร หรือบุคคลภายนอก</option><option>65010234 · ณัฐชา แสงทอง</option><option>EMP0042 · วิชาญ ศรีสุข</option><option>EXT0098 · มาเรีย โรดริเกซ</option></select></Field><div className="grid grid-cols-2 gap-3"><Field label="ประเภทรายการ"><select name="itemType" className={inputClass}><option>ค่าห้องพัก</option><option>ค่าน้ำประปา</option><option>ค่าไฟฟ้า</option><option>เงินประกัน</option><option>ค่าธรรมเนียมอื่น</option></select></Field><Field label="รอบการเรียกเก็บ"><select name="period" className={inputClass}><option>ภาคเรียน 1/2569</option><option>กรกฎาคม 2569</option><option>รายวัน</option><option>รายปี</option></select></Field></div><div className="grid grid-cols-2 gap-3"><Field label="จำนวนเงิน"><input name="amount" required type="number" min="0" placeholder="0.00" className={inputClass}/></Field><Field label="กำหนดชำระ"><input name="dueDate" required type="date" className={inputClass}/></Field></div><Field label="หมายเหตุ"><textarea name="note" rows="2" className={`${inputClass} h-auto py-2`} placeholder="ระบุรายละเอียดเพิ่มเติม (ถ้ามี)"/></Field></>}
        {mode === 'payment' && <><div className="rounded-xl border border-[#dce7eb] bg-[#f6f9fa] p-4"><p className="text-[10px] text-[#748694]">ใบแจ้งหนี้</p><div className="mt-1 flex items-end justify-between"><p className="font-['IBM_Plex_Sans'] text-sm font-semibold">{invoice?.no || 'INV-6907-0842'}</p><p className="font-['IBM_Plex_Sans'] text-xl font-semibold text-[#173653]">฿{(invoice?.amount || 3850).toLocaleString()}</p></div><p className="mt-1 text-[10px] text-[#7d8d99]">{invoice?.name || 'ณัฐชา แสงทอง'}</p></div><div className="grid grid-cols-2 gap-3"><Field label="ช่องทางชำระ"><select name="method" className={inputClass}><option>เงินสด</option><option>เงินโอน</option><option>ธนาคาร</option><option>เลขที่บัญชีออนไลน์</option></select></Field><Field label="จำนวนที่รับ"><input name="amount" required type="number" defaultValue={invoice?.amount || 3850} className={inputClass}/></Field></div><Field label="เลขที่อ้างอิง"><input name="reference" placeholder="เช่น TXN-690727-001" className={inputClass}/></Field><label className="flex items-start gap-2 rounded-xl bg-[#fff8e8] p-3 text-[10px] text-[#7b6022]"><input required type="checkbox" className="mt-0.5"/>ตรวจสอบชื่อผู้ชำระและยอดเงินถูกต้องแล้ว ระบบจะออกใบเสร็จทันที</label></>}
        {mode === 'cancel' && <><div className="rounded-xl border border-[#f0c7c2] bg-[#fff5f3] p-3 text-xs text-[#75423e]"><p className="font-medium">{invoice?.no}</p><p className="mt-1 text-[10px]">{invoice?.name} · ฿{invoice?.amount?.toLocaleString()}</p></div><Field label="เหตุผลที่ยกเลิก (บังคับ)"><textarea name="reason" required minLength="5" rows="4" className={`${inputClass} h-auto py-2`} placeholder="ระบุเหตุผลอย่างน้อย 5 ตัวอักษร"/></Field><p className="text-[10px] text-[#8a98a4]">ระบบจะบันทึกผู้ดำเนินการ วันเวลา และเหตุผลเพื่อการตรวจสอบย้อนหลัง</p></>}
      </div>
      <div className="flex gap-2 border-t border-[#e5ebef] p-4"><button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[#d8e2e7] py-2.5 text-xs font-medium text-[#53697b]">ยกเลิก</button><button className={`flex-1 rounded-xl py-2.5 text-xs font-semibold ${mode === 'cancel' ? 'bg-[#c55349] text-white' : 'bg-[#f5bf3c] text-[#173653] shadow-[0_2px_0_#c28d15]'}`}>{item.button}</button></div>
    </form>
  </div>
}

export default FinanceModal
