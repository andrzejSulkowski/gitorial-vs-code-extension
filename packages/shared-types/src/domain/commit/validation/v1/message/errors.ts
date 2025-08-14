export const MessageErrors = {
  ColonNotFound: 'ColonNotFound',
  EmptyTitle: 'EmptyTitle',
  InvalidCommitType: 'InvalidCommitType',
} as const;

export type MessageErrorCode = typeof MessageErrors[keyof typeof MessageErrors];


