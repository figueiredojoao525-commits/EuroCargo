import type { ReactNode } from 'react'
import type { Language } from '../i18n'

// Simplified inline flags (emoji flags do not render on Windows). 3:2 canvas.
const FLAGS: Record<Language, ReactNode> = {
  pt: (
    <>
      <rect width="30" height="20" fill="#da291c" />
      <rect width="12" height="20" fill="#046a38" />
      <circle cx="12" cy="10" r="3.6" fill="none" stroke="#ffe000" strokeWidth="1.3" />
      <path d="M10.4 8h3.2v2.6a1.6 1.6 0 01-3.2 0z" fill="#fff" stroke="#da291c" strokeWidth="0.6" />
    </>
  ),
  es: (
    <>
      <rect width="30" height="20" fill="#aa151b" />
      <rect y="5" width="30" height="10" fill="#f1bf00" />
    </>
  ),
  en: (
    <g transform="scale(0.5 0.6667)">
      <rect width="60" height="30" fill="#012169" />
      <path d="M0 0l60 30M60 0L0 30" stroke="#fff" strokeWidth="6" />
      <path d="M0 0l60 30M60 0L0 30" stroke="#c8102e" strokeWidth="2.4" />
      <path d="M30 0v30M0 15h60" stroke="#fff" strokeWidth="10" />
      <path d="M30 0v30M0 15h60" stroke="#c8102e" strokeWidth="6" />
    </g>
  ),
  fr: (
    <>
      <rect width="30" height="20" fill="#ef4135" />
      <rect width="20" height="20" fill="#fff" />
      <rect width="10" height="20" fill="#0055a4" />
    </>
  ),
  de: (
    <>
      <rect width="30" height="20" fill="#ffce00" />
      <rect width="30" height="13.34" fill="#dd0000" />
      <rect width="30" height="6.67" fill="#000" />
    </>
  ),
  it: (
    <>
      <rect width="30" height="20" fill="#ce2b37" />
      <rect width="20" height="20" fill="#fff" />
      <rect width="10" height="20" fill="#009246" />
    </>
  ),
}

export function Flag({ code }: { code: Language }) {
  return (
    <svg className="flag" width="21" height="14" viewBox="0 0 30 20" aria-hidden="true" focusable="false">
      {FLAGS[code]}
    </svg>
  )
}
