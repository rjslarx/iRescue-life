function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface SurrenderAgreementData {
  tenantName: string;
  ownerName: string;
  ownerPhone?: string | null;
  ownerAddress?: string | null;
  animalName?: string | null;
  animalAge?: string | null;
  animalBreed?: string | null;
  animalSex?: string | null;
  signatureImageUrl?: string;
  signedTimestamp?: string;
}

/**
 * Builds the HTML for an owner surrender (relinquishment) agreement.
 * The legal text is parametrized with the tenant's organization name so it
 * works for any rescue. When a signature image is supplied the document is
 * rendered in its signed form (signature shown), otherwise it is rendered for
 * review with a blank signature line.
 */
export function buildSurrenderAgreementHtml(data: SurrenderAgreementData): string {
  const org = escapeHtml(data.tenantName) || 'the rescue organization';
  const ownerName = escapeHtml(data.ownerName);
  const ownerPhone = escapeHtml(data.ownerPhone);
  const ownerAddress = escapeHtml(data.ownerAddress);
  const animalName = escapeHtml(data.animalName);
  const animalAge = escapeHtml(data.animalAge);
  const animalBreed = escapeHtml(data.animalBreed);
  const animalSex = escapeHtml(data.animalSex);

  const dateStr = data.signedTimestamp
    ? new Date(data.signedTimestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const animalRows = [
    animalName ? `<tr><th>Pet's Name</th><td>${animalName}</td></tr>` : '',
    animalAge ? `<tr><th>Age</th><td>${animalAge}</td></tr>` : '',
    animalBreed ? `<tr><th>Breed</th><td>${animalBreed}</td></tr>` : '',
    animalSex ? `<tr><th>Sex</th><td>${animalSex}</td></tr>` : '',
  ].filter(Boolean).join('');

  const ownerRows = [
    ownerName ? `<tr><th>Name</th><td>${ownerName}</td></tr>` : '',
    ownerAddress ? `<tr><th>Address</th><td>${ownerAddress}</td></tr>` : '',
    ownerPhone ? `<tr><th>Phone</th><td>${ownerPhone}</td></tr>` : '',
  ].filter(Boolean).join('');

  const signatureBlock = data.signatureImageUrl
    ? `<img src="${data.signatureImageUrl}" alt="Signature" style="max-width:300px;max-height:120px;display:block;margin:8px 0;" />`
    : `<div style="border-bottom:1px solid #333;width:300px;height:48px;margin:8px 0;"></div>`;

  return `
    <div class="surrender-agreement">
      <h2 style="text-align:center;margin-bottom:4px;">Owner Surrender Agreement</h2>
      <p style="text-align:center;color:#555;margin-top:0;">${org}</p>

      ${ownerRows ? `<h3>Owner Information</h3><table>${ownerRows}</table>` : ''}
      ${animalRows ? `<h3>Animal Information</h3><table>${animalRows}</table>` : ''}

      <h3>Relinquishment of Ownership</h3>
      <p>You are the legal owner of the animal you are relinquishing.</p>
      <p>${org} will assess the physical and behavioral health of the animal's adoptability. If you subsequently call about the animal's status, you may not be given any follow up information about the animal except whether it is or is not at the shelter.</p>
      <p>I, the undersigned, owner or having control of the animal described above, hereby give ownership of said animal to ${org} to be placed for adoption or rescue.</p>
      <p>I assume all responsibility for damages caused during my ownership of said animal. I agree to make all veterinarian records for said animal available to the shelter and/or adopter of said animal.</p>
      <p>I certify, to my knowledge, that this animal has not bitten anyone in the last 10 days, nor has been exposed to rabies.</p>
      <p>I understand and agree that the shelter reserves the right to place this animal in a foster home, or for adoption.</p>

      <div class="signature-section" style="margin-top:32px;">
        <p><strong>Print Name:</strong> ${ownerName}</p>
        <p><strong>Signature:</strong></p>
        ${signatureBlock}
        <p><strong>Date:</strong> ${dateStr}</p>
      </div>
    </div>
  `.trim();
}
