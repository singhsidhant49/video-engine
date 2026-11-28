import { quarantineMediaAsset } from '../services/mediaBank.js';

const args = process.argv.slice(2);
const valueAfter = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};

const id = valueAfter('--id');
const reason = valueAfter('--reason') || 'operator review required';
if (!id) {
  console.error('Usage: npm run media-bank:quarantine -- --id <asset-id> [--reason <reason>]');
  process.exitCode = 1;
} else {
  try {
    const asset = await quarantineMediaAsset(id, reason);
    console.log(JSON.stringify({ id: asset.id, verificationStatus: asset.verificationStatus, quarantineReason: asset.quarantineReason }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
