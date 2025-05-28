// Defines the branded TutorialId type for type safety, ensuring tutorial identifiers
// are not just generic strings.

export type TutorialId = string & { readonly __brand: 'TutorialId' };

export function asTutorialId(id: string): TutorialId {
  return id as TutorialId;
} 