import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, addMonths, addDays, addYears, addWeeks } from "date-fns";

function formatDateSafe(value: string | Date, fmt: string = 'MM/dd/yyyy'): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  const dateStr = d.toISOString().split('T')[0];
  return format(new Date(dateStr + 'T12:00:00'), fmt);
}

function extrapolateNextDue(lastGiven: string | Date, frequency: string): Date | null {
  const freq = frequency.toUpperCase();
  const base = typeof lastGiven === 'string' ? new Date(lastGiven) : lastGiven;
  switch (freq) {
    case 'SID': return addDays(base, 1);
    case 'BID': return addDays(base, 1);
    case 'TID': return addDays(base, 1);
    case 'QID': return addDays(base, 1);
    case 'EOD': return addDays(base, 2);
    case 'WEEKLY': return addWeeks(base, 1);
    case 'BIWEEKLY': return addWeeks(base, 2);
    case 'MONTHLY': return addMonths(base, 1);
    case 'Q6M': return addMonths(base, 6);
    case 'ANNUALLY': return addYears(base, 1);
    case 'ONCE':
    case 'PRN':
      return null;
    default: return null;
  }
}

function calculateDueDate(record: any, dateField: string, dueField: string, durationField?: string): string {
  if (record[dueField]) {
    return formatDateSafe(record[dueField]);
  }
  if (durationField && record[durationField] && record[dateField]) {
    const calculated = addMonths(new Date(record[dateField]), record[durationField]);
    return formatDateSafe(calculated);
  }
  return 'N/A';
}

interface MedicalTransferPacketProps {
  animalId: string;
  animalName: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}

