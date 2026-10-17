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
    <footer className="border-t border-line-soft bg-surface">
      <Container className="py-10">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          <div className="max-w-sm">
            <button
              type="button"
              onClick={() => navigate(ROUTES.landing)}
              aria-label="PrepExam home"
              className="flex cursor-pointer items-center gap-2.5"
            >
              <Icon.Logo className="h-8 w-8 flex-shrink-0 text-brand-ink" aria-hidden="true" />
              <span className="text-lg font-bold text-content">PrepExam</span>
            </button>
            <p className="mt-3 text-sm leading-relaxed text-content-soft">
              Exam preparation for cloud and security certifications. Browse courses, practise exam-style questions and sit mock exams —
              PrepExam does not issue certificates.
            </p>
          </div>

          <div className="flex gap-12">
            {columns.map((column) => (
              <div key={column.title}>
                <p className="text-xs font-semibold tracking-wider text-content uppercase">
                  {column.title}
                </p>
                <ul className="mt-3 space-y-2">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <button
                        type="button"
                        onClick={() => navigate(link.to)}
                        className="cursor-pointer text-sm text-content-soft transition-colors hover:text-brand-ink"
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

        <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-line-soft pt-6 text-center sm:flex-row sm:text-left">
          <p className="text-sm text-content-subtle">© {new Date().getFullYear()} PrepExam. All rights reserved.</p>
          <p className="text-sm text-content-subtle">Practice questions · Mock exams · AI review</p>
        </div>
      </Container>
    </footer>
  );
}