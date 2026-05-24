/**
 * GAS エクスポートスクリプト
 * 既存の Google Spreadsheet を JSON にダンプする。
 *
 * 使い方:
 *   1. 既存 GAS プロジェクト（コード.gs と同じプロジェクト）にこのファイルを貼り付ける
 *   2. exportToJson() を実行する
 *   3. Google Drive に "gas_export.json" が生成されるのでダウンロードする
 *   4. ダウンロードした JSON を scripts/ に置き、migrate_from_gas.ts を実行する
 */

function exportToJson() {
  const ssId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  const ss = SpreadsheetApp.openById(ssId);

  const output = {
    exportedAt: new Date().toISOString(),
    skewers: exportSkewers(ss),
    dailyLogs: exportDailyLogs(ss),
    settings: exportSettings(ss),
    orderSchedules: exportOrderSchedules(ss),
    orderScheduleIrregulars: exportOrderScheduleIrregulars(ss),
  };

  const fileName = 'gas_export.json';
  const existing = DriveApp.getFilesByName(fileName);
  while (existing.hasNext()) existing.next().setTrashed(true);

  const file = DriveApp.createFile(fileName, JSON.stringify(output, null, 2), MimeType.PLAIN_TEXT);
  Logger.log('エクスポート完了: ' + file.getUrl());
}

function exportSkewers(ss) {
  const sheet = ss.getSheetByName('skewers');
  if (!sheet) return [];
  return sheet.getDataRange().getValues().slice(1)
    .filter(row => row[0])
    .map(row => ({
      name: row[0],
      category: row[1],
      ideal: [row[2], row[3], row[4], row[5], row[6], row[7], row[8]].map(v => Number(v) || 0),
      unit: Number(row[9]) || 1,
      threshold1: Number(row[10]) || 0,
      prepAmount1: Number(row[11]) || 0,
      threshold2: Number(row[12]) || 0,
      prepAmount2: Number(row[13]) || 0,
      active: row[14] === true || String(row[14]).toUpperCase() === 'TRUE',
      prepMethodName: row[15] || '昆布締め',
      courseType: row[16] || 'all_courses',
      targetCourses: row[17] ? String(row[17]).split(',').map(s => s.trim()).filter(Boolean) : [],
      weightPerStickG: Number(row[18]) || 0,
      yieldRate: Number(row[19]) || 1.0,
      orderUnitLabel: row[20] || '',
      orderUnitG: Number(row[21]) || 0,
    }));
}

function exportDailyLogs(ss) {
  const skewerSheet = ss.getSheetByName('skewers');
  const logSheet = ss.getSheetByName('daily_log');
  if (!logSheet) return [];

  // 在庫列に対応する串名（副産物を除く）
  const skewerNames = skewerSheet
    ? skewerSheet.getDataRange().getValues().slice(1)
        .filter(r => r[0] && r[1] !== '副産物')
        .map(r => String(r[0]))
    : [];

  return logSheet.getDataRange().getValues().slice(1)
    .filter(row => row[0])
    .map(row => {
      const stocks = [];
      let memo = '';
      for (let i = 0; i < skewerNames.length; i++) {
        const raw = row[12 + i];
        if (raw === undefined || raw === '') continue;
        const num = Number(raw);
        if (isNaN(num)) { memo = String(raw); continue; }
        stocks.push({ skewerName: skewerNames[i], stock: num, isKombu: false });
      }
      // 在庫列の末尾に文字列があればメモとして扱う
      const tail = row[12 + skewerNames.length];
      if (tail && isNaN(Number(tail))) memo = String(tail);

      return {
        date: formatDate(row[0]),
        dayOfWeek: row[1] || '',
        staffName: row[2] || '',
        recordedAt: row[3] ? formatDateTime(row[3]) : formatDate(row[0]),
        courseCasual: Number(row[4]) || 0,
        courseStandard: Number(row[5]) || 0,
        coursePremium: Number(row[6]) || 0,
        extraSkewers: Number(row[7]) || 0,
        totalSkewers: Number(row[8]) || 0,
        totalSales: Number(row[9]) || 0,
        drinkSales: Number(row[10]) || 0,
        drinkRatio: Number(row[11]) || 0,
        memo: memo,
        stocks: stocks,
      };
    });
}

function exportSettings(ss) {
  const sheet = ss.getSheetByName('settings');
  const kv = {};
  if (sheet) sheet.getDataRange().getValues().slice(1).forEach(([k, v]) => { kv[k] = v; });
  return {
    sundayBoostEnabled: kv['sunday_boost_enabled'] === true || String(kv['sunday_boost_enabled']).toUpperCase() === 'TRUE',
    courseCasualPrice: Number(kv['course_casual_price']) || 3500,
    courseStandardPrice: Number(kv['course_standard_price']) || 4500,
    coursePremiumPrice: Number(kv['course_premium_price']) || 5800,
    courseCasualSkewers: Number(kv['course_casual_skewers']) || 10,
    courseStandardSkewers: Number(kv['course_standard_skewers']) || 15,
    coursePremiumSkewers: Number(kv['course_premium_skewers']) || 20,
    lineToken: '', // セキュリティ上エクスポートしない（移行後に手動設定）
  };
}

function exportOrderSchedules(ss) {
  const sheet = ss.getSheetByName('order_schedule');
  if (!sheet) return [];
  return sheet.getDataRange().getValues().slice(1)
    .filter(row => row[0] !== '' && row[0] !== undefined)
    .map(row => ({
      deadlineDow: Number(row[0]),
      deliveryDow: Number(row[1]),
      upliftWeekday: Number(row[2]) || 0,
      upliftHoliday: Number(row[3]) || 0,
    }));
}

function exportOrderScheduleIrregulars(ss) {
  const sheet = ss.getSheetByName('order_schedule_irregular');
  if (!sheet) return [];
  return sheet.getDataRange().getValues().slice(1)
    .filter(row => row[0] !== '' && row[0] !== undefined)
    .map(row => ({
      weekStartDate: formatDate(row[0]),
      deadlineDate: formatDate(row[1]),
      deliveryDate: formatDate(row[2]),
      upliftWeekday: Number(row[3]) || 0,
      upliftHoliday: Number(row[4]) || 0,
      note: row[5] || '',
    }));
}

function formatDate(val) {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '/' + m + '/' + day;
}

function formatDateTime(val) {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return formatDate(d) + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0') + ':' +
    String(d.getSeconds()).padStart(2, '0');
}
