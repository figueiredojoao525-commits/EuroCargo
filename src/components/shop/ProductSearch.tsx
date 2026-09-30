import { useState, type FormEvent } from 'react'
import { useI18n } from '../../i18n/context'
import { Icon } from '../Icon'

interface Props {
  initialQuery?: string
  onSearch: (query: string) => void
  /** Large variant for the homepage hero. */
  size?: 'md' | 'lg'
  autoFocus?: boolean
}

/** Free-text search: part name, reference, OE number, brand or vehicle. */
export function ProductSearch({ initialQuery = '', onSearch, size = 'md', autoFocus = false }: Props) {
  const { t } = useI18n()
  const [query, setQuery] = useState(initialQuery)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSearch(query.trim())
  }

  return (
    <form className={`product-search product-search-${size}`} role="search" onSubmit={handleSubmit}>
      <label htmlFor={`product-search-${size}`} className="sr-only">
        {t.shop.searchLabel}
      </label>
      <span className="product-search-icon" aria-hidden="true">
        <Icon name="search" size={20} />
      </span>
      <input
        id={`product-search-${size}`}
        type="search"
        value={query}
        maxLength={200}
        placeholder={t.shop.searchPlaceholder}
        autoComplete="off"
        autoFocus={autoFocus}
        onChange={(e) => setQuery(e.target.value)}
      />
      <button type="submit" className="btn btn-accent">
        {t.shop.searchButton}
      </button>
    </form>
  )
}
