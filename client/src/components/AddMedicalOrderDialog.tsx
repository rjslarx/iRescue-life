import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AlertTriangle, Pill, Syringe, FlaskConical, Stethoscope, ShieldCheck, ClipboardCheck, Package, Loader2, Clock, CheckCircle2, AlertCircle, ArrowLeft, Search, Zap, Plus } from "lucide-react";

import { AddPrescriptionDialog } from "@/components/AddPrescriptionDialog";
import { AddVaccineDialog } from "@/components/AddVaccineDialog";
import { AddDiagnosticDialog } from "@/components/AddDiagnosticDialog";
import { AddProcedureDialog } from "@/components/AddProcedureDialog";
import { AddExamDialog } from "@/components/AddExamDialog";
import { AddPreventativeCareDialog } from "@/components/AddPreventativeCareDialog";

interface ActiveOrder {
  id: string;
  name: string;
  category: string;
  status: string;
  dueDate: string | null;
  source: string;
}

interface CatalogItem {
  id: string;
  name: string;
  category: 'Medication' | 'Vaccine' | 'Lab' | 'Procedure' | 'Preventative' | 'Exam';
  defaultDose: string | null;
  defaultFrequency: string | null;
}

interface OrderSetWithItems {
  id: string;
  setName: string;
  description: string | null;
  items: { id: string; sortOrder: number; offsetDays: number; catalogItem: CatalogItem }[];
}

interface PendingOrder {
  category: string;
  name: string;
  defaultDose?: string | null;
  defaultFrequency?: string | null;
}

