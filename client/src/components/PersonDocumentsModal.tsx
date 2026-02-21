import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { buildTenantUrl, getTenantHeaders } from "@/lib/tenantApi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  Download,
  Upload,
  Trash2,
  Loader2,
  File,
  ClipboardList,
  FileCheck,
  Eye,
  ExternalLink,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface PersonDocument {
  id: string;
  title: string;
  description?: string;
  documentType: string;
  documentSubtype?: string;
  objectPath?: string;
  fileName?: string;
  fileSize?: number;
  createdAt: string;
}

interface RelatedApplication {
  id: string;
  type: string;
  title: string;
  applicantName: string;
  applicantEmail: string;
  status: string;
  createdAt: string;
}

interface PersonDocumentsData {
  documents: PersonDocument[];
  relatedApplications: RelatedApplication[];
}

interface PersonDocumentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  personType: "foster" | "volunteer" | "contact" | "user";
  personId: string;
  personName: string;
}

export function PersonDocumentsModal({
  isOpen,
  onClose,
  personType,
  personId,
  personName,
}: PersonDocumentsModalProps) {
  const { toast } = useToast();
  const { tenant } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { data, isLoading, refetch } = useQuery<PersonDocumentsData>({
    queryKey: ["/api/person-documents", personType, personId],
    queryFn: async () => {
      const url = buildTenantUrl(`/api/person-documents/${personType}/${personId}`);
      const response = await fetch(url, {
        credentials: "include",
        headers: getTenantHeaders(),
      });
      if (!response.ok) throw new Error("Failed to fetch documents");
      return response.json();
    },
    enabled: isOpen && !!personId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (documentId: string) => {
      return apiRequest("DELETE", `/api/person-documents/${documentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/person-documents", personType, personId] });
      toast({ title: "Document deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete document", variant: "destructive" });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!uploadTitle) {
        setUploadTitle(file.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !uploadTitle) {
      toast({ title: "Please select a file and enter a title", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const uploadUrlResponse = await fetch(
        buildTenantUrl(`/api/person-documents/upload-url?contentType=${encodeURIComponent(selectedFile.type)}`),
        { credentials: "include", headers: getTenantHeaders() }
      );
      if (!uploadUrlResponse.ok) throw new Error("Failed to get upload URL");
      const { uploadUrl, objectPath } = await uploadUrlResponse.json();

      await fetch(uploadUrl, {
        method: "PUT",
        body: selectedFile,
        headers: { "Content-Type": selectedFile.type },
      });

      await apiRequest("POST", "/api/person-documents", {
        personType,
        personId,
        personEmail: null,
        documentType: "uploaded",
        documentSubtype: "other",
        title: uploadTitle,
        description: uploadDescription || null,
        objectPath,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        contentType: selectedFile.type,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/person-documents", personType, personId] });
      toast({ title: "Document uploaded successfully" });
      setSelectedFile(null);
      setUploadTitle("");
      setUploadDescription("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      toast({ title: "Failed to upload document", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleViewApplication = async (appType: string, appId: string) => {
    try {
      const response = await fetch(`/api/applications/${appType.replace("_application", "")}/${appId}/pdf?view=inline`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to generate PDF");
      const { downloadUrl } = await response.json();
      // Open in new tab for inline viewing
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast({ title: "Failed to view application", variant: "destructive" });
    }
  };

  const handleViewDocument = async (doc: PersonDocument) => {
    if (!doc.objectPath) return;
    try {
      const params = new URLSearchParams({ disposition: 'inline' });
      if (/^(ac|pa|fa|sa|vw)-/.test(doc.id)) {
        params.set('objectPath', doc.objectPath);
      }
      const response = await fetch(buildTenantUrl(`/api/person-documents/${doc.id}/signed-url?${params.toString()}`), {
        credentials: "include",
        headers: getTenantHeaders(),
      });
      if (!response.ok) throw new Error("Failed to get document URL");
      const { signedUrl } = await response.json();
      // Open in new tab for inline viewing
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast({ title: "Failed to view document", variant: "destructive" });
    }
  };

  const handleDownloadDocument = async (doc: PersonDocument) => {
    if (!doc.objectPath) return;
    try {
      const params = new URLSearchParams({ disposition: 'attachment' });
      if (/^(ac|pa|fa|sa|vw)-/.test(doc.id)) {
        params.set('objectPath', doc.objectPath);
      }
      const response = await fetch(buildTenantUrl(`/api/person-documents/${doc.id}/signed-url?${params.toString()}`), {
        credentials: "include",
        headers: getTenantHeaders(),
      });
      if (!response.ok) throw new Error("Failed to get document URL");
      const { signedUrl } = await response.json();
      // Create download link
      const a = document.createElement("a");
      a.href = signedUrl;
      a.download = doc.fileName || "document";
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      toast({ title: "Failed to download document", variant: "destructive" });
    }
  };

  const isViewableFile = (fileName?: string) => {
    if (!fileName) return false;
    const ext = fileName.toLowerCase().split('.').pop();
    return ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'txt'].includes(ext || '');
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "approved":
      case "active":
        return "default";
      case "pending":
        return "secondary";
      case "rejected":
        return "destructive";
      default:
        return "outline";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Documents for {personName}
          </DialogTitle>
          <DialogDescription>
            View applications, agreements, and uploaded documents associated with this person.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {data?.relatedApplications && data.relatedApplications.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Applications
                </h3>
                <div className="space-y-2">
                  {data.relatedApplications.map((app) => (
                    <div
                      key={app.id}
                      data-testid={`application-item-${app.id}`}
                      className="flex items-center justify-between p-3 border rounded-md bg-muted/30"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{app.title}</span>
                          <Badge variant={getStatusBadgeVariant(app.status)} className="text-xs">
                            {app.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDate(app.createdAt)}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        data-testid={`view-application-${app.id}`}
                        onClick={() => handleViewApplication(app.type, app.id)}
                        title="View application"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(() => {
              const agreements = data?.documents?.filter(d => d.documentType === 'agreement') || [];
              const uploadedDocs = data?.documents?.filter(d => d.documentType !== 'agreement') || [];
              return (
                <>
                  {agreements.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                        <FileCheck className="h-4 w-4" />
                        Agreements
                      </h3>
                      <div className="space-y-2">
                        {agreements.map((doc) => (
                          <div
                            key={doc.id}
                            data-testid={`agreement-item-${doc.id}`}
                            className="flex items-center justify-between p-3 border rounded-md bg-muted/30"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium text-sm">{doc.title}</span>
                                <Badge variant="default" className="text-xs">Signed</Badge>
                              </div>
                              {doc.description && (
                                <p className="text-xs text-muted-foreground mt-1 truncate">
                                  {doc.description}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {formatDate(doc.createdAt)}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              {doc.objectPath && (
                                <>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    data-testid={`view-agreement-${doc.id}`}
                                    onClick={() => handleViewDocument(doc)}
                                    title="View agreement"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    data-testid={`download-agreement-${doc.id}`}
                                    onClick={() => handleDownloadDocument(doc)}
                                    title="Download agreement"
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {uploadedDocs.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                        <File className="h-4 w-4" />
                        Uploaded Documents
                      </h3>
                      <div className="space-y-2">
                        {uploadedDocs.map((doc) => (
                          <div
                            key={doc.id}
                            data-testid={`document-item-${doc.id}`}
                            className="flex items-center justify-between p-3 border rounded-md bg-muted/30"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <File className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium text-sm">{doc.title}</span>
                              </div>
                              {doc.description && (
                                <p className="text-xs text-muted-foreground mt-1 truncate">
                                  {doc.description}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {formatDate(doc.createdAt)}
                                {doc.fileSize && ` • ${formatFileSize(doc.fileSize)}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              {isViewableFile(doc.fileName) && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  data-testid={`view-document-${doc.id}`}
                                  onClick={() => handleViewDocument(doc)}
                                  title="View document"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                data-testid={`download-document-${doc.id}`}
                                onClick={() => handleDownloadDocument(doc)}
                                title="Download document"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                data-testid={`delete-document-${doc.id}`}
                                onClick={() => deleteMutation.mutate(doc.id)}
                                disabled={deleteMutation.isPending}
                                title="Delete document"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            {(!data?.relatedApplications || data.relatedApplications.length === 0) &&
              (!data?.documents || data.documents.length === 0) && (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No documents found for this person.</p>
                </div>
              )}

            <div className="border-t pt-4">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Upload Document
              </h3>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="file-upload">File</Label>
                  <Input
                    id="file-upload"
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    data-testid="input-file-upload"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="upload-title">Title</Label>
                  <Input
                    id="upload-title"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="Document title"
                    data-testid="input-upload-title"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="upload-description">Description (optional)</Label>
                  <Textarea
                    id="upload-description"
                    value={uploadDescription}
                    onChange={(e) => setUploadDescription(e.target.value)}
                    placeholder="Brief description of the document"
                    data-testid="input-upload-description"
                    className="mt-1 resize-none"
                    rows={2}
                  />
                </div>
                <Button
                  onClick={handleUpload}
                  disabled={isUploading || !selectedFile || !uploadTitle}
                  data-testid="button-upload-document"
                  className="w-full"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload Document
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
