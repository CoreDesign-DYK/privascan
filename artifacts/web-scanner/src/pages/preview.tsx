import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useScannerContext } from '@/contexts/scanner-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, Plus, Share, ChevronLeft, Download, Mail } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { generatePDF, downloadBlob, blobToBase64 } from '@/lib/export';
import { useCreateScan, useSendByEmail } from '@workspace/api-client-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { getListScansQueryKey } from '@workspace/api-client-react';

export default function PreviewScreen() {
  const [, setLocation] = useLocation();
  const { pages, removePage, clearPages, settings } = useScannerContext();
  const queryClient = useQueryClient();
  
  const [exportOpen, setExportOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [fileName, setFileName] = useState(() => `Scan_${new Date().toISOString().slice(0, 10)}`);
  
  const createScan = useCreateScan();
  const sendEmail = useSendByEmail();
  
  const handleDiscardAll = () => {
    if (confirm('Are you sure you want to discard all pages?')) {
      clearPages();
      setLocation('/');
    }
  };

  const saveScanRecord = async (format: 'pdf' | 'jpeg') => {
    try {
      await createScan.mutateAsync({
        data: {
          name: fileName,
          pageCount: pages.length,
          scanType: settings.scanType,
          colorMode: settings.colorMode,
          paperSize: settings.paperSize,
          format,
          thumbnailUrl: pages[0]
        }
      });
      queryClient.invalidateQueries({ queryKey: getListScansQueryKey() });
    } catch (e) {
      console.error('Failed to save scan record', e);
    }
  };

  const handleExportPDF = async () => {
    if (pages.length === 0) return;
    const toastId = toast.loading('Generating PDF...');
    try {
      const blob = await generatePDF(pages, settings.paperSize);
      downloadBlob(blob, `${fileName}.pdf`);
      await saveScanRecord('pdf');
      toast.success('PDF Exported', { id: toastId });
      setExportOpen(false);
      clearPages();
      setLocation('/gallery');
    } catch (e) {
      toast.error('Failed to export PDF', { id: toastId });
    }
  };

  const handleExportJPEG = async () => {
    if (pages.length === 0) return;
    try {
      // For multiple JPEGs, just trigger multiple downloads
      pages.forEach((page, i) => {
        const a = document.createElement('a');
        a.href = page;
        a.download = `${fileName}_page_${i + 1}.jpg`;
        a.click();
      });
      await saveScanRecord('jpeg');
      toast.success('JPEGs Exported');
      setExportOpen(false);
      clearPages();
      setLocation('/gallery');
    } catch (e) {
      toast.error('Failed to export JPEGs');
    }
  };
  
  const handleEmailPDF = async () => {
    if (!email) {
      toast.error('Please enter an email address');
      return;
    }
    if (pages.length === 0) return;
    
    const toastId = toast.loading('Preparing email...');
    try {
      const blob = await generatePDF(pages, settings.paperSize);
      const b64 = await blobToBase64(blob);
      
      await sendEmail.mutateAsync({
        data: {
          to: email,
          subject: `Document Scan: ${fileName}`,
          message: 'Here is your scanned document.',
          fileName: `${fileName}.pdf`,
          fileBase64: b64,
          mimeType: 'application/pdf'
        }
      });
      
      await saveScanRecord('pdf');
      toast.success('Email sent successfully!', { id: toastId });
      setEmailOpen(false);
      setExportOpen(false);
      clearPages();
      setLocation('/gallery');
    } catch (e) {
      toast.error('Failed to send email', { id: toastId });
    }
  };

  if (pages.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
          <Trash2 className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold mb-2">No pages yet</h2>
        <p className="text-muted-foreground mb-6">Go back to the scanner to capture some documents.</p>
        <Button onClick={() => setLocation('/')}>Back to Scanner</Button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-secondary flex flex-col">
      {/* Header */}
      <div className="bg-background px-4 h-16 flex items-center justify-between border-b sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => setLocation('/')} className="-ml-2">
          <ChevronLeft className="w-6 h-6" />
        </Button>
        <span className="font-semibold text-lg">{pages.length} Page{pages.length > 1 ? 's' : ''}</span>
        <Button variant="ghost" size="icon" onClick={handleDiscardAll} className="text-destructive -mr-2">
          <Trash2 className="w-5 h-5" />
        </Button>
      </div>

      {/* Pages List */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-32">
        {pages.map((p, i) => (
          <div key={i} className="relative group">
            <div className="absolute -top-3 -left-3 w-8 h-8 bg-black text-white rounded-full flex items-center justify-center font-bold text-sm z-10 shadow-md">
              {i + 1}
            </div>
            <div className="bg-background p-2 rounded-xl shadow-sm border">
              <img src={p} alt={`Page ${i+1}`} className="w-full h-auto rounded-lg object-contain" />
            </div>
            <button 
              onClick={() => removePage(i)}
              className="absolute -top-3 -right-3 w-8 h-8 bg-destructive text-white rounded-full flex items-center justify-center shadow-md hover:scale-105 transition-transform"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Bottom Bar */}
      <div className="bg-background border-t p-4 pb-8 sticky bottom-0 z-10 flex gap-3">
        <Button 
          variant="outline" 
          className="flex-1 h-14 rounded-full font-semibold"
          onClick={() => setLocation('/')}
        >
          <Plus className="w-5 h-5 mr-2" /> Add More
        </Button>
        <Button 
          className="flex-1 h-14 rounded-full font-semibold text-lg shadow-primary/25 shadow-lg"
          onClick={() => setExportOpen(true)}
        >
          <Share className="w-5 h-5 mr-2" /> Save & Export
        </Button>
      </div>

      {/* Export Dialog */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Export Scan</DialogTitle>
            <DialogDescription>Choose how you want to save or share your scan.</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>File Name</Label>
              <Input 
                value={fileName} 
                onChange={e => setFileName(e.target.value)} 
                placeholder="Enter file name"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="h-24 flex-col gap-2" onClick={handleExportPDF}>
                <Download className="w-6 h-6" />
                <span>Save as PDF</span>
              </Button>
              <Button variant="outline" className="h-24 flex-col gap-2" onClick={handleExportJPEG}>
                <Download className="w-6 h-6" />
                <span>Save as JPEG</span>
              </Button>
            </div>
            
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or share via</span>
              </div>
            </div>

            <Button 
              variant="secondary" 
              className="w-full h-12"
              onClick={() => {
                setExportOpen(false);
                setEmailOpen(true);
              }}
            >
              <Mail className="w-5 h-5 mr-2" /> Send by Email
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Email Dialog */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send by Email</DialogTitle>
            <DialogDescription>Send the PDF directly to an email address.</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input 
                type="email" 
                placeholder="name@example.com" 
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailOpen(false)}>Cancel</Button>
            <Button onClick={handleEmailPDF}>Send Email</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
