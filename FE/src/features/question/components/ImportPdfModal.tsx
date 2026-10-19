import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';
import type { ExtractedQuestion } from '../model';

type QuestionForm = ExtractedQuestion & { id: string; moduleId: string };

const sampleExtracted: Omit<QuestionForm, 'id'>[] = [
  {
    text: 'What is gradient descent and how does it work?', moduleId: '', difficulty: 'medium', type: 'mcq',
    options: [
      { label: 'A', text: 'It minimizes the cost function by iteratively updating parameters' },
      { label: 'B', text: 'It maximizes the training set size' },
      { label: 'C', text: 'It removes noise from the data' },
      { label: 'D', text: 'It converts supervised learning to unsupervised' },
    ],
    correct: 'A',
  },
  {
    text: 'Explain the bias-variance tradeoff in machine learning.', moduleId: '', difficulty: 'hard', type: 'essay',
    options: [{ label: 'A', text: '' }, { label: 'B', text: '' }, { label: 'C', text: '' }, { label: 'D', text: '' }],
    correct: 'A',
  },
  {
    text: 'What is the purpose of the softmax function in classification?', moduleId: '', difficulty: 'medium', type: 'mcq',
    options: [
      { label: 'A', text: 'Convert logits into probabilities over classes' },
      { label: 'B', text: 'Squeeze values into the range [-1, 1]' },
      { label: 'C', text: 'Drop out neurons at random' },
      { label: 'D', text: 'Normalize inputs to unit variance' },
    ],
    correct: 'A',
  },
  {
    text: 'How does cross-entropy loss differ from mean squared error?', moduleId: '', difficulty: 'hard', type: 'mcq',
    options: [
      { label: 'A', text: 'Cross-entropy measures divergence between two probability distributions' },
      { label: 'B', text: 'Cross-entropy is only used for regression' },
      { label: 'C', text: 'They are mathematically identical' },
      { label: 'D', text: 'MSE requires softmax activation' },
    ],
    correct: 'A',
  },
];

const runOcrApi = (): Promise<Omit<QuestionForm, 'id'>[]> =>
  new Promise(resolve => setTimeout(() => resolve(sampleExtracted.map(q => ({ ...q, options: q.options.map(o => ({ ...o })) }))), 1600));

export function ImportPdfModal({ open, onClose, onImported }: {
  open: boolean; onClose: () => void; onImported: (questions: QuestionForm[]) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setDragOver(false);
      setUploading(false);
    }
  }, [open]);

  const acceptFile = (f?: File | null) => {
    if (f) setFile(f);
  };

  const handleUpload = async () => {
    if (!file || uploading) return;
    setUploading(true);
    const extracted = await runOcrApi();
    const imported: QuestionForm[] = extracted.map((q, i) => ({ ...q, id: `ocr-${Date.now()}-${i}` }));
    onImported(imported);
  };

  const reset = () => {
    setFile(null);
    setDragOver(false);
    setUploading(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={() => { if (!uploading) reset(); }}
      title="Import Questions from PDF or Image"
      footer={
        <>
          <Button variant="outline" onClick={reset} disabled={uploading}>Cancel</Button>
          <Button onClick={handleUpload} loading={uploading} disabled={!file} icon={<Icon.Upload className="w-4 h-4" />}>
            {uploading ? 'Uploading & extracting…' : 'Upload'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); acceptFile(e.dataTransfer.files?.[0]); }}
          className={`card p-8 text-center border-2 border-dashed transition-colors cursor-pointer ${dragOver ? 'border-brand-600 bg-primary-light' : 'border-brand-line bg-primary-light'}`}
          onClick={() => document.getElementById('import-file-input')?.click()}
        >
          <Icon.Upload className="w-10 h-10 text-brand-ink mx-auto mb-3" />
          <p className="text-base font-semibold text-brand-ink-strong">Drag & drop here or click to browse</p>
          <p className="text-xs text-content-soft mt-1">Supports PDF, PNG, JPG, JPEG up to 50MB</p>
          <input
            id="import-file-input"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.docx"
            className="hidden"
            onChange={e => { acceptFile(e.target.files?.[0]); e.target.value = ''; }}
          />
        </div>

        {file ? (
          <div className="flex items-center gap-3 p-3 bg-surface-alt rounded-[10px]">
            <Icon.FileText className="w-5 h-5 text-brand-ink flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-content-secondary truncate">{file.name}</p>
              <p className="text-2xs text-content-subtle">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
            <button onClick={() => setFile(null)} disabled={uploading} className="text-content-subtle hover:text-danger p-1"><Icon.X className="w-4 h-4" /></button>
          </div>
        ) : (
          <Alert type="info" title="No file selected" message="Choose a PDF or image to extract questions with AI." />
        )}

        {uploading && <Alert type="info" title="Processing" message="Uploading file and running OCR to extract questions…" />}
      </div>
    </Modal>
  );
}
