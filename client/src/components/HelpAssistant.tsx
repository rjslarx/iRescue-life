import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HelpCircle, Send, Loader2, Sparkles } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function HelpAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const { toast } = useToast();

  const askMutation = useMutation({
    mutationFn: async ({ question, conversationHistory }: { question: string, conversationHistory: Message[] }) => {
      const response = await apiRequest("POST", "/api/help-assistant", { 
        question,
        conversationHistory 
      });
      const data = await response.json();
      return data;
    },
    onSuccess: (data: any) => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer },
      ]);
      setQuestion("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to get response. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[HelpAssistant] handleSubmit called', { 
      question, 
      questionTrimmed: question.trim(),
      isPending: askMutation.isPending 
    });
    
    if (!question.trim()) {
      console.log('[HelpAssistant] Question is empty, returning');
      return;
    }
    
    if (askMutation.isPending) {
      console.log('[HelpAssistant] Mutation is pending, returning');
      return;
    }

    console.log('[HelpAssistant] Adding user message and calling mutate');
    
    // Build updated messages with the new user question
    const updatedMessages = [...messages, { role: "user", content: question }];
    
    // Add user message to display
    setMessages(updatedMessages);
    
    // Send to API with full conversation history
    console.log('[HelpAssistant] Calling askMutation.mutate with:', { question, historyLength: updatedMessages.length });
    askMutation.mutate({ question, conversationHistory: updatedMessages });
  };

  const handleNewConversation = () => {
    setMessages([]);
    setQuestion("");
  };

  const suggestedQuestions = [
    "How do I add a new animal to the system?",
    "How do I set up my custom domain with DNS?",
    "What email templates are available?",
    "How do I invite new team members?",
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="default"
          className="gap-2"
          data-testid="button-help-assistant"
        >
          <HelpCircle className="h-4 w-4" />
          <span className="hidden sm:inline">Help Assistant</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] h-[600px] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Help Assistant
          </DialogTitle>
          <DialogDescription>
            Ask me anything about how to use iRescue.life
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 px-6">
            {messages.length === 0 ? (
              <div className="space-y-4 py-4">
                <p className="text-sm text-muted-foreground">
                  Try asking a question to get started:
                </p>
                <div className="grid gap-2">
                  {suggestedQuestions.map((q, i) => (
                    <Card
                      key={i}
                      className="hover-elevate cursor-pointer"
                      onClick={() => {
                        setQuestion(q);
                      }}
                      data-testid={`suggested-question-${i}`}
                    >
                      <CardContent className="p-3 text-sm">
                        {q}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4 py-4">
                {messages.map((message, i) => (
                  <div
                    key={i}
                    className={`flex ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <Card
                      className={`max-w-[85%] ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : ""
                      }`}
                      data-testid={`message-${message.role}-${i}`}
                    >
                      <CardContent className="p-3">
                        <div className="text-sm whitespace-pre-wrap">
                          {message.content}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ))}
                {askMutation.isPending && (
                  <div className="flex justify-start">
                    <Card className="max-w-[85%]">
                      <CardContent className="p-3">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Thinking...
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          <div className="p-6 pt-4 border-t space-y-2">
            {messages.length > 0 && (
              <div className="flex justify-end mb-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNewConversation}
                  data-testid="button-new-conversation"
                >
                  New Conversation
                </Button>
              </div>
            )}
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Textarea
                placeholder="Ask a question about using the platform..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                className="min-h-[60px] resize-none"
                data-testid="input-question"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!question.trim() || askMutation.isPending}
                className="h-[60px] w-[60px] flex-shrink-0"
                data-testid="button-send"
              >
                {askMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
