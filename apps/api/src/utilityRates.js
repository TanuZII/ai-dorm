export function activeUtilityRate(db, utilityType, effectiveDate) {
  return db.prepare(`SELECT * FROM utility_rates
    WHERE utility_type=? AND active=1 AND starts_at<=?
      AND (ends_at IS NULL OR ends_at>=?)
    ORDER BY starts_at DESC,id DESC LIMIT 1`).get(utilityType, effectiveDate, effectiveDate) || null
}

export function requireUtilityRate(db, utilityType, effectiveDate) {
  const rate = activeUtilityRate(db, utilityType, effectiveDate)
  if (rate) return rate
  throw Object.assign(new Error(`ไม่พบอัตรา${utilityType === 'water' ? 'ค่าน้ำประปา' : 'ค่าไฟฟ้า'}ที่มีผล ณ วันที่ ${effectiveDate} กรุณาตั้งค่าอัตราก่อนบันทึกมิเตอร์`), {
    status: 409,
    code: 'UTILITY_RATE_NOT_CONFIGURED',
  })
}
