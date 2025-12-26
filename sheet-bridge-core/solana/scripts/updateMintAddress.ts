import * as fs from 'fs';
import * as path from 'path';

const OLD_MINT = 'CpsKSnkJXrgxUXjJjqLR9tn3QM9RrVASHjA8LW97XHo3';
const NEW_MINT = process.argv[2];

if (!NEW_MINT) {
    console.error('Usage: ts-node scripts/updateMintAddress.ts <new-mint-address>');
    process.exit(1);
}

const filesToUpdate = [
    'scripts/checkMintAuthority.ts',
    'scripts/transferToAuthority.ts',
    'scripts/checkAuthorityBalance.ts',
    'scripts/mintToAuthority.ts',
    'scripts/initializeLock.ts',
    '../be/src/config.ts',
    '../../sheet-bridge-ui/src/config.ts',
];

console.log(`🔄 Updating mint address from ${OLD_MINT} to ${NEW_MINT}...\n`);

let updatedCount = 0;
for (const file of filesToUpdate) {
    const filePath = path.join(__dirname, '..', file);
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        const originalContent = content;
        
        // Replace the old mint address with the new one
        content = content.replace(new RegExp(OLD_MINT, 'g'), NEW_MINT);
        
        if (content !== originalContent) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`✅ Updated: ${file}`);
            updatedCount++;
        } else {
            console.log(`⏭️  Skipped: ${file} (no changes needed)`);
        }
    } catch (error: any) {
        console.error(`❌ Error updating ${file}:`, error.message);
    }
}

console.log(`\n✨ Updated ${updatedCount} file(s)`);
console.log(`\n📝 New mint address: ${NEW_MINT}`);
console.log(`\n⚠️  Don't forget to:`);
console.log(`   1. Restart the backend server`);
console.log(`   2. Rebuild the UI if needed`);
console.log(`   3. Re-initialize the lock program with the new mint address`);

