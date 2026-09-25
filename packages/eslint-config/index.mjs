// The house style for every workspace, in one pass with lint: Nuxt's flat config (TypeScript, Vue) with its stylistic
// rules set to no semicolons, single quotes, two spaces and dense lines. Each workspace appends its own ignores.
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

export default function houseStyle() {
  return createConfigForNuxt({
    features: {
      stylistic: { semi: false, quotes: 'single', indent: 2, commaDangle: 'always-multiline', braceStyle: '1tbs', arrowParens: true },
    },
  })
    .append({ ignores: ['**/*.md'] })
    .append({
      rules: {
        // several attributes and short elements on one line, several statements on one line when short
        'vue/max-attributes-per-line': 'off',
        'vue/singleline-html-element-content-newline': 'off',
        'vue/multiline-html-element-content-newline': 'off',
        '@stylistic/max-statements-per-line': 'off',
        // one-line type literals separate members with semicolons, multi-line ones with nothing
        '@stylistic/member-delimiter-style': ['error', { multiline: { delimiter: 'none' }, singleline: { delimiter: 'semi', requireLast: false } }],
        // `catch {}`: storage and clipboard calls that may fail and need nothing done
        'no-empty': ['error', { allowEmptyCatch: true }],
      },
    })
}
