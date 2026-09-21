import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Progress } from '@/components/ui/Progress';
import { AIHintCard } from '@/components/common/AIHintCard';
import { Icon } from '@/assets/icons';

export function OCRImportPage() {
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-5">
      <h2 className="text-[22px] font-bold text-[#111827]">OCR Question Import</h2>
      {!done ? (
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="card p-6 border-2 border-dashed border-[#BFDBFE] bg-[#F0F9FF] text-center cursor-pointer hover:bg-[#EFF6FF] transition-colors">
              <Icon.Upload className="w-10 h-10 text-[#2563EB] mx-auto mb-3" />
              <p className="text-[14px] font-semibold text-[#1E40AF]">Drop files here or click to browse</p>
              <p className="text-[12px] text-[#6B7280] mt-1">Supports PDF, DOCX, PNG, JPG up to 50MB</p>
              <Button variant="outline" size="sm" className="mt-4">Select Files</Button>
            </div>
            <Alert type="info" title="AI Processing" message="Uploaded files will be processed by our OCR + AI engine to extract and format questions automatically." />
            <Button className="w-full" loading={processing} onClick={() => { setProcessing(true); setTimeout(() => { setProcessing(false); setDone(true); }, 2000); }}>
              Start Processing
            </Button>
          </div>
          <div className="card p-5">
            <h4 className="text-[14px] font-semibold text-[#111827] mb-3">Processing Queue</h4>
            <div className="space-y-3">
              {[
                { name: 'ML_Questions_2024.pdf', size: '2.4 MB', status: 'Completed', progress: 100 },
                { name: 'DL_Exam_Bank.docx', size: '1.1 MB', status: 'Processing', progress: 67 },
                { name: 'Statistics_QB.pdf', size: '3.8 MB', status: 'Queued', progress: 0 },
              ].map(f => (
                <div key={f.name} className="flex items-center gap-3 p-3 bg-[#F9FAFB] rounded-[8px]">
                  <Icon.FileText className="w-5 h-5 text-[#2563EB] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[#374151] truncate">{f.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] text-[#9CA3AF]">{f.size}</span>
                      {f.progress > 0 && <div className="flex-1"><Progress value={f.progress} size="sm" /></div>}
                    </div>
                  </div>
                  <Badge variant={f.status === 'Completed' ? 'success' : f.status === 'Processing' ? 'info' : 'default'}>{f.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5 pb-5 border-b border-[#F3F4F6]">
            <Icon.CheckCircle className="w-6 h-6 text-[#16A34A]" />
            <div>
              <p className="text-[15px] font-semibold text-[#111827]">Processing Complete</p>
              <p className="text-[13px] text-[#6B7280]">124 questions extracted and ready for review</p>
            </div>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => setDone(false)}>Upload More</Button>
              <Button icon={<Icon.CheckCircle className="w-4 h-4" />}>Review & Import</Button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div className="card p-4 text-center"><p className="text-[24px] font-bold text-[#111827]">124</p><p className="text-[12px] text-[#9CA3AF]">Extracted</p></div>
            <div className="card p-4 text-center"><p className="text-[24px] font-bold text-[#16A34A]">118</p><p className="text-[12px] text-[#9CA3AF]">Ready</p></div>
            <div className="card p-4 text-center"><p className="text-[24px] font-bold text-[#D97706]">6</p><p className="text-[12px] text-[#9CA3AF]">Need Review</p></div>
          </div>
          <AIHintCard hint="AI has analyzed all extracted questions. 6 questions have low confidence scores and need manual verification. Click 'Review & Import' to approve them individually." expanded={true} />
        </div>
      )}
    </div>
  );
}
