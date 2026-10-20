import assert from 'node:assert/strict';
import test from 'node:test';
import i18n, { supportedLanguages } from '../src/lib/i18n';

test('provides translated interface text for the supported common languages', async () => {
  assert.deepEqual(
    supportedLanguages.map(language => language.code),
    ['en', 'es', 'fr', 'de', 'pt', 'hi', 'zh', 'ja', 'ar']
  );

  try {
    for (const language of supportedLanguages) {
      await i18n.changeLanguage(language.code);
      if (language.code === 'en') {
        assert.equal(i18n.t('Home'), 'Home');
        assert.equal(i18n.t('Choose language'), 'Choose language');
      } else {
        assert.notEqual(i18n.t('Home'), 'Home', `${language.code} should translate navigation`);
        assert.notEqual(i18n.t('Choose language'), 'Choose language', `${language.code} should translate language settings`);
      }
    }

    await i18n.changeLanguage('es');
    assert.equal(i18n.t('Based on {{amount}} monthly income', { amount: '$5,000' }), 'Según ingresos mensuales de $5,000');
    assert.equal(i18n.t('{{count}} connected', { count: 3 }), '3 conectadas');
  } finally {
    await i18n.changeLanguage('en');
  }
});
