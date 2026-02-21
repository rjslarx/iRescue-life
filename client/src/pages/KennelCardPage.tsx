import { useParams, useSearch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Printer, X, AlertTriangle, Pill, Edit, Eye, Cat, Dog, Check, XIcon, Heart, Baby, Zap, Activity, Calendar, Truck, Scale, Utensils, User, Share, Info } from "lucide-react";
import { format } from "date-fns";
import { useEffect, useState, useCallback } from "react";
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

  // Callback ref for barcode SVG — generates barcode immediately when element mounts
  // Using cardTemplate in deps ensures a new ref callback when switching templates,
  // paired with a key on the SVG to force remount on template change
  const barcodeCallbackRef = useCallback((node: SVGSVGElement | null) => {
    if (node && animal?.microchipNumber && cardTemplate === "staff") {
      try {
        JsBarcode(node, animal.microchipNumber, {
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
  }, [animal?.microchipNumber, cardTemplate]);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @media print {
        .no-print { display: none !important; }
        
        html, body {
          height: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          print-color-adjust: exact !important;
          -webkit-print-color-adjust: exact !important;
          background: white !important;
        }
        
        @page {
          size: letter portrait;
          margin: 0.25in;
        }

        /* Full-page flex layout to prevent overflow */
        .kennel-card-container {
          width: 100% !important;
          max-width: 100% !important;
          height: 100% !important;
          max-height: 100% !important;
          overflow: hidden !important;
          padding: 0 !important;
          margin: 0 !important;
          box-sizing: border-box !important;
        }

        .print-page-wrapper {
          display: flex !important;
          flex-direction: column !important;
          height: 100% !important;
          max-height: 100% !important;
          overflow: hidden !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }

        .kennel-card-print-wrapper {
          display: flex !important;
          flex-direction: column !important;
          height: 100% !important;
          max-height: 100% !important;
          flex: 1 !important;
          overflow: hidden !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }

        /* Hero Section Print Overrides */
        .print-hero-section {
            display: flex !important;
            height: 220px !important;
            max-height: 220px !important;
            border: 2px solid black !important;
            border-radius: 8px !important;
            overflow: hidden !important;
            margin-bottom: 0.5rem !important;
        }

        .print-hero-left {
            background-color: white !important;
            color: #1e40af !important;
            flex: 1 !important;
            padding: 12px !important;
            -webkit-print-color-adjust: exact !important; 
        }
        
        .print-hero-left h1, 
        .print-hero-left h3, 
        .print-hero-left p, 
        .print-hero-left span {
            color: #1e40af !important;
        }

        .print-hero-left h1 {
            font-size: 1.5rem !important;
            line-height: 1.1 !important;
        }

        .print-hero-left h3 {
            font-size: 1rem !important;
        }

        .print-hero-right {
            width: 50% !important;
            position: relative !important;
        }

        .print-hero-image {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
        }

        .print-barcode-container {
            background: white !important;
            padding: 4px !important;
            border-radius: 4px !important;
        }

        /* Content area fills remaining space with tight spacing */
        .kennel-card-content {
          padding: 0.25rem !important;
          flex: 1 !important;
          min-height: 0 !important;
          display: flex !important;
          flex-direction: column !important;
          overflow: hidden !important;
          gap: 0.35rem !important;
        }

        .kennel-card-content > * {
          margin-bottom: 0 !important;
          margin-top: 0 !important;
        }

        /* Reduce nested card padding */
        .kennel-card-content .p-3 {
          padding: 0.25rem !important;
        }
        .kennel-card-content .p-4 {
          padding: 0.3rem !important;
        }

        /* Tighter gaps */
        .kennel-card-content .gap-4 {
          gap: 0.35rem !important;
        }
        .kennel-card-content .gap-3 {
          gap: 0.25rem !important;
        }

        /* Smaller text for print */
        .kennel-card-content h2 {
          font-size: 0.75rem !important;
          line-height: 1.1 !important;
        }

        .kennel-card-content p,
        .kennel-card-content span {
          font-size: 0.8rem !important;
          line-height: 1.2 !important;
        }

        /* Info section expands to fill remaining space */
        .animal-info-section {
          flex: 1 !important;
          min-height: 0 !important;
          padding: 0.25rem !important;
          overflow: hidden !important;
        }

        .animal-info-section .grid {
          gap: 0.35rem !important;
        }

        /* Prevent page breaks inside sections */
        .kennel-card-content * {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }

        /* Hero internal typography - cap kennel location text */
        .print-hero-left .text-5xl,
        .print-hero-left .text-4xl,
        .print-hero-left .text-3xl {
          font-size: 2rem !important;
          line-height: 1 !important;
        }

        .print-hero-left .text-2xl {
          font-size: 0.9rem !important;
        }

        .print-hero-left .text-sm {
          font-size: 0.65rem !important;
        }

        /* Safety badge for print - keep visible and readable */
        .safety-banner-green,
        .safety-banner-yellow,
        .safety-banner-red,
        .safety-banner-purple {
          padding: 6px 14px !important;
          border-radius: 6px !important;
        }

        .safety-banner-green span,
        .safety-banner-yellow span,
        .safety-banner-red span,
        .safety-banner-purple span {
          font-size: 0.8rem !important;
          line-height: 1.3 !important;
        }

        .safety-banner-green .text-xl,
        .safety-banner-yellow .text-xl,
        .safety-banner-red .text-xl,
        .safety-banner-purple .text-xl {
          font-size: 1rem !important;
          font-weight: 800 !important;
        }

        /* Medical alert compact for print */
        .border-l-8 {
          border-left-width: 6px !important;
          padding: 0.25rem 0.5rem !important;
        }

        .border-l-8 p {
          font-size: 0.8rem !important;
          line-height: 1.2 !important;
        }

        .border-l-8 .text-lg {
          font-size: 0.85rem !important;
        }

        /* Behavior badges compact */
        .animal-info-section .flex-wrap {
          gap: 0.25rem !important;
          margin-bottom: 0.35rem !important;
        }

        .animal-info-section .flex-wrap > div {
          padding: 2px 6px !important;
          font-size: 0.7rem !important;
        }

        /* Staff notes compact */
        .kennel-card-content .border-primary\\/20 {
          padding: 0.25rem 0.5rem !important;
        }

        /* Logistics grid 4-col for print */
        .animal-info-section .grid-cols-2 {
          grid-template-columns: repeat(4, 1fr) !important;
          gap: 0.25rem !important;
        }

        .animal-info-section .grid p.font-bold {
          font-size: 0.8rem !important;
          line-height: 1.3 !important;
        }

        .animal-info-section .grid .text-xs {
          font-size: 0.6rem !important;
        }
        
        .border-2 { border-width: 2px !important; }

        /* Safety banner colors */
        .safety-banner-green { background-color: #22c55e !important; color: white !important; }
        .safety-banner-yellow { background-color: #eab308 !important; color: black !important; }
        .safety-banner-red { background-color: #ef4444 !important; color: white !important; }
        .safety-banner-purple { background-color: #a855f7 !important; color: white !important; }

        /* Force medical section side-by-side in print */
        .print-medical-grid {
          grid-template-columns: repeat(2, 1fr) !important;
          gap: 0.35rem !important;
        }

        /* Info section print bg */
        .bg-slate-50 { background-color: #f8fafc !important; }

        /* Ensure borders print */
        .border-primary { border-color: hsl(var(--primary)) !important; }
        .border-orange-500 { border-color: #f97316 !important; }

        /* Red alert bg */
        .bg-red-100 { background-color: #fee2e2 !important; }
        .border-red-600 { border-color: #dc2626 !important; }
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
    <Card className="border-2 border-primary overflow-hidden kennel-card-print-wrapper">
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
    <Card className="border-0 shadow-none overflow-hidden kennel-card-print-wrapper h-full flex flex-col">
      
      {/* 1. Header Meta Row (QR, Barcode, Date) */}
      <div className="flex items-end justify-between px-1 pb-2">
         {/* Safety Banner (compact badge) */}
        <div className={`${safetyConfig.bg} ${safetyConfig.text} ${safetyConfig.className} px-4 py-2 rounded-md inline-flex flex-col`}>
           <span className="font-bold text-sm uppercase tracking-wider">Handler Safety</span>
           <span className="font-black text-xl leading-none">{safetyConfig.label}</span>
           {animal.behaviorRestrictionReason && (animal.behaviorColor === 'yellow' || animal.behaviorColor === 'red') && (
             <span className="text-xs mt-0.5 opacity-90">{animal.behaviorRestrictionReason}</span>
           )}
        </div>

        {/* Scanning Area */}
        <div className="flex items-center gap-3">
            {animal.microchipNumber && (
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Microchip</span>
                <div className="bg-white px-2 py-1 rounded border border-gray-200 print-barcode-container">
                  <svg key={`barcode-${cardTemplate}-${animal.microchipNumber}`} ref={barcodeCallbackRef} data-testid="barcode-microchip" className="h-8 w-auto"></svg>
                </div>
              </div>
            )}
            {staffQrCode && (
              <div className="flex items-center gap-2">
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] text-muted-foreground uppercase">Staff Portal</p>
                </div>
                <img
                  src={staffQrCode}
                  alt="Scan"
                  className="w-12 h-12 border rounded"
                  data-testid="img-staff-qr-code"
                />
              </div>
            )}
            <div className="text-right">
               <p className="text-[10px] text-muted-foreground">Printed</p>
               <p className="text-xs font-medium">{format(new Date(), 'MMM d, h:mm a')}</p>
            </div>
        </div>
      </div>
      
      <CardContent className="p-1 space-y-4 kennel-card-content flex-1 flex flex-col">
        
        {/* 2. HERO SECTION: Name/Location (Left) + Large Photo (Right) */}
        <div className="flex rounded-xl overflow-hidden border-2 border-primary h-64 print-hero-section">
            
            {/* Left Col: Identity & Location */}
            <div className="flex-1 bg-white text-primary p-6 flex flex-col justify-between print-hero-left">
                <div>
                    <h1 className={`${getHeadingSizeClass()} font-black leading-tight mb-1 text-primary`} data-testid="text-kennel-card-name">
                      {animal.name}
                    </h1>
                    <h3 className="text-2xl font-medium text-primary/80">
                      {animal.animalId}
                    </h3>
                </div>

                <div className="mt-4">
                     <p className="text-sm font-semibold uppercase tracking-widest text-primary/60 mb-1">Kennel Location</p>
                     {animal.kennelRowName ? (
                        <div className="inline-block border-4 border-primary/20 bg-primary/5 rounded-lg px-4 py-2">
                            <p className="text-5xl font-black leading-none whitespace-nowrap text-primary" data-testid="text-kennel-location">
                                {animal.kennelRowName} <span className="text-primary/50 text-4xl">#</span>{animal.kennelPosition !== undefined && animal.kennelPosition !== null ? animal.kennelPosition + 1 : '?'}
                            </p>
                        </div>
                     ) : (
                        <p className="text-3xl font-bold italic text-primary/40">No Kennel Assigned</p>
                     )}
                </div>
            </div>

            {/* Right Col: Large Photo */}
            <div className="w-1/2 relative bg-muted print-hero-right">
                 {animal.photoUrls && animal.photoUrls.length > 0 ? (
                    <img
                        src={animal.photoUrls[0]}
                        alt={animal.name}
                        className="absolute inset-0 w-full h-full object-cover print-hero-image"
                        data-testid="img-kennel-card-photo"
                    />
                 ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                        <div className="text-center">
                            <Dog className="w-16 h-16 mx-auto opacity-20 mb-2" />
                            <p>No Photo</p>
                        </div>
                    </div>
                 )}
            </div>
        </div>

        {/* 3. Medical Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print-medical-grid">
          {/* Medications */}
          <Card className="border-2 border-primary shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2 pb-2 border-b">
                <Pill className="w-4 h-4 text-primary" />
                <h2 className="font-bold text-lg uppercase tracking-wide">Medications</h2>
              </div>
              {activeMedications.length > 0 ? (
                <div className="space-y-2">
                  {activeMedications.map((rx: any) => (
                    <div key={rx.id} className="flex justify-between items-baseline gap-2" data-testid={`medication-${rx.id}`}>
                      <span className="font-bold text-base">{rx.medicationName}</span>
                      <span className="text-sm font-medium bg-primary/10 px-2 py-0.5 rounded text-primary">
                        {rx.dosage} &bull; {getFrequencyDisplay(rx.frequency)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground italic text-sm py-1">No active medications</p>
              )}
            </CardContent>
          </Card>

          {/* Dietary Restrictions */}
          <Card className="border-2 border-orange-500 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-orange-100">
                <Utensils className="w-4 h-4 text-orange-500" />
                <h2 className="font-bold text-lg uppercase tracking-wide">Diet / Feeding</h2>
              </div>
              {animal.dietaryRestrictions ? (
                <p className={`${getFontSizeClass()} font-medium`}>{animal.dietaryRestrictions}</p>
              ) : (
                <p className="text-muted-foreground italic text-sm py-1">No special restrictions</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 4. Medical Alert */}
        {animal.medicalAlertMemo && (
          <div className="bg-red-100 border-l-8 border-red-600 p-3 rounded-r-md">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
                <div>
                  <p className="font-bold text-red-800 uppercase text-xs tracking-wider">Medical Alert</p>
                  <p className="text-lg font-bold text-red-900 leading-tight">
                    {animal.medicalAlertMemo}
                  </p>
                </div>
              </div>
          </div>
        )}

        {/* 5. Info Grid & Badges */}
        <div className="animal-info-section flex-grow flex flex-col border rounded-lg p-4 bg-slate-50">
            {/* Behavior Badges */}
            <div className="flex gap-3 mb-6 flex-wrap">
              {/* Kids */}
              <div className={`flex items-center gap-1.5 border rounded px-2 py-1 bg-white ${animal.childFriendly === false ? 'opacity-50' : ''}`} data-testid="staff-indicator-child-friendly">
                <Baby className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Kids</span>
                {animal.childFriendly === true && <Check className="w-4 h-4 text-green-600 ml-1" />}
                {animal.childFriendly === false && <XIcon className="w-4 h-4 text-red-600 ml-1" />}
                {animal.childFriendly == null && <span className="text-xs text-muted-foreground ml-1">?</span>}
              </div>
              
              {/* Cats */}
              <div className={`flex items-center gap-1.5 border rounded px-2 py-1 bg-white ${animal.catFriendly === false ? 'opacity-50' : ''}`} data-testid="staff-indicator-cat-friendly">
                <Cat className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Cats</span>
                {animal.catFriendly === true && <Check className="w-4 h-4 text-green-600 ml-1" />}
                {animal.catFriendly === false && <XIcon className="w-4 h-4 text-red-600 ml-1" />}
                {animal.catFriendly == null && <span className="text-xs text-muted-foreground ml-1">?</span>}
              </div>
              
              {/* Dogs */}
              <div className={`flex items-center gap-1.5 border rounded px-2 py-1 bg-white ${animal.dogFriendly === false ? 'opacity-50' : ''}`} data-testid="staff-indicator-dog-friendly">
                <Dog className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Dogs</span>
                {animal.dogFriendly === true && <Check className="w-4 h-4 text-green-600 ml-1" />}
                {animal.dogFriendly === false && <XIcon className="w-4 h-4 text-red-600 ml-1" />}
                {animal.dogFriendly == null && <span className="text-xs text-muted-foreground ml-1">?</span>}
              </div>

              {/* Heartworm */}
               <div className="flex items-center gap-1.5 border rounded px-2 py-1 bg-white" data-testid="staff-indicator-heartworm">
                <Heart className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold">HW</span>
                {animal.heartwormPositive === true && <span className="text-sm font-black text-red-600 ml-1">POS</span>}
                {animal.heartwormPositive === false && <span className="text-sm font-black text-green-600 ml-1">NEG</span>}
                {animal.heartwormPositive == null && <span className="text-xs text-muted-foreground ml-1">?</span>}
              </div>

              {/* Spay/Neuter */}
              <div className="flex items-center gap-1.5 border rounded px-2 py-1 bg-white" data-testid="staff-indicator-altered">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold">
                  {animal.neuterStatus === 'spayed' ? 'Spayed' : 
                   animal.neuterStatus === 'neutered' ? 'Neutered' : 
                   animal.neuterStatus === 'intact' ? 'Intact' : 'Unk'}
                </span>
              </div>
            </div>

            {/* Logistics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs uppercase text-muted-foreground font-semibold">Intake</p>
                <p className="font-bold">{animal.intakeDate ? format(new Date(animal.intakeDate), 'MMM d, yyyy') : '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground font-semibold">Weight</p>
                <p className="font-bold">{animal.weight || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground font-semibold">Activity</p>
                <p className="font-bold">{activityInfo.label}</p>
              </div>
               <div>
                <p className="text-xs uppercase text-muted-foreground font-semibold">Source</p>
                <p className="font-bold truncate">{getIntakeSourceDisplay(animal.intakeSource)}</p>
              </div>
              {(animal.intakeSource === 'stray' || animal.status === 'stray_hold' || animal.locationFound) && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground font-semibold">Location Found</p>
                  <p className="font-bold" data-testid="text-location-found">{animal.locationFound || 'Not recorded'}</p>
                </div>
              )}
            </div>
            
            {/* Stray Hold (Conditional) */}
             {(animal.strayHoldUntil && new Date(animal.strayHoldUntil) > new Date()) && (
                <div className="mt-4 pt-4 border-t border-dashed border-gray-300">
                    <div className="flex items-center gap-2 text-orange-700">
                        <Scale className="w-4 h-4" />
                        <span className="font-bold">STRAY HOLD UNTIL: {format(new Date(animal.strayHoldUntil), 'MMMM d, yyyy')}</span>
                    </div>
                </div>
             )}
        </div>

        {/* Additional Comments */}
        {additionalComments && (
          <div className="border border-primary/20 bg-primary/5 p-3 rounded-lg">
            <h3 className="font-bold text-sm uppercase text-primary mb-1">Staff Notes</h3>
            <p className="whitespace-pre-wrap text-sm" data-testid="text-additional-comments">{additionalComments}</p>
          </div>
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
