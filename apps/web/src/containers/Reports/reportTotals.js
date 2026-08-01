export function calculateReportTotals(columns, rows) {
  return Object.fromEntries(columns
    .filter(column => ['money', 'number'].includes(column.type))
    .map(column => [column.key, rows.reduce((sum, row) => sum + Number(row[column.key] || 0), 0)]))
}
