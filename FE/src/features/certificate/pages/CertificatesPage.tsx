import React from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/assets/icons';

export function CertificatesPage() {
  const certs = [
    { title: 'Python for Data Science', issued: 'Aug 15, 2025', score: 92, id: 'CERT-2025-0847' },
    { title: 'SQL Fundamentals', issued: 'Jul 2, 2025', score: 88, id: 'CERT-2025-0621' },
    { title: 'Data Analysis Basics', issued: 'May 20, 2025', score: 95, id: 'CERT-2025-0412' },
    { title: 'Statistics for ML', issued: 'Mar 8, 2025', score: 81, id: 'CERT-2025-0201' },
  ];
  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[22px] font-bold text-[#111827]">My Certificates</h2>
        <Badge variant="info">{certs.length} Earned</Badge>
      </div>
      <div className="grid grid-cols-2 gap-5">
        {certs.map(c => (
          <div key={c.id} className="card p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-[#FEF3C7] to-[#FDE68A] rounded-[14px] flex items-center justify-center flex-shrink-0">
                <Icon.Award className="w-8 h-8 text-[#D97706]" />
              </div>
              <div className="flex-1">
                <h3 className="text-[16px] font-bold text-[#111827]">{c.title}</h3>
                <p className="text-[13px] text-[#6B7280] mt-0.5">Issued: {c.issued}</p>
                <div className="flex items-center gap-3 mt-2">
                  <Badge variant="success">Score: {c.score}%</Badge>
                  <code className="text-[11px] font-mono text-[#9CA3AF]">{c.id}</code>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4 pt-4 border-t border-[#F9FAFB]">
              <Button variant="outline" size="sm" icon={<Icon.Eye className="w-3.5 h-3.5" />} className="flex-1">View</Button>
              <Button size="sm" icon={<Icon.Download className="w-3.5 h-3.5" />} className="flex-1">Download PDF</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
