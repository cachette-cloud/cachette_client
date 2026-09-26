'use client';

import { RiArrowRightSLine, RiHome4Line } from 'react-icons/ri';

export interface BreadcrumbItem {
  id: string | null;
  name: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  onNavigate: (folderId: string | null) => void;
}

export default function Breadcrumb({ items, onNavigate }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1 text-[12px] sm:text-[13px] min-w-0 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden py-0.5">
      <button
        onClick={() => onNavigate(null)}
        className="flex items-center gap-1 text-white/40 hover:text-white/70 transition-colors shrink-0 px-1.5 py-1 rounded-md hover:bg-white/[0.04]"
      >
        <RiHome4Line className="w-3.5 h-3.5" />
        <span className="hidden xs:inline">My Files</span>
      </button>

      {items.map((item, idx) => (
        <div key={item.id || idx} className="flex items-center gap-1 shrink-0 max-w-[120px] sm:max-w-[200px]">
          <RiArrowRightSLine className="w-3.5 h-3.5 text-white/20 shrink-0" />
          <button
            onClick={() => onNavigate(item.id)}
            title={item.name}
            className={`truncate px-1.5 py-1 rounded-md transition-colors ${
              idx === items.length - 1
                ? 'text-white/80 font-medium'
                : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
            }`}
          >
            {item.name}
          </button>
        </div>
      ))}
    </nav>
  );
}
