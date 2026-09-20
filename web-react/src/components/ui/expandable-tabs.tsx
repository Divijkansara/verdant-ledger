"use client";

import * as React from "react";
import { AnimatePresence, motion, type Transition } from "framer-motion";
import { useOnClickOutside } from "usehooks-ts";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface Tab {
  title: string;
  icon: LucideIcon;
  type?: never;
}

interface Separator {
  type: "separator";
  title?: never;
  icon?: never;
}

export type TabItem = Tab | Separator;

interface ExpandableTabsProps {
  tabs: TabItem[];
  className?: string;
  activeColor?: string;
  onChange?: (index: number | null) => void;
}

/* The original snippet drove these with `variants` + `custom`. That does
   not animate under Motion 13: a parent with `variants` propagates its
   animate label to child motion components, which overrode the span's own
   initial/animate and pinned it at width 0 — and changing `custom` alone
   did not re-resolve the button's variant. Plain animate objects re-resolve
   on every render, so both behave correctly and the public API is unchanged. */
const buttonState = (isSelected: boolean) => ({
  gap: isSelected ? ".5rem" : 0,
  paddingLeft: isSelected ? "1rem" : ".5rem",
  paddingRight: isSelected ? "1rem" : ".5rem",
});

const transition: Transition = {
  delay: 0.1,
  type: "spring",
  bounce: 0,
  duration: 0.6,
};

export function ExpandableTabs({
  tabs,
  className,
  activeColor = "text-primary",
  onChange,
}: ExpandableTabsProps) {
  const [selected, setSelected] = React.useState<number | null>(null);
  const outsideClickRef = React.useRef<HTMLDivElement>(null);

  // React 19 types useRef<T>(null) as RefObject<T | null>, while usehooks-ts
  // v3.1.1 still expects RefObject<T>. Its implementation guards on
  // `ref.current` before calling `.contains()`, so narrowing here is safe.
  useOnClickOutside(outsideClickRef as React.RefObject<HTMLDivElement>, () => {
    setSelected(null);
    onChange?.(null);
  });

  const handleSelect = (index: number) => {
    setSelected(index);
    onChange?.(index);
  };

  const Separator = () => (
    <div className="mx-1 h-[24px] w-[1.2px] bg-border" aria-hidden="true" />
  );

  return (
    <div
      ref={outsideClickRef}
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-2xl border bg-background p-1 shadow-sm",
        className
      )}
    >
      {tabs.map((tab, index) => {
        if (tab.type === "separator") {
          return <Separator key={`separator-${index}`} />;
        }

        const Icon = tab.icon;
        return (
          <motion.button
            key={tab.title}
            initial={false}
            animate={buttonState(selected === index)}
            onClick={() => handleSelect(index)}
            transition={transition}
            className={cn(
              "relative flex items-center rounded-xl px-4 py-2 text-sm font-medium transition-colors duration-300",
              selected === index
                ? cn("bg-muted", activeColor)
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon size={20} />
            <AnimatePresence>
              {selected === index && (
                <motion.span
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: "auto", opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={transition}
                  className="overflow-hidden"
                >
                  {tab.title}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </div>
  );
}
