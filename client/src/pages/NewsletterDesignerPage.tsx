import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { 
  Copy, 
  ExternalLink, 
  Eye, 
  Palette, 
  Type, 
  Image as ImageIcon, 
  Square, 
  Plus, 
  Trash2, 
  MoveUp, 
  MoveDown,
  AlertCircle,
  CheckCircle2,
  Mail
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

interface ContentBlock {
  id: string;
  type: "text" | "heading" | "image" | "button" | "divider" | "spacer";
  content: string;
  settings: {
    align?: "left" | "center" | "right";
    color?: string;
    backgroundColor?: string;
    fontSize?: string;
    buttonUrl?: string;
    imageAlt?: string;
    height?: string;
  };
}

const defaultBlocks: ContentBlock[] = [
  {
    id: "1",
    type: "heading",
    content: "Your Newsletter Title",
    settings: { align: "center", color: "#333333", fontSize: "28px" }
  },
  {
    id: "2",
    type: "text",
    content: "Welcome to our newsletter! We're excited to share the latest updates with you.",
    settings: { align: "left", color: "#666666", fontSize: "16px" }
  }
];

export default function NewsletterDesignerPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const previewRef = useRef<HTMLIFrameElement>(null);
  
  const [activeTab, setActiveTab] = useState<"design" | "preview">("design");
  const [copied, setCopied] = useState(false);
  
  const [emailSettings, setEmailSettings] = useState({
    backgroundColor: "#f4f4f4",
    contentBackgroundColor: "#ffffff",
    headerColor: "#4F46E5",
    footerText: "Sent with love from our rescue team",
    preheaderText: "",
    width: "600"
  });
  
  const [blocks, setBlocks] = useState<ContentBlock[]>(defaultBlocks);

  if (!user || user.activeRole !== 'admin') {
    return (
      <DashboardLayout title="Access Denied" description="">
        <div className="flex-1 overflow-auto p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Access Denied: Newsletter designer is only available to administrators.
            </AlertDescription>
          </Alert>
        </div>
      </DashboardLayout>
    );
  }

  const generateBlockHtml = (block: ContentBlock): string => {
    const align = block.settings.align || "left";
    const color = block.settings.color || "#333333";
    const fontSize = block.settings.fontSize || "16px";
    
    switch (block.type) {
      case "heading":
        return `
          <tr>
            <td style="padding: 20px 30px;">
              <h1 style="margin: 0; font-family: Arial, sans-serif; font-size: ${fontSize}; color: ${color}; text-align: ${align}; font-weight: bold;">
                ${block.content}
              </h1>
            </td>
          </tr>`;
      
      case "text":
        return `
          <tr>
            <td style="padding: 10px 30px;">
              <p style="margin: 0; font-family: Arial, sans-serif; font-size: ${fontSize}; color: ${color}; text-align: ${align}; line-height: 1.6;">
                ${block.content.replace(/\n/g, '<br>')}
              </p>
            </td>
          </tr>`;
      
      case "image":
        return `
          <tr>
            <td style="padding: 20px 30px; text-align: ${align};">
              <img src="${block.content || 'https://via.placeholder.com/560x300?text=Your+Image+Here'}" 
                   alt="${block.settings.imageAlt || 'Newsletter image'}" 
                   style="max-width: 100%; height: auto; display: inline-block; border-radius: 8px;" />
            </td>
          </tr>`;
      
      case "button":
        const bgColor = block.settings.backgroundColor || "#4F46E5";
        return `
          <tr>
            <td style="padding: 20px 30px; text-align: ${align};">
              <a href="${block.settings.buttonUrl || '#'}" 
                 style="display: inline-block; padding: 14px 32px; background-color: ${bgColor}; color: #ffffff; text-decoration: none; font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; border-radius: 6px;">
                ${block.content}
              </a>
            </td>
          </tr>`;
      
      case "divider":
        return `
          <tr>
            <td style="padding: 20px 30px;">
              <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 0;" />
            </td>
          </tr>`;
      
      case "spacer":
        const height = block.settings.height || "30px";
        return `
          <tr>
            <td style="height: ${height};"></td>
          </tr>`;
      
      default:
        return "";
    }
  };

  const generateFullHtml = (): string => {
    const blocksHtml = blocks.map(generateBlockHtml).join("\n");
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Newsletter</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: ${emailSettings.backgroundColor}; font-family: Arial, sans-serif;">
  ${emailSettings.preheaderText ? `<div style="display: none; max-height: 0; overflow: hidden;">${emailSettings.preheaderText}</div>` : ''}
  
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${emailSettings.backgroundColor};">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="${emailSettings.width}" align="center" style="max-width: ${emailSettings.width}px; background-color: ${emailSettings.contentBackgroundColor}; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          
          <!-- Header Bar -->
          <tr>
            <td style="background-color: ${emailSettings.headerColor}; padding: 20px 30px; border-radius: 8px 8px 0 0;">
              <p style="margin: 0; color: #ffffff; font-family: Arial, sans-serif; font-size: 14px; text-align: center;">
                Newsletter
              </p>
            </td>
          </tr>
          
          <!-- Content Blocks -->
          ${blocksHtml}
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px; background-color: #f9fafb; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; font-family: Arial, sans-serif; font-size: 14px; color: #9ca3af; text-align: center;">
                ${emailSettings.footerText}
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  };

  const addBlock = (type: ContentBlock["type"]) => {
    const newBlock: ContentBlock = {
      id: Date.now().toString(),
      type,
      content: type === "heading" ? "New Heading" 
             : type === "text" ? "Enter your text here..." 
             : type === "button" ? "Click Here"
             : type === "image" ? ""
             : "",
      settings: {
        align: "center",
        color: "#333333",
        fontSize: type === "heading" ? "24px" : "16px",
        backgroundColor: "#4F46E5",
        buttonUrl: "#",
        height: "30px"
      }
    };
    setBlocks([...blocks, newBlock]);
  };

  const updateBlock = (id: string, updates: Partial<ContentBlock>) => {
    setBlocks(blocks.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  const deleteBlock = (id: string) => {
    setBlocks(blocks.filter(b => b.id !== id));
  };

  const moveBlock = (id: string, direction: "up" | "down") => {
    const index = blocks.findIndex(b => b.id === id);
    if (index === -1) return;
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === blocks.length - 1) return;
    
    const newBlocks = [...blocks];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    [newBlocks[index], newBlocks[swapIndex]] = [newBlocks[swapIndex], newBlocks[index]];
    setBlocks(newBlocks);
  };

  const copyToClipboard = async () => {
    const html = generateFullHtml();
    try {
      // Copy as rich HTML so Gmail renders it properly (not as code)
      const blob = new Blob([html], { type: 'text/html' });
      const clipboardItem = new ClipboardItem({
        'text/html': blob,
        'text/plain': new Blob([html], { type: 'text/plain' }) // Fallback for apps that don't support HTML
      });
      await navigator.clipboard.write([clipboardItem]);
      setCopied(true);
      toast({
        title: "Copied to clipboard!",
        description: "Paste into Gmail with Ctrl+V (or Cmd+V on Mac) to see the formatted email.",
      });
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      // Fallback to text copy if ClipboardItem is not supported
      try {
        await navigator.clipboard.writeText(html);
        setCopied(true);
        toast({
          title: "Copied as text",
          description: "Your browser doesn't support rich copy. The HTML code has been copied.",
        });
        setTimeout(() => setCopied(false), 3000);
      } catch (fallbackErr) {
        toast({
          title: "Failed to copy",
          description: "Please try selecting and copying manually.",
          variant: "destructive"
        });
      }
    }
  };

  const openGmailCompose = () => {
    window.open("https://mail.google.com/mail/u/0/#compose", "_blank");
  };

  const renderBlockEditor = (block: ContentBlock) => {
    return (
      <Card key={block.id} className="mb-3" data-testid={`block-${block.id}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {block.type === "heading" && <Type className="w-4 h-4 text-muted-foreground" />}
              {block.type === "text" && <Type className="w-4 h-4 text-muted-foreground" />}
              {block.type === "image" && <ImageIcon className="w-4 h-4 text-muted-foreground" />}
              {block.type === "button" && <Square className="w-4 h-4 text-muted-foreground" />}
              {block.type === "divider" && <Separator className="w-4" />}
              {block.type === "spacer" && <div className="w-4 h-4 border border-dashed border-muted-foreground" />}
              <span className="text-sm font-medium capitalize">{block.type}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveBlock(block.id, "up")} data-testid={`btn-move-up-${block.id}`}>
                <MoveUp className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveBlock(block.id, "down")} data-testid={`btn-move-down-${block.id}`}>
                <MoveDown className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteBlock(block.id)} data-testid={`btn-delete-${block.id}`}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {(block.type === "heading" || block.type === "text") && (
            <div className="space-y-3">
              {block.type === "heading" ? (
                <Input
                  value={block.content}
                  onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                  placeholder="Heading text"
                  data-testid={`input-content-${block.id}`}
                />
              ) : (
                <Textarea
                  value={block.content}
                  onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                  placeholder="Enter text content..."
                  rows={3}
                  data-testid={`textarea-content-${block.id}`}
                />
              )}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Align</Label>
                  <Select
                    value={block.settings.align}
                    onValueChange={(v) => updateBlock(block.id, { settings: { ...block.settings, align: v as any } })}
                  >
                    <SelectTrigger className="h-8" data-testid={`select-align-${block.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Left</SelectItem>
                      <SelectItem value="center">Center</SelectItem>
                      <SelectItem value="right">Right</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Color</Label>
                  <Input
                    type="color"
                    value={block.settings.color}
                    onChange={(e) => updateBlock(block.id, { settings: { ...block.settings, color: e.target.value } })}
                    className="h-8 p-1"
                    data-testid={`input-color-${block.id}`}
                  />
                </div>
                <div>
                  <Label className="text-xs">Size</Label>
                  <Select
                    value={block.settings.fontSize}
                    onValueChange={(v) => updateBlock(block.id, { settings: { ...block.settings, fontSize: v } })}
                  >
                    <SelectTrigger className="h-8" data-testid={`select-size-${block.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="14px">Small</SelectItem>
                      <SelectItem value="16px">Normal</SelectItem>
                      <SelectItem value="18px">Large</SelectItem>
                      <SelectItem value="24px">XL</SelectItem>
                      <SelectItem value="28px">XXL</SelectItem>
                      <SelectItem value="32px">Huge</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {block.type === "image" && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Image URL</Label>
                <Input
                  value={block.content}
                  onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                  placeholder="https://example.com/image.jpg"
                  data-testid={`input-image-url-${block.id}`}
                />
              </div>
              <div>
                <Label className="text-xs">Alt Text</Label>
                <Input
                  value={block.settings.imageAlt || ""}
                  onChange={(e) => updateBlock(block.id, { settings: { ...block.settings, imageAlt: e.target.value } })}
                  placeholder="Describe the image"
                  data-testid={`input-image-alt-${block.id}`}
                />
              </div>
              <div>
                <Label className="text-xs">Align</Label>
                <Select
                  value={block.settings.align}
                  onValueChange={(v) => updateBlock(block.id, { settings: { ...block.settings, align: v as any } })}
                >
                  <SelectTrigger className="h-8" data-testid={`select-image-align-${block.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {block.type === "button" && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Button Text</Label>
                <Input
                  value={block.content}
                  onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                  placeholder="Click Here"
                  data-testid={`input-button-text-${block.id}`}
                />
              </div>
              <div>
                <Label className="text-xs">Button URL</Label>
                <Input
                  value={block.settings.buttonUrl || ""}
                  onChange={(e) => updateBlock(block.id, { settings: { ...block.settings, buttonUrl: e.target.value } })}
                  placeholder="https://example.com"
                  data-testid={`input-button-url-${block.id}`}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Align</Label>
                  <Select
                    value={block.settings.align}
                    onValueChange={(v) => updateBlock(block.id, { settings: { ...block.settings, align: v as any } })}
                  >
                    <SelectTrigger className="h-8" data-testid={`select-button-align-${block.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Left</SelectItem>
                      <SelectItem value="center">Center</SelectItem>
                      <SelectItem value="right">Right</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Button Color</Label>
                  <Input
                    type="color"
                    value={block.settings.backgroundColor}
                    onChange={(e) => updateBlock(block.id, { settings: { ...block.settings, backgroundColor: e.target.value } })}
                    className="h-8 p-1"
                    data-testid={`input-button-color-${block.id}`}
                  />
                </div>
              </div>
            </div>
          )}

          {block.type === "spacer" && (
            <div>
              <Label className="text-xs">Height</Label>
              <Select
                value={block.settings.height}
                onValueChange={(v) => updateBlock(block.id, { settings: { ...block.settings, height: v } })}
              >
                <SelectTrigger className="h-8" data-testid={`select-spacer-height-${block.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10px">Small (10px)</SelectItem>
                  <SelectItem value="20px">Medium (20px)</SelectItem>
                  <SelectItem value="30px">Large (30px)</SelectItem>
                  <SelectItem value="50px">XL (50px)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <DashboardLayout
      title="Newsletter Designer"
      description="Design beautiful HTML newsletters and copy them to Gmail"
    >
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto">
          
          {/* Action Buttons - Always visible */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Mail className="w-5 h-5 text-primary" />
                  <span className="font-medium">Ready to send?</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button 
                    size="lg" 
                    onClick={copyToClipboard}
                    className="gap-2"
                    data-testid="btn-copy-html"
                  >
                    {copied ? <CheckCircle2 className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    {copied ? "Copied!" : "Copy HTML to Clipboard"}
                  </Button>
                  <Button 
                    size="lg" 
                    variant="outline"
                    onClick={openGmailCompose}
                    className="gap-2"
                    data-testid="btn-open-gmail"
                  >
                    <ExternalLink className="w-5 h-5" />
                    Open Gmail Compose
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid lg:grid-cols-2 gap-6">
            
            {/* Design Panel */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Palette className="w-5 h-5" />
                    Email Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm">Background Color</Label>
                      <div className="flex gap-2 mt-1">
                        <Input
                          type="color"
                          value={emailSettings.backgroundColor}
                          onChange={(e) => setEmailSettings({ ...emailSettings, backgroundColor: e.target.value })}
                          className="w-12 h-9 p-1"
                          data-testid="input-bg-color"
                        />
                        <Input
                          value={emailSettings.backgroundColor}
                          onChange={(e) => setEmailSettings({ ...emailSettings, backgroundColor: e.target.value })}
                          className="flex-1"
                          data-testid="input-bg-color-text"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm">Content Background</Label>
                      <div className="flex gap-2 mt-1">
                        <Input
                          type="color"
                          value={emailSettings.contentBackgroundColor}
                          onChange={(e) => setEmailSettings({ ...emailSettings, contentBackgroundColor: e.target.value })}
                          className="w-12 h-9 p-1"
                          data-testid="input-content-bg-color"
                        />
                        <Input
                          value={emailSettings.contentBackgroundColor}
                          onChange={(e) => setEmailSettings({ ...emailSettings, contentBackgroundColor: e.target.value })}
                          className="flex-1"
                          data-testid="input-content-bg-color-text"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm">Header Bar Color</Label>
                      <div className="flex gap-2 mt-1">
                        <Input
                          type="color"
                          value={emailSettings.headerColor}
                          onChange={(e) => setEmailSettings({ ...emailSettings, headerColor: e.target.value })}
                          className="w-12 h-9 p-1"
                          data-testid="input-header-color"
                        />
                        <Input
                          value={emailSettings.headerColor}
                          onChange={(e) => setEmailSettings({ ...emailSettings, headerColor: e.target.value })}
                          className="flex-1"
                          data-testid="input-header-color-text"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm">Email Width (px)</Label>
                      <Input
                        type="number"
                        value={emailSettings.width}
                        onChange={(e) => setEmailSettings({ ...emailSettings, width: e.target.value })}
                        min="400"
                        max="800"
                        className="mt-1"
                        data-testid="input-email-width"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm">Preheader Text (shown in inbox preview)</Label>
                    <Input
                      value={emailSettings.preheaderText}
                      onChange={(e) => setEmailSettings({ ...emailSettings, preheaderText: e.target.value })}
                      placeholder="Brief preview text shown in email clients..."
                      className="mt-1"
                      data-testid="input-preheader"
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Footer Text</Label>
                    <Input
                      value={emailSettings.footerText}
                      onChange={(e) => setEmailSettings({ ...emailSettings, footerText: e.target.value })}
                      placeholder="Footer message..."
                      className="mt-1"
                      data-testid="input-footer"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Content Blocks</CardTitle>
                  <CardDescription>Add and arrange content blocks for your newsletter</CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Add Block Buttons */}
                  <div className="flex flex-wrap gap-2 mb-4 p-3 bg-muted/50 rounded-lg">
                    <Button variant="outline" size="sm" onClick={() => addBlock("heading")} className="gap-1" data-testid="btn-add-heading">
                      <Plus className="w-3 h-3" /> Heading
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => addBlock("text")} className="gap-1" data-testid="btn-add-text">
                      <Plus className="w-3 h-3" /> Text
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => addBlock("image")} className="gap-1" data-testid="btn-add-image">
                      <Plus className="w-3 h-3" /> Image
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => addBlock("button")} className="gap-1" data-testid="btn-add-button">
                      <Plus className="w-3 h-3" /> Button
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => addBlock("divider")} className="gap-1" data-testid="btn-add-divider">
                      <Plus className="w-3 h-3" /> Divider
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => addBlock("spacer")} className="gap-1" data-testid="btn-add-spacer">
                      <Plus className="w-3 h-3" /> Spacer
                    </Button>
                  </div>

                  {/* Block List */}
                  <div className="max-h-[500px] overflow-y-auto">
                    {blocks.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Type className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>No content blocks yet. Add some above!</p>
                      </div>
                    ) : (
                      blocks.map(renderBlockEditor)
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Preview Panel */}
            <div className="lg:sticky lg:top-6">
              <Card className="h-[calc(100vh-200px)] flex flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="w-5 h-5" />
                    Live Preview
                  </CardTitle>
                  <CardDescription>
                    This is how your email will look
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 p-0 overflow-hidden">
                  <iframe
                    ref={previewRef}
                    srcDoc={generateFullHtml()}
                    className="w-full h-full border-t"
                    title="Email Preview"
                    data-testid="email-preview"
                  />
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Instructions Card */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>How to Use</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>Design your newsletter using the content blocks on the left</li>
                <li>Preview your email in real-time on the right</li>
                <li>When you're happy with the design, click <strong>"Copy HTML to Clipboard"</strong></li>
                <li>Click <strong>"Open Gmail Compose"</strong> to open a new email in Gmail</li>
                <li>In Gmail compose, press <strong>Ctrl+V</strong> (or Cmd+V on Mac) to paste - the formatted email will appear!</li>
              </ol>
            </CardContent>
          </Card>

        </div>
      </div>
    </DashboardLayout>
  );
}
