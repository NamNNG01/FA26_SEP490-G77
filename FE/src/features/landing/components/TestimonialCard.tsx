import React from 'react';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/assets/icons';
import { Reveal } from './Reveal';
import type { LandingTestimonial } from '../data/landingData';

/**
 * TestimonialCard
 *
 * One learner-review card: star rating, score badge, quote, avatar, name
 * and role. Rendered from the landingTestimonials array with map().
 */
export function TestimonialCard({
  testimonial,
  index,
}: {
  testimonial: LandingTestimonial;
  index: number;
}) {
  return (
    <Reveal delay={index * 120} className="h-full">
      <Card className="h-full p-6 flex flex-col gap-4 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
        {/* Rating + score badge */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-0.5" aria-label={`${testimonial.rating} out of 5 stars`}>
            {Array.from({ length: 5 }, (_, i) => (
              <Icon.Star
                key={i}
                className={`w-4 h-4 ${i < testimonial.rating ? 'text-[#F59E0B]' : 'text-[#E5E7EB]'}`}
              />
            ))}
          </div>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-semibold bg-[#F0FDF4] text-[#16A34A]">
            {testimonial.scoreBadge}
          </span>
        </div>

        {/* Quote */}
        <p className="text-[14px] text-[#374151] leading-relaxed flex-1">
          “{testimonial.quote}”
        </p>

        {/* Author */}
        <div className="flex items-center gap-3 pt-1">
          <Avatar name={testimonial.name} size="md" />
          <div className="min-w-0">
            <p
              className="text-[14px] font-semibold text-[#111827]"
              style={{ overflowWrap: 'break-word' }}
            >
              {testimonial.name}
            </p>
            <p
              className="text-[12.5px] text-[#6B7280]"
              style={{ overflowWrap: 'break-word' }}
            >
              {testimonial.role}
            </p>
          </div>
        </div>
      </Card>
    </Reveal>
  );
}
