/** Light haptic feedback for task completion */
export function hapticSuccess() {
  if ("vibrate" in navigator) navigator.vibrate(50);
}

/** Medium haptic for critical lab values */
export function hapticWarning() {
  if ("vibrate" in navigator) navigator.vibrate([50, 30, 50]);
}

/** Strong haptic for timer expiry */
export function hapticAlert() {
  if ("vibrate" in navigator) navigator.vibrate([200, 100, 200, 100, 200]);
}
