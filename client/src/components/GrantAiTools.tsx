import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Grant, GrantApplicationDraft, GrantAnswerLibraryBlock } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Sparkles,
  Plus,
  Trash2,
  Copy,
  Download,
  RefreshCw,
  Save,
  BookOpen,
  ExternalLink,
  AlertTriangle,
  Check,
} from "lucide-react";
import { format } from "date-fns";

const libraryCategoryLabels: Record<string, string> = {
  org_history: "Org History & Mission",
  programs_overview: "Programs Overview",
  financial: "Financial & Legal",
  contact: "Contact Info",
  other: "Other",
};

// ============================================================================
// Deadline alert strip — grants with application/final-report deadlines within 30 days
// ============================================================================

export function GrantDeadlineAlerts({ grants }: { grants: Grant[] }) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const upcoming: Array<{ grant: Grant; label: string; date: Date; overdue: boolean }> = [];
  for (const g of grants) {
    if (g.applicationDeadline && !["submitted", "awarded", "denied", "completed"].includes(g.status)) {
      const d = new Date(g.applicationDeadline);
      if (d <= cutoff) upcoming.push({ grant: g, label: "Application due", date: d, overdue: d < now });
    }
    if (g.finalReportDeadline && !g.finalReportSubmitted && g.status === "awarded") {
      const d = new Date(g.finalReportDeadline);
      if (d <= cutoff) upcoming.push({ grant: g, label: "Final report due", date: d, overdue: d < now });
    }
  }
  upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());

  if (upcoming.length === 0) return null;

  return (
    <Card className="border-amber-300 dark:border-amber-700" data-testid="card-deadline-alerts">
      <CardContent className="py-4 space-y-2">
        <div className="flex items-center gap-2 font-medium">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span>Deadlines in the next 30 days</span>
        </div>
        <div className="space-y-1">
          {upcoming.map((item, i) => (
            <div
              key={`${item.grant.id}-${item.label}-${i}`}
              className="flex flex-wrap items-center gap-2 text-sm"
              data-testid={`row-deadline-${item.grant.id}-${i}`}
            >
              <Badge variant={item.overdue ? "destructive" : "secondary"} className="whitespace-nowrap">
                {item.overdue ? "Overdue" : format(item.date, "MMM d")}
              </Badge>
              <span className="font-medium">{item.grant.funderName}</span>
              <span className="text-muted-foreground">
                {item.grant.programName} — {item.label} {format(item.date, "MMM d, yyyy")}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Draft with AI workspace dialog (per grant)
// ============================================================================

export function GrantDraftWorkspace({
  grant,
  open,
  onOpenChange,
}: {
  grant: Grant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [questionsText, setQuestionsText] = useState("");
  const grantId = grant?.id;

  const { data: draftsData, isLoading: draftsLoading } = useQuery<{ drafts: GrantApplicationDraft[] }>({
    queryKey: ["/api/grants", grantId, "drafts"],
    enabled: open && !!grantId,
  });
  const drafts = draftsData?.drafts || [];

  const { data: libraryData } = useQuery<{ blocks: GrantAnswerLibraryBlock[] }>({
    queryKey: ["/api/grants/answer-library"],
    enabled: open,
  });
  const libraryBlocks = libraryData?.blocks || [];

  const invalidateDrafts = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/grants", grantId, "drafts"] });

  const generateMutation = useMutation({
    mutationFn: async (questions: string[]) => {
      const res = await apiRequest("POST", `/api/grants/${grantId}/drafts/generate`, { questions });
      return res.json();
    },
    onSuccess: () => {
      invalidateDrafts();
      setQuestionsText("");
      toast({ title: "Drafts ready", description: "AI answers were drafted from your organization's real data. Review and edit before submitting." });
    },
    onError: (error: Error) =>
      toast({ title: "Could not draft answers", description: error.message, variant: "destructive" }),
  });

  const regenerateMutation = useMutation({
    mutationFn: async (draftId: string) => {
      const res = await apiRequest("POST", `/api/grants/${grantId}/drafts/${draftId}/regenerate`);
      return res.json();
    },
    onSuccess: () => invalidateDrafts(),
    onError: (error: Error) =>
      toast({ title: "Could not regenerate", description: error.message, variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: async ({ draftId, answer }: { draftId: string; answer: string }) => {
      const res = await apiRequest("PATCH", `/api/grants/${grantId}/drafts/${draftId}`, { answer });
      return res.json();
    },
    onSuccess: () => {
      invalidateDrafts();
      toast({ title: "Answer saved" });
    },
    onError: (error: Error) =>
      toast({ title: "Could not save", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (draftId: string) => apiRequest("DELETE", `/api/grants/${grantId}/drafts/${draftId}`),
    onSuccess: () => invalidateDrafts(),
    onError: (error: Error) =>
      toast({ title: "Could not delete", description: error.message, variant: "destructive" }),
  });

  // Local edit buffer per draft id
  const [edits, setEdits] = useState<Record<string, string>>({});

  const handleGenerate = () => {
    const questions = questionsText
      .split("\n")
      .map((q) => q.trim())
      .filter((q) => q.length > 0);
    if (questions.length === 0) {
      toast({ title: "Add at least one question", description: "Paste one application question per line.", variant: "destructive" });
      return;
    }
    generateMutation.mutate(questions);
  };

  const copyText = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${what} copied to clipboard` });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const exportAll = () => {
    if (!grant) return;
    const body = drafts
      .map((d) => `Q: ${d.question}\n\n${edits[d.id] ?? d.answer ?? ""}`)
      .join("\n\n---\n\n");
    const text = `${grant.funderName} — ${grant.programName}\nApplication draft (exported ${format(new Date(), "MMM d, yyyy")})\n\n${body}\n`;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${grant.funderName} - application draft.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const insertBlock = (draftId: string, currentAnswer: string, block: GrantAnswerLibraryBlock) => {
    const existing = edits[draftId] ?? currentAnswer;
    setEdits({ ...edits, [draftId]: existing ? `${existing}\n\n${block.content}` : block.content });
  };

  if (!grant) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle data-testid="text-draft-workspace-title">
            <span className="flex items-center gap-2 flex-wrap">
              <Sparkles className="h-5 w-5" />
              Draft with AI — {grant.funderName}
            </span>
          </DialogTitle>
          <DialogDescription>
            Answers are drafted from your organization's profile and live statistics, tailored to {grant.programName}. Always review and edit before submitting — the AI drafts, humans submit.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-2 px-2">
          <div className="space-y-4 pb-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Add application questions</CardTitle>
                <CardDescription>Paste one question per line, then let the AI draft answers.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={questionsText}
                  onChange={(e) => setQuestionsText(e.target.value)}
                  placeholder={"Describe your organization's mission and history.\nHow many animals did you serve in the past year?\nHow will these funds be used?"}
                  rows={4}
                  data-testid="input-draft-questions"
                />
                <Button
                  onClick={handleGenerate}
                  disabled={generateMutation.isPending}
                  data-testid="button-generate-drafts"
                >
                  {generateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  {generateMutation.isPending ? "Drafting answers..." : "Draft answers with AI"}
                </Button>
              </CardContent>
            </Card>

            {draftsLoading ? (
              <div className="flex items-center justify-center h-24">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : drafts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-drafts">
                No saved answers yet for this grant.
              </p>
            ) : (
              drafts.map((draft) => {
                const value = edits[draft.id] ?? draft.answer ?? "";
                const dirty = edits[draft.id] !== undefined && edits[draft.id] !== (draft.answer ?? "");
                return (
                  <Card key={draft.id} data-testid={`card-draft-${draft.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <CardTitle className="text-sm font-medium flex-1 min-w-0" data-testid={`text-draft-question-${draft.id}`}>
                          {draft.question}
                        </CardTitle>
                        <div className="flex items-center gap-1 flex-wrap">
                          {draft.generationMeta?.edited ? (
                            <Badge variant="outline">Edited</Badge>
                          ) : draft.generationMeta?.generatedAt ? (
                            <Badge variant="secondary">AI draft</Badge>
                          ) : null}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Textarea
                        value={value}
                        onChange={(e) => setEdits({ ...edits, [draft.id]: e.target.value })}
                        rows={6}
                        data-testid={`input-draft-answer-${draft.id}`}
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant={dirty ? "default" : "outline"}
                          disabled={!dirty || saveMutation.isPending}
                          onClick={() => saveMutation.mutate({ draftId: draft.id, answer: value })}
                          data-testid={`button-save-draft-${draft.id}`}
                        >
                          {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={regenerateMutation.isPending}
                          onClick={() => regenerateMutation.mutate(draft.id)}
                          data-testid={`button-regenerate-draft-${draft.id}`}
                        >
                          {regenerateMutation.isPending && regenerateMutation.variables === draft.id ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-1" />
                          )}
                          Regenerate
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" disabled={libraryBlocks.length === 0} data-testid={`button-insert-library-${draft.id}`}>
                              <BookOpen className="h-4 w-4 mr-1" />
                              Insert from library
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            {libraryBlocks.map((block) => (
                              <DropdownMenuItem
                                key={block.id}
                                onClick={() => insertBlock(draft.id, draft.answer ?? "", block)}
                                data-testid={`menu-insert-block-${block.id}`}
                              >
                                {block.title}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyText(value, "Answer")}
                          data-testid={`button-copy-draft-${draft.id}`}
                        >
                          <Copy className="h-4 w-4 mr-1" />
                          Copy
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(draft.id)}
                          data-testid={`button-delete-draft-${draft.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={exportAll} disabled={drafts.length === 0} data-testid="button-export-drafts">
            <Download className="h-4 w-4 mr-2" />
            Export all as text
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close-workspace">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Answer Library tab
// ============================================================================

export function GrantAnswerLibraryTab() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("other");
  const [newContent, setNewContent] = useState("");

  const { data, isLoading } = useQuery<{ blocks: GrantAnswerLibraryBlock[] }>({
    queryKey: ["/api/grants/answer-library"],
  });
  const blocks = data?.blocks || [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/grants/answer-library"] });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/grants/answer-library/seed");
      return res.json();
    },
    onSuccess: (result: any) => {
      invalidate();
      toast({
        title: result.blocks?.length ? "Library seeded" : "Nothing to seed",
        description: result.blocks?.length
          ? `${result.blocks.length} starter block${result.blocks.length === 1 ? "" : "s"} drafted from your organization's data. Review and edit them.`
          : result.message || "Your library already has the standard categories.",
      });
    },
    onError: (error: Error) =>
      toast({ title: "Could not seed library", description: error.message, variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/grants/answer-library", {
        title: newTitle.trim(),
        category: newCategory,
        content: newContent,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setAddOpen(false);
      setNewTitle("");
      setNewCategory("other");
      setNewContent("");
      toast({ title: "Block added" });
    },
    onError: (error: Error) =>
      toast({ title: "Could not add block", description: error.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, title, content }: { id: string; title: string; content: string }) => {
      const res = await apiRequest("PATCH", `/api/grants/answer-library/${id}`, { title, content });
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      toast({ title: "Block saved" });
    },
    onError: (error: Error) =>
      toast({ title: "Could not save block", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/grants/answer-library/${id}`),
    onSuccess: () => invalidate(),
    onError: (error: Error) =>
      toast({ title: "Could not delete block", description: error.message, variant: "destructive" }),
  });

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div>
          <h3 className="text-lg font-semibold">Answer Library</h3>
          <p className="text-sm text-muted-foreground">
            Reusable boilerplate blocks you can insert into any application draft in one click.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            data-testid="button-seed-library"
          >
            {seedMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {seedMutation.isPending ? "Drafting starter blocks..." : "Seed with AI"}
          </Button>
          <Button onClick={() => setAddOpen(true)} data-testid="button-add-library-block">
            <Plus className="h-4 w-4 mr-2" />
            Add Block
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : blocks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground" />
            <p className="text-lg font-medium">No library blocks yet</p>
            <p className="text-sm text-muted-foreground">
              Click "Seed with AI" to draft starter blocks (org history, programs, financials, contact info) from your real data.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {blocks.map((block) => (
            <Card key={block.id} data-testid={`card-library-block-${block.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base" data-testid={`text-block-title-${block.id}`}>{block.title}</CardTitle>
                  <div className="flex items-center gap-1 flex-wrap">
                    <Badge variant="secondary">{libraryCategoryLabels[block.category] || block.category}</Badge>
                    {block.aiSeeded && <Badge variant="outline">AI seeded</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {editingId === block.id ? (
                  <>
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} data-testid={`input-edit-block-title-${block.id}`} />
                    <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={8} data-testid={`input-edit-block-content-${block.id}`} />
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm"
                        disabled={updateMutation.isPending || !editTitle.trim()}
                        onClick={() => updateMutation.mutate({ id: block.id, title: editTitle, content: editContent })}
                        data-testid={`button-save-block-${block.id}`}
                      >
                        {updateMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)} data-testid={`button-cancel-edit-block-${block.id}`}>
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm whitespace-pre-wrap line-clamp-6" data-testid={`text-block-content-${block.id}`}>{block.content}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingId(block.id);
                          setEditTitle(block.title);
                          setEditContent(block.content);
                        }}
                        data-testid={`button-edit-block-${block.id}`}
                      >
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => copyText(block.content)} data-testid={`button-copy-block-${block.id}`}>
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Delete this library block?")) deleteMutation.mutate(block.id);
                        }}
                        data-testid={`button-delete-block-${block.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Library Block</DialogTitle>
            <DialogDescription>Save a reusable piece of boilerplate for grant applications.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Title</Label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g., Board of Directors Overview" data-testid="input-new-block-title" />
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger data-testid="select-new-block-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(libraryCategoryLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Content</Label>
              <Textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} rows={8} data-testid="input-new-block-content" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} data-testid="button-cancel-new-block">Cancel</Button>
            <Button
              disabled={!newTitle.trim() || !newContent.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              data-testid="button-submit-new-block"
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Add Block
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// Find Grants tab — AI funder suggestions
// ============================================================================

type Suggestion = {
  funderName: string;
  programName: string;
  rationale: string;
  programArea: string;
  searchQuery: string;
};

export function GrantFindGrantsTab({ canAddToPipeline }: { canAddToPipeline: boolean }) {
  const { toast } = useToast();
  const [lookingFor, setLookingFor] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());

  const suggestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/grants/suggestions", {
        lookingFor: lookingFor.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: (result: any) => {
      setSuggestions(result.suggestions || []);
      setAddedKeys(new Set());
    },
    onError: (error: Error) =>
      toast({ title: "Could not get suggestions", description: error.message, variant: "destructive" }),
  });

  const addMutation = useMutation({
    mutationFn: async (s: Suggestion) => {
      const res = await apiRequest("POST", "/api/grants", {
        funderName: s.funderName,
        programName: s.programName,
        status: "researching",
        programArea: s.programArea,
        notes: `AI suggestion — verify details on the funder's site.\nWhy suggested: ${s.rationale}`,
      });
      return res.json();
    },
    onSuccess: (_result, s) => {
      queryClient.invalidateQueries({ queryKey: ["/api/grants"] });
      setAddedKeys((prev) => new Set(prev).add(`${s.funderName}|${s.programName}`));
      toast({ title: "Added to pipeline", description: `${s.funderName} added as a Researching opportunity.` });
    },
    onError: (error: Error) =>
      toast({ title: "Could not add to pipeline", description: error.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Find Grants</h3>
        <p className="text-sm text-muted-foreground">
          The AI proposes likely funders from its knowledge of the animal-welfare grant landscape. It cannot browse funder sites — always verify details before applying.
        </p>
      </div>

      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="space-y-1">
            <Label>What are you looking for? (optional)</Label>
            <Input
              value={lookingFor}
              onChange={(e) => setLookingFor(e.target.value)}
              placeholder='e.g., "spay/neuter funding in the Southeast" — or just click Suggest'
              data-testid="input-looking-for"
            />
          </div>
          <Button onClick={() => suggestMutation.mutate()} disabled={suggestMutation.isPending} data-testid="button-suggest-grants">
            {suggestMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {suggestMutation.isPending ? "Finding matches..." : "Suggest funders"}
          </Button>
        </CardContent>
      </Card>

      {suggestions.length > 0 && (
        <div className="space-y-3">
          {suggestions.map((s, i) => {
            const key = `${s.funderName}|${s.programName}`;
            const added = addedKeys.has(key);
            return (
              <Card key={`${key}-${i}`} data-testid={`card-suggestion-${i}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <CardTitle className="text-base" data-testid={`text-suggestion-funder-${i}`}>{s.funderName}</CardTitle>
                      <CardDescription>{s.programName}</CardDescription>
                    </div>
                    <Badge variant="outline" className="whitespace-nowrap">
                      AI suggestion — verify details on the funder's site
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm" data-testid={`text-suggestion-rationale-${i}`}>{s.rationale}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(s.searchQuery)}`, "_blank", "noopener")}
                      data-testid={`button-verify-suggestion-${i}`}
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Search to verify
                    </Button>
                    {canAddToPipeline && (
                      <Button
                        size="sm"
                        disabled={added || addMutation.isPending}
                        onClick={() => addMutation.mutate(s)}
                        data-testid={`button-add-suggestion-${i}`}
                      >
                        {added ? <Check className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                        {added ? "Added" : "Add to pipeline"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
