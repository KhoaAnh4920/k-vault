"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Command,
} from "@/components/ui/command";
import { Loader2, Play } from "lucide-react";
import { videoApi, type Video } from "@/lib/api";

export function GlobalSearch({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounce the query
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(handler);
  }, [query]);

  // Fetch results based on debounced query
  useEffect(() => {
    const fetchResults = async () => {
      if (!debouncedQuery.trim()) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const res = await videoApi.list({
          search: debouncedQuery,
          limit: 10,
        });
        setResults(res.data);
      } catch (err) {
        console.error("Search failed", err);
      } finally {
        setLoading(false);
      }
    };
    fetchResults();
  }, [debouncedQuery]);

  // Handle Cmd+K / Ctrl+K keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [setOpen]);

  const handleSelect = (videoId: string) => {
    setOpen(false);
    router.push(`/watch/${videoId}`);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <Command shouldFilter={false}>
        <CommandInput 
          placeholder="Search videos..." 
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>
            {loading ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
                <span className="text-sm text-muted-foreground">Searching...</span>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">No results found.</span>
            )}
          </CommandEmpty>
          {results.length > 0 && (
            <CommandGroup heading="Videos">
              {results.map((video) => (
                <CommandItem
                  key={video.id}
                  value={video.title + " " + video.id}
                  onSelect={() => handleSelect(video.id)}
                  className="flex items-center gap-3 py-3 cursor-pointer mb-2 last:mb-0 rounded-lg"
                >
                  <div className="relative h-10 w-[71px] shrink-0 bg-background rounded-md overflow-hidden border border-border/50">
                    <img 
                      src={videoApi.getThumbnailUrl(video.id)} 
                      alt="" 
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                  <div className="flex flex-col overflow-hidden min-w-0">
                    <span className="font-semibold text-sm leading-tight truncate">{video.title}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                      {video.category || "Uncategorized"}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