interface AddMedicalOrderDialogProps {
  animalId: string;
  animalSpecies?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const categoryIcons: Record<string, typeof Pill> = {
  Medication: Pill,
  Vaccine: Syringe,
  Lab: FlaskConical,
  Procedure: Stethoscope,
  Preventative: ShieldCheck,
  Exam: ClipboardCheck,
};

const categoryColors: Record<string, string> = {
  Medication: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Vaccine: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  Lab: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  Procedure: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  Exam: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  Preventative: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
};

const vetMedications = new Set([
  'doxycycline', 'amoxicillin', 'clavamox', 'amoxicillin-clavulanate', 'metronidazole', 'flagyl',
  'cephalexin', 'keflex', 'gabapentin', 'trazodone', 'prednisone', 'prednisolone', 'dexamethasone',
  'carprofen', 'rimadyl', 'meloxicam', 'metacam', 'cerenia', 'maropitant', 'famotidine', 'pepcid',
  'omeprazole', 'prilosec', 'sucralfate', 'carafate', 'enrofloxacin', 'baytril', 'clindamycin',
  'antirobe', 'apoquel', 'oclacitinib', 'cytopoint', 'simparica', 'simparica trio', 'bravecto',
  'nexgard', 'heartgard', 'heartgard plus', 'interceptor', 'interceptor plus', 'sentinel',
  'revolution', 'revolution plus', 'advantage', 'advantage multi', 'frontline', 'frontline plus',
  'seresto', 'denamarin', 'ursodiol', 'methimazole', 'tapazole', 'phenobarbital', 'luminal',
  'potassium bromide', 'kbr', 'zonisamide', 'zonegran', 'levetiracetam', 'keppra',
  'fluoxetine', 'prozac', 'reconcile', 'acepromazine', 'butorphanol', 'torbugesic',
  'tramadol', 'ondansetron', 'zofran', 'metoclopramide', 'reglan', 'cisapride', 'propulsid',
  'lactulose', 'miralax', 'polyethylene glycol', 'proviable', 'fortiflora',
  'diphenhydramine', 'benadryl', 'cetirizine', 'zyrtec', 'chlorpheniramine',
  'furosemide', 'lasix', 'enalapril', 'benazepril', 'pimobendan', 'vetmedin',
  'spironolactone', 'atenolol', 'diltiazem', 'amlodipine', 'sildenafil',
  'insulin', 'vetsulin', 'glargine', 'lantus', 'prozinc',
  'methotrexate', 'cyclophosphamide', 'vincristine', 'doxorubicin', 'palladia', 'toceranib',
  'cyclosporine', 'atopica', 'azathioprine', 'mycophenolate',
  'ketoconazole', 'fluconazole', 'itraconazole', 'terbinafine',
  'ivermectin', 'milbemycin', 'fenbendazole', 'panacur', 'pyrantel', 'strongid', 'praziquantel', 'drontal',
  'metaflumizone', 'fipronil', 'imidacloprid', 'selamectin', 'moxidectin',
  'tobramycin', 'gentamicin', 'neomycin', 'polymyxin b', 'ofloxacin',
  'erythromycin', 'tetracycline', 'minocycline', 'marbofloxacin', 'pradofloxacin', 'veraflox',
  'sulfamethoxazole', 'trimethoprim', 'smz-tmp', 'tmp-smx',
  'hydroxyzine', 'maropitant citrate', 'capromorelin', 'entyce', 'mirtazapine', 'mirataz',
  'methocarbamol', 'robaxin', 'diazepam', 'valium', 'midazolam',
  'buprenorphine', 'simbadol', 'hydromorphone', 'fentanyl',
  'adequan', 'polysulfated glycosaminoglycan', 'librela', 'solensia', 'galliprant', 'grapiprant',
  'thyro-tabs', 'levothyroxine', 'soloxine',
  'cefpodoxime', 'simplicef', 'convenia', 'cefovecin',
  'chlorambucil', 'leukeran', 'lomustine', 'ccnu',
  'maelstrom', 'trilostane', 'vetoryl',
  'succinylcholine', 'propofol', 'alfaxalone', 'alfaxan', 'ketamine', 'telazol', 'tiletamine',
  'atropine', 'glycopyrrolate',
  'ponazuril', 'marquis', 'capstar', 'nitenpyram',
  'erythromycin ophthalmic',
]);

const vetVaccines = new Set([
  'rabies', 'dhpp', 'dhlpp', 'dapp', 'da2pp', 'da2ppc', 'distemper', 'parvovirus', 'parvo',
  'parainfluenza', 'adenovirus', 'bordetella', 'kennel cough',
  'leptospirosis', 'lepto', 'lyme', 'lyme disease',
  'canine influenza', 'civ', 'h3n2', 'h3n8',
  'rattlesnake vaccine', 'crotalus atrox',
  'fvrcp', 'feline distemper', 'panleukopenia', 'calicivirus', 'rhinotracheitis',
  'felv', 'feline leukemia', 'fiv', 'feline immunodeficiency',
  'chlamydia', 'feline chlamydia',
  'intranasal bordetella',
]);

const vetLabs = new Set([
  'cbc', 'complete blood count', 'chemistry', 'chemistry panel', 'chem panel',
  'urinalysis', 'ua', 'fecal', 'fecal float', 'fecal test', 'ova and parasite',
  'heartworm test', 'hw test', 'hwt', '4dx', 'snap 4dx', 'snap test',
  't4', 'total t4', 'free t4', 'thyroid', 'thyroid panel', 'tsh',
  'cytology', 'biopsy', 'histopathology', 'histopath',
  'culture', 'culture and sensitivity', 'c&s',
  'felv/fiv', 'felv fiv', 'fiv felv', 'felv/fiv test', 'combo test',
  'parvo test', 'parvo snap',
  'blood panel', 'blood work', 'bloodwork',
  'metabolic panel', 'bmp', 'cmp', 'comprehensive metabolic',
  'coagulation', 'coag panel', 'pt', 'ptt', 'pt/ptt', 'aptt',
  'blood gas', 'abg', 'venous blood gas',
  'electrolytes', 'lytes',
  'lipase', 'amylase', 'spec cpl', 'cpli', 'fpli', 'snap cpli',
  'bile acids', 'pre and post bile acids',
  'cortisol', 'acth stimulation', 'acth stim', 'ldds', 'low dose dex',
  'upc', 'urine protein creatinine',
  'pcr', 'pcr panel', 'respiratory pcr',
  'blood smear', 'reticulocyte count', 'retic count',
  'cross match', 'crossmatch', 'blood type', 'blood typing',
  'progesterone',
  'skin scrape', 'skin scraping',
]);

const vetProcedures = new Set([
  'spay', 'ovariohysterectomy', 'ove', 'neuter', 'castration', 'orchiectomy',
  'dental', 'dental cleaning', 'dental prophylaxis', 'prophy',
  'extraction', 'tooth extraction', 'dental extraction',
  'mass removal', 'lump removal', 'tumor removal', 'mass excision',
  'laceration repair', 'wound repair', 'wound closure', 'suture',
  'foreign body removal', 'foreign body', 'fb removal', 'exploratory',
  'exploratory laparotomy', 'exploratory surgery',
  'amputation', 'leg amputation', 'tail amputation',
  'enucleation', 'eye removal',
  'cystotomy', 'bladder surgery', 'bladder stone removal',
  'gastropexy', 'gdv', 'bloat surgery',
  'pyometra', 'pyometra surgery',
  'c-section', 'cesarean', 'caesarean', 'cesarean section',
  'cherry eye repair', 'cherry eye',
  'entropion', 'entropion repair', 'ectropion', 'ectropion repair',
  'cruciate repair', 'tplo', 'tta', 'mpo', 'acl repair',
  'fho', 'femoral head ostectomy',
  'patella luxation', 'mppl', 'lppl',
  'aural hematoma', 'ear hematoma',
  'perineal urethrostomy', 'pu surgery',
  'hernia repair', 'inguinal hernia', 'umbilical hernia',
  'liver biopsy', 'skin biopsy',
  'rhinoscopy', 'endoscopy', 'colonoscopy', 'bronchoscopy',
  'ct scan', 'mri', 'ultrasound', 'radiograph', 'x-ray', 'xray',
  'microchip', 'microchipping',
  'euthanasia', 'humane euthanasia',
]);

const vetPreventatives = new Set([
  'flea/tick', 'flea tick', 'flea and tick', 'flea prevention', 'tick prevention',
  'deworming', 'deworm', 'dewormer',
  'nail trim', 'nail trimming', 'nail clip',
  'ear cleaning', 'ear clean', 'ear flush',
  'anal gland', 'anal gland expression', 'anal glands',
  'dental cleaning', 'teeth cleaning',
  'weight check', 'weight management',
  'flea comb', 'flea bath', 'medicated bath', 'lime sulfur dip',
  'heartworm prevention', 'hw prevention',
  'grooming', 'sanitary trim', 'mat removal',
]);

const vetExams = new Set([
  'intake exam', 'intake', 'intake evaluation',
  'wellness exam', 'wellness', 'wellness check', 'annual exam', 'yearly exam',
  'recheck', 'recheck exam', 'follow up', 'follow-up', 'followup',
  'sick visit', 'sick exam', 'illness exam',
  'emergency exam', 'emergency', 'urgent exam',
  'pre-surgical exam', 'pre-op', 'pre-operative', 'pre surgical',
  'adoption exam', 'adoption evaluation',
  'new patient exam', 'initial exam',
  'geriatric exam', 'senior exam', 'senior wellness',
  'behavioral consult', 'behavior evaluation',
  'orthopedic exam', 'lameness exam',
  'dermatology exam', 'skin exam',
  'ophthalmologic exam', 'eye exam',
  'cardiology consult', 'cardiac exam',
]);

const searchAliases: Record<string, string[]> = {
  'hwt': ['heartworm'],
  'hw': ['heartworm'],
  '4dx': ['heartworm', '4dx', 'snap'],
  'felv': ['felv', 'feline leukemia'],
  'fiv': ['fiv', 'feline immunodeficiency'],
  'dhpp': ['dhpp', 'da2pp', 'distemper'],
  'fvrcp': ['fvrcp', 'feline distemper'],
  'cbc': ['cbc', 'complete blood count'],
  'ua': ['urinalysis'],
  'smz': ['sulfamethoxazole', 'trimethoprim'],
  'tmp': ['trimethoprim', 'sulfamethoxazole'],
  'nsaid': ['carprofen', 'meloxicam', 'rimadyl', 'metacam', 'galliprant'],
  'abx': ['amoxicillin', 'cephalexin', 'doxycycline', 'enrofloxacin', 'clindamycin', 'metronidazole', 'convenia'],
  'sq': ['subcutaneous', 'sq fluids'],
  'sub-q': ['subcutaneous', 'sq fluids'],
  'subq': ['subcutaneous', 'sq fluids'],
  'fluids': ['subcutaneous', 'sq fluids'],
  'convenia': ['convenia', 'cefovecin'],
  'parvo': ['parvo', 'parvovirus'],
  'giardia': ['giardia', 'fenbendazole', 'panacur'],
  'mange': ['skin scrape', 'demodex', 'bravecto'],
  'demodex': ['skin scrape', 'demodex', 'bravecto'],
};

function expandSearchTerms(query: string): string[] {
  const lower = query.toLowerCase().trim();
  if (!lower) return [];
  const aliases = searchAliases[lower];
  if (aliases) return [lower, ...aliases];
  return [lower];
}

function classifyVeterinaryItem(name: string): { category: 'Medication' | 'Vaccine' | 'Lab' | 'Procedure' | 'Preventative' | 'Exam'; confidence: 'high' | 'medium' } | null {
  const normalized = name.toLowerCase().trim();
  if (!normalized) return null;

  const exactChecks: Array<[Set<string>, 'Medication' | 'Vaccine' | 'Lab' | 'Procedure' | 'Preventative' | 'Exam']> = [
    [vetMedications, 'Medication'],
    [vetVaccines, 'Vaccine'],
    [vetLabs, 'Lab'],
    [vetProcedures, 'Procedure'],
    [vetPreventatives, 'Preventative'],
    [vetExams, 'Exam'],
  ];

  for (const [dict, category] of exactChecks) {
    if (dict.has(normalized)) return { category, confidence: 'high' };
  }

  for (const [dict, category] of exactChecks) {
    for (const term of dict) {
      if (normalized.includes(term) || term.includes(normalized)) {
        return { category, confidence: 'medium' };
      }
    }
  }

  const suffixHints: Array<[string[], 'Medication' | 'Vaccine' | 'Lab' | 'Procedure' | 'Preventative' | 'Exam']> = [
    [['cillin', 'cycline', 'floxacin', 'azole', 'prazole', 'olol', 'pril', 'sartan', 'statin', 'dipine', 'pamide', 'sone', 'olone', 'nib', 'mab', 'parin', 'afil', 'barb', 'zepam', 'etam', 'pam', 'oxacin', 'mycin', 'micin'], 'Medication'],
    [['vaccine', 'vaccination', 'vax', 'booster'], 'Vaccine'],
    [['test', 'panel', 'screen', 'assay', 'titer', 'titre'], 'Lab'],
    [['surgery', 'ectomy', 'otomy', 'ostomy', 'plasty', 'pexy', 'rrhaphy', 'scopy', 'tomy'], 'Procedure'],
    [['prevention', 'preventive', 'prophylaxis'], 'Preventative'],
    [['exam', 'examination', 'evaluation', 'consult', 'visit', 'checkup', 'check-up'], 'Exam'],
  ];

  for (const [suffixes, category] of suffixHints) {
    for (const suffix of suffixes) {
      if (normalized.includes(suffix)) {
        return { category, confidence: 'medium' };
      }
    }
  }

  return null;
}

function mapExamType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('intake')) return 'intake';
  if (lower.includes('recheck')) return 'recheck';
  if (lower.includes('wellness')) return 'wellness';
  if (lower.includes('emergency')) return 'emergency';
  if (lower.includes('adoption')) return 'adoption';
  return 'other';
}

