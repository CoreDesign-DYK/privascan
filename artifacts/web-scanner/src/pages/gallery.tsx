import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useListScans, useDeleteScan, useGetScan, getListScansQueryKey, getGetScanQueryKey } from '@workspace/api-client-react';
import { ChevronLeft, FileText, Image as ImageIcon, Trash2, Calendar, X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export default function GalleryScreen() {
  const [, setLocation] = useLocation();
  const { data: scans, isLoading } = useListScans();
  const deleteScan = useDeleteScan();
  const queryClient = useQueryClient();
  
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);
  
  const { data: selectedScan, isLoading: scanLoading } = useGetScan(selectedScanId || '', {
    query: {
      enabled: !!selectedScanId,
      queryKey: selectedScanId ? getGetScanQueryKey(selectedScanId) : ['scan', 'empty']
    }
  });

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this scan record?')) return;
    
    try {
      await deleteScan.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListScansQueryKey() });
      toast.success('Scan deleted');
    } catch (err) {
      toast.error('Failed to delete scan');
    }
  };

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="min-h-[100dvh] bg-secondary flex flex-col">
      <div className="bg-background px-4 h-16 flex items-center border-b sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => setLocation('/')} className="-ml-2 mr-2">
          <ChevronLeft className="w-6 h-6" />
        </Button>
        <h1 className="font-semibold text-lg flex-1">My Scans</h1>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-background h-24 rounded-xl border animate-pulse" />
            ))}
          </div>
        ) : scans && scans.length > 0 ? (
          <div className="space-y-4">
            {scans.map(scan => (
              <div 
                key={scan.id} 
                className="bg-background border rounded-xl p-4 flex items-center gap-4 active:scale-[0.98] transition-transform cursor-pointer shadow-sm hover:shadow-md"
                onClick={() => setSelectedScanId(scan.id)}
              >
                <div className="w-16 h-20 bg-secondary rounded-md flex-shrink-0 flex items-center justify-center overflow-hidden border">
                  {scan.thumbnailUrl ? (
                    <img src={scan.thumbnailUrl} alt={scan.name} className="w-full h-full object-cover" />
                  ) : scan.scanType === 'document' ? (
                    <FileText className="w-6 h-6 text-muted-foreground" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{scan.name}</h3>
                  
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" />
                      {scan.pageCount} page{scan.pageCount !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(scan.createdAt)}
                    </span>
                  </div>
                  
                  <div className="mt-2 flex gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary uppercase">
                      {scan.format}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-secondary text-secondary-foreground uppercase">
                      {scan.colorMode}
                    </span>
                  </div>
                </div>

                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-muted-foreground hover:text-destructive shrink-0 -mr-2"
                  onClick={(e) => handleDelete(scan.id, e)}
                >
                  <Trash2 className="w-5 h-5" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 pt-20">
            <div className="w-20 h-20 bg-background rounded-full flex items-center justify-center mb-4 shadow-sm border">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-bold mb-2">No scans yet</h2>
            <p className="text-muted-foreground mb-6">Your saved scans will appear here.</p>
            <Button onClick={() => setLocation('/')} className="rounded-full">Start Scanning</Button>
          </div>
        )}
      </div>

      <Dialog open={!!selectedScanId} onOpenChange={(open) => !open && setSelectedScanId(null)}>
        <DialogContent className="sm:max-w-md bg-background">
          <DialogHeader>
            <DialogTitle>Scan Details</DialogTitle>
            <DialogDescription>View information about this scan.</DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            {scanLoading ? (
              <div className="flex justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : selectedScan ? (
              <div className="space-y-6">
                {selectedScan.thumbnailUrl && (
                  <div className="bg-secondary rounded-lg overflow-hidden border p-2 flex justify-center">
                    <img 
                      src={selectedScan.thumbnailUrl} 
                      alt={selectedScan.name} 
                      className="max-h-48 object-contain rounded"
                    />
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground mb-1">Name</p>
                    <p className="font-medium text-foreground">{selectedScan.name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Date</p>
                    <p className="font-medium text-foreground">{formatDate(selectedScan.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Type</p>
                    <p className="font-medium text-foreground capitalize">{selectedScan.scanType}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Color Mode</p>
                    <p className="font-medium text-foreground capitalize">{selectedScan.colorMode}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Format</p>
                    <p className="font-medium text-foreground uppercase">{selectedScan.format}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Pages</p>
                    <p className="font-medium text-foreground">{selectedScan.pageCount}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Paper Size</p>
                    <p className="font-medium text-foreground">{selectedScan.paperSize}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">Scan not found</div>
            )}
          </div>
          
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setSelectedScanId(null)}>Close</Button>
            <Button onClick={() => toast.info('Download functionality goes here')}>
              <Download className="w-4 h-4 mr-2" /> Download File
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
