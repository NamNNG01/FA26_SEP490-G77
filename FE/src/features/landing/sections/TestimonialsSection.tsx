import React from 'react';
import { Container } from '../components/Container';
import { Reveal } from '../components/Reveal';
import { TestimonialCard } from '../components/TestimonialCard';
import { landingTestimonials, testimonialsSectionContent } from '../data/landingData';

/**
 * TestimonialsSection
 *
 * Section header + learner review cards rendered from the
 * landingTestimonials array with map().
 *
 * Fluid grid — auto-fit minmax(320px,1fr): 1 column on mobile, 2 on
 * tablet, 3 on desktop — adapts to viewport width and zoom fluidly.
 */
export function TestimonialsSection() {
  return (
    <section className="bg-white dark:bg-[#111827]">
      <Container className="py-[clamp(3rem,6vw,5rem)]">
        <Reveal className="text-center max-w-[min(42rem,100%)] mx-auto">
          <h2 className="text-[clamp(1.5rem,1.1rem+1.6vw,1.875rem)] font-bold text-[#111827] dark:text-[#F9FAFB] tracking-tight">
            {testimonialsSectionContent.title}
          </h2>
          <p className="text-[clamp(0.9rem,0.85rem+0.25vw,1rem)] text-[#6B7280] dark:text-[#D1D5DB] mt-[clamp(0.5rem,1vw,0.75rem)]">
            {testimonialsSectionContent.subtitle}
          </p>
        </Reveal>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-[clamp(1rem,2vw,1.25rem)] mt-[clamp(2rem,4vw,2.5rem)]">
          {landingTestimonials.map((t, i) => (
            <TestimonialCard key={t.name} testimonial={t} index={i} />
          ))}
        </div>
      </Container>
    </section>
  );
}