function getStatusBadgeInfo(order: ActiveOrder) {
  const now = new Date();
  if (order.dueDate) {
    const due = new Date(order.dueDate);
    const diffMs = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { label: "Overdue", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", icon: AlertCircle };
    if (diffDays <= 1) return { label: "Due Tomorrow", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", icon: Clock };
    if (diffDays <= 7) return { label: `Due in ${diffDays}d`, className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", icon: Clock };
    return { label: "Scheduled", className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", icon: CheckCircle2 };
  }
  if (order.status === 'active') return { label: "Active", className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", icon: CheckCircle2 };
  return { label: "Pending", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", icon: Clock };
}

export function AddMedicalOrderDialog({ animalId, animalSpecies = 'Dog', open, onOpenChange }: AddMedicalOrderDialogProps) {
  const { toast } = useToast();
  const [searchValue, setSearchValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [duplicateConfirm, setDuplicateConfirm] = useState<{ item: CatalogItem; existingName: string } | null>(null);
  const [creatingNew, setCreatingNew] = useState<{ name: string; category: string; defaultDose: string; defaultFrequency: string } | null>(null);
  const [creatingNewLoading, setCreatingNewLoading] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
  const [selectedOrderSet, setSelectedOrderSet] = useState<OrderSetWithItems | null>(null);

  const { data: activeOrdersData, isLoading: loadingActive } = useQuery<{ activeOrders: ActiveOrder[] }>({
    queryKey: [`/api/animals/${animalId}/medical/active-orders`],
    enabled: open || !!pendingOrder,
  });

  const { data: catalogData } = useQuery<CatalogItem[]>({
    queryKey: ['/api/medical-catalog'],
    enabled: open,
  });

  const { data: orderSetsData } = useQuery<OrderSetWithItems[]>({
    queryKey: ['/api/order-sets'],
    enabled: open,
  });

  const activeOrders = activeOrdersData?.activeOrders || [];
  const catalogItems = Array.isArray(catalogData) ? catalogData : [];
  const orderSets = (Array.isArray(orderSetsData) ? orderSetsData : []).filter(os => os && Array.isArray(os.items));

  const activeNameSet = useMemo(() => {
    const set = new Set<string>();
    for (const ao of activeOrders) {
      if (ao?.name) set.add(ao.name.toLowerCase());
    }
    return set;
  }, [activeOrders]);

  useEffect(() => {
    if (!open && !pendingOrder) {
      setSearchValue("");
      setDuplicateConfirm(null);
      setCreatingNew(null);
      setCreatingNewLoading(false);
      setSelectedOrderSet(null);
    }
  }, [open, pendingOrder]);

  function handleSelectCatalogItem(item: CatalogItem) {
    const isDuplicate = activeNameSet.has((item.name || '').toLowerCase());
    if (isDuplicate) {
      setDuplicateConfirm({ item, existingName: item.name });
      return;
    }
    confirmSelectItem(item);
  }

  function confirmSelectItem(item: CatalogItem) {
    setPendingOrder({
      category: item.category,
      name: item.name,
      defaultDose: item.defaultDose,
      defaultFrequency: item.defaultFrequency,
    });
    setSearchValue("");
    onOpenChange(false);
  }

  function handleSelectOrderSet(os: OrderSetWithItems) {
    setSelectedOrderSet(os);
    setSearchValue("");
  }

  function startCreateNew(name: string) {
    const detected = classifyVeterinaryItem(name);
    setCreatingNew({ name, category: detected?.category || "", defaultDose: "", defaultFrequency: "" });
    setSearchValue("");
  }

  async function handleCreateAndContinue() {
    if (!creatingNew || !creatingNew.category) return;
    setCreatingNewLoading(true);
    try {
      const res = await apiRequest('POST', '/api/medical-catalog', {
        name: creatingNew.name,
        category: creatingNew.category,
        defaultDose: creatingNew.defaultDose || null,
        defaultFrequency: creatingNew.defaultFrequency || null,
      });
      const newItem: CatalogItem = await res.json();
      queryClient.invalidateQueries({ queryKey: ['/api/medical-catalog'] });
      confirmSelectItem(newItem);
      setCreatingNew(null);
      toast({ title: "Catalog Item Created", description: `"${newItem.name}" added to your catalog.` });
    } catch (err: any) {
      toast({ title: "Failed to create item", description: err.message || "An error occurred", variant: "destructive" });
    } finally {
      setCreatingNewLoading(false);
    }
  }

  async function handleOrderSetSubmit() {
    if (!selectedOrderSet) return;
    setSubmitting(true);

    try {
      const payload: Record<string, any> = {
        animalId,
        orderSetId: selectedOrderSet.id,
        formData: {},
      };

      const res = await apiRequest('POST', '/api/medical-orders/dispatch', payload);
      const result = await res.json();

      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/prescriptions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/vaccines`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/diagnostics`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/procedures`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/exams`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/preventative-care`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/active-orders`] });
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/history`] });

      toast({
        title: "Order Set Applied",
        description: `${result.dispatched} items from "${selectedOrderSet.setName}" created.`,
      });

      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Failed to create order", description: err.message || "An error occurred", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  function handleCategoryDialogClose(didOpen: boolean) {
    if (!didOpen) {
      setPendingOrder(null);
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/medical/active-orders`] });
    }
  }

  return (
    <>
      <Dialog open={open && !pendingOrder} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-add-medical-order">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="w-5 h-5" />
              Add Medical Order
            </DialogTitle>
            <DialogDescription>
              Search for a medication, vaccine, lab, procedure, or apply an order set.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Active / Pending Orders</p>
              {loadingActive ? (
                <div className="flex flex-wrap gap-1.5">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-6 w-20" />
                </div>
              ) : activeOrders.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No active orders</p>
              ) : (
                <div className="flex flex-wrap gap-1.5" data-testid="container-active-orders">
                  {activeOrders.map(ao => {
                    const badge = getStatusBadgeInfo(ao);
                    const BadgeIcon = badge.icon;
                    return (
                      <Badge key={ao.id} variant="outline" className={`text-xs ${badge.className}`} data-testid={`badge-active-order-${ao.id}`}>
                        <BadgeIcon className="w-3 h-3 mr-1 shrink-0" />
                        {ao.name} - {badge.label}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>

            {!selectedOrderSet ? (
              creatingNew ? (
                <div className="space-y-4" data-testid="container-create-new-item">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setCreatingNew(null)}
                      data-testid="button-back-from-create"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <span className="font-medium">Create New Catalog Item</span>
                  </div>

                  <div className="space-y-3 border-t pt-4">
                    <div className="space-y-1.5">
                      <Label>Item Name</Label>
                      <Input
                        value={creatingNew.name}
                        onChange={e => setCreatingNew(prev => prev ? { ...prev, name: e.target.value } : prev)}
                        placeholder="e.g., Doxycycline"
                        data-testid="input-new-item-name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Category <span className="text-destructive">*</span></Label>
                      <Select
                        value={creatingNew.category}
                        onValueChange={v => setCreatingNew(prev => prev ? { ...prev, category: v } : prev)}
                      >
                        <SelectTrigger data-testid="select-new-item-category">
                          <SelectValue placeholder="Select a category..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Medication">Medication</SelectItem>
                          <SelectItem value="Vaccine">Vaccine</SelectItem>
                          <SelectItem value="Lab">Lab</SelectItem>
                          <SelectItem value="Procedure">Procedure</SelectItem>
                          <SelectItem value="Preventative">Preventative</SelectItem>
                          <SelectItem value="Exam">Exam</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {(creatingNew.category === 'Medication' || !creatingNew.category) && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Default Dose (optional)</Label>
                          <Input
                            value={creatingNew.defaultDose}
                            onChange={e => setCreatingNew(prev => prev ? { ...prev, defaultDose: e.target.value } : prev)}
                            placeholder="e.g., 100mg"
                            data-testid="input-new-item-dose"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Default Frequency (optional)</Label>
                          <Input
                            value={creatingNew.defaultFrequency}
                            onChange={e => setCreatingNew(prev => prev ? { ...prev, defaultFrequency: e.target.value } : prev)}
                            placeholder="e.g., BID"
                            data-testid="input-new-item-frequency"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t">
                    <Button variant="outline" onClick={() => setCreatingNew(null)} data-testid="button-cancel-create">
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateAndContinue}
                      disabled={!creatingNew.name.trim() || !creatingNew.category || creatingNewLoading}
                      data-testid="button-create-and-continue"
                    >
                      {creatingNewLoading ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</>
                      ) : (
                        <><Plus className="w-4 h-4 mr-1.5" />Create & Continue</>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Search medications, vaccines, labs..."
                      value={searchValue}
                      onChange={e => setSearchValue(e.target.value)}
                      className="pl-9"
                      data-testid="input-search-catalog"
                      autoFocus
                    />
                  </div>

                  {!searchValue ? (
                    <div className="space-y-4" data-testid="container-quick-picks">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5" />
                          Quick Picks
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {catalogItems.slice(0, 5).map(ci => {
                            const Icon = categoryIcons[ci.category] || Pill;
                            const isDuplicate = activeNameSet.has((ci.name || '').toLowerCase());
                            return (
                              <button
                                key={ci.id}
                                onClick={() => handleSelectCatalogItem(ci)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md hover-elevate active-elevate-2 transition-colors"
                                data-testid={`quick-pick-${ci.id}`}
                              >
                                <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className={isDuplicate ? "text-amber-600 dark:text-amber-400" : ""}>{ci.name}</span>
                                {isDuplicate && <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {orderSets.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                            <Package className="w-3.5 h-3.5" />
                            Order Sets
                          </p>
                          <div className="space-y-1">
                            {orderSets.map(os => (
                              <button
                                key={os.id}
                                onClick={() => handleSelectOrderSet(os)}
                                className="flex items-center gap-2 w-full p-2.5 text-sm border rounded-md text-left hover-elevate active-elevate-2 transition-colors"
                                data-testid={`quick-pick-orderset-${os.id}`}
                              >
                                <Package className="w-4 h-4 shrink-0 text-muted-foreground" />
                                <span className="font-medium flex-1">{os.setName}</span>
                                <Badge variant="secondary" className="text-[10px] shrink-0">
                                  {os.items.length} items
                                </Badge>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Command className="border rounded-md" data-testid="command-search">
                        <CommandList className="max-h-64">
                          <CommandEmpty>
                            <span className="text-muted-foreground">No matching items in catalog.</span>
                          </CommandEmpty>
                          {catalogItems.length > 0 && (
                            <CommandGroup heading="Catalog Items">
                              {catalogItems
                                .filter(ci => {
                                  if (!ci?.name) return false;
                                  const terms = expandSearchTerms(searchValue);
                                  const nameLower = ci.name.toLowerCase();
                                  return terms.some(t => nameLower.includes(t));
                                })
                                .map(ci => {
                                  const isDuplicate = activeNameSet.has((ci.name || '').toLowerCase());
                                  const Icon = categoryIcons[ci.category] || Pill;
                                  return (
                                    <CommandItem
                                      key={ci.id}
                                      value={ci.name}
                                      onSelect={() => handleSelectCatalogItem(ci)}
                                      className="flex items-center gap-2"
                                      data-testid={`item-catalog-${ci.id}`}
                                    >
                                      <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                                      <span className={isDuplicate ? "text-amber-600 dark:text-amber-400" : ""}>
                                        {ci.name}
                                      </span>
                                      <Badge variant="secondary" className={`text-[10px] ml-auto shrink-0 ${categoryColors[ci.category] || ""}`}>
                                        {ci.category}
                                      </Badge>
                                      {isDuplicate && (
                                        <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">(active)</span>
                                      )}
                                    </CommandItem>
                                  );
                                })}
                            </CommandGroup>
                          )}
                          {orderSets.length > 0 && (
                            <CommandGroup heading="Order Sets">
                              {orderSets
                                .filter(os => (os.setName || '').toLowerCase().includes(searchValue.toLowerCase()))
                                .map(os => (
                                  <CommandItem
                                    key={os.id}
                                    value={os.setName}
                                    onSelect={() => handleSelectOrderSet(os)}
                                    className="flex items-center gap-2"
                                    data-testid={`item-orderset-${os.id}`}
                                  >
                                    <Package className="w-4 h-4 shrink-0 text-muted-foreground" />
                                    <div className="flex-1 min-w-0">
                                      <span className="font-medium">{os.setName}</span>
                                      <span className="text-xs text-muted-foreground ml-2">
                                        ({os.items.length} items)
                                      </span>
                                    </div>
                                  </CommandItem>
                                ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                      {(() => {
                        const detected = classifyVeterinaryItem(searchValue);
                        const DetectedIcon = detected ? categoryIcons[detected.category] || Pill : null;
                        return (
                          <button
                            onClick={() => startCreateNew(searchValue)}
                            className="flex items-center gap-2 w-full p-2.5 text-sm border rounded-md text-left hover-elevate active-elevate-2 transition-colors text-primary"
                            data-testid="button-create-new-from-search"
                          >
                            <Plus className="w-4 h-4 shrink-0" />
                            <span className="flex-1">
                              Create "<strong>{searchValue}</strong>"
                              {detected ? (
                                <> as {detected.category}</>
                              ) : (
                                <> as new catalog item</>
                              )}
                            </span>
                            {detected && (
                              <Badge variant="secondary" className={`text-[10px] shrink-0 ${categoryColors[detected.category] || ""}`}>
                                {DetectedIcon && <DetectedIcon className="w-3 h-3 mr-1" />}
                                {detected.category}
                              </Badge>
                            )}
                          </button>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedOrderSet(null)}
                    data-testid="button-back-to-search"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Package className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium truncate">Order Details: {selectedOrderSet.setName}</span>
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {selectedOrderSet.items.length} items
                    </Badge>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="space-y-1.5" data-testid="container-orderset-items">
                    <p className="text-sm font-medium">Items in this order set:</p>
                    {selectedOrderSet.items.filter(osi => osi?.catalogItem).map(osi => {
                      const Icon = categoryIcons[osi.catalogItem.category] || Pill;
                      const isDuplicate = activeNameSet.has((osi.catalogItem.name || '').toLowerCase());
                      const offset = osi.offsetDays || 0;
                      return (
                        <div key={osi.id} className="flex items-center gap-2 p-2 border rounded-md text-sm">
                          <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                          <span className={isDuplicate ? "text-amber-600 dark:text-amber-400" : ""}>{osi.catalogItem.name}</span>
                          {offset > 0 && (
                            <Badge variant="outline" className="text-[10px] shrink-0" data-testid={`badge-offset-${osi.id}`}>
                              <Clock className="w-3 h-3 mr-0.5" />
                              Day {offset}
                            </Badge>
                          )}
                          <Badge variant="secondary" className={`text-[10px] ml-auto shrink-0 ${categoryColors[osi.catalogItem.category] || ""}`}>
                            {osi.catalogItem.category}
                          </Badge>
                          {isDuplicate && (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedOrderSet(null)}
                    data-testid="button-back-order"
                  >
                    <ArrowLeft className="w-4 h-4 mr-1.5" />
                    Back
                  </Button>
                  <Button onClick={handleOrderSetSubmit} disabled={submitting} data-testid="button-submit-order">
                    {submitting ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</>
                    ) : (
                      `Apply ${selectedOrderSet.items.length} Items`
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!duplicateConfirm} onOpenChange={(o) => { if (!o) setDuplicateConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Duplicate Order Warning
            </AlertDialogTitle>
            <AlertDialogDescription>
              This animal already has an active order for <strong>{duplicateConfirm?.existingName}</strong>. Are you sure you want to add another?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-duplicate">Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-duplicate"
              onClick={() => {
                if (duplicateConfirm) {
                  confirmSelectItem(duplicateConfirm.item);
                }
                setDuplicateConfirm(null);
              }}
            >
              Add Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {pendingOrder?.category === 'Medication' && (
        <AddPrescriptionDialog
          animalId={animalId}
          open={true}
          onOpenChange={handleCategoryDialogClose}
          defaultMedicationName={pendingOrder.name}
        />
      )}

      {pendingOrder?.category === 'Vaccine' && (
        <AddVaccineDialog
          animalId={animalId}
          open={true}
          onOpenChange={handleCategoryDialogClose}
          initialValues={{ itemName: pendingOrder.name }}
        />
      )}

      {pendingOrder?.category === 'Lab' && (
        <AddDiagnosticDialog
          animalId={animalId}
          open={true}
          onOpenChange={handleCategoryDialogClose}
          initialValues={{ testName: pendingOrder.name }}
        />
      )}

      {pendingOrder?.category === 'Procedure' && (
        <AddProcedureDialog
          animalId={animalId}
          open={true}
          onOpenChange={handleCategoryDialogClose}
          initialValues={{ procedureName: pendingOrder.name }}
        />
      )}

      {pendingOrder?.category === 'Exam' && (
        <AddExamDialog
          animalId={animalId}
          open={true}
          onOpenChange={handleCategoryDialogClose}
          initialValues={{ examType: mapExamType(pendingOrder.name) }}
        />
      )}

      {pendingOrder?.category === 'Preventative' && (
        <AddPreventativeCareDialog
          animalId={animalId}
          animalSpecies={animalSpecies}
          open={true}
          onOpenChange={handleCategoryDialogClose}
          initialValues={{ careName: pendingOrder.name }}
        />
      )}
    </>
  );
}
