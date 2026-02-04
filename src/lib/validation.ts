import { z } from 'zod';

/**
 * Reusable validation schemas for forms across the application
 * Provides consistent validation and sanitization
 */

// Email validation schema
export const emailSchema = z.string()
  .trim()
  .email('Invalid email format')
  .max(255, 'Email must be less than 255 characters');

export const optionalEmailSchema = z.string()
  .trim()
  .email('Invalid email format')
  .max(255, 'Email must be less than 255 characters')
  .optional()
  .or(z.literal(''));

// US Phone number validation
const phoneRegex = /^(\+1)?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/;

export const phoneSchema = z.string()
  .trim()
  .min(1, 'Phone number is required')
  .regex(phoneRegex, 'Invalid US phone number format')
  .transform(phone => {
    // Sanitize to digits only, remove leading 1
    const digits = phone.replace(/\D/g, '').replace(/^1/, '');
    return digits;
  });

export const optionalPhoneSchema = z.string()
  .trim()
  .regex(phoneRegex, 'Invalid US phone number format')
  .transform(phone => phone.replace(/\D/g, '').replace(/^1/, ''))
  .optional()
  .or(z.literal(''));

// Name validation
export const nameSchema = z.string()
  .trim()
  .min(1, 'Name is required')
  .max(100, 'Name must be less than 100 characters');

export const optionalNameSchema = z.string()
  .trim()
  .max(100, 'Name must be less than 100 characters')
  .optional()
  .or(z.literal(''));

// Currency/budget validation
export const currencySchema = z.coerce.number()
  .min(0, 'Cannot be negative')
  .max(999999, 'Amount too large')
  .optional()
  .nullable();

// Percentage validation
export const percentageSchema = z.coerce.number()
  .min(0, 'Cannot be negative')
  .max(100, 'Cannot exceed 100%');

// Lead form schema
export const leadFormSchema = z.object({
  first_name: optionalNameSchema,
  last_name: optionalNameSchema,
  phone: phoneSchema,
  email: optionalEmailSchema.transform(val => val || null),
  budget_min: z.string().optional().transform(val => {
    if (!val || val === '') return null;
    const num = parseFloat(val);
    return isNaN(num) || num < 0 ? null : num;
  }),
  budget_max: z.string().optional().transform(val => {
    if (!val || val === '') return null;
    const num = parseFloat(val);
    return isNaN(num) || num < 0 ? null : num;
  }),
  voucher_amount: z.string().optional().transform(val => {
    if (!val || val === '') return null;
    const num = parseFloat(val);
    return isNaN(num) || num < 0 ? null : num;
  }),
  move_in_date: z.string().optional().transform(val => val || null),
  preferred_language: z.enum(['en', 'es']).default('en'),
  status: z.string().default('new'),
  interested_property_id: z.string().optional().transform(val => val || null),
  has_voucher: z.boolean().default(false),
  voucher_status: z.string().optional().transform(val => val || null),
  housing_authority: z.string().max(100).optional().transform(val => val?.trim() || null),
  contact_preference: z.enum(['any', 'call', 'sms', 'email']).default('any'),
  sms_consent: z.boolean().default(false),
  call_consent: z.boolean().default(false),
}).refine(
  data => {
    if (data.budget_max && data.budget_min) {
      return data.budget_max >= data.budget_min;
    }
    return true;
  },
  { message: 'Max budget must be greater than min budget', path: ['budget_max'] }
);

// CSV import row validation
export const csvLeadRowSchema = z.object({
  full_name: optionalNameSchema.transform(val => val?.trim() || null),
  phone: phoneSchema,
  email: optionalEmailSchema.transform(val => val?.trim() || null),
  budget_min: z.string().optional().transform(val => {
    if (!val) return null;
    const num = parseFloat(val);
    return isNaN(num) || num < 0 ? null : num;
  }),
  budget_max: z.string().optional().transform(val => {
    if (!val) return null;
    const num = parseFloat(val);
    return isNaN(num) || num < 0 ? null : num;
  }),
  move_in_date: z.string().optional().transform(val => val?.trim() || null),
  has_voucher: z.string().optional().transform(val => val?.toLowerCase() === 'true'),
});

// User invite schema
export const userInviteSchema = z.object({
  email: emailSchema,
  full_name: nameSchema,
  role: z.enum(['admin', 'editor', 'viewer', 'leasing_agent']),
  commission_rate: percentageSchema.optional(),
});

// Type exports for use in components
export type LeadFormData = z.infer<typeof leadFormSchema>;
export type CsvLeadRow = z.infer<typeof csvLeadRowSchema>;
export type UserInviteData = z.infer<typeof userInviteSchema>;

/**
 * Validate a single CSV row and return result
 */
export function validateCsvRow(row: Record<string, string | undefined>): {
  success: boolean;
  data?: CsvLeadRow;
  errors?: string[];
} {
  const result = csvLeadRowSchema.safeParse({
    full_name: row.full_name,
    phone: row.phone,
    email: row.email,
    budget_min: row.budget_min,
    budget_max: row.budget_max,
    move_in_date: row.move_in_date,
    has_voucher: row.has_voucher,
  });

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
  };
}

/**
 * Format a phone number for display
 */
export function formatPhoneForDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '').replace(/^1/, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}
