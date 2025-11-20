import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

function buildCsv(headers: string[], rows: Array<Array<string | number>>): string {
  const escape = (value: string | number) => {
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  return [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n');
}

export async function shareCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number>>
) {
  const csv = buildCsv(headers, rows);
  const path = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });

  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device');
  }

  await Sharing.shareAsync(path, {
    mimeType: 'text/csv',
    dialogTitle: filename
  });
}
