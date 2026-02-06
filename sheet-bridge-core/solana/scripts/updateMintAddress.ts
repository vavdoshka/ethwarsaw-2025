import * as fs from 'fs';
import * as path from 'path';

// Current mint address (default - will be replaced if old mint is provided)
const CURRENT_MINT = 'Qp8iRNXcL8bjsARWeUwpyQF8ztPLwo1gd8PM3xjrfZz';

// Parse arguments: [old-mint] <new-mint>
// If only one arg provided, use current mint as old, arg as new
// If two args provided, use first as old, second as new
let OLD_MINT: string;
let NEW_MINT: string;

if (process.argv.length === 3) {
    // Only new mint provided - use current mint as old
    OLD_MINT = CURRENT_MINT;
    NEW_MINT = process.argv[2];
} else if (process.argv.length === 4) {
    // Both old and new provided
    OLD_MINT = process.argv[2];
    NEW_MINT = process.argv[3];
} else {
    console.error('Usage: ts-node scripts/updateMintAddress.ts [old-mint-address] <new-mint-address>');
    console.error('');
    console.error('Examples:');
    console.error('  ts-node scripts/updateMintAddress.ts <new-mint-address>');
    console.error('  ts-node scripts/updateMintAddress.ts <old-mint> <new-mint>');
    process.exit(1);
}

if (!NEW_MINT || NEW_MINT === OLD_MINT) {
    console.error('❌ Error: New mint address must be different from old mint address');
    console.error(`   Old: ${OLD_MINT}`);
    console.error(`   New: ${NEW_MINT}`);
    process.exit(1);
}

const filesToUpdate = [
    'scripts/checkMintAuthority.ts',
    'scripts/transferToAuthority.ts',
    'scripts/checkAuthorityBalance.ts',
    'scripts/mintToAuthority.ts',
    'scripts/initializeLock.ts',
    'scripts/verifyConfig.ts',
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

