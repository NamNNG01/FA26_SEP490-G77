import React from 'react';
import { Icon } from '@/assets/icons';

export default function CoverPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#EFF6FF] via-white to-[#F5F3FF] flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-10 py-7">
        <div className="w-9 h-9 bg-[#2563EB] rounded-[10px] flex items-center justify-center shadow-sm">
          <Icon.Brain className="w-5 h-5 text-white" />
        </div>
        <span className="text-[18px] font-bold text-[#111827] tracking-tight">CertifyAI</span>
        <div className="ml-auto flex items-center gap-2 text-[13px] font-medium text-[#6B7280]">
          <span>Design System</span>
          <span className="text-[#D1D5DB]">·</span>
          <span>v2.0</span>
          <span className="text-[#D1D5DB]">·</span>
          <span>2026</span>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-10 py-20 text-center">
        <div className="mb-6 flex items-center gap-2 px-4 py-2 bg-[#EFF6FF] border border-[#BFDBFE] rounded-full">
          <Icon.Zap className="w-4 h-4 text-[#2563EB]" />
          <span className="text-[13px] font-semibold text-[#2563EB]">AI-Powered Certificate Exam Platform</span>
        </div>

        <h1 className="text-[64px] font-extrabold text-[#111827] leading-none tracking-tight mb-6 max-w-3xl">
          Design<br />
          <span className="text-[#2563EB]">System</span>
        </h1>

        <p className="text-[18px] text-[#6B7280] max-w-xl leading-relaxed mb-12">
          A comprehensive, production-ready UI design system built for the CertifyAI exam platform. Clean, scalable, and consistent.
        </p>

        {/* Stats row */}
        <div className="flex flex-wrap justify-center gap-8 mb-16">
          {[
            { value: '40+', label: 'Components' },
            { value: '7', label: 'User Roles' },
            { value: '60+', label: 'Screens' },
            { value: '100%', label: 'Reusable' },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className="text-[36px] font-extrabold text-[#2563EB] leading-none">{s.value}</p>
              <p className="text-[13px] text-[#9CA3AF] mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Pages grid */}
        <div className="grid grid-cols-3 gap-4 max-w-2xl w-full">
          {[
            { icon: <Icon.Layers />, label: 'Design System', desc: 'Tokens, Typography, Colors', color: '#2563EB' },
            { icon: <Icon.Package />, label: 'Components', desc: '40+ Reusable UI elements', color: '#7C3AED' },
            { icon: <Icon.Shield />, label: 'Common', desc: 'Auth, Profile, Settings', color: '#059669' },
            { icon: <Icon.Book />, label: 'Student', desc: 'Learn, Exam, Certify', color: '#D97706' },
            { icon: <Icon.FileText />, label: 'Content Manager', desc: 'Questions, Exams, Reports', color: '#0891B2' },
            { icon: <Icon.Cpu />, label: 'Admin', desc: 'Users, Analytics, System', color: '#DC2626' },
          ].map(p => (
            <div key={p.label} className="card p-4 text-left hover:shadow-md transition-shadow cursor-default">
              <div className="w-9 h-9 rounded-[8px] flex items-center justify-center mb-3" style={{ background: `${p.color}15` }}>
                <div className="w-5 h-5" style={{ color: p.color }}>{p.icon}</div>
              </div>
              <p className="text-[14px] font-semibold text-[#111827]">{p.label}</p>
              <p className="text-[12px] text-[#9CA3AF] mt-0.5">{p.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="flex items-center justify-between px-10 py-6 border-t border-[#F3F4F6]">
        <p className="text-[13px] text-[#9CA3AF]">CertifyAI Design System — Internal Use</p>
        <div className="flex items-center gap-6">
          {['Inter', '8px Grid', '10px Radius', '#2563EB Primary'].map(t => (
            <span key={t} className="text-[12px] font-mono text-[#9CA3AF]">{t}</span>
          ))}
        </div>
      </footer>
    </div>
  );
}
