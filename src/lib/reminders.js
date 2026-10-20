// Weekly training reminders as local notifications (ids 501–507, one per weekday).
import { LocalNotifications } from '@capacitor/local-notifications'
import { isNative, ensureNotifyPermission } from './native.js'

const BASE_ID = 500
// Capacitor weekday: 1 = Sunday … 7 = Saturday. Ours: 1 = Monday … 7 = Sunday.
const toCapWeekday = (d) => (d % 7) + 1

export async function scheduleReminders ({ days = [], time = '18:00' }, body = 'Time to train') {
  if (!isNative) return 'unsupported'
  try {
    await LocalNotifications.cancel({ notifications: [1, 2, 3, 4, 5, 6, 7].map(d => ({ id: BASE_ID + d })) })
    if (!days.length) return 'cleared'
    if (!(await ensureNotifyPermission())) return 'denied'
    const [hour, minute] = time.split(':').map(Number)
    await LocalNotifications.schedule({
      notifications: days.map(d => ({
        id: BASE_ID + d,
        title: 'Gym Crew',
        body,
        schedule: { on: { weekday: toCapWeekday(d), hour, minute }, allowWhileIdle: true }
      }))
    })
    return 'scheduled'
  } catch (e) {
    console.warn('Reminder scheduling failed', e)
    return 'error'
  }
}
