/**
 * Production-safe error logging utility
 * 
 * In development: Logs full error details to console
 * In production: Logs generic messages to console, detailed logs go to server
 * 
 * This prevents information disclosure via browser console in production
 */

import { logSystemEvent } from './systemLogger';

const isDevelopment = import.meta.env.DEV;

type ErrorContext = string;

interface ErrorDetails {
  context: ErrorContext;
  error: unknown;
  additionalInfo?: Record<string, unknown>;
}

/**
 * Log an error with context
 * In development: Shows full details
 * In production: Shows generic message only
 */
export function logError(context: ErrorContext, error: unknown, additionalInfo?: Record<string, unknown>): void {
  if (isDevelopment) {
    console.error(`[${context}]`, error, additionalInfo || '');
  } else {
    // In production, log minimal info to console
    console.error(`Error in ${context}`);
    
    // Send to server-side system_logs table
    logSystemEvent({
      level: 'error',
      category: 'system',
      event_type: `frontend_error_${context.toLowerCase().replace(/\s+/g, '_')}`,
      message: error instanceof Error ? error.message : String(error),
      details: {
        context,
        stack: error instanceof Error ? error.stack : undefined,
        ...additionalInfo,
      },
    }).catch(() => {
      // Silently fail - we don't want logging failures to cascade
    });
  }
}

/**
 * Log a warning with context
 * Only shown in development
 */
export function logWarn(context: ErrorContext, message: string, data?: unknown): void {
  if (isDevelopment) {
    console.warn(`[${context}]`, message, data || '');
  }
}

/**
 * Log info with context
 * Only shown in development
 */
export function logInfo(context: ErrorContext, message: string, data?: unknown): void {
  if (isDevelopment) {
    console.info(`[${context}]`, message, data || '');
  }
}

/**
 * Log debug info
 * Only shown in development
 */
export function logDebug(context: ErrorContext, message: string, data?: unknown): void {
  if (isDevelopment) {
    console.debug(`[${context}]`, message, data || '');
  }
}

/**
 * Get a user-friendly error message from an error
 * Extracts message safely without exposing internal details
 */
export function getUserFriendlyMessage(error: unknown, fallbackMessage = 'An unexpected error occurred'): string {
  if (error instanceof Error) {
    // In production, return generic messages for most errors
    if (!isDevelopment) {
      // Allow through specific user-friendly messages
      const safeMessages = [
        'Please fill in all required fields',
        'Invalid email address',
        'Invalid phone number',
        'You cannot create super admin users',
        'Commission rate is required for leasing agents',
      ];
      
      if (safeMessages.some(msg => error.message.includes(msg))) {
        return error.message;
      }
      
      return fallbackMessage;
    }
    
    return error.message;
  }
  
  if (typeof error === 'string') {
    return isDevelopment ? error : fallbackMessage;
  }
  
  return fallbackMessage;
}
