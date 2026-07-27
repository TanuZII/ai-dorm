const tabs = [
  ['invoices', 'ใบแจ้งหนี้'],
  ['proofs', 'หลักฐานชำระ'],
  ['receipts', 'ใบเสร็จรับเงิน'],
  ['remittances', 'นำส่งเงินรายวัน'],
  ['settings', 'กำหนดอัตรา'],
]

function FinanceTabs({ active, onChange, tenantPortal = false }) {
  return <div className="overflow-x-auto border-b border-[#dfe7eb]">
    <div className="flex min-w-max gap-6 px-5">
      {tabs.filter(([id]) => !tenantPortal || !['remittances', 'settings'].includes(id)).map(([id, label]) => <button key={id} onClick={() => onChange(id)} className={`relative py-3 text-xs font-medium transition ${active === id ? 'text-[#173653]' : 'text-[#778997] hover:text-[#39536a]'}`}>
        {label}
        {active === id && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#f0b72d]" />}
      </button>)}
    </div>
  </div>
}

export default FinanceTabs
