import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'dev-dist/**/*', 'android/**/*', 'node_modules/**/*', 'src/**/*', '*.ts', '*.tsx', '*.js'],
  },
  {
    files: ['*.rules'],
    ...firebaseRulesPlugin.configs['flat/recommended'],
  },
];
