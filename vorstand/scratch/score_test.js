const XLSX = require('xlsx');
const path = require('path');

const file = 'a_Verein_.xlsx';
const filePath = path.join(__dirname, '..', '..', file);
const workbook = XLSX.readFile(filePath);

const SCORE_KEYWORDS = [
  'lizenz', 'ausweis', 'liz', 'total', 'resultat', 'ergebnis',
  'punkte', 'passe', 'stich', 'name', 'vorname', 'jahrgang'
];

workbook.SheetNames.forEach(sheetName => {
  const ws = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  let score = 0;
  console.log(`\n=================== Sheet: "${sheetName}" ===================`);
  
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const row = rows[r] || [];
    let rowMatched = false;
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || '').toLowerCase().trim();
      SCORE_KEYWORDS.forEach(k => {
        if (val.includes(k)) {
          console.log(`  Row ${r}, Col ${c} matches "${k}": "${row[c]}"`);
          score++;
        }
      });
    }
  }
  console.log(`Total Score for "${sheetName}": ${score}`);
});
