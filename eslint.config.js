const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expo,
  { ignores: ['dist/*'] },
  {
    // Starter-template hydration pattern; flagged by the newer react-hooks rule.
    files: ['src/hooks/use-color-scheme.web.ts'],
    rules: { 'react-hooks/set-state-in-effect': 'off' },
  },
]);
