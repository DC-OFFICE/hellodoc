/**
 * Client-side exports for billing reports (CSV, Excel .xlsx and PDF).
 * The Excel and PDF libraries are loaded on demand so normal page loads stay light.
 */

export type ExportColumn = { key: string; label: string; align?: 'left' | 'right' };
export type ExportRow = Record<string, string | number | null | undefined>;

export type ExportableReport = {
  title: string;
  clinicName?: string | null;
  from: string;
  to: string;
  columns: ExportColumn[];
  rows: ExportRow[];
  summary: Array<{ label: string; value: string }>;
};

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

function fileBaseName(report: ExportableReport) {
  const slug = report.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `hellodoc-${slug}-${report.from}-to-${report.to}`;
}

function cellText(value: ExportRow[string]): string {
  return value === null || value === undefined ? '' : String(value);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value: string): string {
  // Neutralise spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function exportCsv(report: ExportableReport) {
  const lines = [
    report.columns.map((c) => csvCell(c.label)).join(','),
    ...report.rows.map((row) => report.columns.map((c) => csvCell(cellText(row[c.key]))).join(',')),
  ];
  const blob = new Blob([`﻿${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `${fileBaseName(report)}.csv`);
}

async function exportXlsx(report: ExportableReport) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const isNumeric = (column: ExportColumn, value: ExportRow[string]) =>
    column.align === 'right' && value !== '' && value !== null && value !== undefined && !Number.isNaN(Number(value));

  const header = report.columns.map((c) => ({ value: c.label, fontWeight: 'bold' as const }));
  const body = report.rows.map((row) =>
    report.columns.map((c) => {
      const value = row[c.key];
      return isNumeric(c, value)
        ? { value: Number(value), type: Number, format: String(value).includes('.') ? '#,##0.00' : '0' }
        : { value: cellText(value), type: String };
    }),
  );
  const summary = [
    [],
    [{ value: 'Summary', fontWeight: 'bold' as const }],
    ...report.summary.map((s) => [{ value: s.label }, { value: s.value }]),
  ];
  const blob = await writeXlsxFile([header, ...body, ...summary], {
    sheet: report.title.slice(0, 31),
    columns: report.columns.map((c) => ({ width: Math.max(12, Math.min(40, c.label.length + 6)) })),
  }).toBlob();
  downloadBlob(blob, `${fileBaseName(report)}.xlsx`);
}

async function exportPdf(report: ExportableReport) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: report.columns.length > 6 ? 'landscape' : 'portrait', unit: 'pt' });
  const margin = 36;

  doc.setFontSize(14);
  doc.text(report.title, margin, margin + 4);
  doc.setFontSize(9);
  doc.setTextColor(100);
  const subtitle = [
    report.clinicName,
    `Period: ${report.from} to ${report.to} (Asia/Colombo)`,
    `Generated: ${new Date().toLocaleString('en-GB')}`,
  ]
    .filter(Boolean)
    .join('  ·  ');
  doc.text(subtitle, margin, margin + 20);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: margin + 32,
    margin: { left: margin, right: margin },
    head: [['Summary', '']],
    body: report.summary.map((s) => [s.label, s.value]),
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } },
    tableWidth: 260,
  });

  const lastY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? margin + 32;
  autoTable(doc, {
    startY: lastY + 14,
    margin: { left: margin, right: margin },
    head: [report.columns.map((c) => c.label)],
    body: report.rows.length
      ? report.rows.map((row) => report.columns.map((c) => cellText(row[c.key])))
      : [[{ content: 'No records for this period', colSpan: report.columns.length }]],
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [15, 118, 110] },
    columnStyles: Object.fromEntries(
      report.columns.map((c, i) => [i, { halign: c.align === 'right' ? 'right' : 'left' }]),
    ),
    didDrawPage: () => {
      const page = doc.getCurrentPageInfo().pageNumber;
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Page ${page}`, doc.internal.pageSize.getWidth() - margin, doc.internal.pageSize.getHeight() - 16, {
        align: 'right',
      });
      doc.setTextColor(0);
    },
  });

  doc.save(`${fileBaseName(report)}.pdf`);
}

export async function exportReport(report: ExportableReport, format: ExportFormat) {
  if (format === 'csv') return exportCsv(report);
  if (format === 'xlsx') return exportXlsx(report);
  return exportPdf(report);
}
