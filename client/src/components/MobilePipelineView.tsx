import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from "@/components/ui/accordion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ChevronRight, MoreVertical, Eye, ArrowRight, LucideIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export interface PipelineStage {
  id: string;
  label: string;
  color: string;
  icon?: LucideIcon;
}

export interface PipelineCard {
  id: string;
  title: string;
  subtitle: string;
  photoUrl?: string;
  createdAt?: string | Date;
  badges?: Array<{
    label: string;
    variant?: "default" | "secondary" | "outline" | "destructive";
  }>;
  customActions?: React.ReactNode;
}

interface MobilePipelineViewProps {
  stages: PipelineStage[];
  cards: PipelineCard[];
  getCardsByStage: (stageId: string) => PipelineCard[];
  onMoveCard?: (cardId: string, newStageId: string) => void;
  onViewCard?: (card: PipelineCard) => void;
  onCardClick?: (card: PipelineCard) => void;
  renderCardContent?: (card: PipelineCard) => React.ReactNode;
  emptyStateText?: string;
}

export default function MobilePipelineView({
  stages,
  cards,
  getCardsByStage,
  onMoveCard,
  onViewCard,
  onCardClick,
  renderCardContent,
  emptyStateText = "No items",
}: MobilePipelineViewProps) {
  const [moveSheetOpen, setMoveSheetOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<PipelineCard | null>(null);
  const [selectedStage, setSelectedStage] = useState<string>("");
  const [expandedStages, setExpandedStages] = useState<string[]>([]);

  const handleOpenMoveSheet = (card: PipelineCard, currentStageId: string) => {
    setSelectedCard(card);
    setSelectedStage(currentStageId);
    setMoveSheetOpen(true);
  };

  const handleMoveCard = (newStageId: string) => {
    if (selectedCard && onMoveCard) {
      onMoveCard(selectedCard.id, newStageId);
    }
    setMoveSheetOpen(false);
    setSelectedCard(null);
  };

  const getTimeAgo = (date?: string | Date) => {
    if (!date) return "";
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true });
    } catch {
      return "";
    }
  };

  return (
    <div className="space-y-2">
      <Accordion
        type="multiple"
        value={expandedStages}
        onValueChange={setExpandedStages}
        className="space-y-2"
      >
        {stages.map((stage) => {
          const stageCards = getCardsByStage(stage.id);
          const StageIcon = stage.icon;
          
          return (
            <AccordionItem
              key={stage.id}
              value={stage.id}
              className="border rounded-lg overflow-hidden"
              data-testid={`accordion-stage-${stage.id}`}
            >
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center justify-between w-full pr-2">
                  <div className="flex items-center gap-3">
                    <div className={`h-3 w-3 rounded-full ${stage.color}`} />
                    {StageIcon && <StageIcon className="h-4 w-4 text-muted-foreground" />}
                    <span className="font-medium text-sm">{stage.label}</span>
                  </div>
                  <Badge variant="secondary" className="ml-2" data-testid={`badge-count-${stage.id}`}>
                    {stageCards.length}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-2 pb-2">
                {stageCards.length === 0 ? (
                  <div className="flex h-16 items-center justify-center text-sm text-muted-foreground border-2 border-dashed rounded-md">
                    {emptyStateText}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {stageCards.map((card) => (
                      <Card
                        key={card.id}
                        className="active-elevate-2"
                        data-testid={`card-pipeline-${card.id}`}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-start gap-3">
                            {card.photoUrl && (
                              <img
                                src={card.photoUrl}
                                alt=""
                                className="h-12 w-12 rounded-md object-cover shrink-0"
                              />
                            )}
                            {!card.photoUrl && (
                              <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center shrink-0">
                                <span className="text-lg font-semibold text-muted-foreground">
                                  {card.title.charAt(0).toUpperCase()}
                                </span>
                              </div>
                            )}
                            
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate" data-testid={`text-card-title-${card.id}`}>
                                {card.title}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {card.subtitle}
                                {card.createdAt && (
                                  <span> • {getTimeAgo(card.createdAt)}</span>
                                )}
                              </p>
                              
                              {card.badges && card.badges.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {card.badges.map((badge, idx) => (
                                    <Badge 
                                      key={idx} 
                                      variant={badge.variant || "outline"} 
                                      className="text-xs"
                                    >
                                      {badge.label}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              
                              {renderCardContent && renderCardContent(card)}
                              {card.customActions}
                            </div>
                            
                            <div className="flex items-center gap-1 shrink-0">
                              {onViewCard && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => onViewCard(card)}
                                  data-testid={`button-view-${card.id}`}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}
                              {onMoveCard && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleOpenMoveSheet(card, stage.id)}
                                  data-testid={`button-move-${card.id}`}
                                >
                                  <ArrowRight className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      <Sheet open={moveSheetOpen} onOpenChange={setMoveSheetOpen}>
        <SheetContent side="bottom" className="h-auto max-h-[70vh]">
          <SheetHeader className="pb-4">
            <SheetTitle>Move to...</SheetTitle>
          </SheetHeader>
          <div className="space-y-2 pb-4">
            {stages.map((stage) => {
              const isCurrentStage = stage.id === selectedStage;
              const StageIcon = stage.icon;
              
              return (
                <Button
                  key={stage.id}
                  variant={isCurrentStage ? "secondary" : "outline"}
                  className="w-full justify-start gap-3 h-12"
                  disabled={isCurrentStage}
                  onClick={() => handleMoveCard(stage.id)}
                  data-testid={`button-move-to-${stage.id}`}
                >
                  <div className={`h-3 w-3 rounded-full ${stage.color}`} />
                  {StageIcon && <StageIcon className="h-4 w-4" />}
                  <span>{stage.label}</span>
                  {isCurrentStage && (
                    <Badge variant="outline" className="ml-auto">Current</Badge>
                  )}
                </Button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
