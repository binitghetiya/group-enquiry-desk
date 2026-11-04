/**
 * Brand configuration is server-owned. The public form never tells the server which brand it
 * belongs to; the page is configured with a site key, the server resolves the brand from it and
 * signs that brand into the form token (see lib/formToken.ts).
 */
export const BRAND_IDS = ['ipstudios', 'drvet', 'space42arena', 'jazzbar', 'menalead'] as const;
export type BrandId = (typeof BRAND_IDS)[number];

export interface EnquiryTypeOption {
  value: string;
  label: string;
}

export interface BrandConfig {
  id: BrandId;
  name: string;
  enquiryTypes: readonly EnquiryTypeOption[];
  /** Privacy or scope notice shown above the form. */
  notice?: string;
}

export const BRANDS: Readonly<Record<BrandId, BrandConfig>> = Object.freeze({
  ipstudios: {
    id: 'ipstudios',
    name: 'IP Studios',
    enquiryTypes: [
      { value: 'content_production', label: 'Content production' },
      { value: 'live_production', label: 'Live production' },
    ],
  },
  drvet: {
    id: 'drvet',
    name: 'DrVet Animal Hospital',
    enquiryTypes: [{ value: 'general_service', label: 'General service enquiry' }],
    notice:
      'For general service questions only. Please do not include medical records, test results or detailed pet health history - our team will collect what is needed securely.',
  },
  space42arena: {
    id: 'space42arena',
    name: 'Space42 Arena',
    enquiryTypes: [
      { value: 'venue_hire', label: 'Venue hire' },
      { value: 'event_information', label: 'Event information' },
    ],
  },
  jazzbar: {
    id: 'jazzbar',
    name: 'Jazzbar',
    enquiryTypes: [{ value: 'private_event', label: 'Private event enquiry' }],
  },
  menalead: {
    id: 'menalead',
    name: 'MENA Lead',
    enquiryTypes: [
      { value: 'project_enquiry', label: 'Project enquiry' },
      { value: 'business_partnership', label: 'Business partnership' },
    ],
  },
});

/**
 * Site keys are what a page/embed is configured with (comparable to a shortcode attribute set by
 * an editor). In a multi-site deployment this map would be keyed by the request Host instead.
 */
const SITE_KEYS: Readonly<Record<string, BrandId>> = Object.freeze({
  ipstudios: 'ipstudios',
  drvet: 'drvet',
  space42arena: 'space42arena',
  jazzbar: 'jazzbar',
  menalead: 'menalead',
});

export function brandForSiteKey(siteKey: string): BrandConfig | undefined {
  // Object.hasOwn avoids prototype keys such as "__proto__" or "constructor".
  if (!Object.hasOwn(SITE_KEYS, siteKey)) return undefined;
  const id = SITE_KEYS[siteKey];
  return id ? BRANDS[id] : undefined;
}

export function isBrandId(value: unknown): value is BrandId {
  return typeof value === 'string' && (BRAND_IDS as readonly string[]).includes(value);
}

export function isEnquiryTypeFor(brand: BrandId, enquiryType: string): boolean {
  return BRANDS[brand].enquiryTypes.some((t) => t.value === enquiryType);
}
