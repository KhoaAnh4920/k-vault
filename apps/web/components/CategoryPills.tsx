import { Button } from "@/components/ui/button";

export const CATEGORY_LABELS: Record<string, string> = {
  entertainment: "Entertainment",
  education: "Education",
  music: "Music",
  gaming: "Gaming",
  sports: "Sports",
  tech: "Tech",
  other: "Other",
};

interface CategoryPillsProps {
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}

export function CategoryPills({ activeCategory, onCategoryChange }: CategoryPillsProps) {
  return (
    <div className="flex flex-row gap-2.5 overflow-x-auto whitespace-nowrap mb-6 md:mb-10 pb-2 scrollbar-hide w-full max-w-full" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      <Button
        variant={activeCategory === "" ? "default" : "secondary"}
        onClick={() => onCategoryChange("")}
        className="rounded-full px-5 font-semibold text-[13px] shadow-sm hover:shadow-md transition-all duration-300 h-9 flex-shrink-0"
      >
        All
      </Button>
      {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
        <Button
          key={key}
          variant={activeCategory === key ? "default" : "secondary"}
          onClick={() => onCategoryChange(key)}
          className="rounded-full px-5 font-semibold text-[13px] shadow-sm hover:shadow-md transition-all duration-300 h-9 flex-shrink-0"
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
