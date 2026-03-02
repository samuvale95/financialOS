import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import { parseCSV, type ParseResult } from './parsers';

export async function parseExcel(fileUri: string): Promise<ParseResult> {
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const wb = XLSX.read(base64, { type: 'base64', cellDates: true });
  const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { FS: ';' });
  return parseCSV(csv);
}
