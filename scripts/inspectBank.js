import fs from 'fs';

const bank = JSON.parse(fs.readFileSync('.cache/image_bank/bank_index.json', 'utf8'));
console.log('Bank keys:', Object.keys(bank));
const entries = Array.isArray(bank) ? bank : bank.images || bank.items || bank.entries || Object.values(bank);
console.log('Total entries:', entries.length);

const targets = ['Nvidia', 'Rupee', 'Parallel Universe', 'garbage', 'twigs', 'Toyota'];
entries.forEach(e => {
  const title = e.title || e.label || e.name || e.id || '';
  if (targets.some(t => title.toLowerCase().includes(t.toLowerCase()))) {
    console.log('----------------------------------------------------');
    console.log('ID:', e.id);
    console.log('Title/Label:', title);
    console.log('Tokens:', e.tokens);
    console.log('Tags:', e.tags);
    console.log('Concepts:', e.concepts);
    console.log('Query:', e.query);
    console.log('Source:', e.source || e.provider);
    console.log('Path:', e.path || e.localPath);
  }
});