export default function MedicalTransferPacket({ 
  animalId, 
  animalName,
  variant = "outline",
  size = "default"
}: MedicalTransferPacketProps) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: tenantData } = useQuery<{ tenant: any }>({
    queryKey: ['/api/tenant'],
  });

  const handleGeneratePDF = async () => {
    setIsGenerating(true);
    
    try {
      const [
        animalResponse,
        vaccinesResponse,
        diagnosticsResponse,
        preventativeCareResponse,
        prescriptionsResponse,
        careTypesResponse
      ] = await Promise.all([
        fetch(`/api/animals/${animalId}`),
        fetch(`/api/animals/${animalId}/medical/vaccines`),
        fetch(`/api/animals/${animalId}/medical/diagnostics`),
        fetch(`/api/animals/${animalId}/preventative-care`),
        fetch(`/api/animals/${animalId}/medical/prescriptions`),
        fetch(`/api/medical/preventative-care/types`)
      ]);

      const [animalData, vaccinesData, diagnosticsData, preventativeCareData, prescriptionsData, careTypesData] = await Promise.all([
        animalResponse.json(),
        vaccinesResponse.json(),
        diagnosticsResponse.json(),
        preventativeCareResponse.json(),
        prescriptionsResponse.json(),
        careTypesResponse.json()
      ]);

      const animal = animalData.animal;
      const vaccines = vaccinesData.vaccines || [];
      const diagnostics = diagnosticsData.diagnostics || [];
      const preventativeCare = preventativeCareData.records || [];
      const prescriptions = prescriptionsData.prescriptions || [];
      const careTypes = careTypesData.types || [];
      const tenant = tenantData?.tenant;

      const jsPDFModule = await import('jspdf');
      const jsPDF = jsPDFModule.default;
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = autoTableModule.default;

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'letter'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const continuationHeaderHeight = 14;
      let yPos = margin;

      const animalIdShort = animal?.id?.substring(0, 8) || 'N/A';
      const microchipDisplay = animal?.microchipNumber || 'No Microchip';

      const addContinuationHeader = (pdfDoc: any) => {
        pdfDoc.setFontSize(8);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text(`${animal?.name || 'Unknown'} — ID: ${animalIdShort} — Microchip: ${microchipDisplay}`, margin, margin + 4);
        pdfDoc.setFont('helvetica', 'normal');
        pdfDoc.text('OFFICIAL MEDICAL TRANSFER RECORD (continued)', pageWidth - margin, margin + 4, { align: 'right' });
        pdfDoc.setLineWidth(0.3);
        pdfDoc.line(margin, margin + 7, pageWidth - margin, margin + 7);
      };

      const startNewPage = () => {
        doc.addPage();
        addContinuationHeader(doc);
        return margin + continuationHeaderHeight;
      };

      const autoTableMarginTop = margin + continuationHeaderHeight;
      let pagesBeforeAutoTable = 1;

      doc.setFont('helvetica');

      if (tenant?.logoUrl) {
        try {
          const logoUrl = tenant.logoUrl.startsWith('/') 
            ? `${window.location.origin}${tenant.logoUrl}`
            : tenant.logoUrl;
          
          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = logoUrl;
          });
          
          const maxLogoHeight = 20;
          const maxLogoWidth = 40;
          const aspectRatio = img.width / img.height;
          let logoWidth = maxLogoWidth;
          let logoHeight = logoWidth / aspectRatio;
          if (logoHeight > maxLogoHeight) {
            logoHeight = maxLogoHeight;
            logoWidth = logoHeight * aspectRatio;
          }
          
          doc.addImage(img, 'PNG', margin, yPos, logoWidth, logoHeight);
        } catch (e) {
          console.log('Could not load logo for PDF');
        }
      }

      const orgName = tenant?.orgLegalName || tenant?.name || 'Animal Rescue Organization';
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(orgName, pageWidth - margin, yPos + 5, { align: 'right' });

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      
      const addressParts = [];
      if (tenant?.orgAddressStreet) addressParts.push(tenant.orgAddressStreet);
      if (tenant?.orgAddressCity || tenant?.orgAddressState || tenant?.orgAddressZip) {
        addressParts.push(
          `${tenant?.orgAddressCity || ''}, ${tenant?.orgAddressState || ''} ${tenant?.orgAddressZip || ''}`.trim()
        );
      }
      
      let rightY = yPos + 10;
      addressParts.forEach(line => {
        doc.text(line, pageWidth - margin, rightY, { align: 'right' });
        rightY += 4;
      });
      
      if (tenant?.orgPhonePublic) {
        doc.text(`Phone: ${tenant.orgPhonePublic}`, pageWidth - margin, rightY, { align: 'right' });
        rightY += 4;
      }
      if (tenant?.orgStateLicenseNumber) {
        doc.text(`License: ${tenant.orgStateLicenseNumber}`, pageWidth - margin, rightY, { align: 'right' });
        rightY += 4;
      }

      yPos = Math.max(yPos + 25, rightY + 5);

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('OFFICIAL MEDICAL TRANSFER RECORD', pageWidth / 2, yPos, { align: 'center' });
      yPos += 3;
      
      doc.setLineWidth(0.5);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 8;

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('SECTION 1: ANIMAL IDENTITY (Signalment)', margin, yPos);
      yPos += 6;

      const signalmentData = [
        ['Name', animal?.name || 'Unknown', 'ID', animal?.id?.substring(0, 8) || 'N/A'],
        ['Species', animal?.species || 'Unknown', 'Breed', animal?.breed || 'Unknown'],
        ['Sex', animal?.petfinderGender || animal?.gender || 'Unknown', 'Age/DOB', animal?.dateOfBirth ? formatDateSafe(animal.dateOfBirth, 'MMM d, yyyy') : (animal?.age || 'Unknown')],
        ['Color', animal?.primaryColor || animal?.color || 'Unknown', 'Weight', animal?.weight ? `${animal.weight} lbs` : 'Unknown'],
        ['Spay/Neuter', animal?.neuterStatus || 'Unknown', 'Microchip', animal?.microchipNumber || '']
      ];

      pagesBeforeAutoTable = doc.getNumberOfPages();
      autoTable(doc, {
        startY: yPos,
        head: [],
        body: signalmentData.map(row => [
          { content: row[0], styles: { fontStyle: 'bold', cellWidth: 25 } },
          { content: row[1], cellWidth: 55 },
          { content: row[2], styles: { fontStyle: 'bold', cellWidth: 25 } },
          { content: row[3], cellWidth: 55 }
        ]),
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2 },
        margin: { left: margin, right: margin, top: autoTableMarginTop },
        didParseCell: function(data: any) {
          if (data.column.index === 3 && data.row.index === 4) {
            if (!animal?.microchipNumber) {
              data.cell.text = ['NO MICROCHIP FOUND'];
              data.cell.styles.textColor = [220, 53, 69];
              data.cell.styles.fontStyle = 'bold';
            }
          }
        },
        didDrawPage: function(data: any) {
          const docPage = pagesBeforeAutoTable + data.pageNumber - 1;
          if (docPage > 1) {
            addContinuationHeader(doc);
          }
        }
      });

      yPos = (doc as any).lastAutoTable.finalY + 10;

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('SECTION 2: VACCINATION HISTORY', margin, yPos);
      yPos += 6;

      // Combine vaccines from /medical/vaccines and preventative care vaccine records
      const preventativeCareVaccines = preventativeCare.filter((r: any) => r.careCategory === 'vaccine');
      
      // Convert /medical/vaccines to table format
      const medicalVaccinesFormatted = vaccines.map((v: any) => [
        v.vaccineName || 'Unknown',
        v.dateGiven ? formatDateSafe(v.dateGiven) : 'N/A',
        calculateDueDate(v, 'dateGiven', 'dueDate', 'validDurationMonths'),
        v.manufacturer && v.lotNumber ? `${v.manufacturer} / ${v.lotNumber}` : (v.manufacturer || v.lotNumber || 'N/A'),
        v.administeredBy || v.clinicName || 'In-House'
      ]);
      
      // Convert preventative care vaccine records to table format
      const preventativeCareVaccinesFormatted = preventativeCareVaccines.map((v: any) => [
        v.careName || 'Unknown',
        v.dateAdministered ? formatDateSafe(v.dateAdministered) : 'N/A',
        calculateDueDate(v, 'dateAdministered', 'nextDueDate'),
        v.manufacturer && v.lotNumber ? `${v.manufacturer} / ${v.lotNumber}` : (v.manufacturer || v.lotNumber || 'N/A'),
        v.administeredBy || v.clinicName || 'In-House'
      ]);
      
      // Combine all vaccine records
      const allVaccineTableData = [...medicalVaccinesFormatted, ...preventativeCareVaccinesFormatted];
      
      if (allVaccineTableData.length > 0) {
        const vaccineTableData = allVaccineTableData;

        pagesBeforeAutoTable = doc.getNumberOfPages();
        autoTable(doc, {
          startY: yPos,
          head: [['Vaccine', 'Date Given', 'Date Due', 'Manufacturer/Lot #', 'Administered By']],
          body: vaccineTableData,
          theme: 'striped',
          headStyles: { fillColor: [66, 66, 66], fontSize: 8 },
          styles: { fontSize: 8, cellPadding: 2 },
          margin: { left: margin, right: margin, top: autoTableMarginTop },
          didDrawPage: function(data: any) {
            const docPage = pagesBeforeAutoTable + data.pageNumber - 1;
            if (docPage > 1) {
              addContinuationHeader(doc);
            }
          }
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;
      } else {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.text('No vaccination records on file.', margin, yPos);
        yPos += 10;
      }

      if (yPos > pageHeight - 80) {
        yPos = startNewPage();
      }

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('SECTION 3: DIAGNOSTIC TESTING', margin, yPos);
      yPos += 6;

      const testRecords = preventativeCare.filter((r: any) => r.careCategory === 'test');
      const allTests = [...diagnostics, ...testRecords];

      if (allTests.length > 0) {
        const testTableData = allTests.map((t: any) => {
          const testName = t.testName || t.testType || t.careName || 'Unknown';
          const testDate = t.testDate || t.datePerformed || t.dateAdministered;
          const result = t.result || t.testResult || 'Pending';
          return [
            testName,
            testDate ? formatDateSafe(testDate) : 'N/A',
            result.charAt(0).toUpperCase() + result.slice(1)
          ];
        });

        pagesBeforeAutoTable = doc.getNumberOfPages();
        autoTable(doc, {
          startY: yPos,
          head: [['Test', 'Date', 'Result']],
          body: testTableData,
          theme: 'striped',
          headStyles: { fillColor: [66, 66, 66], fontSize: 8 },
          styles: { fontSize: 8, cellPadding: 2 },
          margin: { left: margin, right: margin, top: autoTableMarginTop },
          didParseCell: function(data: any) {
            if (data.section === 'body' && data.column.index === 2) {
              const value = data.cell.raw?.toString().toLowerCase();
              if (value === 'positive') {
                data.cell.styles.textColor = [220, 53, 69];
                data.cell.styles.fontStyle = 'bold';
              } else if (value === 'negative') {
                data.cell.styles.textColor = [40, 167, 69];
              }
            }
          },
          didDrawPage: function(data: any) {
            const docPage = pagesBeforeAutoTable + data.pageNumber - 1;
            if (docPage > 1) {
              addContinuationHeader(doc);
            }
          }
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;
      } else {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.text('No diagnostic test records on file.', margin, yPos);
        yPos += 10;
      }

      if (yPos > pageHeight - 80) {
        yPos = startNewPage();
      }

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('SECTION 4: CURRENT MEDICATIONS & PREVENTATIVES', margin, yPos);
      yPos += 6;

      const preventatives = preventativeCare.filter((r: any) => r.careCategory === 'parasite_prevention');

      const getCoverageCategory = (ct: any): string => {
        if (ct.coversHeartworm) return 'heartworm';
        if (ct.coversFleaTick) return 'fleaTick';
        return 'dewormer';
      };

      const productNameToCategory: Record<string, string> = {};
      careTypes.filter((ct: any) => ct.category === 'parasite_prevention').forEach((ct: any) => {
        productNameToCategory[ct.name.toLowerCase()] = getCoverageCategory(ct);
      });

      const preventativeCategory = (p: any): string | null => {
        if (p.careTypeId) {
          const ct = careTypes.find((t: any) => t.id === p.careTypeId);
          if (ct) return getCoverageCategory(ct);
        }
        const name = (p.careName || '').toLowerCase();
        if (name.includes('heartworm')) return 'heartworm';
        if (name.includes('flea') || name.includes('tick')) return 'fleaTick';
        if (name.includes('deworm') || name.includes('wormer')) return 'dewormer';
        return null;
      };

      const rxCoverage = (rx: any): string | null => {
        const medName = (rx.medicationName || '').toLowerCase();
        if (productNameToCategory[medName]) return productNameToCategory[medName];
        for (const [productName, cat] of Object.entries(productNameToCategory)) {
          if (medName.includes(productName) || productName.includes(medName)) return cat;
        }
        if (medName.includes('heart')) return 'heartworm';
        if (medName.includes('flea') || medName.includes('tick') || medName.includes('nexgard') || medName.includes('bravecto') || medName.includes('simparica')) return 'fleaTick';
        if (medName.includes('deworm') || medName.includes('wormer') || medName.includes('panacur') || medName.includes('fenbendazole') || medName.includes('pyrantel')) return 'dewormer';
        return null;
      };

      const matchedRxIds = new Set<string>();

      const mergedPreventatives = preventatives.map((p: any) => {
        const pCat = preventativeCategory(p);
        if (!pCat) return p;

        const candidates = prescriptions.filter((rx: any) => {
          if (matchedRxIds.has(rx.id)) return false;
          return rxCoverage(rx) === pCat;
        });

        if (candidates.length === 0) return p;

        let matchingRx = candidates[0];
        if (candidates.length > 1) {
          const careName = (p.careName || '').toLowerCase();
          const nameMatch = candidates.find((rx: any) => {
            const medName = (rx.medicationName || '').toLowerCase();
            return medName.includes(careName) || careName.includes(medName);
          });
          if (nameMatch) {
            matchingRx = nameMatch;
          } else {
            return p;
          }
        }

        matchedRxIds.add(matchingRx.id);
        return { ...p, _matchedRx: matchingRx };
      });

      const unmatchedRx = prescriptions.filter((rx: any) => !matchedRxIds.has(rx.id));

      const hasPreventatives = mergedPreventatives.length > 0;
      const hasUnmatchedRx = unmatchedRx.length > 0;
      
      if (hasPreventatives || hasUnmatchedRx) {
        const medicationTableData: string[][] = [];
        
        mergedPreventatives.forEach((p: any) => {
          const rx = p._matchedRx;
          if (rx) {
            const lastGiven = rx.lastGivenAt || p.dateAdministered;
            const nextDue = p.nextDueDate || rx.nextScheduledDose;
            let nextDueDisplay = '\u2014';
            if (nextDue) {
              nextDueDisplay = formatDateSafe(nextDue);
            } else if (lastGiven && rx.frequency) {
              const extrapolated = extrapolateNextDue(lastGiven, rx.frequency);
              if (extrapolated) nextDueDisplay = formatDateSafe(extrapolated);
            }
            medicationTableData.push([
              rx.medicationName || p.careName || 'Unknown',
              rx.dosage || 'Preventative',
              rx.startDate ? formatDateSafe(rx.startDate) : '\u2014',
              lastGiven ? formatDateSafe(lastGiven) : 'N/A',
              '\u2014',
              nextDueDisplay
            ]);
          } else {
            medicationTableData.push([
              p.careName || 'Unknown',
              'Preventative',
              '\u2014',
              p.dateAdministered ? formatDateSafe(p.dateAdministered) : 'N/A',
              '\u2014',
              calculateDueDate(p, 'dateAdministered', 'nextDueDate')
            ]);
          }
        });
        
        unmatchedRx.forEach((rx: any) => {
          let endDateDisplay = 'Ongoing';
          if (rx.endDate) {
            const endDay = formatDateSafe(rx.endDate, 'yyyy-MM-dd');
            const startDay = rx.startDate ? formatDateSafe(rx.startDate, 'yyyy-MM-dd') : '';
            endDateDisplay = endDay === startDay ? '\u2014' : formatDateSafe(rx.endDate);
          }
          let nextDueDisplay = '\u2014';
          if (rx.nextScheduledDose) {
            const nextDue = new Date(rx.nextScheduledDose);
            const lastGiven = rx.lastGivenAt ? new Date(rx.lastGivenAt) : null;
            if (lastGiven && nextDue < lastGiven) {
              nextDueDisplay = '\u2014';
            } else {
              nextDueDisplay = formatDateSafe(nextDue);
            }
          }
          if (nextDueDisplay === '\u2014' && rx.lastGivenAt && rx.frequency) {
            const isOngoing = !rx.endDate || (rx.startDate &&
              formatDateSafe(rx.endDate, 'yyyy-MM-dd') === formatDateSafe(rx.startDate, 'yyyy-MM-dd'));
            if (isOngoing) {
              const extrapolated = extrapolateNextDue(rx.lastGivenAt, rx.frequency);
              if (extrapolated) {
                nextDueDisplay = formatDateSafe(extrapolated);
              }
            }
          }
          medicationTableData.push([
            rx.medicationName || 'Unknown',
            rx.dosage || 'As directed',
            rx.startDate ? formatDateSafe(rx.startDate) : 'N/A',
            rx.lastGivenAt ? formatDateSafe(rx.lastGivenAt) : '\u2014',
            endDateDisplay,
            nextDueDisplay
          ]);
        });

        pagesBeforeAutoTable = doc.getNumberOfPages();
        autoTable(doc, {
          startY: yPos,
          head: [['Medication/Preventative', 'Type/Dosage', 'Start Date', 'Last Given', 'End Date', 'Next Due']],
          body: medicationTableData,
          theme: 'striped',
          headStyles: { fillColor: [66, 66, 66], fontSize: 8 },
          styles: { fontSize: 8, cellPadding: 2 },
          margin: { left: margin, right: margin, top: autoTableMarginTop },
          didDrawPage: function(data: any) {
            const docPage = pagesBeforeAutoTable + data.pageNumber - 1;
            if (docPage > 1) {
              addContinuationHeader(doc);
            }
          }
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;
      } else {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.text('No current medications or preventatives on file.', margin, yPos);
        yPos += 10;
      }

      if (yPos + 20 > pageHeight - margin) {
        yPos = startNewPage();
      }
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('SECTION 5: UPCOMING PREVENTATIVE & MEDICAL CARE', margin, yPos);
      yPos += 6;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const upcomingItems: { name: string; type: string; dueDate: Date }[] = [];

      preventativeCare.forEach((r: any) => {
        const matchedMp = mergedPreventatives?.find((mp: any) => mp.id === r.id && mp._matchedRx);
        const dueStr = matchedMp?._matchedRx?.nextScheduledDose || r.nextDueDate;
        if (dueStr) {
          const due = new Date(dueStr);
          if (due >= today) {
            const displayName = matchedMp?._matchedRx?.medicationName || r.careName || 'Unknown';
            upcomingItems.push({ name: displayName, type: 'Preventative', dueDate: due });
          }
        }
      });

      vaccines.forEach((v: any) => {
        const dueStr = v.dateDue || v.dueDate;
        if (dueStr) {
          const due = new Date(dueStr);
          if (due >= today) {
            upcomingItems.push({ name: v.itemName || v.vaccineName || 'Unknown Vaccine', type: 'Vaccine', dueDate: due });
          }
        }
      });

      prescriptions.forEach((rx: any) => {
        if (matchedRxIds.has(rx.id)) return;
        const dueStr = rx.nextScheduledDose;
        if (dueStr) {
          const due = new Date(dueStr);
          if (due >= today) {
            upcomingItems.push({ name: rx.medicationName || 'Unknown Medication', type: 'Medication', dueDate: due });
          }
        }
      });

      upcomingItems.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

      if (upcomingItems.length > 0) {
        const upcomingTableData = upcomingItems.map(item => [
          item.name,
          item.type,
          formatDateSafe(item.dueDate)
        ]);

        pagesBeforeAutoTable = doc.getNumberOfPages();
        autoTable(doc, {
          startY: yPos,
          head: [['Item Name', 'Type', 'Next Due Date']],
          body: upcomingTableData,
          theme: 'striped',
          headStyles: { fillColor: [66, 66, 66], fontSize: 8 },
          styles: { fontSize: 8, cellPadding: 2 },
          margin: { left: margin, right: margin, top: autoTableMarginTop },
          didDrawPage: function(data: any) {
            const docPage = pagesBeforeAutoTable + data.pageNumber - 1;
            if (docPage > 1) {
              addContinuationHeader(doc);
            }
          }
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;
      } else {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.text('No upcoming preventative or medical care scheduled.', margin, yPos);
        yPos += 10;
      }

      const signatureBlockHeight = 50;
      if (yPos + signatureBlockHeight > pageHeight - margin) {
        yPos = startNewPage();
      }

      doc.setLineWidth(0.3);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 6;

      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      const attestation = 'I certify that the information provided in this record is a true and accurate reflection of the medical history for the animal described above. To the best of my knowledge, this animal displays no clinical signs of infectious disease at the time of transfer.';
      const splitAttestation = doc.splitTextToSize(attestation, pageWidth - (margin * 2));
      doc.text(splitAttestation, margin, yPos);
      yPos += splitAttestation.length * 4 + 8;

      doc.setFont('helvetica', 'normal');
      doc.text('Authorized Representative: _________________________________', margin, yPos);
      doc.text(`Date: ${format(new Date(), 'MM/dd/yyyy')}`, pageWidth - margin - 40, yPos);
      yPos += 10;

      if (tenant?.supervisingVetName) {
        doc.setFontSize(8);
        doc.text(
          `Medical Protocols Supervised By: ${tenant.supervisingVetName}${tenant.supervisingVetLicense ? ` (License: ${tenant.supervisingVetLicense})` : ''}`,
          margin, yPos
        );
      }

      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text(
          `Page ${i} of ${totalPages}`,
          pageWidth / 2,
          pageHeight - 8,
          { align: 'center' }
        );
      }

      doc.save(`${animal?.name || 'animal'}-medical-transfer-packet.pdf`);
      
      toast({
        title: "Transfer Packet Generated",
        description: "The official medical transfer record has been downloaded.",
      });
    } catch (error: any) {
      console.error('Error generating transfer packet:', error);
      console.error('Error message:', error?.message);
      console.error('Error stack:', error?.stack);
      toast({
        title: "Error generating packet",
        description: error?.message || "Failed to generate the medical transfer packet. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleGeneratePDF}
      disabled={isGenerating}
      data-testid="button-download-transfer-packet"
    >
      {isGenerating ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <FileText className="h-4 w-4 mr-2" />
      )}
      {isGenerating ? 'Generating...' : 'Download Official Packet'}
    </Button>
  );
}
