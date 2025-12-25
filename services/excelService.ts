
import { Employee } from '../types';

interface XLSXUtils {
  sheet_to_json: (worksheet: any, options?: { header?: number; defval?: string; raw?: boolean }) => any[][];
}

interface XLSXWorkbook {
  SheetNames: string[];
  Sheets: { [key: string]: any };
}

interface XLSXLib {
  read: (data: Uint8Array, options: { type: string; codepage?: number; raw?: boolean }) => XLSXWorkbook;
  utils: XLSXUtils;
}

declare const XLSX: XLSXLib;

/**
 * 文字列の徹底的な正規化
 */
const extremeNormalize = (val: string | number | null | undefined): string => {
  if (val === undefined || val === null) return '';
  return String(val)
    .trim()
    .normalize('NFKC') // 半角カナを全角に、全角英数を半角に統一
    .replace(/[\s\t\n\r]/g, '') // 空白、タブ、改行をすべて除去
    .toLowerCase();
};

/**
 * 判定用キーワード定義
 */
const TARGET_HEADERS = {
  CODE: ['担当者コード', '担当者ｺｰﾄﾞ', 'コード', '社員番号', '社員CD', 'CD', 'ID', 'NO'],
  NAME: ['担当者名', '氏名', '名前', '従業員名'],
  DEPT: ['所属名', '部署', '所属', '部署名', '課', 'グループ'],
  ROLE: ['役職', '雇用', '区分', '役割', '職種', '形態']
};

const processWorkbookRobustly = (workbook: XLSXWorkbook): Employee[] => {
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  
  // 2次元配列として全データを取得
  let rows: (string | number)[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
  if (rows.length === 0) return [];

  // --- デリミタ異常の救済措置 ---
  // もし全行が1列しかなく、かつその中にカンマやタブが含まれている場合、強制的に分割する
  const looksLikeJoined = rows.every(r => r.length <= 1);
  if (looksLikeJoined) {
    rows = rows.map(r => {
      const cell = String(r[0] || '');
      if (cell.includes('\t')) return cell.split('\t');
      if (cell.includes(',')) return cell.split(',');
      return r;
    });
  }

  let headerIndex = -1;
  let mapping = { code: -1, name: -1, dept: -1, role: -1 };

  // 1. ヘッダー行の特定
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    const currentMapping = { code: -1, name: -1, dept: -1, role: -1 };
    let matchCount = 0;

    row.forEach((cell, idx) => {
      const normalized = extremeNormalize(cell);
      if (!normalized) return;

      const isMatch = (list: string[]) => list.some(k => {
        const nk = extremeNormalize(k);
        return normalized === nk || normalized.includes(nk);
      });

      if (currentMapping.code === -1 && isMatch(TARGET_HEADERS.CODE)) { currentMapping.code = idx; matchCount++; }
      else if (currentMapping.name === -1 && isMatch(TARGET_HEADERS.NAME)) { 
        // メールアドレスを含まない場合のみ氏名とする
        if (!normalized.includes('@')) {
          currentMapping.name = idx; matchCount++; 
        }
      }
      else if (currentMapping.dept === -1 && isMatch(TARGET_HEADERS.DEPT)) { currentMapping.dept = idx; matchCount++; }
      else if (currentMapping.role === -1 && isMatch(TARGET_HEADERS.ROLE)) { currentMapping.role = idx; matchCount++; }
    });

    if (matchCount >= 2) {
      headerIndex = i;
      mapping = currentMapping;
      break;
    }
  }

  // 救済：ヘッダーが見つからない場合、1行目を項目名、それ以降をデータと仮定して列を推測
  if (headerIndex === -1) {
    headerIndex = 0;
    mapping = { code: 0, name: 1, dept: 2, role: 3 }; 
  }

  const headerRow = rows[headerIndex];
  const results: Employee[] = [];

  // 2. データ抽出
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    // 空行や、氏名がない行はスキップ
    if (!row || row.length === 0) continue;
    
    const nameVal = String(row[mapping.name] || '').trim();
    if (!nameVal || nameVal.includes('@')) continue;

    const code = String(row[mapping.code] || '').trim() || String(i);
    const department = String(row[mapping.dept] || '部署不明').trim();
    const role = String(row[mapping.role] || '一般').trim();

    // 全情報をAIが理解しやすい形式で統合
    const infoParts: string[] = [];
    headerRow.forEach((h, idx) => {
      const val = String(row[idx] || '').trim();
      const hName = String(h || `項目${idx}`).trim();
      if (val) infoParts.push(`${hName}: ${val}`);
    });

    results.push({
      code,
      name: nameVal,
      department,
      role,
      rawInfo: infoParts.join(', ')
    });
  }

  return results;
};

export const extractEmployeesFromExcel = async (file: File): Promise<Employee[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const isCsv = file.name.toLowerCase().endsWith('.csv');

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        
        // CSVの場合は codepage 932 (Shift-JIS) を優先的に試す
        const tryRead = (cp?: number) => {
          try {
            const workbook = XLSX.read(data, { type: 'array', codepage: cp, raw: false });
            return processWorkbookRobustly(workbook);
          } catch (err) {
            return [];
          }
        };

        let employees = isCsv ? tryRead(932) : tryRead();
        // Shift-JISでダメならデフォルトで試行
        if (employees.length === 0) employees = tryRead();

        if (employees.length === 0) {
          throw new Error("社員データが見つかりませんでした。1行目に「担当者名」などの項目名が含まれているか、区切り文字が正しいか確認してください。");
        }

        resolve(employees);
      } catch (err) {
        reject(err instanceof Error ? err.message : "ファイルの解析に失敗しました。");
      }
    };
    reader.readAsArrayBuffer(file);
  });
};
