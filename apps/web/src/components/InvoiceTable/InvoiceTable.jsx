import { Ban, ChevronRight, ReceiptText } from 'lucide-react'

const statusMap = {
  overdue: ['เกินกำหนด', 'bg-[#fff0ee] text-[#bd493f]'],
  pending: ['รอชำระ', 'bg-[#fff7e4] text-[#9b6811]'],
  paid: ['ชำระแล้ว', 'bg-[#edf7f4] text-[#2f7d68]'],
  cancelled: ['ยกเลิก', 'bg-[#f1f3f5] text-[#7d8994]'],
}

function InvoiceTable({ invoices, onCancel, onReceive }) {
  return <div className="overflow-x-auto">
    <table className="w-full min-w-[850px] border-collapse text-left">
      <thead><tr className="border-b border-[#e3eaee] bg-[#f8fafb] text-[10px] font-medium text-[#718392]"><th className="px-5 py-3">เลขที่ใบแจ้งหนี้</th><th className="px-4 py-3">ผู้เช่า</th><th className="px-4 py-3">ประเภท</th><th className="px-4 py-3">กำหนดชำระ</th><th className="px-4 py-3 text-right">ยอดสุทธิ</th><th className="px-4 py-3">สถานะ</th><th className="px-5 py-3 text-right">ดำเนินการ</th></tr></thead>
      <tbody className="divide-y divide-[#edf1f3]">{invoices.map(invoice => <tr key={invoice.no} className="group text-xs text-[#3b5368] hover:bg-[#fafcfd]">
        <td className="px-5 py-3.5"><div className="flex items-center gap-2"><div className="grid size-8 place-items-center rounded-lg bg-[#eef4f8] text-[#4c718f]"><ReceiptText size={14}/></div><span className="font-['IBM_Plex_Sans'] font-semibold text-[#203b54]">{invoice.no}</span></div></td>
        <td className="px-4 py-3.5"><p className="font-medium text-[#2e475e]">{invoice.name}</p><p className="mt-0.5 text-[10px] text-[#8a98a4]">{invoice.personId} · {invoice.personType}</p></td>
        <td className="px-4 py-3.5">{invoice.type}</td><td className="px-4 py-3.5 font-['IBM_Plex_Sans'] text-[11px]">{invoice.due}</td><td className="px-4 py-3.5 text-right font-['IBM_Plex_Sans'] font-semibold text-[#263f56]">฿{invoice.amount.toLocaleString()}</td>
        <td className="px-4 py-3.5"><span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${statusMap[invoice.status][1]}`}>{statusMap[invoice.status][0]}</span></td>
        <td className="px-5 py-3.5"><div className="flex items-center justify-end gap-1">{['pending','overdue'].includes(invoice.status) && <button onClick={() => onReceive(invoice)} className="rounded-lg px-2.5 py-1.5 text-[10px] font-medium text-[#2f7d68] hover:bg-[#edf7f4]">รับชำระ</button>}{invoice.status !== 'cancelled' && <button onClick={() => onCancel(invoice)} className="grid size-8 place-items-center rounded-lg text-[#9a6970] hover:bg-[#fff0ee]" title="ยกเลิกใบแจ้งหนี้"><Ban size={14}/></button>}<button className="grid size-8 place-items-center rounded-lg text-[#7d8d99] hover:bg-[#eef4f7]"><ChevronRight size={15}/></button></div></td>
      </tr>)}</tbody>
    </table>
  </div>
}

export default InvoiceTable
