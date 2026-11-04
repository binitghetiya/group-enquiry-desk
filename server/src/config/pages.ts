import type { BrandId } from './brands';

/**
 * Fictional example pages that the admin-only AI SEO helper can draft metadata for.
 * Nothing here describes a real event, service, price or claim.
 */
export interface DemoPage {
  pageRef: string;
  brand: BrandId;
  title: string;
  description: string;
}

export const DEMO_PAGES: Readonly<Record<string, DemoPage>> = Object.freeze({
  'space42arena-rooftop-acoustic-night': {
    pageRef: 'space42arena-rooftop-acoustic-night',
    brand: 'space42arena',
    title: 'Rooftop Acoustic Night',
    description:
      'Fictional demo event: an evening of acoustic sets on the arena rooftop terrace. Doors open at 7pm, with seated and standing areas and food stalls. Suitable for all ages. Tickets are sold through the arena box office.',
  },
  'drvet-pet-dental-care': {
    pageRef: 'drvet-pet-dental-care',
    brand: 'drvet',
    title: 'Pet Dental Care',
    description:
      'Fictional demo service page: routine dental check-ups, scaling and polishing for cats and dogs, plus advice on at-home dental care. Appointments are arranged after an initial enquiry.',
  },
});

export function getDemoPage(pageRef: string): DemoPage | undefined {
  return Object.hasOwn(DEMO_PAGES, pageRef) ? DEMO_PAGES[pageRef] : undefined;
}
