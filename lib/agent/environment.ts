export interface AgentEnvironmentInfo {
  operatingSystem: string
  browser: string
  timezone: string
  language: string
  today: string
}

function detectOperatingSystem(userAgent: string) {
  if (/windows/i.test(userAgent)) return 'Windows'
  if (/mac os|macintosh/i.test(userAgent)) return 'macOS'
  if (/android/i.test(userAgent)) return 'Android'
  if (/iphone|ipad|ios/i.test(userAgent)) return 'iOS'
  if (/linux/i.test(userAgent)) return 'Linux'
  return 'Unknown'
}

function detectBrowser(userAgent: string) {
  if (/edg\//i.test(userAgent)) return 'Microsoft Edge'
  if (/chrome|crios/i.test(userAgent) && !/edg\//i.test(userAgent)) return 'Chrome'
  if (/firefox|fxios/i.test(userAgent)) return 'Firefox'
  if (/safari/i.test(userAgent) && !/chrome|crios/i.test(userAgent)) return 'Safari'
  return 'Unknown'
}

export function getAgentEnvironmentInfo(): AgentEnvironmentInfo {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const language = typeof navigator !== 'undefined' ? navigator.language : 'unknown'
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'

  return {
    operatingSystem: detectOperatingSystem(userAgent),
    browser: detectBrowser(userAgent),
    timezone,
    language,
    today: new Date().toLocaleDateString('en-CA', { timeZone: timezone }),
  }
}
