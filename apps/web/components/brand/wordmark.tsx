import { cn } from "@/lib/utils";

/**
 * Temporary text wordmark until Inkomoko provides official logo files.
 * "Inkomoko" in navy with a coral accent dot, followed by "Assistant".
 */
export function Wordmark({
  className,
  showProduct = true,
  product = "Assistant",
}: {
  className?: string;
  showProduct?: boolean;
  product?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1.5 text-lg leading-none font-extrabold tracking-tight text-secondary select-none",
        className
      )}
    >
      <span className="inline-flex items-baseline">
        Inkomoko
        <span aria-hidden className="ml-0.5 inline-block size-1.5 rounded-full bg-primary" />
      </span>
      {showProduct && (
        <span className="font-semibold text-muted-foreground">{product}</span>
      )}
    </span>
  );
}
