import { useEffect, useState } from 'react'
import { Building2, CheckCircle2, Eye, LoaderCircle, Lock, MessageCircle, Radio, Send, Users } from 'lucide-react'
import { api } from '../../services/api'

const fieldClass = 'h-10 w-full rounded-xl border border-[#d9e4e8] bg-white px-3 text-[10px] text-[#29465c] outline-none focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/10'

function Announcements({ notify }) {
  const [announcements, setAnnouncements] = useState([])
  const [rooms, setRooms] = useState([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [audience, setAudience] = useState('all')
  const [commentsEnabled, setCommentsEnabled] = useState(true)
  const [messageType, setMessageType] = useState('general')

  const load = async () => {
    setLoading(true)
    try { const [news, roomRows] = await Promise.all([api('/announcements'), api('/rooms?availability=all')]); setAnnouncements(news); setRooms(roomRows) }
    catch (error) { notify(error.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const submit = async event => {
    event.preventDefault(); setSaving(true)
    const form = Object.fromEntries(new FormData(event.currentTarget))
    try {
      await api('/announcements', { method: 'POST', body: { title: form.title, body: form.body, audienceType: audience, roomId: audience === 'room' ? Number(form.roomId) : null, commentsEnabled, publish: true, expiresAt: new Date(form.expiresAt).toISOString(), messageType, entityId: form.entityId ? Number(form.entityId) : null } })
      event.currentTarget.reset(); setAudience('all'); setCommentsEnabled(true); setMessageType('general'); notify('เผยแพร่ข้อความบน Landing Page แล้ว'); await load()
    } catch (error) { notify(error.message) } finally { setSaving(false) }
  }

  const update = async (id, body, message) => { try { await api(`/announcements/${id}`, { method: 'PATCH', body }); notify(message); await load() } catch (error) { notify(error.message) } }

  return <div className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
    <form onSubmit={submit} className="self-start overflow-hidden rounded-3xl border border-[#dbe5e9] bg-white shadow-sm xl:sticky xl:top-24">
      <div className="bg-[#16324f] p-6 text-white"><p className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[.16em] text-[#9fc5cf]"><Radio size={13}/> Dormitory broadcast</p><h2 className="mt-3 text-xl font-semibold">ส่งข่าวถึงหน้าห้อง</h2><p className="mt-2 text-[10px] leading-5 text-[#bfd0dc]">เลือกส่งทุกห้องหรือจ่าหน้าถึงห้องเดียว พร้อมกำหนดพื้นที่สนทนาของผู้เช่า</p></div>
      <div className="space-y-4 p-5"><label><span className="mb-1.5 block text-[10px] font-medium text-[#536d7f]">หัวข้อข้อความ</span><input required name="title" maxLength="200" className={fieldClass} placeholder="เช่น แจ้งเตือนใบแจ้งหนี้ค้างชำระ"/></label><label><span className="mb-1.5 block text-[10px] font-medium text-[#536d7f]">ข้อความ</span><textarea required name="body" maxLength="5000" rows="5" className={`${fieldClass} h-auto py-3 leading-5`} placeholder="ระบุรายละเอียดและสิ่งที่ผู้เช่าต้องดำเนินการ"/></label>
        <div className="grid grid-cols-2 gap-3"><label><span className="mb-1.5 block text-[10px] font-medium text-[#536d7f]">ประเภทข้อความ</span><select value={messageType} onChange={event=>setMessageType(event.target.value)} className={fieldClass}><option value="general">ข่าวทั่วไป</option><option value="contract">สัญญาเช่า</option><option value="invoice">ใบแจ้งหนี้</option><option value="receipt">ใบเสร็จรับเงิน</option><option value="overdue">แจ้งค้างชำระ</option></select></label><label><span className="mb-1.5 block text-[10px] font-medium text-[#536d7f]">อ้างอิงเลข ID</span><input type="number" min="1" name="entityId" className={fieldClass} placeholder="ไม่บังคับ"/></label></div>
        <label><span className="mb-1.5 block text-[10px] font-medium text-[#536d7f]">แสดงถึงวัน–เวลา</span><input required type="datetime-local" name="expiresAt" className={fieldClass}/><small className="mt-1 block text-[8px] text-[#8998a2]">เมื่อหมดอายุ ข้อความจะหายจาก Landing Page อัตโนมัติ</small></label>
        <div><span className="mb-2 block text-[10px] font-medium text-[#536d7f]">ผู้รับข่าว</span><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setAudience('all')} className={`rounded-xl border p-3 text-left ${audience === 'all' ? 'border-[#0f766e] bg-[#e9f6f2] text-[#0f665b]' : 'border-[#dbe5e9] text-[#647988]'}`}><Users size={16}/><b className="mt-2 block text-[10px]">ทุกห้อง</b><small className="text-[8px]">ประกาศส่วนกลาง</small></button><button type="button" onClick={() => setAudience('room')} className={`rounded-xl border p-3 text-left ${audience === 'room' ? 'border-[#0f766e] bg-[#e9f6f2] text-[#0f665b]' : 'border-[#dbe5e9] text-[#647988]'}`}><Building2 size={16}/><b className="mt-2 block text-[10px]">เฉพาะห้อง</b><small className="text-[8px]">ข้อความเจาะจง</small></button></div></div>
        {audience === 'room' && <label><span className="mb-1.5 block text-[10px] font-medium text-[#536d7f]">ห้องที่ต้องการแจ้ง</span><select required name="roomId" className={fieldClass}><option value="">เลือกอาคารและห้อง</option>{rooms.map(room => <option key={room.id} value={room.id}>{room.building_name} · ชั้น {room.floor_no} · ห้อง {room.room_no}</option>)}</select></label>}
        <button type="button" onClick={() => setCommentsEnabled(value => !value)} className="flex w-full items-center gap-3 rounded-xl bg-[#f4f7f8] p-3 text-left"><span className={`grid size-8 place-items-center rounded-lg ${commentsEnabled ? 'bg-[#dff4ec] text-[#0f766e]' : 'bg-[#e7ebed] text-[#74838e]'}`}>{commentsEnabled ? <MessageCircle size={15}/> : <Lock size={14}/>}</span><span className="flex-1"><b className="block text-[10px] text-[#355267]">{commentsEnabled ? 'เปิดคอมเมนต์' : 'ปิดคอมเมนต์'}</b><small className="text-[8px] text-[#81919c]">คลิกเพื่อเปลี่ยนการตอบกลับของผู้เช่า</small></span><span className={`h-5 w-9 rounded-full p-0.5 ${commentsEnabled ? 'bg-[#0f766e]' : 'bg-[#b8c2c8]'}`}><i className={`block size-4 rounded-full bg-white transition ${commentsEnabled ? 'translate-x-4' : ''}`}/></span></button>
        <button disabled={saving} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#d97706] text-xs font-semibold text-white shadow-[0_3px_0_#9b5204] active:translate-y-0.5 active:shadow-none disabled:opacity-50">{saving ? <LoaderCircle size={15} className="animate-spin"/> : <Send size={15}/>} เผยแพร่ข้อความ</button>
      </div>
    </form>

    <section className="overflow-hidden rounded-3xl border border-[#dbe5e9] bg-white shadow-sm">
      <div className="flex items-end justify-between border-b border-[#e5ecef] p-5"><div><p className="text-[9px] font-semibold uppercase tracking-[.15em] text-[#0f766e]">Message board</p><h3 className="mt-1 text-base font-semibold text-[#18344d]">ข่าวที่ส่งแล้ว</h3><p className="mt-1 text-[10px] text-[#81909b]">{announcements.length} รายการ</p></div><Eye size={20} className="text-[#8da0ac]"/></div>
      {loading ? <div className="grid min-h-80 place-items-center"><LoaderCircle className="animate-spin text-[#0f766e]"/></div> : <div className="divide-y divide-[#e9eef0]">{announcements.map(item => <article key={item.id} className="p-5 transition hover:bg-[#fbfcfc]"><div className="flex items-start gap-4"><span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${item.audience_type === 'all' ? 'bg-[#e8f5f1] text-[#0f766e]' : 'bg-[#edf3f8] text-[#376f98]'}`}>{item.audience_type === 'all' ? <Users size={18}/> : <Building2 size={18}/>}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold text-[#243f54]">{item.title}</h4><span className={`rounded-full px-2 py-1 text-[8px] ${item.status === 'published' ? 'bg-[#e7f6ef] text-[#26715e]' : 'bg-[#eef1f3] text-[#6e7e89]'}`}>{item.status === 'published' ? 'เผยแพร่' : item.status === 'closed' ? 'ปิดประกาศ' : 'ฉบับร่าง'}</span></div><p className="mt-2 whitespace-pre-line text-[10px] leading-5 text-[#637887]">{item.body}</p><div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[9px] text-[#84949f]"><span>{item.audience_type === 'all' ? 'ถึงทุกห้อง' : `${item.building_name} · ห้อง ${item.room_no}`}</span><span>{new Date(item.published_at || item.created_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</span><span className="flex items-center gap-1"><MessageCircle size={11}/> {item.comment_count} คอมเมนต์</span></div><div className="mt-3 flex gap-2"><button onClick={() => update(item.id, { commentsEnabled: !item.comments_enabled }, item.comments_enabled ? 'ปิดคอมเมนต์แล้ว' : 'เปิดคอมเมนต์แล้ว')} className="rounded-lg border border-[#d9e4e8] px-3 py-1.5 text-[9px] text-[#526b7c]">{item.comments_enabled ? 'ปิดคอมเมนต์' : 'เปิดคอมเมนต์'}</button>{item.status === 'published' && <button onClick={() => update(item.id, { status: 'closed' }, 'ปิดประกาศแล้ว')} className="rounded-lg border border-[#ecd4b1] px-3 py-1.5 text-[9px] text-[#a35e0a]">ปิดประกาศ</button>}</div></div>{item.status === 'published' && <CheckCircle2 size={16} className="text-[#2f9079]"/>}</div></article>)}{announcements.length === 0 && <div className="grid min-h-80 place-items-center text-center"><div><Radio size={28} className="mx-auto text-[#9baab3]"/><b className="mt-3 block text-xs text-[#405b6e]">ยังไม่มีข่าวสาร</b><p className="mt-1 text-[9px] text-[#85949e]">ข่าวที่เผยแพร่จะเรียงตามเวลาที่นี่</p></div></div>}</div>}
    </section>
  </div>
}

export default Announcements
