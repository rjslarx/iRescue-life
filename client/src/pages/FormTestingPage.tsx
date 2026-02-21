import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileSignature, Eye, ExternalLink, ScrollText } from "lucide-react";
import DOMPurify from "dompurify";

export default function FormTestingPage() {
  const [previewForm, setPreviewForm] = useState<any>(null);
  const [previewType, setPreviewType] = useState<"form" | "contract">("form");

  const { data: formsData, isLoading: formsLoading } = useQuery<{ forms: any[] }>({
    queryKey: ['/api/custom-forms'],
  });

  const { data: contractsData, isLoading: contractsLoading } = useQuery<{ templates: any[] }>({
    queryKey: ['/api/contract-templates'],
  });

  const forms = formsData?.forms || [];
  const contracts = contractsData?.templates || [];

  const handlePreview = (item: any, type: "form" | "contract") => {
    setPreviewForm(item);
    setPreviewType(type);
  };

  return (
    <DashboardLayout
      title="Form & Contract Testing"
      description="Preview and test all your forms and contract templates in one place"
    >
      <div className="container mx-auto p-6">
        <Tabs defaultValue="forms" className="space-y-6">
          <TabsList>
            <TabsTrigger value="forms" data-testid="tab-forms">
              <FileSignature className="w-4 h-4 mr-2" />
              Custom Forms ({forms.length})
            </TabsTrigger>
            <TabsTrigger value="contracts" data-testid="tab-contracts">
              <ScrollText className="w-4 h-4 mr-2" />
              Contract Templates ({contracts.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="forms" className="space-y-4">
            {formsLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <Card key={i}><CardHeader><Skeleton className="h-6 w-1/3" /><Skeleton className="h-4 w-1/2" /></CardHeader></Card>)}
              </div>
            ) : forms.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <FileSignature className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No custom forms yet</h3>
                  <p className="text-sm text-muted-foreground">Create custom forms in the Documents section to see them here.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {forms.map((form: any) => (
                  <Card key={form.id} data-testid={`form-card-${form.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <CardTitle className="text-base">{form.name}</CardTitle>
                            <Badge variant={form.isActive ? "default" : "secondary"}>
                              {form.isActive ? "Active" : "Inactive"}
                            </Badge>
                            <Badge variant="outline">{form.formType === 'animal_specific' ? 'Animal-Specific' : 'Standalone'}</Badge>
                            {form.isPublic && <Badge variant="outline">Public</Badge>}
                            {form.requiresSignature && <Badge variant="outline">Signature Required</Badge>}
                          </div>
                          {form.description && (
                            <CardDescription>{form.description}</CardDescription>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePreview(form, "form")}
                            data-testid={`button-preview-form-${form.id}`}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            Preview
                          </Button>
                          {form.isPublic && form.publicSlug && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(`/forms/${form.publicSlug}`, '_blank')}
                              data-testid={`button-open-form-${form.id}`}
                            >
                              <ExternalLink className="w-4 h-4 mr-2" />
                              Open Public Link
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="contracts" className="space-y-4">
            {contractsLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <Card key={i}><CardHeader><Skeleton className="h-6 w-1/3" /><Skeleton className="h-4 w-1/2" /></CardHeader></Card>)}
              </div>
            ) : contracts.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <ScrollText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No contract templates yet</h3>
                  <p className="text-sm text-muted-foreground">Create contract templates in the Documents section to see them here.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {contracts.map((template: any) => (
                  <Card key={template.id} data-testid={`contract-card-${template.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <CardTitle className="text-base">{template.name}</CardTitle>
                            <Badge variant={template.isActive ? "default" : "secondary"}>
                              {template.isActive ? "Active" : "Inactive"}
                            </Badge>
                            {template.isDefault && <Badge variant="outline">Default</Badge>}
                            <Badge variant="outline">v{template.version}</Badge>
                            <Badge variant="outline">{template.type === 'foster' ? 'Foster' : 'Adoption'}</Badge>
                          </div>
                          {template.description && (
                            <CardDescription>{template.description}</CardDescription>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePreview(template, "contract")}
                            data-testid={`button-preview-contract-${template.id}`}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            Preview
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={!!previewForm} onOpenChange={(open) => !open && setPreviewForm(null)}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {previewType === 'form' ? <FileSignature className="h-5 w-5" /> : <ScrollText className="h-5 w-5" />}
                {previewForm?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto">
              {previewForm?.htmlTemplate ? (
                <div className="space-y-4">
                  <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
                    This is a preview of the template. Merge fields like {"{{signer_name}}"}, {"{{animal_name}}"}, etc. will be replaced with actual data when sent to signers.
                  </div>
                  <div 
                    className="prose prose-sm max-w-none dark:prose-invert border rounded-lg p-6"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewForm.htmlTemplate, {
                      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
                                     'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 
                                     'div', 'span', 'blockquote', 'hr', 'a', 'img', 'input', 'label', 'textarea', 'select', 'option'],
                      ALLOWED_ATTR: ['class', 'style', 'href', 'target', 'rel', 'src', 'alt', 'type', 'placeholder', 'name', 'value', 'checked', 'disabled', 'readonly'],
                    }) }}
                    data-testid="form-preview-content"
                  />
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No template content available</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}