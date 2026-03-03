import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import { parseCSV, type ParseResult } from './parsers';

export async function parseExcel(fileUri: string): Promise<ParseResult> {
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const wb = XLSX.read(base64, { type: 'base64', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];

  // Normalizza tutte le celle data in DD/MM/YYYY prima di convertire in CSV.
  // Senza questo, sheet_to_csv formatta le date in modo locale/imprevedibile.
  const ref = ws['!ref'];
  if (ref) {
    const range = XLSX.utils.decode_range(ref);
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (cell && cell.t === 'd' && cell.v instanceof Date) {
          const d = cell.v as Date;
          const day = String(d.getDate()).padStart(2, '0');
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const year = d.getFullYear();
          cell.t = 's';
          cell.v = `${day}/${month}/${year}`;
          cell.w = cell.v;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (cell as any).z;
        }
      }
    }
  }

  const csv = XLSX.utils.sheet_to_csv(ws, { FS: ';' });
  return parseCSV(csv);
}
