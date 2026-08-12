import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

type BrandSize = "sm" | "md" | "lg";

interface BrandProps {
  href?: string;
  className?: string;
  logoClassName?: string;
  textClassName?: string;
  accentClassName?: string;
  size?: BrandSize;
  showText?: boolean;
  priority?: boolean;
}

const sizeClasses: Record<
  BrandSize,
  { gap: string; box: string; image: string; text: string }
> = {
  sm: {
    gap: "gap-2",
    box: "h-9 w-9 rounded-xl",
    image: "h-8 w-8",
    text: "text-lg sm:text-xl",
  },
  md: {
    gap: "gap-2",
    box: "h-9 w-9 rounded-xl sm:h-10 sm:w-10",
    image: "h-8 w-8 sm:h-9 sm:w-9",
    text: "text-xl",
  },
  lg: {
    gap: "gap-3",
    box: "h-12 w-12 rounded-xl",
    image: "h-10 w-10",
    text: "text-2xl",
  },
};

export function Brand({
  href,
  className,
  logoClassName,
  textClassName,
  accentClassName,
  size = "md",
  showText = true,
  priority = false,
}: BrandProps) {
  const classes = sizeClasses[size];

  const content = (
    <>
      <div
        className={cn(
          "flex shrink-0 items-center justify-center bg-orange-500 text-white shadow-md shadow-orange-500/20",
          classes.box,
          logoClassName,
        )}
      >
        <Image
          src="/mak_logo.png"
          alt="МАК лого"
          width={40}
          height={40}
          priority={priority}
          className={cn("object-contain", classes.image)}
        />
      </div>
      {showText && (
        <span
          className={cn(
            "whitespace-nowrap font-semibold tracking-tight text-foreground",
            classes.text,
            textClassName,
          )}
        >
          МАК<span className={cn("text-primary", accentClassName)}>Тендер</span>
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn("flex items-center", classes.gap, className)}
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={cn("flex items-center", classes.gap, className)}>
      {content}
    </div>
  );
}
