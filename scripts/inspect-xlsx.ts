import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const xlsxPath = path.join(process.cwd(), '[List of applicants] Early Apps + UMass students.xlsx');

if (!fs.existsSync(xlsxPath)) {
  console.error(`❌ File not found: ${xlsxPath}`);
  console.log('\nLooking for XLSX file in current directory...');
  const files = fs.readdirSync(process.cwd()).filter(f => f.endsWith('.xlsx'));
  if (files.length > 0) {
    console.log('\nFound XLSX files:');
    files.forEach(f => console.log(`  - ${f}`));
    console.log(`\nPlease rename your file to match: [List of applicants] Early Apps + UMass students.xlsx`);
    console.log(`Or update the script to use: ${files[0]}`);
  }
  process.exit(1);
}

try {
  console.log(`📂 Reading file: ${xlsxPath}\n`);
  const workbook = XLSX.readFile(xlsxPath);
  
  console.log(`📊 Found ${workbook.SheetNames.length} sheet(s):`);
  workbook.SheetNames.forEach((name, idx) => {
    console.log(`   ${idx + 1}. "${name}"`);
  });

  // Read the first sheet
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { raw: false }) as Array<Record<string, any>>;

  console.log(`\n📋 Sheet "${firstSheetName}" has ${data.length} rows\n`);

  if (data.length === 0) {
    console.log('⚠️  No data rows found');
    process.exit(0);
  }

  // Show column names
  const firstRow = data[0];
  const columns = Object.keys(firstRow);
  
  console.log(`📝 Column names (${columns.length} total):\n`);
  columns.forEach((col, idx) => {
    const sample = firstRow[col] ? String(firstRow[col]).substring(0, 50) : '(empty)';
    console.log(`   ${idx + 1}. "${col}"`);
    console.log(`      Sample: ${sample}${String(firstRow[col]).length > 50 ? '...' : ''}`);
  });

  // Try to identify key columns
  console.log('\n🔍 Column Mapping Analysis:\n');
  
  const emailColumns = columns.filter(c => 
    c.toLowerCase().includes('email') || 
    c.toLowerCase().includes('e-mail')
  );
  console.log(`   Email columns: ${emailColumns.length > 0 ? emailColumns.join(', ') : '❌ NONE FOUND'}`);

  const nameColumns = columns.filter(c => 
    c.toLowerCase().includes('name') && 
    !c.toLowerCase().includes('user') &&
    !c.toLowerCase().includes('display')
  );
  console.log(`   Name columns: ${nameColumns.length > 0 ? nameColumns.join(', ') : '❌ NONE FOUND'}`);

  const universityColumns = columns.filter(c => 
    c.toLowerCase().includes('university') || 
    c.toLowerCase().includes('college') ||
    c.toLowerCase().includes('school')
  );
  console.log(`   University columns: ${universityColumns.length > 0 ? universityColumns.join(', ') : '❌ NONE FOUND'}`);

  const graduationColumns = columns.filter(c => 
    c.toLowerCase().includes('grad') || 
    c.toLowerCase().includes('graduation') ||
    c.toLowerCase().includes('year')
  );
  console.log(`   Graduation columns: ${graduationColumns.length > 0 ? graduationColumns.join(', ') : '❌ NONE FOUND'}`);

  const timestampColumns = columns.filter(c => 
    c.toLowerCase().includes('timestamp') || 
    c.toLowerCase().includes('time') ||
    c.toLowerCase().includes('date') ||
    c.toLowerCase().includes('submitted')
  );
  console.log(`   Timestamp columns: ${timestampColumns.length > 0 ? timestampColumns.join(', ') : '❌ NONE FOUND'}`);

  // Show first few sample rows
  console.log('\n📄 Sample rows (first 3):\n');
  data.slice(0, 3).forEach((row, idx) => {
    console.log(`   Row ${idx + 1}:`);
    Object.entries(row).slice(0, 5).forEach(([key, value]) => {
      const val = value ? String(value).substring(0, 40) : '(empty)';
      console.log(`      ${key}: ${val}${value && String(value).length > 40 ? '...' : ''}`);
    });
    if (Object.keys(row).length > 5) {
      console.log(`      ... and ${Object.keys(row).length - 5} more fields`);
    }
    console.log('');
  });

} catch (err: any) {
  console.error('❌ Error reading XLSX file:', err.message);
  process.exit(1);
}
