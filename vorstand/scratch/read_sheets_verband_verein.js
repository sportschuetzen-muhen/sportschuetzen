const XLSX = require('xlsx');
const path = require('path');

const files = ['a_Verband_.xlsx', 'a_Verein_.xlsx'];

files.forEach(file => {
  const filePath = path.join(__dirname, '..', '..', file);
  console.log(`\n===========================================`);
  console.log(`📂 Inspecting ${file}...`);
  try {
    const workbook = XLSX.readFile(filePath);
    console.log(`Sheets in ${file}:`, workbook.SheetNames);
    
    workbook.SheetNames.forEach(sheetName => {
      console.log(`\n--- Sheet: "${sheetName}" ---`);
      const ws = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      console.log(`Total rows: ${rows.length}`);
      
      // Look for rows that look like headers or data
      for (let i = 0; i < Math.min(rows.length, 45); i++) {
        const row = rows[i] || [];
        if (row.length > 0 && row.some(cell => String(cell).trim() !== '')) {
          console.log(`  Row ${i}:`, row.slice(0, 10));
        }
      }
    });
  } catch (err) {
    console.error(`Error reading ${file}:`, err.message);
  }
});
