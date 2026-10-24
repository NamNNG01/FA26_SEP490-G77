import React, { useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/assets/icons';
import { useToast } from '@/components/ui/ToastHost';
import { examService, type ImportExamResponse } from '@/services/exam.service';

interface ImportQuestionsModalProps {
  open: boolean;
  examId: number;
  onClose: () => void;
  onSuccess: () => void;
}

export function ImportQuestionsModal({
  open,
  examId,
  onClose,
  onSuccess,
}: ImportQuestionsModalProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [defaultWeight, setDefaultWeight] = useState<number>(1);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportExamResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const MSG12 = 'Invalid file format or file cannot be extracted. Please select a PDF, DOCX, or TXT file under 10MB.';
  const MSG13 = 'Questions imported successfully.';
  const MSG14 = 'Skipped duplicate questions:';

  const resetState = () => {
    setFile(null);
    setDefaultWeight(1);
    setUploading(false);
    setResult(null);
    setErrorMsg('');
  };

  const handleClose = () => {
    if (uploading) return;
    if (result) {
      onSuccess();
    }
    resetState();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const allowedExts = ['.pdf', '.docx', '.txt'];
    const lowerName = selected.name.toLowerCase();
    const isAllowed = allowedExts.some((ext) => lowerName.endsWith(ext));

    if (!isAllowed || selected.size > 10 * 1024 * 1024) {
      setErrorMsg(MSG12);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setErrorMsg('');
    setFile(selected);
  };

  const handleUpload = async () => {
    if (!file) {
      setErrorMsg('Please select a file to import.');
      return;
    }

    setUploading(true);
    setErrorMsg('');
    try {
      const weight = Number(defaultWeight);
      if (!Number.isFinite(weight) || weight <= 0 || weight > 1000 || (String(weight).split('.')[1]?.length ?? 0) > 2) {
        setErrorMsg('Weight must be greater than 0, no more than 1,000, and have up to 2 decimal places.');
        return;
      }

      const previewData = new FormData();
      previewData.append('file', file);
      previewData.append('dryRun', 'true');
      const preview = await examService.importQuestions(examId, previewData);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('itemsJson', JSON.stringify(
        Array.from({ length: preview.imported }, (_, index) => ({ index, weight })),
      ));
      const res = await examService.importQuestions(examId, formData);
      setResult(res);
      toast.success(MSG13);
    } catch (err: unknown) {
      const errorObj = err as { response?: { status?: number; data?: { message?: string } } };
      if (errorObj?.response?.status === 409) {
        toast.error('The exam is currently published. Please unpublish the exam first before importing questions.', { title: 'Could not import questions', duration: null });
      } else if (errorObj?.response?.status === 400) {
        toast.error(errorObj.response.data?.message || MSG12, { title: 'Could not import questions', duration: null });
      } else {
        toast.error(errorObj?.response?.data?.message || 'Failed to import questions.', { title: 'Could not import questions', duration: null });
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Import Questions from Document"
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          {result ? (
            <Button
              onClick={() => {
                onSuccess();
                handleClose();
              }}
              icon={<Icon.Check className="w-4 h-4" />}
            >
              Done & Refresh Exam
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose} disabled={uploading}>
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!file || uploading}
                loading={uploading}
                icon={<Icon.Upload className="w-4 h-4" />}
              >
                Upload & Import
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {result ? (
          <div className="p-4 bg-success-light/40 border border-success-line rounded-[10px] space-y-2">
            <div className="flex items-center gap-2 text-success font-semibold text-sm">
              <Icon.CheckCircle className="w-5 h-5 flex-shrink-0" />
              <span>{MSG13}</span>
            </div>
            <div className="text-xs text-content space-y-1 pl-7">
              <p>• Newly created & attached: <strong>{result.imported}</strong> questions</p>
              <p>• Reused from question bank: <strong>{result.reused}</strong> questions</p>
              {result.skippedDuplicates > 0 && (
                <p className="text-warning font-medium">
                  • {MSG14} <strong>{result.skippedDuplicates}</strong>
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            {errorMsg && (
              <div className="p-3 text-xs text-danger bg-danger-light border border-danger-line rounded-[8px]">
                {errorMsg}
              </div>
            )}

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-line hover:border-brand-ink rounded-[12px] p-6 text-center cursor-pointer transition-colors bg-surface-muted/30 hover:bg-primary-light/10"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt"
                className="hidden"
                onChange={handleFileChange}
              />
              <Icon.Upload className="w-8 h-8 mx-auto text-content-subtle mb-2" />
              <p className="text-sm font-medium text-content">
                {file ? file.name : 'Click to select PDF, DOCX, or TXT file'}
              </p>
              <p className="text-xs text-content-subtle mt-1">Maximum allowed size: 10MB</p>
            </div>

            <div>
              <label className="text-sm font-medium text-content-secondary block mb-1">
                Default Weight for Imported Questions
              </label>
              <input
                type="number"
                min={0}
                max={1000}
                step={1}
                value={defaultWeight}
                onChange={(e) => setDefaultWeight(Number(e.target.value) || 0)}
                className="w-24 px-3 py-1.5 text-sm rounded-[8px] border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-brand-ink"
              />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

