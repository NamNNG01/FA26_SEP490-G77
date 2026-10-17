import React from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@/assets/icons';
import { ROUTES } from '@/app/routes';
import { Container } from './Container';

/**
 * PublicFooter
 *
 * Landing-page footer: PrepExam branding, the platform one-liner (a
 * preparation platform — no certificates), and the public navigation columns.
 */
export function PublicFooter() {
  const navigate = useNavigate();

  const columns = [
    {
      title: 'Learn',
      links: [
        { label: 'Browse Courses', to: ROUTES.courses },
        { label: 'Practice Questions', to: ROUTES.courses },
        { label: 'Mock Exams', to: ROUTES.courses },
      ],
    },
    {
      title: 'Platform',
      links: [
        { label: 'Home', to: ROUTES.landing },
        { label: 'Pricing', to: ROUTES.pricing },
        { label: 'Get Started', to: ROUTES.register },
      ],
    },
  ];

  return (
    <footer className="border-t border-[#F3F4F6] bg-white dark:border-[#1F2937] dark:bg-[#111827]">
      <Container className="py-10">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          <div className="max-w-sm">
            <button
              type="button"
              onClick={() => navigate(ROUTES.landing)}
              aria-label="PrepExam home"
              className="flex cursor-pointer items-center gap-2.5"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#0D7C6C] shadow-sm">
                <Icon.Logo className="h-4.5 w-4.5 text-white" />
              </span>
              <span className="text-[16px] font-bold text-[#111827] dark:text-[#F9FAFB]">PrepExam</span>
            </button>
            <p className="mt-3 text-[13.5px] leading-relaxed text-[#6B7280] dark:text-[#D1D5DB]">
              Exam preparation for cloud and security certifications. Browse courses, practise exam-style questions and sit mock exams —
              PrepExam does not issue certificates.
            </p>
          </div>

          <div className="flex gap-12">
            {columns.map((column) => (
              <div key={column.title}>
                <p className="text-[12px] font-semibold tracking-wider text-[#111827] uppercase dark:text-[#F9FAFB]">
                  {column.title}
                </p>
                <ul className="mt-3 space-y-2">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <button
                        type="button"
                        onClick={() => navigate(link.to)}
                        className="cursor-pointer text-[13.5px] text-[#6B7280] transition-colors hover:text-[#0D7C6C] dark:text-[#D1D5DB]"
                      >
                        {link.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-[#F3F4F6] pt-6 text-center sm:flex-row sm:text-left dark:border-[#1F2937]">
          <p className="text-[13px] text-[#9CA3AF]">© {new Date().getFullYear()} PrepExam. All rights reserved.</p>
          <p className="text-[13px] text-[#9CA3AF]">Practice questions · Mock exams · AI review</p>
        </div>
      </Container>
    </footer>
  );
}