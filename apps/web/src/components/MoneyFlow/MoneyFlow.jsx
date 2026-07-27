import { ArrowRight, BadgeCheck, Landmark, ReceiptText, Send } from 'lucide-react'

const steps = [
  { label: 'ออกใบแจ้งหนี้', value: '128 รายการ', amount: '฿482,300', icon: ReceiptText, tone: 'bg-[#edf5fb] text-[#397caf]' },
  { label: 'รับชำระแล้ว', value: '96 รายการ', amount: '฿354,850', icon: BadgeCheck, tone: 'bg-[#edf7f4] text-[#2f7d68]' },
  { label: 'ออกใบเสร็จ', value: '96 ฉบับ', amount: 'เลขล่าสุด 0142', icon: Landmark, tone: 'bg-[#fff7e4] text-[#ad7210]' },
  { label: 'รอนำส่ง', value: '1 รอบ', amount: '฿354,850', icon: Send, tone: 'bg-[#f4eff9] text-[#7c619e]' },
]

function MoneyFlow() {
  return <section className="rounded-2xl bg-[#1d3b58] p-5 text-white shadow-[0_8px_24px_rgba(20,42,70,.14)]">
    <div className="mb-5 flex items-start justify-between"><div><p className="text-[10px] font-medium tracking-[.08em] text-[#a9bdcd]">เส้นทางเงินประจำวัน</p><h3 className="mt-1 text-base font-semibold">ตรวจครบทุกขั้นก่อนนำส่งรายได้</h3></div><span className="rounded-full bg-white/10 px-3 py-1 text-[10px] text-[#c9d6e0]">ข้อมูล ณ 15:40 น.</span></div>
    <div className="grid gap-2 md:grid-cols-4">{steps.map((step, index) => <div key={step.label} className="relative rounded-xl bg-white/[.07] p-3.5">
      <div className={`grid size-8 place-items-center rounded-lg ${step.tone}`}><step.icon size={15}/></div>
      <p className="mt-3 text-[10px] text-[#afc0cd]">{step.label}</p><p className="mt-0.5 text-sm font-semibold">{step.value}</p><p className="mt-1 text-[10px] text-[#d5dfe6]">{step.amount}</p>
      {index < steps.length - 1 && <div className="absolute -right-3 top-1/2 z-10 hidden size-6 -translate-y-1/2 place-items-center rounded-full border-2 border-[#1d3b58] bg-[#f5bf3c] text-[#1d3b58] md:grid"><ArrowRight size={12}/></div>}
    </div>)}</div>
  </section>
}

export default MoneyFlow
