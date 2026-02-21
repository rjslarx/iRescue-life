import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, addMonths } from "date-fns";

function calculateDueDate(record: any, dateField: string, dueField: string, durationField?: string): string {
  if (record[dueField]) {
    return format(new Date(record[dueField]), 'MM/dd/yyyy');
  }
  if (durationField && record[durationField] && record[dateField]) {
    const calculated = addMonths(new Date(record[dateField]), record[durationField]);
    return format(calculated, 'MM/dd/yyyy');
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
        prescriptionsResponse
      ] = await Promise.all([
        fetch(`/api/animals/${animalId}`),
        fetch(`/api/animals/${animalId}/medical/vaccines`),
        fetch(`/api/animals/${animalId}/medical/diagnostics`),
        fetch(`/api/animals/${animalId}/preventative-care`),
        fetch(`/api/animals/${animalId}/medical/prescriptions`)
      ]);

      const [animalData, vaccinesData, diagnosticsData, preventativeCareData, prescriptionsData] = await Promise.all([
        animalResponse.json(),
        vaccinesResponse.json(),
        diagnosticsResponse.json(),
        preventativeCareResponse.json(),
        prescriptionsResponse.json()
      ]);

      const animal = animalData.animal;
      const vaccines = vaccinesData.vaccines || [];
      const diagnostics = diagnosticsData.diagnostics || [];
      const preventativeCare = preventativeCareData.records || [];
      const prescriptions = prescriptionsData.prescriptions || [];
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
        ['Sex', animal?.petfinderGender || animal?.gender || 'Unknown', 'Age/DOB', animal?.dateOfBirth ? format(new Date(animal.dateOfBirth), 'MMM d, yyyy') : (animal?.age || 'Unknown')],
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
        v.dateGiven ? format(new Date(v.dateGiven), 'MM/dd/yyyy') : 'N/A',
        calculateDueDate(v, 'dateGiven', 'dueDate', 'validDurationMonths'),
        v.manufacturer && v.lotNumber ? `${v.manufacturer} / ${v.lotNumber}` : (v.manufacturer || v.lotNumber || 'N/A'),
        v.administeredBy || v.clinicName || 'In-House'
      ]);
      
      // Convert preventative care vaccine records to table format
      const preventativeCareVaccinesFormatted = preventativeCareVaccines.map((v: any) => [
        v.careName || 'Unknown',
        v.dateAdministered ? format(new Date(v.dateAdministered), 'MM/dd/yyyy') : 'N/A',
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
            testDate ? format(new Date(testDate), 'MM/dd/yyyy') : 'N/A',
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

      // Combine preventatives with any active prescriptions
      const hasPreventatives = preventatives.length > 0;
      const hasPrescriptions = prescriptions.length > 0;
      
      if (hasPreventatives || hasPrescriptions) {
        // Build combined medication table
        const medicationTableData: string[][] = [];
        
        // Add preventatives
        preventatives.forEach((p: any) => {
          medicationTableData.push([
            p.careName || 'Unknown',
            'Preventative',
            '\u2014',
            p.dateAdministered ? format(new Date(p.dateAdministered), 'MM/dd/yyyy') : 'N/A',
            '\u2014',
            calculateDueDate(p, 'dateAdministered', 'nextDueDate')
          ]);
        });
        
        // Add prescriptions (medications)
        prescriptions.forEach((rx: any) => {
          medicationTableData.push([
            rx.medicationName || 'Unknown',
            rx.dosage || 'As directed',
            rx.startDate ? format(new Date(rx.startDate), 'MM/dd/yyyy') : 'N/A',
            rx.lastGivenAt ? format(new Date(rx.lastGivenAt), 'MM/dd/yyyy') : '\u2014',
            rx.endDate ? format(new Date(rx.endDate), 'MM/dd/yyyy') : 'Ongoing',
            rx.nextScheduledDose ? format(new Date(rx.nextScheduledDose), 'MM/dd/yyyy') : '\u2014'
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
