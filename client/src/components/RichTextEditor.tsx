import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bold, Italic, List, ListOrdered, Link, Heading2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
  "data-testid"?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write your content here... (Markdown supported)",
  minHeight = "200px",
  "data-testid": testId,
}: RichTextEditorProps) {
  const [activeTab, setActiveTab] = useState<"write" | "preview">("write");

  const insertMarkdown = (prefix: string, suffix: string = "") => {
    const textarea = document.querySelector(`[data-testid="${testId}-textarea"]`) as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);
    const before = value.substring(0, start);
    const after = value.substring(end);

    const newText = `${before}${prefix}${selectedText}${suffix}${after}`;
    onChange(newText);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + prefix.length + selectedText.length + suffix.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const toolbarButtons = [
    { icon: Bold, label: "Bold", action: () => insertMarkdown("**", "**") },
    { icon: Italic, label: "Italic", action: () => insertMarkdown("*", "*") },
    { icon: Heading2, label: "Heading", action: () => insertMarkdown("## ") },
    { icon: List, label: "Bullet List", action: () => insertMarkdown("- ") },
    { icon: ListOrdered, label: "Numbered List", action: () => insertMarkdown("1. ") },
    { icon: Link, label: "Link", action: () => insertMarkdown("[", "](url)") },
  ];

  return (
    <div className="border rounded-md" data-testid={testId}>
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "write" | "preview")}>
        <div className="flex items-center justify-between border-b px-2 py-1 bg-muted/30">
          <div className="flex items-center gap-1">
            {toolbarButtons.map((button) => (
              <Button
                key={button.label}
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={button.action}
                title={button.label}
                data-testid={`${testId}-btn-${button.label.toLowerCase().replace(" ", "-")}`}
              >
                <button.icon className="h-4 w-4" />
              </Button>
            ))}
          </div>
          <TabsList className="h-8">
            <TabsTrigger value="write" className="text-xs px-3 py-1" data-testid={`${testId}-tab-write`}>
              Write
            </TabsTrigger>
            <TabsTrigger value="preview" className="text-xs px-3 py-1" data-testid={`${testId}-tab-preview`}>
              Preview
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="write" className="m-0">
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="border-0 rounded-none focus-visible:ring-0 resize-none"
            style={{ minHeight }}
            data-testid={`${testId}-textarea`}
          />
        </TabsContent>

        <TabsContent value="preview" className="m-0">
          <div
            className={cn(
              "px-3 py-2 prose prose-sm dark:prose-invert max-w-none overflow-auto",
              !value && "text-muted-foreground italic"
            )}
            style={{ minHeight }}
            data-testid={`${testId}-preview`}
          >
            {value ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {value}
              </ReactMarkdown>
            ) : (
              "Nothing to preview"
            )}
          </div>
        </TabsContent>
      </Tabs>

      <div className="px-3 py-1.5 border-t bg-muted/30 text-xs text-muted-foreground">
        Supports Markdown: **bold**, *italic*, ## headings, - lists, [links](url)
      </div>
    </div>
  );
}
