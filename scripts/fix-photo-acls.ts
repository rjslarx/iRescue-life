import { db } from '../server/db';
import { animals } from '../shared/schema';

async function main() {
  console.log('[FIX-ACL] Starting to fix animal photo ACLs...');
  
  const { clearObjectAclPolicy, getObjectAclPolicy } = await import('../server/objectAcl');
  const { ObjectStorageService } = await import('../server/objectStorage');
  
  const objectStorage = new ObjectStorageService();
  
  // Get all animals with photos
  const allAnimals = await db
    .select({
      id: animals.id,
      name: animals.name,
      photoUrls: animals.photoUrls,
      tenantId: animals.tenantId,
    })
    .from(animals);
  
  let fixed = 0;
  let skipped = 0;
  let errors: string[] = [];
  
  for (const animal of allAnimals) {
    if (!animal.photoUrls || animal.photoUrls.length === 0) continue;
    
    for (const photoUrl of animal.photoUrls) {
      try {
        // Only process new-format URLs with tenant ID
        if (!photoUrl.includes('/animal-photos/')) {
          skipped++;
          continue;
        }
        
        const file = await objectStorage.getObjectEntityFile(photoUrl);
        const aclPolicy = await getObjectAclPolicy(file);
        
        // If file has ACL metadata, clear it
        if (aclPolicy) {
          await clearObjectAclPolicy(file);
          fixed++;
          console.log(`[FIX-ACL] Cleared ACL from: ${photoUrl} (${animal.name})`);
        } else {
          skipped++;
        }
      } catch (error: any) {
        errors.push(`${animal.name} (${photoUrl}): ${error.message}`);
      }
    }
  }
  
  console.log(`[FIX-ACL] Complete: fixed=${fixed}, skipped=${skipped}, errors=${errors.length}`);
  if (errors.length > 0) {
    console.log('[FIX-ACL] Errors:', errors.slice(0, 10));
  }
  
  process.exit(0);
}

main().catch(err => {
  console.error('[FIX-ACL] Fatal error:', err);
  process.exit(1);
});
