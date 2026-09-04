import type { Metrics, Transaction, TaxHubConfig } from '@/context/AppContext';

function fmt(n: number, forceSign = false) {
  const abs = Math.abs(n).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (forceSign && n > 0) return `+${abs}`;
  return n < 0 ? `-${abs}` : abs;
}

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

interface ReportData {
  metrics: Metrics;
  mileageRate: number;
  transactions: Transaction[];
  taxHub: TaxHubConfig;
}

export function buildTaxReportHtml(data: ReportData): string {
  const { metrics, mileageRate, transactions, taxHub } = data;
  const today = new Date();

  // Category breakdowns from transactions
  const fees = transactions
    .filter((t) => t.type === 'fee')
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const expenses = transactions
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  // Utility deductions
  const { homeOfficeDeduction, internetDeduction, cellDeduction } = metrics;
  const totalUtilityDeductions = homeOfficeDeduction + internetDeduction + cellDeduction;

  // Totals
  const totalDeductions =
    metrics.cogs +
    fees +
    expenses +
    metrics.mileageWriteOff +
    totalUtilityDeductions;

  const businessPct =
    taxHub.totalHomeSqFt > 0
      ? ((taxHub.homeOfficeSqFt / taxHub.totalHomeSqFt) * 100).toFixed(1)
      : '0.0';

  const scheduleC = [
    { line: '1', label: 'Gross Receipts or Sales', value: fmt(metrics.grossRevenue) },
    { line: '4', label: 'Cost of Goods Sold (COGS)', value: fmt(-metrics.cogs) },
    { line: '9', label: 'Car and Truck Expenses (Mileage)', value: fmt(-metrics.mileageWriteOff) },
    { line: '18', label: 'Office Expense (Supplies & Packaging)', value: fmt(-expenses) },
    { line: '22', label: 'Advertising & Platform Fees', value: fmt(-fees) },
    { line: '25', label: 'Utilities (Internet + Cell Phone)', value: fmt(-(internetDeduction + cellDeduction)) },
    { line: '30', label: 'Home Office Deduction', value: fmt(-homeOfficeDeduction) },
    { line: '31', label: 'Net Profit or (Loss)', value: fmt(metrics.netTaxableIncome), highlight: true },
  ];

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>TaxSquid ${taxHub.taxYear} Tax Summary</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', -apple-system, sans-serif; background: #fff; color: #111827; font-size: 13px; }

  /* ─── Page Layout ─── */
  .page { max-width: 720px; margin: 0 auto; padding: 40px 36px; }

  /* ─── Header ─── */
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand-icon { width: 40px; height: 40px; background: #0D9488; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
  .brand-icon svg { width: 22px; height: 22px; fill: white; }
  .brand-name { font-size: 22px; font-weight: 800; color: #0D9488; letter-spacing: -0.5px; }
  .brand-sub { font-size: 12px; color: #6B7280; font-weight: 500; margin-top: 1px; }
  .header-right { text-align: right; }
  .report-title { font-size: 16px; font-weight: 700; color: #111827; }
  .report-meta { font-size: 11px; color: #6B7280; margin-top: 4px; }

  /* ─── Divider ─── */
  .divider { border: none; border-top: 1.5px solid #E5E7EB; margin: 20px 0; }
  .divider-thin { border: none; border-top: 1px solid #F3F4F6; margin: 8px 0; }

  /* ─── Section headings ─── */
  .section-title { font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #6B7280; margin-bottom: 12px; }

  /* ─── Summary KPI row ─── */
  .kpi-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 24px; }
  .kpi { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 10px; padding: 14px 16px; }
  .kpi-label { font-size: 10px; font-weight: 600; color: #6B7280; letter-spacing: 0.3px; }
  .kpi-value { font-size: 22px; font-weight: 800; margin-top: 4px; letter-spacing: -0.5px; }
  .kpi-value.green { color: #059669; }
  .kpi-value.red { color: #DC2626; }
  .kpi-value.blue { color: #0D9488; }

  /* ─── Income & Deductions table ─── */
  .table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  .table th { font-size: 10px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: #9CA3AF; padding: 0 0 8px; text-align: left; border-bottom: 1.5px solid #E5E7EB; }
  .table th:last-child { text-align: right; }
  .table td { padding: 9px 0; font-size: 12.5px; border-bottom: 1px solid #F3F4F6; vertical-align: middle; }
  .table td:last-child { text-align: right; font-weight: 600; }
  .table tr:last-child td { border-bottom: none; }
  .table .positive { color: #059669; }
  .table .negative { color: #DC2626; }
  .table .sub { color: #6B7280; font-size: 11px; padding-left: 16px; }

  /* ─── Net profit row ─── */
  .net-row { background: #ECFDF5; border-radius: 8px; }
  .net-row td { padding: 11px 12px !important; font-weight: 700 !important; font-size: 14px !important; color: #065F46 !important; border-bottom: none !important; }
  .net-row td:first-child { border-radius: 8px 0 0 8px; }
  .net-row td:last-child { border-radius: 0 8px 8px 0; color: #059669 !important; font-size: 18px !important; }
  .net-row.loss { background: #FEF2F2; }
  .net-row.loss td { color: #7F1D1D !important; }
  .net-row.loss td:last-child { color: #DC2626 !important; }

  /* ─── Utility detail ─── */
  .detail-card { background: #F0FDFA; border: 1px solid #99F6E4; border-radius: 10px; padding: 14px 16px; margin-bottom: 24px; }
  .detail-card .dc-title { font-size: 11px; font-weight: 700; color: #0D9488; margin-bottom: 10px; }
  .detail-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 12px; }
  .detail-row:last-child { margin-bottom: 0; }
  .detail-row .dl { color: #374151; }
  .detail-row .dv { font-weight: 600; color: #0D9488; }
  .detail-row .dm { color: #6B7280; font-size: 11px; }

  /* ─── Schedule C ─── */
  .sc-table { width: 100%; border-collapse: collapse; }
  .sc-table th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #9CA3AF; padding-bottom: 8px; text-align: left; border-bottom: 1.5px solid #E5E7EB; }
  .sc-table th:nth-child(2) { text-align: center; }
  .sc-table th:last-child { text-align: right; }
  .sc-table td { padding: 8px 0; font-size: 12px; border-bottom: 1px solid #F3F4F6; vertical-align: middle; }
  .sc-table td:nth-child(2) { text-align: center; }
  .sc-table td:last-child { text-align: right; font-weight: 600; }
  .sc-line { font-size: 10px; font-weight: 700; color: #6B7280; background: #F3F4F6; border-radius: 4px; padding: 2px 6px; display: inline-block; }
  .sc-highlight td { font-weight: 800 !important; font-size: 13px !important; background: #ECFDF5; border-radius: 8px; }
  .sc-highlight td:first-child { border-radius: 8px 0 0 8px; padding-left: 10px; }
  .sc-highlight td:last-child { border-radius: 0 8px 8px 0; color: #059669 !important; padding-right: 10px; }
  .sc-highlight td { border-bottom: none !important; }

  /* ─── Footer ─── */
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1.5px solid #E5E7EB; display: flex; justify-content: space-between; align-items: center; }
  .footer-note { font-size: 10px; color: #9CA3AF; max-width: 420px; }
  .footer-brand { font-size: 10px; font-weight: 700; color: #0D9488; }

  /* ─── Print ─── */
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { padding: 20px; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="brand">
      <div class="brand-icon">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C7 2 3 6 3 11c0 2 .8 3.8 2 5.2V19a1 1 0 001 1h2v-2h4v2h2v-2h4v2h2a1 1 0 001-1v-2.8c1.2-1.4 2-3.2 2-5.2 0-5-4-9-9-9zm-3 9a1 1 0 110-2 1 1 0 010 2zm6 0a1 1 0 110-2 1 1 0 010 2z"/>
        </svg>
      </div>
      <div>
        <div class="brand-name">TaxSquid</div>
        <div class="brand-sub">Year-End Tax Summary</div>
      </div>
    </div>
    <div class="header-right">
      <div class="report-title">${taxHub.taxYear} Tax Year Report</div>
      <div class="report-meta">Generated ${fmtDate(today)}</div>
      <div class="report-meta">Schedule C – Sole Proprietor / Reseller</div>
    </div>
  </div>

  <hr class="divider" />

  <!-- KPI Cards -->
  <div class="kpi-row">
    <div class="kpi">
      <div class="kpi-label">Gross Revenue</div>
      <div class="kpi-value green">${fmt(metrics.grossRevenue)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Total Deductions</div>
      <div class="kpi-value red">-${fmt(totalDeductions)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Net Taxable Profit</div>
      <div class="kpi-value ${metrics.netTaxableIncome >= 0 ? 'blue' : 'red'}">${fmt(metrics.netTaxableIncome)}</div>
    </div>
  </div>

  <!-- Income -->
  <div class="section-title">Business Income</div>
  <table class="table">
    <thead>
      <tr><th>Description</th><th style="text-align:right">Amount</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>Gross Receipts / Sales (eBay reselling)</td>
        <td class="positive">${fmt(metrics.grossRevenue)}</td>
      </tr>
    </tbody>
  </table>

  <!-- Deductions -->
  <div class="section-title">Deductions &amp; Write-Offs</div>
  <table class="table">
    <thead>
      <tr><th>Category</th><th style="text-align:right">Amount</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>Cost of Goods Sold (COGS)</td>
        <td class="negative">-${fmt(metrics.cogs)}</td>
      </tr>
      <tr>
        <td>eBay Platform Fees</td>
        <td class="negative">-${fmt(fees)}</td>
      </tr>
      <tr>
        <td>Shipping, Packaging &amp; Supplies</td>
        <td class="negative">-${fmt(expenses)}</td>
      </tr>
      <tr>
        <td>
          Business Mileage Write-Off
          <br/><span style="font-size:11px;color:#6B7280">${metrics.businessMiles.toFixed(1)} mi × $${mileageRate.toFixed(2)} rate</span>
        </td>
        <td class="negative">-${fmt(metrics.mileageWriteOff)}</td>
      </tr>
      <tr>
        <td>
          Home Office Deduction
          <br/><span style="font-size:11px;color:#6B7280">${taxHub.deductionMethod === 'simplified' ? `Simplified: ${Math.min(taxHub.homeOfficeSqFt, 300)} sq ft × $5` : `Actual: ${businessPct}% of ${fmt(taxHub.annualRentMortgage)} annual rent/mortgage`}</span>
        </td>
        <td class="negative">-${fmt(homeOfficeDeduction)}</td>
      </tr>
      <tr>
        <td>
          Internet Deduction
          <br/><span style="font-size:11px;color:#6B7280">${fmt(taxHub.monthlyInternetBill)}/mo × ${taxHub.internetBusinessPct}% business use</span>
        </td>
        <td class="negative">-${fmt(internetDeduction)}</td>
      </tr>
      <tr>
        <td>
          Cell Phone Deduction
          <br/><span style="font-size:11px;color:#6B7280">${fmt(taxHub.monthlyCellBill)}/mo × ${taxHub.cellBusinessPct}% business use</span>
        </td>
        <td class="negative">-${fmt(cellDeduction)}</td>
      </tr>
      <tr class="${metrics.netTaxableIncome >= 0 ? 'net-row' : 'net-row loss'}">
        <td>Net Taxable Business Profit</td>
        <td>${fmt(metrics.netTaxableIncome)}</td>
      </tr>
    </tbody>
  </table>

  <!-- Home Office Detail -->
  <div class="detail-card">
    <div class="dc-title">▸ Home Office &amp; Utility Detail</div>
    <div class="detail-row">
      <span class="dl">Home Office Space</span>
      <span class="dm">${taxHub.homeOfficeSqFt} / ${taxHub.totalHomeSqFt} sq ft</span>
      <span class="dv">${businessPct}% business use</span>
    </div>
    <div class="detail-row">
      <span class="dl">Deduction Method</span>
      <span class="dm">${taxHub.deductionMethod === 'simplified' ? 'Simplified ($5/sq ft, max 300 sq ft)' : 'Actual Expenses Method'}</span>
      <span class="dv">-${fmt(homeOfficeDeduction)}</span>
    </div>
    <div class="detail-row">
      <span class="dl">Annual Internet Deduction</span>
      <span class="dm">${fmt(taxHub.monthlyInternetBill)}/mo × 12 × ${taxHub.internetBusinessPct}%</span>
      <span class="dv">-${fmt(internetDeduction)}</span>
    </div>
    <div class="detail-row">
      <span class="dl">Annual Cell Phone Deduction</span>
      <span class="dm">${fmt(taxHub.monthlyCellBill)}/mo × 12 × ${taxHub.cellBusinessPct}%</span>
      <span class="dv">-${fmt(cellDeduction)}</span>
    </div>
    <div style="border-top:1px solid #99F6E4;margin-top:10px;padding-top:10px;display:flex;justify-content:space-between;font-weight:700;font-size:13px;color:#0D9488">
      <span>Total Utility &amp; Home Write-Offs</span>
      <span>-${fmt(totalUtilityDeductions)}</span>
    </div>
  </div>

  <!-- Schedule C Reference -->
  <div class="section-title">Schedule C Line-Item Reference</div>
  <table class="sc-table">
    <thead>
      <tr>
        <th>Line</th>
        <th style="text-align:left">IRS Schedule C Description</th>
        <th style="text-align:right">Your Amount</th>
      </tr>
    </thead>
    <tbody>
      ${scheduleC
        .map(
          (row) => `
      <tr class="${row.highlight ? 'sc-highlight' : ''}">
        <td><span class="sc-line">${row.line}</span></td>
        <td>${row.label}</td>
        <td>${row.value}</td>
      </tr>`
        )
        .join('')}
    </tbody>
  </table>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-note">
      This report is a general summary intended to assist tax preparation and is not tax advice.
      Consult a licensed CPA or tax professional before filing. IRS standard mileage rate: $0.70/mi (2025–2026).
    </div>
    <div class="footer-brand">TaxSquid</div>
  </div>

</div>
</body>
</html>`;
}
