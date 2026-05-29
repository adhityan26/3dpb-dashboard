"use client"

import { ReactNode } from "react"
import { Menu } from "lucide-react"

interface SidebarDrawerShellProps {
  open: boolean
  onOpen: () => void
  onClose: () => void
  children: ReactNode
}

export function SidebarDrawerShell({ open, onOpen, onClose, children }: SidebarDrawerShellProps) {
  return (
    <>
      {/* Toggle button — mobile only, hidden when drawer is open */}
      {!open && (
        <button
          onClick={onOpen}
          className="fixed top-3 left-3 z-40 md:hidden w-8 h-8 flex items-center justify-center rounded-lg transition-opacity hover:opacity-80"
          style={{
            background: "rgba(99,102,241,0.2)",
            color: "#a5b4fc",
            border: "1px solid rgba(99,102,241,0.3)",
          }}
          aria-label="Buka menu"
        >
          <Menu className="w-4 h-4" />
        </button>
      )}

      {/* Backdrop — mobile only, visible when open */}
      {open && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={onClose}
        />
      )}

      {/* Sidebar container:
          - Mobile closed: fixed off-screen to the left (-translate-x-full), out of flex flow
          - Mobile open:   fixed, slides in (translate-x-0), overlays content
          - Desktop:       static, in-flow (translate-x-0 always)
      */}
      <div
        className={[
          "fixed inset-y-0 left-0 z-50",
          "md:static md:inset-auto",
          "transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        ].join(" ")}
      >
        {children}
      </div>
    </>
  )
}
