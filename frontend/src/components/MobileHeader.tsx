"use client";

import { Menu } from "lucide-react";

interface MobileHeaderProps {
  title: string;
  onOpenSidebar: () => void;
  rightAction?: React.ReactNode;
}

export default function MobileHeader({ title, onOpenSidebar, rightAction }: MobileHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 h-12 border-b border-zinc-800 bg-zinc-950 md:hidden flex-shrink-0">
      <button
        onClick={onOpenSidebar}
        className="p-2 -ml-2 text-zinc-400 hover:text-white transition-colors"
      >
        <Menu size={22} />
      </button>
      <h1 className="text-base font-semibold text-white truncate mx-3">{title}</h1>
      <div className="w-10 flex items-center justify-end">
        {rightAction || null}
      </div>
    </div>
  );
}
