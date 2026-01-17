import { useState, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ObjectUploader } from "@/components/ObjectUploader";
import { 
  GripVertical, 
  Plus, 
  Trash2, 
  Edit, 
  Type, 
  Image as ImageIcon, 
  Quote,
  Minus,
  Square,
  List,
  Video,
  AlertCircle,
  Columns,
  Eye,
  EyeOff,
  Heading1,
  MousePointer,
  X
} from "lucide-react";
import type { 
  PageBlock, 
  HeadingBlock, 
  ParagraphBlock, 
  ImageBlock, 
  ButtonBlock, 
  DividerBlock, 
  SpacerBlock, 
  QuoteBlock, 
  ListBlock, 
  VideoBlock, 
  CalloutBlock,
  ColumnsBlock,
  ColumnData
} from "@shared/schema";

interface PageBuilderProps {
  blocks: PageBlock[];
  onChange: (blocks: PageBlock[]) => void;
}

const generateBlockId = () => `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const BLOCK_TYPES = [
  { type: "heading", icon: Heading1, label: "Heading", description: "Title or section header" },
  { type: "paragraph", icon: Type, label: "Paragraph", description: "Text content" },
  { type: "image", icon: ImageIcon, label: "Image", description: "Photo or graphic" },
  { type: "button", icon: MousePointer, label: "Button", description: "Call-to-action button" },
  { type: "columns", icon: Columns, label: "Two Columns", description: "Side-by-side content" },
  { type: "divider", icon: Minus, label: "Divider", description: "Horizontal line" },
  { type: "spacer", icon: Square, label: "Spacer", description: "Empty space" },
  { type: "quote", icon: Quote, label: "Quote", description: "Blockquote or testimonial" },
  { type: "list", icon: List, label: "List", description: "Bullet or numbered list" },
  { type: "video", icon: Video, label: "Video", description: "YouTube or Vimeo video" },
  { type: "callout", icon: AlertCircle, label: "Callout", description: "Info, warning, or notice" },
] as const;

function createDefaultBlock(type: string): PageBlock {
  const id = generateBlockId();
  
  switch (type) {
    case "heading":
      return { id, type: "heading", content: "New Heading", level: 2, alignment: "left" } as HeadingBlock;
    case "paragraph":
      return { id, type: "paragraph", content: "Enter your text here...", alignment: "left", fontSize: "medium" } as ParagraphBlock;
    case "image":
      return { id, type: "image", src: "", alt: "", alignment: "center", width: "large" } as ImageBlock;
    case "button":
      return { id, type: "button", text: "Click Here", url: "#", variant: "primary", alignment: "center", size: "medium" } as ButtonBlock;
    case "columns":
      return { 
        id, 
        type: "columns", 
        columns: [
          { id: generateBlockId(), blocks: [], width: 50 },
          { id: generateBlockId(), blocks: [], width: 50 }
        ], 
        gap: "medium" 
      } as ColumnsBlock;
    case "divider":
      return { id, type: "divider", style: "solid", thickness: "thin" } as DividerBlock;
    case "spacer":
      return { id, type: "spacer", height: "medium" } as SpacerBlock;
    case "quote":
      return { id, type: "quote", content: "Enter quote here...", style: "bordered", alignment: "left" } as QuoteBlock;
    case "list":
      return { id, type: "list", items: ["Item 1", "Item 2", "Item 3"], style: "bullet" } as ListBlock;
    case "video":
      return { id, type: "video", url: "", alignment: "center", width: "large" } as VideoBlock;
    case "callout":
      return { id, type: "callout", content: "Important information here...", variant: "info", icon: true } as CalloutBlock;
    default:
      return { id, type: "paragraph", content: "", alignment: "left", fontSize: "medium" } as ParagraphBlock;
  }
}

interface SortableBlockProps {
  block: PageBlock;
  onEdit: () => void;
  onDelete: () => void;
}

function SortableBlock({ block, onEdit, onDelete }: SortableBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} data-testid={`block-item-${block.id}`}>
      <Card className="p-3 group hover-elevate">
        <div className="flex items-start gap-3">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground touch-none"
            data-testid={`block-drag-handle-${block.id}`}
          >
            <GripVertical className="h-5 w-5" />
          </div>
          
          <div className="flex-1 min-w-0">
            <BlockPreview block={block} />
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onEdit}
              data-testid={`block-edit-${block.id}`}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onDelete}
              className="text-destructive hover:text-destructive"
              data-testid={`block-delete-${block.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function PageBuilder({ blocks, onChange }: PageBuilderProps) {
  const [editingBlock, setEditingBlock] = useState<PageBlock | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addBlockDialogOpen, setAddBlockDialogOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = blocks.findIndex((b) => b.id === active.id);
      const newIndex = blocks.findIndex((b) => b.id === over.id);
      onChange(arrayMove(blocks, oldIndex, newIndex));
    }
  };

  const addBlock = (type: string) => {
    const newBlock = createDefaultBlock(type);
    onChange([...blocks, newBlock]);
    setAddBlockDialogOpen(false);
    setEditingBlock(newBlock);
    setEditDialogOpen(true);
  };

  const updateBlock = (updatedBlock: PageBlock) => {
    onChange(blocks.map(b => b.id === updatedBlock.id ? updatedBlock : b));
    setEditingBlock(null);
    setEditDialogOpen(false);
  };

  const deleteBlock = (id: string) => {
    onChange(blocks.filter(b => b.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {blocks.length} {blocks.length === 1 ? "block" : "blocks"}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowPreview(!showPreview)}
            data-testid="button-toggle-preview"
          >
            {showPreview ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
            {showPreview ? "Edit" : "Preview"}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => setAddBlockDialogOpen(true)}
            data-testid="button-add-block"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Block
          </Button>
        </div>
      </div>

      {showPreview ? (
        <Card className="p-6">
          <BlockRenderer blocks={blocks} />
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={blocks.map(b => b.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {blocks.length === 0 ? (
                <Card className="p-12 text-center border-dashed">
                  <div className="text-muted-foreground mb-4">
                    <Plus className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No content blocks yet</p>
                    <p className="text-xs">Click "Add Block" to get started</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAddBlockDialogOpen(true)}
                    data-testid="button-add-first-block"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Your First Block
                  </Button>
                </Card>
              ) : (
                blocks.map((block) => (
                  <SortableBlock
                    key={block.id}
                    block={block}
                    onEdit={() => {
                      setEditingBlock(block);
                      setEditDialogOpen(true);
                    }}
                    onDelete={() => deleteBlock(block.id)}
                  />
                ))
              )}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Dialog open={addBlockDialogOpen} onOpenChange={setAddBlockDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Content Block</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            {BLOCK_TYPES.map(({ type, icon: Icon, label, description }) => (
              <button
                key={type}
                type="button"
                onClick={() => addBlock(type)}
                className="flex items-start gap-3 p-4 rounded-lg border hover-elevate text-left"
                data-testid={`add-block-${type}`}
              >
                <Icon className="h-5 w-5 mt-0.5 text-primary" />
                <div>
                  <div className="font-medium text-sm">{label}</div>
                  <div className="text-xs text-muted-foreground">{description}</div>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          {editingBlock && (
            <BlockEditor
              block={editingBlock}
              onSave={updateBlock}
              onCancel={() => {
                setEditingBlock(null);
                setEditDialogOpen(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BlockPreview({ block }: { block: PageBlock }) {
  const getBlockIcon = () => {
    const blockType = BLOCK_TYPES.find(t => t.type === block.type);
    if (blockType) {
      const Icon = blockType.icon;
      return <Icon className="h-4 w-4" />;
    }
    return <Type className="h-4 w-4" />;
  };

  const getBlockLabel = () => {
    return BLOCK_TYPES.find(t => t.type === block.type)?.label || "Block";
  };

  const getPreviewText = () => {
    switch (block.type) {
      case "heading":
        return block.content || "Empty heading";
      case "paragraph":
        return block.content?.substring(0, 100) + (block.content?.length > 100 ? "..." : "") || "Empty paragraph";
      case "image":
        return block.src ? "Image uploaded" : "No image selected";
      case "button":
        return `Button: "${block.text}" → ${block.url}`;
      case "columns": {
        const totalBlocks = block.columns?.reduce((acc, col) => acc + (col.blocks?.length || 0), 0) || 0;
        return `${block.columns?.length || 2} columns, ${totalBlocks} block${totalBlocks !== 1 ? 's' : ''}`;
      }
      case "divider":
        return `${block.style || "solid"} divider`;
      case "spacer":
        return `${block.height || "medium"} space`;
      case "quote":
        return block.content?.substring(0, 80) + (block.content?.length > 80 ? "..." : "") || "Empty quote";
      case "list":
        return `${block.items?.length || 0} items (${block.style})`;
      case "video":
        return block.url || "No video URL";
      case "callout":
        return `${block.variant || "info"}: ${block.content?.substring(0, 60) || "Empty callout"}`;
      default:
        return "Unknown block";
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-primary">{getBlockIcon()}</span>
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {getBlockLabel()}
      </span>
      <span className="text-sm truncate">{getPreviewText()}</span>
    </div>
  );
}

const COLUMN_BLOCK_TYPES = [
  { type: "heading", icon: Heading1, label: "Heading" },
  { type: "paragraph", icon: Type, label: "Paragraph" },
  { type: "image", icon: ImageIcon, label: "Image" },
  { type: "button", icon: MousePointer, label: "Button" },
  { type: "divider", icon: Minus, label: "Divider" },
  { type: "spacer", icon: Square, label: "Spacer" },
  { type: "list", icon: List, label: "List" },
] as const;

interface NestedColumnEditorProps {
  blocks: PageBlock[];
  onChange: (blocks: PageBlock[]) => void;
  columnId: string;
}

function NestedColumnEditor({ blocks, onChange, columnId }: NestedColumnEditorProps) {
  const [editingBlock, setEditingBlock] = useState<PageBlock | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const addBlock = (type: string) => {
    const newBlock = createDefaultBlock(type);
    onChange([...blocks, newBlock]);
    setShowAddMenu(false);
    setEditingBlock(newBlock);
  };

  const updateBlock = (updatedBlock: PageBlock) => {
    onChange(blocks.map(b => b.id === updatedBlock.id ? updatedBlock : b));
    setEditingBlock(null);
  };

  const deleteBlock = (id: string) => {
    onChange(blocks.filter(b => b.id !== id));
  };

  const moveBlock = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= blocks.length) return;
    const newBlocks = [...blocks];
    [newBlocks[index], newBlocks[newIndex]] = [newBlocks[newIndex], newBlocks[index]];
    onChange(newBlocks);
  };

  return (
    <div className="border rounded-md p-2 min-h-[200px] space-y-2 bg-muted/30">
      {blocks.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm">
          <p>No blocks yet</p>
        </div>
      ) : (
        blocks.map((block, index) => (
          <div 
            key={block.id} 
            className="bg-background rounded border p-2 flex items-center gap-2"
            data-testid={`column-${columnId}-block-${block.id}`}
          >
            <div className="flex flex-col gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => moveBlock(index, "up")}
                disabled={index === 0}
              >
                <span className="text-xs">↑</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => moveBlock(index, "down")}
                disabled={index === blocks.length - 1}
              >
                <span className="text-xs">↓</span>
              </Button>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-muted-foreground">
                {BLOCK_TYPES.find(t => t.type === block.type)?.label || "Block"}
              </div>
              <div className="text-xs truncate">
                {block.type === "heading" || block.type === "paragraph" ? 
                  (block as any).content?.substring(0, 30) || "Empty" : 
                  block.type}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setEditingBlock(block)}
            >
              <Edit className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive"
              onClick={() => deleteBlock(block.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))
      )}
      
      {showAddMenu ? (
        <div className="grid grid-cols-1 gap-1 p-1 border rounded bg-background">
          {COLUMN_BLOCK_TYPES.map(({ type, icon: Icon, label }) => (
            <button
              key={type}
              type="button"
              onClick={() => addBlock(type)}
              className="flex items-center gap-2 p-2 rounded hover-elevate text-left text-sm"
            >
              <Icon className="h-3 w-3" />
              <span>{label}</span>
            </button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAddMenu(false)}
            className="w-full"
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowAddMenu(true)}
          className="w-full"
          data-testid={`button-add-block-${columnId}`}
        >
          <Plus className="h-3 w-3 mr-1" />
          Add Block
        </Button>
      )}

      <Dialog open={!!editingBlock} onOpenChange={(open) => !open && setEditingBlock(null)}>
        <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
          {editingBlock && (
            <NestedBlockEditor
              block={editingBlock}
              onSave={updateBlock}
              onCancel={() => setEditingBlock(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NestedBlockEditor({ block, onSave, onCancel }: { block: PageBlock; onSave: (block: PageBlock) => void; onCancel: () => void }) {
  const [editedBlock, setEditedBlock] = useState<PageBlock>(block);

  const updateField = (field: string, value: any) => {
    setEditedBlock({ ...editedBlock, [field]: value } as PageBlock);
  };

  const renderEditor = () => {
    switch (editedBlock.type) {
      case "heading":
        return (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Heading Text</Label>
              <Input
                value={(editedBlock as HeadingBlock).content}
                onChange={(e) => updateField("content", e.target.value)}
                placeholder="Enter heading"
              />
            </div>
            <div>
              <Label className="text-xs">Level</Label>
              <Select value={String((editedBlock as HeadingBlock).level)} onValueChange={(v) => updateField("level", parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">H1</SelectItem>
                  <SelectItem value="2">H2</SelectItem>
                  <SelectItem value="3">H3</SelectItem>
                  <SelectItem value="4">H4</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      case "paragraph":
        return (
          <div>
            <Label className="text-xs">Content</Label>
            <Textarea
              value={(editedBlock as ParagraphBlock).content}
              onChange={(e) => updateField("content", e.target.value)}
              placeholder="Enter text..."
              rows={4}
            />
          </div>
        );
      case "image":
        return (
          <div className="space-y-3">
            {(editedBlock as ImageBlock).src ? (
              <div className="space-y-2">
                <img src={(editedBlock as ImageBlock).src} alt="" className="max-h-32 rounded border" />
                <Button type="button" variant="outline" size="sm" onClick={() => updateField("src", "")}>
                  Remove
                </Button>
              </div>
            ) : (
              <ObjectUploader
                onChange={(urls) => {
                  if (urls && urls.length > 0) {
                    updateField("src", urls[0]);
                  }
                }}
                accept="image/*"
                maxFiles={1}
                maxFileSize={5 * 1024 * 1024}
                data-testid="uploader-nested-image"
              />
            )}
            <div>
              <Label className="text-xs">Alt Text</Label>
              <Input
                value={(editedBlock as ImageBlock).alt || ""}
                onChange={(e) => updateField("alt", e.target.value)}
                placeholder="Describe the image"
              />
            </div>
          </div>
        );
      case "button":
        return (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Button Text</Label>
              <Input
                value={(editedBlock as ButtonBlock).text}
                onChange={(e) => updateField("text", e.target.value)}
                placeholder="Button text"
              />
            </div>
            <div>
              <Label className="text-xs">URL</Label>
              <Input
                value={(editedBlock as ButtonBlock).url}
                onChange={(e) => updateField("url", e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
        );
      case "list":
        const listBlock = editedBlock as ListBlock;
        return (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Style</Label>
              <Select value={listBlock.style || "bullet"} onValueChange={(v) => updateField("style", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bullet">Bullets</SelectItem>
                  <SelectItem value="numbered">Numbered</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              {(listBlock.items || []).map((item, i) => (
                <div key={i} className="flex gap-1">
                  <Input
                    value={item}
                    onChange={(e) => {
                      const newItems = [...(listBlock.items || [])];
                      newItems[i] = e.target.value;
                      updateField("items", newItems);
                    }}
                    placeholder={`Item ${i + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => updateField("items", listBlock.items?.filter((_, idx) => idx !== i))}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => updateField("items", [...(listBlock.items || []), ""])}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Item
              </Button>
            </div>
          </div>
        );
      case "divider":
        return (
          <div>
            <Label className="text-xs">Style</Label>
            <Select value={(editedBlock as DividerBlock).style || "solid"} onValueChange={(v) => updateField("style", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="solid">Solid</SelectItem>
                <SelectItem value="dashed">Dashed</SelectItem>
                <SelectItem value="dotted">Dotted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );
      case "spacer":
        return (
          <div>
            <Label className="text-xs">Height</Label>
            <Select value={(editedBlock as SpacerBlock).height || "medium"} onValueChange={(v) => updateField("height", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="large">Large</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );
      default:
        return <div>Block type not editable in columns</div>;
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-sm">
          Edit {BLOCK_TYPES.find(t => t.type === editedBlock.type)?.label || "Block"}
        </DialogTitle>
      </DialogHeader>
      <div className="py-2">
        {renderEditor()}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={() => onSave(editedBlock)}>
          Save
        </Button>
      </DialogFooter>
    </>
  );
}

function BlockEditor({ block, onSave, onCancel }: { block: PageBlock; onSave: (block: PageBlock) => void; onCancel: () => void }) {
  const [editedBlock, setEditedBlock] = useState<PageBlock>(block);

  const updateField = (field: string, value: any) => {
    setEditedBlock({ ...editedBlock, [field]: value } as PageBlock);
  };

  const renderEditor = () => {
    switch (editedBlock.type) {
      case "heading":
        return (
          <div className="space-y-4">
            <div>
              <Label>Heading Text</Label>
              <Input
                value={editedBlock.content}
                onChange={(e) => updateField("content", e.target.value)}
                placeholder="Enter heading text"
                data-testid="input-heading-content"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Level</Label>
                <Select value={String(editedBlock.level)} onValueChange={(v) => updateField("level", parseInt(v))}>
                  <SelectTrigger data-testid="select-heading-level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">H1 - Large</SelectItem>
                    <SelectItem value="2">H2 - Medium</SelectItem>
                    <SelectItem value="3">H3 - Small</SelectItem>
                    <SelectItem value="4">H4 - Tiny</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Alignment</Label>
                <Select value={editedBlock.alignment || "left"} onValueChange={(v) => updateField("alignment", v)}>
                  <SelectTrigger data-testid="select-heading-alignment">
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
            <div>
              <Label>Text Color (optional)</Label>
              <Input
                type="color"
                value={editedBlock.textColor || "#000000"}
                onChange={(e) => updateField("textColor", e.target.value)}
                className="h-10 w-20"
                data-testid="input-heading-color"
              />
            </div>
          </div>
        );

      case "paragraph":
        return (
          <div className="space-y-4">
            <div>
              <Label>Content</Label>
              <Textarea
                value={editedBlock.content}
                onChange={(e) => updateField("content", e.target.value)}
                placeholder="Enter your text content..."
                rows={6}
                data-testid="input-paragraph-content"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Font Size</Label>
                <Select value={editedBlock.fontSize || "medium"} onValueChange={(v) => updateField("fontSize", v)}>
                  <SelectTrigger data-testid="select-paragraph-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="large">Large</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Alignment</Label>
                <Select value={editedBlock.alignment || "left"} onValueChange={(v) => updateField("alignment", v)}>
                  <SelectTrigger data-testid="select-paragraph-alignment">
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
          </div>
        );

      case "image":
        return (
          <div className="space-y-4">
            <div>
              <Label>Image</Label>
              {editedBlock.src ? (
                <div className="space-y-2">
                  <img 
                    src={editedBlock.src} 
                    alt={editedBlock.alt || ""} 
                    className="max-w-full h-auto max-h-48 rounded-md border object-cover"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => updateField("src", "")}
                    data-testid="button-remove-image"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Remove Image
                  </Button>
                </div>
              ) : (
                <ObjectUploader
                  onChange={(urls) => {
                    if (urls && urls.length > 0) {
                      updateField("src", urls[0]);
                    }
                  }}
                  accept="image/*"
                  maxFiles={1}
                  maxFileSize={5 * 1024 * 1024}
                  data-testid="uploader-page-image"
                />
              )}
            </div>
            <div>
              <Label>Alt Text</Label>
              <Input
                value={editedBlock.alt || ""}
                onChange={(e) => updateField("alt", e.target.value)}
                placeholder="Describe the image for accessibility"
                data-testid="input-image-alt"
              />
            </div>
            <div>
              <Label>Caption (optional)</Label>
              <Input
                value={editedBlock.caption || ""}
                onChange={(e) => updateField("caption", e.target.value)}
                placeholder="Image caption"
                data-testid="input-image-caption"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Width</Label>
                <Select value={editedBlock.width || "large"} onValueChange={(v) => updateField("width", v)}>
                  <SelectTrigger data-testid="select-image-width">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small (25%)</SelectItem>
                    <SelectItem value="medium">Medium (50%)</SelectItem>
                    <SelectItem value="large">Large (75%)</SelectItem>
                    <SelectItem value="full">Full Width</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Alignment</Label>
                <Select value={editedBlock.alignment || "center"} onValueChange={(v) => updateField("alignment", v)}>
                  <SelectTrigger data-testid="select-image-alignment">
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
          </div>
        );

      case "button":
        return (
          <div className="space-y-4">
            <div>
              <Label>Button Text</Label>
              <Input
                value={editedBlock.text}
                onChange={(e) => updateField("text", e.target.value)}
                placeholder="Enter button text"
                data-testid="input-button-text"
              />
            </div>
            <div>
              <Label>Link URL</Label>
              <Input
                value={editedBlock.url}
                onChange={(e) => updateField("url", e.target.value)}
                placeholder="https://..."
                data-testid="input-button-url"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Style</Label>
                <Select value={editedBlock.variant || "primary"} onValueChange={(v) => updateField("variant", v)}>
                  <SelectTrigger data-testid="select-button-variant">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="primary">Primary</SelectItem>
                    <SelectItem value="secondary">Secondary</SelectItem>
                    <SelectItem value="outline">Outline</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Size</Label>
                <Select value={editedBlock.size || "medium"} onValueChange={(v) => updateField("size", v)}>
                  <SelectTrigger data-testid="select-button-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="large">Large</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Alignment</Label>
                <Select value={editedBlock.alignment || "center"} onValueChange={(v) => updateField("alignment", v)}>
                  <SelectTrigger data-testid="select-button-alignment">
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
          </div>
        );

      case "columns": {
        const columnsBlock = editedBlock as ColumnsBlock;
        const columns = columnsBlock.columns || [
          { id: generateBlockId(), blocks: [], width: 50 },
          { id: generateBlockId(), blocks: [], width: 50 }
        ];
        
        const updateColumnBlocks = (columnIndex: number, newBlocks: PageBlock[]) => {
          const newColumns = [...columns];
          newColumns[columnIndex] = { ...newColumns[columnIndex], blocks: newBlocks };
          updateField("columns", newColumns);
        };
        
        const updateColumnWidth = (leftWidth: number) => {
          const newColumns = columns.map((col, index) => ({
            ...col,
            width: index === 0 ? leftWidth : 100 - leftWidth
          }));
          updateField("columns", newColumns);
        };
        
        return (
          <div className="space-y-4">
            <div>
              <Label>Left Column Width: {columns[0]?.width || 50}%</Label>
              <input
                type="range"
                min="20"
                max="80"
                step="5"
                value={columns[0]?.width || 50}
                onChange={(e) => updateColumnWidth(parseInt(e.target.value))}
                className="w-full"
                data-testid="slider-column-width"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Left: {columns[0]?.width || 50}%</span>
                <span>Right: {columns[1]?.width || 50}%</span>
              </div>
            </div>
            <div>
              <Label>Gap Between Columns</Label>
              <Select value={columnsBlock.gap || "medium"} onValueChange={(v) => updateField("gap", v)}>
                <SelectTrigger data-testid="select-column-gap">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="large">Large</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Left Column</Label>
                  <span className="text-xs text-muted-foreground">
                    {columns[0]?.blocks?.length || 0} blocks
                  </span>
                </div>
                <NestedColumnEditor
                  blocks={columns[0]?.blocks || []}
                  onChange={(blocks) => updateColumnBlocks(0, blocks)}
                  columnId="left"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Right Column</Label>
                  <span className="text-xs text-muted-foreground">
                    {columns[1]?.blocks?.length || 0} blocks
                  </span>
                </div>
                <NestedColumnEditor
                  blocks={columns[1]?.blocks || []}
                  onChange={(blocks) => updateColumnBlocks(1, blocks)}
                  columnId="right"
                />
              </div>
            </div>
          </div>
        );
      }

      case "divider":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Style</Label>
                <Select value={editedBlock.style || "solid"} onValueChange={(v) => updateField("style", v)}>
                  <SelectTrigger data-testid="select-divider-style">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solid">Solid</SelectItem>
                    <SelectItem value="dashed">Dashed</SelectItem>
                    <SelectItem value="dotted">Dotted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Thickness</Label>
                <Select value={editedBlock.thickness || "thin"} onValueChange={(v) => updateField("thickness", v)}>
                  <SelectTrigger data-testid="select-divider-thickness">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="thin">Thin</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="thick">Thick</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Color</Label>
              <Input
                type="color"
                value={editedBlock.color || "#e5e7eb"}
                onChange={(e) => updateField("color", e.target.value)}
                className="h-10 w-20"
                data-testid="input-divider-color"
              />
            </div>
          </div>
        );

      case "spacer":
        return (
          <div className="space-y-4">
            <div>
              <Label>Height</Label>
              <Select value={editedBlock.height || "medium"} onValueChange={(v) => updateField("height", v)}>
                <SelectTrigger data-testid="select-spacer-height">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small (16px)</SelectItem>
                  <SelectItem value="medium">Medium (32px)</SelectItem>
                  <SelectItem value="large">Large (64px)</SelectItem>
                  <SelectItem value="xlarge">Extra Large (96px)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case "quote":
        return (
          <div className="space-y-4">
            <div>
              <Label>Quote Text</Label>
              <Textarea
                value={editedBlock.content}
                onChange={(e) => updateField("content", e.target.value)}
                placeholder="Enter the quote..."
                rows={4}
                data-testid="input-quote-content"
              />
            </div>
            <div>
              <Label>Author (optional)</Label>
              <Input
                value={editedBlock.author || ""}
                onChange={(e) => updateField("author", e.target.value)}
                placeholder="Quote author"
                data-testid="input-quote-author"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Style</Label>
                <Select value={editedBlock.style || "bordered"} onValueChange={(v) => updateField("style", v)}>
                  <SelectTrigger data-testid="select-quote-style">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bordered">Left Border</SelectItem>
                    <SelectItem value="boxed">Boxed</SelectItem>
                    <SelectItem value="minimal">Minimal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Alignment</Label>
                <Select value={editedBlock.alignment || "left"} onValueChange={(v) => updateField("alignment", v)}>
                  <SelectTrigger data-testid="select-quote-alignment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        );

      case "list":
        const listBlock = editedBlock as ListBlock;
        return (
          <div className="space-y-4">
            <div>
              <Label>List Style</Label>
              <Select value={listBlock.style || "bullet"} onValueChange={(v) => updateField("style", v)}>
                <SelectTrigger data-testid="select-list-style">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bullet">Bullet Points</SelectItem>
                  <SelectItem value="numbered">Numbered</SelectItem>
                  <SelectItem value="check">Checkmarks</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>List Items</Label>
              <div className="space-y-2">
                {(listBlock.items || []).map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm w-6">{index + 1}.</span>
                    <Input
                      value={item}
                      onChange={(e) => {
                        const newItems = [...(listBlock.items || [])];
                        newItems[index] = e.target.value;
                        updateField("items", newItems);
                      }}
                      placeholder={`Item ${index + 1}`}
                      data-testid={`input-list-item-${index}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const newItems = (listBlock.items || []).filter((_, i) => i !== index);
                        updateField("items", newItems);
                      }}
                      data-testid={`button-remove-item-${index}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => updateField("items", [...(listBlock.items || []), ""])}
                  data-testid="button-add-list-item"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
              </div>
            </div>
          </div>
        );

      case "video":
        return (
          <div className="space-y-4">
            <div>
              <Label>Video URL</Label>
              <Input
                value={editedBlock.url}
                onChange={(e) => updateField("url", e.target.value)}
                placeholder="YouTube or Vimeo URL"
                data-testid="input-video-url"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Supports YouTube and Vimeo links
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Width</Label>
                <Select value={editedBlock.width || "large"} onValueChange={(v) => updateField("width", v)}>
                  <SelectTrigger data-testid="select-video-width">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small (50%)</SelectItem>
                    <SelectItem value="medium">Medium (75%)</SelectItem>
                    <SelectItem value="large">Large (100%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Alignment</Label>
                <Select value={editedBlock.alignment || "center"} onValueChange={(v) => updateField("alignment", v)}>
                  <SelectTrigger data-testid="select-video-alignment">
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
          </div>
        );

      case "callout":
        return (
          <div className="space-y-4">
            <div>
              <Label>Callout Text</Label>
              <Textarea
                value={editedBlock.content}
                onChange={(e) => updateField("content", e.target.value)}
                placeholder="Enter callout content..."
                rows={3}
                data-testid="input-callout-content"
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={editedBlock.variant || "info"} onValueChange={(v) => updateField("variant", v)}>
                <SelectTrigger data-testid="select-callout-variant">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      default:
        return <div>Unknown block type</div>;
    }
  };

  const getBlockTitle = () => {
    return BLOCK_TYPES.find(t => t.type === editedBlock.type)?.label || "Block";
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit {getBlockTitle()}</DialogTitle>
      </DialogHeader>
      <div className="py-4">
        {renderEditor()}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={() => onSave(editedBlock)} data-testid="button-save-block">
          Save Block
        </Button>
      </DialogFooter>
    </>
  );
}

export function BlockRenderer({ blocks }: { blocks: PageBlock[] }) {
  if (!blocks || blocks.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        <p>No content available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {blocks.map((block) => (
        <RenderBlock key={block.id} block={block} />
      ))}
    </div>
  );
}

function RenderBlock({ block }: { block: PageBlock }) {
  const getAlignmentClass = (alignment?: string) => {
    switch (alignment) {
      case "center": return "text-center";
      case "right": return "text-right";
      default: return "text-left";
    }
  };

  const getJustifyClass = (alignment?: string) => {
    switch (alignment) {
      case "center": return "justify-center";
      case "right": return "justify-end";
      default: return "justify-start";
    }
  };

  switch (block.type) {
    case "heading": {
      const HeadingTag = `h${block.level || 2}` as keyof JSX.IntrinsicElements;
      const sizeClasses = {
        1: "text-4xl font-bold",
        2: "text-3xl font-bold",
        3: "text-2xl font-semibold",
        4: "text-xl font-semibold",
      };
      return (
        <HeadingTag
          className={`${sizeClasses[block.level as keyof typeof sizeClasses] || sizeClasses[2]} ${getAlignmentClass(block.alignment)}`}
          style={{ color: block.textColor }}
          data-testid={`rendered-heading-${block.id}`}
        >
          {block.content}
        </HeadingTag>
      );
    }

    case "paragraph": {
      const fontSizeClasses = {
        small: "text-sm",
        medium: "text-base",
        large: "text-lg",
      };
      return (
        <p
          className={`${fontSizeClasses[block.fontSize as keyof typeof fontSizeClasses] || fontSizeClasses.medium} ${getAlignmentClass(block.alignment)} whitespace-pre-wrap`}
          data-testid={`rendered-paragraph-${block.id}`}
        >
          {block.content}
        </p>
      );
    }

    case "image": {
      const widthClasses = {
        small: "max-w-xs",
        medium: "max-w-md",
        large: "max-w-2xl",
        full: "w-full",
      };
      const imageElement = (
        <figure className={`flex flex-col ${getJustifyClass(block.alignment)}`}>
          <img
            src={block.src}
            alt={block.alt || ""}
            className={`${widthClasses[block.width as keyof typeof widthClasses] || widthClasses.large} max-w-full h-auto rounded-md`}
          />
          {block.caption && (
            <figcaption className="text-sm text-muted-foreground mt-2 text-center">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );

      if (block.linkUrl) {
        return (
          <a href={block.linkUrl} target="_blank" rel="noopener noreferrer" data-testid={`rendered-image-${block.id}`}>
            {imageElement}
          </a>
        );
      }
      return <div data-testid={`rendered-image-${block.id}`}>{imageElement}</div>;
    }

    case "button": {
      const variantClasses = {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
      };
      const sizeClasses = {
        small: "px-3 py-1.5 text-sm",
        medium: "px-4 py-2",
        large: "px-6 py-3 text-lg",
      };
      return (
        <div className={`flex ${getJustifyClass(block.alignment)}`} data-testid={`rendered-button-${block.id}`}>
          <a
            href={block.url}
            target={block.url?.startsWith("http") ? "_blank" : undefined}
            rel={block.url?.startsWith("http") ? "noopener noreferrer" : undefined}
            className={`inline-flex items-center justify-center rounded-md font-medium transition-colors ${
              variantClasses[block.variant as keyof typeof variantClasses] || variantClasses.primary
            } ${sizeClasses[block.size as keyof typeof sizeClasses] || sizeClasses.medium}`}
          >
            {block.text}
          </a>
        </div>
      );
    }

    case "columns": {
      const gapClasses = {
        small: "gap-4",
        medium: "gap-6",
        large: "gap-8",
      };
      const columns = block.columns || [];
      
      return (
        <div 
          className={`flex flex-col md:flex-row ${gapClasses[block.gap as keyof typeof gapClasses] || gapClasses.medium}`}
          data-testid={`rendered-columns-${block.id}`}
        >
          {columns.map((column, index) => (
            <div 
              key={column.id || index}
              className="min-w-0 overflow-hidden"
              style={{ 
                flex: `1 1 ${column.width || 50}%`
              }}
            >
              {column.blocks && column.blocks.length > 0 ? (
                <div className="space-y-4">
                  {column.blocks.map((nestedBlock) => (
                    <RenderBlock key={nestedBlock.id} block={nestedBlock} />
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground text-sm">Empty column</div>
              )}
            </div>
          ))}
        </div>
      );
    }

    case "divider": {
      const thicknessClasses = {
        thin: "border-t",
        medium: "border-t-2",
        thick: "border-t-4",
      };
      const styleClasses = {
        solid: "border-solid",
        dashed: "border-dashed",
        dotted: "border-dotted",
      };
      return (
        <hr
          className={`${thicknessClasses[block.thickness as keyof typeof thicknessClasses] || thicknessClasses.thin} ${
            styleClasses[block.style as keyof typeof styleClasses] || styleClasses.solid
          }`}
          style={{ borderColor: block.color }}
          data-testid={`rendered-divider-${block.id}`}
        />
      );
    }

    case "spacer": {
      const heightClasses = {
        small: "h-4",
        medium: "h-8",
        large: "h-16",
        xlarge: "h-24",
      };
      return (
        <div 
          className={heightClasses[block.height as keyof typeof heightClasses] || heightClasses.medium}
          data-testid={`rendered-spacer-${block.id}`}
        />
      );
    }

    case "quote": {
      const styleClasses = {
        bordered: "border-l-4 border-primary pl-4",
        boxed: "bg-muted p-4 rounded-lg",
        minimal: "italic",
      };
      return (
        <blockquote
          className={`${styleClasses[block.style as keyof typeof styleClasses] || styleClasses.bordered} ${getAlignmentClass(block.alignment)}`}
          data-testid={`rendered-quote-${block.id}`}
        >
          <p className="text-lg">{block.content}</p>
          {block.author && (
            <footer className="mt-2 text-sm text-muted-foreground">— {block.author}</footer>
          )}
        </blockquote>
      );
    }

    case "list": {
      const ListTag = block.style === "numbered" ? "ol" : "ul";
      const listStyleClass = block.style === "numbered" ? "list-decimal" : block.style === "check" ? "list-none" : "list-disc";
      return (
        <ListTag className={`${listStyleClass} pl-6 space-y-2`} data-testid={`rendered-list-${block.id}`}>
          {(block.items || []).map((item, index) => (
            <li key={index} className="flex items-start gap-2">
              {block.style === "check" && <span className="text-green-600">✓</span>}
              <span>{item}</span>
            </li>
          ))}
        </ListTag>
      );
    }

    case "video": {
      const getEmbedUrl = (url: string) => {
        if (url.includes("youtube.com") || url.includes("youtu.be")) {
          const videoId = url.match(/(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/watch\?.+&v=))([^"&?\/\s]{11})/)?.[1];
          return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
        }
        if (url.includes("vimeo.com")) {
          const videoId = url.match(/vimeo\.com\/(\d+)/)?.[1];
          return videoId ? `https://player.vimeo.com/video/${videoId}` : null;
        }
        return null;
      };

      const embedUrl = getEmbedUrl(block.url || "");
      if (!embedUrl) {
        return <div className="text-muted-foreground">Invalid video URL</div>;
      }

      const widthClasses = {
        small: "max-w-md",
        medium: "max-w-xl",
        large: "w-full",
      };

      return (
        <div className={`flex ${getJustifyClass(block.alignment)}`} data-testid={`rendered-video-${block.id}`}>
          <div className={`${widthClasses[block.width as keyof typeof widthClasses] || widthClasses.large} aspect-video`}>
            <iframe
              src={embedUrl}
              className="w-full h-full rounded-lg"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          </div>
        </div>
      );
    }

    case "callout": {
      const variantClasses = {
        info: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200",
        success: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
        warning: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200",
        error: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
      };
      const icons = {
        info: "ℹ️",
        success: "✅",
        warning: "⚠️",
        error: "❌",
      };
      return (
        <div
          className={`p-4 border rounded-lg flex items-start gap-3 ${
            variantClasses[block.variant as keyof typeof variantClasses] || variantClasses.info
          }`}
          data-testid={`rendered-callout-${block.id}`}
        >
          {block.icon && (
            <span className="text-xl">{icons[block.variant as keyof typeof icons] || icons.info}</span>
          )}
          <p className="whitespace-pre-wrap">{block.content}</p>
        </div>
      );
    }

    default:
      return null;
  }
}