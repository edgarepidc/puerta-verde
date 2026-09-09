/** HTML attrs that open a numeric keypad on iPhone, iPad, and Android. */
export const DECIMAL_FIELD_PROPS = {
  type: 'text',
  inputMode: 'decimal',
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'none',
  spellCheck: false,
  enterKeyHint: 'done',
} as const;

/** Integer-only: `pattern="[0-9]*"` is what iPad uses to show the number pad. */
export const INTEGER_FIELD_PROPS = {
  type: 'text',
  inputMode: 'numeric',
  pattern: '[0-9]*',
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'none',
  spellCheck: false,
  enterKeyHint: 'done',
} as const;
