import { Link } from 'react-router-dom'

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className={`logo${light ? ' logo-light' : ''}`} aria-label="EuroCargo">
      <img src="/favicon.svg" alt="" width={32} height={32} />
      <span>
        Euro<strong>Cargo</strong>
      </span>
    </Link>
  )
}
