import { useParams, useSearch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Printer, X, AlertTriangle, Pill, Edit, Eye, Cat, Dog, Check, XIcon, Heart, Baby, Zap, Activity, Calendar, Truck, Scale, Utensils, User, Share, Info } from "lucide-react";
import { format } from "date-fns";
import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

interface MedicalFundStatus {
  hasCampaign: boolean;
  goal: number | null;
  raised: number;
  url: string | null;
  qrCodeUrl: string | null;
  campaignId: string | null;
}

interface Tenant {
  id: string;
  name: string;
  subdomain: string;
}

type CardTemplate = "public" | "staff";

export default function KennelCardPage() {
  const { animalId } = useParams<{ animalId: string }>();
  const { user } = useAuth();
  const { tenantId, basePath } = useTenant();
  const searchString = useSearch();
  const [, navigate] = useLocation();
  
  // Storage key for template preference
  const TEMPLATE_STORAGE_KEY = 'kennel-card-template';
  
  // Lazy initializer for template - reads from URL or localStorage immediately
  const getInitialTemplate = (): CardTemplate => {
    // First check URL params
    const urlParams = new URLSearchParams(window.location.search);
    const templateParam = urlParams.get("template");
    if (templateParam === "staff" || templateParam === "public") {
      // Also save URL param to localStorage for persistence
      try {
        localStorage.setItem(TEMPLATE_STORAGE_KEY, templateParam);
      } catch (e) {}
      return templateParam;
    }
    // Then check localStorage for user preference
    try {
      const stored = localStorage.getItem(TEMPLATE_STORAGE_KEY);
      if (stored === "staff" || stored === "public") {
        return stored;
      }
    } catch (e) {}
    return "staff"; // Default to staff view
  };

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [additionalComments, setAdditionalComments] = useState("");
  const [fontSize, setFontSize] = useState<"small" | "medium" | "large" | "xlarge">("medium");
  const [cardTemplate, setCardTemplate] = useState<CardTemplate>(getInitialTemplate);
  const [showIPadPrintHelp, setShowIPadPrintHelp] = useState(false);
  
  // Detect iOS/iPad
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  
  // Update URL to match template state on mount (for localStorage-based selection)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const templateParam = urlParams.get("template");
    
    // If URL doesn't have the template param but we loaded from localStorage, update URL
    if (!templateParam && cardTemplate !== "staff") {
      const newPath = `${basePath}/dashboard/animals/${animalId}/kennel-card?template=${cardTemplate}`;
      window.history.replaceState(null, "", newPath);
    }
  }, [basePath, animalId, cardTemplate]);
  
  // Update URL and localStorage when template changes
  const handleTemplateChange = useCallback((value: CardTemplate) => {
    setCardTemplate(value);
    // Update URL with the new template param
    const newPath = `${basePath}/dashboard/animals/${animalId}/kennel-card?template=${value}`;
    window.history.replaceState(null, "", newPath);
    // Save preference to localStorage
    try {
      localStorage.setItem(TEMPLATE_STORAGE_KEY, value);
    } catch (e) {
      // localStorage not available
    }
  }, [basePath, animalId]);
  
  // QR Code states
  const [publicQrCode, setPublicQrCode] = useState<string | null>(null);
  const [staffQrCode, setStaffQrCode] = useState<string | null>(null);
  
  // Barcode ref
  const barcodeRef = useRef<SVGSVGElement>(null);

  const { data: animalData, isLoading: isLoadingAnimal, error: animalError } = useQuery<{ animal: any }>({
    queryKey: [`/api/animals/${animalId}`],
    enabled: !!animalId && !!tenantId,
  });

  const { data: prescriptionsData } = useQuery<{ prescriptions: any[] }>({
    queryKey: [`/api/animals/${animalId}/medical/prescriptions`],
    enabled: !!animalId && !!tenantId && !!user,
  });

  const { data: medicalFundData } = useQuery<MedicalFundStatus>({
    queryKey: [`/api/animals/${animalId}/medical-fund`],
    enabled: !!animalId && !!tenantId,
  });
  
  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant'],
    enabled: !!tenantId,
  });

  const animal = animalData?.animal;
  const medicalFund = medicalFundData;
  const prescriptions = prescriptionsData?.prescriptions || [];
  const activeMedications = prescriptions.filter(
    (p: any) => !p.endDate || new Date(p.endDate) >= new Date()
  );
  const tenant = tenantData?.tenant;

  // Generate QR codes when animal data is loaded
  useEffect(() => {
    if (animal?.id) {
      // Public QR: Links to public animals page with highlight query param
      // Using animal.animalId (human-readable ID like "A12345") for the highlight
      const publicUrl = `${window.location.origin}${basePath}/animals?highlight=${encodeURIComponent(animal.animalId || animal.id)}`;
      QRCode.toDataURL(publicUrl, { width: 150, margin: 1 })
        .then(setPublicQrCode)
        .catch(console.error);
      
      // Staff QR: Links to edit animal page using UUID
      const staffUrl = `${window.location.origin}${basePath}/dashboard/animals?edit=${animal.id}`;
      QRCode.toDataURL(staffUrl, { width: 150, margin: 1 })
        .then(setStaffQrCode)
        .catch(console.error);
    }
  }, [animal?.id, animal?.animalId, basePath]);

  // Generate barcode for microchip number (runs when staff template is selected)
  useEffect(() => {
    // Small delay to ensure the SVG element is mounted in the DOM
    const timeoutId = setTimeout(() => {
      if (barcodeRef.current && animal?.microchipNumber && cardTemplate === "staff") {
        try {
          JsBarcode(barcodeRef.current, animal.microchipNumber, {
            format: "CODE128",
            width: 1.5,
            height: 40,
            displayValue: true,
            fontSize: 12,
            margin: 5,
          });
        } catch (e) {
          console.error("Failed to generate barcode:", e);
        }
      }
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [animal?.microchipNumber, cardTemplate]);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @media print {
        .no-print {
          display: none !important;
        }
        
        html, body {
          height: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
          background: white !important;
        }
        
        @page {
          size: letter portrait;
          margin: 0;
        }
        
        /* Main container fills page height */
        .kennel-card-container {
          width: 100% !important;
          max-width: 100% !important;
          height: 100% !important;
          overflow: visible !important;
          padding: 5mm !important;
          margin: 0 !important;
          box-sizing: border-box !important;
        }
        
        /* The print page wrapper fills available height */
        .print-page-wrapper {
          display: flex !important;
          flex-direction: column !important;
          height: 100% !important;
          max-height: 100% !important;
          overflow: hidden !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          page-break-after: avoid !important;
          break-after: avoid !important;
        }
        
        /* Force the Card element to fill the page height */
        .kennel-card-print-wrapper {
          display: flex !important;
          flex-direction: column !important;
          height: 100% !important;
          max-height: 100% !important;
          flex: 1 !important;
          overflow: hidden !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          page-break-after: avoid !important;
          break-after: avoid !important;
        }
        
        /* CardContent fills remaining space */
        .kennel-card-content {
          padding: 0.5rem !important;
          flex: 1 !important;
          display: flex !important;
          flex-direction: column !important;
        }
        
        .kennel-card-content > * {
          margin-bottom: 0.35rem !important;
        }
        
        .kennel-card-content .space-y-4 > * {
          margin-top: 0.35rem !important;
          margin-bottom: 0.35rem !important;
        }
        
        /* Animal Info section expands to fill remaining space */
        .animal-info-section {
          flex: 1 !important;
          display: flex !important;
          flex-direction: column !important;
        }
        
        .animal-info-section > div {
          flex: 1 !important;
          display: flex !important;
          flex-direction: column !important;
        }
        
        /* Logistics grid expands and uses more vertical space */
        .animal-info-section .grid {
          flex: 1 !important;
          align-content: space-between !important;
          gap: 1rem 0.5rem !important;
        }
        
        /* Animal photo in print - fixed size to match kennel container */
        .kennel-card-content img {
          width: 120px !important;
          height: 120px !important;
          object-fit: cover !important;
        }
        
        .kennel-card-content * {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
        
        /* Reduce card padding inside nested cards */
        .kennel-card-content .p-4 {
          padding: 0.35rem !important;
        }
        
        .kennel-card-content .p-6 {
          padding: 0.5rem !important;
        }
        
        /* Preserve horizontal gaps, allow vertical expansion */
        .kennel-card-content .gap-4 {
          gap: 0.5rem !important;
        }
        
        .kennel-card-content .gap-3 {
          gap: 0.35rem !important;
        }
        
        /* Smaller text for print */
        .kennel-card-content h1 {
          font-size: 1.5rem !important;
          line-height: 1.1 !important;
        }
        
        .kennel-card-content h2 {
          font-size: 0.8rem !important;
          line-height: 1.1 !important;
        }
        
        .kennel-card-content h3 {
          font-size: 0.9rem !important;
          line-height: 1.1 !important;
        }
        
        /* Base text sizing */
        .kennel-card-content p,
        .kennel-card-content span {
          font-size: 0.85rem !important;
          line-height: 1.3 !important;
        }
        
        /* Larger text for logistics grid data values */
        .animal-info-section .grid p.font-semibold {
          font-size: 1.1rem !important;
          line-height: 1.4 !important;
        }
        
        /* Keep labels smaller */
        .animal-info-section .grid p.text-muted-foreground {
          font-size: 0.75rem !important;
        }
        
        /* Compact safety banner */
        .kennel-card-content .text-2xl {
          font-size: 1rem !important;
        }
        
        /* Safety banner colors */
        .safety-banner-green { background-color: #22c55e !important; color: white !important; }
        .safety-banner-yellow { background-color: #eab308 !important; color: black !important; }
        .safety-banner-red { background-color: #ef4444 !important; color: white !important; }
        .safety-banner-purple { background-color: #a855f7 !important; color: white !important; }
        
        /* Ensure card backgrounds print */
        .bg-primary\\/5 { background-color: rgba(var(--primary), 0.05) !important; }
        .bg-destructive { background-color: hsl(var(--destructive)) !important; }
        .bg-muted { background-color: hsl(var(--muted)) !important; }
        
        /* Ensure borders print */
        .border-primary { border-color: hsl(var(--primary)) !important; }
        .border-destructive { border-color: hsl(var(--destructive)) !important; }
        .border-orange-500 { border-color: #f97316 !important; }
        
        /* Kennel location text for print - sized to fit within 120px container height */
        .kennel-card-content .kennel-location-text,
        .kennel-location-text {
          font-size: 36pt !important;
          font-weight: 900 !important;
          line-height: 1 !important;
          color: black !important;
        }
        
        /* Kennel location container styling for print - higher specificity */
        /* Match height with animal photo (120px in print) */
        .kennel-card-content .kennel-location-container,
        .kennel-location-container {
          height: 120px !important;
          padding: 0 32px !important;
          border-width: 6px !important;
          border-color: black !important;
          border-style: solid !important;
          border-radius: 12px !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: center !important;
        }
        
        /* Kennel label text for print - higher specificity to override .kennel-card-content p */
        .kennel-card-content .kennel-label-text,
        .kennel-label-text {
          font-size: 18pt !important;
          font-weight: 600 !important;
          color: #666 !important;
        }
        
        /* Compact safety banner for single-page print */
        .safety-banner-green,
        .safety-banner-yellow,
        .safety-banner-red,
        .safety-banner-purple {
          padding: 4px 8px !important;
        }
        
        .safety-banner-green p,
        .safety-banner-yellow p,
        .safety-banner-red p,
        .safety-banner-purple p {
          font-size: 0.9rem !important;
          margin: 0 !important;
          line-height: 1.2 !important;
        }
        
        /* Compact animal info section for print */
        .animal-info-section {
          padding: 0 !important;
        }
        
        .animal-info-section > div {
          padding: 0.25rem !important;
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const handlePrint = () => {
    if (isIOS) {
      // On iOS/iPad, show the help modal instead of trying unreliable print methods
      setShowIPadPrintHelp(true);
    } else {
      // Standard print for desktop browsers
      window.print();
    }
  };
  
  // Attempt native print on iOS (may work in some cases)
  const attemptIOSPrint = () => {
    try {
      // Try window.print() - may work on some iOS versions
      window.print();
    } catch (e) {
      // Silent fail - the help modal is already showing
    }
  };

  const handleClose = () => {
    window.close();
    setTimeout(() => {
      if (!window.closed) {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.location.href = `${basePath}/dashboard/animals`;
        }
      }
    }, 100);
  };

  const getFrequencyDisplay = (frequency: string) => {
    const map: Record<string, string> = {
      'SID': 'Once daily',
      'BID': 'Twice daily',
      'TID': 'Three times daily',
      'QID': 'Four times daily',
      'HS': 'At bedtime',
      'EOD': 'Every other day',
      'WEEKLY': 'Weekly',
      'MONTHLY': 'Monthly',
      'Q3M': 'Every 3 months',
      'Q6M': 'Every 6 months',
      'Q8M': 'Every 8 months',
      'ANNUALLY': 'Annually',
      'ONCE': 'One time',
      'PRN': 'As needed',
    };
    return map[frequency] || frequency;
  };

  const getFontSizeClass = () => {
    const fontSizeMap = {
      small: "text-xs",
      medium: "text-base",
      large: "text-lg",
      xlarge: "text-xl"
    };
    return fontSizeMap[fontSize];
  };

  const getHeadingSizeClass = () => {
    const headingSizeMap = {
      small: "text-2xl",
      medium: "text-4xl",
      large: "text-5xl",
      xlarge: "text-6xl"
    };
    return headingSizeMap[fontSize];
  };

  const getIntakeSourceDisplay = (source: string | null | undefined) => {
    const map: Record<string, string> = {
      'stray': 'Stray',
      'owner_surrender': 'Owner Surrender',
      'transfer': 'Transfer',
      'born_in_care': 'Born in Care',
      'other': 'Other',
    };
    return source ? map[source] || source : 'Unknown';
  };

  const getActivityLevelDisplay = (level: string | null | undefined) => {
    const map: Record<string, { label: string; icon: typeof Zap }> = {
      'low': { label: 'Low', icon: Activity },
      'moderate': { label: 'Moderate', icon: Activity },
      'high': { label: 'High Energy', icon: Zap },
    };
    return level ? map[level] || { label: level, icon: Activity } : { label: 'Unknown', icon: Activity };
  };

  const getSafetyBannerConfig = (color: string | null | undefined) => {
    const configs: Record<string, { bg: string; text: string; label: string; className: string }> = {
      green: { bg: 'bg-green-500', text: 'text-white', label: 'SAFE FOR ALL HANDLERS', className: 'safety-banner-green' },
      yellow: { bg: 'bg-yellow-500', text: 'text-black', label: 'CAUTION - TRAINED VOLUNTEERS ONLY', className: 'safety-banner-yellow' },
      red: { bg: 'bg-red-500', text: 'text-white', label: 'STAFF ONLY - DANGER', className: 'safety-banner-red' },
      purple: { bg: 'bg-purple-500', text: 'text-white', label: 'MEDICAL ISOLATION', className: 'safety-banner-purple' },
    };
    return configs[color || 'yellow'] || configs.yellow;
  };

  if (!tenantId) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="text-lg">Initializing...</p>
      </div>
    );
  }

  if (isLoadingAnimal) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="text-lg">Loading kennel card...</p>
      </div>
    );
  }

  if (animalError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 p-4">
        <AlertTriangle className="w-16 h-16 text-destructive" />
        <p className="text-lg font-semibold">Failed to load kennel card</p>
        <Button variant="outline" onClick={handleClose} data-testid="button-close-error">
          Close Window
        </Button>
      </div>
    );
  }

  if (!animal) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 p-4">
        <AlertTriangle className="w-16 h-16 text-orange-500" />
        <p className="text-lg font-semibold">Animal not found</p>
        <Button variant="outline" onClick={handleClose} data-testid="button-close-not-found">
          Close Window
        </Button>
      </div>
    );
  }

  const safetyConfig = getSafetyBannerConfig(animal.behaviorColor);
  const activityInfo = getActivityLevelDisplay(animal.activityLevel);

  // ==================== PUBLIC VIEW TEMPLATE ====================
  const PublicViewCard = () => (
    <Card className="border-4 border-primary overflow-hidden kennel-card-print-wrapper">
      <CardContent className="p-0 kennel-card-content">
        {/* Header: Name/ID (Left) and Photo (Right) */}
        <div className="flex items-start gap-4 p-6 pb-4">
          {/* Left: Name and ID */}
          <div className="flex-1">
            <h1 className={`${getHeadingSizeClass()} font-bold mb-1`} data-testid="text-kennel-card-name">
              {animal.name}
            </h1>
            <h3 className={`${fontSize === 'small' ? 'text-lg' : fontSize === 'medium' ? 'text-xl' : fontSize === 'large' ? 'text-2xl' : 'text-3xl'} text-muted-foreground font-medium`}>
              ID: {animal.animalId}
            </h3>
          </div>
          
          {/* Right: Photo */}
          {animal.photoUrls && animal.photoUrls.length > 0 && (
            <div className="flex-shrink-0">
              <img
                src={animal.photoUrls[0]}
                alt={animal.name}
                className="w-48 h-48 object-cover rounded-lg border-2 border-border"
                data-testid="img-kennel-card-photo"
              />
            </div>
          )}
        </div>

        {/* Center: Details Table */}
        <div className="px-6 pb-4">
          <table className={`w-full border-collapse ${getFontSizeClass()}`}>
            <tbody>
              <tr className="border-b border-border">
                <td className="py-2 font-medium text-muted-foreground w-1/3">Breed</td>
                <td className="py-2 font-semibold">{animal.breed || 'Unknown'}</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 font-medium text-muted-foreground">Gender</td>
                <td className="py-2 font-semibold">{animal.petfinderGender || 'Unknown'}</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 font-medium text-muted-foreground">Age</td>
                <td className="py-2 font-semibold">{animal.age || animal.petfinderAge || 'Unknown'}</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 font-medium text-muted-foreground">Weight</td>
                <td className="py-2 font-semibold">{animal.weight || 'Unknown'}</td>
              </tr>
              <tr>
                <td className="py-2 font-medium text-muted-foreground">Spay/Neuter</td>
                <td className="py-2 font-semibold capitalize">
                  {animal.neuterStatus === 'spayed' || animal.neuterStatus === 'neutered' 
                    ? 'Yes' 
                    : animal.neuterStatus === 'intact' 
                      ? 'No' 
                      : 'Unknown'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Bottom Section: Good With / Activity (Left) and QR Code (Right) */}
        <div className="flex items-end gap-4 px-6 pb-4">
          {/* Left: Good With Icons and Activity Level */}
          <div className="flex-1 space-y-3">
            {/* Good With Icons */}
            <div className="flex flex-wrap gap-3">
              {/* Kids */}
              <div className="flex items-center gap-2 border rounded-lg px-3 py-2" data-testid="indicator-child-friendly">
                <Baby className="w-5 h-5 text-muted-foreground" />
                <span className={`${fontSize === 'small' ? 'text-xs' : 'text-sm'} font-medium`}>Kids</span>
                {animal.childFriendly === true && (
                  <Check className="w-4 h-4 text-green-600" />
                )}
                {animal.childFriendly === false && (
                  <XIcon className="w-4 h-4 text-red-600" />
                )}
                {animal.childFriendly === null && (
                  <span className="text-xs text-muted-foreground">?</span>
                )}
              </div>
              
              {/* Cats */}
              <div className="flex items-center gap-2 border rounded-lg px-3 py-2" data-testid="indicator-cat-friendly">
                <Cat className="w-5 h-5 text-muted-foreground" />
                <span className={`${fontSize === 'small' ? 'text-xs' : 'text-sm'} font-medium`}>Cats</span>
                {animal.catFriendly === true && (
                  <Check className="w-4 h-4 text-green-600" />
                )}
                {animal.catFriendly === false && (
                  <XIcon className="w-4 h-4 text-red-600" />
                )}
                {animal.catFriendly === null && (
                  <span className="text-xs text-muted-foreground">?</span>
                )}
              </div>
              
              {/* Dogs */}
              <div className="flex items-center gap-2 border rounded-lg px-3 py-2" data-testid="indicator-dog-friendly">
                <Dog className="w-5 h-5 text-muted-foreground" />
                <span className={`${fontSize === 'small' ? 'text-xs' : 'text-sm'} font-medium`}>Dogs</span>
                {animal.dogFriendly === true && (
                  <Check className="w-4 h-4 text-green-600" />
                )}
                {animal.dogFriendly === false && (
                  <XIcon className="w-4 h-4 text-red-600" />
                )}
                {animal.dogFriendly === null && (
                  <span className="text-xs text-muted-foreground">?</span>
                )}
              </div>
            </div>
            
            {/* Activity Level */}
            <div className="flex items-center gap-2">
              <activityInfo.icon className="w-5 h-5 text-primary" />
              <span className={`${getFontSizeClass()} font-medium`}>Activity: {activityInfo.label}</span>
            </div>
          </div>
          
          {/* Right: QR Code */}
          {publicQrCode && (
            <div className="flex-shrink-0 flex flex-col items-center">
              <img
                src={publicQrCode}
                alt="Scan to learn more"
                className="w-28 h-28 border rounded-lg"
                data-testid="img-public-qr-code"
              />
              <p className="text-xs text-muted-foreground mt-1 text-center">Scan to adopt</p>
            </div>
          )}
        </div>

        {/* Footer: Powered by iRescue.life and Org Name */}
        <div className="bg-muted px-6 py-3 flex items-center justify-between border-t">
          <p className={`${fontSize === 'small' ? 'text-xs' : 'text-sm'} text-muted-foreground`}>
            Powered by <span className="font-semibold text-primary">iRescue.life</span>
          </p>
          <p className={`${fontSize === 'small' ? 'text-xs' : 'text-sm'} font-medium`}>
            {tenant?.name || 'Animal Rescue Organization'}
          </p>
        </div>
      </CardContent>
    </Card>
  );

  // ==================== STAFF/INTERNAL VIEW TEMPLATE ====================
  const StaffViewCard = () => (
    <Card className="border-4 border-primary overflow-hidden kennel-card-print-wrapper h-full flex flex-col">
      {/* Safety Banner - Full Width at Top */}
      <div className={`${safetyConfig.bg} ${safetyConfig.text} ${safetyConfig.className} py-3 px-6 text-center`}>
        <p className={`font-bold ${fontSize === 'small' ? 'text-lg' : fontSize === 'medium' ? 'text-xl' : fontSize === 'large' ? 'text-2xl' : 'text-3xl'}`}>
          {safetyConfig.label}
        </p>
        {animal.behaviorRestrictionReason && (animal.behaviorColor === 'yellow' || animal.behaviorColor === 'red') && (
          <p className={`${fontSize === 'small' ? 'text-sm' : 'text-base'} mt-1 opacity-90`}>
            {animal.behaviorRestrictionReason}
          </p>
        )}
      </div>
      
      <CardContent className="p-6 space-y-4 kennel-card-content flex-1 flex flex-col">
        {/* Header: Name/ID (Left) and QR Code/Barcode/Print Date (Right) */}
        <div className="flex items-start justify-between gap-4 pb-2">
          <div>
            <h1 className={`${getHeadingSizeClass()} font-bold mb-1`} data-testid="text-kennel-card-name">
              {animal.name}
            </h1>
            <h3 className={`${fontSize === 'small' ? 'text-xl' : fontSize === 'medium' ? 'text-2xl' : fontSize === 'large' ? 'text-3xl' : 'text-4xl'} text-primary font-bold`}>
              {animal.animalId}
            </h3>
          </div>
          
          {/* Right side: Barcode, QR Code and Print Date */}
          <div className="flex-shrink-0 flex flex-col items-end gap-2">
            <div className="flex items-center gap-3">
              {/* Barcode for Microchip */}
              {animal.microchipNumber && (
                <div className="flex-shrink-0 bg-white p-1 rounded border">
                  <svg ref={barcodeRef} data-testid="barcode-microchip"></svg>
                </div>
              )}
              {staffQrCode && (
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className={`${fontSize === 'small' ? 'text-xs' : 'text-sm'} font-medium`}>Staff Portal</p>
                    <p className="text-xs text-muted-foreground">Scan to edit</p>
                  </div>
                  <img
                    src={staffQrCode}
                    alt="Scan to edit animal"
                    className="w-16 h-16 border rounded"
                    data-testid="img-staff-qr-code"
                  />
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Printed: {format(new Date(), 'MMM d, yyyy h:mm a')}
            </p>
          </div>
        </div>

        {/* Kennel Location and Photo Row */}
        <div className="flex flex-wrap gap-4 items-start justify-center">
          {/* Kennel Location */}
          {animal.kennelRowName && animal.kennelPosition !== null && animal.kennelPosition !== undefined && (
            <div className="kennel-location-container flex-shrink-0 flex flex-col items-center justify-center border-4 border-primary rounded-lg px-6 bg-primary/5 h-40">
              <p className={`kennel-label-text ${fontSize === 'small' ? 'text-sm' : 'text-base'} font-medium text-muted-foreground mb-1`}>Kennel</p>
              <p className={`kennel-location-text ${fontSize === 'small' ? 'text-4xl' : fontSize === 'medium' ? 'text-5xl' : 'text-6xl'} font-extrabold text-primary`} data-testid="text-kennel-location">
                {animal.kennelRowName} - #{animal.kennelPosition + 1}
              </p>
            </div>
          )}

          {/* Photo */}
          {animal.photoUrls && animal.photoUrls.length > 0 && (
            <div className="flex-1 flex justify-center min-w-[12rem]">
              <img
                src={animal.photoUrls[0]}
                alt={animal.name}
                className="w-40 h-40 object-cover rounded-lg border-2 border-border"
                data-testid="img-kennel-card-photo"
              />
            </div>
          )}
        </div>

        {/* Medical Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Medications */}
          <Card className="border-2 border-primary">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Pill className="w-5 h-5 text-primary" />
                <h2 className={`${fontSize === 'small' ? 'text-lg' : 'text-xl'} font-bold`}>Medications</h2>
              </div>
              {activeMedications.length > 0 ? (
                <div className="space-y-2">
                  {activeMedications.map((rx: any) => (
                    <div key={rx.id} className="border-l-4 border-primary pl-2 py-1" data-testid={`medication-${rx.id}`}>
                      <p className={`font-semibold ${fontSize === 'small' ? 'text-sm' : 'text-base'}`}>{rx.medicationName}</p>
                      <p className={`${fontSize === 'small' ? 'text-xs' : 'text-sm'} text-primary`}>
                        {rx.dosage} - {getFrequencyDisplay(rx.frequency)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={`${getFontSizeClass()} text-muted-foreground italic`}>No active medications</p>
              )}
            </CardContent>
          </Card>

          {/* Dietary Restrictions */}
          <Card className="border-2 border-orange-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Utensils className="w-5 h-5 text-orange-500" />
                <h2 className={`${fontSize === 'small' ? 'text-lg' : 'text-xl'} font-bold`}>Dietary Restrictions</h2>
              </div>
              {animal.dietaryRestrictions ? (
                <p className={`${getFontSizeClass()} font-medium`}>{animal.dietaryRestrictions}</p>
              ) : (
                <p className={`${getFontSizeClass()} text-muted-foreground italic`}>No dietary restrictions</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Medical Alert */}
        {animal.medicalAlertMemo && (
          <Card className="bg-destructive border-destructive border-4">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-destructive-foreground flex-shrink-0 mt-1" />
                <div>
                  <p className={`font-bold ${fontSize === 'small' ? 'text-lg' : 'text-xl'} text-destructive-foreground mb-1`}>
                    MEDICAL ALERT
                  </p>
                  <p className={`${getFontSizeClass()} text-destructive-foreground font-semibold`}>
                    {animal.medicalAlertMemo}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Good With Icons and Logistics Section - Expands to fill remaining space */}
        <div className="animal-info-section flex-grow flex flex-col">
          <div className="p-4 flex-grow flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-5 h-5 text-muted-foreground" />
              <h2 className={`${fontSize === 'small' ? 'text-lg' : 'text-xl'} font-bold`}>Animal Info</h2>
            </div>
            
            {/* Good With Icons Row */}
            <div className="flex flex-wrap gap-2 mb-4">
              {/* Kids */}
              <div className="flex items-center gap-1 border rounded-md px-2 py-1" data-testid="staff-indicator-child-friendly">
                <Baby className="w-4 h-4 text-muted-foreground" />
                <span className={`${fontSize === 'small' ? 'text-xs' : 'text-sm'} font-medium`}>Kids</span>
                {animal.childFriendly === true && <Check className="w-3 h-3 text-green-600" />}
                {animal.childFriendly === false && <XIcon className="w-3 h-3 text-red-600" />}
                {animal.childFriendly == null && <span className="text-xs text-muted-foreground">?</span>}
              </div>
              
              {/* Cats */}
              <div className="flex items-center gap-1 border rounded-md px-2 py-1" data-testid="staff-indicator-cat-friendly">
                <Cat className="w-4 h-4 text-muted-foreground" />
                <span className={`${fontSize === 'small' ? 'text-xs' : 'text-sm'} font-medium`}>Cats</span>
                {animal.catFriendly === true && <Check className="w-3 h-3 text-green-600" />}
                {animal.catFriendly === false && <XIcon className="w-3 h-3 text-red-600" />}
                {animal.catFriendly == null && <span className="text-xs text-muted-foreground">?</span>}
              </div>
              
              {/* Dogs */}
              <div className="flex items-center gap-1 border rounded-md px-2 py-1" data-testid="staff-indicator-dog-friendly">
                <Dog className="w-4 h-4 text-muted-foreground" />
                <span className={`${fontSize === 'small' ? 'text-xs' : 'text-sm'} font-medium`}>Dogs</span>
                {animal.dogFriendly === true && <Check className="w-3 h-3 text-green-600" />}
                {animal.dogFriendly === false && <XIcon className="w-3 h-3 text-red-600" />}
                {animal.dogFriendly == null && <span className="text-xs text-muted-foreground">?</span>}
              </div>

              {/* Heartworm Status */}
              <div className="flex items-center gap-1 border rounded-md px-2 py-1" data-testid="staff-indicator-heartworm">
                <Heart className="w-4 h-4 text-muted-foreground" />
                <span className={`${fontSize === 'small' ? 'text-xs' : 'text-sm'} font-medium`}>HW</span>
                {animal.heartwormPositive === true && <span className="text-xs font-bold text-red-600">+</span>}
                {animal.heartwormPositive === false && <span className="text-xs font-bold text-green-600">-</span>}
                {animal.heartwormPositive == null && <span className="text-xs text-muted-foreground">?</span>}
              </div>

              {/* Spay/Neuter Status */}
              <div className="flex items-center gap-1 border rounded-md px-2 py-1" data-testid="staff-indicator-altered">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <span className={`${fontSize === 'small' ? 'text-xs' : 'text-sm'} font-medium`}>
                  {animal.neuterStatus === 'spayed' ? 'Spayed' : 
                   animal.neuterStatus === 'neutered' ? 'Neutered' : 
                   animal.neuterStatus === 'intact' ? 'Intact' : 'Unknown'}
                </span>
                {(animal.neuterStatus === 'spayed' || animal.neuterStatus === 'neutered') && <Check className="w-3 h-3 text-green-600" />}
                {animal.neuterStatus === 'intact' && <XIcon className="w-3 h-3 text-orange-500" />}
              </div>
            </div>

            {/* Logistics Grid - Expanded spacing for better readability */}
            <div className={`grid grid-cols-2 gap-x-4 gap-y-6 ${getFontSizeClass()} flex-grow`}>
              <div>
                <p className="text-muted-foreground text-sm">Intake Date</p>
                <p className="font-semibold text-lg">{animal.intakeDate ? format(new Date(animal.intakeDate), 'MMM d, yyyy') : 'Unknown'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Intake Source</p>
                <p className="font-semibold text-lg">{getIntakeSourceDisplay(animal.intakeSource)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Weight</p>
                <p className="font-semibold text-lg">{animal.weight || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Activity Level</p>
                <p className="font-semibold text-lg">{activityInfo.label}</p>
              </div>
              {/* Stray-specific fields */}
              {(animal.intakeSource === 'stray' || animal.status === 'stray_hold') && (
                <>
                  <div>
                    <p className="text-muted-foreground text-sm">Location Found</p>
                    <p className="font-semibold text-lg" data-testid="text-location-found">
                      {animal.locationFound || 'Not recorded'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-sm">Stray Hold Until</p>
                    <p className={`font-semibold text-lg ${animal.strayHoldUntil && new Date(animal.strayHoldUntil) > new Date() ? 'text-orange-600' : ''}`} data-testid="text-stray-hold-until">
                      {animal.strayHoldUntil ? format(new Date(animal.strayHoldUntil), 'MMM d, yyyy') : 'Not set'}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Additional Comments */}
        {additionalComments && (
          <Card className="border-2 border-primary bg-primary/5">
            <CardContent className="p-4">
              <h3 className={`font-bold ${fontSize === 'small' ? 'text-base' : 'text-lg'} mb-2`}>Staff Notes</h3>
              <p className={`${getFontSizeClass()} whitespace-pre-wrap`} data-testid="text-additional-comments">
                {additionalComments}
              </p>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background p-4">
      {/* Action Buttons */}
      <div className="no-print fixed top-2 right-4 flex gap-2 z-50">
        <Button 
          onClick={() => setIsEditMode(!isEditMode)}
          variant={isEditMode ? "default" : "outline"}
          data-testid="button-toggle-edit"
          className="touch-manipulation"
        >
          {isEditMode ? (
            <>
              <Eye className="w-4 h-4 mr-2" />
              Done
            </>
          ) : (
            <>
              <Edit className="w-4 h-4 mr-2" />
              Options
            </>
          )}
        </Button>
        <Button 
          onClick={handlePrint} 
          data-testid="button-print-kennel-card"
          className="touch-manipulation"
        >
          <Printer className="w-4 h-4 mr-2" />
          Print
        </Button>
        <Button 
          variant="outline" 
          onClick={handleClose} 
          data-testid="button-close-kennel-card"
          className="touch-manipulation"
        >
          <X className="w-4 h-4 mr-2" />
          Close
        </Button>
      </div>

      <div className="max-w-2xl mx-auto space-y-4 kennel-card-container pt-12">
        {/* Card View Toggle - Always visible above card */}
        <div className="no-print flex items-center justify-center gap-2">
          <Button
            variant={cardTemplate === 'staff' ? 'default' : 'outline'}
            onClick={() => handleTemplateChange('staff')}
            data-testid="button-staff-view"
            className="touch-manipulation"
          >
            <User className="w-4 h-4 mr-2" />
            Staff View
          </Button>
          <Button
            variant={cardTemplate === 'public' ? 'default' : 'outline'}
            onClick={() => handleTemplateChange('public')}
            data-testid="button-public-view"
            className="touch-manipulation"
          >
            <Eye className="w-4 h-4 mr-2" />
            Public View
          </Button>
        </div>
        
        {/* View description */}
        <p className="no-print text-center text-sm text-muted-foreground">
          {cardTemplate === 'staff' 
            ? 'Staff card includes medications, dietary restrictions, and internal notes' 
            : 'Public card shows adoption info with QR code for potential adopters'}
        </p>

        {/* Edit Panel - Font size and notes only */}
        {isEditMode && (
          <Card className="no-print border-2 border-primary">
            <CardContent className="p-6 space-y-6">
              <h2 className="text-2xl font-bold">Card Options</h2>
              
              {/* Font Size Selection */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">
                  Font Size
                </Label>
                <RadioGroup 
                  value={fontSize} 
                  onValueChange={(value) => setFontSize(value as typeof fontSize)}
                  data-testid="radio-group-font-size"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="small" id="small" data-testid="radio-font-small" />
                    <Label htmlFor="small" className="cursor-pointer">Small</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="medium" id="medium" data-testid="radio-font-medium" />
                    <Label htmlFor="medium" className="cursor-pointer">Medium (Default)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="large" id="large" data-testid="radio-font-large" />
                    <Label htmlFor="large" className="cursor-pointer">Large</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="xlarge" id="xlarge" data-testid="radio-font-xlarge" />
                    <Label htmlFor="xlarge" className="cursor-pointer">Extra Large</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Additional Comments (Staff template only) */}
              {cardTemplate === 'staff' && (
                <div className="space-y-3">
                  <Label htmlFor="additional-comments" className="text-base font-semibold">
                    Staff Notes (Optional)
                  </Label>
                  <Textarea
                    id="additional-comments"
                    placeholder="Add special feeding instructions, behavioral notes, or other important information..."
                    value={additionalComments}
                    onChange={(e) => setAdditionalComments(e.target.value)}
                    rows={4}
                    className="resize-none"
                    data-testid="textarea-additional-comments"
                  />
                  <p className="text-sm text-muted-foreground">
                    These notes will appear on the printed staff kennel card
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Render Selected Template - wrapped for print page control */}
        <div className="print-page-wrapper">
          {cardTemplate === 'public' ? <PublicViewCard /> : <StaffViewCard />}
        </div>
      </div>
      
      {/* iPad/iOS Print Help Modal */}
      <Dialog open={showIPadPrintHelp} onOpenChange={setShowIPadPrintHelp}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5" />
              Print on iPad/iPhone
            </DialogTitle>
            <DialogDescription>
              iOS requires using Safari's built-in Share menu to print.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                  1
                </div>
                <div>
                  <p className="font-medium">Tap the Share button</p>
                  <p className="text-sm text-muted-foreground">
                    Look for the <Share className="inline w-4 h-4 mx-1" /> icon in Safari's toolbar (box with arrow pointing up)
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                  2
                </div>
                <div>
                  <p className="font-medium">Scroll down and tap "Print"</p>
                  <p className="text-sm text-muted-foreground">
                    The Print option is in the share menu actions list
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                  3
                </div>
                <div>
                  <p className="font-medium">Select your printer</p>
                  <p className="text-sm text-muted-foreground">
                    Choose your AirPrint-enabled printer and tap Print
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Tip:</strong> Make sure you're using Safari. Chrome and other browsers on iOS don't support printing.
              </p>
            </div>
          </div>
          
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button 
              variant="outline" 
              onClick={attemptIOSPrint}
              className="w-full sm:w-auto"
              data-testid="button-try-print"
            >
              Try Print Anyway
            </Button>
            <Button 
              onClick={() => setShowIPadPrintHelp(false)}
              className="w-full sm:w-auto"
              data-testid="button-got-it"
            >
              Got It
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
