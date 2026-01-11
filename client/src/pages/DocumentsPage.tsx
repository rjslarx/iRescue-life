import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { FileText, Upload, Download, Edit2, Trash2, Filter, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Document, Tenant } from "@shared/schema";
import DashboardLayout from "@/components/DashboardLayout";

type DocumentWithUploader = Document & { uploaderName: string | null };

const categoryLabels: Record<Document['category'], string> = {
  insurance: "Insurance",
  bylaws: "Bylaws",
  policies: "Policies",
  procedures: "Procedures",
  forms: "Forms",
  other: "Other",
};

const categoryColors: Record<Document['category'], string> = {
  insurance: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  bylaws: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  policies: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  procedures: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  forms: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<DocumentWithUploader | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  
  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant'],
  });

  const [uploadForm, setUploadForm] = useState({
    title: "",
    description: "",
    category: "other" as Document['category'],
  });

  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    category: "other" as Document['category'],
  });

  const isAdmin = user?.activeRole === 'admin';

  const { data, isLoading } = useQuery<{ documents: DocumentWithUploader[] }>({
    queryKey: ['/api/documents'],
  });

  const filteredDocuments = data?.documents.filter(doc => 
    selectedCategory === "all" || doc.category === selectedCategory
  ) || [];

  // Upload mutation - uses TenantFileStorage (supports Google Drive when connected)
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile) throw new Error("No file selected");

      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('title', uploadForm.title);
      formData.append('description', uploadForm.description || '');
      formData.append('category', uploadForm.category);

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload document');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      setUploadDialogOpen(false);
      setUploadFile(null);
      setUploadForm({ title: "", description: "", category: "other" });
      toast({
        title: "Success",
        description: "Document uploaded successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to upload document",
        variant: "destructive",
      });
    },
  });

  // Edit mutation
  const editMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDocument) throw new Error("No document selected");
      
      await apiRequest('PATCH', `/api/documents/${selectedDocument.id}`, {
        title: editForm.title,
        description: editForm.description || null,
        category: editForm.category,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      setEditDialogOpen(false);
      setSelectedDocument(null);
      toast({
        title: "Success",
        description: "Document updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update document",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/documents/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      setDeleteDialogOpen(false);
      setSelectedDocument(null);
      toast({
        title: "Success",
        description: "Document deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete document",
        variant: "destructive",
      });
    },
  });

  const handleUpload = () => {
    uploadMutation.mutate();
  };

  const handleEdit = (doc: DocumentWithUploader) => {
    setSelectedDocument(doc);
    setEditForm({
      title: doc.title,
      description: doc.description || "",
      category: doc.category,
    });
    setEditDialogOpen(true);
  };

  const handleDelete = (doc: DocumentWithUploader) => {
    setSelectedDocument(doc);
    setDeleteDialogOpen(true);
  };

  const handleDownload = async (doc: DocumentWithUploader) => {
    try {
      const response = await fetch(`/api/documents/${doc.id}/download`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to download document');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download document",
        variant: "destructive",
      });
    }
  };

  return (
    <DashboardLayout
      title="Documents"
      actions={isAdmin ? (
        <Button onClick={() => setUploadDialogOpen(true)} data-testid="button-upload-document">
          <Plus className="mr-2 h-4 w-4" />
          Upload Document
        </Button>
      ) : undefined}
    >
      <div className="flex-1 overflow-auto p-6">
            <div className="mb-6 flex items-center gap-4">
              <Filter className="h-5 w-5 text-muted-foreground" />
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-48" data-testid="select-category-filter">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="insurance">Insurance</SelectItem>
                  <SelectItem value="bylaws">Bylaws</SelectItem>
                  <SelectItem value="policies">Policies</SelectItem>
                  <SelectItem value="procedures">Procedures</SelectItem>
                  <SelectItem value="forms">Forms</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="text-center py-12">Loading documents...</div>
            ) : filteredDocuments.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    {selectedCategory === "all" 
                      ? "No documents uploaded yet" 
                      : `No ${categoryLabels[selectedCategory as Document['category']].toLowerCase()} documents`}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {filteredDocuments.map((doc) => (
                  <Card key={doc.id} data-testid={`card-document-${doc.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <CardTitle className="text-lg">{doc.title}</CardTitle>
                            <Badge className={categoryColors[doc.category]}>
                              {categoryLabels[doc.category]}
                            </Badge>
                          </div>
                          {doc.description && (
                            <CardDescription>{doc.description}</CardDescription>
                          )}
                          <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                            <span>{formatFileSize(doc.fileSize)}</span>
                            <span>•</span>
                            <span>{doc.fileName}</span>
                            <span>•</span>
                            <span>Uploaded by {doc.uploaderName || "Unknown"}</span>
                            <span>•</span>
                            <span>{formatDistanceToNow(new Date(doc.uploadedAt), { addSuffix: true })}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownload(doc)}
                            data-testid={`button-download-${doc.id}`}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </Button>
                          {isAdmin && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEdit(doc)}
                                data-testid={`button-edit-${doc.id}`}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDelete(doc)}
                                data-testid={`button-delete-${doc.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            )}
      </div>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent data-testid="dialog-upload-document">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>
              Upload a new document to the rescue's document library
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="file">File</Label>
              <Input
                id="file"
                type="file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setUploadFile(file);
                    if (!uploadForm.title) {
                      setUploadForm(prev => ({ ...prev, title: file.name }));
                    }
                  }
                }}
                data-testid="input-upload-file"
              />
            </div>
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={uploadForm.title}
                onChange={(e) => setUploadForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Document title"
                data-testid="input-upload-title"
              />
            </div>
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={uploadForm.description}
                onChange={(e) => setUploadForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of the document"
                data-testid="input-upload-description"
              />
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
              <Select
                value={uploadForm.category}
                onValueChange={(value) => setUploadForm(prev => ({ ...prev, category: value as Document['category'] }))}
              >
                <SelectTrigger data-testid="select-upload-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="insurance">Insurance</SelectItem>
                  <SelectItem value="bylaws">Bylaws</SelectItem>
                  <SelectItem value="policies">Policies</SelectItem>
                  <SelectItem value="procedures">Procedures</SelectItem>
                  <SelectItem value="forms">Forms</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!uploadFile || !uploadForm.title || uploadMutation.isPending}
              data-testid="button-confirm-upload"
            >
              {uploadMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent data-testid="dialog-edit-document">
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
            <DialogDescription>
              Update document details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                data-testid="input-edit-title"
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Description (optional)</Label>
              <Textarea
                id="edit-description"
                value={editForm.description}
                onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                data-testid="input-edit-description"
              />
            </div>
            <div>
              <Label htmlFor="edit-category">Category</Label>
              <Select
                value={editForm.category}
                onValueChange={(value) => setEditForm(prev => ({ ...prev, category: value as Document['category'] }))}
              >
                <SelectTrigger data-testid="select-edit-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="insurance">Insurance</SelectItem>
                  <SelectItem value="bylaws">Bylaws</SelectItem>
                  <SelectItem value="policies">Policies</SelectItem>
                  <SelectItem value="procedures">Procedures</SelectItem>
                  <SelectItem value="forms">Forms</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => editMutation.mutate()}
              disabled={!editForm.title || editMutation.isPending}
              data-testid="button-confirm-edit"
            >
              {editMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent data-testid="dialog-delete-document">
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedDocument?.title}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedDocument && deleteMutation.mutate(selectedDocument.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
