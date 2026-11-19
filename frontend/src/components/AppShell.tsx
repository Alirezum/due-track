import { Moon, Sun } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useTheme } from '@/components/ThemeProvider'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/', label: 'Deadlines', end: true },
  { to: '/history', label: 'History', end: false },
] as const

export function AppShell() {
  const { theme, toggleTheme } = useTheme()
  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-5 sm:gap-5 sm:px-8">
          <NavLink
            to="/"
            end
            aria-label="due-track dashboard"
            className="shrink-0 rounded-sm font-display text-[1.35rem] font-semibold tracking-[-0.035em] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            due-track
          </NavLink>

          <span className="hidden h-5 w-px bg-border sm:block" aria-hidden="true" />

          <nav aria-label="Primary" className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'relative rounded-sm px-2.5 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:px-3',
                    'after:absolute after:inset-x-2.5 after:-bottom-2 after:h-0.5 sm:after:inset-x-3',
                    isActive
                      ? 'text-foreground after:bg-primary'
                      : 'text-muted-foreground after:bg-transparent hover:text-foreground',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground md:inline">Local data only</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={`Switch to ${nextTheme} theme`}
              title={`Switch to ${nextTheme} theme`}
            >
              {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <Outlet />
      </main>
    </div>
  )
}
