let permissionRequested = false

export async function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return 'denied'
  if (permissionRequested) return Notification.permission
  permissionRequested = true
  if (Notification.permission === 'default') {
    try {
      return await Notification.requestPermission()
    } catch (error) {
      console.warn('Notification permission request failed', error)
      return 'denied'
    }
  }
  return Notification.permission
}

export function sendNotification(title: string, options?: NotificationOptions) {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  try {
    return new Notification(title, options)
  } catch (error) {
    console.warn('Notification error', error)
  }
}

export function vibrate(pattern: number | number[] = [200, 100, 200]) {
  if (navigator.vibrate) {
    navigator.vibrate(pattern)
  }
}

export function playTone(duration = 0.2, frequency = 880) {
  try {
    const context = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    oscillator.connect(gain)
    gain.connect(context.destination)
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + 0.01)
    oscillator.start()
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration)
    oscillator.stop(context.currentTime + duration + 0.05)
  } catch (error) {
    console.warn('AudioContext failed', error)
  }
}
