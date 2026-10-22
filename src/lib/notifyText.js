// Why the rest notifications can't show, in words.
import { t } from '../i18n/index.js'

export function notifyText (st) {
  if (!st) return ''
  if (st.permission !== 'granted' || st.enabled === false) {
    return t("Notifications are off for Gym Crew, so the rest countdown and the get-ready alert can't show.")
  }
  if (st.countdown === 0 && st.ready === 0) return t('Both rest notifications are switched off in Android\'s settings for Gym Crew.')
  if (st.countdown === 0) return t("The rest countdown notification is switched off in Android's settings for Gym Crew.")
  if (st.ready === 0) return t("The get-ready alert is switched off in Android's settings for Gym Crew.")
  return ''
}
