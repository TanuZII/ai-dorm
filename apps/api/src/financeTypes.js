export const financialItemTypes = [
  'room','water','electricity','deposit','late_fee','damage','other',
  'printing_room','food_beverage','health_field','swimming_instruction',
  'health_membership','area_rent',
]

export const revenueShareSeeds = [
  ['DORM_ROOM','room','รายได้หอพัก','ค่าห้องพัก',0.8,0.2],
  ['DORM_LATE_FEE','late_fee','รายได้หอพัก','ค่าปรับชำระล่าช้า',0.8,0.2],
  ['DORM_DAMAGE','damage','รายได้หอพัก','ค่าปรับความเสียหาย',0.8,0.2],
  ['DORM_OTHER','other','รายได้หอพัก','ค่าอื่น ๆ',0.8,0.2],
  ['DORM_WATER','water','รายได้หอพัก','ค่าน้ำประปา',0,1],
  ['DORM_ELECTRICITY','electricity','รายได้หอพัก','ค่าไฟฟ้า',0,1],
  ['PRINTING_ROOM','printing_room','ศูนย์ความเป็นเลิศด้านการพิมพ์และบรรจุภัณฑ์','ค่าห้องพัก',0.8,0.2],
  ['PRINTING_FOOD','food_beverage','ศูนย์ความเป็นเลิศด้านการพิมพ์และบรรจุภัณฑ์','ค่าอาหารและเครื่องดื่ม',1,0],
  ['HEALTH_FIELD','health_field','ศูนย์บริการสุขภาพ','ค่าบริการสนาม',0.8,0.2],
  ['HEALTH_SWIMMING','swimming_instruction','ศูนย์บริการสุขภาพ','ค่าสอนว่ายน้ำ',0.8,0.2],
  ['HEALTH_MEMBER','health_membership','ศูนย์บริการสุขภาพ','ค่าสมาชิกรายปี',0.8,0.2],
  ['HEALTH_AREA','area_rent','ศูนย์บริการสุขภาพ','ค่าเช่าพื้นที่',0,1],
]
