const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const files = [
  'a_Verband_.xlsx',
  'a_Verein_.xlsx',
  'Resultatblatt-Dez.-Matchmeisterschaft-G50m.xlsx',
  'Resultatblatt-Dez.-Matchmeisterschaft-G50m V2.xlsx'
];

files.forEach(file => {
  const filePath = path.join(__dirname, '..', '..', file);
  if (!fs.existsSync(filePath)) {
    console.log(`❌ File ${file} not found.`);
    return;
  }
  console.log(`\n===========================================`);
  console.log(`📂 Inspecting ${file}...`);
  try {
    const workbook = XLSX.readFile(filePath);
    console.log(`Sheets in ${file}:`, workbook.SheetNames);
    
    // Print first few rows of each sheet
    workbook.SheetNames.forEach(sheetName => {
      console.log(`\n--- Sheet: "${sheetName}" ---`);
      const ws = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      console.log(`Total rows: ${rows.length}`);
      console.log(`First 5 rows:`);
      rows.slice(0, 5).forEach((row, i) => {
        console.log(`  Row ${i}:`, row);
      });
    });
  } catch (err) {
    console.error(`Error reading ${file}:`, err.message);
  }
});
