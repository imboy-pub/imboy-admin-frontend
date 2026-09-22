const configuredOrigin = typeof import.meta.env.VITE_CS_WIDGET_ORIGIN === 'string'
  ? import.meta.env.VITE_CS_WIDGET_ORIGIN.trim().replace(/\/+$/, '')
  : ''

export const CUSTOMER_SERVICE_WIDGET_ORIGIN = configuredOrigin || 'https://cs.imboy.pub'
