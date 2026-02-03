import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Maps Supabase/PostgreSQL error codes to user-friendly messages
 */
const ERROR_MESSAGES: Record<string, string> = {
  // PostgreSQL constraint violations
  '23505': 'This record already exists. Please verify the data and try again.',
  '23503': 'Cannot complete this action because related data exists.',
  '23502': 'Required fields are missing. Please fill in all required information.',
  '23514': 'The data provided does not meet validation requirements.',
  
  // RLS policy violations
  '42501': 'You do not have permission to perform this action.',
  '42P01': 'The requested resource does not exist.',
  
  // Supabase specific errors
  'PGRST301': 'Connection error. Please check your internet and try again.',
  'PGRST116': 'The requested record was not found.',
  'PGRST204': 'No data returned from the query.',
  
  // Auth errors
  'invalid_credentials': 'Invalid email or password. Please try again.',
  'email_not_confirmed': 'Please verify your email before signing in.',
  'user_already_exists': 'An account with this email already exists.',
  'weak_password': 'Password is too weak. Please use at least 8 characters.',
  'expired_token': 'Your session has expired. Please sign in again.',
  
  // Network errors
  'NetworkError': 'Network error. Please check your connection.',
  'FetchError': 'Unable to connect to the server. Please try again later.',
};

/**
 * Handles Supabase PostgrestError and returns a user-friendly message
 */
export function handleSupabaseError(error: PostgrestError | null | undefined): string {
  if (!error) return '';
  
  // Check for known error codes
  if (error.code && ERROR_MESSAGES[error.code]) {
    return ERROR_MESSAGES[error.code];
  }
  
  // Check for PGRST codes in message
  const pgrstMatch = error.message?.match(/PGRST\d+/);
  if (pgrstMatch && ERROR_MESSAGES[pgrstMatch[0]]) {
    return ERROR_MESSAGES[pgrstMatch[0]];
  }
  
  // RLS policy violation detection
  if (error.message?.includes('row-level security') || 
      error.message?.includes('RLS') ||
      error.code === '42501') {
    return 'You do not have permission to perform this action.';
  }
  
  // Foreign key violation
  if (error.code === '23503') {
    return ERROR_MESSAGES['23503'];
  }
  
  // Unique constraint violation
  if (error.code === '23505') {
    return ERROR_MESSAGES['23505'];
  }
  
  // Generic fallback - don't expose internal details
  return 'An unexpected error occurred. Please try again later.';
}

/**
 * Handles generic errors from Supabase operations
 */
export function handleGenericError(error: unknown): string {
  if (!error) return '';
  
  // Check if it's a PostgrestError
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return handleSupabaseError(error as PostgrestError);
  }
  
  // Check if it's an Error object
  if (error instanceof Error) {
    // Network errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return ERROR_MESSAGES['NetworkError'];
    }
    
    // Auth errors with message
    for (const [key, message] of Object.entries(ERROR_MESSAGES)) {
      if (error.message.toLowerCase().includes(key.toLowerCase())) {
        return message;
      }
    }
    
    // Don't expose internal error messages in production
    if (process.env.NODE_ENV === 'production') {
      return 'An unexpected error occurred. Please try again later.';
    }
    
    return error.message;
  }
  
  // String error
  if (typeof error === 'string') {
    return error;
  }
  
  return 'An unexpected error occurred. Please try again later.';
}

/**
 * Type guard for checking if an error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.name === 'TypeError' ||
      error.message.includes('fetch') ||
      error.message.includes('network') ||
      error.message.includes('Network')
    );
  }
  return false;
}

/**
 * Type guard for checking if an error is an auth error
 */
export function isAuthError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const e = error as Record<string, unknown>;
    return (
      e.code === '42501' ||
      e.code === 'PGRST301' ||
      (typeof e.message === 'string' && (
        e.message.includes('JWT') ||
        e.message.includes('auth') ||
        e.message.includes('session')
      ))
    );
  }
  return false;
}
