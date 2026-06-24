'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Loader2, Search } from 'lucide-react'

export interface SearchableSelectOption {
  value: string
  label: string
}

interface SearchableSelectProps {
  id?: string
  options: SearchableSelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  loading?: boolean
  disabled?: boolean
  className?: string
  'aria-label'?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

export function SearchableSelect({
  id,
  options,
  value,
  onChange,
  placeholder = 'Select an option…',
  loading = false,
  disabled = false,
  className = '',
  ...ariaProps
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  const selectedLabel = options.find((o) => o.value === value)?.label

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  function handleSelect(val: string) {
    onChange(val)
    setOpen(false)
    setQuery('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`} onKeyDown={handleKeyDown}>
      <button
        id={id}
        type="button"
        disabled={disabled || loading}
        onClick={() => setOpen(!open)}
        className={[
          'flex w-full h-11 items-center justify-between rounded-md border bg-background px-3 py-2 text-base',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
          !value ? 'text-muted-foreground' : '',
        ].join(' ')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaProps['aria-label']}
        aria-invalid={ariaProps['aria-invalid']}
        aria-describedby={ariaProps['aria-describedby']}
      >
        <span className="truncate">
          {loading ? 'Loading regions…' : selectedLabel || placeholder}
        </span>
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-lg">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search regions…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Search regions"
            />
          </div>
          <ul role="listbox" className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">No regions found.</li>
            )}
            {filtered.map((option) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                onClick={() => handleSelect(option.value)}
                className={[
                  'cursor-pointer px-3 py-2 text-sm hover:bg-muted/50',
                  option.value === value ? 'bg-muted font-medium' : '',
                ].join(' ')}
              >
                {option.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
