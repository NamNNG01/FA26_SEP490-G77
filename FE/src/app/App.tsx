import React, { useState } from 'react';
import { Icon } from '@/assets/icons';
import { NAV, SECTIONS, FULLSCREEN } from './routes.tsx';
import { renderPage } from './router';

export default function App() {
  const [active, setActive] = useState('cover');
  const [routeParams, setRouteParams] = useState<Record<string, string> | undefined>(undefined);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['common']));

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const navigate = (id: string, params?: Record<string, string>) => {
    setRouteParams(params);
    setActive(id);
  };

  if (FULLSCREEN.has(active)) {
    return (
      <div className="relative">
        {renderPage(active, navigate, routeParams)}
        {/* Nav overlay for fullscreen pages */}
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-white/95 backdrop-blur-sm border border-[#E5E7EB] rounded-full px-3 py-2 shadow-xl">
          {NAV.map(n => (
            <button key={n.id} onClick={() => setActive(n.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-all
                ${active === n.id ? 'bg-[#2563EB] text-white' : 'text-[#6B7280] hover:text-[#374151] hover:bg-[#F3F4F6]'}`}>
              <span className="w-3.5 h-3.5">{n.icon}</span>
              {n.label}
            </button>
          ))}
          <div className="w-px h-4 bg-[#E5E7EB] mx-1" />
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => { setActive(s.items[0].id); setExpandedSections(new Set([s.id])); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-all text-[#6B7280] hover:text-[#374151] hover:bg-[#F3F4F6]`}>
              <span className="w-3.5 h-3.5" style={{ color: s.color }}>{s.icon}</span>
              {s.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Determine active section for user context
  const activeSection = SECTIONS.find(s => s.items.some(i => i.id === active));

  const userCtx = activeSection?.id === 'student' ? { name: 'Alexandra Chen', role: 'Student' }
    : activeSection?.id === 'content-manager' ? { name: 'Priya Nair', role: 'Content Manager' }
    : activeSection?.id === 'admin' ? { name: 'Tom Williams', role: 'Admin' }
    : { name: 'Design System', role: 'Preview' };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#F9FAFB]">
      {/* Topbar */}
      <header className="h-14 bg-white border-b border-[#F3F4F6] flex items-center px-4 gap-3 flex-shrink-0 z-40">
        <div className="flex items-center gap-2.5 w-56 max-w-[30%] flex-shrink-0">
          <div className="w-7 h-7 bg-[#2563EB] rounded-[8px] flex items-center justify-center">
            <Icon.Brain className="w-4 h-4 text-white" />
          </div>
          <span className="text-[15px] font-bold text-[#111827]">CertifyAI</span>
          <span className="text-[11px] text-[#D1D5DB] font-medium ml-1">DS</span>
        </div>
        <div className="flex-1" />
        {/* Quick navigation pills */}
        <div className="flex items-center gap-1">
          {NAV.map(n => (
            <button key={n.id} onClick={() => setActive(n.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12.5px] font-medium transition-all
                ${active === n.id ? 'bg-[#EFF6FF] text-[#2563EB]' : 'text-[#6B7280] hover:text-[#374151] hover:bg-[#F3F4F6]'}`}>
              {n.label}
            </button>
          ))}
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => { setActive(s.items[0].id); setExpandedSections(new Set([s.id])); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12.5px] font-medium transition-all
                ${activeSection?.id === s.id ? 'text-white' : 'text-[#6B7280] hover:text-[#374151] hover:bg-[#F3F4F6]'}`}
              style={activeSection?.id === s.id ? { background: s.color } : {}}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button className="relative p-2 text-[#6B7280] hover:text-[#374151] hover:bg-[#F3F4F6] rounded-[8px] transition-colors">
          <Icon.Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#DC2626] rounded-full" />
        </button>
        <div className="flex items-center gap-2.5 ml-1 pl-3 border-l border-[#F3F4F6]">
          <div className="w-8 h-8 rounded-full bg-[#2563EB] flex items-center justify-center text-[12px] font-bold text-white">
            {userCtx.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div className="hidden sm:block">
            <p className="text-[13px] font-semibold text-[#111827] leading-tight">{userCtx.name}</p>
            <p className="text-[11px] text-[#9CA3AF] leading-tight">{userCtx.role}</p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 max-w-[25%] min-w-[200px] bg-white border-r border-[#F3F4F6] flex flex-col flex-shrink-0 overflow-y-auto">
          <div className="p-3 flex-1">
            {/* Overview items */}
            <div className="mb-2">
              <p className="px-3 mb-1.5 text-[10.5px] font-semibold text-[#9CA3AF] uppercase tracking-wider">Overview</p>
              {NAV.map(n => (
                <button key={n.id} onClick={() => setActive(n.id)}
                  className={`sidebar-link w-full ${active === n.id ? 'active' : ''}`}>
                  <span className="w-4 h-4 flex-shrink-0">{n.icon}</span>
                  <span>{n.label}</span>
                </button>
              ))}
            </div>

            {/* Sections */}
            {SECTIONS.map(section => (
              <div key={section.id} className="mt-2">
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-[8px] hover:bg-[#F9FAFB] transition-colors"
                >
                  <span className="w-4 h-4" style={{ color: section.color }}>{section.icon}</span>
                  <span className="flex-1 text-left text-[11.5px] font-semibold text-[#374151] uppercase tracking-wider">{section.label}</span>
                  <Icon.ChevronDown className={`w-3.5 h-3.5 text-[#9CA3AF] transition-transform ${expandedSections.has(section.id) ? 'rotate-180' : ''}`} />
                </button>
                {expandedSections.has(section.id) && (
                  <div className="ml-2">
                    {section.items.map(item => (
                      <button key={item.id} onClick={() => setActive(item.id)}
                        className={`sidebar-link w-full ${active === item.id ? 'active' : ''}`}>
                        <span className="w-4 h-4 flex-shrink-0">{item.icon}</span>
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
{renderPage(active, navigate, routeParams)}
        </main>
      </div>
    </div>
  );
}
