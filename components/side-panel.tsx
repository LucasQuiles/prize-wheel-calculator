'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/', label: 'Calculator' },
  { href: '/auction', label: 'Auction Data' },
]

export default function SidePanel() {
  const pathname = usePathname()
  return (
    <aside className="min-h-screen w-56 border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="bg-sidebar-primary p-4 text-lg font-bold text-sidebar-primary-foreground">
        Prize Wheel
      </div>
      <nav className="space-y-1 p-2">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'block rounded-md px-3 py-2 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              pathname === item.href &&
                'bg-sidebar-accent text-sidebar-accent-foreground',
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
