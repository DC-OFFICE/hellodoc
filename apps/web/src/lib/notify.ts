import { toast } from 'sonner';
import { ApiError } from '@/lib/api';

function firstMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof ApiError) return error.message || fallback;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

export const notify = {
  error(error: unknown, fallback?: string) {
    const message = firstMessage(error, fallback ?? 'Request failed');
    toast.error(message, {
      duration: 6000,
    });
    return message;
  },

  validation(message: string, description?: string) {
    toast.error(message, {
      description,
      duration: 6000,
    });
  },

  success(message: string, description?: string) {
    toast.success(message, {
      description,
      duration: 4000,
    });
  },

  info(message: string, description?: string) {
    toast.message(message, {
      description,
      duration: 4000,
    });
  },

  /** Flatten react-hook-form / zod field errors into one toast. */
  formErrors(errors: Record<string, unknown>, title = 'Please fix the highlighted fields') {
    const messages: string[] = [];
    const walk = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      if ('message' in value && typeof (value as { message?: unknown }).message === 'string') {
        const message = (value as { message: string }).message.trim();
        if (message) messages.push(message);
        return;
      }
      for (const nested of Object.values(value as Record<string, unknown>)) walk(nested);
    };
    walk(errors);
    if (messages.length === 0) {
      notify.validation(title);
      return;
    }
    notify.validation(title, [...new Set(messages)].slice(0, 4).join(' · '));
  },
};
