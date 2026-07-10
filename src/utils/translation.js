import { translations } from '../translations'

export const getTranslation = (lang, key) => {
  const activeLang = lang || 'en'
  return translations[activeLang]?.[key] || translations.en[key] || key
}
