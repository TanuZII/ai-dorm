export function activeUtilityRate(rates, utilityType, billingMonth) {
  if (!billingMonth) return null
  const effectiveDate = `${billingMonth}-01`
  return rates
    .filter(rate => rate.utility_type === utilityType && rate.active !== 0 && rate.starts_at <= effectiveDate && (!rate.ends_at || rate.ends_at >= effectiveDate))
    .sort((left, right) => right.starts_at.localeCompare(left.starts_at) || right.id - left.id)[0] || null
}
