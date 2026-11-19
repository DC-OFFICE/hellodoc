export type SmsSendRequest = {
  toE164: string;
  senderId: string;
  message: string;
  /** Optional provider-side idempotency key when supported. */
  clientReference?: string;
};

export type SmsSendResult =
  | {
      outcome: 'ACCEPTED' | 'DELIVERED';
      providerMessageId: string | null;
      estimatedCost: number | null;
      rawStatus: string | null;
    }
  | {
      outcome: 'TEMPORARY_FAILURE' | 'PERMANENT_FAILURE' | 'UNCERTAIN';
      providerMessageId: string | null;
      errorCategory: string;
      errorMessage: string;
    };

export interface SmsProvider {
  readonly name: string;
  sendMessage(request: SmsSendRequest): Promise<SmsSendResult>;
}
