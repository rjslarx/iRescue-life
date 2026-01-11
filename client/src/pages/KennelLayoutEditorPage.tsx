import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Grid, Save, RotateCcw, Trash2, Move, Hash, ListOrdered } from 'lucide-react';
import type { Kennel } from '@shared/schema';
import DashboardLayout from '@/components/DashboardLayout';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';

interface GridPosition {
  row: number;
  col: number;
  kennelId: string;
}

interface AssignDialogState {
  open: boolean;
  position: { row: number; col: number } | null;
  existingKennelId?: string;
}

interface SequentialDialogState {
  open: boolean;
  startNumber: number;
}

interface RowBasedDialogState {
  open: boolean;
  rowFormat: 'letters' | 'numbers';
}

const STORAGE_KEY_SEQ_START = 'kennel-auto-number-seq-start';
const STORAGE_KEY_ROW_FORMAT = 'kennel-auto-number-row-format';

export default function KennelLayoutEditorPage() {
  const { toast } = useToast();
  const [positions, setPositions] = useState<GridPosition[]>([]);
  const [assignDialog, setAssignDialog] = useState<AssignDialogState>({ open: false, position: null });
  const [selectedKennelId, setSelectedKennelId] = useState<string>('');
  const [draggedPosition, setDraggedPosition] = useState<{ row: number; col: number } | null>(null);
  
  // Auto-numbering dialogs
  const [sequentialDialog, setSequentialDialog] = useState<SequentialDialogState>({ 
    open: false, 
    startNumber: parseInt(localStorage.getItem(STORAGE_KEY_SEQ_START) || '1')
  });
  const [rowBasedDialog, setRowBasedDialog] = useState<RowBasedDialogState>({ 
    open: false, 
    rowFormat: (localStorage.getItem(STORAGE_KEY_ROW_FORMAT) as 'letters' | 'numbers') || 'letters'
  });

  const { data: kennelsData, isLoading } = useQuery<{ kennels: Kennel[] }>({
    queryKey: ['/api/kennels'],
  });

  const kennels = kennelsData?.kennels || [];

  const saveMutation = useMutation({
    mutationFn: async (updates: Array<{ id: string; gridRow: number | null; gridColumn: number | null }>) => {
      return apiRequest('POST', '/api/kennels/bulk-position', { updates });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/kennels'] });
      toast({ title: 'Success', description: 'Kennel layout saved successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const labelMutation = useMutation({
    mutationFn: async (updates: Array<{ id: string; rowLabel: string | null; kennelNumber: string | null }>) => {
      return apiRequest('POST', '/api/kennels/bulk-labels', { updates });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/kennels'] });
      toast({ title: 'Success', description: 'Kennel numbers updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Load existing positions from kennels
  useEffect(() => {
    const existingPositions: GridPosition[] = kennels
      .filter((k) => k.gridRow !== null && k.gridColumn !== null)
      .map((k) => ({
        row: k.gridRow!,
        col: k.gridColumn!,
        kennelId: k.id,
      }));
    setPositions(existingPositions);
  }, [kennels]);

  // Calculate grid dimensions
  const maxRow = Math.max(0, ...positions.map((p) => p.row)) + 1;
  const maxCol = Math.max(0, ...positions.map((p) => p.col)) + 1;
  const gridRows = Math.max(5, maxRow + 2); // Add buffer
  const gridCols = Math.max(5, maxCol + 2);

  const getKennelAtPosition = (row: number, col: number) => {
    const position = positions.find((p) => p.row === row && p.col === col);
    if (!position) return null;
    return kennels.find((k) => k.id === position.kennelId);
  };

  const getKennelDisplay = (kennel: Kennel) => {
    if (kennel.rowLabel && kennel.kennelNumber) {
      return `${kennel.rowLabel}-${kennel.kennelNumber}`;
    }
    return kennel.name;
  };

  const availableKennels = kennels.filter((k) => 
    !positions.some((p) => p.kennelId === k.id)
  );

  const handleCellClick = (row: number, col: number, e: React.MouseEvent) => {
    // Don't open dialog if we're clicking the remove button
    if ((e.target as HTMLElement).closest('[data-remove-button]')) {
      return;
    }
    
    const kennel = getKennelAtPosition(row, col);
    if (kennel) {
      // Edit existing kennel assignment
      setSelectedKennelId(kennel.id);
      setAssignDialog({ open: true, position: { row, col }, existingKennelId: kennel.id });
    } else {
      // Add new kennel to this position
      setSelectedKennelId('');
      setAssignDialog({ open: true, position: { row, col } });
    }
  };

  const handleAssignKennel = () => {
    if (!assignDialog.position || !selectedKennelId) return;

    const { row, col } = assignDialog.position;

    // Remove old position if editing
    const newPositions = positions.filter(
      (p) => !(p.row === row && p.col === col) && p.kennelId !== selectedKennelId
    );

    // Add new position
    newPositions.push({ row, col, kennelId: selectedKennelId });
    setPositions(newPositions);

    setAssignDialog({ open: false, position: null });
    setSelectedKennelId('');
    toast({ title: 'Kennel Assigned', description: 'Click Save Layout to persist changes' });
  };

  const handleRemoveKennel = (row: number, col: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newPositions = positions.filter((p) => !(p.row === row && p.col === col));
    setPositions(newPositions);
    toast({ title: 'Kennel Removed', description: 'Click Save Layout to persist changes' });
  };

  // Drag-and-drop within grid
  const handleDragStart = (row: number, col: number, e: React.DragEvent) => {
    const kennel = getKennelAtPosition(row, col);
    if (kennel) {
      e.dataTransfer.effectAllowed = 'move';
      setDraggedPosition({ row, col });
      // Close dialog to prevent stale state during drag operations
      setAssignDialog({ open: false, position: null });
      setSelectedKennelId('');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (targetRow: number, targetCol: number, e: React.DragEvent) => {
    e.preventDefault();
    
    if (!draggedPosition) return;

    const { row: sourceRow, col: sourceCol } = draggedPosition;

    // Don't do anything if dropping on the same cell
    if (sourceRow === targetRow && sourceCol === targetCol) {
      setDraggedPosition(null);
      return;
    }

    const sourceKennel = getKennelAtPosition(sourceRow, sourceCol);
    const targetKennel = getKennelAtPosition(targetRow, targetCol);

    if (!sourceKennel) {
      setDraggedPosition(null);
      return;
    }

    // Update positions
    const newPositions = positions.filter(
      (p) => !(p.row === sourceRow && p.col === sourceCol) && !(p.row === targetRow && p.col === targetCol)
    );

    // Move source kennel to target position
    newPositions.push({ row: targetRow, col: targetCol, kennelId: sourceKennel.id });

    // If there was a kennel at target, swap it to source position
    if (targetKennel) {
      newPositions.push({ row: sourceRow, col: sourceCol, kennelId: targetKennel.id });
    }

    setPositions(newPositions);
    setDraggedPosition(null);
    toast({ title: 'Kennel Moved', description: 'Click Save Layout to persist changes' });
  };

  const handleSaveLayout = () => {
    const updates = kennels.map((kennel) => {
      const position = positions.find((p) => p.kennelId === kennel.id);
      return {
        id: kennel.id,
        gridRow: position ? position.row : null,
        gridColumn: position ? position.col : null,
      };
    });

    saveMutation.mutate(updates);
  };

  const handleResetLayout = () => {
    setPositions([]);
    toast({ title: 'Layout Reset', description: 'All kennels removed from grid. Click Save to persist.' });
  };

  // Auto-numbering: Sequential
  const handleSequentialNumber = () => {
    if (positions.length === 0) {
      toast({ 
        title: 'No Kennels Assigned', 
        description: 'Assign kennels to the grid before auto-numbering',
        variant: 'destructive'
      });
      return;
    }

    // Sort positions by row, then column (top-left to bottom-right)
    const sortedPositions = [...positions].sort((a, b) => {
      if (a.row !== b.row) return a.row - b.row;
      return a.col - b.col;
    });

    const updates = sortedPositions.map((pos, index) => ({
      id: pos.kennelId,
      rowLabel: null,
      kennelNumber: String(sequentialDialog.startNumber + index),
    }));

    // Save preference
    localStorage.setItem(STORAGE_KEY_SEQ_START, String(sequentialDialog.startNumber));

    labelMutation.mutate(updates);
    setSequentialDialog({ ...sequentialDialog, open: false });
  };

  // Auto-numbering: Row-based (physical rows)
  const handleRowBasedNumber = () => {
    if (positions.length === 0) {
      toast({ 
        title: 'No Kennels Assigned', 
        description: 'Assign kennels to the grid before auto-numbering',
        variant: 'destructive'
      });
      return;
    }

    // Group by column (which represents physical rows)
    const columnMap = new Map<number, GridPosition[]>();
    positions.forEach((pos) => {
      const existing = columnMap.get(pos.col) || [];
      existing.push(pos);
      columnMap.set(pos.col, existing);
    });

    const updates: Array<{ id: string; rowLabel: string | null; kennelNumber: string | null }> = [];

    // Sort columns
    const sortedColumns = Array.from(columnMap.keys()).sort((a, b) => a - b);

    sortedColumns.forEach((col, colIndex) => {
      const rowLabel = rowBasedDialog.rowFormat === 'letters' 
        ? String.fromCharCode(65 + colIndex) // A, B, C...
        : String(colIndex + 1); // 1, 2, 3...

      const colPositions = columnMap.get(col)!;
      // Sort by row within the column
      colPositions.sort((a, b) => a.row - b.row);

      colPositions.forEach((pos, index) => {
        updates.push({
          id: pos.kennelId,
          rowLabel,
          kennelNumber: String(index + 1),
        });
      });
    });

    // Save preference
    localStorage.setItem(STORAGE_KEY_ROW_FORMAT, rowBasedDialog.rowFormat);

    labelMutation.mutate(updates);
    setRowBasedDialog({ ...rowBasedDialog, open: false });
  };

  const getPhysicalRowLabel = (col: number) => {
    // Find all unique columns in positions
    const uniqueCols = Array.from(new Set(positions.map(p => p.col))).sort((a, b) => a - b);
    const colIndex = uniqueCols.indexOf(col);
    if (colIndex === -1) return `Col ${col + 1}`;
    
    const format = (localStorage.getItem(STORAGE_KEY_ROW_FORMAT) || 'letters') as 'letters' | 'numbers';
    if (format === 'letters') {
      return `Row ${String.fromCharCode(65 + colIndex)}`;
    }
    return `Row ${colIndex + 1}`;
  };

  return (
    <DashboardLayout
      title="Kennel Layout Editor"
      description="Arrange kennels in your facility and assign numbers"
    >
      <div className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Tip:</strong> In the grid below, each <strong>vertical column</strong> represents a <strong>physical row</strong> in your facility (like a line of kennels along a wall).
            Use auto-numbering to quickly assign kennel identifiers.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>Layout Controls</CardTitle>
            <CardDescription>
              Click empty cells to assign kennels • Drag filled cells to rearrange • Use auto-number for quick setup
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleSaveLayout}
                disabled={saveMutation.isPending}
                data-testid="button-save-layout"
              >
                <Save className="h-4 w-4 mr-2" />
                {saveMutation.isPending ? 'Saving...' : 'Save Layout'}
              </Button>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline"
                    disabled={positions.length === 0}
                    data-testid="button-auto-number"
                  >
                    <Hash className="h-4 w-4 mr-2" />
                    Auto-Number
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem 
                    onClick={() => setSequentialDialog({ ...sequentialDialog, open: true })}
                    data-testid="menu-sequential-number"
                  >
                    <ListOrdered className="h-4 w-4 mr-2" />
                    Sequential (1, 2, 3...)
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => setRowBasedDialog({ ...rowBasedDialog, open: true })}
                    data-testid="menu-row-based-number"
                  >
                    <Grid className="h-4 w-4 mr-2" />
                    By Physical Row (A-1, B-1...)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="outline"
                onClick={handleResetLayout}
                data-testid="button-reset-layout"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset Layout
              </Button>
            </div>
            <div className="mt-4 p-3 bg-muted rounded-md">
              <p className="text-sm">
                <span className="font-medium">Available Kennels:</span>{' '}
                {availableKennels.length} of {kennels.length}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {availableKennels.length === 0
                  ? 'All kennels are assigned to the layout'
                  : 'Click any empty cell to assign a kennel'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Facility Layout Grid</CardTitle>
            <CardDescription>
              Each column below = one physical row in your facility
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading kennels...</p>
            ) : (
              <div
                className="grid gap-2 max-w-full overflow-auto"
                style={{
                  gridTemplateColumns: `repeat(${gridCols}, minmax(140px, 1fr))`,
                }}
              >
                {Array.from({ length: gridRows * gridCols }).map((_, index) => {
                  const row = Math.floor(index / gridCols);
                  const col = index % gridCols;
                  const kennel = getKennelAtPosition(row, col);
                  const isDragging = draggedPosition?.row === row && draggedPosition?.col === col;

                  // Show physical row label for first row
                  const showPhysicalRowLabel = row === 0 && positions.some(p => p.col === col);

                  return (
                    <div key={`${row}-${col}`} className="relative">
                      {showPhysicalRowLabel && (
                        <div className="absolute -top-6 left-0 right-0 text-center">
                          <Badge variant="outline" className="text-xs">
                            {getPhysicalRowLabel(col)}
                          </Badge>
                        </div>
                      )}
                      <div
                        draggable={!!kennel}
                        onDragStart={(e) => handleDragStart(row, col, e)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(row, col, e)}
                        onClick={(e) => handleCellClick(row, col, e)}
                        className={`
                          min-h-[100px] p-3 border-2 rounded-md
                          transition-all cursor-pointer
                          ${isDragging ? 'opacity-50 scale-95' : ''}
                          ${
                            kennel
                              ? 'bg-accent border-accent-border hover-elevate cursor-move'
                              : 'bg-muted/30 border-dashed border-border hover:bg-muted/50'
                          }
                        `}
                        data-testid={`grid-cell-${row}-${col}`}
                      >
                        {kennel ? (
                          <div className="h-full flex flex-col">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                <Move className="h-3 w-3 text-muted-foreground shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">
                                    {getKennelDisplay(kennel)}
                                  </p>
                                  {kennel.rowLabel && kennel.kennelNumber && (
                                    <p className="text-xs text-muted-foreground truncate mt-1">
                                      {kennel.name}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => handleRemoveKennel(row, col, e)}
                                className="h-6 w-6 p-0 shrink-0"
                                data-testid={`button-remove-${kennel.id}`}
                                data-remove-button="true"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                            <Badge variant="outline" className="mt-auto w-fit text-xs">
                              Grid: R{row + 1} C{col + 1}
                            </Badge>
                          </div>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center gap-2">
                            <Grid className="h-6 w-6 text-muted-foreground/30" />
                            <p className="text-xs text-muted-foreground/50">
                              R{row + 1} C{col + 1}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Assign Kennel Dialog */}
      <Dialog open={assignDialog.open} onOpenChange={(open) => {
        if (!open) {
          setAssignDialog({ open: false, position: null });
          setSelectedKennelId('');
        }
      }}>
        <DialogContent data-testid="dialog-assign-kennel">
          <DialogHeader>
            <DialogTitle>
              {assignDialog.existingKennelId ? 'Edit Kennel Assignment' : 'Assign Kennel to Cell'}
            </DialogTitle>
            <DialogDescription>
              {assignDialog.position && (
                <>Grid Position: Row {assignDialog.position.row + 1}, Column {assignDialog.position.col + 1}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="kennel-select">Select Kennel</Label>
              <Select
                value={selectedKennelId}
                onValueChange={setSelectedKennelId}
              >
                <SelectTrigger id="kennel-select" data-testid="select-kennel">
                  <SelectValue placeholder="Choose a kennel..." />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    // Build kennel list for dropdown
                    if (!assignDialog.existingKennelId) {
                      return availableKennels;
                    }
                    // When editing, include the currently assigned kennel
                    const existingKennel = kennels.find((k) => k.id === assignDialog.existingKennelId);
                    return existingKennel 
                      ? [...availableKennels, existingKennel]
                      : availableKennels;
                  })().map((kennel) => (
                    <SelectItem key={kennel.id} value={kennel.id}>
                      {getKennelDisplay(kennel)}
                      {kennel.rowLabel && kennel.kennelNumber && (
                        <span className="text-xs text-muted-foreground ml-2">
                          ({kennel.name})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableKennels.length === 0 && !assignDialog.existingKennelId && (
                <p className="text-xs text-muted-foreground mt-2">
                  No kennels available. All kennels are already assigned.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAssignDialog({ open: false, position: null });
                setSelectedKennelId('');
              }}
              data-testid="button-cancel-assign"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAssignKennel}
              disabled={!selectedKennelId}
              data-testid="button-confirm-assign"
            >
              {assignDialog.existingKennelId ? 'Update' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sequential Numbering Dialog */}
      <Dialog open={sequentialDialog.open} onOpenChange={(open) => {
        if (!open) setSequentialDialog({ ...sequentialDialog, open: false });
      }}>
        <DialogContent data-testid="dialog-sequential-number">
          <DialogHeader>
            <DialogTitle>Sequential Numbering</DialogTitle>
            <DialogDescription>
              Number kennels sequentially based on grid position (top-left to bottom-right)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="start-number">Start at which number?</Label>
              <Input
                id="start-number"
                type="number"
                min="1"
                value={sequentialDialog.startNumber}
                onChange={(e) => setSequentialDialog({ 
                  ...sequentialDialog, 
                  startNumber: parseInt(e.target.value) || 1 
                })}
                data-testid="input-start-number"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Kennels will be numbered: {sequentialDialog.startNumber}, {sequentialDialog.startNumber + 1}, {sequentialDialog.startNumber + 2}...
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSequentialDialog({ ...sequentialDialog, open: false })}
              data-testid="button-cancel-sequential"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSequentialNumber}
              disabled={labelMutation.isPending}
              data-testid="button-confirm-sequential"
            >
              {labelMutation.isPending ? 'Applying...' : 'Apply Numbering'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Row-Based Numbering Dialog */}
      <Dialog open={rowBasedDialog.open} onOpenChange={(open) => {
        if (!open) setRowBasedDialog({ ...rowBasedDialog, open: false });
      }}>
        <DialogContent data-testid="dialog-row-based-number">
          <DialogHeader>
            <DialogTitle>Row-Based Numbering</DialogTitle>
            <DialogDescription>
              Number kennels by physical row (each vertical column in the grid)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Row Label Format</Label>
              <Select
                value={rowBasedDialog.rowFormat}
                onValueChange={(value: 'letters' | 'numbers') => 
                  setRowBasedDialog({ ...rowBasedDialog, rowFormat: value })
                }
              >
                <SelectTrigger data-testid="select-row-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="letters">Letters (A, B, C...)</SelectItem>
                  <SelectItem value="numbers">Numbers (1, 2, 3...)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-2">
                Example: Row {rowBasedDialog.rowFormat === 'letters' ? 'A' : '1'} → kennels {rowBasedDialog.rowFormat === 'letters' ? 'A' : '1'}-1, {rowBasedDialog.rowFormat === 'letters' ? 'A' : '1'}-2, {rowBasedDialog.rowFormat === 'letters' ? 'A' : '1'}-3...
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRowBasedDialog({ ...rowBasedDialog, open: false })}
              data-testid="button-cancel-row-based"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRowBasedNumber}
              disabled={labelMutation.isPending}
              data-testid="button-confirm-row-based"
            >
              {labelMutation.isPending ? 'Applying...' : 'Apply Numbering'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
