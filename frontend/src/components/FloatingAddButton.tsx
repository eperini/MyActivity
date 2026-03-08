"use client";

import { Plus } from "lucide-react";

interface FloatingAddButtonProps {
  onClick: () => void;
}

export default function FloatingAddButton({ onClick }: FloatingAddButtonProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-[calc(3.75rem+env(safe-area-inset-bottom)+0.75rem)] right-4 z-30 w-14 h-14 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded-full shadow-lg shadow-blue-600/30 flex items-center justify-center text-white transition-colors md:hidden"
    >
      <Plus size={28} />
    </button>
  );
}
