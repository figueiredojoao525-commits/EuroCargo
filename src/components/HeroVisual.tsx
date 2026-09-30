import type { CSSProperties } from 'react'
import { Icon, type IconName } from './Icon'

// Rough equirectangular projection of real cities onto a 560x440 canvas.
const CITIES = [
  { x: 34, y: 405, label: 'PT' }, // Lisboa
  { x: 43, y: 349 }, // Porto
  { x: 131, y: 365, label: 'ES' }, // Madrid
  { x: 238, y: 342 }, // Barcelona
  { x: 284, y: 239 }, // Lyon
  { x: 240, y: 167, label: 'FR' }, // Paris
  { x: 276, y: 121 }, // Bruxelas
  { x: 364, y: 246, label: 'IT' }, // Milão
  { x: 407, y: 185 }, // Munique
  { x: 439, y: 82, label: 'DE' }, // Berlim
]

const ROUTES = [
  { id: 'ec-route-1', d: 'M34 405 Q80 360 131 365 Q185 362 238 342 Q300 292 364 246', dur: '7s' },
  { id: 'ec-route-2', d: 'M43 349 Q130 250 240 167 Q255 140 276 121 Q360 88 439 82', dur: '9s' },
  { id: 'ec-route-3', d: 'M238 342 Q262 290 284 239 Q330 202 407 185', dur: '6s' },
]

const CARD_ICONS: IconName[] = ['shield', 'pin', 'headset', 'globe']

const FLOATING_BOXES = [
  { top: '2%', left: '46%', size: 20, delay: 0 },
  { top: '58%', left: '52%', size: 16, delay: 1.6 },
  { top: '24%', left: '78%', size: 22, delay: 3.1 },
  { top: '80%', left: '84%', size: 14, delay: 2.2 },
]

export function HeroVisual({ cards, label }: { cards: string[]; label: string }) {
  return (
    <div className="hero-visual">
      <div className="hero-stage">
        <svg className="hero-map" viewBox="0 0 560 440" aria-hidden="true" focusable="false">
          <defs>
            <pattern id="ec-dots" width="14" height="14" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.2" fill="rgba(255,255,255,0.16)" />
            </pattern>
            <radialGradient id="ec-fade" cx="50%" cy="55%" r="60%">
              <stop offset="0%" stopColor="#fff" />
              <stop offset="100%" stopColor="#000" />
            </radialGradient>
            <mask id="ec-mask">
              <rect width="560" height="440" fill="url(#ec-fade)" />
            </mask>
          </defs>

          <rect width="560" height="440" fill="url(#ec-dots)" mask="url(#ec-mask)" />

          {ROUTES.map((route) => (
            <g key={route.id}>
              <path id={route.id} d={route.d} className="route-base" />
              <path d={route.d} className="route-flow" />
            </g>
          ))}

          {ROUTES.map((route, index) => (
            <g key={`runner-${route.id}`} className="route-runner">
              <circle r="9" className="route-runner-glow" />
              <circle r="3.5" className="route-runner-dot" />
              <animateMotion dur={route.dur} begin={`${index * 1.2}s`} repeatCount="indefinite">
                <mpath href={`#${route.id}`} />
              </animateMotion>
            </g>
          ))}

          {CITIES.map((city, index) => (
            <g key={index} className="city">
              <circle
                cx={city.x}
                cy={city.y}
                r="4"
                className="city-pulse"
                style={{ animationDelay: `${index * 0.35}s` }}
              />
              <circle cx={city.x} cy={city.y} r="4" className="city-dot" />
              {city.label && (
                <text x={city.x + 10} y={city.y - 8} className="city-label">
                  {city.label}
                </text>
              )}
            </g>
          ))}
        </svg>

        {FLOATING_BOXES.map((box, index) => (
          <span
            key={index}
            className="float-box"
            aria-hidden="true"
            style={{ top: box.top, left: box.left, animationDelay: `${box.delay}s` } as CSSProperties}
          >
            <Icon name="box" size={box.size} />
          </span>
        ))}

        <div className="hero-truck" aria-hidden="true">
          <span className="hero-truck-road" />
          <span className="hero-truck-body">
            <span className="hero-truck-speed" />
            <Icon name="truck" size={26} />
          </span>
        </div>
      </div>

      <ul className="hero-cards" aria-label={label}>
        {cards.map((text, index) => (
          <li key={index} className={`hero-card hero-card-${index + 1}`} style={{ '--i': index } as CSSProperties}>
            <div className="hero-card-inner">
              <span className="hero-card-icon">
                <Icon name={CARD_ICONS[index] ?? 'globe'} size={20} />
              </span>
              <span className="hero-card-text">{text}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
